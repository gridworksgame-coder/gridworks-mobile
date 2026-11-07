/* ═══════════════════════════════════════════════════════════════════
   RENDER: TRITIUM BREEDING FACILITY
   Accelerator-driven tritium breeder, 38×22 (26×12 in older saves, which
   keep the size they were built at and the drawing that goes with it).
   Shares the kit from render_oil_nuclear.js (_plantFrame, _portAnchor,
   _portPipe, _portBelt, _frameText, _fcFan) and render_hydro_coal.js
   (_wf* helpers).
   ═══════════════════════════════════════════════════════════════════ */

function renderTritiumBreeder(e, px, py, t) {
  // Read left to right, the way the beam goes. Lithium Compound comes off the
  // LITHIUM IN belt into a hopper; an ion source on the berm injects into a
  // great synchrotron ring, magnets red and blue round a trench in a concrete
  // berm, with bunches of beam chasing round it while it breeds. The extraction
  // line runs straight into an armoured octagon holding the heavy-metal target
  // in its turning lithium blanket, spitting neutrons. Tritium comes off a
  // glovebox skid into a rack that follows the buffer and out on TRITIUM OUT.
  // Cryo spheres, chillers, a transformer yard and a control cabin fill the
  // corners. Drawn in the unrotated frame (_plantFrame).
  const f = _plantFrame(e, px, py, T.TRITIUMBREEDER);
  if (f.bh < 20 * TILE) { _renderTritiumBreederLegacy(e, px, py, t); return; }
  const w = f.bw, h = f.bh, u = TILE;
  const on  = !!e.powered;
  const run = on && !!e._breeding;
  const def = EntityDefs[T.TRITIUMBREEDER];
  const fill = Math.min(1, (e._tritium || 0) / (def.tritiumCapacity || 300));
  const S = TILE / 40;
  const detail = Camera.zoom > 0.5;
  const accent = '#80ffc0', beam = '#9ae8ff', lithium = '#a884f0';
  const glowK = 1 + 0.8*(typeof DayNight !== 'undefined' ? DayNight.darkness() : 0);
  const st = (typeof TritiumBreederSystem !== 'undefined' && e.col !== undefined) ? TritiumBreederSystem.getStubs(e) : null;
  const midY = Math.floor(Math.round(h / TILE) / 2) * TILE + TILE/2;   // both ports sit on this row
  const TAU = Math.PI*2;
  const disc = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
  const octagon = (x, y, r) => {
    ctx.beginPath();
    for (let q = 0; q < 8; q++) { const a = Math.PI/8 + q*Math.PI/4, px2 = x + Math.cos(a)*r, py2 = y + Math.sin(a)*r; q ? ctx.lineTo(px2, py2) : ctx.moveTo(px2, py2); }
    ctx.closePath();
  };
  ctx.save();
  ctx.save(); f.apply();

  // ── Layout anchors ──
  const rcx = 14*u, rcy = midY;                       // synchrotron centre
  const rB = 9.7*u, rT = 7.7*u, rHub = 3.3*u;         // berm, trench centre line, control hub
  const tcx = 29*u, tcy = midY, tR = 4.5*u;           // target octagon
  const hpX = 0.9*u, hpY = midY - 2*u, hpW = 2.7*u, hpH = 4*u;         // feed hopper
  const isX = 4*u;                                     // ion source, on the berm's west edge
  const gbX = 34.2*u, gbY = midY - 4.4*u, gbW = 3*u, gbH = 3*u;        // glovebox skid
  const rkX = 34.2*u, rkY = midY + 1.4*u, rkW = 3*u, rkH = 3.4*u, nB = 5;  // bottle rack

  // ── Slab: dark poured pad, expansion joints, safety line ──
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.roundRect(w*0.012 + 6*S, h*0.02 + 7*S, w*0.976, h*0.95, 7*S); ctx.fill();
  const pad = ctx.createLinearGradient(0, 0, 0, h);
  pad.addColorStop(0, '#3e4346'); pad.addColorStop(1, '#2c3033');
  ctx.fillStyle = pad; ctx.beginPath(); ctx.roundRect(w*0.012, h*0.02, w*0.976, h*0.95, 7*S); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1*S; ctx.beginPath();
  for (let q = 1; q < 19; q++) { const lx = q*2*u; ctx.moveTo(lx, h*0.03); ctx.lineTo(lx, h*0.96); }
  for (let q = 1; q < 11; q++) { const ly = q*2*u; ctx.moveTo(w*0.015, ly); ctx.lineTo(w*0.985, ly); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(232,180,60,0.4)'; ctx.lineWidth = 1.6*S; ctx.setLineDash([7*S, 6*S]);
  ctx.beginPath(); ctx.roundRect(w*0.022, h*0.04, w*0.956, h*0.91, 4*S); ctx.stroke(); ctx.setLineDash([]);

  // ── Pipework under the equipment ──
  _wfPipe([[12*S, midY], [hpX, midY]], S, t, !!e._hasCompound, 'rgba(192,160,255,0.9)');
  _wfPipe([[hpX + hpW, midY], [isX, midY]], S, t, run, 'rgba(192,160,255,0.9)');
  // lithium round the south of the ring to the blanket
  _wfPipe([[hpX + hpW*0.5, hpY + hpH], [hpX + hpW*0.5, 21.25*u], [24*u, 21.25*u], [24*u, tcy + tR + 0.1*u], [tcx - 1.4*u, tcy + tR + 0.1*u], [tcx - 1.4*u, tcy + tR*0.8]], S, t, run, 'rgba(192,160,255,0.75)');
  // coolant from the cryo spheres down into the target
  _wfPipe([[tcx - 1.8*u, 5.6*u], [tcx - 1.8*u, tcy - tR*0.8]], S, t, on, 'rgba(120,210,250,0.85)');
  _wfPipe([[tcx + 1.8*u, 5.6*u], [tcx + 1.8*u, tcy - tR*0.8]], S, t, on, 'rgba(120,210,250,0.85)');
  // tritium off the target to the skid, down to the rack, out of the wall
  _wfPipe([[tcx + tR*0.9, gbY + gbH*0.5], [gbX, gbY + gbH*0.5]], S, t, run, accent);
  _wfPipe([[gbX + gbW*0.5, gbY + gbH], [gbX + gbW*0.5, rkY]], S, t, run, accent);
  _wfPipe([[gbX + gbW*0.5, midY], [w - 12*S, midY]], S, t, !!e._tritiumPipeOut, accent);

  // ── Synchrotron berm: a great concrete ring ──
  ctx.fillStyle = 'rgba(0,0,0,0.34)'; disc(rcx + 7*S, rcy + 9*S, rB);
  const bg = ctx.createRadialGradient(rcx - rB*0.3, rcy - rB*0.4, rB*0.2, rcx, rcy, rB);
  bg.addColorStop(0, '#a4a8a6'); bg.addColorStop(0.7, '#7e8280'); bg.addColorStop(1, '#585c5a');
  ctx.fillStyle = bg; disc(rcx, rcy, rB);
  ctx.strokeStyle = '#1e2220'; ctx.lineWidth = 1.6*S; ctx.beginPath(); ctx.arc(rcx, rcy, rB, 0, TAU); ctx.stroke();
  if (detail) {
    // shield blocks: radial joints across the berm
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1*S; ctx.beginPath();
    for (let q = 0; q < 40; q++) {
      const a = q*TAU/40, c = Math.cos(a), s = Math.sin(a);
      ctx.moveTo(rcx + c*(rT + 1.1*u), rcy + s*(rT + 1.1*u)); ctx.lineTo(rcx + c*(rB - 2*S), rcy + s*(rB - 2*S));
    }
    ctx.stroke();
  }
  // infield: a dark sunken apron inside the ring
  const ig = ctx.createRadialGradient(rcx, rcy, 0, rcx, rcy, rT - 1*u);
  ig.addColorStop(0, '#20282e'); ig.addColorStop(1, '#141a1f');
  ctx.fillStyle = ig; disc(rcx, rcy, rT - 1*u);

  // The trench, cut open to show the machine
  ctx.lineCap = 'butt';
  ctx.strokeStyle = '#0a0e13'; ctx.lineWidth = 2.2*u; ctx.beginPath(); ctx.arc(rcx, rcy, rT, 0, TAU); ctx.stroke();
  // on the floor of the trench the bore lights the walls while the beam is up
  ctx.strokeStyle = '#6e767c'; ctx.lineWidth = 0.42*u; ctx.beginPath(); ctx.arc(rcx, rcy, rT, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.1*u; ctx.beginPath(); ctx.arc(rcx, rcy, rT - 0.1*u, 0, TAU); ctx.stroke();
  // bending magnets: thick red and blue blocks either side of the bore
  const nMag = detail ? 32 : 16, gap = 0.035;
  for (const col of [0, 1]) {
    ctx.strokeStyle = col ? '#3f66c0' : '#c04a3a';
    ctx.lineWidth = 1.5*u;
    ctx.beginPath();
    for (let q = col; q < nMag; q += 2) {
      const a0 = q*TAU/nMag + gap, a1 = (q + 1)*TAU/nMag - gap;
      ctx.moveTo(rcx + Math.cos(a0)*rT, rcy + Math.sin(a0)*rT);
      ctx.arc(rcx, rcy, rT, a0, a1);
    }
    ctx.stroke();
  }
  if (detail) {
    // a slot down each magnet where the bore runs through, and a lit top edge
    ctx.strokeStyle = 'rgba(10,14,20,0.85)'; ctx.lineWidth = 0.5*u; ctx.beginPath(); ctx.arc(rcx, rcy, rT, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.1*u; ctx.beginPath(); ctx.arc(rcx, rcy, rT + 0.68*u, 0, TAU); ctx.stroke();
  }
  // RF cavities: four copper drums on the diagonals, where the power goes in
  const rfA = [Math.PI*0.25, Math.PI*0.75, Math.PI*1.25, Math.PI*1.75];
  ctx.strokeStyle = '#c88a48'; ctx.lineWidth = 2*u; ctx.beginPath();
  for (const a of rfA) { ctx.moveTo(rcx + Math.cos(a - 0.11)*rT, rcy + Math.sin(a - 0.11)*rT); ctx.arc(rcx, rcy, rT, a - 0.11, a + 0.11); }
  ctx.stroke();
  ctx.strokeStyle = '#6a4420'; ctx.lineWidth = 0.14*u; ctx.beginPath();
  for (const a of rfA) for (const d of [-0.07, 0, 0.07]) {
    const c = Math.cos(a + d), s = Math.sin(a + d);
    ctx.moveTo(rcx + c*(rT - u), rcy + s*(rT - u)); ctx.lineTo(rcx + c*(rT + u), rcy + s*(rT + u));
  }
  ctx.stroke();

  // Waveguides from the hub out to the cavities, with power running along them
  ctx.strokeStyle = '#6a5a3a'; ctx.lineWidth = 0.34*u; ctx.beginPath();
  for (const a of rfA) { ctx.moveTo(rcx + Math.cos(a)*rHub, rcy + Math.sin(a)*rHub); ctx.lineTo(rcx + Math.cos(a)*(rT - u), rcy + Math.sin(a)*(rT - u)); }
  ctx.stroke();
  if (on) {
    ctx.fillStyle = run ? 'rgba(255,214,140,0.95)' : 'rgba(255,214,140,0.35)';
    rfA.forEach((a, q) => {
      const p = (t*(run ? 1.4 : 0.3) + q*0.25) % 1, r = rHub + (rT - u - rHub)*p;
      disc(rcx + Math.cos(a)*r, rcy + Math.sin(a)*r, 0.17*u);
    });
  }
  // Klystron cabinets on the infield, between the waveguides
  if (detail) {
    for (const a of [0, Math.PI*0.5, Math.PI, Math.PI*1.5]) {
      const kx = rcx + Math.cos(a)*5*u, ky = rcy + Math.sin(a)*5*u, kw = 1.4*u, kh = 1.4*u;
      ctx.fillStyle = '#2c3640'; ctx.strokeStyle = '#0a0e12'; ctx.lineWidth = 1*S;
      ctx.beginPath(); ctx.roundRect(kx - kw/2, ky - kh/2, kw, kh, 2*S); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#b87a40'; disc(kx, ky, 0.36*u);
      ctx.fillStyle = run ? '#ffd890' : on ? '#3a8a70' : '#2a2a2a'; disc(kx, ky, 0.14*u);
    }
  }

  // The beam: bunches chasing round the ring
  if (on) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    const flick = run ? 0.85 + 0.15*Math.sin(t*23) : 0.5;
    ctx.strokeStyle = run ? `rgba(154,232,255,${(0.2*flick*glowK).toFixed(3)})` : `rgba(90,150,190,${(0.1*glowK).toFixed(3)})`;
    ctx.lineWidth = 1.1*u; ctx.beginPath(); ctx.arc(rcx, rcy, rT, 0, TAU); ctx.stroke();
    if (run) {
      const spin = t*3.1;
      for (let q = 0; q < 3; q++) {
        const head = spin + q*TAU/3;
        for (let k = 0; k < 4; k++) {
          const a0 = head - 0.32*(k + 1), a1 = head - 0.32*k;
          ctx.strokeStyle = `rgba(170,238,255,${(0.75 - k*0.17).toFixed(2)})`;
          ctx.lineWidth = (0.3 - k*0.04)*u;
          ctx.beginPath(); ctx.arc(rcx, rcy, rT, a0, a1); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        disc(rcx + Math.cos(head)*rT, rcy + Math.sin(head)*rT, 0.24*u);
      }
    }
    ctx.restore();
    ctx.lineCap = 'butt';
  }

  // ── Control hub: a domed drum at the middle of the ring ──
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; disc(rcx + 5*S, rcy + 6*S, rHub);
  const hb = ctx.createRadialGradient(rcx - rHub*0.35, rcy - rHub*0.4, 0, rcx, rcy, rHub);
  hb.addColorStop(0, '#dfe4e6'); hb.addColorStop(0.55, '#8c9498'); hb.addColorStop(1, '#3e4448');
  ctx.fillStyle = hb; disc(rcx, rcy, rHub);
  ctx.strokeStyle = '#14181c'; ctx.lineWidth = 1.4*S; ctx.beginPath(); ctx.arc(rcx, rcy, rHub, 0, TAU); ctx.stroke();
  // running lights round the rim
  const nRim = detail ? 16 : 8, chase = Math.floor(t*10);
  ctx.fillStyle = on ? '#2a5a4a' : '#262a2a';
  ctx.beginPath();
  for (let q = 0; q < nRim; q++) { const a = q*TAU/nRim, x = rcx + Math.cos(a)*(rHub - 0.3*u), y = rcy + Math.sin(a)*(rHub - 0.3*u); ctx.moveTo(x + 0.12*u, y); ctx.arc(x, y, 0.12*u, 0, TAU); }
  ctx.fill();
  if (run) {
    ctx.fillStyle = beam;
    ctx.beginPath();
    for (let q = 0; q < nRim; q++) {
      if ((q + chase) % 4) continue;
      const a = q*TAU/nRim, x = rcx + Math.cos(a)*(rHub - 0.3*u), y = rcy + Math.sin(a)*(rHub - 0.3*u);
      ctx.moveTo(x + 0.15*u, y); ctx.arc(x, y, 0.15*u, 0, TAU);
    }
    ctx.fill();
  }
  // the glass eye in the roof: a tritium atom, one proton and two neutrons,
  // with its electron circling
  const eye = rHub*0.62;
  ctx.fillStyle = '#0a1016'; disc(rcx, rcy, eye);
  ctx.strokeStyle = '#c8a048'; ctx.lineWidth = 1.4*S; ctx.beginPath(); ctx.arc(rcx, rcy, eye, 0, TAU); ctx.stroke();
  if (on) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const eg = ctx.createRadialGradient(rcx, rcy, 0, rcx, rcy, eye);
    eg.addColorStop(0, `rgba(128,255,192,${((run ? 0.5 : 0.14)*glowK).toFixed(3)})`); eg.addColorStop(1, 'rgba(128,255,192,0)');
    ctx.fillStyle = eg; disc(rcx, rcy, eye);
    ctx.restore();
    const spinA = run ? t*1.2 : 0;
    ctx.strokeStyle = run ? 'rgba(128,255,192,0.8)' : 'rgba(128,255,192,0.3)'; ctx.lineWidth = 0.9*S;
    for (let q = 0; q < 3; q++) { ctx.beginPath(); ctx.ellipse(rcx, rcy, eye*0.82, eye*0.3, spinA + q*Math.PI/3, 0, TAU); ctx.stroke(); }
    const nr = eye*0.15;
    ctx.fillStyle = run ? '#ff7a60' : '#7a4038'; disc(rcx, rcy - nr*0.8, nr);
    ctx.fillStyle = run ? '#dfeef0' : '#6a7274'; disc(rcx - nr*0.8, rcy + nr*0.5, nr); disc(rcx + nr*0.8, rcy + nr*0.5, nr);
    if (run) {
      const ea = t*4, ca = Math.cos(spinA), sa = Math.sin(spinA);
      const ex = Math.cos(ea)*eye*0.82, ey = Math.sin(ea)*eye*0.3;
      ctx.fillStyle = '#eafff6'; disc(rcx + ex*ca - ey*sa, rcy + ex*sa + ey*ca, 0.13*u);
    }
  }

  // ── Feed hopper: lithium compound, violet charge showing through the top ──
  _wfShadow(hpX, hpY, hpW, hpH, S, 3*S);
  const hg = ctx.createLinearGradient(hpX, 0, hpX + hpW, 0);
  hg.addColorStop(0, '#8a8e96'); hg.addColorStop(0.45, '#c4c8ce'); hg.addColorStop(1, '#5a5e66');
  ctx.fillStyle = hg; ctx.strokeStyle = '#1e2226'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.roundRect(hpX, hpY, hpW, hpH, 4*S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = e._hasCompound ? '#8a6ad0' : '#3a3444';
  ctx.beginPath(); ctx.roundRect(hpX + hpW*0.16, hpY + hpH*0.1, hpW*0.68, hpH*0.34, 3*S); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.8*S; ctx.beginPath();
  for (let q = 1; q < 4; q++) { const by = hpY + hpH*(0.5 + q*0.11); ctx.moveTo(hpX + 3*S, by); ctx.lineTo(hpX + hpW - 3*S, by); }
  ctx.stroke();

  // ── Ion source: a high-voltage dome standing on the berm, arcing to the ring ──
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; disc(isX + 3*S, midY + 4*S, 1.15*u);
  const ig2 = ctx.createRadialGradient(isX - 0.4*u, midY - 0.45*u, 0, isX, midY, 1.15*u);
  ig2.addColorStop(0, '#f0f4f6'); ig2.addColorStop(0.6, '#9aa6b0'); ig2.addColorStop(1, '#4a545c');
  ctx.fillStyle = ig2; disc(isX, midY, 1.15*u);
  ctx.strokeStyle = '#1a2026'; ctx.lineWidth = 1*S; ctx.beginPath(); ctx.arc(isX, midY, 1.15*u, 0, TAU); ctx.stroke();
  ctx.fillStyle = run ? beam : '#34404a'; disc(isX, midY, 0.34*u);
  // injection line, from the dome into the ring
  const injX1 = rcx - rT;
  ctx.fillStyle = '#20262c'; ctx.fillRect(isX + 1.1*u, midY - 0.16*u, injX1 - isX - 1.1*u, 0.32*u);
  if (run) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 1*S;
    for (let q = 0; q < 3; q++) {
      const p = (t*1.4 + q/3) % 1;
      ctx.strokeStyle = `rgba(154,232,255,${(0.6*(1 - p)).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(isX, midY, u*(0.5 + p*1.5), 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(154,232,255,0.8)'; ctx.fillRect(isX + 1.1*u, midY - 0.06*u, injX1 - isX - 1.1*u, 0.12*u);
    const seed = Math.floor(t*14);
    if (seed % 3 === 0) {
      const rnd = k => { const v = Math.sin(seed*12.9898 + k*78.233)*43758.5453; return v - Math.floor(v); };
      ctx.strokeStyle = 'rgba(220,245,255,0.9)'; ctx.lineWidth = 1.2*S; ctx.beginPath();
      ctx.moveTo(isX + 0.8*u, midY + (rnd(0) - 0.5)*u);
      for (let k = 1; k <= 5; k++) ctx.lineTo(isX + 0.8*u + (injX1 - isX - 0.8*u)*k/5, midY + (rnd(k) - 0.5)*u*(1 - k/5));
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Extraction line: out of the ring and dead straight into the target ──
  const exX0 = rcx + rT, exX1 = tcx - tR*0.92;
  ctx.fillStyle = '#5a5e5c'; ctx.strokeStyle = '#1e2220'; ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.roundRect(exX0, midY - 0.72*u, exX1 - exX0, 1.44*u, 3*S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#10161a'; ctx.fillRect(exX0, midY - 0.2*u, exX1 - exX0, 0.4*u);
  const eLen = exX1 - exX0;
  for (const [fr, col] of [[0.38, '#c04a3a'], [0.68, '#3f66c0']]) {
    ctx.fillStyle = col; ctx.strokeStyle = '#10141a'; ctx.lineWidth = 0.8*S;
    ctx.beginPath(); ctx.roundRect(exX0 + eLen*fr - 0.28*u, midY - 0.95*u, 0.56*u, 1.9*u, 2*S); ctx.fill(); ctx.stroke();
  }
  if (run) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(154,232,255,${(0.75*glowK > 1 ? 1 : 0.75*glowK).toFixed(2)})`;
    ctx.fillRect(exX0, midY - 0.06*u, eLen, 0.12*u);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    for (let q = 0; q < 2; q++) { const p = (t*1.8 + q/2) % 1; ctx.fillRect(exX0 + eLen*p - 0.3*u, midY - 0.09*u, 0.6*u, 0.18*u); }
    ctx.restore();
  }

  // ── Target: an armoured octagon, the lithium blanket turning round its heart ──
  ctx.fillStyle = 'rgba(0,0,0,0.38)'; octagon(tcx + 6*S, tcy + 8*S, tR); ctx.fill();
  const tg = ctx.createLinearGradient(tcx - tR, tcy - tR, tcx + tR, tcy + tR);
  tg.addColorStop(0, '#9a9e9c'); tg.addColorStop(0.5, '#747876'); tg.addColorStop(1, '#4a4e4c');
  ctx.fillStyle = tg; ctx.strokeStyle = '#141816'; ctx.lineWidth = 1.8*S; octagon(tcx, tcy, tR); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#50545a'; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1*S; octagon(tcx, tcy, tR*0.82); ctx.fill(); ctx.stroke();
  if (detail) {
    // bolts round the armour
    ctx.fillStyle = '#c8ccc8'; ctx.beginPath();
    for (let q = 0; q < 16; q++) { const a = Math.PI/8 + q*Math.PI/8, r = tR*(q % 2 ? 0.86 : 0.91), x = tcx + Math.cos(a)*r, y = tcy + Math.sin(a)*r; ctx.moveTo(x + 0.09*u, y); ctx.arc(x, y, 0.09*u, 0, TAU); }
    ctx.fill();
  }
  const wr = tR*0.36, blR = tR*0.58;
  // lithium blanket: segmented collar, turning while it breeds
  const blA = run ? t*0.7 : 0;
  ctx.lineWidth = 0.62*u;
  ctx.strokeStyle = '#1a1626'; ctx.beginPath(); ctx.arc(tcx, tcy, blR, 0, TAU); ctx.stroke();
  ctx.lineWidth = 0.5*u;
  for (let q = 0; q < 12; q++) {
    const a0 = blA + q*TAU/12;
    ctx.strokeStyle = e._hasCompound ? (run && (q + Math.floor(t*6)) % 4 === 0 ? '#dcc8ff' : '#8a6ad0') : '#3a3444';
    ctx.beginPath(); ctx.arc(tcx, tcy, blR, a0 + 0.05, a0 + TAU/12 - 0.05); ctx.stroke();
  }
  // the beam window at the heart
  ctx.fillStyle = '#080c10'; disc(tcx, tcy, wr);
  ctx.strokeStyle = '#d8b050'; ctx.lineWidth = 2*S; ctx.beginPath(); ctx.arc(tcx, tcy, wr - 1*S, 0, TAU); ctx.stroke();
  if (run) {
    const pulse = 0.75 + 0.25*Math.sin(t*9);
    const rg = ctx.createRadialGradient(tcx, tcy, 0, tcx, tcy, wr*1.05);
    rg.addColorStop(0, `rgba(240,255,250,${(0.98*pulse).toFixed(3)})`);
    rg.addColorStop(0.4, `rgba(128,255,192,${(0.75*pulse).toFixed(3)})`);
    rg.addColorStop(1, 'rgba(128,255,192,0.05)');
    ctx.fillStyle = rg; disc(tcx, tcy, wr*1.05);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // glow spilling out over the armour
    const hl = ctx.createRadialGradient(tcx, tcy, wr*0.5, tcx, tcy, tR*1.4);
    hl.addColorStop(0, `rgba(128,255,192,${(0.3*pulse*glowK).toFixed(3)})`); hl.addColorStop(1, 'rgba(128,255,192,0)');
    ctx.fillStyle = hl; disc(tcx, tcy, tR*1.4);
    // star flare where the beam lands
    ctx.fillStyle = `rgba(235,255,248,${(0.6*pulse).toFixed(3)})`;
    ctx.fillRect(tcx - wr*1.5, tcy - 0.05*u, wr*3, 0.1*u); ctx.fillRect(tcx - 0.05*u, tcy - wr*1.5, 0.1*u, wr*3);
    // spallation neutrons flying out through the blanket
    const nN = detail ? 18 : 8;
    for (let q = 0; q < nN; q++) {
      const ph = t*0.9 + q*0.37, p = ph % 1, a = q*2.399 + Math.floor(ph)*1.7, r = wr*(0.3 + p*2.8);
      ctx.fillStyle = `rgba(210,255,235,${(0.9*(1 - p)).toFixed(2)})`;
      disc(tcx + Math.cos(a)*r, tcy + Math.sin(a)*r, (0.03 + (1 - p)*0.07)*u);
    }
    // counter-rotating sweep inside the window
    ctx.strokeStyle = `rgba(235,255,248,${(0.6*pulse).toFixed(3)})`; ctx.lineWidth = 1.5*S;
    for (let q = 0; q < 3; q++) { const a0 = -t*2.4 + q*TAU/3; ctx.beginPath(); ctx.arc(tcx, tcy, wr*0.72, a0, a0 + 0.9); ctx.stroke(); }
    ctx.restore();
  } else {
    ctx.fillStyle = on ? '#1e3a30' : '#161c1a'; disc(tcx, tcy, wr*0.55);
  }
  // BEAM ON lamps either side of the penetration, flashing in turn
  for (const ly of [-1, 1]) {
    const lampOn = run && Math.sin(t*6 + (ly > 0 ? Math.PI : 0)) > 0, lx = tcx - tR*0.72, lyy = tcy + ly*1.2*u;
    ctx.fillStyle = lampOn ? '#ff4030' : on ? '#5a1a14' : '#2a2020'; disc(lx, lyy, 0.15*u);
    if (lampOn) { ctx.fillStyle = 'rgba(255,64,48,0.3)'; disc(lx, lyy, 0.42*u); }
  }
  if (detail) {
    // radiation trefoil on the armour
    const rx = tcx + tR*0.56, ry = tcy + tR*0.56, rr = 0.48*u;
    ctx.fillStyle = '#e8c030'; disc(rx, ry, rr);
    ctx.fillStyle = '#1a1a1a';
    for (let q = 0; q < 3; q++) {
      const a0 = -Math.PI/2 + q*TAU/3 - Math.PI/6;
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.arc(rx, ry, rr*0.85, a0, a0 + Math.PI/3); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#e8c030'; disc(rx, ry, rr*0.28);
    ctx.fillStyle = '#1a1a1a'; disc(rx, ry, rr*0.16);
  }

  // ── Cryo spheres over the target: frosted, fed from the plant ──
  for (const sx of [tcx - 1.8*u, tcx + 1.8*u]) {
    const sy = 3.4*u, sr = 1.65*u;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; disc(sx + 4*S, sy + 5*S, sr);
    const sg = ctx.createRadialGradient(sx - sr*0.35, sy - sr*0.4, 0, sx, sy, sr);
    sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.5, '#c4d4dc'); sg.addColorStop(1, '#66788a');
    ctx.fillStyle = sg; disc(sx, sy, sr);
    ctx.strokeStyle = '#26303a'; ctx.lineWidth = 1*S; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.moveTo(sx - sr, sy); ctx.lineTo(sx + sr, sy); ctx.stroke();
    ctx.fillStyle = on ? '#60d0ff' : '#2a3a44'; disc(sx, sy + sr*0.55, 0.12*u);
  }

  // ── Chillers: fan decks in the north corners ──
  for (const [cx0, cy0] of [[0.9*u, 0.95*u], [33.6*u, 0.95*u]]) {
    const cW = 3.6*u, cH = 2.3*u;
    _wfShadow(cx0, cy0, cW, cH, S, 3*S);
    ctx.fillStyle = '#3e464e'; ctx.strokeStyle = '#141a1e'; ctx.lineWidth = 1*S;
    ctx.beginPath(); ctx.roundRect(cx0, cy0, cW, cH, 3*S); ctx.fill(); ctx.stroke();
    _fcFan(cx0 + cW*0.27, cy0 + cH*0.5, cH*0.36, S, t, on, 6);
    _fcFan(cx0 + cW*0.73, cy0 + cH*0.5, cH*0.36, S, t + 0.3, on, 6);
  }

  // ── Glovebox extraction skid: windowed box with glove ports ──
  _wfShadow(gbX, gbY, gbW, gbH, S, 2*S);
  ctx.fillStyle = '#c8ccd0'; ctx.strokeStyle = '#3a3e42'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.roundRect(gbX, gbY, gbW, gbH, 3*S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = run ? `rgba(128,255,192,${(0.28 + 0.1*Math.sin(t*3)).toFixed(3)})` : 'rgba(60,80,90,0.5)';
  ctx.fillRect(gbX + gbW*0.1, gbY + gbH*0.12, gbW*0.8, gbH*0.46);
  ctx.fillStyle = '#2a2e32';
  for (const gx of [0.32, 0.68]) disc(gbX + gbW*gx, gbY + gbH*0.78, gbH*0.1);

  // ── Tritium bottle rack: gold-capped cylinders fill with the buffer ──
  ctx.fillStyle = '#26292b'; ctx.strokeStyle = '#0e1012'; ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.roundRect(rkX, rkY, rkW, rkH, 3*S); ctx.fill(); ctx.stroke();
  for (let q = 0; q < nB; q++) {
    const bx = rkX + rkW*(q + 0.5)/nB, filled = (q + 1)/nB <= fill + 0.001, bw = rkW/nB;
    ctx.fillStyle = filled ? '#d8e4de' : '#5a605c';
    ctx.beginPath(); ctx.roundRect(bx - bw*0.34, rkY + rkH*0.12, bw*0.68, rkH*0.78, bw*0.3); ctx.fill();
    ctx.fillStyle = filled && on ? '#e0b060' : '#4a4038'; disc(bx, rkY + rkH*0.15, bw*0.24);
    if (filled && on) {
      ctx.fillStyle = `rgba(128,255,192,${(0.45 + (run ? 0.2*Math.sin(t*3 + q) : 0)).toFixed(3)})`;
      ctx.fillRect(bx - bw*0.13, rkY + rkH*0.34, bw*0.26, rkH*0.46);
    }
  }

  // ── Transformer yard along the south-east, with a busbar running live ──
  const nTx = 4, txY = 18.1*u, txH = 2.3*u, txX = 24.7*u, txW = 2.4*u, txGap = 3*u;
  for (let q = 0; q < nTx; q++) {
    const tx = txX + q*txGap;
    _wfShadow(tx, txY, txW, txH, S, 2*S);
    ctx.fillStyle = '#5a6a5a'; ctx.strokeStyle = '#1a221a'; ctx.lineWidth = 1*S;
    ctx.beginPath(); ctx.roundRect(tx, txY, txW, txH, 2*S); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.8*S; ctx.beginPath();
    for (let r = 1; r < 6; r++) { const fx = tx + txW*r/6; ctx.moveTo(fx, txY + 3*S); ctx.lineTo(fx, txY + txH - 3*S); }
    ctx.stroke();
    ctx.fillStyle = '#c8b890'; disc(tx + txW*0.3, txY + 3.5*S, 2*S); disc(tx + txW*0.7, txY + 3.5*S, 2*S);
    ctx.fillStyle = run ? '#ffd040' : on ? '#50c060' : '#3a3228'; disc(tx + txW - 4*S, txY + txH - 4*S, 1.5*S);
  }
  const bbY = txY - 4*S, bbX0 = txX + txW*0.5, bbX1 = txX + (nTx - 1)*txGap + txW*0.5;
  ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2*S; ctx.beginPath(); ctx.moveTo(bbX0, bbY); ctx.lineTo(bbX1, bbY);
  for (let q = 0; q < nTx; q++) { ctx.moveTo(bbX0 + q*txGap, bbY); ctx.lineTo(bbX0 + q*txGap, txY + 3*S); }
  ctx.stroke();
  if (on) {
    ctx.fillStyle = `rgba(255,220,120,${run ? 0.95 : 0.5})`;
    for (let q = 0; q < 4; q++) { const p = (t*(run ? 0.7 : 0.2) + q/4) % 1; ctx.fillRect(bbX0 + (bbX1 - bbX0)*p - 3*S, bbY - 1.3*S, 6*S, 2.6*S); }
  }

  // ── Control cabin in the south-west corner, windows lit, mast blinking ──
  const ccX = 0.9*u, ccY = 18.6*u, ccW = 3.8*u, ccH = 2.1*u;
  _wfShadow(ccX, ccY, ccW, ccH, S, 3*S);
  ctx.fillStyle = '#54606a'; ctx.strokeStyle = '#141a20'; ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.roundRect(ccX, ccY, ccW, ccH, 3*S); ctx.fill(); ctx.stroke();
  for (let q = 0; q < 5; q++) {
    const lit = on && Math.sin(q*91.7 + Math.floor(t*0.5 + q)*13.1) > -0.5;
    ctx.fillStyle = lit ? '#a8e4ff' : '#1a2228';
    ctx.fillRect(ccX + ccW*(0.08 + q*0.18), ccY + ccH*0.26, ccW*0.13, ccH*0.42);
  }
  const mx = ccX + ccW + 0.45*u, my = ccY + 0.5*u;
  ctx.strokeStyle = '#8a9096'; ctx.lineWidth = 1.2*S; ctx.beginPath(); ctx.arc(mx, my, 0.3*u, 0, TAU); ctx.moveTo(mx - 0.3*u, my); ctx.lineTo(mx + 0.3*u, my); ctx.moveTo(mx, my - 0.3*u); ctx.lineTo(mx, my + 0.3*u); ctx.stroke();
  const blink = on && (t*1.5) % 1 < 0.25;
  ctx.fillStyle = blink ? '#ff5040' : '#4a1a14'; disc(mx, my, 0.1*u);

  // amber beacons on the berm while the beam is up
  for (const [bx, by, ph] of [[rcx - rB*0.71, rcy - rB*0.71, 0], [rcx + rB*0.71, rcy - rB*0.71, 2], [rcx - rB*0.71, rcy + rB*0.71, 4], [rcx + rB*0.71, rcy + rB*0.71, 1]]) {
    ctx.fillStyle = '#2a2a2e'; disc(bx, by, 3*S);
    ctx.fillStyle = run ? '#ffb030' : on ? '#6a4a18' : '#3a3228'; disc(bx, by, 2*S);
    if (run) {
      const a = t*5 + ph;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const rb = ctx.createRadialGradient(bx, by, 0, bx, by, 34*S);
      rb.addColorStop(0, 'rgba(255,176,48,0.5)'); rb.addColorStop(1, 'rgba(255,176,48,0)');
      ctx.fillStyle = rb;
      for (const off of [0, Math.PI]) { ctx.beginPath(); ctx.moveTo(bx, by); ctx.arc(bx, by, 34*S, a + off - 0.3, a + off + 0.3); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
  }

  _wfHazardStripe(tcx - tR, tcy + tR + 0.35*u, tR*2, 3.5*S, S);
  ctx.restore();

  // Text and ports go through toWorld / _portAnchor so they never mirror.
  const [smx, smy] = f.toWorld(tcx + tR*0.5, tcy - tR*0.5);
  _wfSmoke(smx, smy, S*0.6, t, '220,240,235', run, 0.35);
  const [cvx, cvy] = f.toWorld(2.7*u, 2*u);
  _wfSmoke(cvx, cvy, S*0.45, t + 3, '200,225,240', on, 0.25);
  _frameText(f, rcx, rcy + rT - 1.75*u, 'SYNCHROTRON', `bold ${Math.max(4, 6*S)}px Courier New`, run ? beam : '#5a6468');
  _frameText(f, hpX + hpW*0.5, hpY - 5*S, 'Li', `bold ${Math.max(5, 8*S)}px Courier New`, e._hasCompound ? lithium : '#5a5064');
  _frameText(f, rkX + rkW*0.5, rkY + rkH + 7*S, '³H', `bold ${Math.max(5, 8*S)}px Courier New`, on ? '#50a080' : '#4a5a54');
  if (st) {
    _portBelt(_portAnchor(e, px, py, f.W, f.H, st.compoundIn), S, t, { belt: '#c0a0ff', label: 'LITHIUM IN', on: !!e._hasCompound, out: false });
    _portPipe(_portAnchor(e, px, py, f.W, f.H, st.tritiumOut), S, t, { fluid: accent, label: 'TRITIUM OUT', on: !!e._tritiumPipeOut, out: true, flow: !!e._tritiumPipeOut });
  }
  const [plx, ply] = f.toWorld(w*0.5, h*0.965);
  _wfPlate('TRITIUM BREEDING FACILITY', plx, ply, S, accent, on);
  _wfLamp(px + f.W - 7*S, py + 7*S, S, t, accent, on);
  ctx.restore();
}

// The 26×12 hall, for breeders in older saves.
function _renderTritiumBreederLegacy(e, px, py, t) {
  // Read left to right, the way the beam goes. Lithium Compound arrives on
  // the LITHIUM IN belt into a feed hopper. An ion source at the head of the
  // hall feeds a long linear accelerator — a steel beam tube in a concrete
  // tunnel — powered by a gallery of RF klystron cabinets whose waveguides
  // drop into it; a pulse of light runs down the tube while it's breeding.
  // The beam ends in a heavily shielded target block: a heavy-metal target
  // wrapped in the lithium blanket, its window glowing where the beam lands.
  // Tritium comes off a glovebox extraction skid into a gold-capped bottle
  // rack that follows the buffer, and out on TRITIUM OUT. A transformer yard
  // along the bottom and a chiller sell the 600 kW draw. Drawn in the
  // unrotated frame (_plantFrame) — ports follow TritiumBreederSystem.getStubs.
  const f = _plantFrame(e, px, py, T.TRITIUMBREEDER);
  const w = f.bw, h = f.bh;
  const on  = !!e.powered;
  const run = on && !!e._breeding;
  const def = EntityDefs[T.TRITIUMBREEDER];
  const fill = Math.min(1, (e._tritium || 0) / (def.tritiumCapacity || 300));
  const S = TILE / 40;
  const detail = Camera.zoom > 0.5;
  const accent = '#80ffc0';
  const beam   = '#9ae8ff';
  // Every glow reads stronger after dark, when the hall is the brightest thing around.
  const glowK = 1 + 0.8*(typeof DayNight !== 'undefined' ? DayNight.darkness() : 0);
  const st = (typeof TritiumBreederSystem !== 'undefined' && e.col !== undefined) ? TritiumBreederSystem.getStubs(e) : null;
  const midY = Math.floor(Math.round(h / TILE) / 2) * TILE + TILE/2;   // both ports sit on this row
  ctx.save();
  ctx.save(); f.apply();

  // ── Slab: poured pad, expansion joints, safety line ──
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.roundRect(w*0.02 + 5*S, h*0.04 + 6*S, w*0.96, h*0.9, 5*S); ctx.fill();
  ctx.fillStyle = '#4a4e4c'; ctx.beginPath(); ctx.roundRect(w*0.02, h*0.04, w*0.96, h*0.9, 5*S); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1*S;
  for (let q = 1; q < 13; q++) { const lx = w*(0.02 + 0.96*q/13); ctx.beginPath(); ctx.moveTo(lx, h*0.05); ctx.lineTo(lx, h*0.93); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(232,180,60,0.35)'; ctx.lineWidth = 1.4*S; ctx.setLineDash([6*S, 5*S]);
  ctx.beginPath(); ctx.roundRect(w*0.035, h*0.07, w*0.93, h*0.84, 3*S); ctx.stroke(); ctx.setLineDash([]);

  // ── Layout anchors ──
  const hpX = w*0.045, hpY = midY - h*0.17, hpW = w*0.07, hpH = h*0.34;           // feed hopper
  const isX = w*0.13,  isY = midY - h*0.10, isW = w*0.05, isH = h*0.20;           // ion source
  const tnX = w*0.185, tnY = midY - h*0.085, tnW = w*0.50, tnH = h*0.17;          // accelerator tunnel
  const kyY = h*0.10,  kyH = h*0.16, nKy = 7;                                     // klystron gallery
  const tbX = w*0.70,  tbY = h*0.12, tbW = w*0.15, tbH = h*0.62;                  // target block
  const gbX = w*0.87,  gbY = h*0.14, gbW = w*0.09, gbH = h*0.22;                  // glovebox skid
  const rkX = w*0.865, rkY = midY + h*0.10, rkW = w*0.10, rkH = h*0.20, nB = 5;   // bottle rack
  const txY = h*0.70,  txH = h*0.16;                                              // transformer yard
  const chX = w*0.045, chY = h*0.74, chW = w*0.09, chH = h*0.14;                  // chiller

  // ── Pipework and cabling (under the equipment) ──
  _wfPipe([[12*S, midY], [hpX, midY]], S, t, !!e._hasCompound, 'rgba(192,160,255,0.9)');
  _wfPipe([[hpX + hpW, midY], [isX, midY]], S, t, run, 'rgba(192,160,255,0.9)');
  // lithium feed runs round the tunnel to the blanket
  _wfPipe([[hpX + hpW*0.5, hpY + hpH], [hpX + hpW*0.5, h*0.64], [tbX + tbW*0.3, h*0.64], [tbX + tbW*0.3, tbY + tbH]], S, t, run, 'rgba(192,160,255,0.8)');
  _wfPipe([[tbX + tbW, gbY + gbH*0.5], [gbX, gbY + gbH*0.5]], S, t, run, accent);
  _wfPipe([[gbX + gbW*0.5, gbY + gbH], [gbX + gbW*0.5, rkY]], S, t, run, accent);
  _wfPipe([[rkX + rkW*0.5, midY], [w - 12*S, midY]], S, t, !!e._tritiumPipeOut, accent);
  _wfPipe([[chX + chW, chY + chH*0.5], [tnX, chY + chH*0.5], [tnX, tnY + tnH]], S, t, on, 'rgba(120,200,240,0.8)');

  // ── Feed hopper: lithium compound, violet charge visible through the top ──
  _wfShadow(hpX, hpY, hpW, hpH, S, 3*S);
  const hg = ctx.createLinearGradient(hpX, 0, hpX + hpW, 0);
  hg.addColorStop(0, '#8a8e96'); hg.addColorStop(0.45, '#c4c8ce'); hg.addColorStop(1, '#5a5e66');
  ctx.fillStyle = hg; ctx.strokeStyle = '#1e2226'; ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.roundRect(hpX, hpY, hpW, hpH, 3*S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = e._hasCompound ? '#8a6ad0' : '#3a3444';
  ctx.beginPath(); ctx.roundRect(hpX + hpW*0.18, hpY + hpH*0.1, hpW*0.64, hpH*0.3, 2*S); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.8*S;
  for (let q = 1; q < 4; q++) { const by = hpY + hpH*(0.45 + q*0.13); ctx.beginPath(); ctx.moveTo(hpX + 2*S, by); ctx.lineTo(hpX + hpW - 2*S, by); ctx.stroke(); }

  // ── Klystron gallery: RF cabinets with waveguides dropping into the linac ──
  for (let q = 0; q < nKy; q++) {
    const kx = tnX + tnW*(q + 0.5)/nKy, kw = tnW/nKy*0.62;
    // waveguide
    ctx.fillStyle = '#6a5a3a'; ctx.fillRect(kx - 1.6*S, kyY + kyH, 3.2*S, tnY - (kyY + kyH) + 2*S);
    _wfShadow(kx - kw/2, kyY, kw, kyH, S, 2*S);
    const kg = ctx.createLinearGradient(0, kyY, 0, kyY + kyH);
    kg.addColorStop(0, '#3e4a58'); kg.addColorStop(1, '#222a34');
    ctx.fillStyle = kg; ctx.strokeStyle = '#0e1216'; ctx.lineWidth = 1*S;
    ctx.beginPath(); ctx.roundRect(kx - kw/2, kyY, kw, kyH, 2*S); ctx.fill(); ctx.stroke();
    // copper klystron body and its status light, lighting in a travelling wave
    ctx.fillStyle = '#b87a40'; ctx.beginPath(); ctx.roundRect(kx - kw*0.2, kyY + kyH*0.15, kw*0.4, kyH*0.55, kw*0.2); ctx.fill();
    const lit = run && (Math.floor(t*6) % nKy) === q;
    ctx.fillStyle = lit ? beam : run ? '#3a8a70' : on ? '#2a4a40' : '#2a2a2a';
    ctx.beginPath(); ctx.arc(kx, kyY + kyH*0.84, 1.5*S, 0, Math.PI*2); ctx.fill();
    if (run) {
      // RF power dropping down the waveguide into the cavities
      const p = (t*1.6 + q*0.137) % 1, gy0 = kyY + kyH, gl = tnY - gy0;
      ctx.fillStyle = `rgba(255,214,140,${(0.9 - p*0.5).toFixed(2)})`;
      ctx.fillRect(kx - 1.2*S, gy0 + gl*p - 3*S, 2.4*S, 6*S);
      if (lit) {
        const cg = ctx.createRadialGradient(kx, kyY + kyH*0.42, 0, kx, kyY + kyH*0.42, kw*0.9);
        cg.addColorStop(0, 'rgba(255,190,110,0.55)'); cg.addColorStop(1, 'rgba(255,190,110,0)');
        ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(kx, kyY + kyH*0.42, kw*0.9, 0, Math.PI*2); ctx.fill();
      }
    }
    if (detail) {
      // cabinet meter: three bars that jitter with the RF
      for (let b = 0; b < 3; b++) {
        const bh = kyH*0.12*(on ? 0.4 + (run ? 0.6*Math.abs(Math.sin(t*5 + q*1.3 + b*2.1)) : 0.1) : 0.15);
        ctx.fillStyle = on ? '#6ad0a0' : '#2a2a2a';
        ctx.fillRect(kx - kw*0.36 + b*2.2*S, kyY + kyH*0.92 - bh, 1.4*S, bh);
      }
    }
  }

  // ── Ion source ──
  _wfShadow(isX, isY, isW, isH, S, 3*S);
  const ig = ctx.createLinearGradient(0, isY, 0, isY + isH);
  ig.addColorStop(0, '#9aa6b0'); ig.addColorStop(1, '#4a545c');
  ctx.fillStyle = ig; ctx.strokeStyle = '#1a2026'; ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.roundRect(isX, isY, isW, isH, 3*S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = run ? beam : '#34404a';
  ctx.beginPath(); ctx.arc(isX + isW*0.5, midY, Math.min(isW, isH)*0.22, 0, Math.PI*2); ctx.fill();
  if (run) {
    const gg = ctx.createRadialGradient(isX + isW*0.5, midY, 0, isX + isW*0.5, midY, isH*0.6);
    gg.addColorStop(0, 'rgba(154,232,255,0.45)'); gg.addColorStop(1, 'rgba(154,232,255,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(isX + isW*0.5, midY, isH*0.6, 0, Math.PI*2); ctx.fill();
    // corona rings off the high-voltage dome, and the odd arc to the tunnel mouth
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 1*S;
    for (let q = 0; q < 3; q++) {
      const p = (t*1.4 + q/3) % 1;
      ctx.strokeStyle = `rgba(154,232,255,${(0.6*(1 - p)).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(isX + isW*0.5, midY, isH*(0.2 + p*0.55), 0, Math.PI*2); ctx.stroke();
    }
    const seed = Math.floor(t*14);
    if (seed % 3 === 0) {
      const rnd = k => { const v = Math.sin(seed*12.9898 + k*78.233)*43758.5453; return v - Math.floor(v); };
      const ax0 = isX + isW*0.5, span = tnX + 4*S - ax0;
      ctx.strokeStyle = 'rgba(220,245,255,0.9)'; ctx.lineWidth = 1.1*S; ctx.beginPath();
      ctx.moveTo(ax0, midY + (rnd(0) - 0.5)*isH*0.5);
      for (let k = 1; k <= 5; k++) ctx.lineTo(ax0 + span*k/5, midY + (rnd(k) - 0.5)*isH*0.5*(1 - k/5));
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Accelerator tunnel: concrete, cut away to show the beam tube ──
  _wfShadow(tnX, tnY, tnW, tnH, S, 3*S);
  ctx.fillStyle = '#6a6e6a'; ctx.strokeStyle = '#2a2e2a'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.roundRect(tnX, tnY, tnW, tnH, 3*S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1a1e22'; ctx.fillRect(tnX + 3*S, tnY + tnH*0.22, tnW - 6*S, tnH*0.56);
  // accelerating cavities: copper rings along the tube
  const tubeY0 = midY - tnH*0.12, tubeH = tnH*0.24;
  const tg = ctx.createLinearGradient(0, tubeY0, 0, tubeY0 + tubeH);
  tg.addColorStop(0, '#5a646c'); tg.addColorStop(0.4, '#c8d0d6'); tg.addColorStop(1, '#3a4248');
  ctx.fillStyle = tg; ctx.fillRect(tnX + 4*S, tubeY0, tnW - 8*S, tubeH);
  ctx.fillStyle = '#b87a40';
  const nCav = detail ? 22 : 11;
  for (let q = 0; q < nCav; q++) {
    const cx = tnX + 6*S + (tnW - 12*S)*(q + 0.5)/nCav;
    ctx.fillRect(cx - 1.2*S, tubeY0 - 2*S, 2.4*S, tubeH + 4*S);
  }
  // focusing quadrupoles straddling the tube, alternating polarity
  const nQ = 6, qw = 7*S, qh = tnH*0.52, qhh = qh/2 - tubeH/2 - 1*S;
  for (let q = 0; q < nQ; q++) {
    const qx = tnX + tnW*(q + 1)/(nQ + 1);
    for (const qy of [midY - qh/2, midY + tubeH/2 + 1*S]) {
      ctx.fillStyle = q % 2 ? '#3c62b0' : '#b0483c'; ctx.strokeStyle = '#12161a'; ctx.lineWidth = 0.8*S;
      ctx.beginPath(); ctx.roundRect(qx - qw/2, qy, qw, qhh, 1.5*S); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(qx - qw/2 + 1*S, qy + 1*S, qw - 2*S, 1.2*S);
    }
  }
  // beam pulses running toward the target
  if (run) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // the whole bore glows while the beam is up
    const flick = 0.85 + 0.15*Math.sin(t*23);
    const bh = ctx.createLinearGradient(0, midY - tnH*0.3, 0, midY + tnH*0.3);
    bh.addColorStop(0, 'rgba(154,232,255,0)'); bh.addColorStop(0.5, `rgba(154,232,255,${(0.3*flick*glowK).toFixed(3)})`); bh.addColorStop(1, 'rgba(154,232,255,0)');
    ctx.fillStyle = bh; ctx.fillRect(tnX + 4*S, midY - tnH*0.3, tnW - 8*S, tnH*0.6);
    for (let q = 0; q < 3; q++) {
      const p = (t*0.9 + q/3) % 1;
      const bx = tnX + 4*S + (tnW - 8*S)*p;
      const bg = ctx.createLinearGradient(bx - 30*S, 0, bx + 4*S, 0);
      bg.addColorStop(0, 'rgba(154,232,255,0)'); bg.addColorStop(0.85, 'rgba(154,232,255,0.8)'); bg.addColorStop(1, 'rgba(255,255,255,0.95)');
      ctx.fillStyle = bg; ctx.fillRect(bx - 30*S, midY - 1.6*S, 34*S, 3.2*S);
    }
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.8*S;
  for (let q = 1; q < 10; q++) { const lx = tnX + tnW*q/10; ctx.beginPath(); ctx.moveTo(lx, tnY + 1*S); ctx.lineTo(lx, tnY + tnH*0.22); ctx.moveTo(lx, tnY + tnH*0.78); ctx.lineTo(lx, tnY + tnH - 1*S); ctx.stroke(); }

  // ── Target block: stepped shielding, beam window, trefoil ──
  _wfShadow(tbX, tbY, tbW, tbH, S, 4*S);
  const sg = ctx.createLinearGradient(tbX, 0, tbX + tbW, 0);
  sg.addColorStop(0, '#6e7270'); sg.addColorStop(0.5, '#8a8e8a'); sg.addColorStop(1, '#4e5250');
  ctx.fillStyle = sg; ctx.strokeStyle = '#1e2220'; ctx.lineWidth = 1.4*S;
  ctx.beginPath(); ctx.roundRect(tbX, tbY, tbW, tbH, 4*S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#5a5e5c';
  ctx.beginPath(); ctx.roundRect(tbX + tbW*0.1, tbY + tbH*0.08, tbW*0.8, tbH*0.84, 3*S); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.8*S;
  for (let q = 1; q < 6; q++) { const by = tbY + tbH*q/6; ctx.beginPath(); ctx.moveTo(tbX + 2*S, by); ctx.lineTo(tbX + tbW - 2*S, by); ctx.stroke(); }
  // beam line into the block, and the blanket window where it lands
  const wx = tbX + tbW*0.5, wr = Math.min(tbW, tbH)*0.26;
  ctx.fillStyle = '#10161a'; ctx.beginPath(); ctx.arc(wx, midY, wr, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#c8a048'; ctx.lineWidth = 1.6*S; ctx.beginPath(); ctx.arc(wx, midY, wr - 1.5*S, 0, Math.PI*2); ctx.stroke();
  if (run) {
    const pulse = 0.75 + 0.25*Math.sin(t*9);
    const rg = ctx.createRadialGradient(wx, midY, 0, wx, midY, wr*1.1);
    rg.addColorStop(0, `rgba(230,255,245,${(0.95*pulse).toFixed(3)})`);
    rg.addColorStop(0.35, `rgba(128,255,192,${(0.7*pulse).toFixed(3)})`);
    rg.addColorStop(1, 'rgba(128,255,192,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(wx, midY, wr*1.1, 0, Math.PI*2); ctx.fill();
  } else {
    ctx.fillStyle = on ? '#1e3a30' : '#161c1a'; ctx.beginPath(); ctx.arc(wx, midY, wr*0.55, 0, Math.PI*2); ctx.fill();
  }
  ctx.fillStyle = '#10161a'; ctx.fillRect(tnX + tnW, midY - 2*S, wx - wr - (tnX + tnW), 4*S);
  if (run) { ctx.fillStyle = 'rgba(154,232,255,0.75)'; ctx.fillRect(tnX + tnW, midY - 0.8*S, wx - wr - (tnX + tnW), 1.6*S); }
  // lithium blanket: a segmented violet collar round the window, turning while it breeds
  const blR = wr*1.32, blA = run ? t*0.6 : 0;
  ctx.lineWidth = 3.2*S;
  for (let q = 0; q < 8; q++) {
    const a0 = blA + q*Math.PI/4;
    ctx.strokeStyle = e._hasCompound ? (run && (q + Math.floor(t*4)) % 4 === 0 ? '#c8b0ff' : '#8a6ad0') : '#3a3444';
    ctx.beginPath(); ctx.arc(wx, midY, blR, a0 + 0.06, a0 + Math.PI/4 - 0.06); ctx.stroke();
  }
  if (run) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.75 + 0.25*Math.sin(t*9);
    // glow spilling out over the shielding
    const hl = ctx.createRadialGradient(wx, midY, wr*0.5, wx, midY, wr*2.6);
    hl.addColorStop(0, `rgba(128,255,192,${(0.26*pulse*glowK).toFixed(3)})`); hl.addColorStop(1, 'rgba(128,255,192,0)');
    ctx.fillStyle = hl; ctx.beginPath(); ctx.arc(wx, midY, wr*2.6, 0, Math.PI*2); ctx.fill();
    // beam spot flare
    ctx.fillStyle = `rgba(230,255,245,${(0.5*pulse).toFixed(3)})`;
    ctx.fillRect(wx - wr*0.95, midY - 0.7*S, wr*1.9, 1.4*S); ctx.fillRect(wx - 0.7*S, midY - wr*0.95, 1.4*S, wr*1.9);
    // spallation neutrons flying out of the target
    for (let q = 0; q < 12; q++) {
      const ph = t*0.9 + q*0.37, p = ph % 1, a = q*2.399 + Math.floor(ph)*1.7, r = wr*(0.35 + p*1.7);
      ctx.fillStyle = `rgba(210,255,235,${(0.9*(1 - p)).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(wx + Math.cos(a)*r, midY + Math.sin(a)*r, (0.6 + (1 - p)*1.2)*S, 0, Math.PI*2); ctx.fill();
    }
    // counter-rotating sweep inside the window
    ctx.strokeStyle = `rgba(230,255,245,${(0.55*pulse).toFixed(3)})`; ctx.lineWidth = 1.4*S;
    for (let q = 0; q < 3; q++) { const a0 = -t*2.2 + q*2*Math.PI/3; ctx.beginPath(); ctx.arc(wx, midY, wr*0.72, a0, a0 + 0.9); ctx.stroke(); }
    ctx.restore();
  }
  // BEAM ON lamps either side of the tunnel penetration, flashing in turn
  for (const ly of [-1, 1]) {
    const lampOn = run && Math.sin(t*6 + (ly > 0 ? Math.PI : 0)) > 0;
    ctx.fillStyle = lampOn ? '#ff4030' : on ? '#5a1a14' : '#2a2020';
    ctx.beginPath(); ctx.arc(tbX + tbW*0.1, midY + ly*wr*0.9, 1.8*S, 0, Math.PI*2); ctx.fill();
    if (lampOn) { ctx.fillStyle = 'rgba(255,64,48,0.3)'; ctx.beginPath(); ctx.arc(tbX + tbW*0.1, midY + ly*wr*0.9, 5*S, 0, Math.PI*2); ctx.fill(); }
  }
  if (detail) {
    // radiation trefoil on the upper shielding
    const rx = wx, ry = tbY + tbH*0.2, rr = Math.min(tbW, tbH)*0.1;
    ctx.fillStyle = '#e8c030'; ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    for (let q = 0; q < 3; q++) {
      const a0 = -Math.PI/2 + q*2*Math.PI/3 - Math.PI/6;
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.arc(rx, ry, rr*0.85, a0, a0 + Math.PI/3); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#e8c030'; ctx.beginPath(); ctx.arc(rx, ry, rr*0.28, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(rx, ry, rr*0.16, 0, Math.PI*2); ctx.fill();
  }

  // ── Glovebox extraction skid: windowed box with glove ports ──
  _wfShadow(gbX, gbY, gbW, gbH, S, 2*S);
  ctx.fillStyle = '#c8ccd0'; ctx.strokeStyle = '#3a3e42'; ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.roundRect(gbX, gbY, gbW, gbH, 2*S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = run ? 'rgba(128,255,192,0.28)' : 'rgba(60,80,90,0.5)';
  ctx.fillRect(gbX + gbW*0.1, gbY + gbH*0.12, gbW*0.8, gbH*0.46);
  ctx.fillStyle = '#2a2e32';
  for (const gx of [0.32, 0.68]) { ctx.beginPath(); ctx.arc(gbX + gbW*gx, gbY + gbH*0.78, gbH*0.1, 0, Math.PI*2); ctx.fill(); }

  // ── Tritium bottle rack: gold-capped cylinders fill with the buffer ──
  ctx.fillStyle = '#34383a'; ctx.beginPath(); ctx.roundRect(rkX, rkY, rkW, rkH, 2*S); ctx.fill();
  for (let q = 0; q < nB; q++) {
    const bx = rkX + rkW*(q + 0.5)/nB, filled = (q + 1)/nB <= fill + 0.001;
    ctx.fillStyle = filled ? '#d8e4de' : '#6a706c';
    ctx.beginPath(); ctx.roundRect(bx - rkW/nB*0.34, rkY + rkH*0.14, rkW/nB*0.68, rkH*0.76, rkW/nB*0.3); ctx.fill();
    ctx.fillStyle = filled && on ? '#e0b060' : '#4a4038';
    ctx.beginPath(); ctx.arc(bx, rkY + rkH*0.16, rkW/nB*0.24, 0, Math.PI*2); ctx.fill();
    if (filled && run) { ctx.fillStyle = 'rgba(128,255,192,0.5)'; ctx.fillRect(bx - rkW/nB*0.12, rkY + rkH*0.4, rkW/nB*0.24, rkH*0.4); }
  }

  // ── Transformer yard: the 600 kW has to come from somewhere ──
  const nTx = 5;
  for (let q = 0; q < nTx; q++) {
    const tx = w*(0.17 + q*0.1), tw = w*0.07;
    _wfShadow(tx, txY, tw, txH, S, 2*S);
    ctx.fillStyle = '#5a6a5a'; ctx.strokeStyle = '#1a221a'; ctx.lineWidth = 1*S;
    ctx.beginPath(); ctx.roundRect(tx, txY, tw, txH, 2*S); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.8*S;
    for (let r = 1; r < 5; r++) { const fx = tx + tw*r/5; ctx.beginPath(); ctx.moveTo(fx, txY + 2*S); ctx.lineTo(fx, txY + txH - 2*S); ctx.stroke(); }
    ctx.fillStyle = '#c8b890';
    for (const bx of [0.3, 0.7]) { ctx.beginPath(); ctx.arc(tx + tw*bx, txY + 2.5*S, 1.6*S, 0, Math.PI*2); ctx.fill(); }
    ctx.fillStyle = run ? '#ffd040' : on ? '#50c060' : '#3a3228';
    ctx.beginPath(); ctx.arc(tx + tw - 3*S, txY + txH - 3*S, 1.2*S, 0, Math.PI*2); ctx.fill();
  }

  // busbar tying the yard together, current visibly running along it
  const bbY = txY - 3*S, bbX0 = w*0.205, bbX1 = w*(0.205 + (nTx - 1)*0.1);
  ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 1.6*S;
  ctx.beginPath(); ctx.moveTo(bbX0, bbY); ctx.lineTo(bbX1, bbY);
  for (let q = 0; q < nTx; q++) { ctx.moveTo(bbX0 + w*0.1*q, bbY); ctx.lineTo(bbX0 + w*0.1*q, txY + 2*S); }
  ctx.stroke();
  if (on) {
    ctx.fillStyle = `rgba(255,220,120,${run ? 0.95 : 0.5})`;
    for (let q = 0; q < 4; q++) { const p = (t*(run ? 0.7 : 0.2) + q/4) % 1; ctx.fillRect(bbX0 + (bbX1 - bbX0)*p - 2*S, bbY - 1*S, 4*S, 2*S); }
  }

  // ── Chiller for the cavities ──
  _wfShadow(chX, chY, chW, chH, S, 3*S);
  ctx.fillStyle = '#3e464e'; ctx.strokeStyle = '#141a1e'; ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.roundRect(chX, chY, chW, chH, 3*S); ctx.fill(); ctx.stroke();
  _fcFan(chX + chW*0.3, chY + chH*0.5, Math.min(chW, chH)*0.3, S, t, on, 6);
  _fcFan(chX + chW*0.72, chY + chH*0.5, Math.min(chW, chH)*0.3, S, t + 0.3, on, 6);

  // amber beacons turning on the hall corners while the beam is up
  for (const [bx, by, ph] of [[w*0.165, h*0.105, 0], [w*0.665, h*0.80, 2]]) {
    ctx.fillStyle = '#2a2a2e'; ctx.beginPath(); ctx.arc(bx, by, 2.6*S, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = run ? '#ffb030' : on ? '#6a4a18' : '#3a3228'; ctx.beginPath(); ctx.arc(bx, by, 1.7*S, 0, Math.PI*2); ctx.fill();
    if (run) {
      const a = t*5 + ph;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const bg = ctx.createRadialGradient(bx, by, 0, bx, by, 26*S);
      bg.addColorStop(0, 'rgba(255,176,48,0.5)'); bg.addColorStop(1, 'rgba(255,176,48,0)');
      ctx.fillStyle = bg;
      for (const off of [0, Math.PI]) { ctx.beginPath(); ctx.moveTo(bx, by); ctx.arc(bx, by, 26*S, a + off - 0.3, a + off + 0.3); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
  }

  _wfHazardStripe(w*0.70, h*0.905, w*0.2, 3.5*S, S);
  ctx.restore();

  // Text and ports go through toWorld / _portAnchor so they never mirror.
  const [smx, smy] = f.toWorld(tbX + tbW*0.8, tbY);
  _wfSmoke(smx, smy, S*0.5, t, '220,240,235', run, 0.35);
  const [cvx, cvy] = f.toWorld(chX + chW*0.5, chY);
  _wfSmoke(cvx, cvy, S*0.4, t + 3, '200,225,240', on, 0.25);
  _frameText(f, tnX + tnW*0.5, tnY + tnH*0.92, 'LINAC', `bold ${Math.max(4, 5*S)}px Courier New`, run ? '#9ae8ff' : '#5a6468');
  _frameText(f, hpX + hpW*0.5, hpY - 4*S, 'Li', `bold ${Math.max(5, 6*S)}px Courier New`, e._hasCompound ? '#a080e0' : '#5a5064');
  _frameText(f, rkX + rkW*0.5, rkY + rkH + 5*S, '³H', `bold ${Math.max(5, 6*S)}px Courier New`, on ? '#50a080' : '#4a5a54');
  if (st) {
    _portBelt(_portAnchor(e, px, py, f.W, f.H, st.compoundIn), S, t, { belt: '#c0a0ff', label: 'LITHIUM IN', on: !!e._hasCompound, out: false });
    _portPipe(_portAnchor(e, px, py, f.W, f.H, st.tritiumOut), S, t, { fluid: accent, label: 'TRITIUM OUT', on: !!e._tritiumPipeOut, out: true, flow: !!e._tritiumPipeOut });
  }
  const [plx, ply] = f.toWorld(w*0.5, h*0.955);
  _wfPlate('TRITIUM BREEDING FACILITY', plx, ply, S, accent, on);
  _wfLamp(px + f.W - 7*S, py + 7*S, S, t, accent, on);
  ctx.restore();
}
