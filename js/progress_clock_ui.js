/* ═══════════════════════════════════════════════════════════════════
   PROGRESS & CLOCK UI
   Progress tracker panel and the day/time clock readout.
   ═══════════════════════════════════════════════════════════════════ */

function updateProgressTracker() {
  const panel = document.getElementById('progress-tracker');
  // Closed (e.g. by the 9 key with the pointer still over it): drop its tooltip.
  if (!panel || !panel.classList.contains('visible')) { _ptHideHint(); return; }
  const body = document.getElementById('pt-body');
  if (!body) return;

  const s    = HouseRequestSystem.getTrackerStatus();
  const totalWs = Progression.totalWs;
  const rp   = Math.floor(Progression.totalResearch);
  const rows = [];

  const val  = (text, cls='') => `<span class="pt-val${cls?' '+cls:''}">${text}</span>`;
  const lbl  = (text) => `<span class="pt-label">${text}</span>`;
  const row  = (l, v) => `<div class="pt-row">${lbl(l)}${v}</div>`;
  const bar  = (pct, col) => `<div class="pt-bar-wrap"><div class="pt-bar-fill" style="width:${(Math.min(1,pct)*100).toFixed(1)}%;background:${col}"></div></div>`;
  const div  = () => '<div class="pt-divider"></div>';
  const esc  = (t) => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  // ── Next request ──────────────────────────────────────────────
  if (!s.cabinCleared && !s.cabinSent) {
    rows.push(row('Next', val("Mae's Cabin", 'warn')));
    const pct = Math.min(1, totalWs / 400);
    rows.push(bar(pct, '#f0c040'));
    rows.push(row('Progress', val(`${Math.floor(totalWs)} / 400 Ws`, pct >= 1 ? 'good' : '')));
  } else if (!s.cabinCleared) {
    rows.push(row('Next', val('Cabin pending', 'warn')));
    rows.push(row('Status', val('Accept or decline', 'dim')));
  } else if (s.cooldownTimer > 0) {
    const cdPct = 1 - s.cooldownTimer / Math.max(1, s.cooldownTotal);
    rows.push(row('Cooldown', val(`${Math.ceil(s.cooldownTimer)}s`, 'warn')));
    rows.push(bar(cdPct, '#f0c040'));
  } else {
    const queueFull = s.pendingCount >= 3;

    // Substation state — read straight off the request system rather than
    // recomputed here, so the panel can never claim a gate is open (or shut)
    // that the sim disagrees with. `subReady` is the LATCH: once a substation
    // has banked real charge the commercial gate stays open for good, so a
    // full substation sitting on standby must not read as "not charging".
    const subCharge  = s.substation.charge;
    const subPresent = s.substation.present;
    const subReady   = s.subEverReady;

    const typeTag = (cls, label) => `<span class="pt-next-type ${cls}">${label}</span>`;

    // Real-time gap between requests of one type, scaled the same way
    // house_request_system.js does — even once the WH/fill gates are
    // satisfied, a request won't actually fire until this interval since the
    // last one has elapsed. Surfacing the remaining wait avoids "Incoming
    // soon" reading as imminent when it might still be minutes away.
    const _secsUntilNext = (baseInterval, acceptedCount, lastFired) => {
      const scale = Math.min(8, 1 + acceptedCount * 0.5);
      const interval = baseInterval * scale;
      return Math.max(0, interval - (s.gameTime - (lastFired || 0)));
    };
    const _statusOrWait = (secsLeft) => secsLeft > 0
      ? row('Status', val(`Next in ${Math.ceil(secsLeft)}s`, 'warn'))
      : row('Status', val('Incoming soon', 'good'));

    // ── Residential ────────────────────────────────────────────
    rows.push(`<div class="pt-row">${lbl('Residential')}${typeTag('house', 'Next Up')}</div>`);
    {
      const pct = Math.min(1, totalWs / s.nextThreshold);
      if (queueFull) {
        rows.push(row('Status', val('Queue full', 'warn')));
      } else if (pct >= 1) {
        rows.push(_statusOrWait(_secsUntilNext(150, s.housesAccepted, s.lastRequestTime.house)));
      } else {
        rows.push(bar(pct, '#40c8ff'));
        rows.push(row('Progress', val(formatWhPair(totalWs, s.nextThreshold), pct > 0.8 ? 'good' : '')));
      }
    }

    // ── Commercial ─────────────────────────────────────────────
    rows.push(div());
    // Mirrors house_request_system.js's actual gate: a substation on the map,
    // nothing else. It used to test Progression.isUnlocked(SUBSTATION) — the
    // TECH unlock (200 kW generated), which the request system never
    // consults — so the section could sit "Locked" with the old requirement
    // text showing even when commercial requests were ready to fire. The
    // residential prerequisite it also carried is gone from the gate too.
    const comUnlocked = subPresent;
    rows.push(`<div class="pt-row">${lbl('Commercial')}${typeTag('commercial', comUnlocked ? 'Unlocked' : 'Locked')}</div>`);
    if (!comUnlocked) {
      rows.push(row('Requires', val('a Substation', 'dim')));
    } else {
      const comThreshGate = s.commercialThresh;
      const pct = Math.min(1, totalWs / comThreshGate);
      if (queueFull) {
        rows.push(row('Status', val('Queue full', 'warn')));
      } else if (!subPresent) {
        rows.push(row('Status', val('Needs Substation', 'warn')));
      } else if (!subReady) {
        // Never yet banked a reserve — either unwired, or the grid has no
        // surplus left for it (it discharges to cover demand instead).
        rows.push(row('Status', val('Substation has no reserve; needs surplus power', 'warn')));
      } else if (pct >= 1) {
        rows.push(_statusOrWait(_secsUntilNext(240, s.commercialsAccepted, s.lastRequestTime.commercial)));
      } else {
        rows.push(bar(pct, '#f0c040'));
        rows.push(row('Progress', val(formatWhPair(totalWs, comThreshGate), pct > 0.8 ? 'good' : '')));
      }
    }

    // ── Industrial ─────────────────────────────────────────────
    rows.push(div());
    const indUnlocked = s.geoEverRan;
    rows.push(`<div class="pt-row">${lbl('Industrial')}${typeTag('industrial', indUnlocked ? 'Unlocked' : 'Locked')}</div>`);
    if (!indUnlocked) {
      rows.push(row('Requires', val('Geothermal power running', 'dim')));
    } else {
      const pct = Math.min(1, totalWs / s.industrialThresh);
      if (queueFull) {
        rows.push(row('Status', val('Queue full', 'warn')));
      } else if (subCharge < 50) {
        rows.push(row('Status', val('Needs Substation (50 kW+)', 'warn')));
      } else if (pct >= 1) {
        rows.push(_statusOrWait(_secsUntilNext(360, s.industrialsAccepted, s.lastRequestTime.industrial)));
      } else {
        rows.push(bar(pct, '#ff8040'));
        rows.push(row('Progress', val(formatWhPair(totalWs, s.industrialThresh), pct > 0.8 ? 'good' : '')));
      }
    }
  }

  // Pending count
  if (s.pendingCount > 0 || s.backlogCount > 0) {
    rows.push(div());
    rows.push(row('Pending', val(`${s.pendingCount} active${s.backlogCount > 0 ? ` · ${s.backlogCount} queued` : ''}`, s.pendingCount > 0 ? 'warn' : 'dim')));
  }

  // ── Nearest research unlock ───────────────────────────────────
  // Biofuel progress display
  // The two things biofuel collected unlocks, at the thresholds
  // progression.js gates them on: Wire at 50, the Research Station at 125.
  const biofuelTotal = BiofuelSystem.getTotalCollected();
  if (biofuelTotal < 125) {
    rows.push(div());
    rows.push(`<div class="pt-row"><span class="pt-label">Biofuel</span></div>`);
    const bfPct = Math.min(1, biofuelTotal / 125);
    rows.push(row('Collected', val(`${biofuelTotal}/125`, bfPct > 0.4 ? 'warn' : 'dim')));
    rows.push(bar(bfPct, '#40a020'));
    if (biofuelTotal < 50) rows.push(row('Wire', val('needs 50 biofuel', 'dim')));
    else rows.push(row('Research Station', val('needs 125 biofuel', 'dim')));
  }

  // Each row's figure is Progression.progressFor: the Research Station
  // list's own readout, at 100% ("Ready!") only once the unlock is READY.
  // These rows used to carry their own copy of every requirement, and the
  // copies drifted (the Cell Tower read Ready at 20 homes; it needs 25).
  const NEXT_UNLOCKS = [
    { type: T.WIRE,          label: 'Wire' },
    { type: T.RESEARCH,      label: 'Research Station MK1' },
    { type: T.POLE,          label: 'Power Pole' },
    { type: T.CELLTOWER,     label: 'Cell Tower' },
    { type: T.CIRCUITSWITCH, label: 'Circuit Switch' },
    { type: T.CIRCUITSWITCH2, label: 'Circuit Switch MK2' },
    { type: T.FIBERHUB,      label: 'Fiber Hub' },
    { type: T.GEOWELL,       label: 'Geothermal Well' },
    { type: T.GEOTURBINE,    label: 'Geothermal Turbine' },
    { type: T.COALSCAN,      label: 'Coal Scan' },
    { type: T.COALMINE,      label: 'Coal Mine' },
    { type: T.CONVEYOR,      label: 'Conveyor Belt' },
    { type: T.UNDERGNDCONVEYOR, label: 'Underground Belt' },
    ...(CONVEYOR_SPLITTER_ARCHIVED ? [] : [{ type: T.CONVEYORSPLITTER, label: 'Conveyor Splitter' }]),
    { type: T.PROTECTOR,     label: 'Surge Protector' },
    { type: T.PROTECTOR2,    label: 'Surge Protector MK2' },
    { type: T.LIGHTNINGROD3, label: 'Lightning Rod MK3' },
    { type: T.PROTECTOR3,    label: 'Surge Protector MK3' },
    { type: T.PIPE,          label: 'Pipe' },
    { type: T.UNDERGNDPIPE,  label: 'Underground Pipe' },
    { type: T.OILSCAN,       label: 'Oil Scan' },
    { type: T.URANIUMSCAN,   label: 'Uranium Scan' },
    { type: T.SULFURSCAN,    label: 'Sulfur Scan' },
    { type: T.URANIUMMINE,   label: 'Uranium Mine' },
    { type: T.SULFURMINE,    label: 'Sulfur Mine' },
    { type: T.SULFURMINE2,   label: 'Sulfur Mine MK2' },
    { type: T.LITHIUMSCAN,   label: 'Lithium Scan' },
    { type: T.LITHIUMMINE,   label: 'Lithium Mine' },
    { type: T.SOLAR,         label: 'Solar Panel MK1', dayGate: 54 },
    { type: T.FISHINGPOLE,   label: 'Fishing Pole' },
    { type: T.MONITOR,       label: 'Monitor Stn' },
    { type: T.MONITOR2,      label: 'Monitor Stn MK2' },
    { type: T.ENGOFFICE,     label: 'Engineering Office' },
    { type: T.BEACON,        label: 'Comms Beacon' },
    { type: T.SUBSTATION,    label: 'Substation MK1' },
    { type: T.SUBSTATION3,   label: 'Substation MK3' },
    { type: T.SUBSTATION4,   label: 'Substation MK4' },
    { type: T.SUBSTATION5,   label: 'Substation MK5' },
    { type: T.SUBSTATION2,   label: 'Substation MK2' },
    { type: T.TRUCK,         label: 'Waste Truck' },
    { type: T.HAULER,        label: 'Hauler' },
    { type: T.ROAD,          label: 'Road' },
    { type: T.BRIDGE,        label: 'Bridge' },
    { type: T.PATHTOOL,      label: 'Path Tool' },
    { type: T.WIND,          label: 'Wind Turbine', dayGate: 96 },
    { type: T.WIND2,         label: 'Wind Turbine MK2' },
    { type: T.WIND3,         label: 'Wind Turbine MK3' },
    { type: T.SOLAR3,        label: 'Solar Array' },
    { type: T.BATTERY,       label: 'Battery Block', dayGate: 78 },
    { type: T.RESEARCH2,     label: 'Research MK2' },
    { type: T.RESEARCH3,     label: 'Research MK3' },
    { type: T.SOLAR2,        label: 'Solar MK2' },
    { type: T.SURVEY,        label: 'Survey Stn' },
    { type: T.SURVEY2,       label: 'Survey Stn MK2' },
    { type: T.COALMINE2,     label: 'Coal Mine MK2' },
    { type: T.COALGENERATOR, label: 'Coal Generator' },
    { type: T.WATEREXTRACTOR, label: 'Water Extractor' },
    { type: T.POWERTOWER,    label: 'Wire MK2' },
    { type: T.BLUEPRINT,     label: 'Blueprints' },
    { type: T.DAM,           label: 'Dam' },
    { type: T.HYDROTURBINE,  label: 'Hydro Turbine' },
    { type: T.SHAFT,         label: 'Drive Shaft' },
    { type: T.HYDROGENERATOR, label: 'Hydro Generator' },
    { type: T.PUMPJACK,      label: 'Pump Jack' },
    { type: T.PUMPJACK2,     label: 'Pump Jack MK2' },
    { type: T.SOLIDSTORAGE,  label: 'Storage Container' },
    { type: T.OILSTORAGE,    label: 'Liquid Storage Tank' },
    { type: T.REFINERY,      label: 'Oil Refinery' },
    { type: T.GOVERNOR,      label: 'Throttle Governor' },
    { type: T.CARBONCAPTURE, label: 'Carbon Capture Plant' },
    { type: T.FUELGEN,       label: 'Fuel Power Gen' },
    { type: T.CHEMICALPLANT, label: 'Chemical Plant' },
    { type: T.FUELPLANT,     label: 'Fuel Plant' },
    { type: T.NUCLEARREACTOR, label: 'Nuclear Reactor' },
    { type: T.COOLINGTOWER,  label: 'Cooling Tower' },
    { type: T.STEAMTURBINE,  label: 'Steam Turbine' },
    { type: T.LITHIUMPROCESSPLANT, label: 'Lithium Processing Plant' },
    { type: T.MK4RESEARCH,   label: 'MK4 Research Stn' },
    { type: T.SPENTFUELPOOL, label: 'Spent Fuel Pool' },
    { type: T.REPROCESSOR,   label: 'Reprocessing Plant' },
    { type: T.MOXPLANT,      label: 'Adv. Fuel Processing' },
    { type: T.COOLINGTOWER2, label: 'Cryogenic Cooling Tower' },
    { type: T.ADVREACTOR,    label: 'Advanced Reactor' },
    { type: T.COKEOVEN,      label: 'Coke Oven Battery' },
    { type: T.GRAPHITEFURNACE, label: 'Graphitization Furnace' },
    { type: T.DRONEPORT,     label: 'Drone Port' },
    { type: T.DRONECHARGER,  label: 'Drone Charging Port' },
    { type: T.MK5RESEARCH,   label: 'MK5 Research Stn' },
    { type: T.ELECTROLYZER,  label: 'Electrolyzer' },
    { type: T.ATMOSCOLLECTOR, label: 'Atmosphere Collector' },
    { type: T.HABERBOSCH,    label: 'Haber-Bosch Complex' },
    { type: T.WASHTOWER,     label: 'Isotopic Wash Tower' },
    { type: T.TRITIUMBREEDER, label: 'Tritium Breeding Facility' },
    { type: T.FUSIONFUELPLANT, label: 'Fusion Fuel Plant' },
    { type: T.HELIUMSCAN,    label: 'Helium Scan' },
    { type: T.HELIUMWELL,    label: 'Helium Well' },
    { type: T.CRYOPLANT,     label: 'Cryo Plant' },
    { type: T.GASSTORAGE,    label: 'Gas Holder' },
    { type: T.HULKINGFUSIONREACTOR, label: 'Fusion Reactor' },
    { type: T.STEAMTURBINE2, label: 'Steam Turbine MK2' },
    { type: T.HE3SEPARATOR,  label: 'Helium-3 Separator' },
    { type: T.ADVFUSIONREACTOR, label: 'Advanced Fusion Reactor' },
    { type: T.MHDRING,       label: 'MHD Decelerator Ring' },
    { type: T.HELIUMWELL2,   label: 'Helium Well MK2' },
    { type: T.RAREEARTHSCAN, label: 'Rare Earth Scan' },
    { type: T.RAREEARTHMINE, label: 'Rare Earth Mine' },
    { type: T.LEACHPLANT,    label: 'Leach Plant' },
    { type: T.SCMILL,        label: 'Superconductor Mill' },
    { type: T.COREWORKS,     label: 'Core Works' },
    { type: T.LAMP,          label: 'Street Lamp' },
    { type: T.CAMERA,        label: 'Security Cam' },
    { type: T.EVCHARGER,     label: 'EV Charger' },
  ];

  // Ranked by how close each unlock is, EXCEPT that entries gated on a
  // calendar day (`dayGate`, in absolute in-game hours) are ordered among
  // themselves by that day. Their pct blends the day gate with a secondary
  // requirement (watts consumed/generated), so a nearly-met secondary can
  // float a later unlock above an earlier one — Battery/Wind ahead of Solar,
  // which reads as wrong since Solar always becomes available first.
  const pct = u => Progression.progressFor(u.type);
  const pending = NEXT_UNLOCKS.filter(u => !Progression.isUnlocked(u.type)).sort((a, b) => pct(b) - pct(a));
  const gatedSlots = [];
  const gated = [];
  pending.forEach((u, i) => { if (u.dayGate != null) { gatedSlots.push(i); gated.push(u); } });
  gated.sort((a, b) => a.dayGate - b.dayGate);
  gatedSlots.forEach((slot, i) => { pending[slot] = gated[i]; });
  const nextUnlocks = pending.slice(0, 3);

  // Remind player to place Research MK2 if unlocked but not placed
  const mk2Unlocked = Progression.isUnlocked(T.RESEARCH2);
  let mk2Placed = false;
  if (mk2Unlocked) {
    outer2: for (let r2 = 0; r2 < ROWS; r2++) for (let c2 = 0; c2 < COLS; c2++) {
      const e2 = GridManager.getEntity(c2, r2);
      if (e2 && e2.type === T.RESEARCH2) { mk2Placed = true; break outer2; }
    }
  }
  if (mk2Unlocked && !mk2Placed) {
    rows.push(div());
    rows.push(`<div class="pt-row"><span class="pt-label" style="color:#f0c040">Action Required</span></div>`);
    rows.push(row('Research MK2', val('Place it!', 'warn')));
  }

  if (nextUnlocks.length) {
    rows.push(div());
    rows.push(`<div class="pt-row"><span class="pt-label">Unlocks</span></div>`);
    nextUnlocks.forEach(u => {
      const p = pct(u);
      // Hovering a row spells out what the unlock actually needs, taken from
      // the same hint the Research Station shows — a bare percentage doesn't
      // say whether it wants watts, a day, a deposit, or a placed building.
      const hint = (typeof Progression.hintFor === 'function' && Progression.hintFor(u.type)) || '';
      const v = val(p >= 1 ? 'Ready!' : `${Math.round(p*100)}%`, p >= 1 ? 'good' : p > 0.7 ? 'warn' : 'dim');
      rows.push(hint
        ? `<div class="pt-row pt-unlock-row">${lbl(u.label)}${v}<span class="pt-hint">${esc(hint)}</span></div>`
        : row(u.label, v));
      rows.push(bar(p, p >= 1 ? '#40ff80' : '#6030a0'));
    });
  }

  // The tracker is rebuilt from scratch on every tick, and swapping innerHTML
  // replaces the very node the pointer is over — that killed :hover each
  // frame and made the unlock tooltips strobe. So skip writes that would
  // change nothing, and otherwise patch the existing nodes in place. (This
  // used to freeze the whole panel while the pointer was inside it instead,
  // which left every bar stuck for as long as the cursor rested there — all
  // the time, on a controller.) Only a change of layout rebuilds it.
  const html = rows.join('');
  _ptBindHover();
  if (html !== _ptLastHtml) {
    _ptLastHtml = html;
    const next = document.createElement('div');
    next.innerHTML = html;
    if (!_ptSync(body, next)) body.innerHTML = html;
  }
  _ptRefreshHint(panel, body);
}

// Make `cur` match `next` without replacing any node. False (having possibly
// patched some of it) as soon as the two differ in shape.
function _ptSync(cur, next) {
  const a = cur.childNodes, b = next.childNodes;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) return false;
    if (x.nodeType !== 1) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; continue; }
    if (x.attributes.length !== y.attributes.length) return false;
    for (const at of y.attributes) if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
    if (!_ptSync(x, y)) return false;
  }
  return true;
}

let _ptLastHtml    = null;
let _ptHoverBound  = false;

let _ptHintEl = null;
function _ptShowHint(panel, row, text) {
  if (!_ptHintEl) {
    _ptHintEl = document.createElement('div');
    _ptHintEl.id = 'pt-hint-float';
    document.body.appendChild(_ptHintEl);
  }
  const el = _ptHintEl;
  el.textContent = text;
  el.style.display = 'block';
  const p = panel.getBoundingClientRect(), r = row.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  // Left of the panel if there's room (it usually sits at the right edge),
  // otherwise to its right; vertically centred on the row, kept on screen.
  let x = p.left - w - 8;
  if (x < 8) x = Math.min(window.innerWidth - w - 8, p.right + 8);
  const y = Math.max(8, Math.min(window.innerHeight - h - 8, r.top + r.height / 2 - h / 2));
  el.style.left = `${x}px`; el.style.top = `${y}px`;
}
function _ptHideHint() { if (_ptHintEl) _ptHintEl.style.display = 'none'; }

// Last known pointer position (client px), or null once it has left the
// window. The controller's virtual cursor synthesises mousemove too, so this
// covers both.
let _ptPointer = null;

function _ptBindHover() {
  if (_ptHoverBound) return;
  _ptHoverBound = true;
  document.addEventListener('mousemove', ev => { _ptPointer = { x: ev.clientX, y: ev.clientY }; }, true);
  document.documentElement.addEventListener('mouseleave', () => { _ptPointer = null; });
}

// Unlock requirement tooltip. Shown beside the panel, level with the hovered
// row — drawn above the row inside the panel it sat on top of the rows above
// it and read as part of the list.
//
// Decided from where the pointer IS, every tick, rather than from mouseover:
// the panel is rebuilt whenever its layout changes (a status row swapping
// for a bar, the unlock order shifting), which replaces the hovered node,
// and a pointer at rest fires no new mouseover for the replacement — the
// tooltip went out and stayed out until the mouse moved again. A row also
// owns the progress bar under it, so there's no dead strip between rows.
function _ptRefreshHint(panel, body) {
  const p = _ptPointer;
  if (!p || !panel.contains(document.elementFromPoint(p.x, p.y))) { _ptHideHint(); return; }
  for (const row of body.querySelectorAll('.pt-unlock-row')) {
    const r = row.getBoundingClientRect();
    const barEl = row.nextElementSibling;
    const bottom = barEl && barEl.classList.contains('pt-bar-wrap')
      ? barEl.getBoundingClientRect().bottom + 3 : r.bottom;
    if (p.y >= r.top - 2 && p.y < bottom && p.x >= r.left && p.x <= r.right) {
      const src = row.querySelector('.pt-hint');
      if (src) { _ptShowHint(panel, row, src.textContent); return; }
    }
  }
  _ptHideHint();
}

function updateClock() {
  const canvas = document.getElementById('clock-face');
  const ctx = canvas.getContext('2d');

  const W = canvas.width;   // clock canvas is 44×44 as set in HTML
  const H = canvas.height;
  const cx = W / 2, cy = H / 2, R = W / 2 - 3;

  ctx.clearRect(0, 0, W, H);

  const dark  = DayNight.darkness();
  const hour  = DayNight.hour();
  const phase = hour / 24;   // 0–1

  // Colour palette: noon = warm gold, midnight = cool blue
  const dayCol   = { r:255, g:220, b:100 };
  const nightCol = { r: 80, g:130, b:220 };
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const faceAccent = `rgb(${lerp(dayCol.r,nightCol.r,dark)},${lerp(dayCol.g,nightCol.g,dark)},${lerp(dayCol.b,nightCol.b,dark)})`;

  // ── Outer ring ─────────────────────────────────────────────────
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = '#1e2a38';
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  // ── Progress arc (shows day progress, clockwise from top) ──────
  const startAngle = -Math.PI / 2;
  const endAngle   = startAngle + phase * Math.PI * 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R, startAngle, endAngle);
  ctx.strokeStyle = faceAccent;
  ctx.lineWidth   = 2.5;
  ctx.lineCap     = 'round';
  ctx.stroke();

  // ── Hour tick marks ────────────────────────────────────────────
  for (let i = 0; i < 12; i++) {
    const a   = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const len = i % 3 === 0 ? 5 : 3;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (R - 1),       cy + Math.sin(a) * (R - 1));
    ctx.lineTo(cx + Math.cos(a) * (R - 1 - len), cy + Math.sin(a) * (R - 1 - len));
    ctx.strokeStyle = '#2a3a4a';
    ctx.lineWidth   = 1;
    ctx.stroke();
  }

  // ── Sun / moon icon at current position ────────────────────────
  const handAngle = startAngle + phase * Math.PI * 2;
  const iconR     = R - 7;
  const ix        = cx + Math.cos(handAngle) * iconR;
  const iy        = cy + Math.sin(handAngle) * iconR;
  const isSun     = hour >= 5 && hour < 19;

  ctx.beginPath();
  ctx.arc(ix, iy, isSun ? 4 : 3.5, 0, Math.PI * 2);
  ctx.fillStyle = faceAccent;
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Moon crescent detail
  if (!isSun) {
    ctx.beginPath();
    ctx.arc(ix + 1.5, iy - 1, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#1a2535';
    ctx.fill();
  }

  // ── Centre dot ────────────────────────────────────────────────
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#2a3a4a';
  ctx.fill();

  // ── Update text labels ─────────────────────────────────────────
  {
    const lbl = document.getElementById('clock-label');
    const season = Seasons.enabled() ? `${Seasons.icon()} ${Seasons.name().toUpperCase()} · ` : '';
    lbl.textContent = `${season}DAY ${DayNight.day()} · ${DayNight.phaseName()}`;
    lbl.title = Seasons.enabled()
      ? `${Seasons.name()}, day ${Seasons.dayOfSeason()} of ${Seasons.SEASON_DAYS}. ${Seasons.nextName()} in ${Seasons.daysToNext()} day${Seasons.daysToNext() === 1 ? '' : 's'}.`
      : '';
  }
  document.getElementById('clock-time').textContent  = DayNight.timeString();
  // Heat-wave tag under the time: there for as long as the event is, so the
  // reason for the amber light (and the short-ranged drones) is on the HUD.
  const heatEl = document.getElementById('clock-heat');
  if (heatEl) {
    const ev = typeof WeatherEventSystem !== 'undefined' ? WeatherEventSystem.getActiveEvent() : null;
    const hot = !!ev && ev.type === 'heatwave';
    if (heatEl._hot !== hot) { heatEl._hot = hot; heatEl.style.display = hot ? '' : 'none'; }
  }
}

