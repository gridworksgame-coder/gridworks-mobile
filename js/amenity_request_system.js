/* ═══════════════════════════════════════════════════════════════════
   AMENITY REQUEST SYSTEM
   Street lamp / security camera amenity request lifecycle.
   (EV Charging Stations are zone-requested — see ZoneRequestSystem.)
   ═══════════════════════════════════════════════════════════════════ */

const AmenityRequestSystem = (() => {
  // Active requests: { entity, timer, penaltyActive, fulfilled, expired }
  const requests = [];
  const REQUESTABLE = [T.LAMP, T.CAMERA];

  let lastRequestFiredAt = 0;  // elapsed seconds since last amenity request fired
  let elapsedTime = 0;          // total elapsed game time
  let totalFulfilled = 0;       // total amenity requests fulfilled

  function isAnyRequestableUnlocked() {
    return REQUESTABLE.some(t => Progression.isUnlocked(t));
  }

  function pickRequestType(entity) {
    const isComInd = entity && (entity.type === T.COMMERCIAL || entity.isIndustrial || entity.type === T.INDUSTRIAL);
    const available = REQUESTABLE.filter(t => Progression.isUnlocked(t));
    if (!available.length) return null;
    // Commercial/industrial buildings request cameras much more often;
    // residential keeps the original 2x camera weighting.
    const cameraWeight = isComInd ? 6 : 2;
    const pool = [];
    for (const t of available) {
      pool.push(t);
      if (t === T.CAMERA) for (let i = 1; i < cameraWeight; i++) pool.push(t);
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Wording for the notification cards, keyed by what was actually asked for.
  function amenityLabel(type) {
    return type === T.CAMERA ? 'security camera' : 'street lamp';
  }
  const TOTAL_TTL      = 480;  // seconds before expiry (8 min)
  const PENALTY_AFTER  = 300;  // seconds before satisfaction drain starts (5 min)
  const DRAIN_RATE     = 0.15; // satisfaction/s during penalty phase
  const FULFIL_BOOST   = 15;   // satisfaction on fulfillment
  const EXPIRY_HIT     = 5;    // one-time satisfaction penalty on expiry
  const FULFIL_RADIUS  = 3;    // tiles from any footprint edge
  const MAX_ACTIVE     = 1;    // max 1 active amenity request at a time
  const MIN_GLOBAL_GAP = 444;  // minimum ~7.4 min between any two requests firing (46% slower)
  const GAP_SCALE_PER_CUSTOMER = 60; // each customer building beyond the first 5 stretches the global gap by this many seconds, so requests don't bunch up as the city grows

  // Min distance from any tile of a w×h footprint at (col,row) to any tile of
  // entity e. Multi-tile amenities count as near a house when any part of
  // them is, not just their top-left anchor tile.
  function distFootprintToEntity(col, row, w, h, e) {
    let minD = Infinity;
    for (let dr = 0; dr < h; dr++)
      for (let dc = 0; dc < w; dc++)
        minD = Math.min(minD, distToEntity(col + dc, row + dr, e));
    return minD;
  }

  function distToEntity(col, row, e) {
    // Min distance from (col,row) to any tile of entity footprint
    const ew = e.width  || 1, eh = e.height || 1;
    let minD = Infinity;
    for (let dr = 0; dr < eh; dr++)
      for (let dc = 0; dc < ew; dc++)
        minD = Math.min(minD, Math.sqrt((col - (e.col+dc))**2 + (row - (e.row+dr))**2));
    return minD;
  }

  return {
    // Called after a customer entity is placed — schedule their amenity request
    scheduleRequest(entity) {
      if (entity._amenityRequested) return;
      if (!isAnyRequestableUnlocked()) {
        entity._amenityRequested = undefined;
        return;
      }
      entity._amenityRequested = false;
      entity._amenityDelay = 1480 + Math.random() * 1480;  // ~25–49 min before first request (46% slower)
      // NOTE: _amenityType is deliberately NOT set here. It's chosen when the
      // request actually fires (see tick()) so that it reflects whatever
      // amenity types are unlocked AT THAT TIME, not whatever was unlocked
      // when this building was first placed. Otherwise buildings placed
      // before a later amenity unlock (e.g. camera) get permanently locked
      // into requesting only the earlier-unlocked type.
    },

    tick(dt) {
      // Pause guard: when the game is paused dt is 0, so don't advance
      // delays, drain satisfaction, expire requests, or fire new ones.
      if (dt <= 0) return;
      elapsedTime += dt;
      // Age scheduled requests — also retry scheduling for properties placed before lamp unlocked
      // (was a full ROWS×COLS grid scan every tick — swapped to EntityRegistry
      // so cost scales with # of customer buildings, not map size)
      const lampUnlocked = isAnyRequestableUnlocked();
      let customerCount = 0;
      for (const custType of CUSTOMER_TYPES) customerCount += EntityRegistry.getByType(custType).size;
      const minGlobalGap = MIN_GLOBAL_GAP + Math.max(0, customerCount - 5) * GAP_SCALE_PER_CUSTOMER;
      for (const custType of CUSTOMER_TYPES) {
        for (const e of EntityRegistry.getByType(custType)) {
          if (e._amenityDone) continue;

          if (e._amenityRequested === undefined && lampUnlocked) {
            e._amenityRequested = false;
            e._amenityDelay = 1480 + Math.random() * 1480;
            // _amenityType intentionally left unset — chosen at fire time below
          }

          // Re-queue if request fired but was lost on reload
          if (e._amenityRequested === true && !e._amenityDone) {
            // Stale saves may still have a per-property EV charger ask —
            // those moved to ZoneRequestSystem; drop them so they don't
            // resurrect as amenity pins.
            if (e._amenityType === T.EVCHARGER) {
              e._amenityDone = true;
              continue;
            }
            const alreadyQueued = requests.some(r => r.entity === e);
            if (!alreadyQueued) {
              const reqType = e._amenityType || T.LAMP;
              requests.push({
                entity: e,
                amenityType: reqType,
                timer: 0,
                penaltyActive: false,
                fulfilled: false,
                expired: false,
              });
            }
          }

          if (e._amenityRequested !== false) continue;

          e._amenityDelay -= dt;
          if (e._amenityDelay <= 0) {
            // Enforce global cap and minimum gap between requests
            const activeCount = requests.filter(r => !r.fulfilled && !r.expired).length;
            if (activeCount >= MAX_ACTIVE) { e._amenityDelay = 60; continue; }
            if (elapsedTime - lastRequestFiredAt < minGlobalGap) { e._amenityDelay = 30; continue; }
            lastRequestFiredAt = elapsedTime;
            e._amenityRequested = true;
            // Check if qualifying amenity already exists nearby
            const reqType = pickRequestType(e) || T.LAMP;
            e._amenityType = reqType;
            // Was a full ROWS×COLS scan — reqType is always T.LAMP or T.CAMERA,
            // so EntityRegistry.getByType gives us just those few candidates.
            let alreadyFulfilled = false;
            for (const nb of EntityRegistry.getByType(reqType)) {
              if (distFootprintToEntity(nb.col, nb.row, nb.width || 1, nb.height || 1, e) <= FULFIL_RADIUS) { alreadyFulfilled = true; break; }
            }
            if (alreadyFulfilled) {
              e._amenityDone = true;
              e.satisfaction = Math.min(100, e.satisfaction + FULFIL_BOOST);
            } else {
              requests.push({
                entity: e,
                amenityType: reqType,
                timer: 0,
                penaltyActive: false,
                fulfilled: false,
                expired: false,
              });
              const name      = e.businessName || e.def?.label || 'A resident';
              const amenLabel = amenityLabel(reqType);
              const _jumpToEntity = () => {
                // The building is in the player's own city: from a contract
                // site, go home first (a no-op when already there).
                if (typeof ContractSystem !== 'undefined') ContractSystem.returnHome();
                const wx = (e.col + (e.width  || 1) * 0.5) * TILE;
                const wy = (e.row + (e.height || 1) * 0.5) * TILE;
                Camera.recentreOn(wx, wy);
                SFX.click();
              };
              try { SFX.amenityRequest?.(); } catch (_e) {}
              const _newReq = requests[requests.length - 1];
              _newReq.jumpToEntity = _jumpToEntity;
              _newReq.notifId = NotificationStack.push({
                icon: reqType === T.CAMERA ? '📷' : '💡',
                title: name,
                message: `Wants a ${amenLabel} nearby; click to jump there`,
                color: '#f0c040',
                border: '#604010',
                onClick: _jumpToEntity,
                glow: true,
              });
            }
          }
        }
      }

      // Tick active requests
      for (let i = requests.length - 1; i >= 0; i--) {
        const req = requests[i];
        if (req.fulfilled || req.expired) { requests.splice(i, 1); continue; }

        // Check if entity was removed
        const still = GridManager.getEntity(req.entity.col, req.entity.row);
        if (!still || still !== req.entity) { requests.splice(i, 1); continue; }

        req.timer += dt;

        // Penalty phase. The polite card is replaced rather than added to:
        // two cards for one request reads as two problems, and the first one
        // has stopped being true — the ask is no longer "would be nice", it
        // is actively costing satisfaction. Dismissing an id the player
        // already closed is a no-op, so an escalation still gets a card even
        // if they waved the first one away, which is the point of escalating.
        if (req.timer >= PENALTY_AFTER && !req.penaltyActive) {
          req.penaltyActive = true;
          const _name = req.entity.businessName || req.entity.def?.label || 'A resident';
          const _ign  = amenityLabel(req.amenityType);
          if (req.notifId) NotificationStack.dismiss(req.notifId);
          req.notifId = NotificationStack.push({
            icon: '⚠',
            title: `${_name} is still waiting`,
            message: `No ${_ign} yet: satisfaction is dropping. Click to jump there`,
            color: '#ff8040',
            border: '#804020',
            onClick: req.jumpToEntity,
            glow: true,
          });
        }
        if (req.penaltyActive) {
          req.entity.satisfaction = Math.max(0, req.entity.satisfaction - DRAIN_RATE * dt);
          req.entity._reqDrain = { what: `a ${amenityLabel(req.amenityType)}`, left: 3 };  // read by SatisfactionSystem's cause list
        }

        // Expiry
        if (req.timer >= TOTAL_TTL) {
          req.expired = true;
          req.entity.satisfaction = Math.max(0, req.entity.satisfaction - EXPIRY_HIT);
          req.entity._amenityDone = true;
          if (req.notifId) NotificationStack.dismiss(req.notifId);
          requests.splice(i, 1);
        }
      }
    },

    // Called when any amenity is placed — check if it fulfils a nearby request
    onAmenityPlaced(type, col, row, w = 1, h = 1) {
      if (!REQUESTABLE.includes(type)) return;
      for (let i = requests.length - 1; i >= 0; i--) {
        const req = requests[i];
        if (req.fulfilled || req.expired) continue;
        if (req.amenityType !== type) continue;
        if (distFootprintToEntity(col, row, w, h, req.entity) <= FULFIL_RADIUS) {
          req.fulfilled = true;
          req.entity._amenityDone = true;
          totalFulfilled++;
          req.entity.satisfaction = Math.min(100, req.entity.satisfaction + FULFIL_BOOST);
          if (req.notifId) NotificationStack.dismiss(req.notifId);
          requests.splice(i, 1);
        }
      }
    },

    // For placement gate: is there an active amenity request of this type
    // whose fulfillment radius covers the given tile? Mirrors
    // ZoneRequestSystem.hasActiveRequestAt (see zone_requests.js) — same
    // idea, but distance-based (FULFIL_RADIUS from the requesting entity)
    // rather than zone-rect-based.
    hasActiveRequestAt(type, col, row, w = 1, h = 1) {
      for (const req of requests) {
        if (req.fulfilled || req.expired) continue;
        if (req.amenityType !== type) continue;
        if (distFootprintToEntity(col, row, w, h, req.entity) <= FULFIL_RADIUS) return true;
      }
      return false;
    },

    // Returns active requests for canvas rendering
    getActive() { return requests; },
    // How far (tiles, from the footprint) a placed amenity still counts.
    FULFIL_RADIUS,
    getTotalFulfilled() { return totalFulfilled; },
    setTotalFulfilled(n) { totalFulfilled = n; },

    // Persist/restore
    serialize(entity) {
      return {
        _amenityRequested: entity._amenityRequested,
        _amenityDelay:     entity._amenityDelay,
        _amenityDone:      entity._amenityDone,
        _amenityType:      entity._amenityType,
      };
    },
    restore(entity, data) {
      if (data._amenityRequested !== undefined) entity._amenityRequested = data._amenityRequested;
      if (data._amenityDelay     !== undefined) entity._amenityDelay     = data._amenityDelay;
      if (data._amenityDone      !== undefined) entity._amenityDone      = data._amenityDone;
      if (data._amenityType      !== undefined) entity._amenityType      = data._amenityType;
      // Legacy per-property EV flags from older saves are ignored — chargers
      // are zone-requested now (ZoneRequestSystem).
    },
  };
})();

// Amenities the player can only build because a customer or a zone asked for
// one (see the "only when requested" gates in InputManager.tryPlace). Once
// built they belong to whoever asked: removing one would pocket the refund
// and keep the satisfaction it earned, and moving one would carry it out of
// range of the request it answered. Every removal and relocation path checks
// here. Job sites are exempt for the same reason they're exempt from the
// placement gate — that work is the contract's, not a resident's.
const REQUESTED_AMENITY_TYPES = new Set([T.LAMP, T.CAMERA, T.CELLTOWER, T.FIBERHUB, T.EVCHARGER]);

function requestedAmenityLocked(e) {
  if (!e || !REQUESTED_AMENITY_TYPES.has(e.type)) return false;
  if (typeof ContractSystem !== 'undefined' && ContractSystem.isAway()) return false;
  return true;
}

function requestedAmenityLockedToast(e, verb = 'removed') {
  const label = e.def?.label || EntityDefs[e.type]?.label || 'This amenity';
  showToast(`⚠ ${label} was requested by your customers; it can't be ${verb}`, '#ff6040', '#140800', '#602010');
}

// Multi-wire repair selection
