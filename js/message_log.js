/* ═══════════════════════════════════════════════════════════════════
   MESSAGE LOG
   On-screen scrolling message/event log.
   ═══════════════════════════════════════════════════════════════════ */

const MessageLog = (() => {
  const MAX = 80;
  const entries = [];   // { msg, color, time, onClick }
  let panelOpen = false;
  let unseenCount = 0;

  function formatTime(date) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function renderEntries() {
    const container = document.getElementById('log-entries');
    if (!container) return;
    container.innerHTML = '';
    for (const e of entries) {
      const row = document.createElement('div');
      row.className = 'log-entry';
      row.innerHTML = `<span class="log-time">${e.time}</span><span class="log-msg" style="color:${e.color}">${e.msg}</span>`;
      if (e.onClick) {
        row.classList.add('log-entry-clickable');
        row.title = 'Click to jump there';
        row.addEventListener('click', () => Camera.cut(e.onClick));
      }
      container.appendChild(row);
    }
  }

  function updateBadge() {
    const btn = document.getElementById('btn-msglog');
    if (!btn) return;
    btn.classList.toggle('has-new', unseenCount > 0);
  }

  return {
    add(msg, color, onClick = null) {
      entries.unshift({ msg, color, time: formatTime(new Date()), onClick });
      if (entries.length > MAX) entries.length = MAX;
      if (!panelOpen) {
        unseenCount++;
        updateBadge();
      }
      if (panelOpen) renderEntries();
    },

    init() {
      const btn    = document.getElementById('btn-msglog');
      const panel  = document.getElementById('msg-log-panel');
      const close  = document.getElementById('log-close');
      if (!btn || !panel || !close) return;

      btn.addEventListener('click', () => {
        SFX.click(); panelOpen = !panelOpen;
        panel.classList.toggle('visible', panelOpen);
        btn.classList.toggle('open', panelOpen);
        if (panelOpen) {
          unseenCount = 0;
          updateBadge();
          renderEntries();
        }
      });

      close.addEventListener('click', () => { SFX.click(); MessageLog.close(); });
    },

    isOpen() { return panelOpen; },
    // Put the log away without a click sound (PanelDismiss closes it when
    // the player clicks elsewhere).
    close() {
      panelOpen = false;
      document.getElementById('msg-log-panel')?.classList.remove('visible');
      document.getElementById('btn-msglog')?.classList.remove('open');
    },
  };
})();

// Unlock-specific toast — green, shows "⚡ UNLOCKED:" prefix
// Map entity type to hotbar category id
