/* ═══════════════════════════════════════════════════════════════════
   STEAM TURBINE MK2 — sprite
   A high-pressure tandem-compound set in a turbine hall, seen from above.
   Along the shaft (on the STEAM IN row from SteamTurbineSystem.getStubs):
   twin stop-valve chests, the HP and IP casings, three big double-flow LP
   casings with their blade discs turning behind sight windows, and a
   water-cooled generator with glowing cooling bands and an exciter. Two
   moisture-separator reheaters lie alongside the HP/IP end, crossover pipes
   arc over to the LPs, and an overhead gantry crane rides rails along the
   hall (it travels while the set runs, parked otherwise). Isolated-phase
   bus to a three-unit transformer yard, and a readout of the output. The
   rotor spins up and coasts down (e._spin / e._phase, render-only state,
   same as the MK1). Shares the _wf* / _fc* / _port* helpers.
   ═══════════════════════════════════════════════════════════════════ */

function renderSteamTurbine2(e, px, py, t) {
  const def = EntityDefs[T.STEAMTURBINE2];
  const W = (e.width || def.width) * TILE, H = (e.height || def.height) * TILE;
  const gen = !!e._generating;
  const connected = !!e._steamConnected;
  const S = TILE / 40;
  const accent = '#7af5ff', gold = '#ffd890';
  const TAU = Math.PI * 2;
  ctx.save();

  // Rotor inertia: ~3.5 s to spin up or coast down (a heavier rotor than the MK1's).
  const dtR = Math.max(0, Math.min(0.25, t - (e._spinT ?? t)));
  e._spinT = t;
  e._spin  = (e._spin ?? (gen ? 1 : 0)) + ((gen ? 1 : 0) - (e._spin ?? 0)) * Math.min(1, dtR / 3.5);
  e._phase = (e._phase || 0) + dtR * e._spin;
  const spin = e._spin, ph = e._phase, turning = spin > 0.02;

  const aIn = _portAnchor(e, px, py, W, H, SteamTurbineSystem.getStubs(e).steamIn);
  const ay = aIn.y;                                   // shaft axis
  const X = (f) => px + W * f;
  const deckX = X(0.02), deckW = W * 0.785;
  const deckY = Math.max(py + 6 * S, ay - H * 0.44), deckB = Math.min(py + H - 6 * S, ay + H * 0.40);
  const deckH = deckB - deckY;

  const cyl = (y0, y1, base) => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    const c = base === 'gen' ? ['#0e1c24', '#3a6070', '#9ad0e0', '#4a7888', '#0a141a']
            : base === 'msr' ? ['#1a2228', '#5a6e78', '#c8d6dc', '#6a808a', '#141c20']
            :                  ['#14222c', '#3e5a6c', '#a8c4d4', '#4e6c7e', '#0e181e'];
    [0, 0.3, 0.45, 0.6, 1].forEach((s, i) => g.addColorStop(s, c[i]));
    return g;
  };

  // ── Hall deck: polished floor, panel grid, walkways ──
  _wfShadow(deckX, deckY, deckW, deckH, S, 6 * S);
  const fg = ctx.createLinearGradient(0, deckY, 0, deckB);
  fg.addColorStop(0, '#3c4650'); fg.addColorStop(1, '#2a323a');
  ctx.fillStyle = fg; ctx.strokeStyle = '#12161a'; ctx.lineWidth = 2 * S;
  ctx.beginPath(); ctx.roundRect(deckX, deckY, deckW, deckH, 6 * S); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.roundRect(deckX, deckY, deckW, deckH, 6 * S); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = S;
  for (let x = deckX + 20 * S; x < deckX + deckW; x += 20 * S) { ctx.beginPath(); ctx.moveTo(x, deckY); ctx.lineTo(x, deckB); ctx.stroke(); }
  for (let y = deckY + 20 * S; y < deckB; y += 20 * S) { ctx.beginPath(); ctx.moveTo(deckX, y); ctx.lineTo(deckX + deckW, y); ctx.stroke(); }
  if (spin > 0.05) {   // light pooling under the train while it runs
    const lg = ctx.createRadialGradient(X(0.42), ay, 10 * S, X(0.42), ay, W * 0.42);
    lg.addColorStop(0, `rgba(122,245,255,${0.12 * spin})`); lg.addColorStop(1, 'rgba(122,245,255,0)');
    ctx.fillStyle = lg; ctx.fillRect(deckX, deckY, deckW, deckH);
  }
  ctx.restore();
  // painted walkway lanes either side of the train
  ctx.strokeStyle = 'rgba(216,168,32,0.7)'; ctx.lineWidth = 2 * S; ctx.setLineDash([12 * S, 6 * S]);
  [ay - H * 0.27, ay + H * 0.27].forEach(y => { ctx.beginPath(); ctx.moveTo(X(0.30), y); ctx.lineTo(X(0.79), y); ctx.stroke(); });
  ctx.setLineDash([]);
  _wfHazardStripe(deckX, deckB - 6 * S, deckW, 5 * S, S);

  // ── Moisture-separator reheaters (alongside the HP/IP end) ──
  const msrX0 = X(0.075), msrX1 = X(0.275), msrR = H * 0.055;
  [-1, 1].forEach(sd => {
    const my = ay + sd * H * 0.31;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.roundRect(msrX0 + 6 * S, my - msrR + 7 * S, msrX1 - msrX0, msrR * 2, msrR); ctx.fill();
    ctx.fillStyle = cyl(my - msrR, my + msrR, 'msr'); ctx.strokeStyle = '#0e1418'; ctx.lineWidth = 1.5 * S;
    ctx.beginPath(); ctx.roundRect(msrX0, my - msrR, msrX1 - msrX0, msrR * 2, msrR); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(14,20,24,0.45)'; ctx.lineWidth = 1.2 * S;
    for (let x = msrX0 + msrR; x < msrX1 - msrR; x += (msrX1 - msrX0) / 7) { ctx.beginPath(); ctx.moveTo(x, my - msrR); ctx.lineTo(x, my + msrR); ctx.stroke(); }
    // reheat steam in, dry steam out
    _wfPipe([[X(0.11), ay + sd * H * 0.11], [X(0.11), my - sd * msrR]], S, t, gen, 'rgba(240,250,255,0.95)');
    _wfPipe([[X(0.245), my - sd * msrR], [X(0.245), ay + sd * H * 0.15]], S, t, gen, 'rgba(255,230,180,0.95)');
    ctx.fillStyle = 'rgba(16,24,28,0.85)'; ctx.font = `bold ${Math.max(5, 7 * S)}px Courier New`; ctx.textAlign = 'center';
    ctx.fillText('MSR', (msrX0 + msrX1) / 2, my + 2.5 * S);
  });

  // ── Steam inlet: STEAM IN to twin stop-valve chests ──
  _wfPipe([[px + 12 * S, ay], [X(0.07), ay]], S, t, gen, 'rgba(240,250,255,0.95)');
  [-1, 1].forEach(sd => {
    const vx = X(0.045), vy = ay + sd * H * 0.085, vr = 11 * S;
    _wfPipe([[vx, ay], [vx, vy]], S, t, gen, 'rgba(240,250,255,0.95)');
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(vx + 4 * S, vy + 5 * S, vr + 2 * S, 0, TAU); ctx.fill();
    ctx.fillStyle = '#34444e'; ctx.strokeStyle = '#0e1418'; ctx.lineWidth = 1.5 * S;
    ctx.beginPath(); for (let q = 0; q < 6; q++) { const a = q * TAU / 6; q ? ctx.lineTo(vx + Math.cos(a) * (vr + 2 * S), vy + Math.sin(a) * (vr + 2 * S)) : ctx.moveTo(vx + Math.cos(a) * (vr + 2 * S), vy + Math.sin(a) * (vr + 2 * S)); } ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9a1c16'; ctx.beginPath(); ctx.arc(vx, vy, vr * 0.75, 0, TAU); ctx.fill();
    ctx.strokeStyle = connected ? accent : '#c04030'; ctx.lineWidth = 2 * S;
    ctx.save(); ctx.translate(vx, vy); ctx.rotate(connected ? 0 : Math.PI / 4);
    for (let q = 0; q < 3; q++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-vr * 0.75, 0); ctx.lineTo(vr * 0.75, 0); ctx.stroke(); }
    ctx.restore();
  });

  // ── Shaft ──
  const shaftX0 = X(0.07), shaftX1 = X(0.79);
  ctx.lineCap = 'butt';
  ctx.strokeStyle = '#0c1216'; ctx.lineWidth = 13 * S; ctx.beginPath(); ctx.moveTo(shaftX0, ay); ctx.lineTo(shaftX1, ay); ctx.stroke();
  const sg = ctx.createLinearGradient(0, ay - 4 * S, 0, ay + 4 * S);
  sg.addColorStop(0, '#7a8488'); sg.addColorStop(0.45, '#eef4f6'); sg.addColorStop(1, '#5a6468');
  ctx.strokeStyle = sg; ctx.lineWidth = 9 * S; ctx.stroke();
  ctx.strokeStyle = 'rgba(30,36,40,0.7)'; ctx.setLineDash([3 * S, 7 * S]); ctx.lineDashOffset = -ph * 140 * S; ctx.stroke();
  ctx.setLineDash([]); ctx.lineDashOffset = 0;

  // ── Casings ──
  const casings = [
    { x0: 0.075, x1: 0.155, hl: 0.08, hr: 0.13, label: 'HP' },
    { x0: 0.175, x1: 0.270, hl: 0.12, hr: 0.17, label: 'IP' },
    { x0: 0.300, x1: 0.420, hh: 0.24, label: 'LP1', lp: true },
    { x0: 0.440, x1: 0.560, hh: 0.24, label: 'LP2', lp: true },
    { x0: 0.580, x1: 0.700, hh: 0.24, label: 'LP3', lp: true },
  ];
  // LP exhaust hoods first (wider, under the barrels)
  casings.filter(c => c.lp).forEach(c => {
    const x0 = X(c.x0) - 5 * S, x1 = X(c.x1) + 5 * S, hh = H * c.hh * 1.1;
    ctx.fillStyle = '#26323a'; ctx.strokeStyle = '#0c1216'; ctx.lineWidth = 1.5 * S;
    ctx.beginPath(); ctx.roundRect(x0, ay - hh, x1 - x0, hh * 2, 5 * S); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.2 * S;
    for (let x = x0 + 7 * S; x < x1 - 4 * S; x += 7 * S) { ctx.beginPath(); ctx.moveTo(x, ay - hh + 3 * S); ctx.lineTo(x, ay - hh + 10 * S); ctx.moveTo(x, ay + hh - 10 * S); ctx.lineTo(x, ay + hh - 3 * S); ctx.stroke(); }
  });
  casings.forEach((c, i) => {
    const x0 = X(c.x0), x1 = X(c.x1), w = x1 - x0;
    const hl = H * (c.lp ? c.hh * 0.62 : c.hl), hr = H * (c.lp ? c.hh * 0.62 : c.hr), hm = c.lp ? H * c.hh : hr;
    const cone = c.lp ? w * 0.2 : w * 0.5;
    const outline = () => {
      ctx.beginPath();
      ctx.moveTo(x0, ay - hl); ctx.lineTo(x0 + cone, ay - hm); ctx.lineTo(x1 - (c.lp ? cone : 0), ay - hm); ctx.lineTo(x1, ay - hr);
      ctx.lineTo(x1, ay + hr); ctx.lineTo(x1 - (c.lp ? cone : 0), ay + hm); ctx.lineTo(x0 + cone, ay + hm); ctx.lineTo(x0, ay + hl);
      ctx.closePath();
    };
    ctx.lineJoin = 'round';
    ctx.save(); ctx.translate(7 * S, 8 * S); outline(); ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fill(); ctx.restore();
    outline(); ctx.fillStyle = cyl(ay - hm, ay + hm); ctx.fill();
    ctx.strokeStyle = '#0a1216'; ctx.lineWidth = 1.6 * S; ctx.stroke();
    ctx.save(); outline(); ctx.clip();
    ctx.strokeStyle = 'rgba(10,20,26,0.4)'; ctx.lineWidth = 1.2 * S;
    const seams = c.lp ? [x0 + cone, x1 - cone] : [x0 + cone, x0 + cone * 0.5];
    seams.forEach(sx => { ctx.beginPath(); ctx.moveTo(sx, ay - hm); ctx.lineTo(sx, ay + hm); ctx.stroke(); });
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x0, ay - hm * 0.62, w, hm * 0.12);
    // gold trim bands
    ctx.fillStyle = 'rgba(255,216,144,0.55)';
    [x0 + cone + 2 * S, x1 - (c.lp ? cone : 0) - 4 * S].forEach(bx => ctx.fillRect(bx, ay - hm, 2 * S, hm * 2));
    ctx.restore();
    // bolted split flange
    ctx.strokeStyle = '#1c2a32'; ctx.lineWidth = 3 * S;
    ctx.beginPath(); ctx.moveTo(x0 + 3 * S, ay); ctx.lineTo(x1 - 3 * S, ay); ctx.stroke();
    ctx.fillStyle = '#d8b830';
    for (let x = x0 + 6 * S; x < x1 - 4 * S; x += 7 * S) { ctx.beginPath(); ctx.arc(x, ay - 2.6 * S, 1.1 * S, 0, TAU); ctx.arc(x, ay + 2.6 * S, 1.1 * S, 0, TAU); ctx.fill(); }
    // LP: blade discs turning behind round sight windows above and below the split
    if (c.lp) {
      [-1, 1].forEach(sd => {
        const wx = (x0 + x1) / 2, wy = ay + sd * hm * 0.55, wr = Math.min(w * 0.22, hm * 0.32);
        ctx.fillStyle = '#04080c'; ctx.strokeStyle = '#2a3a44'; ctx.lineWidth = 2 * S;
        ctx.beginPath(); ctx.arc(wx, wy, wr, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.beginPath(); ctx.arc(wx, wy, wr - 1.5 * S, 0, TAU); ctx.clip();
        ctx.translate(wx, wy); ctx.rotate(ph * 30 * sd + i);
        const nb = 14;
        for (let b = 0; b < nb; b++) {
          ctx.rotate(TAU / nb);
          ctx.fillStyle = turning ? `rgba(150,235,255,${0.4 + 0.45 * spin})` : 'rgba(90,110,120,0.7)';
          ctx.beginPath(); ctx.moveTo(wr * 0.2, -wr * 0.05); ctx.quadraticCurveTo(wr * 0.6, -wr * 0.22, wr, -wr * 0.08); ctx.lineTo(wr, wr * 0.04); ctx.quadraticCurveTo(wr * 0.6, -wr * 0.06, wr * 0.2, wr * 0.05); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#8a9aa4'; ctx.beginPath(); ctx.arc(0, 0, wr * 0.2, 0, TAU); ctx.fill();
        ctx.restore();
        if (spin > 0.05) drawGlowHalo(wx, wy, wr * 1.5, [[0, 'rgba(122,245,255,0.8)'], [1, 'transparent']], 0.22 * spin);
      });
    }
    if (spin > 0.05) { outline(); ctx.strokeStyle = `rgba(122,245,255,${(0.22 + 0.2 * Math.sin(t * 4 + i)) * spin})`; ctx.lineWidth = 4 * S; ctx.stroke(); }
    ctx.fillStyle = 'rgba(12,20,26,0.9)'; ctx.font = `bold ${Math.max(5, 8 * S)}px Courier New`; ctx.textAlign = 'center';
    ctx.fillText(c.label, (x0 + x1) / 2, c.lp ? ay + 3 * S : ay + hm * 0.62);
    // bearing pedestal + coupling guard to the next machine
    const nx = i < casings.length - 1 ? X(casings[i + 1].x0) : X(0.715);
    const kx = (x1 + nx) / 2;
    ctx.fillStyle = '#242c30'; ctx.strokeStyle = '#0a0e10'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.roundRect(kx - 5 * S, ay - 16 * S, 10 * S, 32 * S, 2 * S); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e0a020'; ctx.strokeStyle = '#4a3408';
    ctx.beginPath(); ctx.roundRect(kx - 6 * S, ay - 9 * S, 12 * S, 18 * S, 3 * S); ctx.fill(); ctx.stroke();
  });

  // ── Crossovers: IP exhaust arcing over to each LP ──
  const ipMid = X((casings[1].x0 + casings[1].x1) / 2);
  casings.filter(c => c.lp).forEach((c, i) => {
    const mx = X((c.x0 + c.x1) / 2);
    const y0 = ay - H * casings[1].hr * 0.8, y1 = ay - H * c.hh * 0.9;
    const topY = Math.max(deckY + 6 * S, ay - H * 0.36 - i * 7 * S);
    const qx = (ipMid + mx) / 2;
    const arc = (dx, dy) => { ctx.beginPath(); ctx.moveTo(ipMid + dx, y0 + dy); ctx.quadraticCurveTo(qx + dx, topY + dy, mx + dx, y1 + dy); };
    ctx.lineCap = 'round';
    arc(6 * S, 7 * S); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 15 * S; ctx.stroke();
    arc(0, 0); ctx.strokeStyle = '#0c1216'; ctx.lineWidth = 15 * S; ctx.stroke();
    ctx.strokeStyle = '#7e98a6'; ctx.lineWidth = 11 * S; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2.5 * S; arc(-2 * S, -2 * S); ctx.stroke();
    if (gen) {
      arc(0, 0); ctx.strokeStyle = 'rgba(240,250,255,0.9)'; ctx.lineWidth = 3 * S;
      ctx.setLineDash([5 * S, 8 * S]); ctx.lineDashOffset = -t * 30 * S; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
  });

  // ── Generator: water-cooled stator with glowing cooling bands ──
  const gX0 = X(0.715), gX1 = X(0.775), gHH = H * 0.17;
  ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.roundRect(gX0 + 7 * S, ay - gHH + 8 * S, gX1 - gX0, gHH * 2, gHH * 0.5); ctx.fill();
  ctx.fillStyle = cyl(ay - gHH, ay + gHH, 'gen'); ctx.strokeStyle = '#061016'; ctx.lineWidth = 1.6 * S;
  ctx.beginPath(); ctx.roundRect(gX0, ay - gHH, gX1 - gX0, gHH * 2, gHH * 0.5); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.roundRect(gX0, ay - gHH, gX1 - gX0, gHH * 2, gHH * 0.5); ctx.clip();
  for (let q = 0; q < 5; q++) {
    const bx = gX0 + (gX1 - gX0) * (0.12 + q * 0.19);
    ctx.fillStyle = spin > 0.05 ? `rgba(122,245,255,${(0.35 + 0.35 * Math.sin(t * 5 - q)) * spin + 0.1})` : '#13303a';
    ctx.fillRect(bx, ay - gHH, 3 * S, gHH * 2);
  }
  ctx.restore();
  ctx.fillStyle = spin > 0.05 ? `rgba(160,250,255,${0.35 + 0.5 * spin})` : '#081418';
  ctx.beginPath(); ctx.roundRect(gX0 + 6 * S, ay - 3 * S, gX1 - gX0 - 12 * S, 6 * S, 3 * S); ctx.fill();
  if (spin > 0.05) drawGlowHalo((gX0 + gX1) / 2, ay, (gX1 - gX0) * 0.9, [[0, 'rgba(90,230,255,0.9)'], [1, 'transparent']], 0.25 * spin);
  // exciter with its cooling fan
  ctx.fillStyle = '#3e505a'; ctx.strokeStyle = '#0c1418'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.roundRect(gX1 + 3 * S, ay - gHH * 0.5, 18 * S, gHH, 3 * S); ctx.fill(); ctx.stroke();
  _fcFan(gX1 + 12 * S, ay, Math.min(7 * S, gHH * 0.38), S, ph * 1.5, turning, 14);
  ctx.fillStyle = 'rgba(200,240,250,0.85)'; ctx.font = `bold ${Math.max(5, 7 * S)}px Courier New`; ctx.textAlign = 'center';
  ctx.fillText('GEN', (gX0 + gX1) / 2, ay - gHH * 0.5);

  // ── Gantry crane: rails along the hall, bridge travelling while it runs ──
  const railY0 = deckY + 5 * S, railY1 = deckB - 12 * S;
  [railY0, railY1].forEach(y => {
    ctx.fillStyle = '#1a1e22'; ctx.fillRect(deckX + 8 * S, y - 2.5 * S, deckW - 16 * S, 5 * S);
    ctx.fillStyle = '#8a949c'; ctx.fillRect(deckX + 8 * S, y - 1 * S, deckW - 16 * S, 2 * S);
  });
  // Parked at the far end of the hall, clear of the generator, when idle.
  const travel = gen ? 0.5 + 0.42 * Math.sin(t * 0.12) : 1.0;
  const bx = deckX + 20 * S + (deckW - 40 * S) * travel;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bx - 6 * S + 10 * S, railY0 + 12 * S, 12 * S, railY1 - railY0);
  ctx.fillStyle = '#c89a20'; ctx.strokeStyle = '#3a2a08'; ctx.lineWidth = 1.2 * S;
  ctx.beginPath(); ctx.rect(bx - 6 * S, railY0 - 4 * S, 12 * S, railY1 - railY0 + 8 * S); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(40,30,8,0.6)'; ctx.lineWidth = S;
  for (let y = railY0; y < railY1; y += 10 * S) { ctx.beginPath(); ctx.moveTo(bx - 6 * S, y); ctx.lineTo(bx + 6 * S, y + 10 * S); ctx.stroke(); }
  [railY0, railY1].forEach(y => { ctx.fillStyle = '#2a2a2a'; ctx.fillRect(bx - 9 * S, y - 4 * S, 18 * S, 8 * S); });
  const tyT = ay + Math.sin(t * 0.3) * H * 0.18 * (gen ? 1 : 0);
  ctx.fillStyle = '#e0b030'; ctx.strokeStyle = '#3a2a08';
  ctx.beginPath(); ctx.roundRect(bx - 10 * S, tyT - 8 * S, 20 * S, 16 * S, 2 * S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = gen && Math.sin(t * 6) > 0 ? '#ff8030' : '#5a3a10'; ctx.beginPath(); ctx.arc(bx, tyT, 2.5 * S, 0, TAU); ctx.fill();

  // ── Isolated-phase bus to the transformer yard ──
  const tyX = X(0.825), tyY = py + H * 0.08, tyW = W * 0.155, tyH = H * 0.84;
  const busX0 = gX1 + 21 * S;
  [-6, 0, 6].forEach((o, i) => {
    const y = ay + o * S;
    ctx.strokeStyle = '#0c1216'; ctx.lineWidth = 5.5 * S; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(busX0, y); ctx.lineTo(tyX + tyW * 0.1, y); ctx.stroke();
    ctx.strokeStyle = '#8a9aa2'; ctx.lineWidth = 3.6 * S; ctx.stroke();
    if (gen) {
      ctx.strokeStyle = 'rgba(255,220,120,0.95)'; ctx.lineWidth = 1.6 * S;
      ctx.setLineDash([3 * S, 6 * S]); ctx.lineDashOffset = -t * 30 * S - i * 3 * S; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
  });

  // ── Transformer yard: gravel pad, three main transformers ──
  ctx.fillStyle = '#3e3c34'; ctx.strokeStyle = '#1a1814'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.roundRect(tyX - 4 * S, tyY - 4 * S, tyW + 8 * S, tyH + 8 * S, 4 * S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  for (let q = 0; q < 120; q++) ctx.fillRect(tyX - 3 * S + ((q * 37) % 97) / 97 * (tyW + 6 * S), tyY - 3 * S + ((q * 53) % 89) / 89 * (tyH + 6 * S), 1.4 * S, 1.4 * S);
  const trunkX = tyX + tyW * 0.1;
  ctx.strokeStyle = '#0c1216'; ctx.lineWidth = 6 * S;
  ctx.beginPath(); ctx.moveTo(trunkX, tyY + tyH * 0.16); ctx.lineTo(trunkX, tyY + tyH * 0.84); ctx.stroke();
  ctx.strokeStyle = '#8a9aa2'; ctx.lineWidth = 3.6 * S; ctx.stroke();
  for (let u = 0; u < 3; u++) {
    const yy = tyY + tyH * (0.02 + u * 0.33), bh = tyH * 0.29, tx = tyX + tyW * 0.22, tw = tyW * 0.5;
    ctx.strokeStyle = '#0c1216'; ctx.lineWidth = 5 * S; ctx.beginPath(); ctx.moveTo(trunkX, yy + bh / 2); ctx.lineTo(tx + 2 * S, yy + bh / 2); ctx.stroke();
    ctx.strokeStyle = '#8a9aa2'; ctx.lineWidth = 3 * S; ctx.stroke();
    const rx = tx + tw + 2 * S, rw = tyX + tyW - rx - S;
    ctx.fillStyle = '#2e362c'; ctx.fillRect(rx, yy + bh * 0.08, rw, bh * 0.84);
    for (let y = yy + bh * 0.1; y < yy + bh * 0.9 - 2 * S; y += 3 * S) { ctx.fillStyle = '#6a7a64'; ctx.fillRect(rx + S, y, rw - 2 * S, 1.8 * S); }
    _wfShadow(tx, yy, tw, bh, S, 3 * S);
    const tg = ctx.createLinearGradient(tx, 0, tx + tw, 0);
    tg.addColorStop(0, '#4e5e50'); tg.addColorStop(0.35, '#8a9c86'); tg.addColorStop(1, '#3a463a');
    ctx.fillStyle = tg; ctx.strokeStyle = '#141a14'; ctx.lineWidth = 1.4 * S;
    ctx.beginPath(); ctx.roundRect(tx, yy, tw, bh, 3 * S); ctx.fill(); ctx.stroke();
    const br = Math.min(5.5 * S, tw * 0.11);
    for (let q = 0; q < 3; q++) {
      const bxx = tx + tw * (0.2 + q * 0.3), byy = yy + bh * 0.55;
      ctx.fillStyle = '#b86a44'; ctx.beginPath(); ctx.arc(bxx, byy, br, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#6a3a22'; ctx.lineWidth = S; [0.72, 0.46].forEach(f => { ctx.beginPath(); ctx.arc(bxx, byy, br * f, 0, TAU); ctx.stroke(); });
      ctx.fillStyle = '#e0e4e4'; ctx.beginPath(); ctx.arc(bxx, byy, br * 0.28, 0, TAU); ctx.fill();
      if (gen && Math.sin(t * 9 + q * 2.3 + u * 1.7) > 0.94) drawGlowHalo(bxx, byy, 8 * S, [[0, 'rgba(200,240,255,0.9)'], [1, 'transparent']], 0.6);
    }
  }

  // ── Output readout on the hall floor ──
  {
    const rw = W * 0.13, rh = H * 0.07, rx = X(0.62), ry = deckB - rh - 12 * S;
    ctx.fillStyle = '#060a0c'; ctx.strokeStyle = gen ? accent : '#2a3438'; ctx.lineWidth = 1.5 * S;
    ctx.beginPath(); ctx.roundRect(rx, ry, rw, rh, 3 * S); ctx.fill(); ctx.stroke();
    const mw = gen ? (e._currentOutput || def.powerOutput) / 1000 : 0;
    ctx.fillStyle = gen ? gold : '#4a4030'; ctx.font = `bold ${Math.max(7, 11 * S)}px Courier New`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${mw.toFixed(2)} MW`, rx + rw / 2, ry + rh / 2 + 0.5 * S);
    ctx.textBaseline = 'alphabetic';
    // RPM bar
    ctx.fillStyle = '#12181c'; ctx.fillRect(rx + 4 * S, ry + rh - 4 * S, rw - 8 * S, 2 * S);
    ctx.fillStyle = accent; ctx.fillRect(rx + 4 * S, ry + rh - 4 * S, (rw - 8 * S) * spin, 2 * S);
  }

  _portPipe(aIn, S, t, { fluid: '#e8f4ff', label: 'STEAM IN', on: connected, out: false, flow: gen });
  _wfPlate('STEAM TURBINE MK2', X(0.42), py + H * 0.03, S, accent, gen || connected);
  _wfLamp(X(0.79), py + H * 0.04, S, t, gen ? accent : (connected ? '#ffb030' : '#ff4040'), true);
  drawNetworkHighlight(e, px, py, t);
  ctx.restore();
}
