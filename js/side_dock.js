/* ═══════════════════════════════════════════════════════════════════
   SIDE DOCK
   The right-hand side buttons (compendium, achievements, message log,
   contracts, audit, drones, blueprints, trucks, recenter, dev and the
   Research Station button below) used to stand in one tall column that
   kept growing as things unlocked. They now fold away behind one toggle,
   like the build bar's categories: tap it and they open as a compact grid,
   three across with a short name under each, on a tray with its own ✕.
   The toggle, the ✕, or a click anywhere else folds them away again. A dot on the toggle says
   when something inside has news (a message, an achievement…).

   The buttons stay where they always were in the page (body children with
   their own ids and handlers), so everything that drives them, including
   the mobile layer's scaling and its side-panel placement, keeps working:
   this only hides them while folded and sets where each one sits.

   The Research Station button opens the panel of the highest-tier station
   placed, the same as the E key, and shows once there is one.
   ═══════════════════════════════════════════════════════════════════ */

const SideDock = (() => {
  // Order in the grid, reading left to right, top to bottom.
  const ORDER = [
    ['btn-research', 'Research'],
    ['btn-compendium', 'Compendium'],
    ['btn-achievements', 'Achievements'],
    ['btn-msglog', 'Messages'],
    ['btn-contracts', 'Contracts'],
    ['btn-advisor', 'Audit'],
    ['btn-drones', 'Drones'],
    ['hotbar-blueprint-btn', 'Blueprints'],
    ['btn-trucks', 'Trucks'],
    ['btn-recenter', 'Recenter'],
    ['btn-requests', 'Requests'],
    ['btn-dev', 'Dev'],
  ];
  const COLS = 3;
  const TILE_W = 66, TILE_H = 54;      // per button, unscaled px (34px button + its name)
  const RIGHT = 20, BASE = 12;         // where the toggle sits (the old foot of the column)
  const PAD = 8, HEAD = 22;

  let open = false, toggle = null, tray = null, timer = null;
  const $ = (id) => document.getElementById(id);

  function injectStyle() {
    const css = `
      #btn-side-dock {
        position: fixed; bottom: ${BASE}px; right: ${RIGHT}px; width: 34px; height: 34px;
        background: var(--glass, rgba(14,20,30,0.85)); border: 1px solid var(--ui-border-b, #2a3a4a);
        border-radius: 10px; color: var(--text, #cfe0ee); cursor: pointer; z-index: 39;
        display: flex; align-items: center; justify-content: center; padding: 0;
        -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur);
        box-shadow: var(--shadow-sm); transition: background 0.15s, border-color 0.15s;
      }
      #btn-side-dock:hover, #btn-side-dock.open { border-color: rgba(150,180,215,0.6); background: rgba(40,52,70,0.9); }
      #btn-side-dock .sd-dot {
        position: absolute; top: -3px; right: -3px; width: 10px; height: 10px; border-radius: 50%;
        background: #f0c040; box-shadow: 0 0 6px rgba(240,192,64,0.8); display: none;
      }
      #btn-side-dock.has-new .sd-dot { display: block; }
      #side-dock-tray {
        position: fixed; z-index: 38; display: none;
        background: rgba(10,16,24,0.88); border: 1px solid var(--ui-border-b, #2a3a4a); border-radius: 12px;
        -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); box-shadow: var(--shadow-lg);
      }
      body.side-dock-open #side-dock-tray { display: block; animation: sdTrayIn 0.22s cubic-bezier(0.2, 0.8, 0.3, 1.15) backwards; }
      #side-dock-tray { transform-origin: 100% 100%; }
      @keyframes sdTrayIn { from { opacity: 0; transform: translate(6px, 10px) scale(0.82); } to { opacity: 1; transform: none; } }
      /* The buttons pop in one after another, in reading order (--sd-i). */
      body.side-dock-open .side-dock-item {
        animation: sdItemIn 0.24s cubic-bezier(0.2, 0.8, 0.3, 1.3) backwards;
        animation-delay: calc(var(--sd-i, 0) * 28ms + 50ms);
      }
      @keyframes sdItemIn { from { opacity: 0; transform: translateY(10px) scale(0.55); } to { opacity: 1; transform: none; } }
      #btn-side-dock svg { transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.3, 1.3); }
      #btn-side-dock.open svg { transform: rotate(45deg) scale(0.92); }
      #side-dock-tray .sd-head {
        position: absolute; left: 10px; right: 6px; top: 4px; height: 16px;
        font: 700 9px/16px 'Inter', system-ui, sans-serif; letter-spacing: 0.14em; color: var(--text-dim, #8aa0b4);
        text-transform: uppercase; display: flex; justify-content: space-between; align-items: center;
      }
      #side-dock-tray .sd-close {
        background: none; border: 0; color: var(--text-dim, #8aa0b4); font-size: 13px; line-height: 1;
        cursor: pointer; padding: 0 4px;
      }
      #side-dock-tray .sd-close:hover { color: #fff; }
      body:not(.side-dock-open) .side-dock-item { display: none !important; }
      body.side-dock-open .side-dock-item::after {
        content: attr(data-sd-label); position: absolute; top: calc(100% + 2px); left: 50%;
        transform: translateX(-50%); white-space: nowrap; pointer-events: none;
        font: 600 9px/1 'Inter', system-ui, sans-serif; letter-spacing: 0.02em; color: var(--text-dim, #9ab0c4);
      }
      #btn-research {
        position: fixed; width: 34px; height: 34px; right: ${RIGHT}px; bottom: 430px;
        background: var(--glass, rgba(14,20,30,0.85)); border: 1px solid var(--ui-border-b, #2a3a4a);
        border-radius: 10px; color: var(--text, #cfe0ee); font-size: 15px; cursor: pointer; z-index: 39;
        display: none; align-items: center; justify-content: center; padding: 0;
        -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); box-shadow: var(--shadow-sm);
      }
      #btn-research.unlocked { display: flex; }
      #btn-research:hover, #btn-research.open { border-color: #b088ff; color: #b088ff; }
      body.apocalypse #btn-research, body.gw-intro #btn-research, body.np-victory #btn-research, body.gw-fusion #btn-research { display: none; }
      body.apocalypse #btn-side-dock, body.gw-intro #btn-side-dock, body.np-victory #btn-side-dock, body.gw-fusion #btn-side-dock { display: none; }
      /* PC: panels opened from the tray sit left of it rather than over it.
         (The phone build places them beside their own button already.) */
      html:not(.gw-mobile) body.side-dock-open :is(#msg-log-panel, #achievements-panel, #compendium-panel, #advisor-panel) {
        right: calc(var(--side-dock-w, 210px) + ${RIGHT + 10}px) !important;
      }
      html:not(.gw-mobile) body.side-dock-open :is(#trucks-panel, #drones-panel) {
        right: calc((var(--side-dock-w, 210px) + ${RIGHT + 10}px) / 1.15) !important;
      }
    `;
    const st = document.createElement('style');
    st.id = 'side-dock-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function build() {
    injectStyle();

    // The Research Station button, beside the Compendium.
    if (!$('btn-research')) {
      const b = document.createElement('button');
      b.id = 'btn-research';
      b.title = 'Research Station (E)';
      b.textContent = '🔬';
      b.addEventListener('click', () => {
        if (typeof InspectionPanel === 'undefined') return;
        if (InspectionPanel.isOpen()) InspectionPanel.close();
        else InspectionPanel.openHighestTier();
      });
      const comp = $('btn-compendium');
      if (comp && comp.parentNode) comp.parentNode.insertBefore(b, comp); else document.body.appendChild(b);
    }

    for (const [id, label] of ORDER) {
      const el = $(id);
      if (!el) continue;
      el.classList.add('side-dock-item');
      el.dataset.sdLabel = label;
    }

    toggle = document.createElement('button');
    toggle.id = 'btn-side-dock';
    toggle.title = 'Panels';
    toggle.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
      '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/>' +
      '<rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></svg><span class="sd-dot"></span>';
    toggle.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!open); });
    document.body.appendChild(toggle);

    tray = document.createElement('div');
    tray.id = 'side-dock-tray';
    tray.innerHTML = '<div class="sd-head"><span>Panels</span><button class="sd-close" title="Close">✕</button></div>';
    tray.querySelector('.sd-close').addEventListener('click', (e) => { e.stopPropagation(); setOpen(false); });
    for (const t of ['mousedown', 'touchstart', 'pointerdown', 'wheel']) tray.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
    document.body.appendChild(tray);

    // A click or tap anywhere else folds the tray away. Not one on the tray,
    // its toggle, a button in it, or a panel opened from it (reading the
    // Compendium must not close the tray under it and shift the panel).
    const KEEP = ['side-dock-tray', 'btn-side-dock', 'msg-log-panel', 'achievements-panel', 'compendium-panel',
                  'advisor-panel', 'trucks-panel', 'drones-panel', 'truck-patrol-panel', 'saved-path-panel', 'blueprint-panel'];
    document.addEventListener('pointerdown', (e) => {
      if (!open) return;
      const t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('.side-dock-item')) return;
      for (const id of KEEP) { const el = $(id); if (el && el.contains(t)) return; }
      setOpen(false);
    }, true);

    setInterval(tick, 400);
    tick();
  }

  function setOpen(v) {
    open = !!v;
    document.body.classList.toggle('side-dock-open', open);
    if (toggle) toggle.classList.toggle('open', open);
    if (open) layout();
  }

  // The buttons that are showing (unlocked, not hidden by a cutscene…).
  function shownItems() {
    const out = [];
    for (const [id] of ORDER) {
      const el = $(id);
      if (el && getComputedStyle(el).display !== 'none') out.push(el);
    }
    return out;
  }

  // Lays the shown buttons out as a grid above the toggle, in screen pixels.
  // A button with its own zoom (the phone build scales the column) has its
  // offsets divided by it, since zoom scales a fixed element's offsets too.
  function layout() {
    if (!open || !toggle) return;
    const items = shownItems();
    // One scale for the whole tray: the toggle's (the phone build scales the
    // side buttons, the toggle with them). A button not yet scaled (one that
    // has only just unlocked) takes it too, so the grid stays even.
    const s = parseFloat(getComputedStyle(toggle).zoom) || 1;
    for (const el of items) if ((parseFloat(getComputedStyle(el).zoom) || 1) !== s) el.style.zoom = s === 1 ? '' : String(s);
    const n = Math.max(1, items.length), cols = Math.min(COLS, n), rows = Math.ceil(n / cols);
    const tw = TILE_W * s, th = TILE_H * s;
    const tr = toggle.getBoundingClientRect();
    const right0 = innerWidth - tr.right;                 // the toggle's right edge, screen px
    const base = innerHeight - tr.top + 10 * s;           // first row's bottom: just above the toggle
    items.forEach((el, i) => {
      if (el.style.getPropertyValue('--sd-i') !== String(i)) el.style.setProperty('--sd-i', String(i));
      const r = Math.floor(i / cols), c = i % cols;
      const z = parseFloat(getComputedStyle(el).zoom) || 1;
      const bottomPx = base + (rows - 1 - r) * th + 16 * s;   // the name sits in the 16px under the button
      const rightPx = right0 + (cols - 1 - c) * tw + (tw - 34 * s) / 2;
      const set = (p, v) => { const val = (v / z).toFixed(1) + 'px'; if (el.style.getPropertyValue(p) !== val) el.style.setProperty(p, val, 'important'); };
      set('bottom', bottomPx);
      set('right', rightPx);
      if (el.style.getPropertyValue('top') !== 'auto') el.style.setProperty('top', 'auto', 'important');
      if (el.style.getPropertyValue('left') !== 'auto') el.style.setProperty('left', 'auto', 'important');
    });
    const w = cols * tw + PAD * 2 * s, h = rows * th + (HEAD + PAD) * s;
    tray.style.right = (right0 - PAD * s) + 'px';
    tray.style.bottom = (base - PAD * s) + 'px';
    tray.style.width = w + 'px';
    tray.style.height = h + 'px';
    tray.querySelector('.sd-head').style.zoom = s;
    document.documentElement.style.setProperty('--side-dock-w', w + 'px');
  }

  function tick() {
    // Research button: there once a station is.
    const rb = $('btn-research');
    if (rb && typeof EntityRegistry !== 'undefined' && typeof T !== 'undefined') {
      const any = [T.RESEARCH, T.RESEARCH2, T.RESEARCH3, T.MK4RESEARCH, T.MK5RESEARCH]
        .some(t => t && EntityRegistry.getByType(t).size > 0);
      rb.classList.toggle('unlocked', any);
      rb.classList.toggle('open', typeof InspectionPanel !== 'undefined' && InspectionPanel.isOpen());
    }
    // News inside (a badge showing on any button) lights the toggle.
    if (toggle) {
      // (Every button with news marks itself has-new: its "!" shows then.)
      const news = ORDER.some(([id]) => { const el = $(id); return !!el && el.classList.contains('has-new'); });
      toggle.classList.toggle('has-new', news && !open);
    }
    // A tutorial card pointing at one of the buttons opens the tray to show it.
    if (!open) {
      for (const [id] of ORDER) { const el = $(id); if (el && el.classList.contains('tut-dom-glow')) { setOpen(true); break; } }
    }
    if (open) layout();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();

  return { open: () => setOpen(true), close: () => setOpen(false), toggle: () => setOpen(!open), isOpen: () => open };
})();
