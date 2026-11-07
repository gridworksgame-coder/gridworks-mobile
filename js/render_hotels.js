/* ═══════════════════════════════════════════════════════════════════
   HOTELS
   Three hotel customers alongside the Grand Hotel, drawn natively at
   footprint size through _commNative, front-on from slightly above. They
   reuse the drawing kit from render_banks.js (_bankKit).

     motel          Starlite Motor Inn    4×3  roadside motel, neon sign, pool
     boutiquehotel  The Harbourside       4×4  brick warehouse, rooftop bar
     resorthotel    Azure Bay Resort      6×5  balcony tower, infinity pool

   Hotels never close, so their state is occupancy: guest rooms light up
   through the evening in a scattered pattern that's stable per building
   (_hotelRoomLit), and the night is the busiest-looking time.
   ═══════════════════════════════════════════════════════════════════ */

// Is guest room i lit right now? Deterministic per building, so rooms don't
// flicker; more of them come on through the evening and go dark after 01:00.
function _hotelRoomLit(e, i, on) {
  if (!on) return false;
  const hr = DayNight.hour(), dark = DayNight.darkness();
  const h = Math.abs(Math.sin((e.col * 31 + e.row * 17 + i * 7.13) * 12.9898)) % 1;
  const occ = hr >= 18 || hr < 1 ? 0.75 : hr < 6 ? 0.18 : dark > 0.3 ? 0.5 : 0.12;
  return h < occ;
}

const _HOTEL_CARS = ['#3a6ab8', '#c84a3a', '#e0c040', '#4a8a5a', '#d8d8dc', '#2a2a30', '#8a4ab0'];

// A car seen from above, nose up (dir = -1) or down (dir = 1).
function _hotelCar(k, x, y, col, night, dir = -1) {
  const { RR, R, glow } = k;
  RR(x - 3.6, y - 6, 7.2, 12, 2, col);
  R(x - 2.6, y + (dir < 0 ? -3.6 : 0.8), 5.2, 2.8, '#2a3a48');
  R(x - 2.6, y + (dir < 0 ? 2.4 : -4.6), 5.2, 1.6, 'rgba(42,58,72,0.8)');
}

/* ── Starlite Motor Inn (4×3) ───────────────────────────────────────
   A 1950s roadside motel: a row of guest rooms under a teal fascia, the
   office with its ice machine, a googie pole sign with a chasing-bulb
   arrow and a neon VACANCY that flips to NO VACANCY late at night, and a
   fenced pool with loungers. Cars nose in at the doors of occupied rooms.
   Authored in a 160×120 box. */
function _renderMotel(e, px, py, W, H, t) {
  const S = Math.min(W / 160, H / 120), on = e.powered;
  const k = _bankKit(px, py, S);
  const { R, RR, dot, ell, poly, ln, glow } = k;
  const hr = DayNight.hour(), dark = DayNight.darkness(), night = dark > 0.3;
  const L = (d, n, o) => on ? (night ? n : d) : o;
  const detail = Camera.zoom > 0.45;
  const WALL = L('#f2e6c8', '#6e6656', '#302c24'), TEAL = L('#2aa89a', '#16564e', '#122420');
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, 160 * S, 120 * S); ctx.clip();

  R(0, 70, 160, 28, L('#5a5d62', '#2a2c30', '#18191c'));                    // parking lot
  _bankStreet(k, 160, 98, L);

  // ── Guest rooms ──
  const ROOMS = 6, rx0 = 30, rw = 14.5;
  R(rx0 - 1, 28, ROOMS * rw + 2, 4, TEAL);                                  // fascia
  R(rx0 - 1, 31.5, ROOMS * rw + 2, 1, L('#f4f0e0', '#7a776e', '#34322e'));
  R(rx0, 32, ROOMS * rw, 32, WALL);
  if (detail) for (let x = rx0; x < rx0 + ROOMS * rw; x += 3) R(x, 32, 0.4, 32, 'rgba(0,0,0,0.05)');   // board siding
  for (let i = 0; i < ROOMS; i++) {
    const x = rx0 + i * rw, lit = _hotelRoomLit(e, i, on);
    R(x + 1.5, 40, 6, 9, lit ? '#ffd98a' : L('#6a8aa0', '#1c2430', '#101418'));   // window
    if (detail) { R(x + 1.5, 40, 1.6, 9, L('#c84a4a', '#5a2424', '#2a1414')); R(x + 5.9, 40, 1.6, 9, L('#c84a4a', '#5a2424', '#2a1414')); }   // curtains
    R(x + 2, 50, 5, 3, L('#c8c8c0', '#5a5a54', '#2a2a28'));                 // AC unit
    if (detail) for (let g = 0; g < 4; g++) R(x + 2.4 + g * 1.2, 50.6, 0.5, 1.8, 'rgba(0,0,0,0.25)');
    RR(x + 8.5, 40, 5, 22, 0.6, ['#e0a030', '#c84a4a', '#2a7aa8', '#3a8a5a'][i % 4]);   // door
    dot(x + 12.5, 51, 0.5, '#e8d8a0');
    if (detail) k.text(String(101 + i), x + 11, 38, 2, 5, L('#2a5a54', '#a8e0d8', '#2a2a28'), 'Arial, sans-serif');
    if (on && night) glow(x + 11, 37, 6, '255,232,180', 0.35);              // porch light
    if (lit) glow(x + 4.5, 44.5, 8, '255,214,140', 0.22);
    R(x + rw - 0.6, 32, 0.6, 32, L('#d8ccae', '#5a5446', '#26241e'));
  }
  // walkway with posts
  R(rx0 - 1, 64, ROOMS * rw + 2, 5, L('#c8c4b8', '#4e4c46', '#22211e'));
  for (let i = 0; i <= ROOMS; i++) R(rx0 - 1 + i * rw, 28, 1.2, 37, L('#f4f0e0', '#7a776e', '#34322e'));

  // ── Office ──
  R(8, 26, 22, 6, TEAL);
  poly([[6, 26], [19, 18], [32, 26]], TEAL);                                // swoopy roof
  R(8, 32, 22, 32, WALL);
  R(10, 36, 18, 18, on ? (night ? '#ffe2a0' : '#b8d4e0') : '#101418');      // big glass front
  if (on && detail) k.person(19, 52, '#e0a030', _BANK_SKINS[1], 0, 1);       // desk clerk
  R(10, 52, 18, 2, L('#8a5a3a', '#3e2a1a', '#1e140c'));
  k.text('OFFICE', 19, 58, 3, 16, L('#2a5a54', '#a8e0d8', '#2a2a28'), 'Arial, sans-serif');
  RR(12, 60, 6, 7, 0.6, L('#e8eef2', '#6a6e72', '#2a2c2e'));                // ice machine
  if (detail) k.text('ICE', 15, 62.6, 1.8, 5, '#2a7aa8', 'Arial, sans-serif');
  if (on && night) glow(19, 45, 16, '255,220,150', 0.3);

  // ── Pool, fenced, with loungers ──
  R(120, 30, 38, 40, L('#d8d2c0', '#4e4a42', '#22201c'));
  RR(124, 36, 26, 22, 4, on ? (night ? '#1aa8c8' : '#3ac0e0') : '#14303a');
  if (on) {
    for (let r = 0; r < 4; r++) {                                            // ripples
      const y = 39 + r * 5 + Math.sin(t * 1.4 + r) * 0.6;
      ln(127, y, 147, y + Math.sin(t + r) * 0.5, 'rgba(255,255,255,0.35)', 0.4);
    }
    if (night) glow(137, 47, 20, '60,200,240', 0.4);
  }
  ln(128, 36, 128, 33, '#d8d8dc', 0.5); ln(130, 36, 130, 33, '#d8d8dc', 0.5);   // ladder
  for (let i = 0; i < 3; i++) RR(124 + i * 9, 61, 7, 3, 0.6, L('#f4f0e0', '#6a665c', '#2a2824'));   // loungers
  if (on && !night && hr > 10 && hr < 18) { k.person(127, 63, '#e84a6a', _BANK_SKINS[0], 0, 1); k.person(137, 48, '#2a7aa8', _BANK_SKINS[3], 0, 1); }
  dot(154, 33, 4, L('#e84a4a', '#5a2424', '#2a1414'));                        // umbrella
  if (detail) for (let x = 120; x <= 158; x += 2.5) ln(x, 70, x, 67, L('#c8c8c0', '#5a5a54', '#2a2a28'), 0.4);   // fence
  ln(120, 67, 158, 67, L('#c8c8c0', '#5a5a54', '#2a2a28'), 0.5);

  // ── Parking: stall lines, a car at each occupied room ──
  for (let i = 0; i <= ROOMS; i++) ln(rx0 - 1 + i * rw, 72, rx0 - 1 + i * rw, 86, L('rgba(255,255,255,0.6)', 'rgba(220,220,200,0.25)', 'rgba(0,0,0,0.1)'), 0.6);
  for (let i = 0; i < ROOMS; i++) {
    const occupied = _hotelRoomLit(e, i + 20, on) || (night && _hotelRoomLit(e, i, on));
    if (occupied) _hotelCar(k, rx0 + i * rw + rw / 2, 79, _HOTEL_CARS[(i + e.col) % 7], night);
  }

  // ── Googie pole sign ──
  R(3, 14, 2.4, 84, L('#c8c8c0', '#5a5a54', '#2a2a28'));
  RR(1, 16, 25, 12, 2, L('#2a3a5a', '#141c2c', '#101418'));               // MOTOR INN panel
  k.text('STARLITE', 13.5, 20, 4, 22, on ? (night ? '#ffe9a8' : '#f4f0e0') : '#3a3a36', 'Arial, sans-serif');
  k.text('MOTOR INN', 13.5, 25, 2.6, 22, on ? '#ff8aa0' : '#3a3a36', 'Arial, sans-serif');
  // starburst on top
  const starOn = on && (night || dark > 0.15);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + (on ? t * 0.3 : 0); ln(4, 10, 4 + Math.cos(a) * 5, 10 + Math.sin(a) * 5, starOn ? '#ffe070' : L('#e0c040', '#7a6a20', '#2a2410'), 0.6); }
  dot(4, 10, 1.4, starOn ? '#fff6c0' : '#c8a830');
  if (starOn) glow(4, 10, 10, '255,230,120', 0.4);
  // arrow with chasing bulbs, pointing at the office
  poly([[6, 30], [24, 30], [28, 33], [24, 36], [6, 36]], L('#e04a4a', '#7a2424', '#2a1414'));
  if (on && detail) for (let i = 0; i < 8; i++) dot(8 + i * 2.4, 33, 0.5, (Math.floor(t * 8) + i) % 3 === 0 ? '#fff6c0' : '#a05040');
  // VACANCY / NO VACANCY neon
  RR(1, 38, 22, 7, 1, '#141414');
  const full = hr >= 22 || hr < 5;
  if (on) {
    const flick = Math.sin(t * 23) * Math.sin(t * 7) > -0.85;
    if (full && flick) k.text('NO', 5.5, 41.5, 2.8, 5, '#ff4050', 'Arial, sans-serif');
    k.text('VACANCY', 15, 41.5, 2.8, 13, night || dark > 0.15 ? '#5aff9a' : '#2a8a5a', 'Arial, sans-serif');
    if (night) glow(10, 41.5, 12, full ? '255,64,80' : '90,255,154', 0.3);
    if (night) glow(11, 22, 16, '255,180,200', 0.22);
  }

  ctx.restore();
}

/* ── The Harbourside (4×4) ──────────────────────────────────────────
   A boutique hotel in a converted four-storey brick warehouse: arched
   windows in cast-iron frames, a faded painted ghost-sign up the brick, a
   black canopy with a doorman and a luggage cart, a water tower on the
   roof and a rooftop bar under strings of festoon lights that fills up
   after dark. Authored in a 160×160 box. */
function _renderBoutiqueHotel(e, px, py, W, H, t) {
  const S = Math.min(W / 160, H / 160), on = e.powered;
  const k = _bankKit(px, py, S);
  const { R, RR, dot, ell, poly, ln, glow } = k;
  const hr = DayNight.hour(), dark = DayNight.darkness(), night = dark > 0.3;
  const L = (d, n, o) => on ? (night ? n : d) : o;
  const detail = Camera.zoom > 0.45;
  const BRICK = L('#9a4a34', '#4a2418', '#26140e'), BRICK_D = L('#7e3a28', '#3a1c12', '#1e100a');
  const IRON = L('#2a2e30', '#16181a', '#0e0f10');
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, 160 * S, 160 * S); ctx.clip();

  R(0, 124, 160, 14, L('#8a8e94', '#3e4248', '#202226'));                   // wide pavement
  _bankStreet(k, 160, 138, L);

  // ── Brick block ──
  R(16, 26, 128, 98, BRICK);
  if (detail) for (let y = 28; y < 124; y += 2.2) {                         // coursing
    R(16, y, 128, 0.3, BRICK_D);
    const off = (Math.round(y / 2.2) % 2) * 2.4;
    for (let x = 16 + off; x < 144; x += 4.8) R(x, y, 0.3, 2.2, BRICK_D);
  }
  R(14, 22, 132, 5, L('#b0a490', '#4e4a40', '#22201c'));                   // stone cornice
  if (detail) for (let x = 15; x < 145; x += 3) R(x, 26, 1.4, 1.4, L('#8a8070', '#3e3a32', '#1e1c18'));
  R(16, 26, 2, 98, 'rgba(255,255,255,0.06)'); R(142, 26, 2, 98, 'rgba(0,0,0,0.12)');
  // faded ghost sign up the left pier
  if (detail) {
    R(19, 30, 9, 62, 'rgba(240,226,190,0.16)');
    ctx.save(); ctx.translate(k.X(23.5), k.Y(61)); ctx.rotate(-Math.PI / 2);
    ctx.font = `bold ${5.2 * S}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(245,232,200,0.42)'; ctx.fillText('HARBOUR STORES', 0, 0); ctx.restore();
  }
  // four floors of arched windows (ground floor is the lobby)
  let n = 0;
  for (let f = 0; f < 3; f++) for (let c = 0; c < 6; c++) {
    const wx = 33 + c * 18.5, wy = 32 + f * 22, ww = 10, wh = 14;
    const lit = _hotelRoomLit(e, n++, on);
    R(wx - 1, wy - 1, ww + 2, wh + 2, BRICK_D);
    dot(wx + ww / 2, wy, ww / 2 + 1, BRICK_D);
    const glass = lit ? '#ffd98a' : L('#5a7088', '#1c2430', '#101418');
    R(wx, wy, ww, wh, glass); dot(wx + ww / 2, wy, ww / 2, glass);
    if (detail) { R(wx + ww / 2 - 0.3, wy - 5, 0.6, wh + 5, IRON); R(wx, wy + wh * 0.45, ww, 0.6, IRON); }
    R(wx - 1.5, wy + wh + 0.5, ww + 3, 1.4, L('#b0a490', '#4e4a40', '#22201c'));   // stone sill
    if (lit) glow(wx + ww / 2, wy + wh / 2, 10, '255,214,140', 0.25);
    if (lit && detail && (n % 4 === 0)) R(wx + 1, wy + 6, 8, 1, 'rgba(60,40,30,0.4)');   // a guest at the sill
  }
  // ground floor: tall lobby glazing in iron frames
  R(26, 98, 108, 26, IRON);
  for (let c = 0; c < 5; c++) {
    if (c === 2) continue;
    const gx = 28 + c * 21.5;
    R(gx, 100, 18, 22, on ? (night ? '#ffd890' : '#a8c4d0') : '#101418');
    if (detail) { R(gx + 8.7, 100, 0.6, 22, IRON); R(gx, 108, 18, 0.6, IRON); }
    if (on && detail && c === 1) { dot(gx + 9, 104, 1.6, '#fff4c8'); k.person(gx + 5, 121, '#2a2a30', _BANK_SKINS[0], 0, 1.1); }   // pendant + bar guest
    if (on && detail && c === 3) { R(gx + 2, 116, 14, 2, '#6a4a2a'); k.person(gx + 9, 116, '#e0e0e0', _BANK_SKINS[2], 0, 1.1); }    // reception
  }
  if (on && night) glow(80, 110, 46, '255,214,140', 0.22);
  // entrance + black canopy with gold lettering
  R(71, 102, 18, 22, on ? (night ? '#ffe2a8' : '#c8dce4') : '#101418');
  RR(64, 96, 32, 6, 1, '#141414');
  k.text('THE HARBOURSIDE', 80, 99.2, 3, 30, on ? '#e8c868' : '#4a4020');
  for (const x of [65, 95]) R(x - 0.4, 102, 0.8, 22, '#8a8a8a');
  if (on && night) glow(80, 102, 14, '255,232,180', 0.4);
  // doorman, a luggage cart and potted bay trees
  if (on) {
    k.person(66, 128, '#1a3a2a', _BANK_SKINS[3], 0, 1.3);
    dot(66, 121.6, 1.4, '#1a3a2a');                                          // cap
    RR(91, 123, 7, 4, 0.6, '#c8a840'); ln(91.5, 123, 91.5, 117, '#c8a840', 0.6); ln(97.5, 123, 97.5, 117, '#c8a840', 0.6); ln(91.5, 117, 97.5, 117, '#c8a840', 0.6);
    R(92.5, 119.5, 3, 3.5, '#3a5a8a'); R(95.5, 120.5, 1.8, 2.5, '#8a3a3a');
  }
  for (const x of [52, 108]) {
    RR(x - 3, 120, 6, 5, 0.8, '#2a2a2a');
    dot(x, 116, 4, L('#2e5a2a', '#16301c', '#0e1a10'));
    dot(x - 1, 115, 2, L('rgba(150,210,110,0.35)', 'rgba(60,110,60,0.2)', 'rgba(0,0,0,0)'));
  }
  // a taxi pulling up in the evening
  if (on && hr >= 17 && hr < 23) {
    const u = (t * 0.04) % 1, x = u < 0.4 ? 170 - u / 0.4 * 70 : u < 0.8 ? 100 : 100 - (u - 0.8) / 0.2 * 110;
    RR(x - 9, 142, 18, 7, 2, '#f0c020'); R(x - 4, 142.8, 8, 5.4, '#2a3a48');
    R(x - 1.5, 140.6, 3, 1.4, '#1a1a1a');
    if (night) glow(x - 9, 145.5, 7, '255,240,200', 0.5);
  }

  // ── Roof: water tower and the rooftop bar ──
  R(16, 14, 128, 8, L('#4a4a46', '#222220', '#121210'));                    // roof deck
  // water tower
  for (const x of [24, 34]) ln(x, 14, x + (x < 30 ? 2 : -2), 10, L('#5a4a3a', '#2a221a', '#141008'), 0.8);
  RR(22, 4, 14, 7, 1, L('#8a6a48', '#3e3022', '#1e1810'));
  poly([[21, 4], [29, 0.5], [37, 4]], L('#5a4a3a', '#2a221a', '#141008'));
  if (detail) for (let y = 5.5; y < 11; y += 2) R(22, y, 14, 0.4, 'rgba(0,0,0,0.2)');
  // bar: counter, stools, planters, umbrellas
  R(44, 15, 30, 3, L('#6a4a2a', '#2e2012', '#160e08'));
  for (let i = 0; i < 4; i++) dot(80 + i * 14, 17.5, 3.4, ['#e8e0d0', '#2a7aa8', '#e8e0d0', '#2a7aa8'][i]);
  // festoon lights strung across the deck
  if (on) {
    for (let s = 0; s < 3; s++) {
      const x0 = 42 + s * 32, x1 = x0 + 32;
      for (let i = 0; i <= 8; i++) {
        const f = i / 8, x = x0 + f * (x1 - x0), y = 12 + Math.sin(f * Math.PI) * 3;
        dot(x, y, 0.7, night ? ((i + s) % 2 ? '#ffe9a8' : '#fff6d8') : '#d8c890');
      }
      if (night) glow(x0 + 16, 14, 20, '255,224,150', 0.22);
    }
  }
  const barBusy = on && (hr >= 17 || hr < 1);
  if (barBusy) for (let i = 0; i < 6; i++) k.person(48 + i * 15 + Math.sin(t * 0.5 + i) * 1.5, 21, _BANK_TOPS[i % 7], _BANK_SKINS[i % 5], Math.abs(Math.sin(t * 3 + i)) * 0.3, 1);

  ctx.restore();
}

/* ── Azure Bay Resort (6×5) ─────────────────────────────────────────
   A resort tower: a tall white slab stepped back at the ends, every room
   with a balcony, a lit crown sign, and a glass lobby under a sweeping
   porte-cochère where guests' cars pull in. In front, a freeform infinity
   pool with a swim-up bar, palms, cabanas and loungers; after dark the
   pool glows turquoise and the balconies light up floor by floor.
   Authored in a 240×200 box. */
function _renderResortHotel(e, px, py, W, H, t) {
  const S = Math.min(W / 240, H / 200), on = e.powered;
  const k = _bankKit(px, py, S);
  const { R, RR, dot, ell, poly, ln, glow } = k;
  const hr = DayNight.hour(), dark = DayNight.darkness(), night = dark > 0.3;
  const L = (d, n, o) => on ? (night ? n : d) : o;
  const detail = Camera.zoom > 0.45;
  const WHITE = L('#f4f2ec', '#7a786e', '#34322e'), WHITE_D = L('#dcd8ce', '#5e5c54', '#2a2826');
  const SEA = on ? (night ? '#14b0c8' : '#3ad0e4') : '#123038';
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, 240 * S, 200 * S); ctx.clip();

  R(0, 138, 240, 40, L('#e0d6bc', '#5a5446', '#26241e'));                   // pool deck
  _bankStreet(k, 240, 178, L);

  // ── Tower: stepped slab with balconies ──
  const blocks = [[44, 30, 152], [36, 44, 168], [28, 58, 184]];             // [x, top, width] back to front
  for (const [x, top, w] of blocks) {
    R(x, top, w, 106 - top, WHITE);
    R(x + w - 4, top, 4, 106 - top, 'rgba(0,0,0,0.07)');
    R(x, top, w, 2, WHITE_D);
  }
  // Balconies: each floor spans whichever setback blocks reach that high.
  let n = 0;
  for (let f = 0; f < 7; f++) {
    const y = 34 + f * 10;
    const here = blocks.filter(([, top]) => y >= top + 2);
    const x0 = Math.min(...here.map(b => b[0])) + 3, x1 = Math.max(...here.map(b => b[0] + b[2])) - 3;
    for (let x = x0; x + 9 <= x1; x += 11.5) {
      const lit = _hotelRoomLit(e, n++, on);
      R(x, y, 9, 6, lit ? '#ffd98a' : L('#6aa0c0', '#1c2a3a', '#101418'));       // sliding door
      if (lit) glow(x + 4.5, y + 3, 7, '255,214,140', 0.18);
      R(x - 0.5, y + 6, 10, 1.6, L('#c8e4ec', '#4a5a62', '#22282c'));          // glass balcony
      if (detail) ln(x - 0.5, y + 6, x + 9.5, y + 6, WHITE_D, 0.4);
      if (lit && detail && n % 9 === 0) k.person(x + 6, y + 6, _BANK_TOPS[n % 7], _BANK_SKINS[n % 5], 0, 0.8);
    }
  }
  // crown sign on the top step
  RR(78, 22, 84, 9, 1.5, L('#1a5a8a', '#0e2a44', '#101418'));
  k.text('AZURE BAY RESORT', 120, 26.6, 5.6, 78, on ? (night ? '#a8f0ff' : '#f4fbff') : '#3a3a36', 'Arial, sans-serif');
  if (on && night) glow(120, 26, 46, '120,220,255', 0.3);
  // rooftop pool-blue band + antenna
  ln(120, 22, 120, 16, L('#c8c8c0', '#5a5a54', '#2a2a28'), 0.8);
  dot(120, 16, 1, on && Math.sin(t * 3) > 0 ? '#ff4030' : '#5a2018');

  // ── Glass lobby and porte-cochère ──
  R(28, 106, 184, 32, WHITE_D);
  R(36, 110, 168, 26, on ? (night ? '#ffe2a8' : '#a8d0e0') : '#101418');
  if (detail) for (let x = 36; x < 204; x += 12) R(x, 110, 0.6, 26, WHITE);
  if (on && night) glow(120, 122, 60, '255,214,140', 0.22);
  if (on && detail) for (let i = 0; i < 5; i++) k.person(50 + i * 26 + Math.sin(t * 0.3 + i) * 6, 134, _BANK_TOPS[i % 7], _BANK_SKINS[i % 5], 0, 1.1);
  // canopy swoop
  ctx.fillStyle = WHITE; ctx.beginPath();
  ctx.moveTo(k.X(88), k.Y(104)); ctx.quadraticCurveTo(k.X(120), k.Y(94), k.X(152), k.Y(104));
  ctx.lineTo(k.X(152), k.Y(108)); ctx.quadraticCurveTo(k.X(120), k.Y(99), k.X(88), k.Y(108)); ctx.closePath(); ctx.fill();
  for (const x of [92, 148]) R(x - 0.8, 106, 1.6, 32, WHITE_D);
  if (on && night) for (let i = 0; i < 5; i++) glow(96 + i * 12, 104, 7, '255,240,200', 0.4);

  // ── Infinity pool deck ──
  // pool: a freeform lagoon
  ctx.fillStyle = SEA;
  ctx.beginPath();
  ctx.moveTo(k.X(30), k.Y(150));
  ctx.bezierCurveTo(k.X(50), k.Y(140), k.X(90), k.Y(146), k.X(110), k.Y(144));
  ctx.bezierCurveTo(k.X(140), k.Y(141), k.X(170), k.Y(148), k.X(200), k.Y(146));
  ctx.bezierCurveTo(k.X(216), k.Y(146), k.X(218), k.Y(166), k.X(200), k.Y(168));
  ctx.bezierCurveTo(k.X(160), k.Y(172), k.X(120), k.Y(164), k.X(80), k.Y(170));
  ctx.bezierCurveTo(k.X(50), k.Y(174), k.X(18), k.Y(162), k.X(30), k.Y(150));
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = L('#f4f2ec', '#8a887e', '#3a3832'); ctx.lineWidth = 1.2 * S; ctx.stroke();
  if (on) {
    for (let i = 0; i < 8; i++) {                                            // caustic shimmer
      const x = 40 + i * 21 + Math.sin(t * 0.8 + i) * 3, y = 156 + Math.sin(t * 1.1 + i * 2) * 4;
      ell(x, y, 5, 1.2, 'rgba(255,255,255,0.25)');
    }
    if (night) { glow(70, 158, 34, '60,220,240', 0.42); glow(160, 158, 34, '60,220,240', 0.42); }
  }
  // swim-up bar island
  ell(120, 156, 12, 6, L('#c8a878', '#5a4a36', '#26201a'));
  ell(120, 154.5, 9, 3.6, L('#e8d8b0', '#6a604c', '#2a2620'));
  for (let i = 0; i < 4; i++) dot(110 + i * 7, 160, 1, '#6a4a2a');          // stools in the water
  if (on && (hr > 10 && hr < 23)) for (let i = 0; i < 3; i++) k.person(112 + i * 8, 161, _BANK_TOPS[(i + 3) % 7], _BANK_SKINS[(i + 2) % 5], 0, 1);
  // swimmers
  if (on && !night && hr > 9 && hr < 19) for (let i = 0; i < 4; i++) {
    const x = 50 + i * 40 + Math.sin(t * 0.3 + i * 2) * 10, y = 152 + (i % 2) * 10;
    ell(x, y, 2, 1, 'rgba(255,255,255,0.4)'); dot(x, y, 1, _BANK_SKINS[i % 5]);
  }
  // cabanas, loungers, palms
  for (const x of [6, 222]) {
    RR(x, 140, 14, 12, 1, L('#f4f2ec', '#6a685e', '#2a2826'));
    R(x, 140, 14, 2.4, L('#2a8ab8', '#164a64', '#102028'));
  }
  for (let i = 0; i < 7; i++) RR(34 + i * 26, 172, 9, 3, 0.6, L('#ffffff', '#6a685e', '#2a2826'));
  if (on && !night) for (let i = 0; i < 4; i++) k.person(38 + i * 52, 174, _BANK_TOPS[(i * 2) % 7], _BANK_SKINS[(i * 3) % 5], 0, 1);
  for (const [x, y] of [[20, 168], [96, 142], [146, 141], [222, 166], [60, 141]]) {
    ln(x, y, x + 2, y - 14, L('#7a5a3a', '#3a2a1c', '#1e160e'), 1.2);
    for (let f = 0; f < 6; f++) {
      const a = f / 6 * Math.PI * 2 + Math.sin(t * 0.8 + x) * 0.08;
      ctx.strokeStyle = L('#3a8a3a', '#1a4024', '#0e1a10'); ctx.lineWidth = 1.4 * S; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(k.X(x + 2), k.Y(y - 14));
      ctx.quadraticCurveTo(k.X(x + 2 + Math.cos(a) * 5), k.Y(y - 16 + Math.sin(a) * 2), k.X(x + 2 + Math.cos(a) * 8), k.Y(y - 12 + Math.sin(a) * 3));
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    if (on && night) glow(x + 2, y, 8, '255,220,150', 0.35);                 // palm uplight
  }
  // guests' cars at the porte-cochère
  if (on) {
    const u = (t * 0.035) % 1, x = u < 0.35 ? 250 - u / 0.35 * 130 : u < 0.75 ? 120 : 120 - (u - 0.75) / 0.25 * 140;
    RR(x - 10, 182, 20, 7, 2, '#f4f4f4'); R(x - 5, 182.8, 10, 5.4, '#2a3a48');
    if (night) glow(x - 10, 185.5, 8, '255,240,200', 0.5);
  }

  ctx.restore();
}
