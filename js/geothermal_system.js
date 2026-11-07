/* ═══════════════════════════════════════════════════════════════════
   GEOTHERMAL SYSTEM
   The first discoverable resource chain:
     Geothermal Survey → Geothermal Deposit
     Geothermal Well   → extracts geothermal steam (one well per deposit)
     Geothermal Turbine→ steam → electricity (one turbine per well)

   Unlike the coal/oil/uranium chains there is no hauling stage: the well
   hands its steam straight to the single turbine plugged into its output
   port. That keeps the whole chain buildable before Conveyors and Pipes
   exist, which is the point of slotting it in between Wind and Coal.

   Deposits do NOT deplete — geothermal heat is the renewable end of the
   tech tree, and an early-game player has no way to relocate a well.
   ═══════════════════════════════════════════════════════════════════ */

const GeothermalSystem = (() => {
  let geoScans          = 0;    // successful geothermal surveys
  let totalSteam        = 0;    // cumulative steam units raised, for stats
  const COAL_SCAN_TURBINES = 3;  // simultaneous running turbines the Coal Scan needs
  let threeTurbinesEverRan = false; // sticky — gates the Coal Scan unlock

  // ── World geothermal activity ───────────────────────────────────────
  // How hot this particular world is underneath. Rolled once when the page
  // loads (a New Game is a reload) and then fixed for the life of the save,
  // so every deposit, well and turbine on the map shares the same figure —
  // it is a property of the world, not of an individual deposit.
  //
  // It scales the whole chain linearly: a well raises ACTIVITY_MIN..MAX
  // steam units/s and its turbine converts them 1:1 into watts, exactly the
  // way the old fixed 35/35 pair did. Because the well's output and the
  // turbine's draw move together, the "steam must be fully met" gate in
  // tickTurbine behaves the same at every activity level — a cold world
  // still runs, it just earns less per turbine.
  const ACTIVITY_MIN_W = 35;   // W per turbine on the coldest world
  const ACTIVITY_MAX_W = 55;   // W per turbine on the hottest
  let geoActivity = Math.random();   // 0..1 — normalised world heat

  // The world's own rating, before weather. This is the number the deposit
  // panel quotes as the field's potential.
  function baseOutput() {
    return Math.round(ACTIVITY_MIN_W + geoActivity * (ACTIVITY_MAX_W - ACTIVITY_MIN_W));
  }

  // ── Weather coupling ────────────────────────────────────────────────
  // Warm ground means a hotter, higher-pressure reservoir; a cold snap
  // pulls heat out of the near-surface rock and the wellhead loses
  // pressure with it. Scales off the shared ambient temperature (diurnal
  // curve + active weather event), 1% per °C away from the 18°C neutral
  // point, clamped so weather can shade a field's yield without ever
  // deciding the outcome on its own.
  const WEATHER_PER_DEG = 0.01;
  const WEATHER_MIN     = 0.85;
  const WEATHER_MAX     = 1.20;

  function weatherMult() {
    if (typeof WeatherEventSystem === 'undefined') return 1;
    const d = WeatherEventSystem.getTemperatureDelta();
    return Math.max(WEATHER_MIN, Math.min(WEATHER_MAX, 1 + d * WEATHER_PER_DEG));
  }

  // What a well actually raises / a turbine actually makes right now.
  function activityOutput() {
    return Math.max(1, Math.round(baseOutput() * weatherMult()));
  }

  // Five descriptive bands so the player can read the world at a glance
  // without being shown a raw 0..1 float. Split on the watt figure rather
  // than the roll so the label and the number can never disagree.
  function activityLabel() {
    const w = baseOutput();
    if (w <= 33) return { text: 'Dormant',  tone: 'bad'  };
    if (w <= 37) return { text: 'Low',      tone: 'warn' };
    if (w <= 42) return { text: 'Moderate', tone: ''     };
    if (w <= 46) return { text: 'High',     tone: 'good' };
    return                { text: 'Intense',  tone: 'good' };
  }

  // ── Deposit siting ──────────────────────────────────────────────────
  // Geothermal is the FIRST resource chain in the tree, and both halves of
  // it — the well and its turbine — have to be wired back to the grid.
  //
  // Deposits used to be placed by the same "at least one tile in the outer
  // 15% margin" rule the coal/oil/uranium surveys use. On a 1170×700 map
  // that band starts 175 tiles from the left edge and 105 from the top, so
  // a deposit could easily land 300+ tiles from the player's city — an
  // absurd wire run for a tier-1 unlock, and the reason geothermal felt
  // like a late-game trek.
  //
  // They are now sited in a ring around whatever the player has actually
  // built: far enough out that they never appear in the middle of town,
  // close enough that connecting one is a normal expansion rather than an
  // expedition. Deposits found by later scans sit slightly further out, so
  // repeat scans push outward instead of stacking on the same ground.
  // Distance band from the build centre, in tiles. This has been tuned twice
  // from opposite directions: deposits originally landed near the map edges
  // (a 1170x700 grid, so 300-580 tiles out — an expedition, not an expansion),
  // and the correction to 25-70 put them close enough to feel like they were
  // waiting in the back garden. These are the middle: far enough that reaching
  // one is a deliberate wire run and a decision about where to grow, close
  // enough that it reads as part of your grid rather than a colony.
  //
  // For scale: the map is 1170 wide, so the far edge from a central city is
  // ~585 tiles. The band below tops out around a quarter of that on a first
  // scan. Widen or narrow here; everything else derives from these.
  //
  // Measuring only from the centroid wasn't enough on its own: a city is not
  // a point, and once it sprawls 60+ tiles in some direction a deposit 55
  // tiles from its centroid lands right up against (or among) the outer
  // buildings. So the ring now starts past the city's real extent
  // (buildExtent's radius), and every candidate must also sit a clear
  // GEO_CLEARANCE tiles from the nearest thing the player has built.
  // Customer zones spawn 55-100 tiles out from City Hall (ZoneSystem's
  // GOV_RING band), and a deposit sitting where a neighbourhood is about to
  // appear blocks it and reads as part of town. So the ring starts past that
  // band, and every find must also clear it by GEO_ZONE_MARGIN — measured
  // from the government zone itself, since a lopsided city pulls the
  // centroid (and so the ring) off City Hall.
  // (A function, not a const: this file loads before zone_system.js.)
  const GEO_ZONE_MARGIN = 25;
  const geoZoneClear  = () => (ZoneSystem.GOV_RING_MAX ?? 100) + GEO_ZONE_MARGIN;   // 125 tiles from the gov zone
  const GEO_BAND      = 70;   // ring depth past the inner edge — keeps finds off the map edges
  const GEO_CLEARANCE = 45;   // tiles from the nearest player structure, whatever the city's shape
  const GEO_SCAN_PUSH = 10;   // each previous scan nudges the ring outward
  // The whole ring, scaled: every find lands this much further from the build
  // centre than the band above would put it (12.5%: about 20 tiles on a first
  // scan). One knob for "a bit further out" without retuning the band.
  const GEO_REACH     = 1.125;

  // Everything the player has put down, as opposed to the map itself.
  const NATURE = new Set([T.TREE, T.BUSH, T.WATER, T.GEODEPOSIT, T.COALDEPOSIT, T.OILDEPOSIT,
                          T.URANIUMDEPOSIT, T.SULFURDEPOSIT, T.LITHIUMDEPOSIT, T.HELIUMDEPOSIT, T.RAREEARTHDEPOSIT, T.AQUIFER]);
  const CELL = 8;   // bucket size for the clearance lookup

  // How far the build actually reaches from its centre (90th percentile, so
  // one long wire run out to a remote site doesn't inflate it), plus a coarse
  // occupancy grid of every structure for the clearance check.
  function buildExtent(centre) {
    const cells = new Set();
    const dists = [];
    for (const e of EntityRegistry.all()) {
      if (NATURE.has(e.type)) continue;
      const w = e.width || 1, h = e.height || 1;
      for (let c = Math.floor(e.col / CELL); c <= Math.floor((e.col + w - 1) / CELL); c++)
        for (let r = Math.floor(e.row / CELL); r <= Math.floor((e.row + h - 1) / CELL); r++)
          cells.add(c * 100000 + r);
      dists.push(Math.hypot(e.col + w / 2 - centre.c, e.row + h / 2 - centre.r));
    }
    dists.sort((a, b) => a - b);
    const radius = dists.length ? dists[Math.floor((dists.length - 1) * 0.9)] : 0;
    return { radius, cells };
  }

  // True when no player structure sits within `clear` tiles of (col,row).
  // Checked on the coarse grid, so it errs on the side of more clearance.
  function clearOfBuild(cells, col, row, clear) {
    const c0 = Math.floor((col - clear) / CELL), c1 = Math.floor((col + clear) / CELL);
    const r0 = Math.floor((row - clear) / CELL), r1 = Math.floor((row + clear) / CELL);
    for (let c = c0; c <= c1; c++)
      for (let r = r0; r <= r1; r++) {
        if (!cells.has(c * 100000 + r)) continue;
        // nearest point of this cell to the candidate
        const nx = Math.max(c * CELL, Math.min(col, c * CELL + CELL - 1));
        const ny = Math.max(r * CELL, Math.min(row, r * CELL + CELL - 1));
        if (Math.hypot(nx - col, ny - row) < clear) return false;
      }
    return true;
  }

  // Where the player's build actually is. Prefers the centroid of their own
  // structures (which drifts as the city grows), falls back to the civic
  // centre, then to the middle of the map on a bare grid.
  function buildCentre() {
    let sumC = 0, sumR = 0, n = 0;
    const ANCHORS = [T.WIRE, T.POLE, T.POWERTOWER, T.SOLAR, T.SOLAR2, T.SOLAR3, T.WIND, T.WIND2, T.WIND3,
                     T.BIOFUELGEN, T.RESEARCH, T.RESEARCH2, T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5,
                     T.MONITOR, T.MONITOR2, T.SURVEY, T.SURVEY2, T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL];
    for (const t of ANCHORS) {
      for (const e of EntityRegistry.getByType(t)) { sumC += e.col; sumR += e.row; n++; }
    }
    if (n > 0) return { c: sumC / n, r: sumR / n };
    const gov = ZoneSystem.govZoneCentre?.();
    if (gov) return gov;
    return { c: COLS / 2, r: ROWS / 2 };
  }

  // A well is anchored at its deposit's top-left and is 3×3 regardless of
  // the deposit's own size (same "building is bigger than the deposit"
  // shape the uranium/sulfur/lithium mines use), so a deposit spawned hard
  // against the map edge or wedged between other buildings would be
  // permanently unusable. Reject those at spawn time instead of revealing
  // a deposit the player can never build on.
  function wellFits(col, row) {
    const wDef = EntityDefs[T.GEOWELL];
    const ww = wDef.width || 3, wh = wDef.height || 3;
    if (!GridManager.inBounds(col, row) || !GridManager.inBounds(col + ww - 1, row + wh - 1)) return false;
    for (let r = row; r < row + wh; r++)
      for (let c = col; c < col + ww; c++) {
        if (GridManager.getEntity(c, r)) return false;
        if (WaterSystem.isWater(c, r)) return false;
      }
    return true;
  }

  function spawnGeoDeposits() {
    // 1–3 per scan (was 2–5). The coal survey's 4–8 is deliberately more
    // generous: coal deposits deplete, these don't.
    const count  = 1 + Math.floor(Math.random() * 3);
    const sizes  = [[2,2],[2,2],[3,3],[3,2]];
    let spawned  = 0;

    const centre = buildCentre();
    const { radius, cells } = buildExtent(centre);
    const push   = Math.min(70, geoScans * GEO_SCAN_PUSH);
    const placed = [];   // deposits placed by THIS scan, to keep them spread out
    const SEPARATION = 12;
    const zoneClear = geoZoneClear();
    const inner  = Math.max(zoneClear, radius + GEO_CLEARANCE) + push;   // floor keeps a tiny early build's ring past the zone band

    // Sample inside the ring directly rather than rejection-sampling the whole
    // map: on a 1170×700 grid the target band is a few percent of the area, so
    // uniform sampling would burn the attempt budget and silently under-spawn.
    // The ring widens on each pass so a crowded or water-logged neighbourhood
    // still yields deposits instead of returning none.
    const PASSES = [
      { min: inner, max: inner + GEO_BAND,       clear: GEO_CLEARANCE,       attempts: 400 },
      { min: inner, max: inner + GEO_BAND + 50,  clear: GEO_CLEARANCE,       attempts: 400 },
      // Last resort on a crowded or water-logged map: ease the clearance and
      // reach further out rather than return nothing for a paid survey.
      { min: inner - 20, max: inner + GEO_BAND + 120, clear: GEO_CLEARANCE * 0.6, attempts: 400 },
    ];

    for (const pass of PASSES) {
      let attempts = 0;
      while (spawned < count && attempts < pass.attempts) {
        attempts++;
        const [sw, sh] = sizes[Math.floor(Math.random() * sizes.length)];
        const ang = Math.random() * Math.PI * 2;
        const rad = (pass.min + Math.random() * (pass.max - pass.min)) * GEO_REACH;
        const col = Math.round(centre.c + Math.cos(ang) * rad);
        const row = Math.round(centre.r + Math.sin(ang) * rad);

        if (col < 2 || row < 2 || col + sw > COLS - 2 || row + sh > ROWS - 2) continue;
        if (ZoneSystem.isInGovZone(col, row)) continue;
        if (ZoneSystem.distToGovZone(col, row) < zoneClear) continue;   // outside where zones spawn
        if (!clearOfBuild(cells, col + sw / 2, row + sh / 2, pass.clear)) continue;
        if (!wellFits(col, row)) continue;
        if (!depositClearOfWater(T.GEODEPOSIT, col, row, sw, sh)) continue;   // resource_helpers.js
        // Keep this scan's finds from clumping into one indistinguishable blob
        if (placed.some(p => Math.abs(p.col - col) + Math.abs(p.row - row) < SEPARATION)) continue;

        const deposit     = new Entity(T.GEODEPOSIT, col, row);
        deposit.width     = sw;
        deposit.height    = sh;
        deposit._geoPhase = Math.random() * Math.PI * 2;
        deposit._revealed = true;
        deposit._hasWell  = false;

        GridManager.setEntityFootprint(deposit);
        if (typeof WorldMapSystem !== 'undefined') WorldMapSystem.registerDiscovery(T.GEODEPOSIT, col, row, sw, sh);
        placed.push({ col, row });
        spawned++;
      }
      if (spawned >= count) break;
    }
    return spawned;
  }

  // The single tile just outside the well's rotated output edge — this is
  // the "defined output" a turbine has to be built over. Mirrors
  // CoalSystem.mineOutputPort so the R-to-rotate behaviour reads the same.
  function wellOutputPort(well) {
    const rot = well._rotation || 0;
    const w = well.width  || 3;
    // Visual height, not the 3×2 footprint — the port has to stay on the tile
    // the sprite points at, which is where renderGeoWell draws the flange and
    // where existing saves already have their turbines sitting.
    const h = EntityDefs[T.GEOWELL].visualHeight || well.height || 3;
    // South: the row straight under the 3×2 footprint. It used to be measured
    // off the 3-tall artwork like the others, which put the port two rows
    // down, with the spur crossing a row of open ground to reach it. A well
    // from a save whose turbine was built on that old tile keeps it
    // (_southPortLow, worked out in relinkAll).
    const footH = well.height || EntityDefs[T.GEOWELL].height || 2;
    let oc, or_;
    if      (rot === 0) { oc = well.col + Math.floor(w/2); or_ = well.row - 1; }              // N
    else if (rot === 1) { oc = well.col + w;               or_ = well.row + Math.floor(h/2); } // E
    else if (rot === 2) { oc = well.col + Math.floor(w/2); or_ = well.row + (well._southPortLow ? h : footH); } // S
    else                { oc = well.col - 1;               or_ = well.row + Math.floor(h/2); } // W
    if (!GridManager.inBounds(oc, or_)) return null;
    return { c: oc, r: or_ };
  }

  // Does this rectangle cover the given well's output port tile?
  function footprintCoversPort(well, col, row, w, h) {
    const port = wellOutputPort(well);
    if (!port) return false;
    return port.c >= col && port.c < col + w && port.r >= row && port.r < row + h;
  }

  // The one well a turbine at (col,row) would plug into, or null. Wells
  // that already have a turbine are skipped so the 1:1 rule holds even
  // when two wells' ports happen to fall under the same footprint.
  function wellForTurbineAt(col, row, w, h, ignoreTurbine = null) {
    for (const well of EntityRegistry.getByType(T.GEOWELL)) {
      const linked = well._linkedTurbine;
      if (linked && linked !== ignoreTurbine && EntityRegistry.all().has(linked)) continue;
      if (footprintCoversPort(well, col, row, w, h)) return well;
    }
    return null;
  }

  function hasWireConnection(e) {
    for (const n of GridManager.getNeighbours(e.col, e.row)) {
      const nb = n.entity;
      // A wire still counts when a pipe or belt has been laid over it: the
      // tile then reads as the pipe, with the wire carried underneath.
      if (nb && (nb.type === T.WIRE || nb.type === T.POLE || nb._underWire)) return true;
    }
    return false;
  }

  return {
    spawnGeoDeposits,
    wellOutputPort,
    footprintCoversPort,
    wellForTurbineAt,

    // Geothermal has its own ladder, half the coal scan's and counted
    // separately — it's the cheapest thing the station can look for, and
    // running one shouldn't inflate the price of a later coal scan (the
    // oil/uranium/sulfur/lithium scans all keep their own counters the
    // same way). The escalation still stops the map being carpeted in
    // permanent deposits for a flat fee.
    getScanCost() {
      const c = geoScans === 0 ? 12500
              : geoScans === 1 ? 21250   // escalation halved: was $30k then ×1.5
              : Math.round(21250 * Math.pow(1.25, geoScans - 1));
      return (typeof Difficulty !== 'undefined' ? Difficulty.price(c) : c);
    },
    getTotalScans()  { return geoScans; },
    incrementScans() { geoScans++; },
    loadScans(v)     { if (v !== undefined) geoScans = v; },

    getTotalSteam()  { return totalSteam; },
    loadTotalSteam(v){ if (v !== undefined) totalSteam = v; },

    // World geothermal activity — the raw 0..1 roll, the watts-per-turbine
    // it works out to, and the band label the info panels show.
    ACTIVITY_MIN_W,
    ACTIVITY_MAX_W,
    getActivity()      { return geoActivity; },
    // Base = the world's rating; Output = that rating after today's weather.
    getBaseOutputPerTurbine() { return baseOutput(); },
    getOutputPerTurbine()     { return activityOutput(); },
    getWeatherMult()          { return weatherMult(); },
    getActivityLabel() { return activityLabel(); },
    // Saves made before activity existed have no value stored; those worlds
    // keep the old fixed 35 kW so their grids don't shift under the player.
    loadActivity(v) {
      if (v === undefined || v === null) {
        geoActivity = (35 - ACTIVITY_MIN_W) / (ACTIVITY_MAX_W - ACTIVITY_MIN_W);  // → 35 kW base
      } else {
        geoActivity = Math.max(0, Math.min(1, v));
      }
    },

    // Sticky, same shape as Progression.hasSixTurbinesRunning — once three
    // turbines have been seen generating at the same time the Coal Scan
    // stays earned, so it can't flicker off because one well momentarily
    // browned out.
    COAL_SCAN_TURBINES,
    threeTurbinesEverRan()     { return threeTurbinesEverRan; },
    loadThreeTurbinesEverRan(v){ threeTurbinesEverRan = !!v; },

    // How many turbines are generating right now — drives the Coal Scan's
    // progress bar as well as the check below.
    runningTurbineCount() {
      let n = 0;
      for (const e of EntityRegistry.getByType(T.GEOTURBINE)) if (e._generating) n++;
      return n;
    },

    // Called once per tick AFTER every turbine has ticked, so the count
    // reflects this tick's state for all of them rather than whatever
    // partial set happened to be updated when any single one ran.
    checkThreeRunning() {
      if (threeTurbinesEverRan) return;
      if (this.runningTurbineCount() >= COAL_SCAN_TURBINES) {
        threeTurbinesEverRan = true;
        Progression.checkUnlocks?.();
      }
    },

    hasDeposits() {
      return EntityRegistry.getByType(T.GEODEPOSIT).size > 0;
    },

    // Re-derive the well ⇄ turbine pairing for one well. Called after
    // placement, rotation, removal, and save-load — anything that can move
    // the output port out from under a turbine (or a turbine out from
    // under a port).
    relinkWell(well) {
      const t = well._linkedTurbine;
      if (t && EntityRegistry.all().has(t) &&
          footprintCoversPort(well, t.col, t.row, t.width || 4, t.height || 3)) return;
      if (t) { if (t._linkedWell === well) t._linkedWell = null; well._linkedTurbine = null; }
      const port = wellOutputPort(well);
      if (!port) return;
      for (const turbine of EntityRegistry.getByType(T.GEOTURBINE)) {
        if (turbine._linkedWell && turbine._linkedWell !== well) continue;
        if (footprintCoversPort(well, turbine.col, turbine.row, turbine.width || 4, turbine.height || 3)) {
          well._linkedTurbine  = turbine;
          turbine._linkedWell  = well;
          turbine._wellCol     = well.col;
          turbine._wellRow     = well.row;
          return;
        }
      }
    },

    // Rebuild every pairing from scratch — used on load, where entities
    // are restored in arbitrary order and neither side can be trusted.
    relinkAll() {
      for (const t of EntityRegistry.getByType(T.GEOTURBINE)) t._linkedWell = null;
      for (const w of EntityRegistry.getByType(T.GEOWELL))    w._linkedTurbine = null;
      // A south-facing well from before its port moved up a row: if a turbine
      // stands on the old port tile and none on the new one, keep the old.
      for (const w of EntityRegistry.getByType(T.GEOWELL)) {
        if (((w._rotation || 0) % 4) !== 2) { w._southPortLow = false; continue; }
        const covers = (low) => {
          w._southPortLow = low;
          for (const t of EntityRegistry.getByType(T.GEOTURBINE))
            if (footprintCoversPort(w, t.col, t.row, t.width || 4, t.height || 3)) return true;
          return false;
        };
        const onNew = covers(false);
        w._southPortLow = !onNew && covers(true);
      }
      for (const w of EntityRegistry.getByType(T.GEOWELL)) {
        // Prefer the pairing the save recorded, so a turbine sitting on two
        // overlapping ports lands back on the same well it had before.
        let match = null;
        for (const t of EntityRegistry.getByType(T.GEOTURBINE)) {
          if (t._linkedWell) continue;
          const claimed = t._wellCol === w.col && t._wellRow === w.row;
          if (!footprintCoversPort(w, t.col, t.row, t.width || 4, t.height || 3)) continue;
          if (claimed) { match = t; break; }
          if (!match) match = t;
        }
        if (match) {
          w._linkedTurbine = match;
          match._linkedWell = w;
          match._wellCol = w.col;
          match._wellRow = w.row;
        }
      }
    },

    // Called every tick for every well.
    tickWell(well, dt) {
      const def = EntityDefs[T.GEOWELL];
      const deposit = well._linkedDeposit;
      // _bayFed: its network is short but still has some supply. The pumps
      // keep running through a brownout (PowerNetwork.tick step 4).
      if (!deposit || !(well.powered || well._bayFed) || well._lightningDamaged) {
        well._steamOutput = 0;
        well._flowing     = false;
        return;
      }
      // Steam scales with the world's geothermal activity — see the
      // ACTIVITY_* block at the top. def.steamOutput is only a fallback.
      well._steamOutput = activityOutput() || def.steamOutput || 35;
      well._flowing     = true;
      totalSteam += well._steamOutput * dt;
    },

    // Called every tick for every turbine, after every well has ticked.
    tickTurbine(turbine, dt) {
      const def = EntityDefs[T.GEOTURBINE];
      const well = turbine._linkedWell;
      // The well and turbine are one plant on the grid (power_network.js
      // isGeoPair), so a line run to the well serves the turbine too.
      turbine._hasPower = hasWireConnection(turbine) || (!!well && (hasWireConnection(well) || !!well._craterWired));

      // The turbine takes whatever its well raised THIS tick and converts it
      // 1:1 into watts. Reading the well's own figure rather than recomputing
      // activityOutput() keeps the two in lockstep even if the ambient
      // temperature moves between the well pass and the turbine pass.
      const steamDraw = well ? (well._steamOutput || 0) : 0;
      if (!well || !EntityRegistry.all().has(well) ||
          !well._flowing || steamDraw <= 0 || !turbine._hasPower ||
          turbine._lightningDamaged) {
        turbine._generating    = false;
        turbine._currentOutput = 0;
        return;
      }
      turbine._generating    = true;
      turbine._currentOutput = steamDraw || def.powerOutput;
    },

    // Placement gate for the well — mirrors the mine-on-deposit rules so
    // the ghost cursor and the click path agree.
    canPlaceWell(deposit) {
      if (!deposit || deposit.type !== T.GEODEPOSIT) return { ok: false, why: 'Geothermal Well must be placed on a geothermal deposit!' };
      if (deposit._hasWell) return { ok: false, why: 'This deposit already has a well!' };
      const def = EntityDefs[T.GEOWELL];
      const ww = def.width || 3, wh = def.height || 3;
      const col = deposit.col, row = deposit.row;
      if (!GridManager.inBounds(col, row) || !GridManager.inBounds(col + ww - 1, row + wh - 1))
        return { ok: false, why: 'Geothermal Well extends out of bounds; deposit too close to map edge!' };
      for (let r = row; r < row + wh; r++)
        for (let c = col; c < col + ww; c++) {
          const tile = GridManager.getEntity(c, r);
          if (tile && tile !== deposit && !GridManager.isVegetation(tile)) return { ok: false, why: 'Well footprint blocked: clear the surrounding tiles first!' };
        }
      return { ok: true };
    },
  };
})();
