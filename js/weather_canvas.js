/* ═══════════════════════════════════════════════════════════════════
   WEATHER CANVAS
   A single shared full-screen overlay canvas used by every weather
   particle system (rain, wind streaks, storm debris, ground splash,
   lightning). These used to each create their own <canvas> element
   stacked via CSS z-index — during a storm, up to 5 of them were
   simultaneously active, each forcing its own browser compositing
   layer and its own full-screen clear+redraw every frame. Sharing one
   canvas cuts that down to a single clear and a single composited
   layer, while the draw ORDER (called out explicitly wherever the
   weather systems are ticked together) preserves the same visual
   stacking the old z-index values gave: splash below wind streaks,
   below rain, below storm debris, below lightning.
   ═══════════════════════════════════════════════════════════════════ */
const WeatherCanvas = (() => {
  let canvas, ctx;

  function init() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:30;';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize, { passive: true });
  }

  function resize() {
    if (!canvas) return;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function getCanvas() { init(); return canvas; }
  function getCtx()    { init(); return ctx; }

  function clear() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { init, getCanvas, getCtx, clear };
})();
