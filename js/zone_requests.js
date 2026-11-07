// ═══════════════════════════════════════════════════════════════════
// ZONE REQUEST SYSTEM
// ───────────────────
// Parallels AmenityRequestSystem, but at the ZONE level. A zone can
// request items (Cell Tower, Fiber Hub, EV Charging Station), each on a
// spot the request marks in or just beside the zone (see pickSpot); the
// zone then takes the item into its outline for good. Each zone holds at
// most one active request per item type; if the item already exists in
// the zone, no request is fired.
// ═══════════════════════════════════════════════════════════════════
const ZoneRequestSystem = (() => {
  // Items that can be requested at the zone level.
  const REQUESTABLE = [T.CELLTOWER, T.FIBERHUB, T.EVCHARGER];

  // Zone keys eligible for requests.
  const ZONE_KEYS = ['residential', 'commercial', 'industrial'];
  // Per-item override of which zone kinds may ask. Unlisted types use
  // ZONE_KEYS. EV chargers used to be a per-home residential amenity
  // request; at zone level they stay a residential ask — warehouses
  // and shops don't request a charging plaza.
  const ZONE_KEYS_FOR_TYPE = {
    [T.EVCHARGER]: ['residential'],
  };

  // Active requests:
  //   { zoneKey, anchorRect, itemType, timer, fulfilled, expired }
  // anchorRect is a snapshot of the zone bounds when the request was
  // made; used to match a current zone back to this request even if the
  // zone's index shifts after merges/splits.
  const requests = [];

  // Per-zone scheduling state: keyed by `${zoneKey}:${sig}:${itemType}`.
  // Tracks the countdown to first eligible request for a given zone.
  // Signature is a stable-ish hash of the zone rect centre.
  const scheduled = new Map();

  // ── Tunables ─────────────────────────────────────────────────────
  const MIN_BUILDINGS = { residential: 4, commercial: 3, industrial: 2 };
  // Per-item-type minimum buildings override (takes priority over MIN_BUILDINGS)
  const MIN_BUILDINGS_FOR_TYPE = {
    [T.CELLTOWER]: null,   // use zone default
    [T.FIBERHUB]:  15,     // needs at least 15 properties in the zone
    [T.EVCHARGER]: null,   // use zone default (residential: 4)
  };
  const SCHEDULE_MIN  = 60;   // s after threshold met before request can fire
  const SCHEDULE_RAND = 60;   // + random 0..this
  // Each zone+type counts down on its own, so a zone that qualifies for
  // several items at once used to ask for them back to back. A new request
  // also waits until GAP_MIN..GAP_MIN+GAP_RAND s after the last one fired
  // (any zone, any type); one that comes due sooner holds until then.
  const GAP_MIN  = 240;
  const GAP_RAND = 120;
  const MAX_ACTIVE_PER_TYPE = 1; // global cap across all zones, per item type
  const FULFIL_BOOST  = 20;   // satisfaction boost to each zone building on fulfill
  const PENALTY_AFTER = 300;  // seconds before satisfaction drain starts (5 min)
  const DRAIN_RATE     = 0.05; // satisfaction/s drained from EVERY building in the zone during penalty phase
  const TOTAL_TTL      = 480;  // seconds before expiry (8 min)
  const EXPIRY_HIT     = 5;    // one-time satisfaction penalty (per building) on expiry
  // How far outside a zone's current bounds a requested amenity may still be
  // placed. The zone then grows (see ZoneSystem.expandZoneRect) to fully
  // include it — small zones often can't fit a 4×4 Cell Tower without this.
  const ZONE_ITEM_TOLERANCE = 6;

  // Edge-to-edge distance (Chebyshev-sum, same metric ZoneSystem uses for
  // its own clustering) between an item's footprint and a zone rect. 0 or
  // negative means overlapping/touching.
  function footprintDistToRect(rect, col, row, w, h) {
    const c1 = col + w - 1, r1 = row + h - 1;
    const dc = Math.max(0, rect.minC - c1, col - rect.maxC);
    const dr = Math.max(0, rect.minR - r1, row - rect.maxR);
    return dc + dr;
  }

  // ── The spot ─────────────────────────────────────────────────────
  // A request names one place for its item, the way a connection request
  // marks its A / B / C plots: a free footprint inside the zone if there is
  // one, nearest its middle so it serves the whole zone, else the nearest
  // free one within ZONE_ITEM_TOLERANCE of its edge. It is marked in the
  // city and on the world map, the build ghost snaps onto it, and that is
  // where the item goes. "Anywhere near the zone" left the player guessing
  // where it would count; a spot is known to be buildable when it is offered.
  const footprintOf = (itemType) => ({ w: EntityDefs[itemType]?.width || 1, h: EntityDefs[itemType]?.height || 1 });
  const overlaps = (a, aw, ah, b, bw, bh) =>
    a.col < b.col + bw && b.col < a.col + aw && a.row < b.row + bh && b.row < a.row + ah;

  // Buildable, and not on another open request's spot.
  function spotFree(req, spot) {
    const { w, h } = footprintOf(req.itemType);
    if (!GridManager.canPlaceFootprint(spot.col, spot.row, w, h)) return false;
    for (const o of requests) {
      if (o === req || !o.spot || o.fulfilled || o.expired) continue;
      const f = footprintOf(o.itemType);
      if (overlaps(spot, w, h, o.spot, f.w, f.h)) return false;
    }
    return true;
  }

  function pickSpot(req, rect) {
    const { w, h } = footprintOf(req.itemType);
    const tol = ZONE_ITEM_TOLERANCE;
    const cc = (rect.minC + rect.maxC + 1) / 2, cr = (rect.minR + rect.maxR + 1) / 2;
    const cands = [];
    for (let r = rect.minR - tol - h + 1; r <= rect.maxR + tol; r++)
      for (let c = rect.minC - tol - w + 1; c <= rect.maxC + tol; c++) {
        const d = footprintDistToRect(rect, c, r, w, h);
        if (d > tol) continue;
        const inside = c >= rect.minC && c + w - 1 <= rect.maxC && r >= rect.minR && r + h - 1 <= rect.maxR;
        // Inside always wins; outside, the nearer the edge the better.
        cands.push({ col: c, row: r, s: (inside ? 0 : 10000 + d * 100) + Math.hypot(c + w / 2 - cc, r + h / 2 - cr) });
      }
    cands.sort((a, b) => a.s - b.s);
    for (const s of cands) if (spotFree(req, s)) return { col: s.col, row: s.row };
    return null;
  }

  function zoneSig(rect) {
    return `${Math.round((rect.minC + rect.maxC) / 2)}:${Math.round((rect.minR + rect.maxR) / 2)}`;
  }

  function rectsOverlap(a, b) {
    return !(a.maxC < b.minC || b.maxC < a.minC || a.maxR < b.minR || b.maxR < a.minR);
  }

  function findCurrentZoneFor(req) {
    const rects = ZoneSystem.getZoneRects(req.zoneKey);
    for (let i = 0; i < rects.length; i++) {
      if (rectsOverlap(rects[i], req.anchorRect)) return { rect: rects[i], index: i };
    }
    return null;
  }

  // Does this zone already have one of `itemType`?
  //
  // Measured with the SAME metric hasActiveRequestAt uses to decide where the
  // item may be placed: the item's full footprint against the rect, plus
  // ZONE_ITEM_TOLERANCE. The two were asymmetric, and that asymmetry is how a
  // zone ended up with two Cell Towers. Placement allows a tower up to
  // ZONE_ITEM_TOLERANCE tiles outside the rect (the zone then grows to
  // swallow it), but this check only counted a tower whose ANCHOR TILE sat
  // strictly inside the rect — so a 4×4 tower placed in the tolerance band,
  // or one straddling the edge with its top-left corner just outside, was
  // invisible here. The zone read as empty and scheduled a second request.
  //
  // O(items-of-type), not O(rect-area): getByType returns a short list (a
  // handful of celltowers), far cheaper than sweeping every cell each tick.
  function itemInRect(itemType, rect) {
    const w = EntityDefs[itemType]?.width  || 1;
    const h = EntityDefs[itemType]?.height || 1;
    const list = (EntityRegistry.getByType && EntityRegistry.getByType(itemType)) || [];
    for (const e of list) {
      if (!e) continue;
      if (footprintDistToRect(rect, e.col, e.row, w, h) <= ZONE_ITEM_TOLERANCE) return true;
    }
    return false;
  }

  function zoneKeyForEntity(e) {
    if (e.isIndustrial || e.type === T.INDUSTRIAL) return 'industrial';
    if (e.type === T.COMMERCIAL) return 'commercial';
    if (e.type === T.HOUSE || e.type === T.CABIN) return 'residential';
    return null;
  }

  function buildingsInZone(rect, zoneKey) {
    let n = 0;
    for (let r = rect.minR; r <= rect.maxR; r++)
      for (let c = rect.minC; c <= rect.maxC; c++) {
        const e = GridManager.getEntity(c, r);
        if (!e || e.col !== c || e.row !== r || !e.fromRequest) continue;
        if (zoneKeyForEntity(e) === zoneKey) n++;
      }
    return n;
  }

  function activeRequestForZone(zoneKey, rect, itemType) {
    return requests.find(r =>
      r.zoneKey === zoneKey &&
      r.itemType === itemType &&
      !r.fulfilled && !r.expired &&
      rectsOverlap(r.anchorRect, rect)
    );
  }

  function isUnlocked(itemType) {
    if (typeof Progression === 'undefined' || !Progression.isUnlocked) return true;
    return Progression.isUnlocked(itemType);
  }

  // Builds a label matching ZoneSystem's own on-map/panel numbering, e.g.
  // "Residential Zone 2" — only appends a number when there's more than
  // one zone of that key, same rule ZoneSystem.render/buildZonePanel use.
  function zoneDisplayLabel(zoneKey, index, total) {
    const name = zoneKey.charAt(0).toUpperCase() + zoneKey.slice(1);
    return (total > 1 && index >= 0) ? `${name} Zone ${index + 1}` : `${name} Zone`;
  }

  // Throttle the expensive zone-scan portion. The countdown to fire is
  // 60-120s, so checking eligibility 0.5x/sec is plenty — running it
  // every frame at 60fps was scanning ROWS*COLS per zone per tick and
  // freezing the game for several seconds as cities grew.
  let _scanAccum = 0;
  // Seconds left before another request may fire (see GAP_MIN).
  let _gapLeft = 0;
  const SCAN_INTERVAL = 2.0; // seconds between heavy scans

  // ── Notification cards ────────────────────────────────────
  //
  // Zone requests used to speak only in toasts, which scroll away: a request
  // that lasts eight minutes had no standing reminder anywhere, so the only
  // way to find out one was open was to notice the satisfaction drain. They
  // now carry a card for their whole life, the same as amenity requests, and
  // escalate the same way when ignored.
  const VISUALS = {
    [T.FIBERHUB]:  { icon: '🌐', color: '#40ffcc', border: '#106040' },
    [T.EVCHARGER]: { icon: '⚡', color: '#40ff80', border: '#106030' },
    _default:      { icon: '📡', color: '#40c0ff', border: '#103060' },
  };
  function visualFor(itemType) { return VISUALS[itemType] || VISUALS._default; }

  // Recomputed at click time rather than captured: a zone can be extended or
  // redrawn while its request stands, and a jump to where it used to be is
  // worse than no jump at all.
  function jumpToZone(req) {
    return () => {
      // Zones are in the player's own city: from a contract site, go home
      // first (a no-op when already there), then look the zone up. The
      // camera goes to the marked spot, or the zone's middle without one.
      if (typeof ContractSystem !== 'undefined') ContractSystem.returnHome();
      if (req.spot) {
        const { w, h } = footprintOf(req.itemType);
        Camera.recentreOn((req.spot.col + w / 2) * TILE, (req.spot.row + h / 2) * TILE);
      } else {
        const z = findCurrentZoneFor(req);
        if (!z) return;
        const r = z.rect;
        Camera.recentreOn(((r.minC + r.maxC + 1) / 2) * TILE,
                          ((r.minR + r.maxR + 1) / 2) * TILE);
      }
      try { SFX.click?.(); } catch (_e) {}
    };
  }

  // `urgent` is the ignored-request escalation: it replaces the standing card
  // rather than adding a second one for the same request.
  function pushRequestNotif(req, zoneLabel, urgent) {
    const itemLabel = EntityDefs[req.itemType]?.label || req.itemType;
    const v = visualFor(req.itemType);
    if (req.notifId) NotificationStack.dismiss(req.notifId);
    req.notifId = NotificationStack.push({
      icon:    urgent ? '⚠' : v.icon,
      title:   urgent ? `${zoneLabel} is still waiting` : zoneLabel,
      message: urgent
        ? `No ${itemLabel} yet: satisfaction is dropping across the zone. Click to jump to its spot`
        : `Wants a ${itemLabel} on the marked spot: click to jump there`,
      color:   urgent ? '#ff8040' : v.color,
      border:  urgent ? '#804020' : v.border,
      onClick: jumpToZone(req),
      glow:    true,
    });
  }

  function clearRequestNotif(req) {
    if (req.notifId) NotificationStack.dismiss(req.notifId);
    req.notifId = null;
  }

  return {
    tick(dt) {
      // ── Existing requests: tick every frame (cheap) ───────────
      for (let i = requests.length - 1; i >= 0; i--) {
        const req = requests[i];
        if (req.fulfilled || req.expired) { requests.splice(i, 1); continue; }

        const z = findCurrentZoneFor(req);
        if (!z) { requests.splice(i, 1); continue; } // zone disappeared

        if (itemInRect(req.itemType, z.rect)) {
          req.fulfilled = true;
          clearRequestNotif(req);
          requests.splice(i, 1);
          continue;
        }

        // The spot has to stay buildable and within reach of the zone. If
        // something now stands on it, or the zone has moved away from it,
        // it is dropped here and the next scan finds another.
        if (req.spot) {
          const { w, h } = footprintOf(req.itemType);
          if (footprintDistToRect(z.rect, req.spot.col, req.spot.row, w, h) > ZONE_ITEM_TOLERANCE
              || !spotFree(req, req.spot)) req.spot = null;
        }

        req.timer += dt;

        // Ignored-request penalty — every building in the zone slowly loses
        // satisfaction the longer the request goes unanswered, same shape as
        // AmenityRequestSystem's per-building penalty/expiry.
        if (req.timer >= PENALTY_AFTER && !req.penaltyActive) {
          req.penaltyActive = true;
          const rects = ZoneSystem.getZoneRects(req.zoneKey);
          pushRequestNotif(req, zoneDisplayLabel(req.zoneKey, z.index, rects.length), true);
        }
        if (req.penaltyActive) {
          const r = z.rect;
          for (let rr = r.minR; rr <= r.maxR; rr++)
            for (let cc = r.minC; cc <= r.maxC; cc++) {
              const e = GridManager.getEntity(cc, rr);
              if (!e || e.col !== cc || e.row !== rr || !e.fromRequest) continue;
              if (typeof e.satisfaction === 'number')
                e.satisfaction = Math.max(0, e.satisfaction - DRAIN_RATE * dt);
              e._reqDrain = { what: `a ${EntityDefs[req.itemType]?.label || req.itemType} in the zone`, left: 3 };  // read by SatisfactionSystem's cause list
            }
        }
        if (req.timer >= TOTAL_TTL) {
          req.expired = true;
          const r = z.rect;
          for (let rr = r.minR; rr <= r.maxR; rr++)
            for (let cc = r.minC; cc <= r.maxC; cc++) {
              const e = GridManager.getEntity(cc, rr);
              if (!e || e.col !== cc || e.row !== rr || !e.fromRequest) continue;
              if (typeof e.satisfaction === 'number')
                e.satisfaction = Math.max(0, e.satisfaction - EXPIRY_HIT);
            }
          clearRequestNotif(req);
          requests.splice(i, 1);
        }
      }

      // ── Heavy zone-eligibility scan: throttled ─────────────────
      _scanAccum += dt;
      if (_scanAccum < SCAN_INTERVAL) return;
      const scanDt = _scanAccum;
      _scanAccum = 0;
      _gapLeft = Math.max(0, _gapLeft - scanDt);

      // A request without a spot (its old one was built over, or it was
      // loaded from a save made before spots) gets one.
      for (const req of requests) {
        if (req.spot || req.fulfilled || req.expired) continue;
        const z = findCurrentZoneFor(req);
        if (z) req.spot = pickSpot(req, z.rect);
      }

      for (const zoneKey of ZONE_KEYS) {
        const rects = ZoneSystem.getZoneRects(zoneKey);
        for (const rect of rects) {
          const zoneIdx = rects.indexOf(rect);
          for (const itemType of REQUESTABLE) {
            // Don't fire a request for an item the player hasn't unlocked yet.
            if (!isUnlocked(itemType)) continue;

            // Some items only certain zone kinds ask for (e.g. EV chargers
            // are residential-only).
            const allowedKeys = ZONE_KEYS_FOR_TYPE[itemType] || ZONE_KEYS;
            if (!allowedKeys.includes(zoneKey)) continue;

            // Already have one in the zone → auto-fulfill any active req
            if (itemInRect(itemType, rect)) {
              const existing = activeRequestForZone(zoneKey, rect, itemType);
              if (existing) existing.fulfilled = true;
              continue;
            }

            // Already an active request for this zone+type
            if (activeRequestForZone(zoneKey, rect, itemType)) continue;

            // Not enough buildings yet
            const minB = MIN_BUILDINGS_FOR_TYPE[itemType] ?? (MIN_BUILDINGS[zoneKey] || 999);
            if (buildingsInZone(rect, zoneKey) < minB) continue;

            // Global cap per type
            const activeOfType = requests.filter(r =>
              !r.fulfilled && !r.expired && r.itemType === itemType
            ).length;
            if (activeOfType >= MAX_ACTIVE_PER_TYPE) continue;

            // Countdown to first fire — advance by scanDt since we
            // only get here every SCAN_INTERVAL seconds.
            const sig = `${zoneKey}:${zoneSig(rect)}:${itemType}`;
            let s = scheduled.get(sig);
            if (s === undefined) {
              s = SCHEDULE_MIN + Math.random() * SCHEDULE_RAND;
              scheduled.set(sig, s);
            }
            s -= scanDt;
            if (s > 0) { scheduled.set(sig, s); continue; }
            // Due, but too soon after the last request: hold until the gap is up.
            if (_gapLeft > 0) { scheduled.set(sig, 0); continue; }

            // Fire, at a spot it can actually be built on. A zone boxed in
            // on every side asks again in a while rather than ask for
            // something there is nowhere to put.
            const req = {
              zoneKey,
              anchorRect: { minC: rect.minC, maxC: rect.maxC, minR: rect.minR, maxR: rect.maxR },
              itemType,
              timer: 0,
              fulfilled: false,
              expired: false,
            };
            req.spot = pickSpot(req, rect);
            if (!req.spot) { scheduled.set(sig, 60); continue; }
            scheduled.delete(sig);
            requests.push(req);
            _gapLeft = GAP_MIN + Math.random() * GAP_RAND;
            try { SFX.amenityRequest?.(); } catch (_e) {}
            pushRequestNotif(requests[requests.length - 1],
                             zoneDisplayLabel(zoneKey, zoneIdx, rects.length), false);
          }
        }
      }
    },

    // Called by the placement code whenever an entity is placed. If the
    // placed entity matches an active request and lies inside that zone's
    // rect, the request is fulfilled and each building in the zone gets a
    // satisfaction bump.
    onItemPlaced(type, col, row, entity) {
      if (!REQUESTABLE.includes(type)) return;
      const w = EntityDefs[type]?.width  || 1;
      const h = EntityDefs[type]?.height || 1;
      for (let i = requests.length - 1; i >= 0; i--) {
        const req = requests[i];
        if (req.fulfilled || req.expired) continue;
        if (req.itemType !== type) continue;
        const z = findCurrentZoneFor(req);
        if (!z) continue;
        if (footprintDistToRect(z.rect, col, row, w, h) > ZONE_ITEM_TOLERANCE) continue;

        // Grow the zone to fully include the amenity's footprint — it may
        // have landed just outside the zone's previous bounds. z.rect is
        // the same object stored in ZoneSystem's rects array, so this
        // mutates it in place; no need to re-fetch below.
        ZoneSystem.expandZoneRect(req.zoneKey, z.index, col, row, w, h);
        // Which zone it belongs to, so every later rebuild of the zone from
        // its buildings takes it in again (ZoneSystem.computeZonesForType).
        if (entity) entity._zoneKey = req.zoneKey;

        req.fulfilled = true;
        const r = z.rect;
        for (let rr = r.minR; rr <= r.maxR; rr++)
          for (let cc = r.minC; cc <= r.maxC; cc++) {
            const e = GridManager.getEntity(cc, rr);
            if (!e || e.col !== cc || e.row !== rr || !e.fromRequest) continue;
            if (typeof e.satisfaction === 'number')
              e.satisfaction = Math.min(100, e.satisfaction + FULFIL_BOOST);
          }
        clearRequestNotif(req);
        requests.splice(i, 1);
        return;
      }
    },

    // For placement gate: is there an active zone request for this type
    // that covers the given tile? Checks the item's full footprint against
    // the zone with ZONE_ITEM_TOLERANCE slack, rather than requiring the
    // anchor tile to already sit inside the zone's (possibly tiny) bounds —
    // otherwise a zone too small to fit the item could never fulfill its
    // own request. The zone itself grows on actual placement (onItemPlaced).
    hasActiveRequestAt(itemType, col, row) {
      const w = EntityDefs[itemType]?.width  || 1;
      const h = EntityDefs[itemType]?.height || 1;
      for (const req of requests) {
        if (req.fulfilled || req.expired) continue;
        if (req.itemType !== itemType) continue;
        const z = findCurrentZoneFor(req);
        if (!z) continue;
        if (footprintDistToRect(z.rect, col, row, w, h) <= ZONE_ITEM_TOLERANCE) return true;
      }
      return false;
    },

    // Hard one-per-zone guard for placement. hasActiveRequestAt alone is not
    // sufficient: it answers "is there an active request whose zone is within
    // tolerance of this tile", and the tolerance bands of two nearby zones can
    // overlap — so a request open for zone B authorised a tile that also sits
    // inside zone A, which already had its tower. This asks the question that
    // actually matters: would this placement join a zone that already has one?
    zoneAlreadyHasItem(itemType, col, row) {
      const w = EntityDefs[itemType]?.width  || 1;
      const h = EntityDefs[itemType]?.height || 1;
      for (const zoneKey of ZONE_KEYS) {
        for (const rect of (ZoneSystem.getZoneRects(zoneKey) || [])) {
          if (footprintDistToRect(rect, col, row, w, h) > ZONE_ITEM_TOLERANCE) continue;
          if (itemInRect(itemType, rect)) return true;
        }
      }
      return false;
    },

    // Where an item put down at (col, row) would actually be built for a
    // request, or null if it answers none: an open request's marked spot when
    // the footprint overlaps it (placement snaps onto it), or, for a request
    // that has no spot right now, anywhere within reach of its zone.
    placementFor(itemType, col, row) {
      const { w, h } = footprintOf(itemType);
      let loose = null;
      for (const req of requests) {
        if (req.fulfilled || req.expired || req.itemType !== itemType) continue;
        if (req.spot) {
          if (overlaps({ col, row }, w, h, req.spot, w, h)) return { col: req.spot.col, row: req.spot.row };
          continue;
        }
        const z = findCurrentZoneFor(req);
        if (z && footprintDistToRect(z.rect, col, row, w, h) <= ZONE_ITEM_TOLERANCE) loose = { col, row };
      }
      return loose;
    },

    // The zone with an open request for this item, for "build it on the
    // marked spot in ..." messages. Null when there is none.
    openZoneLabel(itemType) {
      for (const req of requests) {
        if (req.fulfilled || req.expired || req.itemType !== itemType) continue;
        const z = findCurrentZoneFor(req);
        if (z) return zoneDisplayLabel(req.zoneKey, z.index, ZoneSystem.getZoneRects(req.zoneKey).length);
      }
      return null;
    },

    // Every open request, for the city view and the world map to mark:
    // its item, footprint, spot (or null), zone rect and label, and
    // whether it has started costing satisfaction.
    markers() {
      const out = [];
      for (const req of requests) {
        if (req.fulfilled || req.expired) continue;
        const z = findCurrentZoneFor(req);
        if (!z) continue;
        const { w, h } = footprintOf(req.itemType);
        out.push({ itemType: req.itemType, spot: req.spot || null, w, h, rect: z.rect, urgent: !!req.penaltyActive,
                   zoneLabel: zoneDisplayLabel(req.zoneKey, z.index, ZoneSystem.getZoneRects(req.zoneKey).length),
                   color: visualFor(req.itemType).color, icon: visualFor(req.itemType).icon });
      }
      return out;
    },
    ZONE_ITEM_TOLERANCE,
    REQUESTABLE,
    zoneKeysFor: (itemType) => ZONE_KEYS_FOR_TYPE[itemType] || ZONE_KEYS,

    // For the zone panel: which requests are active in this specific zone?
    getActiveForZone(zoneKey, rect) {
      return requests.filter(r =>
        r.zoneKey === zoneKey &&
        !r.fulfilled && !r.expired &&
        rectsOverlap(r.anchorRect, rect)
      );
    },

    // ── Persistence ────────────────────────────────────────────────
    serialize() {
      return {
        requests: requests.map(r => ({
          zoneKey: r.zoneKey,
          anchorRect: { ...r.anchorRect },
          itemType: r.itemType,
          timer: r.timer,
          fulfilled: r.fulfilled,
          expired: r.expired,
          penaltyActive: r.penaltyActive,
          spot: r.spot ? { col: r.spot.col, row: r.spot.row } : null,
        })),
        scheduled: Array.from(scheduled.entries()),
        gapLeft: _gapLeft,
      };
    },
    loadState(data) {
      if (!data) return;
      requests.length = 0;
      if (Array.isArray(data.requests)) {
        for (const r of data.requests) {
          const req = { ...r, anchorRect: { ...r.anchorRect }, spot: r.spot ? { ...r.spot } : null, notifId: null };
          requests.push(req);
          // Rebuild the card. Ids do not survive a save, so without this a
          // request loaded mid-life would run out its remaining minutes with
          // nothing on screen to say it existed — and would then drain
          // satisfaction unexplained. A request already past its escalation
          // comes back as the urgent card, which is what it had earned.
          if (req.fulfilled || req.expired) continue;
          const z = findCurrentZoneFor(req);
          if (!z) continue;
          const rects = ZoneSystem.getZoneRects(req.zoneKey);
          pushRequestNotif(req, zoneDisplayLabel(req.zoneKey, z.index, rects.length),
                           !!req.penaltyActive);
        }
      }
      scheduled.clear();
      if (Array.isArray(data.scheduled)) {
        for (const [k, v] of data.scheduled) scheduled.set(k, v);
      }
      _gapLeft = +data.gapLeft || 0;                 // older saves have none
    },
    reset() {
      for (const req of requests) clearRequestNotif(req);
      requests.length = 0;
      scheduled.clear();
      _gapLeft = 0;
    },
  };
})();
