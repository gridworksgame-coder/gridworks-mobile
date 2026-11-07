/* ═══════════════════════════════════════════════════════════════════
   GRAPHICS RECOVERY
   When the browser's graphics process resets (a driver hiccup, the GPU
   running short), every accelerated canvas loses what was drawn on it.
   The main canvas is redrawn every frame, so it comes straight back, but
   most of the world is drawn once into a cache and then only copied: the
   ground and roads, the building bitmaps, tree sprites, frost, water.
   Those come back blank and stay blank, and the city is left as wires,
   people and cars on a flat field (seen after a fast travel, and after
   nothing more than a click on the notification bar).

   There are close to a hundred such caches, each with its own idea of when
   it is stale, so rather than chase every one this starts the world over:
   the city is saved, the page reloads and the save is loaded straight back
   (the same clean boot the pause menu's Load uses). If the world cannot be
   saved (a run that has ended, saving switched off) it does not reload,
   which would lose play; it says what happened and leaves it to the player.

   Each reset is noted in localStorage (gw_gfx_resets, the last 20), so a
   report of the screen breaking can be checked afterwards:
     JSON.parse(localStorage.gw_gfx_resets)
   ═══════════════════════════════════════════════════════════════════ */

const GraphicsRecovery = (() => {
  const LOG_KEY = 'gw_gfx_resets';
  let _busy = false;

  function _note(what) {
    try {
      const log = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
      log.push({ at: new Date().toISOString(), what });
      localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-20)));
    } catch (_e) {}
  }

  function _toast(msg, ok) {
    if (typeof showToast === 'function') {
      if (ok) showToast(msg, '#80c0ff', '#06101c', '#204060');
      else showToast(msg, '#ff8040', '#180800', '#602010');
    }
  }

  async function _recover() {
    if (_busy) return;
    _busy = true;
    _note('restored');
    // No world loaded yet (the main menu): a reload loses nothing.
    const inGame = typeof SaveSystem !== 'undefined' && (SaveSystem.getCurrentSlot() || SaveSystem.getAutoSlot());
    if (!inGame) { location.reload(); return; }
    // The slot a bare save is about to write (the autosave rotation's next
    // file), read before the write moves the rotation on.
    const slot = SaveSystem.getAutoSlot() || SaveSystem.getCurrentSlot();
    let ok = false;
    try {
      ok = !!SaveSystem.save(undefined, undefined, { kind: 'gfx-reset' });
      if (ok) await Promise.race([SaveSystem.flushNow(), new Promise(r => setTimeout(r, 4000))]);
    } catch (_e) { ok = false; }
    if (!ok || !slot) {
      _note('save failed, no reload');
      _toast('The browser reset its graphics and parts of the map went blank. Save, then reload the page to bring them back.', false);
      _busy = false;
      return;
    }
    _toast('The browser reset its graphics: saved, reloading your city…', true);
    // Nothing writes the world again on the way out (the exit hooks would
    // take the next rotation file with the same moment).
    SaveSystem.pause();
    try { sessionStorage.setItem('autostart_loadslot', slot); } catch (_e) {}
    setTimeout(() => location.reload(), 400);
  }

  function init() {
    const cv = document.getElementById('canvas');
    if (!cv) return;
    // Chrome fires these on an accelerated 2D canvas when its GPU context
    // goes and when it is handed a fresh, empty one.
    cv.addEventListener('contextlost', () => _note('lost'));
    cv.addEventListener('contextrestored', () => { _recover(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { recover: _recover };
})();
