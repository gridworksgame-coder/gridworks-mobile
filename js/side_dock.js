/* ═══════════════════════════════════════════════════════════════════
   SIDE DOCK
   The right-hand side buttons (research, compendium, achievements, message
   log, contracts, audit, drones, blueprints, trucks, recenter, dev) used to
   stand in one tall column that kept growing as things unlocked. They now
   fold away behind one PANELS tile in the corner, like the build bar's
   categories: tap it and they open on a tray as a grid, three across with a
   short name under each. The tile, the tray's ✕, or a click anywhere else
   folds them away again. A dot on the tile says when something inside has
   news (a message, an achievement…).

   The buttons are moved into the tray itself, which lays them out as an
   ordinary grid, so a button that is locked simply isn't there and leaves
   no gap. They keep their ids, classes and handlers, so everything that
   drives them still works. The whole tray takes one scale, the tile's (the
   phone build scales the corner controls), so it can never come apart.

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
  const RIGHT = 18, BOTTOM = 26;       // the PANELS tile (its name sits in the 26px below it)

  let open = false, toggle = null, tray = null;
  const $ = (id) => document.getElementById(id);

  function injectStyle() {
    const css = `
      /* ── The PANELS tile (closed state) ── */
      #btn-side-dock {
        position: fixed; bottom: ${BOTTOM}px; right: ${RIGHT}px; width: 46px; height: 46px; padding: 0;
        background: var(--glass, rgba(14,20,30,0.85)); border: 1px solid var(--ui-border-b, #2a3a4a);
        border-radius: 12px; color: var(--text, #cfe0ee); cursor: pointer; z-index: 39;
        display: flex; align-items: center; justify-content: center;
        -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); box-shadow: var(--shadow-sm);
        transition: background 0.18s, border-color 0.18s, box-shadow 0.18s;
      }
      #btn-side-dock::after {
        content: 'PANELS'; position: absolute; top: calc(100% + 5px); left: 50%; transform: translateX(-50%);
        font: 700 9px/1 'Inter', system-ui, sans-serif; letter-spacing: 0.1em; color: var(--text-dim, #9ab0c4);
        white-space: nowrap; pointer-events: none;
      }
      #btn-side-dock:hover { background: rgba(40,52,70,0.9); border-color: rgba(150,180,215,0.45); }
      #btn-side-dock.open { background: rgba(40,58,82,0.95); border-color: rgba(120,190,255,0.6); box-shadow: 0 0 0 1px rgba(120,190,255,0.25), var(--shadow-sm); }
      #btn-side-dock.open::after { color: #8ec8ff; }
      #btn-side-dock svg { transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.3, 1.3); }
      #btn-side-dock.open svg { transform: scale(0.88); }
      #btn-side-dock .sd-dot {
        position: absolute; top: -4px; right: -4px; width: 11px; height: 11px; border-radius: 50%;
        background: #f0c040; box-shadow: 0 0 6px rgba(240,192,64,0.8); display: none;
      }
      #btn-side-dock.has-new .sd-dot { display: block; }

      /* ── The tray: a grid of the side buttons ── */
      #side-dock-tray {
        position: fixed; z-index: 39; display: none;
        grid-template-columns: repeat(3, 66px); grid-auto-rows: 56px; align-items: start; justify-items: center;
        padding: 26px 8px 6px;
        background: rgba(10,16,24,0.92); border: 1px solid var(--ui-border-b, #2a3a4a); border-radius: 14px;
        -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); box-shadow: var(--shadow-lg);
        transform-origin: 100% 100%;
      }
      body.side-dock-open #side-dock-tray { display: grid; animation: sdTrayIn 0.22s cubic-bezier(0.2, 0.8, 0.3, 1.15) backwards; }
      @keyframes sdTrayIn { from { opacity: 0; transform: translate(6px, 10px) scale(0.82); } to { opacity: 1; transform: none; } }
      #side-dock-tray .sd-head {
        position: absolute; left: 12px; top: 7px;
        font: 700 9px/12px 'Inter', system-ui, sans-serif; letter-spacing: 0.14em; color: var(--text-dim, #8aa0b4);
      }
      #side-dock-tray .sd-close {
        position: absolute; right: 6px; top: 3px; width: 20px; height: 20px; padding: 0;
        background: none; border: 0; color: var(--text-dim, #8aa0b4); font-size: 13px; line-height: 20px; cursor: pointer;
      }
      #side-dock-tray .sd-close:hover { color: #fff; }
      /* A button in the tray: in the grid, not pinned to the screen any more. */
      #side-dock-tray > .side-dock-item {
        position: relative !important; inset: auto !important; top: auto !important; left: auto !important;
        right: auto !important; bottom: auto !important; margin: 0 !important; zoom: 1 !important;
        animation: sdItemIn 0.24s cubic-bezier(0.2, 0.8, 0.3, 1.3) backwards;
        animation-delay: calc(var(--sd-i, 0) * 28ms + 50ms);
      }
      @keyframes sdItemIn { from { opacity: 0; transform: translateY(10px) scale(0.55); } to { opacity: 1; transform: none; } }
      #side-dock-tray > .side-dock-item::after {
        content: attr(data-sd-label); position: absolute; top: calc(100% + 3px); left: 50%;
        transform: translateX(-50%); white-space: nowrap; pointer-events: none;
        font: 600 9px/1 'Inter', system-ui, sans-serif; color: var(--text-dim, #9ab0c4);
      }

      /* ── The Research Station button ── */
      #btn-research {
        width: 34px; height: 34px; padding: 0;
        background: var(--glass, rgba(14,20,30,0.85)); border: 1px solid var(--ui-border-b, #2a3a4a);
        border-radius: 10px; color: var(--text, #cfe0ee); font-size: 15px; cursor: pointer;
        display: none; align-items: center; justify-content: center;
        -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); box-shadow: var(--shadow-sm);
      }
      #btn-research.unlocked { display: flex; }
      #btn-research:hover, #btn-research.open { border-color: #b088ff; color: #b088ff; }

      body.apocalypse #btn-side-dock, body.gw-intro #btn-side-dock, body.np-victory #btn-side-dock, body.gw-fusion #btn-side-dock,
      body.apocalypse #side-dock-tray, body.gw-intro #side-dock-tray, body.np-victory #side-dock-tray, body.gw-fusion #side-dock-tray { display: none !important; }

      /* PC: panels opened from the tray sit left of it rather than over it.
         (The phone build places them beside their own button already.) */
      html:not(.gw-mobile) body.side-dock-open :is(#msg-log-panel, #achievements-panel, #compendium-panel, #advisor-panel) {
        right: calc(var(--side-dock-w, 230px) + ${RIGHT + 12}px) !important;
      }
      html:not(.gw-mobile) body.side-dock-open :is(#trucks-panel, #drones-panel) {
        right: calc((var(--side-dock-w, 230px) + ${RIGHT + 12}px) / 1.15) !important;
      }
    `;
    const st = document.createElement('style');
    st.id = 'side-dock-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function build() {
    injectStyle();

    toggle = document.createElement('button');
    toggle.id = 'btn-side-dock';
    toggle.title = 'Panels';
    toggle.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
      '<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/>' +
      '<rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/></svg><span class="sd-dot"></span>';
    toggle.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!open); });
    document.body.appendChild(toggle);

    tray = document.createElement('div');
    tray.id = 'side-dock-tray';
    tray.innerHTML = '<div class="sd-head">PANELS</div><button class="sd-close" title="Close">✕</button>';
    tray.querySelector('.sd-close').addEventListener('click', (e) => { e.stopPropagation(); setOpen(false); });
    document.body.appendChild(tray);

    // The Research Station button.
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
      document.body.appendChild(b);
    }

    // Every side button moves into the tray, in grid order.
    for (const [id, label] of ORDER) {
      const el = $(id);
      if (!el) continue;
      el.classList.add('side-dock-item');
      el.dataset.sdLabel = label;
      el.style.removeProperty('zoom');
      tray.appendChild(el);
    }

    // A click or tap anywhere else folds the tray away. Not one on the tray
    // (its buttons are in it), its tile, or a panel opened from it: reading
    // the Compendium must not close the tray under it and shift the panel.
    const KEEP = ['side-dock-tray', 'btn-side-dock', 'msg-log-panel', 'achievements-panel', 'compendium-panel',
                  'advisor-panel', 'trucks-panel', 'drones-panel', 'truck-patrol-panel', 'saved-path-panel', 'blueprint-panel'];
    document.addEventListener('pointerdown', (e) => {
      if (!open) return;
      const t = e.target;
      if (!t || !t.closest) return;
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
    if (open) place();
  }

  // The tray sits just above the tile, right edges lined up, at the tile's
  // scale. A fixed element's offsets are scaled with its zoom, hence the /z.
  function place() {
    if (!open || !toggle || !tray) return;
    const z = parseFloat(getComputedStyle(toggle).zoom) || 1;
    const tr = toggle.getBoundingClientRect();
    if (!tr.width) return;
    if ((parseFloat(tray.style.zoom) || 1) !== z) tray.style.zoom = z === 1 ? '' : String(z);
    const right = innerWidth - tr.right, bottom = innerHeight - tr.top + 24 * z;   // clear of the tile's name
    tray.style.right = (right / z).toFixed(1) + 'px';
    tray.style.bottom = (bottom / z).toFixed(1) + 'px';
    let i = 0;
    for (const el of tray.children) {
      if (!el.classList.contains('side-dock-item')) continue;
      if (getComputedStyle(el).display === 'none') continue;
      if (el.style.getPropertyValue('--sd-i') !== String(i)) el.style.setProperty('--sd-i', String(i));
      if (el.style.zoom) el.style.removeProperty('zoom');
      i++;
    }
    document.documentElement.style.setProperty('--side-dock-w', tray.getBoundingClientRect().width.toFixed(0) + 'px');
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
    // News inside (every button with news marks itself has-new) lights the tile.
    if (toggle) {
      const news = ORDER.some(([id]) => { const el = $(id); return !!el && el.classList.contains('has-new'); });
      toggle.classList.toggle('has-new', news && !open);
    }
    // A tutorial card pointing at one of the buttons opens the tray to show it.
    if (!open) {
      for (const [id] of ORDER) { const el = $(id); if (el && el.classList.contains('tut-dom-glow')) { setOpen(true); break; } }
    }
    if (open) place();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();

  return { open: () => setOpen(true), close: () => setOpen(false), toggle: () => setOpen(!open), isOpen: () => open };
})();
