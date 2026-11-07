/* ═══════════════════════════════════════════════════════════════════
   APOCALYPSE — THE ADVANCED REACTOR'S LAST WORD
   ═══════════════════════════════════════════════════════════════════
   A uranium reactor that melts down levels a neighbourhood and the game
   goes on. A MOX core does not: an Advanced Nuclear Reactor that reaches
   critical ends the save. The whole map burns down over the back half of
   a song, the player watches it happen with the camera taken off them,
   and then they get a GAME OVER screen.

   Nothing here changes WHY it happens. The cause is the ordinary one —
   an uncooled core (or steam with nowhere to go) running the meltdown
   clock to zero, exactly as it does for the MK1. What changes is what
   zero costs.

   ── The score ────────────────────────────────────────────────────
   The sequence is cut to audio/music/Electron.mp3. The detonation lands
   at DETONATE_AT seconds into the track, one second AFTER its climax, so
   the drop hits and the screen whites out a beat later.

     • The song hard-cuts in when the meltdown clock has DETONATE_AT
       seconds left, and from that moment the SONG is the clock: the
       detonation fires off song.currentTime, not the sim, because the
       10 Hz tick drifts ~14% slow on a big map.
     • The city then burns for SEQ_LEN seconds on the sequence's own
       clock. Past the drop the music is just playing: the picture is
       paced for itself, not for the track.

   ── Shape of the sequence ────────────────────────────────────────
     t −90s  core critical. An ordinary emergency card and the usual
             meltdown plate, exactly like a uranium reactor — the player
             can still save it (cool the core → disarm()).
     t −48s  the music slams in. No fade.
     t −30s  the full-screen countdown takes over.
     t   0s  detonation. Input goes away, the camera locks to ground
             zero, the screen goes white then toxic green.
     t 0→S   a shock ring sweeps outward across the whole map. Every
             structure it touches explodes, in distance order, so the
             destruction reads as one expanding front rather than random
             popping. The camera cuts from victim to victim.
     t   S   GAME OVER. Reload a save, or walk the ashes.

   Deliberately NOT reused from LightningDamageSystem's nuke: that one is
   a radius against a building list, resolved inside one tick. This is a
   timeline. The two share the kill primitive (annihilate) and the
   mushroom art (spawnBlastVisual) and nothing else.
   ═══════════════════════════════════════════════════════════════════ */

const ApocalypseSystem = (() => {
  // Where Electron.mp3's climax sits.
  const CLIMAX_SECONDS = 47;
  // Song position at the moment of detonation, one second past the
  // climax. Also how many seconds before zero the music starts.
  const DETONATE_AT    = CLIMAX_SECONDS + 1;
  // The full-screen countdown only covers the last stretch; before that the
  // emergency looks like any other reactor meltdown.
  const DRAMA_SECONDS  = 30;
  // How long the city burns after the detonation, on the sequence's own
  // clock. The music only matters up to the drop; past it the picture is
  // paced for itself, not stretched to the rest of the track (it used to be
  // the track's length minus DETONATE_AT, read off the audio element).
  const SEQ_LEN        = 66;
  const SEQ_FALLBACK   = SEQ_LEN;

  const SONG_SRC   = 'audio/music/Electron.mp3';
  const SCREAM_SRC = 'audio/sfx/screaming.mp3';

  // How long a montage shot holds. A shot is not a fixed length: it stays
  // until the last building inside its frame has gone up (plus a beat to
  // watch it burn), but never more than SHOT_MAX. No shot in the sequence,
  // of any kind, runs longer than that: where the front crosses a frame
  // slowly, a long hold on it reads as the explosion crawling (it used to be
  // 11 seconds). SHOT_MIN is how far ahead a frame is judged for being busy.
  const SHOT_MIN   = 4;
  const SHOT_MAX   = 5;
  // A frame whose buildings have all gone up is left after SHOT_AFTER
  // seconds of watching them burn, and never held less than SHOT_HOLD: the
  // camera's job is to be where the explosions are, and sitting on a
  // finished ruin (while the front ate a street somewhere else) is the
  // thing it must not do.
  const SHOT_HOLD  = 3;
  const SHOT_AFTER = 1.4;
  const SHOT_GAP   = 2.5;    // a lull this long inside a frame ends the shot there
  // World zoom for a montage shot: wide enough to hold a block's worth of
  // buildings on a sparse map, close enough that each blast reads.
  const SHOT_ZOOM  = 0.42;
  // ...and a wider one, taken when the close frame can't be kept busy (the
  // front crossing a thin part of town).
  const SHOT_WIDE  = 0.32;
  // Explosions make noise at most this often — a hundred buildings going up
  // inside a second is a clipped mess, not drama.
  const BOOM_GAP   = 0.9;    // min seconds between blast-front bangs (was 0.28 — ten 3s samples overlapped and clipped)
  // Trees, wires and pipes are cleared in bulk behind the front. Capped per
  // frame so an 8,000-tree map doesn't stall on the frame the ring reaches
  // the forest.
  const SCRUB_CAP  = 140;

  // idle → armed → blast → over → ashes
  let _phase   = 'idle';
  let _core    = null;
  let _gz      = { wx: 0, wy: 0 };
  let _t0      = 0;             // wall-clock seconds at detonation
  let _seq     = SEQ_FALLBACK;
  let _span    = SEQ_FALLBACK;  // the part of _seq the front is actually moving for
  let _maxD    = 1;             // world px from ground zero to the furthest victim
  let _dists   = [];            // every structure's distance from gz, ascending
  let _cityC   = { wx: 0, wy: 0 };
  let _cityR   = 1;
  let _cityHall = null;         // centre of City Hall, for the closing shot

  let _queue   = [];            // { e, at, wx, wy, big } — structures, in death order
  let _next    = 0;
  let _scrub   = [];            // { e, at } — trees/lines, cleared silently
  let _scrubAt = 0;

  let _song    = null;
  let _scream  = null;
  let _songVol = 0.9;
  let _songSync = null;         // { at, t0 } while a mid-track start is settling

  let _shotAt  = 0;             // wall-clock of the current camera shot
  let _shotEnd = 0;             // sequence time the current montage shot ends
  let _closeN  = 0;             // closing shots taken so far
  let _lastShot = null;         // centre of the previous montage shot
  let _shotBox = null;          // the current montage shot's frame, in world px (the follow stays inside it)
  let _followAt = 0;            // sequence time the shot is next re-aimed
  let _lastKillAt = 0;          // sequence time the last building goes up
  let _shotTgt = null;          // { wx, wy }
  let _zoomTgt = 1;
  let _cut     = false;         // next camera update is a hard cut, not a move
  let _act     = 0;             // which act of the shot list is running
  let _booms   = [];            // live per-building blasts for the overlay
  let _lastBoom = 0;
  let _mapDirtyAt = 0;
  let _firesAt = 0;
  let _bakeQ   = [];            // freshly destroyed buildings awaiting a ruin bitmap
  let _reactorsQ = [];          // uranium reactors in the timeline, in death order
  let _reactorShot = null;      // the reactor the camera is currently holding on
  let _ringR   = 0;             // displayed front radius (smoothed)
  let _ringAt  = 0;
  let _flash   = 0;             // 0..1 white-out
  let _stats   = null;

  // The sequence's own clock: wall-clock seconds, minus every stretch spent
  // behind the pause menu. Everything in here that keeps a timestamp reads
  // it from _now(), so holding this one clock holds the whole cut: the
  // front, the kill timeline, the camera shots and the overlays.
  let _holdAt    = null;        // raw seconds the current hold began, or null
  let _heldTotal = 0;
  const _raw = () => performance.now() / 1000;
  const _now = () => (_holdAt != null ? _holdAt : _raw()) - _heldTotal;
  const _el  = () => _now() - _t0;

  // Escape still opens the pause menu once the song is running, and the
  // menu is a real pause: the countdown, the music and the blast all stop
  // behind it and carry on from the same beat when it closes. What stays
  // locked is the playback bar: time cannot be paused or sped up in play.
  const _menuUp = () => !!document.getElementById('pause-menu')?.classList.contains('visible');
  function _scored() { return _phase === 'blast' || (_phase === 'armed' && !!_song); }
  function isHeld()  { return _holdAt != null; }
  function _syncHold() {
    const want = _scored() && _menuUp();
    if (want === isHeld()) return;
    if (want) { _holdAt = _raw(); return; }
    _heldTotal += _raw() - _holdAt;
    _holdAt = null;
    // PauseAudio fades the song out over a few hundred ms before it stops
    // it, so the track ends up that much ahead of the picture. Put the
    // timeline back on the music rather than leave every pause adding to it.
    if (_phase === 'blast' && _song && !_songSync && isFinite(_song.currentTime)) {
      const at = _song.currentTime - DETONATE_AT;
      if (at >= 0 && Math.abs(at - _el()) < 3) _t0 = _now() - at;
    }
  }

  function isActive()    { return _phase === 'blast'; }
  function isArmed()     { return _phase === 'armed'; }
  function isOver()      { return _phase === 'over' || _phase === 'ashes'; }
  // True from detonation onward: the run is finished whatever the player
  // does next, so toasts, notifications and autosaves all stand down.
  function hasEnded()    { return _phase === 'blast' || isOver(); }
  // The cinematic owns the mouse, keyboard and camera, and keeps them while
  // the GAME OVER card is up (including when it is brought back with the
  // recall button). They come back when the player chooses Walk the Ashes:
  // then they can pan and zoom round and look at what they did. What never
  // comes back is building: locksBuild() stays true for the rest of the
  // session, because the map is permanently contaminated.
  function locksInput()  { return _phase === 'blast' || _phase === 'over'; }
  // Once the countdown song is playing, time runs at 1× — no pausing it,
  // no fast-forwarding through it: the whole sequence is cut to the music.
  // After the blast the sim is frozen (detonate sets 0) and stays that way.
  // null = no lock. DevMode.setSpeed and the playback bar both honour this.
  // True while the countdown song (or the aftermath) owns the soundtrack:
  // MusicSystem won't start a track over it.
  function ownsMusic() { return (_phase === 'armed' && !!_song) || hasEnded(); }
  function lockedSpeed() {
    if (_phase === 'armed' && _song) return _menuUp() ? 0 : 1;
    if (hasEnded()) return 0;
    return null;
  }
  function locksBuild()  { return hasEnded(); }

  function _centre(e) {
    const { x, y } = GridManager.tileToWorld(e.col, e.row);
    return { wx: x + (e.width || 1) * TILE / 2, wy: y + (e.height || 1) * TILE / 2 };
  }

  /* ── Arming: the 90 seconds before ────────────────────────────── */

  // Called by MeltdownSystem the moment an Advanced Reactor's core hits
  // 100%. Nothing audible changes yet — the music waits for the last
  // DETONATE_AT seconds (see frame()).
  function arm(core) {
    // Never on a contract job site: a client's reactor cannot end the player's run.
    if (typeof ContractSystem !== 'undefined' && ContractSystem.isAtSite && ContractSystem.isAtSite()) return;
    if (_phase !== 'idle' || !core) return;
    _phase = 'armed';
    _core  = core;

    // The dead city must never reach the player's file. Autosave goes off
    // NOW, not at detonation — the countdown is long enough to cross an
    // autosave tick, and an autosave landing at t−3s would save a world
    // that is already lost.
    try { SaveSystem.stopAutosave?.(); } catch (_e) {}
  }

  // Hard cut from whatever was playing to Electron, at full level. It is
  // meant to be jarring — no fade in.
  function _startSong(at) {
    // Never restart a song that is already running: a rewind would throw
    // the whole cut away.
    if (_song && !_song.paused) return;
    try { MusicSystem.stop?.(); } catch (_e) {}
    try { if (typeof MenuTheme !== 'undefined') MenuTheme.stop?.(); } catch (_e) {}
    _songVol = (typeof MusicSystem !== 'undefined' && MusicSystem.getVolume)
      ? MusicSystem.getVolume() : 1;
    // Starting part-way in (a chain detonation jumps straight to the drop)
    // needs a SEEK, and a seek over HTTP needs Range support — which the
    // static servers this game runs from (python -m http.server) don't
    // have. The browser then silently plays from 0, putting the whole chain
    // path 48 seconds behind its music. So a mid-track start pulls the file
    // into memory first: a blob URL is always seekable. The few ms that
    // takes are made up by _syncSong(), which aims at where the track
    // SHOULD be by now, not where it was asked to start.
    _song = new Audio();
    _song.volume = Math.min(1, _songVol);
    // Time locks to 1× from here (lockedSpeed). Press Play on the playback
    // bar so its own paused / fast-forward state matches.
    try { document.getElementById('pb-play')?.click(); DevMode.setTimeScale(1); } catch (_e) {}
    _songSync = at ? { at, t0: _now() } : null;
    if (!at) {
      _song.src = SONG_SRC;
      _song.play().catch(() => {});
    } else {
      const a = _song;
      fetch(SONG_SRC).then(r => r.blob()).then(b => {
        if (_song !== a) return;             // superseded meanwhile
        a.src = URL.createObjectURL(b);
        a.play().catch(() => {});
      }).catch(() => { a.src = SONG_SRC; a.play().catch(() => {}); });
    }
  }

  // Pull a part-way-started song onto where it should be by now, once the
  // browser can seek it. Clears itself the first frame it finds the track
  // within ¾s of target.
  function _syncSong() {
    // One seek at a time — re-issuing it every frame while the last one is
    // still resolving stalls the element.
    if (!_songSync || !_song || _song.readyState < 1 || _song.seeking) return;
    const want = _songSync.at + (_now() - _songSync.t0);
    if (Math.abs(_song.currentTime - want) > 0.75) { try { _song.currentTime = want; } catch (_e) {} }
    else _songSync = null;
  }

  // Seconds to detonation. The song decides once it is playing; before
  // that it is the meltdown clock, like any other reactor.
  function timeLeft() {
    if (_phase !== 'armed') return null;
    if (_song && isFinite(_song.currentTime)) return Math.max(0, DETONATE_AT - _song.currentTime);
    return MeltdownSystem.timeLeft?.(_core);
  }
  // Inside the last DRAMA_SECONDS: full-screen countdown, doom klaxon.
  function isDramatic() {
    const l = timeLeft();
    return l != null && l <= DRAMA_SECONDS;
  }
  // True once the music is carrying the countdown — MeltdownSystem then
  // leaves the detonation to us rather than firing it off its own clock.
  // (The pause menu pauses the song. That is not the song giving up the
  // clock, or the meltdown timer would fire the blast from behind the menu.)
  function ownsDetonation() { return _phase === 'armed' && !!_song && (!_song.paused || _menuUp()); }

  // The player cooled it in time. Put everything back.
  function disarm() {
    if (_phase !== 'armed') return;
    _phase = 'idle';
    _core  = null;
    // Saved in time: let the song die away slowly, and only bring the normal
    // soundtrack back once it has — the relief should land in the quiet.
    _fadeOut(_song, 6, () => { if (_phase === 'idle' && !_song) { try { MusicSystem.start?.(); } catch (_e) {} } });
    _song = null;
    try { if (SaveSystem.autosaveEnabled?.()) SaveSystem.startAutosave?.(); } catch (_e) {}
  }

  function _fadeOut(a, secs, done) {
    if (!a) { if (done) done(); return; }
    const v0 = a.volume, t0 = _now();
    const step = () => {
      const k = (_now() - t0) / secs;
      if (k >= 1) { try { a.pause(); } catch (_e) {} if (done) done(); return; }
      a.volume = Math.max(0, v0 * (1 - k));
      requestAnimationFrame(step);
    };
    step();
  }

  /* ── Detonation ───────────────────────────────────────────────── */

  // LightningDamageSystem.detonateNuclear hands every Advanced Reactor here
  // instead of doing its own blast, so a chain reaction from someone else's
  // meltdown ends the world the same way a neglected core does.
  function takeOver(core) {
    if (typeof ContractSystem !== 'undefined' && ContractSystem.isAtSite && ContractSystem.isAtSite()) return false;   // a job-site core never ends the run
    if (hasEnded()) return true;        // already ending — swallow the second one
    detonate(core);
    return true;
  }

  function detonate(core) {
    if (typeof ContractSystem !== 'undefined' && ContractSystem.isAtSite && ContractSystem.isAtSite()) return;   // a job-site core never ends the run
    if (hasEnded() || !core) return;
    // A chain detonation never had a countdown, so the song has to jump
    // straight to the drop rather than starting 47 seconds behind the
    // picture.
    if (_phase !== 'armed') arm(core);
    // Detonating EARLY — the countdown song is still short of the drop (a
    // chain blast from another reactor, or anything else that cuts the clock
    // short). Skip the music straight to the explosion so the drop lands
    // with the blast. _startSong's blob path is used rather than a plain
    // currentTime seek, which the static server can't honour (no Range).
    if (_song && !_song.paused && isFinite(_song.currentTime) && _song.currentTime < DETONATE_AT - 0.75) {
      try { _song.pause(); } catch (_e) {}
      _song = null;
    }
    if (!_song || _song.paused) _startSong(DETONATE_AT);
    _phase = 'blast';
    _core  = core;
    _t0    = _now();
    // Permadeath: the world's save files go the moment the core does, not
    // when the card comes up — nothing can be saved from here on (hasEnded()
    // blocks every write), and quitting mid-cutscene must not leave a file.
    if (_permadeath()) {
      try { SaveSystem.deleteWorld(); } catch (err) { console.warn('[APOCALYPSE] permadeath delete failed', err); }
    }
    _gz    = _centre(core);
    _flash = 1;

    _scream = new Audio(SCREAM_SRC);
    _scream.loop = true;
    _scream.volume = 0;      // swells in over the first few seconds
    _scream.play().catch(() => {});

    _silenceTheUI();
    // The logic tick has nothing useful left to compute and plenty to choke
    // on (a dead grid, a bankrupt economy, hundreds of burning ruins), and
    // this is the heaviest frame the game ever draws. Freeze the sim; the
    // animation clock keeps running anyway (game_loop.js checks hasEnded()),
    // so fires, particles and sprites all still move.
    try { DevMode.setTimeScale?.(0); } catch (_e) {}
    _killCore(core);
    _buildTimeline();
    // Buildings from bitmaps for the whole cut, baked ahead of the front in
    // the order they die (see _tickPrebake), so a hard cut to a new street
    // is a blit rather than a screenful of first-time bakes.
    try { BuildingSpriteCache.setPinned?.(true); } catch (_e) {}
    _prebakeAt = 0;
    _wfire = null; _wfireN = 0; _quenchT = null; _quenchAcc = 0; _wireBurn = [];

    // Ground zero: the normal mushroom, twice the MK1's size, with its
    // canned SFX volley suppressed so the music reads. Deliberately NOT
    // scaled to the map — a mushroom 400 tiles across is a green wall, and
    // the first shot of the sequence needs a silhouette in it. The map-wide
    // part of this blast is the front, not the cloud.
    const rTiles = Math.round((LightningDamageSystem.NUKE_RADIUS || 72) * 2);
    LightningDamageSystem.spawnBlastVisual?.(_gz.wx, _gz.wy, rTiles, true);
    // Deliberately NO fallout zone. The ordinary blast zone counts down
    // ("hazardous for 2d") and recovers, and labelling this one with a timer
    // would be a lie — nothing here ever recovers. The map carries no
    // contamination marking at all; locksBuild() is what keeps it unusable.

    // Ground zero: loud, but under the music and clear of clipping once the
    // song's drop and the scream are summed on top.
    SFX.generatorExplosion?.(0.6);
    setTimeout(() => SFX.lightningExplosion?.(0.55), 90);
    setTimeout(() => SFX.thunder?.(0.6), 700);

    Camera.shake?.(170);
    for (const [ms, m] of [[200, 120], [600, 90], [1200, 70], [2200, 50], [3600, 34], [5200, 22]]) {
      setTimeout(() => Camera.shake?.(m), ms);
    }

    // Camera: hard lock on the core, tight, then pull out as the fireball
    // grows. _shotTgt null means "hold ground zero".
    _shotTgt = null;
    _shotAt  = _now();
    _zoomTgt = 1.1;
    _act = 0; _shotEnd = 0; _closeN = 0;

    _stats = {
      city:  (typeof CityInfo !== 'undefined' && CityInfo.getCityName) ? CityInfo.getCityName() : 'Your city',
      co:    (typeof CityInfo !== 'undefined' && CityInfo.getCompanyName) ? CityInfo.getCompanyName() : '',
      day:   (typeof DayNight !== 'undefined' && DayNight.day) ? DayNight.day() : 0,
      pop:   _population(),
      // Buildings, not grid furniture: power poles, power towers and street
      // lamps still go up in the blast, but they are not "buildings lost" —
      // on a real map the pylons alone were more than half the count.
      built: _queue.filter(v => v.e && ![T.POLE, T.POWERTOWER, T.LAMP].includes(v.e.type)).length,
      core:  (core.def?.label || 'Advanced Nuclear Reactor') + (core._num !== undefined ? ` #${core._num}` : ''),
    };
  }

  // The number the player was just looking at in the HUD. Read at the moment
  // of detonation — before anything dies — so the card reports the city as
  // it stood, not the ruin.
  function _population() {
    try {
      const el = document.getElementById('stat-population');
      if (el) return parseInt(el.textContent.replace(/[^0-9]/g, ''), 10) || 0;
    } catch (_e) {}
    return 0;
  }

  // Everything that wants to talk to the player is wrong now. Toasts about
  // outages and unpaid upkeep during the end of the world are comedy, not
  // drama — showToast and NotificationStack.push both check hasEnded().
  function _silenceTheUI() {
    try { clearToasts?.(); } catch (_e) {}
    try { NotificationStack.clearAll?.(); } catch (_e) {}
    for (const tag of ['meltdown', 'lightningdamage', 'contam', 'blackout', 'burnout']) {
      try { NotificationStack.dismissTag?.(tag); } catch (_e) {}
    }
    try { EntityInfoPanel.close?.(); } catch (_e) {}
    try { InspectionPanel.close?.(); } catch (_e) {}
    try { WorldMapSystem.close?.(); } catch (_e) {}   // and it can't be opened again (WorldMapSystem.open)
    document.body.classList.add('apocalypse');
  }

  function _killCore(core) {
    core._rodBuffer = 0; core._generating = false; core._currentOutput = 0;
    core._coreHeat = 0; core._steamPressure = 0; core._meltdown = 0;
    LightningDamageSystem.annihilate?.(core);
  }

  /* ── The timeline ─────────────────────────────────────────────── */

  // Every structure on the map gets a death time proportional to how far it
  // stands from ground zero, so the destruction is one visible front moving
  // outward. Trees and the pipe/wire/belt stack go on a separate silent list
  // — they're scenery, and giving 9,000 trees their own explosion each would
  // drown the buildings that matter.
  function _buildTimeline() {
    _queue = []; _scrub = []; _next = 0; _scrubAt = 0;
    const SKIP = new Set([T.PIPE, T.UNDERGNDPIPE, T.WIRE, T.CONVEYOR, T.ROAD, T.TREE, T.BUSH]);

    let maxD = 1;
    const rows = [];
    // The registry AND the grid. A save can carry buildings that sit on the
    // grid but have fallen out of EntityRegistry — City Hall, a row of
    // industrial and two refineries on the ParkBlark save. Walking only the
    // registry left exactly those standing, untouched, in the middle of a
    // flattened city. One full grid scan at the moment of detonation is
    // cheap next to the minute that follows it.
    const all = new Set(EntityRegistry.all());
    const tiles = GridManager.tiles;
    for (let r = 0; r < tiles.length; r++) {
      const row = tiles[r];
      for (let c = 0; c < row.length; c++) { const e = row[c]; if (e) all.add(e); }
    }
    for (const e of all) {
      // City Hall anchors the closing shot. Found here, from the grid, because
      // on some saves it is one of the buildings missing from the registry.
      if (!_cityHall && (e.type === T.GOVBUILDING || e.type === T.TOWNHALL)) _cityHall = _centre(e);
      if (e === _core || e._irreparable) continue;
      // Only things that can burn are on the timeline: buildings, and the
      // trees and line stack (SKIP) the front clears. Water, deposits and
      // the like are left alone. They used to be lumped in with the
      // scenery and "annihilated", which set every lake and river tile on
      // fire: 15,000+ full building blazes on one city, most of the lag in
      // the sequence and the strangest thing on screen.
      // Water catches too, as a burning surface (_igniteWater), not as a
      // building fire per tile.
      const scenery = SKIP.has(e.type) || e.type === T.WATER;
      if (!scenery && !LightningDamageSystem.isFlammable?.(e)) continue;
      const c = _centre(e);
      const d = Math.hypot(c.wx - _gz.wx, c.wy - _gz.wy);
      if (d > maxD) maxD = d;
      rows.push({ e, d, c, scenery });
    }
    _maxD = maxD;
    // The front's run, out of the whole cut: about three-quarters, leaving
    // the last stretch to the closing shots over the dead city. (It was 92%,
    // and the front read as slow.)
    _span = _seq * 0.72;

    const structures = rows.filter(r => !r.scenery).sort((a, b) => a.d - b.d);
    _dists = structures.map(r => r.d);

    // Schedule by DISTANCE, so the front moves out at one steady speed.
    //
    // It used to be by rank (the i-th nearest building died at i/n of the
    // way through), which kept the explosions per second steady and made
    // the front's SPEED follow the city's density instead: a crawl through
    // the dense blocks (the shots it lingered on read as slow motion) and a
    // dash across the thin parts. Rank was there because a plain distance
    // sweep measured to the furthest thing on the map (a tree in a far
    // corner) put the whole city in the first third of the song. So the
    // sweep is measured to the city's own edge instead: the 97th-percentile
    // building (pylons, poles and masts left out, or a line run out to a far
    // deposit would set it). That edge is reached at FRONT_EDGE of the span,
    // as the song builds to its end; the few outliers past it go in the tail.
    const bld = structures.filter(s => !_INFRA.has(s.e.type));
    const ref = bld.length ? bld : structures;
    _dEdge = ref.length ? Math.max(TILE * 10, ref[Math.floor((ref.length - 1) * 0.97)].d) : TILE * 10;
    _dLast = Math.max(_dEdge + TILE, structures.length ? structures[structures.length - 1].d : 0);
    for (let i = 0; i < structures.length; i++) {
      const r = structures[i];
      const big = (r.e.width || 1) * (r.e.height || 1) >= 25;
      _queue.push({
        e: r.e, at: _timeForDist(r.d) + Math.random() * 0.35,
        wx: r.c.wx, wy: r.c.wy, big, d: r.d,
        ang: Math.atan2(r.c.wy - _gz.wy, r.c.wx - _gz.wx),
      });
    }
    // Scenery goes when the front passes it — same clock, found by where
    // its distance falls in the structure list.
    for (const r of rows) {
      if (!r.scenery) continue;
      _scrub.push({ e: r.e, at: _timeForDist(r.d) });
    }
    _queue.sort((a, b) => a.at - b.at);
    _scrub.sort((a, b) => a.at - b.at);
    _lastKillAt = _queue.length ? _queue[_queue.length - 1].at : 0;
    _reactorsQ = _queue.filter(v => v.e?.type === T.NUCLEARREACTOR);

    // Where the city actually is, for the establishing and closing shots —
    // ground zero is one building in it, not its centre.
    //
    // Measured on the buildings only (no pylons, poles or masts) and to the
    // 88th-percentile distance rather than the furthest one. A single well
    // or a pylon run heading off to a far deposit otherwise sets the "city
    // size", and the closing shot zooms out until the actual city is a
    // postage stamp in the middle of empty map.
    const core = structures.filter(s => !_INFRA.has(s.e.type));
    const pts = core.length ? core : structures;
    let sx = 0, sy = 0;
    for (const s of pts) { sx += s.c.wx; sy += s.c.wy; }
    _cityC = pts.length ? { wx: sx / pts.length, wy: sy / pts.length } : { ..._gz };
    const ds = pts.map(s => Math.hypot(s.c.wx - _cityC.wx, s.c.wy - _cityC.wy)).sort((a, b) => a - b);
    const rad = ds.length ? ds[Math.min(ds.length - 1, Math.floor(ds.length * 0.88))] : 0;
    _cityR = Math.max(TILE * 40, rad);
  }

  // When the front reaches a given distance, and the radius it has reached
  // at a given time: inverses of each other, so the ring the player sees is
  // exactly the line the deaths are on. A constant speed out to the city's
  // edge (_dEdge, reached at FRONT_EDGE of the span), then the stragglers
  // out to the last building in what is left of it.
  const FRONT_EDGE = 0.92;
  let _dEdge = 1, _dLast = 1;
  function _timeForDist(d) {
    if (d <= _dEdge) return _span * FRONT_EDGE * Math.max(0, d) / _dEdge;
    return _span * (FRONT_EDGE + (1 - FRONT_EDGE) * Math.min(1, (d - _dEdge) / (_dLast - _dEdge)));
  }
  function _frontRadius(el) {
    if (!_dists.length) return 0;
    // Past the last building the front keeps going to the map edge, so the
    // closing shot isn't a ring frozen around the outermost ruin.
    if (el >= _span) return _maxD;
    const u = Math.max(0, el / _span);
    if (u <= FRONT_EDGE) return _dEdge * u / FRONT_EDGE;
    return _dEdge + (_dLast - _dEdge) * (u - FRONT_EDGE) / (1 - FRONT_EDGE);
  }
  // Clip for what lives on the map — people, cars, animals: they are gone
  // wherever the front has passed. Before detonation: nothing to do (returns
  // true, draw as normal). During the blast: clips `ctx` to outside the front
  // (the caller has saved it) and returns true. After: returns false, draw
  // nothing — the city is dead.
  function clipLiving(ctx) {
    if (!hasEnded()) return true;
    if (_phase !== 'blast') return false;
    const r = _frontRadius(_el());
    if (r <= 0) return true;
    const p = new Path2D();
    p.rect(_gz.wx - 1e6, _gz.wy - 1e6, 2e6, 2e6);
    p.arc(_gz.wx, _gz.wy, r, 0, Math.PI * 2);
    ctx.clip(p, 'evenodd');
    return true;
  }

  // The ring as drawn: the front radius low-passed so it glides. It only
  // ever grows, and trails the true front by a fraction of a second at most.
  function _smoothRing(el) {
    const target = _frontRadius(el);
    const dt = Math.max(0, Math.min(0.1, el - _ringAt));
    _ringAt = el;
    if (target > _ringR) _ringR += (target - _ringR) * Math.min(1, dt * 4);
    return _ringR;
  }

  /* ── Per-frame ────────────────────────────────────────────────── */

  // Driven from the render frame on WALL-CLOCK time, not sim time: the
  // sequence is cut to a song, and a song does not care about the game's
  // speed multiplier or how long a tick took.
  function frame(dtWall) {
    // Real frame length (game_loop.js lets it run to 0.25s under this
    // sequence), so the flash, the camera moves and the overlays keep wall
    // time with the front even when a frame runs long.
    const dt = Math.min(0.25, Math.max(0, dtWall || 0));
    _syncHold();
    if (isHeld()) return;
    _syncSong();
    // The countdown's only job here is to bring the song up. It starts
    // silent so the cut from the normal soundtrack isn't a jolt, and takes
    // about four seconds to reach level — which is still 43 seconds of
    // build before anything happens.
    if (_phase === 'armed') {
      // The music slams in with DETONATE_AT seconds on the meltdown clock.
      if (!_song) {
        const left = MeltdownSystem.timeLeft?.(_core);
        if (left != null && left <= DETONATE_AT) _startSong(Math.max(0, DETONATE_AT - left));
        return;
      }
      // THE SONG IS THE CLOCK.
      //
      // MeltdownSystem's countdown advances by simDt on a 10 Hz tick, and on
      // a big map those ticks fall behind — measured ~14% slow on a 30,000
      // entity save, which would land the detonation a dozen seconds past
      // the drop. The whole point of this sequence is that it is cut to the
      // track, so the track decides when zero is; the meltdown clock is left
      // running underneath purely so the reactor's own state stays sane, and
      // detonate() is idempotent if it gets there first.
      if (_song.currentTime >= DETONATE_AT) detonate(_core);
      return;
    }
    if (isOver()) { if (!_menuUp()) { _tickQuench(dt); _tickWireBurn(); } return; }
    if (_phase !== 'blast') return;
    const el = _el();

    _flash = Math.max(0, _flash - dt * 1.6);
    if (_scream && _scream.volume < 0.5) _scream.volume = Math.min(0.5, _scream.volume + dt * 0.25);
    if (_scream) _scream.muted = typeof SFX !== 'undefined' && SFX.getVolume ? !(SFX.getVolume() > 0) : false;   // SFX at 0: silent

    _tickKills(el);
    _tickScrub(el);
    _tickWireBurn();
    _tickTrucks(el);
    _tickPrebake();
    // Ruin bitmaps, ~3ms a frame at most.
    const b0 = performance.now();
    while (_bakeQ.length && performance.now() - b0 < 3) LightningDamageSystem.prebakeRuin?.(_bakeQ.shift());
    // One rebuild of the fire lists at the start (picks up whatever was
    // already burning); from then on annihilate()/igniteWire() add to them.
    if (!_firesAt) { _firesAt = _now(); LightningDamageSystem.refreshFireLists?.(); }
    _tickCamera(el, dt);

    for (let i = _booms.length - 1; i >= 0; i--) if (el - _booms[i].t0 > 2.2) _booms.splice(i, 1);

    if (el >= _seq) _showGameOver();
  }

  function _tickKills(el) {
    let killed = 0;
    while (_next < _queue.length && _queue[_next].at <= el) {
      const v = _queue[_next++];
      const e = v.e;
      if (!e || e._irreparable) continue;
      LightningDamageSystem.annihilate?.(e, v.ang);
      _bakeQ.push(e);
      // A uranium reactor caught by the front still goes up as a reactor —
      // its own full mushroom, not a building-sized pop.
      if (e.type === T.NUCLEARREACTOR) { _reactorBlast(v); continue; }
      // Pylons, poles and lamps pop small; they are half the structures on
      // some maps, and a full cook-off each buried the buildings. (No
      // Particles bursts any more: at montage zoom each particle was a
      // one-pixel square under the cook-off, and a block going up queued
      // thousands of them.)
      _booms.push({ wx: v.wx, wy: v.wy, t0: el, big: v.big, small: _INFRA.has(e.type), ang: v.ang, seed: Math.random() * 1000 });
      // Rate-limited so a dense block going up together is one bang, not
      // forty overlapping copies of the same 3-second sample.
      if (el - _lastBoom > BOOM_GAP) {
        _lastBoom = el;
        SFX.generatorExplosion?.(v.big ? 0.4 : 0.22);
        if (v.big) Camera.shake?.(26);
      }
      if (++killed > 60) break;     // never spend a whole frame killing
    }
    if (killed) PowerNetwork.recomputeWireHops?.();
  }

  // The ordinary nuclear detonation's visual (mushroom, embers, scar) at
  // full MK1 size, with this sequence's own audio — the canned volley in
  // spawnBlastVisual is suppressed, same as at ground zero, so the music
  // still reads. Not rate-limited by BOOM_GAP: a reactor always gets its
  // bang, and there are only ever a handful of them.
  function _reactorBlast(v) {
    LightningDamageSystem.spawnBlastVisual?.(v.wx, v.wy, LightningDamageSystem.NUKE_RADIUS || 72, true);
    _booms.push({ wx: v.wx, wy: v.wy, t0: _el(), big: true });
    _flash = Math.max(_flash, 0.55);
    SFX.generatorExplosion?.(0.5);
    setTimeout(() => SFX.lightningExplosion?.(0.45), 90);
    setTimeout(() => SFX.thunder?.(0.5), 600);
    Camera.shake?.(110);
    for (const [ms, m] of [[250, 70], [800, 45], [1600, 28]]) setTimeout(() => Camera.shake?.(m), ms);
  }

  // Trees, bushes and lines the front has passed. Budgeted by TIME (at least
  // SCRUB_CAP a frame): every tree beyond the outermost building is scheduled
  // for the same last few seconds, and at the frame rate this scene runs at
  // on a big map a flat 140/frame left the outer forest standing when the
  // sequence handed over to GAME OVER. `el` = Infinity drains everything
  // (see _flushScrub).
  const SCRUB_BUDGET_MS = 4;
  function _tickScrub(el) {
    let n = 0;
    const t0 = performance.now();
    while (_scrubAt < _scrub.length && _scrub[_scrubAt].at <= el && (n < SCRUB_CAP || performance.now() - t0 < SCRUB_BUDGET_MS)) {
      const e = _scrub[_scrubAt++].e;
      n++;
      if (!e) continue;
      if (e.type === T.TREE || e.type === T.BUSH) {
        if (GridManager.getEntity(e.col, e.row) === e) GridManager.removeEntity(e.col, e.row, { wholeStack: true });
        EntityRegistry.remove(e);
      } else if (e.type === T.WATER) {
        _igniteWater(e);
      } else if (LightningDamageSystem.isWire?.(e)) {
        // Power lines catch fire as the front passes rather than being wiped
        // — a web of burning cable across the ruins is half the picture —
        // and burn away a few seconds later (_tickWireBurn). The game's own
        // burn timer never runs down here (the sim is frozen), which left
        // every cable on the map standing with a flame on it for good.
        if (LightningDamageSystem.igniteWire?.(e)) _wireBurn.push({ w: e, out: _el() + WIRE_BURN_MIN + Math.random() * WIRE_BURN_VAR });
      } else if (e.type === T.ROAD) {
        // Broken up, and a bridge dropped into the water.
        const c = _centre(e);
        LightningDamageSystem.wreckRoad?.(e, Math.atan2(c.wy - _gz.wy, c.wx - _gz.wx));
      } else {
        // Pipes and belts are scorched to rubble, not set burning: each tile
        // used to get a whole building's blaze (smoke column, flames, embers),
        // two thousand of them on a mid-sized city, and a pipe run is not a
        // fire. The burning wires carry that picture.
        LightningDamageSystem.scorch?.(e);
      }
    }
    // Once a second is plenty for a minimap nobody is looking at, and the
    // rebuild is expensive on a 30,000-entity map.
    if (n && typeof WorldMapSystem !== 'undefined' && _now() - _mapDirtyAt > 1) {
      _mapDirtyAt = _now();
      WorldMapSystem.invalidate?.();
    }
  }

  // ── Burning cable ──
  // Each burning span goes, WIRE_BURN_MIN..+VAR seconds after it caught: off
  // the map, handing its tile to whatever it was strung over (a pipe or belt,
  // scorched to rubble like the rest of the line stack, or the lake).
  const WIRE_BURN_MIN = 4, WIRE_BURN_VAR = 6, WIRE_BURN_MS = 3;
  let _wireBurn = [];
  function _tickWireBurn() {
    if (!_wireBurn.length) return;
    const now = _el(), t0 = performance.now();
    const L = LightningDamageSystem;
    for (let i = _wireBurn.length - 1; i >= 0; i--) {
      if (_wireBurn[i].out > now) continue;
      const w = _wireBurn[i].w;
      _wireBurn[i] = _wireBurn[_wireBurn.length - 1]; _wireBurn.pop();
      L.clearWireFire?.(w);
      if (GridManager.getEntity(w.col, w.row) === w) {
        GridManager.removeEntity(w.col, w.row);
        const low = GridManager.getEntity(w.col, w.row);
        if (low && low !== w && low.type !== T.WATER) L.scorch?.(low);
      } else {
        EntityRegistry.remove(w);
      }
      if (performance.now() - t0 > WIRE_BURN_MS) break;   // the rest next frame
    }
  }

  // ── Burning water ──
  // Lakes and rivers go up as the front passes: tongues of flame streaming
  // up off the surface, white-hot at the root and cooling to red, with
  // smoke rolling off them. The look is the building fires' (the flame
  // tongues of LightningDamageSystem.renderDamage), and it used to come
  // from setting every water tile alight AS a building: each with soot,
  // seat glows, a smoke column, flames, embers and a strike badge, tens of
  // thousands of them, most of the sequence's frame time. Here each burning
  // tile is one flag; only the tiles on screen are drawn, each with a small
  // flame of its own (that per-tile look is the point), and they skip the
  // soot, seats, embers and badge.
  let _wfire = null, _wfireAt = null, _wfireN = 0;
  function _igniteWater(e) {
    if (!_wfire) { _wfire = new Uint8Array(COLS * ROWS); _wfireAt = new Float32Array(COLS * ROWS); }
    const i = e.row * COLS + e.col;
    if (i < 0 || i >= _wfire.length || _wfire[i]) return;
    _wfire[i] = 1; _wfireAt[i] = _el(); _wfireN++;
  }
  // ── The fires going out ──
  // Walking the ashes, the city burns itself out over FIRE_OUT_HOURS game
  // hours, four times as fast in rain. The sim is frozen for good, so this
  // runs on the sequence's own clock (a game hour's worth of real seconds
  // per hour). Every ruin, burning cable and patch of burning water goes out
  // at its own moment across that span (_outFrac, fixed per tile), smoulders
  // and goes cold; water that has burned off is left a dry, cracked bed.
  const FIRE_OUT_HOURS = 2, RAIN_SPEEDUP = 4, WATER_OUT_SECS = 4, COLD_AFTER = 40;
  let _quenchT = null, _quenchAcc = 0;   // seconds of burning-down so far (null: not started)
  const _quenchSpan = () => FIRE_OUT_HOURS * ((typeof DayNight !== 'undefined' && DayNight.secondsPerGameHour?.()) || 50);
  const _outFrac = (c, r) => 0.1 + 0.9 * ((((c * 2246822519) ^ (r * 3266489917)) >>> 0) / 4294967296);
  // Seconds since tile (c,r)'s fire went out, or < 0 while it still burns.
  const _outFor = (c, r) => _quenchT == null ? -1 : _quenchT - _outFrac(c, r) * _quenchSpan();
  function _raining() {
    try { return typeof RainSystem !== 'undefined' && RainSystem.level && RainSystem.level() > 0.05 && !(RainSystem.isSnow && RainSystem.isSnow()); }
    catch (_e) { return false; }
  }
  function _tickQuench(dt) {
    if (_quenchT == null || dt <= 0) return;
    const step = dt * (_raining() ? RAIN_SPEEDUP : 1);
    _quenchT += step;
    // The ruins are a few thousand entities; four passes a second is plenty.
    _quenchAcc += step;
    if (_quenchAcc < 0.25) return;
    const d = _quenchAcc; _quenchAcc = 0;
    const L = LightningDamageSystem, fade = L.SMOULDER_FADE || 20;
    for (const e of L.getDamaged?.() || []) {
      if (!e._lightningDamaged || e._ashCold) continue;
      if (!e._fireOut) {
        if (_outFor(e.col, e.row) < 0) continue;
        e._fireOut = true; e._smoulderT = 0;
        continue;
      }
      e._smoulderT = (e._smoulderT || 0) + d;
      if (e._smoulderT > fade + COLD_AFTER) e._ashCold = true;
    }
    for (const w of L.getBurningWires?.() || []) {
      if (w._wireOnFire && _outFor(w.col, w.row) >= 0) L.clearWireFire?.(w);
    }
  }

  // A dry lake bed: cracked, sun-baked mud, as one pattern several tiles
  // across (so it doesn't visibly repeat tile by tile), wrapping seamlessly.
  const DRY_REP = 4;   // tiles per side of the pattern
  let _dryPat = null;
  function _dryPattern(ctx) {
    if (_dryPat) return _dryPat;
    const S = TILE * DRY_REP;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    let s = 1013;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    // Drawn at every wrapped offset, so a speck or crack across the edge
    // carries on from the other side.
    const wrap = (fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.save(); g.translate(ox, oy); fn(); g.restore(); } };
    g.fillStyle = '#5e5040'; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 26 * DRY_REP * DRY_REP; k++) {
      const col = rnd() < 0.5 ? 'rgba(40,32,24,0.18)' : 'rgba(140,120,96,0.16)';
      const x = rnd() * S, y = rnd() * S, rr = 2 + rnd() * 6;
      wrap(() => { g.fillStyle = col; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill(); });
    }
    // Cracks: jagged lines wandering right across, into a network of plates.
    g.strokeStyle = 'rgba(28,22,16,0.75)'; g.lineWidth = 1.2; g.lineJoin = 'round';
    for (let k = 0; k < 3 * DRY_REP; k++) {
      const horiz = k % 2 === 0, steps = 5 * DRY_REP;
      const pts = [];
      let x = horiz ? 0 : rnd() * S, y = horiz ? rnd() * S : 0;
      pts.push(x, y);
      for (let n = 1; n <= steps; n++) {
        if (horiz) { x = S * n / steps; y += (rnd() - 0.5) * 10; }
        else       { y = S * n / steps; x += (rnd() - 0.5) * 10; }
        pts.push(x, y);
      }
      wrap(() => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); });
    }
    return (_dryPat = ctx.createPattern(cv, 'repeat'));
  }
  // Each dry tile is filled a little past its edges with rounded corners:
  // together they make one shape that follows the baked shoreline (which is
  // the water tiles' outline smoothed, rounded at the corners and wobbled by
  // a few pixels) instead of the tile grid's staircase, and covers the water
  // that wobble pushes out past the tiles.
  // (DRY_ROUND kept under DRY_OVER·√2/(√2−1), about 3.4 × DRY_OVER, so where
  // four dry tiles meet the rounding never opens a pinhole at the shared corner.)
  const DRY_OVER = 0.2, DRY_ROUND = 0.42;   // in tiles
  // Radius of the fill at an inside corner of the shore, in tiles: on a
  // diagonal shore the smoothed waterline runs about this far into the land
  // tile's corner.
  const DRY_FILLET = 0.6;

  // The dry bed, drawn in the water layer (straight after the water itself,
  // under the ruins: render_main_loop.js), so a ruin standing in a lake keeps
  // its own picture and the water under it dries with the rest. Every water
  // tile dries, burning or not -- under a ruined extractor, a dam or a cable
  // too -- at its tile's moment (as its fire goes out), fading in over
  // WATER_OUT_SECS. Bucketed by how far along it is, so the dried-out
  // majority is one fill of one path.
  const _dryPts = [];
  function renderDryBed(ctx, cS, cE, rS, rE) {
    if (_quenchT == null || !_wfire) return;
    const dry = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS && WaterSystem.isWater(c, r) && _outFor(c, r) >= 0;
    _dryPts.length = 0;
    for (let r = Math.max(0, rS); r < Math.min(ROWS, rE); r++)
      for (let c = Math.max(0, cS); c < Math.min(COLS, cE); c++) {
        if (!WaterSystem.isWater(c, r)) continue;
        const out = _outFor(c, r);
        if (out >= 0) _dryPts.push(c, r, Math.min(1, out / WATER_OUT_SECS));
      }
    if (!_dryPts.length) return;
    const BUCKETS = 5, paths = [];
    const o = TILE * DRY_OVER, sz = TILE + o * 2, rad = TILE * DRY_ROUND, fil = TILE * DRY_FILLET;
    for (let p = 0; p < _dryPts.length; p += 3) {
      const b = Math.min(BUCKETS - 1, Math.floor(_dryPts[p + 2] * BUCKETS));
      const path = paths[b] || (paths[b] = new Path2D());
      const c = _dryPts[p], r = _dryPts[p + 1];
      const x = c * TILE - o, y = r * TILE - o;
      if (path.roundRect) path.roundRect(x, y, sz, sz, rad); else path.rect(x, y, sz, sz);
      // An inside corner (dry beside and below/above, land on the diagonal):
      // the baked water curves into the land tile there, so fill the curve.
      for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
        if (!dry(c + dx, r) || !dry(c, r + dy) || dry(c + dx, r + dy)) continue;
        const vx = (c + (dx > 0 ? 1 : 0)) * TILE, vy = (r + (dy > 0 ? 1 : 0)) * TILE;
        path.moveTo(vx + fil, vy);
        path.arc(vx, vy, fil, 0, Math.PI * 2);
      }
    }
    ctx.save();
    ctx.fillStyle = _dryPattern(ctx);
    for (let b = 0; b < BUCKETS; b++) {
      if (!paths[b]) continue;
      ctx.globalAlpha = (b + 1) / BUCKETS;
      ctx.fill(paths[b]);
    }
    ctx.restore();
  }

  const _wfPts = [];
  function _renderWaterFire(ctx, el, t) {
    if (!_wfireN) return;
    const L = LightningDamageSystem;
    const z = Camera.zoom || 1;
    const c0 = Math.max(0, Math.floor(Camera.x / TILE) - 2), r0 = Math.max(0, Math.floor(Camera.y / TILE) - 1);
    const c1 = Math.min(COLS - 1, Math.ceil((Camera.x + window.innerWidth / z) / TILE) + 2);
    const r1 = Math.min(ROWS - 1, Math.ceil((Camera.y + window.innerHeight / z) / TILE) + 4);
    // Every tile burns as a little fire of its own — the look the water had
    // when each tile was set alight as a building, without the building
    // fire's soot, seats, smoke column and badge. [c, r, age, strength].
    _wfPts.length = 0;
    for (let r = r0; r <= r1; r++) {
      const row = r * COLS;
      for (let c = c0; c <= c1; c++) {
        if (!_wfire[row + c]) continue;
        const out = _outFor(c, r);
        const k = out < 0 ? 1 : 1 - out / WATER_OUT_SECS;
        if (k > 0) _wfPts.push(c, r, el - _wfireAt[row + c], k);
      }
    }
    if (!_wfPts.length) return;
    ctx.save();
    // Wide out a tongue is a few pixels tall: the bed of fire and its light.
    const lite = z < 0.3 || _wfPts.length > 6000;
    const wind = (typeof WindState !== 'undefined' && WindState.speed) || 0.3;
    const glow = L.fireGlow ? L.fireGlow() : null;
    // Smoke off a few of them, behind the flames.
    if (!lite) {
      for (let p = 0; p < _wfPts.length; p += 4) {
        const c = _wfPts[p], r = _wfPts[p + 1];
        const h = (((c * 73856093) ^ (r * 19349663)) >>> 0) / 4294967296;
        if (h > 0.07) continue;
        const sx = (c + 0.5) * TILE, sy = (r + 0.5) * TILE - TILE * 0.4;
        const ph = h * 400;
        for (let k = 0; k < 3; k++) {
          const u = ((t * 0.22 + ph + k / 3) % 1 + 1) % 1;
          const rr = TILE * (0.4 + 1.1 * Math.pow(u, 0.75));
          const a = 0.6 * Math.min(1, u * 6) * Math.pow(1 - u, 1.2) * Math.min(1, _wfPts[p + 2] / 1.5) * _wfPts[p + 3];
          if (a <= 0.01) continue;
          ctx.globalAlpha = a;
          ctx.drawImage(L.smokeBillow(Math.max(0, 1 - u * 2.6), u * 0.45),
            sx + (0.35 + wind) * u * u * TILE * 2.4 - rr, sy - u * TILE * 5 - rr, rr * 2, rr * 2);
        }
      }
    }
    // The flames: a small tongue on every tile, as a lone building fire draws them.
    for (let p = 0; p < _wfPts.length; p += 4) {
      const c = _wfPts[p], r = _wfPts[p + 1], age = _wfPts[p + 2], kOut = _wfPts[p + 3];
      const h  = (((c * 2654435761) ^ (r * 40503)) >>> 0) / 4294967296;
      const h2 = (((c * 69069) ^ (r * 1103515245)) >>> 0) / 4294967296;
      const ph = h * 10;
      // Catching: a flare, taller and hotter, over the first second or so.
      const flare = age < 1.2 ? 1 + 0.5 * (1 - age / 1.2) : 1;
      const scale = (0.75 + 0.35 * h2) * flare * (0.35 + 0.65 * kOut);
      const sx = (c + 0.3 + 0.4 * h) * TILE, sy = (r + 0.55 + 0.3 * h2) * TILE;
      const fl = 0.8 + 0.12 * Math.sin(t * 8.6 + ph) + 0.08 * Math.sin(t * 15.3 + ph * 2.1);
      const maxH = TILE * 0.95 * scale * fl;
      const baseR = TILE * 0.2 * scale;
      if (!lite) {
        const n = 3;
        const base = ((t * 1.5 + ph) % 1 + 1) % 1;
        const k0 = Math.ceil((1 - base) * n) - 1;
        for (let s = 0; s < n; s++) {
          const k = (k0 - s + n) % n;
          const q = (base + k / n) % 1;                  // 0 at the root, 1 at the tip
          const j = ((((c * 89 + k * 17) ^ (r * 131)) >>> 0) % 1000) / 1000;
          const bx = sx + (j - 0.5) * TILE * 0.22 * scale * (1 - q)
                   + Math.sin(t * 2.9 + ph + q * 3.4 + j * 6) * TILE * 0.14 * scale * q
                   + wind * TILE * 0.34 * q * q;
          const by = sy - q * maxH;
          const rr = baseR * (1 - 0.55 * q) * (0.85 + 0.3 * j);
          const a = Math.min(1, q / 0.06 + 0.4) * (q < 0.45 ? 1 : 1 - (q - 0.45) / 0.55) * 0.9;
          if (a <= 0.01 || rr <= 0.3) continue;
          ctx.globalAlpha = a * kOut;
          ctx.drawImage(L.fireBillow(Math.min(1, (flare > 1 ? 0.05 : 0.22) + q * 1.05)), bx - rr, by - rr * 1.3, rr * 2, rr * 2.6);
        }
      }
      // The bed of fire on the water, so the root never gaps.
      const bed = baseR * 1.05 * fl;
      ctx.globalAlpha = 0.9 * kOut;
      ctx.drawImage(L.fireBillow(flare > 1 ? 0.08 : 0.18), sx - bed * 1.2, sy - bed * 1.1, bed * 2.4, bed * 1.8);
      // ...and its light on the water round it, from every other tile (the
      // glows overlap; one per tile was twice the cost for the same light).
      if (glow && ((c + r) & 1) === 0) {
        ctx.globalCompositeOperation = 'lighter';
        const gr = TILE * 0.9 * scale * fl;
        ctx.globalAlpha = 0.5 * kOut;
        ctx.drawImage(glow, sx - gr, sy - maxH * 0.3 - gr, gr * 2, gr * 2);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.restore();
  }

  // Trucks aren't on the timeline (they move, and a vehicle isn't a
  // building), so they were left driving round the ruins untouched. Each
  // frame, any truck the front has reached goes up where it stands: a
  // cook-off, its fuel tank's bang, and it's gone (removed the way the
  // Delete tool removes one; its panel closes itself).
  function _tickTrucks(el) {
    if (typeof TruckSystem === 'undefined') return;
    const R = _frontRadius(el);
    for (const trk of [...EntityRegistry.getByType(T.TRUCK)]) {
      const wx = (trk._wx ?? trk.col * TILE) + (trk.width || 1) * TILE / 2;
      const wy = (trk._wy ?? trk.row * TILE) + (trk.height || 1) * TILE / 2;
      if (Math.hypot(wx - _gz.wx, wy - _gz.wy) > R) continue;
      try {
        TruckSystem.stopPatrol?.(trk);
        if (TruckSystem.isDriven?.(trk)) TruckSystem.stopDriving?.();
      } catch (_e) {}
      GridManager.removeEntityFootprint(trk);
      EntityRegistry.remove(trk);
      _booms.push({ wx, wy, t0: el, big: false, small: false, ang: Math.atan2(wy - _gz.wy, wx - _gz.wx), seed: Math.random() * 1000 });
      if (el - _lastBoom > BOOM_GAP) { _lastBoom = el; SFX.generatorExplosion?.(0.25); }
    }
  }

  // Building bitmaps baked ahead of the camera: the next standing buildings
  // in death order, PREBAKE_MS a frame, at the montage zoom. The shots follow
  // the front, so this stays ahead of every cut.
  const PREBAKE_MS = 4;
  let _prebakeAt = 0;
  function _tickPrebake() {
    if (typeof BuildingSpriteCache === 'undefined' || !BuildingSpriteCache.prebake) return;
    if (_prebakeAt < _next) _prebakeAt = _next;        // already dead: skip
    const t0 = performance.now();
    while (_prebakeAt < _queue.length && performance.now() - t0 < PREBAKE_MS) {
      const v = _queue[_prebakeAt++];
      if (v.e && !v.e._irreparable) BuildingSpriteCache.prebake(v.e, SHOT_ZOOM);
    }
  }

  // After the sequence ends, keep clearing whatever scenery is still queued —
  // in frame-sized chunks so the GAME OVER card never stalls — until every
  // tree and bush on the map is gone and every line is burning.
  function _flushScrub() {
    if (_scrubAt >= _scrub.length) return;
    const step = () => {
      if (_phase !== 'over' && _phase !== 'ashes') return;
      const t0 = performance.now();
      while (_scrubAt < _scrub.length && performance.now() - t0 < 8) _tickScrub(Infinity);
      if (typeof WorldMapSystem !== 'undefined') WorldMapSystem.invalidate?.();
      if (_scrubAt < _scrub.length) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ── Camera direction ─────────────────────────────────────────── */

  // Three acts: ground zero, a held montage of the front eating the city,
  // then a long pull back over the dead map while the song finishes.
  function _tickCamera(el, dt) {
    const OUT = Math.max(Camera.ZOOM_MIN ?? 0.3, 0.3);

    // A uranium reactor about to go up ALWAYS gets the shot — from any act,
    // cutting into whatever is running. Checking only when a new shot was
    // picked missed reactors that went up mid-shot. Reactors a few seconds
    // apart share one shot (the second is usually in frame anyway).
    if (el >= 5) {
      const v = _reactorsQ.find(r => r.at - el <= 1.5 && r.at - el > -0.5 && !r.e?._shown);
      if (v) {
        for (const r of _reactorsQ) {
          const near = Math.abs(r.wx - v.wx) < TILE * 60 && Math.abs(r.wy - v.wy) < TILE * 60;
          if (near && r.at - v.at < 6) { r.e._shown = true; }
        }
        _reactorShot = v;
        _shotTgt = { wx: v.wx, wy: v.wy };
        _zoomTgt = 0.32;
        // A cut in, a second and a half of build-up, the blast, and its
        // mushroom rising: SHOT_MAX in all, never more.
        _shotEnd = el + SHOT_MAX;
        _lastShot = { wx: v.wx, wy: v.wy };
        _act = 3;
        _cut = true;
      }
    }
    if (_reactorShot && el < _shotEnd) {
      // Holding on a reactor: nothing else may take the camera until its
      // shot is up.
      if (_cut) { _cut = false; Camera.setZoom?.(_zoomTgt); Camera.jumpTo?.(_shotTgt.wx, _shotTgt.wy); return; }
      Camera.panTo?.(_shotTgt.wx, _shotTgt.wy, dt, 2.4);
      return;
    }
    _reactorShot = null;

    // Act 1 — the reactor itself, held long enough to watch it go up and
    // the fireball roll outward: close on the core, then pulling back
    // through the blast, all in one SHOT_MAX shot. (It used to hold eleven
    // seconds, the back six of them on a fireball that had stopped growing.)
    if (el < SHOT_MAX) {
      _shotTgt = _gz; _zoomTgt = el < 1.5 ? 0.82 : 0.42;
    // (There used to be a second act here: ten seconds held on the middle of
    // the city, "letting the blasts come to it". They only come if the
    // reactor is in the middle of the city. With the core out on the edge of
    // town the front was still a long way off, and the shot was ten seconds
    // of an untouched street. The montage below goes where the front is.)
    //
    // Closing: the whole dead city, once the last building has gone up. Never
    // cuts into a montage shot that is still running: it waits for it to
    // finish. (It used to start 13 seconds from the end regardless, with
    // buildings still going up off-screen.)
    } else if (_act === 4 || (el >= _shotEnd && (el > _lastKillAt + 1 || el > _seq - 4))) {
      // Closing: City Hall dead centre, framed on the city around it — the
      // first building the player ever powered, in the middle of what's left
      // — then, SHOT_MAX at a time, other corners of the ruins, coming back
      // to City Hall for the last one. Fixed and fairly close: framed on a
      // piece of the city rather than fitted to its full extent, which on a
      // sprawling map pinned the zoom at the game's minimum and made the
      // whole thing unreadable.
      if (_act !== 4) { _act = 4; _closeN = 0; _shotEnd = el; }
      if (el >= _shotEnd) {
        const home = _cityHall || _cityC;
        const last = el + SHOT_MAX >= _seq - 0.5;
        _shotTgt = (_closeN === 0 || last) ? home : _closingSpot(_closeN);
        _zoomTgt = _closeN % 2 ? 0.36 : 0.42;
        _shotEnd = el + SHOT_MAX;
        _closeN++;
        _cut = true;
      }
    } else if (el >= _shotEnd) {
      _act = 3;
      _shotAt = _now();
      const shot = _pickShot(el);
      _shotTgt = shot ? { wx: shot.wx, wy: shot.wy } : _gz;
      _zoomTgt = shot ? shot.zoom : SHOT_ZOOM;
      _shotEnd = shot ? shot.end : el + SHOT_HOLD;
      _shotBox = shot && shot.box ? shot.box : null;
      _followAt = 0;
      // CUT, don't travel. Easing across a thousand tiles takes longer than
      // the buildings take to die, so the camera kept arriving at a street
      // that had already finished exploding. A hard cut puts the frame on
      // the cluster before the first of them goes.
      _cut = true;
    }

    // Within a montage shot the frame leans toward whatever is about to go
    // up inside it, so the next blast is near the middle rather than at an
    // edge. Re-aimed a few times a second; it never leaves the shot's box.
    if (_act === 3 && _shotBox && !_cut && el >= _followAt) {
      _followAt = el + 0.4;
      let sx = 0, sy = 0, n = 0;
      for (let i = _next; i < _queue.length; i++) {
        const v = _queue[i];
        if (v.at > el + 2.5) break;
        if (_INFRA.has(v.e?.type)) continue;
        if (Math.abs(v.wx - _shotBox.wx) > _shotBox.halfW || Math.abs(v.wy - _shotBox.wy) > _shotBox.halfH) continue;
        sx += v.wx; sy += v.wy; n++;
      }
      if (n) _shotTgt = { wx: (_shotBox.wx + sx / n) / 2, wy: (_shotBox.wy + sy / n) / 2 };
    }

    const tgt = _shotTgt || _gz;
    if (_cut) {
      _cut = false;
      Camera.setZoom?.(_zoomTgt);
      Camera.jumpTo?.(tgt.wx, tgt.wy);
      return;
    }
    // Within a shot the camera drifts rather than sits — enough to feel
    // handheld, not enough to chase anything.
    Camera.panTo?.(tgt.wx, tgt.wy, dt, 2.4);
    const z = Camera.zoom;
    Camera.setZoom?.(z + (_zoomTgt - z) * Math.min(1, dt * 1.1));
  }

  // A closing shot's subject: one of the city's big buildings (now ruins),
  // stepped through by the golden ratio so successive shots land on
  // different parts of town. Ground zero if the city had none.
  function _closingSpot(n) {
    const big = [];
    for (const v of _queue) if (v.big && !_INFRA.has(v.e?.type)) big.push(v);
    const pool = big.length ? big : _queue.filter(v => !_INFRA.has(v.e?.type));
    if (!pool.length) return _gz;
    const v = pool[Math.floor(((n * 0.6180339887) % 1) * pool.length)];
    return { wx: v.wx, wy: v.wy };
  }

  // The zoom at which a world-space span fits the short side of the window.
  function _fitZoom(span) {
    const s = Math.min(window.innerWidth, window.innerHeight);
    return Math.max(0.05, s / Math.max(1, span));
  }

  // How much a death is worth to a shot. Line infrastructure — pylons,
  // poles, lamps, masts — counts for almost nothing: a map can carry
  // hundreds of them strung across empty fields, and weighting them like
  // buildings sent whole shots to a row of pylons in open grass. The city
  // is what the camera is for.
  const _INFRA = new Set([T.POWERTOWER, T.POLE, T.LAMP, T.CELLTOWER, T.LIGHTNINGROD, T.LIGHTNINGROD2, T.LIGHTNINGROD3, T.CAMERA, T.BEACON, T.MONITOR, T.MONITOR2]);
  function _shotWeight(v) {
    if (_INFRA.has(v.e?.type)) return 0.1;
    return v.big ? 3 : 1;
  }

  // Frame the patch of the front that will KEEP exploding, and leave when
  // it stops.
  //
  // The frame is one screen at SHOT_ZOOM (or SHOT_WIDE). Every building due
  // to die in the next SHOT_MAX seconds is a candidate centre, and each is
  // scored by how many half-seconds of the next SHOT_MIN have a building
  // going up inside its screen-sized box: a frame that is busy throughout
  // beats one that is denser but over in a second. (Scoring by the count of
  // deaths alone picked blocks that all went up together and then held the
  // shot on their ruins.) The shot runs while that action runs: until the
  // first lull of SHOT_GAP seconds in the frame, plus SHOT_AFTER to watch it
  // burn, clamped to SHOT_HOLD..SHOT_MAX.
  function _pickShot(el) {
    const soon  = el + SHOT_MIN;
    const late  = el + SHOT_MAX;

    const cand = [];
    for (let i = _next; i < _queue.length; i++) {
      const v = _queue[i];
      if (v.at > late) break;
      cand.push(v);
      if (cand.length >= 600) break;
    }
    if (!cand.length) return null;

    // A uranium reactor about to go up takes priority over everything: cut
    // to it a couple of seconds before, and hold long enough to watch its
    // mushroom rise, wider than a normal shot so the cloud fits.
    for (const v of cand) {
      if (v.at > soon) break;
      if (v.e?.type !== T.NUCLEARREACTOR || v.at < el + 1.5 || v.e._shown) continue;
      v.e._shown = true;
      _lastShot = { wx: v.wx, wy: v.wy };
      return { wx: v.wx, wy: v.wy, zoom: 0.32, end: el + SHOT_MAX };
    }

    // Shots are centred on BUILDINGS, never on pylons. On a map where
    // pylons are half the structures, stretches of the front are nothing
    // but pylon runs for seconds at a time — anchoring on those gave shots
    // of a pylon line in an empty field. Anchors look across the whole
    // SHOT_MAX window so there is always a building to find.
    const anchors = cand.filter(v => !_INFRA.has(v.e?.type));
    const pool = anchors.length ? anchors : cand;
    const stride = Math.max(1, Math.floor(pool.length / 80));
    const SLOTS = Math.ceil(SHOT_MIN * 2);
    // Never frame the same patch twice running: by the time the next shot
    // opens, whatever was in the last frame is mostly rubble already, and
    // the cut reads as the camera getting stuck.
    const prev = _lastShot;

    let pick = null;
    for (const zoom of [SHOT_ZOOM, SHOT_WIDE]) {
      const halfW = window.innerWidth  / zoom / 2 * 0.85;
      const halfH = window.innerHeight / zoom / 2 * 0.85;
      const inBox = (a, b) => Math.abs(b.wx - a.wx) < halfW && Math.abs(b.wy - a.wy) < halfH;
      const repeats = (a) => prev && Math.abs(a.wx - prev.wx) < halfW * 1.2 && Math.abs(a.wy - prev.wy) < halfH * 1.2;
      let best = null, bestScore = -1, bestBusy = 0;
      for (let pass = 0; pass < 2 && !best; pass++) {   // pass 1 allows a repeat
        for (let i = 0; i < pool.length; i += stride) {
          const a = pool[i];
          if (pass === 0 && repeats(a)) continue;
          let k = 0, mask = 0;
          for (const b of cand) {
            if (!inBox(a, b)) continue;
            const w = _shotWeight(b);
            k += w * (b.at <= soon ? 1 : 0.5);
            if (w >= 1 && b.at <= soon) mask |= 1 << Math.min(SLOTS - 1, Math.max(0, Math.floor((b.at - el) * 2)));
          }
          let busy = 0;
          for (let m = mask; m; m &= m - 1) busy++;
          // ...and a frame that opens on a blast beats one that makes the
          // viewer wait for its first: the first three half-seconds count double.
          for (let m = mask & 7; m; m &= m - 1) busy++;
          const score = busy * 10 + Math.min(9, k * 0.25);
          if (score > bestScore) { bestScore = score; best = a; bestBusy = busy; }
        }
      }
      if (!best) best = cand[0];
      // The wide frame has to earn it: clearly busier than the close one.
      if (!pick || bestBusy > pick.busy + 2) pick = { best, busy: bestBusy, zoom, halfW, halfH, inBox };
      if (pick.busy >= SLOTS * 0.7) break;             // the close frame is busy enough
    }
    const { best, zoom, halfW, halfH, inBox } = pick;

    // Centre on the deaths the frame actually contains, and find when its
    // run of them ends: the first lull of SHOT_GAP between buildings.
    let sx = 0, sy = 0, n = 0, last = el;
    for (const b of cand) {                             // cand is in time order
      if (!inBox(best, b)) continue;
      sx += b.wx; sy += b.wy; n++;
      if (_INFRA.has(b.e?.type)) continue;
      if (b.at - last > SHOT_GAP && last > el) break;
      last = b.at;
    }
    const wx = n ? sx / n : best.wx, wy = n ? sy / n : best.wy;
    const end = Math.max(el + SHOT_HOLD, Math.min(el + SHOT_MAX, last + SHOT_AFTER));
    _lastShot = { wx, wy };
    return { wx, wy, zoom, end, box: { wx, wy, halfW, halfH } };
  }

  /* ── Game over ────────────────────────────────────────────────── */

  // How long the screaming lasts once the card is up. The silence at the
  // end of the track is not the end of the scene — the city is still
  // burning, and cutting the screaming with the music makes the GAME OVER
  // card feel like a menu instead of an aftermath. But it is quieter from
  // the moment the card comes up, and dies away with the survivors.
  const SCREAM_SECS = 44;
  const SCREAM_CARD = 0.6;   // share of the blast's level it drops to as the card comes up

  // The survivors. The card opens on a tenth of the city still alive and
  // counts down to nobody over exactly the time the screaming has left. The
  // screaming follows the count: fewer people, fainter, and the last one
  // goes as the last scream does.
  function _countDownSurvivors() {
    const el = document.getElementById('go-pop');
    const start = Math.max(0, Math.round(_stats.pop * 0.10));
    const secs  = SCREAM_SECS;
    const t0    = _now();
    const s0    = _scream ? _scream.volume * SCREAM_CARD : 0;
    let shown   = start;
    if (el) el.textContent = start.toLocaleString();
    const step = () => {
      const k = Math.min(1, (_now() - t0) / secs);
      // Fast at first, trickling at the end — the long tail is the point.
      const left = Math.pow(1 - k, 1.6);
      if (_scream) {
        _scream.volume = Math.max(0, s0 * left);
        if (k >= 1) { try { _scream.pause(); } catch (_e) {} _scream = null; }
      }
      if (!el) { if (k < 1) requestAnimationFrame(step); return; }
      const target = Math.round(start * left);
      // Never tick back up, and drop in uneven bites rather than a smooth
      // slide so it reads as people, not a progress bar.
      if (target < shown && (Math.random() < 0.35 || k >= 1)) {
        shown = target;
        el.textContent = shown.toLocaleString();
      }
      if (k < 1 || shown > 0 || _scream) requestAnimationFrame(step);
      else el.textContent = '0';
    };
    requestAnimationFrame(step);
  }

  function _permadeath() {
    return typeof Difficulty !== 'undefined' && Difficulty.permadeath() && typeof SaveSystem !== 'undefined';
  }

  function _showGameOver() {
    if (_phase !== 'blast') return;
    _phase = 'over';
    // The cut is over; the cache goes back to choosing its own tier.
    try { BuildingSpriteCache.setPinned?.(false); } catch (_e) {}
    // Permadeath: there is no save to go back to — say so, and the button
    // that used to offer one just returns to the menu.
    if (_permadeath()) {
      document.getElementById('go-perma')?.classList.add('visible');
      const b = document.getElementById('go-load');
      if (b) b.innerHTML = '⌂&nbsp; Main menu';
    }
    _flushScrub();   // the outer forest the front didn't finish clearing in time
    // The screaming now dies with the survivor count (_countDownSurvivors).

    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    set('go-core',  _stats.core);
    set('go-city',  _stats.city);
    set('go-sub',   `${_stats.city} has been incinerated`);
    set('go-company',   _stats.co || 'Your company');
    set('go-city-name', _stats.city);
    set('go-day',   String(_stats.day));
    set('go-pop',   _stats.pop.toLocaleString());
    set('go-built', _stats.built.toLocaleString());
    // Cinematic frame (same bars / eyebrow as FUSION ACHIEVED).
    set('go-bar-l',   `☢ ${String(_stats.city || '').toUpperCase()} · MINISTRY OF ENERGY`);
    set('go-eyebrow', `${String(_stats.city || '').toUpperCase()} · MOX CORE DETONATION`);
    set('go-bar-day', `DAY ${_stats.day}`);

    const el = document.getElementById('game-over');
    if (el) el.classList.add('visible');
    document.body.classList.add('apocalypse-over');
    _countDownSurvivors();
  }

  // "Look what you've done..." — a card in the tutorial's own style, but
  // NOT a TutorialSystem card. That system's cards advance on the sim tick,
  // which is frozen for the rest of the session, and closing a forced card
  // handed the slot back to whatever ordinary tutorial was pending — a card
  // with a Continue button that could never continue. Regular tutorial cards
  // are hidden outright once the run has ended (body.apocalypse in the CSS);
  // this one lives on its own. It cannot be dismissed.
  function _showAshesCard() {
    if (document.getElementById('apoc-card')) return;
    const host = document.createElement('div');
    host.id = 'apoc-card';
    host.innerHTML =
      '<div class="tut-card">' +
        '<div class="tut-title">Game Over</div>' +
        '<div class="tut-text">Look what you\'ve done...</div>' +
      '</div>';
    // No Continue, no close. It stays for as long as they walk the ashes;
    // only bringing the GAME OVER card back (recall) takes it down.
    document.body.appendChild(host);
  }

  // "Walk the ashes" — the overlay goes away and the camera comes back, but
  // the run is still over: no building, no saving, and a button in the
  // corner to bring the screen back.
  function walkTheAshes() {
    if (_phase !== 'over') return;
    _phase = 'ashes';
    document.getElementById('game-over')?.classList.remove('visible');
    document.body.classList.remove('apocalypse-over');
    document.getElementById('game-over-recall')?.classList.add('visible');
    // The screaming is left alone — it is on the survivor count's clock
    // from the moment the card came up, and walking out of the card should
    // not silence the city.
    _fadeOut(_song, 6); _song = null;
    _showAshesCard();
    // The city starts burning itself out (the first walk only; it keeps going
    // if the card is brought back up).
    if (_quenchT == null) _quenchT = 0;
  }

  function recall() {
    if (_phase !== 'ashes') return;
    _phase = 'over';
    document.getElementById('apoc-card')?.remove();
    document.getElementById('game-over-recall')?.classList.remove('visible');
    document.getElementById('game-over')?.classList.add('visible');
    document.body.classList.add('apocalypse-over');
  }

  /* ── Overlays ─────────────────────────────────────────────────── */

  // World space, under the camera transform, drawn after the entities.
  function renderWorld(ctx, t) {
    if (!hasEnded()) return;
    const el = _el();

    // Burning lakes and rivers, under everything else here.
    _renderWaterFire(ctx, el, t);

    // The shock front, still visibly travelling. Its radius is read off the
    // same sorted distance list the kill schedule uses, so the ring is
    // always exactly on the buildings that are going up this second.
    if (_phase === 'blast') {
      const r = Math.max(1, _smoothRing(el));
      const lw = Math.max(2, 14 / Camera.zoom);
      ctx.save();
      const rg = ctx.createRadialGradient(_gz.wx, _gz.wy, Math.max(1, r * 0.82), _gz.wx, _gz.wy, r * 1.06);
      rg.addColorStop(0, 'rgba(180,255,60,0)');
      rg.addColorStop(0.72, 'rgba(200,255,90,0.20)');
      rg.addColorStop(1, 'rgba(120,200,30,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(_gz.wx, _gz.wy, r * 1.06, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(214,255,120,${(0.35 + 0.25 * Math.sin(t * 6)).toFixed(3)})`;
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(_gz.wx, _gz.wy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // No contamination marking: no green wash over the ground and no label
    // at ground zero. The ruins are the picture, and the game-over screen
    // says what happened.

    const L = LightningDamageSystem;

    // The front itself, where it is on screen: a rolling wall of fire and
    // dust, the base surge of a blast the size of the map. Billows are laid
    // round the ring at a fixed spacing, culled to the view, so the cost is
    // what's visible (a few dozen draws) however big the ring has grown.
    if (_phase === 'blast' && L.fireBillow) _renderFrontWall(ctx, el, t);

    // Individual buildings cooking off: a sickly green-white flash and a
    // shock ring, then a lumpy burst of the same fire billows every other
    // blast in the game is drawn with, cooling and lifting into soot. Pylons
    // and poles (small) just pop. All sprites: no gradient is built per
    // blast per frame.
    for (const b of _booms) {
      const life = b.small ? 1.3 : 2.2;
      const k = (el - b.t0) / life;
      if (k >= 1 || k < 0) continue;
      const size = b.big ? 190 : b.small ? 50 : 95;
      const R = size * (0.25 + k * 1.05);
      const cy = b.wy - k * (b.small ? 10 : 26);
      ctx.save();
      if (k < 0.3) {
        const f = 1 - k / 0.3, fr = R * 1.5;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = f * (b.big ? 1 : b.small ? 0.55 : 0.8);
        ctx.drawImage(_flashSprite(), b.wx - fr, cy - fr, fr * 2, fr * 2);
        ctx.globalCompositeOperation = 'source-over';
      }
      // A shock ring off the big ones only (on every building, a dense block
      // read as a page of target circles), quick and faint.
      if (b.big && k < 0.4) {
        const s = k / 0.4, rr = size * 3 * (1 - Math.pow(1 - s, 3));
        ctx.globalAlpha = (1 - s) * (1 - s) * 0.5;
        ctx.strokeStyle = 'rgb(236,255,206)';
        ctx.lineWidth = 10 * (1 - s) + 1;
        ctx.beginPath(); ctx.ellipse(b.wx, b.wy, rr, rr * 0.82, 0, 0, Math.PI * 2); ctx.stroke();
      }
      if (L.fireBillow) {
        // Soot first, behind the flame, swelling as the fire dies into it.
        const sr = R * (0.35 + 0.35 * k);
        ctx.globalAlpha = Math.min(1, k * 3) * (1 - k) * 0.8;
        ctx.drawImage(L.smokeBillow(1 - k, 0), b.wx - sr, cy - R * 0.25 - sr, sr * 2, sr * 2);
        L.firePop(ctx, b.wx, cy, R * 0.42, k);
        // A second, offset burst blown outward from ground zero on the
        // bigger ones, so a block goes up as a lumpy fireball, not a ball.
        if (!b.small) {
          const k2 = Math.max(0, k - 0.08) / 0.92;
          const dx = Math.cos(b.ang || 0) * R * 0.35, dy = Math.sin(b.ang || 0) * R * 0.25;
          L.firePop(ctx, b.wx + dx, cy + dy - R * 0.1, R * 0.32, k2);
        }
      }
      ctx.restore();
    }
  }

  // Additive flash for a cook-off: white heart, toxic lime edge. Baked once.
  let _flashCv = null;
  function _flashSprite() {
    if (_flashCv) return _flashCv;
    const S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0,    'rgba(255,255,236,0.95)');
    gr.addColorStop(0.22, 'rgba(240,255,170,0.75)');
    gr.addColorStop(0.55, 'rgba(190,255,70,0.28)');
    gr.addColorStop(1,    'rgba(150,230,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return (_flashCv = c);
  }

  // The rolling wall at the front. Dust billows ride just behind the ring,
  // fire billows on it, both swelling and churning; the glow of the ring
  // goes on top additively. Spacing is in world px, so the wall is as dense
  // up close as far out, and only the arc inside the view is drawn.
  const WALL_STEP = TILE * 2.6;
  function _renderFrontWall(ctx, el, t) {
    const L = LightningDamageSystem;
    const r = _ringR;
    if (r < TILE * 4) return;
    const z = Camera.zoom || 1;
    const vw = window.innerWidth / z, vh = window.innerHeight / z;
    const vx0 = Camera.x - vw * 0.15, vy0 = Camera.y - vh * 0.25, vx1 = Camera.x + vw * 1.15, vy1 = Camera.y + vh * 1.15;
    // Skip the whole ring if the view is entirely inside or outside it.
    const nx = Math.max(vx0, Math.min(_gz.wx, vx1)), ny = Math.max(vy0, Math.min(_gz.wy, vy1));
    const near = Math.hypot(nx - _gz.wx, ny - _gz.wy);
    const far = Math.max(Math.hypot(vx0 - _gz.wx, vy0 - _gz.wy), Math.hypot(vx1 - _gz.wx, vy0 - _gz.wy),
                         Math.hypot(vx0 - _gz.wx, vy1 - _gz.wy), Math.hypot(vx1 - _gz.wx, vy1 - _gz.wy));
    if (r + TILE * 8 < near || r - TILE * 8 > far) return;
    const n = Math.max(24, Math.ceil(Math.PI * 2 * r / WALL_STEP));
    const dust = L.smokeBillow(0.35, 0.2, true);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = _gz.wx + Math.cos(a) * r, y = _gz.wy + Math.sin(a) * r;
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      pts.push(i, a, x, y);
    }
    if (!pts.length) return;
    ctx.save();
    // Dust behind the front, churning.
    for (let p = 0; p < pts.length; p += 4) {
      const i = pts[p], a = pts[p + 1];
      const h = ((i * 2654435761) >>> 0) / 4294967296;
      const back = TILE * (2.5 + 2 * h);
      const br = TILE * (3.4 + 1.6 * h) * (1 + 0.12 * Math.sin(t * 1.7 + i));
      const x = pts[p + 2] - Math.cos(a) * back, y = pts[p + 3] - Math.sin(a) * back - br * 0.25;
      ctx.globalAlpha = 0.7;
      ctx.drawImage(dust, x - br, y - br, br * 2, br * 2);
    }
    // Fire on the front itself, as two staggered, ragged rows rather than a
    // string of equal beads: a row of big, redder tongues just behind the
    // ring, then the leading row on it, white-hot here and there, each
    // billow its own size, its own heat and its own flicker, jostled off the
    // line by a hash so no two stretches of the wall look alike.
    for (let row = 0; row < 2; row++) {
      for (let p = 0; p < pts.length; p += 4) {
        const i = pts[p], a = pts[p + 1];
        const h  = ((i * 40503 + 7 + row * 131) % 997) / 997;
        const h2 = ((i * 69069 + 11 + row * 977) % 1009) / 1009;
        const ca = Math.cos(a), sa = Math.sin(a);
        // Half a step along the ring for the back row, so the rows interleave.
        const along = (row ? 0.5 : 0) * WALL_STEP + (h2 - 0.5) * WALL_STEP * 0.6;
        const radial = row ? -TILE * (1.6 + 1.4 * h) : (h - 0.5) * TILE * 1.8;
        const flick = 0.8 + 0.2 * Math.sin(t * (7 + 5 * h2) + i * 1.7) + 0.12 * Math.sin(t * 13.1 + i);
        const fr = TILE * (row ? 2.2 + 1.6 * h : 1.1 + 1.9 * h * h2 + 0.6 * h) * flick;
        const x = pts[p + 2] + ca * radial - sa * along + Math.sin(t * 2.3 + i) * TILE * 0.35;
        const y = pts[p + 3] + sa * radial + ca * along - fr * 0.45;
        const T = row ? 0.38 + 0.35 * h2 : (h2 < 0.22 ? 0.02 : 0.12 + 0.4 * h);
        ctx.globalAlpha = row ? 0.7 : 0.9;
        ctx.drawImage(L.fireBillow(T), x - fr, y - fr * 1.3, fr * 2, fr * 2.6);
      }
    }
    // Its light on everything it is passing over.
    const glow = L.fireGlow ? L.fireGlow() : null;
    if (glow) {
      ctx.globalCompositeOperation = 'lighter';
      for (let p = 0; p < pts.length; p += 8) {
        const gr = TILE * 7;
        ctx.globalAlpha = 0.55;
        ctx.drawImage(glow, pts[p + 2] - gr, pts[p + 3] - gr, gr * 2, gr * 2);
      }
    }
    ctx.restore();
  }

  // Screen space, over everything: the white-out, the toxic grade, the
  // letterbox, and the countdown card while the fuse is still burning.
  function renderScreen(ctx, W, H, t) {
    if (_phase === 'armed') return _renderCountdown(ctx, W, H, t);
    if (!hasEnded()) return;
    const el = _el();

    if (_flash > 0.002) {
      ctx.save();
      ctx.fillStyle = `rgba(255,255,245,${(_flash * _flash).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // Toxic grade: strongest in the first seconds, never fully lifting.
    const grade = _phase === 'blast' ? 0.30 + 0.34 * Math.exp(-el / 9) : 0.26;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(190,255,130,${grade.toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Vignette — dirty green rather than black.
    ctx.save();
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(24,34,6,${(0.55 + 0.2 * Math.sin(t * 0.7)).toFixed(3)})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Ash. Cheap, deterministic, and it sells "everything is on fire".
    ctx.save();
    ctx.fillStyle = 'rgba(30,26,20,0.55)';
    for (let i = 0; i < 90; i++) {
      const s = (i * 2654435761) % 1000 / 1000;
      const x = ((s * W) + Math.sin(t * 0.35 + i) * 26 + i * 13) % W;
      const y = ((t * (16 + s * 34) + i * 87) % (H + 40)) - 20;
      const r = 0.8 + s * 2.2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    _letterbox(_phase === 'blast' ? Math.min(1, el / 1.5) : 0);
  }

  // Letterbox bars as DOM elements, not canvas paint: rain and weather draw
  // on their own canvas layered ABOVE the game canvas (WeatherCanvas,
  // z-index 30), so bars painted into the game canvas had the rain falling
  // over them. These sit above that layer and below the GAME OVER card.
  let _bars = null;
  function _letterbox(k) {
    if (!_bars) {
      if (k <= 0) return;
      _bars = ['top', 'bottom'].map(side => {
        const d = document.createElement('div');
        d.style.cssText = `position:fixed;left:0;right:0;${side}:0;height:0;background:#000;z-index:40;pointer-events:none;transition:height .4s ease;`;
        document.body.appendChild(d);
        return d;
      });
    }
    const h = `${(8.5 * k).toFixed(2)}vh`;
    for (const d of _bars) if (d.style.height !== h) d.style.height = h;
  }

  // The fuse. Big, centred, unmissable — the MK1's little countdown plate
  // over the building is not enough warning for something that ends the run.
  function _renderCountdown(ctx, W, H, t) {
    // Counts the SONG down, not the sim — same reason the detonation is
    // triggered off the track. Before the last DRAMA_SECONDS the emergency
    // is the ordinary reactor plate and card, nothing full-screen.
    const left = timeLeft();
    if (left == null || left > DRAMA_SECONDS) return;
    const urgent = left < 12;
    const pulse  = 0.5 + 0.5 * Math.sin(t * (urgent ? 9 : 4));

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(255,${(180 - 90 * pulse) | 0},${(160 - 110 * pulse) | 0},${(0.10 + 0.16 * (1 - left / DRAMA_SECONDS)).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    const fs = Math.max(28, Math.min(64, W * 0.05));
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${fs * 0.42}px Courier New`;
    ctx.fillStyle = urgent && pulse > 0.5 ? '#ff5030' : '#ffd040';
    ctx.fillText('☢  MOX CORE CRITICAL  ☢', W / 2, H * 0.14);
    ctx.font = `bold ${fs}px Courier New`;
    ctx.fillStyle = urgent && pulse > 0.5 ? '#ff3020' : '#b0ff60';
    ctx.fillText(`${Math.ceil(left)}`, W / 2, H * 0.14 + fs * 0.85);
    ctx.font = `${fs * 0.3}px Courier New`;
    ctx.fillStyle = 'rgba(255,220,180,0.85)';
    // Their city, by name — "the map" is abstract; the name is the thing
    // they spent the save building.
    const city = ((typeof CityInfo !== 'undefined' && CityInfo.getCityName?.()) || 'the city').toUpperCase();
    ctx.fillText(`COOL IT OR ${city} GOES WITH IT`, W / 2, H * 0.14 + fs * 1.5);
    ctx.restore();
  }

  // Delegated from the document rather than bound to the buttons: the game
  // over markup sits at the very end of <body>, below every <script>, so at
  // init time getElementById found nothing and the buttons were silently
  // dead. A document listener doesn't care when the elements arrive.
  let _inited = false;
  function init() {
    if (_inited) return;
    _inited = true;
    document.addEventListener('click', (ev) => {
      const t = ev.target.closest?.('#go-load, #go-walk, #game-over-recall');
      if (!t) return;
      // Load a save: a reload is the honest way to do it — it throws the
      // ruined world away entirely rather than trying to unpick it in place —
      // flagged so the menu opens straight onto the save list (MenuSystem).
      // Permadeath has no save to go back to, so that's just the menu.
      if (t.id === 'go-load') {
        if (!_permadeath()) { try { sessionStorage.setItem('gw_open_load', '1'); } catch (_e) {} }
        location.reload();
      }
      else if (t.id === 'go-walk') walkTheAshes();
      else recall();
    });
  }

  return {
    CLIMAX_SECONDS, DETONATE_AT, DRAMA_SECONDS,
    timeLeft, isDramatic, ownsDetonation,
    init, arm, disarm, detonate, takeOver, frame,
    renderWorld, renderScreen, renderDryBed, clipLiving,
    isActive, isArmed, isOver, hasEnded, locksInput, locksBuild, lockedSpeed, ownsMusic,
    isHeld,
    walkTheAshes, recall,
    groundZero: () => ({ ..._gz }),
    // Diagnostics for checking the cut lines up.
    debug: () => ({
      phase: _phase, held: isHeld(),
      songAt: _song ? +(_song.currentTime || 0).toFixed(2) : null,
      songDur: _song && isFinite(_song.duration) ? +_song.duration.toFixed(2) : null,
      screamAt: _scream ? +(_scream.currentTime || 0).toFixed(2) : null,
      seq: +_seq.toFixed(2), elapsed: _phase === 'blast' ? +_el().toFixed(2) : null,
      killed: _next, queued: _queue.length,
    }),
    // Dev/testing entry point — skips the fuse and blows the given (or first)
    // Advanced Reactor immediately.
    devTrigger(core) {
      const c = core || [...EntityRegistry.getByType(T.ADVREACTOR)][0];
      if (!c) return 'no Advanced Reactor on the map';
      detonate(c);
      return 'detonated';
    },
  };
})();
