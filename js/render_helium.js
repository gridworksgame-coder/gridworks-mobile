/* ═══════════════════════════════════════════════════════════════════
   RENDER: HELIUM CHAIN
   Helium Gas Field, Helium Well, Cryo Plant and Helium-3 Separator
   sprites. Share the kit
   from render_oil_nuclear.js (_depositKit, _plantFrame, _portAnchor,
   _portPipe) and render_hydro_coal.js (_wf* helpers).
   ═══════════════════════════════════════════════════════════════════ */

function renderHeliumDeposit(e, px, py, t) {
    // Helium Gas Field — a patch of sour, gas-bleached scrub over a leaky
    // gas pocket. Bubbling seep pools, frost-rimmed where the expanding gas
    // chills the mud, pale lilac haze curling up off the vents, and an old
    // capped exploration wellhead with a survey flag.
    const K = _depositKit(e, px, py);
    const { k, X, Y, S, blob, poly, ell, line, rock } = K;
    const detail = Camera.zoom > 0.5;
    const phase = e._heliumPhase ?? S(97)*6.28;
    const pulse = 0.5 + 0.5*Math.sin(t*1.1 + phase);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // ── Bleached ground ──
    blob(50, 52, 47, 44, 0.12, 5, 18); ctx.fillStyle = '#5a5448'; ctx.fill();
    blob(50, 52, 40, 37, 0.14, 36, 16); ctx.fillStyle = '#8c8676'; ctx.fill();
    if (detail) K.tufts('#7a7456', 71, 14);

    // ── Seep pools ──
    const pools = [];
    for (let i = 0; i < 1 + K.size; i++) {
      const a = S(500 + i)*Math.PI*2, d = 8 + S(510 + i)*18;
      pools.push({ x: 50 + Math.cos(a)*d, y: 54 + Math.sin(a)*d*0.8, rx: 7 + S(520 + i)*4 - K.size*0.6, ry: 4.5 + S(530 + i)*2, i });
    }
    for (const p of pools) {
      blob(p.x, p.y, p.rx + 2.2, p.ry + 1.8, 0.18, 540 + p.i*7, 12); ctx.fillStyle = '#e8eef4'; ctx.fill();      // frost rim
      blob(p.x, p.y, p.rx, p.ry, 0.18, 560 + p.i*7, 12); ctx.fillStyle = '#2e2a38'; ctx.fill();                   // dark mud water
      ell(p.x - p.rx*0.2, p.y - p.ry*0.25, p.rx*0.55, p.ry*0.45); ctx.fillStyle = 'rgba(150,120,190,0.35)'; ctx.fill();
      // bubbles breaking the surface
      for (let b = 0; b < 3; b++) {
        const ph = (t*0.7 + S(580 + p.i*5 + b)) % 1;
        const bx = p.x + (S(590 + p.i*5 + b) - 0.5)*p.rx*1.1, by = p.y + (S(600 + p.i*5 + b) - 0.5)*p.ry*0.9;
        ctx.strokeStyle = `rgba(235,220,255,${((1 - ph)*0.8).toFixed(3)})`; ctx.lineWidth = 0.5*k;
        ctx.beginPath(); ctx.ellipse(X(bx), Y(by), (0.6 + ph*2.6)*k, (0.4 + ph*1.6)*k, 0, 0, Math.PI*2); ctx.stroke();
      }
    }

    // ── A few pale rocks ──
    for (let i = 0; i < 2 + K.size; i++) {
      rock(18 + S(700 + i)*64, 22 + S(710 + i)*60, 3 + S(720 + i)*3, 730 + i*9, '#6c6862', '#a8a49c');
    }

    // ── Capped exploration wellhead ──
    const wx = 62 + S(11)*8, wy = 34 + S(12)*8;
    ell(wx, wy + 3, 7, 3); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
    ell(wx, wy + 1, 6, 2.6); ctx.fillStyle = '#6e7278'; ctx.fill();
    ctx.fillStyle = '#9aa2aa'; ctx.fillRect(X(wx - 1.6), Y(wy - 7), 3.2*k, 8*k);
    ctx.fillStyle = '#c05040'; ctx.fillRect(X(wx - 3.4), Y(wy - 5), 6.8*k, 1.6*k);     // valve handwheel bar
    ell(wx, wy - 7.5, 2.4, 1.2); ctx.fillStyle = '#c8d0d8'; ctx.fill();
    if (detail) {
      line(wx + 6, wy + 2, wx + 6, wy - 10, '#8a6a40', 0.9);
      poly([[wx + 6, wy - 10], [wx + 10.5, wy - 8.8], [wx + 6, wy - 7.6]]); ctx.fillStyle = '#c090e0'; ctx.fill();
    }

    // ── Lilac haze wisps ──
    if (detail) {
      for (let i = 0; i < 4 + K.size; i++) {
        const ph = (t*0.18 + S(800 + i)) % 1;
        const sx = 20 + S(810 + i)*60, sy = 40 + S(820 + i)*40;
        const g = ctx.createRadialGradient(X(sx + ph*6), Y(sy - ph*20), 0, X(sx + ph*6), Y(sy - ph*20), (4 + ph*9)*k);
        g.addColorStop(0, `rgba(230,200,255,${(0.28*(1 - ph)).toFixed(3)})`); g.addColorStop(1, 'rgba(230,200,255,0)');
        ctx.fillStyle = g; ell(sx + ph*6, sy - ph*20, 4 + ph*9, 3 + ph*7); ctx.fill();
      }
    }

    K.elementTile('2', 'He', `rgba(245,215,255,${(0.8 + 0.2*pulse).toFixed(3)})`, 'rgba(20,10,28,0.85)', 'rgba(200,150,230,0.7)');
    ctx.restore();
}

function renderHeliumWell(e, px, py, t) {
  // A 6×6 gas wellhead under its own derrick, laid out the way the gas moves:
  //  • The vent cellar: a steel ring over the bore, lilac gas glowing up
  //    through the grating, with the christmas tree on top of it. A lattice
  //    derrick stands over the cellar, drawn world-up whatever the rotation,
  //    its crown beacon blinking.
  //  • A twin-fan booster compressor lifts the raw gas to the membrane skid,
  //    a row of eight cartridges that glow as they strip the helium out; the
  //    reject goes to a guyed flare stack, whose flame also burns world-up.
  //  • Product helium is banked in three tubes on saddles, their sight glasses
  //    lit to the well's buffer, whose manifold feeds HE OUT.
  //  • A control shed with a dish on its roof, lit at night, and lilac edge
  //    lights chasing round the pad while it runs.
  // Drawn in the unrotated frame (_plantFrame) in 240×240 units; HE OUT sits
  // mid right face, the same offset HeliumSystem.getStubs uses. A well built
  // when they were 4×4 keeps that footprint and wears this art scaled down.
  const f = _plantFrame(e, px, py, T.HELIUMWELL);
  const w = f.bw, h = f.bh;
  const k = Math.min(w, h) / 240;                 // one authoring unit
  const on = !!e.powered;
  const flowing = on && !e._bufferFull && !e._oreDepleted;
  const def = EntityDefs[T.HELIUMWELL];
  const fill = Math.min(1, (e._helium || 0) / (def.heliumCapacity || 1000));
  const S = TILE / 40;
  const night = typeof DayNight !== 'undefined' && DayNight.darkness() > 0.3;
  const detail = typeof Camera === 'undefined' || Camera.zoom > 0.5;
  const accent = '#f0b8ff';
  const st = (typeof HeliumSystem !== 'undefined' && e.col !== undefined) ? HeliumSystem.getStubs(e) : null;
  const oY = (Math.floor(Math.round(w / TILE) / 2) * TILE + TILE/2) / k;   // HE OUT row, in units
  const U = v => v * k;
  const rr = (x, y, ww, hh, r, fillC, strokeC, lw = 1) => {
    ctx.beginPath(); ctx.roundRect(U(x), U(y), U(ww), U(hh), U(r));
    if (fillC) { ctx.fillStyle = fillC; ctx.fill(); }
    if (strokeC) { ctx.strokeStyle = strokeC; ctx.lineWidth = lw * k; ctx.stroke(); }
  };
  const circ = (x, y, r, fillC, strokeC, lw = 1) => {
    ctx.beginPath(); ctx.arc(U(x), U(y), U(r), 0, Math.PI*2);
    if (fillC) { ctx.fillStyle = fillC; ctx.fill(); }
    if (strokeC) { ctx.strokeStyle = strokeC; ctx.lineWidth = lw * k; ctx.stroke(); }
  };
  const shadow = (x, y, ww, hh, r) => _wfShadow(U(x), U(y), U(ww), U(hh), S, U(r));
  const pipe = (pts, live, col) => _wfPipe(pts.map(([x, y]) => [U(x), U(y)]), S, t, live, col);
  const wheel = (x, y, r, col) => {                // valve handwheel, seen from above
    circ(x, y, r, null, col, 1.8);
    ctx.strokeStyle = col; ctx.lineWidth = 1 * k; ctx.beginPath();
    for (let q = 0; q < 3; q++) { const a = q * Math.PI / 3; ctx.moveTo(U(x - Math.cos(a)*r), U(y - Math.sin(a)*r)); ctx.lineTo(U(x + Math.cos(a)*r), U(y + Math.sin(a)*r)); }
    ctx.stroke();
    circ(x, y, r*0.3, col);
  };
  const seed = (e.col || 0) * 0.37 + (e.row || 0) * 0.11;
  const breathe = 0.65 + 0.35 * Math.sin(t * 1.7 + seed);

  ctx.save();
  ctx.save(); f.apply();

  // ── Pad: dark steel-trowelled concrete, hazard corners ──
  shadow(5, 5, 230, 230, 7);
  const pg = ctx.createLinearGradient(0, U(5), U(235), U(235));
  pg.addColorStop(0, '#46464e'); pg.addColorStop(1, '#2e2e36');
  rr(5, 5, 230, 230, 7, pg, '#17171c', 1.4);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let x = 43; x < 235; x += 38) ctx.fillRect(U(x), U(6), U(0.8), U(228));              // slab joints
  for (let y = 43; y < 235; y += 38) ctx.fillRect(U(6), U(y), U(228), U(0.8));
  ctx.fillStyle = 'rgba(10,8,14,0.3)';
  for (const [x, y, r] of [[120, 118, 11], [40, 128, 8], [196, 212, 9]]) { ctx.beginPath(); ctx.ellipse(U(x), U(y), U(r), U(r*0.6), 0.4, 0, Math.PI*2); ctx.fill(); }   // stains
  for (const [cx, cy, sx, sy] of [[8, 8, 1, 1], [232, 8, -1, 1], [8, 232, 1, -1], [232, 232, -1, -1]]) {   // hazard corners
    for (let q = 0; q < 3; q++) {
      ctx.fillStyle = q % 2 ? '#1a1a1a' : '#e0b020';
      const a = 20 - q * 6, b = 14 - q * 6;
      ctx.beginPath();
      ctx.moveTo(U(cx + sx*a), U(cy)); ctx.lineTo(U(cx), U(cy)); ctx.lineTo(U(cx), U(cy + sy*a));
      if (b > 0) { ctx.lineTo(U(cx), U(cy + sy*b)); ctx.lineTo(U(cx + sx*b), U(cy)); }
      ctx.closePath(); ctx.fill();
    }
  }

  // Edge lights chasing round the pad while it runs.
  const EL = 16, ER = 224, ES = ER - EL, EN = detail ? 32 : 16;
  for (let q = 0; q < EN; q++) {
    const d = (q / EN) * 4, side = Math.floor(d), u = d - side;
    const x = side === 0 ? EL + u*ES : side === 1 ? ER : side === 2 ? ER - u*ES : EL;
    const y = side === 0 ? EL : side === 1 ? EL + u*ES : side === 2 ? ER : ER - u*ES;
    const wave = (q / EN - t * 0.22 + 10) % 1;
    const a = !on ? 0.1 : flowing ? 0.18 + 0.82 * Math.pow(wave, 4) : 0.3;
    ctx.fillStyle = `rgba(240,184,255,${a.toFixed(3)})`;
    ctx.beginPath(); ctx.arc(U(x), U(y), U(a > 0.5 ? 2.2 : 1.5), 0, Math.PI*2); ctx.fill();
  }

  // ── Pipework (under the kit) ──
  const WX = 64, WY = 70;                                   // the vent cellar
  const CX0 = 112, CY0 = 16, CW = 80, CH = 42;              // compressor package
  const MX0 = 20, MY0 = 150, MW = 110, MH = 68;             // membrane skid
  const TX0 = 152, TW = 70, TY0 = oY - 37;                  // tube bank, three tubes centred on HE OUT
  const SX0 = 158, SY0 = 62, SW = 38, SH = 26;              // control shed
  const FX = 214, FY = 34;                                  // flare stack
  pipe([[WX + 34, WY], [106, WY], [106, CY0 + CH*0.5], [CX0, CY0 + CH*0.5]], flowing, 'rgba(214,204,232,0.9)');   // raw gas to the compressor
  pipe([[126, CY0 + CH], [126, 126], [78, 126], [78, MY0]], flowing, 'rgba(214,204,232,0.9)');                     // compressed gas to the skid
  pipe([[MX0 + MW, MY0 + 12], [138, MY0 + 12], [138, 94], [FX, 94], [FX, FY + 6]], flowing, 'rgba(255,170,90,0.9)');   // reject to the flare
  pipe([[MX0 + MW, MY0 + MH - 14], [146, MY0 + MH - 14], [146, oY], [TX0, oY]], flowing, accent);                  // product to the tubes
  pipe([[TX0 + TW + 6, oY], [238, oY]], !!e._heliumPipeOut, accent);                                               // manifold to HE OUT

  // ── The vent cellar: steel ring, gas glowing up through the grating ──
  circ(WX + 2, WY + 3, 36, 'rgba(0,0,0,0.4)');
  circ(WX, WY, 34, '#3e4048', '#14141a', 1.4);
  circ(WX, WY, 28, '#0e0a14', '#6a6c76', 1.2);
  const glowA = (flowing ? 0.55 + 0.4 * breathe : on ? 0.2 : 0.08);
  const vg = ctx.createRadialGradient(U(WX), U(WY), U(4), U(WX), U(WY), U(28));
  vg.addColorStop(0, `rgba(250,225,255,${glowA.toFixed(3)})`);
  vg.addColorStop(0.5, `rgba(200,120,255,${(glowA * 0.6).toFixed(3)})`);
  vg.addColorStop(1, 'rgba(120,60,200,0)');
  circ(WX, WY, 28, vg);
  ctx.strokeStyle = 'rgba(70,72,84,0.95)'; ctx.lineWidth = 1 * k;                            // grating
  ctx.save();
  ctx.beginPath(); ctx.arc(U(WX), U(WY), U(27.5), 0, Math.PI*2); ctx.clip();
  ctx.beginPath();
  for (let q = -26; q <= 26; q += 5.2) { ctx.moveTo(U(WX + q), U(WY - 28)); ctx.lineTo(U(WX + q), U(WY + 28)); ctx.moveTo(U(WX - 28), U(WY + q)); ctx.lineTo(U(WX + 28), U(WY + q)); }
  ctx.stroke();
  ctx.restore();
  for (let q = 0; q < 12; q++) {                                                              // ring bolts
    const a = q * Math.PI / 6;
    circ(WX + Math.cos(a)*31, WY + Math.sin(a)*31, 1.2, '#a0a4ae');
  }
  if (flowing && detail) {                                                                    // bubbles of gas breaking through
    for (let q = 0; q < 6; q++) {
      const ph = (t * 0.5 + q / 6 + seed) % 1, a = q * 2.4 + seed;
      const rad = 8 + 16 * ((q * 0.37) % 1);
      ctx.strokeStyle = `rgba(245,225,255,${((1 - ph) * 0.8).toFixed(3)})`; ctx.lineWidth = 0.7 * k;
      ctx.beginPath(); ctx.arc(U(WX + Math.cos(a)*rad), U(WY + Math.sin(a)*rad), U(0.8 + ph * 4), 0, Math.PI*2); ctx.stroke();
    }
  }
  // Christmas tree on the cellar: master valve, wings, handwheels, gauge.
  const tg = ctx.createRadialGradient(U(WX - 3), U(WY - 3), U(1), U(WX), U(WY), U(11));
  tg.addColorStop(0, '#e4eaf0'); tg.addColorStop(1, '#5a646e');
  rr(WX - 24, WY - 4, 48, 8, 2.5, '#8a949e', '#2a2e34', 0.9);                                 // wing valves
  circ(WX, WY, 10.5, tg, '#1e2226', 1.1);                                                      // master valve body
  wheel(WX - 20, WY, 5.5, '#d04a3a'); wheel(WX + 20, WY, 5.5, '#d04a3a');
  wheel(WX, WY, 6.5, '#e05a40');
  circ(WX + 9, WY - 15, 4.6, '#f4f4ee', '#2a2e34', 0.9);                                       // pressure gauge
  const needle = (on ? 0.6 + 0.08*Math.sin(t*3.1) + 0.04*Math.sin(t*11) : -0.9) + fill * 0.4;
  ctx.strokeStyle = '#c02020'; ctx.lineWidth = 0.8 * k; ctx.beginPath(); ctx.moveTo(U(WX + 9), U(WY - 15)); ctx.lineTo(U(WX + 9 + Math.cos(needle - 2)*3.6), U(WY - 15 + Math.sin(needle - 2)*3.6)); ctx.stroke();
  for (const [lx, ly] of [[WX - 30, WY - 30], [WX + 30, WY - 30], [WX - 30, WY + 30], [WX + 30, WY + 30]]) {   // derrick footings
    rr(lx - 5, ly - 5, 10, 10, 1.2, '#5a5e66', '#22262c', 0.8);
    circ(lx, ly, 2, '#2a2e34');
  }

  // ── Booster compressor package, twin fans ──
  shadow(CX0, CY0, CW, CH, 3);
  const cg = ctx.createLinearGradient(0, U(CY0), 0, U(CY0 + CH));
  cg.addColorStop(0, '#6c7a8a'); cg.addColorStop(1, '#3a4654');
  rr(CX0, CY0, CW, CH, 3, cg, '#1a2028', 1.1);
  ctx.fillStyle = 'rgba(255,255,255,0.1)'; for (let q = 1; q < 5; q++) ctx.fillRect(U(CX0 + 3), U(CY0 + q*8), U(14), U(0.9));   // louvres
  for (const fx of [CX0 + 34, CX0 + 62]) {
    circ(fx, CY0 + CH/2, 14.5, '#2a323a');
    _fcFan(U(fx), U(CY0 + CH/2), U(12.5), S, t + fx, flowing, 10);
  }
  circ(CX0 + 8, CY0 + 6, 2, flowing ? '#60ff90' : on ? '#e0c040' : '#2a3a30');                  // run lamp

  // ── Membrane separation skid: eight glowing cartridges between headers ──
  shadow(MX0, MY0, MW, MH, 3);
  rr(MX0, MY0, MW, MH, 3, '#3a3448', '#141018', 1.1);
  rr(MX0 + 4, MY0 + 4, MW - 8, 7, 3.5, '#9a94a8', '#2a2434', 0.7);                              // feed header
  rr(MX0 + 4, MY0 + MH - 11, MW - 8, 7, 3.5, '#c8a8e0', '#2a2434', 0.7);                        // permeate header
  for (let q = 0; q < 8; q++) {
    const x = MX0 + 7 + q * (MW - 14) / 8, cw = (MW - 14) / 8 - 2.2;
    const mg = ctx.createLinearGradient(U(x), 0, U(x + cw), 0);
    mg.addColorStop(0, '#d8d0e8'); mg.addColorStop(0.45, '#ffffff'); mg.addColorStop(1, '#7a7490');
    rr(x, MY0 + 12, cw, MH - 24, cw / 2, mg, '#2a2438', 0.7);
    if (flowing) {
      const a = 0.22 + 0.2 * Math.sin(t * 2 + q * 0.8);
      rr(x + 1, MY0 + 13, cw - 2, MH - 26, (cw - 2) / 2, `rgba(220,150,255,${a.toFixed(3)})`);
      const p = (t * 0.7 + q * 0.19) % 1;
      ctx.fillStyle = `rgba(255,235,255,${(0.95 * Math.sin(p * Math.PI)).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(U(x + cw/2), U(MY0 + 15 + p * (MH - 30)), U(1.8), 0, Math.PI*2); ctx.fill();
    }
  }

  // ── Control shed, dish on the roof ──
  shadow(SX0, SY0, SW, SH, 1.5);
  rr(SX0, SY0, SW, SH, 1.5, '#c8c0b0', '#3a3630', 0.9);
  rr(SX0 - 1, SY0 - 1, SW + 2, 5, 1, '#5a5e64');                                                // roof edge
  rr(SX0 + 4, SY0 + 9, 11, 7, 0.7, on && night ? '#ffe2a0' : '#3a4a58', '#2a2a2a', 0.6);         // window
  rr(SX0 + 22, SY0 + 9, 9, 16, 0.7, '#5a4a3a', '#2a2218', 0.6);                                 // door
  rr(SX0 + SW - 1, SY0 + 5, 4, 7, 0.7, '#8a8e94');                                              // AC unit
  const dishA = Math.sin(t * 0.25 + seed) * 0.6;
  ctx.save(); ctx.translate(U(SX0 + 28), U(SY0 - 3)); ctx.rotate(dishA);
  ctx.fillStyle = '#e4e8ec'; ctx.strokeStyle = '#3a3e44'; ctx.lineWidth = 0.7 * k;
  ctx.beginPath(); ctx.ellipse(0, 0, U(6), U(3), 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.restore();
  if (on && night) {
    const gx = U(SX0 + 9.5), gy = U(SY0 + 12);
    const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, U(20));
    gg.addColorStop(0, 'rgba(255,220,150,0.35)'); gg.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = gg; ctx.fillRect(gx - U(20), gy - U(20), U(40), U(40));
  }

  // ── Helium tube bank: three tubes on saddles, sight glasses lit to the buffer ──
  for (let q = 0; q < 3; q++) {
    const y = TY0 + q * 26;
    shadow(TX0, y, TW, 22, 11);
    for (const sx of [TX0 + 12, TX0 + TW - 18]) rr(sx, y - 1.5, 6, 25, 0.8, '#3a3e44');          // saddles
    const bg = ctx.createLinearGradient(0, U(y), 0, U(y + 22));
    bg.addColorStop(0, '#f6f2fa'); bg.addColorStop(0.35, '#ffffff'); bg.addColorStop(1, '#8a80a0');
    rr(TX0, y, TW, 22, 11, bg, '#4a4058', 1);
    rr(TX0 + 8, y + 7.5, TW - 16, 7, 3.5, '#1a1224', '#4a4058', 0.6);                            // sight glass
    if (fill > 0) {
      const a = on ? 0.75 + 0.25 * breathe : 0.35;
      const lit = (fill > 0.95 && on && Math.sin(t*6) > 0) ? `rgba(255,120,100,${a.toFixed(3)})` : `rgba(240,160,255,${a.toFixed(3)})`;
      rr(TX0 + 9, y + 8.5, (TW - 18) * fill, 5, 2.5, lit);
    }
  }
  rr(TX0 + TW, TY0 + 2, 6, 70, 2.5, '#5a5e66', '#22262c', 0.9);                                 // outlet manifold

  // ── Flare stack (top down: base, guy wires, knock-out drum) ──
  for (const [gx, gy] of [[FX - 16, FY - 18], [FX + 16, FY - 18], [FX + 12, FY + 24], [FX - 20, FY + 16]]) {
    ctx.strokeStyle = 'rgba(16,16,16,0.65)'; ctx.lineWidth = 0.6 * k;
    ctx.beginPath(); ctx.moveTo(U(FX), U(FY)); ctx.lineTo(U(gx), U(gy)); ctx.stroke();
    circ(gx, gy, 1.5, '#6a6a6a');
  }
  circ(FX - 8, 76, 8, '#7a8088', '#2a2e34', 0.9);                                                // knock-out drum
  circ(FX + 2, FY + 2, 6.5, 'rgba(0,0,0,0.35)');
  circ(FX, FY, 6, '#5a5e64', '#22262a', 0.9);
  circ(FX, FY, 3.2, '#1a1a1a');
  ctx.restore();

  // Everything that stands up goes in world space, so it rises world-up.
  // The flare's flame:
  const [fwx, fwy] = f.toWorld(U(FX), U(FY));
  if (flowing) {
    const fl = 0.75 + 0.25*Math.sin(t*13) * Math.sin(t*7.3);
    const lean = Math.sin(t * 0.7) * 2.5 * S;
    if (night) {
      const hg = ctx.createRadialGradient(fwx, fwy - 8*S, 0, fwx, fwy - 8*S, 38*S);
      hg.addColorStop(0, 'rgba(255,150,60,0.32)'); hg.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = hg; ctx.fillRect(fwx - 38*S, fwy - 46*S, 76*S, 76*S);
    }
    const g = ctx.createRadialGradient(fwx + lean, fwy - 10*S, 0, fwx + lean, fwy - 10*S, 14*S*fl);
    g.addColorStop(0, 'rgba(255,248,200,0.98)'); g.addColorStop(0.45, 'rgba(255,150,50,0.8)'); g.addColorStop(1, 'rgba(255,70,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(fwx + lean, fwy - 10*S, 6.5*S*fl, 14*S*fl, lean * 0.02, 0, Math.PI*2); ctx.fill();
  } else if (on) {
    ctx.fillStyle = 'rgba(120,170,255,0.8)'; ctx.beginPath(); ctx.arc(fwx, fwy - 2*S, 2*S, 0, Math.PI*2); ctx.fill();   // pilot light
  }
  const [cvx, cvy] = f.toWorld(U(CX0 + 48), U(CY0 + CH/2));
  _wfSmoke(cvx, cvy, S*0.35, t, '235,230,245', flowing, 0.3);                                  // compressor exhaust heat

  // The derrick over the cellar: four legs tapering to the crown block, braced
  // in lifts, kept inside the footprint's top edge however the well is turned.
  const [dwx, dwy] = f.toWorld(U(WX), U(WY));
  const dHalf = U(30);                                       // the footings' spread
  const dBase = dwy + dHalf * 0.6;
  const dH = Math.max(40*S, Math.min(120*S, dBase - py - 6*S));
  const dTop = dBase - dH, tHalf = 7*S;
  const legX = (u, sd) => dwx + sd * (dHalf + (tHalf - dHalf) * u);
  const legY = (u) => dBase - dH * u;
  // Its shadow across the pad, then the steel: back face, then front.
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 3*S; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(dwx, dBase); ctx.lineTo(dwx + 18*S, dBase + 8*S); ctx.stroke();
  const steel = on ? '#a8aeb8' : '#70747c', steelD = on ? '#5e646e' : '#44484e';
  const lifts = detail ? 6 : 3;
  ctx.lineWidth = 1*S; ctx.strokeStyle = steelD; ctx.beginPath();
  for (let i = 0; i < lifts; i++) {
    const u0 = i / lifts, u1 = (i + 1) / lifts;
    ctx.moveTo(legX(u0, -1), legY(u0)); ctx.lineTo(legX(u1, 1), legY(u1));
    ctx.moveTo(legX(u0, 1), legY(u0)); ctx.lineTo(legX(u1, -1), legY(u1));
  }
  ctx.stroke();
  ctx.lineWidth = 0.9*S; ctx.strokeStyle = steel; ctx.beginPath();
  for (let i = 1; i <= lifts; i++) { const u = i / lifts; ctx.moveTo(legX(u, -1), legY(u)); ctx.lineTo(legX(u, 1), legY(u)); }
  ctx.stroke();
  ctx.lineWidth = 2.2*S; ctx.strokeStyle = steel; ctx.beginPath();
  ctx.moveTo(legX(0, -1), legY(0)); ctx.lineTo(legX(1, -1), legY(1));
  ctx.moveTo(legX(0, 1), legY(0)); ctx.lineTo(legX(1, 1), legY(1));
  ctx.stroke();
  // The working line down the middle, a slow lilac pulse rising up it.
  ctx.lineWidth = 0.8*S; ctx.strokeStyle = 'rgba(30,30,36,0.9)'; ctx.beginPath(); ctx.moveTo(dwx, dTop); ctx.lineTo(dwx, dwy); ctx.stroke();
  if (flowing) {
    const p = (t * 0.45 + seed) % 1, py2 = dwy + (dTop - dwy) * p;
    const pg2 = ctx.createRadialGradient(dwx, py2, 0, dwx, py2, 6*S);
    pg2.addColorStop(0, `rgba(245,205,255,${(0.9 * Math.sin(p * Math.PI)).toFixed(3)})`); pg2.addColorStop(1, 'rgba(240,184,255,0)');
    ctx.fillStyle = pg2; ctx.fillRect(dwx - 6*S, py2 - 6*S, 12*S, 12*S);
  }
  // Crown block and its beacon.
  ctx.fillStyle = '#3a3e46'; ctx.strokeStyle = '#14161a'; ctx.lineWidth = 0.8*S;
  ctx.beginPath(); ctx.roundRect(dwx - tHalf - 2*S, dTop - 3*S, (tHalf + 2*S) * 2, 5*S, S); ctx.fill(); ctx.stroke();
  const blink = on && (t * 0.8 + seed) % 1 < 0.35;
  if (blink) {
    const bg2 = ctx.createRadialGradient(dwx, dTop - 5*S, 0, dwx, dTop - 5*S, 13*S);
    bg2.addColorStop(0, 'rgba(255,90,70,0.7)'); bg2.addColorStop(1, 'rgba(255,90,70,0)');
    ctx.fillStyle = bg2; ctx.fillRect(dwx - 13*S, dTop - 18*S, 26*S, 26*S);
  }
  ctx.fillStyle = blink ? '#ffd0c0' : '#6a2018';
  ctx.beginPath(); ctx.arc(dwx, dTop - 5*S, 1.8*S, 0, Math.PI*2); ctx.fill();

  // Gas curling up out of the vent, and its glow on the pad after dark.
  if (flowing) _wfSmoke(dwx, dwy, S*0.55, t, '235,205,255', true, 0.4);
  if (on && night) {
    const ng = ctx.createRadialGradient(dwx, dwy, 0, dwx, dwy, U(70));
    ng.addColorStop(0, `rgba(210,140,255,${(0.22 * breathe).toFixed(3)})`); ng.addColorStop(1, 'rgba(210,140,255,0)');
    ctx.fillStyle = ng; ctx.fillRect(dwx - U(70), dwy - U(70), U(140), U(140));
  }

  // Flood lamp on the pad
  const [lwx, lwy] = f.toWorld(U(24), U(132));
  ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(lwx, lwy, 2.2*S, 0, Math.PI*2); ctx.fill();
  if (on && night) {
    ctx.fillStyle = '#fff4d0'; ctx.beginPath(); ctx.arc(lwx, lwy, 1.3*S, 0, Math.PI*2); ctx.fill();
    const lg = ctx.createRadialGradient(lwx, lwy, 0, lwx, lwy, 46*S);
    lg.addColorStop(0, 'rgba(255,240,200,0.2)'); lg.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = lg; ctx.fillRect(lwx - 46*S, lwy - 46*S, 92*S, 92*S);
  }

  _frameText(f, U(TX0 + TW/2), U(oY + 0.5), 'He', `bold ${Math.max(5, 7*S)}px Courier New`, on ? '#f6e6ff' : '#8a8090');
  if (st) _portPipe(_portAnchor(e, px, py, f.W, f.H, st.heliumOut), S, t, { fluid: accent, label: 'HE OUT', on: !!e._heliumPipeOut, out: true, flow: !!e._heliumPipeOut });
  // Nameplate along the world-bottom edge whatever the rotation, so it never
  // lands on a side face and runs off the footprint; along the top when HE
  // OUT is on the bottom face (rot 1), so the two labels don't collide.
  const plx = px + f.W / 2, ply = f.rot === 1 ? py + 9*S : py + f.H - 9*S;
  _wfPlate(e._oreDepleted ? 'FIELD EXHAUSTED' : 'HELIUM WELL', plx, ply, S, e._oreDepleted ? '#ff6040' : accent, on);
  _wfLamp(px + f.W - 7*S, py + 7*S, S, t, accent, on);
  ctx.restore();
}

function renderHeliumWell2(e, px, py, t) {
  // The MK2: an 8×8 helium plant rather than a wellhead with a skid.
  //  • Twin wellheads in their cellars feed a compressor hall whose two big
  //    fans turn while it runs.
  //  • The compressed gas goes to a cryogenic cold box: a frosted
  //    distillation column (rings, ladder, spiral walkway) that sheds cold
  //    mist world-up and sparkles with frost while separating.
  //  • Product helium is banked in two Horton spheres, each with a ring gauge
  //    following the well's buffer; their manifold feeds HE OUT, mid right
  //    face, on the tile an MK1's HE OUT used (see tryReplaceHeliumWell).
  //  • Reject gas to a guyed flare stack (flame world-up), a control room lit
  //    at night with a blinking mast, and cyan edge lights chasing round the
  //    pad while it runs.
  // Drawn in the unrotated frame in 320×320 units.
  const f = _plantFrame(e, px, py, T.HELIUMWELL2);
  const w = f.bw, h = f.bh;
  const k = Math.min(w, h) / 320;
  const on = !!e.powered;
  const flowing = on && !e._bufferFull && !e._oreDepleted;
  const def = EntityDefs[T.HELIUMWELL2];
  const fill = Math.min(1, (e._helium || 0) / (def.heliumCapacity || 1000));
  const S = TILE / 40;
  const night = typeof DayNight !== 'undefined' && DayNight.darkness() > 0.3;
  const accent = '#90e0ff', lilac = '#f0b8ff';
  const st = (typeof HeliumSystem !== 'undefined' && e.col !== undefined) ? HeliumSystem.getStubs(e) : null;
  const oY = (Math.floor(Math.round(w / TILE) / 2) * TILE + TILE/2) / k;   // HE OUT row, in units
  const U = v => v * k;
  const rr = (x, y, ww, hh, r, fillC, strokeC, lw = 1) => {
    ctx.beginPath(); ctx.roundRect(U(x), U(y), U(ww), U(hh), U(r));
    if (fillC) { ctx.fillStyle = fillC; ctx.fill(); }
    if (strokeC) { ctx.strokeStyle = strokeC; ctx.lineWidth = lw * k; ctx.stroke(); }
  };
  const circ = (x, y, r, fillC, strokeC, lw = 1) => {
    ctx.beginPath(); ctx.arc(U(x), U(y), U(r), 0, Math.PI*2);
    if (fillC) { ctx.fillStyle = fillC; ctx.fill(); }
    if (strokeC) { ctx.strokeStyle = strokeC; ctx.lineWidth = lw * k; ctx.stroke(); }
  };
  const shadow = (x, y, ww, hh, r) => _wfShadow(U(x), U(y), U(ww), U(hh), S, U(r));
  const pipe = (pts, live, col) => _wfPipe(pts.map(([x, y]) => [U(x), U(y)]), S, t, live, col);
  const wheel = (x, y, r, col) => {
    circ(x, y, r, null, col, 1.6);
    ctx.strokeStyle = col; ctx.lineWidth = 0.9 * k; ctx.beginPath();
    for (let q = 0; q < 3; q++) { const a = q * Math.PI / 3; ctx.moveTo(U(x - Math.cos(a)*r), U(y - Math.sin(a)*r)); ctx.lineTo(U(x + Math.cos(a)*r), U(y + Math.sin(a)*r)); }
    ctx.stroke();
    circ(x, y, r*0.3, col);
  };
  const fan = (x, y, r) => {                          // radiator fan in its shroud, top down
    circ(x, y, r + 3, '#1a1e24', '#3a424c', 1.2);
    circ(x, y, r, '#0c0e12');
    const a0 = on ? t * 9 : 0.4;
    ctx.fillStyle = '#7a8694';
    for (let q = 0; q < 5; q++) {
      const a = a0 + q * Math.PI * 2 / 5;
      ctx.beginPath(); ctx.moveTo(U(x), U(y));
      ctx.arc(U(x), U(y), U(r - 1.5), a, a + 0.55); ctx.closePath(); ctx.fill();
    }
    circ(x, y, r * 0.22, '#c8d0d8', '#2a2e34', 0.8);
    ctx.strokeStyle = 'rgba(160,170,180,0.35)'; ctx.lineWidth = 0.6 * k;          // guard grille
    for (let q = 1; q <= 2; q++) { ctx.beginPath(); ctx.arc(U(x), U(y), U(r * q / 3), 0, Math.PI*2); ctx.stroke(); }
  };

  ctx.save();
  ctx.save(); f.apply();

  // ── Pad: dark slab, hazard border, edge lights ──
  shadow(6, 6, 308, 308, 10);
  const pg = ctx.createLinearGradient(0, 0, U(320), U(320));
  pg.addColorStop(0, '#4c5560'); pg.addColorStop(1, '#353c46');
  rr(6, 6, 308, 308, 10, pg, '#1c2128', 1.6);
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  for (let x = 46; x < 314; x += 40) ctx.fillRect(U(x), U(7), U(0.7), U(306));
  for (let y = 46; y < 314; y += 40) ctx.fillRect(U(7), U(y), U(306), U(0.7));
  ctx.save();                                          // hazard chevrons round the rim
  ctx.beginPath(); ctx.roundRect(U(6), U(6), U(308), U(308), U(10)); ctx.roundRect(U(14), U(14), U(292), U(292), U(6)); ctx.clip('evenodd');
  ctx.fillStyle = '#c89a18'; ctx.fillRect(U(6), U(6), U(308), U(308));
  ctx.fillStyle = '#1a1a1a';
  for (let q = -320; q < 640; q += 16) { ctx.beginPath(); ctx.moveTo(U(q), U(0)); ctx.lineTo(U(q + 8), U(0)); ctx.lineTo(U(q + 8 - 320), U(320)); ctx.lineTo(U(q - 320), U(320)); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  // Edge lights: a chase of cyan LEDs round the pad while it runs.
  const leds = [];
  for (let q = 0; q < 14; q++) { const s = 24 + q * 20; leds.push([s, 10], [310, s], [320 - s, 310], [10, 320 - s]); }
  leds.forEach(([x, y], i) => {
    const lit = on ? 0.35 + 0.65 * Math.max(0, Math.sin(t * 4 - i * 0.35)) : 0.12;
    circ(x, y, 1.8, `rgba(144,224,255,${lit.toFixed(3)})`);
  });

  // ── Pipework (under the kit) ──
  const W1 = [52, 50], W2 = [52, 130];                       // wellheads
  const CH = { x: 92, y: 16, w: 120, h: 62 };                 // compressor hall
  const CB = { x: 160, y: 168, r: 50 };                       // cold box column
  const SP = [{ x: 262, y: oY - 62, r: 34 }, { x: 262, y: oY + 62, r: 34 }];   // spheres
  const FX = 292, FY = 34;                                    // flare
  const gas = 'rgba(214,204,232,0.9)', cold = 'rgba(160,230,255,0.95)';
  pipe([[W1[0] + 14, W1[1]], [CH.x - 6, W1[1]], [CH.x - 6, CH.y + 40], [CH.x, CH.y + 40]], flowing, gas);
  pipe([[W2[0] + 14, W2[1]], [80, W2[1]], [80, CH.y + 52], [CH.x, CH.y + 52]], flowing, gas);
  pipe([[CH.x + CH.w * 0.5, CH.y + CH.h], [CH.x + CH.w * 0.5, CB.y - CB.r - 6], [CB.x, CB.y - CB.r - 6], [CB.x, CB.y - CB.r]], flowing, gas);
  pipe([[CH.x + CH.w, CH.y + 20], [FX, CH.y + 20], [FX, FY + 8]], flowing, 'rgba(255,170,90,0.9)');           // reject to the flare
  for (const sp of SP) pipe([[CB.x + CB.r, CB.y], [222, CB.y], [222, sp.y], [sp.x - sp.r, sp.y]], flowing, cold);
  pipe([[SP[0].x, SP[0].y + SP[0].r], [SP[0].x, SP[1].y - SP[1].r]], flowing, cold);                       // sphere crossover
  pipe([[SP[0].x + SP[0].r - 4, oY], [318, oY]], !!e._heliumPipeOut, lilac);                               // manifold to HE OUT

  // ── Twin wellheads ──
  for (const [x, y] of [W1, W2]) {
    rr(x - 22, y - 22, 44, 44, 3, '#22252a', '#141618', 1.4);
    ctx.strokeStyle = 'rgba(120,126,136,0.45)'; ctx.lineWidth = 0.7 * k;
    for (let q = -19; q <= 19; q += 4) { ctx.beginPath(); ctx.moveTo(U(x + q), U(y - 20)); ctx.lineTo(U(x + q), U(y + 20)); ctx.stroke(); }
    circ(x + 2, y + 3, 12, 'rgba(0,0,0,0.4)');
    const tg = ctx.createRadialGradient(U(x - 4), U(y - 4), U(1), U(x), U(y), U(12));
    tg.addColorStop(0, '#e8eef4'); tg.addColorStop(1, '#5a646e');
    circ(x, y, 11, tg, '#1e2226', 1.2);
    rr(x - 20, y - 4, 40, 8, 2, '#8a949e', '#2a2e34', 0.9);
    wheel(x - 17, y, 5, '#d04a3a'); wheel(x + 17, y, 5, '#d04a3a'); wheel(x, y, 6.5, '#e05a40');
    circ(x + 8, y - 13, 4.4, '#f4f4ee', '#2a2e34', 0.9);
    const nd = (on ? 0.6 + 0.08*Math.sin(t*3.1 + x) + 0.04*Math.sin(t*11) : -0.9) + fill * 0.4;
    ctx.strokeStyle = '#c02020'; ctx.lineWidth = 0.8 * k; ctx.beginPath(); ctx.moveTo(U(x + 8), U(y - 13)); ctx.lineTo(U(x + 8 + Math.cos(nd - 2)*3.4), U(y - 13 + Math.sin(nd - 2)*3.4)); ctx.stroke();
  }

  // ── Compressor hall: standing-seam roof, two big fans ──
  shadow(CH.x, CH.y, CH.w, CH.h, 4);
  const rg = ctx.createLinearGradient(0, U(CH.y), 0, U(CH.y + CH.h));
  rg.addColorStop(0, '#5e6a78'); rg.addColorStop(1, '#3c4652');
  rr(CH.x, CH.y, CH.w, CH.h, 4, rg, '#1a2028', 1.4);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.8 * k;
  for (let x = CH.x + 6; x < CH.x + CH.w; x += 6) { ctx.beginPath(); ctx.moveTo(U(x), U(CH.y + 2)); ctx.lineTo(U(x), U(CH.y + CH.h - 2)); ctx.stroke(); }
  fan(CH.x + 32, CH.y + CH.h / 2, 20);
  fan(CH.x + 88, CH.y + CH.h / 2, 20);
  rr(CH.x + 55, CH.y + 8, 10, CH.h - 16, 2, '#2a3038', '#14181c', 0.8);           // vent ridge

  // ── Cryogenic cold box: frosted column, rings, walkway ──
  circ(CB.x + 8, CB.y + 10, CB.r + 4, 'rgba(0,0,0,0.35)');
  circ(CB.x, CB.y, CB.r + 6, '#2c3440', '#161c24', 1.4);                           // walkway deck
  ctx.strokeStyle = '#8a96a4'; ctx.lineWidth = 1.2 * k;                             // handrail
  ctx.beginPath(); ctx.arc(U(CB.x), U(CB.y), U(CB.r + 5), 0, Math.PI*2); ctx.stroke();
  const cg = ctx.createRadialGradient(U(CB.x - 16), U(CB.y - 18), U(4), U(CB.x), U(CB.y), U(CB.r));
  cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.45, '#d8f2ff'); cg.addColorStop(1, '#6a9ab8');
  circ(CB.x, CB.y, CB.r, cg, '#2a4a60', 1.4);
  ctx.strokeStyle = 'rgba(40,90,120,0.35)'; ctx.lineWidth = 1 * k;                  // stiffening rings
  for (const r of [CB.r * 0.78, CB.r * 0.56, CB.r * 0.34]) { ctx.beginPath(); ctx.arc(U(CB.x), U(CB.y), U(r), 0, Math.PI*2); ctx.stroke(); }
  rr(CB.x - 3, CB.y - CB.r - 8, 6, 20, 1, '#5a646e', '#22262c', 0.6);               // ladder cage
  // Frost: glints that come and go while it separates.
  if (flowing) for (let q = 0; q < 12; q++) {
    const a = q * 2.399 + 0.3, rad = CB.r * (0.25 + ((q * 37) % 10) / 14);
    const gl = Math.max(0, Math.sin(t * 2.2 + q * 1.7));
    if (gl < 0.4) continue;
    const gx = CB.x + Math.cos(a) * rad, gy = CB.y + Math.sin(a) * rad;
    ctx.strokeStyle = `rgba(255,255,255,${(gl * 0.9).toFixed(3)})`; ctx.lineWidth = 0.8 * k;
    ctx.beginPath(); ctx.moveTo(U(gx - 3), U(gy)); ctx.lineTo(U(gx + 3), U(gy)); ctx.moveTo(U(gx), U(gy - 3)); ctx.lineTo(U(gx), U(gy + 3)); ctx.stroke();
  }
  circ(CB.x, CB.y, 10, '#eaf6ff', '#4a7a98', 1);                                    // top head
  circ(CB.x, CB.y, 4, on ? accent : '#5a6a78');

  // ── Horton spheres: gloss, saddle legs, ring gauge on the buffer ──
  for (const sp of SP) {
    for (let q = 0; q < 6; q++) { const a = q * Math.PI / 3 + 0.5; circ(sp.x + Math.cos(a) * (sp.r + 2), sp.y + Math.sin(a) * (sp.r + 2), 3, '#4a525c', '#1e2228', 0.6); }
    circ(sp.x + 6, sp.y + 8, sp.r, 'rgba(0,0,0,0.35)');
    const sg = ctx.createRadialGradient(U(sp.x - sp.r * 0.4), U(sp.y - sp.r * 0.45), U(2), U(sp.x), U(sp.y), U(sp.r));
    sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.4, '#f2eaf8'); sg.addColorStop(1, '#8a7ea0');
    circ(sp.x, sp.y, sp.r, sg, '#3a3048', 1.3);
    ctx.strokeStyle = 'rgba(144,224,255,0.6)'; ctx.lineWidth = 2.4 * k;             // cyan equator band
    ctx.beginPath(); ctx.ellipse(U(sp.x), U(sp.y), U(sp.r - 1), U(sp.r * 0.28), 0, 0, Math.PI*2); ctx.stroke();
    ctx.lineWidth = 3 * k; ctx.strokeStyle = 'rgba(20,16,28,0.7)';                    // gauge track
    ctx.beginPath(); ctx.arc(U(sp.x), U(sp.y), U(sp.r * 0.55), -Math.PI / 2, Math.PI * 1.5); ctx.stroke();
    if (fill > 0) {
      ctx.strokeStyle = on ? (fill > 0.95 && Math.sin(t*6) > 0 ? '#ff6050' : lilac) : '#6a5a78';
      ctx.beginPath(); ctx.arc(U(sp.x), U(sp.y), U(sp.r * 0.55), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fill); ctx.stroke();
    }
  }
  rr(SP[0].x + SP[0].r - 6, oY - 10, 12, 20, 3, '#5a5e66', '#22262c', 0.9);         // outlet manifold block

  // ── Control room ──
  const CR = { x: 22, y: 220, w: 92, h: 78 };
  shadow(CR.x, CR.y, CR.w, CR.h, 4);
  rr(CR.x, CR.y, CR.w, CR.h, 4, '#d4d8dc', '#5a6068', 1.2);
  rr(CR.x + 4, CR.y + 4, CR.w - 8, CR.h - 8, 2, '#b8bec6');
  for (let q = 0; q < 4; q++) rr(CR.x + 10 + q * 20, CR.y + 10, 14, 9, 1, on && night ? '#ffe8a8' : '#3a4a5a', '#2a2e34', 0.5);   // skylights
  rr(CR.x + 10, CR.y + 30, 34, 22, 2, '#8a929c', '#3a4048', 0.8);                    // AC units
  fan(CR.x + 27, CR.y + 41, 7);
  rr(CR.x + 52, CR.y + 30, 30, 38, 2, '#9aa2ac', '#3a4048', 0.8);
  circ(CR.x + 67, CR.y + 49, 6, '#c8d0d8', '#3a4048', 0.8);                           // mast base
  circ(CR.x + 67, CR.y + 49, 2.4, on && Math.sin(t * 5) > 0 ? '#ff4040' : '#601818');  // mast beacon
  if (on && night) {
    const gx = U(CR.x + CR.w / 2), gy = U(CR.y + 14);
    const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, U(40));
    gg.addColorStop(0, 'rgba(255,220,150,0.3)'); gg.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = gg; ctx.fillRect(gx - U(40), gy - U(40), U(80), U(80));
  }

  // ── Flare stack (top down) ──
  for (const [gx, gy] of [[FX - 22, FY - 18], [FX + 20, FY - 20], [FX + 6, FY + 26]]) {
    ctx.strokeStyle = 'rgba(30,30,30,0.6)'; ctx.lineWidth = 0.6 * k;
    ctx.beginPath(); ctx.moveTo(U(FX), U(FY)); ctx.lineTo(U(gx), U(gy)); ctx.stroke();
    circ(gx, gy, 1.6, '#5a5a5a');
  }
  circ(FX + 2, FY + 2, 7, 'rgba(0,0,0,0.35)');
  circ(FX, FY, 6.5, '#5a5e64', '#22262a', 0.9);
  circ(FX, FY, 3.4, '#1a1a1a');
  ctx.restore();

  // World space: cold mist off the column, the flare flame, compressor heat.
  const [cwx, cwy] = f.toWorld(U(CB.x), U(CB.y));
  if (flowing) {
    for (let i = 0; i < 7; i++) {
      const ph = (t * 0.22 + i / 7) % 1;
      const mx = cwx + Math.sin(i * 2.1 + t * 0.6) * 10 * S + (i - 3) * 4 * S;
      const my = cwy - ph * 70 * S;
      const mr = (10 + ph * 26) * S;
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
      mg.addColorStop(0, `rgba(230,248,255,${(0.32 * (1 - ph)).toFixed(3)})`); mg.addColorStop(1, 'rgba(230,248,255,0)');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI*2); ctx.fill();
    }
    if (night) {
      const ng = ctx.createRadialGradient(cwx, cwy, 0, cwx, cwy, 60 * S);
      ng.addColorStop(0, 'rgba(144,224,255,0.22)'); ng.addColorStop(1, 'rgba(144,224,255,0)');
      ctx.fillStyle = ng; ctx.fillRect(cwx - 60*S, cwy - 60*S, 120*S, 120*S);
    }
  }
  const [fwx, fwy] = f.toWorld(U(FX), U(FY));
  if (flowing) {
    const fl = 0.75 + 0.25*Math.sin(t*13) * Math.sin(t*7.3);
    const lean = Math.sin(t * 0.7) * 3 * S;
    if (night) {
      const hg = ctx.createRadialGradient(fwx, fwy - 8*S, 0, fwx, fwy - 8*S, 40*S);
      hg.addColorStop(0, 'rgba(255,150,60,0.32)'); hg.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = hg; ctx.fillRect(fwx - 40*S, fwy - 48*S, 80*S, 80*S);
    }
    const g = ctx.createRadialGradient(fwx + lean, fwy - 11*S, 0, fwx + lean, fwy - 11*S, 15*S*fl);
    g.addColorStop(0, 'rgba(255,248,200,0.98)'); g.addColorStop(0.45, 'rgba(255,150,50,0.8)'); g.addColorStop(1, 'rgba(255,70,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(fwx + lean, fwy - 11*S, 7*S*fl, 15*S*fl, lean * 0.02, 0, Math.PI*2); ctx.fill();
  } else if (on) {
    ctx.fillStyle = 'rgba(120,170,255,0.8)'; ctx.beginPath(); ctx.arc(fwx, fwy - 2*S, 2*S, 0, Math.PI*2); ctx.fill();
  }
  for (const fx of [CH.x + 32, CH.x + 88]) {
    const [hx, hy] = f.toWorld(U(fx), U(CH.y + CH.h / 2));
    _wfSmoke(hx, hy, S * 0.4, t, '235,230,245', flowing, 0.25);
  }

  _frameText(f, U(CB.x), U(CB.y + CB.r * 0.62), 'He', `bold ${Math.max(6, 9*S)}px Courier New`, on ? '#2a5a7a' : '#5a6a78');
  for (const sp of SP) _frameText(f, U(sp.x), U(sp.y), 'He', `bold ${Math.max(5, 7*S)}px Courier New`, on ? '#6a4a88' : '#6a6070');
  if (st) _portPipe(_portAnchor(e, px, py, f.W, f.H, st.heliumOut), S, t, { fluid: lilac, label: 'HE OUT', on: !!e._heliumPipeOut, out: true, flow: !!e._heliumPipeOut });
  const plx = px + f.W / 2, ply = f.rot === 1 ? py + 11*S : py + f.H - 11*S;
  _wfPlate(e._oreDepleted ? 'FIELD EXHAUSTED' : 'HELIUM WELL MK2', plx, ply, S, e._oreDepleted ? '#ff6040' : accent, on);
  _wfLamp(px + f.W - 8*S, py + 8*S, S, t, accent, on);
  _wfLamp(px + 8*S, py + 8*S, S, t + 1.5, accent, on);
  ctx.restore();
}

function renderCryoPlant(e, px, py, t) {
  // Helium liquefaction plant, laid out the way the helium moves:
  //  • HE IN feeds a white recovery gas bag that swells with the buffer
  //    (real plants keep one to catch every boil-off breath), then the
  //    compressor hall: six roof fans over the screw compressors, with a
  //    ten-fan bank of air coolers shedding their heat in a shimmer.
  //  • Twin purifier columns take turns: one frosted and online, the other
  //    glowing as it regenerates, swapping every 30 s. An LN₂ tank precools.
  //  • The heart of it is the cold box: a great round frost-furred cryostat
  //    on a grated deck, four turbo-expanders spinning round its rim, LEDs
  //    chasing round its shell, and through a viewport the superfluid helium
  //    turning in a slow cyan vortex round a glowing core. Every few seconds
  //    a cold front ripples out across the slab.
  //  • Liquid goes down frost-banded vacuum-jacketed lines to the LHe sphere,
  //    whose gauge follows the liquid buffer and whose relief stack vents
  //    when full, and to a storage dewar and a rack of transport dewars.
  //  • A control room watches it all. Tripped, the fans stop, the fog
  //    clears, the cryostat warms red and beacons flash until the
  //    compressors restart.
  // Authored in a 400×360 box stretched to the footprint, so plants built
  // at the old 16×14 or 10×9 in an existing save draw the same design. Drawn
  // in the unrotated frame (_plantFrame), ports where CryoPlantSystem.getStubs has them.
  const f = _plantFrame(e, px, py, T.CRYOPLANT);
  const w = f.bw, h = f.bh;
  const kx = w / 400, ky = h / 360, km = Math.min(kx, ky);
  const X = u => u * kx, Y = v => v * ky, Rr = r => r * km;
  const on = !!e.powered;
  // Running (fans, expanders, cold box, gas lines) only with helium gas on
  // HE IN: powered compressors with nothing to liquefy stand idle.
  const run = on && !e._tripped && !!e._hasHeliumSource;
  const tripped = !!e._tripped;
  const def = EntityDefs[T.CRYOPLANT];
  const fill = Math.min(1, (e._liquidHe || 0) / (def.liquidHeCapacity || 500));
  const S = TILE / 40;
  const night = typeof DayNight !== 'undefined' && DayNight.darkness() > 0.3;
  const detail = typeof Camera === 'undefined' || Camera.zoom > 0.5;
  const accent = '#b8f0ff';
  const st = (typeof CryoPlantSystem !== 'undefined' && e.col !== undefined) ? CryoPlantSystem.getStubs(e) : null;
  const inV  = (2 * TILE + TILE/2) / ky;                                       // HE IN row, in units
  const outV = (Math.floor(Math.round(h / TILE) / 2) * TILE + TILE/2) / ky;    // LHe OUT row, in units
  const seed = (e.col || 0) * 0.37 + (e.row || 0) * 0.11;
  const rect = (x, y, ww, hh, r, fillC, strokeC, lw = 1) => {
    ctx.beginPath(); ctx.roundRect(X(x), Y(y), ww * kx, hh * ky, Rr(r));
    if (fillC) { ctx.fillStyle = fillC; ctx.fill(); }
    if (strokeC) { ctx.strokeStyle = strokeC; ctx.lineWidth = lw * km; ctx.stroke(); }
  };
  const circ = (x, y, r, fillC, strokeC, lw = 1) => {
    ctx.beginPath(); ctx.arc(X(x), Y(y), Rr(r), 0, Math.PI*2);
    if (fillC) { ctx.fillStyle = fillC; ctx.fill(); }
    if (strokeC) { ctx.strokeStyle = strokeC; ctx.lineWidth = lw * km; ctx.stroke(); }
  };
  const glow = (x, y, r, rgb, a) => {
    if (a <= 0.005) return;
    const g = ctx.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), Rr(r));
    g.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(X(x) - Rr(r), Y(y) - Rr(r), Rr(r) * 2, Rr(r) * 2);
  };
  const shadow = (x, y, ww, hh, r) => { ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.roundRect(X(x) + Rr(4), Y(y) + Rr(5), ww * kx, hh * ky, Rr(r)); ctx.fill(); };
  const pipe = (pts, live, col) => _wfPipe(pts.map(([x, y]) => [X(x), Y(y)]), S * Math.max(1, km), t, live, col);
  // Vacuum-jacketed transfer line: fat and silver, with frost bands and a
  // creeping white bloom while it runs.
  const coldLine = (pts) => {
    const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.stroke(); };
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = Rr(10); ctx.save(); ctx.translate(Rr(2), Rr(3)); path(); ctx.restore();
    ctx.strokeStyle = '#3a4650'; ctx.lineWidth = Rr(10); path();
    ctx.strokeStyle = '#c8d4dc'; ctx.lineWidth = Rr(7); path();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Rr(1.8); path();
    if (run) {
      ctx.strokeStyle = 'rgba(240,252,255,0.75)'; ctx.lineWidth = Rr(11); ctx.setLineDash([Rr(2), Rr(5)]); ctx.lineDashOffset = -t * Rr(3); path();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      ctx.strokeStyle = 'rgba(120,230,255,0.35)'; ctx.lineWidth = Rr(3); path();
    }
  };
  // Vertical dewar seen from above: frosted dome, collar, lit cap.
  const dewar = (x, y, r, lit) => {
    circ(x + 2, y + 3, r, 'rgba(0,0,0,0.35)');
    const g = ctx.createRadialGradient(X(x - r*0.4), Y(y - r*0.4), Rr(r*0.1), X(x), Y(y), Rr(r));
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#d4e2ea'); g.addColorStop(1, '#6a7e8c');
    circ(x, y, r, g, '#34444e', 1);
    circ(x, y, r * 0.55, null, 'rgba(60,80,96,0.45)', 0.8);
    circ(x, y, r * 0.25, lit ? '#9af0ff' : '#5a6a74', '#2a3440', 0.6);
  };

  // Cryostat state: the core and vortex glow cyan while running, warm to
  // a sullen red while tripped.
  const coreRGB = tripped ? '255,90,60' : '120,230,255';
  const breathe = 0.75 + 0.25 * Math.sin(t * 1.6 + seed);

  ctx.save();
  ctx.save(); f.apply();

  // ── Slab ──
  shadow(4, 4, 392, 352, 8);
  const sg = ctx.createLinearGradient(0, 0, X(400), Y(360));
  sg.addColorStop(0, '#5a6066'); sg.addColorStop(1, '#40464c');
  rect(4, 4, 392, 352, 8, sg, '#22262a', 1.4);
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  for (let x = 44; x < 396; x += 40) ctx.fillRect(X(x), Y(5), Rr(0.7), 350 * ky);              // expansion joints
  for (let y = 44; y < 356; y += 40) ctx.fillRect(X(5), Y(y), 390 * kx, Rr(0.7));
  ctx.fillStyle = 'rgba(80,160,90,0.35)';                                                      // painted walkways
  ctx.fillRect(X(150), Y(8), 6 * kx, 344 * ky);
  ctx.fillRect(X(8), Y(240), 142 * kx, 6 * ky);
  ctx.fillRect(X(156), Y(264), 144 * kx, 6 * ky);
  // hazard border round the cold zone
  ctx.save(); ctx.beginPath(); ctx.rect(X(160), Y(14), 142 * kx, 246 * ky); ctx.rect(X(164), Y(18), 134 * kx, 238 * ky); ctx.clip('evenodd');
  ctx.fillStyle = '#1a1608'; ctx.fillRect(X(160), Y(14), 142 * kx, 246 * ky);
  ctx.fillStyle = '#d8a820';
  for (let i = -260; i < 420; i += 10) { ctx.beginPath(); ctx.moveTo(X(160 + i), Y(260)); ctx.lineTo(X(165 + i), Y(260)); ctx.lineTo(X(165 + i + 246), Y(14)); ctx.lineTo(X(160 + i + 246), Y(14)); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  // frost bloom on the cold zone floor
  if (run) {
    const fz = ctx.createRadialGradient(X(232), Y(150), Rr(30), X(232), Y(150), Rr(130));
    fz.addColorStop(0, `rgba(215,245,255,${(0.28 * breathe).toFixed(3)})`); fz.addColorStop(1, 'rgba(215,245,255,0)');
    ctx.fillStyle = fz; ctx.fillRect(X(164), Y(18), 134 * kx, 238 * ky);
  }
  // Cold front: a ring that ripples out from the cryostat every few seconds.
  if (run && detail) {
    const ph = (t * 0.22 + seed) % 1;
    ctx.save(); ctx.beginPath(); ctx.rect(X(8), Y(8), 384 * kx, 344 * ky); ctx.clip();
    ctx.strokeStyle = `rgba(190,240,255,${(0.45 * (1 - ph)).toFixed(3)})`; ctx.lineWidth = Rr(2 + 4 * (1 - ph));
    ctx.beginPath(); ctx.arc(X(232), Y(150), Rr(66 + ph * 150), 0, Math.PI*2); ctx.stroke();
    ctx.restore();
  }

  // Pipework under the kit: HE IN → gas bag → compressors → purifiers →
  // cold box; the cold box's liquid out → sphere → LHe OUT.
  const heGas = 'rgba(240,184,255,0.95)';
  pipe([[0, inV], [20, inV], [20, 62], [30, 62]], !!e._hasHeliumSource, heGas);
  pipe([[78, 108], [78, 126]], !!e._hasHeliumSource, heGas);
  pipe([[146, 190], [182, 190], [182, 62]], run, 'rgba(240,200,255,0.9)');                    // compressed gas up to the purifiers
  pipe([[196, 46], [204, 46]], run, 'rgba(220,235,255,0.9)');
  pipe([[218, 62], [218, 98]], run, 'rgba(220,235,255,0.9)');                                  // clean gas into the cold box
  pipe([[272, 62], [272, 102]], run, 'rgba(200,240,255,0.9)');                                 // LN₂ to the cold box
  pipe([[146, 296], [160, 296]], on, 'rgba(255,220,120,0.8)');                                 // control cabling

  // ── Recovery gas bag ──
  const bag = (e._hasHeliumSource ? 0.8 : 0.5) + 0.08 * Math.sin(t * 0.4);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(X(82), Y(66), Rr(40 * bag + 4), Rr(34 * bag + 4), 0, 0, Math.PI*2); ctx.fill();
  rect(30, 16, 96, 92, 5, 'rgba(70,74,80,0.6)', '#2a2e32', 0.9);                              // the bag's frame
  for (const [cx, cy] of [[34, 20], [122, 20], [34, 104], [122, 104]]) circ(cx, cy, 2.4, '#7a8088', '#22262a', 0.6);
  const bg = ctx.createRadialGradient(X(68), Y(48), 0, X(78), Y(60), Rr(44 * bag));
  bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.6, '#e8e4f0'); bg.addColorStop(1, '#a8a0b8');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(X(78), Y(62), Rr(42 * bag), Rr(36 * bag), 0, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = 'rgba(120,110,140,0.4)'; ctx.lineWidth = Rr(0.7);
  for (let q = -2; q <= 2; q++) { ctx.beginPath(); ctx.ellipse(X(78), Y(62), Rr(42 * bag * Math.abs(q) / 2.5 + 0.5), Rr(36 * bag), 0, -Math.PI/2, Math.PI/2, q < 0); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(200,140,255,0.55)'; ctx.lineWidth = Rr(2);                          // lilac seam band
  ctx.beginPath(); ctx.ellipse(X(78), Y(62), Rr(42 * bag), Rr(12 * bag), 0, 0, Math.PI*2); ctx.stroke();

  // ── Compressor hall: six roof fans ──
  shadow(14, 126, 132, 108, 3);
  const ch = ctx.createLinearGradient(0, Y(126), 0, Y(234));
  ch.addColorStop(0, '#62727f'); ch.addColorStop(1, '#46545f');
  rect(14, 126, 132, 108, 3, ch, '#1a222a', 1);
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; for (let x = 18; x < 144; x += 6) ctx.fillRect(X(x), Y(128), Rr(0.8), 104 * ky);    // standing-seam roof
  rect(12, 124, 136, 4, 1, '#3a4652');
  for (let q = 0; q < 6; q++) {
    const fx = 36 + (q % 3) * 44, fy = 154 + Math.floor(q / 3) * 52;
    rect(fx - 18, fy - 18, 36, 36, 3, '#2a343e', '#141a20', 0.8);
    _fcFan(X(fx), Y(fy), Rr(15), S * km, t + q * 0.7, run, 7 + q);
    circ(fx + 14, fy - 14, 1.9, tripped ? (Math.sin(t * 8 + q) > 0 ? '#ff3020' : '#501008') : run ? '#60ff90' : '#2a3a30');
  }
  if (run) glow(80, 180, 70, '255,200,140', night ? 0.08 : 0.04);

  // ── Air coolers: two rows of five fans, heat shimmer over them ──
  shadow(14, 252, 132, 96, 3);
  rect(14, 252, 132, 96, 3, '#4a525a', '#1a1e22', 1);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(X(16), Y(299), 128 * kx, Rr(1.2));
  for (let q = 0; q < 10; q++) {
    const fx = 30 + (q % 5) * 25, fy = 276 + Math.floor(q / 5) * 46;
    circ(fx, fy, 11.5, '#20282e', '#141a1e', 0.8);
    _fcFan(X(fx), Y(fy), Rr(10.5), S * km, t * 1.3 + q * 0.37, run, 9);
  }

  // ── Twin purifier columns: one online (frosted), one regenerating (hot) ──
  const regen = Math.floor(t / 30) % 2;
  [[182, 46], [218, 46]].forEach(([cx, cy], i) => {
    circ(cx + 3, cy + 4, 14, 'rgba(0,0,0,0.35)');
    const hot = run && i === regen;
    const cg = ctx.createRadialGradient(X(cx - 4), Y(cy - 4), Rr(1), X(cx), Y(cy), Rr(13));
    cg.addColorStop(0, hot ? '#fff0d8' : '#ffffff'); cg.addColorStop(0.6, hot ? '#d8a070' : '#c8dce6'); cg.addColorStop(1, hot ? '#8a4a2a' : '#6a8090');
    circ(cx, cy, 13, cg, '#2a3238', 1);
    circ(cx, cy, 3.2, '#5a646c');
    if (hot) glow(cx, cy, 24, '255,140,60', 0.25 + 0.08 * Math.sin(t * 2));
    else if (run) for (let q = 0; q < 6; q++) circ(cx + Math.cos(q * 1.05 + 0.3) * 9.5, cy + Math.sin(q * 1.05 + 0.3) * 9.5, 0.9, 'rgba(240,252,255,0.9)');
  });

  // ── LN₂ precooler ──
  circ(275, 49, 15, 'rgba(0,0,0,0.35)');
  const ng = ctx.createRadialGradient(X(266), Y(38), Rr(1), X(272), Y(46), Rr(14));
  ng.addColorStop(0, '#ffffff'); ng.addColorStop(1, '#8aa4b8');
  circ(272, 46, 14, ng, '#2a3a48', 1);
  circ(272, 46, 8, null, 'rgba(42,58,72,0.45)', 0.8);
  if (run) { ctx.strokeStyle = 'rgba(235,250,255,0.8)'; ctx.lineWidth = Rr(2.6); ctx.setLineDash([Rr(1.4), Rr(1.8)]); ctx.beginPath(); ctx.arc(X(272), Y(46), Rr(14.5), 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]); }

  // ── Transfer lines (cold box → sphere → LHe OUT; cold box → dewar → rack) ──
  const SX = 350, SY = 104, SR = 40;
  coldLine([[288, 140], [300, 140], [300, SY], [SX - SR, SY]]);
  coldLine([[SX, SY + SR], [SX, outV], [400, outV]]);
  coldLine([[232, 212], [232, 226]]);
  coldLine([[300, 238], [318, 238], [318, 252]]);

  // ── The cold box: a great round cryostat on a grated deck ──
  const CX = 232, CY = 150, CR = 54;
  circ(CX + 6, CY + 8, CR + 10, 'rgba(0,0,0,0.35)');
  ctx.beginPath();                                                                               // octagonal deck
  for (let q = 0; q < 8; q++) { const a = q * Math.PI / 4 + Math.PI / 8; const xx = X(CX + Math.cos(a) * (CR + 12)), yy = Y(CY + Math.sin(a) * (CR + 12)); q ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
  ctx.closePath(); ctx.fillStyle = '#262e36'; ctx.fill(); ctx.strokeStyle = '#11161b'; ctx.lineWidth = Rr(1.4); ctx.stroke();
  if (detail) {
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(110,124,138,0.35)'; ctx.lineWidth = Rr(0.6); ctx.beginPath();
    for (let q = -70; q <= 70; q += 4) { ctx.moveTo(X(CX + q), Y(CY - 70)); ctx.lineTo(X(CX + q), Y(CY + 70)); }
    ctx.stroke(); ctx.restore();
  }
  circ(CX, CY, CR + 8, null, '#8a96a4', 1.2);                                                    // handrail
  // turbo-expanders round the rim, on the deck's diagonals
  [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75].forEach((a, i) => {
    const ex = CX + Math.cos(a) * (CR + 4), ey = CY + Math.sin(a) * (CR + 4);
    circ(ex + 1.5, ey + 2, 10, 'rgba(0,0,0,0.3)');
    circ(ex, ey, 10, '#7a8a96', '#2a3a46', 1);
    ctx.save(); ctx.translate(X(ex), Y(ey)); ctx.rotate(run ? t * (14 + i * 4) : 0.4 + i);
    ctx.strokeStyle = '#eef6fa'; ctx.lineWidth = Rr(1.4);
    for (let q = 0; q < 7; q++) { ctx.rotate(Math.PI * 2 / 7); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(Rr(5), Rr(1), Rr(8.5), Rr(3.5)); ctx.stroke(); }
    ctx.restore();
    circ(ex, ey, 2.6, run ? accent : '#2a3640');
  });
  // the shell
  const cb = ctx.createRadialGradient(X(CX - CR * 0.35), Y(CY - CR * 0.4), Rr(4), X(CX), Y(CY), Rr(CR));
  cb.addColorStop(0, '#ffffff'); cb.addColorStop(0.5, tripped ? '#ecdcd8' : '#dcecf4'); cb.addColorStop(1, tripped ? '#8a6a66' : '#6a8ea4');
  circ(CX, CY, CR, cb, '#2a4a60', 1.6);
  ctx.strokeStyle = 'rgba(40,90,120,0.3)'; ctx.lineWidth = Rr(0.8);                              // vacuum ribs
  ctx.beginPath();
  for (let q = 0; q < 12; q++) { const a = q * Math.PI / 6; ctx.moveTo(X(CX + Math.cos(a) * 26), Y(CY + Math.sin(a) * 26)); ctx.lineTo(X(CX + Math.cos(a) * (CR - 2)), Y(CY + Math.sin(a) * (CR - 2))); }
  ctx.stroke();
  circ(CX, CY, CR * 0.78, null, 'rgba(40,90,120,0.3)', 1);
  // frost sparkles across the shell
  if (run) for (let q = 0; q < 30; q++) {
    const a = q * 2.399 + 0.3, rad = 28 + ((q * 37) % 23);
    const gl = Math.max(0, Math.sin(t * 2.4 + q * 1.7));
    if (gl < 0.35) continue;
    const gx = CX + Math.cos(a) * rad, gy = CY + Math.sin(a) * rad;
    ctx.strokeStyle = `rgba(255,255,255,${(gl * 0.9).toFixed(3)})`; ctx.lineWidth = Rr(0.8);
    ctx.beginPath(); ctx.moveTo(X(gx - 2.6), Y(gy)); ctx.lineTo(X(gx + 2.6), Y(gy)); ctx.moveTo(X(gx), Y(gy - 2.6)); ctx.lineTo(X(gx), Y(gy + 2.6)); ctx.stroke();
  }
  // LEDs chasing round the shell rim
  for (let q = 0; q < 28; q++) {
    const a = q * Math.PI * 2 / 28;
    const wave = (q / 28 - t * 0.35 + 10) % 1;
    const lit = !on ? 0.1 : tripped ? (Math.sin(t * 8) > 0 ? 0.9 : 0.2) : 0.25 + 0.75 * Math.pow(wave, 3);
    circ(CX + Math.cos(a) * (CR - 4), CY + Math.sin(a) * (CR - 4), 1.5, tripped ? `rgba(255,80,60,${lit.toFixed(3)})` : `rgba(140,235,255,${lit.toFixed(3)})`);
  }
  // the viewport: superfluid helium turning round a glowing core
  circ(CX, CY, 25, '#3a4a58', '#1a2630', 1.4);
  for (let q = 0; q < 10; q++) { const a = q * Math.PI / 5; circ(CX + Math.cos(a) * 23, CY + Math.sin(a) * 23, 1, '#a0aab4'); }
  circ(CX, CY, 20, '#040c14');
  if (on) {
    ctx.save(); ctx.beginPath(); ctx.arc(X(CX), Y(CY), Rr(20), 0, Math.PI*2); ctx.clip();
    const cg = ctx.createRadialGradient(X(CX), Y(CY), 0, X(CX), Y(CY), Rr(20));
    cg.addColorStop(0, `rgba(${coreRGB},${(run ? 0.9 * breathe : 0.6).toFixed(3)})`); cg.addColorStop(0.55, `rgba(${coreRGB},${(run ? 0.3 : 0.2).toFixed(3)})`); cg.addColorStop(1, `rgba(${coreRGB},0)`);
    ctx.fillStyle = cg; ctx.fillRect(X(CX) - Rr(20), Y(CY) - Rr(20), Rr(40), Rr(40));
    ctx.lineCap = 'round';
    const spin = run ? t * 0.9 : 0.5;
    for (let q = 0; q < 6; q++) {                                                                // vortex arms
      const a0 = spin + q * Math.PI / 3;
      ctx.strokeStyle = `rgba(${tripped ? '255,170,150' : '220,250,255'},${(run ? 0.55 : 0.25).toFixed(3)})`; ctx.lineWidth = Rr(1.3);
      ctx.beginPath();
      for (let s = 0; s <= 12; s++) { const u = s / 12, rr = 3 + u * 16, a = a0 + u * 2.2; const xx = X(CX + Math.cos(a) * rr), yy = Y(CY + Math.sin(a) * rr); s ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.restore();
    circ(CX, CY, 4.5, tripped ? '#ffd0c0' : '#ffffff');
  }
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.ellipse(X(CX - 8), Y(CY - 9), Rr(8), Rr(4), -0.6, 0, Math.PI*2); ctx.fill();   // glass glint
  if (on) glow(CX, CY, CR + 30, coreRGB, (night ? 0.28 : 0.12) * (run ? breathe : 0.7));

  // ── Storage dewar under the cold box ──
  shadow(166, 226, 134, 26, 13);
  const hg = ctx.createLinearGradient(0, Y(226), 0, Y(252));
  hg.addColorStop(0, '#f2f8fb'); hg.addColorStop(0.4, '#ffffff'); hg.addColorStop(1, '#7a8e9a');
  rect(166, 226, 134, 26, 13, hg, '#34444e', 1);
  for (const sx of [184, 226, 268]) rect(sx, 224, 5, 30, 1, '#3a4048');
  rect(196, 233, 72, 10, 5, '#10181e', '#34444e', 0.6);                                          // sight glass
  if (fill > 0) rect(197, 234, 70 * fill, 8, 4, on ? `rgba(160,240,255,${(0.7 + 0.3 * breathe).toFixed(3)})` : 'rgba(80,110,124,0.7)');

  // ── Control room ──
  shadow(160, 278, 140, 68, 2);
  rect(160, 278, 140, 68, 2, '#c8ccd0', '#3a3e44', 1);
  rect(158, 276, 144, 5, 1, '#4a5058');
  for (let q = 0; q < 8; q++) rect(166 + q * 16.5, 288, 11, 8, 1, on ? (night ? '#ffe2a0' : '#7ab0c8') : '#2a3038', '#2a2e32', 0.5);
  rect(168, 304, 124, 34, 1.5, '#0c1418', '#2a3a44', 0.8);                                       // the big screen inside
  rect(171, 306, 46, 16, 2, '#081418', '#2a4a58', 1);                                            // the cold box's temperature readout
  if (run) glow(194, 314, 30, '120,220,255', night ? 0.3 : 0.14);
  if (on) {
    ctx.strokeStyle = tripped ? '#ff5040' : '#60e0ff'; ctx.lineWidth = Rr(1); ctx.beginPath();
    for (let q = 0; q <= 34; q++) { const xx = 222 + q * 2, yy = 318 + Math.sin(q * 0.5 + t * (tripped ? 6 : 1.5)) * (tripped ? 7 : 3); q ? ctx.lineTo(X(xx), Y(yy)) : ctx.moveTo(X(xx), Y(yy)); }
    ctx.stroke();
    ctx.fillStyle = tripped ? 'rgba(255,80,60,0.7)' : 'rgba(96,224,255,0.55)';                  // bar meters
    for (let q = 0; q < 8; q++) { const bh = run ? 4 + 4 * (0.5 + 0.5 * Math.sin(t * 2 + q)) : 2; ctx.fillRect(X(172 + q * 15), Y(336 - bh), 10 * kx, bh * ky); }
    if (night) glow(230, 310, 60, '255,220,160', 0.18);
  }
  ctx.strokeStyle = '#2a2e32'; ctx.lineWidth = Rr(0.8);                                         // antenna mast
  ctx.beginPath(); ctx.moveTo(X(292), Y(280)); ctx.lineTo(X(292), Y(266)); ctx.stroke();
  circ(292, 266, 1.3, on ? '#ff4030' : '#401010');

  // ── LHe storage sphere on its legs ──
  for (const [lx, ly] of [[-28, -24], [28, -24], [-28, 28], [28, 28]]) rect(SX + lx - 2.5, SY + ly - 2.5, 5, 5, 1, '#3a4048');
  circ(SX + 7, SY + 9, SR, 'rgba(0,0,0,0.35)');
  const dg = ctx.createRadialGradient(X(SX - SR * 0.4), Y(SY - SR * 0.4), Rr(SR * 0.1), X(SX), Y(SY), Rr(SR));
  dg.addColorStop(0, '#ffffff'); dg.addColorStop(0.55, '#d4e2ea'); dg.addColorStop(1, '#6a7e8c');
  circ(SX, SY, SR, dg, '#34444e', 1.5);
  ctx.strokeStyle = 'rgba(60,80,96,0.3)'; ctx.lineWidth = Rr(0.7);
  ctx.beginPath(); ctx.ellipse(X(SX), Y(SY), Rr(SR), Rr(SR * 0.35), 0, 0, Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(X(SX), Y(SY), Rr(SR * 0.35), Rr(SR), 0, 0, Math.PI*2); ctx.stroke();
  ctx.strokeStyle = 'rgba(140,230,255,0.55)'; ctx.lineWidth = Rr(2.6);                          // cyan equator band
  ctx.beginPath(); ctx.ellipse(X(SX), Y(SY), Rr(SR - 1), Rr(SR * 0.3), 0, 0, Math.PI*2); ctx.stroke();
  // level gauge: an arc round the sphere's rim
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#10181e'; ctx.lineWidth = Rr(3.8);
  ctx.beginPath(); ctx.arc(X(SX), Y(SY), Rr(SR - 5), Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
  if (fill > 0) {
    ctx.strokeStyle = !on ? '#4a6a78' : fill > 0.95 && Math.sin(t * 6) > 0 ? '#ff6050' : '#e8fcff'; ctx.lineWidth = Rr(2.2);
    ctx.beginPath(); ctx.arc(X(SX), Y(SY), Rr(SR - 5), Math.PI * 0.75, Math.PI * (0.75 + 1.5 * fill)); ctx.stroke();
  }
  ctx.lineCap = 'butt';
  if (run) glow(SX, SY, SR + 20, '150,230,255', night ? 0.22 : 0.1);

  // ── Relief vent stack, top right ──
  circ(SX + 34, 26, 7, 'rgba(0,0,0,0.35)');
  circ(SX + 32, 24, 6.5, '#7a8a96', '#2a3440', 1);
  circ(SX + 32, 24, 3, '#1a2228');
  pipe([[SX + 20, SY - SR + 10], [SX + 32, 30]], run && fill > 0.9, 'rgba(232,252,255,0.9)');

  // ── Transport dewar rack, bottom right ──
  shadow(310, 252, 80, 96, 3);
  rect(310, 252, 80, 96, 3, '#3a424a', '#1a1e22', 1);
  for (let q = 0; q < 6; q++) {
    const dx = 330 + (q % 2) * 40, dy = 272 + Math.floor(q / 2) * 28;
    dewar(dx, dy, 11, run && fill > (q + 1) / 7);
  }

  ctx.restore();

  // ── World-space effects: fog, vapour, shimmer, beacons, labels ──
  const W2 = (u, v) => f.toWorld(X(u), Y(v));
  if (run) {
    // cold fog rolling off the cryostat, the sphere and the dewar, drifting downwind
    const srcs = [[CX, CY + CR], [CX - CR, CY], [SX, SY + SR], [232, 252]];
    for (let q = 0; q < 12; q++) {
      const ph = (t * 0.06 + q / 12) % 1;
      const [fx, fy] = W2(...srcs[q % srcs.length]);
      const r = Rr(18 + ph * 36);
      const a = (night ? 0.26 : 0.34) * Math.sin(ph * Math.PI);
      const gx = fx + (ph * 70 - 24 + Math.sin(q * 2.3) * 16) * km, gy = fy + Math.sin(q * 1.7) * 12 * km + ph * 12 * km;
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
      g.addColorStop(0, `rgba(235,248,255,${a.toFixed(3)})`); g.addColorStop(1, 'rgba(235,248,255,0)');
      ctx.fillStyle = g; ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
    }
    // heat shimmer over the air coolers
    const [hx, hy] = W2(80, 270);
    _wfSmoke(hx, hy, S * km * 0.8, t, '255,240,220', true, 0.12);
    // vapour off the cold box head and the LN₂ tank
    const [vx, vy] = W2(CX, CY - CR + 6);
    _wfSmoke(vx, vy, S * km * 0.95, t, '240,250,255', true, 0.5);
    const [lx, ly] = W2(272, 40);
    _wfSmoke(lx, ly, S * km * 0.5, t + 1.3, '240,250,255', true, 0.35);
  }
  const [rvx, rvy] = W2(SX + 32, 24);
  _wfSmoke(rvx, rvy, S * km * 0.7, t + 0.5, '235,248,255', run && fill > 0.9, 0.6);         // relief stack lifts when full
  if (tripped) for (const [bu, bv] of [[16, 122], [300, 16], [388, 250], [CX, CY - CR - 10]]) {
    const [bx, by] = W2(bu, bv);
    const lit = Math.sin(t * 8 + bu) > 0;
    ctx.fillStyle = lit ? '#ff3020' : '#501008'; ctx.beginPath(); ctx.arc(bx, by, 2.4 * S * km, 0, Math.PI*2); ctx.fill();
    if (lit) { const g = ctx.createRadialGradient(bx, by, 0, bx, by, 20 * S * km); g.addColorStop(0, 'rgba(255,50,30,0.45)'); g.addColorStop(1, 'rgba(255,50,30,0)'); ctx.fillStyle = g; ctx.fillRect(bx - 20 * S * km, by - 20 * S * km, 40 * S * km, 40 * S * km); }
  }
  const tempTxt = !on ? '— — —' : tripped ? `${(4.2 + Math.min(4.8, (def.compressorRestartSeconds || 45) - (e._restart || 0)) * 0.1).toFixed(1)} K` : '4.2 K';
  _frameText(f, X(194), Y(314.5), tempTxt, `bold ${Math.max(5, 9 * S * km)}px Courier New`, !on ? '#2a4a58' : tripped ? '#ff6050' : '#9af0ff');
  _frameText(f, X(SX), Y(SY + 4), 'LHe', `bold ${Math.max(5, 10 * S * km)}px Courier New`, run ? '#2a5a78' : '#5a6870');
  _frameText(f, X(272), Y(46.5), 'LN₂', `bold ${Math.max(4, 6 * S * km)}px Courier New`, '#2a4a60');
  _frameText(f, X(78), Y(63), 'He', `bold ${Math.max(5, 10 * S * km)}px Courier New`, '#8a6aa8');

  if (st) {
    _portPipe(_portAnchor(e, px, py, f.W, f.H, st.heliumIn),  S, t, { fluid: '#f0b8ff', label: 'HE IN',   on: !!e._hasHeliumSource, out: false, flow: !!e._liquefying });
    _portPipe(_portAnchor(e, px, py, f.W, f.H, st.liquidOut), S, t, { fluid: '#e8fcff', label: 'LHe OUT', on: !!(e._liquidPipeLinked ?? e._liquidPipeOut), out: true, flow: !!e._liquidPipeOut });
  }
  // Nameplate along the world-bottom edge, or the top when LHe OUT is on
  // the bottom face (rot 1), so the labels never collide.
  const plx = px + f.W / 2, ply = f.rot === 1 ? py + 10 * S : py + f.H - 10 * S;
  _wfPlate(tripped ? `TRIPPED: ${Math.ceil(e._restart || 0)}s` : 'CRYO PLANT', plx, ply, S * Math.min(1.8, Math.max(1, km)), tripped ? '#ff5040' : accent, on);
  _wfLamp(px + f.W - 7*S, py + 7*S, S, t, tripped ? '#ff3020' : accent, on);
  _wfLamp(px + 7*S, py + 7*S, S, t + 1.5, tripped ? '#ff3020' : accent, on);
  ctx.restore();
}

function renderHe3Separator(e, px, py, t) {
  // Helium-3 isotope works, 18x18 (12x12 ones from older saves keep their
  // size; everything is laid out as fractions of the frame, so it scales).
  // Top-down. Helium gas arrives on HE IN, is compressed and stripped by a
  // twin molecular-sieve pair, precooled by LN2 dewars, and fed to the heart
  // of the plant: a great round cryostat. Inside its frosted shell, through
  // a viewing ring, superfluid helium-4 turns in a slow vortex (the heat
  // flush that carries He-4 away and leaves He-3 behind), and at the centre
  // a gold helium-3 core glows brighter as the buffer fills. Six vacuum-
  // jacketed distillation columns stand round it on a catwalk ring, spokes
  // running in; their stage lamps chase round the ring while it separates.
  // Product goes to three gold-banded spheres and a bottle rack, then HE-3
  // OUT. Helium-4 is pumped off by the vacuum skid and vented from twin
  // stacks; a radiator bank rejects the compressor heat; the control room's
  // mass-spec shows the He-3 peak. Drawn in the unrotated frame
  // (_plantFrame) - ports follow He3SeparatorSystem.getStubs.
  const f = _plantFrame(e, px, py, T.HE3SEPARATOR);
  const w = f.bw, h = f.bh, m = Math.min(w, h);
  const on = !!e.powered;
  const run = on && !!e._separating;
  const def = EntityDefs[T.HE3SEPARATOR];
  const fill = Math.min(1, (e._he3 || 0) / (def.he3Capacity || 300));
  const S = TILE / 40;
  const detail = Camera.zoom > 0.5;
  const accent = '#ffd0a0', GOLD = '#d8a850';
  const st = (typeof He3SeparatorSystem !== 'undefined' && e.col !== undefined) ? He3SeparatorSystem.getStubs(e) : null;
  const inY  = 2 * TILE + TILE/2;
  const outY = Math.floor(Math.round(h / TILE) / 2) * TILE + TILE/2;
  const HE  = 'rgba(240,190,255,0.95)', COLD = 'rgba(200,232,255,0.9)', PROD = 'rgba(255,214,160,0.95)';
  ctx.save();
  ctx.save(); f.apply();

  const disc = (x, y, r, c0, c1, c2, edge) => {
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.arc(x + r*0.12 + 2*S, y + r*0.16 + 3*S, r, 0, Math.PI*2); ctx.fill();
    const g = ctx.createRadialGradient(x - r*0.35, y - r*0.35, r*0.08, x, y, r);
    g.addColorStop(0, c0); g.addColorStop(0.62, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = edge || 'rgba(20,16,28,0.8)'; ctx.lineWidth = 1*S; ctx.stroke();
  };
  const glowAt = (x, y, r, rgb, a) => {
    if (a <= 0.01) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r*2, r*2);
  };

  // ── Slab: dark poured pad, tile joints, safety border, anchor bolts ──
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.roundRect(w*0.03 + 5*S, h*0.03 + 6*S, w*0.94, h*0.94, 6*S); ctx.fill();
  const sg = ctx.createLinearGradient(0, 0, w, h);
  sg.addColorStop(0, '#4e4a58'); sg.addColorStop(1, '#3a3644');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.roundRect(w*0.03, h*0.03, w*0.94, h*0.94, 6*S); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1*S;
  for (let q = 1; q < 9; q++) {
    ctx.beginPath(); ctx.moveTo(w*(0.03 + 0.94*q/9), h*0.04); ctx.lineTo(w*(0.03 + 0.94*q/9), h*0.96); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w*0.04, h*(0.03 + 0.94*q/9)); ctx.lineTo(w*0.96, h*(0.03 + 0.94*q/9)); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(232,180,60,0.4)'; ctx.lineWidth = 1.6*S; ctx.setLineDash([7*S, 5*S]);
  ctx.beginPath(); ctx.roundRect(w*0.045, h*0.045, w*0.91, h*0.91, 4*S); ctx.stroke(); ctx.setLineDash([]);
  if (detail) {
    ctx.fillStyle = '#8a8a96';
    for (const [bx, by] of [[0.04, 0.04], [0.96, 0.04], [0.04, 0.96], [0.96, 0.96]]) { ctx.beginPath(); ctx.arc(w*bx, h*by, 2*S, 0, Math.PI*2); ctx.fill(); }
  }

  // ── Layout ──
  const CX = w*0.47, CY = h*0.50;             // cryostat centre
  const R  = m*0.15;                           // cryostat outer shell
  const RC = m*0.235;                          // column ring radius
  const cR = m*0.034;                          // column radius
  const cols = [...Array(6)].map((_, i) => { const a = -Math.PI/2 + i*Math.PI/3; return [CX + Math.cos(a)*RC, CY + Math.sin(a)*RC, a]; });
  const cpX = w*0.06, cpY = h*0.085, cpW = w*0.15, cpH = h*0.12;          // feed compressor
  const sv  = [[w*0.245, h*0.075], [w*0.29, h*0.075]], svW = w*0.032, svH = h*0.14; // sieve pair
  const dw  = [[w*0.09, h*0.30], [w*0.17, h*0.30]], dwR = m*0.035;        // LN2 dewars
  const fans = [0.36, 0.45, 0.54, 0.63].map(x => [w*x, h*0.085]);        // radiator bank
  const vp  = { x: w*0.06, y: h*0.70, w: w*0.19, h: h*0.10 };            // vacuum skid
  const vents = [[w*0.10, h*0.88], [w*0.19, h*0.88]];                    // He-4 stacks
  const sph = [[w*0.855, h*0.17], [w*0.855, h*0.33]], spR = m*0.06;      // product spheres
  const sph3 = [w*0.775, h*0.25], sp3R = m*0.045;
  const rk  = { x: w*0.76, y: h*0.60, w: w*0.19, h: h*0.08 };            // bottle rack
  const cr  = { x: w*0.70, y: h*0.73, w: w*0.25, h: h*0.17 };            // control room

  // ── Catwalk ring (under everything round the cryostat) ──
  ctx.strokeStyle = 'rgba(20,18,26,0.55)'; ctx.lineWidth = m*0.05;
  ctx.beginPath(); ctx.arc(CX, CY, RC, 0, Math.PI*2); ctx.stroke();
  ctx.strokeStyle = 'rgba(150,140,170,0.35)'; ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.arc(CX, CY, RC - m*0.025, 0, Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(CX, CY, RC + m*0.025, 0, Math.PI*2); ctx.stroke();
  if (detail) {
    ctx.strokeStyle = 'rgba(150,140,170,0.22)';
    for (let q = 0; q < 48; q++) { const a = q/48*Math.PI*2; ctx.beginPath(); ctx.moveTo(CX + Math.cos(a)*(RC - m*0.025), CY + Math.sin(a)*(RC - m*0.025)); ctx.lineTo(CX + Math.cos(a)*(RC + m*0.025), CY + Math.sin(a)*(RC + m*0.025)); ctx.stroke(); }
  }

  // ── Pipework ──
  const mid = cpY + cpH/2;
  _wfPipe([[12*S, inY], [cpX, inY]], S, t, !!e._hasHeliumSource, HE);
  _wfPipe([[cpX + cpW, mid], [sv[0][0] - svW/2, mid]], S, t, run, HE);
  _wfPipe([[sv[0][0] + svW/2, mid], [sv[1][0] - svW/2, mid]], S, t, run, HE);
  _wfPipe([[sv[1][0] + svW/2, mid], [w*0.33, mid], [w*0.33, CY - R*0.6], [CX - R, CY - R*0.6]], S, t, run, HE);
  dw.forEach(([x, y]) => _wfPipe([[x, y + dwR], [x, h*0.40], [CX - R, h*0.40 + (x - dw[0][0])*0.2]], S, t + 0.2, run, COLD));
  cols.forEach(([x, y], i) => _wfPipe([[CX + (x - CX)*R/RC, CY + (y - CY)*R/RC], [x - (x - CX)*cR/RC, y - (y - CY)*cR/RC]], S, t + i*0.15, run, i % 2 ? PROD : COLD));
  _wfPipe([[CX + R, CY], [w*0.70, CY], [w*0.70, sph[1][1]], [sph[1][0] - spR, sph[1][1]]], S, t, run, PROD);
  _wfPipe([[w*0.70, sph3[1]], [sph3[0] - sp3R, sph3[1]]], S, t, run, PROD);
  _wfPipe([[sph[0][0], sph[0][1] + spR], [sph[1][0], sph[1][1] - spR]], S, t, run, PROD);
  _wfPipe([[sph[1][0], sph[1][1] + spR], [sph[1][0], outY], [w - 12*S, outY]], S, t, !!e._he3PipeOut, accent);
  _wfPipe([[w*0.92, outY], [w*0.92, rk.y]], S, t, run, PROD);
  _wfPipe([[CX, CY + R], [CX, h*0.86], [vents[1][0], h*0.86], [vents[1][0], vents[1][1] - 6*S]], S, t, run, 'rgba(210,210,222,0.8)');
  _wfPipe([[vp.x + vp.w*0.5, vp.y + vp.h], [vp.x + vp.w*0.5, h*0.86]], S, t, run, 'rgba(210,210,222,0.8)');

  // ── Feed compressor ──
  _wfShadow(cpX, cpY, cpW, cpH, S, 3*S);
  const cg = ctx.createLinearGradient(0, cpY, 0, cpY + cpH);
  cg.addColorStop(0, '#8a78a4'); cg.addColorStop(1, '#3a3050');
  ctx.fillStyle = cg; ctx.strokeStyle = '#1a1424'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.roundRect(cpX, cpY, cpW, cpH, 3*S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2a2238'; ctx.fillRect(cpX + cpW*0.55, cpY + cpH*0.14, cpW*0.4, cpH*0.72);
  ctx.strokeStyle = 'rgba(200,180,230,0.3)'; ctx.lineWidth = 0.8*S;
  for (let q = 1; q < 8; q++) { const fx = cpX + cpW*(0.55 + 0.4*q/8); ctx.beginPath(); ctx.moveTo(fx, cpY + cpH*0.16); ctx.lineTo(fx, cpY + cpH*0.84); ctx.stroke(); }
  _fcFan(cpX + cpW*0.27, cpY + cpH*0.5, Math.min(cpW, cpH)*0.3, S, t, on, 7);
  ctx.fillStyle = on ? '#50e090' : '#3a3228'; ctx.beginPath(); ctx.arc(cpX + cpW*0.93, cpY + cpH*0.18, 1.5*S, 0, Math.PI*2); ctx.fill();

  // ── Molecular-sieve pair: one on stream, one regenerating ──
  sv.forEach(([x, y], i) => {
    _wfShadow(x - svW/2, y, svW, svH, S, svW*0.5);
    const g = ctx.createLinearGradient(x - svW/2, 0, x + svW/2, 0);
    g.addColorStop(0, '#d0c4e0'); g.addColorStop(0.4, '#9a8cb0'); g.addColorStop(1, '#4a4058');
    ctx.fillStyle = g; ctx.strokeStyle = 'rgba(10,8,16,0.85)'; ctx.lineWidth = 1*S;
    ctx.beginPath(); ctx.roundRect(x - svW/2, y, svW, svH, svW*0.5); ctx.fill(); ctx.stroke();
    const onStream = run && (Math.floor(t*0.25) % 2 === i);
    ctx.fillStyle = onStream ? '#50e090' : (run ? '#ffb030' : '#3a3228');
    ctx.beginPath(); ctx.arc(x, y + svH*0.5, 1.8*S, 0, Math.PI*2); ctx.fill();
  });

  // ── LN2 precooler dewars ──
  dw.forEach(([x, y]) => {
    disc(x, y, dwR, '#f4fbff', '#a8c4d4', '#4a6070', '#2a3a48');
    ctx.fillStyle = run ? 'rgba(120,200,255,0.65)' : 'rgba(80,120,150,0.4)'; ctx.beginPath(); ctx.arc(x, y, dwR*0.42, 0, Math.PI*2); ctx.fill();
    if (run) glowAt(x, y, dwR*1.4, '140,210,255', 0.18);
  });

  // ── Radiator fan bank ──
  _wfShadow(w*0.32, h*0.045, w*0.35, h*0.08, S, 3*S);
  ctx.fillStyle = '#5a5e68'; ctx.strokeStyle = '#22242a'; ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.roundRect(w*0.32, h*0.045, w*0.35, h*0.08, 3*S); ctx.fill(); ctx.stroke();
  fans.forEach(([x, y], i) => _fcFan(x, y, m*0.032, S, t + i*0.7, run, 9));

  // ── Distillation columns round the ring ──
  const chase = run ? Math.floor(t*3) % 6 : -1;
  cols.forEach(([x, y], i) => {
    disc(x, y, cR, '#ffffff', '#c4d4de', '#5a6c78', '#3a4a56');
    ctx.strokeStyle = 'rgba(80,100,120,0.45)'; ctx.lineWidth = 0.9*S;
    ctx.beginPath(); ctx.arc(x, y, cR*0.68, 0, Math.PI*2); ctx.stroke();
    const lit = i === chase || i === (chase + 5) % 6;
    ctx.fillStyle = '#12100c'; ctx.beginPath(); ctx.arc(x, y, cR*0.36, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = i === chase ? accent : lit ? '#c08850' : run ? '#7a5a40' : '#3a3228';
    ctx.beginPath(); ctx.arc(x, y, cR*0.26, 0, Math.PI*2); ctx.fill();
    if (i === chase) glowAt(x, y, cR*2.2, '255,210,160', 0.45);
    if (run && detail) {   // frost specks on the jacket
      ctx.fillStyle = 'rgba(225,245,255,0.75)';
      for (let q = 0; q < 6; q++) { const a = q*1.05 + i; ctx.fillRect(x + Math.cos(a)*cR*0.82, y + Math.sin(a)*cR*0.82, 1.1*S, 1.1*S); }
    }
  });

  // ── The cryostat ──
  // frosted insulated shell
  ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.arc(CX + 5*S, CY + 7*S, R, 0, Math.PI*2); ctx.fill();
  const shell = ctx.createRadialGradient(CX - R*0.4, CY - R*0.45, R*0.1, CX, CY, R);
  shell.addColorStop(0, '#ffffff'); shell.addColorStop(0.55, '#d4e2ea'); shell.addColorStop(1, '#7c8e9a');
  ctx.fillStyle = shell; ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#3a4a56'; ctx.lineWidth = 1.4*S; ctx.stroke();
  // bolted flange ring
  ctx.strokeStyle = 'rgba(70,90,104,0.6)'; ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.arc(CX, CY, R*0.9, 0, Math.PI*2); ctx.stroke();
  if (detail) { ctx.fillStyle = '#6a7c88'; for (let q = 0; q < 24; q++) { const a = q/24*Math.PI*2; ctx.beginPath(); ctx.arc(CX + Math.cos(a)*R*0.95, CY + Math.sin(a)*R*0.95, 1.1*S, 0, Math.PI*2); ctx.fill(); } }
  // gold reinforcing bands
  ctx.strokeStyle = on ? GOLD : '#5a4a30'; ctx.lineWidth = 2*S;
  ctx.beginPath(); ctx.arc(CX, CY, R*0.78, 0, Math.PI*2); ctx.stroke();
  // viewing well
  const WR = R*0.66;
  ctx.fillStyle = '#060a14'; ctx.beginPath(); ctx.arc(CX, CY, WR, 0, Math.PI*2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(CX, CY, WR, 0, Math.PI*2); ctx.clip();
  const wellG = ctx.createRadialGradient(CX, CY, 0, CX, CY, WR);
  wellG.addColorStop(0, on ? 'rgba(60,120,200,0.55)' : 'rgba(30,40,60,0.4)'); wellG.addColorStop(1, 'rgba(10,20,40,0.2)');
  ctx.fillStyle = wellG; ctx.fillRect(CX - WR, CY - WR, WR*2, WR*2);
  // superfluid vortex: spiral arms turning slowly
  if (on) {
    const spin = run ? t*0.9 : t*0.12;
    for (let arm = 0; arm < 4; arm++) {
      ctx.strokeStyle = `rgba(170,225,255,${run ? 0.55 : 0.25})`; ctx.lineWidth = 1.4*S;
      ctx.beginPath();
      for (let q = 0; q <= 40; q++) {
        const u = q/40, rr = WR*(0.12 + 0.86*u), a = spin + arm*Math.PI/2 + u*3.2;
        const x = CX + Math.cos(a)*rr, y = CY + Math.sin(a)*rr;
        q ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    if (detail) {   // tracer specks riding the flow inward
      ctx.fillStyle = 'rgba(220,245,255,0.85)';
      for (let q = 0; q < 14; q++) {
        const u = 1 - ((t*(run ? 0.25 : 0.05) + q/14) % 1), rr = WR*(0.15 + 0.8*u), a = spin + q*2.4 + u*3.2;
        ctx.beginPath(); ctx.arc(CX + Math.cos(a)*rr, CY + Math.sin(a)*rr, 1.1*S, 0, Math.PI*2); ctx.fill();
      }
    }
  }
  ctx.restore();
  // the helium-3 core: grows and brightens with the buffer
  const coreR = WR*(0.2 + 0.18*fill);
  const pulse = run ? 0.75 + 0.25*Math.sin(t*2.6) : on ? 0.5 : 0.15;
  if (on) glowAt(CX, CY, WR*(0.7 + 0.4*fill), '255,200,120', 0.35*pulse*(0.4 + 0.6*fill));
  const cg3 = ctx.createRadialGradient(CX - coreR*0.3, CY - coreR*0.3, coreR*0.1, CX, CY, coreR);
  cg3.addColorStop(0, on ? '#fff6e0' : '#6a6050'); cg3.addColorStop(0.5, on ? '#ffd080' : '#5a4c38'); cg3.addColorStop(1, on ? '#c88830' : '#3a3024');
  ctx.globalAlpha = 0.6 + 0.4*pulse;
  ctx.fillStyle = cg3; ctx.beginPath(); ctx.arc(CX, CY, coreR, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
  // viewing-ring glass glint
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.arc(CX, CY, WR, Math.PI*1.1, Math.PI*1.45); ctx.stroke();
  ctx.strokeStyle = '#2a3a46'; ctx.lineWidth = 1.6*S; ctx.beginPath(); ctx.arc(CX, CY, WR, 0, Math.PI*2); ctx.stroke();
  // frost bloom on the shell while running
  if (run) {
    const fr = ctx.createRadialGradient(CX, CY, WR, CX, CY, R*1.15);
    fr.addColorStop(0, 'rgba(230,248,255,0)'); fr.addColorStop(0.6, 'rgba(230,248,255,0.22)'); fr.addColorStop(1, 'rgba(230,248,255,0)');
    ctx.fillStyle = fr; ctx.beginPath(); ctx.arc(CX, CY, R*1.15, 0, Math.PI*2); ctx.fill();
  }

  // ── Product spheres: gold-banded, gauges follow the buffer ──
  [[...sph[0], spR, 0], [...sph[1], spR, 1], [...sph3, sp3R, 2]].forEach(([x, y, r, i]) => {
    disc(x, y, r, '#ffffff', '#d6ccc0', '#6a5e50', '#3a3228');
    ctx.strokeStyle = on ? '#c89a50' : '#5a4a30'; ctx.lineWidth = 2*S;
    ctx.beginPath(); ctx.arc(x, y, r - 2.5*S, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = 'rgba(200,154,80,0.55)'; ctx.lineWidth = 1*S;
    ctx.beginPath(); ctx.ellipse(x, y, r - 2.5*S, (r - 2.5*S)*0.3, 0, 0, Math.PI*2); ctx.stroke();
    const share = Math.max(0, Math.min(1, fill*3 - i));   // they fill one after another
    const gx = x + r*0.45, gy0 = y - r*0.55, gh = r*1.1;
    ctx.fillStyle = '#16120e'; ctx.fillRect(gx, gy0, 2.6*S, gh);
    if (share > 0) { ctx.fillStyle = on ? accent : '#7a6a58'; ctx.fillRect(gx, gy0 + gh*(1 - share), 2.6*S, gh*share); }
    if (on && share > 0.02) glowAt(x, y, r*1.3, '255,210,150', 0.12*share);
  });

  // ── Bottle rack ──
  ctx.fillStyle = '#34303a'; ctx.beginPath(); ctx.roundRect(rk.x, rk.y, rk.w, rk.h, 2*S); ctx.fill();
  const nB = 9;
  for (let q = 0; q < nB; q++) {
    const bx = rk.x + rk.w*(q + 0.5)/nB, filled = (q + 1)/nB <= fill + 0.001;
    ctx.fillStyle = filled ? '#c8b088' : '#6a645c';
    ctx.beginPath(); ctx.roundRect(bx - rk.w/nB*0.34, rk.y + rk.h*0.12, rk.w/nB*0.68, rk.h*0.78, rk.w/nB*0.3); ctx.fill();
    ctx.fillStyle = filled && on ? '#e0b060' : '#4a4038'; ctx.fillRect(bx - rk.w/nB*0.34, rk.y + rk.h*0.18, rk.w/nB*0.68, 1.6*S);
  }

  // ── Vacuum pump skid ──
  _wfShadow(vp.x, vp.y, vp.w, vp.h, S, 3*S);
  ctx.fillStyle = '#3a3640'; ctx.strokeStyle = '#1a1620'; ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.roundRect(vp.x, vp.y, vp.w, vp.h, 3*S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#7a6a90'; ctx.beginPath(); ctx.roundRect(vp.x + vp.w*0.06, vp.y + vp.h*0.14, vp.w*0.34, vp.h*0.72, 3*S); ctx.fill();
  ctx.fillStyle = '#2a2a34'; ctx.beginPath(); ctx.roundRect(vp.x + vp.w*0.48, vp.y + vp.h*0.18, vp.w*0.46, vp.h*0.64, 6*S); ctx.fill();
  ctx.strokeStyle = 'rgba(160,180,210,0.3)'; ctx.lineWidth = 0.8*S;
  for (let q = 1; q < 7; q++) { const fx = vp.x + vp.w*(0.48 + 0.46*q/7); ctx.beginPath(); ctx.moveTo(fx, vp.y + vp.h*0.22); ctx.lineTo(fx, vp.y + vp.h*0.78); ctx.stroke(); }
  _fcFan(vp.x + vp.w*0.23, vp.y + vp.h*0.5, Math.min(vp.w, vp.h)*0.3, S, t, run, 5);

  // ── Helium-4 vent stacks ──
  vents.forEach(([x, y]) => {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x + 3*S, y + 4*S, 8*S, 4*S, 0, 0, Math.PI*2); ctx.fill();
    const g = ctx.createLinearGradient(x - 7*S, 0, x + 7*S, 0);
    g.addColorStop(0, '#8a8e94'); g.addColorStop(0.5, '#c8ccd0'); g.addColorStop(1, '#4a4e54');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 7*S, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#2a2e32'; ctx.lineWidth = 1*S; ctx.stroke();
    ctx.strokeStyle = '#d8b028'; ctx.lineWidth = 1.8*S; ctx.beginPath(); ctx.arc(x, y, 5*S, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = '#2a2e32'; ctx.beginPath(); ctx.arc(x, y, 3*S, 0, Math.PI*2); ctx.fill();
  });

  // ── Control room: windows, mass-spec screen with the He-3 peak ──
  _wfShadow(cr.x, cr.y, cr.w, cr.h, S, 3*S);
  ctx.fillStyle = on ? '#2e3038' : '#1e2026'; ctx.strokeStyle = '#14161a'; ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.roundRect(cr.x, cr.y, cr.w, cr.h, 3*S); ctx.fill(); ctx.stroke();
  const scr = { x: cr.x + cr.w*0.07, y: cr.y + cr.h*0.12, w: cr.w*0.58, h: cr.h*0.56 };
  ctx.fillStyle = '#0a0c10'; ctx.fillRect(scr.x, scr.y, scr.w, scr.h);
  ctx.strokeStyle = run ? 'rgba(255,210,160,0.9)' : 'rgba(110,90,70,0.5)'; ctx.lineWidth = 1.1*S;
  ctx.beginPath();
  for (let q = 0; q <= 30; q++) {
    const qx = scr.x + scr.w*(0.04 + 0.92*q/30);
    const pk1 = Math.exp(-Math.pow((q - 9)/1.8, 2)), pk2 = Math.exp(-Math.pow((q - 21)/1.8, 2))*(0.35 + 0.65*fill);
    const qy = scr.y + scr.h*0.9 - scr.h*0.75*(pk1*0.85 + pk2) - (run ? Math.sin(t*6 + q)*0.6*S : 0);
    q ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy);
  }
  ctx.stroke();
  if (run) glowAt(scr.x + scr.w/2, scr.y + scr.h/2, scr.w*0.6, '255,200,140', 0.12);
  for (let q = 0; q < 3; q++) {
    ctx.fillStyle = on ? (q === 2 ? (run ? accent : '#5a4c3c') : 'rgba(255,224,170,0.55)') : '#1a1c22';
    ctx.fillRect(cr.x + cr.w*0.71, cr.y + cr.h*(0.14 + q*0.25), cr.w*0.22, cr.h*0.16);
  }
  ctx.fillStyle = on ? '#50e090' : '#2c3a34'; ctx.fillRect(scr.x, cr.y + cr.h*0.78, cr.w*0.1, cr.h*0.1);
  ctx.fillStyle = run ? accent : '#5a4c3c'; ctx.fillRect(scr.x + cr.w*0.14, cr.y + cr.h*0.78, cr.w*0.1, cr.h*0.1);

  _wfHazardStripe(w*0.32, h*0.935, w*0.34, 4*S, S);
  ctx.restore();

  // ── World-space effects and labels ──
  vents.forEach(([x, y], i) => { const [sx, sy] = f.toWorld(x, y); _wfSmoke(sx, sy, S*0.7, t + i*0.5, '235,235,245', run, 0.45); });
  const [cvx, cvy] = f.toWorld(CX + R*0.6, CY - R*0.6);
  _wfSmoke(cvx, cvy, S*0.55, t + 0.3, '235,248,255', run, 0.35);
  _frameText(f, CX, CY + R + 10*S, 'CRYOSTAT · 1 K', `bold ${Math.max(4, 5.5*S)}px Courier New`, on ? '#8ab0c4' : '#4a5a66');
  _frameText(f, (dw[0][0] + dw[1][0])/2, dw[0][1] + dwR + 8*S, 'LN2', `bold ${Math.max(4, 5*S)}px Courier New`, '#4a6070');
  _frameText(f, sph[0][0] - spR*0.15, sph[0][1], '³He', `bold ${Math.max(5, 8*S)}px Courier New`, on ? '#7a5020' : '#6a6058');
  _frameText(f, (sv[0][0] + sv[1][0])/2, sv[0][1] + svH + 7*S, 'SIEVE', `bold ${Math.max(4, 4.5*S)}px Courier New`, '#6a5a80');
  _frameText(f, vp.x + vp.w*0.5, vp.y - 5*S, 'VAC', `bold ${Math.max(4, 4.5*S)}px Courier New`, '#5a5a6a');
  _frameText(f, cr.x + cr.w*0.36, cr.y - 5*S, 'MASS SPEC', `bold ${Math.max(4, 4.5*S)}px Courier New`, '#6a6a7a');

  if (st) {
    _portPipe(_portAnchor(e, px, py, f.W, f.H, st.heliumIn), S, t, { fluid: '#f0b8ff', label: 'HE IN',    on: !!e._hasHeliumSource, out: false, flow: run });
    _portPipe(_portAnchor(e, px, py, f.W, f.H, st.he3Out),   S, t, { fluid: accent,    label: 'HE-3 OUT', on: !!e._he3PipeOut, out: true, flow: !!e._he3PipeOut });
  }
  const [plx, ply] = f.toWorld(w*0.5, h*0.965);
  _wfPlate('HELIUM-3 SEPARATOR', plx, ply, S * Math.min(1.5, Math.max(1, m / (12 * TILE))), accent, on);
  _wfLamp(px + f.W - 7*S, py + 7*S, S, t, accent, on);
  ctx.restore();
}