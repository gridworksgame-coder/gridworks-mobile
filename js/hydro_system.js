/* ═══════════════════════════════════════════════════════════════════
   HYDRO SYSTEM
   Hydroelectric power generation tick logic.
   ═══════════════════════════════════════════════════════════════════ */

const HydroSystem = (() => {
  let totalWaterExtracted = 0;

  // Aquifer quality tiers
  const AQUIFER_TIERS = [
    { label: 'Small Aquifer',  size: 5, waterRate: 20 },
    { label: 'Medium Aquifer', size: 6, waterRate: 40 },
    { label: 'Large Aquifer',  size: 8, waterRate: 80 },
  ];

  // Spawn irregular aquifer deposits — blob-shaped using anchor + offsets
  function spawnAquifers() {
    const count = 2 + Math.floor(Math.random() * 3); // 2-4 aquifers
    let spawned = 0, attempts = 0;

    while (spawned < count && attempts < 600) {
      attempts++;
      const tier = AQUIFER_TIERS[Math.floor(Math.random() * AQUIFER_TIERS.length)];
      const s    = tier.size;
      const col  = DEPOSIT_FIELD.c0 + Math.floor(Math.random() * (DEPOSIT_FIELD.cols - s - 2)) + 1;
      const row  = DEPOSIT_FIELD.r0 + Math.floor(Math.random() * (DEPOSIT_FIELD.rows - s - 2)) + 1;

      if (!isOuterZone(col, row, s, s)) continue;
      if (!GridManager.canPlaceFootprint(col, row, s, s)) continue;
      // Skip if any tile in footprint is water
      let _waterBlocked = false;
      for (let _dr = 0; _dr < s && !_waterBlocked; _dr++)
        for (let _dc = 0; _dc < s && !_waterBlocked; _dc++)
          if (WaterSystem.isWater(col+_dc, row+_dr)) _waterBlocked = true;
      if (_waterBlocked) continue;

      const deposit      = new Entity(T.AQUIFER, col, row);
      deposit.width      = s;
      deposit.height     = s;
      deposit._waterRate = tier.waterRate;
      deposit._tierLabel = tier.label;
      deposit._waterBuffer = 0;
      // Irregular shape mask: randomly exclude ~20% of corner tiles for visual variety
      deposit._shapeMask = [];
      for (let r = 0; r < s; r++)
        for (let c = 0; c < s; c++) {
          const corner = (r === 0 || r === s-1) && (c === 0 || c === s-1);
          deposit._shapeMask.push(corner && Math.random() < 0.6 ? 0 : 1);
        }

      GridManager.setEntityFootprint(deposit);
      spawned++;
    }
    return spawned;
  }

  return {
    // Legacy API — aquifers removed from gameplay; stubs return safe defaults.
    hasAquifers() { return false; },
    spawnAquifers() { return 0; },
    tickExtractor(e, dt) {
      // Single source of truth for the rate — power_network.js allocates
      // against this exact number, and the info panel quotes it.
      const BASE_RATE = EntityDefs[T.WATEREXTRACTOR].waterPerSecond || 20;
      e._waterRate = (e.powered && e._lakeConnected) ? BASE_RATE : 0;
    },

    // Called every tick for hydro generators — driven by drive shaft
    tickGenerator(gen, dt) {
      if (gen.def === EntityDefs[T.HYDROGENERATOR]) {
        gen.def = { ...EntityDefs[T.HYDROGENERATOR] };
      }
      // ShaftSystem.tick (in dam.js) writes gen._shaftRate and gen.def.powerOutput.
      // A burning generator is a wreck: no output, whatever the shaft says.
      // ShaftSystem ticks first and has already written powerOutput.
      if (gen._lightningDamaged) { gen._shaftRate = 0; gen.def.powerOutput = 0; }
      const rate = gen._shaftRate || 0;
      gen._fuelled = rate > 0;
      gen._connectedExtractors = 0;
    },

    // Single output stub tile — the one tile just outside the extractor's
    // output edge, chosen by e._rotation (0=N, 1=E, 2=S, 3=W). Water only
    // flows into a pipe touching this exact tile, matching CoalSystem's
    // mineOutputPort() pattern.
    extractorOutputPort(ext) {
      if (!ext) return null;
      const rot = ext._rotation || 0;
      const w = ext.width  || 4;
      const h = ext.height || 4;
      let oc, or_;
      if      (rot === 0) { oc = ext.col + Math.floor(w/2); or_ = ext.row - 1; }         // N
      else if (rot === 1) { oc = ext.col + w;               or_ = ext.row + Math.floor(h/2); } // E
      else if (rot === 2) { oc = ext.col + Math.floor(w/2); or_ = ext.row + h; }          // S
      else                { oc = ext.col - 1;               or_ = ext.row + Math.floor(h/2); } // W
      if (!GridManager.inBounds(oc, or_)) return null;
      return { c: oc, r: or_ };
    },
    generatorInputPort(gen) { return []; },
    getTotalWaterExtracted() { return totalWaterExtracted; },
    loadTotalWater(v)        { if (v !== undefined) totalWaterExtracted = v; },
  };
})();

