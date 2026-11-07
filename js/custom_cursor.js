/* ═══════════════════════════════════════════════════════════════════
   CUSTOM CURSORS
   Replaces the operating-system cursors with a set drawn to match the
   dashboard theme: a black arrow with a white outline, the same arrow with
   a blue outline for anything clickable, a placement reticle, grab
   hands, and a red no-entry badge.

   Nothing else in the codebase has to know about this. The game keeps
   asking for plain CSS keywords — 123 `cursor: pointer` rules in the
   stylesheets, and JS that sets `style.cursor` to crosshair / grabbing /
   not-allowed on the canvas — and this module swaps each keyword for its
   custom image:
     • once at load, by rewriting the matching rules in the page's own
       stylesheets (the cross-origin font sheet can't be read and has no
       cursors anyway);
     • continuously, for inline styles, via a MutationObserver that rewrites
       any `style.cursor` still holding a bare keyword.
   Every image keeps its keyword as the fallback, so if an SVG ever fails to
   load the native cursor shows instead of nothing.
   ═══════════════════════════════════════════════════════════════════ */
(() => {
  const BLACK = '#07090d', WHITE = '#ffffff', BLUE = '#3b9eff', RED = '#ff5d5d';

  // All drawn on a 32×32 grid; the second and third numbers are the hotspot.
  // A black arrow; the outline colour carries the state (white normally,
  // blue over anything clickable).
  const ARROW = (outline) =>
    `<path d="M4 3 L4 24 L9.5 19 L13.2 27.6 L17 26 L13.4 17.6 L20.6 17.4 Z" fill="${BLACK}" stroke="${outline}" stroke-width="1.8" stroke-linejoin="round"/>`;
  const SHADOW = `<path d="M5 4.5 L5 25.5 L10.5 20.5 L14.2 29 L18 27.4 L14.4 19 L21.6 18.8 Z" fill="rgba(0,0,0,0.35)"/>`;

  const SVG = {
    default: [4, 3,
      SHADOW + ARROW(WHITE)],
    pointer: [4, 3,
      SHADOW + ARROW(BLUE)],
    crosshair: [16, 16,
      `<circle cx="16" cy="16" r="8" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="4"/>` +
      `<circle cx="16" cy="16" r="8" fill="none" stroke="${WHITE}" stroke-width="1.6"/>` +
      `<g stroke="rgba(0,0,0,0.45)" stroke-width="4" stroke-linecap="round"><path d="M16 2 V7 M16 25 V30 M2 16 H7 M25 16 H30"/></g>` +
      `<g stroke="${BLUE}" stroke-width="2" stroke-linecap="round"><path d="M16 2 V7 M16 25 V30 M2 16 H7 M25 16 H30"/></g>` +
      `<circle cx="16" cy="16" r="2" fill="${BLUE}" stroke="${WHITE}" stroke-width="1"/>`],
    // Blueprint copy / paste: the placement reticle, shifted up-left to make
    // room for a blue badge of two overlapping pages in the corner.
    copy: [12, 12,
      `<circle cx="12" cy="12" r="6.5" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="4"/>` +
      `<circle cx="12" cy="12" r="6.5" fill="none" stroke="${WHITE}" stroke-width="1.6"/>` +
      `<g stroke="rgba(0,0,0,0.45)" stroke-width="4" stroke-linecap="round"><path d="M12 1 V5 M12 19 V23 M1 12 H5 M19 12 H23"/></g>` +
      `<g stroke="${BLUE}" stroke-width="2" stroke-linecap="round"><path d="M12 1 V5 M12 19 V23 M1 12 H5 M19 12 H23"/></g>` +
      `<circle cx="12" cy="12" r="1.8" fill="${BLUE}" stroke="${WHITE}" stroke-width="1"/>` +
      `<circle cx="24" cy="24" r="7.5" fill="${BLUE}" stroke="${WHITE}" stroke-width="1.4"/>` +
      `<rect x="19.6" y="19.4" width="6" height="7" rx="1" fill="${BLUE}" stroke="${WHITE}" stroke-width="1.3"/>` +
      `<rect x="22.4" y="21.8" width="6" height="7" rx="1" fill="${BLUE}" stroke="${WHITE}" stroke-width="1.3"/>`],
    'not-allowed': [4, 3,
      SHADOW + ARROW(WHITE) +
      `<circle cx="22" cy="22" r="6.5" fill="${WHITE}"/><circle cx="22" cy="22" r="5.2" fill="none" stroke="${RED}" stroke-width="2.2"/>` +
      `<path d="M18.4 25.6 L25.6 18.4" stroke="${RED}" stroke-width="2.2" stroke-linecap="round"/>`],
    move: [16, 16,
      `<g stroke="rgba(0,0,0,0.45)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M16 3 V29 M3 16 H29 M12 7 L16 3 L20 7 M12 25 L16 29 L20 25 M7 12 L3 16 L7 20 M25 12 L29 16 L25 20"/></g>` +
      `<g stroke="${WHITE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M16 3 V29 M3 16 H29 M12 7 L16 3 L20 7 M12 25 L16 29 L20 25 M7 12 L3 16 L7 20 M25 12 L29 16 L25 20"/></g>` +
      `<circle cx="16" cy="16" r="2.4" fill="${BLUE}"/>`],
    text: [16, 16,
      `<path d="M12 5 H20 M16 5 V27 M12 27 H20" stroke="rgba(0,0,0,0.5)" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M12 5 H20 M16 5 V27 M12 27 H20" stroke="${WHITE}" stroke-width="1.8" stroke-linecap="round"/>`],
    help: [4, 3,
      SHADOW + ARROW(WHITE) +
      `<circle cx="22.5" cy="22" r="6.5" fill="${BLUE}" stroke="${WHITE}" stroke-width="1.4"/>` +
      `<text x="22.5" y="25.6" font-family="Arial" font-weight="bold" font-size="10" fill="${WHITE}" text-anchor="middle">?</text>`],
  };

  const CURSOR = {};
  for (const [name, [hx, hy, body]] of Object.entries(SVG)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${body}</svg>`;
    const fallback = name === 'default' ? 'default' : name;
    CURSOR[name] = `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hx} ${hy}, ${fallback}`;
  }
  // Keywords that should just read as the normal arrow. Dragging (grab /
  // grabbing) deliberately keeps the arrow too — no hand while moving things.
  CURSOR.auto = CURSOR.default;
  CURSOR['context-menu'] = CURSOR.default;
  CURSOR.grab = CURSOR.default;
  CURSOR.grabbing = CURSOR.default;

  // ── Stylesheet rules ──
  function rewriteRules(rules) {
    for (const rule of rules) {
      if (rule.cssRules) rewriteRules(rule.cssRules);                      // @media etc.
      const st = rule.style;
      if (!st) continue;
      const v = st.getPropertyValue('cursor').trim();
      if (v && CURSOR[v]) st.setProperty('cursor', CURSOR[v], st.getPropertyPriority('cursor'));
    }
  }
  function rewriteSheets() {
    for (const sheet of document.styleSheets) {
      if (sheet.__customCursorsDone) continue;
      try { rewriteRules(sheet.cssRules); sheet.__customCursorsDone = true; }
      catch (e) { /* cross-origin (Google Fonts); nothing to rewrite */ }
    }
  }

  // ── Inline styles set by the game ──
  function rewriteInline(el) {
    const v = el.style && el.style.cursor;
    if (v && CURSOR[v]) el.style.cursor = CURSOR[v];
  }

  function install() {
    // Base arrow for everything that doesn't ask for a cursor of its own.
    const base = document.createElement('style');
    base.id = 'custom-cursor-base';
    base.textContent = `html, body, canvas { cursor: ${CURSOR.default}; }
input[type="text"], input[type="search"], input[type="number"], textarea, [contenteditable="true"] { cursor: ${CURSOR.text}; }`;
    document.head.appendChild(base);
    rewriteSheets();
    document.querySelectorAll('[style*="cursor"]').forEach(rewriteInline);
    new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'attributes') rewriteInline(m.target);
        else for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          rewriteInline(n);
          if (n.querySelectorAll) n.querySelectorAll('[style*="cursor"]').forEach(rewriteInline);
          if (n.tagName === 'STYLE' || n.tagName === 'LINK') setTimeout(rewriteSheets, 0);
        }
      }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['style'], childList: true, subtree: true });
    // A stylesheet <link> can finish loading after this runs.
    window.addEventListener('load', rewriteSheets);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();

  window.CustomCursor = { get: name => CURSOR[name] || CURSOR.default };
})();
