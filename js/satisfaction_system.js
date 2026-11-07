/* ═══════════════════════════════════════════════════════════════════
   SATISFACTION SYSTEM
   Each customer (house/commercial) has a satisfaction score 0-100%.
   Powered amenities within range boost it toward a target.
   Without any amenities nearby, satisfaction drifts toward 70%.
   Income = dailyFee × (reliability/100) × satisfactionFactor.
   ═══════════════════════════════════════════════════════════════════ */
const SatisfactionSystem = (() => {
  const AMENITY_TYPES = [T.LAMP, T.CAMERA, T.EVCHARGER, T.CELLTOWER];
  const BASE_SATISFACTION = 70;   // natural baseline without any amenities
  const RADIO_SILENCE_PTS = 6;    // off every customer's target while a radio station is blacked out
  const RADIO_GRACE_SECS  = 300;  // the same real-time grace a new customer gets before any drain (GRACE_REAL_SECS below)
  // Off every customer's target by fallout stage (none, residual, hazardous,
  // highly contaminated), and more again on contaminated ground itself.
  // City-wide it leaves the comfortable well short of their usual but sends
  // the already-unhappy over the churn line; on contaminated ground nearly
  // everyone goes. (45 city-wide had 90% of a test city threatening to leave.)
  const FALLOUT_FEAR   = [0, 6, 16, 26];
  const FALLOUT_ONSITE = [0, 25, 40, 55];

  const CHURN_THRESHOLD   = 30;  // satisfaction below this triggers timer
  const CHURN_WARN_HOURS  = 2;   // warn after 2 in-game hours in danger zone: six hours' notice before they go
  const CHURN_LEAVE_HOURS = 8;   // leave after 8 in-game hours in danger zone
  // Any property left without power this long gives up and goes, whatever its
  // satisfaction: homes, businesses and industry alike (industry has no
  // satisfaction, so until this it could sit dark for ever). One unbroken
  // outage: the clock starts again the moment the lights come back.
  const OUTAGE_LEAVE_HOURS = 5;
  const OUTAGE_WARN_HOURS  = 1;  // on the "threatening to leave" card after an hour dark
  const GRACE_REAL_SECS    = 300;  // 5 real-minutes after moving in before ANY churn or drain can start

  // Tiles between two footprints' nearest edges (0 when they touch or
  // overlap). Same as the plain anchor distance for two 1×1 entities.
  function footprintDist(a, b) {
    const dx = Math.max(0, a.col - (b.col + (b.width || 1) - 1), b.col - (a.col + (a.width || 1) - 1));
    const dy = Math.max(0, a.row - (b.row + (b.height || 1) - 1), b.row - (a.row + (a.height || 1) - 1));
    return Math.sqrt(dx * dx + dy * dy);
  }

  // e._satCauses: what is holding this customer's satisfaction down, biggest
  // first — { label, pts } where pts is points off its target (null for
  // causes that drain rather than cap, e.g. a blackout or an ignored request).
  function causeText(e) {
    const c = e._satCauses;
    if (!c || !c.length) return 'Still recovering';
    return c.map(x => x.pts ? `${x.label} −${x.pts}` : x.label).join(' · ');
  }

  function churnHoursLeft(e) {
    return Math.max(0, (CHURN_LEAVE_HOURS * DayNight.secondsPerGameHour() - (e._churnTimer || 0)) / DayNight.secondsPerGameHour());
  }
  function outageHoursLeft(e) {
    return Math.max(0, (OUTAGE_LEAVE_HOURS * DayNight.secondsPerGameHour() - (e._outageTimer || 0)) / DayNight.secondsPerGameHour());
  }
  // Whichever clock runs out first.
  function hoursUntilGone(e) {
    return Math.min(e._churnWarned ? churnHoursLeft(e) : Infinity, e._outageWarned ? outageHoursLeft(e) : Infinity);
  }

  // The outage clock for one customer (game seconds, so hours are hours at
  // any speed). Returns true if it has just left. Not during the move-in
  // grace: a new customer is dark until the player has wired it up.
  function tickOutage(e, dt, inGrace) {
    if (e.powered || inGrace || e._irreparable) {   // a nuclear ruin is a wreck, not a customer waiting
      if (e._outageTimer) { e._outageTimer = 0; e._outageWarned = false; }
      return false;
    }
    // A repair crew is on site (a lightning or fire strike being fixed): the
    // customer can see help is on the way, so the clock holds where it is and
    // no threat is made. It runs on if the building is still dark afterwards.
    if (beingRepaired(e)) { e._outageWarned = false; return false; }
    e._outageTimer = (e._outageTimer || 0) + dt;
    const hour = DayNight.secondsPerGameHour();
    if (e._outageTimer >= OUTAGE_WARN_HOURS * hour) e._outageWarned = true;
    if (e._outageTimer < OUTAGE_LEAVE_HOURS * hour) return false;
    const name = e.businessName || e.def?.label || 'A customer';
    GridManager.removeEntityFootprint(e);
    HouseRequestSystem.onCustomerLeft(e);
    showToast(`✗ ${name} left after ${OUTAGE_LEAVE_HOURS} hours without power`, '#ff4040', '#180000', '#601010');
    try { SFX.customerLeft?.(); } catch (_e) {}
    return true;
  }

  function beingRepaired(e) {
    return typeof LightningDamageSystem !== 'undefined' && !!LightningDamageSystem.isRepairing?.(e);
  }

  function jumpTo(e) {
    Camera.recentreOn((e.col + (e.width || 1) * 0.5) * TILE, (e.row + (e.height || 1) * 0.5) * TILE);
    if (typeof EntityInfoPanel !== 'undefined') EntityInfoPanel.open(e);
    SFX.click?.();
  }

  // Cache amenity positions each tick for O(1) lookup
  let amenityCache = [];

  function rebuildCache() {
    amenityCache = [];
    for (const t of AMENITY_TYPES) {
      for (const e of EntityRegistry.getByType(t)) amenityCache.push(e);
    }
  }

  // One notification for every customer threatening to leave, carrying the
  // count, rather than a toast per building. Counted fresh from the registry
  // each tick, so a building that recovers, leaves, is demolished or comes
  // back from a save all fall out naturally (see NotificationStack.syncGroup).
  function syncChurnNotice() {
    if (typeof NotificationStack === 'undefined') return;
    const warned = [];
    for (const t of [T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL]) {
      for (const e of EntityRegistry.getByType(t)) if (e._churnWarned || e._outageWarned) warned.push(e);
    }
    // Soonest to leave first. Each row names the property, its time left and
    // why it's unhappy; clicking a row jumps to it.
    warned.sort((a, b) => hoursUntilGone(a) - hoursUntilGone(b));
    NotificationStack.syncGroup('churn-warning', warned, n => ({
      icon: '⚠',
      title: n === 1 ? '1 property is threatening to leave' : `${n} properties are threatening to leave`,
      message: 'Too long without power, or satisfaction too low. Click to see which and why',
      color: '#ff8040', border: '#804020', glow: true,
      details: () => warned.map(e => ({
        key: e.id ?? `${e.col},${e.row}`,
        label: e.businessName || e.def?.label || 'Property',
        meta: `leaves in ${hoursUntilGone(e).toFixed(1)}h` + (e.type === T.INDUSTRIAL ? '' : ` · ${Math.round(e.satisfaction)}%`),
        cause: e._outageWarned ? `No power: leaves after ${OUTAGE_LEAVE_HOURS} hours dark` : causeText(e),
        onClick: () => jumpTo(e),
      })),
    }));
  }

  // One card for every amenity sitting without power: street lamps, cameras,
  // EV chargers, cell towers, fibre hubs and the parks that need a supply.
  // An unpowered amenity gives no satisfaction boost and earns nothing, and
  // nothing else says so. Each has to be dark for AMENITY_DARK_SECS first, so
  // one that was only just placed (or a save that has only just loaded)
  // isn't flagged before it can be wired up.
  const AMENITY_DARK_SECS = 20;
  function _noticeTypes() {
    const types = [T.LAMP, T.CAMERA, T.EVCHARGER, T.CELLTOWER, T.FIBERHUB];
    if (typeof POWERED_PARK_TYPES !== 'undefined') types.push(...POWERED_PARK_TYPES);
    return types.filter(t => t !== undefined);
  }
  function syncAmenityNotice(dt) {
    if (typeof NotificationStack === 'undefined') return;
    const dark = [];
    for (const t of _noticeTypes()) for (const e of EntityRegistry.getByType(t)) {
      if (e.powered) { e._amenityDark = 0; continue; }
      e._amenityDark = (e._amenityDark || 0) + dt;
      if (e._amenityDark >= AMENITY_DARK_SECS) dark.push(e);
    }
    NotificationStack.syncGroup('amenity-unpowered', dark, n => ({
      icon: '💡',
      title: n === 1 ? '1 amenity has no power' : `${n} amenities have no power`,
      message: 'They give no satisfaction boost or income until they are powered. Click to see which',
      color: '#ffc040', border: '#705010',
      details: () => dark.map(e => ({
        key: e.id ?? `${e.col},${e.row}`,
        label: (e.def?.label || EntityDefs[e.type]?.label || 'Amenity') + (e._num !== undefined ? ` #${e._num}` : ''),
        meta: 'no power',
        cause: e._lightningDamaged ? 'Damaged by lightning; repair it'
             : e._insufficient ? 'Its network is short of power'
             : 'Not connected to a powered network',
        onClick: () => jumpTo(e),
      })),
    }));
  }

  return {
    // dt in real seconds
    tick(dt) {
      rebuildCache();
      // Runs after the loop below — whose grace-period `continue`s would
      // skip anything placed at the end of its body.
      try { this._tickCustomers(dt); } finally { syncChurnNotice(); syncAmenityNotice(dt); }
    },

    _tickCustomers(dt) {

      // Local radio: a station that's blacked out (past its own grace period,
      // and not simply knocked out by lightning) is heard to go quiet by the
      // whole town, so every powered customer's satisfaction target drops
      // while it lasts. One notice per outage, cleared when it's back.
      let radioDark = 0;
      for (const rs of EntityRegistry.getByType(T.COMMERCIAL)) {
        if (rs.commercialSubtype !== 'radio') continue;
        const tag = `radio-offair-${rs.col}-${rs.row}`;
        const dark = !rs.powered && (rs._graceElapsed || 0) >= RADIO_GRACE_SECS && !rs._lightningDamaged;
        if (dark) {
          radioDark++;
          if (!rs._offAirNotified && typeof NotificationStack !== 'undefined') {
            rs._offAirNotified = true;
            NotificationStack.push({
              icon: '📻', title: `${rs.businessName || 'The radio station'} is off the air`,
              message: `The whole town hears it go quiet: satisfaction is down ${RADIO_SILENCE_PTS} points everywhere until it has power again. Click to jump there`,
              color: '#ffb040', border: '#a05010', tag, onClick: () => jumpTo(rs),
            });
          }
        } else if (rs.powered && rs._offAirNotified) {
          rs._offAirNotified = false;
          if (typeof NotificationStack !== 'undefined') NotificationStack.dismissTag(tag);
        }
      }
      const radioPenalty = radioDark ? RADIO_SILENCE_PTS : 0;
      // Nuclear fallout: the whole city is frightened while a blast zone is
      // live, and anyone living or trading on contaminated ground far more,
      // enough that many start threatening to leave; it eases as the zone
      // decays.
      const LDS = typeof LightningDamageSystem !== 'undefined' && LightningDamageSystem.falloutLevel ? LightningDamageSystem : null;
      const falloutLvl = LDS ? LDS.falloutLevel() : 0;
      const falloutFear = FALLOUT_FEAR[falloutLvl];

      for (const custType of [T.HOUSE, T.COMMERCIAL]) {
        for (const e of EntityRegistry.getByType(custType)) {
          // Nobody lives there yet: nothing to drain, and the move-in grace
          // starts when the crew finishes (construction_system.js).
          if (e._constructing) { e._satCauses = [{ label: 'Under construction', pts: null, w: 1e9 }]; continue; }
          // c/r kept as local aliases so the distance/rect math below is unchanged
          const c = e.col, r = e.row;

          // Sum satisfaction boosts from nearby powered amenities
          let boost = 0;
          for (const am of amenityCache) {
            if (!am.powered) continue;
        // Lamps only count when they're actually lit
            // Measured edge to edge, so a multi-tile amenity (the 5×4 EV
            // forecourt) covers a ring round its whole footprint, and a big
            // customer (an 11×9 stadium) is covered by an amenity near any
            // part of it, not just its top-left corner.
            if (footprintDist(am, e) <= am.def.amenityRange) boost += am.def.satisfBoost;
          }

          // Lamp: speeds up recovery
          let lampMult = 1;
          for (const am of amenityCache) {
            if (am.type !== T.LAMP || !am.powered) continue;
            if (footprintDist(am, e) <= am.def.amenityRange) { lampMult = am.def.recoveryMultiplier || 3; break; }
          }

          // Park bonus: faster recovery + slower blackout drain for houses
          // in a residential zone with active parks
          let parkRecoveryMult = 1, parkDrainMult = 1;
          if (e.type === T.HOUSE) {
            const resRects = ZoneSystem.getZoneRects?.('residential') || [];
            for (let zi = 0; zi < resRects.length; zi++) {
              const rect = resRects[zi];
              if (c >= rect.minC && c <= rect.maxC && r >= rect.minR && r <= rect.maxR) {
                const bonus = ParkRequestSystem.getZoneBonus(zi);
                parkRecoveryMult = bonus.recoveryMult;
                parkDrainMult = 1 / bonus.churnBufferMult; // higher buffer = slower drain
                break;
              }
            }
          }

          // Drain satisfaction during blackout — but never during grace period
          const realDt = dt / (DevMode.timeScale || 1);  // real-time seconds, unaffected by FF
          // _graceElapsed: real-seconds since placement (independent of _placedAt timestamp).
          if (e._graceElapsed === undefined) e._graceElapsed = 0;
          e._graceElapsed += realDt;
          const inGrace = e._graceElapsed < GRACE_REAL_SECS;

          // Repeated-outage "grudge" — each fresh blackout (power→no-power edge)
          // adds to a slowly-decaying incident count. Customers who keep getting
          // dropped drain faster and can't fully trust the grid again (lower
          // recovery ceiling) even after power is restored, instead of forgetting
          // the last outage the moment the lights come back on.
          if (e._blackoutIncidents === undefined) e._blackoutIncidents = 0;
          if (e._wasPowered === undefined) e._wasPowered = e.powered;
          if (!e.powered && e._wasPowered && !inGrace) {
            e._blackoutIncidents = Math.min(6, e._blackoutIncidents + 1);
          }
          e._wasPowered = e.powered;
          if (e._blackoutIncidents > 0 && e.powered) {
            const INCIDENT_FORGIVE_SECS = 240; // real seconds of clean power to forgive one incident
            e._incidentDecayTimer = (e._incidentDecayTimer || 0) + realDt;
            if (e._incidentDecayTimer >= INCIDENT_FORGIVE_SECS) {
              e._incidentDecayTimer -= INCIDENT_FORGIVE_SECS;
              e._blackoutIncidents -= 1;
            }
          }

          // What's holding satisfaction down, for the churn card and info panel.
          const causes = [];
          if (!e.powered) causes.push({ label: 'Blackout', pts: null, w: 1e9 });
          if (e._reqDrain && e._reqDrain.left > 0) {
            causes.push({ label: `Waiting for ${e._reqDrain.what}`, pts: null, w: 1e8 });
            e._reqDrain.left--;   // drain systems refresh this every tick they drain
          }

          if (!e.powered && !inGrace) {
            const grudgeDrainMult = 1 + 0.25 * e._blackoutIncidents;  // repeat outages sting more
            e.satisfaction = Math.max(0, e.satisfaction - realDt * 1 * parkDrainMult * grudgeDrainMult);  // -1/s real time during blackout, worse with history
          } else if (e.powered) {
            const pollutionPenalty = (typeof PollutionSystem !== 'undefined') ? PollutionSystem.exposureFor(e) : 0;
            const grudgeCeiling = 4 * e._blackoutIncidents;  // repeated incidents cap how high trust can climb
            // Homes with a view — high ground, or looking down on water (terrain_system.js).
            const viewBonus = e.type === T.HOUSE ? TerrainSystem.viewFor(e).pts : 0;
            const onSite = falloutLvl ? LDS.contaminationAt(e.col, e.row, e.width || 1, e.height || 1).level : 0;
            const falloutPenalty = falloutFear + FALLOUT_ONSITE[onSite];
            const target = Math.max(0, Math.min(100, BASE_SATISFACTION + boost + viewBonus - pollutionPenalty - grudgeCeiling - radioPenalty - falloutPenalty));
            if (falloutPenalty) causes.push({ label: onSite ? 'Living on contaminated ground' : 'Nuclear fallout fears', pts: falloutPenalty, w: falloutPenalty });
            const smog = Math.round(typeof PollutionSystem !== 'undefined' ? PollutionSystem.localExposureFor(e) : 0);
            const cityAir = Math.round(pollutionPenalty) - smog;
            if (smog >= 1)    causes.push({ label: 'Smog', pts: smog, w: smog });
            if (cityAir >= 1) causes.push({ label: 'City emissions', pts: cityAir, w: cityAir });
            if (grudgeCeiling) causes.push({ label: 'Outage history', pts: grudgeCeiling, w: grudgeCeiling });
            if (radioPenalty) causes.push({ label: 'Radio station off the air', pts: radioPenalty, w: radioPenalty });
            // Same outage-memory throttle as reliability (economy.js) — a long
            // recent blackout (high e.blackoutSeconds) suppresses recovery speed
            // for a stretch proportional to the outage length, rather than
            // letting satisfaction snap back to target the moment power returns.
            const OUTAGE_RECOVERY_MEMORY = 25; // seconds — lower = harsher/longer penalty
            const outageThrottle = 1 / (1 + (e.blackoutSeconds || 0) / OUTAGE_RECOVERY_MEMORY);
            const speed = (e.satisfaction < target ? 2 * lampMult : 1) * parkRecoveryMult * outageThrottle;
            e.satisfaction += (target - e.satisfaction) * Math.min(1, dt * speed * 0.15);
            if (outageThrottle < 0.5 && e.satisfaction < target) causes.push({ label: 'Slow to forgive a long outage', pts: null, w: 0.5 });
          }
          if (boost === 0) causes.push({ label: 'No amenities nearby', pts: null, w: 0 });
          causes.sort((a, b) => b.w - a.w);
          e._satCauses = causes;
          e.satisfaction = Math.max(0, Math.min(100, e.satisfaction));

          // ── Churn ──────────────────────────────────────────────────
          // Customer leaves if satisfaction stays critically low too long.
          // Hard minimum: cannot leave until 8 in-game hours have elapsed
          // since placement (measured in game-time seconds).
          if (e._placedAt === undefined) e._placedAt = 0;
          e._placedAt += realDt;  // kept for zone-anchor ordering; NOT used for grace gate

          if (inGrace) continue;  // still in grace period — no churn at all

          if (tickOutage(e, dt, false)) continue;   // five hours dark: gone

          const CHURN_WARN_AT  = CHURN_WARN_HOURS  * DayNight.secondsPerGameHour();
          const CHURN_LEAVE_AT = CHURN_LEAVE_HOURS * DayNight.secondsPerGameHour();

          if (beingRepaired(e)) {
            // Crew on site: the low-satisfaction clock holds too, unwarned.
            e._churnWarned = false;
          } else if (e.satisfaction < CHURN_THRESHOLD) {
            if (e._churnTimer === undefined) e._churnTimer = 0;
            // Low reliability accelerates churn
            e._churnTimer += dt;  // game time — scales with FF so hours are hours

            // Flagged here; the single "threatening to leave" notification
            // and the world-map flashing both read _churnWarned.
            if (e._churnTimer >= CHURN_WARN_AT && !e._churnWarned) e._churnWarned = true;

            if (e._churnTimer >= CHURN_LEAVE_AT) {
              // Customer leaves — remove entity and update counters
              const name = e.businessName || e.def?.label || 'A customer';
              GridManager.removeEntityFootprint(e);
              HouseRequestSystem.onCustomerLeft(e);
              showToast(`✗ ${name} disconnected from your grid`, '#ff4040', '#180000', '#601010');
              try { SFX.customerLeft?.(); } catch (_e) {}
            }
          } else {
            // Satisfaction recovered — reset churn timer
            if (e._churnTimer > 0) {
              e._churnTimer  = 0;
              e._churnWarned = false;
            }
          }
        }
      }

      // Industry has no satisfaction to track, only the outage clock (with
      // the same move-in grace as everyone else).
      const realDt = dt / (DevMode.timeScale || 1);
      for (const e of EntityRegistry.getByType(T.INDUSTRIAL)) {
        if (e._constructing) continue;
        e._graceElapsed = (e._graceElapsed || 0) + realDt;
        tickOutage(e, dt, e._graceElapsed < GRACE_REAL_SECS);
      }
    },

    causeText,
    churnHoursLeft,
    outageHoursLeft,

    // 0.5–1.0 multiplier: full amenities = 1.0, zero amenities = 0.65
    factor(entity) {
      return 0.65 + 0.35 * (entity.satisfaction / 100);
    },

    averageSatisfaction() {
      let sum = 0, count = 0;
      for (const t of [T.HOUSE, T.COMMERCIAL]) {
        for (const e of EntityRegistry.getByType(t)) { sum += e.satisfaction; count++; }
      }
      return count ? sum / count : 0;
    },
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   EVENT SYSTEM
   Random grid events that create short-term management challenges.
   ═══════════════════════════════════════════════════════════════════ */
// ═══════════════════════════════════════════════════════════════════
// RAIN SYSTEM — visual raindrop rendering
// ═══════════════════════════════════════════════════════════════════
