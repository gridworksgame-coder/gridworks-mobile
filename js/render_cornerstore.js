/* ═══════════════════════════════════════════════════════════════════
   CORNER STORE (2×2)
   A residential-zone amenity (park_request_system.js): the little shop on
   the corner with the owner's flat upstairs. Every store gets its own
   name, facade and awning colours from its position, so a town of them
   doesn't look stamped out. Open 07:00–23:00: produce crates out front,
   customers in and out, the owner sweeping the step first thing and a
   neon OPEN in the window after dark. After closing the shutter comes
   down and only the flat upstairs stays lit.
   Drawn natively at footprint size with the kit from render_banks.js.
   Authored in an 80×80 box.
   ═══════════════════════════════════════════════════════════════════ */

const CORNER_STORE_NAMES = [
  "Rosa's Bodega", 'Lucky Mart', 'Corner Deli', 'Sunny Grocer', "Patel's Corner Shop",
  'Quick Stop', "Mo's Market", 'Green Leaf Grocer', 'Daily Basket', "Kim's Mini Mart",
  'Elm Street Store', 'The Little Shop',
];

function _cornerStoreHash(e, salt) {
  return Math.abs(Math.sin((e.col * 41 + e.row * 23 + salt * 7.7) * 12.9898)) % 1;
}

function cornerStoreName(e) {
  return e.businessName || CORNER_STORE_NAMES[Math.floor(_cornerStoreHash(e, 1) * CORNER_STORE_NAMES.length) % CORNER_STORE_NAMES.length];
}

function cornerStoreOpen(hour) { return hour >= 7 && hour < 23; }

function renderCornerStore(e, px, py, W, H, t) {
  const S = Math.min(W / 80, H / 80), on = !!e.powered;
  const k = _bankKit(px, py, S);
  const { R, RR, dot, ell, poly, ln, glow } = k;
  const hr = DayNight.hour(), dark = DayNight.darkness(), night = dark > 0.3;
  const open = on && cornerStoreOpen(hr);
  const L = (d, n, o) => on ? (night ? n : d) : o;
  const detail = Camera.zoom > 0.45;

  // Per-store look: facade material and awning colours.
  const facades = [
    { wall: ['#a8483a', '#4e2620', '#2a1612'], line: '#8a3a2e', brick: true },    // red brick
    { wall: ['#4e8a8a', '#24403f', '#142020'], line: '#3e7272', brick: false },   // teal clapboard
    { wall: ['#e8dcbc', '#6a6452', '#2e2a22'], line: '#cfc2a0', brick: false },   // cream stucco
    { wall: ['#7a5a8a', '#3a2a40', '#1e1622'], line: '#664a74', brick: false },   // plum clapboard
  ];
  const awnings = [['#c84040', '#f4f0e6'], ['#2a7a4a', '#f4f0e6'], ['#2a5a9a', '#f0d070'], ['#e0a030', '#f4f0e6'], ['#8a2a5a', '#f4f0e6']];
  const F = facades[Math.floor(_cornerStoreHash(e, 2) * facades.length) % facades.length];
  const A = awnings[Math.floor(_cornerStoreHash(e, 3) * awnings.length) % awnings.length];
  const WALL = L(...F.wall), TRIM = L('#f2eee2', '#7a776e', '#34322e');
  const name = cornerStoreName(e);

  // ── Pavement apron ──
  R(2, 62, 76, 16, L('#9a9ea4', '#44484e', '#222428'));
  if (detail) for (let x = 2; x < 78; x += 8) R(x, 62, 0.4, 16, 'rgba(0,0,0,0.12)');
  R(2, 77, 76, 1.4, L('#b8bcc0', '#5a5e62', '#2a2c30'));

  // ── Building: shop below, the owner's flat above ──
  R(6, 10, 68, 52, WALL);
  if (detail) {
    if (F.brick) for (let y = 12; y < 62; y += 2) {
      R(6, y, 68, 0.3, L(F.line, 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.3)'));
      const off = (y / 2) % 2 ? 2 : 0;
      for (let x = 6 + off; x < 74; x += 4) R(x, y, 0.3, 2, L(F.line, 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.3)'));
    } else for (let y = 12; y < 30; y += 2.2) R(6, y, 68, 0.5, 'rgba(0,0,0,0.12)');
  }
  R(4, 7, 72, 4, TRIM);                                                     // cornice
  if (detail) for (let x = 5; x < 75; x += 3) R(x, 10.4, 1.4, 1, L('rgba(0,0,0,0.18)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.3)'));
  // rooftop: AC unit and a water heater flue
  RR(56, 1.5, 12, 5.5, 0.8, L('#c8ccd0', '#5a5e62', '#2a2c2e'));
  if (on && detail) { const a = t * 6; for (let b = 0; b < 3; b++) ln(62, 4.2, 62 + Math.cos(a + b * 2.1) * 2, 4.2 + Math.sin(a + b * 2.1) * 2, '#6a6e72', 0.5); }
  R(14, 2, 2, 5, L('#7a7e82', '#3a3e42', '#1a1c1e'));

  // flat windows upstairs, with a flower box and a light on after dark
  const upLit = on && (night ? (hr >= 18 || hr < 0.5 || hr >= 6) : false);
  for (const wx of [14, 46]) {
    R(wx - 1, 14, 22, 14, TRIM);
    R(wx, 15, 20, 12, upLit ? '#ffd98a' : L('#6a8aa0', '#1c2430', '#101418'));
    if (detail) { R(wx + 9.7, 15, 0.6, 12, TRIM); R(wx, 21, 20, 0.6, TRIM); }
    if (detail && !upLit) { R(wx, 15, 4, 12, 'rgba(240,230,210,0.5)'); R(wx + 16, 15, 4, 12, 'rgba(240,230,210,0.5)'); }   // net curtains
    if (upLit) glow(wx + 10, 21, 12, '255,214,140', 0.25);
    R(wx - 1, 27, 22, 2.4, L('#6a4a2a', '#2e2012', '#160e08'));
    for (let f = 0; f < 7; f++) dot(wx + 1 + f * 3, 26.6, 1.1, ['#e84a6a', '#f0d040', '#f4f4f4', '#3a8a3a'][f % 4]);
  }

  // ── Sign band with the shop's name ──
  R(6, 31, 68, 6, L('#1e2a36', '#101820', '#0e1014'));
  k.text(name.toUpperCase(), 40, 34.2, 3.6, 62, on ? (night ? '#ffe9a8' : '#f4f0e0') : '#3a3a36', 'Arial, sans-serif');
  if (on && night) glow(40, 34, 30, '255,232,170', 0.2);

  // ── Shopfront: window full of shelves, door on the corner ──
  const glassCol = open ? (night ? '#ffe2a0' : '#b8d4e0') : L('#3e4a56', '#1a2230', '#101418');
  R(8, 41, 46, 21, TRIM);
  R(9, 42, 44, 16, glassCol);
  if (detail && (open || !on)) {
    for (let s = 0; s < 3; s++) {                                          // shelves of goods
      const sy = 45 + s * 4.6;
      R(10, sy + 2.6, 42, 0.6, 'rgba(80,60,40,0.6)');
      for (let b = 0; b < 14; b++) R(10.4 + b * 3, sy, 2.2, 2.6, ['#e84a4a', '#f0c040', '#3a8ac8', '#4aa05a', '#f4f0e6', '#8a4ab0'][(b + s * 2) % 6] + (open ? 'd0' : '50'));
    }
  }
  if (open && detail) k.person(26, 57, '#2a5a9a', _BANK_SKINS[(e.col + e.row) % 5], 0, 1.1);   // owner at the till
  // roller shutter after closing
  if (!open) {
    R(9, 42, 44, 16, L('#8a8e94', '#3a3e44', '#1c1e22'));
    if (detail) for (let y = 43; y < 58; y += 1.6) R(9, y, 44, 0.4, 'rgba(0,0,0,0.25)');
  }
  if (open) glow(31, 50, 26, '255,220,150', night ? 0.35 : 0.1);
  // neon OPEN sign
  if (open) {
    RR(41, 43.5, 10, 4.4, 1, 'rgba(0,0,0,0.35)');
    const flick = Math.sin(t * 19) * Math.sin(t * 5.3) > -0.9;
    if (flick) k.text('OPEN', 46, 45.8, 2.8, 9, night || dark > 0.1 ? '#ff4a6a' : '#c83a52', 'Arial, sans-serif');
    if (night && flick) glow(46, 45.8, 9, '255,74,106', 0.4);
  }
  // door with a bell and a push plate; it swings in as each customer
  // reaches it (customer timing as in the People section below)
  const custU = p => (t * (0.05 + p * 0.012) + p * 0.37 + _cornerStoreHash(e, 5 + p)) % 1;
  let swing = 0;
  if (open) for (let p = 0; p < 3; p++) {
    const sp = 0.05 + p * 0.012;                                             // at the threshold as their cycle wraps
    swing = Math.max(swing, doorSwing(((custU(p) + 1.5) % 1 - 0.5) / sp));
  }
  // through the open door: shelves of goods, the drinks fridge, a tiled floor
  const inside = () => {
    R(57.5, 42.5, 12, 19.5, night ? '#f0d098' : '#d8cdb4');
    const goods = ['#e84a4a', '#f0c040', '#3a8ac8', '#4aa05a', '#f4f0e6', '#8a4ab0'];
    for (let s = 0; s < 3; s++) {
      const sy = 45 + s * 4.2;
      for (let b = 0; b < 3; b++) R(59 + b * 2, sy, 1.5, 2.4, goods[(b + s * 2 + 1) % 6]);
      R(58.6, sy + 2.4, 6.4, 0.5, 'rgba(80,60,40,0.7)');
    }
    R(65.5, 43.5, 4, 14.5, '#9aa4ac'); R(66, 44, 3, 13.5, night ? '#e8f4f8' : '#cfe4ec');   // drinks fridge
    if (detail) for (let s = 0; s < 3; s++) for (let b = 0; b < 3; b++) R(66.3 + b * 0.9, 45 + s * 4.3, 0.6, 2.2, goods[(b + s) % 6]);
    R(57.5, 58, 12, 4, night ? '#e0b070' : '#b0a28a');
    if (detail) for (let x = 57.5, i = 0; x < 69.5; x += 2, i++) for (let y = 58, j = 0; y < 62; y += 2, j++) if ((i + j) % 2) R(x, y, 2, 2, 'rgba(0,0,0,0.08)');
  };
  R(56, 41, 15, 21, TRIM);
  const at = doorLeaf(k, 57.5, 57.5, 69.5, 42.5, 62, swing,
    open ? (night ? '#ffe2a8' : '#c8dce4') : L('#2a2420', '#16120e', '#0e0b08'), inside, TRIM);
  if (detail) {
    R(at(58), 50 + swing * 0.5, at(69) - at(58), 0.8, L('#c8a840', '#6a5628', '#2a2414'));
    dot(64 + Math.sin(t * 40) * 0.5 * swing, 44, 0.8, L('#d8b850', '#7a6630', '#2a2414'));   // the bell rings as it opens
  }

  // ── Striped awning with a scalloped edge ──
  const aw0 = 6, aw1 = 74, ay = 37, ah = 5;
  for (let x = aw0, i = 0; x < aw1; x += 4, i++) {
    R(x, ay, Math.min(4, aw1 - x), ah, L(i % 2 ? A[1] : A[0], i % 2 ? '#6a665c' : A[0] + '90', '#1e1c1a'));
    ctx.fillStyle = L(i % 2 ? A[1] : A[0], i % 2 ? '#6a665c' : A[0] + '90', '#1e1c1a');
    ctx.beginPath(); ctx.arc(k.X(x + 2), k.Y(ay + ah), 2 * S, 0, Math.PI); ctx.fill();
  }
  R(aw0, ay + ah + 1.6, aw1 - aw0, 1.2, 'rgba(0,0,0,0.18)');                // awning shadow

  // ── Out front: produce stand, ice chest, news rack, chalkboard ──
  if (open) {
    R(9, 60, 26, 2.4, L('#7a5a3a', '#3a2a1c', '#1e160e'));                 // crate stand
    const fruit = [['#d83a3a', '#e84a4a'], ['#f09a20', '#f8b040'], ['#5aa040', '#78c050'], ['#f0d040', '#f8e060']];
    for (let c = 0; c < 4; c++) {
      R(9.5 + c * 6.4, 57, 5.8, 3.4, L('#9a7a4a', '#4a3a24', '#221a10'));
      for (let f = 0; f < 4; f++) dot(10.8 + c * 6.4 + f * 1.3, 56.8 - (f % 2) * 0.6, 0.9, fruit[c][f % 2]);
    }
  }
  RR(38, 57, 7, 6, 0.8, L('#e8eef2', '#6a6e72', '#2a2c2e'));               // ice chest
  if (detail) k.text('ICE', 41.5, 59.4, 2, 6, '#2a7aa8', 'Arial, sans-serif');
  R(48, 58, 4, 5, L('#2a5a9a', '#163050', '#0e1828'));                       // news rack
  if (detail) R(48.5, 58.6, 3, 1.4, '#f4f0e6');
  if (open) {
    poly([[30, 72], [33, 64], [36, 72]], L('#3a2a1c', '#1e160e', '#100c08'));   // A-frame chalkboard
    poly([[31, 71], [33, 65.4], [35, 71]], '#1e2a24');
    if (detail) { ln(31.8, 68, 34.2, 68, 'rgba(240,240,230,0.7)', 0.3); ln(32.2, 69.5, 33.8, 69.5, 'rgba(240,240,230,0.7)', 0.3); }
  }
  // bike against the wall, a cat on the step
  if (on) {
    ctx.strokeStyle = A[0]; ctx.lineWidth = 0.6 * S;
    for (const bx of [69, 76]) { ctx.beginPath(); ctx.arc(k.X(bx - 3), k.Y(70), 2.2 * S, 0, Math.PI * 2); ctx.stroke(); }
    ln(66, 70, 70, 66.5, A[0], 0.6); ln(70, 66.5, 73, 70, A[0], 0.6); ln(66, 70, 73, 70, A[0], 0.6);
  }
  if (_cornerStoreHash(e, 4) < 0.5 && (open || night)) {
    ell(58, 63.8, 2.2, 1.2, '#2a2a2a'); dot(59.8, 62.8, 1, '#2a2a2a');
    if (detail) { dot(59.4, 62.2, 0.3, '#2a2a2a'); dot(60.2, 62.2, 0.3, '#2a2a2a'); }
    if (Math.sin(t * 0.7) > 0) ln(56, 63.8, 54.6, 61.8 + Math.sin(t * 2) * 0.6, '#2a2a2a', 0.5);
  }

  // ── People: the morning sweep, then customers in and out ──
  if (open && hr < 9) {
    const sx = 20 + Math.sin(t * 0.5) * 10;
    k.person(sx, 70, '#2a5a9a', _BANK_SKINS[(e.col + e.row) % 5], 0, 1.2);
    ln(sx + 1.6, 67, sx + 3.4 + Math.sin(t * 4) * 1.2, 71, '#8a6a3a', 0.5);
  }
  if (open) {
    for (let p = 0; p < 3; p++) {
      const u = custU(p);
      const goingIn = p % 2 === 0, kk = goingIn ? u : 1 - u;
      const x = 63.5 + (1 - kk) * (p === 1 ? -40 : 14) , y = 75 - kk * 13;
      const a = Math.min(1, (1 - kk) / 0.025);                            // stepping through the open door
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      k.person(x, y, _BANK_TOPS[(p + e.col) % 7], _BANK_SKINS[(p + e.row) % 5], Math.abs(Math.sin(t * 6 + p)) * 0.5, 1.2);
      if (!goingIn) R(x + 1, y - 3.4, 2.4, 2.6, '#f4f0e6');               // shopping bag
      ctx.globalAlpha = 1;
    }
  }
  // street lamp at the corner
  k.lamp(4, 77, 15, on, night);
}
