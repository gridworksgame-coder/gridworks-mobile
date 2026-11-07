/* ═══════════════════════════════════════════════════════════════════
   BANKS
   The three bank customers, all drawn natively at footprint size through
   _commNative (render_residential_commercial.js), front-on from slightly
   above like the library and the other civic landmarks:

     bank         First Trust Bank        4×4  domed neoclassical branch
     savingsloan  Cornerstone Savings     3×3  mid-century brick, drive-thru
     reservebank  Sterling Reserve Bank   5×4  art-deco reserve, open vault

   Each keeps business hours (DemandCurves.hours), so "open" and "closed"
   are the loudest state in every sprite: lit halls, customers, tellers and
   turning vault doors by day; uplighting, security glow and a guard by night.
   ═══════════════════════════════════════════════════════════════════ */

// Shared drawing kit, in the sprite's own authoring units (scaled by S).
function _bankKit(px, py, S) {
  const X = v => px + v * S, Y = v => py + v * S;
  const k = {
    X, Y, S,
    R(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), w * S, h * S); },
    RR(x, y, w, h, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(X(x), Y(y), w * S, h * S, r * S); ctx.fill(); },
    dot(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(x), Y(y), Math.max(0.01, r * S), 0, Math.PI * 2); ctx.fill(); },
    ell(x, y, rx, ry, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(X(x), Y(y), Math.max(0.01, rx * S), Math.max(0.01, ry * S), 0, 0, Math.PI * 2); ctx.fill(); },
    poly(pts, c) { ctx.fillStyle = c; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.closePath(); ctx.fill(); },
    ln(x1, y1, x2, y2, c, w = 1) { ctx.strokeStyle = c; ctx.lineWidth = w * S; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); },
    glow(x, y, r, rgb, a) {
      if (a <= 0.005) return;
      const g = ctx.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r * S);
      g.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.fillRect(X(x - r), Y(y - r), 2 * r * S, 2 * r * S);
    },
    // Lettering shrunk to fit `maxW` units if the font runs wide.
    text(str, x, y, size, maxW, col, font = 'Georgia, serif', weight = 'bold') {
      ctx.save();
      let fs = size;
      ctx.font = `${weight} ${fs * S}px ${font}`;
      const w = ctx.measureText(str).width;
      if (w > maxW * S) { fs *= maxW * S / w; ctx.font = `${weight} ${fs * S}px ${font}`; }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = col;
      ctx.fillText(str, X(x), Y(y));
      ctx.restore();
    },
    person(x, y, top, skin, lift = 0, s = 1) {
      k.ell(x + 0.5 * s, y + 0.5 * s, 1.6 * s, 0.7 * s, 'rgba(0,0,0,0.3)');
      k.RR(x - 1.2 * s, y - 4 * s - lift, 2.4 * s, 4 * s, 0.9 * s, top);
      k.dot(x, y - 5 * s - lift, 1.1 * s, skin);
    },
    // Flag on a pole, rippling in the wind.
    flag(x, yTop, len, c1, c2, t, phase) {
      k.ln(x, yTop + len, x, yTop, '#a8a49a', 0.7);
      k.dot(x, yTop - 0.4, 0.7, '#d8c070');
      const wv = typeof WindState !== 'undefined' ? WindState.speed : 0.4;
      ctx.fillStyle = c1;
      ctx.beginPath();
      ctx.moveTo(X(x), Y(yTop + 0.5));
      for (let i = 1; i <= 6; i++) { const f = i / 6; ctx.lineTo(X(x + f * 9), Y(yTop + 0.5 + Math.sin(t * (3 + wv * 4) + phase + f * 4) * (0.5 + wv) * f)); }
      for (let i = 6; i >= 0; i--) { const f = i / 6; ctx.lineTo(X(x + f * 9), Y(yTop + 5.5 + Math.sin(t * (3 + wv * 4) + phase + f * 4) * (0.5 + wv) * f)); }
      ctx.closePath(); ctx.fill();
      if (c2) { ctx.fillStyle = c2; ctx.fillRect(X(x), Y(yTop + 2.4), 9 * S * 0.9, 1.2 * S); }
    },
    // Street lamp; glows after dark.
    lamp(x, yBase, h, on, night) {
      k.R(x - 0.5, yBase - h, 1, h, on ? '#2a2c30' : '#141518');
      k.R(x - 1.6, yBase - h - 1, 3.2, 1.6, on ? '#3a3c40' : '#1a1b1e');
      k.dot(x, yBase - h + 1, 1.4, on && night ? '#fff0c0' : on ? '#d8d4c8' : '#2a2a28');
      if (on && night) k.glow(x, yBase - h + 1, 14, '255,232,180', 0.42);
    },
    // Armoured cash van, side-on, facing left.
    van(x, y, on, night) {
      k.ell(x + 11, y + 8.6, 13, 1.6, 'rgba(0,0,0,0.35)');
      k.RR(x, y, 22, 7.5, 1.4, on ? '#3d4a42' : '#1c211e');
      k.RR(x - 4, y + 2.4, 6, 5.1, 1.2, on ? '#46544b' : '#202522');
      k.R(x - 3.2, y + 3, 3.4, 2.2, night ? '#2a3c48' : '#8aa4b4');
      k.R(x + 2, y + 1.2, 18, 0.8, on ? '#c8a840' : '#3a3218');
      k.R(x + 8, y + 2.5, 6, 3.6, on ? '#34403a' : '#181c1a');
      k.dot(x + 11, y + 4.3, 1.2, on ? '#c8a840' : '#3a3218');
      for (const wx of [x - 1, x + 17]) { k.dot(wx, y + 7.6, 2, '#16181a'); k.dot(wx, y + 7.6, 0.9, '#6a6e72'); }
      if (on && night) k.glow(x - 4.5, y + 5, 7, '255,240,200', 0.5);
      if (on) k.dot(x + 21.6, y + 5.2, 0.7, '#ff4030');
    },
  };
  return k;
}

// How far a shop's front door stands open (0 shut … 1 open), given the
// seconds until or since the nearest customer passes through it: it swings
// open as they reach it and shuts behind them.
function doorSwing(dt) {
  const v = Math.max(0, Math.min(1, (1.1 - Math.abs(dt)) / 0.6));
  return v * v * (3 - 2 * v);
}

// A glazed door leaf filling the doorway x0..x1, y0..y1, hinged on side hx
// (x0 or x1) and swung in by `swing`: the leaf foreshortens toward the hinge
// and uncovers the shop behind it: `inside` is a colour, or a function that
// paints the interior (clipped to the doorway). Returns where an x on the
// shut leaf now sits, so handles, plates and signs can ride on it. Works
// with either kit (_bankKit, _nKit).
function doorLeaf(k, hx, x0, x1, y0, y1, swing, leaf, inside, edge) {
  const c = 1 - 0.8 * swing, sk = 1.4 * swing, fx = hx === x0 ? x1 : x0;
  const at = x => hx + (x - hx) * c;
  if (swing > 0.01) {
    if (typeof inside === 'function') {
      ctx.save(); ctx.beginPath(); ctx.rect(k.X(x0), k.Y(y0), k.X(x1) - k.X(x0), k.Y(y1) - k.Y(y0)); ctx.clip();
      inside(); ctx.restore();
    } else k.R(x0, y0, x1 - x0, y1 - y0, inside);
  }
  k.poly([[hx, y0], [at(fx), y0 + sk], [at(fx), y1 - sk * 0.5], [hx, y1]], leaf);
  if (swing > 0.01 && edge) k.R(at(fx) - (fx > hx ? 0.5 : 0), y0 + sk, 0.5, y1 - y0 - sk * 1.5, edge);
  return at;
}

const _BANK_SKINS = ['#f0d0b0','#c89870', '#8a5a3a', '#e0b890', '#6a4630'];
const _BANK_TOPS  = ['#2a3a5a', '#5a3a2a', '#3a5a4a', '#6a6a72', '#8a2a3a', '#2a4a7a', '#4a3a6a'];

// Business hours, falling back to a 9–5 day if the subtype has none.
function _bankOpen(sub, on) {
  if (!on) return false;
  const h = typeof DemandCurves !== 'undefined' ? DemandCurves.hours(sub) : null;
  if (h) return h.isOpenNow;
  const hr = DayNight.hour();
  return hr >= 9 && hr < 17;
}

// Street + pavement band shared by all three (y0 = pavement top, authored units).
function _bankStreet(k, w, y0, L) {
  k.R(0, y0, w, 10, L('#8a8e94', '#3e4248', '#202226'));
  if (Camera.zoom > 0.45) for (let x = 0; x < w; x += 8) k.R(x, y0, 0.4, 10, 'rgba(0,0,0,0.12)');
  k.R(0, y0 + 9, w, 1.5, L('#b0b4b8', '#54585e', '#2a2c30'));
  k.R(0, y0 + 10.5, w, 200, L('#46494e', '#202226', '#141518'));
  for (let x = 6; x < w; x += 30) k.R(x, y0 + 17, 13, 1.3, L('rgba(255,255,255,0.4)', 'rgba(220,220,200,0.18)', 'rgba(0,0,0,0.1)'));
}

/* ── First Trust Bank (4×4) ─────────────────────────────────────────
   A domed neoclassical branch: a gilded ribbed dome on a colonnaded drum
   behind a pedimented Ionic portico, rusticated wings with tall arched
   banking-hall windows, a bronze revolving door, the vault door turning
   in the left-hand window and an ATM in the right. Cash vans call at the
   kerb in the morning and late afternoon. Authored in a 160×160 box. */
function _renderBank(e, px, py, W, H, t) {
  const S = Math.min(W / 160, H / 160), on = e.powered;
  const k = _bankKit(px, py, S);
  const { R, RR, dot, ell, poly, ln, glow } = k;
  const hr = DayNight.hour(), dark = DayNight.darkness(), night = dark > 0.3;
  const open = _bankOpen('bank', on);
  const L = (d, n, o) => on ? (night ? n : d) : o;
  const detail = Camera.zoom > 0.45;
  const STONE = L('#e8e0cc', '#706a5e', '#34322c'), STONE_D = L('#cfc5ae', '#5a564c', '#2a2824'), STONE_S = L('#b2a68c', '#4a463e', '#222018');
  const GOLD = L('#d4af37', '#a88a30', '#3a3218'), GOLD_H = L('#f4dc84', '#d8bc60', '#4a4020');
  const hall = open ? (night ? '#ffd890' : '#f2dca0') : on ? L('#3e4a56', '#1a2230', '#101418') : '#101418';
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, 160 * S, 160 * S); ctx.clip();

  R(0, 112, 160, 26, L('#d6cfbe', '#58544c', '#24221e'));                   // granite plaza
  if (detail) for (let x = 0; x < 160; x += 10) R(x, 112, 0.4, 26, 'rgba(0,0,0,0.08)');
  _bankStreet(k, 160, 138, L);

  // ── Dome on its drum, set back on a raised attic behind the parapet ──
  // (Clear of the pediment: the drum stands on its own stepped base on the
  // roof, rather than appearing to perch on the pediment's apex.)
  const dX = 80;
  R(dX - 27, 28, 54, 5, STONE_D);                                           // attic step the drum stands on
  R(dX - 27, 28, 54, 1, 'rgba(255,255,255,0.12)');
  R(dX - 21, 17, 42, 11, STONE);                                            // drum
  for (let i = 0; i < 7; i++) {                                             // drum colonnade + windows
    const wx = dX - 18 + i * 6;
    R(wx, 18.5, 1.4, 9, STONE_S);
    if (i < 6) R(wx + 1.9, 19.5, 2.6, 7, open || (on && night) ? `rgba(255,222,150,${(0.55 + 0.2 * Math.sin(t * 1.7 + i)).toFixed(2)})` : L('#4a5a66', '#1c2430', '#101418'));
  }
  R(dX - 22, 16, 44, 2, STONE_D);
  ctx.fillStyle = GOLD;
  ctx.beginPath(); ctx.ellipse(k.X(dX), k.Y(16), 20 * S, 11 * S, 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill();
  if (detail) for (let i = 1; i < 8; i++) {                                // ribs
    const a = Math.PI + (i / 8) * Math.PI;
    ctx.strokeStyle = L('rgba(120,90,20,0.55)', 'rgba(60,46,10,0.6)', 'rgba(0,0,0,0.3)'); ctx.lineWidth = 0.6 * S;
    ctx.beginPath(); ctx.moveTo(k.X(dX + Math.cos(a) * 20), k.Y(16));
    ctx.quadraticCurveTo(k.X(dX + Math.cos(a) * 9), k.Y(8), k.X(dX), k.Y(5)); ctx.stroke();
  }
  ell(dX - 7, 10, 5, 2.6, L('rgba(255,245,200,0.45)', 'rgba(255,230,160,0.25)', 'rgba(0,0,0,0)'));   // sheen
  R(dX - 2.6, 1.2, 5.2, 4, GOLD_H); R(dX - 3.6, 4.6, 7.2, 1, GOLD);         // lantern
  if (open || (on && night)) R(dX - 1.4, 1.9, 2.8, 2.2, '#fff2c0');
  ln(dX, 1.2, dX, -0.5, GOLD, 0.8);
  if (on && night) glow(dX, 14, 28, '255,214,120', 0.32);                   // floodlit dome

  // ── Main block ──
  R(14, 44, 132, 68, STONE);
  R(14, 44, 2, 68, 'rgba(255,255,255,0.12)'); R(144, 44, 2, 68, 'rgba(0,0,0,0.12)');
  if (detail) for (let y = 48; y < 108; y += 4.5) {                         // rusticated courses on the wings
    R(14, y, 34, 0.5, 'rgba(0,0,0,0.11)'); R(112, y, 34, 0.5, 'rgba(0,0,0,0.11)');
    const off = (Math.round(y) % 9 < 4.5) ? 0 : 5;
    for (let x = 14 + off; x < 48; x += 10) R(x, y, 0.5, 4.5, 'rgba(0,0,0,0.08)');
    for (let x = 112 + off; x < 146; x += 10) R(x, y, 0.5, 4.5, 'rgba(0,0,0,0.08)');
  }
  // cornice with dentils and a balustraded parapet
  R(12, 40, 136, 4.5, STONE_D);
  if (detail) for (let x = 13; x < 147; x += 2.4) R(x, 43.2, 1.2, 1.2, STONE_S);
  R(12, 33, 136, 1.4, STONE);
  if (detail) for (let x = 15; x < 146; x += 3.2) { if (x > 46 && x < 114) continue; R(x, 34.4, 1.6, 5.6, STONE); }
  R(12, 39, 136, 1.4, STONE);
  R(14, 108, 132, 4, STONE_D);                                              // plinth

  // Tall arched banking-hall windows, two per wing.
  for (const wx of [20, 34, 116, 130]) {
    const wy = 56, ww = 10, wh = 34;
    R(wx - 1.2, wy - 1, ww + 2.4, wh + 2, STONE_S); dot(wx + ww / 2, wy, ww / 2 + 1.2, STONE_S);
    R(wx, wy, ww, wh, hall); dot(wx + ww / 2, wy, ww / 2, hall);
    if (detail) {
      ln(wx + ww / 2, wy - 5, wx + ww / 2, wy + wh, STONE_S, 0.5);          // mullion + transoms
      for (const f of [0.3, 0.62]) ln(wx, wy + wh * f, wx + ww, wy + wh * f, STONE_S, 0.5);
      R(wx + ww / 2 - 1.2, wy - 6.8, 2.4, 2.4, GOLD);                       // keystone
    }
    if (open && detail) {                                                   // chandelier + tellers behind the glass
      dot(wx + ww / 2, wy + 4, 1.4, '#fff4c8');
      for (const cx of [wx + 2.5, wx + 7.5]) k.person(cx, wy + wh - 4, _BANK_TOPS[(wx + cx) % 7 | 0], _BANK_SKINS[(wx | 0) % 5], 0, 0.9);
      R(wx, wy + wh - 4, ww, 1.4, '#6a4a2a');                               // teller counter
    }
    if (open) glow(wx + ww / 2, wy + wh / 2, 14, '255,214,140', night ? 0.3 : 0.12);
    R(wx - 2, wy + wh + 1, ww + 4, 1.6, STONE_D);                           // sill
  }

  // Vault door, behind the lower pane of the inner-left window.
  {
    const vx = 39, vy = 79, vr = 4.2;
    dot(vx, vy, vr + 0.8, '#2a2418');
    dot(vx, vy, vr, on ? '#8a7128' : '#221d12');
    ctx.save(); ctx.translate(k.X(vx), k.Y(vy)); if (open) ctx.rotate(t * 0.35);
    ctx.strokeStyle = on ? 'rgba(255,232,150,0.85)' : 'rgba(40,34,20,0.8)'; ctx.lineWidth = 0.6 * S;
    for (let i = 0; i < 6; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, -vr * 0.25 * S); ctx.lineTo(0, -vr * 0.9 * S); ctx.stroke(); }
    ctx.restore();
    dot(vx, vy, 1, on ? '#f0da8e' : '#2a2416');
  }

  // ── Portico: recessed porch, revolving door, Ionic columns ──
  R(48, 56, 64, 52, L('#3e372c', '#1c1a16', '#141210'));                    // porch shadow
  if (open) {
    const g = ctx.createLinearGradient(0, k.Y(56), 0, k.Y(108));
    g.addColorStop(0, `rgba(255,224,150,${(0.28 + 0.06 * Math.sin(t * 1.6)).toFixed(3)})`); g.addColorStop(1, 'rgba(255,190,110,0.04)');
    ctx.fillStyle = g; ctx.fillRect(k.X(48), k.Y(56), 64 * S, 52 * S);
  }
  // bronze revolving door with a lit transom. It rests in an X and turns a
  // quarter each time a customer passes through it (customer timing as on
  // the steps below: everyone goes in or comes out at a whole number of
  // their cycles), easing up to speed and back to rest, with whoever is
  // going through riding round inside the drum. The banking hall shows
  // through the glass behind it.
  const custC = p => t * (0.035 + p * 0.006) + p * 0.23;
  const TURN = 1.8;                                                         // seconds a quarter turn takes
  let quarters = 0, rider = null;
  if (open) for (let p = 0; p < 5; p++) {
    const w = TURN / 2 * (0.035 + p * 0.006), c = custC(p) + w, n = Math.floor(c);
    const f = Math.min(1, (c - n) / (2 * w));
    quarters += n + f * f * (3 - 2 * f);
    if (f < 1) rider = { p, f, out: p % 2 === 0 };
  }
  RR(68, 76, 24, 32, 1.2, L('#6b5220', '#3a2c12', '#1d1a13'));
  R(69.5, 77.5, 21, 5, open ? (night ? '#ffd890' : '#f0d898') : L('#2a2418', '#1a160e', '#120f0a'));
  {
    const DX0 = 70.5, DX1 = 89.5, DY0 = 83, DY1 = 107, DR = 9;
    // the hall through the glass: back wall, chandelier, a teller at the
    // counter, marble floor
    R(DX0, DY0, DX1 - DX0, DY1 - DY0, open ? (night ? '#e8c27c' : '#e8d6a8') : hall);
    if (open) {
      if (detail) for (const cx of [73, 87]) R(cx - 1, DY0, 2, 14, night ? '#d4aa64' : '#d8c494');   // pilasters
      dot(80, 86.5, 1.5, '#fff4c8'); glow(80, 87, 7, '255,236,170', night ? 0.6 : 0.3);
      if (detail) ln(80, DY0, 80, 85, '#8a6a28', 0.3);
      k.person(84.5, 96.5, _BANK_TOPS[0], _BANK_SKINS[(e.col + e.row) % 5], 0, 0.9);
      R(DX0, 95.5, DX1 - DX0, 3.6, '#6a4a2a'); R(DX0, 95.1, DX1 - DX0, 0.7, GOLD);   // teller counter
      R(DX0, 99.1, DX1 - DX0, DY1 - 99.1, night ? '#d0bc98' : '#e4dccb');
      if (detail) for (let x = DX0, i = 0; x < DX1; x += 2.4, i++) for (let y = 99.1, j = 0; y < DY1; y += 2, j++)
        if ((i + j) % 2) R(x, y, 2.4, 2, 'rgba(60,50,40,0.14)');
    }
    // drum floor, then the four wings sorted back to front around the post
    ell(80, DY1 - 0.4, DR, 1.4, 'rgba(0,0,0,0.18)');
    const spin = quarters * 0.25 + 0.125;
    const wings = [0, 1, 2, 3].map(i => (spin + i / 4) * Math.PI * 2).sort((a, b) => Math.sin(a) - Math.sin(b));
    const wing = a => {
      const x = 80 + Math.cos(a) * DR, edgeOn = Math.abs(Math.sin(a));       // seen face-on it's clear, edge-on it's dense
      R(Math.min(80, x), DY0 + 1, Math.abs(x - 80), DY1 - DY0 - 1.5, `rgba(${open ? '190,215,225' : '60,70,80'},${(0.12 + 0.3 * edgeOn).toFixed(2)})`);
      R(Math.min(80, x), DY1 - 1.6, Math.abs(x - 80), 1, L('rgba(168,132,44,0.8)', 'rgba(106,84,34,0.8)', '#241f14'));   // kick rail
      R(x - 0.3, DY0 + 1, 0.6, DY1 - DY0 - 1.5, L('#c8a040', '#7a6228', '#2a2416'));   // bronze stile
    };
    let i = 0;
    for (; i < 4 && Math.sin(wings[i]) < 0; i++) wing(wings[i]);
    if (rider) {                                                            // the customer riding round
      const bump = Math.sin(rider.f * Math.PI), dir = rider.out ? -1 : 1;
      ctx.globalAlpha = Math.min(1, bump * 1.6);
      k.person(80 + (rider.f - 0.5) * 7 * dir, 104.5 - (rider.out ? 1 - rider.f : rider.f) * 2, _BANK_TOPS[rider.p % 7], _BANK_SKINS[rider.p % 5], 0, 1.2);
      ctx.globalAlpha = 1;
    }
    R(79.6, DY0 + 1, 0.8, DY1 - DY0 - 1.5, L('#c8a040', '#7a6228', '#2a2416'));   // centre post
    for (; i < 4; i++) wing(wings[i]);
    // the drum's curved glass sides and a sheen across the front
    for (const [sx, dir] of [[DX0, 1], [DX1, -1]]) {
      R(sx - (dir > 0 ? 0 : 0.6), DY0, 0.6, DY1 - DY0, L('#8a6a24', '#4a3a18', '#1d1a13'));
      R(sx + (dir > 0 ? 0.6 : -2.6), DY0, 2, DY1 - DY0, 'rgba(200,225,235,0.22)');   // glass curving away
    }
    if (detail) poly([[74, DY0 + 1], [75.6, DY0 + 1], [73.2, DY1 - 1], [72.4, DY1 - 1]], 'rgba(255,255,255,0.14)');
  }
  RR(66.5, 74.5, 27, 3, 0.8, GOLD);                                         // canopy
  for (const cx of [53, 64, 96, 107]) {
    R(cx - 3.2, 60, 6.4, 46, STONE);
    if (detail) for (let f = -2; f <= 2; f++) R(cx + f * 1.2 - 0.15, 62, 0.3, 42, 'rgba(0,0,0,0.12)');   // fluting
    R(cx + 0.8, 60, 2.4, 46, 'rgba(0,0,0,0.08)');
    R(cx - 4.4, 58, 8.8, 2.4, STONE_D);                                     // Ionic capital
    dot(cx - 4, 59.6, 1.3, STONE_D); dot(cx + 4, 59.6, 1.3, STONE_D);       // volutes
    if (detail) { dot(cx - 4, 59.6, 0.5, STONE_S); dot(cx + 4, 59.6, 0.5, STONE_S); }
    R(cx - 4.2, 105, 8.4, 3, STONE_D);
    if (on && night) glow(cx, 104, 9, '255,220,150', 0.28);                 // uplighting
  }
  // entablature carries the name
  R(44, 47, 72, 10, STONE);
  R(44, 55, 72, 2, STONE_D);
  k.text('FIRST TRUST BANK', 80, 51.2, 5.4, 64, L('#7a5a18', '#e8c868', '#2a2418'));
  // pediment (low, classical pitch) with a gilt clock medallion
  poly([[42, 47.5], [80, 35.5], [118, 47.5]], STONE);
  poly([[51, 46.2], [80, 38.6], [109, 46.2]], STONE_D);
  ln(42, 47.5, 80, 35.5, STONE_S, 1); ln(80, 35.5, 118, 47.5, STONE_S, 1);
  dot(80, 42.8, 3.3, GOLD); dot(80, 42.8, 2.5, L('#f8f2dc', '#b8b0a0', '#3a3830'));
  {                                                                        // its clock reads game time
    const ha = (hr % 12) / 12 * Math.PI * 2 - Math.PI / 2, ma = (hr % 1) * Math.PI * 2 - Math.PI / 2;
    ln(80, 42.8, 80 + Math.cos(ha) * 1.3, 42.8 + Math.sin(ha) * 1.3, '#222', 0.5);
    ln(80, 42.8, 80 + Math.cos(ma) * 2.1, 42.8 + Math.sin(ma) * 2.1, '#222', 0.35);
  }
  if (detail) for (const s of [-1, 1]) {                                   // laurel sprays either side
    for (let i = 0; i < 4; i++) ell(80 + s * (6.5 + i * 3.2), 44 + i * 0.4, 1.4, 0.7, GOLD);
  }

  // ATM alcove in the right wing's base.
  {
    RR(122, 92, 14, 14, 1, L('#2a2a30', '#18181c', '#101012'));
    R(124, 94, 10, 5, open || on ? `rgba(120,235,190,${(0.55 + 0.2 * Math.sin(t * 3.1)).toFixed(2)})` : '#101410');
    R(125, 100, 8, 3, L('#6d6252', '#3a342a', '#1a1710'));
    if (on) k.text('ATM', 129, 90.6, 2.4, 10, L('#2a6a50', '#60e0a8', '#1a2a20'), 'Arial, sans-serif');
    if (on && !night || open) k.person(129, 116, _BANK_TOPS[3], _BANK_SKINS[1], 0, 1.2);
    if (on && night) glow(129, 96, 10, '120,235,190', 0.3);
  }

  // ── Steps, planters, lamps, flags ──
  for (let s = 0; s < 4; s++) R(46 - s * 3, 108 + s * 3.2, 68 + s * 6, 3.2, s % 2 ? STONE : STONE_D);
  for (const x of [20, 140]) {
    RR(x - 7, 116, 14, 7, 1, L('#8a8070', '#3e3a32', '#1e1c18'));
    ell(x, 114.5, 6, 4.4, L('#3a6a30', '#1a3020', '#101a10'));
    ell(x - 1.5, 113, 3, 2, L('rgba(150,210,110,0.35)', 'rgba(60,110,60,0.2)', 'rgba(0,0,0,0)'));
  }
  k.lamp(36, 126, 16, on, night); k.lamp(124, 126, 16, on, night);
  if (on) { k.flag(6, 70, 42, '#3a6ab8', '#f0f0f0', t, 0); k.flag(150, 70, 42, '#b83a3a', '#f0d070', t, 1.7); }
  else { ln(6, 112, 6, 70, '#3a3834', 0.7); ln(150, 112, 150, 70, '#3a3834', 0.7); }
  if (detail) R(70, 113, 20, 3.4, L('#c8bea8', '#4e4a42', '#22201c'));      // EST. plaque
  if (detail) k.text('EST. 1888', 80, 114.8, 2.2, 18, L('#6a5420', '#c8a860', '#2a2418'));

  // ── Customers on the steps; cash van at the kerb mornings and late afternoons ──
  if (open) {
    for (let p = 0; p < 5; p++) {
      const u = custC(p) % 1;
      const kk = p % 2 ? u : 1 - u;
      const a = Math.min(1, (1 - kk) / 0.03);                               // stepping into the revolving door
      if (a <= 0.01) continue;
      const toDoor = Math.min(1, Math.max(0, (kk - 0.55) / 0.41));          // drifting across to the door near the top
      const x = (62 + p * 9 + Math.sin(u * 6 + p) * 1.5) * (1 - toDoor) + 80 * toDoor;
      const y = 136 - kk * 28;
      ctx.globalAlpha = a;
      k.person(x, y, _BANK_TOPS[p % 7], _BANK_SKINS[p % 5], Math.abs(Math.sin(t * 6 + p)) * 0.5, 1.3);
      if (p === 2) R(x + 1, y - 3.2, 2.4, 2, '#3a2a1a');                    // briefcase
      ctx.globalAlpha = 1;
    }
  }
  const vanCall = on && ((hr >= 8.5 && hr < 9.5) || (hr >= 16.5 && hr < 17.5));
  if (vanCall) {
    k.van(104, 141, on, night);
    const u = (t * 0.12) % 1, kk = u < 0.5 ? u * 2 : 2 - u * 2;              // guard ferrying a cash box
    k.person(100 - kk * 14, 140 - kk * 22, '#2a3a4a', _BANK_SKINS[2], 0, 1.3);
    R(101.5 - kk * 14, 135.6 - kk * 22, 2.6, 2, '#8a8a8a');
  } else if (on && night) {
    k.person(84, 112, '#1a2430', _BANK_SKINS[4], 0, 1.3);                   // night guard by the door
    dot(85.6, 107.6, 0.8, 'rgba(255,250,210,0.9)');                         // torch
    glow(87, 108, 6, '255,250,210', 0.35);
  }

  ctx.restore();
}

/* ── Cornerstone Savings & Loan (3×3) ───────────────────────────────
   A neighbourhood savings bank from the 1960s: red brick with a white
   fascia, a glass front, a rooftop bulb sign, a time-and-temperature
   pylon that flips between the clock and the weather, and a drive-thru
   canopy where cars queue and the pneumatic tube carrier shoots up and
   over to the teller. Authored in a 120×120 box. */
function _renderSavingsLoan(e, px, py, W, H, t) {
  const S = Math.min(W / 120, H / 120), on = e.powered;
  const k = _bankKit(px, py, S);
  const { R, RR, dot, ell, poly, ln, glow } = k;
  const hr = DayNight.hour(), dark = DayNight.darkness(), night = dark > 0.3;
  const open = _bankOpen('savingsloan', on);
  const L = (d, n, o) => on ? (night ? n : d) : o;
  const detail = Camera.zoom > 0.45;
  const BRICK = L('#a8483a', '#4e2620', '#2a1612'), BRICK_D = L('#8a3a2e', '#3e1e1a', '#20100e');
  const TRIM = L('#f2eee2', '#7a776e', '#34322e');
  const glass = open ? (night ? '#ffe2a0' : '#b8d4e0') : L('#3e4a56', '#1a2230', '#101418');
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, 120 * S, 120 * S); ctx.clip();

  R(0, 84, 120, 14, L('#5a5d62', '#2a2c30', '#18191c'));                    // lot
  for (let x = 4; x < 76; x += 12) R(x, 86, 0.8, 10, L('rgba(255,255,255,0.55)', 'rgba(220,220,200,0.2)', 'rgba(0,0,0,0.1)'));
  _bankStreet(k, 120, 98, L);

  // ── Drive-thru canopy (right) — drawn first, the building overlaps its post ──
  R(84, 40, 34, 5, TRIM); R(84, 44.5, 34, 1.4, L('#2a6a9a', '#163a56', '#101820'));   // fascia with a blue stripe
  R(84, 45.5, 34, 38.5, L('#6a6d72', '#2e3034', '#1a1b1e'));               // lanes under the canopy
  ln(101, 46, 101, 84, L('#f0d040', '#7a6a20', '#2a2410'), 0.6);
  for (const x of [92, 110]) { R(x - 1, 45.5, 2, 30, TRIM); RR(x - 3, 70, 6, 6, 1, L('#d8d4c8', '#5a5850', '#2a2824')); }   // posts + teller pods
  for (const x of [92, 110]) R(x - 2, 71, 4, 2.4, open ? '#a8e0f0' : L('#3e4a56', '#1a2230', '#101418'));
  if (on && night) glow(101, 50, 22, '255,240,210', 0.3);
  // cars in the lanes during hours
  if (open) {
    for (const [lx, ph] of [[92, 0], [110, 0.5]]) {
      const u = (t * 0.05 + ph) % 1;
      const y = u < 0.7 ? 92 - u / 0.7 * 18 : 74 - (u - 0.7) / 0.3 * 40;  // pull up, wait, drive out the top
      if (y > 44) {
        RR(lx - 5 + 8, y - 4, 8, 13, 2, ['#3a6ab8', '#c84a3a', '#e0c040', '#4a8a5a'][(Math.floor(t * 0.05 + ph) + (lx | 0)) % 4]);
        R(lx - 5 + 9, y - 1.5, 6, 3, '#2a3a48');
      }
    }
    // pneumatic carrier: up from the pod, across the canopy, into the building
    const u = (t * 0.3) % 1;
    const path = u < 0.3 ? [110 + 0 * u, 70 - (u / 0.3) * 24] : u < 0.8 ? [110 - ((u - 0.3) / 0.5) * 30, 46] : [80 - ((u - 0.8) / 0.2) * 4, 46 + ((u - 0.8) / 0.2) * 8];
    if (detail) { ln(110, 70, 110, 46, 'rgba(200,220,230,0.35)', 1.6); ln(110, 46, 80, 46, 'rgba(200,220,230,0.35)', 1.6); }
    RR(path[0] - 1.2, path[1] - 1.8, 2.4, 3.6, 1, '#e0e8f0');
  }

  // ── The branch ──
  R(6, 40, 80, 46, BRICK);
  if (detail) for (let y = 42; y < 86; y += 2.4) {                          // coursing
    R(6, y, 80, 0.35, BRICK_D);
    const off = (Math.round(y / 2.4) % 2) * 2.5;
    for (let x = 6 + off; x < 86; x += 5) R(x, y, 0.35, 2.4, BRICK_D);
  }
  R(4, 34, 84, 7, TRIM);                                                    // white fascia
  R(4, 40.2, 84, 1.2, L('#2a6a9a', '#163a56', '#101820'));
  k.text('CORNERSTONE SAVINGS & LOAN', 46, 37.6, 4, 76, L('#1e4a72', '#d0e4f4', '#2a2c30'), 'Arial, sans-serif');
  // glass storefront between brick piers
  for (let i = 0; i < 4; i++) {
    const wx = 10 + i * 18.5;
    R(wx, 48, 15, 26, glass);
    if (detail) { ln(wx, 61, wx + 15, 61, TRIM, 0.5); R(wx + 7.3, 48, 0.4, 26, TRIM); }
    if (open && detail && i !== 1) {                                         // tellers + a rubber plant
      k.person(wx + 4, 72, _BANK_TOPS[(i * 3) % 7], _BANK_SKINS[(i + 1) % 5], 0, 1);
      R(wx, 70, 15, 1.2, '#7a5a3a');
    }
    if (open) glow(wx + 7.5, 60, 12, '255,220,150', night ? 0.25 : 0.08);
  }
  // door with a push bar and an hours plate
  R(28.5, 52, 15, 22, L('#c8dce4', '#3e4a56', '#141a20'));
  R(28.5, 52, 15, 22, open ? 'rgba(255,230,170,0.25)' : 'rgba(0,0,0,0.25)');
  ln(29, 63, 43, 63, L('#a8a8a8', '#5a5a5a', '#2a2a2a'), 0.7);
  if (detail) { R(31, 55, 9, 3, open ? '#2a9a5a' : '#9a2a2a'); k.text(open ? 'OPEN' : 'CLOSED', 35.5, 56.6, 1.8, 8, '#f4f4f4', 'Arial, sans-serif'); }
  // ATM in the end pier
  RR(73, 76, 10, 9, 0.8, L('#2a2a30', '#18181c', '#101012'));
  R(74.5, 77.5, 7, 3.4, on ? `rgba(120,235,190,${(0.55 + 0.2 * Math.sin(t * 3.1)).toFixed(2)})` : '#101410');
  if (on && night) glow(78, 79, 8, '120,235,190', 0.3);
  // flower boxes
  for (const x of [10, 47, 65]) { R(x, 74, 12, 3, BRICK_D); for (let f = 0; f < 5; f++) dot(x + 1.5 + f * 2.2, 73.4, 1, ['#e84a6a', '#f0d040', '#f4f4f4'][f % 3]); }
  R(4, 85, 84, 1.2, TRIM);

  // ── Rooftop bulb sign ──
  R(18, 22, 56, 11, L('#1e4a72', '#0e2438', '#101418'));
  R(18, 22, 56, 1, TRIM);
  ln(26, 33, 26, 34, TRIM, 1); ln(66, 33, 66, 34, TRIM, 1);
  k.text('CORNERSTONE', 46, 27.6, 6, 50, on ? (night ? '#ffe9a8' : '#f4f0e0') : '#3a3a36', 'Arial, sans-serif');
  if (on && night && detail) {                                             // chasing bulbs
    for (let i = 0; i < 20; i++) {
      const lit = (Math.floor(t * 6) + i) % 3 === 0;
      dot(19.5 + i * 2.8, 22.6, 0.5, lit ? '#fff6c0' : '#a08a40');
      dot(19.5 + i * 2.8, 32.4, 0.5, !lit ? '#fff6c0' : '#a08a40');
    }
    glow(46, 27, 30, '255,232,160', 0.25);
  }

  // ── Time & temperature pylon ──
  R(2, 40, 3, 46, L('#d8d4c8', '#5a5850', '#2a2824'));
  R(1.5, 44, 4, 2, L('#2a6a9a', '#163a56', '#101820'));
  RR(0.5, 24, 9, 15, 1, L('#1a1c20', '#101114', '#0a0b0c'));
  if (on) {
    const showTemp = Math.floor(t / 3) % 2 === 1;
    const temp = typeof WeatherEventSystem !== 'undefined' && WeatherEventSystem.getTemperature ? Math.round(WeatherEventSystem.getTemperature()) : 18;
    const hh = Math.floor(hr), mm = Math.floor((hr % 1) * 60);
    const str = showTemp ? `${temp}°` : `${hh}:${String(mm).padStart(2, '0')}`;
    k.text(str, 5, 31.5, 4.2, 8, '#ffb040', 'Courier New, monospace');
    if (night) glow(5, 31.5, 9, '255,176,64', 0.35);
  }

  // ── Customers, lamps ──
  k.lamp(60, 98, 14, on, night);
  if (open) {
    for (let p = 0; p < 3; p++) {
      const u = (t * (0.04 + p * 0.01) + p * 0.33) % 1, kk = p % 2 ? u : 1 - u;
      const x = 22 + p * 14 + Math.sin(u * 5 + p) * 2, y = 96 - kk * 20;
      if (y < 78) continue;
      k.person(x, y, _BANK_TOPS[(p + 2) % 7], _BANK_SKINS[(p + 2) % 5], Math.abs(Math.sin(t * 6 + p)) * 0.5, 1.2);
    }
  }
  // a parked car or two in the lot
  for (const [x, c] of [[5, '#5a6a7a'], [53, '#8a3a2a']]) {
    if (!on || (hr < 8 || hr > 18) && x !== 5) continue;
    RR(x, 87, 10, 6, 1.6, c); R(x + 2, 88, 6, 1.6, '#2a3a48');
  }

  ctx.restore();
}

/* ── Sterling Reserve Bank (5×4) ────────────────────────────────────
   An art-deco reserve bank in white marble: a stepped central tower with
   gilt fins and a sunburst crown, low wings with tall bronze-mullioned
   windows, and the great round vault door standing open in the left wing
   on a stack of gold bars. A rate ticker scrolls over the doors, a cash
   convoy loads at the side bay, and after dark the crown is floodlit and
   searchlights sweep the sky. Authored in a 200×160 box. */
function _renderReserveBank(e, px, py, W, H, t) {
  const S = Math.min(W / 200, H / 160), on = e.powered;
  const k = _bankKit(px, py, S);
  const { R, RR, dot, ell, poly, ln, glow } = k;
  const hr = DayNight.hour(), dark = DayNight.darkness(), night = dark > 0.3;
  const open = _bankOpen('reservebank', on);
  const L = (d, n, o) => on ? (night ? n : d) : o;
  const detail = Camera.zoom > 0.45;
  const MARBLE = L('#f0ece2', '#76726a', '#34322e'), MARBLE_D = L('#d8d2c4', '#5e5a52', '#2a2826'), MARBLE_S = L('#bcb4a2', '#4a4640', '#22201c');
  const GOLD = L('#d4af37', '#b8962e', '#3a3218'), GOLD_H = L('#f6e08c', '#e8cc70', '#4a4020');
  const BRONZE = L('#5a4420', '#2e2410', '#16120a');
  const hall = open ? (night ? '#ffd890' : '#f0dca8') : on ? L('#3e4a56', '#1a2230', '#101418') : '#101418';
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, 200 * S, 160 * S); ctx.clip();

  // night searchlights, sweeping behind the tower
  if (on && night) {
    for (let i = 0; i < 2; i++) {
      const a = -Math.PI / 2 + Math.sin(t * 0.35 + i * 2.2) * 0.55;
      const ox = 100 + (i ? 14 : -14), oy = 30;
      const g = ctx.createLinearGradient(k.X(ox), k.Y(oy), k.X(ox + Math.cos(a) * 60), k.Y(oy + Math.sin(a) * 60));
      g.addColorStop(0, 'rgba(255,240,200,0.28)'); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.beginPath();
      ctx.moveTo(k.X(ox), k.Y(oy));
      ctx.lineTo(k.X(ox + Math.cos(a - 0.08) * 70), k.Y(oy + Math.sin(a - 0.08) * 70));
      ctx.lineTo(k.X(ox + Math.cos(a + 0.08) * 70), k.Y(oy + Math.sin(a + 0.08) * 70));
      ctx.closePath(); ctx.fill();
    }
  }
  R(0, 116, 200, 22, L('#d8d2c4', '#56524a', '#24221e'));                   // marble forecourt
  if (detail) for (let x = 0; x < 200; x += 12) { R(x, 116, 0.4, 22, 'rgba(0,0,0,0.07)'); R(x + 6, 127, 0.4, 11, 'rgba(0,0,0,0.05)'); }
  _bankStreet(k, 200, 138, L);

  // ── Central stepped tower ──
  const tiers = [[66, 40, 68], [74, 26, 52], [82, 14, 36]];                 // [x, top, width]
  for (const [x, top, w] of tiers) {
    R(x, top, w, 116 - top, MARBLE);
    R(x + w - 3, top, 3, 116 - top, 'rgba(0,0,0,0.08)');
    R(x, top, w, 2, MARBLE_D);
  }
  // gilt fins running up the tower
  for (let i = 0; i < 5; i++) {
    const fx = 86 + i * 7;
    R(fx, 16, 1.6, 64, GOLD);
    if (detail) R(fx, 16, 0.6, 64, GOLD_H);
  }
  // windows between the fins (offices; the boardroom stays lit late)
  for (let i = 0; i < 4; i++) for (let f = 0; f < 6; f++) {
    const wx = 88.5 + i * 7, wy = 20 + f * 10;
    const lit = on && (open || (night && (i * 7 + f * 3 + Math.floor(hr)) % 5 === 0));
    R(wx, wy, 4, 7, lit ? '#ffe2a0' : L('#5a7088', '#1c2430', '#101418'));
  }
  // sunburst crown + mast
  poly([[82, 14], [100, 2], [118, 14]], GOLD);
  if (detail) for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i + 0.5) / 9 * Math.PI;
    ln(100, 14, 100 + Math.cos(a) * 15, 14 + Math.sin(a) * 10, GOLD_H, 0.6);
  }
  ln(100, 2, 100, -4, GOLD_H, 1);
  dot(100, -3.5, 1, on && Math.sin(t * 3) > 0 ? '#ff4030' : '#5a2018');      // aviation light
  if (on && night) glow(100, 12, 34, '255,214,120', 0.38);

  // ── Wings ──
  for (const [x0, x1] of [[8, 66], [134, 192]]) {
    R(x0, 58, x1 - x0, 58, MARBLE);
    R(x0, 58, x1 - x0, 3, MARBLE_D); R(x0 - 1, 56, x1 - x0 + 2, 2.4, GOLD);
    if (detail) for (let y = 64; y < 114; y += 5) R(x0, y, x1 - x0, 0.4, 'rgba(0,0,0,0.07)');
  }
  // tall bronze-mullioned windows on the right wing
  for (let i = 0; i < 4; i++) {
    const wx = 138 + i * 13.5, wy = 66, ww = 9, wh = 40;
    R(wx - 1, wy - 1, ww + 2, wh + 2, BRONZE);
    R(wx, wy, ww, wh, hall);
    if (detail) { for (const f of [0.25, 0.5, 0.75]) R(wx, wy + wh * f, ww, 0.6, BRONZE); R(wx + ww / 2 - 0.3, wy, 0.6, wh, BRONZE); }
    poly([[wx - 1, wy - 1], [wx + ww / 2, wy - 5], [wx + ww + 1, wy - 1]], GOLD);   // deco chevron head
    if (open) glow(wx + ww / 2, wy + wh / 2, 14, '255,214,140', night ? 0.3 : 0.1);
    if (open && detail && i % 2 === 0) k.person(wx + ww / 2, wy + wh - 2, _BANK_TOPS[i % 7], _BANK_SKINS[i % 5], 0, 1);
  }

  // ── Vault hall, left wing: the great door stands open on the gold ──
  {
    R(12, 66, 50, 42, L('#2a2620', '#16140f', '#100e0a'));                  // vault chamber
    R(12, 66, 50, 42, open ? 'rgba(255,214,140,0.12)' : 'rgba(0,0,0,0)');
    // gold bars stacked in the chamber
    const bars = open || on ? 1 : 0;
    if (bars) for (let row = 0; row < 4; row++) for (let i = 0; i < 6 - row; i++) {
      const bx = 18 + row * 2.5 + i * 5, by = 102 - row * 3;
      poly([[bx, by], [bx + 4.4, by], [bx + 3.8, by - 2.6], [bx + 0.6, by - 2.6]], GOLD);
      R(bx + 0.8, by - 2.4, 2.8, 0.6, GOLD_H);
    }
    if (open && detail) {                                                    // a glint travelling over the stack
      const gx = 18 + ((t * 0.25) % 1) * 30;
      glow(gx, 96, 5, '255,250,210', 0.6);
    }
    // the door: swung open on its hinge at night it's shut
    const vx = 50, vy = 86, vr = 15;
    const swing = open ? 0.38 : 1;                                           // 1 = closed, flat on
    ell(vx, vy, vr * swing + 1.5, vr + 1.5, L('#5a5850', '#2e2c28', '#1a1916'));
    ell(vx, vy, vr * swing, vr, L('#b8b4a8', '#5e5c54', '#2a2826'));
    if (detail) {
      ctx.save(); ctx.translate(k.X(vx), k.Y(vy)); ctx.scale(swing, 1);
      if (!open) ctx.rotate(Math.sin(t * 0.2) * 0.1);
      ctx.strokeStyle = L('#6a665c', '#3a3832', '#1a1916'); ctx.lineWidth = 0.7 * S;
      for (const r of [vr * 0.8, vr * 0.55]) { ctx.beginPath(); ctx.arc(0, 0, r * S, 0, Math.PI * 2); ctx.stroke(); }
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.fillStyle = L('#d8d4c8', '#7a776e', '#34322e'); ctx.beginPath(); ctx.arc(Math.cos(a) * vr * 0.9 * S, Math.sin(a) * vr * 0.9 * S, 0.8 * S, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = GOLD; ctx.lineWidth = 0.9 * S;
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + (open ? 0 : t * 0.2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * vr * 0.45 * S, Math.sin(a) * vr * 0.45 * S); ctx.stroke(); }
      ctx.restore();
    }
    dot(vx, vy, 2, GOLD);
    if (on && !open) { R(14, 104, 46, 1, 'rgba(255,60,40,0.6)'); }          // laser trip line when shut
    if (open && detail) k.person(36, 106, '#2a3a4a', _BANK_SKINS[2], 0, 1.2);   // vault officer
    R(10, 108, 54, 2, BRONZE);
  }

  // ── Entrance: bronze doors under a ticker ──
  R(80, 84, 40, 32, BRONZE);
  for (let i = 0; i < 3; i++) {
    const dx = 82 + i * 12.6;
    R(dx, 90, 11, 26, open ? 'rgba(255,220,150,0.55)' : L('#2a2014', '#16110a', '#0e0b06'));
    if (detail) { R(dx + 5.2, 90, 0.6, 26, GOLD); R(dx, 102, 11, 0.6, GOLD); }
  }
  // deco relief over the door: a gilt eagle with spread wings
  if (detail) {
    poly([[100, 61], [86, 66], [91, 68], [100, 64.5], [109, 68], [114, 66]], GOLD);
    dot(100, 61.5, 1.8, GOLD_H);
  }
  k.text('STERLING RESERVE BANK', 100, 77, 4.6, 62, L('#6a5014', '#f0d070', '#2a2418'));
  // scrolling rate ticker
  RR(80, 80.5, 40, 3.4, 0.6, '#0c0e10');
  if (on) {
    ctx.save(); ctx.beginPath(); ctx.rect(k.X(80.5), k.Y(80.5), 39 * S, 3.4 * S); ctx.clip();
    ctx.font = `bold ${2.6 * S}px Courier New, monospace`; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffb040';
    const msg = `BASE RATE 4.25%  ·  ${DayNight.timeString ? DayNight.timeString() : ''}  ·  GOLD ▲0.8%  ·  BONDS ▼0.2%  ·  `;
    const mw = ctx.measureText(msg).width;
    const off = (t * 10 * S) % mw;
    ctx.fillText(msg + msg, k.X(80.5) - off, k.Y(82.3));
    ctx.restore();
    if (night) glow(100, 82, 18, '255,176,64', 0.2);
  }
  // steps + gilt lamps standards
  for (let s = 0; s < 4; s++) R(76 - s * 3, 116 + s * 3, 48 + s * 6, 3, s % 2 ? MARBLE : MARBLE_D);
  for (const x of [72, 128]) {
    R(x - 1, 100, 2, 16, GOLD); RR(x - 2.4, 96, 4.8, 5, 1, on && night ? '#fff0c0' : GOLD_H);
    if (on && night) glow(x, 98, 12, '255,232,170', 0.45);
  }

  // ── Loading bay on the right end, with a convoy calling ──
  R(192, 74, 8, 42, MARBLE_D);
  const convoy = on && ((hr >= 7 && hr < 8.5) || (hr >= 18 && hr < 19.5));
  if (convoy) {
    k.van(168, 141, on, night);
    const u = (t * 0.1) % 1, kk = u < 0.5 ? u * 2 : 2 - u * 2;
    k.person(170 - kk * 8, 140 - kk * 18, '#2a3a4a', _BANK_SKINS[0], 0, 1.3);
    R(171.5 - kk * 8, 135.6 - kk * 18, 3.4, 2.2, GOLD);                     // a bar on the trolley
  }
  // rooftop flags on the wings
  if (on) { k.flag(14, 40, 16, '#1e3a6a', '#f0d070', t, 0.4); k.flag(186, 40, 16, '#1e3a6a', '#f0d070', t, 2.1); }

  // ── People in the forecourt ──
  if (open) {
    for (let p = 0; p < 6; p++) {
      const u = (t * (0.03 + p * 0.006) + p * 0.19) % 1, kk = p % 2 ? u : 1 - u;
      const x = 84 + p * 6.5 + Math.sin(u * 6 + p) * 1.5, y = 137 - kk * 20;
      if (y < 118) continue;
      k.person(x, y, _BANK_TOPS[p % 7], _BANK_SKINS[p % 5], Math.abs(Math.sin(t * 6 + p)) * 0.5, 1.3);
      if (p % 3 === 1) R(x + 1, y - 3.2, 2.4, 2, '#2a1a10');
    }
  } else if (on && night) {
    k.person(77, 118, '#1a2430', _BANK_SKINS[3], 0, 1.3); k.person(123, 118, '#1a2430', _BANK_SKINS[1], 0, 1.3);   // guards
  }

  ctx.restore();
}
