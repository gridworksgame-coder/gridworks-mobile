/* ═══════════════════════════════════════════════════════════════════
   FISHING SYSTEM
   Selecting T.FISHINGPOLE turns the cursor itself into the rod — it
   follows the raw mouse position rather than snapping to a tile.

     1. Hold LMB while standing on LAND, within MIN_LAND_DIST_TO_WATER
        tiles of a water tile, to charge a cast (up to CAST_MAX_CHARGE
        seconds). You cannot start a cast from inside the water itself.
        Once fully charged you only get CAST_HOLD_WINDOW seconds to let
        go — hold past that and the cast fizzles, forcing a rethrow,
        rather than letting you sit at max charge indefinitely.
     2. Release  → the line throws out toward the nearest water in view.
        Cast distance scales with how long you held — both visually
        (the throw animation travels farther) AND mechanically (the
        hook can literally reach farther water, and a cast that's too
        short for the gap between you and the water just fails).
     3. Once the line's out, the ROD (cursor) is still free to move —
        the line drapes between the current cursor position and the
        fixed hook position with lightweight verlet rope physics,
        sagging/tightening as you move the rod nearer or farther.
     4. Bite-wait elapses → tension minigame: hold LMB to push the
        arrow into the target zone and keep it there until it fills.
        Which fish bites depends on the water, time, season, weather and
        nearby plants (TRAITS), and each fights back in its own style —
        the zone sways, darts or gets dragged by runs (_fightTick).
     5. success → BiofuelSystem.addFuel(reward); failure → nothing.

   NOTE: WIP — numbers below (distances, wait times, rope feel, fish
   table) are all tunable and expected to change with playtesting.
   ═══════════════════════════════════════════════════════════════════ */

const FishingSystem = (() => {
  const CAST_MAX_CHARGE       = 1.02;  // seconds held to reach full cast power (15% faster than the previous 1.2s)
  const CAST_HOLD_WINDOW      = 0.35;  // seconds you can sit at full charge before the cast fizzles and you have to rethrow
  const MIN_LAND_DIST_TO_WATER = 3;    // tiles — must be standing this close (or closer) to water to start a cast
  const CAST_DIST_MIN         = 1.5;   // tiles — weak tap cast distance
  const CAST_DIST_MAX         = 14;    // tiles — full 3s-charge cast distance
  const MAX_LINE_STRETCH_TILES = 55;   // tiles — straight-line rod-to-hook distance beyond which the line snaps and the cast is lost
  const BITE_WAIT_MIN         = 7;     // seconds
  const BITE_WAIT_MAX         = 45;    // seconds
  const BITE_PAUSE            = 1.6;   // seconds — warning beat between the bite and the minigame opening (25% faster than the original 2s)
  const CATCH_TIME_REQUIRED   = 6.6;   // cumulative in-zone seconds to land the fish
  const RESULT_DURATION       = 1.8;   // seconds the result banner stays up — also how long a successful catch takes to reel out of the water

  // Rope physics (verlet) — the line between the cursor/rod and the
  // fixed hook position out in the water.
  const ROPE_POINTS  = 7;
  const ROPE_SLACK   = 1.1;    // rest length vs. straight-line distance at cast time — bigger = saggier
  const ROPE_GRAVITY = 260;    // px/s^2
  const ROPE_DAMPING = 0.985;
  const ROPE_ITER    = 16;     // constraint relaxation passes/frame — trimmed from 24/9pts for perf;
                                // still comfortably enough to fully converge a 7-point chain per frame
                                // without the near-rod kink that showed up at the original ROPE_ITER=5

  // Tension-arrow physics (position/velocity on a 0..1 track)
  // DRIFT_ACCEL trimmed and DAMPING strengthened (was 0.85 / 0.90) — the
  // arrow fell too fast right out of the bite-countdown before the player
  // could react, and released rightward momentum used to bleed off slowly
  // enough that letting go of LMB still carried the arrow past the zone,
  // feeling like the release wasn't registering. Weaker drift + snappier
  // velocity decay makes both the fall and the post-release stop gentler.
  const DRIFT_ACCEL = 0.62;   // pulls the arrow left when not holding
  const HOLD_ACCEL  = 1.55;   // pushes the arrow right while holding LMB
  const DAMPING     = 0.78;   // per-second velocity decay, keeps it from feeling icy
  const MAX_SPEED   = 0.9;

  // Silly-but-not-nothing reward table. `weight` is relative pick chance,
  // `fuel` is a [min,max] biofuel range (mirrors the bush/tree amounts
  // already handed out by the chop mechanic), `money` is a [min,max]
  // cash bonus on top of the fuel — the real incentive to actually go
  // fishing instead of just building. `difficulty` (1 trivial — 5
  // brutal) drives how narrow the tension zone is and how hard the fish
  // fights back in the minigame. The catch is decided at the moment of
  // the bite (see _startMinigame) so its difficulty can shape the
  // minigame itself, not just the payout.
  const FISH_TABLE = [
    // ── difficulty 1 — trivial (30–50) ──
    { name: 'a scrawny Minnow',    weight: 18, fuel: [30, 40],  money: [120, 220],  difficulty: 1, icon: 'minnow' },
    { name: 'a wriggling Guppy',   weight: 14, fuel: [30, 38],  money: [100, 180],  difficulty: 1, icon: 'guppy' },
    { name: 'a Sunfish',           weight: 12, fuel: [35, 50],  money: [140, 260],  difficulty: 1, icon: 'sunfish' },
    { name: 'a Bluegill',          weight: 12, fuel: [32, 45],  money: [120, 240],  difficulty: 1, icon: 'bluegill' },
    { name: 'a silver Shiner',     weight: 10, fuel: [22, 32],  money: [180, 280],  difficulty: 1, icon: 'shiner' },     // light on oil, sells well
    { name: 'an old Boot',         weight: 4,  money: [100, 150],  difficulty: 1, isJunk: true, icon: 'boot' },
    { name: 'a rusty Tin Can',     weight: 3,  money: [100, 140],  difficulty: 1, isJunk: true, icon: 'tincan' },
    { name: 'a soggy Newspaper',   weight: 2,  money: [100, 120],  difficulty: 1, isJunk: true, icon: 'newspaper' },
    // ── difficulty 2 — easy (50–80) ──
    { name: 'a Catfish',           weight: 16, fuel: [55, 70],  money: [300, 500],  difficulty: 2, icon: 'catfish' },
    { name: 'a river Perch',       weight: 13, fuel: [50, 65],  money: [250, 420],  difficulty: 2, icon: 'perch' },
    { name: 'a Rainbow Trout',     weight: 12, fuel: [60, 80],  money: [350, 600],  difficulty: 2, icon: 'trout' },
    { name: 'a Crappie',           weight: 12, fuel: [50, 62],  money: [280, 460],  difficulty: 2, icon: 'crappie' },
    { name: 'a Common Carp',       weight: 10, fuel: [75, 95],  money: [160, 300],  difficulty: 2, icon: 'commoncarp' }, // oily, nobody wants to buy it
    { name: 'a tangled Fishing Net', weight: 2, money: [250, 350],  difficulty: 2, isJunk: true, icon: 'net' },
    // ── difficulty 3 — medium (80–120) ──
    { name: 'a fat Bass',          weight: 14, fuel: [85, 105], money: [550, 900],  difficulty: 3, icon: 'bass' },
    { name: 'a Northern Pike',     weight: 11, fuel: [95, 120], money: [700, 1100], difficulty: 3, icon: 'pike' },
    { name: 'an Atlantic Salmon',  weight: 10, fuel: [85, 100], money: [600, 950],  difficulty: 3, icon: 'salmon' },
    { name: 'a Coal-Stained Catfish', weight: 8, fuel: [90, 110], money: [650, 1000], difficulty: 3, icon: 'coalcatfish' },
    { name: 'a Walleye',           weight: 10, fuel: [90, 110], money: [650, 1000], difficulty: 3, icon: 'walleye' },
    { name: 'a Striped Bass',      weight: 9,  fuel: [100, 120], money: [600, 900], difficulty: 3, icon: 'stripedbass' },
    { name: 'a prize Koi',         weight: 5,  fuel: [55, 75],  money: [1400, 2000], difficulty: 3, icon: 'koi' },       // ornamental: little oil, big price
    // ── difficulty 4 — hard (120–160) ──
    { name: 'a slippery Eel',      weight: 8,  fuel: [125, 145], money: [900, 1500],  difficulty: 4, icon: 'eel' },
    { name: 'a Snapping Turtle',   weight: 7,  fuel: [135, 160], money: [1100, 1800], difficulty: 4, icon: 'turtle' },
    { name: 'a Piranha',           weight: 7,  fuel: [125, 145], money: [1000, 1600], difficulty: 4, icon: 'piranha' },
    { name: 'a Longnose Gar',      weight: 7,  fuel: [165, 195], money: [600, 950],   difficulty: 4, icon: 'gar' },      // very oily, cheap
    { name: 'a Muskellunge',       weight: 5,  fuel: [130, 155], money: [1500, 2200], difficulty: 4, icon: 'muskie' },
    { name: 'a Lake Sturgeon',     weight: 5,  fuel: [175, 205], money: [1300, 2000], difficulty: 4, icon: 'sturgeon' },
    // ── difficulty 5 — brutal (160–225) ──
    { name: 'a Golden Carp',       weight: 5,   fuel: [175, 210], money: [2000, 2800], difficulty: 5, icon: 'carp' },
    { name: 'something glowing (uranium?)', weight: 4.5, fuel: [160, 195], money: [1800, 2600], difficulty: 5, icon: 'uranium' },
    { name: 'an ancient Fossilized Fish', weight: 3, fuel: [195, 225], money: [2200, 3000], difficulty: 5, icon: 'fossil' },
    { name: 'an Electric Eel',     weight: 3.5, fuel: [230, 270], money: [2400, 3400], difficulty: 5, icon: 'electriceel' },
    { name: 'a giant Arapaima',    weight: 3,   fuel: [260, 300], money: [1800, 2500], difficulty: 5, icon: 'arapaima' },  // the biggest oil haul there is
  ];

  // Minigame tuning per difficulty tier — narrower zone + harder drift
  // as the tier climbs. zoneWidth is randomized within the given range
  // each bite for a bit of variance even at the same difficulty.
  // Difficulty pass: zones ~33% narrower, drift ~33% stronger across
  // every tier than the original values (zoneWidth ×0.67, driftMult ×1.33).
  const DIFFICULTY_PRESETS = {
    1: { zoneWidth: [0.25, 0.32], driftMult: 0.8  },
    2: { zoneWidth: [0.19, 0.24], driftMult: 1.13 },
    3: { zoneWidth: [0.13, 0.18], driftMult: 1.46 },
    4: { zoneWidth: [0.09, 0.13], driftMult: 1.8  },
    5: { zoneWidth: [0.06, 0.09], driftMult: 2.2  },
  };

  // Where, when and how each catch bites and fights, keyed by icon.
  //   fight   — minigame behaviour (see FIGHT_STYLES below)
  //   water   — preferred water: 'river' | 'lake' | 'reservoir' (×2 there, ×0.6 elsewhere)
  //   time    — preferred time: 'day' | 'night' | 'twilight' (×2.5 then, ×0.5 otherwise)
  //   seasons — preferred Seasons.index() values, 0 spring … 3 winter (×2 / ×0.6;
  //             ignored when seasons are off)
  //             — those three combined are capped at MAX_BITE_BOOST
  //   smog    — thrives in polluted water instead of being driven off by it
  //   needs   — hard requirements; the catch can't bite at all without them:
  //             time, rain (rain, not snow), deepCast (castPower ≥ DEEP_CAST),
  //             notWinter, near: { types: [T.*], r: tiles from the hook }
  // Every hard requirement is reachable in an ordinary game (seasons off
  // counts as never-winter), so the catch-everything achievement stays
  // completable.
  const TRAITS = {
    minnow:      { fight: 'calm' },
    guppy:       { fight: 'darter', water: ['lake'] },
    sunfish:     { fight: 'calm', water: ['lake'], time: 'day', seasons: [1] },
    bluegill:    { fight: 'thrasher', water: ['lake'] },
    shiner:      { fight: 'darter', water: ['river'] },
    boot:        { fight: 'dead', smog: true },
    tincan:      { fight: 'dead', smog: true },
    newspaper:   { fight: 'dead', smog: true },
    catfish:     { fight: 'heavy', water: ['river'], time: 'night' },
    perch:       { fight: 'thrasher', water: ['lake'], seasons: [3] },
    trout:       { fight: 'runner', water: ['river'], seasons: [0, 2] },
    crappie:     { fight: 'calm', water: ['lake'], time: 'twilight' },
    commoncarp:  { fight: 'heavy', water: ['lake', 'reservoir'], smog: true },
    net:         { fight: 'dead', smog: true },
    bass:        { fight: 'thrasher', water: ['lake', 'reservoir'], time: 'twilight', seasons: [1] },
    pike:        { fight: 'runner', water: ['lake'], seasons: [3] },
    salmon:      { fight: 'runner', water: ['river'], seasons: [2] },
    coalcatfish: { fight: 'heavy', smog: true, needs: { near: { types: ['COALGENERATOR', 'COALWASTE'], r: 30 } } },
    walleye:     { fight: 'calm', water: ['lake', 'reservoir'], time: 'night' },
    stripedbass: { fight: 'runner', water: ['river'], seasons: [0] },
    koi:         { fight: 'calm', water: ['reservoir'], time: 'day', seasons: [0] },
    eel:         { fight: 'darter', water: ['river'], needs: { time: 'night' } },
    turtle:      { fight: 'heavy', water: ['lake'], seasons: [1], needs: { notWinter: true } },
    piranha:     { fight: 'darter', seasons: [1], needs: { notWinter: true } },
    gar:         { fight: 'thrasher', water: ['river'], seasons: [1] },
    muskie:      { fight: 'runner', water: ['lake'], seasons: [2] },
    sturgeon:    { fight: 'heavy', water: ['reservoir', 'river'], seasons: [0] },
    carp:        { fight: 'darter', water: ['lake', 'reservoir'], needs: { time: 'twilight' } },
    uranium:     { fight: 'thrasher', needs: { near: { types: ['NUCLEARREACTOR', 'ADVREACTOR', 'NUCLEARWASTE'], r: 30 } } },
    fossil:      { fight: 'heavy', water: ['reservoir'], needs: { deepCast: true } },
    electriceel: { fight: 'darter', water: ['river'], needs: { rain: true } },
    arapaima:    { fight: 'runner', seasons: [1], needs: { deepCast: true, notWinter: true } },
  };
  const DEEP_CAST = 0.85;   // castPower a long cast needs to reach the deep-water catches
  const MAX_BITE_BOOST = 3; // cap on a catch's combined water/time/season preference bonus

  // Minigame fight behaviour. Each style moves the target zone and/or tugs
  // the arrow in its own way; `d` (difficulty 1–5) scales how hard. Big
  // moves are telegraphed: the zone flashes orange for `warn` seconds first.
  //   calm     — the zone sways slowly back and forth
  //   thrasher — small jittery hops every second or so
  //   darter   — sits still, then flashes and darts somewhere new
  //   heavy    — wide slow sweeps plus surges that drag the arrow left
  //   runner   — gentle sway plus sudden runs: arrow and zone both yanked left
  //   dead     — junk; doesn't move, just dead weight

  // Icons of every fish/junk item ever successfully landed — persisted
  // across saves, read by AchievementsSystem for the catch-collection achievements.
  const _caughtIcons = new Set();
  const REAL_FISH_ICONS = FISH_TABLE.filter(f => !f.isJunk).map(f => f.icon);
  const JUNK_ICONS      = FISH_TABLE.filter(f => f.isJunk).map(f => f.icon);

  // ── Session state ────────────────────────────────────────────────
  // 'idle' | 'charging' | 'casting' | 'waiting' | 'bite' | 'minigame' | 'result'
  let phase = 'idle';
  let _phaseStuckAccum = 0;  // sim-time accumulator for the tick() watchdog — resets on every phase change
  function _setPhase(p) { phase = p; _phaseStuckAccum = 0; }

  let chargeStart  = 0;
  let castPower    = 0;
  let bobberCol    = 0, bobberRow = 0;
  let chargeAnchorX = 0, chargeAnchorY = 0;  // fixed "feet" position for the duration of a charge — you aim by dragging the cursor away from this point

  let castAnimT    = 0;      // seconds elapsed into the throw animation
  let castAnimDur  = 0.4;
  let castStartX   = 0, castStartY = 0;   // rod world pos at the moment of release
  let castDirX     = 1, castDirY = 0;     // unit vector toward the targeted water

  let ropePos = null, ropePrev = null, ropeSegLen = 0;
  let _lineSnapped = false;  // true from the instant MAX_LINE_STRETCH_TILES is exceeded until the next cast — suppresses rope updates during the 'result' banner so the line doesn't visibly keep dangling after it's already snapped
  let _ambientClock = 0;  // drives the idle bob/ripple — only advances while unpaused, unlike the wall-clock-driven charge/cast timers

  let biteTimer    = 0;
  let biteWait     = 0;
  let biteAlertTimer = 0;

  let arrowPos     = 0.08;   // 0..1
  let arrowVel     = 0;
  let zoneStart    = 0.4;
  let zoneWidth    = 0.22;
  let progress     = 0;      // 0..1 catch meter
  let holding      = false;
  let currentFish  = null;   // decided at the moment of the bite
  let currentDriftMult = 1;  // difficulty-scaled drift strength for the current fish

  // Fight state for the current minigame (see _fightTick)
  let zoneCenter   = 0.5;    // where the zone's middle actually is
  let zoneTarget   = 0.5;    // where it's easing toward
  let zoneBase     = 0.5;    // the centre calm/heavy sways swing around
  let fightClock   = 0;      // seconds into the fight
  let fightNext    = 0;      // fightClock at which the next move/run starts its warning
  let fightWarn    = 0;      // seconds of warning flash left before the move lands
  let fightRun     = 0;      // seconds left on an active run/surge
  let fightPull    = 0;      // extra leftward accel on the arrow during a run/surge

  let resultTimer  = 0;
  let resultGood   = false;

  // ── DOM/canvas UI (built lazily on first use) ───────────────────
  let ui = null;

  function _buildUI() {
    if (ui) return ui;

    const style = document.createElement('style');
    style.textContent = `
      #fishing-overlay {
        position: fixed; left: 50%; bottom: 86px; transform: translateX(-50%);
        display: none; flex-direction: column; align-items: center; gap: 8px;
        z-index: 500; pointer-events: none; font-family: 'Inter', sans-serif;
      }
      #fishing-hint {
        color: #cfeee6; font-size: 11px; letter-spacing: 2px; font-weight: 600;
        text-shadow: 0 0 8px rgba(0,0,0,0.8);
      }
      #fishing-badge {
        position: fixed; left: 50%; bottom: 100px; transform: translateX(-50%);
        display: none; align-items: center; gap: 8px; padding: 6px 14px;
        background: rgba(6,16,20,0.88); border: 1px solid rgba(96,208,192,0.4);
        border-radius: 20px;
        color: #a0e0d0; font-family: 'Inter', sans-serif; font-size: 11px;
        letter-spacing: 1px; z-index: 500; pointer-events: none;
      }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'fishing-overlay';
    const hint = document.createElement('div');
    hint.id = 'fishing-hint';
    const canvas = document.createElement('canvas');
    canvas.id = 'fishing-canvas';
    canvas.width = 360;
    canvas.height = 90;
    canvas.style.cssText = 'display:block; filter: drop-shadow(0 4px 16px rgba(0,0,0,0.5));';
    overlay.appendChild(hint);
    overlay.appendChild(canvas);
    document.body.appendChild(overlay);

    const badge = document.createElement('div');
    badge.id = 'fishing-badge';
    badge.textContent = '🎣 LINE IN THE WATER...';
    document.body.appendChild(badge);

    ui = { overlay, hint, canvas, ctx: canvas.getContext('2d'), badge };
    return ui;
  }

  function _showOverlay(hintText) {
    const u = _buildUI();
    if (u.hint.textContent !== hintText) u.hint.textContent = hintText;
    if (u.overlay.style.display !== 'flex') u.overlay.style.display = 'flex';
    if (u.badge.style.display !== 'none') u.badge.style.display = 'none';
  }
  function _showBadge() {
    const u = _buildUI();
    if (u.overlay.style.display !== 'none') u.overlay.style.display = 'none';
    if (u.badge.style.display !== 'flex') u.badge.style.display = 'flex';
  }
  function _hideUI() {
    if (!ui) return;
    if (ui.overlay.style.display !== 'none') ui.overlay.style.display = 'none';
    if (ui.badge.style.display !== 'none') ui.badge.style.display = 'none';
  }

  // ── Catch-art card — a small picture of what you just caught (or
  // lost), shown just under the result toast for a few seconds. ──────
  let catchArtUI = null;
  let _catchArtTimer = null;

  function _buildCatchArtUI() {
    if (catchArtUI) return catchArtUI;
    const style = document.createElement('style');
    style.textContent = `
      #catch-art-card {
        position: fixed; top: 112px; left: 50%; transform: translateX(-50%) scale(0.9);
        display: none; z-index: 199; pointer-events: none;
        background: rgba(6,16,20,0.92); border-radius: 10px; padding: 6px;
        box-shadow: 0 6px 20px rgba(0,0,0,0.5);
        opacity: 0; transition: opacity 0.2s ease, transform 0.2s ease;
      }
      #catch-art-card.visible { opacity: 1; transform: translateX(-50%) scale(1); }
      #catch-art-card.good { border: 1px solid rgba(96,224,192,0.5); }
      #catch-art-card.bad  { border: 1px solid rgba(192,80,64,0.5); }
    `;
    document.head.appendChild(style);
    const card = document.createElement('div');
    card.id = 'catch-art-card';
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    card.appendChild(canvas);
    document.body.appendChild(card);
    catchArtUI = { card, ctx: canvas.getContext('2d') };
    return catchArtUI;
  }

  function _showCatchArt(fish, success) {
    if (!fish || !fish.icon) return;
    const u = _buildCatchArtUI();
    u.ctx.clearRect(0, 0, 64, 64);
    u.ctx.save();
    if (!success) { u.ctx.globalAlpha = 0.55; u.ctx.filter = 'grayscale(60%)'; }
    _drawCatchArt(u.ctx, fish.icon);
    u.ctx.restore();
    u.card.className = success ? 'good' : 'bad';
    u.card.style.display = 'block';
    requestAnimationFrame(() => u.card.classList.add('visible'));
    if (_catchArtTimer) clearTimeout(_catchArtTimer);
    _catchArtTimer = setTimeout(() => {
      u.card.classList.remove('visible');
      setTimeout(() => { u.card.style.display = 'none'; }, 200);
    }, 3400);
  }

  // ── Catch icon library — 64x64 vector art, one per catchable.
  // _fishBody paints a shaded, outlined fish from a species profile (body
  // proportions, tail and fin shapes, colour bands and markings), so each
  // entry reads as its own species without external art assets.
  function _fishBody(ctx, o) {
    const L = o.len || 22, H = o.ht || 10;          // half-length, half-height
    const hump = o.hump || 0;                        // extra back height
    const line = o.outline || 'rgba(20,24,28,0.75)';
    const eyeColor = o.eyeColor || '#101010';
    ctx.save();
    ctx.translate(32 + (o.dx || 0), 33 + (o.dy || 0));
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // Body outline, nose at +L, tail wrist at -0.78L.
    const wx = -L*0.78, wh = H*0.28;
    const bodyPath = () => {
      ctx.beginPath();
      ctx.moveTo(L, H*0.05);
      ctx.bezierCurveTo(L*0.85, -H*0.9 - hump, L*0.05, -H*1.05 - hump, -L*0.35, -H*0.7 - hump*0.4);
      ctx.quadraticCurveTo(-L*0.62, -H*0.42, wx, -wh);
      ctx.lineTo(wx, wh);
      ctx.quadraticCurveTo(-L*0.62, H*0.45, -L*0.35, H*0.72);
      ctx.bezierCurveTo(L*0.05, H*1.05, L*0.8, H*0.85, L, H*0.05);
      ctx.closePath();
    };
    const fin = (pts, col) => {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        if (p.length === 4) ctx.quadraticCurveTo(p[0], p[1], p[2], p[3]); else ctx.lineTo(p[0], p[1]);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = line; ctx.lineWidth = 0.9; ctx.stroke();
    };
    const finCol = o.finColor;

    if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = 14; }

    // Tail
    const tl = o.tailLen || L*0.42, th = o.tailHt || H*1.05;
    if (o.tail === 'round') {
      fin([[wx + 1, -wh], [wx - tl*0.9, -th, wx - tl, 0], [wx - tl*0.9, th, wx + 1, wh]], finCol);
    } else if (o.tail === 'square') {
      fin([[wx + 1, -wh], [wx - tl, -th], [wx - tl*0.88, 0, wx - tl, th], [wx + 1, wh]], finCol);
    } else {  // forked
      fin([[wx + 1, -wh], [wx - tl, -th], [wx - tl*0.45, 0, wx - tl, th], [wx + 1, wh]], finCol);
    }
    ctx.shadowBlur = 0;
    // fin rays on tail
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.6;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(wx, k*wh*0.4); ctx.lineTo(wx - tl*0.85, k*th*0.38); ctx.stroke(); }

    // Dorsal fin(s)
    const top = -H*0.95 - hump;
    if (o.dorsal === 'spiny') {
      const pts = [[L*0.3, top*0.92]];
      for (let k = 0; k <= 6; k++) { const x = L*0.28 - k*L*0.1; pts.push([x - L*0.03, top*1.55 + (k % 2)*2], [x - L*0.08, top*1.08]); }
      pts.push([-L*0.42, top*0.72]);
      fin(pts, finCol);
    } else if (o.dorsal === 'sail') {
      fin([[L*0.35, top*0.9], [L*0.1, top*2.0, -L*0.4, top*1.6], [-L*0.5, top*0.62]], finCol);
    } else if (o.dorsal === 'rear') {       // pike: fin set far back
      fin([[-L*0.4, top*0.6], [-L*0.55, top*1.35], [-L*0.7, top*0.35]], finCol);
    } else if (o.dorsal !== 'none') {
      fin([[L*0.18, top*0.98], [-L*0.02, top*1.65], [-L*0.3, top*0.8]], finCol);
    }
    if (o.adipose) fin([[-L*0.55, -H*0.5], [-L*0.62, -H*0.82, -L*0.68, -H*0.42]], finCol);
    // Anal + pelvic fins
    fin([[-L*0.32, H*0.68], [-L*0.46, H*1.25], [-L*0.58, H*0.45]], finCol);
    fin([[L*0.2, H*0.85], [L*0.05, H*1.35], [-L*0.02, H*0.9]], finCol);

    // Body with three-band gradient (back / flank / belly)
    bodyPath();
    const g = ctx.createLinearGradient(0, -H - hump, 0, H);
    g.addColorStop(0, o.backColor || o.bodyColor);
    g.addColorStop(0.45, o.bodyColor);
    g.addColorStop(0.72, o.bellyColor || o.bodyColor);
    g.addColorStop(1, o.bellyColor || o.bodyColor);
    ctx.fillStyle = g;
    if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = 16; }
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.save();
    bodyPath(); ctx.clip();
    // Markings
    if (o.bars) {
      ctx.fillStyle = o.bars;
      const n = o.barCount || 6;
      for (let k = 0; k < n; k++) {
        const x = L*0.45 - k*(L*1.15/n);
        ctx.beginPath(); ctx.moveTo(x, -H*1.2); ctx.lineTo(x + 2.4, -H*1.2); ctx.lineTo(x - 0.8, H*0.35); ctx.lineTo(x - 3.2, H*0.35); ctx.closePath(); ctx.fill();
      }
    }
    if (o.stripe) {
      ctx.strokeStyle = o.stripe; ctx.lineWidth = o.stripeW || 3.2;
      ctx.beginPath(); ctx.moveTo(L*0.7, 0); ctx.quadraticCurveTo(0, -H*0.15, wx - 2, 0); ctx.stroke();
    }
    if (o.spots) {
      ctx.fillStyle = o.spots;
      for (let k = 0; k < (o.spotCount || 14); k++) {
        const r1 = Math.sin(k*12.9898)*43758.5453, r2 = Math.sin(k*78.233)*12345.678;
        const sx = L*0.55 - (r1 - Math.floor(r1))*L*1.3;
        const sy = -H*0.85 + (r2 - Math.floor(r2))*H*(o.spotsLow ? 1.5 : 1.0);
        ctx.beginPath(); ctx.ellipse(sx, sy, o.spotSize || 1.2, (o.spotSize || 1.2)*0.8, 0, 0, Math.PI*2); ctx.fill();
      }
    }
    if (o.patches) {           // koi-style blotches
      ctx.fillStyle = o.patches;
      for (const [px, py, pr] of [[L*0.3, -H*0.5, H*0.55], [-L*0.15, -H*0.7, H*0.6], [-L*0.55, -H*0.2, H*0.4]]) { ctx.beginPath(); ctx.ellipse(px, py, pr*1.3, pr, 0.3, 0, Math.PI*2); ctx.fill(); }
    }
    // Scales
    if (!o.smooth) {
      ctx.strokeStyle = o.scaleColor || 'rgba(255,255,255,0.14)'; ctx.lineWidth = 0.55;
      const s = o.scaleSize || 3.2;
      for (let row = -H; row < H; row += s*0.8) {
        const off = (Math.round(row / (s*0.8)) % 2) * s*0.5;
        for (let x = L*0.45 + off; x > wx; x -= s) { ctx.beginPath(); ctx.arc(x, row, s*0.55, Math.PI*0.6, Math.PI*1.4); ctx.stroke(); }
      }
    }
    // Lateral line
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(L*0.5, -H*0.25); ctx.quadraticCurveTo(0, -H*0.4, wx, -1); ctx.stroke();
    // Top-light sheen
    const sh = ctx.createLinearGradient(0, -H - hump, 0, 0);
    sh.addColorStop(0, 'rgba(255,255,255,0.28)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sh;
    ctx.beginPath(); ctx.ellipse(L*0.05, -H*0.5 - hump*0.5, L*0.6, H*0.35, -0.05, 0, Math.PI*2); ctx.fill();
    // Gill cover
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(L*0.72, 0, H*0.72, Math.PI*0.62, Math.PI*1.38); ctx.stroke();
    if (o.gillSpot) { ctx.fillStyle = o.gillSpot; ctx.beginPath(); ctx.ellipse(L*0.46, -H*0.12, 1.8, 2.4, 0, 0, Math.PI*2); ctx.fill(); }
    ctx.restore();

    // Outline
    bodyPath(); ctx.strokeStyle = line; ctx.lineWidth = 1.1; ctx.stroke();
    // Pectoral fin over the body
    fin([[L*0.48, H*0.2], [L*0.3, H*0.35, L*0.2, H*0.72], [L*0.4, H*0.45]], finCol);

    // Eye
    const ex = L*0.74, ey = -H*0.2, er = o.eyeSize || Math.max(2.2, H*0.26);
    ctx.fillStyle = o.eyeRing || '#f4ecd0'; ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = line; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.fillStyle = eyeColor; ctx.beginPath(); ctx.arc(ex + er*0.12, ey, er*0.62, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + er*0.32, ey - er*0.3, er*0.22, 0, Math.PI*2); ctx.fill();

    // Mouth
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    if (o.bigLips) {
      ctx.fillStyle = o.lipColor || '#b86070';
      ctx.beginPath(); ctx.ellipse(L + 0.5, H*0.12, 2.6, 2.2, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3a1a20'; ctx.beginPath(); ctx.ellipse(L + 1.3, H*0.12, 1.1, 1, 0, 0, Math.PI*2); ctx.fill();
    } else if (o.teeth) {
      ctx.beginPath(); ctx.moveTo(L, H*0.05); ctx.lineTo(L*0.68, H*0.3); ctx.stroke();
      ctx.fillStyle = '#fff';
      for (let k = 0; k < 4; k++) { const x = L*0.96 - k*L*0.07, y = H*0.08 + k*H*0.06; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 1, y + 2.2); ctx.lineTo(x - 2, y); ctx.closePath(); ctx.fill(); }
    } else {
      ctx.beginPath(); ctx.moveTo(L, H*0.05); ctx.quadraticCurveTo(L*0.9, H*0.28, L*0.8, H*0.22); ctx.stroke();
    }
    if (o.whiskers) {
      ctx.strokeStyle = o.whiskerColor || '#2a2a26'; ctx.lineWidth = 1;
      for (const [cx1, cy1, x2, y2] of [[L + 6, -H*0.9, L + 9, -H*0.4], [L + 7, H*0.9, L + 8, H*1.4], [L + 3, H*1.4, L + 1, H*2.0], [L + 9, H*0.2, L + 11, H*0.7]]) {
        ctx.beginPath(); ctx.moveTo(L - 0.5, H*0.1); ctx.quadraticCurveTo(cx1, cy1, x2, y2); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function _drawCatchArt(ctx, key) {
    if (key === 'minnow') {
      _fishBody(ctx, { len: 19, ht: 6.5, bodyColor: '#a9b6bf', backColor: '#6f7f8a', bellyColor: '#eef3f6', finColor: '#98a6b0', stripe: 'rgba(60,70,80,0.55)', stripeW: 1.6, tailLen: 8, tailHt: 6 });
    } else if (key === 'guppy') {
      _fishBody(ctx, { len: 14, ht: 6.5, dx: 6, bodyColor: '#7fb6d8', backColor: '#5a8fb8', bellyColor: '#e8e2c8', finColor: '#e8683a', tail: 'round', tailLen: 18, tailHt: 13, dorsal: 'sail', spots: '#1a2a6a', spotCount: 5, spotSize: 1.6, smooth: true });
      ctx.save(); ctx.translate(38, 33); ctx.strokeStyle = 'rgba(255,220,80,0.7)'; ctx.lineWidth = 0.8;
      for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-27, k*3.6); ctx.stroke(); }
      ctx.restore();
    } else if (key === 'sunfish') {
      _fishBody(ctx, { len: 18, ht: 13, bodyColor: '#6f9a58', backColor: '#3f6a3a', bellyColor: '#f0a040', finColor: '#6a8a50', dorsal: 'spiny', tail: 'square', tailLen: 8, bars: 'rgba(40,70,40,0.35)', barCount: 6, spots: '#e8c060', spotCount: 12, spotSize: 1, gillSpot: '#161a28', eyeColor: '#c02818' });
    } else if (key === 'catfish') {
      _fishBody(ctx, { len: 23, ht: 8, dx: -5, bodyColor: '#6e6a58', backColor: '#3e3c34', bellyColor: '#e2dccb', finColor: '#565244', tail: 'fork', adipose: true, whiskers: true, smooth: true, spots: 'rgba(30,30,24,0.55)', spotCount: 10, spotSize: 1, eyeSize: 1.8 });
    } else if (key === 'coalcatfish') {
      _fishBody(ctx, { len: 23, ht: 8, dx: -5, bodyColor: '#2c2c2e', backColor: '#141416', bellyColor: '#5a5a5a', finColor: '#1c1c1e', tail: 'fork', adipose: true, whiskers: true, whiskerColor: '#666', smooth: true, spots: 'rgba(255,140,40,0.55)', spotCount: 6, spotSize: 0.9, eyeColor: '#000', eyeRing: '#ffb060', eyeSize: 1.8, outline: '#000' });
    } else if (key === 'perch') {
      _fishBody(ctx, { len: 21, ht: 9.5, hump: 1.5, bodyColor: '#b8b848', backColor: '#5e7030', bellyColor: '#f2eed0', finColor: '#e0602c', dorsal: 'spiny', bars: 'rgba(40,52,20,0.6)', barCount: 6 });
    } else if (key === 'trout') {
      _fishBody(ctx, { len: 23, ht: 8.5, bodyColor: '#a8b0a0', backColor: '#4e6a58', bellyColor: '#f2eee0', finColor: '#b8a088', tail: 'square', adipose: true, stripe: 'rgba(230,100,140,0.75)', stripeW: 3.4, spots: '#2a3028', spotCount: 26, spotSize: 0.9 });
    } else if (key === 'bass') {
      _fishBody(ctx, { len: 22, ht: 10.5, bodyColor: '#7e9a50', backColor: '#3a5a2c', bellyColor: '#eae8c8', finColor: '#5a7a40', dorsal: 'spiny', tail: 'square', stripe: 'rgba(30,50,24,0.7)', stripeW: 2.6, bigLips: true, lipColor: '#8aa060', eyeColor: '#6a1a10' });
    } else if (key === 'pike') {
      _fishBody(ctx, { len: 26, ht: 6.5, bodyColor: '#6a8a4a', backColor: '#34502c', bellyColor: '#f0eccc', finColor: '#c0802a', dorsal: 'rear', tail: 'fork', tailLen: 10, teeth: true, spots: '#e4e4a8', spotCount: 22, spotSize: 1.1, spotsLow: true, eyeColor: '#b88a20' });
    } else if (key === 'salmon') {
      _fishBody(ctx, { len: 24, ht: 9, bodyColor: '#c8ccd0', backColor: '#4a6078', bellyColor: '#f6f4f0', finColor: '#7a8a98', tail: 'square', adipose: true, spots: '#1a2430', spotCount: 14, spotSize: 1, scaleColor: 'rgba(255,255,255,0.22)' });
    } else if (key === 'piranha') {
      _fishBody(ctx, { len: 18, ht: 12.5, hump: 1, bodyColor: '#8a929a', backColor: '#4a5058', bellyColor: '#e03a28', finColor: '#6a3028', tail: 'square', tailLen: 8, adipose: true, teeth: true, spots: 'rgba(230,240,250,0.35)', spotCount: 20, spotSize: 0.8, eyeColor: '#d01010', eyeRing: '#f0d0a0' });
    } else if (key === 'carp') {
      _fishBody(ctx, { len: 23, ht: 11, dx: -4, hump: 1.5, bodyColor: '#f2c040', backColor: '#e08820', bellyColor: '#fff4c0', finColor: '#f0b030', dorsal: 'sail', bigLips: true, lipColor: '#e0a030', whiskers: true, whiskerColor: '#b07818', scaleSize: 4.2, scaleColor: 'rgba(255,250,210,0.5)', patches: 'rgba(255,255,240,0.35)', glow: 'rgba(255,208,80,0.6)' });
    } else if (key === 'uranium') {
      _fishBody(ctx, { len: 21, ht: 9.5, bodyColor: '#4a8a3a', backColor: '#1e3a18', bellyColor: '#b0f060', finColor: '#3a7a28', dorsal: 'spiny', spots: '#c8ff60', spotCount: 18, spotSize: 1.1, eyeColor: '#8fff40', eyeRing: '#10200c', glow: '#7fff30', scaleColor: 'rgba(200,255,120,0.3)' });
    } else if (key === 'bluegill') {
      _fishBody(ctx, { len: 17, ht: 12.5, bodyColor: '#6c8aa8', backColor: '#384c68', bellyColor: '#f0b858', finColor: '#4a6078', dorsal: 'spiny', tail: 'square', tailLen: 8, bars: 'rgba(30,40,70,0.35)', barCount: 6, gillSpot: '#10182a', eyeColor: '#1a1a1a' });
    } else if (key === 'shiner') {
      _fishBody(ctx, { len: 18, ht: 6, bodyColor: '#d8e0e8', backColor: '#8898a8', bellyColor: '#ffffff', finColor: '#c0c8d0', stripe: 'rgba(120,140,170,0.6)', stripeW: 1.4, scaleColor: 'rgba(255,255,255,0.4)', tailLen: 8, tailHt: 6 });
    } else if (key === 'crappie') {
      _fishBody(ctx, { len: 19, ht: 11, hump: 1, bodyColor: '#c8cca8', backColor: '#6a7050', bellyColor: '#f2f0dc', finColor: '#8a8e70', dorsal: 'spiny', tail: 'square', spots: '#3a4028', spotCount: 26, spotSize: 1.1 });
    } else if (key === 'commoncarp') {
      _fishBody(ctx, { len: 23, ht: 10.5, dx: -3, hump: 1.5, bodyColor: '#a08a50', backColor: '#5e5030', bellyColor: '#e8d8a0', finColor: '#8a7040', dorsal: 'sail', bigLips: true, lipColor: '#a08a50', whiskers: true, whiskerColor: '#6a5a30', scaleSize: 4.2, scaleColor: 'rgba(40,30,10,0.35)' });
    } else if (key === 'walleye') {
      _fishBody(ctx, { len: 24, ht: 7.5, bodyColor: '#b8a860', backColor: '#5a5430', bellyColor: '#f0ecd8', finColor: '#9a8a50', dorsal: 'spiny', tail: 'fork', bars: 'rgba(50,46,20,0.45)', barCount: 5, eyeRing: '#e8e0b0', eyeColor: '#c8c080', eyeSize: 3, teeth: true });
    } else if (key === 'stripedbass') {
      _fishBody(ctx, { len: 24, ht: 9, bodyColor: '#c8ccd4', backColor: '#4a5a6a', bellyColor: '#f6f6f8', finColor: '#7a8898', dorsal: 'spiny', tail: 'fork', bigLips: true, lipColor: '#a0a8b0' });
      // horizontal stripes
      ctx.save(); ctx.translate(32, 33); ctx.strokeStyle = 'rgba(40,50,60,0.55)'; ctx.lineWidth = 1;
      for (const y of [-5, -2, 1, 4]) { ctx.beginPath(); ctx.moveTo(15, y * 0.8); ctx.quadraticCurveTo(0, y, -17, y * 0.5); ctx.stroke(); }
      ctx.restore();
    } else if (key === 'koi') {
      _fishBody(ctx, { len: 22, ht: 10, dx: -2, bodyColor: '#f4f0e8', backColor: '#ffffff', bellyColor: '#fffaf0', finColor: '#f8e8e0', dorsal: 'sail', tail: 'round', tailLen: 13, tailHt: 11, whiskers: true, whiskerColor: '#d0a090', patches: 'rgba(230,60,30,0.85)', scaleSize: 3.8, scaleColor: 'rgba(200,120,100,0.25)', glow: 'rgba(255,120,80,0.35)' });
    } else if (key === 'gar') {
      _fishBody(ctx, { len: 28, ht: 5, dx: -2, bodyColor: '#8a9a60', backColor: '#4a5a30', bellyColor: '#e0e4c0', finColor: '#6a7a40', dorsal: 'rear', tail: 'round', tailLen: 8, teeth: true, spots: '#2a3018', spotCount: 18, spotSize: 1.1, spotsLow: true, scaleSize: 2.6 });
    } else if (key === 'muskie') {
      _fishBody(ctx, { len: 27, ht: 7, bodyColor: '#a0a870', backColor: '#4a5a38', bellyColor: '#eeecd8', finColor: '#b07038', dorsal: 'rear', tail: 'fork', tailLen: 10, teeth: true, bars: 'rgba(40,56,30,0.5)', barCount: 7, eyeColor: '#806018' });
    } else if (key === 'sturgeon') {
      _fishBody(ctx, { len: 27, ht: 7, dx: -1, bodyColor: '#7a8088', backColor: '#40464e', bellyColor: '#dcdcd4', finColor: '#5a6068', dorsal: 'rear', tail: 'fork', tailLen: 11, whiskers: true, whiskerColor: '#8a8a80', smooth: true, spots: 'rgba(230,230,220,0.8)', spotCount: 9, spotSize: 1.5, eyeSize: 1.6 });
    } else if (key === 'electriceel') {
      _fishBody(ctx, { len: 28, ht: 5.5, dx: -1, bodyColor: '#3a4a6a', backColor: '#1a2238', bellyColor: '#f0c040', finColor: '#6a88c0', dorsal: 'none', tail: 'round', tailLen: 7, tailHt: 5, smooth: true, spots: '#9fdcff', spotCount: 12, spotSize: 0.9, spotsLow: true, eyeColor: '#80e0ff', glow: '#60c8ff' });
      // a spark or two
      ctx.save(); ctx.strokeStyle = '#bff0ff'; ctx.lineWidth = 1.2; ctx.shadowColor = '#60c8ff'; ctx.shadowBlur = 6;
      for (const [x, y] of [[20, 16], [44, 14], [34, 52]]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 3, y + 3); ctx.lineTo(x, y + 5); ctx.lineTo(x + 3, y + 8); ctx.stroke(); }
      ctx.restore();
    } else if (key === 'arapaima') {
      _fishBody(ctx, { len: 28, ht: 9, dx: -2, bodyColor: '#6a7050', backColor: '#3a4028', bellyColor: '#d8c8a0', finColor: '#a03020', dorsal: 'rear', tail: 'round', tailLen: 10, scaleSize: 4.6, scaleColor: 'rgba(200,60,40,0.45)', eyeColor: '#d0a020' });
      // red rear scales
      ctx.save(); ctx.translate(32, 33); ctx.fillStyle = 'rgba(200,50,30,0.45)';
      ctx.beginPath(); ctx.ellipse(-14, 0, 8, 7, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
    } else if (key === 'fossil') {
      ctx.save();
      ctx.translate(32, 32);
      // stone slab
      const sg = ctx.createLinearGradient(-26, -18, 26, 18);
      sg.addColorStop(0, '#d8c8a4'); sg.addColorStop(1, '#a8946c');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.moveTo(-28, -12); ctx.lineTo(-18, -20); ctx.lineTo(16, -19); ctx.lineTo(28, -8); ctx.lineTo(26, 14); ctx.lineTo(10, 20); ctx.lineTo(-22, 18); ctx.lineTo(-29, 6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#6e5c40'; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = 'rgba(110,92,64,0.35)'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(-22, 12); ctx.lineTo(-10, 16); ctx.moveTo(14, -15); ctx.lineTo(22, -6); ctx.stroke();
      // impression
      ctx.fillStyle = 'rgba(90,72,48,0.28)';
      ctx.beginPath(); ctx.ellipse(0, 0, 17, 8, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#5a4a32'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(-15, 0); ctx.quadraticCurveTo(0, -1.5, 15, 0); ctx.stroke();       // spine
      for (let x = -11; x <= 9; x += 2.6) {
        const h = 7 * Math.sqrt(1 - (x/17)**2);
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(x, -0.7); ctx.quadraticCurveTo(x - 1.5, -h*0.6, x - 2.4, -h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, -0.2); ctx.quadraticCurveTo(x - 1.5, h*0.6, x - 2.4, h); ctx.stroke();
      }
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(15, 0); ctx.quadraticCurveTo(22, -6, 23, 0); ctx.quadraticCurveTo(22, 6, 15, 0); ctx.stroke();  // skull
      ctx.beginPath(); ctx.arc(19.5, -1, 1.6, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(-23, -7); ctx.moveTo(-15, 0); ctx.lineTo(-23, 7); ctx.moveTo(-23, -7); ctx.quadraticCurveTo(-20, 0, -23, 7); ctx.stroke();  // tail
      ctx.restore();
    } else if (key === 'eel') {
      ctx.save();
      const eelPath = () => { ctx.beginPath(); ctx.moveTo(8, 50); ctx.bezierCurveTo(26, 40, 4, 26, 20, 16); ctx.bezierCurveTo(30, 10, 40, 14, 50, 18); };
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      eelPath(); ctx.strokeStyle = '#1e2414'; ctx.lineWidth = 11; ctx.stroke();                 // outline
      eelPath(); ctx.strokeStyle = '#8a8a3a'; ctx.lineWidth = 9; ctx.stroke();                  // belly
      ctx.save(); ctx.translate(-0.8, -1.4);
      eelPath(); ctx.strokeStyle = '#4e5a2a'; ctx.lineWidth = 6; ctx.stroke();                  // back
      ctx.restore();
      eelPath(); ctx.strokeStyle = 'rgba(200,190,110,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]);  // fin frill
      // head
      ctx.fillStyle = '#56622c'; ctx.beginPath(); ctx.ellipse(50, 18, 6.5, 4.8, 0.35, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#1e2414'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(56, 20.5); ctx.lineTo(51.5, 20.5); ctx.stroke();
      ctx.fillStyle = '#f0e8b0'; ctx.beginPath(); ctx.arc(51, 16.4, 1.9, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#101010'; ctx.beginPath(); ctx.arc(51.4, 16.4, 1.1, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(51.7, 15.9, 0.4, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    } else if (key === 'turtle') {
      ctx.save();
      ctx.translate(30, 34);
      ctx.lineJoin = 'round';
      const outl = '#1e2a16';
      // legs + tail
      ctx.fillStyle = '#6a7a48'; ctx.strokeStyle = outl; ctx.lineWidth = 1;
      for (const [lx, ly, rot] of [[12, -13, -0.6], [12, 13, 0.6], [-12, -13, 0.6], [-12, 13, -0.6]]) {
        ctx.beginPath(); ctx.ellipse(lx, ly, 6, 3.5, rot, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(-19, -2); ctx.lineTo(-28, 0); ctx.lineTo(-19, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      // head with hooked beak
      ctx.beginPath(); ctx.ellipse(23, 0, 7.5, 5.5, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d8d0a0';
      ctx.beginPath(); ctx.moveTo(29, -2.5); ctx.quadraticCurveTo(33.5, -1, 31, 2); ctx.lineTo(28.5, 1); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8d060'; ctx.beginPath(); ctx.arc(25, -2.4, 1.5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#101010'; ctx.beginPath(); ctx.arc(25.3, -2.4, 0.8, 0, Math.PI*2); ctx.fill();
      // shell with ridged scutes
      const shg = ctx.createRadialGradient(-3, -5, 2, 0, 0, 20);
      shg.addColorStop(0, '#7a8a50'); shg.addColorStop(1, '#3e4c28');
      ctx.fillStyle = shg; ctx.beginPath(); ctx.ellipse(0, 0, 20, 15, 0, 0, Math.PI*2); ctx.fill();
      ctx.lineWidth = 1.2; ctx.stroke();
      ctx.strokeStyle = 'rgba(20,30,14,0.7)'; ctx.lineWidth = 1;
      const hex = (cx, cy, r) => { ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = k*Math.PI/3; ctx[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a)*r*1.2, cy + Math.sin(a)*r); } ctx.closePath(); ctx.stroke(); };
      hex(0, 0, 5); hex(-11, 0, 4.2); hex(11, 0, 4.2);
      for (const [sx, sy] of [[-6, -9], [6, -9], [-6, 9], [6, 9]]) hex(sx, sy, 3.6);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.ellipse(-4, -7, 9, 4, -0.2, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    } else if (key === 'boot') {
      ctx.save();
      ctx.translate(32, 32);
      ctx.fillStyle = '#6a4a2c';
      ctx.beginPath();
      ctx.moveTo(-10, -20); ctx.lineTo(2, -20); ctx.lineTo(2, 4); ctx.lineTo(20, 10);
      ctx.lineTo(20, 18); ctx.lineTo(-10, 18); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#4a3018'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 1;
      for (let i = -16; i <= -2; i += 5) { ctx.beginPath(); ctx.moveTo(-9, i); ctx.lineTo(1, i); ctx.stroke(); }
      ctx.fillStyle = '#3a2410';
      ctx.beginPath(); ctx.ellipse(5, 13, 15, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (key === 'tincan') {
      ctx.save();
      ctx.translate(32, 32);
      ctx.fillStyle = '#9098a0';
      ctx.beginPath(); ctx.rect(-12, -18, 24, 34); ctx.fill();
      ctx.strokeStyle = '#606870'; ctx.lineWidth = 1.4; ctx.strokeRect(-12, -18, 24, 34);
      ctx.fillStyle = '#787f88';
      ctx.beginPath(); ctx.ellipse(0, -18, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#a83028'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(9, 10); ctx.stroke();
      ctx.strokeStyle = '#606870'; ctx.lineWidth = 0.8;
      for (let i = -12; i <= 12; i += 6) { ctx.beginPath(); ctx.moveTo(i, -14); ctx.lineTo(i, 12); ctx.stroke(); }
      ctx.restore();
    } else if (key === 'newspaper') {
      ctx.save();
      ctx.translate(32, 32);
      ctx.fillStyle = '#d8d2b8';
      ctx.beginPath(); ctx.moveTo(-18, -16); ctx.lineTo(18, -20); ctx.lineTo(20, 16); ctx.lineTo(-16, 20); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#a8a288'; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = '#8a8470';
      for (let i = -10; i <= 10; i += 5) {
        ctx.beginPath(); ctx.moveTo(-13, i); ctx.lineTo(14, i - 2); ctx.stroke();
      }
      ctx.fillStyle = '#605c48'; ctx.font = 'bold 7px Georgia, serif';
      ctx.fillText('NEWS', -14, -10);
      ctx.restore();
    } else if (key === 'net') {
      ctx.save();
      ctx.translate(32, 32);
      ctx.fillStyle = 'rgba(150,170,150,0.25)';
      ctx.beginPath(); ctx.ellipse(0, 0, 22, 18, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a9880'; ctx.lineWidth = 1;
      for (let i = -20; i <= 20; i += 6) {
        ctx.beginPath(); ctx.moveTo(i, -18); ctx.lineTo(i + 8, 18); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i, 18); ctx.lineTo(i + 8, -18); ctx.stroke();
      }
      ctx.restore();
    } else {
      _fishBody(ctx, { bodyColor: '#8090a0', bellyColor: '#c8d0d8', finColor: '#586878' });
    }
  }

  // ── Charge/minigame HUD drawing ──────────────────────────────────
  // holdWindowLeft: null while still charging up; 1→0 once fully charged,
  // counting down the CAST_HOLD_WINDOW release grace period. Drives a
  // flashing red border/text once it's live so the shrinking window reads
  // as urgent rather than just a color change on the bar itself.
  function _drawCharge(frac, distTiles, holdWindowLeft) {
    const u = _buildUI();
    const { ctx, canvas } = u;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const inWindow = holdWindowLeft != null;
    const pulse = inWindow ? (0.5 + 0.5 * Math.sin(performance.now() / 70)) : 0;

    const barX = 20, barY = H/2 - 10, barW = W - 40, barH = 20;
    ctx.save();
    ctx.strokeStyle = inWindow ? `rgba(255,${80 + pulse * 80},64,0.9)` : 'rgba(96,208,192,0.5)';
    ctx.lineWidth = inWindow ? 3 : 2;
    ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 10); ctx.stroke();
    ctx.fillStyle = 'rgba(96,208,192,0.15)'; ctx.fill();

    const fillW = Math.max(0, barW * frac - 4);
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0, '#3a8070');
    grad.addColorStop(1, inWindow ? '#ff6040' : (frac >= 1 ? '#ffcf60' : '#60d0c0'));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.roundRect(barX + 2, barY + 2, fillW, barH - 4, 8); ctx.fill();
    ctx.restore();

    if (inWindow) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillStyle = `rgba(255,${140 + pulse * 80},96,${0.75 + pulse * 0.25})`;
      ctx.fillText('RELEASE NOW!', W / 2, barY + barH + 15);
      ctx.restore();
    } else if (distTiles != null) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillStyle = 'rgba(207,238,230,0.85)';
      ctx.fillText(`~${distTiles.toFixed(1)} tiles`, W / 2, barY + barH + 14);
      ctx.restore();
    }
  }

  function _drawBiteAlert(frac) {
    const u = _buildUI();
    const { ctx, canvas } = u;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.fillStyle = '#ffd060';
    ctx.fillText('FISH HOOKED', W / 2, H / 2 - 8);

    const barX = 60, barY = H/2 + 6, barW = W - 120, barH = 10;
    ctx.strokeStyle = 'rgba(255,208,96,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 5); ctx.stroke();
    const remaining = Math.max(0, 1 - frac);
    ctx.fillStyle = '#ffd060';
    ctx.beginPath(); ctx.roundRect(barX + 1, barY + 1, Math.max(0, (barW - 2) * remaining), barH - 2, 4); ctx.fill();
    ctx.restore();
  }

  function _drawMinigame() {
    const u = _buildUI();
    const { ctx, canvas } = u;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const trackX = 30, trackY = H/2 - 12, trackW = W - 60, trackH = 24;

    // End capsules double as the catch-progress meter, filling from each
    // outer edge toward the middle as `progress` climbs.
    const capW = 14;
    ctx.save();
    ctx.fillStyle = 'rgba(20,40,40,0.6)';
    ctx.beginPath(); ctx.roundRect(4, H/2 - 16, capW, 32, 8); ctx.fill();
    ctx.beginPath(); ctx.roundRect(W - 4 - capW, H/2 - 16, capW, 32, 8); ctx.fill();
    const capFillH = 32 * progress;
    ctx.fillStyle = '#60e0c0';
    ctx.beginPath(); ctx.roundRect(4, H/2 - 16 + (32 - capFillH), capW, capFillH, 8); ctx.fill();
    ctx.beginPath(); ctx.roundRect(W - 4 - capW, H/2 - 16 + (32 - capFillH), capW, capFillH, 8); ctx.fill();

    // Track
    ctx.strokeStyle = 'rgba(120,160,160,0.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(trackX, trackY, trackW, trackH, 6); ctx.stroke();
    ctx.fillStyle = 'rgba(10,20,20,0.5)'; ctx.fill();

    // Target zone
    const zx = trackX + zoneStart * trackW;
    const zw = zoneWidth * trackW;
    const inZone = arrowPos >= zoneStart && arrowPos <= zoneStart + zoneWidth;
    // Orange flash while the fish winds up a dart, surge or run
    const flash = fightWarn > 0 && Math.sin(performance.now() / 45) > 0;
    ctx.fillStyle = flash ? 'rgba(255,144,64,0.35)' : inZone ? 'rgba(96,224,192,0.35)' : 'rgba(96,224,192,0.18)';
    ctx.fillRect(zx, trackY + 2, zw, trackH - 4);
    ctx.strokeStyle = flash ? '#ff9040' : '#60e0c0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(zx, trackY - 3); ctx.lineTo(zx, trackY + trackH + 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(zx + zw, trackY - 3); ctx.lineTo(zx + zw, trackY + trackH + 3); ctx.stroke();

    // Arrow
    const ax = trackX + arrowPos * trackW;
    const ay = trackY + trackH / 2;
    ctx.fillStyle = inZone ? '#ffd060' : '#ff9050';
    ctx.beginPath();
    ctx.moveTo(ax + 9, ay);
    ctx.lineTo(ax - 6, ay - 7);
    ctx.lineTo(ax - 6, ay + 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();

    if (fightRun > 0) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillStyle = '#ff7050';
      ctx.fillText('IT\'S RUNNING! HOLD ON!', W / 2, trackY - 8);
    }
    ctx.restore();
  }

  // ── World-space + grid helpers ───────────────────────────────────
  function _bobberWorldPos() {
    return { x: (bobberCol + 0.5) * TILE, y: (bobberRow + 0.5) * TILE };
  }

  // On a successful catch, eases the hook from its resting water position
  // up toward the rod tip over the result banner's duration — the line
  // gets visibly reeled out of the water instead of just sitting there.
  // Returns the plain water position for every other phase/outcome.
  function _resultPullPos() {
    const b = _bobberWorldPos();
    if (!(phase === 'result' && resultGood)) return b;
    const grip = _rodWorldPos();
    const rod = _rodTip(grip.x, grip.y, b.x, b.y);   // reeled up to the rod tip
    const t = Math.min(1, Math.max(0, 1 - resultTimer / RESULT_DURATION));
    const eased = t * t * (3 - 2 * t); // smoothstep
    return {
      x: b.x + (rod.x - b.x) * eased,
      y: b.y + (rod.y - b.y) * eased - Math.sin(eased * Math.PI) * 14,
    };
  }

  // Live cursor world position — this IS the rod while the pole is out.
  function _rodWorldPos() {
    if (typeof InputManager === 'undefined' || typeof Camera === 'undefined') return { x: 0, y: 0 };
    return Camera.screenToWorld(InputManager.lastMouseSX, InputManager.lastMouseSY);
  }

  // Expanding ring search (Chebyshev distance) for the nearest water tile
  // within maxR tiles of (col,row). Memoized on (col,row,maxR) since this
  // gets called every single frame while hovering/charging but the cursor
  // is almost always still on the same tile it was last frame.
  let _nwiKey = null, _nwiVal = null;
  function _nearestWaterInfo(col, row, maxR) {
    const key = col * 100000 + row * 10 + maxR;
    if (key === _nwiKey) return _nwiVal;
    _nwiKey = key;
    _nwiVal = _nearestWaterInfoRaw(col, row, maxR);
    return _nwiVal;
  }
  function _nearestWaterInfoRaw(col, row, maxR) {
    if (typeof WaterSystem === 'undefined') return null;
    if (WaterSystem.isWater(col, row)) return { dist: 0, col, row };
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const c = col + dx, rr = row + dy;
          if (WaterSystem.isWater(c, rr)) return { dist: r, col: c, row: rr };
        }
      }
    }
    return null;
  }

  function _nearestWaterDirection(x0, y0, maxTiles) {
    const col0 = Math.floor(x0 / TILE), row0 = Math.floor(y0 / TILE);
    const info = _nearestWaterInfo(col0, row0, maxTiles);
    if (!info) return null;
    const wx = (info.col + 0.5) * TILE, wy = (info.row + 0.5) * TILE;
    const dx = wx - x0, dy = wy - y0;
    const len = Math.hypot(dx, dy) || 1;
    return { dirX: dx / len, dirY: dy / len, dist: info.dist, col: info.col, row: info.row };
  }

  // Aim is drag-based: pull the cursor away from the fixed charge anchor
  // (your planted feet) in whichever direction you want to throw — full
  // freedom, not locked to a single auto-picked water tile. A barely-moved
  // mouse (a simple click-and-hold) falls back to auto-aiming at the
  // nearest water so a plain tap-to-cast still works without dragging.
  function _aimDirection() {
    const cur = _rodWorldPos();
    const dx = cur.x - chargeAnchorX, dy = cur.y - chargeAnchorY;
    const len = Math.hypot(dx, dy);
    const MIN_DRAG = TILE * 0.4;
    if (len < MIN_DRAG) {
      const fallback = _nearestWaterDirection(chargeAnchorX, chargeAnchorY, MIN_LAND_DIST_TO_WATER);
      if (fallback) return { dirX: fallback.dirX, dirY: fallback.dirY };
      return { dirX: 1, dirY: 0 };
    }
    return { dirX: dx / len, dirY: dy / len };
  }

  function chargeFraction() {
    if (phase !== 'charging') return 0;
    const el = (performance.now() / 1000) - chargeStart;
    const linear = Math.min(1, el / CAST_MAX_CHARGE);
    // Quadratic ease-in — the meter creeps for the first stretch of the
    // hold and rushes the rest, so it visibly accelerates toward full
    // rather than filling at a constant rate. Still hits exactly 1 at
    // el === CAST_MAX_CHARGE either way (1^2 === 1), so total charge time
    // is unchanged — only the shape of the fill within that time is.
    return linear * linear;
  }

  // ── Rope physics (verlet) — line between the rod (cursor) and hook ─
  function _initRope(x0, y0, x1, y1) {
    const dist = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
    ropeSegLen = (dist * ROPE_SLACK) / (ROPE_POINTS - 1);
    ropePos = []; ropePrev = [];
    for (let i = 0; i < ROPE_POINTS; i++) {
      const t = i / (ROPE_POINTS - 1);
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      ropePos.push({ x, y });
      ropePrev.push({ x, y });
    }
  }

  function _updateRope(x0, y0, x1, y1, frameDt) {
    if (!ropePos) { _initRope(x0, y0, x1, y1); return; }
    const dt = Math.min(frameDt, 0.05);

    // Mutates points in place rather than replacing them with new object
    // literals every frame — this ran continuously for the entire
    // waiting/bite/minigame/result duration of every cast (which can be
    // up to 45s+), so the old version was allocating and discarding
    // ~44 small objects every single frame (10 for the integration step
    // below, plus 2 endpoints re-created on every one of the 16
    // constraint-relaxation passes) purely for GC to clean up. Same
    // math, zero allocations.
    for (let i = 1; i < ROPE_POINTS - 1; i++) {
      const p = ropePos[i], pr = ropePrev[i];
      const vx = (p.x - pr.x) * ROPE_DAMPING, vy = (p.y - pr.y) * ROPE_DAMPING;
      const nx = p.x + vx, ny = p.y + vy + ROPE_GRAVITY * dt * dt;
      pr.x = p.x; pr.y = p.y;
      p.x = nx;   p.y = ny;
    }
    ropePos[0].x = x0; ropePos[0].y = y0;
    ropePos[ROPE_POINTS - 1].x = x1; ropePos[ROPE_POINTS - 1].y = y1;

    for (let iter = 0; iter < ROPE_ITER; iter++) {
      for (let i = 0; i < ROPE_POINTS - 1; i++) {
        const a = ropePos[i], b = ropePos[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const diff = (dist - ropeSegLen) / dist;
        const offX = dx * 0.5 * diff, offY = dy * 0.5 * diff;
        if (i !== 0)                    { a.x += offX; a.y += offY; }
        if (i + 1 !== ROPE_POINTS - 1)  { b.x -= offX; b.y -= offY; }
      }
      ropePos[0].x = x0; ropePos[0].y = y0;
      ropePos[ROPE_POINTS - 1].x = x1; ropePos[ROPE_POINTS - 1].y = y1;
    }
  }

  function _drawRope(ctx) {
    if (!ropePos) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(225,240,255,0.75)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(ropePos[0].x, ropePos[0].y);
    for (let i = 1; i < ROPE_POINTS; i++) ctx.lineTo(ropePos[i].x, ropePos[i].y);
    ctx.stroke();
    ctx.restore();
  }

  // The rod, in world px: tip at (tipX, tipY), pointing along `ang` (butt to
  // tip). Cork grip with a butt cap, reel seat and a spinning reel hung
  // off the side, foregrip, then a tapered graphite blank with thread-wrapped
  // guides and a bright tip-top; a faint line runs from the reel up the
  // guides, and the cast line leaves from the tip. `pull` = {x, y, amount}
  // bends the top of the blank toward a point (the hook) by `amount` px.
  const ROD_LEN = 36;
  function _drawRod(ctx, tipX, tipY, ang, pull) {
    const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
    const bx = tipX - dx * ROD_LEN, by = tipY - dy * ROD_LEN;
    // Bend: push the curve's control point sideways, toward the pull.
    let bend = 0;
    if (pull && pull.amount) {
      const side = dx * (pull.y - tipY) - dy * (pull.x - tipX);
      bend = Math.sign(side || 1) * pull.amount;
    }
    const cx = (bx + tipX) / 2 + nx * bend, cy = (by + tipY) / 2 + ny * bend;
    const at = (u) => {                      // point and unit tangent at u (0 butt .. 1 tip)
      const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
      const px = a * bx + b * cx + c * tipX, py = a * by + b * cy + c * tipY;
      let tx = 2 * (1 - u) * (cx - bx) + 2 * u * (tipX - cx), ty = 2 * (1 - u) * (cy - by) + 2 * u * (tipY - cy);
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      return { x: px, y: py, tx, ty, nx: -ty, ny: tx };
    };
    const seg = (u0, u1, w0, w1, col, n = 4) => {   // a tapering stretch of the rod
      ctx.strokeStyle = col;
      for (let k = 0; k < n; k++) {
        const ua = u0 + (u1 - u0) * k / n, ub = u0 + (u1 - u0) * (k + 1) / n;
        const p = at(ua), q = at(ub);
        ctx.lineWidth = w0 + (w1 - w0) * (k + 0.5) / n;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
    };
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // Soft shadow on the ground beneath it.
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bx + 3, by + 4); ctx.quadraticCurveTo(cx + 3, cy + 4, tipX + 3, tipY + 4); ctx.stroke();

    // Blank: graphite, tapering from the foregrip to the tip, lit along one edge.
    seg(0.42, 1, 2.6, 1.0, '#26384a', 8);
    seg(0.42, 1, 0.9, 0.35, 'rgba(170,200,230,0.55)', 8);

    // Line from the reel up through the guides to the tip.
    const reel = at(0.33);
    ctx.strokeStyle = 'rgba(230,240,250,0.45)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(reel.x + reel.nx * 4, reel.y + reel.ny * 4);
    for (const u of [0.5, 0.64, 0.77, 0.88, 1]) { const g = at(u); ctx.lineTo(g.x + g.nx * (u < 1 ? 1.4 : 0), g.y + g.ny * (u < 1 ? 1.4 : 0)); }
    ctx.stroke();

    // Guides: a red thread wrap and a little silver ring standing off the blank.
    for (const [u, r, w] of [[0.5, 0.95, 2.4], [0.64, 0.8, 2.0], [0.77, 0.68, 1.7], [0.88, 0.58, 1.4]]) {
      const g = at(u);
      ctx.lineCap = 'butt';
      ctx.strokeStyle = '#b8322a'; ctx.lineWidth = w;               // thread wrap: a thin band round the blank
      ctx.beginPath(); ctx.moveTo(g.x - g.tx * 0.45, g.y - g.ty * 0.45); ctx.lineTo(g.x + g.tx * 0.45, g.y + g.ty * 0.45); ctx.stroke();
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#d8dde2'; ctx.lineWidth = 0.45;
      ctx.beginPath(); ctx.arc(g.x + g.nx * 1.3, g.y + g.ny * 1.3, r, 0, Math.PI * 2); ctx.stroke();
    }
    const tip = at(1);
    ctx.fillStyle = '#f2e4a8'; ctx.beginPath(); ctx.arc(tip.x, tip.y, 1.1, 0, Math.PI * 2); ctx.fill();

    // Foregrip (cork), reel seat (metal), main grip (cork with rings), butt cap.
    seg(0.36, 0.43, 3.6, 3.2, '#c99a5c', 2);
    seg(0.27, 0.36, 3.4, 3.4, '#3a3f46', 2);
    seg(0.29, 0.34, 1.0, 1.0, 'rgba(220,226,232,0.6)', 1);
    seg(0.02, 0.27, 4.4, 3.8, '#c99a5c', 4);
    ctx.strokeStyle = 'rgba(110,70,30,0.45)'; ctx.lineWidth = 0.6;
    for (let u = 0.05; u < 0.26; u += 0.035) { const p = at(u); ctx.beginPath(); ctx.moveTo(p.x + p.nx * 2.1, p.y + p.ny * 2.1); ctx.lineTo(p.x - p.nx * 2.1, p.y - p.ny * 2.1); ctx.stroke(); }
    seg(0.0, 0.025, 4.8, 4.8, '#2a2a2e', 1);

    // Spinning reel, hung off the seat: foot, body, spool and crank.
    const rx = reel.x + reel.nx * 4.6, ry = reel.y + reel.ny * 4.6;
    ctx.strokeStyle = '#3a3f46'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(reel.x, reel.y); ctx.lineTo(rx, ry); ctx.stroke();
    ctx.fillStyle = '#4a5058'; ctx.beginPath(); ctx.arc(rx, ry, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c8ced6'; ctx.beginPath(); ctx.arc(rx, ry, 2.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8eef4'; ctx.beginPath(); ctx.arc(rx - 0.6, ry - 0.6, 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a2e34'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - reel.tx * 3.6, ry - reel.ty * 3.6); ctx.stroke();
    ctx.fillStyle = '#d8a040'; ctx.beginPath(); ctx.arc(rx - reel.tx * 3.6, ry - reel.ty * 3.6, 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // The cursor is the angler's hand on the grip, ROD_GRIP of the way up from
  // the butt; the rod reaches out in front of it and the line leaves from
  // the tip. _rodTip gives that tip for a rod held at (x, y) facing the cast
  // toward (tx, ty) — held a little off the line the way an angler does, so
  // the bend toward the fish still reads from above — or at its resting
  // up-right angle when there is no cast. The line physics, the cast and the
  // reel-out all hang off this same point, so the line meets the drawn tip.
  const ROD_GRIP = 0.15;
  function _rodTip(x, y, tx, ty) {
    const a = (tx === undefined || Math.hypot(tx - x, ty - y) < 2) ? -Math.PI / 4 : Math.atan2(ty - y, tx - x) - 0.3;
    const reach = ROD_LEN * (1 - ROD_GRIP);
    return { x: x + Math.cos(a) * reach, y: y + Math.sin(a) * reach, a };
  }

  // The rod in the hand at the cursor, at rest. `pull` bends it (see _drawRod).
  function _drawRodCursor(ctx, x, y, pull) {
    const t = _rodTip(x, y);
    _drawRod(ctx, t.x, t.y, t.a, pull);
  }

  // The rod in the hand at the cursor, facing the cast toward (tx, ty).
  function _drawRodToward(ctx, x, y, tx, ty, pull) {
    const t = _rodTip(x, y, tx, ty);
    _drawRod(ctx, t.x, t.y, t.a, pull);
  }

  // Rod held at a fixed base, pointing toward (dirX,dirY) — used while
  // charging, where the base (feet) stays put and only the aim rotates as
  // you drag the cursor around.
  function _aimedTip(x, y, dirX, dirY) {
    const a = Math.atan2(dirY, dirX), reach = ROD_LEN * (1 - ROD_GRIP);
    return { x: x + Math.cos(a) * reach, y: y + Math.sin(a) * reach, a };
  }
  function _drawRodAimed(ctx, x, y, dirX, dirY) {
    const t = _aimedTip(x, y, dirX, dirY);
    _drawRod(ctx, t.x, t.y, t.a);
  }

  // ── World-space rendering ────────────────────────────────────────
  // Called every frame regardless of tool selection state for the
  // waiting/minigame/result phases (the line stays visible once it's
  // out); the idle/charging rod-at-cursor preview only draws while the
  // pole is the active tool.
  // Called directly from render_main_loop.js on every single frame the
  // line is out, which itself runs synchronously inside RenderSystem.render()
  // — called from game_loop.js's frame() BEFORE that function reaches its
  // own requestAnimationFrame(frame) call at the very end. This was the one
  // fishing entry point still missing the same protection already added to
  // tick()/frameTick()/releaseCast(): an uncaught throw anywhere in here
  // (canvas draw calls, rope/aim math reading whatever state the cast is
  // currently in) would propagate out of the rAF callback and silently kill
  // the entire render loop — not just fishing, the whole game — with no
  // recovery but a reload. Wrap it the same way; if the current cast's
  // state is bad enough to throw while drawing it, cancelling it is also
  // the safest way to stop it from throwing again next frame.
  function renderWorld(ctx) {
    try {
      _renderWorldInner(ctx);
    } catch (e) {
      console.error('[FishingSystem] renderWorld() threw: cancelling cast to protect the render loop:', e);
      cancelAll();
    }
  }

  function _renderWorldInner(ctx) {
    const poleSelected = typeof InputManager !== 'undefined'
      && InputManager.state && InputManager.state.selectedTool === T.FISHINGPOLE;

    if (phase === 'idle') {
      if (!poleSelected) return;
      const rod = _rodWorldPos();
      const col = Math.floor(rod.x / TILE), row = Math.floor(rod.y / TILE);
      const onWater = typeof WaterSystem !== 'undefined' && WaterSystem.isWater(col, row);
      const canCast = !onWater && !!_nearestWaterInfo(col, row, MIN_LAND_DIST_TO_WATER);
      ctx.save();
      ctx.strokeStyle = onWater ? 'rgba(192,64,64,0.5)' : (canCast ? 'rgba(96,208,192,0.55)' : 'rgba(200,130,60,0.45)');
      ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(rod.x, rod.y, 14, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      _drawRodCursor(ctx, rod.x, rod.y);
      return;
    }

    if (phase === 'charging') {
      const frac = chargeFraction();
      const aim = _aimDirection();
      const distTiles = CAST_DIST_MIN + (CAST_DIST_MAX - CAST_DIST_MIN) * frac;
      const px = chargeAnchorX + aim.dirX * distTiles * TILE;
      const py = chargeAnchorY + aim.dirY * distTiles * TILE;
      const col = Math.floor(px / TILE), row = Math.floor(py / TILE);
      const willHitWater = typeof WaterSystem !== 'undefined' && WaterSystem.isWater(col, row);

      _drawRodAimed(ctx, chargeAnchorX, chargeAnchorY, aim.dirX, aim.dirY);
      const aimTip = _aimedTip(chargeAnchorX, chargeAnchorY, aim.dirX, aim.dirY);
      ctx.save();
      ctx.strokeStyle = willHitWater ? 'rgba(220,235,255,0.45)' : 'rgba(220,120,100,0.4)';
      ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(aimTip.x, aimTip.y); ctx.lineTo(px, py); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = willHitWater ? 'rgba(255,80,64,0.65)' : 'rgba(220,120,100,0.55)';
      ctx.fill();
      ctx.restore();
      return;
    }

    if (phase === 'casting') {
      const bobber = _bobberWorldPos();
      // The hook flies out from the rod tip, not the hand.
      const tip = _rodTip(castStartX, castStartY, bobber.x, bobber.y);
      const t = Math.min(1, castAnimT / castAnimDur);
      const throwDist = Math.hypot(bobber.x - tip.x, bobber.y - tip.y);
      const arcLift = Math.sin(t * Math.PI) * (10 + throwDist * 0.06);
      const hx = tip.x + (bobber.x - tip.x) * t;
      const hy = tip.y + (bobber.y - tip.y) * t - arcLift;

      ctx.save();
      ctx.strokeStyle = 'rgba(220,235,255,0.75)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.beginPath(); ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff5040'; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.restore();
      _drawRodToward(ctx, castStartX, castStartY, bobber.x, bobber.y);
      return;
    }

    if (phase === 'waiting' || phase === 'bite' || phase === 'minigame' || phase === 'result') {
      const rod = _rodWorldPos();
      const b = _bobberWorldPos();
      const bob = Math.sin(_ambientClock / 340) * 2.5;
      const pulling = phase === 'result' && resultGood;
      const hookPos = pulling ? _resultPullPos() : { x: b.x, y: b.y + bob };

      _drawRope(ctx);

      ctx.save();
      if (!pulling) {
        const ripple = (_ambientClock / 900) % 1;
        ctx.strokeStyle = `rgba(180,220,230,${0.35 * (1 - ripple)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(b.x, b.y + 4, 6 + ripple * 10, 0, Math.PI * 2); ctx.stroke();
      }

      ctx.beginPath(); ctx.arc(hookPos.x, hookPos.y, 4.5, Math.PI, 0, false);
      ctx.fillStyle = '#ff5040'; ctx.fill();
      ctx.beginPath(); ctx.arc(hookPos.x, hookPos.y, 4.5, 0, Math.PI, false);
      ctx.fillStyle = '#f0f0f0'; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.arc(hookPos.x, hookPos.y, 4.5, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#c04030'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hookPos.x - 1.5, hookPos.y - 5); ctx.lineTo(hookPos.x - 1.5, hookPos.y - 8); ctx.stroke();
      ctx.restore();

      // The rod bows toward the line: a little while waiting, trembling on a
      // bite, hauled right over through the reel-in, easing as it comes out.
      const bendAmt = phase === 'minigame' ? 7 + Math.sin(_ambientClock / 55) * 2
                    : phase === 'bite'     ? 5 + Math.sin(_ambientClock / 38) * 1.5
                    : phase === 'result'   ? (pulling ? 6 : 1.5)
                    : 2.5;
      _drawRodToward(ctx, rod.x, rod.y, hookPos.x, hookPos.y, { x: hookPos.x, y: hookPos.y, amount: bendAmt });
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────
  // Snapshot of everything TRAITS cares about, taken at the hook when the
  // fish bites.
  function _biteConditions() {
    const e = typeof GridManager !== 'undefined' ? GridManager.getEntity(bobberCol, bobberRow) : null;
    const water = e && e._reservoirId !== undefined ? 'reservoir' : e && e._isRiver ? 'river' : 'lake';
    const dark  = typeof DayNight !== 'undefined' ? DayNight.darkness() : 0;
    const hour  = typeof DayNight !== 'undefined' ? DayNight.hour() : 12;
    const time  = (hour >= 5 && hour < 9) || (hour >= 17 && hour < 20) ? 'twilight' : dark >= 0.7 ? 'night' : 'day';
    const season = (typeof Seasons !== 'undefined' && Seasons.enabled()) ? Seasons.index() : -1;   // -1: seasons off
    const rain  = typeof RainSystem !== 'undefined' && RainSystem.isActive() && !RainSystem.isSnow();
    const smog  = typeof PollutionSystem !== 'undefined' ? PollutionSystem.concAt(bobberCol, bobberRow) : 0;
    return { water, time, season, rain, smog, deepCast: castPower >= DEEP_CAST };
  }

  // Any entity of the given T keys with its centre within r tiles of the hook.
  function _nearHook(types, r) {
    if (typeof EntityRegistry === 'undefined') return false;
    for (const key of types) {
      for (const e of EntityRegistry.getByType(T[key])) {
        const x = e.col + (e.width || 1) / 2, y = e.row + (e.height || 1) / 2;
        if (Math.hypot(x - bobberCol, y - bobberRow) <= r) return true;
      }
    }
    return false;
  }

  function _canBite(f, c) {
    const n = (TRAITS[f.icon] || {}).needs;
    if (!n) return true;
    if (n.time && c.time !== n.time) return false;
    if (n.rain && !c.rain) return false;
    if (n.deepCast && !c.deepCast) return false;
    if (n.notWinter && c.season === 3) return false;
    if (n.near && !_nearHook(n.near.types, n.near.r)) return false;
    return true;
  }

  function _biteWeight(f, c) {
    const t = TRAITS[f.icon] || {};
    let m = 1;
    if (t.water)   m *= t.water.includes(c.water) ? 2 : 0.6;
    if (t.time)    m *= t.time === c.time ? 2.5 : 0.5;
    if (t.seasons && c.season >= 0) m *= t.seasons.includes(c.season) ? 2 : 0.6;
    // Capped so a fish that likes everything about the moment doesn't crowd out the rest.
    m = Math.min(MAX_BITE_BOOST, m);
    // A catch with a scarce requirement is worth chasing once you've met it.
    const n = t.needs;
    if (n && (n.time || n.rain || n.deepCast || n.near)) m *= 2.5;
    // Smog drives fish off and leaves rubbish behind; the hardy few don't mind.
    m *= t.smog ? 1 + Math.min(2, c.smog / 15) : Math.max(0.4, 1 - c.smog / 60);
    return f.weight * m;
  }

  function _pickFish(excludeJunk) {
    const c = _biteConditions();
    let pool = FISH_TABLE.filter(f => !(excludeJunk && f.isJunk) && _canBite(f, c));
    if (!pool.length) pool = FISH_TABLE.filter(f => !f.isJunk);
    const weights = pool.map(f => _biteWeight(f, c));
    const totalW = weights.reduce((s, w) => s + w, 0);
    let roll = Math.random() * totalW;
    for (let i = 0; i < pool.length; i++) {
      if (roll < weights[i]) return pool[i];
      roll -= weights[i];
    }
    return pool[0];
  }

  // Compendium hint: plain-English summary of a catch's TRAITS.
  function habitatHint(icon) {
    const t = TRAITS[icon] || {};
    const SEASON = ['spring', 'summer', 'autumn', 'winter'];
    const WATER  = { river: 'rivers', lake: 'lakes and ponds', reservoir: 'reservoirs' };
    const TIME   = { day: 'by day', night: 'at night', twilight: 'at dawn and dusk' };
    const parts = [];
    const n = t.needs || {};
    if (n.time)      parts.push(`Only bites ${TIME[n.time]}`);
    if (n.rain)      parts.push('Only bites in the rain');
    if (n.deepCast)  parts.push('Only reached with a long, fully charged cast');
    if (n.notWinter) parts.push('Gone in winter');
    if (n.near)      parts.push(n.near.types.includes('NUCLEARREACTOR') ? 'Only found near a nuclear plant' : 'Only found near coal plants');
    if (t.water)     parts.push(`Prefers ${t.water.map(w => WATER[w]).join(' and ')}`);
    if (t.time && !n.time) parts.push(`Bites best ${TIME[t.time]}`);
    if (t.seasons)   parts.push(`Most common in ${t.seasons.map(s => SEASON[s]).join(' and ')}`);
    if (t.smog)      parts.push('More common in polluted water');
    return parts.length ? parts.join('. ') + '.' : 'Bites anywhere, any time.';
  }

  // The first-catch tutorial card walks through exactly what the catch
  // toast reports (fish oil, biofuel, cash), so pin the toast open for as
  // long as that card is up instead of letting it fade after 6s.
  function _catchToastHold() {
    return typeof TutorialSystem !== 'undefined'
        && TutorialSystem.isShowing('fishing', 'fishreward');
  }

  function _resolve(success) {
    _setPhase('result');
    try { ReelInAudio.stop(); } catch (_e) {}
    resultTimer = RESULT_DURATION;
    resultGood = success;
    const fish = currentFish;
    if (success) _showCatchArt(fish, success);
    if (success && fish) {
      _caughtIcons.add(fish.icon);
      const [mLo, mHi] = fish.money;
      // Higher cast power nudges the roll toward the top of both ranges
      const t = Math.random() * (1 - castPower * 0.4) + castPower * 0.4;
      const cash = Math.round(mLo + (mHi - mLo) * t);
      if (typeof Economy !== 'undefined') Economy.spend(-cash);
      if (fish.isJunk) {
        showToast(`🎣 Caught: ${fish.name}! +$${cash.toLocaleString()}`, '#60e0c0', '#04141a', '#104858', null, null, _catchToastHold);
      } else {
        const [lo, hi] = fish.fuel;
        const amount = BiofuelSystem.scaleYield(Math.round(lo + (hi - lo) * t));
        BiofuelSystem.addFuel(amount);
        showToast(`🎣 Caught: ${fish.name}! FISH OIL EXTRACTED: +${amount} BIOFUEL, +$${cash.toLocaleString()}`, '#60e0c0', '#04141a', '#104858', null, null, _catchToastHold);
      }
      try { SFX.thump?.(); } catch (_e) {}
    } else if (fish) {
      try { SFX.splash?.(); } catch (_e) {}   // it slips back into the water
      showToast(fish.isJunk ? `😤 ${fish.name} slipped back into the water.` : `😤 ${fish.name} broke free; no fish oil this time.`, '#a04020', '#0e0400', '#602000');
    } else {
      showToast('🎣 The line went slack; it got away.', '#a04020', '#0e0400', '#602000');
    }
  }

  // Straight-line rod-to-hook distance past MAX_LINE_STRETCH_TILES snaps
  // the line outright — wandering off with the rod shouldn't let you reel
  // in a bite from clear across the map. Mirrors _resolve(false)'s outcome
  // (result phase, no reward) but with its own toast so the failure reads
  // as "you strayed too far" rather than the fish just breaking free.
  function _snapLine() {
    _setPhase('result');
    try { ReelInAudio.stop(); } catch (_e) {}
    resultTimer = RESULT_DURATION;
    resultGood = false;
    // The rope stays live through the result banner for the normal
    // "reel the hook toward the rod" pull animation — but that would just
    // redraw a rope stretching most of the way across the map for the
    // full RESULT_DURATION here, well after the toast already said it
    // snapped. Cut it immediately instead.
    _lineSnapped = true;
    ropePos = null;
    try { SFX.error?.(); } catch (_e) {}
    const fish = currentFish;
    showToast(
      fish
        ? `🎣 Line snapped: too far from the hook! ${fish.name} got away.`
        : `🎣 Line snapped: stay within ${MAX_LINE_STRETCH_TILES} tiles of the hook!`,
      '#a04020', '#0e0400', '#602000'
    );
  }

  function _onBite() {
    _setPhase('bite');
    biteAlertTimer = 0;
    try { SFX.splash?.(); } catch (_e) {}
  }

  function _startMinigame() {
    _setPhase('minigame');
    arrowPos = 0.5;
    arrowVel = 0;
    progress = 0;
    holding  = false;
    // Decided now, not on success — its difficulty tier shapes the
    // minigame itself (tighter zone, harder pull) rather than only
    // mattering after the fact.
    // Guarantee the player's very first catch is a real fish, not junk —
    // keep excluding junk on every cast until something has actually been
    // landed (not just attempted), so a failed first minigame doesn't
    // "use up" the guarantee.
    currentFish = _pickFish(_caughtIcons.size === 0);
    const preset = DIFFICULTY_PRESETS[currentFish.difficulty] || DIFFICULTY_PRESETS[3];
    currentDriftMult = preset.driftMult;
    const [wMin, wMax] = preset.zoneWidth;
    zoneWidth = wMin + Math.random() * (wMax - wMin);
    zoneStart = 0.08 + Math.random() * (0.92 - zoneWidth);
    zoneCenter = zoneTarget = zoneBase = zoneStart + zoneWidth / 2;
    fightClock = 0; fightWarn = 0; fightRun = 0; fightPull = 0;
    fightNext  = 1.5 + Math.random();   // a moment to settle in before the first big move
    if (currentFish.difficulty >= 4) {
      showToast('🐟 Whoa: something big just hit!', '#ffd060', '#1a1204', '#604810');
    }
  }

  // Heavy surges and runner runs: warn, then pull the arrow left for `dur`
  // seconds, then rest for roughly `gap` seconds before the next one.
  function _runCycle(dt, pull, dur, gap) {
    if (fightRun > 0) {
      fightRun -= dt;
      if (fightRun <= 0) fightPull = 0;
    } else if (fightWarn > 0) {
      fightWarn -= dt;
      if (fightWarn <= 0) { fightRun = dur; fightPull = pull; }
    } else if (fightClock >= fightNext) {
      fightWarn = 0.55;
      fightNext = fightClock + 0.55 + dur + gap + Math.random() * 1.5;
    }
  }

  // Per-frame fish behaviour during the minigame — moves the zone and sets
  // fightPull for the arrow (see the fight styles note under TRAITS).
  function _fightTick(dt) {
    const style = (TRAITS[currentFish.icon] || {}).fight || 'calm';
    const d = currentFish.difficulty;
    fightClock += dt;
    const half = zoneWidth / 2, lo = 0.04 + half, hi = 0.96 - half;
    let ease = 2;
    if (style === 'calm') {
      zoneTarget = zoneBase + Math.sin(fightClock * (0.5 + 0.1 * d)) * (0.06 + 0.03 * d);
    } else if (style === 'thrasher') {
      if (fightClock >= fightNext) {
        zoneTarget = zoneCenter + (Math.random() * 2 - 1) * (0.04 + 0.025 * d);
        fightNext = fightClock + 1.3 - 0.12 * d + Math.random() * 0.4;
      }
      ease = 5;
    } else if (style === 'darter') {
      if (fightWarn > 0) {
        fightWarn -= dt;
        if (fightWarn <= 0) {
          // Harder fish dart farther: a short hop at d1, about half the track by d5.
          const reach = 0.1 + 0.06 * d;
          const dir = zoneCenter - reach < lo ? 1 : zoneCenter + reach > hi ? -1 : (Math.random() < 0.5 ? -1 : 1);
          zoneTarget = zoneCenter + dir * reach * (0.6 + Math.random() * 0.4);
          fightNext = fightClock + 4.5 - 0.4 * d + Math.random() * 1.5;
        }
      } else if (fightClock >= fightNext) {
        fightWarn = 0.8 - 0.08 * d;
      }
      ease = 6;
    } else if (style === 'heavy') {
      zoneTarget = zoneBase + Math.sin(fightClock * 0.35) * (0.12 + 0.035 * d);
      ease = 1.2;
      _runCycle(dt, 0.2 + 0.06 * d, 1.2, 4.5 - 0.3 * d);
    } else if (style === 'runner') {
      _runCycle(dt, 0.3 + 0.07 * d, 0.8, 4 - 0.3 * d);
      // A run drags the zone left with it; between runs it drifts back toward the middle.
      if (fightRun > 0) zoneBase -= dt * (0.1 + 0.03 * d);
      else zoneBase += (0.5 - zoneBase) * dt * 0.3;
      zoneBase = Math.max(lo, Math.min(hi, zoneBase));
      zoneTarget = zoneBase + Math.sin(fightClock * 0.7) * (0.04 + 0.02 * d);
      ease = 3;
    } else {   // dead
      ease = 0;
    }
    zoneTarget = Math.max(lo, Math.min(hi, zoneTarget));
    zoneCenter += (zoneTarget - zoneCenter) * Math.min(1, dt * ease);
    zoneCenter = Math.max(lo, Math.min(hi, zoneCenter));
    zoneStart = zoneCenter - half;
  }

  function _beginWaiting() {
    _setPhase('waiting');
    _lineSnapped = false;
    const rod = _rodWorldPos();
    const b   = _bobberWorldPos();
    const tip = _rodTip(rod.x, rod.y, b.x, b.y);   // the line hangs from the rod tip
    _initRope(tip.x, tip.y, b.x, b.y);
    try { SFX.splash?.(); } catch (_e) {}
  }

  // ── Public API ───────────────────────────────────────────────────
  function isActive()          { return phase !== 'idle'; }
  function isCharging()        { return phase === 'charging'; }
  function isMinigameActive()  { return phase === 'minigame'; }

  // col/row = the tile the cursor was over at mousedown (input_manager.js
  // already computes this for the click). Only starts charging if that
  // tile is dry land within reach of water.
  function startCharge(col, row) {
    if (phase !== 'idle') return;
    // Every timer/animation driving a cast (charge meter, throw arc, bite
    // countdown, rope physics, the reel-in minigame) runs on frame-time or
    // sim-time that freezes solid while paused — so a cast started while
    // paused would just sit inert until the player unpaused, which felt
    // like the rod was broken. Simplest fix: don't let one start at all.
    if (typeof DevMode !== 'undefined' && DevMode.timeScale === 0) {
      showToast('🎣 Fishing needs the game unpaused; try again once time is moving', '#a04020', '#0e0400', '#602000');
      return;
    }
    if (typeof WaterSystem !== 'undefined' && WaterSystem.isWater(col, row)) {
      showToast("🎣 Can't cast from inside the water; find the shore!", '#a04020', '#0e0400', '#602000');
      return;
    }
    if (!_nearestWaterInfo(col, row, MIN_LAND_DIST_TO_WATER)) {
      showToast(`🎣 Too far from water; get within ${MIN_LAND_DIST_TO_WATER} tiles of the shore`, '#a04020', '#0e0400', '#602000');
      return;
    }
    _setPhase('charging');
    chargeStart = performance.now() / 1000;
    const rod = _rodWorldPos();
    chargeAnchorX = rod.x; chargeAnchorY = rod.y;
    try { ReelAudio.start(); } catch (_e) {}
  }

  function cancelCharge() {
    if (phase !== 'charging') return;
    _setPhase('idle');
    try { ReelAudio.stop(); } catch (_e) {}
    _hideUI();
  }

  // Sitting at full charge past CAST_HOLD_WINDOW fizzles the cast instead
  // of letting the player camp at max power indefinitely — same outcome
  // as cancelCharge() (back to idle) but with its own toast/SFX so it
  // reads as a distinct failure, not a silent cancel.
  function _failOverheldCharge() {
    if (phase !== 'charging') return;
    _setPhase('idle');
    try { ReelAudio.stop(); } catch (_e) {}
    _hideUI();
    try { SFX.error?.(); } catch (_e) {}
    showToast('🎣 Held it too long; the line went slack, rethrow!', '#a04020', '#0e0400', '#602000');
  }

  // Aborts a cast at any stage — charging, mid-throw, waiting for a bite,
  // or even mid-minigame (the fish just gets to swim free).
  function cancelAll() {
    if (phase === 'idle') return;
    _setPhase('idle');
    holding = false;
    try { ReelInAudio.stop(); } catch (_e) {}
    ropePos = null;
    _lineSnapped = false;
    currentFish = null;
    try { ReelAudio.stop(); } catch (_e) {}
    _hideUI();
  }

  // Aim comes from the drag vector (see _aimDirection); distance from how
  // long LMB was held. The endpoint is a direct hit test — no forgiving
  // "nearest water along the way" fallback anymore, so misjudging either
  // the direction or the distance and landing on grass just fails the cast.
  //
  // Wrapped end-to-end: this runs directly from input_manager.js's mouseup
  // handler and fishing_system.js's own window-level mouseup fallback, and
  // an uncaught throw partway through (e.g. after _setPhase('casting') but
  // before the rest of the cast state is set up) would leave phase stuck
  // off 'idle' forever with nothing left to un-stick it — startCharge()
  // and isActive() both gate on phase, so every future cast attempt would
  // silently no-op until a reload. Fall back to cancelAll() so a rare bug
  // here degrades to "cast lost, try again" instead of a dead rod.
  function releaseCast() {
    if (phase !== 'charging') return;
    try {
      // Same eased value the charge bar displays — keeps the power you
      // actually get in sync with what you watched fill up.
      castPower = chargeFraction();

      const aim = _aimDirection();
      const castDistTiles = CAST_DIST_MIN + (CAST_DIST_MAX - CAST_DIST_MIN) * castPower;
      const targetX = chargeAnchorX + aim.dirX * castDistTiles * TILE;
      const targetY = chargeAnchorY + aim.dirY * castDistTiles * TILE;
      const col = Math.floor(targetX / TILE), row = Math.floor(targetY / TILE);

      if (typeof GridManager !== 'undefined' && !GridManager.inBounds(col, row)) {
        _setPhase('idle');
        try { ReelAudio.stop(); } catch (_e) {}
        showToast('🎣 Cast flew off the edge of the map!', '#a04020', '#0e0400', '#602000');
        return;
      }
      if (typeof WaterSystem === 'undefined' || !WaterSystem.isWater(col, row)) {
        _setPhase('idle');
        try { ReelAudio.stop(); } catch (_e) {}
        showToast('🎣 Cast hit the land; aim it into the water!', '#a04020', '#0e0400', '#602000');
        return;
      }

      bobberCol = col; bobberRow = row;
      castStartX = chargeAnchorX; castStartY = chargeAnchorY;
      castDirX = aim.dirX; castDirY = aim.dirY;
      // Stronger casts trim a bit off the average wait — rewards timing
      // without making a weak cast feel punishing.
      biteWait  = (BITE_WAIT_MIN + Math.random() * (BITE_WAIT_MAX - BITE_WAIT_MIN)) * (1 - castPower * 0.25);
      biteTimer = 0;
      // Weak flick = quick short throw, full-charge cast takes visibly
      // longer to sail all the way out.
      castAnimDur = Math.min(0.85, 0.22 + castDistTiles * 0.03);
      castAnimT   = 0;
      _setPhase('casting');
      try { ReelAudio.stop(); } catch (_e) {}
      try { SFX.cast?.(); } catch (_e) {}
    } catch (e) {
      console.error('[FishingSystem] releaseCast() threw: cancelling cast so the rod stays usable:', e);
      cancelAll();
      showToast('🎣 Something went wrong with that cast; reset, try again', '#a04020', '#0e0400', '#602000');
    }
  }

  // 10Hz logic tick — bite countdown + result banner timing. Uses simDt,
  // so pausing/time-scale naturally pauses the wait like everything else.
  // Safety net: if any phase is ever stuck far longer than it should
  // legitimately take — for whatever reason, known or not — force back to
  // idle rather than leaving the player permanently unable to fish again
  // until a reload. Thresholds are generous multiples of each phase's
  // normal duration so this never fires during ordinary play.
  const WATCHDOG_TIMEOUT_SEC = {
    charging: 15,   // normally resolves within CAST_MAX_CHARGE (~1.2s) + reaction time
    casting:  5,    // normally under 1s
    bite:     10,   // normally BITE_PAUSE (1.6s)
    waiting:  120,  // legitimately up to BITE_WAIT_MAX (45s) — generous buffer beyond that
    minigame: 60,   // player skill varies, but not indefinitely
    result:   10,   // normally RESULT_DURATION (1.8s)
  };

  // Called unconditionally from game_loop.js's 10Hz tick() — NOT wrapped
  // by that caller's own per-system try/catch (_sys()). An uncaught throw
  // here would skip every system scheduled after it for that tick and,
  // depending on the call site, could propagate out of the tick entirely.
  // Catch and fall back to cancelAll() so a rare bug degrades to "cast
  // lost" instead of taking the whole logic tick down with it.
  function tick(dt) {
    try {
      if (phase !== 'idle') {
        _phaseStuckAccum += dt;
        const limit = WATCHDOG_TIMEOUT_SEC[phase];
        if (limit && _phaseStuckAccum > limit) {
          console.warn(`[FishingSystem] watchdog: stuck in phase "${phase}" for ${_phaseStuckAccum.toFixed(1)}s of active game time; resetting so fishing stays usable.`);
          cancelAll();
          showToast('🎣 Something went wrong with that cast; reset, try again', '#a04020', '#0e0400', '#602000');
          return;
        }
      }
      if (phase === 'waiting') {
        biteTimer += dt;
        if (biteTimer >= biteWait) _onBite();
      } else if (phase === 'bite') {
        biteAlertTimer += dt;
        if (biteAlertTimer >= BITE_PAUSE) _startMinigame();
      } else if (phase === 'result') {
        resultTimer -= dt;
        if (resultTimer <= 0) { _setPhase('idle'); ropePos = null; currentFish = null; _hideUI(); }
      }
    } catch (e) {
      console.error('[FishingSystem] tick() threw: cancelling cast so the rod stays usable:', e);
      cancelAll();
    }
  }

  // Per-frame — charge meter, cast-throw animation, and (once a line is
  // out) live rope physics + the tension minigame.
  // Actually disables the fast-forward button (not just making the click
  // a no-op) — greyed out, unclickable, and unfocusable while fishing.
  // Called every frame regardless of phase so it re-enables the instant
  // a session ends, without needing to hook every single phase transition.
  let _ffBtnCache = null;
  function _syncFfLock() {
    if (_ffBtnCache === null) _ffBtnCache = document.getElementById('pb-ff') || false;
    const ff = _ffBtnCache;
    if (!ff) return;
    const lock = isActive();
    if (ff._fishingLocked === lock) return; // avoid redundant DOM writes every frame
    ff._fishingLocked = lock;
    ff.disabled = lock;
    ff.tabIndex = lock ? -1 : 0;
    ff.style.opacity = lock ? '0.35' : '';
    ff.style.pointerEvents = lock ? 'none' : '';
    ff.style.filter = lock ? 'grayscale(70%)' : '';
    ff.style.cursor = lock ? 'not-allowed' : '';
  }

  // Called directly from game_loop.js's frame() — and critically, BEFORE
  // that function reaches its own requestAnimationFrame(frame) call at the
  // very end. An uncaught throw anywhere in here (or in anything it calls:
  // rope physics, canvas drawing, _aimDirection, etc.) would propagate out
  // of the rAF callback and the render loop would simply never reschedule
  // itself — not just fishing breaking, but the ENTIRE game freezing until
  // a reload, which is a much worse failure mode than losing one cast.
  // Wrap the whole thing so a rare bug here can only ever cost the current
  // cast, never the render loop itself.
  function frameTick(frameDt) {
    try {
      _frameTickInner(frameDt);
    } catch (e) {
      console.error('[FishingSystem] frameTick() threw: cancelling cast to protect the render loop:', e);
      cancelAll();
    }
  }

  function _frameTickInner(frameDt) {
    _syncFfLock();
    // Idle bob/ripple should freeze when paused, unlike the charge meter
    // and cast-throw animation which are intentionally wall-clock driven.
    if (typeof DevMode === 'undefined' || DevMode.timeScale !== 0) _ambientClock += frameDt * 1000;
    if (phase === 'idle') return;

    if (phase === 'charging') {
      const elapsed = (performance.now() / 1000) - chargeStart;
      if (elapsed >= CAST_MAX_CHARGE + CAST_HOLD_WINDOW) {
        _failOverheldCharge();
        return;
      }
      const frac = chargeFraction();
      const distTiles = CAST_DIST_MIN + (CAST_DIST_MAX - CAST_DIST_MIN) * frac;
      // Once fully charged, holdWindowLeft counts down from 1 to 0 over
      // CAST_HOLD_WINDOW seconds — null while still charging up so
      // _drawCharge only shows the urgency pulse once it's actually live.
      const holdWindowLeft = frac >= 1 ? Math.max(0, 1 - (elapsed - CAST_MAX_CHARGE) / CAST_HOLD_WINDOW) : null;
      _showOverlay(holdWindowLeft != null ? 'RELEASE NOW!' : 'HOLD TO CHARGE: DRAG TO AIM: RELEASE TO THROW');
      _drawCharge(frac, distTiles, holdWindowLeft);
      return;
    }

    if (phase === 'casting') {
      _hideUI();  // no HUD needed mid-throw — the line itself is the feedback
      castAnimT += frameDt;
      if (castAnimT >= castAnimDur) _beginWaiting();
      return;
    }

    // waiting / bite / minigame / result all keep the line's rope physics
    // live, following wherever the cursor (rod) currently is.
    const rod = _rodWorldPos();
    const b   = _bobberWorldPos();
    const bob = Math.sin(_ambientClock / 340) * 2.5;
    const hookAnchor = (phase === 'result' && resultGood) ? _resultPullPos() : { x: b.x, y: b.y + bob };

    // Only check while the outcome is still undecided — 'result' has
    // already resolved (caught or lost) so wandering during its brief
    // reel-out/toast beat shouldn't retroactively snap a line that's done.
    if (phase === 'waiting' || phase === 'bite' || phase === 'minigame') {
      const stretch = Math.hypot(rod.x - hookAnchor.x, rod.y - hookAnchor.y);
      if (stretch > MAX_LINE_STRETCH_TILES * TILE) {
        _snapLine();
        return;
      }
    }

    // A snapped line has nothing left to animate — otherwise this would
    // silently rebuild a fresh rope (via _updateRope's !ropePos fallback)
    // from wherever the rod currently is, right back to visibly stretching
    // across the map for the rest of the result banner.
    if (!_lineSnapped) {
      const tip = _rodTip(rod.x, rod.y, hookAnchor.x, hookAnchor.y);   // from the rod tip, not the hand
      _updateRope(tip.x, tip.y, hookAnchor.x, hookAnchor.y, frameDt);
    }

    if (phase === 'bite') {
      _showOverlay('GET READY...');
      _drawBiteAlert(biteAlertTimer / BITE_PAUSE);
    } else if (phase === 'minigame') {
      _showOverlay(window.GW_MOBILE ? 'HOLD THE SCREEN TO REEL IN: KEEP THE ARROW IN THE ZONE' : 'HOLD LMB TO REEL IN: KEEP THE ARROW IN THE ZONE');
      _fightTick(frameDt);
      // A run eases off as the arrow nears the left edge, so it can drag
      // you out of the zone but never straight off the track.
      const pull = fightPull * Math.min(1, arrowPos / 0.2);
      const accel = (holding ? HOLD_ACCEL : -DRIFT_ACCEL * currentDriftMult) - pull;
      arrowVel += accel * frameDt;
      arrowVel *= Math.pow(DAMPING, frameDt * 60 / 60);
      arrowVel = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, arrowVel));
      arrowPos += arrowVel * frameDt;

      if (arrowPos <= 0) { arrowPos = 0; arrowVel = 0; _resolve(false); return; }
      if (arrowPos >= 1) { arrowPos = 1; arrowVel = 0; _resolve(false); return; }

      const inZone = arrowPos >= zoneStart && arrowPos <= zoneStart + zoneWidth;
      progress += (inZone ? 1 : -0.5) * frameDt / CATCH_TIME_REQUIRED;
      progress = Math.max(0, Math.min(1, progress));
      if (progress >= 1) { _resolve(true); return; }

      _drawMinigame();
    } else if (phase === 'result') {
      _showOverlay(resultGood ? 'CAUGHT ONE!' : 'IT GOT AWAY...');
      if (ui) {
        const { ctx, canvas } = ui;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = 'center';
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.fillStyle = resultGood ? '#60e0c0' : '#c06040';
        ctx.fillText(resultGood ? '✓' : '✕', canvas.width / 2, canvas.height / 2 + 6);
      }
    }
    // 'waiting' phase: badge already shown by _beginWaiting(), nothing else needed
  }

  // Hold-to-reel input — deliberately window-level (not canvas-scoped) so
  // it works regardless of cursor position once the minigame is up; the
  // canvas's own mouse handlers no-op while isMinigameActive() is true.
  window.addEventListener('mousedown', e => { if (phase === 'minigame' && e.button === 0) { holding = true; try { ReelInAudio.start(); } catch (_e) {} } });
  window.addEventListener('mouseup',   e => {
    if (e.button === 0) { holding = false; try { ReelInAudio.stop(); } catch (_e) {} }
    // Fallback release: input_manager.js's own mouseup handler is scoped
    // to the canvas element, so releasing LMB while the cursor happens to
    // be over the hotbar/a toast/anything else on top of the canvas would
    // otherwise never reach it, leaving the charge stuck forever. This
    // window-level catch-all guarantees it always resolves. releaseCast()
    // itself no-ops if phase isn't 'charging', so this is safe to fire
    // alongside the canvas handler without double-releasing.
    if (e.button === 0 && phase === 'charging') releaseCast();
  });
  window.addEventListener('blur', () => {
    holding = false;
    try { ReelInAudio.stop(); } catch (_e) {}
    // Alt-tabbing away mid-charge fires neither mouseup nor mouseleave —
    // cancel outright rather than leaving the charge stuck until a mouseup
    // eventually happens (or never does).
    if (phase === 'charging') cancelCharge();
  });

  // Missed-release recovery: casting is aimed by dragging the cursor away
  // from a fixed anchor, which is exactly the kind of large mouse movement
  // that can carry the cursor outside the browser viewport while LMB is
  // still held. If the button is released out there, NO mouseup ever
  // reaches the page (not the canvas handler, not the window fallback
  // above) — charging gets stuck forever and every future cast attempt
  // silently no-ops via isActive(), with only a 15s watchdog to eventually
  // recover. `e.buttons === 0` on the next mousemove/mouseover we do
  // receive tells us the button is actually up despite never seeing the
  // mouseup, so treat it as an immediate release instead of waiting.
  function _checkMissedRelease(e) {
    if (e.buttons !== 0) return;
    if (phase === 'charging') releaseCast();
    if (holding) { holding = false; try { ReelInAudio.stop(); } catch (_e) {} }
  }
  window.addEventListener('mousemove', _checkMissedRelease);
  window.addEventListener('mouseover', _checkMissedRelease);

  // (Time-scale locking removed here — see game_loop.js's frame() clamp
  // for the actual fix, and note in devmode.js that DevMode.timeScale is
  // a getter-only accessor over a fully private variable, with the real
  // speed buttons calling the private setSpeed() directly via closure —
  // there is no externally-patchable hook for this at all.)

  return {
    isActive, isCharging, isMinigameActive,
    startCharge, cancelCharge, cancelAll, releaseCast,
    chargeFraction, renderWorld,
    tick, frameTick,

    hasCaughtAny()      { return _caughtIcons.size > 0; },
    hasCaughtIcon(icon)  { return _caughtIcons.has(icon); },
    hasCaughtAllFish()  { return REAL_FISH_ICONS.every(icon => _caughtIcons.has(icon)); },
    hasCaughtAllJunk()  { return JUNK_ICONS.every(icon => _caughtIcons.has(icon)); },
    serialise()  { return [..._caughtIcons]; },
    loadState(icons) { _caughtIcons.clear(); (icons || []).forEach(icon => _caughtIcons.add(icon)); },

    getFishTable() { return FISH_TABLE; },
    habitatHint,
    drawCatchArt(ctx, key) { _drawCatchArt(ctx, key); },
  };
})();
