/* ═══════════════════════════════════════════════════════════════════
   NEIGHBOURHOOD PLAN
   How a residential, commercial or industrial zone grows into streets and
   blocks rather than a scatter of buildings on open ground.

   Every zone has a street lattice:
     - street rows every P rows (every building faces south onto the row
       below its footprint, so a street row is where a row of fronts sits);
     - cross streets down the blocks between two street rows, at a period
       and phase of their own for each band of blocks, so the cross streets
       stagger into T-junctions the way a real town's do instead of making
       one rigid grid.
   The lattice is FITTED to the buildings the zone already has: the row
   offset is the one most of them already front onto, and each band's
   cross-street phase is the one that runs through the fewest of them. A
   zone from an old save therefore keeps the streets it has, and every
   building placed to the lattice makes the same fit win again, so it
   holds steady as the zone grows. Nothing here is saved.

   The request system still decides which sites are allowed (merge
   distance, gaps between zones, clearance from City Hall, every rule in
   _anchorOptionsToZones); pick() only chooses among them. It scores each
   site on:
     - frontage: its front row on a street row, and not cutting through a
       street or a cross street;
     - the neighbour beside it on the same frontage, at the gap that type
       likes (a house's driveway, shops shoulder to shoulder, a yard
       between factories), and joining a street that's already started;
     - what's around it: house wealth tiers keep together, flats and towers
       gather, estates keep apart from the dense end; shops with shops,
       offices with offices, nightlife together; heavy industry apart from
       the clean tech plants;
     - what's beyond the zone: dense housing and corner shops toward the
       commercial streets, homes away from industry, heavy plants on the
       far side, light industry as the buffer;
     - growing out from the zone's middle rather than the far rim;
   plus a random draw, so no two towns come out the same.
   render_core.js (_zoneGroundPlan) paves the lattice's cross streets
   between two paved streets, closing the blocks.
   ═══════════════════════════════════════════════════════════════════ */

const NeighbourhoodPlan = (() => {
  // P: street row period. Q: cross-street period range per band.
  // gap: preference for the free tiles between this building and the one
  // beside it on the same frontage, for gaps 0..3.
  // join / joinMax: per building already fronting the same street nearby,
  // and the most that can add up to. lone: cost of opening a street that
  // has nothing on it near this plot yet.
  // Commercial leans on these hardest. Houses are small enough to fill a
  // street almost by default, but shops come in every size, and with only
  // the mild pulls the random draw and the zone-middle term spread them one
  // to a street across the whole zone (about half joined a neighbour,
  // twelve shops over six or seven streets). A high street is shopfronts
  // shoulder to shoulder, one street filled before the next is begun.
  // The lattice has to fit what is built on it. Commercial buildings run
  // 8×7 at the median (12×10 at the 75th percentile), where the old 6-row
  // streets and 7–10 wide blocks were sized like the houses': nearly every
  // shop cut a street row or a cross street, so the best-scoring plot was
  // whatever odd gap dodged the lattice rather than the one beside a
  // neighbour. 9-row streets clear the median height, and 16–24 wide
  // blocks take two or three shops a side.
  const STYLE = {
    residential: { P: 5, Qmin: 6,  Qmax: 10, gap: [1.2, 3.2, 2.2, 0.6] },
    commercial:  { P: 9, Qmin: 16, Qmax: 24, gap: [5.5, 4.0, 1.0, -0.5], join: 1.4, joinMax: 6, lone: 4 },
    industrial:  { P: 8, Qmin: 11, Qmax: 16, gap: [0.8, 3.0, 3.0, 1.2] },
  };

  function _h(a, b, c = 0) {
    let h = (a * 374761393 + b * 668265263 + c * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const _mod = (a, m) => ((a % m) + m) % m;

  // ── Building classes ──────────────────────────────────────────────
  const RES_CLASS = {
    duplex: 'terrace', townhouse: 'terrace', retirement: 'terrace',
    apartment: 'flats', birchwood: 'flats', foundry: 'flats', willowbank: 'flats', condo: 'flats',
    lumiere: 'flats', ashford: 'flats', cedarpoint: 'flats', coop: 'flats',
    pemberton: 'flats', linden: 'flats', rialto: 'flats',
    skyscraper: 'tower', arcology: 'tower', evergreen: 'tower', prism: 'tower', tidecrest: 'tower',
    helix: 'tower', verdance: 'tower', celestine: 'tower', companytown: 'tower',
    mansion: 'estate', victorian: 'estate', pavilion: 'estate', glasshouse: 'estate', vineyard: 'estate', suburb: 'estate',
    school: 'civic', sheriff: 'civic', cornerstore: 'corner',
  };
  const COM_CLASS = {
    cafe: 'shop', bakery: 'shop', kakery: 'shop', pharmacy: 'shop', fastfood: 'shop', donutshop: 'shop', hotdog: 'shop', pizzeria: 'shop', restaurant: 'shop',
    grocery: 'shop', clothing: 'shop', gym: 'shop', autorepair: 'shop', truckstop: 'shop',
    office: 'office', bank: 'office', savingsloan: 'office', lawoffice: 'office', coworking: 'office',
    callcentre: 'office', reservebank: 'office', summit: 'office', newspaper: 'office', radio: 'office',
    quantumx: 'office', megatower: 'office', pharmalab: 'office', radiology: 'office', clinic: 'office',
    nightclub: 'leisure', jazzbar: 'leisure', disco: 'leisure', superclub: 'leisure', venue: 'leisure',
    finedining: 'leisure', supperclub: 'leisure', skycasino: 'leisure', holoarena: 'leisure',
    worldexpo: 'leisure', planetarium: 'leisure',
    bowling: 'leisure', icerink: 'leisure', hotsprings: 'leisure',
    motel: 'hotel', boutiquehotel: 'hotel', hotel: 'hotel', resorthotel: 'hotel',
  };
  const IND_CLASS = {
    steelfoundry: 'heavy', chemical: 'heavy', aluminumsmelter: 'heavy', fertilizer: 'heavy',
    recyclingplant: 'heavy', wastefacility: 'heavy', brickworks: 'heavy', plastics: 'heavy',
    papermill: 'heavy', desal: 'heavy', carbonrefinery: 'heavy',
    datacenter: 'tech', serverfarm: 'tech', evfactory: 'tech', cryptomine: 'tech', semifab: 'tech',
    isotopelab: 'tech', aicompute: 'tech', supercon: 'tech', geneworks: 'tech', collider: 'tech', watertreat: 'tech',
    massdriver: 'tech', antimatter: 'tech',
  };
  // info: { subtype, tier } for a request; an entity for a placed building.
  function classOf(zoneKey, info) {
    const sub = info && (info.subtype !== undefined ? info.subtype : info.commercialSubtype);
    if (zoneKey === 'residential') {
      if (sub && RES_CLASS[sub]) return RES_CLASS[sub];
      if (sub) return 'misc';
      const tier = info && (info.tier || info.houseWealthTier);
      return 'house:' + (tier || 'mid');
    }
    if (zoneKey === 'commercial') return (sub && COM_CLASS[sub]) || 'big';
    if (zoneKey === 'industrial') return (sub && IND_CLASS[sub]) || 'light';
    return 'misc';
  }
  const TIER_N = { 'house:budget': 0, 'house:mid': 1, 'house:premium': 2, 'house:luxury': 3 };
  function affinity(a, b) {
    if (a in TIER_N && b in TIER_N) return [1, 0.45, -0.4, -1][Math.abs(TIER_N[a] - TIER_N[b])];
    const pair = (x, y) => (a === x && b === y) || (a === y && b === x);
    const isH = (x) => x in TIER_N;
    const rich = (x) => x === 'house:premium' || x === 'house:luxury';
    // Like with like — except the one-per-neighbourhood kinds, which spread out.
    if (a === b) return a === 'big' ? 0.3 : a === 'civic' ? -0.6 : a === 'corner' ? -1.2 : 1;
    // residential
    if ((a === 'flats' || a === 'tower') && (b === 'flats' || b === 'tower')) return 0.7;
    if ((a === 'flats' || a === 'terrace') && (b === 'flats' || b === 'terrace')) return 0.6;
    if ((a === 'tower' && isH(b)) || (b === 'tower' && isH(a))) return rich(isH(a) ? a : b) ? -1 : -0.4;
    if ((a === 'flats' && isH(b)) || (b === 'flats' && isH(a))) return rich(isH(a) ? a : b) ? -0.5 : 0.15;
    if ((a === 'terrace' && isH(b)) || (b === 'terrace' && isH(a))) return rich(isH(a) ? a : b) ? -0.2 : 0.4;
    if ((a === 'estate' && isH(b)) || (b === 'estate' && isH(a))) return rich(isH(a) ? a : b) ? 0.7 : -0.8;
    if (pair('estate', 'flats') || pair('estate', 'tower') || pair('estate', 'terrace')) return -0.9;
    if ((a === 'civic' && isH(b)) || (b === 'civic' && isH(a))) return 0.35;
    if ((a === 'corner' && isH(b)) || (b === 'corner' && isH(a))) return 0.3;
    if (pair('corner', 'flats') || pair('corner', 'terrace')) return 0.5;
    // commercial
    if (pair('shop', 'leisure')) return 0.5;
    if (pair('office', 'hotel')) return 0.4;
    if (pair('leisure', 'hotel')) return 0.6;
    if (pair('shop', 'office')) return 0.2;
    if (pair('office', 'leisure')) return -0.2;
    if (b === 'big' || a === 'big') return -0.3;
    // industrial
    if (pair('heavy', 'tech')) return -0.8;
    if (pair('light', 'tech')) return 0.4;
    if (pair('heavy', 'light')) return 0.2;
    return 0;
  }
  // Preference for being near another zone type (d = distance to its nearest
  // zone; closeness = 1 at the edge, 0 at 40 tiles and beyond).
  const NEAR_PREF = {
    'house:budget':  { industrial: -0.8, commercial: 0.4 },
    'house:mid':     { industrial: -1.6, commercial: 0.2 },
    'house:premium': { industrial: -2.4, commercial: -0.3 },
    'house:luxury':  { industrial: -3.0, commercial: -1.0 },
    terrace:         { industrial: -1.0, commercial: 1.4 },
    flats:           { industrial: -1.0, commercial: 2.4 },
    tower:           { industrial: -1.0, commercial: 3.0, government: 1.0 },
    estate:          { industrial: -3.0, commercial: -2.0 },
    civic:           { industrial: -1.5 },
    corner:          { industrial: -1.0 },
    shop:            { residential: 1.6, industrial: -0.5 },
    office:          { government: 2.0, residential: 0.3 },
    leisure:         { residential: -0.6 },
    hotel:           { government: 1.0 },
    big:             { residential: -1.4 },
    heavy:           { residential: -3.5, commercial: -1.5 },
    light:           { residential: 1.0, commercial: 1.2 },
    tech:            { commercial: 1.2, residential: -0.4 },
  };
  // How strongly a class keeps to the middle of its zone (+) or the rim (-).
  const CORE_PULL = { tower: 1.6, flats: 1.0, office: 1.4, shop: 0.8, civic: 0.9, corner: 0.2, leisure: 0.6, hotel: 0.6,
                      'house:budget': 1.0, 'house:mid': 1.0, 'house:premium': 0.8, 'house:luxury': 0.5, terrace: 0.9,
                      estate: -0.9, big: -0.8, heavy: -0.6, light: 0.5, tech: 0.4, misc: 0.4 };
  // Detached houses: a driveway's gap between neighbours, never a terrace.
  const HOUSE_GAP = [-3, 3.2, 1.8, 0.4];
  const HOUSE_GAP_CLASSES = { 'house:budget': 1, 'house:mid': 1, 'house:premium': 1, 'house:luxury': 1, estate: 1, corner: 1 };
  // Classes that like a corner plot (beside a cross street).
  const CORNER = { corner: 2.6, shop: 2.2, civic: 1.0, office: 0.8, leisure: 0.8, hotel: 1.0 };

  // ── Zone members ──────────────────────────────────────────────────
  // Same set ZoneSystem clusters (and _zoneMemberBuildings measures):
  // placed customer buildings of the zone's type whose anchor is in rect.
  function members(zoneKey, rect) {
    const out = [];
    const add = (e) => {
      if (!e.fromRequest) return;
      if (e.col < rect.minC || e.col > rect.maxC || e.row < rect.minR || e.row > rect.maxR) return;
      out.push(e);
    };
    if (zoneKey === 'industrial') {
      for (const e of EntityRegistry.getByType(T.INDUSTRIAL)) add(e);
      for (const e of EntityRegistry.getByType(T.COMMERCIAL)) if (e.isIndustrial) add(e);
    } else if (zoneKey === 'commercial') {
      for (const e of EntityRegistry.getByType(T.COMMERCIAL)) if (!e.isIndustrial) add(e);
    } else if (zoneKey === 'residential') {
      for (const t of [T.HOUSE, T.CABIN]) for (const e of EntityRegistry.getByType(t)) add(e);
    }
    return out;
  }

  // ── The lattice ───────────────────────────────────────────────────
  // mem: [{ col, row, width, height, _placedAt? }]
  function lattice(zoneKey, mem) {
    const S = STYLE[zoneKey];
    if (!S) return null;
    const P = S.P;
    // The zone's own salt, from its first building, so two zones of a type
    // don't share their cross-street pattern.
    let first = null;
    for (const m of mem) if (!first || (m._placedAt || 0) < (first._placedAt || 0)) first = m;
    const salt = first ? (first.col * 31 + first.row * 17) : 0;

    // Row offset: the one most fronts already sit on (wider buildings count
    // for more). Ties go to a hashed order, so an empty zone still differs.
    const votes = new Float64Array(P);
    for (const m of mem) votes[_mod(m.row + (m.height || 1), P)] += Math.min(6, m.width || 1);
    let rowOff = 0, best = -1;
    for (let k = 0; k < P; k++) {
      const o = _mod(k + Math.floor(_h(salt, 7) * P), P);
      if (votes[o] > best) { best = votes[o]; rowOff = o; }
    }
    const isStreetRow = (r) => _mod(r - rowOff, P) === 0;
    const bandOf = (r) => Math.floor((r - rowOff) / P);

    // Per band: period and the phase that runs through fewest buildings.
    const bandTiles = new Map();   // band -> [[c0, c1, weight]]
    for (const m of mem) {
      const w = m.width || 1, h = m.height || 1;
      for (let r = m.row; r < m.row + h; r++) {
        if (isStreetRow(r)) continue;
        const b = bandOf(r);
        let list = bandTiles.get(b);
        if (!list) bandTiles.set(b, list = []);
        list.push([m.col, m.col + w - 1]);
      }
    }
    const bands = new Map();
    const band = (b) => {
      let B = bands.get(b);
      if (B) return B;
      const Q = S.Qmin + Math.floor(_h(salt, b, 11) * (S.Qmax - S.Qmin + 1));
      const def = Math.floor(_h(salt, b, 12) * Q);
      const cnt = new Float64Array(Q);
      for (const [c0, c1] of bandTiles.get(b) || []) {
        if (c1 - c0 + 1 >= Q) { for (let k = 0; k < Q; k++) cnt[k]++; continue; }
        for (let c = c0; c <= c1; c++) cnt[_mod(c, Q)]++;
      }
      let phase = def, low = Infinity;
      for (let d = 0; d < Q; d++) {
        const k = _mod(def + (d & 1 ? (d + 1) >> 1 : -(d >> 1)), Q);   // def, def+1, def-1, ...
        if (cnt[k] < low) { low = cnt[k]; phase = k; }
      }
      bands.set(b, B = { Q, phase });
      return B;
    };
    const isCross = (c, r) => {
      if (isStreetRow(r)) return false;
      const B = band(bandOf(r));
      return _mod(c - B.phase, B.Q) === 0;
    };
    return { P, rowOff, salt, isStreetRow, bandOf, band, isCross };
  }

  const _latCache = new Map();
  function latticeForZone(zoneKey, rect) {
    if (!STYLE[zoneKey] || !_on) return null;
    const key = zoneKey + ':' + ZoneSystem.getVersion() + ':' + rect.minC + ',' + rect.minR + ',' + rect.maxC + ',' + rect.maxR;
    let L = _latCache.get(key);
    if (L) return L;
    if (_latCache.size > 64) _latCache.clear();
    L = lattice(zoneKey, members(zoneKey, rect));
    _latCache.set(key, L);
    return L;
  }

  // ── Scoring context for one request slot ──────────────────────────
  // mem: the zone's members as entities (or { col,row,width,height,e }).
  function context(zoneKey, rect, mem, fw, fh, info) {
    const S = STYLE[zoneKey];
    if (!S) return null;
    const ent = mem.map(m => m.e || m);
    const L = lattice(zoneKey, ent);
    const my = classOf(zoneKey, info);
    const R = 7;
    const pad = 16 + Math.max(fw, fh);
    const c0 = rect.minC - pad, r0 = rect.minR - pad;
    const W = rect.maxC - rect.minC + 1 + pad * 2, H = rect.maxR - rect.minR + 1 + pad * 2;
    const inBox = (c, r) => c >= c0 && c < c0 + W && r >= r0 && r < r0 + H;
    const I = (c, r) => (r - r0) * W + (c - c0);
    const occ = new Int32Array(W * H);         // member index + 1
    const frontOf = new Uint8Array(W * H);     // a member's front tile
    const garden = new Uint8Array(W * H);      // a house's back garden (render_core's lot)
    const aff = new Float32Array(W * H);
    let sc = 0, sr = 0, sw = 0;
    ent.forEach((e, i) => {
      const w = e.width || 1, h = e.height || 1;
      for (let r = e.row; r < e.row + h; r++) for (let c = e.col; c < e.col + w; c++) if (inBox(c, r)) occ[I(c, r)] = i + 1;
      for (let c = e.col; c < e.col + w; c++) if (inBox(c, e.row + h)) frontOf[I(c, e.row + h)] = 1;
      if (e.type === T.HOUSE && !e.commercialSubtype) {
        for (let r = e.row - 3; r < e.row; r++) for (let c = e.col - 1; c <= e.col + w; c++) if (inBox(c, r)) garden[I(c, r)] = 1;
      }
      const a = affinity(my, classOf(zoneKey, e));
      if (a) {
        for (let r = e.row - R; r < e.row + h + R; r++) for (let c = e.col - R; c < e.col + w + R; c++) {
          if (!inBox(c, r)) continue;
          const d = Math.max(0, e.col - c, c - (e.col + w - 1)) + Math.max(0, e.row - r, r - (e.row + h - 1));
          if (d > R) continue;
          aff[I(c, r)] += a * (1 - d / (R + 1));
        }
      }
      const wt = w * h;
      sc += (e.col + w / 2) * wt; sr += (e.row + h / 2) * wt; sw += wt;
    });
    const cen = sw ? { c: sc / sw, r: sr / sw } : { c: (rect.minC + rect.maxC) / 2, r: (rect.minR + rect.maxR) / 2 };
    const size = Math.max(10, Math.sqrt((rect.maxC - rect.minC + 1) * (rect.maxR - rect.minR + 1)));
    // Other zone types, for the transition preferences.
    const near = NEAR_PREF[my] || {};
    const others = [];
    for (const k of Object.keys(near)) for (const z of ZoneSystem.getZoneRects?.(k) || []) others.push([k, z]);
    return { zoneKey, rect, S, L, my, fw, fh, ent, occ, frontOf, garden, aff, inBox, I, cen, size, near, others };
  }

  function _rectDist(c, r, z) {
    return Math.max(0, z.minC - c, c - z.maxC) + Math.max(0, z.minR - r, r - z.maxR);
  }

  function score(X, c, r) {
    const { S, L, fw, fh, occ, frontOf, garden, aff, inBox, I, ent } = X;
    let s = 0;
    const front = r + fh, bottom = r + fh - 1;
    // Frontage
    const aligned = L.isStreetRow(front);
    s += aligned ? 6 : -3;
    // Cutting streets: each street row the footprint covers, each cross
    // street it sits on, and any building's front it would block.
    let cut = 0, cross = 0, blocks = 0;
    for (let rr = r; rr < r + fh; rr++) {
      if (L.isStreetRow(rr)) { cut++; continue; }
      for (let cc = c; cc < c + fw; cc++) if (L.isCross(cc, rr)) { cross++; break; }
    }
    let yard = 0;
    for (let rr = r; rr < r + fh; rr++) for (let cc = c; cc < c + fw; cc++) {
      if (!inBox(cc, rr)) continue;
      if (frontOf[I(cc, rr)]) blocks++;
      if (garden[I(cc, rr)]) yard++;
    }
    // A cross street is kept clear by everything that fits inside a block;
    // only a building wider than the block may sit across one.
    const crossCost = fw < L.band(L.bandOf(bottom)).Q - 1 ? 6 : 1.6;
    s -= cut * 4 + Math.min(4, cross) * crossCost + Math.min(3, blocks) * 2 + Math.min(4, yard * 1.2);
    // The neighbour on either side along the same frontage. Detached houses
    // keep a driveway's gap; the rest take the zone's own preference.
    const gapPref = X.my in HOUSE_GAP_CLASSES ? HOUSE_GAP : S.gap;
    let flush = 0;
    for (const dir of [-1, 1]) {
      for (let g = 0; g <= 3; g++) {
        const cc = dir < 0 ? c - 1 - g : c + fw + g;
        if (!inBox(cc, bottom)) break;
        let hit = 0;
        for (let rr = r; rr <= bottom && !hit; rr++) hit = occ[I(cc, rr)];
        if (!hit) continue;
        const e = ent[hit - 1];
        if (e.row + (e.height || 1) - 1 === bottom) s += gapPref[g];
        else if (g === 0) s -= 0.6;   // wedged against something set back
        if (g === 0) flush++;
        break;
      }
    }
    if (flush === 2) s -= 2;          // squeezed into a slot between two
    // Joining a street that's already started (fronts on the same row nearby).
    if (aligned) {
      let n = 0;
      const span = 18 + fw;
      for (const e of ent) {
        if (e.row + (e.height || 1) !== front) continue;
        if (e.col + (e.width || 1) < c - span || e.col > c + fw + span) continue;
        n++;
      }
      s += Math.min(S.joinMax ?? 3, n * (S.join ?? 0.6));
      if (!n && S.lone) s -= S.lone;
      // A corner plot beside a cross street
      const wantCorner = CORNER[X.my];
      if (wantCorner && (L.isCross(c - 1, bottom) || L.isCross(c + fw, bottom))) s += wantCorner;
    }
    // Neighbours' kinds
    const mc = Math.floor(c + fw / 2), mr = Math.floor(r + fh / 2);
    if (inBox(mc, mr)) s += Math.max(-4, Math.min(4, aff[I(mc, mr)]));
    // Other zone types
    for (const [k, z] of X.others) {
      const d = _rectDist(mc, mr, z);
      if (d < 40) s += X.near[k] * (1 - d / 40);
    }
    // Grow out from the middle
    const dc = (c + fw / 2) - X.cen.c, dr = (r + fh / 2) - X.cen.r;
    s -= (CORE_PULL[X.my] ?? 0.4) * 3 * Math.sqrt(dc * dc + dr * dr) / X.size;
    // Neighbourhoods grow round, not out along one street: a plot that
    // pushes the zone's longer side further out costs more the more drawn
    // out the zone already is, and one that fills out the short side is
    // favoured — so a long row turns into a second and third street.
    const Z = X.rect, zw = Z.maxC - Z.minC + 1, zh = Z.maxR - Z.minR + 1;
    const growW = Math.max(0, Z.minC - c, c + fw - 1 - Z.maxC), growH = Math.max(0, Z.minR - r, r + fh - 1 - Z.maxR);
    // Each zone has a shape of its own to grow toward, from squat to tall.
    const target = 0.7 + 1.0 * _h(L.salt, 3, 5);
    const ratio = (zw / Math.max(1, zh)) / target;
    if (zw + zh > 14) {
      if (ratio > 1.25) s += (growH ? 2.5 + Math.min(3, growH * 0.4) : 0) - (growW ? 3 + growW * 0.5 * ratio : 0);
      else if (ratio < 0.8) s += (growW ? 2.5 + Math.min(3, growW * 0.4) : 0) - (growH ? 3 + growH * 0.5 / ratio : 0);
    }
    return s;
  }

  // Gumbel noise: argmax(score + noise) is a softmax draw over the scores.
  const _gumbel = () => -Math.log(-Math.log(Math.random() * 0.999998 + 0.000001));
  const SAMPLE = 2500, NOISE = 1.1;

  // Best of `pool` ({col,row}) for this context, with a random draw so two
  // equally good plots come up turn about. Returns null on an empty pool.
  function pick(X, pool) {
    if (!pool || !pool.length) return null;
    if (!X) return pool[Math.floor(Math.random() * pool.length)];
    let src = pool;
    if (src.length > SAMPLE) {
      src = pool.slice();
      for (let i = 0; i < SAMPLE; i++) { const j = i + Math.floor(Math.random() * (src.length - i)); const t = src[i]; src[i] = src[j]; src[j] = t; }
      src.length = SAMPLE;
    }
    let best = null, bestS = -Infinity;
    for (const p of src) {
      const v = score(X, p.col, p.row) + NOISE * _gumbel();
      if (v > bestS) { bestS = v; best = p; }
    }
    return best;
  }

  // Dev A/B switch: off, request picks fall back to the old open-ground
  // pick and the ground plan stops closing blocks.
  let _on = true;
  return { enabled: () => _on, setEnabled: (v) => { _on = !!v; _latCache.clear(); },
    STYLE, classOf, affinity, members, lattice, latticeForZone, context, score, pick };
})();
