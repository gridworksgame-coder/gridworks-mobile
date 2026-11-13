/* ═══════════════════════════════════════════════════════════════════
   CONTRACT SYSTEM
   ───────────────
   The contract board, travel to and from a job site, and the live
   completion checklist. See docs/CONTRACTS_DESIGN.md.

   Build-order step 2: one hand-authored site, no offer timers and no
   generation yet — enough to answer whether the loop is fun before the
   tuning-heavy pieces (§7 home-grid exposure, §8 payout) get built on
   top of it.

   TRAVEL — how the world swap works
   ─────────────────────────────────
   The world is a single fixed grid (COLS×ROWS) and ~85 modules hold
   module-level state, so "go somewhere else" means swapping the grid
   out and back. Rather than reconstructing entities from a serialised
   form (save.js's job, and lossy to reimplement), this snapshots the
   tile array itself plus the live entity objects. Nothing is rebuilt,
   so nothing can be dropped in translation: the same objects, with all
   their runtime state, are stamped back exactly where they were.

   Water is the one exception — WaterSystem keeps its own WATER_SET
   keyed by coordinate, which would otherwise still claim home's lakes
   exist under the job site and silently block placement there.
   ═══════════════════════════════════════════════════════════════════ */
const ContractSystem = (() => {

  // ── State ────────────────────────────────────────────────────────
  let boardOpen   = false;
  // A contract is open independently of WHERE the player currently is:
  // they may travel back to their own world mid-job and return to the site
  // as often as they like while the contract stands. That means two world
  // snapshots, one for each place the player is not currently standing in.
  // Up to MAX_JOBS contracts run at once. The player can only STAND on one
  // site at a time, so each job carries its own world snapshot: the site is
  // held in `job.snap` whenever the player is not in it, and `snap` is null
  // for exactly the one they are standing in. Home is a single snapshot
  // because there is only ever one home.
  const MAX_JOBS = 3;
  let jobs     = [];        // [{ contract, site, reqs, bounds, markers, advance, remaining, warned, lastResults, snap }]
  let atJob    = -1;        // index into jobs of the site the player is on, or -1 for home
  let panelJob = 0;         // which job the checklist panel shows while home
  let homeSnap = null;      // the player's world, held while they are on any site
  let banner      = null;   // { title, sub, until } arrival card

  // The job the player is standing in, or null when they are home.
  function currentJob() { return atJob >= 0 ? jobs[atJob] || null : null; }
  // The job the checklist panel is showing: on site that is always the one
  // underfoot, at home it is whichever tab the player last picked.
  function shownJob() {
    if (atJob >= 0) return jobs[atJob] || null;
    if (!jobs.length) return null;
    if (panelJob >= jobs.length) panelJob = jobs.length - 1;
    return jobs[panelJob];
  }

  // ── The board's offers (§2) ──────────────────────────────────────
  //
  // Offers arrive on a randomised cadence, sit for a few days, and expire
  // whether or not the player looked — seeing one gone is most of what
  // sells the board as a live thing rather than a shop.
  //
  // The cap is also the anti-cherry-picking mechanism: an offer being
  // ignored occupies a slot and blocks a better one from arriving, so
  // sitting on the board waiting for a perfect job has a real cost. That
  // is why there is no decline penalty.
  const MAX_OFFERS     = 10;     // the board holds up to ten offers (one per site)
  const maxOffers = () => MAX_OFFERS;
  // How many offers a successful sweep turns up: one to five, with two or
  // three by far the most likely. Capped by board space.
  const SWEEP_FINDS = [[1, 0.15], [2, 0.35], [3, 0.30], [4, 0.13], [5, 0.07]];
  function rollSweepFinds() {
    let r = Math.random();
    for (const [n, w] of SWEEP_FINDS) { if (r < w) return n; r -= w; }
    return 3;
  }
  // A contract perk can add to what a sweep turns up.
  const _finds = () => rollSweepFinds() + ContractPerks.extraFinds();
  const SHELF_MIN_DAYS = 3;
  const SHELF_MAX_DAYS = 6;
  const REPOST_MIN_DAYS = 1;
  const REPOST_MAX_DAYS = 3;

  let offers   = [];             // [{ contractId, siteId, postedAt, expiresAt }]
  let boardSort = 'pay';         // how the board lists offers: pay | size | deadline | expiry
  let repostAt = new Map();      // siteId -> homeClock before which it won't offer again

  // ── Searching for work (§2) ──────────────────────────────────────
  //
  // Work no longer turns up on its own. The beacon sweeps for it when the
  // player tells it to, the way a survey station scans for deposits: press
  // the button, pay for the power, wait. An idle beacon costs nothing to
  // own and finds nothing.
  //
  // How long a sweep takes, in in-game hours.
  //
  // Three bands rather than one curve. The shape wanted is "usually most
  // of a day, occasionally lucky, occasionally a slog", and a single
  // skewed roll cannot hit all three at once — pull the tail out far
  // enough to reach three days and the middle drifts with it.
  //
  // The typical band is rolled as the average of two numbers, so it peaks
  // near the middle of its range (around 21 hours) instead of being flat
  // across it. The outer bands stay flat: a quick find is a quick find.
  const SEARCH_BANDS = [
    { chance: 0.04, min: 2,  max: 6,  bell: false },   // lucky — rare
    { chance: 0.78, min: 6,  max: 36, bell: true  },   // the usual, 6h to 1.5 days
    { chance: 0.18, min: 36, max: 72, bell: false },   // a slog, out to 3 days
  ];

  let searching     = false;   // is the beacon sweeping right now
  let searchElapsed = 0;       // seconds of home time spent on this sweep
  let searchTarget  = 0;       // seconds this sweep will take (hidden)

  // Offers run on their own clock rather than DayNight, which is set to
  // site time during a contract and jumps on arrival/return. It only
  // advances while the player is at home, which matches the rest of step
  // 2: home is frozen for the duration of a trip.
  let homeClock = 0;

  function getOffers() { return offers; }

  // How long this sweep will take, in seconds of home time.
  function rollSearchTime() {
    let roll = Math.random(), band = SEARCH_BANDS[SEARCH_BANDS.length - 1];
    for (const b of SEARCH_BANDS) {
      if (roll < b.chance) { band = b; break; }
      roll -= b.chance;
    }
    // Two rolls averaged is a triangular distribution — same range, mass
    // in the middle instead of spread evenly across it.
    const frac  = band.bell ? (Math.random() + Math.random()) / 2 : Math.random();
    const hours = band.min + frac * (band.max - band.min);
    // A contract perk can make sweeps quicker.
    return hours * DayNight.secondsPerGameHour() * ContractPerks.sweepMult();
  }

  // ── Search control ───────────────────────────────────────────────

  // Why a sweep cannot start right now, or null when it can.
  function searchBlocker() {
    if (!beacon())              return 'No beacon built';
    if (!boardAvailable())      return 'Beacon has no power';
    if (searching)              return 'Already searching';
    if (offers.length >= maxOffers()) return 'Board is full';
    return null;
  }

  function canSearch() { return searchBlocker() === null; }

  function startSearch() {
    if (!canSearch()) return false;
    searching     = true;
    searchElapsed = 0;
    searchTarget  = rollSearchTime();
    applyBeaconDraw();
    MessageLog.add('Beacon sweeping for contract work', '#5aa8ff');
    return true;
  }

  function cancelSearch() {
    if (!searching) return false;
    searching     = false;
    searchElapsed = 0;
    searchTarget  = 0;
    applyBeaconDraw();
    MessageLog.add('Beacon sweep stopped', '#7a8a99');
    return true;
  }

  // The beacon idles at 3 kW and sweeps at 12. PowerNetwork reads
  // `_activePowerInput` in preference to the def (power_network.js:737),
  // which is the same hook the survey station uses for its scan draw.
  function applyBeaconDraw() {
    const b = beacon();
    if (!b) return;
    const def = EntityDefs[T.BEACON] || {};
    b._activePowerInput = searching ? (def.searchPowerInput || 12) : (def.powerInput || 0);
  }

  function isSearching() { return searching; }

  // What the beacon's panel needs to draw itself. `remaining` is
  // deliberately absent — the whole point of a random sweep is that the
  // player cannot see the answer coming.
  function searchStatus() {
    return {
      searching,
      elapsed: searchElapsed,
      blocker: searchBlocker(),
      watts:   searching ? ((EntityDefs[T.BEACON] || {}).searchPowerInput || 12) : ((EntityDefs[T.BEACON] || {}).powerInput || 0),
    };
  }

  function postOffer(ignoreCooldown = false) {
    // One offer per site at a time — two simultaneous jobs at the same
    // place would read as a duplicate rather than as a busy world.
    const taken = new Set(offers.map(o => o.siteId));
    const pool  = ContractSites.availableSiteIds().filter(id =>
      !taken.has(id) && (ignoreCooldown || homeClock >= (repostAt.get(id) || 0)));
    if (!pool.length) return false;

    // A client who knows the player's work may just want the last job again.
    // Those clients are mostly early sites, which the tier weighting below all
    // but never picks once the player has moved on (about 1 offer in 110), so
    // repeat orders get a slot of their own. Never more than one on the board
    // and none while the crew is out, so the other offers stay open to new work.
    const roomForRepeat = crewsOut() < MAX_CREWS && !offers.some(o => String(o.contractId).startsWith('rep_'));
    const repeatable = roomForRepeat ? pool.filter(canRepeat) : [];
    const ownSlot = repeatable.length > 0 && Math.random() < REPEAT_SHARE;
    // Otherwise weighted toward sites near the player's own research tier.
    const siteId = ContractSites.pickSite(ownSlot ? repeatable : pool);
    const c = ownSlot || (roomForRepeat && canRepeat(siteId) && Math.random() < REPEAT_CHANCE) ? repeatOrder(siteId)
                                                                                                : ContractSites.generate(siteId);
    if (!c) return false;   // nothing unlocked to build with yet

    const days = SHELF_MIN_DAYS + Math.random() * (SHELF_MAX_DAYS - SHELF_MIN_DAYS);
    offers.push({ contractId: c.id, siteId, postedAt: homeClock,
                  expiresAt: homeClock + days * dayLength() });
    if (boardOpen) renderBoard();
    return true;
  }

  function tickOffers(dt) {
    // No beacon, no clock. Offers cannot arrive or expire before the
    // player has anything to hear them on.
    if (!beacon()) return;

    homeClock += dt;
    // Watch for the player getting a new form of power running, so the jobs
    // that ask for it can start to appear (see ContractSites.noteEstablished).
    ContractSites.noteEstablished();

    // The draw follows the sweep, and is re-applied every tick rather than
    // only on the button: the beacon entity is swapped out wholesale by
    // the home/site world swap and rebuilt by a load, and a stale
    // `_activePowerInput` on a fresh entity would either bill the player
    // for a sweep that is not running or run one for free.
    applyBeaconDraw();

    // Expire, loudly enough that the player notices the board moving on.
    for (let i = offers.length - 1; i >= 0; i--) {
      if (homeClock < offers[i].expiresAt) continue;
      const siteId = offers[i].siteId;
      const site   = ContractSites.getSite(siteId);
      offers.splice(i, 1);
      repostAt.set(siteId, homeClock + (REPOST_MIN_DAYS + Math.random() *
                                       (REPOST_MAX_DAYS - REPOST_MIN_DAYS)) * dayLength());
      if (site) MessageLog.add(`${site.client} withdrew their contract offer`, '#7a8a99');
      if (boardOpen) renderBoard();
    }

    if (!searching) return;

    // A sweep only advances while the beacon actually has its 12 kW. Losing
    // power does not cancel it — the search is held where it is until the
    // grid can carry it again, which is what makes the draw a real cost
    // rather than a number on a panel.
    if (!boardAvailable()) return;

    searchElapsed += dt;
    if (searchElapsed < searchTarget) return;

    // Found something — or found that there is nothing to find. Either way
    // the sweep is over; the player decides whether to pay for another.
    finishSweep();
  }

  // Ends a sweep and posts whatever it turned up, with the log line, card
  // and toast. Shared by the beacon (tickOffers) and the dev panel's FIND
  // CONTRACT, which passes ignoreCooldown so it always has sites to draw on.
  // Returns how many offers were found.
  function finishSweep(ignoreCooldown = false) {
    searching     = false;
    searchElapsed = 0;
    searchTarget  = 0;
    applyBeaconDraw();

    // A successful sweep turns up 1–5 jobs at once (2 or 3 most often). Each is its own
    // postOffer(), so every find still honours one-offer-per-site and the
    // repost cooldowns; the batch simply stops early when the board fills
    // or the available sites run out.
    const want  = _finds();
    const found = [];
    while (found.length < want && offers.length < maxOffers() && postOffer(ignoreCooldown)) {
      found.push(offers[offers.length - 1]);
    }

    if (found.length) {
      const sites  = found.map(o => ContractSites.getSite(o.siteId));
      const names  = sites.map(st => st ? st.client : 'A client');
      const client = names[0];
      const site   = sites[0];
      const many   = found.length > 1;
      for (const name of names) MessageLog.add(`${name} has work: open the contract board`, '#40d090');
      SFX.goodConnect?.();
      // A sweep can run for up to three in-game days, so the player is
      // almost never watching the beacon at the moment it lands. A log
      // line alone is too quiet for the one event the whole system exists
      // to produce — pin a card that stays up until the board is actually
      // opened, and toast alongside it for anyone looking at the map now.
      //
      // Dismiss-then-push rather than a plain push: NotificationStack
      // dedups by tag, so a second find while the first card is still up
      // would otherwise be dropped and leave the card naming a stale
      // client.
      NotificationStack.dismissTag('contractoffer');
      NotificationStack.push({
        icon: '📡',
        title: many ? `${found.length} Contracts Found` : 'Contract Found',
        message: many
          ? `${names.join(', ')}. Click to open the contract board.`
          : `${client}${site ? `: ${site.place}` : ''}. Click to open the contract board.`,
        color: '#40d090',
        border: '#1a6048',
        tag: 'contractoffer',
        glow: true,
        contract: true,   // the board's, not either city's: never labelled HOME
        onClick: () => { openBoard(); },
      });
    } else {
      // Every site is either already on the board or inside its cooldown.
      // Saying so is better than a silent stop that reads as a bug.
      MessageLog.add('Beacon sweep finished: nobody is hiring right now', '#7a8a99');
    }
    return found.length;
  }

  // ── Dev helpers ──────────────────────────────────────────────────
  // Waiting out the arrival cadence to see a populated board makes the
  // board tedious to work on, so these bypass the cooldowns entirely.
  // Not used by anything in normal play.
  function devPostOffer()  { return postOffer(true); }
  function devFindContract() { return finishSweep(true); }
  function devFillBoard()  {
    let posted = 0;
    while (offers.length < maxOffers() && postOffer(true)) posted++;
    return posted;
  }
  function devClearOffers() {
    const n = offers.length;
    offers = [];
    if (boardOpen) renderBoard();
    return n;
  }
  // Push every current offer to the brink so the withdrawal path can be
  // watched without simulating days of home time.
  function devExpireOffers() {
    for (const o of offers) o.expiresAt = homeClock;
    const n = offers.length;
    tickOffers(0);
    return n;
  }

  // "Away" means the grid currently holds a job site rather than the
  // player's world — that, not the existence of a contract, is what
  // decides whether home systems may run.
  function isAway()      { return atJob >= 0; }
  function hasContract() { return jobs.length > 0; }
  function jobCount()    { return jobs.length; }
  function canAcceptMore() { return jobs.length < MAX_JOBS; }
  function isOpen()    { return boardOpen; }
  function getActive() { return shownJob(); }

  // The board is only reachable through a powered beacon.
  function beacon() {
    for (const e of EntityRegistry.getByType(T.BEACON)) return e;
    return null;
  }
  function boardAvailable() {
    const b = beacon();
    return !!(b && b.powered);
  }

  // ── World swap ───────────────────────────────────────────────────

  function snapshotWorld() {
    return {
      // Row-by-row copy of the tile array. Faithful by construction —
      // multi-tile and irregular footprints (dams, roads) come back
      // exactly as they were because nothing is recomputed.
      tiles:    GridManager.tiles.map(row => row.slice()),
      // Trucks live in world space and are not stamped onto the grid,
      // so the tile copy alone would lose them.
      entities: Array.from(EntityRegistry.all()),
      water:    WaterSystem.save(),
      // Dams and reservoirs are module state, not entities: without this a
      // dam built on a job site would still be counted at home, and home's
      // would be lost on the way out.
      reservoirs: (typeof ReservoirSystem !== 'undefined') ? ReservoirSystem.save() : null,
      camera:   { x: Camera.x, y: Camera.y, zoom: Camera.zoom },
      elapsed:  DayNight.getElapsed(),
      // `raining` is no longer read on the way home — restoreWeather resyncs
      // from the weather event instead — but it is still written so a save
      // from this build stays readable by a build that does read it.
      weather:  { cover: CloudState.cover, target: CloudState.target, raining: RainSystem.isActive() },
      // Snow on the ground belongs to the world it fell on: home's must not
      // follow the crew to a summer site, nor a winter site's come home.
      frost:    FrostSystem.serialise(),
      dust:     DustSystem.serialise(),   // and a dust storm's dust likewise
      // The player's own city keeps earning and costing while they are away
      // on a job. Its entities are not on the grid to be billed, so its rate
      // at the moment of departure is carried across and applied for the
      // duration — consistent with home being frozen for the trip.
      economy:  { income: Economy.income, upkeep: Economy.upkeep },
      // What is riding this world's conveyors. BeltCargo is one module for
      // whichever world is on the grid, and it drops every item and every
      // "this line is running" mark whose buildings are not there — so a
      // trip away used to bring each belt back empty and unprimed, and a
      // machine at the end of a long one (a fusion reactor's pellet line)
      // sat starved until the first new item had travelled the whole belt.
      belts:    (typeof BeltCargo !== 'undefined') ? BeltCargo.serialise() : null,
    };
  }

  // The frozen home income/upkeep to apply while the player is standing on
  // a job site, or null when they are home and it should be computed live.
  function homeEconomyRate() {
    return (atJob >= 0 && homeSnap) ? homeSnap.economy : null;
  }

  // Arriving under different sky from the one you left is the cheapest
  // "somewhere else" cue there is (§6.2) — no new art, just state.
  //
  // Cloud is set through CloudState.load() rather than triggerBurst():
  // triggerBurst arms a private eventTimer that would keep running after
  // the trip and lock the player's own weather when they got home.
  // The visuals go through WeatherEventSystem.setVisualOverride rather than
  // RainSystem directly. Rain is a SET of systems — droplets, the splashes
  // under them, the audio, and a rainstorm's lightning and debris — and this
  // used to flip RainSystem alone, which is what produced two glitches that
  // survived the trip:
  //
  //   • stopping home's rain to stand under a clear site sky left the
  //     splashes and storm audio running: droplets hitting the ground with
  //     no droplets in the air.
  //   • the sky was set behind WeatherEventSystem's back, so the WEATHER tab
  //     (which reads getActiveEvent()) still said CLEAR while it rained, and
  //     a reload — which rebuilds the visuals from the event — was the only
  //     way to put them back in step.
  function applyWeather(kind) {
    if (kind === 'rain') {
      CloudState.load(0.88, 0.88);
      WindState.triggerStorm(0.35, 300);
    } else if (kind === 'overcast') {
      CloudState.load(0.72, 0.72);
    } else if (kind === 'clear') {
      CloudState.load(0.06, 0.06);
      WindState.triggerCalm();
    } else if (kind === 'snow') {
      CloudState.load(0.82, 0.82);
    } else if (kind === 'blizzard') {
      CloudState.load(0.97, 0.97);
      WindState.triggerStorm(0.9, 300);
    }
    WeatherEventSystem.setVisualOverride(kind || 'clear');   // the kind itself: the WEATHER tab names the site's sky from it
  }

  // ── A site's weather moves on ────────────────────────────────────
  // The sky a crew arrives under is the offer's (contract.arrival), but a
  // job lasts days, and one unbroken afternoon of rain is not weather. Every
  // SITE_WX_HOURS of site time the sky is drawn again from what that season
  // gets: a pure function of the job and the hour, so it is the same sky
  // after a save and a load, and after a trip home and back.
  // Solar jobs keep the sky they were offered for the whole job: an
  // unlucky run of rain would make them unwinnable.
  const SITE_WX_HOURS = 5;
  const SITE_WX = {
    spring: ['clear', 'clear', 'overcast', 'overcast', 'rain'],
    summer: ['clear', 'clear', 'clear', 'overcast', 'rain'],
    autumn: ['clear', 'overcast', 'overcast', 'rain', 'rain'],
    winter: ['clear', 'overcast', 'overcast', 'snow', 'snow', 'blizzard'],
  };
  function _siteWeatherNow(job) {
    const arrival = job.contract.arrival || job.site.arrival || {};
    const gen = job.site.generation || [];
    if (!arrival.season || gen.includes(T.SOLAR) || gen.includes(T.SOLAR2)) return arrival.weather || 'clear';
    const span = SITE_WX_HOURS * DayNight.secondsPerGameHour();
    const period = Math.floor(DayNight.getElapsed() / span);
    if (job.wxPeriod0 === undefined) job.wxPeriod0 = period;      // the spell they arrived in
    if (period === job.wxPeriod0) return arrival.weather || 'clear';
    let h = 2166136261;
    for (const ch of String(job.contract.id) + ':' + period) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    let table = SITE_WX[arrival.season] || SITE_WX.spring;
    if (job.site.biome === 'arid') table = table.map(w => w === 'rain' ? 'overcast' : w);   // dry country
    return table[(h >>> 0) % table.length];
  }
  // Put the site's sky in step with what it should be right now. Run on
  // arrival, on every return to the site, and from tick().
  function syncSiteWeather(force) {
    const job = currentJob();
    if (!job) return;
    const kind = _siteWeatherNow(job);
    if (!force && job._wxKind === kind) return;
    job._wxKind = kind;
    applyWeather(kind);
  }
  // The season the player is standing in, or null at home (read by Seasons).
  function siteSeason() {
    const job = currentJob();
    return job ? ((job.contract.arrival || {}).season || null) : null;
  }

  function restoreWeather(w) {
    if (!w) return;
    CloudState.load(w.cover, w.target);
    // Coming home is a resync, not a replay: the home weather EVENT is the
    // authority on what the player's sky is doing, and it was frozen for the
    // duration of the trip, so putting the visuals back in step with it
    // restores exactly the sky they left. The old code instead replayed the
    // snapshot's `raining` flag onto RainSystem, which could leave rain
    // falling with no event behind it to ever stop it again.
    WeatherEventSystem.syncVisuals();
  }

  // ── Biome grade (§6.5) ───────────────────────────────────────────
  //
  // A colour grade over the whole scene rather than new terrain art: a
  // multiply pass with a light tint warms or cools everything at once,
  // which is most of what makes one place look climatically unlike
  // another. Reusing the existing tiles keeps this cheap enough to be
  // worth doing for every site.
  const BIOMES = {
    coastal:    { tint: '#93b6d8', alpha: 0.30 },   // cold, wet, blue-grey
    arid:       { tint: '#ffd49a', alpha: 0.34 },   // warm, dusty, sunbleached
    industrial: { tint: '#b6bcae', alpha: 0.26 },   // flat, desaturated, sooty
    market:     { tint: '#ffc890', alpha: 0.30 },   // low evening sun, warm and amber
    nocturne:   { tint: '#6f86c4', alpha: 0.42 },   // deep cold blue — the small hours
  };

  function renderGrade(ctx) {
    const job = currentJob();
    if (!job) return;
    const b = BIOMES[job.site.biome];
    if (!b) return;
    const cv = document.getElementById('canvas');
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = b.alpha;
    ctx.fillStyle = b.tint;
    ctx.fillRect(Camera.x, Camera.y,
                 (cv ? cv.width : 1280) / Camera.zoom,
                 (cv ? cv.height : 720) / Camera.zoom);
    ctx.restore();
  }

  // ── Site ambience (§6.6) ─────────────────────────────────────────
  //
  // A dedicated loop per biome, layered over the game's usual outdoor
  // bed. Its own Audio element rather than reusing RainAudio /
  // HeavyWindAudio: those are driven by the weather systems and would
  // fight us for start/stop. Only files that already exist are used —
  // a missing src fails silently and would be invisible until someone
  // noticed the silence.
  //
  // Arid and nocturne sites have no loop of their own. They used to play
  // heavywind.mp3 quietly, but that file IS the storm (HeavyWindAudio), so
  // a clear desert site sounded like the storm the player had left at home.
  // They get the usual outdoor bed until there is a wind that isn't a gale.
  // Industrial sites likewise: theirs was electric hum.mp3, which is the
  // sound of a live grid (GridHum), played far louder than the game ever
  // plays it and over a site with nothing connected yet.
  //
  // The loops go through makeSeamlessBed, so they sit on the beds bus with
  // every other bed and the pause menu fades them, and their level is
  // scaled by the player's sound volume as they start. They used to be bare
  // <audio> elements at a fixed volume, which ignored both.
  const AMBIENCE = {
    coastal:    { src: 'audio/sfx/lake-wavelet-27909.mp3', volume: 0.34 },
    market:     { src: 'audio/sfx/general ambience.mp3',   volume: 0.30 },
  };

  let ambience = null, ambienceFade = null;

  function clearAmbienceFade() {
    if (ambienceFade) { clearInterval(ambienceFade); ambienceFade = null; }
  }

  function startAmbience(biome) {
    const a = AMBIENCE[biome];
    stopAmbience();
    if (!a) return;
    clearAmbienceFade();
    ambience = makeSeamlessBed(a.src);
    ambience.volume = 0;
    ambience.start();
    const target = a.volume * (typeof SFX !== 'undefined' && SFX.getVolume ? SFX.getVolume() : 1), steps = 24, inc = target / steps;
    const el = ambience;
    ambienceFade = setInterval(() => {
      if (ambience !== el) { clearAmbienceFade(); return; }
      el.volume = Math.min(target, el.volume + inc);
      if (el.volume >= target) clearAmbienceFade();
    }, 2000 / steps);
  }

  function stopAmbience() {
    clearAmbienceFade();
    if (!ambience) return;
    const el = ambience;
    ambience = null;
    const steps = 20, dec = (el.volume || 0) / steps || 1;
    const fade = setInterval(() => {
      el.volume = Math.max(0, el.volume - dec);
      if (el.volume <= 0) { clearInterval(fade); el.stop(); }
    }, 900 / steps);
  }

  // Undo/redo holds live entity references and adjusts the balance, and
  // HistoryManager.clear() was never called anywhere — so the stack
  // spanned the home/site swap. An undo taken on a job site could apply
  // to an entity belonging to the player's own city (stamping it onto the
  // site grid, or refunding its cost into the site's economy), and an
  // undo taken back home could resurrect a job-site building into the
  // city. Neither world should be able to reach into the other, so the
  // history is dropped whenever the world underneath it changes.
  function dropHistoryAcrossWorlds() {
    if (typeof HistoryManager !== 'undefined' && HistoryManager.clear) HistoryManager.clear();
  }

  function clearWorld() {
    for (const e of Array.from(EntityRegistry.all())) EntityRegistry.remove(e);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) GridManager.tiles[r][c] = null;
    // Drop home's water registry — a stale WATER_SET would mark tiles
    // under the job site as lake and refuse placement on them.
    WaterSystem.load([]);
    if (typeof ReservoirSystem !== 'undefined') ReservoirSystem.load(null);
  }

  // `quiet` is the swap a save makes (saveFromSite): the same world install,
  // but the player is not actually going anywhere, so their undo history is
  // kept and the sky's rain is left alone (only the cloud figures a save
  // reads are put in place).
  function restoreWorld(snap, quiet) {
    if (!quiet) dropHistoryAcrossWorlds();
    clearWorld();

    // Rebuild WATER_SET *before* the tiles go back. placeWaterTile refuses
    // to register a tile that is already occupied
    // (water_vegetation_system.js:17), so replaying the saved keys onto a
    // grid that already holds the restored water entities would leave
    // WATER_SET empty — and isWater() would then report the player's lakes
    // as buildable ground. The throwaway entities this creates are
    // discarded a few lines down; only the coordinate keys matter.
    WaterSystem.load(snap.water);
    for (const e of Array.from(EntityRegistry.all())) EntityRegistry.remove(e);
    if (quiet) { if (snap.weather) CloudState.load(snap.weather.cover, snap.weather.target); }
    else restoreWeather(snap.weather);
    if (snap.frost !== undefined) FrostSystem.load(snap.frost);
    DustSystem.load(snap.dust);

    // Mutate the existing row arrays in place: GridManager exposes `tiles`
    // by reference and other modules hold onto it.
    for (let r = 0; r < ROWS; r++) {
      const src = snap.tiles[r], dst = GridManager.tiles[r];
      for (let c = 0; c < COLS; c++) dst[c] = src[c];
    }
    for (const e of snap.entities) EntityRegistry.add(e);
    // Pipes and wires laid across water keep the water tile they sit on, so
    // removing one puts the lake back. That link isn't saved; re-make it.
    for (const e of snap.entities) {
      if ((e.type === T.PIPE || e.type === T.WIRE || e.type === T.CONVEYOR || e.type === T.POLE) && !e._underWater && WaterSystem.isWater(e.col, e.row)) e._underWater = new Entity(T.WATER, e.col, e.row);
    }
    relinkResources();
    repairTurnedFootprints();
    trimLegacyTanks();
    udgAdoptLegacy();
    // Put this world's belts back as they were left (see snapshotWorld).
    // loadState also takes every line as already running for a moment,
    // which is what a site rebuilt from a save, with no items kept, needs.
    if (typeof BeltCargo !== 'undefined') BeltCargo.loadState(snap.belts);
    // Re-link this world's dams and reservoirs now the entities are back.
    if (typeof ReservoirSystem !== 'undefined') {
      ReservoirSystem.load(snap.reservoirs || null);
      ReservoirSystem.rebuildPendingDams?.();
    }
    // Work out who has water now, not at the end of the first tick: the power
    // pass runs ahead of the pipe pass, so a world whose coal generators came
    // back reading _hasWater = false (a site rebuilt from a save) counted them
    // as off for that tick and the plant blinked out on arrival.
    if (typeof PowerNetwork !== 'undefined' && PowerNetwork.updatePipeConnectivity) PowerNetwork.updatePipeConnectivity();

    DayNight.setElapsed(snap.elapsed);
    // loadState, not centreCameraOn: the latter walks zoom in discrete 12%
    // steps via zoomAt() and can only get close, leaving the player a few
    // percent off the zoom they left at. This restores pan and zoom exactly.
    Camera.loadState({ panX: snap.camera.x, panY: snap.camera.y, zoom: snap.camera.zoom });
  }

  // A job site that has been through a save comes back from
  // rebuildSiteSnapshot() as fresh entities carrying only their saved
  // scalars — the object links between them (_linkedDeposit, the well ⇄
  // turbine pairing) are not serialised. SaveSystem.load() rebuilds those
  // for the home world only, so after a reload every geothermal well on a
  // site had no deposit and every turbine no well: the whole field sat dead
  // until each piece was removed and placed again. Only fills in what is
  // missing, so an in-session swap (links intact) is left alone.
  const DEPOSIT_OF = {
    [T.GEOWELL]: T.GEODEPOSIT, [T.COALMINE]: T.COALDEPOSIT, [T.COALMINE2]: T.COALDEPOSIT,
    [T.URANIUMMINE]: T.URANIUMDEPOSIT, [T.SULFURMINE]: T.SULFURDEPOSIT, [T.SULFURMINE2]: T.SULFURDEPOSIT,
    [T.LITHIUMMINE]: T.LITHIUMDEPOSIT, [T.RAREEARTHMINE]: T.RAREEARTHDEPOSIT, [T.HELIUMWELL]: T.HELIUMDEPOSIT, [T.HELIUMWELL2]: T.HELIUMDEPOSIT,
  };
  function relinkResources() {
    for (const type of Object.keys(DEPOSIT_OF)) {
      for (const e of EntityRegistry.getByType(type)) {
        if (e._linkedDeposit || e._depositCol === undefined) continue;
        for (const dep of EntityRegistry.getByType(DEPOSIT_OF[type])) {
          if (dep.col !== e._depositCol || dep.row !== e._depositRow) continue;
          e._linkedDeposit = dep;
          if (type === T.GEOWELL) dep._hasWell = true; else dep._hasMine = true;
          break;
        }
      }
    }
    if (typeof GeothermalSystem !== 'undefined') {
      let unpaired = false;
      for (const t of EntityRegistry.getByType(T.GEOTURBINE)) if (!t._linkedWell) { unpaired = true; break; }
      if (unpaired) {
        GeothermalSystem.relinkAll();
        // A turbine's live output isn't saved either, and PowerNetwork ticks
        // before the wells do. On a site powered only by its own field the
        // first tick would see no supply, cut the wells' pumps, and the
        // turbines could then never start. Put each one whose well was
        // powered at save time back to generating so the field picks up
        // where it left off.
        for (const t of EntityRegistry.getByType(T.GEOTURBINE)) {
          const w = t._linkedWell;
          if (!w || !w.powered || !w._linkedDeposit || w._lightningDamaged || t._lightningDamaged) continue;
          t._generating    = true;
          t._currentOutput = GeothermalSystem.getOutputPerTurbine();
        }
      }
    }
  }

  // Deterministic scatter, so a site looks the same every visit.
  function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  // A band of vegetation just outside the site, framing it. Perceived size
  // comes from density and edges, not tile count (§5) — ground that simply
  // stops reads as a small map, ground that runs into treeline reads as
  // the part of a place you happen to be working in.
  const EDGE_DEPTH = 7;
  function stampEdges(bounds) {
    const rnd = seeded(bounds.minC * 73856093 ^ bounds.minR * 19349663);
    const c0 = bounds.minC - EDGE_DEPTH, c1 = bounds.maxC + EDGE_DEPTH;
    const r0 = bounds.minR - EDGE_DEPTH, r1 = bounds.maxR + EDGE_DEPTH;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const inside = c >= bounds.minC && c <= bounds.maxC && r >= bounds.minR && r <= bounds.maxR;
        if (inside || !GridManager.inBounds(c, r) || GridManager.getEntity(c, r)) continue;
        // Denser the further out, so the treeline thickens toward the edge
        // instead of forming a hard wall right against the boundary.
        const depth = Math.max(
          Math.max(bounds.minC - c, c - bounds.maxC),
          Math.max(bounds.minR - r, r - bounds.maxR));
        if (rnd() > 0.12 + (depth / EDGE_DEPTH) * 0.5) continue;
        const e = new Entity(rnd() < 0.65 ? T.TREE : T.BUSH, c, r);
        GridManager.setEntity(c, r, e);
      }
    }
  }

  function stampSite(site, contract) {
    const o = ContractSites.origin;

    // Water first: a lake is terrain, and everything stamped afterwards
    // needs to be able to sit on top of it (or, in the client's case, to
    // have been placed clear of it by whoever authored the site).
    //
    // clearWorld() wipes WATER_SET, so a site's water has to be laid down
    // on every arrival rather than surviving from the player's own world.
    // It does survive the home/site swap and saves, because snapshotWorld()
    // stores WaterSystem.save() alongside the tiles.
    // WaterSystem.load() is the public way in — it takes the same
    // "col,row" keys save() produces and lays the tiles down itself.
    // clearWorld() has just emptied WATER_SET, so this is a fresh set
    // rather than an addition to one.
    if ((site.water || []).length || (site.river || []).length) {
      const keys = [];
      for (const rect of site.water || []) {
        for (let r = rect.minR; r <= rect.maxR; r++)
          for (let c = rect.minC; c <= rect.maxC; c++) {
            const col = c + o.col, row = r + o.row;
            if (GridManager.inBounds(col, row)) keys.push(col + "," + row);
          }
      }
      // A river is water with a direction of flow ("col,row:dc,dr"), which is
      // what a dam and a hydro turbine work from.
      for (const rect of site.river || []) {
        for (let r = rect.minR; r <= rect.maxR; r++)
          for (let c = rect.minC; c <= rect.maxC; c++) {
            const col = c + o.col, row = r + o.row;
            if (GridManager.inBounds(col, row)) keys.push(`${col},${row}:${rect.dc},${rect.dr}`);
          }
      }
      WaterSystem.load(keys);
    }

    for (const p of site.prebuilt) {
      // No job site has a Gas Station of the client's: see ensureFuelDepot.
      if (p.type === T.GASSTATION) continue;
      const col = p.col + o.col, row = p.row + o.row;
      if (!GridManager.inBounds(col, row)) continue;
      const e = new Entity(p.type, col, row);
      // Client infrastructure is theirs, not a player request — flagging
      // it would enrol it in the zone/satisfaction systems on return.
      e.fromRequest = false;
      // ...and it is not the player's to bulldoze. Without this a zone
      // delete dragged across the client's yard quietly demolished their
      // substation, lamps, cameras and water extractors — and PAID the
      // player the build cost of each one, because tryRemove() refunds
      // def.cost on everything it removes. Losing a prebuilt building
      // also makes the 'service' clause (every building on site lit)
      // impossible, so it could brick the contract outright.
      e._clientOwned = true;
      if (p.props) Object.assign(e, p.props);
      // Client businesses take their real subtype footprint (a Works Office
      // is a 3×3 office, a Shop Floor a 4×4 factory). Without this every one
      // was stamped at the bare COMMERCIAL/INDUSTRIAL def size — 1×1 — and
      // drew as a toy next to the rest of the site.
      if ((e.type === T.COMMERCIAL || e.type === T.INDUSTRIAL || e.type === T.HOUSE) && e.commercialSubtype) applySubtypeFootprint(e);
      for (let r = row; r < row + e.height; r++)
        for (let c = col; c < col + e.width; c++) GridManager.setEntity(c, r, e);
    }
  }

  // ── What the crew finds on arrival ───────────────────────────────
  //
  // A situational contract (ContractSites: storm, cleanup, disaster) carries
  // its own setup in its requirement specs. Run once, on acceptance, right
  // after the site is stamped; from then on the site snapshot holds it.
  function applySituation(contract) {
    const o = ContractSites.origin;
    for (const spec of ContractSites.requirementsFor(contract)) {
      if (spec.kind === 'repair') {
        for (const t of spec.targets || []) {
          const e = GridManager.getEntity(t.col + o.col, t.row + o.row);
          if (!e || e._lightningDamaged) continue;
          // Struck and burnt out: the fire is long over, so it neither
          // spreads nor needs dousing — it only needs a crew.
          e._lightningDamaged  = true;
          e._lightningStruckAt = performance.now() / 1000;
          e._fireCause         = 'strike';
          e._fireOut           = true;
          e._smoulderT         = 0;
        }
        PowerNetwork.recomputeWireHops();
      } else if (spec.kind === 'clear') {
        const field = spec.waste === 'oil' ? '_sludgeWaste' : '_ashWaste';
        const name  = spec.waste === 'oil' ? 'Abandoned Refinery' : 'Decommissioned Coal Unit';
        (spec.piles || []).forEach((p, i) => {
          const col = p.col + o.col, row = p.row + o.row;
          if (!GridManager.inBounds(col, row)) return;
          const e = new Entity(p.type, col, row);
          e.fromRequest    = false;
          e._clientOwned   = true;
          e._decommissioned = true;
          e.businessName   = `${name} ${i + 1}`;
          e[field]         = p.amount || 100;
          for (let r = row; r < row + e.height; r++)
            for (let c = col; c < col + e.width; c++) GridManager.setEntity(c, r, e);
        });
      }
    }
  }

  // Camera has no absolute setter (pan/zoom are getters), so drive it
  // through the same entry points input uses.
  function centreCameraOn(target) {
    const cv = document.getElementById('canvas');
    if (!cv) return;
    // Bounded: a pan limit also holds zoom at the level where the allowed
    // area fills the viewport, so the requested zoom may be unreachable —
    // an unbounded `while` would spin forever the moment a site is small
    // enough (or the window large enough) for that floor to sit above it.
    let guard = 64;
    while (Camera.zoom > target.zoom * 1.001 && guard-- > 0) {
      const before = Camera.zoom;
      Camera.zoomAt(cv.width / 2, cv.height / 2, -1);
      if (Camera.zoom === before) break;   // hit the floor
    }
    guard = 64;
    while (Camera.zoom < target.zoom * 0.999 && guard-- > 0) {
      const before = Camera.zoom;
      Camera.zoomAt(cv.width / 2, cv.height / 2, 1);
      if (Camera.zoom === before) break;   // hit the ceiling
    }
    Camera.panByScreen(-(target.x - Camera.x) * Camera.zoom, -(target.y - Camera.y) * Camera.zoom);
    Camera.panByScreen(0, 0);   // zero the inertia the jump just injected
  }

  function centreCameraOnRect(rect, zoom) {
    const cv = document.getElementById('canvas');
    if (!cv) return;
    const wx = ((rect.minC + rect.maxC + 1) / 2) * TILE;
    const wy = ((rect.minR + rect.maxR + 1) / 2) * TILE;
    centreCameraOn({ x: wx - cv.width / zoom / 2, y: wy - cv.height / zoom / 2, zoom });
  }

  // ── Arrival shot ─────────────────────────────────────────────────
  //
  // A slow drift from the client's existing town out to the site as a
  // whole, under the title card (§6.3). Three seconds of establishing
  // shot is what makes a place read as a place rather than as a level
  // that appeared around the player.
  //
  // Pan only, no zoom interpolation: Camera exposes zoom as a getter and
  // moves it in discrete multiplicative steps via zoomAt(), so animating
  // it would visibly stair-step.
  const SHOT_SECONDS = 3.2;
  let shot = null;

  function rectCentreWorld(rect) {
    return { x: ((rect.minC + rect.maxC + 1) / 2) * TILE,
             y: ((rect.minR + rect.maxR + 1) / 2) * TILE };
  }

  function startArrivalShot(bounds, markers, site) {
    const cv = document.getElementById('canvas');
    centreCameraOnRect(bounds, 0.85);
    if (!cv) return;

    // Open on the client's existing works and settle on where the work
    // actually is: "here is their yard, and here is what they want from
    // you." Ending on the work area also leaves the camera somewhere
    // useful to start building, which framing the whole site at a
    // workable zoom does not.
    const hub  = markers[site.hub];
    const work = markers[site.work];
    const from = hub  ? rectCentreWorld(hub)  : rectCentreWorld(bounds);
    const to   = work ? rectCentreWorld(work) : rectCentreWorld(bounds);
    shot = { from, to, t: 0, zoom: Camera.zoom };
    applyShot(0);
  }

  function applyShot(u) {
    const cv = document.getElementById('canvas');
    if (!cv || !shot) return;
    // Ease in-out, so it starts and ends at rest rather than snapping.
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const wx = shot.from.x + (shot.to.x - shot.from.x) * e;
    const wy = shot.from.y + (shot.to.y - shot.from.y) * e;
    centreCameraOn({ x: wx - cv.width / shot.zoom / 2, y: wy - cv.height / shot.zoom / 2, zoom: shot.zoom });
  }

  // Driven from the render loop rather than the 100ms sim tick: a camera
  // move stepped 10 times a second is visibly juddery against a 60fps
  // render. Uses real frame time, so the shot plays at the same speed
  // regardless of game speed or pause.
  function frameTick(dt) { tickShot(dt); }

  function tickShot(dt) {
    if (!shot) return;
    shot.t += dt;
    const u = Math.min(1, shot.t / SHOT_SECONDS);
    applyShot(u);
    if (u >= 1) shot = null;
  }

  // Any deliberate camera input hands control straight back — nobody
  // should have to sit through an establishing shot twice.
  function cancelShot() { shot = null; }
  document.addEventListener('mousedown', cancelShot);
  document.addEventListener('wheel', cancelShot, { passive: true });
  document.addEventListener('keydown', cancelShot);

  // ── Departure / return ───────────────────────────────────────────

  // One in-game day in seconds of DayNight elapsed.
  function dayLength() { return DayNight.secondsPerGameHour() * 24; }

  // Seconds of on-site time left before the contract lapses. DayNight is
  // ticked with the scaled sim step, so pausing the game pauses the
  // deadline too — the clock only runs while the player can actually work.
  // Held as a plain countdown rather than an absolute DayNight stamp: the
  // clock is set to site time on arrival and back to home time on return,
  // so an absolute deadline would jump every time the player travels.
  //
  // It runs whether the player is on site or back home. The client is
  // waiting either way, which is what makes going home a real trade-off
  // rather than a free pause.
  function timeLeft(job) {
    const j = job || shownJob();
    return j ? Math.max(0, j.remaining) : 0;
  }

  // A bare duration. formatLeft() is a COUNTDOWN and says so ("3h 35m
  // left"), which reads as nonsense on a stopwatch — the sweep panel
  // wants "3h 35m elapsed".
  function formatSpan(sec) {
    const gameHours = (sec / dayLength()) * 24;
    if (gameHours >= 24) {
      const d = Math.floor(gameHours / 24), h = Math.floor(gameHours % 24);
      return `${d}d ${h}h`;
    }
    if (gameHours >= 1) {
      return `${Math.floor(gameHours)}h ${Math.floor((gameHours % 1) * 60)}m`;
    }
    return `${Math.max(0, Math.ceil(gameHours * 60))}m`;
  }

  function formatLeft(sec) {
    const gameHours = (sec / dayLength()) * 24;
    if (gameHours >= 24) {
      const d = Math.floor(gameHours / 24), h = Math.floor(gameHours % 24);
      return `${d}d ${h}h left`;
    }
    if (gameHours >= 1) {
      return `${Math.floor(gameHours)}h ${Math.floor((gameHours % 1) * 60)}m left`;
    }
    return `${Math.max(0, Math.ceil(gameHours * 60))}m left`;
  }

  // Keep the player on the job. Without this they can pan off across the
  // empty remainder of the grid, which both breaks the illusion that the
  // site is a place and makes it easy to lose the work area entirely.
  // The margin lets the framing treeline stay visible.
  function applySiteCameraLimit(bounds) {
    const M = (EDGE_DEPTH + 2) * TILE;
    Camera.setPanLimit({
      minX: bounds.minC * TILE - M,
      minY: bounds.minR * TILE - M,
      maxX: (bounds.maxC + 1) * TILE + M,
      maxY: (bounds.maxR + 1) * TILE + M,
    });
  }

  // ── Travelling between home and the job site mid-contract ────────
  //
  // Both directions are the same move: snapshot where you are, restore
  // where you are going. The job site is held in full — every wire the
  // player has already run is still there when they come back, because
  // the snapshot keeps the live entity objects rather than rebuilding
  // them.

  // ── Saving while standing on a job site ──────────────────────────
  //
  // A save writes the live world as the player's city, and on a job the
  // live world is the client's site. Rather than refuse (which left a long
  // job with no way to save at all), put things exactly as they would be had
  // the player just walked home — their own world on the grid, the site held
  // in the job's snapshot — let the save run, and put the site back. It is
  // one synchronous step with no frame drawn in between, so nothing is seen
  // to move; `quiet` keeps the trip's side effects (undo history, weather,
  // banner, ambience, arrival shot) out of it.
  //
  // serialise() notes which job was underfoot (`atSite`), and a load walks
  // the player back onto it (see loadState / tick).
  let _savingAt     = -1;     // job index being saved from, while saveFromSite runs
  let _resumeOnLoad = null;   // job index to walk back onto after a load
  // Home's income and upkeep as they were when the player left it, which is
  // what the HUD shows and the balance runs on while they are on a site
  // (homeEconomyRate). A save made on site keeps them (_savingEconomy, set
  // while saveFromSite runs), and the walk back after loading it puts them
  // back (_resumeEconomy): the snapshot taken then is of a home that has
  // only just been rebuilt, its plant not yet generating, and read $0/s
  // until the player went home and came back.
  let _savingEconomy = null, _resumeEconomy = null;
  // The walk back onto the site happens on the first tick after the load,
  // so the home world held in homeSnap has had a single power pass and
  // nothing else: steam turbines at zero output, reactors not yet cooled or
  // generating. The load's PowerNetwork grace, which holds a network up
  // while plants like that spin back, is then spent on the site. Brought
  // home without it, the first tick finds supply short of demand, cuts the
  // water extractors, the cooling towers and chemical plants go dry, the
  // reactors lose cooling, and the steam that would have restored supply
  // never comes. So home gets its post-load grace when it first goes back
  // on the grid (settleColdHome).
  let _homeCold = false;
  function settleColdHome() {
    if (!_homeCold) return;
    _homeCold = false;
    PowerNetwork.beginLoadGrace();
  }
  function saveFromSite(fn) {
    const job = currentJob();
    if (!job || !homeSnap) return fn();
    const site = snapshotWorld(), home = homeSnap;
    const at = atJob, panel = panelJob;
    try {
      Camera.setPanLimit(null);          // or home's camera is clamped into the site's rect
      restoreWorld(home, true);
      TerrainSystem.syncToWater();
      job.snap = site; homeSnap = null; atJob = -1; _savingAt = at; _savingEconomy = home.economy;
      return fn();
    } finally {
      _savingAt = -1; _savingEconomy = null;
      job.snap = null; homeSnap = home; atJob = at; panelJob = panel;
      restoreWorld(site, true);
      applySiteCameraLimit(job.bounds);
    }
  }

  function returnHome() {
    const job = currentJob();
    if (!job) return;
    // Leaving a wreck is the end of it: the site is let go, not kept.
    if (job._wreck) { closeJob(job); return; }
    // A crew's finished build that has had time to start up and is still
    // failing the checklist as the player leaves will not be signed off
    // behind their back.
    if (job.crew) job.crew.broken = crewBuilt(job) && (job.crew.settle || 0) >= CREW_SETTLE_HOURS * DayNight.secondsPerGameHour()
                                    && job.reqs.evaluate(true).some(r => !r.pass && r.kind !== 'sustain' && !r.spec.holds && !r.spec.minCharge);
    job.snap = snapshotWorld();
    if (typeof LightningDamageSystem !== 'undefined' && LightningDamageSystem.clearSiteBlasts) LightningDamageSystem.clearSiteBlasts();
    NotificationStack.dismissSiteAlarms();   // the site's alarms stay with the site
    // Lift the site's camera limit BEFORE restoring, not after: restoreWorld
    // puts the camera back where the player left home, and with the limit
    // still in force that position is clamped into the job site's rect —
    // dumping them at a random-looking corner of their own world.
    Camera.setPanLimit(null);
    restoreWorld(homeSnap);
    TerrainSystem.syncToWater();
    settleColdHome();
    homeSnap = null;
    panelJob = atJob;           // keep the panel on the job they just left
    atJob    = -1;
    // What home made while the player was gone. After atJob, so a survey scan
    // that finished meanwhile reports as home news, not the site's.
    if (typeof AwayLedger !== 'undefined') AwayLedger.arrive();
    ContractRequirements.clearActive();
    stopAmbience();
    const others = jobs.length - 1;
    banner = { title: 'HOME',
               sub: others > 0 ? `${jobs.length} contracts still open`
                               : `${job.site.client} contract still open`,
               until: performance.now() + 3400 };
    _lastSig = null;
    renderChecklist();
  }

  // Travel to one of the open jobs. `idx` defaults to the panel's current
  // tab so the existing single-job call sites keep working unchanged.
  // `fromLoad`: putting the player back on the site a save was made on. The
  // away ledger then comes from the save, not from a home city that has
  // only just been loaded.
  function resumeSite(idx, fromLoad) {
    if (atJob >= 0) return;                       // already standing on a site
    const i = (idx === undefined || idx === null) ? panelJob : idx;
    const job = jobs[i];
    if (!job || !job.snap) return;
    if (!fromLoad && typeof AwayLedger !== 'undefined') AwayLedger.depart();
    homeSnap = snapshotWorld();
    restoreWorld(job.snap);     // also restores the site's own clock and weather
    job.snap = null;
    atJob    = i;
    panelJob = i;
    ContractRequirements.setActive(job.reqs);
    startAmbience(job.site.biome);
    syncSiteWeather(true);      // restoreWorld put the sky in step with HOME's weather event
    applySiteCameraLimit(job.bounds);
    startArrivalShot(job.bounds, job.markers, job.site);
    banner = { title: job.site.client.toUpperCase(),
               sub: `${job.site.place} · Back on site`, until: performance.now() + 3400 };
    _lastSig = null;
    renderChecklist();
  }

  // Straight from the site underfoot to another open one (its tab): home is
  // passed through, so the site left is held exactly as RETURN HOME holds it.
  function switchSite(idx) {
    const target = jobs[idx];
    if (atJob < 0 || !target || idx === atJob) return;
    returnHome();
    const i = jobs.indexOf(target);   // leaving a wreck closes it, which shifts the list
    if (i >= 0) resumeSite(i);
  }

  function accept(contractId) {
    // Up to MAX_JOBS at once. Accepting always happens at the beacon, which
    // only exists at home, so the player is never on a site here.
    if (jobs.length >= MAX_JOBS || atJob >= 0) return;
    const contract = ContractSites.getContract(contractId);
    if (!contract) return;
    const site = ContractSites.getSite(contract.siteId);
    if (!site) return;

    if (typeof AwayLedger !== 'undefined') AwayLedger.depart();   // home's rates, while it is still on the grid
    homeSnap = snapshotWorld();
    dropHistoryAcrossWorlds();
    clearWorld();
    if (typeof BeltCargo !== 'undefined') BeltCargo.loadState(null);   // home's items don't ride the site's belts
    stampSite(site, contract);
    applySituation(contract);
    stampEdges(ContractSites.absoluteBounds(site));

    const bounds  = ContractSites.absoluteBounds(site);
    const markers = ContractSites.absoluteMarkers(site);

    const reqs = ContractRequirements.create(ContractSites.requirementsFor(contract), { bounds, markers });
    ContractRequirements.setActive(reqs);

    // Arrive at the site's own hour — different light from home is the
    // cheapest "somewhere else" cue there is (§6.2). Set before the
    // deadline is anchored so the countdown starts from arrival.
    const day = dayLength();
    const dayNo = Math.floor(DayNight.getElapsed() / day);
    const arrival = contract.arrival || site.arrival;   // per-offer hour and weather
    DayNight.setElapsed(dayNo * day + (arrival.hour / 24) * day);

    // The client funds the equipment in full up front; the player buys it
    // out of their own balance from here on, and earns nothing until the
    // job is signed off (§8).
    const advance = ContractSites.advanceFor(contract);
    Economy.setBalance(Economy.balance + advance);

    jobs.push({
      contract, site, reqs, bounds, markers, advance,
      remaining: (contract.days || 1) * day,
      warned: false,
      lastResults: null,   // last on-site evaluation, shown while back home
      snap: null,          // null while the player is standing in it
    });
    atJob    = jobs.length - 1;
    panelJob = atJob;

    // Accepting consumes the offer, and the site goes quiet for a while
    // rather than immediately advertising again.
    offers = offers.filter(o => o.contractId !== contract.id);
    repostAt.set(contract.siteId, homeClock + REPOST_MAX_DAYS * dayLength());

    syncSiteWeather(true);
    // A winter site is already under snow when the crew gets there (more of
    // it if it's falling); anywhere else starts bare.
    DustSystem.load(0);   // a site is clean of home's dust
    FrostSystem.load(arrival.season === 'winter'
      ? { snow: arrival.weather === 'snow' || arrival.weather === 'blizzard' ? 0.95 : 0.75, coverage: 0.8 }
      : { snow: 0, coverage: 0 });
    startAmbience(site.biome);
    applySiteCameraLimit(bounds);

    closeBoard();
    startArrivalShot(bounds, markers, site);
    banner = { title: site.client.toUpperCase(),
               sub: `${site.place} · Contract accepted${arrival.season ? ' · ' + arrival.season[0].toUpperCase() + arrival.season.slice(1) + ({ rain: ', rain', snow: ', snow', blizzard: ', blizzard', overcast: ', overcast', clear: ', clear skies' }[arrival.weather] || '') : ''}`,
               until: performance.now() + 4200 };
    renderChecklist();
  }

  function complete() {
    const job = currentJob();
    if (!job || job._wreck || !job.reqs.allPass()) return;
    if (job.crew) { settleCrew(job); return; }
    // Read what we need off the job before closeJob() drops it. Materials
    // were funded on acceptance; what is outstanding is the margin, which
    // is the player's entire profit on the job.
    let owed     = ContractSites.payoutFor(job.contract) - job.advance;
    const client = job.site.client;
    // Beat the rival crew to it: the bonus for finishing inside the window.
    const rival = job.contract.terms && job.contract.terms.rival;
    const took  = (job.contract.days || 1) * dayLength() - job.remaining;
    const beatRival = !!(rival && took <= rival.days * dayLength());
    if (beatRival) owed += rival.bonus || 0;
    const cRankBefore = ContractSites.clientRank(client).index;
    const pRankBefore = ContractSites.contractorRank().index;
    recordOutcome(client, true);
    const perk = job.contract.perk ? ContractPerks.grant(job.contract.perk) : null;
    // Keep the build while the site is still on the grid: it is what a crew
    // would put up if this client asks for the same job again.
    const repeatable = recordBuild(job) && canRepeat(job.contract.siteId);
    closeJob(job);
    Economy.setBalance(Economy.balance + owed);
    MessageLog.add(`${client} paid the ${formatMoney(owed)} balance; contract complete`, '#40d090');
    if (beatRival) MessageLog.add(`Finished ahead of the rival crew: ${formatMoney(rival.bonus)} bonus included`, '#ffd070');
    else if (rival) MessageLog.add('The rival crew would have been quicker: no early-finish bonus', '#7a8a99');
    banner = { title: 'CONTRACT COMPLETE', sub: `${formatMoney(owed)} balance received${perk ? ' · ' + perk.label : ''}`, until: performance.now() + 4200 };
    SFX.contractComplete?.();
    if (perk) MessageLog.add(`${client} paid in kind: ${perk.label}`, '#7ad8ff');
    if (repeatable) MessageLog.add(`${client} would trust a crew of yours with this job: watch the board for a repeat order`, '#ffb060');
    // Reputation is the other reward: say so when it moves.
    const cRank = ContractSites.clientRank(client), pRank = ContractSites.contractorRank();
    if (cRank.index > cRankBefore) MessageLog.add(`${client} now rates you ${cRank.name}`, '#7ad8ff');
    if (pRank.index > pRankBefore) {
      MessageLog.add(`Contractor rank: ${pRank.name}`, '#ffd070');
      banner = { title: 'CONTRACTOR RANK: ' + pRank.name.toUpperCase(), sub: 'Your name is getting around', until: performance.now() + 4800 };
    }
  }

  // ── Abandon confirmation ─────────────────────────────────────────
  //
  // Abandoning is irreversible and expensive: the equipment budget goes
  // back, everything built on the site is discarded, and the client's
  // record of the player takes a hit. Firing that off a single stray click
  // next to RETURN HOME is not acceptable, so the button asks first.
  function ensureAbandonEl() {
    let el = document.getElementById('contract-abandon-confirm');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'contract-abandon-confirm';
    el.style.cssText =
      'display:none;position:fixed;inset:0;z-index:960;align-items:center;justify-content:center;' +
      'background:rgba(2,6,12,0.72);backdrop-filter:blur(2px);pointer-events:all;font-family:inherit';
    el.addEventListener('mousedown', ev => {
      if (ev.target === el || ev.target.closest('[data-keep]')) { closeAbandonConfirm(); return; }
      if (ev.target.closest('[data-confirm-abandon]')) { closeAbandonConfirm(); abandon(); }
    });
    document.body.appendChild(el);
    return el;
  }

  function closeAbandonConfirm() {
    const el = document.getElementById('contract-abandon-confirm');
    if (el) el.style.display = 'none';
  }

  function confirmAbandon() {
    const job = currentJob() || shownJob();
    if (!job || job._wreck) return;
    const el      = ensureAbandonEl();
    const site    = job.site;
    const results = (job === currentJob()) ? job.reqs.evaluate(true) : (job.lastResults || []);
    const done    = results.filter(r => r.pass).length;
    const total   = job.reqs.specs.length;
    const profit  = job.contract.margin || 0;

    el.innerHTML = `
      <div style="width:min(520px,92vw);background:#040910;border:1px solid #4a2028;border-radius:5px;
                  box-shadow:0 10px 60px rgba(0,0,0,0.6)">
        <div style="padding:16px 18px;border-bottom:1px solid #3a1820">
          <div style="font-size:14px;letter-spacing:2px;color:#ff6040">ABANDON CONTRACT?</div>
          <div style="font-size:10px;letter-spacing:1px;color:var(--text-dim);margin-top:5px">
            ${site.client} &middot; ${site.place}
          </div>
        </div>
        <div style="padding:16px 18px">
          <div style="font-size:11px;line-height:1.75;color:#c8d8e4">
            You are <b style="color:#f0c040">${done} of ${total}</b> requirements complete with
            <b style="color:#f0c040">${formatLeft(timeLeft(job))}</b>.
          </div>
          <ul style="margin:12px 0 0;padding-left:18px">
            <li style="font-size:10px;line-height:1.9;color:#a8c4d4">
              You earn <b style="color:#ff6040">nothing</b>; the ${formatMoney(profit)} profit is forfeit.</li>
            <li style="font-size:10px;line-height:1.9;color:#a8c4d4">
              The ${formatMoney(job.advance)} equipment budget goes back to the client.</li>
            <li style="font-size:10px;line-height:1.9;color:#a8c4d4">
              Everything you have built on this site is lost with it, and whatever you already
              spent on materials is gone.</li>
            <li style="font-size:10px;line-height:1.9;color:#a8c4d4">
              ${site.client} will record the job as failed, which costs you on their future rates.</li>
          </ul>
          <div style="font-size:10px;line-height:1.7;color:#6f8598;margin-top:12px">
            You do not have to decide now; RETURN HOME keeps the contract open and the site
            exactly as it is.
          </div>
        </div>
        <div style="display:flex;gap:8px;padding:0 18px 16px">
          <button data-keep style="flex:1;font-size:11px;letter-spacing:1px;padding:10px 0;
            border:1px solid #23486e;border-radius:3px;background:#0d2138;color:#8ec8ff;cursor:pointer">KEEP THE CONTRACT</button>
          <button data-confirm-abandon style="font-size:11px;letter-spacing:1px;padding:10px 16px;
            border:1px solid #7a2030;border-radius:3px;background:#2a0c12;color:#ff8090;cursor:pointer">ABANDON</button>
        </div>
      </div>`;
    el.style.display = 'flex';
  }

  function abandon() {
    const job = currentJob() || shownJob();
    if (!job) return;
    const client  = job.site.client;
    const advance = job.advance;
    recordOutcome(client, false);
    reclaimAdvance(job);
    closeJob(job);
    MessageLog.add(`${client} contract abandoned: ${formatMoney(advance)} advance returned, materials are sunk`, '#a05868');
    banner = { title: 'CONTRACT ABANDONED', sub: `${formatMoney(advance)} advance returned · materials sunk`,
               until: performance.now() + 3600 };
  }

  // An unfinished contract's advance goes back to the client. Without this
  // the split is an exploit: accept, walk away immediately, keep half the
  // contract value for nothing. Returning it means a failed job costs
  // exactly the materials that were sunk into it, which is the intent.
  // This can push the balance negative if the advance was already spent —
  // that is the risk of taking a job you cannot finish.
  // ── Reactor incidents on a job site ──────────────────────────────
  //
  // A reactor on a client's site melts down and explodes exactly as one at
  // home does. There is no warning shot: the blast makes the player liable
  // for the client's losses (ContractSites.liabilityFor) and ends the
  // contract. Nothing of the blast follows them home (see
  // LightningDamageSystem.detonateNuclear), and it cannot end the run.
  // The liability can put the player in debt — survivable, but costly.
  // A reactor has exploded on the site underfoot. The client holds the player
  // liable and the contract is over, settled by tick() a few seconds from now
  // so the bill lands after the blast; the player stays on the wreck until
  // they choose to go home (liableFail). Returns the bill.
  const BLAST_SETTLE_MS = 7000;
  function reactorBlast(gen) {
    const job = currentJob();
    if (!job) return 0;
    job.incidents = (job.incidents || 0) + 1;
    job._liable   = true;
    job._blast    = true;
    if (!job._liableAt) job._liableAt = performance.now() + BLAST_SETTLE_MS;
    return ContractSites.liabilityFor(job.contract, true);
  }
  // The bill is settled here, but a player standing on the site stays on it:
  // the job becomes a wreck (`_wreck`) with no clock, no checklist and no
  // way out but RETURN HOME, so they can walk the damage before they go.
  function liableFail(job) {
    if (!job) return;
    const client = job.site.client;
    const liability = ContractSites.liabilityFor(job.contract, true);
    recordOutcome(client, false);
    reclaimAdvance(job);
    if (job === currentJob()) {
      job._liable = false;
      job._wreck  = { bill: liability };
      if (job.crew) NotificationStack.dismissTag('crew-stall');
      _lastSig = null;
    } else {
      closeJob(job);
    }
    Economy.setBalance(Economy.balance - liability);
    MessageLog.add(`${client} holds you liable for ${formatMoney(liability)} after a reactor incident; contract failed`, '#ff6040');
    NotificationStack.push({
      icon: '☢', title: 'Liable for reactor incident',
      message: `A reactor exploded on ${client}'s site. They have billed you ${formatMoney(liability)} for the damage and ended the contract.` +
               (Economy.balance < 0 ? ' You are in debt; clear it before customers start to leave.' : ''),
      color: '#ff6040', border: '#602018', tag: 'contract-liability', glow: true, contract: true,
    });
    banner = { title: 'LIABLE FOR REACTOR INCIDENT', sub: `${client} billed you ${formatMoney(liability)}`, until: performance.now() + 6000 };
    SFX.failure?.();
  }

  function reclaimAdvance(job) {
    if (!job) return;
    Economy.setBalance(Economy.balance - job.advance);
  }

  // Deadline lapsed. Per §8: forfeit the payout, take a standing hit with
  // the client, auto-return home. Materials are already sunk — the player
  // paid for every piece as they placed it, and the job site is discarded
  // with the equipment still on it.
  function fail(job) {
    if (!job) return;
    const client = job.site.client;
    // Only the site underfoot can be evaluated against the live grid; for a
    // job that lapsed while the player was elsewhere, the last on-site
    // reading is the only honest count there is.
    const results = (job === currentJob()) ? job.reqs.evaluate(true) : (job.lastResults || []);
    const done   = results.filter(r => r.pass).length;
    const total  = job.reqs.specs.length;
    recordOutcome(client, false);
    reclaimAdvance(job);
    closeJob(job);
    MessageLog.add(`${client} contract failed: deadline passed at ${done}/${total} complete`, '#ff6040');
    SFX.failure?.();
    banner = { title: 'CONTRACT FAILED', sub: `Deadline passed · ${done}/${total} complete · no payment`,
               until: performance.now() + 5000 };
  }

  // Standing lives with the client data in ContractSites — the generator
  // prices new offers against it (§2).
  function recordOutcome(client, ok) { ContractSites.recordOutcome(client, ok); }
  function standingFor(client)        { return ContractSites.standingFor(client); }

  // ── Persistence (§9) ─────────────────────────────────────────────
  //
  // Saving is only permitted at home, so the live grid being written to the
  // save file is always the player's own world. What has to travel with it
  // is the contract and the JOB SITE, which at that moment lives in
  // siteSnap.
  //
  // On load the player is always put at home with the contract still open
  // and the site held in siteSnap — reachable through RETURN TO SITE. That
  // avoids ever having to load directly into a job site, and means the
  // grid in a save file is unambiguously the player's city.
  function serialise() {
    // The board survives a save whether or not a contract is in hand.
    // This used to bail out with null when `active` was empty, which threw
    // away the offers, the client standing and — now that work has to be
    // gone looking for — a sweep in progress. Saving between contracts is
    // the common case, and it is exactly when a sweep is running, so a
    // reload would silently cancel the search the player was waiting on.
    const board = {
      homeClock,
      searching, searchElapsed, searchTarget,
      // Each offer carries its whole contract. Contracts are generated at
      // runtime and live only in ContractSites' in-memory registry, so an
      // offer saved as a bare contractId pointed at nothing after a reload
      // and loadState's filter quietly dropped every found contract.
      offers: offers.map(o => {
        const c = ContractSites.getContract(o.contractId);
        return {
          ...o,
          contract: c ? { id: c.id, siteId: c.siteId, title: c.title, margin: c.margin,
                          days: c.days, requirements: c.requirements, generated: !!c.generated,
                          archetype: c.archetype, arrival: c.arrival, perk: c.perk, terms: c.terms,
                          repeat: c.repeat || undefined } : null,
        };
      }),
      repostAt: [...repostAt.entries()],
      builds:   [...builds.entries()],
      // A save made on a job site: home's production so far this trip.
      away:     (typeof AwayLedger !== 'undefined') ? AwayLedger.serialise() : null,
    };
    if (!jobs.length) return { contracts: [], contract: null, board, standing: ContractSites.serialiseStanding(), perks: ContractPerks.serialise() };

    // Every open job has its snapshot in hand here and none of them is on
    // the live grid: a save made on site runs inside saveFromSite(), which
    // has put the player's own world back for the duration.
    const serialiseJob = (job) => ({
      contract: {
        id: job.contract.id,
        siteId: job.contract.siteId,
        title: job.contract.title,
        margin: job.contract.margin,
        days: job.contract.days,
        archetype: job.contract.archetype,
        arrival: job.contract.arrival,
        perk: job.contract.perk,
        terms: job.contract.terms,
        requirements: job.contract.requirements,
        repeat: job.contract.repeat || undefined,
      },
      // A crew job: what is left to put up and where the crew has got to.
      crew: job.crew ? {
        pieces: job.crew.pieces, placed: job.crew.placed, onGrid: job.crew.onGrid, t: job.crew.t, unit: job.crew.unit,
        stallAt: job.crew.stallAt, stalled: job.crew.stalled, signoff: job.crew.signoff, broken: job.crew.broken, settle: job.crew.settle,
      } : undefined,
      incidents: job.incidents || 0,
      remaining: job.remaining,
      advance:   job.advance,
      warned:    job.warned,
      doomed:    job.doomed,
      wxPeriod0: job.wxPeriod0,   // which weather spell the crew arrived in (syncSiteWeather)
      reqState:  job.reqs.toJSON(),
      // The checklist away from site can only show the last reading taken
      // ON site — the requirements cannot be re-evaluated against the
      // player's own world. Without this the panel comes back from a save
      // showing every row unticked and 0/6 until the player travels back,
      // which reads as lost progress.
      lastResults: job.lastResults ? job.lastResults.map(r => ({
        kind: r.kind, label: r.label, pass: !!r.pass,
        progress: r.progress || 0, detail: r.detail || '',
      })) : null,
      // The job site's contents. Entities only — the tile array is rebuilt
      // by stamping them back, and the terrain around a site is generated
      // deterministically from the site definition anyway.
      site: job.snap ? {
        entities: job.snap.entities.map(e => SaveSystem.serialiseEntity(e)),
        elapsed:  job.snap.elapsed,
        weather:  job.snap.weather,
        frost:    job.snap.frost,     // the snow lying on the site
        camera:   job.snap.camera,
        // Sites carry water now (a lake is what makes a coal set possible),
        // so the tile set has to survive a save with the rest of the site.
        water:    job.snap.water || [],
        reservoirs: job.snap.reservoirs || null,
      } : null,
    });

    // A wreck is settled and gone as far as the save is concerned: a game
    // saved while the player looks it over loads at home.
    const kept = jobs.filter(j => !j._wreck);
    const list = kept.map(serialiseJob);
    return {
      contracts: list,
      // The job the player was standing on when this was saved, or -1 at home.
      atSite: _savingAt >= 0 ? kept.indexOf(jobs[_savingAt]) : -1,
      homeEconomy: _savingAt >= 0 && _savingEconomy ? { ..._savingEconomy } : undefined,
      // Saves written by this build are read through `contracts`. The single
      // `contract` field is kept populated so a save made here still loads
      // in an older build rather than silently losing the first job.
      ...list[0],
      board,
      standing: ContractSites.serialiseStanding(),
      perks: ContractPerks.serialise(),
    };
  }

  function loadState(d) {
    discardForLoad();
    // The established-power latch belongs to the save being loaded. A save
    // that predates it (or none at all) must not inherit the last game's.
    ContractSites.resetEstablished();
    ContractPerks.reset();
    builds = new Map();
    // A trip saved mid-way carries home's production so far; the home city is
    // on the grid by now (save.js loads the world first), which the ledger
    // needs to find its stores again.
    if (typeof AwayLedger !== 'undefined') AwayLedger.load(d && d.board ? d.board.away : null);
    _resumeEconomy = d && d.homeEconomy && Number.isFinite(d.homeEconomy.income) ? { income: +d.homeEconomy.income, upkeep: +d.homeEconomy.upkeep || 0 } : null;
    if (!d) return;
    ContractPerks.load(d.perks);
    if (d.board && Array.isArray(d.board.builds)) {
      builds = new Map(d.board.builds.filter(b => b && b[1] && b[1].contract && Array.isArray(b[1].pieces)));
    }

    if (d.board) {
      homeClock     = d.board.homeClock || 0;
      searching     = !!d.board.searching;
      searchElapsed = d.board.searchElapsed || 0;
      searchTarget  = d.board.searchTarget  || 0;
      // Saves from before the beacon became an instrument you operate have
      // no sweep in them, and a sweep with no target would never finish —
      // either way the board comes back idle.
      if (searching && !(searchTarget > 0)) { searching = false; searchElapsed = 0; }
      // Re-register each offer's saved contract before checking it resolves.
      // Saves from before offers carried their contract have nothing to
      // restore, so those offers still fall away as they always did.
      offers = [];
      for (const o of d.board.offers || []) {
        if (o.contract && o.contract.id === o.contractId && ContractSites.getSite(o.contract.siteId)) {
          ContractSites.adopt(o.contract);
        }
        if (!ContractSites.getContract(o.contractId)) continue;
        const { contract, ...offer } = o;
        offers.push(offer);
      }
      repostAt      = new Map(d.board.repostAt || []);
    }
    if (d.standing) ContractSites.loadStanding(d.standing);

    // `contracts` is the current shape; `contract` is the single-job shape
    // older saves were written in, and still loads as a one-job list.
    const saved = Array.isArray(d.contracts) && d.contracts.length ? d.contracts
                : d.contract ? [d] : [];
    if (!saved.length) return;

    jobs  = [];
    atJob = -1;                 // loading always puts the player at home
    for (const rec of saved.slice(0, MAX_JOBS)) {
      if (!rec || !rec.contract) continue;
      const site = ContractSites.getSite(rec.contract.siteId);
      if (!site) continue;      // a save from a build whose site no longer exists

      // Re-register the contract so getContract() can find it again — the
      // generated set is runtime-only and does not survive a reload.
      const contract = ContractSites.adopt(rec.contract);

      const bounds  = ContractSites.absoluteBounds(site);
      const markers = ContractSites.absoluteMarkers(site);
      const reqs = ContractRequirements.create(ContractSites.requirementsFor(contract), { bounds, markers });
      if (rec.reqState) reqs.fromJSON(rec.reqState);

      // Rebuild the job site into a detached snapshot rather than onto the
      // live grid — the player is at home, and a site only comes back when
      // they press RETURN TO SITE. A job with nothing to go back to is
      // dropped rather than stranding the player with an unreachable
      // contract.
      const snap = rec.site ? rebuildSiteSnapshot(rec.site, site) : null;
      if (!snap) continue;

      if (typeof d.atSite === 'number' && d.atSite >= 0 && saved.indexOf(rec) === d.atSite) _resumeOnLoad = jobs.length;
      jobs.push({
        contract, site, reqs, bounds, markers,
        advance:   rec.advance || 0,
        incidents: rec.incidents || 0,
        remaining: rec.remaining || 0,
        warned:    !!rec.warned,
        doomed:    !!rec.doomed,
        wxPeriod0: typeof rec.wxPeriod0 === 'number' ? rec.wxPeriod0 : undefined,
        lastResults: Array.isArray(rec.lastResults) ? rec.lastResults : null,
        snap,
        crew: rec.crew && Array.isArray(rec.crew.pieces) ? { ...rec.crew, onGrid: rec.crew.onGrid || 0 } : undefined,
      });
    }
    panelJob = 0;
    // Nothing registers as the live requirement set: the player is at home,
    // where no site is underfoot. tick() points it at whichever site they
    // travel to. Every job's stateful requirements advance through
    // reqs.tickAway() in the meantime.
    ContractRequirements.clearActive();
    if (!jobs.length) return;
    _lastSig = null;
    renderChecklist();
  }

  // Build a world snapshot (tiles + entities) from saved job-site entities
  // WITHOUT touching the live grid.
  function rebuildSiteSnapshot(s, site) {
    const tiles = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    const entities = [];
    // Migration: site layouts used to stamp industrial and residential
    // subtypes (fabs, compute halls, schools…) as T.COMMERCIAL, which drew
    // them as the commercial renderer's generic block. A site saved from
    // such a build still holds the old type, so re-type each client building
    // to what the site definition says now. Matched on position AND subtype
    // so a building the layout has since moved or renamed is left alone.
    const o = ContractSites.origin;
    const _defType = new Map();
    for (const p of (site && site.prebuilt) || []) {
      const sub = p.props && p.props.commercialSubtype;
      if (sub) _defType.set(`${p.col + o.col},${p.row + o.row},${sub}`, p.type);
    }
    for (const rec of s.entities || []) {
      if (!rec || !EntityDefs[rec.type]) continue;
      if (rec._clientOwned && rec.commercialSubtype) {
        const t = _defType.get(`${rec.col},${rec.row},${rec.commercialSubtype}`);
        if (t && t !== rec.type) rec.type = t;
      }
      const e = new Entity(rec.type, rec.col, rec.row);
      // Restore saved scalar state. Skipping the identity fields keeps a
      // malformed record from moving or resizing the entity underneath us.
      for (const k of Object.keys(rec)) {
        if (k === 'type' || k === 'col' || k === 'row') continue;
        if (rec[k] !== undefined) e[k] = rec[k];
      }
      e.width  = rec.width  || e.width;
      e.height = rec.height || e.height;
      // A truck saved before its footprint was written whole: width 3 and
      // no height is one put down facing east (3×1), which the line above
      // has just made 3×3. See the same repair in SaveSystem.load.
      if (rec.type === T.TRUCK && rec.width === 3) {
        if (rec.height === undefined) e.height = 1;
        else if (rec.height === 3) { e.width = EntityDefs[T.TRUCK].width; e.height = EntityDefs[T.TRUCK].height; }
      }
      // Stacked tiles. A save records what lies under a wire, belt or pipe
      // as a marker, not an entity (`_underPipe: 'pipe'`, `_underWire: true`)
      // and SaveSystem.load() turns the markers back into entities for the
      // home world only. The loop above copied them across raw, so after any
      // save and reload a site's wire-over-pipe tile held the STRING 'pipe'
      // where its pipe should be: the pipe was gone from the run, and the
      // next save dropped even the marker. Rebuild the real thing here.
      SaveSystem.reviveStack(e, rec);
      if (e._hauler) e.def = EntityDefs[T.HAULER];   // a Hauler is a truck with its own def
      // Same story for a pipe's drag-connected sides (saved as _pipeLinks,
      // lived on the pipe as _links) and a Gas Holder's contents (saved as
      // _gasStored, held in the gas's own field).
      if (e.type === T.PIPE && rec._pipeLinks !== undefined) e._links = rec._pipeLinks;
      // A belt's drag-connected sides (_beltLinks), and a splitter's own def.
      if (e.type === T.CONVEYOR && rec._beltLinks !== undefined && !rec._udgBelt && !rec._splitter) e._links = rec._beltLinks;
      if (e.type === T.CONVEYOR && rec._splitter) initSplitter(e, { mode: rec._splitMode, side: rec._splitSide, ratio: rec._splitRatio });
      // An extractor's water rate isn't saved either, and the first tick on the
      // site budgets every pipe run against it before HydroSystem refreshes it:
      // left unset, every coal generator read NO WATER for that tick and the
      // plant blinked offline on arrival. Same placeholder SaveSystem.load sets.
      if (e.type === T.WATEREXTRACTOR) {
        if (e._lakeConnected === undefined) e._lakeConnected = (e._waterRate || 0) > 0;
        e._waterRate = e._lakeConnected ? (EntityDefs[T.WATEREXTRACTOR].waterPerSecond || 20) : 0;
        e._waterBuffer = e._waterBuffer || 0;
      }
      if (e.type === T.GASSTORAGE && rec._gasType && rec._gasStored > 0 && typeof GasStorageSystem !== 'undefined') {
        const K = GasStorageSystem.KINDS[rec._gasType];
        if (K) e[K.field] = rec._gasStored;
      }
      for (let r = e.row; r < e.row + e.height; r++)
        for (let c = e.col; c < e.col + e.width; c++)
          if (r >= 0 && r < ROWS && c >= 0 && c < COLS) tiles[r][c] = e;
      entities.push(e);
    }
    // A river is a water tile with a direction of flow, and that direction is
    // not part of a saved entity: it travels in the water keys
    // ("col,row:dc,dr,L"). restoreWorld() only reads those keys for their
    // coordinates and then installs the entities built above, so without
    // this every river on a reloaded site came back as still water — and a
    // dam, which only spans a river, could not be placed anywhere on it.
    const _flow = (c, r, dc, dr, long, fall) => {
      const w = tiles[r] && tiles[r][c];
      if (!w || w.type !== T.WATER || w._isRiver) return;
      if (!dc && !dr) return;
      w._flowDc = dc; w._flowDr = dr; w._isRiver = true;
      if (long) w._isLongRiver = true;
      if (fall) w._waterfall = true;
    };
    for (const key of s.water || []) {
      const [coord, flow] = String(key).split(':');
      if (!flow) continue;
      const [c, r] = coord.split(',').map(Number);
      const p = flow.split(',');
      _flow(c, r, Number(p[0]), Number(p[1]), p[2] === 'L', p[3] === 'F');
    }
    // A site saved again after such a reload has lost the flow from its keys
    // too. The site definition still knows where its rivers run.
    for (const rect of (site && site.river) || []) {
      for (let r = rect.minR; r <= rect.maxR; r++)
        for (let c = rect.minC; c <= rect.maxC; c++) _flow(c + o.col, r + o.row, rect.dc, rect.dr, false, false);
    }
    return {
      tiles, entities,
      water:   s.water || [],         // a site may carry a lake of its own
      reservoirs: s.reservoirs || null,   // and a dam
      camera:  s.camera  || { x: Camera.x, y: Camera.y, zoom: Camera.zoom },
      elapsed: s.elapsed !== undefined ? s.elapsed : DayNight.getElapsed(),
      weather: s.weather || null,
      frost:   s.frost,                   // undefined in a save from before sites had snow: left as it is
      economy: { income: 0, upkeep: 0 },
    };
  }

  // Called by SaveSystem.load() before it replaces the world.
  //
  // Loading a save while a contract is active leaves this module holding
  // snapshots of a world that no longer exists: `isAtSite()` keeps
  // reporting true, home systems stay paused, the camera stays clamped to
  // a site that was never stamped, and abandoning later "restores" a dead
  // snapshot over the loaded save. Drop everything and let the incoming
  // world stand on its own — deliberately WITHOUT restoring, since load()
  // is about to overwrite the grid regardless.
  function discardForLoad() {
    if (!jobs.length && !homeSnap) return;
    // The offers this card was advertising are dropped below, so the card
    // must not outlive them into the incoming save.
    NotificationStack.dismissTag('contractoffer');
    closeAbandonConfirm();
    stopAmbience();
    Camera.setPanLimit(null);
    ContractRequirements.clearActive();
    homeSnap = null;
    jobs     = [];
    atJob    = -1;
    panelJob = 0;
    _resumeOnLoad = null;
    _homeCold = false;
    shot     = null;
    banner   = null;
    offers   = [];
    repostAt = new Map();
    homeClock = 0;
    searching     = false;
    searchElapsed = 0;
    searchTarget  = 0;
    hideChecklist();
    closeBoard();
  }

  // Close ONE job out — paid, abandoned or failed — and leave every other
  // open contract exactly where it was. The player only comes home if the
  // job being closed is the one they are standing in; closing a job that
  // lapsed while they were elsewhere just drops its snapshot.
  function closeJob(job) {
    const idx = jobs.indexOf(job);
    if (idx < 0) return;
    closeAbandonConfirm();
    if (job.crew) NotificationStack.dismissTag('crew-stall');

    if (idx === atJob) {
      // A blast on the site must not leave its fireball or scar on the map
      // the player is about to be put back on.
      if (typeof LightningDamageSystem !== 'undefined' && LightningDamageSystem.clearSiteBlasts) LightningDamageSystem.clearSiteBlasts();
      // Nor a reactor alarm from a site that no longer exists, frozen on
      // its last countdown with nothing left to clear it.
      NotificationStack.dismissSiteAlarms();
      stopAmbience();
      Camera.setPanLimit(null);   // the player's own world is unrestricted again
      ContractRequirements.clearActive();
      const cameHome = !!homeSnap;
      if (homeSnap) { restoreWorld(homeSnap); TerrainSystem.syncToWater(); settleColdHome(); }
      homeSnap = null;
      atJob    = -1;
      if (cameHome && typeof AwayLedger !== 'undefined') AwayLedger.arrive();   // as in returnHome
    } else if (atJob > idx) {
      atJob--;                    // the live index shifts when an earlier job goes
    }
    job.snap = null;              // let the site's entities go
    jobs.splice(idx, 1);

    if (panelJob >= jobs.length) panelJob = Math.max(0, jobs.length - 1);
    if (!jobs.length) hideChecklist();
    _lastSig = null;
    renderChecklist();
  }

  // ── Crews and repeat orders ──────────────────────────────────────
  //
  // A client the player has done enough work for will sometimes ask for the
  // same job again. A repeat order can be taken in person like any other, or
  // handed to a crew: the crew puts up the player's own build from last
  // time, piece by piece, on the real site, for a share of the margin. Home
  // keeps running, and the player can travel out at any point to watch, lend
  // a hand, or get a stalled crew moving.
  //
  // A crew builds the way a blueprint stamp does: every piece goes through
  // the player's own placement path (InputManager.tryPlaceAt), so a mine
  // links to its deposit, a pipe keeps its joins and a dam floods its
  // reservoir exactly as they would by hand. That needs the site on the
  // grid, so while the player is away the crew's progress is only a count,
  // and the pieces it stands for go onto the ground when the player arrives.
  //
  // Only work a crew can do unsupervised is ever recorded: wind, solar,
  // geothermal, coal, oil and hydro plant with its lines, belts and pipes,
  // storage and site works, and fission reactors run off the client's
  // stocked fuel. Anything with vehicles, repairs, waste to haul, a fuel
  // chain the crew would have to make itself, or fusion stays the
  // player's own job.
  //
  // A reactor job is the player's liability as if they had built it, so a
  // crew never fuels a half-built plant: every reactor on the site is held
  // off its rods (fuelHeld) until the last piece of the build is standing.
  // A piece that would not go in at all keeps the hold on until the player
  // puts it up themselves.
  const CREW_MIN_JOBS    = 3;      // jobs finished for a client before it will take a crew of yours
  const CREW_PAY         = 0.5;    // the player's share of the margin on a crew job
  const MAX_CREWS        = 1;
  const REPEAT_CHANCE    = 0.4;    // how often an eligible site's offer is a repeat order
  const REPEAT_SHARE     = 0.2;    // share of new offers that go straight to an eligible site (see postOffer)
  const CREW_STALL       = 0.25;   // chance a crew gets stuck part-way and calls the player out
  const CREW_BUILD_SHARE = 0.45;   // share of the time not owed to a hold that the crew builds for
  const CREW_SETTLE_HOURS = 2;     // in-game hours a finished build is given to start up before it is called failing
  const CREW_KINDS = new Set(['place', 'running', 'connect', 'protect', 'store', 'sustain', 'service']);
  let builds = new Map();          // siteId -> { contract, pieces } : the player's last finished build there

  let _crewTypes = null;
  function crewTypes() {
    if (!_crewTypes) _crewTypes = new Set([
      T.WIRE, T.POLE, T.POWERTOWER, T.WIND, T.WIND2, T.WIND3, T.SOLAR, T.SOLAR2, T.SOLAR3,
      T.BATTERY, T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5,
      T.PROTECTOR, T.PROTECTOR2, T.PROTECTOR3, T.LIGHTNINGROD, T.LIGHTNINGROD2, T.LIGHTNINGROD3,
      T.LAMP, T.CAMERA, T.EVCHARGER, T.MONITOR, T.MONITOR2, T.CELLTOWER, T.FIBERHUB, T.SURVEY, T.SURVEY2,
      T.SMALLPARK, T.COMMUNITYGARDEN, T.TREEDSTREET, T.BASKETBALLCOURT, T.FARMERSMARKET,
      // plant with a supply chain a crew can be left to join up
      T.PIPE, T.UNDERGNDPIPE, T.CONVEYOR, T.UNDERGNDCONVEYOR, T.CONVEYORSPLITTER,
      T.GEOWELL, T.GEOTURBINE,
      T.COALMINE, T.COALMINE2, T.COALGENERATOR, T.WATEREXTRACTOR, T.GOVERNOR,
      T.PUMPJACK, T.PUMPJACK2, T.OILSTORAGE, T.REFINERY, T.FUELGEN,
      T.DAM, T.HYDROTURBINE, T.SHAFT, T.HYDROGENERATOR,
      // fission off stocked fuel; the reactors are held until the build is whole (fuelHeld)
      T.NUCLEARREACTOR, T.ADVREACTOR, T.COOLINGTOWER, T.COOLINGTOWER2, T.STEAMTURBINE,
    ].filter(Boolean));
    return _crewTypes;
  }
  // The order a crew works in, by kind. It is also what lets pieces that
  // share a tile stack the way they were built (a wire onto its pipe, a belt
  // onto its wire), and puts each thing down after what it depends on: a
  // turbine after its well or its dam, a wire after the pole it hangs from.
  function pieceStage(p) {
    const t = p.type;
    if (t === T.DAM) return 0;
    if (t === T.GEOTURBINE || t === T.HYDROTURBINE) return 2;
    if (t === T.PIPE || t === T.UNDERGNDPIPE) return 3;
    if (t === T.POLE || t === T.POWERTOWER) return 4;
    if (t === T.WIRE) return 5;
    if (t === T.CONVEYOR || t === T.UNDERGNDCONVEYOR || t === T.CONVEYORSPLITTER || t === T.SHAFT) return 6;
    return 1;
  }
  const isLine    = p => pieceStage(p) >= 3;
  // How long a piece takes relative to the others: a run of wire goes down
  // quickly, a big footprint slowly.
  const pieceWork = p => isLine(p) ? 0.15 : 1 + (p.w || 1) * (p.h || 1) * 0.25;
  const crewPay   = c => Math.round(((c && c.margin) || 0) * CREW_PAY);
  const crewBuilt = job => !!job.crew && job.crew.placed >= job.crew.pieces.length;
  const crewsOut  = () => jobs.filter(j => j.crew).length;

  // Everything on one tile, top first (only the top is on the grid).
  function stackOf(top) {
    const out = [];
    const walk = e => {
      if (!e || typeof e !== 'object' || !e.type || out.includes(e)) return;
      out.push(e);
      walk(e._underPipe); walk(e._underWire); walk(e._underConveyor);
    };
    walk(top);
    return out;
  }
  const pieceType = beltPieceType;

  // Stage by stage, each piece the nearest to the last.
  function orderPieces(pieces) {
    const out = [];
    let at = null;
    for (let stage = 0; stage <= 6; stage++) {
      const left = pieces.filter(p => pieceStage(p) === stage);
      while (left.length) {
        let bi = 0, bd = Infinity;
        for (let i = 0; i < left.length; i++) {
          const d = at ? Math.abs(left[i].col - at.col) + Math.abs(left[i].row - at.row)
                       : left[i].row * COLS + left[i].col;
          if (d < bd) { bd = d; bi = i; }
        }
        at = left.splice(bi, 1)[0];
        out.push(at);
      }
    }
    return out;
  }

  // What it takes to put this entity down again: what a blueprint keeps.
  function pieceOf(e) {
    const def = EntityDefs[pieceType(e)] || {};
    const w = e.width || 1, h = e.height || 1;
    const p = { type: pieceType(e), col: e.col, row: e.row, w, h,
                rot: typeof e._rotation === 'number' ? (e._rotation & 3)
                   : ((w !== (def.width || 1) || h !== (def.height || 1)) ? 1 : 0) };
    if (e.type === T.SHAFT) p.ori = e._orientation === 'v' || h > w ? 'v' : 'h';
    if (e.type === T.UNDERGNDPIPE || e._udgBelt) p.axis = e._udgAxis === 'v' ? 'v' : 'h';
    if ((e.type === T.UNDERGNDPIPE || e._udgBelt) && e._udgNeg !== undefined) p.udgSpans = [e._udgNeg, e._udgPos];
    if (e.type === T.PIPE) p.links = e._links === undefined ? null : e._links;
    if (pieceType(e) === T.CONVEYOR) p.links = beltLinksOf(e) ?? null;
    if (pieceType(e) === T.CONVEYORSPLITTER) p.split = splitterSettings(e);
    if (e.type === T.DAM) {
      // A dam is built from a tile of the river it spans, facing the bank it fills.
      const s = e._spanTiles && e._spanTiles[0];
      if (s) p.at = [s.c, s.r];
      p.rot = e._reservoirSide === 'downstream' ? 1 : 0;
    }
    return p;
  }

  // Called as a job the player did themselves is signed off, with the site
  // still on the grid. Returns whether this is work a crew could repeat.
  function recordBuild(job) {
    const c = job.contract, types = crewTypes();
    if (job.crew) return false;
    const specs = ContractSites.requirementsFor(c);
    // A reactor that makes its own fuel is a chain no crew is left to light.
    if (specs.some(s => s.ownFuel)) return false;
    if (specs.some(s => !CREW_KINDS.has(s.kind) || (s.type && !types.has(s.type)))) return false;
    const pieces = [], seen = new Set();
    for (const top of EntityRegistry.all()) {
      for (const e of stackOf(top)) {
        if (seen.has(e)) continue;
        seen.add(e);
        // A layer carried under another does not always hold its own tile.
        if (e !== top) { e.col = top.col; e.row = top.row; }
        if (e._clientOwned || GridManager.isVegetation(e) || e.type === T.WATER) continue;
        // Wire past its pole's reach carries nothing, and could not be laid
        // again as it stands (the hop limit refuses it), so it is not part
        // of the build. Left in, it would be a piece the crew can never put
        // up, and on a reactor job that holds the fuel back for good.
        if (e.type === T.WIRE && e.outOfRange) continue;
        if (!types.has(pieceType(e))) return false;
        pieces.push(pieceOf(e));
      }
    }
    if (!pieces.length) return false;
    builds.set(c.siteId, {
      contract: JSON.parse(JSON.stringify({
        siteId: c.siteId, title: String(c.title || '').replace(/^Repeat Order: /, ''), margin: c.margin,
        days: c.days, requirements: c.requirements, archetype: c.archetype, arrival: c.arrival,
      })),
      pieces: orderPieces(pieces),
    });
    return true;
  }

  function canRepeat(siteId) {
    const site = ContractSites.getSite(siteId);
    return !!(site && builds.has(siteId) && ContractSites.standingFor(site.client).completed >= CREW_MIN_JOBS);
  }
  // The same job again, at the same money, with none of the one-off terms.
  function repeatOrder(siteId) {
    const c = JSON.parse(JSON.stringify(builds.get(siteId).contract));
    return ContractSites.adopt({
      ...c, id: `rep_${siteId}_x${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`,
      title: 'Repeat Order: ' + c.title, perk: null, terms: {}, generated: true, repeat: true,
    });
  }

  // Why a crew cannot be sent to this offer right now, or null when it can.
  function dispatchBlocker(c) {
    const b = c && builds.get(c.siteId);
    if (!c || !c.repeat || !b) return 'Not a repeat order';
    // The build on file is always the player's latest at this site; an offer
    // posted before they did a different job there no longer matches it.
    if (JSON.stringify(b.contract.requirements) !== JSON.stringify(c.requirements)) return 'Your last build here was for a different job';
    if (atJob >= 0) return 'Crews are sent from home';
    if (jobs.length >= MAX_JOBS) return 'No room for another contract';
    if (crewsOut() >= MAX_CREWS) return 'Your crew is already out on a job';
    return null;
  }

  // Lays a job site out and hands it back as a snapshot without the player
  // going there: what accept() stamps, with home put straight back after.
  function stampSiteSnapshot(contract, site) {
    const home = snapshotWorld();
    let snap = null;
    try {
      clearWorld();
      if (typeof BeltCargo !== 'undefined') BeltCargo.loadState(null);
      stampSite(site, contract);
      applySituation(contract);
      stampEdges(ContractSites.absoluteBounds(site));
      const day = dayLength(), arrival = contract.arrival || site.arrival;
      DayNight.setElapsed(Math.floor(DayNight.getElapsed() / day) * day + (arrival.hour / 24) * day);
      DustSystem.load(0);   // a site is clean of home's dust
      FrostSystem.load(arrival.season === 'winter'
        ? { snow: arrival.weather === 'snow' || arrival.weather === 'blizzard' ? 0.95 : 0.75, coverage: 0.8 }
        : { snow: 0, coverage: 0 });
      snap = snapshotWorld();
    } finally {
      restoreWorld(home, true);
      TerrainSystem.syncToWater();
    }
    return snap;
  }

  function dispatch(contractId) {
    const contract = ContractSites.getContract(contractId);
    if (dispatchBlocker(contract)) return;
    const site = ContractSites.getSite(contract.siteId);
    if (!site) return;
    const snap = stampSiteSnapshot(contract, site);
    if (!snap) return;

    const bounds  = ContractSites.absoluteBounds(site);
    const markers = ContractSites.absoluteMarkers(site);
    const reqs    = ContractRequirements.create(ContractSites.requirementsFor(contract), { bounds, markers });
    const pieces  = builds.get(contract.siteId).pieces.map(p => ({ ...p }));
    const total   = (contract.days || 1) * dayLength();
    const work    = pieces.reduce((a, p) => a + pieceWork(p), 0);
    // The build has to leave room for whatever hold the client wants after it.
    const buildFor = Math.max(dayLength() * 0.1, (total - reqs.holdOwed()) * CREW_BUILD_SHARE);

    jobs.push({
      contract, site, reqs, bounds, markers,
      advance: 0,              // the client pays the crew's materials directly
      remaining: total,
      warned: false,
      lastResults: null,
      snap,
      crew: {
        pieces,
        placed: 0,             // pieces the crew has got through
        onGrid: 0,             // how many of those are standing on the site (see crewRaise)
        t: 0,                  // seconds of work put into the piece in hand
        unit: buildFor / Math.max(1, work),
        stallAt: Math.random() < CREW_STALL ? Math.floor(pieces.length * (0.2 + Math.random() * 0.6)) : -1,
        stalled: false,
        signoff: 0,            // seconds since the last piece went in
        broken: false,         // the finished build was failing the checklist when last seen
      },
    });
    panelJob = jobs.length - 1;
    offers = offers.filter(o => o.contractId !== contract.id);
    repostAt.set(contract.siteId, homeClock + REPOST_MAX_DAYS * dayLength());
    MessageLog.add(`Crew dispatched to ${site.client}: ${pieces.length} pieces to put up`, '#ffb060');
    SFX.goodConnect?.();
    if (boardOpen) renderBoard();
    _lastSig = null;
    renderChecklist();
  }

  // Puts one piece of the build down on the site underfoot, through the
  // player's own placement path with the client's money. Returns the entity,
  // or null when it could not go in (the player built there themselves, or
  // something it depends on is not up yet).
  function crewPlace(p) {
    const st = InputManager.state;
    // A tank from a build saved at 7×7 goes up at 6×6 (see trimLegacyTanks).
    if (p.type === T.OILSTORAGE && p.w === 7 && p.h === 7) {
      p.row += 1;
      if ((p.rot || 0) % 2 === 1) p.col += 1;
      p.w = 6; p.h = 6;
    }
    const [c, r] = p.at || [p.col, p.row];
    const stacks = () => stackOf(GridManager.getEntity(p.col, p.row)).concat(stackOf(GridManager.getEntity(c, r)));
    const before = stacks();
    const keep = { tool: st.selectedTool, rot: st.placementRotation, ori: st.shaftOrientation,
                   pipeAxis: st.undergndPipeAxis, beltAxis: st.undergndBeltAxis, split: st.splitter, stamping: st.bpStamping };
    const bal = Economy.balance, toast = window.showToast, sfxError = SFX.error;
    const tail = document.body.lastElementChild;
    HistoryManager.mute();                 // a crew's work is not the player's to undo
    window.showToast = () => {};
    SFX.error = () => {};
    try {
      Economy.setBalance(1e15);            // the client pays; the player's balance is put back below
      st.bpStamping = true;                // pieces keep the facing they were built with
      st.selectedTool = p.type;
      st.placementRotation = p.rot || 0;
      if (p.ori)  st.shaftOrientation = p.ori;
      if (p.axis) { st.undergndPipeAxis = p.axis; st.undergndBeltAxis = p.axis; }
      if (p.split) st.splitter = p.split;
      st.bpPipeLinks = p.type === T.PIPE ? (p.links ?? null) : undefined;
      st.bpBeltLinks = p.type === T.CONVEYOR ? (p.links ?? null) : undefined;
      st.bpUdgSpans = p.udgSpans;
      InputManager.tryPlaceAt(c, r);
    } catch (err) {
      console.warn('[crew] could not place', p.type, p.col, p.row, err);
    } finally {
      st.bpUdgSpans = undefined;
      st.bpPipeLinks = undefined;
      st.bpBeltLinks = undefined;
      st.bpStamping = keep.stamping;
      st.selectedTool = keep.tool;
      st.placementRotation = keep.rot;
      st.shaftOrientation = keep.ori;
      st.undergndPipeAxis = keep.pipeAxis;
      st.undergndBeltAxis = keep.beltAxis;
      st.splitter = keep.split;
      Economy.setBalance(bal);
      SFX.error = sfxError;
      window.showToast = toast;
      HistoryManager.unmute();
    }
    const made = stacks().find(e => pieceType(e) === p.type && !before.includes(e)) || null;
    if (made) made._paid = 0;              // the client's money bought it: taking it out refunds nothing
    else {
      // A refused placement flashes its reason at the player, who did not ask for it.
      for (let el = document.body.lastElementChild; el && el !== tail; ) {
        const prev = el.previousElementSibling;
        if (/fadeOut/.test(el.style.cssText || '')) el.remove();
        el = prev;
      }
    }
    return made;
  }

  // Brings the ground up to date with the crew's progress: every piece it
  // has got to that is not yet standing. One that will not go in is tried
  // once more at the end of the job, when whatever was in its way may be up.
  function crewRaise(job, ring) {
    const cr = job.crew;
    let put = false;
    while (cr.onGrid < cr.placed && cr.onGrid < cr.pieces.length) {
      const p = cr.pieces[cr.onGrid++];
      const e = crewPlace(p);
      if (e) { put = true; if (ring) (cr._fresh = cr._fresh || []).push({ e, at: performance.now() }); }
      else if (!p.again) cr.pieces.push({ ...p, again: true });
      else p.failed = true;                // left for the player (see fuelHeld)
    }
    if (put) { PowerNetwork.recomputeWireHops?.(); job.reqs.invalidate(); }
  }

  // Whether a reactor on the site underfoot is to be kept off its fuel, and
  // why: 'build' while the crew is still putting the plant up, 'missing'
  // while a piece that would not go in is still missing, 'cooling' while
  // this reactor's cooling is not running. NuclearSystem asks before it lets
  // rods into the core, so on a crew job nothing can heat up, let alone melt
  // down: a whole build whose towers have no power to start on simply waits,
  // unfuelled, for the player. Without a reactor, only the first two count.
  function fuelHeld(e) {
    const job = currentJob(), cr = job && job.crew;
    if (!cr || job._wreck) return false;
    if (cr.onGrid < cr.pieces.length) return 'build';
    if (cr.pieces.some(p => p.failed && !stackOf(GridManager.getEntity(p.col, p.row)).some(x => pieceType(x) === p.type))) return 'missing';
    if (e && !e._cooled) return 'cooling';
    return false;
  }

  // What the crew has built that is not on the ground yet, as stand-ins for
  // the away model of the site (simulateSiteAway): they generate, draw and
  // store, so a hold is judged against the plant the crew has put up.
  function crewGhosts(job) {
    const cr = job.crew;
    const g = cr._ghosts = cr._ghosts || [];
    const out = [];
    for (let i = cr.onGrid; i < cr.placed && i < cr.pieces.length; i++) {
      const p = cr.pieces[i];
      if (isLine(p) || p.again) continue;
      const type = (p.type === T.UNDERGNDCONVEYOR || p.type === T.CONVEYORSPLITTER) ? T.CONVEYOR : p.type;
      if (!g[i] && EntityDefs[type]) g[i] = new Entity(type, p.col, p.row);
      if (g[i]) out.push(g[i]);
    }
    return out;
  }

  function crewStall(job) {
    const cr = job.crew;
    cr.stalled = true;
    MessageLog.add(`${job.site.client} crew has stopped work and is asking for you on site`, '#ff9060');
    NotificationStack.push({
      icon: '🚧', title: 'Crew needs you',
      message: `The crew at ${job.site.place} hit a snag ${cr.placed} of ${cr.pieces.length} pieces in and has stopped. ` +
               `Travel to the site to get them moving again; the deadline is still running. Click to go.`,
      color: '#ff9060', border: '#603018', tag: 'crew-stall', glow: true, contract: true,
      onClick: () => { const i = jobs.indexOf(job); if (i >= 0 && atJob < 0) resumeSite(i); },
    });
  }

  function tickCrew(job, dt) {
    const cr = job.crew, here = job === currentJob();
    if (!cr || !(dt > 0) || (!here && !job.snap)) return;
    if (here) {
      // Turning up is what a stuck crew was waiting for.
      if (cr.stalled || cr.broken) {
        if (cr.stalled) MessageLog.add(`${job.site.client} crew is back at work`, '#40d090');
        cr.stalled = false;
        cr.broken  = false;
        NotificationStack.dismissTag('crew-stall');
      }
      // Whatever went up while the player was away goes onto the ground now.
      if (cr.onGrid < cr.placed) crewRaise(job, false);
    }
    if (cr.stalled) return;

    if (!crewBuilt(job)) {
      cr.t += dt;
      while (!crewBuilt(job)) {
        const p = cr.pieces[cr.placed], need = pieceWork(p) * cr.unit;
        if (cr.t < need) break;
        if (cr.stallAt === cr.placed) {
          cr.stallAt = -1;
          if (!here) { crewStall(job); break; }
        }
        cr.t -= need;
        cr.placed++;
        if (here) crewRaise(job, true);
      }
      if (crewBuilt(job)) MessageLog.add(`${job.site.client} crew has finished building${here ? '' : '; the client is checking it over'}`, '#ffb060');
      return;
    }

    // Built. On site the player signs it off themselves (COMPLETE), against
    // the live checklist. Away, the build is the one that passed last time,
    // so what is left is the client's own checks and any hold they asked for.
    if (here) { cr.settle = (cr.settle || 0) + dt; return; }
    if (cr.broken) return;
    cr.signoff += dt;
    if (cr.signoff >= DayNight.secondsPerGameHour() && job.reqs.holdOwed() <= 0) settleCrew(job);
  }

  function settleCrew(job) {
    const client = job.site.client, pay = crewPay(job.contract);
    closeJob(job);
    Economy.setBalance(Economy.balance + pay);
    MessageLog.add(`${client} signed off your crew's work: ${formatMoney(pay)} paid`, '#40d090');
    banner = { title: 'CREW JOB COMPLETE', sub: `${client} · ${formatMoney(pay)} received`, until: performance.now() + 4200 };
    SFX.goodConnect?.();
  }

  // One line for the checklist panel on what the crew is doing.
  function crewStatus(job, atSite) {
    const cr = job.crew, pay = `pays ${formatMoney(crewPay(job.contract))}`;
    const reactor = ContractSites.liabilityFor(job.contract) > 0;
    if (cr.stalled) return 'CREW STOPPED · they are waiting for you on site';
    if (!crewBuilt(job)) return `CREW BUILDING · ${Math.floor(100 * cr.placed / Math.max(1, cr.pieces.length))}% built${reactor ? ' · reactor fuel held until the build is whole' : ''} · ${pay}`;
    const failed = cr.pieces.filter(p => p.failed).length;
    const held = reactor && job === currentJob()
      && [T.NUCLEARREACTOR, T.ADVREACTOR].some(t => [...EntityRegistry.getByType(t)].some(e => e._crewHeld));
    if (held) {
      const why = fuelHeld();
      if (why === 'missing') return `CREW FINISHED · ${failed} piece${failed > 1 ? 's' : ''} would not go in; reactor fuel held until you put ${failed > 1 ? 'them' : 'it'} up`;
      if (why === 'build')   return 'CREW FINISHED · reactor fuel held until the build is whole';
      return 'CREW FINISHED · reactor fuel held: its cooling is not running. Get the cooling towers powered and watered';
    }
    if (cr.broken) return 'CREW FINISHED · the build is not passing the checklist; it needs you on site';
    return atSite ? `CREW FINISHED · sign the job off once every line is ticked · ${pay}`
                  : `CREW FINISHED · waiting on the client's sign-off · ${pay}`;
  }

  // ── Board UI ─────────────────────────────────────────────────────

  // A contract already in hand does NOT close the board: the player can
  // still read what else is on offer, they just cannot take any of it
  // until the current job is finished or abandoned. Bailing out here (as
  // this used to) left the beacon's OPEN CONTRACT BOARD button rendered,
  // lit, and completely inert for the whole length of a contract, which
  // reads as a broken button rather than as a rule.
  function openBoard() {
    if (!boardAvailable()) return;
    // Opening the board is the acknowledgement the found-work card is
    // waiting for, however the player got here — the notification, the
    // toast, or the beacon's own button.
    NotificationStack.dismissTag('contractoffer');
    boardOpen = true;
    renderBoard();
    const el = document.getElementById('contract-board');
    if (el) el.style.display = 'flex';
  }

  function closeBoard() {
    boardOpen = false;
    const el = document.getElementById('contract-board');
    if (el) el.style.display = 'none';
  }

  function toggleBoard() { boardOpen ? closeBoard() : openBoard(); }

  // The side-stack contracts button: shown while the board can be opened
  // (a powered Beacon), badged while offers are waiting on it unread.
  function tickButton() {
    const btn = document.getElementById('btn-contracts');
    if (!btn) return;
    btn.classList.toggle('unlocked', boardAvailable());
    btn.classList.toggle('open', boardOpen);
    btn.classList.toggle('has-new', !boardOpen && offers.length > 0);
  }

  // The beacon's "OPEN CONTRACT BOARD" button lives inside EntityInfoPanel,
  // whose buildContent() wipes and rebuilds #ep-body every tick
  // (entity_info_panel.js:1841). A handler bound to the button itself is
  // destroyed between the player's mousedown and mouseup roughly ten times
  // a second, which is why the button needed a dozen clicks to catch. One
  // delegated mousedown listener on the document is immune to that: it
  // fires on press, before any rebuild can intervene.
  document.addEventListener('mousedown', ev => {
    if (!ev.target.closest) return;
    if (ev.target.closest('[data-open-contract-board]')) {
      ev.preventDefault();
      openBoard();
      return;
    }
    // Same reasoning for the sweep button: it lives in a panel that is
    // rebuilt from scratch several times a second, so it cannot own its
    // own listener.
    const sweep = ev.target.closest('[data-beacon-search]');
    if (sweep) {
      ev.preventDefault();
      if (searching) cancelSearch(); else startSearch();
    }
  });

  // ── Warning before a reactor job ─────────────────────────────────
  function ensureLiabilityEl() {
    let el = document.getElementById('contract-liability-confirm');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'contract-liability-confirm';
    el.style.cssText =
      'display:none;position:fixed;inset:0;z-index:970;align-items:center;justify-content:center;' +
      'background:rgba(2,6,12,0.78);backdrop-filter:blur(2px);pointer-events:all;font-family:inherit';
    el.addEventListener('mousedown', ev => {
      const yes = ev.target.closest('[data-liab-accept]');
      if (yes) { const id = yes.getAttribute('data-liab-accept'); el.style.display = 'none'; accept(id); return; }
      const crew = ev.target.closest('[data-liab-dispatch]');
      if (crew) { const id = crew.getAttribute('data-liab-dispatch'); el.style.display = 'none'; dispatch(id); return; }
      // Past the funds warning: a reactor job still gets its own warning next.
      const go = ev.target.closest('[data-funds-accept]');
      if (go) {
        const id = go.getAttribute('data-funds-accept'); el.style.display = 'none';
        if (ContractSites.liabilityFor(ContractSites.getContract(id))) confirmLiability(id); else accept(id);
        return;
      }
      if (ev.target === el || ev.target.closest('[data-liab-cancel]')) el.style.display = 'none';
    });
    document.body.appendChild(el);
    return el;
  }
  // ── Warning before a job the player cannot fund ──────────────────
  //
  // A fixed-bid job pays no advance: the equipment comes out of the
  // player's own balance and the client pays for it at the end. Taking one
  // without the money for the kit means arriving on site unable to build
  // it, with the deadline running. Returns what they are short by, or null.
  function fundsShort(c) {
    if (!c || !(c.terms && c.terms.fixedBid)) return null;
    const mats = ContractSites.estimateMaterials(ContractSites.requirementsFor(c), c.siteId);
    const have = Economy.balance;
    return have < mats ? { mats, have, short: mats - have } : null;
  }
  function confirmFunds(contractId) {
    const c = ContractSites.getContract(contractId), f = fundsShort(c);
    if (!c || !f) return;
    const site = ContractSites.getSite(c.siteId);
    const el = ensureLiabilityEl();
    el.innerHTML = `
      <div style="width:min(540px,92vw);background:#040910;border:1px solid #6a5a18;border-radius:5px;box-shadow:0 10px 60px rgba(0,0,0,0.6)">
        <div style="padding:16px 18px;border-bottom:1px solid #3a3018">
          <div style="font-size:14px;letter-spacing:2px;color:#f0c040">&#9888; NO ADVANCE ON THIS JOB</div>
          <div style="font-size:10px;letter-spacing:1px;color:var(--text-dim);margin-top:5px">${site.client} &middot; ${site.place}</div>
        </div>
        <div style="padding:16px 18px">
          <ul style="margin:0;padding-left:18px">
            <li style="font-size:11px;line-height:1.8;color:#c8d8e4">This is a fixed bid: you buy the equipment yourself and are paid for it, with the margin, when the job is signed off.</li>
            <li style="font-size:11px;line-height:1.8;color:#c8d8e4">The equipment is estimated at <b style="color:#f0c040">${formatMoney(f.mats)}</b>. You have <b style="color:#ff9070">${formatMoney(f.have)}</b>.</li>
            <li style="font-size:11px;line-height:1.8;color:#c8d8e4">You are <b style="color:#ff6040">${formatMoney(f.short)} short</b>. Unless your city earns that while you are away, you will not be able to build everything, and the deadline keeps running.</li>
          </ul>
          <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end">
            <button data-liab-cancel style="font-size:11px;letter-spacing:1px;padding:8px 18px;border:1px solid #1e3a50;border-radius:3px;background:transparent;color:#8ec8ff;cursor:pointer">GO BACK</button>
            <button data-funds-accept="${contractId}" style="font-size:11px;letter-spacing:1px;padding:8px 18px;border:1px solid #6a5a18;border-radius:3px;background:#201804;color:#f0d080;cursor:pointer">ACCEPT ANYWAY</button>
          </div>
        </div>
      </div>`;
    el.style.display = 'flex';
  }

  // `crew`: the warning in front of DISPATCH CREW rather than ACCEPT. The
  // liability is the player's either way; the crew only changes who is there.
  function confirmLiability(contractId, crew = false) {
    const c = ContractSites.getContract(contractId);
    if (!c) return;
    const site = ContractSites.getSite(c.siteId);
    const L = ContractSites.liabilityFor(c);
    const el = ensureLiabilityEl();
    el.innerHTML = `
      <div style="width:min(540px,92vw);background:#040910;border:1px solid #6a2a20;border-radius:5px;box-shadow:0 10px 60px rgba(0,0,0,0.6)">
        <div style="padding:16px 18px;border-bottom:1px solid #3a1820">
          <div style="font-size:14px;letter-spacing:2px;color:#ff6040">&#9888; REACTOR JOB; READ THIS FIRST</div>
          <div style="font-size:10px;letter-spacing:1px;color:var(--text-dim);margin-top:5px">${site.client} &middot; ${site.place}</div>
        </div>
        <div style="padding:16px 18px">
          <ul style="margin:0;padding-left:18px">
            <li style="font-size:11px;line-height:1.8;color:#c8d8e4">This job puts a nuclear reactor on the client's property.</li>
            ${crew ? `<li style="font-size:11px;line-height:1.8;color:#c8d8e4">Your crew builds it, but the reactor is <b style="color:#ffb060">your liability</b> as if you had built it yourself. They will not load fuel until every piece of the build is up and its cooling is running.</li>` : ''}
            <li style="font-size:11px;line-height:1.8;color:#c8d8e4">Nothing on site will stop it for you. A reactor left without cooling, or with no turbine drawing its steam, counts down and <b style="color:#ff6040">explodes</b>. Cut its fuel rods if you cannot fix it in time.</li>
            <li style="font-size:11px;line-height:1.8;color:#c8d8e4">If it blows, the client ends the contract and bills you for the damage: up to <b style="color:#ff6040">${formatMoney(L)}</b>. That can put you in debt, and customers leave a grid that stays in debt.</li>
            <li style="font-size:11px;line-height:1.8;color:#c8d8e4">Keep the reactor cooled and its steam drawn, and watch its core temperature.</li>
          </ul>
          <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end">
            <button data-liab-cancel style="font-size:11px;letter-spacing:1px;padding:8px 18px;border:1px solid #1e3a50;border-radius:3px;background:transparent;color:#8ec8ff;cursor:pointer">GO BACK</button>
            <button ${crew ? 'data-liab-dispatch' : 'data-liab-accept'}="${contractId}" style="font-size:11px;letter-spacing:1px;padding:8px 18px;border:1px solid #6a2a20;border-radius:3px;background:#2a100c;color:#ff9070;cursor:pointer">${crew ? 'DISPATCH CREW' : 'ACCEPT'}</button>
          </div>
        </div>
      </div>`;
    el.style.display = 'flex';
  }

  function ensureBoardEl() {
    let el = document.getElementById('contract-board');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'contract-board';
    el.style.cssText =
      'display:none;position:fixed;inset:0;z-index:900;align-items:center;justify-content:center;' +
      'background:rgba(2,6,12,0.72);backdrop-filter:blur(2px);pointer-events:all;font-family:inherit';
    el.addEventListener('click', ev => {
      if (ev.target === el) { closeBoard(); return; }
      const sortBtn = ev.target.closest('[data-sort]');
      if (sortBtn) { boardSort = sortBtn.getAttribute('data-sort'); renderBoard(); return; }
      const crewBtn = ev.target.closest('[data-dispatch]');
      if (crewBtn) {
        const id = crewBtn.getAttribute('data-dispatch');
        if (ContractSites.liabilityFor(ContractSites.getContract(id))) confirmLiability(id, true); else dispatch(id);
        return;
      }
      const btn = ev.target.closest('[data-accept]');
      if (btn) {
        const id = btn.getAttribute('data-accept');
        // No advance and not enough money for the kit: say so first.
        // A job with a reactor in it makes the player liable if it goes wrong: say so too.
        if (fundsShort(ContractSites.getContract(id))) confirmFunds(id);
        else if (ContractSites.liabilityFor(ContractSites.getContract(id))) confirmLiability(id); else accept(id);
      }
      if (ev.target.closest('[data-close]')) closeBoard();
    });
    document.body.appendChild(el);
    return el;
  }

  function renderBoard() {
    const el = ensureBoardEl();
    // Up to MAX_JOBS at once. The offers stay readable when the slate is
    // full — only taking them is blocked.
    const locked = !canAcceptMore();

    // Sorted on demand: with more sites and bigger spreads of jobs the board
    // stops being a list you can just read down.
    const keyOf = o => {
      const oc = ContractSites.getContract(o.contractId);
      if (!oc) return 0;
      return boardSort === 'size'     ? -ContractSites.complexityOf(oc)
           : boardSort === 'deadline' ? oc.days
           : boardSort === 'expiry'   ? o.expiresAt
           : -ContractSites.payoutFor(oc);
    };
    const listed = [...offers].sort((a, b) => keyOf(a) - keyOf(b));

    const cards = listed.map(offer => {
      const c    = ContractSites.getContract(offer.contractId);
      const site = ContractSites.getSite(c.siteId);
      const mats = ContractSites.estimateMaterials(ContractSites.requirementsFor(c), c.siteId);
      const pay  = ContractSites.payoutFor(c);
      const adv  = ContractSites.advanceFor(c);
      const bal  = ContractSites.balanceFor(c);
      const size = ContractSites.sizeOf(c);
      // How long this offer stays on the board before the client withdraws.
      const shelf    = Math.max(0, offer.expiresAt - homeClock);
      const shelfCol = shelf < 1.5 * dayLength() ? '#f0c040' : 'var(--text-dim)';
      const rep      = ContractSites.standingFor(site.client);
      const cRank    = ContractSites.clientRank(site.client);
      const repText  = rep.completed || rep.failed
        ? `${cRank.name} · ${rep.completed} completed${rep.failed ? `, ${rep.failed} failed` : ''}`
        : 'New client';
      const ARCHE = { rush: ['RUSH', '#ff9060'], retainer: ['RETAINER', '#a890ff'], peak: ['PEAK SUPPORT', '#60d0c0'], showcase: ['SHOWCASE', '#ffd070'],
                      storm: ['STORM RECOVERY', '#80b8ff'], cleanup: ['CLEANUP', '#c0a060'], disaster: ['DISASTER RESPONSE', '#ff7080'],
                      logistics: ['LOW-FOOTPRINT', '#90e070'] }[c.archetype];
      const terms = c.terms || {};
      const reqs = ContractRequirements.create(ContractSites.requirementsFor(c),
                                              { markers: ContractSites.absoluteMarkers(site) });
      const noCrew = c.repeat ? dispatchBlocker(c) : null;

      return `
        <div style="border:1px solid #1e3a50;border-radius:4px;background:#060d16;padding:16px 18px;margin-bottom:13px">
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:13px">
            <div>
              <div style="font-size:16px;letter-spacing:1px;color:#5aa8ff">${site.client}</div>
              <div style="font-size:10px;letter-spacing:1px;color:var(--text-dim);margin-top:3px">${site.place} · ${c.title}</div>
              <div style="font-size:9px;letter-spacing:0.5px;color:${rep.completed ? '#40d090' : 'var(--text-dim)'};margin-top:4px">${repText}</div>
            </div>
            <div style="text-align:right;white-space:nowrap">
              ${c.repeat ? `<span style="font-size:9px;letter-spacing:1px;color:#ffb060;padding:3px 8px;border:1px solid #ffb06055;border-radius:2px;margin-right:5px">REPEAT ORDER</span>` : ''}
              ${ARCHE ? `<span style="font-size:9px;letter-spacing:1px;color:${ARCHE[1]};padding:3px 8px;border:1px solid ${ARCHE[1]}55;border-radius:2px;margin-right:5px">${ARCHE[0]}</span>` : ''}
              <span style="font-size:9px;letter-spacing:1px;color:${size === 'Flagship' ? '#ffd070' : '#5aa8ff'};padding:3px 8px;border:1px solid ${size === 'Flagship' ? '#6a4a10' : '#23486e'};border-radius:2px">${size.toUpperCase()} JOB</span>
              <div style="font-size:9px;color:${shelfCol};margin-top:5px">Offer ${formatLeft(shelf)}</div>
            </div>
          </div>

          <div style="font-size:10px;line-height:1.6;color:var(--text-dim);margin:12px 0 13px">${site.blurb}</div>

          <div style="font-size:9px;letter-spacing:1px;color:#6090a8;margin-bottom:6px">SCOPE OF WORK</div>
          <ul style="margin:0 0 13px;padding-left:18px">
            ${limitFirst(reqs.brief().map((b, i) => ({ b, kind: reqs.specs[i].kind }))).map(({ b }) => `<li style="font-size:10px;line-height:1.7;color:#a8c4d4">${b}</li>`).join('')}
          </ul>

          ${ContractSites.liabilityFor(c) ? `<div style="font-size:10px;margin:0 0 11px;padding:6px 9px;border:1px solid #6a2a20;border-radius:3px;background:#1a0a08;color:#ff9070"><span style="letter-spacing:1px;font-size:9px;color:#ff6040">&#9888; REACTOR LIABILITY</span> &nbsp;A second critical reactor event on this job makes you liable for up to <b>${formatMoney(ContractSites.liabilityFor(c))}</b> and fails the contract. That can put you in debt.</div>` : ''}
          ${terms.fixedBid ? `<div style="font-size:10px;margin:0 0 11px;padding:6px 9px;border:1px solid #5a4a18;border-radius:3px;background:#161004;color:#f0d080"><span style="letter-spacing:1px;font-size:9px;color:#f0c040">FIXED BID</span> &nbsp;No advance: you fund the equipment yourself, and the client pays for it with a bigger margin on completion.${fundsShort(c) ? `<div style="margin-top:5px;color:#ff9070">&#9888; You have ${formatMoney(fundsShort(c).have)} and the equipment is about ${formatMoney(mats)}: <b style="color:#ff6040">${formatMoney(fundsShort(c).short)} short</b>.</div>` : ''}</div>` : ''}
          ${terms.rival ? `<div style="font-size:10px;margin:0 0 11px;padding:6px 9px;border:1px solid #5a2a4a;border-radius:3px;background:#140812;color:#ff9ad0"><span style="letter-spacing:1px;font-size:9px;color:#ff70b0">RIVAL BID</span> &nbsp;Another crew is after this job. Finish within <b>${terms.rival.days} day${terms.rival.days === 1 ? '' : 's'}</b> for a <b>${formatMoney(terms.rival.bonus)}</b> bonus.</div>` : ''}
          ${c.repeat ? `<div style="font-size:10px;line-height:1.6;margin:0 0 11px;padding:6px 9px;border:1px solid #5a4018;border-radius:3px;background:#161004;color:#ffcf90"><span style="letter-spacing:1px;font-size:9px;color:#ffb060">REPEAT ORDER</span> &nbsp;The job you did here last time, again. Take it yourself for the full pay, or send a crew to put up your last build for <b>${formatMoney(crewPay(c))}</b> while you stay home. You can visit the site at any point to watch or lend a hand.</div>` : ''}
          ${c.perk ? `<div style="font-size:10px;margin:0 0 11px;padding:6px 9px;border:1px solid #1a4a66;border-radius:3px;background:#07182a;color:#7ad8ff"><span style="letter-spacing:1px;font-size:9px;color:#5aa8ff">${c.perk.mode === 'inkind' ? 'PAID MOSTLY IN KIND' : 'CASH + PERK'}</span> &nbsp;${c.perk.label}</div>` : ''}
          <div style="display:flex;gap:18px;font-size:10px;border-top:1px solid #12283a;padding-top:11px">
            <div><span style="color:var(--text-dim)">Materials </span><span style="color:#c8d8e4">${formatMoney(mats)}</span></div>
            <div><span style="color:var(--text-dim)">Margin </span><span style="color:#40d090">${formatMoney(c.margin)}</span></div>
            <div style="margin-left:auto"><span style="color:var(--text-dim)">Deadline </span><span style="color:#f0c040">${c.days} days on site</span></div>
          </div>

          <div style="display:flex;align-items:center;gap:13px;margin-top:13px">
            <div>
              <div style="font-size:10px;color:var(--text-dim)">
                ${terms.fixedBid
                  ? `No advance &middot; <span style="color:#40d090">${formatMoney(bal)} on completion (${formatMoney(c.margin)} profit)</span>`
                  : `${formatMoney(adv)} for equipment, paid up front &middot;
                <span style="color:#40d090">${formatMoney(bal)} profit on completion</span>`}
              </div>
              <div style="font-size:17px;color:#f0c040;letter-spacing:1px;margin-top:3px">${formatMoney(pay)} total</div>
              ${c.repeat ? `<div style="font-size:10px;line-height:1.6;margin-top:6px;white-space:nowrap">
                <div><span style="color:var(--text-dim)">Do it yourself: </span><span style="color:#40d090">${formatMoney(c.margin)} profit</span></div>
                <div><span style="color:var(--text-dim)">Send a crew: </span><span style="color:#ffb060">${formatMoney(crewPay(c))} profit</span><span style="color:var(--text-dim)">, nothing to buy</span></div>
              </div>` : ''}
            </div>
            ${c.repeat ? `<button ${noCrew ? `disabled title="${noCrew}"` : `data-dispatch="${c.id}"`} style="margin-left:auto;font-size:12px;letter-spacing:1px;padding:8px 16px;
              border:1px solid ${noCrew ? '#2a2414' : '#6a4a18'};border-radius:3px;
              background:${noCrew ? 'transparent' : '#201404'};color:${noCrew ? '#4a4030' : '#ffb060'};
              cursor:${noCrew ? 'default' : 'pointer'}">DISPATCH CREW</button>` : ''}
            <button ${locked ? 'disabled' : `data-accept="${c.id}"`} style="${c.repeat ? '' : 'margin-left:auto;'}font-size:12px;letter-spacing:1px;padding:8px 21px;
              border:1px solid ${locked ? '#16283a' : '#23486e'};border-radius:3px;
              background:${locked ? 'transparent' : '#0d2138'};color:${locked ? '#2d4054' : '#8ec8ff'};
              cursor:${locked ? 'default' : 'pointer'}">ACCEPT &amp; TRAVEL</button>
          </div>
        </div>`;
    }).join('');

    // Re-rendered whenever an offer lands or lapses: don't throw the player
    // back to the top of a long board.
    const prevScroll = el.querySelector('.cb-scroll')?.scrollTop || 0;
    el.innerHTML = `
      <div class="cb-scroll" style="width:min(730px,94vw);max-height:86vh;overflow:auto;overscroll-behavior:contain;background:#040910;
                  border:1px solid #1e3a50;border-radius:5px;box-shadow:0 10px 60px rgba(0,0,0,0.6)">
        <div style="display:flex;align-items:center;justify-content:space-between;
                    padding:16px 18px;border-bottom:1px solid #12283a">
          <div>
            <div style="font-size:14px;letter-spacing:2px;color:#5aa8ff">CONTRACT BOARD</div>
            <div style="font-size:9px;letter-spacing:1px;color:var(--text-dim);margin-top:4px">${(() => { const r = ContractSites.contractorRank(); return `CONTRACTOR RANK · ${r.name.toUpperCase()} · ${r.count} JOB${r.count === 1 ? '' : 'S'} DONE${r.next ? ` · NEXT AT ${r.next.min}` : ''}`; })()}</div>
          </div>
          <div style="display:flex;gap:5px;margin:0 auto 0 18px;align-items:center">
            <span style="font-size:9px;letter-spacing:1px;color:var(--text-dim)">SORT</span>
            ${[['pay', 'PAY'], ['size', 'SIZE'], ['deadline', 'DEADLINE'], ['expiry', 'EXPIRES']].map(([k, l]) => `<button data-sort="${k}" style="font-size:9px;letter-spacing:1px;padding:3px 8px;border:1px solid ${boardSort === k ? '#5aa8ff' : '#1e3a50'};border-radius:2px;background:${boardSort === k ? '#0d2138' : 'transparent'};color:${boardSort === k ? '#8ec8ff' : '#6090a8'};cursor:pointer">${l}</button>`).join('')}
          </div>
          <button data-close style="font-size:14px;line-height:1;padding:4px 10px;border:1px solid #1e3a50;
            border-radius:3px;background:transparent;color:#6090a8;cursor:pointer">✕</button>
        </div>
        ${ContractPerks.isActive() ? `
        <div style="padding:9px 18px;border-bottom:1px solid #12283a;background:#06121e;display:flex;flex-wrap:wrap;gap:7px;align-items:center">
          <span style="font-size:9px;letter-spacing:1px;color:#5aa8ff">ACTIVE PERKS</span>
          ${ContractPerks.list().map(p => `<span style="font-size:10px;color:#7ad8ff;border:1px solid #1a4a66;border-radius:2px;padding:2px 8px">${p.label} &middot; ${ContractPerks.timeLeftText(p)} left</span>`).join('')}
        </div>` : ''}
        ${locked ? `
        <div style="padding:11px 18px;border-bottom:1px solid #12283a;background:#08131f;
                    font-size:10px;line-height:1.6;color:#f0c040">
          You are running ${jobs.length} contracts at once: ${jobs.map(j => j.site.client).join(', ')}.
          That is the limit. Finish or abandon one before taking new work; these offers keep
          running down in the meantime, and so do all ${jobs.length} deadlines.
        </div>` : ''}
        <div style="padding:18px">
          ${cards || '<div style="font-size:12px;color:var(--text-dim);text-align:center;padding:31px">No outstanding contracts.<br><span style="font-size:10px">Run a sweep at the beacon to look for work.</span></div>'}
        </div>
      </div>`;
    const sc = el.querySelector('.cb-scroll');
    if (sc) sc.scrollTop = prevScroll;
  }

  // ── On-site checklist ────────────────────────────────────────────

  // Collapse state survives re-renders and sessions.
  const COLLAPSE_KEY = 'gw_contract_checklist_collapsed';
  let collapsed = (() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch (_e) { return false; }
  })();

  function setCollapsed(v) {
    collapsed = !!v;
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch (_e) {}
    _lastSig = null;      // force a redraw at the new size
    renderChecklist();
  }

  // ── Checklist position ───────────────────────────────────────────
  //
  // The panel is parked top-right by default, which is exactly where the
  // progress tracker, weather and grid dropdowns open — so it has to be
  // movable. Position is stored as pixels from the top-left and survives
  // sessions; nothing is stored until the player actually drags it, so an
  // untouched panel keeps following the right edge on a window resize.
  const POS_KEY = 'gw_contract_checklist_pos';
  const CHECKLIST_W = 340;

  function loadPos() {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      return (typeof p.left === 'number' && typeof p.top === 'number') ? p : null;
    } catch (_e) { return null; }
  }

  function savePos(p) {
    try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch (_e) {}
  }

  // Keep at least a strip of the header on screen, so the panel can never
  // be dragged somewhere it cannot be grabbed back from — including after
  // the window is made smaller than it was when the position was stored.
  function clampPos(left, top) {
    // Mobile draws the checklist scaled down: keep it on screen by the
    // width it actually has there.
    const _cw = window.GW_MOBILE ? (document.getElementById('contract-checklist')?.getBoundingClientRect().width || CHECKLIST_W) : CHECKLIST_W;
    const maxL = Math.max(0, window.innerWidth  - _cw);
    const maxT = Math.max(0, window.innerHeight - 40);
    return { left: Math.min(Math.max(0, left), maxL), top: Math.min(Math.max(0, top), maxT) };
  }

  function applyPos(el, p) {
    el.style.left  = p.left + 'px';
    el.style.top   = p.top  + 'px';
    el.style.right = 'auto';
    fitChecklistHeight(el);
  }

  // A big job's requirement list can run past the bottom of the window, so
  // the panel is capped at the space below wherever it sits and the rows
  // scroll inside it (header, tabs and buttons stay put).
  function fitChecklistHeight(el) {
    const top = el.getBoundingClientRect().top;
    el.style.maxHeight = Math.max(140, window.innerHeight - top - 12) + 'px';
  }

  function ensureChecklistEl() {
    let el = document.getElementById('contract-checklist');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'contract-checklist';
    el.style.cssText =
      'display:none;position:fixed;top:170px;left:14px;width:' + CHECKLIST_W + 'px;z-index:820;' +
      'pointer-events:all;background:rgba(4,9,16,0.94);border:1px solid #1e3a50;border-radius:4px;' +
      'font-family:inherit;flex-direction:column;overflow:hidden';

    const stored = loadPos();
    if (stored) applyPos(el, clampPos(stored.left, stored.top));

    // Dragging by the header. The header is also the collapse toggle, so
    // the two are told apart by movement: a press that never travels more
    // than DRAG_SLOP collapses on release, anything further is a drag and
    // does not toggle. Collapse therefore fires on mouseup rather than
    // mousedown — safe here because the listener lives on the container,
    // which survives the innerHTML rebuilds that replace the header.
    const DRAG_SLOP = 4;
    let drag = null;

    function onMove(ev) {
      if (!drag) return;
      const dx = ev.clientX - drag.startX, dy = ev.clientY - drag.startY;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) <= DRAG_SLOP) return;
      drag.moved = true;
      applyPos(el, clampPos(drag.baseLeft + dx, drag.baseTop + dy));
      ev.preventDefault();
    }

    function onUp() {
      if (!drag) return;
      const d = drag;
      drag = null;
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      if (d.moved) {
        savePos({ left: parseFloat(el.style.left) || 0, top: parseFloat(el.style.top) || 0 });
      } else {
        setCollapsed(!collapsed);   // a press that never moved is a click
      }
    }

    // mousedown, not click, for the action buttons: the panel re-renders
    // on a timer, and a click needs mousedown and mouseup to survive on
    // the same element.
    el.addEventListener('mousedown', ev => {
      if (ev.button !== 0) return;
      if (ev.target.closest('[data-collapse]')) {
        // Freeze the panel where it currently sits before switching to
        // left/top — until the first drag it may still be pinned by
        // `right`, and reading the rect is the only way to know where
        // that put it.
        const r = el.getBoundingClientRect();
        drag = { startX: ev.clientX, startY: ev.clientY,
                 baseLeft: r.left, baseTop: r.top, moved: false };
        window.addEventListener('mousemove', onMove, true);
        window.addEventListener('mouseup', onUp, true);
        ev.preventDefault();       // no text selection while dragging
        return;
      }
      if (ev.target.closest('[data-complete]')) { complete(); return; }
      if (ev.target.closest('[data-return]'))   { returnHome(); return; }
      if (ev.target.closest('[data-resume]'))   { resumeSite(); return; }
      if (ev.target.closest('[data-abandon]'))  { confirmAbandon(); }
    });

    // A window that shrinks must not strand the panel off-screen.
    window.addEventListener('resize', () => {
      applyPos(el, clampPos(parseFloat(el.style.left) || 0, parseFloat(el.style.top) || 0));
    });

    document.body.appendChild(el);
    return el;
  }

  function hideChecklist() {
    const el = document.getElementById('contract-checklist');
    if (el) el.style.display = 'none';
    _lastSig = null;
  }

  // A cap on pipes and belts shapes how the whole job has to be built, and
  // it is easy to break without noticing, so it leads the list wherever a
  // job's requirements are shown. Display order only: the saved state of
  // each row is kept by its place in the contract (reqs.toJSON).
  function limitFirst(rows) {
    return [...rows.filter(r => r.kind === 'limit'), ...rows.filter(r => r.kind !== 'limit')];
  }

  // ...and the player hears about it as they lay the tiles, not only at the
  // end: a toast as the count nears the cap, and a card the moment it goes
  // over. Each fires once per crossing; falling back under re-arms it.
  // Read off the row's own detail ("N / M tiles used", "N tiles laid: ...").
  const LIMIT_NEAR = 0.8;
  function warnLimit(job, results) {
    const i = job.reqs.specs.findIndex(s => s.kind === 'limit');
    if (i < 0 || !results[i]) return;
    const max = job.reqs.specs[i].max, n = parseInt(results[i].detail, 10);
    if (!(max > 0) || !Number.isFinite(n)) return;
    const level = n > max ? 2 : n >= max * LIMIT_NEAR ? 1 : 0;
    const was = job._limitWarn || 0;
    job._limitWarn = level;
    if (level <= was) return;
    if (level === 1) {
      showToast(`⚠ ${n} of ${max} pipe and belt tiles used: this job's limit is close`, '#f0c040', '#0e0a00', '#604010');
      return;
    }
    MessageLog.add(`${job.site.client}: over the pipe and belt limit (${n} / ${max})`, '#ff6040');
    NotificationStack.push({
      icon: '⚠', title: 'Over the pipe and belt limit',
      message: `${n} tiles of conveyor and pipe are down at ${job.site.place}, ${n - max} over the ${max} this job allows. ` +
               `The job can't be completed until you take ${n - max === 1 ? 'one' : 'some'} up; move materials by Hauler or drone instead.`,
      color: '#ff6040', border: '#602018', tag: 'contract-limit', glow: true, contract: true,
    });
  }

  // Only rebuild the DOM when something actually changed — otherwise the
  // panel is torn down and replaced several times a second for no reason,
  // which both wastes work and makes it feel unresponsive to click.
  let _lastSig = null;

  function renderChecklist() {
    const active = shownJob();
    if (!active) return hideChecklist();
    const el = ensureChecklistEl();
    el.style.display = 'flex';
    fitChecklistHeight(el);
    // The panel shows ONE job at a time. On site that is always the one
    // underfoot; at home the tab strip below picks which.
    const atSite = (active === currentJob());

    // Requirements can only be evaluated against the site's own grid. Back
    // home the grid is the player's own city, so evaluating there would
    // report every requirement as failed; show the last on-site reading
    // instead, dimmed.
    let results;
    if (atSite) {
      results = active.reqs.evaluate(true);
      active.lastResults = results;
      warnLimit(active, results);
    } else {
      results = active.lastResults || active.reqs.specs.map(spec => ({
        spec, kind: spec.kind, label: '', pass: false, progress: 0, detail: '',
      }));
      if (!active.lastResults) results = active.reqs.brief().map((label, i) => ({
        kind: active.reqs.specs[i].kind, label, pass: false, progress: 0, detail: '',
      }));
      // Anything that keeps running while the player is away (the hold)
      // reports live rather than showing the reading from when they left.
      results = results.map((r, i) => active.reqs.awayRow(i) || r);
    }
    results = limitFirst(results);
    const done    = atSite && results.every(r => r.pass);
    const site    = active.site;
    const passed  = results.filter(r => r.pass).length;

    // Deadline. Colour shifts as it runs down so the panel itself is the
    // warning rather than relying on the player watching a number.
    const left     = timeLeft();
    const totalSec = (active.contract.days || 1) * dayLength();
    const frac     = totalSec > 0 ? left / totalSec : 1;
    const timeText = formatLeft(left);
    const timeCol  = frac > 0.5 ? '#6090a8' : frac > 0.25 ? '#f0c040' : '#ff6040';

    // Every open job's deadline is in the signature, so a second contract
    // running down still repaints its tab while the player watches a first.
    const sig = collapsed + '|' + atSite + '|' + panelJob + '|' + timeText + '|' + !!active._wreck + '|' +
                jobs.map(j => Math.round(j.remaining)).join(',') + '|' +
                (active.crew ? crewStatus(active, atSite) + '|' : '') +
                results.map(r => `${r.pass}:${r.progress.toFixed(3)}:${r.detail}`).join('|');
    if (sig === _lastSig) return;
    _lastSig = sig;

    const header = `
      <div data-collapse style="display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:move;
                                user-select:none;
                                ${collapsed ? '' : 'border-bottom:1px solid #12283a'}">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;letter-spacing:1.5px;color:#5aa8ff">${site.client.toUpperCase()}</div>
          <div style="font-size:9px;letter-spacing:1px;color:var(--text-dim);margin-top:3px;
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${collapsed ? `${passed} / ${results.length} complete${atSite ? '' : ' · away from site'}`
                        : `${site.place} · ${active.contract.title}`}
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:${done ? '#40d090' : '#6090a8'};letter-spacing:1px">${passed}/${results.length}</div>
          <div style="font-size:9px;color:${timeCol};letter-spacing:0.5px;margin-top:3px;white-space:nowrap">${timeText}</div>
        </div>
        <span style="font-size:13px;line-height:1;color:#6090a8;transform:rotate(${collapsed ? 0 : 180}deg);
                     transition:transform .15s">⌄</span>
      </div>`;

    if (collapsed) { el.innerHTML = header; return; }

    const rows = results.map(r => `<div style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-top:1px solid #0e1e2c">
        <span style="font-size:12px;line-height:1.3;color:${r.pass ? '#40d090' : '#33506a'}">${r.pass ? '✔' : '○'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;line-height:1.5;color:${r.pass ? '#7fd8b0' : '#a8c4d4'}">${r.label}</div>
          <div style="display:flex;align-items:center;gap:9px;margin-top:6px">
            <div style="flex:1;height:3px;background:#0e1e2c;border-radius:2px">
              <div style="height:3px;border-radius:2px;width:${Math.round(r.progress * 100)}%;
                          background:${r.pass ? '#40d090' : '#2e6a92'}"></div>
            </div>
            <span style="font-size:9px;color:var(--text-dim);white-space:nowrap">${r.detail}</span>
          </div>
        </div>
      </div>`);

    const awayNote = atSite ? '' : `
      <div style="padding:0 14px 10px;font-size:9px;line-height:1.5;color:#6f8598">
        ${active.crew ? 'Your crew is working this site. Travel there to watch them build or to lend a hand.'
                      : 'You are back in your own world. The job site is held exactly as you left it.'}
      </div>`;
    const crewNote = !active.crew || active._wreck ? '' : `
      <div style="padding:0 14px 10px;font-size:9px;line-height:1.5;letter-spacing:0.5px;color:${active.crew.stalled || active.crew.broken ? '#ff9060' : '#ffb060'}">
        ${crewStatus(active, atSite)}
      </div>`;

    const actions = atSite && active._wreck ? `
      <div style="padding:2px 14px 10px;font-size:10px;line-height:1.6;color:#ff9070">
        <div style="letter-spacing:1px;font-size:9px;color:#ff6040;margin-bottom:3px">&#9762; CONTRACT FAILED &middot; REACTOR INCIDENT</div>
        ${active.site.client} billed you <b>${formatMoney(active._wreck.bill)}</b> for the damage. Look over the site as long as you like; nothing here comes home with you.
      </div>
      <div style="display:flex;gap:8px;padding:0 14px 13px">
        <button data-return style="flex:1;font-size:11px;letter-spacing:1px;padding:9px 0;border:1px solid #23486e;
          border-radius:3px;background:#0d2138;color:#8ec8ff;cursor:pointer">RETURN HOME</button>
      </div>` : atSite ? `
      <div style="padding:0 14px 8px">
        <button data-complete ${done ? '' : 'disabled'} style="width:100%;font-size:11px;letter-spacing:1px;padding:9px 0;
          border:1px solid ${done ? '#1f6b4a' : '#16283a'};border-radius:3px;
          background:${done ? '#0b2a1d' : 'transparent'};color:${done ? '#5fe0a8' : '#2d4054'};
          cursor:${done ? 'pointer' : 'default'}">COMPLETE</button>
      </div>
      <div style="display:flex;gap:8px;padding:0 14px 13px">
        <button data-return style="flex:1;font-size:11px;letter-spacing:1px;padding:9px 0;border:1px solid #23486e;
          border-radius:3px;background:#0d2138;color:#8ec8ff;cursor:pointer">RETURN HOME</button>
        <button data-abandon style="font-size:11px;letter-spacing:1px;padding:9px 14px;border:1px solid #4a2028;
          border-radius:3px;background:transparent;color:#a05868;cursor:pointer">ABANDON</button>
      </div>` : `
      <div style="display:flex;gap:8px;padding:0 14px 13px">
        <button data-resume style="flex:1;font-size:11px;letter-spacing:1px;padding:9px 0;border:1px solid #23486e;
          border-radius:3px;background:#0d2138;color:#8ec8ff;cursor:pointer">${active.crew && !active.lastResults ? 'VISIT SITE' : 'RETURN TO SITE'}</button>
        <button data-abandon style="font-size:11px;letter-spacing:1px;padding:9px 14px;border:1px solid #4a2028;
          border-radius:3px;background:transparent;color:#a05868;cursor:pointer">ABANDON</button>
      </div>`;

    // ── Job tabs ──
    // Only drawn when more than one contract is open, so a single job looks
    // exactly as it always did. The tab for the site underfoot is marked.
    // At home a tab picks which job the panel shows; on a site the panel
    // never describes a job other than the one underfoot, so another tab
    // travels there instead (switchSite).
    const tabs = jobs.length < 2 ? '' : `
      <div style="display:flex;gap:4px;padding:8px 10px 0">
        ${jobs.map((j, i) => {
          const sel  = i === panelJob;
          const onIt = i === atJob;
          const frac = ((j.contract.days || 1) * dayLength()) > 0
                     ? Math.max(0, j.remaining) / ((j.contract.days || 1) * dayLength()) : 1;
          const dot  = frac > 0.5 ? '#3f8f6a' : frac > 0.25 ? '#f0c040' : '#ff6040';
          const hop  = atJob >= 0 && !onIt;
          return `<button data-tab="${i}" title="${hop ? `Travel to ${j.site.client} · ${j.site.place}` : `${j.site.client} · ${j.site.place}`}"
            style="flex:1;min-width:0;display:flex;align-items:center;gap:5px;font-size:9px;letter-spacing:0.5px;
                   padding:6px 7px;border:1px solid ${sel ? '#23486e' : '#12283a'};border-radius:3px 3px 0 0;
                   background:${sel ? '#0d2138' : 'transparent'};color:${sel ? '#8ec8ff' : '#6f8598'};
                   cursor:${onIt ? 'default' : 'pointer'};overflow:hidden">
            <span style="width:5px;height:5px;border-radius:50%;background:${dot};flex:none"></span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${j.site.client}</span>
            ${onIt ? '<span style="flex:none;color:#5fe0a8">●</span>' : ''}
          </button>`;
        }).join('')}
      </div>`;

    // Updated in place. The deadline text changes every second and a hold's
    // progress every frame, and each change used to replace the whole panel —
    // scroll container included. Tearing that out from under the pointer
    // dropped wheel scrolling mid-gesture and let go of a scrollbar being
    // dragged, which is what made the list feel unresponsive. The three
    // sections are now built once; the scroll container itself is never
    // replaced, and only the rows whose content changed are touched.
    let top = el.querySelector('[data-top]'), sc = el.querySelector('[data-scroll]'), bot = el.querySelector('[data-bottom]');
    if (!top || !sc || !bot) {
      el.innerHTML = `
        <div data-top style="flex:none"></div>
        <div data-scroll style="flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;
                                padding:4px 14px 10px"></div>
        <div data-bottom style="flex:none"></div>`;
      top = el.querySelector('[data-top]'); sc = el.querySelector('[data-scroll]'); bot = el.querySelector('[data-bottom]');
    }
    const setHtml = (node, html) => {
      if (node._html === html) return false;
      node.innerHTML = html; node._html = html;
      return true;
    };

    if (setHtml(top, tabs + header)) {
      top.querySelectorAll('[data-tab]').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const i = +btn.dataset.tab;
          if (!jobs[i]) return;
          if (atJob >= 0) { switchSite(i); return; }
          panelJob = i;
          _lastSig = null;
          renderChecklist();
        });
      });
    }

    sc.style.opacity = atSite ? '' : '0.55';
    const had = sc._rows || [];
    if (had.length !== rows.length || sc.children.length !== rows.length) {
      sc.innerHTML = rows.join('');
    } else {
      rows.forEach((html, i) => { if (had[i] !== html) sc.children[i].outerHTML = html; });
    }
    sc._rows = rows;

    // A rival bid's window runs on the same clock as the deadline.
    const rival = active.contract.terms && active.contract.terms.rival;
    const rivalLeft = rival ? rival.days * dayLength() - (totalSec - left) : 0;
    const rivalNote = !rival ? '' : `
      <div style="padding:0 14px 10px;font-size:9px;line-height:1.5;color:${rivalLeft > 0 ? '#ff9ad0' : '#6f8598'}">
        ${rivalLeft > 0 ? `RIVAL BID · finish in ${formatLeft(rivalLeft).replace(' left', '')} for a ${formatMoney(rival.bonus)} bonus`
                        : 'RIVAL BID · the rival window has passed: no bonus'}
      </div>`;
    setHtml(bot, rivalNote + crewNote + awayNote + actions);
  }

  // ── The site while the player is away ────────────────────────────
  //
  // Going home used to FREEZE the job site: its entities come off the
  // grid into a snapshot and nothing about them is simulated until the
  // player travels back. The contract deadline kept running regardless,
  // so an endurance clause could only be served by sitting on site
  // watching it — and nothing that happened out there could ever go
  // wrong in the player's absence.
  //
  // This runs the site's own clock and a supply/demand solve over the
  // snapshot each tick, so a calm night or a flat battery bank cuts the
  // site's power while the player is at home, and the hold breaks.
  //
  // It is deliberately a reduced model of PowerNetwork.tick(): it does
  // not re-derive network components, wire congestion or lightning. The
  // topology was proven when the player left (they cannot leave with the
  // 'connect'/'service' clauses unmet and expect them to hold), so what
  // is left worth simulating is whether generation plus storage still
  // covers the load hour by hour.
  function siteStorage(e) {
    return e.type === T.BATTERY || e.type === T.SUBSTATION || e.type === T.SUBSTATION2
        || e.type === T.SUBSTATION3 || e.type === T.SUBSTATION4 || e.type === T.SUBSTATION5;
  }

  function siteGeneration(e, sunlight) {
    const def = e.def || {};
    if (e.type === T.WIND || e.type === T.WIND2 || e.type === T.WIND3) {
      return def.baseOutput * WindState.lull + (def.maxOutput - def.baseOutput) * WindState.speed;
    }
    if (e.type === T.SOLAR || e.type === T.SOLAR2 || e.type === T.SOLAR3) {
      // Density and wear are per-entity refinements the live network
      // applies; the base shape (peak x sun x cloud) is what decides
      // whether the site survives the night, which is what matters here.
      return (def.peakOutput || 0) * sunlight * CloudState.factor;
    }
    // Fuel-burning plant keeps whatever output it was last producing.
    if (def.powerOutput > 0) return e._currentOutput ?? def.powerOutput;
    return 0;
  }

  function siteDemand(e, hour) {
    const def = e.def || {};
    if (!(def.powerInput > 0)) return 0;
    const curve = (typeof DemandCurves !== 'undefined')
      ? DemandCurves.resolve(e.type, e.commercialSubtype || null, hour) : null;
    const base = (curve === null || curve === undefined) ? def.powerInput : curve;
    return base * (e.type === T.HOUSE ? (e.demandScale || 1) : 1);
  }

  // True while the frozen site is still covering its own load.
  function simulateSiteAway(job, dt) {
    const siteSnap = job && job.snap;
    if (!siteSnap || dt <= 0) return;

    siteSnap.elapsed += dt;

    // Read the site's own hour and sun through DayNight rather than
    // duplicating its curve, which would drift from the real one the
    // moment either is tuned. Synchronous swap — nothing else reads the
    // clock in between.
    const homeElapsed = DayNight.getElapsed();
    DayNight.setElapsed(siteSnap.elapsed);
    const hour     = DayNight.hour();
    const sunlight = Math.max(0, 1 - DayNight.darkness());
    DayNight.setElapsed(homeElapsed);

    let supply = 0, demand = 0;
    const storage = [];
    const standing = job.crew ? siteSnap.entities.concat(crewGhosts(job)) : siteSnap.entities;
    for (const e of standing) {
      if (e._lightningDamaged) continue;
      if (siteStorage(e)) storage.push(e);
      supply += siteGeneration(e, sunlight);
      demand += siteDemand(e, hour);
    }

    // Storage soaks up surplus and covers deficit, on the same terms the
    // live network gives it (power_network.js:735).
    let surplus = supply - demand;
    for (const sub of storage) {
      const def = sub.def;
      if (surplus > 0) {
        const absorb = Math.min(surplus, def.maxRate, def.capacity - (sub.charge || 0));
        sub.charge   = Math.min(def.capacity, (sub.charge || 0) + absorb * dt * 0.85 * (def.chargeRate || 1));
        sub.charging = absorb > 0.01;
        surplus     -= absorb;
      } else if (surplus < 0 && (sub.charge || 0) > 0) {
        const release = Math.min(-surplus, def.maxOutput || def.maxRate, sub.charge / dt);
        sub.charge    = Math.max(0, sub.charge - (release * dt) / (def.dischargeScale || 1));
        sub.charging  = false;
        supply       += release;
        surplus       = supply - demand;
      }
    }

    const supplied = demand <= 0 ? supply > 0 : (supply >= demand - 0.01 && supply > 0);
    job.awayStatus = { supplied, supply, demand, hour, sunlight, entities: siteSnap.entities.length };

    // Requirements stay ignorant of contracts and job sites, so the
    // verdict is handed to them through their own context object.
    if (job.reqs && job.reqs.context) {
      job.reqs.context.awaySupplied = supplied;
      job.reqs.context.awayEntities = standing;   // what a charge clause reads from home
      job.reqs.context.awayCrew = !!job.crew;
    }

    // Tell the player once per outage — a hold that quietly broke while
    // they were at home is the kind of thing they should hear about. The
    // flag lives on the job, so two sites going dark are two messages
    // rather than one cancelling the other out.
    if (!supplied && !job.awayDark) {
      MessageLog.add(`${job.site.client} site lost power; supply is short out there`, '#ff8060');
    } else if (supplied && job.awayDark) {
      MessageLog.add(`${job.site.client} site is back up`, '#40d090');
    }
    job.awayDark = !supplied;
  }

  // ── Per-frame ────────────────────────────────────────────────────

  let _stragglers = [];      // last few unlit buildings, refreshed with the checklist
  let _checklistT = 0;

  // ── Gas Stations on a job site ───────────────────────────────────
  //
  // A job site never comes with a Gas Station of the client's. A job that
  // runs on trucks (a cleanup's haul-out, a plant supplied by Hauler) has
  // one on its checklist for the crew to build (ContractSites.requirementsFor),
  // and the crew may put one down on any other job that they bring trucks to.
  // A Gas Station takes fuel oil by pipe from a Refinery, and most sites have
  // no oil at all, so on a site the client keeps any the crew builds full
  // (`_fuelDepot`: no fuel line and no power needed; filling up still costs
  // what it does at home). A truck that has already run dry out on the site
  // is brought enough by the client's bowser to drive back to one
  // (GasStationSystem.tickTruck).
  // Checked every tick rather than stamped with the site, so a job under way
  // from before this rule loses the station the client used to stand for it
  // (or that the site was authored with) the next time the player is there.
  function ensureFuelDepot(job) {
    if (!job || typeof T.GASSTATION === 'undefined') return;
    for (const s of [...EntityRegistry.getByType(T.GASSTATION)]) {
      if (s._clientOwned) GridManager.removeEntityFootprint(s);
      else s._fuelDepot = true;
    }
  }

  function tick(dt) {
    ContractPerks.tick(dt, atJob >= 0);   // perks run on home time only
    if (atJob >= 0 && _resumeOnLoad === null) syncSiteWeather(false);   // the site's sky moves on
    // A save made on a job site loads with the player's own world on the
    // grid (the rest of the load needs it there). Now that the load is done,
    // put them back where they were standing.
    if (_resumeOnLoad !== null) {
      const i = _resumeOnLoad;
      _resumeOnLoad = null;
      if (jobs[i] && atJob < 0) {
        resumeSite(i, true);
        _homeCold = !!homeSnap;
        if (homeSnap && _resumeEconomy) homeSnap.economy = _resumeEconomy;
      }
      _resumeEconomy = null;
    }
    // Home's production carries on through a trip at the rate it was going
    // when the player left (away_ledger.js): measured while home, counted
    // while away, applied on the way back.
    if (typeof AwayLedger !== 'undefined') {
      if (atJob >= 0) AwayLedger.away(dt); else AwayLedger.sample(dt);
    }
    if (!jobs.length) { tickOffers(dt); return; }

    const here = currentJob();
    if (here && atJob >= 0 && _resumeOnLoad === null) ensureFuelDepot(here);

    // A reactor blew up on a site: settle the liability here, at the top of
    // the tick and never in the middle of a reactor's own update, once the
    // blast has had its moment. Any job, not only the one underfoot, so
    // travelling home in those few seconds does not dodge the bill.
    const _due = jobs.find(j => j._liable && (!j._liableAt || performance.now() >= j._liableAt));
    if (_due) { liableFail(_due); return; }

    // Keep the ticking set pointed at the site actually underfoot.
    // Registration used to live only in accept(), so any path that built a
    // job some other way (loadState, resumeSite) left the game loop
    // advancing nothing. Re-pointing here costs one reference compare per
    // tick and means no future path can silently freeze the checklist.
    if (here && ContractRequirements.getActive() !== here.reqs) {
      ContractRequirements.setActive(here.reqs);
    }

    // The board keeps turning over while the player is back home
    // mid-contract; on site, home is frozen as before.
    // (The arrival shot is NOT advanced here — see frameTick.)
    if (!here) tickOffers(dt);

    // Every site the player is NOT standing in runs on: its clock, its
    // weather-driven supply and its storage. game_loop.js only ticks the
    // requirement set for the site underfoot (it reads the live grid), so
    // every other job's away half is driven from here off the simulated
    // verdict. With three contracts open, two of them are always away.
    for (const job of jobs) {
      if (job === here || !job.snap) continue;
      // A crew still building has nothing to hold up yet: only the site's
      // clock runs until the last piece is in.
      if (job.crew && !crewBuilt(job)) { job.snap.elapsed += dt; continue; }
      simulateSiteAway(job, dt);
      job.reqs.tickAway(dt);
    }
    // Crews work wherever the player is. Over a copy: a job a crew finishes
    // is paid and closed on the spot.
    for (const job of [...jobs]) if (job.crew && !job._wreck) tickCrew(job, dt);

    // Deadlines. Every open contract's clock runs wherever the player is —
    // the clients are all waiting, which is what stops three jobs at once
    // being strictly better than one. Iterated over a copy because fail()
    // splices the list. Checked before the checklist redraw so a lapsed
    // contract tears its panel down rather than painting "0m left".
    for (const job of [...jobs]) {
      if (job._wreck) continue;          // settled already; the player is only looking
      job.remaining -= dt;
      const left = Math.max(0, job.remaining);
      if (left <= 0) { fail(job); continue; }
      if (!job.warned && left <= (job.contract.days || 1) * dayLength() * 0.25) {
        job.warned = true;
        MessageLog.add(`${job.site.client} contract: ${formatLeft(left)} remaining`, '#f0c040');
      }
      // Out of road: an endurance clause needs a longer unbroken hold than
      // the contract has left. Held time and the deadline run on the same
      // clock, so once this is true it stays true. Say so while the player
      // can still pull their equipment (removal refunds it; a lapsed site
      // is discarded with everything on it).
      if (!job.doomed && job.crew && crewBuilt(job) && job.reqs.holdOwed() > left) {
        job.doomed = true;
        MessageLog.add(`${job.site.client} crew job can no longer be completed: the hold the client wants is longer than the time left`, '#ff6040');
      }
      if (!job.doomed && !job.crew && job.reqs.holdOwed() > left) {
        job.doomed = true;
        const owed = formatLeft(job.reqs.holdOwed()).replace(' left', '');
        MessageLog.add(`${job.site.client} contract can no longer be completed: needs ${owed} more, ${formatLeft(left)}`, '#ff6040');
        NotificationStack.push({
          icon: '⚠', title: 'Contract cannot be completed',
          message: `${job.site.client} needs the site held for ${owed} more without a break, but only ${formatLeft(left).replace(' left', '')} remains. ` +
                   `Remove your equipment from the site to get its cost back before the deadline: anything left there is lost when the contract fails.`,
          color: '#ff6040', border: '#602018', tag: 'contract-doomed', glow: true, contract: true,
        });
      }
    }
    if (!jobs.length) return;

    // The checklist re-evaluates on a slower cadence than the render
    // loop — walking the registry per requirement per frame is wasted
    // work when the player can only change the grid so fast.
    _checklistT += dt;
    if (_checklistT >= 0.25) {
      _checklistT = 0;
      renderChecklist();
      // Only worth hunting for while the player is standing on the site.
      const here = currentJob();
      _stragglers = here ? here.reqs.stragglers(5) : [];
    }
  }

  // Marker overlay — this is what tells the player WHERE the client
  // wants the work done. Drawn in world space, under the entity layer.
  function renderOverlay(ctx, t) {
    const active = currentJob();
    if (!active) return;
    const pulse = 0.30 + 0.10 * Math.sin(t * 1.8);
    const snowCover = typeof FrostSystem !== 'undefined' ? FrostSystem.coverage : 0;

    ctx.save();
    const b = active.bounds;

    // Darken everything outside the site. Together with the treeline this
    // is what stops a bounded board reading as an island in a void: the
    // ground keeps going, it just isn't the player's job (§6.4).
    {
      const cv = document.getElementById('canvas');
      const vx = Camera.x, vy = Camera.y;
      const vw = (cv ? cv.width  : 1280) / Camera.zoom;
      const vh = (cv ? cv.height : 720)  / Camera.zoom;
      const bx = b.minC * TILE, by = b.minR * TILE;
      const bw = (b.maxC - b.minC + 1) * TILE, bh = (b.maxR - b.minR + 1) * TILE;
      ctx.fillStyle = 'rgba(2,6,12,0.42)';
      // Four bands around the site rect, clipped to what's on screen.
      ctx.fillRect(vx, vy, vw, Math.max(0, by - vy));                                  // above
      ctx.fillRect(vx, by + bh, vw, Math.max(0, (vy + vh) - (by + bh)));               // below
      ctx.fillRect(vx, by, Math.max(0, bx - vx), bh);                                  // left
      ctx.fillRect(bx + bw, by, Math.max(0, (vx + vw) - (bx + bw)), bh);               // right
    }

    // Site boundary — everything outside is not the player's job.
    ctx.strokeStyle = 'rgba(90,168,255,0.28)';
    ctx.lineWidth = 2 / Camera.zoom;
    ctx.setLineDash([10 / Camera.zoom, 7 / Camera.zoom]);
    ctx.strokeRect(b.minC * TILE, b.minR * TILE,
                   (b.maxC - b.minC + 1) * TILE, (b.maxR - b.minR + 1) * TILE);
    ctx.setLineDash([]);

    for (const [, m] of Object.entries(active.markers)) {
      const x = m.minC * TILE, y = m.minR * TILE;
      const w = (m.maxC - m.minC + 1) * TILE, h = (m.maxR - m.minR + 1) * TILE;
      ctx.fillStyle = `rgba(90,168,255,${pulse * 0.13})`;
      ctx.fillRect(x, y, w, h);
      // Pale blue vanishes on snow, so a snowed-in zone gets a deeper blue
      // wash as well, in proportion to the cover. Ground only: this pass
      // is drawn under the entity layer.
      if (snowCover > 0.05) { ctx.fillStyle = `rgba(30,110,220,${(0.07 * snowCover).toFixed(3)})`; ctx.fillRect(x, y, w, h); }
      ctx.strokeStyle = `rgba(90,168,255,${pulse + 0.30})`;
      ctx.lineWidth = 1.5 / Camera.zoom;
      ctx.strokeRect(x, y, w, h);
      // The zone's name is drawn by renderLabels, over the finished scene.
    }

    // ── A crew at work ─────────────────────────────────────────────
    //
    // The piece in hand is pegged out on the ground and fills as the crew
    // works on it; each one just finished keeps an amber ring for a moment,
    // so the eye can follow the build across the site.
    const cr = active.crew;
    if (cr) {
      const now = performance.now(), RING_MS = 2600;
      cr._fresh = (cr._fresh || []).filter(f => now - f.at < RING_MS);
      ctx.lineWidth = 2 / Camera.zoom;
      for (const f of cr._fresh) {
        const a = 1 - (now - f.at) / RING_MS, pad = (2 + (1 - a) * 5) / Camera.zoom;
        ctx.strokeStyle = `rgba(255,176,96,${(a * 0.9).toFixed(3)})`;
        ctx.strokeRect(f.e.col * TILE - pad, f.e.row * TILE - pad,
                       (f.e.width || 1) * TILE + pad * 2, (f.e.height || 1) * TILE + pad * 2);
      }
      const next = cr.pieces[cr.placed];
      if (next && !cr.stalled) {
        const x = next.col * TILE, y = next.row * TILE;
        const w = (next.w || 1) * TILE, h = (next.h || 1) * TILE;
        const frac = Math.max(0, Math.min(1, cr.t / (pieceWork(next) * cr.unit || 1)));
        ctx.fillStyle = 'rgba(255,176,96,0.10)';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(255,176,96,0.30)';
        ctx.fillRect(x, y + h * (1 - frac), w, h * frac);
        ctx.strokeStyle = `rgba(255,196,120,${0.55 + pulse})`;
        ctx.setLineDash([5 / Camera.zoom, 4 / Camera.zoom]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
      }
    }

    // ── Last buildings still dark ──────────────────────────────────
    //
    // Finishing a site comes down to finding the one thing still unlit,
    // and an unpowered street lamp is a few dark pixels on dark ground.
    // Once the remainder is down to a couple, say where they are.
    //
    // Amber, not the site's blue: this is an exception to point at, not
    // part of the client's geometry. Drawn last so it sits over the
    // marker fills.
    if (_stragglers.length) {
      const beat = 0.5 + 0.5 * Math.sin(t * 3.2);
      for (const e of _stragglers) {
        // A straggler can be removed or wired between refreshes.
        if (!e || e.powered) continue;
        const ex = e.col * TILE, ey = e.row * TILE;
        const ew = (e.width || 1) * TILE, eh = (e.height || 1) * TILE;
        const pad = (3 + beat * 2) / Camera.zoom;

        ctx.strokeStyle = `rgba(255,190,70,${0.55 + beat * 0.40})`;
        ctx.lineWidth   = 2 / Camera.zoom;
        ctx.setLineDash([6 / Camera.zoom, 4 / Camera.zoom]);
        ctx.strokeRect(ex - pad, ey - pad, ew + pad * 2, eh + pad * 2);
        ctx.setLineDash([]);

        // A tick down each side of the ring, so the eye catches it even
        // when the building itself is a single dim tile.
        const cxm = ex + ew / 2, cym = ey + eh / 2;
        const reach = (14 + beat * 5) / Camera.zoom;
        ctx.beginPath();
        ctx.moveTo(cxm, ey - pad);            ctx.lineTo(cxm, ey - pad - reach);
        ctx.moveTo(cxm, ey + eh + pad);       ctx.lineTo(cxm, ey + eh + pad + reach);
        ctx.moveTo(ex - pad, cym);            ctx.lineTo(ex - pad - reach, cym);
        ctx.moveTo(ex + ew + pad, cym);       ctx.lineTo(ex + ew + pad + reach, cym);
        ctx.stroke();

        if (Camera.zoom > 0.45) {
          ctx.fillStyle = `rgba(255,214,120,${0.75 + beat * 0.25})`;
          ctx.font = `${Math.max(8, 11 / Camera.zoom)}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText('NO POWER', cxm, ey - pad - reach - 4 / Camera.zoom);
          ctx.textAlign = 'left';
        }
      }
    }
    ctx.restore();
  }

  // Arrival / departure card — the establishing shot (§6.3).
  // The work zones' names and outlines, drawn over the finished scene and
  // the night (render_main_loop step 8b). The name used to be thin, pulsing,
  // half-transparent pale-blue text inside the zone, under the entity layer.
  // On a winter site that is pale blue on snow, which cannot be read at all;
  // anywhere, the zone's own buildings covered it, dusk dimmed it, and
  // zoomed out it was a few pixels. Now it is a solid dark tag standing on
  // the zone's top-left corner, the same size on screen at any zoom, and the
  // zone's outline is redrawn beside it with a dark edge under the blue, so
  // both hold up on snow as well as on grass. Lines and the tag only:
  // nothing here fills the zone, or it would tint the buildings in it.
  const ZONE_LABEL_ALPHA = 0.35;   // strength of the whole pass: outline and tag (full strength was too loud)
  function renderLabels(ctx) {
    const active = currentJob();
    if (!active) return;
    const z = Camera.zoom, px = n => n / z;
    ctx.save();
    ctx.globalAlpha = ZONE_LABEL_ALPHA;
    ctx.font = `bold ${px(12)}px monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const [, m] of Object.entries(active.markers)) {
      const x = m.minC * TILE, y = m.minR * TILE;
      const w = (m.maxC - m.minC + 1) * TILE, h = (m.maxR - m.minR + 1) * TILE;
      ctx.strokeStyle = 'rgba(6,16,30,0.7)';
      ctx.lineWidth = px(4.5);
      ctx.strokeRect(x, y, w, h);
      ctx.strokeStyle = '#6eb8ff';
      ctx.lineWidth = px(2);
      ctx.strokeRect(x, y, w, h);

      const text = m.label.toUpperCase();
      const tw = ctx.measureText(text).width, tagW = tw + px(16), tagH = px(20);
      const tx = x - px(2.25), ty = y - tagH;       // standing on the top-left corner, outside the zone
      ctx.fillStyle = 'rgba(6,16,30,0.95)';
      ctx.fillRect(tx, ty, tagW, tagH);
      ctx.strokeStyle = '#6eb8ff';
      ctx.lineWidth = px(1.5);
      ctx.strokeRect(tx, ty, tagW, tagH);
      ctx.fillStyle = '#6eb8ff';
      ctx.fillRect(tx, ty, px(4), tagH);            // accent bar down the left
      ctx.fillStyle = '#eaf5ff';
      ctx.fillText(text, tx + px(10), ty + tagH / 2 + px(0.5));
    }
    ctx.restore();
  }

  function renderBanner(ctx, cw, ch) {
    if (!banner) return;
    const left = banner.until - performance.now();
    if (left <= 0) { banner = null; return; }
    const a = Math.min(1, left / 700) * Math.min(1, (4200 - left) / 400);

    // Mobile: the CONTRACT COMPLETE card is drawn 40% smaller so it covers
    // less of the small screen; every other banner keeps the full size.
    const k = window.GW_MOBILE && banner.title === 'CONTRACT COMPLETE' ? 0.6 : 1;
    const top = ch * 0.34 + 48 * (1 - k), bh = 96 * k;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(2,6,12,0.82)';
    ctx.fillRect(0, top, cw, bh);
    ctx.strokeStyle = 'rgba(90,168,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, top);          ctx.lineTo(cw, top);
    ctx.moveTo(0, top + bh);     ctx.lineTo(cw, top + bh);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#8ec8ff';
    ctx.font = `${Math.round(26 * k)}px monospace`;
    ctx.fillText(banner.title, cw / 2, top + 45 * k);
    ctx.fillStyle = '#5a7a92';
    ctx.font = `${Math.round(12 * k)}px monospace`;
    ctx.fillText(banner.sub, cw / 2, top + 70 * k);
    ctx.restore();
  }

  return {
    isAway, isOpen, getActive, boardAvailable,
    startSearch, cancelSearch, isSearching, canSearch, searchStatus,
    awayStatus: () => (shownJob() || {}).awayStatus || null,
    openBoard, closeBoard, toggleBoard, tickButton,
    accept, complete, abandon, confirmAbandon, fail, returnHome, resumeSite, discardForLoad,
    hasContract, isAtSite: () => atJob >= 0, siteSeason,
    // A fusion job taken before the reactors' fuels were made consistent with
    // home: it asks for a Fusion Reactor AND MHD Rings, which only D-He3 can
    // satisfy. While standing on one, the Fusion Reactor still burns the
    // client's pellets as D-He3 so the job can be finished.
    legacyFusionJob: () => {
      const j = currentJob(), reqs = j && j.contract && j.contract.requirements;
      return !!reqs && reqs.some(r => r.type === T.MHDRING) && reqs.some(r => r.type === T.HULKINGFUSIONREACTOR);
    },
    // A full-chain job: the crew is paid to make the fuel, so the client
    // does not restock their bin (SolidStorageSystem.tick).
    ownFuelJob: () => {
      const j = currentJob(), reqs = j && j.contract && j.contract.requirements;
      return !!reqs && reqs.some(r => r.ownFuel);
    },
    jobCount, canAcceptMore, reactorBlast, saveFromSite,
    // Client money sitting in the balance for jobs still open: each one's
    // equipment advance, paid in on acceptance. It is not the player's until
    // the job is signed off (or goes back if it is abandoned), so anything
    // that rewards the player's own wealth leaves it out.
    heldAdvance: () => jobs.reduce((s, j) => s + (j.advance || 0), 0),
    dispatch, dispatchBlocker, fuelHeld,
    // Posts a repeat order for a site with a build on file, whatever the
    // client's standing, so the crew path can be tried without the grind.
    devRepeatOffer: (siteId) => {
      if (!builds.has(siteId) || offers.some(o => o.siteId === siteId)) return false;
      const c = repeatOrder(siteId);
      offers.push({ contractId: c.id, siteId, postedAt: homeClock, expiresAt: homeClock + SHELF_MAX_DAYS * dayLength() });
      if (boardOpen) renderBoard();
      return c.id;
    },
    timeLeft, formatLeft, formatSpan, standingFor, getOffers, homeEconomyRate,
    serialise, loadState,
    // Contract ids still in use (posted offers + the one in hand), so the
    // generated-contract registry never prunes one out from under the board.
    heldContractIds: () => new Set([...offers.map(o => o.contractId), ...jobs.map(j => j.contract.id)]),
    devPostOffer, devFindContract, devFillBoard, devClearOffers, devExpireOffers,
    tick, frameTick, renderOverlay, renderLabels, renderGrade, renderBanner,
  };
})();
