/* ═══════════════════════════════════════════════════════════════════
   HOTBAR UI
   Unlock flash/toast notifications, category popup, and the build
   hotbar itself (buildHotbar, refreshHotbar, lock icons).
   ═══════════════════════════════════════════════════════════════════ */

const _flashingCats = new Set();  // categories currently flashing

function flashUnlockButton(type) {
  const catMap = {
    [T.BIOFUELGEN]:     'generation',
    [T.SOLAR2]:         'generation',
    [T.SOLAR3]:         'generation',
    [T.WIND]:           'generation',
    [T.WIND2]:          'generation',
    [T.WIND3]:          'generation',
    [T.COALMINE]:       'generation',
    [T.COALMINE2]:      'generation',
    [T.CONVEYOR]:       'generation',
    [T.UNDERGNDCONVEYOR]: 'generation',
    [T.CONVEYORSPLITTER]: 'generation',
    [T.GEOWELL]:       'generation',
    [T.GEOTURBINE]:     'generation',
    [T.COALGENERATOR]:  'generation',
    [T.HYDROGENERATOR]: 'generation',
    [T.DAM]:            'generation',
    [T.HYDROTURBINE]:   'generation',
    [T.SHAFT]:          'generation',
    [T.PUMPJACK]:       'generation',
    [T.PUMPJACK2]:      'generation',
    [T.OILSTORAGE]:     'generation',
    [T.SOLIDSTORAGE]:   'generation',
    [T.REFINERY]:       'generation',
    [T.FUELGEN]:        'generation',
    [T.GOVERNOR]:       'generation',
    [T.CARBONCAPTURE]:  'grid',
    [T.URANIUMMINE]:    'generation',
    [T.SULFURMINE]:     'generation',
    [T.SULFURMINE2]:    'generation',
    [T.LITHIUMMINE]:    'generation',
    [T.LITHIUMPROCESSPLANT]: 'generation',
    [T.CHEMICALPLANT]:  'generation',
    [T.FUELPLANT]:      'generation',
    [T.NUCLEARREACTOR]: 'generation',
    [T.COOLINGTOWER]:   'generation',
    [T.COOLINGTOWER2]:  'generation',
    [T.STEAMTURBINE]:   'generation',
    [T.STEAMTURBINE2]:  'generation',
    [T.ELECTROLYZER]:   'generation',
    [T.ATMOSCOLLECTOR]: 'generation',
    [T.HABERBOSCH]:     'generation',
    [T.WASHTOWER]:      'generation',
    [T.REPROCESSOR]:    'generation',
    [T.MOXPLANT]:       'generation',
    [T.ADVREACTOR]:     'generation',
    [T.DRONEPORT]:      'waste',
    [T.DRONECHARGER]:   'waste',
    [T.SPENTFUELPOOL]:  'generation',
    [T.FUSIONFUELPLANT]: 'generation',
    [T.HULKINGFUSIONREACTOR]: 'generation',
    [T.ADVFUSIONREACTOR]:     'generation',
    [T.MHDRING]:         'generation',
    [T.HELIUMWELL]:      'generation',
    [T.HELIUMWELL2]:     'generation',
    [T.CRYOPLANT]:       'generation',
    [T.HE3SEPARATOR]:    'generation',
    [T.TRITIUMBREEDER]:  'generation',
    [T.GASSTORAGE]:      'generation',
    [T.RAREEARTHMINE]:   'generation',
    [T.LEACHPLANT]:      'generation',
    [T.SCMILL]:          'generation',
    [T.COREWORKS]:       'generation',
    [T.COKEOVEN]:        'generation',
    [T.GRAPHITEFURNACE]: 'generation',
    [T.MK4RESEARCH]:    'stations',
    [T.MK5RESEARCH]:    'stations',
    [T.WIRE]:           'grid',
    [T.SOLAR]:          'generation',
    [T.POLE]:           'grid',
    [T.PROTECTOR]:      'grid',
    [T.PROTECTOR2]:     'grid',
    [T.PROTECTOR3]:     'grid',
    [T.BATTERY]:        'grid',
    [T.CIRCUITSWITCH]:  'grid',
    [T.CIRCUITSWITCH2]: 'grid',
    [T.PIPE]:           'grid',
    [T.UNDERGNDPIPE]:   'grid',
    [T.POWERTOWER]:          'grid',
    [T.LIGHTNINGROD]:   'grid',
    [T.LIGHTNINGROD2]:  'grid',
    [T.LIGHTNINGROD3]:  'grid',
    [T.RESEARCH]:       'stations',
    [T.RESEARCH2]:      'stations',
    [T.RESEARCH3]:      'stations',
    [T.MONITOR]:        'stations',
    [T.MONITOR2]:       'stations',
    [T.ENGOFFICE]:      'stations',
    [T.BEACON]:         'stations',
    [T.SUBSTATION]:     'stations',
    [T.SUBSTATION2]:    'stations',
    [T.SUBSTATION3]:    'stations',
    [T.SUBSTATION4]:    'stations',
    [T.SUBSTATION5]:    'stations',
    [T.TRUCK]:          'waste',
    [T.HAULER]:         'waste',
    [T.ROAD]:           'waste',
    [T.BRIDGE]:         'waste',
    [T.PATHTOOL]:       'waste',
    [T.GASSTATION]:     'waste',
    [T.COALWASTE]:      'waste',
    [T.OILWASTE]:       'waste',
    [T.NUCLEARWASTE]:   'waste',
    [T.SURVEY]:         'stations',
    [T.SURVEY2]:        'stations',
    [T.LAMP]:           'amenities',
    [T.CAMERA]:         'amenities',
    [T.EVCHARGER]:      'amenities',
    [T.FISHINGPOLE]:    'amenities',
  };
  // Blueprints bring the Copy tile into the Function tab: that tile flashes
  // (and its tab with it) the way a newly unlocked tool does.
  if (type === T.BLUEPRINT) {
    _flashingTools.add('copy');
    _syncUnlockFlash();
    return;
  }
  // A tool that sits in a hotbar category flashes itself, and its category
  // (and, while the bar is collapsed, the build button) flashes for as long
  // as it holds an item the player hasn't hovered or clicked yet.
  // (Only once it's actually unlocked — a locked tool has no tile to hover,
  // so its category would never stop flashing.)
  if (HOTBAR_CATEGORIES.some(c => c.tools.includes(type))
      && (typeof Progression === 'undefined' || Progression.isUnlocked(type))) {
    _flashingTools.add(type);
    _syncUnlockFlash();
    return;
  }
  // Anything else only flashes its category, until that category is opened.
  const catId = catMap[type];
  if (!catId) return;
  _flashingCats.add(catId);
  _syncUnlockFlash();
}

// Newly unlocked tools, flashing until the player hovers or clicks them.
const _flashingTools = new Set();

// Whether a category's tab flashes: a category-only flash, or an unseen new
// tool inside it — the Copy tile counting for the Function tab, which it
// sits in without being one of its listed tools.
function _catFlashing(cat) {
  return _flashingCats.has(cat.id) || cat.tools.some(t => _flashingTools.has(t))
      || (cat.id === 'delete' && _flashingTools.has('copy'));
}

function _syncUnlockFlash() {
  for (const cat of HOTBAR_CATEGORIES) {
    const btn = document.querySelector(`.cat-btn[data-cat="${cat.id}"]`);
    if (btn) btn.classList.toggle('unlock-flash', _catFlashing(cat));
  }
  document.querySelectorAll('.tool-item[data-tool]').forEach(it =>
    it.classList.toggle('unlock-flash', _flashingTools.has(it.dataset.tool)));
}

// The player has seen a newly unlocked tool — stop flashing it.
function _seenUnlockedTool(type) {
  if (_flashingTools.delete(type)) _syncUnlockFlash();
}

function showUnlockToast(label) {
  showToast(`⚡ UNLOCKED: ${label}`, '#40ff80', '#0a1a10', '#40ff80');
}

// General-purpose toast — neutral blue, no prefix
// Toast queue — only one toast visible at a time
const _toastQueue = [];
let   _toastActive = false;
let   _toastActiveMsg = null;  // message currently displayed
let   _toastActiveTag = null;  // tag of the toast currently displayed (if any)
let   _toastActiveEl = null;   // DOM element currently displayed
let   _toastActiveTimer = null; // pending dismiss timeout for the active toast

// ── Toast look ─────────────────────────────────────────────────────
// A glass card in the dashboard theme. The caller's `color` is the accent:
// left stripe, icon chip, a tint across the card and the countdown bar, so
// red/amber/green still read at a glance. A leading emoji/symbol in the
// message is lifted out into the icon chip.
(() => {
  const st = document.createElement('style');
  st.textContent = `
    .gw-toast {
      position: fixed; top: 70px; left: 0; right: 0; margin: 0 auto;
      width: max-content; max-width: min(560px, calc(100vw - 32px));
      box-sizing: border-box; display: flex; align-items: center; gap: 11px;
      padding: 9px 18px 10px 12px; overflow: hidden;
      pointer-events: none; z-index: 1400;
      border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--tc) 34%, rgba(150,180,215,0.10));
      background:
        linear-gradient(100deg, color-mix(in srgb, var(--tc) 17%, transparent) 0%, transparent 62%),
        rgba(12, 17, 26, 0.93);
      backdrop-filter: blur(14px) saturate(140%);
      box-shadow: 0 14px 36px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35),
                  0 0 26px color-mix(in srgb, var(--tc) 16%, transparent),
                  inset 0 1px 0 rgba(255,255,255,0.05);
      color: color-mix(in srgb, var(--tc) 28%, #eef3f9);
      font-family: 'Inter', system-ui, sans-serif; font-size: 12.5px;
      font-weight: 500; letter-spacing: 0.01em; line-height: 1.35;
      animation: gwToastIn .38s cubic-bezier(.2,.9,.3,1.25) both,
                 gwToastOut .55s ease-in 5.45s forwards;
    }
    .gw-toast::before {
      content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
      background: var(--tc); box-shadow: 0 0 10px var(--tc);
    }
    .gw-toast-icon {
      flex: none; display: grid; place-items: center;
      width: 26px; height: 26px; border-radius: 50%;
      font-size: 14px; line-height: 1; color: var(--tc);
      background: color-mix(in srgb, var(--tc) 16%, transparent);
      border: 1px solid color-mix(in srgb, var(--tc) 38%, transparent);
    }
    .gw-toast-icon.dot::after {
      content: ''; width: 7px; height: 7px; border-radius: 50%;
      background: var(--tc); box-shadow: 0 0 8px var(--tc);
    }
    .gw-toast-msg { min-width: 0; text-wrap: pretty; }
    .gw-toast-bar {
      position: absolute; left: 3px; right: 0; bottom: 0; height: 2px;
      background: linear-gradient(90deg, var(--tc), color-mix(in srgb, var(--tc) 40%, transparent));
      opacity: 0.75; transform-origin: left;
      animation: gwToastBar 6s linear forwards;
    }
    .gw-toast.clickable { pointer-events: auto; cursor: pointer; }
    .gw-toast.clickable:hover { filter: brightness(1.18); }
    .gw-toast.pinned { animation: none; opacity: 1; }
    .gw-toast.pinned .gw-toast-bar { animation: none; opacity: 0; }
    .gw-toast.leaving { animation: gwToastOut .6s ease-in forwards; }
    .gw-toast.bump {
      animation: gwToastBump .3s ease-out both, gwToastOut .55s ease-in 5.45s forwards;
    }
    @keyframes gwToastIn   { from { opacity: 0; transform: translateY(-14px) scale(.96); } to { opacity: 1; transform: none; } }
    @keyframes gwToastOut  { to   { opacity: 0; transform: translateY(-10px); } }
    @keyframes gwToastBump { 0% { transform: scale(1); } 40% { transform: scale(1.035); } 100% { transform: scale(1); } }
    @keyframes gwToastBar  { from { transform: scaleX(1); } to { transform: scaleX(0); } }
    @media (prefers-reduced-motion: reduce) {
      .gw-toast, .gw-toast.bump { animation: gwToastOut .55s linear 5.45s forwards; }
    }
  `;
  document.head.appendChild(st);
})();

// Leading emoji / symbol (with any variation selector or ZWJ sequence).
const _TOAST_ICON_RE = /^((?:\p{Extended_Pictographic}|[✕✓✔✗✘↷↶↺↻★☆●◆▲▼⛔⏸⏩])(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*/u;

// Restart a reused toast's bump + fade-out. Toggling the class isn't
// enough: the browser keeps an animation running as long as its name stays
// in the list, so gwToastOut carried on from the first showing and a toast
// refreshed after ~5s came back invisible (and, its timer reset by every
// chop, stayed invisible). Dropping all animations for one style pass
// starts them over.
function _restartToastAnim(el) {
  el.classList.remove('bump', 'pinned', 'leaving');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  el.classList.add('bump');
}

// A toast with somewhere to go takes clicks; the rest stay click-through.
function _setToastClick(el, onClick) {
  el._gwClick = onClick || null;
  el.classList.toggle('clickable', !!onClick);
  el.title = onClick ? 'Click to jump there' : '';
}

function _fillToast(el, msg, color) {
  const m = msg.match(_TOAST_ICON_RE);
  const icon = m ? m[1] : '';
  const text = m ? msg.slice(m[0].length) : msg;
  el.style.setProperty('--tc', color);
  el.replaceChildren();
  const ic = document.createElement('span');
  ic.className = 'gw-toast-icon' + (icon ? '' : ' dot');
  ic.textContent = icon;
  const tx = document.createElement('span');
  tx.className = 'gw-toast-msg';
  tx.textContent = text;
  const bar = document.createElement('i');
  bar.className = 'gw-toast-bar';
  el.append(ic, tx, bar);
}

function _showNextToast() {
  // A toast queued BEFORE the blast (an unlock that landed during the
  // countdown, say) would otherwise surface in the middle of the ending —
  // showToast only guards new ones.
  if (typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.hasEnded()) { _toastQueue.length = 0; return; }
  if (_toastActive || _toastQueue.length === 0) return;
  _toastActive = true;
  const { msg, color, bg, border, tag, hold, onClick } = _toastQueue.shift();
  _toastActiveMsg = msg;
  _toastActiveTag = tag;
  const el = document.createElement('div');
  el.className = 'gw-toast';
  el.setAttribute('role', 'status');
  _fillToast(el, msg, color);
  _setToastClick(el, onClick);
  // A click jumps there (as the message log does) and closes the toast.
  el.addEventListener('click', () => {
    if (!el._gwClick || _toastActiveEl !== el) return;
    Camera.cut(el._gwClick);
    SFX.click?.();
    clearTimeout(_toastActiveTimer);
    el.remove();
    _toastActive = false;
    _toastActiveMsg = null;
    _toastActiveTag = null;
    _toastActiveEl = null;
    _toastActiveTimer = null;
    _showNextToast();
  });
  // Sit just under the top bar, which wraps taller on narrow windows.
  const _tb = document.getElementById('topbar')?.getBoundingClientRect();
  if (_tb && _tb.height) el.style.top = Math.max(70, Math.round(_tb.bottom + 10)) + 'px';
  document.body.appendChild(el);
  _toastActiveEl = el;

  // A `hold` predicate pins the toast open past its normal 6s lifetime —
  // used when a tutorial card is explaining the very thing the toast says
  // (fishing rewards), so the player can read both together. Once the
  // predicate goes false the toast fades out normally.
  let _pinned = false;
  function _dismiss() {
    if (hold && hold()) {
      if (!_pinned) { _pinned = true; el.classList.remove('bump'); el.classList.add('pinned'); }
      _toastActiveTimer = setTimeout(_dismiss, 400);
      return;
    }
    if (_pinned) {
      _pinned = false;
      el.classList.remove('pinned');
      el.classList.add('leaving');
      _toastActiveTimer = setTimeout(_dismiss, 1000);
      return;
    }
    el.remove();
    _toastActive = false;
    _toastActiveMsg = null;
    _toastActiveTag = null;
    _toastActiveEl = null;
    _toastActiveTimer = null;
    _showNextToast();
  }
  _toastActiveTimer = setTimeout(_dismiss, 6000);
}

// Drop everything: the queue and whatever is on screen. Used when the
// Advanced Reactor apocalypse starts.
function clearToasts() {
  _toastQueue.length = 0;
  if (_toastActiveTimer) clearTimeout(_toastActiveTimer);
  _toastActiveEl?.remove();
  _toastActive = false; _toastActiveMsg = null; _toastActiveTag = null;
  _toastActiveEl = null; _toastActiveTimer = null;
  for (const lane of _laneToasts.values()) { clearTimeout(lane.timer); lane.el.remove(); }
  _laneToasts.clear();
}

// Tags whose every call is a separate event worth showing, not a repeated
// report of the same state. Two trees in a row can both yield 5 biofuel, and
// the second must still refresh the toast rather than be dropped as a
// duplicate of the first.
const _TOAST_REPEAT_TAGS = new Set(['biofuel-collect']);

// Repeat-tagged toasts get their own lane beside the main queue. The main
// queue shows one toast at a time for 6s each, so behind a busy run of other
// news a "+N biofuel" toast would wait (or get overwritten while waiting) and
// never show up when the tree actually falls.
const _laneToasts = new Map();   // tag -> { el, timer }
function _showLaneToast(msg, color, tag, onClick) {
  MessageLog.add(msg, color, onClick);
  SFX.popup();
  let lane = _laneToasts.get(tag);
  if (!lane) {
    const el = document.createElement('div');
    el.className = 'gw-toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
    lane = { el, timer: null };
    _laneToasts.set(tag, lane);
  }
  const el = lane.el;
  _fillToast(el, msg, color);
  // Sit under the main toast when one is up, else where it would be.
  const _tb = document.getElementById('topbar')?.getBoundingClientRect();
  let top = (_tb && _tb.height) ? Math.max(70, Math.round(_tb.bottom + 10)) : 70;
  const _main = _toastActiveEl?.getBoundingClientRect();
  if (_main && _main.height) top = Math.round(_main.bottom + 8);
  el.style.top = top + 'px';
  _restartToastAnim(el);
  clearTimeout(lane.timer);
  lane.timer = setTimeout(() => { el.remove(); _laneToasts.delete(tag); }, 6000);
}

function showToast(msg, color = '#60b0ff', bg = '#090e18', border = '#1e4060', tag = null, onClick = null, hold = null) {
  // Once the map is exploding, every system on it has something to complain
  // about — outages, unpaid upkeep, lost customers. None of it is news any
  // more, and a stack of toasts over the ending is comedy, not drama.
  if (typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.hasEnded()) return;
  // Home news raised while the player is on a job site reads "HOME: …".
  if (typeof NotificationStack !== 'undefined' && NotificationStack.homeLabel) msg = NotificationStack.homeLabel(msg, _TOAST_ICON_RE);
  if (tag && _TOAST_REPEAT_TAGS.has(tag)) { _showLaneToast(msg, color, tag, onClick); return; }
  // Tagged toasts replace whichever toast (of the same tag) is currently
  // showing instead of queueing behind it — e.g. rapid tree/bush chopping
  // keeps swapping one "+N biofuel" toast in place rather than stacking.
  if (tag && _toastActive && _toastActiveTag === tag) {
    if (_toastActiveMsg === msg) return;
    clearTimeout(_toastActiveTimer);
    _toastActiveMsg = msg;
    MessageLog.add(msg, color, onClick);
    const el = _toastActiveEl;
    _fillToast(el, msg, color);   // fresh countdown bar
    _setToastClick(el, onClick);
    _restartToastAnim(el);
    _toastActiveTimer = setTimeout(() => {
      el.remove();
      _toastActive = false;
      _toastActiveMsg = null;
      _toastActiveTag = null;
      _toastActiveEl = null;
      _toastActiveTimer = null;
      _showNextToast();
    }, 6000);
    SFX.popup();
    return;
  }

  // Dedup: drop if this exact message (or tag) is already showing or queued
  if (_toastActiveMsg === msg) return;
  if (tag && (_toastActiveMsg === tag || _toastQueue.some(t => (t.tag || t.msg) === tag))) return;
  if (_toastQueue.some(t => t.msg === msg)) return;

  MessageLog.add(msg, color, onClick);
  _toastQueue.push({ msg, color, bg, border, tag, hold, onClick });
  SFX.popup();
  _showNextToast();
}

/* ═══════════════════════════════════════════════════════════════════
   UI — Hotbar builder + refresher
   All tool slots are always rendered; locked ones show greyed out
   with a padlock and hint. refreshHotbar() is called by Progression
   whenever a new unlock fires.
   ═══════════════════════════════════════════════════════════════════ */
const HOTBAR_CATEGORIES = [
  {
    id:    'generation',
    label: 'Generation',
    icon:  '⚡',
    iconColor: '#ffe040',
    tools: [T.BIOFUELGEN, T.SOLAR, T.SOLAR2, T.SOLAR3, T.WIND, T.WIND2, T.WIND3, T.GEOWELL, T.GEOTURBINE, T.COALMINE, T.COALMINE2, T.COALGENERATOR, T.COKEOVEN, T.GRAPHITEFURNACE, T.SOLIDSTORAGE, T.WATEREXTRACTOR, T.PUMPJACK, T.PUMPJACK2, T.OILSTORAGE, T.REFINERY, T.FUELGEN, T.GOVERNOR, T.HYDROGENERATOR, T.DAM, T.HYDROTURBINE, T.SHAFT, T.URANIUMMINE, T.SULFURMINE, T.SULFURMINE2, T.LITHIUMMINE, T.CHEMICALPLANT, T.FUELPLANT, T.NUCLEARREACTOR, T.COOLINGTOWER, T.STEAMTURBINE, T.STEAMTURBINE2, T.SPENTFUELPOOL, T.REPROCESSOR, T.MOXPLANT, T.ADVREACTOR, T.COOLINGTOWER2, T.ELECTROLYZER, T.GASSTORAGE, T.LITHIUMPROCESSPLANT, T.ATMOSCOLLECTOR, T.HABERBOSCH, T.WASHTOWER, T.TRITIUMBREEDER, T.FUSIONFUELPLANT, T.HELIUMWELL, T.HELIUMWELL2, T.CRYOPLANT, T.HULKINGFUSIONREACTOR, T.HE3SEPARATOR, T.ADVFUSIONREACTOR, T.MHDRING, T.RAREEARTHMINE, T.LEACHPLANT, T.SCMILL, T.COREWORKS],
  },
  {
    id:    'grid',
    label: 'Grid',
    tools: [T.WIRE, T.POLE, T.POWERTOWER, T.PROTECTOR, T.PROTECTOR2, T.PROTECTOR3, T.LIGHTNINGROD, T.LIGHTNINGROD2, T.LIGHTNINGROD3, T.BATTERY, T.CARBONCAPTURE, T.CIRCUITSWITCH, T.CIRCUITSWITCH2, T.CONVEYOR, T.UNDERGNDCONVEYOR, T.CONVEYORSPLITTER, T.PIPE, T.UNDERGNDPIPE]
      .filter(t => !(CONVEYOR_SPLITTER_ARCHIVED && t === T.CONVEYORSPLITTER)),
  },
  {
    id:    'stations',
    label: 'Stations',
    tools: [T.RESEARCH, T.RESEARCH2, T.RESEARCH3, T.MK4RESEARCH, T.MK5RESEARCH, T.MONITOR, T.MONITOR2, T.ENGOFFICE, T.BEACON, T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5, T.SURVEY, T.SURVEY2],
  },
  {
    id:    'amenities',
    label: 'Amenities',
    tools: [T.LAMP, T.CAMERA, T.EVCHARGER, T.CELLTOWER, T.FIBERHUB, T.FISHINGPOLE],
  },
  {
    // Everything that drives or flies, and what it needs: the trucks, the
    // Drone Port, the roads and routes they run on, the stations that keep
    // them fuelled, and the three waste facilities the trucks deliver to.
    // (The id is still 'waste', from when this was the Waste Mgmt tab.)
    id:    'waste',
    label: 'Logistics',
    icon:  '🚛',
    tools: [T.TRUCK, T.HAULER, T.DRONEPORT, T.DRONECHARGER, T.ROAD, T.BRIDGE, T.PATHTOOL, T.GASSTATION, T.COALWASTE, T.OILWASTE, T.NUCLEARWASTE],
  },
  {
    // Select, Delete, Zone Delete, Copy, Undo and Redo: the tools that change
    // what is already built. The id stays 'delete' (styling, popup handling).
    id:    'delete',
    label: 'Function',
    cls:   'delete-cat',
    face:  'select', // the tab's own icon while none of its tools is selected
    tools: ['select', 'delete', 'zone-delete'],
  },
];

// Floating tool tooltip. One body-level label, filled from the hovered
// item's hidden .tool-tip-label and placed above it, clamped to the
// viewport. It lives outside the popup so the scrolling icon grid can
// neither clip it nor grow a sideways scrollbar to fit it.
let _toolTipEl = null;
function showToolTip(item, src) {
  if (!_toolTipEl) {
    _toolTipEl = document.createElement('div');
    _toolTipEl.id = 'tool-tip-float';
    document.body.appendChild(_toolTipEl);
  }
  const el = _toolTipEl;
  el.innerHTML = src.innerHTML;
  el.style.display = 'block';
  el.style.left = '0px'; el.style.top = '0px';
  const r = item.getBoundingClientRect(), tw = el.offsetWidth, th = el.offsetHeight;
  const x = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
  let y = r.top - th - 6;
  if (y < 8) y = r.bottom + 6;             // no room above: drop below the icon
  el.style.left = `${x}px`; el.style.top = `${y}px`;
}
function hideToolTip() { _tipItem = null; if (_toolTipEl) _toolTipEl.style.display = 'none'; }

// Which tile the tooltip belongs to is worked out from the pointer, not
// from mouseenter/mouseleave on each tile. Those miss too much: a
// controller's synthetic enter lands on whatever child is under the cursor
// (the icon, the price) and never reaches the tile; stepping to a tile
// scrolls the grid, which used to hide the label it had just shown; and a
// rebuilt or filtered menu puts a new tile under a pointer that never moved.
// So: every mouseover (real or synthetic — it bubbles) names the tile it is
// inside, and anything that moves tiles about re-reads the pointer position.
let _tipItem = null, _tipX = -1, _tipY = -1;
function _toolTipSync(item) {
  const src = item && item.isConnected && item.getClientRects().length ? item.querySelector('.tool-tip-label') : null;
  if (!src) { hideToolTip(); return; }
  if (item !== _tipItem) { _tipItem = item; _seenUnlockedTool(item.dataset.tool); }
  showToolTip(item, src);
}
function _toolTipAtPointer() {
  const el = _tipX < 0 ? null : document.elementFromPoint(_tipX, _tipY);
  _toolTipSync(el && el.closest ? el.closest('.tool-item') : null);
}
document.addEventListener('mouseover', ev => {
  _tipX = ev.clientX; _tipY = ev.clientY;
  _toolTipSync(ev.target && ev.target.closest ? ev.target.closest('.tool-item') : null);
}, true);
document.addEventListener('mousemove', ev => { _tipX = ev.clientX; _tipY = ev.clientY; }, true);

// Track which category popup is currently open
let openCategoryId = null;


// Power line(s) for a tool's hover tooltip: what it supplies to the grid
// (green) and what it draws from it (amber). Read from the base EntityDefs,
// with wording for the types whose output isn't a single fixed figure.
function _toolPowerLines(type, def) {
  if (!def) return [];
  const W = v => formatPower(Math.round(v * 10) / 10);
  const lines = [];
  const supply = t => lines.push({ text: t, cls: 'supply' });
  const draw   = t => lines.push({ text: t, cls: 'draw' });
  if (type === T.BIOFUELGEN)                                  supply('+3 kW');   // system-driven; def.powerOutput flips live
  else if (def.peakOutput > 0)                                supply(`+up to ${W(def.peakOutput)} · sunlight`);
  else if (def.baseOutput > 0 && def.maxOutput > 0)           supply(`+${def.baseOutput}–${W(def.maxOutput)} · wind`);
  else if (def.capacity > 0 && def.maxOutput > 0)             supply(`Stores ${formatWh(def.ratedKWh ?? def.capacity)} · up to ${W(def.maxOutput)} out`);
  else if (def.surgeOutput > 0)                               supply(`+up to ${W(def.surgeOutput)} after a strike`);
  else if (type === T.NUCLEARREACTOR)                         supply(`Steam for turbines (${def.steamOutput || 300}/s)`);
  else if (type === T.REPROCESSOR)                            supply('Plutonium + recovered uranium');
  else if (type === T.MOXPLANT)                               supply('MOX fuel rods');
  else if (type === T.ADVREACTOR)                             supply('Steam: needs Cryogenic Coolant from a Cryogenic Cooling Tower');
  else if (type === T.COOLINGTOWER2)                          supply(`Cryogenic Coolant ${EntityDefs[T.COOLINGTOWER2].coldOutput} u/s; one Advanced Reactor`);
  else if (type === T.SPENTFUELPOOL)                          supply(`Buffers ${EntityDefs[T.SPENTFUELPOOL].spentFuelCapacity} spent fuel`);
  else if (type === T.GEOWELL)                                supply('Steam for 1 Geothermal Turbine');
  else if (type === T.STEAMTURBINE || type === T.STEAMTURBINE2) supply(`+${W(def.powerOutput)} · needs ${def.steamDraw} reactor steam`);
  else if (type === T.FUSIONFUELPLANT)                        supply('D-T pellets; 1 D-He3 per 3 D-T once helium-3 opens');
  else if (type === T.HULKINGFUSIONREACTOR)                   supply(`D-T: steam for turbines (${def.steamOutput}/s) · needs a Cryo Plant`);
  else if (type === T.ADVFUSIONREACTOR)                       supply(`D-He3: ion stream for ${Math.floor(def.highBetaPerSec / (EntityDefs[T.MHDRING].highBetaDraw || 1000))} MHD Rings · heavy cooling`);
  else if (type === T.HELIUMWELL || type === T.HELIUMWELL2)  supply(`Helium ${def.heliumPerSec}/s${type === T.HELIUMWELL2 ? ' · build over a Helium Well to replace it' : ''}`);
  else if (type === T.HYDROGENERATOR)                         supply(`+up to ${W(def.powerOutput)} · shaft driven`);
  else if (def.powerOutput > 0)                               supply(`+${W(def.powerOutput)}`);
  if (def.powerInput > 0) draw(`−${W(def.powerInput)} draw`);
  if (!lines.length && def.cost > 0) lines.push({ text: 'No power', cls: 'none' });
  return lines;
}

function buildHotbar() {
  const hotbar = document.getElementById('hotbar');
  hotbar.innerHTML = '';
  openCategoryId = null;

  HOTBAR_CATEGORIES.forEach(cat => {
    const wrap = document.createElement('div');
    wrap.className   = `cat-btn ${cat.cls || ''}`;
    wrap.dataset.cat = cat.id;

    // ── Category face button ─────────────────────
    const face = document.createElement('div');
    face.className = 'cat-face';

    // Icon canvas — shows active tool icon or first unlocked icon
    const iconC = document.createElement('canvas');
    iconC.width = 38; iconC.height = 38;
    const activeTool  = cat.tools.find(t => t === InputManager.state.selectedTool);
    const displayTool = activeTool || cat.face || cat.tools.find(t => Progression.isUnlocked(t)) || cat.tools[0];
    if (cat.id === 'generation' && !activeTool) {
      // Yellow lightning bolt for generation category
      const _ic = iconC.getContext('2d');
      _ic.clearRect(0,0,38,38);
      _ic.fillStyle = '#ffe040';
      _ic.beginPath();
      _ic.moveTo(22, 4);
      _ic.lineTo(12, 20);
      _ic.lineTo(19, 20);
      _ic.lineTo(15, 34);
      _ic.lineTo(27, 16);
      _ic.lineTo(20, 16);
      _ic.closePath();
      _ic.fill();
    } else {
      RenderSystem.drawIconInto(iconC.getContext('2d'), displayTool, 38);
    }
    face.appendChild(iconC);

    // Active dot
    const dot = document.createElement('span');
    dot.className = 'cat-active-dot';
    face.appendChild(dot);

    wrap.appendChild(face);

    // Label
    const lbl = document.createElement('span');
    lbl.className   = 'cat-label';
    lbl.textContent = cat.label;
    wrap.appendChild(lbl);

    // ── Popup ────────────────────────────────────
    const popup = document.createElement('div');
    popup.className = 'cat-popup';

    const header = document.createElement('div');
    header.className   = 'cat-popup-header';
    header.textContent = cat.label;
    popup.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'cat-popup-grid';
    // Scroll the list, not the map: the camera zooms on any wheel event
    // that reaches the canvas listeners.
    grid.addEventListener('wheel', ev => ev.stopPropagation(), { passive: true });
    grid.addEventListener('scroll', _toolTipAtPointer, { passive: true });
    popup.appendChild(grid);

    cat.tools.forEach(type => {
      // Only show unlocked tools
      if (!_FN_TOOLS.has(type) && !Progression.isUnlocked(type)) return;
      grid.appendChild(_makeToolItem(type));
    });
    // Copy, Undo and Redo sit with the delete tools: same as Ctrl+C,
    // Ctrl+Z and Ctrl+Y. Copy only once Blueprints are researched (the
    // hotbar is rebuilt on every unlock, so it appears then).
    if (cat.id === 'delete') {
      if (BlueprintSystem.isUnlocked()) grid.appendChild(_makeCopyItem());
      grid.appendChild(_makeHistoryItem('undo'));
      grid.appendChild(_makeHistoryItem('redo'));
    }

    // Search field in the header (not on the short Function popup).
    if (cat.id !== 'delete') _addToolSearch(cat, header, grid);

    wrap.appendChild(popup);

    // Hide entire category if nothing unlocked in it
    const hasAny = cat.tools.some(t => t === 'delete' || Progression.isUnlocked(t));
    if (!hasAny) { wrap.style.display = 'none'; }
    // Re-apply flash: a category-only flash, or an unseen new tool inside it
    if (_catFlashing(cat)) {
      wrap.classList.add('unlock-flash');
    }

    // ── Toggle popup on category click ───────────
    // Opening it clears a category-only flash; one with unseen new tools
    // keeps flashing until each of those is hovered or clicked.
    face.addEventListener('click', e => {
      e.stopPropagation();
      SFX.click();
      _flashingCats.delete(cat.id);
      _syncUnlockFlash();
      // Function category
      if (cat.id === 'delete') {
        const isOpen = wrap.classList.contains('open');
        closeCategoryPopup();
        if (!isOpen) openCategoryPopup('delete');
        return;
      }
      const isOpen = wrap.classList.contains('open');
      closeCategoryPopup();
      if (!isOpen) openCategoryPopup(cat.id);
    });

    hotbar.appendChild(wrap);
  });
  _afterHotbarBuilt(hotbar);
}

// The Function tab's own tools: always available, no build cost.
const _FN_TOOLS = new Set(['select', 'delete', 'zone-delete']);

// The display name a build tool goes by in the popups.
function _toolLabel(type) {
  const def = !_FN_TOOLS.has(type) ? EntityDefs[type] : null;
  return def ? def.label : type === 'zone-delete' ? 'Zone Delete' : type === 'select' ? 'Select (or Shift + drag)'
       : type === T.PATHTOOL ? 'Path Tool' : 'Delete';
}

// One clickable tool tile: icon, compact cost, hover tooltip.
function _makeToolItem(type) {
  const isActive = type === 'select' ? InputManager.selectArmed : InputManager.state.selectedTool === type;
  const def      = !_FN_TOOLS.has(type) ? EntityDefs[type] : null;

  const item = document.createElement('div');
  item.className = [
    'tool-item',
    isActive  ? 'tool-active'  : '',
    (type === 'delete' || type === 'zone-delete') ? 'tool-delete' : '',
  ].filter(Boolean).join(' ');

  // Hover tooltip label — the name, plus a line of power supply/draw
  const tipLabel = document.createElement('span');
  tipLabel.className   = 'tool-tip-label';
  tipLabel.textContent = _toolLabel(type);
  for (const ln of _toolPowerLines(type, def)) {
    const pl = document.createElement('span');
    pl.className   = `tool-tip-power ${ln.cls}`;
    pl.textContent = ln.text;
    tipLabel.appendChild(pl);
  }
  item.appendChild(tipLabel);
  item.dataset.tool = type;
  if (_flashingTools.has(type)) item.classList.add('unlock-flash');

  const ic = document.createElement('canvas');
  ic.width = 38; ic.height = 38;
  RenderSystem.drawIconInto(ic.getContext('2d'), type, 38);
  item.appendChild(ic);

  // Compact cost shown below icon
  if (def) {
    const costEl = document.createElement('span');
    costEl.className   = 'tool-grid-cost';
    const _now = typeof buildCost === 'function' ? buildCost(type) : def.cost;
    costEl.textContent = _now === 0 && def.cost > 0 ? 'FREE' : `$${_now.toLocaleString()}`;
    if (_now < def.cost) costEl.classList.add('deal');
    item.appendChild(costEl);
  }

  // Hidden tool-info kept for any external references
  const info = document.createElement('div');
  info.className = 'tool-info';
  const name = document.createElement('span');
  name.className   = 'tool-name';
  name.textContent = _toolLabel(type);
  info.appendChild(name);
  if (def) {
    const cost = document.createElement('span');
    cost.className   = 'tool-cost';
    const _now2 = typeof buildCost === 'function' ? buildCost(type) : def.cost;
    cost.textContent = _now2 === 0 && def.cost > 0 ? 'FREE' : `$${_now2.toLocaleString()}`;
    info.appendChild(cost);
  }
  item.appendChild(info);

  // The player's hotkey for it, if they have given it one (ToolHotkeys).
  item.dataset.hotkeyable = '1';
  const hk = document.createElement('span');
  hk.className = 'tool-hotkey';
  item.appendChild(hk);
  ToolHotkeys.badge(item);

  item.addEventListener('click', e => {
    e.stopPropagation();
    SFX.click();
    _activateTool(type);
  });

  return item;
}

// Pick up a tool, as clicking its tile does: a second pick of the tool in
// hand puts it down again.
function _activateTool(type) {
  _seenUnlockedTool(type);
  if (type === 'select') {
    InputManager.armSelect();
  } else if (type === 'zone-delete') {
    InputManager.setZoneDelete(true);
    InputManager.selectTool('delete');
  } else {
    InputManager.setZoneDelete(false);
    InputManager.selectTool(type === InputManager.state.selectedTool ? null : type);
  }
  closeCategoryPopup();
}

// ── Item hotkeys (1-0) ────────────────────────────────────────────
// The player binds any build item to a number key by hovering its tile in a
// build popup and pressing the number; the tile then carries the number in
// its corner. Pressing the number anywhere else picks the item up (or puts
// it down, like a second click). A key holds one item and an item one key:
// binding a key moves it off whatever had it, and pressing an item's own key
// over it again clears it. Kept in localStorage, so the bindings are the
// player's and carry from one city to the next.
const ToolHotkeys = (() => {
  const STORE = 'gw.toolHotkeys';
  let keys = {};   // '1'..'0' -> tool type
  try { keys = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { keys = {}; }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(keys)); } catch {} };
  const same = (a, b) => String(a) === String(b);
  const keyOf = type => Object.keys(keys).find(k => same(keys[k], type)) || null;

  function badge(item) {
    const el = item.querySelector('.tool-hotkey');
    if (!el) return;
    const k = keyOf(item.dataset.tool);
    el.textContent = k || '';
    item.classList.toggle('has-hotkey', !!k);
  }
  const badgeAll = () => document.querySelectorAll('.tool-item[data-hotkeyable]').forEach(badge);

  // The tile the pointer is over in an open build popup, if any.
  const hovered = () => document.querySelector('.cat-btn.open .tool-item[data-hotkeyable]:hover');

  function assign(k, item) {
    const type = item.dataset.tool;
    if (same(keys[k], type)) delete keys[k];                       // its own key again: clear it
    else {
      const had = keyOf(type);
      if (had) delete keys[had];
      keys[k] = type;
    }
    save();
    badgeAll();
    SFX.click();
    item.classList.remove('hotkey-set'); void item.offsetWidth; item.classList.add('hotkey-set');
  }

  function use(k) {
    const type = keys[k];
    if (type === undefined) return;
    if (!_FN_TOOLS.has(type) && !Progression.isUnlocked(type)) return;
    SFX.click();
    _activateTool(type);
  }

  return {
    badge, badgeAll,
    keyOf,
    // A number key pressed in play (input_manager.js).
    onKey(k) { const item = hovered(); if (item) assign(k, item); else use(k); },
  };
})();

// An Undo / Redo tile for the Function popup. An action, not a tool: clicking
// it leaves the selected tool alone and keeps the popup open, so several
// steps can be walked back with repeated clicks.
function _makeHistoryItem(kind) {
  const item = document.createElement('div');
  item.className = 'tool-item';
  item.dataset.tool = kind;

  const tipLabel = document.createElement('span');
  tipLabel.className   = 'tool-tip-label';
  tipLabel.textContent = kind === 'undo' ? 'Undo (Ctrl+Z)' : 'Redo (Ctrl+Y)';
  item.appendChild(tipLabel);

  const ic = document.createElement('canvas');
  ic.width = 38; ic.height = 38;
  RenderSystem.drawIconInto(ic.getContext('2d'), kind, 38);
  item.appendChild(ic);

  item.addEventListener('click', e => {
    e.stopPropagation();
    SFX.click();
    if (kind === 'undo') HistoryManager.undo(); else HistoryManager.redo();
  });
  return item;
}

// The Copy tile in the Function popup: exactly what Ctrl+C does (input_manager.js)
// — start a drag-select whose selection is then placed as copies, each at
// full price. Part of the Blueprints unlock, like the key.
function _makeCopyItem() {
  const item = document.createElement('div');
  item.className = 'tool-item';
  item.dataset.tool = 'copy';

  const tipLabel = document.createElement('span');
  tipLabel.className   = 'tool-tip-label';
  tipLabel.textContent = 'Copy (Ctrl+C)';
  item.appendChild(tipLabel);

  const ic = document.createElement('canvas');
  ic.width = 38; ic.height = 38;
  RenderSystem.drawIconInto(ic.getContext('2d'), 'copy', 38);
  item.appendChild(ic);
  if (_flashingTools.has('copy')) item.classList.add('unlock-flash');

  item.addEventListener('click', e => {
    e.stopPropagation();
    SFX.click();
    _seenUnlockedTool('copy');
    if (!BlueprintSystem.isUnlocked()) {
      showToast('Copy unlocks with Blueprints', '#ff8040', '#180c00', '#603010');
      return;
    }
    closeCategoryPopup();
    BlueprintSystem.beginCopySelect();
  });
  return item;
}

// ── Item search ───────────────────────────────────────────────────
// A pill field in each category popup's header. It filters the popup's own
// tiles and lists matches from the other categories underneath, so an item
// can be found without knowing which category it lives in. '/' focuses it;
// closing the popup clears it.
function _toolMatches(type, words) {
  const name = _toolLabel(type).toLowerCase();
  return words.every(w => name.includes(w));
}

function _addToolSearch(cat, header, grid) {
  header.textContent = '';
  header.classList.add('has-search');
  const title = document.createElement('span');
  title.textContent = cat.label;
  header.appendChild(title);

  const box = document.createElement('label');
  box.className = 'tool-search';
  box.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg>';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search items';
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Search all items');
  const key = document.createElement('kbd');
  key.className = 'tool-search-key';
  key.textContent = '/';
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'tool-search-clear';
  clear.title = 'Clear search';
  clear.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>';
  box.append(input, key, clear);
  header.appendChild(box);

  const own = [...grid.children];   // this category's tiles
  const ownTypes = new Set(own.map(el => el.dataset.tool));
  let extras = [];                  // section labels + tiles from other categories

  const apply = () => {
    const raw = input.value.trim();
    const words = raw.toLowerCase().split(/\s+/).filter(Boolean);
    box.classList.toggle('has-text', input.value.length > 0);
    extras.forEach(n => n.remove());
    extras = [];
    hideToolTip();
    requestAnimationFrame(_toolTipAtPointer);   // the tiles under the pointer have changed
    let hits = 0;
    for (const el of own) {
      const ok = !words.length || _toolMatches(el.dataset.tool, words);
      el.style.display = ok ? '' : 'none';
      if (ok) hits++;
    }
    if (words.length) {
      const add = n => { grid.appendChild(n); extras.push(n); };
      const seen = new Set(ownTypes);
      for (const other of HOTBAR_CATEGORIES) {
        if (other.id === cat.id || other.id === 'delete') continue;
        const found = other.tools.filter(t => !seen.has(t) && Progression.isUnlocked(t) && _toolMatches(t, words));
        if (!found.length) continue;
        found.forEach(t => seen.add(t));
        const lbl = document.createElement('div');
        lbl.className = 'tool-search-section';
        lbl.textContent = other.label;
        add(lbl);
        found.forEach(t => add(_makeToolItem(t)));
        hits += found.length;
      }
      if (!hits) {
        const none = document.createElement('div');
        none.className = 'tool-search-empty';
        none.textContent = `No items match “${raw}”`;
        add(none);
      }
    }
    grid.scrollTop = 0;
  };
  input._applySearch = apply;

  input.addEventListener('input', apply);
  // Typing must never reach the game's hotkeys (WASD pan, number keys, B, X…).
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      if (input.value) { input.value = ''; apply(); } else input.blur();
    } else if (e.key === 'Enter') {
      // Pick the first visible result.
      e.preventDefault();
      const first = [...grid.querySelectorAll('.tool-item')].find(el => el.style.display !== 'none');
      first?.click();
    }
  });
  input.addEventListener('keyup', e => e.stopPropagation());
  input.addEventListener('keypress', e => e.stopPropagation());
  clear.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    input.value = '';
    apply();
    input.focus();
  });
  box.addEventListener('click', e => e.stopPropagation());
}

// Empties every popup's search (called as the popups close).
function _resetToolSearch() {
  document.querySelectorAll('.tool-search input').forEach(inp => {
    if (document.activeElement === inp) inp.blur();
    if (inp.value) { inp.value = ''; inp._applySearch?.(); }
  });
}

// '/' jumps to the search: in the open popup, or the first category's.
document.addEventListener('keydown', e => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.matches?.('input, textarea, [contenteditable]')) return;
  if (document.getElementById('main-menu')?.classList.contains('hidden') === false) return;
  let catId = buildPopupOpen() && openCategoryId !== 'delete' ? openCategoryId : null;
  if (!catId) {
    const first = HOTBAR_CATEGORIES.find(c => c.id !== 'delete' &&
      document.querySelector(`.cat-btn[data-cat="${c.id}"]`)?.style.display !== 'none');
    if (!first) return;
    closeCategoryPopup();
    openCategoryPopup(first.id);
    catId = first.id;
  }
  const input = document.querySelector(`.cat-btn[data-cat="${catId}"] .tool-search input`);
  if (!input) return;
  e.preventDefault();
  input.focus();
  input.select();
});

// Stagger, the collapsed-bar glyph and state sync, once every category is in.
function _afterHotbarBuilt(hotbar) {
  requestAnimationFrame(_toolTipAtPointer);   // new tiles, same pointer
  // Stagger index for the show/hide animation — visible buttons only, so
  // hidden (locked) categories don't leave gaps in the ripple.
  const shown = [...hotbar.querySelectorAll('.cat-btn')].filter(b => b.style.display !== 'none');
  shown.forEach((b, i) => b.style.setProperty('--i', i));
  hotbar.style.setProperty('--n', shown.length);

  // Grid glyph that stands in for the categories while the bar is collapsed.
  const hint = document.createElement('div');
  hint.className = 'hotbar-hint';
  hint.title = 'Build menu (Tab / LB·RB)';
  // 3x3 tile grid; --dx/--dy push each outer tile away from the centre on hover.
  let tiles = '';
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    tiles += `<rect x="${(x + 1) * 8}" y="${(y + 1) * 8}" width="6" height="6" rx="1"`
           + ` style="--dx:${x};--dy:${y}"${x || y ? '' : ' class="core"'}/>`;
  }
  hint.innerHTML = `<svg viewBox="0 0 22 22">${tiles}</svg>`;
  hint.addEventListener('click', e => { e.stopPropagation(); SFX.click(); toggleHotbarCollapsed(false); });
  hotbar.appendChild(hint);
  hotbar.classList.toggle('collapsed', _hotbarCollapsed);

  syncCategoryState();
}

// ── Collapsible build bar (Tab) ───────────────────────────────────
// Remembered across sessions; LB-RB still open a category
// while collapsed (the CSS peeks the bar back up while a popup is open).
let _hotbarCollapsed = (() => {
  try { return localStorage.getItem('gw.hotbarCollapsed') !== '0'; } catch { return true; }
})();
let _hotbarAnimTimer = 0;

// A build-category popup is open (not the REQUESTS panel, which shares the
// same open/closed mechanism).
function buildPopupOpen() {
  return !!openCategoryId && openCategoryId !== '__requests__';
}

// The build menu in either form: a category popup, or the bar expanded.
// Controller B closes it before doing anything else.
function buildMenuOpen() { return buildPopupOpen() || !_hotbarCollapsed; }
function closeBuildMenu() {
  closeCategoryPopup();
  toggleHotbarCollapsed(true);
}

// Tab: anything open (a category popup, or the full bar) closes; only with
// everything put away does it bring the bar up. Plain toggling left a popup
// opened by bumper on a collapsed bar standing — Tab "expanded"
// the bar instead of closing it.
function hotbarTab() {
  if (buildMenuOpen()) {
    closeBuildMenu();
  } else {
    toggleHotbarCollapsed(false);
  }
}

function toggleHotbarCollapsed(force) {
  const hotbar = document.getElementById('hotbar');
  const next = typeof force === 'boolean' ? force : !_hotbarCollapsed;
  if (!hotbar || next === _hotbarCollapsed) return;
  _hotbarCollapsed = next;
  try { localStorage.setItem('gw.hotbarCollapsed', next ? '1' : '0'); } catch {}
  if (next) { closeCategoryPopup(); hideToolTip(); }

  clearTimeout(_hotbarAnimTimer);
  hotbar.getAnimations().forEach(a => a.cancel());
  hotbar.classList.remove('anim-in', 'anim-out');

  // Size-tween the bar's box between its two layouts (FLIP): measure the
  // start and end sizes, then let WAAPI animate between them.
  const tween = (from, to, ms) => {
    if (from.width === to.width && from.height === to.height) return;
    hotbar.animate([
      { width: `${from.width}px`, height: `${from.height}px` },
      { width: `${to.width}px`,   height: `${to.height}px` },
    ], { duration: ms, easing: 'cubic-bezier(.2,.8,.3,1)' });
  };
  const size = () => { const r = hotbar.getBoundingClientRect(); return { width: r.width, height: r.height }; };

  if (!next) {
    // Expand: swap to the full layout, tween the box, ripple the buttons in.
    const from = size();
    hotbar.classList.remove('collapsed');
    const to = size();
    hotbar.classList.add('anim-in');
    tween(from, to, 260);
    const n = +hotbar.style.getPropertyValue('--n') || 6;
    _hotbarAnimTimer = setTimeout(() => hotbar.classList.remove('anim-in'), 340 + n * 35);
  } else {
    // Collapse: sink the buttons out first, then shrink to the pill.
    hotbar.classList.add('anim-out');
    const n = +hotbar.style.getPropertyValue('--n') || 6;
    _hotbarAnimTimer = setTimeout(() => {
      const from = size();
      hotbar.classList.remove('anim-out');
      hotbar.classList.add('collapsed');
      tween(from, size(), 200);
    }, 180 + (n - 1) * 22);
  }
}

function openCategoryPopup(catId) {
  openCategoryId = catId;
  const btn = document.querySelector(`.cat-btn[data-cat="${catId}"]`);
  if (btn) btn.classList.add('open');
}

// Closes the hotbar's build-category popups. The REQUESTS panel rides on the
// same `.cat-btn.open` mechanism but is deliberately NOT closed here.
//
// This function is called from everything that counts as "the player did
// something else": clicking the canvas, picking an item by hotkey, opening
// the blueprint panel. For a build-category popup that is right — it is a
// transient menu. The requests panel is not: it is a list the player reads,
// compares and acts on, and having it vanish because they clicked the map to
// look at where option B actually is made it unusable. So it does not close
// on the mousedown that calls this. It closes on an explicit dismissal (the
// REQUESTS button, its own ✕, Escape) or a plain click on the map, one that
// is not the start of a drag (input_manager.js): each goes through
// closeRequestsPanel() / HouseRequestSystem.togglePanel().
function closeCategoryPopup() {
  hideToolTip();
  _resetToolSearch();
  const reqBtn = document.getElementById('hotbar-req-btn');
  const reqOpen = !!(reqBtn && reqBtn.classList.contains('open'));
  // Leave openCategoryId pointing at the requests panel if that is what owns
  // it, so the panel doesn't read as "nothing is open" while it is on screen.
  openCategoryId = reqOpen ? '__requests__' : null;
  document.querySelectorAll('.cat-btn.open').forEach(b => {
    if (b !== reqBtn) b.classList.remove('open');
  });
}

// Explicit dismissal of the requests panel, for the handful of callers that
// really do mean "close the requests list" rather than "put away the build
// menu". Routed through HouseRequestSystem so its own `panelOpen` flag and the
// button's `.open` class can never disagree.
function closeRequestsPanel() {
  const reqBtn = document.getElementById('hotbar-req-btn');
  if (!reqBtn || !reqBtn.classList.contains('open')) return;
  if (typeof HouseRequestSystem !== 'undefined' && HouseRequestSystem.togglePanel) {
    HouseRequestSystem.togglePanel();
  } else {
    reqBtn.classList.remove('open');
    if (openCategoryId === '__requests__') openCategoryId = null;
  }
}

// Reflect selected tool state onto category buttons (active dot, highlight)
function syncCategoryState() {
  const active = InputManager.state.selectedTool || (InputManager.selectArmed ? 'select' : null);
  HOTBAR_CATEGORIES.forEach(cat => {
    const btn = document.querySelector(`.cat-btn[data-cat="${cat.id}"]`);
    if (!btn) return;
    const hasActive = cat.tools.includes(active);
    btn.classList.toggle('has-active', hasActive);

    // Update face icon to show active tool
    const iconC = btn.querySelector('.cat-face canvas');
    if (iconC) {
      if (cat.id === 'generation' && !hasActive) {
        const _ic = iconC.getContext('2d');
        _ic.clearRect(0,0,38,38);
        _ic.fillStyle = '#ffe040';
        _ic.beginPath();
        _ic.moveTo(22,4); _ic.lineTo(12,20); _ic.lineTo(19,20);
        _ic.lineTo(15,34); _ic.lineTo(27,16); _ic.lineTo(20,16);
        _ic.closePath(); _ic.fill();
      } else {
        const displayTool = hasActive ? active
          : cat.face || cat.tools.find(t => Progression.isUnlocked(t)) || cat.tools[0];
        RenderSystem.drawIconInto(iconC.getContext('2d'), displayTool, 38);
      }
    }
  });

}


function refreshHotbar() {
  buildHotbar();
  // Sync requests badge
  const n = HouseRequestSystem.getPendingCount?.() ?? 0;
  const b = document.getElementById('hotbar-req-badge');
  const f = document.getElementById('hotbar-req-face');
  if (b) { b.textContent = n; b.style.display = n > 0 ? 'block' : 'none'; }
  if (f) { f.style.borderColor = n > 0 ? '#f0c040' : ''; }
}

/* ═══════════════════════════════════════════════════════════════════
   STATS UI updater
   ═══════════════════════════════════════════════════════════════════ */
let _ibdLastUpdateAt = 0;
let _weatherBannerEvType  = null;
let _weatherBannerShownAt = 0;
