/* ═══════════════════════════════════════════════════════════════════
   FOLDER PICKER
   The desktop build's save-location chooser, drawn in the game's own UI
   instead of the native Windows folder dialog. Browses real folders
   through the desktop bridge (window.GridworksDesktop.fs — see
   electron/main.js), so there is no browser permission prompt either.

   FolderPicker.open({ title, hint }) resolves to the folder the player
   settled on, or null if they cancelled. Only used when the desktop bridge
   exists; the browser build keeps the browser's own picker.
   ═══════════════════════════════════════════════════════════════════ */
const FolderPicker = (() => {
  const SAVES_DIR = 'saves';
  let el = null, state = null;

  const bridge = () => (typeof window !== 'undefined' && window.GridworksDesktop && window.GridworksDesktop.fs) || null;
  const sep = p => (p.includes('\\') ? '\\' : '/');
  const join = (a, b) => a.endsWith('\\') || a.endsWith('/') ? a + b : a + sep(a) + b;
  const baseName = p => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;
  const click = () => { if (typeof SFX !== 'undefined') SFX.click?.(); };

  // Where the saves will actually land for a given open folder: a "saves"
  // folder inside it, unless the player is already standing in one.
  function destFor(p) {
    return baseName(p).toLowerCase() === SAVES_DIR ? p : join(p, SAVES_DIR);
  }

  function _build() {
    el = document.createElement('div');
    el.id = 'folder-picker';
    el.innerHTML = `
      <div class="options-box fp-box" role="dialog" aria-label="Choose save location">
        <div class="pause-header">
          <span class="pause-title">📁 Save Location</span>
          <button class="pause-close fp-cancel">✕ Cancel</button>
        </div>
        <div class="fp-hint"></div>
        <div class="fp-body">
          <div class="fp-places"></div>
          <div class="fp-main">
            <div class="fp-crumbs"></div>
            <div class="fp-list"></div>
            <div class="fp-new">
              <button class="fp-new-btn">＋ New Folder</button>
              <input class="cn-input fp-new-input" maxlength="60" placeholder="Folder name" autocomplete="off">
            </div>
          </div>
        </div>
        <div class="fp-foot">
          <div class="fp-dest"><span class="fp-dest-label">SAVES WILL GO TO</span><span class="fp-dest-path"></span><span class="fp-dest-note"></span></div>
          <button class="menu-btn primary fp-ok">✓ Use This Folder</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('.fp-cancel').addEventListener('click', () => { click(); _close(null); });
    el.querySelector('.fp-ok').addEventListener('click', () => { click(); _close(destFor(state.path)); });
    el.addEventListener('mousedown', e => { if (e.target === el) { click(); _close(null); } });
    const newBtn = el.querySelector('.fp-new-btn'), newIn = el.querySelector('.fp-new-input');
    newBtn.addEventListener('click', () => { click(); el.classList.add('naming'); newIn.value = ''; newIn.focus(); });
    newIn.addEventListener('keydown', async e => {
      e.stopPropagation();
      if (e.key === 'Escape') { el.classList.remove('naming'); return; }
      if (e.key !== 'Enter') return;
      const name = newIn.value.trim();
      el.classList.remove('naming');
      if (!name) return;
      const r = await bridge().mkdir(state.path, name);
      if (r && r.ok) { click(); _go(r.path); }
      else _flash(`Couldn't create that folder${r && r.error ? ` (${r.error})` : ''}`);
    });
    newIn.addEventListener('blur', () => el.classList.remove('naming'));
  }

  function _flash(msg) {
    const n = el.querySelector('.fp-dest-note');
    n.textContent = msg; n.classList.add('bad');
    setTimeout(() => { n.classList.remove('bad'); _renderDest(); }, 2200);
  }

  function _renderPlaces() {
    const box = el.querySelector('.fp-places');
    box.innerHTML = '';
    const icon = { 'Game Folder': '🎮', Documents: '📄', Desktop: '🖥', Home: '🏠' };
    for (const p of state.places) {
      const b = document.createElement('button');
      b.className = 'fp-place' + (p.drive ? ' drive' : '');
      b.innerHTML = `<span class="fp-ic">${p.drive ? '💽' : (icon[p.label] || '📁')}</span><span></span>`;
      b.lastChild.textContent = p.label;
      b.title = p.path;
      b.addEventListener('click', () => { click(); _go(p.path); });
      box.appendChild(b);
    }
  }

  function _renderDest() {
    const d = destFor(state.path);
    el.querySelector('.fp-dest-path').textContent = d;
    const note = el.querySelector('.fp-dest-note');
    note.classList.remove('bad');
    const here = baseName(state.path).toLowerCase() === SAVES_DIR ? state.saves : null;
    note.textContent = here ? `${here} save${here === 1 ? '' : 's'} already here`
      : state.hasSavesDir ? 'Uses the existing “saves” folder here' : 'A “saves” folder will be created here';
  }

  async function _go(p) {
    const r = await bridge().listDirs(p);
    if (!r || !r.ok) { _flash(`Can't open that folder${r && r.error ? ` (${r.error})` : ''}`); return; }
    state.path = r.path; state.parent = r.parent; state.saves = r.saves;
    state.hasSavesDir = r.dirs.some(d => d.toLowerCase() === SAVES_DIR);

    // Breadcrumbs: every ancestor is one click away.
    const crumbs = el.querySelector('.fp-crumbs');
    crumbs.innerHTML = '';
    const parts = r.path.split(/[\\/]/).filter(Boolean);
    const s = sep(r.path);
    let acc = r.path.startsWith('/') ? '/' : '';
    parts.forEach((part, i) => {
      acc = i === 0 && !acc ? part + s : join(acc, part);
      const target = acc;
      const b = document.createElement('button');
      b.className = 'fp-crumb' + (i === parts.length - 1 ? ' here' : '');
      b.textContent = part;
      b.addEventListener('click', () => { click(); _go(target); });
      if (i) crumbs.appendChild(Object.assign(document.createElement('span'), { className: 'fp-crumb-sep', textContent: '›' }));
      crumbs.appendChild(b);
    });
    crumbs.scrollLeft = crumbs.scrollWidth;

    const list = el.querySelector('.fp-list');
    list.innerHTML = '';
    const row = (label, icon, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'fp-row ' + cls;
      b.innerHTML = `<span class="fp-ic">${icon}</span><span class="fp-name"></span><span class="fp-go">›</span>`;
      b.querySelector('.fp-name').textContent = label;
      b.addEventListener('click', () => { click(); fn(); });
      list.appendChild(b);
    };
    if (r.parent) row('Up one level', '⬑', 'up', () => _go(r.parent));
    for (const d of r.dirs) row(d, d.toLowerCase() === SAVES_DIR ? '💾' : '📁', d.toLowerCase() === SAVES_DIR ? 'saves' : '', () => _go(join(r.path, d)));
    if (!r.dirs.length) list.insertAdjacentHTML('beforeend', '<div class="fp-empty">No folders in here</div>');
    list.scrollTop = 0;
    _renderDest();
  }

  // Esc cancels, Enter confirms, Backspace goes up — captured so the
  // game's own shortcuts (Esc → pause menu) don't fire underneath.
  function _onKey(e) {
    if (!state || e.target.classList?.contains('fp-new-input')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); click(); _close(null); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); click(); _close(destFor(state.path)); }
    else if (e.key === 'Backspace' && state.parent) { e.preventDefault(); e.stopImmediatePropagation(); _go(state.parent); }
  }

  function _close(result) {
    if (!state) return;
    const done = state.resolve;
    state = null;
    el.classList.remove('visible', 'naming');
    window.removeEventListener('keydown', _onKey, true);
    done(result);
  }

  async function open(opts = {}) {
    if (!bridge()) return null;
    if (state) _close(null);
    if (!el) _build();
    const info = await bridge().places();
    el.querySelector('.fp-hint').textContent = opts.hint ||
      'Pick where your worlds are saved. GRIDWORKS keeps them in a “saves” folder here; back it up or copy it to another PC any time.';
    el.querySelector('.pause-title').textContent = `📁 ${opts.title || 'Save Location'}`;
    return new Promise(resolve => {
      state = { resolve, places: info.places, path: null };
      _renderPlaces();
      // Open where the saves live now (its parent, so the "saves" folder is
      // visible), else Documents.
      const docs = info.places.find(p => p.label === 'Documents') || info.places[0];
      const start = info.current
        ? (baseName(info.current).toLowerCase() === SAVES_DIR ? info.current.replace(/[\\/][^\\/]+[\\/]?$/, '').replace(/^([A-Za-z]:)$/, '$1\\') || info.current : info.current)
        : docs.path;
      _go(start).then(() => {
        el.classList.add('visible');
        window.addEventListener('keydown', _onKey, true);
        el.querySelector('.fp-ok').focus();
      });
    });
  }

  return { open, isOpen: () => !!state };
})();
