/* ═══════════════════════════════════════════════════════════════════
   GENERATOR MELTDOWN
   Overdrive has no safety trip. A Fuel Generator at 100% heat or a Coal
   Generator at 100% boiler pressure keeps running (and keeps paying out
   its Overdrive watts), but a meltdown clock starts. Hold it there for
   the def's meltdownSeconds and the generator explodes, wrecking and
   igniting what stands around it and chain-detonating nearby generators
   (LightningDamageSystem.detonateGenerator does the blast itself).

   Easing off the throttle drains the clock again. A powered Throttle
   Governor never lets a generator get here in the first place, which is
   the point of building one.
   ═══════════════════════════════════════════════════════════════════ */

const MeltdownSystem = (() => {
  // The clock drains this many times faster than it filled once the level
  // drops back under 100%, so a player who reacts gets out of danger quickly
  // but can't flick back to Overdrive and pick up where they left off.
  const RECOVER_RATE = 1.5;

  // Generators with a live meltdown clock. Maintained by tick() so the
  // renderer and alarm never scan the registry.
  const _critical = new Set();
  let _alarmAt = 0;     // performance.now() ms of the next alarm blip
  let _lastTickMs = 0;  // last time any generator ticked — silences the alarm while paused

  function _name(gen) {
    return (gen.def?.label || EntityDefs[gen.type]?.label || 'Generator')
         + (gen._num !== undefined ? ` #${gen._num}` : '');
  }
  // Reactors scale by the world's Nuclear Timer setting. An Advanced
  // Reactor never gets less than the countdown song's lead-in (song start →
  // detonation), or the music couldn't start in time to land the drop.
  function limitFor(gen) {
    const base = EntityDefs[gen.type]?.meltdownSeconds || 25;
    if (gen.type !== T.NUCLEARREACTOR && gen.type !== T.ADVREACTOR) return base;
    const secs = base * (typeof Difficulty !== 'undefined' ? Difficulty.nukeTimerMult() : 1);
    if (gen.type === T.ADVREACTOR && typeof ApocalypseSystem !== 'undefined') return Math.max(ApocalypseSystem.DETONATE_AT, secs);
    return secs;
  }
  // A Nuclear Reactor runs the same clock (fed by NuclearSystem's core heat
  // when it runs uncooled), but its way out is cooling, not the throttle,
  // and what it does at zero is in a different league.
  const isReactor = (gen) => gen?.type === T.NUCLEARREACTOR || gen?.type === T.ADVREACTOR;
  function dangerRadius(gen) {
    // Grows when other running reactors sit inside the blast — the warning
    // footprint has to show the cluster-scaled radius, or the player sites a
    // second reactor against a ring that lies about what it will cost them.
    return isReactor(gen) ? LightningDamageSystem.nukeRadiusFor(gen) : LightningDamageSystem.blastRadius(gen);
  }

  // Seconds of meltdown clock on this generator (0 = safe).
  function elapsed(gen) { return gen?._meltdown > 0 ? gen._meltdown : 0; }
  // Seconds left before it goes up, or null when it isn't critical.
  function timeLeft(gen) {
    if (!(gen?._meltdown > 0)) return null;
    // Once the music is carrying a MOX countdown the SONG is the clock, and
    // every readout — the plate over the reactor, its info panel, the
    // full-screen countdown — has to show that one number. The sim clock
    // underneath drifts, and two timers disagreeing by several seconds on
    // the same screen reads as a bug at the worst possible moment.
    if (isDoomsday(gen) && ApocalypseSystem.ownsDetonation()) {
      const l = ApocalypseSystem.timeLeft();
      if (l != null) return l;
    }
    return Math.max(0, limitFor(gen) - gen._meltdown);
  }
  // Seconds of cooling before the clock is fully drained.
  function coolingLeft(gen) { return gen?._meltdown > 0 ? gen._meltdown / RECOVER_RATE : 0; }
  function isCritical(gen) { return !!gen && gen._meltdownHot === true && gen._meltdown > 0; }

  function _centre(gen) {
    const { x, y } = GridManager.tileToWorld(gen.col, gen.row);
    return { wx: x + (gen.width || 1) * TILE / 2, wy: y + (gen.height || 1) * TILE / 2 };
  }

  function _openPanel(gen) {
    if (isReactor(gen)) EntityInfoPanel.open(gen);
    else if (gen.type === T.FUELGEN && typeof FuelGenPanel !== 'undefined') FuelGenPanel.open(gen);
    else if (gen.type === T.COALGENERATOR && typeof CoalGenPanel !== 'undefined') CoalGenPanel.open(gen);
  }

  // An Advanced Reactor is the only thing in the game that can end the
  // run. It gets its own wording, and arming the apocalypse here is what
  // starts the music that the detonation is cut to — see
  // apocalypse_system.js for why the countdown is exactly this long.
  const isDoomsday = (gen) => gen?.type === T.ADVREACTOR && typeof ApocalypseSystem !== 'undefined';

  function _onCritical(gen) {
    const name = _name(gen);
    const secs = Math.round(limitFor(gen));
    if (isDoomsday(gen)) {
      ApocalypseSystem.arm(gen);
      const pressureD = gen._meltdownCause === 'pressure';
      const city = (typeof CityInfo !== 'undefined' && CityInfo.getCityName?.()) || 'the whole city';
      NotificationStack.dismissTag(`reactorheat-${gen.col},${gen.row}`);
      NotificationStack.dismissTag(`reactorpressure-${gen.col},${gen.row}`);
      NotificationStack.push({
        icon: '☢', title: 'MOX CORE CRITICAL',
        message: `${name} is going critical. A MOX core does not just level a neighbourhood; in ${secs}s it takes EVERY building you have ever placed, and the run ends. `
               + (pressureD
                   ? 'Its steam has nowhere to go; pipe a powered Steam Turbine to its STEAM OUT, or cut its fuel rods NOW.'
                   : 'Get Cryogenic Coolant into its CRYO IN NOW; pipe a Cryogenic Cooling Tower\'s CRYO OUT to it.'),
        color: '#b0ff60', border: '#ff3020', tag: 'meltdown', glow: true, emergency: true,
        onClick: () => { const c = _centre(gen); Camera.recentreOn(c.wx, c.wy); _openPanel(gen); },
      });
      _alarmAt = 0;
      return;
    }
    if (isReactor(gen)) {
      const pressure = gen._meltdownCause === 'pressure';
      NotificationStack.dismissTag(`reactorheat-${gen.col},${gen.row}`);
      NotificationStack.dismissTag(`reactorpressure-${gen.col},${gen.row}`);
      NotificationStack.push({
        icon: '☢', title: 'REACTOR MELTDOWN',
        message: `${name} is going critical. In ${secs}s it will level everything within ${dangerRadius(gen)} tiles. `
               + (pressure
                   ? 'Its steam has nowhere to go; pipe a powered Steam Turbine to its STEAM OUT, or cut its fuel rods to vent the pressure.'
                   : 'Pipe a working Cooling Tower into its COOL IN. Cutting its fuel rods now only helps if its decay heat turns over before the clock runs out.'),
        color: '#ffd040', border: '#ff3020', tag: 'meltdown', glow: true, emergency: true,
        onClick: () => { const c = _centre(gen); Camera.recentreOn(c.wx, c.wy); _openPanel(gen); },
      });
      _alarmAt = 0;
      return;
    }
    // Hitting critical is what "Overdrive has bitten" means now — it gates
    // the Throttle Governor unlock, so the fix arrives with the problem.
    Progression.noteOverdriveTrip();
    const governed = (gen._governorCount || 0) > 0;
    NotificationStack.push({
      icon: '🚨',
      title: 'Generator Critical',
      message: governed
        ? `${name} is melting down; its Throttle Governor has no power. Ease off Overdrive now`
        : `${name} is melting down; ease off Overdrive, or protect it with a Throttle Governor`,
      color: '#ff3020', border: '#a01808',
      tag: 'meltdown', glow: true,
      onClick: () => {
        const c = _centre(gen);
        Camera.recentreOn(c.wx, c.wy);
        _openPanel(gen);
      },
    });
    _alarmAt = 0;   // sound the first blip straight away
  }

  function _onSafe(gen) {
    _critical.delete(gen);
    gen._meltdownHot = false;
    // Pulled back in time — stand the apocalypse down and give the player
    // their soundtrack back.
    if (isDoomsday(gen)) ApocalypseSystem.disarm();
    if (_critical.size === 0) NotificationStack.dismissTag('meltdown');
  }

  // Advance one generator's meltdown clock for this tick. `level` is its
  // heat (fuel) or boiler pressure (coal); `hot` is true while it is burning
  // at or above 100%. Returns true if the generator exploded — the caller
  // must stop ticking it this frame.
  function tick(gen, level, hot, dt) {
    if (dt <= 0) return false;
    _lastTickMs = performance.now();

    // A reactor on a contract job site melts down like any other: there is no
    // interlock to catch it, the same countdown runs, and at zero it explodes.
    // What differs is the aftermath, which LightningDamageSystem.detonateNuclear
    // handles: the blast ends the contract with the player liable, and nothing
    // of it follows them home.

    // A MOX core that has already gone critical does not get reprieved by a
    // wobble. `hot` is "core heat is at 100% AND still climbing", and decay
    // heat turning over for a tick makes that flicker false — which drained
    // the clock, fired "pulled back from meltdown", and disarmed the
    // apocalypse mid-countdown (restarting the song each time it flipped
    // back). It also meant a neglected Advanced Reactor could sit at 100%
    // forever and never actually detonate.
    //
    // So for the Advanced Reactor the clock only recovers when the core is
    // genuinely COOLED — which is exactly what its warning tells the player
    // to do. Heat drifting off 100% on its own is not a rescue.
    if (isDoomsday(gen) && gen._meltdown > 0 && !gen._cooled) { hot = true; level = 1; }

    if (hot && level >= 1) {
      // Only announce a fresh emergency, not a climb back over 100% while
      // the clock is still draining from the last one.
      if (!(gen._meltdown > 0)) _onCritical(gen);
      gen._meltdownHot = true;
      gen._meltdown = (gen._meltdown || 0) + dt;
      _critical.add(gen);

      // Sparks and a growing rumble as it gets close.
      const frac = Math.min(1, gen._meltdown / limitFor(gen));
      if (Math.random() < dt * (1.5 + frac * 8)) {
        const { x, y } = GridManager.tileToWorld(gen.col, gen.row);
        const sx = x + Math.random() * (gen.width || 1) * TILE;
        const sy = y + Math.random() * (gen.height || 1) * TILE;
        Particles.spawn(sx, sy, Math.random() < 0.5 ? '#ffb030' : '#ff4010', 3 + (frac * 6 | 0));
      }
      if (frac > 0.7) Camera.shake?.(dt * 14 * (frac - 0.7));

      // Once the music is carrying a MOX countdown, zero is when the song
      // says — the sim clock runs fast at 5x and slow on a laggy tick, and
      // either would land the blast off the drop. Hold it just short and
      // let ApocalypseSystem fire it.
      if (isDoomsday(gen) && ApocalypseSystem.ownsDetonation() && gen._meltdown >= limitFor(gen)) {
        gen._meltdown = limitFor(gen) - 0.01;
        return false;
      }
      if (gen._meltdown >= limitFor(gen)) {
        _onSafe(gen);
        gen._meltdown = 0;
        // A job-site core never ends the run (ApocalypseSystem refuses it
        // there), so an Advanced Reactor on site takes the ordinary blast.
        const _onSite = typeof ContractSystem !== 'undefined' && ContractSystem.isAtSite && ContractSystem.isAtSite();
        if (isDoomsday(gen) && !_onSite) ApocalypseSystem.detonate(gen);
        else if (isReactor(gen)) LightningDamageSystem.detonateNuclear(gen);
        else LightningDamageSystem.detonateGenerator(gen);
        return true;
      }
      return false;
    }

    gen._meltdownHot = false;
    if (gen._meltdown > 0) {
      gen._meltdown = Math.max(0, gen._meltdown - dt * RECOVER_RATE);
      if (gen._meltdown === 0) {
        _onSafe(gen);
        showToast(`✅ ${_name(gen)} pulled back from meltdown`, '#40c060', '#001408', '#0a4020', 'meltdown');
        SFX.meltdownAverted?.();
      }
    }
    return false;
  }

  // Two-tone klaxon, faster as the most advanced clock runs down. Wall-clock
  // driven from render so it keeps an even beat whatever the sim tick rate.
  function _soundAlarm(worstFrac, reactor) {
    const now = performance.now();
    if (now - _lastTickMs > 400) return;   // paused
    if (now < _alarmAt) return;
    // A MOX core gets the deeper klaxon — the ordinary two-tone blip does
    // not carry against the music, and this one is announcing the end of
    // the save rather than a neighbourhood.
    if (typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.isDramatic()) {
      SFX.doomAlarm?.(0.10 + worstFrac * 0.10);
      _alarmAt = now + (1500 - worstFrac * 1050);
      return;
    }
    // A reactor going sounds the evacuation whoop, a generator the plant
    // klaxon; the worst clock drives how hard either one escalates.
    SFX.meltdownAlarm?.(0.05 + worstFrac * 0.05, { reactor, frac: worstFrac });
    _alarmAt = now + (1100 - worstFrac * 750);
  }

  // World space, drawn under the camera transform after entities: a pulsing
  // red glow over the generator, the blast footprint it will take out, and
  // a countdown plate above it.
  function render(ctx, t) {
    if (_critical.size === 0) return;
    let worst = 0, anyReactor = false;
    for (const gen of [..._critical]) {
      // Demolished or wrecked mid-meltdown — drop it.
      if (gen._lightningDamaged || GridManager.getEntity(gen.col, gen.row) !== gen) { _onSafe(gen); gen._meltdown = 0; continue; }
      const limit = limitFor(gen);
      const frac  = Math.min(1, gen._meltdown / limit);
      const hot   = gen._meltdownHot;
      if (hot) { worst = Math.max(worst, frac); anyReactor = anyReactor || isReactor(gen); }

      const { x, y } = GridManager.tileToWorld(gen.col, gen.row);
      const w = (gen.width || 1) * TILE, h = (gen.height || 1) * TILE;
      const cx = x + w / 2, cy = y + h / 2;
      const pulse = 0.5 + 0.5 * Math.sin(t * (4 + frac * 14));
      const rTiles = dangerRadius(gen);
      const r = rTiles * TILE;

      ctx.save();

      // Danger zone: the blast is measured from the footprint's edge, so its
      // true shape is the footprint grown by the radius with rounded corners.
      ctx.globalAlpha = hot ? 0.06 + 0.10 * frac * pulse : 0.04;
      ctx.fillStyle = '#ff2010';
      ctx.beginPath(); ctx.roundRect(x - r, y - r, w + 2 * r, h + 2 * r, r); ctx.fill();
      ctx.globalAlpha = hot ? 0.45 + 0.45 * pulse : 0.3;
      ctx.strokeStyle = '#ff3020';
      ctx.lineWidth = Math.max(1.5, 2.5 / Camera.zoom);
      ctx.setLineDash([10 / Camera.zoom, 7 / Camera.zoom]);
      ctx.lineDashOffset = -t * 30 / Camera.zoom;
      ctx.stroke();
      ctx.setLineDash([]);

      // Heat bloom over the building itself.
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.75);
      g.addColorStop(0, `rgba(255,${hot ? 90 : 150},30,${(0.25 + 0.4 * frac) * (0.6 + 0.4 * pulse)})`);
      g.addColorStop(1, 'rgba(255,40,0,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(cx - w, cy - h, w * 2, h * 2);

      // Countdown plate — sized in screen pixels so it's readable zoomed out.
      const fs   = Math.max(10, 15 / Camera.zoom);
      // timeLeft(), not limit − _meltdown: for a MOX core in its final stretch
      // the song is the clock, and this plate must agree with the big screen.
      const label = hot ? `☢ ${isReactor(gen) ? 'CORE CRITICAL' : 'MELTDOWN'} ${Math.ceil(timeLeft(gen) ?? Math.max(0, limit - gen._meltdown))}s`
                        : `COOLING ${Math.ceil(coolingLeft(gen))}s`;
      ctx.font = `bold ${fs}px Courier New`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width;
      const ly = y - fs * 1.1;
      ctx.fillStyle = 'rgba(20,2,0,0.85)';
      ctx.beginPath(); ctx.roundRect(cx - tw / 2 - fs * 0.5, ly - fs * 0.75, tw + fs, fs * 1.5, fs * 0.3); ctx.fill();
      ctx.strokeStyle = hot ? '#ff3020' : '#ffa040'; ctx.lineWidth = Math.max(1, 1.5 / Camera.zoom); ctx.stroke();
      ctx.fillStyle = hot ? (pulse > 0.5 ? '#ff5030' : '#ffd040') : '#ffc060';
      ctx.fillText(label, cx, ly);

      ctx.restore();
    }
    if (worst > 0) _soundAlarm(worst, anyReactor);
  }

  return { tick, render, timeLeft, elapsed, coolingLeft, isCritical, limitFor };
})();
