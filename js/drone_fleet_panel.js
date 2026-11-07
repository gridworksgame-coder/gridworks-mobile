/* ═══════════════════════════════════════════════════════════════════
   DRONE FLEET PANEL
   ─────────────────────────────────────────────────────────────────
   Fleet-wide roster across every Drone Port, with a summary band at the
   top and one row per port.

   The per-port panel already answers "what is THIS port doing". What it
   cannot answer is the question you actually have once there are three or
   four ports: which one is dark, which one is short of battery, and
   where the whole fleet's power draw is going. That is a fleet view, and
   it is a different thing from four building panels.

   Rows are the same deal as the truck roster: the DOM for a row is kept
   alive across renders and only its text is patched in place. Rebuilding
   via innerHTML every tick destroys the Locate button mid-press — a native
   click is cancelled outright if the element you pressed down on leaves
   the document before mouseup, and no amount of delegation recovers it.
   ═══════════════════════════════════════════════════════════════════ */
const DroneFleetPanel = (() => {

  const rows = new Map();   // port entity -> { el, labelEl, statusEl, taskEl, jobsEl, btn, open, ... }

  function isOpen() {
    const panel = document.getElementById('drones-panel');
    return !!panel && panel.classList.contains('visible');
  }

  // Ports in placement order, so "Drone Port #2" stays #2 for as long as it
  // stands rather than renumbering every time an earlier one is demolished.
  function ports() {
    return Array.from(EntityRegistry.getByType(T.DRONEPORT))
      .sort((a, b) => (a.row - b.row) || (a.col - b.col));
  }

  // A port's number, or 0 while it is the only one: a lone port has nothing
  // to be told apart from, so it stays plain "Drone Port" everywhere.
  function number(port) {
    const list = ports();
    return list.length > 1 ? list.indexOf(port) + 1 : 0;
  }
  const label = (port) => { const n = number(port); return n ? `Drone Port #${n}` : 'Drone Port'; };

  // The one line that matters most for a port: why it is NOT flying, if it
  // is not. A port with nothing to do is fine; a dark port is a thing the
  // player can act on, so that wins the slot. A storm only slows the fleet.
  function portStatus(port, st) {
    const wx = DroneSystem.slowedBy();
    if (!port.powered)  return { text: st.out > 0 ? `Unpowered: no launches · ${st.out} still out` : 'Unpowered: fleet cannot launch', cls: 'bad' };
    if (wx && st.out > 0) return { text: `${st.out} in flight · slowed by the ${wx.name.toLowerCase()}`, cls: 'warn' };
    if (st.out > 0)     return { text: `${st.out} in flight`, cls: 'good' };
    if (st.charging > 0) return { text: `Standing by: ${st.charging} charging`, cls: 'dim' };
    return { text: 'Standing by', cls: 'dim' };
  }

  // What the weather is doing to the fleet, in one sentence, or ''. `out` is
  // how many drones are in the air across whatever the sentence covers.
  function weatherLine(out) {
    const wx = DroneSystem.slowedBy();
    if (!wx) return '';
    return `${wx.icon} ${wx.name}: drones fly at ${Math.round(wx.speed * 100)}% speed until it clears, so jobs take longer`;
  }

  const COL = { good: '#5fe0a8', warn: '#e8b020', bad: '#ff6040', dim: 'var(--text-dim)' };

  function locatePort(port) {
    Camera.recentreOn((port.col + (port.width  || 1) * 0.5) * TILE,
                      (port.row + (port.height || 1) * 0.5) * TILE);
    SFX.click();
  }

  // What one job reads as in the list: the work, and how far along it is.
  const nameOf = (e) => (e && (EntityDefs[e.type] || {}).label) || 'Building';
  function describeJob(j) {
    let text;
    if (j.kind === 'repair')    text = `Repair: ${nameOf(j.target)}`;
    else if (j.kind === 'wire') text = `Line service: ${nameOf(j.target)}`;
    else {
      const what = j.kind === 'waste' ? (j.hot ? 'Hot waste' : 'Waste') : j.cargo;
      text = `${what}: ${nameOf(j.from)} → ${j.to ? nameOf(j.to) : 'facility'}`;
    }
    const twoLeg = j.kind === 'waste' || j.kind === 'cargo';
    const stage = j.charging           ? 'charging en route'
                : j.state === 'launch' ? 'launching'
                : j.state === 'working' ? (twoLeg ? (j.loaded ? 'unloading' : 'loading') : 'on station')
                : j.loaded             ? `delivering ${Math.round(j.amount)}u`
                : twoLeg               ? 'to pickup' : 'en route';
    return { text, stage };
  }

  // Jobs inside `port`'s coverage network that some OTHER port is flying.
  const portNum = new Map();   // port -> its roster number, set each render
  function networkJobs(port) {
    const list = [];
    for (const s of DroneSystem.networkOf(port).squares) {
      if (s.port === port) continue;
      for (const job of DroneSystem.jobs(s.port)) list.push({ port: s.port, job });
    }
    return list;
  }

  const JOB_COL = { repair: '#ffc24a', wire: '#9fd8ff', waste: '#7fd8a0', cargo: '#d0a0ff', core: '#a0e8ff' };

  // The expanded list under a row: one line per distinct job, with a count
  // where several drones share one. Rebuilt only when what it SAYS changes,
  // for the same reason the rows are kept alive: a line replaced mid-press
  // never gets its click.
  function renderJobs(row, port, st) {
    row.chevEl.textContent = row.open ? '▾' : '▸';
    row.jobsEl.style.display = row.open ? '' : 'none';
    if (!row.open) return;

    const lines = [];
    const jobs = DroneSystem.jobs(port);
    for (const j of jobs) {
      const d = describeJob(j);
      const same = lines.find(l => l.target === j.target && l.text === d.text && l.stage === d.stage);
      if (same) same.n++;
      else lines.push({ ...d, n: 1, target: j.target, col: JOB_COL[j.kind] });
    }
    const returning = st.out - jobs.length;
    if (returning > 0) lines.push({ text: 'Returning to pad', stage: '', n: returning, target: port, col: COL.dim });

    // Work in this port's network that another port's drones are flying. A
    // job goes to the nearest port with a drone free, so a port can sit idle
    // with work all around it; without these lines that reads as a fleet
    // ignoring jobs rather than a network sharing them.
    const others = [];
    for (const o of networkJobs(port)) {
      const d = describeJob(o.job), stage = `Port #${portNum.get(o.port)}`;
      const same = others.find(l => l.text === d.text && l.stage === stage);
      if (same) same.n++;
      else others.push({ text: d.text, stage, n: 1, target: o.job.target, col: JOB_COL[o.job.kind] });
    }
    // And work nobody has taken at all, with why: a request that cannot be
    // flown is the one the player most needs to hear about.
    const waiting = DroneSystem.pending(port).map(p => ({
      text: p.kind === 'repair' ? `Repair: ${nameOf(p.target)}`
          : p.kind === 'waste'  ? `${p.hot ? 'Hot waste' : 'Waste'}: ${nameOf(p.target)}`
          : `${p.cargo} → ${nameOf(p.target)}`,
      stage: p.why, n: 1, target: p.target, col: JOB_COL[p.kind],
    }));

    if (!lines.length) lines.push({ text: others.length || waiting.length ? 'None flown from this port' : 'No jobs in this network', stage: '', n: 1, target: null, col: COL.dim });
    if (others.length) lines.push({ text: 'Flown by other ports in network', stage: '', n: 1, target: null, col: COL.dim, head: true }, ...others);
    if (waiting.length) lines.push({ text: 'Not being flown', stage: '', n: 1, target: null, col: COL.warn, head: true }, ...waiting);

    const sig = lines.map(l => `${l.text}|${l.stage}|${l.n}`).join('\n');
    row.jobTargets = lines.map(l => l.target);
    if (sig === row.jobsSig) return;
    row.jobsSig = sig;
    row.jobsEl.textContent = '';
    lines.forEach((l, i) => {
      const line = document.createElement('div');
      line.dataset.job = i;
      line.style.cssText = `display:flex;gap:8px;justify-content:space-between;font-size:10px;padding:3px 0;${l.target ? 'cursor:pointer;' : ''}`
        + (l.head ? 'font-size:9px;letter-spacing:0.08em;text-transform:uppercase;margin-top:4px;' : '');
      if (l.target) line.title = 'Show on map';
      const name = document.createElement('span');
      name.style.cssText = `color:${l.col};min-width:0;`;
      name.textContent = (l.n > 1 ? `${l.n}× ` : '') + l.text;
      const stage = document.createElement('span');
      stage.style.cssText = 'color:var(--text-dim);white-space:nowrap;';
      stage.textContent = l.stage;
      line.append(name, stage);
      row.jobsEl.appendChild(line);
    });
  }

  function createRow(port) {
    const el = document.createElement('div');
    el.style.cssText = 'padding:8px 4px;border-bottom:1px solid rgba(255,255,255,0.05);';
    el.innerHTML = `<div style="display:flex;gap:10px;align-items:center;"><div style="line-height:1;color:#5ad8ff;"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true" style="vertical-align:middle"><path d="M9 9 5.2 5.2M15 9l3.8-3.8M9 15l-3.8 3.8M15 15l3.8 3.8"/><rect x="8.6" y="8.6" width="6.8" height="6.8" rx="2" fill="currentColor" fill-opacity="0.28"/><circle cx="5" cy="5" r="3.1"/><circle cx="19" cy="5" r="3.1"/><circle cx="5" cy="19" r="3.1"/><circle cx="19" cy="19" r="3.1"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/></svg></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#9fd8ff;font-weight:600;"><span class="drone-row-label"></span> <span class="drone-row-chev" style="color:var(--text-dim);"></span></div>
        <div class="drone-row-status" style="font-size:10px;margin-top:2px;"></div>
        <div class="drone-row-task" style="font-size:10px;color:var(--text-dim);margin-top:1px;"></div>
      </div>
      <button class="drone-locate-btn" style="background:rgba(90,216,255,0.12);border:1px solid rgba(90,216,255,0.4);color:#5ad8ff;font-size:10px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;padding:5px 9px;border-radius:4px;cursor:pointer;white-space:nowrap;">Locate</button></div>
      <div class="drone-row-jobs" style="display:none;margin:6px 0 0 30px;padding:3px 0 0 8px;border-left:1px solid rgba(90,216,255,0.25);"></div>`;
    const labelEl  = el.querySelector('.drone-row-label');
    const chevEl   = el.querySelector('.drone-row-chev');
    const statusEl = el.querySelector('.drone-row-status');
    const taskEl   = el.querySelector('.drone-row-task');
    const jobsEl   = el.querySelector('.drone-row-jobs');
    const btn      = el.querySelector('.drone-locate-btn');
    const row = { el, labelEl, chevEl, statusEl, taskEl, jobsEl, btn, open: false, jobsSig: null, jobTargets: [] };
    btn.addEventListener('click', () => locatePort(port));
    // Clicking the fleet unfolds what its drones are out doing, without
    // moving the camera — going there is Locate's job.
    const head = el.firstElementChild;
    for (const target of [head.children[0], head.children[1]]) {
      target.style.cursor = 'pointer';
      target.title = 'Show assigned jobs';
      target.addEventListener('click', () => {
        row.open = !row.open;
        renderJobs(row, port, DroneSystem.status(port));
        SFX.click();
      });
    }
    labelEl.addEventListener('mouseenter', () => { labelEl.style.textDecoration = 'underline'; });
    labelEl.addEventListener('mouseleave', () => { labelEl.style.textDecoration = ''; });
    // A job line takes the camera to where that job is.
    jobsEl.addEventListener('click', (ev) => {
      const line = ev.target.closest('[data-job]');
      const t = line && row.jobTargets[+line.dataset.job];
      if (!t) return;
      Camera.recentreOn((t.col + (t.width  || 1) * 0.5) * TILE,
                        (t.row + (t.height || 1) * 0.5) * TILE);
      SFX.click();
    });
    return row;
  }

  // Fleet totals across every port, for the band above the roster.
  function fleetTotals(list) {
    const tot = { drones: 0, out: 0, repairing: 0, hauling: 0, servicing: 0, reserved: 0, cargo: 0,
                  charging: 0, draw: 0, baseDraw: 0, dark: 0, battery: 0 };
    const portBase = EntityDefs[T.DRONEPORT].powerInput || 120;
    for (const p of list) {
      const st = DroneSystem.status(p);
      tot.drones    += st.total;
      tot.out       += st.out;
      tot.repairing += st.repairing;
      tot.hauling   += st.hauling;
      tot.servicing += st.servicing;
      tot.cargo     += (st.cargo || 0) + (st.cores || 0);   // Field Core runs are cargo too
      tot.reserved  += st.reserved;
      tot.charging  += st.charging;
      tot.battery   += st.avgBattery * st.total;
      tot.draw      += p._activePowerInput !== undefined ? p._activePowerInput : portBase;
      tot.baseDraw  += portBase;
      if (!p.powered) tot.dark++;
    }
    // Charging Ports have no fleet of their own, but what they draw is the
    // fleet's: they are where its drones top up on a long run.
    const chBase = (EntityDefs[T.DRONECHARGER] || {}).powerInput || 10;
    for (const c of EntityRegistry.getByType(T.DRONECHARGER)) {
      tot.draw     += c._activePowerInput !== undefined ? c._activePowerInput : chBase;
      tot.baseDraw += chBase;
    }
    tot.battery = tot.drones ? tot.battery / tot.drones : 0;
    return tot;
  }

  function renderSummary(list) {
    const el = document.getElementById('drones-summary');
    if (!el) return;
    const t = fleetTotals(list);
    const stat = (label, value, colour) =>
      `<div style="flex:1;min-width:0;">
         <div style="font-size:9px;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-dim);">${label}</div>
         <div style="font-size:13px;font-weight:600;color:${colour};margin-top:1px;">${value}</div>
       </div>`;
    const batCol = t.battery < 0.35 ? COL.bad : t.battery < 0.7 ? COL.warn : COL.good;
    // A note only when there is something to say. A quiet fleet gets no
    // banner, so the one that appears actually means something. Weather and
    // a dark port are separate problems, so both show when both are true.
    const line = (text, col) => `<div style="margin-top:8px;font-size:10px;color:${col};">${text}</div>`;
    const wx = weatherLine(t.out);
    const fx = !wx && DroneSystem.weatherEffect();
    const note = (wx ? line(wx, COL.warn) : fx ? line(`🌡 ${fx.note}`, COL.warn) : '')
      + (t.dark > 0 ? line(`⚡ ${t.dark} port${t.dark === 1 ? '' : 's'} unpowered: ${t.dark === 1 ? 'its' : 'their'} fleet cannot launch`, COL.bad) : '');
    el.innerHTML =
      `<div style="display:flex;gap:10px;">
         ${stat('Aloft',   `${t.out}/${t.drones}`, t.out ? COL.good : COL.dim)}
         ${stat('Repairs', t.repairing || '—',     t.repairing ? '#ffc24a' : COL.dim)}
         ${stat('Lines',   t.servicing || '—',     t.servicing ? '#9fd8ff' : COL.dim)}
         ${stat('Waste',   t.hauling   || '—',     t.hauling ? '#7fd8a0' : COL.dim)}
         ${stat('Cargo',   t.cargo     || '—',     t.cargo ? '#d0a0ff' : COL.dim)}
       </div>
       <div style="display:flex;gap:10px;margin-top:8px;">
         ${stat('Battery',   `${Math.round(t.battery * 100)}%`, batCol)}
         ${stat('Draw',      `${formatPower(Math.round(t.draw))}`, t.draw > t.baseDraw ? COL.warn : COL.dim)}
         ${stat('Serviced',  DroneSystem.servicedSpans() || '—', DroneSystem.servicedSpans() ? '#9fd8ff' : COL.dim)}
         ${stat('In Transit', t.reserved > 0 ? `${Math.round(t.reserved)} u` : '—', t.reserved > 0 ? '#7fd8a0' : COL.dim)}
       </div>${note}`;
  }

  function renderPanel() {
    const body = document.getElementById('drones-body');
    if (!body) return;
    const list = ports();

    const countEl = document.getElementById('drones-count');
    if (countEl) countEl.textContent = list.length ? `(${list.length})` : '';

    const summaryEl = document.getElementById('drones-summary');
    if (!list.length) {
      rows.clear();
      if (summaryEl) summaryEl.innerHTML = '';
      body.innerHTML = `<div style="padding:12px 4px;font-size:11px;color:var(--text-dim);">No drone ports built.</div>`;
      return;
    }

    renderSummary(list);

    // Drop rows for ports that no longer exist.
    for (const p of rows.keys()) if (!list.includes(p)) rows.delete(p);

    portNum.clear();
    list.forEach((port, i) => portNum.set(port, i + 1));

    list.forEach((port, i) => {
      let row = rows.get(port);
      if (!row) { row = createRow(port); rows.set(port, row); }

      const st = DroneSystem.status(port);
      const s  = portStatus(port, st);
      row.labelEl.textContent   = list.length > 1 ? `Drone Port #${i + 1}` : 'Drone Port';
      row.statusEl.textContent  = s.text;
      row.statusEl.style.color  = COL[s.cls];

      // Second line: what the fleet is actually doing, and what it has left.
      const bits = [];
      if (st.repairing) bits.push(`${st.repairing} repair`);
      if (st.servicing) bits.push(`${st.servicing} line`);
      if (st.hauling)   bits.push(`${st.hauling} waste`);
      if (st.cargo)     bits.push(`${st.cargo} cargo`);
      if (st.cores)     bits.push(`${st.cores} core`);
      if (st.returning) bits.push(`${st.returning} returning`);
      if (st.reserved > 0) bits.push(`${Math.round(st.reserved)}u in transit`);
      if (!bits.length) {
        bits.push(`${st.idle} on pad`);
        const shared = networkJobs(port).length;
        if (shared) bits.push(`${shared} network job${shared === 1 ? '' : 's'} flown by other ports`);
      }
      const stuck = DroneSystem.pending(port).length;
      if (stuck) bits.push(`${stuck} not being flown`);
      bits.push(`bat ${Math.round(st.avgBattery * 100)}%`);
      row.taskEl.textContent = bits.join(' · ');
      renderJobs(row, port, st);

      const current = body.children[i];
      if (current !== row.el) body.insertBefore(row.el, current || null);
    });

    // Trim leftover DOM nodes past the current port count.
    while (body.children.length > list.length) body.removeChild(body.lastChild);
  }

  return {
    tick() {
      const btn = document.getElementById('btn-drones');
      if (btn) btn.classList.toggle('unlocked', Progression.isUnlocked(T.DRONEPORT));
      if (isOpen()) renderPanel();
    },
    renderPanel,
    isOpen,
    number,
    label,
  };
})();


/* ═══════════════════════════════════════════════════════════════════
   DRONE INSPECTOR
   Click a drone in the air and a small card follows it, saying what it
   is doing: the job (same wording as the fleet roster's job lines), which
   leg of it, what it is carrying, its battery and where it is heading.
   It stays with the drone through the landing and closes on ✕, Esc, a
   click on the map, or when the drone's port is gone.
   ═══════════════════════════════════════════════════════════════════ */
const DroneInspector = (() => {
  let sel = null;          // { port, d }
  let el = null, raf = 0, lastHtml = '';

  function build() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'drone-inspector';
    el.style.cssText = 'position:fixed;z-index:121;width:230px;display:none;flex-direction:column;pointer-events:all;' +
      'background:var(--glass, rgba(12,18,26,0.92));border:1px solid #4a3a70;border-radius:var(--r-lg, 8px);overflow:hidden;' +
      'box-shadow:var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.5)), 0 0 24px rgba(180,120,255,0.10);backdrop-filter:blur(12px);';
    el.innerHTML =
      '<div class="wp-header" style="background:rgba(70,40,110,0.35);border-bottom:1px solid #4a3a70;">' +
        '<span class="wp-title" id="di-title" style="color:#c8a0ff">DRONE</span>' +
        '<span class="wp-status" id="di-status" style="background:rgba(70,40,110,0.45);color:#c8a0ff">—</span>' +
        '<button class="wp-close" id="di-close" style="color:#c8a0ff">✕</button>' +
      '</div>' +
      '<div id="di-body" style="padding:10px 12px;display:flex;flex-direction:column;gap:6px;"></div>';
    document.body.appendChild(el);
    el.querySelector('#di-close').addEventListener('click', (e) => { e.stopPropagation(); close(); SFX.click?.(); });
    el.addEventListener('mousedown', e => e.stopPropagation());
    return el;
  }

  const nameOf = (e) => (e && (EntityDefs[e.type] || {}).label) || 'Building';
  const esc = (v) => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const row = (label, val, cls = '') => `<div class="wp-row"><span class="wp-label">${label}</span><span class="wp-val ${cls}" style="font-size:11px;text-align:right;max-width:150px">${val}</span></div>`;
  const centre = (e) => ({ x: (e.col + (e.width || 1) / 2) * TILE, y: (e.row + (e.height || 1) / 2) * TILE });

  function content() {
    const { port, d } = sel;
    const n = DroneFleetPanel.number(port);
    document.getElementById('di-title').textContent = `${n ? `Port #${n}` : 'Drone Port'} · Drone ${(d.i || 0) + 1}`;
    const j = DroneSystem.jobOf(d);
    const st = d.state;
    // A charge stop tops the pack up over time (rechargeSecs from empty),
    // it is not a swap; and a dark port's pads charge nothing.
    const charges = d.battery < 1 && port.powered;
    const status = d._chargingAt ? 'CHARGING EN ROUTE'
                 : st === 'launch' ? 'LAUNCHING' : st === 'working' ? 'ON STATION'
                 : st === 'home' ? 'RETURNING' : st === 'land' ? 'LANDING'
                 : st === 'idle' ? (charges ? 'CHARGING' : 'PARKED') : 'IN FLIGHT';
    document.getElementById('di-status').textContent = status;

    let html = '';
    if (j) {
      let task;
      if (j.kind === 'repair')    task = `Repairing ${esc(nameOf(j.target))}`;
      else if (j.kind === 'wire') task = `Servicing a line at ${esc(nameOf(j.target))}`;
      else {
        const what = j.kind === 'waste' ? (j.hot ? 'Hot waste' : 'Waste') : j.cargo;
        task = `${esc(what)}: ${esc(nameOf(j.from))} → ${esc(j.to ? nameOf(j.to) : 'facility')}`;
      }
      const twoLeg = j.kind === 'waste' || j.kind === 'cargo';
      const stage = j.charging           ? 'Topping up at a port on the way'
                  : st === 'launch'      ? 'Taking off'
                  : st === 'working'     ? (twoLeg ? (j.loaded ? 'Unloading' : 'Loading') : 'Working on it')
                  : j.loaded             ? 'Delivering'
                  : twoLeg               ? 'Flying to the pickup' : 'Flying out';
      html += row('Task', task, 'good');
      html += row('Now', stage);
      if (j.loaded && j.amount > 0) html += row('Carrying', `${Math.round(j.amount)} units`);
      if (j.target) {
        const c = centre(j.target), tiles = Math.round(Math.hypot(c.x - d.x, c.y - d.y) / TILE);
        html += row('Heading to', `${esc(nameOf(j.target))} · ${tiles} tiles`);
      }
    } else if (st === 'home' || st === 'land') {
      const c = centre(port), tiles = Math.round(Math.hypot(c.x - d.x, c.y - d.y) / TILE);
      html += row('Task', 'Job done, flying back', 'good');
      html += row('Heading to', `Its pad · ${tiles} tiles`);
    } else if (st === 'idle') {
      html += row('Task', charges ? 'Charging on its pad' : d.battery < 1 ? 'On its pad, not charging' : 'Standing by on its pad', 'good');
    } else {
      html += row('Task', 'Between jobs');
    }
    const pct = Math.round((d.battery || 0) * 100);
    html += row('Battery', `${pct}%`, pct < 25 ? 'bad' : pct < 50 ? 'warn' : '');
    // A storm slows the fleet; an unpowered port stops launches, not a drone
    // already out: it finishes this job and comes home, and only then stays down.
    const wx = DroneSystem.slowedBy();
    const after = st === 'idle' ? null : j ? 'lands after this job' : 'stays down once it lands';
    if (wx) html += row('Weather', `${wx.name}: flying at ${Math.round(wx.speed * 100)}% speed`, 'warn');
    if (!port.powered) html += row('Port', after ? `Unpowered: ${after}` : 'Unpowered: cannot launch', 'bad');
    if (html !== lastHtml) { document.getElementById('di-body').innerHTML = html; lastHtml = html; }
  }

  // Keep the card beside the drone on screen, inside the window.
  function place() {
    const { d } = sel;
    const o = Camera.screenToWorld(0, 0), z = Camera.zoom;
    const sx = (d.x - o.x) * z, sy = (d.y - o.y) * z;
    const w = el.offsetWidth || 230, h = el.offsetHeight || 140;
    let x = sx + 28, y = sy - h / 2;
    if (x + w > window.innerWidth - 8) x = sx - w - 28;
    x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
    y = Math.max(8, Math.min(window.innerHeight - h - 8, y));
    el.style.left = `${Math.round(x)}px`; el.style.top = `${Math.round(y)}px`;
  }

  function frame() {
    raf = 0;
    if (!sel) return;
    const { port, d } = sel;
    if (!EntityRegistry.getByType(T.DRONEPORT).has(port) || !(port._drones || []).includes(d)) { close(); return; }
    content(); place();
    raf = requestAnimationFrame(frame);
  }

  function open(port, d) {
    build();
    sel = { port, d }; lastHtml = '';
    el.style.display = 'flex';
    if (!raf) raf = requestAnimationFrame(frame);
    content(); place();
  }
  function close() {
    sel = null;
    if (el) el.style.display = 'none';
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sel) close(); });

  return {
    open, close,
    isOpen: () => !!sel,
    get selected() { return sel ? sel.d : null; },
  };
})();
