/* ═══════════════════════════════════════════════════════════════════
   UI TOOLTIPS
   Every HTML `title` in the game showed as the browser's own tooltip: a
   pale system box that looked like Windows, not like the game. This takes
   them over in one place rather than at each of the hundred-odd buttons
   that set one: on hover the element's title is moved aside (so the native
   box never opens) and its text is shown in a game-styled label instead,
   after the same sort of short pause. Moving off puts the title back, so
   anything that reads or rewrites `el.title` later still finds it. A title
   changed while the pointer is on the element (a button whose hint tracks
   live state) is picked up and the label follows it.

   The build bar keeps its own richer label (#tool-tip-float, hotbar_ui.js);
   its tiles carry no title, so the two never meet.
   ═══════════════════════════════════════════════════════════════════ */

const UITooltips = (() => {
  const api = { enabled: true, delayMs: 380 };
  const KEY = 'data-gw-title';
  let tip = null, cur = null, timer = 0, obs = null;
  let px = 0, py = 0;

  function el() {
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'gw-tip';
      tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }
    return tip;
  }

  // Take the title off `e` (keeping its text), so the browser has nothing
  // to show. Returns the text, or '' if it has none.
  function steal(e) {
    const t = e.getAttribute('title');
    if (t !== null) {
      e.removeAttribute('title');
      if (t.trim()) e.setAttribute(KEY, t); else e.removeAttribute(KEY);
    }
    return e.getAttribute(KEY) || '';
  }
  function giveBack(e) {
    if (!e) return;
    const t = e.getAttribute(KEY);
    e.removeAttribute(KEY);
    // A title set since (by the element's own code) wins over the old one.
    if (t !== null && e.getAttribute('title') === null) e.setAttribute('title', t);
  }

  function place() {
    const t = el();
    const pad = 8, gap = 18;
    const w = t.offsetWidth, h = t.offsetHeight;
    let x = px - w / 2, y = py + gap;
    if (y + h > innerHeight - pad) y = py - gap - h + 4;     // no room below: above the pointer
    x = Math.max(pad, Math.min(x, innerWidth - w - pad));
    y = Math.max(pad, Math.min(y, innerHeight - h - pad));
    t.style.left = Math.round(x) + 'px';
    t.style.top  = Math.round(y) + 'px';
  }

  function show() {
    timer = 0;
    if (!cur || !cur.isConnected) return hide();
    const text = cur.getAttribute(KEY);
    if (!text) return;
    const t = el();
    t.textContent = text;
    t.classList.remove('on');
    t.style.display = 'block';
    place();
    void t.offsetWidth;          // so the fade runs from the start
    t.classList.add('on');
  }

  function hide() {
    if (timer) { clearTimeout(timer); timer = 0; }
    if (obs) { obs.disconnect(); obs = null; }
    giveBack(cur);
    cur = null;
    if (tip) { tip.classList.remove('on'); tip.style.display = 'none'; }
  }

  function enter(e) {
    if (e === cur) return;
    hide();
    if (!steal(e)) return;
    cur = e;
    // The element's own code may set a fresh title while it's hovered.
    obs = new MutationObserver(() => {
      if (!cur || cur.getAttribute('title') === null) return;
      const text = steal(cur);
      if (!text) { hide(); return; }
      if (tip && tip.style.display === 'block') { tip.textContent = text; place(); }
    });
    obs.observe(e, { attributes: true, attributeFilter: ['title'] });
    timer = setTimeout(show, api.delayMs);
  }

  const owner = (n) => (n && n.closest) ? n.closest('[title], [' + KEY + ']') : null;

  document.addEventListener('mouseover', (ev) => {
    if (!api.enabled) return;
    px = ev.clientX; py = ev.clientY;
    const e = owner(ev.target);
    if (e) enter(e);
    else if (cur) hide();
  }, true);
  document.addEventListener('mousemove', (ev) => {
    px = ev.clientX; py = ev.clientY;
    // Until it shows, it opens where the pointer has come to rest.
  }, { capture: true, passive: true });
  document.addEventListener('mouseout', (ev) => {
    if (!cur) return;
    const to = ev.relatedTarget;
    if (!to || !cur.contains(to)) hide();
  }, true);
  // A click, a key, a scroll or leaving the window ends it, as natively.
  for (const t of ['mousedown', 'keydown', 'wheel', 'blur']) window.addEventListener(t, () => { if (cur) hide(); }, { capture: true, passive: true });

  api.hide = hide;
  return api;
})();
