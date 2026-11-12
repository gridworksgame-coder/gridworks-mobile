/* ═══════════════════════════════════════════════════════════════════
   LIGHTNING DAMAGE SYSTEM
   Rare structural strikes during rainstorms. A struck building is
   knocked offline until the player pays to repair it — it draws no
   power, generates no power, and earns no income while damaged.
   Lightning Rods placed nearby intercept strikes instead.

   Mirrors the overloaded-wire fault flow (see WeatherEventSystem.
   triggerWeatherFailures + wire_tools.js): a persistent flag on the
   entity, a pinned notification, and a Repair button on the entity's
   own panel.
   ═══════════════════════════════════════════════════════════════════ */

const LightningDamageSystem = (() => {

  // Odds that a given lightning cluster comes down on the map at all rather
  // than staying in-cloud. NOT a flat rate — it scales with how much city
  // there is to hit, so a player whose whole grid is City Hall and three
  // biofuel generators is almost never struck, while a sprawling late-game
  // map takes real weather risk.
  //
  //   chance = MAX * n / (n + HALF_AT)
  //
  // A saturating curve: steep where it matters (the first few dozen
  // buildings) and flattening toward MAX, so the risk never runs away as a
  // map fills out. HALF_AT is the building count at which the odds sit
  // halfway to MAX. Sample values (before rods are researched):
  //
  //     n=1  → 0.3%     n=15 → 3.7%    n=50  → 7.7%
  //     n=5  → 1.5%     n=30 → 5.9%    n=200 → 12.0%
  //
  // Per STORM (a rainstorm fires ~9-10 clusters) that reads as roughly a
  // 1-in-8 chance of a strike for a starter grid, a coin flip for a mid-size
  // city, and ~70% for a packed map (before rods intercept any of it).
  // The ceiling lifts once Lightning Rods are researched. Before that the
  // player has no counter and extra risk would just be punishment; after,
  // the higher rate is what gives them a reason to actually spend on rods
  // rather than eat the occasional repair bill.
  // History: cut 40% once (0.132/0.162) when storm damage felt like a tax,
  // which made strikes too rare to register; restored to 0.22/0.27; now a
  // third lower than that (0.147/0.18) — frequent enough to matter, not so
  // often that repairs dominate a storm. Then cut a further 75%
  // (0.037/0.045): on a large late-game map that was still far too many
  // strikes. The sample values and per-storm odds above predate this cut;
  // they are now a quarter of what is listed.
  const MAX_STRIKE_CHANCE      = 0.22 * 2 / 3 * 0.25;
  const MAX_STRIKE_CHANCE_RODS = 0.27 * 2 / 3 * 0.25;
  const STRIKE_HALF_AT         = 45;

  function strikeChance(buildingCount) {
    if (buildingCount <= 0) return 0;
    const rodsAvailable = typeof Progression !== 'undefined'
                       && Progression.isUnlocked(T.LIGHTNINGROD);
    const max = rodsAvailable ? MAX_STRIKE_CHANCE_RODS : MAX_STRIKE_CHANCE;
    return max * buildingCount / (buildingCount + STRIKE_HALF_AT);
  }

  // Each rod in range multiplies the *remaining* strike odds by this, so
  // protection stacks with diminishing returns:
  //   1 rod -> 62% intercepted, 2 -> 86%, 3 -> 95%, 4 -> 98%
  const ROD_PASSTHROUGH = 0.38;

  // Every rod tier. Iterated wherever rods are collected, so adding a MK3
  // later means touching this list rather than hunting getByType calls.
  const ROD_TYPES = [T.LIGHTNINGROD, T.LIGHTNINGROD2, T.LIGHTNINGROD3];
  function allRods() {
    const out = [];
    for (const t of ROD_TYPES) for (const r of EntityRegistry.getByType(t)) out.push(r);
    return out;
  }
  function isRod(e) { return !!e && ROD_TYPES.includes(e.type); }

  // Repair cost scales with what the building is worth, but sub-linearly:
  //
  //   cost = COEFF * worth^EXP
  //
  // A flat percentage doesn't work across this game's price range, which
  // spans a $1,000 Power Tower to a $1,000,000 MHD Ring. 7% of the tower is
  // $70 (trivial), while 7% of the ring is $70,000 (brutal). The exponent
  // pulls those ends together so the bill still climbs hard in absolute
  // terms while easing off as a percentage — cheap infrastructure is a
  // nuisance to fix, a reactor genuinely hurts, nothing is ruinous:
  //
  //   Power Tower  $1,000   →   $102   (10.2%)
  //   House        $8,000   →   $572   ( 7.2%)
  //   Substation  $22,000   → $1,306   ( 5.9%)
  //   Coal Gen    $60,000   → $3,050   ( 5.1%)
  //   Nuclear    $250,000   → $9,959   ( 4.0%)
  //   MHD Ring $1,000,000   →$31,482   ( 3.1%)
  const REPAIR_COEFF = 0.33;
  const REPAIR_EXP   = 0.83;
  const REPAIR_MIN   = 75;      // nothing is ever free to fix
  const REPAIR_MAX   = 35000;   // backstop for anything pricier added later

  // Repairs take crew time, not just money. Duration is in SIM seconds and
  // blends two ideas:
  //   complexity — worth^TIME_EXP, so a reactor takes far longer than a shed
  //   size       — footprint area, so a sprawling plant takes longer still
  // Sub-linear on worth for the same reason the cost is: a straight scaling
  // across a $1,000-to-$1,000,000 range produces either instant or absurd.
  // At 50 sim seconds per in-game hour that works out to roughly:
  //
  //   Power Tower  $1,000  2x2   →  27 s   (~0.5 in-game hr)
  //   House        $8,000  1x1   →  37 s   (~0.7 hr)
  //   Substation  $22,000  2x2   →  54 s   (~1.1 hr)
  //   Coal Gen    $60,000  3x3   →  79 s   (~1.6 hr)
  //   Nuclear    $250,000  5x5   → 144 s   (~2.9 hr)
  //   MHD Ring $1,000,000  6x6   → 235 s   (~4.7 hr)
  const REPAIR_TIME_BASE = 10;
  const REPAIR_TIME_COEF = 0.55;
  const REPAIR_TIME_EXP  = 0.42;
  const REPAIR_TIME_AREA = 1.2;
  const REPAIR_TIME_MIN  = 15;
  const REPAIR_TIME_MAX  = 240;

  // How long a crew needs on this building, in sim seconds.
  function repairSeconds(e) {
    if (!e) return REPAIR_TIME_MIN;
    const worth = e.upfrontPaid || e.def?.cost || 2000;
    const area  = (e.width || 1) * (e.height || 1);
    const raw   = REPAIR_TIME_BASE
                + REPAIR_TIME_COEF * Math.pow(worth, REPAIR_TIME_EXP)
                + REPAIR_TIME_AREA * area;
    return Math.round(Math.min(REPAIR_TIME_MAX, Math.max(REPAIR_TIME_MIN, raw)));
  }

  function isRepairing(e) { return !!(e && e._repairRemaining > 0); }

  // 0 -> 1 across the crew's time on site.
  function repairProgress(e) {
    if (!isRepairing(e)) return 0;
    const total = e._repairTotal || 1;
    return Math.max(0, Math.min(1, 1 - e._repairRemaining / total));
  }

  // Types lightning will never single out: terrain, buried/linear
  // infrastructure (wires have their own fault system), vehicles, and
  // the rods themselves — a rod that eats a strike is doing its job.
  let _excluded = null;
  function excluded() {
    if (_excluded) return _excluded;
    _excluded = new Set([
      T.WATER, T.TREE, T.BUSH, T.WIRE, T.PIPE, T.UNDERGNDPIPE, T.CONVEYOR,
      T.ROAD, T.TRUCK, T.LIGHTNINGROD, T.LIGHTNINGROD2, T.LIGHTNINGROD3, T.POLE,
      T.COALDEPOSIT, T.OILDEPOSIT, T.URANIUMDEPOSIT, T.SULFURDEPOSIT,
      T.LITHIUMDEPOSIT, T.HELIUMDEPOSIT, T.RAREEARTHDEPOSIT, T.GEODEPOSIT, T.AQUIFER,
      T.FISHINGPOLE, T.PATHTOOL, T.BRIDGE,
    ]);
    return _excluded;
  }

  let _seenRainstorm = false;  // set the first time lightning fires at all

  // Each rod tier is gated on taking a building strike while a research
  // station of the matching tier is STANDING — strikes from before that
  // station went up don't count, so each rod is earned by living through
  // the problem at that stage rather than handed over on a timer.
  // Higher-tier stations satisfy the lower flag too, so replacing an MK2
  // with an MK3 can't strand the MK1 unlock.
  let _strikeAfterMk2 = false;   // gates Lightning Rod MK1
  let _strikeAfterMk3 = false;   // gates Lightning Rod MK2
  let _totalStrikes  = 0;
  let _totalDamaged  = 0;
  let _totalExplosions = 0;   // storage banks detonated
  let _totalBurned     = 0;   // buildings taken by spreading fire
  let _totalGenExplosions = 0;   // fuel/steam generators blown up (meltdowns + chains)
  let _notifActive   = false;
  // Per-building strike cards: tag -> struck entity. See _damage().
  const _strikeCards = new Map();

  function _dismissStrikeCard(e) {
    const tag = `lightningstrike-${e.col},${e.row}`;
    if (_strikeCards.get(tag) !== e) return;
    _strikeCards.delete(tag);
    NotificationStack.dismissTag(tag);
  }

  // Active strike visuals — world-space, drawn by renderStrikes().
  // { wx, wy, t0, bolt:[{x,y}...], absorbed }
  // Timed off wall-clock seconds, NOT the 10 Hz logic tick that drives the
  // rest of this file — a 0.55 s bolt animated in 0.1 s steps would only
  // get five frames and read as a stutter rather than a flash.
  const _strikes = [];
  const STRIKE_LIFE = 0.75;

  // Buildings currently on fire. Rebuilt once per logic tick (10 Hz) so the
  // per-frame fire pass iterates a handful of entries instead of rescanning
  // a 24,000-entity registry sixty times a second. Rebuilt from scratch
  // rather than maintained incrementally so a save/load — which sets
  // _lightningDamaged directly on entities — stays correct.
  let _damaged = [];
  function _now() { return performance.now() / 1000; }

  function isStrikeable(e) {
    if (!e || !e.def) return false;
    return !excluded().has(e.type);
  }

  // ── Rod coverage ─────────────────────────────────────────────────
  // Distance is measured footprint-edge to footprint-edge so a big rod
  // protecting a big plant doesn't lose range to their anchor corners
  // being far apart.
  function _edgeDist(a, b) {
    const ax0 = a.col, ax1 = a.col + (a.width  || 1) - 1;
    const ay0 = a.row, ay1 = a.row + (a.height || 1) - 1;
    const bx0 = b.col, bx1 = b.col + (b.width  || 1) - 1;
    const by0 = b.row, by1 = b.row + (b.height || 1) - 1;
    const dx = Math.max(0, Math.max(ax0 - bx1, bx0 - ax1));
    const dy = Math.max(0, Math.max(ay0 - by1, by0 - ay1));
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Every rod covering this entity, nearest first.
  function rodsCovering(e) {
    const out = [];
    for (const rod of allRods()) {
      const d = _edgeDist(rod, e);
      if (d <= (rod.def?.protectRange ?? 7)) out.push({ rod, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  // 0 = unprotected, -> 1 = almost certainly intercepted.
  // Each covering rod contributes its own passthrough, multiplied together,
  // so a MK2 (0.18) beside a MK1 (0.38) gives 1 - 0.068 = 93.2% rather than
  // either tier's figure alone.
  function protectionAt(e) {
    let pass = 1;
    for (const { rod } of rodsCovering(e)) pass *= (rod.def?.passthrough ?? ROD_PASSTHROUGH);
    return pass === 1 ? 0 : 1 - pass;
  }

  function repairCost(e) {
    // Customers are priced off what the player actually paid to take them
    // on; everything else off its build cost.
    const worth = e.upfrontPaid || e.def?.cost || 2000;
    // Flattened by a generator explosion: that's a rebuild, not a repair —
    // a straight fraction of what the building is worth (see REBUILD_*),
    // with no cap and no Monitoring Station discount.
    if (e._rebuildFrac > 0) return Math.round(worth * e._rebuildFrac);
    const raw   = REPAIR_COEFF * Math.pow(worth, REPAIR_EXP);
    const base  = Math.round(Math.min(REPAIR_MAX, Math.max(REPAIR_MIN, raw)));
    // Same Monitoring Station discount the wire repairs get — and, like
    // every other monitor perk, a burning station doesn't provide it.
    const hasMonitor = hasActiveMonitor();
    const cost = hasMonitor ? Math.round(base * 0.75) : base;
    // A contract perk can take a share (or all) off repairs.
    return typeof ContractPerks !== 'undefined' ? Math.round(cost * ContractPerks.repairMult()) : cost;
  }

  // Watts a rod is currently feeding back into its network. Falls from the
  // surge's peak to 0 across surgeHours of in-game time on a ^1.5 curve —
  // most of the energy arrives early, then it trickles.
  function surgeWatts(rod) {
    if (!rod || !(rod._surgeRemaining > 0)) return 0;
    const total = rod._surgeTotal || 1;
    const frac  = Math.max(0, Math.min(1, rod._surgeRemaining / total));
    const peak  = rod._surgePeak ?? (rod.def?.surgeOutput ?? 10);
    return peak * Math.pow(frac, 1.5);
  }

  // Total live surge across every rod, for readouts.
  function getTotalSurge() {
    let w = 0;
    for (const rod of allRods()) w += surgeWatts(rod);
    return w;
  }

  function isDamaged(e) { return !!(e && e._lightningDamaged); }

  function countDamaged() {
    let n = 0;
    // Scenery (water, trees, bushes) is never strikeable, so cannot be damaged.
    for (const e of EntityRegistry.active()) if (e._lightningDamaged) n++;
    return n;
  }

  // Dispatches a crew: takes the money up front, then the building stays
  // offline for repairSeconds() before coming back. Returns true if the job
  // was actually started. Named `repair` still, since every caller means
  // "make this whole" — the wait is an implementation of that, not a
  // different action.
  function repair(e) {
    if (!e || !e._lightningDamaged || isRepairing(e)) return false;
    if (e._irreparable) {
      showToast(`☢ ${e.businessName || e.def?.label || 'This building'} was destroyed by the nuclear blast; it can't be repaired. Demolish it to clear the site.`,
                '#b0ff60', '#0a1400', '#50a020', 'lightningrepair');
      return false;
    }
    const cost = repairCost(e);
    if (!Economy.canAfford(cost)) {
      showToast('Not enough funds to repair', '#ff4040', '#140000', '#600000');
      return false;
    }
    Economy.spend(cost);
    e._repairTotal     = repairSeconds(e);
    e._repairRemaining = e._repairTotal;
    const mins = Math.max(1, Math.round(e._repairTotal / 60));
    // Tagged: during a storm the toast queue can already be several
    // 6-second messages deep, and a confirmation the player only sees ten
    // seconds after clicking reads as the click having done nothing.
    // A tagged toast replaces the current one instead of queueing.
    showToast(`🔧 Crew dispatched to ${e.businessName || e.def.label}: ~${mins} min`,
              '#c08020', '#100c00', '#604010', 'lightningrepair');
    SFX.click?.();
    return true;
  }

  // ── Repair all nearby ────────────────────────────────────────────
  // A detonation leaves a whole block down at once, and clicking through a
  // dozen panels to dispatch a dozen crews is busywork, not a decision —
  // the interesting choice is "can I afford to put this block back", not
  // "can I be bothered to click twelve times".
  //
  // Deliberately NOT map-wide. A radius keeps it a local cleanup of one
  // incident: a second fire across town is a separate problem the player
  // still has to notice and go and look at.
  const REPAIR_ALL_RADIUS = 10;

  // Every damaged building within range of `e`, `e` itself first so the
  // thing the player actually clicked on is the one that definitely gets
  // fixed if the money runs out partway down the list.
  function nearbyDamaged(e) {
    if (!e) return [];
    const out = [];
    for (const o of EntityRegistry.all()) {
      if (o === e || !o._lightningDamaged || isRepairing(o) || o._irreparable) continue;
      if (_edgeDist(e, o) <= REPAIR_ALL_RADIUS) out.push(o);
    }
    // Cheapest first: if funds run out, the player gets the most buildings
    // back online for the money rather than one expensive one and nothing.
    out.sort((a, b) => repairCost(a) - repairCost(b));
    if (e._lightningDamaged && !isRepairing(e) && !e._irreparable) out.unshift(e);
    return out;
  }

  // Total bill to dispatch to everything in range, for the button label.
  function nearbyRepairCost(e) {
    let sum = 0;
    for (const o of nearbyDamaged(e)) sum += repairCost(o);
    return sum;
  }

  // Dispatches to as many as the balance covers, cheapest first. Returns
  // how many crews actually went out.
  function repairNearby(e) {
    const list = nearbyDamaged(e);
    if (list.length === 0) return 0;

    let done = 0, spent = 0;
    for (const o of list) {
      const cost = repairCost(o);
      if (!Economy.canAfford(cost)) break;   // out of money — stop cleanly
      Economy.spend(cost);
      o._repairTotal     = repairSeconds(o);
      o._repairRemaining = o._repairTotal;
      spent += cost;
      done++;
    }

    if (done === 0) {
      showToast('Not enough funds to repair', '#ff4040', '#140000', '#600000');
      return 0;
    }
    const short = list.length - done;
    showToast(
      short > 0
        ? `🔧 ${done} crew${done === 1 ? '' : 's'} dispatched: $${spent.toLocaleString()} · ${short} left unfunded`
        : `🔧 ${done} crew${done === 1 ? '' : 's'} dispatched: $${spent.toLocaleString()}`,
      '#c08020', '#100c00', '#604010', 'lightningrepair');
    SFX.click?.();
    return done;
  }

  // Called from tick() the moment a crew finishes.
  function _finishRepair(e) {
    e._lightningDamaged  = false;
    e._lightningStruckAt = undefined;
    e._repairRemaining   = undefined;
    e._repairTotal       = undefined;
    // Rebuilt means rebuilt: the fire is out, so it stops spreading, and a
    // bank that has been made whole is a live bomb again the next time
    // lightning or fire reaches it.
    e._fireSpreadT       = undefined;
    e._fireCause         = undefined;
    e._fireOut           = undefined;
    e._rainDouse         = undefined;
    e._douseAt           = undefined;
    e._smoulderT         = undefined;
    e._rebuildFrac       = undefined;
    e._detonated         = false;
    e._genBurnT          = undefined;
    e._genBurnWarned     = undefined;
    e._burnExploded      = undefined;
    NotificationStack.dismissTag(`genburn-${e.col},${e.row}`);
    _dismissStrikeCard(e);
    PowerNetwork.recomputeWireHops();
    if (typeof GridBreakWatch !== 'undefined') GridBreakWatch.noteChanged();
    SFX.goodConnect?.(0.25);
    showToast(`✅ ${e.businessName || e.def.label} back online`, '#40c060', '#001408', '#0a4020');
    if (countDamaged() === 0) {
      NotificationStack.dismissTag('lightningdamage');
      _notifActive = false;
    }
  }

  // Injects a "struck by lightning" banner + Repair button into a panel, or
  // removes it once the entity is fixed. EntityInfoPanel has its own button
  // baked into the markup (#ep-repair-wire-btn); every other panel — solar,
  // dam, turbine, shaft, hydro generator, research — had no repair UI at
  // all, which is why those buildings used to be exempt from strikes. They
  // share this rather than hand-rolling six near-identical buttons. Panels
  // that rebuild their body via innerHTML must call it immediately after.
  function attachRepairUI(hostEl, entity, onRepaired) {
    if (!hostEl) return;
    let box = hostEl.querySelector(':scope > .lds-repair-box');
    if (!entity || !entity._lightningDamaged) { if (box) box.remove(); return; }

    // Built ONCE and then mutated in place. The previous version rebuilt the
    // button on every panel refresh, and these panels refresh on a 250 ms
    // interval — if a refresh landed between the player's mousedown and
    // mouseup, the element they pressed no longer existed and the browser
    // fired no click event at all. The press was silently swallowed, which
    // is exactly what "sometimes the Repair button does nothing" looks like.
    // hostEl must therefore be the panel ROOT, not the body div the panel
    // rewrites wholesale via innerHTML.
    if (!box) {
      box = document.createElement('div');
      box.className = 'lds-repair-box';
      box.style.cssText = 'margin:8px;padding:8px;background:#140800;'
                        + 'border:1px solid #804020;border-radius:3px;';

      const title = document.createElement('div');
      title.style.cssText = 'font-size:9px;letter-spacing:1px;color:#ff6030;margin-bottom:3px;';
      title.textContent = '\u26A1 STRUCK BY LIGHTNING';

      const sub = document.createElement('div');
      sub.style.cssText = 'font-size:9px;color:#c08060;margin-bottom:6px;';

      const track = document.createElement('div');
      track.style.cssText = 'height:5px;background:#2a1608;border-radius:2px;overflow:hidden;margin-bottom:6px;';
      const fill = document.createElement('div');
      fill.style.cssText = 'height:100%;width:0%;background:#e0a040;';
      track.appendChild(fill);

      const btn = document.createElement('button');
      btn.style.cssText = 'width:100%;padding:6px;background:#1a0800;border:1px solid #804020;'
                        + 'color:#ff6030;font-family:monospace;font-size:10px;'
                        + 'border-radius:3px;transition:background 0.08s,color 0.08s;';
      // Panels float over the world canvas; without this the mousedown falls
      // through and deselects the very entity being repaired.
      btn.addEventListener('mousedown', ev => {
        ev.stopPropagation();
        if (!box._ldsBusy) btn.style.background = '#3a1400';   // instant press feedback
      });
      btn.addEventListener('mouseup',    () => { btn.style.background = '#1a0800'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = '#1a0800'; });
      // Bound once; reads the current target off the box so it can never go
      // stale when the panel is re-pointed at a different entity.
      btn.addEventListener('click', () => {
        if (box._ldsBusy) return;
        const target = box._ldsEntity;
        if (target && repair(target) && box._ldsDone) box._ldsDone();
      });

      // Second button: dispatch to everything still down within
      // REPAIR_ALL_RADIUS. Built alongside the first and shown only when
      // there is actually more than one thing to fix, so the panel for a
      // lone wrecked shed doesn't grow a button that would do nothing.
      const allBtn = document.createElement('button');
      allBtn.style.cssText = 'width:100%;margin-top:5px;padding:6px;background:#140a00;'
                           + 'border:1px solid #6a4a20;color:#e0a040;font-family:monospace;'
                           + 'font-size:10px;border-radius:3px;cursor:pointer;'
                           + 'transition:background 0.08s,color 0.08s;';
      allBtn.addEventListener('mousedown', ev => {
        ev.stopPropagation();
        allBtn.style.background = '#2e1a00';
      });
      allBtn.addEventListener('mouseup',    () => { allBtn.style.background = '#140a00'; });
      allBtn.addEventListener('mouseleave', () => { allBtn.style.background = '#140a00'; });
      allBtn.addEventListener('click', () => {
        const target = box._ldsEntity;
        if (target && repairNearby(target) > 0 && box._ldsDone) box._ldsDone();
      });

      box.appendChild(title);
      box.appendChild(sub);
      box.appendChild(track);
      box.appendChild(btn);
      box.appendChild(allBtn);
      box._ldsSub = sub; box._ldsTrack = track; box._ldsFill = fill; box._ldsTitle = title;
      box._ldsBtn = btn; box._ldsAllBtn = allBtn;
      hostEl.appendChild(box);
    }

    box._ldsEntity = entity;
    box._ldsDone   = onRepaired;
    if (entity._irreparable) {
      box._ldsTitle.textContent = '☢ DESTROYED BY NUCLEAR BLAST';
      box._ldsSub.textContent   = 'Irreparable: demolish it to clear the site';
      box._ldsTrack.style.display  = 'none';
      box._ldsBtn.style.display    = 'none';
      box._ldsAllBtn.style.display = 'none';
      box._ldsBusy = true;
      return;
    }
    box._ldsBtn.style.display = '';
    box._ldsTitle.textContent = entity._rebuildFrac > 0 ? '💥 DESTROYED IN EXPLOSION' : '⚡ STRUCK BY LIGHTNING';

    const busy = isRepairing(entity);
    box._ldsBusy = busy;
    const btn = box._ldsBtn;

    if (busy) {
      const pct = Math.round(repairProgress(entity) * 100);
      box._ldsSub.textContent = 'Offline \u2014 crew on site';
      box._ldsTrack.style.display = 'block';
      box._ldsFill.style.width = pct + '%';
      btn.textContent = '\uD83D\uDD27 Repairing \u2014 ' + pct + '%';
      // Not a button any more, so it must stop looking like one.
      btn.style.cursor  = 'default';
      btn.style.color   = '#e0a040';
      btn.style.borderColor = '#6a4a10';
      btn.style.background  = '#141008';
    } else {
      box._ldsSub.textContent = entity._rebuildFrac > 0
        ? `Destroyed \u2014 rebuild costs ${Math.round(entity._rebuildFrac * 100)}% of its value`
        : 'Offline \u2014 no output, no income';
      box._ldsTrack.style.display = 'none';
      btn.textContent = (entity._rebuildFrac > 0 ? '\uD83C\uDFD7 Rebuild \u2014 $' : '\u26A1 Repair \u2014 $')
                      + repairCost(entity).toLocaleString();
      btn.style.cursor  = 'pointer';
      btn.style.color   = '#ff6030';
      btn.style.borderColor = '#804020';
      btn.style.background  = '#1a0800';
    }

    // The bulk button tracks the CURRENT state of the neighbourhood, so it
    // counts down as crews go out and disappears entirely once this is the
    // only thing left standing broken — a "repair all" that would repair
    // exactly one building is just a second copy of the button above it.
    const allBtn = box._ldsAllBtn;
    if (allBtn) {
      const list = nearbyDamaged(entity);
      if (list.length <= 1) {
        allBtn.style.display = 'none';
      } else {
        let sum = 0;
        for (const o of list) sum += repairCost(o);
        allBtn.style.display = 'block';
        allBtn.textContent = '🔧 Repair all ' + list.length
                           + ' nearby: $' + sum.toLocaleString();
        // Dimmed rather than hidden when it can't be afforded: the player
        // still needs to see what putting the block back would cost.
        const afford = Economy.canAfford(sum);
        allBtn.style.color       = afford ? '#e0a040' : '#8a6a3a';
        allBtn.style.borderColor = afford ? '#6a4a20' : '#4a3a20';
      }
    }
  }

  // ── Strike resolution ────────────────────────────────────────────

  // Everything a bolt could land on right now, with its footprint area as
  // a weight. Already-damaged buildings are excluded — they can't be
  // knocked offline twice, and dropping them means a battered city's odds
  // ease off slightly instead of compounding.
  const CITY_HALL_MAX_AREA = 9;
  function _candidates() {
    const list = [];
    let total = 0;
    for (const e of EntityRegistry.all()) {
      if (!isStrikeable(e) || e._lightningDamaged) continue;
      // High, exposed ground draws more of the storm (terrain_system.js).
      // City Hall counts as a 3×3 at most. At its real 6×6 it was some 40% of
      // a young town's footprint, so it took that share of the strikes — on
      // the one building the player neither placed nor can protect before
      // Lightning Rods unlock.
      const area = (e.width || 1) * (e.height || 1);
      const w = (e.type === T.GOVBUILDING ? Math.min(area, CITY_HALL_MAX_AREA) : area) * TerrainSystem.lightningMult(e);
      total += w;
      list.push({ e, w });
    }
    return { list, total };
  }

  // Weight by footprint area — a sprawling plant is a bigger target than a
  // single-tile shop, which is both intuitive and keeps small starter towns
  // from being hammered.
  function _pickTarget(cands) {
    if (!cands.total) return null;
    let roll = Math.random() * cands.total;
    for (const c of cands.list) { roll -= c.w; if (roll <= 0) return c.e; }
    return cands.list[cands.list.length - 1].e;
  }

  // The live per-flash odds, for UI and tuning.
  function getStrikeChance() { return strikeChance(_candidates().list.length); }

  function _centreWorld(e) {
    const { x, y } = GridManager.tileToWorld(e.col, e.row);
    return { wx: x + (e.width || 1) * TILE / 2, wy: y + (e.height || 1) * TILE / 2 };
  }

  // Jagged descending polyline in world space, ending exactly at (wx, wy).
  function _buildBolt(wx, wy) {
    const height = TILE * 26;             // starts well above the viewport
    const segs   = 9 + (Math.random() * 5 | 0);
    const pts    = [];
    const startX = wx + (Math.random() - 0.5) * TILE * 7;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      // Converge on the target as we descend, so the tip lands dead on it.
      const cx = startX + (wx - startX) * (u * u);
      const jitter = (1 - u) * TILE * 1.6;
      pts.push({ x: cx + (Math.random() - 0.5) * jitter, y: wy - height * (1 - u) });
    }
    pts[pts.length - 1] = { x: wx, y: wy };
    return pts;
  }

  function _spawnVisual(wx, wy, absorbed) {
    _strikes.push({ wx, wy, t0: _now(), bolt: _buildBolt(wx, wy), absorbed });
    Particles.spawn(wx, wy, absorbed ? '#a0e0ff' : '#ffd060', absorbed ? 14 : 26);
    Particles.spawn(wx, wy, absorbed ? '#ffffff' : '#ff8020', absorbed ? 8 : 16);
    SFX.spark?.();
    // Close strike — a hard crack, not the distant rumble the ambient
    // storm loop plays.
    setTimeout(() => SFX.thunder?.(0.85), 60);
  }

  // Called once per lightning cluster by LightningSystem.spawnCluster().
  function rollStrike() {
    _seenRainstorm = true;

    // Roll against the city-size-scaled odds, using the same candidate scan
    // the target pick needs anyway rather than walking the registry twice.
    const cands = _candidates();
    if (cands.list.length === 0) return;
    if (Math.random() >= strikeChance(cands.list.length)) return;

    const target = _pickTarget(cands);
    if (!target) return;
    _resolveStrike(target);
  }

  // Everything that happens once a bolt has picked its building: rod
  // interception first, then either a detonation or ordinary damage. Split
  // out of rollStrike so the dev-mode trigger drives the real pipeline
  // rather than a parallel copy of it that could drift.
  function _resolveStrike(target) {
    if (!target || !target.def) return;
    _totalStrikes++;

    // The bolt itself. Fired here rather than inside _spawnVisual so that a
    // detonating storage bank — which skips the ordinary bolt flash and goes
    // straight to _explode — still cracks, while chain detonations set off by
    // that blast do not each sound like a fresh strike.
    SFX.lightningStrike?.();

    // Rods in range get first claim on the bolt.
    const rods = rodsCovering(target);
    if (rods.length > 0 && Math.random() < protectionAt(target)) {
      const rod = rods[0].rod;
      const c   = _centreWorld(rod);
      // Land on the spike at the top of the mast, not the footprint centre.
      _spawnVisual(c.wx, c.wy - ((rod.height || 1) / 2 - 0.2) * TILE, true);
      rod._rodGlowUntil    = performance.now() + 2500;  // wall-clock, matched by renderLightningRod
      rod._strikesAbsorbed = (rod._strikesAbsorbed || 0) + 1;

      // Dump the strike's energy into the grid, bleeding off over the next
      // in-game hour. A rod hit again while a surge is still live STACKS:
      // the new strike adds onto whatever is still flowing rather than
      // replacing it, so back-to-back hits push the peak up (capped at the
      // def's surgeMax) while a late second hit adds only the little that's
      // left. The timer restarts either way.
      const _base    = rod.def?.surgeOutput ?? 10;
      const _cap     = rod.def?.surgeMax    ?? _base;
      const _carried = surgeWatts(rod);   // read BEFORE the timer resets
      rod._surgePeak      = Math.min(_cap, _carried + _base);
      rod._surgeTotal     = (rod.def?.surgeHours ?? 1) * DayNight.secondsPerGameHour();
      rod._surgeRemaining = rod._surgeTotal;

      showToast(
        _carried > 0.05
          ? `⚡ Rod took another hit; surge up to ${formatPower(rod._surgePeak, 1)}`
          : `⚡ Lightning Rod took the hit; no damage · +${formatPower(_base)} surge`,
        '#60c0ff', '#00101c', '#204060');
      return;
    }

    // CHARGED storage doesn't merely fail when a bolt finds it — the bank
    // lets go. Everything the explosion touches is handled by _explode,
    // including wrecking the bank itself, so this returns rather than
    // falling through to the ordinary damage path. An empty bank falls
    // through and takes the same damage any other building would.
    if (_isArmed(target)) {
      target._detonated = true;
      _explode(target, 0);
      return;
    }

    _damage(target);
  }

  // ── Dev trigger ──────────────────────────────────────────────────
  // Fires a bolt at a specific building, skipping ONLY the two random rolls
  // that decide whether a strike happens at all and who it lands on. Rod
  // interception, detonation, blast damage and fire all run exactly as they
  // would in a real storm, so what dev mode shows is what the game does.
  //
  // Pass an entity, or nothing to hit a random eligible building. Returns
  // the building struck, or null if there was nothing to hit.
  function devStrike(entity) {
    let target = entity || null;
    if (!target) target = _pickTarget(_candidates());
    if (!target) {
      showToast('No building available to strike', '#c08020', '#100c00', '#604010');
      return null;
    }
    if (!isStrikeable(target)) {
      showToast(`${target.def?.label || 'That'} can't be struck by lightning`,
                '#c08020', '#100c00', '#604010');
      return null;
    }
    if (target._lightningDamaged) {
      showToast(`${target.businessName || target.def.label} is already wrecked`,
                '#c08020', '#100c00', '#604010');
      return null;
    }
    _seenRainstorm = true;
    // Deliberately does NOT move the camera. A strike is never allowed to
    // yank the view off whatever the player was doing — the notification
    // card says where it landed and jumps there on click, which is the
    // player's choice to make. Same rule as a real strike.
    _resolveStrike(target);
    return target;
  }

  // Storage is anything with a capacity to hold charge — Substations MK1/MK2
  // and the Battery Block today. Tested off the def rather than a type list
  // so a future storage building is covered the day it is added, and it is
  // the same test the info panel uses to decide it has a charge readout.
  function isStorage(e) { return !!(e && e.def && e.def.capacity > 0); }

  // A strike on storage dumps everything it was holding.
  //
  // Lightning is a surge arriving through the same conductors the cells
  // charge over, so of everything it hits, storage is the one kind that
  // loses more than uptime: the repair brings the building back, but not
  // the energy that was in it. It also makes the strike land where the
  // player feels it — a full bank is the thing standing between them and
  // the next deficit, and losing it is a real setback in a way that a
  // repair bill on a building that was idle anyway is not.
  function _dumpCharge(e) {
    if (!isStorage(e)) return 0;
    const pct = e.def.capacity > 0 ? (e.charge || 0) / e.def.capacity : 0;
    e.charge     = 0;
    e.charging   = false;
    e.overloaded = false;
    return pct;
  }

  // opts.silent  — no personal toast and no bolt flash for this building.
  //                Used for blast victims and fire spread, where one shared
  //                headline reads far better than eight stacked toasts.
  // opts.cause   — 'strike' | 'blast' | 'fire'. Only affects wording.
  // opts.origin  — 'meltdown' when the damage traces back to a generator
  //                exploding rather than to the weather, so it doesn't count
  //                toward the Lightning Rod unlocks.
  function _damage(e, opts = {}) {
    if (e._lightningDamaged) return false;
    e._lightningDamaged  = true;
    e._lightningStruckAt = _now();
    e._fireCause         = opts.cause || 'strike';
    // Fresh fires need a full interval on the clock before they can pass it
    // on, so a blast doesn't cascade across the map inside one tick.
    e._fireSpreadT       = 0;
    const _lostPct = _dumpCharge(e);
    _totalDamaged++;
    if (opts.origin !== 'meltdown') {
      const _mk3Up = EntityRegistry.getByType(T.RESEARCH3).size > 0
                  || EntityRegistry.getByType(T.MK4RESEARCH).size > 0
                  || EntityRegistry.getByType(T.MK5RESEARCH).size > 0;
      const _mk2Up = _mk3Up || EntityRegistry.getByType(T.RESEARCH2).size > 0;
      if (_mk2Up) _strikeAfterMk2 = true;
      if (_mk3Up) _strikeAfterMk3 = true;
    }
    const c = _centreWorld(e);
    if (!opts.silent) _spawnVisual(c.wx, c.wy, false);
    PowerNetwork.recomputeWireHops();
    // A struck Power Tower opens the circuit and drops hop anchors — refresh
    // the jump-to-break list so the GRID panel / world map light up immediately.
    if (typeof GridBreakWatch !== 'undefined') GridBreakWatch.noteChanged();

    // The apocalypse destroys hundreds of buildings a minute with every
    // notification switched off. The card below starts with countDamaged(),
    // a full registry walk — 30,000 entities per victim, dozens of victims a
    // frame — which is where the 200–300ms hitches in the sequence came from.
    if (opts.noNotify) return true;

    const name = e.businessName || e.def.label || 'Building';
    const isTower = e.type === T.POWERTOWER;

    // A direct strike gets its own card, tagged by tile, so a second bolt
    // stacks a second card instead of being swallowed by the first — push()
    // drops any card whose tag is already showing. Cleared per building by
    // _dismissStrikeCard() on repair, or by tick() once it's demolished.
    if (!opts.silent && e._fireCause === 'strike') {
      const tag = `lightningstrike-${e.col},${e.row}`;
      NotificationStack.push({
        icon: '⚡',
        title: isTower ? 'Power Tower Struck' : 'Lightning Strike',
        message: isTower ? `${name} open circuit: can split the grid. Click to jump`
                         : `${name} knocked offline: click to jump / repair`,
        color: '#ff4020',
        border: '#702010',
        tag,
        glow: true,
        onClick: () => {
          if (isTower && typeof GridBreakWatch !== 'undefined' && GridBreakWatch.any()) {
            GridBreakWatch.jumpNext();
            return;
          }
          const t = _centreWorld(e);
          Camera.recentreOn(t.wx, t.wy);
          EntityInfoPanel.open(e);
        },
      });
      _strikeCards.set(tag, e);
      showToast(_lostPct > 0.005
                  ? `⚡ ${name} struck by lightning: ${Math.round(_lostPct * 100)}% stored charge lost, offline until repaired`
                  : `⚡ ${name} struck by lightning; offline until repaired`,
                '#ff6020', '#140800', '#702010');
      return true;
    }

    // Fire spread and blast victims share one summary card — a single blast
    // can take dozens of buildings, and a card each would bury everything
    // else. The card names the count, and is rewritten in place when it's
    // already up (push() alone would keep the stale first count).
    const n = countDamaged();
    const _sumTitle = n > 1 ? 'Buildings Burning' : (isTower ? 'Power Tower Struck' : 'Lightning Strike');
    const _sumMsg   = n > 1 ? `${n} buildings on fire; click to jump / repair`
                    : isTower
                      ? `${name} open circuit: can split the grid. Click to jump`
                      : `${name} knocked offline: click to jump / repair`;
    if (!NotificationStack.updateTag('lightningdamage', { title: _sumTitle, message: _sumMsg })) NotificationStack.push({
      icon: n > 1 ? '🔥' : '⚡',
      title: _sumTitle,
      message: _sumMsg,
      color: '#ff4020',
      border: '#702010',
      tag: 'lightningdamage',
      glow: true,
      onClick: () => {
        // Prefer the connectivity jump-list (towers / failed wires) so a
        // city full of burning houses doesn't hide the tower that actually
        // shattered the network.
        if (typeof GridBreakWatch !== 'undefined' && GridBreakWatch.any()) {
          GridBreakWatch.jumpNext();
          return;
        }
        let target = e._lightningDamaged ? e : null;
        if (!target) for (const o of EntityRegistry.all()) { if (o._lightningDamaged) { target = o; break; } }
        if (!target) return;
        const t = _centreWorld(target);
        Camera.recentreOn(t.wx, t.wy);
        EntityInfoPanel.open(target);
      },
    });
    _notifActive = true;
    // Say so when charge went with it, and only then — "lost 0% charge" on an
    // empty bank would read as a bug, and the line is noise on a building
    // that never stored anything.
    if (!opts.silent) {
      showToast(_lostPct > 0.005
                  ? `⚡ ${name} struck by lightning: ${Math.round(_lostPct * 100)}% stored charge lost, offline until repaired`
                  : `⚡ ${name} struck by lightning; offline until repaired`,
                '#ff6020', '#140800', '#702010');
    }
    return true;
  }

  /* ═══════════════════════════════════════════════════════════════
     DETONATIONS
     Storage is the one thing on the map that is holding a large amount
     of energy in one place when the bolt arrives. A substation or a
     battery block doesn't just go offline — the bank lets go all at
     once, and everything packed in around it goes with it.

     This is deliberately the harshest event in the game, because it is
     the only one the player can design their way out of entirely:
     stand your storage well clear of the city and a hit costs you one
     repair bill, pack it into the middle of a dense block and a single
     unlucky night takes the block with it. Every number below is tuned
     to make that spacing decision matter without being unsurvivable.
     ═══════════════════════════════════════════════════════════════ */

  // Blast radius in TILES:
  //
  //   r = (BASE + CHARGE * chargeFrac) * (capacity / CAP_REF)^0.4
  //
  // Two inputs, both of which the player controls. Capacity sets the
  // building's floor — a Battery Block is a bigger bomb than a MK1
  // substation no matter what — and the charge it happened to be holding
  // sets how much of that potential actually goes off. A bank sitting
  // empty at dawn barely pops; a full one at peak scatters the street.
  // The ^0.4 on capacity keeps a late-game bank from levelling half a map.
  //
  // CAP_REF is the MK1 Substation's capacity, so it reads as the baseline
  // and the other two land either side of it:
  //
  //   Battery Block   (  9,180 ≈  50 kWh)  empty → 1.7   full → 3.3 tiles
  //   Substation MK1  ( 27,540 ≈ 200 kWh)  empty → 2.6   full → 5.2 tiles
  //   Substation MK2  ( 49,320 = 450 kWh)  empty → 3.3   full → 6.6 tiles
  //
  // A full MK2 clearing most of seven tiles is the number this whole
  // feature is built around: that is most of a city block, and it is
  // entirely the player's choice whether there is a city block there to
  // clear. (MK2 was 60,280 ≈ 550 kWh and cleared 7.1; dropping it to 450 kWh
  // for the 125%-over-MK1 tiering pulled the blast in by half a tile.)
  const BLAST_BASE      = 2.6;
  const BLAST_CHARGE    = 2.6;
  const BLAST_CAP_REF   = 27540;
  const BLAST_CAP_EXP   = 0.4;
  // Fire zone. A detonation doesn't only crush what is close enough to be
  // crushed — it throws burning material across the whole block. Everything
  // within this radius catches, wires included, whatever the blast radius
  // happened to be. A small pop from a half-empty battery still starts a
  // neighbourhood fire; the charge level decides how much is FLATTENED,
  // not how much is set alight.
  const IGNITE_RADIUS   = 4;
  const BLAST_R_MIN     = 1.5;
  const BLAST_R_MAX     = 9;

  // Odds a building inside the radius is wrecked, from the rim inward.
  // Anything hugging the bank is gone; the outer ring is a coin toss, so
  // a couple of tiles of clearance is already worth buying.
  const BLAST_HIT_RIM   = 0.30;
  const BLAST_HIT_CORE  = 0.98;

  // Storage caught in a blast cooks off in turn, after a short fuse — the
  // fuse is what makes a row of banks read as a chain rather than one
  // simultaneous bang. Only the inner portion of the radius chains, or a
  // line of substations would detonate from one end of the map to the other.
  const CHAIN_FRACTION  = 0.6;
  const CHAIN_FUSE_MIN  = 0.35;    // seconds
  const CHAIN_FUSE_MAX  = 0.95;
  const CHAIN_MAX_DEPTH = 4;       // a chain eventually runs out of fuel

  // Storage CAN explode. Whether it actually does is a separate question,
  // answered by _isArmed below.
  function _isExplosive(e) { return isStorage(e); }

  // Generators that burn fuel or raise steam are bombs of a different kind:
  // what goes off is the engine block or the boiler, not stored charge, so
  // they carry a fixed `blastRadius` on their def instead of scaling with a
  // charge level. They are NOT lightning targets for detonation — a strike
  // on one is ordinary damage. They go up two ways only: a Fuel or Coal
  // Generator held at 100% heat/pressure for too long (MeltdownSystem), and
  // any of them standing close enough to another explosion to chain.
  // Rods don't suppress these either: a rod grounds a surge, it can't stop a
  // boiler bursting.
  const GEN_CHAIN_MAX_DEPTH = 10;   // a generator farm is allowed to go up row by row

  // A generator explosion doesn't knock things offline, it levels them.
  // Every building inside the blast radius is destroyed, and putting it back
  // costs a large share of what it's worth: REBUILD_MAX for the generator
  // itself and anything hugging it, easing to REBUILD_MIN at the rim.
  const REBUILD_MIN = 0.80;
  const REBUILD_MAX = 0.92;
  // Pipes, wires, poles and conveyor belts in the blast radius simply vanish.
  const BLAST_CLEARS = new Set([T.PIPE, T.UNDERGNDPIPE, T.WIRE, T.POLE, T.CONVEYOR]);

  // Prices an explosion wreck as a rebuild. A building already down and
  // waiting on a cheaper repair is upgraded; one with a crew on site is
  // flattened again and the crew's work is lost.
  function _markRebuild(e, frac) {
    e._rebuildFrac = Math.max(e._rebuildFrac || 0, frac);
    e._repairRemaining = undefined;
    e._repairTotal     = undefined;
  }

  // Removes every pipe, wire, pole and belt within rTiles of src — the
  // whole stack on each tile (a wire laid over a pipe goes with the pipe),
  // putting back any water tile a span was bridging. Returns how many
  // pieces went.
  function _clearLinear(src, rTiles) {
    const hits = [];
    for (const e of EntityRegistry.all()) {
      if (BLAST_CLEARS.has(e.type) && _edgeDist(src, e) <= rTiles) hits.push(e);
    }
    let n = 0;
    for (const top of hits) {
      const seen = new Set();
      let water = null;
      for (let l = top; l && !seen.has(l); l = l._underPipe || l._underWire || l._underConveyor) {
        seen.add(l);
        if (l._underWater) water = l._underWater;
        if (l._wireOnFire) clearWireFire(l);
        n++;
      }
      EntityRegistry.remove(top);
      if (GridManager.getEntity(top.col, top.row) === top) {
        if (water) GridManager.tiles[top.row][top.col] = water;
        else       GridManager.removeEntity(top.col, top.row, { wholeStack: true });
      }
    }
    return n;
  }
  /* ── Volatile contents ──────────────────────────────────────────
     Some buildings are dangerous for what is IN them rather than for the
     charge they hold or the boiler they run: a Gas Holder full of hydrogen,
     a tank of fuel oil, the hydrogen sitting in an Electrolyzer's buffer.
     A bolt, a neighbouring blast or a fire reaching one sets the contents
     off, and this is the biggest conventional explosion in the game: the
     radius scales with how full it is and how violent the stuff is, and
     everything inside it is levelled the way a generator blast levels it.

     Nitrogen, helium, water and acid are inert, and an empty vessel is
     just a building. What is stored, and how much, is the player's lever:
     keep volatile stock low, or keep it well away from everything else.

       r = (VOL_BASE + VOL_FILL * fill) * power      capped at VOL_R_MAX

       Gas Holder, hydrogen / deuterium / tritium   4.4 at 5% full, 12 full
       Gas Holder, ammonia                          2.4 to 6.6
       Liquid Tank, fuel oil                        2.8 to 7.7
       Liquid Tank, crude                           2.0 to 5.4
       Electrolyzer (its hydrogen buffer)           2.9 to 7.8
     ─────────────────────────────────────────────────────────────── */
  const VOL_BASE = 4, VOL_FILL = 8, VOL_R_MAX = 12, VOL_ARMED_FRAC = 0.05;
  const VOL_GAS    = { hydrogen: ['Hydrogen', 1], deuterium: ['Deuterium', 1], tritium: ['Tritium', 1], ammonia: ['Ammonia', 0.55] };
  const VOL_LIQUID = { oil: ['Crude oil', 0.45], fuel: ['Fuel oil', 0.64] };
  // What a building is holding that can go off: { what, held, cap, power,
  // empty() }, or null when it holds nothing volatile.
  function volatileOf(e) {
    if (!e || !e.type) return null;
    const d = EntityDefs[e.type] || {};
    const buf = (what, field, cap, power) => ({ what, held: e[field] || 0, cap: cap || 1, power, empty: () => { e[field] = 0; } });
    switch (e.type) {
      case T.GASSTORAGE: {
        const k = VOL_GAS[e._gasType], K = typeof GasStorageSystem !== 'undefined' && GasStorageSystem.KINDS[e._gasType];
        return k && K ? { what: k[0], held: e[K.field] || 0, cap: d.gasCapacity || 5000, power: k[1], empty: () => { e[K.field] = 0; e._gasType = null; } } : null;
      }
      case T.OILSTORAGE: {
        const k = VOL_LIQUID[e._liquidType || ((e._crude || 0) > 0 ? 'oil' : '')];
        return k ? { what: k[0], held: e._crude || 0, cap: typeof OilSystem !== 'undefined' ? OilSystem.getTankCapacity() : 500, power: k[1], empty: () => { e._crude = 0; e._liquidType = null; } } : null;
      }
      case T.ELECTROLYZER:   return buf('Hydrogen',  '_hydrogen',  d.hydrogenCapacity,  0.65);
      case T.WASHTOWER:      return buf('Deuterium', '_deuterium', d.deuteriumCapacity, 0.6);
      case T.TRITIUMBREEDER: return buf('Tritium',   '_tritium',   d.tritiumCapacity,   0.6);
      case T.HABERBOSCH:     return buf('Ammonia',   '_ammonia',   d.ammoniaCapacity,   0.4);
    }
    return null;
  }
  function _volFill(v) { return v && v.cap > 0 ? Math.max(0, Math.min(1, v.held / v.cap)) : 0; }
  function isVolatile(e) { const v = volatileOf(e); return !!v && _volFill(v) >= VOL_ARMED_FRAC; }
  // For the info panel: what would go off and how far, or null if it's safe.
  function hazardOf(e) {
    const v = volatileOf(e);
    if (!v || _volFill(v) < VOL_ARMED_FRAC) return null;
    return { what: v.what, radius: blastRadius(e) };
  }

  function isGeneratorBomb(e) {
    return !!(e && e.type && EntityDefs[e.type]?.blastRadius > 0);
  }

  // What a bank is holding is the bomb — the building is just the casing.
  // An empty one has nothing to let go of, so a bolt into it is an ordinary
  // strike: wrecked, offline, burning, repairable, and no blast.
  //
  // This is the other half of the siting decision. A bank that runs down
  // every night is genuinely safer to keep close than one held at full
  // charge as a reserve, and a player who understands that has a real lever
  // beyond "put it far away" — when the thing is charged is when it is
  // dangerous.
  //
  // The floor is a fraction of capacity rather than a flat zero: the last
  // half-percent of a bank produces a blast smaller than the building, and
  // a detonation that damages nothing reads as a bug rather than as mercy.
  const ARMED_MIN_FRAC = 0.02;
  function _isArmed(e, heldOverride) {
    // Volatile contents aren't emptied by the damage that lights the fuse, so
    // they are read live and the override (a bank's charge) doesn't apply.
    if (volatileOf(e)) return isVolatile(e);
    if (!_isExplosive(e)) return false;
    const cap  = e.def?.capacity || 0;
    if (cap <= 0) return false;
    const held = heldOverride == null ? (e.charge || 0) : heldOverride;
    return held / cap >= ARMED_MIN_FRAC;
  }

  // A rod covering a bank is a path to ground, and that is just as true of
  // a surge arriving from the bank's OWN cells as of one arriving out of the
  // cloud. A direct strike is already handled up in rollStrike — the rod
  // takes the bolt and the bank is never touched. This covers the two ways a
  // covered bank could still have gone up:
  //
  //   • a neighbouring detonation chaining into it
  //   • fire reaching it while it still holds charge
  //
  // Same protectionAt() roll as a strike, so the tiers and the stacking
  // maths stay identical and a rod's stated coverage means one thing
  // everywhere. A suppressed bank is NOT saved — it is still wrecked, still
  // burning, still needs paying for. What the rod buys is that the failure
  // stops there instead of taking the street with it, which is the whole
  // reason to spend on one.
  function _detonationSuppressed(e) {
    const rods = rodsCovering(e);
    if (rods.length === 0 || Math.random() >= protectionAt(e)) return false;
    const rod = rods[0].rod;
    rod._rodGlowUntil    = performance.now() + 2000;
    rod._strikesAbsorbed = (rod._strikesAbsorbed || 0) + 1;
    const c = _centreWorld(rod);
    Particles.spawn(c.wx, c.wy, '#a0e0ff', 12);
    showToast(`⚡ Lightning Rod grounded ${e.businessName || e.def?.label || 'a bank'}: no detonation`,
              '#60c0ff', '#00101c', '#204060', 'rodground');
    return true;
  }

  // `chargeOverride` is the charge the bank was holding at the moment it was
  // committed to blowing up. A chain victim is wrecked (and therefore
  // emptied) by the blast that lit its fuse, so by the time the fuse burns
  // down its live charge reads 0 — the stored figure is what it was actually
  // carrying, and that is what goes off.
  function blastRadius(e, chargeOverride) {
    if (isGeneratorBomb(e)) return Math.max(BLAST_R_MIN, Math.min(BLAST_R_MAX, EntityDefs[e.type].blastRadius));
    const vol = volatileOf(e);
    if (vol) return Math.max(BLAST_R_MIN, Math.min(VOL_R_MAX, (VOL_BASE + VOL_FILL * _volFill(vol)) * vol.power));
    if (!_isExplosive(e)) return 0;
    const cap  = e.def.capacity || 1;
    const held = chargeOverride == null ? (e.charge || 0) : chargeOverride;
    const frac = Math.max(0, Math.min(1, held / cap));
    const r    = (BLAST_BASE + BLAST_CHARGE * frac)
               * Math.pow(cap / BLAST_CAP_REF, BLAST_CAP_EXP);
    return Math.max(BLAST_R_MIN, Math.min(BLAST_R_MAX, r));
  }

  // Pending chain detonations: { e, at } in wall-clock seconds.
  const _fuses = [];

  // Active blast visuals, drawn by renderStrikes().
  // { wx, wy, t0, r, debris:[...] }
  const _blasts = [];
  // Long enough for the whole sequence to read as one event with a shape to
  // it — flash, fireball, shockwave, debris arc, cook-offs, and a column
  // that is still climbing as the fires underneath take over.
  const BLAST_LIFE = 2.8;

  function _spawnBlastVisual(wx, wy, rTiles, isGen = false) {
    // Every random choice is made ONCE, here, and replayed by the renderer.
    // Rolling them per frame would turn the whole thing into static — the
    // blast has to be a fixed piece of choreography that the clock scrubs
    // through, not a new random picture sixty times a second.

    // ── Debris: chunks of the building thrown clear on ballistic arcs.
    const debris = [];
    const nDebris = 22 + (rTiles * 6 | 0);
    for (let i = 0; i < nDebris; i++) {
      debris.push({
        a: Math.random() * Math.PI * 2,
        // Most of it lands short; a few pieces carry well past the rim.
        dist: TILE * rTiles * (0.35 + Math.random() * Math.random() * 1.45),
        size: 1.2 + Math.random() * 3.2,
        spin: (Math.random() - 0.5) * 16,
        // Staggered arcs, so the shower isn't one synchronised burst.
        lift: 0.55 + Math.random() * 1.15,
        delay: Math.random() * 0.09,
        // Heavy pieces trail smoke; small ones are just sparks.
        trail: Math.random() < 0.45,
      });
    }

    // ── Sparks: fast, thin, gone almost immediately. These are what give
    //    the first moment its violence — the fireball alone expands too
    //    smoothly to read as an explosion rather than a bloom.
    const sparks = [];
    const nSparks = 40 + (rTiles * 10 | 0);
    for (let i = 0; i < nSparks; i++) {
      sparks.push({
        a: Math.random() * Math.PI * 2,
        dist: TILE * rTiles * (0.6 + Math.random() * 1.5),
        life: 0.16 + Math.random() * 0.22,
        delay: Math.random() * 0.05,
        len: 4 + Math.random() * 14,
      });
    }

    // ── Fireball: not a circle but a cluster of billows, each at its own
    //    angle, reach and speed, so it has a lumpy, torn edge and expands
    //    unevenly — the difference between an explosion and a radial
    //    gradient. Sorted outermost first, the order renderBlasts paints
    //    them in, so the hot heart sits over the cooler rim.
    const fire = [];
    const nFire = 16 + Math.min(10, rTiles * 2 | 0);
    for (let i = 0; i < nFire; i++) {
      fire.push({
        a: Math.random() * Math.PI * 2,
        reach: 0.1 + Math.sqrt(Math.random()) * 0.75,
        size:  0.24 + Math.random() * 0.24,
        speed: 0.8 + Math.random() * 0.5,
        lift:  Math.random(),                  // how far it climbs as the ball lifts
        heat:  Math.random() * 0.2 - 0.1,      // runs a little hotter or cooler
        ph:    Math.random() * 10,
        soot:  Math.random() < 0.6,            // turns to soot as the ball cools
      });
    }
    fire.sort((p, q) => q.reach - p.reach);

    // ── Jets: two or three narrow tongues of flame punched out of the
    //    wreck along whatever gave way first, outrunning the fireball.
    const jets = [];
    const nJets = 2 + (Math.random() * 2 | 0);
    for (let i = 0; i < nJets; i++) {
      jets.push({
        a: Math.random() * Math.PI * 2,
        reach: 1.1 + Math.random() * 0.7,
        width: 0.035 + Math.random() * 0.04,
        delay: Math.random() * 0.06,
      });
    }

    // ── Cook-offs: smaller secondary pops inside the wreck over the next
    //    second and a half, as whatever didn't go up in the first bang
    //    does. The tail of the sequence, and the thing that keeps the
    //    player's eye on the site while the fires establish.
    const pops = [];
    const nPops = 3 + (rTiles | 0);
    for (let i = 0; i < nPops; i++) {
      pops.push({
        a: Math.random() * Math.PI * 2,
        d: TILE * rTiles * 0.45 * Math.random(),
        at: 0.18 + Math.random() * 0.55,       // fraction of BLAST_LIFE
        size: 0.12 + Math.random() * 0.2,
      });
    }

    // ── Mushroom column: stacked billows that lift and broaden. Seeded with
    //    their own phases so the stack rises as a body rather than a ring.
    //    Sorted by delay: at any moment the earliest is the highest, so in
    //    this order renderBlasts paints the column top down.
    const column = [];
    for (let i = 0; i < 20; i++) {
      column.push({
        a: Math.random() * Math.PI * 2,
        spread: 0.2 + Math.random() * 0.9,
        rise: 0.6 + Math.random() * 0.9,
        size: 0.2 + Math.random() * 0.24,
        delay: Math.random() * 0.32,
        ph: Math.random() * 10,
      });
    }
    column.sort((p, q) => p.delay - q.delay);

    _blasts.push({ wx, wy, t0: _now(), r: TILE * rTiles,
                   debris, sparks, fire, jets, pops, column });

    Particles.spawn(wx, wy, '#fff2c0', 34);
    Particles.spawn(wx, wy, '#ff9020', 38);
    Particles.spawn(wx, wy, '#ff3808', 30);
    Particles.spawn(wx, wy, '#3a3028', 26);

    // Shake scales with the blast but saturates — a big one should feel
    // heavier than a small one without making the screen unreadable. A
    // second, smaller kick as the shockwave passes gives it a one-two
    // rather than a single thump.
    //
    // Fired at full strength regardless of where the camera is pointed, and
    // NOT attenuated by distance from the viewport. The camera never chases
    // the explosion, so the shake is the only thing that tells a player
    // looking at the far side of their grid that something just went up —
    // it is the cue to go read the notification, not set dressing for a
    // view they already have.
    Camera.shake?.(9 + rTiles * 3.2);
    setTimeout(() => Camera.shake?.(2 + rTiles * 0.8), 180);
    if (isGen) {
      // A burst boiler or engine block: a heavier report than a bank's arc
      // flash, a third rumble as the wreck settles, and a pall of black
      // smoke off the burning fuel.
      setTimeout(() => Camera.shake?.(4 + rTiles * 0.6), 520);
      Particles.spawn(wx, wy, '#1a1614', 30);
      Particles.spawn(wx, wy, '#ffd040', 24);
      SFX.generatorExplosion?.();
      return;
    }
    // The blast itself, plus the arc flash off the ruptured bank. The old
    // stacked thunder claps stood in for an explosion before there was a
    // sample for one; a single dedicated report reads cleaner under the
    // strike crack that precedes it.
    SFX.lightningExplosion?.();
    SFX.spark?.();
  }

  // An Advanced Fusion Reactor quench: the coils' stored field energy dumps
  // through the leads and arcs across the hall. Knocks things out rather than
  // levelling them, and lights nothing off in a chain: each building within
  // rTiles of the reactor's edge may be wrecked (likelier close in), and
  // cable in the inner half of the radius catches fire. The reactor itself
  // isn't wrecked; its coil repair is its own lock-out. Counted as
  // 'meltdown' origin so it doesn't feed the Lightning Rod unlocks.
  // Returns the number of buildings wrecked.
  function quenchDischarge(src, rTiles) {
    let wrecked = 0;
    for (const { e: v, d } of _entitiesInBlast(src, rTiles)) {
      if (isWire(v)) { if (d <= rTiles * 0.5) _igniteWire(v); continue; }
      if (v._lightningDamaged) continue;
      const p = rTiles > 0 ? Math.max(0, 1 - d / rTiles) : 0;
      if (Math.random() < 0.2 + 0.6 * p && _damage(v, { silent: true, cause: 'blast', origin: 'meltdown' })) wrecked++;
    }
    const c = _centreWorld(src);
    for (let q = 0; q < 6; q++) _spawnVisual(c.wx + (Math.random() - 0.5) * (src.width || 1) * TILE, c.wy + (Math.random() - 0.5) * (src.height || 1) * TILE, false);
    return wrecked;
  }

  // Everything whose footprint falls inside the blast, nearest first.
  // Everything the blast reaches, nearest first. `rTiles` here is the
  // SWEEP radius, which is the larger of the blast proper and the ignition
  // ring — wires included, because a detonation sets the cable alight the
  // same as it sets the street alight.
  function _entitiesInBlast(src, rTiles) {
    const out = [];
    const seen = new Set();
    for (const e of EntityRegistry.all()) {
      if (e === src || seen.has(e)) continue;
      seen.add(e);
      if (!isFlammable(e)) continue;        // terrain, vehicles, rods
      const d = _edgeDist(src, e);
      if (d > rTiles) continue;
      out.push({ e, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  // The main event. `depth` tracks how far down a chain we are.
  // `origin` is 'meltdown' for a cascade that started with a generator
  // exploding, and rides along every chain fuse it lights.
  function _explode(e, depth = 0, chargeOverride, origin = 'lightning') {
    const isGen  = isGeneratorBomb(e);
    // Read before anything is emptied: what it was holding sets the radius.
    const vol    = isGen ? null : volatileOf(e);
    const heavy  = isGen || !!vol;      // levels what it reaches, rather than knocking it offline
    const rTiles = blastRadius(e, chargeOverride);
    const cap    = e.def?.capacity || 0;
    const held   = chargeOverride == null ? (e.charge || 0) : chargeOverride;
    const frac   = cap > 0 ? Math.max(0, Math.min(1, held / cap)) : 0;
    const name   = e.businessName || (e.def?.label || (isGen ? 'Generator' : 'Storage'))
                 + (isGen && e._num !== undefined ? ` #${e._num}` : '');

    // The source is wrecked and emptied first, so it can't be caught by its
    // own blast sweep or re-detonated by a neighbour's.
    _damage(e, { silent: true, cause: 'blast', origin });
    _totalExplosions++;
    if (isGen) {
      // Whatever was in the engine or boiler went with it.
      if (e.type === T.FUELGEN) { e._fgHeat = 0; e._fgRpm = 0; e._fgIgnited = false; e._fuelTank = 0; }
      if (e.type === T.COALGENERATOR) { e._cgPressure = 0; e._hopperCoal = 0; }
      e._meltdown = 0;
      _markRebuild(e, REBUILD_MAX);
      _totalGenExplosions++;
    }
    if (vol) { vol.empty(); _markRebuild(e, REBUILD_MAX); }

    const c = _centreWorld(e);
    _spawnBlastVisual(c.wx, c.wy, rTiles, heavy);

    let wrecked = 0;
    let lit     = 0;
    let chained = 0;   // generators this blast set on a fuse
    // Generator blasts wipe pipes, wires and belts off the map before the
    // building sweep, so none of it is left to smoulder.
    const cleared = heavy ? _clearLinear(e, rTiles) : 0;
    const sweep = Math.max(rTiles, IGNITE_RADIUS);
    for (const { e: victim, d } of _entitiesInBlast(e, sweep)) {
      // Cable in the fire zone burns, wherever it runs. This is the part
      // that carries the event out past the crater.
      if (isWire(victim)) {
        if (d <= IGNITE_RADIUS && _igniteWire(victim)) lit++;
        continue;
      }

      // Read what a bank is holding BEFORE the blast wrecks (and empties)
      // it, so a chain fuse detonates the energy it actually had.
      const heldBefore = victim.charge || 0;

      // 1 at the centre, 0 at the rim.
      const p = rTiles > 0 ? Math.max(0, 1 - d / rTiles) : 0;
      const chance = BLAST_HIT_RIM + (BLAST_HIT_CORE - BLAST_HIT_RIM) * p;

      if (heavy && d <= rTiles) {
        // Generator or volatile blast: everything inside the radius is destroyed outright,
        // and priced as a rebuild — dearer the closer it stood.
        if (_damage(victim, { silent: true, cause: 'blast', origin })) wrecked++;
        else if (victim._fireCause !== 'blast') { victim._fireCause = 'blast'; wrecked++; }
        _markRebuild(victim, REBUILD_MIN + (REBUILD_MAX - REBUILD_MIN) * p);
      } else if (!victim._lightningDamaged) {
        if (d <= rTiles && Math.random() < chance) {
          // Inside the blast proper: wrecked by the pressure.
          if (_damage(victim, { silent: true, cause: 'blast', origin })) wrecked++;
        } else if (d <= IGNITE_RADIUS) {
          // Outside it, or lucky enough to survive the pressure, but still
          // inside the fire zone. The building itself is intact — it is
          // burning, and burning is its own problem.
          if (_damage(victim, { silent: true, cause: 'fire', origin })) { lit++; _totalBurned++; }
        }
      }

      // Anything explosive close in cooks off too — including buildings the
      // blast itself just wrecked, since a wrecked bank is still a full one.
      // A fuel or steam generator in the inner blast always goes: there is no
      // "empty" engine block, and no rod that can ground a burst boiler.
      // Nor one that can stop a tank of hydrogen that is already burning.
      const genVictim = isGeneratorBomb(victim) || !!volatileOf(victim);
      if ((isGeneratorBomb(victim) || _isArmed(victim, heldBefore)) && p >= (1 - CHAIN_FRACTION)
          && depth < (genVictim ? GEN_CHAIN_MAX_DEPTH : CHAIN_MAX_DEPTH) && !victim._detonated) {
        victim._detonated = true;   // claimed, so two blasts can't double-fuse it
        if (!genVictim && _detonationSuppressed(victim)) continue;
        if (genVictim) chained++;
        _fuses.push({
          e: victim,
          depth: depth + 1,
          held: heldBefore,
          origin,
          at: _now() + CHAIN_FUSE_MIN + Math.random() * (CHAIN_FUSE_MAX - CHAIN_FUSE_MIN),
        });
      }
    }

    PowerNetwork.recomputeWireHops();

    // One headline for the whole event. Chained blasts stay quiet — the
    // player is already watching the screen come apart, and four toasts
    // about it is noise.
    if (isGen) {
      _generatorHeadline(e, name, depth, wrecked, lit, chained, cleared, c);
    } else if (vol) {
      if (depth > 0) { /* chained: quiet, the first blast's card already counts it */ }
      else {
        NotificationStack.dismissTag('lightningdamage');
        _dismissStrikeCard(e);
        const hit = wrecked + lit;
        NotificationStack.push({
          icon: '💥',
          title: `${vol.what} Explosion`,
          message: chained > 0
            ? `${name} went up and set off ${chained} more: everything within ${Math.round(rTiles)} tiles is destroyed`
            : hit > 0
            ? `${name} exploded and destroyed ${hit} building${hit === 1 ? '' : 's'} within ${Math.round(rTiles)} tiles: rebuilding costs 80–92% of their value`
            : `${name} exploded: rebuilding it costs 92% of its value`,
          color: '#ff6020', border: '#802818',
          tag: 'lightningdamage', glow: true,
          onClick: () => { Camera.recentreOn(c.wx, c.wy); EntityInfoPanel.open(e); },
        });
        _notifActive = true;
      }
    } else if (depth === 0) {
      // Same as the generator headline: replace the generic card _damage()
      // put up, or push() would keep it and drop this one.
      NotificationStack.dismissTag('lightningdamage');
      _dismissStrikeCard(e);
      NotificationStack.push({
        icon: '💥',
        title: 'Storage Detonation',
        message: (wrecked + lit) > 0
          ? `${name} blew up and set ${wrecked + lit} nearby building${(wrecked + lit) === 1 ? '' : 's'} alight: fire will spread`
          : `${name} blew up: repair it before the fire spreads`,
        color: '#ff6020', border: '#802818',
        tag: 'lightningdamage', glow: true,
        onClick: () => { Camera.recentreOn(c.wx, c.wy); EntityInfoPanel.open(e); },
      });
      _notifActive = true;
    }
  }

  // Wording for a generator going up. The one that started it gets the
  // headline and the card; the ones it takes down with it stay quiet (the
  // card counts them; a CHAIN REACTION toast each was noise).
  function _generatorHeadline(e, name, depth, wrecked, lit, chained, cleared, c) {
    if (depth > 0) return;
    // _damage() already put up a generic card under this tag while wrecking
    // the source, and push() keeps the first card for a tag — clear it so
    // the headline actually shows.
    NotificationStack.dismissTag('lightningdamage');
    _dismissStrikeCard(e);
    const hit = wrecked + lit;
    NotificationStack.push({
      icon: '💥',
      title: 'Generator Explosion',
      message: chained > 0
        ? `${name} exploded and set off ${chained} neighbouring generator${chained === 1 ? '' : 's'}: fit Throttle Governors`
        : hit > 0
        ? `${name} exploded and destroyed ${hit} building${hit === 1 ? '' : 's'}: rebuilding costs 80–92% of their value`
        : `${name} exploded: rebuilding it costs 92% of its value`,
      color: '#ff6020', border: '#802818',
      tag: 'lightningdamage', glow: true,
      onClick: () => { Camera.recentreOn(c.wx, c.wy); EntityInfoPanel.open(e); },
    });
    _notifActive = true;
  }

  // Blows a generator up on the spot. Called by MeltdownSystem when a Fuel or
  // Coal Generator has sat at 100% heat/pressure past its meltdownSeconds.
  // Returns false if it couldn't (already wrecked, or not a generator bomb).
  function detonateGenerator(e) {
    if (!isGeneratorBomb(e) || e._lightningDamaged || e._detonated) return false;
    e._detonated = true;
    _explode(e, 0, undefined, 'meltdown');
    return true;
  }

  /* ═══════════════════════════════════════════════════════════════
     NUCLEAR MELTDOWN
     A reactor left running without cooling overheats (NuclearSystem's
     core heat), hits critical, and — if nobody connects a Cooling Tower
     or cuts its fuel in time — goes up here. This is deliberately NOT a
     scaled-up generator blast: it is a city-ending event.

       inner radius   everything is destroyed and priced as a rebuild,
                      every pipe / wire / pole / belt is erased, trees
                      are flattened
       outer ring     buildings set alight (odds fall off with distance),
                      cable burns and carries the fire further
       anywhere in    generators and charged banks cook off on short
       the sweep      fuses; another RUNNING reactor goes nuclear too

     Then a scorched crater under a green fallout haze that fades over
     several minutes, so the player can see exactly what was lost.
     ═══════════════════════════════════════════════════════════════ */
  const NUKE_RADIUS      = 72;    // tiles, footprint edge out — total destruction
  const NUKE_FIRE_RADIUS = 104;   // tiles — the burning ring beyond it
  const NUKE_LIFE        = 14;    // seconds of detonation visuals
  // The fireball and mushroom cloud are drawn at this fraction of the
  // destruction radius — at full size the cloud alone would be several
  // screens across. The shockwaves, crater and fallout ring stay true to
  // the damage so the player can read exactly how far it reached.
  const NUKE_CLOUD_SCALE = 0.55;
  const _nukes   = [];
  // Permanent blast scars: { wx, wy, R, seed }. Saved with the world and
  // drawn on the ground layer under everything (renderScars), so a city
  // rebuilt over ground zero still sits on the burn. The streak pattern is
  // regenerated from `seed`, so a save only carries four numbers per scar.
  const _scars   = [];
  /* ── Contamination ─────────────────────────────────────────────────
     A detonation poisons the ground around it for in-game days, sized to
     the disaster: the destruction radius is the inner (severe) zone, the
     burn ring the outer (unsafe) one, and the outer zone always runs one
     stage milder. Stages by in-game hours since the blast, inner zone:

       0–48    🔴 Highly contaminated   no construction at all
       48–288  🟠 Hazardous             demolition, plus wires / poles /
                                        pipes / belts / roads only
       288–408 🟡 Residual              building allowed at +50% cost
       408+    🟢 Recovered             zone lifted

     Hazardous lasts a full 10 days (to day 12 after the blast), whatever
     the blast was. It used to end on day 10, only 8 days of it.

     Measured from the source's footprint edge, like the blast itself, and
     on game time — it doesn't tick while paused. Enforced at placement
     (checkPlacement, called by InputManager.tryPlace).
     ─────────────────────────────────────────────────────────────────── */
  const CONTAM_STAGES = [{ until: 48, level: 3 }, { until: 288, level: 2 }, { until: 408, level: 1 }];
  const CONTAM_LEVELS = {
    3: { name: 'Highly contaminated',    icon: '🔴', rgb: '255,50,30'  },
    2: { name: 'Hazardous',              icon: '🟠', rgb: '255,140,30' },
    1: { name: 'Residual contamination', icon: '🟡', rgb: '235,215,40' },
  };
  const CONTAM_BUILD_MULT = 1.5;
  const CONTAM_LINES = new Set([T.WIRE, T.POLE, T.POWERTOWER, T.PIPE, T.UNDERGNDPIPE, T.CONVEYOR, T.ROAD]);
  const _zones = [];   // { col, row, w, h, rIn, rOut, t0 (game hours), lastLevel }

  function _gameHours() { return DayNight.getElapsed() / DayNight.secondsPerGameHour(); }
  function _innerLevel(z) {
    const h = _gameHours() - z.t0;
    for (const s of CONTAM_STAGES) if (h < s.until) return s.level;
    return 0;
  }
  function _hoursToNextStage(z) {
    const h = _gameHours() - z.t0;
    for (const s of CONTAM_STAGES) if (h < s.until) return s.until - h;
    return 0;
  }
  // Rounded up to whole hours BEFORE splitting into days, or 47.5h read as
  // "1d 24h" instead of "2d 0h".
  function _fmtHours(h) {
    const H = Math.ceil(h), d = Math.floor(H / 24), hr = H - d * 24;
    return d > 0 ? `${d}d ${hr}h` : `${hr}h`;
  }
  // Tiles between a w×h footprint at (col,row) and a zone's source footprint.
  function _zoneDist(z, col, row, w, h) {
    const dx = Math.max(0, z.col - (col + w), col - (z.col + z.w));
    const dy = Math.max(0, z.row - (row + h), row - (z.row + z.h));
    return Math.hypot(dx, dy);
  }
  // Worst contamination touching a footprint: { level, hoursLeft } (level 0 = clean).
  function contaminationAt(col, row, w = 1, h = 1) {
    let best = { level: 0, hoursLeft: 0 };
    for (const z of _zones) {
      if (!_zoneHere(z)) continue;
      const inner = _innerLevel(z);
      if (inner === 0) continue;
      const d = _zoneDist(z, col, row, w, h);
      const lvl = d <= z.rIn ? inner : d <= z.rOut ? Math.max(0, inner - 1) : 0;
      if (lvl > best.level) best = { level: lvl, hoursLeft: _hoursToNextStage(z) };
    }
    return best;
  }
  // Placement rule: { ok, mult, msg }.
  function checkPlacement(type, col, row, w = 1, h = 1) {
    const c = contaminationAt(col, row, w, h);
    if (c.level === 3) return { ok: false, mult: 1, msg: `☢ Highly contaminated ground; no construction for another ${_fmtHours(c.hoursLeft)}` };
    if (c.level === 2 && !CONTAM_LINES.has(type)) return { ok: false, mult: 1, msg: `☢ Hazardous ground: only wires, poles, pipes, belts and roads for another ${_fmtHours(c.hoursLeft)}` };
    if (c.level === 1 && !CONTAM_LINES.has(type)) return { ok: true, mult: CONTAM_BUILD_MULT, msg: `☢ Residual contamination: +${Math.round((CONTAM_BUILD_MULT - 1) * 100)}% decontamination cost` };
    return { ok: true, mult: 1, msg: null };
  }
  // Live zones for other views (the world map): footprint, radii, the
  // inner/outer stage right now and hours to the next step down.
  function getContaminationZones() {
    const out = [];
    for (const z of _zones) {
      if (!_zoneHere(z)) continue;
      const inner = _innerLevel(z);
      if (inner === 0) continue;
      const lv = (l) => l > 0 ? { level: l, ...CONTAM_LEVELS[l] } : null;
      out.push({ col: z.col, row: z.row, w: z.w, h: z.h, rIn: z.rIn, rOut: z.rOut,
                 inner: lv(inner), outer: lv(inner - 1),
                 hoursLeft: _hoursToNextStage(z), hoursLabel: _fmtHours(_hoursToNextStage(z)) });
    }
    return out;
  }
  // A zone belongs to the world it was made in: the player's own, or the
  // job site they are standing on (`site`). The two share tile coordinates,
  // so each only counts, shows and ticks in its own world.
  function _zoneHere(z) {
    const atSite = typeof ContractSystem !== 'undefined' && !!ContractSystem.isAtSite && ContractSystem.isAtSite();
    return !!z.site === atSite;
  }
  // Worst stage of any live blast zone in this world (3 highly contaminated,
  // 2 hazardous, 1 residual, 0 none) and how many zones are live. What the
  // public, City Score and the smog grid react to, so each eases off as the
  // zone steps down and stops when it recovers.
  function falloutLevel() {
    let lvl = 0;
    for (const z of _zones) if (_zoneHere(z)) lvl = Math.max(lvl, _innerLevel(z));
    return lvl;
  }
  function falloutZoneCount() {
    let n = 0;
    for (const z of _zones) if (_zoneHere(z) && _innerLevel(z) > 0) n++;
    return n;
  }
  const CHAIN_ZONE_GROWTH = 1.5;   // each further core in a chain: blast and fallout zone this much bigger
  const CHAIN_GROWTH_CAP  = 5;     // growth stops at the 5th core (5.1× one core)
  function _addZone(src, rIn, rOut) {
    const z = { col: src.col, row: src.row, w: src.width || 1, h: src.height || 1, rIn, rOut, t0: _gameHours(), lastLevel: 3 };
    _zones.push(z);
    return z;
  }
  // Called from tick(): announce each step down, lift recovered zones.
  function _tickZones() {
    for (let i = _zones.length - 1; i >= 0; i--) {
      const z = _zones[i];
      if (!_zoneHere(z)) continue;
      const lvl = _innerLevel(z);
      if (lvl === z.lastLevel) continue;
      z.lastLevel = lvl;
      if (lvl === 0) {
        _zones.splice(i, 1);
        showToast('🟢 The blast zone has RECOVERED; normal construction is allowed again', '#60e080', '#001408', '#0a4020', 'contam');
      } else {
        const L = CONTAM_LEVELS[lvl];
        const what = lvl === 2 ? 'wires, poles, pipes, belts and roads can go back in'
                   : 'building is allowed again, at a decontamination surcharge';
        showToast(`${L.icon} Blast zone contamination down to ${L.name.toUpperCase()}: ${what}`, '#ffd040', '#141000', '#806020', 'contam');
      }
    }
  }
  function _drawZones(ctx) {
    if (_zones.length === 0) return;
    const now = _now();
    for (const z of _zones) {
      if (!_zoneHere(z)) continue;
      const inner = _innerLevel(z);
      if (inner === 0) continue;
      const x = z.col * TILE, y = z.row * TILE, w = z.w * TILE, h = z.h * TILE;
      const pulse = 0.5 + 0.5 * Math.sin(now * 1.6);
      for (const [r, lvl] of [[z.rOut, inner - 1], [z.rIn, inner]]) {
        if (lvl <= 0) continue;
        const rp = r * TILE, L = CONTAM_LEVELS[lvl];
        ctx.beginPath(); ctx.roundRect(x - rp, y - rp, w + 2 * rp, h + 2 * rp, rp);
        ctx.fillStyle = `rgba(${L.rgb},${(0.07 + 0.03 * pulse).toFixed(3)})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(${L.rgb},0.75)`;
        ctx.lineWidth = Math.max(2, 3.5 / Camera.zoom);
        ctx.setLineDash([16 / Camera.zoom, 11 / Camera.zoom]); ctx.lineDashOffset = -now * 18 / Camera.zoom;
        ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }
      // label above ground zero, sized in screen px
      const L = CONTAM_LEVELS[inner];
      const next = inner === 1 ? 'recovers' : `→ ${CONTAM_LEVELS[inner - 1].name}`;
      const label = `☢ ${L.name.toUpperCase()} · ${next} in ${_fmtHours(_hoursToNextStage(z))}`;
      const fs = Math.max(11, 16 / Camera.zoom);
      ctx.font = `bold ${fs}px Courier New`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width;
      const lx = x + w / 2, ly = y - fs * 2;
      ctx.fillStyle = 'rgba(16,6,2,0.85)';
      ctx.beginPath(); ctx.roundRect(lx - tw / 2 - fs * 0.6, ly - fs * 0.8, tw + fs * 1.2, fs * 1.6, fs * 0.3); ctx.fill();
      ctx.strokeStyle = `rgba(${L.rgb},0.9)`; ctx.lineWidth = Math.max(1, 1.5 / Camera.zoom); ctx.stroke();
      ctx.fillStyle = `rgb(${L.rgb})`; ctx.fillText(label, lx, ly);
      ctx.textBaseline = 'alphabetic';
    }
  }

  function _scarStreaks(sc) {
    if (sc._streaks) return sc._streaks;
    let s = (sc.seed >>> 0) || 1;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    sc._streaks = Array.from({ length: 64 }, () => ({ a: rnd() * Math.PI * 2, len: 0.45 + rnd() * 0.75, w: 0.6 + rnd() * 1.6 }));
    return sc._streaks;
  }

  // rTiles: the cluster-scaled destruction radius, so a multi-core blast
  // draws a correspondingly bigger fireball and crater.
  // `quiet` suppresses the SFX volley and the camera shake waves — the
  // Advanced Reactor apocalypse wants the mushroom and the scar but scores
  // its own audio against a music cue, and mixing the two just muddied both.
  function _spawnNukeVisual(wx, wy, rTiles, quiet) {
    const R = (rTiles || NUKE_RADIUS) * TILE;
    const rnd = Math.random;
    const puffs = (n, f) => Array.from({ length: n }, f);
    // Everything below is billows (see _fireBillow / _smokeBillow), the
    // cooling-tower steam's method at the scale of a city.
    // The fireball: a roiling cluster, outermost first so the heart is on top.
    const ball   = puffs(46, () => ({ a: rnd() * Math.PI * 2, d: Math.sqrt(rnd()) * 0.85, s: 0.22 + rnd() * 0.22, spd: 0.6 + rnd() * 0.8, ph: rnd() * 6, heat: rnd() * 0.16 - 0.08 }))
                     .sort((p, q) => q.d - p.d);
    // The cap: a full dome of cloud over the fireball, heaviest at its rim.
    // Many small billows rather than a few big ones: at this scale a few big
    // ones read as cotton balls, and the cauliflower texture is in the count.
    const cap    = puffs(76, () => ({ a: rnd() * Math.PI * 2, d: 0.2 + Math.sqrt(rnd()) * 0.85, s: 0.17 + rnd() * 0.24, ph: rnd() * 6 }));
    const skirt  = puffs(40, () => ({ a: rnd() * Math.PI * 2, d: 0.9 + rnd() * 0.5,  s: 0.14 + rnd() * 0.18, ph: rnd() * 6 }));
    const stem   = puffs(44, (_, i) => ({ h: i / 43, off: (rnd() - 0.5) * 0.6, s: 0.4 + rnd() * 0.35, ph: rnd() * 6 }));
    // Base surge: the dust the first shock front throws up, rolling out low
    // along the ground. Wilson ring: the white condensation cloud that
    // flashes into being just behind the front and evaporates.
    const surge  = puffs(90, (_, i) => ({ a: (i + rnd()) / 90 * Math.PI * 2, d: 0.8 + rnd() * 0.4, s: 0.4 + rnd() * 0.9, ph: rnd() * 6 }));
    const wilson = puffs(80, (_, i) => ({ a: (i + rnd()) / 80 * Math.PI * 2, d: 0.9 + rnd() * 0.2, s: 0.5 + rnd() * 0.7 }));
    const embers = puffs(240, () => ({ a: rnd() * Math.PI * 2, dist: R * (0.2 + rnd() * 1.3), life: 1.8 + rnd() * 3.5, delay: rnd() * 0.6, size: 1.5 + rnd() * 4, lift: 0.4 + rnd() * 1.4 }));
    // Buildings cooking off as the shock front rolls over them.
    const pops   = puffs(46, () => { const d = 0.35 + rnd() * 0.7; return { a: rnd() * Math.PI * 2, d, at: 0.25 + d * 1.9 + rnd() * 0.3, size: 1.6 + rnd() * 2.6 }; });
    _nukes.push({ wx, wy, R, t0: _now(), ball, cap, skirt, stem, surge, wilson, embers, pops });
    _scars.push({ wx, wy, R, seed: Math.floor(Math.random() * 4294967295) });

    for (const col of ['#ffffff', '#fff2c0', '#ffb040', '#ff5010', '#3a3028', '#1a1614']) Particles.spawn(wx, wy, col, 80);
    if (quiet) return;
    // The biggest thing the game can do to the camera, in waves as the
    // shock, the fireball and the collapse pass.
    Camera.shake?.(120);
    for (const [ms, m] of [[180, 90], [520, 70], [1000, 50], [1700, 38], [2600, 26], [3800, 16], [5200, 9]]) setTimeout(() => Camera.shake?.(m), ms);
    SFX.generatorExplosion?.(1);
    setTimeout(() => SFX.lightningExplosion?.(1), 80);
    setTimeout(() => SFX.generatorExplosion?.(0.9), 500);
    setTimeout(() => SFX.thunder?.(1), 900);
    setTimeout(() => SFX.generatorExplosion?.(0.6), 1500);
    setTimeout(() => SFX.thunder?.(0.8), 2400);
    setTimeout(() => SFX.thunder?.(0.6), 4200);
  }

  /* Reactors caught in a nuclear blast go up in a CHAIN, each in its own
     full-size detonation, nearest first. (They used to be folded into one
     bigger blast centred on the first core, and a fuelled core that wasn't
     generating at that moment was merely wrecked, so a four-reactor plant
     read as one explosion.) Each blast can catch more cores in turn.

     A core chains when it holds fuel, is running, is hot or is already
     melting down: a breached core with rods in it is the runaway. An
     emptied core is just a wrecked building. */
  let _lastNukeAt = -1e9;   // wall-clock time of the last home-world detonation (approval hit)
  function _coreCanChain(v) {
    return v.type === T.NUCLEARREACTOR && !v._detonated && !v._nukeFused &&
      ((v._rodBuffer || 0) > 0 || v._generating || (v._coreHeat || 0) > 0 || (v._meltdown || 0) > 0);
  }

  // Vehicles never come through _entitiesInBlast (isFlammable skips them),
  // which left trucks driving round ground zero untouched. Swept here
  // instead: inside the destruction radius a truck is gone; out in the burn
  // ring it takes the same odds as a building there. Removed the way the
  // Delete tool removes one (its panel closes itself once the truck is gone).
  function _destroyTrucksInBlast(src, R, RF) {
    if (typeof TruckSystem === 'undefined') return 0;
    let n = 0;
    for (const trk of [...EntityRegistry.getByType(T.TRUCK)]) {
      const d = _edgeDist(src, trk);
      if (d > RF) continue;
      if (d > R && Math.random() >= 0.35 + 0.6 * (1 - (d - R) / (RF - R))) continue;
      TruckSystem.stopPatrol(trk);
      if (TruckSystem.isDriven(trk)) TruckSystem.stopDriving();
      GridManager.removeEntityFootprint(trk);
      EntityRegistry.remove(trk);
      n++;
    }
    return n;
  }

  // Radius for the pre-detonation danger overlay (MeltdownSystem): one core's
  // blast. Any core inside it will chain with its own.
  function nukeRadiusFor(e) {
    return NUKE_RADIUS;
  }

  // Drops the fireball and ground scar of any blast that happened on a
  // contract job site. Called by ContractSystem whenever the player leaves a
  // site, so neither is ever drawn on (or saved with) their own world.
  // Also drops the site's contamination zones and any chain fuse still
  // burning on the site (its entities are on the grid right now, which is
  // how they are told from a fuse left lit at home), and puts the home
  // world's explosion tallies back to what they were before the site's
  // first blast.
  function clearSiteBlasts() {
    for (let i = _nukes.length - 1; i >= 0; i--) if (_nukes[i].site) _nukes.splice(i, 1);
    for (let i = _scars.length - 1; i >= 0; i--) if (_scars[i].site) _scars.splice(i, 1);
    for (let i = _zones.length - 1; i >= 0; i--) if (_zones[i].site) _zones.splice(i, 1);
    for (let i = _fuses.length - 1; i >= 0; i--) {
      const f = _fuses[i];
      if (f.e && GridManager.getEntity(f.e.col, f.e.row) === f.e) _fuses.splice(i, 1);
    }
    if (_homeTotals) {
      ({ damaged: _totalDamaged, explosions: _totalExplosions, burned: _totalBurned, gen: _totalGenExplosions } = _homeTotals);
      _homeTotals = null;
      _damaged = []; _burningWires = [];
      NotificationStack.dismissTag('lightningdamage');
    }
  }
  // The home world's tallies, kept while a site blast is being played out.
  let _homeTotals = null;

  function detonateNuclear(e) {
    if (!e || e._detonated) return false;
    // On a contract job site the reactor does explode, whatever set it off (a
    // meltdown, a strike, a chain), and that is the end of the job: the client
    // holds the player liable and the contract closes a few seconds later,
    // once the blast has played (ContractSystem.reactorBlast).
    //
    // The site takes the full blast: wrecks, fires, lines and trees cleared,
    // chained cores, contamination. The damage itself is on the site's own
    // entities and goes when the site does. What lives in this module is
    // kept off the player's map: the visuals and the zone are tagged `site`,
    // the home world's tallies are put aside (_homeTotals) and restored, and
    // clearSiteBlasts() drops the lot as the player leaves. An Advanced
    // Reactor goes up like any other core here; the map-ending blast is for
    // the player's own world only.
    const onSite = typeof ContractSystem !== 'undefined' && !!ContractSystem.isAtSite && ContractSystem.isAtSite();
    if (onSite && !_homeTotals) {
      _homeTotals = { damaged: _totalDamaged, explosions: _totalExplosions, burned: _totalBurned, gen: _totalGenExplosions };
    }
    // An Advanced Reactor never does the ordinary blast. Routed here rather
    // than only at the meltdown clock so a CHAIN detonation — this core
    // caught inside someone else's blast — ends the run too.
    if (!onSite && e.type === T.ADVREACTOR && typeof ApocalypseSystem !== 'undefined') return ApocalypseSystem.takeOver(e);
    e._detonated = true;
    const name = (e.def?.label || 'Nuclear Reactor') + (e._num !== undefined ? ` #${e._num}` : '');
    _damage(e, { silent: true, cause: 'blast', origin: 'meltdown' });
    _markRebuild(e, REBUILD_MAX);
    e._irreparable = true;
    e._rodBuffer = 0; e._generating = false; e._currentOutput = 0; e._coreHeat = 0; e._steamPressure = 0; e._meltdown = 0;

    // Each core in a chain goes up bigger than the one before: 1.5× per core
    // already involved (2nd 1.5×, 3rd 2.25×, 4th 3.4×, capped at the 5th's
    // 5.1×), and the chain's one fallout zone, centred where it started,
    // grows to match. Other cores caught in a blast chain with their own
    // (see _coreCanChain and the victim sweep below), so a bigger blast can
    // reach cores the first one couldn't.
    let zone = e._chainZone && _zones.includes(e._chainZone) ? e._chainZone : null;
    e._chainZone = null;
    const cores = zone ? (zone.cores || 1) + 1 : 1;
    const grow  = Math.pow(CHAIN_ZONE_GROWTH, Math.min(cores, CHAIN_GROWTH_CAP) - 1);
    const R  = Math.round(NUKE_RADIUS * grow);
    const RF = Math.round(NUKE_FIRE_RADIUS * grow);
    _totalExplosions++; _totalGenExplosions++;

    const c = _centreWorld(e);
    _spawnNukeVisual(c.wx, c.wy, R);
    if (zone) {
      zone.cores = cores;
      zone.rIn  = Math.max(zone.rIn,  R);
      zone.rOut = Math.max(zone.rOut, RF);
    } else {
      zone = _addZone(e, R, RF);
      zone.cores = 1;
      if (onSite) zone.site = true;
    }
    if (onSite) {
      if (_nukes.length) _nukes[_nukes.length - 1].site = true;
      if (_scars.length) _scars[_scars.length - 1].site = true;
    }

    const cleared = _clearLinear(e, R);
    _wreckRoadsInBlast(e, R, c);
    let wrecked = 0, lit = 0, chained = 0, trees = 0, coresChained = 0;
    for (const { e: v, d } of _entitiesInBlast(e, RF)) {
      if (isWire(v)) { if (_igniteWire(v)) lit++; continue; }
      const heldBefore = v.charge || 0;
      // Read before _damage() below takes the core offline. Inside the
      // destruction radius any fuelled core chains; out in the burn ring
      // only one that was running.
      const running = d <= R ? _coreCanChain(v)
                             : v.type === T.NUCLEARREACTOR && !!v._generating && !v._detonated;
      // An Advanced Reactor with fuel in it (or already melting down) caught
      // in the blast goes up itself — through detonateNuclear, which hands it
      // to ApocalypseSystem — rather than being wrecked like any other
      // building. It used to be _damage()d here, which quietly removed the
      // one core whose detonation ends the run.
      if (v.type === T.ADVREACTOR && d <= R && !v._detonated && !v._nukeFused &&
          ((v._rodBuffer || 0) > 0 || (v._meltdown || 0) > 0 || v._generating || (v._coreHeat || 0) > 0)) {
        v._nukeFused = true; chained++;
        _fuses.push({ e: v, nuclear: true, depth: 1, origin: 'meltdown', at: _now() + 1.5 + Math.random() * 1.5 });
        continue;
      }
      if (d <= R) {
        const p = Math.max(0, 1 - d / R);
        if (_damage(v, { silent: true, cause: 'blast', origin: 'meltdown' })) wrecked++;
        else if (v._fireCause !== 'blast') { v._fireCause = 'blast'; wrecked++; }
        _markRebuild(v, REBUILD_MIN + (REBUILD_MAX - REBUILD_MIN) * p);
        _makeIrreparable(v);
        v._blastDir = _blastAngle(c, v);
      } else if (!v._lightningDamaged) {
        const q = 1 - (d - R) / (RF - R);
        if (Math.random() < 0.35 + 0.6 * q && _damage(v, { silent: true, cause: 'fire', origin: 'meltdown' })) { lit++; _totalBurned++; _makeIrreparable(v); v._blastDir = _blastAngle(c, v); }
      }
      // Another fuelled reactor goes the same way, in its own blast. Nearer
      // cores go first, so a plant goes up as a visible chain: 0.3-1.8 s
      // after the blast that caught it, with the shockwave still rolling.
      // (It was 2-5 s, which read as a lag rather than a chain.)
      if (running && !v._nukeFused) {
        v._nukeFused = true; v._chainZone = zone; chained++; coresChained++;
        _fuses.push({ e: v, nuclear: true, depth: 1, origin: 'meltdown', at: _now() + 0.3 + 1.2 * (d / RF) + Math.random() * 0.3 });
        continue;
      }
      const genVictim = isGeneratorBomb(v);
      // Out in the burn ring a Coal / Fuel Generator doesn't cook off on the
      // spot: if the blast set it alight it's on the burn clock like any
      // burning generator (see GEN_BURN_SECONDS) — and fallout ground can't
      // take a crew, so only rain will save it.
      if (genVictim && d > R && GEN_BURN_TYPES.has(v.type)) continue;
      if ((genVictim || _isArmed(v, heldBefore)) && !v._detonated) {
        v._detonated = true;
        if (genVictim) chained++;
        _fuses.push({ e: v, depth: 1, held: heldBefore, origin: 'meltdown', at: _now() + 0.5 + Math.random() * 2.5 });
      }
    }
    // Flatten the trees in the blast.
    for (const type of [T.TREE, T.BUSH]) {
      for (const tr of [...EntityRegistry.getByType(type)]) {
        if (_edgeDist(e, tr) > R * 0.85) continue;
        if (GridManager.getEntity(tr.col, tr.row) === tr) GridManager.removeEntity(tr.col, tr.row);
        EntityRegistry.remove(tr);
        trees++;
      }
    }
    if (trees && typeof WorldMapSystem !== 'undefined') WorldMapSystem.invalidate?.();
    const trucks = _destroyTrucksInBlast(e, R, RF);
    PowerNetwork.recomputeWireHops();

    const hit = wrecked + lit;
    NotificationStack.dismissTag('lightningdamage');
    NotificationStack.dismissTag('meltdown');
    NotificationStack.dismissTag(`reactorheat-${e.col},${e.row}`);
    NotificationStack.dismissTag(`reactorpressure-${e.col},${e.row}`);
    _dismissStrikeCard(e);
    if (onSite) {
      // That ends the job: the client holds the player liable and the
      // contract closes a few seconds from now, once the blast has played.
      const bill = ContractSystem.reactorBlast ? ContractSystem.reactorBlast(e) : 0;
      NotificationStack.push({
        icon: '☢', title: 'NUCLEAR MELTDOWN',
        message: `${name} went critical and exploded on the client's site, levelling everything within ${R} tiles; `
               + `${hit} building${hit === 1 ? '' : 's'} destroyed or burning. The contract is over and you are liable`
               + (bill ? ` for ${typeof formatMoney === 'function' ? formatMoney(bill) : '$' + Math.round(bill).toLocaleString()}.` : '.'),
        color: '#ff6020', border: '#802818', tag: 'meltdown-site', glow: true, emergency: true,
      });
      return true;
    }
    // The public's verdict lands at once: a big drop for the disaster, a
    // smaller one for each further core in the same chain. The live fallout
    // zone then holds the mood down until it recovers (GovernmentSystem's
    // 'fallout' sentiment part).
    // Every home and business takes the same shock to its satisfaction,
    // before the fallout fear (SatisfactionSystem) keeps it down.
    {
      const t = _now(), firstOfChain = t - _lastNukeAt > 30;
      _lastNukeAt = t;
      if (typeof GovernmentSystem !== 'undefined' && GovernmentSystem.adjustApproval)
        GovernmentSystem.adjustApproval(firstOfChain ? -30 : -8);
      const shock = firstOfChain ? 25 : 8;
      for (const type of [T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL])
        for (const v of EntityRegistry.getByType(type))
          if (v.satisfaction !== undefined) v.satisfaction = Math.max(0, v.satisfaction - shock);
    }
    NotificationStack.push({
      icon: '☢',
      title: 'NUCLEAR MELTDOWN',
      message: `${name} went critical and exploded, levelling everything within ${R} tiles; `
             + `${hit} building${hit === 1 ? '' : 's'} destroyed or burning`
             + (trucks ? `, ${trucks} truck${trucks === 1 ? '' : 's'} lost` : '')
             + (cleared ? `, ${cleared} pipe/wire/belt tiles gone` : '')
             + (coresChained ? `. ${coresChained} more reactor${coresChained === 1 ? ' is' : 's are'} about to go up with it: never site reactors inside one another’s blast radius.`
                   : '. Always connect a Cooling Tower before bringing a reactor online.'),
      color: '#b0ff60', border: '#50a020', tag: 'lightningdamage', glow: true,
      onClick: () => { Camera.recentreOn(c.wx, c.wy); EntityInfoPanel.open(e); },
    });
    _notifActive = true;
    return true;
  }

  // A building the nuclear blast wrecked or set alight is gone for good: no
  // crew can put it back (repair / repairNearby / the repair UIs all refuse
  // it). It stands as a ruin — offline, earning nothing — until the player
  // demolishes it. A crew already on site when the blast hit is lost with it.
  function _makeIrreparable(v) {
    v._irreparable     = true;
    v._repairRemaining = undefined;
    v._repairTotal     = undefined;
  }
  function isIrreparable(e) { return !!(e && e._irreparable); }
  function _blastAngle(c, v) {
    const vc = _centreWorld(v);
    return Math.atan2(vc.wy - c.wy, vc.wx - c.wx);
  }

  /* ── Ruins ────────────────────────────────────────────────────────
     A building the bomb took is drawn as a ruin in place of its sprite
     (render_main_loop.js / renderEntityAt route _irreparable entities
     here): charred footprint, a cracked and bitten foundation slab, broken
     wall stubs throwing shadows, rubble heaped downwind of ground zero,
     twisted rebar and girders, ash streaks blown outward. All of it is
     painted once into a per-entity bitmap — a blast leaves hundreds of
     these — and only a few ember glints are drawn live on top.
     ─────────────────────────────────────────────────────────────── */
  const _ruinCache = new WeakMap();
  const RUIN_ROCK = ['#4a4540', '#5b544c', '#6a625a', '#3a3531', '#2e2a27', '#766d62'];

  function _buildRuin(e) {
    const wT = e.width || 1, hT = e.height || 1;
    const res = Math.max(8, Math.min(28, Math.floor(560 / Math.max(wT, hT))));   // px per tile
    const W = wT * res, H = hT * res, R = res;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    let s = (((e.col * 73856093) ^ (e.row * 19349663)) >>> 0) || 1;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const ang = e._blastDir ?? rnd() * Math.PI * 2;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const area = wT * hT, big = Math.sqrt(area);
    const tint = e.def?.color || '#555';

    // Rectangle outline with a ragged edge, as the current path.
    const jagged = (x0, y0, x1, y1, amp, step) => {
      const pts = [];
      const edge = (ax, ay, bx, by) => {
        const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / step));
        for (let i = 0; i < n; i++) {
          const u = i / n;
          pts.push([ax + (bx - ax) * u + (rnd() - 0.5) * amp, ay + (by - ay) * u + (rnd() - 0.5) * amp]);
        }
      };
      edge(x0, y0, x1, y0); edge(x1, y0, x1, y1); edge(x1, y1, x0, y1); edge(x0, y1, x0, y0);
      g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.closePath();
    };
    const chunk = (cx, cy, r, col) => {
      const n = 4 + ((rnd() * 3) | 0), a0 = rnd() * 6.28;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * 6.28, rr = r * (0.55 + rnd() * 0.6);
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * 0.8;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
      g.fillStyle = col; g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = Math.max(0.6, r * 0.12); g.stroke();
      g.strokeStyle = 'rgba(200,190,175,0.22)'; g.lineWidth = Math.max(0.5, r * 0.1);
      g.beginPath(); g.moveTo(cx - r * 0.5, cy - r * 0.35); g.lineTo(cx + r * 0.3, cy - r * 0.5); g.stroke();
    };

    // 1. Charred footprint, ragged at the edges.
    jagged(R * 0.05, R * 0.05, W - R * 0.05, H - R * 0.05, R * 0.35, R * 0.6);
    g.fillStyle = '#17120e'; g.fill();

    // 2. Ash streaks blown outward from ground zero.
    const streaks = Math.round(4 + big * 2);
    for (let i = 0; i < streaks; i++) {
      const sx = rnd() * W, sy = rnd() * H, len = R * (1 + rnd() * 2.5) * Math.min(3, big * 0.5 + 1);
      g.save(); g.translate(sx, sy); g.rotate(ang);
      g.fillStyle = `rgba(${rnd() < 0.5 ? '110,100,90' : '10,8,6'},${(0.12 + rnd() * 0.16).toFixed(3)})`;
      g.beginPath(); g.ellipse(len * 0.4, 0, len, R * (0.12 + rnd() * 0.25), 0, 0, 6.28); g.fill();
      g.restore();
    }

    // 3. Foundation slab — broken concrete with holes blown through it.
    const inset = Math.min(W, H) * 0.12;
    jagged(inset, inset, W - inset, H - inset, R * 0.5, R * 0.45);
    g.fillStyle = '#3b3733'; g.fill();
    g.save(); g.clip();
    g.globalAlpha = 0.18; g.fillStyle = tint; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    g.strokeStyle = 'rgba(12,10,8,0.8)'; g.lineWidth = Math.max(0.8, R * 0.06);
    const cracks = Math.round(3 + big * 1.5);
    for (let i = 0; i < cracks; i++) {
      let px = rnd() * W, py = rnd() * H;
      g.beginPath(); g.moveTo(px, py);
      const segs = 3 + ((rnd() * 4) | 0);
      for (let k = 0; k < segs; k++) { px += (rnd() - 0.5) * R * 2.2; py += (rnd() - 0.5) * R * 2.2; g.lineTo(px, py); }
      g.stroke();
    }
    const bites = Math.round(2 + big);
    for (let i = 0; i < bites; i++) chunk(rnd() * W, rnd() * H, R * (0.5 + rnd() * 0.9 * Math.min(2.5, big * 0.4)), '#14100c');
    g.restore();

    // 4. Wall stubs along the old perimeter, each casting a shadow downwind.
    const stubs = Math.max(2, Math.min(10, Math.round(big * 1.4)));
    for (let i = 0; i < stubs; i++) {
      const side = (rnd() * 4) | 0, u = 0.1 + rnd() * 0.8;
      const along = R * (0.8 + rnd() * 1.8) * Math.min(2, 0.5 + big * 0.25);
      const thick = R * (0.22 + rnd() * 0.18);
      const horiz = side < 2;
      const hx = horiz ? inset + u * (W - 2 * inset) : (side === 2 ? inset : W - inset);
      const hy = horiz ? (side === 0 ? inset : H - inset) : inset + u * (H - 2 * inset);
      const ww = horiz ? along : thick, hh = horiz ? thick : along;
      const sh = R * (0.4 + rnd() * 0.5);
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.beginPath();
      g.moveTo(hx - ww / 2, hy - hh / 2); g.lineTo(hx + ww / 2, hy - hh / 2);
      g.lineTo(hx + ww / 2 + dx * sh, hy + hh / 2 + dy * sh); g.lineTo(hx - ww / 2 + dx * sh, hy + hh / 2 + dy * sh);
      g.closePath(); g.fill();
      g.fillStyle = '#5c554d'; g.fillRect(hx - ww / 2, hy - hh / 2, ww, hh);
      g.fillStyle = '#7a7166';
      const n = Math.max(2, Math.round((horiz ? ww : hh) / (R * 0.3)));
      for (let k = 0; k < n; k++) {
        if (rnd() < 0.4) continue;
        const f = k / n;
        if (horiz) g.fillRect(hx - ww / 2 + f * ww, hy - hh / 2, ww / n, thick * 0.35);
        else       g.fillRect(hx - ww / 2, hy - hh / 2 + f * hh, thick * 0.35, hh / n);
      }
    }

    // 5. Rubble, heaped downwind of ground zero.
    const rubble = Math.max(14, Math.min(320, Math.round(area * 5)));
    for (let i = 0; i < rubble; i++) {
      const lean = rnd() * 0.6;
      const px = W * (0.1 + rnd() * 0.8) + dx * lean * W * 0.25;
      const py = H * (0.1 + rnd() * 0.8) + dy * lean * H * 0.25;
      const r  = R * (0.12 + Math.pow(rnd(), 2) * 0.5) * Math.min(2.2, 0.8 + big * 0.12);
      chunk(px, py, r, rnd() < 0.12 ? tint : RUIN_ROCK[(rnd() * RUIN_ROCK.length) | 0]);
    }

    // 6. Twisted rebar and snapped girders.
    const beams = Math.max(3, Math.min(18, Math.round(big * 2)));
    g.lineCap = 'round';
    for (let i = 0; i < beams; i++) {
      const px = W * (0.12 + rnd() * 0.76), py = H * (0.12 + rnd() * 0.76);
      const len = R * (0.8 + rnd() * 2) * Math.min(2, 0.6 + big * 0.15);
      const a = ang + (rnd() - 0.5) * 2.2;
      if (rnd() < 0.55) {
        g.strokeStyle = rnd() < 0.5 ? '#6b3f26' : '#553222'; g.lineWidth = Math.max(0.7, R * 0.07);
        g.beginPath(); g.moveTo(px, py);
        g.quadraticCurveTo(px + Math.cos(a + 1) * len * 0.6, py + Math.sin(a + 1) * len * 0.6,
                           px + Math.cos(a) * len, py + Math.sin(a) * len);
        g.stroke();
      } else {
        g.strokeStyle = '#26221f'; g.lineWidth = Math.max(1.2, R * 0.16);
        const mx = px + Math.cos(a) * len * 0.55, my = py + Math.sin(a) * len * 0.55;
        g.beginPath(); g.moveTo(px, py); g.lineTo(mx, my);
        g.lineTo(mx + Math.cos(a + 0.6) * len * 0.45, my + Math.sin(a + 0.6) * len * 0.45); g.stroke();
        g.strokeStyle = 'rgba(160,150,140,0.25)'; g.lineWidth = Math.max(0.5, R * 0.05);
        g.beginPath(); g.moveTo(px, py); g.lineTo(mx, my); g.stroke();
      }
    }

    // 7. Scorch: the face toward ground zero burnt darkest.
    const gr = g.createLinearGradient(W / 2 - dx * W * 0.5, H / 2 - dy * H * 0.5, W / 2 + dx * W * 0.5, H / 2 + dy * H * 0.5);
    gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);

    // Ember seats for the live pass.
    const embers = [];
    const ne = Math.max(2, Math.min(10, Math.round(big * 1.2)));
    for (let i = 0; i < ne; i++) embers.push({ u: 0.15 + rnd() * 0.7, v: 0.15 + rnd() * 0.7, ph: rnd() * 10, r: 0.08 + rnd() * 0.12 });
    return { cv, wT, hT, embers };
  }

  // Bake a ruin's bitmap now, off-screen, instead of on the first frame it
  // is drawn. The apocalypse feeds this a few buildings a frame as they
  // die, so a camera cut onto a street of rubble finds the bitmaps ready —
  // baking dozens of them in the frame of the cut was the 200–300ms hitch.
  function prebakeRuin(e) {
    if (!e) return;
    const wT = e.width || 1, hT = e.height || 1;
    const r = _ruinCache.get(e);
    if (r && r.wT === wT && r.hT === hT) return;
    _ruinCache.set(e, _buildRuin(e));
  }

  // Scorched line tiles (scorch()): one shared sprite in a few variants,
  // picked by tile, instead of a rubble bitmap built for every pipe, belt
  // and road tile the front passes (thousands on a city).
  const _scorchSprites = [];
  function _scorchSprite(k) {
    if (_scorchSprites[k]) return _scorchSprites[k];
    const S = TILE, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    const rnd = (n) => { const v = Math.sin((k + 1) * 91.7 + n * 12.9898) * 43758.5453; return v - Math.floor(v); };
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.62);
    gr.addColorStop(0, 'rgba(12,9,6,0.85)'); gr.addColorStop(0.7, 'rgba(26,20,14,0.55)'); gr.addColorStop(1, 'rgba(26,20,14,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    // Twisted, broken stubs of whatever ran here.
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const x0 = S * (0.15 + 0.7 * rnd(i)), y0 = S * (0.15 + 0.7 * rnd(i + 7));
      const a = rnd(i + 13) * Math.PI * 2, l = S * (0.18 + 0.22 * rnd(i + 19));
      g.strokeStyle = i ? 'rgba(48,42,38,0.9)' : 'rgba(70,58,48,0.9)';
      g.lineWidth = S * (0.07 + 0.06 * rnd(i + 23));
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a) * l, y0 + Math.sin(a) * l); g.stroke();
    }
    g.fillStyle = 'rgba(120,96,70,0.5)';
    for (let i = 0; i < 4; i++) g.fillRect(S * rnd(i + 31), S * rnd(i + 37), 1.5, 1.5);
    return (_scorchSprites[k] = cv);
  }

  function renderRuin(ctx, e, x, y, t) {
    if (e.type === T.ROAD) return;   // the road pass draws its wreck (renderRoadWreck)
    if (e._scorched) { ctx.drawImage(_scorchSprite(((e.col * 7 + e.row * 13) & 3)), x, y, TILE, TILE); return; }
    let r = _ruinCache.get(e);
    const wT = e.width || 1, hT = e.height || 1;
    if (!r || r.wT !== wT || r.hT !== hT) { r = _buildRuin(e); _ruinCache.set(e, r); }
    const W = wT * TILE, H = hT * TILE;
    ctx.drawImage(r.cv, x, y, W, H);
    if (Camera.zoom < 0.3) return;
    // Embers still glowing in the wreck.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of r.embers) {
      const f = 0.5 + 0.5 * Math.sin(t * 2.3 + m.ph) * Math.sin(t * 3.7 + m.ph * 1.7);
      if (f < 0.15) continue;
      const ex = x + m.u * W, ey = y + m.v * H, rr = TILE * m.r * (0.7 + f * 0.6);
      ctx.fillStyle = `rgba(255,${(90 + f * 80) | 0},20,${(0.35 * f).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(ex, ey, rr * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,200,120,${(0.7 * f).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(ex, ey, rr * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /* ── Wrecked roads and bridges ─────────────────────────────────────
     Inside a nuclear blast's destruction radius a road is left as broken,
     cratered asphalt (trucks can still pick across it) and a bridge drops
     into the water: stumps of pier, twisted truss and sunken deck plate, with
     no way across (WaterBuild.railAt). A few shared bitmaps, turned to the
     piece's axis, since one blast can leave dozens of pieces.
     ─────────────────────────────────────────────────────────────────── */
  const _roadWreckSprites = new Map();
  function _roadWreckSprite(bridge, k) {
    const key = (bridge ? 'b' : 'r') + k;
    let cv = _roadWreckSprites.get(key);
    if (cv) return cv;
    // Authored in the road art's 240-unit square, lanes running top to bottom.
    const S = 240, Q = 2;
    cv = document.createElement('canvas');
    cv.width = cv.height = S * Q;
    const g = cv.getContext('2d');
    g.scale(Q, Q);
    let seed = (k + 1) * (bridge ? 7919 : 104729);
    const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
    const between = (a, b) => a + (b - a) * rnd();
    g.lineCap = 'round'; g.lineJoin = 'round';
    const chunk = (x, y, r, col) => {
      g.fillStyle = col; g.beginPath();
      const n = 5 + (rnd() * 3 | 0), a0 = rnd() * 6.28;
      for (let i = 0; i < n; i++) { const a = a0 + i / n * 6.283, rr = r * between(0.65, 1.15); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; i ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.closePath(); g.fill();
    };
    const girder = (x0, y0, x1, y1, w) => {
      const mx = (x0 + x1) / 2 + between(-14, 14), my = (y0 + y1) / 2 + between(-14, 14);
      for (const [col, lw] of [['rgba(0,0,0,0.5)', w + 2], ['#3a2c24', w], ['rgba(138,88,58,0.75)', w * 0.35]]) {
        g.strokeStyle = col; g.lineWidth = lw;
        g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
      }
    };
    if (bridge) {
      // Sunken plate: dark tilted slabs just under where the deck ran.
      for (let i = 0; i < 4; i++) {
        const y = 22 + i * 52 + between(-8, 8), x = between(44, 110), w = between(60, 90), h = between(30, 44), a = between(-0.5, 0.5);
        g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(a);
        g.fillStyle = 'rgba(8,12,16,0.55)'; g.fillRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
        g.fillStyle = 'rgba(52,56,58,0.92)'; g.fillRect(-w / 2, -h / 2, w, h);
        g.fillStyle = 'rgba(14,14,14,0.55)'; g.beginPath(); g.moveTo(-w / 2, -h / 2); g.lineTo(w * 0.2, -h / 2); g.lineTo(-w * 0.1, h / 2); g.lineTo(-w / 2, h / 2); g.closePath(); g.fill();
        g.restore();
      }
      // Stumps of pier, in pairs, some gone.
      for (const y of [48, 168]) for (const x of [58, 182]) {
        if (rnd() < 0.2) continue;
        chunk(x + 3, y + 4, 19, 'rgba(0,0,0,0.42)');
        chunk(x, y, 17, '#6c6a64');
        chunk(x - 3, y - 3, 9, '#8a877e');
        g.strokeStyle = '#2a2826'; g.lineWidth = 1.6;
        for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x + between(-12, 12), y + between(-12, 12)); g.lineTo(x + between(-14, 14), y + between(-14, 14)); g.stroke(); }
      }
      // What's left of the truss: the side chords, snapped and bent, with
      // stray diagonals thrown across the gap.
      for (const side of [24, 216]) {
        let y = between(-4, 12);
        while (y < 228) {
          const len = between(34, 72), out = between(-16, 16);
          if (rnd() > 0.18) girder(side + between(-5, 5), y, side + out, y + len, between(5, 7));
          y += len + between(6, 28);
        }
      }
      for (let i = 0; i < 5; i++) girder(between(22, 218), between(10, 230), between(22, 218), between(10, 230), between(2.5, 4));
      for (let i = 0; i < 26; i++) chunk(between(18, 222), between(4, 236), between(1.5, 4.5), ['#3a3836', '#55524c', '#2a2826'][rnd() * 3 | 0]);
    } else {
      // Charred asphalt the whole length, its sides bitten back from the kerb.
      g.fillStyle = '#26231f'; g.beginPath(); g.moveTo(between(2, 12), 0);
      for (let y = 20; y < 240; y += 20) g.lineTo(between(0, 15), y);
      g.lineTo(between(2, 12), 240); g.lineTo(240 - between(2, 12), 240);
      for (let y = 220; y > 0; y -= 20) g.lineTo(240 - between(0, 15), y);
      g.lineTo(240 - between(2, 12), 0); g.closePath(); g.fill();
      // Lane paint, mostly burned off.
      g.fillStyle = 'rgba(190,172,110,0.32)';
      for (let y = 8; y < 240; y += 34) if (rnd() < 0.5) g.fillRect(117 + between(-2, 2), y, 6, between(8, 18));
      // Slabs heaved up and tilted, catching the light on one edge.
      for (let i = 0; i < 7; i++) {
        const x = between(24, 216), y = between(14, 226), r = between(14, 30);
        chunk(x + 3, y + 4, r, 'rgba(0,0,0,0.4)');
        chunk(x, y, r, ['#3a3631', '#45403a', '#332f2b'][rnd() * 3 | 0]);
        g.strokeStyle = 'rgba(120,112,98,0.5)'; g.lineWidth = 1.4;
        g.beginPath(); g.arc(x, y, r * 0.75, 3.5, 5.3); g.stroke();
      }
      // Craters.
      for (let i = 0; i < 2 + (rnd() * 2 | 0); i++) {
        const x = between(50, 190), y = between(30, 210), r = between(20, 38);
        const cg = g.createRadialGradient(x, y, r * 0.15, x, y, r);
        cg.addColorStop(0, 'rgba(6,5,4,0.95)'); cg.addColorStop(0.7, 'rgba(18,15,12,0.8)'); cg.addColorStop(1, 'rgba(18,15,12,0)');
        g.fillStyle = cg; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
        g.strokeStyle = 'rgba(92,84,72,0.55)'; g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, r * 0.86, between(0, 6), between(7, 10)); g.stroke();
      }
      // Cracks running off along the road.
      g.strokeStyle = 'rgba(4,3,2,0.9)';
      for (let i = 0; i < 12; i++) {
        g.lineWidth = between(1, 2.6);
        let x = between(16, 224), y = between(4, 236);
        g.beginPath(); g.moveTo(x, y);
        for (let s = 0; s < 4; s++) { x += between(-22, 22); y += between(-28, 28); g.lineTo(x, y); }
        g.stroke();
      }
      for (let i = 0; i < 40; i++) chunk(between(10, 230), between(2, 238), between(1.2, 3.8), ['#4a4540', '#5b544c', '#6a625a', '#2e2a27'][rnd() * 4 | 0]);
    }
    _roadWreckSprites.set(key, cv);
    return cv;
  }
  function renderRoadWreck(ctx, e, x, y) {
    const S = 6 * TILE;
    const cv = _roadWreckSprite(!!e._bridge, ((e.col * 7 + e.row * 13) & 3));
    if (((e._rotation || 0) % 2) === 0) { ctx.drawImage(cv, x, y, S, S); return; }
    ctx.save();
    ctx.translate(x + S / 2, y + S / 2); ctx.rotate(-Math.PI / 2);
    ctx.drawImage(cv, -S / 2, -S / 2, S, S);
    ctx.restore();
  }
  // Road or bridge to wreck. Routes change: a bridge has no deck left.
  function wreckRoad(e, blastAngle) {
    if (!e || e._irreparable) return false;
    _makeIrreparable(e);
    e._detonated = true;
    if (blastAngle !== undefined) e._blastDir = blastAngle;
    EntityRegistry.driveChanged();
    return true;
  }
  function _wreckRoadsInBlast(src, R, c) {
    for (const rd of EntityRegistry.getByType(T.ROAD)) {
      if (_edgeDist(src, rd) <= R) wreckRoad(rd, _blastAngle(c, rd));
    }
  }

  // Clearing a ruin: no refund, and a cleanup bill of WRECK_CLEAR_PCT of
  // what the building was worth — radioactive rubble isn't cheap to haul.
  const WRECK_CLEAR_PCT = 0.6;
  const WRECK_CLEAR_MIN = 2000;
  function wreckClearCost(e) {
    const worth = e.upfrontPaid || e.def?.cost || 2000;
    return Math.max(WRECK_CLEAR_MIN, Math.round(worth * WRECK_CLEAR_PCT));
  }

  const _ease = (u) => 1 - Math.pow(1 - Math.max(0, Math.min(1, u)), 3);
  const _clamp01 = (u) => Math.max(0, Math.min(1, u));

  // The part of the world currently on screen, in world px (with margin), so
  // screen-filling layers (flash, sky tint) cover the view wherever the
  // camera happens to be.
  function _viewRect() {
    const z = Camera.zoom || 1;
    const x = Camera.x, y = Camera.y, w = window.innerWidth / z, h = window.innerHeight / z;
    return { x: x - w, y: y - h, w: w * 3, h: h * 3 };
  }

  // Ground layer (drawn under entities, render_main_loop.js): the scorched
  // crater and burn streaks every nuclear detonation leaves behind, for good.
  function renderScars(ctx) {
    if (_scars.length === 0) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (const sc of _scars) {
      const cr = sc.R * 0.62;
      const g = ctx.createRadialGradient(sc.wx, sc.wy, 0, sc.wx, sc.wy, cr);
      g.addColorStop(0, 'rgba(14,10,6,0.85)');
      g.addColorStop(0.7, 'rgba(40,30,20,0.45)');
      g.addColorStop(1, 'rgba(40,30,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sc.wx, sc.wy, cr, 0, Math.PI * 2); ctx.fill();
      for (const s of _scarStreaks(sc)) {
        const x1 = sc.wx + Math.cos(s.a) * sc.R * s.len, y1 = sc.wy + Math.sin(s.a) * sc.R * s.len;
        const sg = ctx.createLinearGradient(sc.wx, sc.wy, x1, y1);
        sg.addColorStop(0, 'rgba(10,8,6,0.55)'); sg.addColorStop(1, 'rgba(10,8,6,0)');
        ctx.strokeStyle = sg; ctx.lineWidth = TILE * s.w;
        ctx.beginPath(); ctx.moveTo(sc.wx, sc.wy); ctx.lineTo(x1, y1); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function renderNukes(ctx) {
    if (_nukes.length === 0 && _zones.length === 0) return;
    const now = _now();
    ctx.save();

    // ── Contamination zones (stage-coloured rings, countdown label) ──
    _drawZones(ctx);

    for (const n of _nukes) {
      const u = now - n.t0;
      if (u < 0 || u > NUKE_LIFE) continue;
      const R = n.R, Rv = R * NUKE_CLOUD_SCALE, x = n.wx, y = n.wy;
      const vr = _viewRect();

      // ── Sky: an orange-brown pall over everything after the flash ──
      if (u > 0.3) {
        const a = u < 1.6 ? (u - 0.3) / 1.3 : Math.max(0, 1 - (u - 1.6) / (NUKE_LIFE - 1.6));
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(90,40,10,${(0.32 * a).toFixed(3)})`;
        ctx.fillRect(vr.x, vr.y, vr.w, vr.h);
      }

      // ── Shockwaves (damage edge, a second front, a faint far echo) ──
      for (const [delay, reach, dur, str] of [[0, 1.0, 2.6, 1], [0.35, 0.8, 2.4, 0.8], [0.9, 1.5, 4.5, 0.45]]) {
        const s = (u - delay) / dur;
        if (s < 0 || s > 1) continue;
        const rr = R * reach * _ease(s);
        const a = (1 - s) * str;
        ctx.fillStyle = `rgba(130,110,90,${(0.14 * a).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(255,244,225,${(0.9 * a).toFixed(3)})`;
        ctx.lineWidth = TILE * (3 * a + 0.4);
        ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
        // heat haze riding just inside the front
        ctx.strokeStyle = `rgba(255,200,150,${(0.18 * a).toFixed(3)})`;
        ctx.lineWidth = TILE * 6 * a;
        ctx.beginPath();
        for (let q = 0; q <= 64; q++) {
          const ang = q / 64 * Math.PI * 2;
          const wob = rr * 0.93 + Math.sin(ang * 9 + u * 12) * TILE * 1.2;
          const px = x + Math.cos(ang) * wob, py = y + Math.sin(ang) * wob;
          q ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke();
      }
      // Condensation (Wilson) ring: white steam that flashes into being just
      // behind the shock front and evaporates within a second or two.
      if (u > 0.15 && u < 1.8) {
        const s = (u - 0.15) / 1.65;
        const wr = R * (0.35 + 0.45 * s), steam = _smokeBillow(0, 1);
        // Big, faint and overlapping: a veil, not a string of pearls.
        ctx.globalAlpha = 0.3 * Math.sin(s * Math.PI);
        for (const p of n.wilson) {
          const pr = TILE * 4.6 * p.s * (0.8 + 0.7 * s);
          ctx.drawImage(steam, x + Math.cos(p.a) * wr * p.d - pr, y + Math.sin(p.a) * wr * p.d - pr * 0.7, pr * 2, pr * 1.4);
        }
        ctx.globalAlpha = 1;
      }

      // ── Base surge: dust the front throws up, rolling out low along the
      //    ground, lit by the fireball for its first moments ──
      if (u > 0.2) {
        const s  = _clamp01((u - 0.2) / 6);
        const sr = R * 0.8 * _ease(s);
        const a  = Math.min(1, (u - 0.2) / 0.6) * (u < 6 ? 1 : Math.max(0, 1 - (u - 6) / (NUKE_LIFE - 6)));
        if (a > 0.01) {
          const dust = _smokeBillow(Math.max(0, 1 - u / 2.5), 0.35, true);
          ctx.globalAlpha = a * 0.7;
          for (const p of n.surge) {
            const ang = p.a + Math.sin(u * 0.3 + p.ph) * 0.03;
            const pr  = R * 0.06 * p.s * (0.6 + 1.2 * s);
            // Squat: it rolls along the ground rather than climbing.
            ctx.drawImage(dust, x + Math.cos(ang) * sr * p.d - pr * 1.1, y + Math.sin(ang) * sr * p.d - pr * 0.65, pr * 2.2, pr * 1.3);
          }
          ctx.globalAlpha = 1;
        }
      }

      // ── Buildings cooking off as the front passes ──
      for (const p of n.pops) {
        const s = (u - p.at) / 0.8;
        if (s < 0 || s > 1) continue;
        _firePop(ctx, x + Math.cos(p.a) * R * p.d, y + Math.sin(p.a) * R * p.d, TILE * p.size * (0.4 + 0.8 * _ease(s)), s);
      }

      // Fireball: blooms, then cools and climbs into the cap.
      const fr = Rv * 0.42 * _ease(u / 1.1);
      const rise = Rv * 1.05 * _ease((u - 0.8) / 6);
      const fy = y - rise;
      const cool = _clamp01((u - 0.6) / 6);
      const fade = u > 10 ? Math.max(0, 1 - (u - 10) / (NUKE_LIFE - 10)) : 1;

      // ── Stem: a column of rolling dust from the ground up to the cap, lit
      //    from above by the fireball while it burns ──
      if (u > 0.9) {
        ctx.globalAlpha = 0.9 * Math.min(1, (u - 0.9) / 0.8) * fade;
        for (const p of n.stem) {
          const py = y - rise * p.h;
          const pr = fr * (0.45 + 0.35 * (1 - p.h)) * p.s * 1.15;
          const px = x + p.off * fr * 0.35 + Math.sin(now * 0.8 + p.ph) * fr * 0.04;
          ctx.drawImage(_smokeBillow((1 - cool) * (0.3 + 0.7 * p.h), 0.2 + 0.15 * cool, true), px - pr, py - pr, pr * 2, pr * 2);
        }
      }
      // ── Skirt: a wide, flat ring of paler cloud spreading under the cap ──
      if (u > 1.6) {
        const cs = _ease((u - 1.6) / 5);
        const sy = fy + fr * 0.55;
        const pale = _smokeBillow(0, 0.45, true);
        ctx.globalAlpha = 0.65 * fade * cs;
        for (const p of n.skirt) {
          const ang = p.a - now * 0.05;
          const px = x + Math.cos(ang) * fr * p.d * (1 + cs * 1.1);
          const py = sy + Math.sin(ang) * fr * p.d * 0.35 * (1 + cs * 1.1);
          const pr = fr * p.s * (0.8 + cs) * 1.1;
          ctx.drawImage(pale, px - pr, py - pr, pr * 2, pr * 2);
        }
      }
      // ── Cap: a dome of boiling soot over the fireball, lit orange from
      //    underneath while the fire inside burns and greying as it cools.
      //    Back to front, so the rim nearest the camera overlaps the rest.
      if (u > 1.0) {
        const cs = _ease((u - 1.0) / 3.5);
        const order = n._capOrder || (n._capOrder = n.cap.map(p => ({ p, x: 0, y: 0, r: 0 })));
        for (const o of order) {
          const p = o.p, ang = p.a + now * 0.08;
          o.x = x + Math.cos(ang) * fr * p.d * (0.9 + cs * 0.9);
          o.y = fy + Math.sin(ang) * fr * p.d * 0.55 * (0.9 + cs * 0.9) - fr * 0.1 * (1 - p.d);
          o.r = fr * p.s * (0.8 + cs * 0.9) * (1 + 0.08 * Math.sin(now * 0.7 + p.ph));
        }
        order.sort((a, b) => a.y - b.y);
        const soot = _smokeBillow(1 - cool, 0.22 * cool, true);
        ctx.globalAlpha = 0.95 * fade * Math.min(1, (u - 1.0) / 0.6);
        for (const o of order) ctx.drawImage(soot, o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
      }
      // ── The fireball itself: a roiling cluster, white-hot at the heart,
      //    then orange, then dull red, swallowed by the cap as it cools ──
      const body = (1 - _clamp01((cool - 0.3) / 0.5)) * fade;
      if (body > 0.01 && fr > 0) {
        ctx.globalAlpha = body * Math.min(1, u * 8 + 0.2);
        for (const p of n.ball) {
          const ang = p.a + now * 0.12 * p.spd;
          const d  = p.d * (0.85 + 0.15 * Math.sin(now * 0.9 + p.ph));
          const br = fr * p.s * (0.95 + 0.12 * Math.sin(now * 1.3 + p.ph));
          const T  = _clamp01(cool * 1.5 + p.d * 0.35 + p.heat - 0.05);
          ctx.drawImage(_fireBillow(T), x + Math.cos(ang) * fr * d * 0.75 - br, fy + Math.sin(ang) * fr * d * 0.45 - br, br * 2, br * 2);
        }
      }
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // ── Its light, over the cloud and the city round it ──
      // Dies off faster than the fireball cools, or it washes the cap out.
      const glow = 0.85 * (1 - cool) * (1 - cool) * fade;
      if (glow > 0.01 && fr > 0) {
        const gr = fr * 2.4;
        ctx.globalAlpha = glow;
        ctx.drawImage(_seatGlow(), x - gr, fy - gr, gr * 2, gr * 2);
        ctx.globalAlpha = 1;
      }
      // ── Lightning crackling inside the cloud ──
      if (u > 1.4 && u < 10) {
        const slot = Math.floor(u * 7);
        const rs = (k) => { const v = Math.sin((slot * 97 + k) * 12.9898 + n.t0) * 43758.5453; return v - Math.floor(v); };
        for (let b = 0; b < 3; b++) {
          if (rs(b * 11) < 0.45) continue;
          const a0 = rs(b * 11 + 1) * Math.PI * 2, r0 = fr * (0.3 + rs(b * 11 + 2) * 0.9);
          let bx = x + Math.cos(a0) * r0, by = fy + Math.sin(a0) * r0 * 0.55;
          ctx.beginPath(); ctx.moveTo(bx, by);
          for (let sgm = 0; sgm < 6; sgm++) {
            bx += (rs(b * 11 + 3 + sgm) - 0.5) * fr * 0.5;
            by += (rs(b * 11 + 9 + sgm) - 0.3) * fr * 0.25;
            ctx.lineTo(bx, by);
          }
          ctx.strokeStyle = 'rgba(160,190,255,0.35)'; ctx.lineWidth = TILE * 1.2; ctx.stroke();
          ctx.strokeStyle = 'rgba(240,248,255,0.95)'; ctx.lineWidth = TILE * 0.3; ctx.stroke();
        }
      }
      // ── Embers thrown out across the blast ──
      for (const em of n.embers) {
        const s = (u - em.delay) / em.life;
        if (s < 0 || s > 1) continue;
        const d = em.dist * _ease(s);
        const ex = x + Math.cos(em.a) * d, ey = y + Math.sin(em.a) * d * 0.8 - Math.sin(s * Math.PI) * em.lift * TILE * 8;
        ctx.fillStyle = `rgba(255,${Math.round(200 - 140 * s)},60,${(1 - s).toFixed(3)})`;
        ctx.fillRect(ex, ey, em.size, em.size);
      }
      // ── Flash: the view whites out, with a sun-bright core ──
      if (u < 1.6) {
        const a = u < 0.14 ? 1 : Math.max(0, 1 - (u - 0.14) / 1.46);
        ctx.fillStyle = `rgba(255,252,240,${(0.9 * a).toFixed(3)})`;
        ctx.fillRect(vr.x, vr.y, vr.w, vr.h);
        const core = ctx.createRadialGradient(x, y, 0, x, y, R * 0.9);
        core.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`);
        core.addColorStop(0.3, `rgba(255,240,200,${(0.8 * a).toFixed(3)})`);
        core.addColorStop(1, 'rgba(255,220,160,0)');
        ctx.fillStyle = core; ctx.beginPath(); ctx.arc(x, y, R * 0.9, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // Chain fuses, burned down on wall-clock time so the cascade reads at the
  // same speed whatever the sim is doing.
  function _tickFuses(running) {
    if (_fuses.length === 0) return;
    const now = _now();
    // Paused means paused — hold the fuses where they are by carrying their
    // deadlines forward, or a player who hit pause to look at the damage
    // would come back to a chain that already finished without them.
    if (!running) {
      for (const f of _fuses) f.at = Math.max(f.at, now + 0.05);
      return;
    }
    for (let i = _fuses.length - 1; i >= 0; i--) {
      const f = _fuses[i];
      if (now < f.at) continue;
      _fuses.splice(i, 1);
      // A bank the player somehow demolished mid-fuse just doesn't go off.
      if (!f.e || GridManager.getEntity(f.e.col, f.e.row) !== f.e) continue;
      if (f.nuclear) { f.e._nukeFused = false; detonateNuclear(f.e); }
      else _explode(f.e, f.depth, f.held, f.origin);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     FIRE SPREAD
     A burning building is not a static repair bill — left alone it
     takes its neighbours with it. This is the pressure that turns a
     detonation from an expense into an emergency, and the reason
     dispatching a crew EARLY is worth more than dispatching a cheap one.
     ═══════════════════════════════════════════════════════════════ */

  // A burning building rolls to jump once per this many SIM seconds —
  // roughly every 26 in-game minutes at the standard 50 s/hr.
  //
  // Every burning building rolls on its own, so a fire's growth is
  // compounding, not linear: the interval and the chance below are set
  // where one unattended house threatens a touching neighbour every few
  // minutes, while a whole block already alight is unmistakably running
  // away from the player. Shortening either turns a dense downtown into
  // a total loss faster than a crew can physically be dispatched.
  const SPREAD_INTERVAL = 21.5;
  // How far a fire can throw itself, footprint edge to footprint edge.
  // Deliberately short: fire crosses a packed block and stalls at a gap,
  // which is exactly the lesson the spacing is meant to teach. Wires are
  // the loophole — see the wire-fire section below — because a line of
  // cable is a continuous path where open ground is not.
  const SPREAD_RANGE    = 2;
  // Base odds per roll on the nearest eligible neighbour.
  const SPREAD_CHANCE   = 0.22;
  // Rain is fighting the fire the whole time. Storms are also when strikes
  // happen, so this matters constantly — an unattended fire that starts
  // mid-storm spreads slowly and then accelerates as the weather clears.
  const SPREAD_RAIN_MUL = 0.3;
  // A crew on site is actively suppressing, not just rebuilding.
  const SPREAD_REPAIR_MUL = 0.15;

  let _spreadToastAt = 0;   // wall-clock throttle on the spread toast

  // Rain puts fires out. A building left burning in the rain is doused after
  // roughly this many SIM seconds (each rolls its own time, 0.7–1.4×), and
  // from then on it stops burning and spreading — but it is still a wreck:
  // offline, earning nothing, and waiting on a repair crew like any other
  // damaged building. Wire fires burn themselves out this many times faster.
  const RAIN_DOUSE_SECONDS  = 18;
  const RAIN_WIRE_BURN_MUL  = 4;
  // The flames shrink the whole time rain is on them (see renderDamage), so
  // the fire dies down rather than vanishing at the douse. If the rain stops
  // first, the fire wins the ground back at this fraction of the rate rain
  // took it. Once out, the smoke thins to a smoulder over SMOULDER_FADE sim
  // seconds instead of dropping in one frame.
  const RAIN_REKINDLE_MUL   = 0.4;
  const SMOULDER_FADE       = 20;
  function isFireOut(e) { return !!(e && e._fireOut); }

  // Coal and Fuel Generators are full of fuel. Left burning, the fire
  // reaches it: after GEN_BURN_SECONDS of sim time actually alight the
  // generator explodes like a meltdown (_explode — full generator blast,
  // chains, rebuild pricing). A crew on site holds the clock (they're
  // fighting the fire), and rain dousing it stops it for good. The clock
  // doesn't reset on its own — a crew pulled off leaves it where it was.
  const GEN_BURN_TYPES   = new Set([T.COALGENERATOR, T.FUELGEN]);
  const GEN_BURN_SECONDS = 45;    // ~55 in-game minutes at 50 s/hr
  const GEN_BURN_WARN    = 20;    // seconds left when the card turns urgent
  const _burnTag = (e) => `genburn-${e.col},${e.row}`;
  function genBurnLeft(e) {
    if (!e || !GEN_BURN_TYPES.has(e.type) || !e._lightningDamaged || e._fireOut || e._detonated) return null;
    return Math.max(0, GEN_BURN_SECONDS - (e._genBurnT || 0));
  }
  // Returns true if the generator blew up this tick.
  function _tickGenBurn(e, simDt) {
    const left0 = genBurnLeft(e);
    if (left0 === null) return false;
    const name = (e.def?.label || 'Generator') + (e._num !== undefined ? ` #${e._num}` : '');
    const tag  = _burnTag(e);
    if (isRepairing(e)) {
      NotificationStack.updateTag(tag, { message: `${name} is burning: the crew on site is holding the fire back.` });
      return false;
    }
    e._genBurnT = (e._genBurnT || 0) + simDt;
    const left = Math.max(0, GEN_BURN_SECONDS - e._genBurnT);
    if (left <= 0) {
      NotificationStack.dismissTag(tag);
      e._detonated = true;
      e._burnExploded = true;
      _explode(e, 0, undefined, 'meltdown');
      return true;
    }
    const msg = e._irreparable
      ? `${name} is burning in the fallout; no crew can reach it. It will explode soon unless rain puts it out.`
      : `${name} is ON FIRE with fuel aboard; it will explode soon. Send a repair crew (or wait for rain) to hold it.`;
    if (!NotificationStack.updateTag(tag, { message: msg })) {
      NotificationStack.push({
        icon: '🔥', title: 'Generator on fire', message: msg,
        color: '#ff8020', border: '#803010', tag, glow: true,
        onClick: () => {
          Camera.recentreOn((e.col + (e.width || 1) / 2) * TILE, (e.row + (e.height || 1) / 2) * TILE);
          EntityInfoPanel.open(e);
        },
      });
    }
    if (left <= GEN_BURN_WARN && !e._genBurnWarned) {
      e._genBurnWarned = true;
      showToast(`⚠️ ${name} is about to EXPLODE`, '#ff4020', '#1a0400', '#902010', 'genburn');
    }
    return false;
  }
  function _raining() { return typeof RainSystem !== 'undefined' && !!RainSystem.isActive?.(); }

  /* ═══════════════════════════════════════════════════════════════
     WIRE FIRES
     Cable burns, and unlike everything else on the map it is a
     CONTINUOUS path. A building fire stalls at the first gap in the
     block; a wire fire runs the length of the line and lights whatever
     is standing at the far end of it.

     This is what stops "just space your storage out" from being a
     complete answer. A bank sited half a map from the city is still
     wired to it, and that wire is a fuse — so the real lesson is to
     think about what the line PASSES THROUGH on its way home, not only
     about how far apart the endpoints are.

     A burning wire reuses the existing wire-fault state (failed +
     _weatherFailed) rather than inventing a second one, so it picks up
     the spark visual, the info-panel repair button, the bulk Wire
     Repair selector and the save format already built for weather
     faults. The only thing added on top is _wireOnFire, which is the
     part that spreads and which burns itself out after a while.
     ═══════════════════════════════════════════════════════════════ */

  // Poles carry the same fault state and stand in the same fires.
  const WIRE_TYPES = [T.WIRE, T.POLE];
  function isWire(e) { return !!e && WIRE_TYPES.includes(e.type); }

  // Anything fire can take hold of: every building lightning could strike,
  // plus the cable between them. NOT the same as isStrikeable — a bolt
  // still never singles out a wire, it just burns like everything else once
  // something nearby is alight.
  function isFlammable(e) {
    if (!e || !e.def) return false;
    return isWire(e) || isStrikeable(e);
  }

  // Fire runs along a line far faster than it crosses a street.
  const WIRE_SPREAD_INTERVAL = 5;     // sim seconds between jumps
  const WIRE_SPREAD_RANGE    = 1.5;   // tiles, edge to edge
  const WIRE_TO_WIRE_CHANCE  = 0.62;  // down the line
  const WIRE_TO_BLDG_CHANCE  = 0.28;  // off the line into whatever it feeds
  // A given span burns out after this long, leaving it dead but no longer
  // spreading. Without a burn-out a single strike would eventually take
  // every wire on the map, which is a map-wipe rather than a setback.
  const WIRE_BURN_SECONDS    = 55;

  // Burning wires, rebuilt once per logic tick alongside _damaged.
  let _burningWires = [];
  function isWireOnFire(e) { return !!(e && e._wireOnFire); }

  // True if this actually started a new fire.
  function _igniteWire(w) {
    if (!isWire(w) || w._wireOnFire || w._lightningDamaged) return false;
    w._wireOnFire    = true;
    w._wireFireT     = 0;
    w._wireBurnLeft  = WIRE_BURN_SECONDS;
    // Cable that has been through a fire is cable that needs replacing.
    w.failed         = true;
    w._weatherFailed = true;
    w._faultCause    = 'fire';     // for the Wire Fault card
    if (typeof GridBreakWatch !== 'undefined') GridBreakWatch.noteChanged();
    return true;
  }

  // Called by every wire-repair path, so a repaired span stops spreading.
  // Exported because the repair UI lives in three other files.
  function clearWireFire(w) {
    if (!w) return;
    w._wireOnFire   = false;
    w._wireFireT    = undefined;
    w._wireBurnLeft = undefined;
  }

  // One burning span's turn: burn down, then roll to pass the fire on.
  // Returns true if it ignited something that needs a topology recompute.
  function _tickWireFire(w, simDt) {
    w._wireBurnLeft = (w._wireBurnLeft ?? WIRE_BURN_SECONDS) - simDt * (_raining() ? RAIN_WIRE_BURN_MUL : 1);
    if (w._wireBurnLeft <= 0) { clearWireFire(w); return false; }

    w._wireFireT = (w._wireFireT || 0) + simDt;
    if (w._wireFireT < WIRE_SPREAD_INTERVAL) return false;
    w._wireFireT = 0;

    const rain = (typeof RainSystem !== 'undefined' && RainSystem.isActive?.()) ? SPREAD_RAIN_MUL : 1;

    let lit = false;
    for (const e of EntityRegistry.active()) {   // scenery is never flammable
      if (e === w || !isFlammable(e)) continue;
      if (isWire(e) ? (e._wireOnFire || e.failed) : e._lightningDamaged) continue;
      if (_edgeDist(w, e) > WIRE_SPREAD_RANGE) continue;

      if (isWire(e)) {
        if (Math.random() < WIRE_TO_WIRE_CHANCE * rain && _igniteWire(e)) lit = true;
      } else if (Math.random() < WIRE_TO_BLDG_CHANCE * rain) {
        // A wire fire reaching a building is how a fire crosses a gap it
        // could never have jumped on its own.
        if (_damage(e, { silent: true, cause: 'fire' })) {
          _totalBurned++;
          lit = true;
          _fuseIfArmed(e, e.charge || 0);
          const now = _now();
          if (now - _spreadToastAt > 8) {
            _spreadToastAt = now;
            showToast(`🔥 Fire travelled the wires to ${e.businessName || e.def.label}: ${countDamaged()} burning`,
                      '#ff6020', '#140800', '#702010', 'firespread');
          }
        }
      }
    }
    return lit;
  }

  // Shared by every path that sets a building alight: if it is a charged
  // bank, light its fuse. Pulled out so the wire path, the spread path and
  // the blast path cannot drift apart on this.
  function _fuseIfArmed(e, held) {
    if (!_isArmed(e, held) || e._detonated) return;
    e._detonated = true;
    if (!volatileOf(e) && _detonationSuppressed(e)) return;
    _fuses.push({ e, depth: 1, held, at: _now() + 2.5 + Math.random() * 2.5 });
    showToast(`⚠️ Fire reached ${e.businessName || e.def.label}; it's going to blow`,
              '#ffc040', '#1a1000', '#806020');
  }

  // Wires are candidates too — a fire next to a line takes the line, which
  // is how it reaches a part of the grid it could never have walked to.
  function _spreadCandidates(src) {
    const out = [];
    for (const e of EntityRegistry.all()) {
      if (e === src || !isFlammable(e)) continue;
      if (isWire(e) ? (e._wireOnFire || e.failed) : e._lightningDamaged) continue;
      const d = _edgeDist(src, e);
      if (d <= SPREAD_RANGE) out.push({ e, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  // Advance one burning building's spread clock. `simDt` is sim seconds.
  function _tickSpread(src, simDt) {
    if (simDt <= 0) return;
    src._fireSpreadT = (src._fireSpreadT || 0) + simDt;
    if (src._fireSpreadT < SPREAD_INTERVAL) return;
    src._fireSpreadT = 0;

    let chance = SPREAD_CHANCE;
    if (typeof RainSystem !== 'undefined' && RainSystem.isActive?.()) chance *= SPREAD_RAIN_MUL;
    if (isRepairing(src)) chance *= SPREAD_REPAIR_MUL;
    if (Math.random() >= chance) return;

    const cands = _spreadCandidates(src);
    if (cands.length === 0) return;
    // Touching neighbours catch first; something a tile out only catches
    // when nothing closer is left to burn.
    const pick = cands[0].d <= 0.01 || cands.length === 1
               ? cands[0].e
               : cands[Math.random() < 0.75 ? 0 : (Math.random() * Math.min(3, cands.length)) | 0].e;
    // A wire caught next to a fire just burns — it has its own state and
    // its own much faster spread, handled by _tickWireFire.
    if (isWire(pick)) {
      if (_igniteWire(pick)) PowerNetwork.recomputeWireHops();
      return;
    }

    // Captured before _damage empties it — see blastRadius().
    const _held = pick.charge || 0;
    if (!_damage(pick, { silent: true, cause: 'fire' })) return;
    _totalBurned++;

    const c = _centreWorld(pick);
    Particles.spawn(c.wx, c.wy, '#ff8020', 12);

    // Throttled: a bad fire can take a building every few seconds and the
    // player only needs telling that it is still moving, not a roll call.
    const now = _now();
    if (now - _spreadToastAt > 8) {
      _spreadToastAt = now;
      showToast(`🔥 Fire spread to ${pick.businessName || pick.def.label}: ${countDamaged()} burning`,
                '#ff6020', '#140800', '#702010', 'firespread');
    }

    // An explosive building catching fire is on a fuse, not a timer — the
    // player gets a short window to dispatch a crew before it goes up.
    _fuseIfArmed(pick, _held);
  }

  // Rain has put this building's fire out. It stays damaged (offline, no
  // income, needs a crew) — only the burning and spreading stop.
  function _douse(e) {
    e._fireOut = true;
    e._fireSpreadT = 0;
    const c = _centreWorld(e);
    Particles.spawn(c.wx, c.wy, '#a0b0c0', 10);   // puff of steam
  }

  // ── Frame hooks ──────────────────────────────────────────────────

  function tick(dt) {
    // Surge decay is measured in in-game hours, so it has to advance on sim
    // time. This function is driven from RainSystem.tick with a hardcoded
    // real-time 0.1 (see game_loop.js), so scale it here the same way
    // LightningSystem does for its cluster cadence.
    const simDt = dt * ((typeof DevMode !== 'undefined' && DevMode.timeScale != null) ? DevMode.timeScale : 1);
    if (simDt > 0) {
      for (const rod of allRods()) {
        if (rod._surgeRemaining > 0) {
          rod._surgeRemaining = Math.max(0, rod._surgeRemaining - simDt);
        }
      }
    }

    // One pass that both refreshes the fire list and advances any crews on
    // site. The list rebuild runs even while paused, so fires keep rendering
    // on a paused game; only the crew timer is gated on sim time.
    _damaged      = [];
    _burningWires = [];
    // Scenery can neither burn nor be damaged, so this per-tick pass skips it.
    for (const e of EntityRegistry.active()) {
      // Burning cable is tracked in its own list — it has its own state,
      // its own much faster spread and its own repair route.
      if (e._wireOnFire) _burningWires.push(e);
      if (!e._lightningDamaged) continue;
      _damaged.push(e);
      if (simDt > 0 && e._repairRemaining > 0) {
        // A drone working on the building speeds the repair up (drone_system.js).
        e._repairRemaining -= simDt * (typeof DroneSystem !== 'undefined' ? DroneSystem.repairBoost(e) : 1);
        if (e._repairRemaining <= 0) { _finishRepair(e); continue; }
      }
      // Rain wears the fire down; once it's out the building only smoulders.
      // Dry weather lets a part-doused fire build back up.
      if (simDt > 0 && !e._fireOut && _raining()) {
        if (e._douseAt === undefined) e._douseAt = RAIN_DOUSE_SECONDS * (0.7 + Math.random() * 0.7);
        e._rainDouse = (e._rainDouse || 0) + simDt;
        if (e._rainDouse >= e._douseAt) _douse(e);
      } else if (simDt > 0 && !e._fireOut && e._rainDouse > 0) {
        e._rainDouse = Math.max(0, e._rainDouse - simDt * RAIN_REKINDLE_MUL);
      }
      if (simDt > 0 && e._fireOut && (e._smoulderT || 0) < SMOULDER_FADE) e._smoulderT = (e._smoulderT || 0) + simDt;
      // A burning Coal / Fuel Generator is on a timer to explode.
      if (simDt > 0 && !e._fireOut && GEN_BURN_TYPES.has(e.type) && _tickGenBurn(e, simDt)) continue;
      else if (GEN_BURN_TYPES.has(e.type) && (e._fireOut || e._detonated)) NotificationStack.dismissTag(_burnTag(e));
      // Still burning — it can take a neighbour with it. Runs after the
      // repair step so a building that finished this tick never spreads.
      if (simDt > 0 && !e._fireOut) _tickSpread(e, simDt);
    }

    // Wire fires run after the building pass so a span lit this tick gets a
    // full interval before it can pass the fire on. One recompute at the
    // end rather than one per ignition — a line going up can light a dozen
    // spans in a tick, and each recompute walks the whole network.
    if (simDt > 0 && _burningWires.length > 0) {
      let dirty = false;
      for (const w of _burningWires) if (_tickWireFire(w, simDt)) dirty = true;
      if (dirty) PowerNetwork.recomputeWireHops();
    }

    _tickFuses(simDt > 0);
    _tickZones();

    const now = _now();
    for (let i = _blasts.length - 1; i >= 0; i--) {
      if (now - _blasts[i].t0 > BLAST_LIFE) _blasts.splice(i, 1);
    }
    for (let i = _nukes.length - 1; i >= 0; i--)   if (now - _nukes[i].t0 > NUKE_LIFE)      _nukes.splice(i, 1);
    for (let i = _strikes.length - 1; i >= 0; i--) {
      if (now - _strikes[i].t0 > STRIKE_LIFE) _strikes.splice(i, 1);
    }
    if (_notifActive && countDamaged() === 0) {
      NotificationStack.dismissTag('lightningdamage');
      _notifActive = false;
    }
    // A struck building that was demolished (or repaired some other way)
    // takes its card with it. Skipped at a contract site, where the home
    // world's tiles are swapped out and every building would look "gone".
    if (_strikeCards.size > 0 && !(typeof ContractSystem !== 'undefined' && ContractSystem.isAtSite?.())) {
      for (const [tag, e] of _strikeCards) {
        if (!e._lightningDamaged || GridManager.getEntity(e.col, e.row) !== e) {
          _strikeCards.delete(tag);
          NotificationStack.dismissTag(tag);
        }
      }
    }
  }

  // World-space bolt + impact flash. Drawn under the camera transform,
  // after entities, so a strike on a building the player happens to be
  // looking at reads as landing on that building.
  function renderStrikes(ctx, t) {
    renderNukes(ctx);
    renderBlasts(ctx);
    if (_strikes.length === 0) return;
    ctx.save();
    const now = _now();
    for (const s of _strikes) {
      const u = (now - s.t0) / STRIKE_LIFE;
      if (u < 0 || u > 1) continue;
      // Two quick re-strikes, like a real flicker. Between and after them
      // the channel stays faintly visible rather than vanishing outright —
      // a strictly physical ~50 ms flash is gone before the eye finds it,
      // and this is the moment the whole system exists to show.
      const fade    = Math.max(0, 1 - u);
      const flicker = (u < 0.16) || (u > 0.22 && u < 0.32) || (u > 0.38 && u < 0.45);
      const boltAlpha = flicker ? 0.95 : 0.28 * fade;

      if (boltAlpha > 0.02) {
        ctx.globalAlpha = boltAlpha;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = (flicker ? 3 : 1.8) / Camera.zoom;
        ctx.shadowColor = s.absorbed ? '#80d0ff' : '#ffe0a0';
        ctx.shadowBlur  = flicker ? 24 : 12;
        ctx.beginPath();
        ctx.moveTo(s.bolt[0].x, s.bolt[0].y);
        for (let i = 1; i < s.bolt.length; i++) ctx.lineTo(s.bolt[i].x, s.bolt[i].y);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Impact bloom at the point of contact
      const r    = TILE * (0.6 + u * 2.6);
      const core = s.absorbed ? 'rgba(160,220,255,' : 'rgba(255,220,140,';
      const g    = ctx.createRadialGradient(s.wx, s.wy, 0, s.wx, s.wy, r);
      g.addColorStop(0,   core + (0.85 * fade) + ')');
      g.addColorStop(0.5, core + (0.30 * fade) + ')');
      g.addColorStop(1,   core + '0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle   = g;
      ctx.beginPath(); ctx.arc(s.wx, s.wy, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ── Explosion visual ─────────────────────────────────────────────
  // One event, drawn as a sequence of layers that each peak at a different
  // moment, so the eye is led through it instead of watching one circle
  // grow:
  //
  //   0.00  white flash floods the block — everything nearby is lit by it
  //   0.02  sparks and jets punch out ahead of everything else
  //   0.05  fireball blooms, torn-edged, cooling as it goes
  //   0.10  shockwave ring outruns it and marks the damage radius
  //   0.12  dust ring rolls out low along the ground
  //   0.15  debris arcs out, trailing smoke, and lands charred
  //   0.20+ secondary cook-offs pop inside the wreck
  //   0.30+ the column lifts and broadens into a mushroom
  //
  // All of it is drawn in world space under the camera transform, so it
  // sits in the city rather than on top of the screen.
  function renderBlasts(ctx) {
    if (_blasts.length === 0) return;
    const now = _now();
    const wind = _smokeWind();
    ctx.save();
    for (const b of _blasts) {
      const u = (now - b.t0) / BLAST_LIFE;
      if (u < 0 || u > 1) continue;
      const R = b.r;

      // ── Flash. A blast is a light source before it is an object: for the
      //    first fifth of a second it washes the surrounding blocks, which
      //    is what makes the city feel like it is standing inside the event
      //    rather than beside a picture of one. Additive, so it brightens
      //    what is already drawn instead of painting over it.
      const flu = u / 0.08;
      if (flu < 1) {
        const fade = (1 - flu) * (1 - flu);
        ctx.globalCompositeOperation = 'lighter';
        const fr = R * 4.5;
        const fg = ctx.createRadialGradient(b.wx, b.wy, 0, b.wx, b.wy, fr);
        fg.addColorStop(0,    `rgba(255,250,225,${0.85 * fade})`);
        fg.addColorStop(0.25, `rgba(255,216,150,${0.45 * fade})`);
        fg.addColorStop(0.6,  `rgba(255,150,60,${0.16 * fade})`);
        fg.addColorStop(1,    'rgba(255,120,40,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(b.wx, b.wy, fr, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }

      // ── Scorch. Snaps in and stays for the whole life, so the ground
      //    under the fireball is already black when it thins out.
      ctx.globalAlpha = Math.min(1, u * 10) * (0.55 - 0.2 * u);
      const sg = ctx.createRadialGradient(b.wx, b.wy, 0, b.wx, b.wy, R * 0.85);
      sg.addColorStop(0,    'rgba(10,7,5,0.95)');
      sg.addColorStop(0.55, 'rgba(20,14,10,0.55)');
      sg.addColorStop(1,    'rgba(20,14,10,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(b.wx, b.wy, R * 0.85, 0, Math.PI * 2); ctx.fill();

      // ── Dust ring. Low, wide and grey, rolling outward along the ground
      //    behind the shockwave. It reads as mass being moved, which the
      //    bright layers on their own never do.
      const du = (u - 0.04) / 0.5;
      if (du > 0 && du < 1) {
        const dr = R * (0.3 + 1.3 * Math.pow(du, 0.55));
        const dust = _smokeBillow(0, 0.3);
        ctx.globalAlpha = (1 - du) * 0.45;
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          const px = b.wx + Math.cos(a) * dr;
          const py = b.wy + Math.sin(a) * dr * 0.55;
          const pr = R * (0.13 + 0.2 * du) * (0.8 + 0.4 * _h01(i * 7 + 3));
          ctx.drawImage(dust, px - pr, py - pr * 0.65, pr * 2, pr * 1.3);
        }
      }

      // ── Mushroom column. Billows that lift and broaden for the rest of
      //    the life, leaning downwind like the cooling-tower steam, lit
      //    orange from beneath while the fireball still burns under them and
      //    cooling to grey as they climb. Painted top down (see the column's
      //    sort in _spawnBlastVisual) and behind the fireball, so the ball
      //    stays in front and the column rises out of it. Still climbing as
      //    the ground fires take over the frame.
      for (const cp of b.column) {
        const cu = (u - 0.12 - cp.delay) / (0.88 - cp.delay);
        if (cu <= 0 || cu >= 1) continue;
        const spread = R * (0.12 + 0.5 * cp.spread * Math.pow(cu, 0.7));
        const drift = (0.15 + wind.s) * TILE * 3.2 * cu * cu;
        const px = b.wx + Math.cos(cp.a) * spread + wind.dx * drift + Math.sin(u * 3 + cp.ph) * R * 0.05 * cu;
        const py = b.wy + Math.sin(cp.a) * spread * 0.45 - cu * TILE * 4.2 * cp.rise + wind.dy * drift * 0.5;
        const pr = R * cp.size * (0.75 + 1.05 * cu);
        const a  = Math.min(1, cu * 5) * Math.pow(1 - cu, 1.2) * 0.85;
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        ctx.drawImage(_smokeBillow(Math.max(0, 1 - cu * 2.4), 0), px - pr, py - pr, pr * 2, pr * 2);
      }

      // ── Fireball. Expands fast then stalls, cooling white → amber →
      //    orange → dull red, lifting as it burns out into the column.
      //    Billows rather than one gradient, so it has a body — lobes, hot
      //    cells, sooty folds — where a gradient reads as a bloom of light.
      const fu = Math.min(1, u / 0.38);
      if (fu < 1) {
        const grow  = Math.pow(fu, 0.42);
        const fr    = R * (0.2 + 0.8 * grow);
        const climb = R * 0.55 * fu * fu;
        const body  = fu < 0.6 ? 1 : 1 - (fu - 0.6) / 0.4;

        // Its light first, additive, so the block round it glows through
        // the gaps between billows.
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.9 * (1 - fu);
        const gr = fr * 1.9;
        ctx.drawImage(_seatGlow(), b.wx - gr, b.wy - climb * 0.5 - gr, gr * 2, gr * 2);
        ctx.globalCompositeOperation = 'source-over';

        // Outermost first (the spawn order), so the hot heart sits on top.
        // The rim cools first and the heart last.
        for (const f of b.fire) {
          const d = fr * f.reach * Math.min(1, grow * f.speed);
          const x = b.wx + Math.cos(f.a) * d + Math.sin(u * 7 + f.ph) * R * 0.03;
          const y = b.wy + Math.sin(f.a) * d * 0.7 - climb * (0.6 + 0.8 * f.lift);
          const r = fr * f.size * (1 + 0.6 * grow);
          const T = Math.max(0, Math.min(1, fu * 1.1 + f.reach * 0.4 + f.heat - 0.12));
          ctx.globalAlpha = body * Math.min(1, fu * 12 + 0.3) * 0.95;
          ctx.drawImage(_fireBillow(T), x - r, y - r, r * 2, r * 2);
        }

        // Roiling. As the ball cools, soot blooms through it from the
        // inside — which is what turning-to-smoke looks like. Without this
        // the fireball just dims uniformly, and a uniform dim reads as a
        // light being switched off rather than as combustion ending. Lit
        // from within at first, then grey as the column takes it over.
        if (fu > 0.3) {
          const ru = (fu - 0.3) / 0.7;
          const soot = _smokeBillow(1 - ru, 0);
          ctx.globalAlpha = Math.min(1, ru * 2.2) * (1 - ru * ru) * 0.85;
          for (const f of b.fire) {
            if (!f.soot) continue;
            const d = fr * f.reach * 0.8;
            const x = b.wx + Math.cos(f.a) * d;
            const y = b.wy + Math.sin(f.a) * d * 0.7 - climb * (0.7 + 0.8 * f.lift);
            const r = fr * f.size * (0.6 + 0.9 * ru);
            ctx.drawImage(soot, x - r, y - r, r * 2, r * 2);
          }
        }
        ctx.globalAlpha = 1;

        // Overexposed core — the first few frames only, which is what sells
        // the initial moment as light rather than paint.
        if (fu < 0.25) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = (1 - fu / 0.25) * 0.95;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(b.wx, b.wy, R * 0.36 * (1 - fu * 0.6), 0, Math.PI * 2); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
      }

      // ── Jets. Narrow tongues punched out along whatever gave way first,
      //    ahead of the fireball and gone before it peaks.
      for (const j of b.jets) {
        const ju = (u - j.delay) / 0.13;
        if (ju <= 0 || ju >= 1) continue;
        const len  = R * j.reach * Math.pow(ju, 0.5);
        const fade = 1 - ju;
        ctx.save();
        ctx.translate(b.wx, b.wy);
        ctx.rotate(j.a);
        ctx.globalCompositeOperation = 'lighter';
        const jg = ctx.createLinearGradient(0, 0, len, 0);
        jg.addColorStop(0,   `rgba(255,250,220,${0.85 * fade})`);
        jg.addColorStop(0.4, `rgba(255,170,60,${0.6 * fade})`);
        jg.addColorStop(1,   'rgba(220,60,20,0)');
        ctx.fillStyle = jg;
        ctx.beginPath();
        ctx.moveTo(0, -R * j.width);
        ctx.lineTo(len, -R * j.width * 0.25);
        ctx.lineTo(len,  R * j.width * 0.25);
        ctx.lineTo(0,    R * j.width);
        ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
      }

      // ── Shockwave. Outruns the fireball and keeps going past the blast
      //    radius, marking exactly how far the damage reached.
      const su = Math.min(1, u / 0.34);
      if (su < 1) {
        const sr = R * (0.2 + 1.2 * Math.pow(su, 0.55));
        ctx.globalAlpha = (1 - su) * 0.8;
        ctx.strokeStyle = '#ffeebb';
        ctx.lineWidth   = Math.max(1, (4.5 * (1 - su)) / Camera.zoom);
        ctx.beginPath(); ctx.arc(b.wx, b.wy, sr, 0, Math.PI * 2); ctx.stroke();
        // Faint trailing wave — one ring alone reads as a bubble.
        ctx.globalAlpha = (1 - su) * 0.3;
        ctx.lineWidth   = Math.max(0.8, 2 / Camera.zoom);
        ctx.beginPath(); ctx.arc(b.wx, b.wy, sr * 0.7, 0, Math.PI * 2); ctx.stroke();
      }

      // ── Sparks. Thin, fast and gone — the violence of the first moment.
      //    The fireball on its own expands too smoothly to read as an
      //    explosion rather than a bloom; these are what cut it.
      ctx.lineCap = 'round';
      for (const sp of b.sparks) {
        const pu = (u - sp.delay) / sp.life;
        if (pu <= 0 || pu >= 1) continue;
        const reach = sp.dist * Math.pow(pu, 0.45);
        const ca = Math.cos(sp.a), sa = Math.sin(sp.a);
        const ex = b.wx + ca * reach, ey = b.wy + sa * reach * 0.7;
        const tail = sp.len * (1 - pu);
        ctx.globalAlpha = (1 - pu) * 0.9;
        ctx.strokeStyle = pu < 0.4 ? '#fff6d0' : '#ffae42';
        ctx.lineWidth   = Math.max(0.6, 1.6 / Camera.zoom);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - ca * tail, ey - sa * tail * 0.7);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';

      // ── Debris, thrown on ballistic arcs and fading as it lands. The
      //    heavy pieces drag a smoke trail behind them.
      for (const d of b.debris) {
        const d2 = (u - d.delay) / 0.55;
        if (d2 <= 0 || d2 >= 1) continue;
        const reach = d.dist * Math.pow(d2, 0.6);              // decelerating outward
        const hop   = Math.sin(d2 * Math.PI) * TILE * d.lift;  // up, then down
        const ca = Math.cos(d.a), sa = Math.sin(d.a);
        const dx = b.wx + ca * reach;
        const dy = b.wy + sa * reach * 0.62 - hop;
        const a  = (1 - d2) * (1 - d2);

        if (d.trail && d2 < 0.8) {
          ctx.globalAlpha = a * 0.3;
          ctx.strokeStyle = 'rgba(90,80,74,1)';
          ctx.lineWidth   = Math.max(0.8, d.size * 0.5);
          ctx.beginPath();
          ctx.moveTo(dx, dy);
          ctx.lineTo(b.wx + ca * reach * 0.75,
                     b.wy + sa * reach * 0.62 * 0.75 - hop * 0.6);
          ctx.stroke();
        }

        ctx.globalAlpha = a;
        // Hot early, charred by the time it lands.
        ctx.fillStyle = d2 < 0.35
          ? `rgb(255,${Math.round(210 - 120 * d2)},90)`
          : `rgb(${Math.round(72 - 30 * d2)},${Math.round(60 - 26 * d2)},54)`;
        ctx.save();
        ctx.translate(dx, dy);
        ctx.rotate(d.spin * d2);
        const sz = d.size * (1 - d2 * 0.3);
        ctx.fillRect(-sz / 2, -sz / 2, sz, sz * 0.7);
        ctx.restore();
      }

      // ── Secondary cook-offs inside the wreck. Small, late and staggered
      //    — the site still coming apart after the main event, and what
      //    keeps the player's eye on it while the ground fires establish.
      for (const pp of b.pops) {
        const pu = (u - pp.at) / 0.16;
        if (pu <= 0 || pu >= 1) continue;
        const px = b.wx + Math.cos(pp.a) * pp.d;
        const py = b.wy + Math.sin(pp.a) * pp.d * 0.7;
        _firePop(ctx, px, py, R * pp.size * (0.3 + Math.pow(pu, 0.4)), pu);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // Cheap deterministic hash -> [0,1). Fire seats, sizes and phases are all
  // derived from this rather than Math.random(), so a given wreck burns the
  // same way every frame instead of strobing into visual noise.
  function _h01(n) {
    n = (n ^ 61) ^ (n >>> 16);
    n = (n + (n << 3)) | 0;
    n = n ^ (n >>> 4);
    n = Math.imul(n, 0x27d4eb2d);
    n = n ^ (n >>> 15);
    return (n >>> 0) / 4294967296;
  }

  // Persistent damaged-building visual: an actual fire — seated flames with
  // a warm ground glow, a rising smoke column, drifting embers, and soot —
  // plus the repair readout and warning badge.
  //
  // Drawn in a deferred pass after the whole entity loop (see
  // renderAllFires), so smoke columns rise over neighbouring buildings
  // instead of being painted out by whatever is drawn below-right of them.
  function renderDamage(ctx, e, x, y, t, quality) {
    // `quality` (0.4-1) is handed down by renderAllFires so a city with a
    // dozen simultaneous fires sheds flame detail rather than the frame
    // rate. A lone fire always renders at full quality.
    const q = quality == null ? 1 : quality;
    // A ruin of the apocalypse that has burned out and gone cold: nothing on it
    // smokes any more (ApocalypseSystem's quench).
    if (!e._lightningDamaged || e._ashCold) return;
    const w = (e.width || 1) * TILE;
    const h = (e.height || 1) * TILE;

    // The crew puts the fire out as they work: flames are gone by ~70%
    // through the repair, while smoke lingers most of the way. An
    // unattended strike burns at full intensity indefinitely.
    const prog  = isRepairing(e) ? repairProgress(e) : 0;
    // Rain works the fire down: the flames shrink steadily over the douse,
    // reaching nothing just as it goes out, and the smoke turns to pale
    // steam. Put out: no flames, and the smoke thins to a smoulder.
    const douse = !e._fireOut && e._douseAt ? Math.min(1, (e._rainDouse || 0) / e._douseAt) : 0;
    const fire  = e._fireOut ? 0 : Math.max(0, 1 - prog / 0.7) * (1 - douse);
    const smoulder = e._fireOut ? 0.35 + 0.65 * (1 - Math.min(1, (e._smoulderT || 0) / SMOULDER_FADE)) : 1;
    const smoke = Math.min(smoulder, Math.max(0, 1 - prog * 0.85));
    const steam = e._fireOut ? Math.max(0, 1 - (e._smoulderT || 0) / SMOULDER_FADE) * 0.8 : douse;   // 0 = black smoke, 1 = white steam

    // Smoke leans with the prevailing wind, so a fire during the storm that
    // started it visibly bends downwind.
    const wind = _smokeWind();
    const zoom = Camera.zoom;
    const detail = zoom > 0.35;

    const seed = ((e.col * 73856093) ^ (e.row * 19349663)) >>> 0;
    const area = (e.width || 1) * (e.height || 1);
    // Bigger footprints burn in more places — a reactor is an inferno, a
    // shed is one seat of fire. With a whole city alight on screen (q is
    // dropped to 0.25 for that — see renderAllFires) every building still
    // burns and smokes, but from at most two seats: at that density a third
    // seat is indistinguishable, and seats multiply every other layer.
    const crowd = q <= 0.25;
    // A building caught in an explosion doesn't burn in a spot or two, it
    // goes up: seats spread right across the footprint so their flames run
    // together into one blaze, flames and glow sized to the building (`big`),
    // and a smoke column to match. A lightning strike or a fire that spread
    // from next door lights the usual few seats.
    const blast = e._fireCause === 'blast';
    const big   = blast ? Math.min(3, 1.3 + 0.32 * Math.min(e.width || 1, e.height || 1)) : 1;
    const seats = blast
      ? Math.max(2, Math.min(crowd ? 3 : 7, Math.round(Math.sqrt(area) * 1.3)))
      : Math.max(1, Math.min(crowd ? 2 : 5, Math.round(Math.sqrt(area))));
    const seatX = i => x + w * (blast ? 0.12 + 0.76 * (i + _h01(seed + i * 7)) / seats : 0.2 + 0.6 * _h01(seed + i * 7));
    const seatY = i => y + h * (blast ? 0.45 + 0.45 * _h01(seed + i * 13) : 0.4 + 0.45 * _h01(seed + i * 13));

    ctx.save();

    // ── Soot ────────────────────────────────────────────────────────
    // Scorch marks: a handful of soft dark patches of different sizes, laid
    // where this building's fire sits and a few places besides, each fading
    // to nothing at its own edge. (It used to be one dark rectangle over the
    // footprint, which read as a tinted box round the building.) The patches
    // are placed from the building's own seed, so they stay put.
    // Not under a ruin with a crowd on screen (a burning city): the rubble
    // bitmap is already black, the soot goes on at 12%, and it was several
    // draws per fire.
    if (!(crowd && e._irreparable)) {
      const soot = _sootPatch(), n = seats + 2, span = Math.min(w, h);
      ctx.globalAlpha = e._irreparable ? 0.12 * fire : 0.4 + 0.16 * fire;
      for (let i = 0; i < n; i++) {
        const onSeat = i < seats;
        const sx = onSeat ? seatX(i) : x + w * (0.12 + 0.76 * _h01(seed + i * 101));
        const sy = onSeat ? seatY(i) : y + h * (0.12 + 0.76 * _h01(seed + i * 131));
        const rx = Math.max(TILE * 0.45, span * (0.26 + 0.24 * _h01(seed + i * 37)));
        const ry = rx * (0.65 + 0.5 * _h01(seed + i * 71));
        ctx.drawImage(soot, sx - rx, sy - ry, rx * 2, ry * 2);
      }
    }

    // ── Ground glow under each seat — this is what makes it read as a
    //    real fire rather than a decal, since it lights the wreck.
    if (fire > 0.02) {
      for (let i = 0; i < seats; i++) {
        const sx = seatX(i);
        const sy = seatY(i);
        const ph = _h01(seed + i * 53) * 10;
        const fl = 0.75 + 0.15 * Math.sin(t * 9.1 + ph) + 0.10 * Math.sin(t * 14.7 + ph * 2.3);
        const r  = TILE * 1.6 * big * fl * fire;
        // A cached full-strength glow scaled to r and faded by fire*fl —
        // the same image the per-seat gradient used to build every frame
        // (its stops were just these alphas times fire*fl), without
        // allocating one gradient per seat per building per frame.
        ctx.globalAlpha = Math.min(1, fire * fl);
        ctx.drawImage(_seatGlow(), sx - r, sy - r, r * 2, r * 2);
      }
    }

    // ── Smoke column ────────────────────────────────────────────────
    // Billows streaming up off the flames, built like the cooling-tower
    // steam: lit orange from beneath while low over the fire, sooty grey
    // higher up, white steam while rain is putting it out. Drawn before the
    // flames so the fire stands in front of its own smoke, and each seat's
    // billows are walked highest first, so the young ones low down sit
    // over the column they are pushing up.
    if (smoke > 0.02) {
      const puffs = Math.max(3, Math.round((detail ? 11 : 4) * q));
      const dens  = smoke * (crowd ? 0.65 : 0.88);
      // A blaze's column is wider and climbs higher, from every other seat:
      // its billows are big enough to merge into one column anyway.
      const grow  = 1 + 0.5 * (big - 1), climb = TILE * 5.2 * (1 + 0.4 * (big - 1));
      for (let i = 0; i < seats; i += blast ? 2 : 1) {
        const sx = seatX(i);
        const sy = seatY(i) - TILE * 0.35 * big;
        const ph = _h01(seed + i * 53) * 10;
        // Continuous 0..1 lifetime, offset per billow so the column streams
        // rather than pulsing all at once; k0 is the one furthest up.
        const base = ((t * 0.22 + ph) % 1 + 1) % 1;
        const k0 = Math.ceil((1 - base) * puffs) - 1;
        for (let s = 0; s < puffs; s++) {
          const k = (k0 - s + puffs) % puffs;
          const u = (base + k / puffs) % 1;
          const j = _h01(seed + i * 97 + k * 31);
          const drift = (0.35 + wind.s) * u * u * TILE * 2.4;
          const bx = sx + wind.dx * drift + Math.sin(t * 0.7 + ph + k) * u * TILE * 0.18 + (j - 0.5) * TILE * 0.25 * u;
          const by = sy - u * climb + wind.dy * drift * 0.5;
          const r  = TILE * (0.3 + 1.05 * Math.pow(u, 0.75)) * (0.85 + 0.3 * j) * grow;
          // Fade in fast, out slowly — a billow shouldn't pop into existence.
          const a = dens * Math.min(1, u * 6) * Math.pow(1 - u, 1.2);
          if (a <= 0.01) continue;
          ctx.globalAlpha = a;
          // Greying out as it climbs and thins, the way soot does.
          const tint = Math.max(steam * (1 - 0.25 * u), u * 0.45);
          ctx.drawImage(_smokeBillow(fire * Math.max(0, 1 - u * 2.6), tint), bx - r, by - r, r * 2, r * 2);
        }
      }
    }

    // ── Flames ──────────────────────────────────────────────────────
    // Fire billows streaming up from each seat: born white-hot at the root,
    // cooling through amber and orange to red as they climb, shrinking to a
    // tip and thinning out into the smoke — the steam column's method, run
    // fast and hot. Each billow sways further off-axis the higher it gets,
    // and each sways its own way, so the flame licks and forks instead of
    // standing as one tidy plume. A steady bed of fire sits on the seat so
    // the root never gaps, and a little of the fire's light goes on
    // additively so the body glows. Stretched taller than wide: round
    // billows read as glowing cotton rather than flame.
    if (fire > 0.02 && (detail || !crowd)) {
      const n = detail ? Math.max(crowd ? 3 : 4, Math.round((zoom > 0.8 ? 14 : 9) * q)) : 3;
      for (let i = 0; i < seats; i++) {
        const sx    = seatX(i);
        const sy    = seatY(i);
        const scale = (0.75 + 0.5 * _h01(seed + i * 29)) * big;
        const ph    = _h01(seed + i * 53) * 10;
        // Summed sines, not a per-frame random: a flicker, not static.
        const fl = 0.8 + 0.12 * Math.sin(t * 8.6 + ph) + 0.08 * Math.sin(t * 15.3 + ph * 2.1);
        const maxH  = TILE * 1.3 * scale * fire * fl;
        const baseR = TILE * 0.24 * scale * (0.5 + 0.5 * fire);
        const base = ((t * 1.5 + ph) % 1 + 1) % 1;
        const k0 = Math.ceil((1 - base) * n) - 1;
        for (let s = 0; s < n; s++) {
          const k = (k0 - s + n) % n;
          const p = (base + k / n) % 1;              // 0 at the root, 1 at the tip
          const j = _h01(seed + i * 89 + k * 17);
          const bx = sx + (j - 0.5) * TILE * 0.22 * scale * (1 - p)
                   + Math.sin(t * 2.9 + ph + p * 3.4 + j * 6) * TILE * 0.14 * scale * p
                   + wind.dx * wind.s * TILE * 0.34 * p * p;
          const by = sy - p * maxH;
          const r  = baseR * (1 - 0.55 * p) * (0.85 + 0.3 * j);
          const a  = fire * Math.min(1, p / 0.06 + 0.4) * (p < 0.45 ? 1 : 1 - (p - 0.45) / 0.55) * 0.9;
          if (a <= 0.01 || r <= 0.3) continue;
          ctx.globalAlpha = a;
          // Only the root is near white; the body is orange going to red.
          ctx.drawImage(_fireBillow(Math.min(1, 0.22 + p * 1.05)), bx - r, by - r * 1.3, r * 2, r * 2.6);
        }
        const rr = baseR * 1.05 * fl;
        ctx.globalAlpha = Math.min(1, fire * 0.9);
        ctx.drawImage(_fireBillow(0.18), sx - rr * 1.2, sy - rr * 1.1, rr * 2.4, rr * 1.8);
        ctx.globalCompositeOperation = 'lighter';
        const gr = TILE * 0.75 * scale * fl;
        ctx.globalAlpha = 0.55 * fire;
        ctx.drawImage(_seatGlow(), sx - gr, sy - maxH * 0.3 - gr, gr * 2, gr * 2);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // ── Embers riding the column ────────────────────────────────────
    // (Not with a crowd of fires on screen: a pixel or two each at that
    // zoom, and a path and a colour string apiece.)
    if (fire > 0.05 && detail && !crowd) {
      for (let i = 0; i < seats; i++) {
        const sx = seatX(i);
        const sy = seatY(i);
        const ph = _h01(seed + i * 53) * 10;
        const embers = q >= 0.7 ? 4 : 2;
        for (let k = 0; k < embers; k++) {
          const u = ((t * 0.5 + k * 0.25 + ph) % 1 + 1) % 1;
          const rise  = u * TILE * 2.8 * big;
          const drift = Math.sin(t * 3 + ph + k * 2) * 6 * u + (0.3 + wind.s) * u * TILE * 0.9 * wind.dx;
          const a = fire * (1 - u) * 0.9;
          if (a <= 0.02) continue;
          ctx.globalAlpha = a;
          ctx.fillStyle = `rgb(255,${Math.round(140 + 90 * (1 - u))},60)`;
          ctx.beginPath();
          ctx.arc(sx + drift, sy - rise, 1.4 * (1 - u * 0.55), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ── Residual electrical arcing across the wreck ─────────────────
    if (fire > 0.35 && Math.sin(t * 6 + e.col) > 0.86) {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = '#a0d8ff';
      ctx.lineWidth   = 1.4 / zoom;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.30, y + h * 0.25);
      ctx.lineTo(x + w * 0.50, y + h * 0.55);
      ctx.lineTo(x + w * 0.42, y + h * 0.50);
      ctx.lineTo(x + w * 0.66, y + h * 0.80);
      ctx.stroke();
    }

    // Crew progress bar across the footprint while a repair is running —
    // makes "I already paid for this one" readable without opening a panel.
    if (isRepairing(e)) {
      const p  = repairProgress(e);
      const bw = w * 0.7, bx = x + (w - bw) / 2, by = y + h * 0.52;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#1a1008';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
      ctx.fillStyle = '#e0a040';
      ctx.fillRect(bx, by, bw * p, 4);
      ctx.fillStyle = '#ffd890';
      ctx.font      = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(Math.round(p * 100) + '%', x + w / 2, by - 3);
      ctx.textAlign = 'left';
    }

    // Warning badge, top-right of the footprint — amber once a crew is on
    // site, red while the strike is still unattended. Not on a ruin: no crew
    // can fix it, and over a city levelled by a meltdown a lightning badge
    // on every wreck was both wrong and a text draw per fire per frame.
    if (e._irreparable) { ctx.restore(); return; }
    const pulse = 0.6 + 0.4 * Math.sin(t * 5);
    ctx.globalAlpha = pulse;
    ctx.fillStyle   = isRepairing(e) ? '#e0a040' : '#ff3010';
    ctx.beginPath(); ctx.arc(x + w - 6, y + 6, 6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle   = '#ffffff';
    ctx.font        = 'bold 9px monospace';
    ctx.textAlign   = 'center';
    ctx.fillText('⚡', x + w - 6, y + 9);
    ctx.textAlign   = 'left';
    ctx.restore();
  }

  // Deferred fire pass — call once after the main entity loop. Iterates the
  // small cached damaged list rather than rescanning the registry, and culls
  // to the visible tile window the caller passes in.
  // A burning span of cable: a small seated flame with a warm glow and a
  // thin thread of smoke. Deliberately much smaller than a building fire —
  // a wire fire is a bright line creeping across the map, and it has to
  // read as a thread rather than compete with the wrecks it is feeding.
  // The ground glow under burning cable, painted once at full strength.
  // Each burning span used to build its own radial gradient every frame —
  // a map-wide fire is thousands of them — and a gradient scaled by `fl`
  // with its alpha stops multiplied by `fl` is the same image as this
  // sprite drawn at scale `fl` with globalAlpha `fl`, near enough to be
  // indistinguishable.
  let _seatGlowSprite = null;
  let _sootSprite = null;
  function _sootPatch() {
    if (_sootSprite) return _sootSprite;
    const R = 48;
    const cv = document.createElement('canvas');
    cv.width = cv.height = R * 2;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(R, R, 0, R, R, R);
    gr.addColorStop(0,    'rgba(10,7,5,0.9)');
    gr.addColorStop(0.45, 'rgba(10,7,5,0.6)');
    gr.addColorStop(1,    'rgba(10,7,5,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, R * 2, R * 2);
    return (_sootSprite = cv);
  }
  function _seatGlow() {
    if (_seatGlowSprite) return _seatGlowSprite;
    const R = Math.ceil(TILE * 1.6);
    const cv = document.createElement('canvas');
    cv.width = cv.height = R * 2;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(R, R, 0, R, R, R);
    gr.addColorStop(0,   'rgba(255,186,84,0.46)');
    gr.addColorStop(0.4, 'rgba(255,110,28,0.24)');
    gr.addColorStop(1,   'rgba(190,44,8,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, R * 2, R * 2);
    return (_seatGlowSprite = cv);
  }

  // ── Billows ─────────────────────────────────────────────────────
  // Fire and smoke built the way the cooling-tower steam is
  // (CoolingTowerPlume, render_oil_nuclear.js): one pre-shaded cauliflower
  // bitmap per colour, stamped many times at different sizes, instead of a
  // gradient or a stack of flat discs per puff per frame. Overlapping
  // billows give a fireball or a smoke column a body — lobes, hot cells,
  // shaded folds — where discs gave a flat translucent smear, and a
  // screenful of fires costs drawImage calls rather than gradients.
  const BILLOW = 128;
  // The silhouette both share, the steam puff's: a soft disc with its own
  // lobes round the rim.
  function _billowShape(g) {
    const blob = (x, y, r, a) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${a})`);
      gr.addColorStop(0.55, `rgba(255,255,255,${a * 0.92})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    };
    blob(64, 66, 52, 1);
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * Math.PI * 2 + 0.4;
      blob(64 + Math.cos(a) * 30, 66 + Math.sin(a) * 28, 26 + (k % 3) * 4, 0.9);
    }
  }
  const _rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  // Flame from white-hot to dull red: each step is a billow's heart, body
  // and rim colour. _fireBillow bakes FIRE_STAGES steps along it.
  const FIRE_RAMP = [
    [[255, 252, 236], [255, 228, 146], [255, 166, 58]],
    [[255, 238, 176], [255, 184, 74],  [242, 100, 26]],
    [[255, 198, 100], [246, 126, 36],  [192, 54, 14]],
    [[228, 122, 46],  [172, 60, 20],   [94, 30, 14]],
  ];
  const FIRE_STAGES = 8;
  const _fireBillows = [];
  // T: 0 white-hot … 1 dull red.
  function _fireBillow(T) {
    const k = Math.max(0, Math.min(FIRE_STAGES - 1, Math.round(T * (FIRE_STAGES - 1))));
    if (_fireBillows[k]) return _fireBillows[k];
    const f = k / (FIRE_STAGES - 1) * (FIRE_RAMP.length - 1);
    const i0 = Math.min(FIRE_RAMP.length - 2, Math.floor(f)), w = f - i0;
    const col = j => FIRE_RAMP[i0][j].map((v, n) => Math.round(v + (FIRE_RAMP[i0 + 1][j][n] - v) * w));
    const c0 = col(0), c1 = col(1), c2 = col(2);
    const c = document.createElement('canvas');
    c.width = c.height = BILLOW;
    const g = c.getContext('2d');
    _billowShape(g);
    // Colour only where there is fire.
    g.globalCompositeOperation = 'source-atop';
    // Hot heart, cooler rim: burning gas is brightest where it is deepest.
    const body = g.createRadialGradient(62, 68, 0, 64, 66, 62);
    body.addColorStop(0, _rgba(c0, 1)); body.addColorStop(0.45, _rgba(c1, 1)); body.addColorStop(1, _rgba(c2, 1));
    g.fillStyle = body; g.fillRect(0, 0, BILLOW, BILLOW);
    // Hot cells: each lobe burns brighter at its own heart, so the body
    // boils rather than glowing evenly.
    for (let q = 0; q < 7; q++) {
      const a = q / 7 * Math.PI * 2 + 0.4;
      const x = 64 + Math.cos(a) * 24, y = 66 + Math.sin(a) * 22, r = 18 + (q % 3) * 3;
      const cell = g.createRadialGradient(x, y, 0, x, y, r);
      cell.addColorStop(0, _rgba(c0, 0.5)); cell.addColorStop(1, _rgba(c0, 0));
      g.fillStyle = cell; g.fillRect(0, 0, BILLOW, BILLOW);
    }
    // Soot in the folds along the underside.
    const sh = g.createRadialGradient(80, 98, 4, 72, 88, 64);
    sh.addColorStop(0, 'rgba(60,18,6,0.32)'); sh.addColorStop(1, 'rgba(60,18,6,0)');
    g.fillStyle = sh; g.fillRect(0, 0, BILLOW, BILLOW);
    g.globalCompositeOperation = 'source-over';
    return (_fireBillows[k] = c);
  }

  // Smoke, lit like the steam — bright at the upper left, shaded at the
  // lower right — but sooty, and lit orange on its underside by the fire
  // while it is still low over the flames. heat 0–1: how strongly underlit;
  // steam 0–1: black smoke → the white steam a doused fire gives off. Baked
  // in four steps of each. dusty: browned with earth, for the nuclear cloud
  // and its stem, which are as much ground as soot.
  const _smokeBillows = [];
  function _smokeBillow(heat, steam, dusty) {
    const hi = Math.max(0, Math.min(3, Math.round(heat * 3)));
    const si = Math.max(0, Math.min(3, Math.round(steam * 3)));
    const key = hi * 4 + si + (dusty ? 16 : 0);
    if (_smokeBillows[key]) return _smokeBillows[key];
    const h = hi / 3, s = si / 3;
    const mix = (a, b) => Math.round(a + (b - a) * s);
    const c = document.createElement('canvas');
    c.width = c.height = BILLOW;
    const g = c.getContext('2d');
    _billowShape(g);
    g.globalCompositeOperation = 'source-atop';
    const v = mix(62, 238);
    g.fillStyle = dusty ? `rgb(${Math.min(255, v + 14)},${v - 2},${Math.max(0, v - 22)})` : `rgb(${v},${v},${Math.min(255, v + 6)})`;
    g.fillRect(0, 0, BILLOW, BILLOW);
    const sh = g.createRadialGradient(84, 92, 4, 76, 84, 70);
    sh.addColorStop(0, `rgba(${mix(14, 118)},${mix(12, 128)},${mix(14, 140)},0.6)`);
    sh.addColorStop(1, `rgba(${mix(14, 150)},${mix(12, 160)},${mix(14, 170)},0)`);
    g.fillStyle = sh; g.fillRect(0, 0, BILLOW, BILLOW);
    const hl = g.createRadialGradient(46, 42, 2, 50, 46, 46);
    // Dust is matte: a bright sun-side on every billow of a cloud that size
    // turns it into a heap of balls.
    hl.addColorStop(0, `rgba(255,255,255,${((dusty ? 0.06 : 0.16) + (dusty ? 0.4 : 0.74) * s).toFixed(3)})`); hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl; g.fillRect(0, 0, BILLOW, BILLOW);
    if (h > 0) {
      const ul = g.createRadialGradient(64, 122, 4, 64, 104, 72);
      ul.addColorStop(0,   `rgba(255,136,48,${(0.75 * h).toFixed(3)})`);
      ul.addColorStop(0.5, `rgba(214,76,22,${(0.4 * h).toFixed(3)})`);
      ul.addColorStop(1,   'rgba(160,40,10,0)');
      g.fillStyle = ul; g.fillRect(0, 0, BILLOW, BILLOW);
    }
    g.globalCompositeOperation = 'source-over';
    return (_smokeBillows[key] = c);
  }

  // A cook-off: a short burst of flame at radius pr, s 0–1 through its life.
  // Two billows, not one, so it is a lumpy burst rather than a ball, over
  // a flash of its light.
  function _firePop(ctx, px, py, pr, s) {
    const fade = 1 - s;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.8 * fade;
    ctx.drawImage(_seatGlow(), px - pr * 1.6, py - pr * 1.6, pr * 3.2, pr * 3.2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.9 * fade;
    const T = Math.min(1, s * 1.2), lift = pr * 0.4 * s;
    ctx.drawImage(_fireBillow(T + 0.15), px - pr * 1.05, py - pr * 0.75 - lift, pr * 1.5, pr * 1.5);
    ctx.drawImage(_fireBillow(T), px - pr * 0.45, py - pr * 0.9 - lift * 1.3, pr * 1.3, pr * 1.3);
    ctx.globalAlpha = 1;
  }

  // The wind fire smoke leans with: the slow trend and its direction, as
  // the cooling-tower steam uses. WindState.speed carries the gusts that
  // make turbines flicker, and placing a whole column from it bobs the
  // column. One shared object, refilled per call.
  const _wind = { s: 0.3, dx: 1, dy: 0 };
  function _smokeWind() {
    if (typeof WindState === 'undefined') return _wind;
    const d = WindState.dir ?? 0;
    _wind.s = WindState.trendSpeed ?? WindState.speed ?? 0.3;
    _wind.dx = Math.cos(d); _wind.dy = Math.sin(d);
    return _wind;
  }
  let _wireGlowSprite = null;
  function _wireGlow() {
    if (_wireGlowSprite) return _wireGlowSprite;
    const R = Math.ceil(TILE * 0.62);
    const cv = document.createElement('canvas');
    cv.width = cv.height = R * 2;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(R, R, 0, R, R, R);
    gr.addColorStop(0,   'rgba(255,180,80,0.5)');
    gr.addColorStop(0.5, 'rgba(255,110,30,0.24)');
    gr.addColorStop(1,   'rgba(190,44,8,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, R * 2, R * 2);
    return (_wireGlowSprite = cv);
  }

  function _renderWireFire(ctx, w, t, lite) {
    const { x, y } = GridManager.tileToWorld(w.col, w.row);
    const cx = x + TILE / 2, cy = y + TILE / 2;
    const seed = ((w.col * 73856093) ^ (w.row * 19349663)) >>> 0;
    const ph = _h01(seed) * 10;
    // Dies down as the span burns out, so a line visibly goes quiet behind
    // the advancing front instead of the whole run blazing forever.
    const left = Math.max(0, Math.min(1, (w._wireBurnLeft ?? 0) / WIRE_BURN_SECONDS));
    const fl   = (0.7 + 0.2 * Math.sin(t * 9 + ph) + 0.1 * Math.sin(t * 15 + ph * 2))
               * (0.35 + 0.65 * left);

    ctx.save();
    // Ground glow
    const gr = TILE * 0.62 * fl;
    ctx.globalAlpha = Math.min(1, fl);
    ctx.drawImage(_wireGlow(), cx - gr, cy - gr, gr * 2, gr * 2);

    // Zoomed well out, a flame tongue is under two screen pixels and the
    // smoke thread is less — the glow alone reads identically, at a
    // fraction of the draw calls. Wide shots of a burning city are exactly
    // when there are thousands of these on screen.
    if (lite || Camera.zoom < 0.36) { ctx.restore(); ctx.globalAlpha = 1; return; }

    // A short tongue of flame, same cooling ramp as the building fires so
    // the two read as the same substance at different scales.
    const wind = (typeof WindState !== 'undefined' ? (WindState.speed || 0) : 0.3);
    const blobs = 4;
    for (let k = 0; k < blobs; k++) {
      const u  = k / (blobs - 1);
      const by = cy - u * TILE * 0.5 * fl;
      const bx = cx + wind * TILE * 0.18 * u * u + Math.sin(t * 3 + ph + u * 3) * TILE * 0.05 * u;
      const r  = TILE * 0.11 * Math.pow(1 - u * 0.95, 0.6) * (0.9 + 0.2 * Math.sin(t * 7 + ph + k));
      if (r <= 0.2) continue;
      let cr, cg, cb;
      if      (u < 0.2) { cr = 255; cg = 240; cb = 190; }
      else if (u < 0.55){ cr = 255; cg = 168; cb = 56;  }
      else              { cr = 226; cg = 72;  cb = 18;  }
      ctx.globalAlpha = fl * (0.3 + 0.5 * (1 - u));
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.beginPath(); ctx.ellipse(bx, by, r * 0.9, r * 1.2, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Thin smoke thread
    for (let k = 0; k < 3; k++) {
      const u = ((t * 0.3 + k / 3 + ph) % 1 + 1) % 1;
      const a = 0.22 * Math.min(1, u * 5) * (1 - u) * (0.4 + 0.6 * left);
      if (a <= 0.01) continue;
      const gv = Math.round(40 + u * 60);
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgb(${gv},${gv},${gv + 8})`;
      ctx.beginPath();
      ctx.arc(cx + (0.3 + wind) * u * u * TILE * 0.9, cy - u * TILE * 1.6,
              2 + u * TILE * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function renderAllFires(ctx, t, cStart, cEnd, rStart, rEnd) {
    // Burning cable is drawn first, so building flames sit over it where
    // a line runs under a wreck.
    // Visible spans first, so the detail level can be set by how much fire
    // is actually on screen: a handful of burning spans get flame tongues
    // and smoke; a whole city's wiring alight (hundreds in view — every
    // wide shot of the apocalypse) drops to the glow, where each tongue
    // would be a pixel or two anyway.
    const _vw = [];
    for (const w of _burningWires) {
      if (!w._wireOnFire) continue;
      if (w.col < cStart - 2 || w.col > cEnd + 2) continue;
      if (w.row < rStart - 3 || w.row > rEnd + 2) continue;
      _vw.push(w);
    }
    const _lite = _vw.length > 300;
    for (const w of _vw) _renderWireFire(ctx, w, t, _lite);
    if (_damaged.length === 0) return;
    // A single wreck is the common case and gets everything; a map-wide
    // disaster trades flame fidelity for frame time. Counting the visible
    // subset first costs one cheap pass and keeps the budget bounded.
    let visible = 0;
    for (const e of _damaged) {
      if (!e._lightningDamaged) continue;
      if (e.col + (e.width || 1) < cStart - 2 || e.col > cEnd + 2) continue;
      if (e.row + (e.height || 1) < rStart - 10 || e.row > rEnd + 2) continue;
      visible++;
    }
    let q = visible <= 3 ? 1 : visible <= 8 ? 0.7 : 0.45;
    // Zoomed right out over a burning city, each fire is a few screen pixels
    // across: shed flame detail, keep the glow. Invisible at that size, and
    // it's the single most expensive thing in a wide shot of the apocalypse.
    if (visible > 60 || (Camera.zoom < 0.36 && visible > 8)) q = 0.25;

    for (const e of _damaged) {
      if (!e._lightningDamaged) continue;
      if (GridManager.getEntity(e.col, e.row) !== e) continue;
      const ew = e.width || 1, eh = e.height || 1;
      // Generous vertical margin: the smoke column reaches ~5 tiles above
      // the footprint (~9 over a blaze), so a fire just off the top of the
      // view still needs drawing or its plume pops in at the screen edge.
      if (e.col + ew < cStart - 2 || e.col > cEnd + 2) continue;
      if (e.row + eh < rStart - 10 || e.row > rEnd + 2) continue;
      const { x, y } = GridManager.tileToWorld(e.col, e.row);
      renderDamage(ctx, e, x, y, t, q);
    }
  }

  // ── Save / load ──────────────────────────────────────────────────
  function getState() {
    return { seenRainstorm: _seenRainstorm, totalStrikes: _totalStrikes,
             totalDamaged: _totalDamaged,
             totalExplosions: _totalExplosions, totalBurned: _totalBurned,
             totalGenExplosions: _totalGenExplosions,
             strikeAfterMk2: _strikeAfterMk2, strikeAfterMk3: _strikeAfterMk3,
             // A scar from a blast on a job site belongs to the site, not to the
             // player's map (see clearSiteBlasts), so it is never written.
             scars: _scars.filter(s => !s.site).map(s => ({ wx: s.wx, wy: s.wy, R: s.R, seed: s.seed })),
             zones: _zones.filter(z => !z.site).map(z => ({ col: z.col, row: z.row, w: z.w, h: z.h, rIn: z.rIn, rOut: z.rOut, t0: z.t0 })) };
  }
  function loadState(s) {
    if (!s) return;
    _seenRainstorm  = !!s.seenRainstorm;
    _strikeAfterMk2 = !!s.strikeAfterMk2;
    _strikeAfterMk3 = !!s.strikeAfterMk3;
    _totalStrikes  = s.totalStrikes || 0;
    _totalDamaged  = s.totalDamaged || 0;
    _totalExplosions = s.totalExplosions || 0;
    _totalBurned     = s.totalBurned || 0;
    _totalGenExplosions = s.totalGenExplosions || 0;
    _notifActive   = false;
    _strikeCards.clear();
    // Nothing mid-flight survives a load: a fuse lit before the save would
    // otherwise go off the instant the world came back, with no warning and
    // no chance to react.
    _fuses.length  = 0;
    _blasts.length = 0;
    _nukes.length  = 0;
    _scars.length   = 0;
    for (const sc of s.scars || []) _scars.push({ wx: sc.wx, wy: sc.wy, R: sc.R, seed: sc.seed });
    _zones.length = 0;
    for (const z of s.zones || []) _zones.push({ ...z, lastLevel: _innerLevel(z) });
  }

  return {
    tick, renderStrikes, renderDamage, renderAllFires, isIrreparable, renderScars,
    renderRuin, wreckClearCost,
    contaminationAt, checkPlacement, getContaminationZones, falloutLevel, falloutZoneCount,
    getDamaged: () => _damaged,
    rollStrike, repair, repairCost, edgeDist: _edgeDist, isDamaged, isFireOut, isStrikeable, isStorage,
    countDamaged, rodsCovering, protectionAt, getStrikeChance,
    repairSeconds, isRepairing, repairProgress,
    repairNearby, nearbyDamaged, nearbyRepairCost,
    REPAIR_ALL_RADIUS,
    surgeWatts, getTotalSurge, attachRepairUI,
    hasSeenRainstorm: () => _seenRainstorm,
    hasStrikeAfterMk2: () => _strikeAfterMk2,
    hasStrikeAfterMk3: () => _strikeAfterMk3,
    isRod, allRods,
    isExplosive: _isExplosive, isArmed: _isArmed, blastRadius, devStrike, volatileOf, isVolatile, hazardOf,
    isGeneratorBomb, detonateGenerator, detonateNuclear, clearSiteBlasts, NUKE_RADIUS, nukeRadiusFor, quenchDischarge,
    // ── Used by ApocalypseSystem ──────────────────────────────────
    // The map-wide Advanced Reactor detonation kills buildings one at a
    // time over a minute of screen time, so it needs the single-building
    // kill on its own rather than as part of a radius sweep.
    annihilate(e, blastAngle) {
      if (!e || e._irreparable) return false;
      if (_damage(e, { silent: true, cause: 'blast', origin: 'meltdown', noNotify: true })) _damaged.push(e);
      else if (e._fireCause !== 'blast') e._fireCause = 'blast';
      _markRebuild(e, REBUILD_MAX);
      _makeIrreparable(e);
      if (blastAngle !== undefined) e._blastDir = blastAngle;
      e._detonated = true;
      return true;
    },
    wreckRoad,
    renderRoadWreck,
    // A ruin with no fire: the pipe and belt tiles the front passes.
    // Drawn as rubble (renderRuin) without embers, and never on the fire
    // list, so a whole city's line stack costs one bitmap per tile.
    scorch(e, blastAngle) {
      if (!e || e._irreparable) return false;
      _makeIrreparable(e);
      e._scorched = true;
      e._detonated = true;
      if (blastAngle !== undefined) e._blastDir = blastAngle;
      return true;
    },
    // Scrub the pipe/wire/belt stack as the shock front passes over it.
    clearLinesAround: (src, rTiles) => _clearLinear(src, rTiles),
    // Contamination the apocalypse leaves behind, so the ruined map obeys
    // the same build rules a normal blast zone does.
    addFalloutZone: (src, rIn, rOut) => _addZone(src, rIn, rOut),
    // The mushroom/ember/scar visual, without the canned SFX volley — the
    // apocalypse scores its own audio.
    spawnBlastVisual: (wx, wy, rTiles, quiet) => _spawnNukeVisual(wx, wy, rTiles, quiet),
    // Set a wire burning for the apocalypse — the fire only. _igniteWire
    // also marks the span as failed cable, which draws the red wire-FAULT
    // markers along it; on a map that is ending that just reads as a grid
    // outage, when the picture wanted is the city's wiring on fire.
    igniteWire(w) {
      if (!isWire(w) || w._wireOnFire || w._lightningDamaged) return false;
      w._wireOnFire   = true;
      w._wireFireT    = 0;
      w._wireBurnLeft = WIRE_BURN_SECONDS;
      _burningWires.push(w);
      return true;
    },
    // Rebuild the fire lists renderAllFires draws from. Normally tick() does
    // this, but tick() rides the weather tick, which the frozen simulation
    // skips for the whole apocalypse. Called ONCE at detonation; after that
    // annihilate() and igniteWire() add to the lists directly, which saves a
    // 30,000-entity walk four times a second.
    prebakeRuin,
    refreshFireLists() {
      _damaged = []; _burningWires = [];
      for (const e of EntityRegistry.active()) {
        if (e._wireOnFire) _burningWires.push(e);
        if (e._lightningDamaged) _damaged.push(e);
      }
    },
    getTotalGenExplosions: () => _totalGenExplosions,
    genBurnLeft,
    isWire, isFlammable, isWireOnFire, clearWireFire,
    getBurningWires: () => _burningWires,
    // Everything on the fire list, for the apocalypse to put out as the
    // player walks the ashes (the sim, which normally burns fires down, is frozen).
    getDamaged: () => _damaged,
    SMOULDER_FADE,
    getTotalStrikes: () => _totalStrikes,
    getTotalExplosions: () => _totalExplosions,
    getTotalBurned: () => _totalBurned,
    getState, loadState,
    // The fire and smoke sprites, for other explosions to draw with
    // (ApocalypseSystem's cook-offs) so every blast in the game reads as
    // the same fire.
    fireBillow: _fireBillow, smokeBillow: _smokeBillow, fireGlow: _seatGlow, firePop: _firePop,
  };
})();
