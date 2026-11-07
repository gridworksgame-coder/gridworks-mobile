/* ═══════════════════════════════════════════════════════════════════
   LAG PROBE (F8)  (F9 is trailer mode)
   Run while the game is lagging. For a few seconds each it switches off
   one category of drawing at a time (conveyors, pipes, wires, trees,
   water, buildings, plants, everything) and measures the real frame
   rate, then writes a text report to the Desktop. The difference
   between the baseline and each row is what that category costs on
   THIS machine, in THIS world. The screen will flicker for about a
   minute; nothing is saved or changed in the world.
   ═══════════════════════════════════════════════════════════════════ */
const LagProbe = (() => {
  let running = false;
  const PHASE_SETTLE_MS = 1200, PHASE_MS = 3500;

  const CATS = [
    ['conveyors',          ['CONVEYOR']],
    ['pipes',              ['PIPE', 'UNDERGNDPIPE']],
    ['wires + towers',     ['WIRE', 'POWERTOWER']],
    ['poles + lamps',      ['POLE', 'LAMP', 'PROTECTOR']],
    ['trees + bushes',     ['TREE', 'BUSH']],
    ['water tiles',        ['WATER']],
    ['houses/shops/industry', ['HOUSE', 'COMMERCIAL', 'INDUSTRIAL']],
    ['wind + solar',       ['WIND', 'WIND2', 'WIND3', 'SOLAR']],
    ['everything except terrain', null],      // computed below: all types but WATER/TREE/BUSH
    ['EVERYTHING',         'all'],
  ];

  function note(msg, ms) {
    let el = document.getElementById('lag-probe-note');
    if (!el) {
      el = document.createElement('div'); el.id = 'lag-probe-note';
      el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99999;padding:10px 18px;' +
        'background:rgba(0,0,0,0.85);color:#ffd890;font:14px monospace;border:1px solid #ffd890;border-radius:4px;pointer-events:none;';
      document.body.appendChild(el);
    }
    el.textContent = msg; el.style.display = 'block';
    if (ms) setTimeout(() => { el.style.display = 'none'; }, ms);
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function _dropSpriteCaches() {
    try { BuildingSpriteCache.clear(); } catch (_) {}
    try { FixtureCache.clear(); } catch (_) {}
  }

  function fpsOver(ms) {
    return new Promise(resolve => {
      let n = 0; const t0 = performance.now();
      (function tick() { n++; if (performance.now() - t0 < ms) requestAnimationFrame(tick); else { fpsOver.frames = n; resolve(n / ((performance.now() - t0) / 1000)); } })();
    });
  }

  async function run() {
    if (running) return;
    if (typeof EntityRegistry === 'undefined' || typeof renderEntityAt !== 'function') return;
    running = true;
    const orig = renderEntityAt;
    const names = {}; for (const k of Object.keys(T)) names[T[k]] = k;
    const skip = new Set();
    const counts = {};
    let counting = false, baseFrames = 1;
    renderEntityAt = function (e) {
      if (counting) counts[e.type] = (counts[e.type] || 0) + 1;
      if (skip.has(e.type)) return;
      return orig.apply(this, arguments);
    };
    const lines = [];
    try {
      // Is the camera zoom actually holding still? A value that keeps creeping
      // makes every cached building bitmap look out of date, every frame.
      const zoomSamples = [];
      for (let i = 0; i < 6; i++) { zoomSamples.push(typeof Camera !== 'undefined' ? Camera.zoom : NaN); await sleep(150); }
      const ids = n => (Array.isArray(n) ? n : []).map(k => T[k]).filter(v => v !== undefined);
      const rows = [];
      for (const [label, spec] of [['warm-up', []], ['baseline', []], ...CATS, ['baseline again', []], ['baseline, 3rd', []]]) {
        let set;
        if (spec === 'all') set = Object.values(T);
        else if (spec === null) set = Object.values(T).filter(v => ![T.WATER, T.TREE, T.BUSH].includes(v));
        else set = ids(spec);
        skip.clear(); set.forEach(v => skip.add(v));
        // Cached sprites are blitted without going through renderEntityAt:
        // drop them so this phase's skips are baked in (or out) afresh.
        _dropSpriteCaches();
        counting = label === 'baseline'; if (counting) baseFrames = 0;
        if (counting) for (const k in counts) delete counts[k];
        note('Lag probe: ' + label + '  (' + (rows.length + 1) + '/' + (CATS.length + 4 + 7) + ') - please do not touch');
        await sleep(PHASE_SETTLE_MS);
        const fps = await fpsOver(PHASE_MS);
        if (counting) baseFrames = fpsOver.frames;
        counting = false;
        rows.push([label, fps]);
      }
      // The game's own per-frame timers, as of the last baseline phase.
      const timers = {};
      for (const k of ['Frame interval', 'Total game tick time', 'RenderSystem.render', 'Entity rendering', 'Zone life', 'Vegetation rendering', 'Sprite refreshes', 'BG cache redraw', 'BG job chunk', 'BG keyframe blend', 'PowerNetwork.tick']) {
        try { timers[k] = +PerfMonitor.avg(k).toFixed(2); } catch (_) {}
      }
      // Things other than entity drawing: the interface, the clock, the resolution.
      const sysRows = [];
      const hudStyle = document.createElement('style');
      hudStyle.textContent = 'body > *:not(canvas) { opacity: 0 !important; pointer-events: none !important; }';
      const SYS = [
        ['HUD hidden (like F9)',        false, () => { document.head.appendChild(hudStyle); return () => hudStyle.remove(); }],
        ['game paused',                 false, () => { const prev = DevMode.timeScale; DevMode.setTimeScale(0); return () => DevMode.setTimeScale(prev); }],
        ['resolution 50%',              false, () => { const prev = RenderScale.get(); RenderScale.set(0.5); return () => RenderScale.set(prev); }],
        ['no entities + HUD hidden',    true,  () => { document.head.appendChild(hudStyle); return () => hudStyle.remove(); }],
        ['no entities + paused',        true,  () => { const prev = DevMode.timeScale; DevMode.setTimeScale(0); return () => DevMode.setTimeScale(prev); }],
        ['no entities + res 50%',       true,  () => { const prev = RenderScale.get(); RenderScale.set(0.5); return () => RenderScale.set(prev); }],
        ['baseline (after those)',      false, () => () => {}],
      ];
      for (const [label, noEnt, apply] of SYS) {
        skip.clear(); if (noEnt) Object.values(T).forEach(v => skip.add(v));
        _dropSpriteCaches();
        let undo = () => {};
        try { undo = apply() || undo; } catch (_) {}
        note('Lag probe: ' + label + '  - please do not touch');
        await sleep(PHASE_SETTLE_MS + 400);
        const fps = await fpsOver(PHASE_MS);
        try { undo(); } catch (_) {}
        sysRows.push([label, fps]);
      }
      skip.clear();
      const frames = Object.values(counts).reduce((a, b) => a + b, 0);
      lines.push('GRIDWORKS LAG PROBE  ' + new Date().toISOString());
      lines.push('window ' + innerWidth + 'x' + innerHeight + '  canvas ' + canvas.width + 'x' + canvas.height + '  dpr ' + devicePixelRatio);
      lines.push('zoom ' + (typeof Camera !== 'undefined' ? (+Camera.zoom).toFixed(3) : '?') + '   time scale ' + (typeof DevMode !== 'undefined' ? DevMode.timeScale : '?'));
      lines.push('quality mode ' + GfxQuality.getMode() + ' (level ' + GfxQuality.label() + ')  smooth buildings ' + GfxQuality.smoothBuildings() + '  fps cap ' + GfxQuality.fpsCap() + '  smooth camera ' + JSON.stringify(CameraReprojection.stats()));
      try { lines.push('sprite cache: ' + JSON.stringify(BuildingSpriteCache.stats())); } catch (_) {}
      lines.push('zoom samples over 0.75 s (should be identical): ' + zoomSamples.map(z => (+z).toPrecision(12)).join(', '));
      let player = 0; const total = {};
      for (const k of Object.keys(T)) { try { const n = EntityRegistry.getByType(T[k]).size; if (n) { total[k] = n; if (!['WATER', 'BUSH', 'TREE'].includes(k)) player += n; } } catch (_) {}
      }
      lines.push('entities in world (excluding water/trees/bushes): ' + player);
      lines.push('');
      lines.push('Entities drawn per frame at baseline (type: count), top 14:');
      const per = Object.entries(counts).map(([t, n]) => [names[t] || t, Math.round(n / baseFrames)]).sort((a, b) => b[1] - a[1]).slice(0, 14);
      lines.push('  ' + per.map(([k, n]) => k + ' ' + n).join(', '));
      lines.push('');
      lines.push('Frame rate with each category switched OFF:');
      const base = (rows[1][1] + rows[rows.length - 2][1] + rows[rows.length - 1][1]) / 3;   // rows[0] is the cold warm-up
      for (const [label, fps] of rows) lines.push('  ' + label.padEnd(28) + fps.toFixed(1).padStart(6) + ' fps' + (label.startsWith('baseline') || label === 'warm-up' ? '' : '   (' + (fps - base >= 0 ? '+' : '') + (fps - base).toFixed(1) + ' vs baseline avg ' + base.toFixed(1) + ')'));
      lines.push('');
      lines.push('Frame rate with the rest of the game changed:');
      for (const [label, fps] of sysRows) lines.push('  ' + label.padEnd(28) + fps.toFixed(1).padStart(6) + ' fps');
      lines.push('');
      lines.push('Game timers (ms per frame): ' + JSON.stringify(timers));
      lines.push('DOM elements ' + document.getElementsByTagName('*').length + '   canvases ' + document.getElementsByTagName('canvas').length +
                 '   JS heap ' + (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB' : '?'));
      lines.push('');
      lines.push('Types in world: ' + Object.entries(total).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, n]) => k + ' ' + n).join(', '));
      // The other kind of lag: hangs of a second or more (see stall_watch.js).
      try { lines.push('', 'Stalls of 1s+ (newest last):', StallWatch.report()); } catch (_) {}
    } catch (err) {
      lines.push('Probe failed: ' + (err && err.stack || err));
    } finally {
      renderEntityAt = orig;
      _dropSpriteCaches();
      running = false;
    }
    const text = lines.join('\n');
    let where = '';
    try { if (window.GridworksDesktop?.writeReport) where = await window.GridworksDesktop.writeReport(text); } catch (_) {}
    if (!where) { try { await navigator.clipboard.writeText(text); where = 'clipboard'; } catch (_) {} }
    console.log(text);
    note('Lag probe done. Report saved: ' + (where || '(see console)'), 15000);
  }

  window.addEventListener('keydown', e => {
    if (e.key === 'F8') { e.preventDefault(); run(); }
  });
  return { run };
})();
