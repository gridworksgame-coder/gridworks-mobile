/* ═══════════════════════════════════════════════════════════════════
   CONTRACT REQUIREMENTS
   ─────────────────────
   Declarative, independently-evaluable predicates describing what a
   contract asks the player to build. See docs/CONTRACTS_DESIGN.md §4.

   A requirement is plain data:
     { kind: 'place',   type: T.WIND,    count: 3, zone: 'ridge' }
     { kind: 'connect', from: 'siteA',   to: 'siteB' }
     { kind: 'protect', scope: 'allLines' }
     { kind: 'store',   type: T.BATTERY, count: 2, minCharge: 0.5 }
     { kind: 'sustain', watts: 200,      hours: 6 }

   Keeping these declarative buys three things at once:
     • the live checklist UI is a render of evaluate() and nothing else
     • contract generation is "pick N specs satisfiable with the
       player's unlocked set" rather than bespoke scenario code
     • "confirm complete" is allPass(), not a per-scenario function

   Nothing here knows about contracts, beacons, or job sites — a set can
   be evaluated against the home world, which is how this layer is
   testable before any of that exists.
   ═══════════════════════════════════════════════════════════════════ */
const ContractRequirements = (() => {

  // ── Geometry helpers ─────────────────────────────────────────────

  // Whole-world rect, used when a spec names no zone and the context
  // supplies no site bounds (i.e. evaluating against the home world).
  function worldRect() {
    return { minC: 0, minR: 0, maxC: COLS - 1, maxR: ROWS - 1 };
  }

  // Resolve a spec's region: an explicitly named marker, else the site
  // bounds, else the whole world.
  function regionFor(spec, ctx) {
    if (spec.zone) {
      const m = ctx && ctx.markers && ctx.markers[spec.zone];
      // A spec naming a marker the site doesn't define is an authoring
      // bug. Fall back to the site bounds so evaluation still runs
      // rather than throwing mid-contract; validate() reports it.
      if (m) return m;
    }
    return (ctx && ctx.bounds) || worldRect();
  }

  // Footprint overlap rather than origin-containment: a 3×3 turbine
  // whose anchor tile sits just outside a marker is still visibly "on
  // the ridge", and requiring the anchor inside would make markers
  // frustratingly finicky to author.
  function overlaps(e, rect) {
    const c0 = e.col, r0 = e.row;
    const c1 = c0 + (e.width  || 1) - 1;
    const r1 = r0 + (e.height || 1) - 1;
    return !(c1 < rect.minC || c0 > rect.maxC || r1 < rect.minR || r0 > rect.maxR);
  }

  // Entities of `type` whose footprint overlaps `rect`. `newOnly` leaves out
  // what the client already had standing (a clause asking for a new substation
  // must not be ticked by theirs).
  function entitiesOfTypeIn(type, rect, newOnly) {
    const out = [];
    for (const e of EntityRegistry.getByType(type)) {
      // A cleanup job's decommissioned units are the client's waste, not
      // plant the crew put up: they must never tick a 'place' clause.
      if (e._decommissioned) continue;
      if (newOnly && e._clientOwned) continue;
      if (overlaps(e, rect)) out.push(e);
    }
    return out;
  }

  // For a clause not yet met: how many of its type stand on the site but
  // outside the zone it names. They don't count, and without saying so a
  // working building looked like "0 / 2 live".
  function outsideNote(spec, ctx, have) {
    if (!spec.zone || have >= spec.count) return '';
    const outside = entitiesOfTypeIn(spec.type, (ctx && ctx.bounds) || worldRect(), spec.newOnly).length
                  - entitiesOfTypeIn(spec.type, regionFor(spec, ctx), spec.newOnly).length;
    return outside > 0 ? ` · ${outside} built outside zone` : '';
  }

  // A site-local {col,row} as an absolute tile, against the site bounds.
  function absTile(p, ctx) {
    const b = (ctx && ctx.bounds) || { minC: 0, minR: 0 };
    return { col: b.minC + p.col, row: b.minR + p.row };
  }
  function entityAtLocal(p, ctx) {
    const t = absTile(p, ctx);
    return GridManager.inBounds(t.col, t.row) ? GridManager.getEntity(t.col, t.row) : null;
  }

  // Waste a cleanup clause hauls out, per stream (see WASTE_CFG).
  const CLEAR_STREAMS = {
    coal: { noun: 'coal ash',  unit: 'Decommissioned Coal Unit', facility: () => T.COALWASTE, field: '_ashWaste' },
    oil:  { noun: 'oil sludge', unit: 'Abandoned Refinery',     facility: () => T.OILWASTE,  field: '_sludgeWaste' },
  };

  // Any entity overlapping a marker rect that currently sits on a
  // network — the endpoint of a 'connect' requirement.
  function networkedEntitiesIn(rect) {
    const out = [];
    for (const e of EntityRegistry.getInTileRect(rect.minC, rect.minR, rect.maxC, rect.maxR)) {
      if (e.networkId !== undefined && e.networkId >= 0) out.push(e);
    }
    return out;
  }

  // "Actually working", for `powered: true` requirements.
  // Networks that have something real drawing on them. Derived from the
  // registry rather than PowerNetwork.getNetworkDemand(), which reads 0
  // from outside a tick: that map is tick-internal scratch and is cleared
  // at the end of every tick (power_network.js:830).
  //
  // Memoised briefly — power state only moves at the 10Hz tick rate, and
  // several predicates ask on the same frame.
  let _loadNets = null, _loadNetsAt = -1e9;
  function networksUnderLoad() {
    const now = performance.now();
    if (_loadNets && now - _loadNetsAt < 100) return _loadNets;
    const s = new Set();
    for (const e of EntityRegistry.all()) {
      if (((e.def && e.def.powerInput) || 0) > 0 && e.networkId >= 0) s.add(e.networkId);
    }
    _loadNets = s; _loadNetsAt = now;
    return s;
  }

  // How a charge clause stands: how many pieces count as charged, and how far
  // the fullest `count` of them have got towards it (0..1).
  function storeCharge(spec, pool, state) {
    let have = 0;
    const fills = [];
    for (const e of pool) {
      const cap = (e.def && e.def.capacity) || 0;
      const frac = cap > 0 ? (e.charge || 0) / cap : 0;
      if (cap > 0 && frac >= spec.minCharge) have++;
      fills.push(Math.min(1, frac / spec.minCharge));
    }
    // Reaching the charge once is enough: a battery that then carries
    // the town through the night is doing what it was bought for.
    if (have >= spec.count) state.charged = true;
    if (state.charged) return { have: pool.length, filled: 1 };
    fills.sort((a, b) => b - a);
    return { have, filled: fills.slice(0, spec.count).reduce((a, f) => a + f, 0) / spec.count };
  }
  const chargePct = (filled) => filled !== null && filled < 1 ? ` · ${Math.floor(filled * 100)}%` : '';

  function isLive(e) {
    if (!e.powered || !(e.networkId >= 0)) return false;
    // `powered` alone passes an island of generators: PowerNetwork marks a
    // component powered when supply >= demand, and a turbine wired to
    // nothing is a component with supply and zero demand. Requiring the
    // network to carry actual load is what separates equipment that is
    // feeding something from equipment dumped on the ground; `powered`
    // then covers the supply being sufficient.
    return networksUnderLoad().has(e.networkId);
  }

  // What "running" means, per type — each generator's own system owns a
  // flag for it, and they do not agree on a name. Anything absent from
  // this table has no supply chain to stall, so being live IS running.
  const RUNNING_FLAG = {
    [T.COALGENERATOR]:  e => !!(e._fuelled && e._hasWater),
    [T.GEOTURBINE]:     e => !!e._generating,
    [T.STEAMTURBINE]:   e => !!e._generating,
    [T.STEAMTURBINE2]:  e => !!e._generating,
    [T.MHDRING]:        e => !!e._generating,
    [T.FUELGEN]:        e => !!e._fuelled,
    [T.BIOFUELGEN]:     e => (e._biofuelOutput || 0) > 0,
    [T.HYDROGENERATOR]: e => ((e.def && e.def.powerOutput) || 0) > 0,
  };

  function isRunning(e) {
    const flag = RUNNING_FLAG[e.type];
    // Live as well as fuelled: a burning generator wired to nothing is not
    // yet doing the client any good.
    return isLive(e) && (flag ? flag(e) : true);
  }

  // Why a piece of equipment isn't counting yet. "Built but not ticking the
  // box" is the single most confusing state in a contract — the machine looks
  // finished on the map, and the checklist just says 2 / 4 — so name the
  // blocker for the ones that are stalled, most fundamental first.
  function stallReason(list, pred = isRunning) {
    const stalled = list.filter(e => !pred(e));
    if (!stalled.length) return '';
    const unpowered = stalled.filter(e => !e.powered || !(e.networkId >= 0));
    if (unpowered.length) return `${unpowered.length} unpowered`;
    const idle = stalled.filter(e => !networksUnderLoad().has(e.networkId));
    if (idle.length) return `${idle.length} on a line with nothing drawing power`;
    return `${stalled.length} not generating`;
  }

  function typeLabel(type) {
    const def = (typeof EntityDefs !== 'undefined') && EntityDefs[type];
    return (def && def.label) || String(type);
  }

  function markerLabel(ctx, name) {
    const m = ctx && ctx.markers && ctx.markers[name];
    return (m && m.label) || name;
  }

  function plural(n, word) {
    return n === 1 ? word : word + 's';
  }

  // ── Predicate kinds ──────────────────────────────────────────────
  //
  // Each kind exposes:
  //   label(spec, ctx)             → brief text, valid before evaluation
  //   evaluate(spec, ctx, state)   → { pass, progress, detail }
  //   tick?(spec, ctx, state, dt)  → advance stateful predicates
  //   initState?(spec)             → per-instance mutable state
  //   validate?(spec, ctx)         → array of problem strings
  //
  // `progress` is 0..1 and drives the checklist's progress bar.

  const HOLD_LABEL = { oil: 'crude oil' };

  const KINDS = {

    // ── Place N of a type, optionally within a named zone ──────────
    //
    // `powered: true` demands the equipment actually be live, not merely
    // sitting on the ground. A client is buying working plant, so an
    // unconnected turbine should not tick the box.
    place: {
      label(spec, ctx) {
        const what = `${spec.count} ${spec.newOnly ? 'new ' : ''}${plural(spec.count, typeLabel(spec.type))}`;
        const at   = spec.zone ? ` at ${markerLabel(ctx, spec.zone)}` : '';
        // A reactor package is only ever offered on a site whose client has
        // left a stocked fuel store (contract_sites.js siteProvides), so no
        // mine or fuel plant is asked for. Say so: with no deposits on the
        // map and nothing in the checklist about fuel, the clause otherwise
        // reads as impossible.
        const fuel = spec.type === T.NUCLEARREACTOR       ? 'Fuel Rod'
                   : spec.type === T.ADVREACTOR           ? 'MOX'
                   : spec.type === T.HULKINGFUSIONREACTOR ? 'D-T Pellet'
                   : spec.type === T.ADVFUSIONREACTOR     ? 'D-He3 Pellet'
                   : null;
        // The Fusion Reactor burns D-T on a job site as at home. The one
        // exception is a fusion job accepted before that was so, which asks
        // for MHD Rings off this reactor (ContractSystem.legacyFusionJob):
        // there the client's pellets still burn as D-He3, and the line says so.
        const onJob = spec.type === T.HULKINGFUSIONREACTOR && typeof ContractSystem !== 'undefined'
                      && ContractSystem.legacyFusionJob && ContractSystem.legacyFusionJob()
                    ? ' (on this older job the Fusion Reactor burns them as D-He3 and feeds the MHD Rings)' : '';
        // A full-chain job (spec.ownFuel) supplies nothing: the crew makes it.
        const fed  = !fuel ? ''
                   : spec.ownFuel ? `, fuelled by ${fuel === 'MOX' ? 'MOX fuel' : fuel + 's'} made on site (nothing is supplied)${onJob}`
                   : `, fuelled by belt from the client's stocked ${fuel} store${onJob}`;
        // Most sites have no oil, so a clause that reads like home's Gas
        // Station would look impossible. The client delivers the fuel here.
        if (spec.type === T.GASSTATION) return `Install ${what}${at} if you use trucks (the client delivers the fuel: no fuel line or power needed)`;
        if (spec.holds) return `Install ${what}${at}, ${spec.count === 1 ? '' : 'each '}filled with ${spec.holdAmount} units of ${HOLD_LABEL[spec.holds] || spec.holds}`;
        return spec.powered ? `Install and energise ${what}${at}${fed}`
                            : `Install ${what}${at}${fed}`;
      },
      evaluate(spec, ctx, state) {
        const all  = entitiesOfTypeIn(spec.type, regionFor(spec, ctx), spec.newOnly);
        // A tank has to have been filled. Once is enough: a refinery is meant
        // to draw it back down afterwards.
        if (spec.holds) {
          const levels = all.map(e => e._liquidType === spec.holds ? (e._crude || 0) : 0).sort((a, b) => b - a);
          const held = levels.filter(v => v >= spec.holdAmount).length;
          if (held >= spec.count && all.length >= spec.count) state.filled = true;
          if (state.filled) return { pass: all.length >= spec.count, progress: Math.min(1, all.length / spec.count), detail: `${Math.min(all.length, spec.count)} / ${spec.count} filled` };
          const sum = levels.slice(0, spec.count).reduce((a, v) => a + Math.min(v, spec.holdAmount), 0);
          return {
            pass:     false,
            progress: sum / (spec.count * spec.holdAmount),
            detail:   all.length < spec.count
              ? `${all.length} / ${spec.count} placed${outsideNote(spec, ctx, all.length)}`
              : `${held} / ${spec.count} filled (${Math.floor(levels[held] || 0)} / ${spec.holdAmount} ${HOLD_LABEL[spec.holds] || spec.holds} in the next)`,
          };
        }
        // A job done by drone alone has no truck to fuel: the Gas Station is
        // only owed once a truck (or Hauler) is on the site.
        if (spec.type === T.GASSTATION && all.length < spec.count && EntityRegistry.getByType(T.TRUCK).size === 0)
          return { pass: true, progress: 1, detail: 'no trucks on site: not needed' };
        const have = spec.powered ? all.filter(isLive).length : all.length;
        return {
          pass:     have >= spec.count,
          progress: spec.count > 0 ? Math.min(1, have / spec.count) : 1,
          detail:   spec.powered && all.length > have
            ? `${have} / ${spec.count} live (${all.length} placed · ${stallReason(all, isLive)})${outsideNote(spec, ctx, have)}`
            : `${Math.min(have, spec.count)} / ${spec.count}${outsideNote(spec, ctx, have)}`,
        };
      },
      validate(spec, ctx) {
        const bad = [];
        if (!spec.type) bad.push('place: missing type');
        if (!(spec.count > 0)) bad.push('place: count must be > 0');
        if (spec.zone && !(ctx && ctx.markers && ctx.markers[spec.zone]))
          bad.push(`place: unknown zone '${spec.zone}'`);
        return bad;
      },
    },

    // ── Plant that is actually generating ──────────────────────────
    //
    // `place ... powered: true` proves a machine is wired into a network
    // that is carrying load. For a turbine that is the whole story: put a
    // turbine up in wind and it generates. It is NOT the story for plant
    // with a supply chain behind it. A coal generator with an empty hopper
    // and no water still reads as `powered`, because `powered` describes
    // the NETWORK's health and some other generator is holding that
    // network up — so a client could pay for a coal set that never burned
    // a lump of coal.
    //
    // This kind asks the machine itself, through whatever flag its own
    // system sets when it is running. Types with no such flag fall back to
    // the same live-and-loaded test `place` uses, so the kind is always
    // safe to apply.
    running: {
      label(spec, ctx) {
        const what = `${spec.count} ${plural(spec.count, typeLabel(spec.type))}`;
        const at   = spec.zone ? ` at ${markerLabel(ctx, spec.zone)}` : '';
        return `Bring ${what}${at} online`;
      },
      evaluate(spec, ctx) {
        const all  = entitiesOfTypeIn(spec.type, regionFor(spec, ctx));
        const live = all.filter(isRunning);
        return {
          pass:     live.length >= spec.count,
          progress: spec.count > 0 ? Math.min(1, live.length / spec.count) : 1,
          detail:   all.length > live.length
            ? `${live.length} / ${spec.count} running (${all.length} built · ${stallReason(all)})${outsideNote(spec, ctx, live.length)}`
            : `${Math.min(live.length, spec.count)} / ${spec.count} running${outsideNote(spec, ctx, live.length)}`,
        };
      },
      validate(spec, ctx) {
        const bad = [];
        if (!spec.type) bad.push('running: missing type');
        if (!(spec.count > 0)) bad.push('running: count must be > 0');
        if (spec.zone && !(ctx && ctx.markers && ctx.markers[spec.zone]))
          bad.push(`running: unknown zone '${spec.zone}'`);
        return bad;
      },
    },

    // ── Two named locations on the same electrical network ─────────
    connect: {
      label(spec, ctx) {
        return `Run a line from ${markerLabel(ctx, spec.from)} to ${markerLabel(ctx, spec.to)}`;
      },
      evaluate(spec, ctx) {
        const fromRect = (ctx.markers && ctx.markers[spec.from]) || null;
        const toRect   = (ctx.markers && ctx.markers[spec.to])   || null;
        if (!fromRect || !toRect) {
          return { pass: false, progress: 0, detail: 'endpoint missing' };
        }

        const a = networkedEntitiesIn(fromRect);
        const b = networkedEntitiesIn(toRect);
        if (!a.length || !b.length) {
          // Half credit once one end is live — the checklist should show
          // the player they've made progress rather than a flat zero.
          const reached = (a.length ? 1 : 0) + (b.length ? 1 : 0);
          return { pass: false, progress: reached * 0.25, detail: 'not connected' };
        }

        const netsA = new Set(a.map(e => e.networkId));
        let shared = -1;
        for (const e of b) {
          if (netsA.has(e.networkId)) { shared = e.networkId; break; }
        }
        if (shared < 0) return { pass: false, progress: 0.5, detail: 'separate networks' };

        // Connectivity alone satisfies the requirement; `powered: true`
        // additionally demands the link actually be carrying.
        if (spec.powered) {
          const liveA = a.some(e => e.networkId === shared && e.powered);
          const liveB = b.some(e => e.networkId === shared && e.powered);
          if (!liveA || !liveB) {
            return { pass: false, progress: 0.75, detail: 'connected, unpowered' };
          }
        }
        return { pass: true, progress: 1, detail: 'connected' };
      },
      validate(spec, ctx) {
        const bad = [];
        for (const end of ['from', 'to']) {
          if (!spec[end]) bad.push(`connect: missing ${end}`);
          else if (!(ctx && ctx.markers && ctx.markers[spec[end]]))
            bad.push(`connect: unknown marker '${spec[end]}'`);
        }
        return bad;
      },
    },

    // ── Every wire network in the region carries a surge protector ──
    protect: {
      label() {
        return 'Fit surge protection on every line';
      },
      evaluate(spec, ctx) {
        const rect = regionFor(spec, ctx);

        // Networks that contain wire — i.e. actual lines needing cover.
        // Out-of-range wire is skipped: an unanchored stub doesn't conduct
        // and gets its own networkId, so counting it would report a
        // half-built run as a dozen separate unprotected "lines".
        const wireNets = new Set();
        for (const e of entitiesOfTypeIn(T.WIRE, rect)) {
          if (e.networkId >= 0 && !e.outOfRange) wireNets.add(e.networkId);
        }
        if (!wireNets.size) {
          // No lines yet: vacuously unsatisfied, since a contract asking
          // for protection implies there will be lines to protect.
          return { pass: false, progress: 0, detail: 'no lines built' };
        }

        const covered = new Set();
        for (const type of [T.PROTECTOR, T.PROTECTOR2, T.PROTECTOR3]) {
          for (const e of entitiesOfTypeIn(type, rect)) {
            if (wireNets.has(e.networkId)) covered.add(e.networkId);
          }
        }
        return {
          pass:     covered.size === wireNets.size,
          progress: covered.size / wireNets.size,
          detail:   `${covered.size} / ${wireNets.size} ${plural(wireNets.size, 'line')} protected`,
        };
      },
    },

    // ── Storage installed, wired in, optionally charged ─────────────
    store: {
      label(spec, ctx) {
        const what = `${spec.count} ${plural(spec.count, typeLabel(spec.type))}`;
        const at   = spec.zone ? ` at ${markerLabel(ctx, spec.zone)}` : '';
        if (spec.minCharge) return `Install ${what}${at}, charged to ${Math.round(spec.minCharge * 100)}%`;
        return spec.powered ? `Install and connect ${what}${at}` : `Install ${what}${at}`;
      },
      evaluate(spec, ctx, state) {
        const all = entitiesOfTypeIn(spec.type, regionFor(spec, ctx));
        // Storage that isn't on a live network can never charge, so
        // `powered` is the baseline check and minCharge builds on it.
        let pool = spec.powered || spec.minCharge ? all.filter(isLive) : all;
        let have = pool.length, filled = null;

        if (spec.minCharge) ({ have, filled } = storeCharge(spec, pool, state));
        const suffix = spec.minCharge ? ' charged' : (spec.powered ? ' live' : '');
        const pct = chargePct(filled);
        return {
          pass:     have >= spec.count,
          progress: filled ?? (spec.count > 0 ? Math.min(1, have / spec.count) : 1),
          detail:   (spec.powered || spec.minCharge) && all.length > have
            ? `${have} / ${spec.count}${suffix}${pct} (${all.length} placed)${outsideNote(spec, ctx, have)}`
            : `${Math.min(have, spec.count)} / ${spec.count}${suffix}${pct}${outsideNote(spec, ctx, have)}`,
        };
      },
      // The site's storage keeps charging while the player is home (the job
      // site's away simulation, contract_system.js), so a charge clause reads
      // live off the site's snapshot. Whether a piece is on a network is as it
      // was when they left; a crew's unbuilt ghosts have no network yet.
      evaluateAway(spec, ctx, state) {
        if (!spec.minCharge || !ctx.awayEntities) return null;
        const rect = regionFor(spec, ctx);
        const all  = ctx.awayEntities.filter(e => e.type === spec.type && !e._decommissioned && overlaps(e, rect));
        const pool = ctx.awayCrew ? all : all.filter(e => e.networkId >= 0);
        const { have, filled } = storeCharge(spec, pool, state);
        return {
          pass:     have >= spec.count,
          progress: filled,
          detail:   `${Math.min(have, spec.count)} / ${spec.count} charged${chargePct(filled)}`,
        };
      },
      validate(spec) {
        const bad = [];
        if (!spec.type) bad.push('store: missing type');
        if (!(spec.count > 0)) bad.push('store: count must be > 0');
        if (spec.minCharge !== undefined && (spec.minCharge <= 0 || spec.minCharge > 1))
          bad.push('store: minCharge must be in (0, 1]');
        return bad;
      },
    },

    // ── Every power consumer on site must end up lit ────────────────
    //
    // The client's existing buildings are part of the job: a site handed
    // over with dark houses on it has not been finished. Scoped to
    // anything with a real power draw, which is what the game itself uses
    // to decide whether a building shows NO POWER.
    service: {
      label(spec, ctx) {
        return spec.zone
          ? `Restore power to every building at ${markerLabel(ctx, spec.zone)}`
          : 'Restore power to every building on site';
      },
      consumers(spec, ctx) {
        const rect = regionFor(spec, ctx);
        const out  = [];
        for (const e of EntityRegistry.getInTileRect(rect.minC, rect.minR, rect.maxC, rect.maxR)) {
          const draw = (e.def && e.def.powerInput) || 0;
          // (not the client's fuel depot, which runs without power)
          if (draw > 0 && !e._decommissioned && !e._fuelDepot) out.push(e);
        }
        return out;
      },
      evaluate(spec, ctx) {
        const all = this.consumers(spec, ctx);
        if (!all.length) {
          // Nothing to service. Vacuously true rather than an unclearable
          // requirement — auto-attached specs (ContractSites.requirementsFor)
          // are added from the site's *authored* prebuilt list, and the
          // player may legitimately delete a derelict.
          return { pass: true, progress: 1, detail: 'nothing to service' };
        }
        const lit = all.filter(e => e.powered).length;
        return {
          pass:     lit === all.length,
          progress: lit / all.length,
          detail:   lit === all.length ? `all ${all.length} powered` : `${lit} / ${all.length} powered`,
        };
      },
      // The buildings still in the dark. Used to point the player at the
      // last stragglers — see `stragglers()` on the set.
      pending(spec, ctx) {
        return this.consumers(spec, ctx).filter(e => !e.powered);
      },
      validate(spec, ctx) {
        return (spec.zone && !(ctx && ctx.markers && ctx.markers[spec.zone]))
          ? [`service: unknown zone '${spec.zone}'`] : [];
      },
    },

    // ── Put storm-damaged client buildings back in service ──────────
    //
    // The damage is applied when the crew arrives (ContractSystem
    // applySituation), at the site-local tiles listed in `targets`. A target
    // counts once it stands and is no longer damaged; the repair itself is
    // the game's ordinary one (panel button, Repair Nearby, or a drone).
    repair: {
      label(spec) {
        const n = (spec.targets || []).length;
        return `Repair ${n} storm-damaged ${plural(n, 'building')} (panel Repair, Repair Nearby or drones)`;
      },
      evaluate(spec, ctx) {
        const ts = spec.targets || [];
        if (!ts.length) return { pass: true, progress: 1, detail: 'nothing damaged' };
        let fixed = 0, crews = 0;
        for (const t of ts) {
          const e = entityAtLocal(t, ctx);
          if (!e || !e._lightningDamaged) fixed++;
          else if (e._repairRemaining > 0) crews++;
        }
        return {
          pass:     fixed === ts.length,
          progress: fixed / ts.length,
          detail:   `${fixed} / ${ts.length} repaired${crews ? ` · ${crews} crew${crews === 1 ? '' : 's'} working` : ''}`,
        };
      },
      pending(spec, ctx) {
        const out = [];
        for (const t of spec.targets || []) {
          const e = entityAtLocal(t, ctx);
          if (e && e._lightningDamaged && !(e._repairRemaining > 0)) out.push(e);
        }
        return out;
      },
      validate(spec) {
        return Array.isArray(spec.targets) && spec.targets.length ? [] : ['repair: needs targets'];
      },
    },

    // ── Haul a waste stream off site ────────────────────────────────
    //
    // The client's decommissioned units are stamped full of waste on
    // arrival (`piles`, site-local). What counts as cleared is anything no
    // longer sitting in a unit or riding a truck: delivered to a facility
    // is gone from the client's books, whether or not it is processed yet.
    clear: {
      label(spec) {
        const S = CLEAR_STREAMS[spec.waste] || CLEAR_STREAMS.coal;
        const n = (spec.piles || []).length;
        const total = Math.round((spec.piles || []).reduce((a, p) => a + (p.amount || 0), 0));
        const fac = typeLabel(S.facility());
        return `Haul ${total} units of ${S.noun} out of ${n} ${plural(n, S.unit)} to a ${fac} by truck or drone`;
      },
      remaining(spec, ctx) {
        const S = CLEAR_STREAMS[spec.waste] || CLEAR_STREAMS.coal;
        let left = 0;
        for (const p of spec.piles || []) {
          const e = entityAtLocal(p, ctx);
          if (e && e._decommissioned) left += e[S.field] || 0;
        }
        // Still aboard a truck is not yet off the client's hands.
        const rect = (ctx && ctx.bounds) || worldRect();
        for (const trk of EntityRegistry.getByType(T.TRUCK)) {
          if (trk._cargoFacility === S.facility() && overlaps(trk, rect)) left += trk._cargoAmount || 0;
        }
        return left;
      },
      evaluate(spec, ctx) {
        const total = (spec.piles || []).reduce((a, p) => a + (p.amount || 0), 0);
        if (!(total > 0)) return { pass: true, progress: 1, detail: 'nothing to haul' };
        const left = this.remaining(spec, ctx);
        const done = Math.max(0, total - left);
        return {
          pass:     left <= total * 0.05,
          progress: done / total,
          detail:   `${Math.round(done)} / ${Math.round(total)} hauled`,
        };
      },
      validate(spec) {
        const bad = [];
        if (!CLEAR_STREAMS[spec.waste]) bad.push(`clear: unknown waste '${spec.waste}'`);
        if (!Array.isArray(spec.piles) || !spec.piles.length) bad.push('clear: needs piles');
        return bad;
      },
    },

    // ── Keep conveyors and pipes to a budget ────────────────────────
    //
    // A client who does not want their ground carved up by belts and
    // pipework: the supply chain still has to run (the 'running' clauses),
    // but the stock moves by Hauler or drone, with only short stubs into
    // and out of the storage vessels they serve.
    limit: {
      TYPES: () => [T.CONVEYOR, T.PIPE, T.UNDERGNDPIPE].filter(Boolean),
      label(spec) {
        return `Lay no more than ${spec.max} tiles of conveyor and pipe in total: move materials by Hauler or drone`;
      },
      count(spec, ctx) {
        const rect = regionFor(spec, ctx);
        let n = 0;
        for (const t of this.TYPES()) n += entitiesOfTypeIn(t, rect).length;
        return n;
      },
      evaluate(spec, ctx) {
        const n = this.count(spec, ctx);
        return {
          pass:     n <= spec.max,
          progress: n <= spec.max ? 1 : Math.max(0, spec.max / n),
          detail:   n <= spec.max ? `${n} / ${spec.max} tiles used` : `${n} tiles laid: ${n - spec.max} over the limit`,
        };
      },
      validate(spec) {
        return spec.max > 0 ? [] : ['limit: max must be > 0'];
      },
    },

    // ── A test the caller supplies ─────────────────────────────────
    //
    // For an objective no other kind can express (a scenario asking the
    // launch system whether a mission has flown). `test()` returns
    // { pass, progress, detail }; `label` is a string or a function. With
    // `latch` a pass sticks, so a goal met once stays met.
    check: {
      initState() { return { done: false }; },
      label(spec) { return typeof spec.label === 'function' ? spec.label() : (spec.label || 'Objective'); },
      tick(spec, ctx, state) {
        if (spec.latch && !state.done && spec.test && spec.test(ctx).pass) state.done = true;
      },
      evaluate(spec, ctx, state) {
        if (state.done) return { pass: true, progress: 1, detail: spec.doneText || 'done' };
        return spec.test ? spec.test(ctx) : { pass: false, progress: 0, detail: '' };
      },
      validate(spec) { return typeof spec.test === 'function' ? [] : ['check: missing test()']; },
    },

    // ── Hold a load for a continuous stretch of time ────────────────
    //
    // The only stateful kind. Held time resets on a break rather than
    // accumulating, because the requirement is a stability test — a grid
    // that delivers 200 kW in sixty scattered one-second bursts has not
    // demonstrated the thing being asked for.
    sustain: {
      initState() { return { held: 0, breaks: 0, down: 0, satisfiedOnce: false }; },

      // A blackout has to last this long (game seconds) before it counts
      // as a break. Demand noise and a single congested tick can drop a
      // marginal network for one frame, and throwing away six hours of
      // held time over that is not a stability test, it is a coin flip.
      GRACE: 2,

      // Duration is authored in in-game HOURS, and every clause — the short
      // switch-on proof as much as a multi-day endurance run — is stated and
      // shown in in-game time. A client who wants the lights kept on asks
      // for hours or days, not "76 seconds": raw seconds are a real-world
      // unit that drifts against the clause's meaning the moment the player
      // changes game speed, and it read as a stopwatch rather than a shift.
      //
      // `spec.seconds` is still honoured so a contract saved mid-hold by an
      // older build keeps working, but it is legacy — nothing generates it
      // (contract_sites.js authors `hours`), and it is reported in game time
      // like everything else rather than echoed back in seconds.
      //
      // Held time is accumulated from the scaled sim step, the same step
      // DayNight advances on, so `seconds()` is the honest internal unit and
      // secondsPerGameHour is the only conversion needed in either direction.
      seconds(spec) {
        if (spec.hours > 0) return spec.hours * DayNight.secondsPerGameHour();
        return spec.seconds || 0;
      },
      hours(spec) { return this.seconds(spec) / DayNight.secondsPerGameHour(); },
      duration(spec) {
        const h = this.hours(spec);
        if (h >= 24) {
          const d = h / 24;
          return `${Number.isInteger(d) ? d : d.toFixed(1)} day${d === 1 ? '' : 's'}`;
        }
        if (h >= 1) {
          return `${Number.isInteger(h) ? h : h.toFixed(1)} hour${h === 1 ? '' : 's'}`;
        }
        return `${Math.round(h * 60)} minutes`;
      },
      // Sim-seconds of unbroken hold this clause still needs: the least
      // time it could possibly take from here.
      owed(spec, state) {
        return state.satisfiedOnce ? 0 : Math.max(0, this.seconds(spec) - state.held);
      },
      remaining(spec, state) {
        const left = Math.max(0, this.seconds(spec) - state.held);
        const hoursLeft = left / DayNight.secondsPerGameHour();
        if (hoursLeft >= 24) return `${(hoursLeft / 24).toFixed(1)} days left`;
        if (hoursLeft >= 1)  return `${Math.floor(hoursLeft)}h ${Math.floor((hoursLeft % 1) * 60)}m left`;
        return `${Math.ceil(hoursLeft * 60)}m left`;
      },

      label(spec) {
        return `Keep the site powered for ${this.duration(spec)} without a break (peak ${formatPower(spec.watts)})`;
      },

      // What the client is buying is an unbroken supply, so what gets
      // measured is whether anything on their site went dark.
      //
      // This used to be `PowerNetwork.stats.totalConsumed >= spec.watts`,
      // which measured the site's APPETITE rather than the player's
      // supply, and so could not be satisfied. `totalConsumed` is summed
      // demand, and demand follows the time-of-day curves — a factory
      // draws 30 kW from 07:00-19:00 and nothing at all outside them, a
      // mall is shut from 22:00 to 09:00, houses drop from 6 kW to 2 kW
      // (demand_curves.js). The target is sized off site PEAK
      // (contract_sites.js:713 takes 60-85% of siteLoad(), itself a sum
      // of peaks), so the test only passed for the couple of hours a day
      // the site was near its own peak, and every quiet hour counted as
      // the player breaking supply. A 12-hour hold could not complete: it
      // started late (nothing counted until the evening peak) and reset
      // itself as soon as the curve came back down, with the site fully
      // powered the whole time.
      //
      // Storage still matters, and for the reason the design intends: a
      // calm night with flat batteries browns the site out, and THAT is
      // the break this now catches.
      condition(spec, ctx) {
        // Scoped to the site (or the named zone), like every other kind —
        // a stray lamp the player dropped outside the job is not the
        // client's supply going down.
        const rect = regionFor(spec, ctx);
        let consumers = 0;
        for (const e of EntityRegistry.getInTileRect(rect.minC, rect.minR, rect.maxC, rect.maxR)) {
          if (!(e.def && e.def.powerInput > 0)) continue;
          // The same buildings `service` counts: not a decommissioned unit,
          // and not the client's fuel depot, which runs without power and
          // is never connected. Counted here, the depot alone held this
          // clause at "site not fully powered" with every building lit.
          if (e._decommissioned || e._fuelDepot) continue;
          consumers++;
          // `_insufficient` is set when a network cannot cover its demand;
          // `powered` also covers the harder case of a network with no
          // supply at all, where nothing is marked insufficient because
          // there was never a deficit to detect (power_network.js:770).
          if (e._insufficient || !e.powered) return false;
        }
        // A site with nothing drawing power is not holding anything up.
        return consumers > 0;
      },
      tick(spec, ctx, state, dt) {
        if (state.satisfiedOnce) return;
        if (this.condition(spec, ctx)) {
          state.down = 0;
          state.lastHolding = true;
          state.held += dt;
          if (state.held >= this.seconds(spec)) state.satisfiedOnce = true;
        } else if (state.held > 0) {
          // Ride out a flicker; a real outage still resets the clock.
          state.down = (state.down || 0) + dt;
          if (state.down >= this.GRACE) {
            state.held  = 0;
            state.down  = 0;
            state.lastHolding = false;
            state.breaks++;
          }
        }
      },

      // The player has gone back to their own world. The job site is not
      // on the grid to be read, but it is not switched off either — it is
      // held exactly as they left it (contract_system.js:snapshotWorld),
      // and the contract deadline keeps running at home, so freezing the
      // hold as well would mean an endurance clause could only ever be
      // served by sitting on site watching it. It therefore keeps running
      // in the state the site was last seen in: a site left supplied goes
      // on being supplied, and a site left dark accrues nothing until the
      // player comes back and fixes it.
      tickAway(spec, ctx, state, dt) {
        if (state.satisfiedOnce) return;
        // The caller simulates the frozen world and reports whether it is
        // still supplied. With no such report (a set evaluated outside a
        // contract) the site is assumed to be as it was left.
        const holding = (ctx && typeof ctx.awaySupplied === 'boolean')
          ? ctx.awaySupplied : !!state.lastHolding;
        if (holding) {
          state.down = 0;
          state.lastHolding = true;
          state.held += dt;
          if (state.held >= this.seconds(spec)) state.satisfiedOnce = true;
        } else if (state.held > 0) {
          state.down = (state.down || 0) + dt;
          if (state.down >= this.GRACE) {
            state.held = 0;
            state.down = 0;
            state.lastHolding = false;
            state.breaks++;
          }
        }
      },

      // Away, `condition` would read the player's OWN city, so the row is
      // reported from stored state alone.
      evaluateAway(spec, ctx, state) {
        if (state.satisfiedOnce) return { pass: true, progress: 1, detail: 'held' };
        const total = this.seconds(spec);
        return {
          pass:     false,
          progress: total > 0 ? Math.min(1, state.held / total) : 1,
          detail:   state.lastHolding ? `${this.remaining(spec, state)} · site holding`
                                      : (state.breaks ? 'site lost power: restarted'
                                                      : 'site not powered'),
        };
      },
      evaluate(spec, ctx, state) {
        if (state.satisfiedOnce) {
          return { pass: true, progress: 1, detail: 'held' };
        }
        const total = this.seconds(spec);
        const holding = this.condition(spec, ctx);
        return {
          pass:     false,
          progress: total > 0 ? Math.min(1, state.held / total) : 1,
          detail:   holding
            ? this.remaining(spec, state)
            // Inside the flicker grace the clock is still running, so say
            // so rather than reporting a reset that has not happened.
            : (state.held > 0 ? `supply interrupted: holding`
                              : (state.breaks ? `supply dropped: restarted`
                                              : `site not fully powered`)),
        };
      },
      validate(spec) {
        const bad = [];
        if (!(spec.watts > 0)) bad.push('sustain: watts must be > 0');
        if (!(spec.hours > 0) && !(spec.seconds > 0))
          bad.push('sustain: needs hours > 0 (in-game hours)');
        return bad;
      },
    },
  };

  // ── Requirement set ──────────────────────────────────────────────

  function create(specs, ctx = {}) {
    const list  = specs.slice();
    const state = list.map(s => {
      const k = KINDS[s.kind];
      return (k && k.initState) ? k.initState(s) : {};
    });

    // Cache of the last evaluate() so the checklist UI can render every
    // frame without re-walking the registry per requirement per frame.
    let cache = null;
    let cacheStamp = -1;
    let stamp = 0;

    const set = {
      get specs() { return list; },
      get context() { return ctx; },

      // Re-point at a different site (used when a contract starts).
      setContext(next) { ctx = next || {}; stamp++; return set; },

      tick(dt) {
        for (let i = 0; i < list.length; i++) {
          const k = KINDS[list[i].kind];
          if (k && k.tick) k.tick(list[i], ctx, state[i], dt);
        }
        stamp++;   // stateful predicates may have moved; invalidate cache
      },

      // Full evaluation. `force` bypasses the frame cache.
      evaluate(force = false) {
        if (!force && cache && cacheStamp === stamp) return cache;
        cache = list.map((spec, i) => {
          const k = KINDS[spec.kind];
          if (!k) {
            return { spec, kind: spec.kind, label: `Unknown requirement '${spec.kind}'`,
                     pass: false, progress: 0, detail: 'unsupported' };
          }
          const r = k.evaluate(spec, ctx, state[i]);
          return {
            spec, kind: spec.kind,
            label:    k.label(spec, ctx),
            pass:     !!r.pass,
            progress: Math.max(0, Math.min(1, r.progress || 0)),
            detail:   r.detail || '',
          };
        });
        cacheStamp = stamp;
        return cache;
      },

      // The longest unbroken hold any clause still needs (sim-seconds). If
      // this is more than the time left on the contract, it cannot be met.
      holdOwed() {
        let need = 0;
        for (let i = 0; i < list.length; i++) {
          const k = KINDS[list[i].kind];
          if (k && k.owed) need = Math.max(need, k.owed(list[i], state[i]));
        }
        return need;
      },

      // Advance only what keeps running while the player is away from the
      // site. Everything else is frozen with the site itself.
      tickAway(dt) {
        for (let i = 0; i < list.length; i++) {
          const k = KINDS[list[i].kind];
          if (k && k.tickAway) k.tickAway(list[i], ctx, state[i], dt);
        }
        stamp++;
      },

      // The row for requirement `i` as it reads from away, or null when
      // that kind has nothing to say without the site on the grid (the
      // caller then shows its last on-site reading).
      awayRow(i) {
        const spec = list[i], k = KINDS[spec && spec.kind];
        if (!k || !k.evaluateAway) return null;
        const r = k.evaluateAway(spec, ctx, state[i]);
        if (!r) return null;
        return {
          spec, kind: spec.kind,
          label:    k.label(spec, ctx),
          pass:     !!r.pass,
          progress: Math.max(0, Math.min(1, r.progress || 0)),
          detail:   r.detail || '',
        };
      },

      // The last few things still holding the set back, as entities.
      //
      // Finishing a site comes down to hunting for the one building that
      // is still dark, and on a big site that can be a single unlit street
      // lamp against a dim ground texture. Past a handful there is nothing
      // to point at — that is just the job — so this reports only when the
      // remainder is small enough to be a hunt, and the caller decides
      // what to do about it.
      stragglers(max = 2) {
        const out = [];
        for (let i = 0; i < list.length; i++) {
          const k = KINDS[list[i].kind];
          if (!k || !k.pending) continue;
          for (const e of k.pending(list[i], ctx)) {
            if (!out.includes(e)) out.push(e);
          }
          if (out.length > max) return [];   // too many to be a hunt
        }
        return out;
      },

      // Grid changes invalidate the cache. Cheap enough to call from a
      // placement hook; evaluate() also re-runs whenever tick() advances.
      invalidate() { stamp++; },

      allPass() { return set.evaluate(true).every(r => r.pass); },

      // 0..1 across the whole set — drives the contract's overall bar.
      completion() {
        const rs = set.evaluate();
        if (!rs.length) return 1;
        return rs.reduce((a, r) => a + r.progress, 0) / rs.length;
      },

      // Brief text for the board, valid before the player has built
      // anything (no evaluation required).
      brief() {
        return list.map(spec => {
          const k = KINDS[spec.kind];
          return k ? k.label(spec, ctx) : `Unknown requirement '${spec.kind}'`;
        });
      },

      // Authoring check — run when a site/contract is defined, not per
      // frame. Returns [] when the set is well-formed.
      validate() {
        const bad = [];
        list.forEach((spec, i) => {
          const k = KINDS[spec.kind];
          if (!k) { bad.push(`[${i}] unknown kind '${spec.kind}'`); return; }
          if (k.validate) for (const msg of k.validate(spec, ctx)) bad.push(`[${i}] ${msg}`);
        });
        return bad;
      },

      // Only stateful predicates carry anything worth persisting; specs
      // and context are reconstructed from the contract definition.
      toJSON()  { return state.map(s => ({ ...s })); },
      fromJSON(saved) {
        if (!Array.isArray(saved)) return set;
        for (let i = 0; i < state.length && i < saved.length; i++) {
          Object.assign(state[i], saved[i]);
        }
        stamp++;
        return set;
      },
    };
    return set;
  }

  // ── Active set ───────────────────────────────────────────────────
  // The game loop ticks whatever set is currently in play, so stateful
  // predicates advance without every caller wiring up its own tick.

  let active = null;

  return {
    create,
    kinds() { return Object.keys(KINDS); },

    setActive(set) { active = set || null; },
    getActive()    { return active; },
    clearActive()  { active = null; },

    tickActive(dt)     { if (active) active.tick(dt); },
    tickActiveAway(dt) { if (active) active.tickAway(dt); },
    invalidateActive() { if (active) active.invalidate(); },
  };
})();
