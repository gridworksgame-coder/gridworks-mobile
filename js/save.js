/* ═══════════════════════════════════════════════════════════════════
   SAVE / LOAD SYSTEM
   ─────────────────────────────────────────────────────────────────
   Persists to localStorage. Each save "slot" is its own world (own
   grid, economy, progression, etc.) stored under its own key so a
   player can keep multiple in-progress cities side by side. A slot
   index (SLOTS_KEY) holds lightweight metadata — city/company name,
   last-saved time — for listing slots on the main menu without
   parsing every slot's full save blob.
   Autosaves on a player-set interval (or not at all, if they turn it off
   in Options) and on page unload, rotating across three autosave files per
   world so the last three are always recoverable.
   SaveData schema:
     version      — bumped when schema changes; old saves are ignored
     grid         — array of serialised entity objects
     economy      — { balance }
     progression  — { unlocked[], ready[], totalWs, totalResearch, maxSubstationCharge }
     daynight     — { elapsed }
     camera       — { panX, panY, zoom }
     requests     — { cabinSent, cabinCleared, nextThreshold, pending[] }
   ═══════════════════════════════════════════════════════════════════ */
const SaveSystem = (() => {
  const LEGACY_KEY  = 'powergrid_save';       // pre-multi-slot single save
  const SLOT_PREFIX = 'powergrid_save_';      // + slot id
  const SLOTS_KEY   = 'powergrid_save_slots'; // index of {id, cityName, companyName, savedAt}
  const VERSION = 11;  // +reservoir/dam/turbine system
  let   paused  = false;   // set before reload to stop beforeunload re-saving   // increment when schema changes to discard stale saves
  // Buildings that grew since older saves were made and take their new
  // footprint on load only where there's room for it (the post-load grow pass).
  const _growsOnLoad = (e) => e.commercialSubtype === 'chemical' || e.commercialSubtype === 'spaceport' ||
    !!(e.commercialSubtype ? ArtFootprints.sub[e.commercialSubtype] : ArtFootprints.type[e.type]);
  // City Hall and every civic and national building: the buildings
  // GovernmentSystem holds against approval while they're unpowered, whose
  // power record is saved (see the serialiser).
  const _GOV_POWER_TYPES = new Set([T.GOVBUILDING, T.TOWNHALL, T.CIVICCENTER, T.COURTHOUSE, T.EMS, T.HOSPITAL, T.UNIVERSITY, T.TRANSPORTHUB,
    T.NATIONALGOV, T.FUSIONLAB, T.AIRPORT, T.MILITARYBASE, T.LAUNCHCOMPLEX, T.NATIONALGRID, T.COMPANYHQ]);
  let   currentSlot = null; // slot id the active session saves/loads against
  let   currentWorld = null; // worldId shared by every save branched from this playthrough
  // Every automatic write (the interval, the exit hooks, F2 quick-save)
  // targets THESE slots and nothing else. They are deliberately never files
  // the player created and named: those are snapshots, and only an explicit
  // player action (Create New Save / Overwrite) may write to one. Before this
  // split, all of the above wrote to currentSlot, so naming a save and
  // carrying on playing silently overwrote that named file every 30 seconds.
  //
  // Automatic writes ROTATE across AUTOSAVE_SLOTS files rather than reusing
  // one: 1, 2, 3, then back over 1, 2, 3... so the player always has the last
  // three autosaves to fall back to instead of a single file that a bad
  // stretch of play (or a corrupt write) overwrites with no way back.
  const AUTOSAVE_SLOTS = 3;
  let   autoSlots = [];    // rotation file ids, index-aligned with autoIndex
  let   autoIndex = 0;     // which rotation file the NEXT automatic save writes
  // Set when a save predating autoSlot is loaded. Such a world has no record
  // of which file it autosaves to, so a fresh one is derived — deliberately
  // NOT the file just loaded, which for all we know is a snapshot the player
  // made. The file they were on therefore stops updating, and they need to be
  // told rather than discovering it later.
  let   autoSlotMigrated = false;
  let   lastSaveError = null; // human-readable reason the last save() failed, or null
  let   lastSaveOkAt  = 0;    // Date.now() of the last save() that succeeded this session (manual, F2 or autosave)

  function slotStorageKey(id) { return SLOT_PREFIX + id; }

  // Permadeath worlds keep exactly ONE file: no rotation to fall back on, no
  // daily snapshots, no named saves or exports. The game writes that file
  // itself (interval, F2, exit hooks), and if the world's Advanced Reactor
  // detonates, deleteWorld() removes it — see Difficulty.
  const _iron = () => typeof Difficulty !== 'undefined' && Difficulty.permadeath();
  const _slotCount = () => _iron() ? 1 : AUTOSAVE_SLOTS;

  // Display name for rotation file i, used both as the folder-mode filename
  // and as the browser-mode slot label so the three are told apart on sight.
  //
  // A world that predates the rotation carries the old unnumbered
  // "Autosave - (City).json" in its save data; resolveAutoSlots() keeps that
  // file as rotation slot 1 rather than renaming it, so such a world ends up
  // with one unnumbered file and two numbered ones. That is deliberate —
  // starting a fresh "Autosave 1" instead would leave the file holding their
  // most recent progress orphaned in the folder.
  function autoSlotName(i) {
    const city = (typeof CityInfo !== 'undefined' && CityInfo.getCityName()) || 'Save';
    return `Autosave ${i + 1} - (${city})`;
  }

  // Fills in any rotation file this world doesn't have an id for yet and
  // returns the whole set. The ids are derived from the world (or the city
  // name, in folder mode) so they are stable across sessions and unique per
  // playthrough — reloading the same world keeps reusing the same three files
  // rather than growing new ones each time.
  //
  // Resolved fresh on every save rather than cached at new-game time. A
  // session can START on browser storage and switch to folder mode mid-game —
  // the save folder is only connected the first time the player opens SAVE
  // GAME — and the two modes use different id shapes. Caching them would mean
  // a localStorage-style id ('slot_1788..._412') getting handed to
  // FileSaves.write() verbatim once the folder connected, producing a file
  // with no .json extension that list() then can't see.
  function resolveAutoSlots() {
    if (_iron()) {
      // The world's own file, whichever store it lives in. A session that
      // began on browser storage and connected a folder later needs a real
      // .json name before FileSaves.write() will make a visible file.
      let f = autoSlots[0] || currentSlot;
      if (FolderMode.active() && !(typeof f === 'string' && /\.json$/i.test(f))) f = newSlotId();
      autoSlots = f ? [f] : [];
      return autoSlots;
    }
    if (FolderMode.active()) {
      for (let i = 0; i < AUTOSAVE_SLOTS; i++) {
        // Already pointing at a real file in the folder — keep using it.
        if (typeof autoSlots[i] === 'string' && /\.json$/i.test(autoSlots[i])) continue;
        // Session started on browser storage and the folder was connected
        // later, or a world was loaded without recorded autosave files:
        // derive stable names rather than handing FileSaves.write() a
        // localStorage-style id, which it would use verbatim as a filename
        // with no .json extension — invisible to list(). Two playthroughs of
        // the same city name in one folder share these files by design.
        autoSlots[i] = FileSaves.fileNameFor(autoSlotName(i));
      }
      return autoSlots;
    }
    // Browser storage: the slot minted for this world at new-game time is
    // already the world's own unnamed file, so it stays rotation file 1 and
    // the other two hang off its id — stable per world, and unmistakably this
    // world's rather than a name another city could collide with.
    const base = autoSlots[0] || (currentWorld ? 'auto_' + currentWorld : null);
    if (!base) return [];
    autoSlots[0] = base;
    for (let i = 1; i < AUTOSAVE_SLOTS; i++) {
      if (!autoSlots[i]) autoSlots[i] = base + '_auto' + (i + 1);
    }
    return autoSlots;
  }

  // The world's Quicksave file: where a bare save that isn't the interval
  // (F2, the exit hooks, Save & Quit) writes, so only the interval touches
  // the autosave rotation. Named like the rotation files, by city in folder
  // mode and hung off the world's own id in browser storage.
  function quickSlotName() {
    const city = (typeof CityInfo !== 'undefined' && CityInfo.getCityName()) || 'Save';
    return `Quicksave - (${city})`;
  }
  function resolveQuickSlot() {
    if (_iron()) return resolveAutoSlot();
    if (FolderMode.active()) return FileSaves.fileNameFor(quickSlotName());
    const base = resolveAutoSlots()[0];
    return base ? base + '_quick' : null;
  }

  // The single file the NEXT automatic save writes.
  function resolveAutoSlot() {
    const slots = resolveAutoSlots();
    return slots[autoIndex] || slots[0] || null;
  }

  // Steps the rotation on after an automatic write: 1 → 2 → 3 → 1. Only
  // automatic saves advance it; an explicit player save names its own file
  // and leaves the rotation where it was.
  function advanceAutoSlot() {
    autoIndex = (autoIndex + 1) % _slotCount();
  }

  // Synchronous crash-net for folder mode — see the comment in save().
  const MIRROR_PREFIX = 'powergrid_mirror_';
  function mirrorKey(id) { return MIRROR_PREFIX + id; }

  // Replays any folder write that didn't complete (page closed mid-write).
  // Runs at startup, before the folder listing is shown, so a recovered save
  // appears in the menus exactly like a normal one. Returns how many it wrote.
  async function flushPendingMirrors() {
    if (!FolderMode.active()) return 0;
    let flushed = 0;
    const pending = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(MIRROR_PREFIX)) pending.push(k);
      }
    } catch (_e) { return 0; }
    for (const k of pending) {
      const id = k.slice(MIRROR_PREFIX.length);
      try {
        const json = localStorage.getItem(k);
        // A mirror left behind does not prove the write was lost — the page
        // can die between the file landing and the mirror being cleared. Only
        // replay one that is actually newer than what is on disk, so booting
        // the game stops rewriting a save file (and announcing a "recovery")
        // for a write that completed perfectly well last session.
        if (json && await _mirrorIsNewer(id, json)) {
          if (await FileSaves.write(id, json)) flushed++;
        }
        localStorage.removeItem(k);
      } catch (err) {
        console.warn('Could not recover pending save', id, err);
      }
    }
    if (flushed) await FolderMode.refresh();
    return flushed;
  }

  // True when the mirrored copy holds progress the file on disk does not.
  // An unreadable or unparseable file counts as newer — that is the case the
  // crash-net exists for.
  async function _mirrorIsNewer(id, json) {
    let mirrorAt = 0;
    try { mirrorAt = JSON.parse(json)._savedAt || 0; } catch (_e) { return false; }
    try {
      const onDisk = await FileSaves.read(id);
      if (!onDisk) return true;
      const diskAt = JSON.parse(onDisk)._savedAt || 0;
      return mirrorAt > diskAt;
    } catch (_e) {
      return true;
    }
  }

  // ── Folder mode bridge ───────────────────────────────────────────
  // When the player has connected a save folder, saves become .json files in
  // it instead of localStorage rows. The menus are synchronous but the File
  // System Access API is not, so a snapshot of the folder listing is kept here
  // and refreshed after every write/delete. refresh() must be awaited before
  // the UI reads listSlots() if the folder may have changed underneath us.
  const FolderMode = (() => {
    let cache = [];
    let lastWriteError = null;

    const available = () => typeof FileSaves !== 'undefined' && FileSaves.isSupported();
    const active    = () => typeof FileSaves !== 'undefined' && FileSaves.isConnected();

    async function refresh() {
      if (!active()) { cache = []; return cache; }
      cache = await FileSaves.list();
      return cache;
    }

    // Tracks the newest in-flight write so callers that are about to navigate
    // away (main menu, loading another save) can await it instead of relying
    // on the beforeunload crash-net.
    let inFlight = Promise.resolve(true);

    function writeSave(fileName, jsonText, data) {
      inFlight = FileSaves.write(fileName, jsonText, data).then(async ok => {
        // Say why when it is known — "could not write" alone leaves the player
        // nothing to act on.
        const why = ok ? null : (FileSaves.lastError && FileSaves.lastError());
        lastWriteError = ok ? null : ('Could not write to the save folder' + (why ? ` (${why})` : ''));
        if (ok) await refresh();
        return ok;
      });
      return inFlight;
    }

    return {
      available, active, refresh, writeSave,
      pendingWrite: () => inFlight,
      list: () => cache,
      error: () => lastWriteError,
      clearError: () => { lastWriteError = null; },
    };
  })();

  function readSlotIndex() {
    try {
      const raw = localStorage.getItem(SLOTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function writeSlotIndex(idx) {
    localStorage.setItem(SLOTS_KEY, JSON.stringify(idx));
  }

  // One-time migration: fold a pre-multi-slot single save into slot form
  // so existing players don't lose their city the first time this loads.
  function migrateLegacySave() {
    if (readSlotIndex().length) return;
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return;
    const id = 'slot_' + Date.now();
    let meta = { id, cityName: 'New Haven', companyName: 'Gridworks Power Co.', savedAt: Date.now() };
    try {
      const d = JSON.parse(legacyRaw);
      if (d && d.cityInfo) {
        meta.cityName    = d.cityInfo.cityName    || meta.cityName;
        meta.companyName = d.cityInfo.companyName || meta.companyName;
      }
      if (d && d._savedAt) meta.savedAt = d._savedAt;
    } catch {}
    localStorage.setItem(slotStorageKey(id), legacyRaw);
    writeSlotIndex([meta]);
    localStorage.removeItem(LEGACY_KEY);
  }

  function listSlots() {
    if (FolderMode.active()) return FolderMode.list();
    migrateLegacySave();
    return readSlotIndex().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  }

  // In folder mode a "slot id" is the .json filename on disk, so it's built
  // from the city name and a timestamp — readable in the file browser, and
  // unique per save. Otherwise it's an opaque localStorage key.
  function newSlotId(displayName, cityOverride) {
    if (FolderMode.active()) {
      const city = cityOverride
        || ((typeof CityInfo !== 'undefined') ? CityInfo.getCityName() : 'Save');
      // A player-typed name becomes the filename directly; otherwise fall back
      // to city + timestamp.
      const base = displayName
        ? FileSaves.fileNameFor(displayName)
        : FileSaves.newFileName(city, Date.now());
      // The timestamp only resolves to the second, so two saves made in the
      // same second would produce identical filenames and the second would
      // silently overwrite the first instead of creating a new file. Suffix
      // until the name is free.
      const taken = new Set(FolderMode.list().map(s => s.fileName));
      if (!taken.has(base)) return base;
      const stem = base.replace(/\.json$/i, '');
      for (let n = 2; n < 1000; n++) {
        const candidate = `${stem} (${n}).json`;
        if (!taken.has(candidate)) return candidate;
      }
      return `${stem}_${Math.floor(Math.random() * 1e6)}.json`;
    }
    return 'slot_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  }

  function createSlot(cityName, companyName) {
    const id = newSlotId();
    if (FolderMode.active()) {
      // Nothing to pre-register — the file appears on the first save(), and
      // the folder listing is the index.
      currentSlot  = id;
      currentWorld = id;
      // The autosave files are named the SAME way here as in
      // resolveAutoSlots()'s fallback. They used to take newSlotId()'s
      // "<City>_<timestamp>.json", which is indistinguishable from a save the
      // player made themselves — so the files the game rewrites every 30
      // seconds looked like snapshots, in the folder and in the load list alike.
      autoSlots = [];
      autoIndex = 0;
      resolveAutoSlots();
      return id;
    }
    const idx = readSlotIndex();
    // worldId groups every save branched from the same playthrough. A brand
    // new world seeds it from its own slot id; saveAsNew() then carries that
    // same worldId onto each branch, so the in-game save picker can offer
    // "this world's files" rather than every unrelated city.
    idx.push({ id, worldId: id, cityName: cityName || 'New Haven', companyName: companyName || 'Gridworks Power Co.', savedAt: Date.now() });
    writeSlotIndex(idx);
    currentSlot  = id;
    currentWorld = id;
    // A new game autosaves over its own starting file first, then rotates
    // onto the two sibling files resolveAutoSlots() derives from it.
    autoSlots    = [id];
    autoIndex    = 0;
    return id;
  }

  // Which world a save belongs to, from whichever store actually holds it.
  //
  // Folder saves are NOT in the localStorage slot index — the file is its own
  // record, and FileSaves.list() reads the worldId back out of it. Consulting
  // only the index therefore drew a blank for every folder save and left the
  // caller falling back to the save's own id as its world, so each file
  // looked like a separate one-file world: the in-game SAVE GAME picker
  // filters on that, and reported "No save files for this world yet" to
  // players with a folder full of them.
  function worldIdFor(id) {
    if (FolderMode.active()) {
      const f = FolderMode.list().find(s => s.id === id);
      if (f && f.worldId) return f.worldId;
    }
    const meta = readSlotIndex().find(s => s.id === id);
    return (meta && meta.worldId) || null;
  }

  // Every slot sharing the active world's worldId, newest first. Slots saved
  // before worldId existed fall back to their own id, so each older save is
  // simply its own one-file world rather than disappearing from the picker.
  function listWorldSlots() {
    const wid = currentWorld;
    if (!wid) return [];
    return listSlots().filter(s => (s.worldId || s.id) === wid);
  }

  // Removes a save wherever it lives. Returns a promise the caller MUST await
  // before re-rendering: in folder mode the file removal and the cache refresh
  // are async, so a synchronous re-render used to redraw the list off the old
  // cache and the deleted save appeared to still be there.
  //
  // Both stores are cleared regardless of the active mode. A session can hold
  // browser-storage worlds and folder worlds at the same time, and deleting
  // "the file" while leaving the browser-storage copy (or the crash-net
  // mirror) behind is how a deleted save comes back on the next launch.
  async function deleteSlot(id) {
    if (!id) return false;
    let ok = false;
    if (FolderMode.active() && /\.json$/i.test(id)) {
      ok = await FileSaves.remove(id);
      await FolderMode.refresh();
    }
    try {
      if (localStorage.getItem(slotStorageKey(id)) != null) {
        localStorage.removeItem(slotStorageKey(id));
        ok = true;
      }
      writeSlotIndex(readSlotIndex().filter(s => s.id !== id));
      localStorage.removeItem(mirrorKey(id));   // crash-net copy, else startup resurrects it
    } catch (_e) {}
    if (currentSlot === id) currentSlot = null;
    // Forget the deleted file so it is re-derived rather than kept as a live
    // rotation target with nothing behind it. Deleting a file the rotation is
    // about to come back round to is fine — that is what rotation does — but
    // the one it is about to write NEXT is different: the next tick would put
    // it straight back, which is not what "delete" means.
    const _rot = autoSlots.indexOf(id);
    if (_rot !== -1) {
      autoSlots[_rot] = null;
      if (_rot === autoIndex) stopAutosave();
    }
    return ok;
  }

  // Imports a raw save JSON string as a brand-new slot (never overwrites
  // an existing one) so importing a file can't clobber another world.
  // Throws on failure so the caller can tell the player what actually went
  // wrong: a SyntaxError means the file really is not a save, and a
  // QuotaExceededError means the file is fine but browser storage is too
  // small for it. Reporting both as "Invalid save file" is how a perfectly
  // good multi-megabyte city looked corrupt on every import attempt.
  // What a file's text has to be before it is treated as a save. Throws a
  // plain Error with a message for the player when it is not one; returns the
  // cleaned text and the parsed save when it is. A byte-order mark (which
  // some editors and sync tools add) would make JSON.parse reject an
  // otherwise perfect save, so it is dropped first.
  function readImport(rawText) {
    const text = String(rawText == null ? '' : rawText).replace(/^\uFEFF/, '');
    if (!text.trim()) {
      throw new Error('That file is empty (0 bytes): it is a save that was interrupted while being written, so there is nothing in it to load');
    }
    const data = JSON.parse(text);   // SyntaxError: not readable save data
    if (!data || typeof data !== 'object' || !Array.isArray(data.grid)) {
      throw new Error('That file is JSON, but it is not a GRIDWORKS save (no world in it)');
    }
    if (!data.grid.length) throw new Error('That save contains no world data');
    return { text, data };
  }

  async function importSlot(rawText) {
    const { text: jsonText, data } = readImport(rawText);
    const city = (data.cityInfo && data.cityInfo.cityName) || 'Imported City';

    // Folder mode: the file on disk IS the slot, and the folder has no
    // few-megabyte ceiling. A real city serialises to well past what
    // localStorage will hold, so this is the only path that can import one.
    if (FolderMode.active()) {
      const id = newSlotId(null, city);
      const ok = await FolderMode.writeSave(id, jsonText);
      if (!ok) throw new Error(FolderMode.error() || 'Could not write to the save folder');
      return id;
    }

    const id = newSlotId();
    localStorage.setItem(slotStorageKey(id), jsonText);
    const idx = readSlotIndex();
    idx.push({
      id,
      worldId: id,   // an imported file starts its own world

      cityName:    city,
      companyName: (data.cityInfo && data.cityInfo.companyName) || 'Gridworks Power Co.',
      savedAt:     data._savedAt || Date.now(),
    });
    writeSlotIndex(idx);
    return id;
  }

  function exportSlotRaw(id) {
    return localStorage.getItem(slotStorageKey(id));
  }

  function getCurrentSlot() { return currentSlot; }
  function setCurrentSlot(id) {
    currentSlot = id;
    currentWorld = worldIdFor(id) || id;
  }

  // ── Serialise ────────────────────────────────────────────────────
  // Serialises one entity to its saved form. Hoisted to module scope (it
  // is a pure function of the entity) so ContractSystem can reuse it for
  // a job site held in a contract snapshot — a second, hand-written
  // serialiser would silently drop whatever fields it forgot.
  // Both reactor types carry identical per-entity state (fuel buffer, cask
  // store, core heat, pressure), so one branch serialises both.
  const _isReactor = (e) => e.type === T.NUCLEARREACTOR || e.type === T.ADVREACTOR;
  // Turbine / shaft water captures, minus the cached live water ref
  // (t.entity) — that is runtime-only and must never reach the save.
  const _waterSnapshot = (arr) => arr && arr.map(({ entity, ...t }) => t);

  // Rebuilds the layers a saved entity was laid over. A save records them as
  // markers on the top entity (`_underPipe: 'pipe'`, `_underWire: true`,
  // `_underConveyor: true`), never as entities, so every place that turns a
  // saved record back into an entity has to come through here: the home
  // world's load and a contract site's rebuild (which used to copy the
  // markers across raw and lose the layer). Any top type may carry any
  // other layer; it is never given a second layer of its own kind.
  function reviveStack(entity, s) {
    const isPipeTop = entity.type === T.PIPE || entity.type === T.UNDERGNDPIPE;
    entity._underPipe = null; entity._underWire = null; entity._underConveyor = null;
    if (s._underPipe && !isPipeTop) {
      const pipeType = (typeof s._underPipe === 'string' && EntityDefs[s._underPipe]) ? s._underPipe : T.PIPE;
      const pipe = new Entity(pipeType, s.col, s.row);
      if (pipeType === T.PIPE && s._pipeLinks !== undefined) pipe._links = s._pipeLinks;
      entity._underPipe = pipe;
    }
    if (s._underWire && entity.type !== T.WIRE)         entity._underWire     = new Entity(T.WIRE, s.col, s.row);
    if (s._underConveyor && entity.type !== T.CONVEYOR) {
      entity._underConveyor = new Entity(T.CONVEYOR, s.col, s.row);
      if (s._beltLinks !== undefined) entity._underConveyor._links = s._beltLinks;
      const sp = s._beltSplit;
      if (sp) {
        const b = initSplitter(entity._underConveyor, sp);
        b._links = undefined;
        if (sp.auto) { b._autoSplit = true; if (sp.pre !== undefined) b._preSplitLinks = sp.pre; }
      }
    }
  }

  // What `new Entity(type)` starts with, per type. A field still at that
  // value is left out of the file: load() and the contract-site rebuild both
  // start from a new Entity and only copy fields that are present, so the
  // entity comes back identical. Trees, bushes, wires and pipes are most of a
  // map, and each used to carry charge/dailyFee/commercialSubtype/
  // businessName/_path:null, reliability:100 and wear:0 — about half of
  // every save file.
  const _defaultsByType = new Map();
  function _entityDefaults(type) {
    let d = _defaultsByType.get(type);
    if (d === undefined) {
      try { d = new Entity(type, 0, 0); } catch (_e) { d = null; }
      _defaultsByType.set(type, d);
    }
    return d;
  }

  function serialiseEntity(e) {
    // Layers are kept flat on the top entity, but flatten here too so a
    // stack nested by an older build is still written out whole.
    if (e._underPipe || e._underWire || e._underConveyor) GridManager.flattenStack(e);
    const d = _entityDefaults(e.type);
    const keep = (k) => !d || e[k] !== d[k];
    // Built field by field, keeping only the ones with a value. It used to
    // be one object literal of every field any entity type can have (~230,
    // nearly all undefined for a given entity), and creating that for each
    // of the ~27k entities on a big map was most of a one-second freeze on
    // every save. JSON.stringify drops undefined fields anyway, so the file
    // written is the same, key for key and in the same order.
    const o = {};
    let v;
    if ((v = e.type) !== undefined) o.type = v;
    if ((v = e.col) !== undefined) o.col = v;
    if ((v = e.row) !== undefined) o.row = v;
    if ((v = e._num) !== undefined) o._num = v;
    // Shaft's def footprint defaults to 3x1, so a vertical shaft's
    // width of 1 must always be saved explicitly — omitting it (as
    // the "!== 1" shorthand below does for every other entity, whose
    // def defaults to 1x1) would let it fall back to the def's width
    // of 3 on load, corrupting a 1x3 vertical shaft into 3x3.
    // A truck the same: put down facing east it is 3×1, and with the height
    // left out it loaded as 3×3 (the type's height is 3).
    if ((v = e.type === T.SHAFT || e.type === T.TRUCK ? e.width : (e.width  !== 1 ? e.width  : undefined)) !== undefined) o.width = v;
    if ((v = e.type === T.SHAFT || e.type === T.TRUCK ? e.height : (e.height !== 1 ? e.height : undefined)) !== undefined) o.height = v;
    if ((v = e.charge) !== undefined && keep('charge')) o.charge = v;
    // Circuit Switch: the roster is coordinates (object refs don't
    // survive a round trip) plus whether the breaker is open.
    if ((v = (e.type === T.CIRCUITSWITCH || e.type === T.CIRCUITSWITCH2) ? !!e._switchOpen : undefined) !== undefined) o._switchOpen = v;
    if ((v = e.type === T.CIRCUITSWITCH2 && e._autoMode === false ? false : undefined) !== undefined) o._autoMode = v;
    if ((v = e.type === T.CIRCUITSWITCH2 && e._autoTripped ? true : undefined) !== undefined) o._autoTripped = v;
    if ((v = (e.type === T.CIRCUITSWITCH || e.type === T.CIRCUITSWITCH2) && e._members && e._members.length
           ? e._members.map(m => ({ c: m.c, r: m.r })) : undefined) !== undefined) o._members = v;
    if ((v = e.dailyFee) !== undefined && keep('dailyFee')) o.dailyFee = v;
    if ((v = e.reliability) !== undefined && keep('reliability')) o.reliability = v;
    if ((v = e.commercialSubtype) !== undefined && keep('commercialSubtype')) o.commercialSubtype = v;
    if ((v = e.houseWealthTier) !== undefined) o.houseWealthTier = v;
    if ((v = e.businessName) !== undefined && keep('businessName')) o.businessName = v;
    if ((v = e.fromRequest) !== undefined) o.fromRequest = v;
    if ((v = e.upfrontPaid) !== undefined) o.upfrontPaid = v;
    if ((v = e.demandScale) !== undefined) o.demandScale = v;
    if ((v = e._placedAt) !== undefined) o._placedAt = v;
    if ((v = e._movedIn) !== undefined) o._movedIn = v;
    if (e._constructing) o._build = [e._buildDone || 0, e._buildTotal || 0, e._siteKW ?? null];
    if ((v = e._paid) !== undefined) o._paid = v;
    if ((v = e._lightningDamaged || undefined) !== undefined) o._lightningDamaged = v;
    if ((v = e._fireOut          || undefined) !== undefined) o._fireOut = v;
    if ((v = e._strikesAbsorbed  || undefined) !== undefined) o._strikesAbsorbed = v;
    if ((v = e._repairRemaining  || undefined) !== undefined) o._repairRemaining = v;
    if ((v = e._repairTotal      || undefined) !== undefined) o._repairTotal = v;
    if ((v = e._rebuildFrac      || undefined) !== undefined) o._rebuildFrac = v;
    if ((v = e._irreparable      || undefined) !== undefined) o._irreparable = v;
    if ((v = e._irreparable ? e._blastDir : undefined) !== undefined) o._blastDir = v;
    if ((v = e._pumpTripped      || undefined) !== undefined) o._pumpTripped = v;
    if ((v = e._pumpTripped ? e._pumpRestart : undefined) !== undefined) o._pumpRestart = v;
    // A cooling tower's basin reserve, kept only while it's drawn down (a
    // full or missing one is worked out again on the tower's first tick).
    if (typeof e._waterReserve === 'number' && e._waterReserve < CoolingTowerSystem.RESERVE_SECONDS) o._waterReserve = +e._waterReserve.toFixed(1);
    // A cooling tower's steam plume (CoolingTowerPlume): how built up it is,
    // so a reload carries on with the plume as it stood rather than growing
    // every tower's from nothing.
    if ((v = (e.type === T.COOLINGTOWER || e.type === T.COOLINGTOWER2) ? e._plumeLvl : undefined) !== undefined) o._plumeLvl = +v.toFixed(3);
    if ((v = (e.type === T.COOLINGTOWER || e.type === T.COOLINGTOWER2) ? e._plumeReach : undefined) !== undefined) o._plumeReach = +v.toFixed(3);
    // A government building's power record (GovernmentSystem's approval
    // tick): whether it has ever had power, and how long it has gone
    // without. Unsaved, every load handed a building left dark a fresh
    // grace period (five minutes for a national one), so one never wired
    // up cost no approval until it had sat through another, and a building
    // that had lost its power was treated as one just placed.
    if (_GOV_POWER_TYPES.has(e.type)) {
      if (e._everPowered) o._everPowered = true;
      if (e._unconnectedTicks > 0) o._unconnectedTicks = e._unconnectedTicks;
    }
    if ((v = e._fireSpreadT      || undefined) !== undefined) o._fireSpreadT = v;
    if ((v = e._genBurnT         || undefined) !== undefined) o._genBurnT = v;
    if ((v = e._surgeRemaining   || undefined) !== undefined) o._surgeRemaining = v;
    if ((v = e._surgeTotal       || undefined) !== undefined) o._surgeTotal = v;
    if ((v = e._surgePeak        || undefined) !== undefined) o._surgePeak = v;
    if ((v = e._graceElapsed) !== undefined) o._graceElapsed = v;
    if ((v = e._churnTimer) !== undefined) o._churnTimer = v;
    if ((v = e._churnWarned) !== undefined) o._churnWarned = v;
    if ((v = e._outageTimer) !== undefined) o._outageTimer = v;
    if ((v = e._outageWarned) !== undefined) o._outageWarned = v;
    if ((v = e._wx) !== undefined) o._wx = v;
    if ((v = e._wy) !== undefined) o._wy = v;
    if ((v = e._angle) !== undefined) o._angle = v;
    if ((v = e._vx) !== undefined) o._vx = v;
    if ((v = e._vy) !== undefined) o._vy = v;
    if (e._path) o._path = JSON.parse(JSON.stringify(e._path));
    if ((v = e._patrolIdx) !== undefined) o._patrolIdx = v;
    if ((v = e._patrolling) !== undefined) o._patrolling = v;
    if ((v = e.type === T.TRUCK ? (e._cargoAmount || 0) : undefined) !== undefined) o._cargoAmount = v;
    if ((v = e.type === T.TRUCK ? e._cargoFacility : undefined) !== undefined) o._cargoFacility = v;
    if ((v = e.type === T.TRUCK ? e._cargoLabel : undefined) !== undefined) o._cargoLabel = v;
    if ((v = e.type === T.TRUCK ? e._fuel : undefined) !== undefined) o._truckFuel = v;
    if ((v = e.type === T.TRUCK && e._destQueue ? JSON.parse(JSON.stringify(e._destQueue)) : undefined) !== undefined) o._destQueue = v;
    if ((v = e.type === T.TRUCK ? e._queueIdx : undefined) !== undefined) o._queueIdx = v;
    if ((v = e.type === T.TRUCK ? !!e._queueLoop : undefined) !== undefined) o._queueLoop = v;
    if ((v = e.type === T.TRUCK ? !!e._autoDispatch : undefined) !== undefined) o._autoDispatch = v;
    if ((v = e.type === T.TRUCK && e._autoDispatch ? !!e._legDone : undefined) !== undefined) o._legDone = v;
    // A truck loaded a moment ago is only pending until its first tick, and one
    // back home doesn't tick while the player is on a job site. Saving that as
    // "off" switched a Waste Truck's automation off for good.
    if ((v = e.type === T.TRUCK ? !!(e._autoHaulEnabled || e._autoHaulPendingEnable) : undefined) !== undefined) o._autoHaulEnabled = v;
    if ((v = e.type === T.TRUCK ? e._autoHaulJob : undefined) !== undefined) o._autoHaulJob = v;
    if ((v = e.type === T.TRUCK ? e._name : undefined) !== undefined) o._name = v;
    // Hauler (a T.TRUCK flagged _hauler; see truckSpec in entity_defs.js)
    if ((v = e.type === T.TRUCK && e._hauler ? true : undefined) !== undefined) o._hauler = v;
    if ((v = e.type === T.TRUCK && e._hauler && e._haulerOn === false ? false : undefined) !== undefined) o._haulerOn = v;
    if ((v = e.type === T.TRUCK && e._hauler ? (e._cargoKind || undefined) : undefined) !== undefined) o._cargoKind = v;
    if ((v = e.type === T.TRUCK && e._hauler ? (e._cargoMeta || undefined) : undefined) !== undefined) o._cargoMeta = v;
    if ((v = (e.type === T.SOLIDSTORAGE || e.type === T.OILSTORAGE || e.type === T.GASSTORAGE) ? (e._truckSupply || undefined) : undefined) !== undefined) o._truckSupply = v;
    if ((v = e.type === T.GASSTATION ? (e._fuelStored || 0) : undefined) !== undefined) o._fuelStored = v;
    if ((v = e.type === T.FUELGEN ? (e._fuelTank || 0) : undefined) !== undefined) o._fuelTank = v;
    if ((v = e.type === T.FUELGEN ? e._fgThrottle : undefined) !== undefined) o._fgThrottle = v;
    if ((v = e.type === T.FUELGEN ? (e._fgHeat || 0) : undefined) !== undefined) o._fgHeat = v;
    if ((v = e.type === T.FUELGEN ? (e._fgTrip || 0) : undefined) !== undefined) o._fgTrip = v;
    if ((v = e.type === T.FUELGEN ? (e._fgRpm || 0) : undefined) !== undefined) o._fgRpm = v;
    if ((v = e.type === T.FUELGEN ? !!e._fgIgnited : undefined) !== undefined) o._fgIgnited = v;
    // Last power state, so systems that read "was I powered last tick"
    // don't all see a blackout on the first ticks after a load.
    if ((v = e.powered ? true : undefined) !== undefined) o.powered = v;
    if ((v = e.coalAmount) !== undefined) o.coalAmount = v;
    if ((v = e.coalMax) !== undefined) o.coalMax = v;
    if ((v = e._revealed) !== undefined) o._revealed = v;
    if ((v = e._surveyProgress) !== undefined) o._surveyProgress = v;
    if ((v = e._surveyCooldown) !== undefined) o._surveyCooldown = v;
    if ((v = e._rotation) !== undefined) o._rotation = v;
    if ((v = e._coalBuffer) !== undefined) o._coalBuffer = v;
    // Ore mines' output buffers. A mine fills its buffer and then stops
    // extracting; without these it came back empty from every load and
    // dug another buffer's worth out of its deposit — an idle mine with
    // no belt drained its seam a few hundred units per reload.
    if ((v = e.type === T.URANIUMMINE ? (e._uraniumStored || 0) : undefined) !== undefined) o._uraniumStored = v;
    if ((v = isSulfurMine(e)          ? (e._sulfurStored  || 0) : undefined) !== undefined) o._sulfurStored = v;
    if ((v = e.type === T.LITHIUMMINE ? (e._lithiumStored || 0) : undefined) !== undefined) o._lithiumStored = v;
    if ((v = e.type === T.RAREEARTHMINE ? (e._rareEarthStored || 0) : undefined) !== undefined) o._rareEarthStored = v;
    // Leach Plant buffers: oxide, and the tailings that block its demolition.
    if ((v = e.type === T.LEACHPLANT ? (e._oxide    || 0) : undefined) !== undefined) o._oxide = v;
    if ((v = e.type === T.LEACHPLANT ? (e._tailings || 0) : undefined) !== undefined) o._tailings = v;
    if ((v = e.type === T.SCMILL ? (e._tape || 0) : undefined) !== undefined) o._tape = v;
    // Coke Oven: its coal bunker, coke store and oven gas.
    if (e.type === T.COKEOVEN) {
      o._coalBunker = e._coalBunker || 0;
      o._coke       = e._coke       || 0;
      o._ovenGas    = e._hydrogen   || 0;
    }
    // Graphitization Furnace: coke packed in the trough, graphite made.
    if (e.type === T.GRAPHITEFURNACE) { o._cokeStock = e._cokeStock || 0; o._graphite = e._graphite || 0; }
    // An Advanced Reactor's graphite reflector blocks.
    if (e.type === T.ADVREACTOR && e._graphite) o._graphite = e._graphite;
    // Core Works: its bays (each core's id, state, charge progress and wear),
    // tape on hand and the two switches.
    // Field Cores in a fusion reactor: installed cores, the outgoing bay, the
    // slots the player asked for, and a Hauler's cores aboard.
    if (e.type === T.HULKINGFUSIONREACTOR || e.type === T.ADVFUSIONREACTOR) {
      if (Array.isArray(e._cores) && e._cores.length) o._cores = JSON.parse(JSON.stringify(e._cores));
      if (e._coreOut) o._coreOut = { ...e._coreOut };
      if (e._coreSlots) o._coreSlots = e._coreSlots;
      if (e._coreFuelK !== undefined) o._coreFuelK = e._coreFuelK;
    }
    if (e.type === T.TRUCK && Array.isArray(e._coreCargo) && e._coreCargo.length) o._coreCargo = JSON.parse(JSON.stringify(e._coreCargo));
    if (e.type === T.COREWORKS) {
      o._tapeStock = e._tapeStock || 0;
      // Not a bay's _resv (the drone reserving it): it is a live reference,
      // and the drone's own saved job re-reserves the bay on load.
      if (Array.isArray(e._bays)) o._bays = JSON.parse(JSON.stringify(e._bays, (k, v) => (k === '_resv' ? undefined : v)));
      if (e._offPeak) o._offPeak = true;
      if (e._buildCores === false) o._buildCores = false;
    }
    if ((v = e._fuelled) !== undefined) o._fuelled = v;
    if ((v = e._hopperCoal) !== undefined) o._hopperCoal = v;
    if ((v = e._outputVariance) !== undefined) o._outputVariance = v;
    if ((v = e._coalRate) !== undefined) o._coalRate = v;
    // For mines: store deposit anchor so we can re-link on load
    if ((v = e.type === T.GEOTURBINE ? (e._linkedWell ? e._linkedWell.col : e._wellCol) : undefined) !== undefined) o._wellCol = v;
    if ((v = e.type === T.GEOTURBINE ? (e._linkedWell ? e._linkedWell.row : e._wellRow) : undefined) !== undefined) o._wellRow = v;
    if ((v = (e.type === T.COALMINE || e.type === T.COALMINE2 || e.type === T.URANIUMMINE || isSulfurMine(e) || e.type === T.LITHIUMMINE || e.type === T.RAREEARTHMINE || isHeliumWell(e) || e.type === T.GEOWELL) && e._linkedDeposit ? e._linkedDeposit.col : OilSystem.isPumpJack(e) && e._linkedDeposit ? e._linkedDeposit.col : e._depositCol) !== undefined) o._depositCol = v;
    if ((v = (e.type === T.COALMINE || e.type === T.COALMINE2 || e.type === T.URANIUMMINE || isSulfurMine(e) || e.type === T.LITHIUMMINE || e.type === T.RAREEARTHMINE || isHeliumWell(e) || e.type === T.GEOWELL) && e._linkedDeposit ? e._linkedDeposit.row : OilSystem.isPumpJack(e) && e._linkedDeposit ? e._linkedDeposit.row : e._depositRow) !== undefined) o._depositRow = v;
    if ((v = OilSystem.isPumpJack(e) && e._linkedDeposit ? e._linkedDeposit._pressure : e._depositPressure) !== undefined) o._depositPressure = v;
    if ((v = OilSystem.isPumpJack(e) && e._linkedDeposit ? e._linkedDeposit._tierLabel : e._depositTierLabel) !== undefined) o._depositTierLabel = v;
    if ((v = OilSystem.isPumpJack(e) && e._linkedDeposit ? e._linkedDeposit._oilPhase  : e._depositOilPhase) !== undefined) o._depositOilPhase = v;
    if ((v = OilSystem.isPumpJack(e) && e._linkedDeposit ? e._linkedDeposit._crudeBuffer : e._depositCrudeBuffer) !== undefined) o._depositCrudeBuffer = v;
    if ((v = OilSystem.isPumpJack(e) && e._linkedDeposit ? e._linkedDeposit._totalUnits : e._depositTotalUnits) !== undefined) o._depositTotalUnits = v;
    if ((v = undefined) !== undefined) o._aquiferCol = v;
    if ((v = undefined) !== undefined) o._aquiferRow = v;
    if ((v = undefined) !== undefined) o._aquiferWidth = v;
    if ((v = undefined) !== undefined) o._aquiferHeight = v;
    if ((v = undefined) !== undefined) o._aquiferRate = v;
    if ((v = e.type === T.WATEREXTRACTOR ? (e._lakeConnected || false) : undefined) !== undefined) o._lakeConnected = v;
    // Client-owned job-site plant. Without this the protection is lost
    // on the first save/reload mid-contract and the client's buildings
    // become bulldozable (and refundable) again.
    if ((v = e._clientOwned || undefined) !== undefined) o._clientOwned = v;
    // The client's fuel depot on a job site (ContractSystem.ensureFuelDepot).
    if ((v = e._fuelDepot || undefined) !== undefined) o._fuelDepot = v;
    // A cleanup job's waste unit: without it the unit counts as player plant
    // and its ash drops out of the haul-out clause, which then reads done.
    if ((v = e._decommissioned || undefined) !== undefined) o._decommissioned = v;
    if ((v = e._waterBuffer) !== undefined) o._waterBuffer = v;
    if ((v = e._waterTank) !== undefined) o._waterTank = v;
    // Dam-specific (irregular footprint stored as _spanTiles)
    if ((v = e.type === T.DAM ? e._spanTiles : undefined) !== undefined) o._spanTiles = v;
    if ((v = (e.type === T.DAM || e.type === T.HYDROTURBINE) ? e._flowDc : undefined) !== undefined) o._flowDc = v;
    if ((v = (e.type === T.DAM || e.type === T.HYDROTURBINE) ? e._flowDr : undefined) !== undefined) o._flowDr = v;
    if ((v = (e.type === T.DAM || e.type === T.HYDROTURBINE) ? e._reservoirId : undefined) !== undefined) o._reservoirId = v;
    if ((v = e.type === T.DAM ? e._reservoirSide : undefined) !== undefined) o._reservoirSide = v;
    if ((v = e.type === T.HYDROTURBINE ? e._damCol : undefined) !== undefined) o._damCol = v;
    if ((v = e.type === T.HYDROTURBINE ? e._damRow : undefined) !== undefined) o._damRow = v;
    if ((v = (e.type === T.HYDROTURBINE || e._filled || e._bridge || e._waterFooting) ? _waterSnapshot(e._waterTiles) : undefined) !== undefined) o._waterTiles = v;
    // Built over water (water_build.js): a bridge spans live water, a
    // filled building took it off the map. _waterTiles gives it back.
    if ((v = e._bridge ? true : undefined) !== undefined) o._bridge = v;
    if ((v = e._filled ? true : undefined) !== undefined) o._filled = v;
    if ((v = e._waterFooting ? true : undefined) !== undefined) o._waterFooting = v;
    if ((v = e.type === T.HYDROTURBINE ? e._outSideDc : undefined) !== undefined) o._outSideDc = v;
    if ((v = e.type === T.HYDROTURBINE ? e._outSideDr : undefined) !== undefined) o._outSideDr = v;
    if ((v = e.type === T.HYDROGENERATOR ? e._inSideDc : undefined) !== undefined) o._inSideDc = v;
    if ((v = e.type === T.HYDROGENERATOR ? e._inSideDr : undefined) !== undefined) o._inSideDr = v;
    if ((v = e.type === T.SHAFT ? e._orientation : undefined) !== undefined) o._orientation = v;
    if ((v = (e.type === T.UNDERGNDPIPE || e._udgBelt) ? e._udgAxis : undefined) !== undefined) o._udgAxis = v;
    if ((v = (e.type === T.UNDERGNDPIPE || e._udgBelt) ? e._udgNeg : undefined) !== undefined) o._udgNeg = v;
    if ((v = (e.type === T.UNDERGNDPIPE || e._udgBelt) ? e._udgPos : undefined) !== undefined) o._udgPos = v;
    if ((v = e._udgBelt ? true : undefined) !== undefined) o._udgBelt = v;
    if (e._splitter) { o._splitter = true; o._splitMode = e._splitMode; o._splitSide = e._splitSide; o._splitRatio = e._splitRatio; if (e._placedSplitter) o._placedSplitter = true; }
    if (e._splitter && e._autoSplit) { o._autoSplit = true; if (e._preSplitLinks !== undefined) o._preSplitLinks = e._preSplitLinks; }
    // Drag-connected pipe sides (resource_helpers.js pipesJoin) — on the
    // pipe itself, or the pipe under a wire/conveyor. Absent = legacy
    // pipe that joins every neighbour.
    if ((v = e.type === T.PIPE ? e._links
           : (e._underPipe && e._underPipe.type === T.PIPE ? e._underPipe._links : undefined)) !== undefined) o._pipeLinks = v;
    // Drag-connected belt sides (resource_helpers.js beltsJoin) — on the belt
    // itself, or the belt under a pipe crossing. Absent = a belt that joins
    // every neighbour.
    if ((v = e.type === T.CONVEYOR ? e._links
           : (e._underConveyor ? e._underConveyor._links : undefined)) !== undefined) o._beltLinks = v;
    // A splitter under a pipe crossing: its settings, as _splitter etc. keep a top one's.
    if (e._underConveyor && e._underConveyor._splitter) {
      const b = e._underConveyor;
      o._beltSplit = { mode: b._splitMode, side: b._splitSide, ratio: b._splitRatio };
      if (b._placedSplitter) o._beltSplit.placed = true;
      if (b._autoSplit) { o._beltSplit.auto = true; if (b._preSplitLinks !== undefined) o._beltSplit.pre = b._preSplitLinks; }
    }
    if ((v = e.type === T.SHAFT ? _waterSnapshot(e._waterTiles) : undefined) !== undefined) o._waterTilesShaft = v;
    if ((v = e._crude) !== undefined) o._crude = v;
    if ((v = e.type === T.OILSTORAGE ? e._liquidType : undefined) !== undefined) o._liquidType = v;
    if ((v = e.type === T.SOLIDSTORAGE ? (e._stored || 0) : undefined) !== undefined) o._stored = v;
    if ((v = e.type === T.SOLIDSTORAGE ? (e._solidType || null) : undefined) !== undefined) o._solidType = v;
    if ((v = e.type === T.GASSTORAGE ? (e._gasType || null) : undefined) !== undefined) o._gasType = v;
    if ((v = e.type === T.GASSTORAGE ? GasStorageSystem.stored(e) : undefined) !== undefined) o._gasStored = v;
    if ((v = (e.type === T.SOLIDSTORAGE || e.type === T.OILSTORAGE || e.type === T.GASSTORAGE) ? (e._droneSupply || undefined) : undefined) !== undefined) o._droneSupply = v;
    if ((v = (e.type === T.SOLIDSTORAGE || e.type === T.OILSTORAGE || e.type === T.GASSTORAGE) ? (e._draining || undefined) : undefined) !== undefined) o._draining = v;
    // Kept on a client's bin even while it is momentarily empty: it is what marks the bin as one the client restocks.
    if ((v = e.type === T.SOLIDSTORAGE && (e._solidType === 'pellets' || (e._clientOwned && e._pelletMode)) ? (e._pelletMode || 'dt') : undefined) !== undefined) o._pelletMode = v;
    if ((v = e._depositWidth) !== undefined) o._depositWidth = v;
    if ((v = e._depositHeight) !== undefined) o._depositHeight = v;
    if ((v = e._biofuel) !== undefined) o._biofuel = v;
    if ((v = e._population) !== undefined) o._population = v;
    if ((v = e.familyName) !== undefined) o.familyName = v;
    if ((v = e._scanning) !== undefined) o._scanning = v;
    if ((v = e._scanProgress) !== undefined) o._scanProgress = v;
    if ((v = e._scanType) !== undefined) o._scanType = v;
    if ((v = e._scanPowerInput) !== undefined) o._scanPowerInput = v;
    if ((v = e._scanDuration) !== undefined) o._scanDuration = v;
    // Survey Station MK2: one entry per dish, null when free, else the
    // scan's { type, progress, duration, power } — copied so a later tick
    // can't mutate what was written.
    if (Array.isArray(v = e._scanSlots)) o._scanSlots = v.map(s => s ? { type: s.type, progress: s.progress || 0, duration: s.duration || 60, power: s.power || 0 } : null);
    // Deposits this mine was built over (input_manager _coverDeposits).
    // They own no grid tile while covered, so this snapshot is the only
    // record of them — drop it and the neighbouring seam is gone for good.
    if ((v = e._coveredDeposits && e._coveredDeposits.length
           ? JSON.parse(JSON.stringify(e._coveredDeposits)) : undefined) !== undefined) o._coveredDeposits = v;
    if ((v = e._linkedDeposit ? e._linkedDeposit.coalAmount : e._depositCoalAmount) !== undefined) o._depositCoalAmount = v;
    if ((v = e._linkedDeposit ? e._linkedDeposit.coalMax    : e._depositCoalMax) !== undefined) o._depositCoalMax = v;
    if ((v = e._amenityRequested) !== undefined) o._amenityRequested = v;
    if ((v = e._amenityDelay) !== undefined) o._amenityDelay = v;
    if ((v = e._amenityDone) !== undefined) o._amenityDone = v;
    if ((v = e._amenityType) !== undefined) o._amenityType = v;
    if ((v = e._zoneKey) !== undefined) o._zoneKey = v;   // the zone a requested Cell Tower / Fiber Hub / EV station belongs to
    if ((v = e._evDelay) !== undefined) o._evDelay = v;
    if ((v = e._evRequested) !== undefined) o._evRequested = v;
    if ((v = e._evDone) !== undefined) o._evDone = v;
    if ((v = e.wear) !== undefined && keep('wear')) o.wear = v;
    if (e.dust > 0.001) o.dust = e.dust;   // a dust storm's film on a solar panel
    if ((v = e._portRot) !== undefined) o._portRot = v;
    if ((v = e._fuelOil) !== undefined) o._fuelOil = v;
    if ((v = e.type === T.REFINERY ? (e._lpg || 0) : undefined) !== undefined) o._lpg = v;
    if ((v = e._crudeBuffer) !== undefined) o._crudeBuffer = v;
    if ((v = e._underPipe ? e._underPipe.type : undefined) !== undefined) o._underPipe = v;
    if ((v = e._underWire ? true : undefined) !== undefined) o._underWire = v;
    if ((v = e._underConveyor ? true : undefined) !== undefined) o._underConveyor = v;
    if ((v = e.type === T.CHEMICALPLANT ? (e._acid || 0) : undefined) !== undefined) o._acid = v;
    if ((v = e.type === T.ELECTROLYZER ? (e._hydrogen || 0) : undefined) !== undefined) o._hydrogen = v;
    if ((v = e.type === T.FUELPLANT ? (e._rods || 0) : undefined) !== undefined) o._rods = v;
    if ((v = e.type === T.FUELPLANT && e._truckAcid > 0 ? e._truckAcid : undefined) !== undefined) o._truckAcid = v;
    if ((v = e.type === T.FUELPLANT && e._truckUranium > 0 ? e._truckUranium : undefined) !== undefined) o._truckUranium = v;
    if ((v = e.type === T.LITHIUMPROCESSPLANT ? (e._compound || 0) : undefined) !== undefined) o._compound = v;
    if ((v = e.type === T.SPENTFUELPOOL     ? SpentFuelPoolSystem.serialise(e) : undefined) !== undefined) o._pool = v;
    if ((v = e.type === T.MOXPLANT          ? (e._mox || 0) : undefined) !== undefined) o._mox = v;
    if ((v = e.type === T.SOLAR3            ? (e._saltKWh || 0) : undefined) !== undefined) o._saltKWh = v;
    if ((v = e.type === T.DRONEPORT && typeof DroneSystem !== 'undefined' ? DroneSystem.serialiseFleet(e) : undefined) !== undefined) o._droneFleet = v;
    if ((v = e.type === T.REPROCESSOR       ? (e._plutonium || 0) : undefined) !== undefined) o._plutonium = v;
    if ((v = e.type === T.REPROCESSOR       ? (e._recovered || 0) : undefined) !== undefined) o._recovered = v;
    if ((v = e.type === T.REPROCESSOR       ? (e._hlw || 0) : undefined) !== undefined) o._hlw = v;
    if ((v = e.type === T.ATMOSCOLLECTOR ? (e._nitrogen || 0) : undefined) !== undefined) o._nitrogen = v;
    if ((v = e.type === T.HABERBOSCH ? (e._ammonia || 0) : undefined) !== undefined) o._ammonia = v;
    if ((v = e.type === T.WASHTOWER ? (e._deuterium || 0) : undefined) !== undefined) o._deuterium = v;
    if ((v = e.type === T.FUSIONFUELPLANT ? (e._plasma || 0) : undefined) !== undefined) o._plasma = v;
    if ((v = e.type === T.FUSIONFUELPLANT ? (e._he3Pellets || 0) : undefined) !== undefined) o._he3Pellets = v;
    if ((v = (e.type === T.HULKINGFUSIONREACTOR || e.type === T.ADVFUSIONREACTOR) ? (e._highBeta || 0) : undefined) !== undefined) o._highBeta = v;
    if ((v = (e.type === T.HULKINGFUSIONREACTOR || e.type === T.ADVFUSIONREACTOR) ? !!e._started : undefined) !== undefined) o._started = v;
    if ((v = (e.type === T.HULKINGFUSIONREACTOR || e.type === T.ADVFUSIONREACTOR) ? e._magnetK : undefined) !== undefined) o._magnetK = v;
    if ((v = (e.type === T.HULKINGFUSIONREACTOR || e.type === T.ADVFUSIONREACTOR) ? (e._heCharge || 0) : undefined) !== undefined) o._heCharge = v;
    if ((v = e.type === T.ADVFUSIONREACTOR ? (e._coilRepair || 0) : undefined) !== undefined) o._coilRepair = v;
    if ((v = (e.type === T.HULKINGFUSIONREACTOR || e.type === T.ADVFUSIONREACTOR) ? (e._heAsh || 0) : undefined) !== undefined) o._heAsh = v;
    if ((v = e.type === T.HULKINGFUSIONREACTOR ? (e._legacyCoolant || 0) : undefined) !== undefined) o._legacyCoolant = v;
    if ((v = e.type === T.HULKINGFUSIONREACTOR ? (e._corePellets || 0) : undefined) !== undefined) o._corePellets = v;
    if ((v = e.type === T.HULKINGFUSIONREACTOR && e._corePellets > 0 ? e._coreMode : undefined) !== undefined) o._coreMode = v;
    if ((v = (e.type === T.HULKINGFUSIONREACTOR || e.type === T.ADVFUSIONREACTOR) ? (e._quenchCount || 0) : undefined) !== undefined) o._quenchCount = v;
    if ((v = (e.type === T.HULKINGFUSIONREACTOR || e.type === T.FUSIONFUELPLANT) ? (e._fuelMode || 'dt') : undefined) !== undefined) o._fuelMode = v;
    if ((v = (e.type === T.HULKINGFUSIONREACTOR || e.type === T.FUSIONFUELPLANT || e.type === T.TRITIUMBREEDER) ? (e._tritium || 0) : undefined) !== undefined) o._tritium = v;
    if ((v = (e.type === T.FUSIONFUELPLANT || e.type === T.HE3SEPARATOR) ? (e._he3 || 0) : undefined) !== undefined) o._he3 = v;
    if ((v = e.type === T.FUSIONFUELPLANT ? (e._legacyHe3 || 0) : undefined) !== undefined) o._legacyHe3 = v;
    if ((v = isHeliumWell(e) ? (e._helium || 0) : undefined) !== undefined) o._helium = v;
    if ((v = e.type === T.CRYOPLANT ? (e._liquidHe || 0) : undefined) !== undefined) o._liquidHe = v;
    if ((v = e.type === T.CRYOPLANT ? !!e._tripped : undefined) !== undefined) o._tripped = v;
    if ((v = e.type === T.CRYOPLANT ? (e._restart || 0) : undefined) !== undefined) o._restart = v;
    if ((v = _isReactor(e) ? (e._rodBuffer || 0) : undefined) !== undefined) o._rodBuffer = v;
    if ((v = e.type === T.COALGENERATOR  ? (e._ashWaste || 0) : undefined) !== undefined) o._ashWaste = v;
    if ((v = e.type === T.COALGENERATOR  ? e._cgThrottle : undefined) !== undefined) o._cgThrottle = v;
    if ((v = (e.type === T.WIRE || e.type === T.POLE) && e._netName ? e._netName : undefined) !== undefined) o._netName = v;
    if ((v = e.type === T.COALGENERATOR  ? (e._cgPressure || 0) : undefined) !== undefined) o._cgPressure = v;
    if ((v = e.type === T.COALGENERATOR  ? (e._cgTrip || 0) : undefined) !== undefined) o._cgTrip = v;
    if ((v = (e.type === T.WIND || e.type === T.WIND2 || e.type === T.WIND3) && e._ice > 0 ? e._ice : undefined) !== undefined) o._ice = v;   // TurbineIcing
    if ((v = e._iceStopped ? true : undefined) !== undefined) o._iceStopped = v;
    if ((v = e.type === T.REFINERY       ? (e._sludgeWaste || 0) : undefined) !== undefined) o._sludgeWaste = v;
    if ((v = e._scrubber ? true : undefined) !== undefined) o._scrubber = v;
    if ((v = _isReactor(e) ? (e._spentFuel || 0) : undefined) !== undefined) o._spentFuel = v;
    if ((v = _isReactor(e) ? (e._coreHeat || 0) : undefined) !== undefined) o._coreHeat = v;
    if ((v = _isReactor(e) ? (e._heatRate || 0) : undefined) !== undefined) o._heatRate = v;
    if ((v = _isReactor(e) ? (e._steamPressure || 0) : undefined) !== undefined) o._steamPressure = v;
    if ((v = _isReactor(e) ? (e._meltdown || 0) : undefined) !== undefined) o._reactorMeltdown = v;
    return o;
  }

  function serialiseGrid() {
    const entities = [];
    const seen = new Set();

    // ONE walk of the grid, sorted into the lists the passes below read.
    // Each of those passes used to walk the whole grid itself — six walks of
    // well over a million tiles on a large map, which was most of the time a
    // save spent with the game frozen. The lists keep row-major order, so
    // what gets written (and in what order) is unchanged.
    const _aquifers = [], _oilDeps = [], _coalDeps = [], _coalMines = [], _pumpJacks = [];
    const _others = new Set();   // every non-water entity, in first-seen order
    {
      const tiles = GridManager.tiles;
      for (let r = 0; r < ROWS; r++) {
        const row = tiles[r];
        for (let c = 0; c < COLS; c++) {
          const e = row[c];
          if (!e || e.type === T.WATER) continue;
          // A truck parked by hand claims the tiles it stands on, hiding the
          // wire or road under it from this scan: save what is under it too,
          // or it is missing from the save.
          if (e.type === T.TRUCK) {
            for (const o of EntityRegistry.getInTileRect(c, r, c, r))
              if (o !== e && o.type !== T.TRUCK && o.type !== T.WATER && c >= o.col && c < o.col + (o.width || 1) && r >= o.row && r < o.row + (o.height || 1)) _others.add(o);
          }
          _others.add(e);
          if (e.col !== c || e.row !== r) continue;
          if      (e.type === T.AQUIFER)     _aquifers.push(e);
          else if (e.type === T.OILDEPOSIT)  _oilDeps.push(e);
          else if (e.type === T.COALDEPOSIT) _coalDeps.push(e);
          else if (e.type === T.COALMINE || e.type === T.COALMINE2) _coalMines.push(e);
          if (OilSystem.isPumpJack(e)) _pumpJacks.push(e);
        }
      }
    }

    // Save aquifer deposits
    for (const e of _aquifers) {
      if (seen.has(e)) continue;
      seen.add(e);
      entities.push({ type: e.type, col: e.col, row: e.row, width: e.width, height: e.height,
        _waterRate: e._waterRate, _tierLabel: e._tierLabel, _shapeMask: e._shapeMask, _hasMine: e._hasMine || false });
    }

    // Save oil deposits
    for (const e of _oilDeps) {
      if (seen.has(e)) continue;
      seen.add(e);
      entities.push({ type: e.type, col: e.col, row: e.row, width: e.width, height: e.height,
        _tierLabel: e._tierLabel, _oilPhase: e._oilPhase || 0, _pressure: e._pressure !== undefined ? e._pressure : 1.0,
        _totalUnits: e._totalUnits });
    }

    // Save uranium deposits — use EntityRegistry so deposits under mines are found
    for (const e of EntityRegistry.getByType(T.URANIUMDEPOSIT)) {
      if (seen.has(e)) continue;
      seen.add(e);
      entities.push({ type: e.type, col: e.col, row: e.row, width: e.width, height: e.height,
        _tierLabel: e._tierLabel, _uraniumPhase: e._uraniumPhase || 0,
        _oreAmount: e._oreAmount, _oreMax: e._oreMax });
    }

    // Save sulfur deposits — use EntityRegistry so deposits under mines are found
    for (const e of EntityRegistry.getByType(T.SULFURDEPOSIT)) {
      if (seen.has(e)) continue;
      seen.add(e);
      entities.push({ type: e.type, col: e.col, row: e.row, width: e.width, height: e.height,
        _tierLabel: e._tierLabel, _sulfurPhase: e._sulfurPhase || 0,
        _oreAmount: e._oreAmount, _oreMax: e._oreMax });
    }

    // Save lithium deposits — use EntityRegistry so deposits under mines are found
    for (const e of EntityRegistry.getByType(T.LITHIUMDEPOSIT)) {
      if (seen.has(e)) continue;
      seen.add(e);
      entities.push({ type: e.type, col: e.col, row: e.row, width: e.width, height: e.height,
        _tierLabel: e._tierLabel, _lithiumPhase: e._lithiumPhase || 0,
        _oreAmount: e._oreAmount, _oreMax: e._oreMax });
    }

    // Save rare earth deposits — use EntityRegistry so deposits under mines are found
    for (const e of EntityRegistry.getByType(T.RAREEARTHDEPOSIT)) {
      if (seen.has(e)) continue;
      seen.add(e);
      entities.push({ type: e.type, col: e.col, row: e.row, width: e.width, height: e.height,
        _tierLabel: e._tierLabel, _rareEarthPhase: e._rareEarthPhase || 0,
        _oreAmount: e._oreAmount, _oreMax: e._oreMax });
    }

    // Save helium gas fields — use EntityRegistry so fields under wells are found
    for (const e of EntityRegistry.getByType(T.HELIUMDEPOSIT)) {
      if (seen.has(e)) continue;
      seen.add(e);
      entities.push({ type: e.type, col: e.col, row: e.row, width: e.width, height: e.height,
        _tierLabel: e._tierLabel, _heliumPhase: e._heliumPhase || 0,
        _oreAmount: e._oreAmount, _oreMax: e._oreMax });
    }

    // Save geothermal deposits — registry pass, so deposits sitting under
    // a well are saved too (the grid tiles point at the well, not them).
    for (const e of EntityRegistry.getByType(T.GEODEPOSIT)) {
      if (seen.has(e)) continue;
      seen.add(e);
      entities.push({ type: e.type, col: e.col, row: e.row, width: e.width, height: e.height,
        _geoPhase: e._geoPhase || 0, _hasWell: !!e._hasWell });
    }

    // First pass: explicitly save all coal deposits including those covered by mines.
    // _linkedDeposit may be null after reload, so also use _depositCol/_depositRow hints.
    const savedDeposits = new Set();

    // Collect all standalone deposits visible in the grid
    for (const e of _coalDeps) {
      if (savedDeposits.has(e)) continue;
      savedDeposits.add(e);
      entities.push({
        type: e.type, col: e.col, row: e.row,
        width: e.width !== 1 ? e.width : undefined,
        height: e.height !== 1 ? e.height : undefined,
        coalAmount: e.coalAmount, coalMax: e.coalMax,
        _revealed: e._revealed, _outputVariance: e._outputVariance, _hasMine: e._hasMine,
      });
    }

    // Also save deposits linked to mines (covered by mine tiles, invisible in grid scan)
    for (const e of _coalMines) {
      const dep = e._linkedDeposit;
      if (dep && !savedDeposits.has(dep)) {
        savedDeposits.add(dep);
        entities.push({
          type: dep.type, col: dep.col, row: dep.row,
          width: dep.width !== 1 ? dep.width : undefined,
          height: dep.height !== 1 ? dep.height : undefined,
          coalAmount: dep.coalAmount, coalMax: dep.coalMax,
          _revealed: dep._revealed, _outputVariance: dep._outputVariance, _hasMine: dep._hasMine,
        });
      }
    }

    // Also save oil deposits linked to pump jacks (covered by jack tiles, invisible in grid scan)
    const savedOilDeposits = new Set();
    for (const e of _pumpJacks) {
      const dep = e._linkedDeposit;
      if (dep && !savedOilDeposits.has(dep)) {
        savedOilDeposits.add(dep);
        entities.push({
          type: dep.type, col: dep.col, row: dep.row,
          width: dep.width, height: dep.height,
          _tierLabel: dep._tierLabel, _oilPhase: dep._oilPhase || 0,
          _pressure: dep._pressure !== undefined ? dep._pressure : 1.0,
          _crudeBuffer: dep._crudeBuffer || 0,
          _totalUnits: dep._totalUnits,
        });
      }
    }


    // (water is left out of _others: WaterSystem.save/load handles it)
    for (const e of _others) {
      if (seen.has(e)) continue;
      if (savedDeposits.has(e)) { seen.add(e); continue; }
      if (savedOilDeposits.has(e)) { seen.add(e); continue; }
      seen.add(e);
      entities.push(serialiseEntity(e));
    }

    // Trucks live entirely in world-space and are deliberately never
    // re-stamped onto the grid after a load (see the T.TRUCK branch in
    // load() — stamping them would evict whatever pipe/conveyor they're
    // driving over). That means a truck which has survived at least one
    // load has zero grid tiles pointing at it, so the scan above misses
    // it entirely. Pick up any truck not already captured via a direct
    // EntityRegistry pass so it doesn't silently vanish from the very
    // next save.
    for (const e of EntityRegistry.getByType(T.TRUCK)) {
      if (seen.has(e)) continue;
      seen.add(e);
      entities.push(serialiseEntity(e));
    }

    return entities;
  }

  // Returns true on success, false if the write failed (most often because
  // localStorage is full). Callers that surface a "saved ✓" message must check
  // this — silently reporting success on a failed write is how a save that
  // never happened ends up looking like one that did.
  // displayName is only supplied when the player has just named a save; on
  // every ordinary save the existing name is kept.
  // slotId is supplied ONLY by explicit player actions (Create New Save,
  // Overwrite). Every automatic caller — the interval, the exit hooks, F2 —
  // calls save() bare, which resolves to the next file in the world's
  // autosave rotation and steps the rotation on afterwards.
  // ── Autosave cadence ───────────────────────────────────────────────
  // Player-selectable in Options. Stored globally (not per world) so the
  // preference follows the player rather than the save file. startAutosave()
  // is safe to call repeatedly — it always replaces the running timer, which
  // is how the Options control applies a new interval without a reload.
  //
  // 0 means OFF: no timer, and the exit hooks stand down too (see
  // autosaveEnabled() — the caller in menu_system checks it). A player who
  // turns autosave off is asking for their file to change only when they say
  // so, and a write on the way out of the tab is exactly the write they mean.
  // F2 and the Save menu keep working either way.
  const AUTOSAVE_KEY = 'gw_autosave_ms';
  const AUTOSAVE_OFF = 0;
  // Options slider: Off at the left, then 30-second steps up to 10 minutes.
  // Older saves only stored a handful of presets (30s, 2m, 5m, 10m); those
  // still land exactly on a step.
  const AUTOSAVE_STEP = 30000;
  const AUTOSAVE_MAX  = 10 * 60 * 1000;
  const AUTOSAVE_DEFAULT = 3 * 60 * 1000;
  let autosaveTimer = null;
  // Whether this session wants autosaves at all, independent of whether a
  // timer is currently ticking. Turning the cadence off leaves no timer to
  // look at, so without this flag switching back on again in Options had
  // nothing to re-arm and autosaving stayed dead until the next reload.
  let autosaveWanted = false;

  function clampAutosaveMs(ms) {
    if (!Number.isFinite(ms)) return AUTOSAVE_DEFAULT;
    if (ms <= AUTOSAVE_OFF) return AUTOSAVE_OFF;
    const stepped = Math.round(ms / AUTOSAVE_STEP) * AUTOSAVE_STEP;
    return Math.min(AUTOSAVE_MAX, Math.max(AUTOSAVE_STEP, stepped));
  }

  function getAutosaveInterval() {
    const raw = parseInt(localStorage.getItem(AUTOSAVE_KEY), 10);
    if (!Number.isFinite(raw)) return AUTOSAVE_DEFAULT;
    return clampAutosaveMs(raw);
  }

  // True when automatic writes are allowed at all — the timer AND the exit
  // hooks answer to this.
  function autosaveEnabled() { return getAutosaveInterval() !== AUTOSAVE_OFF; }

  function setAutosaveInterval(ms) {
    const v = clampAutosaveMs(Number(ms));
    try { localStorage.setItem(AUTOSAVE_KEY, String(v)); } catch (_e) {}
    if (autosaveWanted) startAutosave(); // re-arm, or stand down if now off
    return v;
  }

  // The timer no longer IS the cadence. A bare setInterval(save, ms) was
  // throttled or deferred by the browser in background tabs, and a write
  // that failed simply waited another full interval, so a 2-minute setting
  // could leave the newest file many minutes stale. Instead a short heartbeat
  // checks a wall-clock deadline: a save is due once `ms` has passed since
  // the last SUCCESSFUL automatic write, and a failed one is retried after
  // RETRY_MS rather than a whole interval later.
  const HEARTBEAT_MS = 5000;
  const RETRY_MS     = 15000;
  let nextAutoDue    = 0;       // Date.now() at which the next interval save is due
  let lastAutoOkAt   = 0;       // Date.now() of the last successful automatic write
  let failStreak     = 0;       // consecutive failed automatic writes (for the warning)

  // ── New-day saves ──────────────────────────────────────────────────
  // Separate from the player's interval (and on even when that is OFF): at
  // the start of every in-game day the world is written to one of the
  // player's Daily files (Options: Off or 1-5, default 3), chosen by day
  // number, so that many recent days are always there to fall back to.
  // Folder mode only — extra copies of a multi-megabyte world would blow the
  // ~5 MB browser-storage quota. Lowering the count leaves the higher-
  // numbered files in the folder; they just stop being written.
  const DAILY_KEY = 'gw_daily_saves';
  const DAILY_MAX = 5, DAILY_DEFAULT = 3;
  function getDailySaves() {
    let raw = NaN;
    try { raw = parseInt(localStorage.getItem(DAILY_KEY), 10); } catch (_e) {}
    return Number.isFinite(raw) ? Math.max(0, Math.min(DAILY_MAX, raw)) : DAILY_DEFAULT;
  }
  function setDailySaves(n) {
    const v = Math.max(0, Math.min(DAILY_MAX, Math.round(Number(n)) || 0));
    try { localStorage.setItem(DAILY_KEY, String(v)); } catch (_e) {}
    return v;
  }
  let lastDaySeen   = null;     // in-game day index at the last heartbeat
  function _dayIndex() {
    if (typeof DayNight === 'undefined') return null;
    return Math.floor(DayNight.getElapsed() / (DayNight.secondsPerGameHour() * 24));
  }
  function dailySlotName(i) {
    const city = (typeof CityInfo !== 'undefined' && CityInfo.getCityName()) || 'Save';
    return `Daily ${i + 1} - (${city})`;
  }
  function saveDaily(day) {
    const n = getDailySaves();
    if (!n || !FolderMode.active() || _iron()) return false;
    const i = ((day % n) + n) % n;
    const name = dailySlotName(i);
    const ok = save(FileSaves.fileNameFor(name), name, { kind: 'daily' });
    if (ok && typeof showToast === 'function') showToast(`💾 Day ${day + 1} saved`, '#80d0ff', '#001018', '#1a4a6a');
    return ok;
  }

  // Warns once per failure streak so a silently dead save path can't go
  // unnoticed for half an hour again.
  function _reportAutoFailure(why) {
    failStreak++;
    nextAutoDue = Date.now() + RETRY_MS;
    if (failStreak === 1 && typeof showToast === 'function') {
      showToast(`⚠ Autosave failed: retrying. ${why || ''}`.trim(), '#ff8040', '#180a00', '#804020');
    }
  }
  function _reportAutoSuccess() {
    if (failStreak > 0 && typeof showToast === 'function') showToast('💾 Autosave working again', '#80e080', '#001400', '#2a6a2a');
    failStreak = 0;
    lastAutoOkAt = Date.now();
    nextAutoDue = lastAutoOkAt + getAutosaveInterval();
  }

  // The pause menu stops the interval clock: time spent in it is added back
  // onto the deadline, so the next autosave lands the same amount of play
  // after the last one however long the menu was up.
  let lastBeatAt = 0;
  const _pauseMenuOpen = () => {
    const el = typeof document !== 'undefined' && document.getElementById('pause-menu');
    return !!(el && el.classList.contains('visible'));
  };

  function _heartbeat() {
    if (!autosaveWanted) return;
    const now = Date.now();
    const sinceBeat = lastBeatAt ? now - lastBeatAt : 0;
    lastBeatAt = now;
    if (_pauseMenuOpen()) { nextAutoDue += sinceBeat; return; }
    // New in-game day → daily save (independent of the interval setting).
    const day = _dayIndex();
    if (day !== null) {
      if (lastDaySeen !== null && day > lastDaySeen) saveDaily(day);
      lastDaySeen = day;
    }
    const ms = _effectiveInterval();
    if (ms === AUTOSAVE_OFF) return;
    if (Date.now() < nextAutoDue) return;
    // Folder writes finish asynchronously and report through the write's
    // .then (see _save); push the deadline now so the heartbeat doesn't
    // queue a second write while the first is still in flight.
    nextAutoDue = Date.now() + ms;
    const target = resolveAutoSlot() || currentSlot;      // read before the rotation steps on
    const r = _save(undefined, undefined, 'interval');
    if (r === 'pending') return;
    _logSave('interval', target, !!r, r ? null : lastSaveError);
    if (r) _reportAutoSuccess(); else _reportAutoFailure(lastSaveError);
  }

  // Autosave OFF doesn't apply to a permadeath world — its one file is only
  // honest if the game keeps it current, so it falls back to the default.
  function _effectiveInterval() {
    const ms = getAutosaveInterval();
    return (ms === AUTOSAVE_OFF && _iron()) ? AUTOSAVE_DEFAULT : ms;
  }

  function startAutosave() {
    if (autosaveTimer) clearInterval(autosaveTimer);
    autosaveWanted = true;
    // Deliberately no save() up front: the first interval write is due one
    // full interval after the game starts, not the moment the world loads.
    nextAutoDue = Date.now() + (_effectiveInterval() || 0);
    lastBeatAt  = Date.now();
    lastDaySeen = _dayIndex();
    autosaveTimer = setInterval(_heartbeat, HEARTBEAT_MS);
  }

  function stopAutosave() {
    if (autosaveTimer) clearInterval(autosaveTimer);
    autosaveTimer = null;
    autosaveWanted = false;
  }

  // ── Save log ───────────────────────────────────────────────────────
  // The last 30 save attempts (when, what kind, which file, outcome), kept in
  // localStorage so a "my save was old" report can be checked afterwards:
  //   SaveSystem.saveLog()
  const SAVE_LOG_KEY = 'gw_save_log';
  function _logSave(kind, id, ok, why) {
    try {
      const log = JSON.parse(localStorage.getItem(SAVE_LOG_KEY) || '[]');
      log.push({ at: new Date().toISOString(), kind, id, ok, why: why || undefined });
      localStorage.setItem(SAVE_LOG_KEY, JSON.stringify(log.slice(-30)));
    } catch (_e) {}
  }

  // Tab hidden / page hiding / unloading all fire together on a reload, and
  // each used to take the NEXT rotation file — one reload overwrote all three
  // autosaves with the same moment, wiping the fallbacks. One write per burst.
  let lastExitSaveAt = 0;
  function saveOnExit() {
    // Permadeath always saves on the way out — quitting is not a way back.
    if (!autosaveEnabled() && !_iron()) return false;
    const now = Date.now();
    if (now - lastExitSaveAt < 3000) return false;
    lastExitSaveAt = now;
    return save(undefined, undefined, { kind: 'exit' });
  }

  // Public entry point. Returns true once the write is away (for folder mode
  // the async file write reports its real outcome to the save log and, for
  // automatic writes, to the failure warning — see _save).
  function save(slotId, displayName, opts = {}) {
    const kind = opts.kind || (slotId ? 'manual' : 'auto');
    const target = slotId || (_iron() ? resolveAutoSlot() : resolveQuickSlot()) || currentSlot;
    const r = _save(slotId, displayName, kind);
    if (r !== 'pending') _logSave(kind, target, !!r, r ? null : lastSaveError);
    return r === 'pending' ? true : r;
  }

  // A save runs on the main thread, so the game is frozen for as long as it
  // takes. Timed for StallWatch, which reports any hang of a second or more
  // along with what was running. (_saveImpl re-enters through saveFromSite;
  // only the outermost call is timed.)
  let _saveDepth = 0;
  function _save(slotId, displayName, kind) {
    const t0 = performance.now();
    _saveDepth++;
    try { return _saveImpl(slotId, displayName, kind); }
    finally {
      if (--_saveDepth === 0 && typeof StallWatch !== 'undefined') StallWatch.mark('save:' + (kind || 'auto'), t0, performance.now());
    }
  }

  function _saveImpl(slotId, displayName, kind) {
    // The Advanced Reactor apocalypse ends the run. Writing the flattened
    // map over their file — from an autosave tick, from the tab closing,
    // from the pause menu — would take away the save they are about to be
    // offered. Refuse, quietly; the world in memory is the only copy of the
    // ending and it is meant to be thrown away.
    if (typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.hasEnded()) return false;
    if (paused) return false;
    // Never persist a contract job site over the player's own world. Every
    // save path funnels through here — the 30s autosave, F2, the menu's
    // Save, and the visibilitychange/pagehide/beforeunload crash-net in
    // menu_system.js — so one guard covers all of them. Stopping the
    // autosave timer alone does not: reloading the tab mid-contract fires
    // the crash-net save and would overwrite the city with the job site.
    //
    // The test is whether the player is STANDING ON the site, not whether a
    // contract is open. returnHome() puts the real city back in the world
    // and a contract stays open for days of play afterwards — gating on
    // hasContract() meant nothing saved for that entire stretch: the
    // autosave went quiet, F2 reported a bare "Save failed", and leaving to
    // the main menu threw away every hour built at home since the contract
    // was accepted.
    //
    // So a save made on site goes through ContractSystem.saveFromSite, which
    // puts the player's own world on the grid for the length of this call
    // (and reports itself as "not at a site" while it does, which is what
    // lets the re-entrant call below fall through to the real save).
    if (typeof ContractSystem !== 'undefined' && ContractSystem.isAtSite && ContractSystem.isAtSite()) {
      if (typeof ContractSystem.saveFromSite !== 'function') {
        lastSaveError = 'Save skipped: you are at a contract job site; return home to save';
        return false;
      }
      return ContractSystem.saveFromSite(() => _save(slotId, displayName, kind));
    }
    // A bare call is an automatic save: it takes the rotation's next file and
    // moves the rotation on once the write is away. An explicit player save
    // names its own file and leaves the rotation untouched.
    // Permadeath: the world's one file only. Any other target (a named save,
    // an overwrite of another file) would be a backup to reload from.
    if (_iron() && slotId && slotId !== resolveAutoSlot()) {
      lastSaveError = 'Permadeath world: the game saves itself, there are no other save files';
      return false;
    }
    // Only the Options interval writes the autosave rotation. Every other
    // bare save (F2, the exit hooks, Save & Quit, export, scenarios) goes to
    // the world's one Quicksave file and leaves the rotation alone. A
    // permadeath world has only its one file, which every save writes.
    const rotating = !slotId && (kind === 'interval' || _iron());
    const id = slotId || (rotating ? resolveAutoSlot() : resolveQuickSlot()) || currentSlot;
    if (!id) { console.warn('SaveSystem.save: no active slot'); return false; }
    const rotIndex = rotating ? autoSlots.indexOf(id) : -1;
    try {
      const prog  = Progression;
      const grid  = serialiseGrid();
      // Refuse to write an empty world. There is no legitimate empty state —
      // even a brand-new game has City Hall, water and trees before the first
      // save runs — so zero entities means the world never finished loading
      // (a mid-load exception leaves the grid blank). Writing that out is how
      // a failed load turns into a destroyed save file 30 seconds later.
      if (!grid.length) {
        lastSaveError = 'Save skipped: the world is empty (load may have failed)';
        console.warn('SaveSystem.save: refusing to overwrite', id, '— grid is empty');
        return false;
      }
      const data  = {
        version: VERSION,
        vegMigrated: true,        // marks that expansion veg migration has run
        vegMigratedCols: COLS,    // records map size at time of save
        vegMigratedRows: ROWS,
        grid,
        economy: {
          balance: Economy.balance,
        },
        progression: {
          unlocked:             [...prog.unlocked],
          ready:                Progression.serialiseReady(),   // was always empty, so pending unlocks re-toasted every load
          totalWs:              prog.totalWs,
          totalResearch:        prog.totalResearch,
          maxSubstationCharge:  prog.maxSubstationCharge,
          reactorEverRan:       Progression.reactorEverRan(),
          overdriveTripSeen:    Progression.overdriveTripSeen(),          everRedlined:         (typeof PowerNetwork !== 'undefined') ? PowerNetwork.everRedlined() : false,
          totalCoalMined:       CoalSystem.getTotalMined(),
        totalBiofuelCollected: BiofuelSystem.getTotalCollected(),
        totalScans:           CoalSystem.getTotalScans(),
        totalOilScans:        OilSystem.getTotalScans(),
        totalUraniumScans:    UraniumSystem.getTotalScans(),
        totalSulfurScans:     SulfurSystem.getTotalScans(),
        // Mined totals gate unlocks (sulfur at 1,000 opens the Chemical
        // Plant), so they have to survive a reload like the scan counts do.
        totalSulfurMined:     SulfurSystem.getTotalMined?.() || 0,
        totalUraniumMined:    UraniumSystem.getTotalMined?.() || 0,
        totalLithiumScans:    (typeof LithiumSystem !== 'undefined' ? LithiumSystem.getTotalScans() : 0),
        totalGeoScans:        (typeof GeothermalSystem !== 'undefined' ? GeothermalSystem.getTotalScans() : 0),
        totalGeoSteam:        (typeof GeothermalSystem !== 'undefined' ? GeothermalSystem.getTotalSteam() : 0),
        geoThreeTurbinesEverRan: (typeof GeothermalSystem !== 'undefined' ? GeothermalSystem.threeTurbinesEverRan() : false),
        geoActivity:          (typeof GeothermalSystem !== 'undefined' ? GeothermalSystem.getActivity() : undefined),
        totalAcidProduced:    (typeof ChemicalSystem !== 'undefined' ? ChemicalSystem.getTotalAcidProduced?.() : 0) || 0,
        totalHydrogenProduced: (typeof ElectrolyzerSystem !== 'undefined' ? ElectrolyzerSystem.getTotalHydrogenProduced?.() : 0) || 0,
        sixTurbinesEverRan:   Progression.sixTurbinesEverRan(),
        carbonTaxBase:        Progression.carbonTaxBase(),
        totalRodsProduced:    (typeof FuelPlantSystem !== 'undefined' ? FuelPlantSystem.getTotalRods?.() : 0) || 0,
        totalSpentFuel:       (typeof NuclearSystem !== 'undefined' ? NuclearSystem.getTotalSpentFuel?.() : 0) || 0,
        totalPlutoniumProduced: (typeof ReprocessingSystem !== 'undefined' ? ReprocessingSystem.getTotalPlutonium?.() : 0) || 0,
        totalMoxProduced:     (typeof MoxPlantSystem !== 'undefined' ? MoxPlantSystem.getTotalMox?.() : 0) || 0,
        advReactorEverRan:    Progression.advReactorEverRan(),
        advReactorGenerated:  Progression.advReactorGenerated?.(),
        cryoTowerEverRan:     Progression.cryoTowerEverRan?.(),
        fusionGenerated:      Progression.fusionGenerated?.(),
        totalSpentFuelConsumed: (typeof ReprocessingSystem !== 'undefined' ? ReprocessingSystem.getTotalSpentFuelConsumed?.() : 0) || 0,
        totalLithiumMined:    (typeof LithiumSystem !== 'undefined' ? LithiumSystem.getTotalMined?.() : 0) || 0,
        totalCompoundProduced: (typeof LithiumProcessPlantSystem !== 'undefined' ? LithiumProcessPlantSystem.getTotalCompoundProduced?.() : 0) || 0,
        totalNitrogenProduced: (typeof AtmosphereCollectorSystem !== 'undefined' ? AtmosphereCollectorSystem.getTotalNitrogenProduced?.() : 0) || 0,
        totalAmmoniaProduced: (typeof HaberBoschSystem !== 'undefined' ? HaberBoschSystem.getTotalAmmoniaProduced?.() : 0) || 0,
        totalDeuteriumProduced: (typeof IsotopicWashTowerSystem !== 'undefined' ? IsotopicWashTowerSystem.getTotalDeuteriumProduced?.() : 0) || 0,
        totalPlasmaProduced: (typeof FusionFuelPlantSystem !== 'undefined' ? FusionFuelPlantSystem.getTotalPlasmaProduced?.() : 0) || 0,
        totalHe3PelletsProduced: (typeof FusionFuelPlantSystem !== 'undefined' ? FusionFuelPlantSystem.getTotalHe3PelletsProduced?.() : 0) || 0,
        totalDhe3Burned: (typeof AdvancedFusionReactorSystem !== 'undefined' ? AdvancedFusionReactorSystem.getTotalPelletsBurned?.() : 0) || 0,
        totalHighBetaProduced: (typeof HulkingFusionReactorSystem !== 'undefined' ? HulkingFusionReactorSystem.getTotalHighBetaProduced?.() : 0) || 0,
        totalMhdPowerGenerated: (typeof MHDDeceleratorRingSystem !== 'undefined' ? MHDDeceleratorRingSystem.getTotalPower?.() : 0) || 0,
        totalRareEarthScans:  (typeof RareEarthSystem !== 'undefined' ? RareEarthSystem.getTotalScans() : 0),
        totalRareEarthMined:  (typeof RareEarthSystem !== 'undefined' ? RareEarthSystem.getTotalMined() : 0) || 0,
        totalOxideProduced:   (typeof LeachPlantSystem !== 'undefined' ? LeachPlantSystem.getTotalOxide() : 0) || 0,
        totalTapeProduced:    (typeof SuperconductorMillSystem !== 'undefined' ? SuperconductorMillSystem.getTotalTape() : 0) || 0,
        totalCokeProduced:    (typeof CokeOvenSystem !== 'undefined' ? CokeOvenSystem.getTotalCoke() : 0) || 0,
        totalOvenGasProduced: (typeof CokeOvenSystem !== 'undefined' ? CokeOvenSystem.getTotalGas() : 0) || 0,
        totalGraphiteMade:    (typeof GraphiteFurnaceSystem !== 'undefined' ? GraphiteFurnaceSystem.getTotalGraphite() : 0) || 0,
        totalGraphiteBurned:  (typeof NuclearSystem !== 'undefined' ? NuclearSystem.getTotalGraphiteBurned() : 0) || 0,
        totalCoresBuilt:      (typeof CoreWorksSystem !== 'undefined' ? CoreWorksSystem.getTotalCoresBuilt() : 0) || 0,
        totalCoreCharges:     (typeof CoreWorksSystem !== 'undefined' ? CoreWorksSystem.getTotalCharges() : 0) || 0,
        totalHeliumScans:     (typeof HeliumSystem !== 'undefined' ? HeliumSystem.getTotalScans() : 0),
        totalHeliumExtracted: (typeof HeliumSystem !== 'undefined' ? HeliumSystem.getTotalExtracted() : 0) || 0,
        totalHeliumLiquefied: (typeof CryoPlantSystem !== 'undefined' ? CryoPlantSystem.getTotalLiquefied() : 0) || 0,
        totalPelletsBurned:   (typeof HulkingFusionReactorSystem !== 'undefined' ? HulkingFusionReactorSystem.getTotalPelletsBurned() : 0) || 0,
        totalFusionSteam:     (typeof HulkingFusionReactorSystem !== 'undefined' ? HulkingFusionReactorSystem.getTotalSteamRaised() : 0) || 0,
        totalHe3Produced:     (typeof He3SeparatorSystem !== 'undefined' ? He3SeparatorSystem.getTotalHe3Produced() : 0) || 0,
        totalTritiumBred:     (typeof TritiumBreederSystem !== 'undefined' ? TritiumBreederSystem.getTotalTritiumBred() : 0) || 0,
        lightning:            (typeof LightningDamageSystem !== 'undefined' ? LightningDamageSystem.getState() : null),
        totalCrudeProduced:   OilSystem.getTotalCrude(),
        totalFuelOilProduced: OilSystem.getTotalFuelOil(),
        totalLpgProduced:     OilSystem.getTotalLpg(),
        totalLpgFlared:       OilSystem.getTotalLpgFlared(),
        oilDepositExhausted:  OilSystem.hasExhaustedDeposit(),
        totalWaterExtracted:  HydroSystem.getTotalWaterExtracted(),
        zones:                ZoneSystem.serialise(),
        wasteSpawned: {
          coal:    WasteSystem.isTriggered(T.COALGENERATOR),
          oil:     WasteSystem.isTriggered(T.REFINERY),
          nuclear: WasteSystem.isTriggered(T.NUCLEARREACTOR),
        },
        },
        daynight: {
          elapsed: DayNight.getElapsed(),
        },
        // How far each vent's steam/smoke wisp has built up (_wfSmoke), so
        // a reload doesn't start every one from nothing.
        smokeVents: typeof _wfSmokeSave === 'function' ? _wfSmokeSave() : undefined,
        water: WaterSystem.save(),
        terrain: TerrainSystem.save(),
        seasons: Seasons.serialise(),
        reservoirs: (typeof ReservoirSystem !== 'undefined') ? ReservoirSystem.save() : null,
        government: GovernmentSystem.save(),
        playTime: PlayTime.save(),
        weather: {
          cloudCover: CloudState.cover,
          cloudTarget: CloudState.target,
          windSpeed: WindState.speed,
          clouds: CloudShadows.serialise(),
          event: WeatherEventSystem.getHomeEvent(),
          gameTime: WeatherEventSystem.getGameTime(),
          schedule: EventSystem.serialise(),
          calendar: typeof SeasonalEvents !== 'undefined' ? SeasonalEvents.serialise() : null,
          launch: typeof LaunchSystem !== 'undefined' ? LaunchSystem.serialise() : null,
          frost: FrostSystem.serialise(),
          dust: DustSystem.serialise(),   // a dust storm's dust settled over the city
        },
        camera: {
          panX: Camera.x,
          panY: Camera.y,
          zoom: Camera.zoom,
        },
        requests: HouseRequestSystem.serialise(),
        amenityFulfilled: AmenityRequestSystem.getTotalFulfilled(),
        savedPaths: SavedPathSystem.save(),
        blueprints: BlueprintSystem.save(),
        achievements: AchievementsSystem.serialise(),
        achievementsMisc: AchievementsSystem.saveMisc(),
        cityScoreBest: CityScore.best,
        pollution: PollutionSystem.serialise(),
        beltCargo: (typeof BeltCargo !== 'undefined') ? BeltCargo.serialise() : null,
        caughtFish: FishingSystem.serialise(),
        compendium: CompendiumSystem.serialise(),
        tutorial: TutorialSystem.serialise(),
        cityInfo: CityInfo.serialise(),
        // An open contract and the job site it belongs to (§9). Null when
        // no contract is running.
        contract: (typeof ContractSystem !== 'undefined') ? ContractSystem.serialise() : null,
        // Demo: the scenario this world is (its clock, objectives and medal), or null.
        scenario: (typeof ScenarioSystem !== 'undefined') ? ScenarioSystem.serialise() : null,
        fusionResearch: (typeof FusionResearch !== 'undefined') ? FusionResearch.serialise() : null,
        nationalProject: (typeof NationalProject !== 'undefined') ? NationalProject.serialise() : null,
        companyHQ: (typeof CompanyHQ !== 'undefined') ? CompanyHQ.serialise() : null,
        gridAnalyzer: (typeof GridAnalyzer !== 'undefined') ? GridAnalyzer.serialise() : null,
        advisor: (typeof Advisor !== 'undefined') ? Advisor.serialise() : null,
      };
      // Store ready set separately via Progression API
      data.progression.ready = Progression.serialiseReady();
      data._savedAt = Date.now();
      data.worldId  = currentWorld || id;
      if (typeof Difficulty !== 'undefined') data.difficulty = Difficulty.serialise();
      // Which files this world autosaves to, so loading it later resumes
      // writing to the same ones instead of re-deriving names that might
      // collide with another world's. autoIndex records which of them THIS
      // write went to, so a reload picks the rotation up where it left off
      // rather than restarting at file 1 and overwriting the newest autosave
      // every session.
      data.autoSlots = resolveAutoSlots().slice();
      // A write outside the rotation records the rotation file written last,
      // so loading it carries on with the next one instead of restarting at
      // file 1 over the newest autosave.
      data.autoIndex = rotIndex !== -1 ? rotIndex : (autoIndex - 1 + _slotCount()) % _slotCount();
      // Kept for older builds reading a newer save — they only understand a
      // single autosave file, so give them the first of the rotation rather
      // than whatever this particular write happened to target (which, for a
      // player's named save, is a file they alone are meant to write).
      data.autoSlot = data.autoSlots[0] || null;

      const json = JSON.stringify(data);

      // Folder mode: the slot id IS the filename, and the file itself carries
      // all its metadata, so there's no separate index to maintain.
      //
      // Writing a file is asynchronous and CANNOT finish during beforeunload —
      // the page tears down first — so closing or reloading the tab would lose
      // everything since the last completed write. To cover that, a synchronous
      // localStorage mirror is written first; it always completes. On a
      // successful folder write the mirror is dropped, so a mirror surviving
      // into the next session means exactly one thing: that write never landed.
      // flushPendingMirrors() replays those on startup.
      //
      // The desktop build needs none of that: its save made on the way out is
      // written before the page is let go (FileSaves.writeNow), and any other
      // write is in the app's hands the moment it is sent, page or no page.
      // Skipping the mirror there spares a multi-megabyte synchronous
      // localStorage write on every save — which, past the ~5 MB quota a big
      // world reaches, was failing quietly anyway.
      if (FolderMode.active()) {
        const desktop = FileSaves.canWriteNow && FileSaves.canWriteNow();
        if (desktop && kind === 'exit' && FileSaves.writeNow(id, json, data)) {
          if (rotIndex !== -1) advanceAutoSlot();
          lastSaveError = null;
          lastSaveOkAt = Date.now();
          FolderMode.refresh();
          return true;
        }
        if (!desktop) {
          try { localStorage.setItem(mirrorKey(id), json); }
          catch (_e) { /* mirror is best-effort; the folder write is the real save */ }
        }
        FolderMode.writeSave(id, json, data).then(ok => {
          if (ok && !desktop) { try { localStorage.removeItem(mirrorKey(id)); } catch (_e) {} }
          _logSave(kind, id, ok, ok ? null : (FolderMode.error() || 'folder write failed'));
          // Automatic writes report their REAL outcome here — before, a
          // failed folder write still counted as saved and nobody was told.
          // Only the interval: its success sets the next deadline, which an
          // F2 or exit save must not push back or bring forward.
          if (kind === 'interval') {
            if (ok) _reportAutoSuccess(); else _reportAutoFailure(FolderMode.error());
          }
        });
        // Stepped now rather than in the .then: the mirror above has already
        // made this write durable, and waiting on the async file write would
        // let a second autosave fire against the same file in the meantime.
        if (rotIndex !== -1) advanceAutoSlot();
        lastSaveError = null;
        lastSaveOkAt = Date.now();
        return 'pending';
      }

      localStorage.setItem(slotStorageKey(id), json);

      // Keep the slot index metadata (used by the main-menu slot list) in sync
      const idx = readSlotIndex();
      const entry = idx.find(s => s.id === id);
      const meta = {
        id,
        // Keep an existing slot's worldId; a slot being written for the first
        // time joins the active world, falling back to itself if there isn't
        // one (e.g. a save made before worldId existed).
        worldId:     (entry && entry.worldId) || currentWorld || id,
        // A name the player typed sticks with the slot across later saves.
        // Rotation files get a default one so the three are distinguishable
        // in the load list instead of appearing as three rows of city name.
        saveName:    displayName || (entry && entry.saveName)
                     || (rotIndex !== -1 ? autoSlotName(rotIndex) : id === resolveQuickSlot() ? quickSlotName() : null),
        cityName:    (typeof CityInfo !== 'undefined' ? CityInfo.getCityName()    : 'New Haven'),
        companyName: (typeof CityInfo !== 'undefined' ? CityInfo.getCompanyName() : 'Gridworks Power Co.'),
        savedAt:     data._savedAt,
        // Demo: which scenario this save is, so the picker can offer to resume it.
        scenario:    (data.scenario && data.scenario.id) || null,
        ...(typeof Difficulty !== 'undefined' ? Difficulty.badges(data) : {}),
      };
      if (entry) Object.assign(entry, meta); else idx.push(meta);
      writeSlotIndex(idx);
      if (rotIndex !== -1) advanceAutoSlot();
      lastSaveError = null;
      lastSaveOkAt = Date.now();
      return true;
    } catch (err) {
      console.warn('Save failed:', err);
      // Quota is by far the most common failure, and it's the one the player
      // can actually act on (delete an old save), so name it specifically.
      const quota = err && (err.name === 'QuotaExceededError'
        || err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        || err.code === 22 || err.code === 1014);
      lastSaveError = quota
        ? 'Storage full: delete an old save file to free space'
        : ('Save failed: ' + (err && err.message ? err.message : 'unknown error'));
      // A failed write can still leave a half-registered slot in the index
      // (setItem threw, but the entry was pushed on a previous attempt, or the
      // index write itself is what failed). Drop any index entry that has no
      // actual save blob behind it so the menus never list a phantom file.
      try {
        writeSlotIndex(readSlotIndex().filter(s => localStorage.getItem(slotStorageKey(s.id)) != null));
      } catch (_e) { /* index unwritable too; nothing further we can do */ }
      return false;
    }
  }

  // rawOverride lets callers supply the save text themselves — needed for
  // folder mode, where reading a file is async but this function (and the
  // whole startGame path it sits in) is synchronous.
  // Every way load() can fail leaves the world blank or half-built. Freeze
  // all automatic writes (interval, exit hooks, F2) so that state can never
  // be written back over the file that failed to load — the save on disk is
  // the only good copy left, and a reload restores the player to it.
  function _loadFailed(why) {
    paused = true;
    stopAutosave();
    lastSaveError = 'Load failed: saving disabled to protect your file. Reload the page.';
    console.warn('Load failed:', why);
    return false;
  }

  // ── Map-size migration ───────────────────────────────────────────
  // COLS/ROWS are fixed for the session, but a save remembers the map it
  // was made on (vegMigratedCols/Rows; saves older than that were 624×374).
  // A world from a different-sized map is recentred onto this one: every
  // position in the save moves by the same offset, so City Hall — built at
  // the map centre — lands at the centre again and the city keeps its shape.
  // A smaller map trims evenly off every edge; anything left outside it is
  // dropped. A bigger one gains a border, which the vegetation migration in
  // load() then fills (it reads _oldRect to know where the old map sits).
  //
  // Positions are found by key, which is how every saver in the game names
  // them: col/row, c/r, minC..maxR, c0/r0 and <anything>Col/<anything>Row are
  // tiles; wx/wy/_wx/_wy/panX/panY are world pixels; x/y are pixels only in
  // drone fleets and cloud lists. Water ("c,r[:flow]" strings), reservoir
  // tile pairs and the national plan's [c, r] slots are handled by shape.
  function _migrateMapSize(data) {
    const oldC = data.vegMigratedCols || 624, oldR = data.vegMigratedRows || 374;
    if (oldC === COLS && oldR === ROWS) return;
    const dc = Math.floor(COLS / 2) - Math.floor(oldC / 2);
    const dr = Math.floor(ROWS / 2) - Math.floor(oldR / 2);
    const dx = dc * TILE, dy = dr * TILE;
    const colKey = k => k === 'col' || k === 'c' || k === 'minC' || k === 'maxC' || k === 'c0' || /[a-z]Col$/.test(k);
    const rowKey = k => k === 'row' || k === 'r' || k === 'minR' || k === 'maxR' || k === 'r0' || /[a-z]Row$/.test(k);
    const pxX = k => k === 'wx' || k === '_wx' || k === 'panX';
    const pxY = k => k === 'wy' || k === '_wy' || k === 'panY';
    const NOT_POSITIONS = new Set(['blueprints', 'achievements', 'achievementsMisc', 'compendium', 'tutorial', 'cityInfo', 'caughtFish']);
    const walk = (o, xyPixels) => {
      if (Array.isArray(o)) { for (const v of o) if (v && typeof v === 'object') walk(v, xyPixels); return; }
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (typeof v === 'number') {
          if (colKey(k)) o[k] = v + dc;
          else if (rowKey(k)) o[k] = v + dr;
          else if (pxX(k) || (xyPixels && k === 'x')) o[k] = v + dx;
          else if (pxY(k) || (xyPixels && k === 'y')) o[k] = v + dy;
        } else if (v && typeof v === 'object') {
          walk(v, xyPixels || k === '_droneFleet' || k === 'clouds');
        }
      }
    };
    for (const k of Object.keys(data)) {
      if (NOT_POSITIONS.has(k) || k === 'water' || !data[k] || typeof data[k] !== 'object') continue;
      walk(data[k], false);
    }
    const inside = (c, r, w = 1, h = 1) => c >= 0 && r >= 0 && c + w <= COLS && r + h <= ROWS;
    const shiftPair = pr => [pr[0] + dc, pr[1] + dr];

    // Water: "c,r" or "c,r:flow" strings.
    if (Array.isArray(data.water)) {
      data.water = data.water.map(key => {
        const [coord, flow] = key.split(':');
        const [c, r] = coord.split(',').map(Number);
        return inside(c + dc, r + dr) ? `${c + dc},${r + dr}${flow !== undefined ? ':' + flow : ''}` : null;
      }).filter(Boolean);
    }
    // Belt cargo: flat rows (BeltCargo.serialise) with tile coordinates at
    // fixed positions; a destination or exit of -1 means "none" and stays.
    if (Array.isArray(data.beltCargo)) for (const a of data.beltCargo) {
      if (!Array.isArray(a)) continue;
      for (const i of [1, 4, 10, 13, 16]) if (typeof a[i] === 'number' && (i < 13 || a[i] >= 0)) { a[i] += dc; a[i + 1] += dr; }
    }
    // Reservoirs: [c, r] tile and turbine pairs.
    for (const res of (data.reservoirs && data.reservoirs.reservoirs) || []) {
      if (Array.isArray(res.tiles)) res.tiles = res.tiles.map(shiftPair).filter(t => inside(t[0], t[1]));
      if (Array.isArray(res.turbines)) res.turbines = res.turbines.map(shiftPair);
    }
    // The national plan's reserved spots.
    const plan = data.government && data.government.nationalPlan;
    if (plan && plan.slots) for (const t of Object.keys(plan.slots)) {
      const sl = shiftPair(plan.slots[t]), d = EntityDefs[t];
      if (inside(sl[0], sl[1], d ? d.width : 1, d ? d.height : 1)) plan.slots[t] = sl; else delete plan.slots[t];
    }
    // Buildings and deposits that no longer fit on the map.
    if (Array.isArray(data.grid)) {
      const before = data.grid.length;
      data.grid = data.grid.filter(e => {
        const d = EntityDefs[e.type] || {};
        if (e.type === T.TRUCK) return inside(e.col, e.row);
        return inside(e.col, e.row, e.width || d.width || 1, e.height || d.height || 1);
      });
      if (before !== data.grid.length) console.log(`[SAVE] Map resize: ${before - data.grid.length} entities outside the new map were dropped`);
    }
    // Pending placement offers off the map.
    for (const req of (data.requests && data.requests.pending) || []) {
      if (Array.isArray(req.locations)) req.locations = req.locations.filter(l => inside(l.col, l.row));
    }
    // Zone rectangles: clamp to the map, drop any that fell off it.
    const zones = data.progression && data.progression.zones;
    if (zones) for (const k of Object.keys(zones)) {
      if (!Array.isArray(zones[k])) continue;
      zones[k] = zones[k].map(z => z && typeof z.minC === 'number'
        ? { ...z, minC: Math.max(0, z.minC), minR: Math.max(0, z.minR), maxC: Math.min(COLS - 1, z.maxC), maxR: Math.min(ROWS - 1, z.maxR) } : z)
        .filter(z => !z || typeof z.minC !== 'number' || (z.minC <= z.maxC && z.minR <= z.maxR));
    }
    data._oldRect = { c0: dc, r0: dr, c1: dc + oldC, r1: dr + oldR };
    console.log(`[SAVE] Map resize: ${oldC}×${oldR} save recentred onto ${COLS}×${ROWS} (offset ${dc}, ${dr})`);
  }

  function load(slotId, rawOverride) {
    const id = slotId || currentSlot;
    try {
      if (!id) return _loadFailed('no slot id');
      // undefined = caller wants the sync localStorage path. null/'' means the
      // async reader already tried and got nothing — do NOT fall through to
      // localStorage, or a failed folder read looks like an empty browser slot
      // and reports "load failed" for a file that is fine on disk.
      let raw;
      if (rawOverride === undefined) {
        raw = localStorage.getItem(mirrorKey(id)) || localStorage.getItem(slotStorageKey(id));
      } else {
        raw = rawOverride;
      }
      if (!raw) return _loadFailed(`slot ${id} is empty`);
      const data = JSON.parse(raw);
      if (!data) return _loadFailed(`slot ${id} parsed to nothing`);
      // A save with no entities cannot be a real world (every world has at
      // least City Hall, water and trees). Refuse it instead of presenting a
      // blank map as if it were the player's city — that blank map is what a
      // damaged file looks like, and loading it invites overwriting whatever
      // good copy is left.
      if (Array.isArray(data.grid) && data.grid.length === 0) {
        return _loadFailed(`slot ${id} contains no world data`);
      }
      // A world saved on a different-sized map: move it onto this one first.
      _migrateMapSize(data);
      // The world's own rules — before anything below reads a price, and
      // before the autosave files are picked (permadeath has only one).
      if (typeof Difficulty !== 'undefined') Difficulty.load(data.difficulty);
      // Every subsystem loader below is written to tolerate missing/absent
      // fields (see e.g. the achievements comment further down: "purely
      // additive — absent on older saves"), so an older/newer VERSION is
      // not a reason to discard the save — only a genuinely unparseable
      // save is. Rejecting on version mismatch used to nuke every player's
      // save (including anything as simple as their blueprint list) the
      // moment a routine feature update bumped VERSION.

      // A contract in progress belongs to the world about to be replaced.
      // Drop it before the grid is overwritten, or ContractSystem is left
      // holding snapshots of a world that no longer exists — it keeps
      // reporting the player as on-site, home systems stay paused, and
      // abandoning later restores a dead snapshot over the loaded save.
      if (typeof ContractSystem !== 'undefined') ContractSystem.discardForLoad();

      currentSlot = id;
      // Restore this world's own autosave file. Deliberately NOT set to `id`:
      // loading one of the player's named saves must not make that file the
      // autosave destination — it is a snapshot, and only the player may
      // write to it. A save from before autoSlot existed leaves this empty and
      // resolveAutoSlots() derives world-unique names on the next write.
      //
      // The rotation resumes at the file AFTER the one this save was written
      // to, so loading an autosave and playing on overwrites the next file in
      // the cycle rather than the one just loaded.
      autoSlots = Array.isArray(data.autoSlots)
        ? data.autoSlots.slice(0, AUTOSAVE_SLOTS).map(s => (typeof s === 'string' && s) || null)
        : ((typeof data.autoSlot === 'string' && data.autoSlot) ? [data.autoSlot] : []);
      autoIndex = Number.isInteger(data.autoIndex) && data.autoIndex >= 0
        ? (data.autoIndex + 1) % AUTOSAVE_SLOTS
        : 0;
      autoSlotMigrated = !autoSlots.some(Boolean);
      // A permadeath world keeps writing the very file it was loaded from.
      if (_iron()) { autoSlots = [id]; autoIndex = 0; autoSlotMigrated = false; }
      // Adopt this slot's world so the in-game save picker lists its siblings.
      // The save's OWN worldId comes first: it is written by save() and is the
      // only copy a folder save has (the localStorage index knows nothing
      // about files in the folder). Pre-worldId saves have neither and fall
      // back to their own id — a one-file world.
      currentWorld = (typeof data.worldId === 'string' && data.worldId)
                  || worldIdFor(id)
                  || id;
      if (data.version !== VERSION) {
        console.log(`Save version ${data.version} != current ${VERSION}; loading anyway`);
      }

      // Clear all existing world state before reconstructing from the save.
      // load() was previously purely additive — nothing here ever removed
      // whatever entities were already in EntityRegistry/GridManager first.
      // Calling load() more than once (or any time the game already has
      // entities in play) silently stacked a full duplicate of everything
      // in the save on top of the existing state. For static buildings this
      // is invisible (two identical sprites occupying the exact same tile
      // render as one), but for a mobile entity like a truck the duplicate
      // starts ticking independently and visibly drifts apart over time —
      // which is exactly what "another truck appears after reload" is.
      for (const e of Array.from(EntityRegistry.all())) EntityRegistry.remove(e);
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          GridManager.tiles[r][c] = null;

      // Restore economy
      Economy.setBalance(data.economy.balance);

      // Restore progression
      Progression.loadState(data.progression);
      // After Progression, so a world that already unlocked the Electrolyzer
      // counts as having achieved fusion.
      if (typeof FusionResearch !== 'undefined') FusionResearch.loadState(data.fusionResearch);
      if (typeof NationalProject !== 'undefined') NationalProject.loadState(data.nationalProject);
      if (typeof CompanyHQ !== 'undefined') CompanyHQ.loadState(data.companyHQ);
      if (typeof GridAnalyzer !== 'undefined') GridAnalyzer.loadState(data.gridAnalyzer);
      if (typeof Advisor !== 'undefined') Advisor.loadState(data.advisor);
      Progression.loadReactorEverRan(data.progression.reactorEverRan);
      Progression.loadOverdriveTripSeen(data.progression.overdriveTripSeen);      if (typeof PowerNetwork !== 'undefined') {
        // Saves made before the redline flag existed have no record of it.
        // Anyone already holding the Surge Protector got there by straining
        // their grid, so treat that as having redlined rather than making
        // them earn a flag that did not exist when they played it.
        const _redlined = data.progression.everRedlined !== undefined
          ? data.progression.everRedlined
          : (Progression.isUnlocked(T.PROTECTOR) || Progression.isReady(T.PROTECTOR));
        PowerNetwork.loadRedlined(_redlined);
        PowerNetwork.beginLoadGrace();
      }
      Progression.loadSixTurbinesEverRan(data.progression.sixTurbinesEverRan);
      Progression.loadCarbonTaxBase(data.progression.carbonTaxBase);
      Progression.loadAdvReactorEverRan?.(data.progression.advReactorEverRan);
      Progression.loadAdvReactorGenerated?.(data.progression.advReactorGenerated);
      Progression.loadCryoTowerEverRan?.(data.progression.cryoTowerEverRan);
      Progression.loadFusionGenerated?.(data.progression.fusionGenerated);
      CoalSystem.loadTotalMined(data.progression.totalCoalMined);
      CoalSystem.loadTotalScans(data.progression.totalScans);
      OilSystem.loadScans(data.progression.totalOilScans);
      UraniumSystem.loadScans(data.progression.totalUraniumScans);
      SulfurSystem.loadScans(data.progression.totalSulfurScans);
      SulfurSystem.loadMined?.(data.progression.totalSulfurMined || 0);
      UraniumSystem.loadMined?.(data.progression.totalUraniumMined || 0);
      if (typeof LithiumSystem !== 'undefined') LithiumSystem.loadScans(data.progression.totalLithiumScans);
      if (typeof GeothermalSystem !== 'undefined') {
        GeothermalSystem.loadScans(data.progression.totalGeoScans);
        GeothermalSystem.loadTotalSteam(data.progression.totalGeoSteam || 0);
        GeothermalSystem.loadThreeTurbinesEverRan(data.progression.geoThreeTurbinesEverRan);
        GeothermalSystem.loadActivity(data.progression.geoActivity);
      }
      if (typeof ChemicalSystem !== 'undefined')  ChemicalSystem.loadTotalAcidProduced?.(data.progression.totalAcidProduced || 0);
      if (typeof ElectrolyzerSystem !== 'undefined') ElectrolyzerSystem.loadTotalHydrogenProduced?.(data.progression.totalHydrogenProduced || 0);
      if (typeof FuelPlantSystem !== 'undefined')  FuelPlantSystem.loadTotalRods?.(data.progression.totalRodsProduced || 0);
      if (typeof NuclearSystem !== 'undefined')    NuclearSystem.loadTotalSpentFuel?.(data.progression.totalSpentFuel || 0);
      if (typeof ReprocessingSystem !== 'undefined') {
        ReprocessingSystem.loadTotalPlutonium?.(data.progression.totalPlutoniumProduced || 0);
      }
      if (typeof MoxPlantSystem !== 'undefined') {
        MoxPlantSystem.loadTotalMox?.(data.progression.totalMoxProduced || 0);
        ReprocessingSystem.loadTotalSpentFuelConsumed?.(data.progression.totalSpentFuelConsumed || 0);
      }
      if (typeof LithiumSystem !== 'undefined')    LithiumSystem.loadMined?.(data.progression.totalLithiumMined || 0);
      if (typeof LithiumProcessPlantSystem !== 'undefined') LithiumProcessPlantSystem.loadTotalCompoundProduced?.(data.progression.totalCompoundProduced || 0);
      if (typeof AtmosphereCollectorSystem !== 'undefined') AtmosphereCollectorSystem.loadTotalNitrogenProduced?.(data.progression.totalNitrogenProduced || 0);
      if (typeof HaberBoschSystem !== 'undefined') HaberBoschSystem.loadTotalAmmoniaProduced?.(data.progression.totalAmmoniaProduced || 0);
      if (typeof IsotopicWashTowerSystem !== 'undefined') IsotopicWashTowerSystem.loadTotalDeuteriumProduced?.(data.progression.totalDeuteriumProduced || 0);
      if (typeof FusionFuelPlantSystem !== 'undefined') FusionFuelPlantSystem.loadTotalPlasmaProduced?.(data.progression.totalPlasmaProduced || 0);
      if (typeof FusionFuelPlantSystem !== 'undefined') FusionFuelPlantSystem.loadTotalHe3PelletsProduced?.(data.progression.totalHe3PelletsProduced || 0);
      if (typeof AdvancedFusionReactorSystem !== 'undefined') AdvancedFusionReactorSystem.loadTotalPelletsBurned?.(data.progression.totalDhe3Burned || 0);
      if (typeof HulkingFusionReactorSystem !== 'undefined') HulkingFusionReactorSystem.loadTotalHighBetaProduced?.(data.progression.totalHighBetaProduced || 0);
      if (typeof MHDDeceleratorRingSystem !== 'undefined') MHDDeceleratorRingSystem.loadTotalPower?.(data.progression.totalMhdPowerGenerated || 0);
      if (typeof HeliumSystem !== 'undefined') {
        HeliumSystem.loadScans(data.progression.totalHeliumScans || 0);
        HeliumSystem.loadExtracted(data.progression.totalHeliumExtracted || 0);
      }
      if (typeof RareEarthSystem !== 'undefined') {
        RareEarthSystem.loadScans(data.progression.totalRareEarthScans || 0);
        RareEarthSystem.loadMined(data.progression.totalRareEarthMined || 0);
      }
      if (typeof LeachPlantSystem !== 'undefined') LeachPlantSystem.loadTotalOxide(data.progression.totalOxideProduced || 0);
      if (typeof CokeOvenSystem !== 'undefined') { CokeOvenSystem.loadTotalCoke(data.progression.totalCokeProduced || 0); CokeOvenSystem.loadTotalGas(data.progression.totalOvenGasProduced || 0); }
      if (typeof GraphiteFurnaceSystem !== 'undefined') GraphiteFurnaceSystem.loadTotalGraphite(data.progression.totalGraphiteMade || 0);
      if (typeof NuclearSystem !== 'undefined') NuclearSystem.loadTotalGraphiteBurned(data.progression.totalGraphiteBurned || 0);
      if (typeof SuperconductorMillSystem !== 'undefined') SuperconductorMillSystem.loadTotalTape(data.progression.totalTapeProduced || 0);
      // Core ids run on from the built count, so it must come back with the bays.
      if (typeof CoreWorksSystem !== 'undefined') CoreWorksSystem.loadTotals(data.progression.totalCoresBuilt || 0, data.progression.totalCoreCharges || 0);
      if (typeof CryoPlantSystem !== 'undefined') CryoPlantSystem.loadTotalLiquefied(data.progression.totalHeliumLiquefied || 0);
      if (typeof HulkingFusionReactorSystem !== 'undefined') {
        HulkingFusionReactorSystem.loadTotalPelletsBurned(data.progression.totalPelletsBurned || 0);
        HulkingFusionReactorSystem.loadTotalSteamRaised(data.progression.totalFusionSteam || 0);
      }
      if (typeof He3SeparatorSystem !== 'undefined') He3SeparatorSystem.loadTotalHe3Produced(data.progression.totalHe3Produced || 0);
      if (typeof TritiumBreederSystem !== 'undefined') TritiumBreederSystem.loadTotalTritiumBred(data.progression.totalTritiumBred || 0);
      if (typeof LightningDamageSystem !== 'undefined') LightningDamageSystem.loadState(data.progression.lightning);
      OilSystem.loadTotalCrude(data.progression.totalCrudeProduced);
      OilSystem.loadTotalFuelOil(data.progression.totalFuelOilProduced);
      OilSystem.loadTotalLpg(data.progression.totalLpgProduced || 0);
      OilSystem.loadTotalLpgFlared(data.progression.totalLpgFlared || 0);
      OilSystem.loadDepositExhausted(data.progression.oilDepositExhausted);
      HydroSystem.loadTotalWater(data.progression.totalWaterExtracted);
      if (data.progression.totalBiofuelCollected) BiofuelSystem.loadTotalCollected(data.progression.totalBiofuelCollected);
      if (data.water) WaterSystem.load(data.water);
      // After water, which it carves valleys from. Older saves have no
      // terrain block and get a fresh seed (terrain_system.js).
      TerrainSystem.load(data.terrain, data._oldRect ? { cols: data._oldRect.c1 - data._oldRect.c0, rows: data._oldRect.r1 - data._oldRect.r0 } : null);
      if (data.reservoirs && typeof ReservoirSystem !== 'undefined') ReservoirSystem.load(data.reservoirs);
      if (data.government) GovernmentSystem.load(data.government);
      else GovernmentSystem.spawnGovBuilding(); // older save predates Government System — spawn City Hall now
      if (data.playTime) PlayTime.load(data.playTime);
      // else: older save predates Play Time tracking — leave it at 0 (the
      // clock is held until startGame, so the menu never adds to it)
      // Any event still running from before (loading over a game in
      // progress) ends first, before the saved clouds go in: ending a storm
      // clears its sky, which would otherwise undo them.
      WeatherEventSystem._forceEnd(true);
      if (data.weather) {
        CloudState.load(data.weather.cloudCover, data.weather.cloudTarget);
        FrostSystem.load(data.weather.frost);   // before the event below, which may start it snowing again
        DustSystem.load(data.weather.dust);
        if (data.weather.clouds) CloudShadows.load(data.weather.clouds);
        if (data.weather.event) WeatherEventSystem.loadEvent(data.weather.event, data.weather.gameTime || 0, true);
      }
      EventSystem.loadState(data.weather && data.weather.schedule);
      if (typeof SeasonalEvents !== 'undefined') SeasonalEvents.loadState(data.weather && data.weather.calendar);
      if (typeof LaunchSystem !== 'undefined') LaunchSystem.loadState(data.weather && data.weather.launch);
      if (data.progression.zones) {
        ZoneSystem.loadState(data.progression.zones);
      } else {
        // Rebuild from entities for older saves
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++) {
            const e = GridManager.getEntity(c, r);
            if (e && e.col === c && e.row === r && e.fromRequest) ZoneSystem.addBuilding(e);
          }
      }
      if (data.progression.wasteSpawned) {
        WasteSystem.setTriggered(T.COALGENERATOR,  data.progression.wasteSpawned.coal);
        WasteSystem.setTriggered(T.REFINERY,       data.progression.wasteSpawned.oil);
        WasteSystem.setTriggered(T.NUCLEARREACTOR, data.progression.wasteSpawned.nuclear);
      }
      // Restore Wire MK2 hop and throughput upgrades if unlocked
      // The upgrade applies once Power Tower tech is unlocked, regardless
      // of whether a tower is currently placed on the grid.
      PowerNetwork.setWireHops(Progression.isUnlocked(T.POWERTOWER) ? 8 : 4);

      // Restore grid entities
      // Build a deposit registry keyed by anchor position before mines overwrite tiles
      const depositRegistry = new Map();

      // Sort so deposits are always restored before the entities that overwrite their tiles
      data.grid.sort((a, b) => {
        const order = [T.OILDEPOSIT, T.URANIUMDEPOSIT, T.SULFURDEPOSIT, T.LITHIUMDEPOSIT, T.HELIUMDEPOSIT, T.RAREEARTHDEPOSIT, T.GEODEPOSIT, T.AQUIFER, T.COALDEPOSIT];
        const ai = order.indexOf(a.type), bi = order.indexOf(b.type);
        if (ai !== -1 && bi === -1) return -1;
        if (bi !== -1 && ai === -1) return 1;
        return 0;
      });
      data.grid.forEach(s => {
       try {
        // Restore aquifer deposits
        if (s.type === T.AQUIFER) {
          const entity = new Entity(T.AQUIFER, s.col, s.row);
          entity.width      = s.width  || 5;
          entity.height     = s.height || 5;
          entity._waterRate = s._waterRate || 20;
          entity._tierLabel = s._tierLabel || 'Aquifer';
          entity._shapeMask = s._shapeMask || [];
          entity._hasMine   = s._hasMine || false;
          entity._waterBuffer = s._waterBuffer || 0;
          GridManager.setEntityFootprint(entity);
          return;
        }
        // Restore oil deposits
        if (s.type === T.OILDEPOSIT) {
          const entity = new Entity(T.OILDEPOSIT, s.col, s.row);
          entity.width      = s.width  || 2;
          entity.height     = s.height || 2;
          entity._tierLabel = s._tierLabel || 'Oil Deposit';
          entity._oilPhase  = s._oilPhase  || 0;
          entity._pressure  = s._pressure  !== undefined ? s._pressure : 1.0;
          entity._crudeBuffer = s._crudeBuffer || 0;
          // Older saves predate _totalUnits (used for the Pump Jack's "Oil
          // Remaining" readout) — backfill a plausible value from tier size
          // instead of leaving it undefined (which displayed as "0 units").
          entity._totalUnits = s._totalUnits !== undefined ? s._totalUnits
            : Math.round((3000 + Math.random() * 9000) * (entity.width || 2));
          GridManager.setEntityFootprint(entity);
          EntityRegistry.add(entity);
          return;
        }
        // Restore uranium deposits
        if (s.type === T.URANIUMDEPOSIT) {
          const entity = new Entity(T.URANIUMDEPOSIT, s.col, s.row);
          entity.width        = s.width  || 2;
          entity.height       = s.height || 2;
          entity._tierLabel   = s._tierLabel || 'Uranium Deposit';
          entity._uraniumPhase = s._uraniumPhase || 0;
          // Saved before ore reserves existed: seed a full one rather than
          // leaving the deposit infinite.
          entity._oreAmount   = s._oreAmount !== undefined ? s._oreAmount : oreReserveFor(entity.width);
          entity._oreMax      = s._oreMax    !== undefined ? s._oreMax    : entity._oreAmount;
          GridManager.setEntityFootprint(entity);
          EntityRegistry.add(entity);
          return;
        }
        // Restore sulfur deposits
        if (s.type === T.SULFURDEPOSIT) {
          const entity = new Entity(T.SULFURDEPOSIT, s.col, s.row);
          entity.width        = s.width  || 2;
          entity.height       = s.height || 2;
          entity._tierLabel   = s._tierLabel || 'Sulfur Deposit';
          entity._sulfurPhase = s._sulfurPhase || 0;
          // As with uranium: pre-reserve saves get a full ore body.
          entity._oreAmount   = s._oreAmount !== undefined ? s._oreAmount : oreReserveFor(entity.width);
          entity._oreMax      = s._oreMax    !== undefined ? s._oreMax    : entity._oreAmount;
          GridManager.setEntityFootprint(entity);
          EntityRegistry.add(entity);
          return;
        }
        // Restore geothermal deposits
        if (s.type === T.GEODEPOSIT) {
          const entity = new Entity(T.GEODEPOSIT, s.col, s.row);
          entity.width     = s.width  || 2;
          entity.height    = s.height || 2;
          entity._geoPhase = s._geoPhase || 0;
          entity._hasWell  = !!s._hasWell;
          entity._revealed = true;
          GridManager.setEntityFootprint(entity);
          EntityRegistry.add(entity);
          return;
        }
        // Restore lithium deposits
        if (s.type === T.LITHIUMDEPOSIT) {
          const entity = new Entity(T.LITHIUMDEPOSIT, s.col, s.row);
          entity.width         = s.width  || 2;
          entity.height        = s.height || 2;
          entity._tierLabel    = s._tierLabel || 'Lithium Deposit';
          entity._lithiumPhase = s._lithiumPhase || 0;
          // Lithium used to be inexhaustible: saves from then get a full body.
          entity._oreAmount    = s._oreAmount !== undefined ? s._oreAmount : oreReserveFor(entity.width, LITHIUM_MINE_RATE);
          entity._oreMax       = s._oreMax    !== undefined ? s._oreMax    : entity._oreAmount;
          GridManager.setEntityFootprint(entity);
          EntityRegistry.add(entity);
          return;
        }
        // Restore rare earth deposits
        if (s.type === T.RAREEARTHDEPOSIT) {
          const entity = new Entity(T.RAREEARTHDEPOSIT, s.col, s.row);
          entity.width           = s.width  || 2;
          entity.height          = s.height || 2;
          entity._tierLabel      = s._tierLabel || 'Rare Earth Deposit';
          entity._rareEarthPhase = s._rareEarthPhase || 0;
          entity._oreAmount      = s._oreAmount !== undefined ? s._oreAmount : oreReserveFor(entity.width);
          entity._oreMax         = s._oreMax    !== undefined ? s._oreMax    : entity._oreAmount;
          GridManager.setEntityFootprint(entity);
          EntityRegistry.add(entity);
          return;
        }
        // Restore helium gas fields
        if (s.type === T.HELIUMDEPOSIT) {
          const entity = new Entity(T.HELIUMDEPOSIT, s.col, s.row);
          entity.width        = s.width  || 2;
          entity.height       = s.height || 2;
          entity._tierLabel   = s._tierLabel || 'Helium Gas Field';
          entity._heliumPhase = s._heliumPhase || 0;
          entity._oreAmount   = s._oreAmount !== undefined ? s._oreAmount : oreReserveFor(entity.width, HELIUM_WELL_RATE);
          entity._oreMax      = s._oreMax    !== undefined ? s._oreMax    : entity._oreAmount;
          GridManager.setEntityFootprint(entity);
          EntityRegistry.add(entity);
          return;
        }
        if (!T[s.type.toUpperCase()] && !Object.values(T).includes(s.type)) return;
        // Migration: Manufacturing Co moved from the commercial to the
        // industrial pool — re-type existing ones before the entity is built.
        if (s.type === T.COMMERCIAL && s.businessName === 'Manufacturing Co') s.type = T.INDUSTRIAL;
        const entity = new Entity(s.type, s.col, s.row);
        if (s._num !== undefined) entity._num = s._num;
        if (entity.type === T.BIOFUELGEN) entity.def = { ...EntityDefs[T.BIOFUELGEN] };
        if (s._waterTank !== undefined) entity._waterTank = s._waterTank;
        // Dam/turbine restoration
        if (s._spanTiles   !== undefined) entity._spanTiles   = s._spanTiles;
        if (s._flowDc      !== undefined) entity._flowDc      = s._flowDc;
        if (s._flowDr      !== undefined) entity._flowDr      = s._flowDr;
        if (s._reservoirId !== undefined) entity._reservoirId = s._reservoirId;
        if (s._reservoirSide !== undefined) entity._reservoirSide = s._reservoirSide;
        if (s._damCol      !== undefined) entity._damCol      = s._damCol;
        if (s._damRow      !== undefined) entity._damRow      = s._damRow;
        if (s._waterTiles  !== undefined) entity._waterTiles  = s._waterTiles;
        if (s._bridge) entity._bridge = true;
        if (s._filled) entity._filled = true;
        if (s._waterFooting) entity._waterFooting = true;
        if (s._outSideDc   !== undefined) entity._outSideDc   = s._outSideDc;
        if (s._outSideDr   !== undefined) entity._outSideDr   = s._outSideDr;
        if (s._inSideDc    !== undefined) entity._inSideDc    = s._inSideDc;
        if (s._inSideDr    !== undefined) entity._inSideDr    = s._inSideDr;
        if (s._orientation !== undefined) entity._orientation = s._orientation;
        if (entity.type === T.UNDERGNDPIPE) entity._udgAxis = (s._udgAxis === 'v') ? 'v' : 'h';
        if (entity.type === T.UNDERGNDPIPE && s._udgNeg !== undefined) { entity._udgNeg = s._udgNeg; entity._udgPos = s._udgPos; }
        if (entity.type === T.PIPE && s._pipeLinks !== undefined) entity._links = s._pipeLinks;
        if (entity.type === T.CONVEYOR && s._beltLinks !== undefined && !s._udgBelt && !s._splitter) entity._links = s._beltLinks;
        if (entity.type === T.CONVEYOR && s._udgBelt) {
          entity._udgBelt = true;
          entity._udgAxis = (s._udgAxis === 'v') ? 'v' : 'h';
          if (s._udgNeg !== undefined) { entity._udgNeg = s._udgNeg; entity._udgPos = s._udgPos; }
          entity.def      = EntityDefs[T.UNDERGNDCONVEYOR];
        }
        if (entity.type === T.CONVEYOR && s._splitter) initSplitter(entity, { mode: s._splitMode, side: s._splitSide, ratio: s._splitRatio, placed: !!s._placedSplitter });
        if (entity.type === T.CONVEYOR && s._splitter && s._autoSplit) { entity._autoSplit = true; if (s._preSplitLinks !== undefined) entity._preSplitLinks = s._preSplitLinks; }
        if (s._waterTilesShaft !== undefined && entity.type === T.SHAFT) entity._waterTiles = s._waterTilesShaft;
        // Older saves serialised each capture's live water ref; it loads back
        // as a plain object, which would be put on the grid as a broken tile.
        if (entity._waterTiles) for (const t of entity._waterTiles) delete t.entity;
        if (entity.type === T.HYDROTURBINE) entity.def = { ...EntityDefs[T.HYDROTURBINE] };
        if (s._crude     !== undefined) entity._crude     = s._crude;
        if (s._liquidType !== undefined) entity._liquidType = s._liquidType;
        if (s._droneSupply) entity._droneSupply = s._droneSupply;
        if (s._truckSupply) entity._truckSupply = s._truckSupply;
        if (s._draining) entity._draining = true;
        if (entity.type === T.SOLIDSTORAGE) { entity._stored = s._stored || 0; entity._solidType = s._solidType || null; if (s._pelletMode) entity._pelletMode = s._pelletMode; }
        // Houses grew from 1×1 to 2×2. A width/height of 1 is never saved, so
        // a plain house (or Mae's Cabin, or a suburb lot) without one was
        // built at 1×1 — it keeps that, rather than taking the new 2×2
        // default and spilling onto its neighbours.
        if (entity.type === T.HOUSE && !s.commercialSubtype && s.width === undefined && s.height === undefined) {
          entity.width = 1; entity.height = 1;
        }
        // Migration: fix commercial footprints to match subtype def
        // The saved width/height are also rewritten, otherwise the generic
        // "restore saved width/height" a few lines below reapplies the stale
        // footprint and the migration has no visible effect (same trap the
        // Gas Station migration below documents).
        // Industrial customers key off the same SubtypeFootprints table, and
        // their sizes get rebalanced too (the EV Battery Factory went 4×2 ->
        // 6×4), so they need the identical treatment — otherwise a plant in an
        // existing save keeps the footprint it was built at forever.
        if ((entity.type === T.COMMERCIAL || entity.type === T.INDUSTRIAL ||
             entity.type === T.HOUSE) && entity.commercialSubtype) {
          const _fp = entityFootprint ? entityFootprint(entity.type, entity.commercialSubtype) : null;
          // (Solvent Works and the buildings whose art grew are the exception:
          // see the subtype restore below.)
          if (_fp && !(_growsOnLoad(entity) && s.width && s.height &&
              (s.width < _fp.width || s.height < _fp.height))) {
            entity.width = _fp.width; entity.height = _fp.height;
            if (s.width  !== undefined) s.width  = _fp.width;
            if (s.height !== undefined) s.height = _fp.height;
          }
        }
        // Migration: Gas Station footprint was increased to 6×5 (from 4×3).
        // Older saves still have the old width/height recorded, and the
        // generic "restore saved width/height" below would otherwise keep
        // reapplying that stale smaller size forever — which is why a
        // resized Gas Station "stayed the same size" after loading a save
        // made before the change. Always take the current def's footprint
        // instead of trusting what was saved, same as the migrations above.
        if (entity.type === T.GASSTATION) {
          entity.width  = EntityDefs[T.GASSTATION].width;
          entity.height = EntityDefs[T.GASSTATION].height;
          if (s.width  !== undefined) s.width  = entity.width;
          if (s.height !== undefined) s.height = entity.height;
        }
        // Migration: Survey Station footprint was increased to 4×4 (from 3×3).
        // Same reasoning as the Gas Station above — take the current def
        // rather than the saved size, or stations in existing worlds stay the
        // old size forever while newly built ones are bigger.
        if (entity.type === T.SURVEY) {
          entity.width  = EntityDefs[T.SURVEY].width;
          entity.height = EntityDefs[T.SURVEY].height;
          if (s.width  !== undefined) s.width  = entity.width;
          if (s.height !== undefined) s.height = entity.height;
        }
        // Migration: Geothermal Turbine footprint was increased to 5×4 (from
        // 4×3). Same reasoning as the two above — take the current def, or
        // turbines in existing worlds keep the old size forever while newly
        // built ones are bigger. Note this grows the footprint down and to
        // the right, so a turbine that was packed tight against a neighbour
        // in an old save now overlaps it; the well link is unaffected because
        // it is resolved from the output port, not the footprint bounds.
        if (entity.type === T.GEOTURBINE) {
          entity.width  = EntityDefs[T.GEOTURBINE].width;
          entity.height = EntityDefs[T.GEOTURBINE].height;
          if (s.width  !== undefined) s.width  = entity.width;
          if (s.height !== undefined) s.height = entity.height;
        }
        // Migration: Hyperion Station grew to 64×40 (from 28×18) — bigger than the
        // Fusion Research Facility, as the endgame centrepiece. Current def wins.
        if (entity.type === T.NATIONALGRID) {
          entity.width  = EntityDefs[T.NATIONALGRID].width;
          entity.height = EntityDefs[T.NATIONALGRID].height;
          if (s.width  !== undefined) s.width  = entity.width;
          if (s.height !== undefined) s.height = entity.height;
        }
        // Migration: the Fusion Research Facility grew to 56×32 (from 20×16),
        // twice the airport each way. Same take-the-current-def reasoning as
        // above; it grows down and to the right, so a saved lab packed against
        // a neighbour will now overlap it.
        if (entity.type === T.FUSIONLAB) {
          entity.width  = EntityDefs[T.FUSIONLAB].width;
          entity.height = EntityDefs[T.FUSIONLAB].height;
          if (s.width  !== undefined) s.width  = entity.width;
          if (s.height !== undefined) s.height = entity.height;
        }
        // The civic buildings and parks with people drawn on them grew so
        // those people stand at street scale (ArtFootprints). Like Solvent
        // Works below, one built at its old size keeps it here and the
        // post-load pass grows it only where there's room.
        // The Carbon Capture Plant grew to 10×8 (from 6×5) the same way: its
        // sprite draws to whatever footprint it has, so a packed-in one just
        // stays small (it isn't moved, only grown in place).
        if ((ArtFootprints.type[entity.type] || entity.type === T.CARBONCAPTURE) && !entity.commercialSubtype && s.width && s.height &&
            (s.width < entity.width || s.height < entity.height)) {
          entity._legacyFp = true;
          entity.width = s.width; entity.height = s.height;
        }
        // Migration: Geothermal Well footprint was REDUCED to 3×2 (from 3×3)
        // — the sprite never reached the bottom row. Same take-the-current-def
        // reasoning as the three above, but shrinking, so unlike the turbine
        // it can't overlap a neighbour: it frees a row rather than claiming
        // one. The sprite and the steam output port are pinned to
        // GEOWELL.visualHeight, so wells in existing worlds neither move nor
        // change size on screen, and their turbines stay linked.
        if (entity.type === T.GEOWELL) {
          entity.width  = EntityDefs[T.GEOWELL].width;
          entity.height = EntityDefs[T.GEOWELL].height;
          if (s.width  !== undefined) s.width  = entity.width;
          if (s.height !== undefined) s.height = entity.height;
        }
        // Migration: Cryogenic Cooling Tower footprint was REDUCED to 15×17
        // (from 15×19) — the bottom two rows were empty grass under the
        // striped base. Only rewrite towers still storing the old height so
        // an already-17 tower is left alone; anchor stays put (rows drop off
        // the bottom). Art and pipe stubs are pinned to layoutHeight, so the
        // drawing and H₂O IN / COOL OUT tiles do not move.
        if (entity.type === T.COOLINGTOWER2 && (s.height === 19 || entity.height === 19)) {
          entity.height = EntityDefs[T.COOLINGTOWER2].height;
          if (s.height !== undefined) s.height = entity.height;
        }
        // Migration: Hydroelectric Generator footprint was REDUCED to 7×7
        // (from 9×9, and 10×10 before that). Shrink any gen still storing a
        // larger square size. Shift the anchor so the shaft-input port
        // (see ShaftSystem.tick: the tile beside the input face, centred on
        // floor(size/2)) stays on the same world tile; the new footprint is
        // always a subset of the old one. If a claimed tile would somehow
        // overlap another building, leave that gen at the old size rather
        // than corrupting the save.
        if (entity.type === T.HYDROGENERATOR) {
          const _nw = EntityDefs[T.HYDROGENERATOR].width;
          const _nh = EntityDefs[T.HYDROGENERATOR].height;
          const _ow = s.width  !== undefined ? s.width  : entity.width;
          const _oh = s.height !== undefined ? s.height : entity.height;
          if (_ow > _nw && _oh > _nh) {
            const _oc = entity.col, _or = entity.row;
            const _dc = entity._inSideDc || 0, _dr = entity._inSideDr || 0;
            const _midC = Math.floor(_ow / 2) - Math.floor(_nw / 2);
            const _midR = Math.floor(_oh / 2) - Math.floor(_nh / 2);
            let _nc = _oc, _nr = _or;
            if (_dc > 0)      { _nc = _oc + (_ow - _nw); _nr = _or + _midR; } // east
            else if (_dc < 0) { _nr = _or + _midR; }                          // west
            else if (_dr > 0) { _nc = _oc + _midC; _nr = _or + (_oh - _nh); } // south
            else if (_dr < 0) { _nc = _oc + _midC; }                          // north
            // else: no input side set — keep anchor, drop right + bottom
            let _blocked = false;
            for (let r = _nr; r < _nr + _nh && !_blocked; r++) {
              for (let c = _nc; c < _nc + _nw && !_blocked; c++) {
                const inOld = c >= _oc && c < _oc + _ow && r >= _or && r < _or + _oh;
                if (inOld) continue;
                if (!GridManager.inBounds(c, r) || GridManager.getEntity(c, r)) _blocked = true;
              }
            }
            if (!_blocked) {
              entity.col = _nc; entity.row = _nr;
              entity.width = _nw; entity.height = _nh;
              s.col = _nc; s.row = _nr;
              s.width = _nw; s.height = _nh;
            }
          }
        }
        // Migration: the three Waste Processing Facilities grew (Coal and Oil by 2×2, Nuclear by 4×4)
        // (Coal 6×5→8×7, Oil 6×7→8×9, Nuclear 9×7→13×11). Same reasoning as
        // the migrations above — always take the current def.
        // Coal Mine MK2 also grew by 2×2 (4×4→6×6), and so did the Fiber Hub
        // (3×3→5×5) when it moved to MK3.
        // (The Helium-3 Separator used to be in this list; since it grew to
        // 18×18 a built one keeps its saved size instead — forcing the new
        // size would push it over whatever stands next to it.)
        if (entity.type === T.COALWASTE || entity.type === T.OILWASTE || entity.type === T.NUCLEARWASTE || entity.type === T.COALMINE2 || entity.type === T.FIBERHUB) {
          entity.width  = EntityDefs[entity.type].width;
          entity.height = EntityDefs[entity.type].height;
          if (s.width  !== undefined) s.width  = entity.width;
          if (s.height !== undefined) s.height = entity.height;
        }
        // Migration: Coal Mine MK2 used to sit on its deposit top-left tile;
        // it now builds centred on the deposit (_coalMineFootprint, input_manager.js).
        // Shift mines still anchored top-left so old saves match new builds.
        if (entity.type === T.COALMINE2 && s._depositCol !== undefined &&
            entity.col === s._depositCol && entity.row === s._depositRow) {
          entity.col = Math.max(0, entity.col - Math.floor((EntityDefs[T.COALMINE2].width  - (s._depositWidth  || 2)) / 2));
          entity.row = Math.max(0, entity.row - Math.floor((EntityDefs[T.COALMINE2].height - (s._depositHeight || 2)) / 2));
          s.col = entity.col; s.row = entity.row;
        }
        // Coal Mine MK1 now builds a tile out from its deposit on every side
        // (_coalMineFootprint, input_manager.js). Mines already built keep the
        // size and anchor they were built at — deliberately NOT migrated like
        // the MK2 above, because growing one would swallow the conveyor on its
        // output stub — and their saved width/height does that. Only a record
        // with no saved size (very old saves) would otherwise pick up the new
        // 4×4 default at its old top-left anchor; give it the old exact-cover
        // size instead.
        if (entity.type === T.COALMINE && s.width === undefined) {
          entity.width  = s._depositWidth  || 2;
          entity.height = s._depositHeight || 2;
        }
        // Migration: Oil Refinery grew by 2×2 (5×4→7×6). Take the current def
        // like the migrations above, but grow UP and to the right: the anchor
        // steps up by the added height, so the left face (CRUDE IN stub) and
        // bottom face (FUEL OUT stub) stay on exactly the tiles they were on.
        // Pipes laid to the old stubs are never swallowed by the new
        // footprint and still touch it, so crude and fuel oil keep flowing.
        if (entity.type === T.REFINERY && (s.width || 5) < EntityDefs[T.REFINERY].width) {
          const _rw = EntityDefs[T.REFINERY].width, _rh = EntityDefs[T.REFINERY].height;
          entity.row = Math.max(0, entity.row - (_rh - (s.height || 4)));
          s.row = entity.row;
          entity.width = _rw; entity.height = _rh;
          s.width = _rw; s.height = _rh;
        }
        // Migration: City Hall grew by 2×2 (4×4→6×6). Take the current def
        // like the migrations above, and step the anchor up and left by one
        // tile per side so the building grows evenly around the spot it
        // stood on (and stays centred in its government zone, which is
        // rebuilt from it on load) rather than spreading down and right.
        if (entity.type === T.GOVBUILDING && (s.width || 4) < EntityDefs[T.GOVBUILDING].width) {
          const _gw = EntityDefs[T.GOVBUILDING].width, _gh = EntityDefs[T.GOVBUILDING].height;
          entity.col = Math.max(0, entity.col - Math.floor((_gw - (s.width  || 4)) / 2));
          entity.row = Math.max(0, entity.row - Math.floor((_gh - (s.height || 4)) / 2));
          s.col = entity.col; s.row = entity.row;
          entity.width = _gw; entity.height = _gh;
          s.width = _gw; s.height = _gh;
        }
        // Migration: Circuit Switch MK2 went 7×7 → 6×5 (its top and bottom
        // rows and its left column were empty ground). Step the anchor in
        // so the compound stays exactly where it was drawn; the freed tiles
        // clear. (7×5 saves from in between only lose the left column.)
        if (entity.type === T.CIRCUITSWITCH2) {
          const _d = EntityDefs[T.CIRCUITSWITCH2];
          if ((s.height || 0) > _d.height) {
            entity.row += Math.floor((s.height - _d.height) / 2); s.row = entity.row;
            entity.height = s.height = _d.height;
          }
          if ((s.width || 0) > _d.width) {
            entity.col += s.width - _d.width; s.col = entity.col;
            entity.width = s.width = _d.width;
          }
        }
        // Trucks saved before their footprint was written whole (see
        // serialiseEntity): width 3 and no height is one put down facing
        // east, 3×1. One saved as 3×3 has already been through that load;
        // which way it was first turned is gone, and it has driven off
        // since, so it gets the type's own footprint back.
        if (entity.type === T.TRUCK && s.width === 3) {
          if (s.height === undefined) s.height = 1;
          else if (s.height === 3) { s.width = EntityDefs[T.TRUCK].width; s.height = EntityDefs[T.TRUCK].height; }
        }
        if (s.width             !== undefined) entity.width             = s.width;
        if (s.height            !== undefined) entity.height            = s.height;
        // Migration: re-derive shaft footprint from orientation, overriding
        // whatever width/height came from the save. Older saves written
        // before the shaft width/height fix persisted a vertical shaft's
        // width as undefined (omitted because it equalled 1, the "no need
        // to save" convention every other entity uses) — those saves still
        // load with a corrupted 3×3 footprint otherwise. Orientation was
        // always saved correctly, so it's the reliable source of truth here.
        if (entity.type === T.SHAFT) {
          const ori = entity._orientation === 'v' ? 'v' : 'h';
          entity.width  = ori === 'h' ? 3 : 1;
          entity.height = ori === 'h' ? 1 : 3;
        }
        if (s.charge            !== null && s.charge   !== undefined) entity.charge             = s.charge;
        if (s.dailyFee          !== null && s.dailyFee !== undefined) entity.dailyFee           = s.dailyFee;
        if (s._biofuel     !== undefined) entity._biofuel     = s._biofuel;
        if (s._population  !== undefined) entity._population  = s._population;
        if (s._aquiferCol  !== undefined) entity._aquiferCol  = s._aquiferCol;
        if (s._aquiferRow  !== undefined) entity._aquiferRow  = s._aquiferRow;
        if (s._aquiferWidth !== undefined) entity._aquiferWidth = s._aquiferWidth;
        if (s._aquiferHeight !== undefined) entity._aquiferHeight = s._aquiferHeight;
        if (s._aquiferRate !== undefined) entity._aquiferRate = s._aquiferRate;
        if (s.familyName    !== undefined) entity.familyName    = s.familyName;
        if (s._scanning    !== undefined) entity._scanning    = s._scanning;
        if (s._scanProgress!== undefined) entity._scanProgress= s._scanProgress;
        if (s._scanType    !== undefined) entity._scanType    = s._scanType;
        if (s._scanPowerInput !== undefined) entity._scanPowerInput = s._scanPowerInput;
        if (s._scanDuration!== undefined) entity._scanDuration= s._scanDuration;
        if (Array.isArray(s._scanSlots)) {
          entity._scanSlots = s._scanSlots.map(x => x && x.type ? { type: x.type, progress: +x.progress || 0, duration: +x.duration || 60, power: +x.power || 0 } : null);
          entity._scanning  = entity._scanSlots.some(x => !!x);
        }
        if (s.reliability       !== undefined) entity.reliability       = s.reliability;
        if (s.commercialSubtype !== undefined) {
          entity.commercialSubtype = s.commercialSubtype;
          applySubtypeFootprint(entity);
          // Solvent Works grew 4×4 -> 6×6 (and the Launch Complex 16×11 ->
          // 24×16, and every building in ArtFootprints so the people on it
          // stand at street scale). Forcing that here would push a packed-in
          // plant over its neighbours, so it keeps its saved size and the
          // post-load pass below grows it only where there's room.
          if (_growsOnLoad(entity) && s.width && s.height &&
              (s.width < entity.width || s.height < entity.height)) {
            entity._legacyFp = true;
            entity.width = s.width; entity.height = s.height;
          }
        }
        if (s.houseWealthTier   !== undefined) entity.houseWealthTier   = s.houseWealthTier;
        if (s.businessName      !== undefined) entity.businessName      = s.businessName;
        // Migration: the industrial Chemical Plant customer became Solvent
        // Works (so it isn't confused with the placeable Chemical Plant).
        // Renamed here, before the pool lookup below, so it keeps its draw.
        if (entity.businessName === 'Chemical Plant' && (entity.commercialSubtype === 'chemical' || entity.commercialSubtype === 'factory'))
          entity.businessName = 'Solvent Works';
        // minDraw/peakDraw aren't serialised — they're pool data, not player
        // state — so restore them from the live pool entry by name. Without
        // this a loaded commercial/industrial customer lost its pool draw and
        // fell back to the shared def.powerInput (30 kW for industrial), which
        // both overstated light loads and made pool rebalances (e.g. the
        // Textile Mill dropping to 12 kW) invisible in existing worlds.
        if (entity.businessName && typeof HouseRequestSystem !== 'undefined') {
          const _pe = HouseRequestSystem.lookupPoolEntry?.(entity.businessName);
          if (_pe) {
            if (_pe.peakDraw != null) entity.peakDraw = _pe.peakDraw;
            if (_pe.minDraw  != null) entity.minDraw  = _pe.minDraw;
            if (_pe.idleDraw != null) entity.idleDraw = _pe.idleDraw;
          }
        }
        if (s.wear              !== undefined) entity.wear              = s.wear;
        if (s.dust              !== undefined) entity.dust              = s.dust;
        if (s._saltKWh          !== undefined) entity._saltKWh          = s._saltKWh;
        if (s.fromRequest       !== undefined) entity.fromRequest       = s.fromRequest;
        if (s._clientOwned)                    entity._clientOwned      = true;
        if (s._fuelDepot)                      entity._fuelDepot        = true;
        if (s.upfrontPaid       !== undefined) entity.upfrontPaid       = s.upfrontPaid;
        if (s.demandScale       !== undefined) entity.demandScale       = s.demandScale;
        if (s._placedAt         !== undefined) entity._placedAt         = s._placedAt;
        if (s._movedIn          !== undefined) entity._movedIn          = s._movedIn;
        if (s._build) {
          entity._constructing = true; entity._buildDone = s._build[0]; entity._buildTotal = s._build[1];
          if (s._build[2] != null) entity._siteKW = s._build[2];
        }
        if (s._paid             !== undefined) entity._paid             = s._paid;
        if (s._lightningDamaged !== undefined) entity._lightningDamaged = s._lightningDamaged;
        if (s._fireOut          !== undefined) entity._fireOut          = s._fireOut;
        if (s._strikesAbsorbed  !== undefined) entity._strikesAbsorbed  = s._strikesAbsorbed;
        if (s._repairRemaining  !== undefined) entity._repairRemaining  = s._repairRemaining;
        if (s._repairTotal      !== undefined) entity._repairTotal      = s._repairTotal;
        if (s._rebuildFrac      !== undefined) entity._rebuildFrac      = s._rebuildFrac;
        if (s._irreparable) entity._irreparable = true;
        if (s._blastDir !== undefined) entity._blastDir = s._blastDir;
        if (s._pumpTripped) { entity._pumpTripped = true; entity._pumpRestart = s._pumpRestart ?? 45; }
        if (s._waterReserve !== undefined) entity._waterReserve = s._waterReserve;
        if (s._fireSpreadT      !== undefined) entity._fireSpreadT      = s._fireSpreadT;
        if (s._genBurnT         !== undefined) entity._genBurnT         = s._genBurnT;
        if (s._surgeRemaining   !== undefined) entity._surgeRemaining   = s._surgeRemaining;
        if (s._surgeTotal       !== undefined) entity._surgeTotal       = s._surgeTotal;
        if (s._surgePeak        !== undefined) entity._surgePeak        = s._surgePeak;
        if (s._graceElapsed     !== undefined) entity._graceElapsed     = s._graceElapsed;
        if (s._churnTimer       !== undefined) entity._churnTimer       = s._churnTimer;
        if (s._churnWarned      !== undefined) entity._churnWarned      = s._churnWarned;
        if (s._outageTimer      !== undefined) entity._outageTimer      = s._outageTimer;
        if (s._outageWarned     !== undefined) entity._outageWarned     = s._outageWarned;
        if (s._switchOpen       !== undefined) entity._switchOpen       = s._switchOpen;
        if (s._autoMode         !== undefined) entity._autoMode         = s._autoMode;
        if (s._autoTripped      !== undefined) entity._autoTripped      = s._autoTripped;
        if (s._members          !== undefined) entity._members          = s._members;
        if (s._everPowered)                    entity._everPowered      = true;
        if (s._unconnectedTicks !== undefined) entity._unconnectedTicks = s._unconnectedTicks;
        if (s._plumeLvl         !== undefined) entity._plumeLvl         = s._plumeLvl;
        if (s._plumeReach       !== undefined) entity._plumeReach       = s._plumeReach;
        if (s._wx               !== undefined) entity._wx               = s._wx;
        if (s._wy               !== undefined) entity._wy               = s._wy;
        if (s._angle            !== undefined) entity._angle            = s._angle;
        if (s._vx               !== undefined) entity._vx               = s._vx;
        if (s._vy               !== undefined) entity._vy               = s._vy;
        if (s._path             !== undefined) entity._path             = s._path;
        if (s._patrolIdx        !== undefined) entity._patrolIdx        = s._patrolIdx;
        if (s._patrolling       !== undefined) entity._patrolling       = s._patrolling;
        if (s._destQueue        !== undefined) entity._destQueue        = s._destQueue;
        if (s._queueIdx         !== undefined) entity._queueIdx         = s._queueIdx;
        if (s._queueLoop        !== undefined) entity._queueLoop        = s._queueLoop;
        if (s._autoDispatch     !== undefined) entity._autoDispatch     = s._autoDispatch;
        // A dispatched truck saved in the instant it arrived: truck.js stops
        // patrolling and raises _legDone together, but _legDone wasn't saved,
        // so it loaded parked with its leg never finishing — stuck for good.
        // It's saved now, because parked with dispatch running also means the
        // player pressed Stop, and guessing "arrived" drove that truck off
        // again on every load. Older saves without it still get the guess.
        if (s._legDone !== undefined) entity._legDone = s._legDone;
        else if (entity.type === T.TRUCK && entity._autoDispatch && !entity._patrolling && entity._destQueue && entity._destQueue.length) entity._legDone = true;
        if (s._autoHaulJob      !== undefined) entity._autoHaulJob      = s._autoHaulJob;
        if (s._name             !== undefined) entity._name             = s._name;
        if (s._hauler) {
          entity._hauler = true;
          entity.def = EntityDefs[T.HAULER];
          if (s._haulerOn === false) entity._haulerOn = false;
          if (s._cargoKind) entity._cargoKind = s._cargoKind;
          if (s._cargoMeta) entity._cargoMeta = s._cargoMeta;
        }
        // Re-enter automation through enable() rather than just restoring the
        // flag: it resets the per-truck planner scratch (blacklist, claim,
        // leg snapshot) that is deliberately NOT saved, so a reloaded truck
        // plans fresh instead of judging a leg from the previous session.
        if (s._autoHaulEnabled) entity._autoHaulPendingEnable = true;
        if (s._cargoAmount      !== undefined) entity._cargoAmount      = s._cargoAmount;
        if (s._cargoFacility    !== undefined) entity._cargoFacility    = s._cargoFacility;
        if (s._cargoLabel       !== undefined) entity._cargoLabel       = s._cargoLabel;
        if (s._truckFuel        !== undefined) entity._fuel             = s._truckFuel;
        if (s._fuelStored       !== undefined) entity._fuelStored       = s._fuelStored;
        if (s._coveredDeposits  !== undefined) entity._coveredDeposits  = s._coveredDeposits;
        if (s.coalAmount        !== undefined) entity.coalAmount        = s.coalAmount;
        if (s.coalMax           !== undefined) entity.coalMax           = s.coalMax;
        if (s._revealed         !== undefined) entity._revealed         = s._revealed;
        CoalSystem.restore(entity, s);
        if (s._rotation         !== undefined) entity._rotation         = s._rotation;
        if (s._lakeConnected    !== undefined) entity._lakeConnected    = s._lakeConnected;
        if (s._waterBuffer      !== undefined) entity._waterBuffer      = s._waterBuffer;
        if (s._portRot          !== undefined) entity._portRot          = s._portRot;
        if (s._fuelOil          !== undefined) entity._fuelOil          = s._fuelOil;
        if (s._lpg              !== undefined) entity._lpg              = s._lpg;
        if (s._crudeBuffer      !== undefined) entity._crudeBuffer      = s._crudeBuffer;
        if (s._coalBuffer       !== undefined) entity._coalBuffer       = s._coalBuffer;
        if (s._uraniumStored    !== undefined) entity._uraniumStored    = s._uraniumStored;
        if (s._sulfurStored     !== undefined) entity._sulfurStored     = s._sulfurStored;
        if (s._lithiumStored    !== undefined) entity._lithiumStored    = s._lithiumStored;
        if (s._rareEarthStored  !== undefined) entity._rareEarthStored  = s._rareEarthStored;
        if (s._oxide            !== undefined) entity._oxide            = s._oxide;
        if (s._tailings         !== undefined) entity._tailings         = s._tailings;
        if (s._tape             !== undefined) entity._tape             = s._tape;
        if (s._coalBunker       !== undefined) entity._coalBunker       = s._coalBunker;
        if (s._coke             !== undefined) entity._coke             = s._coke;
        if (s._ovenGas          !== undefined) entity._hydrogen         = s._ovenGas;
        if (s._cokeStock        !== undefined) entity._cokeStock        = s._cokeStock;
        if (s._graphite         !== undefined) entity._graphite         = s._graphite;
        if (s._tapeStock        !== undefined) entity._tapeStock        = s._tapeStock;
        if (Array.isArray(s._bays))            entity._bays             = s._bays;
        if (s._offPeak          !== undefined) entity._offPeak          = s._offPeak;
        if (s._buildCores       !== undefined) entity._buildCores       = s._buildCores;
        if (Array.isArray(s._cores))           entity._cores            = s._cores;
        if (s._coreOut          !== undefined) entity._coreOut          = s._coreOut;
        if (s._coreSlots        !== undefined) entity._coreSlots        = s._coreSlots;
        if (s._coreFuelK        !== undefined) entity._coreFuelK        = s._coreFuelK;
        if (Array.isArray(s._coreCargo))       entity._coreCargo        = s._coreCargo;
        if (s._fuelled          !== undefined) entity._fuelled          = s._fuelled;
        if (s._fuelTank         !== undefined) entity._fuelTank         = s._fuelTank;
        if (s._fgThrottle       !== undefined) entity._fgThrottle       = s._fgThrottle;
        if (s._fgHeat           !== undefined) entity._fgHeat           = s._fgHeat;
        if (s._fgTrip           !== undefined) entity._fgTrip           = s._fgTrip;
        if (s._fgRpm            !== undefined) entity._fgRpm            = s._fgRpm;
        if (s._fgIgnited        !== undefined) entity._fgIgnited        = s._fgIgnited;
        if (s.powered) entity.powered = true;
        // Saves from before the engine model: a generator that was running
        // resumes running instead of cranking from cold.
        if (entity.type === T.FUELGEN && s._fgIgnited === undefined && s._fuelled) { entity._fgIgnited = true; entity._fgRpm = 1; entity._fgHeat = entity._fgHeat ?? 0.5; }
        if (s._hopperCoal       !== undefined) entity._hopperCoal       = s._hopperCoal;
        if (s._outputVariance   !== undefined) entity._outputVariance   = s._outputVariance;
        if (s._hasMine          !== undefined) entity._hasMine          = s._hasMine;
        if (s._coalRate         !== undefined) entity._coalRate         = s._coalRate;
        if (s._biofuel          !== undefined) entity._biofuel          = s._biofuel;
        if (s._wellCol             !== undefined) entity._wellCol             = s._wellCol;
        if (s._wellRow             !== undefined) entity._wellRow             = s._wellRow;
        if (s._depositCol          !== undefined) entity._depositCol          = s._depositCol;
        if (s._depositRow          !== undefined) entity._depositRow          = s._depositRow;
        if (s._depositWidth        !== undefined) entity._depositWidth        = s._depositWidth;
        if (s._depositHeight       !== undefined) entity._depositHeight       = s._depositHeight;
        if (s._depositCoalAmount   !== undefined) entity._depositCoalAmount   = s._depositCoalAmount;
        if (s._depositCoalMax      !== undefined) entity._depositCoalMax      = s._depositCoalMax;
        // These were saved (see the pump jack's serialised _depositXxx fields
        // above) but never copied back onto the loaded entity — the deposit
        // reconstruction block below reads them straight off the pump jack,
        // so without this they always fell back to defaults (generic tier
        // label, oil phase 0, empty crude buffer) after any save/load where
        // the deposit itself wasn't independently found on the grid.
        if (s._depositPressure     !== undefined) entity._depositPressure     = s._depositPressure;
        if (s._depositTierLabel    !== undefined) entity._depositTierLabel    = s._depositTierLabel;
        if (s._depositOilPhase     !== undefined) entity._depositOilPhase     = s._depositOilPhase;
        if (s._depositCrudeBuffer  !== undefined) entity._depositCrudeBuffer  = s._depositCrudeBuffer;
        if (s._depositTotalUnits   !== undefined) entity._depositTotalUnits   = s._depositTotalUnits;
        if (entity.type === T.COALGENERATOR)   entity.def               = { ...EntityDefs[T.COALGENERATOR] };
        if (entity.type === T.COALGENERATOR && s._ashWaste !== undefined) entity._ashWaste = s._ashWaste;
        if ((entity.type === T.WIRE || entity.type === T.POLE) && s._netName) entity._netName = s._netName;   // GRID panel network name
        if (s._ice > 0) { entity._ice = s._ice; entity._iceStopped = !!s._iceStopped; TurbineIcing.noteLoaded(); }   // blade ice
        if (entity.type === T.COALGENERATOR) {
          if (s._cgThrottle !== undefined) entity._cgThrottle = s._cgThrottle;
          if (s._cgTrip     !== undefined) entity._cgTrip     = s._cgTrip;
          // Saves from before the boiler model: start a generator that was
          // running at settled Normal pressure, so it doesn't reload cold.
          entity._cgPressure = s._cgPressure !== undefined ? s._cgPressure
            : (s._fuelled ? EntityDefs[T.COALGENERATOR].throttleModes.normal.pressure : 0);
        }
        if (entity.type === T.COALMINE)        entity.def               = { ...EntityDefs[T.COALMINE] };
        AmenityRequestSystem.restore(entity, s);
        if (s._zoneKey !== undefined) entity._zoneKey = s._zoneKey;

        // Register deposits before they get overwritten by mines
        if (entity.type === T.COALDEPOSIT) {
          depositRegistry.set(`${entity.col},${entity.row}`, entity);
        }

        // Shafts sit over live water (WaterSystem.load laid it down above):
        // relink the capture to it before the footprint claims the tiles, so
        // removing the shaft hands back that same water entity.
        // Bridges likewise: they claim the tiles, the water stays water. So
        // does a Power Tower stood on footings.
        if ((entity._bridge || entity._waterFooting) && entity._waterTiles) WaterBuild.relinkBridge(entity);
        if (entity.type === T.SHAFT && entity._waterTiles) {
          for (const t of entity._waterTiles) {
            const w = GridManager.inBounds(t.c, t.r) ? GridManager.tiles[t.r][t.c] : null;
            if (w && w.type === T.WATER) t.entity = w;
          }
        }
        if (entity.type === T.DAM && entity._spanTiles) {
          // Place along the recorded river span (may be non-rectangular)
          for (const t of entity._spanTiles) {
            if (GridManager.inBounds(t.c, t.r)) GridManager.tiles[t.r][t.c] = entity;
          }
          EntityRegistry.add(entity);
        } else if (entity.type === T.TRUCK) {
          // Trucks never occupy grid tiles, even at placement (see
          // input_manager.js's T.TRUCK branch) — they live entirely in
          // world-space (_wx/_wy) and patrol with skipGrid=true, driving
          // over pipes/conveyors/wires without disturbing them. Stamping a
          // truck onto GridManager here at its last saved col/row used to
          // silently EntityRegistry.remove() whatever occupied that tile
          // (e.g. a pipe or conveyor the truck happened to be crossing at
          // save time) — permanently deleting it with no way to replace it,
          // since patrol movement never restamps the grid to give it back.
          EntityRegistry.add(entity);
        } else if (entity.width > 1 || entity.height > 1) GridManager.setEntityFootprint(entity);
        else                                        GridManager.setEntity(s.col, s.row, entity);
        reviveStack(entity, s);
        if (OilSystem.isPumpJack(entity))   EntityRegistry.add(entity);
        if (entity.type === T.CHEMICALPLANT) { EntityRegistry.add(entity); entity.def = { ...EntityDefs[T.CHEMICALPLANT] }; if (s._acid !== undefined) entity._acid = s._acid; }
        if (entity.type === T.GASSTORAGE) {
          EntityRegistry.add(entity); entity.def = { ...EntityDefs[T.GASSTORAGE] };
          const K = s._gasType && GasStorageSystem.KINDS[s._gasType];
          if (K && s._gasStored > 0) { entity._gasType = s._gasType; entity[K.field] = s._gasStored; }
        }
        if (entity.type === T.ELECTROLYZER) { EntityRegistry.add(entity); entity.def = { ...EntityDefs[T.ELECTROLYZER] }; if (s._hydrogen !== undefined) entity._hydrogen = s._hydrogen; }
        if (entity.type === T.FUELPLANT)     { EntityRegistry.add(entity); entity.def = { ...EntityDefs[T.FUELPLANT] };     if (s._rods !== undefined) entity._rods = s._rods; entity._truckAcid = s._truckAcid || 0; entity._truckUranium = s._truckUranium || 0; }
        if (entity.type === T.LITHIUMPROCESSPLANT) { EntityRegistry.add(entity); entity.def = { ...EntityDefs[T.LITHIUMPROCESSPLANT] }; if (s._compound !== undefined) entity._compound = s._compound; }
        if (entity.type === T.SPENTFUELPOOL) { EntityRegistry.add(entity); entity.def = { ...EntityDefs[T.SPENTFUELPOOL] }; SpentFuelPoolSystem.restore(entity, s._pool); }
        if (entity.type === T.REPROCESSOR) { EntityRegistry.add(entity); entity.def = { ...EntityDefs[T.REPROCESSOR] }; if (s._plutonium !== undefined) entity._plutonium = s._plutonium; if (s._recovered !== undefined) entity._recovered = s._recovered; if (s._hlw !== undefined) entity._hlw = s._hlw; }
        if (entity.type === T.MOXPLANT) { EntityRegistry.add(entity); entity.def = { ...EntityDefs[T.MOXPLANT] }; if (s._mox !== undefined) entity._mox = s._mox; }
        if (entity.type === T.DRONECHARGER) { EntityRegistry.add(entity); entity.def = { ...EntityDefs[T.DRONECHARGER] }; }
        if (entity.type === T.DRONEPORT) { EntityRegistry.add(entity); entity.def = { ...EntityDefs[T.DRONEPORT] }; if (typeof DroneSystem !== 'undefined') DroneSystem.loadFleet(entity, s._droneFleet); }
        if (entity.type === T.ATMOSCOLLECTOR) { EntityRegistry.add(entity); entity.def = { ...EntityDefs[T.ATMOSCOLLECTOR] }; if (s._nitrogen !== undefined) entity._nitrogen = s._nitrogen; }
        if (entity.type === T.HABERBOSCH) { EntityRegistry.add(entity); entity.def = { ...EntityDefs[T.HABERBOSCH] }; if (s._ammonia !== undefined) entity._ammonia = s._ammonia; }
        if (entity.type === T.WASHTOWER) { EntityRegistry.add(entity); entity.def = { ...EntityDefs[T.WASHTOWER] }; if (s._deuterium !== undefined) entity._deuterium = s._deuterium; }
        if (entity.type === T.FUSIONFUELPLANT) { EntityRegistry.add(entity); entity.def = { ...EntityDefs[T.FUSIONFUELPLANT] }; if (s._plasma !== undefined) entity._plasma = s._plasma; entity._he3Pellets = s._he3Pellets || 0; }
        if (entity.type === T.HULKINGFUSIONREACTOR) { EntityRegistry.add(entity); entity.def = { ...EntityDefs[T.HULKINGFUSIONREACTOR] }; if (s._highBeta !== undefined) entity._highBeta = s._highBeta; if (s._started !== undefined) entity._started = s._started; }
        if (entity.type === T.HULKINGFUSIONREACTOR) {
          // Magnets arrived after fusion did: a reactor saved without them
          // loads cold and fully charged, with an hour of stored coolant
          // before it needs a Cryo Plant (see FUSION_LEGACY_COOLANT_SECONDS).
          if (s._magnetK === undefined) {
            entity._magnetK       = HulkingFusionReactorSystem.OPERATING_K;
            entity._heCharge      = EntityDefs[T.HULKINGFUSIONREACTOR].heliumChargeCap || 400;
            entity._legacyCoolant = HulkingFusionReactorSystem.LEGACY_COOLANT_SECONDS;
          } else {
            entity._magnetK       = s._magnetK;
            entity._heCharge      = s._heCharge || 0;
            entity._legacyCoolant = s._legacyCoolant || 0;
          }
          entity._heAsh       = s._heAsh || 0;
          entity._quenchCount = s._quenchCount || 0;
          entity._tritium     = s._tritium || 0;
          entity._corePellets = s._corePellets || 0;
          entity._coreMode    = s._coreMode || null;
          // Saved before the D-T / D-He3 split: its pipe runs to an MHD Ring,
          // so it keeps burning D-He3 (see the Fuel Plant's legacy stock below).
          entity._fuelMode    = s._fuelMode || 'dhe3';
          // Burning D-He3 when saved: it may keep doing so (the Fusion
          // Reactor is D-T only for new setups since the fuel split).
          entity._legacyDhe3  = entity._fuelMode === 'dhe3';
        }
        if (entity.type === T.FUSIONFUELPLANT) {
          // Before the split it made pellets from deuterium + lithium compound
          // for an MHD Ring. It loads on D-He3 with an hour of stored helium-3,
          // so that ring keeps running while the player adapts.
          if (s._fuelMode === undefined) {
            entity._fuelMode  = 'dhe3';
            entity._legacyHe3 = FusionFuelPlantSystem.LEGACY_HE3_SECONDS;
          } else {
            entity._fuelMode  = s._fuelMode;
            entity._legacyHe3 = s._legacyHe3 || 0;
          }
          entity._tritium = s._tritium || 0;
          entity._he3     = s._he3 || 0;
        }
        if (entity.type === T.HE3SEPARATOR) { EntityRegistry.add(entity); entity.def = { ...EntityDefs[T.HE3SEPARATOR] }; entity._he3 = s._he3 || 0; }
        if (entity.type === T.TRITIUMBREEDER) { EntityRegistry.add(entity); entity.def = { ...EntityDefs[T.TRITIUMBREEDER] }; entity._tritium = s._tritium || 0; }
        if (entity.type === T.MHDRING) { EntityRegistry.add(entity); entity.def = { ...EntityDefs[T.MHDRING] }; }
        if (entity.type === T.ADVFUSIONREACTOR) {
          EntityRegistry.add(entity); entity.def = { ...EntityDefs[T.ADVFUSIONREACTOR] };
          if (s._magnetK !== undefined) entity._magnetK = s._magnetK;
          entity._heCharge    = s._heCharge || 0;
          entity._coilRepair  = s._coilRepair || 0;
          entity._quenchCount = s._quenchCount || 0;
          entity._highBeta    = s._highBeta || 0;
          entity._started     = !!s._started;
          entity._heAsh       = s._heAsh || 0;
        }
        if (isHeliumWell(entity)) { EntityRegistry.add(entity); entity.def = { ...EntityDefs[entity.type] }; if (s._helium !== undefined) entity._helium = s._helium; }
        if (entity.type === T.CRYOPLANT)  { EntityRegistry.add(entity); entity.def = { ...EntityDefs[T.CRYOPLANT] }; entity._liquidHe = s._liquidHe || 0; entity._tripped = !!s._tripped; entity._restart = s._restart || 0; }
        if (entity.type === T.NUCLEARREACTOR || entity.type === T.ADVREACTOR) { EntityRegistry.add(entity); entity.def = { ...EntityDefs[entity.type] }; if (s._rodBuffer !== undefined) entity._rodBuffer = s._rodBuffer; entity._spentFuel = s._spentFuel !== undefined ? s._spentFuel : (s._nuclearWastePct || 0); if (s._coreHeat !== undefined) entity._coreHeat = s._coreHeat; if (s._heatRate !== undefined) entity._heatRate = s._heatRate; if (s._steamPressure !== undefined) entity._steamPressure = s._steamPressure; if (s._reactorMeltdown) entity._meltdown = s._reactorMeltdown; }
        if (entity.type === T.REFINERY && s._sludgeWaste !== undefined) entity._sludgeWaste = s._sludgeWaste;
        if (s._scrubber) entity._scrubber = true;
        if (entity.type === T.COALWASTE || entity.type === T.OILWASTE || entity.type === T.NUCLEARWASTE) { EntityRegistry.add(entity); entity.def = { ...EntityDefs[entity.type] }; }
       } catch (err) {
         // One malformed/incompatible saved entity must not take the rest of
         // the save down with it — the world was already cleared above (see
         // the comment on that clear), so letting an exception here escape
         // uncaught would abort this forEach entirely and silently leave
         // every entity after this one in iteration order unrestored, with
         // no error surfaced to the player beyond "stuff is missing."
         console.warn('[SaveSystem] Failed to restore entity, skipping:', s && s.type, err);
       }
      });

      // Dam entities are restored above; now that they all exist, tell
      // ReservoirSystem which ones are still unpaired (no _reservoirId).
      if (typeof ReservoirSystem !== 'undefined' && ReservoirSystem.rebuildPendingDams) {
        ReservoirSystem.rebuildPendingDams();
      }

      // Defensive dedup: load() was once purely additive (see the comment
      // above this function), which could bake a second copy of a truck's
      // record into a save; every later load would restore both. A copy is
      // the same truck, so it carries the same _placedAt (a truck too old to
      // have one only counts if it stands on exactly the same spot).
      //
      // This used to collapse any two trucks within 2 tiles of each other.
      // Two waste trucks working the same route meet all the time (both at
      // one pickup, or one facility), and a save made then lost one of them
      // on its next load: real trucks the player had bought, gone with no
      // word. Trucks stacked with the old Truck tool were bought too, so
      // closeness alone never removes one.
      {
        const _trucks = Array.from(EntityRegistry.getByType(T.TRUCK));
        const _removed = new Set();
        const _sameRecord = (a, b) => (a._placedAt !== undefined || b._placedAt !== undefined)
          ? a._placedAt === b._placedAt
          : a.col === b.col && a.row === b.row && a._wx === b._wx && a._wy === b._wy;
        for (let i = 0; i < _trucks.length; i++) {
          if (_removed.has(_trucks[i])) continue;
          for (let j = i + 1; j < _trucks.length; j++) {
            if (_removed.has(_trucks[j])) continue;
            const a = _trucks[i], b = _trucks[j];
            if (!_sameRecord(a, b)) continue;
            // Keep whichever carries more state (an active path or cargo)
            const aScore = (a._path?.length || 0) + (a._cargoAmount || 0);
            const bScore = (b._path?.length || 0) + (b._cargoAmount || 0);
            const drop = bScore > aScore ? a : b;
            GridManager.removeEntityFootprint(drop);
            EntityRegistry.remove(drop);
            _removed.add(drop);
            console.warn('[SaveSystem] Removed a duplicate truck found in save data at load time');
          }
        }
      }

      // Resolve govEntity now that grid entities have been restored.
      // Always scan for GOVBUILDING rather than relying on saved coords,
      // since govEntity may have been null at save time (pre-fix saves).
      if (GovernmentSystem._pendingGovCol !== undefined) {
        const _ge = GridManager.getEntity(GovernmentSystem._pendingGovCol, GovernmentSystem._pendingGovRow);
        if (_ge && _ge.type === T.GOVBUILDING) GovernmentSystem._resolveGovEntity(_ge);
        delete GovernmentSystem._pendingGovCol;
        delete GovernmentSystem._pendingGovRow;
      }
      // Fallback: scan grid for any GOVBUILDING not yet resolved
      if (!GovernmentSystem.getGovEntity()) {
        outer_gv: for (let _gr = 0; _gr < ROWS; _gr++) for (let _gc = 0; _gc < COLS; _gc++) {
          const _ge2 = GridManager.getEntity(_gc, _gr);
          if (_ge2 && _ge2.type === T.GOVBUILDING && _ge2.col === _gc && _ge2.row === _gr) {
            GovernmentSystem._resolveGovEntity(_ge2);
            break outer_gv;
          }
        }
      }

      // Migration: spawn any gov buildings whose contract was completed but
      // whose building never made it onto the grid (e.g. completed on a prior
      // session before the spawn bug was fixed, or _resolveGovEntity failed).
      const _GOV_BUILDING_TYPES = new Set([T.TOWNHALL, T.CIVICCENTER, T.COURTHOUSE, T.EMS, T.HOSPITAL, T.UNIVERSITY, T.TRANSPORTHUB]);
      const _govBuildingsOnGrid = new Set();
      for (let _gr2 = 0; _gr2 < ROWS; _gr2++) for (let _gc2 = 0; _gc2 < COLS; _gc2++) {
        const _ge3 = GridManager.getEntity(_gc2, _gr2);
        if (_ge3 && _ge3.col === _gc2 && _ge3.row === _gr2 && _GOV_BUILDING_TYPES.has(_ge3.type))
          _govBuildingsOnGrid.add(_ge3.type);
      }
      const _CONTRACT_TYPE_MAP = { townhall: T.TOWNHALL, civiccenter: T.CIVICCENTER, courthouse: T.COURTHOUSE, ems: T.EMS, hospital: T.HOSPITAL, university: T.UNIVERSITY, transporthub: T.TRANSPORTHUB };
      for (const _c of GovernmentSystem.getContracts()) {
        if (!_c._completed) continue;
        const _btype = _CONTRACT_TYPE_MAP[_c.id];
        if (!_btype || _govBuildingsOnGrid.has(_btype)) continue;
        console.log(`[SAVE] Migration: spawning missing gov building for completed contract "${_c.id}"`);
        GovernmentSystem.forceSpawnGovBuilding(_c.id);
        _govBuildingsOnGrid.add(_btype);
      }

      // Migration: update fees on existing buildings to match current definitions
      const _NAME_FEES = {
        'Cold Storage': 20,
        'Steel Foundry': 35, 'Logistics Depot': 27, 'Solvent Works': 40, 'Data Farm': 44,
        'Bottling Plant': 26, 'Cold Chain Warehouse': 48, 'Water Treatment Plant': 48,
        'EV Battery Factory': 50, 'Server Farm': 65, 'Fiber Hub': 28, 'Data Relay Node': 22,
      };
      const _grow = [];
      for (let _mr = 0; _mr < ROWS; _mr++) for (let _mc = 0; _mc < COLS; _mc++) {
        const _me = GridManager.getEntity(_mc, _mr);
        if (!_me || _me.col !== _mc || _me.row !== _mr) continue;
        if (_me.businessName && _NAME_FEES[_me.businessName] !== undefined)
          _me.dailyFee = _NAME_FEES[_me.businessName];
        // Migration: MK4-era customers had their fees cut 40%. Every one is
        // accepted long after the second property, so it pays the 0.75 rate
        // accept() gives from the third on.
        const _mk4Fee = _me.commercialSubtype && HouseRequestSystem.mk4Fee?.(_me.commercialSubtype);
        if (typeof _mk4Fee === 'number') _me.dailyFee = Math.round(_mk4Fee * 0.75);
        // Migration: Solvent Works (formerly Chemical Plant) used to share the
        // 'factory' subtype/sprite — re-tag existing buildings so they pick up
        // the dedicated chemical sprite.
        if (_me.businessName === 'Solvent Works' && _me.commercialSubtype === 'factory')
          _me.commercialSubtype = 'chemical';
        if (_me._legacyFp || (_growsOnLoad(_me) && (_me.width || 1) < entityFootprint(_me.type, _me.commercialSubtype).width)) _grow.push(_me);
        // Migration: same for Bottling Plant — used to share 'factory' too.
        if (_me.businessName === 'Bottling Plant' && _me.commercialSubtype === 'factory')
          _me.commercialSubtype = 'bottling';
        // Migration: Oilfield Bunkhouses became Sunset Grove Retirement Village
        // (same 4×2 footprint, fee and demand scale).
        if (_me.commercialSubtype === 'bunkhouse') {
          _me.commercialSubtype = 'retirement';
          if (_me.businessName === 'Oilfield Bunkhouses') _me.businessName = 'Sunset Grove Retirement Village';
        }
      }
      // Solvent Works built before it grew to 6×6 (and the buildings in
      // ArtFootprints built at their old size): take the bigger footprint
      // wherever one around the old plot is clear (grass, trees and loose
      // ground only), trying anchors that keep the old plot inside it.
      // Packed in with no room, it stays its old size — the sprite scales.
      for (const _sw of _grow) {
        const _fp = entityFootprint(_sw.type, _sw.commercialSubtype), _ow = _sw.width || 1, _oh = _sw.height || 1;
        const _free = (c0, r0) => {
          for (let r = r0; r < r0 + _fp.height; r++) for (let c = c0; c < c0 + _fp.width; c++) {
            if (!GridManager.inBounds(c, r)) return false;
            const t = GridManager.getEntity(c, r);
            if (t && t !== _sw && !GridManager.isVegetation(t)) return false;
            if (t !== _sw && typeof WaterSystem !== 'undefined' && WaterSystem.isWater(c, r)) return false;
          }
          return true;
        };
        let _at = null;
        for (let dr = 0; dr <= _fp.height - _oh && !_at; dr++)
          for (let dc = 0; dc <= _fp.width - _ow && !_at; dc++)
            if (_free(_sw.col - dc, _sw.row - dr)) _at = [_sw.col - dc, _sw.row - dr];
        // A building in ArtFootprints with no room where it stands moves to
        // the nearest clear plot its new size fits, ring by ring outward, so
        // old cities get the street-scale buildings too.
        const _art = _sw.commercialSubtype ? ArtFootprints.sub[_sw.commercialSubtype] : ArtFootprints.type[_sw.type];
        for (let d = 1; !_at && _art && d <= 40; d++)
          for (let dr = -d; dr <= d && !_at; dr++)
            for (let dc = -d; dc <= d && !_at; dc++) {
              if (Math.max(Math.abs(dr), Math.abs(dc)) !== d) continue;
              if (_free(_sw.col + dc, _sw.row + dr)) _at = [_sw.col + dc, _sw.row + dr];
            }
        delete _sw._legacyFp;
        if (!_at) continue;
        GridManager.removeEntityFootprint(_sw);
        _sw.col = _at[0]; _sw.row = _at[1];
        _sw.width = _fp.width; _sw.height = _fp.height;
        GridManager.setEntityFootprint(_sw);
      }

      // Re-initialize lake-based water extractors on load
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const e = GridManager.getEntity(c, r);
          if (!e || e.type !== T.WATEREXTRACTOR || e.col !== c || e.row !== r) continue;
          e._lakeConnected = e._lakeConnected !== undefined ? e._lakeConnected : (e._waterRate || 0) > 0;
          // The rate isn't saved, and PowerNetwork.updatePipeConnectivity
          // budgets every run against it before HydroSystem.tickExtractor
          // refreshes it later in the tick. A placeholder here (this used to
          // be a flat 8 u/s against the real 25) left the first tick after a
          // load, or after coming home to a world restored from one, handing
          // out a third of the water: most cooling towers and plants on a run
          // read as short. Use the extractor's real rate; power is gated
          // separately (an unpowered extractor seeds nothing).
          e._waterRate = e._lakeConnected ? (EntityDefs[T.WATEREXTRACTOR].waterPerSecond || 20) : 0;
          e._waterBuffer = e._waterBuffer || 0;
          // Rebuild saved water tiles so removal can restore them
          if (!e._savedWaterTiles) {
            e._savedWaterTiles = [];
            const mw = e.width || 4, mh = e.height || 4;
            for (let er = e.row; er < e.row + mh; er++)
              for (let ec = e.col; ec < e.col + mw; ec++) {
                const w = new Entity(T.WATER, ec, er);
                e._savedWaterTiles.push({ c: ec, r: er, tile: w });
              }
          }
        }

      // Re-link pipes, wires, belts and poles laid across water. `_underWater` isn't
      // serialised, and the entity pass stamps them over the water tile
      // WaterSystem.load() just laid down — so without this, deleting one
      // (single or zone delete) nulls the tile and leaves a hole in the lake.
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const e = GridManager.getEntity(c, r);
          if (!e || (e.type !== T.PIPE && e.type !== T.WIRE && e.type !== T.CONVEYOR && e.type !== T.POLE) || e._underWater) continue;
          if (!WaterSystem.isWater(c, r)) continue;
          e._underWater = new Entity(T.WATER, c, r);
        }

      // Re-link coal mines to their deposits using the registry
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const e = GridManager.getEntity(c, r);
          if (!e) continue;
          if (e.type === T.COALMINE || e.type === T.COALMINE2) {
          }
          if (!e || (e.type !== T.COALMINE && e.type !== T.COALMINE2) || e.col !== c || e.row !== r) continue;
          if (e._depositCol === undefined) continue;
          const deposit = depositRegistry.get(`${e._depositCol},${e._depositRow}`);
          if (deposit) {
            e._linkedDeposit = deposit;
            e.def.powerOutput = 0;
            if (!e._coalRate) e._coalRate = CoalSystem.outputForDeposit(deposit);
          }
        }

      // Re-link geothermal wells to their deposits, then rebuild every
      // well ⇄ turbine pairing from the restored footprints (relinkAll
      // prefers each turbine's saved _wellCol/_wellRow, so an ambiguous
      // overlap resolves back to the pairing the save recorded).
      for (const well of EntityRegistry.getByType(T.GEOWELL)) {
        if (well._linkedDeposit || well._depositCol === undefined) continue;
        for (const dep of EntityRegistry.getByType(T.GEODEPOSIT)) {
          if (dep.col === well._depositCol && dep.row === well._depositRow) {
            well._linkedDeposit = dep;
            dep._hasWell = true;
            break;
          }
        }
      }
      // A 3-tall deposit comes back at full size under its 3×2 well, leaving
      // its bottom row on the grid beneath the well's sprite: a tile the
      // player can't see, and a wire run up to the well's edge would end on
      // the deposit instead of the well and carry nothing. Clear it the way
      // tryPlaceGeoWell does.
      for (const well of EntityRegistry.getByType(T.GEOWELL)) {
        const dep = well._linkedDeposit;
        if (!dep) continue;
        for (let r = dep.row; r < dep.row + (dep.height || 2); r++)
          for (let c = dep.col; c < dep.col + (dep.width || 2); c++)
            if (GridManager.getEntity(c, r) === dep) GridManager.tiles[r][c] = null;
      }
      if (typeof GeothermalSystem !== 'undefined') GeothermalSystem.relinkAll();
      // Roster entries are coordinates, so the shed set can only be built
      // once every building is back on the grid.
      if (typeof CircuitSwitchSystem !== 'undefined') { CircuitSwitchSystem.prune(); CircuitSwitchSystem.refresh(); }

      // Re-link uranium, sulfur, and lithium mines to their deposits
      for (let r = 0; r < ROWS; r++)
        for (let cc = 0; cc < COLS; cc++) {
          const e = GridManager.getEntity(cc, r);
          if (!e || (e.type !== T.URANIUMMINE && !isSulfurMine(e) && e.type !== T.LITHIUMMINE && e.type !== T.RAREEARTHMINE && !isHeliumWell(e)) || e.col !== cc || e.row !== r) continue;
          if (e._linkedDeposit) continue;
          const depType = e.type === T.URANIUMMINE ? T.URANIUMDEPOSIT : isSulfurMine(e) ? T.SULFURDEPOSIT
                        : isHeliumWell(e) ? T.HELIUMDEPOSIT : e.type === T.RAREEARTHMINE ? T.RAREEARTHDEPOSIT : T.LITHIUMDEPOSIT;
          let found = null;
          if (e._depositCol !== undefined) {
            for (const dep of EntityRegistry.getByType(depType)) {
              if (dep.col === e._depositCol && dep.row === e._depositRow) { found = dep; break; }
            }
          }
          if (!found) {
            const ew = e.width || 4, eh = e.height || 5;
            outer: for (let dr = -1; dr <= eh; dr++) for (let dc = -1; dc <= ew; dc++) {
              const nb = GridManager.getEntity(e.col + dc, e.row + dr);
              if (nb && nb.type === depType) { found = nb; break outer; }
            }
          }
          if (found) { e._linkedDeposit = found; found._hasMine = true; }
        }

      // Re-link pump jacks to their oil deposits.
      // First try EntityRegistry, then reconstruct deposit from fields embedded on the pump jack.
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const e = GridManager.getEntity(c, r);
          if (!e || !OilSystem.isPumpJack(e) || e.col !== c || e.row !== r) continue;
          if (e._depositCol === undefined) continue;
          let dep = null;
          for (const d of EntityRegistry.getByType(T.OILDEPOSIT)) {
            if (d.col === e._depositCol && d.row === e._depositRow) { dep = d; break; }
          }
          if (!dep) {
            // Reconstruct deposit from fields saved on the pump jack
            dep = new Entity(T.OILDEPOSIT, e._depositCol, e._depositRow);
            dep.width        = e._depositWidth  || e.width  || 2;
            dep.height       = e._depositHeight || e.height || 2;
            dep._tierLabel   = e._depositTierLabel || 'Oil Deposit';
            dep._oilPhase    = e._depositOilPhase  || 0;
            dep._pressure    = e._depositPressure  !== undefined ? e._depositPressure : (e._pressure || 1.0);
            dep._crudeBuffer = e._depositCrudeBuffer || 0;
            dep._totalUnits  = e._depositTotalUnits !== undefined ? e._depositTotalUnits
              : Math.round((3000 + Math.random() * 9000) * (dep.width || 2));
            EntityRegistry.add(dep);
          }
          if (dep) {
            e._linkedDeposit = dep;
            e._pressure = dep._pressure !== undefined ? dep._pressure : 1.0;
          }
        }

      // Clear worked-out deposits left bare by older saves, from before a
      // removed mine took its exhausted deposit with it. Only ones that own
      // their anchor tile — a deposit a mine or pump jack still stands on is
      // left for that building, and goes when it's removed.
      for (const depType of [T.COALDEPOSIT, T.OILDEPOSIT, T.URANIUMDEPOSIT, T.SULFURDEPOSIT, T.HELIUMDEPOSIT, T.RAREEARTHDEPOSIT]) {
        for (const d of [...EntityRegistry.getByType(depType)]) {
          if (isDepositExhausted(d) && GridManager.getEntity(d.col, d.row) === d) GridManager.removeEntityFootprint(d);
        }
      }

      // Restore day/night
      DayNight.setElapsed(data.daynight.elapsed);
      Seasons.load(data.seasons);   // after the clock; a save from before seasons starts its year on the first day of spring
      if (typeof _wfSmokeLoad === 'function') _wfSmokeLoad(data.smokeVents);

      // Restore camera
      Camera.loadState(data.camera);

      // Restore request system
      if (data.requests) HouseRequestSystem.loadState(data.requests);
      if (data.amenityFulfilled) AmenityRequestSystem.setTotalFulfilled(data.amenityFulfilled);

      // Restore player-drawn truck paths saved independently of any truck
      SavedPathSystem.load(data.savedPaths);
      BlueprintSystem.load(data.blueprints);

      // Restore achievements + city score best (purely additive — absent on older saves)
      if (data.achievements) AchievementsSystem.loadState(data.achievements, !!(data.scenario && data.scenario.id));
      if (data.achievementsMisc) AchievementsSystem.loadMisc(data.achievementsMisc);
      if (data.cityScoreBest !== undefined) CityScore.loadBest(data.cityScoreBest);
      PollutionSystem.loadState(data.pollution);
      // Items out on the conveyors — after the world is rebuilt, since each
      // one is tied to the buildings at either end of its belt. An older save
      // without them loads with the belts empty, as before.
      if (typeof BeltCargo !== 'undefined') BeltCargo.loadState(data.beltCargo);
      if (data.caughtFish) FishingSystem.loadState(data.caughtFish);
      if (data.compendium) CompendiumSystem.loadState(data.compendium);
      if (data.tutorial) TutorialSystem.loadState(data.tutorial);
      // Restore any contract that was open when this save was written. Runs
      // after the world is rebuilt: the player lands at home with the site
      // held in reserve behind RETURN TO SITE.
      if (typeof ContractSystem !== 'undefined') ContractSystem.loadState(data.contract);
      repairTurnedFootprints();   // home; a job site gets it when it goes onto the grid
      trimLegacyTanks();          // likewise
      udgAdoptLegacy();           // likewise
      if (typeof ScenarioSystem !== 'undefined') ScenarioSystem.loadState(data.scenario);   // demo: resumed once the game starts
      CityInfo.loadState(data.cityInfo);

      // Migration: assign sequential _placedAt to buildings missing it
      let _mt = 1;
      for (let _r = 0; _r < ROWS; _r++) for (let _c = 0; _c < COLS; _c++) {
        const _me = GridManager.getEntity(_c, _r);
        if (_me && _me.col === _c && _me.row === _r && _me.fromRequest && !_me._placedAt)
          _me._placedAt = _mt++;
      }
      // Restore wire hop range — applies once Power Tower tech is
      // unlocked, regardless of whether a tower is currently placed.
      PowerNetwork.setWireHops(Progression.isUnlocked(T.POWERTOWER) ? 8 : 4);
      // Rebuild zones AFTER entities are loaded
      ZoneSystem.rebuild();
      // Houses built at 1×1 grow to the new 2×2 (needs the gov zone above);
      // the zones are then rebuilt around their bigger footprints.
      if (growLegacyHouses()) ZoneSystem.rebuild();

      // Migration: scatter vegetation onto tiles added by map expansion.
      // Runs once per expansion — the save records the map size it was
      // last migrated at, so a world saved before a later expansion gets
      // trees on the newly added land too.
      if (!data.vegMigrated || (data.vegMigratedCols || 0) < COLS || (data.vegMigratedRows || 0) < ROWS) {
        const OLD_COLS = data.vegMigratedCols || 624;
        const OLD_ROWS = data.vegMigratedRows || 374;
        const MARGIN = 3;
        const newTiles = COLS * ROWS - OLD_COLS * OLD_ROWS;
        const target = Math.floor(newTiles * 0.014);
        let placed = 0, attempts = 0;
        while (placed < target && attempts < target * 20) {
          attempts++;
          const c = MARGIN + Math.floor(Math.random() * (COLS - MARGIN * 2));
          const r = MARGIN + Math.floor(Math.random() * (ROWS - MARGIN * 2));
          const _or = data._oldRect;                 // where the old map sits, if it was recentred
          if (_or ? (c >= _or.c0 && c < _or.c1 && r >= _or.r0 && r < _or.r1)
                  : (c < OLD_COLS && r < OLD_ROWS)) continue;  // was in old map
          if (GridManager.getEntity(c, r)) continue;
          let nearby = 0;
          for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
            const e = GridManager.getEntity(c + dc, r + dr);
            if (e && e.type === T.TREE) nearby++;
          }
          if (nearby >= 3) continue;
          if (!GridManager.canPlaceFootprint(c, r, 1, 1)) continue;
          const veg = new Entity(Math.random() < 0.4 ? T.BUSH : T.TREE, c, r);
          veg._chopProgress = 0;
          GridManager.setEntity(c, r, veg);
          placed++;
        }
        console.log(`[SAVE] Veg migration: placed ${placed} trees/bushes in expanded area`);
      }

      // Re-evaluate all unlock conditions now that grid + systems are fully restored.
      // Without this, items won't appear in the Research panel until the first game tick.
      Progression.checkUnlocks();

      // Resync the world map's discovered-deposit list from the freshly loaded grid,
      // otherwise scanned deposits vanish from the map until a new scan is performed.
      if (typeof WorldMapSystem !== 'undefined') WorldMapSystem.syncFromGrid();

      // A prior failed load in this page session freezes writes (see _loadFailed).
      // This world loaded cleanly, so lift that freeze — otherwise a successful
      // retry after a race would still refuse every save until a full reload.
      paused = false;
      lastSaveError = null;

      console.log('Save loaded ✓');
      return true;
    } catch (err) {
      return _loadFailed(err);
    }
  }

  // Deletes the active (or given) slot entirely — used when discarding a
  // world before starting a fresh one under the same slot id.
  function clear(slotId) {
    const id = slotId || currentSlot;
    if (id) deleteSlot(id);
    PlayTime.reset();
  }

  // Writes the current world into a BRAND-NEW slot instead of overwriting the
  // active one, then switches the session to it so autosaves (and any later
  // plain save()) follow the new slot rather than the one it branched from.
  // save() already pushes slot-index metadata for an id it hasn't seen, so
  // there's nothing to pre-register here.
  // Returns the new slot id, or null if the write failed. On failure the
  // session is rolled back to the slot it was on — otherwise currentSlot would
  // be left pointing at an id with no data behind it, and every later autosave
  // (plus "return to main menu") would silently target that phantom file.
  function saveAsNew(displayName) {
    if (_iron()) { lastSaveError = 'Permadeath world: the game saves itself, there are no other save files'; return null; }
    const id = newSlotId(displayName);
    const prevSlot  = currentSlot;
    const prevWorld = currentWorld;
    // Stay in the same world — save() picks currentWorld up for the new entry,
    // so the branch shows up alongside its siblings in the save picker.
    if (!currentWorld) currentWorld = currentSlot || id;
    currentSlot = id;
    if (!save(id, displayName)) {
      currentSlot  = prevSlot;
      currentWorld = prevWorld;
      return null;
    }
    // The new file is the player's snapshot, not one of the session's autosave
    // targets: restore currentSlot and leave the rotation untouched, so the
    // interval and F2 keep cycling the autosave files instead of silently
    // overwriting the save they just named.
    currentSlot  = prevSlot || id;
    currentWorld = prevWorld || currentWorld;
    return id;
  }

  // Permadeath: an Advanced Reactor has taken the world. Every file that
  // belongs to it goes — the named/auto files in whichever store, plus any
  // crash-net mirror (deleteSlot clears those) — and nothing is written again
  // this session. Waits for an in-flight folder write first, or it would land
  // after the delete and put the world back.
  async function deleteWorld() {
    paused = true;
    stopAutosave();
    try { await FolderMode.pendingWrite(); } catch (_e) {}
    const wid = currentWorld;
    const ids = new Set();
    if (wid) {
      for (const s of listSlots())     if ((s.worldId || s.id) === wid) ids.add(s.id);
      for (const s of readSlotIndex()) if ((s.worldId || s.id) === wid) ids.add(s.id);
    }
    for (const id of autoSlots) if (id) ids.add(id);
    if (currentSlot) ids.add(currentSlot);
    let n = 0;
    for (const id of ids) { try { if (await deleteSlot(id)) n++; } catch (_e) {} }
    console.log(`[SAVE] Permadeath: deleted ${n} file(s) of world ${wid}`);
    return n;
  }

  return {
    serialiseEntity, reviveStack, deleteWorld,
    save, load, clear, pause() { paused = true; },
    startAutosave, stopAutosave, getAutosaveInterval, setAutosaveInterval, saveOnExit,
    getDailySaves, setDailySaves, dailySavesMax: () => DAILY_MAX,
    saveLog: () => { try { return JSON.parse(localStorage.getItem(SAVE_LOG_KEY) || '[]'); } catch (_e) { return []; } },
    autosaveEnabled,
    autosaveChoices: () => {
      const out = [];
      for (let ms = AUTOSAVE_OFF; ms <= AUTOSAVE_MAX; ms += AUTOSAVE_STEP) out.push(ms);
      return out;
    },
    autosaveRange: () => ({ min: AUTOSAVE_OFF, max: AUTOSAVE_MAX, step: AUTOSAVE_STEP }),
    saveAsNew,
    listSlots, listWorldSlots, createSlot, deleteSlot, importSlot, exportSlotRaw,
    readImport,
    // A fresh slot id for a world of this city (a filename in folder mode).
    newSlotIdFor: (city) => newSlotId(null, city),
    getCurrentSlot, setCurrentSlot,
    // The file the NEXT automatic save (interval, exit hooks, F2) will write.
    getAutoSlot: () => resolveAutoSlot(),
    getQuickSlot: () => resolveQuickSlot(),
    // Every file in this world's autosave rotation, oldest-target first.
    getAutoSlots: () => resolveAutoSlots().slice(),
    autosaveSlotCount: () => AUTOSAVE_SLOTS,
    // True once after loading a world saved before autoSlot existed.
    takeAutoSlotMigration() { const v = autoSlotMigrated; autoSlotMigrated = false; return v; },
    getCurrentWorld() { return currentWorld; },
    getLastSaveError() { return lastSaveError || FolderMode.error(); },
    // True if a save succeeded within the last `ms` milliseconds.
    savedWithin(ms) { return lastSaveOkAt > 0 && Date.now() - lastSaveOkAt <= ms; },

    // ── Folder mode ────────────────────────────────────────────────
    folderSupported: () => FolderMode.available(),
    folderActive:    () => FolderMode.active(),
    folderName:      () => (typeof FileSaves !== 'undefined' ? FileSaves.folderName() : null),
    async folderConnect() {
      if (!FolderMode.available()) return false;
      const ok = await FileSaves.connect();
      if (ok) await FolderMode.refresh();
      return ok;
    },
    async folderReconnect() {
      if (!FolderMode.available()) return false;
      const ok = await FileSaves.reconnect();
      if (ok) await FolderMode.refresh();
      return ok;
    },
    // True when a remembered save folder is waiting on the player to
    // re-authorise it — the state a full browser restart leaves behind.
    folderNeedsPermission: () =>
      FolderMode.available() && FileSaves.needsPermission(),
    // Re-authorises that folder. MUST be called from a click: the browser
    // only grants file-system permission while handling a user gesture.
    async folderRequestAccess() {
      if (!FolderMode.available()) return false;
      const ok = await FileSaves.requestAccess();
      if (ok) await FolderMode.refresh();
      return ok;
    },
    async folderDisconnect() {
      if (typeof FileSaves !== 'undefined') await FileSaves.forget();
      await FolderMode.refresh();
    },
    folderRefresh: () => FolderMode.refresh(),
    flushPendingMirrors,
    // Awaits the in-flight folder write. Deliberate exits (main menu, loading
    // another save) call this so they never have to rely on the crash-net.
    async flushNow() {
      if (!FolderMode.active()) return true;
      try { return await FolderMode.pendingWrite(); } catch (_e) { return false; }
    },
    // Reads a save file's text so the caller can hand it to load().
    // Reads a slot's raw JSON from wherever it actually lives. Checks BOTH
    // stores rather than trusting FolderMode.active(): a session can hold
    // browser-storage worlds and folder worlds at once, and on a fresh boot
    // the folder handle may not be re-attached yet. Returning null here makes
    // a perfectly good save look corrupt, so the last resort is to reconnect
    // the folder and try again before giving up.
    async readSlotText(id) {
      if (!id) return null;
      // Crash-net mirrors (folder mode) and normal browser slots both count.
      const fromLocal = () =>
        localStorage.getItem(mirrorKey(id)) || localStorage.getItem(slotStorageKey(id));
      if (FolderMode.active()) {
        const text = await FileSaves.read(id);
        if (text != null) return text;
        return fromLocal();
      }
      const local = fromLocal();
      if (local != null) return local;
      if (/\.json$/i.test(id) && FolderMode.available()) {
        const ok = await FileSaves.reconnect();
        if (ok) {
          await FolderMode.refresh();
          const text = await FileSaves.read(id);
          if (text != null) return text;
          return fromLocal();
        }
      }
      return null;
    },
    // Rough localStorage footprint, for surfacing "storage full" to the player.
    storageUsedBytes() {
      let n = 0;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          n += (k.length + (localStorage.getItem(k) || '').length) * 2; // UTF-16
        }
      } catch (_e) {}
      return n;
    },
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   MAIN MENU & PAUSE MENU SYSTEM
   ═══════════════════════════════════════════════════════════════════ */
