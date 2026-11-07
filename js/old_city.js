/* ═══════════════════════════════════════════════════════════════════
   OLD CITY
   The city as it was twenty years ago, for the intro's archive footage
   (intro_cinematic.js). Built around the real City Hall from the game's
   own building sprites — a downtown of shops and towers, a residential
   west side with schools and parks, an industrial east side, Halcyon
   Atomic's power station and the international airport — and brought to
   life with people on the sidewalks, traffic and planes taking off.

   The buildings are expensive to draw, so the whole city is baked once,
   a few sprites per frame while the screen is still black, into one
   bitmap (tinted like old footage). Each frame then blits that bitmap and
   draws only what moves on top. When the shockwaves arrive, each building
   they reach is burned into the bitmap as a ruin, and whoever is standing
   there is gone.

   Coordinates are world tiles relative to City Hall's centre unless noted.
   City Hall's own footprint is left unpainted: it is the one building that
   survives, and the real one shows through.
   ═══════════════════════════════════════════════════════════════════ */

const OldCity = (() => {
  const BS   = 0.7;     // bitmap pixels per world pixel
  const ROAD = 2;       // road width, tiles
  // City extent, tiles relative to City Hall's centre.
  const X0 = -78, X1 = 112, Y0 = -48, Y1 = 44;
  // The baked bitmap's extent: the city plus a margin for the tunnel
  // mounds at the ends of roads leaving town.
  const MX0 = X0 - 3, MX1 = X1 + 3, MY0 = Y0 - 3, MY1 = Y1 + 3;

  let hc = 0, hr = 0;             // City Hall centre, world tiles
  let hall = null;                // City Hall footprint in relative tiles
  let buildings = [];             // { e, x, y, w, h, district, hitAt, burnt, burns }
  let roads = [];                 // { x, y, w, h, horiz, portA, portB }
  let portals = [];               // tunnel mouths { x, y, ang } (relative tiles)
  let lots = [];                  // ground patches { x, y, w, h, kind }
  let people = [], cars = [], planes = [];
  let reactors = [];              // power-station explosion sites (relative)
  let airport = null;
  let bmp = null, bctx = null;
  let bakeQ = [], baked = false, groundDone = false;
  let rnd = Math.random;

  const pick = arr => arr[Math.floor(rnd() * arr.length)];

  // A radial glow baked once per colour and stamped with drawImage — a new
  // gradient per headlight / fire per frame was the scene's main cost.
  const _glows = {};
  function _glowSprite(key, stops) {
    if (_glows[key]) return _glows[key];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (_glows[key] = c);
  }
  const HEAD = () => _glowSprite('head', [[0, 'rgba(255,240,200,0.5)'], [1, 'rgba(255,240,200,0)']]);
  // Street light pools: warm sodium on most roads, a cooler white on a few.
  // Softer at the core than a point glow, since neighbouring pools overlap.
  const LAMP  = () => _glowSprite('lamp',  [[0, 'rgba(255,232,176,0.8)'], [0.1, 'rgba(255,208,132,0.46)'], [0.55, 'rgba(255,196,116,0.14)'], [1, 'rgba(255,190,110,0)']]);
  const LAMPC = () => _glowSprite('lampc', [[0, 'rgba(236,244,255,0.75)'], [0.1, 'rgba(204,224,248,0.4)'], [0.55, 'rgba(190,214,244,0.12)'], [1, 'rgba(190,214,244,0)']]);
  const FIRE = () => _glowSprite('fire', [[0, 'rgba(255,215,120,1)'], [0.4, 'rgba(255,100,25,0.55)'], [1, 'rgba(120,20,0,0)']]);

  // ── Layout ──────────────────────────────────────────────────────
  function _entity(type, sub, x, y, w, h, extra = {}) {
    const e = new Entity(type, hc + x, hr + y);
    e.width = w; e.height = h;
    e.powered = true; e.reliability = 100; e.satisfaction = 100;
    if (sub) e.commercialSubtype = sub;
    Object.assign(e, extra);
    return e;
  }

  function _overlapsHall(x, y, w, h, pad = 2) {
    return x < hall.x + hall.w + pad && x + w > hall.x - pad && y < hall.y + hall.h + pad && y + h > hall.y - pad;
  }

  // A district's street grid: blocks of bw×bh separated by roads, starting
  // at (ox, oy) and repeating across [x0, x1)×[y0, y1).
  function _grid(kind, x0, y0, x1, y1, bw, bh, ox, oy) {
    const blocks = [];
    const sx = ox - Math.ceil((ox - x0) / (bw + ROAD)) * (bw + ROAD);
    const sy = oy - Math.ceil((oy - y0) / (bh + ROAD)) * (bh + ROAD);
    for (let by = sy; by < y1; by += bh + ROAD) {
      for (let bx = sx; bx < x1; bx += bw + ROAD) {
        const x = Math.max(x0, bx), y = Math.max(y0, by);
        const w = Math.min(x1, bx + bw) - x, h = Math.min(y1, by + bh) - y;
        if (w >= 4 && h >= 4) blocks.push({ x, y, w, h, kind });
      }
      if (by + bh < y1 && by + bh >= y0) roads.push({ x: x0, y: by + bh, w: x1 - x0, h: ROAD, horiz: true });
    }
    for (let bx = sx; bx < x1; bx += bw + ROAD) {
      if (bx + bw < x1 && bx + bw >= x0) roads.push({ x: bx + bw, y: y0, w: ROAD, h: y1 - y0, horiz: false });
    }
    lots.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, kind });
    return blocks;
  }

  // Shelf-pack buildings from `pool` into a block, one-tile sidewalk inside
  // its edge. pool: [[type, sub, w, h, weight, extra?]]
  function _fill(block, pool, district, skipHall) {
    const total = pool.reduce((s, p) => s + p[4], 0);
    // Big landmark buildings (a mall, an aquarium...) never come twice in a
    // row, or a block reads as copy-paste.
    let last = null;
    const choose = (maxW, maxH) => {
      const fit = pool.filter(p => p[2] <= maxW && p[3] <= maxH && !(p === last && p[2] * p[3] >= 20));
      if (!fit.length) return null;
      const t = fit.reduce((s, p) => s + p[4], 0);
      let r = rnd() * t;
      for (const p of fit) { if ((r -= p[4]) <= 0) return p; }
      return fit[fit.length - 1];
    };
    void total;
    let y = block.y + 1;
    const xEnd = block.x + block.w - 1, yEnd = block.y + block.h - 1;
    while (y < yEnd) {
      let x = block.x + 1, rowH = 0, placedAny = false;
      while (x < xEnd) {
        const p = choose(xEnd - x, yEnd - y);
        if (!p) break;
        const [type, sub, w, h, , extra] = p;
        last = p;
        if (skipHall && _overlapsHall(x, y, w, h)) { x += 1; continue; }
        buildings.push({ e: _entity(type, sub, x, y, w, h, extra || {}), x, y, w, h, district });
        x += w + (rnd() < 0.12 ? 1 : 0);
        rowH = Math.max(rowH, h);
        placedAny = true;
      }
      y += placedAny ? rowH + (rnd() < 0.15 ? 1 : 0) : 1;
    }
  }

  const HOUSE_TIERS = ['budget', 'mid', 'mid', 'premium', 'luxury'];
  const house = () => [T.HOUSE, null, 2, 2, 30, { houseWealthTier: pick(HOUSE_TIERS) }];

  function build(e) {
    hc = Math.floor(e.col + e.width / 2); hr = Math.floor(e.row + e.height / 2);
    hall = { x: e.col - hc, y: e.row - hr, w: e.width, h: e.height };
    buildings = []; roads = []; lots = []; people = []; cars = []; planes = [];
    reactors = []; baked = false; groundDone = false; bmp = null;

    // Downtown: City Hall's block is kept as a plaza.
    const dt = _grid('downtown', -31, -24, 31, 25, 10, 8, -5, -4);
    const DOWNTOWN = [
      [T.COMMERCIAL, 'office', 3, 3, 12], [T.COMMERCIAL, 'bank', 4, 4, 4], [T.COMMERCIAL, 'restaurant', 3, 2, 6],
      [T.COMMERCIAL, 'cafe', 2, 2, 6], [T.COMMERCIAL, 'hotel', 5, 6, 3], [T.COMMERCIAL, 'mall', 7, 5, 2],
      [T.COMMERCIAL, 'movietheater', 7, 5, 1], [T.COMMERCIAL, 'coworking', 3, 3, 4], [T.COMMERCIAL, 'library', 5, 4, 2],
      [T.COMMERCIAL, 'nightclub', 5, 4, 2], [T.COMMERCIAL, 'fastfood', 2, 2, 5], [T.COMMERCIAL, 'pharmacy', 2, 2, 4],
      [T.COMMERCIAL, 'bakery', 2, 2, 3], [T.HOUSE, 'skyscraper', 5, 8, 3], [T.HOUSE, 'apartment', 3, 4, 4],
    ];
    for (const b of dt) {
      if (_overlapsHall(b.x, b.y, b.w, b.h, 0)) { lots.push({ x: b.x, y: b.y, w: b.w, h: b.h, kind: 'plaza' }); continue; }
      _fill(b, DOWNTOWN, 'downtown', true);
    }

    // City Hall itself, lit up. It goes with the rest of the city — the one
    // the player powers is the rebuilt one.
    buildings.push({ e: _entity(T.GOVBUILDING, null, hall.x, hall.y, hall.w, hall.h), x: hall.x, y: hall.y, w: hall.w, h: hall.h, district: 'downtown' });

    // North side: the stadium, the fair and the museums.
    const north = _grid('leisure', -31, -47, 31, -26, 14, 19, -31, -47);
    const NORTH = [
      [T.COMMERCIAL, 'convention', 8, 5, 3], [T.COMMERCIAL, 'aquarium', 6, 5, 3], [T.COMMERCIAL, 'sciencemuseum', 5, 4, 3],
      [T.COMMERCIAL, 'bowling', 6, 4, 3], [T.COMMERCIAL, 'restaurant', 3, 2, 3], [T.COMMERCIAL, 'fastfood', 2, 2, 3],
      [T.SMALLPARK, null, 3, 2, 3], [T.FOUNTAIN, null, 3, 3, 2],
    ];
    north.forEach((b, i) => {
      const big = i === 0 ? ['stadium', 11, 9] : i === 1 ? ['amusementpark', 10, 8] : null;
      if (big && b.w >= big[1] + 2 && b.h >= big[2] + 2) {
        // `live`: all movement (the match and its crowd, the rides turning),
        // so these two are drawn every frame instead of baked (see _drawLive).
        buildings.push({ e: _entity(T.COMMERCIAL, big[0], b.x + 1, b.y + 1, big[1], big[2], big[0] === 'stadium' ? { _matchTonight: true, _stadiumEvent: 'match' } : {}), x: b.x + 1, y: b.y + 1, w: big[1], h: big[2], district: 'leisure', live: true });   // (and it is match night)
        _fill({ x: b.x, y: b.y + big[2] + 1, w: b.w, h: b.h - big[2] - 1 }, NORTH, 'leisure');
        return;
      }
      _fill(b, NORTH, 'leisure');
    });
    roads.push({ x: -31, y: -26, w: 62, h: ROAD, horiz: true });

    // West side: homes, schools and parks.
    const west = _grid('residential', X0, -24, -33, 25, 12, 9, -45, -4);
    const WEST = [
      house(), [T.HOUSE, 'townhouse', 6, 3, 6], [T.HOUSE, 'apartment', 3, 4, 5], [T.HOUSE, 'condo', 3, 5, 3],
      [T.SMALLPARK, null, 3, 2, 3], [T.PLAYGROUND, null, 2, 2, 3], [T.FOUNTAIN, null, 3, 3, 1], [T.COMMUNITYGARDEN, null, 3, 3, 2],
    ];
    west.forEach((b, i) => {
      if (i === 2 && b.w >= 9 && b.h >= 8) {       // one school with a ball field
        buildings.push({ e: _entity(T.HOUSE, 'school', b.x + 1, b.y + 1, 7, 6), x: b.x + 1, y: b.y + 1, w: 7, h: 6, district: 'residential' });
        return;
      }
      if (i === 5 && b.w >= 7 && b.h >= 6) {
        buildings.push({ e: _entity(T.BASEBALLFIELD, null, b.x + 1, b.y + 1, 5, 4), x: b.x + 1, y: b.y + 1, w: 5, h: 4, district: 'residential' });
        _fill({ x: b.x + 6, y: b.y, w: b.w - 6, h: b.h }, WEST, 'residential');
        return;
      }
      _fill(b, WEST, 'residential');
    });

    // East side industry.
    const east = _grid('industrial', 33, -24, 64, 25, 13, 10, 33, -4);
    const EAST = [
      [T.INDUSTRIAL, 'factory', 4, 4, 8], [T.INDUSTRIAL, 'chemical', 4, 4, 3, { businessName: 'Solvent Works' }],
      [T.INDUSTRIAL, 'bottling', 6, 6, 2, { businessName: 'Bottling Plant' }], [T.INDUSTRIAL, 'steelfoundry', 4, 4, 3, { businessName: 'Steel Foundry' }],
      [T.INDUSTRIAL, 'textilemill', 4, 3, 4], [T.INDUSTRIAL, 'recyclingplant', 7, 5, 1], [T.INDUSTRIAL, 'aluminumsmelter', 4, 4, 2],
      [T.INDUSTRIAL, 'machineshop', 8, 5, 1],
    ];
    for (const b of east) _fill(b, EAST, 'industrial');

    // Halcyon Atomic's power station: four reactors in a square, towers down the side.
    lots.push({ x: 66, y: -24, w: X1 - 66, h: 49, kind: 'power' });
    const RX = [[67, -23], [86, -23], [67, -3], [86, -3]];
    RX.forEach(([x, y]) => {
      buildings.push({ e: _entity(T.NUCLEARREACTOR, null, x, y, 17, 17), x, y, w: 17, h: 17, district: 'power', reactor: true });
      reactors.push({ c: hc + x + 8.5, r: hr + y + 8.5 });
    });
    for (let k = 0; k < 4; k++) {
      const x = 104, y = -23 + k * 11;
      buildings.push({ e: _entity(T.COOLINGTOWER, null, x, y, 9, 10), x, y, w: 9, h: 10, district: 'power' });
    }

    // The airport, south of downtown.
    airport = { x: -14, y: 28, w: 28, h: 16 };
    lots.push({ x: -31, y: 26, w: 62, h: 18, kind: 'airport' });
    roads.push({ x: -31, y: 26, w: 62, h: ROAD, horiz: true });
    buildings.push({ e: _entity(T.AIRPORT, null, airport.x, airport.y, 28, 16, { signName: (typeof CityInfo !== 'undefined' && CityInfo.getCityName?.()) || 'Gridworks' }), x: airport.x, y: airport.y, w: 28, h: 16, district: 'airport' });

    // Roads running out of town into open country end in a tunnel mouth
    // (TunnelPortal, render_core.js): an end is at the edge of the city when
    // nothing — no district, no other road — lies just beyond it.
    portals = [];
    const clear = (x, y, w, h) => !lots.some(l => x < l.x + l.w && x + w > l.x && y < l.y + l.h && y + h > l.y)
      && !roads.some(r => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y);
    for (const rd of roads) {
      if (rd.horiz) {
        rd.portA = clear(rd.x - 3, rd.y, 3, rd.h); rd.portB = clear(rd.x + rd.w, rd.y, 3, rd.h);
        if (rd.portA) portals.push({ x: rd.x, y: rd.y + rd.h / 2, ang: Math.PI });
        if (rd.portB) portals.push({ x: rd.x + rd.w, y: rd.y + rd.h / 2, ang: 0 });
      } else {
        rd.portA = clear(rd.x, rd.y - 3, rd.w, 3); rd.portB = clear(rd.x, rd.y + rd.h, rd.w, 3);
        if (rd.portA) portals.push({ x: rd.x + rd.w / 2, y: rd.y, ang: -Math.PI / 2 });
        if (rd.portB) portals.push({ x: rd.x + rd.w / 2, y: rd.y + rd.h, ang: Math.PI / 2 });
      }
    }

    // Life: people on every sidewalk, traffic in every lane, planes at the airport.
    for (const rd of roads) {
      const len = rd.horiz ? rd.w : rd.h;
      const nP = Math.floor(len / (rd.horiz ? 2.2 : 2.6));
      for (let i = 0; i < nP; i++) {
        const side = rnd() < 0.5 ? -0.35 : ROAD + 0.35;
        people.push({ rd, u: rnd() * len, off: side + (rnd() - 0.5) * 0.3, v: (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6),
          col: pick(['#d8c8a8', '#a84838', '#3858a0', '#e0e0d8', '#488848', '#c08838', '#6a5a8a']), ph: rnd() * 6, alive: true });
      }
      const nC = Math.floor(len / 9);
      for (let i = 0; i < nC; i++) {
        const lane = rnd() < 0.5 ? 0 : 1;
        const r = rnd();
        const kind = r < 0.6 ? 'car' : r < 0.72 ? 'taxi' : r < 0.9 ? 'van' : 'bus';
        const vmax = 3 + rnd() * 3;
        cars.push({ rd, u: rnd() * len, lane, dir: lane ? 1 : -1, vmax, v: vmax, kind, k: cars.length * 7 + 3,
          len: _carLen(kind), claims: [], hold: false,
          col: pick(['#c04040', '#e8e8e4', '#3060a0', '#404448', '#e0b030', '#2a8a5a']), alive: true });
      }
    }
    _setUpTraffic();
    planes.push({ ph: 0.0 }, { ph: 0.52 });
    for (const b of buildings) b.hitAt = Infinity;

    // Bake order: ground first, then buildings back to front.
    bakeQ = buildings.slice().sort((a, b) => (a.y + a.h) - (b.y + b.h));
    return reactors;
  }

  // ── Bake ────────────────────────────────────────────────────────
  const BX = x => (x - MX0) * TILE * BS, BY = y => (y - MY0) * TILE * BS;

  function _paintGround() {
    bmp = document.createElement('canvas');
    bmp.width = Math.ceil((MX1 - MX0) * TILE * BS); bmp.height = Math.ceil((MY1 - MY0) * TILE * BS);
    bctx = bmp.getContext('2d');
    const g = bctx, T_ = TILE * BS;
    const GROUND = { downtown: '#3a3c40', residential: '#2c3a26', industrial: '#3a3934', power: '#34363a', airport: '#3c3e40', plaza: '#6a665e', leisure: '#33402c' };
    for (const l of lots) { g.fillStyle = GROUND[l.kind] || '#333'; g.fillRect(BX(l.x), BY(l.y), l.w * T_, l.h * T_); }
    // Plaza paving lines
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1;
    for (const l of lots) if (l.kind === 'plaza') for (let x = l.x; x < l.x + l.w; x++) { g.beginPath(); g.moveTo(BX(x), BY(l.y)); g.lineTo(BX(x), BY(l.y + l.h)); g.stroke(); }
    // Roads, curbs, lane markings, street lamps
    for (const rd of roads) {
      g.fillStyle = '#6e6c66'; g.fillRect(BX(rd.x) - (rd.horiz ? 0 : T_ * 0.3), BY(rd.y) - (rd.horiz ? T_ * 0.3 : 0), rd.w * T_ + (rd.horiz ? 0 : T_ * 0.6), rd.h * T_ + (rd.horiz ? T_ * 0.6 : 0));
      g.fillStyle = '#26282c'; g.fillRect(BX(rd.x), BY(rd.y), rd.w * T_, rd.h * T_);
      g.fillStyle = 'rgba(230,200,90,0.75)';
      if (rd.horiz) for (let x = rd.x; x < rd.x + rd.w; x += 1.5) g.fillRect(BX(x), BY(rd.y + rd.h / 2) - 1, T_ * 0.7, 2);
      else for (let y = rd.y; y < rd.y + rd.h; y += 1.5) g.fillRect(BX(rd.x + rd.w / 2) - 1, BY(y), 2, T_ * 0.7);
    }
    // Tunnel mouths at the ends of roads leaving town. The road is two tiles
    // wide, so one portal unit (road half-width 12) is 1/12 of a tile.
    if (typeof TunnelPortal !== 'undefined') {
      portals.forEach((P, i) => TunnelPortal.paint(g, BX(P.x), BY(P.y), P.ang,
        { hw: 12, scale: T_ / 12, shade: 1, dark: 0.72, road: [38, 40, 44], grass: [52, 70, 40], seed: i * 37 + 5 }));
    }
    // Airport: runway and apron markings under the terminal sprite
    // (the terminal itself is baked with the buildings).
    groundDone = true;
  }

  // Street lamps: the posts are baked; their light is drawn live (see draw)
  // so it can go out when the shock front passes.
  let lamps = [];
  function _paintLamps() {
    const g = bctx, T_ = TILE * BS;
    lamps = [];
    // No two lamps alike: each has its own reach and brightness, a few
    // roads were relamped in white, the odd one is dead or on its way out.
    // `horiz` lets draw() stretch the pool along the road it lights.
    const lamp = (x, y, horiz, cool) => lamps.push({
      x, y, on: true, horiz, cool, s: 0.82 + rnd() * 0.45, b: 0.7 + rnd() * 0.3,
      dead: rnd() < 0.03, flick: rnd() < 0.05, ph: rnd() * 6.283,
    });
    for (const rd of roads) {
      const len = rd.horiz ? rd.w : rd.h;
      const cool = rnd() < 0.22;
      for (let s = 2; s < len; s += 6) {
        for (const side of [-0.25, rd.horiz ? rd.h + 0.25 : rd.w + 0.25]) {
          const x = rd.horiz ? rd.x + s : rd.x + side, y = rd.horiz ? rd.y + side : rd.y + s;
          g.fillStyle = '#2a2a2c'; g.beginPath(); g.arc(BX(x), BY(y), Math.max(1.2, T_ * 0.08), 0, 6.283); g.fill();
          lamp(x, y, rd.horiz, cool);
        }
      }
    }
    if (typeof TunnelPortal !== 'undefined') {
      for (const P of portals) for (const [lx, ly] of TunnelPortal.lamps(12)) {
        const [x, y] = TunnelPortal.toWorld(P.x, P.y, P.ang, lx, ly, 1 / 12);
        g.fillStyle = '#2a2a2c'; g.beginPath(); g.arc(BX(x), BY(y), Math.max(1.2, T_ * 0.08), 0, 6.283); g.fill();
        lamp(x, y, null, false);
      }
    }
  }

  // Draw a few sprites; true once the whole city is baked. Sprites read the
  // clock and the camera for their lighting and level of detail, so both are
  // pinned to a lit evening at full detail for the duration of each call.
  function bakeStep(budgetMs = 8) {
    if (baked) return true;
    if (!groundDone) { _paintGround(); return false; }
    const t0 = performance.now();
    const saved = ctx, oh = DayNight.hour, od = DayNight.darkness, oz = Camera.zoom;
    DayNight.hour = () => 20.4; DayNight.darkness = () => 0.72;
    Camera.setZoom(1);
    ctx = bctx;
    try {
      bctx.setTransform(BS, 0, 0, BS, -MX0 * TILE * BS - hc * TILE * BS, -MY0 * TILE * BS - hr * TILE * BS);
      while (bakeQ.length && performance.now() - t0 < budgetMs) {
        const b = bakeQ.shift();
        if (b.live) continue;
        try { renderEntityAt(b.e, b.e.col * TILE, b.e.row * TILE, 12.3); }
        catch (err) {
          bctx.fillStyle = '#4a4a4a'; bctx.fillRect(b.e.col * TILE, b.e.row * TILE, b.w * TILE, b.h * TILE);
        }
      }
    } finally {
      ctx = saved; DayNight.hour = oh; DayNight.darkness = od; Camera.setZoom(oz);
      bctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (bakeQ.length) return false;
    _paintLamps();
    // Tint the whole thing like archive footage, once.
    const sep = document.createElement('canvas'); sep.width = bmp.width; sep.height = bmp.height;
    const sg = sep.getContext('2d');
    sg.filter = 'sepia(0.55) saturate(1.25) contrast(1.12) brightness(0.92)';
    sg.drawImage(bmp, 0, 0);
    bmp = sep; bctx = sg; bctx.filter = 'none';
    baked = true;
    return true;
  }
  function finishBake() { while (!bakeStep(1000)) {} }

  // ── Destruction ─────────────────────────────────────────────────
  // Arrival time of the first shockwave at each building, from the blasts.
  function scheduleHits(blasts) {   // [{ c, r, at, reach, speed }] world tiles, absolute clock
    for (const b of buildings) {
      const cx = hc + b.x + b.w / 2, cy = hr + b.y + b.h / 2;
      let best = Infinity;
      for (const s of blasts) {
        const d = Math.hypot(cx - s.c, cy - s.r);
        if (d <= s.reach) best = Math.min(best, s.at + 0.08 + d / s.speed);
      }
      b.hitAt = best;
      b.burns = rnd() < 0.45;
      // A reactor stands until it goes up itself. A neighbour's shock front
      // reaching it first only sets it alight (see draw), it doesn't flatten
      // it: otherwise it is already rubble when its own explosion comes.
      if (b.reactor) {
        const own = blasts.find(s => Math.hypot(cx - s.c, cy - s.r) < 1);
        if (own) { b.fireAt = best < own.at ? best : Infinity; b.hitAt = own.at; }
      }
    }
    blastList = blasts;
  }
  let blastList = [];

  function _ruin(b) {
    b.burnt = true;
    const g = bctx, T_ = TILE * BS;
    // A live building has no baked copy to ruin: its last frame goes in first.
    if (b.live) {
      if (!b.cv) _liveFrame(b, 0);
      g.filter = LIVE_TINT; g.drawImage(b.cv, BX(b.x - LIVE_PAD), BY(b.y - LIVE_PAD)); g.filter = 'none';
    }
    const x = BX(b.x), y = BY(b.y), w = b.w * T_, h = b.h * T_;
    if (b.survives) {
      // Still standing — just blacked out and scorched.
      b.burns = false;
      g.fillStyle = 'rgba(10,8,6,0.62)'; g.fillRect(x, y, w, h);
      const sc = g.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.2, x + w / 2, y + h / 2, Math.max(w, h) * 0.8);
      sc.addColorStop(0, 'rgba(0,0,0,0)'); sc.addColorStop(1, 'rgba(0,0,0,0.45)');
      g.fillStyle = sc; g.fillRect(x - w * 0.3, y - h * 0.3, w * 1.6, h * 1.6);
      return;
    }
    g.fillStyle = 'rgba(14,11,9,0.92)'; g.fillRect(x, y, w, h);
    const n = Math.max(3, Math.round(b.w * b.h * 1.2));
    for (let i = 0; i < n; i++) {
      const rw = (0.2 + rnd() * 0.6) * T_, rh = (0.2 + rnd() * 0.6) * T_;
      g.fillStyle = rnd() < 0.2 ? 'rgba(90,40,20,0.7)' : `rgba(${40 + rnd() * 30 | 0},${34 + rnd() * 20 | 0},${30 + rnd() * 16 | 0},0.9)`;
      g.fillRect(x + rnd() * (w - rw), y + rnd() * (h - rh), rw, rh);
    }
    // scorch spreading onto the ground around it
    const gr = g.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.3, x + w / 2, y + h / 2, Math.max(w, h) * 0.9);
    gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - w * 0.4, y - h * 0.4, w * 1.8, h * 1.8);
  }

  // The shock front's radius (tiles) from a blast at time `now`.
  const _front = (s, now) => now < s.at ? -1 : Math.min(s.reach, (now - s.at) * s.speed);

  // ── Countryside ─────────────────────────────────────────────────
  // What lies between and around the districts: the game's grass look with
  // scattered trees, baked once into a tile (tinted like the footage) and
  // laid down as a repeating pattern under the city.
  const GRASS_TILES = 12;           // tile edge, in world tiles
  let grassPat = null;
  function _grassPattern(g) {
    if (grassPat) return grassPat;
    const px = GRASS_TILES * TILE;
    const c = document.createElement('canvas'); c.width = c.height = px;
    const gc = c.getContext('2d');
    gc.fillStyle = '#2a3a22'; gc.fillRect(0, 0, px, px);
    // mottling in the ground palette
    const shades = ['#243420', '#30421f', '#2c3d26', '#36472a', '#3a4028', '#263822'];
    for (let i = 0; i < 260; i++) {
      gc.fillStyle = shades[Math.floor(rnd() * shades.length)];
      const r = (0.3 + rnd() * 1.2) * TILE;
      gc.globalAlpha = 0.35 + rnd() * 0.4;
      gc.beginPath(); gc.ellipse(rnd() * px, rnd() * px, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, 6.283); gc.fill();
    }
    gc.globalAlpha = 1;
    // trees and bushes from the game's own sprites, kept off the edges so
    // the tile repeats without seams
    const saved = ctx, oh = DayNight.hour, od = DayNight.darkness, oz = Camera.zoom;
    DayNight.hour = () => 20.4; DayNight.darkness = () => 0.72; Camera.setZoom(1);
    ctx = gc;
    try {
      for (let i = 0; i < 26; i++) {
        const tc = 1 + Math.floor(rnd() * (GRASS_TILES - 2)), tr = 1 + Math.floor(rnd() * (GRASS_TILES - 2));
        const e = new Entity(rnd() < 0.7 ? T.TREE : T.BUSH, tc, tr);
        try { renderEntityAt(e, tc * TILE, tr * TILE, 12.3); } catch (_e) {}
      }
    } finally { ctx = saved; DayNight.hour = oh; DayNight.darkness = od; Camera.setZoom(oz); }
    // the same archive tint as the city
    const t = document.createElement('canvas'); t.width = t.height = px;
    const tg = t.getContext('2d');
    tg.filter = 'sepia(0.55) saturate(1.25) contrast(1.12) brightness(0.8)';
    tg.drawImage(c, 0, 0);
    grassPat = g.createPattern(t, 'repeat');
    return grassPat;
  }

  // ── Traffic ─────────────────────────────────────────────────────
  // One lane each way on every road (right-hand traffic). Cars follow the
  // one ahead at a safe gap rather than each keeping its own speed, and
  // where two roads cross, a car goes into the crossing only when nothing
  // on the other road is in it and there's room for it on the far side.
  // At a road end a car drives into its tunnel, or fades out where there's
  // none, and comes back in at the start once the lane there is clear.
  // Positions are in tiles along the road (u); cars are drawn by the city's
  // vehicle painter at 1.6× in world px, so their lengths are fixed in tiles.
  const C_GAP = 0.2, C_ACC = 5, C_DEC = 12;       // tiles, tiles/s²
  const _carLen = (kind) => (typeof ZoneLife !== 'undefined' ? ZoneLife.VEH[kind].len : 15) * 1.6 / TILE;
  const _tunnelExt = () => typeof TunnelPortal !== 'undefined' ? TunnelPortal.EXT / 12 : 0;
  const _roadLen = (rd) => rd.horiz ? rd.w : rd.h;

  function _setUpTraffic() {
    // Crossings: where a horizontal and a vertical road overlap. Each road
    // keeps them as intervals along itself.
    for (const rd of roads) { rd.boxes = []; rd.lanes = [[], []]; }
    for (const a of roads) {
      if (!a.horiz) continue;
      for (const b of roads) {
        if (b.horiz) continue;
        const x0 = Math.max(a.x, b.x), x1 = Math.min(a.x + a.w, b.x + b.w);
        const y0 = Math.max(a.y, b.y), y1 = Math.min(a.y + a.h, b.y + b.h);
        if (x1 <= x0 || y1 <= y0) continue;
        const box = { users: [] };
        a.boxes.push({ box, a0: x0 - a.x, a1: x1 - a.x });
        b.boxes.push({ box, a0: y0 - b.y, a1: y1 - b.y });
      }
    }
    for (const rd of roads) { rd.boxes.sort((p, q) => p.a0 - q.a0); rd.boxesRev = rd.boxes.slice().reverse(); }
    // Drop any car that starts inside a crossing or on top of another.
    const keep = [];
    for (const c of cars) {
      const lane = c.rd.lanes[c.lane];
      if (c.rd.boxes.some(B => c.u + c.len / 2 > B.a0 - C_GAP && c.u - c.len / 2 < B.a1 + C_GAP)) continue;
      if (lane.some(o => Math.abs(o.u - c.u) < (o.len + c.len) / 2 + C_GAP)) continue;
      lane.push(c); keep.push(c);
    }
    cars = keep;
  }

  function _releaseCar(c) {
    for (const B of c.claims) { const i = B.box.users.indexOf(c); if (i >= 0) B.box.users.splice(i, 1); }
    c.claims.length = 0;
  }

  function _stepCars(dt, slow) {
    const ext = _tunnelExt();
    for (const rd of roads) {
      const len = _roadLen(rd);
      for (let l = 0; l < 2; l++) {
        const lane = rd.lanes[l], dir = l ? 1 : -1;
        const u0 = dir > 0 ? (rd.portA ? -ext : 0) : (rd.portB ? len + ext : len);   // where cars come in
        const u1 = dir > 0 ? (rd.portB ? len + ext : len) : (rd.portA ? -ext : 0);   // and go out
        lane.sort((a, b) => (b.u - a.u) * dir);                                        // front of the queue first
        let L = null;                                                                  // the car ahead
        for (const c of lane) {
          if (!c.alive || c.hold) continue;
          let want = c.vmax, room = Infinity;
          if (L) {
            const gap = (L.u - c.u) * dir - (L.len + c.len) / 2;
            want = Math.min(want, L.v + Math.max(0, gap - C_GAP) * 2.5);
            room = gap - C_GAP;
          }
          // Crossings ahead: claim the way through, or stop short of it.
          const front = c.u + dir * c.len / 2;
          for (const B of dir > 0 ? rd.boxes : rd.boxesRev) {
            const entry = dir > 0 ? B.a0 : B.a1, exit = dir > 0 ? B.a1 : B.a0;
            if (c.claims.includes(B) || (c.u - dir * c.len / 2 - exit) * dir > 0) continue;
            const dist = (entry - front) * dir - 0.05;
            if (dist < -0.01) continue;
            if (dist > c.v * c.v / (2 * C_DEC) + 1) break;
            const cross = B.box.users.some(o => o.rd.horiz !== rd.horiz);
            const clear = !L || ((L.u - dir * L.len / 2) - exit) * dir >= c.len + C_GAP;
            if (!cross && clear) { B.box.users.push(c); c.claims.push(B); continue; }
            want = Math.min(want, Math.sqrt(2 * C_DEC * Math.max(0, dist)));
            room = Math.min(room, Math.max(0, dist));
            break;
          }
          c.v = c.v < want ? Math.min(want, c.v + C_ACC * dt) : Math.max(want, c.v - C_DEC * 2 * dt);
          const adv = Math.max(0, Math.min(c.v * slow * dt, room));
          c.u += dir * adv;
          // Crossings left behind.
          for (let k = c.claims.length - 1; k >= 0; k--) {
            const B = c.claims[k], exit = dir > 0 ? B.a1 : B.a0;
            if ((c.u - dir * c.len / 2 - exit) * dir > 0) { const i = B.box.users.indexOf(c); if (i >= 0) B.box.users.splice(i, 1); c.claims.splice(k, 1); }
          }
          // Off the end: round again from the start when there's room.
          if ((c.u - dir * c.len / 2 - u1) * dir > 0) { _releaseCar(c); c.hold = true; continue; }
          L = c;
        }
        // L is now the car nearest the start. One waiting car comes back in
        // behind it if there's room.
        // (Some roads start in a crossing: it has to be free and claimed first.)
        const w = lane.find(c => c.alive && c.hold);
        if (w && (!L || ((L.u - dir * L.len / 2) - u0) * dir >= w.len * 1.5 + C_GAP)) {
          const lo = Math.min(u0 - dir * w.len, u0 + dir * (w.len + C_GAP)), hi = Math.max(u0 - dir * w.len, u0 + dir * (w.len + C_GAP));
          const at = rd.boxes.filter(B => B.a1 > lo && B.a0 < hi);
          if (!at.some(B => B.box.users.some(o => o.rd.horiz !== rd.horiz))) {
            for (const B of at) { B.box.users.push(w); w.claims.push(B); }
            w.hold = false; w.u = u0 - dir * w.len / 2; w.v = Math.min(w.vmax, L ? L.v : w.vmax);
          }
        }
      }
    }
  }

  // A `live` building, drawn this frame from its own sprite so that it
  // moves: into a small canvas of its own under the same pinned evening and
  // zoom the bake uses, then onto the footage through the bake's tint. (It
  // was never baked, so there is no still copy underneath to ghost.)
  const LIVE_PAD = 1;                                  // tiles round the footprint a sprite may spill into
  const LIVE_TINT = 'sepia(0.55) saturate(1.25) contrast(1.12) brightness(0.92)';
  function _liveFrame(b, now) {
    const e = b.e, x0 = (e.col - LIVE_PAD) * TILE, y0 = (e.row - LIVE_PAD) * TILE;
    const w = (b.w + LIVE_PAD * 2) * TILE, h = (b.h + LIVE_PAD * 2) * TILE;
    if (!b.cv) { b.cv = document.createElement('canvas'); b.cv.width = Math.ceil(w * BS); b.cv.height = Math.ceil(h * BS); }
    const c2 = b.cv.getContext('2d');
    const saved = ctx, oh = DayNight.hour, od = DayNight.darkness, zd = Object.getOwnPropertyDescriptor(Camera, 'zoom');
    DayNight.hour = () => 20.4; DayNight.darkness = () => 0.72;
    if (zd && zd.configurable) Object.defineProperty(Camera, 'zoom', { get: () => 1, configurable: true });
    ctx = c2;
    try {
      c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, b.cv.width, b.cv.height);
      c2.setTransform(BS, 0, 0, BS, -x0 * BS, -y0 * BS);
      renderEntityAt(e, e.col * TILE, e.row * TILE, 12.3 + now);
    } catch (_err) { /* a sprite that won't draw just stays off the footage */ }
    finally {
      ctx = saved; DayNight.hour = oh; DayNight.darkness = od;
      if (zd && zd.configurable) Object.defineProperty(Camera, 'zoom', zd);
    }
  }
  function _drawLive(g, b, now, vw, vh) {
    const x0 = (b.e.col - LIVE_PAD) * TILE, y0 = (b.e.row - LIVE_PAD) * TILE;
    const w = (b.w + LIVE_PAD * 2) * TILE, h = (b.h + LIVE_PAD * 2) * TILE;
    if (x0 > Camera.x + vw || y0 > Camera.y + vh || x0 + w < Camera.x || y0 + h < Camera.y) return;   // not in shot
    _liveFrame(b, now);
    g.filter = LIVE_TINT;
    g.drawImage(b.cv, x0, y0, w, h);
    g.filter = 'none';
  }

  // ── Per frame ───────────────────────────────────────────────────
  // g: overlay context in CSS px; z: camera zoom; sx/sy map world px → screen.
  function draw(g, now, dt, dpr, ox = 0, oy = 0) {
    if (!bmp) return;
    const z = Camera.zoom;
    g.save();
    g.setTransform(dpr * z, 0, 0, dpr * z, (-Camera.x * z + ox) * dpr, (-Camera.y * z + oy) * dpr);
    const wx = (hc + MX0) * TILE, wy = (hr + MY0) * TILE;
    g.imageSmoothingEnabled = true;
    // Countryside under everything, across the whole view.
    g.fillStyle = _grassPattern(g);
    const vw = innerWidth / z, vh = innerHeight / z;
    g.fillRect(Camera.x - 2 * TILE, Camera.y - 2 * TILE, vw + 4 * TILE, vh + 4 * TILE);
    g.drawImage(bmp, wx, wy, (MX1 - MX0) * TILE, (MY1 - MY0) * TILE);

    // Ruins, as the fronts reach them.
    for (const b of buildings) if (!b.burnt && now >= b.hitAt) _ruin(b);
    if (baked) for (const b of buildings) if (b.live && !b.burnt) _drawLive(g, b, now, vw, vh);

    const T_ = TILE;
    const px = (x) => (hc + x) * T_, py = (y) => (hr + y) * T_;
    const anyBoom = blastList.some(s => now >= s.at);
    // What's on screen, in relative tiles (plus a margin).
    const vx0 = Camera.x / T_ - hc - 3, vy0 = Camera.y / T_ - hr - 3;
    const vx1 = vx0 + innerWidth / z / T_ + 6, vy1 = vy0 + innerHeight / z / T_ + 6;
    const inView = (x, y) => x > vx0 && x < vx1 && y > vy0 && y < vy1;

    // Street lights — out once the front has passed. Each pool is stretched
    // along its road so neighbours run together into a lit street rather
    // than a row of dots. Once the first reactor has gone the grid is
    // failing: every lamp still standing browns out and stutters.
    g.globalCompositeOperation = 'lighter';
    for (const L of lamps) {
      if (!L.on) continue;
      if (anyBoom && _hitAt(L.x, L.y, now)) { L.on = false; continue; }
      if (L.dead || !inView(L.x, L.y)) continue;
      let a = L.b;
      if (L.flick && Math.sin(now * 31 + L.ph) * Math.sin(now * 7.3 + L.ph * 3) < -0.25) a *= 0.2;
      if (anyBoom) a *= 0.35 + 0.65 * Math.abs(Math.sin(now * 13 + L.ph * 5) * Math.sin(now * 3.1 + L.ph));
      const along = T_ * 2.9 * L.s, across = T_ * 1.75 * L.s;
      const hw = L.horiz === null ? across : L.horiz ? along : across, hh = L.horiz === null ? across : L.horiz ? across : along;
      g.globalAlpha = a;
      g.drawImage(L.cool ? LAMPC() : LAMP(), px(L.x) - hw, py(L.y) - hh, hw * 2, hh * 2);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    // Traffic — drawn by the game's own vehicle painter (zone_life.js) so it
    // matches the city's traffic, with the same detail rule: full detail on
    // medium/high graphics when close enough, plain bodies on low.
    const vehicleArt = typeof ZoneLife !== 'undefined' && ZoneLife.drawVehicle;
    const lv = typeof GfxQuality !== 'undefined' ? GfxQuality.level() : 2;
    const detail = lv > 0 && z > 0.35;
    const base = g.getTransform();
    // A road ending in a tunnel runs on past its end into the bore (portal
    // units are 1/12 tile), so cars drive in and come back out; where there's
    // no tunnel they fade at the road end (see _stepCars).
    const TP = typeof TunnelPortal !== 'undefined' ? TunnelPortal : null;
    _stepCars(Math.min(dt, 0.1), anyBoom ? 0.2 : 1);
    for (const c of cars) {
      if (!c.alive || c.hold) continue;
      const rd = c.rd, len = rd.horiz ? rd.w : rd.h;
      // right-hand traffic: eastbound on the south side, southbound on the west
      const lx = rd.horiz ? rd.x + c.u : rd.x + (c.lane ? 0.55 : 1.45);
      const ly = rd.horiz ? rd.y + (c.lane ? 1.45 : 0.55) : rd.y + c.u;
      if (anyBoom && _hitAt(lx, ly, now)) { c.alive = false; _releaseCar(c); continue; }
      if (!inView(lx, ly)) continue;
      const X = px(lx), Y = py(ly), L = T_ * 0.55, W = T_ * 0.3;
      const dir = c.dir;
      // past a tunnel end: fade into the dark and clip at the headwall;
      // a road end with no tunnel: fade out and in
      const inA = TP && rd.portA && c.u < 1, inB = TP && rd.portB && c.u > len - 1;
      let alpha = inA ? TP.fade(-c.u * 12) : inB ? TP.fade((c.u - len) * 12) : 1;
      if (!rd.portA) alpha = Math.min(alpha, Math.max(0, Math.min(1, c.u / 0.8)));
      if (!rd.portB) alpha = Math.min(alpha, Math.max(0, Math.min(1, (len - c.u) / 0.8)));
      if (alpha <= 0) continue;
      if (inA || inB) {
        const cut = inA ? -TP.CLIP / 12 : len + TP.CLIP / 12;
        const m0 = inA ? cut : cut - 8, m1 = inA ? cut + 8 : cut;
        g.save(); g.beginPath();
        if (rd.horiz) g.rect(px(rd.x + m0), py(rd.y - 1), (m1 - m0) * T_, (rd.h + 2) * T_);
        else g.rect(px(rd.x - 1), py(rd.y + m0), (rd.w + 2) * T_, (m1 - m0) * T_);
        g.clip();
      }
      if (vehicleArt) {
        const ang = rd.horiz ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        ZoneLife.drawVehicle(g, base, X, Y, c.kind, ang, c.k, now, alpha, 1, detail, 1.6);
        if (inA || inB) g.restore();
        continue;
      }
      g.globalAlpha = alpha;
      g.fillStyle = c.col;
      if (c.rd.horiz) g.fillRect(X - L / 2, Y - W / 2, L, W); else g.fillRect(X - W / 2, Y - L / 2, W, L);
      const hx = c.rd.horiz ? X + dir * L * 0.6 : X, hy = c.rd.horiz ? Y : Y + dir * L * 0.6;
      g.globalCompositeOperation = 'lighter';
      g.drawImage(HEAD(), hx - T_ * 0.9, hy - T_ * 0.9, T_ * 1.8, T_ * 1.8);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      if (inA || inB) g.restore();
    }
    g.globalAlpha = 1;

    // People: stroll, then run from the blast, then are gone.
    for (const p of people) {
      if (!p.alive) continue;
      const len = p.rd.horiz ? p.rd.w : p.rd.h;
      let v = p.v;
      if (anyBoom) {
        // Panic: run away from the nearest blast, along the street.
        const s = blastList.find(b => now >= b.at) || blastList[0];
        const cx = p.rd.horiz ? hc + p.rd.x + p.u : hc + p.rd.x + p.off;
        const cy = p.rd.horiz ? hr + p.rd.y + p.off : hr + p.rd.y + p.u;
        const away = p.rd.horiz ? Math.sign(cx - s.c) : Math.sign(cy - s.r);
        v = (away || 1) * 3.2;
      }
      p.u += v * dt;
      if (p.u < 0 || p.u > len) { p.u = Math.max(0, Math.min(len, p.u)); p.v = -p.v; }
      const lx = p.rd.horiz ? p.rd.x + p.u : p.rd.x + p.off;
      const ly = p.rd.horiz ? p.rd.y + p.off : p.rd.y + p.u;
      if (anyBoom && _hitAt(lx, ly, now)) { p.alive = false; continue; }
      if (!inView(lx, ly)) continue;
      const bob = Math.sin(now * (anyBoom ? 18 : 8) + p.ph) * T_ * 0.02;
      const X = px(lx), Y = py(ly) + bob;
      g.fillStyle = p.col; g.fillRect(X - T_ * 0.07, Y - T_ * 0.02, T_ * 0.14, T_ * 0.16);
      g.fillStyle = '#e8c8a0'; g.fillRect(X - T_ * 0.055, Y - T_ * 0.14, T_ * 0.11, T_ * 0.11);
    }

    // Planes: one on its take-off roll, one lifting away.
    if (airport) {
      for (const pl of planes) {
        if (pl.dead) continue;
        const u = ((now * 0.11 + pl.ph) % 1);
        const lift = Math.max(0, (u - 0.55) / 0.45);
        const lx = airport.x + 1 + u * u * 54, ly = airport.y + 3.9 - lift * 5;
        if (_hitAt(lx, ly, now)) { pl.dead = true; continue; }
        const X = px(lx), Y = py(ly), s = T_ * (1 + lift * 0.9);
        // shadow on the ground, drifting away as it climbs
        g.fillStyle = 'rgba(0,0,0,0.35)';
        _planeShape(g, X + lift * T_ * 1.6, Y + lift * T_ * 2.2, s * 0.9);
        g.fillStyle = '#eef0f2'; _planeShape(g, X, Y, s);
        g.save(); g.globalCompositeOperation = 'lighter';
        const blink = Math.sin(now * 9 + pl.ph * 20) > 0.5;
        if (blink) { g.fillStyle = 'rgba(255,60,60,0.9)'; g.beginPath(); g.arc(X, Y - s * 0.55, s * 0.08, 0, 6.283); g.fill(); }
        g.restore();
      }
    }

    // Fires in the ruins.
    g.save(); g.globalCompositeOperation = 'lighter';
    // A reactor caught by a neighbour's blast: still whole, but burning,
    // with the fire spreading across it until its own turn comes.
    for (const b of buildings) {
      if (!b.reactor || b.burnt || !(now >= b.fireAt)) continue;
      if (!inView(b.x + b.w / 2, b.y + b.h / 2)) continue;
      const age = now - b.fireAt, grow = Math.min(1, 0.35 + age * 0.45);
      for (let i = 0; i < 7; i++) {
        const fxq = Math.sin(i * 12.9898 + b.x) * 43758.5453, fyq = Math.sin(i * 78.233 + b.y) * 12543.123;
        const ox = (fxq - Math.floor(fxq) - 0.5) * b.w * 0.8, oy = (fyq - Math.floor(fyq) - 0.5) * b.h * 0.8;
        if (i / 7 > grow) continue;                       // more of it catches as time goes on
        const fl = 0.6 + 0.4 * Math.sin(now * 11 + i * 2.1) * Math.sin(now * 7.3 + i);
        const r = T_ * (2.2 + 1.6 * fl) * (0.7 + 0.3 * grow);
        g.globalAlpha = 0.85 * fl;
        g.drawImage(FIRE(), px(b.x + b.w / 2 + ox) - r, py(b.y + b.h / 2 + oy) - r, r * 2, r * 2);
      }
    }
    for (const b of buildings) {
      if (!b.burnt || !b.burns) continue;
      if (!inView(b.x + b.w / 2, b.y + b.h / 2)) continue;
      const age = Math.max(0, now - b.hitAt);
      const X = px(b.x + b.w / 2), Y = py(b.y + b.h / 2);
      const fl = 0.6 + 0.4 * Math.sin(now * 11 + b.x) * Math.sin(now * 7.3 + b.y);
      const r = Math.max(b.w, b.h) * T_ * (0.7 + fl * 0.35) * Math.min(1, 0.4 + age);
      g.globalAlpha = 0.8 * fl;
      g.drawImage(FIRE(), X - r, Y - r, r * 2, r * 2);
      // The moment it goes up: a hard pop as the front takes the building,
      // so the wave reads as a line of detonations crossing the city.
      if (age < 0.4) {
        const k = 1 - age / 0.4, pr = Math.max(b.w, b.h) * T_ * (1.1 + 1.6 * (1 - k));
        g.globalAlpha = k;
        g.drawImage(FIRE(), X - pr, Y - pr, pr * 2, pr * 2);
      }
    }
    g.globalAlpha = 1;
    g.restore();
    g.restore();
  }

  function _planeShape(g, x, y, s) {
    g.beginPath();
    g.ellipse(x, y, s * 0.6, s * 0.1, 0, 0, 6.283); g.fill();                    // fuselage
    g.beginPath(); g.moveTo(x + s * 0.05, y); g.lineTo(x - s * 0.15, y - s * 0.55); g.lineTo(x - s * 0.28, y - s * 0.55); g.lineTo(x - s * 0.12, y);
    g.lineTo(x - s * 0.28, y + s * 0.55); g.lineTo(x - s * 0.15, y + s * 0.55); g.closePath(); g.fill(); // wings
    g.beginPath(); g.moveTo(x - s * 0.45, y); g.lineTo(x - s * 0.58, y - s * 0.22); g.lineTo(x - s * 0.62, y - s * 0.22); g.lineTo(x - s * 0.55, y);
    g.lineTo(x - s * 0.62, y + s * 0.22); g.lineTo(x - s * 0.58, y + s * 0.22); g.closePath(); g.fill();  // tail
  }

  // Has a shock front passed this spot (relative tiles) by `now`?
  function _hitAt(lx, ly, now) {
    for (const s of blastList) {
      const f = _front(s, now);
      if (f < 0) continue;
      if (Math.hypot(hc + lx - s.c, hr + ly - s.r) <= f) return true;
    }
    return false;
  }

  // Camera targets for the establishing shots, world pixels.
  function shotCentre(which) {
    const at = (x, y) => ({ x: (hc + x) * TILE, y: (hr + y) * TILE });
    switch (which) {
      case 'skyline':     return at(-14, -4);
      case 'skylineEnd':  return at(14, 2);
      case 'downtown':    return at(-2, 3);
      case 'leisure':     return at(-14, -37);
      case 'residential': return at(-56, 0);
      case 'airport':     return at(0, 34);
      case 'industrial':  return at(48, 0);
      case 'power':       return at(88, -3);
      case 'wide':        return at(70, 0);
      case 'wideEnd':     return at(-8, 6);
    }
    return at(0, 0);
  }

  // What the old city leaves in the ground: its streets and the four reactor
  // sites, in world tiles. Read before reset(), for the present-day shot.
  function traces() {
    return {
      roads: roads.map(r => ({ x: hc + r.x, y: hr + r.y, w: r.w, h: r.h, horiz: r.horiz })),
      reactors: reactors.map(r => ({ c: r.c, r: r.r })),
      // Footprints of everything that stood here, bar City Hall (rebuilt)
      // and the reactors (craters now).
      plots: buildings.filter(b => !b.reactor && b.e.type !== T.GOVBUILDING)
        .map(b => ({ x: hc + b.x, y: hr + b.y, w: b.w, h: b.h })),
    };
  }

  function peopleAlive() { return people.reduce((n, p) => n + (p.alive ? 1 : 0), 0); }
  function reset() { grassPat = null; bmp = null; bctx = null; buildings = []; portals = []; people = []; cars = []; planes = []; lamps = []; blastList = []; baked = false; }

  // Debug: buildings still standing (not ruined) — should only ever be City Hall.
  function survivors() { return buildings.filter(b => !b.burnt).map(b => ({ type: b.e.type, sub: b.e.commercialSubtype || null, x: b.x, y: b.y, hitAt: b.hitAt, survives: !!b.survives })); }
  return { build, bakeStep, finishBake, isBaked: () => baked, scheduleHits, draw, shotCentre, traces, peopleAlive, reset, survivors, bitmap: () => bmp };
})();
