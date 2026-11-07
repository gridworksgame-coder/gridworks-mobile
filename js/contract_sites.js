/* ═══════════════════════════════════════════════════════════════════
   CONTRACT SITES
   ──────────────
   Hand-authored job sites, and the generator that composes contracts
   for them. See docs/CONTRACTS_DESIGN.md §3 and §5.

   A site is data, not code. Coordinates are SITE-LOCAL — the origin is
   applied when the site is stamped, so a site can be authored against
   (0,0) and dropped anywhere on the grid.

   `prebuilt` is the client's existing infrastructure. It is the single
   strongest cue that the player is somewhere else (§6.1): the site
   should read as a place mid-life they are visiting, not empty ground
   with markers on it. It also does design work — existing structures
   constrain where lines can run, which is what makes a scenario a
   puzzle rather than an open field. And because unpowered buildings
   automatically become scope of work (see requirementsFor), the
   prebuilt list is what gives a site its servicing job.

   Every site names two markers by role:
     work — where the client wants new plant built
     hub  — the client's existing works, which the feed must reach
   ═══════════════════════════════════════════════════════════════════ */
const ContractSites = (() => {

  // Where a site gets stamped on the (much larger) world grid.
  //
  // Deliberately NOT near the map centre: the City Hall plaza there is
  // painted as ground rather than as an entity, so clearing the grid does
  // not remove it and it bleeds through into the job site. Anywhere well
  // clear of the centre avoids that whole class of leak.
  const SITE_ORIGIN = { col: 140, row: 120 };

  // ── City layout helpers ──────────────────────────────────────────
  //
  // A town or a district is a list of buildings, not a page of coordinates.
  // zone() lays them out in rows inside a strip, wrapping like text, so the
  // footprints can never overlap and a site can be retuned by adding or
  // removing a line. Items are:
  //   { sub: 'cafe', name: '…', n: 2 }   a commercial building of that subtype
  //   { ind: 'machineshop', … }          an industrial one
  //   { res: 'school', … }               a residential one (apartments, schools, towers)
  //   { t: T.HOUSE, n: 8 }               any other entity, at its own size
  // `names` (an array) gives each repeat its own business name.
  //
  // The key has to match the renderer that owns the subtype: renderCommercial,
  // renderIndustrial and renderHouse each know only their own, and a subtype
  // stamped under the wrong type draws as that renderer's generic fallback.
  function _fp(it) {
    const sub = it.sub || it.ind || it.res;
    if (sub && SubtypeFootprints[sub]) return { w: SubtypeFootprints[sub].width, h: SubtypeFootprints[sub].height };
    const d = EntityDefs[it.t] || {};
    return { w: d.width || 1, h: d.height || 1 };
  }
  function _entry(it, col, row, i) {
    if (it.sub || it.ind || it.res) {
      const name = it.names ? it.names[i % it.names.length] : it.name;
      return { type: it.ind ? T.INDUSTRIAL : it.res ? T.HOUSE : T.COMMERCIAL, col, row,
               props: { commercialSubtype: it.sub || it.ind || it.res, ...(name ? { businessName: name } : {}) } };
    }
    return { type: it.t, col, row, ...(it.props ? { props: it.props } : {}) };
  }
  function zone(x0, y0, width, items, gap = 1) {
    const out = [];
    let x = x0, y = y0, rowH = 0;
    for (const it of items) {
      for (let i = 0; i < (it.n || 1); i++) {
        const f = _fp(it);
        if (x > x0 && x + f.w > x0 + width) { x = x0; y += rowH + gap; rowH = 0; }
        out.push(_entry(it, x, y, i));
        x += f.w + gap;
        rowH = Math.max(rowH, f.h);
      }
    }
    return out;
  }
  const at     = (t, col, row) => ({ type: t, col, row });
  const geoAt  = (col, row) => ({ type: T.GEODEPOSIT, col, row, props: { _revealed: true, _hasWell: false } });
  const coalAt = (col, row) => ({ type: T.COALDEPOSIT, col, row, props: { width: 3, height: 2, _revealed: true, _hasMine: false,
                                                                           coalAmount: 105000, _outputVariance: 1 } });
  const oilAt  = (col, row) => ({ type: T.OILDEPOSIT, col, row, props: { width: 4, height: 4, _revealed: true, _oilPhase: 0,
                                                                          _totalUnits: 30000, _crudeBuffer: 0 } });
  // n deposits in a column, dy tiles apart.
  // A stocked fuel store the client has left for the crew (rods or MOX).
  // Fusion pellets come banked as D-T, the only fuel the Fusion Reactor
  // burns, on a job site as at home (D-He3 is the Advanced Fusion Reactor's).
  // A D-T burn doesn't idle when nothing draws its steam, so the client keeps
  // the bin topped up while the crew is on site (SolidStorageSystem.tick).
  // 'he3pellets' is a bin of D-He3 pellets for an Advanced Fusion Reactor: the
  // same solid as 'pellets' to the Storage Container, told apart by _pelletMode.
  const fuelStore = (kind, col, row) => ({ type: T.SOLIDSTORAGE, col, row,
    props: kind === 'he3pellets' ? { _solidType: 'pellets', _stored: 1000, _pelletMode: 'dhe3' }
         : { _solidType: kind, _stored: 1000, ...(kind === 'pellets' ? { _pelletMode: 'dt' } : {}) } });
  // A Large Helium Gas Field (4x4) - big enough for a Helium Well.
  const _heReserve = () => (typeof oreReserveFor === 'function'
    ? oreReserveFor(4, typeof HELIUM_WELL_RATE !== 'undefined' ? HELIUM_WELL_RATE : 2) : 200000);
  const heliumAt = (col, row) => ({ type: T.HELIUMDEPOSIT, col, row, props: {
    width: 4, height: 4, _revealed: true, _tierLabel: 'Large Helium Gas Field',
    _oreAmount: _heReserve(), _oreMax: _heReserve(), _heliumPhase: 0 } });
  // A Medium ore body (3x3), the size an Ore Mine sits over. Uranium and
  // sulfur are what a crew needs to make its own fuel rods on site (see the
  // full-chain packages below).
  const _oreReserve = () => (typeof oreReserveFor === 'function' ? oreReserveFor(3) : 38000);
  const uraniumAt = (col, row) => { const a = _oreReserve(); return { type: T.URANIUMDEPOSIT, col, row, props: {
    width: 3, height: 3, _revealed: true, _tierLabel: 'Medium Uranium Deposit', _oreAmount: a, _oreMax: a, _uraniumPhase: 0 } }; };
  const sulfurAt  = (col, row) => { const a = _oreReserve(); return { type: T.SULFURDEPOSIT, col, row, props: {
    width: 3, height: 3, _revealed: true, _tierLabel: 'Medium Sulfur Deposit', _oreAmount: a, _oreMax: a, _sulfurPhase: 0 } }; };
  // Lithium, for the full-chain fusion job's tritium. The Lithium Mine (8x10)
  // stands centred over the body, so these are spaced to leave it room.
  const lithiumAt = (col, row) => { const a = (typeof oreReserveFor === 'function' ? oreReserveFor(3, typeof LITHIUM_MINE_RATE !== 'undefined' ? LITHIUM_MINE_RATE : 15) : 190000);
    return { type: T.LITHIUMDEPOSIT, col, row, props: {
      width: 3, height: 3, _revealed: true, _tierLabel: 'Medium Lithium Deposit', _oreAmount: a, _oreMax: a, _lithiumPhase: 0 } }; };
  const column = (make, col, row0, n, dy) => Array.from({ length: n }, (_, i) => make(col, row0 + i * dy));

  const SITES = {

    // ── Ashford Municipal — Coastal Ridge ───────────────────────────
    // A depot with an existing substation and homes already connected,
    // but no generation of its own. Wet, dark, windy — the ridge is the
    // obvious place to put turbines and the run down to the depot is
    // long enough to need thinking about.
    ashford_ridge: {
      id:      'ashford_ridge',
      client:  'Ashford Municipal',
      place:   'Coastal Ridge',
      blurb:   'Our depot has been running off a single feed since the winter storms. ' +
               'We want generation of our own up on the ridge, and something to carry us ' +
               'through the calm hours.',
      bounds:  { cols: 44, rows: 38 },
      arrival: { hour: 18.6, weather: 'rain' },
      work: 'ridge', hub: 'depot',
      // Dusk and overcast: solar would make nothing here.
      generation: [T.WIND, T.WIND2],
      biome: 'coastal',

      markers: {
        ridge: { minC: 4,  minR: 3,  maxC: 18, maxR: 13, label: 'North Ridge' },
        depot: { minC: 26, minR: 21, maxC: 38, maxR: 32, label: 'Ashford Depot' },
      },

      prebuilt: [
        { type: T.SUBSTATION, col: 31, row: 26 },
        { type: T.HOUSE,      col: 28, row: 23 },
        { type: T.HOUSE,      col: 33, row: 23 },
        { type: T.HOUSE,      col: 28, row: 30 },
        { type: T.HOUSE,      col: 34, row: 30 },
        { type: T.LAMP,       col: 31, row: 23 },
        { type: T.LAMP,       col: 31, row: 31 },

        { type: T.TREE, col: 1,  row: 1  }, { type: T.TREE, col: 2,  row: 6  },
        { type: T.TREE, col: 1,  row: 11 }, { type: T.TREE, col: 3,  row: 16 },
        { type: T.TREE, col: 1,  row: 21 }, { type: T.TREE, col: 2,  row: 26 },
        { type: T.TREE, col: 4,  row: 31 }, { type: T.TREE, col: 8,  row: 34 },
        { type: T.TREE, col: 14, row: 35 }, { type: T.TREE, col: 20, row: 33 },
        { type: T.TREE, col: 21, row: 2  }, { type: T.TREE, col: 25, row: 5  },
        { type: T.TREE, col: 30, row: 3  }, { type: T.TREE, col: 36, row: 6  },
        { type: T.TREE, col: 40, row: 12 }, { type: T.TREE, col: 41, row: 19 },
        { type: T.BUSH, col: 6,  row: 20 }, { type: T.BUSH, col: 12, row: 24 },
        { type: T.BUSH, col: 19, row: 18 }, { type: T.BUSH, col: 24, row: 29 },
        { type: T.BUSH, col: 37, row: 16 }, { type: T.BUSH, col: 9,  row: 28 },
      ],
    },

    // ── Calder Water Board — Calder Flats ───────────────────────────
    // Bright, dry and almost empty. The pumping station is the load and
    // it sits a long way from the only sensible build ground, so this
    // site is mostly about the length and protection of the run.
    calder_flats: {
      id:      'calder_flats',
      client:  'Calder Water Board',
      place:   'Calder Flats',
      blurb:   'The pumping station out on the flats runs off a diesel set we can no longer ' +
               'get parts for. There is nothing but sun and space out here; put it to work, ' +
               'and keep the homesteads on the line while you are at it.',
      bounds:  { cols: 42, rows: 32 },
      arrival: { hour: 11.4, weather: 'clear' },
      work: 'flats', hub: 'station',
      // Late morning under clear sky — the one site where solar shines.
      generation: [T.SOLAR, T.SOLAR2, T.WIND],
      biome: 'arid',

      markers: {
        flats:   { minC: 3,  minR: 14, maxC: 20, maxR: 28, label: 'South Flats' },
        station: { minC: 27, minR: 3,  maxC: 39, maxR: 14, label: 'Pumping Station' },
      },

      prebuilt: [
        { type: T.SUBSTATION, col: 32, row: 7 },
        // 5×5 Logistics Depot footprint — sits beside the substation, not on it.
        { type: T.COMMERCIAL, col: 27, row: 3,
          props: { commercialSubtype: 'coldstorage', businessName: 'Calder Pump House' } },
        { type: T.HOUSE, col: 36, row: 4  },
        { type: T.HOUSE, col: 37, row: 11 },
        { type: T.HOUSE, col: 29, row: 12 },
        { type: T.LAMP,  col: 33, row: 11 },
        { type: T.CAMERA, col: 34, row: 3 },

        // Sparse scrub only — the flats should read as open ground.
        { type: T.BUSH, col: 2,  row: 3  }, { type: T.BUSH, col: 8,  row: 8  },
        { type: T.BUSH, col: 14, row: 5  }, { type: T.BUSH, col: 21, row: 10 },
        { type: T.BUSH, col: 5,  row: 30 }, { type: T.BUSH, col: 17, row: 31 },
        { type: T.BUSH, col: 24, row: 24 }, { type: T.BUSH, col: 38, row: 24 },
        { type: T.TREE, col: 11, row: 19 }, { type: T.TREE, col: 25, row: 19 },
        { type: T.TREE, col: 40, row: 29 },
      ],
    },

    // ── Mirebeck Freight — Mirebeck Yard ────────────────────────────
    // A heavy industrial load in poor light, with the yard buildings
    // already dark. Cold storage does not stop drawing overnight, so
    // this is the site where storage genuinely matters.
    mirebeck_yard: {
      id:      'mirebeck_yard',
      client:  'Mirebeck Freight',
      place:   'Mirebeck Yard',
      blurb:   'Half the yard has been dark since the substation was cut over and nobody ' +
               'finished the job. The cold stores cannot ride out another outage. Get us ' +
               'generation on the east bank and everything back on supply.',
      bounds:  { cols: 46, rows: 34 },
      arrival: { hour: 7.2, weather: 'overcast' },
      work: 'bank', hub: 'yard',
      // Early and overcast; wind only.
      generation: [T.WIND, T.WIND2],
      biome: 'industrial',

      markers: {
        bank: { minC: 28, minR: 4,  maxC: 43, maxR: 18, label: 'East Bank' },
        yard: { minC: 3,  minR: 12, maxC: 21, maxR: 29, label: 'Freight Yard' },
      },

      prebuilt: [
        { type: T.SUBSTATION, col: 11, row: 19 },
        // Crude under the east bank. The pump jack goes on the deposit;
        // the tank, refinery and generator go wherever the crew can run
        // pipe between them.
        { type: T.OILDEPOSIT, col: 33, row: 10,
          props: { width: 4, height: 4, _revealed: true, _oilPhase: 0,
                   _totalUnits: 30000, _crudeBuffer: 0 } },
        { type: T.COMMERCIAL, col: 6,  row: 14,
          props: { commercialSubtype: 'coldstorage', businessName: 'Mirebeck Cold Store' } },
        { type: T.COMMERCIAL, col: 16, row: 14,
          props: { commercialSubtype: 'coldstorage', businessName: 'Cold Store No. 2' } },
        { type: T.COMMERCIAL, col: 6,  row: 25,
          props: { commercialSubtype: 'office', businessName: 'Yard Office' } },
        { type: T.HOUSE,  col: 18, row: 25 },
        { type: T.HOUSE,  col: 18, row: 28 },
        { type: T.LAMP,   col: 11, row: 13 },
        { type: T.LAMP,   col: 11, row: 27 },
        { type: T.CAMERA, col: 3,  row: 19 },

        { type: T.TREE, col: 25, row: 2  }, { type: T.TREE, col: 24, row: 8  },
        { type: T.TREE, col: 26, row: 14 }, { type: T.TREE, col: 25, row: 22 },
        { type: T.TREE, col: 24, row: 28 }, { type: T.TREE, col: 27, row: 32 },
        { type: T.TREE, col: 44, row: 24 }, { type: T.TREE, col: 41, row: 30 },
        { type: T.BUSH, col: 23, row: 5  }, { type: T.BUSH, col: 23, row: 18 },
        { type: T.BUSH, col: 23, row: 25 }, { type: T.BUSH, col: 35, row: 26 },
      ],
    },

    // ── Saltmarket Traders — Saltmarket Rows ────────────────────────
    // A high street whose load arrives in a WAVE. The grocer and the
    // cafe are quiet all day and then the evening trade lands on top of
    // the houses at once. You arrive at 17:40 to watch it happen, which
    // makes the storage requirement obvious rather than academic.
    saltmarket_rows: {
      id:      'saltmarket_rows',
      client:  'Saltmarket Traders',
      place:   'Saltmarket Rows',
      blurb:   'We share one tired feed along the whole row. It copes until about six, ' +
               'then the shops open up for the evening and the lights go brown. Give us ' +
               'something of our own that can take the evening.',
      bounds:  { cols: 44, rows: 34 },
      arrival: { hour: 17.7, weather: 'overcast' },
      work: 'common', hub: 'rows',
      requires: () => isUnlocked(T.RESEARCH2),
      generation: [T.WIND2, T.WIND],
      biome: 'market',

      markers: {
        common: { minC: 3,  minR: 3,  maxC: 20, maxR: 17, label: 'The Common' },
        rows:   { minC: 26, minR: 14, maxC: 41, maxR: 30, label: 'Saltmarket Rows' },
      },

      prebuilt: [
        { type: T.SUBSTATION, col: 33, row: 21 },
        { type: T.COMMERCIAL, col: 28, row: 16,
          props: { commercialSubtype: 'grocery', businessName: 'Saltmarket Grocer' } },
        { type: T.COMMERCIAL, col: 38, row: 16,
          props: { commercialSubtype: 'cafe', businessName: 'The Sail & Anchor' } },
        { type: T.COMMERCIAL, col: 28, row: 27,
          props: { commercialSubtype: 'clinic', businessName: 'Rows Clinic' } },
        { type: T.HOUSE,  col: 34, row: 16 },
        { type: T.HOUSE,  col: 38, row: 27 },
        { type: T.LAMP,   col: 33, row: 18 },
        { type: T.LAMP,   col: 33, row: 26 },
        { type: T.CAMERA, col: 26, row: 21 },

        { type: T.TREE, col: 22, row: 4  }, { type: T.TREE, col: 23, row: 12 },
        { type: T.TREE, col: 22, row: 20 }, { type: T.TREE, col: 24, row: 31 },
        { type: T.TREE, col: 1,  row: 22 }, { type: T.TREE, col: 8,  row: 26 },
        { type: T.TREE, col: 15, row: 30 }, { type: T.TREE, col: 42, row: 6  },
        { type: T.BUSH, col: 6,  row: 20 }, { type: T.BUSH, col: 17, row: 22 },
        { type: T.BUSH, col: 24, row: 8  }, { type: T.BUSH, col: 12, row: 33 },
      ],
    },

    // ── Tarn Hollow Ironworks — Tarn Hollow Works ───────────────────
    // The opposite shape: two shop floors that draw hard from seven to
    // seven and nothing at all overnight. You arrive at 09:00 with the
    // works already running, so the whole load is in your face from the
    // first minute — and it is the one heavy site where solar is worth
    // building, because the demand is only ever there in daylight.
    tarn_hollow: {
      id:      'tarn_hollow',
      client:  'Tarn Hollow Ironworks',
      place:   'Tarn Hollow Works',
      blurb:   'Both shop floors run seven to seven and we are drawing more than the old ' +
               'feed can carry. Overnight we need almost nothing. Build us something that ' +
               'covers the shift.',
      bounds:  { cols: 48, rows: 36 },
      arrival: { hour: 9.0, weather: 'clear' },
      work: 'scarp', hub: 'works',
      requires: () => isUnlocked(T.RESEARCH2),
      generation: [T.SOLAR2, T.WIND2, T.SOLAR, T.WIND],
      biome: 'industrial',

      markers: {
        scarp: { minC: 2,  minR: 15, maxC: 22, maxR: 33, label: 'The Scarp' },
        works: { minC: 28, minR: 3,  maxC: 45, maxR: 21, label: 'Tarn Hollow Works' },
      },

      prebuilt: [
        { type: T.SUBSTATION, col: 36, row: 12 },
        // Daytime-only draw: no minDraw means the curve treats these as a
        // 07:00-19:00 shift, which is the whole character of the site.
        { type: T.INDUSTRIAL, col: 30, row: 5,
          props: { commercialSubtype: 'factory', peakDraw: 30, businessName: 'No. 1 Shop Floor' } },
        { type: T.INDUSTRIAL, col: 41, row: 5,
          props: { commercialSubtype: 'factory', peakDraw: 30, businessName: 'No. 2 Shop Floor' } },
        { type: T.COMMERCIAL, col: 30, row: 18,
          props: { commercialSubtype: 'office', businessName: 'Works Office' } },
        { type: T.HOUSE,  col: 43, row: 18 },
        { type: T.LAMP,   col: 36, row: 17 },
        { type: T.CAMERA, col: 28, row: 12 },

        { type: T.TREE, col: 25, row: 2  }, { type: T.TREE, col: 24, row: 10 },
        { type: T.TREE, col: 25, row: 19 }, { type: T.TREE, col: 24, row: 27 },
        { type: T.TREE, col: 26, row: 34 }, { type: T.TREE, col: 46, row: 28 },
        { type: T.BUSH, col: 4,  row: 6  }, { type: T.BUSH, col: 13, row: 9  },
        { type: T.BUSH, col: 20, row: 5  }, { type: T.BUSH, col: 8,  row: 34 },
        { type: T.BUSH, col: 33, row: 30 }, { type: T.BUSH, col: 44, row: 33 },
      ],
    },

    // ── Halloway County — Halloway Civic Quarter ────────────────────
    // The heavy one, and the one that must not fail: a hospital and a
    // courthouse that draw around the clock. You arrive at 02:40 in the
    // dark, which rules solar out entirely and makes the scale of the
    // job immediately obvious. Gated on Wind MK2 — this is not a
    // contract to attempt on five-watt turbines.
    halloway_civic: {
      id:      'halloway_civic',
      client:  'Halloway County',
      place:   'Halloway Civic Quarter',
      blurb:   'The hospital has been on a standby set for three weeks and the county will ' +
               'not carry the risk any longer. We need our own supply, and it cannot go ' +
               'down, not for a minute, not at four in the morning.',
      bounds:  { cols: 52, rows: 38 },
      arrival: { hour: 2.7, weather: 'overcast' },
      work: 'moor', hub: 'quarter',
      requires: () => isUnlocked(T.WIND2),
      generation: [T.WIND2, T.WIND],
      biome: 'nocturne',

      markers: {
        moor:    { minC: 2,  minR: 3,  maxC: 24, maxR: 22, label: 'Halloway Moor' },
        quarter: { minC: 30, minR: 10, maxC: 49, maxR: 34, label: 'Civic Quarter' },
      },

      prebuilt: [
        { type: T.SUBSTATION, col: 39, row: 21 },
        { type: T.HOSPITAL,   col: 32, row: 12 },
        { type: T.COURTHOUSE, col: 43, row: 12 },
        { type: T.HOUSE,  col: 32, row: 30 },
        { type: T.HOUSE,  col: 36, row: 30 },
        { type: T.LAMP,   col: 39, row: 19 },
        { type: T.LAMP,   col: 39, row: 29 },
        { type: T.CAMERA, col: 30, row: 21 },

        { type: T.TREE, col: 26, row: 4  }, { type: T.TREE, col: 27, row: 13 },
        { type: T.TREE, col: 26, row: 22 }, { type: T.TREE, col: 27, row: 31 },
        { type: T.TREE, col: 1,  row: 27 }, { type: T.TREE, col: 10, row: 31 },
        { type: T.TREE, col: 19, row: 29 }, { type: T.TREE, col: 50, row: 6  },
        { type: T.BUSH, col: 5,  row: 25 }, { type: T.BUSH, col: 14, row: 26 },
        { type: T.BUSH, col: 22, row: 25 }, { type: T.BUSH, col: 47, row: 36 },
      ],
    },

    // ══ LONG-RUN SITES ══════════════════════════════════════════════
    //
    // Heavy industry sits where the resource is, which is never where the
    // good build ground is. These sites put the two 25-40 tiles apart, so
    // the job stops being "install plant" and becomes "get the power all
    // the way over there": a wire every 3 tiles needs a pole, the run has
    // to be protected end to end, and the materials estimate rises with
    // every tile of it. The client is the industry — the player is not
    // asked to build a fuel chain on a three-day deadline, they are asked
    // to feed one that already exists.

    // ── Draycott Coal Co. — Draycott Colliery ───────────────────────
    draycott_colliery: {
      id:      'draycott_colliery',
      client:  'Draycott Coal Co.',
      place:   'Draycott Colliery',
      blurb:   'The workings are a fair way out from anywhere you would want to build. We ' +
               'have been running the cutters off a diesel set and it is costing us more ' +
               'than the coal is worth. Bring us a proper feed off the fell.',
      bounds:  { cols: 70, rows: 38 },
      arrival: { hour: 6.4, weather: 'overcast' },
      work: 'fell', hub: 'colliery',
      requires: () => isUnlocked(T.RESEARCH2),
      generation: [T.WIND2, T.WIND],
      biome: 'industrial',

      markers: {
        fell:      { minC: 2,  minR: 4,  maxC: 18, maxR: 26, label: 'Draycott Fell' },
        colliery:  { minC: 48, minR: 10, maxC: 67, maxR: 31, label: 'The Colliery' },
      },

      // Standing water on the fell. A water extractor needs a clear 4x4 of
      // lake and a coal set needs an extractor, so this is what makes coal
      // an option here at all.
      water: [
        { minC: 6, minR: 20, maxC: 13, maxR: 25 },
      ],

      prebuilt: [
        { type: T.SUBSTATION, col: 56, row: 20 },
        // Coal in the fell as well as under the colliery — the client
        // would rather burn what is under the build ground than keep
        // paying for the diesel set. Sized and stocked the way
        // CoalSystem's own spawner does it, since the mining code reads
        // these straight off the deposit.
        { type: T.COALDEPOSIT, col: 4,  row: 6,
          props: { width: 3, height: 2, _revealed: true, _hasMine: false,
                   coalAmount: 105000, _outputVariance: 1 } },
        { type: T.COALDEPOSIT, col: 13, row: 8,
          props: { width: 3, height: 2, _revealed: true, _hasMine: false,
                   coalAmount: 105000, _outputVariance: 1 } },
        { type: T.COALMINE,   col: 51, row: 13 },
        { type: T.COALMINE,   col: 62, row: 13 },
        { type: T.COMMERCIAL, col: 51, row: 26,
          props: { commercialSubtype: 'office', businessName: 'Colliery Office' } },
        { type: T.HOUSE,  col: 62, row: 27 },
        { type: T.HOUSE,  col: 66, row: 22 },
        { type: T.LAMP,   col: 56, row: 17 },
        { type: T.LAMP,   col: 56, row: 25 },
        { type: T.CAMERA, col: 49, row: 20 },

        { type: T.TREE, col: 22, row: 3  }, { type: T.TREE, col: 26, row: 11 },
        { type: T.TREE, col: 24, row: 20 }, { type: T.TREE, col: 28, row: 29 },
        { type: T.TREE, col: 34, row: 6  }, { type: T.TREE, col: 38, row: 24 },
        { type: T.TREE, col: 43, row: 33 }, { type: T.TREE, col: 1,  row: 31 },
        { type: T.BUSH, col: 20, row: 15 }, { type: T.BUSH, col: 31, row: 18 },
        { type: T.BUSH, col: 36, row: 33 }, { type: T.BUSH, col: 45, row: 4  },
      ],
    },

    // ── Ferrow Water Board — Ferrow Catchment ───────────────────────
    ferrow_catchment: {
      id:      'ferrow_catchment',
      client:  'Ferrow Water Board',
      place:   'Ferrow Catchment',
      blurb:   'Three extraction sets serve half the county and every one of them is on the ' +
               'end of a line we do not trust. The catchment is miles from the high ground. ' +
               'Run us something that will not drop when the weather turns.',
      bounds:  { cols: 66, rows: 40 },
      arrival: { hour: 5.6, weather: 'rain' },
      work: 'tops', hub: 'pumphouse',
      requires: () => isUnlocked(T.RESEARCH2),
      generation: [T.WIND2, T.WIND],
      biome: 'coastal',

      markers: {
        tops:      { minC: 2,  minR: 3,  maxC: 18, maxR: 25, label: 'Ferrow Tops' },
        pumphouse: { minC: 44, minR: 12, maxC: 63, maxR: 34, label: 'Catchment Pumphouse' },
      },

      prebuilt: [
        { type: T.SUBSTATION,     col: 52, row: 22 },
        { type: T.WATEREXTRACTOR, col: 46, row: 14 },
        { type: T.WATEREXTRACTOR, col: 57, row: 14 },
        { type: T.WATEREXTRACTOR, col: 46, row: 28 },
        { type: T.HOUSE,  col: 58, row: 29 },
        { type: T.LAMP,   col: 52, row: 19 },
        { type: T.LAMP,   col: 52, row: 27 },
        { type: T.CAMERA, col: 44, row: 22 },

        { type: T.TREE, col: 21, row: 5  }, { type: T.TREE, col: 25, row: 14 },
        { type: T.TREE, col: 22, row: 23 }, { type: T.TREE, col: 27, row: 32 },
        { type: T.TREE, col: 33, row: 9  }, { type: T.TREE, col: 37, row: 27 },
        { type: T.TREE, col: 41, row: 36 }, { type: T.TREE, col: 1,  row: 33 },
        { type: T.BUSH, col: 19, row: 18 }, { type: T.BUSH, col: 30, row: 20 },
        { type: T.BUSH, col: 35, row: 35 }, { type: T.BUSH, col: 42, row: 5  },
      ],
    },

    // ── Kestrel Point Refining — Kestrel Point ──────────────────────
    kestrel_point: {
      id:      'kestrel_point',
      client:  'Kestrel Point Refining',
      place:   'Kestrel Point',
      blurb:   'Wells, cracking plant, tank farm and the forecourt, all of it out on the ' +
               'point. Nothing will grow there and nothing will generate there either. The ' +
               'only ground worth building on is back up the headland.',
      bounds:  { cols: 78, rows: 42 },
      arrival: { hour: 13.2, weather: 'clear' },
      work: 'headland', hub: 'point',
      requires: () => isUnlocked(T.RESEARCH3),
      generation: [T.WIND3, T.SOLAR2, T.WIND2, T.WIND],
      biome: 'arid',

      markers: {
        headland: { minC: 2,  minR: 4,  maxC: 20, maxR: 28, label: 'Kestrel Headland' },
        point:    { minC: 52, minR: 8,  maxC: 75, maxR: 36, label: 'The Point' },
      },

      prebuilt: [
        { type: T.SUBSTATION,  col: 62, row: 22 },
        { type: T.PUMPJACK,    col: 54, row: 10 },
        { type: T.PUMPJACK,    col: 54, row: 30 },
        { type: T.REFINERY,    col: 62, row: 9  },
        { type: T.OILSTORAGE,  col: 70, row: 16 },
        { type: T.GASSTATION,  col: 62, row: 29 },
        { type: T.HOUSE,  col: 71, row: 31 },
        { type: T.LAMP,   col: 60, row: 22 },
        { type: T.CAMERA, col: 52, row: 22 },

        { type: T.TREE, col: 24, row: 6  }, { type: T.TREE, col: 28, row: 16 },
        { type: T.TREE, col: 25, row: 27 }, { type: T.TREE, col: 32, row: 35 },
        { type: T.BUSH, col: 22, row: 12 }, { type: T.BUSH, col: 35, row: 8  },
        { type: T.BUSH, col: 40, row: 22 }, { type: T.BUSH, col: 44, row: 33 },
        { type: T.BUSH, col: 47, row: 5  }, { type: T.BUSH, col: 30, row: 40 },
      ],
    },

    // ── Stallbeck Geothermal — Stallbeck Field ──────────────────────
    // A field mid-commissioning: the wells are sunk and their pumps are
    // drawing, but the turbines are not in yet, so the field cannot yet
    // power itself. Until it can, it needs feeding from outside — and the
    // only buildable ground is back up the valley.
    stallbeck_field: {
      id:      'stallbeck_field',
      client:  'Stallbeck Geothermal',
      place:   'Stallbeck Field',
      blurb:   'Four wells sunk and every pump on them drawing, but the turbines are still ' +
               'on a lorry somewhere. Until the field can carry itself we need power brought ' +
               'in over the valley, and we cannot stop the pumps to wait for it.',
      bounds:  { cols: 72, rows: 40 },
      arrival: { hour: 4.3, weather: 'overcast' },
      work: 'valleyhead', hub: 'field',
      requires: () => isUnlocked(T.GEOWELL),
      generation: [T.WIND3, T.WIND2, T.WIND],
      biome: 'nocturne',

      markers: {
        valleyhead: { minC: 2,  minR: 4,  maxC: 20, maxR: 27, label: 'Valley Head' },
        field:      { minC: 48, minR: 8,  maxC: 69, maxR: 34, label: 'Stallbeck Field' },
      },

      prebuilt: [
        { type: T.SUBSTATION, col: 58, row: 21 },
        { type: T.GEOWELL,    col: 50, row: 10 },
        { type: T.GEOWELL,    col: 64, row: 10 },
        { type: T.GEOWELL,    col: 50, row: 29 },
        { type: T.GEOWELL,    col: 64, row: 29 },
        { type: T.COMMERCIAL, col: 56, row: 29,
          props: { commercialSubtype: 'office', businessName: 'Field Office' } },
        { type: T.HOUSE,  col: 66, row: 21 },
        { type: T.LAMP,   col: 58, row: 18 },
        { type: T.LAMP,   col: 58, row: 26 },
        { type: T.CAMERA, col: 48, row: 21 },

        // Heat under the valley head as well as under the field — the
        // client would rather the crew tapped it than trucked more wind
        // kit up the valley. A well is 3x3 and its turbine 5x4, so these
        // sit well apart from each other.
        { type: T.GEODEPOSIT, col: 4,  row: 6,  props: { _revealed: true, _hasWell: false } },
        { type: T.GEODEPOSIT, col: 13, row: 6,  props: { _revealed: true, _hasWell: false } },
        { type: T.GEODEPOSIT, col: 4,  row: 19, props: { _revealed: true, _hasWell: false } },
        { type: T.GEODEPOSIT, col: 13, row: 19, props: { _revealed: true, _hasWell: false } },

        { type: T.TREE, col: 23, row: 6  }, { type: T.TREE, col: 27, row: 16 },
        { type: T.TREE, col: 24, row: 25 }, { type: T.TREE, col: 30, row: 34 },
        { type: T.TREE, col: 36, row: 11 }, { type: T.TREE, col: 41, row: 29 },
        { type: T.BUSH, col: 21, row: 20 }, { type: T.BUSH, col: 33, row: 22 },
        { type: T.BUSH, col: 39, row: 37 }, { type: T.BUSH, col: 45, row: 7  },
      ],
    },

    // ── Vance Ridge Authority — Vance Ridge Complex ─────────────────
    // The longest run in the game and the heaviest load: a reprocessing
    // complex that draws around 150 kW flat and cannot be fed from anywhere
    // near itself.
    vance_ridge: {
      id:      'vance_ridge',
      client:  'Vance Ridge Authority',
      place:   'Vance Ridge Complex',
      blurb:   'Reprocessing, wash tower, cooling; the whole complex, and none of it may ' +
               'be interrupted. The exclusion zone means you build on the far ridge and ' +
               'bring it across. We are aware of what we are asking for.',
      bounds:  { cols: 90, rows: 46 },
      arrival: { hour: 21.4, weather: 'overcast' },
      work: 'farridge', hub: 'complex',
      requires: () => isUnlocked(T.MK4RESEARCH),
      generation: [T.WIND3, T.WIND2, T.WIND],
      biome: 'nocturne',

      markers: {
        farridge: { minC: 2,  minR: 4,  maxC: 24, maxR: 34, label: 'Far Ridge' },
        complex:  { minC: 60, minR: 6,  maxC: 87, maxR: 40, label: 'Vance Ridge Complex' },
      },

      prebuilt: [
        // Laid out to the buildings' real footprints (the wash tower is 20x20),
        // which the first version of this site overlapped.
        { type: T.SUBSTATION,    col: 66, row: 38 },
        { type: T.WASHTOWER,     col: 60, row: 6  },
        { type: T.FUELPLANT,     col: 62, row: 28 },
        { type: T.CHEMICALPLANT, col: 80, row: 8  },
        { type: T.COOLINGTOWER,  col: 73, row: 28 },
        { type: T.HOUSE,  col: 84, row: 32 },
        { type: T.HOUSE,  col: 84, row: 38 },
        { type: T.LAMP,   col: 58, row: 20 },
        { type: T.LAMP,   col: 58, row: 30 },
        { type: T.CAMERA, col: 58, row: 14 },

        // Heat on the far ridge. The exclusion zone already forces the
        // build over here, and a 150 kW complex on wind alone is a field of
        // sixteen turbines — this gives the job somewhere denser to go.
        { type: T.GEODEPOSIT, col: 4,  row: 6,  props: { _revealed: true, _hasWell: false } },
        { type: T.GEODEPOSIT, col: 13, row: 6,  props: { _revealed: true, _hasWell: false } },
        { type: T.GEODEPOSIT, col: 4,  row: 17, props: { _revealed: true, _hasWell: false } },
        { type: T.GEODEPOSIT, col: 13, row: 17, props: { _revealed: true, _hasWell: false } },
        { type: T.GEODEPOSIT, col: 4,  row: 28, props: { _revealed: true, _hasWell: false } },
        { type: T.GEODEPOSIT, col: 13, row: 28, props: { _revealed: true, _hasWell: false } },

        { type: T.TREE, col: 28, row: 5  }, { type: T.TREE, col: 32, row: 15 },
        { type: T.TREE, col: 29, row: 26 }, { type: T.TREE, col: 35, row: 37 },
        { type: T.TREE, col: 42, row: 10 }, { type: T.TREE, col: 47, row: 30 },
        { type: T.BUSH, col: 26, row: 20 }, { type: T.BUSH, col: 38, row: 24 },
        { type: T.BUSH, col: 45, row: 43 }, { type: T.BUSH, col: 52, row: 6  },
        { type: T.BUSH, col: 55, row: 35 }, { type: T.BUSH, col: 50, row: 20 },
      ],
    },

    // ═══ Late-game sites ═══════════════════════════════════════════════
    // Three at MK3 and three at MK4, small / medium / large in each band. A
    // job's pay follows its size (complexityOf), so the spread of sites is
    // what puts a range of jobs on the board. Each one is a heavy public or
    // industrial load, far from anywhere the crew could build, and carries
    // its own deposits so coal, oil and geothermal chains are possible where
    // the player has proven they can run them (see `established`).

    // ── Ostrey Rail — Ostrey Junction (MK3, small) ──────────────────
    // A junction on a single-track line, dark since the overhead feed failed.
    // A night arrival and a wet moor: wind is all there is to build on.
    ostrey_junction: {
      id:      'ostrey_junction',
      client:  'Ostrey Rail',
      place:   'Ostrey Junction',
      blurb:   'The overhead feed to the junction failed in the autumn and the signal boxes ' +
               'have been on batteries since. Trains are being held at the border of the ' +
               'moor. We need the junction on its own supply before the timetable change.',
      bounds:  { cols: 60, rows: 36 },
      arrival: { hour: 22.2, weather: 'rain' },
      work: 'moor', hub: 'junction',
      requires: () => isUnlocked(T.RESEARCH3),
      generation: [T.WIND3, T.WIND2],
      biome: 'nocturne',

      markers: {
        moor:     { minC: 2,  minR: 4,  maxC: 22, maxR: 30, label: 'Ostrey Moor' },
        junction: { minC: 30, minR: 5,  maxC: 56, maxR: 31, label: 'Ostrey Junction' },
      },

      prebuilt: [
        { type: T.SUBSTATION2,   col: 42, row: 19 },
        { type: T.TRANSPORTHUB,  col: 32, row: 7  },
        { type: T.COMMERCIAL, col: 46, row: 9,
          props: { commercialSubtype: 'office', businessName: 'Signal Control' } },
        { type: T.COMMERCIAL, col: 47, row: 22,
          props: { commercialSubtype: 'coldstorage', businessName: 'Freight Cold Store' } },
        { type: T.HOUSE,  col: 32, row: 22 },
        { type: T.HOUSE,  col: 37, row: 26 },
        { type: T.HOUSE,  col: 52, row: 14 },
        { type: T.LAMP,   col: 42, row: 16 }, { type: T.LAMP, col: 42, row: 24 },
        { type: T.CAMERA, col: 30, row: 18 },

        { type: T.TREE, col: 25, row: 6  }, { type: T.TREE, col: 26, row: 18 },
        { type: T.TREE, col: 24, row: 29 }, { type: T.BUSH, col: 27, row: 12 },
        { type: T.BUSH, col: 27, row: 24 }, { type: T.BUSH, col: 55, row: 33 },
      ],
    },

    // ── Marlowe Health Trust — Marlowe Campus (MK3, medium) ─────────
    // A teaching hospital and the university around it, on a ridge with
    // heat under it. The trust wants two independent supplies.
    marlowe_campus: {
      id:      'marlowe_campus',
      client:  'Marlowe Health Trust',
      place:   'Marlowe Campus',
      blurb:   'Wards, lecture halls and the emergency unit all hang off one ageing feeder. ' +
               'Nothing here can go dark for an hour, let alone a night. Build us generation ' +
               'of our own on the ridge and prove it will carry the whole campus.',
      bounds:  { cols: 70, rows: 44 },
      arrival: { hour: 14.3, weather: 'overcast' },
      work: 'ridge', hub: 'campus',
      requires: () => isUnlocked(T.RESEARCH3),
      generation: [T.WIND3, T.SOLAR2, T.WIND2],
      biome: 'coastal',

      markers: {
        ridge:  { minC: 2,  minR: 4,  maxC: 24, maxR: 36, label: 'Marlowe Ridge' },
        campus: { minC: 36, minR: 5,  maxC: 66, maxR: 40, label: 'Marlowe Campus' },
      },

      prebuilt: [
        { type: T.SUBSTATION3,  col: 50, row: 22 },
        { type: T.UNIVERSITY,   col: 38, row: 7  },
        { type: T.HOSPITAL,     col: 54, row: 8  },
        { type: T.EMS,          col: 54, row: 15 },
        { type: T.COMMERCIAL, col: 40, row: 28,
          props: { commercialSubtype: 'office', businessName: 'Trust Administration' } },
        { type: T.COMMERCIAL, col: 46, row: 32,
          props: { commercialSubtype: 'coldstorage', businessName: 'Pharmacy Store' } },
        { type: T.COMMERCIAL, col: 58, row: 30,
          props: { commercialSubtype: 'office', businessName: 'Outpatient Clinic' } },
        { type: T.HOUSE,  col: 60, row: 22 },
        { type: T.HOUSE,  col: 64, row: 26 },
        { type: T.HOUSE,  col: 38, row: 35 },
        { type: T.LAMP,   col: 50, row: 18 }, { type: T.LAMP, col: 50, row: 28 },
        { type: T.LAMP,   col: 44, row: 22 },
        { type: T.CAMERA, col: 36, row: 22 }, { type: T.CAMERA, col: 66, row: 22 },

        // Heat under the ridge as well as under the wards.
        { type: T.GEODEPOSIT, col: 4,  row: 6,  props: { _revealed: true, _hasWell: false } },
        { type: T.GEODEPOSIT, col: 13, row: 6,  props: { _revealed: true, _hasWell: false } },
        { type: T.GEODEPOSIT, col: 4,  row: 19, props: { _revealed: true, _hasWell: false } },
        { type: T.GEODEPOSIT, col: 13, row: 19, props: { _revealed: true, _hasWell: false } },

        { type: T.TREE, col: 28, row: 8  }, { type: T.TREE, col: 30, row: 22 },
        { type: T.TREE, col: 27, row: 34 }, { type: T.BUSH, col: 32, row: 14 },
        { type: T.BUSH, col: 32, row: 30 }, { type: T.BUSH, col: 66, row: 42 },
      ],
    },

    // ── Skerry Aviation Authority — Skerry Airfield (MK3, large) ────
    // An airfield and its freight terminal on the coast, with crude and coal
    // both in the ground behind it and a lake to cool a plant with.
    skerry_airfield: {
      id:      'skerry_airfield',
      client:  'Skerry Aviation Authority',
      place:   'Skerry Airfield',
      comfort: 26,
      blurb:   'The runway lights, the terminal and the freight hall all draw from a diesel ' +
               'plant older than the airfield. We have crude and coal behind the dunes and ' +
               'nobody who knows how to use them. First flight is at dawn; we need a proper ' +
               'supply, and we need to know it will hold.',
      bounds:  { cols: 100, rows: 52 },
      arrival: { hour: 5.6, weather: 'clear' },
      work: 'dunes', hub: 'field',
      requires: () => isUnlocked(T.RESEARCH3),
      generation: [T.WIND3, T.SOLAR2],
      biome: 'coastal',

      markers: {
        dunes: { minC: 2,  minR: 4,  maxC: 34, maxR: 46, label: 'Skerry Dunes' },
        field: { minC: 46, minR: 5,  maxC: 96, maxR: 48, label: 'Skerry Airfield' },
      },

      water: [
        { minC: 22, minR: 34, maxC: 31, maxR: 42 },
      ],

      prebuilt: [
        { type: T.SUBSTATION3,   col: 70, row: 30 },
        { type: T.AIRPORT,       col: 52, row: 8  },
        { type: T.TRANSPORTHUB,  col: 52, row: 32 },
        { type: T.GASSTATION,    col: 64, row: 38 },
        { type: T.COMMERCIAL, col: 84, row: 10,
          props: { commercialSubtype: 'coldstorage', businessName: 'Freight Hall Cold Store' } },
        { type: T.COMMERCIAL, col: 84, row: 19,
          props: { commercialSubtype: 'office', businessName: 'Airfield Operations' } },
        { type: T.COMMERCIAL, col: 84, row: 28,
          props: { commercialSubtype: 'office', businessName: 'Customs House' } },
        { type: T.HOUSE,  col: 78, row: 36 },
        { type: T.HOUSE,  col: 84, row: 40 },
        { type: T.HOUSE,  col: 90, row: 36 },
        { type: T.LAMP,   col: 70, row: 26 }, { type: T.LAMP, col: 70, row: 36 },
        { type: T.LAMP,   col: 60, row: 30 },
        { type: T.CAMERA, col: 46, row: 30 }, { type: T.CAMERA, col: 94, row: 30 },

        // Crude and coal behind the dunes, and a lake to feed a coal set.
        { type: T.OILDEPOSIT, col: 4,  row: 6,  props: { width: 4, height: 4, _revealed: true, _oilPhase: 0,
                                                            _totalUnits: 30000, _crudeBuffer: 0 } },
        { type: T.OILDEPOSIT, col: 4,  row: 18, props: { width: 4, height: 4, _revealed: true, _oilPhase: 0,
                                                            _totalUnits: 30000, _crudeBuffer: 0 } },
        { type: T.OILDEPOSIT, col: 4,  row: 30, props: { width: 4, height: 4, _revealed: true, _oilPhase: 0,
                                                            _totalUnits: 30000, _crudeBuffer: 0 } },
        { type: T.COALDEPOSIT, col: 16, row: 6,  props: { width: 3, height: 2, _revealed: true, _hasMine: false,
                                                            coalAmount: 105000, _outputVariance: 1 } },
        { type: T.COALDEPOSIT, col: 16, row: 14, props: { width: 3, height: 2, _revealed: true, _hasMine: false,
                                                            coalAmount: 105000, _outputVariance: 1 } },
        { type: T.COALDEPOSIT, col: 16, row: 22, props: { width: 3, height: 2, _revealed: true, _hasMine: false,
                                                            coalAmount: 105000, _outputVariance: 1 } },

        { type: T.TREE, col: 38, row: 10 }, { type: T.TREE, col: 40, row: 26 },
        { type: T.TREE, col: 37, row: 40 }, { type: T.BUSH, col: 40, row: 18 },
        { type: T.BUSH, col: 41, row: 34 }, { type: T.BUSH, col: 98, row: 50 },
      ],
    },

    // ── Corvane Freight & Rail — Corvane Exchange (MK4, small) ──────
    // A freight exchange where two main lines cross, with a training college
    // beside it. Small next to what MK4 can build, but it never stops.
    corvane_exchange: {
      id:      'corvane_exchange',
      client:  'Corvane Freight & Rail',
      place:   'Corvane Exchange',
      comfort: 20,
      blurb:   'Two main lines cross here and neither may stop: the exchange runs day and ' +
               'night and the college beside it trains the crews. The heat under the escarpment ' +
               'is going to waste. Put it to work and give us a supply that holds.',
      bounds:  { cols: 76, rows: 42 },
      arrival: { hour: 3.4, weather: 'overcast' },
      work: 'escarpment', hub: 'exchange',
      requires: () => isUnlocked(T.MK4RESEARCH),
      generation: [T.WIND3, T.WIND2],
      biome: 'nocturne',

      markers: {
        escarpment: { minC: 2,  minR: 4,  maxC: 26, maxR: 36, label: 'The Escarpment' },
        exchange:   { minC: 36, minR: 5,  maxC: 72, maxR: 38, label: 'Corvane Exchange' },
      },

      prebuilt: [
        { type: T.SUBSTATION3,  col: 54, row: 20 },
        { type: T.TRANSPORTHUB, col: 38, row: 7  },
        { type: T.TRANSPORTHUB, col: 38, row: 26 },
        { type: T.UNIVERSITY,   col: 58, row: 8  },
        { type: T.COMMERCIAL, col: 62, row: 26,
          props: { commercialSubtype: 'office', businessName: 'Dispatch Office' } },
        { type: T.COMMERCIAL, col: 62, row: 32,
          props: { commercialSubtype: 'coldstorage', businessName: 'Bonded Cold Store' } },
        { type: T.HOUSE,  col: 46, row: 36 },
        { type: T.HOUSE,  col: 68, row: 20 },
        { type: T.LAMP,   col: 54, row: 16 }, { type: T.LAMP, col: 54, row: 26 },
        { type: T.LAMP,   col: 52, row: 34 },
        { type: T.CAMERA, col: 36, row: 20 },

        { type: T.GEODEPOSIT, col: 4,  row: 6,  props: { _revealed: true, _hasWell: false } },
        { type: T.GEODEPOSIT, col: 13, row: 6,  props: { _revealed: true, _hasWell: false } },
        { type: T.GEODEPOSIT, col: 4,  row: 17, props: { _revealed: true, _hasWell: false } },
        { type: T.GEODEPOSIT, col: 13, row: 17, props: { _revealed: true, _hasWell: false } },
        { type: T.GEODEPOSIT, col: 4,  row: 28, props: { _revealed: true, _hasWell: false } },
        { type: T.GEODEPOSIT, col: 13, row: 28, props: { _revealed: true, _hasWell: false } },

        { type: T.TREE, col: 30, row: 8  }, { type: T.TREE, col: 31, row: 24 },
        { type: T.TREE, col: 29, row: 38 }, { type: T.BUSH, col: 32, row: 15 },
        { type: T.BUSH, col: 33, row: 31 }, { type: T.BUSH, col: 74, row: 40 },
      ],
    },

    // ── Dunmere Nuclear Services — Dunmere Fuel Works (MK4, medium) ─
    // A fuel-cycle works: fabrication, isotope wash and waste handling, all
    // of which have to stay powered through any shutdown.
    dunmere_fuel_works: {
      id:      'dunmere_fuel_works',
      client:  'Dunmere Nuclear Services',
      place:   'Dunmere Fuel Works',
      comfort: 30,
      blurb:   'Fabrication, the wash tower and the waste hall; a fuel-cycle works cannot ' +
               'simply switch off. The regulator wants a second supply that does not depend ' +
               'on the national line, and wants to see it hold. We have coal and crude on ' +
               'the estate and no other use for them.',
      bounds:  { cols: 110, rows: 60 },
      arrival: { hour: 8.5, weather: 'overcast' },
      work: 'estate', hub: 'works',
      requires: () => isUnlocked(T.MK4RESEARCH),
      generation: [T.WIND3, T.SOLAR2],
      biome: 'industrial',

      markers: {
        estate: { minC: 2,  minR: 4,  maxC: 48, maxR: 54, label: 'Dunmere Estate' },
        works:  { minC: 52, minR: 5,  maxC: 106, maxR: 56, label: 'Dunmere Fuel Works' },
      },

      water: [
        { minC: 26, minR: 42, maxC: 36, maxR: 52 },
      ],

      prebuilt: [
        { type: T.SUBSTATION3,     col: 76, row: 30 },
        { type: T.MOXPLANT,        col: 56, row: 8  },
        { type: T.WASHTOWER,       col: 82, row: 8  },
        { type: T.NUCLEARWASTE,    col: 56, row: 34 },
        { type: T.CHEMICALPLANT,   col: 90, row: 36 },
        { type: T.FUELPLANT,       col: 90, row: 46 },
        { type: T.TRANSPORTHUB,    col: 60, row: 48 },
        { type: T.TRANSPORTHUB,    col: 74, row: 46 },
        { type: T.COMMERCIAL, col: 103, row: 8,
          props: { commercialSubtype: 'office', businessName: 'Regulator Liaison' } },
        { type: T.COMMERCIAL, col: 103, row: 18,
          props: { commercialSubtype: 'coldstorage', businessName: 'Isotope Cold Store' } },
        { type: T.HOUSE,  col: 100, row: 30 },
        { type: T.HOUSE,  col: 100, row: 40 },
        { type: T.LAMP,   col: 76, row: 26 }, { type: T.LAMP, col: 76, row: 36 },
        { type: T.LAMP,   col: 68, row: 30 },
        { type: T.CAMERA, col: 52, row: 30 }, { type: T.CAMERA, col: 104, row: 30 },

        // Coal and crude are worked from a cluster at the west edge, and the
        // client's fuel stores sit beside it — which leaves the rest of the
        // estate as open ground for a reactor, its towers and turbines.
        ...column(coalAt, 4, 6, 4, 8), ...column(oilAt, 10, 6, 4, 8),
        fuelStore('rods', 16, 6), fuelStore('mox', 16, 13),

        { type: T.TREE, col: 44, row: 10 }, { type: T.TREE, col: 46, row: 28 },
        { type: T.TREE, col: 43, row: 46 }, { type: T.BUSH, col: 47, row: 18 },
        { type: T.BUSH, col: 46, row: 38 }, { type: T.BUSH, col: 108, row: 58 },
      ],
    },

    // ── Halden Port Authority — Halden Freeport (MK4, large) ────────
    // A deep-water freeport, its airfield and rail terminals: the heaviest
    // load in the game and the longest lead time. The authority has coal,
    // crude and steam heat all within reach and expects it all to be used.
    halden_freeport: {
      id:      'halden_freeport',
      client:  'Halden Port Authority',
      place:   'Halden Freeport',
      comfort: 44,
      blurb:   'A container port, an air freight terminal and the rail yards that feed them, ' +
               'all on a supply that was built for a fishing town. The authority wants the ' +
               'freeport standing on its own generation before the winter peak, and it has ' +
               'a great deal of unused coal, crude and heat to build it from.',
      bounds:  { cols: 136, rows: 68 },
      arrival: { hour: 19.0, weather: 'rain' },
      work: 'backlands', hub: 'freeport',
      requires: () => isUnlocked(T.MK4RESEARCH),
      generation: [T.WIND3, T.SOLAR2],
      biome: 'industrial',

      markers: {
        backlands: { minC: 2,  minR: 4,  maxC: 50, maxR: 62, label: 'Halden Backlands' },
        freeport:  { minC: 62, minR: 5,  maxC: 132, maxR: 64, label: 'Halden Freeport' },
      },

      water: [
        { minC: 36, minR: 46, maxC: 46, maxR: 58 },
      ],

      prebuilt: [
        { type: T.SUBSTATION3,   col: 96, row: 34 },
        { type: T.AIRPORT,       col: 66, row: 8  },
        { type: T.TRANSPORTHUB,  col: 68, row: 32 },
        { type: T.TRANSPORTHUB,  col: 82, row: 32 },
        { type: T.TRANSPORTHUB,  col: 68, row: 46 },
        { type: T.UNIVERSITY,    col: 100, row: 8 },
        { type: T.HOSPITAL,      col: 116, row: 8 },
        { type: T.GASSTATION,    col: 82, row: 50 },
        { type: T.COMMERCIAL, col: 104, row: 22,
          props: { commercialSubtype: 'coldstorage', businessName: 'Reefer Terminal' } },
        { type: T.COMMERCIAL, col: 112, row: 22,
          props: { commercialSubtype: 'coldstorage', businessName: 'Harbour Cold Store' } },
        { type: T.COMMERCIAL, col: 120, row: 22,
          props: { commercialSubtype: 'office', businessName: 'Harbour Master' } },
        { type: T.COMMERCIAL, col: 104, row: 44,
          props: { commercialSubtype: 'office', businessName: 'Customs & Excise' } },
        { type: T.HOUSE,  col: 112, row: 40 },
        { type: T.HOUSE,  col: 118, row: 46 },
        { type: T.HOUSE,  col: 124, row: 40 },
        { type: T.HOUSE,  col: 124, row: 52 },
        { type: T.LAMP,   col: 96, row: 30 }, { type: T.LAMP, col: 96, row: 40 },
        { type: T.LAMP,   col: 90, row: 46 }, { type: T.LAMP, col: 110, row: 34 },
        { type: T.CAMERA, col: 62, row: 30 }, { type: T.CAMERA, col: 130, row: 30 },

        // Coal, crude and heat behind the port, worked from a cluster at the
        // west edge so the rest of the backlands stays open ground.
        ...column(coalAt, 4, 6, 6, 8), ...column(oilAt, 10, 6, 4, 9),
        ...column(geoAt, 17, 6, 4, 6), ...column(geoAt, 21, 6, 4, 6),
        fuelStore('rods', 26, 6),

        { type: T.TREE, col: 54, row: 10 }, { type: T.TREE, col: 56, row: 30 },
        { type: T.TREE, col: 53, row: 52 }, { type: T.BUSH, col: 57, row: 20 },
        { type: T.BUSH, col: 56, row: 42 }, { type: T.BUSH, col: 134, row: 66 },
      ],
    },

    // ═══ Towns and cities ══════════════════════════════════════════════
    // Whole settlements, laid out in zones (see zone()): a high street, a
    // mill quarter, a harbour front, a business district. Each has a
    // residential, commercial or industrial character of its own, which is
    // what makes the demand — and so the job — different from the last.

    // ── Brindle Parish Council — Brindle High Street (start, small) ─
    // A village high street on a clear morning: the first job with a real
    // town in it.
    brindle_high_street: {
      id:      'brindle_high_street',
      client:  'Brindle Parish Council',
      place:   'Brindle High Street',
      blurb:   'The shops on the high street and the cottages behind them are all on one old ' +
               'line from the next village. When it goes, the whole street goes. The common ' +
               'above the church has sun and wind to spare; we would like it used.',
      bounds:  { cols: 52, rows: 34 },
      arrival: { hour: 9.4, weather: 'clear' },
      work: 'common', hub: 'street',
      generation: [T.SOLAR, T.WIND],
      biome: 'coastal',

      markers: {
        common: { minC: 2,  minR: 4,  maxC: 18, maxR: 28, label: 'Brindle Common' },
        street: { minC: 28, minR: 6,  maxC: 48, maxR: 27, label: 'High Street' },
      },

      prebuilt: [
        at(T.SUBSTATION, 37, 15),
        ...zone(30, 7, 16, [
          { sub: 'cafe',     name: 'The Kettle' },
          { sub: 'bakery',   name: 'Brindle Bakehouse' },
        ]),
        ...zone(30, 19, 16, [{ t: T.HOUSE, n: 4 }]),
        at(T.LAMP, 36, 13), at(T.LAMP, 36, 18), at(T.LAMP, 42, 18), at(T.CAMERA, 29, 15),

        { type: T.TREE, col: 21, row: 6  }, { type: T.TREE, col: 23, row: 20 },
        { type: T.BUSH, col: 22, row: 13 }, { type: T.BUSH, col: 24, row: 27 },
      ],
    },

    // ── Pellworth Town Council — Pellworth Market Town (MK2) ────────
    // A market town with a school and a cinema: the evening trade and the
    // school day fall on different sides of the clock.
    pellworth_market_town: {
      id:      'pellworth_market_town',
      client:  'Pellworth Town Council',
      place:   'Pellworth Market Town',
      blurb:   'Market day, the school and the picture house all draw at different hours and ' +
               'the old feeder cannot follow any of them. We want our own supply on the ' +
               'hill above the square that keeps up with the whole day, not just the ' +
               'morning.',
      bounds:  { cols: 60, rows: 40 },
      arrival: { hour: 16.1, weather: 'overcast' },
      work: 'hill', hub: 'square',
      requires: () => isUnlocked(T.RESEARCH2),
      generation: [T.WIND2, T.WIND],
      biome: 'market',

      markers: {
        hill:   { minC: 2,  minR: 4,  maxC: 20, maxR: 34, label: 'Pellworth Hill' },
        square: { minC: 28, minR: 5,  maxC: 56, maxR: 36, label: 'Market Square' },
      },

      prebuilt: [
        at(T.SUBSTATION2, 40, 19),
        ...zone(30, 7, 24, [
          { sub: 'grocery',      name: 'Pellworth Provisions' },
          { sub: 'restaurant',   n: 2, names: ['The Wheatsheaf', 'Marigold Kitchen'] },
          { sub: 'clothing',     name: 'Halden & Sons' },
          { sub: 'movietheater', name: 'The Picture House' },
        ]),
        ...zone(30, 24, 24, [{ res: 'school', name: 'Pellworth Primary' }, { t: T.HOUSE, n: 8 }]),
        at(T.LAMP, 39, 17), at(T.LAMP, 39, 23), at(T.LAMP, 46, 23), at(T.CAMERA, 28, 19),

        { type: T.TREE, col: 24, row: 8  }, { type: T.TREE, col: 25, row: 24 },
        { type: T.BUSH, col: 23, row: 16 }, { type: T.BUSH, col: 24, row: 34 },
      ],
    },

    // ── Garrow Textiles — Garrow Mill Quarter (MK2) ─────────────────
    // A mill town's works on the river with a shift-change load.
    garrow_mill_quarter: {
      id:      'garrow_mill_quarter',
      client:  'Garrow Textiles',
      place:   'Garrow Mill Quarter',
      blurb:   'The looms and the machine shop have run off a diesel set since the river ' +
               'took the old weir. Coal under the fell, if you can use it. The shifts change ' +
               'at dawn and the works cannot afford to see the lights dip.',
      bounds:  { cols: 64, rows: 40 },
      arrival: { hour: 6.8, weather: 'overcast' },
      work: 'fell', hub: 'mills',
      requires: () => isUnlocked(T.RESEARCH2),
      generation: [T.WIND2, T.WIND],
      biome: 'industrial',

      markers: {
        fell:  { minC: 2,  minR: 4,  maxC: 22, maxR: 34, label: 'Garrow Fell' },
        mills: { minC: 30, minR: 5,  maxC: 60, maxR: 36, label: 'Garrow Mills' },
      },

      water: [{ minC: 6, minR: 26, maxC: 13, maxR: 32 }],

      prebuilt: [
        at(T.SUBSTATION2, 44, 18),
        ...zone(32, 7, 26, [
          { ind: 'machineshop', name: 'Garrow Machine Shop' },
          { ind: 'textilemill', n: 2, names: ['North Mill', 'South Mill'] },
        ]),
        ...zone(32, 25, 24, [{ sub: 'clinic', name: 'Mill Clinic' }, { t: T.HOUSE, n: 6 }]),
        at(T.LAMP, 43, 15), at(T.LAMP, 43, 23), at(T.LAMP, 52, 23), at(T.CAMERA, 30, 18),

        coalAt(4, 6), coalAt(13, 8), coalAt(4, 16),

        { type: T.TREE, col: 25, row: 6  }, { type: T.TREE, col: 26, row: 22 },
        { type: T.BUSH, col: 24, row: 14 }, { type: T.BUSH, col: 27, row: 32 },
      ],
    },

    // ── Saint Elian Harbour Board — Saint Elian Harbour (MK3) ───────
    // A resort harbour that comes alive at dusk: marina, hotels and a long
    // strip of restaurants all switching on at once.
    saint_elian_harbour: {
      id:      'saint_elian_harbour',
      client:  'Saint Elian Harbour Board',
      place:   'Saint Elian Harbour',
      blurb:   'The season starts in a fortnight and the harbour front has never carried a ' +
               'full house. The hotels and the marina alone drain the line by seven, and ' +
               'the restaurants open then. The cliffs above the town catch every wind going.',
      bounds:  { cols: 84, rows: 46 },
      arrival: { hour: 18.4, weather: 'clear' },
      work: 'cliffs', hub: 'harbour',
      requires: () => isUnlocked(T.RESEARCH3),
      generation: [T.WIND3, T.WIND2],
      biome: 'coastal',

      markers: {
        cliffs:  { minC: 2,  minR: 4,  maxC: 28, maxR: 40, label: 'The Cliffs' },
        harbour: { minC: 38, minR: 5,  maxC: 80, maxR: 42, label: 'Saint Elian Harbour' },
      },

      prebuilt: [
        at(T.SUBSTATION3, 56, 20), at(T.SUBSTATION2, 70, 30),
        ...zone(40, 7, 38, [
          { sub: 'hotel',      n: 2, names: ['The Grand Elian', 'Harbour View Hotel'] },
          { sub: 'marina',     name: 'Elian Marina' },
          { sub: 'finedining', name: 'Le Phare' },
          { sub: 'restaurant', n: 3, names: ['Catch of the Day', 'The Anchor', 'Saltwater Kitchen'] },
          { sub: 'supperclub', name: 'The Lantern Room' },
          { sub: 'nightclub',  name: 'Tidewater' },
          { sub: 'aquarium',   name: 'Elian Sea Life' },
        ]),
        ...zone(40, 26, 26, [{ sub: 'clothing', name: 'Harbour Boutique' }, { sub: 'cafe', n: 2, names: ['Quayside Cafe', 'Ice Cream Parlour'] }, { t: T.HOUSE, n: 14 }]),
        at(T.LAMP, 60, 19), at(T.LAMP, 55, 25), at(T.LAMP, 48, 25), at(T.LAMP, 66, 25),
        at(T.CAMERA, 38, 20), at(T.CAMERA, 78, 20),

        geoAt(4, 6), geoAt(13, 6), geoAt(4, 19), geoAt(13, 19),

        { type: T.TREE, col: 31, row: 10 }, { type: T.TREE, col: 32, row: 28 },
        { type: T.BUSH, col: 34, row: 18 }, { type: T.BUSH, col: 33, row: 38 },
      ],
    },

    // ── Lowmoor Industrial Trust — Lowmoor Works Estate (MK3) ───────
    // A heavy industrial estate: machine shops, a foundry and a recycling
    // plant, with coal and crude beneath the slag heaps.
    lowmoor_works: {
      id:      'lowmoor_works',
      client:  'Lowmoor Industrial Trust',
      place:   'Lowmoor Works Estate',
      comfort: 26,
      blurb:   'Three machine shops, the foundry and the recycling plant all run three shifts ' +
               'and every one of them has been browning out the others. There is coal and ' +
               'crude under the slag heaps and nobody has ever put it to use. We would like ' +
               'a supply that is ours.',
      bounds:  { cols: 96, rows: 52 },
      arrival: { hour: 6.0, weather: 'overcast' },
      work: 'heaps', hub: 'works',
      requires: () => isUnlocked(T.RESEARCH3),
      generation: [T.WIND3, T.WIND2],
      biome: 'industrial',

      markers: {
        heaps: { minC: 2,  minR: 4,  maxC: 32, maxR: 46, label: 'The Slag Heaps' },
        works: { minC: 42, minR: 5,  maxC: 92, maxR: 48, label: 'Lowmoor Works' },
      },

      water: [{ minC: 20, minR: 36, maxC: 29, maxR: 44 }],

      prebuilt: [
        at(T.SUBSTATION3, 62, 22),
        ...zone(44, 7, 46, [
          { ind: 'machineshop',   n: 3, names: ['Lowmoor Machine Works', 'Precision Turning', 'Heavy Fabrication'] },
          { ind: 'recyclingplant', name: 'Lowmoor Recycling' },
          { ind: 'steelfoundry',  name: 'Lowmoor Foundry' },
          { sub: 'factory',       n: 2, names: ['Assembly Hall', 'Finishing Shop'] },
        ]),
        ...zone(44, 30, 30, [{ sub: 'coworking', name: 'Estate Office' }, { sub: 'cafe', name: 'Canteen' }, { t: T.HOUSE, n: 10 }]),
        at(T.LAMP, 61, 18), at(T.LAMP, 61, 28), at(T.LAMP, 52, 28), at(T.LAMP, 72, 28),
        at(T.CAMERA, 42, 22), at(T.CAMERA, 90, 22),

        ...column(coalAt, 4, 6, 4, 8), ...column(oilAt, 17, 6, 3, 10),
        fuelStore('rods', 26, 8),

        { type: T.TREE, col: 36, row: 12 }, { type: T.TREE, col: 37, row: 32 },
        { type: T.BUSH, col: 38, row: 22 }, { type: T.BUSH, col: 36, row: 44 },
      ],
    },

    // ── Castellan Development Corp — Castellan Business District (MK4) ─
    // A financial district: a megatower, data halls and a convention
    // centre, all running twenty-four hours.
    castellan_district: {
      id:      'castellan_district',
      client:  'Castellan Development Corp',
      place:   'Castellan Business District',
      comfort: 34,
      blurb:   'The tower, the data halls and the convention centre are on one feeder that ' +
               'was sized for a warehouse. We lose a floor of traders every time it dips. ' +
               'The estuary flats beyond the rail line are ours to build on; power the ' +
               'district from there and prove it holds through a trading day.',
      bounds:  { cols: 136, rows: 66 },
      arrival: { hour: 20.6, weather: 'clear' },
      work: 'flats', hub: 'district',
      requires: () => isUnlocked(T.MK4RESEARCH),
      generation: [T.WIND3, T.SOLAR2],
      biome: 'nocturne',

      markers: {
        flats:    { minC: 2,  minR: 4,  maxC: 56, maxR: 60, label: 'Estuary Flats' },
        district: { minC: 68, minR: 5,  maxC: 130, maxR: 62, label: 'Castellan District' },
      },

      water: [{ minC: 40, minR: 44, maxC: 52, maxR: 56 }],

      prebuilt: [
        at(T.SUBSTATION3, 84, 26), at(T.SUBSTATION3, 108, 26),
        ...zone(70, 7, 58, [
          { sub: 'megatower',  name: 'Castellan Tower' },
          { sub: 'convention', name: 'Castellan Convention Centre' },
          { sub: 'datacenter', n: 2, names: ['Data Hall A', 'Data Hall B'] },
          { ind: 'serverfarm', name: 'Exchange Server Farm' },
          { sub: 'hotel',      n: 2, names: ['Castellan Hotel', 'Estuary Suites'] },
          { sub: 'bank',       n: 2, names: ['Castellan Bank', 'Merchant Bank'] },
          { sub: 'finedining', name: 'Sky Room' },
          { sub: 'coworking',  n: 2 },
        ]),
        ...zone(70, 34, 56, [{ res: 'skyscraper', n: 2, names: ['Estuary Heights', 'Castellan Court'] }, { sub: 'lawoffice', n: 3 }, { sub: 'callcentre', name: 'Contact Centre' }, { t: T.HOUSE, n: 16 }]),
        at(T.LAMP, 83, 23), at(T.LAMP, 83, 31), at(T.LAMP, 107, 23), at(T.LAMP, 107, 31),
        at(T.CAMERA, 68, 26), at(T.CAMERA, 128, 26),

        ...column(coalAt, 4, 6, 6, 8), ...column(geoAt, 10, 6, 5, 8),
        fuelStore('rods', 16, 6),

        { type: T.TREE, col: 60, row: 10 }, { type: T.TREE, col: 62, row: 40 },
        { type: T.BUSH, col: 61, row: 24 }, { type: T.BUSH, col: 62, row: 56 },
      ],
    },

    // ── Arden Sports & Events — Arden Stadium Quarter (MK4) ─────────
    // An event district: the load arrives in one huge wave when the stadium
    // fills, and leaves the same way.
    arden_stadium_quarter: {
      id:      'arden_stadium_quarter',
      client:  'Arden Sports & Events',
      place:   'Arden Stadium Quarter',
      comfort: 30,
      blurb:   'Match nights put a stadium, an arena and half the hotels in the district ' +
               'on at the same moment, and the last three fixtures have finished in the ' +
               'dark. We have crude and heat behind the ground. Give us a supply that can ' +
               'take the kick-off wave.',
      bounds:  { cols: 128, rows: 62 },
      arrival: { hour: 17.4, weather: 'overcast' },
      work: 'backlot', hub: 'quarter',
      requires: () => isUnlocked(T.MK4RESEARCH),
      generation: [T.WIND3],
      biome: 'market',

      markers: {
        backlot: { minC: 2,  minR: 4,  maxC: 50, maxR: 56, label: 'The Back Lot' },
        quarter: { minC: 62, minR: 5,  maxC: 124, maxR: 58, label: 'Arden Quarter' },
      },

      prebuilt: [
        at(T.SUBSTATION3, 82, 24), at(T.SUBSTATION3, 106, 24),
        ...zone(64, 7, 58, [
          { sub: 'stadium',      name: 'Arden Park' },
          { sub: 'thunderridge', name: 'Thunder Ridge Arena' },
          { sub: 'mall',         name: 'Arden Galleria' },
          { sub: 'venue',        name: 'The Forum' },
          { sub: 'nightclub',    n: 2, names: ['Kick-Off', 'Full Time'] },
          { sub: 'hotel',        n: 2, names: ['Arena Hotel', 'Matchday Inn'] },
          { sub: 'restaurant',   n: 3 },
        ]),
        ...zone(64, 32, 56, [{ sub: 'gym', n: 2 }, { sub: 'fastfood', n: 3 }, { sub: 'cardealer', name: 'Arden Motors' }, { t: T.HOUSE, n: 18 }]),
        at(T.LAMP, 81, 21), at(T.LAMP, 81, 29), at(T.LAMP, 105, 21), at(T.LAMP, 105, 29),
        at(T.CAMERA, 62, 24), at(T.CAMERA, 122, 24),

        ...column(oilAt, 4, 6, 4, 10), ...column(geoAt, 18, 6, 5, 11),

        { type: T.TREE, col: 54, row: 10 }, { type: T.TREE, col: 56, row: 36 },
        { type: T.BUSH, col: 55, row: 22 }, { type: T.BUSH, col: 56, row: 52 },
      ],
    },

    // ── Novacrest Metropolitan Authority — Novacrest (MK5) ──────────
    // A city of towers. The largest single demand in the game, and the
    // client will not accept a supply that is not clean by the final day.
    novacrest_metropolis: {
      id:      'novacrest_metropolis',
      client:  'Novacrest Metropolitan Authority',
      place:   'Novacrest',
      comfort: 60,
      blurb:   'Three towers, an arena, a quantum campus and the convention quarter, on a ' +
               'grid that was never designed for a city like this. We have been shedding ' +
               'load for two winters. The badlands behind the city hold coal, crude and ' +
               'more heat than we can count. We want it all working.',
      bounds:  { cols: 168, rows: 84 },
      arrival: { hour: 19.6, weather: 'clear' },
      work: 'badlands', hub: 'city',
      requires: () => isUnlocked(T.MK5RESEARCH),
      generation: [T.WIND3, T.SOLAR2],
      biome: 'nocturne',

      markers: {
        badlands: { minC: 2,  minR: 4,  maxC: 76, maxR: 78, label: 'The Badlands' },
        city:     { minC: 92, minR: 5,  maxC: 164, maxR: 80, label: 'Novacrest' },
      },

      water: [{ minC: 56, minR: 56, maxC: 70, maxR: 70 }],

      prebuilt: [
        at(T.SUBSTATION3, 108, 30), at(T.SUBSTATION3, 130, 30), at(T.SUBSTATION3, 150, 30),
        ...zone(94, 7, 68, [
          { sub: 'megatower',  n: 3, names: ['Meridian Tower', 'Crest Tower', 'Novacrest Plaza'] },
          { sub: 'quantumx',   name: 'Quantum Campus' },
          { sub: 'holoarena',  name: 'Holo Arena' },
          { sub: 'convention', name: 'Novacrest Convention' },
          { ind: 'aicompute',  name: 'Compute Hall' },
          { sub: 'maglev',     name: 'Novacrest Central' },
          { sub: 'skycasino',  name: 'Aurora Novacrest' },
          { sub: 'datacenter', n: 2 },
          { sub: 'hotel',      n: 2 },
          { sub: 'finedining', n: 2 },
        ]),
        ...zone(94, 38, 68, [{ res: 'skyscraper', n: 3 }, { res: 'arcology', name: 'Nova Arcology' }, { sub: 'mall', name: 'Crest Mall' }, { sub: 'bank', n: 2 }, { t: T.HOUSE, n: 20 }]),
        at(T.LAMP, 107, 27), at(T.LAMP, 107, 35), at(T.LAMP, 129, 27), at(T.LAMP, 129, 35),
        at(T.LAMP, 149, 27), at(T.LAMP, 149, 35), at(T.CAMERA, 92, 30), at(T.CAMERA, 162, 30),

        ...column(coalAt, 4, 6, 9, 8), ...column(oilAt, 18, 6, 6, 11), ...column(geoAt, 34, 6, 6, 11),
        fuelStore('rods', 48, 8), fuelStore('mox', 48, 16), fuelStore('pellets', 48, 24), fuelStore('he3pellets', 48, 32),
        heliumAt(58, 8), heliumAt(58, 20),

        { type: T.TREE, col: 80, row: 10 }, { type: T.TREE, col: 82, row: 44 },
        { type: T.BUSH, col: 81, row: 26 }, { type: T.BUSH, col: 83, row: 72 },
      ],
    },

    // ── Orbital Launch Authority — Orbital Spaceport (MK5) ──────────
    // A launch complex with a space elevator: the heaviest single load
    // there is, and one that cannot be interrupted once a launch window opens.
    orbital_spaceport: {
      id:      'orbital_spaceport',
      client:  'Orbital Launch Authority',
      place:   'Orbital Spaceport',
      comfort: 60,
      blurb:   'The elevator, the launch complex and the fabs behind them have run on a ' +
               'temporary feed for eleven years. There is a launch window in six days and no ' +
               'second attempt. Power it from the salt flats, and prove it holds through a ' +
               'full countdown.',
      bounds:  { cols: 176, rows: 90 },
      arrival: { hour: 4.6, weather: 'clear' },
      work: 'flats', hub: 'complex',
      requires: () => isUnlocked(T.MK5RESEARCH),
      generation: [T.WIND3, T.SOLAR2],
      biome: 'arid',

      markers: {
        flats:   { minC: 2,  minR: 4,  maxC: 80, maxR: 84, label: 'The Salt Flats' },
        complex: { minC: 96, minR: 5,  maxC: 172, maxR: 86, label: 'Spaceport Complex' },
      },

      water: [{ minC: 62, minR: 64, maxC: 76, maxR: 78 }],

      prebuilt: [
        at(T.SUBSTATION3, 112, 36), at(T.SUBSTATION3, 136, 36), at(T.SUBSTATION3, 158, 36),
        ...zone(98, 7, 72, [
          { sub: 'spaceelevator', name: 'Sky Elevator' },
          { ind: 'spaceport',     name: 'Launch Complex' },
          { ind: 'semifab',       name: 'Fab One' },
          { ind: 'supercon',      name: 'Magnet Works' },
          { ind: 'aicompute',     n: 2, names: ['Mission Compute', 'Guidance Compute'] },
          { sub: 'quantumx',      name: 'Quantum Labs' },
          { ind: 'collider',      name: 'Beamline Ring' },
        ]),
        ...zone(98, 42, 70, [{ sub: 'coworking', n: 3 }, { sub: 'hotel', name: 'Crew Quarters' }, { ind: 'verticalfarm', name: 'Crew Greens' }, { sub: 'cafe', n: 3 }, { sub: 'radiology', name: 'Flight Medical' }, { t: T.HOUSE, n: 20 }]),
        at(T.LAMP, 111, 33), at(T.LAMP, 111, 41), at(T.LAMP, 135, 33), at(T.LAMP, 135, 41),
        at(T.LAMP, 157, 33), at(T.LAMP, 157, 41), at(T.CAMERA, 96, 36), at(T.CAMERA, 170, 36),

        ...column(coalAt, 4, 6, 10, 8), ...column(oilAt, 18, 6, 7, 11), ...column(geoAt, 34, 6, 6, 11),
        fuelStore('rods', 48, 8), fuelStore('mox', 48, 16), fuelStore('pellets', 48, 24), fuelStore('he3pellets', 48, 32),
        heliumAt(58, 8), heliumAt(58, 20),

        { type: T.TREE, col: 84, row: 10 }, { type: T.TREE, col: 86, row: 50 },
        { type: T.BUSH, col: 85, row: 28 }, { type: T.BUSH, col: 86, row: 78 },
      ],
    },

    // ── Tarbet Water Authority — Tarbet Mill Valley (MK3, hydro) ────
    // Two fast streams down a valley to a mill town: the one site with rivers
    // a dam can hold back. Nothing here needs fuel; it needs a dam, a turbine
    // in the reservoir, and a generator on the bank driven by a shaft.
    tarbet_mill_valley: {
      id:      'tarbet_mill_valley',
      client:  'Tarbet Water Authority',
      place:   'Tarbet Mill Valley',
      comfort: 20,
      blurb:   'Two streams run down the valley to the mills, and every year the old leats ' +
               'silt up a little more. The mills stand idle when the feeder fails. We want the ' +
               'streams dammed and put to work; a turbine behind each dam, and generators on ' +
               'the bank to carry the mill town.',
      bounds:  { cols: 96, rows: 52 },
      arrival: { hour: 10.2, weather: 'overcast' },
      work: 'valley', hub: 'mills',
      requires: () => isUnlocked(T.RESEARCH3) && isUnlocked(T.HYDROGENERATOR),
      generation: [T.WIND3, T.WIND2],
      biome: 'coastal',

      markers: {
        valley: { minC: 2,  minR: 4,  maxC: 46, maxR: 46, label: 'Tarbet Valley' },
        mills:  { minC: 56, minR: 6,  maxC: 92, maxR: 46, label: 'Tarbet Mills' },
      },

      // Streams flowing east, short enough (28 tiles) that a single dam always
      // finds the river's natural end and forms a reservoir on its own, and
      // ending in a pond each.
      river: [
        { minC: 4, minR: 10, maxC: 31, maxR: 15, dc: 1, dr: 0 },
        { minC: 4, minR: 32, maxC: 31, maxR: 37, dc: 1, dr: 0 },
      ],
      water: [
        { minC: 32, minR: 8,  maxC: 44, maxR: 17 },
        { minC: 32, minR: 30, maxC: 44, maxR: 39 },
      ],

      prebuilt: [
        at(T.SUBSTATION3, 72, 26),
        ...zone(58, 7, 32, [
          { ind: 'machineshop', name: 'Tarbet Machine Works' },
          { ind: 'textilemill', n: 2, names: ['Upper Mill', 'Lower Mill'] },
          { ind: 'sawmill',     name: 'Leat Sawmill' },
          { ind: 'brickworks',  name: 'Tarbet Brick' },
        ]),
        ...zone(58, 32, 30, [
          { sub: 'clinic', name: 'Valley Clinic' },
          { sub: 'cafe',   name: 'The Millpond Cafe' },
          { sub: 'bakery', name: 'Tarbet Bakehouse' },
          { t: T.HOUSE, n: 12 },
        ]),
        at(T.LAMP, 71, 22), at(T.LAMP, 71, 31), at(T.LAMP, 64, 30), at(T.LAMP, 80, 30),
        at(T.CAMERA, 56, 26), at(T.CAMERA, 90, 26),

        { type: T.TREE, col: 48, row: 12 }, { type: T.TREE, col: 49, row: 34 },
        { type: T.BUSH, col: 50, row: 22 }, { type: T.BUSH, col: 50, row: 42 },
      ],
    },

    // ═══ More late-game sites ══════════════════════════════════════════
    // Four MK5 sites, each a different problem, and two river sites for hydro.

    // ── Kaldera Fusion Institute — Kaldera Campus (MK5) ─────────────
    // A fusion research campus with room to build one: helium gas fields in the
    // caldera wall, a stocked pellet store, and more open ground than any
    // other site.
    kaldera_fusion_campus: {
      id:      'kaldera_fusion_campus',
      client:  'Kaldera Fusion Institute',
      place:   'Kaldera Campus',
      comfort: 60,
      blurb:   'The labs, the magnet works and the compute halls have been run off a diesel ' +
               'plant for a decade while the Institute waits for a reactor of its own. The ' +
               'caldera floor is level, empty and ours. Build us a fusion plant on it, and ' +
               'prove it holds while the campus is at full draw.',
      bounds:  { cols: 120, rows: 80 },
      arrival: { hour: 7.1, weather: 'clear' },
      work: 'caldera', hub: 'institute',
      requires: () => isUnlocked(T.MK5RESEARCH),
      generation: [T.WIND3, T.SOLAR2],
      biome: 'arid',

      markers: {
        caldera:   { minC: 2,  minR: 4,  maxC: 60, maxR: 74, label: 'The Caldera Floor' },
        institute: { minC: 72, minR: 5,  maxC: 116, maxR: 76, label: 'Kaldera Campus' },
      },

      water: [{ minC: 30, minR: 55, maxC: 44, maxR: 68 }],

      prebuilt: [
        at(T.SUBSTATION3, 92, 30), at(T.SUBSTATION3, 108, 30),
        ...zone(74, 7, 42, [
          { ind: 'isotopelab', name: 'Isotope Laboratory' },
          { ind: 'supercon',   name: 'Magnet Works' },
          { ind: 'semifab',    name: 'Sensor Fab' },
          { ind: 'aicompute',  n: 2, names: ['Plasma Modelling', 'Control Compute'] },
          { sub: 'quantumx',   name: 'Quantum Sensing Lab' },
          { sub: 'datacenter', n: 2 },
        ]),
        ...zone(74, 40, 42, [
          { ind: 'geneworks', name: 'Isotope Biology' },
          { sub: 'coworking', n: 3 },
          { sub: 'hotel',     name: 'Visiting Fellows' },
          { sub: 'cafe',      n: 3 },
          { sub: 'radiology', name: 'Campus Medical' },
          { t: T.HOUSE, n: 16 },
        ]),
        at(T.LAMP, 91, 27), at(T.LAMP, 91, 35), at(T.LAMP, 107, 27), at(T.LAMP, 107, 35),
        at(T.CAMERA, 72, 30), at(T.CAMERA, 114, 30),

        heliumAt(6, 6), heliumAt(6, 16), heliumAt(6, 26),
        fuelStore('pellets', 14, 6), fuelStore('he3pellets', 14, 13),
        fuelStore('rods', 14, 20), fuelStore('mox', 14, 27),
        ...column(geoAt, 22, 6, 4, 8),

        { type: T.TREE, col: 64, row: 10 }, { type: T.TREE, col: 65, row: 44 },
        { type: T.BUSH, col: 66, row: 24 }, { type: T.BUSH, col: 66, row: 60 },
      ],
    },

    // ── Saltreach Water Authority — Saltreach Desalination Works (MK5) ─
    // A coastal desalination megaproject: pumps, treatment halls and the rail
    // spur that feeds them, with the sea itself as the cooling water.
    saltreach_desalination: {
      id:      'saltreach_desalination',
      client:  'Saltreach Water Authority',
      place:   'Saltreach Desalination Works',
      comfort: 60,
      blurb:   'Six desalination halls, the treatment plant and the pumping stations that lift ' +
               'the water inland all draw around the clock, and every drought the load goes ' +
               'up. The shoreline is ours to build on and the sea is right there for cooling. ' +
               'We want the works on its own supply before the next dry summer.',
      bounds:  { cols: 110, rows: 70 },
      arrival: { hour: 15.6, weather: 'clear' },
      work: 'shore', hub: 'works',
      requires: () => isUnlocked(T.MK5RESEARCH),
      generation: [T.WIND3, T.SOLAR2],
      biome: 'coastal',

      markers: {
        shore: { minC: 2,  minR: 4,  maxC: 46, maxR: 64, label: 'The Shore' },
        works: { minC: 58, minR: 5,  maxC: 106, maxR: 66, label: 'Saltreach Works' },
      },

      water: [{ minC: 4, minR: 46, maxC: 34, maxR: 62 }],

      prebuilt: [
        at(T.SUBSTATION3, 76, 46), at(T.SUBSTATION3, 94, 46),
        ...zone(60, 7, 46, [
          { ind: 'desal',      n: 6, names: ['Hall A', 'Hall B', 'Hall C', 'Hall D', 'Hall E', 'Hall F'] },
          { ind: 'watertreat', n: 4 },
          { ind: 'machineshop', n: 2, names: ['Pump Works', 'Membrane Works'] },
          { t: T.TRANSPORTHUB, n: 2 },
        ]),
        ...zone(60, 52, 44, [
          { t: T.HOSPITAL }, { sub: 'clinic', n: 2 }, { res: 'school', name: 'Works School' },
          { sub: 'cafe', n: 3 }, { t: T.HOUSE, n: 18 },
        ]),
        at(T.LAMP, 75, 43), at(T.LAMP, 75, 49), at(T.LAMP, 93, 43), at(T.LAMP, 93, 49),
        at(T.CAMERA, 58, 46), at(T.CAMERA, 104, 46),

        fuelStore('rods', 24, 8), fuelStore('mox', 24, 15),
        ...column(coalAt, 4, 6, 4, 8), ...column(oilAt, 12, 6, 3, 10), ...column(geoAt, 32, 6, 4, 8),

        { type: T.TREE, col: 50, row: 10 }, { type: T.TREE, col: 51, row: 40 },
        { type: T.BUSH, col: 52, row: 24 }, { type: T.BUSH, col: 52, row: 56 },
      ],
    },

    // ── National Grid Company — Meridian Interconnect (MK5) ─────────
    // The terminus of the national line: rail, towers and the data halls that
    // dispatch the grid, on ground the Company wants running on private supply
    // before it relies on yours.
    meridian_interconnect: {
      id:      'meridian_interconnect',
      client:  'National Grid Company',
      place:   'Meridian Interconnect',
      comfort: 60,
      blurb:   'This is where the national line ends, and it is the last place we can afford ' +
               'to lose. Dispatch, the control halls and the rail feed all sit on a single ' +
               'tie. Give us a second supply here, on the flats behind the terminus, that we ' +
               'can bring up before the tie is ever tested.',
      bounds:  { cols: 130, rows: 80 },
      arrival: { hour: 22.6, weather: 'overcast' },
      work: 'flats', hub: 'terminus',
      requires: () => isUnlocked(T.MK5RESEARCH),
      generation: [T.WIND3, T.SOLAR2],
      biome: 'nocturne',

      markers: {
        flats:    { minC: 2,  minR: 4,  maxC: 56, maxR: 74, label: 'The Flats' },
        terminus: { minC: 70, minR: 5,  maxC: 126, maxR: 76, label: 'Meridian Terminus' },
      },

      water: [{ minC: 36, minR: 52, maxC: 50, maxR: 68 }],

      prebuilt: [
        at(T.SUBSTATION3, 88, 32), at(T.SUBSTATION3, 104, 32), at(T.SUBSTATION3, 118, 32),
        ...zone(72, 7, 52, [
          { t: T.TRANSPORTHUB, n: 4 },
          { sub: 'megatower',  n: 2, names: ['Dispatch Tower', 'Control Tower'] },
          { sub: 'datacenter', n: 3 },
          { ind: 'serverfarm', name: 'Grid Analytics' },
          { sub: 'convention', name: 'Operators Hall' },
          { sub: 'maglev',     name: 'Grid Line Terminal' },
        ]),
        ...zone(72, 40, 52, [
          { sub: 'coworking', n: 3 }, { sub: 'hotel', name: 'Night Shift Hotel' },
          { sub: 'cafe', n: 3 }, { sub: 'bank', name: 'Settlement House' }, { t: T.HOUSE, n: 18 },
        ]),
        at(T.LAMP, 87, 29), at(T.LAMP, 87, 37), at(T.LAMP, 103, 29), at(T.LAMP, 103, 37),
        at(T.CAMERA, 70, 32), at(T.CAMERA, 124, 32),

        fuelStore('rods', 16, 8), fuelStore('mox', 16, 15), fuelStore('pellets', 16, 22), fuelStore('he3pellets', 16, 29),
        heliumAt(10, 38),
        ...column(coalAt, 4, 6, 4, 8), ...column(oilAt, 26, 6, 4, 10),

        { type: T.TREE, col: 60, row: 10 }, { type: T.TREE, col: 61, row: 44 },
        { type: T.BUSH, col: 62, row: 26 }, { type: T.BUSH, col: 62, row: 62 },
      ],
    },

    // ── Borealis Polar Research — Borealis Station (MK5) ────────────
    // A research station a long way from anywhere: it has to run itself, and it
    // has steam heat under the ice, two glacial streams and no fuel deliveries.
    borealis_station: {
      id:      'borealis_station',
      client:  'Borealis Polar Research',
      place:   'Borealis Station',
      comfort: 50,
      blurb:   'Nothing reaches us between October and April: no fuel, no parts, no rescue. ' +
               'The labs, the isotope store and the wintering crew all depend on a supply that ' +
               'must not fail. There is heat under the ice and two streams off the glacier. ' +
               'Use them, and use them well.',
      bounds:  { cols: 104, rows: 76 },
      arrival: { hour: 11.0, weather: 'snow' },
      season:  'winter',   // it is never anything else here
      work: 'ice', hub: 'station',
      requires: () => isUnlocked(T.MK5RESEARCH),
      generation: [T.WIND3, T.WIND2],
      biome: 'coastal',

      markers: {
        ice:     { minC: 2,  minR: 4,  maxC: 48, maxR: 70, label: 'The Ice Shelf' },
        station: { minC: 60, minR: 6,  maxC: 100, maxR: 70, label: 'Borealis Station' },
      },

      river: [
        { minC: 4, minR: 8,  maxC: 31, maxR: 13, dc: 1, dr: 0 },
        { minC: 4, minR: 26, maxC: 31, maxR: 31, dc: 1, dr: 0 },
      ],
      water: [
        { minC: 32, minR: 6,  maxC: 44, maxR: 15 },
        { minC: 32, minR: 24, maxC: 44, maxR: 33 },
        { minC: 30, minR: 52, maxC: 44, maxR: 64 },
      ],

      prebuilt: [
        at(T.SUBSTATION3, 78, 30),
        ...zone(62, 8, 36, [
          { ind: 'isotopelab', name: 'Isotope Store' },
          { sub: 'radiology',  name: 'Station Medical' },
          { ind: 'machineshop', name: 'Workshop' },
          { sub: 'aquarium',   name: 'Ice Aquarium' },
          { res: 'school',     name: 'Wintering School' },
        ]),
        ...zone(62, 38, 36, [
          { sub: 'hotel', name: 'Crew Quarters' }, { sub: 'gym', name: 'Winter Gym' },
          { sub: 'cafe', n: 2 }, { t: T.HOUSE, n: 14 },
        ]),
        at(T.LAMP, 77, 27), at(T.LAMP, 77, 35), at(T.LAMP, 70, 35),
        at(T.CAMERA, 60, 30), at(T.CAMERA, 98, 30),

        fuelStore('rods', 16, 40),
        ...column(geoAt, 4, 42, 4, 6), ...column(geoAt, 10, 42, 4, 6), ...column(oilAt, 22, 40, 3, 8),

        { type: T.TREE, col: 52, row: 12 }, { type: T.TREE, col: 53, row: 48 },
        { type: T.BUSH, col: 54, row: 28 }, { type: T.BUSH, col: 54, row: 64 },
      ],
    },

    // ── Stonegate Hydro Board — Stonegate Gorge (MK4, hydro) ────────
    // Three streams in a gorge above a mill town: the best hydro ground there is.
    stonegate_gorge: {
      id:      'stonegate_gorge',
      client:  'Stonegate Hydro Board',
      place:   'Stonegate Gorge',
      comfort: 30,
      blurb:   'Three streams drop through the gorge and every one of them goes to waste. The ' +
               'mills below have burned coal for a century. A turbine behind each dam and a ' +
               'generator on the bank, and the town runs on water.',
      bounds:  { cols: 110, rows: 72 },
      arrival: { hour: 9.2, weather: 'rain' },
      work: 'gorge', hub: 'town',
      requires: () => isUnlocked(T.MK4RESEARCH) && isUnlocked(T.HYDROGENERATOR),
      generation: [T.WIND3, T.WIND2],
      biome: 'coastal',

      markers: {
        gorge: { minC: 2,  minR: 4,  maxC: 50, maxR: 68, label: 'Stonegate Gorge' },
        town:  { minC: 60, minR: 6,  maxC: 106, maxR: 66, label: 'Stonegate Mills' },
      },

      river: [
        { minC: 4, minR: 6,  maxC: 31, maxR: 11, dc: 1, dr: 0 },
        { minC: 4, minR: 26, maxC: 31, maxR: 31, dc: 1, dr: 0 },
        { minC: 4, minR: 46, maxC: 31, maxR: 51, dc: 1, dr: 0 },
      ],
      water: [
        { minC: 32, minR: 4,  maxC: 46, maxR: 13 },
        { minC: 32, minR: 24, maxC: 46, maxR: 33 },
        { minC: 32, minR: 44, maxC: 46, maxR: 53 },
      ],

      prebuilt: [
        at(T.SUBSTATION3, 82, 30),
        ...zone(62, 8, 42, [
          { ind: 'machineshop', n: 2, names: ['Stonegate Machine Works', 'Gorge Foundry Tools'] },
          { ind: 'textilemill', n: 2, names: ['Old Mill', 'New Mill'] },
          { ind: 'sawmill' }, { ind: 'brickworks' }, { ind: 'glassworks' }, { ind: 'papermill' },
        ]),
        ...zone(62, 38, 40, [
          { sub: 'clinic', name: 'Mill Clinic' }, { sub: 'bakery' }, { sub: 'cafe', n: 2 },
          { res: 'school', name: 'Mill School' }, { t: T.HOUSE, n: 16 },
        ]),
        at(T.LAMP, 81, 27), at(T.LAMP, 81, 35), at(T.LAMP, 72, 35), at(T.LAMP, 96, 35),
        at(T.CAMERA, 60, 30), at(T.CAMERA, 104, 30),

        { type: T.TREE, col: 54, row: 12 }, { type: T.TREE, col: 55, row: 40 },
        { type: T.BUSH, col: 56, row: 28 }, { type: T.BUSH, col: 56, row: 60 },
      ],
    },

    // ── Tamsin Reservoir Trust — Tamsin Reservoirs (MK4, hydro) ─────
    // A chain of reservoirs feeding a university town: four streams and the
    // most hydro a single job site can hold.
    tamsin_reservoirs: {
      id:      'tamsin_reservoirs',
      client:  'Tamsin Reservoir Trust',
      place:   'Tamsin Reservoirs',
      comfort: 40,
      blurb:   'Four streams run down the valley to the university town and the Trust has ' +
               'never had the money to use any of them. The town has grown, the old feeder ' +
               'has not. Dam the streams, put turbines behind them, and carry the town on ' +
               'the water we already have.',
      bounds:  { cols: 120, rows: 80 },
      arrival: { hour: 13.4, weather: 'overcast' },
      work: 'valley', hub: 'town',
      requires: () => isUnlocked(T.MK4RESEARCH) && isUnlocked(T.HYDROGENERATOR),
      generation: [T.WIND3, T.SOLAR2],
      biome: 'coastal',

      markers: {
        valley: { minC: 2,  minR: 4,  maxC: 50, maxR: 76, label: 'Tamsin Valley' },
        town:   { minC: 62, minR: 6,  maxC: 116, maxR: 76, label: 'Tamsin' },
      },

      river: [
        { minC: 4, minR: 6,  maxC: 31, maxR: 11, dc: 1, dr: 0 },
        { minC: 4, minR: 24, maxC: 31, maxR: 29, dc: 1, dr: 0 },
        { minC: 4, minR: 42, maxC: 31, maxR: 47, dc: 1, dr: 0 },
        { minC: 4, minR: 60, maxC: 31, maxR: 65, dc: 1, dr: 0 },
      ],
      water: [
        { minC: 32, minR: 4,  maxC: 46, maxR: 13 },
        { minC: 32, minR: 22, maxC: 46, maxR: 31 },
        { minC: 32, minR: 40, maxC: 46, maxR: 49 },
        { minC: 32, minR: 58, maxC: 46, maxR: 67 },
      ],

      prebuilt: [
        at(T.SUBSTATION3, 88, 34), at(T.SUBSTATION3, 104, 34),
        ...zone(64, 8, 50, [
          { t: T.UNIVERSITY }, { t: T.HOSPITAL }, { t: T.EMS },
          { sub: 'library', name: 'Tamsin Library' }, { sub: 'lawoffice', n: 2 },
          { sub: 'datacenter', name: 'Research Data' }, { sub: 'coworking', n: 2 },
        ]),
        ...zone(64, 42, 50, [
          { res: 'apartment', n: 2 }, { sub: 'cafe', n: 3 }, { sub: 'restaurant', n: 2 },
          { sub: 'bank' }, { sub: 'gym' }, { t: T.HOUSE, n: 20 },
        ]),
        at(T.LAMP, 87, 30), at(T.LAMP, 87, 40), at(T.LAMP, 103, 30), at(T.LAMP, 103, 40),
        at(T.CAMERA, 62, 34), at(T.CAMERA, 114, 34),

        { type: T.TREE, col: 54, row: 14 }, { type: T.TREE, col: 55, row: 50 },
        { type: T.BUSH, col: 56, row: 30 }, { type: T.BUSH, col: 56, row: 70 },
      ],
    },
  };

  // ── Site sizes ───────────────────────────────────────────────────
  //
  // Sites run from a small yard to a whole district. The late, heavy jobs (a
  // reactor set, a fusion plant) need real floor space, so the biggest sites
  // are grown well past their authored layout: the hub (the client's own
  // buildings) slides east, and the build area widens into the space it leaves
  // and stretches south. Everything on the work side stays where it was
  // authored. Applied once, here, so every consumer of a site sees the final size.
  const SITE_GROWTH = {
    skerry_airfield:       { dc: 24,  dr: 16 },
    saint_elian_harbour:   { dc: 20,  dr: 12 },
    lowmoor_works:         { dc: 36,  dr: 24 },
    corvane_exchange:      { dc: 30,  dr: 22 },
    dunmere_fuel_works:    { dc: 60,  dr: 40 },
    arden_stadium_quarter: { dc: 60,  dr: 40 },
    castellan_district:    { dc: 70,  dr: 40 },
    halden_freeport:       { dc: 70,  dr: 44 },
    // room: extra rows of open ground along the south, on top of dr, that the
    // job sizer (heavyFit) does not count. The full-chain fusion sites were
    // sized so the job filled them; this is space to lay it out in — the
    // job is the same size, there is just room for the belts, pipes and
    // access around it. South only, so a site already in progress keeps
    // its client buildings where they are and simply gains open land.
    novacrest_metropolis:  { dc: 120, dr: 70, room: 80 },
    orbital_spaceport:     { dc: 130, dr: 76, room: 80 },
    kaldera_fusion_campus: { dc: 130, dr: 70, room: 80 },
    saltreach_desalination: { dc: 70, dr: 40, room: 80 },
    meridian_interconnect: { dc: 80, dr: 50, room: 80 },
    borealis_station:      { dc: 60, dr: 40, room: 80 },
  };
  function _growSite(site, dc, dr, room = 0) {
    const work = site.markers[site.work], hub = site.markers[site.hub];
    const edge = work.maxC;                       // work side ends here, as authored
    for (const p of site.prebuilt) if (p.col > edge) p.col += dc;
    hub.minC += dc; hub.maxC += dc;
    work.maxC += dc; work.maxR += dr;
    site._fitMaxR = work.maxR;                    // what the job is sized against
    work.maxR += room;
    site.bounds.cols += dc; site.bounds.rows += dr + room;
  }
  for (const [id, g] of Object.entries(SITE_GROWTH)) if (SITES[id]) _growSite(SITES[id], g.dc, g.dr, g.room || 0);

  // ── Ground for the full-chain jobs ───────────────────────────────
  //
  // Every site that carries a stocked fuel store can also be asked for the
  // whole chain instead (see the `chain` packages): the crew mines, processes
  // and fabricates the fuel itself. That needs ore in the ground, so those
  // sites get uranium and sulfur bodies — and the fusion sites two more gas
  // fields, since a Helium-3 Separator wants wells of its own. They go in the
  // strip the growth above opened along the south of the build area, which is
  // empty by construction, so no authored layout has to move.
  for (const [id, g] of Object.entries(SITE_GROWTH)) {
    const site = SITES[id];
    if (!site) continue;
    const stocks = k => site.prebuilt.some(p => p.type === T.SOLIDSTORAGE && p.props && p.props._solidType === k);
    const work = site.markers[site.work];
    const x0 = work.minC + 3, y0 = (work.maxR - (g.room || 0) - g.dr) + 4;   // just below the authored build area
    if (stocks('rods')) {
      for (let i = 0; i < 4; i++) site.prebuilt.push(uraniumAt(x0 + i * 10, y0));
      for (let i = 0; i < 2; i++) site.prebuilt.push(sulfurAt(x0 + 40 + i * 10, y0));
    }
    if (stocks('pellets')) {
      for (let i = 0; i < 2; i++) site.prebuilt.push(heliumAt(x0 + i * 10, y0 + 9));
      // East of the gas fields and a mine's depth below the ore row above.
      for (let i = 0; i < 2; i++) site.prebuilt.push(lithiumAt(x0 + 28 + i * 16, y0 + 14));
    }
  }

  // ── Client buildings never overlap ───────────────────────────────
  //
  // Hand-laid sites were written against the footprints of the day, and the
  // civic buildings and many business types have since grown to street scale
  // (ArtFootprints, entity_defs.js): a 6×5 hospital is 14×12 now, so
  // Halloway's courthouse stood in its car park and its substation inside
  // the building. Rather than re-lay every site by hand (and again at the
  // next resize), each site is settled here, once, at the sizes it will be
  // stamped at (contract_system.js). The largest buildings keep their
  // authored spots; anything landing on one moves to the nearest free
  // ground: inside the marker it was placed in if it fits there, else
  // anywhere off the player's build area and out of the water, else
  // anywhere on site. Storm targets and stamping both read site.prebuilt
  // afterwards, so they see the settled positions.
  function _prebuiltFootprint(p) {
    const sub = p.props && p.props.commercialSubtype;
    if (sub && SubtypeFootprints[sub] && (p.type === T.COMMERCIAL || p.type === T.INDUSTRIAL || p.type === T.HOUSE)) {
      return { w: SubtypeFootprints[sub].width, h: SubtypeFootprints[sub].height };
    }
    const d = EntityDefs[p.type] || {};
    return { w: d.width || 1, h: d.height || 1 };
  }
  function _settlePrebuilt(site) {
    const cols = site.bounds.cols, rows = site.bounds.rows;
    const taken = new Uint8Array(cols * rows);
    const water = new Uint8Array(cols * rows);
    for (const rect of [...(site.water || []), ...(site.river || [])])
      for (let r = Math.max(0, rect.minR); r <= Math.min(rows - 1, rect.maxR); r++)
        for (let c = Math.max(0, rect.minC); c <= Math.min(cols - 1, rect.maxC); c++) water[r * cols + c] = 1;
    const fits = (c, r, w, h, area, dry) => {
      if (c < 0 || r < 0 || c + w > cols || r + h > rows) return false;
      if (area && (c < area.minC || r < area.minR || c + w - 1 > area.maxC || r + h - 1 > area.maxR)) return false;
      for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) {
        if (taken[y * cols + x] || (dry && water[y * cols + x])) return false;
      }
      return true;
    };
    const outsideWork = (c, r, w, h) => {
      const k = site.markers && site.markers[site.work];
      return !k || c + w - 1 < k.minC || c > k.maxC || r + h - 1 < k.minR || r > k.maxR;
    };
    const claim = (c, r, w, h) => { for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) taken[y * cols + x] = 1; };
    // Nearest spot to (c0,r0), ring by ring, passing `ok`.
    const nearest = (c0, r0, w, h, ok) => {
      const reach = Math.max(cols, rows);
      for (let d = 1; d <= reach; d++) {
        let best = null, bestD = Infinity;
        for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== d) continue;
          const c = c0 + dc, r = r0 + dr;
          if (!ok(c, r)) continue;
          const dd = dc * dc + dr * dr;
          if (dd < bestD) { bestD = dd; best = { c, r }; }
        }
        if (best) return best;
      }
      return null;
    };
    const order = site.prebuilt.map((p, i) => ({ p, i, ...(_prebuiltFootprint(p)) }))
      .sort((a, b) => (b.w * b.h - a.w * a.h) || (a.i - b.i));
    for (const { p, w, h } of order) {
      if (fits(p.col, p.row, w, h, null, false)) { claim(p.col, p.row, w, h); continue; }
      const home = Object.values(site.markers || {}).find(k =>
        p.col >= k.minC && p.col <= k.maxC && p.row >= k.minR && p.row <= k.maxR);
      const spot = (home && nearest(p.col, p.row, w, h, (c, r) => fits(c, r, w, h, home, true)))
        || nearest(p.col, p.row, w, h, (c, r) => fits(c, r, w, h, null, true) && outsideWork(c, r, w, h))
        || nearest(p.col, p.row, w, h, (c, r) => fits(c, r, w, h, null, false));
      if (!spot) continue;                       // no room anywhere: leave it as authored
      p.col = spot.c; p.row = spot.r;
      claim(p.col, p.row, w, h);
    }
  }
  for (const site of Object.values(SITES)) if (site.prebuilt && site.bounds) _settlePrebuilt(site);

  // ── Client standing (§2) ─────────────────────────────────────────
  //
  // Repeat clients are what stop a generated board feeling procedural:
  // a list of one-off strangers reads as a spawner, whereas Ashford
  // coming back with a bigger job reads as a career. Standing lives here
  // rather than in ContractSystem because it is client data and the
  // generator prices against it.
  const standing = new Map();

  function standingFor(client) {
    return standing.get(client) || { completed: 0, failed: 0 };
  }
  function recordOutcome(client, ok) {
    const s = standingFor(client);
    if (ok) s.completed++; else s.failed++;
    standing.set(client, s);
    return s;
  }

  // Good history earns better rates; a bad one costs. Capped so a long
  // record cannot run away with the economy.
  function standingMultiplier(client) {
    const s = standingFor(client);
    const m = 1 + Math.min(0.30, s.completed * 0.07) - Math.min(0.20, s.failed * 0.08);
    return Math.max(0.75, m);
  }

  // ── Contract generation (§3) ─────────────────────────────────────
  //
  // Composed from Progression.unlocked read LIVE, never from a wattage
  // tier: several tier-1 gates are non-wattage (biofuel collected, day
  // count, coal discovery), so two players at the same wattage can have
  // different palettes. Reading the live set also means the system
  // scales itself for free as the player unlocks more.

  // Which generation a site can actually support is declared per site,
  // because arrival conditions decide it: solar makes nothing at Ashford's
  // 18:36 dusk, so offering a solar array there would be an unwinnable
  // contract. Biofuel generators are excluded everywhere — they need a
  // fuelled tank (>= 25 units, resource_helpers.js:143) and biofuel is
  // collected at home, so one placed on a job site never starts.

  function isUnlocked(type) {
    return typeof Progression !== 'undefined' && Progression.isUnlocked(type);
  }
  // ── Profit band by research tier ─────────────────────────────────
  //
  // Contract profit is banded until the player's research opens up. Early
  // contracts are meant to be a useful supplement to a small grid, not a
  // way to skip past building one: materials scale with site size, so
  // without a ceiling a single big job could out-earn hours of running the
  // player's own city. Each research tier lifts the band sharply, so
  // contract work grows into a serious income stream rather than starting
  // as one.
  //
  // The FLOOR matters as much as the ceiling. Margin is a percentage of the
  // equipment bill, and a small site at the bottom of the 5-25% band pays
  // almost nothing — which reads as the board offering junk rather than as
  // a small job. A tier's floor is what the player can expect to clear for
  // turning up at all, so crossing a research tier visibly raises the worst
  // offer on the board as well as the best one.
  const PROFIT_BANDS = [
    { unlock: () => Progression.isUnlocked(T.MK5RESEARCH), min: 150000, cap: Infinity },
    { unlock: () => Progression.isUnlocked(T.MK4RESEARCH), min: 55000, cap: 300000 },
    { unlock: () => Progression.isUnlocked(T.RESEARCH3),   min: 24000, cap: 100000 },
    { unlock: () => Progression.isUnlocked(T.RESEARCH2),   min: 10000, cap: 40000  },
  ];
  const BASE_BAND = { min: 900, cap: 15000 };

  function profitBand() {
    if (typeof Progression === 'undefined') return BASE_BAND;
    for (const tier of PROFIT_BANDS) {
      try { if (tier.unlock()) return tier; } catch (_e) { /* type not defined in this build */ }
    }
    return BASE_BAND;
  }

  function profitCap() { return profitBand().cap; }

  // ── Tiers, so the board follows the player ───────────────────────
  //
  // A late-game board full of first-tier jobs is just noise. Each site has a
  // tier (0 = starting sites, up to the research tier that opens it) and the
  // player has one (the highest research station they have). Sites at or near
  // the player's tier are favoured when the board is filled; older ones still
  // turn up now and then, because a repeat client coming back is part of the
  // fiction and a small quick job is sometimes what you want.
  const TIER_UNLOCKS = [T.RESEARCH2, T.RESEARCH3, T.MK4RESEARCH, T.MK5RESEARCH];
  const SITE_TIERS = {
    ashford_ridge: 0, calder_flats: 0, mirebeck_yard: 0,
    saltmarket_rows: 1, tarn_hollow: 1, halloway_civic: 1, draycott_colliery: 1, ferrow_catchment: 1,
    kestrel_point: 2, stallbeck_field: 2, ostrey_junction: 2, marlowe_campus: 2, skerry_airfield: 2,
    vance_ridge: 3, corvane_exchange: 3, dunmere_fuel_works: 3, halden_freeport: 3,
    brindle_high_street: 0, pellworth_market_town: 1, garrow_mill_quarter: 1,
    saint_elian_harbour: 2, lowmoor_works: 2, castellan_district: 3, arden_stadium_quarter: 3,
    novacrest_metropolis: 4, orbital_spaceport: 4, tarbet_mill_valley: 2,
    kaldera_fusion_campus: 4, saltreach_desalination: 4, meridian_interconnect: 4, borealis_station: 4,
    stonegate_gorge: 3, tamsin_reservoirs: 3,
  };
  function playerTier() {
    let t = 0;
    for (let i = 0; i < TIER_UNLOCKS.length; i++) if (isUnlocked(TIER_UNLOCKS[i])) t = i + 1;
    return t;
  }
  function siteTier(id) {
    const s = SITES[id];
    if (s && s.tier !== undefined) return s.tier;
    return SITE_TIERS[id] !== undefined ? SITE_TIERS[id] : 0;
  }
  function siteWeight(id) {
    const gap = playerTier() - siteTier(id);
    return gap <= 0 ? 3 : gap === 1 ? 1.5 : gap === 2 ? 0.6 : 0.25;
  }
  // A site with no deposits, river or stocked fuel can only ever deal wind
  // or solar. Once the player runs power with a supply chain, those sites
  // come up less, so the board isn't mostly turbine fields. Still offered.
  const OPEN_ONLY_SITE_WEIGHT = 0.3;
  function _varietyWeight(id) {
    if (!LATER_POWER.some(p => established.has(p)) && !established.has('geo')) return 1;
    const pool = packagesFor(SITES[id]);
    return pool.length && pool.every(p => p.menu) ? OPEN_ONLY_SITE_WEIGHT : 1;
  }
  // Weighted choice from a list of site ids.
  function pickSite(ids) {
    if (!ids.length) return null;
    const w = ids.map(id => siteWeight(id) * _varietyWeight(id));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < ids.length; i++) { r -= w[i]; if (r <= 0) return ids[i]; }
    return ids[ids.length - 1];
  }

  // ── Reputation ───────────────────────────────────────────────────
  //
  // Money stops meaning much late in the game, so standing is the other
  // currency. Each client has a rank from how many of its jobs you have
  // finished (it already lifts their rates — see standingMultiplier), and the
  // player has a contractor rank from every job they have ever finished.
  // Contractor rank is what opens the bigger showcase jobs and widens the
  // board.
  const CLIENT_RANKS = [
    { name: 'New client', min: 0 }, { name: 'Known', min: 1 }, { name: 'Trusted', min: 3 },
    { name: 'Preferred', min: 6 }, { name: 'Partner', min: 10 },
  ];
  const CONTRACTOR_RANKS = [
    { name: 'Apprentice', min: 4 }, { name: 'Journeyman', min: 8 }, { name: 'Contractor', min: 20 },
    { name: 'Master', min: 40 }, { name: 'Legend', min: 70 },
  ];
  function _rankOf(list, n) {
    let idx = 0;
    for (let i = 0; i < list.length; i++) if (n >= list[i].min) idx = i;
    return { index: idx, name: list[idx].name, count: n, next: list[idx + 1] || null };
  }
  function clientRank(client) { return _rankOf(CLIENT_RANKS, standingFor(client).completed); }
  function contractorRank() {
    let n = 0;
    for (const s of standing.values()) n += s.completed || 0;
    return _rankOf(CONTRACTOR_RANKS, n);
  }

  // ── Job size ─────────────────────────────────────────────────────
  //
  // One number for "how big and how hard is this job": every piece of kit,
  // weighted up for plant with a supply chain behind it, plus what the client
  // wants proven and how many kinds of plant are involved. Read straight from
  // a contract's requirements, so a job restored from a save scores the same.
  // About 0.25 is a small early job, 1.0 a heavy one; it is not capped above
  // (the pay curve caps it) so a flagship can score past 1.
  function complexityOf(contract) {
    const reqs = requirementsFor(contract);
    const genTypes = new Set(GEN_PACKAGES.map(p => p.rated || p.parts[0].type));
    const kinds = new Set();
    let pts = 0;
    for (const r of reqs) {
      const n = r.count || 1;
      if (r.kind === 'place')        { pts += n; if (genTypes.has(r.type)) kinds.add(r.type); }
      else if (r.kind === 'running') { pts += n * 2; kinds.add(r.type); }
      else if (r.kind === 'store')   pts += 1 + n * 0.5;
      else if (r.kind === 'connect' || r.kind === 'protect') pts += 1;
      else if (r.kind === 'sustain') pts += 2 + (r.hours || 1) / 6;
      else if (r.kind === 'service') pts += 2;
      else if (r.kind === 'repair')  pts += 1 + (r.targets || []).length * 0.6;
      else if (r.kind === 'clear')   pts += 3 + (r.piles || []).length * 1.5;
      else if (r.kind === 'limit')   pts += 4;
    }
    pts += Math.max(0, kinds.size - 1) * 3;
    return pts / 50;
  }
  function sizeName(c) { return c < 0.3 ? 'Small' : c < 0.7 ? 'Medium' : c < 1.3 ? 'Large' : 'Flagship'; }
  function sizeOf(contract) { return sizeName(complexityOf(contract)); }

  function pick(arr)      { return arr[Math.floor(Math.random() * arr.length)]; }
  function between(a, b)  { return a + Math.random() * (b - a); }
  function intBetween(a, b) { return Math.floor(between(a, b + 1)); }

  // Peak draw of everything the client already has on site. Uses the demand
  // CURVE peak rather than def.powerInput: a cold store's def says 15 kW but
  // its curve runs to 17 kW, and a house's curve peaks well above its def.
  // Sizing generation off the def would under-build the site.
  function siteLoad(site) {
    let w = 0;
    for (const p of site.prebuilt) {
      const def = EntityDefs[p.type] || {};
      if (!(def.powerInput > 0)) continue;
      let peak = 0;
      if (typeof DemandCurves !== 'undefined' && DemandCurves.peak) {
        peak = DemandCurves.peak(p.type, (p.props && p.props.commercialSubtype) || null) || 0;
      }
      w += Math.max(peak, def.powerInput);
    }
    return w;
  }

  // What one unit of a generator can be RELIED ON to deliver, which is not
  // its best case. Wind is quoted as a base..max range that tracks wind
  // speed, so the base is the figure a job can actually be sized against —
  // promising a client a turbine's peak output would leave the site short
  // every calm hour. Solar is derated for cloud and off-noon sun.
  function unitOutput(type) {
    const def = EntityDefs[type] || {};
    if (def.baseOutput) return def.baseOutput;           // wind: guaranteed floor
    if (def.peakOutput) return def.peakOutput * 0.6;     // solar: realistic average
    return def.powerOutput || 1;
  }

  // How many units the work area can physically take, so a heavy site can
  // never ask for more plant than there is room to build.
  function unitCapacity(site, type) {
    const m = site.markers[site.work];
    const def = EntityDefs[type] || {};
    if (!m) return 8;
    const area = (m.maxC - m.minC + 1) * (m.maxR - m.minR + 1);
    const foot = (def.width || 1) * (def.height || 1);
    // Half the area, since equipment needs wire runs and gaps between it.
    return Math.max(2, Math.floor((area * 0.5) / foot));
  }

  // -- What a job can be made of -----------------------------------
  //
  // A contract is COMPOSED rather than picked. One to three generation
  // packages are sized against the site's load and mixed, and the client
  // may tack on other work they want done while a crew is on site. Every
  // package is gated on what the player has actually unlocked, so a job
  // can never ask for kit they cannot build.
  //
  // `needs` names a capability the site has to have:
  //   'open' - bare build ground, and the type must be on the site's own
  //            `generation` menu (that is where per-site flavour lives: a
  //            dusk-and-overcast ridge does not advertise solar)
  //   'geo'  - the site carries a geothermal deposit to sink a well into
  //
  // `parts` is every type the package needs on the ground. Geothermal is
  // two clauses because neither half is worth anything alone: a well with
  // no turbine over its steam port generates nothing.
  //
  // `net` is what one unit is worth to the site AFTER its own draw - a
  // geothermal pair makes 35 kW and the well spends 10 kW of it, so sizing a
  // site against 35 would leave it short.
  // A package's `parts` are every type it puts on the ground. `count(n)`
  // turns the package's size (n producing units) into how many of that
  // part are needed, `draw` is what the part spends off the top, and
  // `running: true` marks the part whose supply chain has to actually be
  // working rather than merely wired (see the `running` kind).
  //
  // `net(n)` is therefore what the package is worth to the SITE: a coal
  // set makes 100 kW but spends 12 kW on the mine and 25 kW on the water
  // extractor, so one set is worth 63 kW, and the second generator on the
  // same mine is worth a full 100 kW more.
  const GEN_PACKAGES = [
    // The turbine and panel tiers share a `family`, so wind is one choice
    // when a job is composed, not three (see composeGeneration).
    { id: 'wind1',  family: 'wind',  needs: [], unlock: T.WIND,  menu: T.WIND,
      parts: [{ type: T.WIND,   count: n => n, powered: true }], gross: 5 },
    { id: 'wind2',  family: 'wind',  needs: [], unlock: T.WIND2, menu: T.WIND2,
      parts: [{ type: T.WIND2,  count: n => n, powered: true }], gross: 13 },
    { id: 'solar1', family: 'solar', needs: [], unlock: T.SOLAR, menu: T.SOLAR,
      parts: [{ type: T.SOLAR,  count: n => n, powered: true }], gross: 3 },
    { id: 'solar2', family: 'solar', needs: [], unlock: T.SOLAR2, menu: T.SOLAR2,
      parts: [{ type: T.SOLAR2, count: n => n, powered: true }], gross: 15 },
    { id: 'wind3',  family: 'wind',  needs: [], unlock: T.WIND3, menu: T.WIND3,
      parts: [{ type: T.WIND3,  count: n => n, powered: true }], gross: 28 },

    // Heat: a well per deposit, a turbine over each well's steam port.
    // The well is plumbing and draws 10 kW of the 35 kW the pair makes.
    { id: 'geo', needs: ['geo'], unlock: T.GEOTURBINE, rated: T.GEOTURBINE,
      parts: [
        { type: T.GEOWELL,    count: n => n, powered: false, draw: 10 },
        { type: T.GEOTURBINE, count: n => n, running: true },
      ], gross: 35 },

    // Coal: the deepest chain a job site can carry. The deposit and the
    // lake come with the site; the crew sinks a mine, runs a conveyor to
    // the generator, drops an extractor on the lake and pipes water to the
    // generator's water stub. Nothing burns without BOTH, which is what
    // the `running` clause on the generator is there to prove.
    //
    // One MK1 mine sustains ~2.9 generators (MK1_COAL_PER_SEC in
    // coal_system.js), so a second generator on the same mine is free of
    // new support plant; count(n) still asks for a mine per two.
    { id: 'coal', needs: ['coal', 'water'], unlock: T.COALGENERATOR, rated: T.COALGENERATOR,
      parts: [
        { type: T.COALMINE,       count: n => Math.ceil(n / 2), powered: true, draw: 12 },
        { type: T.WATEREXTRACTOR, count: n => Math.ceil(n / 2), powered: true, draw: 25 },
        { type: T.COALGENERATOR,  count: n => n, running: true },
      ], gross: 100 },

    // Oil: pump jack on the deposit, a tank to hold the crude, a refinery
    // to crack it, a generator to burn it — four buildings and two
    // separate pipe runs, and the generator makes nothing until the whole
    // line is joined up (oil_system.js:487). The densest thing a site can
    // ask for, and priced accordingly.
    { id: 'oil', needs: ['oil'], unlock: T.FUELGEN, rated: T.FUELGEN,
      parts: [
        { type: T.PUMPJACK,   count: n => n, powered: true, draw: 15 },
        { type: T.OILSTORAGE, count: n => n, powered: false, holds: 'oil', holdAmount: 200 },   // passive — no draw, no connection
        { type: T.REFINERY,   count: n => n, powered: true, draw: 22 },
        { type: T.FUELGEN,    count: n => n, running: true },
      ], gross: 125 },

    // Fission. A unit here is one turbine's worth (300 kW): every three
    // turbines need a reactor and two cooling towers (20 u/s of cooling
    // against 15 a tower), and the two towers drink 30 u/s of water, more
    // than one extractor's 25, so two extractors on the lake. The client's fuel store, already stocked, is what
    // the rods come from — the crew belts them to the reactor. Nothing turns
    // until the rods, the cooling water and the steam line are all joined
    // up, which is what the `running` clause on the turbines proves. Reactors
    // are big, so the size is capped by floor space rather than by parts.
    { id: 'nuclear', needs: ['rods', 'water'], unlock: T.NUCLEARREACTOR, rated: T.NUCLEARREACTOR, heavy: true, min: 3,
      parts: [
        { type: T.WATEREXTRACTOR, count: n => 2 * Math.ceil(n / 3), powered: true,  draw: 25 },
        { type: T.COOLINGTOWER,   count: n => 2 * Math.ceil(n / 3), powered: true,  draw: 15 },
        { type: T.NUCLEARREACTOR, count: n => Math.ceil(n / 3), powered: false },
        { type: T.STEAMTURBINE,   count: n => n, running: true },
      ], gross: 300, bootstrapKw: 100 },

    // The Advanced Reactor: MOX fuel, a cryogenic cooling tower and a great
    // deal more steam (twelve turbines' worth), so a unit is again a turbine
    // and a reactor is a much bigger step.
    { id: 'adv', needs: ['mox', 'water'], unlock: T.ADVREACTOR, rated: T.ADVREACTOR, heavy: true, min: 6,
      parts: [
        { type: T.WATEREXTRACTOR, count: n => Math.ceil(n / 4),  powered: true,  draw: 25 },
        // The cryogenic tower drinks 70 u/s of cooled water, not raw water:
        // five MK1 towers (15 each) per cryo tower, which is what the three
        // extractors per reactor above are there to feed.
        { type: T.COOLINGTOWER,   count: n => 5 * Math.ceil(n / 12), powered: true, draw: 15 },
        { type: T.COOLINGTOWER2,  count: n => Math.ceil(n / 12), powered: true,  draw: 110 },
        { type: T.ADVREACTOR,     count: n => Math.ceil(n / 12), powered: false },
        { type: T.STEAMTURBINE,   count: n => n, running: true },
      ], gross: 300, bootstrapKw: 250 },

    // Hydro: dam a river, set a turbine in the reservoir behind it, and drive a
    // generator on the bank by a shaft. A dam and its reservoir feed two turbines
    // (each draws water; the river only refills so fast), so a unit is one
    // turbine-and-generator pair and every two pairs need a river. The turbine
    // and the dam stand in the water, so only the generators take up bank.
    // Worth about 120 kW a pair at the start (measured on a live site: the
    // reservoir opens three-quarters full and a short river holds the turbines
    // to about half the generator's 235 kW rating), rising a little as it fills.
    { id: 'hydro', needs: ['river'], unlock: T.HYDROGENERATOR, rated: T.HYDROGENERATOR, heavy: true, hydro: true,
      parts: [
        { type: T.DAM,            count: n => Math.ceil(n / 2), powered: false, onWater: true },
        { type: T.HYDROTURBINE,   count: n => n,                powered: true,  onWater: true, draw: 10 },
        { type: T.HYDROGENERATOR, count: n => n,                running: true },
      ], gross: 120, bootstrapKw: 100 },

    // Fusion, by the same rule as at home: the Fusion Reactor burns D-T and
    // raises steam (2000, five Steam Turbine MK2s' worth). A unit is one MK2
    // turbine (1.2 MW): five per reactor, a Helium Well and a Cryo Plant to
    // keep the magnets cold, and the client's stocked D-T pellet store to
    // fuel it. Steam doesn't need lithium on the blanket (that only breeds
    // tritium), so none is asked for. The reactor's startup surge is a small
    // ignition pulse on a job site (see HulkingFusionReactorSystem), which the
    // job's own starter generation covers. Sized by floor space, so only the
    // largest sites can hold it. D-He3 and the MHD Rings belong to the
    // Advanced Fusion Reactor (the next package).
    { id: 'fusion', needs: ['pellets', 'helium'], unlock: T.HULKINGFUSIONREACTOR, rated: T.HULKINGFUSIONREACTOR, heavy: true, min: 3,
      parts: [
        { type: T.HELIUMWELL,           count: n => Math.ceil(n / 5), powered: true, onDeposit: true, draw: 20 },
        { type: T.CRYOPLANT,            count: n => Math.ceil(n / 5), powered: true, draw: 60 },
        { type: T.HULKINGFUSIONREACTOR, count: n => Math.ceil(n / 5), powered: true, draw: 90 },
        { type: T.STEAMTURBINE2,        count: n => n, running: true },
      ], gross: 1200, bootstrapKw: 400 },

    // Advanced fusion, again by the home rule: the Advanced Fusion Reactor
    // burns D-He3 from the client's stocked bin and streams ions to MHD Rings.
    // A unit is one ring (4 MW), four to a reactor. Its magnets boil off 6/s
    // of liquid helium, so every reactor takes two Cryo Plants (3/s each) on
    // three Helium Wells (2/s each), and the site's gas fields cap the job at
    // one reactor per three fields. Its converters shed their waste heat into
    // 90/s of Cryogenic Coolant: two Cryogenic Cooling Towers (48/s each),
    // each drinking 70/s of cooled water off five ordinary towers (15/s each),
    // which six extractors on the lake keep in water. Short of coolant the
    // rings get 30% of the stream, so the towers are part of the job, not an
    // extra. The largest kit a site can be asked for.
    { id: 'advfusion', family: 'fusion', needs: ['he3pellets', 'helium', 'water'], unlock: T.ADVFUSIONREACTOR, rated: T.ADVFUSIONREACTOR, heavy: true, min: 4,
      parts: [
        { type: T.HELIUMWELL,       count: n => 3 * Math.ceil(n / 4),  powered: true, onDeposit: true, draw: 20, deposit: T.HELIUMDEPOSIT },
        { type: T.CRYOPLANT,        count: n => 2 * Math.ceil(n / 4),  powered: true, draw: 60 },
        { type: T.WATEREXTRACTOR,   count: n => 6 * Math.ceil(n / 4),  powered: true, draw: 25 },
        { type: T.COOLINGTOWER,     count: n => 10 * Math.ceil(n / 4), powered: true, draw: 15 },
        { type: T.COOLINGTOWER2,    count: n => 2 * Math.ceil(n / 4),  powered: true, draw: 110 },
        { type: T.ADVFUSIONREACTOR, count: n => Math.ceil(n / 4),      powered: true, draw: 160 },
        { type: T.MHDRING,          count: n => n, running: true },
      ], gross: 4000, bootstrapKw: 900 },

    // ── Full-chain jobs ──────────────────────────────────────────────
    //
    // The three reactor packages above run off fuel the client has left in a
    // store. These are the same plant with nothing supplied: the crew mines
    // the ore, makes the fuel and only then lights the reactor. They are the
    // late game's version of the job, so each is held back three ways:
    //   `after`  the stocked version of the same power must be established
    //            (the player has run that reactor on their own grid);
    //   `proof`  the player must own the fuel-making plant at home, so nobody
    //            is asked to build a chain they have never built; and
    //   `late`   a research tier past the one the reactor itself arrives in.
    // `family` keeps a job from asking for the stocked and the full-chain
    // version of the same reactor at once. `chain: true` is what the title
    // and the reactor's checklist line read to say the fuel is the crew's own.
    // A part with `deposit` stands on that kind of ore body, one apiece, so
    // the site's deposits cap the package (packageCap).

    // Fission from the ground up. A Fuel Processing Plant keeps 2.6 reactors
    // in rods (0.13/s against 0.05/s each), so every six turbines (two
    // reactors) get one plant, with a uranium mine on its belt and a sulfur
    // mine and Chemical Plant making the acid it needs. The Chemical Plant's
    // water comes off the same extractors as the cooling towers.
    { id: 'nuclear_full', family: 'nuclear', after: 'nuclear', chain: true, late: () => isUnlocked(T.MK4RESEARCH),
      proof: [T.URANIUMMINE, T.SULFURMINE, T.CHEMICALPLANT, T.FUELPLANT],
      needs: ['uranium', 'sulfur', 'water'], unlock: T.NUCLEARREACTOR, rated: T.NUCLEARREACTOR, heavy: true, min: 3,
      parts: [
        { type: T.URANIUMMINE,    count: n => Math.ceil(n / 6), powered: true, draw: 25, onDeposit: true, deposit: T.URANIUMDEPOSIT },
        { type: T.SULFURMINE,     count: n => Math.ceil(n / 6), powered: true, draw: 25, onDeposit: true, deposit: T.SULFURDEPOSIT },
        { type: T.CHEMICALPLANT,  count: n => Math.ceil(n / 6), powered: true, draw: 30 },
        { type: T.FUELPLANT,      count: n => Math.ceil(n / 6), powered: true, draw: 30 },
        { type: T.WATEREXTRACTOR, count: n => 2 * Math.ceil(n / 3), powered: true, draw: 25 },
        { type: T.COOLINGTOWER,   count: n => 2 * Math.ceil(n / 3), powered: true, draw: 15 },
        { type: T.NUCLEARREACTOR, count: n => Math.ceil(n / 3), powered: false, ownFuel: true },
        { type: T.STEAMTURBINE,   count: n => n, running: true },
      ], gross: 300, bootstrapKw: 250 },

    // The closed fuel cycle. An Advanced Reactor burns MOX, MOX needs
    // plutonium, and plutonium only comes out of spent fission fuel, so this
    // job is a fission plant AND the plant it feeds. Per Advanced Reactor
    // (twelve turbines): two fission reactors with their own six turbines,
    // towers and fuel line; a Reprocessing Plant on their spent-fuel belt
    // (two reactors make 0.035/s, which is the 0.005/s of plutonium one
    // Advanced Reactor's MOX takes); and an Advanced Fuel Processing plant
    // blending that plutonium into uranium: recovered, topped up with mined
    // ore off a second uranium mine. A unit is still one of the Advanced
    // Reactor's turbines, and the fission side's output is left out of
    // `gross`, so the job is sized as if only the big reactor counted and the
    // site ends up with power to spare rather than short.
    { id: 'adv_full', family: 'adv', after: 'adv', chain: true, late: () => isUnlocked(T.MK5RESEARCH),
      proof: [T.REPROCESSOR, T.MOXPLANT, T.FUELPLANT],
      needs: ['uranium', 'sulfur', 'water'], unlock: T.ADVREACTOR, rated: T.ADVREACTOR, heavy: true, min: 6,
      parts: [
        { type: T.URANIUMMINE,    count: n => 2 * Math.ceil(n / 12), powered: true, draw: 25, onDeposit: true, deposit: T.URANIUMDEPOSIT },
        { type: T.SULFURMINE,     count: n => Math.ceil(n / 12),     powered: true, draw: 25, onDeposit: true, deposit: T.SULFURDEPOSIT },
        { type: T.CHEMICALPLANT,  count: n => Math.ceil(n / 12),     powered: true, draw: 30 },
        { type: T.FUELPLANT,      count: n => Math.ceil(n / 12),     powered: true, draw: 30 },
        { type: T.WATEREXTRACTOR, count: n => Math.ceil(n / 4) + 4 * Math.ceil(n / 12), powered: true, draw: 25 },
        // Four MK1 towers for the two fission reactors (two each) and five
        // more to feed the cryogenic tower its cooled water (70 u/s against
        // 15 a tower).
        { type: T.COOLINGTOWER,   count: n => 9 * Math.ceil(n / 12), powered: true, draw: 15 },
        { type: T.NUCLEARREACTOR, count: n => 2 * Math.ceil(n / 12), powered: false, ownFuel: true },
        // The fission reactors' spent rods cool in a pool before the
        // Reprocessing Plant will take them (it refuses fuel belted straight
        // from a reactor).
        { type: T.SPENTFUELPOOL,  count: n => Math.ceil(n / 12),     powered: true, draw: 50 },
        { type: T.REPROCESSOR,    count: n => Math.ceil(n / 12),     powered: true, draw: 120 },
        { type: T.MOXPLANT,       count: n => Math.ceil(n / 12),     powered: true, draw: 140 },
        { type: T.COOLINGTOWER2,  count: n => Math.ceil(n / 12),     powered: true, draw: 110 },
        { type: T.ADVREACTOR,     count: n => Math.ceil(n / 12),     powered: false, ownFuel: true },
        { type: T.STEAMTURBINE,   count: n => n + 6 * Math.ceil(n / 12), running: true },
      ], gross: 300, bootstrapKw: 600 },

    // Fusion with the fuel made on site: D-T, as the stocked job burns and as
    // the Fusion Reactor does at home. A pellet is 8 deuterium and 8 tritium,
    // and a reactor at full burn takes half a pellet a second, so 4/s of each.
    //   Deuterium is washed out of water: three Wash Towers (1.51/s each) on
    //   the ammonia of one Haber-Bosch plant (a catalyst, not consumed), itself
    //   on nitrogen from an Atmospheric Collector and hydrogen from an
    //   Electrolyzer.
    //   Tritium is bred from lithium. The reactor's own blanket breeds 4.4/s
    //   at full burn on 2/s of Lithium Compound: one Processing Plant (2.4/s)
    //   on a Lithium Mine (15 ore/s) covers it; the site's two lithium
    //   deposits leave the second for the breeder and for banking. But the blanket breeds nothing until the reactor is
    //   burning, so a Tritium Breeding Facility (1/s, off the same compound)
    //   makes the first pellets and idles once the loop closes.
    // A unit is one of four MK2 turbines, sized when three towers made 3.99/s
    // (1995 steam, a hair under the fifth turbine's 400). At 1.51/s they make
    // 4.53/s and the reactor reaches full burn, so a fifth turbine now runs
    // and the job's counts are conservative by one. With two lithium deposits
    // to a site the job is always exactly one reactor.
    { id: 'fusion_full', family: 'fusion', after: 'fusion', chain: true,
      proof: [T.FUSIONFUELPLANT, T.WASHTOWER, T.LITHIUMPROCESSPLANT, T.TRITIUMBREEDER],
      needs: ['helium', 'lithium', 'water'], unlock: T.HULKINGFUSIONREACTOR, rated: T.HULKINGFUSIONREACTOR, heavy: true, min: 4,
      parts: [
        { type: T.WATEREXTRACTOR,       count: n => Math.ceil(n / 4),     powered: true, draw: 25 },
        { type: T.ELECTROLYZER,         count: n => Math.ceil(n / 4),     powered: true, draw: 55 },
        { type: T.ATMOSCOLLECTOR,       count: n => Math.ceil(n / 4),     powered: true, draw: 30 },
        { type: T.HABERBOSCH,           count: n => Math.ceil(n / 4),     powered: true, draw: 65 },
        { type: T.WASHTOWER,            count: n => 3 * Math.ceil(n / 4), powered: true, draw: 75 },
        { type: T.LITHIUMMINE,          count: n => 2 * Math.ceil(n / 4), powered: true, draw: 70, onDeposit: true, deposit: T.LITHIUMDEPOSIT },
        { type: T.LITHIUMPROCESSPLANT,  count: n => 2 * Math.ceil(n / 4), powered: true, draw: 85 },
        { type: T.TRITIUMBREEDER,       count: n => Math.ceil(n / 4),     powered: true, draw: 125 },
        { type: T.FUSIONFUELPLANT,      count: n => Math.ceil(n / 4),     powered: true, draw: 100 },
        { type: T.HELIUMWELL,           count: n => Math.ceil(n / 4),     powered: true, draw: 20, onDeposit: true, deposit: T.HELIUMDEPOSIT },
        { type: T.CRYOPLANT,            count: n => Math.ceil(n / 4),     powered: true, draw: 60 },
        { type: T.HULKINGFUSIONREACTOR, count: n => Math.ceil(n / 4),     powered: true, draw: 90, ownFuel: true },
        { type: T.STEAMTURBINE2,        count: n => n, running: true },
      ], gross: 1200, bootstrapKw: 1200 },
  ];

  // What a package of size n is worth to the site, after its own plant
  // has taken its cut.
  function packageNet(pkg, n) {
    let w = pkg.gross * n;
    for (const part of pkg.parts) {
      if (part.draw) w -= part.draw * part.count(n);
    }
    return w;
  }

  // Other work a client will pay for while the crew is there. Nothing
  // here generates anything - it is the site getting lit, watched,
  // connected or landscaped, and it is what stops every contract reading
  // as the same job with different numbers.
  const EXTRA_WORK = [
    { type: T.LAMP,            min: 3, max: 8, powered: true  },
    { type: T.CAMERA,          min: 1, max: 3, powered: true  },
    { type: T.EVCHARGER,       min: 1, max: 2, powered: true  },
    { type: T.MONITOR,         min: 1, max: 1, powered: true  },
    { type: T.CELLTOWER,       min: 1, max: 1, powered: true  },
    { type: T.FIBERHUB,        min: 1, max: 1, powered: true  },
    { type: T.SURVEY,          min: 1, max: 1, powered: true  },
    { type: T.SMALLPARK,       min: 1, max: 2, powered: false },
    { type: T.COMMUNITYGARDEN, min: 1, max: 1, powered: false },
    { type: T.TREEDSTREET,     min: 1, max: 3, powered: false },
    { type: T.BASKETBALLCOURT, min: 1, max: 1, powered: false },
    { type: T.FARMERSMARKET,   min: 1, max: 1, powered: false },
  ];

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // What the site can host. Terrain a site does not carry is terrain the
  // crew cannot conjure, so a package that needs it never gets offered.
  function siteProvides(site, need) {
    if (need === 'geo')   return (site.prebuilt || []).some(p => p.type === T.GEODEPOSIT);
    if (need === 'coal')  return (site.prebuilt || []).some(p => p.type === T.COALDEPOSIT);
    if (need === 'oil')   return (site.prebuilt || []).some(p => p.type === T.OILDEPOSIT);
    if (need === 'uranium') return (site.prebuilt || []).some(p => p.type === T.URANIUMDEPOSIT);
    if (need === 'sulfur')  return (site.prebuilt || []).some(p => p.type === T.SULFURDEPOSIT);
    // A stocked fuel store the client has left for the crew: fuel rods for a
    // fission reactor, MOX for the advanced one.
    if (need === 'river') return (site.river || []).length > 0;
    if (need === 'helium') return (site.prebuilt || []).some(p => p.type === T.HELIUMDEPOSIT);
    if (need === 'lithium') return (site.prebuilt || []).some(p => p.type === T.LITHIUMDEPOSIT);
    // D-T pellets for a Fusion Reactor, D-He3 for an Advanced Fusion Reactor: two different bins.
    if (need === 'pellets' || need === 'he3pellets') return (site.prebuilt || []).some(p =>
      p.type === T.SOLIDSTORAGE && p.props && p.props._solidType === 'pellets' && (p.props._stored || 0) > 0
      && (p.props._pelletMode === 'dhe3') === (need === 'he3pellets'));
    if (need === 'rods' || need === 'mox') return (site.prebuilt || []).some(p =>
      p.type === T.SOLIDSTORAGE && p.props && p.props._solidType === need && (p.props._stored || 0) > 0);
    // A water extractor sits on a 4x4 patch of open lake, so a puddle is
    // not enough — the site has to declare water it can actually stand in.
    if (need === 'water') return (site.water || []).some(r =>
      (r.maxC - r.minC + 1) >= 4 && (r.maxR - r.minR + 1) >= 4);
    return false;
  }

  // The hard ceiling on a package's size at this site: how much of the
  // resource is under the ground, and how much room there is to build.

  // ── Packing a heavy plant onto a site ────────────────────────────
  //
  // First-fit packing of every part (biggest first, one spare tile round
  // each for pipes and belts) onto the work area, around whatever the site
  // already has standing there. Water extractors have to sit on the lake, so
  // they are counted against the lake's room instead. Cached per site and
  // package: the answer only changes if the site data does.
  const _fitCache = new Map();
  // Water extractors the site's lakes can seat: 4x4 patches of open lake, one apiece.
  function lakeSlots(site) {
    let n = 0;
    for (const w of site.water || []) n += Math.floor((w.maxC - w.minC + 1) / 4) * Math.floor((w.maxR - w.minR + 1) / 4);
    return n;
  }
  // How many extractors a package of size n puts on the lake.
  const extractorsIn = (pkg, n) => pkg.parts.reduce((s, p) => s + (p.type === T.WATEREXTRACTOR ? p.count(n) : 0), 0);
  // The largest size, up to `cap`, whose extractors fit in `slots` lake patches.
  function lakeCap(pkg, slots, cap) {
    let n = Math.min(cap, 60);
    while (n > 0 && extractorsIn(pkg, n) > slots) n--;
    return n;
  }
  function _prebuiltFootprint(p) {
    const sub = p.props && p.props.commercialSubtype;
    if (p.props && p.props.width) return { w: p.props.width, h: p.props.height };
    if (sub && SubtypeFootprints[sub]) return { w: SubtypeFootprints[sub].width, h: SubtypeFootprints[sub].height };
    const d = EntityDefs[p.type] || {};
    return { w: d.width || 1, h: d.height || 1 };
  }
  function _packs(site, pkg, n) {
    const m = site.markers[site.work];
    if (!m) return false;
    const W = m.maxC - m.minC + 1, H = (site._fitMaxR ?? m.maxR) - m.minR + 1;
    const blocked = new Uint8Array(W * H);
    const mark = (c0, r0, w, h) => {
      for (let r = Math.max(0, r0); r < Math.min(H, r0 + h); r++)
        for (let c = Math.max(0, c0); c < Math.min(W, c0 + w); c++) blocked[r * W + c] = 1;
    };
    for (const p of site.prebuilt) {
      if (p.type === T.TREE || p.type === T.BUSH) continue;
      const f = _prebuiltFootprint(p);
      mark(p.col - m.minC, p.row - m.minR, f.w, f.h);
    }
    // Lake tiles are not building ground (except for an extractor).
    const lake = (site.water || []).map(w => ({ c0: w.minC - m.minC, r0: w.minR - m.minR, w: w.maxC - w.minC + 1, h: w.maxR - w.minR + 1 }));
    for (const l of lake) mark(l.c0, l.r0, l.w, l.h);
    for (const rv of site.river || []) mark(rv.minC - m.minC, rv.minR - m.minR, rv.maxC - rv.minC + 1, rv.maxR - rv.minR + 1);
    const parts = [];
    let extractors = 0;
    for (const part of pkg.parts) {
      const d = EntityDefs[part.type] || {};
      const cnt = part.count(n);
      if (part.onWater || part.onDeposit) continue;   // dams and turbines stand in the water, wells on their deposit
      if (part.type === T.WATEREXTRACTOR) { extractors += cnt; continue; }
      for (let i = 0; i < cnt; i++) parts.push({ w: d.width || 1, h: d.height || 1 });
    }
    if (extractors > lakeSlots(site)) return false;
    parts.sort((a, b) => b.w * b.h - a.w * a.h);
    for (const part of parts) {
      const pw = part.w + 1, ph = part.h + 1;   // a lane for pipes and belts
      let placed = false;
      for (let r = 0; r + part.h <= H && !placed; r++) {
        for (let c = 0; c + part.w <= W; c++) {
          let ok = true;
          for (let rr = r; rr < Math.min(H, r + ph) && ok; rr++)
            for (let cc = c; cc < Math.min(W, c + pw); cc++) if (blocked[rr * W + cc]) { ok = false; break; }
          if (ok) { mark(c, r, pw, ph); placed = true; break; }
        }
      }
      if (!placed) return false;
    }
    return true;
  }
  function heavyFit(site, pkg) {
    const key = site.id + '|' + pkg.id;
    if (_fitCache.has(key)) return _fitCache.get(key);
    let fit = 0;
    // A river feeds two pairs of a hydro plant; everything else is limited by room.
    // Room only ever shrinks as n grows, so binary-search the largest that fits.
    const limit = pkg.hydro ? (site.river || []).length * 2 : 60;
    let lo = pkg.min || 1, hi = limit;
    if (lo <= hi && _packs(site, pkg, lo)) {
      fit = lo;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (_packs(site, pkg, mid)) { fit = mid; lo = mid; } else hi = mid - 1;
      }
    }
    _fitCache.set(key, fit);
    return fit;
  }

  function packageCap(site, pkg) {
    const deposits = t => (site.prebuilt || []).filter(p => p.type === t).length;
    let cap = Infinity;
    if (pkg.id === 'geo')  cap = deposits(T.GEODEPOSIT);
    // One mine per deposit, and one MK1 mine sustains ~2.9 generators.
    if (pkg.id === 'coal') cap = deposits(T.COALDEPOSIT) * 2;
    // One pump jack per deposit, each feeding its own line.
    if (pkg.id === 'oil')  cap = deposits(T.OILDEPOSIT);
    // One helium well per reactor (five MK2 turbines) and one reactor per gas field.
    if (pkg.id === 'fusion') cap = deposits(T.HELIUMDEPOSIT) * 5;
    // A part that stands on an ore body or gas field, one apiece: the biggest
    // size whose mines and wells the site's deposits can all seat.
    for (const part of pkg.parts) {
      if (!part.deposit) continue;
      const have = deposits(part.deposit);
      let n = Math.min(cap, 60);
      while (n > 0 && part.count(n) > have) n--;
      cap = n;
    }
    // Extractors stand on the lake, and a coal set's never used to ask it.
    if (extractorsIn(pkg, 1)) cap = lakeCap(pkg, lakeSlots(site), cap);
    // A heavy plant (a reactor and its towers and turbines) is sized by
    // actually packing it onto the work area: the deposits, stores and lake
    // the client already has there take up room, and a big rectangle that
    // merely "adds up" can still be impossible to lay out around them.
    if (pkg.heavy) return Math.max(0, Math.min(cap, heavyFit(site, pkg)));
    // Room to stand it all up, measured on the package's biggest part.
    for (const part of pkg.parts) {
      cap = Math.min(cap, unitCapacity(site, part.type) * (part.count(1) || 1));
    }
    return Math.max(0, Math.floor(cap));
  }

  // ── Established power (a client only asks for what you have proven) ──
  //
  // Unlocking a generator is not the same as running one. A client will only
  // put a form of power in a job once the player has built it AND got it
  // producing on their own grid, so nobody is handed a coal, oil or (later)
  // nuclear job before they have made that power themselves. Once seen it is
  // latched and saved, so demolishing the plant later does not take the jobs
  // away. Only ever read from the home world: on a job site the registry
  // holds the client's entities and the player's own kit, which would prove
  // nothing.
  const established = new Set();
  // Power past geothermal; until one of these is established, offers are
  // capped at EARLY_PAY_CAP (see generate).
  const LATER_POWER   = ['coal', 'oil', 'nuclear', 'adv', 'hydro', 'fusion', 'advfusion'];
  const EARLY_PAY_CAP = 30000;

  function _producing(e) {
    return !!(e && (e._generating || e._fuelled || (e._currentOutput || 0) > 0 || (e.type === T.HYDROGENERATOR && (e._shaftRate || 0) > 0)));
  }
  // What counts as having made this power. Wind and solar report their output
  // through the def, so simply owning one is enough; chained plant has to have
  // actually run.
  function _packageEstablished(pkg) {
    // A full-chain job: the stocked version of the same power first, then the
    // fuel-making plant itself standing on the player's own grid.
    if (pkg.after && !established.has(pkg.after)) return false;
    if (pkg.proof) return pkg.proof.every(t => { const l = EntityRegistry.getByType(t); return !!(l && l.size); });
    const rated = pkg.rated || (pkg.parts[0] && pkg.parts[0].type);
    if (!rated) return false;
    const list = EntityRegistry.getByType(rated);
    if (!list || !list.size) return false;
    if (!pkg.rated) return true;
    for (const e of list) if (_producing(e)) return true;
    return false;
  }
  function noteEstablished() {
    if (typeof EntityRegistry === 'undefined') return;
    if (typeof ContractSystem !== 'undefined' && ContractSystem.isAway && ContractSystem.isAway()) return;
    for (const pkg of GEN_PACKAGES) {
      if (established.has(pkg.id)) continue;
      try { if (_packageEstablished(pkg)) established.add(pkg.id); } catch (_e) { /* type absent in this build */ }
    }
  }

  function packagesFor(site) {
    noteEstablished();
    return GEN_PACKAGES.filter(pkg => {
      if (!isUnlocked(pkg.unlock)) return false;
      if (!established.has(pkg.id)) return false;
      if (pkg.late && !pkg.late()) return false;   // full-chain jobs wait for the late game
      // Every part has to be buildable, not just the headline machine: a
      // coal set is no use to a player who has not unlocked the extractor.
      if (!pkg.parts.every(part => isUnlocked(part.type))) return false;
      if (!(pkg.needs || []).every(need => siteProvides(site, need))) return false;
      if (packageCap(site, pkg) < (pkg.min || 1)) return false;
      // `menu` types are the open-ground plant a site advertises for
      // itself — that is where per-site flavour lives, and a dusk-and-
      // overcast ridge does not advertise solar.
      if (pkg.menu) return (site.generation || []).includes(pkg.menu);
      return true;
    });
  }

  // Smallest size of `pkg` worth at least `watts` to the site, capped.
  function sizeForWatts(pkg, watts, cap) {
    let n = pkg.min || 1;
    while (n < cap && packageNet(pkg, n) < watts) n++;
    return Math.max(pkg.min || 1, Math.min(n, cap));
  }

  const HEADROOM = 1.2;   // demand curves peak; wind sags; leave slack

  // ── Variety in what a job asks for ─────────────────────────────────
  //
  // An even shuffle of the pool gave wind three tickets (one per turbine
  // tier) to every other power's one, and almost every site advertises
  // wind, so a player running coal, oil and nuclear still got turbine job
  // after turbine job. Instead each kind of power (a `family`) is one
  // ticket, weighted:
  //   - wind and solar step back once the site offers anything with a
  //     supply chain: they are still dealt, just not most of the time;
  //   - a kind dealt in the last few jobs is less likely to come up again.
  // Within a family the newer tiers are favoured, so a late player is
  // asked for MK3 turbines more often than MK1s.
  const OPEN_WEIGHT   = 0.35;   // wind/solar beside chained power
  const RECENT_JOBS   = 6;      // how many jobs back "recently" reaches
  const RECENT_FACTOR = 0.45;   // per recent appearance
  const _dealt = [];            // families of recent jobs, newest last
  function _noteDealt(fams) {
    _dealt.push(...new Set(fams));
    while (_dealt.length > RECENT_JOBS * 2) _dealt.shift();
  }
  function _recentCount(f) {
    let n = 0;
    for (let i = Math.max(0, _dealt.length - RECENT_JOBS); i < _dealt.length; i++) if (_dealt[i] === f) n++;
    return n;
  }
  const _isOpen = pkg => !!pkg.menu;
  // Families of `pool` in a weighted-random order (weighted draw without
  // replacement).
  function _rankFamilies(pool, fam) {
    const anyChained = pool.some(p => !_isOpen(p));
    const left = [...new Set(pool.map(fam))].map(f => {
      const open = pool.filter(p => fam(p) === f).every(_isOpen);
      const w = (open && anyChained ? OPEN_WEIGHT : 1) * Math.pow(RECENT_FACTOR, _recentCount(f));
      return { f, w };
    });
    const out = [];
    while (left.length) {
      let r = Math.random() * left.reduce((s, x) => s + x.w, 0), i = 0;
      while (i < left.length - 1 && (r -= left[i].w) > 0) i++;
      out.push(left.splice(i, 1)[0].f);
    }
    return out;
  }
  // One package from a family. Turbine and panel tiers lean to the bigger
  // ones; a reactor family (stocked or full-chain fuel) stays an even pick.
  function _pickInFamily(list) {
    if (list.length === 1) return list[0];
    if (!list.every(_isOpen)) return pick(list);
    const byOut = list.slice().sort((a, b) => packageNet(a, 1) - packageNet(b, 1));
    let r = Math.random() * byOut.reduce((s, _p, i) => s + i + 1, 0);
    for (let i = 0; i < byOut.length; i++) if ((r -= i + 1) <= 0) return byOut[i];
    return byOut[byOut.length - 1];
  }

  // Compose the generation half of a job: which kinds of plant, how much
  // of each, as `place` clauses. Null when the site has nothing the
  // player can build yet.
  function composeGeneration(site, load) {
    const pool = packagesFor(site);
    if (!pool.length) return null;

    const target = load * HEADROOM;

    // Most jobs are one kind of plant; mixes are the exception that makes
    // eleven sites feel like more than eleven jobs. Three-way splits are
    // rare on purpose — past that it stops being a decision and starts
    // being a shopping list.
    const roll = Math.random();
    const want = roll < 0.55 ? 1 : roll < 0.88 ? 2 : 3;
    // One version of a reactor per job: the stocked and the full-chain package
    // of the same power are alternatives, never a mix. Likewise one tier of
    // turbine or panel.
    const fam = pkg => pkg.family || pkg.id;
    const chosen = [];
    for (const f of _rankFamilies(pool, fam)) {
      if (chosen.length >= want) break;
      chosen.push(_pickInFamily(pool.filter(p => fam(p) === f)));
    }
    _noteDealt(chosen.map(fam));

    // Split the load between them unevenly — an even split every time
    // reads as arithmetic rather than as a client's preference.
    let shares = chosen.map(() => 0.4 + Math.random());
    const sum  = shares.reduce((a, b) => a + b, 0);
    shares = shares.map(v => v / sum);

    // Every package's extractors share one lake. packageCap fits each alone;
    // `lakeLeft` is what the others in the job have left over, and each step
    // below that sizes a package caps it to that.
    const slots = lakeSlots(site);
    const lakeLeft = (list, skip) => slots - list.reduce((n, x) => n + (x === skip ? 0 : extractorsIn(x.pkg, x.count)), 0);
    const sized = [];
    chosen.forEach((pkg, i) => {
      const x = { pkg, cap: packageCap(site, pkg), count: 0 };
      x.cap = lakeCap(pkg, lakeLeft(sized, x), x.cap);
      if (x.cap < (pkg.min || 1)) return;   // no lake left for it: the others cover the load
      x.count = sizeForWatts(pkg, target * shares[i], x.cap);
      sized.push(x);
    });

    // How much kit this job actually puts on the ground, counting every
    // part — a coal set is a mine, an extractor and a generator, and it is
    // the total that decides whether the job is a decision or a chore.
    const unitsOf = list => list.reduce((n, x) =>
      n + x.pkg.parts.reduce((m, part) => m + part.count(x.count), 0), 0);
    const wattsOf = list => list.reduce((w, x) => w + packageNet(x.pkg, x.count), 0);

    // A heavy site on low-output plant turns into a placement chore, so
    // fall back to the densest package the site offers rather than asking
    // for a field of twenty.
    // Late sites are bigger on purpose (`comfort` on the site), so a heavy
    // job there can ask for a real field of plant.
    const COMFORTABLE_UNITS = site.comfort || 14;
    if (!sized.length || unitsOf(sized) > COMFORTABLE_UNITS) {
      const best = pool.reduce((a, b) =>
        packageNet(b, 1) > packageNet(a, 1) ? b : a);
      const cap = packageCap(site, best);
      sized.length = 0;
      sized.push({ pkg: best, cap, count: sizeForWatts(best, target, cap) });
    }

    // Rounding and the capacity caps can leave the site short of its own
    // load, which would make the 'service' clause (every building lit)
    // impossible. Grow the densest package until the sums work, or it runs
    // out of room.
    let total = wattsOf(sized);
    if (total < target) {
      const grow = sized.reduce((a, b) =>
        packageNet(b.pkg, 1) > packageNet(a.pkg, 1) ? b : a);
      const growCap = lakeCap(grow.pkg, lakeLeft(sized, grow), grow.cap);
      while (total < target && grow.count < growCap) {
        grow.count++;
        total = wattsOf(sized);
      }
    }

    // Still short means every chosen package hit its ceiling — six wells
    // on a six-deposit field cannot become seven. Bring in another kind of
    // plant to cover the gap rather than shipping a job whose 'service'
    // clause cannot be met. This is also why a heavy site tends to read as
    // a mix without being told to be one.
    // Tried in the same weighted order as the first pick (pool order put
    // wind first, so the top-up was nearly always turbines), plant with a
    // supply chain ahead of wind and solar.
    if (total < target) {
      const ranked = _rankFamilies(pool, fam);
      const order = [...ranked.filter(f => !pool.filter(p => fam(p) === f).every(_isOpen)),
                     ...ranked.filter(f =>  pool.filter(p => fam(p) === f).every(_isOpen))]
        .map(f => _pickInFamily(pool.filter(p => fam(p) === f)));
      for (const pkg of order) {
        if (total >= target) break;
        if (sized.some(x => fam(x.pkg) === fam(pkg))) continue;
        const cap = lakeCap(pkg, lakeLeft(sized, null), packageCap(site, pkg));
        if (cap < (pkg.min || 1)) continue;
        sized.push({ pkg, cap, count: sizeForWatts(pkg, target - total, cap) });
        total = wattsOf(sized);
      }
    }

    // A plant that has to be powered before it can make power (turbine
    // electronics, cooling pumps, magnets) needs something already running to
    // start from. If the job's own mix has too little, add a starter from the
    // densest ordinary plant, sized to that plant's need.
    const needBoot = sized.reduce((m, x) => Math.max(m, x.pkg.bootstrapKw || 0), 0);
    if (needBoot > 0) {
      const have = sized.filter(x => !x.pkg.heavy).reduce((w, x) => w + packageNet(x.pkg, x.count), 0);
      // Prefer a starter that is simple to build (wind, solar): a full oil or
      // coal chain just to get something turning would be a job in itself.
      const lightAll = pool.filter(p => !p.heavy);
      const simple = lightAll.filter(p => p.parts.length === 1);
      const light = simple.length ? simple : lightAll;
      if (have < needBoot && light.length) {
        // Whichever kind the variety weighting favours (the densest outright
        // was always the MK3 turbine), then that kind's densest tier.
        const kind = _rankFamilies(light, fam)[0];
        const best = light.filter(p => fam(p) === kind).reduce((a, b) => packageNet(b, 1) > packageNet(a, 1) ? b : a);
        const same = sized.find(x => x.pkg === best);
        const cap = lakeCap(best, lakeLeft(sized, same), packageCap(site, best));
        const add = sizeForWatts(best, needBoot - have, cap);
        if (same) same.count = Math.min(cap, same.count + add);
        else if (cap >= (best.min || 1)) sized.push({ pkg: best, cap, count: add });
      }
    }

    const clauses = [];
    for (const x of sized) {
      for (const part of x.pkg.parts) {
        const count = part.count(x.count);
        if (count < 1) continue;
        clauses.push({
          // Plant with a supply chain has to be proven burning, not just
          // wired — see the `running` kind. Everything else is a `place`.
          kind:  part.running ? 'running' : 'place',
          type:  part.type,
          count, zone: site.work,
          powered: part.powered !== false,
          // The reactor's fuel is the crew's own, not a client store: the
          // checklist line says which (contract_requirements.js `place`).
          ...(part.ownFuel ? { ownFuel: true } : {}),
          // A tank the client wants to see something in, not just standing.
          ...(part.holds ? { holds: part.holds, holdAmount: part.holdAmount } : {}),
        });
      }
    }
    // Two packages can want the same kind of building (a coal set and a
    // reactor both take water extractors; a full-chain Advanced Reactor job
    // has fission turbines as well as its own). Each clause counts every
    // building of its type in the zone, so two clauses for one type would
    // both be met by the same machines. Fold them into one that asks for the
    // sum, and keep the stricter test.
    const merged = [];
    for (const c of clauses) {
      const same = merged.find(m => m.type === c.type && m.zone === c.zone);
      if (!same) { merged.push(c); continue; }
      same.count += c.count;
      if (c.kind === 'running') same.kind = 'running';
      same.powered = same.powered || c.powered;
      // Stocked and home-made fuel for one reactor type cannot meet in a job
      // (`family`), so the flag only ever agrees with itself here.
      if (c.ownFuel) same.ownFuel = true;
    }
    return { clauses: merged, packages: sized.map(x => x.pkg), watts: Math.round(total) };
  }

  // 0-2 pieces of side work, drawn from whatever the player has unlocked.
  function composeExtras(site) {
    const pool = EXTRA_WORK.filter(x => EntityDefs[x.type] && isUnlocked(x.type));
    if (!pool.length) return [];
    const roll = Math.random();
    const want = roll < 0.5 ? 0 : roll < 0.85 ? 1 : 2;
    return shuffled(pool).slice(0, Math.min(want, pool.length)).map(x => ({
      kind: 'place', type: x.type, count: intBetween(x.min, x.max),
      zone: site.hub, powered: x.powered,
    }));
  }

  // ── Situations: what the crew finds when it gets there ───────────
  //
  // Most jobs are greenfield: build plant, feed the works, light the town.
  // A situation changes what is standing on the ground when the crew
  // arrives. Everything a situation needs is written into its requirement
  // spec (site-local tiles, amounts), because specs are what a save keeps;
  // ContractSystem.applySituation stamps it onto the site on arrival.

  // Free ground for `sizes` (each {w,h}), away from the client's works, the
  // build area, water and the site edge, with a lane round each for trucks.
  // Returns site-local {col,row} per size, or null if they do not all fit.
  function findSpots(site, sizes) {
    const W = site.bounds.cols, H = site.bounds.rows;
    const g = new Uint8Array(W * H);
    const mark = (c0, r0, w, h) => {
      for (let r = Math.max(0, r0); r < Math.min(H, r0 + h); r++)
        for (let c = Math.max(0, c0); c < Math.min(W, c0 + w); c++) g[r * W + c] = 1;
    };
    mark(0, 0, W, 2); mark(0, H - 2, W, 2); mark(0, 0, 2, H); mark(W - 2, 0, 2, H);
    for (const m of Object.values(site.markers)) mark(m.minC - 1, m.minR - 1, m.maxC - m.minC + 3, m.maxR - m.minR + 3);
    for (const p of site.prebuilt) {
      const f = _prebuiltFootprint(p);
      const pad = (p.type === T.TREE || p.type === T.BUSH) ? 0 : 1;
      mark(p.col - pad, p.row - pad, f.w + pad * 2, f.h + pad * 2);
    }
    for (const w of [...(site.water || []), ...(site.river || [])]) mark(w.minC - 1, w.minR - 1, w.maxC - w.minC + 3, w.maxR - w.minR + 3);
    const free = (c0, r0, w, h) => {
      if (c0 < 0 || r0 < 0 || c0 + w > W || r0 + h > H) return false;
      for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) if (g[r * W + c]) return false;
      return true;
    };
    // Scan from a random corner so the same site does not always put its
    // waste in the same place.
    const flipC = Math.random() < 0.5, flipR = Math.random() < 0.5;
    const out = [];
    for (const s of sizes) {
      let hit = null;
      for (let i = 0; i < H && !hit; i++) {
        const r = flipR ? H - s.h - i : i;
        for (let j = 0; j < W; j++) {
          const c = flipC ? W - s.w - j : j;
          if (free(c, r, s.w, s.h)) { hit = { col: c, row: r }; break; }
        }
      }
      if (!hit) return null;
      mark(hit.col - 2, hit.row - 2, s.w + 4, s.h + 4);   // the truck lane
      out.push(hit);
    }
    return out;
  }

  // The waste streams a cleanup can be about, and what each needs unlocked.
  const CLEANUP_STREAMS = [
    { waste: 'coal', unit: () => T.COALGENERATOR, facility: () => T.COALWASTE, field: '_ashWaste' },
    { waste: 'oil',  unit: () => T.REFINERY,      facility: () => T.OILWASTE,  field: '_sludgeWaste' },
  ];
  function cleanupStreams() {
    if (!isUnlocked(T.DRONEPORT) && !(isUnlocked(T.TRUCK) && isUnlocked(T.GASSTATION))) return [];
    return CLEANUP_STREAMS.filter(s => EntityDefs[s.unit()] && EntityDefs[s.facility()] && isUnlocked(s.facility()));
  }
  // A cleanup plan for this site: 3-5 units full of one waste stream, plus
  // proof there is still room for the facility the player has to build.
  function planCleanup(site) {
    const streams = cleanupStreams();
    if (!streams.length) return null;
    const s = pick(streams);
    const ud = EntityDefs[s.unit()], fd = EntityDefs[s.facility()];
    for (let n = intBetween(3, 5); n >= 3; n--) {
      const sizes = Array.from({ length: n }, () => ({ w: ud.width || 3, h: ud.height || 3 }));
      const gd = EntityDefs[T.GASSTATION] || {};
      const spots = findSpots(site, [...sizes, { w: fd.width || 8, h: fd.height || 7 }, { w: gd.width || 6, h: gd.height || 5 }]);
      if (!spots) continue;
      spots.length = n;   // the facility's and Gas Station's room: proven, left for the player to use
      return {
        stream: s,
        req: { kind: 'clear', waste: s.waste,
               piles: spots.map(p => ({ col: p.col, row: p.row, type: s.unit(), amount: intBetween(80, 100) })) },
      };
    }
    return null;
  }

  // What a storm can knock out: the client's own buildings, never their
  // deposits, fuel stores or water plant (that would brick a fuel chain).
  function stormTargets(site) {
    const kinds = new Set([T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL, T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.LAMP, T.CAMERA].filter(Boolean));
    const cands = site.prebuilt.filter(p => kinds.has(p.type));
    if (cands.length < 3) return null;
    const n = Math.max(3, Math.min(12, Math.round(cands.length * between(0.35, 0.6))));
    return shuffled(cands).slice(0, n).map(p => ({ col: p.col, row: p.row, type: p.type }));
  }
  function repairBill(targets) {
    let sum = 0;
    for (const t of targets || []) {
      const fake = { def: EntityDefs[t.type] || {}, type: t.type };
      sum += (typeof LightningDamageSystem !== 'undefined' && LightningDamageSystem.repairCost)
        ? LightningDamageSystem.repairCost(fake) : Math.round(((fake.def.cost || 2000) * 0.25));
    }
    return sum;
  }

  // A package whose plant has a supply chain behind it, which is what a
  // conveyor-and-pipe cap bites on. Geothermal is a well under a turbine
  // and hydro a dam, so neither moves material anywhere.
  const _chainy = pkg => pkg.id !== 'geo' && !pkg.hydro && pkg.parts.length >= 2 && pkg.parts.some(p => p.running);
  function logisticsUnlocked() { return isUnlocked(T.DRONEPORT) || (isUnlocked(T.HAULER) && isUnlocked(T.GASSTATION)); }

  // The conveyor-and-pipe cap on a low-footprint job: six tiles for every
  // machine in it that has a pipe or belt port (anything from a package with
  // a supply chain; wind and solar have none). A machine has two to six
  // ports, each needs a tile of its own on its stub however the plant is
  // laid out, and a storage vessel a Hauler serves adds two more, so six a
  // machine is short stubs and nothing spare.
  // (It was six per RUNNING unit, which is the turbines alone: a full-chain
  // fusion job, twenty machines behind four turbines, was capped at 24 tiles
  // and was over it with the deuterium line not yet finished.)
  let _chainTypes = null;
  function footprintCap(requirements) {
    if (!_chainTypes) _chainTypes = new Set(GEN_PACKAGES.filter(_chainy).flatMap(p => p.parts.map(x => x.type)));
    let n = 0;
    for (const r of requirements) if ((r.kind === 'place' || r.kind === 'running') && _chainTypes.has(r.type)) n += r.count || 1;
    return Math.max(12, 6 * n);
  }

  // Recently offered kinds of job, so the board does not keep dealing the
  // same one. Each repeat in the window cuts that kind's odds sharply.
  const RECENT_MAX = 5;
  let recentArche = [];
  function noteArche(a) {
    recentArche.push(a);
    if (recentArche.length > RECENT_MAX) recentArche.shift();
  }

  let genSeq = 0;
  const GENERATED = new Map();
  const SUBSTATION_CHANCE = 0.6;   // share of jobs that ask for a new substation (see the storage clause)

  // ── Kinds of job ─────────────────────────────────────────────────
  //
  // Not every contract should be "build the array, wire it, hold it":
  //   standard  the usual job
  //   rush      a small job on half the deadline, paid a premium
  //   retainer  a long supply guarantee (2 to 4 days) with little new kit
  //   peak      storage-led: batteries and a hold through the client's peak
  //   showcase  a client showing off: extra work and a proof, better pay,
  //             only offered once the player has a name (contractor rank)
  //   storm     the crew arrives after a storm: client buildings to repair
  //   cleanup   decommissioned units full of waste to haul off site
  //   disaster  both at once, late game only
  //   logistics a cap on conveyor and pipe: stock moves by Hauler or drone
  //
  // `can` says which of the situational kinds this site and job allow.
  function pickArchetype(siteId, load, can = {}) {
    const showcaseOk = contractorRank().index >= 1 && siteTier(siteId) >= playerTier() - 1;
    const w = load <= 0
      ? { standard: 10, cleanup: can.cleanup ? 6 : 0 }
      : {
          standard:  28,
          rush:      10,
          retainer:  7,
          peak:      isUnlocked(T.BATTERY) ? 9 : 0,
          showcase:  showcaseOk ? 7 : 0,
          storm:     can.storm ? 11 : 0,
          cleanup:   can.cleanup ? 10 : 0,
          disaster:  can.storm && can.cleanup && playerTier() >= 2 ? 5 : 0,
          logistics: can.logistics ? 9 : 0,
        };
    // A kind dealt recently is much less likely to come up again.
    for (const k of Object.keys(w)) {
      const seen = recentArche.filter(a => a === k).length;
      w[k] *= Math.pow(k === 'standard' ? 0.6 : 0.3, seen);
    }
    let total = 0;
    for (const v of Object.values(w)) total += v;
    let r = Math.random() * total;
    for (const [k, v] of Object.entries(w)) { r -= v; if (r <= 0 && v > 0) return k; }
    return 'standard';
  }

  // When and in what weather the crew arrives. A site keeps the part of the
  // day it was authored for (the light is half its identity), but the
  // weather and the exact hour vary from offer to offer — so a repeat client
  // is not the same afternoon twice. Sites that build with solar are left
  // exactly as authored: rain would make a solar job unwinnable.
  //
  // The season varies too, and with it the light, the cold, the trees and
  // whether there is snow on the ground (Seasons reads it through
  // ContractSystem.siteSeason). A site can fix its own (`season`, as the
  // polar station does); otherwise it is drawn from what its country gets.
  // Solar sites only ever get the bright half of the year, for the same
  // reason they never get rain: a winter day is two hours shorter.
  // In winter, rain falls as snow, and now and then as a blizzard.
  const BIOME_SEASONS = {
    arid:       ['summer', 'summer', 'spring', 'autumn'],
    coastal:    ['spring', 'summer', 'autumn', 'winter'],
    industrial: ['spring', 'summer', 'autumn', 'winter', 'winter'],
    market:     ['spring', 'summer', 'autumn', 'autumn'],
    nocturne:   ['autumn', 'autumn', 'winter', 'winter', 'spring'],
  };
  function arrivalFor(site) {
    const a = site.arrival, gen = site.generation || [];
    const solar = gen.includes(T.SOLAR) || gen.includes(T.SOLAR2);
    const season = site.season || pick(solar ? ['spring', 'summer', 'summer'] : (BIOME_SEASONS[site.biome] || ['spring', 'summer', 'autumn', 'winter']));
    if (solar) return { hour: a.hour, weather: a.weather, season };
    let weather = Math.random() < 0.5 ? a.weather : pick(['clear', 'overcast', 'rain']);
    if (season === 'winter') {
      if (weather === 'rain') weather = Math.random() < 0.25 ? 'blizzard' : 'snow';
      else if (weather === 'overcast' && Math.random() < 0.4) weather = 'snow';
    }
    const hour = ((a.hour + between(-1, 1)) + 24) % 24;
    return { hour: Math.round(hour * 10) / 10, weather, season };
  }

  // A storm job arrives in the tail of the storm. Solar sites keep the sky
  // they were authored for (rain would make the array unwinnable).
  function stormArrival(site, a, storm) {
    if (!storm) return a;
    const gen = site.generation || [];
    if (gen.includes(T.SOLAR) || gen.includes(T.SOLAR2)) return a;
    return { ...a, weather: a.season === 'winter' ? 'snow' : 'rain' };
  }

  function generate(siteId) {
    const site = SITES[siteId];
    if (!site) return null;

    // Size the generation against what the site actually draws, rather than
    // picking a count at random. A client asking for two turbines to carry
    // six buildings is asking for a job that cannot be finished — the
    // service requirement demands every one of those buildings end up lit.
    const load = siteLoad(site);

    // Nothing the player has unlocked works at this site, so it has
    // nothing to offer right now — another site may still.
    let gen = composeGeneration(site, load);
    if (!gen) return null;

    // What this site could be dealt beyond a greenfield job.
    const storm   = stormTargets(site);
    const cleanup = planCleanup(site);
    const can = {
      storm:     !!storm,
      cleanup:   !!cleanup,
      logistics: logisticsUnlocked() && gen.packages.some(_chainy),
    };
    let arche = pickArchetype(siteId, load, can);
    // A reactor is never a rush job: the chain behind it (fuel, water, steam)
    // is the whole point, and it cannot be built on half a deadline.
    const heavyJob = gen.packages.some(p => p.heavy);
    if (heavyJob && arche === 'rush') arche = 'standard';
    const hasStorm   = arche === 'storm'   || arche === 'disaster';
    const hasCleanup = arche === 'cleanup' || arche === 'disaster';
    // The waste facility is load the client never had: size the plant for it.
    if (hasCleanup) {
      const fd = EntityDefs[cleanup.stream.facility()] || {};
      gen = composeGeneration(site, load + (fd.powerInput || 0)) || gen;
    }

    const reqs = [
      ...gen.clauses,
      { kind: 'connect', from: site.work, to: site.hub, powered: true },
    ];
    // The situation's own work comes straight after the plant, since it is
    // the reason this job is not like the last one.
    if (hasStorm) {
      reqs.push({ kind: 'repair', targets: storm });
      // Late on, a storm-hit client wants to look after itself next time.
      if (isUnlocked(T.DRONEPORT) && Math.random() < 0.5) {
        reqs.push({ kind: 'place', type: T.DRONEPORT, count: 1, powered: true });
      }
    }
    if (hasCleanup) {
      reqs.push(cleanup.req);
      reqs.push({ kind: 'place', type: cleanup.stream.facility(), count: 1, powered: true });
    }
    if (arche === 'logistics') {
      // Enough for short stubs into and out of the storage vessels the
      // Haulers serve, nowhere near enough to belt the whole chain.
      reqs.push({ kind: 'limit', max: footprintCap(gen.clauses) });
    }
    // Trucks on the job need somewhere to fill up, and the client no longer
    // has one waiting. A player with only drones has no trucks to fuel.
    if ((hasCleanup || arche === 'logistics') && isUnlocked(T.GASSTATION) && (isUnlocked(T.TRUCK) || isUnlocked(T.HAULER))) {
      reqs.push({ kind: 'place', type: T.GASSTATION, count: 1 });
    }
    if (isUnlocked(T.PROTECTOR)) {
      reqs.push({ kind: 'protect', scope: 'allLines' });
    }
    // ── Endurance clause ───────────────────────────────────────────
    //
    // Some clients do not want plant delivered, they want it PROVEN: keep
    // the town supplied for a stretch measured in hours or days, without a
    // single break. That is a materially harder job than installing the
    // same equipment — the player has to stay on site and ride out calm
    // wind and darkness — so it demands real storage and pays at the top
    // of the margin band.
    const ENDURANCE_HOURS = [6, 12, 24, 48];
    // A retainer is all endurance: the kit is the smaller part of it and the
    // long hold is the job. A showcase always includes a proof of a day or
    // half of one. Rush and peak jobs are about something else.
    const endurance = arche === 'retainer' ? pick([48, 72, 96])
                    : arche === 'showcase' ? pick([12, 24])
                    : (arche === 'standard' && load > 0 && Math.random() < 0.30) ? pick(ENDURANCE_HOURS) : 0;

    // Storage: always useful, but an endurance job genuinely needs enough
    // to carry the load through the quiet hours, so it scales with the
    // length of the hold rather than being a random 1-3.
    if (isUnlocked(T.BATTERY)) {
      const enduranceCells = endurance
        ? Math.max(2, Math.ceil((load * (endurance / 12)) / 40))
        : 0;
      // A peak-support job is mostly about storage: the client's evening
      // peak is what they cannot cover, so the batteries are the point.
      const cells = arche === 'peak' ? intBetween(4, 10)
                  : endurance ? Math.min(enduranceCells, 8) : intBetween(1, 3);
      if (endurance || arche === 'peak' || Math.random() < 0.75) {
        reqs.push({ kind: 'store', type: T.BATTERY, count: cells, zone: site.hub, powered: true, minCharge: 0.5 });
      }
    }
    // A new substation at the client's works, sized to the site: the newest
    // mark the site's tier calls for that the player has unlocked. Theirs, if
    // they have one, doesn't count (newOnly). Left off a rush or a retainer,
    // which are short on time and on new kit respectively.
    if (arche !== 'rush' && arche !== 'retainer' && Math.random() < SUBSTATION_CHANCE) {
      const marks = [T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3].slice(0, Math.max(1, Math.min(3, siteTier(siteId))));
      const mark = marks.filter(t => EntityDefs[t] && isUnlocked(t)).pop();
      if (mark) reqs.push({ kind: 'place', type: mark, count: arche === 'showcase' ? 2 : 1, zone: site.hub, powered: true, newOnly: true });
    }
    // The hold itself. Target is a share of the same load the generation
    // was sized against, so it is always achievable with what the contract
    // asks you to install. An endurance job runs for days; otherwise it is
    // a brief proof that the thing switches on and stays on.
    //
    // Both are authored in IN-GAME hours. The short proof used to be 45-90
    // raw seconds, which showed up on the checklist as "keep the site
    // powered for 76 seconds" — a real-world stopwatch reading in a game
    // where every other duration is a clock hour, and one that silently
    // meant a different amount of work at a different game speed.
    const PROOF_HOURS = [1, 2, 3];
    if (endurance) {
      reqs.push({ kind: 'sustain', watts: Math.max(5, Math.round(load * between(0.6, 0.85))),
                  hours: endurance });
    } else if (arche === 'peak' && load > 0) {
      reqs.push({ kind: 'sustain', watts: Math.max(5, Math.round(load * between(0.7, 0.85))),
                  hours: pick([4, 5, 6]) });
    } else if (load > 0 && Math.random() < 0.35) {
      reqs.push({ kind: 'sustain', watts: Math.max(5, Math.round(load * between(0.55, 0.85))),
                  hours: pick(PROOF_HOURS) });
    }
    // Side work, if the client wants any. Appended last so the checklist
    // reads in the order the job is actually done: plant, feed,
    // protection, storage, the hold, then everything else they asked for.
    const extra = composeExtras(site);
    if (arche === 'showcase') {
      for (const x of composeExtras(site)) if (!extra.some(y => y.type === x.type)) extra.push(x);
    }
    reqs.push(...extra);

    // `service` is appended by requirementsFor() from the site's own
    // prebuilt list — never authored here, so it can't be forgotten.

    const full = requirementsFor({ siteId, requirements: reqs });
    const mats = estimateMaterials(full, siteId);

    // Margin is always 5-25% of the equipment bill (before CONTRACT_PAY).
    // Client standing shifts where in that band an offer lands, but never
    // outside it: a long good record should make the work worth more, not
    // open-ended.
    const MARGIN_MIN = 0.05, MARGIN_MAX = 0.25;
    const CONTRACT_PAY = 0.75;   // share of the margin above actually paid (see below)
    // Size, complexity and pay have to rise together: a bigger, harder job
    // must never pay less than a small easy one. So the percentage comes from
    // how complex the job is (kit, chain depth, storage, hold, side work), on
    // top of a materials bill that already grows with size. An endurance job
    // still pays from the top of the band — the same equipment plus days of
    // babysitting.
    const C    = complexityOf({ siteId, requirements: reqs });
    // A rush job is only a rush if there is little enough to do in the time:
    // a flagship in a day is unwinnable, so a big one is just an ordinary job.
    if (arche === 'rush' && C >= 0.7) arche = 'standard';
    const base = MARGIN_MIN + (MARGIN_MAX - MARGIN_MIN) * Math.min(1, C);
    const jitter = 0.92 + Math.random() * 0.16;          // clients differ a little; size still decides
    const rate = Math.max(endurance ? 0.18 : 0, base * jitter) * standingMultiplier(site.client);
    const band = profitBand();
    const cap  = band.cap;
    // Each kind of job pays a premium for what makes it different: speed,
    // patience, storage, or a client showing off. It sits on top of the
    // size-driven rate, so a bigger job of the same kind still pays more.
    const archMult = { standard: 1, rush: 1.3, retainer: 1.15, peak: 1.15, showcase: 1.2,
                       storm: 1.25, cleanup: 1.2, disaster: 1.35, logistics: 1.3 }[arche] || 1;
    const raw  = Math.round(mats * Math.max(MARGIN_MIN, Math.min(MARGIN_MAX, rate)) * archMult);

    // The tier's ceiling used to be enforced by clamping and then by a random
    // draw skewed to the floor, which let a much bigger job pay the same as a
    // small one. Keep the ceiling but bend toward it smoothly instead: the
    // curve is strictly increasing, so more work always pays more, and it
    // never quite reaches the cap. Below 60% of the cap it is a straight line.
    let margin = raw;
    if (Number.isFinite(cap) && raw > cap * 0.6) {
      const knee = cap * 0.6, room = cap - knee;
      margin = Math.round(knee + room * (1 - Math.exp(-(raw - knee) / room)));
    }
    // A tier's floor is what a job is worth turning up for, but a tiny job
    // must not be paid like a big one just because it sits in the same tier:
    // the floor only lifts a job to a small multiple of what it earned.
    margin = Math.max(margin, Math.min(band.min, Math.round(raw * 2.5)));
    // Contract pay trimmed by a quarter across the board: a dozen jobs were
    // bringing in a few hundred thousand by the oil tier, on top of a home
    // grid that already paid its way, and left little to struggle for. Taken
    // here, before the perk, fixed-bid and rival-bonus terms below, so all of
    // those scale with it. The equipment advance is untouched.
    margin = Math.round(margin * CONTRACT_PAY);

    // The deadline has to contain the hold with room to build first —
    // a 2-day hold inside a 2-day deadline is unwinnable by construction.
    // Bigger jobs get longer: there is simply more to put on the ground.
    const holdDays = endurance / 24;
    const sizeDays = { Small: 2, Medium: 3, Large: 4, Flagship: 6 }[sizeName(C)];
    let days = endurance
      ? Math.max(sizeDays, Math.ceil(holdDays + 1.5))
      : sizeDays;
    if (arche === 'rush')     days = Math.max(1, sizeDays / 2);
    if (arche === 'showcase') days += 1;
    // A storm-hit client wants the town back quickly; hauling waste is a
    // lot of round trips, and both at once is a lot of both.
    if (arche === 'storm')    days = Math.max(2, sizeDays - 1);
    if (hasCleanup)           days += 1;
    if (heavyJob) days = Math.max(days, 4);   // fuel, cooling and steam lines all have to be run
    // A whole fuel chain has to be mined, processed and running before the
    // reactor it feeds can even start, so those jobs get the time to do it.
    if (gen.packages.some(p => p.chain)) days = Math.max(days, 6) + 2;

    // Some jobs pay part of the price in kind (see contract_perks.js): a favour
    // on the player's own grid, for a while. A showcase always does. The cash
    // is a little lower to make room for it, and the perk offered is one the
    // player could use — nothing for reactors until they have run one.
    let perk = null;
    const perkChance = arche === 'showcase' ? 1 : arche === 'retainer' ? 0.6 : 0.35;
    if (typeof ContractPerks !== 'undefined' && Math.random() < perkChance) {
      const usable = t => isUnlocked(t)
        && (t !== T.NUCLEARREACTOR || established.has('nuclear'))
        && (t !== T.ADVREACTOR || established.has('adv'))
        && (t !== T.HULKINGFUSIONREACTOR || EntityRegistry.getByType(T.HULKINGFUSIONREACTOR).size > 0);
      perk = ContractPerks.roll(sizeName(C), usable);
      if (Math.random() < 0.4) {
        // Paid mostly in kind: little cash, but the perk lasts twice as long.
        perk.mode = 'inkind';
        perk.days = Math.min(perk.days * 2, ContractPerks.maxDays(perk));
        perk.label = ContractPerks.describe(perk);
        margin = Math.round(margin * 0.4);
      } else {
        // Cash and a perk: the usual pay, trimmed a little to make room.
        perk.mode = 'bonus';
        margin = Math.round(margin * 0.9);
      }
    }

    // ── Terms ──────────────────────────────────────────────────────
    // Twists on how the job is paid, independent of what it is.
    //   fixedBid  no advance: the player funds the kit, and is paid the lot
    //             (kit and a much fatter margin) on completion
    //   rival     another crew is bidding: finish inside the window for a
    //             bonus, or still get the ordinary pay
    const terms = {};
    if (arche !== 'rush' && Math.random() < 0.12) {
      terms.fixedBid = true;
      margin = Math.round(margin * 1.6);
    }
    // Until coal (or anything past it) is running on the player's own grid,
    // no offer pays more than EARLY_PAY_CAP, rival bonus included: from
    // geothermal on, the MK2 band and the big geothermal kit bills could put
    // a single job well past what the home grid earns at that stage.
    const early = !LATER_POWER.some(id => established.has(id));
    if (early) margin = Math.min(margin, EARLY_PAY_CAP);
    if (Math.random() < 0.15) {
      if (early) margin = Math.min(margin, Math.floor(EARLY_PAY_CAP / 1.4));
      terms.rival = { days: Math.max(1, Math.ceil(days * 0.5)), bonus: Math.round(margin * 0.4) };
    }

    const ARCHE_PREFIX = { rush: 'Rush: ', retainer: 'Retainer: ', peak: 'Peak Support: ', showcase: 'Showcase: ',
                           storm: 'Storm Recovery: ', cleanup: 'Cleanup: ', disaster: 'Disaster Response: ', logistics: 'Low-Footprint: ' };
    const contract = {
      id:     `gen_${siteId}_${++genSeq}`,
      siteId,
      title:  (ARCHE_PREFIX[arche] || '') + titleFor(reqs, gen.packages, endurance, arche),
      margin,
      days,
      requirements: reqs,
      archetype: arche,
      perk,
      terms,
      arrival: stormArrival(site, arrivalFor(site), hasStorm),
      generated: true,
    };
    noteArche(arche);
    GENERATED.set(contract.id, contract);
    // Keep the registry from growing without bound over a long session.
    // Only contracts nobody holds are fair game: pruning one still posted on
    // the board (or in hand) would make it vanish the same way a reload did.
    if (GENERATED.size > 40) {
      const held = typeof ContractSystem !== 'undefined' && ContractSystem.heldContractIds
        ? ContractSystem.heldContractIds() : new Set();
      for (const k of GENERATED.keys()) {
        if (held.has(k)) continue;
        GENERATED.delete(k);
        if (GENERATED.size <= 30) break;
      }
    }
    return contract;
  }

  // Name the job after everything it actually asks for. A mixed contract
  // called "Wind Turbine Array" reads as a mislabelled one, and the title
  // is all the player sees of a job on the board before they open it.
  function titleFor(reqs, packages, enduranceHours, arche) {
    const kinds = [];
    for (const pkg of packages || []) {
      const l = ((EntityDefs[pkg.rated || pkg.parts[0].type] || {}).label || '')
        .replace(/ MK\d$/, '').replace(/( Power)? (Turbine|Panel|Generator|Reactor)$/, '');
      if (l && pkg.chain) { kinds.push(`Full-Chain ${l}`); continue; }
      if (l && !kinds.includes(l)) kinds.push(l);
    }
    // Slashed, not '&': the suffixes below already use '&', and
    // 'Wind & Solar Array & Storage' reads like a list that lost count.
    const label   = kinds.length ? kinds.join('/') : 'Generation';
    const storage = reqs.some(r => r.kind === 'store');
    const hold    = reqs.some(r => r.kind === 'sustain');
    // Side work is worth naming too — it is the difference between "the
    // ridge job" and "the ridge job where they also want the yard lit".
    const extras  = reqs.some(r => r.kind === 'place' && r.zone && r.zone !== undefined
                                && EXTRA_WORK.some(x => x.type === r.type));
    // A situational job is named for the situation: that is what makes it
    // a different job from the last one at this site.
    const clear = reqs.find(r => r.kind === 'clear');
    const waste = clear ? (clear.waste === 'oil' ? 'Sludge' : 'Ash') : '';
    if (arche === 'storm')     return `${label} Array & Storm Repairs`;
    if (arche === 'cleanup')   return `${waste} Haul-Out & ${label} Array`;
    if (arche === 'disaster')  return `Storm Repairs, ${waste} Haul-Out & ${label} Array`;
    if (arche === 'logistics') return `${label} Plant, Supplied by Truck & Drone`;
    // An endurance job is named for the commitment, not the kit — that is
    // the part the player is actually being asked to take on.
    if (enduranceHours) {
      const span = enduranceHours >= 24
        ? `${enduranceHours / 24}-Day` : `${enduranceHours}-Hour`;
      return `${label} Array & ${span} Supply Guarantee`;
    }
    if (storage && hold) return `${label} Array, Storage & Load Test`;
    if (storage)         return `${label} Array & Storage`;
    if (hold)            return `${label} Array & Load Test`;
    if (extras)          return `${label} Array & Site Works`;
    return `${label} Array & Feed`;
  }

  // ── Requirements, pricing ────────────────────────────────────────

  // ── Routing costs ────────────────────────────────────────────────
  //
  // Wire and poles are a real part of the bill and a long run costs
  // materially more than a short one, so the estimate is measured from the
  // site's own geometry rather than a flat allowance. A client quoting the
  // same figure for a 6-tile spur and a 40-tile ridge feed would be
  // quoting for a job they had not looked at.
  //
  // The player still routes it themselves, so this is an estimate with
  // slack in it — beating it is the efficiency reward in §8.
  const ROUTE_SLACK   = 1.3;   // real routes bend around terrain and buildings
  const WIRES_PER_POLE = 3;    // only 3 wires may span between anchors

  function wireRunCost(tiles) {
    const t = Math.max(1, Math.round(tiles * ROUTE_SLACK));
    const wire = (EntityDefs[T.WIRE] || {}).cost || 0;
    const pole = (EntityDefs[T.POLE] || {}).cost || 0;
    return t * wire + Math.floor(t / WIRES_PER_POLE) * pole;
  }

  // Shortest edge-to-edge tile gap between two site-local rects.
  function rectGap(a, b) {
    const dc = Math.max(0, a.minC - b.maxC, b.minC - a.maxC);
    const dr = Math.max(0, a.minR - b.maxR, b.minR - a.maxR);
    return dc + dr;
  }

  function rectCentre(r) {
    return { col: (r.minC + r.maxC) / 2, row: (r.minR + r.maxR) / 2 };
  }

  // What it costs to reach every consumer the client left dark. Measured
  // from their existing supply point (their substation if they have one,
  // otherwise the middle of their works) out to each building.
  function serviceRunCost(site) {
    const hub = site.markers[site.hub];
    const sub = site.prebuilt.find(p => p.type === T.SUBSTATION || p.type === T.SUBSTATION2 || p.type === T.SUBSTATION3);
    const from = sub ? { col: sub.col, row: sub.row } : (hub ? rectCentre(hub) : { col: 0, row: 0 });
    let tiles = 0;
    for (const p of site.prebuilt) {
      if (((EntityDefs[p.type] || {}).powerInput || 0) <= 0) continue;
      tiles += Math.abs(p.col - from.col) + Math.abs(p.row - from.row);
    }
    return wireRunCost(tiles);
  }

  // A site that ships with power consumers on it implies servicing work,
  // whether or not the contract author remembered to ask for it: handing a
  // site back with the client's houses still dark is not a finished job.
  // Derived rather than hand-written per contract so it can never be
  // forgotten, and so adding a prebuilt house to a site automatically
  // extends the scope of work.
  function requirementsFor(contract) {
    const site = SITES[contract.siteId];
    // A cap written under the old rule (see footprintCap) is raised to the
    // new one, so a job already on the board or under way can be finished.
    const reqs = contract.requirements.map(r => r.kind === 'limit'
      ? { ...r, max: Math.max(r.max || 0, footprintCap(contract.requirements)) } : r);
    // No job site has a Gas Station of the client's, so a job that runs on
    // trucks (a cleanup's haul-out, a Hauler-supplied plant) has one on its
    // checklist, as generate() writes it. One written before that (an old
    // job, or a repeat of one) gets it here. Appended last, so the saved
    // state of the rows before it still lines up.
    if (reqs.some(r => r.kind === 'clear' || r.kind === 'limit') && !reqs.some(r => r.kind === 'place' && r.type === T.GASSTATION)
        && isUnlocked(T.GASSTATION) && (isUnlocked(T.TRUCK) || isUnlocked(T.HAULER))) {
      reqs.push({ kind: 'place', type: T.GASSTATION, count: 1 });
    }
    // A Reprocessing Plant only takes spent fuel that has cooled in a Spent
    // Fuel Pool. A full-chain job written before the pool was on its list
    // gets one per Reprocessing Plant, appended for the same reason.
    const repro = reqs.find(r => r.type === T.REPROCESSOR && (r.kind === 'place' || r.kind === 'running'));
    if (repro && !reqs.some(r => r.type === T.SPENTFUELPOOL)) {
      reqs.push({ kind: 'place', type: T.SPENTFUELPOOL, count: repro.count, zone: repro.zone, powered: true });
    }
    if (!site) return reqs;
    // Likewise a job that asked for more extractors than its lake can seat
    // (composeGeneration used to add each package's up with no shared limit)
    // asks for as many as fit.
    const slots = lakeSlots(site);
    for (let i = 0; i < reqs.length; i++) {
      const r = reqs[i];
      if (r.type === T.WATEREXTRACTOR && (r.kind === 'place' || r.kind === 'running') && slots > 0 && r.count > slots) reqs[i] = { ...r, count: slots };
    }
    const hasConsumers = site.prebuilt.some(p => ((EntityDefs[p.type] || {}).powerInput || 0) > 0);
    if (hasConsumers && !reqs.some(r => r.kind === 'service')) reqs.push({ kind: 'service' });
    return reqs;
  }

  // Bill of materials for a contract's scope of work — equipment at list
  // price, plus the wire, poles and surge protectors the job actually needs
  // for this particular site's distances.
  function estimateMaterials(requirements, siteId) {
    const site = SITES[siteId] || null;
    let total = 0;

    for (const spec of requirements) {
      // 'running' puts the same plant on the ground as 'place' does —
      // it just also demands the thing be burning — so it is billed the
      // same way. Missing it here would quote a coal job without the
      // generator in it.
      if (spec.kind === 'place' || spec.kind === 'store' || spec.kind === 'running') {
        const def = EntityDefs[spec.type];
        if (def) total += (def.cost || 0) * (spec.count || 1);

      } else if (spec.kind === 'connect') {
        // The feed from the build area to the client's works.
        if (site) {
          const a = site.markers[spec.from], b = site.markers[spec.to];
          total += wireRunCost(a && b ? rectGap(a, b) : 20);
        } else {
          total += wireRunCost(20);
        }

      } else if (spec.kind === 'protect') {
        // Every line needs cover; one protector per feed is the realistic
        // minimum and what the requirement actually checks for.
        total += (EntityDefs[T.PROTECTOR] || {}).cost || 0;

      } else if (spec.kind === 'service') {
        total += site ? serviceRunCost(site) : wireRunCost(20);

      } else if (spec.kind === 'repair') {
        // The crews' bill for every damaged building, at today's rates.
        total += repairBill(spec.targets);

      } else if (spec.kind === 'clear') {
        // A truck to do the hauling and a feed out to the facility. The
        // facility itself is its own 'place' clause.
        total += ((EntityDefs[T.TRUCK] || {}).cost || 0) + wireRunCost(25);

      } else if (spec.kind === 'limit') {
        // Haulers to carry what the belts would have: one for every five
        // machines in the chain, and never fewer than two. (It was a flat
        // two, which a twenty-machine fusion chain, a dozen runs between
        // flagged vessels, cannot be worked with.)
        const machines = footprintCap(requirements) / 6;
        total += Math.max(2, Math.ceil(machines / 5)) * (((EntityDefs[T.HAULER] || EntityDefs[T.TRUCK]) || {}).cost || 0);
      }
    }
    return total;
  }

  // ── Liability ────────────────────────────────────────────────────
  //
  // A reactor on a client's site is a risk to the client's property, and the
  // client will hold the contractor to it: a meltdown makes the player liable
  // for what stood on the site plus half the equipment budget. That is a lot
  // of money on purpose — enough to put a small grid in debt (which the game
  // survives, at a cost) but never the end of the run. Jobs with no reactor
  // in them carry none, unless `force` says the player built one anyway.
  const REACTOR_TYPES_L = () => [T.NUCLEARREACTOR, T.ADVREACTOR];   // fusion quenches; it cannot melt down
  function liabilityFor(contract, force = false) {
    const reqs = (contract && contract.requirements) || [];
    if (!force && !reqs.some(r => REACTOR_TYPES_L().includes(r.type))) return 0;
    const site = SITES[contract.siteId];
    if (!site) return 0;
    const skip = new Set([T.TREE, T.BUSH, T.COALDEPOSIT, T.OILDEPOSIT, T.GEODEPOSIT, T.LAMP, T.CAMERA]);
    let assets = 0;
    for (const p of site.prebuilt) { if (!skip.has(p.type)) assets += (EntityDefs[p.type] || {}).cost || 0; }
    const budget = estimateMaterials(requirementsFor(contract), contract.siteId);
    return Math.round((assets + budget * 0.5) / 1000) * 1000;
  }

  function payoutFor(contract) {
    return estimateMaterials(requirementsFor(contract), contract.siteId) + (contract.margin || 0);
  }

  // ── Advance split (§8) ───────────────────────────────────────────
  //
  // The client funds the equipment in full up front, and pays the margin
  // — the player's entire profit — only on completion. Equipment still
  // comes out of the player's own balance as they place it, exactly as at
  // home; the advance is what they spend it from.
  //
  // Two things fall out of this that are worth keeping:
  //   • Contracts do not gate on capital. A player who is broke can still
  //     take work, which matters because the beacon is expensive and the
  //     risk budget is already spent on home-grid exposure (§7).
  //   • Nothing is earned until the job is signed off. Walking away pays
  //     exactly nothing, so the profit is entirely contingent on finishing.
  //
  // Coming in under the materials estimate still leaves the difference in
  // the player's pocket — the efficiency reward survives unchanged, since
  // the advance is fixed and their actual spend is not.
  // Must pass the site: the advance IS the materials estimate, so dropping
  // it here would pay out a different figure from the one quoted.
  // A fixed-bid job has no advance: the player funds the kit and is paid
  // for it, with the margin, on completion.
  function advanceFor(contract) {
    if (contract.terms && contract.terms.fixedBid) return 0;
    return estimateMaterials(requirementsFor(contract), contract.siteId);
  }
  function balanceFor(contract) { return payoutFor(contract) - advanceFor(contract); }

  // ── Geometry ─────────────────────────────────────────────────────

  function absoluteMarkers(site) {
    const out = {};
    for (const [name, m] of Object.entries(site.markers)) {
      out[name] = {
        minC:  m.minC + SITE_ORIGIN.col,
        minR:  m.minR + SITE_ORIGIN.row,
        maxC:  m.maxC + SITE_ORIGIN.col,
        maxR:  m.maxR + SITE_ORIGIN.row,
        label: m.label,
      };
    }
    return out;
  }

  function absoluteBounds(site) {
    return {
      minC: SITE_ORIGIN.col,
      minR: SITE_ORIGIN.row,
      maxC: SITE_ORIGIN.col + site.bounds.cols - 1,
      maxR: SITE_ORIGIN.row + site.bounds.rows - 1,
    };
  }

  // Re-register a contract restored from a save. Generated contracts live
  // only in memory, so without this a reloaded contract's id would resolve
  // to nothing and the board/checklist could not look it up.
  function adopt(contract) {
    GENERATED.set(contract.id, contract);
    // genSeq restarts at 0 on a fresh page, so without this the next
    // generated contract could reuse a restored id and silently replace it.
    const m = /_(\d+)$/.exec(contract.id || '');
    if (m) genSeq = Math.max(genSeq, +m[1]);
    return contract;
  }

  // Standing and the established-power latch travel together through the
  // contract save block. Older saves stored a bare array of standing rows.
  function serialiseStanding() { return { rows: [...standing.entries()], established: [...established] }; }
  function loadStanding(d) {
    standing.clear(); established.clear();
    const rows = Array.isArray(d) ? d : (d && d.rows) || [];
    for (const [k, v] of rows) standing.set(k, v);
    for (const id of (d && !Array.isArray(d) && d.established) || []) established.add(id);
  }
  function resetEstablished() { established.clear(); }

  return {
    get origin() { return SITE_ORIGIN; },
    adopt, serialiseStanding, loadStanding, noteEstablished, resetEstablished,
    isEstablished: id => established.has(id),
    getSite(id)     { return SITES[id] || null; },
    getContract(id) { return GENERATED.get(id) || null; },
    siteIds()       { return Object.keys(SITES); },
    // Sites the player's progression actually opens up. A hospital that
    // must not go dark is not a job to hand someone on five-watt turbines,
    // so heavy sites declare what they need before they start advertising.
    availableSiteIds() {
      return Object.keys(SITES).filter(id => {
        const r = SITES[id].requires;
        if (!r) return true;
        try { return !!r(); } catch (_e) { return false; }
      });
    },

    generate, requirementsFor, estimateMaterials, payoutFor, profitCap, complexityOf, sizeOf, siteLoad, liabilityFor,
    pickSite, playerTier, siteTier, clientRank, contractorRank,
    advanceFor, balanceFor,
    standingFor, recordOutcome, standingMultiplier,
    absoluteMarkers, absoluteBounds,
  };
})();
