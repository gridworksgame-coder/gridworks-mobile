/* ═══════════════════════════════════════════════════════════════════
   ZONE SYSTEM
   Zone clustering (union-find) for residential/commercial/industrial/government.
   ═══════════════════════════════════════════════════════════════════ */

const ZoneSystem = (() => {
  const PADDING  = 1;
  const NEW_ZONE_DIST = 10;  // tiles — buildings within this distance join the same zone
  // Customer requests (every zone type, parks, relocations) spawn in a band
  // this many tiles out from the government zone's edge. Pushed out 2.5x
  // from the original 22-40 so the first neighbourhoods sit well clear of
  // City Hall and the early game is about running lines out to them.
  const GOV_RING_MIN = 55;
  const GOV_RING_MAX = 100;

  const NATIONAL_ZONE_LABEL = 'NATIONAL GOVERNMENT ZONE';
  // Customer neighbourhoods keep this far back from a detached (national)
  // government zone, on top of never spawning inside it — see isInGovZone.
  // 16 covers the widest customer footprint anchored just outside it.
  const DETACHED_BUFFER = 16;

  const ZONE_STYLES = {
    residential: { label: 'RESIDENTIAL ZONE', color: 'rgba(255,200,80,0.06)',  border: 'rgba(160,100,20,0.5)',  textCol: 'rgba(200,150,40,0.7)' },
    commercial:  { label: 'COMMERCIAL ZONE',  color: 'rgba(40,120,255,0.05)',  border: 'rgba(40,80,180,0.5)',   textCol: 'rgba(80,140,255,0.7)' },
    industrial:  { label: 'INDUSTRIAL ZONE',  color: 'rgba(255,100,30,0.06)',  border: 'rgba(160,60,10,0.5)',   textCol: 'rgba(220,100,40,0.7)' },
    government:  { label: 'GOVERNMENT ZONE',  color: 'rgba(192,160,48,0.06)', border: 'rgba(160,130,30,0.5)',  textCol: 'rgba(192,160,48,0.7)' },
  };

  // Each zone type holds an array of rectangles
  const zoneRects = { residential: [], commercial: [], industrial: [], government: [] };

  // Bumped on every mutation so the background-layer render cache (RenderSystem)
  // knows when the zone cobblestone overlay needs to be redrawn. Cheap counter,
  // no behavioural change — just an invalidation signal for Step 1 caching.
  let _version = 0;
  function getVersion() { return _version; }

  function zoneFor(entity) {
    if (entity.isIndustrial || entity.type === T.INDUSTRIAL) return 'industrial';
    if (entity.type === T.COMMERCIAL) return 'commercial';
    if (entity.type === T.HOUSE || entity.type === T.CABIN) return 'residential';
    return null;
  }

  // A park is not a zone building (it can't found or link a neighbourhood),
  // but one within PARK_REACH tiles of a residential zone's houses is drawn
  // into that zone's outline — see computeZonesForType.
  const PARK_REACH = 2;
  function zoneToRecompute(entity) {
    const key = zoneFor(entity);
    if (key) return key;
    return typeof PARK_TYPES !== 'undefined' && PARK_TYPES.includes(entity.type) ? 'residential' : null;
  }

  // The zone kind a requested amenity belongs to: the one whose request it
  // answered (ZoneRequestSystem tags it on placement). One built before that
  // tag existed goes to the nearest zone of a kind that could have asked for
  // it, and keeps that answer from then on.
  function amenityZoneKey(a) {
    if (a._zoneKey) return a._zoneKey;
    const c1 = a.col + (a.width || 1) - 1, r1 = a.row + (a.height || 1) - 1;
    let best = null, bestD = ZoneRequestSystem.ZONE_ITEM_TOLERANCE;
    for (const k of ZoneRequestSystem.zoneKeysFor(a.type)) for (const z of zoneRects[k] || []) {
      const d = Math.max(0, z.minC - c1, a.col - z.maxC) + Math.max(0, z.minR - r1, a.row - z.maxR);
      if (d <= bestD) { bestD = d; best = k; }
    }
    if (best) a._zoneKey = best;
    return best;
  }

  function rectCentre(rect) {
    return { c: (rect.minC + rect.maxC) / 2, r: (rect.minR + rect.maxR) / 2 };
  }

  function distToRect(rect, c0, r0, c1, r1) {
    // Minimum distance from building to existing rect boundary
    const bc = (c0 + c1) / 2, br = (r0 + r1) / 2;
    const rc = rectCentre(rect);
    return Math.sqrt((bc - rc.c) ** 2 + (br - rc.r) ** 2);
  }

  // Deterministic, order-independent zone clustering: two buildings of the
  // same type are in the same zone iff there's a chain of buildings between
  // them each within NEW_ZONE_DIST (edge-to-edge) of the next. This replaces
  // the old incremental "rescan in row-major order, expand whichever rect is
  // closest" approach, which could merge unrelated zones together (or split
  // them apart differently) purely depending on scan order — most visibly
  // when moving a single building triggered a full from-scratch rescan.
  function computeZonesForType(key) {
    const buildings = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const e = GridManager.getEntity(c, r);
      if (!e || e.col !== c || e.row !== r || !e.fromRequest) continue;
      if (zoneFor(e) === key) buildings.push(e);
    }
    if (!buildings.length) return [];

    const n = buildings.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    function find(i) { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; }
    function union(a, b) { a = find(a); b = find(b); if (a !== b) parent[a] = b; }
    function edgeDist(b1, b2) {
      const w1 = b1.width||1, h1 = b1.height||1, w2 = b2.width||1, h2 = b2.height||1;
      const edgeDistC = Math.max(0, Math.max(b1.col - (b2.col+w2-1), b2.col - (b1.col+w1-1)));
      const edgeDistR = Math.max(0, Math.max(b1.row - (b2.row+h2-1), b2.row - (b1.row+h1-1)));
      return edgeDistC + edgeDistR;
    }
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (edgeDist(buildings[i], buildings[j]) <= NEW_ZONE_DIST) union(i, j);

    // A zone's outline is its ground. A building standing wholly inside the
    // outline of another group (open ground the zone already spans, say
    // under a long first street) belongs to that zone, however far it is
    // from the nearest building in it. Without this, filling a zone's own
    // empty middle "started a new zone", so requests were steered round it
    // and could only grow the zone outward. Repeated until nothing changes:
    // taking a building in can't grow a box (it is already inside it), but
    // merging two groups can, and the bigger box may enclose another.
    for (let changed = true; changed;) {
      changed = false;
      const box = new Map();   // root -> outline of its group
      for (let i = 0; i < n; i++) {
        const b = buildings[i], root = find(i);
        const c1 = b.col + (b.width || 1) - 1, r1 = b.row + (b.height || 1) - 1;
        const z = box.get(root);
        if (!z) box.set(root, { minC: b.col, maxC: c1, minR: b.row, maxR: r1 });
        else { z.minC = Math.min(z.minC, b.col); z.maxC = Math.max(z.maxC, c1); z.minR = Math.min(z.minR, b.row); z.maxR = Math.max(z.maxR, r1); }
      }
      for (let i = 0; i < n; i++) {
        const b = buildings[i], own = find(i);
        const c1 = b.col + (b.width || 1) - 1, r1 = b.row + (b.height || 1) - 1;
        for (const [root, z] of box) {
          if (root === own) continue;
          if (b.col >= z.minC && c1 <= z.maxC && b.row >= z.minR && r1 <= z.maxR) { union(i, root); changed = true; break; }
        }
        if (changed) break;
      }
    }

    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(buildings[i]);
    }

    const rects = [];
    for (const group of groups.values()) {
      let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity, earliest = Infinity;
      for (const b of group) {
        const w = b.width||1, h = b.height||1;
        minC = Math.min(minC, b.col); maxC = Math.max(maxC, b.col+w-1);
        minR = Math.min(minR, b.row); maxR = Math.max(maxR, b.row+h-1);
        earliest = Math.min(earliest, b._placedAt || 0);
      }
      rects.push({ minC, maxC, minR, maxR, _earliest: earliest });
    }
    // A neighbourhood's amenities are part of it. Most are built in a gap
    // between the houses, but one put on the edge of town (a Family Farm)
    // stands partly or wholly outside the houses' own outline, so the zone
    // grows to take in any that touch it. Measured against the outline of
    // the houses alone, so the order they're visited in can't matter.
    if (key === 'residential' && typeof PARK_TYPES !== 'undefined') {
      const grown = rects.map(z => ({ ...z }));
      for (const type of PARK_TYPES) for (const p of EntityRegistry.getByType(type)) {
        if (!p.fromRequest) continue;
        const c1 = p.col + (p.width || 1) - 1, r1 = p.row + (p.height || 1) - 1;
        let best = -1, bestD = Infinity;
        rects.forEach((z, i) => {
          const d = Math.max(0, z.minC - c1, p.col - z.maxC) + Math.max(0, z.minR - r1, p.row - z.maxR);
          if (d <= PARK_REACH && d < bestD) { bestD = d; best = i; }
        });
        if (best < 0) continue;
        const g = grown[best];
        g.minC = Math.min(g.minC, p.col); g.maxC = Math.max(g.maxC, c1);
        g.minR = Math.min(g.minR, p.row); g.maxR = Math.max(g.maxR, r1);
      }
      rects.forEach((z, i) => Object.assign(z, grown[i]));
    }
    // So are the amenities a zone asked for: Cell Tower, Fiber Hub, EV
    // Charging Station. There is often only room for one on the edge, so it
    // may stand partly or wholly outside the buildings' outline, and the zone
    // takes it in. That used to happen once, on placement (expandZoneRect),
    // and was undone the next time the zone was rebuilt from its buildings:
    // any house added or removed in the zone shrank it back off the amenity.
    if (typeof ZoneRequestSystem !== 'undefined') {
      const reach = ZoneRequestSystem.ZONE_ITEM_TOLERANCE * 2;
      const grown = rects.map(z => ({ ...z }));
      for (const type of ZoneRequestSystem.REQUESTABLE) for (const a of EntityRegistry.getByType(type)) {
        if (amenityZoneKey(a) !== key) continue;
        const c1 = a.col + (a.width || 1) - 1, r1 = a.row + (a.height || 1) - 1;
        let best = -1, bestD = Infinity;
        rects.forEach((z, i) => {
          const d = Math.max(0, z.minC - c1, a.col - z.maxC) + Math.max(0, z.minR - r1, a.row - z.maxR);
          if (d <= reach && d < bestD) { bestD = d; best = i; }
        });
        if (best < 0) continue;
        const g = grown[best];
        g.minC = Math.min(g.minC, a.col); g.maxC = Math.max(g.maxC, c1);
        g.minR = Math.min(g.minR, a.row); g.maxR = Math.max(g.maxR, r1);
      }
      rects.forEach((z, i) => Object.assign(z, grown[i]));
    }
    // Stable ordering — "zone 1" stays the zone with the earliest-placed
    // building across rebuilds, rather than shuffling with scan order.
    rects.sort((a, b) => a._earliest - b._earliest);
    rects.forEach(r => delete r._earliest);
    return rects;
  }

  // Zones are recomputed from the buildings on every change, so a player-given
  // name is handed on to whichever new rect overlaps the old one the most.
  function recomputeZones(key) {
    const old = zoneRects[key] || [];
    const next = computeZonesForType(key);
    for (const o of old) {
      if (!o.name) continue;
      let best = null, bestA = 0;
      for (const n of next) {
        if (n.name) continue;
        const w = Math.min(o.maxC, n.maxC) - Math.max(o.minC, n.minC) + 1;
        const h = Math.min(o.maxR, n.maxR) - Math.max(o.minR, n.minR) + 1;
        if (w > 0 && h > 0 && w * h > bestA) { bestA = w * h; best = n; }
      }
      if (best) best.name = o.name;
    }
    zoneRects[key] = next;
  }

  function addBuilding(entity) {
    const key = zoneToRecompute(entity);
    if (!key) return;
    recomputeZones(key);
    _version++;
  }

  function expandGovZone(col, row, w, h) {
    if (!zoneRects.government[0]) return;
    const z = zoneRects.government[0];
    z.minC = Math.min(z.minC, col - 2);
    z.maxC = Math.max(z.maxC, col + w - 1 + 2);
    z.minR = Math.min(z.minR, row - 2);
    z.maxR = Math.max(z.maxR, row + h - 1 + 2);
    _version++;
  }

  // Grows a specific residential/commercial/industrial zone rect (by index,
  // since a zoneKey can have multiple disjoint zones) to fully include a
  // footprint. Used when a zone-requested amenity (Cell Tower, Fiber Hub)
  // gets placed just outside the zone's current bounds — the zone should
  // extend to claim it rather than block placement or leave it orphaned.
  function expandZoneRect(zoneKey, index, col, row, w, h) {
    const rects = zoneRects[zoneKey];
    if (!rects || !rects[index]) return;
    const z = rects[index];
    z.minC = Math.min(z.minC, col);
    z.maxC = Math.max(z.maxC, col + w - 1);
    z.minR = Math.min(z.minR, row);
    z.maxR = Math.max(z.maxR, row + h - 1);
    _version++;
  }

  function setGovZone(entity) {
    // Government zone starts small — 2 tile padding, grows as gov properties added
    const PAD = 2;
    zoneRects.government = [{
      minC: entity.col - PAD, maxC: entity.col + (entity.width||4) - 1 + PAD,
      minR: entity.row - PAD, maxR: entity.row + (entity.height||4) - 1 + PAD,
    }];
    _version++;
  }

  // A detached government zone out in the world (the National Government
  // Zone). Index 0 stays City Hall's zone — everything that measures from
  // "the government zone" (distToGovZone, customer placement rings,
  // expandGovZone) keeps meaning the city's — while isInGovZone covers every
  // rect, plus a buffer around detached ones, so nothing else spawns inside
  // or up against this one. `entity` is anything with col/row/width/height —
  // a building, or the reserved block from GovernmentSystem's plan.
  const DETACHED_ZONE_PAD = 4;
  function addGovZone(entity, label) {
    zoneRects.government.push({
      minC: entity.col - DETACHED_ZONE_PAD, maxC: entity.col + (entity.width || 1) - 1 + DETACHED_ZONE_PAD,
      minR: entity.row - DETACHED_ZONE_PAD, maxR: entity.row + (entity.height || 1) - 1 + DETACHED_ZONE_PAD,
      label,
    });
    _version++;
  }

  // The reserved block of a national-zone plan, as a footprint.
  function planRect(plan) { return { col: plan.c0, row: plan.r0, width: plan.w, height: plan.h }; }

  // Grows the nearest detached government zone to take in another building
  // (only ever grows it — a building in its reserved slot is already inside).
  function joinGovZone(entity, label) {
    let best = null, bestD = Infinity;
    for (let i = 1; i < zoneRects.government.length; i++) {
      const z = zoneRects.government[i];
      const dc = Math.max(0, z.minC - (entity.col + (entity.width || 1) - 1), entity.col - z.maxC);
      const dr = Math.max(0, z.minR - (entity.row + (entity.height || 1) - 1), entity.row - z.maxR);
      if (dc + dr < bestD) { bestD = dc + dr; best = z; }
    }
    if (!best) { addGovZone(entity, label); return; }
    const was = `${best.minC},${best.maxC},${best.minR},${best.maxR},${best.label}`;
    best.minC = Math.min(best.minC, entity.col - DETACHED_ZONE_PAD);
    best.maxC = Math.max(best.maxC, entity.col + (entity.width || 1) - 1 + DETACHED_ZONE_PAD);
    best.minR = Math.min(best.minR, entity.row - DETACHED_ZONE_PAD);
    best.maxR = Math.max(best.maxR, entity.row + (entity.height || 1) - 1 + DETACHED_ZONE_PAD);
    best.label = label;
    // Callers re-assert a reservation every frame (GovernmentSystem), so only
    // a real change invalidates zone caches.
    if (was !== `${best.minC},${best.maxC},${best.minR},${best.maxR},${best.label}`) _version++;
  }

  // ── Zone spacing ─────────────────────────────────────────────────
  // Every zone (residential, commercial, industrial and government) keeps
  // its distance from every other. ZONE_MIN_GAP is the closest two zones may
  // ever come: rect to rect, empty columns plus empty rows between them.
  // A zone also stops growing toward a neighbour once they are within
  // ZONE_GROW_GAP, so it fills out on its open sides instead, and once
  // every side is closed the next request starts a new zone. Request sites
  // (HouseRequestSystem) and civic buildings (GovernmentSystem) both go
  // through crowdsZones, and neither ever relaxes it.
  const ZONE_MIN_GAP  = 25;
  const ZONE_GROW_GAP = 30;
  function rectGap(a, b) {
    return Math.max(0, b.minC - a.maxC - 1, a.minC - b.maxC - 1)
         + Math.max(0, b.minR - a.maxR - 1, a.minR - b.maxR - 1);
  }
  // Would `rect` grown out to `grown` come too close to another zone? For a
  // zone that doesn't exist yet, pass rect = null and the footprint as
  // `grown`: it must keep ZONE_MIN_GAP from every zone. Growth that leaves
  // the gap to a neighbour no smaller than it already was is always allowed,
  // so a pair that was already close before these rules can still fill out
  // on their far sides.
  function crowdsZones(rect, grown) {
    const near = (o) => {
      const then = rectGap(grown, o);
      if (!rect) return then < ZONE_MIN_GAP;
      return then < ZONE_GROW_GAP && then < rectGap(rect, o);
    };
    for (const k in zoneRects) for (const o of zoneRects[k]) if (o !== rect && near(o)) return true;
    for (const o of _heldNational()) if (near(o)) return true;
    return false;
  }

  // Land the national plan holds for the National Government Zone to grow
  // into. The zone used to be drawn round the whole founding block (120×80
  // plus its pad, stretched further for Hyperion Station's plot) from the
  // day the first building landed: a zone four times the size of any
  // neighbourhood, standing almost empty. It is drawn round the national
  // buildings actually standing now and grows as each arrives, and this
  // keeps everywhere it will grow to clear meanwhile, unseen: the block and
  // every spot reserved in or beside it, as one box. Holding only the spots
  // themselves would let a neighbourhood settle in the gaps between them,
  // and the zone would then grow over it. Customer requests may not spawn
  // in or beside it (isInGovZone) or grow toward it (crowdsZones). Re-read
  // at most every HELD_TTL ms: the plan changes rarely, and isInGovZone
  // runs per tile in the customer placement scans.
  const HELD_TTL = 500;
  let _held = [], _heldAt = -Infinity;
  function _heldNational() {
    const now = performance.now();
    if (now - _heldAt < HELD_TTL) return _held;
    _heldAt = now;
    _held = [];
    const plan = typeof GovernmentSystem !== 'undefined' ? GovernmentSystem.getNationalPlan?.() : null;
    if (!plan) return _held;
    let minC = plan.c0, maxC = plan.c0 + plan.w - 1, minR = plan.r0, maxR = plan.r0 + plan.h - 1;
    for (const [t, s] of Object.entries(plan.slots || {})) {
      const d = EntityDefs[t];
      if (!d) continue;
      minC = Math.min(minC, s[0]); maxC = Math.max(maxC, s[0] + d.width - 1);
      minR = Math.min(minR, s[1]); maxR = Math.max(maxR, s[1] + d.height - 1);
    }
    const p = DETACHED_ZONE_PAD;
    _held.push({ minC: minC - p, maxC: maxC + p, minR: minR - p, maxR: maxR + p });
    return _held;
  }
  // A building of footprint fw×fh at (c, r) placed as a NEW zone.
  function footprintCrowdsZones(c, r, fw, fh) {
    return crowdsZones(null, { minC: c, maxC: c + fw - 1, minR: r, maxR: r + fh - 1 });
  }

  function govZoneCentre() {
    const r = zoneRects.government[0];
    return r ? { c: (r.minC+r.maxC)/2, r: (r.minR+r.maxR)/2 } : null;
  }

  function isInGovZone(col, row) {
    const m = DETACHED_BUFFER;
    return zoneRects.government.some((r, i) => {
      const b = i > 0 ? m : 0;
      return col >= r.minC - b && col <= r.maxC + b && row >= r.minR - b && row <= r.maxR + b;
    }) || _heldNational().some(r => col >= r.minC - m && col <= r.maxC + m && row >= r.minR - m && row <= r.maxR + m);
  }

  // True if a w×h footprint at (col, row) comes within NATIONAL_DEPOSIT_GAP
  // of the National Government Zone or the land held for it to grow into
  // (_heldNational). Survey finds check this (isOuterZone), so no deposit is
  // discovered where a national building is due to go, nor so close that
  // the mine sunk on it would reach in.
  const NATIONAL_DEPOSIT_GAP = 6;
  function onNationalLand(col, row, w = 1, h = 1) {
    const g = NATIONAL_DEPOSIT_GAP, c1 = col + w - 1, r1 = row + h - 1;
    const hits = r => c1 >= r.minC - g && col <= r.maxC + g && r1 >= r.minR - g && row <= r.maxR + g;
    return zoneRects.government.some((r, i) => i > 0 && hits(r)) || _heldNational().some(hits);
  }

  function distToGovZone(col, row) {
    if (!zoneRects.government[0]) return Infinity;
    const r = zoneRects.government[0];
    const dc = Math.max(0, r.minC - col, col - r.maxC);
    const dr = Math.max(0, r.minR - row, row - r.maxR);
    return dc + dr;
  }

  function rebuild() {
    recomputeZones('residential');
    recomputeZones('commercial');
    recomputeZones('industrial');
    // Rebuild gov zone
    let _govFound = false;
    outer_gov: for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const e = GridManager.getEntity(c, r);
      if (e && e.type === T.GOVBUILDING && e.col === c && e.row === r) {
        setGovZone(e);
        _govFound = true;
        break outer_gov;
      }
    }
    if (!_govFound) console.warn('Gov zone NOT set; no GOVBUILDING found on grid');
    // Re-expand gov zone for any civic buildings already on the grid
    const _CIVIC = new Set([T.TOWNHALL, T.CIVICCENTER, T.COURTHOUSE, T.EMS, T.HOSPITAL, T.UNIVERSITY, T.TRANSPORTHUB]);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const e = GridManager.getEntity(c, r);
      if (e && _CIVIC.has(e.type) && e.col === c && e.row === r) {
        expandGovZone(e.col, e.row, e.width || EntityDefs[e.type].width || 4, e.height || EntityDefs[e.type].height || 4);
      }
    }
    // The National Government Zone: round the national buildings standing
    // now. The spots its plan holds for the rest are kept clear without
    // being drawn (see _heldNational).
    for (const t of [T.NATIONALGOV, T.FUSIONLAB, T.AIRPORT, T.MILITARYBASE, T.LAUNCHCOMPLEX, T.NATIONALGRID, T.COMPANYHQ])
      for (const e of EntityRegistry.getByType(t)) joinGovZone(e, NATIONAL_ZONE_LABEL);
    _heldAt = -Infinity;
    _version++;
  }

  function removeBuilding(entity) {
    const key = zoneToRecompute(entity);
    if (!key) return;
    recomputeZones(key);
    _version++;
  }

  function isHoveringRect(rect, col, row) {
    return col >= rect.minC - PADDING && col <= rect.maxC + PADDING &&
           row >= rect.minR - PADDING && row <= rect.maxR + PADDING;
  }

  // A zone's display name: the player's own, else "RESIDENTIAL ZONE 2" etc.
  function defaultLabel(key, i) {
    const rects = zoneRects[key], style = ZONE_STYLES[key];
    return key !== 'government' && rects.length > 1 ? `${style.label} ${i + 1}` : style.label;
  }
  function zoneLabel(key, i) {
    return zoneRects[key]?.[i]?.name || defaultLabel(key, i);
  }
  const NAME_MAX = 28;
  function setZoneName(key, i, name) {
    const rect = zoneRects[key]?.[i];
    if (!rect || key === 'government') return;
    name = (name || '').trim().slice(0, NAME_MAX);
    if (name === (rect.name || '')) return;
    if (name) rect.name = name; else delete rect.name;
    _version++;
  }

  function render(ctx, t, hoverCol, hoverRow) {
    for (const [key, rects] of Object.entries(zoneRects)) {
      if (rects.length === 0) continue;
      const style = ZONE_STYLES[key];
      rects.forEach((rect, i) => {
        if (!isHoveringRect(rect, hoverCol, hoverRow)) return;
        const x = (rect.minC - PADDING) * TILE;
        const y = (rect.minR - PADDING) * TILE;
        const w = (rect.maxC - rect.minC + 1 + PADDING * 2) * TILE;
        const h = (rect.maxR - rect.minR + 1 + PADDING * 2) * TILE;

        ctx.fillStyle = style.color;
        ctx.fillRect(x, y, w, h);

        ctx.save();
        ctx.strokeStyle = style.border;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        ctx.restore();

        // Government zones are never numbered: City Hall's is just the
        // government zone, and a detached one carries its own label.
        const label = rect.label || zoneLabel(key, i);
        ctx.save();
        ctx.fillStyle = style.textCol;
        ctx.font = 'bold 7px monospace';
        ctx.fillText(label, x + 6, y + 12);
        ctx.restore();
      });
    }
  }

  function getZoneAt(col, row) {
    for (const [key, rects] of Object.entries(zoneRects)) {
      for (let i = 0; i < rects.length; i++) {
        if (isHoveringRect(rects[i], col, row)) return { key, zone: rects[i], index: i };
      }
    }
    return null;
  }

  function hasZone(key) { return zoneRects[key].length > 0; }

  // Click the title to rename: swaps in an input that persists across the
  // panel's periodic rebuilds. Enter / blur saves, Esc cancels, empty resets.
  let _nameInput = null;
  function _wireTitleEdit(titleEl) {
    if (_nameInput) return;
    const panel = document.getElementById('zone-panel');
    const input = _nameInput = document.createElement('input');
    input.type = 'text'; input.maxLength = NAME_MAX; input.spellcheck = false;
    input.style.cssText = 'display:none;flex:1;min-width:0;margin-right:8px;background:rgba(255,255,255,0.06);border:1px solid var(--ui-border-b);border-radius:4px;color:var(--text-hi);font:700 11px Inter,sans-serif;letter-spacing:0.08em;text-transform:uppercase;padding:2px 6px;outline:none;';
    titleEl.parentNode.insertBefore(input, titleEl.nextSibling);
    const close = (save) => {
      if (input.style.display === 'none') return;
      input.style.display = 'none'; titleEl.style.display = '';
      if (save) setZoneName(panel.dataset.zone, parseInt(panel.dataset.zoneIndex) || 0, input.value);
      buildZonePanel(panel.dataset.zone, parseInt(panel.dataset.zoneIndex) || 0);
    };
    titleEl.addEventListener('click', () => {
      const k = panel.dataset.zone, i = parseInt(panel.dataset.zoneIndex) || 0;
      if (!k || k === 'government') return;
      input.value = zoneRects[k]?.[i]?.name || '';
      input.placeholder = defaultLabel(k, i);
      titleEl.style.display = 'none'; input.style.display = '';
      input.focus(); input.select();
    });
    input.addEventListener('keydown', e => {
      e.stopPropagation();   // typing must not trigger game hotkeys
      if (e.key === 'Enter') close(true);
      else if (e.key === 'Escape') close(false);
    });
    input.addEventListener('keyup', e => e.stopPropagation());
    input.addEventListener('blur', () => close(true));
  }

  function buildZonePanel(key, index = 0) {
    const rects  = zoneRects[key];
    const rect   = rects[index];
    const style  = ZONE_STYLES[key];
    const titleEl = document.getElementById('zp-title');
    const body   = document.getElementById('zp-body');
    if (!titleEl || !body || !rect) return;

    _wireTitleEdit(titleEl);
    // Leave the title alone while it's being renamed — the panel refreshes on a timer.
    if (!_nameInput || _nameInput.style.display === 'none') titleEl.textContent = zoneLabel(key, index);
    titleEl.title = key === 'government' ? '' : 'Click to rename';
    titleEl.style.cursor = key === 'government' ? '' : 'text';
    const colors = { residential: '#c8a040', commercial: '#4080ff', industrial: '#ff6020' };
    titleEl.style.color = colors[key] || '#aaa';
    body.innerHTML = '';

    // Collect buildings in this specific rect (with padding)
    const buildings = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const e = GridManager.getEntity(c, r);
        if (!e || e.col !== c || e.row !== r || !e.fromRequest) continue;
        if (zoneFor(e) !== key) continue;
        const ec = e.col + Math.floor((e.width  || 1) / 2);
        const er = e.row + Math.floor((e.height || 1) / 2);
        const rc = rectCentre(rect);
        if (Math.sqrt((ec-rc.c)**2+(er-rc.r)**2) <= NEW_ZONE_DIST + 5)
          buildings.push(e);
      }

    const row  = (label, val, cls='') => `<div class="zp-row"><span class="zp-label">${label}</span><span class="zp-val${cls?' '+cls:''}">${val}</span></div>`;
    const section = (...rows) => { const d=document.createElement('div'); d.className='zp-section'; d.innerHTML=rows.join(''); body.appendChild(d); };

    const powered   = buildings.filter(b => b.powered).length;
    const unpowered = buildings.length - powered;
    const totalDraw = buildings.reduce((s,b) => { const dyn=DemandCurves.get(b.type,b.commercialSubtype,DayNight.hour()); return s+(dyn!==null?dyn:b.def?.powerInput||0)*(b.demandScale||1); }, 0);
    const totalIncome = buildings.reduce((s,b) => s+(b.dailyFee||0), 0);
    const avgSat = buildings.length > 0 ? Math.round(buildings.reduce((s,b)=>s+(b.satisfaction??100),0)/buildings.length) : 0;
    const countLabel = key==='residential'?'Residents':key==='commercial'?'Businesses':'Facilities';

    section(row(countLabel, buildings.length), row('Powered',`${powered} / ${buildings.length}`,powered===buildings.length?'good':unpowered>0?'bad':'warn'), row('Avg Satisfaction',`${avgSat}%`,avgSat>=75?'good':avgSat>=50?'warn':'bad'));
    section(row('Zone Power Draw',`${formatPower(totalDraw, 1)}`), row('Unpowered Units',`${unpowered}`,unpowered>0?'bad':'good'));
    section(row('Zone Income',`${formatMoney(totalIncome)}/s`,'good'));

    // Active zone requests (Cell Tower, Fiber Hub, EV Charger, etc.)
    if (typeof ZoneRequestSystem !== 'undefined') {
      const zoneReqs = ZoneRequestSystem.getActiveForZone(key, rect);
      if (zoneReqs.length > 0) {
        const reqDiv = document.createElement('div');
        reqDiv.className = 'zp-section';
        zoneReqs.forEach(req => {
          const itemLabel = EntityDefs[req.itemType]?.label || req.itemType;
          const d = document.createElement('div'); d.className = 'zp-row';
          // Where it goes: the spot the request marks (the same X / Y the
          // world map's cursor readout counts in).
          const at = req.spot ? `SPOT X ${req.spot.col} Y ${req.spot.row}` : 'PENDING';
          d.innerHTML = `<span class="zp-label">📡 Wants ${itemLabel}</span><span class="zp-val warn">${at}</span>`;
          reqDiv.appendChild(d);
        });
        body.appendChild(reqDiv);
      }
    }

    if (buildings.length > 0) {
      const listDiv = document.createElement('div');
      listDiv.className = 'zp-section';
      buildings.slice(0,8).forEach(b => {
        const d=document.createElement('div'); d.className='zp-row';
        const sat=b.satisfaction??100;
        d.innerHTML=`<span class="zp-label">${b.businessName||'—'}</span><span class="zp-val ${b.powered?sat<50?'warn':'good':'bad'}">${b.powered?`${Math.round(sat)}% sat`:'OFFLINE'}</span>`;
        listDiv.appendChild(d);
      });
      if (buildings.length>8){const m=document.createElement('div');m.style.cssText='font-size:8px;color:var(--text-dim);text-align:center;margin-top:4px;';m.textContent=`+${buildings.length-8} more`;listDiv.appendChild(m);}
      body.appendChild(listDiv);
    }
  }

  function serialise() {
    return { residential: zoneRects.residential, commercial: zoneRects.commercial, industrial: zoneRects.industrial };
  }

  function loadState(data) {
    if (!data) return;
    for (const key of ['residential','commercial','industrial']) {
      if (!data[key]) continue;
      // Handle both new format (array of rects) and old format (single rect object)
      if (Array.isArray(data[key])) {
        zoneRects[key] = data[key];
      } else if (data[key].active) {
        // Old single-zone format — convert to array
        const z = data[key];
        zoneRects[key] = [{ minC: z.minC, maxC: z.maxC, minR: z.minR, maxR: z.maxR }];
      }
    }
    // No rebuild here: this runs before the buildings are back on the grid.
    // The load rebuilds every zone once they are (SaveSystem → rebuild),
    // which is also what takes requested amenities back into zones saved
    // shrunk off them, and these rects are what carry the names over.
    _version++;
  }

  // Streets, walks and paving are laid out round whatever stands in a zone
  // (see _zoneGroundPlan), and that layout is cached on the version. A
  // building the PLAYER puts down or removes inside a zone, a plant dropped
  // in the middle of a commercial block, isn't a zone building, so nothing
  // else bumps the version for it and the streets would carry on straight
  // through it. Called by GridManager for every footprint added or removed;
  // only a multi-tile building overlapping a zone's paved ring counts, the
  // same test the layout uses for what blocks a route.
  function noteFootprintChanged(e) {
    if (!e || e.type === T.TRUCK || ((e.width || 1) <= 1 && (e.height || 1) <= 1)) return;   // a truck lifts and re-lays its footprint every tile it drives
    const c0 = e.col, c1 = e.col + (e.width || 1) - 1, r0 = e.row, r1 = e.row + (e.height || 1) - 1;
    for (const key in zoneRects) for (const z of zoneRects[key] || []) {
      if (c1 >= z.minC - 1 && c0 <= z.maxC + 1 && r1 >= z.minR - 1 && r0 <= z.maxR + 1) { _version++; return; }
    }
  }

  function zoneCount(key) { return zoneRects[key]?.length || 0; }
  function getZoneRects(key) { return zoneRects[key] || []; }

  return { noteFootprintChanged, PARK_REACH, GOV_RING_MIN, GOV_RING_MAX,
           ZONE_MIN_GAP, ZONE_GROW_GAP, rectGap, crowdsZones, footprintCrowdsZones, addBuilding, removeBuilding, rebuild, setGovZone, expandGovZone, addGovZone, joinGovZone, planRect, NATIONAL_ZONE_LABEL, expandZoneRect, govZoneCentre, isInGovZone, onNationalLand, distToGovZone, render, getZoneAt, zoneLabel, setZoneName, buildZonePanel, hasZone, zoneCount, getZoneRects, getVersion, serialise, loadState };
})();

// Message log — stores recent toasts for the player to review
