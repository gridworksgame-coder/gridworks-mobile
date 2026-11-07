/* ═══════════════════════════════════════════════════════════════════
   GAMEPAD INPUT
   Controller support via a virtual mouse cursor. Rather than teaching
   every tool, panel and popup a second input path, the left stick drives
   an on-screen cursor and the face buttons synthesize the same mouse and
   keyboard events the real devices would — so InputManager, the HUD, the
   menus and the fishing minigame all work unchanged.

   Layout (standard mapping / Xbox names):
     Left stick   move cursor (edge-pushes the camera)
     Right stick  pan camera — or scroll the panel under the cursor
     D-pad        step cursor one tile, snapped to tile centres — or, while
                  a menu is up, move between its buttons (left/right
                  also adjusts a selected slider or dropdown)
     A            left click (hold to drag / drag-place / reel)
     B            close the open dropdown / panel / popup; with nothing
                  open, right click on the map (remove / chop / cancel)
                  or Escape over UI; over a blueprint's save/edit preview,
                  remove / restore the part under the cursor
     X           R  — rotate
     Y            Q  — pick the tool under the cursor
     LB / RB      previous / next build category
     LT / RT      zoom out / in at the cursor
     View         M — world map (tap); E — highest-tier Research Station
                  (hold); also the modifier for the combos below
     View + X     F — flashlight
     View + RB    B — blueprint area-select
     Menu         Escape — close panels / pause menu
     L3           Shift — held down with the button, so hold it and drag with A
                  to select, or press B to delete a whole line
     R3           time: tap plays / pauses (and drops out of fast forward),
                  hold steps through the fast-forward speeds every 0.375s
   A truck path is finished with a double-tap of A (a double-click).
   While driving a truck the left stick and D-pad steer it instead.
   ═══════════════════════════════════════════════════════════════════ */

const GamepadInput = (() => {
  const DEADZONE      = 0.18;
  const CURSOR_SPEED  = 1100;  // px/s at full deflection
  const PAN_SPEED     = 1100;  // screen px/s at full deflection
  const SCROLL_SPEED  = 900;
  const EDGE_MARGIN   = 2;
  const ZOOM_RATE     = 9;     // zoomAt steps per second at full trigger
  const ZOOM_REPEAT_LAG = 1;   // steps of held pull after the first before continuous zoom starts
  const REPEAT_DELAY  = 280;   // ms before a held D-pad starts repeating
  const REPEAT_EVERY  = 85;
  const FF_STEP       = 375;   // ms of holding R3 per fast-forward speed step
  const VIEW_HOLD     = 500;   // ms holding View (with no combo) to open the Research Station

  // Player sensitivity (Options ▸ Controller), a multiplier on the speeds
  // above: one for the cursor (left stick), one for the camera (right-stick
  // pan and trigger zoom).
  const SENS_MIN = 0.25, SENS_MAX = 1.25;
  const SENS_KEYS = { cursor: 'gw_pad_cursor_sens', camera: 'gw_pad_camera_sens' };
  const sens = { cursor: 1, camera: 1 };
  for (const k in SENS_KEYS) {
    try { const v = parseFloat(localStorage.getItem(SENS_KEYS[k])); if (!isNaN(v)) sens[k] = Math.max(SENS_MIN, Math.min(SENS_MAX, v)); } catch (_e) {}
  }
  function setSensitivity(k, v) {
    sens[k] = Math.max(SENS_MIN, Math.min(SENS_MAX, v));
    try { localStorage.setItem(SENS_KEYS[k], String(sens[k])); } catch (_e) {}
  }

  const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  // View + button → key, replacing that button's usual action while View
  // is held: flashlight, blueprint area-select.
  const VIEW_COMBOS = [[BTN.X, 'f'], [BTN.RB, 'b']];

  let cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  let active   = false;          // gamepad is the current input device
  let prev     = [];             // previous frame's pressed state per button
  let hoverEl  = null;
  let pressEl  = [null, null, null];   // element under cursor at press, per mouse button
  let heldMouse = 0;             // MouseEvent.buttons bitmask we're holding
  let dpadNext = {};             // button index → timestamp of next repeat
  let zoomAcc  = 0;
  let lastZoomDir = 0;           // trigger zoom direction last frame (for the tap step)
  let driveKeys = new Set();     // arrow keys we're holding down for truck driving
  let shiftHeld = false;         // L3: the Shift we're holding down, carried by every synthetic event
  let rangeDrag = null;          // <input type=range> being dragged with A
  let viewDownAt = 0, viewComboUsed = false, viewHoldFired = false;
  let r3DownAt = 0, r3Steps = 0;   // R3 hold: fast-forward steps taken so far
  let lastTs   = performance.now();

  // ── Cursor visual ────────────────────────────────────────────────
  // Wears whatever cursor the element under it asks for — custom_cursor.js
  // turns every CSS cursor into one of the game's own drawn cursors, so the
  // controller gets the same crosshair while placing, blue arrow over
  // buttons, and so on. The arrow below is only the fallback.
  const FALLBACK = 'url("data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
    '<path d="M5 4.5 L5 25.5 L10.5 20.5 L14.2 29 L18 27.4 L14.4 19 L21.6 18.8 Z" fill="rgba(0,0,0,0.35)"/>' +
    '<path d="M4 3 L4 24 L9.5 19 L13.2 27.6 L17 26 L13.4 17.6 L20.6 17.4 Z" fill="#07090d" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/></svg>') + '")';
  let hotX = 4, hotY = 3;
  const cursorEl = document.createElement('div');
  cursorEl.id = 'gamepad-cursor';
  cursorEl.style.cssText =
    'position:fixed;left:0;top:0;width:32px;height:32px;pointer-events:none;z-index:2147483647;' +
    `display:none;background:${FALLBACK} no-repeat 0 0 / 32px 32px;will-change:transform;`;
  document.body.appendChild(cursorEl);

  // The native pointer is hidden while the controller drives, so it doesn't
  // sit frozen wherever the mouse was left.
  const style = document.createElement('style');
  style.textContent = 'body.gp-active, body.gp-active * { cursor: none !important; }';
  document.head.appendChild(style);

  let lastLook = null, lastProbe = 0;
  function syncLook(el, force) {
    const now = performance.now();
    if (!force && now - lastProbe < 120) return;
    lastProbe = now;
    // Lift the hiding rule just long enough to read the real cursor; both
    // changes land in the same task, so nothing is ever painted without it.
    document.body.classList.remove('gp-active');
    const css = getComputedStyle(el).cursor;
    document.body.classList.add('gp-active');
    if (css === lastLook) return;
    lastLook = css;
    const m = css.match(/url\("(.+?)"\)\s+(\d+)\s+(\d+)/);
    if (m) { cursorEl.style.backgroundImage = `url("${m[1]}")`; hotX = +m[2]; hotY = +m[3]; }
    else   { cursorEl.style.backgroundImage = FALLBACK;     hotX = 4;     hotY = 3; }
  }

  // ── Hover styling ────────────────────────────────────────────────
  // Synthetic events can't trigger CSS :hover, so every :hover rule gets a
  // twin keyed on a .gp-hover class, which is kept on the element under the
  // controller cursor and its ancestors (as :hover would be).
  // Stylesheets that systems inject later (the Game Modes / scenario
  // screens, among others, add theirs on first open) are mirrored as they
  // arrive; each sheet only once.
  const mirrored = new WeakSet();
  function mirrorSheet(sheet) {
    if (!sheet || mirrored.has(sheet)) return;
    const walk = (rules, parent) => {
      for (let i = rules.length - 1; i >= 0; i--) {
        const r = rules[i];
        if (!r.selectorText) { if (r.cssRules) walk(r.cssRules, r); continue; }
        if (!r.selectorText.includes(':hover')) continue;
        try { parent.insertRule(`${r.selectorText.replace(/:hover/g, '.gp-hover')}{${r.style.cssText}}`, i + 1); } catch (_e) {}
      }
    };
    try { walk(sheet.cssRules, sheet); mirrored.add(sheet); } catch (_e) { /* cross-origin (fonts), or not loaded yet */ }
  }
  function mirrorHoverRules() {
    for (const sheet of document.styleSheets) mirrorSheet(sheet);
  }
  if (document.readyState === 'complete') mirrorHoverRules();
  else window.addEventListener('load', mirrorHoverRules);
  new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeName === 'STYLE') mirrorSheet(n.sheet);
      else if (n.nodeName === 'LINK') n.addEventListener('load', () => mirrorSheet(n.sheet), { once: true });
    }
  }).observe(document.head, { childList: true });

  let hoverChain = [];
  function setHoverChain(el) {
    for (const e of hoverChain) e.classList.remove('gp-hover');
    hoverChain = [];
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      e.classList.add('gp-hover');
      hoverChain.push(e);
    }
  }

  function setActive(v) {
    if (active === v) return;
    active = v;
    cursorEl.style.display = v ? 'block' : 'none';
    document.body.classList.toggle('gp-active', v);
    if (!v) { setHoverChain(null); hoverEl = null; }
    if (v) { lastLook = null; syncLook(elAt(), true); placeCursor(); }
  }
  function placeCursor() {
    cursorEl.style.transform = `translate(${cx - hotX}px, ${cy - hotY}px)`;
  }

  // A real mouse hands control straight back. Synthetic events are
  // untrusted, so they never trip this.
  window.addEventListener('mousemove', e => {
    if (!e.isTrusted || !active) return;
    if (Math.abs(e.movementX) + Math.abs(e.movementY) < 2) return;
    cx = e.clientX; cy = e.clientY;
    setActive(false);
  }, true);

  // Other systems (tutorial cards, the Options controls list) show controller
  // or keyboard prompts depending on this; they listen for 'gw-padchange'.
  const isConnected = () => {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return true;
    return false;
  };
  const padChanged = () => window.dispatchEvent(new Event('gw-padchange'));
  window.addEventListener('gamepadconnected', e => {
    if (typeof showToast === 'function') showToast(`🎮 Controller connected`, '#60b0ff', '#090e18', '#1e4060');
    padChanged();
  });
  window.addEventListener('gamepaddisconnected', () => {
    releaseAll();
    setActive(false);
    padChanged();
  });
  // Alt-tab mid-press would otherwise leave a synthetic button stuck down.
  window.addEventListener('blur', releaseAll);

  // ── Event synthesis ──────────────────────────────────────────────
  function elAt() {
    return document.elementFromPoint(cx, cy) || document.body;
  }
  function mouse(type, target, button = 0, extra = {}) {
    const init = {
      bubbles: true, cancelable: true, composed: true, view: window,
      clientX: cx, clientY: cy, screenX: cx, screenY: cy,
      button, buttons: heldMouse, shiftKey: shiftHeld, ...extra,
    };
    if (type.startsWith('pointer')) {
      target.dispatchEvent(new PointerEvent(type, { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
    } else if (type === 'wheel') {
      target.dispatchEvent(new WheelEvent(type, init));
    } else {
      target.dispatchEvent(new MouseEvent(type, init));
    }
  }
  const KEY_CODES = { ' ': 'Space', Escape: 'Escape', Enter: 'Enter', Delete: 'Delete', r: 'KeyR', q: 'KeyQ', m: 'KeyM', e: 'KeyE', f: 'KeyF', x: 'KeyX', b: 'KeyB', Alt: 'AltLeft', Shift: 'ShiftLeft',
                      ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' };
  function key(type, k) {
    const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
    target.dispatchEvent(new KeyboardEvent(type, {
      key: k, code: KEY_CODES[k] || (/^\d$/.test(k) ? 'Digit' + k : ''), shiftKey: shiftHeld, bubbles: true, cancelable: true, composed: true,
    }));
  }
  function tapKey(k) { key('keydown', k); key('keyup', k); }
  function setShift(on) {
    if (on === shiftHeld) return;
    shiftHeld = on;
    key(on ? 'keydown' : 'keyup', 'Shift');
  }
  // B's Escape: backs out of whatever is open, but never opens the pause
  // menu (that's the Menu button's, or the on-screen MENU button's, job).
  // The Escape handlers read window.padBackEscape while it is dispatched.
  function backKey() {
    window.padBackEscape = true;
    try { tapKey('Escape'); } finally { window.padBackEscape = false; }
  }

  // Keeps hover state (the map ghost, tooltips, hover highlights) in step
  // with the cursor. The camera moving under a still cursor changes which
  // tile it's over, so this runs on camera motion too.
  // A held down that started on the map keeps the map: hold A and sweep the
  // stick to lay wire (or anything placed by dragging) straight across, and
  // the HUD the cursor passes over doesn't take the drag. Every move and the
  // release go to the canvas until A comes up.
  const mapHold = () => !!(heldMouse & 1) && pressEl[0]?.id === 'canvas';
  const pointerEl = () => mapHold() ? pressEl[0] : elAt();
  function moveTo() {
    const el = pointerEl();
    if (el !== hoverEl) {
      if (hoverEl) {
        mouse('pointerout', hoverEl); mouse('mouseout', hoverEl, 0, { relatedTarget: el });
        mouse('mouseleave', hoverEl, 0, { bubbles: false, relatedTarget: el });
      }
      mouse('pointerover', el); mouse('mouseover', el, 0, { relatedTarget: hoverEl });
      mouse('mouseenter', el, 0, { bubbles: false, relatedTarget: hoverEl });
      hoverEl = el;
      setHoverChain(el);
      syncLook(el, true);
    }
    mouse('pointermove', el);
    mouse('mousemove', el);
    if (rangeDrag) setRangeFromCursor(rangeDrag);
  }

  function setRangeFromCursor(input) {
    const r = input.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (cx - r.left) / Math.max(1, r.width)));
    const min = parseFloat(input.min || 0), max = parseFloat(input.max || 100);
    const step = parseFloat(input.step) || 1;
    const v = Math.round((min + t * (max - min)) / step) * step;
    if (String(v) === input.value) return;
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const BIT = [1, 4, 2];   // MouseEvent.button → MouseEvent.buttons bit
  function press(button) {
    const el = elAt();
    pressEl[button] = el;
    heldMouse |= BIT[button];
    mouse('pointerdown', el, button);
    mouse('mousedown', el, button);
    if (button !== 0) return;
    // Native widgets don't respond to synthetic mouse events, so give the
    // two the game uses a controller-friendly behaviour of their own.
    if (el.matches?.('input[type=range]')) {
      el.focus(); rangeDrag = el; setRangeFromCursor(el);
    } else if (el.matches?.('select')) {
      el.focus();
      el.selectedIndex = (el.selectedIndex + 1) % Math.max(1, el.options.length);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.matches?.('input, textarea, button, [tabindex]')) {
      el.focus();
    } else if (document.activeElement && document.activeElement !== document.body && el.id === 'canvas') {
      document.activeElement.blur();
    }
  }
  function release(button) {
    if (!(heldMouse & BIT[button])) return;
    const el = pointerEl();
    heldMouse &= ~BIT[button];
    mouse('pointerup', el, button);
    mouse('mouseup', el, button);
    const down = pressEl[button];
    pressEl[button] = null;
    if (button === 0) {
      if (rangeDrag) {
        rangeDrag.dispatchEvent(new Event('change', { bubbles: true }));
        rangeDrag = null;
      } else if (down && (down === el || down.contains(el) || el.contains(down))) {
        const target = down.contains(el) ? el : down;
        if (!target.matches?.('select')) mouse('click', target, 0);
        _dblCheck(target);
      }
    } else if (button === 2) {
      mouse('contextmenu', el, 2);
    }
  }
  // Two A-taps in quick succession on the same element = dblclick.
  let _lastClick = { t: 0, el: null };
  function _dblCheck(el) {
    const now = performance.now();
    if (_lastClick.el === el && now - _lastClick.t < 400) {
      mouse('dblclick', el, 0);
      _lastClick = { t: 0, el: null };
    } else {
      _lastClick = { t: now, el };
    }
  }

  function releaseAll() {
    if (heldMouse & 1) release(0);
    if (heldMouse & 2) release(2);
    for (const k of driveKeys) key('keyup', k);
    driveKeys.clear();
    setShift(false);
    rangeDrag = null;
  }

  // ── Helpers ──────────────────────────────────────────────────────
  const overCanvas = () => mapHold() || elAt()?.id === 'canvas';

  function scrollableUnder(dy) {
    if (mapHold()) return null;                     // mid-drag on the map: the stick pans it
    for (let el = elAt(); el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      if (el.id === 'canvas') return null;
      const s = getComputedStyle(el);
      if (!/(auto|scroll)/.test(s.overflowY)) continue;
      const range = el.scrollHeight - el.clientHeight;
      if (range <= 1) continue;
      // A column-reverse list (the message log) starts at its bottom, and its
      // scrollTop runs from -range at the top up to 0 at the bottom.
      const min = s.flexDirection === 'column-reverse' ? -range : 0;
      if (dy < 0 && el.scrollTop <= min + 1) continue;
      if (dy > 0 && el.scrollTop >= min + range - 1) continue;
      return el;
    }
    return null;
  }

  function snapToTileCentre(dc, dr) {
    const canvas = document.getElementById('canvas');
    if (typeof Camera === 'undefined' || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const z = Camera.zoom;
    const w = Camera.screenToWorld(cx - rect.left, cy - rect.top);
    const col = Math.floor(w.x / TILE) + dc;
    const row = Math.floor(w.y / TILE) + dr;
    let sx = ((col + 0.5) * TILE - Camera.x) * z + rect.left;
    let sy = ((row + 0.5) * TILE - Camera.y) * z + rect.top;
    // Stepping off screen drags the camera along by the overshoot.
    const pad = TILE * z;
    const ox = sx < pad ? sx - pad : sx > window.innerWidth  - pad ? sx - (window.innerWidth  - pad) : 0;
    const oy = sy < pad ? sy - pad : sy > window.innerHeight - pad ? sy - (window.innerHeight - pad) : 0;
    if (ox || oy) { Camera.panByScreen(-ox, -oy); sx -= ox; sy -= oy; }
    cx = sx; cy = sy;
  }

  const truckDriven = () => typeof TruckSystem !== 'undefined' && TruckSystem.getDriven?.();

  function setDriveKey(k, on) {
    if (on && !driveKeys.has(k))      { driveKeys.add(k); key('keydown', k); }
    else if (!on && driveKeys.has(k)) { driveKeys.delete(k); key('keyup', k); }
  }

  function cycleCategory(dir) {
    if (typeof HOTBAR_CATEGORIES === 'undefined') return;
    // Only categories the hotbar is actually showing — locked ones are hidden.
    const cats = HOTBAR_CATEGORIES.filter(c => document.querySelector(`.cat-btn[data-cat="${c.id}"]`)?.style.display !== 'none');
    if (!cats.length) return;
    const cur = typeof openCategoryId !== 'undefined' ? cats.findIndex(c => c.id === openCategoryId) : -1;
    const next = cur < 0 ? (dir > 0 ? 0 : cats.length - 1) : (cur + dir + cats.length) % cats.length;
    // Opened directly: the number keys that used to open categories are now
    // the player's item hotkeys.
    closeCategoryPopup();
    openCategoryPopup(cats[next].id);
  }

  const dz = v => Math.abs(v) < DEADZONE ? 0 : Math.sign(v) * (Math.abs(v) - DEADZONE) / (1 - DEADZONE);

  // ── Menu navigation ──────────────────────────────────────────────
  // Topmost first, matching how they stack on screen.
  const MENUS = ['folder-picker', 'confirm-modal', 'save-name-modal', 'save-game-modal', 'options-modal',
                 'load-game-modal', 'citynaming-modal', 'pause-menu', 'main-menu'];
  // The scenario cards are divs (they hold a button), marked role=button.
  const ITEMS = 'button, input, select, textarea, a[href], [role=button]';

  function openMenu() {
    // Game Modes, the scenario picker and the scenario screens open as an
    // overlay above everything here, the main menu included.
    const scn = document.querySelector('.scn-overlay');
    if (scn && scn.getClientRects().length) return scn;
    for (const id of MENUS) {
      const el = document.getElementById(id);
      if (el && getComputedStyle(el).display !== 'none' && el.getClientRects().length) return el;
    }
    return null;
  }
  function menuItems(menu) {
    return [...menu.querySelectorAll(ITEMS)].filter(e => {
      if (e.disabled || !e.getClientRects().length) return false;
      const s = getComputedStyle(e);
      return s.visibility !== 'hidden' && s.pointerEvents !== 'none';
    });
  }
  const centre = e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

  let menuSel = null;
  function selectItem(e) {
    menuSel = e;
    e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const c = centre(e);
    cx = c.x; cy = c.y;
  }

  // Spatial pick: the nearest item in the pressed direction, favouring
  // ones in line with the current item. Up/down wrap around the list.
  function menuStep(menu, dx, dy) {
    const items = menuItems(menu);
    if (!items.length) return;
    let cur = menuSel && items.includes(menuSel) ? menuSel : null;
    if (!cur) {
      // Start from whatever the cursor is already on, else the item the
      // menu focused on opening, else the first item.
      const under = elAt();
      cur = items.find(e => e === under || e.contains(under));
      if (!cur) { selectItem(items.includes(document.activeElement) ? document.activeElement : items[0]); return; }
    }
    // Sliders and dropdowns take left/right as a value change.
    if (dx && cur.matches('input[type=range]')) {
      const step = (parseFloat(cur.step) || 1) * Math.max(1, Math.round((cur.max - cur.min) / 20 / (parseFloat(cur.step) || 1)));
      cur.value = Math.min(+cur.max, Math.max(+cur.min, +cur.value + dx * step));
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      cur.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (dx && cur.matches('select')) {
      const n = cur.options.length;
      cur.selectedIndex = (cur.selectedIndex + dx + n) % n;
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      cur.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const a = centre(cur);
    let best = null, bestScore = Infinity;
    for (const e of items) {
      if (e === cur) continue;
      const b = centre(e);
      const along = dx ? (b.x - a.x) * dx : (b.y - a.y) * dy;
      const across = dx ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x);
      if (along <= 4) continue;
      const score = along + across * 2.5;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (!best && dy) {
      // Wrap: the item furthest the other way, nearest in line.
      for (const e of items) {
        if (e === cur) continue;
        const b = centre(e);
        const score = (b.y - a.y) * dy + Math.abs(b.x - a.x) * 2.5;
        if (score < bestScore) { bestScore = score; best = e; }
      }
    }
    if (best) selectItem(best);
  }

  // ── Build-category popup navigation ──────────────────────────────
  // With a hotbar category open, the D-pad walks its item tiles instead of
  // stepping the map cursor — nearest tile in the pressed direction, wrapping
  // round at the ends of a row. The cursor lands on the tile (so its tooltip
  // shows) and A picks it like a click.
  function openCategoryItems() {
    const popup = document.querySelector('.cat-btn.open .cat-popup');
    if (!popup) return null;
    const items = [...popup.querySelectorAll('.tool-item')].filter(e => e.getClientRects().length);
    return items.length ? items : null;
  }
  function popupStep(items, dx, dy) {
    const under = elAt();
    const cur = items.find(e => e === under || e.contains(under));
    if (!cur) { selectItem(items[0]); return; }
    const a = centre(cur);
    const pick = (score) => {
      let best = null, bestScore = Infinity;
      for (const e of items) {
        if (e === cur) continue;
        const s = score(centre(e));
        if (s !== null && s < bestScore) { bestScore = s; best = e; }
      }
      return best;
    };
    let next = pick(b => {
      const along = dx ? (b.x - a.x) * dx : (b.y - a.y) * dy;
      if (along <= 4) return null;
      return along + (dx ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x)) * 2.5;
    });
    // Off the end of a row: wrap to the far end of the same row.
    if (!next && dx) next = pick(b => Math.abs(b.y - a.y) > 8 ? null : (b.x - a.x) * dx);
    if (next) selectItem(next);
  }

  // ── Poll loop ────────────────────────────────────────────────────
  function poll(ts) {
    requestAnimationFrame(poll);
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) return;

    const pressed = gp.buttons.map(b => b.pressed || b.value > 0.5);
    const val     = i => gp.buttons[i] ? gp.buttons[i].value : 0;
    const down    = i => pressed[i] && !prev[i];
    const up      = i => !pressed[i] && prev[i];
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0);
    const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    const lt = val(BTN.LT) > 0.08 ? val(BTN.LT) : 0;
    const rt = val(BTN.RT) > 0.08 ? val(BTN.RT) : 0;

    // Scenes own the pad while they play: A advances, B held skips. The left
    // stick still moves the cursor around (it pans nothing: each scene flies
    // its own camera).
    const scene =
      typeof NationalProject !== 'undefined' && NationalProject.isActive() ? () => NationalProject.padFrame(down(BTN.A), pressed[BTN.B]) :
      typeof CompanyHQ !== 'undefined' && CompanyHQ.isActive() ? () => CompanyHQ.padFrame(down(BTN.A), pressed[BTN.B]) :
      typeof ResearchMilestone !== 'undefined' && ResearchMilestone.isActive() ? () => ResearchMilestone.padFrame(down(BTN.A)) :
      typeof FusionResearch !== 'undefined' && FusionResearch.isActive() ? () => FusionResearch.padFrame(down(BTN.A), pressed[BTN.B]) :
      typeof IntroCinematic !== 'undefined' && IntroCinematic.isActive() ? () => IntroCinematic.padFrame(down(BTN.A), pressed[BTN.B]) :
      null;
    if (scene) {
      if (lx || ly) {
        setActive(true);
        const mag = Math.min(1, Math.hypot(lx, ly));
        const speed = CURSOR_SPEED * sens.cursor * mag * mag / (mag || 1);
        cx = Math.max(0, Math.min(window.innerWidth - 1, cx + lx * speed * dt));
        cy = Math.max(0, Math.min(window.innerHeight - 1, cy + ly * speed * dt));
        moveTo();
        placeCursor();
      }
      scene();
      prev = pressed;
      return;
    }

    // L3 — Shift. Follows the button rather than its edges, and comes before
    // the bail-out below, so a real mouse taking over mid-hold can't strand it.
    setShift(!!pressed[BTN.L3]);

    const anyInput = pressed.some(Boolean) || lx || ly || rx || ry || lt || rt;
    if (anyInput) setActive(true);
    if (!active) { prev = pressed; return; }

    let moved = false;
    const driving = truckDriven();

    // Left stick — steer a driven truck, otherwise the cursor.
    if (driving) {
      setDriveKey('ArrowUp',    ly < -0.3 || pressed[BTN.UP]);
      setDriveKey('ArrowDown',  ly >  0.3 || pressed[BTN.DOWN]);
      setDriveKey('ArrowLeft',  lx < -0.3 || pressed[BTN.LEFT]);
      setDriveKey('ArrowRight', lx >  0.3 || pressed[BTN.RIGHT]);
    } else {
      if (driveKeys.size) for (const k of [...driveKeys]) setDriveKey(k, false);
      if (lx || ly) {
        const mag = Math.min(1, Math.hypot(lx, ly));
        const speed = CURSOR_SPEED * sens.cursor * mag * mag / (mag || 1);   // quadratic ramp: fine aim near centre
        let nx = cx + lx * speed * dt, ny = cy + ly * speed * dt;
        // Pushing past a screen edge while over the map scrolls the map.
        const W = window.innerWidth, H = window.innerHeight;
        let ex = 0, ey = 0;
        if (nx < EDGE_MARGIN)     { ex = nx - EDGE_MARGIN;     nx = EDGE_MARGIN; }
        if (nx > W - EDGE_MARGIN) { ex = nx - (W - EDGE_MARGIN); nx = W - EDGE_MARGIN; }
        if (ny < EDGE_MARGIN)     { ey = ny - EDGE_MARGIN;     ny = EDGE_MARGIN; }
        if (ny > H - EDGE_MARGIN) { ey = ny - (H - EDGE_MARGIN); ny = H - EDGE_MARGIN; }
        cx = nx; cy = ny;
        menuSel = null;
        if ((ex || ey) && typeof Camera !== 'undefined' && overCanvas()) Camera.panByScreen(-ex, -ey);
        moved = true;
      }

      // D-pad — tile steps with key-repeat.
      const now = performance.now();
      for (const [b, dc, dr] of [[BTN.UP, 0, -1], [BTN.DOWN, 0, 1], [BTN.LEFT, -1, 0], [BTN.RIGHT, 1, 0]]) {
        if (!pressed[b]) { delete dpadNext[b]; continue; }
        if (down(b)) dpadNext[b] = now + REPEAT_DELAY;
        else if (now < dpadNext[b]) continue;
        else dpadNext[b] = now + REPEAT_EVERY;
        const menu = openMenu();
        const catItems = menu ? null : openCategoryItems();
        if (menu) menuStep(menu, dc, dr);
        else if (catItems) popupStep(catItems, dc, dr);
        else if (overCanvas()) snapToTileCentre(dc, dr);
        else { cx += dc * 24; cy += dr * 24; }
        moved = true;
      }
    }

    // Right stick — scroll the UI under the cursor, or pan the map. With the
    // world map open it pans that map, not the world camera hidden behind it,
    // except over the map's legend, which it scrolls (the legend is drawn on
    // the map canvas, so scrollableUnder can't see it).
    // Over a tutorial card it only ever scrolls the card: at the card's end
    // (or on a short card) it does nothing rather than panning the camera.
    if (rx || ry) {
      const sc = ry ? scrollableUnder(ry) : null;
      const onMap = typeof WorldMapSystem !== 'undefined' && WorldMapSystem.isOpen;
      if (sc) sc.scrollTop += ry * SCROLL_SPEED * dt;
      else if (onMap && WorldMapSystem.scrollLegendAt && WorldMapSystem.scrollLegendAt(cx, cy, ry * SCROLL_SPEED * dt)) moved = true;
      else if (onMap) {
        WorldMapSystem.panByScreen(-rx * PAN_SPEED * sens.camera * dt, -ry * PAN_SPEED * sens.camera * dt);
        moved = true;
      }
      else if (typeof Camera !== 'undefined' && !driving && !openMenu() && !elAt()?.closest?.('.tut-card')) {
        Camera.panByScreen(-rx * PAN_SPEED * sens.camera * dt, -ry * PAN_SPEED * sens.camera * dt);
        moved = true;
      }
    }

    // Triggers — zoom at the cursor. A fresh pull zooms one step straight
    // away, so a quick tap always registers (the rate-based accumulator alone
    // needed ~1/9s of full pull before its first step, and a tap let go
    // first). Holding then carries on at the accumulated rate, after a short
    // key-repeat-style pause so a tap doesn't land as two steps.
    // With the world map open the triggers zoom the map, not the world
    // camera hidden behind it. Behind the pause menu (or any other menu)
    // they do nothing.
    const zoomDir = Math.sign(rt - lt);
    if ((lt || rt) && typeof Camera !== 'undefined' && !openMenu()) {
      const canvas = document.getElementById('canvas');
      const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
      const onMap = typeof WorldMapSystem !== 'undefined' && WorldMapSystem.isOpen;
      const zoomStep = dir => onMap ? WorldMapSystem.zoomStep(cx, cy, dir)
                                    : Camera.zoomAt(cx - rect.left, cy - rect.top, dir);
      if (zoomDir && zoomDir !== lastZoomDir) {
        zoomStep(zoomDir);
        zoomAcc = -zoomDir * ZOOM_REPEAT_LAG;
      }
      zoomAcc += (rt - lt) * ZOOM_RATE * sens.camera * dt;
      while (Math.abs(zoomAcc) >= 1) {
        const dir = Math.sign(zoomAcc);
        zoomStep(dir);
        zoomAcc -= dir;
      }
      moved = true;
    } else {
      zoomAcc = 0;
    }
    lastZoomDir = zoomDir;

    cx = Math.max(0, Math.min(window.innerWidth - 1, cx));
    cy = Math.max(0, Math.min(window.innerHeight - 1, cy));
    if (moved || heldMouse) moveTo();
    // Tools change the cursor without the cursor moving (picking one from
    // the hotbar turns the map's arrow into a crosshair).
    syncLook(hoverEl || elAt(), false);
    placeCursor();

    // A — left mouse.
    if (down(BTN.A)) press(0);
    if (up(BTN.A))   release(0);

    // B — back out first, act second. It closes whatever is open (a HUD
    // dropdown, then any panel/popup Escape would close, wherever the cursor
    // is); with nothing open it's the right mouse button on the map (remove /
    // chop / cancel stamp) and Escape over UI. A selected tool is the one
    // exception: B keeps deselecting it the right-click way.
    // An open build menu (a category, or the expanded bar) closes first —
    // before any other B action, whatever the cursor is over and even with a
    // tool selected (which otherwise takes B as a right-click).
    // Over the blueprint save/edit preview B is the right-click that removes
    // (or restores) the part under the cursor, not a back-out of the modal.
    const bpPreview = down(BTN.B) && elAt()?.id === 'blueprint-save-preview';
    const buildOpen = down(BTN.B) && !bpPreview && !openMenu() && typeof buildMenuOpen === 'function' && buildMenuOpen();
    if (bpPreview) press(2);
    else if (buildOpen) { closeBuildMenu(); if (typeof SFX !== 'undefined') SFX.click?.(); }
    else if (down(BTN.B)) {
      const topOpen = typeof TOP_PANELS !== 'undefined' &&
        TOP_PANELS.some(({ panel, cls }) => document.getElementById(panel)?.classList.contains(cls));
      const inGame  = !openMenu();
      if (inGame && topOpen && typeof closeOtherTopPanels === 'function') closeOtherTopPanels(null);
      // Over a selection (a whole line picked with L3 + A, say) B deletes
      // it, as Delete does; anywhere else on the map it lets it go.
      else if (inGame && overCanvas() && typeof InputManager !== 'undefined'
               && !InputManager.state.selectedTool && InputManager.selectionUnderCursor?.()) InputManager.deleteSelection();
      else if (inGame && overCanvas() && typeof InputManager !== 'undefined'
               && !InputManager.state.selectedTool && InputManager.hasEscapeTarget?.()) backKey();
      else if (overCanvas()) press(2);
      else backKey();
    }
    if (up(BTN.B)) release(2);

    // View held turns X / RB into shortcuts (see VIEW_COMBOS).
    const combo = new Set();
    if (pressed[BTN.VIEW]) {
      for (const [b, k] of VIEW_COMBOS) {
        if (down(b)) { tapKey(k); viewComboUsed = true; combo.add(b); }
      }
    }
    if (down(BTN.X)  && !combo.has(BTN.X))  tapKey('r');
    if (down(BTN.Y))                        tapKey('q');
    if (down(BTN.LB))                       cycleCategory(-1);
    if (down(BTN.RB) && !combo.has(BTN.RB)) cycleCategory(1);
    // View: a tap toggles the world map; held for VIEW_HOLD it opens the
    // Research Station instead (fired while still held, so it responds
    // without waiting for release). Used as a modifier (View + X / RB) it
    // does neither.
    if (down(BTN.VIEW)) { viewDownAt = performance.now(); viewComboUsed = false; viewHoldFired = false; }
    if (pressed[BTN.VIEW] && !viewComboUsed && !viewHoldFired && performance.now() - viewDownAt >= VIEW_HOLD) {
      viewHoldFired = true;
      tapKey('e');
    }
    if (up(BTN.VIEW) && !viewComboUsed && !viewHoldFired) tapKey('m');
    if (down(BTN.MENU)) tapKey('Escape');

    // R3 drives the playback bar. Holding it clicks fast-forward once per
    // FF_STEP (the button cycles 2x → 5x → 10x); a tap resumes normal speed
    // from pause or fast forward, and pauses from normal speed.
    const pb = id => document.getElementById(id);
    if (down(BTN.R3)) { r3DownAt = performance.now(); r3Steps = 0; }
    if (pressed[BTN.R3] && performance.now() - r3DownAt >= (r3Steps + 1) * FF_STEP) {
      r3Steps++;
      pb('pb-ff')?.click();
    }
    if (up(BTN.R3) && !r3Steps) {
      const paused = pb('pb-pause')?.classList.contains('active');
      const fast   = pb('pb-ff')?.classList.contains('active');
      pb(paused || fast ? 'pb-play' : 'pb-pause')?.click();
    }

    prev = pressed;
  }
  requestAnimationFrame(poll);

  return {
    get active() { return active; },
    get cursorX() { return cx; },
    get cursorY() { return cy; },
    get connected() { return isConnected(); },
    getCursorSensitivity: () => sens.cursor,
    getCameraSensitivity: () => sens.camera,
    setCursorSensitivity: v => setSensitivity('cursor', v),
    setCameraSensitivity: v => setSensitivity('camera', v),
  };
})();
