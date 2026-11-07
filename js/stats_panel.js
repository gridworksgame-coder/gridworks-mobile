/* ═══════════════════════════════════════════════════════════════════
   STATS PANEL
   Top-level HUD stat readouts and weather banner.
   ═══════════════════════════════════════════════════════════════════ */

// Networks with no wire/pole are single-entity flood-fill components
// (isolated, unwired buildings) — PowerNetwork itself ignores these when
// deciding if a generator's output counts (see _hasWire in power_network.js),
// so the breakdown panels should ignore them too rather than listing a
// "network" for every unconnected building on the map.
function _getWiredNetworkIds() {
  const ids = new Set();
  for (const e of EntityRegistry.getByType(T.WIRE)) if (e.networkId >= 0) ids.add(e.networkId);
  for (const e of EntityRegistry.getByType(T.POLE)) if (e.networkId >= 0) ids.add(e.networkId);
  return ids;
}

// ── Network names ──────────────────────────────────────────────────
// networkId is re-assigned by flood fill every tick, so a name can't be
// keyed by it. Instead the name is stamped onto every wire and pole in the
// network (saved with them — see save.js _netName). A network shows the
// first name found among its conductors, so it survives renumbering,
// extensions (new wire joins an already-named network) and saves. If two
// named networks are joined, one name wins; a split keeps the name on both.
function _getNetworkNames() {
  const names = new Map();
  for (const t of [T.WIRE, T.POLE]) {
    for (const e of EntityRegistry.getByType(t)) {
      if (e._netName && e.networkId >= 0 && !names.has(e.networkId)) names.set(e.networkId, e._netName);
    }
  }
  return names;
}

// The GRID panel's network numbering: every network that generates or draws
// power this tick, in ascending networkId order. "POWER NETWORK n" is the
// n-th entry, so anything that names a network must go through here to agree
// with what the GRID panel shows.
function _gridNetworkOrder(s = PowerNetwork.stats) {
  return [...new Set([...(s.genSources || []), ...(s.conSources || [])].map(n => n.netId))].sort((a, b) => a - b);
}

// One delegated click handler for the GRID panel's break jump-list.
document.addEventListener('click', (ev) => {
  const row = ev.target && ev.target.closest && ev.target.closest('.gp-break-jump');
  if (!row || typeof GridBreakWatch === 'undefined') return;
  const idx = parseInt(row.getAttribute('data-break-idx'), 10);
  if (Number.isFinite(idx)) GridBreakWatch.jumpTo(idx);
}, true);

// Display name for a network exactly as the GRID panel shows it: the player's
// custom name, else "POWER NETWORK n". A network with no generation and no
// load isn't listed in GRID and so has no number; it reads as idle instead.
function getNetworkDisplayName(netId) {
  if (netId == null || netId < 0) return null;
  const custom = _getNetworkNames().get(netId);
  if (custom) return custom;
  const pos = _gridNetworkOrder().indexOf(netId);
  return pos >= 0 ? `POWER NETWORK ${pos + 1}` : 'IDLE NETWORK';
}

function _renameNetwork(netId, name) {
  const clean = String(name || '').trim().slice(0, 32);
  for (const t of [T.WIRE, T.POLE]) {
    for (const e of EntityRegistry.getByType(t)) {
      if (e.networkId === netId) { if (clean) e._netName = clean; else delete e._netName; }
    }
  }
}

// Inline rename (same pattern as saved truck paths — no native prompt()).
// While an input is open the breakdowns skip their per-tick re-render, which
// would otherwise wipe the field mid-typing.
let _netRenameActive = false;
function _beginNetworkRename(pencilEl) {
  if (_netRenameActive || !pencilEl) return;
  const labelEl = pencilEl.closest('.gp-net-title');   // name + pencil are swapped out together
  if (!labelEl) return;
  labelEl.dataset.netId = pencilEl.dataset.netId;
  labelEl.dataset.netName = pencilEl.dataset.netName;
  labelEl.dataset.defaultName = pencilEl.dataset.defaultName;
  const netId = +labelEl.dataset.netId;
  _netRenameActive = true;
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 32;
  input.value = labelEl.dataset.netName || '';
  input.placeholder = labelEl.dataset.defaultName;
  // Edits in place: same type as the header it replaces, no box or chrome —
  // just an accent underline and caret so it reads as part of the panel.
  input.spellcheck = false;
  input.style.cssText = `width:65%;background:transparent;color:var(--text);border:0;
    border-bottom:1px solid rgba(64,255,204,0.6);border-radius:0;outline:none;box-shadow:none;
    font:inherit;font-size:9px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;
    padding:0 0 1px;margin:0;caret-color:#40ffcc;appearance:none;-webkit-appearance:none;`;
  labelEl.replaceWith(input);
  input.focus(); input.select();
  let done = false;
  const finish = (save) => {
    if (done) return; done = true;
    if (save) _renameNetwork(netId, input.value);
    _netRenameActive = false;
    updateStats();
  };
  input.addEventListener('keydown', (ev) => {
    ev.stopPropagation();   // keep hotkeys (build tools, Esc menu) out of the text field
    if (ev.key === 'Enter') finish(true);
    else if (ev.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

// pointerdown, not click: the breakdowns re-render ~10×/s, so the pencil
// under the cursor is usually a different element by mouseup and a 'click'
// never fires. Acting on press makes a single click always register.
// preventDefault stops the press from stealing focus back off the new input.
document.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0) return;
  const el = ev.target.closest && ev.target.closest('.gp-net-rename');
  if (!el) return;
  ev.preventDefault(); ev.stopPropagation();
  _beginNetworkRename(el);
});

// Renders one "POWER NETWORK n" section per entry in byNetwork
// (Map<networkId, { label: {w, count} }>), each with its own bars scaled
// to that network's own total. Networks are listed in ascending networkId
// order, which is stable tick-to-tick but can shift if entities are
// added/removed elsewhere on the map (flood-fill re-numbers every tick).
// peakByNetwork (optional): networkId -> rated peak W, shown beside each
// network's live total as "live / peak".
// order (optional): sorted networkIds shared by both breakdowns, so the
// default "POWER NETWORK n" number means the same network in Generation and
// Consumption even when a network only appears in one of them.
function _renderNetworkBreakdown(byNetwork, barColor, emptyMsg, peakByNetwork = null, order = null) {
  const netIds = [...byNetwork.keys()].sort((a, b) => a - b);
  const netNames = _getNetworkNames();
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  if (!netIds.length) {
    return `<div style="font-size:9px;color:var(--text-dim);padding:4px 0;">${emptyMsg}</div>`;
  }
  return netIds.map((netId, i) => {
    const sources = byNetwork.get(netId);
    const gross = Object.values(sources).reduce((s, v) => s + Math.max(0, v.w), 0) || 1;
    const net   = Object.values(sources).reduce((s, v) => s + v.w, 0);
    const rows = Object.entries(sources)
      .sort((a, b) => b[1].w - a[1].w)
      .map(([label, { w, count }]) => {
        const bar = Math.min(100, Math.round((Math.abs(w) / gross) * 100));
        const col = w < 0 ? '#e05040' : barColor;   // losses (congestion) read as a deduction
        const showCount = count > 1 && w > 0 && label !== 'Storage Discharge';
        return `<div style="padding:2px 0 3px;border-bottom:1px solid rgba(255,255,255,0.04);">
          <div style="display:flex;justify-content:space-between;font-size:9px;letter-spacing:0.5px;color:var(--text);margin-bottom:2px;">
            <span>${label}${showCount ? ` ×${count}` : ''}</span>
            <span style="color:${col};">${w < 0 ? '−' : ''}${formatPower(Math.abs(w), 1)}</span>
          </div>
          <div style="height:3px;background:rgba(255,255,255,0.08);border-radius:2px;">
            <div style="width:${bar}%;height:100%;background:${col};border-radius:2px;opacity:0.6;"></div>
          </div>
        </div>`;
      }).join('');
    const _pos = order ? order.indexOf(netId) : -1;
    return `<div style="margin:${i > 0 ? 8 : 0}px 0 0;">
      ${_netTitleHtml(netId, _pos >= 0 ? _pos + 1 : i + 1, netNames,
        `${formatPower(net, 1)}${peakByNetwork ? `<span style="color:var(--text-dim);font-weight:400;" title="Peak potential; rated maximum of this network's generators"> / ${formatPower((peakByNetwork.get(netId) || 0), 0)} peak</span>` : ''}`)}
      ${rows}
    </div>`;
  }).join('');
}

// ── Consumption breakdown: same per-network/per-category rollup as
// _renderNetworkBreakdown, but each category is a collapsible header that
// expands into every individual building billed into it, so "Residential
// ×47" stops being a dead end — click it to see which 47.
const _expandedCatKeys = new Set();   // "netId:category" currently expanded, survives re-renders
const _buildingLabel = (e) => {
  let label = e.businessName || e.familyName || (e.def && e.def.label) || e.type;
  if (e._num !== undefined && typeof NUMBERED_ENTITY_TYPES !== 'undefined' && NUMBERED_ENTITY_TYPES.has(e.type)) label += ` #${e._num}`;
  return label;
};
function _renderConsumptionBreakdown(byNetwork, order) {
  const netIds = [...byNetwork.keys()].sort((a, b) => a - b);
  const netNames = _getNetworkNames();
  const _esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  if (!netIds.length) {
    return `<div style="font-size:9px;color:var(--text-dim);padding:4px 0;">No consumers online</div>`;
  }
  return netIds.map((netId, i) => {
    const sources = byNetwork.get(netId);
    const gross = Object.values(sources).reduce((s, v) => s + Math.max(0, v.w), 0) || 1;
    const net   = Object.values(sources).reduce((s, v) => s + v.w, 0);
    const rows = Object.entries(sources)
      .sort((a, b) => b[1].w - a[1].w)
      .map(([label, { w, count, entities }]) => {
        const bar = Math.min(100, Math.round((Math.abs(w) / gross) * 100));
        const col = w < 0 ? '#e05040' : '#ff9070';
        const showCount = count > 1 && w > 0 && label !== 'Storage Discharge';
        const catKey = `${netId}:${label}`;
        const canDrill = entities && entities.length > 1;
        const open = canDrill && _expandedCatKeys.has(catKey);
        const buildingRows = open
          ? [...entities].sort((a, b) => (b._liveDemand || 0) - (a._liveDemand || 0)).map(e =>
              `<div style="display:flex;justify-content:space-between;font-size:8.5px;padding:1.5px 0;color:var(--text-dim);">
                <span>${_esc(_buildingLabel(e))}${e.powered === false ? ' (unpowered)' : ''}</span>
                <span>${formatPower((e._liveDemand || 0), 1)}</span>
              </div>`).join('')
          : '';
        return `<div style="padding:2px 0 3px;border-bottom:1px solid rgba(255,255,255,0.04);${canDrill ? 'cursor:pointer;' : ''}"
                     ${canDrill ? `data-cat-toggle="${_esc(catKey)}"` : ''}>
          <div style="display:flex;justify-content:space-between;font-size:9px;letter-spacing:0.5px;color:var(--text);margin-bottom:2px;${open ? 'position:sticky;top:0;background:rgb(8,12,20);' : ''}">
            <span>${canDrill ? (open ? '▾ ' : '▸ ') : ''}${label}${showCount ? ` ×${count}` : ''}</span>
            <span style="color:${col};">${w < 0 ? '−' : ''}${formatPower(Math.abs(w), 1)}</span>
          </div>
          <div style="height:3px;background:rgba(255,255,255,0.08);border-radius:2px;">
            <div style="width:${bar}%;height:100%;background:${col};border-radius:2px;opacity:0.6;"></div>
          </div>
          ${open ? `<div style="margin-top:3px;">${buildingRows}</div>` : ''}
        </div>`;
      }).join('');
    const _pos = order ? order.indexOf(netId) : -1;
    return `<div style="margin:${i > 0 ? 8 : 0}px 0 0;">
      ${_netTitleHtml(netId, _pos >= 0 ? _pos + 1 : i + 1, netNames, `${formatPower(net, 1)}`)}
      ${rows}
    </div>`;
  }).join('');
}
// Gate for rebuilding a scrollable HUD list's innerHTML. Every list here
// (net summary, generation breakdown, consumption breakdown) used to
// rebuild unconditionally on every updateStats() call — which runs every
// animation frame, 60×/sec, independent of game pause. That silently ate
// every scroll gesture over any of them: a wheel/trackpad scroll updates
// scrollTop asynchronously, and our own rebuild ran first most frames,
// read the still-stale scrollTop, tore the list down, and reapplied that
// stale value right back — so scrolling looked completely dead no matter
// how hard you scrolled. Throttling the rebuild to a few times a second
// (and skipping it outright while the pointer is over the list) gives the
// browser's own scroll handling long enough windows to actually land.
// `force` (a toggle click, a rename finishing) always rebuilds immediately
// regardless of the throttle/hover gate.
const _listRebuildState = new Map();   // element -> { last, hovering }
function _canRebuildList(el, force, throttleMs = 400) {
  if (!el) return false;
  let st = _listRebuildState.get(el);
  if (!st) {
    st = { last: 0, hovering: false };
    el.addEventListener('mouseenter', () => { st.hovering = true; });
    el.addEventListener('mouseleave', () => { st.hovering = false; });
    _listRebuildState.set(el, st);
  }
  const now = performance.now();
  if (!force) {
    if (st.hovering) return false;
    if (now - st.last < throttleMs) return false;
  }
  st.last = now;
  return true;
}
// The GRID panel shares its height by what each list holds (fitGridPanel), so
// a list that has just grown or shrunk asks for a new share.
function _refitIfResized(el) {
  const h = el.scrollHeight;
  if (h === el._fitH) return;
  el._fitH = h;
  if (typeof fitGridPanel === 'function') fitGridPanel();
}

// Rebuilds just the consumption breakdown from PowerNetwork's already-computed
// per-tick stats — split out of updateStats() so a category toggle click can
// call this directly instead of the full updateStats() pass (population
// count, weather banner, every other HUD stat, both other breakdown lists…).
// That full pass is what made toggling feel sluggish: the click's own
// re-render was queued behind a chunk of unrelated work it never needed.
function _refreshConsumptionBreakdown(force) {
  const _conBreakdown = document.getElementById('gp-con-breakdown');
  if (!_conBreakdown) return;
  const monitorActive = hasActiveMonitor();
  if (!monitorActive || !document.getElementById('grid-panel').classList.contains('open')) return;
  if (_netRenameActive) return;
  if (!_canRebuildList(_conBreakdown, force)) return;
  const s = PowerNetwork.stats;
  const _netOrder = _gridNetworkOrder(s);
  const GOV_TYPES   = new Set([T.GOVBUILDING, T.TOWNHALL, T.CIVICCENTER, T.COURTHOUSE, T.EMS, T.HOSPITAL, T.UNIVERSITY, T.TRANSPORTHUB, T.NATIONALGOV, T.FUSIONLAB, T.AIRPORT, T.MILITARYBASE, T.LAUNCHCOMPLEX, T.NATIONALGRID, T.COMPANYHQ]);
  const INFRA_TYPES = new Set([T.LAMP, T.CAMERA, T.EVCHARGER, T.CELLTOWER, T.FIBERHUB, T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5, T.RESEARCH, T.RESEARCH2, T.RESEARCH3,
                               T.MONITOR, T.MONITOR2, T.ENGOFFICE, T.BEACON, T.SURVEY, T.SURVEY2, T.BATTERY, T.POLE, T.POWERTOWER, T.PROTECTOR, T.PROTECTOR2, T.PROTECTOR3, T.PIPE, T.UNDERGNDPIPE, T.WATER]);
  // Read from what PowerNetwork actually added to each wired network's
  // demand this tick (stats.conSources), like generation above. The old
  // re-derivation estimated draw from the demand curve alone (no noise,
  // population, weather or shedding) and silently dropped every mine,
  // plant and refinery, so a network's rows never added up to CONSUMED.
  const _catFor = (type) => (type === T.HOUSE || type === T.CABIN) ? 'Residential'
                          : type === T.COMMERCIAL                  ? 'Commercial'
                          : type === T.INDUSTRIAL                  ? 'Industrial'
                          : GOV_TYPES.has(type)                    ? 'Government Buildings'
                          : INFRA_TYPES.has(type)                  ? 'Infrastructure & Devices'
                          :                                          'Production & Processing';
  const _byNetwork = new Map();  // networkId -> { category -> {w,count,entities:[e,...]} }
  for (const _net of (s.conSources || [])) {
    const _rows = {};
    for (const [_type, _src] of _net.sources) {
      const _k = _catFor(_type);
      _rows[_k] = _rows[_k] || { w: 0, count: 0, entities: [] };
      _rows[_k].w += _src.w; _rows[_k].count += _src.count;
    }
    // Per-building detail for the drill-down — same category grouping,
    // read straight off the live entities PowerNetwork billed this tick
    // (e._liveDemand), so a category's expanded rows always add up to
    // its own collapsed total.
    for (const _e of (_net.entities || [])) {
      const _k = _catFor(_e.type);
      if (_rows[_k]) _rows[_k].entities.push(_e);
    }
    _byNetwork.set(_net.netId, _rows);
  }
  const _st = _conBreakdown.scrollTop;
  _conBreakdown.innerHTML = _renderConsumptionBreakdown(_byNetwork, _netOrder);
  _conBreakdown.scrollTop = _st;
  _refitIfResized(_conBreakdown);
}
// Delegated so it survives the innerHTML rebuild every update (bound once —
// the container element itself is never replaced, only its contents).
// mousedown, not click: same reasoning as the entity panel's buttons — this
// list rebuilds on every stats tick, so the element under the cursor at
// mousedown may already be a different (freshly rebuilt) node by mouseup,
// and a 'click' listener on it never fires. mousedown always lands on
// whatever's there right now.
(function() {
  const el = document.getElementById('gp-con-breakdown');
  if (!el) return;
  el.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0) return;
    const t = ev.target.closest('[data-cat-toggle]');
    if (!t) return;
    ev.preventDefault();
    const key = t.dataset.catToggle;
    if (_expandedCatKeys.has(key)) _expandedCatKeys.delete(key); else _expandedCatKeys.add(key);
    _refreshConsumptionBreakdown(true);
  });
})();

// Network section header shared by every per-network list in the GRID panel:
// the (renamable) name on the left, rightHtml floated right.
function _netTitleHtml(netId, number, netNames, rightHtml) {
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const defaultName = `POWER NETWORK ${number}`;
  const name = netNames.get(netId);
  return `<div style="font-size:9px;font-weight:600;letter-spacing:0.8px;color:var(--text-dim);text-transform:uppercase;padding:2px 0 4px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:3px;"><span class="gp-net-title"><span style="${name ? 'color:var(--text);' : ''}">${esc(name || defaultName)}</span><span class="gp-net-rename" data-net-id="${netId}" data-net-name="${esc(name || '')}" data-default-name="${defaultName}" title="Rename network">✎</span>${typeof GridAnalyzer !== 'undefined' && !GridAnalyzer.locked() ? `<span class="gp-net-detail" data-open-gridnet="${netId}" title="Full breakdown of this network">⌕</span>` : ''}</span><span style="float:right;">${rightHtml}</span></div>`;
}

// The OVERALL stats (generated, peak, consumed, surplus, consumers,
// satisfaction) split out per power network. Generation and consumption come
// from what PowerNetwork summed for each network this tick, so each network's
// numbers are the ones that make up the overall totals.
function _renderNetworkSummary(s, order, showSatisfaction) {
  if (!order.length) return `<div style="font-size:9px;color:var(--text-dim);padding:4px 0;">No power networks yet</div>`;
  const netNames = _getNetworkNames();
  const gen  = new Map((s.genSources || []).map(n => [n.netId, n.supply]));
  const con  = new Map((s.conSources || []).map(n => [n.netId, n.demand]));
  const peak = _peakPotentialByNetwork();
  const inOrder = new Set(order);
  const cust = new Map();   // netId -> { total, powered, satSum }
  let unconnected = 0;
  for (const t of [T.HOUSE, T.COMMERCIAL]) {
    for (const e of EntityRegistry.getByType(t)) {
      if (!inOrder.has(e.networkId)) { unconnected++; continue; }
      const c = cust.get(e.networkId) || { total: 0, powered: 0, satSum: 0 };
      c.total++; if (e.powered) c.powered++; c.satSum += e.satisfaction ?? 0;
      cust.set(e.networkId, c);
    }
  }
  const row = (label, value, color = 'var(--text)') =>
    `<div style="display:flex;justify-content:space-between;font-size:9px;letter-spacing:0.5px;padding:1.5px 0;">
       <span style="color:var(--text-dim);">${label}</span><span style="color:${color};">${value}</span></div>`;
  const html = order.map((netId, i) => {
    const g = gen.get(netId) || 0, c = con.get(netId) || 0, pk = peak.get(netId) || 0;
    const sur = g - c;
    const surCol = sur > 0 ? '#40c060' : sur < 0 ? '#e04030' : 'var(--text-dim)';
    const cu = cust.get(netId) || { total: 0, powered: 0, satSum: 0 };
    const cuCol = cu.total === 0 ? 'var(--text)' : cu.powered === cu.total ? '#50e890' : cu.powered === 0 ? '#ff5555' : 'var(--text)';
    return `<div style="margin:${i > 0 ? 8 : 0}px 0 0;">
      ${_netTitleHtml(netId, i + 1, netNames, `<span style="color:${surCol};">${sur >= 0 ? '+' : ''}${formatPower(sur, 1)}</span>`)}
      ${row('Generated', `${formatPower(g, 1)}`, '#f0c040')}
      ${row('Peak Potential', pk > 0 ? `${formatPower(pk, 0)} · ${Math.round(g / pk * 100)}%` : '0 kW')}
      ${row('Consumed', `${formatPower(c, 1)}`)}
      ${row('Surplus', `${sur >= 0 ? '+' : ''}${formatPower(sur, 1)}`, surCol)}
      ${row('Consumers', `${cu.powered} / ${cu.total}`, cuCol)}
      ${showSatisfaction ? row('Avg Satisfaction', cu.total ? `${Math.round(cu.satSum / cu.total)}%` : '—') : ''}
    </div>`;
  }).join('');
  const footer = unconnected
    ? `<div style="font-size:9px;color:var(--text-dim);padding:6px 0 0;">${unconnected} consumer${unconnected === 1 ? '' : 's'} not on any network</div>`
    : '';
  return html + footer;
}

// Rated maximum a generator can put out under ideal conditions. Every
// generator's e.def.powerOutput is overwritten each tick with its LIVE
// output (sunlight, wind speed, fuel, throttle), so the rating has to come
// from the shared EntityDefs entry instead.
const _PEAK_GEN_TYPES = [T.BIOFUELGEN, T.SOLAR, T.SOLAR2, T.SOLAR3, T.WIND, T.WIND2, T.WIND3, T.COALGENERATOR,
  T.HYDROGENERATOR, T.FUELGEN, T.GEOTURBINE, T.STEAMTURBINE, T.STEAMTURBINE2, T.MHDRING];
function _ratedPeakOutput(type) {
  const d = EntityDefs[type];
  if (!d) return 0;
  if (type === T.GEOTURBINE && typeof GeothermalSystem !== 'undefined' && GeothermalSystem.getOutputPerTurbine) {
    return GeothermalSystem.getOutputPerTurbine() || d.powerOutput || 0;
  }
  return d.peakOutput || d.maxOutput || d.powerOutput || 0;
}

// Sum of rated peaks across generators that are actually wired into a
// network (same gate PowerNetwork uses before counting their output) and
// not knocked out by lightning.
function _peakPotentialByNetwork() {
  const wired = _getWiredNetworkIds();
  const byNet = new Map();   // networkId -> rated W
  for (const type of _PEAK_GEN_TYPES) {
    const rated = _ratedPeakOutput(type);
    if (!rated) continue;
    for (const g of EntityRegistry.getByType(type)) {
      if (g._lightningDamaged || !wired.has(g.networkId)) continue;
      byNet.set(g.networkId, (byNet.get(g.networkId) || 0) + rated);
    }
  }
  return byNet;
}
function _peakPotential() {
  let total = 0;
  for (const w of _peakPotentialByNetwork().values()) total += w;
  return total;
}

function updateStats() {
  const s = PowerNetwork.stats;
  document.getElementById('stat-gen').textContent      = `${formatPower(s.totalGenerated, 1)}`;
  { const _pk = document.getElementById('stat-peak');
    // Only while the GRID panel is open — the wired-network scan walks every wire.
    if (_pk && document.getElementById('grid-panel')?.classList.contains('open')) {
      const _peak = _peakPotential();
      const _pct  = _peak > 0 ? Math.round(s.totalGenerated / _peak * 100) : 0;
      _pk.textContent = _peak > 0 ? `${formatPower(_peak, 0)} · ${_pct}%` : '0 kW';
    } }
  // Weather banner — disabled per player request (the pop-up card for every
  // weather event, e.g. "RAINFALL — Solar -30% · Residential +7% · Wind
  // +11%", was unwanted clutter). The weather status itself is still shown
  // in the HUD's WEATHER dropdown; this just drops the transient toast-like
  // banner that used to appear for 8s whenever an event started.
  const _wb = document.getElementById('weather-event-banner');
  if (_wb) _wb.style.display = 'none';
  { const _sur = s.totalGenerated - s.totalConsumed;
    const _sel = document.getElementById('stat-surplus');
    if (_sel) { _sel.textContent = `${_sur >= 0 ? '+' : ''}${formatPower(_sur, 1)}`; _sel.style.color = _sur > 0 ? '#40c060' : _sur < 0 ? '#e04030' : 'var(--text-dim)'; } }
  // Storage: what Substations and Battery Blocks are adding to (or taking
  // from) the grid. Generated above already includes their output, so
  // without these rows a grid quietly running down its reserves looked
  // exactly like one that was generating enough.
  { const st = s.storage, wrap = document.getElementById('gp-storage-wrap');
    if (wrap) {
      // The storage readout is the Monitoring Station MK2's. Without one, a
      // grid that has storage gets a line saying where the figures went.
      const has = !!st && st.units > 0;
      const show = has && (typeof hasActiveMonitor2 !== 'function' || hasActiveMonitor2());
      wrap.style.display = show ? '' : 'none';
      { const lock = document.getElementById('gp-storage-lock'); if (lock) lock.style.display = has && !show ? '' : 'none'; }
      { const ga = document.getElementById('gp-analyzer-label');
        if (ga && typeof GridAnalyzer !== 'undefined') { const lk = GridAnalyzer.locked(); ga.textContent = lk ? '🔒 Network Breakdown · needs Monitoring Station MK2' : '⚡ Network Breakdown'; ga.style.color = lk ? 'var(--text-dim)' : '#ffd070'; } }
      if (show) {
        const $ = id => document.getElementById(id);
        const out = st.out > 0.05, inn = st.in > 0.05;
        $('stat-storage-units').textContent = `${st.units} unit${st.units === 1 ? '' : 's'} · up to ${formatPower(st.maxOut, 0)}`;
        const share = out && s.totalGenerated > 0 ? Math.round(st.out / s.totalGenerated * 100) : 0;
        $('stat-storage-out').textContent = out ? `+${formatPower(st.out, 1)} · ${share}% of supply` : 'Standby';
        $('stat-storage-out').style.color = out ? '#f0c040' : 'var(--text-dim)';
        $('stat-storage-in').textContent = inn ? `${formatPower(st.in, 1)}` : '—';
        $('stat-storage-in').style.color = inn ? '#40c060' : 'var(--text-dim)';
        const pct = st.capKWh > 0 ? Math.round(st.kWh / st.capKWh * 100) : 0;
        $('stat-storage-held').textContent = `${Math.round(st.kWh).toLocaleString('en-US')} / ${Math.round(st.capKWh).toLocaleString('en-US')} kWh · ${pct}%`;
        $('stat-storage-held').style.color = pct > 50 ? '#40c060' : pct > 20 ? '' : '#e04030';
        const leftRow = $('stat-storage-left-row');
        leftRow.style.display = out && st.secondsLeft !== null ? '' : 'none';
        if (out && st.secondsLeft !== null) {
          const sec = Math.max(0, Math.round(st.secondsLeft)), m = Math.floor(sec / 60);
          $('stat-storage-left').textContent = m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : m > 0 ? `${m}m ${sec % 60}s` : `${sec}s`;
          $('stat-storage-left').style.color = sec < 60 ? '#e04030' : sec < 300 ? '#f0c040' : '';
        }
      }
    } }

  // Redraw historical graph if panel is open
  const gPanel = document.getElementById('grid-panel');
  if (gPanel && gPanel.classList.contains('open')) {
    const gc = document.getElementById('grid-graph');
    if (gc) PowerHistory.draw(gc);
  }
  // stat-research removed
  // Update population counter
  let _totalPop = 0;
  for (const _pt of [T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL]) {
    for (const _pe of EntityRegistry.getByType(_pt)) {
      if (_pe.fromRequest && (_pe._population || 0) > 0) _totalPop += _pe._population;
    }
  }
  document.getElementById('stat-population').textContent = _totalPop.toLocaleString();

  // Show/hide advanced analytics based on Monitor Station
  const monitorActive = hasActiveMonitor();
  document.querySelectorAll('.gp-advanced').forEach(el => {
    el.classList.toggle('locked', !monitorActive);
  });
  const hint = document.getElementById('gp-monitor-hint');
  if (hint) hint.style.display = monitorActive ? 'none' : 'block';

  // One network numbering shared by the generation and consumption lists
  const _netOrder = _gridNetworkOrder(s);

  // Per-network version of the OVERALL rows (only while expanded)
  const _netSummary = document.getElementById('gp-net-summary');
  if (_netSummary && monitorActive && _netSummary.style.display !== 'none' && !_netRenameActive
      && document.getElementById('grid-panel').classList.contains('open')
      && _canRebuildList(_netSummary, false)) {
    const _st = _netSummary.scrollTop;
    _netSummary.innerHTML = _renderNetworkSummary(s, _netOrder, monitorActive);
    _netSummary.scrollTop = _st;
    _refitIfResized(_netSummary);
  }

  // Update generation breakdown (monitor required)
  const _genBreakdown = document.getElementById('gp-gen-breakdown');
  if (_genBreakdown && monitorActive && document.getElementById('grid-panel').classList.contains('open')
      && !_netRenameActive && _canRebuildList(_genBreakdown, false)) {
    const GEN_LABELS = {
      [T.BIOFUELGEN]: 'Biofuel Gen', [T.SOLAR]: 'Solar MK1', [T.SOLAR2]: 'Solar MK2', [T.SOLAR3]: 'Solar Array',
      [T.WIND]: 'Wind Turbine', [T.WIND2]: 'Wind Turbine MK2', [T.WIND3]: 'Wind Turbine MK3', [T.COALGENERATOR]: 'Coal Generator', [T.HYDROGENERATOR]: 'Hydro Generator',
      [T.FUELGEN]: 'Fuel Power Generator', [T.GEOTURBINE]: 'Geothermal Turbine',
      [T.STEAMTURBINE]: 'Steam Turbine', [T.STEAMTURBINE2]: 'Steam Turbine MK2', [T.MHDRING]: 'MHD Decelerator Ring',
    };
    // Read straight from what PowerNetwork summed this tick (stats.genSources)
    // rather than re-deriving it here. The old re-derivation used its own
    // generator list and skipped networks without a wire or pole, so hydro
    // turbines, battery/substation discharge, rod surges and whole networks
    // could be counted in GENERATED yet missing from this list. Every
    // network that contributes to the total gets its own section.
    const _labelFor = (key) => key === 'storage'    ? 'Storage Discharge'
                             : key === 'congestion' ? 'Wire Congestion Loss'
                             : GEN_LABELS[key] || EntityDefs[key]?.label || key;
    const _byNetwork = new Map();  // networkId -> { label -> {w,count} }
    for (const _net of (s.genSources || [])) {
      const _rows = {};
      for (const [_key, _src] of _net.sources) {
        const _k = _labelFor(_key);
        _rows[_k] = _rows[_k] || { w: 0, count: 0 };
        _rows[_k].w += _src.w; _rows[_k].count += _src.count;
      }
      _byNetwork.set(_net.netId, _rows);
    }
    const _st = _genBreakdown.scrollTop;
    _genBreakdown.innerHTML = _renderNetworkBreakdown(_byNetwork, '#ffe080', 'No generators online', _peakPotentialByNetwork(), _netOrder);
    _genBreakdown.scrollTop = _st;
    _refitIfResized(_genBreakdown);
  }

  // Update consumption breakdown (monitor required) — grouped into broad
  // categories rather than every subtype, so it stays readable like the
  // generation panel above it.
  _refreshConsumptionBreakdown();
  document.getElementById('stat-con').textContent      = `${formatPower(s.totalConsumed, 1)}`;
  // Temperature
  const _tempEl = document.getElementById('stat-temp');
  if (_tempEl) {
    // Shared with the geothermal chain — see WeatherEventSystem.getTemperature.
    const _temp = Math.round(WeatherEventSystem.getTemperature());
    _tempEl.textContent = `${_temp >= 35 ? '🌡 ' : _temp <= 2 ? '❄ ' : ''}${formatTemp(_temp)}`;
    _tempEl.style.color = _temp >= 35 ? '#ff4020' : _temp >= 28 ? '#c06020' : _temp <= 2 ? '#4080ff' : _temp <= 10 ? '#60a0d0' : '';
  }

  document.getElementById('stat-income').textContent   = formatRate(Economy.income);
  const _net = Economy.income - Economy.upkeep;
  const _netEl = document.getElementById('stat-net-hud');
  if (_netEl) {
    _netEl.textContent = `net ${_net >= 0 ? '+' : ''}${formatRate(_net)}`;
    _netEl.style.color = _net >= 0 ? '#40c060' : '#ff6040';
  }
  // Cloud + wind stats
  const cloudEl = document.getElementById('stat-cloud');
  if (cloudEl) {
    const cc = Math.round((1-CloudState.factor)*100);
    cloudEl.textContent = `${cc}%`;
    cloudEl.className = cc > 40 ? 'gp-value bad' : cc > 20 ? 'gp-value' : 'gp-value good';
  }
  const windEl = document.getElementById('stat-wind');
  if (windEl) {
    const ws = WindState.speed;
    windEl.textContent = `${Math.round(ws*100)}%`;
    windEl.className = ws > 0.7 ? 'gp-value good' : ws > 0.35 ? 'gp-value' : 'gp-value bad';
  }

  // Weather status
  const weatherEl = document.getElementById('stat-weather');
  if (weatherEl && typeof WeatherEventSystem !== 'undefined') {
    const ev = WeatherEventSystem.getActiveEvent();
    // On a contract site: the site's own sky (there is no event behind it).
    const siteSky = { rain: '🌦 Rain', snow: '🌨 Snow', blizzard: '🌬 Blizzard', overcast: '☁ Overcast' }[WeatherEventSystem.getVisualOverride()];
    if (siteSky) {
      weatherEl.textContent = siteSky;
      weatherEl.className = 'gp-value';
    } else if (ev) {
      const labels = {
        storm:      '💨 Gale',
        heatwave:   '🌡 Heat Wave',
        coldsnap:   '❄ Cold Snap',
        rainstorm:  '🌧 Rainstorm',
        rainfall:   '🌦 Rainfall',
        smog:       '🌫 Smog Day',
        overcast:   '☁ Overcast',
      };
      // The event's own label first, so every event (snowfall, dust storm…) is named, not just these.
      weatherEl.textContent = WeatherEventSystem.labelOf(ev) || labels[ev.type] || ev.type;
      weatherEl.className = 'gp-value bad';
    } else {
      weatherEl.textContent = 'Clear';
      weatherEl.className = 'gp-value good';
    }
  }

  // Grid effects — what the active weather event is currently doing to
  // generation/demand, pulled straight from WeatherEventSystem's own
  // multiplier tables so this can never drift out of sync with the sim.
  const effEl = document.getElementById('weather-effects-body');
  const effDiv = document.getElementById('weather-effects-divider');
  if (effEl && effDiv && typeof WeatherEventSystem !== 'undefined') {
    const ev = WeatherEventSystem.getActiveEvent();
    const def = ev ? WeatherEventSystem.WEATHER_EVENTS.find(w => w.type === ev.type) : null;
    if (def) {
      const rows = [];
      const pct = m => `${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`;
      if (def.demandMult && def.demandMult !== 1) rows.push(['Residential Demand', pct(def.demandMult), def.demandMult > 1]);
      if (def.comMult && def.comMult !== 1)       rows.push(['Commercial Demand', pct(def.comMult), def.comMult > 1]);
      if (def.indMult && def.indMult !== 1)       rows.push(['Industrial Demand', pct(def.indMult), def.indMult > 1]);
      if (def.solarMult !== undefined && def.solarMult !== 1) rows.push(['Solar Output', pct(def.solarMult), def.solarMult < 1]);
      if (def.windMult && def.windMult !== 1)     rows.push(['Wind Output', pct(def.windMult), def.windMult < 1]);
      for (const r of (def.extraRows || []))       rows.push(r);
      if (def.type === 'icing' && typeof TurbineIcing !== 'undefined') {
        const s = TurbineIcing.summary();
        if (s.turbines) rows.push(['Turbine Ice', `${Math.round(s.avgIce * 100)}% avg · ${s.stopped}/${s.turbines} stopped`, s.stopped > 0]);
      }
      const stats2 = PowerNetwork.stats;
      const loadRatio = stats2.totalConsumed / Math.max(1, stats2.totalGenerated);
      if (loadRatio > 0.95) rows.push(['Grid Stress', 'Wires may fail', true]);
      effEl.innerHTML = `<div class="gp-row"><span class="gp-label" style="color:#ff9070;">⚠ Active Grid Effects</span></div>` +
        rows.map(([label, val, bad]) => `<div class="gp-row"><span class="gp-label">${label}</span><span class="gp-value ${bad ? 'bad' : 'good'}">${val}</span></div>`).join('');
      effEl.style.display = 'flex';
      effDiv.style.display = 'block';
    } else {
      effEl.style.display = 'none';
      effDiv.style.display = 'none';
      effEl.innerHTML = '';
    }
  }

  // Satisfaction stat
  const satEl = document.getElementById('stat-satisfaction');
  if (satEl) {
    const avgSat = SatisfactionSystem.averageSatisfaction();
    satEl.textContent = PowerNetwork.stats.totalConsumers > 0 ? `${Math.round(avgSat)}%` : '—';
    satEl.className = avgSat > 80 ? 'gp-value good' : avgSat > 60 ? 'gp-value' : 'gp-value bad';
  }

  // Debt warning on balance display
  const balEl = document.getElementById('stat-balance');
  // Set as !important: the dashboard theme pins `.value.gold` to gold with
  // !important, which beat a plain inline colour and left debt showing gold.
  if (Economy.balance < 0) {
    const pulse = Math.sin(Date.now() / 300) > 0;
    balEl.style.setProperty('color', pulse ? '#ff4444' : '#882222', 'important');
  } else {
    balEl.style.removeProperty('color');
  }
  document.getElementById('stat-balance').textContent  = formatMoney(Economy.balance);
  // Live update income breakdown if open — throttled, preserves collapse state
  const _ibd = document.getElementById('income-breakdown');
  if (_ibd && _ibd.classList.contains('visible') && typeof _ibdUpdateValues === 'function') {
    const _now = Date.now();
    if (_now - _ibdLastUpdateAt > 600) {
      _ibdLastUpdateAt = _now;
      _ibdUpdateValues();
    }
  }

  // Consumers coloring (in grid panel)
  const ct = s.totalConsumers, cp = s.poweredCount;
  const poweredEl = document.getElementById('stat-powered');
  poweredEl.textContent = `${cp} / ${ct}`;
  poweredEl.className   = ct === 0 ? 'gp-value' : cp === ct ? 'gp-value good' : cp === 0 ? 'gp-value bad' : 'gp-value';

  // Open-circuit jump list (struck towers, storm-failed wires/poles).
  // Shown whenever anything is broken so the player can pan without
  // scrolling the whole map — see GridBreakWatch in power_network.js.
  const _breaksWrap = document.getElementById('gp-breaks-wrap');
  const _breaksList = document.getElementById('gp-breaks-list');
  const _breaksCount = document.getElementById('gp-breaks-count');
  if (_breaksWrap && typeof GridBreakWatch !== 'undefined') {
    const breaks = GridBreakWatch.list();
    if (breaks.length === 0) {
      _breaksWrap.style.display = 'none';
      if (_breaksList) _breaksList.innerHTML = '';
    } else {
      _breaksWrap.style.display = '';
      if (_breaksCount) _breaksCount.textContent = String(breaks.length);
      if (_breaksList) {
        const esc = (v) => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        // Signature so we don't rebuild (and thrash layout) every HUD tick
        // when nothing changed.
        const sig = breaks.map(b => `${b.kind}:${b.e.col},${b.e.row}`).join('|');
        if (_breaksList.dataset.sig !== sig) {
          _breaksList.dataset.sig = sig;
          _breaksList.innerHTML = breaks.map((b, i) => {
            const icon = b.kind === 'tower' ? '🗼' : b.kind === 'pole' ? '⌁' : '⚡';
            return `<div class="gp-row gp-break-jump" data-break-idx="${i}" style="cursor:pointer;padding:3px 0;" title="Click to pan camera">
            <span class="gp-label" style="color:#ffb090;font-size:9px;">${icon} ${esc(b.label)}</span>
            <span class="gp-value" style="color:#80c8ff;font-size:9px;">Jump ›</span>
          </div>`;
          }).join('');
        }
      }
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════
   CLOCK UI
   Draws an analog clock face on the small canvas in the HUD.
   The hand sweeps 360° over one full day cycle.
   Colour transitions from warm (day) to cool (night).
   ═══════════════════════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════════════════════
   NETWORK TAG
   A one-line "⚡ <network name>" strip under the header of every entity
   inspector, so clicking any building on a power network shows which
   network it belongs to, named exactly as the GRID panel names it
   (getNetworkDisplayName). One ticker serves every panel instead of each
   panel's own renderer, because the building inspectors are a dozen
   separate panels with separate markup. Wires and poles are left out —
   their own inspector is the network readout.
   ═══════════════════════════════════════════════════════════════════ */
const NetworkTag = (() => {
  // Panel element id -> the open panel's current entity (null when closed).
  const PANELS = [
    ['entity-panel',   () => (typeof EntityInfoPanel     !== 'undefined' && EntityInfoPanel.isOpen?.())      ? EntityInfoPanel.target     : null],
    ['refinery-panel', () => (typeof RefineryPanel       !== 'undefined' && RefineryPanel.isOpen?.())        ? RefineryPanel.target       : null],
    ['fuelgen-panel',  () => (typeof FuelGenPanel        !== 'undefined' && FuelGenPanel.isOpen?.())         ? FuelGenPanel.target        : null],
    ['coalgen-panel',  () => (typeof CoalGenPanel        !== 'undefined' && CoalGenPanel.isOpen?.())         ? CoalGenPanel.target        : null],
    ['turbine-panel',  () => (typeof TurbinePanel        !== 'undefined' && TurbinePanel.isOpen?.())         ? TurbinePanel.target        : null],
    ['shaftgen-panel', () => (typeof ShaftGenPanel       !== 'undefined' && ShaftGenPanel.isOpen?.())        ? ShaftGenPanel.target       : null],
    ['shaft-panel',    () => (typeof ShaftPanel          !== 'undefined' && ShaftPanel.isOpen?.())           ? ShaftPanel.target          : null],
    ['waste-panel',    () => (typeof WastePanel          !== 'undefined' && WastePanel.isOpen?.())           ? WastePanel.target          : null],
    ['dam-panel',      () => (typeof DamPanel            !== 'undefined' && DamPanel.isOpen?.())             ? DamPanel.target            : null],
    ['solar-panel',    () => (typeof SolarPanelInspector !== 'undefined' && SolarPanelInspector.isOpen?.())  ? SolarPanelInspector.target : null],
    ['research-panel', () => (typeof InspectionPanel     !== 'undefined' && InspectionPanel.isOpen?.())      ? InspectionPanel.target     : null],
  ];

  function _tagFor(panelEl) {
    let tag = panelEl.querySelector(':scope > .net-tag');
    if (!tag) {
      const header = panelEl.firstElementChild;
      tag = document.createElement('div');
      tag.className = 'net-tag';
      tag.style.cssText = 'display:none;padding:4px 12px;font-size:9px;font-weight:600;letter-spacing:0.8px;' +
        'text-transform:uppercase;color:#80c8ff;border-bottom:1px solid rgba(128,200,255,0.12);' +
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      if (header) header.after(tag); else panelEl.prepend(tag);
    }
    return tag;
  }

  function update() {
    let wired = null;   // built lazily — most ticks have no panel open
    for (const [id, getTarget] of PANELS) {
      const panelEl = document.getElementById(id);
      if (!panelEl) continue;
      let e = null;
      try { e = getTarget(); } catch (_e) { e = null; }
      const existing = panelEl.querySelector(':scope > .net-tag');
      if (!e || e.type === T.WIRE || e.type === T.POLE) {
        if (existing) existing.style.display = 'none';
        continue;
      }
      if (!wired) wired = _getWiredNetworkIds();
      // Only a real, wired network counts — an unconnected building is its
      // own one-entity flood-fill component, which isn't a network at all.
      const onNet = e.networkId != null && e.networkId >= 0 && wired.has(e.networkId);
      const tag = existing || (onNet ? _tagFor(panelEl) : null);
      if (!tag) continue;
      if (!onNet) { tag.style.display = 'none'; continue; }
      const name = getNetworkDisplayName(e.networkId);
      tag.textContent = `⚡ ${name}`;
      tag.title = `On ${name}`;
      tag.style.display = 'block';
    }
  }

  setInterval(update, 250);
  // Clicking a building opens its panel synchronously; tag it on the same
  // click rather than up to a quarter-second later.
  document.addEventListener('click', () => setTimeout(update, 0), true);

  return { update };
})();
