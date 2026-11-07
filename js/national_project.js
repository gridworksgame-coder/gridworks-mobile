/* ═══════════════════════════════════════════════════════════════════
   OPERATION HYPERION — THE NATIONAL GRID
   The end of the game. The National Government commissions the player's
   company to build Hyperion Station, tie the nation's grid to theirs and
   power the country. The Advanced Reactor's apocalypse is the run ending
   in fire; this is the run ending in light.

   ── The road there (phase) ───────────────────────────────────────
     dormant     nothing yet.
     classified  the National Government Center exists (MK4). A sealed
                 file opens, a site is fenced off in the National Zone and
                 a hologram marks it (renderWorld). The HYPERION button
                 appears in the top bar with everything redacted.
     briefed     fusion achieved (FusionResearch). The Minister of Energy's
                 letter lays out the whole project; the dossier un-redacts.
     ignition    IGNITION — the first Fusion Reactor completes its startup
                 surge, so Hyperion Station breaks ground (GovernmentSystem
                 NATIONAL spawns it). Burn S0_DT pellets in Fusion Reactors
                 while the site is powered; the base and cranes go up.
     ignited     Ignition done, waiting on the MHD Ring: Foundations is
                 shown as the active stage, but nothing counts yet.
     stage1      FOUNDATIONS — the MHD Ring is unlocked (with the Advanced
                 Fusion Reactor). Commit the funding and burn D-He3 pellets
                 in an Advanced Fusion Reactor; the station rises as it goes.
     stage2      FIRST LIGHT — commissioning. Every in-game hour the station
                 pulls a SURGE_KW surge (the first SURGE_FRAC of the hour).
                 SURGES_NEEDED surges that stay powered the whole way.
     stage3      THE LINE — the nation's grid is tied in: the station draws
                 EXPORT_KW around the clock, and pays for it. Hold it for
                 S3_HOURS powered in-game hours. Every outage costs
                 OUTAGE_COST_HOURS of progress.
     stage4      HYPERION — the final day: FINAL_EXPORT_KW, no coal or oil
                 generation anywhere on the map, City Score at MIN_SCORE or
                 better and RENEWABLE_INVEST of wind, solar and hydro standing,
                 held for S4_HOURS.
     victory     the cinematic: interconnect countdown, then a wave of light
                 rolls out from the station and lights every building on
                 the map, then GRID COMPLETE.
     complete    free play. The station keeps exporting (and paying) unless
                 the player switches the export off in the dossier.

   The phase names stage1..stage4 predate Ignition, so they are Stages II-V
   on screen (STAGES[] holds the codes). Every stage completion plays a ceremony (banner, reward, camera) and
   every stage has a tutorial card (TutorialSystem).
   ═══════════════════════════════════════════════════════════════════ */

const NationalProject = (() => {
  // ── Tuning ──────────────────────────────────────────────────────
  const FUNDING          = 2500000;
  // D-He3 pellets burned in Advanced Fusion Reactors during stage 1: proof
  // the endgame complex is lit (~33 min of one reactor at full burn, 0.5/s). This
  // was 400 pellets in Fusion Reactors plus 600 helium-3 separated, from when
  // the old reactor ran D-He3 and stage 1 opened with the separator.
  const S1_DHE3          = 1000;
  // Pellets burned in Fusion Reactors during Ignition: proof the reactor
  // holds a burning plasma, not just lights once (~17 min of one at full burn, 0.5/s).
  const S0_DT            = 500;
  const SURGE_KW         = 10000;
  const SURGE_FRAC       = 0.15;      // of each in-game hour
  const SURGES_NEEDED    = 24;
  const EXPORT_KW        = 20000;
  const FINAL_EXPORT_KW  = 30000;
  const S3_HOURS         = 48;
  const S4_HOURS         = 24;
  const OUTAGE_COST_HOURS = 1;
  const MIN_SCORE        = 70;
  const FOSSIL           = [T.COALGENERATOR, T.FUELGEN];
  // Stage V's clean-energy commitment: what the wind, solar and hydro standing on
  // the map cost to build, held through the final day. Measured on what is
  // standing (each piece's _paid, or its list price), not a running total
  // spent, so building and demolishing for the refund doesn't count.
  const RENEWABLE_INVEST = 5000000;
  const RENEWABLE        = [T.SOLAR, T.SOLAR2, T.SOLAR3, T.WIND, T.WIND2, T.WIND3,
                            T.DAM, T.HYDROTURBINE, T.HYDROGENERATOR].filter(Boolean);
  const BUILD_KW         = 500;       // construction lighting and cranes
  const IDLE_KW          = 700;       // stage 2 between surges
  // While the export is flowing the nation pays a multiple of the city's own
  // NET income, after every deduction (Economy.netExMeridian: the HUD's net
  // figure with this pay taken out, so it can't feed on itself): 5× for
  // Stage III's 20 MW, 7.5× for Stage IV's 30 MW, i.e. the multiple scales
  // with the load. A city earning 2,000/s and netting 400/s is paid 2,000/s
  // in Stage III; one running at a loss is paid nothing. It was a flat $250/s
  // per MW ($5,000/s for 20 MW), whatever the city made.
  const EXPORT_MULT_PER_MW = 0.25;
  const exportMult = (kw) => kw / 1000 * EXPORT_MULT_PER_MW;
  const exportPay  = (kw) => exportMult(kw) * (typeof Economy !== 'undefined' ? Economy.netExMeridian || 0 : 0);
  const _multText  = (kw) => `${exportMult(kw).toFixed(1).replace(/\.0$/, '')}× your net income`;
  const STAGE_REWARD     = [300000, 500000, 750000, 1000000, 2500000];
  const VICTORY_SONG     = 'audio/music/Rope to the Sky.mp3';

  const PH = ['dormant', 'classified', 'briefed', 'ignition', 'ignited', 'stage1', 'stage2', 'stage3', 'stage4', 'victory', 'complete'];
  const STAGES = [
    { code: 'I',   name: 'IGNITION',    tag: 'Prove a sustained burn' },
    { code: 'II',  name: 'FOUNDATIONS', tag: 'Raise Hyperion Station' },
    { code: 'III', name: 'FIRST LIGHT', tag: 'Commission the converters' },
    { code: 'IV',  name: 'THE LINE',    tag: 'Tie in the national grid' },
    { code: 'V',   name: 'HYPERION',    tag: 'Power the nation for a day' },
  ];
  const STAGE_PH = ['ignition', 'stage1', 'stage2', 'stage3', 'stage4'];   // STAGES[i]'s phase

  // ── Saved state ─────────────────────────────────────────────────
  let phase     = 'dormant';
  let funded    = false;
  let base      = { dhe3: 0, dt: 0 };       // cumulative D-He3 / Fusion Reactor pellets burned when their stage began
  let surges    = 0;
  let heldSec   = 0;                        // stage 3 / 4 progress, powered seconds
  let exported  = 0;                        // MWh sent to the nation, all time
  let exportOn  = true;                     // free play: the player can stop exporting
  let doneDay   = 0;
  let seenStage = -1;                       // last stage the player opened the dossier on
  // Stages III and IV open on standby: the line is only tied in (the station
  // draws its export, progress counts, outages cost) once the player presses
  // INITIATE in the dossier, so a grid that can't carry it yet isn't thrown
  // straight into blackouts. Saves from before this were already live.
  let lineLive  = true;

  // ── Not saved ───────────────────────────────────────────────────
  let doneSlot = -1, pend = null, prevPowered = null, lastFx = null, lastFail = false;
  let seenDhe3 = null;                      // stage 1: the D-He3 burn count as of last tick
  let seenDt   = null;                      // ignition: the Fusion Reactor burn count as of last tick
  const _fx = (kind, extra) => { lastFx = { kind, at: performance.now() / 1000, ...extra }; };

  const pi       = p => PH.indexOf(p);
  const at       = p => pi(phase) >= pi(p);
  const hourLen  = () => DayNight.secondsPerGameHour();
  const station  = () => { for (const e of EntityRegistry.getByType(T.NATIONALGRID)) return e; return null; };
  // Nothing gets built on a dark site: stage 1's funding and its pellet
  // count both wait for the station's construction power (BUILD_KW).
  const _sitePowered = () => { const e = station(); return !!(e && e.powered); };
  // Index into STAGES: 0 Ignition ... 4 Hyperion, 5 = done, -1 = not started.
  const stageIdx = () => ({ ignition: 0, ignited: 1, stage1: 1, stage2: 2, stage3: 3, stage4: 4 })[phase] ?? (at('victory') ? 5 : -1);
  const _dhe3    = () => typeof AdvancedFusionReactorSystem !== 'undefined' ? AdvancedFusionReactorSystem.getTotalPelletsBurned() : 0;
  const _s1Burned = () => Math.max(0, _dhe3() - (base.dhe3 || 0));
  const _dtBurned = () => typeof HulkingFusionReactorSystem !== 'undefined' ? HulkingFusionReactorSystem.getTotalPelletsBurned() : 0;
  const _s0Burned = () => Math.max(0, _dtBurned() - (base.dt || 0));
  const _reactorLit = () => { for (const r of EntityRegistry.getByType(T.HULKINGFUSIONREACTOR)) if (r._started) return true; return false; };
  const _fossilCount = () => FOSSIL.reduce((n, t) => n + EntityRegistry.getByType(t).size, 0);
  const _renewInvested = () => {
    let v = 0;
    for (const t of RENEWABLE) for (const e of EntityRegistry.getByType(t)) {
      if (e._constructing || e._clientOwned) continue;
      v += e._paid !== undefined ? e._paid : (EntityDefs[t]?.cost || 0);
    }
    return v;
  };
  const _score   = () => typeof CityScore !== 'undefined' ? CityScore.score : 0;
  const _city    = () => typeof CityInfo !== 'undefined' ? CityInfo.getCityName() : 'your city';
  const _co      = () => typeof CityInfo !== 'undefined' ? CityInfo.getCompanyName() : 'your company';
  const _money   = n => typeof formatMoney === 'function' ? formatMoney(n) : '$' + Math.round(n).toLocaleString();
  const _mw      = kw => `${(kw / 1000).toFixed(kw % 1000 ? 1 : 0)} MW`;

  // The station's surge schedule — shared by its power draw and its sprite.
  function surge(hour) {
    const ph = hour % 1;
    return { ph, firing: phase === 'stage2' && ph < SURGE_FRAC, spinUp: phase === 'stage2' && ph > 0.85 };
  }

  // What the station draws right now (DemandCurves).
  function demandKW(hour) {
    switch (phase) {
      case 'ignition': case 'ignited':
      case 'stage1':  return BUILD_KW;
      case 'stage2':  return surge(hour).firing ? SURGE_KW : IDLE_KW;
      case 'stage3':  return lineLive ? EXPORT_KW : IDLE_KW;
      case 'stage4':  return lineLive ? FINAL_EXPORT_KW : IDLE_KW;
      case 'victory': return FINAL_EXPORT_KW;
      case 'complete': return exportOn ? EXPORT_KW : BUILD_KW;
      default:        return BUILD_KW;
    }
  }
  const standby = () => (phase === 'stage3' || phase === 'stage4') && !lineLive;
  const isExporting = () => (['stage3', 'stage4', 'victory'].includes(phase) && !standby()) || (phase === 'complete' && exportOn);
  // Read by the Economy through the station def's income getter.
  // Economy scales every building's pay by the difficulty's income multiple,
  // and netExMeridian has already been through it: divide it back out so the
  // station lands on exactly the multiple of the net figure the HUD shows.
  function incomeNow() {
    const e = station();
    if (!(e && e.powered && isExporting())) return 0;
    const m = typeof Difficulty !== 'undefined' ? Difficulty.incomeMult() || 1 : 1;
    return exportPay(demandKW(DayNight.hour())) / m;
  }

  // ── Per-tick ─────────────────────────────────────────────────────
  function tick(dt) {
    if (phase === 'victory' || _sceneBusy()) return;
    if (phase === 'dormant' && EntityRegistry.getByType(T.NATIONALGOV).size > 0) _classify();
    if (phase === 'classified' && typeof FusionResearch !== 'undefined' && FusionResearch.isComplete() && !FusionResearch.isActive()) _openBriefing();
    if (phase === 'briefed' && (_reactorLit() || Progression.isUnlocked(T.MHDRING))) _beginIgnition();
    if (phase === 'ignited' && Progression.isUnlocked(T.MHDRING)) _beginStage1();

    const e = station();
    _updateButton();
    if (!e) return;

    if (e.powered && isExporting()) exported += demandKW(DayNight.hour()) / 1000 * dt / hourLen();

    if (phase === 'stage2' || _SV.spin || _SV.buzz) {
      try { _surgeSound(e, phase === 'stage2' ? dt : 0); } catch (_e) {}
    }
    if (phase !== 'stage1') seenDhe3 = null;
    if (phase !== 'ignition') seenDt = null;
    if (phase === 'ignition') {
      // Same rule as stage 1: pellets burned while the site is dark don't count.
      const now = _dtBurned();
      if (seenDt !== null && !e.powered) base.dt = (base.dt || 0) + Math.max(0, now - seenDt);
      seenDt = now;
      if (e.powered && _s0Burned() >= S0_DT) _completeStage(0);
    } else if (phase === 'stage1') {
      // Pellets only count toward the build while the site has power: any
      // burned while it's dark are folded into the baseline instead.
      const now = _dhe3();
      if (seenDhe3 !== null && !e.powered) base.dhe3 = (base.dhe3 || 0) + Math.max(0, now - seenDhe3);
      seenDhe3 = now;
      if (funded && e.powered && _s1Burned() >= S1_DHE3) _completeStage(1);
    } else if (phase === 'stage2') {
      _tickSurges(e);
    } else if (standby()) {
      // Waiting on the player's go: no progress, no outage penalty.
    } else if (phase === 'stage3' || phase === 'stage4') {
      const final = phase === 'stage4';
      // Losing the line costs progress, once per outage.
      if (prevPowered === true && !e.powered) {
        heldSec = Math.max(0, heldSec - OUTAGE_COST_HOURS * hourLen());
        _fx('outage');
        NotificationStack.push({
          icon: '◈', title: 'National line dropped',
          message: `Hyperion Station lost power and the nation's grid tripped off the line: ${OUTAGE_COST_HOURS} hour${OUTAGE_COST_HOURS === 1 ? '' : 's'} of progress lost. Restore it.`,
          color: '#ff7050', border: '#602818', tag: 'meridian-outage', onClick: () => _jump(e),
        });
      }
      if (e.powered) NotificationStack.dismissTag?.('meridian-outage');
      if (e.powered && (!final || _finalChecks().every(c => c.ok))) heldSec += dt;
      if (heldSec >= (final ? S4_HOURS : S3_HOURS) * hourLen()) _completeStage(final ? 4 : 3);
    }
    prevPowered = e.powered;
  }

  function _tickSurges(e) {
    const t = DayNight.getElapsed(), slot = Math.floor(t / hourLen()), ph = t / hourLen() - slot;
    // First tick (or the clock jumped): only a surge still firing now can count —
    // one whose window already closed before we were watching never happened.
    if (doneSlot < 0 || slot < doneSlot || slot - doneSlot > 24) doneSlot = ph < SURGE_FRAC ? slot - 1 : slot;
    for (let s = doneSlot + 1; s <= slot; s++) {
      if (s === slot && ph < SURGE_FRAC) break;
      const ok = pend && pend.slot === s ? pend.ok : e.powered;
      doneSlot = s;
      if (ok) {
        surges++; lastFail = false; _fx('surge', { n: surges });
        try { _surgeEndSound(e, true); } catch (_e) {}
        NotificationStack.dismissTag?.('meridian-surge-fail');
        if (surges >= SURGES_NEEDED) { _completeStage(2); return; }
      } else {
        lastFail = true; _fx('abort');
        try { _surgeEndSound(e, false); } catch (_e) {}
        const msg = `A ${_mw(SURGE_KW)} commissioning surge at Hyperion Station browned out and was aborted. It needs the full ${_mw(SURGE_KW)} for the whole surge.`;
        if (!NotificationStack.updateTag('meridian-surge-fail', { message: msg }))
          NotificationStack.push({ icon: '◈', title: 'Commissioning surge aborted', message: msg, color: '#ff9060', border: '#603020', tag: 'meridian-surge-fail', onClick: () => _jump(e) });
      }
    }
    if (ph < SURGE_FRAC) {
      if (!pend || pend.slot !== slot) pend = { slot, ok: true };
      pend.ok = pend.ok && e.powered;
    }
  }

  function _renewCheck() {
    const v = _renewInvested();
    return { label: `${_money(RENEWABLE_INVEST)} invested in wind, solar & hydro`, ok: v >= RENEWABLE_INVEST,
             detail: `${_money(Math.floor(v))} / ${_money(RENEWABLE_INVEST)}` };
  }
  function _finalChecks() {
    const e = station();
    const fossil = _fossilCount();
    return [
      { label: `Export ${_mw(FINAL_EXPORT_KW)} to the nation`, ok: !!(e && e.powered), detail: e && e.powered ? 'flowing' : 'line down' },
      { label: 'No coal or oil generators on the map', ok: fossil === 0, detail: fossil ? `${fossil} still standing` : 'clean' },
      { label: `City Score ${MIN_SCORE} or better`, ok: _score() >= MIN_SCORE, detail: `${_score()}` },
      _renewCheck(),
    ];
  }

  // ── Phase changes ───────────────────────────────────────────────
  function _classify() {
    phase = 'classified';
    try { GovernmentSystem.reserveNationalSlot?.(T.NATIONALGRID); } catch (_e) {}
    NotificationStack.push({
      icon: '◈', title: 'CLASSIFIED',
      message: `The Ministry of Energy has opened a sealed file on ${_co()}. A site in the National Government Zone has been fenced off under guard. Nobody is saying what it is for. Click to see the site.`,
      color: '#7ad8ff', border: '#1a4a66', tag: 'meridian-classified', glow: true,
      onClick: () => { _jumpSite(); SFX.click(); },
    });
    _alert();
  }

  function _openBriefing() {
    if (document.getElementById('np-brief')) return;
    const prevSpeed = DevMode.timeScale;
    DevMode.setTimeScale(0);
    const root = document.createElement('div');
    root.id = 'np-brief';
    root.innerHTML = `
      <div class="np-letter">
        <div class="np-seal">◈</div>
        <div class="np-from">OFFICE OF THE MINISTER OF ENERGY · EYES ONLY</div>
        <div class="np-to">To the board of ${_esc(_co())}, ${_esc(_city())}</div>
        <p>Your fusion programme has done what our national laboratories could not. The cabinet has met, and the decision is unanimous.</p>
        <p>We are commissioning <b>${_esc(_co())}</b> to build <b>Hyperion Station</b>: the interconnector that will tie this nation's failing grid to yours. When it is finished, ${_esc(_city())} will power the country.</p>
        <div class="np-stages">
          ${STAGES.map(s => `<div class="np-stage-line"><span class="np-code">${s.code}</span><b>${s.name}</b><i>${s.tag}</i></div>`).join('')}
        </div>
        <p>Ground will be broken the day your first Fusion Reactor ignites. After that, the nation is in your hands.</p>
        <div class="np-sign">— The Minister of Energy</div>
        <button class="np-accept">ACCEPT THE COMMISSION</button>
      </div>`;
    document.body.appendChild(root);
    try { SFX.unlock?.(); } catch (_e) {}
    root.querySelector('.np-accept').addEventListener('click', () => {
      root.classList.add('out');
      setTimeout(() => root.remove(), 500);
      DevMode.setTimeScale(prevSpeed || 1);
      phase = 'briefed';
      NotificationStack.dismissTag?.('meridian-classified');
      NotificationStack.push({
        icon: '◈', title: 'Operation Hyperion accepted',
        message: 'The dossier is open. Ignite your first Fusion Reactor and Hyperion Station breaks ground. Click HYPERION in the top bar to read it.',
        color: '#7ad8ff', border: '#1a4a66', tag: 'meridian-briefed', onClick: () => openDossier(),
      });
      _alert();
      SFX.click?.();
    });
  }

  function _beginIgnition() {
    phase = 'ignition';
    base = { ...base, dt: _dtBurned() };
    _alert();
    // GovernmentSystem spawns the station itself once stationDue() says so.
    NotificationStack.dismissTag?.('meridian-stage');
    NotificationStack.push({
      icon: '◈', title: 'HYPERION: STAGE I: IGNITION',
      message: `Your Fusion Reactor is burning, and the Ministry has broken ground on Hyperion Station. Power the site (${_mw(BUILD_KW)}) and burn ${S0_DT} pellets in Fusion Reactors to prove the burn holds. Click to open the dossier.`,
      color: '#7ad8ff', border: '#1a4a66', tag: 'meridian-stage', glow: true, onClick: () => openDossier(),
    });
    // Take the player to the site once the reactor's ignition flash
    // (FUSION_IGNITE_SECS) has played, so they see both.
    setTimeout(() => { if (phase !== 'ignition') return; const e = station(); if (e) _jump(e); else _jumpSite(); }, 4500);
  }

  function _beginStage1() {
    phase = 'stage1';
    base = { ...base, dhe3: _dhe3() };
    funded = false;
    _alert();
    NotificationStack.dismissTag?.('meridian-stage');
    NotificationStack.push({
      icon: '◈', title: 'HYPERION: STAGE II: FOUNDATIONS',
      message: `The MHD Decelerator Ring is ready, and the station can rise. Commit the ${_money(FUNDING)} funding and burn ${S1_DHE3} D-He3 pellets in an Advanced Fusion Reactor. Click to open the dossier.`,
      color: '#7ad8ff', border: '#1a4a66', tag: 'meridian-stage', glow: true, onClick: () => openDossier(),
    });
  }

  // Stages III-V (First Light on); Ignition and Foundations open through
  // _beginIgnition / _beginStage1.
  function _startStage(i) {
    phase = STAGE_PH[i];
    heldSec = 0; surges = 0; doneSlot = -1; pend = null; prevPowered = null; lastFail = false;
    lineLive = i < 3;                          // IV and V wait for the player's go
    _alert();
    const e = station();
    const ready = kw => `Hyperion Station is standing by. When your grid has ${_mw(kw)} to spare, even at its evening peak, press INITIATE in the dossier`;
    const msg = [
      null, null,
      `Every hour, Hyperion Station fires a ${_mw(SURGE_KW)} commissioning surge. ${SURGES_NEEDED} surges that stay powered the whole way bring the converters online.`,
      `${ready(EXPORT_KW)} to tie in the nation's grid: the station then draws ${_mw(EXPORT_KW)} around the clock and pays ${_multText(EXPORT_KW)} for it (${_money(exportPay(EXPORT_KW))}/s now). Keep the line up for ${S3_HOURS / 24} days. Every outage costs an hour.`,
      `${ready(FINAL_EXPORT_KW)} for the final day: export ${_mw(FINAL_EXPORT_KW)} for ${S4_HOURS} hours, paid ${_multText(FINAL_EXPORT_KW)} (${_money(exportPay(FINAL_EXPORT_KW))}/s now), with no coal or oil generators anywhere on the map, a City Score of ${MIN_SCORE}+ and ${_money(RENEWABLE_INVEST)} of wind, solar and hydro standing.`,
    ][i];
    NotificationStack.dismissTag?.('meridian-stage');
    NotificationStack.push({
      icon: '◈', title: `HYPERION: STAGE ${STAGES[i].code}: ${STAGES[i].name}`, message: msg + ' Click to open the dossier.',
      color: i === 4 ? '#ffd070' : '#7ad8ff', border: i === 4 ? '#6a4a10' : '#1a4a66', tag: 'meridian-stage', glow: true,
      onClick: () => { if (e) _jump(e); openDossier(); },
    });
  }

  function _completeStage(i) {
    const e = station();
    const reward = STAGE_REWARD[i];
    Economy.spend(-reward);
    if (typeof GovernmentSystem !== 'undefined' && GovernmentSystem.adjustApproval) GovernmentSystem.adjustApproval(10);
    _fx('stage', { i });
    // IV and V are marked by the draw (_sceneStart, keyed by the old stage
    // numbers 2 and 3): the banner, or the victory sequence, follows it.
    // Stage V opens straight away, so the state is right whatever happens to the scene.
    if (i >= 3) {
      if (i < 4) _startStage(i + 1);
      _sceneStart(i - 1, () => { if (i < 4) _ceremony(i, reward); else _startVictory(); });
      return;
    }
    _ceremony(i, reward);
    if (i === 0) {
      // Foundations needs the MHD Ring; until it's unlocked the project waits.
      if (Progression.isUnlocked(T.MHDRING)) _beginStage1();
      else {
        phase = 'ignited';
        NotificationStack.dismissTag?.('meridian-stage');
        NotificationStack.push({
          icon: '◈', title: 'HYPERION: IGNITION PROVEN',
          message: 'The base of Hyperion Station is down. Construction resumes when you unlock the MHD Decelerator Ring. Click to open the dossier.',
          color: '#7ad8ff', border: '#1a4a66', tag: 'meridian-stage', onClick: () => openDossier(),
        });
      }
    } else _startStage(i + 1);
    if (e) _jump(e);
  }

  // ── Ceremonies ──────────────────────────────────────────────────
  const CEREMONY = [
    { big: 'THE BURN HOLDS',            sub: "Your reactor has sustained fusion, and the station's base is poured. Next: raise the station." },
    { big: 'HYPERION STATION STANDS',   sub: 'The foundations are poured and the halls are raised. Next: bring the converters to life.' },
    { big: 'FIRST LIGHT',               sub: 'The converters are online. The nation is waiting on the other end of the line.' },
    { big: 'THE NATION IS CONNECTED',   sub: 'Two days on the line without failing. One day remains.' },
    { big: 'HYPERION IS COMPLETE',      sub: '' },
  ];
  function _ceremony(i, reward) {
    const old = document.getElementById('np-banner'); if (old) old.remove();
    if (i === 4) return;   // the victory sequence is its own ceremony
    const b = document.createElement('div');
    b.id = 'np-banner';
    b.innerHTML = `
      <div class="npb-eyebrow">OPERATION HYPERION · STAGE ${STAGES[i].code} COMPLETE</div>
      <div class="npb-big">${CEREMONY[i].big}</div>
      <div class="npb-sub">${CEREMONY[i].sub}</div>
      <div class="npb-reward">+${_money(reward)} from the Treasury · +10% approval</div>
      <div class="npb-bar">${STAGES.map((s, k) => `<span class="${k <= i ? 'on' : ''}">${s.code}</span>`).join('<i></i>')}</div>
      <div class="npb-hint">CLICK TO CONTINUE</div>`;
    document.body.appendChild(b);
    // Stays up until the player clicks it away, so it can be read in full.
    b.addEventListener('click', () => {
      if (b.classList.contains('out')) return;
      b.classList.add('out');
      setTimeout(() => b.remove(), 800);
      try { SFX.click?.(); } catch (_e) {}
    });
    try { SFX.unlock?.(); SFX.goodConnect?.(0.3); } catch (_e) {}
    try { Camera.shake?.(14); } catch (_e) {}
  }

  // ── Queries ─────────────────────────────────────────────────────
  function stationDue() { return at('ignition'); }

  // Overall progress 0–1 across the five stages (for the button and card).
  function stageProgress() {
    switch (phase) {
      case 'ignition': return Math.min(1, _s0Burned() / S0_DT);
      case 'ignited':  return 0;
      case 'stage1': {
        const f = funded ? 1 : 0;
        const p = Math.min(1, _s1Burned() / S1_DHE3);
        return (f + p) / 2;
      }
      case 'stage2': return Math.min(1, surges / SURGES_NEEDED);
      case 'stage3': return Math.min(1, heldSec / (S3_HOURS * hourLen()));
      case 'stage4': return Math.min(1, heldSec / (S4_HOURS * hourLen()));
      default: return at('victory') ? 1 : 0;
    }
  }
  function overall() {
    const i = stageIdx();
    if (i < 0) return 0;
    if (i >= STAGES.length) return 1;
    return (i + stageProgress()) / STAGES.length;
  }

  // ── The export switching on and off ─────────────────────────────
  // Starting or stopping the export used to be a hard cut: the lines and the
  // Spire were simply lit one frame and dark the next. Instead the station
  // runs `_xk` from 0 to 1 over X_UP seconds (power going out along the
  // lines, the core spooling up) or back over X_DOWN (draining back in,
  // sputtering out), on the real clock so it plays out even while paused.
  // `_xEdge` is the moment it last changed, for the one-off effects (the
  // shockwave off the Spire, the sputter) and the sounds.
  const X_UP = 3.5, X_DOWN = 2.6;
  let _xk = null, _xOn = false, _xLast = 0, _xEdge = null;
  function _xUpdate() {
    const now = performance.now() / 1000;
    const e = station(), on = !!(e && e.powered && isExporting() && stageIdx() >= 3);
    if (_xk === null) { _xk = on ? 1 : 0; _xOn = on; _xLast = now; return; }   // a load: no transition
    const dt = Math.max(0, Math.min(0.1, now - _xLast)); _xLast = now;
    if (on !== _xOn) {
      _xOn = on;
      _xEdge = { on, at: now };
      // Only a switch the player could see happen gets the sound: not a
      // blackout taking the station down with everything else.
      if (e && (on || e.powered)) _xSound(on, e);
    }
    _xk = on ? Math.min(1, _xk + dt / X_UP) : Math.max(0, _xk - dt / X_DOWN);
  }
  // Heard anywhere (it is the answer to a button in the dossier), louder near
  // the station. Up: a machine note climbing under a rising hiss, then the
  // thump of the line taking the load. Down: the note falling away, and the
  // breakers clacking open one after another.
  function _xSound(on, e) {
    if (typeof SFX === 'undefined' || !SFX.context || !SFX.context()) return;
    const near = 0.4 + 0.6 * _surgeNear(e);
    if (on) {
      _sweep(38, 210, X_UP * 0.8, 0.13 * near, 'sawtooth');
      _sweep(76, 420, X_UP * 0.8, 0.035 * near, 'square');
      _noise(X_UP * 0.8, 0.05 * near, 220, 3800, 0.95, 0.7);
      _tone(52, 0.9, 0.3 * near, 'sine', X_UP * 0.8);
      _noise(0.45, 0.1 * near, 5000, 1200, 0.04, 1, X_UP * 0.8);
    } else {
      _sweep(210, 28, X_DOWN, 0.12 * near, 'sawtooth');
      _noise(X_DOWN * 0.8, 0.04 * near, 3000, 180, 0.05, 0.7);
      for (const d of [0, 0.22, 0.5]) _tone(1700 - d * 600, 0.04, 0.08 * near, 'square', d);
    }
  }

  // What the station's sprite needs to know. `stage` keeps the sprite's
  // numbering from before Ignition: 0 is the build (Ignition and
  // Foundations), 1 First Light, 2 The Line, 3 Hyperion, 4 done. Ignition
  // raises the base and cranes (the first BUILD_SPLIT of the build).
  const BUILD_SPLIT = 0.35;
  function visual() {
    const i = stageIdx();
    _xUpdate();
    const p = stageProgress();
    return {
      stage: i < 0 ? -1 : Math.max(0, i - 1),
      label: i >= 0 && i < STAGES.length ? `${STAGES[i].code} · ${STAGES[i].name}` : '—',
      ignition: phase === 'ignition' || phase === 'ignited',
      waiting: phase === 'ignited',
      dtBurned: phase === 'ignition' ? _s0Burned() : 0, dtNeeded: S0_DT,
      build: i === 0 ? BUILD_SPLIT * p : i === 1 ? BUILD_SPLIT + (1 - BUILD_SPLIT) * p : (i > 1 ? 1 : 0),
      surges, surgesNeeded: SURGES_NEEDED, lastFail,
      exporting: isExporting(), exportKW: demandKW(DayNight.hour()),
      exportK: _xk ?? 0,                                     // 0..1, eased (see _xUpdate)
      exportEdge: _xEdge,                                    // { on, at } of the last switch, real seconds
      progress: p, overall: overall(),
      final: phase === 'stage4', complete: at('victory'),
      victory: phase === 'victory',
      standby: standby(),
      hoursLeft: phase === 'stage3' || phase === 'stage4'
        ? Math.max(0, (phase === 'stage4' ? S4_HOURS : S3_HOURS) - heldSec / hourLen()) : 0,
      fx: lastFx,
    };
  }

  // ── Standby: is the grid ready to carry the line? ─────────────────
  // What the station's network has spare for the export, not counting
  // storage or the station's own standby draw: the tightest moment of the
  // last day off the Grid Analyzer's record once half a day is on it (so the
  // evening peak counts), otherwise right now. Surge-hour samples are left
  // out: they carry stage II's 10 MW shots, which the line won't.
  // { kW, now, when: 'day' | 'now' | null }  (now: the live figure, for display)
  function readiness() {
    const e = station();
    if (!e || !(e.networkId >= 0)) return { kW: 0, now: 0, when: null };
    const s = PowerNetwork.stats || {}, net = e.networkId;
    const gN = (s.genSources || []).find(n => n.netId === net), cN = (s.conSources || []).find(n => n.netId === net);
    const storeW = (gN && gN.sources && gN.sources.get ? (gN.sources.get('storage') || {}).w : 0) || 0;
    const own = e.powered ? IDLE_KW : 0;
    const now = ((gN ? gN.supply : 0) - storeW) - ((cN ? cN.demand : 0) - own);
    const h = typeof GridAnalyzer !== 'undefined' && GridAnalyzer.samples ? GridAnalyzer.samples(net, 24) : null;
    if (h && h.covered >= 12) {
      let low = Infinity;
      for (let k = 0; k < h.t.length; k++) {
        if ((h.t[k] / hourLen()) % 1 < SURGE_FRAC + 0.01) continue;
        low = Math.min(low, (h.g[k] - (h.o[k] || 0)) - (h.c[k] - IDLE_KW));
      }
      if (low < Infinity) return { kW: Math.min(low, now), now, when: 'day' };
    }
    return { kW: now, now, when: 'now' };
  }
  function goLive() {
    if (!standby()) return;
    lineLive = true; heldSec = 0; prevPowered = null;
    _fx('fund');
    const final = phase === 'stage4', kw = final ? FINAL_EXPORT_KW : EXPORT_KW;
    try { SFX.unlock?.(); SFX.goodConnect?.(0.3); } catch (_e) {}
    NotificationStack.dismissTag?.('meridian-stage');
    NotificationStack.push({
      icon: '◈', title: final ? 'HYPERION: THE FINAL DAY BEGINS' : 'HYPERION: THE LINE IS LIVE',
      message: `Hyperion Station is drawing ${_mw(kw)} for the nation. Keep it powered for ${final ? S4_HOURS : S3_HOURS} hours; every outage costs an hour.`,
      color: final ? '#ffd070' : '#7ad8ff', border: final ? '#6a4a10' : '#1a4a66', tag: 'meridian-stage', glow: true,
      onClick: () => openDossier(),
    });
  }

  // ── Dossier panel ───────────────────────────────────────────────
  let _dossier = null, _dossierTimer = 0, _lastHtml = '';

  // The project's name stays sealed until fusion is achieved: the
  // breakthrough scene's title card is where it's first revealed.
  const named = () => at('briefed') || (typeof FusionResearch !== 'undefined' && FusionResearch.isComplete());

  function _redact(text, show) { return show ? text : text.replace(/[^\s·—]/g, '█'); }
  function _bar(p, col) { return `<div class="npd-bar"><i style="width:${Math.round(Math.min(1, p) * 100)}%;background:${col}"></i></div>`; }
  function _req(label, p, detail, ok) {
    return `<div class="npd-req ${ok ? 'ok' : ''}"><span>${ok ? '✓' : '○'} ${label}</span><em>${detail}</em></div>${ok ? '' : _bar(p, '#7ad8ff')}`;
  }

  function _dossierHtml() {
    const known = at('briefed');
    const cur = stageIdx();
    let labIn = false;
    for (const _e of EntityRegistry.getByType(T.FUSIONLAB)) { labIn = true; break; }
    const head = `
      <div class="npd-head">
        <div><div class="npd-eyebrow">MINISTRY OF ENERGY · ${known ? 'COMMISSIONED' : 'CLASSIFIED'}</div>
        <div class="npd-title">◈ ${named() ? 'OPERATION HYPERION' : 'CLASSIFIED'}</div>
        <div class="npd-sub">${known ? `Build Hyperion Station and power the nation from ${_esc(_city())}.` : _redact('Build the national interconnector and power the country', false)}</div></div>
        <button class="npd-close" data-np="close">✕</button>
      </div>
      <div class="npd-overall"><span>${known ? 'PROJECT' : 'CLEARANCE'}</span>${known ? _bar(overall(), 'linear-gradient(90deg,#3ab0ff,#ffd070)') + `<b>${Math.floor(overall() * 100)}%</b>` : `<em>${_redact('Achieve fusion at the Fusion Research Facility', labIn)}</em>`}</div>`;

    const cards = STAGES.map((s, i) => {
      const state = cur > i ? 'done' : cur === i ? 'active' : 'locked';
      let body = '';
      if (!known) body = `<div class="npd-redacted">${_redact('Requirements sealed until clearance is granted by the Ministry', false)}</div>`;
      else if (state === 'done') body = `<div class="npd-done">✓ Complete · ${_money(STAGE_REWARD[i])} paid</div>`;
      else if (state === 'locked') body = `<div class="npd-lockedtxt">${[
        `Burn ${S0_DT} pellets in Fusion Reactors with the site powered`,
        `Fund the station ${_money(FUNDING)} · burn ${S1_DHE3} D-He3 pellets in an Advanced Fusion Reactor`,
        `${SURGES_NEEDED} full-power ${_mw(SURGE_KW)} commissioning surges`,
        `Export ${_mw(EXPORT_KW)} for ${S3_HOURS / 24} days · pays ${_multText(EXPORT_KW)} (${_money(exportPay(EXPORT_KW))}/s now)`,
        `Export ${_mw(FINAL_EXPORT_KW)} for a day · pays ${_multText(FINAL_EXPORT_KW)} (${_money(exportPay(FINAL_EXPORT_KW))}/s now) · no coal or oil · City Score ${MIN_SCORE}+ · ${_money(RENEWABLE_INVEST)} in wind, solar & hydro`,
      ][i]}${i === 0 ? '<br><em>Breaks ground when your first Fusion Reactor ignites</em>' : i === 1 && !Progression.isUnlocked(T.MHDRING) ? '<br><em>Opens when the MHD Decelerator Ring is unlocked</em>' : ''}</div>`;
      else if (i === 0) {
        const p = Math.floor(_s0Burned()), up = _sitePowered();
        body = _req(`Burn ${S0_DT} pellets in Fusion Reactors`, p / S0_DT, `${Math.min(p, S0_DT)} / ${S0_DT}`, p >= S0_DT) +
          (up ? '' : `<div class="npd-warn">${station() ? `Hyperion Station has no power; pellets burned now don't count until it gets its ${_mw(BUILD_KW)}` : 'Place Hyperion Station and power it to start construction'}</div>`);
      } else if (phase === 'ignited') {
        body = `<div class="npd-note">The station's base is down. Construction resumes when you unlock the MHD Decelerator Ring; then: fund the station ${_money(FUNDING)} and burn ${S1_DHE3} D-He3 pellets in an Advanced Fusion Reactor.</div>`;
      } else if (i === 1) {
        const p = Math.floor(_s1Burned()), up = _sitePowered();
        body = `
          <div class="npd-req ${funded ? 'ok' : ''}"><span>${funded ? '✓' : '○'} Commit ${_money(FUNDING)} of funding</span>
          ${funded ? '<em>committed</em>' : `<button class="npd-fund" data-np="fund" ${up && Economy.canAfford(FUNDING) ? '' : 'disabled'}>${!up ? 'POWER THE STATION FIRST' : Economy.canAfford(FUNDING) ? 'COMMIT FUNDING' : 'NOT ENOUGH CASH'}</button>`}</div>
          ${_req(`Burn ${S1_DHE3} D-He3 pellets in an Advanced Fusion Reactor`, p / S1_DHE3, `${Math.min(p, S1_DHE3)} / ${S1_DHE3}`, p >= S1_DHE3)}` +
          (up ? '' : `<div class="npd-warn">${station() ? `Hyperion Station has no power; construction is paused until it gets its ${_mw(BUILD_KW)}` : 'Place Hyperion Station and power it to start construction'}</div>`);
      } else if (i === 2) {
        body = _req(`${SURGES_NEEDED} powered ${_mw(SURGE_KW)} surges (one an hour)`, surges / SURGES_NEEDED, `${surges} / ${SURGES_NEEDED}`, false) +
          (lastFail ? '<div class="npd-warn">Last surge aborted; the grid could not deliver it</div>' : '');
      } else if (standby()) {
        const e = station(), final = i === 4, kw = final ? FINAL_EXPORT_KW : EXPORT_KW;
        const r = readiness(), ok = r.kW >= kw * 1.1, thin = !ok && r.kW >= kw;
        const fossil = final ? _fossilCount() : 0, score = _score();
        body = `<div class="npd-note">Standing by. The line is tied in when you say so: from then the station draws ${_mw(kw)} around the clock for ${final ? S4_HOURS : S3_HOURS} hours, and every outage costs an hour.</div>` +
          `<div class="npd-req ${ok ? 'ok' : 'bad'}"><span>${ok ? '✓' : thin ? '!' : '✕'} ${_mw(Math.round(kw * 1.1))} spare at your weakest hour</span><em>${r.when === 'day' ? `weakest: ${(Math.max(0, r.kW) / 1000).toFixed(1)} MW · now: ${(Math.max(0, r.now) / 1000).toFixed(1)} MW` : `now: ${(Math.max(0, r.kW) / 1000).toFixed(1)} MW`}</em></div>` +
          `<div class="npd-note">Measured on Hyperion's network only, ${r.when === 'day' ? 'at the lowest point of the last in-game day (night, the evening peak)' : 'right now until half a day is on record, then at the lowest point of the day'}, with batteries left out: they can't carry a ${final ? S4_HOURS : S3_HOURS}-hour line. The bar is the ${_mw(kw)} draw plus a 10% margin; the Grid panel's surplus is everything, right now.</div>` +
          (final ? `<div class="npd-req ${fossil ? 'bad' : 'ok'}"><span>${fossil ? '✕' : '✓'} No coal or oil generators on the map</span><em>${fossil ? `${fossil} still standing` : 'clean'}</em></div>` +
                   `<div class="npd-req ${score >= MIN_SCORE ? 'ok' : 'bad'}"><span>${score >= MIN_SCORE ? '✓' : '✕'} City Score ${MIN_SCORE} or better</span><em>${score}</em></div>` +
                   (c => `<div class="npd-req ${c.ok ? 'ok' : 'bad'}"><span>${c.ok ? '✓' : '✕'} ${c.label}</span><em>${c.detail}</em></div>`)(_renewCheck()) : '') +
          (ok ? '' : `<div class="npd-warn">${r.when === 'now' ? 'With less than half a day on record this is now, not the evening peak. ' : ''}${thin ? 'That is cutting it fine: one cloud or one tripped turbine drops the line.' : `About ${((kw * 1.1 - Math.max(0, r.kW)) / 1000).toFixed(1)} MW short. Starting now means outages.`} An Engineering Audit lists where to find it.</div>`) +
          `<button class="npd-fund" data-np="golive" ${e && e.powered ? '' : 'disabled'}>${!e || !e.powered ? 'POWER THE STATION FIRST' : `${ok ? '◈' : '⚠'} INITIATE STAGE ${STAGES[i].code}: ${final ? 'THE FINAL DAY' : 'TIE IN THE LINE'}`}</button>`;
      } else {
        const e = station(), final = i === 4;
        const hrs = heldSec / hourLen(), need = final ? S4_HOURS : S3_HOURS;
        body = _req(`Hold ${_mw(final ? FINAL_EXPORT_KW : EXPORT_KW)} export for ${need} hours`, hrs / need, `${Math.floor(hrs)}h / ${need}h`, false) +
          (final ? _finalChecks().slice(1).map(c => `<div class="npd-req ${c.ok ? 'ok' : 'bad'}"><span>${c.ok ? '✓' : '✕'} ${c.label}</span><em>${c.detail}</em></div>`).join('') : '') +
          (e && !e.powered ? '<div class="npd-warn">The line is DOWN; progress is paused</div>' : `<div class="npd-note">Export earning ${_money(exportPay(final ? FINAL_EXPORT_KW : EXPORT_KW))}/s (${_multText(final ? FINAL_EXPORT_KW : EXPORT_KW)})</div>`);
      }
      return `<div class="npd-stage ${state}">
        <div class="npd-stagehead"><span class="npd-code">${s.code}</span><b>${known ? s.name : _redact(s.name, false)}</b><i>${known ? s.tag : ''}</i>
        <span class="npd-state">${state === 'done' ? 'COMPLETE' : state === 'active' ? (standby() ? 'STANDING BY' : phase === 'ignited' ? 'WAITING' : 'IN PROGRESS') : 'LOCKED'}</span></div>${body}</div>`;
    }).join('');

    let foot = `<div class="npd-foot">${known ? `When Hyperion is complete, ${_esc(_city())} powers the nation.` : 'The Ministry will be in touch.'}</div>`;
    if (at('victory')) foot = `
      <div class="npd-foot done">◈ GRID COMPLETE · ${exported.toFixed(0)} MWh sent to the nation
        <button class="npd-toggle" data-np="export">${exportOn ? 'STOP EXPORTING' : 'RESUME EXPORT'}</button></div>`;
    return head + cards + foot;
  }

  function openDossier() {
    if (!at('classified')) return;
    seenStage = stageIdx();
    const btn = document.getElementById('btn-meridian'); if (btn) btn.classList.remove('alert');
    if (!_dossier) {
      _dossier = document.createElement('div');
      _dossier.id = 'np-dossier';
      // Delegated on mousedown: the content is rebuilt twice a second, which
      // would eat a click whose mousedown and mouseup straddle a rebuild.
      _dossier.addEventListener('mousedown', ev => {
        const a = ev.target.closest('[data-np]'); if (!a) return;
        ev.preventDefault();
        const k = a.getAttribute('data-np');
        if (k === 'close') closeDossier();
        else if (k === 'fund' && !funded && _sitePowered() && Economy.canAfford(FUNDING)) {
          Economy.spend(FUNDING); funded = true; _fx('fund');
          try { SFX.unlock?.(); } catch (_e) {}
          showToast?.(`◈ ${_money(FUNDING)} committed to Hyperion Station`, '#7ad8ff', '#06121a', '#1a4a66');
          _renderDossier(true);
        } else if (k === 'golive' && standby() && station()?.powered) { goLive(); _renderDossier(true); }
        else if (k === 'export') { exportOn = !exportOn; _renderDossier(true); }
      });
      document.body.appendChild(_dossier);
    }
    _dossier.classList.add('visible');
    _renderDossier(true);
    clearInterval(_dossierTimer);
    _dossierTimer = setInterval(() => _renderDossier(false), 500);
    SFX.click?.();
  }
  function closeDossier() {
    if (_dossier) _dossier.classList.remove('visible');
    clearInterval(_dossierTimer);
  }
  function _renderDossier(force) {
    if (!_dossier) return;
    const html = _dossierHtml();
    if (!force && html === _lastHtml) return;
    _lastHtml = html; _dossier.innerHTML = html;
  }

  // The top-bar button — appears once the file is opened.
  function _updateButton() {
    let btn = document.getElementById('btn-meridian');
    if (!at('classified')) { if (btn) btn.remove(); return; }
    if (!btn) {
      const menu = document.getElementById('btn-menu');
      if (!menu) return;
      btn = document.createElement('button');
      btn.id = 'btn-meridian';
      btn.addEventListener('click', () => (_dossier && _dossier.classList.contains('visible')) ? closeDossier() : openDossier());
      menu.parentNode.insertBefore(btn, menu);
      if (seenStage !== stageIdx()) btn.classList.add('alert');
    }
    const txt = !at('briefed') ? '◈ CLASSIFIED' : at('victory') ? '◈ HYPERION ✓' : `◈ HYPERION ${Math.floor(overall() * 100)}%`;
    if (btn.textContent !== txt) btn.textContent = txt;
    btn.classList.toggle('gold', phase === 'stage4' || at('victory'));
  }
  function _alert() { const b = document.getElementById('btn-meridian'); if (b) b.classList.add('alert'); else seenStage = -2; }

  function _jump(e) { Camera.recentreOn((e.col + e.width / 2) * TILE, (e.row + e.height / 2) * TILE); }
  function _jumpSite() {
    const s = _site(); if (!s) return;
    const d = EntityDefs[T.NATIONALGRID];
    Camera.recentreOn((s[0] + d.width / 2) * TILE, (s[1] + d.height / 2) * TILE);
  }
  // Goes through reserveNationalSlot rather than reading the plan directly,
  // so a saved spot that a resized building now overlaps is re-picked before
  // the fence is drawn there (or the camera jumps to it).
  const _site = () => {
    if (typeof GovernmentSystem === 'undefined' || !GovernmentSystem.getNationalPlan?.()) return null;
    return GovernmentSystem.reserveNationalSlot?.(T.NATIONALGRID) || null;
  };
  const _esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ── The reserved site, before the station exists ─────────────────
  // World space, under the camera transform. A fenced plot with a slowly
  // turning hologram: CLASSIFIED until the briefing, then the station's
  // outline waiting for the MHD Ring.
  function renderWorld(ctx, t) {
    if (!at('classified') || station()) return;
    const s = _site(); if (!s) return;
    const d = EntityDefs[T.NATIONALGRID];
    const x = s[0] * TILE, y = s[1] * TILE, w = d.width * TILE, h = d.height * TILE;
    const now = performance.now() / 1000, known = at('briefed');
    const col = known ? '122,216,255' : '255,190,80';
    ctx.save();
    ctx.fillStyle = `rgba(${col},0.05)`; ctx.fillRect(x, y, w, h);
    // hazard fence
    ctx.setLineDash([TILE * 0.6, TILE * 0.4]); ctx.lineDashOffset = -now * TILE;
    ctx.strokeStyle = `rgba(${col},0.85)`; ctx.lineWidth = Math.max(2, TILE * 0.12);
    ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    // corner lamps
    for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
      const on = Math.sin(now * 3 + cx) > 0;
      ctx.fillStyle = on ? `rgba(${col},1)` : `rgba(${col},0.3)`;
      ctx.beginPath(); ctx.arc(cx, cy, TILE * 0.35, 0, Math.PI * 2); ctx.fill();
    }
    // hologram: the station's blueprint, scanning
    ctx.globalCompositeOperation = 'lighter';
    const cx = x + w / 2, cy = y + h / 2;
    ctx.strokeStyle = `rgba(${col},0.35)`; ctx.lineWidth = Math.max(1, TILE * 0.06);
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(cx, cy, TILE * (2.2 + k * 1.6), now * (0.4 + k * 0.2), now * (0.4 + k * 0.2) + Math.PI * 1.4); ctx.stroke(); }
    if (known) {
      ctx.setLineDash([TILE * 0.3, TILE * 0.3]);
      ctx.strokeRect(x + w * 0.04, y + h * 0.08, w * 0.32, h * 0.34);
      ctx.strokeRect(x + w * 0.04, y + h * 0.5, w * 0.32, h * 0.34);
      ctx.strokeRect(x + w * 0.7, y + h * 0.08, w * 0.26, h * 0.76);
      ctx.setLineDash([]);
    }
    const scan = y + ((now * 0.25) % 1) * h;
    const g = ctx.createLinearGradient(0, scan - TILE, 0, scan + TILE);
    g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(0.5, `rgba(${col},0.35)`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.fillRect(x, scan - TILE, w, TILE * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${TILE * 1.1}px Arial, sans-serif`;
    ctx.fillStyle = `rgba(${col},0.95)`;
    ctx.fillText(named() ? '◈ OPERATION HYPERION' : '◈ CLASSIFIED', cx, cy - TILE * 0.8);
    ctx.font = `bold ${TILE * 0.6}px Arial, sans-serif`;
    ctx.fillStyle = `rgba(${col},0.8)`;
    ctx.fillText(known ? 'FUTURE SITE OF HYPERION STATION' : named() ? 'DECLASSIFIED · MINISTRY OF ENERGY' : 'MINISTRY OF ENERGY · NO ENTRY', cx, cy + TILE * 0.6);
    // Plain-language plate: what this fenced plot is and what to do about it.
    const lines = known
      ? ['The national interconnector is built here when Stage I begins.',
         'Keep this land clear and run heavy power lines toward it.']
      : ['Land reserved by the Ministry of Energy for a national project.'];
    ctx.font = `${TILE * 0.42}px Arial, sans-serif`;
    const pw = Math.max(...lines.map(l => ctx.measureText(l).width)) + TILE * 0.8, ph = TILE * (0.88 + 0.62 * (lines.length - 1));
    ctx.fillStyle = 'rgba(6,10,16,0.72)';
    ctx.beginPath(); ctx.roundRect(cx - pw / 2, cy + TILE * 1.3, pw, ph, TILE * 0.2); ctx.fill();
    ctx.strokeStyle = `rgba(${col},0.5)`; ctx.lineWidth = Math.max(1, TILE * 0.04); ctx.stroke();
    ctx.fillStyle = 'rgba(232,238,244,0.92)';
    lines.forEach((l, i) => ctx.fillText(l, cx, cy + TILE * (1.72 + i * 0.62)));
    ctx.restore();
  }

  // ═══ The draw: Stage III and IV completion ═══════════════════════
  // A short cinematic for the moment the line is proven, to make the size
  // of the load felt: the rest of the city browns out as Hyperion spools up,
  // charge runs in along every power line on the map, streams of energy pour
  // out of every generator into the station, a counter climbs to the export,
  // and then it lets go: flash, a pillar of light off the spire, shockwaves.
  // Stage IV is the same at full draw: gold, the whole city in shot, near
  // blackout, three rings and three shockwaves, arcs crawling the station,
  // and a whiteout that hands over to the victory sequence. Esc skips.
  // The game is paused while it plays, as for the victory sequence.
  const SCENE = {
    2: { dur: 11, release: 7.4, rgb: '110,215,255', hot: '215,245,255', kw: EXPORT_KW, srcMax: 70, rings: 1, waves: 1,
         dark: 0.5, pull: false, arcs: 4, eyebrow: 'OPERATION HYPERION · STAGE IV COMPLETE', big: 'THE NATION IS DRAWING' },
    3: { dur: 15, release: 10.6, rgb: '255,200,100', hot: '255,246,225', kw: FINAL_EXPORT_KW, srcMax: 160, rings: 3, waves: 3,
         dark: 0.82, pull: true, arcs: 9, eyebrow: 'OPERATION HYPERION · STAGE V COMPLETE', big: 'HYPERION AT FULL DRAW' },
  };
  let S = null;
  const _sceneBusy = () => !!S;

  function _glowSprite(rgb) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, `rgba(${rgb},0.85)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return cv;
  }

  // The column of light off the spire, drawn once per colour: a thin white
  // core inside a wider glow inside a broad faint haze, every layer tapering
  // to nothing at its edges, fading out toward the top and softening into
  // the glow at its foot, so it has no outline anywhere. Drawn stretched,
  // 8 × the beam's nominal width across and as tall as needed, with its foot
  // on the spire.
  const _beams = {};
  function _beamSprite(rgb, hot) {
    const key = rgb + '|' + hot;
    if (_beams[key]) return _beams[key];
    const W = 128, H = 256, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    const [r1, g1, b1] = rgb.split(',').map(Number), [r2, g2, b2] = hot.split(',').map(Number);
    for (let y = 0; y < H; y++) {
      const v = y / (H - 1);                                            // 0 top, 1 foot
      const vert = Math.pow(v, 1.4) * (1 - 0.55 * Math.pow(Math.max(0, (v - 0.86) / 0.14), 2));
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / W * 2 - 1, u2 = u * u, taper = (1 - u2) * (1 - u2);
        const core = Math.exp(-u2 * 260), mid = Math.exp(-u2 * 34), haze = Math.exp(-u2 * 4.5);
        const a = Math.min(1, (0.95 * core + 0.42 * mid + 0.16 * haze) * taper * vert);
        const h = Math.min(1, core * 1.2 + mid * 0.25);                   // how white
        const k = (y * W + x) * 4;
        d[k] = r1 + (r2 - r1) * h; d[k + 1] = g1 + (g2 - g1) * h; d[k + 2] = b1 + (b2 - b1) * h; d[k + 3] = a * 255;
      }
    }
    g.putImageData(img, 0, 0);
    return (_beams[key] = cv);
  }
  // Draw the beam with its foot at (px, py), `pw` its nominal width, `a` its strength.
  function _drawBeam(ctx, rgb, hot, px, py, pw, a, top = 0) {
    if (a <= 0.005 || py <= top) return;
    const s = _beamSprite(rgb, hot), w = pw * 8, h = (py - top) * 1.04 + pw * 2;
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(s, px - w / 2, py + pw * 2 - h, w, h);
  }

  function _sceneStart(i, done) {
    const c = SCENE[i], e = station();
    if (!c || !e) { done && done(); return; }
    _sceneEnd(true);
    const sx = (e.col + e.width * 1180 / 2560) * TILE, sy = (e.row + e.height * 640 / 1600) * TILE;
    // Every generator on the map, biggest first; streams come from these.
    const gens = [];
    for (const b of EntityRegistry.all()) {
      const out = (EntityDefs[b.type] && EntityDefs[b.type].powerOutput) || 0;
      if (out <= 0 || b === e || b.type === T.BATTERY) continue;
      const x = (b.col + (b.width || 1) / 2) * TILE, y = (b.row + (b.height || 1) / 2) * TILE;
      gens.push({ x, y, w: out, d: Math.hypot(x - sx, y - sy) });
    }
    gens.sort((a, b) => b.w - a.w);
    const srcs = gens.slice(0, c.srcMax).filter(s => s.d > TILE * 4);
    let acc = 0;
    for (const s of srcs) { acc += Math.sqrt(s.w); s.cum = acc; }
    // Every piece of power line, by distance from the spire: the rings of
    // charge run in along these.
    let wires = [];
    const addW = (b) => { const x = (b.col + (b.width || 1) / 2) * TILE, y = (b.row + (b.height || 1) / 2) * TILE; wires.push({ x, y, d: Math.hypot(x - sx, y - sy), big: b.type !== T.WIRE }); };
    for (const t of [T.WIRE, T.POLE, T.POWERTOWER].filter(Boolean)) for (const b of EntityRegistry.getByType(t)) addW(b);
    for (const t of [T.CONVEYOR, T.PIPE, T.UNDERGNDPIPE]) for (const b of EntityRegistry.getByType(t)) if (b._underWire) addW(b);
    if (wires.length > 30000) { const k = Math.ceil(wires.length / 30000); wires = wires.filter((_w, n) => n % k === 0); }
    wires.sort((a, b) => a.d - b.d);
    const rMax = Math.max(TILE * 40, wires.length ? wires[Math.floor((wires.length - 1) * 0.98)].d : 0,
                          srcs.length ? Math.max(...srcs.map(s => s.d)) : 0);
    // How big the load is next to everything else the city uses.
    const own = demandKW(DayNight.hour());
    const cityKW = Math.max(0, (PowerNetwork.stats.totalConsumed || 0) - (e.powered ? own : 0));
    const ratio = cityKW > 50 ? c.kw / cityKW : 0;
    const cmp = ratio >= 1.05 ? `${ratio.toFixed(1)}× EVERYTHING ELSE ${_city().toUpperCase()} USES, COMBINED`
              : ratio > 0 ? `${Math.round(ratio * 100)}% OF EVERYTHING ELSE ${_city().toUpperCase()} USES`
              : `${_city().toUpperCase()}'S GRID, CARRYING A NATION`;

    const root = document.createElement('div');
    root.id = 'np-draw';
    root.className = i === 3 ? 'gold' : '';
    root.innerHTML = `
      <canvas class="npw-fx"></canvas>
      <div class="npw-bar npw-top"></div><div class="npw-bar npw-bot"></div>
      <div class="npw-hud">
        <div class="npw-eyebrow">${_esc(c.eyebrow)}</div>
        <div class="npw-label">DRAWING</div>
        <div class="npw-num">0.0 MW</div>
        <div class="npw-watts"></div>
        <div class="npw-big">${_esc(c.big)}</div>
        <div class="npw-cmp">${_esc(cmp)}</div>
      </div>
      <div class="npw-skip">ESC TO SKIP</div>`;
    document.body.appendChild(root);
    document.body.classList.add('np-draw');
    const fx = root.querySelector('.npw-fx'), g = fx.getContext('2d');
    const resize = () => { const dpr = window.devicePixelRatio || 1; fx.width = innerWidth * dpr; fx.height = innerHeight * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    const fitZ = Math.min(innerWidth / (e.width * TILE), innerHeight / (e.height * TILE));
    const zA = Math.max(Camera.ZOOM_MIN || 0.1, Math.min(1.2, fitZ * 0.55));
    const zB = Math.max(Camera.ZOOM_MIN || 0.1, Math.min(zA, Math.min(innerWidth, innerHeight) * 0.46 / rMax));
    S = { i, c, e, sx, sy, srcs, srcW: acc, wires, rMax, root, fx, g, resize, done,
          from: { x: Camera.x + innerWidth / Camera.zoom / 2, y: Camera.y + innerHeight / Camera.zoom / 2, z: Camera.zoom },
          zA, zB, prevSpeed: DevMode.timeScale, t0: performance.now() / 1000, last: 0, fixedT: null,
          parts: [], spawn: 0, arcs: [], arcAt: 0, crackAt: 0, boomed: 0, ending: false, raf: 0,
          sprite: _glowSprite(c.rgb), hotSprite: _glowSprite(c.hot) };
    DevMode.setTimeScale(0);
    S.onKey = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); if (ev.type === 'keydown' && !ev.repeat) _sceneEnd(false); } };
    window.addEventListener('keydown', S.onKey, true);
    window.addEventListener('keyup', S.onKey, true);
    window.addEventListener('resize', resize);
    // Spool-up: a rising machine note over a climbing hiss.
    const spool = c.release - 0.6;
    _sweep(32, i === 3 ? 150 : 120, spool, i === 3 ? 0.22 : 0.17, 'sawtooth');
    _sweep(64, i === 3 ? 420 : 300, spool, 0.05, 'square');
    _noise(spool, i === 3 ? 0.09 : 0.06, 180, 4200, 0.95, 0.7);
    _loadHum();
    S.raf = requestAnimationFrame(_sceneFrame);
  }

  function _sceneFrame(nowMs) {
    if (!S) return;
    S.raf = requestAnimationFrame(_sceneFrame);
    const now = nowMs / 1000, t = S.fixedT !== null ? S.fixedT : now - S.t0;
    const dt = S.last ? Math.min(0.05, now - S.last) : 0;
    S.last = now;
    if (DevMode.timeScale !== 0 && !S.ending) DevMode.setTimeScale(0);
    _sceneCamera(t);
    _sceneTick(t, dt);
    _sceneDraw(t);
    if (t >= S.c.dur && !S.ending && S.fixedT === null) _sceneEnd(false);
  }

  // Into the station over the first second and a half; at full draw, out
  // again through the spool until the whole city is in shot.
  function _sceneCamera(t) {
    const u = ease(clamp01(t / 1.5));
    let z = zLerp(S.from.z, S.zA, u);
    if (S.c.pull) z = zLerp(z, S.zB, smooth(clamp01((t - 2.6) / (S.c.release - 3.2))));
    Camera.setZoom(z);
    Camera.jumpTo(S.from.x + (S.sx - S.from.x) * u, S.from.y + (S.sy - S.from.y) * u);
  }

  // Sound and the particle streams.
  function _sceneTick(t, dt) {
    const c = S.c, R = c.release;
    // Streams: from 2.2 s to just past the release, thickening as they go.
    const flow = t > 2.2 && t < R + 0.25 ? 0.25 + 0.75 * smooth(clamp01((t - 2.2) / (R - 2.6))) : 0;
    const MAXP = c.pull ? 2200 : 1300;
    S.spawn += dt * flow * (c.pull ? 900 : 520);
    while (S.spawn >= 1 && S.srcs.length && S.parts.length < MAXP) {
      S.spawn -= 1;
      const r = Math.random() * S.srcW;
      let s = S.srcs[0];
      for (const q of S.srcs) if (q.cum >= r) { s = q; break; }
      S.parts.push({ s, p: 0, v: 0.18 + Math.random() * 0.16, k: (Math.random() - 0.5) * 0.7, z: 0.6 + Math.random() * 0.9 });
    }
    if (S.spawn > 4) S.spawn = 4;
    for (let n = S.parts.length - 1; n >= 0; n--) {
      const q = S.parts[n];
      q.p += dt * q.v * (1 + 2.5 * q.p) * (0.6 + flow);
      if (q.p >= 1) S.parts.splice(n, 1);
    }
    // Crackle while the streams run; arcs once the core is hot.
    if (flow > 0 && t >= S.crackAt) {
      S.crackAt = t + 0.06 + Math.random() * (0.32 - 0.22 * flow);
      _noise(0.05 + Math.random() * 0.06, 0.05 + 0.1 * flow, 2200 + Math.random() * 3000, 5000 + Math.random() * 3000, 0.04, 2.5);
    }
    // The release: boom, rumble and (at full draw) two more blows behind it.
    for (let k = S.boomed; k < c.waves; k++) {
      if (t < R + k * 0.42) break;
      S.boomed = k + 1;
      const w = k === 0 ? 1 : 0.6;
      _impact(0.85 * w, k === 0 ? 1.8 : 1.2);                                   // the blow, ringing out in the hall
      _noise(2.6, 0.4 * w, 140, 32, 0.015, 0.7);                               // and the rumble rolling after it
      if (k === 0) _shimmer(c.pull ? 5 : 3.5, c.pull ? 0.06 : 0.04, 0.15);
      try { Camera.shake?.(k === 0 ? (c.pull ? 46 : 32) : 22); } catch (_e) {}
    }
  }

  function _sceneDraw(t) {
    const c = S.c, g = S.g, W = innerWidth, H = innerHeight, z = Camera.zoom;
    const R = c.release, after = t - R;
    const charge = clamp01((t - 0.6) / (R - 0.6)), heat = charge * charge;
    const sxs = (x) => (x - Camera.x) * z, sys = (y) => (y - Camera.y) * z;
    const px = sxs(S.sx), py = sys(S.sy);
    g.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);

    // Brownout: the rest of the city sags and flickers as Hyperion pulls,
    // and comes back after the release.
    let dark = c.dark * smooth(clamp01((t - 0.8) / 2.4));
    if (after > 0) dark *= 1 - smooth(clamp01((after - 0.5) / 2.4));
    const flick = 0.82 + 0.18 * Math.sin(t * 41) * Math.sin(t * 13.7 + 1.3);
    g.fillStyle = `rgba(1,3,9,${Math.min(0.92, dark * flick)})`;
    g.fillRect(0, 0, W, H);
    // The sky takes on the station's colour as it charges, and blazes with
    // it at the release.
    {
      const sky = 0.15 + 0.55 * heat + (after > 0 ? 0.7 * Math.exp(-after * 0.8) : 0);
      const R = Math.max(W, H) * 1.4;
      const gr = g.createRadialGradient(px, py, 0, px, py, R);
      gr.addColorStop(0, `rgba(${c.hot},${Math.min(0.75, 0.4 * sky)})`);
      gr.addColorStop(0.3, `rgba(${c.rgb},${Math.min(0.55, 0.26 * sky)})`);
      gr.addColorStop(1, `rgba(${c.rgb},${Math.min(0.3, 0.1 * sky)})`);
      g.globalCompositeOperation = 'screen'; g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }

    g.globalCompositeOperation = 'lighter';
    // Rings of charge running in along the power lines, all arriving as it lets go.
    const band = Math.max(TILE * 3, S.rMax * 0.045), tw = Math.max(2, TILE * z);
    const lo = (d) => { let a = 0, b = S.wires.length; while (a < b) { const m = (a + b) >> 1; if (S.wires[m].d < d) a = m + 1; else b = m; } return a; };
    for (let k = 0; k < c.rings; k++) {
      const t0 = 1.0 + k * 1.0, u = clamp01((t - t0) / (R - 0.15 - t0));
      if (t < t0 || u >= 1) continue;
      const rk = S.rMax * 1.04 * (1 - u * u);
      const tail = S.rMax * (c.pull ? 0.3 : 0.18);
      for (let n = lo(rk - band), N = Math.min(S.wires.length, lo(rk + tail)); n < N; n++) {
        const w = S.wires[n], off = w.d - rk;
        const a = off < band ? (1 - Math.abs(off) / band) : 0.22 * (1 - (off - band) / Math.max(1, tail - band));
        if (a <= 0.02) continue;
        const x = sxs(w.x), y = sys(w.y);
        if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
        g.globalAlpha = Math.min(1, a);
        const s = (w.big ? 3.2 : 1.6) * tw;
        g.drawImage(off < band ? S.hotSprite : S.sprite, x - s / 2, y - s / 2, s, s);
      }
    }
    // The streams: every generator pouring into the spire.
    const ps = Math.max(3, TILE * 0.9 * z);
    for (const q of S.parts) {
      const s = q.s, mx = (s.x + S.sx) / 2, my = (s.y + S.sy) / 2, dx = S.sx - s.x, dy = S.sy - s.y;
      const cx = mx - dy * q.k * 0.5, cy = my + dx * q.k * 0.5;
      for (let j = 0; j < 3; j++) {
        const p = Math.max(0, q.p - j * 0.012), m = 1 - p;
        const x = sxs(m * m * s.x + 2 * m * p * cx + p * p * S.sx), y = sys(m * m * s.y + 2 * m * p * cy + p * p * S.sy);
        g.globalAlpha = (j === 0 ? 0.9 : 0.4 / j) * Math.min(1, q.p * 6);
        const sz = ps * q.z * (j === 0 ? 1 : 0.7);
        g.drawImage(j === 0 ? S.hotSprite : S.sprite, x - sz / 2, y - sz / 2, sz, sz);
      }
    }
    // The core, swelling with the charge.
    const coreR = TILE * z * (2.5 + 16 * heat) * (after > 0 ? 1 + 1.6 * Math.exp(-after * 1.2) : 1) * (0.94 + 0.06 * Math.sin(t * 23));
    g.globalAlpha = Math.min(1, 0.35 + 0.65 * heat) * (after > 0 ? Math.max(0.35, Math.exp(-after * 0.5)) : 1);
    g.drawImage(S.sprite, px - coreR * 2.2, py - coreR * 2.2, coreR * 4.4, coreR * 4.4);
    g.drawImage(S.hotSprite, px - coreR, py - coreR, coreR * 2, coreR * 2);
    // Arcs crawling off the station as it nears the top.
    if (heat > 0.35 && after < (c.pull ? 2.5 : 1)) {
      if (t >= S.arcAt) {
        S.arcAt = t + 0.07;
        S.arcs = [];
        const n = Math.round(c.arcs * Math.min(1, heat + 0.2));
        for (let k = 0; k < n; k++) {
          const a = Math.random() * Math.PI * 2, len = TILE * (4 + Math.random() * (c.pull ? 22 : 12)) * (0.6 + heat);
          const pts = [[S.sx, S.sy]];
          for (let s = 1; s <= 8; s++) {
            const f = s / 8, j = TILE * (1.4 + 1.2 * Math.random()) * (1 - f * 0.4);
            pts.push([S.sx + Math.cos(a) * len * f + (Math.random() - 0.5) * j, S.sy + Math.sin(a) * len * f + (Math.random() - 0.5) * j]);
          }
          S.arcs.push(pts);
        }
      }
      for (const pts of S.arcs) {
        for (const [lw, col, al] of [[Math.max(4, TILE * 0.5 * z), c.rgb, 0.35], [Math.max(1.5, TILE * 0.14 * z), '255,255,255', 0.95]]) {
          g.globalAlpha = al; g.strokeStyle = `rgb(${col})`; g.lineWidth = lw; g.lineJoin = 'round';
          g.beginPath(); pts.forEach(([x, y], k) => k ? g.lineTo(sxs(x), sys(y)) : g.moveTo(sxs(x), sys(y))); g.stroke();
        }
      }
    }
    // The pillar: a column of light off the spire, building as it nears the
    // top at full draw, blazing at the release and fading after.
    const pil = after > 0 ? Math.exp(-after * (c.pull ? 0.45 : 0.75)) : (c.pull ? 0.35 * smooth(clamp01((charge - 0.7) / 0.3)) : 0);
    if (pil > 0.01) {
      const pw = Math.max(18, TILE * z * (c.pull ? 9 : 6)) * (after > 0 ? 1 + 0.8 * Math.exp(-after * 2) : 0.6);
      _drawBeam(g, c.rgb, c.hot, px, py, pw, pil, -H * 0.2);
    }
    // Shockwaves racing out across the map.
    const reach = Math.max(W, H) / z * 1.1;
    for (let k = 0; k < c.waves; k++) {
      const a = after - k * 0.42;
      if (a <= 0 || a > 3) continue;
      const u = clamp01(a / 2.6), rr = ease(u) * reach * (k === 0 ? 1 : 0.85);
      g.globalAlpha = (1 - u) * (k === 0 ? 0.9 : 0.6);
      g.strokeStyle = `rgb(${k === 0 ? c.hot : c.rgb})`;
      g.lineWidth = Math.max(2, TILE * z * (3.5 * (1 - u) + 0.6));
      g.beginPath(); g.arc(px, py, rr * z, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = (1 - u) * 0.18; g.lineWidth = Math.max(8, TILE * z * 10 * (1 - u));
      g.beginPath(); g.arc(px, py, Math.max(1, rr * z - g.lineWidth / 2), 0, Math.PI * 2); g.stroke();
    }

    // Flash at the release; at full draw, a whiteout to close.
    g.globalCompositeOperation = 'source-over';
    let white = after > 0 ? Math.max(0, 0.9 * (1 - after / 0.7)) : 0;
    if (c.pull) white = Math.max(white, smooth(clamp01((t - (c.dur - 1.4)) / 1.2)));
    if (white > 0.005) { g.globalAlpha = Math.min(1, white); g.fillStyle = `rgb(${c.hot})`; g.fillRect(0, 0, W, H); }
    g.globalAlpha = 1;

    // The readout.
    const mw = c.kw / 1000 * (after > 0 ? 1 : smooth(charge));
    const hud = S.root.querySelector('.npw-hud');
    hud.querySelector('.npw-num').textContent = `${mw.toFixed(1)} MW`;
    hud.querySelector('.npw-watts').textContent = `${Math.round(mw * 1e6).toLocaleString('en-US')} W`;
    S.root.classList.toggle('show', t > 0.9);
    S.root.classList.toggle('let', after > 0);
    S.root.classList.toggle('bars', t < c.dur - 0.6);
  }

  function _sceneEnd(abort) {
    if (!S) return;
    const s = S;
    S = null;
    cancelAnimationFrame(s.raf);
    window.removeEventListener('keydown', s.onKey, true);
    window.removeEventListener('keyup', s.onKey, true);
    window.removeEventListener('resize', s.resize);
    document.body.classList.remove('np-draw');
    if (s.prevSpeed !== undefined) DevMode.setTimeScale(s.prevSpeed || 1);
    // Back to the station's framing so the hand-off isn't a jump.
    try { Camera.setZoom(s.zA); Camera.jumpTo(s.sx, s.sy); } catch (_e) {}
    s.root.classList.add('out');
    setTimeout(() => s.root.remove(), 900);
    if (!abort && s.done) s.done();
  }

  // ═══ The live draw: the whole of Stages III and IV ════════════════
  // While the line is live, the map shows the load: waves of charge run in
  // along every power line toward the station, every generator throbs as a
  // wave is pulled through it, a pillar of light stands on the spire, arcs
  // leap from the station onto the lines near it, and every so often a
  // surge sweeps in from the edge of the map. All of it builds through the
  // stage (stageProgress), is stronger at night, and at full draw (Stage IV)
  // is gold, faster and heavier. Drawn on the game's frame above the night
  // overlay, in screen px, and only for what is on screen.
  const LIVE = { 2: { rgb: '110,215,255', hot: '215,245,255', lam: 30, v: 22, surge: 12, pill: 3.2, arcGap: [1.4, 3.2], amp: 1 },
                 3: { rgb: '255,200,100', hot: '255,246,225', lam: 22, v: 34, surge: 6,  pill: 5.2, arcGap: [0.5, 1.6], amp: 1.5 } };
  const CH = 32;   // tiles per chunk of the line index
  const L = { topo: -1, at: 0, e: null, sx: 0, sy: 0, wires: null, chunks: null, gens: [], rMax: 0, sprites: {},
              arc: null, arcAt: 0, nextArc: 0 };
  const _liveSprite = (rgb) => L.sprites[rgb] || (L.sprites[rgb] = _glowSprite(rgb));
  function _liveData(e) {
    const topo = EntityRegistry.getTopologyVersion(), now = performance.now();
    if (L.wires && L.e === e && (L.topo === topo || now - L.at < 2500)) return;
    L.topo = topo; L.at = now; L.e = e;
    L.sx = (e.col + e.width * 1180 / 2560) * TILE; L.sy = (e.row + e.height * 640 / 1600) * TILE;
    const wires = [], chunks = new Map();
    const add = (b, big) => {
      const x = (b.col + (b.width || 1) / 2) * TILE, y = (b.row + (b.height || 1) / 2) * TILE;
      const k = Math.floor(b.col / CH) + ',' + Math.floor(b.row / CH);
      let a = chunks.get(k); if (!a) chunks.set(k, a = []);
      a.push(wires.length);
      wires.push({ x, y, d: Math.hypot(x - L.sx, y - L.sy), big });
    };
    for (const t of [T.WIRE, T.POLE, T.POWERTOWER].filter(Boolean)) for (const b of EntityRegistry.getByType(t)) add(b, b.type !== T.WIRE);
    for (const t of [T.CONVEYOR, T.PIPE, T.UNDERGNDPIPE]) for (const b of EntityRegistry.getByType(t)) if (b._underWire) add(b, false);
    L.wires = wires; L.chunks = chunks;
    L.rMax = wires.reduce((m, w) => Math.max(m, w.d), TILE * 40);
    L.gens = [];
    for (const b of EntityRegistry.all()) {
      const out = (EntityDefs[b.type] && EntityDefs[b.type].powerOutput) || 0;
      if (out <= 0 || b === e || b.type === T.BATTERY) continue;
      const x = (b.col + (b.width || 1) / 2) * TILE, y = (b.row + (b.height || 1) / 2) * TILE;
      L.gens.push({ x, y, d: Math.hypot(x - L.sx, y - L.sy), r: Math.sqrt((b.width || 1) * (b.height || 1)), b });
    }
  }

  // The draw's own sound. A held drone: mains hum (a filtered saw at 49 Hz
  // and its octave) that swells every time a wave of charge reaches the
  // station, so the pull is heard in step with what is seen; at full draw a
  // fifth and a high glassy partial join it and it opens up. Each surge is a
  // whoosh climbing as its ring sweeps in, landing on a thud. Louder near
  // the station and zoomed in, faint anywhere on the map. Every frame re-arms
  // a fade half a second out, so when the draw stops being drawn (the stage
  // ends, a scene takes over, the window is hidden) the drone dies away.
  const LS = { vox: null, surge: -1 };
  function _liveSound(e, c, final, swell, near, now, sp, F = 1) {
    const ctx = typeof SFX !== 'undefined' && SFX.context ? SFX.context() : null;
    if (!ctx) return;
    if (!LS.vox) {
      const mk = (type, f, cut, q) => {
        const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), gn = ctx.createGain();
        o.type = type; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = cut; fl.Q.value = q; gn.gain.value = 0;
        o.connect(fl); fl.connect(gn); gn.connect(_bus(ctx)); o.start();
        return { o, fl, gn };
      };
      LS.vox = [mk('sawtooth', 49, 220, 4), mk('sawtooth', 98.6, 340, 2), mk('square', 147, 500, 1), mk('sine', 1568, 4000, 0.5)];
    }
    const t = ctx.currentTime, vol = SFX.getVolume ? SFX.getVolume() : 1;
    const base = (0.035 + 0.13 * near) * vol * F;
    const levels = final ? [1, 0.7, 0.35, 0.05] : [1, 0.55, 0, 0];
    LS.vox.forEach((v, k) => {
      const lv = base * levels[k] * (k === 3 ? 0.4 + 0.6 * swell : 0.45 + 0.55 * swell);
      v.gn.gain.cancelScheduledValues(t);
      v.gn.gain.setTargetAtTime(lv, t, 0.06);
      v.gn.gain.setTargetAtTime(0, t + 0.5, 0.2);
      if (k < 3) v.fl.frequency.setTargetAtTime((k === 0 ? 160 : 260) * (1 + (final ? 2.2 : 1.2) * swell), t, 0.05);
    });
    // A surge: whoosh up as the ring comes in, thud as it lands.
    const idx = Math.floor(now / c.surge);
    if (idx !== LS.surge) {
      const first = LS.surge < 0;
      LS.surge = idx;
      if (!first && sp < 0.2 && F > 0.6) {
        const dur = Math.min(c.surge, 3.2), v = (0.35 + 0.65 * near) * (final ? 1.2 : 1);
        if (final) {
          // Full draw: a filtered riser of low detuned saws building into the
          // landing and cut dead on it, then a deep hit with the clang of big
          // contactors and the rumble rolling off it. (It used to be a bare
          // sawtooth sliding up from 70 Hz, loudest at its start, which buzzed
          // like a raspberry.)
          _riser(dur, 0.045 * v);
          _impact(0.32 * v, 1.25, dur);
          _clank(0.1 * v, dur);
          _noise(1.6, 0.14 * v, 180, 38, 0.02, 0.8, dur);
          _shimmer(2.2, 0.02 * v, dur);
          return;
        }
        _sweep(70, 360, dur, 0.07 * v, 'sawtooth');
        _noise(dur, 0.06 * v, 250, final ? 5200 : 3600, 0.92, 0.9);
        _tone(final ? 31 : 36, 1.8, 0.22 * v, 'sine', dur);
        _noise(1.1, 0.16 * v, 220, 45, 0.02, 0.8, dur);
        _noise(0.18, 0.08 * v, 4200, 1400, 0.02, 1.2, dur);
      }
    }
  }
  function _liveSoundStop() {
    if (!LS.vox) return;
    for (const v of LS.vox) { try { v.o.stop(); } catch (_e) {} }
    LS.vox = null; LS.surge = -1;
  }

  // The live look eases in over LIVE_FADE_IN real seconds each time it comes
  // on (the line going live, the next stage, the line back after an outage)
  // instead of snapping on at full strength. A load that finds the line
  // already live shows it at once, like _xUpdate.
  const LIVE_FADE_IN = 8;
  let _liveF = null, _liveFAt = 0;
  function _liveFade(on) {
    const now = performance.now() / 1000;
    if (_liveF === null) { _liveF = on ? 1 : 0; _liveFAt = now; }
    const dt = Math.max(0, Math.min(0.1, now - _liveFAt)); _liveFAt = now;
    _liveF = on ? Math.min(1, _liveF + dt / LIVE_FADE_IN) : 0;
    return _liveF * _liveF * (3 - 2 * _liveF);   // smoothstep
  }

  function renderLive(ctx, W, H) {
    const e0 = (phase === 'stage3' || phase === 'stage4') && !S && !V ? station() : null;
    const live = !!(e0 && e0.powered && isExporting());
    const F = _liveFade(live);
    if (!live) { if (LS.vox && !S) _liveSoundStop(); return; }
    const e = e0;
    const c = LIVE[phase === 'stage4' ? 3 : 2];
    _liveData(e);
    const now = performance.now() / 1000, z = Camera.zoom, x0 = Camera.x, y0 = Camera.y;
    const sxs = x => (x - x0) * z, sys = y => (y - y0) * z;
    const night = 0.45 + 0.55 * (DayNight.darkness ? DayNight.darkness() : 0);
    const I = (0.55 + 0.45 * stageProgress()) * night * F;      // builds through the stage
    const lam = c.lam * TILE, v = c.v * TILE;
    const wave = d => { const s = (d + v * now) / lam; const q = 0.5 + 0.5 * Math.cos(s * Math.PI * 2); return q * q * q * q * q * q; };
    // The periodic surge: a bright ring running in from the edge of the map.
    const sp = (now % c.surge) / Math.min(c.surge, 3.2);
    const surgeR = sp < 1 ? L.rMax * 1.05 * (1 - sp * sp) : -1, surgeBand = Math.max(TILE * 4, L.rMax * 0.05);
    try { _liveSound(e, c, phase === 'stage4', wave(TILE * 4), _surgeNear(e), now, sp, F); } catch (_e) {}
    const spr = _liveSprite(c.rgb), hot = _liveSprite(c.hot);
    ctx.save();
    // The sky takes the station's colour: a wash over everything, brightest
    // toward the station (even with it off screen), swelling with each surge
    // and deepening as the stage goes on. Night carries it; by day it is a
    // tint.
    {
      const pxS = sxs(L.sx), pyS = sys(L.sy), prog = stageProgress();
      const pulse = sp < 1 ? Math.sin(sp * Math.PI) : 0;
      const k = (0.55 + 0.45 * prog) * (0.35 + 0.65 * night / 1) * (1 + 0.6 * pulse) * (c.amp > 1 ? 1.25 : 1) * F;
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = Math.min(0.9, 0.45 * k);
      ctx.fillStyle = `rgb(${c.rgb})`; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'screen';
      const R = Math.max(W, H) * 1.3 + Math.hypot(Math.max(0, -pxS, pxS - W), Math.max(0, -pyS, pyS - H)) * 0.6;
      const gr = ctx.createRadialGradient(pxS, pyS, 0, pxS, pyS, R);
      gr.addColorStop(0, `rgba(${c.hot},${Math.min(0.5, 0.26 * k)})`);
      gr.addColorStop(0.25, `rgba(${c.rgb},${Math.min(0.35, 0.14 * k)})`);
      gr.addColorStop(1, `rgba(${c.rgb},${Math.min(0.15, 0.045 * k)})`);
      ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'lighter';

    // The lines, chunk by chunk for what is on screen.
    const tw = TILE * z;
    if (tw >= 0.8) {
      const cx0 = Math.floor(x0 / TILE / CH) - 1, cy0 = Math.floor(y0 / TILE / CH) - 1;
      const cx1 = Math.floor((x0 + W / z) / TILE / CH) + 1, cy1 = Math.floor((y0 + H / z) / TILE / CH) + 1;
      let budget = 9000;
      for (let cy = cy0; cy <= cy1 && budget > 0; cy++) for (let cx = cx0; cx <= cx1 && budget > 0; cx++) {
        const a = L.chunks.get(cx + ',' + cy);
        if (!a) continue;
        const step = tw < 2.5 ? 3 : 1;   // far out, a third of the tiles carry the look
        for (let n = 0; n < a.length; n += step) {
          const w = L.wires[a[n]];
          const x = sxs(w.x), y = sys(w.y);
          if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
          let al = (0.07 + 0.75 * wave(w.d)) * I * c.amp;
          if (surgeR > 0) { const o = Math.abs(w.d - surgeR); if (o < surgeBand) al += (1 - o / surgeBand) * 1.2 * night * F; }
          if (al < 0.03) continue;
          budget--;
          const s = (w.big ? 3.4 : 1.9) * tw * step;
          ctx.globalAlpha = Math.min(1, al);
          ctx.drawImage(al > 0.6 ? hot : spr, x - s / 2, y - s / 2, s, s);
        }
      }
    }
    // Generators, throbbing as each wave is pulled through them.
    for (const gN of L.gens) {
      const x = sxs(gN.x), y = sys(gN.y), s = Math.max(6, gN.r * tw * 2.2);
      if (x < -s || y < -s || x > W + s || y > H + s) continue;
      ctx.globalAlpha = Math.min(1, (0.12 + 0.55 * wave(gN.d)) * I);
      ctx.drawImage(spr, x - s / 2, y - s / 2, s, s);
    }
    // The pillar on the spire, seen from anywhere in line with it.
    const px = sxs(L.sx), py = sys(L.sy);
    // Its size holds steady; only its brightness breathes, with the surges.
    const pw = Math.max(5, Math.min(W * 0.2, c.pill * tw));
    const breathe = 0.85 + 0.08 * Math.sin(now * 2.3) + 0.05 * Math.sin(now * 7.1) + (sp < 1 ? 0.35 * Math.sin(sp * Math.PI) : 0);
    if (px > -pw * 5 && px < W + pw * 5 && py > -pw * 2) {
      _drawBeam(ctx, c.rgb, c.hot, px, py, pw, (0.45 + 0.55 * night) * (0.75 + 0.25 * stageProgress()) * breathe * F, -H * 0.15);
      // the foot, where it leaves the spire
      if (py < H + pw * 6) {
        const b = pw * 5;
        ctx.globalAlpha = Math.min(1, (0.6 * night + 0.3) * breathe * F);
        ctx.drawImage(spr, px - b, py - b, b * 2, b * 2);
        ctx.drawImage(hot, px - b * 0.4, py - b * 0.4, b * 0.8, b * 0.8);
      }
    }
    // Arcs leaping from the station onto the lines around it.
    if (F > 0.6 && now >= L.nextArc && L.wires.length) {   // no arcs until it has mostly come up
      L.nextArc = now + c.arcGap[0] + Math.random() * (c.arcGap[1] - c.arcGap[0]);
      const near = L.wires.filter(w => w.d > TILE * 6 && w.d < TILE * (phase === 'stage4' ? 34 : 24));
      const tgt = near.length ? near[Math.floor(Math.random() * near.length)] : null;
      if (tgt) {
        L.arc = { tx: tgt.x, ty: tgt.y, until: now + 0.22, jag: now };
        const onScreen = px > -50 && px < W + 50 && py > -50 && py < H + 50;
        if (onScreen) _noise(0.12, Math.min(0.14, 0.05 + 0.05 * z), 2600, 6500, 0.03, 2.2);
      }
    }
    if (L.arc && now < L.arc.until) {
      const a = L.arc, n = 10, pts = [];
      for (let k = 0; k <= n; k++) {
        const f = k / n, j = k === 0 || k === n ? 0 : TILE * 1.6 * Math.sin(f * Math.PI);
        pts.push([L.sx + (a.tx - L.sx) * f + (Math.random() - 0.5) * j, L.sy + (a.ty - L.sy) * f + (Math.random() - 0.5) * j]);
      }
      for (const [lw, col, al] of [[Math.max(3, tw * 0.6), c.rgb, 0.4], [Math.max(1.2, tw * 0.16), '255,255,255', 0.95]]) {
        ctx.globalAlpha = al; ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = lw; ctx.lineJoin = 'round';
        ctx.beginPath(); pts.forEach(([x, y], k) => k ? ctx.lineTo(sxs(x), sys(y)) : ctx.moveTo(sxs(x), sys(y))); ctx.stroke();
      }
      const s = Math.max(10, tw * 5);
      ctx.globalAlpha = 0.8; ctx.drawImage(hot, sxs(a.tx) - s / 2, sys(a.ty) - s / 2, s, s);
    }
    ctx.restore();
  }

  // ═══ Victory ═════════════════════════════════════════════════════
  let V = null;

  function _startVictory() {
    phase = 'victory';
    doneDay = DayNight.day();
    const e = station();
    if (!e) { phase = 'complete'; return; }
    NotificationStack.dismissTag?.('meridian-stage');
    closeDossier();
    // The scene has the sound to itself: every ambience bed and machine hum
    // in the world fades out and holds until it ends (the scene's own voices
    // and its song are not held).
    try { PauseAudio.holdForScene?.(true); } catch (_e) {}
    const prevSpeed = DevMode.timeScale || 1;
    // Nightfall, so the lights coming on read across the whole map.
    DayNight.setMinute(21 * 60);
    DevMode.setTimeScale(0);

    // Every building on the map, nearest first — the wave lights them in order.
    const SKIP = new Set([T.WIRE, T.POLE, T.TREE, T.BUSH, T.WATER, T.ROAD, T.CONVEYOR, T.PIPE, T.UNDERGNDPIPE].filter(Boolean));
    // Everything radiates from the Hyperion Spire, the ring of light at the
    // station's heart (SX, SY of renderMeridianStation's 2560×1600 layout),
    // which sits up and left of the footprint's centre.
    const sx = (e.col + e.width * 1180 / 2560) * TILE, sy = (e.row + e.height * 640 / 1600) * TILE;
    let lights = [];
    for (const b of EntityRegistry.all()) {
      if (SKIP.has(b.type) || b === e) continue;
      const bx = (b.col + (b.width || 1) / 2) * TILE, by = (b.row + (b.height || 1) / 2) * TILE;
      lights.push({ x: bx, y: by, d: Math.hypot(bx - sx, by - sy), r: Math.max(1, Math.min(6, Math.sqrt((b.width || 1) * (b.height || 1)))), hue: Math.random() });
    }
    const builtAll = lights.length;                  // the card's count, before the thinning
    if (lights.length > 4000) { const k = lights.length / 4000; lights = lights.filter((_l, i) => i % Math.ceil(k) === 0); }
    const built = lights.length;
    lights.sort((a, b) => a.d - b.d);
    // The final shot: the camera pulls back as far as it goes, centred on
    // the station. Everything below is sized to what that shot shows.
    const zM = Math.max(Camera.ZOOM_MIN || 0.1, Math.min(innerWidth / (COLS * TILE), innerHeight / (ROWS * TILE)) * 1.15);
    const vw = innerWidth / zM / 2, vh = innerHeight / zM / 2;
    const fitStation = Math.min(innerWidth / (e.width * TILE), innerHeight / (e.height * TILE)) * 0.7;
    const zS = Math.min(1.4, Math.max(zM, fitStation));
    // The wave comes in two movements: it lights the player's city and holds
    // at its edge, then breaks out to the country. cityR is that edge: where
    // the player's buildings end (all but the last stragglers).
    const cityR = Math.max(30 * TILE, built ? lights[Math.floor((built - 1) * 0.97)].d * 1.06 : 0);
    // The rest of the country. Once the city is lit the shot pulls back far
    // past the map, to zFar (the real camera stops at zM; below that the
    // world is faded out and only this layer keeps shrinking), to show the
    // nation the station now powers: a landmass with the player's map at its
    // heart (the far shot centres on the map, which is a fifth of it across),
    // its towns as clusters of lights with farmsteads between them, and the
    // national lines joining the towns up. Then it comes back in on the
    // station (zF).
    const zFar = Math.min(zM, Math.max(zM * 0.02, Math.min(innerWidth / (COLS * TILE), innerHeight / (ROWS * TILE)) * 0.2)), zF = Math.max(zM, zS * 0.85);   // (never 0: a minimised window has no size)
    // zC frames the city for the first movement. It is usually past zM too,
    // so the city is seen whole, as its lights; it stops well short of zFar.
    const zC = Math.min(zS, Math.max(zFar * 3, Math.min(innerWidth, innerHeight) * 0.42 / cityR));
    const hx = innerWidth / zFar / 2, hy = innerHeight / zFar / 2;
    const ox = COLS * TILE / 2, oy = ROWS * TILE / 2;
    const inMap = (x, y) => x > 0 && y > 0 && x < COLS * TILE && y < ROWS * TILE;   // the player's own land: only what they built is lit
    let seed = 1337;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
    // The coast: the far shot's frame, pulled in by waves of several sizes
    // (broad ones for its overall shape, short ones for bays and headlands),
    // and never closer than twice the map's reach.
    const wob = [[2, 0.1], [3, 0.09], [4, 0.07], [5, 0.055], [7, 0.045], [9, 0.035], [13, 0.022], [17, 0.014]].map(([f, a]) => ({ f, a, p: rnd() * Math.PI * 2 }));
    const shore = th => Math.max(0.42, Math.min(1.02, wob.reduce((k, w) => k + w.a * Math.sin(th * w.f + w.p), 0.7)));
    const land = (th, rho) => ({ x: ox + Math.cos(th) * hx * 0.95 * rho, y: oy + Math.sin(th) * hy * 0.9 * rho });
    const coast = [];
    for (let i = 0; i < 300; i++) { const th = i / 300 * Math.PI * 2; coast.push(land(th, shore(th))); }
    const light = (x, y) => { if (!inMap(x, y)) lights.push({ x, y, d: Math.hypot(x - sx, y - sy), r: 0.8 + rnd() * 1.6, hue: rnd(), nation: true }); };
    // Islands off the coast, each with a few lights of its own.
    const isles = [];
    for (let i = 0; i < 8; i++) {
      const th = rnd() * Math.PI * 2, c = land(th, Math.min(1.1, shore(th) + 0.09 + rnd() * 0.14));
      const r = Math.min(hx, hy) * (0.025 + rnd() * 0.055), ph = rnd() * Math.PI * 2, pts = [];
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2, q = r * (0.75 + 0.25 * Math.sin(a * 2 + ph) + 0.13 * Math.sin(a * 5 + ph * 3));
        pts.push({ x: c.x + Math.cos(a) * q * 1.3, y: c.y + Math.sin(a) * q });
      }
      isles.push(pts);
      for (let k = 2 + Math.floor(rnd() * 9); k > 0; k--) light(c.x + gauss() * r * 0.4, c.y + gauss() * r * 0.3);
    }
    const towns = [];
    const town = reach => {
      const th = rnd() * Math.PI * 2, c = land(th, Math.sqrt(rnd()) * shore(th) * reach);
      const n = 12 + Math.floor(rnd() * 40), spread = Math.min(hx, hy) * (0.008 + rnd() * 0.02);
      if (inMap(c.x, c.y)) return;
      towns.push(c);
      for (let i = 0; i < n; i++) light(c.x + gauss() * spread, c.y + gauss() * spread);
    };
    for (let i = 0; i < 210; i++) town(0.93);
    for (let i = 0; i < 1900; i++) { const th = rnd() * Math.PI * 2, f = land(th, Math.sqrt(rnd()) * shore(th) * 0.96); light(f.x, f.y); }
    lights.sort((a, b) => a.d - b.d);
    // The national lines: a transmission tree from the station out through
    // the bigger towns. Each node hangs off the nearest one already on the
    // tree; `td` is its distance along the lines, which is the order they
    // energise in.
    const lines = [{ x: sx, y: sy, td: 0, p: -1 }];
    const todo = towns.filter((_t, i) => i % 3 === 0);
    while (todo.length) {
      let bi = 0, bj = 0, bd = Infinity;
      for (let i = 0; i < todo.length; i++) for (let j = 0; j < lines.length; j++) {
        const d = Math.hypot(todo[i].x - lines[j].x, todo[i].y - lines[j].y);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
      const t = todo.splice(bi, 1)[0], p = lines[bj];
      // A kink at the midpoint, so the lines read as routed, not ruled.
      const k = (rnd() - 0.5) * 0.24;
      lines.push({ x: t.x, y: t.y, p: bj, len: bd, td: p.td + bd, ph: rnd(),
                   mx: (p.x + t.x) / 2 - (t.y - p.y) * k, my: (p.y + t.y) / 2 + (t.x - p.x) * k });
    }
    const maxTd = lines.reduce((m, n) => Math.max(m, n.td), 1);
    const maxLd = lines.reduce((m, n) => Math.max(m, Math.hypot(n.x - sx, n.y - sy)), 1);

    const root = document.createElement('div');
    root.id = 'np-victory';
    root.innerHTML = `
      <canvas class="npv-fx"></canvas>
      <div class="npv-bar npv-top"></div><div class="npv-bar npv-bot"></div>
      <div class="npv-cap"></div>
      <div class="npv-count"></div>
      <div class="npv-journey"><b></b><em></em><span></span></div>
      <div class="npv-say"><i></i><b></b></div>
      <div class="npv-title"><i>${_esc(_city()).toUpperCase()} · DAY ${doneDay}</i><b>OPERATION HYPERION</b><em>COMPLETE</em></div>
      <div class="npv-skip"><span>${window.GW_MOBILE ? "HOLD SCREEN TO SKIP" : "HOLD ESC TO SKIP"}</span><i></i></div>
      <div class="npv-card">
        <div class="npv-eyebrow">OPERATION HYPERION · ${_esc(_city()).toUpperCase()}</div>
        <div class="npv-big">GRID COMPLETE</div>
        <div class="npv-sub">${_esc(_city())} powers the nation</div>
        <div class="npv-text">Hyperion Station is online. From tonight, every home, hospital and factory in the country runs on power generated by <b>${_esc(_co())}</b>. You started with a handful of generators beside a town hall.</div>
        <div class="npv-stats"></div>
        <div class="npv-thanks">
          <div class="npv-logo"></div>
          <div class="npv-ty">Thank you for playing GRIDWORKS</div>
          <div class="npv-more">The story is told, but the grid is still yours. Your city keeps growing, so keep building, keep expanding, and see how far ${_esc(_co())} can go.</div>
        </div>
        <button class="npv-go">CONTINUE BUILDING</button>
      </div>`;
    // The GRIDWORKS logo, cloned from the main menu so there's one copy of
    // the art. Its bolt gradient is looked up by id, so the clone gets its own.
    {
      const at = root.querySelector('.npv-logo');
      const em = document.querySelector('#main-menu .gw-emblem'), word = document.querySelector('#main-menu .menu-logo-title');
      if (em) {
        const c = em.cloneNode(true), grad = c.querySelector('#gwBoltGrad');
        if (grad) { grad.id = 'npvBoltGrad'; c.querySelector('.gw-bolt')?.style.setProperty('fill', 'url(#npvBoltGrad)'); }
        at.appendChild(c);
      }
      if (word) at.appendChild(word.cloneNode(true));
      if (!at.children.length) at.remove();
    }
    document.body.appendChild(root);
    document.body.classList.add('np-victory');
    const fx = root.querySelector('.npv-fx'), g = fx.getContext('2d');
    const resize = () => { const dpr = window.devicePixelRatio || 1; fx.width = innerWidth * dpr; fx.height = innerHeight * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();

    const z0 = Camera.zoom;
    const from = { x: Camera.x + innerWidth / z0 / 2, y: Camera.y + innerHeight / z0 / 2 };

    // The road there, told over the song's last verse: where it started
    // (City Hall, then a starter generator or failing that the nearest home),
    // what it grew into (the biggest business, then the biggest factory),
    // what powers it now (the biggest reactor), and only then the station. The stops share
    // T_STATION seconds; each has a line or two of the story.
    const mid = b => ({ x: (b.col + (b.width || 1) / 2) * TILE, y: (b.row + (b.height || 1) / 2) * TILE });
    const fit = (b, k) => Math.max(zM, Math.min(1.3, Math.min(innerWidth / ((b.width || 1) * TILE), innerHeight / ((b.height || 1) * TILE)) * k));
    const first = t => { for (const b of EntityRegistry.getByType(t)) return b; return null; };
    const near = (t, o) => { let best = null, bd = Infinity; for (const b of EntityRegistry.getByType(t)) { const m = mid(b), d = Math.hypot(m.x - o.x, m.y - o.y); if (d < bd) { bd = d; best = b; } } return best; };
    const hall  = typeof GovernmentSystem !== 'undefined' && GovernmentSystem.getGovEntity ? GovernmentSystem.getGovEntity() : null;
    const gen0  = hall && T.BIOFUELGEN ? near(T.BIOFUELGEN, mid(hall)) : null;
    const home0 = hall && !gen0 ? near(T.HOUSE, mid(hall)) : null;
    const fusion = [T.ADVFUSIONREACTOR, T.HULKINGFUSIONREACTOR].filter(Boolean).map(first).find(Boolean) || null;
    const plant = fusion || [T.ADVREACTOR, T.NUCLEARREACTOR].filter(Boolean).map(first).find(Boolean) || null;
    // The biggest shop and the biggest factory the city has grown, and how
    // many of each there are.
    const count = {}, biggest = {};
    for (const t of [T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL]) {
      count[t] = 0;
      for (const b of EntityRegistry.getByType(t)) {
        if (!b.fromRequest) continue;
        count[t]++;
        if (!biggest[t] || (b.width || 1) * (b.height || 1) > (biggest[t].width || 1) * (biggest[t].height || 1)) biggest[t] = b;
      }
    }
    const shop = biggest[T.COMMERCIAL], works = biggest[T.INDUSTRIAL];
    const tally = [[count[T.HOUSE], 'HOMES'], [count[T.COMMERCIAL], 'BUSINESSES'], [count[T.INDUSTRIAL], 'FACTORIES']]
      .filter(([n]) => n > 1).map(([n, w]) => `${n.toLocaleString('en-US')} ${w}`).join(' · ');
    const CITY = _city().toUpperCase(), CO = _co().toUpperCase();
    const genNow = PowerNetwork.stats.totalGenerated >= 100 ? _mw(Math.round(PowerNetwork.stats.totalGenerated)) : '';
    const stops = [
      hall  && { ...mid(hall),  z: fit(hall, 0.3),   caps: [`DAY 1 · ${CITY}`, 'A HANDFUL OF GENERATORS BESIDE A TOWN HALL'] },
      gen0  && { ...mid(gen0),  z: fit(gen0, 0.12),  caps: ['A FEW KILOWATTS · A FEW LIT WINDOWS', 'EVERY NEW HOUSE WAS A PROBLEM TO SOLVE'] },
      home0 && { ...mid(home0), z: fit(home0, 0.12), caps: ['THE FIRST CUSTOMERS WERE NEIGHBOURS', 'EVERY NEW HOUSE WAS A PROBLEM TO SOLVE'] },
      shop  && { ...mid(shop),  z: fit(shop, 0.3),   caps: ['THEN CAME THE SHOPFRONTS AND THE OFFICES', 'ALL OF THEM EXPECTING THE LIGHTS TO STAY ON'] },
      works && { ...mid(works), z: fit(works, 0.3),  caps: ['THEN THE FACTORIES · HUNGRIER THAN A WHOLE TOWN', tally || 'STREET BY STREET · SUBSTATION BY SUBSTATION'] },
      plant && { ...mid(plant), z: fit(plant, 0.4),  caps: ['SMOKESTACKS GAVE WAY TO REACTORS', fusion ? `THEN ${CO} LIT A STAR` : `DAY ${doneDay} · ${genNow ? genNow + ' FROM ' : ''}${CO}`] },
    ].filter(Boolean);
    stops.forEach((s, i) => { s.t = i * T_STATION / stops.length; });
    stops.push({ x: sx, y: sy, z: zS, t: stops.length ? T_STATION : 0, hold: T_DARK,
                 caps: [`DAY ${doneDay} · HYPERION STATION`, 'SYNCHRONISING WITH THE NATIONAL GRID'] });

    V = { e, root, fx, g, resize, lights, lines, maxTd, maxLd, coast, isles, hx, ox, oy, pan: 0, built, builtAll, sx, sy, cityR, clock: 0, last: 0, prevSpeed, z0, from,
          stops, zS, zC, zM, zFar, zF, vz: 1, pingAt: 0, stage: 'fly', count: -1, lit: 0, skipAt: -1, cardShown: false, cardAt: 0, tiles: [], raf: 0,
          song: null, songUrl: null, hum: [], songOn: false, songLoaded: false, pre: 0, vol: 0, caps: {}, journey: [], jIdx: -1, jDur: 3, };
    V.journey = _journey();
    V.jDur = Math.max(2.2, Math.min(4.4, (W_BACK - 1.6 - W_STATS) / Math.max(1, V.journey.length)));
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', _vKey, true);
    window.addEventListener('keyup', _vKeyUp, true);
    root.querySelector('.npv-go').addEventListener('click', _endVictory);

    FW.rockets.length = 0; FW.stars.length = 0; FW.smoke.length = 0; FW.flare = 0; FW.sites = null; FW.next = 0;
    try { MusicSystem.stop?.(); } catch (_e) {}
    _vSong();
    _loadPops();
    _loadHum();
    V.raf = requestAnimationFrame(_vFrame);
  }

  // The song is joined SONG_AT seconds in, and the sequence waits (briefly)
  // for it: every beat below is cut to it. Loaded as a blob so the seek
  // works whatever the server makes of range requests.
  function _vSong() {
    const v = V, a = new Audio();
    a._gwExempt = true;                                  // not held with the world's sound (PauseAudio)
    a.preload = 'auto'; a.volume = 0;
    v.song = a;
    v.vol = Math.min(1, 0.5 * (typeof MusicSystem !== 'undefined' && MusicSystem.getVolume ? MusicSystem.getVolume() : 1));
    a.addEventListener('loadedmetadata', () => { if (V === v) v.songLoaded = true; }, { once: true });   // _vFrame starts it, after the title
    fetch(VICTORY_SONG).then(r => r.ok ? r.blob() : Promise.reject(new Error('song')))
      .then(b => { if (V !== v) return; v.songUrl = URL.createObjectURL(b); a.src = v.songUrl; })
      .catch(() => { if (V === v) a.src = VICTORY_SONG; });
  }

  // The journey, read out one figure at a time once the country is lit.
  function _journey() {
    const n = v => Math.round(v).toLocaleString('en-US');
    const one = v => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    let pop = 0;
    for (const t of [T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL]) for (const b of EntityRegistry.getByType(t)) if (b.fromRequest) pop += (b._population || 0);
    const hours   = typeof PlayTime !== 'undefined' && PlayTime.getSeconds ? PlayTime.getSeconds() / 3600 : 0;
    const pellets = _dhe3() + (typeof HulkingFusionReactorSystem !== 'undefined' ? HulkingFusionReactorSystem.getTotalPelletsBurned() : 0);
    const ach     = typeof AchievementsSystem !== 'undefined' && AchievementsSystem.count ? AchievementsSystem.count() : 0;
    return [
      { v: doneDay,   fmt: n,   unit: doneDay === 1 ? 'DAY' : 'DAYS', sub: 'from the first generator to the national grid' },
      { v: hours,     fmt: one, unit: 'HOURS',          sub: 'at the controls',             min: 0.1 },
      { v: pop,       fmt: n,   unit: 'PEOPLE',         sub: `call ${_city()} home` },
      { v: V.builtAll, fmt: n,  unit: 'STRUCTURES',     sub: `powered by ${_co()}` },
      { v: (PowerNetwork.stats.totalGenerated || 0) / 1000, fmt: one, unit: 'MEGAWATTS', sub: 'on the grid tonight', min: 0.1 },
      { v: pellets,   fmt: n,   unit: 'FUSION PELLETS', sub: 'burned to get here' },
      { v: exported,  fmt: n,   unit: 'MEGAWATT-HOURS', sub: 'already sent to the nation' },
      { v: ach,       fmt: n,   unit: 'ACHIEVEMENTS',   sub: 'earned along the way' },
    ].filter(s => s.v >= (s.min || 1)).slice(0, 6);
  }

  // Glow sprites for the victory lights — thousands of them a frame, so one
  // drawImage each rather than a fresh radial gradient.
  const _spr = (() => {
    const make = col => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(0.35, `rgba(${col},0.65)`); gr.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      return c;
    };
    return { warm: make('255,214,130'), cool: make('140,220,255'), rose: make('255,140,190'), mint: make('150,255,200') };
  })();
  const ease = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  const easeOut = u => 1 - Math.pow(1 - u, 3);
  const clamp01 = u => Math.max(0, Math.min(1, u));
  // Timeline (real seconds), cut to the song and written in the song's own
  // time. It is joined at 3:05, for the verse before its last chorus (the
  // road there). The music drops away at 3:56.2 as the camera reaches the
  // station, the countdown runs through the breakdown, the song falls silent
  // at 4:17.2 (the map goes dark), knocks twice, and comes back in full at
  // 4:22.3: that is the interconnect closing. The outro starts at 5:04.6 and
  // the card arrives a quarter of a minute into it, two and a quarter
  // minutes after the start; the song has 23s left to play out under it.
  const T_TITLE = 8;                                  // OPERATION HYPERION COMPLETE, before any of it
  const T_GAP = 2;                                    // then silence, its sound gone, before the scene
  const SONG_AT = 185;
  const T_STATION = 236.2 - SONG_AT, T_COUNT = 247.2 - SONG_AT, T_DARK = 257.2 - SONG_AT,
        T_HIT1 = 261.35 - SONG_AT, T_HIT2 = 261.8 - SONG_AT, T_CONNECT = 262.3 - SONG_AT, T_CARD = 321.3 - SONG_AT;
  const CAP_GAP = 4.6;                                // between a stop's lines (a caption runs 4.6s)
  // After the interconnect closes: the city is lit by W_CITY, the front holds
  // at its edge and breaks out to the country at W_BREAK, crossing it in
  // W_NATION while the shot pulls back for W_OUT seconds. The journey's
  // figures run over that from W_STATS. At W_BACK the shot comes back in on
  // the station (W_IN seconds), and the fireworks start once it is there.
  const W_CITY = 10, W_BREAK = 15, W_NATION = 19, W_OUT = 23, W_STATS = 20.2, W_BACK = 47, W_IN = 6.5, W_FIREWORKS = W_BACK + W_IN;
  // The shot's scale from the interconnect on. Zooms are eased in log space
  // (an even rate of pull-back), and the way out never reverses: the front
  // is paced against it.
  const zLerp = (a, b, u) => a * Math.pow(b / a, u);
  const smooth = u => u * u * (3 - 2 * u);
  const _vZoomOut = wt => wt < W_BREAK ? zLerp(V.zS * 1.1, V.zC, ease(clamp01((wt - 0.4) / 7)))
                                       : zLerp(V.zC, V.zFar, smooth(clamp01((wt - W_BREAK) / W_OUT)));
  const _vZoom = wt => wt < W_BACK ? _vZoomOut(wt) : zLerp(V.zFar, V.zF, ease(clamp01((wt - W_BACK) / W_IN)));

  // A statement, centre screen: a quiet first line (step 1), then the line it
  // sets up (step 2); step 0 clears it.
  function _say(step, l1, l2) {
    const el = V.root.querySelector('.npv-say');
    if (step === 1) { el.firstChild.textContent = l1; el.lastChild.textContent = l2; }
    el.classList.toggle('a', step >= 1); el.classList.toggle('b', step >= 2);
  }

  function _cap(text, dur = 4.6) {
    const el = V.root.querySelector('.npv-cap');
    el.classList.remove('in'); void el.offsetWidth;
    el.style.animationDuration = dur + 's';
    el.textContent = text; el.classList.add('in');
  }

  // Camera: each stop is cut to through a dip to black, then pushed in on
  // slowly until the next; the station is held through the countdown. (It
  // used to fly between them, but crossing the map at speed means drawing
  // terrain nothing has cached, and the flight ran at a few frames a
  // second.) Once the interconnect closes it follows _vZoom.
  const CUT_OUT = 0.4, CUT_HOLD = 0.5, CUT_IN = 0.6, CUT_AT = 0.45;
  function _vCamera(c) {
    const W = innerWidth, H = innerHeight;
    if (c >= T_CONNECT) {
      // The real camera follows the shot as far out as it can go (zM); past
      // that V.vz is how much smaller than the world this layer is drawn.
      const zE = _vZoom(c - T_CONNECT);
      Camera.setZoom(Math.max(V.zM, zE));
      Camera.jumpTo(V.sx, V.sy);
      V.vz = Math.min(1, zE / Camera.zoom);
      // Out there the shot drifts off the station to centre on the country.
      V.pan = zE < V.zM && V.zFar < V.zM ? smooth(clamp01(Math.log(V.zM / zE) / Math.log(V.zM / V.zFar))) : 0;
      return;
    }
    // Cut to the latest stop whose dip to black has closed; until the first
    // one has, the view is still the player's own.
    let k = -1;
    while (k + 1 < V.stops.length && V.stops[k + 1].t + CUT_AT <= c) k++;
    if (k < 0) return;
    const s = V.stops[k], until = s.hold || V.stops[k + 1].t + CUT_AT;
    Camera.setZoom(s.z * (1 + 0.1 * clamp01((c - s.t - CUT_AT) / Math.max(0.01, until - s.t - CUT_AT))));
    Camera.jumpTo(s.x, s.y);
  }
  // How black the picture is at c: it dips out as each stop's turn comes,
  // holds while the camera cuts (the one heavy frame, drawing a part of the
  // map that wasn't on screen, goes by unseen), and comes back up.
  function _vCut(c) {
    for (const s of V.stops) {
      const d = c - s.t;
      if (d >= 0 && d < CUT_OUT + CUT_HOLD + CUT_IN) return d < CUT_OUT ? d / CUT_OUT : d < CUT_OUT + CUT_HOLD ? 1 : 1 - (d - CUT_OUT - CUT_HOLD) / CUT_IN;
    }
    return 0;
  }

  function _vFrame(now) {
    if (!V) return;
    V.raf = requestAnimationFrame(_vFrame);
    if (DevMode.timeScale !== 0) DevMode.setTimeScale(0);
    const dt = V.last ? Math.min(0.05, (now - V.last) / 1000) : 0, s = V.song;
    V.last = now;
    // The title first, over the player's own view as it dims, with nothing
    // else moving: OPERATION HYPERION COMPLETE. Its sound has died away
    // completely by the time it goes, then T_GAP of silence; the bars, the
    // scene's clock and the song start after that (or a moment later if the
    // song is still loading).
    if (V.pre < T_TITLE + T_GAP || (!V.songOn && !V.songLoaded && V.pre < T_TITLE + T_GAP + 2)) {
      const el = V.root.querySelector('.npv-title');
      if (!V.pre) {
        el.style.animationDuration = T_TITLE + 's'; el.classList.add('in');
        // The title lands on a deep hit, and a low string chord swells
        // under it (the song hasn't come in yet, so it can be tuned). The
        // chord fades out over its last 2.5 s and is gone half a second
        // before the title, leaving the hall's tail to die in the gap.
        _impact(0.45, 1.4);
        _pad([36.7, 55, 73.4, 110, 146.8, 220], T_TITLE - 0.5, 0.028, 1.8, 2.5);
        _shimmer(T_TITLE - 1.6, 0.03, 0.6);
      }
      V.pre += dt || 0.001;
      const su = V.skipAt < 0 ? 0 : clamp01((now - V.skipAt) / 900);
      V.root.querySelector('.npv-skip i').style.transform = `scaleX(${su})`;
      if (su >= 1) { V.pre = T_TITLE + 9; V.clock = T_CARD; el.classList.remove('in'); }       // skipped: the card, next frame
      _vDraw(0);
      return;
    }
    V.root.classList.add('go');                          // the title has gone: the bars close in and the scene starts
    if (!V.songOn && V.songLoaded && s) {
      try { s.currentTime = SONG_AT + V.clock; } catch (_e) {}
      s.play().catch(() => {});
      V.songOn = true;
    }
    V.clock += dt;
    // The song keeps the time: if a frame hitch (or a hidden window) lets the
    // picture slip, it catches up to the music rather than the other way round.
    if (s && V.songOn && !V.cardShown) {
      if (!s.paused) { const a = s.currentTime - SONG_AT; if (a > 0 && Math.abs(a - V.clock) > 0.12) V.clock = a; }
      s.volume = V.vol * clamp01(0.05 + V.clock / 2.5);
    }
    const c = V.clock, q = sel => V.root.querySelector(sel);

    _vCamera(c);

    // The road there, then the station: a rush of air as the camera leaves
    // for each stop, then its lines, one after another.
    V.stops.forEach((st, i) => {
      if (c >= st.t && !V.caps['w' + i]) { V.caps['w' + i] = 1; if (c < st.t + 1 && (i || st.t)) _noise(3, 0.1, 260, 1500, 0.55, 0.7); }
    });
    V.stops.forEach((st, i) => st.caps.forEach((line, j) => {
      const at = st.t + 1 + j * CAP_GAP, key = 's' + i + '_' + j;
      if (c > at && !V.caps[key]) { V.caps[key] = 1; if (c < at + 2 && c < T_COUNT) _cap(line); }
    }));
    if (c >= T_COUNT && c < T_DARK) {
      const k = Math.floor(c - T_COUNT), left = Math.round(T_DARK - T_COUNT) - k;
      if (k !== V.count) {
        V.count = k;
        const el = q('.npv-count');
        el.textContent = String(left);
        el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
        // A heavy clock for each second, over one riser that runs the whole
        // count and stops dead as the map goes dark.
        if (k === 0) _riser(T_DARK - c, 0.075);
        _tock(0.16 + 0.03 * k);
        Camera.shake?.(2 + k * 1.2);
      }
    }
    // The song falls silent: so does the map.
    if (c >= T_DARK && !V.caps.d) {
      V.caps.d = 1; q('.npv-count').classList.remove('in');
      q('.npv-cap').classList.remove('in');
    }
    // The game's motto, said in the dark before the interconnect closes, and
    // its answer as the light comes back.
    const say = (key, at, until, step, l1, l2) => { if (c >= at && !V.caps[key]) { V.caps[key] = 1; if (c < until) _say(step, l1, l2); } };
    say('y1', T_DARK + 0.5, T_CONNECT - 1, 1, 'WE TOLD YOU FROM THE START', 'THE GRID MUST GROW...');
    say('y2', T_DARK + 1.9, T_CONNECT - 1, 2);
    say('y3', T_CONNECT - 0.15, Infinity, 0);
    say('y4', T_CONNECT + 0.8, T_CONNECT + 4, 1, '', 'AND YOU DID NOT DISAPPOINT.');
    say('y5', T_CONNECT + 0.8, T_CONNECT + 4, 2);
    say('y6', T_CONNECT + 5.2, Infinity, 0);
    // The breakers: two heavy contacts, on the song's two knocks.
    const knock = v => _clank(v);
    if (c >= T_HIT1 && !V.caps.h1) { V.caps.h1 = 1; if (c < T_CONNECT) { Camera.shake?.(10); knock(0.3); } }
    if (c >= T_HIT2 && !V.caps.h2) { V.caps.h2 = 1; if (c < T_CONNECT) { Camera.shake?.(14); knock(0.38); } }
    if (c >= T_CONNECT && V.stage !== 'wave') {
      V.stage = 'wave';
      q('.npv-count').classList.remove('in');
      if (c < T_CONNECT + 3) {
        Camera.shake?.(34);
        // The interconnect closing: the biggest hit in the game, the crack of
        // the arc across the contacts, a crackle of current, and the wave
        // leaving across the country.
        _impact(1, 2);
        try { SFX.lightningStrike?.(0.28); } catch (_e) {}
        for (let i = 0; i < 9; i++) _noise(0.03 + 0.08 * Math.random(), 0.1 + 0.12 * Math.random(), 2500 + 5000 * Math.random(), 1400, 0.05, 0.7, 0.05 + i * 0.09 + Math.random() * 0.05);
        _noise(4, 0.12, 500, 7000, 0.6, 0.6);
        _shimmer(5, 0.05, 0.4);
      }
    }
    const wt = c - T_CONNECT;
    // What has happened is only named once the answer has been given.
    if (wt > 5.4 && !V.caps.ic) { V.caps.ic = 1; if (wt < 8) _cap('INTERCONNECT CLOSED', 4.4); }
    if (wt > W_CITY + 0.1 && wt < W_BREAK && !V.caps.c) { V.caps.c = 1; _cap('OPERATION HYPERION COMPLETE', 4.7); }
    if (wt >= W_BREAK && !V.caps.e) {
      V.caps.e = 1;
      if (wt < W_BREAK + 3) {
        _cap(`${_city().toUpperCase()} IS POWERING THE NATION`, 5); Camera.shake?.(20);
        _impact(0.6, 1.5);
        _noise(7, 0.1, 220, 2600, 0.5, 0.5);                                    // the long pull-back
        _shimmer(6, 0.04, 0.3);
      }
    }
    if (wt >= W_BACK && !V.caps.g) { V.caps.g = 1; if (wt < W_BACK + 2) _noise(W_IN, 0.1, 2600, 180, 0.45, 0.5); }   // and back in
    if (wt > W_BACK - 1.3 && !V.caps.f) { V.caps.f = 1; if (wt < W_BACK + 2) _cap(`${_co().toUpperCase()} · ONE NATION · ONE GRID`, 6.5); }
    // Lights coming on, as relays clicking over across the city (V.lit is
    // last frame's count): untuned, so they sit under the song.
    if (wt > 0 && wt < W_BACK && V.lit > (V.litHeard || 0) && c > V.pingAt) {
      V.pingAt = c + (wt < W_BREAK ? 0.06 : 0.14);
      _relay(wt < W_BREAK ? 0.05 : 0.028);
    }
    V.litHeard = V.lit;

    // The journey, one figure at a time, each counting up as it lands.
    if (wt >= W_STATS && !V.cardShown) {
      const i = Math.floor((wt - W_STATS) / V.jDur), j = V.journey[i], el = q('.npv-journey');
      if (i !== V.jIdx) {
        V.jIdx = i;
        el.classList.remove('in');
        if (j) {
          q('.npv-cap').classList.remove('in');
          void el.offsetWidth;
          el.style.setProperty('--d', V.jDur + 's');
          el.querySelector('em').textContent = j.unit;
          el.querySelector('span').textContent = j.sub;
          el.classList.add('in');
          _impact(0.13, 0.6); _shimmer(1.6, 0.025);                             // each figure lands
        }
      }
      if (j) el.querySelector('b').textContent = j.fmt(j.v * easeOut(clamp01((wt - W_STATS - i * V.jDur) / 1.3)));
    }
    if (c > T_CARD && !V.cardShown) _showCard();
    if (V.cardShown) {
      const tc = c - V.cardAt;
      V.tiles.forEach((t, i) => {
        const u = (tc - 1 - i * 0.4) / 1.1;
        if (u < 0) return;
        if (!t.on) { t.on = true; t.el.classList.add('in'); }
        if (!t.done) { t.el.lastChild.textContent = t.fmt(t.v * easeOut(clamp01(u))); t.done = u >= 1; }
      });
    }

    // Skip: straight to the card, and the song to its outro with it.
    const su = V.skipAt < 0 ? 0 : clamp01((now - V.skipAt) / 900);
    q('.npv-skip i').style.transform = `scaleX(${su})`;
    if (su >= 1 && !V.cardShown) {
      V.clock = Math.max(V.clock, T_CARD);
      if (s && V.songOn) { try { s.currentTime = SONG_AT + V.clock; s.volume = V.vol; } catch (_e) {} }
      _showCard();
    }

    _vHum(V.clock);
    // Fireworks, from the last shot on: the camera is back on the station.
    {
      const fwt = V.clock - T_CONNECT, z = Camera.zoom, x0 = Camera.x, y0 = Camera.y;
      _fwStep(dt, x0, y0, x0 + innerWidth / z, y0 + innerHeight / z, fwt >= W_FIREWORKS ? (V.cardShown ? [0.5, 1.2] : [0.22, 0.55]) : null, V.cardShown ? 0.45 : 1);
    }
    _vDraw(V.clock);
  }

  // ═══ Fireworks ═══════════════════════════════════════════════════
  // In the world, not on the lens: a rocket leaves a launch site (one of the
  // city's own buildings), climbs up the screen on a trail of sparks, and
  // bursts into a shell of stars that hang, droop and burn out. They start
  // in the finale's last shot and go on over the city for FW_HOURS in-game
  // hours after the player has gone back to it, wherever they look.
  //
  // All positions are world pixels; "up" is up the screen. The finale draws
  // them on its own canvas (_vDraw), the game on the world's (renderFireworks).
  const FW_HOURS = 2;
  const FW_COLS = ['255,214,130', '255,96,80', '120,255,150', '110,190,255', '200,130,255', '255,255,255', '255,130,200', '255,160,60'];
  const FW_GOLD = 0, FW_WHITE = 5;
  let _fwSprites = null;
  const FW = { rockets: [], stars: [], smoke: [], sites: null, next: 0, until: 0, last: 0, flare: 0, flareCol: 0 };

  function _fwSprite(i) {
    if (!_fwSprites) _fwSprites = FW_COLS.map(col => {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.16, `rgba(${col},1)`); gr.addColorStop(0.5, `rgba(${col},0.5)`); gr.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
      return c;
    });
    return _fwSprites[i];
  }
  // Launch sites: the city's own buildings, and the station's four corners.
  function _fwSites() {
    if (FW.sites) return FW.sites;
    const out = [];
    for (const t of [T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL]) for (const e of EntityRegistry.getByType(t)) {
      if (e.fromRequest) out.push({ x: (e.col + (e.width || 1) / 2) * TILE, y: (e.row + (e.height || 1) / 2) * TILE });
    }
    const s = station();
    if (s) for (const [dx, dy] of [[0.08, 0.1], [0.92, 0.1], [0.08, 0.92], [0.92, 0.92], [0.5, 0.96], [0.3, 0.04], [0.7, 0.04]]) {
      out.push({ x: (s.col + s.width * dx) * TILE, y: (s.row + s.height * dy) * TILE, station: true });
    }
    // ...and the company's headquarters, from its forecourt and its roofs.
    for (const h of EntityRegistry.getByType(T.COMPANYHQ)) for (const dy of [0.36, 0.56, 0.76, 0.95]) for (const dx of [0.06, 0.22, 0.38, 0.62, 0.78, 0.94]) {
      out.push({ x: (h.col + h.width * dx) * TILE, y: (h.row + h.height * dy) * TILE, hq: true });
    }
    return (FW.sites = out);
  }
  // Send one up from somewhere in view (x0..x1, y0..y1, world px) that will
  // burst in view too. With no building in view to launch from, from the
  // ground along the bottom of the shot.
  // `hqOnly`: the headquarters' own show (its unveiling, and the hours after
  // it). Every rocket goes up from the headquarters itself, wherever the
  // player is looking, and none from the rest of the city.
  function _fwLaunch(x0, y0, x1, y1, hqOnly) {
    // They are up in the sky, nearer the eye than the ground is, so they
    // don't shrink with the map: `big` scales a shell for the zoom it is
    // launched at, to about the same size on screen however far out.
    const big = 0.8 / Math.max(0.3, Math.min(1.2, Camera.zoom));
    const rise = TILE * (7 + Math.random() * 6) * (0.6 + 0.4 * big), top = y0 + rise + TILE * 2;
    const inView = hqOnly ? _fwSites().filter(s => s.hq)
                          : _fwSites().filter(s => s.x > x0 + TILE && s.x < x1 - TILE && s.y > top && s.y < y1 + rise * 0.3);
    let site = inView.length ? inView[Math.floor(Math.random() * inView.length)] : null;
    if (!site && hqOnly) return;
    if (!site) {
      if (y1 - top < TILE) return;                                    // shot too tight to fit one
      site = { x: x0 + (x1 - x0) * (0.1 + 0.8 * Math.random()), y: top + (y1 - top) * (0.45 + 0.55 * Math.random()) };
    }
    const kind = FW_KINDS[Math.floor(Math.random() * FW_KINDS.length)];
    const c1 = kind === 'willow' || kind === 'kamuro' ? FW_GOLD : Math.floor(Math.random() * FW_COLS.length);
    let c2 = Math.floor(Math.random() * FW_COLS.length); if (c2 === c1) c2 = (c2 + 3) % FW_COLS.length;
    FW.rockets.push({ x0: site.x, y0: site.y, x: site.x, y: site.y, tx: site.x + (Math.random() - 0.5) * TILE * 3, ty: site.y - rise,
                      t: 0, dur: 0.9 + Math.random() * 0.5, ph: Math.random() * 6.283, kind, c1, c2, big,
                      whistle: Math.random() < 0.35 });
  }
  // A shell's pattern. Each opens from where its rocket stopped:
  //   peony         a sphere of stars, turning to a second colour as they burn
  //   chrysanthemum the same with long comet tails
  //   double        a small inner sphere inside a bigger one, two colours
  //   ring          a ring, tilted at random so it reads as a hoop in the sky
  //   willow        gold glitter that hangs and droops a long way
  //   kamuro        a dense gold brocade crown, the slowest to fade
  //   palm          a few thick comets that arc over like fronds
  //   crossette     stars that each split into four partway out
  //   strobe        white stars that flash on and off before they go
  //   crackle       stars that pop into white sparks as they die
  //   multibreak    one burst, then a ring of small shells bursting round it
  //   heart         a heart in red and pink
  const FW_KINDS = ['peony', 'peony', 'chrysanthemum', 'chrysanthemum', 'double', 'ring', 'willow', 'kamuro',
                    'palm', 'crossette', 'strobe', 'crackle', 'multibreak', 'heart'];
  const FW_CAP = 3200;
  function _fwBurst(r, vol) {
    const S = TILE * (5 + Math.random() * 2.5) * (r.big || 1) * (r.small ? 0.45 : 1);   // how fast the shell opens, world px/s
    const room = () => FW.stars.length < FW_CAP;
    const star = (ang, sp, c, max, extra) => { if (room()) FW.stars.push({ x: r.x, y: r.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0, max, c, tw: Math.random() * 6.283, big: r.big, ...extra }); };
    const life = () => 1.3 + Math.random() * 0.7;
    const k = r.kind;
    if (k === 'ring') {
      // A hoop seen at an angle: squash one axis and turn it.
      const n = 54, sq = 0.25 + Math.random() * 0.75, rot = Math.random() * 3.1416, cr = Math.cos(rot), sr = Math.sin(rot);
      for (let i = 0; i < n; i++) {
        const a = i / n * 6.283, ux = Math.cos(a), uy = Math.sin(a) * sq;
        const vx = (ux * cr - uy * sr) * S * 0.9, vy = (ux * sr + uy * cr) * S * 0.9;
        if (room()) FW.stars.push({ x: r.x, y: r.y, vx, vy, life: 0, max: life(), c: i % 2 ? r.c1 : r.c2, tw: Math.random() * 6.283, big: r.big });
      }
      star(0, 0, FW_WHITE, 0.6, { glit: true });   // a pip at the centre
    } else if (k === 'willow' || k === 'kamuro') {
      const n = k === 'kamuro' ? 110 : 80;
      for (let i = 0; i < n; i++) star(Math.random() * 6.283, S * (k === 'kamuro' ? 0.8 : 0.7) * (0.4 + 0.6 * Math.sqrt(Math.random())), FW_GOLD,
                                       (k === 'kamuro' ? 3 : 2.3) + Math.random() * 0.9, { g: k === 'kamuro' ? 1.6 : 2.2, tail: 0.32, drag: k === 'kamuro' ? 1.6 : 1.3, glit: true });
    } else if (k === 'palm') {
      const n = 7 + Math.floor(Math.random() * 3), a0 = Math.random() * 6.283;
      for (let i = 0; i < n; i++) star(a0 + i / n * 6.283, S * 1.05, r.c1, 1.9 + Math.random() * 0.4, { comet: true, tail: 0.42, g: 1.9, drag: 1.1, glit: true, fat: 1.9 });
      star(0, 0, r.c2, 0.5, { fat: 2.4 });
    } else if (k === 'crossette') {
      const n = 14;
      for (let i = 0; i < n; i++) star(i / n * 6.283 + Math.random() * 0.2, S * 0.75, r.c1, 0.75 + Math.random() * 0.15, { split: true, c2: r.c2, tail: 0.18 });
    } else if (k === 'heart') {
      const n = 60, s = S * 0.07, tilt = (Math.random() - 0.5) * 0.5, ct = Math.cos(tilt), st = Math.sin(tilt);
      for (let i = 0; i < n; i++) {
        const t = i / n * 6.283;
        const hx = 16 * Math.pow(Math.sin(t), 3), hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        if (room()) FW.stars.push({ x: r.x, y: r.y, vx: (hx * ct - hy * st) * s, vy: (hx * st + hy * ct) * s, life: 0, max: life(), c: i % 3 ? 1 : 6, tw: Math.random() * 6.283, big: r.big, g: 0.9 });
      }
    } else {
      const n = k === 'chrysanthemum' ? 80 : 95;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283;
        if (k === 'double') { const inner = i % 3 === 0; star(a, S * (inner ? 0.45 : 1) * (0.85 + 0.15 * Math.random()), inner ? r.c2 : r.c1, life()); }
        else if (k === 'chrysanthemum') star(a, S * (0.55 + 0.45 * Math.sqrt(Math.random())), r.c1, life() + 0.3, { comet: true, tail: 0.3, c2: r.c2 });
        else if (k === 'strobe') star(a, S * (0.4 + 0.6 * Math.sqrt(Math.random())), FW_WHITE, 1.8 + Math.random() * 0.9, { strobe: true, g: 1.2 });
        else star(a, S * (0.35 + 0.65 * Math.sqrt(Math.random())), r.c1, life(), k === 'crackle' ? { pop: true } : k === 'peony' ? { c2: r.c2 } : null);
      }
      if (k === 'multibreak' && !r.small) {
        // A ring of little shells thrown out, each bursting a beat later.
        const m = 4 + Math.floor(Math.random() * 3);
        for (let i = 0; i < m; i++) {
          const a = i / m * 6.283 + Math.random() * 0.4, d = S * 0.55;
          FW.rockets.push({ x0: r.x, y0: r.y, x: r.x, y: r.y, tx: r.x + Math.cos(a) * d, ty: r.y + Math.sin(a) * d, t: 0, dur: 0.45 + Math.random() * 0.25,
                            ph: 0, kind: 'peony', c1: (r.c1 + i + 1) % FW_COLS.length, c2: r.c2, big: r.big, small: true, quiet: true });
        }
      }
    }
    // The flash of the burst, and the light it throws over the city.
    if (room()) FW.stars.push({ x: r.x, y: r.y, vx: 0, vy: 0, life: 0, max: r.small ? 0.15 : 0.26, c: FW_WHITE, flash: true, big: r.small ? 0.5 : 1 });
    FW.flare = Math.min(1, (FW.flare || 0) + (r.small ? 0.12 : 0.45)); FW.flareCol = r.c1;
    // A puff of smoke left hanging where it burst.
    if (!r.small) for (let i = 0; i < 5 && FW.smoke.length < 160; i++)
      FW.smoke.push({ x: r.x + (Math.random() - 0.5) * TILE * 2, y: r.y + (Math.random() - 0.5) * TILE * 2, vx: (Math.random() - 0.5) * TILE * 0.3, vy: -TILE * 0.08,
                      rad: TILE * (1.2 + Math.random()) * (r.big || 1), life: 0, max: 5 + Math.random() * 3 });
    if (vol > 0) {
      _firework(vol * (r.small ? 0.45 : 1));
      if (k === 'crackle' || k === 'kamuro' || k === 'willow') for (let i = 0; i < 9; i++)   // the crackle as the stars go
        _noise(0.035, vol * 0.08 * (0.5 + Math.random()), 3500, 6500, 0.1, 1.5, 1 + Math.random() * 1.2);
      if (k === 'strobe' || k === 'palm') _noise(1.4, vol * 0.025, 6000, 4000, 0.15, 0.7, 0.2);       // glitter fizz
    }
  }
  // Advance everything by dt, and send up new ones while `rate` (seconds
  // between launches: [min, max], or null for none) says so. The view is
  // where the player is looking; `vol` is how loud a burst in it is.
  // rate[2], if given, is the chance a launch is a salvo of three to five.
  function _fwStep(dt, x0, y0, x1, y1, rate, vol, hqOnly) {
    if (rate) {
      FW.next -= dt;
      if (FW.next <= 0) {
        FW.next = rate[0] + Math.random() * (rate[1] - rate[0]);
        const n = rate[2] && Math.random() < rate[2] ? 3 + Math.floor(Math.random() * 3) : 1;
        for (let i = 0; i < n; i++) _fwLaunch(x0, y0, x1, y1, hqOnly);
      }
    }
    // Heard if it is anywhere near the view, not only dead in it: a burst just
    // off the edge of the screen still carries.
    const mx = (x1 - x0) * 0.25, my = (y1 - y0) * 0.25;
    const seen = (x, y) => x > x0 - mx && x < x1 + mx && y > y0 - my && y < y1 + my;
    const room = () => FW.stars.length < FW_CAP;
    let n = 0;
    for (const r of FW.rockets) {
      // A whistling rocket screams on its way up.
      if (r.t === 0 && dt > 0 && r.whistle && vol > 0 && seen(r.x0, r.y0)) _noise(r.dur * 0.95, vol * 0.05, 1100 + Math.random() * 400, 2600 + Math.random() * 900, 0.7, 9);
      r.t += dt;
      const u = Math.min(1, r.t / r.dur), e = 1 - (1 - u) * (1 - u);
      r.x = r.x0 + (r.tx - r.x0) * e + (r.small ? 0 : Math.sin(u * 9 + r.ph) * TILE * 0.08);
      r.y = r.y0 + (r.ty - r.y0) * e;
      // its trail: sparks falling away behind it (fewer for a multibreak's little shells)
      if (dt > 0 && room()) for (let k = 0; k < (r.small ? 1 : 3); k++) FW.stars.push({ x: r.x, y: r.y, vx: (Math.random() - 0.5) * TILE * 0.6, vy: TILE * (0.6 + Math.random()), life: 0, max: 0.3 + Math.random() * 0.35, c: FW_GOLD, spark: true });
      if (u >= 1) { _fwBurst(r, seen(r.x, r.y) && !(r.quiet && Math.random() < 0.5) ? vol : 0); continue; }
      FW.rockets[n++] = r;
    }
    FW.rockets.length = n;
    n = 0;
    for (const s of FW.stars) {
      s.life += dt;
      if (s.life >= s.max) {
        // a crackling star goes out in a pinch of white sparks
        if (s.pop && room()) for (let k = 0; k < 3; k++) FW.stars.push({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * TILE * 2.4, vy: (Math.random() - 0.5) * TILE * 2.4, life: 0, max: 0.2 + Math.random() * 0.2, c: FW_WHITE, spark: true });
        // a crossette's star breaks into four, turning colour
        if (s.split && room()) {
          const sp = Math.hypot(s.vx, s.vy) * 0.9 + TILE * 1.2, a0 = Math.atan2(s.vy, s.vx) + 0.785;
          for (let q = 0; q < 4; q++) FW.stars.push({ x: s.x, y: s.y, vx: Math.cos(a0 + q * 1.571) * sp, vy: Math.sin(a0 + q * 1.571) * sp, life: 0, max: 0.8 + Math.random() * 0.3, c: s.c2 ?? s.c, tw: Math.random() * 6.283, big: s.big, tail: 0.16 });
        }
        continue;
      }
      const k = Math.exp(-(s.drag || 1.9) * dt);
      s.vx *= k; s.vy = s.vy * k + TILE * (s.g || 1.5) * (s.big || 1) * dt;   // air, then gravity
      s.x += s.vx * dt; s.y += s.vy * dt;
      // glitter: shedding tiny sparks as it falls
      if (s.glit && dt > 0 && Math.random() < dt * 14 && room())
        FW.stars.push({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * TILE * 0.4, vy: TILE * 0.3, life: 0, max: 0.25 + Math.random() * 0.35, c: Math.random() < 0.5 ? FW_WHITE : FW_GOLD, spark: true, twinkle: true });
      FW.stars[n++] = s;
    }
    FW.stars.length = n;
    n = 0;
    for (const p of FW.smoke) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rad += TILE * 0.35 * dt;
      FW.smoke[n++] = p;
    }
    FW.smoke.length = n;
    FW.flare = Math.max(0, (FW.flare || 0) - dt * 2.2);
  }
  // Draw them: g is in screen px with 'lighter' compositing set; sx/sy map
  // world px to screen, z is screen px per world px.
  function _fwDraw(g, sx, sy, z, W, H) {
    if (!FW.rockets.length && !FW.stars.length && !FW.smoke.length && !(FW.flare > 0.01)) return;
    const px = Math.max(1, Math.min(2.2, z * 2.6));                   // the stars' size on screen, a little bigger close in
    // The sky lit up by the last bursts, in their colour.
    if (FW.flare > 0.01) { g.globalAlpha = 0.07 * FW.flare; g.fillStyle = `rgb(${FW_COLS[FW.flareCol || 0]})`; g.fillRect(0, 0, W, H); }
    // Smoke hanging where shells burst, faintly lit (drawn over, not added).
    if (FW.smoke.length) {
      const op = g.globalCompositeOperation; g.globalCompositeOperation = 'source-over';
      for (const p of FW.smoke) {
        const x = sx(p.x), y = sy(p.y), r = p.rad * z;
        if (x < -r || y < -r || x > W + r || y > H + r) continue;
        const u = p.life / p.max, a = 0.09 * Math.min(1, p.life * 3) * (1 - u);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(150,150,170,${a.toFixed(3)})`); gr.addColorStop(1, 'rgba(150,150,170,0)');
        g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      g.globalCompositeOperation = op;
    }
    g.lineCap = 'round';
    for (const s of FW.stars) {
      const x = sx(s.x), y = sy(s.y);
      if (x < -60 || y < -60 || x > W + 60 || y > H + 60) continue;
      const u = s.life / s.max;
      if (s.flash) { const r = (30 + 140 * u) * px * (s.big || 1); g.globalAlpha = 0.75 * (1 - u) * (1 - u); g.drawImage(_fwSprite(s.c), x - r, y - r, r * 2, r * 2); continue; }
      // Colour: a peony's or chrysanthemum's stars turn to their second colour halfway.
      const c = s.c2 !== undefined && !s.split && u > 0.5 ? s.c2 : s.c;
      let a = (1 - Math.pow(u, 2.4)) * (s.spark ? 0.8 : u > 0.55 ? 0.65 + 0.35 * Math.sin(s.life * 30 + s.tw) : 1);   // they flicker as they die
      if (s.strobe && u > 0.35) a *= Math.sin(s.life * 38 + s.tw) > 0 ? 1 : 0.05;
      if (s.twinkle) a *= 0.5 + 0.5 * Math.sin(s.life * 60 + x);
      if (a < 0.02) continue;
      const tail = s.spark ? 0.05 : (s.tail || 0.11), fat = s.fat || 1;
      const tx = x - s.vx * tail * z, ty = y - s.vy * tail * z;
      if (s.comet) {
        // A long tail that thins and fades back along the way it came.
        g.globalAlpha = a * 0.35; g.strokeStyle = `rgb(${FW_COLS[c]})`; g.lineWidth = 3.2 * px * fat;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - s.vx * tail * 0.45 * z, y - s.vy * tail * 0.45 * z); g.stroke();
        g.globalAlpha = a * 0.25; g.lineWidth = 1.4 * px * fat;
        g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty); g.stroke();
      } else {
        g.globalAlpha = a * 0.7; g.strokeStyle = `rgb(${FW_COLS[c]})`; g.lineWidth = (s.spark ? 1 : 1.8) * px * fat;
        g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty); g.stroke();
      }
      const r = (s.spark ? 2.2 : 5) * px * fat;
      g.globalAlpha = a; g.drawImage(_fwSprite(c), x - r, y - r, r * 2, r * 2);
    }
    for (const r of FW.rockets) {                                     // the rocket's own head, flickering
      const x = sx(r.x), y = sy(r.y), q = (r.small ? 4 : 7 + Math.random() * 2) * px;
      g.globalAlpha = 1; g.drawImage(_fwSprite(r.small ? r.c1 : FW_WHITE), x - q, y - q, q * 2, q * 2);
    }
    g.globalAlpha = 1;
  }
  // A holiday show (SeasonalEventFx: New Year's Eve) borrows the same sky:
  // [min, max] seconds between launches while it is on, null when it is not.
  let _festive = null;
  function setFestiveFireworks(rate) {
    if (rate && !_festive) FW.sites = null;   // launch from the town as it stands tonight
    _festive = rate || null;
  }
  // After the finale: over the city for FW_HOURS in-game hours, on the game's
  // own frame (render_main_loop, above the night overlay). Screen px.
  function renderFireworks(ctx, W, H) {
    const hq = typeof CompanyHQ !== 'undefined' ? CompanyHQ : null;
    if (V || (hq && hq.isActive())) return;                           // the finale draws its own (and so does the headquarters' unveiling)
    const meridian = phase === 'complete' && DayNight.getElapsed() < FW.until;               // the hours after the finale
    const own = meridian || !!_festive;                                                      // Hyperion's, or a holiday's: over the whole city
    const now = performance.now() / 1000, live = own || !!(hq && hq.celebrating());
    if (!live && !FW.rockets.length && !FW.stars.length) { FW.last = 0; return; }
    // The pops are cut from a recording only the finale used to load, so a
    // holiday show or the headquarters' (or a reload in the hours after the
    // finale) went off in silence. Ask for it whenever a show is up.
    if (live) _loadPops();
    const dt = FW.last && DevMode.timeScale !== 0 ? Math.min(0.05, now - FW.last) : 0;
    FW.last = now;
    const z = Camera.zoom, x0 = Camera.x, y0 = Camera.y;
    // Fewer when the view is close in (one fills the screen), quieter than the
    // finale's. After the finale the whole country is celebrating: wherever
    // the player looks there is a steady show, with salvos going up together.
    const rate = _festive || (meridian ? [0.12 + 0.25 * z, 0.4 + 0.55 * z, 0.18] : [0.5 + z, 1.4 + z * 2]);
    _fwStep(dt, x0, y0, x0 + W / z, y0 + H / z, live ? rate : null, _festive ? 0.85 : 0.6, live && !own);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    _fwDraw(ctx, x => (x - x0) * z, y => (y - y0) * z, z, W, H);
    ctx.restore();
  }

  function _vDraw(c) {
    const { g } = V, W = innerWidth, H = innerHeight;
    const wt = c - T_CONNECT, tS = V.stops[V.stops.length - 1].t;
    // Drawn about the station at the shot's scale, which past zM is smaller
    // than the world's (V.vz); `gone` is how far the world has been faded out
    // to hide that.
    const vz = wt >= 0 ? V.vz : 1, z = Camera.zoom * vz, gone = clamp01((1 - vz) / 0.12);
    const pan = wt >= 0 ? V.pan : 0, ax = V.sx + (V.ox - V.sx) * pan, ay = V.sy + (V.oy - V.sy) * pan;
    const mx = (V.sx - Camera.x) * Camera.zoom, my = (V.sy - Camera.y) * Camera.zoom;
    const sx = x => mx + (x - ax) * z, sy = y => my + (y - ay) * z;
    const cx = sx(V.sx), cy = sy(V.sy);                                          // the station (the Spire)
    g.clearRect(0, 0, W, H);
    // Darken the world so the lights carry it: a little on the road there,
    // more through the countdown, most behind the journey's figures.
    // (The title has the view dimmed further; the road there lets it back up.)
    const dim = c < T_CONNECT ? 0.14 + 0.36 * clamp01((c - tS) / Math.max(1, T_DARK - tS)) + 0.46 * clamp01(V.pre / 0.9) * (1 - clamp01(c / 1.6))
              : 0.5 + 0.46 * gone - 0.22 * clamp01((wt - W_BACK - W_IN + 1.5) / 2.5);   // (and let up for the last shot)
    g.fillStyle = `rgba(2,6,14,${dim.toFixed(3)})`; g.fillRect(0, 0, W, H);
    const cutA = c < T_CONNECT ? _vCut(c) : 0;                                   // between stops
    if (cutA > 0) { g.fillStyle = `rgba(0,0,0,${cutA.toFixed(3)})`; g.fillRect(0, 0, W, H); }
    g.save(); g.globalCompositeOperation = 'lighter';

    if (c < T_CONNECT) {
      // Charging: rings tightening on the station from the moment the camera
      // has it, through the countdown.
      const k = clamp01((c - tS - 2) / Math.max(1, T_DARK - tS - 2));
      if (c > tS + 2) {
        for (let i = 0; i < 3; i++) {
          const r = (200 - 140 * k + i * 30) * z / V.zS;
          g.strokeStyle = `rgba(122,216,255,${(0.2 + 0.5 * k).toFixed(3)})`; g.lineWidth = 2 + 3 * k;
          g.beginPath(); g.arc(cx, cy, Math.max(4, r), c * (1 + i), c * (1 + i) + 4.5); g.stroke();
        }
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 160 * k + 20);
        gr.addColorStop(0, `rgba(200,240,255,${(0.6 * k).toFixed(3)})`); gr.addColorStop(1, 'rgba(60,160,255,0)');
        g.fillStyle = gr; g.fillRect(cx - 200, cy - 200, 400, 400);
      }
      // Dark before the light: the whole map goes black with the song, bar
      // one ember at the station, and the breakers knock twice.
      if (c >= T_DARK) {
        g.restore();
        g.fillStyle = `rgba(0,0,0,${(0.985 * ease(clamp01((c - T_DARK) / 1.8))).toFixed(3)})`; g.fillRect(0, 0, W, H);
        g.save(); g.globalCompositeOperation = 'lighter';
        const er = 10 + 5 * Math.sin(c * 5);
        g.globalAlpha = 0.55 + 0.25 * Math.sin(c * 5);
        g.drawImage(_spr.cool, cx - er, cy - er, er * 2, er * 2);
        g.globalAlpha = 1;
        for (const t of [T_HIT1, T_HIT2]) {
          const f = c >= t ? Math.max(0, 1 - (c - t) / 0.3) : 0;
          if (f <= 0) continue;
          const hr = (t === T_HIT1 ? 0.5 : 0.8) * Math.max(W, H);
          const gr = g.createRadialGradient(cx, cy, 0, cx, cy, hr);
          gr.addColorStop(0, `rgba(235,248,255,${(0.9 * f).toFixed(3)})`); gr.addColorStop(0.25, `rgba(120,200,255,${(0.35 * f).toFixed(3)})`); gr.addColorStop(1, 'rgba(60,160,255,0)');
          g.fillStyle = gr; g.fillRect(0, 0, W, H);
        }
      }
      g.restore();
      return;
    }

    // Flash: the interconnect closing, and again (smaller) at the breakout.
    const f = Math.max(wt < 0.1 ? 1 : Math.max(0, 1 - (wt - 0.1) / 1.4),
                       wt >= W_BREAK ? 0.45 * Math.max(0, 1 - (wt - W_BREAK) / 0.9) : 0);
    if (f > 0) { g.fillStyle = `rgba(230,245,255,${(0.9 * f).toFixed(3)})`; g.fillRect(0, 0, W, H); }

    // The country, once the shot has left the map: land against a dark sea,
    // a graticule across it, a lit coast.
    if (gone > 0.01) {
      const shape = () => {
        g.beginPath();
        for (const pts of [V.coast, ...V.isles]) { pts.forEach((p, i) => i ? g.lineTo(sx(p.x), sy(p.y)) : g.moveTo(sx(p.x), sy(p.y))); g.closePath(); }
      };
      shape(); g.fillStyle = `rgba(22,44,74,${(0.55 * gone).toFixed(3)})`; g.fill();
      g.save(); shape(); g.clip();
      g.strokeStyle = `rgba(122,216,255,${(0.07 * gone).toFixed(3)})`; g.lineWidth = 1; g.beginPath();
      for (let i = -8; i <= 8; i++) {
        const o = i * V.hx / 8;
        g.moveTo(sx(V.ox + o), 0); g.lineTo(sx(V.ox + o), H);
        g.moveTo(0, sy(V.oy + o)); g.lineTo(W, sy(V.oy + o));
      }
      g.stroke(); g.restore();
      for (const [w, a] of [[7, 0.12], [1.5, 0.5]]) { shape(); g.strokeStyle = `rgba(150,225,255,${(a * gone).toFixed(3)})`; g.lineWidth = w; g.stroke(); }
    }

    // The front (world radius), in two movements, each paced as a share of
    // what the shot shows so that it stays in frame while the shot pulls
    // back. The city's leaves the station and stops at the city's edge (the
    // shot has settled on the city by then); the nation's leaves from there
    // at W_BREAK and is past the far shot's corners by W_NATION. Each is
    // followed by two ripples, which flare the lights again.
    const RIP = [[0, 1], [1.1, 0.5], [2.2, 0.3]];
    const half = t => Math.min(W, H) / 2 / _vZoomOut(t), kC = V.cityR / half(W_BREAK);
    const share = t => t < W_BREAK ? kC * Math.pow(clamp01(t / W_CITY), 1.2) : kC + (3.8 - kC) * Math.pow(clamp01((t - W_BREAK) / W_NATION), 1.5);
    const frontAt = t => t <= 0 ? 0 : half(t) * share(t);
    const wash = (R, a) => {
      const Rs = Math.max(1, R * z), w = g.createRadialGradient(cx, cy, 0, cx, cy, Rs);
      w.addColorStop(0, `rgba(255,210,150,${0.07 * a})`); w.addColorStop(0.8, `rgba(120,180,255,${0.05 * a})`); w.addColorStop(1, `rgba(140,220,255,${0.22 * a})`);
      g.fillStyle = w; g.beginPath(); g.arc(cx, cy, Rs, 0, Math.PI * 2); g.fill();
    };
    // The lit country behind the front: a warm wash over everything inside it.
    if (wt > 0) wash(frontAt(wt), 1);

    // Every building inside the front is lit; the ones it (or a ripple) has
    // just reached flare.
    let lit = 0;
    {
      const R = frontAt(wt), band = Math.max(6 * TILE, R * 0.08);
      const small = 0.5 + 0.5 * vz;                                              // lights shrink with the shot, to a point
      const r1 = frontAt(wt - RIP[1][0]), r2 = frontAt(wt - RIP[2][0]);
      for (const L of V.lights) {
        if (L.d > R) break;
        lit++;
        const x = sx(L.x), y = sy(L.y);
        if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
        const fl = Math.max(0, 1 - (R - L.d) / band,
                            L.d <= r1 ? RIP[1][1] * (1 - (r1 - L.d) / band) : 0,
                            L.d <= r2 ? RIP[2][1] * (1 - (r2 - L.d) / band) : 0);
        const tw = 0.75 + 0.25 * Math.sin(c * 3 + L.hue * 20);
        const r = Math.min(L.nation ? 16 : 26, Math.max((L.nation ? 4 : 7) * small, L.r * TILE * z)) * (1 + 1.3 * fl);
        g.globalAlpha = Math.min(1, 0.6 * tw + 0.4 * fl);
        g.drawImage(L.hue < 0.7 ? _spr.warm : _spr.cool, x - r, y - r, r * 2, r * 2);
      }
    }
    g.globalAlpha = 1;
    V.lit = lit;

    // The front itself. It waits at the city's edge, breathing, until the
    // breakout.
    const ring = (R, a) => {
      if (R <= 0 || a <= 0.01) return;
      for (const [w, al, col] of [[28, 0.25, '122,216,255'], [8, 0.8, '255,240,210'], [3, 1, '255,255,255']]) {
        g.strokeStyle = `rgba(${col},${(al * a).toFixed(3)})`; g.lineWidth = w;
        g.beginPath(); g.arc(cx, cy, Math.max(1, R * z), 0, Math.PI * 2); g.stroke();
      }
    };
    for (const [lag, a] of RIP) {
      if (wt < W_BREAK) {
        const t = wt - lag;
        if (t > 0) ring(frontAt(t), a * (t < W_CITY ? 1 - 0.4 * t / W_CITY : lag ? 0 : 0.45 + 0.2 * Math.sin(c * 5)));
      } else {
        const t = wt - W_BREAK - lag, u = t / W_NATION;
        if (t > 0 && u < 1.1) ring(frontAt(t + W_BREAK), a * (1 - Math.min(1, u) * 0.6));
      }
    }

    // The national lines energise outward along the tree, then carry power.
    if (wt >= W_BREAK) {
      const reach = frontAt(wt) * 0.9 * V.maxTd / V.maxLd, dot = 0.5 + 0.5 * vz;   // just behind the front
      const at = (n, p, q) => q < 0.5 ? [p.x + (n.mx - p.x) * q * 2, p.y + (n.my - p.y) * q * 2]
                                      : [n.mx + (n.x - n.mx) * (q * 2 - 1), n.my + (n.y - n.my) * (q * 2 - 1)];
      for (const [w, col] of [[7, 'rgba(255,200,110,0.14)'], [2, 'rgba(255,226,160,0.6)']]) {
        g.strokeStyle = col; g.lineWidth = w; g.beginPath();
        for (const n of V.lines) {
          if (n.p < 0) continue;
          const p = V.lines[n.p], k = clamp01((reach - p.td) / n.len);
          if (k <= 0) continue;
          g.moveTo(sx(p.x), sy(p.y));
          if (k > 0.5) g.lineTo(sx(n.mx), sy(n.my));
          const [ex, ey] = at(n, p, k);
          g.lineTo(sx(ex), sy(ey));
        }
        g.stroke();
      }
      for (const n of V.lines) {
        if (n.p < 0) continue;
        const p = V.lines[n.p], k = clamp01((reach - p.td) / n.len);
        if (k <= 0) continue;
        const [px, py] = at(n, p, ((c * 0.45 + n.ph) % 1) * k);                  // a pulse heading out
        g.globalAlpha = 0.9; g.drawImage(_spr.warm, sx(px) - 9 * dot, sy(py) - 9 * dot, 18 * dot, 18 * dot);
        if (k >= 1) { g.globalAlpha = 0.8; g.drawImage(_spr.cool, sx(n.x) - 7 * dot, sy(n.y) - 7 * dot, 14 * dot, 14 * dot); }   // its substation
      }
      g.globalAlpha = 1;
    }

    // The station: a beacon that never goes out.
    // (Turned down behind the journey's figures, which sit over it.)
    const pulse = 0.8 + 0.2 * Math.sin(c * 4);
    const ba = V.cardShown ? 1 : 1 - 0.7 * clamp01((wt - W_STATS + 1) / 1.5) * (1 - clamp01((wt - W_BACK + 1) / 2));
    const br = (120 * pulse + 40) * (0.3 + 0.7 * vz);
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, br);
    gr.addColorStop(0, `rgba(255,255,255,${(0.9 * ba).toFixed(3)})`); gr.addColorStop(0.3, `rgba(255,220,140,${(0.5 * ba).toFixed(3)})`); gr.addColorStop(1, 'rgba(122,216,255,0)');
    g.fillStyle = gr; g.fillRect(cx - br, cy - br, br * 2, br * 2);

    // Fireworks (the shot is back at the world's own scale by then).
    _fwDraw(g, sx, sy, z, W, H);
    g.globalAlpha = 1;
    g.restore();
  }

  function _showCard() {
    if (V.cardShown) return;
    V.cardShown = true; V.cardAt = V.clock;
    let pop = 0;
    for (const t of [T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL]) for (const b of EntityRegistry.getByType(t)) if (b.fromRequest) pop += (b._population || 0);
    const ach = typeof AchievementsSystem !== 'undefined' && AchievementsSystem.count ? AchievementsSystem.count() : null;
    const n = v => Math.round(v).toLocaleString('en-US');
    const best = typeof CityScore !== 'undefined' ? +CityScore.best : NaN;
    // [label, value, format]: the tiles count up to their values one by one (_vFrame).
    const stats = [
      ['Day', doneDay, n],
      ['Population', pop, n],
      ['Generating', Math.round(PowerNetwork.stats.totalGenerated || 0), v => _mw(Math.round(v / 100) * 100)],
      ['Buildings lit', V.builtAll, n],
      ['Best City Score', isFinite(best) ? best : 0, isFinite(best) ? n : () => '—'],
      ...(ach != null ? [['Achievements', ach, n]] : []),
    ];
    const box = V.root.querySelector('.npv-stats');
    box.innerHTML = stats.map(([k]) => `<div class="npv-stat"><span>${k}</span><b>&nbsp;</b></div>`).join('');
    V.tiles = stats.map(([, v, fmt], i) => ({ el: box.children[i], v, fmt }));
    V.root.querySelector('.npv-card').classList.add('in');
    V.root.querySelector('.npv-skip').style.display = 'none';
    V.root.querySelector('.npv-cap').classList.remove('in');
    V.root.querySelector('.npv-journey').classList.remove('in');
    V.root.querySelector('.npv-count').classList.remove('in');
    _say(0);
    // The card: a last hit and the air opening out over the song's outro.
    _impact(0.4, 1.6);
    _shimmer(6, 0.05, 0.2);
  }

  function _vKey(ev) {
    if (!V) return;
    if (ev.key === 'F11' || ev.key === 'F12') return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    if (ev.key === 'Escape' && !V.cardShown) { if (V.skipAt < 0) V.skipAt = performance.now(); return; }
    if (V.cardShown && !ev.repeat && (ev.key === 'Enter' || ev.key === ' ')) _endVictory();
  }
  function _vKeyUp(ev) { if (!V) return; if (ev.key === 'Escape') V.skipAt = -1; ev.stopImmediatePropagation(); }
  // From gamepad_input.js while the sequence is up.
  function padFrame(aDown, bHeld) {
    if (!V) return;
    if (aDown && V.cardShown) _endVictory();
    if (bHeld && V.skipAt < 0 && !V.cardShown) V.skipAt = performance.now();
    if (!bHeld) V.skipAt = -1;
  }

  function _endVictory() {
    if (!V) return;
    const v = V; V = null;
    cancelAnimationFrame(v.raf);
    window.removeEventListener('resize', v.resize);
    window.removeEventListener('keydown', _vKey, true);
    window.removeEventListener('keyup', _vKeyUp, true);
    v.root.classList.add('out');
    document.body.classList.remove('np-victory');
    setTimeout(() => v.root.remove(), 900);
    if (v.song) { const s = v.song, v0 = s.volume; let k = 0; const f = setInterval(() => { k += 0.05; s.volume = Math.max(0, v0 * (1 - k)); if (k >= 1) { clearInterval(f); s.pause(); } }, 100); }
    if (v.songUrl) setTimeout(() => URL.revokeObjectURL(v.songUrl), 4000);
    for (const h of v.hum) if (h) { try { h.gn.gain.setTargetAtTime(0, h.gn.context.currentTime, 0.3); h.s.stop(h.gn.context.currentTime + 2); } catch (_e) {} }   // the station's beds take over
    setTimeout(() => { try { MusicSystem.start?.(); } catch (_e) {} }, 2500);
    try { PauseAudio.holdForScene?.(false); } catch (_e) {}         // the world's sound comes back in
    phase = 'complete';
    FW.until = DayNight.getElapsed() + FW_HOURS * hourLen();          // the city goes on celebrating
    DevMode.setTimeScale(v.prevSpeed || 1);
    NotificationStack.push({
      icon: '◈', title: 'GRID COMPLETE',
      message: `${_city()} powers the nation. Hyperion Station keeps exporting ${_mw(EXPORT_KW)} and paying ${_multText(EXPORT_KW)} (${_money(exportPay(EXPORT_KW))}/s now); switch it off in the dossier if you need the power back.`,
      color: '#ffd070', border: '#6a4a10', tag: 'meridian-complete', onClick: () => openDossier(),
    });
    _updateButton();
  }

  // The scene's own sound, synthesised: _sweep is a tone that slides (booms,
  // knocks, things winding down), _noise a band of noise that slides (rushes
  // of air, ticks, pops, crackle). `att` is the share of `dur` spent rising.
  function _sweep(f0, f1, dur, vol, type = 'sine') {
    const c = typeof SFX !== 'undefined' && SFX.context ? SFX.context() : null;
    if (!c) return;
    const v = vol * (SFX.getVolume ? SFX.getVolume() : 1), t0 = c.currentTime;
    const o = c.createOscillator(), gn = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + 0.015); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(_bus(c)); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  // Everything the scene synthesises goes out through one limiter, so a
  // volley of fireworks over the boom of the interconnect can't clip.
  let _out = null;
  function _bus(c) {
    if (!_out || _out.context !== c) {
      const lim = c.createDynamicsCompressor();
      lim.threshold.value = -18; lim.knee.value = 12; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.25;
      _out = c.createGain(); _out.gain.value = 0.85;
      _out.connect(lim); lim.connect(c.destination);
    }
    return _out;
  }
  // The station's sound in the scene, the same two voices it has in normal
  // play (MACHINE_BEDS in audio.js): the Fusion Reactor's sound pitched
  // down, there from the moment the camera reaches the station, and the
  // transformers' hum, which comes up through the countdown as it charges.
  // Both run down when the map goes dark, come back as the interconnect
  // closes, and are left quietly under the last shot.
  const HUM = [{ src: 'audio/sfx/transformer.mp3', buf: null }, { src: 'audio/sfx/fusion.mp3', buf: null, pitch: 0.8 }];
  let _humAsked = false;
  function _loadHum() {
    const c = typeof SFX !== 'undefined' && SFX.context ? SFX.context() : null;
    if (!c || _humAsked) return;
    _humAsked = true;
    for (const h of HUM) {
      fetch(h.src).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error('hum'))).then(a => c.decodeAudioData(a))
        .then(raw => { h.buf = typeof seamlessLoopBuffer === 'function' ? seamlessLoopBuffer(c, raw, 1.5, true, true, 0) : raw; })
        .catch(() => {});
    }
  }
  function _vHum(c) {
    const ctx = typeof SFX !== 'undefined' && SFX.context ? SFX.context() : null;
    if (!ctx) return;
    const wt = c - T_CONNECT, tS = V.stops[V.stops.length - 1].t;
    // [level, pitch] of the transformers, then of the fusion sound.
    let hum = [0, 1], core = [0, 1];
    if (c < T_DARK) {
      const u = clamp01((c - T_COUNT) / (T_DARK - T_COUNT));
      if (c >= T_COUNT) hum = [0.04 + 0.24 * u * u, 0.9 + 0.2 * u];                                       // charging
      core = [0.17 * clamp01((c - tS - 1) / 3), 1 + 0.08 * u];                                            // idling, from arrival
    } else if (c < T_CONNECT) {
      const u = clamp01((c - T_DARK) / 1.6);
      hum = [0.28 * (1 - u), 1.1 - 0.4 * u]; core = [0.17 * (1 - u), 1.08 - 0.4 * u];                     // run down
    } else if (wt < W_BREAK + 3) {
      const k = (1 - 0.55 * clamp01(wt / 6)) * (1 - clamp01((wt - W_BREAK) / 3));                         // live, then left behind
      hum = [0.26 * k, 1]; core = [0.16 * k, 1];
    } else {
      const k = clamp01((wt - W_BACK - W_IN + 2.5) / 2.5);                                                // the last shot
      hum = [0.1 * k, 1]; core = [0.07 * k, 1];
    }
    const t = ctx.currentTime, vol = SFX.getVolume ? SFX.getVolume() : 1;
    HUM.forEach((h, i) => {
      const [level, pitch] = i ? core : hum;
      let n = V.hum[i];
      if (!n) {
        if (!h.buf || level <= 0) return;
        const s = ctx.createBufferSource(), gn = ctx.createGain();
        s.buffer = h.buf; s.loop = true; gn.gain.value = 0;
        s.connect(gn); gn.connect(_bus(ctx)); s.start(0, Math.random() * h.buf.duration);
        n = V.hum[i] = { s, gn };
      }
      n.gn.gain.setTargetAtTime(level * vol, t, 0.1);
      n.s.playbackRate.setTargetAtTime(pitch * (h.pitch || 1), t, 0.1);
    });
  }

  // A firework's pop is cut from a recording of real ones. POPS is where
  // each pop starts in the file and how much of it to play (up to the next
  // one), in seconds; each shell takes one at its own pitch and loudness.
  const FW_SRC = 'audio/sfx/fireworks.mp3';
  const POPS = [[0.344, 0.4], [0.749, 0.6], [1.569, 0.6], [2.177, 0.25], [2.431, 0.41], [2.85, 0.3], [3.159, 0.19], [3.355, 0.53], [3.894, 0.6]];
  // Opened straight from disk (file://), fetch() is refused, so the recording
  // never decoded and every shell burst in silence while the crackle (made
  // from noise, no file) still played. Then the pops are cut from the file
  // with a few <audio> elements instead, the fallback the game's other
  // sounds already use there (makeElementLooper, SFX.play).
  let _pops = null, _popsAsked = false, _popLast = -1, _popsFailed = false;
  const _popEls = [];
  function _loadPops() {
    const c = typeof SFX !== 'undefined' && SFX.context ? SFX.context() : null;
    if (!c || _pops || _popsAsked) return;
    _popsAsked = true;
    fetch(FW_SRC).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error('pops'))).then(a => c.decodeAudioData(a))
      .then(buf => { _pops = buf; }).catch(() => { _popsFailed = true; });
    if (location.protocol === 'file:') _popsFailed = true;   // no need to wait for the refusal
  }
  function _popElement(at, len, rate, vol) {
    let a = _popEls.find(e => e.paused);
    if (!a) {
      if (_popEls.length >= 8) return;                                          // eight going at once is plenty
      a = new Audio(FW_SRC); a.preload = 'auto'; a.preservesPitch = false; _popEls.push(a);
    }
    clearTimeout(a._stop);
    try { a.currentTime = at; } catch (_e) {}
    a.playbackRate = rate; a.volume = Math.max(0, Math.min(1, vol));
    a.play().catch(() => {});
    a._stop = setTimeout(() => a.pause(), len / rate * 1000);
  }
  function _firework(v) {
    const c = typeof SFX !== 'undefined' && SFX.context ? SFX.context() : null;
    if (!_pops && !_popsFailed) return;
    let i = Math.floor(Math.random() * POPS.length);
    if (i === _popLast) i = (i + 1) % POPS.length;                               // never the same pop twice running
    _popLast = i;
    const rate = 0.88 + 0.3 * Math.random();
    const vol = v * (0.28 + 0.3 * Math.random()) * (typeof SFX !== 'undefined' && SFX.getVolume ? SFX.getVolume() : 1);
    if (!_pops || !c) { _popElement(POPS[i][0], POPS[i][1], rate, vol); return; }
    const [at, len] = POPS[i], dur = len / rate, t0 = c.currentTime + 0.01;
    const s = c.createBufferSource(), gn = c.createGain();
    s.buffer = _pops; s.playbackRate.value = rate;
    gn.gain.setValueAtTime(vol, t0); gn.gain.setValueAtTime(vol, t0 + dur - 0.03); gn.gain.linearRampToValueAtTime(0, t0 + dur);   // faded out before the next pop in the file
    s.connect(gn); gn.connect(_bus(c)); s.start(t0, at, len);
  }
  let _hiss = null;
  function _noise(dur, vol, f0, f1, att = 0.3, q = 0.8, delay = 0) {
    const c = typeof SFX !== 'undefined' && SFX.context ? SFX.context() : null;
    if (!c) return;
    if (!_hiss || _hiss.sampleRate !== c.sampleRate) {
      _hiss = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = _hiss.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (!dur) return;
    const v = vol * (SFX.getVolume ? SFX.getVolume() : 1), t0 = c.currentTime + delay;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), gn = c.createGain();
    s.buffer = _hiss; s.loop = true;
    f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + Math.max(0.005, dur * att)); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(gn); gn.connect(_bus(c)); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }

  // ── The finale's voices ──────────────────────────────────────────
  // The finale used to speak in bare sine beeps and the game's own UI
  // chimes, which made the grandest moment in the game sound like a menu.
  // These are built for it instead: a long hall for everything to ring out
  // in, deep impacts, a riser for the countdown, a heavy clock, the clank of
  // big contactors, a slow string pad, and untuned shimmer and relay ticks.
  // Anything heard over the song is untuned, so nothing fights its key; the
  // pad only plays before the song comes in.
  const _ac = () => typeof SFX !== 'undefined' && SFX.context ? SFX.context() : null;
  const _mv = () => typeof SFX !== 'undefined' && SFX.getVolume ? SFX.getVolume() : 1;
  // The hall: two channels of decaying noise, darker as it dies, ~4.5 s.
  let _hallIn = null;
  function _hall(c) {
    if (_hallIn && _hallIn.context === c) return _hallIn;
    const sr = c.sampleRate, len = Math.round(sr * 4.5), ir = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const u = i / len;
        lp += ((Math.random() * 2 - 1) - lp) * (0.62 - 0.52 * u);
        d[i] = lp * Math.pow(1 - u, 2.4) * Math.min(1, i / (sr * 0.015));   // a short pre-delay swell
      }
    }
    const conv = c.createConvolver();
    conv.buffer = ir;
    _hallIn = c.createGain(); _hallIn.gain.value = 0.6;
    _hallIn.connect(conv); conv.connect(_bus(c));
    return _hallIn;
  }
  // An output for one sound: dry to the limiter, `wet` of it into the hall.
  function _send(c, wet) {
    const g = c.createGain(); g.connect(_bus(c));
    if (wet > 0) { const s = c.createGain(); s.gain.value = wet; g.connect(s); s.connect(_hall(c)); }
    return g;
  }
  const _nbuf = c => { _noise(0); return _hiss; };   // _noise(0) only builds the buffer
  function _env(g, t0, v, att, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  // A cinematic hit: a sub drop, a thud of low noise closing down, a crack.
  // `size` stretches it (1 = a big hit, 0.5 a knock).
  function _impact(vol, size = 1, delay = 0) {
    const c = _ac(); if (!c) return;
    const v = vol * _mv(), t0 = c.currentTime + delay, out = _send(c, 0.45 + 0.25 * size);
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(70, t0); o.frequency.exponentialRampToValueAtTime(24, t0 + 1.3 * size);
    _env(g, t0, v, 0.006, 1.8 * size); o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + 1.9 * size);
    const b = c.createOscillator(), bg = c.createGain();
    b.type = 'triangle'; b.frequency.setValueAtTime(140, t0); b.frequency.exponentialRampToValueAtTime(48, t0 + 0.5 * size);
    _env(bg, t0, v * 0.45, 0.004, 0.7 * size); b.connect(bg); bg.connect(out); b.start(t0); b.stop(t0 + 0.8 * size);
    const n = c.createBufferSource(), f = c.createBiquadFilter(), ng = c.createGain();
    n.buffer = _nbuf(c); n.loop = true; f.type = 'lowpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(3000, t0); f.frequency.exponentialRampToValueAtTime(80, t0 + 0.8 * size);
    _env(ng, t0, v * 0.8, 0.003, 1.1 * size); n.connect(f); f.connect(ng); ng.connect(out); n.start(t0, Math.random()); n.stop(t0 + 1.2 * size);
    _noise(0.22 * size, vol * 0.3, 7000, 2400, 0.01, 0.7, delay);   // _noise applies the volume itself
  }
  // The countdown's tension: noise sweeping up under a cluster of detuned
  // saws gliding up a fifth through an opening filter. It ends dead on time.
  function _riser(dur, vol) {
    const c = _ac(); if (!c) return;
    const v = vol * _mv(), t0 = c.currentTime, out = _send(c, 0.35);
    const n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    n.buffer = _nbuf(c); n.loop = true; f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(260, t0); f.frequency.exponentialRampToValueAtTime(7000, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + dur * 0.98); g.gain.setValueAtTime(0, t0 + dur);
    n.connect(f); f.connect(g); g.connect(out); n.start(t0, Math.random()); n.stop(t0 + dur + 0.02);
    const lp = c.createBiquadFilter(), cg = c.createGain();
    lp.type = 'lowpass'; lp.Q.value = 1.5; lp.frequency.setValueAtTime(180, t0); lp.frequency.exponentialRampToValueAtTime(3600, t0 + dur);
    cg.gain.setValueAtTime(0.0001, t0); cg.gain.exponentialRampToValueAtTime(v * 0.42, t0 + dur * 0.98); cg.gain.setValueAtTime(0, t0 + dur);
    lp.connect(cg); cg.connect(out);
    for (const [f0, det] of [[41.2, 0], [41.2, 11], [61.7, -8], [82.4, 6], [123.5, -13], [164.8, 9]]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.detune.value = det;
      o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f0 * 1.5, t0 + dur);
      o.connect(lp); o.start(t0); o.stop(t0 + dur + 0.02);
    }
  }
  // A heavy clock: a woody click over a short low knock, heavier as it goes.
  function _tock(vol) {
    const c = _ac(); if (!c) return;
    const v = vol * _mv(), t0 = c.currentTime, out = _send(c, 0.5);
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(120, t0); o.frequency.exponentialRampToValueAtTime(46, t0 + 0.22);
    _env(g, t0, v, 0.004, 0.42); o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + 0.45);
    _noise(0.045, vol * 0.7, 2400, 1300, 0.02, 5);
  }
  // A big contactor slamming shut: struck-steel partials (inharmonic) over a knock.
  function _clank(vol, delay = 0) {
    const c = _ac(); if (!c) return;
    const v = vol * _mv(), t0 = c.currentTime + delay, out = _send(c, 0.7);
    for (const [f, a, d] of [[173, 1, 0.9], [412, 0.55, 0.6], [987, 0.32, 0.4], [2133, 0.18, 0.22]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f * (0.98 + Math.random() * 0.04);
      _env(g, t0, v * a * 0.5, 0.002, d); o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + d + 0.05);
    }
    _impact(vol * 0.8, 0.55, delay);
  }
  // A slow string pad: each note three detuned saws through a filter that
  // swells open and closes again, mostly into the hall. Before the song only.
  function _pad(freqs, dur, vol, att = 1.4, rel = 1.2) {
    const c = _ac(); if (!c) return;
    const v = vol * _mv(), t0 = c.currentTime, out = _send(c, 0.8);
    const lp = c.createBiquadFilter(), g = c.createGain();
    lp.type = 'lowpass'; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(350, t0); lp.frequency.linearRampToValueAtTime(1900, t0 + att + 0.6); lp.frequency.linearRampToValueAtTime(500, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + att); g.gain.setValueAtTime(v, t0 + dur - rel); g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    lp.connect(g); g.connect(out);
    for (const f of freqs) for (const det of [-9, 0, 8]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      o.connect(lp); o.start(t0); o.stop(t0 + dur + 0.05);
    }
  }
  // An untuned shimmer: high air swelling and dying in the hall.
  function _shimmer(dur, vol, delay = 0) {
    const c = _ac(); if (!c) return;
    const v = vol * _mv(), t0 = c.currentTime + delay, out = _send(c, 0.9);
    for (const fc of [5200, 8200]) {
      const n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      n.buffer = _nbuf(c); n.loop = true; f.type = 'bandpass'; f.Q.value = 3; f.frequency.value = fc;
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      n.connect(f); f.connect(g); g.connect(out); n.start(t0, Math.random()); n.stop(t0 + dur + 0.05);
    }
  }
  // A relay ticking over somewhere in the city: a tiny untuned click.
  function _relay(vol) {
    const c = _ac(); if (!c) return;
    const v = vol * _mv(), t0 = c.currentTime, out = _send(c, 0.6);
    const n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    n.buffer = _nbuf(c); f.type = 'bandpass'; f.Q.value = 7; f.frequency.value = 2500 + Math.random() * 4500;
    _env(g, t0, v, 0.001, 0.05); n.connect(f); f.connect(g); g.connect(out); n.start(t0, Math.random()); n.stop(t0 + 0.06);
  }

  function _tone(freq, dur, vol, type = 'sine', delay = 0) {
    const c = typeof SFX !== 'undefined' && SFX.context ? SFX.context() : null;
    if (!c) return;
    const v = vol * (SFX.getVolume ? SFX.getVolume() : 1), t0 = c.currentTime + delay;
    const o = c.createOscillator(), gn = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(_bus(c)); o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // ── Stage II surge sound ────────────────────────────────────────
  // Heard near the station, louder zoomed in, like the machine beds. Two
  // held voices, both synthesised: the capacitor banks' whine climbing an
  // octave and more through the spin-up, with charge ticks coming faster,
  // and the mains buzz of 10 MW going through the station for the length
  // of the shot, crackling. One-shots mark the edges: the shot itself (a
  // boom under a crack), and how it ended (power-down and a chime, or a
  // sputter and the klaxon). Every tick re-arms a fade a few tenths of a
  // second out, so a paused game or a stalled tick lets the held voices die
  // away instead of droning on.
  const _SV = { spin: null, buzz: null, firing: false, spinning: false, nextTick: 0, nextCrack: 0 };
  function _surgeNear(e) {
    if (typeof Camera === 'undefined') return 0;
    const zoomT = Math.max(0, Math.min(1, (Camera.zoom - 0.31) / (3 - 0.31)));
    const cx = (Camera.x + window.innerWidth / 2 / Camera.zoom) / TILE, cy = (Camera.y + window.innerHeight / 2 / Camera.zoom) / TILE;
    const R = 150, d = Math.hypot(e.col + (e.width || 1) / 2 - cx, e.row + (e.height || 1) / 2 - cy);
    return d >= R ? 0 : (0.45 + 0.55 * zoomT) * (1 - d / R);
  }
  // A held voice: two detuned oscillators through a low-pass, with an
  // optional tremolo, into a gain the caller moves.
  function _voice(c, type, f, cutoff, trem) {
    const o1 = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    o1.type = o2.type = type; o1.frequency.value = f; o2.frequency.value = f * 1.006;
    lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 4;
    g.gain.value = 0;
    o1.connect(lp); o2.connect(lp);
    let lfo = null;
    if (trem) {
      const tg = c.createGain(), lg = c.createGain(); lfo = c.createOscillator();
      lfo.frequency.value = trem; lg.gain.value = 0.45; tg.gain.value = 0.55;
      lfo.connect(lg); lg.connect(tg.gain); lp.connect(tg); tg.connect(g); lfo.start();
    } else lp.connect(g);
    g.connect(_bus(c)); o1.start(); o2.start();
    return { o1, o2, lp, g, lfo };
  }
  function _voiceSet(c, v, level, f, cutoff) {
    const t = c.currentTime;
    for (const p of [v.g.gain, v.o1.frequency, v.o2.frequency, v.lp.frequency]) p.cancelScheduledValues(t);
    v.g.gain.setTargetAtTime(level, t, 0.06);
    v.g.gain.setTargetAtTime(0, t + 0.6, 0.15);                   // the dead man's fade, re-armed every tick
    if (f) { v.o1.frequency.setTargetAtTime(f, t, 0.05); v.o2.frequency.setTargetAtTime(f * 1.006, t, 0.05); }
    if (cutoff) v.lp.frequency.setTargetAtTime(cutoff, t, 0.05);
  }
  function _voiceStop(c, v, fall = 0.25) {
    if (!v) return;
    const t = c.currentTime;
    v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, fall / 3);
    for (const o of [v.o1, v.o2, v.lfo]) if (o) o.stop(t + fall * 2 + 0.1);
  }
  function _surgeSound(e, dt) {
    const c = typeof SFX !== 'undefined' && SFX.context ? SFX.context() : null;
    if (!c) return;
    const s = surge(DayNight.hour()), on = !!e.powered;
    const spin = on && s.spinUp && dt > 0, firing = on && s.firing && dt > 0;
    const near = _surgeNear(e), vol = (SFX.getVolume ? SFX.getVolume() : 1) * near;
    const now = c.currentTime;

    // Spin-up: the whine climbs from 70 Hz to over 600, opening up as it goes.
    if (spin) {
      const u = Math.max(0, Math.min(1, (s.ph - 0.85) / 0.15));
      if (!_SV.spin) _SV.spin = _voice(c, 'sawtooth', 70, 300, 0);
      _voiceSet(c, _SV.spin, vol * (0.015 + 0.09 * u * u), 70 * Math.pow(9, u), 300 + 3200 * u);
      if (near > 0.02 && now >= _SV.nextTick) {                       // the charge ticks, faster and higher
        _tone(1400 + 1600 * u, 0.035, 0.06 * near + 0.08 * near * u, 'square');
        _SV.nextTick = now + 0.55 - 0.48 * u;
      }
    } else if (_SV.spin) { _voiceStop(c, _SV.spin, 0.15); _SV.spin = null; }
    _SV.spinning = spin;

    // The shot.
    if (firing && !_SV.firing && near > 0.02) {
      _sweep(120, 26, 3.2, 0.7 * near, 'sine');                      // the boom
      _sweep(260, 45, 1.4, 0.28 * near, 'triangle');
      _noise(0.3, 0.7 * near, 7000, 2200, 0.01, 0.5);                 // the crack
      _noise(2.4, 0.4 * near, 2400, 160, 0.02, 0.7);                  // and the roll after it
      _sweep(2400, 300, 0.4, 0.12 * near, 'sawtooth');
      if (typeof Camera !== 'undefined' && near > 0.25) Camera.shake?.(2 + 5 * near);
    }
    if (firing) {
      const k = Math.sin(Math.min(1, s.ph / SURGE_FRAC) * Math.PI);
      if (!_SV.buzz) _SV.buzz = _voice(c, 'sawtooth', 50, 600, 9);
      _voiceSet(c, _SV.buzz, vol * (0.06 + 0.12 * k), 50 + 6 * k, 500 + 1400 * k);
      if (near > 0.02 && now >= _SV.nextCrack) {                      // arcs crackling across the yard
        _noise(0.03 + 0.09 * Math.random(), (0.12 + 0.3 * Math.random()) * near, 3000 + 5000 * Math.random(), 1500, 0.05, 0.6);
        if (Math.random() < 0.25) _sweep(900 + 900 * Math.random(), 120, 0.18, 0.1 * near, 'sawtooth');
        _SV.nextCrack = now + 0.05 + 0.35 * Math.random() * (1.2 - k);
      }
    } else if (_SV.buzz) { _voiceStop(c, _SV.buzz, _SV.firing && on ? 1.2 : 0.1); _SV.buzz = null; }
    _SV.firing = firing;
  }
  // How a surge ended, called the tick it's scored.
  function _surgeEndSound(e, ok) {
    const near = _surgeNear(e);
    if (near < 0.02) return;
    if (ok) {
      // Held: the main contactors slam shut on the converters, a deep hit
      // lands under them, the banks wind down, and a dark low power chord
      // (D, A, D) swells in the hall. (Was a bright major-arpeggio chime,
      // which read as a UI jingle rather than 10 MW going home.)
      _clank(0.55 * near);
      _impact(0.7 * near, 1.15, 0.1);
      _sweep(260, 30, 3.0, 0.2 * near, 'triangle');                  // the banks running down
      _noise(2.0, 0.13 * near, 900, 80, 0.05, 0.8);
      _pad([36.71, 55.0, 73.42], 3.4, 0.11 * near, 0.18);
    } else {
      for (let i = 0; i < 5; i++) _noise(0.06 + 0.05 * Math.random(), 0.35 * near, 900 + 700 * Math.random(), 300, 0.05, 1, i * 0.11 + Math.random() * 0.05);
      _sweep(140, 28, 1.1, 0.45 * near, 'sawtooth');
      for (let i = 0; i < 3; i++) { _tone(880, 0.2, 0.08 * near, 'square', 0.5 + i * 0.5); _tone(660, 0.2, 0.08 * near, 'square', 0.75 + i * 0.5); }
    }
  }

  // ── Save / load ─────────────────────────────────────────────────
  function serialise() { return { phase: phase === 'victory' ? 'stage4' : phase, funded, base, surges, heldSec, exported, exportOn, doneDay, seenStage, fwUntil: FW.until, lineLive }; }
  function loadState(d) {
    reset();
    if (!d) return;
    phase = PH.includes(d.phase) ? d.phase : 'dormant';
    // A save from before stage 1 moved to D-He3 has no `dhe3` baseline;
    // _s1Burned() then counts every D-He3 pellet burned, so it can't stall.
    funded = !!d.funded; base = d.base || base; surges = d.surges | 0; heldSec = +d.heldSec || 0;
    exported = +d.exported || 0; exportOn = d.exportOn !== false; doneDay = d.doneDay | 0;
    // Saves from before Ignition counted stages from Foundations.
    seenStage = d.seenStage ?? -1;
    if (d.base && d.base.dt === undefined && seenStage >= 0) seenStage++;
    base = { dhe3: 0, dt: 0, ...base };
    FW.until = +d.fwUntil || 0;
    lineLive = d.lineLive !== false;          // older saves in stage III/IV were already live
    // A save taken during the ceremony's last moments replays the final day's end.
    if (phase === 'stage4' && heldSec >= S4_HOURS * hourLen()) heldSec = S4_HOURS * hourLen() - 1;
  }
  function reset() {
    phase = 'dormant'; funded = false; base = { dhe3: 0, dt: 0 }; surges = 0; heldSec = 0;
    exported = 0; exportOn = true; doneDay = 0; seenStage = -1; lineLive = true;
    doneSlot = -1; pend = null; prevPowered = null; lastFx = null; lastFail = false; seenDhe3 = null; seenDt = null;
    FW.rockets.length = 0; FW.stars.length = 0; FW.smoke.length = 0; FW.flare = 0; FW.sites = null; FW.until = 0; FW.next = 0; FW.last = 0;
    closeDossier();
    document.getElementById('btn-meridian')?.remove();
  }

  // Dev: jump straight to a phase (console: NationalProject.devPhase('stage3')).
  function devPhase(p) {
    if (!PH.includes(p)) return PH;
    if (p === 'ignition') { phase = 'briefed'; _beginIgnition(); }
    else if (p === 'stage1') { phase = 'briefed'; _beginStage1(); }
    else if (pi(p) >= pi('stage2') && pi(p) <= pi('stage4')) { phase = p; _startStage(STAGE_PH.indexOf(p)); }
    else if (p === 'victory') { phase = 'stage4'; _completeStage(4); }
    else phase = p;
    _updateButton();
    return phase;
  }
  // Dev: play a stage's completion scene on its own, with no change to the
  // project (console: NationalProject.devScene(3) or devScene(4), the old
  // numbering for what are now Stages IV and V). `at`
  // freezes it on that second, for looking at a moment.
  function devScene(stage, at) {
    if (!S) _sceneStart(stage - 1, null);
    if (S && at !== undefined) {
      S.fixedT = at;
      _sceneCamera(at); _sceneTick(at, 0.05); _sceneDraw(at);   // drawn now too, for a still
    }
    return !!S;
  }

  // The station's info panel button (entity_info_panel.js) — delegated,
  // because that panel rebuilds its buttons every tick.
  document.addEventListener('mousedown', ev => {
    if (ev.target.closest && ev.target.closest('[data-open-meridian]')) { ev.preventDefault(); openDossier(); }
  });

  return {
    tick, demandKW, surge, incomeNow, stationDue, named, visual, renderWorld, renderFireworks, setFestiveFireworks, openDossier, closeDossier,
    // The same sky, for another scene to run on its own canvas (CompanyHQ's unveiling).
    fw: { step: _fwStep, draw: _fwDraw, load: _loadPops, reset() { FW.rockets.length = 0; FW.stars.length = 0; FW.smoke.length = 0; FW.flare = 0; FW.sites = null; FW.next = 0; } },
    padFrame, isActive: () => !!V, phase: () => phase, reached: at, station, jumpToSite: _jumpSite,
    exported: () => exported,
    serialise, loadState, reset, devPhase, devScene, renderLive,
    standby, readiness, goLive,
    SURGE_KW, EXPORT_KW, FINAL_EXPORT_KW,
  };
})();
