/* ═══════════════════════════════════════════════════════════════════
   FILE SAVES
   Stores saves as real .json files in a folder the player picks (e.g. a
   "saves" folder inside the game directory) instead of localStorage.

   Why: localStorage is capped at ~5 MB per origin for ALL saves combined,
   which a couple of large worlds can exhaust — at which point saving fails
   outright. A real folder has no such cap, and the files can be backed up,
   copied between machines, or edited by hand.

   Requirements: the File System Access API, which needs a proper origin.
   Opening index.html straight off disk (file://) gives an opaque origin
   where the API is unavailable — the game must be served over
   http://localhost (see .claude/launch.json) for this to work. isSupported()
   reports that, and SaveSystem falls back to localStorage when false.

   The directory handle is persisted in IndexedDB so the folder only has to
   be chosen once; the browser still re-checks permission on later visits.

   Desktop build: none of the above. When the Electron bridge
   (window.GridworksDesktop.fs) is present, saves are plain files the app
   reads and writes itself, the folder is chosen with the in-game
   FolderPicker instead of the native Windows dialog, and there is no
   permission prompt at all. The API below is the same either way.
   ═══════════════════════════════════════════════════════════════════ */
const FileSaves = (() => {
  const DB_NAME    = 'gridworks_fs';
  const STORE      = 'handles';
  const HANDLE_KEY = 'saveDir';

  let dirHandle = null;   // FileSystemDirectoryHandle once connected

  // Desktop backend state.
  const desk = () => (typeof window !== 'undefined' && window.GridworksDesktop && window.GridworksDesktop.fs) || null;
  let deskDir = null;      // absolute path of the save folder
  let legacyName = null;   // a folder picked under the old browser-picker build, not yet re-located

  function isSupported() {
    if (desk()) return true;
    if (window.GW_MOBILE) return false;   // mobile: saves stay in the browser (IndexedDB)
    return typeof window !== 'undefined'
      && typeof window.showDirectoryPicker === 'function'
      && window.isSecureContext;
  }

  // ── Tiny IndexedDB wrapper (handles aren't JSON-serialisable, so they
  //    can't live in localStorage — IndexedDB stores them structurally) ──
  // Every path here MUST settle the promise. An exception thrown inside an
  // IndexedDB event handler (e.g. a DataCloneError from put(), or a blocked
  // database in private browsing) escapes the handler rather than rejecting,
  // which would leave callers awaiting forever — the visible symptom being a
  // "Use a Save Folder…" click that hangs silently. Hence the try/catch and
  // the transaction-level error/abort handlers.
  function idb(mode, fn) {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB_NAME, 1); }
      catch (err) { reject(err); return; }
      req.onupgradeneeded = () => {
        try {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
        } catch (err) { reject(err); }
      };
      req.onerror   = () => reject(req.error || new Error('indexedDB open failed'));
      req.onblocked = () => reject(new Error('indexedDB blocked'));
      req.onsuccess = () => {
        const db = req.result;
        const done = (fn2, val) => { try { db.close(); } catch (_e) {} fn2(val); };
        try {
          const tx = db.transaction(STORE, mode);
          tx.onabort = () => done(reject, tx.error || new Error('transaction aborted'));
          tx.onerror = () => done(reject, tx.error || new Error('transaction failed'));
          const rq = fn(tx.objectStore(STORE));
          rq.onsuccess = () => done(resolve, rq.result);
          rq.onerror   = () => done(reject, rq.error || new Error('request failed'));
        } catch (err) {
          done(reject, err);
        }
      };
    });
  }

  const putHandle = h  => idb('readwrite', s => s.put(h, HANDLE_KEY));
  const getHandle = () => idb('readonly',  s => s.get(HANDLE_KEY));
  const dropHandle = () => idb('readwrite', s => s.delete(HANDLE_KEY));

  // Checking permission is always safe. REQUESTING it is not: browsers only
  // allow requestPermission() while handling a user gesture, and calling it
  // outside one throws SecurityError. These are therefore two separate
  // functions, so nothing on a startup path can accidentally request.
  async function hasPermission(handle, mode = 'readwrite') {
    if (!handle) return false;
    try { return (await handle.queryPermission({ mode })) === 'granted'; }
    catch (_e) { return false; }   // dead/revoked handle
  }

  // MUST be called from inside a user gesture (a click). For a folder the
  // browser still remembers, this is a one-click "allow" prompt — the player
  // does not have to find the folder again.
  async function ensurePermission(handle, mode = 'readwrite') {
    if (!handle) return false;
    if (await hasPermission(handle, mode)) return true;
    try { return (await handle.requestPermission({ mode })) === 'granted'; }
    catch (err) { console.warn('FileSaves: permission request failed:', err); return false; }
  }

  // Name of the folder created inside whatever the player picks.
  const SAVES_DIR = 'saves';

  // Prompts the player to pick the game folder, then creates (or reuses) a
  // "saves" subfolder inside it and uses that. Returns true once usable.
  //
  // The picker is unavoidable: browsers give a page no way to write to a path
  // of its own choosing, so a folder must be granted by an explicit user
  // gesture. Creating the subfolder ourselves keeps it to a single prompt for
  // the lifetime of the install rather than asking about save locations again.
  async function connect(opts) {
    if (!isSupported()) return false;
    if (desk()) {
      const dest = typeof FolderPicker !== 'undefined' ? await FolderPicker.open(opts) : null;
      if (!dest) return false;
      const dir = await desk().setDir(dest);
      if (!dir) return false;
      deskDir = dir;
      // Anything the old build remembered is superseded now.
      if (legacyName) { legacyName = null; try { await dropHandle(); } catch (_e) {} }
      return true;
    }
    try {
      const picked = await window.showDirectoryPicker({ id: 'gridworks-saves', mode: 'readwrite' });
      if (!(await ensurePermission(picked))) return false;
      // If the player happened to pick the saves folder itself, don't nest
      // another one inside it.
      const handle = picked.name === SAVES_DIR
        ? picked
        : await picked.getDirectoryHandle(SAVES_DIR, { create: true });
      dirHandle = handle;
      // Remembering the folder across sessions is a convenience, not a
      // requirement — if IndexedDB is unavailable the folder still works for
      // this session and the player just re-picks it next time.
      try { await putHandle(handle); }
      catch (err) { console.warn('FileSaves: could not remember folder:', err); }
      return true;
    } catch (err) {
      // AbortError = player closed the picker; not worth surfacing as a failure
      if (err && err.name !== 'AbortError') console.warn('FileSaves.connect failed:', err);
      return false;
    }
  }

  // A folder the browser still remembers but hasn't re-authorised this
  // session. Held here so granting it later costs one permission prompt
  // rather than another trip through IndexedDB.
  let pendingHandle = null;

  // Re-attaches a previously chosen folder on startup. Deliberately checks
  // permission WITHOUT requesting it: this runs on page load, where there is
  // no user gesture, and requestPermission() there throws SecurityError.
  //
  // Chrome drops file-system grants when the browser is fully restarted, so a
  // new browser session lands here with a remembered handle sitting at
  // "prompt". That is not a failure — the folder is one click away. reconnect()
  // returns false but stashes the handle, needsPermission() then reports true,
  // and the menu's CONTINUE button (a real gesture) calls requestAccess().
  async function reconnect() {
    pendingHandle = null;
    if (!isSupported()) return false;
    if (desk()) {
      deskDir = await desk().getDir();
      if (deskDir) return true;
      // Saves chosen with the old browser picker: the app can't learn that
      // folder's path from its handle, so the player points at it once.
      try { const h = await getHandle(); if (h) legacyName = h.name || 'saves'; } catch (_e) {}
      return false;
    }
    try {
      const handle = await getHandle();
      if (!handle) return false;
      if (await hasPermission(handle)) {
        dirHandle = handle;
        return true;
      }
      pendingHandle = handle;
      return false;
    } catch (err) {
      console.warn('FileSaves.reconnect failed:', err);
      return false;
    }
  }

  // True when there IS a remembered save folder and it just needs the player
  // to re-authorise it. False once connected, and false when no folder was
  // ever chosen — in both of those cases there is nothing to ask about, which
  // is what keeps the prompt to the first CONTINUE of a browser session.
  function needsPermission() {
    if (desk()) return !deskDir && !!legacyName;
    return !dirHandle && !!pendingHandle;
  }

  // Call from a click. Re-authorises the remembered folder; falls back to the
  // full picker only if the handle itself has gone bad (folder moved, renamed
  // or deleted), which is the one case where the player really does have to
  // go and find it again.
  async function requestAccess() {
    if (!isSupported()) return false;
    if (desk()) {
      if (deskDir) return true;
      return connect(legacyName ? {
        title: 'Find Your Saves',
        hint: `GRIDWORKS now keeps track of its save folder itself. Open the “${legacyName}” folder you chose before (or the folder it's in) and press Use This Folder. You'll only need to do this once.`,
      } : undefined);
    }
    if (dirHandle) return true;
    if (!pendingHandle) return await connect();
    if (await ensurePermission(pendingHandle)) {
      dirHandle = pendingHandle;
      pendingHandle = null;
      return true;
    }
    return false;
  }

  async function forget() {
    deskDir = null;
    dirHandle = null;
    pendingHandle = null;
    try { await dropHandle(); } catch (_e) {}
  }

  function isConnected() { return desk() ? !!deskDir : !!dirHandle; }
  function folderName()  { return desk() ? deskDir : (dirHandle ? dirHandle.name : null); }

  // Turns a city name into something safe for a filename on every OS.
  function safeName(s) {
    return String(s || 'save')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')  // illegal on Windows
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40) || 'save';
  }

  function stamp(ts) {
    const d = new Date(ts || Date.now());
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  function newFileName(cityName, ts) {
    return `${safeName(cityName)}_${stamp(ts)}.json`;
  }

  // A player-typed save name becomes the filename verbatim (sanitised), with
  // no timestamp — what they type is what they see in the folder.
  function fileNameFor(name) {
    return `${safeName(name)}.json`;
  }

  // Lists every .json save in the folder, newest first. Each file is parsed
  // for its metadata; a file that isn't valid save JSON is skipped rather
  // than breaking the whole listing (the folder may hold unrelated files).
  // Slot metadata for one file, or null if it isn't a save.
  // `parsed` is the save object itself when the caller already has it (a
  // write), which spares parsing megabytes of text straight back.
  function _entry(name, text, parsed) {
    try {
      const data = parsed || JSON.parse(text);
      if (!data || typeof data !== 'object' || !data.grid) return null;  // not a save
      return {
        id:          name,             // filename doubles as the slot id
        fileName:    name,
        // In folder mode the filename IS the save's name.
        saveName:    name.replace(/\.json$/i, ''),
        worldId:     data.worldId || name,
        cityName:    (data.cityInfo && data.cityInfo.cityName)    || name.replace(/\.json$/i, ''),
        companyName: (data.cityInfo && data.cityInfo.companyName) || '',
        savedAt:     data._savedAt || 0,
        bytes:       text.length,
        // Which scenario this save is, so the picker can offer to resume it.
        scenario:    (data.scenario && data.scenario.id) || null,
        ...(typeof Difficulty !== 'undefined' ? Difficulty.badges(data) : {}),
      };
    } catch (_e) { return null; }   // unreadable/not-a-save: skip
  }

  // What each save in the folder was found to be, by filename:
  // { s: size, m: modified ms, e: _entry() or null when it isn't a save }.
  // A file is read and parsed only when it is new or its size or time has
  // changed. Every listing used to read and parse every save in full, and
  // the list is refreshed at launch and after every write: a folder of 76
  // multi-megabyte worlds froze the title screen and put a hitch into every
  // autosave. Kept in localStorage so a launch doesn't parse them all again.
  const META_KEY = 'gridworks.saveMeta.v1';
  let _meta = null, _metaDir = null;
  function _metaFor(dir) {
    if (_meta && _metaDir === dir) return _meta;
    _meta = new Map(); _metaDir = dir;
    try {
      const raw = JSON.parse(localStorage.getItem(META_KEY) || 'null');
      if (raw && raw.dir === dir && raw.files) for (const n of Object.keys(raw.files)) _meta.set(n, raw.files[n]);
    } catch (_e) {}
    return _meta;
  }
  function _metaStore() {
    try { localStorage.setItem(META_KEY, JSON.stringify({ dir: _metaDir, files: Object.fromEntries(_meta) })); } catch (_e) {}
  }
  // Files the folder holds now: [{ name, size, mtimeMs, read() }]. Only the
  // ones whose size or time changed get read(); the listing is rebuilt from
  // the cache and goes out newest first.
  async function _listCached(dir, files) {
    const meta = _metaFor(dir), seen = new Set(), out = [];
    let dirty = false;
    for (const f of files) {
      seen.add(f.name);
      let m = meta.get(f.name);
      if (!m || m.s !== f.size || m.m !== f.mtimeMs) {
        let text = null;
        try { text = await f.read(); } catch (_e) { /* unreadable: skip */ }
        m = { s: f.size, m: f.mtimeMs, e: typeof text === 'string' ? _entry(f.name, text) : null };
        meta.set(f.name, m); dirty = true;
      }
      if (m.e) out.push({ ...m.e });
    }
    for (const n of [...meta.keys()]) if (!seen.has(n)) { meta.delete(n); dirty = true; }
    if (dirty) _metaStore();
    return out.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  }
  // A save just written: file its details from the text in hand.
  function _remember(name, stat, text, parsed) {
    if (!_meta || !stat || typeof stat !== 'object') return;
    _meta.set(name, { s: stat.size, m: stat.mtimeMs, e: _entry(name, text, parsed) });
    _metaStore();
  }

  // Lists every .json save in the folder, newest first. A file that isn't
  // valid save JSON is skipped rather than breaking the whole listing (the
  // folder may hold unrelated files).
  async function list() {
    if (desk()) {
      if (!deskDir) return [];
      try {
        const files = (await desk().list()).map(f => ({
          name: f.name, size: f.size, mtimeMs: f.mtimeMs,
          read: () => (typeof f.text === 'string' ? f.text : desk().read(f.name)),
        }));
        return await _listCached(deskDir, files);
      } catch (err) { console.warn('FileSaves.list failed:', err); return []; }
    }
    if (!dirHandle) return [];
    const files = [];
    try {
      for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind !== 'file' || !name.toLowerCase().endsWith('.json')) continue;
        try {
          const file = await handle.getFile();
          files.push({ name, size: file.size, mtimeMs: file.lastModified, read: () => file.text() });
        } catch (_e) { /* unreadable: skip */ }
      }
    } catch (err) {
      console.warn('FileSaves.list failed:', err);
    }
    return _listCached('fsa:' + dirHandle.name, files);
  }

  // Why the last write() failed, for the message the player sees (null after
  // a write that worked).
  let lastError = null;
  const WRITE_ATTEMPTS = 3;

  // `parsed` (optional) is the object jsonText was made from.
  async function write(fileName, jsonText, parsed) {
    if (desk()) {
      if (!deskDir) { lastError = 'no save folder chosen'; return false; }
      for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt++) {
        try {
          const ok = await desk().write(fileName, jsonText);
          if (ok) { lastError = null; _remember(fileName, ok, jsonText, parsed); return true; }
          lastError = 'the folder refused the file';
        } catch (err) {
          lastError = err ? `${err.name || 'Error'}: ${err.message || err}` : 'unknown error';
          console.warn(`FileSaves.write failed (attempt ${attempt} of ${WRITE_ATTEMPTS}):`, err);
        }
        if (attempt < WRITE_ATTEMPTS) await new Promise(r => setTimeout(r, 400 * attempt));
      }
      return false;
    }
    if (!dirHandle) { lastError = 'no save folder connected'; return false; }
    // The browser commits a write by scanning a swap file and moving it over
    // the real one, and that step fails now and then for reasons that have
    // nothing to do with the save (the virus scanner timing out on a busy
    // machine, a sync client holding the file). So a failed write is tried
    // again before it is reported — only a refused permission is final.
    for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt++) {
      let existed = true;
      try {
        try { await dirHandle.getFileHandle(fileName); } catch (_e) { existed = false; }
        const fh = await dirHandle.getFileHandle(fileName, { create: true });
        const w  = await fh.createWritable();
        try { await w.write(jsonText); await w.close(); }
        catch (err) { try { await w.abort(); } catch (_e) {} throw err; }
        lastError = null;
        try { const f = await fh.getFile(); _remember(fileName, { size: f.size, mtimeMs: f.lastModified }, jsonText, parsed); } catch (_e) {}
        return true;
      } catch (err) {
        lastError = err ? `${err.name || 'Error'}: ${err.message || err}` : 'unknown error';
        console.warn(`FileSaves.write failed (attempt ${attempt} of ${WRITE_ATTEMPTS}):`, err);
        // The file is created before it is filled, so a write that dies in
        // between leaves a 0-byte .json behind: a "save" in the list that can
        // never load. If this call made the file and it is still empty, take
        // it away again. An existing save is never touched — its old contents
        // stay in place until a write has fully succeeded.
        if (!existed) {
          try {
            const f = await (await dirHandle.getFileHandle(fileName)).getFile();
            if (f.size === 0) await dirHandle.removeEntry(fileName);
          } catch (_e) {}
        }
        if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) break;
        if (attempt < WRITE_ATTEMPTS) await new Promise(r => setTimeout(r, 400 * attempt));
      }
    }
    return false;
  }

  // Desktop only: writes the file before returning, blocking the page for the
  // few milliseconds it takes. For the save made as the window closes, where
  // an async write may not get to run — this is what lets the desktop build
  // skip the localStorage crash-mirror (a multi-megabyte synchronous write on
  // every autosave, and over the browser's quota for a big world anyway).
  function canWriteNow() { return !!(desk() && deskDir && desk().writeNow); }
  function writeNow(fileName, jsonText, parsed) {
    if (!canWriteNow()) return false;
    try {
      const ok = desk().writeNow(fileName, jsonText);
      if (ok) { lastError = null; _remember(fileName, ok, jsonText, parsed); return true; }
      lastError = 'the folder refused the file';
    } catch (err) {
      lastError = err ? `${err.name || 'Error'}: ${err.message || err}` : 'unknown error';
    }
    return false;
  }

  async function read(fileName) {
    if (desk()) {
      if (!deskDir) return null;
      try { return await desk().read(fileName); }
      catch (err) { console.warn('FileSaves.read failed:', err); return null; }
    }
    if (!dirHandle) return null;
    try {
      const fh = await dirHandle.getFileHandle(fileName);
      return await (await fh.getFile()).text();
    } catch (err) {
      console.warn('FileSaves.read failed:', err);
      return null;
    }
  }

  async function remove(fileName) {
    if (desk()) {
      if (!deskDir) return false;
      try { return await desk().remove(fileName); }
      catch (err) { console.warn('FileSaves.remove failed:', err); return false; }
    }
    if (!dirHandle) return false;
    try {
      await dirHandle.removeEntry(fileName);
      return true;
    } catch (err) {
      console.warn('FileSaves.remove failed:', err);
      return false;
    }
  }

  return {
    isSupported, isConnected, folderName,
    connect, reconnect, forget, needsPermission, requestAccess,
    list, read, write, remove, canWriteNow, writeNow,
    lastError: () => lastError,
    newFileName, fileNameFor,
  };
})();
