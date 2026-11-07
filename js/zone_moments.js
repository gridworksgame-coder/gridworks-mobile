/* ═══════════════════════════════════════════════════════════════════
   ZONE MOMENTS
   Small things going on at the buildings themselves, for the player to
   spot as they look round town — on top of the walkers and traffic that
   zone_life.js runs along the streets.

   Arrivals (the first game day after a customer is accepted):
     - a home gets a removal van on the street, movers carrying boxes in
       and a pile of them on the lawn going down, then the family out front;
     - a business gets a grand opening: bunting, balloons, a ribbon cut in
       front of a little crowd, then a queue at the door;
     - a plant gets bunting, the first delivery and its new crew.
   Homes, by season, hour and weather:
     - someone mowing the back garden; kids' lemonade stands on summer
       afternoons; barbecues and garden parties on warm evenings (string
       lights after dark); leaf piles and a rake in autumn, with a kid
       jumping in; snowmen and snowball fights in winter;
     - the mail carrier's morning round along each street, door by door,
       with the mail van parked at the end;
     - the ice-cream van touring the streets on summer afternoons, stopping
       for the kids who run out to it;
     - a block party on one street of a big neighbourhood at weekends.
   Businesses: café and restaurant terraces through opening hours,
   morning deliveries with a hand truck, food trucks with a lunch queue,
   and the queue and bouncer outside the clubs at night.
   Industry: the shift changes at 06:00, 14:00 and 22:00, and the
   catering truck at lunchtime.

   Like zone_life.js, everything is a pure function of the game clock and
   each building's position: nothing is simulated or saved, apart from
   the arrival time stamped on a building when it's placed (_movedIn).
   Only buildings on screen are looked at, and nothing is drawn zoomed out.
   ═══════════════════════════════════════════════════════════════════ */

const ZoneMoments = (() => {
  const TS = TILE;
  const DAY = 1200;           // game seconds per day (DayNight's cycle)
  const HOUR = DAY / 24;      // game seconds per game hour

  function _h(a, b, c = 0) {
    let h = (a * 374761393 + b * 668265263 + c * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const _id = (e) => e.col * 92821 + e.row * 68917;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  // Alpha for a window [a, b] of the clock (hours), fading over `f` hours at
  // each end.
  const win = (hr, a, b, f = 0.15) => hr < a || hr > b ? 0 : Math.min(1, (hr - a) / f, (b - hr) / f);

  let _budget = 0;
  // Last frame's tally of moments on screen, by kind, with where the last of
  // each was (dev: ZoneMoments.stats()).
  let _stats = {};
  const _note = (kind, x, y) => { const o = _stats[kind] || (_stats[kind] = { n: 0 }); o.n++; o.x = x; o.y = y; };
  let L = null;   // ZoneLife, once loaded

  // ── Shared little drawings ────────────────────────────────────────
  function box(ctx, x, y, s = 1, tint = 0) {   // a cardboard box sitting on (x, y)
    const w = 4.2 * s, h = 3.4 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x - w / 2 + 0.6, y - 0.4, w, 1);
    ctx.fillStyle = tint < 0.5 ? '#c8a070' : '#b88a58'; ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - w / 2, y - h, w, 0.8 * s);
    ctx.fillStyle = '#8a6a3a'; ctx.fillRect(x - 0.3 * s, y - h, 0.6 * s, h);   // tape
  }
  function bunting(ctx, x0, y0, x1, y1, t, k, sag = 3) {
    const COLS = ['#e83a3a', '#f0c020', '#2a8ad0', '#3aa04a', '#f4f2ec', '#d860a0'];
    ctx.strokeStyle = 'rgba(40,40,40,0.7)'; ctx.lineWidth = 0.4;
    const pt = (u) => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u + Math.sin(Math.PI * u) * sag];
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) { const [x, y] = pt(i / 12); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    const n = Math.max(3, Math.floor(Math.hypot(x1 - x0, y1 - y0) / 4));
    for (let i = 0; i < n; i++) {
      const [x, y] = pt((i + 0.5) / n);
      const sway = Math.sin(t * 3 + i + k) * 0.4;
      ctx.fillStyle = COLS[(i + k) % COLS.length];
      ctx.beginPath(); ctx.moveTo(x - 1.2, y); ctx.lineTo(x + 1.2, y); ctx.lineTo(x + sway, y + 2.6); ctx.closePath(); ctx.fill();
    }
  }
  function balloons(ctx, x, y, t, k) {         // a bunch tied at (x, y)
    const COLS = ['#e83a3a', '#f0c020', '#2a8ad0', '#d860a0', '#3aa04a', '#f4f2ec'];
    ctx.strokeStyle = 'rgba(60,60,60,0.6)'; ctx.lineWidth = 0.3;
    for (let i = 0; i < 4; i++) {
      const bx = x + (i - 1.5) * 2.2 + Math.sin(t * 1.3 + i * 2 + k) * 0.8, by = y - 13 - (i % 2) * 2.4 + Math.sin(t * 1.7 + i) * 0.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx, by + 2); ctx.stroke();
      ctx.fillStyle = COLS[(i + k) % COLS.length];
      ctx.beginPath(); ctx.ellipse(bx, by, 1.8, 2.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(bx - 1, by - 1.4, 0.7, 0.9);
    }
  }
  function smoke(ctx, x, y, t, k, a, n = 3, rise = 7) {
    for (let i = 0; i < n; i++) {
      const age = (t * 0.5 + i / n + _h(k, i)) % 1;
      ctx.globalAlpha = a * (1 - age) * 0.4; ctx.fillStyle = '#e8e8e8';
      ctx.beginPath(); ctx.arc(x + Math.sin(age * 6 + i) * 1.4, y - age * rise, 0.8 + age * 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = a;
  }
  function glow(ctx, x, y, r, a, dark) {
    if (dark < 0.25) return;
    ctx.globalAlpha = a * 0.5 * dark;
    ctx.drawImage(L.pool(), x - r, y - r * 0.6, r * 2, r * 1.2);
    ctx.globalAlpha = a;
  }
  function stringLights(ctx, x0, x1, y, t, a, dark) {
    ctx.strokeStyle = 'rgba(30,30,30,0.6)'; ctx.lineWidth = 0.3;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo((x0 + x1) / 2, y + 3, x1, y); ctx.stroke();
    const lit = dark > 0.2;
    for (let i = 0; i <= 8; i++) {
      const u = i / 8, x = x0 + (x1 - x0) * u, yy = y + 3 * 4 * u * (1 - u) * 0.5;
      ctx.fillStyle = lit ? ['#fff0b0', '#ffd080', '#ffe0c0'][i % 3] : '#d8d0b0';
      ctx.fillRect(x - 0.5, yy, 1, 1.1);
    }
    if (lit) glow(ctx, (x0 + x1) / 2, y + 6, (x1 - x0) * 0.6, a, dark);
  }
  // A person (front view), with the zone_life palette.
  const P = (ctx, x, y, kind, k, a, st, dir = 0) => {
    if (--_budget < 0) return;
    L.drawPerson(ctx, x, y, kind, dir, dir !== 0, _t, k, a, _dark, _detail, st);
  };
  const Kid = (ctx, base, x, y, k, a, st, dir = 0, kind = 'walker') => {
    if (--_budget < 0) return;
    L.drawSmallPerson(ctx, base, x, y, 0.72, kind, dir, dir !== 0, _t, k, a, _dark, _detail, st);
  };
  const Veh = (ctx, base, x, y, kind, ang, k, a) => {
    _budget -= 3;
    L.drawVehicle(ctx, base, x, y, kind, ang, k, _t, a, _dark, _detail);
  };

  // Frame state
  let _t = 0, _dark = 0, _detail = true, _hr = 12, _day = 1, _season = 1, _rain = 0, _snow = 0, _temp = 15, _el = 0, _weekend = false;

  // ── Arrivals ──────────────────────────────────────────────────────
  // u: 0..1 through the first game day.
  function moveInHome(ctx, base, e, u, k) {
    _note('moveIn', e.col, e.row);
    const w = e.width || 1, h = e.height || 1;
    const fx = (e.col + w / 2) * TS, fy = (e.row + h) * TS;          // front edge, middle
    const a = Math.min(1, u / 0.02, (1 - u) / 0.04);
    if (a <= 0) return;
    const vx = fx + TS * 0.55, vy = fy + TS / 2;                      // van on the street in front
    const unload = u < 0.65;
    if (unload) Veh(ctx, base, vx, vy, 'moving', Math.PI, k, a);
    // the pile on the lawn, going down as the day goes on
    const left = unload ? Math.max(0, 5 - Math.floor(u / 0.65 * 6)) : 0;
    for (let i = 0; i < left; i++) box(ctx, fx - TS * 0.3 + (i % 3) * 4.4 - (i > 2 ? -2 : 0), fy + 5 - (i > 2 ? 3.4 : 0), 1, _h(k, i));
    if (unload) {
      // two movers shuttling: out to the van empty-handed, back with a box
      for (let m = 0; m < 2; m++) {
        const cyc = ((_t / 7 + m * 0.5 + _h(k, 9)) % 1);
        const toDoor = cyc < 0.5, s = toDoor ? cyc * 2 : (cyc - 0.5) * 2;
        const x0 = vx + 10, x1 = fx + (m ? 3 : -3);
        const x = toDoor ? x0 + (x1 - x0) * s : x1 + (x0 - x1) * s, y = fy + 9 - (toDoor ? s : 1 - s) * 4;
        P(ctx, x, y, 'mover', k * 3 + m, a, 0, toDoor ? -1 : 1);
        if (toDoor && _detail) box(ctx, x, y - 6.5, 0.85, m);
      }
    }
    if (u > 0.4) {                                                  // the family out front
      const fa = a * Math.min(1, (u - 0.4) / 0.05);
      P(ctx, fx - 6, fy + 6, 'walker', k * 5 + 1, fa, 2, 1);
      P(ctx, fx + 6, fy + 6, 'walker', k * 5 + 2, fa, 1, -1);
      if (_h(k, 4) < 0.6) Kid(ctx, base, fx + 1, fy + 8, k * 5 + 3, fa, 2);
      if (_h(k, 5) < 0.35 && _detail) balloons(ctx, fx + 10, fy + 4, _t, k);
    }
  }
  function grandOpening(ctx, base, e, u, k, industrial) {
    _note(industrial ? 'plantOpening' : 'grandOpening', e.col, e.row);
    const w = e.width || 1, h = e.height || 1;
    const x0 = e.col * TS, x1 = (e.col + w) * TS, fy = (e.row + h) * TS, fx = (x0 + x1) / 2;
    const a = Math.min(1, u / 0.02, (1 - u) / 0.04);
    if (a <= 0) return;
    if (_detail) {
      bunting(ctx, x0 + 2, fy - 2, x1 - 2, fy - 2, _t, k % 6, 2.5);
      balloons(ctx, x0 + 4, fy + 2, _t, k);
      balloons(ctx, x1 - 4, fy + 2, _t, k + 3);
    }
    if (industrial) {
      // first delivery at the gate and the new crew
      if (u < 0.5) Veh(ctx, base, fx + 22, fy + TS / 2 + 4, 'semi', Math.PI, k, a);
      for (let i = 0; i < 4; i++) P(ctx, fx - 9 + i * 5, fy + 6 + (i % 2), i ? 'worker' : 'official', k * 7 + i, a, i === 1 ? 2 : 1, i < 2 ? 1 : -1);
      return;
    }
    if (u < 0.12) {
      // the ribbon across the door, the owner and a dignitary with the scissors, a crowd
      ctx.fillStyle = '#d82a2a'; ctx.fillRect(fx - 9, fy + 3, 18, 0.9);
      ctx.beginPath(); ctx.arc(fx, fy + 3.4, 1.4, 0, Math.PI * 2); ctx.fill();
      P(ctx, fx - 4, fy + 2.5, 'official', k * 7, a, 2, 1);
      P(ctx, fx + 4, fy + 2.5, 'walker', k * 7 + 1, a, 1, -1);
      for (let i = 0; i < 7; i++) {
        const cx = fx - 14 + i * 4.6 + (_h(k, i) - 0.5) * 2, cy = fy + 10 + (i % 2) * 2.5;
        P(ctx, cx, cy, i % 3 ? 'shopper' : 'walker', k * 11 + i, a, (Math.floor(_t * 2 + i) % 5 === 0) ? 2 : 1);
      }
      return;
    }
    // a queue at the door through the opening day
    const n = 3 + Math.floor(_h(k, 6) * 5 * (1 - u));
    for (let i = 0; i < n; i++) P(ctx, fx + 3 + i * 4.4, fy + 4 + (i % 2) * 0.8, i % 2 ? 'shopper' : 'walker', k * 13 + i, a, 1, -1);
  }

  // ── Homes ─────────────────────────────────────────────────────────
  // How many rows of back garden a house has (0..3): open ground behind it,
  // up to the next sidewalk or building.
  function _gardenDepth(e) {
    let n = 0;
    for (let r = e.row - 1; r >= e.row - 3; r--) {
      const o = GridManager.getEntity(e.col, r);
      if ((o && !GridManager.isVegetation(o)) || (typeof nbIsSidewalk === 'function' && nbIsSidewalk(e.col, r))) break;
      n++;
    }
    return n;
  }
  function home(ctx, base, e) {
    const k = _id(e), d = _day;
    const x0 = e.col * TS, y0 = e.row * TS, fx = x0 + TS / 2, fy = y0 + TS;
    const dry = _rain < 0.08;
    let _gd = -1;
    const gardenDepth = () => (_gd < 0 ? (_gd = _gardenDepth(e)) : _gd);
    // Mowing the back garden
    if (_season !== 3 && dry && _snow < 0.2 && _h(k, d, 1) < 0.16 && gardenDepth() >= 1) {
      const s = 9.5 + _h(k, d, 2) * 7.5, len = 0.55;
      const a = win(_hr, s, s + len, 0.04);
      if (a > 0) {
        _note('mow', (x0 / TS) | 0, (fy / TS) | 0);
        const u = (_hr - s) / len, lanes = 2 * gardenDepth(), li = Math.min(lanes - 1, Math.floor(u * lanes)), along = (u * lanes) % 1;
        const gx0 = x0 - 8, gx1 = x0 + TS + 8, gy0 = y0 - TS * (gardenDepth() - 0.4), gy1 = y0 - 8;
        const dir = li % 2 ? -1 : 1;
        const x = dir > 0 ? gx0 + (gx1 - gx0) * along : gx1 - (gx1 - gx0) * along, y = gy0 + (li + 0.5) * (gy1 - gy0) / lanes + 4;
        // mown stripes behind
        ctx.globalAlpha = a * 0.09; ctx.fillStyle = '#d8f0a0';
        for (let i = 0; i < li; i++) if (i % 2 === 0) ctx.fillRect(gx0, gy0 + i * (gy1 - gy0) / lanes, gx1 - gx0, (gy1 - gy0) / lanes);
        ctx.globalAlpha = a;
        // the mower ahead of them
        const mx = x + dir * 4.5;
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(mx - 2.4, y - 0.4, 5, 1.2);
        ctx.fillStyle = _h(k, 3) < 0.5 ? '#c83a32' : '#3a8a3a'; ctx.fillRect(mx - 2.2, y - 2.6, 4.4, 2.4);
        ctx.fillStyle = '#2a2a2a'; ctx.fillRect(mx - 2.2, y - 0.6, 1.2, 0.9); ctx.fillRect(mx + 1, y - 0.6, 1.2, 0.9);
        ctx.strokeStyle = '#4a4a4a'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(mx - dir * 1.5, y - 2.4); ctx.lineTo(x + dir * 1.2, y - 5.2); ctx.stroke();
        if (_detail) {                                                // clippings
          ctx.fillStyle = '#9ad060';
          for (let i = 0; i < 3; i++) { const age = (_t * 3 + i / 3) % 1; ctx.globalAlpha = a * (1 - age); ctx.fillRect(mx - dir * (2 + age * 4), y - 2 - age * 2 + i, 0.8, 0.8); }
          ctx.globalAlpha = a;
        }
        P(ctx, x, y, 'walker', k * 3 + 7, a, 0, dir);
      }
    }
    // Lemonade stand on a summer afternoon
    if ((_season === 1 || (_season === 0 && _temp > 16)) && dry && _h(k, d, 4) < (_weekend ? 0.1 : 0.04)) {
      const a = win(_hr, 12.5, 17.5, 0.2);
      if (a > 0) {
        _note('lemonade', (x0 / TS) | 0, (fy / TS) | 0);
        const sx = fx + 12, sy = fy + 5;
        Kid(ctx, base, sx - 2.5, sy - 1.5, k * 9, a, 2);
        if (_h(k, 5) < 0.6) Kid(ctx, base, sx + 2.5, sy - 1.5, k * 9 + 1, a, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(sx - 5, sy + 0.4, 11, 1);
        ctx.fillStyle = '#8a6a3a'; ctx.fillRect(sx - 4.6, sy - 3, 0.7, 3.4); ctx.fillRect(sx + 3.9, sy - 3, 0.7, 3.4);
        ctx.fillStyle = '#f4e060'; ctx.fillRect(sx - 5, sy - 4.2, 10, 1.6);
        ctx.fillStyle = '#f4f2ec'; ctx.fillRect(sx - 5, sy - 2.8, 10, 1.6);
        ctx.fillStyle = '#e8d040'; ctx.fillRect(sx - 3, sy - 6.4, 1.8, 2.2);   // jug
        ctx.fillStyle = '#f4f4f0'; ctx.fillRect(sx + 0.5, sy - 5.6, 1, 1.4); ctx.fillRect(sx + 2.2, sy - 5.6, 1, 1.4);
        // the sign on a stick
        ctx.fillStyle = '#6a4a2a'; ctx.fillRect(sx + 6.6, sy - 9, 0.5, 9);
        ctx.fillStyle = '#fff4a0'; ctx.fillRect(sx + 4.6, sy - 11, 5, 3.2);
        ctx.fillStyle = '#d0402a'; ctx.fillRect(sx + 5.2, sy - 10.2, 3.6, 0.5); ctx.fillRect(sx + 5.2, sy - 9.2, 2.6, 0.5);
        // a customer now and then
        if (((_t / 22 + _h(k, 6)) % 1) < 0.4) P(ctx, sx + 1, sy + 7, 'walker', k * 9 + 2 + Math.floor(_t / 22), a, 1);
      }
    }
    // Barbecue / garden party on a warm evening
    if (_season !== 3 && dry && _temp > 10 && _h(k, d, 7) < (_weekend ? 0.16 : 0.06) && gardenDepth() >= 2) {
      const s = 17 + _h(k, d, 8) * 1.5, a = win(_hr, s, s + 3.5, 0.25);
      if (a > 0) {
        _note('bbq', (x0 / TS) | 0, (fy / TS) | 0);
        const gx = fx, gy = y0 - TS * 1.4;
        if (_detail) stringLights(ctx, x0 - 10, x0 + TS + 10, y0 - TS * (gardenDepth() - 0.55), _t, a, _dark);
        // grill
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(gx - 9, gy + 0.2, 6, 1);
        ctx.fillStyle = '#3a3a3e'; ctx.fillRect(gx - 9.4, gy - 3.4, 0.6, 3.4); ctx.fillRect(gx - 4.6, gy - 3.4, 0.6, 3.4);
        ctx.fillStyle = '#1e1e22'; ctx.beginPath(); ctx.ellipse(gx - 6.7, gy - 4.2, 3.2, 1.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e8702a'; ctx.fillRect(gx - 8.4, gy - 5.2, 3.4, 0.6);
        smoke(ctx, gx - 6.7, gy - 6, _t, k, a, 3, 9);
        P(ctx, gx - 2.5, gy, 'chef', k * 4, a, 2, -1);
        // picnic table and the guests
        ctx.fillStyle = '#9a7048'; ctx.fillRect(gx + 4, gy - 9, 9, 2.2);
        ctx.fillStyle = '#7a5434'; ctx.fillRect(gx + 4.5, gy - 6.8, 0.8, 2.6); ctx.fillRect(gx + 11.7, gy - 6.8, 0.8, 2.6);
        const n = 3 + Math.floor(_h(k, d, 9) * 4);
        const spots = [[gx + 5, gy - 10, 3], [gx + 11, gy - 10, 3], [gx + 8, gy + 2, 2], [gx + 14, gy + 1, 1], [gx - 12, gy + 3, 2], [gx + 2, gy + 6, 1], [gx - 6, gy - 13, 2]];
        const talker = Math.floor(_t / 3.2) % n;
        for (let i = 0; i < n; i++) { const [px, py, st] = spots[i]; P(ctx, px, py, 'walker', k * 4 + 1 + i, a, st === 3 ? 3 : (talker === i ? 2 : 1), px < gx ? 1 : -1); }
        if (_h(k, d, 10) < 0.5) Kid(ctx, base, gx - 14 + Math.sin(_t * 1.3 + k) * 6, gy - 6, k * 4 + 9, a, 0, Math.cos(_t * 1.3 + k) > 0 ? 1 : -1);
      }
    }
    // Autumn: a leaf pile, someone raking, a kid jumping in
    if (_season === 2 && _h(k, d, 11) < 0.22) {
      _note('leaves', (x0 / TS) | 0, (fy / TS) | 0);
      const lx = x0 - 6, ly = fy - 3, a = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(lx + 0.8, ly + 0.6, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b85a22'; ctx.beginPath(); ctx.ellipse(lx, ly - 1.4, 5.6, 2.8, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#d88a2a'; for (let i = 0; i < 6; i++) ctx.fillRect(lx - 4 + i * 1.5, ly - 2.6 - (i % 3) * 0.8, 1.2, 0.9);
      ctx.fillStyle = '#e8b030'; ctx.fillRect(lx - 1, ly - 3.6, 1, 0.8);
      if (_hr > 9 && _hr < 17 && dry) {
        if (_h(k, d, 12) < 0.6) {                                  // raking
          const rx = lx + 10 + Math.sin(_t * 0.7 + k) * 2;
          P(ctx, rx, ly + 2, 'walker', k * 6, a, 1, -1);
          ctx.strokeStyle = '#7a5434'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(rx - 2.5, ly - 3); ctx.lineTo(rx - 7 + Math.sin(_t * 3) * 1.2, ly + 1.5); ctx.stroke();
        }
        const cyc = (_t / 5 + _h(k, 13)) % 1;
        if (_h(k, d, 14) < 0.7) {                                   // the jumper
          const jx = lx - 9 + Math.min(1, cyc / 0.5) * 9, jump = cyc > 0.5 && cyc < 0.75 ? Math.sin((cyc - 0.5) / 0.25 * Math.PI) * 5 : 0;
          if (cyc < 0.85) Kid(ctx, base, jx, ly + 1 - jump, k * 6 + 1, a, cyc > 0.5 ? 2 : 0, 1);
          if (cyc > 0.7 && _detail) {
            const age = (cyc - 0.7) / 0.3;
            ctx.globalAlpha = 1 - age;
            for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#d88a2a' : '#b85a22'; ctx.fillRect(lx + Math.cos(i * 1.1) * age * 7, ly - 3 - Math.sin(i * 1.7 + 1) * age * 6 + age * age * 4, 1, 0.8); }
            ctx.globalAlpha = 1;
          }
        }
      }
    }
    // Winter: a snowman out front, and a snowball fight
    if (_season === 3 && _snow > 0.25 && _h(k, d, 15) < 0.3) {
      _note('snowman', (x0 / TS) | 0, (fy / TS) | 0);
      const sx = x0 - 7, sy = fy - 1;
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(sx + 0.8, sy + 0.5, 3.4, 1.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f4f6f8';
      ctx.beginPath(); ctx.arc(sx, sy - 2.6, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx, sy - 6.8, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx, sy - 9.8, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(160,180,200,0.35)'; ctx.beginPath(); ctx.arc(sx + 0.9, sy - 2.2, 2.2, -0.4, 1.6); ctx.fill();
      ctx.fillStyle = '#1e1e22'; ctx.fillRect(sx - 1.4, sy - 12, 2.8, 0.6); ctx.fillRect(sx - 0.9, sy - 13.8, 1.8, 1.9);   // hat
      ctx.fillStyle = '#e8702a'; ctx.fillRect(sx + 0.6, sy - 9.9, 1.6, 0.5);                                              // carrot
      ctx.fillStyle = ['#c83a32', '#2a8ad0', '#3a8a4a'][Math.floor(_h(k, 16) * 3)]; ctx.fillRect(sx - 1.8, sy - 8.4, 3.6, 0.8);  // scarf
      if (_hr > 10 && _hr < 16 && _h(k, d, 17) < 0.5) {
        const ax = sx + 6, bx = sx + 20, y = fy + 3;
        Kid(ctx, base, ax, y, k * 8, 1, 1, 1);
        Kid(ctx, base, bx, y + 1, k * 8 + 1, 1, 1, -1);
        if (_detail) {
          const f = (_t / 1.4 + _h(k, 18)) % 2, u = f % 1, fromA = f < 1;
          const x = fromA ? ax + (bx - ax) * u : bx + (ax - bx) * u;
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y - 5 - Math.sin(Math.PI * u) * 5, 0.9, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }

  // ── Streets of homes ──────────────────────────────────────────────
  // Runs of ordinary houses fronting the same street (a gap of up to three
  // tiles between neighbours), per residential zone. Cached on the zone
  // version.
  let _runsVer = -1, _streets = [];
  function _homeStreets() {
    const v = ZoneSystem.getVersion();
    if (v === _runsVer) return _streets;
    _runsVer = v; _streets = [];
    const rects = ZoneSystem.getZoneRects('residential') || [];
    rects.forEach((rect, zi) => {
      const byRow = new Map();
      for (const e of EntityRegistry.getByType(T.HOUSE)) {
        if (!e.fromRequest || e.commercialSubtype || (e.width || 1) > 1) continue;
        if (e.col < rect.minC || e.col > rect.maxC || e.row < rect.minR || e.row > rect.maxR) continue;
        const R = e.row + 1;
        if (!byRow.has(R)) byRow.set(R, []);
        byRow.get(R).push(e.col);
      }
      for (const [R, cols] of byRow) {
        cols.sort((a, b) => a - b);
        let run = [cols[0]];
        const flush = () => { if (run.length >= 3) _streets.push({ zi, R, cols: run, c0: run[0], c1: run[run.length - 1] }); };
        for (let i = 1; i < cols.length; i++) {
          if (cols[i] - cols[i - 1] <= 4) run.push(cols[i]);
          else { flush(); run = [cols[i]]; }
        }
        flush();
      }
    });
    _zoneHomes = rects.map((_, zi) => _streets.filter(s => s.zi === zi).reduce((n, s) => n + s.cols.length, 0));
    return _streets;
  }
  let _zoneHomes = [];

  // The mail round: along each street once a morning, stopping at each door.
  const POST_SPEED = 11, POST_STOP = 2.4;
  function mailRound(ctx, base, S, vis) {
    if (_hr < 8 || _hr > 13.5 || _rain > 0.6) return;
    const s = 8.4 + _h(S.R, S.c0, _day) * 3;
    const tau = (_hr - s) * HOUR;                                  // game seconds into the round
    const xs = S.cols.map(c => c * TS + TS / 2);
    const start = xs[0] - 30, end = xs[xs.length - 1] + 30;
    const total = (end - start) / POST_SPEED + xs.length * POST_STOP;
    if (tau < -20 || tau > total + 20) return;
    const y = S.R * TS + 12;
    if (!vis(start - 40, end + 40, y - 20, y + 20)) return;
    const a = clamp01(Math.min((tau + 20) / 4, (total + 20 - tau) / 4));
    Veh(ctx, base, start - 6, S.R * TS + TS / 2 + 2, 'mailvan', 0, S.R * 31 + S.c0, a);
    if (tau < 0 || tau > total) return;
    // where on the round
    let x = start, rem = tau, stopped = false;
    for (const hx of xs) {
      const leg = (hx - x) / POST_SPEED;
      if (rem < leg) { x += rem * POST_SPEED; rem = -1; break; }
      rem -= leg; x = hx;
      if (rem < POST_STOP) { stopped = true; rem = -1; break; }
      rem -= POST_STOP;
    }
    if (rem >= 0) x = Math.min(end, x + rem * POST_SPEED);
    _note('mail', (x / TS) | 0, (y / TS) | 0);
    P(ctx, x, y - (stopped ? 6 : 0), 'postie', S.R * 7 + S.c0, a, stopped ? 2 : 0, stopped ? 0 : 1);
    if (stopped && _detail) { ctx.fillStyle = '#f4f2ec'; ctx.fillRect(x + 2, y - 12, 2, 1.4); }
  }

  // The ice-cream van: one street an hour per neighbourhood on summer
  // afternoons, stopping every few houses for the kids.
  const ICE_SPEED = 13, ICE_STOP = 9;
  function iceCream(ctx, base, streets, vis) {
    if (_hr < 13 || _hr > 18.5 || _rain > 0.08 || !(_season === 1 || _temp > 21)) return;
    const hour = Math.floor(_hr), tau = (_hr - hour) * HOUR;
    const byZone = new Map();
    for (const S of streets) if (S.cols.length >= 4) { if (!byZone.has(S.zi)) byZone.set(S.zi, []); byZone.get(S.zi).push(S); }
    for (const [zi, list] of byZone) {
      if (_h(zi, _day, 40) > 0.85) continue;                       // not every neighbourhood every day
      const S = list[Math.floor(_h(zi, _day * 24 + hour, 41) * list.length)];
      const xs = S.cols.map(c => c * TS + TS / 2);
      const start = xs[0] - 50, end = xs[xs.length - 1] + 50, y = S.R * TS + TS / 2;
      if (!vis(start, end, y - 30, y + 30)) continue;
      const stops = xs.filter((_, i) => i % 3 === 1);
      let x = start, rem = tau, stopAt = -1;
      for (let i = 0; i <= stops.length; i++) {
        const tgt = i < stops.length ? stops[i] : end;
        const leg = (tgt - x) / ICE_SPEED;
        if (rem < leg) { x += rem * ICE_SPEED; rem = -1; break; }
        rem -= leg; x = tgt;
        if (i === stops.length) break;
        if (rem < ICE_STOP) { stopAt = i; break; }
        rem -= ICE_STOP;
      }
      if (x >= end) continue;
      const a = clamp01(Math.min((x - start) / 20, (end - x) / 20));
      _note('icecream', (x / TS) | 0, (y / TS) | 0);
      Veh(ctx, base, x, y + 1, 'icecream', 0, zi * 977 + hour, a);
      if (stopAt >= 0) {
        // kids from the nearest houses run out, queue at the hatch, go home with a cone
        const sk = zi * 131 + hour * 7 + stopAt;
        const n = 2 + Math.floor(_h(sk, 1) * 3);
        const local = _stopClock(stops, stopAt, start, tau);
        for (let i = 0; i < n; i++) {
          const hx = stops[stopAt] + (i - (n - 1) / 2) * 2 * TS * 0.5, hy = S.R * TS - 2;
          const qx = x + 4 + i * 4, qy = y - 8;
          const go = clamp01((local - i * 0.6) / 2.2), back = clamp01((local - ICE_STOP + 2.6) / 2.2);
          const px = back > 0 ? qx + (hx - qx) * back : hx + (qx - hx) * go;
          const py = back > 0 ? qy + (hy - qy) * back : hy + (qy - hy) * go;
          Kid(ctx, base, px, py, sk * 5 + i, a, go >= 1 && back <= 0 ? 1 : 0, back > 0 ? 0 : 1);
          if (back > 0 && _detail) {
            ctx.fillStyle = '#d8a860'; ctx.fillRect(px + 1.4, py - 4.6, 0.8, 1.6);
            ctx.fillStyle = ['#f8c0d8', '#fff4d0', '#8a5a3a'][i % 3]; ctx.beginPath(); ctx.arc(px + 1.8, py - 5.2, 0.9, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    }
  }
  // Seconds the van has been standing at stop `si` (0 when it just pulled up).
  function _stopClock(stops, si, start, tau) {
    let x = start, t = 0;
    for (let i = 0; i <= si; i++) { t += (stops[i] - x) / ICE_SPEED; x = stops[i]; if (i < si) t += ICE_STOP; }
    return tau - t;
  }

  // Block party: at weekends, on one street of a neighbourhood that's big
  // enough to have a community.
  function blockParty(ctx, base, streets, vis) {
    if (!_weekend || _hr < 13 || _hr > 20.5 || _rain > 0.08 || _season === 3) return;
    const seen = new Set();
    for (const S of streets) {
      if (seen.has(S.zi) || (_zoneHomes[S.zi] || 0) < 24 || S.cols.length < 6) continue;
      const list = streets.filter(o => o.zi === S.zi && o.cols.length >= 6);
      seen.add(S.zi);
      if (_h(S.zi, _day, 50) > 0.6) continue;
      const P0 = list[Math.floor(_h(S.zi, _day, 51) * list.length)];
      const xa = P0.c0 * TS, xb = (P0.c1 + 1) * TS, y = P0.R * TS + TS / 2;
      if (!vis(xa, xb, y - 30, y + 30)) continue;
      _note('blockparty', (xa / TS) | 0, (y / TS) | 0);
      const a = win(_hr, 13, 20.5, 0.3);
      if (_detail) {
        for (let x = xa; x < xb - 30; x += 46) bunting(ctx, x, y - 14, x + 46, y - 14, _t, (x / 46) | 0, 4);
        if (_dark > 0.2) stringLights(ctx, xa, xb, y - 18, _t, a, _dark);
      }
      // trestle tables down the middle of the street
      const nT = Math.max(1, Math.floor((xb - xa) / 120));
      for (let i = 0; i < nT; i++) {
        const tx = xa + (i + 0.5) * (xb - xa) / nT;
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(tx - 12, y + 1, 26, 1.4);
        ctx.fillStyle = '#f4f2ec'; ctx.fillRect(tx - 13, y - 3.4, 26, 3);
        ctx.fillStyle = '#c83a32'; for (let j = 0; j < 5; j++) ctx.fillRect(tx - 11 + j * 5, y - 3.4, 2, 3);
        for (let j = 0; j < 6; j++) {
          const px = tx - 11 + j * 4.4, side = j % 2;
          P(ctx, px, side ? y - 4.5 : y + 6.5, 'walker', P0.R * 97 + i * 13 + j, a, side ? 3 : (Math.floor(_t / 2.7 + j) % 4 ? 1 : 2), 0);
        }
      }
      // kids running about and a ball game at each end
      for (let i = 0; i < 4; i++) {
        const ph = _t * (0.25 + _h(i, 3) * 0.2) + _h(P0.R, i);
        const kx = xa + 20 + ((Math.sin(ph) + 1) / 2) * (xb - xa - 40), ky = y + 10 + Math.sin(ph * 2.3) * 3;
        Kid(ctx, base, kx, ky, P0.R * 31 + i, a, 0, Math.cos(ph) > 0 ? 1 : -1, i === 3 ? 'scooter' : 'walker');
      }
      if (--_budget > 0) L.drawGroup(ctx, base, 'ball', xa + 18, y + 4, true, P0.R * 7 + 1, _t, a, _dark, _detail, { chatKind: 'walker' });
      if (--_budget > 0) L.drawGroup(ctx, base, 'chat', xb - 18, y + 4, true, P0.R * 7 + 2, _t, a, _dark, _detail, { chatKind: 'walker' });
    }
  }

  // ── Businesses ────────────────────────────────────────────────────
  const TERRACE = {   // opening hours [from, to] (to may pass midnight)
    cafe: [7, 18], bakery: [6.5, 16], kakery: [7, 18], restaurant: [11, 23], fastfood: [10, 22],
    donutshop: [6, 13], hotdog: [12, 26], pizzeria: [12, 23], finedining: [18, 23.5], jazzbar: [19, 25], supperclub: [20, 25.5], truckstop: [6, 22],
  };
  const CLUB = { nightclub: [22, 28], disco: [21, 27], superclub: [22, 29], venue: [18.5, 20.5], jazzbar: [19.5, 21] };
  const DELIVER = new Set(['cafe', 'bakery', 'kakery', 'restaurant', 'fastfood', 'donutshop', 'hotdog', 'pizzeria', 'grocery', 'pharmacy', 'clothing',
    'gym', 'finedining', 'supperclub', 'jazzbar', 'truckstop', 'mall', 'galleria', 'arcade', 'hotel', 'motel', 'boutiquehotel', 'clinic']);
  const inHours = (hr, [a, b]) => hr >= a && hr <= b || (b > 24 && hr + 24 <= b);
  function business(ctx, base, e) {
    const k = _id(e), sub = e.commercialSubtype, w = e.width || 1, h = e.height || 1;
    const x0 = e.col * TS, x1 = (e.col + w) * TS, fy = (e.row + h) * TS, fx = (x0 + x1) / 2;
    const dry = _rain < 0.1;
    // Terrace tables in front
    const hrs = TERRACE[sub];
    if (hrs && dry && _temp > 7 && _snow < 0.3 && inHours(_hr, hrs)) {
      const a = 1;
      _note('terrace', (fx / TS) | 0, (fy / TS) | 0);
      const n = Math.max(2, Math.min(5, Math.floor((x1 - x0) / 18)));
      for (let i = 0; i < n; i++) {
        const tx = x0 + (i + 0.5) * (x1 - x0) / n + (i === Math.floor(n / 2) ? 7 : 0), ty = fy + 6;
        // chairs either side, people at some
        const busy = _h(k, i, Math.floor(_hr * 2)) < 0.75;
        if (busy) P(ctx, tx - 3.2, ty, 'walker', k * 17 + i * 2 + Math.floor(_hr), a, 3, 1);
        if (busy && _h(k, i, 2) < 0.6) P(ctx, tx + 3.2, ty, 'shopper', k * 17 + i * 2 + 1 + Math.floor(_hr), a, 3, -1);
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(tx + 0.6, ty + 0.4, 2.6, 0.9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4a4e52'; ctx.fillRect(tx - 0.3, ty - 3.2, 0.6, 3.2);
        ctx.fillStyle = '#f4f2ec'; ctx.beginPath(); ctx.ellipse(tx, ty - 3.4, 2.6, 1, 0, 0, Math.PI * 2); ctx.fill();
        if (_detail) {
          ctx.fillStyle = '#8a5a3a'; ctx.fillRect(tx - 0.6, ty - 4.6, 1.2, 1);       // cups
          if (_dark > 0.3) { ctx.fillStyle = '#ffe8a0'; ctx.fillRect(tx + 0.8, ty - 4.8, 0.7, 1); glow(ctx, tx, ty - 3, 7, a, _dark); }
          else {                                                       // parasol by day
            ctx.fillStyle = '#4a4e52'; ctx.fillRect(tx - 0.25, ty - 12, 0.5, 8.6);
            ctx.fillStyle = ['#2a6a4a', '#c83a32', '#1e2a3a', '#e8c020'][Math.floor(_h(k, 7) * 4)];
            ctx.beginPath(); ctx.arc(tx, ty - 11, 5, Math.PI, 0); ctx.closePath(); ctx.fill();
          }
        }
      }
      // a waiter doing the rounds
      if (_detail) {
        const cyc = (_t / 9 + _h(k, 8)) % 1, u = cyc < 0.5 ? cyc * 2 : 2 - cyc * 2;
        P(ctx, x0 + 6 + (x1 - x0 - 12) * u, fy + 2, sub === 'fastfood' || sub === 'truckstop' ? 'chef' : 'vendor', k * 3, 1, u > 0.02 && u < 0.98 ? 0 : 2, cyc < 0.5 ? 1 : -1);
      }
    }
    // Morning delivery: a van at the kerb and a hand truck of boxes
    if (DELIVER.has(sub) && _h(k, _day, 20) < 0.45) {
      const s = 6 + _h(k, _day, 21) * 3.5, a = win(_hr, s, s + 0.4, 0.04);
      if (a > 0) {
        _note('delivery', (fx / TS) | 0, (fy / TS) | 0);
        const vx = fx + 14, vy = fy + TS / 2 - 4;
        Veh(ctx, base, vx, vy, 'van', Math.PI, k, a);
        const cyc = (_t / 8 + _h(k, 22)) % 1, toDoor = cyc < 0.5, u = toDoor ? cyc * 2 : (cyc - 0.5) * 2;
        const xa = vx + 12, xb = fx;
        const x = toDoor ? xa + (xb - xa) * u : xb + (xa - xb) * u, y = fy + 6;
        P(ctx, x, y, 'worker', k * 5, a, 0, toDoor ? -1 : 1);
        ctx.fillStyle = '#4a4e52'; ctx.fillRect(x + (toDoor ? -4 : 2.6), y - 6, 0.5, 6);   // hand truck
        if (toDoor) { box(ctx, x - 4.6, y - 0.2, 0.8); box(ctx, x - 4.6, y - 3, 0.8, 1); }
      }
    }
    // The queue outside the clubs (and the doors before a show)
    const club = CLUB[sub];
    if (club && inHours(_hr, club) && _rain < 0.5) {
      _note('clubqueue', (fx / TS) | 0, (fy / TS) | 0);
      const ramp = Math.min(1, (_hr - club[0] + (_hr < club[0] ? 24 : 0)) / 0.4);
      const n = Math.floor((4 + _h(k, _day, 23) * 7) * ramp);
      const dx = fx - 6;
      // rope line
      ctx.fillStyle = '#c8a040'; ctx.fillRect(dx + 3, fy + 1, 0.7, 4); ctx.fillRect(dx + 3 + n * 4.2 + 2, fy + 1, 0.7, 4);
      ctx.strokeStyle = '#a02a3a'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(dx + 3.3, fy + 2); ctx.quadraticCurveTo(dx + 3 + n * 2.1, fy + 3.4, dx + 5 + n * 4.2, fy + 2); ctx.stroke();
      P(ctx, dx, fy + 4, 'guard', k * 7, 1, 1, 1);
      for (let i = 0; i < n; i++) P(ctx, dx + 5 + i * 4.2 + Math.sin(_t * 0.6 + i) * 0.3, fy + 6 + (i % 2) * 0.8, i % 3 ? 'walker' : 'shopper', k * 19 + i + _day * 3, 1, (Math.floor(_t / 2 + i) % 5) ? 1 : 2, -1);
    }
  }

  // Food trucks: a couple per commercial zone through the lunch hour,
  // parked outside a business, each with its queue.
  function foodTrucks(ctx, base, vis) {
    if (_hr < 11.2 || _hr > 14.3 || _rain > 0.3) return;
    const a = win(_hr, 11.2, 14.3, 0.2);
    const rects = ZoneSystem.getZoneRects('commercial') || [];
    rects.forEach((rect, zi) => {
      if (!vis(rect.minC * TS, (rect.maxC + 1) * TS, rect.minR * TS, (rect.maxR + 2) * TS)) return;
      const hosts = _membersIn(T.COMMERCIAL, rect, e => !e.isIndustrial && (e.width || 1) >= 3);
      const n = Math.min(hosts.length, 1 + Math.floor(_h(zi, _day, 60) * 2.5));
      for (let i = 0; i < n; i++) {
        const e = hosts[Math.floor(_h(zi, _day * 7 + i, 61) * hosts.length)];
        foodTruckAt(ctx, base, e, zi * 53 + i, a, 'shopper');
      }
    });
  }
  function foodTruckAt(ctx, base, e, k, a, kind) {
    const w = e.width || 1, h = e.height || 1;
    const fx = (e.col + w / 2) * TS, fy = (e.row + h) * TS, vy = fy + TS / 2 - 3;
    if (!_visXY(fx, vy)) return;
    _note('foodtruck', (fx / TS) | 0, (fy / TS) | 0);
    Veh(ctx, base, fx, vy, 'foodtruck', Math.PI, k, a);
    P(ctx, fx - 2, vy - 7, 'chef', k * 3, a, 2, 0);
    smoke(ctx, fx + 3, vy - 9, _t, k, a, 2, 6);
    const n = 3 + Math.floor(_h(k, _day, 62) * 5);
    for (let i = 0; i < n; i++) P(ctx, fx - 6 - i * 4.2, fy + 5 + (i % 2) * 0.8, i % 2 ? kind : 'walker', k * 23 + i + _day, a, (Math.floor(_t / 2.4 + i) % 6) ? 1 : 2, 1);
    // a couple eating off to the side
    P(ctx, fx + 16, fy + 6, kind, k * 23 + 40, a, 2, -1);
    P(ctx, fx + 20, fy + 6, 'walker', k * 23 + 41, a, 1, -1);
  }

  // ── Industry ──────────────────────────────────────────────────────
  const SHIFTS = [6, 14, 22];
  function plant(ctx, base, e) {
    const k = _id(e), w = e.width || 1, h = e.height || 1;
    const x0 = e.col * TS, x1 = (e.col + w) * TS, fy = (e.row + h) * TS, fx = (x0 + x1) / 2;
    for (const S of SHIFTS) {
      let d = _hr - S; if (d < -12) d += 24; if (d > 12) d -= 24;
      if (d < -0.45 || d > 0.45) continue;
      _note('shift', (fx / TS) | 0, (fy / TS) | 0);
      const n = Math.min(14, 4 + w);
      for (let i = 0; i < n; i++) {
        const leaving = i % 2 === 1;                                // the shift going home passes the one coming in
        const st = (_h(k, i, S) - 0.5) * 0.6;                       // when this one passes the gate (hours from S)
        const u = (d - st) / 0.18;                                  // -1..1 across the walk
        if (u < -1 || u > 1) continue;
        const side = _h(k, i, 3) < 0.5 ? -1 : 1;
        const far = fx + side * ((x1 - x0) / 2 + 30);
        const s = leaving ? (u + 1) / 2 : 1 - (u + 1) / 2;          // 0 at the gate, 1 out at the street end
        const x = fx + (far - fx) * s + (_h(k, i, 4) - 0.5) * 6, y = fy + 5 + (_h(k, i, 5) - 0.5) * 3;
        const a = Math.min(1, (1 - Math.abs(u)) * 4);
        P(ctx, x, y, 'worker', k * 29 + i + S, a, 0, (leaving ? side : -side));
      }
    }
  }
  function lunchTrucks(ctx, base, vis) {
    if (_hr < 11.7 || _hr > 13.2 || _weekend) return;
    const a = win(_hr, 11.7, 13.2, 0.12);
    (ZoneSystem.getZoneRects('industrial') || []).forEach((rect, zi) => {
      if (!vis(rect.minC * TS, (rect.maxC + 1) * TS, rect.minR * TS, (rect.maxR + 2) * TS)) return;
      const hosts = [..._membersIn(T.INDUSTRIAL, rect, () => true), ..._membersIn(T.COMMERCIAL, rect, e => e.isIndustrial)];
      if (!hosts.length) return;
      const e = hosts[Math.floor(_h(zi, _day, 70) * hosts.length)];
      foodTruckAt(ctx, base, e, zi * 61 + 7, a, 'worker');
    });
  }

  function _membersIn(type, rect, f) {
    const out = [];
    for (const e of EntityRegistry.getByType(type)) {
      if (!e.fromRequest || e.col < rect.minC || e.col > rect.maxC || e.row < rect.minR || e.row > rect.maxR) continue;
      if (f(e)) out.push(e);
    }
    out.sort((a, b) => (a.col - b.col) || (a.row - b.row));   // stable order for the hashed picks
    return out;
  }

  let _vx0 = 0, _vx1 = 0, _vy0 = 0, _vy1 = 0;
  const _visXY = (x, y) => x > _vx0 - 40 && x < _vx1 + 40 && y > _vy0 - 40 && y < _vy1 + 40;
  const _visBox = (xa, xb, ya, yb) => xb > _vx0 - 40 && xa < _vx1 + 40 && yb > _vy0 - 40 && ya < _vy1 + 40;

  function render(ctx, t) {
    if (typeof ZoneLife === 'undefined' || !ZoneLife.drawPerson || typeof ZoneSystem === 'undefined') return;
    L = ZoneLife;
    const lv = typeof GfxQuality !== 'undefined' ? GfxQuality.level() : 2;
    if (Camera.zoom < (lv === 0 ? 0.8 : 0.45)) return;
    _detail = lv !== 0 && Camera.zoom > 0.7;
    _budget = lv === 2 ? 500 : lv === 1 ? 300 : 100;
    _stats = {};
    _t = t;
    _dark = DayNight.darkness();
    _hr = DayNight.hour();
    _day = DayNight.day();
    _el = DayNight.getElapsed();
    _weekend = _day % 7 >= 5;
    _season = typeof Seasons !== 'undefined' && Seasons.index ? Seasons.index() : 1;
    _rain = L.rain ? L.rain() : 0;
    _snow = typeof FrostSystem !== 'undefined' ? (FrostSystem.coverage || 0) : 0;
    _temp = typeof WeatherEventSystem !== 'undefined' && WeatherEventSystem.getTemperature ? WeatherEventSystem.getTemperature() : 15;
    const tl = Camera.screenToWorld(0, 0), br = Camera.screenToWorld(window.innerWidth, window.innerHeight);
    _vx0 = tl.x; _vy0 = tl.y; _vx1 = br.x; _vy1 = br.y;
    const base = ctx.getTransform();
    const onScreen = (e) => {
      const w = (e.width || 1) * TS, h = (e.height || 1) * TS;
      return e.col * TS + w > _vx0 - 3 * TS && e.col * TS < _vx1 + 3 * TS && e.row * TS - 3 * TS < _vy1 && e.row * TS + h + 2 * TS > _vy0;
    };
    const fresh = (e) => e._movedIn !== undefined && _el - e._movedIn >= 0 && _el - e._movedIn < DAY;

    for (const e of EntityRegistry.getByType(T.HOUSE)) {
      if (_budget <= 0) break;
      if (!e.fromRequest || e._constructing || !onScreen(e)) continue;
      if (fresh(e)) { moveInHome(ctx, base, e, (_el - e._movedIn) / DAY, _id(e)); continue; }
      if (!e.commercialSubtype && (e.width || 1) === 1) home(ctx, base, e);
    }
    for (const type of [T.COMMERCIAL, T.INDUSTRIAL]) for (const e of EntityRegistry.getByType(type)) {
      if (_budget <= 0) break;
      if (!e.fromRequest || e._constructing || !onScreen(e)) continue;
      const ind = type === T.INDUSTRIAL || e.isIndustrial;
      if (fresh(e)) { grandOpening(ctx, base, e, (_el - e._movedIn) / DAY, _id(e), ind); continue; }
      if (ind) plant(ctx, base, e); else business(ctx, base, e);
    }
    const streets = _homeStreets();
    for (const S of streets) { if (_budget <= 0) break; mailRound(ctx, base, S, _visBox); }
    if (_budget > 0) iceCream(ctx, base, streets, _visBox);
    if (_budget > 0) blockParty(ctx, base, streets, _visBox);
    if (_budget > 0) foodTrucks(ctx, base, _visBox);
    if (_budget > 0) lunchTrucks(ctx, base, _visBox);
    ctx.setTransform(base);
    ctx.globalAlpha = 1;
  }

  return { render, stats: () => _stats };
})();
