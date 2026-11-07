/* ═══════════════════════════════════════════════════════════════════
   PROGRESS & CLOCK UI
   Progress tracker panel and the day/time clock readout.
   ═══════════════════════════════════════════════════════════════════ */

function updateProgressTracker() {
  const panel = document.getElementById('progress-tracker');
  // Closed (e.g. by the 9 key with the pointer still over it): drop its tooltip.
  if (!panel || !panel.classList.contains('visible')) { _ptHideHint(); return; }
  const body = document.getElementById('pt-body');
  if (!body) return;

  const s    = HouseRequestSystem.getTrackerStatus();
  const totalWs = Progression.totalWs;
  const rp   = Math.floor(Progression.totalResearch);
  const rows = [];

  const val  = (text, cls='') => `<span class="pt-val${cls?' '+cls:''}">${text}</span>`;
  const lbl  = (text) => `<span class="pt-label">${text}</span>`;
  const row  = (l, v) => `<div class="pt-row">${lbl(l)}${v}</div>`;
  const bar  = (pct, col) => `<div class="pt-bar-wrap"><div class="pt-bar-fill" style="width:${(Math.min(1,pct)*100).toFixed(1)}%;background:${col}"></div></div>`;
  const div  = () => '<div class="pt-divider"></div>';
  const esc  = (t) => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  // ── Next request ──────────────────────────────────────────────
  if (!s.cabinCleared && !s.cabinSent) {
    rows.push(row('Next', val("Mae's Cabin", 'warn')));
    const pct = Math.min(1, totalWs / 400);
    rows.push(bar(pct, '#f0c040'));
    rows.push(row('Progress', val(`${Math.floor(totalWs)} / 400 Ws`, pct >= 1 ? 'good' : '')));
  } else if (!s.cabinCleared) {
    rows.push(row('Next', val('Cabin pending', 'warn')));
    rows.push(row('Status', val('Accept or decline', 'dim')));
  } else if (s.cooldownTimer > 0) {
    const cdPct = 1 - s.cooldownTimer / Math.max(1, s.cooldownTotal);
    rows.push(row('Cooldown', val(`${Math.ceil(s.cooldownTimer)}s`, 'warn')));
    rows.push(bar(cdPct, '#f0c040'));
  } else {
    const queueFull = s.pendingCount >= 3;

    // Substation state — read straight off the request system rather than
    // recomputed here, so the panel can never claim a gate is open (or shut)
    // that the sim disagrees with. `subReady` is the LATCH: once a substation
    // has banked real charge the commercial gate stays open for good, so a
    // full substation sitting on standby must not read as "not charging".
    const subCharge  = s.substation.charge;
    const subPresent = s.substation.present;
    const subReady   = s.subEverReady;

    const typeTag = (cls, label) => `<span class="pt-next-type ${cls}">${label}</span>`;

    // Real-time gap between requests of one type, scaled the same way
    // house_request_system.js does — even once the WH/fill gates are
    // satisfied, a request won't actually fire until this interval since the
    // last one has elapsed. Surfacing the remaining wait avoids "Incoming
    // soon" reading as imminent when it might still be minutes away.
    const _secsUntilNext = (baseInterval, acceptedCount, lastFired) => {
      const scale = Math.min(8, 1 + acceptedCount * 0.5);
      const interval = baseInterval * scale;
      return Math.max(0, interval - (s.gameTime - (lastFired || 0)));
    };
    const _statusOrWait = (secsLeft) => secsLeft > 0
      ? row('Status', val(`Next in ${Math.ceil(secsLeft)}s`, 'warn'))
      : row('Status', val('Incoming soon', 'good'));

    // ── Residential ────────────────────────────────────────────
    rows.push(`<div class="pt-row">${lbl('Residential')}${typeTag('house', 'Next Up')}</div>`);
    {
      const pct = Math.min(1, totalWs / s.nextThreshold);
      if (queueFull) {
        rows.push(row('Status', val('Queue full', 'warn')));
      } else if (pct >= 1) {
        rows.push(_statusOrWait(_secsUntilNext(150, s.housesAccepted, s.lastRequestTime.house)));
      } else {
        rows.push(bar(pct, '#40c8ff'));
        rows.push(row('Progress', val(formatWhPair(totalWs, s.nextThreshold), pct > 0.8 ? 'good' : '')));
      }
    }

    // ── Commercial ─────────────────────────────────────────────
    rows.push(div());
    // Mirrors house_request_system.js's actual gate: a substation on the map,
    // nothing else. It used to test Progression.isUnlocked(SUBSTATION) — the
    // TECH unlock (200 kW generated), which the request system never
    // consults — so the section could sit "Locked" with the old requirement
    // text showing even when commercial requests were ready to fire. The
    // residential prerequisite it also carried is gone from the gate too.
    const comUnlocked = subPresent;
    rows.push(`<div class="pt-row">${lbl('Commercial')}${typeTag('commercial', comUnlocked ? 'Unlocked' : 'Locked')}</div>`);
    if (!comUnlocked) {
      rows.push(row('Requires', val('a Substation', 'dim')));
    } else {
      const comThreshGate = s.commercialThresh;
      const pct = Math.min(1, totalWs / comThreshGate);
      if (queueFull) {
        rows.push(row('Status', val('Queue full', 'warn')));
      } else if (!subPresent) {
        rows.push(row('Status', val('Needs Substation', 'warn')));
      } else if (!subReady) {
        // Never yet banked a reserve — either unwired, or the grid has no
        // surplus left for it (it discharges to cover demand instead).
        rows.push(row('Status', val('Substation has no reserve; needs surplus power', 'warn')));
      } else if (pct >= 1) {
        rows.push(_statusOrWait(_secsUntilNext(240, s.commercialsAccepted, s.lastRequestTime.commercial)));
      } else {
        rows.push(bar(pct, '#f0c040'));
        rows.push(row('Progress', val(formatWhPair(totalWs, comThreshGate), pct > 0.8 ? 'good' : '')));
      }
    }

    // ── Industrial ─────────────────────────────────────────────
    rows.push(div());
    const indUnlocked = s.geoEverRan;
    rows.push(`<div class="pt-row">${lbl('Industrial')}${typeTag('industrial', indUnlocked ? 'Unlocked' : 'Locked')}</div>`);
    if (!indUnlocked) {
      rows.push(row('Requires', val('Geothermal power running', 'dim')));
    } else {
      const pct = Math.min(1, totalWs / s.industrialThresh);
      if (queueFull) {
        rows.push(row('Status', val('Queue full', 'warn')));
      } else if (subCharge < 50) {
        rows.push(row('Status', val('Needs Substation (50 kW+)', 'warn')));
      } else if (pct >= 1) {
        rows.push(_statusOrWait(_secsUntilNext(360, s.industrialsAccepted, s.lastRequestTime.industrial)));
      } else {
        rows.push(bar(pct, '#ff8040'));
        rows.push(row('Progress', val(formatWhPair(totalWs, s.industrialThresh), pct > 0.8 ? 'good' : '')));
      }
    }
  }

  // Pending count
  if (s.pendingCount > 0 || s.backlogCount > 0) {
    rows.push(div());
    rows.push(row('Pending', val(`${s.pendingCount} active${s.backlogCount > 0 ? ` · ${s.backlogCount} queued` : ''}`, s.pendingCount > 0 ? 'warn' : 'dim')));
  }

  // ── Nearest research unlock ───────────────────────────────────
  // Biofuel progress display
  // The two things biofuel collected unlocks, at the thresholds
  // progression.js gates them on: Wire at 50, the Research Station at 125.
  const biofuelTotal = BiofuelSystem.getTotalCollected();
  if (biofuelTotal < 125) {
    rows.push(div());
    rows.push(`<div class="pt-row"><span class="pt-label">Biofuel</span></div>`);
    const bfPct = Math.min(1, biofuelTotal / 125);
    rows.push(row('Collected', val(`${biofuelTotal}/125`, bfPct > 0.4 ? 'warn' : 'dim')));
    rows.push(bar(bfPct, '#40a020'));
    if (biofuelTotal < 50) rows.push(row('Wire', val('needs 50 biofuel', 'dim')));
    else rows.push(row('Research Station', val('needs 125 biofuel', 'dim')));
  }

  const NEXT_UNLOCKS = [
    { type: T.WIRE,           label: 'Wire',              pct: () => Math.min(1, (BiofuelSystem.getTotalCollected?.() || 0) / 50) },
    { type: T.RESEARCH,       label: 'Research Station MK1', pct: () => Math.min(1, BiofuelSystem.getTotalCollected() / 125) },
    { type: T.POLE,           label: 'Power Pole',      pct: () => (HouseRequestSystem.getHousesAccepted() >= 1 || HouseRequestSystem.getCommercialsAccepted() >= 1 || HouseRequestSystem.getCabinCleared()) ? 1 : 0 },
    { type: T.CELLTOWER,      label: 'Cell Tower',      pct: () => { const hPct = Math.min(1, HouseRequestSystem.getHousesAccepted() / 20); const rPct = Progression.isUnlocked(T.RESEARCH2) ? 1 : 0; return hPct * 0.5 + rPct * 0.5; } },
    { type: T.CIRCUITSWITCH,  label: 'Circuit Switch',  pct: () => { const rPct = Progression.isUnlocked(T.RESEARCH2) ? 1 : 0; const wPct = Math.min(1, (PowerNetwork.stats.totalConsumed || 0) / 1000); return rPct * 0.5 + wPct * 0.5; } },
    { type: T.CIRCUITSWITCH2, label: 'Circuit Switch MK2', pct: () => { const gPct = Math.min(1, PowerNetwork.stats.totalGenerated / 7500); const rPct = EntityRegistry.getByType(T.MK4RESEARCH).size > 0 ? 1 : 0; return gPct * 0.5 + rPct * 0.5; } },
    { type: T.FIBERHUB,       label: 'Fiber Hub',       pct: () => Progression.progressFor(T.FIBERHUB) },
    { type: T.GEOWELL,        label: 'Geothermal Well', pct: () => GeothermalSystem.hasDeposits() ? 1 : 0 },
    { type: T.GEOTURBINE,     label: 'Geothermal Turbine', pct: () => EntityRegistry.getByType(T.GEOWELL).size > 0 ? 1 : 0 },
    { type: T.COALSCAN,       label: 'Coal Scan',       pct: () => Progression.progressFor(T.COALSCAN) },
    { type: T.COALMINE,       label: 'Coal Mine',       pct: () => (Progression.isUnlocked(T.COALSCAN) && CoalSystem.hasDeposits()) ? 1 : 0 },
    { type: T.CONVEYOR,       label: 'Conveyor Belt',   pct: () => Progression.progressFor(T.CONVEYOR) },
    { type: T.UNDERGNDCONVEYOR, label: 'Underground Belt', pct: () => Progression.progressFor(T.UNDERGNDCONVEYOR) },
    ...(CONVEYOR_SPLITTER_ARCHIVED ? [] : [{ type: T.CONVEYORSPLITTER, label: 'Conveyor Splitter', pct: () => Progression.progressFor(T.CONVEYORSPLITTER) }]),
    { type: T.PROTECTOR,      label: 'Surge Protector', pct: () => PowerNetwork.redlineProgress() },
    { type: T.PROTECTOR2,     label: 'Surge Protector MK2', pct: () => { const wPct = Math.min(1, PowerNetwork.stats.totalConsumed / 800); const rPct = Progression.isUnlocked(T.RESEARCH2) ? 1 : 0; return wPct * 0.5 + rPct * 0.5; } },
    { type: T.LIGHTNINGROD3,  label: 'Lightning Rod MK3', pct: () => { const iPct = Math.min(1, Math.max(0, Economy.income) / LIGHTNINGROD3_INCOME); const rPct = EntityRegistry.getByType(T.MK4RESEARCH).size > 0 ? 1 : 0; return iPct * 0.5 + rPct * 0.5; } },
    { type: T.PROTECTOR3,     label: 'Surge Protector MK3', pct: () => { const cPct = Math.min(1, PowerNetwork.stats.totalConsumed / 5000); const rPct = EntityRegistry.getByType(T.MK4RESEARCH).size > 0 ? 1 : 0; return cPct * 0.5 + rPct * 0.5; } },
    { type: T.PIPE,           label: 'Pipe',            pct: () => Progression.progressFor(T.PIPE) },
    // Both of these used to carry their own copy of the unlock gate, and both
    // copies were wrong: Underground Pipe watched the Coal Generator when the
    // real gate is the Liquid Storage Tank, and Oil Scan divided coal by 10,000
    // when the real threshold is 300,000. Each therefore reported "Ready!" long
    // before the unlock existed. Delegating to progression.js means there is one
    // definition of each gate instead of three that can drift apart.
    { type: T.UNDERGNDPIPE,   label: 'Underground Pipe', pct: () => Progression.progressFor(T.UNDERGNDPIPE) },
    { type: T.OILSCAN,        label: 'Oil Scan',        pct: () => Progression.progressFor(T.OILSCAN) },
    { type: T.URANIUMSCAN,    label: 'Uranium Scan',    pct: () => { const rPct = Progression.isUnlocked(T.RESEARCH3) ? 1 : 0; const runtime = (typeof ReservoirSystem !== 'undefined') ? ReservoirSystem.getTotalTurbineRuntime() : 0; const tPct = Math.min(1, runtime / 3000); return rPct * 0.5 + tPct * 0.5; } },
    { type: T.SULFURSCAN,     label: 'Sulfur Scan',     pct: () => { const rPct = Progression.isUnlocked(T.RESEARCH3) ? 1 : 0; const runtime = (typeof ReservoirSystem !== 'undefined') ? ReservoirSystem.getTotalTurbineRuntime() : 0; const tPct = Math.min(1, runtime / 3000); return rPct * 0.5 + tPct * 0.5; } },
    { type: T.URANIUMMINE,    label: 'Uranium Mine',    pct: () => { const rPct = Progression.isUnlocked(T.RESEARCH3) ? 1 : 0; const dPct = UraniumSystem.hasDeposits?.() ? 1 : 0; return rPct * 0.5 + dPct * 0.5; } },
    { type: T.SULFURMINE,     label: 'Sulfur Mine',     pct: () => { const rPct = Progression.isUnlocked(T.RESEARCH3) ? 1 : 0; const dPct = SulfurSystem.hasDeposits?.() ? 1 : 0; return rPct * 0.5 + dPct * 0.5; } },
    { type: T.SULFURMINE2,    label: 'Sulfur Mine MK2', pct: () => Progression.progressFor(T.SULFURMINE2) },
    { type: T.LITHIUMSCAN,    label: 'Lithium Scan',    pct: () => Progression.progressFor(T.LITHIUMSCAN) },
    { type: T.LITHIUMMINE,    label: 'Lithium Mine',    pct: () => { const sPct = Progression.isUnlocked(T.LITHIUMSCAN) ? 1 : 0; const dPct = (typeof LithiumSystem !== 'undefined' && LithiumSystem.hasDeposits?.()) ? 1 : 0; return sPct * 0.5 + dPct * 0.5; } },
    { type: T.SOLAR,          label: 'Solar Panel MK1',   dayGate: 54, pct: () => Math.min(1, (DayNight.day() * 24 + (DayNight.day() >= 2 ? DayNight.hour() : 0)) / 54) },
    { type: T.FISHINGPOLE,    label: 'Fishing Pole',     pct: () => Progression.isUnlocked(T.RESEARCH) ? Math.min(1, Progression.totalWs / 5000) : Math.min(0.49, (BiofuelSystem.getTotalCollected() / 125) * 0.49) },
    { type: T.MONITOR,        label: 'Monitor Stn',     pct: () => Math.min(1, EntityRegistry.getByType(T.WIND).size / 5) },
    { type: T.MONITOR2,       label: 'Monitor Stn MK2', pct: () => Progression.progressFor(T.MONITOR2) },
    { type: T.ENGOFFICE,      label: 'Engineering Office', pct: () => Progression.progressFor(T.ENGOFFICE) },
    { type: T.BEACON,         label: 'Comms Beacon',    pct: () => Math.min(1, PowerNetwork.stats.totalGenerated / 150) },
    { type: T.SUBSTATION,     label: 'Substation MK1',  pct: () => Math.min(1, PowerNetwork.stats.totalGenerated / 200) },
    { type: T.SUBSTATION3,    label: 'Substation MK3',  pct: () => { const wPct = Math.min(1, PowerNetwork.stats.totalGenerated / 3500); const rPct = Progression.isUnlocked(T.RESEARCH3) ? 1 : 0; return wPct * 0.5 + rPct * 0.5; } },
    { type: T.SUBSTATION4,    label: 'Substation MK4',  pct: () => { const wPct = Math.min(1, PowerNetwork.stats.totalGenerated / 10000); const rPct = EntityRegistry.getByType(T.MK4RESEARCH).size > 0 ? 1 : 0; return wPct * 0.5 + rPct * 0.5; } },
    { type: T.SUBSTATION5,    label: 'Substation MK5',  pct: () => Progression.progressFor(T.SUBSTATION5) },
    { type: T.SUBSTATION2,    label: 'Substation MK2',  pct: () => { const wPct = Math.min(1, PowerNetwork.stats.totalConsumed / 600); const rPct = Progression.isUnlocked(T.RESEARCH2) ? 1 : 0; return wPct * 0.5 + rPct * 0.5; } },
    { type: T.TRUCK,          label: 'Waste Truck',      pct: () => { let maxAsh = 0; for (const e of EntityRegistry.getByType(T.COALGENERATOR)) maxAsh = Math.max(maxAsh, e._ashWaste || 0); return Math.min(1, maxAsh / 60); } },
    { type: T.HAULER,         label: 'Hauler',           pct: () => Math.min(1, beltTileCount() / HAULER_BELT_TILES) },
    { type: T.ROAD,           label: 'Road',             pct: () => Progression.isUnlocked(T.TRUCK) ? 1 : 0 },
    { type: T.BRIDGE,         label: 'Bridge',           pct: () => Progression.isUnlocked(T.TRUCK) ? 1 : 0 },
    { type: T.PATHTOOL,       label: 'Path Tool',        pct: () => Progression.isUnlocked(T.TRUCK) ? 1 : 0 },
    { type: T.WIND,           label: 'Wind Turbine',    dayGate: 96, pct: () => { const wPct = Math.min(1, PowerNetwork.stats.totalConsumed / 25); const dPct = Math.min(1, (DayNight.day() * 24 + DayNight.hour()) / 96); return wPct * 0.25 + dPct * 0.75; } },
    // Mirrors progression.js's actual check: 500 kW consumed AND a Research
    // Station MK2 physically placed. This used to report Research MK2 *unlock*
    // progress, which is a different thing entirely — the bar could sit at
    // 100% while the turbine stayed locked, or vice versa.
    { type: T.WIND2,          label: 'Wind Turbine MK2', pct: () => {
        const wPct = Math.min(1, PowerNetwork.stats.totalConsumed / 500);
        const rPct = EntityRegistry.getByType(T.RESEARCH2).size > 0 ? 1 : 0;
        return wPct * 0.5 + rPct * 0.5;
      } },
    { type: T.WIND3,          label: 'Wind Turbine MK3', pct: () => {
        const rPct = Progression.isUnlocked(T.RESEARCH3) ? 1 : 0;
        const wPct = Math.min(1, PowerNetwork.stats.totalConsumed / 2500);
        return rPct * 0.5 + wPct * 0.5;
      } },
    { type: T.SOLAR3,         label: 'Solar Array', pct: () => {
        const rPct = EntityRegistry.getByType(T.MK4RESEARCH).size > 0 ? 1 : 0;
        const nPct = Math.min(1, (EntityRegistry.getByType(T.SOLAR).size + EntityRegistry.getByType(T.SOLAR2).size) / SOLAR3_PANELS);
        return rPct * 0.5 + nPct * 0.5;
      } },
    { type: T.BATTERY,        label: 'Battery Block',   dayGate: 78, pct: () => { const wPct = Math.min(1, PowerNetwork.stats.totalGenerated / 50); const dPct = Math.min(1, (DayNight.day() * 24 + DayNight.hour()) / 78); return wPct * 0.25 + dPct * 0.75; } },
    { type: T.RESEARCH2,      label: 'Research MK2',    pct: () => CoalSystem.hasDeposits() ? 1 : 0 },
    { type: T.RESEARCH3,      label: 'Research MK3',    pct: () => Progression.progressFor(T.RESEARCH3) },
    { type: T.SOLAR2,         label: 'Solar MK2',       pct: () => Progression.progressFor(T.SOLAR2) },
    { type: T.SURVEY,         label: 'Survey Stn',      pct: () => Math.min(1, PowerNetwork.stats.totalConsumed / 200) },
    { type: T.SURVEY2,        label: 'Survey Stn MK2',  pct: () => Progression.progressFor(T.SURVEY2) },
    { type: T.COALMINE2,      label: 'Coal Mine MK2',   pct: () => { const rPct = Progression.isUnlocked(T.RESEARCH3) ? 1 : 0; const cPct = Math.min(1, (CoalSystem.getTotalMined?.() || 0) / COALMINE2_COAL_MINED); return rPct * 0.5 + cPct * 0.5; } },
    { type: T.COALGENERATOR,  label: 'Coal Generator',  pct: () => Progression.progressFor(T.COALGENERATOR) },
    { type: T.WATEREXTRACTOR, label: 'Water Extractor', pct: () => Progression.progressFor(T.WATEREXTRACTOR) },
    { type: T.POWERTOWER,          label: 'Wire MK2',        pct: () => Progression.checkPowerTowerReady() ? 1 : 0 },
    { type: T.BLUEPRINT,      label: 'Blueprints',      pct: () => EntityRegistry.getByType(T.RESEARCH3).size > 0 ? 1 : 0 },
    { type: T.DAM,             label: 'Dam',              pct: () => EntityRegistry.getByType(T.RESEARCH3).size > 0 ? 1 : 0 },
    { type: T.HYDROTURBINE,    label: 'Hydro Turbine',    pct: () => { const rPct = Progression.isUnlocked(T.RESEARCH3) ? 1 : 0; const dPct = (typeof ReservoirSystem !== 'undefined' && ReservoirSystem.hasDams()) ? 1 : 0; return rPct * 0.5 + dPct * 0.5; } },
    { type: T.SHAFT,           label: 'Drive Shaft',      pct: () => { const rPct = Progression.isUnlocked(T.RESEARCH3) ? 1 : 0; const runtime = (typeof ReservoirSystem !== 'undefined') ? ReservoirSystem.getTotalTurbineRuntime() : 0; const tPct = Math.min(1, runtime / (3 * 300)); return rPct * 0.5 + tPct * 0.5; } },
    { type: T.HYDROGENERATOR,  label: 'Hydro Generator',  pct: () => { const rPct = Progression.isUnlocked(T.RESEARCH3) ? 1 : 0; const runtime = (typeof ReservoirSystem !== 'undefined') ? ReservoirSystem.getTotalTurbineRuntime() : 0; const tPct = Math.min(1, runtime / (3 * 300)); return rPct * 0.5 + tPct * 0.5; } },
    { type: T.PUMPJACK,       label: 'Pump Jack',        pct: () => { const oPct = Progression.isUnlocked(T.OILSCAN) ? 1 : 0; const dPct = OilSystem.hasDeposits() ? 1 : 0; return oPct * 0.5 + dPct * 0.5; } },
    { type: T.PUMPJACK2,      label: 'Pump Jack MK2',    pct: () => Progression.progressFor(T.PUMPJACK2) },
    { type: T.SOLIDSTORAGE,   label: 'Storage Container', pct: () => Progression.progressFor(T.SOLIDSTORAGE) },
    { type: T.OILSTORAGE,     label: 'Liquid Storage Tank', pct: () => Math.min(1, OilSystem.getTotalCrude() / OILSTORAGE_CRUDE) },
    { type: T.REFINERY,       label: 'Oil Refinery',     pct: () => Math.min(1, OilSystem.getTotalCrude() / REFINERY_CRUDE) },
    { type: T.GOVERNOR,       label: 'Throttle Governor', pct: () => Progression.progressFor(T.GOVERNOR) },
    { type: T.CARBONCAPTURE,  label: 'Carbon Capture Plant', pct: () => Progression.progressFor(T.CARBONCAPTURE) },
    { type: T.FUELGEN,        label: 'Fuel Power Gen',   pct: () => { const rPct = Progression.isUnlocked(T.RESEARCH2) ? 1 : 0; const fPct = Math.min(1, (OilSystem.getTotalFuelOil?.() || 0) / 2000); return rPct * 0.5 + fPct * 0.5; } },
    { type: T.CHEMICALPLANT,  label: 'Chemical Plant',   pct: () => { const rPct = Progression.isUnlocked(T.RESEARCH3) ? 1 : 0; const sPct = Math.min(1, (SulfurSystem.getTotalMined?.() || 0) / 1000); return rPct * 0.5 + sPct * 0.5; } },
    { type: T.FUELPLANT,      label: 'Fuel Plant',        pct: () => Progression.progressFor(T.FUELPLANT) },
    { type: T.NUCLEARREACTOR, label: 'Nuclear Reactor',    pct: () => { const rPct = Progression.isUnlocked(T.RESEARCH3) ? 1 : 0; const fPct = Math.min(1, (typeof FuelPlantSystem !== 'undefined' ? FuelPlantSystem.getTotalRods?.() || 0 : 0) / 800); return rPct * 0.5 + fPct * 0.5; } },
    { type: T.COOLINGTOWER,   label: 'Cooling Tower',      pct: () => { const rPct = Progression.isUnlocked(T.RESEARCH3) ? 1 : 0; const nPct = EntityRegistry.getByType(T.NUCLEARREACTOR).size > 0 ? 1 : 0; return rPct * 0.5 + nPct * 0.5; } },
    { type: T.STEAMTURBINE,   label: 'Steam Turbine',      pct: () => Progression.progressFor(T.STEAMTURBINE) },
    { type: T.LITHIUMPROCESSPLANT, label: 'Lithium Processing Plant', pct: () => Progression.progressFor(T.LITHIUMPROCESSPLANT) },
    { type: T.MK4RESEARCH,    label: 'MK4 Research Stn',   pct: () => Progression.progressFor(T.MK4RESEARCH) },
    { type: T.SPENTFUELPOOL,  label: 'Spent Fuel Pool',    pct: () => Progression.progressFor(T.SPENTFUELPOOL) },
    { type: T.REPROCESSOR,    label: 'Reprocessing Plant', pct: () => Progression.progressFor(T.REPROCESSOR) },
    { type: T.MOXPLANT,       label: 'Adv. Fuel Processing', pct: () => Progression.progressFor(T.MOXPLANT) },
    { type: T.COOLINGTOWER2,  label: 'Cryogenic Cooling Tower', pct: () => Progression.progressFor(T.COOLINGTOWER2) },
    { type: T.ADVREACTOR,     label: 'Advanced Reactor',   pct: () => Progression.progressFor(T.ADVREACTOR) },
    { type: T.COKEOVEN,       label: 'Coke Oven Battery',  pct: () => Progression.progressFor(T.COKEOVEN) },
    { type: T.GRAPHITEFURNACE, label: 'Graphitization Furnace', pct: () => Progression.progressFor(T.GRAPHITEFURNACE) },
    { type: T.DRONEPORT,      label: 'Drone Port',         pct: () => Progression.progressFor(T.DRONEPORT) },
    { type: T.DRONECHARGER,   label: 'Drone Charging Port', pct: () => Progression.progressFor(T.DRONECHARGER) },
    { type: T.MK5RESEARCH,    label: 'MK5 Research Stn',   pct: () => Progression.progressFor(T.MK5RESEARCH) },
    { type: T.ELECTROLYZER,   label: 'Electrolyzer',       pct: () => Progression.progressFor(T.ELECTROLYZER) },
    { type: T.ATMOSCOLLECTOR, label: 'Atmosphere Collector', pct: () => Progression.progressFor(T.ATMOSCOLLECTOR) },
    { type: T.HABERBOSCH,     label: 'Haber-Bosch Complex', pct: () => Progression.progressFor(T.HABERBOSCH) },
    { type: T.WASHTOWER,      label: 'Isotopic Wash Tower', pct: () => Progression.progressFor(T.WASHTOWER) },
    { type: T.TRITIUMBREEDER, label: 'Tritium Breeding Facility', pct: () => Progression.progressFor(T.TRITIUMBREEDER) },
    { type: T.FUSIONFUELPLANT, label: 'Fusion Fuel Plant', pct: () => Progression.progressFor(T.FUSIONFUELPLANT) },
    { type: T.HELIUMSCAN,     label: 'Helium Scan',        pct: () => Progression.progressFor(T.HELIUMSCAN) },
    { type: T.HELIUMWELL,     label: 'Helium Well',        pct: () => Progression.progressFor(T.HELIUMWELL) },
    { type: T.CRYOPLANT,      label: 'Cryo Plant',         pct: () => Progression.progressFor(T.CRYOPLANT) },
    { type: T.GASSTORAGE,     label: 'Gas Holder',         pct: () => Progression.progressFor(T.GASSTORAGE) },
    { type: T.HULKINGFUSIONREACTOR, label: 'Fusion Reactor', pct: () => Progression.progressFor(T.HULKINGFUSIONREACTOR) },
    { type: T.STEAMTURBINE2,  label: 'Steam Turbine MK2',     pct: () => Progression.progressFor(T.STEAMTURBINE2) },
    { type: T.HE3SEPARATOR,   label: 'Helium-3 Separator',    pct: () => Progression.progressFor(T.HE3SEPARATOR) },
    { type: T.ADVFUSIONREACTOR, label: 'Advanced Fusion Reactor', pct: () => Progression.progressFor(T.ADVFUSIONREACTOR) },
    { type: T.MHDRING,        label: 'MHD Decelerator Ring',  pct: () => Progression.progressFor(T.MHDRING) },
    { type: T.HELIUMWELL2,    label: 'Helium Well MK2',       pct: () => Progression.progressFor(T.HELIUMWELL2) },
    { type: T.RAREEARTHSCAN,  label: 'Rare Earth Scan',       pct: () => Progression.progressFor(T.RAREEARTHSCAN) },
    { type: T.RAREEARTHMINE,  label: 'Rare Earth Mine',       pct: () => Progression.progressFor(T.RAREEARTHMINE) },
    { type: T.LEACHPLANT,     label: 'Leach Plant',           pct: () => Progression.progressFor(T.LEACHPLANT) },
    { type: T.SCMILL,         label: 'Superconductor Mill',   pct: () => Progression.progressFor(T.SCMILL) },
    { type: T.COREWORKS,      label: 'Core Works',            pct: () => Progression.progressFor(T.COREWORKS) },
    { type: T.LAMP,           label: 'Street Lamp',     pct: () => Math.min(1, HouseRequestSystem.getHousesAccepted() / 5) },
    { type: T.CAMERA,         label: 'Security Cam',    pct: () => Math.min(1, AmenityRequestSystem.getTotalFulfilled() / 5) },
    { type: T.EVCHARGER,      label: 'EV Charger',      pct: () => {
        const mk2Pct = Progression.isUnlocked(T.RESEARCH2) ? 1 : 0;
        let factoryPct = 0;
        for (const e of EntityRegistry.getByType(T.INDUSTRIAL)) {
          if (e.fromRequest && e.commercialSubtype === 'evfactory') { factoryPct = 1; break; }
        }
        return mk2Pct * 0.5 + factoryPct * 0.5;
      } },
  ];

  // Ranked by how close each unlock is, EXCEPT that entries gated on a
  // calendar day (`dayGate`, in absolute in-game hours) are ordered among
  // themselves by that day. Their pct blends the day gate with a secondary
  // requirement (watts consumed/generated), so a nearly-met secondary can
  // float a later unlock above an earlier one — Battery/Wind ahead of Solar,
  // which reads as wrong since Solar always becomes available first.
  const pending = NEXT_UNLOCKS.filter(u => !Progression.isUnlocked(u.type)).sort((a, b) => b.pct() - a.pct());
  const gatedSlots = [];
  const gated = [];
  pending.forEach((u, i) => { if (u.dayGate != null) { gatedSlots.push(i); gated.push(u); } });
  gated.sort((a, b) => a.dayGate - b.dayGate);
  gatedSlots.forEach((slot, i) => { pending[slot] = gated[i]; });
  const nextUnlocks = pending.slice(0, 3);

  // Remind player to place Research MK2 if unlocked but not placed
  const mk2Unlocked = Progression.isUnlocked(T.RESEARCH2);
  let mk2Placed = false;
  if (mk2Unlocked) {
    outer2: for (let r2 = 0; r2 < ROWS; r2++) for (let c2 = 0; c2 < COLS; c2++) {
      const e2 = GridManager.getEntity(c2, r2);
      if (e2 && e2.type === T.RESEARCH2) { mk2Placed = true; break outer2; }
    }
  }
  if (mk2Unlocked && !mk2Placed) {
    rows.push(div());
    rows.push(`<div class="pt-row"><span class="pt-label" style="color:#f0c040">Action Required</span></div>`);
    rows.push(row('Research MK2', val('Place it!', 'warn')));
  }

  if (nextUnlocks.length) {
    rows.push(div());
    rows.push(`<div class="pt-row"><span class="pt-label">Unlocks</span></div>`);
    nextUnlocks.forEach(u => {
      const p = u.pct();
      // Hovering a row spells out what the unlock actually needs, taken from
      // the same hint the Research Station shows — a bare percentage doesn't
      // say whether it wants watts, a day, a deposit, or a placed building.
      const hint = (typeof Progression.hintFor === 'function' && Progression.hintFor(u.type)) || '';
      const v = val(p >= 1 ? 'Ready!' : `${Math.round(p*100)}%`, p >= 1 ? 'good' : p > 0.7 ? 'warn' : 'dim');
      rows.push(hint
        ? `<div class="pt-row pt-unlock-row">${lbl(u.label)}${v}<span class="pt-hint">${esc(hint)}</span></div>`
        : row(u.label, v));
      rows.push(bar(p, p >= 1 ? '#40ff80' : '#6030a0'));
    });
  }

  // The tracker is rebuilt from scratch on every tick, and swapping innerHTML
  // replaces the very node the pointer is over — that killed :hover each
  // frame and made the unlock tooltips strobe. So skip writes that would
  // change nothing, and otherwise patch the existing nodes in place. (This
  // used to freeze the whole panel while the pointer was inside it instead,
  // which left every bar stuck for as long as the cursor rested there — all
  // the time, on a controller.) Only a change of layout rebuilds it.
  const html = rows.join('');
  _ptBindHover();
  if (html !== _ptLastHtml) {
    _ptLastHtml = html;
    const next = document.createElement('div');
    next.innerHTML = html;
    if (!_ptSync(body, next)) body.innerHTML = html;
  }
  _ptRefreshHint(panel, body);
}

// Make `cur` match `next` without replacing any node. False (having possibly
// patched some of it) as soon as the two differ in shape.
function _ptSync(cur, next) {
  const a = cur.childNodes, b = next.childNodes;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) return false;
    if (x.nodeType !== 1) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; continue; }
    if (x.attributes.length !== y.attributes.length) return false;
    for (const at of y.attributes) if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
    if (!_ptSync(x, y)) return false;
  }
  return true;
}

let _ptLastHtml    = null;
let _ptHoverBound  = false;

let _ptHintEl = null;
function _ptShowHint(panel, row, text) {
  if (!_ptHintEl) {
    _ptHintEl = document.createElement('div');
    _ptHintEl.id = 'pt-hint-float';
    document.body.appendChild(_ptHintEl);
  }
  const el = _ptHintEl;
  el.textContent = text;
  el.style.display = 'block';
  const p = panel.getBoundingClientRect(), r = row.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  // Left of the panel if there's room (it usually sits at the right edge),
  // otherwise to its right; vertically centred on the row, kept on screen.
  let x = p.left - w - 8;
  if (x < 8) x = Math.min(window.innerWidth - w - 8, p.right + 8);
  const y = Math.max(8, Math.min(window.innerHeight - h - 8, r.top + r.height / 2 - h / 2));
  el.style.left = `${x}px`; el.style.top = `${y}px`;
}
function _ptHideHint() { if (_ptHintEl) _ptHintEl.style.display = 'none'; }

// Last known pointer position (client px), or null once it has left the
// window. The controller's virtual cursor synthesises mousemove too, so this
// covers both.
let _ptPointer = null;

function _ptBindHover() {
  if (_ptHoverBound) return;
  _ptHoverBound = true;
  document.addEventListener('mousemove', ev => { _ptPointer = { x: ev.clientX, y: ev.clientY }; }, true);
  document.documentElement.addEventListener('mouseleave', () => { _ptPointer = null; });
}

// Unlock requirement tooltip. Shown beside the panel, level with the hovered
// row — drawn above the row inside the panel it sat on top of the rows above
// it and read as part of the list.
//
// Decided from where the pointer IS, every tick, rather than from mouseover:
// the panel is rebuilt whenever its layout changes (a status row swapping
// for a bar, the unlock order shifting), which replaces the hovered node,
// and a pointer at rest fires no new mouseover for the replacement — the
// tooltip went out and stayed out until the mouse moved again. A row also
// owns the progress bar under it, so there's no dead strip between rows.
function _ptRefreshHint(panel, body) {
  const p = _ptPointer;
  if (!p || !panel.contains(document.elementFromPoint(p.x, p.y))) { _ptHideHint(); return; }
  for (const row of body.querySelectorAll('.pt-unlock-row')) {
    const r = row.getBoundingClientRect();
    const barEl = row.nextElementSibling;
    const bottom = barEl && barEl.classList.contains('pt-bar-wrap')
      ? barEl.getBoundingClientRect().bottom + 3 : r.bottom;
    if (p.y >= r.top - 2 && p.y < bottom && p.x >= r.left && p.x <= r.right) {
      const src = row.querySelector('.pt-hint');
      if (src) { _ptShowHint(panel, row, src.textContent); return; }
    }
  }
  _ptHideHint();
}

function updateClock() {
  const canvas = document.getElementById('clock-face');
  const ctx = canvas.getContext('2d');

  const W = canvas.width;   // clock canvas is 44×44 as set in HTML
  const H = canvas.height;
  const cx = W / 2, cy = H / 2, R = W / 2 - 3;

  ctx.clearRect(0, 0, W, H);

  const dark  = DayNight.darkness();
  const hour  = DayNight.hour();
  const phase = hour / 24;   // 0–1

  // Colour palette: noon = warm gold, midnight = cool blue
  const dayCol   = { r:255, g:220, b:100 };
  const nightCol = { r: 80, g:130, b:220 };
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const faceAccent = `rgb(${lerp(dayCol.r,nightCol.r,dark)},${lerp(dayCol.g,nightCol.g,dark)},${lerp(dayCol.b,nightCol.b,dark)})`;

  // ── Outer ring ─────────────────────────────────────────────────
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = '#1e2a38';
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  // ── Progress arc (shows day progress, clockwise from top) ──────
  const startAngle = -Math.PI / 2;
  const endAngle   = startAngle + phase * Math.PI * 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R, startAngle, endAngle);
  ctx.strokeStyle = faceAccent;
  ctx.lineWidth   = 2.5;
  ctx.lineCap     = 'round';
  ctx.stroke();

  // ── Hour tick marks ────────────────────────────────────────────
  for (let i = 0; i < 12; i++) {
    const a   = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const len = i % 3 === 0 ? 5 : 3;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (R - 1),       cy + Math.sin(a) * (R - 1));
    ctx.lineTo(cx + Math.cos(a) * (R - 1 - len), cy + Math.sin(a) * (R - 1 - len));
    ctx.strokeStyle = '#2a3a4a';
    ctx.lineWidth   = 1;
    ctx.stroke();
  }

  // ── Sun / moon icon at current position ────────────────────────
  const handAngle = startAngle + phase * Math.PI * 2;
  const iconR     = R - 7;
  const ix        = cx + Math.cos(handAngle) * iconR;
  const iy        = cy + Math.sin(handAngle) * iconR;
  const isSun     = hour >= 5 && hour < 19;

  ctx.beginPath();
  ctx.arc(ix, iy, isSun ? 4 : 3.5, 0, Math.PI * 2);
  ctx.fillStyle = faceAccent;
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Moon crescent detail
  if (!isSun) {
    ctx.beginPath();
    ctx.arc(ix + 1.5, iy - 1, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#1a2535';
    ctx.fill();
  }

  // ── Centre dot ────────────────────────────────────────────────
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#2a3a4a';
  ctx.fill();

  // ── Update text labels ─────────────────────────────────────────
  {
    const lbl = document.getElementById('clock-label');
    const season = Seasons.enabled() ? `${Seasons.icon()} ${Seasons.name().toUpperCase()} · ` : '';
    lbl.textContent = `${season}DAY ${DayNight.day()} · ${DayNight.phaseName()}`;
    lbl.title = Seasons.enabled()
      ? `${Seasons.name()}, day ${Seasons.dayOfSeason()} of ${Seasons.SEASON_DAYS}. ${Seasons.nextName()} in ${Seasons.daysToNext()} day${Seasons.daysToNext() === 1 ? '' : 's'}.`
      : '';
  }
  document.getElementById('clock-time').textContent  = DayNight.timeString();
  // Heat-wave tag under the time: there for as long as the event is, so the
  // reason for the amber light (and the short-ranged drones) is on the HUD.
  const heatEl = document.getElementById('clock-heat');
  if (heatEl) {
    const ev = typeof WeatherEventSystem !== 'undefined' ? WeatherEventSystem.getActiveEvent() : null;
    const hot = !!ev && ev.type === 'heatwave';
    if (heatEl._hot !== hot) { heatEl._hot = hot; heatEl.style.display = hot ? '' : 'none'; }
  }
}

