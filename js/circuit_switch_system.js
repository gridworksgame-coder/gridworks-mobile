/* ═══════════════════════════════════════════════════════════════════
   CIRCUIT SWITCH SYSTEM
   Manual load shedding. A Circuit Switch holds a roster of buildings on
   its own power network; opening it cuts those buildings and — crucially
   — removes their draw from the network's demand, so the rest of the grid
   stays up.

   Why a roster rather than wire topology: a switch that isolated whatever
   sat "downstream" of it would do nothing on a meshed grid (power simply
   arrives the other way), and it would only protect a city replanned
   around it. A roster is unambiguous, and it can be dropped into a grid
   that is already built.

   The switch deliberately draws NO power and is operable while dark. A
   breaker that needs the grid up in order to be thrown is useless during
   the exact event it exists for.
   ═══════════════════════════════════════════════════════════════════ */

const CircuitSwitchSystem = (() => {
  // Peak watts one switch may carry. Sized against the real customer
  // spread (median 39 kW, mean ~50 kW, largest single load 180 kW). Raised from
  // 200 kW: a switch now covers a neighbourhood of roughly ten typical
  // buildings, or a couple of the heaviest plants, so a large city needs a
  // handful rather than dozens. Keep entity_defs' switchCapacity in step.
  // This is the MK1's fallback only — capacityOf() below reads each
  // switch's own def.switchCapacity first, which is how the MK2 gets its
  // bigger 1.4 MW roster.
  const CAPACITY_W = 500;

  // Both switch types share every rule here — only their footprint and
  // switchCapacity differ (see entity_defs.js), same pattern as
  // CoolingTowerSystem.TOWER_TYPES for the two cooling tower tiers.
  const SWITCH_TYPES = [T.CIRCUITSWITCH, T.CIRCUITSWITCH2];
  const isSwitchType = (type) => type === T.CIRCUITSWITCH || type === T.CIRCUITSWITCH2;
  const allSwitches = () => SWITCH_TYPES.flatMap(t => [...EntityRegistry.getByType(t)]);
  function capacityOf(sw) { return (sw.def && sw.def.switchCapacity) || CAPACITY_W; }

  // Entities currently cut by an open switch. Rebuilt by refresh() rather
  // than recomputed per entity per tick: PowerNetwork asks about this once
  // for every consumer, every tick, and a reverse scan there would be the
  // hottest lookup in the sim.
  let _shed = new Set();

  const key = (c, r) => `${c},${r}`;

  // ── Load figures ──────────────────────────────────────────────────
  // Peak is the rating a roster is checked against (it's a breaker limit).
  // Live is what the building is actually drawing right now, which is the
  // number that matters in an emergency — a roster holding 190 kW of peak
  // may only be shedding 70 kW at 3am.
  function peakDrawOf(e) {
    if (!e) return 0;
    if (e.peakDraw != null) return e.peakDraw;
    return (e.def && e.def.powerInput) || 0;
  }
  function liveDrawOf(e) {
    if (!e) return 0;
    if (e._liveDemand != null) return e._liveDemand;
    return e.powered ? peakDrawOf(e) : 0;
  }

  // ── Roster ────────────────────────────────────────────────────────
  // Members are stored as coordinates, not object references: references
  // do not survive a save/load round trip.
  function memberCoords(sw) {
    if (!sw._members) sw._members = [];
    return sw._members;
  }
  function members(sw) {
    const out = [];
    for (const m of memberCoords(sw)) {
      const e = GridManager.getEntity(m.c, m.r);
      // Only the anchor tile counts, so a building is never listed twice.
      if (e && e.col === m.c && e.row === m.r) out.push(e);
    }
    return out;
  }
  function assignedPeak(sw)  { return members(sw).reduce((a, e) => a + peakDrawOf(e), 0); }
  function assignedLive(sw)  { return members(sw).reduce((a, e) => a + liveDrawOf(e), 0); }
  function isMember(sw, e)   { return memberCoords(sw).some(m => m.c === e.col && m.r === e.row); }

  // Which switch, if any, already owns this building. One switch per
  // building: two owners with opposing states has no sensible answer.
  function ownerOf(e) {
    for (const sw of allSwitches()) {
      if (isMember(sw, e)) return sw;
    }
    return null;
  }

  // Why a building can't go on this switch — null when it can.
  function rejectReason(sw, e) {
    if (!e || !e.def) return 'Not a building';
    if (isSwitchType(e.type)) return 'A switch cannot switch itself';
    if (peakDrawOf(e) <= 0) return 'Draws no power: nothing to shed';
    if (isMember(sw, e)) return null;
    if (ownerOf(e)) return 'Already on another circuit';
    // Same network as the switch: the roster is a control list, not a
    // remote for the far side of the map.
    if (sw.networkId == null || e.networkId == null || sw.networkId !== e.networkId)
      return 'Not on this switch’s power network';
    const cap = capacityOf(sw);
    if (assignedPeak(sw) + peakDrawOf(e) > cap)
      return `Over capacity: ${formatPower(cap)} peak max`;
    return null;
  }
  function canAdd(sw, e) { return rejectReason(sw, e) === null; }

  function toggleMember(sw, e) {
    if (isMember(sw, e)) {
      sw._members = memberCoords(sw).filter(m => !(m.c === e.col && m.r === e.row));
      refresh();
      return { added: false, ok: true };
    }
    const why = rejectReason(sw, e);
    if (why) return { added: false, ok: false, why };
    memberCoords(sw).push({ c: e.col, r: e.row });
    refresh();
    return { added: true, ok: true };
  }

  // ── Open / closed ─────────────────────────────────────────────────
  function isOpen(sw) { return !!sw._switchOpen; }
  // The player's hand on the switch: whatever they set overrides an
  // automatic trip, so a switch they opened is never closed behind them.
  function setOpen(sw, open) {
    if (!!sw._switchOpen === !!open) return;
    sw._switchOpen = !!open;
    sw._autoTripped = false;
    sw._recloseFor = 0;
    if (!open && typeof NotificationStack !== 'undefined') NotificationStack.dismissTag(_autoTag(sw));
    refresh();
    if (typeof SFX !== 'undefined') SFX.click?.();
  }

  // ── Automatic load shedding (MK2 only) ────────────────────────────
  // An MK2 in auto mode opens itself when its network is about to go dark —
  // generation plus whatever storage can release still short of demand —
  // and closes again once generation alone has carried the shed load, with
  // margin, for AUTO_RECLOSE_SECS. The margin and the wait keep it from
  // chattering open/closed on a network sitting right at its limit.
  // Storage is deliberately not counted for reclosing: closing onto the
  // batteries would just drain them and trip again when they run out.
  const AUTO_RECLOSE_MARGIN = 1.15;
  const AUTO_RECLOSE_SECS   = 15;
  const hasAuto = (sw) => sw.type === T.CIRCUITSWITCH2;
  const isAuto  = (sw) => hasAuto(sw) && sw._autoMode !== false;   // on unless turned off
  function setAuto(sw, on) {
    if (!hasAuto(sw)) return;
    sw._autoMode = !!on;
    if (!on) { sw._autoTripped = false; sw._recloseFor = 0; }   // an open switch now stays open until closed by hand
  }
  const _autoTag = (sw) => `cs-auto-${sw.col},${sw.row}`;
  // What opening this switch takes off the network this tick. Members'
  // _liveDemand is computed by PowerNetwork before it checks isShed, so it
  // is current for open and closed switches alike.
  function liveShedOf(sw) {
    let w = 0;
    for (const e of members(sw)) w += (e._liveDemand || 0);
    return w;
  }

  // Called by PowerNetwork when a network is short after storage, with the
  // MK2s it found in that network's component. Opens the
  // fewest-watts set of closed auto switches on it that closes `deficit`:
  // the smallest single switch that covers it if there is one, otherwise
  // the largest and go again. Does nothing if every auto switch together
  // still can't cover it — the network goes dark regardless, and shedding
  // would only keep those buildings off longer once it recovers.
  // Returns the shed members, so the caller can take their draw back out.
  function autoShed(switches, deficit) {
    const cands = [];
    for (const sw of switches) {
      if (!isAuto(sw) || sw._switchOpen) continue;
      const w = liveShedOf(sw);
      if (w > 0) cands.push({ sw, w });
    }
    if (!cands.length || cands.reduce((a, c) => a + c.w, 0) < deficit) return null;
    cands.sort((a, b) => a.w - b.w);
    const picked = [];
    let left = deficit;
    while (left > 0 && cands.length) {
      const i = cands.findIndex(c => c.w >= left);
      const c = cands.splice(i >= 0 ? i : cands.length - 1, 1)[0];
      picked.push(c);
      left -= c.w;
    }
    const shed = [];
    for (const { sw, w } of picked) {
      sw._switchOpen = true;
      sw._autoTripped = true;
      sw._recloseFor = 0;
      shed.push(...members(sw));
      _notifyTrip(sw, w);
    }
    refresh();
    if (typeof SFX !== 'undefined') SFX.click?.();
    return shed;
  }

  // Called by PowerNetwork every tick for each network's MK2s with `headroom` =
  // generation minus demand, before storage. Closes auto-tripped switches,
  // smallest first, once that headroom has covered their load for long enough.
  function autoReclose(switches, headroom, dt) {
    const tripped = [];
    for (const sw of switches) {
      if (sw._autoTripped && sw._switchOpen && isAuto(sw))
        tripped.push({ sw, w: liveShedOf(sw) });
    }
    if (!tripped.length) return;
    tripped.sort((a, b) => a.w - b.w);
    let changed = false;
    for (const { sw, w } of tripped) {
      if (headroom >= w * AUTO_RECLOSE_MARGIN) {
        sw._recloseFor = (sw._recloseFor || 0) + dt;
        if (sw._recloseFor >= AUTO_RECLOSE_SECS) {
          sw._switchOpen = false;
          sw._autoTripped = false;
          sw._recloseFor = 0;
          headroom -= w;
          changed = true;
          if (typeof NotificationStack !== 'undefined') NotificationStack.dismissTag(_autoTag(sw));
        }
      } else {
        sw._recloseFor = 0;
      }
    }
    if (changed) refresh();
  }

  function _notifyTrip(sw, w) {
    if (typeof NotificationStack === 'undefined') return;
    const n = members(sw).length;
    const net = typeof getNetworkDisplayName === 'function' ? getNetworkDisplayName(sw.networkId) : null;
    NotificationStack.dismissTag(_autoTag(sw));
    NotificationStack.push({
      icon: '⏻', title: 'Circuit Switch tripped',
      message: `${sw.def.label || 'Circuit Switch MK2'} cut ${formatPower(Math.round(w))} (${n} building${n === 1 ? '' : 's'}) `
             + `to keep ${net || 'its network'} from going dark. It will close again once there is spare generation `
             + `to carry them for ${AUTO_RECLOSE_SECS}s. Click to jump there`,
      color: '#40c0ff', border: '#204a66', tag: _autoTag(sw),
      onClick: () => {
        Camera.recentreOn((sw.col + (sw.width || 1) / 2) * TILE, (sw.row + (sw.height || 1) / 2) * TILE);
        EntityInfoPanel.open(sw);
      },
    });
  }

  // Rebuild the shed set. Called on every roster or state change, on
  // removal, and after load.
  function refresh() {
    const next = new Set();
    for (const sw of allSwitches()) {
      if (!sw._switchOpen) continue;
      for (const e of members(sw)) next.add(e);
    }
    _shed = next;
  }

  return {
    CAPACITY_W,
    SWITCH_TYPES, isSwitchType, capacityOf,
    peakDrawOf, liveDrawOf,
    members, memberCoords, assignedPeak, assignedLive,
    isMember, ownerOf, canAdd, rejectReason, toggleMember,
    isOpen, setOpen, refresh,
    hasAuto, isAuto, setAuto, autoShed, autoReclose, AUTO_RECLOSE_SECS,

    // PowerNetwork asks this for every consumer every tick — keep it O(1).
    isShed(e) { return _shed.size > 0 && _shed.has(e); },
    anyShed()  { return _shed.size > 0; },

    // A removed switch must not keep its members dark.
    onSwitchRemoved(sw) {
      if (sw) {
        sw._switchOpen = false; sw._autoTripped = false;
        if (typeof NotificationStack !== 'undefined') NotificationStack.dismissTag(_autoTag(sw));
      }
      refresh();
    },

    // Drop roster entries whose building is gone (bulldozed, replaced).
    prune() {
      for (const sw of allSwitches()) {
        const before = memberCoords(sw).length;
        sw._members = memberCoords(sw).filter(m => {
          const e = GridManager.getEntity(m.c, m.r);
          return e && e.col === m.c && e.row === m.r && !isSwitchType(e.type);
        });
        if (sw._members.length !== before) refresh();
      }
    },
  };
})();
