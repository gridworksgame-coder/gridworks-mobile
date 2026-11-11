/* ═══════════════════════════════════════════════════════════════════
   CONSTRUCTION
   A customer the player accepts isn't there yet: a crew builds it on its
   plot first, tile by tile, and only once it's finished can it take power.

   While it's going up (e._constructing) the building is on the map and in
   its zone, but it draws nothing from the grid, pays no fee, has no
   satisfaction to lose and can't be flagged as dark — power_network.js,
   economy.js, satisfaction_system.js and OutageWatch all skip it. Its
   move-in grace period and arrival moment (zone_moments.js) start the
   moment it's finished, not the moment it was accepted.

   Build time is game time, so fast-forward speeds it up, and scales with
   the footprint: a 2×2 house is about half a minute, a stadium several.

   The site itself does take power: a construction load (drawW) for the
   crew's tools, lights and hoists, added to its network by power_network.js.
   Wired to a network that can carry it, the site builds at full speed;
   otherwise the crew runs a diesel generator of their own and builds at
   UNPOWERED_SPEED. A site never blocks outright — Mae's Cabin goes up
   before the player has any grid to speak of.

   Saved as e._buildDone / e._buildTotal (game seconds) and e._siteKW.
   _buildDone starts negative for a suburb lot that's waiting its turn
   behind the lots before it.
   ═══════════════════════════════════════════════════════════════════ */

const ConstructionSystem = (() => {
  const SECS_BASE     = 15;    // game seconds for any site, before its size
  const SECS_PER_TILE = 4;     // ...plus this per footprint tile
  const SECS_MAX      = 360;
  const CABIN_SECS    = 10;    // Mae's Cabin: the tutorial is waiting on it
  const LOT_STAGGER   = 8;     // a suburb's lots start this far apart
  const CRANE_AREA    = 20;    // sites this many tiles and up get a tower crane
  const SITE_FRAC     = 0.4;   // construction load, as a share of the customer's quoted peak
  const KW_PER_TILE   = 0.5;   // ...or, with no quote to go on, per footprint tile
  const KW_MAX        = 40;
  const UNPOWERED_SPEED = 0.35;  // on the crew's own diesel generator

  // Takes an entity or a bare footprint ({ width, height, isCabin }), so the
  // request card can quote it before anything is placed.
  function durationFor(e) {
    if (e.isCabin) return CABIN_SECS;
    const area = (e.width || 1) * (e.height || 1);
    return Math.min(SECS_MAX, SECS_BASE + SECS_PER_TILE * area);
  }
  // The site load for a customer quoting `peakKW` (house_request_system.js
  // quotedPeak), so a site never draws more than the building will.
  const siteKWFor = (peakKW) => Math.max(0.5, Math.round(peakKW * SITE_FRAC * 2) / 2);
  function drawFor(e) {
    if (e._siteKW != null) return e._siteKW;
    return Math.min(KW_MAX, Math.max(1, KW_PER_TILE * (e.width || 1) * (e.height || 1)));
  }
  // The load a site puts on its network right now: nothing while a suburb
  // lot is still waiting its turn.
  const drawW = (e) => e._constructing && (e._buildDone || 0) >= 0 ? drawFor(e) : 0;

  // "31s", "~4 min" — game seconds at normal speed.
  const formatSecs = (s) => s < 90 ? `${Math.round(s)}s` : `~${Math.round(s / 60)} min`;

  function start(e, delay = 0, siteKW = null) {
    e._constructing = true;
    e._buildTotal = durationFor(e);
    e._buildDone  = -delay;
    if (siteKW != null) e._siteKW = siteKW;
    e.powered = false;
  }

  const progress = (e) => !e._constructing ? 1 : Math.max(0, Math.min(1, (e._buildDone || 0) / (e._buildTotal || 1)));
  // At the speed it's building at now.
  const secondsLeft = (e) => {
    if (!e._constructing) return 0;
    const done = e._buildDone || 0, wait = Math.max(0, -done);
    return wait + Math.max(0, (e._buildTotal || 0) - Math.max(0, done)) / (e._sitePowered ? 1 : UNPOWERED_SPEED);
  };

  function _finish(e) {
    e._constructing = false;
    delete e._buildDone; delete e._buildTotal; delete e._sitePowered; delete e._siteKW;
    // Grace and the arrival moment run from here: nobody lived in it before.
    e._graceElapsed = 0;
    if (typeof DayNight !== 'undefined') e._movedIn = DayNight.getElapsed();
    // The scaffold comes down in a cloud of dust (drawing only, never saved).
    if (typeof GameLoop !== 'undefined' && GameLoop.animT) {
      const p = GridManager.tileToWorld(e.col, e.row);
      _finishFx.push({ x: p.x, y: p.y, w: e.width || 1, h: e.height || 1, tier: tierFor(e), seed: e.col * 92821 + e.row * 68917, t0: GameLoop.animT() });
    }
    // A suburb announces itself once, when its last lot is done.
    const fam = e.familyName;
    if (fam) for (const t of [T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL])
      for (const o of EntityRegistry.getByType(t)) if (o._constructing && o.familyName === fam) return;
    try { SFX.houseIn?.(); } catch (_e) {}
    // Announced next tick, once the power network has seen it finished and
    // decided whether it's lit (it runs before this system each frame).
    _toAnnounce.push({ name: _siteName(e), fam, e });
  }

  // Finished buildings waiting to be announced, and the "built but dark"
  // notes still up: each is cleared as soon as everything it covers has power
  // (or is gone).
  const _toAnnounce = [];
  const _darkNotes = [];
  const _finishFx = [];
  let _darkSeq = 0;

  const _members = (a) => {
    if (!a.fam) return [a.e];
    const out = [];
    for (const t of [T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL])
      for (const o of EntityRegistry.getByType(t)) if (o.familyName === a.fam) out.push(o);
    return out;
  };
  const _allLit = (list) => list.every(o => o.powered || !EntityRegistry.active().has(o));

  function _announce(a) {
    const members = _members(a);
    const e = a.e;
    const jump = () => Camera.recentreOn((e.col + (e.width || 1) / 2) * TILE, (e.row + (e.height || 1) / 2) * TILE);
    if (_allLit(members)) {
      showToast(`🏗 ${a.name} is built and powered up`, '#50e890', '#081408', '#206030', null, jump);
      return;
    }
    const id = NotificationStack.push({
      icon: '🏗', title: `${a.name} built — no power`,
      message: 'Construction is complete, but it isn\'t getting power yet. Connect it to your grid. Click to jump there',
      color: '#f0c040', border: '#604010', tag: `built-dark-${++_darkSeq}`, important: true,
      onClick: jump,
    });
    if (id) _darkNotes.push({ id, members });
  }

  // What gets built on site: customers, and the civic buildings the council
  // puts up (government_system.js placeGovBuilding).
  let _siteTypes = null;
  const siteTypes = () => _siteTypes || (_siteTypes = [T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL,
    T.TOWNHALL, T.CIVICCENTER, T.COURTHOUSE, T.EMS, T.HOSPITAL, T.UNIVERSITY, T.TRANSPORTHUB]);
  const _siteName = (e) => e._isGov ? (EntityDefs[e.type]?.label || 'Civic building') : e.familyName || e.businessName || 'New building';

  // dt in game seconds.
  function tick(dt) {
    if (dt <= 0) return;
    while (_toAnnounce.length) _announce(_toAnnounce.shift());
    for (let i = _darkNotes.length - 1; i >= 0; i--) {
      if (!_allLit(_darkNotes[i].members)) continue;
      NotificationStack.dismiss(_darkNotes[i].id);
      _darkNotes.splice(i, 1);
    }
    for (const t of siteTypes()) {
      for (const e of EntityRegistry.getByType(t)) {
        if (!e._constructing) continue;
        // A lot still waiting its turn counts down at full speed regardless.
        const waiting = (e._buildDone || 0) < 0;
        e._buildDone = (e._buildDone || 0) + dt * (waiting || e._sitePowered ? 1 : UNPOWERED_SPEED);
        if (e._buildDone >= e._buildTotal) _finish(e);
      }
    }
  }

  // ── Drawing ───────────────────────────────────────────────────────
  // Tiles go up bottom row first, snaking along the rows: left to right on
  // the bottom one, right to left on the next, and so on, so the work only
  // ever moves on to the tile beside it (it used to jump back across the
  // whole plot at the end of every row). Finished
  // tiles show the real building (unpowered, so shut); the tile being
  // worked on shows it rising course by course behind scaffolding; the
  // rest of the plot is the site — groundworks, plant, materials, clutter
  // and the crew, more of all of it the bigger the job (tierFor).
  const _h = (a, b) => {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  function _tileAt(i, w, h) {
    const rb = Math.floor(i / w), k = i % w;
    return { c: rb % 2 === 0 ? k : w - 1 - k, r: h - 1 - rb };
  }
  // The other way round: which tile number (build order) a column and a
  // row counted from the top is.
  function _idxAt(c, r, w, h) {
    const rb = h - 1 - r;
    return rb * w + (rb % 2 === 0 ? c : w - 1 - c);
  }
  const _ease = (u) => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);

  // Small drawing helpers.
  const _r = (ctx, c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const _ell = (ctx, c, x, y, rx, ry, rot = 0) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); };
  // Ground shadow under a prop, thrown down and right like the town's own.
  const _shadow = (ctx, x, y, w, h = 1.8) => _r(ctx, 'rgba(0,0,0,0.22)', x + 1.5, y, w, h);

  // ── The ground ────────────────────────────────────────────────────
  const SOIL = ['#7a5c3c', '#71553a', '#836442', '#6c4f33'];
  function _pad(ctx, x, y, w, h, seed, wet) {
    const W = w * TILE, H = h * TILE;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, W, H); ctx.clip();
    _r(ctx, SOIL[0], x, y, W, H);
    // Patches of differently-turned soil, a few per tile.
    for (let i = 0; i < w * h; i++) {
      const k = _h(seed, i + 300);
      if (k > 0.6) continue;
      const c = i % w, r = Math.floor(i / w);
      _ell(ctx, SOIL[1 + Math.floor(k * 5) % 3],
        x + (c + 0.2 + 0.6 * _h(seed, i + 301)) * TILE, y + (r + 0.2 + 0.6 * _h(seed, i + 302)) * TILE,
        TILE * (0.25 + 0.3 * _h(seed, i + 303)), TILE * (0.16 + 0.2 * _h(seed, i + 304)), _h(seed, i + 305) * 3);
    }
    // Gravel, stones and clods.
    const grit = Math.min(700, w * h * 12);
    for (let i = 0; i < grit; i++) {
      const s = _h(seed, i + 7);
      ctx.fillStyle = s < 0.3 ? 'rgba(205,195,175,0.5)' : s < 0.7 ? 'rgba(40,26,12,0.3)' : 'rgba(150,120,90,0.45)';
      ctx.fillRect(x + _h(seed, i) * W, y + _h(seed, i + 97) * H, 0.7 + s * 1.6, 0.7 + s * 0.8);
    }
    // Tyre tracks: a pair of ruts curving in from the street side.
    ctx.strokeStyle = 'rgba(45,30,15,0.32)'; ctx.lineWidth = 1.6; ctx.setLineDash([2, 1.4]);
    const r0 = x + W * (0.25 + 0.5 * _h(seed, 41)), bend = (_h(seed, 42) - 0.5) * W * 0.6;
    for (const off of [-3.6, 3.6]) {
      ctx.beginPath(); ctx.moveTo(r0 + off, y + H);
      ctx.quadraticCurveTo(r0 + off, y + H * 0.45, r0 + bend + off, y + H * 0.12); ctx.stroke();
    }
    ctx.setLineDash([]);
    // Puddles, and more of them while it's raining.
    const np = Math.max(1, Math.round(w * h / 8)) * (wet ? 3 : 1);
    for (let i = 0; i < np; i++) {
      if (!wet && _h(seed, i + 60) < 0.5) continue;
      const px = x + (0.1 + 0.8 * _h(seed, i + 61)) * W, py = y + (0.1 + 0.8 * _h(seed, i + 62)) * H, rx = 3 + 4 * _h(seed, i + 63);
      _ell(ctx, 'rgba(60,50,40,0.35)', px + 0.6, py + 0.4, rx + 0.8, rx * 0.5);
      _ell(ctx, wet ? 'rgba(80,100,120,0.65)' : 'rgba(70,88,105,0.5)', px, py, rx, rx * 0.45);
      _ell(ctx, 'rgba(210,225,240,0.3)', px - rx * 0.3, py - rx * 0.12, rx * 0.4, rx * 0.12);
      if (wet) {   // rings from the rain landing
        const ph = (Date.now() / 900 + i * 0.37) % 1;
        ctx.strokeStyle = `rgba(220,235,250,${(0.5 * (1 - ph)).toFixed(2)})`; ctx.lineWidth = 0.4;
        ctx.beginPath(); ctx.ellipse(px + rx * 0.2, py, rx * 0.5 * ph + 0.3, rx * 0.22 * ph + 0.15, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Before work starts: the plot set out with pegs and string, flagged at
  // the corners and squared up with diagonals.
  function _stakes(ctx, x, y, w, h) {
    const W = w * TILE, H = h * TILE;
    ctx.strokeStyle = 'rgba(255,240,200,0.6)'; ctx.lineWidth = 0.5;
    ctx.strokeRect(x + 3, y + 3, W - 6, H - 6);
    ctx.strokeStyle = 'rgba(255,240,200,0.22)';
    ctx.beginPath(); ctx.moveTo(x + 3, y + 3); ctx.lineTo(x + W - 3, y + H - 3); ctx.moveTo(x + W - 3, y + 3); ctx.lineTo(x + 3, y + H - 3); ctx.stroke();
    const peg = (px, py, flag) => {
      _r(ctx, 'rgba(0,0,0,0.25)', px - 0.2, py, 2.2, 0.8);
      _r(ctx, '#c8a070', px - 0.8, py - 4, 1.6, 4); _r(ctx, '#e8c890', px - 0.8, py - 4, 0.6, 4);
      if (flag) { ctx.fillStyle = '#ff6a20'; ctx.beginPath(); ctx.moveTo(px + 0.8, py - 4); ctx.lineTo(px + 4.2, py - 3.2); ctx.lineTo(px + 0.8, py - 2.3); ctx.fill(); }
    };
    for (let c = 0; c <= w; c++) { const px = x + 3 + c * (W - 6) / w; peg(px, y + 3, c === 0 || c === w); peg(px, y + H - 3, c === 0 || c === w); }
    for (let r = 1; r < h; r++) { const py = y + 3 + r * (H - 6) / h; peg(x + 3, py, false); peg(x + W - 3, py, false); }
  }

  // ── How big a job it is ───────────────────────────────────────────
  // 0 a home: a timber scaffold and a couple of hands.
  // 1 a shop or office: steel scaffold, a slab poured ahead, a mixer, a
  //   pickup, barrier tape round the plot, a site toilet and a skip.
  // 2 a big building: a tower crane, the steel frame going up ahead of the
  //   crew, a dug foundation with rebar and an excavator in it, a site
  //   office, a dump truck, welders, safety netting.
  // 3 a landmark: all that, a second crane, a flatbed of steel, floodlights.
  // Industry and civic buildings are a tier heavier than their footprint
  // alone says.
  function tierFor(e) {
    const area = (e.width || 1) * (e.height || 1);
    let tier = area <= 4 ? 0 : area <= 16 ? 1 : area <= 48 ? 2 : 3;
    if (e.type === T.INDUSTRIAL || e._isGov) tier = Math.min(3, tier + 1);
    return tier;
  }
  const CREW_BY_TIER = [2, 4, 6, 8];

  // ── The work ──────────────────────────────────────────────────────
  function _scaffold(ctx, tx, ty, frac, t, tier) {
    const top = ty + TILE * (1 - Math.max(0.15, frac));
    const tube = tier === 0 ? '#a8804a' : '#a4aeb6', dk = tier === 0 ? '#7a5a30' : '#646e76';
    const posts = [tx + 2, tx + TILE / 2, tx + TILE - 2];
    const ht = ty + TILE - top + 3;
    // Standards, lit on one side, on their base plates.
    for (const sx of posts) {
      _r(ctx, tube, sx - 0.6, top - 3, 0.7, ht); _r(ctx, dk, sx + 0.1, top - 3, 0.6, ht);
      _r(ctx, '#3a3e42', sx - 1.3, ty + TILE - 1, 2.6, 1);
    }
    // Ledgers every lift, clamped to the standards.
    for (let ly = ty + TILE - 6; ly >= top - 2; ly -= 6) {
      _r(ctx, tube, tx + 1, ly, TILE - 2, 0.6); _r(ctx, dk, tx + 1, ly + 0.6, TILE - 2, 0.3);
      if (tier > 0) for (const sx of posts) _r(ctx, '#3a3e42', sx - 0.9, ly - 0.3, 1.8, 1.3);
    }
    ctx.strokeStyle = tube; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(posts[0], ty + TILE); ctx.lineTo(posts[1], top);
    if (tier > 0) { ctx.moveTo(posts[1], ty + TILE); ctx.lineTo(posts[2], top); }
    ctx.stroke();
    // Boards on the working lift — planks with the gaps between them — and
    // the toe board along the front.
    _r(ctx, '#c49454', tx + 1, top - 3.2, TILE - 2, 2);
    for (let bx = tx + 7; bx < tx + TILE - 2; bx += 7) _r(ctx, 'rgba(0,0,0,0.3)', bx, top - 3.2, 0.5, 2);
    _r(ctx, '#8a6030', tx + 1, top - 1.2, TILE - 2, 0.7);
    // A ladder up the side.
    const lx = tx + TILE - 7.5;
    ctx.strokeStyle = '#d0aa58'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(lx, ty + TILE); ctx.lineTo(lx, top - 7); ctx.moveTo(lx + 3, ty + TILE); ctx.lineTo(lx + 3, top - 7);
    for (let ry = ty + TILE - 2; ry > top - 6; ry -= 2.4) { ctx.moveTo(lx, ry); ctx.lineTo(lx + 3, ry); }
    ctx.stroke();
    // A bucket, a mortar board and a bag on the boards.
    _r(ctx, '#2e3236', tx + 5, top - 6.4, 2.8, 3.2); _r(ctx, '#8a8e92', tx + 5, top - 6.4, 2.8, 0.6);
    _r(ctx, '#8a7a60', tx + 10, top - 4.4, 4.4, 1.2); _r(ctx, '#b8b0a0', tx + 10.8, top - 5, 2.6, 0.8);
    _r(ctx, '#e0d8c4', tx + 17, top - 5.4, 3.6, 2.2); _r(ctx, '#a8a090', tx + 17, top - 3.6, 3.6, 0.4);
    // Big jobs hang green safety netting over the face.
    if (tier >= 2) {
      _r(ctx, 'rgba(60,140,80,0.26)', tx + 1, top - 3, TILE - 2, ht);
      ctx.strokeStyle = 'rgba(30,90,50,0.35)'; ctx.lineWidth = 0.3; ctx.beginPath();
      for (let mx = tx + 3; mx < tx + TILE - 1; mx += 2.5) { ctx.moveTo(mx, top - 3); ctx.lineTo(mx, ty + TILE); }
      for (let my = top; my < ty + TILE; my += 2.5) { ctx.moveTo(tx + 1, my); ctx.lineTo(tx + TILE - 1, my); }
      ctx.stroke();
    }
    // A grinding spark now and then.
    if (Math.sin(t * 7 + tx) > 0.85) {
      _r(ctx, '#fff4b0', tx + TILE * 0.6, top + 2, 1.5, 1.5);
      _r(ctx, '#ffd860', tx + TILE * 0.6 + 2, top + 0.5, 1, 1);
    }
  }

  // Topping out: a small evergreen lashed to the top of the last scaffold,
  // and a pennant flapping beside it.
  function _toppingOut(ctx, tx, ty, frac, t, seed) {
    const top = ty + TILE * (1 - Math.max(0.15, frac)) - 3;
    const bx = tx + TILE / 2;
    _r(ctx, '#6a4a28', bx - 0.4, top - 9, 0.8, 9);
    ctx.fillStyle = '#2f6a3a';
    ctx.beginPath(); ctx.moveTo(bx, top - 14); ctx.lineTo(bx - 3.2, top - 8); ctx.lineTo(bx + 3.2, top - 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3c8048';
    ctx.beginPath(); ctx.moveTo(bx, top - 12); ctx.lineTo(bx - 2.4, top - 7.5); ctx.lineTo(bx + 2.4, top - 7.5); ctx.closePath(); ctx.fill();
    const fx = tx + TILE - 4;
    _r(ctx, '#8a8e92', fx, top - 12, 0.6, 12);
    const wave = Math.sin(t * 6 + seed) * 0.8;
    ctx.fillStyle = (Math.floor(seed) % 2) ? '#d83a2a' : '#2a6ad8';
    ctx.beginPath(); ctx.moveTo(fx + 0.6, top - 12); ctx.quadraticCurveTo(fx + 3.5, top - 11 + wave, fx + 6.5, top - 10.5 + wave * 1.5);
    ctx.lineTo(fx + 0.6, top - 8.5); ctx.closePath(); ctx.fill();
  }

  // How high each block-wide column of the tile going up has got: the wall
  // rises in 2px courses, some columns a course or two ahead of the rest,
  // so its top is ragged like real blockwork rather than a straight wipe.
  // The lead closes up as the tile tops out, so every column only ever
  // rises and they all meet at the top.
  const COLS = 8, COURSE = 2, LEAD = 8;
  function _courses(i, frac, seed) {
    const out = [];
    for (let k = 0; k < COLS; k++) {
      const hk = TILE * frac + LEAD * _h(seed + i * 31, k) * (1 - frac);
      out.push(Math.min(TILE, Math.floor(hk / COURSE) * COURSE));
    }
    return out;
  }

  // The fresh courses at the top of the wall going up: raw blockwork with
  // its mortar joints, before the building's own finish reaches it.
  function _blockwork(ctx, tx, ty, heights) {
    const cw = TILE / COLS, base = ty + TILE;
    for (let k = 0; k < COLS; k++) {
      const hk = heights[k];
      if (hk <= 0) continue;
      const x0 = tx + k * cw, top = base - hk, bh = Math.min(6, hk);
      _r(ctx, '#aeaca4', x0, top, cw, bh);
      ctx.fillStyle = 'rgba(70,70,64,0.5)';
      for (let row = 0; row * COURSE < bh; row++) {
        const yy = top + row * COURSE, course = Math.round((base - yy) / COURSE);
        ctx.fillRect(x0, yy + 1.7, cw, 0.3);
        ctx.fillRect(x0 + (course % 2) * cw / 2, yy, 0.3, COURSE);   // joints staggered course to course
      }
      _r(ctx, 'rgba(255,255,255,0.3)', x0, top, cw, 0.5);
      // A step down to the next column throws a little shadow on it.
      if (k + 1 < COLS && heights[k + 1] < hk) _r(ctx, 'rgba(0,0,0,0.2)', x0 + cw, top, 0.6, hk - heights[k + 1]);
      _r(ctx, 'rgba(0,0,0,0.18)', x0, top + bh, cw, 0.8);   // where the finish starts below
    }
  }

  // Poured slab in its timber formwork, starter bars standing up where the
  // columns go; the freshest one still has the wet sheen on it.
  function _slab(ctx, tx, ty, fresh) {
    _r(ctx, '#8a6a40', tx + 0.5, ty + 0.5, TILE - 1, TILE - 1);
    _r(ctx, '#6a5030', tx + 0.5, ty + TILE - 1.5, TILE - 1, 1);
    _r(ctx, fresh ? '#9a968e' : '#b0aca4', tx + 2, ty + 2, TILE - 4, TILE - 4);
    if (fresh) { _r(ctx, 'rgba(255,255,255,0.14)', tx + 4, ty + 4, TILE * 0.45, 2); _r(ctx, 'rgba(255,255,255,0.08)', tx + 6, ty + 8, TILE * 0.3, 1.2); }
    ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(tx + 2, ty + TILE / 2, TILE - 4, 0.5); ctx.fillRect(tx + TILE / 2, ty + 2, 0.5, TILE - 4);
    ctx.fillStyle = '#7a4a2a';
    for (const [sx, sy] of [[4, 4], [TILE - 7, 4], [4, TILE - 7], [TILE - 7, TILE - 7]])
      for (const [ox, oy] of [[0, 0], [1.6, 0], [0, 1.6], [1.6, 1.6]]) ctx.fillRect(tx + sx + ox, ty + sy + oy, 0.8, 0.8);
  }

  // The steel frame standing ahead of the crew: I-section columns on base
  // plates, bolted floor beams, cross-bracing in the bay. Some members are
  // still in red primer. `rise` is how far up it's got.
  function _frame(ctx, tx, ty, rise, primer) {
    const top = ty + TILE - TILE * 0.85 * rise;
    const steel = primer ? '#9a4a32' : '#5e6a74', edge = primer ? '#6a2a1a' : '#38424a', lit = primer ? '#c06a4a' : '#7a8892';
    ctx.strokeStyle = steel; ctx.lineWidth = 0.6;
    const by = Math.max(top, ty + TILE - 12);
    ctx.beginPath(); ctx.moveTo(tx + 3, ty + TILE - 1); ctx.lineTo(tx + TILE - 4, by); ctx.moveTo(tx + TILE - 4, ty + TILE - 1); ctx.lineTo(tx + 3, by); ctx.stroke();
    for (const sx of [tx + 3, tx + TILE - 4]) {
      _r(ctx, '#3a3e42', sx - 1.9, ty + TILE - 2, 4, 1.4);
      _r(ctx, steel, sx - 1, top, 2.2, ty + TILE - 1 - top);
      _r(ctx, lit, sx - 1, top, 0.5, ty + TILE - 1 - top); _r(ctx, edge, sx + 0.8, top, 0.4, ty + TILE - 1 - top);
    }
    for (let ly = ty + TILE - 12; ly >= top; ly -= 11) {
      _r(ctx, steel, tx + 3, ly, TILE - 6, 1.8);
      _r(ctx, lit, tx + 3, ly, TILE - 6, 0.4); _r(ctx, edge, tx + 3, ly + 1.4, TILE - 6, 0.4);
      ctx.fillStyle = '#22262a';
      for (const bx of [tx + 3.8, tx + 5.2, tx + TILE - 6.2, tx + TILE - 4.8]) ctx.fillRect(bx, ly + 0.6, 0.6, 0.6);
    }
  }

  // Foundation dug out: sheet piling round the edge with its shadow, the
  // rebar mat on its chairs, groundwater pooled in a low corner.
  function _pit(ctx, x0, y0, wpx, hpx, seed) {
    _r(ctx, 'rgba(40,24,10,0.40)', x0, y0, wpx, hpx);
    _r(ctx, 'rgba(0,0,0,0.25)', x0, y0, wpx, 3.5);
    _r(ctx, 'rgba(0,0,0,0.15)', x0, y0, 3, hpx);
    ctx.fillStyle = '#6a7076';
    for (let px = x0; px < x0 + wpx; px += 3) ctx.fillRect(px, y0, 2, 1.6);
    for (let py = y0; py < y0 + hpx; py += 3) { ctx.fillRect(x0, py, 1.6, 2); ctx.fillRect(x0 + wpx - 1.6, py, 1.6, 2); }
    ctx.strokeStyle = 'rgba(160,96,52,0.6)'; ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let gx = x0 + 6; gx < x0 + wpx - 4; gx += 6) { ctx.moveTo(gx, y0 + 6); ctx.lineTo(gx, y0 + hpx - 3); }
    for (let gy = y0 + 6; gy < y0 + hpx - 3; gy += 6) { ctx.moveTo(x0 + 5, gy); ctx.lineTo(x0 + wpx - 5, gy); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(90,60,30,0.7)';
    for (let gx = x0 + 6; gx < x0 + wpx - 4; gx += 12) for (let gy = y0 + 6; gy < y0 + hpx - 3; gy += 12) ctx.fillRect(gx - 0.6, gy - 0.6, 1.2, 1.2);
    if (hpx > TILE) {
      const wx = x0 + wpx * (0.2 + 0.6 * _h(seed, 71)), wy = y0 + 8;
      _ell(ctx, 'rgba(70,88,100,0.55)', wx, wy, 7, 2.6);
      _ell(ctx, 'rgba(200,220,235,0.25)', wx - 2, wy - 0.6, 2.5, 0.7);
    }
  }

  // Red-and-white barrier tape on posts round the plot, cones at the corners.
  function _tape(ctx, x, y, w, h) {
    const W = w * TILE, H = h * TILE;
    ctx.lineWidth = 0.9;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#ece8e0'; ctx.strokeRect(x + 1, y + 1, W - 2, H - 2);
    ctx.lineDashOffset = 3; ctx.strokeStyle = '#d83a2a'; ctx.strokeRect(x + 1, y + 1, W - 2, H - 2);
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    const post = (px, py) => { _r(ctx, 'rgba(0,0,0,0.2)', px, py + 1.5, 2.4, 0.8); _r(ctx, '#e07020', px - 1, py - 1, 2, 2.6); _r(ctx, '#f4f0e6', px - 1, py, 2, 0.6); };
    for (let px = 0; px <= W; px += TILE) { post(x + px, y + 0.5); post(x + px, y + H - 1.5); }
    for (let py = TILE; py < H; py += TILE) { post(x + 1, y + py); post(x + W - 1, y + py); }
    for (const [cx, cy] of [[x + 4, y + H - 3], [x + W - 4, y + H - 3]]) _cone(ctx, cx, cy);
  }
  function _cone(ctx, cx, cy) {
    _r(ctx, 'rgba(0,0,0,0.22)', cx - 1.5, cy, 4.4, 1);
    _r(ctx, '#2a2a2a', cx - 2.2, cy - 0.8, 4.4, 0.9);
    ctx.fillStyle = '#ff6a1a'; ctx.beginPath(); ctx.moveTo(cx - 1.7, cy - 0.8); ctx.lineTo(cx, cy - 6); ctx.lineTo(cx + 1.7, cy - 0.8); ctx.closePath(); ctx.fill();
    _r(ctx, '#f4f2ea', cx - 1.05, cy - 3.6, 2.1, 0.9);
  }

  // ── Plant, kit and clutter ────────────────────────────────────────
  function _materials(ctx, px, py, seed) {
    _shadow(ctx, px - 9, py - 0.5, 20);
    // A pallet of bricks, shrink-wrapped.
    _r(ctx, '#6a4a28', px - 9, py - 1.6, 9, 1.6); _r(ctx, '#4a3218', px - 9, py - 0.6, 9, 0.6);
    _r(ctx, '#a8503a', px - 8.5, py - 7.6, 8, 6);
    ctx.fillStyle = 'rgba(60,20,10,0.45)';
    for (let r = 0; r < 4; r++) {
      ctx.fillRect(px - 8.5, py - 7.6 + r * 1.5 + 1.2, 8, 0.3);
      for (let bx = (r % 2) * 1.3; bx < 8; bx += 2.6) ctx.fillRect(px - 8.5 + bx, py - 7.6 + r * 1.5, 0.3, 1.5);
    }
    _r(ctx, '#c86848', px - 8.5, py - 7.6, 8, 0.6);
    _r(ctx, 'rgba(255,255,255,0.2)', px - 8.2, py - 7.4, 1.8, 5.6);
    // Timber on bearers, the end grain showing.
    _r(ctx, '#4a3218', px + 2, py - 1, 1, 1); _r(ctx, '#4a3218', px + 7, py - 1, 1, 1);
    for (let i = 0; i < 4; i++) {
      const yy = py - 2.4 - i * 1.5;
      _r(ctx, '#d8b070', px + 1, yy, 8, 1.3); _r(ctx, '#b08848', px + 1, yy + 1, 8, 0.3); _r(ctx, '#f0d8a0', px + 8.4, yy, 0.8, 1.3);
    }
    // Cement bags.
    if (_h(seed, 3) < 0.6) for (let i = 0; i < 2; i++) {
      _r(ctx, '#ddd8cc', px + 10 + i * 0.4, py - 2.6 - i * 2, 3.6, 2.2);
      _r(ctx, '#a8a498', px + 10 + i * 0.4, py - 0.6 - i * 2, 3.6, 0.4);
      _r(ctx, '#3a6aa8', px + 11 + i * 0.4, py - 2 - i * 2, 1.6, 0.8);
    }
  }

  // A mixing drum lying along its local x axis — closed end at +x, mouth at
  // -x — drawn about the current origin. Barrel body, a cone narrowing to
  // the mouth, lit along the top and shaded underneath, with spiral fins
  // that slide across it as it turns.
  function _drum(ctx, len, dia, mouth, t, col, colLit, colDk) {
    const body = len * 0.55, cone = len - body;           // rear barrel, front cone
    const r = dia / 2, m = mouth / 2, x0 = -len / 2, xb = x0 + cone, x1 = len / 2;
    ctx.fillStyle = colDk;
    ctx.beginPath(); ctx.ellipse(x1, 0, r * 0.35, r, 0, -Math.PI / 2, Math.PI / 2); ctx.fill();   // the rounded back end
    const shape = () => { ctx.beginPath(); ctx.moveTo(x0, -m); ctx.lineTo(xb, -r); ctx.lineTo(x1, -r); ctx.lineTo(x1, r); ctx.lineTo(xb, r); ctx.lineTo(x0, m); ctx.closePath(); };
    ctx.fillStyle = col; shape(); ctx.fill();
    ctx.save(); shape(); ctx.clip();
    ctx.fillStyle = colLit; ctx.fillRect(x0, -r, len, r * 0.55);                  // light along the top
    ctx.fillStyle = colDk;  ctx.fillRect(x0, r * 0.45, len, r * 0.6);             // shade underneath
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.7;              // fins turning
    for (let i = 0; i < 3; i++) {
      const s = ((t * 0.9 + i / 3) % 1) * (len + 4) + x0 - 2;
      ctx.beginPath(); ctx.moveTo(s, -r); ctx.lineTo(s + r * 0.9, r); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(xb - 0.3, -r, 0.6, dia);   // the seam where the cone meets the barrel
    ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.ellipse(x0, 0, Math.max(0.6, m * 0.35), m, 0, 0, Math.PI * 2); ctx.fill();   // the mouth
    ctx.fillStyle = '#7a7672'; ctx.beginPath(); ctx.ellipse(x0 + 0.2, 0.3, Math.max(0.3, m * 0.18), m * 0.55, 0, 0, Math.PI * 2); ctx.fill();   // concrete inside
  }

  // A towable site mixer, side on: drum tipped up on its yoke, motor box,
  // one wheel, a leg at the back and the tow bar out front.
  function _mixer(ctx, px, py, t) {
    _shadow(ctx, px - 8, py - 0.4, 15, 1.4);
    _r(ctx, '#3a3e42', px - 6, py - 3.2, 10, 1.2);                     // chassis rail
    ctx.strokeStyle = '#3a3e42'; ctx.lineWidth = 0.8; ctx.beginPath();
    ctx.moveTo(px - 6, py - 2.8); ctx.lineTo(px - 11, py - 1.4);        // tow bar
    ctx.moveTo(px + 3.5, py - 2.4); ctx.lineTo(px + 4.2, py);           // stand leg
    ctx.stroke();
    _r(ctx, '#2a2a2a', px - 11.6, py - 1.8, 1.4, 1.4);                  // hitch eye
    _r(ctx, '#3a3e42', px + 3.2, py - 0.4, 2, 0.6);                     // leg foot
    _ell(ctx, '#151515', px - 2.5, py - 1.9, 1.9, 1.9);                 // wheel
    _ell(ctx, '#8a8e92', px - 2.5, py - 1.9, 0.8, 0.8);
    _r(ctx, '#5a5e62', px + 0.6, py - 6.6, 4.4, 3.4);                   // motor box
    _r(ctx, '#7a7e82', px + 0.6, py - 6.6, 4.4, 0.7);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (let i = 0; i < 3; i++) ctx.fillRect(px + 1.2 + i * 1.3, py - 5.4, 0.5, 2);
    _r(ctx, '#3a3e42', px - 3, py - 8.4, 1.2, 5.2);                     // yoke post
    ctx.save();
    ctx.translate(px - 2.2, py - 9.4); ctx.rotate(0.55);               // mouth up and to the left
    try { _drum(ctx, 10, 6.6, 3.4, t, '#e8781e', '#ffa050', '#b04e10'); } finally { ctx.restore(); }
    _r(ctx, '#d8d0b8', px - 9.5, py - 3.4, 2.8, 2.4); _r(ctx, '#a8a090', px - 9.5, py - 1.4, 2.8, 0.4);   // a bag waiting by it
  }

  // A concrete mixer truck, side on, cab facing right: the drum turning on
  // the back, tipped up toward the rear, with the chute hung under its mouth.
  function _mixerTruck(ctx, px, py, t, seed) {
    const L = 30, x0 = px - L / 2;
    _shadow(ctx, x0, py - 0.4, L, 1.8);
    _r(ctx, '#2e3236', x0 + 1, py - 4.4, L - 2, 1.6);                   // chassis
    for (const wx of [x0 + 5, x0 + 9.4, x0 + L - 5]) { _ell(ctx, '#151515', wx, py - 2, 2.2, 2.2); _ell(ctx, '#8a8e92', wx, py - 2, 0.9, 0.9); }
    // Cab.
    const cx = x0 + L - 9;
    _r(ctx, '#e8e8e4', cx, py - 11.6, 8.4, 7.4); _r(ctx, '#c8c8c4', cx, py - 5.4, 8.4, 1.2);
    _r(ctx, '#2a5a9a', cx, py - 7, 8.4, 0.9);                            // livery stripe
    _r(ctx, '#5a8ab0', cx + 3.8, py - 10.8, 4, 3.2); _r(ctx, 'rgba(255,255,255,0.4)', cx + 4.2, py - 10.6, 1.2, 2.4);   // windscreen
    _r(ctx, '#3a3e42', cx + 8.2, py - 6, 0.9, 1.6);                      // bumper
    _r(ctx, '#ffd860', cx + 8.2, py - 7.6, 0.7, 0.9);                    // headlamp
    _r(ctx, '#e0a818', cx + 2, py - 12.4, 2.4, 0.8);                     // roof beacon
    if (Math.sin(t * 6 + seed) > 0) _ell(ctx, 'rgba(255,190,40,0.45)', cx + 3.2, py - 12.2, 2.2, 1.4);
    // Drum on its frame.
    _r(ctx, '#3a3e42', x0 + 3, py - 8, 1.2, 3.6); _r(ctx, '#3a3e42', x0 + 15, py - 9.4, 1.2, 5);
    ctx.save();
    ctx.translate(x0 + 10, py - 10.4); ctx.rotate(0.22);               // mouth to the rear, tipped up
    try { _drum(ctx, 15, 8.4, 4, t, '#d8d4cc', '#f4f2ec', '#a8a49c'); } finally { ctx.restore(); }
    _r(ctx, '#e0a818', x0 + 6.5, py - 12.6, 6, 0.9);                     // a band of livery round the drum
    // Chute folded down at the back, with its hopper.
    ctx.strokeStyle = '#6a6e72'; ctx.lineWidth = 1.1; ctx.beginPath();
    ctx.moveTo(x0 + 2.2, py - 12); ctx.lineTo(x0 - 1.5, py - 6.5); ctx.stroke();
    _r(ctx, '#5a5e62', x0 + 1, py - 14.4, 3, 2);
  }

  function _office(ctx, px, py, dark) {
    const W = TILE * 1.5, H = 11;
    _shadow(ctx, px - W / 2, py - 0.5, W, 2.4);
    _r(ctx, '#3a3e42', px - W / 2 + 1, py - 1.5, 2, 1.5); _r(ctx, '#3a3e42', px + W / 2 - 3, py - 1.5, 2, 1.5);   // jacks
    _r(ctx, '#ece8dc', px - W / 2, py - H, W, H - 1.5);
    _r(ctx, '#c8c4b8', px - W / 2, py - 3, W, 1.5);
    ctx.fillStyle = 'rgba(0,0,0,0.06)'; for (let sx = px - W / 2 + 3; sx < px + W / 2; sx += 3) ctx.fillRect(sx, py - H + 2, 0.4, H - 4);   // ribbed cladding
    _r(ctx, '#2a5a9a', px - W / 2, py - H, W, 2);
    _r(ctx, '#1e4070', px - W / 2, py - H + 1.6, W, 0.4);
    const lit = dark > 0.35;
    for (let i = 0; i < 3; i++) {
      const wx = px - W / 2 + 4 + i * 11;
      _r(ctx, '#5a6066', wx - 0.4, py - H + 3.6, 7.8, 3.8);
      _r(ctx, lit ? '#ffe0a0' : '#6a8aaa', wx, py - H + 4, 7, 3);
      if (!lit) _r(ctx, 'rgba(255,255,255,0.35)', wx + 0.6, py - H + 4.3, 2, 0.6);
    }
    if (lit) _ell(ctx, 'rgba(255,224,160,0.15)', px, py + 2, W * 0.5, 4);
    _r(ctx, '#4a4e52', px + W / 2 - 6, py - 8.5, 3.4, 7);             // door
    _r(ctx, '#c8ccd0', px + W / 2 - 3.4, py - 5, 0.5, 0.5);
    _r(ctx, '#7a7e82', px + W / 2 - 7, py - 1.5, 5.4, 0.8); _r(ctx, '#7a7e82', px + W / 2 - 6.5, py - 0.7, 4.4, 0.8);   // steps
    _r(ctx, '#d8dcdc', px - W / 2 + 2, py - H - 2, 4, 2); _r(ctx, '#8a8e92', px - W / 2 + 2.6, py - H - 1.6, 2.8, 1.2);   // AC unit
    if (Camera.zoom > 1.2) {
      ctx.fillStyle = '#f4f0e6'; ctx.font = 'bold 1.5px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('SITE OFFICE', px - 4, py - H + 1.5); ctx.textAlign = 'left';
    }
  }

  function _rebar(ctx, px, py) {
    _shadow(ctx, px - 10, py - 0.5, 21);
    _r(ctx, '#5a3e22', px - 9, py - 1.6, 3, 1.6); _r(ctx, '#5a3e22', px + 6, py - 1.6, 3, 1.6);
    for (let i = 0; i < 5; i++) {
      _r(ctx, '#9a5a32', px - 10.5, py - 2.6 - i * 1.05, 21, 0.75);
      _r(ctx, '#6a3a1e', px - 10.5, py - 2.1 - i * 1.05, 21, 0.25);
    }
    _r(ctx, '#e8e040', px - 1, py - 7.4, 1.4, 1.8);                   // the bundle's tag
    _r(ctx, '#5e6a74', px - 10, py - 9.6, 20, 2.2); _r(ctx, '#7a8892', px - 10, py - 9.6, 20, 0.5);
    _r(ctx, '#38424a', px - 10, py - 7.8, 20, 0.4);
  }

  function _potty(ctx, px, py) {
    _shadow(ctx, px - 3, py - 0.5, 6.5);
    _r(ctx, '#2a6ab8', px - 3, py - 10, 6, 10); _r(ctx, '#1e5090', px + 1.5, py - 10, 1.5, 10);
    _r(ctx, '#e8e8e4', px - 3.4, py - 11, 6.8, 1.4);
    _r(ctx, '#1e4a80', px - 2.2, py - 8.6, 3.4, 8); _r(ctx, '#e8e8e4', px - 1.6, py - 7.6, 2.2, 0.8);
    _r(ctx, '#40c050', px + 0.2, py - 5, 0.8, 0.5);                   // VACANT
    _r(ctx, '#d8d8d4', px - 2.6, py - 11.6, 1.6, 0.6);                // roof vent
  }

  function _skip(ctx, px, py, seed) {
    _shadow(ctx, px - 8, py - 0.5, 17, 2);
    ctx.fillStyle = '#e0a818'; ctx.beginPath();
    ctx.moveTo(px - 9, py - 7); ctx.lineTo(px + 9, py - 7); ctx.lineTo(px + 7, py); ctx.lineTo(px - 7, py); ctx.closePath(); ctx.fill();
    _r(ctx, '#b88410', px - 9, py - 7, 18, 0.8);
    _r(ctx, 'rgba(0,0,0,0.18)', px + 3, py - 6, 0.6, 5.5); _r(ctx, 'rgba(0,0,0,0.18)', px - 3.6, py - 6, 0.6, 5.5);
    // rubble heaped above the rim
    const chunk = ['#8a8680', '#a8503a', '#c8b898', '#6a5a4a', '#d8d4cc'];
    for (let i = 0; i < 9; i++) _r(ctx, chunk[i % chunk.length], px - 7.5 + _h(seed, i + 80) * 14, py - 9 + _h(seed, i + 81) * 2.4, 1.6 + _h(seed, i + 82) * 1.8, 1.4);
    _r(ctx, '#c49454', px - 2, py - 10.2, 7, 0.9);                    // a broken plank sticking up
  }

  function _barrow(ctx, px, py, seed) {
    _shadow(ctx, px - 4, py - 0.5, 8, 1.2);
    ctx.fillStyle = '#2a8a4a'; ctx.beginPath(); ctx.moveTo(px - 4.5, py - 4.5); ctx.lineTo(px + 3, py - 4.5); ctx.lineTo(px + 1.5, py - 1.5); ctx.lineTo(px - 3, py - 1.5); ctx.closePath(); ctx.fill();
    _ell(ctx, _h(seed, 9) < 0.5 ? '#c8b080' : '#8a8680', px - 0.8, py - 4.6, 3.4, 1.1);   // sand or gravel in it
    _ell(ctx, '#1a1a1a', px + 3.2, py - 1.2, 1.2, 1.2);
    ctx.strokeStyle = '#8a8e92'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(px - 3, py - 2); ctx.lineTo(px - 6.5, py - 1); ctx.moveTo(px - 2.5, py - 1.5); ctx.lineTo(px - 2.5, py); ctx.stroke();
  }

  function _pipes(ctx, px, py) {
    _shadow(ctx, px - 8, py - 0.5, 16, 1.6);
    const ring = (cx, cy) => { _ell(ctx, '#a8a49c', cx, cy, 2.6, 2.6); _ell(ctx, '#4a4844', cx, cy, 1.6, 1.6); _ell(ctx, 'rgba(255,255,255,0.25)', cx - 0.8, cy - 1, 1, 0.6); };
    for (let i = 0; i < 3; i++) ring(px - 5 + i * 5.2, py - 2.6);
    for (let i = 0; i < 2; i++) ring(px - 2.4 + i * 5.2, py - 7);
    _r(ctx, '#ff7a20', px + 8, py - 2.4, 6, 1.2); _r(ctx, '#ff7a20', px + 8.5, py - 3.8, 6, 1.2);   // orange ducting
  }

  function _tank(ctx, px, py) {
    // A water tote in its cage.
    _shadow(ctx, px - 4.5, py - 0.5, 9.5);
    _r(ctx, '#e8eef0', px - 4.5, py - 9, 9, 8);
    _r(ctx, 'rgba(120,170,200,0.4)', px - 4.5, py - 5, 9, 4);           // water level
    ctx.strokeStyle = '#8a8e92'; ctx.lineWidth = 0.4; ctx.beginPath();
    for (let gx = px - 4.5; gx <= px + 4.5; gx += 2.25) { ctx.moveTo(gx, py - 9); ctx.lineTo(gx, py - 1); }
    for (let gy = py - 9; gy <= py - 1; gy += 2) { ctx.moveTo(px - 4.5, gy); ctx.lineTo(px + 4.5, gy); }
    ctx.stroke();
    _r(ctx, '#3a3e42', px - 5, py - 1, 10, 1);
    _r(ctx, '#e8e8e4', px - 1, py - 10, 2, 1);
  }

  function _spoil(ctx, px, py, seed) {
    _ell(ctx, 'rgba(0,0,0,0.2)', px + 1.5, py, 12, 3);
    ctx.fillStyle = '#5e4228'; ctx.beginPath();
    ctx.moveTo(px - 12, py); ctx.quadraticCurveTo(px - 4, py - 13, px + 1, py - 12);
    ctx.quadraticCurveTo(px + 8, py - 9, px + 12, py); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#86603a'; ctx.beginPath();
    ctx.moveTo(px - 10, py - 1); ctx.quadraticCurveTo(px - 4, py - 11, px + 0.5, py - 11);
    ctx.quadraticCurveTo(px - 1.5, py - 5, px - 3, py); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 8; i++) _r(ctx, i % 2 ? '#a8a090' : '#4a3420', px - 8 + _h(seed, i + 90) * 16, py - 1 - _h(seed, i + 91) * 7, 1.2, 0.9);
  }

  // A tracked excavator, its arm working: dig, lift, swing, dump.
  function _excavator(ctx, px, py, t, seed) {
    _shadow(ctx, px - 9, py - 0.5, 18, 2.2);
    _r(ctx, '#262626', px - 9, py - 3.4, 17, 3.4); _r(ctx, '#4a4a4a', px - 8.5, py - 3, 16, 0.6);
    for (let i = 0; i < 6; i++) _r(ctx, '#151515', px - 8 + i * 2.9, py - 1.3, 1.2, 1.3);
    _ell(ctx, '#3a3a3a', px - 8.4, py - 1.7, 1.6, 1.6); _ell(ctx, '#3a3a3a', px + 7.4, py - 1.7, 1.6, 1.6);
    _r(ctx, '#e0a818', px - 7, py - 9, 12, 5.6); _r(ctx, '#b88410', px - 7, py - 4.4, 12, 1);
    _r(ctx, '#2a2a2a', px - 7.5, py - 6.6, 1.6, 2);                    // counterweight end
    _r(ctx, '#2a3a4a', px - 5.5, py - 13.6, 5.4, 4.8);
    _r(ctx, '#8ab0d0', px - 4.9, py - 13, 4.2, 2.8); _r(ctx, 'rgba(255,255,255,0.4)', px - 4.6, py - 12.8, 1.2, 1.6);
    _r(ctx, '#3a3a3a', px + 2.6, py - 11.6, 1, 2.6);                   // exhaust
    _beacon(ctx, px - 3, py - 14.2, t, seed);
    if (Math.sin(t * 1.3 + seed) > 0.5) _ell(ctx, 'rgba(60,60,60,0.25)', px + 3.4, py - 13.6, 1.4, 1.1);
    const a = Math.sin(t * 0.9 + seed);
    const bx0 = px + 4, by0 = py - 8.5;
    const bx1 = bx0 + 9, by1 = by0 - 7 + a * 2.4;
    const bx2 = bx1 + 3 + a * 2.2, by2 = by1 + 8.5 + a * 1.6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#b88410'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(bx0, by0); ctx.lineTo(bx1, by1); ctx.lineTo(bx2, by2); ctx.stroke();
    ctx.strokeStyle = '#e0a818'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(bx0, by0); ctx.lineTo(bx1, by1); ctx.lineTo(bx2, by2); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#c0c4c8'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(bx0 + 1, by0 - 1.4); ctx.lineTo(bx1 - 2, by1 - 0.4); ctx.stroke();   // ram
    ctx.fillStyle = '#4a4a4a'; ctx.beginPath();
    ctx.moveTo(bx2 - 1.8, by2 - 1.2); ctx.lineTo(bx2 + 2.8, by2 - 1.2); ctx.lineTo(bx2 + 1.8, by2 + 2.8); ctx.lineTo(bx2 - 1.2, by2 + 2.2); ctx.closePath(); ctx.fill();
    _r(ctx, '#8a8e92', bx2 - 1.2, by2 + 2.2, 3, 0.5);                  // teeth
    if (a > 0.2) _ell(ctx, '#6a4a2c', bx2 + 0.4, by2 - 1.4, 2.2, 1);   // a bucketful
    if (a < -0.6) for (let i = 0; i < 3; i++) _r(ctx, '#6a4a2c', bx2 + _h(seed, i) * 3 - 1, by2 + 3 + ((t * 4 + i / 3) % 1) * 4, 0.9, 0.9);   // dumping
  }

  // An amber rotating beacon: the lamp, and its flash thrown round it.
  function _beacon(ctx, bx, by, t, seed) {
    _r(ctx, '#3a3a3a', bx - 0.9, by + 0.4, 1.8, 0.6);
    const on = Math.sin(t * 6 + seed) > 0;
    _ell(ctx, on ? '#ffc040' : '#a87010', bx, by, 0.9, 0.8);
    if (on) _ell(ctx, `rgba(255,180,40,${(0.25 + 0.3 * _dark).toFixed(3)})`, bx, by, 2.4 + 2 * _dark, 1.6 + 1.4 * _dark);
  }
  let _dark = 0;   // the site being drawn's darkness, for the beacons

  // A mobile lighting tower (a tripod lamp on a house plot): unlit by day;
  // after dark its lamps throw a wash over the tile the crew is on.
  function _lightTower(ctx, px, py, tier, dark, ax, ay) {
    const ht = tier === 0 ? 11 : 20, hy = py - ht - 1;
    if (dark > 0.35) {
      ctx.fillStyle = `rgba(255,244,200,${(0.09 * dark).toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(px, hy); ctx.lineTo(ax - TILE * 0.45, ay + TILE * 0.3); ctx.lineTo(ax + TILE * 0.45, ay + TILE * 0.3); ctx.closePath(); ctx.fill();
      _ell(ctx, `rgba(255,236,180,${(0.13 * dark).toFixed(3)})`, ax, ay + TILE * 0.2, TILE * 0.65, TILE * 0.38);
    }
    _shadow(ctx, px - 3, py - 0.5, 7);
    if (tier === 0) {
      ctx.strokeStyle = '#4a4e52'; ctx.lineWidth = 0.5; ctx.beginPath();
      ctx.moveTo(px - 2.6, py); ctx.lineTo(px, py - 4); ctx.lineTo(px + 2.6, py); ctx.moveTo(px, py - 4); ctx.lineTo(px, py + 0.6); ctx.stroke();
    } else {
      _r(ctx, '#d8a020', px - 3.5, py - 3.2, 7, 3); _r(ctx, '#b07c10', px - 3.5, py - 1.2, 7, 1);   // the trailer it's towed on
      _ell(ctx, '#151515', px, py - 0.6, 1.1, 1.1);
    }
    _r(ctx, '#8a8e92', px - 0.4, py - ht, 0.8, ht - 2);                  // mast
    const lit = dark > 0.35;
    _r(ctx, '#3a3e42', px - 3, hy - 1.2, 6, 2.4);                         // lamp head
    for (const lx of tier === 0 ? [px - 1.1] : [px - 2.6, px + 0.2]) _r(ctx, lit ? '#fff8d8' : '#a8b0b8', lx, hy - 0.8, 2.2, 1.6);
    if (lit) _ell(ctx, `rgba(255,248,216,${(0.3 * dark).toFixed(3)})`, px, hy, 5, 3);
  }

  // Now and then a lorry drops off materials: in from the left along the
  // back row, a pause while it's unloaded, then away to the right. Clipped
  // to the plot so it never drives onto a neighbour or the street.
  function _delivery(ctx, x, y, w, h, tier, t, seed, dark, detail) {
    const P = 45 + 20 * _h(seed, 77), ph = (t + P * _h(seed, 78)) % P;
    if (ph > 16) return;
    const W = w * TILE, cyc = Math.floor((t + P * _h(seed, 78)) / P);
    const kind = tier === 0 ? 'pickup' : tier >= 2 && cyc % 2 ? 'dump' : 'flatbed';
    const L = ZoneLife.VEH?.[kind]?.len || 30;
    const stop = x + Math.max(L / 2 + 2, W * 0.45), x0 = x - L / 2 - 2, x1 = x + W + L / 2 + 2;
    let px;
    if (ph < 4) { const u = ph / 4; px = x0 + (stop - x0) * (1 - (1 - u) * (1 - u)); }   // pulling in, slowing
    else if (ph < 12) px = stop;                                                        // unloading
    else { const u = (ph - 12) / 4; px = stop + (x1 - stop) * u * u; }                  // pulling away
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y - TILE, W, h * TILE + TILE); ctx.clip();
    try { _vehicle(ctx, kind, px, y + TILE * 0.3, seed + cyc, t, dark, detail, ph < 8); }
    finally { ctx.restore(); }
  }

  function _vehicle(ctx, kind, px, py, k, t, dark, detail, loaded = true) {
    if (typeof ZoneLife === 'undefined' || !ZoneLife.drawVehicle) return;
    const base = ctx.getTransform();
    try { ZoneLife.drawVehicle(ctx, base, px, py, kind, 0, k, t, 1, dark, detail); }
    finally { ctx.setTransform(base); ctx.globalAlpha = 1; }
    if (kind === 'flatbed' && loaded) {   // its load of steel
      for (let i = 0; i < 3; i++) { _r(ctx, '#5e6a74', px - 10, py - 3.4 + i * 1.8, 18, 1.4); _r(ctx, '#7a8892', px - 10, py - 3.4 + i * 1.8, 18, 0.4); }
      _r(ctx, '#e0a818', px - 4, py - 4, 0.6, 6); _r(ctx, '#e0a818', px + 3, py - 4, 0.6, 6);   // straps
    }
  }

  // The crew's diesel generator, chugging away while the site has no grid.
  function _genset(ctx, gx, gy, t, seed) {
    _shadow(ctx, gx - 0.5, gy - 0.5, 10, 2);
    _r(ctx, '#3a3e42', gx - 0.5, gy - 1, 10, 1);
    _r(ctx, '#d8a020', gx, gy - 6, 9, 5); _r(ctx, '#b07c10', gx, gy - 2, 9, 1);
    _r(ctx, '#e8b830', gx, gy - 6, 9, 0.7);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (let i = 0; i < 3; i++) ctx.fillRect(gx + 1, gy - 5 + i * 1.1, 3.4, 0.5);   // louvres
    _r(ctx, '#2a2a2a', gx + 5, gy - 4.8, 2.6, 1.6); _r(ctx, '#60e060', gx + 5.4, gy - 4.4, 0.7, 0.7);                  // panel, RUN lamp
    _r(ctx, '#5a5a5a', gx + 7, gy - 8.6, 1, 2.8);
    const shake = Math.sin(t * 40) * 0.15;
    _r(ctx, '#3a3a3a', gx + 6.8 + shake, gy - 9, 1.4, 0.6);
    for (let i = 0; i < 4; i++) {
      const p = ((t * 0.9 + i / 4 + _h(seed, 9)) % 1);
      _ell(ctx, `rgba(90,90,90,${(0.35 * (1 - p)).toFixed(3)})`, gx + 7.5 + p * 3.5, gy - 9.5 - p * 10, 1 + p * 2.4, 1 + p * 2.4);
    }
    // its cable snaking off toward the work
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 0.5; ctx.beginPath();
    ctx.moveTo(gx, gy - 2); ctx.bezierCurveTo(gx - 6, gy + 1, gx - 10, gy - 6, gx - 18, gy - 4); ctx.stroke();
  }

  // A hoarding sign out front, on the plot's bottom edge, up for the whole
  // job: what's coming, with how far along it is in the stripe underneath.
  function _sign(ctx, x, y, w, h, name, tier, prog) {
    const W = Math.min(w * TILE - 10, 34 + tier * 14), cx = x + w * TILE / 2;
    const H = 10, top = y + h * TILE - H - 3;
    _r(ctx, '#4a4e52', cx - W / 2 + 3, top + H, 0.8, 3); _r(ctx, '#4a4e52', cx + W / 2 - 3.8, top + H, 0.8, 3);
    _r(ctx, 'rgba(0,0,0,0.25)', cx - W / 2 + 1, top + 1, W, H);
    _r(ctx, '#f4f2ea', cx - W / 2, top, W, H);
    _r(ctx, '#1e4a80', cx - W / 2, top, W, 3.4);
    _r(ctx, '#7a5a10', cx - W / 2, top + H - 1, W, 1);
    _r(ctx, '#e0a818', cx - W / 2, top + H - 1, W * prog, 1);
    if (Camera.zoom > 0.9) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 2.2px sans-serif'; ctx.fillText('COMING SOON', cx, top + 2.6);
      ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 3px sans-serif';
      let s = String(name || '').toUpperCase();
      while (s.length > 3 && ctx.measureText(s).width > W - 3) s = s.slice(0, -2) + '…';
      ctx.fillText(s, cx, top + 7.4);
      ctx.textAlign = 'left';
    }
  }

  // Stands on one of the plot's top-row tiles — the last row built — so it
  // never spills onto a road or a neighbour. `side` 1 is the right-hand
  // crane, jib swinging left over the site; -1 the left one, swinging right.
  function _crane(ctx, x, y, w, h, t, seed, side, dark, aim) {
    const mx = side > 0 ? x + w * TILE - TILE / 2 : x + TILE / 2, base = y + TILE * 0.9;
    const height = Math.min(10, Math.max(5, h + 2)) * TILE;
    const topY = base - height;
    if (side < 0) {
      // Mirrored about the mast, so the same drawing serves both sides.
      ctx.save(); ctx.translate(mx, 0); ctx.scale(-1, 1); ctx.translate(-mx, 0);
      // The work's x mirrors with it.
      const a = aim ? { x: 2 * mx - aim.x, y: aim.y } : null;
      try { _craneAt(ctx, mx, base, topY, height, w, t, seed, dark, a); } finally { ctx.restore(); }
    } else _craneAt(ctx, mx, base, topY, height, w, t, seed, dark, aim);
  }
  function _craneAt(ctx, mx, base, topY, height, w, t, seed, dark, aim) {
    const Y = '#e8b820', YD = '#b08810';
    const reach = Math.max(w, 3) * TILE * 0.9;
    // With work going on, the hook rides over the tile going up (the work
    // point glides between tiles, so the jib slews smoothly after it), with
    // a slow sway; otherwise it idles back and forth.
    const swing = aim
      ? Math.max(0.12, Math.min(1, (mx - aim.x) / reach + 0.06 + 0.05 * Math.sin(t * 0.6 + seed)))
      : 0.55 + 0.45 * Math.sin(t * 0.25 + seed);
    const jx = mx - reach * swing;
    // The jib's shadow across the site.
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(mx + 2, base + 2); ctx.lineTo(jx + 2, base + 2 + reach * 0.08); ctx.stroke();
    // Concrete ballast at the foot.
    _r(ctx, 'rgba(0,0,0,0.25)', mx - 5, base - 1, 12, 2.5);
    for (let i = 0; i < 3; i++) { _r(ctx, '#a8a49c', mx - 6 + i * 4, base - 4, 3.6, 3.4); _r(ctx, '#c8c4bc', mx - 6 + i * 4, base - 4, 3.6, 0.6); }
    // Lattice mast.
    _r(ctx, YD, mx + 1.6, topY, 0.9, height - 3); _r(ctx, Y, mx - 2.5, topY, 0.9, height - 3);
    ctx.strokeStyle = Y; ctx.lineWidth = 0.5; ctx.beginPath();
    for (let ly = base - 4; ly > topY; ly -= 5) { ctx.moveTo(mx - 2, ly); ctx.lineTo(mx + 2, ly - 2.5); ctx.lineTo(mx - 2, ly - 5); ctx.moveTo(mx - 2, ly); ctx.lineTo(mx + 2, ly); }
    ctx.stroke();
    // Slewing ring and operator's cab.
    _r(ctx, '#4a4e52', mx - 3.5, topY - 1, 7, 1.6);
    _r(ctx, '#e8e4d8', mx - 4.5, topY + 1, 5.5, 5); _r(ctx, dark > 0.35 ? '#ffe0a0' : '#7aa0c0', mx - 4, topY + 1.6, 3.8, 2.6);
    // Apex and its pendant ties out to both ends.
    _r(ctx, Y, mx - 0.6, topY - 9, 1.2, 8);
    ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 0.3; ctx.beginPath();
    ctx.moveTo(mx, topY - 9); ctx.lineTo(mx - reach * 0.55, topY - 3); ctx.moveTo(mx, topY - 9); ctx.lineTo(mx + 15, topY - 3); ctx.stroke();
    if (Math.sin(t * 3 + seed) > 0) { _ell(ctx, '#ff3020', mx, topY - 9.6, 0.9, 0.9); _ell(ctx, 'rgba(255,60,40,0.3)', mx, topY - 9.6, 2.4, 2.4); }
    // Jib: top and bottom chords with the lacing between.
    const j0 = topY - 3, j1 = topY;
    _r(ctx, Y, Math.min(jx, mx), j0, Math.abs(mx - jx), 0.8); _r(ctx, YD, Math.min(jx, mx), j1 - 0.6, Math.abs(mx - jx), 0.9);
    ctx.strokeStyle = Y; ctx.lineWidth = 0.45; ctx.beginPath();
    for (let lx = mx; lx > jx; lx -= 4) { ctx.moveTo(lx, j1); ctx.lineTo(lx - 2, j0); ctx.lineTo(lx - 4, j1); }
    ctx.stroke();
    // Counter-jib and its stacked ballast.
    _r(ctx, Y, mx, j0, 16, 0.8); _r(ctx, YD, mx, j1 - 0.6, 16, 0.9);
    for (let i = 0; i < 3; i++) _r(ctx, i % 2 ? '#7a7e82' : '#6a6e72', mx + 9.5, j1 + i * 1.6, 6, 1.6);
    // Trolley, cables, hook block and the load — a steel beam or a pallet.
    // Lowered toward the work, bobbing as it's landed and lifted off.
    const drop = aim
      ? Math.max(height * 0.2, Math.min(height - 8, (aim.y - TILE * 0.6 - (topY - 3)) * (0.82 + 0.12 * Math.sin(t * 0.5 + seed * 3))))
      : height * (0.45 + 0.25 * Math.sin(t * 0.4 + seed * 3));
    const hx = jx + 4;
    _r(ctx, '#3a3e42', hx - 2, j1, 4, 1.4);
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.35; ctx.beginPath();
    ctx.moveTo(hx - 0.8, j1 + 1.4); ctx.lineTo(hx - 0.8, j1 + drop); ctx.moveTo(hx + 0.8, j1 + 1.4); ctx.lineTo(hx + 0.8, j1 + drop); ctx.stroke();
    _r(ctx, '#e8b820', hx - 1.4, j1 + drop, 2.8, 2.2); _r(ctx, '#3a3a3a', hx - 0.4, j1 + drop + 2.2, 0.8, 1.4);
    const ly = j1 + drop + 3.6;
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.moveTo(hx, ly); ctx.lineTo(hx - 4, ly + 2.6); ctx.moveTo(hx, ly); ctx.lineTo(hx + 4, ly + 2.6); ctx.stroke();
    if (Math.floor(t / 18 + seed) % 2) { _r(ctx, '#5e6a74', hx - 7, ly + 2.6, 14, 1.8); _r(ctx, '#7a8892', hx - 7, ly + 2.6, 14, 0.4); }
    else { _r(ctx, '#a8503a', hx - 3.6, ly + 2.6, 7.2, 3.4); _r(ctx, '#6a4a28', hx - 4, ly + 6, 8, 1); }
    // A floodlight on the mast after dark, washing the site.
    if (dark > 0.35) {
      _r(ctx, '#fff8d8', mx - 4.5, topY + 8, 3, 2);
      ctx.fillStyle = `rgba(255,244,200,${(0.10 * dark).toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(mx - 3, topY + 9); ctx.lineTo(mx - w * TILE * 0.8, base); ctx.lineTo(mx - 2, base); ctx.closePath(); ctx.fill();
    }
  }

  // ── Where everything stands ───────────────────────────────────────
  // Plant and kit stand on tiles above the bottom row (the higher, the
  // longer they last), never on the crane tiles, each keeping its spot for
  // the whole job and cleared away once the crew reaches its tile. The big
  // pieces take the top rows; clutter is scattered through the rest.
  // Worked out once per plot size and tier.
  const PROPS_BY_TIER = [
    ['materials', 'barrow'],
    ['materials', 'mixer', 'pickup', 'potty', 'skip', 'barrow', 'cone'],
    ['materials', 'office', 'excavator', 'mixertruck', 'dump', 'rebar', 'potty', 'skip', 'spoil', 'tank', 'pipes', 'barrow', 'cone', 'cone'],
    ['materials', 'office', 'excavator', 'mixertruck', 'mixer', 'dump', 'flatbed', 'rebar', 'potty', 'potty', 'skip', 'spoil', 'spoil',
     'tank', 'pipes', 'materials', 'rebar', 'barrow', 'barrow', 'cone', 'cone', 'cone'],
  ];
  const BIG_PROPS = new Set(['office', 'excavator', 'mixer', 'mixertruck', 'dump', 'flatbed', 'pickup']);
  const _layouts = new Map();
  function _layout(w, h, tier) {
    const key = `${w}x${h}x${tier}`;
    let L = _layouts.get(key);
    if (L) return L;
    const n = w * h;
    const cranes = n >= CRANE_AREA || tier >= 2 ? (tier >= 3 && w >= 4 ? [1, -1] : [1]) : [];
    const taken = new Set();
    if (cranes.includes(1)) taken.add(_idxAt(w - 1, 0, w, h));
    if (cranes.includes(-1)) taken.add(_idxAt(0, 0, w, h));
    const lastRow = h >= 3 ? h - 2 : Math.floor((h - 1) / 2);   // rows from the top that props may use
    const slots = [];
    for (let r = 0; r <= lastRow; r++)
      for (let c = 0; c < w; c++) { const i = _idxAt(c, r, w, h); if (!taken.has(i)) slots.push({ i, c, r }); }
    const props = [];
    // Bigger plots get more of the small stuff, about one piece per five
    // free tiles beyond the set list, so the middle of a big dig isn't bare.
    const kinds = PROPS_BY_TIER[tier].slice();
    const EXTRA = ['materials', 'barrow', 'cone', 'pipes', 'spoil', 'rebar', 'tank', 'potty', 'skip', 'materials'];
    if (tier >= 1) for (let k = 0, more = Math.floor(slots.length / 5) - kinds.length; k < more; k++) kinds.push(EXTRA[k % EXTRA.length]);
    kinds.forEach((kind, idx) => {
      const span = kind === 'office' ? 2 : 1;
      const fits = (j) => span === 1 || (slots[j + 1] && slots[j + 1].r === slots[j].r && slots[j + 1].c === slots[j].c + 1);
      const cands = [];
      for (let j = 0; j < slots.length; j++) if (fits(j)) cands.push(j);
      if (!cands.length) return;
      const at = BIG_PROPS.has(kind) ? cands[0] : cands[Math.floor(_h(w * 131 + h * 7 + tier, idx) * cands.length)];
      // Clutter sits off-centre in its tile so the site doesn't look gridded.
      const jx = BIG_PROPS.has(kind) || kind === 'office' ? 0 : (_h(idx + 3, w * h) - 0.5) * TILE * 0.4;
      const jy = BIG_PROPS.has(kind) || kind === 'office' ? 0 : (_h(idx + 9, w * h) - 0.5) * TILE * 0.25;
      // Cleared when the crew reaches its tile (an office: the first of its two).
      const until = span === 2 ? Math.min(slots[at].i, slots[at + 1].i) : slots[at].i;
      props.push({ kind, i: slots[at].i, until, jx, jy });
      slots.splice(at, span);
    });
    L = { cranes, props };
    _layouts.set(key, L);
    return L;
  }

  function render(ctx, e, x, y, t) {
    const w = e.width || 1, h = e.height || 1, n = w * h;
    const seed = e.col * 92821 + e.row * 68917;
    const built = progress(e) * n;
    const full = Math.floor(built), frac = built - full;
    const tier = tierFor(e);
    const started = e._buildDone >= 0;
    const lv = typeof GfxQuality !== 'undefined' ? GfxQuality.level() : 2;
    const detail = lv !== 0 && Camera.zoom > 0.7;
    const dark = typeof DayNight !== 'undefined' && DayNight.darkness ? DayNight.darkness() : 0;
    const wet = typeof ZoneLife !== 'undefined' && ZoneLife.rain ? ZoneLife.rain() > 0.2 : false;
    const L = _layout(w, h, tier);
    const curRow = Math.floor(full / w);            // rows counted from the bottom
    const tx = (i) => x + _tileAt(i, w, h).c * TILE, ty = (i) => y + _tileAt(i, w, h).r * TILE;
    // Where the work is, gliding from the tile going up toward the next one
    // over the back of each tile, so what follows it (the crane's hook, the
    // lamp) moves on smoothly instead of hopping.
    const nxt = Math.min(n - 1, full + 1), glide = _ease((frac - 0.7) / 0.3);
    const workX = tx(Math.min(full, n - 1)) + (tx(nxt) - tx(Math.min(full, n - 1))) * glide + TILE / 2;
    const workY = ty(Math.min(full, n - 1)) + (ty(nxt) - ty(Math.min(full, n - 1))) * glide + TILE / 2;

    _pad(ctx, x, y, w, h, seed, wet);
    if (!started || (full === 0 && frac === 0 && tier === 0)) _stakes(ctx, x, y, w, h);

    // Groundworks ahead of the crew. Medium jobs pour the slab along the
    // row they're on; big ones have the whole rest of the plot dug out
    // with rebar laid, and the steel frame standing ahead along the row
    // (and, on the biggest, already rising on the row after).
    if (started && tier >= 2 && curRow + 1 < h) _pit(ctx, x, y, w * TILE, (h - 1 - curRow) * TILE, seed);
    if (started && tier >= 1) {
      const rowEnd = Math.min(n, (curRow + 1) * w);
      for (let i = full + 1; i < rowEnd; i++) _slab(ctx, tx(i), ty(i), i === full + 1);
      if (tier >= 2) {
        for (let i = full + 1; i < rowEnd; i++) _frame(ctx, tx(i), ty(i), 1, _h(seed, i) < 0.3);
        if (tier >= 3) for (let i = rowEnd; i < Math.min(n, rowEnd + w); i++) _frame(ctx, tx(i), ty(i), 0.35 + 0.65 * (full % w) / w, _h(seed, i) < 0.3);
      }
    }

    // The real building, clipped to the tiles that are up. Edge tiles take
    // the sprite's overhang past the footprint (eaves, shadows) with them.
    const courses = full < n && frac > 0 ? _courses(full, frac, seed) : null;
    if (built > 0) {
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < full; i++) {
        const { c, r } = _tileAt(i, w, h);
        let x0 = x + c * TILE, y0 = y + r * TILE, x1 = x0 + TILE, y1 = y0 + TILE;
        if (c === 0) x0 -= TILE;
        if (c === w - 1) x1 += TILE;
        if (r === 0) y0 -= TILE;
        if (r === h - 1) y1 += TILE;
        ctx.rect(x0, y0, x1 - x0, y1 - y0);
      }
      if (courses) {
        const { c, r } = _tileAt(full, w, h), cw = TILE / COLS;
        for (let k = 0; k < COLS; k++) if (courses[k] > 0) ctx.rect(x + c * TILE + k * cw, y + (r + 1) * TILE - courses[k], cw, courses[k]);
      }
      ctx.clip();
      // Drawn exactly as it stands: unpowered (it isn't connected), so the
      // sprite is shut — no lights, no customers, nothing open.
      try { renderEntityAt(e, x, y, t); }
      finally { ctx.restore(); }
    }

    if (full < n && started) {
      // The tile just finished: its scaffold is struck and lowered away while
      // the next one goes up, with a puff of dust off the new work, rather
      // than vanishing the moment the tile tops out.
      const strike = full > 0 ? 1 - frac / 0.3 : 0;
      if (strike > 0) {
        const px = tx(full - 1), py = ty(full - 1), u = 1 - strike;
        ctx.save();
        ctx.beginPath(); ctx.rect(px - 2, py - 12, TILE + 4, TILE + 12); ctx.clip();
        ctx.globalAlpha = strike;
        ctx.translate(0, TILE * 0.7 * u * u);
        try { _scaffold(ctx, px, py, 1, t, tier); }
        finally { ctx.restore(); }
        for (let i = 0; i < 6; i++) {
          const d = (3 + 7 * _h(seed + full, i)) * Math.sqrt(u), a = _h(seed + full, i + 9) * Math.PI * 2;
          _ell(ctx, `rgba(205,186,152,${(0.45 * strike).toFixed(3)})`,
            px + TILE / 2 + Math.cos(a) * (TILE * 0.35 + d), py + TILE * 0.85 + Math.sin(a) * 3 - 3 * u, 3 + 5 * u, 2 + 3 * u);
        }
      }
      if (courses) _blockwork(ctx, tx(full), ty(full), courses);
      // The new tile's scaffold goes up as the old one comes down.
      const rise = full > 0 ? _ease(frac / 0.18) : 1;
      if (rise < 1) {
        ctx.save(); ctx.globalAlpha = rise;
        ctx.translate(0, TILE * 0.35 * (1 - rise));
        try { _scaffold(ctx, tx(full), ty(full), frac, t, tier); }
        finally { ctx.restore(); }
      } else _scaffold(ctx, tx(full), ty(full), frac, t, tier);
      // The last tile: topping out, with the traditional little tree and a
      // flag tied to the top of the scaffold.
      if (full === n - 1 && n > 1) _toppingOut(ctx, tx(full), ty(full), frac, t, seed);
      // Dust kicked up at the foot of the work.
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.5 + i / 3 + _h(seed, i + 20)) % 1;
        _ell(ctx, `rgba(190,165,130,${(0.28 * (1 - ph)).toFixed(3)})`,
          tx(full) + TILE * (0.2 + 0.6 * _h(seed + Math.floor(t * 0.5 + i / 3), i)), ty(full) + TILE - 2 - ph * 9, 2 + ph * 4, 1.2 + ph * 2.4);
      }
    }

    // A delivery along the back row while it's still open ground; drawn
    // before the props there so they stand in front of it.
    _dark = dark;
    if (started && h >= 2 && full < n - w && typeof ZoneLife !== 'undefined') _delivery(ctx, x, y, w, h, tier, t, seed, dark, detail);

    // Props on their spots, back to front, cleared once the crew reaches them.
    let pileI = -1;
    const shown = L.props.filter(p => full < p.until).sort((a, b) => ty(a.i) + a.jy - (ty(b.i) + b.jy));
    for (const p of shown) {
      const px = tx(p.i) + TILE / 2 + p.jx, py = ty(p.i) + TILE * 0.8 + p.jy;
      switch (p.kind) {
        case 'materials': _materials(ctx, px, py, seed + p.i); if (pileI < 0 || p.i < pileI) pileI = p.i; break;
        case 'mixer':     _mixer(ctx, px, py, started ? t : 0); break;
        case 'mixertruck': _mixerTruck(ctx, px, py, started ? t : 0, seed + p.i); break;
        case 'office':    _office(ctx, px + TILE / 2, py, dark); break;
        case 'rebar':     _rebar(ctx, px, py); break;
        case 'potty':     _potty(ctx, px, py); break;
        case 'skip':      _skip(ctx, px, py, seed + p.i); break;
        case 'barrow':    _barrow(ctx, px, py, seed + p.i); break;
        case 'cone':      _cone(ctx, px, py); _cone(ctx, px + 5, py + 1.5); break;
        case 'pipes':     _pipes(ctx, px, py); break;
        case 'tank':      _tank(ctx, px, py); break;
        case 'spoil':     _spoil(ctx, px, py, seed + p.i); break;
        case 'excavator': _excavator(ctx, px, py, started ? t : 0, seed % 11); break;
        default:          _vehicle(ctx, p.kind, px, ty(p.i) + TILE / 2, seed + p.i, t, dark, detail);
      }
    }

    if (tier >= 1) _tape(ctx, x, y, w, h);
    let craneUp = false;
    for (const side of L.cranes) {
      const ci = side > 0 ? _idxAt(w - 1, 0, w, h) : _idxAt(0, 0, w, h);
      if (full < ci) { craneUp = true; _crane(ctx, x, y, w, h, t, (seed % 7) + (side < 0 ? 3 : 0), side, dark, started && full < n ? { x: workX, y: workY } : null); }
    }
    // Sites without a crane (whose floodlight does the job) get a lighting
    // tower on the left edge, aimed at the tile being worked.
    if (started && !craneUp && full < n)
      _lightTower(ctx, x + 4, y + Math.min(h - 1, 1) * TILE - 1, tier, dark, workX, workY);
    if (!e._sitePowered && started) _genset(ctx, x + w * TILE - 11, y + h * TILE - 3, t, seed);
    _sign(ctx, x, y, w, h, _siteName(e), tier, progress(e));

    _drawCrew(ctx, e, x, y, w, h, n, full, pileI, seed, t, tier, detail, dark);
  }

  // ── The crew ──────────────────────────────────────────────────────
  // Each worker has a spot to be at — on the tile going up, the one after
  // it, or over at the materials — and walks there at a walking pace
  // rather than appearing there, so when a tile is finished the crew
  // strolls on to the next. Where they actually stand is remembered per
  // site between frames (drawing only: never saved, and a site that's
  // scrolled off and back just starts them on their spots). Whoever
  // fetches comes back carrying: bricks, a plank, or a bag.
  const WALK_PX_S = 26;            // world px per second, about a tile in 1.5s
  const _crewAt = new WeakMap();   // entity -> { t, pos: [{ x, y, dir }] }

  // Big jobs put every fourth hand in a welding hood, up on the steel frame
  // ahead of the rest.
  const _isWelder = (k, tier) => tier >= 2 && k % 4 === 3;
  const _fetches  = (k, tier) => k % 3 === 2 && !_isWelder(k, tier);

  function _crewTargets(x, y, w, h, n, full, pileI, seed, t, crew, tier) {
    const pile = pileI >= 0 ? _tileAt(pileI, w, h) : null;   // fetch from the materials while there are any
    const bx = pile ? x + pile.c * TILE + TILE / 2 : 0, by = pile ? y + pile.r * TILE + TILE * 0.8 + 2 : 0;
    const out = [];
    for (let k = 0; k < crew; k++) {
      const key = seed + k * 131;
      // Half the crew get a head start on the next tile, so the gang is
      // spread along the row rather than stood in one line; welders work
      // a tile or two further on, on the frame.
      const ahead = _isWelder(k, tier) ? 1 + (k >> 2) % 2 : k % 2 === 1 ? 1 : 0;
      const tile = _tileAt(Math.min(full + ahead, n - 1), w, h);
      // A new spot on their tile every few seconds: they shuffle about
      // while they work instead of standing frozen.
      const beat = Math.floor((t + _h(key, 4) * 5) / 5);
      let tx = x + tile.c * TILE + TILE * (0.2 + 0.6 * _h(key, beat));
      let ty = y + tile.r * TILE + TILE * (0.6 + 0.35 * _h(key + 7, beat));
      // The fetcher goes to the materials for half of each round.
      const cyc = 9 + _h(key, 1) * 4;
      const ph = ((t + _h(key, 2) * cyc) % cyc) / cyc;
      const toPile = !!pile && _fetches(k, tier) && ph >= 0.5;
      if (toPile) { tx = bx + (_h(key, 5) - 0.5) * 8; ty = by; }
      out.push({ x: tx, y: ty, toPile, load: Math.floor(t / cyc + _h(key, 6) * 3) % 3 });
    }
    return out;
  }

  function _drawLoad(ctx, p, load) {
    const fx = p.x + p.dir * 1.5;
    if (load === 0) {        // a hod of bricks on the shoulder
      _r(ctx, '#6a4a28', fx - 2.6, p.y - 10.4, 5.2, 0.6);
      _r(ctx, '#a8503a', fx - 2.4, p.y - 12, 4.8, 1.6); _r(ctx, 'rgba(60,20,10,0.5)', fx - 0.1, p.y - 12, 0.3, 1.6);
    } else if (load === 1) { // a plank over the shoulder
      _r(ctx, '#d8b070', p.x - 7, p.y - 10.2, 14, 1.1); _r(ctx, '#b08848', p.x - 7, p.y - 9.3, 14, 0.3);
    } else {                 // a bag of cement in both arms
      _r(ctx, '#ddd8cc', fx - 2, p.y - 7.4, 4, 2.6); _r(ctx, '#3a6aa8', fx - 1, p.y - 6.6, 2, 0.8);
    }
  }

  function _drawCrew(ctx, e, x, y, w, h, n, full, pileI, seed, t, tier, detail, dark) {
    if (e._buildDone < 0 || typeof ZoneLife === 'undefined' || !ZoneLife.drawPerson) return;
    const crew = Math.min(CREW_BY_TIER[tier], Math.max(2, n));
    const targets = _crewTargets(x, y, w, h, n, full, pileI, seed, t, crew, tier);

    let st = _crewAt.get(e);
    // First sight of this site, or not drawn for a while (scrolled away,
    // game reloaded): start everyone on their spots.
    if (!st || st.pos.length !== crew || t < st.t || t - st.t > 2) {
      st = { t, pos: targets.map((p, k) => ({ x: p.x, y: p.y, dir: k % 2 ? -1 : 1 })) };
      _crewAt.set(e, st);
    }
    const step = WALK_PX_S * Math.min(0.1, t - st.t);
    st.t = t;

    for (let k = 0; k < crew; k++) {
      const p = st.pos[k], g = targets[k];
      const dx = g.x - p.x, dy = g.y - p.y, d = Math.hypot(dx, dy);
      p.walking = d > 0.5;
      p.horiz = !p.walking || Math.abs(dx) >= Math.abs(dy);
      if (p.walking) {
        const f = Math.min(1, step / d);
        p.x += dx * f; p.y += dy * f;
        if (Math.abs(dx) > 0.3) p.dir = dx > 0 ? 1 : -1;
      }
      // Carrying on the way back from the pile.
      p.carry = _fetches(k, tier) && p.walking && !g.toPile ? g.load : -1;
      p.k = k;
    }
    // Back to front, so a worker lower down stands in front of one behind.
    for (const p of [...st.pos].sort((a, b) => a.y - b.y)) {
      const welder = _isWelder(p.k, tier);
      // Walking, or at work where they stand (still 2 swings the arm).
      ZoneLife.drawPerson(ctx, p.x, p.y, welder ? 'welder' : 'worker', p.dir, p.horiz,
                          t, seed + p.k * 131, 1, dark, detail, p.walking ? 0 : welder ? 1 : 2);
      if (p.carry >= 0) _drawLoad(ctx, p, p.carry);
      // Hammer blows: a little flash at the hand of whoever's working.
      if (!welder && !p.walking && detail && Math.sin(t * 9 + p.k * 2.1) > 0.92) _r(ctx, '#fff4c0', p.x + p.dir * 3.2 - 0.5, p.y - 5.6, 1, 1);
      // The arc: a blue-white flicker at the torch and a shower of sparks.
      if (welder && !p.walking && Math.sin(t * 9 + p.k * 5) > -0.2) {
        const ax = p.x + p.dir * 3.5, ay = p.y - 6;
        ctx.fillStyle = `rgba(200,225,255,${(0.35 + 0.3 * Math.random()).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(ax, ay, 2.6, 0, Math.PI * 2); ctx.fill();
        _r(ctx, '#ffffff', ax - 0.6, ay - 0.6, 1.2, 1.2);
        ctx.fillStyle = '#ffd860';
        for (let s = 0; s < 5; s++) {
          const ph = (t * 3 + s / 5 + p.k * 0.37) % 1;
          ctx.fillRect(ax + (s - 2) * 1.5 * ph * 2, ay + ph * 6 + ph * ph * 3, 0.7, 0.7);
        }
        if (dark > 0.3) _ell(ctx, `rgba(160,200,255,${(0.12 * dark).toFixed(3)})`, ax, ay + 4, 9, 4);
      }
    }
  }

  // ── Handover ──────────────────────────────────────────────────────
  // Just finished: the last tile's scaffold lowered away into the ground
  // and dust billowing off the footprint's edges, over the finished
  // building. Drawn over everything from render_main_loop.js.
  const FX_SECS = 2.6;
  function renderFinishFx(ctx, t) {
    for (let j = _finishFx.length - 1; j >= 0; j--) {
      const f = _finishFx[j], age = t - f.t0;
      if (age > FX_SECS || age < 0) { _finishFx.splice(j, 1); continue; }
      const W = f.w * TILE, H = f.h * TILE, u = age / FX_SECS;
      // The scaffold, sinking and fading over the first half.
      if (u < 0.5) {
        const sx = f.x + _tileAt(f.w * f.h - 1, f.w, f.h).c * TILE, sink = TILE * (u / 0.5) * (u / 0.5);
        ctx.save();
        ctx.beginPath(); ctx.rect(sx - 2, f.y - 12, TILE + 4, TILE + 12); ctx.clip();
        ctx.globalAlpha = 1 - u / 0.5;
        ctx.translate(0, sink);
        try { _scaffold(ctx, sx, f.y, 1, t, f.tier); }
        finally { ctx.restore(); }
      }
      // Dust rolling out from every side.
      const per = Math.min(40, 2 * (f.w + f.h));
      for (let i = 0; i < per; i++) {
        const side = i % 4, s = _h(f.seed, i + 400);
        const d = (2 + 10 * _h(f.seed, i + 401)) * Math.sqrt(u);
        let px, py, dx = 0, dy = 0;
        if (side === 0)      { px = f.x + s * W; py = f.y + H; dy = 1; }
        else if (side === 1) { px = f.x + s * W; py = f.y;     dy = -1; }
        else if (side === 2) { px = f.x;        py = f.y + s * H; dx = -1; }
        else                 { px = f.x + W;    py = f.y + s * H; dx = 1; }
        const r = 4 + 8 * u + 3 * _h(f.seed, i + 402);
        _ell(ctx, `rgba(205,186,152,${(0.6 * (1 - u)).toFixed(3)})`, px + dx * d, py + dy * d - 4 * u, r, r * 0.7);
      }
    }
  }

  // Dev: finish every site now.
  function finishAll() {
    for (const t of siteTypes())
      for (const e of [...EntityRegistry.getByType(t)]) if (e._constructing) { e._buildDone = e._buildTotal; _finish(e); }
  }

  return { start, tick, render, renderFinishFx, siteTypes, progress, secondsLeft, durationFor, drawFor, drawW, siteKWFor, formatSecs,
           tierFor, finishAll, LOT_STAGGER, UNPOWERED_SPEED };
})();
