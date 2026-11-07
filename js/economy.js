/* ═══════════════════════════════════════════════════════════════════
   ECONOMY
   Player balance, income tracking, and customer disconnection.
   ═══════════════════════════════════════════════════════════════════ */

// The Stadium's event-night lineup — rotates in order, one event per match
// night (every 3rd day; see the stadium block in Economy.tick). Global
// (not inside the Economy closure) so _renderStadium can read the label for
// the marquee/notification text without duplicating the list.
const STADIUM_EVENTS = [
  { type: 'match',     icon: '🏟️', label: 'match',        marquee: 'MATCH NIGHT',
    message: 'Floodlights on at 18:00' },
  { type: 'concert',   icon: '🎤', label: 'concert',       marquee: 'CONCERT NIGHT',
    message: 'Stage lighting on at 18:00' },
  { type: 'wrestling', icon: '🤼', label: 'wrestling event', marquee: 'WRESTLING NIGHT',
    message: 'Ring lights on at 18:00' },
];

const Economy = (() => {
  let _econTypes = null;   // entity types the per-tick income/upkeep pass visits (see tick)
  let _econSimple = null;  // of those, the types that only ever pay upkeep (see tick)
  let balance    = 20000;   // starting funds (a save overwrites this on load)
  let income     = 0;
  let upkeep     = 0;
  let carbonTax  = 0;    // $/s, already included in upkeep
  let netExMeridian = 0;    // $/s, last tick's net income without Hyperion's export pay
  let debtTimer  = 0;    // seconds in debt
  const DEBT_GRACE = 300; // seconds before disconnection

  // The income breakdown's lines, written by tick() as it adds the money up,
  // so the panel shows exactly what is banked rather than its own guess at
  // it. Kept only while someone is reading it (wantLedger, renewed by the
  // open panel), as it costs a map lookup per paying entity per tick.
  // Map of `type|label` -> { type, label, count, income, upkeep }, raw (before
  // the difficulty multiplier and any upkeep perk, held alongside).
  let _ledgerUntil = 0, _ledger = null, _ledgerMeta = null;
  const _CUSTOMER = (e) => e.type === T.HOUSE || e.type === T.COMMERCIAL || e.type === T.INDUSTRIAL;
  function _note(rec, e, inc, upk) {
    const label = (_CUSTOMER(e) && e.businessName) || e.def?.label || EntityDefs[e.type]?.label || e.type;
    const key = e.type + '|' + label;
    let r = rec.get(key);
    if (!r) rec.set(key, r = { type: e.type, label, count: 0, income: 0, upkeep: 0 });
    r.count++; r.income += inc; r.upkeep += upk;
  }

  /* ── Outage balance ─────────────────────────────────────────────────
     Two dials decide what a blackout costs you, and they deliberately
     pull in opposite directions:

       OUTAGE PAY  — what a building still pays while it sits dark.
                     Falls fast, all the way to nothing.
       RELIABILITY — what a building pays once power is back.
                     Decays slowly, recovers briskly.

     The outage is the punishment. The recovery is not. Previously this
     was backwards: a dark building kept paying 95% while reliability
     quietly fell 100→0 in twenty seconds, so the real bill only landed
     AFTER the player had already fixed the problem. Now the bleed is
     immediate, visible, and scales with how long the lights stay off —
     and restoring power actually feels like a fix.
     ──────────────────────────────────────────────────────────────── */
  // Outage pay starts at the FULL fee and slides from there. It used to open
  // at 60%, which meant the instant the grid dropped you lost 40% of gross
  // income in a single frame — on a 1,750/s grid running ~1,600/s of upkeep
  // that flipped net from +150/s to roughly -550/s before the player could
  // even see what had failed. The cliff was the problem, not the slide.
  const OUTAGE_PAY_START     = 100;  // % of fee still paid the moment the lights go out
  // Percentage points of the fee lost per IN-GAME hour of darkness. Deliberately
  // shallow: at 33 the slide was still steep enough to flip a healthy grid
  // negative inside a minute, so it was cut by a factor of ten.
  const OUTAGE_PAY_DROP_PER_H = 3.33;
  // Pay is allowed to go negative — a building dark long enough costs you
  // money rather than merely stopping paying — but not without limit. At the
  // floor a customer bills you its full fee back each second.
  const OUTAGE_PAY_FLOOR     = -100;
  // Fraction of the above loss that's actually applied. Outages were still
  // bleeding money too hard, so the whole curve was cut by 60%: the slide is
  // 1.33 pts/hour instead of 3.33, and the floor is +20% of the fee instead
  // of -100% — a dark building now just pays less, it never bills you.
  const OUTAGE_LOSS_SCALE    = 0.4;
  const RELIABILITY_DECAY       = 1.2; // pts/sec lost while dark, with storage on the grid
  const RELIABILITY_DECAY_NOSUB = 2.0; // pts/sec lost while dark, with no substation anywhere
  // Recovery was 3 pts/s throttled over a 60s memory, which left income
  // crawling for minutes after a long outage was already fixed. 4× the base
  // rate and a 4× gentler throttle: a 1-minute outage earns full pay again in
  // ~8s, a 5-minute one in ~15s, even a 25-minute one in about a minute.
  const RELIABILITY_RECOVERY    = 12;  // pts/sec regained once power is restored
  const RECOVERY_MEMORY         = 240; // sec of recent outage that still throttles recovery
  const SEMIFAB_BATCH_FINE      = 20000; // one-off cost when a running Semiconductor Fab loses power
  const AI_RUN_FINE             = 60000; // one-off cost when a running AI Computing Center loses power
  const AQUARIUM_STOCK_FINE     = 15000; // one-off cost when a running Aquarium loses life support
  // Property pop-ups (lost batches, event nights) are for the home city only;
  // a contract site's customers still pay and fine, they just don't announce it.
  const _propertyNotices = () => typeof NotificationStack !== 'undefined' &&
    !(typeof ContractSystem !== 'undefined' && ContractSystem.isAway());

  // Single source of truth for outage pay. The entity info panel reads
  // this too, so the percentage on the tooltip is the percentage actually
  // being banked — those two had drifted apart (panel said 50/-5, economy
  // paid 95/-3) and the panel was lying about the loss.
  // Continuous rather than stepped per game-hour: the player should watch
  // the number slide, not sit flat for an hour and then jolt. The RATE is
  // expressed per in-game hour so it tracks the clock the player is watching
  // rather than wall-clock seconds.
  function outagePayPct(blackoutSeconds) {
    const secPerHour = (typeof DayNight !== 'undefined' && DayNight.secondsPerGameHour)
      ? DayNight.secondsPerGameHour() : 50;
    const hours = Math.max(0, blackoutSeconds || 0) / secPerHour;
    const raw = Math.max(OUTAGE_PAY_FLOOR, OUTAGE_PAY_START - OUTAGE_PAY_DROP_PER_H * hours);
    // Scale the LOSS (not the pay) so every moment of an outage costs the
    // same fraction less — the slide and the floor both soften together.
    return OUTAGE_PAY_START - (OUTAGE_PAY_START - raw) * OUTAGE_LOSS_SCALE;
  }

  return {
    get balance() { return balance; },
    get income()  { return income;  },

    // Called each game tick; dt in seconds
    tick(dt) {
      income = 0;
      upkeep = 0;
      let meridianPay = 0;   // Hyperion Station's export pay, kept out of netExMeridian
      const rec = performance.now() < _ledgerUntil ? new Map() : null;

      // These used to be recomputed via a full ROWS×COLS grid scan for
      // EVERY unpowered customer, every tick — i.e. up to 2 extra 364,000-
      // tile scans per unpowered building per tick. Substation existence
      // and camera positions don't depend on which customer we're looking
      // at, so compute them once per tick instead.
      const hasAnySubstation = EntityRegistry.getByType(T.SUBSTATION).size > 0
                             || EntityRegistry.getByType(T.SUBSTATION2).size > 0
                             || EntityRegistry.getByType(T.SUBSTATION3).size > 0
                             || EntityRegistry.getByType(T.SUBSTATION4).size > 0
                             || EntityRegistry.getByType(T.SUBSTATION5).size > 0;
      const poweredCameras = [];
      for (const cam of EntityRegistry.getByType(T.CAMERA)) if (cam.powered) poweredCameras.push(cam);

      // Hoisted once per tick (was previously rebuilt inside the loop, but
      // that code was also unreachable — see below).
      const _GOV_BLDGS = new Set([T.TOWNHALL, T.CIVICCENTER, T.COURTHOUSE, T.EMS, T.HOSPITAL, T.UNIVERSITY, T.TRANSPORTHUB, T.NATIONALGOV, T.FUSIONLAB, T.AIRPORT, T.MILITARYBASE, T.LAUNCHCOMPLEX, T.NATIONALGRID, T.COMPANYHQ]);

      // Water, trees and bushes are ~80% of the registry and have no upkeep
      // and no income, so none of the branches below can touch them: visit
      // only the other types instead of every tile of scenery each tick.
      if (!_econTypes) _econTypes = Object.values(T).filter(v => v !== T.WATER && v !== T.TREE && v !== T.BUSH);
      // Wires, pipes, belts, poles and plant are most of what is left, and
      // the only branch below that can apply to them is upkeep: they earn
      // nothing, are not customers, and have no subtype. Those types skip the
      // rest of the loop body (same order of addition, so the same total).
      if (!_econSimple) {
        const full = new Set([T.CELLTOWER, T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL,
          T.SPLASHPAD, T.BASEBALLFIELD, T.COMMUNITYCENTER, T.GREENHOUSE, T.CORNERSTORE, ..._GOV_BLDGS]);
        _econSimple = new Set(_econTypes.filter(v => !full.has(v)));
      }
      for (const _econType of _econTypes) {
        if (_econSimple.has(_econType)) {
          // Negative upkeep is income (a street lamp, a camera, a Fiber Hub).
          // Something that has to be plugged in earns it only while it has
          // power: these used to pay dark or lit, though their own panels
          // read $0/s unpowered. Parks that draw nothing always pay.
          for (const e of EntityRegistry.getByType(_econType)) {
            const u = e.def.upkeep;
            if (u && !(u < 0 && e.def.powerInput > 0 && !e.powered)) { upkeep += u; if (rec) _note(rec, e, 0, u); }
          }
          continue;
        }
        for (const e of EntityRegistry.getByType(_econType)) {
          // Still being built (construction_system.js): no fee, no
          // reliability or outage clock, no spikes until it's finished.
          if (e._constructing) continue;
          const inc0 = income, upk0 = upkeep;   // this entity's share, for the breakdown

          // Cell Tower / government building income. This used to live
          // nested INSIDE the `e.type === T.HOUSE || COMMERCIAL || INDUSTRIAL`
          // branch below — but e.type can only ever equal one type, so a
          // check for T.CELLTOWER or a government building type could never
          // be true in there. That made this income completely dead code:
          // Cell Towers and every civic building (Town Hall, Hospital, etc.)
          // never earned a cent, powered or not. Moved out to its own
          // top-level branch so it actually runs; the `powered` gate was
          // already correct, it just needed to be reachable.
          if (e.type === T.CELLTOWER || _GOV_BLDGS.has(e.type)) {
            // Reads the def rather than a literal — the Cell Tower's rate was
            // hardcoded here as 5 while its def said 5 and the info panel said
            // "+$5/s", three copies that could drift apart independently.
            const _civicFee = e.def.income || 0;
            const _civicPaid = e.powered ? _civicFee : _civicFee * (outagePayPct(e.blackoutSeconds + dt) / 100);
            if (e.powered) {
              e.blackoutSeconds = Math.max(0, e.blackoutSeconds - dt);
              income += _civicFee;
            } else {
              // Civic income used to snap to exactly $0 on the tick the
              // power died — a hard cliff sitting right next to the
              // customers' gentle ramp, which is most of why a blackout
              // read as instantaneous. Ramp it on the same curve so the
              // whole city degrades at one consistent rate.
              e.blackoutSeconds += dt;
              income += _civicFee * (outagePayPct(e.blackoutSeconds) / 100);
            }
            if (e.type === T.NATIONALGRID) meridianPay += _civicPaid;
          } else if (e.type === T.HOUSE || e.type === T.COMMERCIAL || e.type === T.INDUSTRIAL) {
            if (e.powered) {
              e.blackoutSeconds = Math.max(0, e.blackoutSeconds - dt);
              // Semiconductor Fab: running again. The batch fine re-arms only
              // once the outage has fully cleared, so a flickering grid can't
              // charge it twice for what is really one blackout.
              if (e.commercialSubtype === 'semifab' || e.commercialSubtype === 'aquarium' || e.commercialSubtype === 'aicompute') {
                e._fabRunning = true;
                if (e._batchLost && e.blackoutSeconds <= 0) e._batchLost = false;
              }
              // Recovery is still throttled by how much recent outage is
              // "owed", so a long blackout leaves a scar rather than snapping
              // back to 100 — but the throttle is now mild. blackoutSeconds
              // also drains at 1/sec here, so the rate climbs as it heals.
              const recoveryRate = RELIABILITY_RECOVERY / (1 + e.blackoutSeconds / RECOVERY_MEMORY);
              e.reliability = Math.min(100, e.reliability + dt * recoveryRate);
              const reliabilityFactor = e.reliability / 100;
              income += (e.dailyFee ?? e.def.income ?? 0) * reliabilityFactor;
            } else {
              // Reliability degrades during blackout
              // Faster decay when no substation exists (no excuse for no storage)
              e.blackoutSeconds += dt;
              // Semiconductor Fab: an outage scraps the wafers on the line — a
              // one-off fine the moment a fab that was running goes dark, on top
              // of the usual outage pay loss. _fabRunning isn't saved, so the
              // all-dark moment right after a load can't trigger it.
              if (e.type === T.INDUSTRIAL && e.commercialSubtype === 'semifab' &&
                  e._fabRunning && !e._batchLost && !e._lightningDamaged) {
                e._batchLost = true;
                balance -= SEMIFAB_BATCH_FINE;
                if (_propertyNotices()) {
                  NotificationStack.push({
                    icon: '💸', title: `${e.businessName || 'Semiconductor Fab'} lost a batch`,
                    message: `Blackout scrapped the wafers on the line: ${formatMoney(SEMIFAB_BATCH_FINE)} fine. Click to jump there`,
                    color: '#ff6040', border: '#702010', tag: `semifab-batch-${e.col}-${e.row}`, glow: true,
                    onClick: () => Camera.recentreOn((e.col + (e.width||1)/2) * TILE, (e.row + (e.height||1)/2) * TILE),
                  });
                }
              }
              // AI Computing Center: same one-off rule — the training run on the
              // cluster crashes and has to restart from its last checkpoint.
              if (e.type === T.INDUSTRIAL && e.commercialSubtype === 'aicompute' &&
                  e._fabRunning && !e._batchLost && !e._lightningDamaged) {
                e._batchLost = true;
                balance -= AI_RUN_FINE;
                if (_propertyNotices()) {
                  NotificationStack.push({
                    icon: '🧠', title: `${e.businessName || 'AI Computing Center'} crashed a training run`,
                    message: `Blackout killed the run mid-epoch: ${formatMoney(AI_RUN_FINE)} to restart from checkpoint. Click to jump there`,
                    color: '#ff6040', border: '#702010', tag: `aicompute-run-${e.col}-${e.row}`, glow: true,
                    onClick: () => Camera.recentreOn((e.col + (e.width||1)/2) * TILE, (e.row + (e.height||1)/2) * TILE),
                  });
                }
              }
              // Aquarium: same one-off rule — life support down kills stock.
              if (e.type === T.COMMERCIAL && e.commercialSubtype === 'aquarium' &&
                  e._fabRunning && !e._batchLost && !e._lightningDamaged) {
                e._batchLost = true;
                balance -= AQUARIUM_STOCK_FINE;
                if (_propertyNotices()) {
                  NotificationStack.push({
                    icon: '🐟', title: `${e.businessName || 'Aquarium'} lost stock`,
                    message: `Life support failed in the blackout: ${formatMoney(AQUARIUM_STOCK_FINE)} fine. Click to jump there`,
                    color: '#ff6040', border: '#702010', tag: `aquarium-stock-${e.col}-${e.row}`, glow: true,
                    onClick: () => Camera.recentreOn((e.col + (e.width||1)/2) * TILE, (e.row + (e.height||1)/2) * TILE),
                  });
                }
              }
              // Camera nearby: reduce blackout reliability penalty by 40%
              let cameraProtected = false;
              for (const _cam of poweredCameras) {
                if (Math.sqrt((_cam.col-e.col)**2 + (_cam.row-e.row)**2) <= _cam.def.amenityRange) { cameraProtected = true; break; }
              }
              const decayRate = (hasAnySubstation ? RELIABILITY_DECAY : RELIABILITY_DECAY_NOSUB)
                              * (cameraProtected ? 0.6 : 1);
              e.reliability = Math.max(0, e.reliability - dt * decayRate);
              if (e.reliability < 50 && e.blackoutSeconds > 20) e._warnedBlackout = true;
              // Pay slides from 60% to nothing over two real minutes of darkness.
              // A lightning-struck building pays nothing — not even the
              // partial outage rate an ordinary blackout still earns.
              // The building itself is out of service, not just unpowered.
              if (!e._lightningDamaged) income += (e.dailyFee ?? e.def.income ?? 0) * (outagePayPct(e.blackoutSeconds) / 100);
            }
          }
          if (e.type === T.COMMERCIAL) e.def.powerInput = 15;
          // Service-density spike draw (restaurant/fastfood/coworking/gym,
          // and the Recycling Plant on the industrial side)
          const _spikeDef = (e.type === T.COMMERCIAL || e.type === T.INDUSTRIAL) ? COMMERCIAL_SPIKES[e.commercialSubtype] : null;
          if (_spikeDef) {
            if (e._spikeTimer === undefined) {
              e._spiking = false;
              e._spikeTimer = _spikeDef.freqMin + Math.random() * (_spikeDef.freqMax - _spikeDef.freqMin);
            }
            e._spikeTimer -= dt;
            if (e._spikeTimer <= 0) {
              e._spiking = !e._spiking;
              e._spikeTimer = e._spiking
                ? _spikeDef.durMin + Math.random() * (_spikeDef.durMax - _spikeDef.durMin)
                : _spikeDef.freqMin + Math.random() * (_spikeDef.freqMax - _spikeDef.freqMin);
            }
            e._activePowerInput = e._spiking ? _spikeDef.peak : _spikeDef.base;
          }
          // Crypto Mine: throttles its rigs to whatever the grid has spare —
          // ramps toward 221 kW as surplus appears and backs off quickly once
          // demand catches up with supply, so it soaks up an overbuilt grid
          // rather than browning it out. Fed to power_network through
          // _activePowerInput, the same channel the spike subtypes use.
          if (e.type === T.INDUSTRIAL && e.commercialSubtype === 'cryptomine') {
            const MIN = 55, MAX = 221;
            const cur = e._activePowerInput ?? MIN;
            const spare = PowerNetwork.stats.totalGenerated - PowerNetwork.stats.totalConsumed;
            const target = e.powered
              ? Math.max(MIN, Math.min(MAX, cur + (spare > 0 ? spare * 0.5 : spare * 1.5)))
              : MIN;
            e._activePowerInput = cur + (target - cur) * Math.min(1, dt * 0.5);
          }
          // Stadium: near idle most days, then an event night every third
          // game day — floodlights and gates open at 18:00, the full 248 kW
          // from 19:00 to 22:00. Which event it is rotates through a fixed
          // lineup (see STADIUM_EVENTS) so the venue isn't hosting the same
          // sports match forever — a match night reads as soccer/football
          // (pitch, two teams), concert night as a stage + light show,
          // wrestling night as a ring with corner spotlights (see
          // _renderStadium, keyed on e._stadiumEvent). Power draw is
          // identical across event types — only the venue dressing differs.
          // A card goes up at noon on event day so there's time to line up
          // supply before doors open. DemandCurves.stadium returns null for
          // live reads, so power_network takes this value.
          if (e.type === T.COMMERCIAL && e.commercialSubtype === 'stadium') {
            const hr  = DayNight.hour();
            const day = Math.floor(DayNight.getElapsed() / (DayNight.secondsPerGameHour() * 24));
            const matchDay = day % 3 === 2;
            e._matchTonight = matchDay;
            const ev = STADIUM_EVENTS[Math.floor(day / 3) % STADIUM_EVENTS.length];
            e._stadiumEvent = matchDay ? ev.type : null;
            e._activePowerInput = !matchDay ? 20 : (hr >= 19 && hr < 22) ? 248 : (hr >= 18 && hr < 23) ? 124 : 20;
            if (matchDay && hr >= 12 && hr < 18 && e._matchNoticeDay !== day && _propertyNotices()) {
              e._matchNoticeDay = day;
              NotificationStack.push({
                icon: ev.icon, title: `${e.businessName || 'Stadium'}: ${ev.label} tonight`,
                message: `${ev.message}: draw peaks at 248 kW from 19:00 to 22:00. Click to jump there`,
                color: '#60c0ff', border: '#204060', tag: `stadium-match-${e.col}-${e.row}`,
                onClick: () => Camera.recentreOn((e.col + (e.width||1)/2) * TILE, (e.row + (e.height||1)/2) * TILE),
              });
            }
          }

          // Convention Centre: idle most days, then an expo every fourth game
          // day — setup from 07:00, the full 208 kW 09:00–18:00, teardown to
          // 20:00. The warning card goes up the evening before, since the
          // load lands first thing in the morning. DemandCurves.convention
          // returns null for live reads, so power_network takes this value.
          if (e.type === T.COMMERCIAL && e.commercialSubtype === 'convention') {
            const hr  = DayNight.hour();
            const day = Math.floor(DayNight.getElapsed() / (DayNight.secondsPerGameHour() * 24));
            const expoDay = day % 4 === 1, expoTomorrow = (day + 1) % 4 === 1;
            e._expoToday = expoDay;
            e._activePowerInput = !expoDay ? 17 : (hr >= 9 && hr < 18) ? 208 : (hr >= 7 && hr < 20) ? 83 : 17;
            if (expoTomorrow && hr >= 17 && e._expoNoticeDay !== day && _propertyNotices()) {
              e._expoNoticeDay = day;
              NotificationStack.push({
                icon: '🏛️', title: `${e.businessName || 'Convention Centre'}: expo tomorrow`,
                message: 'Setup starts 07:00: draw peaks at 208 kW from 09:00 to 18:00. Click to jump there',
                color: '#ffb040', border: '#604010', tag: `convention-expo-${e.col}-${e.row}`,
                onClick: () => Camera.recentreOn((e.col + (e.width||1)/2) * TILE, (e.row + (e.height||1)/2) * TILE),
              });
            }
          }

          // Upkeep from all infrastructure. A civic building's is negative
          // (the other half of what it pays), so while it is dark that half
          // slides on the same outage curve as the income half above, where
          // it used to carry on in full.
          if (e.def.upkeep) upkeep += (_GOV_BLDGS.has(e.type) && e.def.upkeep < 0 && !e.powered)
            ? e.def.upkeep * (outagePayPct(e.blackoutSeconds) / 100) : e.def.upkeep;
          // Powered parks pay half while they're scheduled on with no power
          // (upkeep is negative income for parks, so adding claws half back).
          if ((e.type === T.SPLASHPAD || e.type === T.BASEBALLFIELD || e.type === T.COMMUNITYCENTER || e.type === T.GREENHOUSE || e.type === T.CORNERSTORE) && !e.powered &&
              (DemandCurves.get(e.type, null, DayNight.hour()) || 0) > 0) {
            upkeep += (e.def.income || 0) * 0.5;
          }
          if (rec && (income !== inc0 || upkeep !== upk0)) _note(rec, e, income - inc0, upkeep - upk0);
        }
      }

      // On a contract job site the grid belongs to the CLIENT, so nothing
      // standing there is the player's to run: equipment installed for the
      // client bills no upkeep, and the client's buildings pay no income.
      //
      // The player's OWN city carries on earning and costing exactly as it
      // would at home. Its entities are off the grid for the trip (held in
      // ContractSystem's snapshot) so they cannot be billed directly — the
      // home rate at the moment of departure is carried across and applied
      // instead, which matches home being frozen for the duration.
      // Difficulty: what customers pay. Applied to the finished sum so every
      // fee path above (houses, businesses, civic, outage pay) scales alike.
      const incMult = typeof Difficulty !== 'undefined' ? Difficulty.incomeMult() : 1;
      income *= incMult; meridianPay *= incMult;

      // A contract perk can lower the grid's running costs for a while. Only
      // the ordinary upkeep: carbon tax is added after, in full.
      const upkMult = typeof ContractPerks !== 'undefined' ? ContractPerks.upkeepMult() : 1;
      upkeep *= upkMult;

      // Carbon tax on emissions over the allowance, plus scrubber running
      // costs (pollution_system.js).
      let scrubbers = 0;
      if (typeof PollutionSystem !== 'undefined') {
        carbonTax = PollutionSystem.carbonTax();
        scrubbers = PollutionSystem.scrubberUpkeep();
        upkeep += carbonTax + scrubbers;
      }

      const _homeRate = typeof ContractSystem !== 'undefined'
        ? ContractSystem.homeEconomyRate() : null;
      const _onSite = !!_homeRate;
      if (_onSite) { income = _homeRate.income; upkeep = _homeRate.upkeep; }
      if (rec) { _ledger = rec; _ledgerMeta = { incMult, upkMult, carbonTax, scrubbers, onSite: _onSite, income, upkeep }; }
      // The city's net income (the HUD's "net" figure: income after every
      // deduction) with Hyperion Station's own export pay taken out: what the
      // station's pay is a multiple of (NationalProject), so it can't feed on
      // itself. Never below 0. Held as it was while on a job site, where the
      // home city is frozen.
      else netExMeridian = Math.max(0, income - meridianPay - upkeep);

      if (!DevMode.enabled) balance += (income - upkeep) * dt;

      // Debt system — warn then disconnect customers.
      // Suspended on a job site: the only customers reachable there are the
      // client's, and disconnecting one over the player's balance would
      // vandalise a town they were hired to fix.
      if (balance < 0 && !DevMode.enabled && !_onSite) {
        debtTimer += dt;
        if (debtTimer >= DEBT_GRACE) {
          debtTimer = 0;
          disconnectOneCustomer();
        }
      } else if (!_onSite) {
        debtTimer = 0;
      }
    },

    get upkeep()  { return upkeep;  },
    // Last tick's net income without Hyperion Station's export pay ($/s, ≥ 0).
    get netExMeridian() { return netExMeridian; },
    get carbonTax() { return carbonTax; },
    // The breakdown's lines (see _note). Call wantLedger() while the panel is
    // open; ledger() is null until a tick has recorded one.
    wantLedger() { _ledgerUntil = performance.now() + 2500; },
    ledger() { return _ledger && _ledgerMeta ? { lines: [..._ledger.values()], ..._ledgerMeta } : null; },
    outagePayPct,   // shared with the entity info panel so displayed = banked
    get debtTimer() { return debtTimer; },
    get debtGrace() { return 300; },

    spend(amount) {
      if (DevMode.enabled) return true;   // free in dev mode
      balance -= amount;
      return balance >= 0;
    },

    // True if player can afford something
    canAfford(amount) { return DevMode.enabled || balance >= amount; },
    setBalance(v)    { balance = v; },
  };
})();


// Disconnect one powered customer when in debt (they leave unpaid)
function disconnectOneCustomer() {
  const candidates = [];
  for (const t of [T.HOUSE, T.COMMERCIAL]) {
    for (const e of EntityRegistry.getByType(t)) if (e.powered) candidates.push(e);
  }
  if (!candidates.length) return;
  const victim = candidates[Math.floor(Math.random() * candidates.length)];
  GridManager.removeEntityFootprint(victim);
  showToast(`⚠ ${victim.type === T.COMMERCIAL ? 'Business' : 'Family'} left: grid debt!`, '#ff6040', '#180800', '#803020');
  try { SFX.customerLeft?.(); } catch (_e) {}
}

/* ═══════════════════════════════════════════════════════════════════
   DAY / NIGHT CYCLE
   ─────────────────────────────────────────────────────────────────
   One full cycle = CYCLE_DURATION real seconds (default 15 min).
   phase: 0.0 = midnight  0.25 = dawn  0.5 = noon  0.75 = dusk
   
   darkness(): 0 = full day (no overlay), 1 = full night (max overlay)
   Uses a smooth cosine curve so transitions feel gradual.
   The sky colour, overlay alpha, and grid ambient all derive from
   this single value — one source of truth for lighting.
   ═══════════════════════════════════════════════════════════════════ */
