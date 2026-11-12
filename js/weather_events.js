/* ═══════════════════════════════════════════════════════════════════
   WEATHER EVENTS
   WeatherEventSystem (active weather event state: storm/heatwave/
   coldsnap/rainstorm/rainfall) and EventSystem, the scheduler that
   decides when each event type is next triggered.
   ═══════════════════════════════════════════════════════════════════ */

const WeatherEventSystem = (() => {
  let _activeEvent  = null;   // { type, label, endTime, demandMult, solarMult }
  let _gameTime     = 0;
  let _faultNotifActive = false; // whether the pinned wire-fault notification is currently up

  function _countFailedWiresNow() {
    let n = 0;
    for (const e of EntityRegistry.getByType(T.WIRE)) if (e._weatherFailed) n++;
    return n;
  }

  // Notes on a wire just knocked out what did it (overload, smoke, geomag)
  // and the weather that was in, so the Wire Fault card can say so rather
  // than blaming a storm that may never have been there.
  function _markFault(w, cause) {
    w._faultCause = cause;
    const def = _activeEvent && WEATHER_EVENTS.find(e => e.type === _activeEvent.type);
    const label = (_activeEvent && _activeEvent.label) || (def && def.label) || '';
    w._faultEvent = label.replace(/^[^A-Za-z]+/, '').trim();
  }

  const WEATHER_EVENTS = [
    {
      type: 'storm',
      label: '💨 Gale',
      minWs: 1000,
      duration: () => 120 + Math.random() * 120,  // 2-4 min
      demandMult: 1.15,
      solarMult:  0.25,
      color: '#806020',
      startMsg: '💨 Gale blowing in; Solar -75% · All demand +15% · Grid stress risk',
      endMsg:   '💨 The gale is dying down: grid returning to normal',
    },
    {
      type: 'heatwave',
      label: '🌡 Heat Wave',
      minWs: 5000,
      duration: () => 300 + Math.random() * 300,  // 5-10 min
      demandMult: 1.25,   // residential +25%
      comMult:    1.10,   // commercial +10%
      solarMult:  1.0,
      color: '#c04010',
      startMsg: '🌡 Heat wave warning; Residential +25% · Commercial +10% · Cooling systems stressed',
      endMsg:   '🌡 Heat wave breaking; demand returning to normal',
    },
    {
      type: 'coldsnap',
      label: '❄ Cold Snap',
      minWs: 5000,
      duration: () => 300 + Math.random() * 300,
      demandMult: 1.20,
      indMult:    1.10,
      solarMult:  0.7,
      color: '#2060a0',
      startMsg: '❄ Cold snap: Residential +20% · Industrial +10% · Solar -30% · Pipes at risk',
      endMsg:   '❄ Cold snap ending; temperatures normalising',
    },
    {
      type: 'rainstorm',
      label: '🌧 Rainstorm',
      minWs: 2000,
      duration: () => 180 + Math.random() * 240,  // 3-7 min
      demandMult: 1.20,   // residential +20% (heating, lighting)
      solarMult:  0.15,   // solar nearly wiped out
      windMult:   1.3,    // wind slightly boosted
      color: '#204060',
      startMsg: '🌧 Heavy rainstorm: Solar -85% · Residential +20% · Wind +30% · Check your grid capacity',
      endMsg:   '🌧 Rain clearing: solar recovering',
    },
    {
      type: 'rainfall',
      label: '🌦 Rainfall',
      minWs: 500,
      duration: () => 150 + Math.random() * 180,  // 2.5-5.5 min
      demandMult: 1.07,   // residential +7%
      solarMult:  0.70,   // solar -30%
      windMult:   1.11,   // wind +11%
      color: '#406880',
      startMsg: '🌦 Light rainfall: Solar -30% · Residential +7% · Wind +11%',
      endMsg:   '🌦 Rain easing: skies clearing',
    },
    {
      // Winter's rainfall: what the light-rain timer brings while it is cold
      // enough to snow (EventSystem). Snow settles while it lasts.
      type: 'snowfall',
      label: '🌨 Snowfall',
      minWs: 500,
      duration: () => 150 + Math.random() * 180,  // 2.5-5.5 min
      demandMult: 1.10,   // residential +10%
      solarMult:  0.65,   // solar -35%: grey sky, panels dusted
      windMult:   1.05,
      color: '#7090b0',
      startMsg: '🌨 Snowfall: Solar -35% · Residential +10% · Snow settling',
      endMsg:   '🌨 The snow is easing',
    },
    {
      // Winter's rainstorm. Harder on a grid than the storm it replaces:
      // solar is all but gone and every home is heating, though the wind
      // turbines have never had it so good.
      type: 'blizzard',
      label: '🌬 Blizzard',
      minWs: 2000,
      duration: () => 240 + Math.random() * 240,  // 4-8 min
      demandMult: 1.30,   // residential +30%
      comMult:    1.10,   // commercial +10%
      indMult:    1.05,
      solarMult:  0.08,   // solar -92%
      windMult:   1.45,   // wind +45%
      color: '#a8c8e8',
      startMsg: '🌬 Blizzard: Solar -92% · Residential +30% · Commercial +10% · Wind +45% · Whiteout: check your reserves',
      endMsg:   '🌬 The blizzard is blowing itself out',
    },
    {
      // Temperature inversion: still air traps the city's smog under a warm
      // lid. Wind drops to nothing, smog clears three times slower and piles
      // up around every plant still burning (PollutionSystem reads this).
      type: 'smog',
      label: '🌫 Smog Day',
      minWs: 1500,
      duration: () => 240 + Math.random() * 180,  // 4-7 min
      demandMult: 1.0,
      solarMult:  0.85,
      windMult:   0.3,
      smogTrap:   3,      // smog clears this many times slower
      color: '#9a8a50',
      startMsg: '🌫 Smog day: Still air traps pollution · Smog clears 3× slower · Wind -70% · Solar -15%',
      endMsg:   '🌫 The inversion lifts; air starting to clear',
      extraRows: [['Smog Clearing', '3× slower', true]],
    },
    {
      // Dead calm: not a breath of wind under a clear, still sky. Turbines
      // all but stop and fall to their base output, which itself sags now and
      // then (WindState.lull). Only comes once there are turbines to stall.
      type: 'calm',
      label: '🎐 Dead Calm',
      minWs: 1000,
      duration: () => 240 + Math.random() * 240,  // 4-8 min
      demandMult: 1.0,
      solarMult:  1.0,
      windMult:   0,
      color: '#6a8a7a',
      startMsg: '🎐 Dead calm: Not a breath of wind · Wind turbines drop to minimum output, sometimes even lower · Lean on your other power sources',
      endMsg:   '🎐 A breeze is picking up: turbines are turning again',
      extraRows: [['Wind Turbines', 'Minimum output or below', true]],
    },
    {
      // Dust storm: a hot, dry gale out of the summer fields. A brown haze
      // cuts solar while it blows, and the dust it drops on the panels stays
      // (SolarDust in power_network.js) until rain washes it off or it slowly
      // blows clear; a Solar Array's wash robots strip theirs. Low
      // visibility slows the trucks and drones.
      type: 'dust',
      label: '🌪 Dust Storm',
      minWs: 0,
      duration: () => 180 + Math.random() * 180,  // 3-6 min
      demandMult: 1.05,   // residential +5% (shut in, fans on)
      solarMult:  0.5,
      travelMult: 0.8,
      color: '#a07a40',
      startMsg: '🌪 Dust storm: Solar -50% · Dust settles on panels until rain washes it off · Vehicle speed -20%',
      endMsg:   '🌪 The dust is settling: panels will need rain to wash clean',
      extraRows: [['Solar Panels', 'Dust settling (rain washes it off)', true], ['Vehicle Speed', '-20%', true]],
    },
    {
      // Fog: a still spring or autumn morning. It rolls in around dawn and
      // burns off by mid-morning, cutting solar and slowing everything that
      // has to see where it is going.
      type: 'fog',
      label: '🌫 Fog',
      minWs: 500,
      // Until about half past ten, whenever it rolls in.
      duration: () => Math.max(120, Math.min(420, (10.5 - DayNight.hour()) * DayNight.secondsPerGameHour())),
      demandMult: 1.0,
      solarMult:  0.55,
      travelMult: 0.65,
      color: '#8a96a0',
      startMsg: '🌫 Fog rolling in: Solar -45% · Vehicle speed -35% until it burns off',
      endMsg:   '🌫 The fog is burning off',
      extraRows: [['Vehicle Speed', '-35%', true]],
    },
    {
      // Geomagnetic storm: a burst off the sun hits the planet's field. The
      // sky fills with aurora (AuroraSystem, weather_state.js), and the
      // currents it induces in the ground ride into long power lines and
      // transformers: wires on big networks trip, and substations and
      // batteries bleed stored charge. Surge protectors cut both (see
      // _geomagTick). The trips come in bursts with the visible substorms.
      // Lines carry less (lineMult: PowerNetwork's rating), fusion's
      // superconducting magnets lose output (magnetMult: steam and MHD Rings,
      // eased by surge protection), and drones crawl (droneMult) on the same
      // range. Late game only.
      type: 'geomag',
      label: '🌌 Geomagnetic Storm',
      minWs: 5000,
      duration: () => 300 + Math.random() * 240,  // 5-9 min
      demandMult: 1.0,
      solarMult:  1.0,
      lineMult:   0.82,
      magnetMult: 0.8,
      droneMult:  0.4,
      storeChargeMult: 0,   // saturated transformers: storage can't take charge, so the leak (GEOMAG_LOSS) really lands
      color: '#8a6cff',
      startMsg: '🌌 Geomagnetic storm: Line capacity down 18% · Induced currents trip long power lines in bursts · Substations & batteries lose 60% of their charge and cannot recharge · Fusion output down 20% · Drones fly far slower · Surge protectors halve trips and fusion loss at best',
      endMsg:   '🌌 The geomagnetic storm is subsiding: the auroras are fading',
      extraRows: [['Line Capacity', '-18%', true], ['Long Power Lines', 'May trip in bursts', true], ['Stored Charge', '-60%, no recharging', true], ['Fusion Output', '-20%', true], ['Drone Speed', '-60%', true], ['Surge Protectors', 'Up to half off trips, fusion loss', false]],
    },
    {
      // Freezing fog: supercooled droplets that freeze on whatever they
      // touch. Rime builds on wind-turbine blades (TurbineIcing below):
      // output falls as it thickens, a fully iced turbine stops until it
      // melts off, and MK3s' heated blades hold it to a thin film. Cold-
      // season nights and mornings, once there are turbines to ice.
      type: 'icing',
      label: '🌁 Freezing Fog',
      minWs: 1000,
      duration: () => 300 + Math.random() * 240,  // 5-9 min
      demandMult: 1.08,
      solarMult:  0.6,
      travelMult: 0.75,
      color: '#9ab8d0',
      startMsg: '🌁 Freezing fog: Rime ice building on wind turbine blades · Iced turbines lose output, then stop until it melts · MK3 heated blades resist · Solar -40% · Vehicle speed -25%',
      endMsg:   '🌁 The fog is lifting: turbine ice will melt off as it warms',
      extraRows: [['Wind Turbines', 'Icing up: output falling', true], ['MK3 Heated Blades', 'Hold ice off: -12% output', false], ['Vehicle Speed', '-25%', true]],
    },
    {
      // Wildfire smoke: a fire burning somewhere out past the hills and the
      // wind carrying its smoke over the city. An orange-brown haze cuts
      // solar, homes shut their windows and run the purifiers, smog clears
      // half as fast, ash settles on the panels (the dust film, SolarDust in
      // power_network.js) and stays until rain washes it off, and soot
      // settling on insulators makes lines running through wooded ground
      // flash over and trip (_smokeTick). Late summer into early autumn,
      // when the land is driest.
      type: 'smoke',
      label: '🔥 Wildfire Smoke',
      minWs: 1000,
      duration: () => 300 + Math.random() * 300,  // 5-10 min
      demandMult: 1.06,
      comMult:    1.03,
      solarMult:  0.55,
      travelMult: 0.85,
      smogTrap:   2,
      color: '#c06a30',
      startMsg: '🔥 Wildfire smoke: Solar -45% · Ash settles on panels until rain washes it off · Residential +6% · Smog clears 2× slower · Lines near trees may flash over and trip · Surge protectors reduce the risk',
      endMsg:   '🔥 The smoke is thinning: the wind has turned. Panels will need rain to wash the ash off',
      extraRows: [['Solar Panels', 'Ash settling (rain washes it off)', true], ['Smog Clearing', '2× slower', true], ['Lines Near Trees', 'Flashovers likely', true], ['Vehicle Speed', '-15%', true], ['Surge Protectors', 'Reduce trips', false]],
    },
  ];

  // The event the ground the player is standing on is under. On a contract
  // site that is none: the home event is frozen for the trip (game_loop.js
  // stops ticking it) and belongs to a city that is not on the grid, and the
  // site's own sky is cloud and precipitation with no event behind it. The
  // site used to inherit whatever home was in the middle of: leave during a
  // storm and the job ran under a clear sky that read STORM, with solar cut
  // by three quarters and demand up, for as long as the crew stayed.
  function _felt() { return _visualOverride === null ? _activeEvent : null; }

  // How many times slower smog clears right now (1 = normal).
  function getSmogTrap() {
    const active = _felt();
    if (!active) return 1;
    const ev = WEATHER_EVENTS.find(e => e.type === active.type);
    return ev?.smogTrap ?? 1;
  }

  function getActiveMult(entityType) {
    // The season's own pull on demand (homes cooling or heating), with or
    // without an event running.
    const season = typeof Seasons !== 'undefined' ? Seasons.demandMult(entityType) : 1;
    const active = _felt();
    if (!active) return season;
    const ev = WEATHER_EVENTS.find(e => e.type === active.type);
    if (!ev) return season;
    if (entityType === T.HOUSE) return (ev.demandMult || 1) * season;
    if (entityType === T.COMMERCIAL) return ((ev.comMult || ev.demandMult) || 1) * season;
    if (entityType === T.INDUSTRIAL) return (ev.indMult || 1) * season;
    return season;
  }

  function getSolarMult() {
    const active = _felt();
    if (!active) return 1;
    const ev = WEATHER_EVENTS.find(e => e.type === active.type);
    return ev?.solarMult ?? 1;
  }
  // How fast trucks and drones can safely travel right now (fog, dust).
  function getTravelMult() {
    const active = _felt();
    if (!active) return 1;
    const ev = WEATHER_EVENTS.find(e => e.type === active.type);
    return ev?.travelMult ?? 1;
  }
  function getWindMult() {
    const active = _felt();
    if (!active) return 1;
    const ev = WEATHER_EVENTS.find(e => e.type === active.type);
    return ev?.windMult ?? 1;
  }
  // How fast drones can fly right now, on top of getTravelMult.
  function getDroneMult() {
    const active = _felt();
    if (!active) return 1;
    return WEATHER_EVENTS.find(e => e.type === active.type)?.droneMult ?? 1;
  }
  // Share of the usual charge rate substations and batteries can take now.
  function getStoreChargeMult() {
    const active = _felt();
    if (!active) return 1;
    return WEATHER_EVENTS.find(e => e.type === active.type)?.storeChargeMult ?? 1;
  }
  // A geomagnetic storm's pull on the grid, swelling with the aurora rather
  // than landing all at once, so a grid near its limit gets a moment to react.
  const _geomagK = () => (typeof AuroraSystem !== 'undefined' ? AuroraSystem.intensity : 1);
  // Share of its rating a power line can carry right now.
  function getLineMult() {
    const active = _felt();
    if (!active) return 1;
    const m = WEATHER_EVENTS.find(e => e.type === active.type)?.lineMult;
    return m === undefined ? 1 : 1 - (1 - m) * _geomagK();
  }
  // Share of its output a fusion magnet system holds on network `netId`.
  function getMagnetMult(netId) {
    const active = _felt();
    if (!active) return 1;
    const m = WEATHER_EVENTS.find(e => e.type === active.type)?.magnetMult;
    if (m === undefined) return 1;
    return 1 - (1 - m) * _geomagK() * _geomagResist(netId);
  }
  // Surge protection against this storm only goes so far: the full curve takes
  // a well-protected grid down to a few percent of every other weather fault,
  // which would leave a late-game storm with nothing to do. At best, half.
  const GEOMAG_RESIST_FLOOR = 0.5;
  function _geomagResist(netId) {
    return Math.max(GEOMAG_RESIST_FLOOR, PowerNetwork.faultResistance ? PowerNetwork.faultResistance(netId) : 1);
  }

  // ── Ambient temperature ─────────────────────────────────────────────
  // Diurnal curve (coolest before dawn, hottest mid-afternoon) plus the
  // active event's offset. This used to live inline in stats_panel.js as a
  // display-only figure; it is shared now because the geothermal chain
  // reads it too, and a HUD reading that disagreed with the sim would be
  // worse than no reading at all.
  const TEMP_BASE = 18;   // °C — the neutral point everything is measured against
  const EVENT_TEMP_OFFSET = { heatwave: 12, coldsnap: -14, rainstorm: -4, storm: -3, rainfall: -2, smog: 3, snowfall: -5, blizzard: -11, calm: 2, dust: 4, fog: -2, geomag: 0, icing: -10, smoke: 5 };

  function getTemperature() {
    const h = DayNight.hour();
    const diurnal = 10 * Math.sin((h - 6) / 24 * Math.PI * 2) + 4 * Math.sin((h - 14) / 24 * Math.PI * 2);
    const active = _felt();
    const evOff = active ? (EVENT_TEMP_OFFSET[active.type] || 0) : 0;
    const season = typeof Seasons !== 'undefined' ? Seasons.tempOffset() : 0;
    return TEMP_BASE + diurnal + evOff + season;
  }

  // How far off-neutral it is right now, for anything that scales on heat.
  function getTemperatureDelta() { return getTemperature() - TEMP_BASE; }

  function getActiveEvent() { return _felt(); }
  // What to call the event running: its own name when something brought it
  // under one (an Ice Storm is a cold snap underneath), else its type's.
  function labelOf(active) {
    if (!active) return '';
    if (active.label) return active.label;
    const ev = WEATHER_EVENTS.find(e => e.type === active.type);
    return ev ? ev.label : active.type;
  }
  // The home event whether or not the player is there to feel it: what a
  // save has to keep.
  function getHomeEvent() { return _activeEvent; }

  // -- The visual set ----------------------------------------------
  //
  // Rain is not one system: droplets (RainSystem), the splashes they make
  // (GroundSplashSystem), the audio, and during a rainstorm the lightning,
  // wind streaks and debris. They are only coherent if they are switched
  // TOGETHER, and every place that flips them by hand is a chance to leave
  // half the set running.
  //
  // That is exactly what went wrong: contract travel called RainSystem
  // .start()/.stop() on its own, so stopping home rain to arrive under a
  // clear sky left the splashes, lightning and storm audio running -- ground
  // splashes with no droplets above them -- and starting site rain gave
  // droplets with no splashes and no sound. Both paths now go through here,
  // so a caller cannot start or stop half a sky.
  // Members are held as thunks, not as the modules themselves. This file is
  // loaded before the audio modules, so a table of direct references would
  // dereference RainAudio before it exists and throw at load; a table of
  // NAMES looked up on `window` does not work either, because every module
  // here is a top-level `const` and those never become window properties.
  // A thunk defers the lookup to call time while keeping it lexical.
  const _VISUALS = {
    rainstorm: [() => RainSystem, () => RainAudio, () => GroundSplashSystem,
                () => LightningSystem, () => HeavyWindAudio,
                () => WindStreakSystem, () => StormDebrisSystem],
    rainfall:  [() => RainSystem, () => RainAudio, () => GroundSplashSystem],
    // Snow is RainSystem in its snow mode (set in _startVisuals): no splashes
    // and no rain on the roof. A blizzard adds the storm's wind.
    snowfall:  [() => RainSystem],
    blizzard:  [() => RainSystem, () => WindStreakSystem, () => HeavyWindAudio],
    storm:     [() => WindStreakSystem, () => HeavyWindAudio, () => StormDebrisSystem],
    heatwave:  [() => HeatSystem],
    dust:      [() => DustSystem, () => HeavyWindAudio, () => StormDebrisSystem],
    fog:       [() => FogSystem],
    icing:     [() => FogSystem],
    smoke:     [() => SmokeSystem],
    geomag:    [() => AuroraSystem],
  };

  // A system that is not loaded is skipped rather than thrown on: these are
  // presentation layers, and a sky with no audio module should still rain.
  function _resolve(thunk) {
    try { return thunk(); } catch (e) { return undefined; }
  }

  // Depth of snow each lays per second (FrostSystem.snowing): a snowfall
  // leaves about 0.12-0.28 by the time it ends, a blizzard 0.4 or more.
  // Both were about twice this: a snowfall now settles at half its old
  // rate, and a blizzard at the rate a snowfall used to.
  const _SNOW = { snowfall: 0.00085, blizzard: 0.0017 };
  // `instant`: the event was already under way (restored from a save), so
  // any system that can (snap()) skips its fade-in and is there at once.
  function _startVisuals(type, duration, instant = false) {
    // Every event says what falls, so a snowfall can't leave the next rain white.
    try { RainSystem.setSnow(type in _SNOW, type === 'blizzard'); } catch (_e) {}
    for (const thunk of (_VISUALS[type] || [])) {
      const sys = _resolve(thunk);
      if (!sys || typeof sys.start !== 'function') continue;
      // Only RainSystem takes a duration; the rest ignore the argument, but
      // passing undefined through would override their own defaults.
      if (sys === RainSystem && duration != null) sys.start(duration);
      else sys.start();
      if (instant && typeof sys.snap === 'function') sys.snap();
    }
    if (type === 'coldsnap' || type === 'icing') FrostSystem.triggerFrost(0.4);   // a rime, not a snowfall
    if (type in _SNOW) FrostSystem.snowing(_SNOW[type]);
    if (type === 'smog') WindState.holdCalm(duration ?? Math.max(0, (_activeEvent?.endTime ?? 0) - _gameTime));
    if (type === 'calm') WindState.holdCalm(duration ?? Math.max(0, (_activeEvent?.endTime ?? 0) - _gameTime), true);
  }

  // `instant`: gone at once (a load replacing the sky), not fading out.
  function _stopVisuals(type, instant = false) {
    for (const thunk of (_VISUALS[type] || [])) {
      const sys = _resolve(thunk);
      if (sys && typeof sys.stop === 'function') sys.stop();
      if (instant && sys && typeof sys.snap === 'function') sys.snap();
    }
    if (type === 'coldsnap' || type === 'icing') FrostSystem.clear();
    if (type in _SNOW) FrostSystem.stopSnowing();   // what fell stays, and melts in its own time
    if (type === 'smog' || type === 'calm') WindState.releaseCalm();
  }

  // Every visual any event can own, regardless of which one is active.
  // Used to wipe the sky clean before imposing something else on it.
  function _stopAllVisuals() {
    for (const type of Object.keys(_VISUALS)) _stopVisuals(type);
    WindState.releaseCalm();   // a smog day's or a dead calm's still air
  }

  // -- Contract travel: a sky that is not the home event's ---------
  //
  // A job site has its own weather with no event behind it, so the visuals
  // have to be set directly. Holding that as an override -- rather than
  // letting callers poke the systems -- means there is still exactly one
  // owner of the visual set, and coming home is a resync rather than a
  // guess about what to turn back on.
  let _visualOverride = null;

  function setVisualOverride(kind) {
    _visualOverride = kind || null;
    _stopAllVisuals();
    // The home event's card goes away with its sky; syncVisuals puts it back.
    if (_visualOverride !== null && _activeEvent && _activeEvent.notifId) {
      NotificationStack.dismiss(_activeEvent.notifId);
      _activeEvent.notifId = null;
    }
    // Site rain is a 'rainfall'-shaped set: droplets, splashes and sound,
    // without a rainstorm's lightning and debris.
    if (kind === 'rain') _startVisuals('rainfall');
    // Site snow likewise: flakes (and for a blizzard, the wind) with snow
    // settling on the ground while it lasts.
    if (kind === 'snow') _startVisuals('snowfall');
    if (kind === 'blizzard') _startVisuals('blizzard');
  }

  function getVisualOverride() { return _visualOverride; }

  // Drop any override and put the sky back in step with the authoritative
  // event -- the same thing a save/load does, which is why reloading the
  // page was already enough to clear a desynced sky by hand.
  function syncVisuals() {
    _visualOverride = null;
    _stopAllVisuals();
    if (_activeEvent) {
      _startVisuals(_activeEvent.type);
      if (!_activeEvent.notifId) _activeEvent.notifId = _pushCard(_activeEvent.type, _activeEvent.label);
    }
  }

  function restoreEvent(ev) {
    _activeEvent = ev;
    if (ev) _startVisuals(ev.type);
  }

  let _lastFailureCheck = -9999;
  function triggerWeatherFailures() {
    // Stressed wires have a chance to fail during extreme demand.
    // Capped to at most one new failure per check, checked at most once
    // every 120 GAME seconds (_gameTime accumulates via dt, which scales
    // with DevMode.timeScale, so fast-forward compresses this gap —
    // e.g. at 10x speed, 120 game-seconds pass in 12 real seconds).
    // A fully-stressed network therefore fails one wire at a time,
    // spaced out, instead of many at once (every wire in a network
    // shares the same load value, so without this cap they'd all roll
    // simultaneously).
    if (_gameTime - _lastFailureCheck < 180) return;
    _lastFailureCheck = _gameTime;

    const stats = PowerNetwork.stats;
    const loadRatio = stats.totalConsumed / Math.max(1, stats.totalGenerated);
    if (loadRatio < 0.95) return; // not stressed enough
    const eligible = [];
    for (const e of EntityRegistry.getByType(T.WIRE)) {
      if (e.outOfRange || e.failed) continue;
      const wireLoad = e.load || 0;
      const capacity = e.def?.throughput || 85;
      const stress = wireLoad / capacity;
      if (stress > 0.95) eligible.push({ e, stress });
    }

    // Shuffle so failures land at random points across the network rather
    // than always favouring whichever wires were scanned first.
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }

    // A single stress check can now take down multiple wires at once —
    // anywhere from 1 to 12 across the network, picked randomly — instead
    // of always being limited to exactly one. Each eligible wire still
    // rolls its own independent failure chance based on its own stress.
    const maxFailuresThisCheck = 1 + Math.floor(Math.random() * 8); // 1-9
    let failed = 0;
    for (const pick of eligible) {
      if (failed >= maxFailuresThisCheck) break;
      // Surge protection on this wire's network scales the roll down —
      // see PowerNetwork.faultResistance. Protectors were ignored entirely
      // here, which is why MK2 banks never seemed to help during storms.
      const resist     = PowerNetwork.faultResistance
                       ? PowerNetwork.faultResistance(pick.e.networkId) : 1;
      const failChance = (pick.stress - 0.95) * 0.175 * loadRatio * resist; // reduced 65% from 0.5
      if (Math.random() < failChance) {
        pick.e.failed = true;
        pick.e._weatherFailed = true; // mark as weather-caused for repair UI
        _markFault(pick.e, 'overload');
        failed++;
      }
    }
    if (failed > 0) {
      PowerNetwork.recomputeWireHops();
      if (typeof GridBreakWatch !== 'undefined') GridBreakWatch.noteChanged();
      // Pinned notification — stays up (dedup'd by tag, so repeated faults
      // don't stack cards) until the player dismisses it or every fault on
      // the map is repaired (see the resolved-check in tick()).
      NotificationStack.push({
        icon: '⚡',
        title: 'Wire Fault',
        message: failed === 1
          ? 'Storm opened a wire; click to jump to the break'
          : `${failed} wires opened: click to jump to a break and repair`,
        color: '#ff4020',
        border: '#702010',
        tag: 'wirefault',
        glow: true,
        onClick: () => {
          if (typeof GridBreakWatch !== 'undefined' && GridBreakWatch.any()) GridBreakWatch.jumpNext();
          // Its panel has the repair buttons (this used to open a second window).
          for (const w of EntityRegistry.getByType(T.WIRE)) if (w._weatherFailed) { WireInspector.open(w); break; }
        },
      });
      _faultNotifActive = true;
    }
  }

  function tick(dt, totalWs) {
    _gameTime += dt;
    // Auto-dismiss the pinned wire-fault notification once every fault on
    // the map has actually been repaired — the player can also dismiss it
    // manually at any time regardless of whether faults remain.
    if (_faultNotifActive && _countFailedWiresNow() === 0) {
      NotificationStack.dismissTag('wirefault');
      _faultNotifActive = false;
    }
    // End active event
    if (_activeEvent && _gameTime >= _activeEvent.endTime) {
      const ev = WEATHER_EVENTS.find(e => e.type === _activeEvent.type);
      if (_activeEvent.notifId) NotificationStack.dismiss(_activeEvent.notifId);
      _activeEvent = null;
      // Reset solar mult via CloudState if storm
      if (ev?.type === 'storm') CloudState.clearBurst?.();
      if (ev) _stopVisuals(ev.type);
    }
    // Stress check during active events
    if (_activeEvent && totalWs > 2000) {
      triggerWeatherFailures();
    }
    if (_activeEvent && _activeEvent.type === 'geomag' && _visualOverride === null) _geomagTick(dt);
    if (_activeEvent && _activeEvent.type === 'smoke' && _visualOverride === null) _smokeTick();
    TurbineIcing.tick(dt);
  }

  // ── Wildfire smoke: flashover on lines near trees ─────────────────
  // Soot and ash settling on insulators in thick smoke lets them flash
  // over. Lines strung beside trees or bushes (where the smoke hangs and
  // the fuel is) are the ones at risk: every SMOKE_CHECK game seconds a few
  // of them may trip open, more where there are more such lines, scaled
  // down by surge protection like any weather fault.
  const SMOKE_CHECK = 75;
  let _lastSmoke = -9999;
  function _smokeTick() {
    if (_gameTime - _lastSmoke < SMOKE_CHECK) return;
    _lastSmoke = _gameTime;
    const nearTrees = [];
    for (const w of EntityRegistry.getByType(T.WIRE)) {
      if (w.failed || w.outOfRange) continue;
      let wooded = false;
      for (let dr = -1; dr <= 1 && !wooded; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const c = w.col + dc, r = w.row + dr;
        if (GridManager.inBounds(c, r) && GridManager.isVegetation(GridManager.getEntity(c, r))) { wooded = true; break; }
      }
      if (wooded) nearTrees.push(w);
    }
    if (!nearTrees.length) return;
    const resist = id => PowerNetwork.faultResistance ? PowerNetwork.faultResistance(id) : 1;
    // One try per 40 wooded lines, up to 5, each a 50% flashover before
    // surge protection. (Was 3 tries at 40%: a minor nuisance next to the
    // other line-tripping events.)
    const tries = Math.min(5, Math.ceil(nearTrees.length / 40));
    const tripped = [];
    for (let k = 0; k < tries; k++) {
      const w = nearTrees[Math.floor(Math.random() * nearTrees.length)];
      if (w.failed || Math.random() >= 0.5 * resist(w.networkId)) continue;
      w.failed = true; w._weatherFailed = true; _markFault(w, 'smoke'); tripped.push(w);
    }
    if (!tripped.length) return;
    PowerNetwork.recomputeWireHops();
    if (typeof GridBreakWatch !== 'undefined') GridBreakWatch.noteChanged();
    NotificationStack.push({
      icon: '🔥', title: 'Smoke Flashover',
      message: tripped.length === 1 ? 'Soot on an insulator flashed over and tripped a line by the trees; click to jump to the break'
                                    : `Smoke flashovers tripped ${tripped.length} lines by the trees: click to jump to a break and repair`,
      color: '#e08a40', border: '#703010', tag: 'wirefault', glow: true,
      onClick: () => {
        if (typeof GridBreakWatch !== 'undefined' && GridBreakWatch.any()) GridBreakWatch.jumpNext();
        for (const w of EntityRegistry.getByType(T.WIRE)) if (w._weatherFailed) { WireInspector.open(w); break; }
      },
    });
    _faultNotifActive = true;
  }

  // ── Geomagnetic storm effects ─────────────────────────────────────
  // Induced currents ride the long lines: wires on the big networks (where
  // the long runs are) may trip open, a few at a time, mostly in bursts as a
  // substorm lights the sky (AuroraSystem.substorm), and every substation and
  // battery bleeds part of its charge through its hot transformer, unable to
  // take any back until the storm ends (storeChargeMult). Surge protection on
  // a network scales the trips down, as for any weather fault, but only by
  // half at most (_geomagResist). It does nothing for the leak: a grid in good
  // shape refilled or shrugged off anything less.
  const GEOMAG_CHECK  = 15;     // game seconds between trip checks
  const GEOMAG_QUIET  = 0.08;   // chance per roll between substorms
  const GEOMAG_PEAK   = 0.45;   // and at the height of one
  const GEOMAG_NET    = 40;     // wires a network needs before it counts as long
  const GEOMAG_LOSS   = 0.6;    // share of stored charge a whole storm drains (was about 30-48%, and refilled as it went)
  const STORE_TYPES   = [T.BATTERY, T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5];
  let _lastGeomag = -9999;
  function _geomagTick(dt) {
    const resist = _geomagResist;
    // A steady rate over this storm's length, so short and long storms drain
    // the same. A storm restored from an older save has no `dur`: the average.
    const leak = -Math.log(1 - GEOMAG_LOSS) / (_activeEvent.dur || 420);
    for (const t of STORE_TYPES) for (const e of EntityRegistry.getByType(t)) {
      if (e.charge > 0) e.charge = Math.max(0, e.charge - e.charge * leak * dt);
    }
    if (_gameTime - _lastGeomag < GEOMAG_CHECK) return;
    _lastGeomag = _gameTime;
    const byNet = new Map();
    for (const w of EntityRegistry.getByType(T.WIRE)) {
      if (w.failed || w.outOfRange || w.networkId === undefined) continue;
      let l = byNet.get(w.networkId); if (!l) byNet.set(w.networkId, l = []); l.push(w);
    }
    let tripped = 0;
    const trippedWires = [];
    const chance = GEOMAG_QUIET + (GEOMAG_PEAK - GEOMAG_QUIET) * AuroraSystem.substorm;
    for (const [id, wires] of byNet) {
      if (wires.length < GEOMAG_NET) continue;
      // Longer networks catch more of the induced current.
      const tries = Math.min(4, Math.floor(wires.length / GEOMAG_NET));
      for (let k = 0; k < tries; k++) {
        if (Math.random() >= chance * resist(id)) continue;
        const w = wires[Math.floor(Math.random() * wires.length)];
        if (w.failed) continue;
        w.failed = true; w._weatherFailed = true; _markFault(w, 'geomag'); tripped++;
        trippedWires.push(w);
      }
    }
    if (!tripped) return;
    AuroraSystem.surge(trippedWires);   // the sky flashes, and a bolt leaps off each break
    try { SFX.geomagSurge?.(); } catch (_e) {}
    PowerNetwork.recomputeWireHops();
    if (typeof GridBreakWatch !== 'undefined') GridBreakWatch.noteChanged();
    NotificationStack.push({
      icon: '🌌', title: 'Geomagnetic Surge',
      message: tripped === 1 ? 'Induced current tripped a long line; click to jump to the break'
                             : `Induced currents tripped ${tripped} wires: click to jump to a break and repair`,
      color: '#a08cff', border: '#3a2a80', tag: 'wirefault', glow: true,
      onClick: () => {
        if (typeof GridBreakWatch !== 'undefined' && GridBreakWatch.any()) GridBreakWatch.jumpNext();
        for (const w of EntityRegistry.getByType(T.WIRE)) if (w._weatherFailed) { WireInspector.open(w); break; }
      },
    });
    _faultNotifActive = true;
  }

  // The card's body line: everything after the headline in startMsg. The
  // headline is set off by an em dash, colon or semicolon (all three are in
  // use); splitting on the dash alone left every card with a bare title.
  function _effectsOf(ev) {
    const m = (ev && ev.startMsg) || '';
    const i = m.search(/[—:;]/);
    return i >= 0 ? m.slice(i + 1).trim() : m.replace(/^\S+\s*/, '');
  }

  // The event's card in the notification stack; returns its id.
  function _pushCard(type, label) {
    const ev = WEATHER_EVENTS.find(e => e.type === type);
    if (!ev) return null;
    label = label || ev.label;
    return NotificationStack.push({
      icon: label.split(' ')[0],
      title: label.replace(/^\S+\s*/, ''),
      message: _effectsOf(ev),
      color: ev.color,
      border: ev.color,
      onClick: () => { document.getElementById('weather-tab-btn')?.click(); },
    });
  }

  // `label` names it something other than its type (SeasonalEvents' Ice
  // Storm is a cold snap underneath); it is kept with the event and saved.
  function triggerEvent(type, label) {
    const ev = WEATHER_EVENTS.find(e => e.type === type);
    if (!ev) return;
    const dur = ev.duration();
    _activeEvent = { type, endTime: _gameTime + dur, dur };
    if (label) _activeEvent.label = label;
    _activeEvent.notifId = _pushCard(type, label);
    try { SFX.weatherAlert?.(type); } catch (_e) {}
    // Storm also triggers visual cloud burst
    if (type === 'storm') {
      CloudState.triggerBurst(0.85, dur);
      WindState.triggerStorm(0.9, dur);
    }
    if (type === 'rainstorm') CloudState.triggerBurst(0.98, dur);
    if (type === 'rainfall')  CloudState.triggerBurst(0.7,  dur);
    if (type === 'snowfall')  CloudState.triggerBurst(0.8,  dur);
    if (type === 'blizzard') { CloudState.triggerBurst(0.98, dur); WindState.triggerStorm(0.95, dur); }
    if (type === 'coldsnap')  CloudState.triggerBurst(0.6,  dur);
    if (type === 'heatwave')  CloudState.triggerBurst(0.04, dur);   // a hard, clear sky
    if (type === 'calm')      CloudState.triggerBurst(0.08, dur);   // clear and still
    if (type === 'dust')    { CloudState.triggerBurst(0.25, dur); WindState.triggerStorm(0.55, dur); }
    if (type === 'fog')       CloudState.triggerBurst(0.4,  dur);
    if (type === 'icing')     CloudState.triggerBurst(0.55, dur);
    if (type === 'smoke')   { CloudState.triggerBurst(0.3,  dur); _lastSmoke = _gameTime; }   // first flashover roll a full interval in
    if (type === 'geomag')    CloudState.triggerBurst(0.1,  dur);   // clear skies, the better to see it
    _startVisuals(type, dur);
  }

  function getGameTime() { return _gameTime; }
  // `instant`: a load is replacing the sky, so the visuals go at once.
  function _forceEnd(instant = false) {
    if (!_activeEvent) return;
    const ev = WEATHER_EVENTS.find(e => e.type === _activeEvent.type);
    if (_activeEvent.notifId) NotificationStack.dismiss(_activeEvent.notifId);
    if (ev?.type === 'storm') CloudState.triggerBurst(0.05, 1);
    if (ev) _stopVisuals(ev.type, instant);
    _activeEvent = null;
  }
  // `fromSave`: restoring an event that was already running when the game
  // was saved, so its visuals come back at full strength, not fading in.
  function loadEvent(ev, gameTime, fromSave = false) {
    if (!ev) return;
    // Whatever was running before (loading over a game in progress) goes
    // first, card and sky, so the two never overlap.
    _forceEnd();
    // Restore active event — adjust endTime relative to current _gameTime
    _activeEvent = { ...ev, endTime: _gameTime + (ev.endTime - gameTime) };
    // Hold the first stress roll off for a full check interval. The throttle
    // otherwise starts at -9999, so the roll fired on the very first tick
    // after loading — before generators had reported any output (coal
    // generators, turbines and the like only come back on their own ticks,
    // which run after PowerNetwork). That one tick read as a grid carrying
    // its full demand on a fraction of its supply, so the load ratio shot
    // far past the stress gate and wires failed on almost every login
    // during a weather event.
    _lastFailureCheck = _gameTime;
    // A geomagnetic storm's trip roll has the same first-tick problem: hold
    // it off a full interval too, so a reload doesn't trip lines at once.
    // Wildfire smoke's flashover roll likewise.
    _lastGeomag = _gameTime;
    _lastSmoke  = _gameTime;
    _activeEvent.notifId = _pushCard(ev.type, ev.label);
    _startVisuals(ev.type, ev.endTime - gameTime, fromSave);
  }
  return { tick, getActiveMult, getSolarMult, getTravelMult, getDroneMult, getLineMult, getMagnetMult, getStoreChargeMult, getSmogTrap, getTemperature, getTemperatureDelta, TEMP_BASE, getActiveEvent, labelOf, getHomeEvent, restoreEvent, getGameTime, loadEvent, triggerEvent, setVisualOverride, getVisualOverride, syncVisuals, _forceEnd, WEATHER_EVENTS };
})();

/* ═══════════════════════════════════════════════════════════════════
   TURBINE ICING
   Freezing fog (and SeasonalEvents' Ice Storm, a little more gently)
   builds rime on wind-turbine blades. Each turbine carries _ice (0..1):
   the ice spoils the aerofoil, so output falls with it (up to LOSS), and at
   1 the turbine's ice detector stops it (_iceStopped) until it has melted
   back below RESTART_BELOW. Ice only builds while the weather lasts; after
   that it melts at a rate set by the temperature, slowly below freezing.
   MK1s ice fastest. MK3s have heated blades: ice never gets past
   HEATED_CAP, it is gone soon after the fog lifts, and the heaters cost
   HEATER_COST of the turbine's output while they run. PowerNetwork applies
   outputMult; the turbine renderers draw the rime and slow the rotor.
   _ice and _iceStopped are saved per turbine.
   ═══════════════════════════════════════════════════════════════════ */
const TurbineIcing = (() => {
  const TYPES = [T.WIND, T.WIND2, T.WIND3];
  // Ice per game second in full freezing fog: an MK1 stops in about four
  // minutes, an MK2 in about five and a half, so a short fog leaves most
  // MK2s turning and a long one stops them too.
  const RATE = { [T.WIND]: 1 / 240, [T.WIND2]: 1 / 330, [T.WIND3]: 1 / 330 };
  const LOSS = 0.55, HEATED_CAP = 0.3, HEATER_COST = 0.12, RESTART_BELOW = 0.5;
  let _anyIce = false, _stoppedNow = 0;

  // 0.75-1.25 per site: some turbines stand right in the fog's path.
  function _siteRate(e) {
    let h = Math.imul(e.col | 0, 73856093) ^ Math.imul(e.row | 0, 19349663);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return 0.75 + ((h >>> 0) % 1000) / 2000;
  }

  // How hard the weather is icing right now (0 = not at all).
  function severity() {
    const ev = WeatherEventSystem.getActiveEvent();
    if (!ev) return 0;
    if (ev.type === 'icing') return 1;
    if (ev.type === 'coldsnap' && ev.label === '🧊 Ice Storm') return 0.7;   // freezing rain
    return 0;
  }

  function tick(dt) {
    const sev = severity();
    if (!sev && !_anyIce) return;
    // Melting per game second once the weather has gone: a stopped turbine
    // restarts within a couple of game hours on a mild afternoon, but takes
    // most of a day while it stays below 1°C.
    const temp = WeatherEventSystem.getTemperature();
    const melt = temp > 1 ? 0.0008 + (temp - 1) * 0.0005 : 0.0005;
    let any = false, stopped = 0;
    for (const t of TYPES) for (const e of EntityRegistry.getByType(t)) {
      const heated = t === T.WIND3;
      let ice = e._ice || 0;
      if (sev) {
        ice += RATE[t] * sev * _siteRate(e) * dt;
        if (heated) ice = Math.min(ice, HEATED_CAP);
      } else if (ice > 0) {
        ice -= (heated ? melt + 0.004 : melt) * dt;
      }
      ice = Math.max(0, Math.min(1, ice));
      if (ice >= 1) e._iceStopped = true;
      else if (ice < RESTART_BELOW) e._iceStopped = false;
      e._ice = ice;
      e._iceHeating = heated && (sev > 0 || ice > 0.005);
      if (ice > 0 || e._iceStopped) any = true;
      if (e._iceStopped) stopped++;
    }
    _anyIce = any;
    if (stopped > 0 && _stoppedNow === 0 && typeof NotificationStack !== 'undefined') {
      NotificationStack.push({
        icon: '🧊', title: 'Turbines Iced Up',
        message: stopped === 1 ? 'A wind turbine has iced over and stopped until the ice melts'
                               : `${stopped} wind turbines have iced over and stopped until the ice melts`,
        color: '#9ab8d0', border: '#3a5870', tag: 'turbineice',
      });
    } else if (stopped === 0 && _stoppedNow > 0 && typeof NotificationStack !== 'undefined') {
      NotificationStack.dismissTag('turbineice');
    }
    _stoppedNow = stopped;
  }

  // What the ice leaves of a turbine's output (PowerNetwork).
  function outputMult(e) {
    if (e._iceStopped) return 0;
    const m = 1 - LOSS * (e._ice || 0);
    return e._iceHeating ? m * (1 - HEATER_COST) : m;
  }
  // How freely the rotor turns (renderers): stopped dead when iced over.
  function spinMult(e) { return e._iceStopped ? 0 : 1 - 0.4 * (e._ice || 0); }

  function summary() {
    let n = 0, stopped = 0, sum = 0;
    for (const t of TYPES) for (const e of EntityRegistry.getByType(t)) { n++; sum += e._ice || 0; if (e._iceStopped) stopped++; }
    return { turbines: n, stopped, avgIce: n ? sum / n : 0 };
  }
  // A load brings ice back on the turbines themselves; let tick look again.
  function noteLoaded() { _anyIce = true; _stoppedNow = 0; }

  return { TYPES, tick, severity, outputMult, spinMult, summary, noteLoaded, HEATED_CAP };
})();

const EventSystem = (() => {
  let nextEvent   = 600;   // 10 min before first possible event
  let lastHour    = -1;
  let warnedPeak  = false;
  let gameElapsed = 0;
  const _lastFired = {};   // type → game-seconds when last triggered

  // All spawn intervals/cooldowns below are stretched by this factor to cut
  // overall weather-event frequency by ~20% (felt too frequent at 1x).
  const FREQ_SCALE = 1.25;

  const EVENTS = [
    { id: 'storm',    minWs: 1000, cooldown: 600 * FREQ_SCALE },
    // With seasons on, heatwaves come only in summer and cold snaps keep to
    // the cold half of the year (Seasons.warmth is 0 with them off, so cold
    // snaps pass; heatwaves check enabled() for the same reason).
    { id: 'heatwave', minWs: 5000, cooldown: 900 * FREQ_SCALE, opposes: 'coldsnap',
      when: () => typeof Seasons === 'undefined' || !Seasons.enabled() || Seasons.index() === 1 },
    { id: 'coldsnap', minWs: 5000, cooldown: 900 * FREQ_SCALE, opposes: 'heatwave',
      when: () => typeof Seasons === 'undefined' || Seasons.warmth() < 0.3 },
    // Only where there is smog to trap — a clean city never gets one.
    { id: 'smog',     minWs: 1500, cooldown: 900 * FREQ_SCALE,
      when: () => typeof PollutionSystem !== 'undefined' && PollutionSystem.emissions() >= PollutionSystem.ALLOWANCE * 0.75 },
    // Only once there are wind turbines for the still air to stall.
    { id: 'calm',     minWs: 1000, cooldown: 900 * FREQ_SCALE,
      when: () => [T.WIND, T.WIND2, T.WIND3].some(t => EntityRegistry.getByType(t).size > 0) },
    // Dust off the fields once they have dried out: from midsummer (day 6
    // of summer) to early autumn (through day 5); with seasons off, any
    // time. Weather, not a reward for growth, so no power requirement.
    { id: 'dust',     minWs: 0,    cooldown: 900 * FREQ_SCALE,
      when: () => {
        if (typeof Seasons === 'undefined' || !Seasons.enabled()) return true;
        const i = Seasons.index(), d = Seasons.dayOfSeasonExact();
        return (i === 1 && d >= 6) || (i === 2 && d < 6);
      } },
    // Spring and autumn mornings, rolling in around dawn (seasons off: any morning).
    { id: 'fog',      minWs: 500,  cooldown: 900 * FREQ_SCALE,
      when: () => { const h = DayNight.hour(); return h >= 4 && h < 8 && (typeof Seasons === 'undefined' || !Seasons.enabled() || Seasons.index() === 0 || Seasons.index() === 2); } },
    // Late game: once the grid reaches the Advanced Reactor or fusion.
    { id: 'geomag',   minWs: 5000, cooldown: 1500 * FREQ_SCALE,
      when: () => Progression.isUnlocked(T.ADVREACTOR) || Progression.isUnlocked(T.HULKINGFUSIONREACTOR) },
    // Freezing fog: the cold half of the year (seasons off: any time), at
    // night or in the early morning, and only once there are turbines to ice.
    { id: 'icing',    minWs: 1000, cooldown: 1200 * FREQ_SCALE,
      when: () => {
        const h = DayNight.hour();
        if (!(h >= 22 || h < 9)) return false;
        if (typeof Seasons !== 'undefined' && Seasons.enabled() && Seasons.warmth() >= 0.3) return false;
        return TurbineIcing.TYPES.some(t => EntityRegistry.getByType(t).size > 0);
      } },
    // Wildfire smoke: from late summer (day 4) into early autumn (through
    // day 4), or any time a Dry Spell has the land parched; seasons off: any time.
    { id: 'smoke',    minWs: 1000, cooldown: 1200 * FREQ_SCALE,
      when: () => {
        if (typeof Seasons === 'undefined' || !Seasons.enabled()) return true;
        if (_rainHeld()) return true;
        const i = Seasons.index(), d = Seasons.dayOfSeasonExact();
        return (i === 1 && d >= 4) || (i === 2 && d < 5);
      } },
  ];

  let nextRain = (600 + Math.random() * 600) * FREQ_SCALE; // 10-20 min before first rainstorm
  let nextRainfall = (300 + Math.random() * 300) * FREQ_SCALE; // 5-10 min before first rainfall

  // Cold enough for precipitation to fall as snow: the middle of the cold
  // half of the year (never with seasons off, where warmth is 0).
  const _snowSeason = () => typeof Seasons !== 'undefined' && Seasons.warmth() < -0.45;
  // A Dry Spell keeps the sky dry for all of its twelve hours, not just the
  // few minutes its heat wave lasts.
  const _rainHeld = () => typeof SeasonalEvents !== 'undefined' && SeasonalEvents.holdsOffRain();

  function tickRain(dt, totalWs) {
    nextRain -= dt;
    if (nextRain <= 0 && totalWs >= 2000) {
      if (WeatherEventSystem.getActiveEvent() || _rainHeld()) {
        nextRain = 120; // something else is active — try again shortly
      } else {
        // Cold enough to snow: the storm arrives as a blizzard, and the
        // next is never far off while winter lasts.
        const snowing = _snowSeason();
        WeatherEventSystem.triggerEvent(snowing ? 'blizzard' : 'rainstorm');
        nextRain = (snowing ? 600 + Math.random() * 1500 : 720 + Math.random() * 4800) * FREQ_SCALE; // 12-92 min until next rainstorm (12-44 in winter)
      }
    }
  }

  function tickRainfall(dt, totalWs) {
    nextRainfall -= dt;
    if (nextRainfall <= 0 && totalWs >= 500) {
      if (WeatherEventSystem.getActiveEvent() || _rainHeld()) {
        nextRainfall = 90; // something else is active — try again shortly
      } else {
        WeatherEventSystem.triggerEvent(_snowSeason() ? 'snowfall' : 'rainfall');
        nextRainfall = (420 + Math.random() * 1200) * FREQ_SCALE; // 7-27 min until next rainfall
      }
    }
  }

  return {
    tick(dt, totalWs, totalGenerated) {
      gameElapsed += dt;
      WeatherEventSystem.tick(dt, totalWs);
      if (totalGenerated < 2) return;

      const hour = DayNight.hour();
      if (hour >= 16.5 && hour < 17 && !warnedPeak && lastHour < 16.5) {
        warnedPeak = true;
        showToast(
          '⚡ Evening peak approaching; residential demand spikes in ~1 min',
          '#804020', '#100804', '#604020'
        );
      }
      if (hour < 16) warnedPeak = false;
      lastHour = hour;

      nextEvent -= dt;
      // Below 1.5 kW only events with no power requirement (minWs 0) may
      // roll. The countdown only restarts once one fires, so the rest still
      // get their turn the moment the grid gets there, as before.
      const early = totalWs <= 1500;
      if (nextEvent <= 0) {
        let fired = false;
        // Never fire while another event is already running
        if (!WeatherEventSystem.getActiveEvent()) {
          const eligible = EVENTS.filter(ev => {
            if (early && ev.minWs > 0) return false;
            if (totalWs < ev.minWs) return false;
            if (ev.when && !ev.when()) return false;
            // Per-type cooldown
            if ((_lastFired[ev.id] || 0) + ev.cooldown > gameElapsed) return false;
            // Block if the opposing event fired recently (no heatwave right after coldsnap)
            if (ev.opposes && (_lastFired[ev.opposes] || 0) + ev.cooldown > gameElapsed) return false;
            return true;
          });
          if (eligible.length) {
            const ev = eligible[Math.floor(Math.random() * eligible.length)];
            _lastFired[ev.id] = gameElapsed;
            WeatherEventSystem.triggerEvent(ev.id);
            fired = true;
          }
        }
        if (!early || fired) nextEvent = (480 + Math.random() * 480) * FREQ_SCALE;  // 8-16 min between attempts
      }

      tickRain(dt, totalWs);
      tickRainfall(dt, totalWs);
    },

    // The countdowns go in the save. They used to live only here, so every
    // load put them back to their start-of-game values — and the first
    // rainstorm is deliberately early (12.5–25 min) where later ones are
    // 15–115 min apart, so a city played in sessions got a rainstorm, and
    // its lightning, about three times as often as intended.
    serialise() {
      return { nextEvent, nextRain, nextRainfall, gameElapsed, lastFired: { ..._lastFired } };
    },
    loadState(s) {
      for (const k of Object.keys(_lastFired)) delete _lastFired[k];
      if (s && typeof s.nextRain === 'number') {
        nextEvent = s.nextEvent; nextRain = s.nextRain; nextRainfall = s.nextRainfall;
        gameElapsed = s.gameElapsed || 0;
        Object.assign(_lastFired, s.lastFired || {});
      } else {
        // A save from before these were kept: it is a city already under
        // way, so roll ordinary between-storm gaps rather than the early
        // first-storm ones.
        nextEvent = (480 + Math.random() * 480) * FREQ_SCALE;
        nextRain = (720 + Math.random() * 4800) * FREQ_SCALE;
        nextRainfall = (420 + Math.random() * 1200) * FREQ_SCALE;
        gameElapsed = 0;
      }
      warnedPeak = false; lastHour = -1;
    },
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   DEMAND CURVES
   Per-consumer, time-of-day power demand.
   getDemand(type, subtype) returns W at the current hour.
   subtype is stored on commercial entities (e.commercialSubtype).

   House:     2 kW day · 6 kW evening (17-22) · 3 kW overnight
   Lamp:      0 kW day · 0.5 kW dusk-dawn
   Grocery:   5 kW day · 20 kW evening · 3 kW night
   ColdStore: 15 kW constant
   Factory:   30 kW day only · 0 kW night
   DataCen:   20 kW constant
   Café:      8 kW day · 4 kW evening · 0 kW night
   Office:    12 kW day · 2 kW evening · 0 kW night
   Clinic:    10 kW constant
   ═══════════════════════════════════════════════════════════════════ */
