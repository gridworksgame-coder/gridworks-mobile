/* ═══════════════════════════════════════════════════════════════════
   EVENTS PANEL
   Click the clock (bottom left: season, day, time) to open the town's
   calendar: what is on now, what is still to come this season, and when
   the season turns. Everything it shows is read from SeasonalEvents,
   Seasons and WeatherEventSystem; it keeps no state of its own beyond
   being open or shut.
   ═══════════════════════════════════════════════════════════════════ */

const EventsPanel = (() => {
  let timer = null;
  let lastHtml = '';
  const el   = () => document.getElementById('events-panel');
  const esc  = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  const hourLen = () => DayNight.secondsPerGameHour();
  const dayLen  = () => hourLen() * 24;
  // "10:00" or "10:00 AM", the way the clock itself is set to read.
  function clockAt(sec) {
    const h = ((sec / dayLen()) % 1) * 24, hh = Math.floor(h + 1e-6);
    const mm = String(Math.floor(((h + 1e-6) % 1) * 60)).padStart(2, '0');
    if (DayNight.isUse24Hour()) return `${String(hh).padStart(2, '0')}:${mm}`;
    return `${hh % 12 === 0 ? 12 : hh % 12}:${mm} ${hh < 12 ? 'AM' : 'PM'}`;
  }
  function whenText(at) {
    const days = Math.floor(at / dayLen()) - Math.floor(DayNight.getElapsed() / dayLen());
    const day  = days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
    return `${day} · ${clockAt(at)}`;
  }

  function row(icon, name, when, lines, cls = '') {
    return `<div class="evp-item ${cls}"><div class="evp-top"><span class="evp-name"><span class="evp-icon">${icon}</span>${esc(name)}</span>` +
           `<span class="evp-when">${esc(when)}</span></div>${lines.map(l => `<div class="evp-line${l.cls ? ' ' + l.cls : ''}">${esc(l.text)}</div>`).join('')}</div>`;
  }

  function build() {
    const seasons = typeof Seasons !== 'undefined' && Seasons.enabled();
    const away    = typeof ContractSystem !== 'undefined' && ContractSystem.isAway && ContractSystem.isAway();
    let html = '';

    if (seasons) {
      html += `<div class="evp-season"><span>${Seasons.icon()} ${esc(Seasons.name())} · day ${Seasons.dayOfSeason()} of ${Seasons.SEASON_DAYS}</span>` +
              `<span class="evp-dim">Day ${DayNight.day()}</span></div>`;
    }

    // ── On now ──
    let nowRows = '';
    const live = seasons && typeof SeasonalEvents !== 'undefined' ? SeasonalEvents.getLive() : null;
    if (live) {
      const ev  = SeasonalEvents.EVENTS.find(e => e.id === live.id);
      const hrs = Math.max(1, Math.ceil((live.end - DayNight.getElapsed()) / hourLen()));
      const lines = [{ text: ev.blurb }];
      if (live.pledged) lines.push({ text: `Pledge: keep ${ev.pledge.what} lit · ${Math.round(live.share * 100)}% so far`, cls: live.share >= 0.97 ? 'good' : 'warn' });
      nowRows += row(ev.icon, ev.name, `${hrs}h left`, lines, ev.hazard ? 'hazard' : 'live');
    }
    const wx = typeof WeatherEventSystem !== 'undefined' ? WeatherEventSystem.getActiveEvent() : null;
    if (wx) {
      const label = WeatherEventSystem.labelOf(wx);
      const sp = label.indexOf(' ');
      nowRows += row(sp > 0 ? label.slice(0, sp) : '☁', sp > 0 ? label.slice(sp + 1) : label, 'Now', [{ text: 'Weather over the city right now.' }], 'hazard');
    }
    // A launch count at the spaceport: live once propellant is loading, a date before that.
    const launch = !away && typeof LaunchSystem !== 'undefined' ? LaunchSystem.getNext() : null;
    const surge = launch ? `${(launch.peakKw / 1000).toFixed(1)} MW` : '';
    if (launch && launch.fuelling) {
      const left = Math.max(0, launch.at - DayNight.getElapsed());
      const when = left > 99 ? `${Math.max(1, Math.ceil(left / hourLen() * 60))} min to liftoff` : `T-${Math.ceil(left)}s`;
      nowRows += row('🚀', `Starhaven launch: mission ${launch.mission}`, when,
        [{ text: `Propellant loading: the count draws up to ${surge}.` }, { text: `Starhaven needs ${surge} available at liftoff, or the launch is scrubbed.`, cls: 'warn' }], 'live');
    }
    if (nowRows) html += `<div class="evp-head">On now</div>${nowRows}`;

    // ── Coming up ──
    html += '<div class="evp-head">Coming up</div>';
    if (launch && !launch.fuelling) {
      html += row('🚀', `Starhaven launch: mission ${launch.mission}`, whenText(launch.at),
        [{ text: `${launch.cls}: Starhaven needs ${surge} available at liftoff, or the launch is scrubbed.` }, { text: `Have it there for a ${typeof formatMoney === 'function' ? formatMoney(launch.bonus) : '$' + launch.bonus} bonus.`, cls: 'dim' }], 'live');
    }
    if (!seasons) {
      html += '<div class="evp-empty">Seasons are off in this world, so the town keeps no calendar.</div>';
    } else {
      if (away) html += '<div class="evp-empty">You are away on a contract: the calendar at home is paused until you return.</div>';
      const next = SeasonalEvents.getSchedule().filter(s => s.phase === 'pending' || s.phase === 'warned').sort((a, b) => a.at - b.at);
      for (const s of next) {
        const lines = [{ text: s.blurb }];
        if (!s.relevant)    lines.push({ text: 'Nothing in town takes part in this one yet.', cls: 'dim' });
        else if (s.what)    lines.push({ text: `Pledge: keep ${s.what} lit throughout for a bonus.`, cls: 'dim' });
        html += row(s.icon, s.name, whenText(s.at), lines, s.hazard ? 'hazard' : '');
      }
      if (!next.length) html += '<div class="evp-empty">Nothing else on the calendar this season.</div>';
      const d = Seasons.daysToNext();
      html += row('📅', `${Seasons.nextName()} begins`, `In ${plural(d, 'day')}`, [{ text: 'A new season brings a new calendar.', cls: 'dim' }], 'turn');
    }
    return html;
  }

  function refresh() {
    const p = el();
    if (!p || !p.classList.contains('visible')) return;
    const html = build();
    if (html === lastHtml) return;      // leave the DOM alone unless something changed
    lastHtml = html;
    document.getElementById('evp-body').innerHTML = html;
  }

  function open() {
    const p = el();
    if (!p) return;
    p.classList.add('visible');
    lastHtml = '';
    refresh();
    if (!timer) timer = setInterval(refresh, 500);
  }
  function close() {
    const p = el();
    if (p) p.classList.remove('visible');
    if (timer) { clearInterval(timer); timer = null; }
  }
  const isOpen = () => !!el()?.classList.contains('visible');
  const toggle = () => (isOpen() ? close() : open());

  document.getElementById('clock')?.addEventListener('click', toggle);
  document.getElementById('evp-close')?.addEventListener('click', e => { e.stopPropagation(); close(); });

  return { open, close, toggle, isOpen, refresh };
})();
