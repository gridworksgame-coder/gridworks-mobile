/* ═══════════════════════════════════════════════════════════════════
   PANEL DISMISS
   One rule for every side panel, HUD panel and building inspector:
     • a click anywhere outside an open panel closes it, and
     • opening a panel closes whichever others are open.
   Each panel is closed through its own close path, so any state it keeps
   (timers, targets, the button's lit state) is put away properly.

   What a click does NOT close panels for:
     • a drag (panning the map) — only a press and release within a few
       pixels counts, the same test the requests panel already used;
     • a click on the map that is doing a job — a build tool in hand,
       assigning a circuit, drawing a truck path, picking a relocation
       spot (InputManager.mapModeActive);
     • a click on the panel's own button (that button already toggles it),
       or inside a dialog, the tutorial card or the notification stack.
   Panels that open during the click itself (the zone panel opens on the
   second press of a double-click) are left alone by that click.
   ═══════════════════════════════════════════════════════════════════ */
const PanelDismiss = (() => {
  const CLICK_SLOP = 6;   // px a press may move and still count as a click

  // Clicks inside these never dismiss anything: dialogs and confirmations
  // raised over a panel, the guidance and alert stacks, the menus.
  const SAFE = [
    '#main-menu', '#pause-menu', '#dev-panel', '#tutorial-card', '#notif-stack',
    '[id$="-modal"]', '[id*="confirm"]', '#worldmap-overlay',
    '#gwm-root', '#gwm-help', '#gwm-install', '#gwm-frame', '#gwm-fsprompt',   // mobile touch controls
  ].join(', ');

  const byId = (id) => document.getElementById(id);
  const visible = (id) => !!byId(id)?.classList.contains('visible');

  // ── The panels ──────────────────────────────────────────────────
  // id: the panel element. opener: selector for the control(s) that toggle
  // it (a click there is left to that control). keep: other areas a click
  // in leaves this panel up.
  function _panels() {
    const list = [];

    // The top HUD panels (ui_bootstrap.js TOP_PANELS), closed the same way
    // closeOtherTopPanels closes them.
    const extraOpeners = {
      'population-panel': '#population-stat-btn',
      'income-breakdown': '#income-balance-group, #income-stat-btn',
      'score-panel':      '#score-stat-btn',
      'gov-panel':        '#gov-stat-btn',
    };
    if (typeof TOP_PANELS !== 'undefined') for (const tp of TOP_PANELS) {
      list.push({
        id: tp.panel,
        opener: [tp.btn && '#' + tp.btn, extraOpeners[tp.panel]].filter(Boolean).join(', '),
        isOpen: () => !!byId(tp.panel)?.classList.contains(tp.cls),
        close: () => {
          const p = byId(tp.panel);
          if (!p) return;
          p.classList.remove(tp.cls);
          if (tp.useStyleDisplay) p.style.display = 'none';
          if (tp.btn) byId(tp.btn)?.classList.remove('open');
        },
      });
    }

    // Building inspectors — the same set Escape puts away.
    const inspectors = [
      ['research-panel',     () => InspectionPanel],
      ['solar-panel',        () => SolarPanelInspector],
      ['refinery-panel',     () => RefineryPanel],
      ['fuelgen-panel',      () => FuelGenPanel],
      ['coalgen-panel',      () => CoalGenPanel],
      ['turbine-panel',      () => TurbinePanel],
      ['shaftgen-panel',     () => ShaftGenPanel],
      ['shaft-panel',        () => ShaftPanel],
      ['dam-panel',          () => DamPanel],
      ['waste-panel',        () => WastePanel],
      ['entity-panel',       () => EntityInfoPanel],
      ['wire-panel',         () => WireInspector],
      ['truck-patrol-panel', () => TruckPatrolPanel],
      ['saved-path-panel',   () => SavedPathPanel],
      ['events-panel',       () => EventsPanel],
    ];
    for (const [id, get] of inspectors) {
      let mod = null;
      try { mod = get(); } catch (_) { mod = null; }
      if (!mod || !mod.close) continue;
      list.push({ id, isOpen: () => !!mod.isOpen?.(), close: () => mod.close() });
    }

    // The two hotbar panels stay up while the player picks tools from the
    // bar (that's how a request gets filled), so the bar is theirs.
    list.push({
      id: 'req-panel', opener: '#hotbar-req-btn', keep: '#hotbar-row, .cat-popup',
      isOpen: () => !!byId('hotbar-req-btn')?.classList.contains('open'),
      close: () => { if (typeof closeRequestsPanel === 'function') closeRequestsPanel(); },
    });
    list.push({
      id: 'blueprint-panel', opener: '#hotbar-blueprint-btn', keep: '#hotbar-row, .cat-popup',
      isOpen: () => !!byId('hotbar-blueprint-btn')?.classList.contains('open'),
      close: () => { if (typeof BlueprintSystem !== 'undefined') BlueprintSystem.togglePanel(); },
    });

    list.push({
      id: 'zone-panel',
      isOpen: () => visible('zone-panel'),
      close: () => byId('zone-panel')?.classList.remove('visible'),
    });
    list.push({
      id: 'msg-log-panel', opener: '#btn-msglog',
      isOpen: () => !!MessageLog.isOpen?.(),
      close: () => MessageLog.close?.(),
    });
    list.push({
      id: 'contract-board', opener: '#btn-contracts',
      isOpen: () => typeof ContractSystem !== 'undefined' && !!ContractSystem.isOpen?.(),
      close: () => ContractSystem.closeBoard?.(),
    });
    list.push({
      id: 'np-dossier', opener: '#btn-meridian',
      isOpen: () => visible('np-dossier'),
      close: () => { if (typeof NationalProject !== 'undefined') NationalProject.closeDossier?.(); },
    });
    return list;
  }

  let PANELS = null;
  const panels = () => (PANELS ||= _panels());

  const _inside = (target, sel) => !!(sel && target?.closest?.(sel));
  const _inPanel = (target, p) => {
    const el = byId(p.id);
    return !!(el && el.contains(target)) || _inside(target, p.opener) || _inside(target, p.keep);
  };

  function _safeOpen(p) { try { return p.isOpen(); } catch (_) { return false; } }
  function _safeClose(p) { try { p.close(); } catch (err) { console.warn('[PanelDismiss] close failed for', p.id, err); } }

  // ── Click-away ──────────────────────────────────────────────────
  let _down = null;   // { x, y, target, open: Set of panels open at press }

  // Which panels the press landed in is taken at the press, not the
  // release: a control that rebuilds its panel on mousedown (the Circuit
  // Switch's network list) has detached the pressed element by pointerup,
  // and a detached element is inside nothing, so the click read as a click
  // outside and shut the panel it was made in.
  function _onDown(e) {
    if (e.button !== 0) { _down = null; return; }
    const open = new Set(panels().filter(_safeOpen));
    const inside = new Set([...open].filter(p => _inPanel(e.target, p)));
    _down = { x: e.clientX, y: e.clientY, target: e.target, open, inside };
  }

  function _onUp(e) {
    const d = _down; _down = null;
    if (!d || e.button !== 0) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_SLOP) return;   // a drag, not a click
    const target = d.target;
    if (_inside(target, SAFE)) return;
    const onMap = target?.tagName === 'CANVAS';
    if (onMap && typeof InputManager !== 'undefined' && InputManager.mapModeActive?.()) return;
    for (const p of d.open) {
      if (!_safeOpen(p)) continue;                 // already shut by something else
      if (d.inside.has(p) || _inPanel(target, p)) continue;
      _safeClose(p);
    }
    _seen = new Set(panels().filter(_safeOpen));
  }

  // ── Opening one closes the rest ─────────────────────────────────
  // Watches the panels' class and style; a panel that has just gone from
  // shut to open closes every other open panel. The observer callback runs
  // after the opening code has finished, so a panel that redraws itself by
  // hiding and re-showing in one go doesn't count as newly opened.
  let _seen = new Set();
  let _closing = false;

  function _onMutate() {
    if (_closing) return;
    const now = panels().filter(_safeOpen);
    const fresh = now.filter(p => !_seen.has(p));
    if (fresh.length) {
      _closing = true;
      for (const p of now) if (!fresh.includes(p)) _safeClose(p);
      _closing = false;
    }
    _seen = new Set(panels().filter(_safeOpen));
  }

  let _observer = null;
  function _observe() {
    if (!_observer) _observer = new MutationObserver(_onMutate);
    for (const p of panels()) {
      const el = byId(p.id);
      if (el && !el._pdWatched) {
        el._pdWatched = true;
        _observer.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
      }
      // A hotbar panel's open state lives on its button.
      const btn = p.opener && document.querySelector(p.opener.split(',')[0]);
      if (btn && !btn._pdWatched) {
        btn._pdWatched = true;
        _observer.observe(btn, { attributes: true, attributeFilter: ['class'] });
      }
    }
  }

  function init() {
    document.addEventListener('pointerdown', _onDown, true);
    document.addEventListener('pointerup', _onUp, true);
    _observe();
    _seen = new Set(panels().filter(_safeOpen));
    // Some panels are built on first use (the dossier, the contract board,
    // the truck inspectors): pick them up as they appear.
    setInterval(_observe, 2000);
  }

  return { init, closeAll: (except = null) => { for (const p of panels()) if (p.id !== except && _safeOpen(p)) _safeClose(p); } };
})();

PanelDismiss.init();
