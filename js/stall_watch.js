/* ═══════════════════════════════════════════════════════════════════
   STALL WATCH
   Records every time the game stops drawing for a second or more while
   the tab is in view, and what was running when it did. The Lag Probe
   (F8) measures a steady low frame rate; this is for the other kind of
   lag, where the game is fine and then hangs for several seconds.

   Each stall is written to the console and kept (last 25) so it can be
   read back later: StallWatch.report() returns them as text, and the F8
   report ends with them.
   ═══════════════════════════════════════════════════════════════════ */
const StallWatch = (() => {
  const MIN_STALL_MS = 1000;
  const KEEP = 25;
  const LOG_KEY = 'gw_stall_log';

  // Long main-thread frames with the scripts that filled them (Chromium's
  // long-animation-frame entries name the function and file).
  const longFrames = [];
  // Blocks the game times itself (see mark()): saves, mainly.
  const marks = [];

  let log = [];
  try { log = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch (_e) {}

  function mark(what, startMs, endMs) {
    marks.push({ what, start: startMs, end: endMs });
    if (marks.length > 40) marks.shift();
  }

  try {
    const po = new PerformanceObserver(list => {
      for (const en of list.getEntries()) {
        if (en.duration < 300) continue;
        const scripts = (en.scripts || []).map(s => ({
          ms: Math.round(s.duration),
          fn: s.sourceFunctionName || '',
          src: String(s.sourceURL || '').split('/').pop(),
          by: s.invoker || '',
          layout: Math.round(s.forcedStyleAndLayoutDuration || 0),
        })).sort((a, b) => b.ms - a.ms).slice(0, 4);
        longFrames.push({ start: en.startTime, end: en.startTime + en.duration, ms: Math.round(en.duration), scripts });
        if (longFrames.length > 40) longFrames.shift();
      }
    });
    po.observe({ type: 'long-animation-frame', buffered: true });
  } catch (_e) { /* not Chromium, or too old: stalls are still timed, just not attributed */ }

  // A hidden tab stops animation frames by design; that gap is not a stall.
  let hiddenSince = document.hidden ? performance.now() : null, lastShown = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenSince = performance.now();
    else { hiddenSince = null; lastShown = performance.now(); }
  });

  function record(from, to) {
    const gap = Math.round(to - from);
    const overlaps = x => x.end > from - 50 && x.start < to + 50;
    const entry = {
      at: new Date().toISOString(),
      ms: gap,
      day: (typeof DayNight !== 'undefined' && DayNight.day) ? DayNight.day() : undefined,
      site: (typeof ContractSystem !== 'undefined' && ContractSystem.isAway) ? ContractSystem.isAway() : undefined,
      marks: marks.filter(overlaps).map(m => `${m.what} ${Math.round(m.end - m.start)}ms`),
      frames: longFrames.filter(overlaps).map(f => ({ ms: f.ms, scripts: f.scripts })),
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : undefined,
    };
    log.push(entry);
    if (log.length > KEEP) log = log.slice(-KEEP);
    try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch (_e) {}
    console.warn('[stall] ' + line(entry));
  }

  function line(e) {
    const scripts = (e.frames || []).flatMap(f => f.scripts || [])
      .map(s => `${s.fn || '(anonymous)'} ${s.src} ${s.ms}ms${s.layout > 50 ? ` (layout ${s.layout}ms)` : ''}${s.by ? ' via ' + s.by : ''}`);
    const script = (e.frames || []).reduce((a, f) => a + f.ms, 0);
    return `${e.at}  ${(e.ms / 1000).toFixed(1)}s` + (e.site ? '  on job site' : '') +
      (e.marks && e.marks.length ? '  | ' + e.marks.join(', ') : '') +
      (scripts.length ? '  | scripts: ' + scripts.join('; ')
        : script ? '' : '  | no long script: time went outside the game\'s code (browser, GPU or disk)') +
      (e.heapMB ? `  | heap ${e.heapMB} MB` : '');
  }

  let last = performance.now();
  function watch(now) {
    const gap = now - last;
    if (gap >= MIN_STALL_MS && hiddenSince === null && last > lastShown) {
      // Let this frame's long-animation-frame entry arrive before reading it.
      const from = last, to = now;
      setTimeout(() => record(from, to), 250);
    }
    last = now;
    requestAnimationFrame(watch);
  }
  requestAnimationFrame(watch);

  return {
    mark,
    entries: () => log.slice(),
    report: () => log.length ? log.map(line).join('\n') : 'no stalls recorded',
    clear() { log = []; try { localStorage.removeItem(LOG_KEY); } catch (_e) {} },
  };
})();
