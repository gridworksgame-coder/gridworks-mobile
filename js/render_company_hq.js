/* ═══════════════════════════════════════════════════════════════════
   COMPANY HEADQUARTERS (40×32)
   The player's own head office, a gift from the city's government for
   lighting the Advanced Fusion Reactor (CompanyHQ, GovernmentSystem).
   Authored at 1600×1280 units (_nKit, 40 a tile) and scaled to the
   footprint. Like the other landmarks the ground is seen from above and
   the buildings in elevation, rising up the sprite.

   From the back: a solar garden and the campus's own switchyard, then
   three glass towers on a shared podium. The middle one steps back three
   times to a lattice crown and a spire, carries the company's bolt emblem
   near the top, and has a pair of plasma rings turning round the spire (the
   stellarator that earned it). Skybridges join the flanking towers to it.
   The podium has the company's name in lights and a ticker. In front: the
   forecourt with the emblem inlaid in a ring fountain, two reflecting
   pools, flags, a plasma arch over the steps, and the boulevard. To the
   sides, the fleet yard and a helipad.

   The towers are the company's dashboard, and every figure on them is the
   live one (_hqStats): the main tower's media wall shows what the grid is
   generating right now, against demand, over the last minute; the west
   tower shows what that generation is made of; the east tower the city it
   serves. The ring round the emblem is a load gauge, and the ticker reads
   the same numbers out.

   Until CompanyHQ has revealed it the whole plot is blacked out: only the
   massing shows, black on black, behind a hoarding.
   ═══════════════════════════════════════════════════════════════════ */

// The towers and podium as plain boxes [x, y, w, h]: what shows under wraps.
const _HQ_MASS = [
  [290, 838, 1020, 122],                                   // podium
  [650, 540, 300, 300], [680, 330, 240, 210], [708, 190, 184, 140],   // main tower
  [340, 520, 200, 320], [362, 420, 156, 100],              // west tower
  [1060, 560, 200, 280], [1082, 470, 156, 90],             // east tower
  [540, 640, 110, 22], [950, 690, 110, 22],                // skybridges
];
const _HQ_CROWN = [[712, 190], [888, 190], [848, 118], [752, 118]];
const _HQ_BOLT  = [[6, -30], [-16, 4], [-2, 4], [-8, 30], [16, -6], [2, -6]];

// What the screens show, gathered at most twice a second however often the
// sprite is drawn. The mix is PowerNetwork's own per-source record of what
// it summed this tick, grouped the way a visitor would read it.
let _hqStat = null, _hqStatAt = -1e9, _hqGroups = null;
function _hqStats() {
  const now = performance.now();
  if (_hqStat && now - _hqStatAt < 500) return _hqStat;
  _hqStatAt = now;
  if (!_hqGroups) {
    const G = { wind: ['WIND', '#8fe0ff'], solar: ['SOLAR', '#ffd84a'], hydro: ['HYDRO', '#4a9cff'], geo: ['GEOTHERMAL', '#ff8a4a'],
                fossil: ['COAL & OIL', '#b09a86'], steam: ['REACTOR STEAM', '#7dffa8'], fusion: ['FUSION DIRECT', '#ff8ae0'], storage: ['STORAGE', '#b8c2d0'] };
    _hqGroups = new Map();
    const put = (g, ...types) => { for (const ty of types) if (ty !== undefined) _hqGroups.set(ty, G[g]); };
    put('wind', T.WIND, T.WIND2, T.WIND3); put('solar', T.SOLAR, T.SOLAR2, T.SOLAR3);
    put('hydro', T.HYDROGENERATOR, T.HYDROTURBINE); put('geo', T.GEOTURBINE);
    put('fossil', T.BIOFUELGEN, T.COALGENERATOR, T.FUELGEN);
    put('steam', T.STEAMTURBINE, T.STEAMTURBINE2); put('fusion', T.MHDRING); put('storage', 'storage');
  }
  const ps = (typeof PowerNetwork !== 'undefined' && PowerNetwork.stats) || {};
  const gen = ps.totalGenerated || 0, con = ps.totalConsumed || 0;
  const sums = new Map();
  let total = 0;
  for (const net of (ps.genSources || [])) {
    if (!net.sources || !net.sources.forEach) continue;
    net.sources.forEach((src, key) => {
      const g = _hqGroups.get(key);
      if (!g || !(src.w > 0)) return;
      sums.set(g, (sums.get(g) || 0) + src.w); total += src.w;
    });
  }
  const mix = [...sums].map(([g, w]) => ({ label: g[0], col: g[1], share: w / total })).sort((a, b) => b.share - a.share).slice(0, 6);
  let pop = 0;
  for (const ty of [T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL]) for (const b of EntityRegistry.getByType(ty)) if (b.fromRequest) pop += (b._population || 0);
  const n = v => Math.round(v).toLocaleString('en-US');
  _hqStat = {
    gen, con, mix, pop,
    load: gen > 0 ? Math.min(1, con / gen) : 0,
    reserve: gen > 0 ? Math.round((gen - con) / gen * 100) : 0,
    hist: (typeof PowerHistory !== 'undefined' && PowerHistory.samples) || [],
    rows: [
      ['POPULATION', n(pop)],
      ['CUSTOMERS LIT', `${n(ps.poweredCount || 0)} / ${n(ps.totalConsumers || 0)}`],
      ['INCOME', `$${n((typeof Economy !== 'undefined' && Economy.income) || 0)}/s`],
      ['APPROVAL', `${typeof GovernmentSystem !== 'undefined' ? GovernmentSystem.getApproval() : 0}%`],
      ['CITY SCORE', typeof CityScore !== 'undefined' ? String(Math.round(CityScore.score || 0)) : '—'],
      ['DAY', n(DayNight.day())],
    ],
  };
  return _hqStat;
}

function renderCompanyHQ(e, px, py, t) {
  const AW = 1600, AH = 1280;
  const W = (e.width || 40) * TILE, H = (e.height || 32) * TILE;
  const v = typeof CompanyHQ !== 'undefined' ? CompanyHQ.visual(e) : { veiled: false, showcase: false };
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(W / (AW * TILE / 40), H / (AH * TILE / 40));
  const K = _nKit(0, 0), { S, X, Y, R, RR, dot, ell, poly, ln, text, glow, person } = K;
  ctx.beginPath(); ctx.rect(0, 0, AW * S, AH * S); ctx.clip();

  // ── Under wraps ──
  if (v.veiled) {
    R(0, 0, AW, AH, '#06080e');
    for (const [x, y, w, h] of _HQ_MASS) R(x, y, w, h, '#000');
    poly(_HQ_CROWN, '#000');
    poly([[796, 118], [804, 118], [801, 30], [799, 30]], '#000');
    ctx.strokeStyle = 'rgba(110,160,220,0.3)'; ctx.lineWidth = 1.5 * S;
    for (const [x, y, w, h] of _HQ_MASS) ctx.strokeRect(X(x), Y(y), w * S, h * S);
    // the hoarding round the plot
    ctx.strokeStyle = 'rgba(255,190,60,0.4)'; ctx.lineWidth = 5 * S; ctx.setLineDash([26 * S, 22 * S]);
    ctx.strokeRect(X(6), Y(6), (AW - 12) * S, (AH - 12) * S);
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }

  // The reveal shows it lit and at its night best whatever the hour, and
  // whether or not the line out to it has been run yet.
  const on = e.powered || v.showcase, hr = DayNight.hour();
  const night = v.showcase || DayNight.darkness() > 0.3;
  const open = on && !night && hr >= 7 && hr < 19;
  const detail = Camera.zoom > 0.3;
  const L = (d, n, o) => on ? (night ? n : d) : o;
  const tt = on ? t : 0;                                    // nothing moves without power
  const CO   = ((typeof CityInfo !== 'undefined' && CityInfo.getCompanyName?.()) || 'Gridworks Power Co.').toUpperCase();
  const CITY = ((typeof CityInfo !== 'undefined' && CityInfo.getCityName?.()) || 'the city').toUpperCase();
  const ACC = '90,220,255', GOLD = '255,206,110';
  // Text shrunk to fit a width (company names run up to 25 letters).
  const fit = (txt, x, y, size, maxW, c, font) => {
    ctx.font = `bold ${Math.max(1, size * S)}px ${font || 'Arial Black, Arial, sans-serif'}`;
    const w = ctx.measureText(txt).width / S;
    text(txt, x, y, w > maxW ? size * maxW / w : size, c, font);
  };

  const st = _hqStats();
  const MONO = 'Courier New, monospace';
  // An LED wall set into a tower's face: dark by itself, the caller draws on it.
  const screen = (x, y, w, h) => {
    RR(x - 4, y - 4, w + 8, h + 8, 4, on ? (night ? '#0c1a2a' : '#2c4a66') : '#17191c');
    R(x, y, w, h, on ? '#03070d' : '#0c0d0f');
    if (!on) return;
    ctx.strokeStyle = `rgba(${ACC},${night ? 0.9 : 0.6})`; ctx.lineWidth = 1.4 * S; ctx.strokeRect(X(x), Y(y), w * S, h * S);
    if (night) glow(x + w / 2, y + h / 2, Math.max(w, h) * 0.9, ACC, 0.13);
  };

  const LAWN = L('#5a9246', '#1a2a1c', '#171f17'), LAWN_D = L('#4a8438', '#162416', '#131a13');
  const PAVE = L('#d8d4ca', '#5e5c58', '#2a2927'), PAVE_D = L('#bfbaae', '#4a4844', '#222120');
  const GRAN = L('#8f949c', '#3a3e46', '#232427');
  const ROAD = L('#4a4c50', '#1e2024', '#141517');
  const STEEL = L('#aab2bc', '#565e6a', '#303338'), STEEL_D = L('#7c8692', '#3e4650', '#242629');
  const ROOF_T = L('#c4c8ce', '#5a606a', '#2a2c30');
  const WATER = L('#4a94bc', '#0e2236', '#141c22');
  const SHADOW = 'rgba(0,0,0,0.24)';
  const tree = (x, y, r) => {
    ell(x + r * 0.35, y + r * 0.45, r, r * 0.55, 'rgba(0,0,0,0.25)');
    dot(x, y, r, L('#2e6a2a', '#142414', '#101a0e')); dot(x - r * 0.28, y - r * 0.28, r * 0.55, L('#3e8a36', '#1c3220', '#141c10'));
  };
  const lamp = (x, y) => {
    ln(x, y, x, y - 14, L('#3a3a38', '#222220', '#141412'), 1.6);
    dot(x, y - 15, 3, on && night ? '#fff0c0' : L('#e8e4d8', '#6a665c', '#2a2824'));
    if (on && night) glow(x, y - 15, 30, '255,236,190', 0.4);
  };

  // ── Grounds ──
  R(0, 0, AW, AH, LAWN);
  if (detail) for (let x = 0; x < AW; x += 28) R(x, 0, 14, AH, L('rgba(255,255,255,0.03)', 'rgba(255,255,255,0.01)', 'rgba(0,0,0,0)'));
  R(0, 24, AW, 30, ROAD);                                                                   // service road behind
  R(0, 1186, AW, 52, ROAD);                                                                 // the boulevard
  R(0, 1210.5, AW, 3, L('rgba(240,200,80,0.8)', 'rgba(240,200,80,0.35)', 'rgba(90,80,50,0.4)'));
  if (detail) for (let x = 12; x < AW; x += 40) { R(x, 1198, 20, 2, L('rgba(255,255,255,0.75)', 'rgba(255,255,255,0.3)', 'rgba(100,100,100,0.4)')); R(x, 1224, 20, 2, L('rgba(255,255,255,0.75)', 'rgba(255,255,255,0.3)', 'rgba(100,100,100,0.4)')); }
  R(0, 1238, AW, 42, PAVE);                                                                 // outer pavement
  if (detail) for (let x = 0; x < AW; x += 32) R(x, 1238, 1, 42, 'rgba(0,0,0,0.07)');
  // side drives from the boulevard round to the service road
  for (const dx of [176, 1392]) { R(dx, 54, 32, 1132, ROAD); if (detail) for (let y = 70; y < 1180; y += 36) R(dx + 15, y, 2, 16, L('rgba(255,255,255,0.6)', 'rgba(255,255,255,0.25)', 'rgba(100,100,100,0.3)')); }

  // ── Solar garden (back left) ──
  R(232, 76, 420, 300, LAWN_D);
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
    const x = 246 + c * 67, y = 90 + r * 47;
    R(x + 3, y + 5, 56, 30, 'rgba(0,0,0,0.22)');
    R(x, y, 56, 30, L('#1e3f7a', '#0e1c36', '#15171c'));
    if (detail) { R(x, y + 14.5, 56, 1, L('#8ab0e0', '#2a4470', '#26282e')); for (let k = 1; k < 4; k++) R(x + k * 14, y, 1, 30, L('#8ab0e0', '#2a4470', '#26282e')); }
    if (on && !night) poly([[x + 6, y], [x + 22, y], [x + 8, y + 30], [x, y + 30], [x, y + 12]], 'rgba(255,255,255,0.10)');
  }

  // ── The campus's own switchyard (back right) ──
  R(948, 76, 420, 300, L('#9a968c', '#3c3a36', '#24231f'));                               // gravel
  ctx.strokeStyle = L('#5a5e64', '#2c3036', '#1c1d20'); ctx.lineWidth = 2 * S; ctx.strokeRect(X(952), Y(80), 412 * S, 292 * S);
  for (let k = 0; k < 3; k++) {
    const x = 990 + k * 128, y = 240;
    R(x + 5, y + 7, 84, 70, SHADOW);
    RR(x, y, 84, 70, 4, STEEL_D); RR(x + 6, y + 6, 72, 46, 3, STEEL);
    for (let f = 0; f < 7; f++) R(x + 8 + f * 10, y + 54, 6, 14, L('#646e7a', '#343a44', '#1e2023'));   // radiator fins
    for (let b = 0; b < 3; b++) { dot(x + 20 + b * 22, y + 20, 5, L('#d8d2c2', '#6a665c', '#33312c')); dot(x + 20 + b * 22, y + 20, 2.4, L('#7a5a3a', '#3c2c1c', '#1c1610')); }
    if (on) dot(x + 74, y + 60, 2.4, Math.sin(tt * 3 + k) > 0 ? '#60ff90' : '#1c6a34');
    if (on && night) glow(x + 42, y + 30, 70, ACC, 0.12);
  }
  for (const gy of [112, 176]) {                                                           // bus gantries
    ln(972, gy, 1344, gy, STEEL_D, 3);
    for (let k = 0; k < 7; k++) { const x = 980 + k * 60; ln(x, gy - 14, x, gy + 22, STEEL, 2.4); dot(x, gy, 3.4, L('#d8d2c2', '#6a665c', '#33312c')); }
    if (detail) for (let k = 0; k < 3; k++) ln(972, gy - 8 + k * 8, 1344, gy - 8 + k * 8, L('rgba(40,40,40,0.5)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.4)'), 0.8);
  }
  if (on && detail) for (let k = 0; k < 3; k++) {                                          // corona on the bus
    const u = (tt * 0.7 + k * 0.37) % 1;
    dot(980 + u * 360, 112 + (k % 2) * 64, 1.8, `rgba(${ACC},${(0.9 * Math.sin(u * Math.PI)).toFixed(3)})`);
  }

  // ── Tree belts and the garden walk between the two yards ──
  R(676, 76, 248, 300, LAWN_D);
  R(790, 76, 20, 300, PAVE_D);
  for (let y = 100; y <= 360; y += 44) { tree(730, y, 15); tree(870, y, 15); }
  for (let y = 90; y <= 1160; y += 52) { tree(60, y, 17); tree(124, y + 26, 15); tree(1476, y + 26, 15); tree(1540, y, 17); }
  for (let x = 250; x <= 1350; x += 58) if (x < 640 || x > 960) tree(x, 410 + (x % 3) * 4, 13);

  // ── Fleet yard (west) ──
  R(232, 596, 92, 300, L('#5a5c60', '#26282c', '#18191b'));
  if (detail) for (let k = 0; k <= 6; k++) R(236, 606 + k * 46, 84, 1.4, L('rgba(255,255,255,0.6)', 'rgba(255,255,255,0.25)', 'rgba(100,100,100,0.3)'));
  for (let k = 0; k < 6; k++) {
    if (k === 2 && open) continue;                                                         // one out on a call by day
    const y = 612 + k * 46;
    RR(246, y + 3, 66, 34, 4, SHADOW);
    RR(244, y, 66, 34, 4, L('#f0b820', '#7a5c14', '#33291a'));                              // a bucket truck, from above
    R(292, y + 4, 14, 26, L('#1e2a36', '#0c1218', '#101214'));                             // cab glass
    R(250, y + 13, 36, 8, L('#e8e8e4', '#6a6a66', '#2c2c2a'));                             // boom
    dot(252, y + 17, 6, L('#e8e8e4', '#6a6a66', '#2c2c2a'));
  }

  // ── Helipad (east) ──
  R(1276, 596, 92, 300, L('#5a5c60', '#26282c', '#18191b'));
  {
    const hx = 1322, hy = 690;
    dot(hx, hy, 40, L('#3e4044', '#1a1c20', '#131416'));
    ctx.strokeStyle = L('#f0d040', '#7a6a20', '#33301a'); ctx.lineWidth = 3 * S;
    ctx.beginPath(); ctx.arc(X(hx), Y(hy), 34 * S, 0, 6.283); ctx.stroke();
    text('H', hx, hy + 1, 34, L('rgba(255,255,255,0.85)', 'rgba(255,255,255,0.35)', 'rgba(120,120,120,0.4)'));
    if (on && night) for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; dot(hx + Math.cos(a) * 40, hy + Math.sin(a) * 40, 1.8, Math.floor(tt * 2 + k) % 2 ? '#60ff90' : '#1c6a34'); }
    // the company helicopter
    ell(hx + 6, hy + 8, 22, 9, 'rgba(0,0,0,0.3)');
    ell(hx, hy, 17, 8, L('#f4f4f0', '#8a8a86', '#3a3a38'));
    R(hx + 12, hy - 1.5, 26, 3, L('#f4f4f0', '#8a8a86', '#3a3a38'));
    R(hx - 12, hy - 2.5, 24, 5, `rgba(${GOLD},${on ? 0.95 : 0.3})`);
    ell(hx - 10, hy, 5, 5, L('#1e2a36', '#0c1218', '#101214'));
    if (on) { ell(hx, hy, 34, 34, 'rgba(220,230,240,0.10)'); const a = tt * 22; ln(hx - Math.cos(a) * 34, hy - Math.sin(a) * 34, hx + Math.cos(a) * 34, hy + Math.sin(a) * 34, 'rgba(40,44,50,0.55)', 2); }
    else ln(hx - 30, hy - 14, hx + 30, hy + 14, '#26282c', 2);
    // a hangar behind the pad
    R(1284, 778, 80, 8, ROOF_T); R(1284, 786, 80, 96, STEEL); R(1292, 812, 64, 70, L('#3a4450', '#161c24', '#1a1c1f'));
    if (detail) for (let k = 0; k < 7; k++) R(1292, 818 + k * 9, 64, 1, 'rgba(0,0,0,0.25)');
  }

  // ── Forecourt ──
  R(232, 960, 1136, 226, PAVE);
  if (detail) { for (let x = 232; x < 1368; x += 36) R(x, 960, 1, 226, 'rgba(0,0,0,0.06)'); for (let y = 960; y < 1186; y += 36) R(232, y, 1136, 1, 'rgba(0,0,0,0.06)'); }
  R(700, 960, 200, 226, GRAN);                                                             // the carpet of dark granite up to the doors
  // reflecting pools, with the towers standing in them
  for (const [x0, cx] of [[262, 440], [1018, 1160]]) {
    R(x0 - 8, 1012, 336, 126, PAVE_D);
    R(x0, 1020, 320, 110, WATER);
    if (on) for (let k = 0; k < 3; k++) R(cx - 46 + k * 34, 1024, 24, 102, night ? `rgba(${GOLD},${0.16 - k * 0.03})` : `rgba(255,255,255,${0.16 - k * 0.03})`);   // the tower above, standing in it
    if (detail) for (let k = 0; k < 6; k++) {
      const y = 1030 + k * 17 + Math.sin(tt * 0.8 + k) * 2;
      ln(x0 + 12 + (k % 2) * 24, y, x0 + 300 - (k % 3) * 22, y, L('rgba(255,255,255,0.3)', 'rgba(255,225,170,0.14)', 'rgba(0,0,0,0)'), 0.9);
    }
    // a row of jets down the middle, dancing in a wave, lit from below at night
    if (on) for (let j = 0; j < 9; j++) {
      const jx = x0 + 32 + j * 32, hgt = 10 + 9 * Math.sin(tt * 1.6 + j * 0.7);
      if (night) glow(jx, 1076, 20, j % 2 ? ACC : GOLD, 0.5);
      ell(jx, 1077, 7, 2.6, 'rgba(255,255,255,0.3)');
      poly([[jx - 2.2, 1076], [jx + 2.2, 1076], [jx + 0.6, 1076 - hgt], [jx - 0.6, 1076 - hgt]], 'rgba(235,248,255,0.8)');
      for (let d = 0; d < 3; d++) { const u = (tt * 1.3 + d / 3 + j * 0.21) % 1; dot(jx + (d - 1) * 5 * u, 1076 - hgt + u * u * hgt, 1.2, `rgba(230,246,255,${(0.8 * (1 - u)).toFixed(3)})`); }
    }
  }
  // light set into the paving: strips either side of the granite, chasing toward the doors
  for (const sx of [694, 906]) {
    R(sx - 1.5, 984, 3, 200, L('#5a6470', '#1c2630', '#1a1b1e'));
    if (on) for (let k = 0; k < 5; k++) {
      const u = (tt * 0.35 + k / 5) % 1, y = 1184 - u * 200;
      R(sx - 1.5, y - 14, 3, 14, `rgba(${ACC},${(0.95 * Math.sin(u * Math.PI)).toFixed(3)})`);
      if (night) glow(sx, y - 7, 14, ACC, 0.45 * Math.sin(u * Math.PI));
    }
  }
  // flower beds in the company's colours, between the flags
  if (detail) for (let b = 0; b < 10; b++) {
    const bx = 290 + b * 96 + (b > 4 ? 44 : 0);
    if (b === 4 || b === 5) continue;
    RR(bx, 1156, 56, 14, 5, L('#3a7a30', '#162616', '#141a14'));
    for (let k = 0; k < 7; k++) dot(bx + 6 + k * 7.4, 1163 + (k % 2 ? 2 : -2), 2.6, (b + k) % 2 ? L('#ffd040', '#7a6420', '#2e2a1a') : L('#40c8f0', '#1c5870', '#1a262a'));
  }
  // the ring fountain and the emblem inlaid in it
  {
    const fx = 800, fy = 1078;
    dot(fx, fy, 96, PAVE_D); dot(fx, fy, 90, WATER); dot(fx, fy, 66, GRAN);
    dot(fx, fy, 58, L('#2a2e36', '#14161c', '#18191c'));
    ctx.strokeStyle = `rgba(${GOLD},${on ? (night ? 1 : 0.85) : 0.25})`; ctx.lineWidth = 5 * S;
    ctx.beginPath(); ctx.arc(X(fx), Y(fy), 48 * S, 0, 6.283); ctx.stroke();
    poly(_HQ_BOLT.map(([x, y]) => [fx + x * 1.25, fy + y * 1.25]), `rgba(${GOLD},${on ? 1 : 0.3})`);
    if (on && night) glow(fx, fy, 120, GOLD, 0.28);
    if (on) for (let d = 0; d < 20; d++) {                                                  // jets, arcing inward
      const a = d / 20 * 6.283, u = (tt * 0.9 + d * 0.13) % 1, r = 86 - u * 16;
      dot(fx + Math.cos(a) * r, fy + Math.sin(a) * r - Math.sin(u * Math.PI) * 9, 1.7, `rgba(225,245,255,${(0.85 * (1 - u * 0.6)).toFixed(3)})`);
    }
  }
  for (const [x, y] of [[250, 984], [650, 984], [950, 984], [1350, 984], [250, 1164], [650, 1164], [950, 1164], [1350, 1164]]) lamp(x, y);
  for (const x of [640, 960]) for (let y = 1030; y <= 1150; y += 40) tree(x, y, 12);
  // flags along the boulevard: the company's colours
  for (let f = 0; f < 12; f++) {
    const fx = 262 + f * 96 + (f > 5 ? 20 : 0);
    if (f === 5 || f === 6) continue;
    dot(fx, 1178, 2.4, STEEL_D);
    ln(fx, 1178, fx, 1134, L('#e0e0dc', '#8a8a86', '#3a3a38'), 1.6);
    const pts = [];
    for (let k = 0; k <= 5; k++) pts.push([fx + k * 4.4, 1135 + Math.sin(tt * 4 + k * 0.8 + f) * 1.6 * (k / 5)]);
    for (let k = 5; k >= 0; k--) pts.push([fx + k * 4.4, 1149 + Math.sin(tt * 4 + k * 0.8 + f) * 1.6 * (k / 5)]);
    poly(pts, f % 2 ? L('#f0c040', '#8a6c20', '#3a3220') : L('#1e6a9a', '#123a56', '#1c262c'));
  }
  if (open) for (let p = 0; p < 22; p++) {                                                  // staff and visitors
    const u = (t * (0.008 + _cmFrac(p) * 0.012) + _cmFrac(p * 5)) % 1;
    const vx = 250 + (p % 2 ? u : 1 - u) * 1100, vy = 968 + _cmFrac(p * 9) * 36 + (p % 3 === 0 ? 172 : 0);
    person(vx, vy, _N_SHIRT[p % 8], _N_SKIN[p % 6], Math.abs(Math.sin(t * 6 + p)) * 0.3, 1.7);
  }

  // ── Shadows the towers throw on the ground (sun from the upper left) ──
  // Every stage drops one down its right-hand side, onto the lawn and the
  // yards beside it, and the podium one across the forecourt. All one path,
  // filled once, so where two overlap the ground is no darker.
  {
    const D = 38;                                                                           // how far a shadow reaches
    ctx.fillStyle = on && night ? 'rgba(0,0,0,0.42)' : 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    const quad = pts => { pts.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.closePath(); };
    for (const [x, y, w, h] of _HQ_MASS) quad([[x + w, y], [x + w + D, y + D * 0.8], [x + w + D, y + h + D * 0.8], [x + w, y + h]]);
    quad([[888, 190], [848, 118], [848 + D, 118 + D * 0.8], [888 + D, 190 + D * 0.8]]);                // the crown
    quad([[801, 30], [801 + D, 30 + D * 0.8], [805 + D, 118 + D * 0.8], [805, 118]]);                  // the spire
    quad([[290, 960], [1310, 960], [1310 + D, 960 + D * 0.8], [290 + D, 960 + D * 0.8]]);              // the podium, on the forecourt
    ctx.fill();
  }

  // ── Glass ──
  const GL = on ? (night ? ['#1c3050', '#10203a', '#091626'] : ['#a8d8f2', '#62a2cc', '#2f6690']) : ['#26292e', '#1c1e22', '#141518'];
  const MULL = L('rgba(16,46,76,0.34)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.4)');
  const FH = 11;                                                                            // a storey
  const seg = (cx, y0, y1, hw, id, grid) => {
    const g = ctx.createLinearGradient(X(cx - hw), 0, X(cx + hw), 0);
    g.addColorStop(0, GL[0]); g.addColorStop(0.42, GL[1]); g.addColorStop(1, GL[2]);
    ctx.fillStyle = g; ctx.fillRect(X(cx - hw), Y(y0), 2 * hw * S, (y1 - y0) * S);
    if (on && !night) {                                                                     // the sky in it
      const h = y1 - y0;
      poly([[cx - hw, y0 + h * 0.20], [cx - hw * 0.25, y0], [cx + hw * 0.15, y0], [cx - hw, y0 + h * 0.46]], 'rgba(255,255,255,0.13)');
      poly([[cx - hw, y0 + h * 0.62], [cx + hw * 0.7, y0], [cx + hw, y0], [cx + hw, y0 + h * 0.06], [cx - hw, y0 + h * 0.82]], 'rgba(255,255,255,0.07)');
    }
    if (detail) {
      for (let y = y0 + FH; y < y1; y += FH) R(cx - hw, y, 2 * hw, 1, MULL);
      for (let x = cx - hw + 12; x < cx + hw - 2; x += 12) R(x, y0, 0.8, y1 - y0, MULL);
    }
    if (on && night) {                                                                      // floors working late, in runs
      const n = detail ? 3 : 1;
      let f = 0;
      for (let y = y0 + 2.5; y < y1 - FH + 3; y += FH, f++) for (let k = 0; k < n; k++) {
        const h1 = _cmFrac(id * 31 + f * 7 + k * 13.7), h2 = _cmFrac(id * 17 + f * 3.3 + k * 29 + 5);
        if (h1 < 0.2) continue;
        const x = cx - hw + 3 + h2 * (2 * hw - 16), w = Math.min(cx + hw - 3 - x, 10 + h1 * hw * 0.8);
        R(x, y, w, FH - 4, h1 > 0.82 ? 'rgba(175,228,255,0.9)' : h1 > 0.5 ? 'rgba(255,220,150,0.9)' : 'rgba(255,200,120,0.62)');
      }
    }
    if (grid) {                                                                             // the diagrid: one path of crossing braces
      const h = y1 - y0, step = 2 * hw / grid;
      ctx.save(); ctx.beginPath(); ctx.rect(X(cx - hw), Y(y0), 2 * hw * S, h * S); ctx.clip();
      ctx.strokeStyle = on ? (night ? `rgba(${GOLD},0.34)` : 'rgba(255,255,255,0.42)') : 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2 * S;
      ctx.beginPath();
      for (let x = cx - hw - h; x <= cx + hw; x += step) { ctx.moveTo(X(x), Y(y1)); ctx.lineTo(X(x + h), Y(y0)); ctx.moveTo(X(x + h), Y(y1)); ctx.lineTo(X(x), Y(y0)); }
      ctx.stroke(); ctx.restore();
    }
    R(cx - hw - 3, y0, 3, y1 - y0, STEEL); R(cx + hw, y0, 3, y1 - y0, STEEL_D);          // corner fins
    if (on) { R(cx - hw - 1, y0, 1.6, y1 - y0, `rgba(${ACC},${night ? 0.95 : 0.4})`); R(cx + hw - 0.6, y0, 1.6, y1 - y0, `rgba(${ACC},${night ? 0.8 : 0.3})`); }
  };
  // A setback: the roof of the storey below, seen from above, with its rail.
  const ledge = (cx, y, hw, garden) => {
    R(cx - hw - 5, y - 7, 2 * hw + 10, 9, ROOF_T);
    R(cx - hw - 5, y + 2, 2 * hw + 10, 2, STEEL_D);
    if (garden && detail) for (let x = cx - hw + 6; x < cx + hw - 4; x += 16) dot(x, y - 3, 3.4, L('#3e8a36', '#1c3220', '#141c10'));
    if (on && night) R(cx - hw - 5, y - 8, 2 * hw + 10, 1.2, `rgba(${ACC},0.8)`);
  };
  const beacon = (x, y, ph) => {
    const b = on && Math.sin(t * 2.4 + ph) > 0.5;
    dot(x, y, 2.4, b ? '#ff4040' : L('#7a2020', '#4a1414', '#2a1010'));
    if (b) glow(x, y, 26, '255,60,60', night ? 0.7 : 0.35);
  };
  // A pulse of light climbing an edge.
  const riser = (x, y0, y1, ph, rgb) => {
    if (!on) return;
    const u = (tt * 0.28 + ph) % 1, y = y1 - (y1 - y0) * u;
    R(x - 1.2, y, 2.4, Math.min(34, y1 - y), `rgba(${rgb},${(0.95 * Math.sin(u * Math.PI)).toFixed(3)})`);
    if (night) glow(x, y, 16, rgb, 0.5 * Math.sin(u * Math.PI));
  };

  // floodlights behind everything, sweeping up from the podium roof
  if (on && night) for (const [bx, ph] of [[330, 0], [1270, 2.1], [560, 4.0], [1040, 5.3]]) {
    const a = -Math.PI / 2 + Math.sin(tt * 0.35 + ph) * 0.5, len = 780;
    poly([[bx, 838], [bx + Math.cos(a - 0.045) * len, 838 + Math.sin(a - 0.045) * len], [bx + Math.cos(a + 0.045) * len, 838 + Math.sin(a + 0.045) * len]], 'rgba(170,225,255,0.07)');
  }
  if (on && night) { glow(800, 300, 420, ACC, 0.16); glow(800, 150, 190, GOLD, 0.22); }

  // ── West and east towers ──
  seg(440, 520, 840, 100, 1); seg(440, 420, 520, 78, 2);
  ledge(440, 520, 100, true);
  R(362, 412, 156, 9, ROOF_T);
  if (detail) for (let x = 372; x < 512; x += 14) dot(x, 414, 4.4, L('#3e8a36', '#1c3220', '#141c10'));   // roof garden
  seg(1160, 560, 840, 100, 3); seg(1160, 470, 560, 78, 4);
  ledge(1160, 560, 100, false);
  R(1082, 462, 156, 9, ROOF_T);
  ln(1130, 462, 1130, 418, STEEL, 2); ln(1150, 462, 1150, 434, STEEL, 1.6); ln(1196, 462, 1196, 428, STEEL, 1.6);   // masts
  ell(1196, 440, 12, 7, STEEL); dot(1196, 440, 2.4, STEEL_D);
  beacon(1130, 416, 1.3); beacon(440, 410, 2.6);
  riser(340, 520, 840, 0.0, ACC); riser(540, 520, 840, 0.5, ACC); riser(1060, 560, 840, 0.25, ACC); riser(1260, 560, 840, 0.75, ACC);

  // West tower's wall: what the grid's power is made of, right now.
  {
    const x0 = 356, y0 = 556, w = 168, h = 262;
    screen(x0, y0, w, h);
    if (on) {
      text('GENERATION MIX', x0 + w / 2, y0 + 14, 10, `rgba(${ACC},0.95)`, MONO);
      R(x0 + 8, y0 + 24, w - 16, 1, `rgba(${ACC},0.4)`);
      if (!st.mix.length) text('NO GENERATION', x0 + w / 2, y0 + h / 2, 11, '#ff7a6a', MONO);
      // the whole mix as one stacked bar, then a row a source
      let bx = x0 + 8;
      for (const m of st.mix) { const bw = (w - 16) * m.share; R(bx, y0 + 31, Math.max(0.5, bw - 1), 12, m.col); bx += bw; }
      st.mix.forEach((m, i) => {
        const y = y0 + 64 + i * 33;
        R(x0 + 8, y + 9, w - 16, 5, 'rgba(255,255,255,0.09)');
        R(x0 + 8, y + 9, (w - 16) * m.share, 5, m.col);
        if (!detail) return;
        R(x0 + 8, y - 5, 7, 7, m.col);
        text(m.label, x0 + 20, y - 1, 8.5, '#e4edf6', MONO, 'left');
        text(`${Math.round(m.share * 100)}%`, x0 + w - 8, y - 1, 10, m.col, MONO, 'right');
      });
    }
  }
  // East tower's wall: the city it all goes to.
  {
    const x0 = 1076, y0 = 596, w = 168, h = 222;
    screen(x0, y0, w, h);
    if (on) {
      text(CITY, x0 + w / 2, y0 + 14, 10, `rgba(${ACC},0.95)`, MONO);
      R(x0 + 8, y0 + 24, w - 16, 1, `rgba(${ACC},0.4)`);
      st.rows.forEach(([k, val], i) => {
        const y = y0 + 44 + i * 31;
        if (detail) text(k, x0 + 10, y - 8, 7, 'rgba(160,200,230,0.85)', MONO, 'left');
        fit(val, x0 + w / 2, y + 6, 15, w - 20, i === 2 ? '#7dffa8' : '#ffe9a8');
        if (i < 5) R(x0 + 8, y + 17, w - 16, 0.6, 'rgba(255,255,255,0.1)');
      });
    }
  }

  // ── Skybridges ──
  for (const [x, y] of [[540, 640], [950, 690]]) {
    R(x, y + 22, 110, 4, SHADOW);
    R(x, y, 110, 22, on ? (night ? '#15263c' : '#7ab4d8') : '#1c1e22');
    R(x, y, 110, 3, STEEL); R(x, y + 19, 110, 3, STEEL_D);
    if (detail) for (let k = 1; k < 9; k++) R(x + k * 12.2, y + 3, 0.8, 16, MULL);
    if (on && night) { R(x + 2, y + 7, 106, 8, 'rgba(255,220,150,0.85)'); glow(x + 55, y + 11, 60, GOLD, 0.2); }
    if (on) { const u = (tt * 0.12 + x * 0.01) % 1; person(x + 8 + (u < 0.5 ? u * 2 : 2 - u * 2) * 94, y + 17, _N_SHIRT[x % 8], _N_SKIN[x % 6], 0, 1.3); }
  }

  // ── The main tower ──
  seg(800, 540, 840, 150, 5, 5); seg(800, 330, 512, 120, 6, 4); seg(800, 190, 304, 92, 7, 3);
  // Each setback is a sloped glass atrium rather than a flat roof, lit from inside.
  for (const [yb, hb, yt, ht] of [[540, 150, 512, 120], [330, 120, 304, 92]]) {
    const g = ctx.createLinearGradient(0, Y(yt), 0, Y(yb));
    g.addColorStop(0, on ? (night ? '#ffe2a0' : '#e8f6ff') : '#2a2c30'); g.addColorStop(1, on ? (night ? '#b8823a' : '#8cc4e8') : '#1c1e22');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(X(800 - hb - 3), Y(yb)); ctx.lineTo(X(800 + hb + 3), Y(yb)); ctx.lineTo(X(800 + ht), Y(yt)); ctx.lineTo(X(800 - ht), Y(yt)); ctx.closePath(); ctx.fill();
    for (let k = 0; k <= 10; k++) { const u = k / 10; ln(800 - hb + u * 2 * hb, yb, 800 - ht + u * 2 * ht, yt, STEEL_D, 0.9); }
    R(800 - hb - 5, yb - 1.5, 2 * hb + 10, 3, STEEL); R(800 - ht - 2, yt - 1.5, 2 * ht + 4, 2.5, STEEL);
    if (on && night) glow(800, (yb + yt) / 2, hb * 1.2, GOLD, 0.22);
  }
  // the sky lobby: a double-height floor lit right across
  R(680, 414, 240, 20, on ? (night ? 'rgba(255,226,160,0.92)' : 'rgba(235,248,255,0.5)') : 'rgba(0,0,0,0.25)');
  R(680, 412, 240, 2, STEEL); R(680, 434, 240, 2, STEEL);
  if (detail && on) for (let p = 0; p < 7; p++) person(696 + p * 34 + Math.sin(tt * 0.5 + p * 2) * 8, 433, _N_SHIRT[(p + 2) % 8], _N_SKIN[p % 6], 0, 1.2);
  if (on && night) glow(800, 424, 170, GOLD, 0.2);
  // the spine: a strip of brighter glass up the middle of the upper stages, with the lifts in it
  for (const [y0, y1] of [[196, 300], [336, 410], [438, 508]]) {
    R(786, y0, 28, y1 - y0, on ? (night ? 'rgba(120,220,255,0.16)' : 'rgba(255,255,255,0.18)') : 'rgba(0,0,0,0.2)');
    R(786, y0, 1.2, y1 - y0, STEEL); R(812.8, y0, 1.2, y1 - y0, STEEL);
  }
  if (on) for (let k = 0; k < 2; k++) {
    const u = 0.5 + 0.5 * Math.sin(tt * (0.22 + k * 0.07) + k * 2.4), y = 496 - u * 150;
    RR(789 + k * 13, y, 9, 12, 2, night ? '#fff4d0' : '#f4f8fc');
    if (night) glow(793.5 + k * 13, y + 6, 18, '255,240,200', 0.55);
  }
  // light fins up the faces
  if (on) for (const [fx, y0, y1] of [[725, 546, 600], [875, 546, 600], [740, 336, 410], [860, 336, 410], [754, 196, 300], [846, 196, 300]]) {
    R(fx - 1, y0, 2, y1 - y0, `rgba(${GOLD},${night ? 0.85 : 0.4})`);
  }

  // ── The media wall: what the company is generating, live ──
  {
    const x0 = 668, y0 = 600, w = 264, h = 214, cx = 800;
    screen(x0, y0, w, h);
    if (on) {
      const blink = Math.sin(t * 5) > 0;
      dot(x0 + 14, y0 + 15, 3.2, blink ? '#ff4a4a' : '#5a1c1c');
      text('LIVE', x0 + 22, y0 + 15.5, 9, '#ff8a8a', MONO, 'left');
      text('GRID OUTPUT', x0 + w - 10, y0 + 15.5, 9, `rgba(${ACC},0.95)`, MONO, 'right');
      R(x0 + 8, y0 + 26, w - 16, 1, `rgba(${ACC},0.4)`);
      // the number
      if (night) glow(cx, y0 + 62, 150, GOLD, 0.22);
      fit(formatPower(st.gen), cx, y0 + 62, 50, w - 30, '#fff1c4');
      fit(`DEMAND ${formatPower(st.con)}   RESERVE ${st.reserve >= 0 ? '+' : ''}${st.reserve}%`, cx, y0 + 100, 9.5, w - 24, st.reserve < 5 ? '#ff8a6a' : '#9fe8ff', MONO);
      // the load bar: how much of that is spoken for
      R(x0 + 12, y0 + 112, w - 24, 7, 'rgba(255,255,255,0.1)');
      R(x0 + 12, y0 + 112, (w - 24) * st.load, 7, st.load > 0.95 ? '#ff6a4a' : st.load > 0.8 ? '#ffc04a' : '#5ae0a0');
      // the last minute: generation filled in gold, demand a line over it
      const gx = x0 + 12, gy = y0 + 130, gw = w - 24, gh = h - 142, H0 = st.hist, n = H0.length;
      if (detail) for (let k = 1; k < 4; k++) R(gx, gy + gh * k / 4, gw, 0.6, 'rgba(255,255,255,0.08)');
      if (n > 1) {
        let top = 1;
        for (const smp of H0) top = Math.max(top, smp.gen, smp.con);
        top *= 1.12;
        const px2 = i => gx + gw * i / (n - 1), py2 = val => gy + gh * (1 - val / top);
        ctx.beginPath(); ctx.moveTo(X(gx), Y(gy + gh));
        H0.forEach((smp, i) => ctx.lineTo(X(px2(i)), Y(py2(smp.gen))));
        ctx.lineTo(X(gx + gw), Y(gy + gh)); ctx.closePath();
        const gr = ctx.createLinearGradient(0, Y(gy), 0, Y(gy + gh));
        gr.addColorStop(0, `rgba(${GOLD},0.75)`); gr.addColorStop(1, `rgba(${GOLD},0.08)`);
        ctx.fillStyle = gr; ctx.fill();
        ctx.strokeStyle = '#fff1c4'; ctx.lineWidth = 1.6 * S; ctx.beginPath();
        H0.forEach((smp, i) => i ? ctx.lineTo(X(px2(i)), Y(py2(smp.gen))) : ctx.moveTo(X(px2(i)), Y(py2(smp.gen)))); ctx.stroke();
        ctx.strokeStyle = `rgba(${ACC},0.95)`; ctx.lineWidth = 1.4 * S; ctx.beginPath();
        H0.forEach((smp, i) => i ? ctx.lineTo(X(px2(i)), Y(py2(smp.con))) : ctx.moveTo(X(px2(i)), Y(py2(smp.con)))); ctx.stroke();
        dot(gx + gw, py2(H0[n - 1].gen), 2.6, '#ffffff');
      }
      R(gx, gy + gh, gw, 1, `rgba(${ACC},0.5)`);
      // a slow sheen crossing the glass over it
      const sh = (tt * 0.12) % 1.6 - 0.3;
      if (sh > -0.2 && sh < 1.1) { ctx.save(); ctx.beginPath(); ctx.rect(X(x0), Y(y0), w * S, h * S); ctx.clip(); poly([[x0 + w * sh, y0], [x0 + w * sh + 26, y0], [x0 + w * sh - 34, y0 + h], [x0 + w * sh - 60, y0 + h]], 'rgba(255,255,255,0.05)'); ctx.restore(); }
    }
  }
  riser(650, 540, 840, 0.1, GOLD); riser(950, 540, 840, 0.6, GOLD);
  riser(680, 330, 512, 0.35, GOLD); riser(920, 330, 512, 0.85, GOLD);
  riser(708, 190, 304, 0.2, GOLD); riser(892, 190, 304, 0.7, GOLD);
  // the emblem, high on the face
  {
    const ex = 800, ey = 258;
    if (on && night) glow(ex, ey, 110, GOLD, 0.42);
    dot(ex, ey, 46, L('#16324e', '#0a1626', '#151619'));
    ctx.strokeStyle = `rgba(${GOLD},${on ? 1 : 0.25})`; ctx.lineWidth = 4.5 * S;
    ctx.beginPath(); ctx.arc(X(ex), Y(ey), 40 * S, 0, 6.283); ctx.stroke();
    if (on) {                                                                               // the ring round it is the load gauge
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 3 * S; ctx.beginPath(); ctx.arc(X(ex), Y(ey), 47 * S, 0, 6.283); ctx.stroke();
      ctx.strokeStyle = st.load > 0.95 ? '#ff6a4a' : `rgba(${ACC},0.95)`; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(X(ex), Y(ey), 47 * S, -Math.PI / 2, -Math.PI / 2 + 6.283 * Math.max(0.02, st.load)); ctx.stroke(); ctx.lineCap = 'butt';
      const a = tt * 0.9; dot(ex + Math.cos(a) * 47, ey + Math.sin(a) * 47, 2.2, '#ffffff');
    }
    poly(_HQ_BOLT.map(([x, y]) => [ex + x, ey + y]), on ? '#ffe9a8' : '#4a4436');
  }
  // the crown: a lattice of glass and gold, lit from inside
  {
    const g = ctx.createLinearGradient(X(712), 0, X(888), 0);
    g.addColorStop(0, GL[0]); g.addColorStop(0.42, on && night ? '#2a4a70' : GL[1]); g.addColorStop(1, GL[2]);
    ctx.fillStyle = g; ctx.beginPath(); _HQ_CROWN.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.closePath(); ctx.fill();
    const gc = `rgba(${GOLD},${on ? (night ? 0.95 : 0.7) : 0.2})`;
    for (let k = 0; k <= 8; k++) { const u = k / 8; ln(712 + u * 176, 190, 752 + u * 96, 118, gc, 1.2); }
    if (detail) for (let k = 1; k < 4; k++) { const u = k / 4; ln(712 + 40 * u, 190 - 72 * u, 888 - 40 * u, 190 - 72 * u, gc, 1); }
    ln(712, 190, 752, 118, gc, 2.2); ln(888, 190, 848, 118, gc, 2.2); ln(752, 118, 848, 118, gc, 2.2);
    R(706, 188, 188, 4, STEEL);
    if (on && night) glow(800, 150, 90, '255,240,200', 0.3);
    // the core held in it: a small sun, beating with the grid
    if (on) {
      const beat = 0.8 + 0.2 * Math.sin(tt * 3.2), cy = 156;
      glow(800, cy, 46 * beat, '255,250,230', night ? 0.95 : 0.7);
      glow(800, cy, 90, '255,140,230', night ? 0.35 : 0.16);
      dot(800, cy, 12 * beat, '#ffffff'); dot(800, cy, 18 * beat, 'rgba(255,220,250,0.35)');
      for (let k = 0; k < 3; k++) { const a = tt * 1.4 + k * 2.094; ln(800 + Math.cos(a) * 12, cy + Math.sin(a) * 12, 800 + Math.cos(a) * 26, cy + Math.sin(a) * 26, 'rgba(255,240,255,0.7)', 1.2); }
    } else dot(800, 156, 8, '#2a2c30');
  }
  // the spire, and the plasma turning round it
  {
    const cx = 800, cy = 74;
    const ring = (rot, front) => {
      if (!on) return;
      ctx.strokeStyle = `rgba(${front ? ACC : '255,140,230'},${night ? 0.85 : 0.6})`; ctx.lineWidth = 2.2 * S;
      ctx.beginPath(); ctx.ellipse(X(cx), Y(cy), 52 * S, 13 * S, rot, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); ctx.stroke();
    };
    ring(0.38, false); ring(-0.38, false);
    poly([[795, 118], [805, 118], [801.2, 30], [798.8, 30]], STEEL);
    R(799.4, 30, 1.2, 88, L('rgba(255,255,255,0.6)', 'rgba(255,255,255,0.25)', 'rgba(0,0,0,0)'));
    ring(0.38, true); ring(-0.38, true);
    if (on) for (let k = 0; k < 2; k++) {                                                   // a bunch on each ring
      const rot = k ? -0.38 : 0.38, a = tt * (k ? -2.6 : 2.2) + k * 2;
      const ex = Math.cos(a) * 52, ey = Math.sin(a) * 13;
      const x = cx + ex * Math.cos(rot) - ey * Math.sin(rot), y = cy + ex * Math.sin(rot) + ey * Math.cos(rot);
      glow(x, y, 20, k ? '255,140,230' : ACC, 0.85); dot(x, y, 2.6, '#ffffff');
    }
    if (on) glow(cx, cy, 70, ACC, night ? 0.3 : 0.14);
    beacon(800, 29, 0);
  }

  // ── The podium ──
  R(290, 838, 1020, 24, ROOF_T);                                                          // its roof, from above
  if (detail) for (let x = 304; x < 1296; x += 44) if (Math.abs(x - 440) > 110 && Math.abs(x - 800) > 160 && Math.abs(x - 1160) > 110) RR(x, 843, 30, 13, 2, L('#7ab4d8', '#1a2c44', '#1c1e22'));   // skylights
  R(290, 860, 1020, 4, STEEL_D);
  {
    const g = ctx.createLinearGradient(X(290), 0, X(1310), 0);
    g.addColorStop(0, GL[0]); g.addColorStop(0.5, GL[1]); g.addColorStop(1, GL[2]);
    ctx.fillStyle = g; ctx.fillRect(X(290), Y(864), 1020 * S, 96 * S);
  }
  for (let x = 290; x <= 1310; x += 60) R(x - 3, 864, 6, 96, STEEL);                        // piers
  if (on && night) for (let k = 0; k < 17; k++) if (k < 7 || k > 9) R(296 + k * 60, 930, 48, 26, _cmFrac(k * 3.1) > 0.2 ? 'rgba(255,220,150,0.85)' : 'rgba(170,225,255,0.5)');   // the lobby, lit
  // the ticker
  R(290, 866, 1020, 16, '#05080c');
  if (on) {
    ctx.save(); ctx.beginPath(); ctx.rect(X(292), Y(866), 1016 * S, 16 * S); ctx.clip();
    const msg = `${CO}  ◆  GENERATING ${formatPower(st.gen)}  ◆  POWERING ${st.pop.toLocaleString('en-US')} PEOPLE IN ${CITY}  ◆  ADVANCED FUSION ONLINE  ◆  `;
    ctx.font = `bold ${11 * S}px Courier New, monospace`;
    const mw = Math.max(40, ctx.measureText(msg).width / S), off = (tt * 46) % mw;
    for (let x = 292 - off; x < 1310; x += mw) text(msg, x, 874.5, 11, `rgba(${ACC},0.95)`, 'Courier New, monospace', 'left');
    ctx.restore();
  }
  // the name, in lights
  RR(530, 886, 540, 40, 4, L('#1a2634', '#0a1018', '#161719'));
  if (on && night) glow(800, 904, 300, GOLD, 0.16);
  fit(CO, 800, 901, 24, 500, on ? (night ? '#ffe9a8' : '#ffd66e') : '#4a4436');
  fit('H E A D Q U A R T E R S', 800, 918, 7.5, 300, on ? `rgba(${ACC},0.95)` : '#3a4046', 'Arial, sans-serif');
  // the doors, under a canopy
  R(716, 930, 168, 30, L('#22303e', '#0c141c', '#131416'));
  for (let k = 0; k < 4; k++) { R(724 + k * 40, 932, 32, 28, on ? (night ? '#ffe2a0' : '#9cc8e4') : '#1c1e22'); R(739.5 + k * 40, 932, 1, 28, STEEL_D); }
  R(700, 924, 200, 7, STEEL); R(700, 931, 200, 2, SHADOW);
  if (on && night) { glow(800, 950, 150, '255,226,160', 0.32); for (const lx of [706, 894]) glow(lx, 934, 30, '255,236,190', 0.5); }
  for (let s = 0; s < 4; s++) R(708 - s * 6, 960 + s * 6, 184 + s * 12, 6, s % 2 ? PAVE : PAVE_D);   // steps
  if (on) { person(730, 986, '#1a1a2a', _N_SKIN[1], 0, 1.8); person(870, 986, '#1a1a2a', _N_SKIN[3], 0, 1.8); }   // doormen
  // Two pylons either side of the steps, and the arc that stands between them.
  for (const ax of [672, 928]) {
    R(ax + 3, 1046, 9, 4, SHADOW);
    poly([[ax - 5, 1048], [ax + 5, 1048], [ax + 2.4, 998], [ax - 2.4, 998]], STEEL);
    R(ax - 7, 1046, 14, 4, STEEL_D);
    dot(ax, 994, 6, on ? '#eaf8ff' : '#3a3e44');
    if (on) glow(ax, 994, 26, ACC, night ? 0.8 : 0.45);
  }
  if (on) {
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? 'rgba(255,255,255,0.9)' : `rgba(${pass ? ACC : '255,140,230'},0.55)`; ctx.lineWidth = (pass ? 1.2 : 3.4) * S;
      ctx.beginPath();
      for (let k = 0; k <= 16; k++) {
        const u = k / 16, edge = Math.sin(u * Math.PI);
        const x = 672 + u * 256, y = 994 - edge * 22 + Math.sin(tt * 9 + k * 1.9 + pass) * 3.2 * edge + Math.sin(tt * 23 + k * 4.1) * 1.4 * edge;
        k ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y));
      }
      ctx.stroke();
    }
    if (night) glow(800, 982, 150, ACC, 0.14);
  }

  // ── Traffic on the boulevard ──
  if (on) for (let k = 0; k < 7; k++) {
    const dir = k % 2 ? 1 : -1, u = (tt * (0.022 + _cmFrac(k * 3) * 0.012) + _cmFrac(k * 7)) % 1;
    const x = dir > 0 ? -60 + u * (AW + 120) : AW + 60 - u * (AW + 120), y = dir > 0 ? 1218 : 1193;
    const col = ['#e8e8e8', '#c03a30', '#2a5a9a', '#141418', '#f0b820', '#3a8a5a', '#8a8f98'][k];
    RR(x - 13, y + 2, 30, 14, 3, 'rgba(0,0,0,0.3)'); RR(x - 15, y, 30, 14, 3, col);
    R(x + (dir > 0 ? 2 : -9), y + 2, 7, 10, night ? '#6a8aa0' : '#2a3440');
    if (night) { glow(x + dir * 22, y + 7, 22, '255,244,210', 0.5); dot(x - dir * 15, y + 3, 1.3, '#ff3030'); dot(x - dir * 15, y + 11, 1.3, '#ff3030'); }
  }

  if (!on) {
    ctx.fillStyle = 'rgba(255,90,70,0.9)'; ctx.font = `bold ${28 * S}px Courier New`; ctx.textAlign = 'center';
    ctx.fillText('NO POWER: HEADQUARTERS DARK', X(800), Y(1010)); ctx.textAlign = 'left';
  }
  ctx.restore();
}
