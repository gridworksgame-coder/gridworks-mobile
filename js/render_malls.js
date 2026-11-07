/* ═══════════════════════════════════════════════════════════════════
   MALLS
   Two malls alongside the Shopping Mall (render_residential_commercial.js),
   arriving at the same point in the game. Like it, each is authored for a
   7×5 footprint and drawn scaled up to its 10×7 one (ArtFootprints), so
   the shoppers and cars on it sit at street scale. Drawn through
   _commNative with the kit from render_banks.js (_bankKit), front-on from
   slightly above. Authored in a 280×200 box.

     galleria  Aurora Galleria    glass curtain wall, aurora LED ribbons,
                                  rooftop sign, video billboard
     arcade    The Grand Arcade   Victorian iron-and-glass arcade, clock
                                  tower, carousel on a cobbled square

   Both keep trading hours (DemandCurves.hours): open is when the shops
   are lit and busy. The Galleria's façade lights stay on all night; the
   Arcade's square keeps its lamps and string lights.
   ═══════════════════════════════════════════════════════════════════ */

const _MALL_TOPS  = ['#d04060', '#3060c0', '#40a060', '#e0a020', '#8040c0', '#2a2a2a', '#e07040', '#2a8aa0'];
const _MALL_SKINS = ['#f0d0b0', '#c89870', '#8a5a3a', '#e0b890', '#6a4630'];
const _mallHash = (e, n) => _cmFrac((e.col || 0) * 3.17 + (e.row || 0) * 7.31 + n);

// Shoppers strolling over a strip y0..y1 between x0 and x1, each on a slow
// wander of their own; a few carry a bag.
function _mallCrowd(k, e, t, n, x0, x1, y0, y1, bags) {
  for (let q = 0; q < n; q++) {
    const base = x0 + (x1 - x0) * _mallHash(e, q * 1.3 + 11);
    const x = Math.max(x0, Math.min(x1, base + Math.sin(t * 0.35 + q * 1.7) * 14));
    const y = y0 + (y1 - y0) * _mallHash(e, q * 2.1 + 5);
    k.person(x, y, _MALL_TOPS[q % _MALL_TOPS.length], _MALL_SKINS[q % _MALL_SKINS.length], 0, 1.05);
    if (bags && q % 3 === 0) k.R(x + 1.3, y - 2.6, 2.2, 2.6, bags[q % bags.length]);
  }
}

/* ── Aurora Galleria ────────────────────────────────────────────────
   A long pill of glass on three floors: shops glowing through the
   curtain wall, escalators zig-zagging up the atrium, and LED ribbons
   along every floor edge that ripple green, teal and violet after dark,
   like the aurora it is named for. A cantilevered sign rides the roof
   beside a glass dome, a video billboard runs ads on the east end, and
   the façade doubles in a reflecting pool on the plaza. */
function _renderGalleria(e, px, py, W, H, t) {
  const S = Math.min(W / 280, H / 200), on = e.powered;
  const k = _bankKit(px, py, S);
  const { X, Y, R, RR, dot, ell, poly, ln, glow, text } = k;
  const dark = DayNight.darkness(), night = dark > 0.3;
  const open = _bankOpen('galleria', on);
  const lit = on && (open || night);           // the façade lights run all night
  const L = (d, n, o) => on ? (night ? n : d) : o;
  const detail = Camera.zoom > 0.45;
  // The aurora: a hue rolling along the building with time, green → teal → violet.
  const aurora = (x, a, ph = 0) => {
    const w = 0.5 + 0.5 * Math.sin(x * 0.028 - t * 0.7 + ph);
    const w2 = 0.5 + 0.5 * Math.sin(x * 0.011 + t * 0.31 + ph * 2);
    const h = 140 + w * 70 + w2 * 60;                      // 140 (green) … 270 (violet)
    return `hsla(${h.toFixed(0)},95%,${(58 + 12 * w2).toFixed(0)}%,${a.toFixed(3)})`;
  };
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, 280 * S, 200 * S); ctx.clip();

  // ── Parking ──
  R(4, 164, 272, 34, L('#3a3c42', '#22242a', '#16171a'));
  for (let x = 14; x < 270; x += 16) R(x, 166, 0.7, 13, L('rgba(240,240,230,0.6)', 'rgba(200,200,190,0.25)', 'rgba(0,0,0,0.2)'));
  for (let i = 0, x = 22; x < 266; x += 16, i++) {
    if (_mallHash(e, i + 40) < (open ? 0.72 : night ? 0.1 : 0.2)) _hotelCar(k, x, 172.5, _HOTEL_CARS[i % _HOTEL_CARS.length], night, 1);
  }
  R(4, 184, 272, 1, 'rgba(255,255,255,0.06)');
  if (open) {                                       // a car cruising for a space
    const cx = 10 + ((t * 18) % 300);
    if (cx < 270) {
      RR(cx - 6, 187, 12, 7, 2, '#f0f0f0'); R(cx + 1.5, 188, 3, 5, '#2a3a48');
      if (night) { const g = ctx.createLinearGradient(X(cx + 6), 0, X(cx + 26), 0); g.addColorStop(0, 'rgba(255,245,200,0.4)'); g.addColorStop(1, 'rgba(255,245,200,0)'); ctx.fillStyle = g; poly([[cx + 6, 188.5], [cx + 26, 185], [cx + 26, 197], [cx + 6, 192.5]], g); }
    }
  }

  // ── Plaza and reflecting pool ──
  R(4, 140, 272, 24, L('#e4e0d8', '#5a5c66', '#2a2b30'));
  if (detail) for (let x = 4; x < 276; x += 12) R(x, 140, 0.4, 24, 'rgba(0,0,0,0.07)');
  R(4, 162.5, 272, 1.5, L('#c4beb2', '#44464e', '#202124'));
  RR(36, 146, 208, 8, 1.5, L('#9ab6c4', '#0e1a2a', '#14181e'));
  RR(37, 147, 206, 6, 1.2, L('#5a9cc0', '#0a1626', '#101418'));
  if (lit) {                                        // the ribbons doubled in the water
    for (let x = 38; x < 242; x += 3) R(x, 148 + Math.sin(x * 0.3 + t * 2) * 0.4, 2.4, 0.8, aurora(x, night ? 0.75 : 0.25));
  }
  if (!night) { const gx = 38 + ((t * 9) % 220); if (gx < 236) R(gx, 147.5, 6, 0.8, 'rgba(255,255,255,0.55)'); }
  for (const tx of [20, 260]) {                     // trees in planters
    RR(tx - 6, 148, 12, 6, 1, L('#8a8478', '#3a3a40', '#1e1e20'));
    dot(tx, 141, 7, L('#3e8a44', '#1e3a26', '#16201a'));
    dot(tx - 3, 139, 4.5, L('#56a050', '#244a2c', '#1a241c'));
    dot(tx + 3.5, 138, 4, L('#4a9448', '#22422a', '#18221a'));
  }
  if (detail) for (const bx of [70, 210]) { R(bx - 7, 157, 14, 1.6, L('#6a4a30', '#3a2a1e', '#1e1814')); R(bx - 6, 158.6, 1, 2, '#2a2a2e'); R(bx + 5, 158.6, 1, 2, '#2a2a2e'); }

  // ── Roof: dome, garden, and the sign on its truss ──
  // glass dome on the east roof
  ctx.save();
  ctx.beginPath(); ctx.ellipse(X(222), Y(37), 22 * S, 17 * S, 0, Math.PI, 0); ctx.closePath();
  const dg = ctx.createLinearGradient(0, Y(20), 0, Y(37));
  if (lit) { dg.addColorStop(0, '#ffe8b8'); dg.addColorStop(1, '#c88a50'); } else if (night) { dg.addColorStop(0, '#2a3446'); dg.addColorStop(1, '#141a26'); } else { dg.addColorStop(0, '#d4ecf8'); dg.addColorStop(1, '#6a94b4'); }
  ctx.fillStyle = dg; ctx.fill(); ctx.clip();
  ctx.strokeStyle = 'rgba(60,64,74,0.7)'; ctx.lineWidth = 0.8 * S;
  for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.ellipse(X(222), Y(37), Math.abs(i) * 5 * S + 0.01, 17 * S, 0, Math.PI, 0); ctx.stroke(); }
  for (const yy of [26, 31]) ln(198, yy, 246, yy, 'rgba(60,64,74,0.6)', 0.8);
  if (!night) R(206, 20, 6, 17, 'rgba(255,255,255,0.3)');
  ctx.restore();
  if (lit) glow(222, 30, 26, '255,210,150', night ? 0.3 : 0.08);
  // roof garden on the west end
  for (let i = 0; i < 4; i++) {
    const gx = 34 + i * 9;
    R(gx - 3, 33, 6, 3, L('#7a6a58', '#3a342c', '#1e1c18'));
    dot(gx, 30.5, 3.6, L(i % 2 ? '#4a9a48' : '#3a8a40', '#1e3a26', '#16201a'));
  }
  // sign truss
  for (const sx of [86, 120, 154, 188]) ln(sx, 36, sx, 22, L('#5a5e66', '#2a2e36', '#1a1c20'), 1.4);
  ln(80, 22, 194, 22, L('#5a5e66', '#2a2e36', '#1a1c20'), 1.2);
  for (let sx = 86; sx < 188; sx += 17) { ln(sx, 36, sx + 17, 22, L('rgba(90,94,102,0.7)', 'rgba(42,46,54,0.8)', '#1a1c20'), 0.7); }
  RR(78, 3, 118, 19, 2, L('#f4f6f8', '#0c1018', '#121418'));
  if (lit && night) {
    const sg = ctx.createLinearGradient(X(78), 0, X(196), 0);
    for (let i = 0; i <= 6; i++) sg.addColorStop(i / 6, aurora(78 + i * 20, 1));
    ctx.save(); ctx.shadowColor = aurora(137, 1); ctx.shadowBlur = 10 * S;
    text('AURORA', 137, 10.5, 10, 110, sg, '"Arial Black", Arial, sans-serif');
    ctx.restore();
    text('GALLERIA', 137, 18.4, 4.4, 60, 'rgba(230,240,255,0.95)', 'Arial, sans-serif');
    glow(137, 12, 60, '120,255,200', 0.12);
  } else {
    text('AURORA', 137, 10.5, 10, 110, on ? '#1e3a5a' : '#3a3e46', '"Arial Black", Arial, sans-serif');
    text('GALLERIA', 137, 18.4, 4.4, 60, on ? '#3aa890' : '#3a3e46', 'Arial, sans-serif');
  }

  // ── The glass pill ──
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.roundRect(X(18), Y(40), 252 * S, 104 * S, [50 * S, 8 * S, 8 * S, 50 * S]); ctx.fill();
  const pill = () => { ctx.beginPath(); ctx.roundRect(X(14), Y(36), 252 * S, 104 * S, [50 * S, 8 * S, 8 * S, 50 * S]); };
  pill();
  const gg = ctx.createLinearGradient(0, Y(36), 0, Y(140));
  if (lit) { gg.addColorStop(0, '#1a2036'); gg.addColorStop(1, '#262a40'); }
  else if (night) { gg.addColorStop(0, '#141a28'); gg.addColorStop(1, '#0e121c'); }
  else if (on) { gg.addColorStop(0, '#a8d2ec'); gg.addColorStop(0.55, '#6a9cc0'); gg.addColorStop(1, '#3e6a8c'); }
  else { gg.addColorStop(0, '#3a4048'); gg.addColorStop(1, '#22262c'); }
  ctx.fillStyle = gg; ctx.fill();
  ctx.save(); pill(); ctx.clip();
  // shops on each floor, glowing through the glass
  const floors = [[40, 70], [72, 104], [106, 138]];
  const tints = ['255,214,150', '255,190,200', '190,230,255', '210,255,200', '255,236,170', '230,200,255'];
  floors.forEach(([y0, y1], f) => {
    for (let i = 0, x = 16; x < 266; x += 22, i++) {
      if (x > 112 && x < 160) continue;                // the atrium
      if (x > 206 && x < 260 && f < 2) continue;       // the billboard
      const shop = _mallHash(e, f * 31 + i);
      const shopOpen = open && shop > 0.1;
      const a = shopOpen ? (night ? 0.42 : 0.55) + 0.1 * Math.sin(t * 1.3 + i + f) : lit ? 0.1 : 0;
      if (a > 0) R(x + 1, y0 + 4, 20, y1 - y0 - 4, `rgba(${tints[(i + f * 2) % tints.length]},${a.toFixed(3)})`);
      if (shopOpen && detail) {
        R(x + 3, y1 - 6, 16, 1, 'rgba(40,30,40,0.35)');                       // counters / racks
        if (shop > 0.55) k.person(x + 6 + shop * 10, y1 - 0.5, _MALL_TOPS[(i + f) % 8], _MALL_SKINS[i % 5], 0, 0.9);
      }
    }
  });
  // atrium: escalators zig-zagging up through the floors
  if (lit) R(112, 36, 48, 104, open ? 'rgba(255,230,180,0.28)' : 'rgba(120,140,190,0.12)');
  const runs = [[118, 138, 154, 106], [154, 104, 118, 72]];
  for (const [x1, y1, x2, y2] of runs) {
    ln(x1, y1, x2, y2, L('rgba(70,74,84,0.85)', 'rgba(30,34,44,0.9)', 'rgba(20,22,26,0.9)'), 3.6);
    ln(x1, y1 - 2.4, x2, y2 - 2.4, L('rgba(220,235,245,0.6)', 'rgba(140,180,220,0.35)', 'rgba(60,66,74,0.5)'), 0.8);
    if (open) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1 * S;
      ctx.setLineDash([2 * S, 3 * S]); ctx.lineDashOffset = -t * 10 * S;
      ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      const p = (t * 0.12 + (x1 > x2 ? 0.5 : 0)) % 1;                       // a rider
      k.person(x1 + (x2 - x1) * p, y1 + (y2 - y1) * p - 1, '#e05080', '#e0b890', 0, 0.9);
    }
  }
  // hanging banners in the atrium
  [[122, '#ff5ab0'], [150, '#40c0ff']].forEach(([bx, c], i) => {
    poly([[bx - 3, 40], [bx + 3, 40], [bx + 3, 60 + Math.sin(t * 1.4 + i) * 0.8], [bx, 57], [bx - 3, 60 + Math.sin(t * 1.4 + i) * 0.8]], on ? c : '#3a3e46');
  });
  // after dark, the aurora itself: soft curtains of colour drifting across the glass
  if (lit && night && detail) {
    for (let i = 0; i < 7; i++) {
      const cx = 14 + ((i * 41 + t * (6 + i)) % 300) - 20, w = 18 + 10 * _cmFrac(i + 3);
      const cg = ctx.createLinearGradient(X(cx - w), 0, X(cx + w), 0);
      cg.addColorStop(0, aurora(cx, 0)); cg.addColorStop(0.5, aurora(cx, 0.16 + 0.08 * Math.sin(t * 0.9 + i))); cg.addColorStop(1, aurora(cx, 0));
      ctx.fillStyle = cg; ctx.fillRect(X(cx - w), Y(36), 2 * w * S, 104 * S);
    }
  }
  // floor slabs, with the LED ribbons along their edges and a glow band behind
  for (const sy of [70, 104, 138]) {
    if (lit && night) {
      const bg = ctx.createLinearGradient(X(14), 0, X(266), 0);
      for (let i = 0; i <= 8; i++) bg.addColorStop(i / 8, aurora(14 + i * 31.5, 0.38, sy * 0.05));
      ctx.fillStyle = bg; ctx.fillRect(X(14), Y(sy - 4), 252 * S, 10 * S);
    }
    R(14, sy, 252, 2.6, L('#d8dee4', '#2a2e38', '#1e2026'));
    if (lit) {
      for (let x = 14; x < 266; x += 2) R(x, sy + 0.3, 2.1, 2, aurora(x, night ? 1 : 0.55, sy * 0.05));
    }
  }
  // mullions
  for (let x = 16; x < 266; x += 11) R(x, 36, 0.6, 104, L('rgba(40,50,64,0.35)', 'rgba(10,14,22,0.6)', 'rgba(10,12,16,0.6)'));
  // daytime reflection sweep
  if (on && !night) {
    const gp = 14 + ((t * 10) % 330) - 40;
    poly([[gp, 140], [gp + 10, 140], [gp + 44, 36], [gp + 34, 36]], 'rgba(255,255,255,0.18)');
    R(14, 36, 252, 10, 'rgba(255,255,255,0.12)');
  }
  ctx.restore();
  // roof edge with its own ribbon
  ctx.strokeStyle = L('#e8ecf0', '#30343e', '#1e2026'); ctx.lineWidth = 2.2 * S; pill(); ctx.stroke();
  if (lit) {
    ctx.save(); pill(); ctx.lineWidth = 1.2 * S;
    const rg = ctx.createLinearGradient(X(14), 0, X(266), 0);
    for (let i = 0; i <= 8; i++) rg.addColorStop(i / 8, aurora(14 + i * 31.5, night ? 1 : 0.6, 1));
    ctx.strokeStyle = rg; if (night) { ctx.shadowColor = aurora(140, 1, 1); ctx.shadowBlur = 6 * S; }
    ctx.stroke(); ctx.restore();
  }

  // ── Video billboard on the east end ──
  RR(208, 42, 52, 62, 1.5, '#0c0e12');
  if (on) {
    const ads = [
      { bg: ['#ff3a7a', '#ff9a3a'], rgb: '255,90,120', l1: 'MEGA SALE', l2: '50% OFF', fg: '#fff' },
      { bg: ['#1a3aff', '#40d8ff'], rgb: '60,140,255', l1: 'NEW IN', l2: 'SPRING', fg: '#fff' },
      { bg: ['#10a060', '#b8ff60'], rgb: '80,220,120', l1: 'FOOD HALL', l2: 'LEVEL 3', fg: '#0a2a14' },
      { bg: ['#6a20c0', '#ff50d0'], rgb: '200,80,240', l1: 'LATE', l2: 'TIL 11PM', fg: '#fff' },
    ];
    const slot = Math.floor(t / 6), fade = Math.min(1, (t % 6) / 0.4);
    const ad = ads[slot % ads.length];
    const bg = ctx.createLinearGradient(0, Y(44), 0, Y(102));
    bg.addColorStop(0, ad.bg[0]); bg.addColorStop(1, ad.bg[1]);
    ctx.globalAlpha = (night ? 1 : 0.85) * fade;
    ctx.fillStyle = bg; ctx.fillRect(X(210), Y(44), 48 * S, 58 * S);
    // a shape that drifts on each ad
    const sx = 234 + Math.sin(t * 1.2) * 10, sy = 66 + Math.cos(t * 0.9) * 4;
    dot(sx, sy, 9, 'rgba(255,255,255,0.22)');
    dot(sx + 6, sy - 4, 4, 'rgba(255,255,255,0.3)');
    text(ad.l1, 234, 84, 6, 44, ad.fg, '"Arial Black", Arial, sans-serif');
    text(ad.l2, 234, 93, 5, 40, ad.fg, 'Arial, sans-serif');
    ctx.globalAlpha = 1;
    if (detail) for (let y = 44; y < 102; y += 2) R(210, y, 48, 0.4, 'rgba(0,0,0,0.12)');   // scanlines
    if (night) glow(234, 73, 44, ad.rgb, 0.14 * fade);
  }
  ctx.strokeStyle = '#3a3e46'; ctx.lineWidth = 1 * S; ctx.strokeRect(X(208), Y(42), 52 * S, 62 * S);

  // ── Entrance: canopy and doors ──
  R(116, 128, 48, 12, L('#2a2e38', '#141820', '#121418'));
  R(118, 129.5, 44, 10.5, lit ? (open ? 'rgba(255,236,190,0.9)' : 'rgba(140,160,200,0.35)') : L('#4a6a84', '#182030', '#1a1c20'));
  for (const dx of [129, 140, 151]) R(dx, 129.5, 0.8, 10.5, '#2a2e38');
  poly([[108, 124], [172, 124], [176, 128], [104, 128]], L('#f4f6f8', '#3a3e48', '#22242a'));
  if (lit) for (let x = 106; x < 174; x += 2) R(x, 127.4, 1.8, 0.8, aurora(x, night ? 0.9 : 0.5, 2));
  if (lit && night) {
    const sg = ctx.createRadialGradient(X(140), Y(140), 0, X(140), Y(140), 40 * S);
    sg.addColorStop(0, 'rgba(255,224,170,0.42)'); sg.addColorStop(1, 'rgba(255,224,170,0)');
    ctx.fillStyle = sg; ctx.fillRect(X(100), Y(140), 80 * S, 22 * S);
  }

  // ── Lamps and shoppers ──
  if (detail) for (const lx of [6, 140, 274]) { if (lx !== 140) k.lamp(lx, 163, 22, on, night); }
  if (open) _mallCrowd(k, e, t, 16, 16, 264, 143, 161, ['#ff5ab0', '#40c0ff', '#f0e0a0']);
  else if (on && night && detail) _mallCrowd(k, e, t, 3, 40, 240, 144, 160, null);

  ctx.restore();
}

/* ── The Grand Arcade ───────────────────────────────────────────────
   A Victorian shopping arcade in red brick and cream stone. A long
   glass barrel roof on iron ribs runs the length of it; arched
   shopfronts under striped awnings line both wings, each with its trade
   in gold leaf over the door; the great arched entrance looks down the
   glazed arcade within. Over it a clock tower keeps the game's time. On
   the cobbled square in front a carousel turns beside a flower cart,
   and after dark string lights swag between the gas lamps. */
function _renderArcade(e, px, py, W, H, t) {
  const S = Math.min(W / 280, H / 200), on = e.powered;
  const k = _bankKit(px, py, S);
  const { X, Y, R, RR, dot, ell, poly, ln, glow, text } = k;
  const hr = DayNight.hour(), dark = DayNight.darkness(), night = dark > 0.3;
  const open = _bankOpen('arcade', on);
  const L = (d, n, o) => on ? (night ? n : d) : o;
  const detail = Camera.zoom > 0.45;
  const BRICK = L('#a8503a', '#4a2a24', '#2a1c18'), STONE = L('#ece0c4', '#6a6252', '#302c24');
  const IRON = L('#2e3a34', '#161c1a', '#121414'), GOLD = L('#d8b04a', '#8a7030', '#4a4030');
  const lampsOn = on && dark > 0.15;
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, 280 * S, 200 * S); ctx.clip();

  // ── Street and cobbled square ──
  _bankStreet(k, 280, 188, L);
  R(0, 146, 280, 42, L('#bcae96', '#4a4640', '#24221e'));
  if (detail) {
    for (let y = 147, row = 0; y < 187; y += 3, row++) {
      for (let x = (row % 2) * 2.5; x < 280; x += 5) R(x, y, 4.4, 2.4, row % 3 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)');
    }
  }
  R(0, 146, 280, 1.5, L('#9a8e78', '#3a3630', '#1c1a18'));

  // ── Glass barrel roof behind it all ──
  ctx.save();
  ctx.beginPath(); ctx.moveTo(X(12), Y(66)); ctx.lineTo(X(12), Y(50));
  ctx.ellipse(X(140), Y(50), 128 * S, 16 * S, 0, Math.PI, 0); ctx.lineTo(X(268), Y(66)); ctx.closePath();
  const rg = ctx.createLinearGradient(0, Y(34), 0, Y(66));
  if (on && (open || night)) { rg.addColorStop(0, night ? '#ffe4a8' : '#e4f2fa'); rg.addColorStop(1, night ? '#c08040' : '#8ab4cc'); }
  else if (night) { rg.addColorStop(0, '#2a3242'); rg.addColorStop(1, '#161a24'); }
  else { rg.addColorStop(0, on ? '#d8eef8' : '#4a5058'); rg.addColorStop(1, on ? '#7aa4bc' : '#2a2e34'); }
  ctx.fillStyle = rg; ctx.fill(); ctx.clip();
  for (let x = 16; x < 266; x += 8) ln(x, 30, x, 66, IRON, 0.9);             // ribs
  for (const yy of [42, 50, 58]) ln(12, yy, 268, yy, IRON, 0.6);
  if (on && !night) { const gx = 10 + ((t * 12) % 300); poly([[gx, 66], [gx + 6, 66], [gx + 14, 34], [gx + 8, 34]], 'rgba(255,255,255,0.3)'); }
  ctx.restore();
  ctx.strokeStyle = IRON; ctx.lineWidth = 1.4 * S;
  ctx.beginPath(); ctx.ellipse(X(140), Y(50), 128 * S, 16 * S, 0, Math.PI, 0); ctx.stroke();
  if (on && night) glow(140, 50, 120, '255,210,140', 0.12);

  // ── Wings ──
  const TRADES = ['TEA', 'HATS', 'BOOKS', 'TOYS', 'SWEETS', 'CLOCKS', 'SHOES', 'LACE'];
  const AWN = ['#b83a3a', '#2a6a4a', '#2a4a8a', '#c8902a', '#7a3a7a', '#1a7a8a', '#b84a6a', '#4a6a2a'];
  const wing = (x0, x1, wi) => {
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(X(x0 + 4), Y(64), (x1 - x0) * S, 84 * S);
    R(x0, 62, x1 - x0, 84, BRICK);
    if (detail) for (let y = 64; y < 146; y += 3) R(x0, y, x1 - x0, 0.35, 'rgba(0,0,0,0.12)');      // courses
    R(x0 - 1, 58, x1 - x0 + 2, 5, STONE);                                       // cornice
    R(x0 - 1, 57, x1 - x0 + 2, 1, GOLD);
    for (let x = x0 + 2; x < x1 - 2; x += 4) R(x, 54, 1.4, 4, STONE);           // balustrade
    R(x0 - 1, 53, x1 - x0 + 2, 1.4, STONE);
    R(x0, 98, x1 - x0, 3, STONE);                                               // string course
    const n = 4, bw = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const cx = x0 + bw * (i + 0.5), idx = wi * 4 + i;
      // upper floor: arched window, some lit after dark
      const wl = on && night && _mallHash(e, idx + 70) < 0.6;
      RR(cx - 5, 70, 10, 22, 5, wl ? '#ffd890' : L('#4a6070', '#1a2028', '#141618'));
      R(cx - 0.4, 72, 0.8, 20, STONE); R(cx - 5, 80, 10, 0.8, STONE);
      R(cx - 6.5, 92, 13, 2, STONE);
      if (wl) glow(cx, 80, 10, '255,210,140', 0.2);
      // shopfront: arch, glass, awning, gilded trade
      const shopOpen = open && _mallHash(e, idx + 3) > 0.08;
      const fx = cx - bw * 0.4, fw = bw * 0.8;
      RR(fx, 104, fw, 42, Math.min(fw / 2, 10), STONE);
      RR(fx + 2, 107, fw - 4, 39, Math.min(fw / 2 - 2, 8),
        shopOpen ? `rgba(255,${222 - (idx % 3) * 12},${160 + (idx % 4) * 12},0.92)` : (on && night ? 'rgba(255,214,150,0.35)' : L('#3a4c58', '#141a20', '#121416')));
      if (shopOpen && detail) {                                                 // the goods in the window
        for (let g = 0; g < 4; g++) dot(fx + 5 + g * (fw - 10) / 3, 126, 1.8, AWN[(idx + g) % AWN.length]);
        R(fx + 4, 128, fw - 8, 0.8, 'rgba(60,40,30,0.4)');
      }
      R(cx - 3.5, 132, 7, 14, L('#4a2a1a', '#2a1810', '#1a1210'));            // door
      dot(cx + 2, 139, 0.5, GOLD);
      for (let s = 0; s < 6; s++) {                                             // striped awning
        const sx = fx + 1 + (fw - 2) * s / 6, sw = (fw - 2) / 6;
        poly([[sx, 116], [sx + sw, 116], [sx + sw + 0.6, 122], [sx + 0.6, 122]], s % 2 ? L('#f4eee0', '#6a665a', '#2a2824') : L(AWN[idx % 8], AWN[idx % 8] + '99', '#2a2622'));
      }
      R(fx + 1.6, 122, fw - 2, 1, 'rgba(0,0,0,0.25)');
      text(TRADES[idx % TRADES.length], cx, 111, 4, fw - 6, GOLD, 'Georgia, serif');
      if (shopOpen && night) glow(cx, 140, 16, '255,214,150', 0.28);
    }
  };
  wing(8, 110, 0);
  wing(170, 272, 1);

  // ── Central pavilion ──
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(X(114), Y(48), 58 * S, 100 * S);
  R(110, 44, 60, 102, STONE);
  if (detail) for (let y = 48; y < 146; y += 6) R(110, y, 60, 0.4, 'rgba(0,0,0,0.08)');     // rustication
  for (const cx of [113, 167]) R(cx - 2, 44, 4, 102, L('#f6eedc', '#7a7262', '#36322a'));  // pilasters
  // pediment with the name
  poly([[106, 46], [140, 30], [174, 46]], STONE);
  poly([[110, 45], [140, 32.5], [170, 45]], L('#e0d2b2', '#5a5446', '#2a2822'));
  R(106, 45, 68, 2, GOLD);
  R(112, 48, 56, 9, L('#2e3a34', '#121816', '#121414'));
  text('THE GRAND ARCADE', 140, 52.8, 5, 52, on ? (night ? '#ffe090' : '#e8c060') : '#5a5240', 'Georgia, serif');
  if (on && night) glow(140, 52, 30, '255,220,140', 0.18);
  // the great arch, looking down the arcade within
  const ax0 = 120, ax1 = 160, aTop = 64;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(X(ax0), Y(146)); ctx.lineTo(X(ax0), Y(aTop + 20));
  ctx.ellipse(X(140), Y(aTop + 20), 20 * S, 20 * S, 0, Math.PI, 0); ctx.lineTo(X(ax1), Y(146)); ctx.closePath();
  const ig = ctx.createLinearGradient(0, Y(aTop), 0, Y(146));
  if (on && (open || night)) { ig.addColorStop(0, '#fff0c8'); ig.addColorStop(0.6, '#e8b870'); ig.addColorStop(1, '#a86a38'); }
  else { ig.addColorStop(0, on ? '#b8d0dc' : '#3a3e44'); ig.addColorStop(1, on ? '#5a6a70' : '#1c1e22'); }
  ctx.fillStyle = ig; ctx.fill(); ctx.clip();
  // receding ribs and shopfronts down the arcade (one-point perspective)
  const vx = 140, vy = 104;
  for (let d = 0; d < 6; d++) {
    const f = 1 - d / 6.5, hw = 20 * f, top = vy - 40 * f, bot = vy + 42 * f;
    ctx.strokeStyle = `rgba(40,48,44,${(0.7 * f).toFixed(2)})`; ctx.lineWidth = 0.9 * S;
    ctx.beginPath(); ctx.ellipse(X(vx), Y(top + hw), hw * S, hw * S, 0, Math.PI, 0); ctx.stroke();
    if (d < 5) for (const sd of [-1, 1]) {
      const sx = vx + sd * hw * 0.92;
      R(Math.min(sx, sx - sd * 3 * f), vy + 4 * f, 3 * f, 30 * f, open ? `rgba(${sd < 0 ? '255,200,140' : '255,170,190'},${(0.8 * f).toFixed(2)})` : 'rgba(60,60,70,0.5)');
    }
  }
  ln(ax0, 146, vx - 3, vy + 6, 'rgba(90,70,50,0.35)', 0.6); ln(ax1, 146, vx + 3, vy + 6, 'rgba(90,70,50,0.35)', 0.6);
  if (open) for (let q = 0; q < 5; q++) {                                    // shoppers inside, smaller with distance
    const d = (t * 0.05 + q / 5) % 1, f = 1 - d * 0.8;
    k.person(vx + Math.sin(q * 2.3) * 12 * f, vy + 40 * f, _MALL_TOPS[q % 8], _MALL_SKINS[q % 5], 0, 1.1 * f);
  }
  ctx.restore();
  ctx.strokeStyle = STONE; ctx.lineWidth = 3 * S;
  ctx.beginPath(); ctx.moveTo(X(ax0), Y(146)); ctx.lineTo(X(ax0), Y(aTop + 20)); ctx.ellipse(X(140), Y(aTop + 20), 20 * S, 20 * S, 0, Math.PI, 0); ctx.lineTo(X(ax1), Y(146)); ctx.stroke();
  // fanlight and keystone
  for (let i = 0; i <= 6; i++) { const a = Math.PI + i * Math.PI / 6; ln(140, aTop + 20, 140 + Math.cos(a) * 18, aTop + 20 + Math.sin(a) * 18, IRON, 0.7); }
  RR(137, aTop - 2, 6, 6, 1, GOLD);
  if (on && night) {
    const sg = ctx.createRadialGradient(X(140), Y(146), 0, X(140), Y(146), 36 * S);
    sg.addColorStop(0, 'rgba(255,214,150,0.45)'); sg.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = sg; ctx.fillRect(X(104), Y(146), 72 * S, 30 * S);
  }

  // ── Clock tower ──
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(X(132), Y(12), 20 * S, 22 * S);
  R(129, 10, 22, 24, STONE);
  R(128, 8, 24, 3, GOLD);
  for (const cx of [130, 150]) R(cx - 1, 11, 2, 23, L('#f6eedc', '#7a7262', '#36322a'));
  poly([[127, 9], [140, -6], [153, 9]], IRON);                                 // spire
  poly([[131, 8.5], [140, -2], [149, 8.5]], L('#3e5a4e', '#1a2622', '#141816'));
  ln(140, -6, 140, -12, IRON, 0.8);
  if (detail) k.flag(140, -16, 4, '#b83a3a', '#f4eee0', t, 1);
  // the face: real time
  dot(140, 22, 8.2, GOLD);
  dot(140, 22, 7.2, on && night ? '#fff4d0' : L('#f8f4e8', '#9a9480', '#4a4640'));
  if (on && night) glow(140, 22, 16, '255,236,180', 0.4);
  if (detail) for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; dot(140 + Math.cos(a) * 6, 22 + Math.sin(a) * 6, 0.45, '#2a2a2a'); }
  const hh = (hr % 12) / 12 * Math.PI * 2 - Math.PI / 2, mm = (hr % 1) * Math.PI * 2 - Math.PI / 2;
  ln(140, 22, 140 + Math.cos(hh) * 3.8, 22 + Math.sin(hh) * 3.8, '#1a1a1a', 1);
  ln(140, 22, 140 + Math.cos(mm) * 5.8, 22 + Math.sin(mm) * 5.8, '#1a1a1a', 0.6);
  dot(140, 22, 0.7, GOLD);

  // ── The square ──
  // string lights swagging from the pavilion to the lamps
  const lamps = [[16, 186], [96, 186], [184, 186], [264, 186]];
  const swag = (x1, y1, x2, y2, sag, n) => {
    const pts = [];
    for (let i = 0; i <= n; i++) { const f = i / n; pts.push([x1 + (x2 - x1) * f, y1 + (y2 - y1) * f + Math.sin(f * Math.PI) * sag]); }
    ctx.strokeStyle = L('rgba(40,40,40,0.5)', 'rgba(20,20,20,0.6)', 'rgba(20,20,20,0.4)'); ctx.lineWidth = 0.4 * S;
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.stroke();
    if (detail || lampsOn) pts.forEach(([x, y], i) => {
      if (i === 0 || i === n) return;
      if (lampsOn) { dot(x, y + 0.6, 0.8, ['#ffe090', '#ff9a70', '#a0e0ff', '#ffb0e0'][i % 4]); }
      else dot(x, y + 0.6, 0.5, 'rgba(240,240,220,0.7)');
    });
  };
  swag(110, 120, 16, 160, 6, 14); swag(110, 120, 96, 160, 5, 8);
  swag(170, 120, 184, 160, 5, 8); swag(170, 120, 264, 160, 6, 14);
  if (lampsOn) glow(140, 150, 140, '255,200,140', 0.07);
  // carousel
  const cx = 56, cy = 170, spin = open ? t * 0.6 : 0;
  ell(cx + 2, cy + 7, 26, 5, 'rgba(0,0,0,0.25)');
  ell(cx, cy + 4, 24, 5, L('#d8c8a8', '#5a5244', '#2a2620'));
  ell(cx, cy + 3, 24, 4.6, L('#b83a3a', '#5a2420', '#2a1816'));
  const horses = [];
  for (let i = 0; i < 8; i++) {
    const a = spin + i * Math.PI / 4, sx = cx + Math.cos(a) * 19, sy = cy + Math.sin(a) * 3.6;
    horses.push({ a, sx, sy, front: Math.sin(a) > 0, i });
  }
  const horse = ({ a, sx, sy, i }) => {
    const bob = open ? Math.sin(t * 3 + i) * 1.4 : 0;
    ln(sx, cy - 14, sx, sy + 1, GOLD, 0.6);
    const hc = ['#f4eee0', '#3a2a20', '#c8902a', '#f4eee0'][i % 4];
    RR(sx - 3.2, sy - 7 + bob, 6.4, 3.2, 1.4, L(hc, '#6a6458', '#2a2824'));
    poly([[sx + (Math.cos(a) < 0 ? 2.4 : -2.4), sy - 7 + bob], [sx + (Math.cos(a) < 0 ? 4.4 : -4.4), sy - 10.5 + bob], [sx + (Math.cos(a) < 0 ? 3.6 : -3.6), sy - 6 + bob]], L(hc, '#6a6458', '#2a2824'));
    R(sx - 2.4, sy - 4 + bob, 0.8, 3, L(hc, '#6a6458', '#2a2824')); R(sx + 1.6, sy - 4 + bob, 0.8, 3, L(hc, '#6a6458', '#2a2824'));
  };
  horses.filter(h => !h.front).forEach(horse);
  R(cx - 2, cy - 15, 4, 18, L('#e8dcc0', '#6a6252', '#302c24'));              // centre column
  horses.filter(h => h.front).forEach(horse);
  // canopy: striped cone
  for (let s = 0; s < 12; s++) {
    const a0 = s / 12, a1 = (s + 1) / 12;
    poly([[cx, cy - 26], [cx - 26 + 52 * a0, cy - 14], [cx - 26 + 52 * a1, cy - 14]], s % 2 ? L('#f4eee0', '#6a665a', '#2a2824') : L('#c83a4a', '#5a2026', '#2a1618'));
  }
  for (let s = 0; s < 13; s++) {                                              // scalloped valance with bulbs
    const vx2 = cx - 26 + s * 52 / 13;
    ell(vx2 + 2, cy - 13.5, 2, 1.4, L('#d8b04a', '#6a5a30', '#3a3226'));
    if (on && night) dot(vx2 + 2, cy - 12.5, 0.6, (Math.floor(t * 4) + s) % 2 ? '#fff0b0' : '#ffb070');
  }
  dot(cx, cy - 27, 1.4, GOLD);
  if (on && night) glow(cx, cy - 8, 30, '255,210,140', 0.3);
  // flower seller's cart
  const fx = 222, fy = 166;
  R(fx - 10, fy - 2, 20, 6, L('#6a4a30', '#3a2a1e', '#1e1814'));
  for (let i = 0; i < 9; i++) dot(fx - 8 + i * 2, fy - 3.5 + (i % 2), 1.4, ['#ff6a8a', '#ffd040', '#c060ff', '#ff9a40', '#ffffff'][i % 5]);
  for (const wx of [fx - 7, fx + 7]) { dot(wx, fy + 6, 2.6, '#2a2a2a'); dot(wx, fy + 6, 1, '#8a8a8a'); }
  ln(fx - 9, fy - 2, fx - 9, fy - 14, '#4a3a2a', 0.6); ln(fx + 9, fy - 2, fx + 9, fy - 14, '#4a3a2a', 0.6);
  for (let s = 0; s < 6; s++) poly([[fx - 11 + s * 22 / 6, fy - 15], [fx - 11 + (s + 1) * 22 / 6, fy - 15], [fx - 11 + (s + 1) * 22 / 6, fy - 12], [fx - 11 + s * 22 / 6, fy - 12]], s % 2 ? L('#f4eee0', '#6a665a', '#2a2824') : L('#2a6a4a', '#16382a', '#141a16'));
  if (open) k.person(fx + 13, fy + 4, '#2a6a4a', '#e0b890', 0, 1.05);
  // benches and planters
  if (detail) for (const bx of [140, 250]) { R(bx - 7, 177, 14, 1.6, L('#6a4a30', '#3a2a1e', '#1e1814')); R(bx - 7, 174, 14, 1, IRON); R(bx - 6, 178.6, 1, 2, IRON); R(bx + 5, 178.6, 1, 2, IRON); }
  // gas lamps
  for (const [lx, ly] of lamps) {
    R(lx - 0.7, ly - 28, 1.4, 28, IRON);
    R(lx - 2.4, ly - 2, 4.8, 2, IRON);
    poly([[lx - 2.6, ly - 32], [lx + 2.6, ly - 32], [lx + 2, ly - 27], [lx - 2, ly - 27]], lampsOn ? '#ffe4a0' : L('#d8d4c8', '#4a4a44', '#2a2a28'));
    poly([[lx - 3, ly - 32], [lx, ly - 35], [lx + 3, ly - 32]], IRON);
    if (lampsOn) glow(lx, ly - 30, 16, '255,220,150', 0.45);
  }
  // shoppers
  if (open) _mallCrowd(k, e, t, 14, 90, 270, 150, 184, ['#b83a3a', '#2a4a8a', '#e8d8a0']);
  else if (on && night && detail) _mallCrowd(k, e, t, 4, 90, 270, 152, 182, null);

  ctx.restore();
}
