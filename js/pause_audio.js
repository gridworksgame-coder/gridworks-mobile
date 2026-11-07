/* ═══════════════════════════════════════════════════════════════════
   PAUSE AUDIO
   Opening the pause menu gives every sound playing in the world a quick
   fade out and then pauses it: music, ambience beds, machine hums. Closing
   the menu picks them all back up where they stopped, with a short fade in.

   The game's sounds are dozens of independent <audio> elements, and many of
   them rewrite their own volume every frame (zoom, proximity, crossfades),
   which would undo a fade written straight to el.volume. So this sits
   underneath them instead: HTMLMediaElement's `volume` is wrapped so the
   level a module asks for is kept as-is and the fade is multiplied in on
   the way to the real element, and `play` is wrapped so a background sound
   can't restart itself while the menu is open. Every module keeps working
   exactly as before and never has to know about the pause menu.

   Menu one-shots (button clicks) still play while paused: an element that
   has never played before and isn't a loop or a music track is let through.
   The Web Audio beds (ambience, hums, machine loops, fire) all feed one
   shared gain node, SFX.bus(), which fades on the same curve and stays at
   zero while the menu is open. (Suspending the AudioContext doesn't hold:
   SFX.context() resumes it whenever a loop ticks.)
   ═══════════════════════════════════════════════════════════════════ */

const PauseAudio = (() => {
  const FADE_OUT_MS = 350;
  const FADE_IN_MS  = 250;
  const STEP_MS     = 16;

  const proto = HTMLMediaElement.prototype;
  const volDesc = Object.getOwnPropertyDescriptor(proto, 'volume');
  const nativePlay  = proto.play;
  const nativePause = proto.pause;
  if (!volDesc || !volDesc.set) return { isPaused: () => false };

  const live = new Set();      // elements that are (or were last seen) playing
  let held = null;             // background elements silenced for this pause; null when not paused
  let fade = 1;                // multiplier applied to held elements
  let target = 1;
  let stopped = false;         // fade-out finished and the held elements are paused
  let timer = null;

  const wanted = (el) => (el._gwVol !== undefined ? el._gwVol : volDesc.get.call(el));
  const apply = (el) => volDesc.set.call(el, Math.max(0, Math.min(1, wanted(el) * (held && held.has(el) ? fade : 1))));
  // _gwExempt: a sound that belongs to whatever is holding the world quiet
  // (the Operation Hyperion finale's song), never held.
  const isBackground = (el) => !el._gwExempt && (el._gwPlayed || el.loop || /\/music\//.test(el.currentSrc || el.src || ''));

  Object.defineProperty(proto, 'volume', {
    configurable: true,
    enumerable: volDesc.enumerable,
    get() { return wanted(this); },
    set(v) { this._gwVol = v; apply(this); },
  });

  proto.play = function () {
    if (held && target === 0 && isBackground(this)) {
      // Asked to start while the menu is open: remember it for the resume
      // instead of letting it sound.
      held.add(this);
      this._gwResume = true;
      if (stopped) return Promise.resolve();
      apply(this);
    }
    if (!this._gwPlayed) {
      this._gwPlayed = true;
      this.addEventListener('ended', () => live.delete(this));
    }
    live.add(this);
    return nativePlay.apply(this, arguments);
  };

  function busFade() {
    try {
      const bus = typeof SFX !== 'undefined' && SFX.bus ? SFX.bus() : null;
      if (bus) bus.gain.setTargetAtTime(fade, bus.context.currentTime, 0.015);
    } catch (_e) {}
  }

  function step() {
    const dur = target === 0 ? FADE_OUT_MS : FADE_IN_MS;
    const d = STEP_MS / dur;
    fade = target === 0 ? Math.max(0, fade - d) : Math.min(1, fade + d);
    if (held) for (const el of held) apply(el);
    busFade();
    if (fade !== target) return;
    clearInterval(timer); timer = null;
    if (target === 0) {
      for (const el of held) if (!el.paused) { el._gwResume = true; nativePause.call(el); }
      stopped = true;
    } else {
      const h = held; held = null;
      if (h) for (const el of h) apply(el);   // back to exactly what each module asked for
    }
  }

  function run() { if (!timer) timer = setInterval(step, STEP_MS); }

  function pause() {
    if (target === 0) return;
    target = 0;
    if (!held) {
      held = new Set();
      for (const el of live) {
        if (el.paused || el.ended) { if (el.paused) live.delete(el); continue; }
        if (el._gwExempt) continue;
        held.add(el);
      }
    }
    run();
  }

  function resume() {
    if (target === 1) return;
    target = 1;
    if (stopped) {
      stopped = false;
      for (const el of held) {
        if (!el._gwResume) continue;
        el._gwResume = false;
        apply(el);
        nativePlay.call(el).catch(() => {});
        live.add(el);
      }
    }
    run();
  }

  // Two things can hold the world quiet: the pause menu, and a cutscene that
  // wants the stage to itself (holdForScene). Either keeps it held, so the
  // menu closing can't bring the ambience back in under a scene.
  let menuHeld = false, sceneHeld = false;
  const update = () => (menuHeld || sceneHeld ? pause() : resume());

  // Follow the pause menu's visibility, whichever path opens or closes it.
  function watch() {
    const el = document.getElementById('pause-menu');
    if (!el) return;
    const sync = () => { menuHeld = el.classList.contains('visible'); update(); };
    new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ['class'] });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();

  return { pause, resume, isPaused: () => target === 0, holdForScene(on) { sceneHeld = !!on; update(); } };
})();
