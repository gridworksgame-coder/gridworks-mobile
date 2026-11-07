/* ═══════════════════════════════════════════════════════════════════
   NOTIFICATION STACK
   RimWorld-style "letter" stack — notification cards pinned to the
   top-right of the screen. Unlike showToast() (auto-fades after 6s),
   these stick around until the player dismisses them, or until game
   code clears them the moment they're no longer relevant (e.g. a
   request gets fulfilled, or a weather event ends). While collapsed only
   the first COLLAPSED_VISIBLE notes are rendered; an arrow toggle under
   the last card expands the stack to show every current note.
   Emergency notes (push({ emergency: true })) always sit above every
   other note, can't be dismissed by the player, and are styled as alarms;
   the code that raised them clears them once the danger is over.
   Notes pushed with `details` (a function returning rows) open into a
   list of those rows when clicked: each row is one entity with a reason,
   and clicking a row runs its own onClick (e.g. jump to it).
   A bar on top hides the whole stack ("Hide Notifications") and brings it
   back ("Show Notifications (n)"). Hidden, it counts what arrived since and
   flashes: red while an emergency is up, yellow for an important note
   (push({ glow: true }) or push({ important: true })). It flashes only for
   notes the player hasn't seen: once the list has been opened, what was in
   it is still counted on the button but no longer flashes. Whether it's hidden
   is remembered between sessions. "Clear" dismisses every note the player
   could dismiss one by one (not emergencies).
   ═══════════════════════════════════════════════════════════════════ */

const NotificationStack = (() => {
  const COLLAPSED_VISIBLE = 3;
  const notes = [];   // { id, icon, title, message, color, border, tag, onClick }
  let counter = 1;
  let expanded = false;
  const HIDE_KEY = 'gw_notif_hidden';
  let hidden = false;
  try { hidden = localStorage.getItem(HIDE_KEY) === '1'; } catch (_e) {}
  let unseen = 0;                 // notes pushed while hidden
  const _important = (n) => !n.emergency && (n.glow || n.important);
  function setHidden(on) {
    hidden = !!on;
    if (!hidden) { unseen = 0; for (const n of notes) n.seen = true; }
    try { localStorage.setItem(HIDE_KEY, hidden ? '1' : '0'); } catch (_e) {}
    try { SFX.click?.(); } catch (_e) {}
    render();
  }
  const _groupSeen = new Map();   // syncGroup tag -> members its card last covered

  // On a contract job site, news from the player's own city reads "HOME: …"
  // so it is not taken for something on the site. A note is the home city's
  // if it was raised at home, or raised on a site from inside fromHome() (the
  // home systems that keep running for the trip: the mayor, loans). The label
  // is put on when the card is drawn, so a card raised at home gains it on
  // the way out and loses it on the way back. Contract business (offers,
  // crews, liabilities: push({ contract: true })) is neither city's.
  let _homeDepth = 0;
  const _atSite = () => typeof ContractSystem !== 'undefined' && !!ContractSystem.isAtSite && ContractSystem.isAtSite();
  const HOME_LABEL = 'HOME: ';
  const _title = (n) => (n.home && _atSite() ? HOME_LABEL : '') + n.title;
  let _drawnAtSite = false;

  // Runs a click handler for a card or a detail row. A focused truck re-pans
  // the camera onto itself every frame, which silently cancels the jump a
  // notification makes. If this click moved the camera, the player has
  // chosen to look elsewhere: end the focus so the camera settles where the
  // notification points. Only a focus that was already running is released
  // — one the click itself set up is left alone.
  function runClick(fn) {
    const seq     = Camera.recentreSeq();
    const focused = typeof TruckSystem !== 'undefined' ? TruckSystem.getFocused() : null;
    Camera.cut(fn);
    if (focused && Camera.recentreSeq() !== seq && TruckSystem.getFocused() === focused) {
      TruckSystem.clearFocus();
    }
  }

  // Brings a note's detail list in line with its rows, patching in place by
  // row key rather than rebuilding — the list refreshes every tick and a
  // rebuild would swallow a click already landing on a row (see updateTag).
  function patchDetails(list, n) {
    let rows = [];
    try { rows = n.details() || []; } catch (_e) {}
    const byKey = new Map();
    for (const el of list.children) byKey.set(el.dataset.key, el);
    const keep = new Set();
    let prev = null;
    for (const r of rows) {
      const key = String(r.key);
      keep.add(key);
      let el = byKey.get(key);
      if (!el) {
        el = document.createElement('div');
        el.className = 'notif-detail';
        el.dataset.key = key;
        el.innerHTML = '<div class="notif-detail-head"><span class="notif-detail-label"></span><span class="notif-detail-meta"></span></div><div class="notif-detail-cause"></div>';
        el.addEventListener('click', (e) => { e.stopPropagation(); if (el._onClick) runClick(el._onClick); });
      }
      el._onClick = r.onClick || null;
      el.style.cursor = r.onClick ? 'pointer' : '';
      const set = (sel, text) => { const t = el.querySelector(sel); if (t.textContent !== text) t.textContent = text; };
      set('.notif-detail-label', r.label || '');
      set('.notif-detail-meta',  r.meta  || '');
      set('.notif-detail-cause', r.cause || '');
      // Only move a row that is out of place; appendChild/insertBefore on
      // every row every tick would churn the DOM for nothing.
      const want = prev ? prev.nextSibling : list.firstChild;
      if (want !== el) list.insertBefore(el, want);
      prev = el;
    }
    for (const [key, el] of byKey) if (!keep.has(key)) el.remove();
  }

  // Top/bottom fade on the stack while there's more to scroll to that way.
  function updateScrollCue(stack) {
    const over = stack.scrollHeight - stack.clientHeight > 1;
    stack.classList.toggle('notif-scrollable', over);   // scrollbar, and the wheel anywhere on the list (index.html)
    stack.classList.toggle('notif-more-above', over && stack.scrollTop > 1);
    stack.classList.toggle('notif-more-below', over && stack.scrollTop < stack.scrollHeight - stack.clientHeight - 1);
  }

  // The stack is pointer-events:none so the map stays clickable in the gaps
  // between cards — which also means the browser never scrolls it, however
  // long the list gets. Wheel events from the cards still bubble up to it,
  // so scroll it by hand.
  let _wheelBound = false;
  function bindWheel(stack) {
    if (_wheelBound) return;
    _wheelBound = true;
    stack.addEventListener('wheel', (e) => {
      const max = stack.scrollHeight - stack.clientHeight;
      if (max <= 0) return;
      const step = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? stack.clientHeight : 1;
      stack.scrollTop = Math.max(0, Math.min(max, stack.scrollTop + e.deltaY * step));
      e.preventDefault();
    }, { passive: false });
    stack.addEventListener('scroll', () => updateScrollCue(stack));
  }

  // The Hide / Show bar on top of the stack.
  function bar() {
    const row = document.createElement('div');
    row.className = 'notif-bar';
    const btn = document.createElement('button');
    btn.className = 'notif-hide-btn';
    if (hidden) {
      const urgent = notes.filter(n => n.emergency).length;
      const important = notes.filter(_important).length;
      // Counted whether or not they've been seen; flashed only while some haven't.
      const newUrgent = notes.some(n => n.emergency && !n.seen), newImportant = notes.some(n => _important(n) && !n.seen);
      btn.classList.add(newUrgent ? 'notif-flash-urgent' : newImportant ? 'notif-flash-important' : 'notif-plain');
      const extra = [];
      if (urgent) extra.push(`${urgent} urgent`);
      if (important) extra.push(`${important} important`);
      unseen = Math.min(unseen, notes.length);       // some may have been cleared since
      if (unseen) extra.push(`${unseen} new`);
      btn.textContent = `▾ Show Notifications (${notes.length})`;
      if (extra.length) {
        const sub = document.createElement('span');
        sub.className = 'notif-bar-sub';
        sub.textContent = extra.join(' · ');
        btn.appendChild(sub);
      }
      btn.title = 'Show the notification cards';
    } else {
      btn.textContent = '▴ Hide Notifications';
      btn.title = 'Hide every notification card (they stay in the list)';
    }
    btn.addEventListener('click', (e) => { e.stopPropagation(); setHidden(!hidden); });
    row.appendChild(btn);
    const clearable = notes.filter(n => !n.emergency).length;
    if (!hidden && clearable > 1) {
      const clr = document.createElement('button');
      clr.className = 'notif-clear-btn';
      clr.textContent = 'Clear';
      clr.title = `Dismiss ${clearable} notifications (emergencies stay until they're resolved)`;
      clr.addEventListener('click', (e) => {
        e.stopPropagation();
        for (let i = notes.length - 1; i >= 0; i--) if (!notes[i].emergency) notes.splice(i, 1);
        expanded = false;
        try { SFX.click?.(); } catch (_e) {}
        render();
      });
      row.appendChild(clr);
    }
    return row;
  }

  function render() {
    const stack = document.getElementById('notif-stack');
    if (!stack) return;
    bindWheel(stack);
    _drawnAtSite = _atSite();
    const keepScroll = stack.scrollTop;
    stack.innerHTML = '';
    stack.classList.toggle('notif-hidden', hidden);
    if (notes.length) stack.appendChild(bar());
    if (hidden) { stack.scrollTop = 0; updateScrollCue(stack); return; }
    // Nothing left to expand into — snap back so the next pile-up starts collapsed.
    if (notes.length <= COLLAPSED_VISIBLE) expanded = false;
    const visible = expanded ? notes : notes.slice(0, COLLAPSED_VISIBLE);
    for (const n of visible) {
      const card = document.createElement('div');
      card.className = 'notif-card' + (n.emergency ? ' notif-emergency' : n.glow ? ' notif-glow' : '');
      // Lets updateTag() find this card again and rewrite its text without
      // going through render() — see the note there.
      card.dataset.notifId = n.id;
      card.style.borderLeftColor = n.border;
      if (n.glow) card.style.setProperty('--glow-color', n.color);
      if (n.onClick || n.details) card.style.cursor = 'pointer';

      const dismiss = document.createElement('button');
      dismiss.className = 'notif-dismiss';
      dismiss.title = 'Dismiss';
      dismiss.textContent = '×';
      dismiss.addEventListener('click', (e) => {
        e.stopPropagation();
        NotificationStack.dismiss(n.id);
      });

      const icon = document.createElement('div');
      icon.className = 'notif-icon';
      icon.textContent = n.icon;

      const body = document.createElement('div');
      body.className = 'notif-body';
      const title = document.createElement('div');
      title.className = 'notif-title';
      title.style.color = n.color;
      title.textContent = _title(n);
      body.appendChild(title);
      if (n.message) {
        const msg = document.createElement('div');
        msg.className = 'notif-msg';
        msg.textContent = n.message;
        body.appendChild(msg);
      }
      if (n.details) {
        const caret = document.createElement('div');
        caret.className = 'notif-caret';
        caret.textContent = n.open ? '▴ Hide' : '▾ Show which';
        body.appendChild(caret);
        if (n.open) {
          const list = document.createElement('div');
          list.className = 'notif-details';
          patchDetails(list, n);
          body.appendChild(list);
        }
      }

      if (!n.emergency) card.appendChild(dismiss);
      else {
        const tagEl = document.createElement('div');
        tagEl.className = 'notif-emergency-tag';
        tagEl.textContent = 'EMERGENCY';
        body.insertBefore(tagEl, body.firstChild);
      }
      card.appendChild(icon);
      card.appendChild(body);
      // A card with details opens/closes its list; rebuilding here is safe
      // because this click is the one being handled.
      if (n.details) card.addEventListener('click', () => { n.open = !n.open; SFX.click?.(); render(); });
      else if (n.onClick) card.addEventListener('click', () => runClick(n.onClick));
      stack.appendChild(card);
    }

    if (notes.length > COLLAPSED_VISIBLE) {
      const hidden = notes.length - COLLAPSED_VISIBLE;
      const toggle = document.createElement('button');
      toggle.className = 'notif-toggle';
      toggle.textContent = expanded ? '▴ Show less' : `▾ ${hidden} more`;
      toggle.title = expanded ? 'Collapse notifications' : 'Show all notifications';
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        expanded = !expanded;
        render();
        if (!expanded) stack.scrollTop = 0;
      });
      stack.appendChild(toggle);
    }
    // Re-rendering (a new note, a dismissal) shouldn't throw the player back
    // to the top of a list they've scrolled down.
    stack.scrollTop = keepScroll;
    updateScrollCue(stack);
  }

  return {
    // Returns the notification id (so callers can dismiss it later, e.g.
    // when a request gets fulfilled or a weather event ends). If `tag` is
    // given and a note with that tag is already showing, the push is
    // dropped and the existing id is returned instead — avoids duplicate
    // cards for the same ongoing event/request.
    // `important` marks a note worth the player's attention without a glow:
    // it flashes the Show button yellow while the stack is hidden.
    push({ icon = '❗', title, message = '', color = '#f0c040', border = '#604010', tag = null, onClick = null, glow = false, emergency = false, important = false, details = null, contract = false }) {
      // See the same guard in showToast: once the map is exploding there is
      // nothing left to notify anybody about.
      if (typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.hasEnded()) return 0;
      if (tag) {
        const existing = notes.find(n => n.tag === tag);
        if (existing) return existing.id;
      }
      const id = counter++;
      // Raised while standing on a contract job site (see dismissSiteAlarms),
      // unless it is home news reported from there (fromHome).
      const site = _atSite() && _homeDepth === 0;
      const home = !site && !contract;
      // A note that turns up while the list is open has been seen as it arrived.
      const note = { id, icon, title, message, color, border, tag, onClick, glow, emergency, important, details, open: false, site, home, seen: !hidden };
      if (hidden) unseen++;
      if (emergency) {
        // After any emergencies already up, ahead of everything else.
        const at = notes.findIndex(n => !n.emergency);
        notes.splice(at === -1 ? notes.length : at, 0, note);
      } else {
        notes.push(note);
      }
      try { SFX.popup?.(); } catch (_e) {}
      // Cards go in the message log too, so an event raised only as a card
      // (no toast alongside it) still leaves a history entry.
      if (typeof MessageLog !== 'undefined') MessageLog.add(`${icon} ${_title(note)}${message ? `: ${message}` : ''}`, color, onClick);
      render();
      // Make sure it's actually on screen, not scrolled past.
      if (emergency) { const s = document.getElementById('notif-stack'); if (s) s.scrollTop = 0; }
      return id;
    },

    // Rewrites a live card's title/message. Use this for a card that reports
    // a moving number (a dwindling deposit, a filling tank) so it doesn't sit
    // there quoting a figure from minutes ago.
    //
    // Deliberately NOT a re-push or a render(): render() rebuilds every card
    // from scratch, and doing that on a per-tick update would destroy the
    // node a click had already landed on, swallowing the dismiss button
    // (same failure mode documented at length in the truck patrol panel).
    // So this mutates the note and patches the existing DOM text in place,
    // and does nothing at all when the text hasn't actually changed.
    //
    // Returns false when no card with that tag exists — never pushed, or the
    // player dismissed it — so a caller can tell that apart from a success.
    updateTag(tag, { title, message, details } = {}) {
      const note = notes.find(n => n.tag === tag);
      if (!note) return false;
      if (details) {
        note.details = details;
        const list = note.open && document.querySelector(`#notif-stack [data-notif-id="${note.id}"] .notif-details`);
        if (list) patchDetails(list, note);
      }
      let changed = false;
      if (title   !== undefined && title   !== note.title)   { note.title   = title;   changed = true; }
      if (message !== undefined && message !== note.message) { note.message = message; changed = true; }
      if (!changed) return true;
      const stack = document.getElementById('notif-stack');
      const card  = stack && stack.querySelector(`[data-notif-id="${note.id}"]`);
      // Hidden in the collapsed stack, so it has no DOM yet; the note now holds
      // the new text and render() will use it when the card comes into view.
      if (!card) return true;
      const titleEl = card.querySelector('.notif-title');
      const msgEl   = card.querySelector('.notif-msg');
      if (titleEl) titleEl.textContent = _title(note);
      // A card pushed with no message has no .notif-msg element to patch;
      // a full render() is the only way to grow one, and no caller needs it.
      if (msgEl)   msgEl.textContent   = note.message;
      return true;
    },

    dismiss(id) {
      const i = notes.findIndex(n => n.id === id);
      if (i === -1) return;
      notes.splice(i, 1);
      render();
    },

    // Whether a tagged card is on screen right now. Lets a caller driving a
    // long-running condition tell "never shown yet" apart from "the player
    // dismissed it", so re-pushing every tick doesn't defeat the X button.
    hasTag(tag) { return notes.some(n => n.tag === tag); },

    // One card standing for a group of entities (e.g. every customer
    // threatening to leave), showing their count. Call it every update with
    // the current members; `make(n)` returns the push() options for n of them
    // (its title/message are also used to refresh a live card in place).
    // Empty group → card cleared. Dismissed by the player → stays gone until
    // an entity that wasn't in the group last time joins it.
    syncGroup(tag, members, make) {
      const seen = _groupSeen.get(tag) || new Set();
      const n = members.length;
      if (!n) { this.dismissTag(tag); _groupSeen.delete(tag); return; }
      const opts = make(n);
      if (this.hasTag(tag)) this.updateTag(tag, { title: opts.title, message: opts.message, details: opts.details });
      else if (members.some(e => !seen.has(e))) this.push({ ...opts, tag });
      _groupSeen.set(tag, new Set(members));
    },

    dismissTag(tag) {
      const i = notes.findIndex(n => n.tag === tag);
      if (i === -1) return;
      notes.splice(i, 1);
      render();
    },

    // Drops every emergency card raised on a contract job site. An emergency
    // card has no X: only the code that raised it clears it, from the tick
    // of the thing it is about. Once the player leaves the site (home for a
    // while, or the job closed out) that thing stops ticking, so its alarm
    // would sit there for ever with its countdown frozen. Going back to a
    // site whose reactor is still in trouble raises the card again.
    dismissSiteAlarms() {
      const before = notes.length;
      for (let i = notes.length - 1; i >= 0; i--) if (notes[i].site && notes[i].emergency) notes.splice(i, 1);
      if (notes.length !== before) render();
    },

    // Runs `fn` as the home city: whatever it raises while the player is on a
    // job site is labelled HOME (cards here, toasts through homeLabel).
    fromHome(fn) {
      _homeDepth++;
      try { return fn(); } finally { _homeDepth--; }
    },
    // A toast's text as it should read: "HOME: " after its leading icon when
    // it is home news raised on a job site, else unchanged.
    homeLabel(msg, re) {
      if (_homeDepth === 0 || !_atSite() || typeof msg !== 'string') return msg;
      const m = re ? msg.match(re) : null;
      return m ? m[0] + HOME_LABEL + msg.slice(m[0].length) : HOME_LABEL + msg;
    },
    // Redraws the stack when the player has travelled since it was drawn,
    // so home cards gain or drop their label (GameLoop, every tick).
    syncPlace() { if (_atSite() !== _drawnAtSite) render(); },

    isHidden() { return hidden; },
    setHidden,
    clear() { notes.length = 0; render(); },
    clearAll() { notes.length = 0; render(); },

    init() { render(); },
  };
})();
