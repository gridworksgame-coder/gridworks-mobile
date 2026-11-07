/* ═══════════════════════════════════════════════════════════════════
   UI BOOTSTRAP
   CSS injection, hotbar init, dev panel wiring, and DOM event bindings
   for the grid/population/income/progress panels. Runs once on load.
   ═══════════════════════════════════════════════════════════════════ */

const style = document.createElement('style');
style.textContent = `@keyframes fadeOut { 0%{opacity:1;transform:translateX(-50%) translateY(0)} 70%{opacity:1} 100%{opacity:0;transform:translateX(-50%) translateY(-10px)} }`;
document.head.appendChild(style);

/* ═══════════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════════ */
buildHotbar();

// ── Dev panel wiring ────────────────────────────────────────────
{
  const slider  = document.getElementById('dev-time-slider');
  const timeVal = document.getElementById('dev-time-val');

  // Slider → time
  slider.addEventListener('input', () => {
    const m  = parseInt(slider.value);
    DayNight.setMinute(m);
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    timeVal.textContent = `${hh}:${mm}`;
  });

  // Quick-set buttons
  document.getElementById('dev-dawn').addEventListener('click',  () => { DayNight.setMinute(6  * 60); slider.value = 6  * 60; });
  document.getElementById('dev-noon').addEventListener('click',  () => { DayNight.setMinute(12 * 60); slider.value = 12 * 60; });
  document.getElementById('dev-dusk').addEventListener('click',  () => { DayNight.setMinute(18 * 60); slider.value = 18 * 60; });
  document.getElementById('dev-night').addEventListener('click', () => { DayNight.setMinute(0);       slider.value = 0; });

  // Keep slider in sync with live game time when panel is open
  function syncSlider() {
    if (!DevMode.enabled) return;
    const m = DayNight.getMinute();
    // Only update if user isn't dragging
    if (document.activeElement !== slider) {
      slider.value = m;
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      timeVal.textContent = `${hh}:${mm}`;
    }
    document.getElementById('dev-bal-val').textContent =
      `$${Math.floor(Economy.balance)}`;

    // Perf breakdown — diagnostic only, no gameplay effect
    document.getElementById('perf-frame').textContent  = PerfMonitor.avg('Frame interval').toFixed(2);
    document.getElementById('perf-gfx').textContent    = `${GfxQuality.label()} (${GfxQuality.getMode()}${GfxQuality.weakGpu ? ', integrated GPU' : ''})`;
    document.getElementById('perf-rscale').textContent  =
      `${RenderScale.label()} (${canvas.width}x${canvas.height})`;
    {
      const _b = BuildingSpriteCache.stats();
      document.getElementById('perf-buildings').textContent =
        `${_b.mode}: ${_b.visible} on screen, ${_b.liveMsPer}ms each live (est ${_b.estLiveMs}ms), ${_b.cached} cached`;
    }
    document.getElementById('perf-render').textContent = PerfMonitor.avg('RenderSystem.render').toFixed(2);
    document.getElementById('perf-zonelife').textContent = PerfMonitor.avg('Zone life').toFixed(2);
    document.getElementById('perf-sprites').textContent  = PerfMonitor.avg('Sprite refreshes').toFixed(1);
    document.getElementById('perf-power').textContent  = PerfMonitor.avg('PowerNetwork.tick').toFixed(2);
    document.getElementById('perf-pn-reset').textContent = PerfMonitor.avg('PN: reset pass').toFixed(2);
    document.getElementById('perf-pn-comp').textContent  = PerfMonitor.avg('PN: component loop').toFixed(2);
    document.getElementById('perf-pn-ff').textContent    = PerfMonitor.avg('PN: floodFill total').toFixed(2);
    document.getElementById('perf-pn-wire').textContent  = PerfMonitor.avg('PN: applyWireLoads').toFixed(2);
    document.getElementById('perf-pn-pipe').textContent  = PerfMonitor.avg('PN: updatePipeConnectivity').toFixed(2);
    document.getElementById('perf-pn-ffcount').textContent = Math.round(PerfMonitor.avg('PN: floodFill calls'));
    document.getElementById('perf-pn-comps').textContent   = Math.round(PerfMonitor.avg('PN: components'));
    document.getElementById('perf-pn-ents').textContent    = EntityRegistry.all().size;
    document.getElementById('perf-rain').textContent   = PerfMonitor.avg('RainSystem.frame').toFixed(2);
    document.getElementById('perf-veg').textContent    = PerfMonitor.avg('Vegetation rendering').toFixed(2);
    document.getElementById('perf-entity').textContent = PerfMonitor.avg('Entity rendering').toFixed(2);
    document.getElementById('perf-bgredraw').textContent     = PerfMonitor.avg('BG cache redraw').toFixed(2);
    document.getElementById('perf-bgredraw-max').textContent = PerfMonitor.max('BG cache redraw').toFixed(2);
    document.getElementById('perf-bgredraw-count').textContent = PerfMonitor.count('BG cache redraw');
    document.getElementById('perf-basegrass-max').textContent = PerfMonitor.max('BG base grass').toFixed(2);
    document.getElementById('perf-gridlines-max').textContent = PerfMonitor.max('BG grid lines').toFixed(2);
    document.getElementById('perf-cobblestone-max').textContent = PerfMonitor.max('Zone cobblestone').toFixed(2);
    document.getElementById('perf-tick').textContent   = PerfMonitor.avg('Total game tick time').toFixed(2);
  }

  // Patch updateStats to also sync the dev panel
  const _origUpdateStats = updateStats;
  // We'll call syncSlider from the tick instead
  const _origTick = GameLoop;   // can't patch after IIFE, so hook via interval
  setInterval(syncSlider, 200);

  // Audio volume controls (70% is the normal full level, as in Options)
  document.getElementById('dev-sfx-vol').addEventListener('input', (e) => {
    const v = e.target.value / 70;
    document.getElementById('dev-sfx-val').textContent = `${e.target.value}%`;
    SFX.setVolume(v);
  });
  document.getElementById('dev-music-vol').addEventListener('input', (e) => {
    const v = e.target.value / 70;
    document.getElementById('dev-music-val').textContent = `${e.target.value}%`;
    MusicSystem.setVolume(v);
  });

  // Balance controls
  document.getElementById('dev-bal-minus').addEventListener('click', () => {
    Economy.setBalance(Economy.balance - 10000);
  });
  document.getElementById('dev-bal-plus').addEventListener('click', () => {
    Economy.setBalance(Economy.balance + 10000);
  });
  document.getElementById('dev-bal-max').addEventListener('click', () => {
    Economy.setBalance(Economy.balance + 100000);
  });
  const balInput = document.getElementById('dev-bal-input');
  balInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const v = parseFloat(balInput.value);
    if (!isNaN(v)) Economy.setBalance(v);
    balInput.value = '';
  });

  // Progression controls
  document.getElementById('dev-unlock-all').addEventListener('click', () => {
    Progression.unlockAll();
    showToast('All unlocks granted', '#40c0ff', '#040c14', '#104060');
  });
  document.getElementById('dev-reset-progress').addEventListener('click', () => {
    Progression.resetProgress();
    showToast('Progression reset', '#c08020', '#100a04', '#604020');
  });

  // Contract board controls
  const _cVal = document.getElementById('dev-contract-val');
  const _cSync = () => {
    if (!_cVal) return;
    const n = ContractSystem.getOffers().length;
    _cVal.textContent = ContractSystem.isAway() ? 'on contract' : `${n} offer${n === 1 ? '' : 's'}`;
  };
  setInterval(_cSync, 500);
  _cSync();

  const _cGuard = fn => () => {
    if (ContractSystem.isAway()) {
      showToast('Already on a contract', '#c08020', '#100a04', '#604020');
      return;
    }
    fn();
    _cSync();
  };

  // Finishes a beacon sweep on the spot — same 1–3 finds, card, toast and
  // log line as a real one, minus the wait and the repost cooldowns.
  document.getElementById('dev-contract-find').addEventListener('click', _cGuard(() => {
    const n = ContractSystem.devFindContract();
    if (!n) showToast('Nothing found: board full or no site free', '#c08020', '#100a04', '#604020');
  }));
  document.getElementById('dev-contract-fill').addEventListener('click', _cGuard(() => {
    const n = ContractSystem.devFillBoard();
    showToast(n ? `Posted ${n} contract offer${n === 1 ? '' : 's'}`
                : 'Board already full (one offer per site)',
              '#40c0ff', '#040c14', '#104060');
  }));
  document.getElementById('dev-contract-one').addEventListener('click', _cGuard(() => {
    const ok = ContractSystem.devPostOffer();
    showToast(ok ? 'Posted 1 contract offer' : 'No site free to post',
              '#40c0ff', '#040c14', '#104060');
  }));
  document.getElementById('dev-contract-expire').addEventListener('click', _cGuard(() => {
    const n = ContractSystem.devExpireOffers();
    showToast(n ? `Expired ${n} offer${n === 1 ? '' : 's'}` : 'No offers to expire',
              '#c08020', '#100a04', '#604020');
  }));
  document.getElementById('dev-contract-clear').addEventListener('click', _cGuard(() => {
    const n = ContractSystem.devClearOffers();
    showToast(n ? `Cleared ${n} offer${n === 1 ? '' : 's'}` : 'Board already empty',
              '#c08020', '#100a04', '#604020');
  }));
}

// ── Top panel dropdowns — mutually exclusive, only one open at a time ──
const TOP_PANELS = [
  { panel: 'grid-panel',        btn: 'grid-tab-btn',    cls: 'open' },
  { panel: 'weather-panel',     btn: 'weather-tab-btn', cls: 'open' },
  { panel: 'progress-tracker',  btn: 'btn-progress',    cls: 'visible' },
  { panel: 'population-panel',  btn: null,              cls: 'visible' },
  { panel: 'income-breakdown',  btn: null,              cls: 'visible' },
  { panel: 'score-panel',       btn: null,              cls: 'visible', useStyleDisplay: true },
  { panel: 'gov-panel',         btn: null,              cls: 'visible', useStyleDisplay: true },
  { panel: 'achievements-panel', btn: 'btn-achievements', cls: 'visible' },
  { panel: 'trucks-panel',       btn: 'btn-trucks',       cls: 'visible' },
  { panel: 'drones-panel',       btn: 'btn-drones',       cls: 'visible' },
  { panel: 'compendium-panel',   btn: 'btn-compendium',   cls: 'visible' },
  { panel: 'advisor-panel',      btn: 'btn-advisor',      cls: 'visible' },
];

function closeOtherTopPanels(exceptPanelId) {
  TOP_PANELS.forEach(({ panel, btn, cls, useStyleDisplay }) => {
    if (panel === exceptPanelId) return;
    const p = document.getElementById(panel);
    if (!p || !p.classList.contains(cls)) return;
    p.classList.remove(cls);
    if (useStyleDisplay) p.style.display = 'none';
    if (btn) document.getElementById(btn)?.classList.remove('open');
  });
}

// Anchor the GRID panel just under its tab button. The panel is CSS-zoomed
// (see #grid-panel), and newer Chromium scales an element's own left/top by
// its zoom while older engines don't — so place it, measure where it really
// landed, and divide out whatever scale was applied.
function placeGridPanel(panel, btn) {
  const r = btn.getBoundingClientRect();
  const x = r.left, y = r.bottom + 4;
  panel.style.right = 'auto';
  panel.style.left = x + 'px';
  panel.style.top  = y + 'px';
  const p = panel.getBoundingClientRect();
  if (x > 0 && Math.abs(p.left - x) > 1) panel.style.left = (x * x / p.left) + 'px';
  if (y > 0 && Math.abs(p.top  - y) > 1) panel.style.top  = (y * y / p.top)  + 'px';
  fitGridPanel(panel);
}

// Cap the GRID panel to the space left below its top edge, so with every
// list expanded it still ends on screen and scrolls instead. The panel is
// CSS-zoomed, so a max-height in CSS px renders larger by that zoom — the
// ratio of on-screen to layout height gives the factor to divide by.
//
// The expanded lists then share whatever height the fixed rows and graph
// leave over, so By Network, Generation and Consumption can all be open and
// on screen together, each scrolling inside its own slice. A list that holds
// less than its slice hands the rest to the others. On a short screen the
// panel makes room for an open list before squeezing it: first tighter rows
// (gp-tight), then no graph (gp-no-graph). Only when even the LIST_MIN floor
// can't fit (a very short window) does the panel itself scroll.
const GRID_LISTS = ['gp-net-summary', 'gp-gen-breakdown', 'gp-con-breakdown'];
function fitGridPanel(panel = document.getElementById('grid-panel')) {
  if (!panel || !panel.classList.contains('open')) return;
  const MARGIN = 12, LIST_MIN = 90, LIST_ROOMY = 150, LIST_MAX = 260;
  const rect  = panel.getBoundingClientRect();
  const scale = (panel.offsetHeight > 0 ? rect.height / panel.offsetHeight : 1) || 1;
  const avail = Math.max(120, window.innerHeight - rect.top - MARGIN) / scale;   // CSS px
  panel.style.maxHeight = avail + 'px';

  panel.classList.remove('gp-tight', 'gp-no-graph');
  const showing = GRID_LISTS.map(id => document.getElementById(id))
    .filter(el => el && el.style.display !== 'none' && !el.classList.contains('locked'));
  const open = showing.filter(el => !el.classList.contains('gp-closing'));   // one folding away gives up its share now
  if (!open.length) return;
  // What's left once everything that isn't a list has its height: rows,
  // dividers, headers, graph, padding.
  const room = () => {
    let fixed = panel.scrollHeight + panel.offsetHeight - panel.clientHeight;
    for (const el of showing) fixed -= el.offsetHeight;
    return avail - fixed;
  };
  const want = open.reduce((sum, el) => sum + Math.min(el.scrollHeight, LIST_ROOMY), 0);
  let left = room();
  for (const step of ['gp-tight', 'gp-no-graph']) {
    if (left >= want) break;
    panel.classList.add(step);
    left = room();
  }
  // Smallest first, so whatever a short list doesn't use reaches the longer ones.
  const bySize = [...open].sort((a, b) => a.scrollHeight - b.scrollHeight);
  bySize.forEach((el, i) => {
    const per = Math.max(LIST_MIN, Math.min(LIST_MAX, Math.floor(left / (bySize.length - i))));
    left -= Math.min(el.scrollHeight, per);
    el.style.maxHeight = per + 'px';
    el.style.setProperty('--gp-list-h', per + 'px');   // where its unfold animation ends
  });
}
window.addEventListener('resize', () => fitGridPanel());
for (const id of GRID_LISTS) {
  // Re-share the height whenever a list is expanded or collapsed.
  document.getElementById(id + '-header')?.addEventListener('click', () => requestAnimationFrame(() => fitGridPanel()));
  // Where the panel itself has to scroll, bring a list that just opened into view.
  document.getElementById(id)?.addEventListener('animationend', (ev) => {
    if (ev.animationName === 'gpReveal') ev.currentTarget.scrollIntoView({ block: 'nearest' });
  });
}

// Grid tab toggle — position panel directly under button
{
  const btn   = document.getElementById('grid-tab-btn');
  const panel = document.getElementById('grid-panel');
  btn.addEventListener('click', () => {
    SFX.click();
    closeOtherTopPanels('grid-panel');
    const open = panel.classList.toggle('open');
    btn.classList.toggle('open', open);
    if (open) {
      placeGridPanel(panel, btn);
      SFX.popup();
    }
  });
}

// Weather tab toggle — position panel directly under button (mirrors Grid tab)
{
  const btn   = document.getElementById('weather-tab-btn');
  const panel = document.getElementById('weather-panel');
  btn.addEventListener('click', () => {
    SFX.click();
    closeOtherTopPanels('weather-panel');
    const open = panel.classList.toggle('open');
    btn.classList.toggle('open', open);
    if (open) {
      const r = btn.getBoundingClientRect();
      panel.style.left = r.left + 'px';
      panel.style.top  = (r.bottom + 4) + 'px';
      panel.style.right = 'auto';
      SFX.popup();
    }
  });
}

// Population breakdown panel
(function() {
  const panel = document.getElementById('population-panel');
  const body  = document.getElementById('pop-body');

  function buildPopPanel() {
    body.innerHTML = '';
    const buildings = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const e = GridManager.getEntity(c, r);
      if (e && e.col === c && e.row === r && e.fromRequest && e.type === T.HOUSE && e._population > 0)
        buildings.push(e);
    }
    buildings.sort((a, b) => (b._population || 0) - (a._population || 0));

    let totalPop = 0;
    buildings.forEach(e => {
      totalPop += e._population;
      const name = e.familyName || e.commercialSubtype || 'Residence';
      const pop  = e._population;
      const bar  = Math.round((pop / 35) * 100);
      const div  = document.createElement('div');
      div.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:10px;';
      div.innerHTML = `
        <span style="flex:1;color:var(--text);letter-spacing:0.5px;">${name}</span>
        <div style="width:80px;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;">
          <div style="width:${bar}%;height:100%;background:#80e0ff;border-radius:2px;opacity:0.7;"></div>
        </div>
        <span style="color:#80e0ff;min-width:24px;text-align:right;">${pop}</span>`;
      body.appendChild(div);
    });

    const total = document.createElement('div');
    total.style.cssText = 'display:flex;justify-content:space-between;padding:8px 0 2px;font-size:11px;letter-spacing:1px;color:var(--text-dim);border-top:1px solid var(--ui-border);margin-top:4px;';
    total.innerHTML = `<span>TOTAL RESIDENTS</span><span style="color:#80e0ff;font-weight:bold;">${totalPop.toLocaleString()}</span>`;
    body.appendChild(total);
  }

  document.getElementById('population-stat-btn').addEventListener('click', () => {
    SFX.click();
    if (!hasActiveMonitor()) {
      showToast('⚠ Monitoring Station required to view population breakdown', '#f0c040', '#100e00', '#605010');
      return;
    }
    if (panel.classList.contains('visible')) {
      panel.classList.remove('visible');
    } else {
      closeOtherTopPanels('population-panel');
      buildPopPanel();
      const _btn = document.getElementById('stat-population');
      const _rect = _btn.getBoundingClientRect();
      panel.style.top  = (_rect.bottom + 4) + 'px';
      panel.style.left = (_rect.left + _rect.width/2 - 150) + 'px';
      panel.classList.add('visible');
    }
  });
  document.getElementById('pop-close-btn').addEventListener('click', () => panel.classList.remove('visible'));
})();

// Income breakdown panel
(function() {
  const panel = document.getElementById('income-breakdown');
  const body  = document.getElementById('ibd-body');

  window._ibdUpdateValues = function() {
    // Build the fresh breakdown off-screen, carry over each section's
    // open/closed state, then patch the live panel to match. Swapping in new
    // nodes every ~600ms (as this used to) replaced the element under the
    // pointer, which dropped :hover for a moment — the section titles
    // flashed while hovered.
    const collapsed = new Map();
    body.querySelectorAll('.ibd-section').forEach(sec => collapsed.set(sec.dataset.title, sec.classList.contains('collapsed')));
    const fresh = document.createElement('div');
    buildBreakdown(fresh);
    fresh.querySelectorAll('.ibd-section').forEach(sec => {
      if (collapsed.has(sec.dataset.title)) sec.classList.toggle('collapsed', collapsed.get(sec.dataset.title));
    });
    _morphChildren(body, fresh);
  };
  // Make `live`'s children match `fresh`'s, reusing nodes wherever tag and
  // position line up and only touching text/attributes that differ.
  function _morphChildren(live, fresh) {
    const F = [...fresh.childNodes];
    for (let i = 0; i < F.length; i++) {
      const f = F[i], l = live.childNodes[i];
      if (!l) { live.appendChild(f); continue; }
      if (l.nodeType !== f.nodeType || l.nodeName !== f.nodeName) { live.replaceChild(f, l); continue; }
      if (l.nodeType === 3) { if (l.nodeValue !== f.nodeValue) l.nodeValue = f.nodeValue; continue; }
      if (l.nodeType !== 1) continue;
      for (const { name, value } of f.attributes) if (l.getAttribute(name) !== value) l.setAttribute(name, value);
      for (const { name } of [...l.attributes]) if (!f.hasAttribute(name)) l.removeAttribute(name);
      _morphChildren(l, f);
    }
    while (live.childNodes.length > F.length) live.removeChild(live.lastChild);
  }
  function buildBreakdown(out = body) {
    const body = out;   // builds into `out` (the live panel, or an off-screen copy)
    body.innerHTML = '';
    const fmt = (v) => (v >= 0 ? '+' : '-') + '$' + Math.abs(v).toFixed(1) + '/s';
    const fmtTotal = (v) => (v >= 0 ? '+' : '-') + '$' + Math.abs(v).toFixed(1) + '/s';

    const section = (title, rows, startCollapsed = true) => {
      if (!rows.length) return;
      const total = rows.reduce((s, r) => s + (r.raw || 0), 0);
      const sec = document.createElement('div');
      sec.className = 'ibd-section' + (startCollapsed ? ' collapsed' : '');
      sec.dataset.title = title;
      const rowsHtml = rows.map(r => `<div class="ibd-row"><span class="ibd-name">${r.name}</span><span class="ibd-val ${r.cls}">${r.val}</span></div>`).join('');
      sec.innerHTML = `
        <div class="ibd-section-title">
          <span>${title} <span style="color:${total>=0?'#40ff80':'#ff6040'};margin-left:6px">${fmtTotal(total)}</span></span>
          <span class="ibd-caret">▾</span>
        </div>
        <div class="ibd-rows">${rowsHtml}</div>`;
      body.appendChild(sec);
    };

    // Everything not in one of the sets below is GENERATION UPKEEP.
    const GRID_TYPES = new Set([T.WIRE, T.POWERTOWER, T.POLE, T.PROTECTOR, T.PROTECTOR2, T.PROTECTOR3, T.BATTERY, T.PIPE, T.UNDERGNDPIPE]);
    const STN_TYPES  = new Set([T.RESEARCH, T.RESEARCH2, T.RESEARCH3, T.MONITOR, T.MONITOR2, T.ENGOFFICE, T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5, T.SURVEY, T.SURVEY2]);
    const AMEN_TYPES = new Set([T.CAMERA, T.EVCHARGER]);
    // Zone-request amenities, Fiber Hub, and Street Lamp all carry *negative*
    // upkeep (i.e. they pay the player, not the other way around) — Lamp
    // used to fall into AMEN_TYPES with a positive upkeep number; the others
    // used to fall through to the generic "else genRaw.push(row)" catch-all
    // below. Both cases dumped them into an UPKEEP section and made it look
    // like the player was being charged for them.
    const PARK_TYPES = new Set([T.SMALLPARK, T.COMMUNITYGARDEN, T.TREEDSTREET, T.BASKETBALLCOURT, T.FARMERSMARKET, T.FOUNTAIN, T.SPLASHPAD, T.BASEBALLFIELD, T.PLAYGROUND, T.ALLOTMENTS, T.DOGPARK, T.COMMUNITYCENTER, T.GREENHOUSE, T.CORNERSTORE, T.FARM, T.FIBERHUB, T.LAMP]);

    // Read off what Economy.tick actually banked (Economy.ledger), so every
    // payer and every bill is here, in the amounts paid: it used to walk the
    // grid itself and missed the Company HQ, Hyperion Station, the civic and
    // national buildings and Cell Towers (and anything stacked under another
    // tile), and its own outage formula and the difficulty multiplier and
    // upkeep perks were left out, so its rows never added up to the totals.
    Economy.wantLedger();
    const L = Economy.ledger();
    const CIVIC_TYPES = new Set([T.CELLTOWER, T.TOWNHALL, T.CIVICCENTER, T.COURTHOUSE, T.EMS, T.HOSPITAL, T.UNIVERSITY, T.TRANSPORTHUB,
      T.NATIONALGOV, T.FUSIONLAB, T.AIRPORT, T.MILITARYBASE, T.LAUNCHCOMPLEX, T.NATIONALGRID, T.COMPANYHQ].filter(Boolean));
    if (!L) {
      const wait = document.createElement('div');
      wait.className = 'ibd-row';
      wait.innerHTML = '<span class="ibd-name">Reading the books...</span><span class="ibd-val"></span>';
      body.appendChild(wait);
    } else if (L.onSite) {
      // On a job site the client's plant earns and costs nothing; home runs
      // on as it was when you left (ContractSystem.homeEconomyRate).
      section('HOME CITY (WHILE YOU ARE AWAY)', [
        { name: 'Income, as when you left', val: fmt(L.income), cls: 'good', raw: L.income },
        { name: 'Upkeep, as when you left', val: fmt(-L.upkeep), cls: 'bad', raw: -L.upkeep },
      ], false);
    } else {
      const groups = { res: [], com: [], ind: [], civic: [], park: [], gen: [], grid: [], stn: [], amen: [] };
      for (const ln of L.lines) {
        const raw = ln.income * L.incMult - ln.upkeep * L.upkMult;
        if (Math.abs(raw) < 0.005) continue;
        const t = ln.type;
        // A civic building's pay comes in two halves (its income, and a
        // government grant carried as negative upkeep): name both.
        const pay = ln.income * L.incMult, grant = -ln.upkeep * L.upkMult;
        const split = CIVIC_TYPES.has(t) && pay > 0.005 && grant > 0.005
          ? ` <span style="color:var(--text-dim)">($${pay.toFixed(0)} pay + $${grant.toFixed(0)} grant)</span>` : '';
        const row = { name: (ln.count > 1 ? `${ln.label} ×${ln.count}` : ln.label) + split, val: fmt(raw), cls: raw >= 0 ? 'good' : 'bad', raw };
        const g = (t === T.HOUSE || t === T.CABIN) ? 'res' : t === T.COMMERCIAL ? 'com' : t === T.INDUSTRIAL ? 'ind'
                : CIVIC_TYPES.has(t) ? 'civic' : PARK_TYPES.has(t) ? 'park'
                : GRID_TYPES.has(t) ? 'grid' : STN_TYPES.has(t) ? 'stn' : AMEN_TYPES.has(t) ? 'amen' : 'gen';
        groups[g].push(row);
      }
      for (const k in groups) groups[k].sort((a, b) => Math.abs(b.raw) - Math.abs(a.raw));
      section('RESIDENTIAL', groups.res);
      section('COMMERCIAL', groups.com);
      section('INDUSTRIAL', groups.ind);
      section('CIVIC & NATIONAL', groups.civic);
      section('PARKS & CIVIC INCOME', groups.park);
      section('GENERATION UPKEEP', groups.gen);
      section('GRID UPKEEP', groups.grid);
      section('STATIONS UPKEEP', groups.stn);
      section('AMENITIES UPKEEP', groups.amen);
      // Scrubbers are a fitted upgrade, not an entity; carbon tax is a
      // city-wide bill. Both are added after the upkeep perk, in full.
      if (L.scrubbers > 0) {
        let n = 0;
        if (typeof PollutionSystem !== 'undefined')
          for (const t of [T.COALGENERATOR, T.FUELGEN, T.REFINERY]) for (const e of EntityRegistry.getByType(t)) if (e._scrubber) n++;
        section('SCRUBBERS', [{ name: n > 1 ? `Scrubber ×${n}` : 'Scrubber', val: fmt(-L.scrubbers), cls: 'bad', raw: -L.scrubbers }]);
      }
      if (L.carbonTax > 0) {
        const over = typeof PollutionSystem !== 'undefined' ? PollutionSystem.overAllowance() : 0;
        section('CARBON TAX', [{ name: `${over.toFixed(1)} units over allowance`, val: fmt(-L.carbonTax), cls: 'bad', raw: -L.carbonTax }]);
      }
      // What scales the lot, so the rows can be checked against the totals.
      const notes = [];
      if (Math.abs(L.incMult - 1) > 0.001) notes.push(`Customer pay ×${L.incMult.toFixed(2)} (difficulty), included above`);
      if (Math.abs(L.upkMult - 1) > 0.001) notes.push(`Upkeep ×${L.upkMult.toFixed(2)} (contract perk), included above`);
      for (const n of notes) {
        const d = document.createElement('div');
        d.className = 'ibd-row';
        d.innerHTML = `<span class="ibd-name" style="color:var(--text-dim)">${n}</span><span class="ibd-val"></span>`;
        body.appendChild(d);
      }
    }

    const incomeTotal = document.createElement('div');
    incomeTotal.className = 'ibd-total';
    incomeTotal.innerHTML = `<span style="letter-spacing:2px;color:var(--text-dim)">INCOME</span><span style="color:#40ff80">+$${Economy.income.toFixed(1)}/s</span>`;
    body.appendChild(incomeTotal);

    // Upkeep + net totals
    const upkeepTotal = document.createElement('div');
    upkeepTotal.className = 'ibd-total';
    upkeepTotal.innerHTML = `<span style="letter-spacing:2px;color:var(--text-dim)">UPKEEP</span><span style="color:#ff6040">-$${Economy.upkeep.toFixed(1)}/s</span>`;
    body.appendChild(upkeepTotal);

    const net = Economy.income - Economy.upkeep;
    const total = document.createElement('div');
    total.className = 'ibd-total';
    total.innerHTML = `<span style="letter-spacing:2px;color:var(--text-dim)">NET</span><span style="color:${net >= 0 ? '#40ff80' : '#ff6040'}">${(net >= 0 ? '+' : '-') + '$' + Math.abs(net).toFixed(1) + '/s'}</span>`;
    body.appendChild(total);
  }

  // The body is rebuilt every ~600ms while open (stats_panel.js), so a click
  // listener on each section title was lost whenever a rebuild landed between
  // press and release. Toggle on press, delegated from the body that survives.
  body.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    const title = ev.target.closest('.ibd-section-title');
    if (title) title.parentElement.classList.toggle('collapsed');
  });

  // Income and Balance are one button — clicking either opens the panel.
  document.getElementById('income-balance-group').addEventListener('click', () => {
    SFX.click();
    if (!hasActiveMonitor()) {
      showToast('⚠ Monitoring Station required to view income breakdown', '#f0c040', '#100e00', '#605010');
      return;
    }
    if (panel.classList.contains('visible')) {
      panel.classList.remove('visible');
    } else {
      closeOtherTopPanels('income-breakdown');
      buildBreakdown();
      // Position below the Income/Balance button
      const _btn = document.getElementById('income-balance-group');
      const _rect = _btn.getBoundingClientRect();
      panel.style.top  = (_rect.bottom + 4) + 'px';
      panel.style.left = (_rect.left + _rect.width/2 - 160) + 'px';
      panel.style.right = 'auto';
      panel.classList.add('visible');
    }
  });
  document.getElementById('ibd-close').addEventListener('click', () => panel.classList.remove('visible'));
})();

// Progress tracker toggle
document.getElementById('btn-progress').addEventListener('click', () => {
  SFX.click();
  const panel = document.getElementById('progress-tracker');
  const btn   = document.getElementById('btn-progress');
  closeOtherTopPanels('progress-tracker');
  const open = panel.classList.toggle('visible');
  btn.classList.toggle('open', open);
  if (open) {
    const r = btn.getBoundingClientRect();
    const _ptW = 280;
    panel.style.left  = Math.min(r.left, window.innerWidth - _ptW - 8) + 'px';
    panel.style.top   = (r.bottom + 4) + 'px';
    panel.style.right = 'auto';
    updateProgressTracker();
  }
});

const _reqCloseEl = document.getElementById('req-close');
// The panel's own ✕ — an explicit dismissal, so it must not go through
// closeCategoryPopup(), which now deliberately leaves this panel alone.
if (_reqCloseEl) _reqCloseEl.addEventListener('click', () => closeRequestsPanel());
HouseRequestSystem.init();
// Wire requests button click
document.getElementById('hotbar-req-btn').addEventListener('click', (ev) => {
  SFX.click();
  ev.stopPropagation();
  HouseRequestSystem.togglePanel();
});
// The panel lives INSIDE that button (same as the blueprint panel below), so
// picking a location letter or pressing Confirm bubbled up to the handler
// above and toggled the panel shut. Clicks inside the panel stay inside it.
document.getElementById('req-panel').addEventListener('click', (ev) => ev.stopPropagation());
document.getElementById('zp-close').addEventListener('click', () => {
  document.getElementById('zone-panel').classList.remove('visible');
});
// Wire blueprints button + save modal
document.getElementById('hotbar-blueprint-btn').addEventListener('click', (ev) => {
  SFX.click();
  ev.stopPropagation();
  BlueprintSystem.togglePanel();
});
// The panel lives INSIDE that button, so every click in it (Delete, the
// "Yes, delete"/Cancel confirm, renaming…) bubbled up and toggled the panel
// shut — the delete confirmation closed before the player could answer it.
// Clicks inside the panel stay inside the panel.
document.getElementById('blueprint-panel').addEventListener('click', (ev) => ev.stopPropagation());
document.getElementById('blueprint-save-cancel').addEventListener('click', () => {
  SFX.click();
  BlueprintSystem.closeSaveModal(true);
});
document.getElementById('blueprint-save-confirm').addEventListener('click', () => {
  BlueprintSystem.confirmSave();
});
document.getElementById('blueprint-save-name').addEventListener('keydown', (ev) => {
  ev.stopPropagation();
  if (ev.key === 'Enter') BlueprintSystem.confirmSave();
  else if (ev.key === 'Escape') BlueprintSystem.closeSaveModal(true);
});
// Playback controls
{
  const FF_SPEEDS = [1, 2, 5, 10];
  let ffIndex = 0;
  let paused  = false;

  const pauseBtn  = document.getElementById('pb-pause');
  const playBtn   = document.getElementById('pb-play');
  const ffBtn     = document.getElementById('pb-ff');
  const speedLabel = document.getElementById('pb-speed-label');

  let _lockToastAt = 0;
  function updatePlaybackUI() {
    // Meltdown countdown: time is held at 1× while its song plays — the bar
    // snaps back to Play and says why, rather than showing a pause that
    // isn't happening.
    if (typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.lockedSpeed?.() === 1 && (paused || ffIndex > 0)) {
      paused = false; ffIndex = 0;
      if (performance.now() - _lockToastAt > 4000) {
        _lockToastAt = performance.now();
        showToast('☢ No stopping the clock now', '#ff5030', '#1a0400', '#601808');
      }
    }
    const spd = FF_SPEEDS[ffIndex];
    pauseBtn.classList.toggle('active', paused);
    playBtn.classList.toggle('active', !paused && ffIndex === 0);
    ffBtn.classList.toggle('active', !paused && ffIndex > 0);
    speedLabel.textContent = paused ? '0×' : spd + '×';
    speedLabel.className = (!paused && spd > 1) ? 'fast' : '';
    DevMode.setTimeScale(paused ? 0 : spd);
  }

  pauseBtn.addEventListener('click', () => {
    paused = true;
    updatePlaybackUI();
  });

  playBtn.addEventListener('click', () => {
    paused = false;
    ffIndex = 0;
    updatePlaybackUI();
  });

  ffBtn.addEventListener('click', () => {
    paused = false;
    ffIndex = (ffIndex % (FF_SPEEDS.length - 1)) + 1;  // cycles 1→2→3→1 (skips index 0)
    updatePlaybackUI();
  });

  updatePlaybackUI();

  // Pause menu hard-freeze: while the pause-menu overlay is visible the sim
  // must be fully stopped regardless of the playback bar. Observing the class
  // attribute covers every open/close path (Esc toggle, resume button, etc.)
  // without each caller needing to know about timeScale. On close,
  // updatePlaybackUI() restores whatever the playback bar says — including
  // staying paused if the player had paused via the bar before opening the menu.
  const _pmEl = document.getElementById('pause-menu');
  if (_pmEl) {
    new MutationObserver(() => {
      if (_pmEl.classList.contains('visible')) DevMode.setTimeScale(0);
      else updatePlaybackUI();
    }).observe(_pmEl, { attributes: true, attributeFilter: ['class'] });
  }

  // Tutorial card hard-freeze — same technique as the pause-menu observer
  // above: freeze the sim while a tutorial card is showing, restore whatever
  // the playback bar says once it's gone. Skipped for cards that need a real
  // action performed (chop a tree, place a generator, ...) — see
  // TutorialSystem.shouldPauseTime() — since the sim time those actions
  // depend on would otherwise never advance.
  const _tcEl = document.getElementById('tutorial-card');
  if (_tcEl) {
    new MutationObserver(() => {
      if (_tcEl.children.length > 0 && TutorialSystem.shouldPauseTime()) DevMode.setTimeScale(0);
      else updatePlaybackUI();
    }).observe(_tcEl, { childList: true });
  }
}
MessageLog.init();
Advisor.init();
document.getElementById('btn-contracts')?.addEventListener('click', () => { SFX.click(); ContractSystem.toggleBoard(); });
NotificationStack.init();

// Achievements panel
(function() {
  const btn   = document.getElementById('btn-achievements');
  const panel = document.getElementById('achievements-panel');
  if (!btn || !panel) return;
  btn.addEventListener('click', () => {
    SFX.click();
    closeOtherTopPanels('achievements-panel');
    const open = panel.classList.toggle('visible');
    btn.classList.toggle('open', open);
    if (open) {
      btn.classList.remove('has-new');
      AchievementsSystem.renderPanel();
    }
  });
  document.getElementById('ach-close-btn').addEventListener('click', () => {
    panel.classList.remove('visible');
    btn.classList.remove('open');
  });
})();

// Truck status panel
(function() {
  const btn   = document.getElementById('btn-trucks');
  const panel = document.getElementById('trucks-panel');
  if (!btn || !panel) return;
  btn.addEventListener('click', () => {
    SFX.click();
    closeOtherTopPanels('trucks-panel');
    const open = panel.classList.toggle('visible');
    btn.classList.toggle('open', open);
    if (open) TruckStatusPanel.renderPanel();
  });
  document.getElementById('trucks-close-btn').addEventListener('click', () => {
    panel.classList.remove('visible');
    btn.classList.remove('open');
  });
})();

// Drone fleet panel
(function() {
  const btn   = document.getElementById('btn-drones');
  const panel = document.getElementById('drones-panel');
  if (!btn || !panel) return;
  btn.addEventListener('click', () => {
    SFX.click();
    closeOtherTopPanels('drones-panel');
    const open = panel.classList.toggle('visible');
    btn.classList.toggle('open', open);
    if (open) DroneFleetPanel.renderPanel();
  });
  document.getElementById('drones-close-btn').addEventListener('click', () => {
    panel.classList.remove('visible');
    btn.classList.remove('open');
  });
})();

// Compendium panel
(function() {
  const btn   = document.getElementById('btn-compendium');
  const panel = document.getElementById('compendium-panel');
  if (!btn || !panel) return;
  btn.addEventListener('click', () => {
    SFX.click();
    closeOtherTopPanels('compendium-panel');
    const open = panel.classList.toggle('visible');
    btn.classList.toggle('open', open);
    if (open) CompendiumSystem.renderPanel();
  });
  document.getElementById('cmp-close-btn').addEventListener('click', () => {
    panel.classList.remove('visible');
    btn.classList.remove('open');
  });
  const search = document.getElementById('cmp-search');
  if (search) {
    search.addEventListener('input', () => CompendiumSystem.renderPanel(search.value));
    search.addEventListener('click', e => e.stopPropagation());
    search.addEventListener('keydown', e => e.stopPropagation());
  }

  // ── Drag to move ──────────────────────────────────────────────────
  // Grab the title bar and drag. The panel starts docked by bottom/right
  // (CSS); the first drag switches it to left/top so it follows the cursor.
  // Kept on screen, and remembered for the rest of the session so reopening
  // the compendium puts it back where the player left it. Double-click the
  // title bar to dock it back to its default spot.
  const header = panel.firstElementChild;
  if (header) {
    header.style.cursor = 'move';
    header.style.userSelect = 'none';
    header.title = 'Drag to move · double-click to reset';
    let drag = null;
    const clamp = (left, top) => {
      const r = panel.getBoundingClientRect();
      return {
        left: Math.max(0, Math.min(window.innerWidth  - r.width,  left)),
        top:  Math.max(0, Math.min(window.innerHeight - Math.min(r.height, 60), top)),
      };
    };
    const place = (left, top) => {
      const p = clamp(left, top);
      panel.style.left = p.left + 'px'; panel.style.top = p.top + 'px';
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      // The docked max-height assumes the bottom anchor; once free, size to
      // whatever room is left below the panel's top edge instead.
      panel.style.maxHeight = `${Math.max(200, window.innerHeight - p.top - 12)}px`;
    };
    header.addEventListener('mousedown', e => {
      if (e.button !== 0 || e.target.closest('button')) return;   // the ✕ still just closes
      const r = panel.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      e.preventDefault();
      e.stopPropagation();
    });
    window.addEventListener('mousemove', e => {
      if (!drag) return;
      place(e.clientX - drag.dx, e.clientY - drag.dy);
    });
    window.addEventListener('mouseup', () => { drag = null; });
    header.addEventListener('dblclick', e => {
      if (e.target.closest('button')) return;
      for (const k of ['left', 'top', 'right', 'bottom', 'maxHeight']) panel.style[k] = '';
    });
    // A window resize can leave a moved panel off-screen — pull it back in.
    window.addEventListener('resize', () => {
      if (panel.style.left) place(parseFloat(panel.style.left), parseFloat(panel.style.top));
    });
  }
})();

// City Score panel — mirrors the Government panel's toggle/position pattern
(function() {
  const btn   = document.getElementById('score-stat-btn');
  const panel = document.getElementById('score-panel');
  if (!btn || !panel) return;
  btn.addEventListener('click', () => {
    SFX.click();
    if (panel.style.display !== 'none' && panel.style.display !== '') {
      panel.style.display = 'none';
      panel.classList.remove('visible');
    } else {
      closeOtherTopPanels('score-panel');
      CityScore.renderPanel();
      const rect = btn.getBoundingClientRect();
      const w = 280;
      panel.style.display = 'flex';
      panel.style.top  = (rect.bottom + 4) + 'px';
      panel.style.left = Math.max(4, Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - 8)) + 'px';
      panel.classList.add('visible');
    }
  });
  document.getElementById('score-close-btn').addEventListener('click', () => { panel.style.display = 'none'; panel.classList.remove('visible'); });
})();

WireInspector.init();
DevMode.initSpeedControls();
EntityInfoPanel.initButtons();
PenaltyModal.init();


document.getElementById('ep-close-btn').addEventListener('click', () => EntityInfoPanel.close());
document.getElementById('ep-repair-wire-btn')?.addEventListener('mousedown', e => e.stopPropagation());

function updateLoanList() {
  const list = document.getElementById('ep-loan-list');
  if (!list) return;
  const loans = GovernmentSystem.getLoans ? GovernmentSystem.getLoans() : [];
  const total = loans.reduce((s,l) => s+l.balance, 0);
  if (loans.length === 0) {
    list.innerHTML = '<div style="font-size:9px;color:rgba(255,255,255,0.3);margin-bottom:4px;">No active loans.</div>';
  } else {
    list.innerHTML = loans.map((loan, i) => `
      <div style="border:1px solid #602010;border-radius:3px;padding:6px;margin-bottom:4px;background:rgba(40,10,0,0.4);display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:10px;color:#e08040;">$${loan.amount.toLocaleString()} loan</div>
          <div style="font-size:9px;color:rgba(255,255,255,0.35);">Owed: $${loan.balance.toLocaleString()} · $${loan.interest.toLocaleString()}/day</div>
          <div style="font-size:9px;color:rgba(255,255,255,0.28);">Next charge: Day ${loan.nextDueDay ?? (loan.takenDay + 1)}, noon</div>
        </div>
        <button data-repay-idx="${i}" style="background:#1a0800;border:1px solid #804020;color:#e06030;font-size:10px;padding:5px 8px;cursor:pointer;font-family:monospace;border-radius:3px;">REPAY</button>
      </div>`).join('')
      + (total > 0 ? `<div style="font-size:10px;color:#e06030;text-align:right;margin-top:2px;">Total: $${total.toLocaleString()}</div>` : '');
  }
}

// Static loan button handlers — wired once at startup
(function() {
  const AMOUNTS = { 'ep-loan-5k': 5000, 'ep-loan-10k': 10000, 'ep-loan-25k': 25000, 'ep-loan-50k': 50000, 'ep-loan-100k': 100000 };
  Object.entries(AMOUNTS).forEach(([id, amt]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('click', e => { e.stopPropagation(); GovernmentSystem.takeLoaan(amt); updateLoanList(); });
  });
  // Repay — delegate on the stable container
  const loanList = document.getElementById('ep-loan-list');
  if (loanList) {
    loanList.addEventListener('mousedown', e => e.stopPropagation());
    loanList.addEventListener('click', e => {
      e.stopPropagation();
      const btn = e.target.closest('[data-repay-idx]');
      if (btn) { GovernmentSystem.repayLoan(+btn.dataset.repayIdx); updateLoanList(); }
    });
  }
})();

// Government panel
(function() {
  const panel = document.getElementById('gov-panel');
  const body  = document.getElementById('gov-body');

  function buildGovPanel() {
    const approval   = GovernmentSystem.getApproval();
    const contracts  = GovernmentSystem.getContracts();
    const completed  = GovernmentSystem.getCompleted();
    const gov        = GovernmentSystem.getGovEntity();
    const powered    = gov && gov.powered;
    const loans      = GovernmentSystem.getLoans ? GovernmentSystem.getLoans() : [];
    const loanOpts   = GovernmentSystem.getLoanOptions ? GovernmentSystem.getLoanOptions() : [];
    const totalDebt  = loans.reduce((s,l) => s+l.balance, 0);
    const barColor   = approval >= 70 ? '#40c060' : approval >= 40 ? '#c0a030' : '#e04030';

    body.innerHTML = '';
    const add = (html) => { const d = document.createElement('div'); d.innerHTML = html; body.appendChild(d); };

    // Approval
    add('<div style="margin-bottom:10px;">'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-dim);margin-bottom:4px;"><span>MAYOR APPROVAL</span><span style="color:' + barColor + ';font-size:11px;font-weight:bold;">' + approval + '%</span></div>'
      + '<div style="height:5px;background:rgba(255,255,255,0.08);border-radius:3px;"><div style="width:' + approval + '%;height:100%;background:' + barColor + ';border-radius:3px;transition:width 0.3s;"></div></div>'
      + '<div style="font-size:11px;color:var(--text-dim);margin-top:4px;">' + (powered ? '✓ City Hall powered' : '⚠ City Hall has no power') + '</div>'
      + '</div>');

    // Mood: how the mayor feels and why
    if (GovernmentSystem.getMood) {
      const mood = GovernmentSystem.getMood();
      const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const tcol = mood.trend === 'rising' ? '#40c060' : mood.trend === 'falling' ? '#e04030' : '#c0a030';
      let mh = '<div style="margin-bottom:10px;padding:7px 8px;border:1px solid rgba(255,255,255,0.08);border-radius:3px;background:rgba(255,255,255,0.025);">'
        + '<div style="font-size:11px;color:var(--text-dim);letter-spacing:1px;margin-bottom:4px;">MAYOR MOOD: <span style="color:' + barColor + ';">' + mood.label.toUpperCase() + '</span> · <span style="color:' + tcol + ';">' + mood.trend.toUpperCase() + '</span></div>'
        + '<div style="font-size:11px;color:rgba(255,255,255,0.7);line-height:1.4;">' + esc(mood.summary) + '</div>';
      mood.reasons.forEach(function(r) {
        mh += '<div style="display:flex;gap:8px;font-size:11px;line-height:1.4;margin-top:5px;color:' + (r.good ? '#40c060' : '#e04030') + ';">'
          + '<span style="flex:none;">' + (r.good ? '▲' : '▼') + '</span><span style="flex:1;">' + esc(r.text) + '</span>'
          + '<span style="flex:none;font-weight:bold;">' + (r.good ? '+' : '−') + Math.max(1, Math.round(r.pts)) + '</span></div>';
      });
      add(mh + '</div>');
    }

    // Established civic buildings
    const GT = {};
    GT[T.TOWNHALL]='Town Hall'; GT[T.CIVICCENTER]='Civic Center'; GT[T.COURTHOUSE]='Courthouse';
    GT[T.EMS]='Emergency Services'; GT[T.HOSPITAL]='Hospital'; GT[T.UNIVERSITY]='University'; GT[T.TRANSPORTHUB]='Transportation Hub'; GT[T.NATIONALGOV]='National Government Center'; GT[T.FUSIONLAB]='Fusion Research Facility'; GT[T.AIRPORT]='International Airport'; GT[T.MILITARYBASE]='Military Base'; GT[T.LAUNCHCOMPLEX]='Starhaven Launch Complex'; GT[T.NATIONALGRID]='Hyperion Station'; GT[T.COMPANYHQ]=EntityDefs[T.COMPANYHQ].label;
    const built = [];
    for (let _r=0;_r<ROWS;_r++) for (let _c=0;_c<COLS;_c++) {
      const _e = GridManager.getEntity(_c,_r);
      if (_e && _e.col===_c && _e.row===_r && GT[_e.type]) built.push({label:GT[_e.type], powered:_e.powered, income:(_e.def&&_e.def.income)||0});
    }
    if (built.length > 0) {
      let html = '<div style="font-size:11px;color:var(--text-dim);letter-spacing:1px;margin-bottom:6px;border-top:1px solid rgba(255,255,255,0.06);padding-top:6px;">ESTABLISHED</div>';
      built.forEach(function(b) {
        html += '<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);">'
          + '<span style="color:' + (b.powered ? '#c0a030' : 'rgba(255,255,255,0.3)') + ';">' + b.label + '</span>'
          + '<span style="color:' + (b.powered ? '#40c060' : '#e04030') + ';">' + (b.powered ? '+$' + b.income + '/s' : 'No Power') + '</span>'
          + '</div>';
      });
      add(html);
    }

    // Loans header
    add('<div style="font-size:11px;color:var(--text-dim);letter-spacing:1px;margin-bottom:6px;border-top:1px solid rgba(255,255,255,0.06);padding-top:6px;">LOANS</div>'
      + `<div style="font-size:11px;color:rgba(255,255,255,0.35);margin-bottom:6px;">${GovernmentSystem.getLoanRatePct ? GovernmentSystem.getLoanRatePct() : 8}% flat interest charged daily at noon, starting the day after you borrow.</div>`);

    // Loan buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;';
    loanOpts.forEach(function(opt, i) {
      const btn = document.createElement('button');
      btn.style.cssText = 'flex:1;min-width:60px;background:#1a1000;border:1px solid #604010;color:#c0a030;font-size:11px;padding:5px 4px;cursor:pointer;font-family:monospace;border-radius:3px;';
      btn.textContent = opt.label;
      btn.addEventListener('click', function() { GovernmentSystem.takeLoaan(opt.amount); buildGovPanel(); });
      btnRow.appendChild(btn);
    });
    body.appendChild(btnRow);

    // Active loans
    if (loans.length > 0) {
      const loansDiv = document.createElement('div');
      loansDiv.style.marginBottom = '8px';
      loans.forEach(function(loan, i) {
        const row = document.createElement('div');
        row.style.cssText = 'border:1px solid #602010;border-radius:4px;padding:10px;margin-bottom:6px;background:rgba(40,10,0,0.4);display:flex;justify-content:space-between;align-items:center;';
        const info = document.createElement('div');
        info.innerHTML = '<div style="font-size:12px;color:#e08040;">Loan $' + loan.amount.toLocaleString() + '</div>'
          + '<div style="font-size:11px;color:var(--text-dim);">Balance: $' + loan.balance.toLocaleString() + ' / $' + loan.interest.toLocaleString() + '/day</div>'
          + '<div style="font-size:10px;color:var(--text-dim);opacity:0.7;">Next charge: Day ' + (loan.nextDueDay ?? (loan.takenDay + 1)) + ', noon</div>';
        const repay = document.createElement('button');
        repay.style.cssText = 'background:#1a0800;border:1px solid #804020;color:#e06030;font-size:11px;padding:4px 8px;cursor:pointer;font-family:monospace;border-radius:3px;';
        repay.textContent = 'REPAY';
        (function(idx) { repay.addEventListener('click', function(ev) { ev.stopPropagation(); GovernmentSystem.repayLoan(idx); buildGovPanel(); }); })(i);
        row.appendChild(info);
        row.appendChild(repay);
        loansDiv.appendChild(row);
      });
      const debt = document.createElement('div');
      debt.style.cssText = 'font-size:11px;color:#e06030;text-align:right;';
      debt.textContent = 'Total debt: $' + totalDebt.toLocaleString();
      loansDiv.appendChild(debt);
      body.appendChild(loansDiv);
    }

    // Contracts
    const info = GovernmentSystem.getContractInfo();
    const escH = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const head = (t) => '<div style="font-size:11px;color:var(--text-dim);letter-spacing:1px;margin-bottom:6px;border-top:1px solid rgba(255,255,255,0.06);padding-top:6px;">' + t + '</div>';
    // One goal as a labelled progress row.
    const goalRow = (g) => {
      const ok = g.have >= g.need, col = ok ? '#40c060' : '#c0a030';
      const val = g.kind === 'bool' ? (ok ? 'Done' : 'Not yet')
                : g.kind === 'pct' ? g.have + '% / ' + g.need + '%'
                : Math.min(g.have, g.need).toLocaleString() + ' / ' + g.need.toLocaleString();
      const frac = Math.max(0, Math.min(1, g.need ? g.have / g.need : 1));
      return '<div style="margin-top:6px;">'
        + '<div style="display:flex;justify-content:space-between;font-size:11px;"><span style="color:rgba(255,255,255,0.7);">' + (ok ? '✓ ' : '') + escH(g.label) + '</span><span style="color:' + col + ';">' + val + '</span></div>'
        + '<div style="height:3px;margin-top:3px;background:rgba(255,255,255,0.08);border-radius:2px;"><div style="width:' + (frac * 100).toFixed(1) + '%;height:100%;background:' + col + ';border-radius:2px;"></div></div>'
        + '</div>';
    };
    const card = (c, tag) => '<div style="border:1px solid #403010;border-radius:5px;padding:10px 12px;margin-bottom:8px;background:rgba(40,30,10,0.4);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">'
      + '<span style="font-size:12px;letter-spacing:1px;color:#c0a030;font-weight:600;">' + escH(c.label) + (tag ? ' <span style="font-size:10px;font-weight:normal;color:var(--text-dim);">' + tag + '</span>' : '') + '</span>'
      + '<span style="font-size:11px;color:#80d080;">+$' + c.reward.toLocaleString() + '</span></div>'
      + '<div style="font-size:11px;color:var(--text-dim);">' + escH(c.desc) + '</div>'
      + c.goals.map(goalRow).join('') + '</div>';

    add(head('COMMISSIONS · ' + info.active.length + ' of ' + info.maxActive + ' open · ' + info.completed + ' completed')
      + '<div style="font-size:11px;color:rgba(255,255,255,0.35);margin-bottom:6px;">Jobs from the mayor. No deadline: a commission pays out by itself the moment its goals are met, with +8 approval and a little lasting trust.</div>');
    info.active.forEach(function(c) { add(card(c)); });
    if (info.waiting) add('<div style="font-size:11px;color:var(--text-dim);padding:2px 0 8px;">' + escH(info.waiting) + '</div>');
    else if (info.nextIn !== null) {
      const sec = Math.ceil(info.nextIn);
      add('<div style="font-size:11px;color:var(--text-dim);padding:2px 0 8px;">Next commission ' + (sec <= 0 ? 'arriving now.' : 'in ' + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') + '.') + '</div>');
    }

    // Civic milestones: the next building the city is working toward, in
    // full, then the ones after it by name.
    const ahead = info.civic.filter(function(c) { return !c.built; });
    if (ahead.length) {
      add(head('CIVIC MILESTONES · ' + (info.civic.length - ahead.length) + ' of ' + info.civic.length + ' built')
        + '<div style="font-size:11px;color:rgba(255,255,255,0.35);margin-bottom:6px;">Not commissions: the city builds these itself once the goals are met, and pays you for it. Each then needs power.</div>');
      add(card(ahead[0], 'NEXT'));
      if (ahead.length > 1) add('<div style="font-size:11px;color:var(--text-dim);padding:0 0 8px;">Later: ' + ahead.slice(1).map(function(c) { return escH(c.label) + ' (+$' + c.reward.toLocaleString() + ')'; }).join(', ') + '</div>');
    }

    if (info.done.length) {
      let dh = head('COMPLETED COMMISSIONS');
      info.done.forEach(function(c) {
        dh += '<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);">'
          + '<span style="color:rgba(255,255,255,0.55);">✓ ' + escH(c.label) + '</span><span style="color:#40c060;">+$' + c.reward.toLocaleString() + '</span></div>';
      });
      add(dh);
    }
  }

  document.getElementById('gov-stat-btn').addEventListener('click', () => {
    SFX.click();
    if (panel.style.display !== 'none' && panel.style.display !== '') {
      panel.style.display = 'none';
      panel.classList.remove('visible');
    } else {
      closeOtherTopPanels('gov-panel');
      buildGovPanel();
      const btn = document.getElementById('gov-stat-btn');
      const rect = btn.getBoundingClientRect();
      panel.style.display = 'flex';
      panel.style.top  = (rect.bottom + 4) + 'px';
      const _govW = 420; panel.style.left = Math.max(4, Math.min(rect.left + rect.width/2 - _govW/2, window.innerWidth - _govW - 8)) + 'px';
      panel.classList.add('visible');
    }
  });
  document.getElementById('gov-close-btn').addEventListener('click', () => { panel.style.display = 'none'; panel.classList.remove('visible'); });

  // Refresh panel if open
  setInterval(() => {
    if (panel.style.display !== 'none' && panel.style.display !== '') buildGovPanel();
    // Approval and City Score are the home city's: neither is shown on a
    // contract job site, where both stand still (GovernmentSystem.tick,
    // GameLoop's CityScore gate).
    const _away = typeof ContractSystem !== 'undefined' && ContractSystem.isAway();
    for (const id of ['gov-stat-btn', 'score-stat-btn']) {
      const st = document.getElementById(id);
      if (!st) continue;
      st.style.display = _away ? 'none' : '';
      const div = st.nextElementSibling;
      if (div && div.classList.contains('stat-divider')) div.style.display = _away ? 'none' : '';
    }
    const el = document.getElementById('stat-approval');
    if (el) {
      const a = GovernmentSystem.getApproval();
      el.textContent = a + '%';
      el.style.color = a >= 70 ? '#c0a030' : a >= 40 ? '#c08020' : '#e04030';
    }
    const _wev = WeatherEventSystem.getActiveEvent();
    const _wxEl = document.getElementById('dev-weather-val');
    const _seEl = document.getElementById('dev-season-val');
    if (_seEl && typeof Seasons !== 'undefined') _seEl.textContent = Seasons.enabled() ? `${Seasons.name()} · day ${Seasons.dayOfSeason()}` : 'Off for this world';
    const _evEl = document.getElementById('dev-event-val');
    if (_evEl && typeof SeasonalEvents !== 'undefined') { const lv = SeasonalEvents.getLive(); _evEl.textContent = lv ? lv.name : 'None'; }
    if (_wxEl) _wxEl.textContent = _wev ? _wev.label || ({'storm':'💨 Gale','rainstorm':'🌧 Rain','heatwave':'🌡 Heat Wave','coldsnap':'❄ Cold Snap','smog':'🌫 Smog Day','rainfall':'🌦 Rainfall','snowfall':'🌨 Snowfall','blizzard':'🌬 Blizzard','calm':'🎐 Dead Calm','dust':'🌪 Dust Storm','fog':'🌫 Fog','geomag':'🌌 Geomagnetic Storm','icing':'🌁 Freezing Fog','smoke':'🔥 Wildfire Smoke'}[_wev.type]||_wev.type) : 'None';
  }, 1000);
})();

// Unfold or fold one of the GRID panel's lists. Opening is the list's own CSS
// animation (it restarts whenever the element comes back from display:none);
// closing plays .gp-closing first and hides it when that ends. The caret is
// one glyph that turns over rather than two that swap.
function _gpFold(body, caret, open) {
  clearTimeout(body._foldT);
  body.classList.remove('gp-closing');
  if (caret) { caret.textContent = '▾'; caret.classList.toggle('open', open); }
  if (open) { body.style.display = 'block'; return; }
  body.classList.add('gp-closing');
  body._foldT = setTimeout(() => { body.style.display = 'none'; body.classList.remove('gp-closing'); if (typeof fitGridPanel === 'function') fitGridPanel(); }, 160);
}

// Generation breakdown toggle
(function() {
  let _open = false;
  const _header = document.getElementById('gp-gen-breakdown-header');
  const _body   = document.getElementById('gp-gen-breakdown');
  const _caret  = document.getElementById('gp-gen-caret');
  if (_header) _header.addEventListener('click', () => {
    _open = !_open;
    _gpFold(_body, _caret, _open);
    if (_open) updateStats();
  });
})();

// Per-network summary toggle
(function() {
  let _open = false;
  const _header = document.getElementById('gp-net-summary-header');
  const _body   = document.getElementById('gp-net-summary');
  const _caret  = document.getElementById('gp-net-summary-caret');
  if (_header) _header.addEventListener('click', () => {
    _open = !_open;
    _gpFold(_body, _caret, _open);
    if (_open) updateStats();
  });
})();

// Consumption breakdown toggle
(function() {
  let _open = false;
  const _header = document.getElementById('gp-con-breakdown-header');
  const _body   = document.getElementById('gp-con-breakdown');
  const _caret  = document.getElementById('gp-con-caret');
  if (_header) _header.addEventListener('click', () => {
    _open = !_open;
    _gpFold(_body, _caret, _open);
    if (_open) updateStats();
  });
})();

// Dev panel weather buttons
let newGameArmed = false;
(function() {
  document.getElementById('dev-wx-clear').addEventListener('click', () => {
    if (WeatherEventSystem.getActiveEvent()) WeatherEventSystem._forceEnd?.();
    CloudState.triggerBurst(0.05, 1);
    // Through the central switch, so "clear" clears the whole sky rather than
    // only the droplets and leaves no splashes or storm audio behind it.
    WeatherEventSystem.syncVisuals();
  });
  document.getElementById('dev-wx-cloudy').addEventListener('click', () => {
    if (WeatherEventSystem.getActiveEvent()) WeatherEventSystem._forceEnd?.();
    CloudState.triggerBurst(0.9, 9999);
  });
  ['storm','rainfall','rainstorm','heatwave','coldsnap','smog','snowfall','blizzard','calm','dust','fog','geomag'].forEach((type, i) => {
    const ids = ['dev-wx-storm','dev-wx-rain','dev-wx-rainstorm','dev-wx-heat','dev-wx-cold','dev-wx-smog','dev-wx-snow','dev-wx-blizzard','dev-wx-calm','dev-wx-dust','dev-wx-fog','dev-wx-geomag'];
    document.getElementById(ids[i]).addEventListener('click', () => WeatherEventSystem.triggerEvent(type));
  });
  // Freezing fog and wildfire smoke came after the dev panel's markup: their
  // buttons are made here, after the geomagnetic storm's.
  {
    let prev = document.getElementById('dev-wx-geomag');
    for (const [type, text, title] of [['icing', '🌁 Freezing Fog', 'Freezing fog: rime ice on wind turbines'],
                                       ['smoke', '🔥 Wildfire Smoke', 'Wildfire smoke: haze, ash on panels, and flashovers on lines near trees']]) {
      if (!prev || document.getElementById('dev-wx-' + type)) continue;
      const b = prev.cloneNode(false);
      b.id = 'dev-wx-' + type; b.textContent = text; b.title = title;
      b.addEventListener('click', () => WeatherEventSystem.triggerEvent(type));
      prev.after(b); prev = b;
    }
  }

  // Music: put any song from the rotation on now. Stop goes back to the
  // rotation's usual wait for the next song.
  {
    const sel = document.getElementById('dev-music-select'), val = document.getElementById('dev-music-val');
    const nameOf = src => src.split('/').pop().replace(/\.mp3$/, '');
    for (const src of MusicSystem.tracks().sort((a, b) => nameOf(a).localeCompare(nameOf(b)))) {
      const o = document.createElement('option');
      o.value = src; o.textContent = nameOf(src);
      sel.appendChild(o);
    }
    document.getElementById('dev-music-play').addEventListener('click', () => {
      const a = MusicSystem.play(sel.value);
      val.textContent = nameOf(sel.value);
      a?.addEventListener('ended', () => { val.textContent = ''; });
    });
    document.getElementById('dev-music-stop').addEventListener('click', () => {
      MusicSystem.start();
      val.textContent = '';
    });
  }

  // Seasons and the town's calendar: one button a season (it lands mid-season),
  // and one for every event, grouped by the season it belongs to. An event
  // button moves the calendar to its season and the clock to its start, so
  // it runs as it would in play.
  if (typeof Seasons !== 'undefined' && typeof SeasonalEvents !== 'undefined') {
    const NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'], ICONS = ['🌱', '☀', '🍂', '❄'];
    const mk = (host, label, title, fn) => {
      const b = document.createElement('button');
      b.className = 'dev-btn'; b.textContent = label; if (title) b.title = title;
      b.addEventListener('click', fn);
      host.appendChild(b);
      return b;
    };
    const sHost = document.getElementById('dev-season-btns'), eHost = document.getElementById('dev-event-btns');
    if (sHost) NAMES.forEach((n, i) => mk(sHost, `${ICONS[i]} ${n}`, `Jump to day 7 of ${n.toLowerCase()}`, () => Seasons.devJump(i)));
    if (eHost) {
      mk(eHost, 'End', 'End the event that is running', () => SeasonalEvents.devEnd());
      mk(eHost, '🚀 Launch', 'Fly the launch complex 40 seconds from now', () => { if (typeof LaunchSystem !== 'undefined' && !LaunchSystem.devLaunch(40)) showToast('No launch complex in this city', '#c08060'); });
      for (let si = 0; si < 4; si++) {
        const tag = document.createElement('div');
        tag.textContent = NAMES[si]; tag.style.cssText = 'flex-basis:100%;font-size:10px;opacity:0.55;margin-top:4px;letter-spacing:0.08em;text-transform:uppercase;';
        eHost.appendChild(tag);
        for (const ev of SeasonalEvents.EVENTS) {
          if (ev.season !== si) continue;
          const hh = String(ev.start).padStart(2, '0');
          mk(eHost, `${ev.icon} ${ev.name}`, `${ev.blurb} Starts ${hh}:00, runs ${ev.hours}h.`, () => {
            SeasonalEvents.devEnd();
            if (Seasons.index() !== ev.season) Seasons.devJump(ev.season);
            if (ev.weather && WeatherEventSystem.getActiveEvent()) WeatherEventSystem._forceEnd?.();   // so the event can bring its own
            DayNight.setMinute(ev.start * 60 + 1);
            SeasonalEvents.devStart(ev.id);
          });
        }
      }
    }
  }

  document.getElementById('dev-new-game').addEventListener('click', () => {
    if (!newGameArmed) {
      newGameArmed = true;
      document.getElementById('dev-new-game').textContent = 'Confirm?';
      document.getElementById('dev-new-game').style.borderColor = '#ff4444';
      document.getElementById('dev-new-game').style.color = '#ff4444';
      setTimeout(() => {
        newGameArmed = false;
        const btn = document.getElementById('dev-new-game');
        if (btn) { btn.textContent = 'New Game'; btn.style.borderColor = ''; btn.style.color = ''; }
      }, 3000);
    } else {
      location.reload();
    }
  });
  document.getElementById('dev-save').addEventListener('click', () => { SaveSystem.save(); showToast('Saved ✓', '#40c060', '#001408', '#0a4020'); });
  document.getElementById('dev-gov-spawn').addEventListener('click', () => {
    const type = document.getElementById('dev-gov-select').value;
    console.log('[DEV] forcing placeGovBuilding:', type, '| govEntity:', GovernmentSystem.getGovEntity());
    const result = GovernmentSystem.forceSpawnGovBuilding(type);
    if (!result) showToast(`⚠ Could not spawn ${type}; check console`, '#ff6040', '#180800', '#602010');
  });

  ['coal','oil','nuclear'].forEach(kind => {
    document.getElementById(`dev-waste-${kind}`).addEventListener('click', () => {
      const typeMap  = { coal: T.COALWASTE, oil: T.OILWASTE, nuclear: T.NUCLEARWASTE };
      const srcMap   = { coal: T.COALGENERATOR, oil: T.REFINERY, nuclear: T.NUCLEARREACTOR };
      const fType    = typeMap[kind];
      const def      = EntityDefs[fType];
      if (!def) { showToast(`⚠ COALWASTE/OILWASTE/NUCLEARWASTE not defined; deploy constants.js`, '#ff4040', '#180800', '#602010'); return; }
      const w = def.width, h = def.height;
      const MARGIN = 2;
      let placed = false;
      for (let attempt = 0; attempt < 300 && !placed; attempt++) {
        const col = MARGIN + Math.floor(Math.random() * (COLS - w - MARGIN * 2));
        const row = MARGIN + Math.floor(Math.random() * (ROWS - h - MARGIN * 2));
        if (!GridManager.canPlaceFootprint(col, row, w, h)) continue;
        let blocked = false;
        for (let dr = 0; dr < h && !blocked; dr++)
          for (let dc = 0; dc < w && !blocked; dc++)
            if (WaterSystem.isWater(col+dc, row+dr)) blocked = true;
        if (blocked) continue;
        const facility  = new Entity(fType, col, row);
        facility.width  = w; facility.height = h;
        facility.def    = { ...def };
        GridManager.setEntityFootprint(facility);
        EntityRegistry.add(facility);
        WasteSystem.setTriggered(srcMap[kind], true);
        Camera.panTo(col * TILE + w * TILE / 2, row * TILE + h * TILE / 2);
        showToast(`[DEV] Spawned ${def.label}`, '#ff8060', '#180800', '#602010');
        placed = true;
      }
      if (!placed) showToast(`⚠ No room for ${kind} waste facility`, '#ff4040', '#180800', '#602010');
    });
  });

  document.getElementById('dev-spawn-gasstation').addEventListener('click', () => {
    // devSpawnStations() already toasts its own success message (with the
    // actual count placed) — only add one here for the failure case.
    const placed = GasStationSystem.devSpawnStations();
    if (placed === 0) showToast('⚠ No room for gas stations; check console', '#ff4040', '#180800', '#602010');
  });
})();

// Initialise
// Survey scan buttons. One persistent button per scan kind lives in the
// entity panel (index.html, never recreated — avoids click timing issues);
// the panel points each at the station it's showing via `_entity`. Pricing,
// gating, slot choice and the duration roll all live in CoalSystem.startScan
// so the MK1 and MK2 stations share one path: the button only has to say
// which kind. Geothermal is the station's default scan — available from the
// moment the station is built, and the only option until the Coal Scan is
// researched.
for (const kind of CoalSystem.scanOrder()) {
  const btn = document.getElementById(kind === 'geothermal' ? 'ep-geo-scan-btn' : `ep-${kind}-scan-btn`);
  if (!btn) continue;
  btn.addEventListener('click', () => {
    SFX.click();
    const e = btn._entity;
    if (!e) return;
    if (CoalSystem.startScan(e, kind) && typeof EntityInfoPanel !== 'undefined') EntityInfoPanel.refresh?.();
  });
}
document.getElementById('btn-dev').addEventListener('click', () => DevMode.toggle());
if (window.GridworksDesktop) document.getElementById('btn-dev').style.display = 'none';   // no dev mode in the exe
document.addEventListener('keydown', (e) => {
  if (e.key === '`') DevMode.toggle();
});
WorldMapSystem.init();
RainSystem.init();
MenuSystem.init();

// ── Recenter button — snap camera to Town Hall (or best-fit of all buildings) ──
document.getElementById('btn-recenter').addEventListener('click', () => {
  // Prefer Town Hall
  const townHalls = EntityRegistry.getByType(T.TOWNHALL);
  if (townHalls.size > 0) {
    const th = townHalls.values().next().value;
    const wx = (th.col + (th.width  || 1) * 0.5) * TILE;
    const wy = (th.row + (th.height || 1) * 0.5) * TILE;
    Camera.recentreOn(wx, wy);
    return;
  }
  // Fall back: centre on all placed entities
  Camera.recentre(window.innerWidth, window.innerHeight);
});

