/* ═══════════════════════════════════════════════════════════════════
   RENDER: OIL & NUCLEAR CHAINS
   Chemical plant, fuel processing, nuclear reactor, cooling tower,
   protectors, deposits, pump jacks, oil storage, and refinery.
   ═══════════════════════════════════════════════════════════════════ */

function renderFuelGenerator(e, px, py, t) {
    // Skid-mounted diesel genset (SiteYard lays the slab), laid out left → right
    // the way a real one is: radiator + pusher fan, a yellow inline-6 with
    // an inspection cutaway (pistons follow the crank phase and flash on the
    // power stroke), turbo and glowing exhaust manifold feeding a horizontal
    // silencer and a tall stack whose rain-cap flap lifts with RPM, the
    // flywheel housing, then a blue alternator and its terminal box cabled
    // to a steel control cabinet (tach, heat, throttle, fuel, LEDs). The skid
    // is the fuel tank: the FUEL IN spool at row + 3.5 tiles (the sim's inlet
    // tile) runs straight into it, and a pad-mount transformer stands in
    // front. Engine state comes from OilSystem.tickFuelEngine.
    // Layout is in units of S (the footprint is 200 units wide).
    const w  = (e.width  || 7) * TILE;
    const h  = (e.height || 6) * TILE;
    const S  = w / 200;
    const X  = u => px + u*S, Y = u => py + u*S;
    const TAU = Math.PI * 2;

    const on       = !!e._fuelled;
    const rpm      = e._fgRpm   || 0;
    const heat     = e._fgHeat  || 0;
    const phase    = e._fgPhase || 0;
    const state    = e._fgState || (on ? 'running' : 'nofuel');
    const throttle = e._fgThrottle || 'normal';
    const critical = state === 'critical';
    const tripped  = state === 'overheat' || critical;
    const cranking = state === 'cranking';
    const burning  = on && state !== 'coasting';
    const detail   = Camera.zoom > 0.5;
    const fuelPct  = Math.min(1, (e._fuelTank || 0) / 60);
    const hot      = Math.max(0, Math.min(1, (heat - 0.35) / 0.65));
    const blink    = Math.sin(t * 9) > 0;
    const lerp     = (a, b, k) => Math.round(a + (b - a) * k);
    const accent   = '#ffa020';
    // Genset livery: deep yellow, dulled while the engine is dead.
    const liv = on ? ['#f6c83c', '#dca422', '#8a6210'] : ['#b8963a', '#927226', '#5a4410'];
    const grad = (y0, y1, a, b, c) => {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, a); g.addColorStop(0.4, b); g.addColorStop(1, c);
      return g;
    };
    const rr = (x, y, ww, hh, r, fill, stroke, lw) => {
      ctx.beginPath(); ctx.roundRect(x, y, ww, hh, r);
      if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || S; ctx.stroke(); }
    };
    const shadow = (x, y, ww, hh, r) => rr(x + 4*S, y + 5*S, ww, hh, r, 'rgba(0,0,0,0.3)');
    const heatTint = (a, b, k) => `rgb(${lerp(a[0], b[0], k)},${lerp(a[1], b[1], k)},${lerp(a[2], b[2], k)})`;
    const wheel = (wx, wy, r, ang, spokes, rim) => {
      ctx.fillStyle = '#1a1a1c'; ctx.strokeStyle = rim; ctx.lineWidth = 1.4*S;
      ctx.beginPath(); ctx.arc(wx, wy, r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1.1*S;
      for (let s = 0; s < spokes; s++) { const sa = ang + (s / spokes) * TAU; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + Math.cos(sa) * r * 0.85, wy + Math.sin(sa) * r * 0.85); ctx.stroke(); }
      ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(wx, wy, 1.6*S, 0, TAU); ctx.fill();
    };
    ctx.save();

    const stubY = py + TILE*3 + TILE/2;

    // No slab of its own: SiteYard lays the concrete yard (and its props)
    // under the plant. Just an oil stain where the skid drips.
    if (detail) {
      ctx.fillStyle = 'rgba(30,26,20,0.2)';
      ctx.beginPath(); ctx.ellipse(X(84), Y(121), 20*S, 3.5*S, 0, 0, TAU); ctx.fill();
    }

    // ── Ambient heat glow ──
    if ((on || hot > 0.3) && detail) {
      ctx.save();
      ctx.globalAlpha = (0.12 + 0.16 * hot) + 0.06 * Math.sin(t * 2.3);
      const gx = X(82), gy = Y(64);
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, w * 0.42);
      g.addColorStop(0, `rgb(255,${lerp(150, 50, hot)},20)`);
      g.addColorStop(1, 'rgba(255,80,10,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gx, gy, w*0.42, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // ── Sub-base fuel tank: the skid the whole set bolts to ──
    shadow(X(16), Y(94), 146*S, 23*S, 2*S);
    rr(X(16), Y(94), 146*S, 23*S, 2*S, grad(Y(94), Y(117), '#5c6066', '#3e4248', '#1c1e22'), '#121416', S);
    ctx.fillStyle = '#74787e'; ctx.fillRect(X(14), Y(92.5), 150*S, 2.5*S);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(X(16), Y(96), 146*S, 1.2*S);
    if (detail) {
      ctx.strokeStyle = 'rgba(10,12,14,0.5)'; ctx.lineWidth = 0.8*S;
      ctx.beginPath();
      for (const u of [54, 92, 130]) { ctx.moveTo(X(u), Y(96)); ctx.lineTo(X(u), Y(116)); }
      ctx.stroke();
    }
    ctx.fillStyle = on ? '#f0b030' : '#a07a30';
    ctx.font = `bold ${Math.max(5, 7*S)}px Arial, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('DIESEL', X(24), Y(106));
    ctx.textBaseline = 'alphabetic';
    // flammable placard
    ctx.save(); ctx.translate(X(68), Y(105.5)); ctx.rotate(Math.PI / 4);
    rr(-3.6*S, -3.6*S, 7.2*S, 7.2*S, 0.6*S, '#d02818', '#f4f0e8', 0.8*S);
    ctx.restore();
    if (detail) {
      ctx.fillStyle = '#f4f0e8';
      ctx.beginPath(); ctx.moveTo(X(68), Y(102.6)); ctx.quadraticCurveTo(X(70.2), Y(105.6), X(68), Y(107.8)); ctx.quadraticCurveTo(X(65.8), Y(105.6), X(68), Y(102.6)); ctx.fill();
    }
    // sight gauge
    const sgX = X(98), sgY = Y(102.5), sgW = 54*S, sgH = 6*S;
    rr(sgX - S, sgY - S, sgW + 2*S, sgH + 2*S, 1.5*S, '#1a1c1e', '#7a7e84', 0.7*S);
    ctx.fillStyle = '#0e0c08'; ctx.fillRect(sgX, sgY, sgW, sgH);
    ctx.fillStyle = fuelPct < 0.1 && blink ? '#ff3020' : '#ffb030';
    ctx.fillRect(sgX, sgY, sgW * Math.max(fuelPct, 0.04), sgH);
    if (detail) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(sgX, sgY + 0.6*S, sgW * Math.max(fuelPct, 0.04), 1.2*S);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.6*S;
      ctx.beginPath();
      for (let k = 1; k < 4; k++) { ctx.moveTo(sgX + sgW*k/4, sgY); ctx.lineTo(sgX + sgW*k/4, sgY + sgH); }
      ctx.stroke();
      ctx.fillStyle = '#c8ccd0'; ctx.font = `bold ${Math.max(3.5, 4*S)}px Arial, sans-serif`; ctx.textAlign = 'center';
      ctx.fillText('E', sgX + 2*S, sgY + sgH + 5*S); ctx.fillText('F', sgX + sgW - 2*S, sgY + sgH + 5*S);
    }

    // ── Radiator + pusher fan ──
    const rdX = X(14), rdY = Y(30), rdW = 30*S, rdH = 63*S;
    shadow(rdX, rdY, rdW, rdH, 2*S);
    rr(rdX, rdY, rdW, rdH, 2*S, grad(rdY, rdY + rdH, liv[0], liv[1], liv[2]), '#3a2a08', S);
    rr(rdX + 3*S, rdY + 7*S, rdW - 6*S, rdH - 12*S, 1.5*S, '#262a2c');
    if (detail) {
      ctx.strokeStyle = 'rgba(96,104,108,0.5)'; ctx.lineWidth = 0.7*S;
      ctx.beginPath();
      for (let y = rdY + 8.5*S; y < rdY + rdH - 5.5*S; y += 2.2*S) { ctx.moveTo(rdX + 4*S, y); ctx.lineTo(rdX + rdW - 4*S, y); }
      ctx.stroke();
    }
    rr(X(25), Y(26), 8*S, 5*S, 1.5*S, '#c0c4c8', '#2a2e30', 0.8*S);   // header tank cap
    const fcx = X(29), fcy = Y(61.5), fanR = 11.5*S;
    ctx.fillStyle = '#121416'; ctx.beginPath(); ctx.arc(fcx, fcy, fanR + 1.8*S, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#7a8286'; ctx.lineWidth = 1.3*S; ctx.stroke();
    ctx.save(); ctx.translate(fcx, fcy);
    const blur = Math.min(1, rpm);
    for (let b = 0; b < 5; b++) {
      const ba = phase * 1.1 + (b/5) * TAU;
      ctx.fillStyle = rpm > 0.02 ? `rgba(170,178,184,${0.88 - 0.48*blur})` : '#7a8286';
      ctx.beginPath(); ctx.ellipse(Math.cos(ba)*fanR*0.5, Math.sin(ba)*fanR*0.5, fanR*0.44, fanR*0.15, ba + 0.25, 0, TAU); ctx.fill();
    }
    if (blur > 0.5 && detail) { ctx.fillStyle = `rgba(150,160,166,${(blur - 0.5)*0.35})`; ctx.beginPath(); ctx.arc(0, 0, fanR*0.92, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#d8a020'; ctx.beginPath(); ctx.arc(0, 0, 2.8*S, 0, TAU); ctx.fill();
    if (detail) {
      // wire guard
      ctx.strokeStyle = 'rgba(200,206,210,0.45)'; ctx.lineWidth = 0.6*S;
      ctx.beginPath(); ctx.arc(0, 0, fanR*0.55, 0, TAU); ctx.moveTo(-fanR, 0); ctx.lineTo(fanR, 0); ctx.moveTo(0, -fanR); ctx.lineTo(0, fanR); ctx.stroke();
    }
    ctx.restore();
    // coolant hoses
    ctx.strokeStyle = '#161616'; ctx.lineWidth = 3*S; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(X(43), Y(36)); ctx.quadraticCurveTo(X(48), Y(35), X(50), Y(43)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(43), Y(87)); ctx.quadraticCurveTo(X(47), Y(87), X(49), Y(82)); ctx.stroke();
    ctx.lineCap = 'butt';

    // ── Silencer on its brackets, and the stack ──
    ctx.fillStyle = '#2a2d31';
    for (const u of [70, 106]) ctx.fillRect(X(u), Y(31), 2.5*S, 12*S);
    const slX = X(56), slY = Y(19), slW = 72*S, slH = 13*S;
    shadow(slX, slY, slW, slH, slH/2);
    rr(slX, slY, slW, slH, slH/2,
       grad(slY, slY + slH, heatTint([214, 218, 222], [255, 170, 110], hot), heatTint([150, 156, 162], [214, 96, 46], hot), heatTint([70, 74, 80], [120, 40, 20], hot)),
       '#22262a', 0.9*S);
    if (detail) {
      // perforated heat shield + end-cap seams
      ctx.fillStyle = 'rgba(30,32,36,0.45)';
      for (let i = 0; i < 13; i++) for (let j = 0; j < 2; j++) {
        ctx.beginPath(); ctx.arc(X(66 + i*4.4 + (j ? 2.2 : 0)), Y(23.5 + j*4), 0.65*S, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(20,22,26,0.55)'; ctx.lineWidth = 0.8*S;
      ctx.beginPath(); ctx.moveTo(X(62), slY + S); ctx.lineTo(X(62), slY + slH - S); ctx.moveTo(X(122), slY + S); ctx.lineTo(X(122), slY + slH - S); ctx.stroke();
    }

    const sx = X(65.5), stkTop = Y(-7), stkBase = Y(21), sw = 10*S;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(sx - sw/2 + 4*S, stkTop + 5*S, sw, stkBase - stkTop);
    const sg = ctx.createLinearGradient(sx - sw/2, 0, sx + sw/2, 0);
    sg.addColorStop(0, '#8a8e92'); sg.addColorStop(0.45, '#e0e4e6'); sg.addColorStop(1, '#4a4e52');
    ctx.fillStyle = sg; ctx.fillRect(sx - sw/2, stkTop, sw, stkBase - stkTop);
    ctx.fillStyle = `rgba(${lerp(60, 255, hot)},${lerp(50, 90, hot)},20,${0.25 + hot*0.6})`; ctx.fillRect(sx - sw/2, stkBase - 9*S, sw, 9*S);
    ctx.fillStyle = '#5a5e62';
    for (const u of [5, 15]) ctx.fillRect(sx - sw/2 - 0.8*S, stkTop + u*S, sw + 1.6*S, 1.6*S);
    ctx.fillStyle = '#1e1e20'; ctx.beginPath(); ctx.ellipse(sx, stkTop, sw/2 + 0.6*S, 1.8*S, 0, 0, TAU); ctx.fill();

    // ═══ Engine assembly — shakes with RPM ═══
    ctx.save();
    if (rpm > 0.02) {
      const shake = S * (cranking ? 0.9 : 0.45) * Math.min(1.4, rpm + (cranking ? 0.6 : 0));
      ctx.translate(Math.sin(t * 71) * shake, Math.cos(t * 53) * shake);
    }
    shadow(X(46), Y(43), 82*S, 50*S, 3*S);
    // sump / oil pan
    rr(X(50), Y(81), 64*S, 12*S, 2*S, grad(Y(81), Y(93), liv[1], liv[2], '#4a3408'), '#3a2a08', S);
    // block
    rr(X(46), Y(47), 72*S, 37*S, 3*S, grad(Y(47), Y(84), liv[0], liv[1], liv[2]),
       tripped ? (blink ? '#ff3020' : '#802010') : '#3a2a08', 1.5*S);
    // head deck
    rr(X(47), Y(42.5), 70*S, 6*S, 1.5*S, '#3e4246', '#1e2022', 0.8*S);
    // fuel injector rail along the head
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.8*S;
    ctx.beginPath(); ctx.moveTo(X(49), Y(45.5)); ctx.lineTo(X(115), Y(45.5)); ctx.stroke();
    if (burning && detail) {
      ctx.strokeStyle = 'rgba(255,176,48,0.95)'; ctx.lineWidth = 0.9*S;
      ctx.setLineDash([2*S, 3*S]); ctx.lineDashOffset = -t*14*S;
      ctx.beginPath(); ctx.moveTo(X(49), Y(45.5)); ctx.lineTo(X(115), Y(45.5)); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }

    // Inspection cutaway: an inline-6, firing order 1-5-3-6-2-4
    const bayX = X(50), bayY = Y(51.5), bayW = 64*S, bayH = 28*S;
    rr(bayX, bayY, bayW, bayH, 2*S, '#141008', '#2a1e06', S);
    const FIRE = [0, 4, 2, 5, 1, 3].map(k => k * TAU / 6);
    const pitch = bayW / 6, cylW = pitch * 0.76, cylH = bayH - 3*S, cylY = bayY + 1.5*S;
    for (let i = 0; i < 6; i++) {
      const cylX = bayX + i*pitch + (pitch - cylW)/2;
      const a    = phase + FIRE[i];
      const pos  = (1 - Math.cos(a)) / 2;
      const pY   = cylY + 2*S + pos * (cylH - 9*S);
      ctx.fillStyle = '#0a0804';
      ctx.strokeStyle = heatTint([90, 90, 96], [230, 70, 30], hot);
      ctx.lineWidth = 1.1*S;
      ctx.beginPath(); ctx.roundRect(cylX, cylY, cylW, cylH, 1.5*S); ctx.fill(); ctx.stroke();
      if (burning) {
        const ph = ((a % TAU) + TAU) % TAU;
        if (ph < 1.0) {
          const k = 1 - ph;
          const boost = throttle === 'overdrive' ? 1 : throttle === 'eco' ? 0.55 : 0.8;
          ctx.fillStyle = `rgba(255,${lerp(220, 120, k)},50,${k * 0.8 * boost})`;
          ctx.fillRect(cylX + 1.1*S, cylY + 1.1*S, cylW - 2.2*S, Math.max(0, pY - cylY - 1.1*S));
        }
      }
      if (detail) {
        ctx.strokeStyle = '#8a8c90'; ctx.lineWidth = 1.3*S;
        ctx.beginPath(); ctx.moveTo(cylX + cylW/2, pY + 4*S); ctx.lineTo(cylX + cylW/2 + Math.sin(a) * 1.8*S, cylY + cylH); ctx.stroke();
      }
      const pg = ctx.createLinearGradient(cylX, 0, cylX + cylW, 0);
      pg.addColorStop(0, '#9aa0a4'); pg.addColorStop(0.5, '#e8ecee'); pg.addColorStop(1, '#6a7074');
      ctx.fillStyle = on ? pg : '#5a5c60';
      ctx.beginPath(); ctx.roundRect(cylX + 0.8*S, pY, cylW - 1.6*S, 4*S, S); ctx.fill();
    }
    // crank damper pulley at the front of the sump
    wheel(X(52), Y(88), 5*S, phase, 5, on ? '#c8ccd0' : '#5a5c60');

    // Rocker covers (one per cylinder, heat-tinted chrome)
    for (let i = 0; i < 6; i++) {
      const vx = bayX + i*pitch + pitch*0.08, vw = pitch*0.84, vy = Y(36.5);
      rr(vx, vy, vw, 7*S, 2*S,
         grad(vy, vy + 7*S, heatTint([234, 238, 240], [255, 150, 90], hot), heatTint([170, 176, 182], [220, 100, 50], hot), heatTint([100, 106, 112], [170, 50, 24], hot)),
         '#2a2c30', 0.7*S);
      if (detail) {
        ctx.fillStyle = 'rgba(40,40,44,0.6)';
        ctx.beginPath(); ctx.arc(vx + vw*0.25, vy + 3.5*S, 0.8*S, 0, TAU); ctx.arc(vx + vw*0.75, vy + 3.5*S, 0.8*S, 0, TAU); ctx.fill();
      }
    }
    // Exhaust manifold along the top, into the turbo
    ctx.fillStyle = heatTint([66, 60, 54], [214, 72, 22], hot);
    ctx.strokeStyle = heatTint([110, 100, 90], [255, 140, 40], hot);
    ctx.lineWidth = 1.1*S;
    if (hot > 0.5 && detail) { ctx.shadowColor = '#ff3010'; ctx.shadowBlur = 10*S*(hot - 0.5)*2; }
    ctx.beginPath(); ctx.roundRect(X(50), Y(32.5), 68*S, 4.5*S, 2.2*S); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    // up-pipe into the silencer
    ctx.fillStyle = heatTint([80, 76, 70], [200, 70, 24], hot); ctx.fillRect(X(118.5), Y(29), 5*S, 6*S);
    // Turbocharger
    const tbX = X(121), tbY = Y(36), tbR = 6.5*S;
    ctx.fillStyle = heatTint([124, 128, 132], [204, 72, 40], hot);
    ctx.beginPath(); ctx.arc(tbX, tbY, tbR, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2a2a2e'; ctx.lineWidth = S; ctx.stroke();
    ctx.save(); ctx.translate(tbX, tbY); ctx.rotate(phase * 3);
    ctx.strokeStyle = '#e0e4e8'; ctx.lineWidth = 0.9*S;
    for (let b = 0; b < 6; b++) { ctx.rotate(Math.PI/3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(tbR*0.4, -tbR*0.2, tbR*0.75, 0); ctx.stroke(); }
    ctx.restore();

    // Flywheel housing (bell) and the flywheel through its inspection port
    ctx.fillStyle = '#3a3e44'; ctx.strokeStyle = '#16181c'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.moveTo(X(117), Y(45)); ctx.lineTo(X(129), Y(49)); ctx.lineTo(X(129), Y(92)); ctx.lineTo(X(117), Y(93)); ctx.closePath(); ctx.fill(); ctx.stroke();
    wheel(X(123), Y(82), 4.5*S, phase, 4, on ? '#c8ccd0' : '#5a5c60');
    ctx.restore();
    // ═══ end shaking engine assembly ═══

    // ── Alternator ──
    const alX = X(129), alY = Y(50), alW = 31*S, alH = 43*S;
    shadow(alX, alY, alW, alH, 5*S);
    const ag = ctx.createLinearGradient(0, alY, 0, alY + alH);
    ag.addColorStop(0, on ? '#3e6eae' : '#33435a'); ag.addColorStop(0.32, on ? '#94bcea' : '#5a6a80'); ag.addColorStop(1, on ? '#1c385e' : '#18202c');
    rr(alX, alY, alW, alH, 5*S, ag, '#101824', S);
    if (detail) {
      ctx.strokeStyle = 'rgba(10,20,34,0.45)'; ctx.lineWidth = 0.8*S;
      ctx.beginPath();
      for (let u = 133; u < 152; u += 3.5) { ctx.moveTo(X(u), Y(52)); ctx.lineTo(X(u), Y(62)); ctx.moveTo(X(u), Y(86)); ctx.lineTo(X(u), Y(91)); }
      ctx.stroke();
    }
    // vented end bell
    rr(X(153), Y(53), 7*S, 37*S, 3*S, on ? '#24426a' : '#1a2230', '#0c121c', 0.8*S);
    if (detail) {
      ctx.fillStyle = '#081018';
      for (let k = 0; k < 6; k++) ctx.fillRect(X(154.5), Y(57 + k*5.2), 4*S, 2*S);
    }
    // rotor seen through the side vent
    const rwx = X(141), rwy = Y(74), rwr = 8*S;
    ctx.fillStyle = '#0c1420'; ctx.beginPath(); ctx.arc(rwx, rwy, rwr, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(rwx, rwy); ctx.rotate(phase);
    ctx.strokeStyle = on ? '#c87a3a' : '#5a4030'; ctx.lineWidth = 1.5*S;
    for (let s = 0; s < 4; s++) { ctx.rotate(Math.PI/4); ctx.beginPath(); ctx.moveTo(-rwr*0.8, 0); ctx.lineTo(rwr*0.8, 0); ctx.stroke(); }
    ctx.restore();
    if (on) { ctx.fillStyle = `rgba(120,200,255,${0.15 + 0.15*Math.sin(t*6)})`; ctx.beginPath(); ctx.arc(rwx, rwy, rwr, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = on ? '#80b0e0' : '#3a4a5a'; ctx.lineWidth = 1.3*S;
    ctx.beginPath(); ctx.arc(rwx, rwy, rwr, 0, TAU); ctx.stroke();
    // feet onto the skid rail
    ctx.fillStyle = '#22262a';
    for (const u of [132, 152]) ctx.fillRect(X(u), Y(91), 5*S, 2.5*S);
    // terminal box + cable conduit to the cabinet
    rr(X(132), Y(42), 19*S, 9*S, 1.5*S, '#4a5462', '#1a2028', 0.8*S);
    if (detail) { ctx.fillStyle = '#e8b820'; ctx.fillRect(X(134), Y(44.5), 4*S, 4*S); _spBolt(X(136), Y(46.5), 0.45*S, '#1a1a1a'); }
    ctx.strokeStyle = '#1e2226'; ctx.lineWidth = 2.6*S; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(X(151), Y(46.5)); ctx.lineTo(X(166), Y(46.5)); ctx.stroke();
    if (on && detail && Math.sin(t * 23 + phase) > 0.9) {
      ctx.strokeStyle = 'rgba(160,220,255,0.95)'; ctx.lineWidth = 0.9*S;
      ctx.beginPath(); ctx.moveTo(X(151), Y(43)); ctx.lineTo(X(155), Y(39)); ctx.lineTo(X(153), Y(36)); ctx.lineTo(X(158), Y(32)); ctx.stroke();
    }

    // ── Stack top: rain-cap flap lifts with RPM, smoke follows the throttle ──
    const puffs = throttle === 'overdrive' ? 7 : throttle === 'eco' ? 3 : 5;
    const smokeDark = throttle === 'overdrive' ? 0.55 : throttle === 'eco' ? 0 : 0.25;
    if (e._scrubber) {
      // Capped — the exhaust is ducted off to the scrubber instead.
      rr(sx - sw/2 - 1.5*S, stkTop - 2*S, sw + 3*S, 3.5*S, 1*S, '#2e4e44');
    } else {
      const kick = (e._fgBackfire || 0) > 0 || (e._fgIgniteFx || 0) > 0;
      const lift = kick ? 1.45 : rpm > 0.02 ? Math.min(1.25, 0.3 + rpm * 0.7) + Math.sin(t * 31) * 0.1 * Math.min(1, rpm) : 0;
      ctx.save(); ctx.translate(sx + sw/2 + 0.6*S, stkTop); ctx.rotate(-lift);
      rr(-sw - 1.6*S, -1.6*S, sw + 1.6*S, 3.2*S, 1.2*S, grad(-1.6*S, 1.6*S, '#c8ccd0', '#8a9094', '#4a4e52'), '#24272a', 0.7*S);
      ctx.restore();
      ctx.fillStyle = '#2a2c30'; ctx.beginPath(); ctx.arc(sx + sw/2 + 0.6*S, stkTop, 1.2*S, 0, TAU); ctx.fill();
    }
    if (detail && !e._scrubber) {
      if (burning) {
        for (let k = 0; k < puffs; k++) {
          const puffT = (t * 0.6 * Math.max(0.6, rpm) + k/puffs) % 1;
          ctx.save(); ctx.globalAlpha = (1-puffT) * 0.5;
          const g0 = lerp(140, 40, smokeDark);
          ctx.fillStyle = `rgb(${g0},${g0 - 6},${g0 - 14})`;
          ctx.beginPath(); ctx.arc(sx + Math.sin(puffT*3 + k)*3*S + puffT*10*S, stkTop - 2*S - puffT*32*S, (3.5 + puffT*10)*S, 0, TAU); ctx.fill();
          ctx.restore();
        }
      }
      if (cranking) {
        for (let k = 0; k < 2; k++) {
          const puffT = (t * 1.8 + k * 0.5) % 1;
          ctx.save(); ctx.globalAlpha = (1-puffT) * 0.3;
          ctx.fillStyle = '#8a8478';
          ctx.beginPath(); ctx.arc(sx + puffT*3*S, stkTop - puffT*18*S, (2 + puffT*5)*S, 0, TAU); ctx.fill();
          ctx.restore();
        }
      }
      if ((e._fgIgniteFx || 0) > 0) {
        const k = 1 - e._fgIgniteFx / 1.2;
        for (let j = 0; j < 3; j++) {
          ctx.save(); ctx.globalAlpha = (1 - k) * 0.75;
          ctx.fillStyle = j === 1 ? '#221e18' : '#141210';
          ctx.beginPath(); ctx.arc(sx + (j-1)*5*S*k, stkTop - k*(26 + j*8)*S, (6 + k*(16 + j*4))*S, 0, TAU); ctx.fill();
          ctx.restore();
        }
      }
      if ((e._fgBackfire || 0) > 0) {
        const k = e._fgBackfire / 0.4;
        const fh = (14 + 14 * k) * S;
        ctx.save(); ctx.globalAlpha = Math.min(1, k * 1.4);
        const fg = ctx.createLinearGradient(sx, stkTop, sx, stkTop - fh);
        fg.addColorStop(0, '#fff0a0'); fg.addColorStop(0.4, '#ff9020'); fg.addColorStop(1, 'rgba(255,40,0,0)');
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.moveTo(sx - 4.5*S, stkTop - 1*S); ctx.quadraticCurveTo(sx - 6*S, stkTop - fh*0.6, sx, stkTop - fh); ctx.quadraticCurveTo(sx + 6*S, stkTop - fh*0.6, sx + 4.5*S, stkTop - 1*S); ctx.fill();
        ctx.restore();
      }
    }

    // ── Flue-gas scrubber (fitted from the panel): the stack tees into a
    // duct that runs over the silencer to an absorber tower standing on the
    // alternator's terminal box, which vents clean vapour. ──
    if (e._scrubber) {
      const scX = X(141.5), scR = 9*S, scTop = Y(4), scBase = Y(43);
      const dY = Y(10.5);
      _scrubberDuct([[sx, dY], [scX - scR, dY]], S, t, burning);
      _scrubberTower(scX, scTop, scBase, scR, S, t, burning);
      if (burning && detail) _scrubberVapour(scX, scTop - 4*S, S, t, puffs, 0.9);
    }

    // Steam off an overheating block
    if (detail && (heat > 0.85 || tripped)) {
      const amt = tripped ? 1 : (heat - 0.85) / 0.15;
      for (let k = 0; k < 4; k++) {
        const st = (t * 0.45 + k * 0.25) % 1;
        ctx.save(); ctx.globalAlpha = (1 - st) * 0.4 * amt;
        ctx.fillStyle = '#eeeee8';
        ctx.beginPath(); ctx.arc(X(76 + 14*k) + Math.sin(st*5 + k)*3*S, Y(33) - st*24*S, (3 + st*7)*S, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }

    // ── Front of the skid: pad-mount transformer, extinguisher ──
    // conduit from the alternator down the tank face to the transformer
    ctx.strokeStyle = '#1e2226'; ctx.lineWidth = 2.2*S; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(X(157), Y(91)); ctx.lineTo(X(157), Y(126)); ctx.lineTo(X(152), Y(126)); ctx.stroke();
    // pad-mount transformer
    const tfX = X(116), tfY = Y(124), tfW = 36*S, tfH = 21*S;
    shadow(tfX, tfY, tfW, tfH, 1.5*S);
    rr(tfX, tfY, tfW, tfH, 1.5*S, grad(tfY, tfY + tfH, '#6e806e', '#5a6a5a', '#3a463a'), '#1e261e', S);
    if (detail) {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = S;
      ctx.beginPath();
      for (let x = tfX + 3*S; x < tfX + tfW - 2*S; x += 3*S) { ctx.moveTo(x, tfY + 3*S); ctx.lineTo(x, tfY + tfH - 2*S); }
      ctx.stroke();
    }
    for (let k = 0; k < 3; k++) {
      const ix = tfX + tfW*(0.2 + k*0.3), iy = tfY - 1*S;
      ctx.fillStyle = '#c8704a';
      for (let q = 0; q < 3; q++) { ctx.beginPath(); ctx.ellipse(ix, iy - q*2.6*S, 2.4*S, 1.1*S, 0, 0, TAU); ctx.fill(); }
      if (on && detail && Math.sin(t*11 + k*2.3) > 0.93) {
        ctx.strokeStyle = 'rgba(210,245,255,0.95)'; ctx.lineWidth = 1*S;
        ctx.beginPath(); ctx.moveTo(ix, iy - 7*S); ctx.lineTo(ix + 3*S, iy - 10*S); ctx.lineTo(ix - 1*S, iy - 13*S); ctx.stroke();
      }
    }
    // extinguisher by the cabinet
    if (detail) {
      rr(X(185), Y(124), 6*S, 15*S, 2.5*S, '#c82418', '#4a0c08', 0.7*S);
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(X(186.8), Y(121.5), 2.4*S, 3*S);
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(X(186), Y(126), 1.2*S, 10*S);
    }

    // ── Control cabinet ──
    const cbX = X(165), cbY = Y(28), cbW = 31*S, cbH = 90*S;
    shadow(cbX, cbY, cbW, cbH, 3*S);
    const cg = ctx.createLinearGradient(cbX, 0, cbX + cbW, 0);
    cg.addColorStop(0, '#b8bec4'); cg.addColorStop(1, '#6a7076');
    rr(cbX, cbY, cbW, cbH, 3*S, cg, '#2a2e32', S);
    rr(cbX - 1.5*S, cbY - 3*S, cbW + 3*S, 4.5*S, 1.5*S, '#4a5056', '#22262a', 0.7*S);   // rain hood
    const panX = cbX + 3*S, panY = cbY + 3*S, panW = cbW - 6*S, panH = cbH - 6*S;
    rr(panX, panY, panW, panH, 2*S, '#0a0e0c');
    const tX = panX + panW/2, tY = panY + 14*S, tR = panW * 0.36;
    const A0 = Math.PI * 0.8, A1 = Math.PI * 2.2;
    const angOf = v => A0 + Math.min(1, Math.max(0, v / 1.5)) * (A1 - A0);
    ctx.fillStyle = '#f0ece0'; ctx.beginPath(); ctx.arc(tX, tY, tR + 2*S, 0, TAU); ctx.fill();
    ctx.lineWidth = 2*S;
    ctx.strokeStyle = '#3a8a40'; ctx.beginPath(); ctx.arc(tX, tY, tR, A0, angOf(1.2)); ctx.stroke();
    ctx.strokeStyle = '#c02010'; ctx.beginPath(); ctx.arc(tX, tY, tR, angOf(1.2), A1); ctx.stroke();
    const needleV = rpm + (rpm > 0.05 ? Math.sin(t * 37) * 0.012 * rpm : 0);
    const na = angOf(needleV);
    ctx.strokeStyle = rpm > 1.2 ? '#ff2010' : '#1a1a1a'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.moveTo(tX, tY); ctx.lineTo(tX + Math.cos(na) * tR * 0.9, tY + Math.sin(na) * tR * 0.9); ctx.stroke();
    ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(tX, tY, 1.5*S, 0, TAU); ctx.fill();
    ctx.textAlign = 'center';
    if (detail) { ctx.fillStyle = 'rgba(60,220,80,0.8)'; ctx.font = `${Math.max(4, 5*S)}px Courier New`; ctx.fillText(`${Math.round(rpm * 1800)}`, tX, tY + tR + 7*S); }
    const hbX = panX + 3*S, hbY = panY + 32*S, hbW = panW - 6*S, hbH = 4*S;
    ctx.fillStyle = '#070a06'; ctx.fillRect(hbX, hbY, hbW, hbH);
    ctx.fillStyle = heat > 0.9 ? (blink ? '#ff3020' : '#801810') : heat > 0.7 ? '#e0a020' : '#40c040';
    ctx.fillRect(hbX, hbY, hbW * Math.min(1, heat), hbH);
    ctx.strokeStyle = '#3a4038'; ctx.lineWidth = 0.6*S; ctx.strokeRect(hbX, hbY, hbW, hbH);
    const modeDef = EntityDefs[T.FUELGEN].throttleModes[throttle];
    const modeTxt = throttle === 'overdrive' ? 'OVRD' : throttle === 'eco' ? 'ECO' : 'NORM';
    ctx.fillStyle = modeDef ? modeDef.color : accent;
    ctx.font = `bold ${Math.max(5, 7*S)}px Courier New`;
    ctx.fillText(modeTxt, tX, panY + 48*S);
    ctx.fillStyle = fuelPct < 0.2 ? '#e83020' : '#30e840';
    ctx.font = `bold ${Math.max(4, 6*S)}px Courier New`;
    ctx.fillText(`F${Math.round(fuelPct * 100)}%`, tX, panY + 58*S);
    // emergency stop
    ctx.fillStyle = '#e8b820'; ctx.beginPath(); ctx.arc(tX, panY + 68*S, 4*S, 0, TAU); ctx.fill();
    ctx.fillStyle = tripped && blink ? '#ff4030' : '#c41c12'; ctx.beginPath(); ctx.arc(tX, panY + 68*S, 2.7*S, 0, TAU); ctx.fill();
    ctx.textAlign = 'left';
    const ledY = panY + panH - 6*S;
    [
      [panX + panW*0.2, burning,                          '#20ff20', '#0a1a08'],
      [panX + panW*0.5, cranking && blink,                '#ffb010', '#1a0e04'],
      [panX + panW*0.8, (tripped || heat > 0.9) && blink, '#ff3020', '#1a0604'],
    ].forEach(([lx, lit, col, dim]) => {
      ctx.fillStyle = lit ? col : dim;
      ctx.beginPath(); ctx.arc(lx, ledY, 2.5*S, 0, TAU); ctx.fill();
      if (lit && detail) { ctx.save(); ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(lx, ledY, 5*S, 0, TAU); ctx.fill(); ctx.restore(); }
    });

    // ── FUEL IN spool (left face): flanges, gate valve, status lamp — red
    // with no pipe on the inlet tile, amber once one is laid, green while
    // fuel is moving (chevrons run in and the handwheel turns). ──
    const inRow = Math.floor((e.height || 6) / 2);
    const ip = !e._ghost && GridManager.inBounds(e.col - 1, e.row + inRow) ? GridManager.getEntity(e.col - 1, e.row + inRow) : null;
    const piped = !!ip && (ip.type === T.PIPE || ip.type === T.UNDERGNDPIPE || !!ip._underPipe);
    const L = 16*S;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px + 2*S, stubY - 2*S, L, 9*S);
    const spg = ctx.createLinearGradient(0, stubY - 4.5*S, 0, stubY + 4.5*S);
    spg.addColorStop(0, '#9a948a'); spg.addColorStop(0.35, '#6a645a'); spg.addColorStop(1, '#221e1a');
    ctx.fillStyle = spg; ctx.fillRect(px, stubY - 4.5*S, L, 9*S);
    ctx.fillStyle = '#ffb040'; ctx.fillRect(px + L*0.62, stubY - 4.5*S, 2.5*S, 9*S);
    if (burning && detail) {
      ctx.fillStyle = 'rgba(255,220,140,0.9)';
      for (let k = 0; k < 2; k++) {
        const cx = px + 4*S + ((t * 0.9 + k / 2) % 1) * (L - 8*S);
        ctx.beginPath(); ctx.moveTo(cx - 1.6*S, stubY - 2.4*S); ctx.lineTo(cx + 1.6*S, stubY); ctx.lineTo(cx - 1.6*S, stubY + 2.4*S); ctx.closePath(); ctx.fill();
      }
    }
    for (const fx of [px, px + L - 3*S]) {
      rr(fx, stubY - 7*S, 3*S, 14*S, S, '#3a3630', '#141210', S);
      if (detail) {
        ctx.fillStyle = '#a8a298';
        for (const by of [-5, -1.8, 1.8, 5]) { ctx.beginPath(); ctx.arc(fx + 1.5*S, stubY + by*S, 0.7*S, 0, TAU); ctx.fill(); }
      }
    }
    ctx.save(); ctx.translate(px + L*0.36, stubY); ctx.rotate(burning ? t*2.2 : 0.4);
    ctx.strokeStyle = '#141210'; ctx.lineWidth = 2.2*S;
    ctx.beginPath(); ctx.arc(0, 0, 4*S, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#ffb040'; ctx.lineWidth = 1.3*S;
    ctx.beginPath(); ctx.arc(0, 0, 4*S, 0, TAU); ctx.stroke();
    ctx.lineWidth = 0.9*S;
    for (let k = 0; k < 3; k++) { const a = k*TAU/3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a)*4*S, Math.sin(a)*4*S); ctx.stroke(); }
    ctx.restore();
    if (!e._ghost) {
      const lamp = burning ? '#40e070' : piped ? '#ffb020' : (Math.sin(t*4) > 0 ? '#e03020' : '#601810');
      const lx = px + L*0.78, ly = stubY - 8*S;
      ctx.fillStyle = '#1a1814'; ctx.beginPath(); ctx.arc(lx, ly, 2.4*S, 0, TAU); ctx.fill();
      ctx.fillStyle = lamp; ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(lx, ly, 4*S, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(lx, ly, 1.6*S, 0, TAU); ctx.fill();
    }
    // label plate on the ground under the spool
    {
      ctx.font = `bold ${Math.max(5, 6*S)}px Courier New`;
      const label = 'FUEL IN', ph = 9*S, pw = ctx.measureText(label).width + 8*S;
      const x0 = X(4), ly = Y(126);
      rr(x0, ly - ph/2, pw, ph, 1.5*S, 'rgba(12,10,6,0.85)', burning ? '#ffb040' : '#3a3020', 0.8*S);
      ctx.fillStyle = '#ffb040'; ctx.fillRect(x0 + 2*S, ly - ph/2 + 2*S, 2*S, ph - 4*S);
      ctx.fillStyle = burning ? '#f0e0c0' : 'rgba(170,150,110,0.85)';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(label, x0 + 5.5*S, ly + 0.4*S);
      ctx.textBaseline = 'alphabetic';
    }
    ctx.lineJoin = 'miter';

    if (e._ghost) { ctx.restore(); return; }   // placement preview: model only, no status text
    const outW = Math.round((e.def && e.def.powerOutput) || 0);
    let label, labelCol;
    if (state === 'wrecked')      { label = 'WRECKED'; labelCol = '#8a6a30'; }
    else if (critical)            { label = `MELTDOWN ${Math.ceil(MeltdownSystem.timeLeft(e) || 0)}s`; labelCol = blink ? '#ff4630' : '#ffbe3c'; }
    else if (tripped)             { label = `OVERHEAT ${Math.ceil(e._fgTrip || 0)}s`; labelCol = blink ? '#ff4630' : '#ffbe3c'; }
    else if (cranking)            { label = 'CRANKING' + '.'.repeat(1 + Math.floor(t * 3) % 3); labelCol = '#ffbe3c'; }
    else if (on)                  { label = `DIESEL GEN  ${formatPower(outW)}`; labelCol = accent; }
    else if (state === 'nogrid')  { label = 'NO GRID'; labelCol = '#8a6a30'; }
    else                          { label = 'NO FUEL'; labelCol = '#8a6a30'; }
    _wfPlate(label, px + w*0.5, py + h*0.955, S, labelCol, on || tripped || cranking);
    ctx.restore();
    drawNetworkHighlight(e, px, py, t);
  }

// ── Surge protector shared parts ──
// Load fraction and its traffic-light colour (accent below 50%).
function _spLoad(e, dflt, accent) {
  const effThr = e._effectiveThreshold || dflt;
  const pct = Math.min(1, (e.load || 0) / effThr);
  return [pct, pct > 0.85 ? '#ff7a20' : pct > 0.5 ? '#ffe040' : accent];
}
// A polymer-housed arrester: a stack of grey sheds on a rod, a metal top
// cap and a small grading ring. x is the axis, yBot/yTop in pixels.
function _spArrester(x, yBot, yTop, S, rx, n, lit, accent) {
  ctx.fillStyle = '#7c848c';
  ctx.fillRect(x - 1.3 * S, yTop, 2.6 * S, yBot - yTop);
  const step = (yBot - yTop - 3 * S) / n;
  for (let i = 0; i < n; i++) {
    const y = yBot - (i + 0.6) * step;
    ctx.fillStyle = '#6f767e';
    ctx.beginPath(); ctx.ellipse(x, y + 0.5 * S, rx, rx * 0.36, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c3c8ce';
    ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.34, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.ellipse(x - rx * 0.25, y - rx * 0.08, rx * 0.45, rx * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Top cap + grading ring
  ctx.fillStyle = '#5c6670'; ctx.fillRect(x - 2 * S, yTop, 4 * S, 3 * S);
  ctx.strokeStyle = lit ? accent : '#4a5660'; ctx.lineWidth = 1.2 * S;
  ctx.beginPath(); ctx.ellipse(x, yTop + 0.5 * S, rx * 0.95, rx * 0.34, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#aeb6be';
  ctx.beginPath(); ctx.arc(x, yTop - 0.3 * S, 1.3 * S, 0, Math.PI * 2); ctx.fill();
}
// Jagged electric arc between two points; re-rolls ~20 times a second.
function _spArc(x1, y1, x2, y2, S, t, seed, col) {
  const k = Math.floor(t * 20);
  const rnd = i => { const s = Math.sin((k + i * 13.1) * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s); };
  const segs = 6, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const pts = [[x1, y1]];
  for (let i = 1; i < segs; i++) {
    const off = (rnd(i) - 0.5) * 5 * S;
    pts.push([x1 + dx * i / segs + nx * off, y1 + dy * i / segs + ny * off]);
  }
  pts.push([x2, y2]);
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [w, c] of [[3.2 * S, col], [1 * S, '#ffffff']]) {
    ctx.strokeStyle = c; ctx.lineWidth = w; ctx.globalAlpha = w > 2 * S ? 0.45 : 0.95;
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
  }
  ctx.restore();
}
function _spRR(x, y, w, h, r, fill, stroke, lw) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
}
function _spBolt(cx, cy, s, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(cx + 1.5 * s, cy - 3.5 * s); ctx.lineTo(cx - 1.8 * s, cy + 0.4 * s); ctx.lineTo(cx - 0.1 * s, cy + 0.4 * s);
  ctx.lineTo(cx - 1.5 * s, cy + 3.5 * s); ctx.lineTo(cx + 1.8 * s, cy - 0.6 * s); ctx.lineTo(cx + 0.1 * s, cy - 0.6 * s);
  ctx.closePath(); ctx.fill();
}

function renderProtector(e, px, py, t) {
    // Surge Protector — 1×1. A steel control box on a small pad carrying
    // two polymer arresters; a spark jumps the gap between their caps now
    // and then while it's on the grid, constantly when the network is hot.
    const S = TILE / 40;
    const X = v => px + v * S, Y = v => py + v * S;
    const on = !!e.powered, accent = '#40e0ff';
    const [pct, loadCol] = _spLoad(e, 85, accent);
    ctx.save();

    if (on && Camera.zoom > 0.5) {  // LOD: skip glow gradient when zoomed out
      drawGlowHalo(X(20), Y(12), TILE * 0.62, [[0, pct > 0.85 ? '#ff9040' : accent], [1, 'transparent']], 0.16 + 0.06 * Math.sin(t * 4));
    }

    // Pad
    _spRR(X(4.5), Y(7), 33 * S, 32 * S, 2.5 * S, 'rgba(0,0,0,0.26)');
    _spRR(X(3), Y(5), 34 * S, 32 * S, 2.5 * S, '#8a8e94', '#6a6e74', S);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(X(4), Y(6), 32 * S, 1 * S);
    // Ground lead (green/yellow) to the corner rod
    ctx.strokeStyle = '#3aa040'; ctx.lineWidth = 1.2 * S;
    ctx.beginPath(); ctx.moveTo(X(31), Y(30)); ctx.quadraticCurveTo(X(35), Y(32), X(34.5), Y(35)); ctx.stroke();
    ctx.fillStyle = '#b07840'; ctx.beginPath(); ctx.arc(X(34.5), Y(35), 1.1 * S, 0, Math.PI * 2); ctx.fill();

    // Arresters (behind the box top)
    _spArrester(X(13), Y(20), Y(8), S, 4 * S, 4, on, accent);
    _spArrester(X(27), Y(20), Y(8), S, 4 * S, 4, on, accent);
    if (on) {
      const hot = pct > 0.85;
      const fire = hot ? Math.sin(t * 9) > -0.4 : (Math.sin(t * 1.7) + Math.sin(t * 4.3)) > 1.6;
      if (fire) _spArc(X(15), Y(7.5), X(25), Y(7.5), S, t, 1, hot ? '#ff9a40' : accent);
    }

    // Control box
    const g = ctx.createLinearGradient(X(7), 0, X(33), 0);
    g.addColorStop(0, '#2c3844'); g.addColorStop(0.4, '#50606f'); g.addColorStop(1, '#27313b');
    _spRR(X(7), Y(18), 26 * S, 17 * S, 2 * S, g, '#141a20', S);
    ctx.fillStyle = '#6a7886'; ctx.fillRect(X(7), Y(18), 26 * S, 1.6 * S);
    // Hazard placard
    ctx.fillStyle = '#f0c020';
    ctx.beginPath(); ctx.moveTo(X(11), Y(21)); ctx.lineTo(X(14.8), Y(27.5)); ctx.lineTo(X(7.2 + 0.8), Y(27.5)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 0.6 * S; ctx.stroke();
    _spBolt(X(11), Y(25), 0.75 * S, '#1a1a1a');
    // Load LEDs — fill left→right with load
    for (let i = 0; i < 3; i++) {
      const lx = X(19 + i * 4.5), ly = Y(23.5);
      const lit = on && (i === 0 || pct > i / 3);
      ctx.fillStyle = '#0a0e12'; ctx.beginPath(); ctx.arc(lx, ly, 1.7 * S, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = lit ? loadCol : '#1a2a30'; ctx.beginPath(); ctx.arc(lx, ly, 1.15 * S, 0, Math.PI * 2); ctx.fill();
    }
    // Load bar
    _spRR(X(17), Y(28.5), 13 * S, 3 * S, 0.8 * S, '#081218', '#0a0e12', 0.6 * S);
    if (on) { ctx.fillStyle = loadCol; ctx.fillRect(X(17.6), Y(29.1), 11.8 * S * pct, 1.8 * S); }
    ctx.restore();
  }

function renderProtector2(e, px, py, t) {
    if (e.col * TILE !== px || e.row * TILE !== py) return;
    // Surge Protector MK2 — 2×2 arrester bay. Three tall arrester columns on
    // steel stands with surge counters, tied by a bus bar across their
    // grading rings, behind a control cabinet with a 5-segment load meter.
    // Arcs crackle between the rings, continuously when the network is hot.
    const S = TILE / 40;
    const X = v => px + v * S, Y = v => py + v * S;
    const on = !!e.powered, accent = '#00ffcc';
    const [pct, loadCol] = _spLoad(e, 250, accent);
    const hot = pct > 0.85;
    ctx.save();

    if (on && Camera.zoom > 0.5) {  // LOD: skip glow gradient when zoomed out
      drawGlowHalo(X(40), Y(22), TILE * 1.25, [[0, hot ? '#ff9040' : accent], [1, 'transparent']], 0.18 + 0.07 * Math.sin(t * 3));
    }

    // ── Pad with yellow curb and corner bollards ──
    _spRR(X(4), Y(6), 75 * S, 74 * S, 3 * S, 'rgba(0,0,0,0.26)');
    _spRR(X(2), Y(3), 76 * S, 75 * S, 3 * S, '#d0a420');
    _spRR(X(4), Y(5), 72 * S, 71 * S, 2 * S, '#8a8e94');
    // gravel speckle
    ctx.fillStyle = 'rgba(60,64,70,0.35)';
    for (let i = 0; i < 40; i++) {
      const gx = 6 + ((i * 37) % 68), gy = 7 + ((i * 53) % 42);
      ctx.fillRect(X(gx), Y(gy), 1 * S, 1 * S);
    }
    for (const [bx, by] of [[6.5, 7.5], [73.5, 7.5], [6.5, 73.5], [73.5, 73.5]]) {
      ctx.fillStyle = '#22262a'; ctx.beginPath(); ctx.arc(X(bx), Y(by), 2 * S, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f0c020'; ctx.beginPath(); ctx.arc(X(bx), Y(by), 1.3 * S, 0, Math.PI * 2); ctx.fill();
    }

    // ── Ground grid leads ──
    ctx.strokeStyle = '#3aa040'; ctx.lineWidth = 1.2 * S;
    for (const cx of [20, 40, 60]) {
      ctx.beginPath(); ctx.moveTo(X(cx + 3), Y(46)); ctx.lineTo(X(cx + 6), Y(48)); ctx.lineTo(X(cx + 6), Y(50)); ctx.stroke();
    }

    // ── Arrester columns ──
    const cols = [20, 40, 60];
    for (const cx of cols) {
      // Stand + surge counter
      ctx.fillStyle = '#48525c'; ctx.fillRect(X(cx - 4), Y(42), 8 * S, 6 * S);
      ctx.fillStyle = '#2e363e'; ctx.fillRect(X(cx - 4), Y(46.5), 8 * S, 1.5 * S);
      _spRR(X(cx + 2.5), Y(38.5), 5 * S, 5 * S, 2.5 * S, '#1a2026', '#6a747e', 0.6 * S);
      ctx.fillStyle = on ? '#d8f0e8' : '#5a646c'; ctx.beginPath(); ctx.arc(X(cx + 5), Y(41), 1.7 * S, 0, Math.PI * 2); ctx.fill();
      const ang = -Math.PI * 0.75 + (on ? pct * Math.PI : 0);
      ctx.strokeStyle = '#d02020'; ctx.lineWidth = 0.5 * S;
      ctx.beginPath(); ctx.moveTo(X(cx + 5), Y(41)); ctx.lineTo(X(cx + 5) + Math.cos(ang) * 1.5 * S, Y(41) + Math.sin(ang) * 1.5 * S); ctx.stroke();
      _spArrester(X(cx), Y(42), Y(13), S, 5.5 * S, 7, on, accent);
    }
    // Bus bar across the caps, on post insulators at each end
    ctx.strokeStyle = '#b8864a'; ctx.lineWidth = 2 * S; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(X(9), Y(10)); ctx.lineTo(X(71), Y(10)); ctx.stroke();
    ctx.strokeStyle = '#e8b878'; ctx.lineWidth = 0.6 * S;
    ctx.beginPath(); ctx.moveTo(X(9), Y(9.4)); ctx.lineTo(X(71), Y(9.4)); ctx.stroke();
    for (const cx of cols) { ctx.fillStyle = '#8a929a'; ctx.fillRect(X(cx - 0.8), Y(10), 1.6 * S, 3 * S); }
    for (const ex of [9, 71]) {
      _spArrester(X(ex), Y(22), Y(10), S, 2.6 * S, 4, on, accent);
    }
    // Arcs between neighbouring rings
    if (on) {
      for (let i = 0; i < 2; i++) {
        const phase = t * (hot ? 7 : 1.3) + i * 2.1;
        const fire = hot ? Math.sin(phase) > -0.5 : (Math.sin(phase) + Math.sin(phase * 2.9)) > 1.55;
        if (fire) _spArc(X(cols[i] + 5.5), Y(15), X(cols[i + 1] - 5.5), Y(15), S, t, i + 3, hot ? '#ff9a40' : accent);
      }
    }

    // ── Control cabinet ──
    const g = ctx.createLinearGradient(X(10), 0, X(70), 0);
    g.addColorStop(0, '#26303a'); g.addColorStop(0.35, '#4c5c6c'); g.addColorStop(0.7, '#3e4c5a'); g.addColorStop(1, '#222b34');
    _spRR(X(10), Y(50), 60 * S, 23 * S, 2.5 * S, g, '#10161c', S);
    ctx.fillStyle = '#687686'; ctx.fillRect(X(10.5), Y(50), 59 * S, 2 * S);
    // Door seam
    ctx.strokeStyle = 'rgba(10,14,18,0.7)'; ctx.lineWidth = 0.7 * S;
    ctx.beginPath(); ctx.moveTo(X(40), Y(53)); ctx.lineTo(X(40), Y(72)); ctx.stroke();
    // MK2 plate
    _spRR(X(13), Y(54), 13 * S, 7 * S, 1 * S, '#0a1418', on ? accent : '#1a3040', 0.8 * S);
    ctx.fillStyle = on ? accent : '#2a4450';
    ctx.font = `bold ${5 * S}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('MK2', X(19.5), Y(57.7));
    // Hazard placard
    ctx.fillStyle = '#f0c020';
    ctx.beginPath(); ctx.moveTo(X(19.5), Y(63)); ctx.lineTo(X(24), Y(70.5)); ctx.lineTo(X(15), Y(70.5)); ctx.closePath(); ctx.fill();
    _spBolt(X(19.5), Y(67.6), 0.8 * S, '#1a1a1a');
    // 5-segment load meter
    for (let i = 0; i < 5; i++) {
      const lit = on && (i === 0 || pct > i / 5);
      const segCol = !on ? '#16242a' : i >= 4 ? '#ff7a20' : i >= 3 ? '#ffe040' : accent;
      _spRR(X(44 + i * 4.6), Y(54), 3.6 * S, 6 * S, 0.6 * S, lit ? segCol : '#12202a');
      if (lit) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(X(44.5 + i * 4.6), Y(54.6), 2.6 * S, 0.8 * S); }
    }
    // Load bar
    _spRR(X(44), Y(62.5), 22.6 * S, 3 * S, 0.8 * S, '#081218', '#0a0e12', 0.6 * S);
    if (on) { ctx.fillStyle = loadCol; ctx.fillRect(X(44.6), Y(63.1), 21.4 * S * pct, 1.8 * S); }
    // Vent grille
    ctx.strokeStyle = 'rgba(10,14,18,0.75)'; ctx.lineWidth = 0.7 * S;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(X(44), Y(68 + i * 1.8)); ctx.lineTo(X(66.6), Y(68 + i * 1.8)); ctx.stroke(); }
    // Status beacon
    const blink = on && (hot ? Math.sin(t * 8) > 0 : Math.sin(t * 2) > 0.2);
    ctx.fillStyle = blink ? (hot ? '#ff5030' : accent) : '#1a2a30';
    ctx.beginPath(); ctx.arc(X(34), Y(57), 1.6 * S, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

function renderProtector3(e, px, py, t) {
    if (e.col * TILE !== px || e.row * TILE !== py) return;
    // Surge Protector MK3 — 3×3 gas-insulated arrester bay. Five tall GIS
    // columns under a two-level lattice gantry, a row of SF6 tanks with a
    // forced-cooling fan bank, and a walk-in control house with a full
    // instrument face. Reads as the same family as the MK2 (arrester stacks,
    // grading rings, bus bar, load meter) one class up: taller columns, a
    // doubled bus, and violet corona instead of cyan.
    //
    // Coordinate space is the MK2's, scaled to the bigger pad: S = TILE/40 so
    // v units run 40-to-a-tile, and a 3×3 spans 0..120 where the MK2 spanned
    // 0..80. Keeping the same unit means the shared _sp* parts (arresters,
    // arcs, rounded rects) drop in at matching visual weight.
    const S = TILE / 40;
    const X = v => px + v * S, Y = v => py + v * S;
    const on = !!e.powered, accent = '#b070ff', accentHot = '#ff9a40';
    const [pct, loadCol] = _spLoad(e, 85 * 360, accent);
    const hot = pct > 0.85;
    const col = hot ? accentHot : accent;
    ctx.save();

    if (on && Camera.zoom > 0.5) {  // LOD: skip glow gradient when zoomed out
      drawGlowHalo(X(60), Y(34), TILE * 2.0, [[0, col], [1, 'transparent']], 0.20 + 0.08 * Math.sin(t * 3));
    }

    // ── Pad: violet-banded curb over concrete, gravel, corner bollards ──
    _spRR(X(5), Y(8), 113 * S, 111 * S, 4 * S, 'rgba(0,0,0,0.28)');
    _spRR(X(2), Y(4), 116 * S, 113 * S, 4 * S, '#6a3ab0');
    _spRR(X(4.5), Y(6.5), 111 * S, 108 * S, 3 * S, '#7d838a');
    ctx.fillStyle = 'rgba(56,60,68,0.35)';
    for (let i = 0; i < 90; i++) {
      const gx = 7 + ((i * 41) % 105), gy = 9 + ((i * 59) % 104);
      ctx.fillRect(X(gx), Y(gy), 1 * S, 1 * S);
    }
    // Ground grid mat — the copper lattice that actually sinks a strike.
    // Drawn under everything else so the hardware sits on top of it.
    ctx.strokeStyle = 'rgba(70,170,80,0.30)'; ctx.lineWidth = 0.8 * S;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(X(10), Y(14 + i * 24)); ctx.lineTo(X(110), Y(14 + i * 24)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(10 + i * 25), Y(14)); ctx.lineTo(X(10 + i * 25), Y(110)); ctx.stroke();
    }
    for (const bp of [[8.5, 10.5], [111.5, 10.5], [8.5, 111.5], [111.5, 111.5]]) {
      ctx.fillStyle = '#22262a'; ctx.beginPath(); ctx.arc(X(bp[0]), Y(bp[1]), 2.6 * S, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e0b0ff'; ctx.beginPath(); ctx.arc(X(bp[0]), Y(bp[1]), 1.7 * S, 0, Math.PI * 2); ctx.fill();
    }

    // ── Lattice gantry: two crossbraced towers carrying the doubled bus ──
    const gantry = (gx) => {
      ctx.strokeStyle = '#5a636d'; ctx.lineWidth = 1.5 * S;
      ctx.beginPath(); ctx.moveTo(X(gx - 3), Y(52)); ctx.lineTo(X(gx - 3), Y(9)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(gx + 3), Y(52)); ctx.lineTo(X(gx + 3), Y(9)); ctx.stroke();
      ctx.strokeStyle = 'rgba(120,130,142,0.8)'; ctx.lineWidth = 0.7 * S;
      for (let i = 0; i < 7; i++) {
        const y0 = 52 - i * 6.2, y1 = y0 - 6.2;
        ctx.beginPath(); ctx.moveTo(X(gx - 3), Y(y0)); ctx.lineTo(X(gx + 3), Y(y1)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(X(gx + 3), Y(y0)); ctx.lineTo(X(gx - 3), Y(y1)); ctx.stroke();
      }
    };
    gantry(10); gantry(110);

    // ── GIS arrester columns ──
    const cols = [26, 43, 60, 77, 94];
    for (const cx of cols) {
      // Ground lead down to the mat
      ctx.strokeStyle = '#3aa040'; ctx.lineWidth = 1.3 * S;
      ctx.beginPath(); ctx.moveTo(X(cx + 4), Y(50)); ctx.lineTo(X(cx + 7), Y(53)); ctx.lineTo(X(cx + 7), Y(56)); ctx.stroke();
      // Stand + surge counter with a live needle
      ctx.fillStyle = '#48525c'; ctx.fillRect(X(cx - 5), Y(44), 10 * S, 7 * S);
      ctx.fillStyle = '#2e363e'; ctx.fillRect(X(cx - 5), Y(49.5), 10 * S, 1.6 * S);
      _spRR(X(cx + 3), Y(39.5), 5.5 * S, 5.5 * S, 2.75 * S, '#160e26', '#6a747e', 0.6 * S);
      ctx.fillStyle = on ? '#e8dcf8' : '#5a646c';
      ctx.beginPath(); ctx.arc(X(cx + 5.75), Y(42.25), 1.9 * S, 0, Math.PI * 2); ctx.fill();
      const ang = -Math.PI * 0.75 + (on ? pct * Math.PI : 0);
      ctx.strokeStyle = '#d02020'; ctx.lineWidth = 0.5 * S;
      ctx.beginPath(); ctx.moveTo(X(cx + 5.75), Y(42.25));
      ctx.lineTo(X(cx + 5.75) + Math.cos(ang) * 1.7 * S, Y(42.25) + Math.sin(ang) * 1.7 * S); ctx.stroke();
      // The column itself — taller and fatter than the MK2's, 9 sheds
      _spArrester(X(cx), Y(44), Y(12), S, 6.5 * S, 9, on, col);
    }

    // ── Doubled bus bar, upper and lower, on post insulators ──
    for (const bus of [[9, 2.4], [15.5, 1.8]]) {
      const by = bus[0], lw = bus[1];
      ctx.strokeStyle = '#b8864a'; ctx.lineWidth = lw * S; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(X(10), Y(by)); ctx.lineTo(X(110), Y(by)); ctx.stroke();
      ctx.strokeStyle = '#e8b878'; ctx.lineWidth = 0.6 * S;
      ctx.beginPath(); ctx.moveTo(X(10), Y(by - lw * 0.32)); ctx.lineTo(X(110), Y(by - lw * 0.32)); ctx.stroke();
    }
    for (const cx of cols) { ctx.fillStyle = '#8a929a'; ctx.fillRect(X(cx - 0.9), Y(9), 1.8 * S, 3.2 * S); }
    // Charge pulse running the upper bus — reads as live current, and speeds
    // up with load, so a strained bay is legible without reading the meter.
    if (on) {
      const travel = (t * (0.18 + pct * 0.5)) % 1;
      const hx = 10 + travel * 100;
      const grad = ctx.createRadialGradient(X(hx), Y(9), 0, X(hx), Y(9), 11 * S);
      grad.addColorStop(0, hot ? 'rgba(255,190,120,0.95)' : 'rgba(215,180,255,0.95)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(X(hx), Y(9), 11 * S, 0, Math.PI * 2); ctx.fill();
    }
    // Arcs between neighbouring grading rings
    if (on) {
      for (let i = 0; i < cols.length - 1; i++) {
        const phase = t * (hot ? 7 : 1.3) + i * 1.7;
        const fire = hot ? Math.sin(phase) > -0.5 : (Math.sin(phase) + Math.sin(phase * 2.9)) > 1.6;
        if (fire) _spArc(X(cols[i] + 6.5), Y(17), X(cols[i + 1] - 6.5), Y(17), S, t, i + 7, col);
      }
    }

    // ── SF6 tank row ──
    for (const tx of [20, 47, 74]) {
      _spRR(X(tx), Y(58), 24 * S, 9 * S, 4.5 * S, '#4a5460', '#161c24', 0.9 * S);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(X(tx + 2), Y(59.6), 20 * S, 1.6 * S);
      // Gas-density gauge: green while the bay is live, dark when it isn't
      ctx.fillStyle = '#131820'; ctx.beginPath(); ctx.arc(X(tx + 20), Y(62.5), 2.2 * S, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = on ? '#50e070' : '#28323a'; ctx.beginPath(); ctx.arc(X(tx + 20), Y(62.5), 1.2 * S, 0, Math.PI * 2); ctx.fill();
    }
    // ── Forced-cooling fan bank. Fans spin with load: stopped when the bay
    // is cold, quick when it is hot, so cooling effort is visible at a glance.
    for (const fy of [58.5, 68]) {
      _spRR(X(101), Y(fy), 13 * S, 9 * S, 1.2 * S, '#39424c', '#161c24', 0.8 * S);
      const spin = on ? t * (1.5 + pct * 9) : 0;
      ctx.save();
      ctx.translate(X(107.5), Y(fy + 4.5));
      ctx.strokeStyle = on ? '#9aa4b0' : '#4a535c'; ctx.lineWidth = 1 * S;
      for (let b = 0; b < 3; b++) {
        const a = spin + b * (Math.PI * 2 / 3);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 3.6 * S, Math.sin(a) * 3.6 * S); ctx.stroke();
      }
      ctx.restore();
    }

    // ── Walk-in control house ──
    const g = ctx.createLinearGradient(X(14), 0, X(106), 0);
    g.addColorStop(0, '#221a34'); g.addColorStop(0.35, '#4e4470'); g.addColorStop(0.7, '#3d3558'); g.addColorStop(1, '#1d1730');
    _spRR(X(14), Y(78), 92 * S, 32 * S, 3 * S, g, '#0d0a16', S);
    ctx.fillStyle = '#6d5f96'; ctx.fillRect(X(14.5), Y(78), 91 * S, 2.4 * S);
    // Door + panel seams
    ctx.strokeStyle = 'rgba(10,8,18,0.7)'; ctx.lineWidth = 0.8 * S;
    for (const sx of [44, 76]) { ctx.beginPath(); ctx.moveTo(X(sx), Y(82)); ctx.lineTo(X(sx), Y(109)); ctx.stroke(); }
    _spRR(X(47), Y(86), 12 * S, 23 * S, 1 * S, '#241d38', '#0d0a16', 0.7 * S);
    ctx.fillStyle = on ? accent : '#3a3050';
    ctx.beginPath(); ctx.arc(X(57), Y(97), 1 * S, 0, Math.PI * 2); ctx.fill();
    // MK3 nameplate
    // Plate stops short of the door seam at x=44; the text is capped to the
    // space right of the bolt so it can never spill past the plate edge.
    _spRR(X(18), Y(83), 24 * S, 10 * S, 1.2 * S, '#100a1c', on ? col : '#2e2448', 0.9 * S);
    _spBolt(X(22), Y(88), 1.1 * S, on ? col : '#3a2e5c');
    ctx.fillStyle = on ? col : '#3a2e5c';
    ctx.font = 'bold ' + (6.5 * S) + 'px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('MK3', X(25.5), Y(88.4), 15 * S);
    // 8-segment load meter
    for (let i = 0; i < 8; i++) {
      const lit = on && (i === 0 || pct > i / 8);
      const segCol = !on ? '#1a1428' : i >= 7 ? '#ff5030' : i >= 6 ? '#ff7a20' : i >= 4 ? '#ffe040' : accent;
      _spRR(X(62 + i * 5.2), Y(83), 4.1 * S, 8 * S, 0.7 * S, lit ? segCol : '#171126');
      if (lit) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(X(62.6 + i * 5.2), Y(83.8), 3 * S, 1 * S); }
    }
    // Load bar
    _spRR(X(62), Y(95), 41.6 * S, 4 * S, 1 * S, '#0b0716', '#0d0a16', 0.6 * S);
    if (on) { ctx.fillStyle = loadCol; ctx.fillRect(X(62.7), Y(95.7), 40.2 * S * pct, 2.6 * S); }
    // Vent grille
    ctx.strokeStyle = 'rgba(10,8,18,0.75)'; ctx.lineWidth = 0.8 * S;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(X(62), Y(101 + i * 2.2)); ctx.lineTo(X(103.6), Y(101 + i * 2.2)); ctx.stroke(); }
    // Status beacons — the pair blink out of phase, fast and red when hot
    for (const bc of [[20, 0], [36, Math.PI]]) {
      const blink = on && (hot ? Math.sin(t * 8 + bc[1]) > 0 : Math.sin(t * 2 + bc[1]) > 0.2);
      ctx.fillStyle = blink ? (hot ? '#ff5030' : accent) : '#1e1730';
      ctx.beginPath(); ctx.arc(X(bc[0]), Y(101), 2 * S, 0, Math.PI * 2); ctx.fill();
      if (blink) {
        ctx.fillStyle = hot ? 'rgba(255,80,48,0.22)' : 'rgba(176,112,255,0.22)';
        ctx.beginPath(); ctx.arc(X(bc[0]), Y(101), 4.5 * S, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

function renderChemicalPlant(e, px, py, t) {
    // Body fills whatever footprint the entity has; rotation only moves the
    // stubs. The stub positions below are in whole TILE units from the anchor
    // corner, matching ChemicalSystem.getStubs, so they stay put as the body
    // grows — art and connection tiles can't drift apart.
    // Contact-process acid works: sulfur burner → catalytic converter →
    // absorption tower → acid tank, with an air-cooler fan bank. No backdrop
    // — terrain shows through. Shares the _wf* helpers (render_hydro_coal.js).
    const rot = e._rotation || 0;
    const w   = (e.width  || 5) * TILE;
    const h   = (e.height || 4) * TILE;
    const on  = e.powered;
    const def = EntityDefs[T.CHEMICALPLANT];
    const acid = e._acid || 0;
    const acidFill = Math.min(1, acid / (def.acidCapacity || 300));
    const running = on && !!e._sulfurConveyor && !!e._waterConnected;
    const S   = TILE / 40;
    const accent = '#40e0c0';
    ctx.save();

    const burnX = px + w*0.06, burnY = py + h*0.55, burnW = w*0.28, burnH = h*0.28;
    const cvX = px + w*0.46, cvTop = py + h*0.16, cvBot = py + h*0.80, cvR = w*0.07;
    const abX = px + w*0.645, abTop = py + h*0.25, abBot = py + h*0.76, abR = w*0.05;
    const tkX = px + w*0.86, tkY = py + h*0.60, tkR = w*0.10;

    // ── Ports + their feeds (under the equipment) ──
    // Each port's feed runs straight in off its wall and then across to the
    // equipment it serves — water to the absorption tower, the sulfur belt to
    // the burner's feed hopper, acid out of the storage tank — wherever the
    // rotation put the port, so the stubs read as the ends of real lines
    // rather than fittings stuck on the wall.
    const _st = ChemicalSystem.getStubs(e);
    const aWater = _portAnchor(e, px, py, w, h, _st.pipeStubs[0]);
    const aAcid  = _portAnchor(e, px, py, w, h, _st.pipeStubs[1]);
    const aSulf  = _portAnchor(e, px, py, w, h, _st.convStubs[0]);
    const hpX = burnX + burnW*0.20, hpY = burnY + burnH*0.62;         // sulfur feed hopper
    // (the feeds themselves are drawn after the equipment — see below)
    _wfPipe([[burnX + burnW, burnY + burnH*0.35], [cvX, burnY + burnH*0.35]], S, t, running, 'rgba(255,190,90,0.95)');
    _wfPipe([[cvX, cvTop + 12*S], [abX, cvTop + 12*S], [abX, abTop]], S, t, running, 'rgba(255,210,140,0.9)');
    _wfPipe([[abX, abBot], [abX, tkY], [tkX - tkR, tkY]], S, t, running, '#e0c040');

    // ── Air-cooler fan bank ──
    // Sits in the clear band above the burner, off the H₂O IN line's default run.
    const fbX = px + w*0.05, fbY = py + h*0.25, fbW = w*0.31, fbH = h*0.22;
    _wfShadow(fbX, fbY, fbW, fbH, S, 2*S);
    ctx.fillStyle = '#3a4a50'; ctx.strokeStyle = '#1a2428'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.roundRect(fbX, fbY, fbW, fbH, 2*S); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const fx = fbX + fbW*(0.18 + i*0.32), fy = fbY + fbH*0.5, fr = fbH*0.38;
      ctx.fillStyle = '#10181c'; ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#6a8088'; ctx.lineWidth = S; ctx.stroke();
      ctx.save(); ctx.translate(fx, fy); ctx.rotate(on ? t*8 + i : 0.5 + i);
      ctx.fillStyle = '#8aa0a8';
      for (let b = 0; b < 4; b++) { ctx.rotate(Math.PI/2); ctx.beginPath(); ctx.ellipse(fr*0.45, 0, fr*0.42, 2*S, 0.35, 0, Math.PI*2); ctx.fill(); }
      ctx.restore();
      ctx.fillStyle = '#2a3438'; ctx.beginPath(); ctx.arc(fx, fy, 2*S, 0, Math.PI*2); ctx.fill();
    }

    // ── Sulfur burner furnace ──
    _wfShadow(burnX, burnY, burnW, burnH, S, 2*S);
    ctx.fillStyle = '#5a3428'; ctx.strokeStyle = '#24140e'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.roundRect(burnX, burnY, burnW, burnH, 2*S); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 0.8*S;
    for (let r = 1; r < 5; r++) {
      const ly = burnY + burnH*r/5;
      ctx.beginPath(); ctx.moveTo(burnX + 1*S, ly); ctx.lineTo(burnX + burnW - 1*S, ly); ctx.stroke();
      for (let c = 0; c < 6; c++) { const lx = burnX + burnW*(c + (r % 2)*0.5)/6; ctx.beginPath(); ctx.moveTo(lx, ly - burnH/5); ctx.lineTo(lx, ly); ctx.stroke(); }
    }
    const fwx = burnX + burnW*0.52, fwy = burnY + burnH*0.28, fww = burnW*0.36, fwh = burnH*0.46;
    const fgr = ctx.createLinearGradient(0, fwy, 0, fwy + fwh);
    fgr.addColorStop(0, running ? `rgba(120,170,255,${0.8 + 0.2*Math.sin(t*8)})` : (on ? '#3a2014' : '#1a100a'));
    fgr.addColorStop(1, running ? '#ff7020' : '#0e0806');
    ctx.fillStyle = fgr; ctx.fillRect(fwx, fwy, fww, fwh);
    ctx.strokeStyle = '#140a06'; ctx.lineWidth = S; ctx.strokeRect(fwx, fwy, fww, fwh);
    if (running) { ctx.fillStyle = 'rgba(255,140,60,0.18)'; ctx.beginPath(); ctx.arc(fwx + fww/2, fwy + fwh/2, fww, 0, Math.PI*2); ctx.fill(); }
    // sulfur feed hopper (hpX/hpY set with the port feeds above)
    ctx.fillStyle = '#6a5a20'; ctx.strokeStyle = '#2a2208'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.moveTo(hpX - 8*S, hpY - 6*S); ctx.lineTo(hpX + 8*S, hpY - 6*S); ctx.lineTo(hpX + 3*S, hpY + 5*S); ctx.lineTo(hpX - 3*S, hpY + 5*S); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = running ? '#ffd83a' : '#8a7420';
    ctx.beginPath(); ctx.ellipse(hpX, hpY - 5*S, 6*S, 1.6*S, 0, 0, Math.PI*2); ctx.fill();
    _wfHazardStripe(burnX, burnY - 4*S, burnW, 3*S, S);

    // ── Catalytic converter tower ──
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.roundRect(cvX - cvR + 5*S, cvTop + 6*S, cvR*2, cvBot - cvTop, cvR*0.6); ctx.fill();
    const cg = ctx.createLinearGradient(cvX - cvR, 0, cvX + cvR, 0);
    cg.addColorStop(0, '#5a6a70'); cg.addColorStop(0.35, '#a8b8bc'); cg.addColorStop(1, '#2a3438');
    ctx.fillStyle = cg; ctx.strokeStyle = '#1a2226'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.roundRect(cvX - cvR, cvTop, cvR*2, cvBot - cvTop, cvR*0.6); ctx.fill(); ctx.stroke();
    for (let b = 0; b < 4; b++) {
      const by = cvTop + (cvBot - cvTop)*(0.18 + b*0.2);
      const heat = running ? 0.45 + 0.35*Math.sin(t*2 - b*0.9) : 0;
      ctx.fillStyle = running ? `rgba(255,${120 + b*25},40,${heat})` : 'rgba(40,50,54,0.8)';
      ctx.fillRect(cvX - cvR + 1.5*S, by, cvR*2 - 3*S, 5*S);
      ctx.strokeStyle = '#1a2226'; ctx.lineWidth = 0.8*S; ctx.strokeRect(cvX - cvR + 1.5*S, by, cvR*2 - 3*S, 5*S);
    }
    ctx.fillStyle = '#c8d4d8';
    ctx.beginPath(); ctx.ellipse(cvX, cvTop + 2*S, cvR, cvR*0.45, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#4a5a60'; ctx.lineWidth = S; ctx.stroke();
    ctx.fillStyle = '#4a5a60'; ctx.fillRect(cvX - cvR - 3*S, cvTop + (cvBot - cvTop)*0.52, cvR*2 + 6*S, 2*S);

    // ── Absorption tower ──
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.roundRect(abX - abR + 5*S, abTop + 6*S, abR*2, abBot - abTop, abR*0.6); ctx.fill();
    const ag = ctx.createLinearGradient(abX - abR, 0, abX + abR, 0);
    ag.addColorStop(0, '#4a6058'); ag.addColorStop(0.35, '#90aca0'); ag.addColorStop(1, '#223028');
    ctx.fillStyle = ag; ctx.strokeStyle = '#141e1a'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.roundRect(abX - abR, abTop, abR*2, abBot - abTop, abR*0.6); ctx.fill(); ctx.stroke();
    const pwy = abTop + (abBot - abTop)*0.3, pwh = (abBot - abTop)*0.4;
    ctx.fillStyle = '#0c1612'; ctx.fillRect(abX - abR*0.55, pwy, abR*1.1, pwh);
    ctx.save(); ctx.beginPath(); ctx.rect(abX - abR*0.55, pwy, abR*1.1, pwh); ctx.clip();
    ctx.strokeStyle = running ? 'rgba(64,224,192,0.55)' : 'rgba(40,70,60,0.6)'; ctx.lineWidth = 0.8*S;
    const drip = running ? (t*10*S) % (5*S) : 0;
    for (let y = pwy - 5*S + drip; y < pwy + pwh + 5*S; y += 5*S) {
      ctx.beginPath(); ctx.moveTo(abX - abR, y); ctx.lineTo(abX + abR, y + 4*S); ctx.moveTo(abX + abR, y); ctx.lineTo(abX - abR, y + 4*S); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#b0c8c0'; ctx.beginPath(); ctx.ellipse(abX, abTop + 2*S, abR, abR*0.45, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#3a4a44'; ctx.fillRect(abX - 2.5*S, abTop - 8*S, 5*S, 10*S);
    if (e._scrubber) {
      // Scrubber fitted from the panel: the absorber's tail gas is ducted
      // over to an SO₂ scrubber tower standing above the acid tank, its stack
      // capped, and what leaves is the scrubber's white vapour.
      const scX = px + w*0.87, scR = Math.min(11*S, w*0.05), scTop = py + h*0.08, scBase = py + h*0.42;
      const dY = abTop - 5*S;
      ctx.fillStyle = '#2e4e44'; ctx.beginPath(); ctx.roundRect(abX - 3.5*S, abTop - 10*S, 7*S, 3*S, 1*S); ctx.fill();
      _scrubberDuct([[abX, dY], [scX - scR, dY]], S, t, running);
      _scrubberTower(scX, scTop, scBase, scR, S, t, running, 1);
      if (running) _scrubberVapour(scX, scTop - 6*S, S, t, 4, 0.7);
    } else {
      _wfSmoke(abX, abTop - 9*S, S*0.6, t, '235,245,240', running, 0.5);
    }

    // ── Acid storage tank ──
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(tkX + 5*S, tkY + 6*S, tkR, 0, Math.PI*2); ctx.fill();
    const tg = ctx.createRadialGradient(tkX - tkR*0.35, tkY - tkR*0.35, tkR*0.1, tkX, tkY, tkR);
    tg.addColorStop(0, '#d8d0a0'); tg.addColorStop(0.55, '#8a8458'); tg.addColorStop(1, '#3a3620');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(tkX, tkY, tkR, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.arc(tkX, tkY, tkR*0.6, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = '#141208'; ctx.lineWidth = 3.5*S;
    ctx.beginPath(); ctx.arc(tkX, tkY, tkR - 2*S, 0, Math.PI*2); ctx.stroke();
    if (acidFill > 0) {
      const warn = on && acidFill > 0.85 && Math.sin(t*6) > 0;
      ctx.strokeStyle = warn ? '#ff5030' : '#e0c040'; ctx.globalAlpha = on ? 0.95 : 0.5; ctx.lineWidth = 2.5*S;
      ctx.beginPath(); ctx.arc(tkX, tkY, tkR - 2*S, -Math.PI/2, -Math.PI/2 + Math.PI*2*acidFill); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // corrosive diamond
    ctx.save(); ctx.translate(tkX, tkY); ctx.rotate(Math.PI/4);
    ctx.fillStyle = '#f0f0e8'; ctx.strokeStyle = '#1a1a14'; ctx.lineWidth = S;
    ctx.fillRect(-5*S, -5*S, 10*S, 10*S); ctx.strokeRect(-5*S, -5*S, 10*S, 10*S);
    ctx.fillStyle = '#1a1a14'; ctx.fillRect(-5*S, 0, 10*S, 5*S);
    ctx.restore();
    ctx.fillStyle = on ? '#e0c040' : '#6a5a20';
    ctx.font = `bold ${Math.max(5, 5.5*S)}px Courier New`; ctx.textAlign = 'center';
    ctx.fillText('H₂SO₄', tkX, tkY - tkR - 3*S);

    // ── Control room ──
    const crX = px + w*0.30, crY = py + h*0.86, crW = w*0.20, crH = h*0.11;
    _wfShadow(crX, crY, crW, crH, S, 2*S);
    ctx.fillStyle = '#3a4448'; ctx.strokeStyle = '#1a2024'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.roundRect(crX, crY, crW, crH, 2*S); ctx.fill(); ctx.stroke();
    for (let q = 0; q < 4; q++) {
      ctx.fillStyle = on ? `rgba(120,235,205,${0.45 + 0.25*Math.sin(t*1.7 + q*1.9)})` : 'rgba(16,26,32,0.9)';
      ctx.fillRect(crX + crW*(0.08 + q*0.23), crY + crH*0.3, crW*0.16, crH*0.4);
    }

    // ── Port feeds, drawn over the equipment as an overhead rack ──
    // Depending on rotation a feed has to cross the fan bank, the burner or a
    // tower on its way in. Drawn underneath, it vanished into whatever it
    // crossed and read as plugged into it (H₂O IN looked fed to the fans);
    // over the top, with a shadow on the kit below, it plainly passes over.
    {
      const feed = (a, tx, ty, on2, kind, col) => {
        if (!a) return;
        ctx.save(); ctx.translate(3*S, 4*S); ctx.globalAlpha = 0.28;
        _portFeed(a, tx, ty, S, 0, false, kind, 'rgba(0,0,0,1)');                         // shadow
        ctx.restore();
        _portFeed(a, tx, ty, S, t, on2, kind, col);
      };
      feed(aWater, abX, abBot - 6*S, on && !!e._waterConnected, 'pipe', 'rgba(90,200,240,0.95)');
      feed(aSulf,  hpX, hpY,          !!e._sulfurConveyor,       'belt', '#b8a040');
      feed(aAcid,  tkX, tkY,          on && !!e._acidPipeOut,    'pipe', '#e0c040');
    }

    // ── Stubs — the shared port kit, placed from ChemicalSystem.getStubs ──
    // so the drawn nozzle / belt dock always sits on the tile the sim and
    // the pipe/belt renderers connect to, on whichever faces the rotation
    // put them. Tags drawn larger than the kit default: this plant's three
    // ports are its whole setup, so they have to read at a glance.
    {
      const LBL = 1.15;
      if (aWater) _portPipe(aWater, S, t, { fluid: '#40c0e0', label: 'H₂O IN',    on: !!e._waterConnected, out: false, flow: running, labelScale: LBL });
      if (aSulf)  _portBelt(aSulf,  S, t, { belt:  '#ffd83a', label: 'SULFUR IN', on: !!e._sulfurConveyor, out: false,               labelScale: LBL });
      if (aAcid)  _portPipe(aAcid,  S, t, { fluid: '#e0c040', label: 'ACID OUT',  on: !!e._acidPipeOut,    out: true,  flow: running, labelScale: LBL });
    }

    _wfPlate('CHEMICAL PLANT', px + w*0.63, py + h*0.06, S, accent, on);
    _wfLamp(px + w - 7*S, py + 7*S, S, t, accent, on);
    ctx.restore();
  }

function renderMk4Research(e, px, py, t) {
    // MK4 — fusion lab, top of the research family (the shared kit lives in
    // render_world_civic.js): a plasma core held in turning magnetic coils at
    // the heart of an outer particle ring, four Tesla pylons arcing into it,
    // and every earlier rank's piece round the edge — the MK1 dome on the
    // control block, the MK2 dish and lattice mast, and the MK3 cryo tanks.
    // Single-instance and always 4×4. (The main loop draws its selection.)
    const on = e.powered, A = '#ff60d0', W = TILE*4, fine = Camera.zoom > 0.5;
    const cx = px + 80, cy = py + 78, R = 50;
    ctx.save();
    if (on && fine) drawGlowHalo(cx, cy, W*0.55, [[0, A], [1, 'transparent']], 0.3 + 0.12*Math.sin(t*3));
    _rsPad(px, py, W, 4, 18, 4, A, on, t);

    _rsRing(cx, cy, R, A, on, t, 3, 1.6);

    // Control block with the family dome on its roof
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px + 17, py + 17, 24, 26);
    ctx.fillStyle = RSK.metalDk; ctx.fillRect(px + 14, py + 14, 24, 22);
    ctx.fillStyle = RSK.roof;    ctx.fillRect(px + 16, py + 16, 20, 18);
    ctx.fillStyle = RSK.wall;    ctx.fillRect(px + 14, py + 36, 24, 5);
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = on && Math.sin(t*0.6 + k*2.3) > -0.5 ? '#ffd8f4' : '#1a1622';
      ctx.fillRect(px + 17 + k*7, py + 37, 4, 2.5);
    }
    _rsDome(px + 26, py + 25, 6.5, A, on, t, 0.5);
    _rsProgressRing(px + 26, py + 25, 9, A, on, t, 1.8);

    // The earlier ranks' pieces round the edge
    _rsDish(px + 24, py + 134, 11, A, on, t, 4.2);
    ctx.strokeStyle = RSK.metalDk; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px + 118, py + 129); ctx.lineTo(px + 110, py + 114); ctx.stroke();
    _rsTanks(px + 118, py + 136, 7, on, t, A);
    _rsMast(px + 140, py + 42, py + 16, true, A, on, t);

    // Tesla pylons on the diagonals, arcing into the vessel
    const P = 26;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy], i) => {
      const x = cx + sx*P, y = cy + sy*P;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(x + 1.5, y + 1.5, 6.5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = RSK.metalDk; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = on ? RSK.copper : '#6a4a30'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2); ctx.stroke();
      ctx.fillStyle = on ? '#f4e8ff' : RSK.metalOff; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI*2); ctx.fill();
      if (on && fine && Math.sin(t*7 + i*2.1) > 0.1) {
        const ex = cx + sx*16, ey = cy + sy*16;   // the vessel's rim, on this pylon's side
        const dx = ex - x, dy = ey - y, len = Math.hypot(dx, dy), nx = -dy/len, ny = dx/len;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let s = 1; s < 6; s++) {
          const f = s/6, j = Math.sin(t*47 + s*3.7 + i*1.9)*3;
          ctx.lineTo(x + dx*f + nx*j, y + dy*f + ny*j);
        }
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = 'rgba(255,190,240,0.35)'; ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke();
      }
    });

    // Containment vessel and plasma core
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.arc(cx + 2, cy + 2, 23, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = RSK.metalDk; ctx.beginPath(); ctx.arc(cx, cy, 23, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = on ? '#1a0e26' : '#16121e'; ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI*2); ctx.fill();
    if (on) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 18);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, '#ffc0f0'); g.addColorStop(0.6, A); g.addColorStop(1, 'rgba(255,96,208,0)');
      ctx.globalAlpha = 0.75 + 0.2*Math.sin(t*5);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 18, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
      if (fine) {
        ctx.strokeStyle = 'rgba(255,230,250,0.6)'; ctx.lineWidth = 0.8;
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(cx, cy, 12, 5, t*2 + k*Math.PI/3, 0, Math.PI*2); ctx.stroke(); }
      }
    } else {
      ctx.fillStyle = 'rgba(90,40,70,0.5)'; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI*2); ctx.fill();
    }
    // Magnetic coils turning round the vessel
    for (let k = 0; k < 3; k++) {
      const a = (on ? t*0.7 : 0) + k*Math.PI/3;
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.ellipse(cx, cy, 26, 8, a, 0, Math.PI*2); ctx.stroke();
      ctx.strokeStyle = on ? RSK.copper : '#6a4a30'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.ellipse(cx, cy, 26, 8, a, 0, Math.PI*2); ctx.stroke();
    }
    // Holographic scan ring
    if (on && fine) {
      ctx.setLineDash([4, 6]); ctx.lineDashOffset = -t*20;
      ctx.globalAlpha = 0.35; ctx.strokeStyle = A; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, 38, 0, Math.PI*2); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }

    _rsLamp(px + 146, py + 146, 2, A, on, t, 0);
    _rsPlate(px + 80, py + 150, 4, A, on);
    ctx.restore();
  }

function renderMk5Research(e, px, py, t) {
    // MK5 — ignition campus, the top of the research family. The MK4's plasma
    // core grown into a star in a bottle: a white-gold ignition sphere under
    // a laser cage, two accelerator rings crossed around it, six Tesla pylons
    // on a hexagon instead of four on the diagonals, and every earlier rank's
    // piece round the edge (MK1 dome, MK2 dish and mast, MK3 cryo tanks, plus
    // a second cryo pair for the magnets). Single-instance and always 5×5.
    const on = e.powered, A = '#ffb43c', W = TILE*5, fine = Camera.zoom > 0.5;
    const cx = px + 100, cy = py + 98, R = 66;
    ctx.save();
    if (on && fine) drawGlowHalo(cx, cy, W*0.55, [[0, A], [1, 'transparent']], 0.34 + 0.14*Math.sin(t*3));
    _rsPad(px, py, W, 4, 20, 5, A, on, t);

    // Two accelerator rings, crossed and counter-rotating
    _rsRing(cx, cy, R, A, on, t, 4, 1.4);
    _rsRing(cx, cy, R - 13, A, on, t, 3, -1.9);

    // Control block with the family dome on its roof
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px + 20, py + 20, 26, 28);
    ctx.fillStyle = RSK.metalDk; ctx.fillRect(px + 17, py + 17, 26, 24);
    ctx.fillStyle = RSK.roof;    ctx.fillRect(px + 19, py + 19, 22, 20);
    ctx.fillStyle = RSK.wall;    ctx.fillRect(px + 17, py + 41, 26, 5);
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = on && Math.sin(t*0.6 + k*2.3) > -0.5 ? '#fff0d4' : '#1a1622';
      ctx.fillRect(px + 20 + k*8, py + 42, 4, 2.5);
    }
    _rsDome(px + 30, py + 29, 7, A, on, t, 0.5);
    _rsProgressRing(px + 30, py + 29, 9.5, A, on, t, 1.8);

    // The earlier ranks' pieces round the edge
    _rsDish(px + 28, py + 172, 12, A, on, t, 4.2);
    ctx.strokeStyle = RSK.metalDk; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px + 152, py + 166); ctx.lineTo(px + 142, py + 150); ctx.stroke();
    _rsTanks(px + 152, py + 174, 7, on, t, A);
    _rsTanks(px + 152, py +  34, 6, on, t, A);   // the magnet cryo pair the MK5 adds
    _rsMast(px + 176, py + 52, py + 18, true, A, on, t);

    // Six Tesla pylons on a hexagon, arcing into the ignition sphere
    const P = 40;
    for (let i = 0; i < 6; i++) {
      const a = i/6*Math.PI*2 + Math.PI/6;
      const ux = Math.cos(a), uy = Math.sin(a);
      const x = cx + ux*P, y = cy + uy*P;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(x + 1.5, y + 1.5, 6.5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = RSK.metalDk; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = on ? RSK.copper : '#6a4a30'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2); ctx.stroke();
      ctx.fillStyle = on ? '#fff4e0' : RSK.metalOff; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI*2); ctx.fill();
      if (on && fine && Math.sin(t*7 + i*2.1) > 0.1) {
        const ex = cx + ux*19, ey = cy + uy*19;   // the sphere's rim, on this pylon's side
        const dx = ex - x, dy = ey - y, len = Math.hypot(dx, dy), nx = -dy/len, ny = dx/len;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 1; k < 6; k++) {
          const f = k/6, j = Math.sin(t*47 + k*3.7 + i*1.9)*3;
          ctx.lineTo(x + dx*f + nx*j, y + dy*f + ny*j);
        }
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = 'rgba(255,220,160,0.35)'; ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke();
      }
    }

    // Ignition chamber and the star inside it
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.arc(cx + 2, cy + 2, 27, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = RSK.metalDk; ctx.beginPath(); ctx.arc(cx, cy, 27, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = on ? '#241404' : '#1a1520'; ctx.beginPath(); ctx.arc(cx, cy, 23, 0, Math.PI*2); ctx.fill();
    if (on) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 21);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.22, '#fff0c0'); g.addColorStop(0.6, A); g.addColorStop(1, 'rgba(255,180,60,0)');
      ctx.globalAlpha = 0.78 + 0.2*Math.sin(t*5);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 21, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
      if (fine) {
        ctx.strokeStyle = 'rgba(255,245,220,0.6)'; ctx.lineWidth = 0.8;
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(cx, cy, 13, 5, t*2 + k*Math.PI/4, 0, Math.PI*2); ctx.stroke(); }
      }
    } else {
      ctx.fillStyle = 'rgba(90,70,40,0.5)'; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI*2); ctx.fill();
    }

    // Laser cage: eight beam emitters on the chamber wall, firing inward
    if (fine) for (let i = 0; i < 8; i++) {
      const a = i/8*Math.PI*2 + (on ? t*0.25 : 0);
      const ux = Math.cos(a), uy = Math.sin(a);
      ctx.fillStyle = on ? '#e8dcc0' : RSK.metalOff;
      ctx.beginPath(); ctx.arc(cx + ux*27, cy + uy*27, 2.4, 0, Math.PI*2); ctx.fill();
      if (on && Math.sin(t*9 + i*0.8) > 0.55) {
        ctx.strokeStyle = 'rgba(255,255,235,0.75)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx + ux*26, cy + uy*26); ctx.lineTo(cx + ux*9, cy + uy*9); ctx.stroke();
      }
    }

    // Magnetic coils turning round the chamber
    for (let k = 0; k < 4; k++) {
      const a = (on ? t*0.7 : 0) + k*Math.PI/4;
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.ellipse(cx, cy, 31, 9, a, 0, Math.PI*2); ctx.stroke();
      ctx.strokeStyle = on ? RSK.copper : '#6a4a30'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.ellipse(cx, cy, 31, 9, a, 0, Math.PI*2); ctx.stroke();
    }

    // Holographic scan ring
    if (on && fine) {
      ctx.setLineDash([4, 6]); ctx.lineDashOffset = -t*20;
      ctx.globalAlpha = 0.35; ctx.strokeStyle = A; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, 48, 0, Math.PI*2); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }

    _rsLamp(px + 184, py + 184, 2, A, on, t, 0);
    _rsPlate(px + 100, py + 188, 5, A, on);
    ctx.restore();
  }

// ── Port stubs (nuclear + fusion chain) ──
// Every port is placed from its system's getStubs(), so the sprite, the pipe
// renderer's connection guard and the gameplay BFS all agree on the tile.
// _portAnchor turns a stub tile into the face it sits on, the point on that
// face's edge centred on the tile, and the outward direction.
function _portAnchor(e, px, py, W, H, stub) {
  const cols = Math.round(W / TILE);
  if (stub.c < e.col)         return { face: 'left',   x: px,     y: py + (stub.r - e.row + 0.5)*TILE, dx: -1, dy: 0 };
  if (stub.c >= e.col + cols) return { face: 'right',  x: px + W, y: py + (stub.r - e.row + 0.5)*TILE, dx: 1,  dy: 0 };
  if (stub.r < e.row)         return { face: 'top',    x: px + (stub.c - e.col + 0.5)*TILE, y: py,     dx: 0, dy: -1 };
  return                             { face: 'bottom', x: px + (stub.c - e.col + 0.5)*TILE, y: py + H, dx: 0, dy: 1 };
}

// Point d px inside the building, straight in from a port.
function _portIn(a, d) { return [a.x - a.dx*d, a.y - a.dy*d]; }

// Small engraved tag naming a port, tucked inside the wall beside it so it
// never lands on the neighbouring tile's pipe or belt. k scales the tag for
// buildings whose ports need to read from further out (default 1).
function _portLabel(a, S, text, color, on, k = 1) {
  ctx.font = `bold ${Math.max(5, 5.5*S*k)}px Courier New`;
  const tw = ctx.measureText(text).width + 6*S*k, th = 9*S*k;
  let x, y;
  if (a.face === 'left' || a.face === 'right') {
    x = a.face === 'left' ? a.x + 3*S : a.x - 3*S - tw;
    y = a.y - 12*S - th;
  } else {
    x = a.x + 12*S;
    y = a.face === 'top' ? a.y + 3*S : a.y - 3*S - th;
  }
  ctx.fillStyle = k > 1 ? 'rgba(4,6,8,0.92)' : 'rgba(6,8,10,0.82)';
  ctx.strokeStyle = on ? color : 'rgba(90,96,100,0.7)'; ctx.lineWidth = 0.8*S*k;
  ctx.beginPath(); ctx.roundRect(x, y, tw, th, 1.5*S*k); ctx.fill(); ctx.stroke();
  // Larger tags also get a brighter unconnected colour: it is the state a
  // player is hunting for when laying the first pipe or belt.
  ctx.fillStyle = on ? color : (k > 1 ? 'rgba(215,220,224,0.95)' : 'rgba(170,176,180,0.8)');
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 3*S*k, y + th/2 + 0.3*S*k);
  ctx.textBaseline = 'alphabetic';
}

// Flanged pipe nozzle: bolted wall collar, shaded barrel with a band in the
// fluid's colour, and a flange sitting on the wall line where the pipe on
// the neighbouring tile butts up. The chevron on the collar shows the flow
// direction and lights with the connection. o = { fluid, label, on, out, flow, locked }
// `locked` marks a port whose supply isn't unlocked yet: the nozzle is drawn
// faded with a blind flange bolted over its mouth, and the tag says LOCKED,
// so the player can see it's for later rather than something missing now.
function _portPipe(a, S, t, o) {
  ctx.save();
  ctx.translate(a.x, a.y); ctx.rotate(Math.atan2(a.dy, a.dx));
  if (o.locked) ctx.globalAlpha *= 0.55;
  // +x points out of the building; the wall is x = 0.
  if (o.on && !o.locked) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 14*S);
    g.addColorStop(0, o.fluid + '55'); g.addColorStop(1, o.fluid + '00');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 14*S, 0, Math.PI*2); ctx.fill();
  }
  const cg = ctx.createLinearGradient(0, -10*S, 0, 10*S);
  cg.addColorStop(0, '#7a848c'); cg.addColorStop(0.45, '#48525a'); cg.addColorStop(1, '#22282d');
  ctx.fillStyle = cg; ctx.strokeStyle = '#0e1215'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.roundRect(-15*S, -10*S, 12*S, 20*S, 2*S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#a8b0b6';
  for (const [bx, by] of [[-12.5, -7.5], [-5.5, -7.5], [-12.5, 7.5], [-5.5, 7.5]]) {
    ctx.beginPath(); ctx.arc(bx*S, by*S, 0.9*S, 0, Math.PI*2); ctx.fill();
  }
  const pg = ctx.createLinearGradient(0, -4.5*S, 0, 4.5*S);
  pg.addColorStop(0, '#262c31'); pg.addColorStop(0.32, '#c4ccd2'); pg.addColorStop(0.6, '#7c8890'); pg.addColorStop(1, '#1c2226');
  ctx.fillStyle = pg; ctx.fillRect(-5*S, -4.5*S, 7*S, 9*S);
  ctx.strokeStyle = '#0e1215'; ctx.lineWidth = 0.8*S; ctx.strokeRect(-5*S, -4.5*S, 7*S, 9*S);
  ctx.fillStyle = o.on ? o.fluid : '#3c4044';
  ctx.fillRect(-3*S, -4.5*S, 2*S, 9*S);
  if (o.on && o.flow) {
    const p = ((t*1.6) % 1), sx = o.out ? -5*S + p*7*S : 2*S - p*7*S;
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(sx - 0.6*S, -3.5*S, 1.2*S, 7*S);
  }
  const fg = ctx.createLinearGradient(0, -7*S, 0, 7*S);
  fg.addColorStop(0, '#8a949a'); fg.addColorStop(1, '#343c42');
  ctx.fillStyle = fg; ctx.strokeStyle = '#0e1215'; ctx.lineWidth = 0.8*S;
  ctx.beginPath(); ctx.roundRect(1*S, -7*S, 2.6*S, 14*S, 0.8*S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = o.on ? o.fluid : '#50565a';
  const cx0 = -11*S;
  ctx.beginPath();
  if (o.out) { ctx.moveTo(cx0 - 1.6*S, -3*S); ctx.lineTo(cx0 + 2*S, 0); ctx.lineTo(cx0 - 1.6*S, 3*S); }
  else       { ctx.moveTo(cx0 + 2*S, -3*S);   ctx.lineTo(cx0 - 1.6*S, 0); ctx.lineTo(cx0 + 2*S, 3*S); }
  ctx.closePath(); ctx.fill();
  if (o.locked) {
    // Blind flange: a solid plate bolted over the mouth, wider than the
    // live flange so it reads as capped off.
    ctx.globalAlpha /= 0.55;
    ctx.fillStyle = '#2c3236'; ctx.strokeStyle = '#0e1215'; ctx.lineWidth = 0.8*S;
    ctx.beginPath(); ctx.roundRect(0.6*S, -8.5*S, 3.6*S, 17*S, 1*S); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#7a8288';
    for (const by of [-6, 0, 6]) { ctx.beginPath(); ctx.arc(2.4*S, by*S, 0.8*S, 0, Math.PI*2); ctx.fill(); }
  }
  ctx.restore();
  if (o.label) _portLabel(a, S, o.locked ? o.label + ' · LOCKED' : o.label, o.fluid, o.on && !o.locked, o.labelScale);
}

// Belt dock: a framed opening with hazard-striped rails and a roller bed
// whose chevrons crawl in the belt's direction while connected. Used for
// conveyor ports (rods, ore, compound, fuel cells) and the waste hatch.
// o = { belt, label, on, out }
function _portBelt(a, S, t, o) {
  ctx.save();
  ctx.translate(a.x, a.y); ctx.rotate(Math.atan2(a.dy, a.dx));
  ctx.fillStyle = '#1e2124'; ctx.strokeStyle = '#0a0c0e'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.roundRect(-19*S, -12*S, 21*S, 24*S, 2*S); ctx.fill(); ctx.stroke();
  _wfHazardStripe(-19*S, -12*S, 21*S, 3*S, S);
  _wfHazardStripe(-19*S, 9*S, 21*S, 3*S, S);
  ctx.save();
  ctx.beginPath(); ctx.rect(-18*S, -8*S, 20*S, 16*S); ctx.clip();
  ctx.fillStyle = '#121416'; ctx.fillRect(-18*S, -8*S, 20*S, 16*S);
  ctx.strokeStyle = '#353a3f'; ctx.lineWidth = S;
  for (let x = -17*S; x < 2*S; x += 3.5*S) { ctx.beginPath(); ctx.moveTo(x, -8*S); ctx.lineTo(x, 8*S); ctx.stroke(); }
  const dir = o.out ? 1 : -1;
  // o.moving (default o.on): a linked port whose cargo only leaves now and
  // then stays lit but holds still between items.
  const moving = o.moving === undefined ? o.on : o.moving;
  const off = moving ? ((t*16*S) % (8*S)) * dir : 0;
  ctx.strokeStyle = o.on ? o.belt : '#3a3e42'; ctx.lineWidth = 2*S; ctx.lineJoin = 'miter';
  for (let k = -4; k <= 2; k++) {
    const x = k*8*S + off;
    ctx.beginPath(); ctx.moveTo(x - 2.5*S*dir, -5*S); ctx.lineTo(x + 2.5*S*dir, 0); ctx.lineTo(x - 2.5*S*dir, 5*S); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = o.on ? o.belt : '#4a1c14';
  ctx.beginPath(); ctx.arc(-16.5*S, -10.5*S, 1.3*S, 0, Math.PI*2); ctx.fill();
  ctx.restore();
  if (o.label) _portLabel(a, S, o.label, o.belt, o.on, o.labelScale);
}

// Local drawing frame for a rotatable plant whose stubs follow the
// transpose / mirror / quarter-turn convention (Electrolyzer, Atmosphere
// Collector, Haber-Bosch, Isotopic Wash Tower getStubs): the body is drawn
// once in its unrotated bw×bh frame from (0,0) and mapped onto the
// footprint, so its internal pipework meets the stubs on whichever faces
// the rotation put them. Text goes through toWorld() and is drawn
// untransformed so it never reads mirrored or sideways.
function _plantFrame(e, px, py, type) {
  const def = EntityDefs[type];
  const rot = e._rotation || 0;
  const W = (e.width || def.width) * TILE, H = (e.height || def.height) * TILE;
  const bw = rot % 2 ? H : W, bh = rot % 2 ? W : H;
  const m = rot === 1 ? [0, 1, 1, 0, px, py]
          : rot === 2 ? [-1, 0, 0, 1, px + W, py]
          : rot === 3 ? [0, -1, 1, 0, px, py + H]
          :             [1, 0, 0, 1, px, py];
  return {
    W, H, bw, bh, rot,
    apply: () => ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]),
    toWorld: (x, y) => [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]],
  };
}

// The same frame with the body left standing: a plant drawn as equipment
// seen from the side (towers, columns, a converter on its saddles) keeps
// one layout whichever way it is turned, and only its port lines move
// (_portRing). Turning the whole drawing with the ports, as _plantFrame
// does, lays every tower, ladder and flame on its side, puts the light on
// the wrong flank and throws the shadows up the screen; that is right for
// a plan view and wrong for these.
// The body is authored for the unturned footprint. A footprint turned a
// quarter is the other way up, so the drawing is fitted inside it at one
// scale and centred, and the port lines cross the strip left over. That
// suits a nearly square plant; a long one needs a second layout (`own`).
function _plantFrameUpright(e, px, py, type, own = false) {
  const def = EntityDefs[type];
  const rot = e._rotation || 0;
  const W = (e.width || def.width) * TILE, H = (e.height || def.height) * TILE;
  // The footprint the body is drawn for: the unturned one, unless the plant
  // has a layout of its own for a footprint lying the other way (`own`).
  const bw = !own && rot % 2 ? H : W, bh = !own && rot % 2 ? W : H;
  const k = Math.min(W / bw, H / bh);
  const ox = px + (W - bw*k) / 2, oy = py + (H - bh*k) / 2;
  return {
    W, H, bw, bh, rot: 0, k,
    apply: () => ctx.transform(k, 0, 0, k, ox, oy),
    toWorld: (x, y) => [ox + x*k, oy + y*k],
    toLocal: (x, y) => [(x - ox) / k, (y - oy) / k],
  };
}

// A port's line inside an upright plant, in the body's own frame: from the
// stub the rotation gave it, round the inside of the wall at inset m the
// shorter way, to the point level with `at` on the body's `face` (where the
// unturned plant takes that line in or sends it out). Returns the points
// port-first; reverse them for an outlet.
function _portRing(e, f, px, py, stub, m, face, at) {
  const w = f.bw, h = f.bh;
  const T2 = face === 'left' ? [m, at] : face === 'right' ? [w - m, at] : face === 'top' ? [at, m] : [at, h - m];
  if (!stub) return [T2];
  const a = _portAnchor(e, px, py, f.W, f.H, stub);
  // The ring follows the real wall, which the body only fills when the
  // footprint is square or unturned.
  const [x0, y0] = f.toLocal(px, py), [x1, y1] = f.toLocal(px + f.W, py + f.H);
  const [ax, ay] = f.toLocal(a.x, a.y);
  const L = x0 + m, R = x1 - m, Tp = y0 + m, B = y1 - m;
  const P2 = a.face === 'left' ? [L, ay] : a.face === 'right' ? [R, ay] : a.face === 'top' ? [ax, Tp] : [ax, B];
  // Where the body's own entry point meets that ring.
  const Q2 = face === 'left' ? [L, at] : face === 'right' ? [R, at] : face === 'top' ? [at, Tp] : [at, B];
  const Wd = R - L, Hd = B - Tp, per = 2*(Wd + Hd);
  const sOf = ([x, y], fc) => fc === 'top' ? x - L : fc === 'right' ? Wd + (y - Tp) : fc === 'bottom' ? Wd + Hd + (R - x) : 2*Wd + Hd + (B - y);
  const s0 = sOf(P2, a.face), s1 = sOf(Q2, face);
  const fwd = (((s1 - s0) % per) + per) % per, cw = fwd <= per/2, dist = cw ? fwd : per - fwd;
  const corners = [[0, [L, Tp]], [Wd, [R, Tp]], [Wd + Hd, [R, B]], [2*Wd + Hd, [L, B]]]
    .map(([sc, pt]) => [((((cw ? sc - s0 : s0 - sc) % per) + per) % per), pt])
    .filter(([d]) => d > 0.01 && d < dist - 0.01).sort((p1, p2) => p1[0] - p2[0]).map(([, pt]) => pt);
  const pts = [P2, ...corners, Q2];
  if (Math.abs(Q2[0] - T2[0]) + Math.abs(Q2[1] - T2[1]) > 0.01) pts.push(T2);
  return pts;
}

// Centred text at a local-frame point, drawn in world space.
function _frameText(f, x, y, text, font, color) {
  const [wx, wy] = f.toWorld(x, y);
  ctx.font = font; ctx.fillStyle = color;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, wx, wy);
  ctx.textBaseline = 'alphabetic';
}

function renderElectrolyzer(e, px, py, t) {
    // Alkaline electrolysis stack: cell plates between end plates and tie
    // rods, gas separator columns with rising bubbles, copper busbars down to
    // a rectifier cabinet, a demineraliser skid on the water inlet, an O₂
    // vent and a hydrogen sphere whose rim fills with the buffer. It has two
    // layouts, both standing upright: the 8×22 one runs down the plot
    // (sphere, stack between its columns, rectifier), and a plant turned a
    // quarter gets the same kit set out along it instead. The water inlet
    // and H₂ outlet run round the inside of the wall (_portRing) to the
    // faces ElectrolyzerSystem.getStubs() uses. No backdrop. Shares the
    // _wf* helpers.
    // (The 8×22 drawing used to be transposed onto a turned footprint,
    // which laid the separator columns on their sides.)
    const f   = _plantFrameUpright(e, px, py, T.ELECTROLYZER, true);
    const w   = f.bw, h = f.bh;
    const land = w > h;                       // set out along the plot, not down it
    const sd  = Math.min(w, h), lg = Math.max(w, h);
    const cx  = w / 2;
    const on  = e.powered;
    const active = on && !!e._waterConnected;
    const def = EntityDefs[T.ELECTROLYZER];
    const h2Fill = Math.min(1, (e._hydrogen || 0) / (def.hydrogenCapacity || 300));
    const S   = TILE / 40;
    const accent = '#40c0ff';
    const lblFont = `bold ${Math.max(4, 5*S)}px Courier New`;
    ctx.save();
    ctx.save(); f.apply();

    // Where the unturned layout takes water in (left, row 1) and sends
    // hydrogen out (right, row h-2); the turned one uses its left face for both.
    const waterY = TILE*1.5, h2Y = h - TILE*1.5;
    const spR = sd*0.26;
    const spX = land ? lg*0.125 : cx,   spY = land ? sd*0.42 : lg*0.12;
    const dmX = land ? lg*0.045 : sd*0.10, dmY = land ? sd*0.80 : lg*0.20, dmW = land ? lg*0.13 : sd*0.30, dmH = land ? sd*0.13 : lg*0.06;
    const colL = land ? lg*0.30 : sd*0.14, colR = land ? lg*0.62 : sd*0.86, colRad = sd*0.07;
    const colTop = land ? sd*0.20 : lg*0.30, colBot = land ? sd*0.80 : lg*0.62;
    const stX0 = land ? lg*0.345 : sd*0.28, stX1 = land ? lg*0.575 : sd*0.72, stY0 = land ? sd*0.24 : lg*0.30, stY1 = land ? sd*0.74 : lg*0.66;
    const rcX = land ? lg*0.70 : sd*0.12, rcY = land ? sd*0.20 : lg*0.73, rcW = land ? lg*0.22 : sd*0.76, rcH = land ? sd*0.56 : lg*0.13;
    const elSt = (typeof ElectrolyzerSystem !== 'undefined') ? ElectrolyzerSystem.getStubs(e) : null;

    // ── Pipework / busbars (under the equipment) ──
    const WAT = 'rgba(90,190,240,0.95)', HYD = 'rgba(160,230,255,0.95)';
    let bars;                                   // busbars, stack to rectifier: [x0, y0, x1, y1]
    if (land) {
      const dmC = dmY + dmH*0.5, outY = spY + spR*0.72;
      _wfPipe([..._portRing(e, f, px, py, elSt && elSt.waterStub, 8*S, 'left', dmC), [dmX, dmC]], S, t, active, WAT);
      _wfPipe([[dmX + dmW, dmC], [stX0 + 10*S, dmC], [stX0 + 10*S, stY1 + 5*S]], S, t, active, 'rgba(90,190,240,0.9)');
      _wfPipe([[colL, colTop], [colL, sd*0.09], [spX, sd*0.09], [spX, spY - spR]], S, t, active, 'rgba(210,240,255,0.95)');
      _wfPipe([[colL, colTop + 12*S], [stX0, colTop + 12*S]], S, t, active, 'rgba(210,240,255,0.9)');
      _wfPipe([[colR, colBot - 12*S], [stX1, colBot - 12*S]], S, t, active, 'rgba(90,190,240,0.9)');
      _wfPipe([[spX - spR*0.69, outY], ..._portRing(e, f, px, py, elSt && elSt.hydrogenStub, 21*S, 'left', outY).reverse()], S, t, !!e._hydrogenPipeOut, HYD);
      bars = [0.3, 0.7].map(q => { const y = stY0 + (stY1 - stY0)*q; return [stX1, y, rcX, y]; });
    } else {
      _wfPipe([..._portRing(e, f, px, py, elSt && elSt.waterStub, 8*S, 'left', waterY), [dmX + dmW*0.5, waterY], [dmX + dmW*0.5, dmY]], S, t, active, WAT);
      _wfPipe([[dmX + dmW*0.5, dmY + dmH], [dmX + dmW*0.5, colBot + 8*S], [stX0, colBot + 8*S]], S, t, active, 'rgba(90,190,240,0.9)');
      _wfPipe([[colL, colTop], [colL, spY + spR*0.5], [cx - spR*0.85, spY + spR*0.5]], S, t, active, 'rgba(210,240,255,0.95)');
      _wfPipe([[colR, colBot], [colR, stY1 - 8*S], [stX1, stY1 - 8*S]], S, t, active, 'rgba(90,190,240,0.9)');
      _wfPipe([[cx + spR*0.7, spY + spR*0.7], [w*0.93, spY + spR*0.7], [w*0.93, h2Y], ..._portRing(e, f, px, py, elSt && elSt.hydrogenStub, 8*S, 'right', h2Y).reverse()], S, t, !!e._hydrogenPipeOut, HYD);
      bars = [stX0 + 7*S, stX1 - 7*S].map(bx => [bx, stY1, bx, rcY]);
    }
    bars.forEach(([x0, y0, x1, y1], i) => {
      const bar = () => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
      ctx.strokeStyle = '#3a2412'; ctx.lineWidth = 6*S; ctx.lineCap = 'butt'; bar();
      ctx.strokeStyle = on ? '#e08a40' : '#7a5030'; ctx.lineWidth = 3.5*S; bar();
      if (active) { ctx.strokeStyle = `rgba(255,200,120,${0.35 + 0.3*Math.sin(t*9 + i)})`; ctx.lineWidth = 8*S; bar(); }
    });

    // ── Demineraliser skid (water polishing on the inlet) ──
    _wfShadow(dmX, dmY, dmW, dmH, S, 2*S);
    ctx.fillStyle = '#4a5a64'; ctx.strokeStyle = '#141c20'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.roundRect(dmX, dmY, dmW, dmH, 2*S); ctx.fill(); ctx.stroke();
    for (let k = 0; k < 3; k++) {
      const vx = dmX + dmW*(0.2 + k*0.3), vy = dmY + dmH*0.5, vr = Math.min(dmW*0.12, dmH*0.36);
      const vg = ctx.createRadialGradient(vx - vr*0.4, vy - vr*0.4, 0.5, vx, vy, vr);
      vg.addColorStop(0, '#e0ecf2'); vg.addColorStop(1, '#4a6a7a');
      ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(vx, vy, vr, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = active && (Math.floor(t*1.5) % 3 === k) ? '#60e0ff' : '#1a2a30';
      ctx.beginPath(); ctx.arc(vx, vy, vr*0.3, 0, Math.PI*2); ctx.fill();
    }

    // ── Gas separator columns ──
    [colL, colR].forEach((sx, i) => {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.roundRect(sx - colRad + 4*S, colTop + 5*S, colRad*2, colBot - colTop, colRad); ctx.fill();
      const g = ctx.createLinearGradient(sx - colRad, 0, sx + colRad, 0);
      g.addColorStop(0, '#6a7a82'); g.addColorStop(0.35, '#d0dce2'); g.addColorStop(1, '#3a464c');
      ctx.fillStyle = g; ctx.strokeStyle = '#1a2226'; ctx.lineWidth = S;
      ctx.beginPath(); ctx.roundRect(sx - colRad, colTop, colRad*2, colBot - colTop, colRad); ctx.fill(); ctx.stroke();
      const wy0 = colTop + 10*S, wy1 = colBot - 10*S;
      ctx.fillStyle = '#0a1a24'; ctx.fillRect(sx - 2.5*S, wy0, 5*S, wy1 - wy0);
      if (active) {
        for (let k = 0; k < 8; k++) {
          const p = (t*0.8 + k/8 + i*0.3) % 1;
          ctx.fillStyle = `rgba(200,240,255,${0.9*(1 - p*0.6)})`;
          ctx.beginPath(); ctx.arc(sx + Math.sin(k*2.1 + t*3)*0.8*S, wy1 - p*(wy1 - wy0), (0.8 + (k % 2)*0.5)*S, 0, Math.PI*2); ctx.fill();
        }
      }
      ctx.fillStyle = '#e8f0f4'; ctx.beginPath(); ctx.ellipse(sx, colTop + 1*S, colRad, colRad*0.45, 0, 0, Math.PI*2); ctx.fill();
    });
    // O₂ vent
    ctx.fillStyle = '#5a6870'; ctx.fillRect(colR - 2.5*S, colTop - 16*S, 5*S, 16*S);
    ctx.fillStyle = '#2a3236'; ctx.fillRect(colR - 4*S, colTop - 17*S, 8*S, 2.5*S);

    // ── Cell stack ──
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(stX0 + 5*S, stY0 + 6*S, stX1 - stX0, stY1 - stY0);
    ctx.fillStyle = '#3a4a52'; ctx.strokeStyle = '#141c20'; ctx.lineWidth = S;
    ctx.fillRect(stX0 - 3*S, stY0 - 5*S, stX1 - stX0 + 6*S, 7*S); ctx.strokeRect(stX0 - 3*S, stY0 - 5*S, stX1 - stX0 + 6*S, 7*S);
    ctx.fillRect(stX0 - 3*S, stY1 - 2*S, stX1 - stX0 + 6*S, 7*S); ctx.strokeRect(stX0 - 3*S, stY1 - 2*S, stX1 - stX0 + 6*S, 7*S);
    let pi = 0;
    for (let y = stY0 + 2*S; y < stY1 - 2*S; y += 3.2*S, pi++) {
      ctx.fillStyle = pi % 2 ? '#a8b4ba' : '#6a7880';
      ctx.fillRect(stX0, y, stX1 - stX0, 2.4*S);
      if (active && pi % 2) {
        ctx.fillStyle = `rgba(90,200,255,${Math.max(0, 0.2 + 0.45*Math.sin(t*6 + pi*0.7))})`;
        ctx.fillRect(stX0 + 2*S, y + 0.6*S, stX1 - stX0 - 4*S, 1.2*S);
      }
    }
    ctx.strokeStyle = '#d8e0e4'; ctx.lineWidth = 1.2*S;
    [stX0 - 1.5*S, stX1 + 1.5*S].forEach(rx => { ctx.beginPath(); ctx.moveTo(rx, stY0 - 5*S); ctx.lineTo(rx, stY1 + 5*S); ctx.stroke(); });
    ctx.fillStyle = '#e8c830';
    [stX0 - 1.5*S, stX1 + 1.5*S].forEach(rx => [stY0 - 1.5*S, stY1 + 1.5*S].forEach(ry => { ctx.beginPath(); ctx.arc(rx, ry, 1.4*S, 0, Math.PI*2); ctx.fill(); }));

    // ── Hydrogen sphere ──
    ctx.strokeStyle = '#6a7478'; ctx.lineWidth = 2*S;
    [-0.7, -0.25, 0.25, 0.7].forEach(k => { ctx.beginPath(); ctx.moveTo(spX + k*spR, spY); ctx.lineTo(spX + k*spR*1.15, spY + spR*1.05); ctx.stroke(); });
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(spX + 5*S, spY + 6*S, spR, 0, Math.PI*2); ctx.fill();
    const sg = ctx.createRadialGradient(spX - spR*0.4, spY - spR*0.4, spR*0.1, spX, spY, spR);
    sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.55, '#c8d4da'); sg.addColorStop(1, '#6a7a82');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(spX, spY, spR, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(60,70,76,0.35)'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.ellipse(spX, spY, spR, spR*0.3, 0, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(spX, spY, spR*0.3, spR, 0, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = '#141c20'; ctx.lineWidth = 3*S;
    ctx.beginPath(); ctx.arc(spX, spY, spR + 3*S, 0, Math.PI*2); ctx.stroke();
    if (h2Fill > 0) {
      const warn = on && h2Fill > 0.85 && Math.sin(t*6) > 0;
      ctx.strokeStyle = warn ? '#ff5030' : accent; ctx.globalAlpha = on ? 0.95 : 0.5; ctx.lineWidth = 2.2*S;
      ctx.beginPath(); ctx.arc(spX, spY, spR + 3*S, -Math.PI/2, -Math.PI/2 + Math.PI*2*h2Fill); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ── Rectifier cabinet ──
    _wfShadow(rcX, rcY, rcW, rcH, S, 2*S);
    const rg = ctx.createLinearGradient(0, rcY, 0, rcY + rcH);
    rg.addColorStop(0, '#5a6a72'); rg.addColorStop(1, '#2a343a');
    ctx.fillStyle = rg; ctx.strokeStyle = '#141c20'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.roundRect(rcX, rcY, rcW, rcH, 2*S); ctx.fill(); ctx.stroke();
    [0.26, 0.26 + 0.34].forEach((fx0, i) => {
      const fx = rcX + rcW*fx0, fy = rcY + rcH*0.36, fr = Math.min(rcW*0.13, rcH*0.26);
      _fcFan(fx, fy, fr, S, t + i*0.4, on, 10);
    });
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = on ? (k === 3 && active ? `rgba(90,220,255,${0.6 + 0.4*Math.sin(t*5)})` : '#60ff80') : '#2a3a30';
      ctx.beginPath(); ctx.arc(rcX + rcW*(0.18 + k*0.2), rcY + rcH*0.78, 1.6*S, 0, Math.PI*2); ctx.fill();
    }
    ctx.fillStyle = on ? '#ffd040' : '#6a5a20';
    const lbx = rcX + rcW*0.86, lby = rcY + rcH*0.2;
    ctx.beginPath(); ctx.moveTo(lbx, lby); ctx.lineTo(lbx - 3*S, lby + 6*S); ctx.lineTo(lbx, lby + 6*S); ctx.lineTo(lbx - 2*S, lby + 11*S); ctx.lineTo(lbx + 3.5*S, lby + 4*S); ctx.lineTo(lbx + 0.5*S, lby + 4*S); ctx.lineTo(lbx + 2.5*S, lby); ctx.closePath(); ctx.fill();
    ctx.restore();

    // ── Text + effects in world space ──
    const [vx, vy] = f.toWorld(colR, colTop - 18*S);
    _wfSmoke(vx, vy, S*0.4, t, '245,250,255', active, 0.45);
    _frameText(f, colL, colBot + 8*S, 'H₂', lblFont, on ? accent : '#4a5a60');
    _frameText(f, colR, colBot + 8*S, 'O₂', lblFont, on ? '#ff9a80' : '#4a5a60');
    _frameText(f, spX, spY + 1*S, 'H₂', `bold ${Math.max(6, 9*S)}px Courier New`, on ? '#1a5a80' : '#4a5a60');

    // ── Ports — water IN / hydrogen OUT, faces follow the rotation ──
    if (elSt) {
      const { waterStub, hydrogenStub } = elSt;
      _portPipe(_portAnchor(e, px, py, f.W, f.H, waterStub), S, t, { fluid: '#40c0e0', label: 'WATER IN', on: !!e._waterConnected, out: false, flow: active });
      _portPipe(_portAnchor(e, px, py, f.W, f.H, hydrogenStub), S, t, { fluid: '#80e0ff', label: 'H₂ OUT', on: !!e._hydrogenPipeOut, out: true, flow: !!e._hydrogenPipeOut });
    }

    const [plx, ply] = f.toWorld(cx, h*0.94);
    _wfPlate('ELECTROLYZER', plx, ply, S, accent, on);
    _wfLamp(px + f.W - 7*S, py + 7*S, S, t, accent, on);
    ctx.restore();
  }

function renderFuelPlant(e, px, py, t) {
    // Fuel fabrication: ore hopper → stirred acid leach tanks → centrifuge
    // hall → pellet press + robot arm on the rod line → rod storage rack that
    // lights up rod by rod as the output buffer fills. Stubs stay on the
    // bottom face (FuelPlantSystem.getStubs). No backdrop.
    const w   = (e.width  || 6) * TILE;
    const h   = (e.height || 5) * TILE;
    const on  = e.powered;
    const def = EntityDefs[T.FUELPLANT];
    const rods    = e._rods || 0;
    const rodFill = Math.min(1, rods / (def.rodCapacity || 150));
    const active  = on && e._hasAcid && e._hasUranium;
    // Detail scale follows the footprint, so the bigger plant's parts, lines
    // and labels grow with it (an 8×7 plant — older saves — draws as before).
    const S = (TILE / 40) * Math.max(1, Math.min(w / (8 * TILE), h / (7 * TILE)));
    const accent = '#a0ff60';
    ctx.save();

    const t1x = px + w*0.12, t2x = px + w*0.30, tY = py + h*0.27, tR = w*0.08;
    const hallX = px + w*0.40, hallY = py + h*0.11, hallW = w*0.26, hallH = h*0.44;
    const rackX = px + w*0.70, rackY = py + h*0.11, rackW = w*0.25, rackH = h*0.44;
    const lineY = py + h*0.68, lineX0 = px + w*0.40, lineX1 = px + w*0.80;

    // ── Pipework / belts (under the equipment) ──
    _wfPipe([[px + TILE*2.5, py + h - 14*S], [px + TILE*2.5, py + h*0.56], [t2x, py + h*0.56], [t2x, tY + tR]], S, t, active, '#e0d040');
    _wfPipe([[t1x + tR, tY], [t2x - tR, tY]], S, t, active, '#c0e060');
    _wfPipe([[t2x + tR, tY], [hallX, tY]], S, t, active, accent);
    _wfPipe([[hallX + hallW*0.5, hallY + hallH], [hallX + hallW*0.5, lineY - 8*S]], S, t, active, accent);
    _wfConveyor(px + TILE*1.5, py + h - 14*S, t1x, tY + tR, S, t, active, '#6a8a40');
    _wfConveyor(lineX1, lineY, px + TILE*4.5, py + h - 14*S, S, t, on, '#6a8a40');

    // ── Ore hopper over the U IN belt ──
    const hpX = px + TILE*1.5, hpY = py + h*0.80;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.moveTo(hpX - 11*S + 4*S, hpY - 8*S + 5*S); ctx.lineTo(hpX + 11*S + 4*S, hpY - 8*S + 5*S); ctx.lineTo(hpX + 4*S + 4*S, hpY + 8*S + 5*S); ctx.lineTo(hpX - 4*S + 4*S, hpY + 8*S + 5*S); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6a6458'; ctx.strokeStyle = '#24221c'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.moveTo(hpX - 11*S, hpY - 8*S); ctx.lineTo(hpX + 11*S, hpY - 8*S); ctx.lineTo(hpX + 4*S, hpY + 8*S); ctx.lineTo(hpX - 4*S, hpY + 8*S); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#22301a'; ctx.beginPath(); ctx.ellipse(hpX, hpY - 7*S, 10*S, 2.5*S, 0, 0, Math.PI*2); ctx.fill();
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = e._hasUranium ? `rgba(140,255,110,${0.6 + 0.3*Math.sin(t*3 + k)})` : '#3a5a30';
      ctx.beginPath(); ctx.arc(hpX - 6*S + k*3*S, hpY - 7*S + ((k*5) % 3 - 1)*0.8*S, 1.3*S, 0, Math.PI*2); ctx.fill();
    }

    // ── Acid leach tanks ──
    [t1x, t2x].forEach((tx, i) => {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(tx + 5*S, tY + 6*S, tR, 0, Math.PI*2); ctx.fill();
      const rg = ctx.createRadialGradient(tx - tR*0.35, tY - tR*0.35, tR*0.1, tx, tY, tR);
      rg.addColorStop(0, '#a8b0a0'); rg.addColorStop(0.6, '#5a6452'); rg.addColorStop(1, '#262c22');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(tx, tY, tR, 0, Math.PI*2); ctx.fill();
      const lr = tR - 4*S;
      const lg = ctx.createRadialGradient(tx, tY, 1, tx, tY, lr);
      lg.addColorStop(0, active ? '#e8f060' : '#6a7030'); lg.addColorStop(1, active ? '#6aa020' : '#2a3418');
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(tx, tY, lr, 0, Math.PI*2); ctx.fill();
      if (active) {
        for (let k = 0; k < 4; k++) {
          const p = (t*0.9 + k/4 + i*0.3) % 1;
          const a = k*1.7 + i;
          ctx.strokeStyle = `rgba(240,255,180,${0.7*(1 - p)})`; ctx.lineWidth = 0.8*S;
          ctx.beginPath(); ctx.arc(tx + Math.cos(a)*lr*0.5, tY + Math.sin(a)*lr*0.5, (0.8 + p*2.5)*S, 0, Math.PI*2); ctx.stroke();
        }
      }
      ctx.save(); ctx.translate(tx, tY); ctx.rotate(active ? t*2.5*(i ? -1 : 1) : 0.4);
      ctx.fillStyle = '#c8ccc0'; ctx.fillRect(-lr, -1.5*S, lr*2, 3*S);
      ctx.restore();
      ctx.fillStyle = '#3a4034'; ctx.beginPath(); ctx.arc(tx, tY, 3.5*S, 0, Math.PI*2); ctx.fill();
    });

    // ── Centrifuge hall (glass roof) ──
    _wfShadow(hallX, hallY, hallW, hallH, S, 3*S);
    ctx.fillStyle = '#2e3a2a'; ctx.strokeStyle = '#141a12'; ctx.lineWidth = 1.5*S;
    ctx.beginPath(); ctx.roundRect(hallX, hallY, hallW, hallH, 3*S); ctx.fill(); ctx.stroke();
    const gx = hallX + 4*S, gy = hallY + 4*S, gw = hallW - 8*S, gh = hallH*0.72;
    ctx.fillStyle = active ? 'rgba(40,70,30,0.95)' : '#141c12'; ctx.fillRect(gx, gy, gw, gh);
    const cols = 3, rows = 4;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const ccx = gx + gw*(c + 0.5)/cols, ccy = gy + gh*(r + 0.5)/rows, cr = Math.min(gw/cols, gh/rows)*0.32;
      ctx.fillStyle = '#9aa294'; ctx.beginPath(); ctx.arc(ccx, ccy, cr, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#2a3026'; ctx.lineWidth = 0.8*S; ctx.stroke();
      if (active) {
        const a = t*9 + r*1.3 + c*2.1;
        ctx.strokeStyle = 'rgba(200,255,150,0.9)'; ctx.lineWidth = 1.2*S;
        ctx.beginPath(); ctx.arc(ccx, ccy, cr*0.62, a, a + 1.4); ctx.stroke();
      }
      ctx.fillStyle = active ? accent : '#3a4a30';
      ctx.beginPath(); ctx.arc(ccx, ccy, 1.1*S, 0, Math.PI*2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(220,255,220,0.18)'; ctx.lineWidth = S;
    for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(gx + gw*k/4, gy); ctx.lineTo(gx + gw*k/4, gy + gh); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(gx, gy, gw*0.4, gh);
    const wy = hallY + hallH*0.80;
    _wfTrefoil(hallX + hallW*0.18, wy + 3*S, 5.5*S, '#e8c820', '#1a1608');
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = on ? `rgba(160,255,110,${0.45 + 0.25*Math.sin(t*1.6 + k)})` : 'rgba(30,44,26,0.9)';
      ctx.fillRect(hallX + hallW*(0.40 + k*0.19), wy, hallW*0.12, 5*S);
    }

    // ── Rod line: pellet press, pellets, robot arm ──
    _wfConveyor(lineX0 + 14*S, lineY, lineX1, lineY, S, t, active, '#5a6a50');
    if (active) {
      for (let k = 0; k < 6; k++) {
        const p = (t*0.25 + k/6) % 1;
        const x = lineX0 + 18*S + p*(lineX1 - lineX0 - 22*S);
        ctx.fillStyle = '#2a4a1a'; ctx.fillRect(x - 2.5*S, lineY - 2*S, 5*S, 4*S);
        ctx.fillStyle = accent; ctx.fillRect(x - 2.5*S, lineY - 2*S, 5*S, 1.2*S);
      }
    }
    // press
    const prX = lineX0 - 2*S, prY = lineY - 14*S;
    _wfShadow(prX, prY, 20*S, 26*S, S, 2*S);
    ctx.fillStyle = '#5a6254'; ctx.strokeStyle = '#1a1e18'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.roundRect(prX, prY, 20*S, 26*S, 2*S); ctx.fill(); ctx.stroke();
    const stroke = active ? Math.abs(Math.sin(t*4))*6*S : 0;
    ctx.fillStyle = '#c8ccc0'; ctx.fillRect(prX + 6*S, prY + 4*S + stroke, 8*S, 6*S);
    _wfHazardStripe(prX, prY + 20*S, 20*S, 4*S, S);
    // robot arm
    const baseX = px + w*0.64, baseY = lineY + 13*S;
    const a1 = active ? -1.9 + 0.5*Math.sin(t*1.8) : -1.6;
    const a2 = active ? 1.2 + 0.6*Math.sin(t*1.8 + 1.2) : 1.0;
    const l1 = 14*S, l2 = 11*S;
    const ex = baseX + Math.cos(a1)*l1, ey = baseY + Math.sin(a1)*l1;
    const hx2 = ex + Math.cos(a1 + a2)*l2, hy2 = ey + Math.sin(a1 + a2)*l2;
    ctx.fillStyle = '#2a2e26'; ctx.beginPath(); ctx.arc(baseX, baseY, 5*S, 0, Math.PI*2); ctx.fill();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 4*S;
    ctx.beginPath(); ctx.moveTo(baseX + 3*S, baseY + 4*S); ctx.lineTo(ex + 3*S, ey + 4*S); ctx.lineTo(hx2 + 3*S, hy2 + 4*S); ctx.stroke();
    ctx.strokeStyle = '#e0a020'; ctx.lineWidth = 3.5*S;
    ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = '#f0b830'; ctx.lineWidth = 2.5*S;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(hx2, hy2); ctx.stroke();
    ctx.fillStyle = '#3a3a34'; ctx.beginPath(); ctx.arc(ex, ey, 2*S, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = active ? accent : '#4a5a3a'; ctx.beginPath(); ctx.arc(hx2, hy2, 1.8*S, 0, Math.PI*2); ctx.fill();

    // ── Rod storage rack ──
    _wfShadow(rackX, rackY, rackW, rackH, S, 3*S);
    ctx.fillStyle = '#3a4038'; ctx.strokeStyle = '#161a14'; ctx.lineWidth = 1.5*S;
    ctx.beginPath(); ctx.roundRect(rackX, rackY, rackW, rackH, 3*S); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#10160e'; ctx.fillRect(rackX + 4*S, rackY + 4*S, rackW - 8*S, rackH - 8*S);
    const rc = 6, rr = 2, total = rc*rr;
    const lit = Math.round(rodFill*total);
    for (let r = 0; r < rr; r++) for (let c = 0; c < rc; c++) {
      const idx = (rr - 1 - r)*rc + c;
      const cellW = (rackW - 8*S)/rc, cellH = (rackH - 8*S)/rr;
      const rx = rackX + 4*S + cellW*(c + 0.5), ry0 = rackY + 4*S + cellH*r + 3*S, ry1 = ry0 + cellH - 6*S;
      const isLit = idx < lit;
      if (isLit && on) {
        ctx.fillStyle = `rgba(160,255,96,${0.18 + 0.1*Math.sin(t*2 + idx)})`;
        ctx.fillRect(rx - cellW*0.45, ry0 - 1*S, cellW*0.9, ry1 - ry0 + 2*S);
      }
      ctx.fillStyle = isLit ? (on ? '#b8ff80' : '#5a8a3a') : '#2a3226';
      ctx.fillRect(rx - 1.8*S, ry0, 3.6*S, ry1 - ry0);
      ctx.fillStyle = isLit ? '#e8ffd0' : '#3a4436';
      ctx.fillRect(rx - 1.8*S, ry0, 3.6*S, 2*S);
    }
    // gantry
    const gt = on ? 0.5 + 0.45*Math.sin(t*0.5) : 0.2;
    const gyy = rackY + 4*S + gt*(rackH - 12*S);
    ctx.fillStyle = '#d8a820'; ctx.strokeStyle = '#4a3a10'; ctx.lineWidth = S;
    ctx.fillRect(rackX - 2*S, gyy, rackW + 4*S, 4*S); ctx.strokeRect(rackX - 2*S, gyy, rackW + 4*S, 4*S);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.font = `bold ${Math.max(4, 4.5*S)}px Courier New`; ctx.textAlign = 'center';
    ctx.fillStyle = on ? accent : '#4a6a30';
    ctx.fillText(`RODS ${Math.round(rodFill*100)}%`, rackX + rackW/2, rackY + rackH + 7*S);

    // ── Decontamination booth ──
    const dbX = px + w*0.86, dbY = py + h*0.70, dbW = w*0.10, dbH = h*0.16;
    _wfShadow(dbX, dbY, dbW, dbH, S, 2*S);
    ctx.fillStyle = '#d0d4c8'; ctx.strokeStyle = '#3a3e36'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.roundRect(dbX, dbY, dbW, dbH, 2*S); ctx.fill(); ctx.stroke();
    ctx.fillStyle = on ? `rgba(90,200,255,${0.5 + 0.3*Math.sin(t*3)})` : '#6a7470';
    ctx.fillRect(dbX + dbW*0.2, dbY + dbH*0.25, dbW*0.6, dbH*0.3);
    ctx.fillStyle = '#b02820'; ctx.fillRect(dbX + dbW*0.2, dbY + dbH*0.7, dbW*0.6, 2*S);

    // ── Stubs (bottom face): U IN belt at col+1, ACID IN pipe at col+2,
    // ROD OUT belt at col+4 — tile-anchored to FuelPlantSystem.getStubs.
    // Bright, readable art in both states: connected ones glow and animate,
    // unconnected ones sit in muted mid-tones rather than near-black.
    const TH = TILE/2;
    const stubLen = Math.min(TILE * 0.95, S*22);
    const stubY1 = py + h - stubLen;      // top of the stub (inside the footprint)
    const stubY0 = py + h;                // building edge — the pipe/belt tile carries on below
    // IN / OUT labels: big, bold and high-contrast in both states — bright
    // colour with a glow when connected, near-white when not.
    const labelPill = (text, x, y, on, col) => {
      const fs = Math.max(9, S*8);
      ctx.font = `bold ${fs}px Arial, sans-serif`;
      const tw = ctx.measureText(text).width + fs*0.9, th = fs*1.45;
      ctx.fillStyle = 'rgba(4,8,4,0.92)';
      ctx.strokeStyle = on ? col : 'rgba(235,235,215,0.8)';
      ctx.lineWidth = Math.max(1.2, S*1);
      ctx.beginPath(); ctx.roundRect(x - tw/2, y - th/2, tw, th, th/2); ctx.fill(); ctx.stroke();
      ctx.save();
      if (on) { ctx.shadowColor = col; ctx.shadowBlur = fs*0.8; }
      ctx.fillStyle = on ? col : '#f0f0e4';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + fs*0.05);
      ctx.restore();
      ctx.textBaseline = 'alphabetic';
    };

    // ACID IN — flanged pipe with a valve wheel and flowing chevrons.
    {
      const x = px + TILE*2 + TH, conn = !!e._hasAcid;
      const bodyW = S*7;
      if (conn) {                                   // soft acid glow
        const g = ctx.createRadialGradient(x, (stubY0 + stubY1)/2, 0, x, (stubY0 + stubY1)/2, stubLen*0.9);
        g.addColorStop(0, 'rgba(230,240,60,0.35)'); g.addColorStop(1, 'rgba(230,240,60,0)');
        ctx.fillStyle = g; ctx.fillRect(x - stubLen, stubY1 - S*4, stubLen*2, stubLen + S*8);
      }
      const pg = ctx.createLinearGradient(x - bodyW/2, 0, x + bodyW/2, 0);
      pg.addColorStop(0,   conn ? '#8a8a10' : '#6a6a48');
      pg.addColorStop(0.45, conn ? '#f4f060' : '#b4b490');
      pg.addColorStop(1,   conn ? '#7a7a10' : '#5a5a40');
      ctx.fillStyle = pg;
      ctx.fillRect(x - bodyW/2, stubY1, bodyW, stubLen);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = Math.max(1, S*0.6);
      ctx.strokeRect(x - bodyW/2, stubY1, bodyW, stubLen);
      for (const fy of [stubY1 + S*2, stubY0 - S*3]) {  // flanges with bolts
        ctx.fillStyle = conn ? '#c8c040' : '#8a8a70';
        ctx.fillRect(x - bodyW/2 - S*2, fy - S*1.5, bodyW + S*4, S*3);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        for (const bx of [-1, 1]) { ctx.beginPath(); ctx.arc(x + bx*(bodyW/2 + S*0.8), fy, S*0.7, 0, Math.PI*2); ctx.fill(); }
      }
      // valve wheel on the side
      const vx = x + bodyW/2 + S*4, vy = stubY1 + stubLen*0.45;
      ctx.strokeStyle = conn ? '#ff5040' : '#a06050'; ctx.lineWidth = Math.max(1, S*1.2);
      ctx.beginPath(); ctx.arc(vx, vy, S*3, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(vx - S*3, vy); ctx.lineTo(vx + S*3, vy); ctx.moveTo(vx, vy - S*3); ctx.lineTo(vx, vy + S*3); ctx.stroke();
      ctx.fillStyle = conn ? '#ff5040' : '#a06050'; ctx.fillRect(x + bodyW/2, vy - S*0.6, S*1.2, S*1.2);
      // flow chevrons (acid comes IN — travelling up into the plant)
      if (conn) {
        ctx.strokeStyle = 'rgba(60,60,0,0.8)'; ctx.lineWidth = Math.max(1, S*1.1);
        for (let k = 0; k < 3; k++) {
          const f = ((t*0.9 + k/3) % 1);
          const cy = stubY0 - S*4 - f*(stubLen - S*8);
          ctx.beginPath(); ctx.moveTo(x - S*2, cy + S*1.4); ctx.lineTo(x, cy - S*0.6); ctx.lineTo(x + S*2, cy + S*1.4); ctx.stroke();
        }
      }
      // Staggered a row above the belt labels: U IN sits on the very next
      // tile, and at a readable size the two pills would overlap.
      labelPill('ACID IN', x, stubY1 - Math.max(9, S*8)*2.5, conn, '#f0f060');
    }

    // U IN / ROD OUT — steel-framed belt stubs with rollers and moving cargo.
    [
      { tx: px + TILE*1 + TH, label: 'U IN',    connected: !!e._hasUranium,     up: true,  cargo: '#8cff5a', trim: '#90e050' },
      { tx: px + TILE*4 + TH, label: 'ROD OUT', connected: !!e._rodConveyorOut, up: false, cargo: '#ffd040', trim: '#f0c040' },
    ].forEach(({ tx, label, connected, up, cargo, trim }) => {
      const bw = S*16, x0 = tx - bw/2;
      if (connected) {
        const g = ctx.createRadialGradient(tx, (stubY0 + stubY1)/2, 0, tx, (stubY0 + stubY1)/2, stubLen);
        g.addColorStop(0, up ? 'rgba(140,255,90,0.28)' : 'rgba(255,208,64,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(tx - stubLen, stubY1 - S*4, stubLen*2, stubLen + S*8);
      }
      // side rails
      ctx.fillStyle = connected ? trim : '#8a8a74';
      ctx.fillRect(x0 - S*1.5, stubY1, S*2, stubLen);
      ctx.fillRect(x0 + bw - S*0.5, stubY1, S*2, stubLen);
      // belt surface
      ctx.fillStyle = connected ? '#2e3428' : '#44463c';
      ctx.fillRect(x0 + S*0.5, stubY1, bw - S, stubLen);
      // rollers (moving when connected)
      const phase = connected ? ((t * 1.2) % 1) : 0;
      const dir = up ? -1 : 1;
      ctx.strokeStyle = connected ? 'rgba(210,220,190,0.45)' : 'rgba(160,160,140,0.35)';
      ctx.lineWidth = Math.max(1, S*0.8);
      const step = S*4;
      for (let yy = 0; yy <= stubLen + step; yy += step) {
        const ly = stubY1 + ((yy + dir*phase*step) % (stubLen + step) + stubLen + step) % (stubLen + step);
        if (ly < stubY1 || ly > stubY0) continue;
        ctx.beginPath(); ctx.moveTo(x0 + S*1, ly); ctx.lineTo(x0 + bw - S*1, ly); ctx.stroke();
      }
      // cargo riding the belt
      if (connected) {
        for (let k = 0; k < 2; k++) {
          const f = ((t*0.6 + k*0.5) % 1);
          const cy = up ? stubY0 - f*stubLen : stubY1 + f*stubLen;
          ctx.fillStyle = cargo;
          if (up) { ctx.beginPath(); ctx.arc(tx, cy, S*2.2, 0, Math.PI*2); ctx.fill(); }
          else    { ctx.fillRect(tx - S*1.2, cy - S*3, S*2.4, S*6); }
        }
      }
      // direction arrow
      ctx.fillStyle = connected ? trim : 'rgba(200,200,170,0.7)';
      const ay = up ? stubY1 + S*4 : stubY0 - S*4;
      ctx.beginPath();
      if (up) { ctx.moveTo(tx, ay - S*2.5); ctx.lineTo(tx + S*3, ay + S*1.5); ctx.lineTo(tx - S*3, ay + S*1.5); }
      else    { ctx.moveTo(tx, ay + S*2.5); ctx.lineTo(tx + S*3, ay - S*1.5); ctx.lineTo(tx - S*3, ay - S*1.5); }
      ctx.closePath(); ctx.fill();
      labelPill(label, tx, stubY1 - Math.max(9, S*8)*0.9, connected, trim);
    });

    _wfPlate('FUEL FABRICATION', px + w*0.53, py + h*0.045, S, accent, on);
    _wfLamp(px + w - 7*S, py + 7*S, S, t, accent, on);
    ctx.restore();
  }

// L-shaped feeder from a port into the plant: straight in off the wall,
// then across to the equipment it serves. Belts use _wfConveyor segments,
// pipes a _wfPipe polyline.
function _portFeed(a, tx, ty, S, t, on, kind, color) {
  const [x0, y0] = _portIn(a, 14*S);
  const mid = (a.dx !== 0) ? [tx, y0] : [x0, ty];
  if (kind === 'belt') {
    _wfConveyor(x0, y0, mid[0], mid[1], S, t, on, color);
    if (Math.abs(mid[0] - tx) + Math.abs(mid[1] - ty) > 1) _wfConveyor(mid[0], mid[1], tx, ty, S, t, on, color);
  } else {
    _wfPipe([[x0, y0], mid, [tx, ty]], S, t, on, color);
  }
}

function renderLithiumProcessPlant(e, px, py, t) {
    // Lithium refinery, top-down on a fenced concrete pad (authored in an
    // 800×720 box and fitted to the footprint, so older 10×9 / 6×5 plants
    // still draw whole). Ore arrives at a covered stockpile and hopper where
    // a loader works, rides into a long rotary kiln (burner glow, exhaust
    // stack), through a dust cyclone into twin leach tanks, up a steaming
    // pair of evaporator towers, across an elevated pipe rack to a row of
    // crystallizer vats worked by a travelling gantry crane, and into two
    // compound silos with a truck loading bay. A sawtooth process hall, a
    // control room with the Li₂CO₃ readout, a clarifier with a turning arm
    // beside the water intake, cooling-fan cells, workers in hi-vis and
    // floodlight masts at night. Ports and their feeds still come from
    // LithiumProcessPlantSystem.getStubs() via the shared _port* helpers.
    const def = EntityDefs[T.LITHIUMPROCESSPLANT];
    const w   = (e.width || def.width) * TILE;
    const h   = (e.height || def.height) * TILE;
    const on  = e.powered;
    const compoundFill = Math.min(1, (e._compound || 0) / (def.compoundCapacity || 300));
    const active = on && e._oreConveyor && e._waterConnected;
    const S = TILE / 40;
    const accent = '#c0a0ff';
    const night = DayNight.darkness() > 0.3;
    const detail = Camera.zoom > 0.3;

    // authored-space helpers (800×720 → footprint)
    const s = Math.min(w / 800, h / 720);
    const ox = px + (w - 800 * s) / 2, oy = py + (h - 720 * s) / 2;
    const X = v => ox + v * s, Y = v => oy + v * s;
    const R = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), ww * s, hh * s); };
    const RR = (x, y, ww, hh, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(X(x), Y(y), ww * s, hh * s, r * s); ctx.fill(); };
    const dot = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(x), Y(y), Math.max(0.01, r * s), 0, Math.PI * 2); ctx.fill(); };
    const ring = (x, y, r, c, lw) => { ctx.strokeStyle = c; ctx.lineWidth = lw * s; ctx.beginPath(); ctx.arc(X(x), Y(y), r * s, 0, Math.PI * 2); ctx.stroke(); };
    const ln = (x1, y1, x2, y2, c, lw = 1) => { ctx.strokeStyle = c; ctx.lineWidth = lw * s; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
    const glow = (x, y, r, rgb, a) => {
      if (a <= 0.005) return;
      const g = ctx.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r * s);
      g.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.fillRect(X(x - r), Y(y - r), 2 * r * s, 2 * r * s);
    };
    const shadow = (x, y, ww, hh, r = 4) => RR(x + 6, y + 8, ww, hh, r, 'rgba(0,0,0,0.3)');
    const tank = (x, y, r, top, mid, dark) => {               // round tank seen from above
      dot(x + 6, y + 8, r, 'rgba(0,0,0,0.32)');
      const g = ctx.createRadialGradient(X(x - r * 0.35), Y(y - r * 0.35), r * s * 0.1, X(x), Y(y), r * s);
      g.addColorStop(0, top); g.addColorStop(0.6, mid); g.addColorStop(1, dark);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(x), Y(y), r * s, 0, Math.PI * 2); ctx.fill();
      ring(x, y, r - 1, 'rgba(0,0,0,0.35)', 2);
    };
    const worker = (x, y, k) => {
      dot(x + 1.5, y + 2, 4, 'rgba(0,0,0,0.3)');
      dot(x, y, 4, '#f0a020'); dot(x, y, 2.6, '#f4f4f0');                   // hi-vis + hard hat
      if (k % 2) dot(x + 2.5, y - 1, 1.2, '#20a0f0');
    };

    ctx.save();
    ctx.beginPath(); ctx.rect(px, py, w, h); ctx.clip();

    // ── Pad, drainage, fence ──
    // The pad and its fence cover the whole footprint, not the authored box:
    // the plant is fitted at one scale, so on a footprint of another shape
    // (a plant turned a quarter) the box leaves a strip either side of it.
    // (The pad used to stop at the box. A turned plant then sat on a slab
    // smaller than its plot, with its ports and their feed lines out past the
    // fence on bare grass.)
    const PX0 = (px - ox) / s, PY0 = (py - oy) / s, PX1 = PX0 + w / s, PY1 = PY0 + h / s;
    R(PX0, PY0, PX1 - PX0, PY1 - PY0, on ? '#9a968c' : '#5a5852');
    R(PX0 + 10, PY0 + 10, PX1 - PX0 - 20, PY1 - PY0 - 20, on ? '#b4b0a6' : '#6a6862');
    if (detail) {
      for (let x = PX0 + 10; x < PX1 - 10; x += 60) R(x, PY0 + 10, 1.2, PY1 - PY0 - 20, 'rgba(0,0,0,0.08)');   // slab joints
      for (let y = PY0 + 10; y < PY1 - 10; y += 60) R(PX0 + 10, y, PX1 - PX0 - 20, 1.2, 'rgba(0,0,0,0.08)');
      for (let k = 0; k < 18; k++) dot(40 + _cmFrac(k * 3.1) * 720, 40 + _cmFrac(k * 7.7) * 640, 8 + _cmFrac(k) * 14, 'rgba(40,36,30,0.12)');   // stains
    }
    ctx.strokeStyle = 'rgba(70,74,78,0.9)'; ctx.lineWidth = 2 * s; ctx.strokeRect(X(PX0 + 5), Y(PY0 + 5), (PX1 - PX0 - 10) * s, (PY1 - PY0 - 10) * s);
    if (detail) for (let x = PX0 + 5; x <= PX1 - 5; x += 30) { dot(x, PY0 + 5, 1.8, '#4a4e52'); dot(x, PY1 - 5, 1.8, '#4a4e52'); }
    // internal ring road
    const ROAD = on ? '#4a4c50' : '#2e3034';
    R(40, 636, 746, 40, ROAD); R(750, 100, 36, 576, ROAD); R(40, 224, 36, 452, ROAD);
    if (detail) {
      for (let x = 50; x < 776; x += 28) R(x, 655, 14, 2, 'rgba(240,210,70,0.8)');
      for (let y = 110; y < 630; y += 28) R(767, y, 2, 14, 'rgba(240,210,70,0.8)');
      for (let y = 234; y < 630; y += 28) R(57, y, 2, 14, 'rgba(240,210,70,0.8)');
    }
    // painted pedestrian walkway
    if (detail) for (let x = 90; x < 700; x += 12) R(x, 612, 6, 10, 'rgba(60,160,80,0.45)');

    // ── Ports + feeds (under the equipment) ──
    const hop = [150, 560], silo1 = [120, 130], pump = [100, 330];
    const st = (typeof LithiumProcessPlantSystem !== 'undefined') ? LithiumProcessPlantSystem.getStubs(e) : null;
    const aOre = st && _portAnchor(e, px, py, w, h, st.oreIn);
    const aCpd = st && _portAnchor(e, px, py, w, h, st.compoundOut);
    const aWat = st && _portAnchor(e, px, py, w, h, st.waterIn);
    if (aWat) _portFeed(aWat, X(pump[0]), Y(pump[1]), S, t, on && !!e._waterConnected, 'pipe', 'rgba(90,200,240,0.95)');
    if (aOre) _portFeed(aOre, X(hop[0]), Y(hop[1]), S, t, !!e._oreConveyor, 'belt', '#7a6a90');
    if (aCpd) _portFeed(aCpd, X(silo1[0]), Y(silo1[1]), S, t, !!e._compoundConveyorOut, 'belt', '#8a78b0');

    // ── Elevated pipe rack (process lines) ──
    const rackY = 214;
    R(90, rackY - 4, 660, 26, 'rgba(0,0,0,0.25)');
    for (let x = 100; x < 740; x += 40) R(x, rackY - 6, 6, 28, '#5a5e64');          // bents
    const lines = [['#7a50c8', active], ['#40c0e0', on && e._waterConnected], ['#e0a040', active], ['#c8c8c8', on]];
    lines.forEach(([c, fl], i) => {
      const yy = rackY + i * 5;
      ln(90, yy, 740, yy, '#20242a', 4); ln(90, yy, 740, yy, c, 2.4);
      if (fl && detail) { ctx.setLineDash([6 * s, 10 * s]); ctx.lineDashOffset = -t * 30 * s * (i % 2 ? -1 : 1); ln(90, yy, 740, yy, 'rgba(255,255,255,0.55)', 1); ctx.setLineDash([]); ctx.lineDashOffset = 0; }
    });
    // vertical drop to the process area
    R(662, 214, 22, 360, 'rgba(0,0,0,0.2)');
    ['#7a50c8', '#e0a040'].forEach((c, i) => { ln(668 + i * 8, 234, 668 + i * 8, 560, '#20242a', 4); ln(668 + i * 8, 234, 668 + i * 8, 560, c, 2.4); });

    // ── Compound silos + truck loading bay (top-left) ──
    for (const [sx, sy] of [silo1, [220, 130]]) {
      tank(sx, sy, 50, '#e4dcf0', '#9a90b0', '#3a3448');
      ring(sx, sy, 34, 'rgba(0,0,0,0.25)', 1.2);
      for (let q = 0; q < 12; q++) { const a = q * Math.PI / 6; ln(sx + Math.cos(a) * 34, sy + Math.sin(a) * 34, sx + Math.cos(a) * 48, sy + Math.sin(a) * 48, 'rgba(0,0,0,0.18)', 1); }
      dot(sx, sy, 9, '#4a4458'); dot(sx, sy, 5, on ? accent : '#4a3c6a');
    }
    // fill gauge ring on the first silo
    ctx.strokeStyle = '#18141e'; ctx.lineWidth = 6 * s; ctx.beginPath(); ctx.arc(X(silo1[0]), Y(silo1[1]), 42 * s, 0, Math.PI * 2); ctx.stroke();
    if (compoundFill > 0) {
      const warn = on && compoundFill > 0.85 && Math.sin(t * 6) > 0;
      ctx.strokeStyle = warn ? '#ff5030' : accent; ctx.lineWidth = 4.5 * s;
      ctx.beginPath(); ctx.arc(X(silo1[0]), Y(silo1[1]), 42 * s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * compoundFill); ctx.stroke();
    }
    ln(170, 130, 170, 180, '#5a5e64', 4);                                    // loading spout
    R(90, 184, 160, 20, 'rgba(240,210,70,0.25)');                             // bay markings
    // tanker truck: backs under the spout, loads, pulls away down the west road
    {
      const u = on ? (t * 0.025) % 1 : 0.5;
      let tx = 170, ty = 194, horiz = true;
      if (u < 0.2) { tx = -60 + u / 0.2 * 230; }
      else if (u < 0.7) { tx = 170; }
      else { tx = 170 + (u - 0.7) / 0.3 * 700; }
      RR(tx - 34, ty - 11, 60, 22, 4, 'rgba(0,0,0,0.3)');
      RR(tx - 40, ty - 13, 54, 20, 8, '#e8e4f0');                             // tank trailer
      ln(tx - 36, ty - 3, tx + 10, ty - 3, 'rgba(0,0,0,0.12)', 1.2);
      RR(tx + 16, ty - 12, 18, 18, 3, '#7a50c8');                             // cab
      R(tx + 28, ty - 10, 5, 14, on && night ? '#fff4c0' : '#2a3440');
      if (u >= 0.2 && u < 0.7 && active) for (let q = 0; q < 3; q++) { const ph = (t * 1.3 + q / 3) % 1; dot(170, 180 + ph * 10, 1.4, `rgba(230,220,255,${(1 - ph).toFixed(2)})`); }
    }

    // ── Crystallizer vats + gantry crane (top) ──
    const vats = [330, 420, 510, 600], vY = 130, vR = 38;
    R(300, 72, 330, 3, '#5a5e64'); R(300, 186, 330, 3, '#5a5e64');                // crane rails
    vats.forEach((vx, i) => {
      tank(vx, vY, vR, '#c4bcd0', '#6a6278', '#2a2432');
      const ir = vR - 6;
      const cg = ctx.createRadialGradient(X(vx), Y(vY), 1, X(vx), Y(vY), ir * s);
      cg.addColorStop(0, active ? '#f4eeff' : '#5a506a'); cg.addColorStop(1, active ? '#9a70e0' : '#2a2238');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(X(vx), Y(vY), ir * s, 0, Math.PI * 2); ctx.fill();
      if (detail) for (let q = 0; q < 10; q++) {
        const a = q * 0.9 + i, rr = ir * (0.2 + ((q * 37) % 7) / 10), cs = 2.5 + (q % 3);
        const cx = vx + Math.cos(a) * rr, cy = vY + Math.sin(a) * rr;
        ctx.fillStyle = active ? `rgba(255,255,255,${0.55 + 0.4 * Math.sin(t * 3 + q + i)})` : 'rgba(180,170,200,0.5)';
        ctx.beginPath();
        for (let v = 0; v < 6; v++) { const qa = v * Math.PI / 3; const xx = X(cx + Math.cos(qa) * cs), yy = Y(cy + Math.sin(qa) * cs); v ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
        ctx.closePath(); ctx.fill();
      }
      if (i < 3) { ln(vx + vR, vY, vats[i + 1] - vR, vY, '#20242a', 5); ln(vx + vR, vY, vats[i + 1] - vR, vY, accent, 3); }
      ln(vx, vY + vR, vx, rackY - 6, '#3a3e44', 3);                             // drop to the rack
    });
    {
      const cxr = 320 + (on ? (Math.sin(t * 0.25) * 0.5 + 0.5) : 0.3) * 290;    // travelling bridge
      RR(cxr - 10, 66, 20, 128, 2, 'rgba(0,0,0,0.25)');
      R(cxr - 8, 66, 16, 126, '#e0b030');
      for (let y = 70; y < 190; y += 12) ln(cxr - 8, y, cxr + 8, y + 6, 'rgba(0,0,0,0.25)', 1);
      RR(cxr - 12, 118, 24, 18, 3, '#3a3e44');                                  // trolley
      if (on) dot(cxr, 127, 2, Math.sin(t * 4) > 0 ? '#ffb030' : '#6a4a18');
    }

    // ── Cooling-fan cells (top-right) ──
    for (const fx of [690, 750]) {
      shadow(fx - 26, 34, 52, 52);
      RR(fx - 26, 30, 52, 52, 4, '#6a6e74');
      ring(fx, 56, 20, '#2a2e34', 4);
      ctx.save(); ctx.translate(X(fx), Y(56)); ctx.rotate(on ? t * 6 + fx : 0.4);
      ctx.fillStyle = '#9aa0a6';
      for (let b = 0; b < 5; b++) { ctx.rotate(Math.PI * 2 / 5); ctx.beginPath(); ctx.ellipse(9 * s, 0, 9 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      dot(fx, 56, 4, '#2a2e34');
      if (active) for (let q = 0; q < 3; q++) { const ph = (t * 0.4 + q / 3 + fx) % 1; dot(fx + Math.sin(t + q) * 4, 56 - ph * 40, 6 + ph * 10, `rgba(240,244,250,${((1 - ph) * 0.3).toFixed(3)})`); }
    }

    // ── Process hall (sawtooth roof) ──
    shadow(300, 250, 330, 160);
    R(300, 250, 330, 160, '#8a8e96');
    for (let k = 0; k < 8; k++) {
      const x0 = 300 + k * 41.25;
      R(x0, 250, 30, 160, '#9aa0a8');
      R(x0 + 30, 250, 11.25, 160, on ? (night ? 'rgba(255,220,150,0.85)' : '#bcd4e4') : '#2a2e34');   // north-light glazing
      R(x0 + 30, 250, 1, 160, 'rgba(0,0,0,0.3)');
    }
    R(300, 250, 330, 4, '#5a5e64'); R(300, 406, 330, 4, '#5a5e64');
    if (on && night) glow(465, 330, 170, '255,210,140', 0.18);
    RR(360, 282, 210, 24, 3, 'rgba(20,16,28,0.85)');
    ctx.save(); ctx.font = `bold ${14 * s}px "Arial Black", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = on ? accent : '#4a3c6a'; if (on && night) { ctx.shadowColor = accent; ctx.shadowBlur = 8 * s; }
    ctx.fillText('LITHIUM REFINERY', X(465), Y(294.5)); ctx.restore();
    for (const dx of [330, 520]) { R(dx, 404, 50, 8, '#3a3e44'); if (detail) for (let y = 404; y < 412; y += 2) R(dx, y, 50, 0.6, 'rgba(255,255,255,0.15)'); }   // roll-up doors

    // ── Evaporator towers (east) ──
    for (const [ex, ey] of [[700, 290], [700, 390]]) {
      tank(ex, ey, 40, '#d8d0e4', '#8a80a0', '#343040');
      ring(ex, ey, 28, 'rgba(0,0,0,0.25)', 2); ring(ex, ey, 16, 'rgba(0,0,0,0.25)', 2);
      dot(ex, ey, 7, '#4a4458');
      if (on && detail) for (let q = 0; q < 12; q++) { const a = q / 12 * Math.PI * 2; ln(ex + Math.cos(a) * 36, ey + Math.sin(a) * 36, ex + Math.cos(a) * 40, ey + Math.sin(a) * 40, '#e0b030', 1.4); }   // catwalk rail
      if (active) for (let q = 0; q < 5; q++) {
        const ph = (t * 0.25 + q / 5 + ey * 0.01) % 1;
        dot(ex - 6 + Math.sin(t * 0.7 + q) * 6 + ph * 18, ey - ph * 70, 10 + ph * 22, `rgba(244,240,252,${((1 - ph) * 0.42).toFixed(3)})`);
      }
    }

    // ── Rotary kiln (long, west→east) + burner + stack + cyclone ──
    const kx0 = 130, kx1 = 540, ky = 470, kr = 26;
    for (const fr of [0.15, 0.4, 0.65, 0.9]) R(kx0 + (kx1 - kx0) * fr - 12, ky - kr - 4, 24, kr * 2 + 14, '#3a3640');   // piers
    RR(kx0 + 6, ky - kr + 10, kx1 - kx0, kr * 2, 10, 'rgba(0,0,0,0.3)');
    {
      const kg = ctx.createLinearGradient(0, Y(ky - kr), 0, Y(ky + kr));
      kg.addColorStop(0, '#5a4c5a'); kg.addColorStop(0.3, '#b09ab0'); kg.addColorStop(1, '#2e2430');
      ctx.fillStyle = kg; ctx.beginPath(); ctx.roundRect(X(kx0), Y(ky - kr), (kx1 - kx0) * s, kr * 2 * s, 8 * s); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.roundRect(X(kx0), Y(ky - kr), (kx1 - kx0) * s, kr * 2 * s, 8 * s); ctx.clip();
      const off = active ? (t * 30) % 22 : 0;
      for (let x = kx0 - 22 + off; x < kx1 + 22; x += 22) ln(x, ky - kr, x + 10, ky + kr, 'rgba(0,0,0,0.25)', 3);
      if (active) {
        const hg = ctx.createLinearGradient(X(kx0), 0, X(kx0 + (kx1 - kx0) * 0.6), 0);
        hg.addColorStop(0, `rgba(255,120,40,${0.55 + 0.12 * Math.sin(t * 5)})`); hg.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = hg; ctx.fillRect(X(kx0), Y(ky - kr), (kx1 - kx0) * s, kr * 2 * s);
      }
      ctx.restore();
      for (const fr of [0.15, 0.4, 0.65, 0.9]) R(kx0 + (kx1 - kx0) * fr - 6, ky - kr - 3, 12, kr * 2 + 6, '#231e26');   // riding rings
      // girth gear + drive motor
      R(kx0 + (kx1 - kx0) * 0.52 - 4, ky - kr - 6, 8, kr * 2 + 12, '#4a4450');
      RR(kx0 + (kx1 - kx0) * 0.52 - 14, ky + kr + 6, 28, 16, 3, '#3a5a6a');
    }
    // burner hood (feed end)
    RR(kx0 - 36, ky - kr - 8, 40, kr * 2 + 16, 4, '#4a4450');
    dot(kx0 - 16, ky, 11, active ? `rgba(255,170,60,${0.8 + 0.2 * Math.sin(t * 9)})` : '#2a2026');
    if (active) glow(kx0 - 16, ky, 44, '255,140,50', 0.35);
    if (detail) for (let k = 0; k < 5; k++) R(kx0 - 36 + k * 8, ky + kr + 10, 4, 5, k % 2 ? '#101010' : '#f0c020');   // hazard stripe
    // discharge hood + exhaust stack + cyclone
    RR(kx1 - 8, ky - kr - 10, 30, kr * 2 + 20, 4, '#4a4450');
    tank(590, 470, 30, '#c8c0d4', '#6a6278', '#2a2432');                        // cyclone
    for (let q = 0; q < 3; q++) { const a0 = (active ? t * 4 : 0) + q * 2.1; ctx.strokeStyle = 'rgba(30,24,40,0.5)'; ctx.lineWidth = 1.5 * s; ctx.beginPath(); ctx.arc(X(590), Y(470), (10 + q * 7) * s, a0, a0 + 2.4); ctx.stroke(); }
    dot(590, 470, 6, '#2a2432');
    ln(kx1 + 22, ky, 560, 470, '#3a3e44', 6);
    tank(620, 540, 16, '#a8a4ac', '#6a6670', '#2a2830');                        // exhaust stack (seen from above)
    dot(620, 540, 9, '#1a181c');
    if (active) for (let q = 0; q < 5; q++) { const ph = (t * 0.22 + q / 5) % 1; dot(620 + ph * 30 + Math.sin(t + q) * 4, 540 - ph * 60, 8 + ph * 18, `rgba(170,165,160,${((1 - ph) * 0.38).toFixed(3)})`); }

    // ── Leach tanks (south-east) with agitators ──
    for (const [lx, ly, i] of [[520, 578, 0], [608, 596, 1]]) {
      tank(lx, ly, 38, '#b0a8bc', '#625a70', '#2a2432');
      const lr2 = 30;
      const lg = ctx.createRadialGradient(X(lx), Y(ly), 1, X(lx), Y(ly), lr2 * s);
      lg.addColorStop(0, active ? '#e8d8ff' : '#4a4058'); lg.addColorStop(1, active ? '#7a50c8' : '#241c34');
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(X(lx), Y(ly), lr2 * s, 0, Math.PI * 2); ctx.fill();
      if (active) for (let q = 0; q < 3; q++) { const a = t * 2 + q * 2.1 + i; ctx.strokeStyle = 'rgba(240,230,255,0.6)'; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.arc(X(lx), Y(ly), lr2 * (0.35 + q * 0.2) * s, a, a + 1.8); ctx.stroke(); }
      ctx.save(); ctx.translate(X(lx), Y(ly)); ctx.rotate(active ? t * 2.5 + i : 0.5);
      ctx.fillStyle = '#c8c4d0'; ctx.fillRect(-lr2 * s, -2.5 * s, lr2 * 2 * s, 5 * s); ctx.restore();
      dot(lx, ly, 6, '#3a3440');
    }

    // ── Covered ore stockpile + hopper + loader (south-west) ──
    shadow(90, 520, 130, 90);
    R(90, 520, 130, 90, on ? '#6a6470' : '#3a3640');                           // canopy frame
    for (let k = 0; k < 5; k++) R(92 + k * 26, 522, 24, 86, on ? '#8a8494' : '#46424c');
    if (detail) for (let k = 0; k < 6; k++) dot(110 + k * 18, 600 - (k % 2) * 4, 7 + (k % 3) * 2, on ? '#a8b0b8' : '#4a4e52');   // ore spilling out
    // hopper (drawn on top at the feed point)
    ctx.fillStyle = '#5a5460'; ctx.beginPath();
    ctx.moveTo(X(hop[0] - 22), Y(hop[1] - 18)); ctx.lineTo(X(hop[0] + 22), Y(hop[1] - 18)); ctx.lineTo(X(hop[0] + 8), Y(hop[1] + 14)); ctx.lineTo(X(hop[0] - 8), Y(hop[1] + 14)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = e._oreConveyor ? '#d0e8f0' : '#5a6a70';
    ctx.beginPath(); ctx.ellipse(X(hop[0]), Y(hop[1] - 16), 20 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();
    _wfConveyor(X(hop[0]), Y(hop[1] - 20), X(kx0 - 30), Y(ky + kr + 4), S, t, active, '#7a6a90');   // hopper → kiln feed
    // front loader shuttling between pile and hopper
    {
      const u = on ? (Math.sin(t * 0.35) * 0.5 + 0.5) : 0.5, lx = 240 + u * 50, ly = 590;
      RR(lx - 14, ly - 9, 28, 18, 3, 'rgba(0,0,0,0.3)');
      RR(lx - 16, ly - 11, 26, 18, 3, '#e0b020');
      R(lx - 6, ly - 8, 9, 10, '#2a3440');
      R(lx - 24, ly - 12, 8, 20, '#8a8a82');                                    // bucket
      for (const wy of [ly - 12, ly + 6]) for (const wx of [lx - 12, lx + 4]) R(wx, wy, 7, 3, '#1a1a1a');
      if (on && Math.sin(t * 6) > 0) dot(lx + 2, ly - 12, 1.5, '#ffb030');
    }

    // ── Water intake: pump + clarifier (west) ──
    tank(120, 330, 46, '#9ab8c8', '#5a7888', '#243440');                         // clarifier
    dot(120, 330, 38, on && e._waterConnected ? '#3a8ab0' : '#1c3440');
    ctx.save(); ctx.translate(X(120), Y(330)); ctx.rotate(on && e._waterConnected ? t * 0.4 : 0.6);
    ctx.fillStyle = '#c8ccd0'; ctx.fillRect(0, -2.5 * s, 38 * s, 5 * s); ctx.restore();   // rotating scraper bridge
    dot(120, 330, 7, '#4a5a62');
    tank(pump[0] - 2, pump[1] + 50, 14, '#6a8a9a', '#3a5a6a', '#122028');          // intake pump
    ctx.save(); ctx.translate(X(pump[0] - 2), Y(pump[1] + 50)); ctx.rotate(on && e._waterConnected ? t * 7 : 0.3);
    ctx.strokeStyle = '#c0e0ec'; ctx.lineWidth = 2 * s;
    for (let q = 0; q < 3; q++) { ctx.rotate(Math.PI * 2 / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(5 * s, -3 * s, 9 * s, 0); ctx.stroke(); }
    ctx.restore();
    _wfPipe([[X(166), Y(330)], [X(260), Y(330)], [X(260), Y(rackY + 5)]], S, t, on && !!e._waterConnected, 'rgba(90,200,240,0.95)');

    // ── Control room / QC lab (south-centre) ──
    shadow(230, 520, 150, 80);
    RR(230, 520, 150, 80, 4, '#5a5668');
    R(230, 520, 150, 10, '#3e3a4a');
    for (let q = 0; q < 6; q++) R(240 + q * 23, 536, 16, 14, on ? (night ? '#ffe0a0' : (q % 2 ? '#c8d8f0' : '#b8d0e8')) : '#262230');
    RR(242, 558, 126, 26, 2, '#0a0810');
    ctx.save(); ctx.font = `bold ${10 * s}px Courier New`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = on ? accent : '#4a3c6a'; ctx.fillText(`Li₂CO₃ ${Math.round(compoundFill * 100)}%`, X(305), Y(571)); ctx.restore();
    // roof dish + antenna
    dot(365, 528, 7, '#d8d8e0'); ln(365, 528, 371, 522, '#6a6a70', 1);
    if (on) dot(238, 524, 2, Math.sin(t * 2.5) > 0 ? '#ff4030' : '#6a1810');
    // parked cars
    for (let k = 0; k < 3; k++) { RR(240 + k * 30, 616, 22, 12, 3, ['#c83838', '#3a70c8', '#e8e4d8'][k]); R(247 + k * 30, 618, 8, 8, '#2a3440'); }

    // ── Workers walking the walkway ──
    if (on && detail) for (let p = 0; p < 5; p++) {
      const u = (t * (0.012 + p * 0.003) + p * 0.21) % 1, xx = 100 + (p % 2 ? u : 1 - u) * 560;
      worker(xx, 617, p);
    }
    if (on && detail) { worker(700 + Math.sin(t * 0.5) * 8, 344, 1); worker(470 + Math.sin(t * 0.3) * 60, 60, 2); }

    // ── Floodlight masts (night) ──
    for (const [mx, my] of [[30, 30], [770, 30], [30, 700], [770, 700], [400, 420]]) {
      R(mx - 3, my - 3, 6, 6, '#3a3e44');
      if (on && night) { dot(mx, my, 3, '#fff6d8'); glow(mx, my, 110, '255,240,200', 0.14); }
    }

    // ── Ports (drawn last so tags sit on top) ──
    if (aOre) _portBelt(aOre, S, t, { belt: '#b89cff', label: 'ORE IN', on: !!e._oreConveyor, out: false });
    if (aCpd) _portBelt(aCpd, S, t, { belt: '#c0a0ff', label: 'CPD OUT', on: !!e._compoundConveyorOut, out: true });
    if (aWat) _portPipe(aWat, S, t, { fluid: '#40c0e0', label: 'H₂O IN', on: !!e._waterConnected, out: false, flow: active });

    _wfLamp(px + w - 7 * S, py + 7 * S, S, t, accent, on);
    ctx.restore();
  }

// ── Fusion-chain helpers ──
// A top-down storage sphere with a rim that fills (fill 0..1).
function _fcSphere(x, y, r, S, t, fill, accent, on, label) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(x + 5*S, y + 6*S, r, 0, Math.PI*2); ctx.fill();
  const g = ctx.createRadialGradient(x - r*0.4, y - r*0.4, r*0.1, x, y, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#c4ccd0'); g.addColorStop(1, '#5a6468');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = 'rgba(60,70,76,0.3)'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.ellipse(x, y, r, r*0.3, 0, 0, Math.PI*2); ctx.stroke();
  ctx.strokeStyle = '#141a1c'; ctx.lineWidth = 3*S;
  ctx.beginPath(); ctx.arc(x, y, r + 2.5*S, 0, Math.PI*2); ctx.stroke();
  if (fill > 0) {
    const warn = on && fill > 0.85 && Math.sin(t*6) > 0;
    ctx.strokeStyle = warn ? '#ff5030' : accent; ctx.globalAlpha = on ? 0.95 : 0.5; ctx.lineWidth = 2.2*S;
    ctx.beginPath(); ctx.arc(x, y, r + 2.5*S, -Math.PI/2, -Math.PI/2 + Math.PI*2*Math.min(1, fill)); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (label) {
    ctx.fillStyle = on ? '#2a3a40' : '#5a6468';
    ctx.font = `bold ${Math.max(5, 6*S)}px Courier New`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 0.5*S); ctx.textBaseline = 'alphabetic';
  }
}

// A vertical steel column seen in 3/4 (x centre, top/bottom y, radius).
function _fcColumn(x, y0, y1, r, S, c0, c1, c2) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.roundRect(x - r + 5*S, y0 + 6*S, r*2, y1 - y0, r*0.6); ctx.fill();
  const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
  g.addColorStop(0, c0); g.addColorStop(0.35, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.strokeStyle = 'rgba(10,14,16,0.9)'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.roundRect(x - r, y0, r*2, y1 - y0, r*0.6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = c1; ctx.beginPath(); ctx.ellipse(x, y0 + 2*S, r, r*0.45, 0, 0, Math.PI*2); ctx.fill();
}

// A small spinning fan in a round housing.
function _fcFan(x, y, r, S, t, on, speed) {
  ctx.fillStyle = '#10181c'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#6a8088'; ctx.lineWidth = S; ctx.stroke();
  ctx.save(); ctx.translate(x, y); ctx.rotate(on ? t*(speed || 8) : 0.5);
  ctx.fillStyle = '#8aa0a8';
  for (let b = 0; b < 4; b++) { ctx.rotate(Math.PI/2); ctx.beginPath(); ctx.ellipse(r*0.45, 0, r*0.42, Math.max(1.2*S, r*0.14), 0.35, 0, Math.PI*2); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = '#2a3438'; ctx.beginPath(); ctx.arc(x, y, Math.max(1.5*S, r*0.18), 0, Math.PI*2); ctx.fill();
}

function renderAtmosphereCollector(e, px, py, t) {
  // Air separation unit: twin spinning intake fans pulling in air streaks, a
  // pre-cooler, a frosty cryogenic cold box venting vapour, four molecular-
  // sieve vessels cycling in pairs and a nitrogen bullet tank that fills with
  // the buffer, all feeding the N₂ OUT port. One upright layout whichever
  // way it is turned (_plantFrameUpright); the outlet line runs round the
  // inside of the wall to wherever the stub is (_portRing). No backdrop.
  const f = _plantFrameUpright(e, px, py, T.ATMOSCOLLECTOR);
  const w = f.bw, h = f.bh;
  const on = e.powered;
  const def = EntityDefs[T.ATMOSCOLLECTOR];
  const n2Fill = Math.min(1, (e._nitrogen || 0) / (def.nitrogenCapacity || 3000));
  const S = TILE / 40;
  const accent = '#a0e0ff';
  const st = (typeof AtmosphereCollectorSystem !== 'undefined') ? AtmosphereCollectorSystem.getStubs(e) : null;
  // Outlet row in the local frame (the rot-0 stub, right face) — same
  // offset as AtmosphereCollectorSystem.getStubs.
  const oY =(Math.round(w / TILE) <= 4 ? 1 : Math.floor(Math.round(w / TILE) / 2)) * TILE + TILE/2;
  ctx.save();
  ctx.save(); f.apply();

  const fans = [[w*0.21, h*0.26], [w*0.21, h*0.62]], fR = Math.min(w, h)*0.145;
  const pcX = w*0.38, pcY = h*0.14, pcW = w*0.10, pcH = h*0.62;
  const cbX = w*0.55, cbY = h*0.10, cbW = w*0.20, cbH = h*0.46;
  const sv = [[w*0.40, h*0.86], [w*0.50, h*0.86], [w*0.60, h*0.86], [w*0.70, h*0.86]];
  const tkX = w*0.80, tkY = h*0.12, tkW = w*0.12, tkH = h*0.66;

  // ── Pipework ──
  fans.forEach(([fx, fy]) => _wfPipe([[fx + fR, fy], [pcX, fy]], S, t, on, 'rgba(220,240,255,0.9)'));
  _wfPipe([[pcX + pcW, pcY + pcH*0.5], [cbX, pcY + pcH*0.5]], S, t, on, 'rgba(200,235,255,0.9)');
  _wfPipe([[pcX + pcW*0.5, pcY + pcH], [pcX + pcW*0.5, sv[0][1] - 18*S], [sv[3][0], sv[0][1] - 18*S]], S, t, on, 'rgba(220,240,255,0.9)');
  sv.forEach(([sx, sy]) => _wfPipe([[sx, sy - 18*S], [sx, sy - 10*S]], S, t, on, 'rgba(220,240,255,0.9)'));
  _wfPipe([[cbX + cbW*0.5, cbY + cbH], [cbX + cbW*0.5, h*0.66], [tkX, h*0.66]], S, t, on, accent);
  _wfPipe([[tkX + tkW, oY], ..._portRing(e, f, px, py, st && st.nitrogenStub, 8*S, 'right', oY).reverse()], S, t, !!e._nitrogenPipeOut, accent);

  // ── Concrete pad under the fans ──
  ctx.fillStyle = 'rgba(90,100,106,0.35)'; ctx.beginPath(); ctx.roundRect(w*0.05, h*0.08, w*0.30, h*0.72, 4*S); ctx.fill();
  ctx.strokeStyle = 'rgba(40,48,52,0.5)'; ctx.lineWidth = S; ctx.stroke();

  // ── Intake fans ──
  fans.forEach(([fX, fY], i) => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(fX + 5*S, fY + 6*S, fR + 4*S, 0, Math.PI*2); ctx.fill();
    const hg = ctx.createRadialGradient(fX - fR*0.4, fY - fR*0.4, 1, fX, fY, fR + 4*S);
    hg.addColorStop(0, '#b8c4ca'); hg.addColorStop(1, '#4a5860');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(fX, fY, fR + 4*S, 0, Math.PI*2); ctx.fill();
    _fcFan(fX, fY, fR, S, t + i*0.37, on, 5);
    ctx.strokeStyle = 'rgba(200,220,230,0.35)'; ctx.lineWidth = 0.8*S;
    for (let q = -2; q <= 2; q++) { ctx.beginPath(); ctx.moveTo(fX - fR, fY + q*fR*0.35); ctx.lineTo(fX + fR, fY + q*fR*0.35); ctx.stroke(); }
    if (on) {
      for (let q = 0; q < 10; q++) {
        const a = q*Math.PI/5 + 0.3 + i, p = (t*0.9 + q/10) % 1;
        const r0 = fR*(2.0 - p), r1 = r0 - 6*S;
        ctx.strokeStyle = `rgba(220,245,255,${0.55*p})`; ctx.lineWidth = S;
        ctx.beginPath(); ctx.moveTo(fX + Math.cos(a)*r0, fY + Math.sin(a)*r0); ctx.lineTo(fX + Math.cos(a)*r1, fY + Math.sin(a)*r1); ctx.stroke();
      }
    }
  });

  // ── Pre-cooler ──
  _wfShadow(pcX, pcY, pcW, pcH, S, 3*S);
  const pg = ctx.createLinearGradient(pcX, 0, pcX + pcW, 0);
  pg.addColorStop(0, '#8a9aa2'); pg.addColorStop(0.5, '#d4dee4'); pg.addColorStop(1, '#5a6a72');
  ctx.fillStyle = pg; ctx.strokeStyle = '#2a363c'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.roundRect(pcX, pcY, pcW, pcH, pcW*0.4); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(40,56,64,0.35)';
  for (let q = 1; q < 10; q++) { const ly = pcY + pcH*q/10; ctx.beginPath(); ctx.moveTo(pcX + 2*S, ly); ctx.lineTo(pcX + pcW - 2*S, ly); ctx.stroke(); }

  // ── Cryogenic cold box ──
  _wfShadow(cbX, cbY, cbW, cbH, S, 3*S);
  const cg = ctx.createLinearGradient(cbX, 0, cbX + cbW, 0);
  cg.addColorStop(0, '#dce8ee'); cg.addColorStop(0.5, '#ffffff'); cg.addColorStop(1, '#9ab0bc');
  ctx.fillStyle = cg; ctx.strokeStyle = '#4a6070'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.roundRect(cbX, cbY, cbW, cbH, 3*S); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(80,110,130,0.25)'; ctx.lineWidth = S;
  for (let q = 1; q < 7; q++) { const ly = cbY + cbH*q/7; ctx.beginPath(); ctx.moveTo(cbX + 2*S, ly); ctx.lineTo(cbX + cbW - 2*S, ly); ctx.stroke(); }
  ctx.fillStyle = 'rgba(160,220,255,0.7)';
  for (let q = 0; q < 22; q++) ctx.fillRect(cbX + cbW*((q*0.618) % 1), cbY + cbH*((q*0.382) % 1), 1.3*S, 1.3*S);
  if (on) {
    ctx.fillStyle = `rgba(120,200,255,${0.25 + 0.15*Math.sin(t*2)})`;
    ctx.fillRect(cbX + cbW*0.3, cbY + cbH*0.3, cbW*0.4, cbH*0.4);
  }

  // ── Molecular sieves (swing in pairs) ──
  sv.forEach(([sx, sy], i) => {
    const r = Math.min(w*0.04, 7*S);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.roundRect(sx - r + 3*S, sy - 12*S + 4*S, r*2, 24*S, r); ctx.fill();
    const vg = ctx.createLinearGradient(sx - r, 0, sx + r, 0);
    vg.addColorStop(0, '#6a7a80'); vg.addColorStop(0.4, '#c8d4d8'); vg.addColorStop(1, '#3a464a');
    ctx.fillStyle = vg; ctx.beginPath(); ctx.roundRect(sx - r, sy - 12*S, r*2, 24*S, r); ctx.fill();
    const lit = on && ((Math.floor(t*0.5) + (i >> 1)) % 2 === 0);
    ctx.fillStyle = lit ? '#60ff90' : '#2a3a30'; ctx.beginPath(); ctx.arc(sx, sy - 5*S, 1.8*S, 0, Math.PI*2); ctx.fill();
  });

  // ── Nitrogen bullet tank (vertical) ──
  _wfShadow(tkX, tkY, tkW, tkH, S, tkW/2);
  const tg = ctx.createLinearGradient(tkX, 0, tkX + tkW, 0);
  tg.addColorStop(0, '#e8eef0'); tg.addColorStop(0.4, '#ffffff'); tg.addColorStop(1, '#8a98a0');
  ctx.fillStyle = tg; ctx.strokeStyle = '#4a5860'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.roundRect(tkX, tkY, tkW, tkH, tkW/2); ctx.fill(); ctx.stroke();
  const by0 = tkY + tkW*0.5, bh = tkH - tkW;
  ctx.fillStyle = '#1a2226'; ctx.fillRect(tkX + tkW*0.62, by0, 3*S, bh);
  if (n2Fill > 0) { ctx.fillStyle = on ? accent : '#4a6a78'; ctx.fillRect(tkX + tkW*0.62, by0 + bh*(1 - n2Fill), 3*S, bh*n2Fill); }
  ctx.restore();

  const [smx, smy] = f.toWorld(cbX + cbW*0.5, cbY - 1*S);
  _wfSmoke(smx, smy, S*0.7, t, '240,250,255', on, 0.55);
  _frameText(f, cbX + cbW/2, cbY + cbH*0.88, '-196°C', `bold ${Math.max(4, 5*S)}px Courier New`, '#4a6070');
  _frameText(f, tkX + tkW*0.35, tkY + tkH*0.5, 'N₂', `bold ${Math.max(5, 6*S)}px Courier New`, on ? '#2a5a78' : '#5a6870');

  if (st) _portPipe(_portAnchor(e, px, py, f.W, f.H, st.nitrogenStub), S, t, { fluid: '#40e0a0', label: 'N₂ OUT', on: !!e._nitrogenPipeOut, out: true, flow: !!e._nitrogenPipeOut });

  const [plx, ply] = f.toWorld(w*0.5, h*0.955);
  _wfPlate('ATMOS COLLECTOR', plx, ply, S, accent, on);
  _wfLamp(px + f.W - 7*S, py + 7*S, S, t, accent, on);
  ctx.restore();
}

function renderHaberBosch(e, px, py, t) {
  // High-pressure ammonia synthesis loop, laid out as a working plant:
  //   • two reciprocating make-up compressors (motor, flywheel, crosshead
  //     and cylinder) on the N₂ and H₂ inlets, with a control building and
  //     a transformer yard between them
  //   • the syngas mixer and a recycle circulator feeding the converter: a
  //     forged column with a studded head, access platforms, a caged ladder
  //     and four catalyst beds that glow while it runs
  //   • a four-fan air cooler and two shell-and-tube exchangers taking the
  //     heat out, a separator drum with a level glass, and a purge flare
  //   • two ammonia spheres in a bunded tank farm that fill in turn
  // One upright layout whichever way it is turned (_plantFrameUpright); the
  // inlet and outlet lines run round the inside of the wall (_portRing) to
  // wherever HaberBoschSystem.getStubs() put them. No backdrop and no
  // slabs: the equipment stands straight on the ground.
  const f = _plantFrameUpright(e, px, py, T.HABERBOSCH);
  const hbSt = (typeof HaberBoschSystem !== 'undefined') ? HaberBoschSystem.getStubs(e) : null;
  const w = f.bw, h = f.bh;
  const on = e.powered;
  const def = EntityDefs[T.HABERBOSCH];
  const active = on && e._hasNitrogen && e._hasHydrogen;
  const nh3Fill = Math.min(1, (e._ammonia || 0) / (def.ammoniaCapacity || 3000));
  const S = TILE / 40;
  const k = Math.min(w / (6*TILE), h / (5*TILE));   // detail scale, 1 at the old 6×5
  // Detail unit: the complex is far bigger than the 6×5 it was first drawn
  // at, so bolts, rails and pipes are sized off this, not off S, or they
  // shrink to hairlines against vessels that scaled with the footprint.
  const U = S * Math.max(1, Math.min(2.2, k));
  const dark = (typeof DayNight !== 'undefined' && DayNight.darkness) ? DayNight.darkness() : 0;
  const accent = '#40e070';
  // Stub rows along the local left/right faces — same offsets as getStubs.
  const rows = Math.round(h / TILE);
  const [oN, oH, oA] = rows <= 5 ? [1, 3, 2] : [2, rows - 3, Math.floor(rows / 2)];
  const yN = oN*TILE + TILE/2, yH = oH*TILE + TILE/2, yA = oA*TILE + TILE/2;
  const txt = [];
  ctx.save();
  ctx.save(); f.apply();

  const cvX = w*0.47, cvTop = h*0.12, cvBot = h*0.82, cvR = w*0.07, cvH = cvBot - cvTop;
  const sph = [[w*0.865, h*0.24], [w*0.865, h*0.76]], spR = Math.min(w, h)*0.10;
  const hxX = w*0.565, hxY = h*0.60, hxW = w*0.155, hxH = h*0.06, hxGap = h*0.095;
  const chX = w*0.565, chY = h*0.10, chW = w*0.17, chH = h*0.32;
  const mxX = w*0.335, mxY = (yN + yH)/2;
  const rcX = w*0.375, rcY = h*0.885;                 // recycle circulator
  const sepX = w*0.75, sepY = yA, sr = 8*U;
  const flX = w*0.62, flY = h*0.905;                  // purge flare base
  const cpX = w*0.045, cpW = w*0.25, cpH = Math.min(h*0.115, 44*U);
  const hot = 'rgba(255,170,90,0.95)', syn = 'rgba(200,240,210,0.9)';

  // Tank farm: a raised bund, hazard-striped at the corners.
  const bdX = w*0.775, bdY = h*0.085, bdW = w*0.185, bdH = h*0.83;
  ctx.strokeStyle = '#787c6c'; ctx.lineWidth = 3*U; ctx.beginPath(); ctx.roundRect(bdX, bdY, bdW, bdH, 3*U); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = S; ctx.beginPath(); ctx.roundRect(bdX + 2.5*U, bdY + 2.5*U, bdW - 5*U, bdH - 5*U, 2*U); ctx.stroke();
  [[bdX, bdY], [bdX + bdW - 14*U, bdY], [bdX, bdY + bdH - 4*U], [bdX + bdW - 14*U, bdY + bdH - 4*U]]
    .forEach(([x, y]) => _wfHazardStripe(x, y, 14*U, 4*U, U*0.6));

  // ── Loop pipework ──
  const P = U*0.9;
  [yN, yH].forEach((yy, i) => {
    _wfPipe([..._portRing(e, f, px, py, hbSt && (i ? hbSt.hydrogenIn : hbSt.nitrogenIn), i ? 21*S : 8*S, 'left', yy), [cpX, yy]], P, t, !!(i ? e._hasHydrogen : e._hasNitrogen), i ? 'rgba(128,224,255,0.95)' : 'rgba(160,224,255,0.95)');
    _wfPipe([[cpX + cpW, yy], [mxX, yy], [mxX, mxY]], P, t, active, syn);
  });
  _wfPipe([[mxX, mxY], [cvX - cvR, mxY]], P, t, active, syn);
  _wfPipe([[cvX, cvTop + 6*S], [chX + chW*0.5, cvTop + 6*S], [chX + chW*0.5, chY]], P, t, active, hot);
  _wfPipe([[chX + chW, chY + chH*0.5], [sepX, chY + chH*0.5], [sepX, sepY]], P, t, active, accent);
  [0, 1].forEach(i => {
    const y = hxY + i*hxGap + hxH*0.5;
    _wfPipe([[cvX + cvR, y], [hxX, y]], P, t, active, hot);
    _wfPipe([[hxX + hxW, y], [sepX, y], [sepX, sepY]], P, t, active, accent);
  });
  // Unreacted gas back round to the mixer through the circulator; a little
  // of it bled off to the flare so the inerts don't build up.
  _wfPipe([[sepX, sepY], [sepX, h*0.95], [rcX, h*0.95], [rcX, mxY + h*0.05], [mxX, mxY + h*0.05]], P, t, active, syn);
  _wfPipe([[flX, h*0.95], [flX, flY]], P*0.7, t, active, 'rgba(255,200,120,0.9)');
  _wfPipe([[sepX, sepY], [sph[0][0], sepY]], P, t, active, accent);
  _wfPipe([[sph[0][0], sph[0][1] + spR], [sph[1][0], sph[1][1] - spR]], P, t, active, accent);
  _wfPipe([[sph[0][0], sepY], [w - 12*S - 16*U, yA], ..._portRing(e, f, px, py, hbSt && hbSt.ammoniaOut, 8*S, 'right', yA).reverse()], P, t, !!e._ammoniaPipeOut, accent);
  // Flanges where the big lines meet a vessel, and a handwheel on the outlet.
  const flange = (x, y, vert) => {
    ctx.fillStyle = '#8a9086'; ctx.strokeStyle = '#141a14'; ctx.lineWidth = S;
    ctx.beginPath(); vert ? ctx.rect(x - 5.5*P, y - 1.6*P, 11*P, 3.2*P) : ctx.rect(x - 1.6*P, y - 5.5*P, 3.2*P, 11*P); ctx.fill(); ctx.stroke();
  };
  flange(cvX - cvR - 3*P, mxY); flange(cpX + cpW + 4*P, yN); flange(cpX + cpW + 4*P, yH);
  flange(sepX, sepY - sr*2.2 - 3*P, true); flange(sph[0][0] - spR*0.55, sepY); flange(hxX - 3*P, hxY + hxH*0.5); flange(hxX - 3*P, hxY + hxGap + hxH*0.5);
  const vX = w - 12*S - 16*U;
  ctx.fillStyle = '#2a302a'; ctx.fillRect(vX - 4*U, yA - 5*U, 8*U, 10*U);
  ctx.strokeStyle = e._ammoniaPipeOut ? '#e04030' : '#7a3a30'; ctx.lineWidth = 1.6*U;
  ctx.beginPath(); ctx.arc(vX, yA, 5.5*U, 0, Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(vX - 5.5*U, yA); ctx.lineTo(vX + 5.5*U, yA); ctx.moveTo(vX, yA - 5.5*U); ctx.lineTo(vX, yA + 5.5*U); ctx.stroke();

  // ── Make-up compressors ──
  [yN, yH].forEach((yy, i) => {
    const bx = cpX, bw = cpW, bh = cpH, top = yy - bh/2;
    _wfShadow(bx, top, bw, bh, S, 2*U);
    ctx.fillStyle = '#39443c'; ctx.strokeStyle = '#141a16'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.roundRect(bx, top, bw, bh, 2*U); ctx.fill(); ctx.stroke();
    // Motor: a finned barrel with a fan cowl and a terminal box.
    const mx0 = bx + 4*U, mw = bw*0.2, mh = bh*0.56;
    const mgr = ctx.createLinearGradient(0, yy - mh/2, 0, yy + mh/2);
    mgr.addColorStop(0, '#2e5a46'); mgr.addColorStop(0.35, '#5a9a7a'); mgr.addColorStop(1, '#1c3a2c');
    ctx.fillStyle = mgr; ctx.strokeStyle = '#0c1810'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.roundRect(mx0, yy - mh/2, mw, mh, 3*U); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath();
    for (let q = 1; q < 9; q++) { const lx = mx0 + mw*q/9; ctx.moveTo(lx, yy - mh/2 + 2*S); ctx.lineTo(lx, yy + mh/2 - 2*S); }
    ctx.stroke();
    ctx.fillStyle = '#1a2a22'; ctx.fillRect(mx0 - 2.5*U, yy - mh*0.4, 3.5*U, mh*0.8);
    ctx.fillStyle = '#c8ccc0'; ctx.fillRect(mx0 + mw*0.35, yy - mh/2 - 4*U, mw*0.3, 4.5*U);
    // Shaft and flywheel.
    const fr = bh*0.36, fx = bx + bw*0.36;
    ctx.fillStyle = '#9aa29a'; ctx.fillRect(mx0 + mw, yy - 1.6*U, fx - mx0 - mw, 3.2*U);
    ctx.fillStyle = '#141a14'; ctx.beginPath(); ctx.arc(fx, yy, fr, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#b4bcae'; ctx.lineWidth = 2.4*U; ctx.beginPath(); ctx.arc(fx, yy, fr*0.84, 0, Math.PI*2); ctx.stroke();
    ctx.save(); ctx.translate(fx, yy); ctx.rotate(active ? t*7 + i : 0.4);
    ctx.strokeStyle = '#8a9288'; ctx.lineWidth = 1.6*U; ctx.beginPath();
    for (let q = 0; q < 3; q++) { const a = q*Math.PI/3; ctx.moveTo(-Math.cos(a)*fr*0.8, -Math.sin(a)*fr*0.8); ctx.lineTo(Math.cos(a)*fr*0.8, Math.sin(a)*fr*0.8); }
    ctx.stroke();
    ctx.fillStyle = '#d0d4c8'; ctx.beginPath(); ctx.arc(fr*0.5, 0, 2.2*U, 0, Math.PI*2); ctx.fill();   // crank pin
    ctx.restore();
    ctx.fillStyle = '#3a443c'; ctx.beginPath(); ctx.arc(fx, yy, fr*0.2, 0, Math.PI*2); ctx.fill();
    // Crankcase, crosshead guide and the rod that strokes through it.
    const ccX = fx + fr*0.55, ccW = bw*0.13, cylX = bx + bw*0.60, cylW = bw*0.32, ch = bh*0.46;
    ctx.fillStyle = '#56645a'; ctx.strokeStyle = '#141a16'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.roundRect(ccX, yy - bh*0.3, ccW, bh*0.6, 2*U); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#10140f'; ctx.fillRect(ccX + ccW, yy - 3.2*U, cylX - ccX - ccW, 6.4*U);
    const stroke = active ? (Math.sin(t*7 + i)*0.5 + 0.5) : 0.4;
    const rodEnd = ccX + ccW + (cylX - ccX - ccW)*(0.25 + 0.6*stroke);
    ctx.fillStyle = '#e0e4d8'; ctx.fillRect(ccX + ccW*0.5, yy - 1.2*U, rodEnd - ccX - ccW*0.5 + cylW*0.3, 2.4*U);
    ctx.fillStyle = '#e0a020'; ctx.fillRect(rodEnd - 2.5*U, yy - 3*U, 5*U, 6*U);                       // crosshead
    // Cylinder: ribbed barrel, bolted head, valve caps top and bottom.
    const cg = ctx.createLinearGradient(0, yy - ch/2, 0, yy + ch/2);
    cg.addColorStop(0, '#6a746a'); cg.addColorStop(0.3, '#c0c8bc'); cg.addColorStop(1, '#3a443a');
    ctx.fillStyle = cg; ctx.strokeStyle = '#141a14'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.roundRect(cylX, yy - ch/2, cylW, ch, 2*U); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath();
    for (let q = 1; q < 8; q++) { const lx = cylX + cylW*q/8; ctx.moveTo(lx, yy - ch/2 + S); ctx.lineTo(lx, yy + ch/2 - S); }
    ctx.stroke();
    ctx.fillStyle = '#4a544a'; ctx.fillRect(cylX + cylW - 3.5*U, yy - ch/2 - 2*U, 5*U, ch + 4*U);
    ctx.fillStyle = '#d8dcd0';
    for (let q = 0; q < 4; q++) { ctx.beginPath(); ctx.arc(cylX + cylW - U, yy - ch*0.38 + ch*0.76*q/3, 1.1*U, 0, Math.PI*2); ctx.fill(); }
    for (const sgn of [-1, 1]) for (const fq of [0.3, 0.68]) {
      ctx.fillStyle = '#2a322a'; ctx.beginPath(); ctx.arc(cylX + cylW*fq, yy + sgn*(ch/2 + 2*U), 3*U, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#9aa29a'; ctx.beginPath(); ctx.arc(cylX + cylW*fq, yy + sgn*(ch/2 + 2*U), 1.4*U, 0, Math.PI*2); ctx.fill();
    }
    // Pulsation bottle along the top edge, and a running lamp.
    const pbY = top + 2.5*U, pbH = bh*0.13;
    const pg = ctx.createLinearGradient(0, pbY, 0, pbY + pbH);
    pg.addColorStop(0, '#aab4a8'); pg.addColorStop(1, '#4a544a');
    ctx.fillStyle = pg; ctx.strokeStyle = '#141a14';
    ctx.beginPath(); ctx.roundRect(ccX, pbY, bw*0.5, pbH, pbH/2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = active ? '#60ff90' : on ? '#ffb030' : '#26302a';
    ctx.beginPath(); ctx.arc(bx + bw - 5*U, top + bh - 5*U, 2*U, 0, Math.PI*2); ctx.fill();
    txt.push([bx + bw*0.11, top + bh - 5*U, i ? 'H₂' : 'N₂', on ? (i ? '#80e0ff' : '#a0e0ff') : '#5a6a70']);
  });

  // ── Control building ──
  const cbX = cpX, cbY = h*0.245, cbW = w*0.17, cbH = h*0.235;
  if (cbH > 30*S) {
    _wfShadow(cbX, cbY, cbW, cbH, S*1.6, 2*U);
    const rg = ctx.createLinearGradient(cbX, cbY, cbX + cbW, cbY + cbH);
    rg.addColorStop(0, '#6c7a70'); rg.addColorStop(1, '#4a564e');
    ctx.fillStyle = rg; ctx.strokeStyle = '#161e18'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.roundRect(cbX, cbY, cbW, cbH, 2*U); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2*U;                                   // parapet
    ctx.beginPath(); ctx.roundRect(cbX + 2.5*U, cbY + 2.5*U, cbW - 5*U, cbH - 5*U, U); ctx.stroke();
    // Skylight over the control desk: the loop trend glows up through it.
    const sx0 = cbX + 8*U, sw = cbW - 16*U, sh = Math.min(cbH*0.24, 22*U), sy0 = cbY + 8*U;
    ctx.fillStyle = '#050a06'; ctx.strokeStyle = '#1e2a20'; ctx.lineWidth = 1.5*U;
    ctx.beginPath(); ctx.roundRect(sx0, sy0, sw, sh, U); ctx.fill(); ctx.stroke();
    if (on) { ctx.fillStyle = `rgba(64,224,112,${0.06 + 0.10*dark})`; ctx.fillRect(sx0, sy0, sw, sh); }
    ctx.strokeStyle = 'rgba(64,224,112,0.14)'; ctx.lineWidth = S; ctx.beginPath();
    for (let q = 1; q < 6; q++) { ctx.moveTo(sx0 + sw*q/6, sy0 + S); ctx.lineTo(sx0 + sw*q/6, sy0 + sh - S); }
    ctx.stroke();
    ctx.strokeStyle = active ? accent : on ? '#c08a20' : '#2a3a2c'; ctx.lineWidth = 1.4*U; ctx.beginPath();
    for (let q = 0; q <= 24; q++) { const X = sx0 + sw*q/24, Y = sy0 + sh*(0.5 - 0.32*Math.sin(q*0.75 + (active ? t*3 : 0))*(active ? 1 : 0.15)); q ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
    ctx.stroke();
    // Two rooftop air handlers and a row of annunciator lamps.
    [0.3, 0.7].forEach((fq, i) => {
      const ux = cbX + cbW*fq, uy = cbY + cbH*0.58, us = Math.min(cbW*0.15, cbH*0.17);
      _wfShadow(ux - us, uy - us, us*2, us*2, S, U);
      ctx.fillStyle = '#8a968c'; ctx.strokeStyle = '#1a221c'; ctx.lineWidth = S;
      ctx.beginPath(); ctx.roundRect(ux - us, uy - us, us*2, us*2, U); ctx.fill(); ctx.stroke();
      _fcFan(ux, uy, us*0.74, S, t + i*0.3, on, 6);
    });
    for (let q = 0; q < 6; q++) {
      ctx.fillStyle = on ? (q === 5 ? (active ? '#60ff90' : '#ffb030') : `rgba(160,220,170,${0.4 + 0.3*((q*37) % 3)/2})`) : '#26302a';
      ctx.fillRect(cbX + 8*U + q*(cbW - 16*U)/6, cbY + cbH - 9*U, (cbW - 16*U)/6 - 2*U, 4*U);
    }
    ctx.fillStyle = '#2a342c'; ctx.fillRect(cbX + cbW, cbY + cbH*0.42, 4*U, cbH*0.16);                 // door canopy
  }

  // ── Transformer yard ──
  const tyX = cpX, tyY = h*0.535, tyW = w*0.17, tyH = h*0.225;
  if (tyH > 30*S) {
    ctx.strokeStyle = 'rgba(216,168,32,0.55)'; ctx.lineWidth = S; ctx.setLineDash([3*U, 2*U]);          // fence
    ctx.beginPath(); ctx.rect(tyX, tyY, tyW, tyH); ctx.stroke(); ctx.setLineDash([]);
    const tx = tyX + tyW*0.5, ty = tyY + tyH*0.44, tw = tyW*0.34, th = tyH*0.4;
    // Radiator banks either side of the tank.
    for (const sgn of [-1, 1]) {
      const rx = tx + sgn*(tw/2 + 2*U) - (sgn < 0 ? tw*0.34 : 0);
      _wfShadow(rx, ty - th*0.42, tw*0.34, th*0.84, S, U);
      ctx.fillStyle = '#5a665e'; ctx.fillRect(rx, ty - th*0.42, tw*0.34, th*0.84);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = S; ctx.beginPath();
      for (let q = 0; q <= 8; q++) { const ly = ty - th*0.42 + th*0.84*q/8; ctx.moveTo(rx, ly); ctx.lineTo(rx + tw*0.34, ly); }
      ctx.stroke();
    }
    _wfShadow(tx - tw/2, ty - th/2, tw, th, S*1.4, 2*U);
    const tg = ctx.createLinearGradient(tx - tw/2, 0, tx + tw/2, 0);
    tg.addColorStop(0, '#6a786e'); tg.addColorStop(0.4, '#a8b4aa'); tg.addColorStop(1, '#465048');
    ctx.fillStyle = tg; ctx.strokeStyle = '#141a16'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.roundRect(tx - tw/2, ty - th/2, tw, th, 2*U); ctx.fill(); ctx.stroke();
    // Three bushings, and the cables up to the control building.
    for (let q = -1; q <= 1; q++) {
      const bxq = tx + q*tw*0.28, byq = ty - th*0.2;
      ctx.strokeStyle = '#0c100c'; ctx.lineWidth = 1.3*U;
      ctx.beginPath(); ctx.moveTo(bxq, byq); ctx.lineTo(bxq, tyY - 2*U); ctx.stroke();
      ctx.fillStyle = '#7a4a2a'; ctx.beginPath(); ctx.arc(bxq, byq, 3.2*U, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = on ? '#ffe9a0' : '#c8c0a8'; ctx.beginPath(); ctx.arc(bxq, byq, 1.4*U, 0, Math.PI*2); ctx.fill();
    }
    // Switchgear cabinets along the bottom of the yard.
    for (let q = 0; q < 3; q++) {
      const gx = tyX + tyW*(0.14 + q*0.26), gy = tyY + tyH*0.78, gw = tyW*0.2, gh = tyH*0.15;
      _wfShadow(gx, gy, gw, gh, S, U);
      ctx.fillStyle = '#7c8880'; ctx.strokeStyle = '#1a221c'; ctx.lineWidth = S;
      ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, U); ctx.fill(); ctx.stroke();
      ctx.fillStyle = on ? (q === 1 && !active ? '#ffb030' : '#60ff90') : '#26302a';
      ctx.fillRect(gx + gw*0.38, gy + gh*0.3, gw*0.24, gh*0.4);
    }
    _wfHazardStripe(tyX + tyW*0.36, tyY - 2*U, tyW*0.28, 3.5*U, U*0.6);
  }

  // ── Syngas mixer and recycle circulator ──
  const mr = 9*U;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(mxX + 4*S, mxY + 5*S, mr, 0, Math.PI*2); ctx.fill();
  const mg = ctx.createRadialGradient(mxX - mr*0.35, mxY - mr*0.35, 1, mxX, mxY, mr);
  mg.addColorStop(0, '#e0ecdc'); mg.addColorStop(1, '#465648');
  ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mxX, mxY, mr, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#141a14'; ctx.lineWidth = 1.2*S; ctx.stroke();
  ctx.fillStyle = '#1a221c';
  for (let q = 0; q < 8; q++) { const a = q*Math.PI/4 + 0.4; ctx.beginPath(); ctx.arc(mxX + Math.cos(a)*mr*0.78, mxY + Math.sin(a)*mr*0.78, 0.9*U, 0, Math.PI*2); ctx.fill(); }
  const rr = 10*U;
  _wfShadow(rcX - rr*1.1, rcY - rr*1.1, rr*2.2, rr*2.2, S, rr);
  ctx.fillStyle = '#4e5c50'; ctx.strokeStyle = '#141a14'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.arc(rcX, rcY, rr*1.1, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  _fcFan(rcX, rcY, rr*0.8, S, t*1.4, active, 11);
  ctx.fillStyle = '#2e5a46'; ctx.strokeStyle = '#0c1810';
  ctx.beginPath(); ctx.roundRect(rcX - rr*2.5, rcY - rr*0.55, rr*1.5, rr*1.1, 2*U); ctx.fill(); ctx.stroke();   // its motor

  // ── Air cooler: finned tube bundle under four induced-draught fans ──
  _wfShadow(chX, chY, chW, chH, S*1.6, 2*U);
  ctx.fillStyle = '#56666c'; ctx.strokeStyle = '#141c20'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.roundRect(chX, chY, chW, chH, 2*U); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(190,215,225,0.20)'; ctx.lineWidth = S; ctx.beginPath();
  for (let q = 1; q < 40; q++) { const ly = chY + chH*q/40; ctx.moveTo(chX + 4*U, ly); ctx.lineTo(chX + chW - 4*U, ly); }
  ctx.stroke();
  ctx.fillStyle = '#3a474c';                                                                             // header boxes
  ctx.fillRect(chX - 2*U, chY + 4*U, 5*U, chH - 8*U); ctx.fillRect(chX + chW - 3*U, chY + 4*U, 5*U, chH - 8*U);
  const fanR = Math.min(chW*0.21, chH*0.21);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    const fxq = chX + chW*(0.27 + c*0.46), fyq = chY + chH*(0.27 + r*0.46);
    ctx.fillStyle = '#788890'; ctx.beginPath(); ctx.arc(fxq, fyq, fanR + 2.5*U, 0, Math.PI*2); ctx.fill();
    _fcFan(fxq, fyq, fanR, S, t + (r*2 + c)*0.17, active, 9);
    ctx.strokeStyle = 'rgba(210,225,230,0.28)'; ctx.lineWidth = 0.8*S; ctx.beginPath();                 // guard
    for (let q = -2; q <= 2; q++) { const d = q*fanR*0.36, hw = Math.sqrt(Math.max(0, fanR*fanR - d*d)); ctx.moveTo(fxq - hw, fyq + d); ctx.lineTo(fxq + hw, fyq + d); }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(200,235,255,0.6)';                                                               // frost on the cold end
  for (let q = 0; q < 22; q++) ctx.fillRect(chX + chW*(0.55 + 0.42*((q*0.618) % 1)), chY + chH*((q*0.382) % 1), 1.2*U, 1.2*U);

  // ── Shell-and-tube exchangers ──
  [0, 1].forEach(i => {
    const y = hxY + i*hxGap;
    ctx.fillStyle = '#2a322a';                                                                           // saddles
    ctx.fillRect(hxX + hxW*0.2, y + hxH*0.6, 5*U, hxH*0.6); ctx.fillRect(hxX + hxW*0.74, y + hxH*0.6, 5*U, hxH*0.6);
    _wfShadow(hxX, y, hxW, hxH, S, hxH/2);
    const xg = ctx.createLinearGradient(0, y, 0, y + hxH);
    xg.addColorStop(0, '#9aa49a'); xg.addColorStop(0.35, '#e0e6dc'); xg.addColorStop(1, '#465046');
    ctx.fillStyle = xg; ctx.strokeStyle = '#141a14'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.roundRect(hxX, y, hxW, hxH, hxH/2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = active ? `rgba(255,150,60,${0.35 + 0.25*Math.sin(t*2 + i)})` : 'rgba(40,50,40,0.35)'; ctx.lineWidth = 1.2*U; ctx.beginPath();
    for (let q = 2; q < 11; q++) { const lx = hxX + hxW*q/12; ctx.moveTo(lx, y + 2.5*U); ctx.lineTo(lx, y + hxH - 2.5*U); }
    ctx.stroke();
    ctx.fillStyle = '#56605a';                                                                           // channel-head and shell flanges
    ctx.fillRect(hxX + hxW*0.12, y - 1.5*U, 3*U, hxH + 3*U); ctx.fillRect(hxX + hxW*0.88, y - 1.5*U, 3*U, hxH + 3*U);
    ctx.fillStyle = '#7a847a'; ctx.strokeStyle = '#141a14'; ctx.lineWidth = S;
    [0.3, 0.7].forEach(fq => { ctx.beginPath(); ctx.arc(hxX + hxW*fq, y + 1.5*U, 3*U, 0, Math.PI*2); ctx.fill(); ctx.stroke(); });   // nozzles
  });

  // ── Purge flare ──
  const tipY = flY - h*0.085;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(flX + 5*S, flY + 5*S, 8*U, 4*U, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#3a443c'; ctx.beginPath(); ctx.ellipse(flX, flY, 8*U, 4*U, 0, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#141a14'; ctx.lineWidth = 1.2*U; ctx.beginPath();                                   // guy wires
  ctx.moveTo(flX, tipY + 10*U); ctx.lineTo(flX - 13*U, flY + 2*U); ctx.moveTo(flX, tipY + 10*U); ctx.lineTo(flX + 13*U, flY + 2*U); ctx.stroke();
  const sg = ctx.createLinearGradient(flX - 3*U, 0, flX + 3*U, 0);
  sg.addColorStop(0, '#5a645a'); sg.addColorStop(0.4, '#c0c8bc'); sg.addColorStop(1, '#343c34');
  ctx.fillStyle = sg; ctx.fillRect(flX - 2.6*U, tipY, 5.2*U, flY - tipY);
  ctx.fillStyle = '#20261f'; ctx.fillRect(flX - 4*U, tipY - 3*U, 8*U, 5*U);
  if (on) {
    // A pilot always; the full flame only while the loop is purging.
    const big = active ? 1 : 0.28, fl = 0.8 + 0.2*Math.sin(t*17) + 0.12*Math.sin(t*31 + 1);
    const fh = 26*U*big*fl, lean = Math.sin(t*2.3)*4*U*big;
    const glowR = 34*U*big*(1 + dark);
    const gg = ctx.createRadialGradient(flX, tipY - fh*0.4, 0, flX, tipY - fh*0.4, glowR);
    gg.addColorStop(0, `rgba(255,170,60,${(0.16 + 0.22*dark)*big})`); gg.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(flX, tipY - fh*0.4, glowR, 0, Math.PI*2); ctx.fill();
    for (const [sc, col] of [[1, 'rgba(255,120,30,0.85)'], [0.66, 'rgba(255,200,70,0.9)'], [0.34, 'rgba(255,250,210,0.95)']]) {
      ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(flX - 4.5*U*sc, tipY - 2*U);
      ctx.quadraticCurveTo(flX - 7*U*sc + lean*0.4, tipY - fh*0.55*sc, flX + lean*sc, tipY - 2*U - fh*sc);
      ctx.quadraticCurveTo(flX + 7*U*sc + lean*0.4, tipY - fh*0.55*sc, flX + 4.5*U*sc, tipY - 2*U);
      ctx.closePath(); ctx.fill();
    }
  }

  // ── Ammonia separator: knock-out drum with a level glass ──
  _fcColumn(sepX, sepY - sr*2.2, sepY + sr*1.4, sr, S, '#4a5a4c', '#c8d4c0', '#1e261e');
  const lgX = sepX + sr*0.35, lgY = sepY - sr*1.2, lgH = sr*2.1, lvl = active ? 0.55 + 0.12*Math.sin(t*1.3) : 0.2;
  ctx.fillStyle = '#0a100a'; ctx.fillRect(lgX, lgY, 2.6*U, lgH);
  ctx.fillStyle = on ? accent : '#2a5a3a'; ctx.fillRect(lgX, lgY + lgH*(1 - lvl), 2.6*U, lgH*lvl);
  ctx.strokeStyle = '#c8d0c4'; ctx.lineWidth = 0.8*S; ctx.strokeRect(lgX, lgY, 2.6*U, lgH);
  ctx.fillStyle = '#3a4a3c'; ctx.fillRect(sepX - sr - 1.5*U, sepY + sr*1.0, sr*2 + 3*U, 2.5*U);

  // ── Converter ──
  _fcColumn(cvX, cvTop, cvBot, cvR, S, '#46564a', '#b8c4b0', '#1c241c');
  // Lagging bands down the shell.
  ctx.strokeStyle = 'rgba(20,28,22,0.22)'; ctx.lineWidth = S; ctx.beginPath();
  for (let q = 1; q < 22; q++) { const ly = cvTop + cvH*q/22; ctx.moveTo(cvX - cvR + 2*S, ly); ctx.lineTo(cvX + cvR - 2*S, ly); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(cvX - cvR*0.52, cvTop + cvR*0.5, cvR*0.16, cvH - cvR);   // specular run
  // Caged ladder up the left flank.
  const ldX = cvX - cvR - 6*U;
  ctx.strokeStyle = '#c8b040'; ctx.lineWidth = 1.1*U; ctx.beginPath();
  ctx.moveTo(ldX - 2.5*U, cvTop + cvH*0.1); ctx.lineTo(ldX - 2.5*U, cvBot); ctx.moveTo(ldX + 2.5*U, cvTop + cvH*0.1); ctx.lineTo(ldX + 2.5*U, cvBot); ctx.stroke();
  ctx.lineWidth = 0.8*U; ctx.beginPath();
  for (let ly = cvTop + cvH*0.1 + 3*U; ly < cvBot; ly += 5*U) { ctx.moveTo(ldX - 2.5*U, ly); ctx.lineTo(ldX + 2.5*U, ly); }
  ctx.stroke();
  // Catalyst beds: a framed sight port each, hottest at the top, with the
  // reaction front crawling down through the glow.
  for (let b = 0; b < 4; b++) {
    const by = cvTop + cvH*(0.17 + b*0.19), bh = cvH*0.1, bx = cvX - cvR*0.6, bw = cvR*1.2;
    ctx.fillStyle = '#2c362e'; ctx.beginPath(); ctx.roundRect(bx - 2.5*U, by - 2.5*U, bw + 5*U, bh + 5*U, 2*U); ctx.fill();
    ctx.fillStyle = '#0c100a'; ctx.fillRect(bx, by, bw, bh);
    if (active) {
      const heat = 0.6 + 0.3*Math.sin(t*2.2 - b);
      const g = ctx.createLinearGradient(0, by, 0, by + bh);
      g.addColorStop(0, `rgba(255,${215 - b*35},70,${heat})`); g.addColorStop(1, `rgba(190,36,18,${heat})`);
      ctx.fillStyle = g; ctx.fillRect(bx, by, bw, bh);
      const fy = by + bh*((t*0.45 + b*0.27) % 1);
      ctx.fillStyle = 'rgba(255,245,200,0.5)'; ctx.fillRect(bx, fy, bw, 1.6*U);
      const hr = bw*(0.9 + 0.5*dark);
      const hg = ctx.createRadialGradient(cvX, by + bh/2, bw*0.3, cvX, by + bh/2, hr);
      hg.addColorStop(0, `rgba(255,140,50,${(0.10 + 0.22*dark)*heat})`); hg.addColorStop(1, 'rgba(255,100,30,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(cvX, by + bh/2, hr, 0, Math.PI*2); ctx.fill();
    } else if (on) {
      ctx.fillStyle = 'rgba(120,40,20,0.35)'; ctx.fillRect(bx, by, bw, bh);                             // banked, still warm
    }
    ctx.fillStyle = '#c8ccc0';                                                                           // port bolts
    for (const [cxq, cyq] of [[bx - U, by - U], [bx + bw + U, by - U], [bx - U, by + bh + U], [bx + bw + U, by + bh + U]]) { ctx.beginPath(); ctx.arc(cxq, cyq, 0.9*U, 0, Math.PI*2); ctx.fill(); }
    // Thermowell and its transmitter on the right flank.
    const twY = by + bh*0.5;
    ctx.fillStyle = '#8a948a'; ctx.fillRect(cvX + cvR - U, twY - U, 6*U, 2*U);
    ctx.fillStyle = '#26302a'; ctx.fillRect(cvX + cvR + 5*U, twY - 3*U, 6*U, 6*U);
    ctx.fillStyle = active ? '#ff9040' : on ? '#60ff90' : '#3a4a3c'; ctx.fillRect(cvX + cvR + 6.5*U, twY - 1.5*U, 3*U, 3*U);
  }
  // Access platforms wrapping the front of the shell, between the beds.
  [0.305, 0.495, 0.685].forEach(fq => {
    const pyq = cvTop + cvH*fq, pr = cvR + 9*U;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 6*U;
    ctx.beginPath(); ctx.ellipse(cvX + 3*S, pyq + 4*S, pr, pr*0.2, 0, 0.05, Math.PI - 0.05); ctx.stroke();
    ctx.strokeStyle = '#2a322a'; ctx.lineWidth = 5.5*U;
    ctx.beginPath(); ctx.ellipse(cvX, pyq, pr, pr*0.2, 0, 0.05, Math.PI - 0.05); ctx.stroke();
    ctx.strokeStyle = 'rgba(160,172,160,0.35)'; ctx.lineWidth = 4*U; ctx.setLineDash([1.2*U, 2.2*U]);   // grating
    ctx.beginPath(); ctx.ellipse(cvX, pyq, pr, pr*0.2, 0, 0.05, Math.PI - 0.05); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#d8b838'; ctx.lineWidth = 1.2*U;                                                  // handrail
    ctx.beginPath(); ctx.ellipse(cvX, pyq - 4*U, pr + 2.5*U, (pr + 2.5*U)*0.2, 0, 0.05, Math.PI - 0.05); ctx.stroke();
  });
  // Head: closure flange and its ring of studs; base: skirt and anchor ring.
  ctx.fillStyle = '#34443a'; ctx.fillRect(cvX - cvR - 3*U, cvTop + cvH*0.085, cvR*2 + 6*U, 4.5*U);
  ctx.fillStyle = '#d4d8cc';
  for (let q = 0; q < 14; q++) { const a = q*Math.PI*2/14; ctx.beginPath(); ctx.arc(cvX + Math.cos(a)*cvR*0.8, cvTop + 2*S + Math.sin(a)*cvR*0.36, 1.3*U, 0, Math.PI*2); ctx.fill(); }
  ctx.fillStyle = '#5a6a5c'; ctx.beginPath(); ctx.ellipse(cvX, cvTop + 2*S, cvR*0.3, cvR*0.14, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#2c3a30'; ctx.fillRect(cvX - cvR - 4*U, cvBot - cvH*0.075, cvR*2 + 8*U, 5*U);
  // Pressure gauge at the head.
  const gx = cvX + cvR + 11*U, gy = cvTop + cvH*0.06, gr = 6.5*U;
  ctx.fillStyle = '#8a948a'; ctx.fillRect(cvX + cvR - U, gy - U, 10*U, 2*U);
  ctx.fillStyle = '#f0f0e4'; ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#1a1a14'; ctx.lineWidth = 1.2*U; ctx.stroke();
  ctx.strokeStyle = '#c02010'; ctx.lineWidth = 1.6*U;
  ctx.beginPath(); ctx.arc(gx, gy, gr*0.72, -0.5, 0.5); ctx.stroke();                                    // red arc
  const na = active ? -0.9 + 0.12*Math.sin(t*3) : on ? -2.2 : -2.9;
  ctx.strokeStyle = '#141410'; ctx.lineWidth = 1.1*U;
  ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(na)*gr*0.78, gy + Math.sin(na)*gr*0.78); ctx.stroke();
  txt.push([cvX, cvBot + 9*U, '200 BAR · 450°C', on ? '#e0a020' : '#8a7a40']);

  // ── Ammonia spheres ──
  sph.forEach(([x, y], i) => {
    // Legs first, so the sphere sits over them.
    for (let q = 0; q < 8; q++) {
      const a = q*Math.PI/4 + Math.PI/8;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + Math.cos(a)*spR*1.02 - 2.5*U + 3*S, y + Math.sin(a)*spR*1.02 - 2.5*U + 4*S, 5*U, 5*U);
      ctx.fillStyle = '#4a544e'; ctx.fillRect(x + Math.cos(a)*spR*1.02 - 2.5*U, y + Math.sin(a)*spR*1.02 - 2.5*U, 5*U, 5*U);
    }
    _fcSphere(x, y, spR, S, t, i ? nh3Fill*2 - 1 : nh3Fill*2, accent, on, null);
    // Plate seams, a spiral stair round the shoulder, the top landing and
    // its relief valves.
    ctx.strokeStyle = 'rgba(60,70,76,0.22)'; ctx.lineWidth = S;
    for (const rx of [0.45, 0.82]) { ctx.beginPath(); ctx.ellipse(x, y, spR*rx, spR, 0, 0, Math.PI*2); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(x, y, spR, spR*0.68, 0, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = '#3a443e'; ctx.lineWidth = 2.6*U;
    ctx.beginPath(); ctx.arc(x, y, spR*0.86, Math.PI*0.62, Math.PI*1.42); ctx.stroke();
    ctx.strokeStyle = '#d8b838'; ctx.lineWidth = 2*U; ctx.setLineDash([0.9*U, 2*U]);
    ctx.beginPath(); ctx.arc(x, y, spR*0.86, Math.PI*0.62, Math.PI*1.42); ctx.stroke(); ctx.setLineDash([]);
    const lx = x - spR*0.24, ly = y - spR*0.52, lr = spR*0.2;
    ctx.fillStyle = '#3a443e'; ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#d8b838'; ctx.lineWidth = U; ctx.stroke();
    ctx.fillStyle = '#c02818'; ctx.beginPath(); ctx.arc(lx - lr*0.35, ly, 1.8*U, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#c8ccc0'; ctx.beginPath(); ctx.arc(lx + lr*0.35, ly, 1.8*U, 0, Math.PI*2); ctx.fill();
  });

  // ── Yard lighting after dark ──
  if (on && dark > 0.25) {
    for (const [lx, ly, lr] of [[cpX + cpW*0.6, yN, 70*U], [cpX + cpW*0.6, yH, 70*U], [chX + chW*0.5, chY + chH + 24*U, 60*U], [hxX + hxW*0.5, hxY + hxGap, 60*U], [bdX + bdW*0.5, h*0.5, 80*U]]) {
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
      g.addColorStop(0, `rgba(255,236,190,${0.16*dark})`); g.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI*2); ctx.fill();
    }
  }
  ctx.restore();

  txt.forEach(([x, y, s, c]) => _frameText(f, x, y, s, `bold ${Math.max(4, 5*U)}px Courier New`, c));
  sph.forEach(([x, y]) => _frameText(f, x, y + spR*0.25, 'NH₃', `bold ${Math.max(5, 7*U)}px Courier New`, on ? '#2a3a40' : '#5a6468'));
  const [cmx, cmy] = f.toWorld(chX + chW*0.5, chY + chH*0.3);
  _wfSmoke(cmx, cmy, S*0.5*Math.min(2, k), t, '235,248,255', active, 0.3);

  if (typeof HaberBoschSystem !== 'undefined') {
    const { nitrogenIn, hydrogenIn, ammoniaOut } = hbSt;
    _portPipe(_portAnchor(e, px, py, f.W, f.H, nitrogenIn), S, t, { fluid: '#a0e0ff', label: 'N₂ IN', on: !!e._hasNitrogen, out: false, flow: active });
    _portPipe(_portAnchor(e, px, py, f.W, f.H, hydrogenIn), S, t, { fluid: '#80e0ff', label: 'H₂ IN', on: !!e._hasHydrogen, out: false, flow: active });
    _portPipe(_portAnchor(e, px, py, f.W, f.H, ammoniaOut), S, t, { fluid: '#40e070', label: 'NH₃ OUT', on: !!e._ammoniaPipeOut, out: true, flow: !!e._ammoniaPipeOut });
  }

  const [plx, ply] = f.toWorld(w*0.46, h*0.04);
  _wfPlate('HABER-BOSCH', plx, ply, S, accent, on);
  _wfLamp(px + f.W - 7*S, py + 7*S, S, t, accent, on);
  ctx.restore();
}

function renderIsotopicWashTower(e, px, py, t) {
  // Exchange-process heavy water plant, laid out as a working site:
  //   • twin intake filters on the water line; a control building whose
  //     screen plots enrichment stage by stage; a small transformer yard;
  //     and the catalyst skid — motor, pump and a green-banded surge drum —
  //     on the ammonia line
  //   • the pair of exchange towers: a frosted cold tower with a caged
  //     ladder and a heat-traced hot tower venting steam, each with ring
  //     platforms, a studded head and a long sight glass where water falls
  //     tray to tray, joined by a crossover at the heads and an exchanger
  //     between the shells
  //   • a chiller skid for the catalyst loop, a four-stage enrichment
  //     cascade piped in a serpentine that glows brighter at every stage,
  //     the finishing cells that crack the heavy water, and the deuterium
  //     sphere that fills with the buffer
  // The plant keeps one layout whichever way it is turned, so the towers
  // always stand upright; only the three port lines move, running round
  // the inside of the wall from wherever IsotopicWashTowerSystem.getStubs()
  // put the ports to where the plant takes them in. No backdrop.
  // (The whole drawing used to be transposed or quarter-turned with the
  // ports, which laid the exchange towers, their ladders and their shading
  // on their sides.)
  const f = _plantFrameUpright(e, px, py, T.WASHTOWER);
  const w = f.bw, h = f.bh;
  const on = e.powered;
  const def = EntityDefs[T.WASHTOWER];
  const active = on && e._waterConnected && e._hasAmmonia;
  const d2Fill = Math.min(1, (e._deuterium || 0) / (def.deuteriumCapacity || 1000));
  const S = TILE / 40;
  const k = Math.min(w, h) / (5*TILE);
  // Detail unit: the plant is four times the 5×5 it was first drawn at, so
  // rails, bolts and pipes are sized off this, not off S, or they shrink to
  // hairlines against towers that scaled with the footprint.
  const U = S * Math.max(1, Math.min(2.2, k*0.55));
  const dark = (typeof DayNight !== 'undefined' && DayNight.darkness) ? DayNight.darkness() : 0;
  const accent = '#ff6eb4';   // deuterium rose pink (was sky blue, too close to water)
  const WATER = 'rgba(90,190,255,0.95)', CAT = 'rgba(64,224,112,0.92)';
  const rows = Math.round(h / TILE);
  const [oW, oA, oD] = rows <= 5 ? [1, 3, 2] : [2, rows - 3, Math.floor(rows / 2)];
  const yW = oW*TILE + TILE/2, yA = oA*TILE + TILE/2, yD = oD*TILE + TILE/2;
  ctx.save();
  ctx.save(); f.apply();

  const ctX = w*0.345, htX = w*0.505, tTop = h*0.09, tBot = h*0.80, tR = w*0.062, tH = tBot - tTop;
  const flX = [w*0.10, w*0.175], flR = w*0.028;                       // twin intake filters
  const pmX = w*0.125, pmY = yA, pr = w*0.026;                        // catalyst pump
  const cbX = w*0.045, cbY = h*0.27, cbW = w*0.19, cbH = h*0.20;      // control building
  const txX = w*0.055, txY = h*0.535, txW = w*0.17, txH = h*0.15;     // transformer yard
  const skX = w*0.60, skY = h*0.07, skW = w*0.32, skH = h*0.18;       // catalyst chiller
  const enX = [w*0.60, w*0.65, w*0.70, w*0.75], enTop = h*0.44, enBot = h*0.70;
  const sX = w*0.875, sY = yD, sR = w*0.08;
  const fnX = w*0.60, fnY = h*0.795, fnW = w*0.21, fnH = h*0.10;      // finishing cells
  const P = U*0.85;

  const stubs = (typeof IsotopicWashTowerSystem !== 'undefined') ? IsotopicWashTowerSystem.getStubs(e) : null;
  const ringRun = (stub, m, face, at) => _portRing(e, f, px, py, stub, m, face, at);

  // ── Pipework ──
  _wfPipe([...ringRun(stubs && stubs.waterIn, 8*S, 'left', yW), [ctX - tR - 2*U, yW]], P, t, on && !!e._waterConnected, WATER);
  _wfPipe([...ringRun(stubs && stubs.ammoniaIn, 22*S, 'left', yA), [w*0.27, yA], [w*0.27, h*0.90], [htX, h*0.90], [htX, tBot]], P, t, on && !!e._hasAmmonia, CAT);
  _wfPipe([[ctX, h*0.90], [ctX, tBot]], P, t, active, CAT);
  _wfPipe([[skX + skW*0.5, skY + skH], [skX + skW*0.5, h*0.33], [htX + tR, h*0.33]], P, t, active, CAT);
  _wfPipe([[htX + tR, h*0.40], [enX[0], h*0.40], [enX[0], enTop]], P, t, active, accent);
  // the cascade runs in a serpentine: down one stage, up the next
  _wfPipe([[enX[0], enBot], [enX[0], enBot + h*0.03], [enX[1], enBot + h*0.03], [enX[1], enBot]], P, t, active, accent);
  _wfPipe([[enX[1], enTop + h*0.02], [enX[1], enTop - h*0.012], [enX[2], enTop - h*0.012], [enX[2], enTop + h*0.04]], P, t, active, accent);
  _wfPipe([[enX[2], enBot], [enX[2], enBot + h*0.03], [enX[3], enBot + h*0.03], [enX[3], enBot]], P, t, active, accent);
  _wfPipe([[enX[3], enTop + h*0.06], [enX[3], enTop + h*0.02], [w*0.782, enTop + h*0.02], [w*0.782, fnY + fnH*0.5], [fnX + fnW, fnY + fnH*0.5]], P, t, active, accent);
  _wfPipe([[fnX + fnW*0.5, fnY + fnH], [fnX + fnW*0.5, h*0.925], [sX, h*0.925], [sX, sY + sR]], P, t, active, accent);
  _wfPipe([[sX + sR, sY], ...ringRun(stubs && stubs.deuteriumOut, 8*S, 'right', sY).reverse()], P, t, !!e._deuteriumPipeOut, accent);
  // crossover between the towers' heads
  ctx.strokeStyle = '#141a1c'; ctx.lineWidth = 8*U; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(ctX, tTop + 4*U); ctx.quadraticCurveTo((ctX + htX)/2, tTop - 16*U, htX, tTop + 4*U); ctx.stroke();
  ctx.strokeStyle = '#6a7478'; ctx.lineWidth = 5*U; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.2*U; ctx.stroke();

  // ── Catalyst chiller skid ──
  _wfShadow(skX, skY, skW, skH, U, 3*U);
  ctx.fillStyle = '#4a5a62'; ctx.strokeStyle = '#141c20'; ctx.lineWidth = 1.2*U;
  ctx.beginPath(); ctx.roundRect(skX, skY, skW, skH, 3*U); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3a474e'; ctx.fillRect(skX + 3*U, skY + 3*U, skW - 6*U, skH - 6*U);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.8*U; ctx.beginPath();
  for (let y = skY + 6*U; y < skY + skH - 4*U; y += 4*U) { ctx.moveTo(skX + 4*U, y); ctx.lineTo(skX + skW - 4*U, y); }
  ctx.stroke();
  for (let q = 0; q < 3; q++) _fcFan(skX + skW*(0.19 + q*0.31), skY + skH*0.5, Math.min(skW*0.125, skH*0.36), U, t + q*0.4, active, 9);
  ctx.fillStyle = active ? '#40e070' : on ? '#2a5a3a' : '#2a2a2a';
  ctx.beginPath(); ctx.arc(skX + skW - 5*U, skY + skH - 5*U, 1.6*U, 0, Math.PI*2); ctx.fill();

  // ── Twin intake filters ──
  flX.forEach((x, i) => {
    _fcColumn(x, yW - flR*1.6, yW + flR*1.6, flR, U, '#6a8a9a', '#d8ecf4', '#34505e');
    ctx.fillStyle = '#3a8ab8'; ctx.fillRect(x - flR, yW - 2*U, flR*2, 4*U);
    ctx.fillStyle = on && e._waterConnected ? (i === Math.floor(t*0.4) % 2 ? '#80ffc0' : '#3a8a70') : '#2a3a3a';
    ctx.beginPath(); ctx.arc(x, yW + flR*1.15, 1.5*U, 0, Math.PI*2); ctx.fill();
  });

  // ── Control building: the screen plots enrichment stage by stage ──
  _wfShadow(cbX, cbY, cbW, cbH, U, 3*U);
  ctx.fillStyle = '#4e585e'; ctx.strokeStyle = '#161c20'; ctx.lineWidth = 1.2*U;
  ctx.beginPath(); ctx.roundRect(cbX, cbY, cbW, cbH, 3*U); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#39424a'; ctx.fillRect(cbX + 3*U, cbY + 3*U, cbW - 6*U, cbH - 6*U);
  const scX = cbX + cbW*0.10, scY = cbY + cbH*0.12, scW = cbW*0.80, scH = cbH*0.42;
  ctx.fillStyle = '#060c10'; ctx.strokeStyle = '#7a868c'; ctx.lineWidth = 1*U;
  ctx.beginPath(); ctx.roundRect(scX, scY, scW, scH, 2*U); ctx.fill(); ctx.stroke();
  for (let q = 0; q < 4; q++) {
    const lvl = on ? (active ? (0.22 + q*0.24) * (0.9 + 0.1*Math.sin(t*2.4 + q)) : 0.08) : 0;
    ctx.fillStyle = `rgba(255,110,180,${on ? 0.55 + q*0.14 : 0.2})`;
    ctx.fillRect(scX + scW*(0.10 + q*0.215), scY + scH*(0.9 - lvl*0.8), scW*0.15, scH*lvl*0.8);
  }
  for (let q = 0; q < 2; q++) _fcFan(cbX + cbW*(0.30 + q*0.40), cbY + cbH*0.74, cbH*0.13, U, t + q, on, 7);
  for (let q = 0; q < 5; q++) { ctx.fillStyle = on ? (q === 4 && active ? '#80ffc0' : '#5a8a70') : '#2a3230'; ctx.fillRect(cbX + cbW*0.12 + q*5*U, cbY + cbH - 6*U, 3.4*U, 2*U); }

  // ── Transformer yard ──
  ctx.strokeStyle = 'rgba(232,180,60,0.45)'; ctx.lineWidth = 1*U; ctx.setLineDash([5*U, 4*U]);
  ctx.beginPath(); ctx.roundRect(txX, txY, txW, txH, 2*U); ctx.stroke(); ctx.setLineDash([]);
  _wfHazardStripe(txX + txW*0.3, txY - 1.5*U, txW*0.4, 3*U, U*0.6);
  for (let q = 0; q < 2; q++) {
    const tx = txX + txW*(0.10 + q*0.46), tw = txW*0.34, ty = txY + txH*0.22, th = txH*0.58;
    _wfShadow(tx, ty, tw, th, U, 2*U);
    ctx.fillStyle = '#5a6a5a'; ctx.strokeStyle = '#1a221a'; ctx.lineWidth = 1*U;
    ctx.beginPath(); ctx.roundRect(tx, ty, tw, th, 2*U); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.8*U; ctx.beginPath();
    for (let r = 1; r < 5; r++) { ctx.moveTo(tx + tw*r/5, ty + 2*U); ctx.lineTo(tx + tw*r/5, ty + th - 2*U); }
    ctx.stroke();
    for (const bx of [0.3, 0.7]) { ctx.fillStyle = '#c8b890'; ctx.beginPath(); ctx.arc(tx + tw*bx, ty + 2.5*U, 1.6*U, 0, Math.PI*2); ctx.fill(); }
    ctx.fillStyle = active ? '#ffd040' : on ? '#50c060' : '#3a3228';
    ctx.beginPath(); ctx.arc(tx + tw - 3*U, ty + th - 3*U, 1.2*U, 0, Math.PI*2); ctx.fill();
  }

  // ── Exchange towers ──
  const tower = (x, hot) => {
    const [c0, c1, c2] = hot ? ['#a08a78', '#f0dcc8', '#5a4838'] : ['#8aa8b8', '#e8f6ff', '#4a6878'];
    ctx.fillStyle = '#3a4246'; ctx.fillRect(x - tR*0.8, tBot - 2*U, tR*1.6, 7*U);                    // skirt
    _fcColumn(x, tTop, tBot, tR, U, c0, c1, c2);
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    for (let q = 1; q < 9; q++) ctx.fillRect(x - tR, tTop + tH*q/9, tR*2, 1*U);                       // insulation bands
    if (hot && active) {                                                                              // heat tracing
      ctx.fillStyle = `rgba(255,140,60,${(0.12 + 0.05*Math.sin(t*1.7) + 0.14*dark).toFixed(3)})`;
      ctx.fillRect(x + tR*0.42, tTop + 10*U, tR*0.32, tH - 20*U);
    }
    // sight glass: water falling tray to tray
    const gw = 7*U, wy0 = tTop + 16*U, wy1 = tBot - 14*U;
    ctx.fillStyle = '#0a141a'; ctx.strokeStyle = '#7a868c'; ctx.lineWidth = 1*U;
    ctx.beginPath(); ctx.roundRect(x - gw/2, wy0, gw, wy1 - wy0, 2*U); ctx.fill(); ctx.stroke();
    if (active) { ctx.fillStyle = hot ? 'rgba(255,150,80,0.16)' : 'rgba(120,200,255,0.16)'; ctx.fillRect(x - gw/2 + U, wy0 + U, gw - 2*U, wy1 - wy0 - 2*U); }
    ctx.strokeStyle = 'rgba(160,200,220,0.4)'; ctx.lineWidth = 0.8*U; ctx.beginPath();
    for (let y = wy0 + 8*U; y < wy1 - 2*U; y += 9*U) { ctx.moveTo(x - gw/2 + U, y); ctx.lineTo(x + gw/2 - U, y); }
    ctx.stroke();
    if (active) for (let q = 0; q < 14; q++) {
      const p = (t*0.6 + q/14 + (hot ? 0.4 : 0)) % 1;
      ctx.fillStyle = hot ? `rgba(255,190,120,${(0.9*(1 - p*0.5)).toFixed(2)})` : `rgba(160,225,255,${(0.9*(1 - p*0.5)).toFixed(2)})`;
      ctx.fillRect(x - 2.2*U + ((q*3) % 4)*1.1*U, wy0 + 2*U + p*(wy1 - wy0 - 6*U), 1.2*U, 2.6*U);
    }
    // ring platforms with yellow rails
    [0.26, 0.52, 0.78].forEach(fq => {
      const y = tTop + tH*fq, x0 = x - tR - 5*U, x1 = x + tR + 5*U;
      ctx.fillStyle = '#3a4246'; ctx.fillRect(x0, y, x1 - x0, 2.5*U);
      ctx.strokeStyle = '#d8b030'; ctx.lineWidth = 1*U; ctx.beginPath();
      ctx.moveTo(x0, y - 4.5*U); ctx.lineTo(x1, y - 4.5*U);
      for (let q = 0; q <= 4; q++) { const rx = x0 + (x1 - x0)*q/4; ctx.moveTo(rx, y - 4.5*U); ctx.lineTo(rx, y); }
      ctx.stroke();
    });
    // studded head
    ctx.fillStyle = '#2a3236';
    for (let q = 0; q < 10; q++) { const a = q*Math.PI*2/10; ctx.beginPath(); ctx.arc(x + Math.cos(a)*tR*0.8, tTop + 2*U + Math.sin(a)*tR*0.36, 1.1*U, 0, Math.PI*2); ctx.fill(); }
    if (!hot) {                                                                                       // frost
      ctx.fillStyle = 'rgba(235,248,255,0.45)'; ctx.beginPath(); ctx.ellipse(x, tTop + 2*U, tR*0.95, tR*0.43, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(210,242,255,0.8)';
      for (let q = 0; q < 18; q++) ctx.fillRect(x - tR + ((q*7) % 10)*tR/5, tTop + tH*((q*0.37) % 1), 1.2*U, 1.2*U);
    }
  };
  tower(ctX, false);
  tower(htX, true);
  // caged ladder up the cold tower
  const ldX = ctX - tR - 3.6*U, ldTop = tTop + tH*0.26, ldBot = tBot + 3*U;
  ctx.strokeStyle = '#d8b030'; ctx.lineWidth = 0.9*U; ctx.beginPath();
  ctx.moveTo(ldX - 1.6*U, ldTop); ctx.lineTo(ldX - 1.6*U, ldBot); ctx.moveTo(ldX + 1.6*U, ldTop); ctx.lineTo(ldX + 1.6*U, ldBot);
  for (let y = ldTop + 3*U; y < ldBot; y += 4*U) { ctx.moveTo(ldX - 1.6*U, y); ctx.lineTo(ldX + 1.6*U, y); }
  ctx.stroke();
  // exchanger between the shells
  const hxY = tTop + tH*0.65, hx0 = ctX + tR - U, hx1 = htX - tR + U;
  const hg = ctx.createLinearGradient(0, hxY - 5*U, 0, hxY + 5*U);
  hg.addColorStop(0, '#5a646c'); hg.addColorStop(0.4, '#c8d0d6'); hg.addColorStop(1, '#3a4248');
  ctx.fillStyle = hg; ctx.fillRect(hx0, hxY - 5*U, hx1 - hx0, 10*U);
  ctx.fillStyle = '#2a3236'; ctx.fillRect(hx0, hxY - 6.5*U, 2.4*U, 13*U); ctx.fillRect(hx1 - 2.4*U, hxY - 6.5*U, 2.4*U, 13*U);
  if (active) { ctx.fillStyle = `rgba(255,170,90,${(0.25 + 0.15*Math.sin(t*3)).toFixed(2)})`; ctx.fillRect(hx0 + 3*U, hxY - 1.5*U, hx1 - hx0 - 6*U, 3*U); }

  // ── Catalyst skid: motor, pump, surge drum ──
  const skb = h*0.052;
  _wfShadow(w*0.045, pmY - skb, w*0.21, skb*2, U, 3*U);
  ctx.fillStyle = '#3a4246'; ctx.strokeStyle = '#141a1c'; ctx.lineWidth = 1*U;
  ctx.beginPath(); ctx.roundRect(w*0.045, pmY - skb, w*0.21, skb*2, 3*U); ctx.fill(); ctx.stroke();
  const mg = ctx.createLinearGradient(0, pmY - pr*0.75, 0, pmY + pr*0.75);
  mg.addColorStop(0, '#3a7a5a'); mg.addColorStop(0.4, '#7ac8a0'); mg.addColorStop(1, '#1e4a34');
  ctx.fillStyle = mg; ctx.beginPath(); ctx.roundRect(w*0.055, pmY - pr*0.75, w*0.042, pr*1.5, 2*U); ctx.fill(); ctx.stroke();   // motor
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.8*U; ctx.beginPath();
  for (let q = 1; q < 5; q++) { ctx.moveTo(w*0.055 + w*0.042*q/5, pmY - pr*0.7); ctx.lineTo(w*0.055 + w*0.042*q/5, pmY + pr*0.7); }
  ctx.stroke();
  ctx.fillStyle = '#4a6a50'; ctx.beginPath(); ctx.arc(pmX, pmY, pr, 0, Math.PI*2); ctx.fill();                                    // pump casing
  ctx.strokeStyle = '#1a2a1c'; ctx.lineWidth = 1.2*U; ctx.stroke();
  ctx.save(); ctx.translate(pmX, pmY); ctx.rotate(active ? t*8 : 0.3);
  ctx.strokeStyle = '#c8e0c8'; ctx.lineWidth = 1.6*U;
  for (let q = 0; q < 3; q++) { ctx.rotate(Math.PI*2/3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(pr*0.4, -pr*0.3, pr*0.75, 0); ctx.stroke(); }
  ctx.restore();
  const drX = w*0.165, drW = w*0.08, drH = h*0.05;
  const dg = ctx.createLinearGradient(0, pmY - drH/2, 0, pmY + drH/2);
  dg.addColorStop(0, '#7a868c'); dg.addColorStop(0.4, '#e0e6ea'); dg.addColorStop(1, '#4a5458');
  ctx.fillStyle = dg; ctx.strokeStyle = '#141a1c'; ctx.lineWidth = 1*U;
  ctx.beginPath(); ctx.roundRect(drX, pmY - drH/2, drW, drH, drH/2); ctx.fill(); ctx.stroke();                                    // surge drum
  ctx.fillStyle = '#2e9a54'; ctx.fillRect(drX + drW*0.42, pmY - drH/2, drW*0.16, drH);
  ctx.fillStyle = '#0a141a'; ctx.fillRect(drX + drW*0.72, pmY - drH*0.32, 2.4*U, drH*0.64);
  if (e._hasAmmonia) { ctx.fillStyle = '#40e070'; ctx.fillRect(drX + drW*0.72, pmY + drH*0.32 - drH*0.45, 2.4*U, drH*0.45); }

  // ── Enrichment cascade ──
  enX.forEach((x, i) => {
    const top = enTop + i*h*0.02, r = w*(0.02 - i*0.0016);
    _fcColumn(x, top, enBot, r, U, '#4a6878', '#c8e0f0', '#1e3440');
    ctx.fillStyle = '#0a141a'; ctx.beginPath(); ctx.roundRect(x - r*0.5, top + 7*U, r, enBot - top - 12*U, r*0.4); ctx.fill();
    if (active) {
      ctx.fillStyle = `rgba(255,110,180,${(0.28 + i*0.18 + 0.12*Math.sin(t*2 + i)).toFixed(2)})`;
      ctx.beginPath(); ctx.roundRect(x - r*0.5, top + 7*U, r, enBot - top - 12*U, r*0.4); ctx.fill();
      for (let q = 0; q < 3; q++) { const p = (t*0.5 + q/3 + i*0.2) % 1; ctx.fillStyle = `rgba(255,220,240,${(0.8*(1 - p)).toFixed(2)})`; ctx.beginPath(); ctx.arc(x, enBot - 7*U - p*(enBot - top - 16*U), 1.1*U, 0, Math.PI*2); ctx.fill(); }
    }
    ctx.fillStyle = '#3a4246'; ctx.fillRect(x - r - 1.5*U, enBot - 2.5*U, r*2 + 3*U, 2.5*U);
  });
  if (active && dark > 0.05) {
    const cg = ctx.createRadialGradient(w*0.675, h*0.57, 0, w*0.675, h*0.57, w*0.16);
    cg.addColorStop(0, `rgba(255,110,180,${(0.22*dark).toFixed(3)})`); cg.addColorStop(1, 'rgba(255,110,180,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(w*0.675, h*0.57, w*0.16, 0, Math.PI*2); ctx.fill();
  }

  // ── Finishing cells: heavy water cracked to deuterium ──
  _wfShadow(fnX, fnY, fnW, fnH, U, 3*U);
  ctx.fillStyle = '#34404a'; ctx.strokeStyle = '#10161a'; ctx.lineWidth = 1.2*U;
  ctx.beginPath(); ctx.roundRect(fnX, fnY, fnW, fnH, 3*U); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#b87a40'; ctx.fillRect(fnX + 4*U, fnY + 3*U, fnW - 8*U, 2*U);                                                  // busbar
  for (let q = 0; q < 6; q++) {
    const cx = fnX + fnW*(0.07 + q*0.15), cw = fnW*0.11, cy = fnY + fnH*0.30, ch = fnH*0.56;
    ctx.fillStyle = active ? `rgba(255,110,180,${(0.45 + 0.2*Math.sin(t*2.6 + q*1.3)).toFixed(2)})` : on ? '#3a2a36' : '#1e2226';
    ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 1.5*U); ctx.fill();
    if (active) for (let b = 0; b < 2; b++) { const p = (t*0.9 + q*0.3 + b/2) % 1; ctx.fillStyle = `rgba(255,235,245,${(0.85*(1 - p)).toFixed(2)})`; ctx.beginPath(); ctx.arc(cx + cw*(0.3 + b*0.4), cy + ch*(1 - p), 0.9*U, 0, Math.PI*2); ctx.fill(); }
  }

  // ── Deuterium sphere ──
  ctx.strokeStyle = '#2a3236'; ctx.lineWidth = 2.4*U; ctx.beginPath();
  for (const dx of [-0.6, 0, 0.6]) { ctx.moveTo(sX + sR*dx, sY + sR*0.7); ctx.lineTo(sX + sR*dx*1.15, sY + sR + 7*U); }
  ctx.stroke();
  if (active) {
    const gg = ctx.createRadialGradient(sX, sY, 1, sX, sY, sR*1.8);
    gg.addColorStop(0, `rgba(255,110,180,${(0.35 + 0.15*Math.sin(t*2) + 0.15*dark).toFixed(3)})`); gg.addColorStop(1, 'rgba(255,110,180,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(sX, sY, sR*1.8, 0, Math.PI*2); ctx.fill();
  }
  _fcSphere(sX, sY, sR, U, t, d2Fill, accent, on, null);
  ctx.restore();

  const [smx, smy] = f.toWorld(htX, tTop - 1*S);
  _wfSmoke(smx, smy, U*0.55, t, '250,245,235', active, 0.4);
  const lab = `bold ${Math.max(4, 4.2*U)}px Courier New`;
  _frameText(f, ctX, tBot - 6*U, '−25°C', lab, on ? '#2a5a78' : '#4a5a64');
  _frameText(f, htX, tBot - 6*U, '+60°C', lab, on ? '#8a3a1a' : '#5a4a44');
  _frameText(f, (enX[1] + enX[2])/2, enBot + h*0.062, 'D/H ▲', lab, on ? accent : '#3a5a68');
  _frameText(f, fnX + fnW*0.5, fnY - 5*U, 'D₂O → D₂', lab, on ? accent : '#3a5a68');
  _frameText(f, sX, sY, 'D₂', `bold ${Math.max(5, 7*U)}px Courier New`, on ? '#2a3a40' : '#5a6468');

  if (stubs) {
    const { waterIn, ammoniaIn, deuteriumOut } = stubs;
    _portPipe(_portAnchor(e, px, py, f.W, f.H, waterIn), S, t, { fluid: '#40c0e0', label: 'H₂O IN', on: !!e._waterConnected, out: false, flow: active });
    _portPipe(_portAnchor(e, px, py, f.W, f.H, ammoniaIn), S, t, { fluid: '#40e070', label: 'NH₃ CAT', on: !!e._hasAmmonia, out: false, flow: active });
    _portPipe(_portAnchor(e, px, py, f.W, f.H, deuteriumOut), S, t, { fluid: '#ff6eb4', label: 'D₂ OUT', on: !!e._deuteriumPipeOut, out: true, flow: !!e._deuteriumPipeOut });
  }

  const [plx, ply] = f.toWorld(w*0.42, h*0.965);
  _wfPlate('ISOTOPIC WASH', plx, ply, S, accent, on);
  _wfLamp(px + f.W - 7*S, py + 7*S, S, t, accent, on);
  ctx.restore();
}

function renderFusionFuelPlant(e, px, py, t) {
  // A pellet factory on a poured concrete pad. Deuterium comes in to a
  // cylinder bank on its manifold; the partner fuel — tritium on D-T,
  // helium-3 on D-He3 — sits in a shielded vault. Both feed a glass-roofed
  // cleanroom: a frosted cryogenic extruder freezes the fuel into a ribbon
  // and cuts it into pellets, which ride a belt past two laser target
  // chambers (each ringed by laser heads on a bolted flange, beams
  // converging on the flash) tended by robot arms, and out to a cryogenic
  // pellet store whose tubes light as it fills. Along the bottom: the
  // control room, a row of cryo coolers, the helium compressor skid and an
  // LN2 tank; a clean-air handler hums in the corner. The body keeps one
  // layout; ports come from FusionFuelPlantSystem.getStubs() and are fed in
  // from whichever faces the rotation put them on (_portFeed).
  const def = EntityDefs[T.FUSIONFUELPLANT];
  const w   = (e.width || def.width) * TILE;
  const h   = (e.height || def.height) * TILE;
  const cx  = px + w / 2;
  const on  = e.powered;
  const plasmaFill = Math.min(1, (e._plasma || 0) / (def.plasmaCapacity || 400));
  const active = !!e._generating;
  const S = TILE / 40;
  const k = Math.min(w / (7*TILE), h / (6*TILE));   // detail scale, 1 at the old 7×6
  const detail = Camera.zoom > 0.5;
  const accent = '#70f0ff';

  // ── Production cycle ──
  // Everything that moves keys off one beat, so the hall reads as a line
  // making pellets rather than a pile of independent loops. Each cycle the
  // belt indexes one pitch and stops (0 → BELT_STOP); on the stop the
  // extruder's cutter chops a pellet and a finished one drops into the
  // store; then, while the belt dwells, each chamber charges its lasers and
  // fires in turn — beams, flash, shockwave, the roof lighting up.
  const CYC = 1.6, BELT_STOP = 0.55;
  const cycT  = active ? t / CYC : 0;
  const cyc   = ((cycT % 1) + 1) % 1;
  const since = (a) => (((cyc - a) % 1) + 1) % 1;        // fraction of a cycle since phase a
  const SHOTS = [{ charge: 0.55, fire: 0.68 }, { charge: 0.67, fire: 0.81 }];
  const shotState = SHOTS.map(({ charge, fire }) => {
    const sc = since(charge), sf = since(fire), span = fire - charge;
    return {
      charge: active && sc < span ? sc / span : 0,        // 0→1 while the lasers charge
      firing: active && sf < 0.06,                        // beams on
      shock:  active && sf < 0.24 ? sf / 0.24 : -1,       // shockwave 0→1, -1 when none
      flash:  active && sf < 0.14 ? 1 - sf / 0.14 : 0,    // light on the roof and around the chamber
      reach:  active ? Math.max(0, Math.min(1, sc < span ? sc / span : sf < 0.2 ? 1 - sf / 0.2 : 0)) : 0,
    };
  });
  const ease = (u) => u < 0.5 ? 2*u*u : 1 - Math.pow(-2*u + 2, 2) / 2;
  const beltAdv = active ? (cyc < BELT_STOP ? ease(cyc / BELT_STOP) : 1) : 0;   // 0→1 pitch this cycle
  const sinceStop = since(BELT_STOP);
  ctx.save();

  // ── Layout (fractions of the footprint) ──
  const ahX = px + w*0.05, ahY = py + h*0.08, ahW = w*0.17, ahH = h*0.15;          // clean-air handler
  const brX = px + w*0.29, brY = py + h*0.07, brW = w*0.42, brH = h*0.13;          // deuterium cylinder bank
  const vtX = px + w*0.05, vtY = py + h*0.29, vtW = w*0.16, vtH = h*0.34;          // partner-fuel vault
  const siX = vtX + vtW*0.5, siY = vtY + vtH*0.5, siR = Math.min(vtW, vtH)*0.30;   // store sphere inside it
  const hlX = px + w*0.25, hlY = py + h*0.25, hlW = w*0.52, hlH = h*0.52;          // cleanroom hall
  const exX = hlX + hlW*0.05, exY = hlY + hlH*0.14, exW = hlW*0.13, exH = hlH*0.54; // cryo extruder
  const chambers = [[hlX + hlW*0.44, hlY + hlH*0.40], [hlX + hlW*0.74, hlY + hlH*0.40]], chR = hlH*0.14;
  const beltY = hlY + hlH*0.80;
  const mgX = px + w*0.81, mgY = py + h*0.22, mgW = w*0.14, mgH = h*0.52;          // pellet store
  const bandY = py + h*0.81, bandH = h*0.10;                                        // bottom equipment row

  const st = (typeof FusionFuelPlantSystem !== 'undefined') ? FusionFuelPlantSystem.getStubs(e) : null;
  const aT   = st && _portAnchor(e, px, py, w, h, st.tritiumIn);
  const aHe3 = st && _portAnchor(e, px, py, w, h, st.he3In);
  const aD2  = st && _portAnchor(e, px, py, w, h, st.deuteriumIn);
  const aPfc = st && _portAnchor(e, px, py, w, h, st.plasmaOut);
  const aHpo = st && st.he3PelletOut && _portAnchor(e, px, py, w, h, st.he3PelletOut);   // the split's D-He3 OUT
  // The vault holds the partner fuel: tritium on D-T, helium-3 on D-He3.
  const isDT = (e._fuelMode || 'dt') === 'dt';
  const fuelCol = isDT ? '#80ffc0' : '#ffd0a0';
  const partnerOn = isDT ? !!e._hasTritium : !!e._hasHe3;
  const partnerFill = Math.min(1, (isDT ? (e._tritium || 0) / (def.tritiumCapacity || 400)
                                        : (e._legacyHe3 > 0 ? 1 : (e._he3 || 0) / (def.he3Capacity || 300))));

  // ── Pad: poured slab, expansion joints, safety line, anchor bolts ──
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.roundRect(px + w*0.02 + 5*S, py + h*0.03 + 6*S, w*0.96, h*0.93, 5*S); ctx.fill();
  const pg = ctx.createLinearGradient(px, py, px + w, py + h);
  pg.addColorStop(0, '#5a5e60'); pg.addColorStop(1, '#46494c');
  ctx.fillStyle = pg; ctx.beginPath(); ctx.roundRect(px + w*0.02, py + h*0.03, w*0.96, h*0.93, 5*S); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1*S;
  for (let q = 1; q < 8; q++) { const lx = px + w*(0.02 + 0.96*q/8); ctx.beginPath(); ctx.moveTo(lx, py + h*0.04); ctx.lineTo(lx, py + h*0.95); ctx.stroke(); }
  for (let q = 1; q < 7; q++) { const ly = py + h*(0.03 + 0.93*q/7); ctx.beginPath(); ctx.moveTo(px + w*0.03, ly); ctx.lineTo(px + w*0.97, ly); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(232,180,60,0.38)'; ctx.lineWidth = 1.4*S; ctx.setLineDash([6*S, 5*S]);
  ctx.beginPath(); ctx.roundRect(px + w*0.035, py + h*0.05, w*0.93, h*0.89, 3*S); ctx.stroke(); ctx.setLineDash([]);
  if (detail) {
    ctx.fillStyle = '#8a8e92';
    [[0.03, 0.045], [0.97, 0.045], [0.03, 0.945], [0.97, 0.945]].forEach(([bx, by]) => { ctx.beginPath(); ctx.arc(px + w*bx, py + h*by, 1.6*S, 0, Math.PI*2); ctx.fill(); });
  }

  // ── Feed lines (under the equipment) ──
  if (aD2)  _portFeed(aD2, cx, brY + brH*0.5, S, t, on && !!e._hasDeuterium, 'pipe', 'rgba(255,110,180,0.95)');
  if (aT)   _portFeed(aT,   siX, siY, S, t, !!e._tritiumLinked, 'pipe', 'rgba(128,255,192,0.95)');
  if (aHe3) _portFeed(aHe3, siX, siY, S, t, !!e._he3Linked, 'pipe', 'rgba(255,208,160,0.95)');
  if (aPfc) _portFeed(aPfc, mgX + mgW*0.5, mgY + mgH*0.5, S, t, !!e._plasmaConveyorOut, 'belt', '#4a9ab0');
  if (aHpo) _portFeed(aHpo, mgX + mgW*0.5, mgY + mgH*0.85, S, t, !!e._he3PelletConveyorOut && (e._he3Pellets || 0) > 0, 'belt', '#8a60c0');
  _wfPipe([[cx, brY + brH], [cx, hlY + 2*S], ], S, t, on && !!e._hasDeuterium, 'rgba(255,110,180,0.95)');
  _wfPipe([[vtX + vtW, siY], [exX + exW*0.5, siY], [exX + exW*0.5, exY + exH]], S, t, active, fuelCol);
  _wfConveyor(hlX + hlW - 6*S, beltY, mgX + 2*S, beltY, S, t, active, '#4a9ab0');   // straight across into the store
  // cryo lines from the coolers up into the hall
  _wfPipe([[px + w*0.33, bandY], [px + w*0.33, hlY + hlH]], S, t, on, 'rgba(200,235,255,0.8)');
  _wfPipe([[px + w*0.50, bandY], [px + w*0.50, hlY + hlH]], S, t + 0.4, on, 'rgba(200,235,255,0.8)');

  // ── Clean-air handler: louvred housing, twin fans ──
  _wfShadow(ahX, ahY, ahW, ahH, S, 3*S);
  const ahg = ctx.createLinearGradient(0, ahY, 0, ahY + ahH);
  ahg.addColorStop(0, '#dde6ea'); ahg.addColorStop(1, '#a8b6bc');
  ctx.fillStyle = ahg; ctx.strokeStyle = '#4a5a62'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.roundRect(ahX, ahY, ahW, ahH, 3*S); ctx.fill(); ctx.stroke();
  for (let q = 0; q < 2; q++) {
    const fx = ahX + ahW*(0.27 + q*0.46), fy = ahY + ahH*0.52, fr = Math.min(ahW*0.19, ahH*0.36);
    ctx.fillStyle = '#26323a'; ctx.beginPath(); ctx.arc(fx, fy, fr*1.12, 0, Math.PI*2); ctx.fill();
    _fcFan(fx, fy, fr, S, t + q*0.3, on, 7);
  }
  ctx.strokeStyle = 'rgba(40,56,64,0.35)'; ctx.lineWidth = 0.8*S;
  for (let q = 1; q < 4; q++) { const ly = ahY + ahH*q/4; ctx.beginPath(); ctx.moveTo(ahX + ahW*0.03, ly); ctx.lineTo(ahX + ahW*0.08, ly); ctx.stroke(); }

  // ── Deuterium cylinder bank: two rows of cylinders on a manifold ──
  _wfShadow(brX, brY, brW, brH, S, 2*S);
  ctx.fillStyle = '#3a464c'; ctx.strokeStyle = '#141c20'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.roundRect(brX, brY, brW, brH, 2*S); ctx.fill(); ctx.stroke();
  const nb = Math.max(6, Math.round(8*Math.min(1.6, k*0.7)));
  const d2Lit = on && !!e._hasDeuterium;
  const cylW = brW - brH*0.7;   // leave the right end for the pressure gauge
  for (let row = 0; row < 2; row++) for (let q = 0; q < nb; q++) {
    const bx = brX + cylW*(q + 0.5)/nb, by = brY + brH*(row ? 0.68 : 0.32), br = Math.min(cylW/nb*0.38, brH*0.18);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(bx + 1.2*S, by + 1.5*S, br, 0, Math.PI*2); ctx.fill();
    const bg = ctx.createRadialGradient(bx - br*0.4, by - br*0.4, 0.5, bx, by, br);
    bg.addColorStop(0, '#e0f4ff'); bg.addColorStop(0.55, '#4a9ac8'); bg.addColorStop(1, '#1a4a6a');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#c8ccd0'; ctx.beginPath(); ctx.arc(bx, by, br*0.34, 0, Math.PI*2); ctx.fill();
  }
  ctx.strokeStyle = d2Lit ? 'rgba(96,208,255,0.9)' : '#56646a'; ctx.lineWidth = 1.6*S;
  ctx.beginPath(); ctx.moveTo(brX + 3*S, brY + brH*0.5); ctx.lineTo(brX + brW - 3*S, brY + brH*0.5); ctx.stroke();
  // pressure gauge on the end of the manifold
  const ggx = brX + brW - brH*0.32, ggy = brY + brH*0.5, ggr = brH*0.2;
  ctx.fillStyle = '#e8ecee'; ctx.beginPath(); ctx.arc(ggx, ggy, ggr, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#1a2226'; ctx.lineWidth = 0.8*S; ctx.stroke();
  const ga = -Math.PI*0.8 + (d2Lit ? 1.3 + 0.1*Math.sin(t*3) : 0.1)*Math.PI*0.8;
  ctx.strokeStyle = '#c03020'; ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.moveTo(ggx, ggy); ctx.lineTo(ggx + Math.cos(ga)*ggr*0.8, ggy + Math.sin(ga)*ggr*0.8); ctx.stroke();

  // ── Partner-fuel vault: thick concrete walls around a shielded sphere ──
  _wfShadow(vtX, vtY, vtW, vtH, S, 4*S);
  const vg = ctx.createLinearGradient(vtX, 0, vtX + vtW, 0);
  vg.addColorStop(0, '#80847e'); vg.addColorStop(0.5, '#9a9e98'); vg.addColorStop(1, '#5e625c');
  ctx.fillStyle = vg; ctx.strokeStyle = '#22261f'; ctx.lineWidth = 1.4*S;
  ctx.beginPath(); ctx.roundRect(vtX, vtY, vtW, vtH, 4*S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#23292a'; ctx.beginPath(); ctx.roundRect(vtX + vtW*0.12, vtY + vtH*0.10, vtW*0.76, vtH*0.80, 3*S); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(siX + 3*S, siY + 4*S, siR, 0, Math.PI*2); ctx.fill();
  const sg = ctx.createRadialGradient(siX - siR*0.4, siY - siR*0.4, 1, siX, siY, siR);
  sg.addColorStop(0, '#f2f6f4'); sg.addColorStop(0.6, '#9aaaa4'); sg.addColorStop(1, '#34403c');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(siX, siY, siR, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = partnerOn && on ? fuelCol : '#2a3430'; ctx.lineWidth = 2*S;
  ctx.beginPath(); ctx.arc(siX, siY, siR - 2*S, 0, Math.PI*2); ctx.stroke();
  if (partnerOn && on) {
    const hg = ctx.createRadialGradient(siX, siY, siR*0.8, siX, siY, siR*1.6);
    hg.addColorStop(0, fuelCol + '40'); hg.addColorStop(1, fuelCol + '00');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(siX, siY, siR*1.6, 0, Math.PI*2); ctx.fill();
  }
  ctx.fillStyle = '#1a2622'; ctx.font = `bold ${Math.max(4, 6*S)}px Courier New`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(isDT ? 'T' : '³He', siX, siY + 0.5*S); ctx.textBaseline = 'alphabetic';
  // store level bar down the vault's side
  const lvX = vtX + vtW*0.90, lvY = vtY + vtH*0.14, lvH = vtH*0.72;
  ctx.fillStyle = '#10161a'; ctx.fillRect(lvX, lvY, 2.4*S, lvH);
  if (partnerFill > 0) { ctx.fillStyle = on ? fuelCol : '#4a6058'; ctx.fillRect(lvX, lvY + lvH*(1 - partnerFill), 2.4*S, lvH*partnerFill); }
  if (isDT && detail) {
    // radiation trefoil on the vault lintel
    const rx = siX, ry = vtY + vtH*0.055, rr = Math.min(vtW, vtH)*0.07;
    ctx.fillStyle = '#e8c030'; ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    for (let q = 0; q < 3; q++) {
      const a0 = -Math.PI/2 + q*2*Math.PI/3 - Math.PI/6;
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.arc(rx, ry, rr*0.85, a0, a0 + Math.PI/3); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#e8c030'; ctx.beginPath(); ctx.arc(rx, ry, rr*0.28, 0, Math.PI*2); ctx.fill();
  }

  // ── Cleanroom hall: walled, glass-roofed ──
  _wfShadow(hlX, hlY, hlW, hlH, S, 4*S);
  const wg = ctx.createLinearGradient(0, hlY, 0, hlY + hlH);
  wg.addColorStop(0, '#eef3f5'); wg.addColorStop(1, '#b4c2c8');
  ctx.fillStyle = wg; ctx.strokeStyle = '#56666e'; ctx.lineWidth = 1.5*S;
  ctx.beginPath(); ctx.roundRect(hlX, hlY, hlW, hlH, 4*S); ctx.fill(); ctx.stroke();
  const gx = hlX + 6*S, gy = hlY + 6*S, gw = hlW - 12*S, gh = hlH - 12*S;
  const fl = ctx.createLinearGradient(gx, gy, gx, gy + gh);
  fl.addColorStop(0, on ? '#123644' : '#131c20'); fl.addColorStop(1, on ? '#0a2230' : '#0e1417');
  ctx.fillStyle = fl; ctx.fillRect(gx, gy, gw, gh);
  ctx.save(); ctx.beginPath(); ctx.rect(gx, gy, gw, gh); ctx.clip();
  // floor grid of the cleanroom
  ctx.strokeStyle = 'rgba(120,200,230,0.06)'; ctx.lineWidth = 0.8*S;
  for (let q = 1; q < 16; q++) { ctx.beginPath(); ctx.moveTo(gx + gw*q/16, gy); ctx.lineTo(gx + gw*q/16, gy + gh); ctx.stroke(); }
  for (let q = 1; q < 10; q++) { ctx.beginPath(); ctx.moveTo(gx, gy + gh*q/10); ctx.lineTo(gx + gw, gy + gh*q/10); ctx.stroke(); }

  // cryogenic extruder: frosted cylinder, extrudes the frozen ribbon onto the belt
  _wfShadow(exX, exY, exW, exH, S, exW/2);
  const eg = ctx.createLinearGradient(exX, 0, exX + exW, 0);
  eg.addColorStop(0, '#c8dae4'); eg.addColorStop(0.45, '#ffffff'); eg.addColorStop(1, '#7a92a0');
  ctx.fillStyle = eg; ctx.strokeStyle = '#3a5060'; ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.roundRect(exX, exY, exW, exH, exW*0.45); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(60,90,110,0.3)'; ctx.lineWidth = 0.8*S;
  for (let q = 1; q < 6; q++) { const ly = exY + exH*q/6; ctx.beginPath(); ctx.moveTo(exX + 2*S, ly); ctx.lineTo(exX + exW - 2*S, ly); ctx.stroke(); }
  if (active) {
    ctx.fillStyle = 'rgba(210,240,255,0.8)';
    for (let q = 0; q < 14; q++) ctx.fillRect(exX + exW*((q*0.618) % 1), exY + exH*((q*0.382) % 1), 1.2*S, 1.2*S);
  }
  // nozzle and ribbon down to the belt
  ctx.fillStyle = '#6a7a84'; ctx.fillRect(exX + exW*0.35, exY + exH, exW*0.3, beltY - (exY + exH) - 4*S);
  if (active) {
    // the ribbon pushes out while the belt dwells, then is cut on the stop
    const grow = cyc >= BELT_STOP ? (cyc - BELT_STOP) / (1 - BELT_STOP) : cyc / BELT_STOP;
    const rLen = (beltY - (exY + exH) - 4*S) * (0.35 + 0.65*grow);
    ctx.fillStyle = fuelCol; ctx.fillRect(exX + exW*0.44, exY + exH, exW*0.12, rLen);
  }
  // cutter blade across the nozzle, snapping shut on the belt stop
  const cutU = active && sinceStop < 0.08 ? sinceStop / 0.08 : 0;
  ctx.fillStyle = '#a8b4bc';
  ctx.fillRect(exX + exW*(0.18 + 0.28*Math.sin(cutU*Math.PI)), beltY - 8*S, exW*0.3, 2*S);

  // pellet belt — indexes one pitch per cycle and stops
  const x0 = exX + exW*0.5, pitch = (gx + gw - x0) / 7;
  ctx.fillStyle = '#26343a'; ctx.fillRect(gx, beltY - 5*S, gw, 10*S);
  ctx.fillStyle = '#3a4c54'; ctx.fillRect(gx, beltY - 5*S, gw, 1.4*S); ctx.fillRect(gx, beltY + 3.6*S, gw, 1.4*S);
  ctx.strokeStyle = '#4a6068'; ctx.lineWidth = S;
  const boff = active ? ((Math.floor(cycT) + beltAdv) * pitch) % (6*S) : 0;
  for (let x = gx + boff; x < gx + gw; x += 6*S) { ctx.beginPath(); ctx.moveTo(x, beltY - 3.5*S); ctx.lineTo(x, beltY + 3.5*S); ctx.stroke(); }
  if (active) {
    // pellets leave the extruder frosted, turn lavender past the first
    // chamber and glow cyan past the second
    for (let m = 0; m < 7; m++) {
      const x = x0 + (m + beltAdv) * pitch;
      if (x > gx + gw - 2*S) continue;
      const done = x > chambers[1][0], half = x > chambers[0][0];
      if (done) {
        const pg2 = ctx.createRadialGradient(x, beltY, 0, x, beltY, 5*S);
        pg2.addColorStop(0, 'rgba(184,255,255,0.55)'); pg2.addColorStop(1, 'rgba(184,255,255,0)');
        ctx.fillStyle = pg2; ctx.beginPath(); ctx.arc(x, beltY, 5*S, 0, Math.PI*2); ctx.fill();
      }
      ctx.fillStyle = done ? '#e8ffff' : half ? '#c8c0ff' : '#dfe8f0';
      ctx.beginPath(); ctx.arc(x, beltY, 2*S, 0, Math.PI*2); ctx.fill();
    }
    // spark as the cutter chops the next pellet off the ribbon
    if (sinceStop < 0.1) {
      const u = sinceStop / 0.1, sxp = x0, syp = beltY - 6*S;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(220,250,255,${(1 - u).toFixed(3)})`; ctx.lineWidth = 1*S;
      for (let q = 0; q < 6; q++) {
        const a = -Math.PI*0.9 + q*Math.PI*0.36, r0 = 2*S + u*4*S, r1 = r0 + 4*S;
        ctx.beginPath(); ctx.moveTo(sxp + Math.cos(a)*r0, syp + Math.sin(a)*r0); ctx.lineTo(sxp + Math.cos(a)*r1, syp + Math.sin(a)*r1); ctx.stroke();
      }
      ctx.restore();
    }
    // cold fog drifting along the line
    if (detail) {
      for (let q = 0; q < 5; q++) {
        const p = (t*0.05 + q/5) % 1;
        const fx = x0 + p*(gx + gw - x0), fy = beltY - 2*S + Math.sin(t*0.8 + q)*2*S;
        const fgr = ctx.createRadialGradient(fx, fy, 0, fx, fy, 12*S);
        fgr.addColorStop(0, `rgba(210,240,255,${(0.14*Math.sin(p*Math.PI)).toFixed(3)})`); fgr.addColorStop(1, 'rgba(210,240,255,0)');
        ctx.fillStyle = fgr; ctx.beginPath(); ctx.ellipse(fx, fy, 14*S, 6*S, 0, 0, Math.PI*2); ctx.fill();
      }
    }
  }

  // laser target chambers: bolted flange, eight laser heads, converging beams
  chambers.forEach(([chX, chY], ci) => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(chX + 3*S, chY + 4*S, chR + 5*S, 0, Math.PI*2); ctx.fill();
    const fg0 = ctx.createRadialGradient(chX - chR*0.5, chY - chR*0.5, 1, chX, chY, chR + 5*S);
    fg0.addColorStop(0, '#aab6bc'); fg0.addColorStop(1, '#3a464c');
    ctx.fillStyle = fg0; ctx.beginPath(); ctx.arc(chX, chY, chR + 5*S, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#c8ccd0';
    for (let q = 0; q < 16; q++) { const a = q*Math.PI/8; ctx.beginPath(); ctx.arc(chX + Math.cos(a)*(chR + 2.6*S), chY + Math.sin(a)*(chR + 2.6*S), 0.9*S, 0, Math.PI*2); ctx.fill(); }
    const cg = ctx.createRadialGradient(chX - chR*0.4, chY - chR*0.4, 1, chX, chY, chR);
    cg.addColorStop(0, '#d8e4ea'); cg.addColorStop(1, '#52626a');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(chX, chY, chR, 0, Math.PI*2); ctx.fill();
    const sh = shotState[ci];
    for (let q = 0; q < 8; q++) {
      const a = q*Math.PI/4 + Math.PI/8;
      const bx0 = chX + Math.cos(a)*(chR + 12*S), by0 = chY + Math.sin(a)*(chR + 12*S);
      // laser head: a small housing pointing at the chamber
      ctx.save(); ctx.translate(bx0, by0); ctx.rotate(a);
      ctx.fillStyle = '#2e3a42'; ctx.fillRect(-2*S, -2.6*S, 7*S, 5.2*S);
      ctx.fillStyle = sh.firing ? '#ffffff' : active ? accent : '#4a5a62'; ctx.fillRect(-2.8*S, -1.2*S, 1.6*S, 2.4*S);
      ctx.restore();
      // charging: each head's lens glows brighter, a little out of step
      if (sh.charge > 0) {
        const cu = Math.min(1, sh.charge * 1.15 - q*0.02);
        if (cu > 0) {
          const lx = chX + Math.cos(a)*(chR + 9.5*S), ly = chY + Math.sin(a)*(chR + 9.5*S);
          const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, (2 + 4*cu)*S);
          lg.addColorStop(0, `rgba(200,255,255,${(0.9*cu).toFixed(3)})`); lg.addColorStop(1, 'rgba(112,240,255,0)');
          ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(lx, ly, (2 + 4*cu)*S, 0, Math.PI*2); ctx.fill();
        }
      }
    }
    ctx.fillStyle = '#0c1418'; ctx.beginPath(); ctx.arc(chX, chY, chR*0.45, 0, Math.PI*2); ctx.fill();
    // a faint ember in the target between shots
    if (active) {
      const eg2 = ctx.createRadialGradient(chX, chY, 0, chX, chY, chR*0.4);
      eg2.addColorStop(0, `rgba(112,240,255,${(0.25 + 0.35*sh.charge).toFixed(3)})`); eg2.addColorStop(1, 'rgba(112,240,255,0)');
      ctx.fillStyle = eg2; ctx.beginPath(); ctx.arc(chX, chY, chR*0.4, 0, Math.PI*2); ctx.fill();
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (sh.firing) {
      // all eight beams at once
      for (let q = 0; q < 8; q++) {
        const a = q*Math.PI/4 + Math.PI/8;
        const bx0 = chX + Math.cos(a)*(chR + 9*S), by0 = chY + Math.sin(a)*(chR + 9*S);
        ctx.strokeStyle = 'rgba(112,240,255,0.55)'; ctx.lineWidth = 3.4*S;
        ctx.beginPath(); ctx.moveTo(bx0, by0); ctx.lineTo(chX, chY); ctx.stroke();
        ctx.strokeStyle = 'rgba(240,255,255,0.95)'; ctx.lineWidth = 1.2*S;
        ctx.beginPath(); ctx.moveTo(bx0, by0); ctx.lineTo(chX, chY); ctx.stroke();
      }
    }
    if (sh.flash > 0) {
      const fr = chR*(0.6 + 1.1*sh.flash);
      const fg = ctx.createRadialGradient(chX, chY, 0, chX, chY, fr);
      fg.addColorStop(0, `rgba(255,255,255,${sh.flash.toFixed(3)})`); fg.addColorStop(0.35, `rgba(150,245,255,${(0.8*sh.flash).toFixed(3)})`); fg.addColorStop(1, 'rgba(112,240,255,0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(chX, chY, fr, 0, Math.PI*2); ctx.fill();
    }
    if (sh.shock >= 0) {
      // shockwave ring out of the chamber, and sparks thrown clear
      const u = sh.shock, rr = chR*(0.5 + 2.3*u);
      ctx.strokeStyle = `rgba(150,245,255,${(0.75*(1 - u)).toFixed(3)})`; ctx.lineWidth = (2.5 - 1.8*u)*S;
      ctx.beginPath(); ctx.arc(chX, chY, rr, 0, Math.PI*2); ctx.stroke();
      if (detail) {
        ctx.strokeStyle = `rgba(230,255,255,${(0.9*(1 - u)).toFixed(3)})`; ctx.lineWidth = 1*S;
        for (let q = 0; q < 10; q++) {
          const a = q*Math.PI/5 + ci*0.3, r0 = chR*(0.5 + 1.6*u), r1 = r0 + 4*S*(1 - u);
          ctx.beginPath(); ctx.moveTo(chX + Math.cos(a)*r0, chY + Math.sin(a)*r0); ctx.lineTo(chX + Math.cos(a)*r1, chY + Math.sin(a)*r1); ctx.stroke();
        }
      }
    }
    ctx.restore();
  });
  // robot arms, one on each side of each chamber
  chambers.forEach(([chX], ci) => [-1, 1].forEach((side, i) => {
    const bxA = chX + side*chR*1.45, byA = beltY - 12*S;
    // Folded while the belt runs; reaching in toward the chamber as its
    // lasers charge, holding for the shot, and folding back after.
    const r = ease(shotState[ci].reach);
    const idle = active ? 0.04*Math.sin(t*3 + i + ci) : 0;
    const a1 = -Math.PI/2 + side*(0.75 - 0.55*r + idle);
    const a2 = side*(1.25 - 0.85*r);
    const l1 = 14*S*Math.min(1.4, k), l2 = 10*S*Math.min(1.4, k);
    const ex = bxA + Math.cos(a1)*l1, ey = byA + Math.sin(a1)*l1;
    const tx = ex + Math.cos(a1 + a2)*l2, ty = ey + Math.sin(a1 + a2)*l2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 3.5*S; ctx.beginPath(); ctx.moveTo(bxA + 2*S, byA + 2*S); ctx.lineTo(ex + 2*S, ey + 2*S); ctx.stroke();
    ctx.strokeStyle = '#f0c040'; ctx.lineWidth = 3.5*S; ctx.beginPath(); ctx.moveTo(bxA, byA); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = '#e0e6ea'; ctx.lineWidth = 2.5*S; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.fillStyle = '#3a4a52'; ctx.beginPath(); ctx.arc(bxA, byA, 3.5*S, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#5a6a72'; ctx.beginPath(); ctx.arc(ex, ey, 1.8*S, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = shotState[ci].firing ? '#ffffff' : r > 0.5 ? accent : (active ? '#3a8a9a' : '#2a3a40');
    ctx.beginPath(); ctx.arc(tx, ty, 2*S, 0, Math.PI*2); ctx.fill();
  }));
  // glass roof: mullions, a sheen, and a soft cyan wash while running
  ctx.strokeStyle = 'rgba(220,240,250,0.22)'; ctx.lineWidth = 1.2*S;
  for (let q = 1; q < 8; q++) { ctx.beginPath(); ctx.moveTo(gx + gw*q/8, gy); ctx.lineTo(gx + gw*q/8, gy + gh); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(gx, gy + gh*0.5); ctx.lineTo(gx + gw, gy + gh*0.5); ctx.stroke();
  const sh = ctx.createLinearGradient(gx, gy, gx + gw*0.6, gy + gh);
  sh.addColorStop(0, 'rgba(255,255,255,0.12)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.03)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh; ctx.fillRect(gx, gy, gw, gh);
  if (active) {
    // the whole roof lights up on each shot — readable from across the city
    const rf = Math.max(shotState[0].flash, shotState[1].flash);
    ctx.fillStyle = `rgba(112,240,255,${(0.04 + 0.2*rf).toFixed(3)})`; ctx.fillRect(gx, gy, gw, gh);
  }
  ctx.restore();
  // roof edge: a lit top lip and shadowed bottom lip give the walls depth
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.moveTo(hlX + 4*S, hlY + 1.2*S); ctx.lineTo(hlX + hlW - 4*S, hlY + 1.2*S); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.moveTo(hlX + 4*S, hlY + hlH - 1.2*S); ctx.lineTo(hlX + hlW - 4*S, hlY + hlH - 1.2*S); ctx.stroke();

  // ── Cryogenic pellet store: frosted tubes light as it fills ──
  _wfShadow(mgX, mgY, mgW, mgH, S, 3*S);
  const mg = ctx.createLinearGradient(mgX, 0, mgX + mgW, 0);
  mg.addColorStop(0, '#46565e'); mg.addColorStop(0.5, '#5a6a72'); mg.addColorStop(1, '#2e3a40');
  ctx.fillStyle = mg; ctx.strokeStyle = '#141c20'; ctx.lineWidth = 1.5*S;
  ctx.beginPath(); ctx.roundRect(mgX, mgY, mgW, mgH, 3*S); ctx.fill(); ctx.stroke();
  const cols = k > 1.4 ? 3 : 2, rows = k > 1.4 ? 9 : 6, total = cols*rows, lit = Math.round(plasmaFill*total);
  const cw2 = (mgW - 8*S)/cols, ch2 = (mgH - 14*S)/rows, tr = Math.min(cw2, ch2)*0.36;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const idx = (rows - 1 - r)*cols + c;
    const tx0 = mgX + 4*S + cw2*(c + 0.5), ty0 = mgY + 10*S + ch2*(r + 0.5);
    ctx.fillStyle = '#10181c'; ctx.beginPath(); ctx.arc(tx0, ty0, tr + 1.5*S, 0, Math.PI*2); ctx.fill();
    if (idx < lit) {
      const tg = ctx.createRadialGradient(tx0 - tr*0.3, ty0 - tr*0.3, 0.5, tx0, ty0, tr);
      tg.addColorStop(0, on ? '#ffffff' : '#9ab8c0'); tg.addColorStop(0.6, on ? `rgba(112,240,255,${0.75 + 0.25*Math.sin(t*3 + idx)})` : '#3a7a88'); tg.addColorStop(1, on ? '#206878' : '#1e3a44');
      ctx.fillStyle = tg;
    } else ctx.fillStyle = '#24323a';
    ctx.beginPath(); ctx.arc(tx0, ty0, tr, 0, Math.PI*2); ctx.fill();
  }
  // a finished pellet lands as the belt stops: the tube it tops up flashes
  if (active && sinceStop < 0.3 && lit > 0 && lit < total) {
    const idx = lit - 1, c = idx % cols, r = rows - 1 - Math.floor(idx / cols);
    const tx0 = mgX + 4*S + cw2*(c + 0.5), ty0 = mgY + 10*S + ch2*(r + 0.5), u = sinceStop / 0.3;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const dg = ctx.createRadialGradient(tx0, ty0, 0, tx0, ty0, tr*(1.2 + 1.6*u));
    dg.addColorStop(0, `rgba(230,255,255,${(0.9*(1 - u)).toFixed(3)})`); dg.addColorStop(1, 'rgba(112,240,255,0)');
    ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(tx0, ty0, tr*(1.2 + 1.6*u), 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
  if (active && detail) {
    ctx.fillStyle = 'rgba(220,245,255,0.6)';
    for (let q = 0; q < 10; q++) ctx.fillRect(mgX + mgW*((q*0.618) % 1), mgY + mgH*((q*0.382) % 1), 1.2*S, 1.2*S);
  }
  ctx.fillStyle = on ? accent : '#3a5a60'; ctx.font = `bold ${Math.max(4, 5*S)}px Courier New`; ctx.textAlign = 'center';
  ctx.fillText(`${isDT ? 'D-T' : 'D-He3'} ${Math.round(plasmaFill*100)}%`, mgX + mgW/2, mgY + 6.5*S);

  // ── Bottom row: control room, cryo coolers, He compressor, LN2 tank ──
  // control room: roofed block with a lit window strip
  const crX = px + w*0.05, crW = w*0.17;
  _wfShadow(crX, bandY, crW, bandH, S, 3*S);
  ctx.fillStyle = '#7a8288'; ctx.strokeStyle = '#2a3034'; ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.roundRect(crX, bandY, crW, bandH, 3*S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#9aa2a8'; ctx.fillRect(crX + 3*S, bandY + 3*S, crW - 6*S, bandH*0.3);
  const nWin = 6;
  for (let q = 0; q < nWin; q++) {
    ctx.fillStyle = on ? (q % 3 === 1 ? '#9fe8ff' : '#e8f4c8') : '#2a3236';
    ctx.fillRect(crX + crW*(0.08 + q*0.145), bandY + bandH*0.55, crW*0.1, bandH*0.25);
  }
  // cryo coolers
  const nCool = 4;
  for (let q = 0; q < nCool; q++) {
    const ux = px + w*(0.26 + q*0.085), uw = w*0.07;
    _wfShadow(ux, bandY, uw, bandH, S, 3*S);
    ctx.fillStyle = '#dce8ee'; ctx.strokeStyle = '#5a6a72'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.roundRect(ux, bandY, uw, bandH, 3*S); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2a363e'; ctx.beginPath(); ctx.arc(ux + uw*0.5, bandY + bandH*0.5, Math.min(uw, bandH)*0.38, 0, Math.PI*2); ctx.fill();
    _fcFan(ux + uw*0.5, bandY + bandH*0.5, Math.min(uw, bandH)*0.34, S, t + q*0.25, on, 7);
  }
  // helium compressor skid
  const hcX = px + w*0.61, hcW = w*0.16;
  _wfShadow(hcX, bandY, hcW, bandH, S, 3*S);
  const hcg = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
  hcg.addColorStop(0, '#5a8098'); hcg.addColorStop(1, '#2a4658');
  ctx.fillStyle = hcg; ctx.strokeStyle = '#10202a'; ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.roundRect(hcX, bandY, hcW, bandH, 3*S); ctx.fill(); ctx.stroke();
  for (let q = 0; q < 2; q++) {
    const rx = hcX + hcW*(0.28 + q*0.44);
    ctx.fillStyle = '#8aa4b4'; ctx.beginPath(); ctx.roundRect(rx - hcW*0.15, bandY + bandH*0.22, hcW*0.3, bandH*0.56, bandH*0.25); ctx.fill();
    ctx.fillStyle = on ? '#60ff90' : '#2a3a30'; ctx.beginPath(); ctx.arc(rx + hcW*0.12, bandY + bandH*0.22, 1.3*S, 0, Math.PI*2); ctx.fill();
  }
  // LN2 tank lying on saddles
  const lnX = px + w*0.81, lnW = w*0.14, lnY = bandY + bandH*0.15, lnH = bandH*0.7;
  ctx.fillStyle = '#4a4e52';
  ctx.fillRect(lnX + lnW*0.18, lnY + lnH*0.8, lnW*0.1, bandH*0.2); ctx.fillRect(lnX + lnW*0.72, lnY + lnH*0.8, lnW*0.1, bandH*0.2);
  _wfShadow(lnX, lnY, lnW, lnH, S, lnH/2);
  const lng = ctx.createLinearGradient(0, lnY, 0, lnY + lnH);
  lng.addColorStop(0, '#ffffff'); lng.addColorStop(0.5, '#d4dde2'); lng.addColorStop(1, '#8a969e');
  ctx.fillStyle = lng; ctx.strokeStyle = '#4a5860'; ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.roundRect(lnX, lnY, lnW, lnH, lnH/2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3a6a8a'; ctx.font = `bold ${Math.max(4, 5*S)}px Courier New`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('LN2', lnX + lnW/2, lnY + lnH/2 + 0.4*S); ctx.textBaseline = 'alphabetic';

  // Vapour off the extruder, the coolers and the LN2 relief
  _wfSmoke(exX + exW*0.5, exY - 2*S, S*0.5, t, '240,250,255', active, 0.45);
  for (let q = 0; q < nCool; q += 2) _wfSmoke(px + w*(0.26 + q*0.085) + w*0.05, bandY - 1*S, S*0.45, t + q, '240,250,255', active, 0.45);
  _wfSmoke(lnX + lnW*0.85, lnY - 1*S, S*0.35, t + 0.7, '235,248,255', on, 0.35);
  _wfHazardStripe(px + w*0.25, hlY + hlH + 4*S, w*0.1, 3*S, S);

  if (aT)   _portPipe(aT,   S, t, { fluid: '#80ffc0', label: 'TRITIUM IN', on: !!e._tritiumLinked, out: false, flow: active && isDT });
  // HE-3 IN is capped off until the Helium-3 Separator unlocks; nothing can
  // feed it before then. A plant already piped to a separator, or still
  // burning stored helium-3 from an old save, shows it live.
  const he3Locked = typeof Progression !== 'undefined' && !Progression.isUnlocked(T.HE3SEPARATOR)
                    && !e._he3Linked && !((e._legacyHe3 || 0) > 0);
  if (aHe3) _portPipe(aHe3, S, t, { fluid: '#ffd0a0', label: 'HE-3 IN', on: !!e._he3Linked, out: false, flow: active && (!isDT || (e._heRate || 0) > 0.01), locked: he3Locked });
  if (aD2)  _portPipe(aD2, S, t, { fluid: '#ff6eb4', label: 'D₂ IN', on: !!e._hasDeuterium, out: false, flow: active });
  if (aPfc) _portBelt(aPfc, S, t, { belt: '#70f0ff', label: isDT ? 'D-T PELLETS OUT' : 'PELLETS OUT', on: !!e._plasmaConveyorOut, out: true });
  // D-He3 OUT: tagged LOCKED until the Helium-3 Separator opens the line.
  if (aHpo) _portBelt(aHpo, S, t, { belt: '#c890ff', label: he3Locked ? 'D-He3 OUT · LOCKED' : 'D-He3 OUT', on: !he3Locked && !!e._he3PelletConveyorOut, out: true });

  _wfPlate('FUSION FUEL PLANT', cx + w*0.04, py + h*0.955, S, accent, on);
  _wfLamp(px + w - 7*S, py + 7*S, S, t, accent, on);
  ctx.restore();
}

// ── Fusion startup FX, shared by the Fusion Reactor and the stellarator ──
// The ignition plays when a reactor's startup surge completes: the renderer
// spots _started flip false → true and stamps e._igniteT. Only if the reactor
// was drawn the frame before, so scrolling back to one that lit while out of
// view doesn't replay it. Render-only fields; nothing here is saved.
const FUSION_IGNITE_SECS = 4;
function _fusionIgnitePhase(e, t) {
  const seen = e._fxSeenT;
  e._fxSeenT = t;
  if (e._fxWasStarted === false && e._started && seen !== undefined && t - seen < 0.5) e._igniteT = t;
  e._fxWasStarted = !!e._started;
  if (e._igniteT === undefined) return -1;
  const p = (t - e._igniteT) / FUSION_IGNITE_SECS;
  if (p < 0 || p >= 1) { e._igniteT = undefined; return -1; }
  return p;
}
// How far through the startup surge the magnets are, 0 → 1.
const _fusionChargeFrac = (e, def) => Math.max(0, Math.min(1, (e._surgeProgress || 0) / (def.startupSurgeSeconds || 5)));

// While the surge charges: the plasma channel fills with energy, amber going
// white-hot, streams spiral in from the cryostat wall, the core swells, and
// in the last moments it all strobes. `ring()` builds the plasma channel's path.
function _fusionChargeFx(ring, cx, cy, Rp, R, t, p) {
  const TAU = Math.PI*2, u = R*0.01;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  const fl = p > 0.85 ? (Math.sin(t*40) > 0 ? 1 : 0.5) : 1;
  const wh = Math.min(1, p*1.2);
  const col = `255,${Math.round(190 + 60*wh)},${Math.round(70 + 180*wh)}`;
  ctx.strokeStyle = `rgba(${col},${((0.18 + 0.5*p)*fl).toFixed(3)})`; ctx.lineWidth = u*(4 + 12*p); ring(); ctx.stroke();
  ctx.strokeStyle = `rgba(255,250,235,${((0.25 + 0.7*p)*fl).toFixed(3)})`; ctx.lineWidth = u*(0.8 + 1.8*p);
  ctx.setLineDash([u*6, u*(10 - 7*p)]); ctx.lineDashOffset = -t*u*(40 + 300*p); ring(); ctx.stroke();
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
  const n = 3 + Math.floor(p*10);
  for (let i = 0; i < n; i++) {
    const ph = (t*(0.7 + p*1.8) + i/n) % 1, a0 = i*TAU/n + t*0.5;
    const pt = (s) => { const r = R - (R - Rp)*s, a = a0 + s*1.3; return [cx + Math.cos(a)*r, cy + Math.sin(a)*r]; };
    ctx.beginPath();
    for (let s = 0; s <= 6; s++) { const [x, y] = pt(Math.max(0, ph - 0.18) + Math.min(ph, 0.18)*s/6); s ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.strokeStyle = `rgba(${col},${(0.8*Math.sin(ph*Math.PI)*fl).toFixed(3)})`; ctx.lineWidth = u*1.4; ctx.stroke();
  }
  const cr = Rp*(0.25 + 0.4*p);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
  g.addColorStop(0, `rgba(255,240,200,${((0.2 + 0.5*p)*fl).toFixed(3)})`); g.addColorStop(1, 'rgba(255,180,60,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.fill();
  ctx.restore();
}

// The ignition itself, p 0 → 1 over FUSION_IGNITE_SECS: a white flash, the
// channel striking white-hot and cooling to the plasma's colour (`rgb`), god
// rays, three shockwaves rolling out, sparks flung off the ring and an
// anamorphic flare across the core.
function _fusionIgniteFx(ring, cx, cy, Rp, R, t, p, rgb) {
  const TAU = Math.PI*2, u = R*0.01, ease = 1 - p;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  const fa = Math.max(0, 1 - p/0.3);
  if (fa > 0) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R*1.7);
    g.addColorStop(0, `rgba(255,255,255,${(0.9*fa).toFixed(3)})`); g.addColorStop(0.4, `rgba(${rgb},${(0.45*fa).toFixed(3)})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R*1.7, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = `rgba(${rgb},${(0.6*ease).toFixed(3)})`; ctx.lineWidth = u*(40*ease + 6); ring(); ctx.stroke();
  ctx.strokeStyle = `rgba(255,255,255,${(0.95*ease*ease).toFixed(3)})`; ctx.lineWidth = u*(16*ease + 2); ring(); ctx.stroke();
  const ra = 0.55*ease*ease;
  if (ra > 0.01) for (let i = 0; i < 18; i++) {
    const a = i*TAU/18 + p*0.5 + (i % 2)*0.09;
    const len = R*(0.5 + 1.1*Math.min(1, p*3))*(0.7 + 0.3*Math.sin(i*2.3));
    const x0 = cx + Math.cos(a)*Rp*0.4, y0 = cy + Math.sin(a)*Rp*0.4, x1 = cx + Math.cos(a)*len, y1 = cy + Math.sin(a)*len;
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, `rgba(255,255,255,${ra.toFixed(3)})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.strokeStyle = g; ctx.lineWidth = u*(i % 2 ? 2.5 : 5); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  for (let q = 0; q < 3; q++) {
    const pq = (p - q*0.12)/0.7;
    if (pq <= 0 || pq >= 1) continue;
    const r = Rp + (R*1.75 - Rp)*(1 - (1 - pq)*(1 - pq));
    ctx.strokeStyle = `rgba(${q ? rgb : '255,255,255'},${(0.75*Math.pow(1 - pq, 1.5)).toFixed(3)})`; ctx.lineWidth = u*(12*(1 - pq) + 1);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  }
  const sp = 1 - ease*ease;
  for (let i = 0; i < 48; i++) {
    const rnd = (n) => { const x = Math.sin(i*12.9898 + n*78.233)*43758.5453; return x - Math.floor(x); };
    const a = rnd(1)*TAU, v = 0.35 + rnd(2)*0.9, d = Rp + R*1.4*v*sp, len = u*(7*ease + 1.5);
    const al = ease*(0.6 + 0.4*rnd(3));
    ctx.strokeStyle = i % 3 ? `rgba(${rgb},${al.toFixed(3)})` : `rgba(255,255,255,${al.toFixed(3)})`; ctx.lineWidth = u*(0.8 + rnd(4));
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a)*(d - len), cy + Math.sin(a)*(d - len)); ctx.lineTo(cx + Math.cos(a)*d, cy + Math.sin(a)*d); ctx.stroke();
  }
  if (p < 0.5) {
    const fl = 1 - p*2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R*1.4*fl + u);
    g.addColorStop(0, `rgba(255,255,255,${(0.8*fl).toFixed(3)})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.06); ctx.beginPath(); ctx.arc(0, 0, R*1.4*fl + u, 0, TAU); ctx.fill(); ctx.restore();
  }
  ctx.restore();
}

function renderHulkingFusionReactor(e, px, py, t) {
  // Tokamak on an octagonal shield pad: a cryostat ringed by 18 toroidal
  // field coils around a braided plasma torus and a central solenoid, with
  // two neutral-beam injectors, two RF antenna launchers, diagnostic ports
  // and four corner capacitor banks. Running, it comes alive: a floor bloom,
  // three helical plasma strands twisting round the torus, ions streaking
  // along it with trails, a hot spot with a lens flare, a travelling coil
  // chase, lightning between coils and plasma, and magnetic shock rings
  // rolling outward. While the startup surge charges the magnets the banks
  // fill and flash amber and the coils light up one by one. Feed belt and
  // outlet pipe follow HulkingFusionReactorSystem.getStubs(). No backdrop.
  const def = EntityDefs[T.HULKINGFUSIONREACTOR];
  const w = (e.width || def.width) * TILE, h = (e.height || def.height) * TILE;
  const cx = px + w / 2, cy = py + h / 2;
  const on  = e.powered;
  const gen = !!e._generating;
  // Charging = the startup surge is being paid, which only happens once the
  // magnets are cold and full of helium (HulkingFusionReactorSystem.magnetsReady).
  const charging = on && !e._started && !!e._magnetsReady;
  const chargeP = charging ? _fusionChargeFrac(e, def) : 0;
  const igniteP = _fusionIgnitePhase(e, t);        // -1 unless the ignition is playing
  const K = e._magnetK;                       // undefined on a ghost
  const cold = K !== undefined && K < 20;
  const venting = (e._quenchVent || 0) > 0;
  const hbFill = Math.min(1, (e._highBeta || 0) / (def.highBetaCapacity || 1000));
  const S = TILE / 40;
  const k = Math.min(w, h) / (8*TILE);              // detail scale, 1 at the old 8×8
  const accent = '#40c0ff';
  ctx.save();

  const m = Math.min(w, h);
  const R  = m*0.36;          // cryostat radius
  const Rp = m*0.24;          // plasma ring radius
  const tw = 16*S*k;          // torus tube half-width

  const st = (typeof HulkingFusionReactorSystem !== 'undefined') ? HulkingFusionReactorSystem.getStubs(e) : null;
  const aIn  = st && _portAnchor(e, px, py, w, h, st.plasmaIn);
  const aOut = st && _portAnchor(e, px, py, w, h, st.highBetaOut);
  const aCryo = st && st.cryoIn && _portAnchor(e, px, py, w, h, st.cryoIn);
  const aAsh  = st && st.ashOut && _portAnchor(e, px, py, w, h, st.ashOut);
  const aBlk  = st && st.blanketIn && _portAnchor(e, px, py, w, h, st.blanketIn);
  const aTrit = st && st.tritiumOut && _portAnchor(e, px, py, w, h, st.tritiumOut);
  // Main outlet: steam on D-T, the ion stream on D-He3.
  const isDT = (e._fuelMode || 'dt') === 'dt';
  const outCol = isDT ? '#d8e0ff' : '#b478ff';
  const toRing = (a) => { const [x, y] = _portIn(a, 14*S); const an = Math.atan2(y - cy, x - cx); return [cx + Math.cos(an)*(R - 4*S), cy + Math.sin(an)*(R - 4*S)]; };

  // ── Shield pad (octagon) ──
  const pr = m*0.47;
  const octo = (r) => { ctx.beginPath(); for (let q = 0; q < 8; q++) { const a = Math.PI/8 + q*Math.PI/4; const X = cx + Math.cos(a)*r, Y = cy + Math.sin(a)*r; q ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.closePath(); };
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.save(); ctx.translate(6*S, 8*S); octo(pr); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#3a4048'; octo(pr); ctx.fill();
  ctx.strokeStyle = '#1a1e24'; ctx.lineWidth = 2*S; ctx.stroke();
  ctx.fillStyle = '#2c3138'; octo(pr*0.93); ctx.fill();
  ctx.strokeStyle = 'rgba(216,168,32,0.55)'; ctx.lineWidth = 3*S; ctx.setLineDash([10*S, 8*S]); octo(pr*0.965); ctx.stroke(); ctx.setLineDash([]);

  // ── Floor bloom ──
  if (gen || charging) {
    const pulse = gen ? 0.5 + 0.2*Math.sin(t*2.3) : 0.25 + 0.15*Math.sin(t*9);
    const fg = ctx.createRadialGradient(cx, cy, Rp*0.3, cx, cy, pr);
    fg.addColorStop(0, gen ? `rgba(120,160,255,${pulse*0.55})` : `rgba(255,200,80,${pulse*0.4})`);
    fg.addColorStop(0.55, gen ? `rgba(90,60,220,${pulse*0.25})` : `rgba(255,150,40,${pulse*0.15})`);
    fg.addColorStop(1, 'rgba(40,20,120,0)');
    ctx.fillStyle = fg; octo(pr*0.93); ctx.fill();
  }

  // ── Feed belt and outlet pipe ──
  if (aIn)  { const [ix, iy] = toRing(aIn);  const [x0, y0] = _portIn(aIn, 14*S);  _wfConveyor(x0, y0, ix, iy, S, t, gen, '#4a9ab0'); }
  if (aOut) { const [ox, oy] = toRing(aOut); const [x0, y0] = _portIn(aOut, 14*S); _wfPipe([[ox, oy], [x0, y0]], S, t, gen, isDT ? 'rgba(216,224,255,0.95)' : 'rgba(180,120,255,0.95)'); }
  if (aBlk) { const [ix, iy] = toRing(aBlk); const [x0, y0] = _portIn(aBlk, 14*S); _wfConveyor(x0, y0, ix, iy, S, t, gen && isDT && !!e._hasBlanket, '#c0a0ff'); }
  if (aTrit) { const [ix, iy] = toRing(aTrit); const [x0, y0] = _portIn(aTrit, 14*S); _wfPipe([[ix, iy], [x0, y0]], S, t, !!e._tritiumPipeOut, 'rgba(128,255,192,0.95)'); }

  // ── Cryo lines from the corners (liquid helium ring main) ──
  [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]].forEach(([fx, fy]) => {
    const x0 = px + w*fx, y0 = py + h*fy, an = Math.atan2(y0 - cy, x0 - cx);
    _wfPipe([[x0, y0], [cx + Math.cos(an)*R, cy + Math.sin(an)*R]], S, t, !!e._cryoRunning || cold, 'rgba(232,252,255,0.95)');
  });
  // LHe IN feed and HE ASH OUT return, from their stubs into the cryostat
  if (aCryo) { const [ix, iy] = toRing(aCryo); const [x0, y0] = _portIn(aCryo, 14*S); _wfPipe([[x0, y0], [ix, iy]], S, t, !!e._cryoRunning, 'rgba(232,252,255,0.95)'); }
  if (aAsh)  { const [ix, iy] = toRing(aAsh);  const [x0, y0] = _portIn(aAsh, 14*S);  _wfPipe([[ix, iy], [x0, y0]], S, t, !!e._ashPipeOut, 'rgba(240,184,255,0.95)'); }

  // ── Capacitor banks (corners) ──
  const cbw = w*0.15, cbh = h*0.15;
  const chargeT = charging ? chargeP : (gen ? 1 : 0);
  [[px + w*0.03, py + h*0.03], [px + w*0.82, py + h*0.03], [px + w*0.03, py + h*0.82], [px + w*0.82, py + h*0.82]].forEach(([bx, by], i) => {
    _wfShadow(bx, by, cbw, cbh, S, 3*S);
    ctx.fillStyle = '#3a4450'; ctx.strokeStyle = '#141a20'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.roundRect(bx, by, cbw, cbh, 3*S); ctx.fill(); ctx.stroke();
    const nc = 3, nr = 2;
    for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
      const ccx = bx + cbw*(c + 0.5)/nc, ccy = by + cbh*0.1 + cbh*0.62*(r + 0.5)/nr, cr = Math.min(cbw/nc, cbh*0.62/nr)*0.36;
      const g = ctx.createRadialGradient(ccx - cr*0.4, ccy - cr*0.4, 0.5, ccx, ccy, cr);
      g.addColorStop(0, '#e0e8f0'); g.addColorStop(1, '#5a6878');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ccx, ccy, cr, 0, Math.PI*2); ctx.fill();
      const glow = charging ? (Math.sin(t*10 + i + c) > 0 ? '#ffd040' : '#6a5010') : (gen ? accent : '#2a3440');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(ccx, ccy, cr*0.35, 0, Math.PI*2); ctx.fill();
    }
    // charge bar
    const bx0 = bx + cbw*0.1, by0 = by + cbh*0.8, bw0 = cbw*0.8, bh0 = cbh*0.1;
    ctx.fillStyle = '#0c1014'; ctx.fillRect(bx0, by0, bw0, bh0);
    const fillv = gen ? 0.75 + 0.25*Math.sin(t*6 + i) : chargeT;
    ctx.fillStyle = charging ? '#ffc030' : (gen ? accent : '#2a3440');
    ctx.fillRect(bx0, by0, bw0*fillv, bh0);
  });

  // ── Field Core rack (render_field_core.js), in the clear strip between
  // the cryostat and the pad's edge: the bottom, or the right side when
  // the mid-face ports turn to the top and bottom ──
  if (typeof renderFieldCoreRack === 'function') {
    const len = m*0.3, th = m*0.05, off = R + m*0.012;
    if ((e._rotation || 0) % 2) renderFieldCoreRack(e, cx + off, cy - len/2, len, th, true, S, t);
    else renderFieldCoreRack(e, cx - len/2, cy + off, len, th, false, S, t);
  }

  // ── Neutral beam injectors (NW, SE) and RF launchers (NE, SW) ──
  const nbiR = R + 18*S*k;
  [Math.PI*1.25, Math.PI*0.25].forEach((a) => {
    const x0 = cx + Math.cos(a)*nbiR, y0 = cy + Math.sin(a)*nbiR;
    const x1 = cx + Math.cos(a)*(R - 6*S),  y1 = cy + Math.sin(a)*(R - 6*S);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 17*S*k; ctx.beginPath(); ctx.moveTo(x0 + 5*S, y0 + 6*S); ctx.lineTo(x1 + 5*S, y1 + 6*S); ctx.stroke();
    ctx.strokeStyle = '#5a6470'; ctx.lineWidth = 15*S*k; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = '#9aa4b0'; ctx.lineWidth = 6*S*k; ctx.stroke();
    ctx.fillStyle = '#3a444e'; ctx.beginPath(); ctx.arc(x0, y0, 11*S*k, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#141a20'; ctx.lineWidth = S; ctx.stroke();
    if (gen) {
      ctx.fillStyle = `rgba(160,240,255,${0.5 + 0.4*Math.sin(t*8)})`; ctx.beginPath(); ctx.arc(x0, y0, 4*S*k, 0, Math.PI*2); ctx.fill();
    }
  });
  [Math.PI*1.75, Math.PI*0.75].forEach((a) => {
    const x0 = cx + Math.cos(a)*(R + 4*S*k), y0 = cy + Math.sin(a)*(R + 4*S*k);
    ctx.save(); ctx.translate(x0, y0); ctx.rotate(a);
    ctx.fillStyle = '#4a5260'; ctx.strokeStyle = '#141a20'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.roundRect(-12*S*k, -14*S*k, 24*S*k, 28*S*k, 3*S); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = gen ? `rgba(255,120,220,${0.5 + 0.4*Math.sin(t*14)})` : '#6a5a70'; ctx.lineWidth = 1.5*S;
    for (let q = -2; q <= 2; q++) { ctx.beginPath(); ctx.moveTo(-8*S*k, q*5*S*k); ctx.lineTo(8*S*k, q*5*S*k); ctx.stroke(); }
    ctx.restore();
  });

  // ── Cryostat ──
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.arc(cx + 8*S, cy + 10*S, R, 0, Math.PI*2); ctx.fill();
  const cg = ctx.createRadialGradient(cx - R*0.35, cy - R*0.35, R*0.1, cx, cy, R);
  cg.addColorStop(0, '#7a8694'); cg.addColorStop(0.7, '#3a4450'); cg.addColorStop(1, '#1e242c');
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#8a96a4'; ctx.lineWidth = 2*S; ctx.stroke();
  // Frost on the cryostat skin while the magnets are held cold — thicker
  // the colder they are.
  if (cold) {
    const fa = Math.min(1, (20 - K) / 15);
    ctx.strokeStyle = `rgba(235,250,255,${(0.55*fa).toFixed(3)})`; ctx.lineWidth = 6*S*k;
    ctx.setLineDash([3*S, 4*S]); ctx.beginPath(); ctx.arc(cx, cy, R - 3*S, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = `rgba(220,245,255,${(0.7*fa).toFixed(3)})`;
    for (let q = 0; q < 48; q++) { const a = q*2.399, rr = R*(0.72 + ((q*0.618) % 1)*0.26); ctx.fillRect(cx + Math.cos(a)*rr, cy + Math.sin(a)*rr, 1.5*S, 1.5*S); }
  }
  ctx.fillStyle = '#20262e';
  for (let q = 0; q < 36; q++) { const a = q*Math.PI/18; ctx.beginPath(); ctx.arc(cx + Math.cos(a)*(R - 5*S), cy + Math.sin(a)*(R - 5*S), 1.6*S, 0, Math.PI*2); ctx.fill(); }
  // diagnostic ports on the rim
  for (let q = 0; q < 8; q++) {
    const a = q*Math.PI/4 + Math.PI/8;
    ctx.save(); ctx.translate(cx + Math.cos(a)*(R - 14*S*k), cy + Math.sin(a)*(R - 14*S*k)); ctx.rotate(a);
    ctx.fillStyle = '#566270'; ctx.fillRect(-5*S*k, -4*S*k, 10*S*k, 8*S*k);
    ctx.fillStyle = gen ? (Math.sin(t*4 + q*1.3) > 0 ? '#80ffb0' : '#2a5a40') : (on ? '#ffb030' : '#302820');
    ctx.beginPath(); ctx.arc(0, 0, 1.6*S*k, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
  // poloidal field coil rings
  ctx.strokeStyle = '#6a7684'; ctx.lineWidth = 3*S;
  [Rp + tw + 14*S*k, Rp - tw - 8*S*k].forEach(r => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke(); });

  // ── Plasma torus: vacuum vessel channel ──
  ctx.strokeStyle = '#06080e'; ctx.lineWidth = tw*2;
  ctx.beginPath(); ctx.arc(cx, cy, Rp, 0, Math.PI*2); ctx.stroke();

  // ── Toroidal field coils (slim slabs across the vessel, seen from above) ──
  const NC = 16;
  const chase = gen ? (t*6) % NC : charging ? chargeP*NC : -1;
  for (let q = 0; q < NC; q++) {
    const a = q*Math.PI*2/NC;
    ctx.save(); ctx.translate(cx + Math.cos(a)*Rp, cy + Math.sin(a)*Rp); ctx.rotate(a);
    const cl = tw*2 + 22*S*k, cw = 6.5*S*k;
    const g = ctx.createLinearGradient(0, -cw/2, 0, cw/2);
    g.addColorStop(0, '#dce2ea'); g.addColorStop(0.5, '#8a96a4'); g.addColorStop(1, '#3a4450');
    ctx.fillStyle = g; ctx.strokeStyle = '#141a20'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.roundRect(-cl/2, -cw/2, cl, cw, cw*0.4); ctx.fill(); ctx.stroke();
    let col = '#b87040';
    if (gen) {
      const d = Math.min(Math.abs(q - chase), NC - Math.abs(q - chase));
      col = `rgba(${d < 1.5 ? '220,250,255' : '90,200,255'},${d < 1.5 ? 1 : 0.5 + 0.3*Math.sin(t*4 - q*0.4)})`;
    } else if (charging) col = q <= chase ? '#ffd040' : '#5a4418';
    ctx.fillStyle = col;
    ctx.fillRect(-cl/2 + 4*S, -1*S*k, cl - 8*S, 2*S*k);
    ctx.restore();
  }

  // ── Plasma (drawn over the coils, additive, so it shines between and
  // through them) ──
  if (gen) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // bloom
    ctx.strokeStyle = `rgba(90,140,255,${0.18 + 0.08*Math.sin(t*2.4)})`; ctx.lineWidth = tw*3.4;
    ctx.beginPath(); ctx.arc(cx, cy, Rp, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = `rgba(150,110,255,${0.22 + 0.1*Math.sin(t*3.1 + 1)})`; ctx.lineWidth = tw*2;
    ctx.beginPath(); ctx.arc(cx, cy, Rp, 0, Math.PI*2); ctx.stroke();
    // three helical strands braided round the torus, twisting as they spin
    const N = 120, twists = 7;
    [[195, 0], [265, 2.094], [300, 4.189]].forEach(([hue, ph], si) => {
      ctx.beginPath();
      for (let q = 0; q <= N; q++) {
        const a = q*Math.PI*2/N;
        const r = Rp + tw*0.7*Math.sin(a*twists + ph - t*(3 + si*0.4));
        const X = cx + Math.cos(a + t*0.35)*r, Y = cy + Math.sin(a + t*0.35)*r;
        q ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      }
      ctx.strokeStyle = `hsla(${hue},100%,72%,0.75)`; ctx.lineWidth = 3*S*k;
      ctx.stroke();
      ctx.strokeStyle = `hsla(${hue},100%,60%,0.25)`; ctx.lineWidth = 8*S*k;
      ctx.stroke();
    });
    // white-hot core filament
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2*S*k;
    ctx.setLineDash([22*S*k, 12*S*k]); ctx.lineDashOffset = -t*120*S;
    ctx.beginPath(); ctx.arc(cx, cy, Rp, 0, Math.PI*2); ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    // ions streaking round with trails
    for (let q = 0; q < 22; q++) {
      const sp = 1.4 + (q % 5)*0.35;
      const a = t*sp + q*2.39;
      const r = Rp + tw*0.55*Math.sin(q*1.7 + t*2);
      const g = ctx.createLinearGradient(cx + Math.cos(a - 0.35)*r, cy + Math.sin(a - 0.35)*r, cx + Math.cos(a)*r, cy + Math.sin(a)*r);
      g.addColorStop(0, 'rgba(160,220,255,0)'); g.addColorStop(1, 'rgba(235,250,255,0.95)');
      ctx.strokeStyle = g; ctx.lineWidth = 1.8*S*k;
      ctx.beginPath(); ctx.arc(cx, cy, r, a - 0.35, a); ctx.stroke();
    }
    // hot spot + lens flare
    const hs = t*1.1, hx = cx + Math.cos(hs)*Rp, hy = cy + Math.sin(hs)*Rp, fl = 0.7 + 0.3*Math.sin(t*7);
    const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, tw*2.4);
    hg.addColorStop(0, `rgba(255,255,255,${0.9*fl})`); hg.addColorStop(0.3, `rgba(170,210,255,${0.5*fl})`); hg.addColorStop(1, 'rgba(120,120,255,0)');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hx, hy, tw*2.4, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = `rgba(220,240,255,${0.55*fl})`; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.moveTo(hx - tw*3.2, hy); ctx.lineTo(hx + tw*3.2, hy); ctx.moveTo(hx, hy - tw*3.2); ctx.lineTo(hx, hy + tw*3.2); ctx.stroke();
    ctx.restore();
  } else if (charging) {
    _fusionChargeFx(() => { ctx.beginPath(); ctx.arc(cx, cy, Rp, 0, Math.PI*2); }, cx, cy, Rp, R, t, chargeP);
  } else if (on) {
    ctx.strokeStyle = 'rgba(64,120,180,0.35)'; ctx.lineWidth = 6*S*k;
    ctx.beginPath(); ctx.arc(cx, cy, Rp, 0, Math.PI*2); ctx.stroke();
  }

  // ── Central solenoid ──
  const cs = Rp*0.42;
  const sg = ctx.createRadialGradient(cx - cs*0.4, cy - cs*0.4, 1, cx, cy, cs);
  sg.addColorStop(0, '#e8eef4'); sg.addColorStop(1, '#4a5664');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cx, cy, cs, 0, Math.PI*2); ctx.fill();
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(gen ? t*0.8 : 0);
  ctx.strokeStyle = 'rgba(30,40,50,0.45)'; ctx.lineWidth = S;
  for (let q = 0; q < 16; q++) { ctx.rotate(Math.PI/8); ctx.beginPath(); ctx.moveTo(cs*0.35, 0); ctx.lineTo(cs*0.95, 0); ctx.stroke(); }
  ctx.restore();
  if (gen) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-t*1.6);
    ctx.strokeStyle = 'rgba(160,230,255,0.75)'; ctx.lineWidth = 1.6*S;
    for (let q = 0; q < 6; q++) { ctx.beginPath(); ctx.arc(0, 0, cs*0.7, q*Math.PI/3, q*Math.PI/3 + 0.6); ctx.stroke(); }
    ctx.restore();
  }
  const coreA = gen ? 0.7 + 0.3*Math.sin(t*5) : 1;
  ctx.fillStyle = gen ? `rgba(160,230,255,${coreA})` : (charging ? '#ffd040' : '#2a3440');
  ctx.beginPath(); ctx.arc(cx, cy, cs*0.3, 0, Math.PI*2); ctx.fill();

  if (gen) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // solenoid energy spokes flickering out to the torus
    for (let q = 0; q < 6; q++) {
      if (Math.sin(t*9 + q*2.7) < 0.55) continue;
      const a = q*Math.PI/3 + t*0.5;
      ctx.strokeStyle = 'rgba(150,220,255,0.55)'; ctx.lineWidth = 1.5*S*k;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a)*cs*0.3, cy + Math.sin(a)*cs*0.3); ctx.lineTo(cx + Math.cos(a)*(Rp - tw), cy + Math.sin(a)*(Rp - tw)); ctx.stroke();
    }
    // magnetic shock rings rolling outward
    for (let q = 0; q < 2; q++) {
      const p = ((t/2.6) + q*0.5) % 1;
      const r = Rp + tw + p*(R*1.22 - Rp - tw);
      ctx.strokeStyle = `rgba(140,190,255,${0.55*(1 - p)*(1 - p)})`; ctx.lineWidth = (7 - 5*p)*S*k;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
    }
    // counter-rotating field lines
    ctx.lineWidth = S;
    [Rp + tw + 6*S*k, Rp - tw - 3*S*k].forEach((r, i) => {
      ctx.strokeStyle = `rgba(120,200,255,${0.35 + 0.2*Math.sin(t*3 + i)})`;
      ctx.setLineDash([8*S*k, 10*S*k]); ctx.lineDashOffset = (i ? 1 : -1)*t*50*S;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
    });
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    // neutral beams firing into the plasma
    [Math.PI*1.25, Math.PI*0.25].forEach((a) => {
      const x0 = cx + Math.cos(a)*nbiR, y0 = cy + Math.sin(a)*nbiR;
      ctx.strokeStyle = 'rgba(160,240,255,0.85)'; ctx.lineWidth = 2*S*k;
      ctx.setLineDash([6*S*k, 7*S*k]); ctx.lineDashOffset = -t*80*S;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(cx + Math.cos(a)*Rp, cy + Math.sin(a)*Rp); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    });
    // lightning between the coils and the plasma
    for (let i = 0; i < 6; i++) {
      const seed = Math.floor(t*9 + i*37);
      if (seed % 3 !== 0) continue;
      const rnd = (n) => { const x = Math.sin(seed*12.9898 + n*78.233)*43758.5453; return x - Math.floor(x); };
      const a0 = rnd(1)*Math.PI*2, a1 = a0 + (rnd(2) - 0.5)*0.7;
      const r0 = Rp + tw*0.6, r1 = R - 3*S;
      let x = cx + Math.cos(a0)*r0, y = cy + Math.sin(a0)*r0;
      const x1 = cx + Math.cos(a1)*r1, y1 = cy + Math.sin(a1)*r1;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 1; s <= 5; s++) {
        const f = s/5;
        const jx = s < 5 ? (rnd(3 + s) - 0.5)*14*S*k : 0, jy = s < 5 ? (rnd(9 + s) - 0.5)*14*S*k : 0;
        ctx.lineTo(cx + Math.cos(a0 + (a1 - a0)*f)*(r0 + (r1 - r0)*f) + jx, cy + Math.sin(a0 + (a1 - a0)*f)*(r0 + (r1 - r0)*f) + jy);
      }
      ctx.strokeStyle = 'rgba(120,180,255,0.35)'; ctx.lineWidth = 5*S; ctx.stroke();
      ctx.strokeStyle = 'rgba(230,248,255,0.95)'; ctx.lineWidth = 1.4*S; ctx.stroke();
    }
    ctx.restore();
  } else if (charging) {
    // startup sparks jumping between neighbouring coils
    const seed = Math.floor(t*14);
    if (seed % 2 === 0) {
      const q = seed % NC, a0 = q*Math.PI*2/NC, a1 = (q + 1)*Math.PI*2/NC, r = Rp + tw + 10*S*k;
      ctx.strokeStyle = 'rgba(255,220,120,0.9)'; ctx.lineWidth = 1.3*S;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a0)*r, cy + Math.sin(a0)*r);
      ctx.lineTo(cx + Math.cos((a0 + a1)/2)*(r + 8*S), cy + Math.sin((a0 + a1)/2)*(r + 8*S));
      ctx.lineTo(cx + Math.cos(a1)*r, cy + Math.sin(a1)*r); ctx.stroke();
    }
  }

  // ── Field Core field: layered per live core, burst on install (render_field_core.js) ──
  if (typeof renderFieldCoreAura === 'function')
    renderFieldCoreAura(e, cx, cy, R, (sign, extra) => { ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, Rp + sign*(tw + extra)), 0, Math.PI*2); }, S, k, t);

  // ── Ignition: the flash as the surge completes and the plasma lights ──
  if (igniteP >= 0) _fusionIgniteFx(() => { ctx.beginPath(); ctx.arc(cx, cy, Rp, 0, Math.PI*2); }, cx, cy, Rp, R, t, igniteP, '140,190,255');

  if (aIn)  _portBelt(aIn,  S, t, { belt: '#70f0ff', label: 'PELLETS IN', on: !!e._hasPlasma, out: false });
  if (aOut) _portPipe(aOut, S, t, { fluid: outCol, label: isDT ? 'STEAM OUT' : 'ION OUT', on: gen, out: true, flow: gen });
  if (aBlk) _portBelt(aBlk, S, t, { belt: '#c0a0ff', label: 'Li COMPOUND IN', on: !!e._hasBlanket, out: false });
  if (aTrit) _portPipe(aTrit, S, t, { fluid: '#80ffc0', label: 'TRITIUM OUT', on: !!e._tritiumPipeOut, out: true, flow: !!e._tritiumPipeOut });
  if (aCryo) _portPipe(aCryo, S, t, { fluid: '#e8fcff', label: 'LHe IN',    on: !!e._cryoLinked, out: false, flow: !!e._cryoRunning });
  if (aAsh)  _portPipe(aAsh,  S, t, { fluid: '#f0b8ff', label: 'HE ASH OUT', on: !!e._ashPipeOut, out: true, flow: !!e._ashPipeOut });

  // ── Quench: helium blasting out of the relief vent ──
  if (venting) {
    const p = 1 - e._quenchVent / 4;                    // 0 → 1 over the plume
    const vx = cx + R*0.7, vy = cy - R*0.7;
    // A narrow, fast jet that widens into cold vapour: soft radial puffs
    // (no hard-edged discs), capped in size so a big reactor doesn't throw
    // a giant white blob over its neighbours. Cold gas hugs the ground, so
    // the puffs also sag as they age.
    const kk = Math.min(k, 1.6);
    ctx.save();
    // Hot-cold jet core right at the nozzle.
    const jl = (30 + 30*Math.sin(t*22))*S*kk*(1 - p*0.7);
    const jg = ctx.createLinearGradient(vx, vy, vx + jl*0.7, vy - jl*0.7);
    jg.addColorStop(0, 'rgba(220,245,255,0.85)'); jg.addColorStop(1, 'rgba(180,225,255,0)');
    ctx.strokeStyle = jg; ctx.lineWidth = 3.2*S*kk; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx + jl*0.7, vy - jl*0.7); ctx.stroke();
    for (let q = 0; q < 16; q++) {
      const ph = (p*1.6 + q/16) % 1;
      const a = -Math.PI/4 + Math.sin(q*3.1)*0.35 + Math.sin(t*3 + q)*0.08;
      const dist = ph*46*S*kk;
      const x = vx + Math.cos(a)*dist + Math.sin(q*1.9)*ph*6*S*kk;
      const y = vy + Math.sin(a)*dist + ph*ph*16*S*kk;
      const r = (4 + ph*21)*S*kk;
      const al = Math.min(1, ph*7)*(1 - ph)*(1 - p*0.55)*0.75;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(235,248,255,${al.toFixed(3)})`);
      g.addColorStop(0.5, `rgba(190,225,245,${(al*0.45).toFixed(3)})`);
      g.addColorStop(1, 'rgba(170,210,235,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  _wfPlate('FUSION REACTOR', cx, py + h*0.03, S, accent, on);
  const plate = venting ? 'MAGNET QUENCH'
              : igniteP >= 0 && igniteP < 0.6 ? 'IGNITION'
              : charging ? `MAGNETS CHARGING ${Math.round(chargeP*100)}%`
              : e._started && K !== undefined && K > 4.6 ? `MAGNETS WARMING ${K.toFixed(1)} K`
              : !e._started && K !== undefined && !e._magnetsReady ? (K > 5 ? `COOLING DOWN ${K < 20 ? K.toFixed(1) : Math.round(K)} K` : 'FILLING HELIUM')
              : isDT ? (gen ? `D-T · STEAM ${e._steamOutput || 0}` : 'D-T · IDLE')
              : `D-He3 · ION STREAM ${Math.round(hbFill*100)}%`;
  const plateCol = venting || (e._started && K > 6) ? '#ff5040' : igniteP >= 0 && igniteP < 0.6 ? '#ffffff' : charging ? '#ffd040' : (!e._started && K !== undefined) ? '#b8f0ff' : accent;
  _wfPlate(plate, cx, py + h*0.97, S, plateCol, on);
  _wfLamp(cx + 70*S, py + h*0.03, S, t, gen ? accent : (on ? '#ffb030' : '#ff4040'), true);
  ctx.restore();
}

function renderMHDDeceleratorRing(e, px, py, t) {
  // Linear MHD channel on a concrete compound: a ringed inlet nozzle with a
  // turbo pump, then the plasma channel seen through its viewport strip,
  // wound with copper magnet coils on bolted clamps, cooled by a twin helium
  // header. Copper busways on porcelain standoffs take the current up to
  // chopper cabinets and an inverter hall with its switchyard, and the
  // bottom band holds the cryo plant, the radiator deck and a harmonic
  // filter yard; the ribbed diffuser glows at the far end. Drawn in
  // its unrotated frame, then rotated/mirrored so the inlet always faces the
  // ION IN stub (MHDDeceleratorRingSystem.getStubs, same axis row).
  const def = EntityDefs[T.MHDRING];
  const rot = e._rotation || 0;
  const w = (e.width || def.width) * TILE, h = (e.height || def.height) * TILE;
  const L = (rot % 2) ? h : w, B = (rot % 2) ? w : h;   // unrotated length / breadth
  const on  = e.powered;
  const gen = !!e._generating;
  const S = TILE / 40;
  const k = B / (4*TILE);                              // cross-section scale, 1 at the old 12×4
  const accent = '#60d0ff';
  const D = Math.floor(B / TILE / 2)*TILE + TILE/2;    // duct axis on the stub row
  ctx.save();

  ctx.save();
  if (rot === 1)      { ctx.translate(px + w, py); ctx.rotate(Math.PI/2); }
  else if (rot === 2) { ctx.translate(px + w, py); ctx.scale(-1, 1); }
  else if (rot === 3) { ctx.translate(px, py + h); ctx.rotate(-Math.PI/2); }
  else                { ctx.translate(px, py); }

  // Detail drawn with the plant kit in render_advanced_fusion.js (_afr*),
  // at U = 1.92 px on the 38×14 ring, scaled with the cross-section.
  const U = 0.55 * S * k;
  const TAU = Math.PI * 2;
  const d0 = 44*S*k, d1 = L - 44*S*k, dr = 31*U;
  const busY0 = D - 72*U, busY1 = D + 72*U;
  // The old 12×4 ring has no room for the lower bus and the bottom band,
  // so only the resized ring carries them.
  const wide = k > 1.3;
  const lhe = 'rgba(220,245,255,0.95)';
  const cryoA = D + 58*U, cryoB = D + 65*U;
  const busX0 = 90*S*Math.min(1.4, k), busX1 = L - 80*S*Math.min(1.4, k);
  const span = d1 - d0, nM = Math.max(9, Math.round(span / (30*U))), pitch = span / nM, mw = pitch * 0.44;
  const mTop = D - 54*U, mH = 108*U;
  const modX = (q) => d0 + pitch*(q + 0.5);

  // ── Compound slab ──
  _afrSlab(3*U, 3*U, L - 6*U, B - 6*U, U, 5);

  // ── Top band: control building, chopper cabinets, inverter yard ──
  const tb0 = 10*U, tb1 = busY0 - 12*U;
  if (tb1 - tb0 > 20*U) {
    _afrRoof(12*U, tb0, L*0.15, tb1 - tb0, U, t, {
      skylights: [[0.08, 0.18, 0.5, 0.3]], glow: on ? 'rgba(150,215,255,0.28)' : null,
      units: [[0.75, 0.32, 0.42]], vents: [[0.12, 0.8], [0.3, 0.8], [0.48, 0.8], [0.75, 0.82]],
      windows: true, lit: on, spin: on });
    // chopper cabinets feeding the top bus, one each side of the name plate
    const cw = 46*U, ch = (tb1 - tb0) * 0.66;
    for (const off of [-75*U, 75*U]) {
      const cx0 = L/2 + off - cw/2;
      if (cx0 < L*0.16 || cx0 + cw > L*0.71 - 4*U) continue;
      ctx.strokeStyle = '#2a180a'; ctx.lineWidth = 3.4*U; ctx.beginPath(); ctx.moveTo(cx0 + cw/2, tb0 + ch); ctx.lineTo(cx0 + cw/2, busY0); ctx.stroke();
      ctx.strokeStyle = gen ? '#f0a040' : '#9a6a3a'; ctx.lineWidth = 2*U; ctx.stroke();
      _afrRoof(cx0, tb0, cw, ch, U, t, { units: [[0.5, 0.42, 0.62]], windows: true, lit: on, spin: on, wallH: 5*U });
    }
    // inverter hall and switchyard
    const ix0 = L*0.71, ix1 = L - 12*U, iw = ix1 - ix0, ih = tb1 - tb0;
    _afrRoof(ix0, tb0, iw*0.48, ih, U, t, {
      skylights: [[0.1, 0.16, 0.8, 0.22]], glow: gen ? 'rgba(180,240,255,0.3)' : null,
      units: [[0.3, 0.66, 0.36], [0.72, 0.66, 0.36]], windows: true, lit: on, spin: on });
    const yx = ix0 + iw*0.52, yw = iw*0.48;
    _afrGrate(yx, tb0, yw, ih, U);
    ctx.strokeStyle = '#a0a6ae'; ctx.lineWidth = 1*U; ctx.setLineDash([3*U, 2*U]); ctx.strokeRect(yx + 1*U, tb0 + 1*U, yw - 2*U, ih - 2*U); ctx.setLineDash([]);
    for (let q = 0; q < 2; q++) {                       // transformers
      const tw = yw*0.3, th = ih*0.36, tx = yx + yw*(0.06 + q*0.34), ty = tb0 + ih*0.08;
      ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(tx + 4*U, ty + 5*U, tw, th);
      ctx.fillStyle = '#4a5a50'; ctx.fillRect(tx, ty, tw, th);
      ctx.lineWidth = 0.9*U;
      for (let fx = tx + 2*U; fx < tx + tw - 1*U; fx += 2*U) { ctx.strokeStyle = (fx - tx) % (4*U) < 2*U ? '#70847a' : '#26302a'; ctx.beginPath(); ctx.moveTo(fx, ty + 2*U); ctx.lineTo(fx, ty + th*0.28); ctx.moveTo(fx, ty + th*0.72); ctx.lineTo(fx, ty + th - 2*U); ctx.stroke(); }
      const tg = ctx.createLinearGradient(tx, ty, tx + tw, ty + th);
      tg.addColorStop(0, '#94aa9e'); tg.addColorStop(1, '#3e4c44');
      ctx.fillStyle = tg; ctx.fillRect(tx + 1.5*U, ty + th*0.3, tw - 3*U, th*0.4);
      for (let b = 0; b < 3; b++) {
        const bx = tx + tw*(0.25 + b*0.25), by = ty + th*0.5;
        ctx.fillStyle = '#c8925e'; ctx.beginPath(); ctx.arc(bx, by, 2.8*U, 0, TAU); ctx.fill();
        ctx.fillStyle = '#7a4a2e'; ctx.beginPath(); ctx.arc(bx, by, 1.6*U, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = '#14181c'; ctx.lineWidth = 1*U; ctx.strokeRect(tx, ty, tw, th);
    }
    for (let q = 0; q < 3; q++) {                       // insulator strings
      const sx = yx + yw*(0.18 + q*0.3), sy0 = tb0 + ih*0.56, sy1 = tb1 - 6*U;
      ctx.strokeStyle = '#3a3f46'; ctx.lineWidth = 1.2*U; ctx.beginPath(); ctx.moveTo(sx, sy0); ctx.lineTo(sx, sy1); ctx.stroke();
      for (let y = sy0 + 2*U; y < sy1; y += 3.4*U) {
        ctx.fillStyle = '#d4d8cc'; ctx.beginPath(); ctx.ellipse(sx, y, 3.2*U, 1.4*U, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(sx + 0.6*U, y + 0.6*U, 2.4*U, 0.8*U, 0, 0, TAU); ctx.fill();
      }
      if (gen && Math.sin(t*9 + q*2) > 0.85) {
        ctx.strokeStyle = 'rgba(200,240,255,0.95)'; ctx.lineWidth = 1.2*U;
        ctx.beginPath(); ctx.moveTo(sx, sy0 - 1*U); ctx.lineTo(sx + 4*U, sy0 - 5*U); ctx.lineTo(sx - 1*U, sy0 - 9*U); ctx.stroke();
      }
    }
    ctx.fillStyle = gen ? '#60ff90' : (on ? '#ffb030' : '#ff4040');
    ctx.beginPath(); ctx.arc(yx + yw - 6*U, tb1 - 6*U, 2.4*U, 0, TAU); ctx.fill();
  }

  // ── Bottom band: cryo plant, radiators, harmonic filter yard ──
  const bb0 = busY1 + 12*U, bb1 = B - 10*U;
  if (wide && bb1 - bb0 > 20*U) {
    const bh = bb1 - bb0;
    // cryo plant: compressor hall, cold box, two dewars
    const cpx = 12*U, cpw = L*0.19;
    _afrRoof(cpx, bb0, cpw*0.42, bh, U, t, { units: [[0.5, 0.36, 0.5]], vents: [[0.25, 0.8], [0.75, 0.8]], windows: true, lit: on, spin: on });
    {
      const bx = cpx + cpw*0.46, bw = cpw*0.12, by = bb0 + 2*U, bhh = bh - 4*U;
      ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(bx + 4*U, by + 5*U, bw, bhh);
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, '#f4f8fa'); g.addColorStop(1, '#7e8e9a');
      ctx.fillStyle = g; ctx.fillRect(bx, by, bw, bhh);
      ctx.strokeStyle = 'rgba(40,52,62,0.35)'; ctx.lineWidth = 0.7*U; ctx.beginPath();
      for (let q = 1; q < 4; q++) { ctx.moveTo(bx, by + bhh*q/4); ctx.lineTo(bx + bw, by + bhh*q/4); }
      ctx.stroke();
      ctx.strokeStyle = '#14181c'; ctx.lineWidth = 1*U; ctx.strokeRect(bx, by, bw, bhh);
      _afrVessel(bx + bw/2, by + bhh*0.25, bw*0.3, U, { bolts: 8, nozzle: false, frost: on ? 0.5 : 0 });
    }
    const dr2 = Math.min(bh*0.36, cpw*0.11);
    _afrSphere(cpx + cpw*0.72, bb0 + bh*0.5, dr2, U, t, { legs: 6, label: 'LHe', stairAt: 0.8, frost: on ? 0.6 : 0 });
    _afrSphere(cpx + cpw*0.9, bb0 + bh*0.5, dr2, U, t, { legs: 6, label: 'LHe', stairAt: 2.6, frost: on ? 0.6 : 0 });
    // radiator deck, warm while it runs
    const rx0 = L*0.22, rx1 = L*0.62;
    _afrFanDeck(rx0, bb0, rx1 - rx0, bh, U, t, gen, Math.max(3, Math.round((rx1 - rx0) / (bh*1.05))), 6);
    if (gen) {
      ctx.fillStyle = `rgba(255,140,60,${(0.1 + 0.04*Math.sin(t*2)).toFixed(3)})`; ctx.fillRect(rx0, bb0, rx1 - rx0, bh);
      ctx.strokeStyle = 'rgba(255,150,80,0.55)'; ctx.lineWidth = 1*U; ctx.strokeRect(rx0 + 1*U, bb0 + 1*U, rx1 - rx0 - 2*U, bh - 2*U);
    }
    // harmonic filter yard: air-core reactors and capacitor racks
    const fx0 = L*0.64, fx1 = L - 12*U, fw = fx1 - fx0;
    _afrGrate(fx0, bb0, fw, bh, U);
    ctx.strokeStyle = '#a0a6ae'; ctx.lineWidth = 1*U; ctx.setLineDash([3*U, 2*U]); ctx.strokeRect(fx0 + 1*U, bb0 + 1*U, fw - 2*U, bh - 2*U); ctx.setLineDash([]);
    const rr = Math.min(bh*0.36, fw*0.07);
    for (let q = 0; q < 3; q++) {
      const ax = fx0 + fw*0.08 + q*rr*2.5, ay = bb0 + bh/2;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(ax + 3*U, ay + 4*U, rr, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2a2e34'; ctx.lineWidth = rr*0.42; ctx.beginPath(); ctx.arc(ax, ay, rr*0.78, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#7a8a7e'; ctx.lineWidth = rr*0.36; ctx.stroke();
      ctx.strokeStyle = 'rgba(20,26,22,0.55)'; ctx.lineWidth = 0.6*U;
      for (const f of [0.66, 0.78, 0.9]) { ctx.beginPath(); ctx.arc(ax, ay, rr*f, 0, TAU); ctx.stroke(); }
      ctx.strokeStyle = '#c8cccf'; ctx.lineWidth = 1.2*U;
      for (let s = 0; s < 8; s++) { const a = s*TAU/8; ctx.beginPath(); ctx.moveTo(ax + Math.cos(a)*rr*0.58, ay + Math.sin(a)*rr*0.58); ctx.lineTo(ax + Math.cos(a)*rr, ay + Math.sin(a)*rr); ctx.stroke(); }
      ctx.fillStyle = '#4a5058'; ctx.beginPath(); ctx.arc(ax, ay, rr*0.22, 0, TAU); ctx.fill();
    }
    const cx0 = fx0 + fw*0.08 + 3*rr*2.5 - rr*0.6, cr = Math.min(bh*0.13, 6*U);
    for (let row = 0; row < 2; row++) {
      const cy0 = bb0 + bh*(0.3 + row*0.4);
      ctx.fillStyle = '#23282e'; ctx.fillRect(cx0, cy0 - cr*1.4, fx1 - 6*U - cx0, cr*2.8);
      for (let x = cx0 + cr*1.5; x < fx1 - 6*U - cr; x += cr*2.6) {
        const cg = ctx.createRadialGradient(x - cr*0.4, cy0 - cr*0.4, 0.3*U, x, cy0, cr);
        cg.addColorStop(0, '#eef2f6'); cg.addColorStop(1, '#5e6674');
        ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(x, cy0, cr, 0, TAU); ctx.fill();
        ctx.fillStyle = '#7a4a2e'; ctx.beginPath(); ctx.arc(x, cy0, cr*0.32, 0, TAU); ctx.fill();
      }
    }
  }

  // ── Cryo header: twin helium lines along the magnets, fed from the plant ──
  {
    const feedX = Math.min(busX0 - 14*U, d0 - 10*U);
    const top = wide ? bb0 : B;
    if (wide) {
      _afrPipe([[feedX, top], [feedX, cryoA], [d1 - 6*U, cryoA]], U, t, on, lhe, 2.2, { flangeStep: 70*U });
      _afrPipe([[feedX + 7*U, top], [feedX + 7*U, cryoB], [d1 - 6*U, cryoB]], U, t, on, lhe, 2.2, { flangeStep: 70*U });
    } else {
      _afrPipe([[d0, cryoA], [d1 - 6*U, cryoA]], U, t, on, lhe, 2, { flangeStep: 70*U });
    }
    for (let q = 1; q < nM; q += 2) _afrPipe([[modX(q), cryoA], [modX(q), mTop + mH - 4*U]], U, t, false, null, 1.4);
  }

  // ── Electrode busways on porcelain standoffs ──
  (wide ? [busY0, busY1] : [busY0]).forEach((by) => {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(busX0 + 3*U, by - 5*U + 4*U, busX1 - busX0, 10*U);
    for (let x = busX0 + 12*U; x < busX1; x += 44*U) {
      ctx.fillStyle = '#d4d8cc'; ctx.beginPath(); ctx.arc(x, by, 7*U, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#8a8e84'; ctx.lineWidth = 0.7*U; ctx.beginPath(); ctx.arc(x, by, 5*U, 0, TAU); ctx.moveTo(x + 7*U, by); ctx.arc(x, by, 7*U, 0, TAU); ctx.stroke();
    }
    const g = ctx.createLinearGradient(0, by - 5*U, 0, by + 5*U);
    g.addColorStop(0, gen ? '#b07040' : '#8a5a30'); g.addColorStop(0.35, gen ? '#ffc078' : '#e0a868'); g.addColorStop(1, '#5a3418');
    ctx.fillStyle = g; ctx.fillRect(busX0, by - 4*U, busX1 - busX0, 8*U);
    ctx.strokeStyle = '#2a180a'; ctx.lineWidth = 0.9*U; ctx.strokeRect(busX0, by - 4*U, busX1 - busX0, 8*U);
    ctx.fillStyle = '#2a180a';
    for (let x = busX0 + 30*U; x < busX1; x += 60*U) ctx.fillRect(x - 1*U, by - 4*U, 2*U, 8*U);   // bolted joints
    if (gen) {
      ctx.strokeStyle = 'rgba(255,240,160,0.95)'; ctx.lineWidth = 2*U;
      ctx.setLineDash([6*U, 8*U]); ctx.lineDashOffset = -t*50*U;
      ctx.beginPath(); ctx.moveTo(busX0, by); ctx.lineTo(busX1, by); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
  });
  // ── The channel: vessel with a viewport strip on the plasma ──
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(d0 + 5*U, D - dr + 7*U, span, dr*2);
  const dg = ctx.createLinearGradient(0, D - dr, 0, D + dr);
  dg.addColorStop(0, '#4a5460'); dg.addColorStop(0.35, '#b8c2cc'); dg.addColorStop(1, '#20262e');
  ctx.fillStyle = dg; ctx.fillRect(d0, D - dr, span, dr*2);
  ctx.strokeStyle = '#141a20'; ctx.lineWidth = 1*U; ctx.strokeRect(d0, D - dr, span, dr*2);
  const sh = dr*1.1, sy0 = D - sh/2;
  ctx.fillStyle = '#2a3038'; ctx.fillRect(d0 + 3*U, sy0 - 2*U, span - 6*U, sh + 4*U);
  ctx.fillStyle = '#060a10'; ctx.fillRect(d0 + 4*U, sy0, span - 8*U, sh);
  if (gen) {
    const pg = ctx.createLinearGradient(0, sy0, 0, sy0 + sh);
    pg.addColorStop(0, 'rgba(80,180,255,0.55)'); pg.addColorStop(0.5, 'rgba(225,250,255,0.95)'); pg.addColorStop(1, 'rgba(80,180,255,0.55)');
    ctx.fillStyle = pg; ctx.fillRect(d0 + 4*U, sy0, span - 8*U, sh);
    ctx.save(); ctx.beginPath(); ctx.rect(d0 + 4*U, sy0, span - 8*U, sh); ctx.clip();
    for (let q = 0; q < 9; q++) {
      const p = (t*0.45 + q/9) % 1, x = d0 + p*span, r = 26*S*Math.min(k, 1.6);
      const bg = ctx.createRadialGradient(x, D, 0, x, D, r);
      bg.addColorStop(0, `rgba(255,255,255,${(0.9 - p*0.5).toFixed(3)})`); bg.addColorStop(1, 'rgba(120,210,255,0)');
      ctx.fillStyle = bg; ctx.fillRect(x - r, sy0, r*2, sh);
    }
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(d0 + 4*U, sy0 + 1*U, span - 8*U, sh*0.18);   // glass glint

  // ── Magnet coils wound along the channel ──
  // Copper winding packs taller than the duct, each held by a bolted steel
  // clamp across it, with the field pulsing down the line while it runs;
  // every other coil has its current leads to the busways.
  for (let q = 0; q < nM; q++) {                         // current leads first, the coils cover their ends
    if (q % 2) continue;
    const mx = modX(q);
    ctx.lineCap = 'butt';
    for (const [y0, y1] of [[mTop, busY0], ...(wide ? [[mTop + mH, busY1]] : [])]) {
      ctx.strokeStyle = '#2a180a'; ctx.lineWidth = 4*U; ctx.beginPath(); ctx.moveTo(mx, y0); ctx.lineTo(mx, y1); ctx.stroke();
      ctx.strokeStyle = gen ? '#f0a040' : '#9a6a3a'; ctx.lineWidth = 2.4*U; ctx.stroke();
    }
  }
  for (let q = 0; q < nM; q++) {
    const mx = modX(q), x = mx - mw/2;
    ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.beginPath(); ctx.roundRect(x + 5*U, mTop + 7*U, mw, mH, 5*U); ctx.fill();
    const cg = ctx.createLinearGradient(x, 0, x + mw, 0);
    cg.addColorStop(0, '#6a4628'); cg.addColorStop(0.38, '#e6aa72'); cg.addColorStop(0.7, '#a86a3a'); cg.addColorStop(1, '#43280f');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.roundRect(x, mTop, mw, mH, 5*U); ctx.fill();
    ctx.strokeStyle = '#1e1208'; ctx.lineWidth = 0.9*U; ctx.stroke();
    ctx.strokeStyle = 'rgba(40,22,10,0.5)'; ctx.lineWidth = 0.6*U; ctx.beginPath();
    for (let y = mTop + 3*U; y < mTop + mH - 2*U; y += 2*U) { ctx.moveTo(x + 1.5*U, y); ctx.lineTo(x + mw - 1.5*U, y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,230,190,0.35)'; ctx.lineWidth = 0.8*U;
    ctx.beginPath(); ctx.moveTo(x + mw*0.3, mTop + 4*U); ctx.lineTo(x + mw*0.3, mTop + mH - 4*U); ctx.stroke();
    // clamp across the duct
    const ch = dr*2 + 10*U, cy0 = D - ch/2;
    const kg = ctx.createLinearGradient(0, cy0, 0, cy0 + ch);
    kg.addColorStop(0, '#5a6470'); kg.addColorStop(0.35, '#c4ccd6'); kg.addColorStop(1, '#2c333c');
    ctx.fillStyle = kg; ctx.fillRect(x - 2.5*U, cy0, mw + 5*U, ch);
    ctx.strokeStyle = '#141a20'; ctx.lineWidth = 0.8*U; ctx.strokeRect(x - 2.5*U, cy0, mw + 5*U, ch);
    ctx.fillStyle = '#20262e';
    for (const y of [cy0 + 3*U, cy0 + ch - 3*U]) for (const bx of [x + 1*U, mx, x + mw - 1*U]) { ctx.beginPath(); ctx.arc(bx, y, 0.9*U, 0, TAU); ctx.fill(); }
    const pulse = gen ? 0.5 + 0.5*Math.sin(t*6 - q*0.8) : 0;
    ctx.fillStyle = gen ? `rgba(96,208,255,${(0.35 + pulse*0.6).toFixed(3)})` : '#1a2430';
    ctx.fillRect(x - 1*U, D - 2*U, mw + 2*U, 4*U);
    if (on) {                                            // frost on the cold tips
      ctx.fillStyle = 'rgba(236,250,255,0.6)';
      for (let s = 0; s < 6; s++) ctx.fillRect(x + mw*_afrRnd(q*31 + s), mTop + mH - 6*U + 4*U*_afrRnd(q*17 + s*3), 1.1*U, 1.1*U);
    }
  }

  // ── Inlet nozzle with stiffening rings, flanges and a turbo pump ──
  const nh = 36*S*k, nx0 = 14*S;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.moveTo(nx0 - 1*U, D - nh + 6*U); ctx.lineTo(d0 + 5*U, D - dr + 6*U); ctx.lineTo(d0 + 5*U, D + dr + 6*U); ctx.lineTo(nx0 - 1*U, D + nh + 6*U); ctx.closePath(); ctx.fill();
  const ng = ctx.createLinearGradient(0, D - nh, 0, D + nh);
  ng.addColorStop(0, '#5a6470'); ng.addColorStop(0.4, '#c8d0da'); ng.addColorStop(1, '#2a3038');
  ctx.fillStyle = ng; ctx.strokeStyle = '#141a20'; ctx.lineWidth = 1.2*U;
  ctx.beginPath(); ctx.moveTo(nx0, D - nh); ctx.lineTo(d0, D - dr); ctx.lineTo(d0, D + dr); ctx.lineTo(nx0, D + nh); ctx.closePath(); ctx.fill(); ctx.stroke();
  const half = (x, h0, h1) => h0 + (h1 - h0) * (x - nx0) / (d0 - nx0);
  for (const f of [0.22, 0.48, 0.74]) {
    const x = nx0 + (d0 - nx0)*f, hh = half(x, nh, dr);
    ctx.strokeStyle = '#1a2028'; ctx.lineWidth = 2.6*U; ctx.beginPath(); ctx.moveTo(x, D - hh); ctx.lineTo(x, D + hh); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.9*U; ctx.beginPath(); ctx.moveTo(x - 1.4*U, D - hh); ctx.lineTo(x - 1.4*U, D + hh); ctx.stroke();
  }
  for (const [x, hh] of [[nx0, nh], [d0, dr]]) {
    ctx.fillStyle = '#3a424c'; ctx.fillRect(x - 2.5*U, D - hh - 4*U, 5*U, hh*2 + 8*U);
    ctx.fillStyle = '#c8d0d8';
    for (let y = D - hh - 1*U; y <= D + hh + 1*U; y += 9*U) { ctx.beginPath(); ctx.arc(x, y, 0.9*U, 0, TAU); ctx.fill(); }
  }
  _afrVessel(nx0 + (d0 - nx0)*0.52, D, Math.min(nh*0.34, (d0 - nx0)*0.3), U, { bolts: 14, lamp: gen ? '#80ffb0' : (on ? '#ffb030' : '#302820') });

  // ── Exhaust diffuser ──
  const eh = 30*S*k, ex1 = L - 8*S;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.moveTo(d1 + 5*U, D - dr + 6*U); ctx.lineTo(ex1 + 4*U, D - eh + 6*U); ctx.lineTo(ex1 + 4*U, D + eh + 6*U); ctx.lineTo(d1 + 5*U, D + dr + 6*U); ctx.closePath(); ctx.fill();
  const xg = ctx.createLinearGradient(0, D - eh, 0, D + eh);
  xg.addColorStop(0, '#4a5460'); xg.addColorStop(0.4, '#a4aeba'); xg.addColorStop(1, '#22282f');
  ctx.fillStyle = xg; ctx.strokeStyle = '#141a20'; ctx.lineWidth = 1.2*U;
  ctx.beginPath(); ctx.moveTo(d1, D - dr); ctx.lineTo(ex1, D - eh); ctx.lineTo(ex1, D + eh); ctx.lineTo(d1, D + dr); ctx.closePath(); ctx.fill(); ctx.stroke();
  for (const f of [0.25, 0.5, 0.75]) {
    const x = d1 + (ex1 - d1)*f, hh = dr + (eh - dr)*f;
    ctx.strokeStyle = '#1a2028'; ctx.lineWidth = 2.4*U; ctx.beginPath(); ctx.moveTo(x, D - hh); ctx.lineTo(x, D + hh); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 0.9*U; ctx.beginPath(); ctx.moveTo(x - 1.3*U, D - hh); ctx.lineTo(x - 1.3*U, D + hh); ctx.stroke();
  }
  ctx.fillStyle = '#3a424c'; ctx.fillRect(d1 - 2.5*U, D - dr - 4*U, 5*U, dr*2 + 8*U);
  if (gen) {
    const er = 34*S*k;
    const eg = ctx.createRadialGradient(ex1, D, 0, ex1, D, er);
    eg.addColorStop(0, 'rgba(255,170,90,0.7)'); eg.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(ex1, D, er, -Math.PI/2, Math.PI/2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,190,120,0.8)'; ctx.lineWidth = 2*U; ctx.beginPath(); ctx.moveTo(ex1, D - eh); ctx.lineTo(ex1, D + eh); ctx.stroke();
  }

  // ── Glow off the running channel ──
  if (gen) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(96,208,255,0.08)'; ctx.fillRect(d0, D - dr - 10*U, span, dr*2 + 20*U);
    ctx.restore();
  }
  ctx.restore();

  // ── Plates (world space so text stays upright) ──
  const vertical = rot === 1 || rot === 3;
  _wfPlate('MHD RING', px + w*0.5, py + (vertical ? h*0.5 : 12*S), S, accent, on);
  _wfPlate(gen ? `${formatPower(Math.round(e._currentOutput || 0))}` : '0 kW', px + w*0.5, py + (vertical ? h*0.5 + 16*S : h - 10*S), S, gen ? '#60ff90' : accent, on);

  if (typeof MHDDeceleratorRingSystem !== 'undefined') {
    const a = _portAnchor(e, px, py, w, h, MHDDeceleratorRingSystem.getStubs(e).highBetaIn);
    _portPipe(a, S, t, { fluid: '#b478ff', label: 'ION IN', on: !!e._highBetaConnected && gen, out: false, flow: gen });
  }
  drawNetworkHighlight(e, px, py, t);
  ctx.restore();
}

function renderNuclearReactor(e, px, py, t) {
    // Containment dome with a pulsing Cherenkov ring, polar crane and
    // aviation light, a red-and-white ventilation stack, the auxiliary
    // building carrying the ROD / STEAM / COOL wall ports, a steam generator
    // hall venting plumes, a control building with the live readout, a spent
    // fuel pool glowing blue under a moving bridge crane, and a waste bay
    // behind the SPENT FUEL OUT hatch. Every port row comes from
    // NuclearSystem.getStubs(), so a reactor still at the old 8×8 size lines
    // its valves up with its old stub tiles. No backdrop.
    const def = EntityDefs[e.type] || EntityDefs[T.NUCLEARREACTOR];
    const W   = (e.width || def.width) * TILE, H = (e.height || def.height) * TILE;
    const gen = !!e._generating;
    const rodPct   = Math.min(1, (e._rodBuffer || 0) / (def.rodCapacity   || 50));
    const wastePct = Math.min(1, (e._spentFuel || 0) / (def.spentFuelCapacity || 100));
    const S   = TILE / 40;
    const k   = Math.min(W, H) / (8*TILE);      // detail scale, 1 at the old 8×8
    // The MK1 only. The MOX-burning Advanced Reactor is a different machine
    // — hexagonal containment, three heat-transfer loops, a rotating shield
    // plug, dry fuel both ends — and has its own renderer below.
    const accent = '#70ff80';
    ctx.save();

    const st = NuclearSystem.getStubs(e);
    const aRod   = _portAnchor(e, px, py, W, H, st.rodIn);
    const aSteam = _portAnchor(e, px, py, W, H, st.steamOut);
    const aCool  = _portAnchor(e, px, py, W, H, st.coolIn);
    const aWaste = _portAnchor(e, px, py, W, H, st.wasteOut);

    const auxX = px + W*0.045, auxW = W*0.12, auxY = py + H*0.13, auxH = H*0.79;
    const dcx = px + W*0.45, dcy = py + H*0.42, dr = Math.min(W, H)*0.23;
    const wy  = aWaste.y;
    const lowWaste = (wy - py) > H*0.6;
    const sgX = px + W*0.73, sgW = W*0.23, sgY = py + H*0.07;
    const sgH = Math.min(H*0.38, wy - sgY - H*0.10);
    const wbW = W*0.20, wbH = H*0.13, wbX = px + W*0.76, wbY = wy - wbH/2;
    const cbX = px + W*0.73, cbW = W*0.23;
    const cbY = lowWaste ? sgY + sgH + H*0.04 : wbY + wbH + H*0.03;
    const cbH = (lowWaste ? wbY - H*0.03 : py + H*0.70) - cbY;
    const plX = px + W*0.24, plY = py + H*0.72, plW = W*0.46, plH = H*0.22;
    const vsX = px + W*0.27, vsY = py + H*0.09, vsR = W*0.032;
    const domeEdge = (y) => dcx - Math.sqrt(Math.max(0, dr*dr - (y - dcy)*(y - dcy)));

    // ── Primary loop pipework (under the buildings) ──
    const wallIn = auxX + auxW;
    [[aRod, !!e._hasRods, accent], [aSteam, gen, 'rgba(240,250,255,0.95)']].forEach(([a, on, col]) => {
      _wfPipe([[px + 12*S, a.y], [auxX, a.y]], S, t, on, col);
      _wfPipe([[wallIn, a.y], [domeEdge(a.y) + 4*S, a.y]], S, t, on, col);
    });
    _wfPipe([[px + 12*S, aCool.y], [auxX, aCool.y]], S, t, !!e._cooled, 'rgba(90,190,255,0.95)');
    if (aCool.y < plY + 8*S) _wfPipe([[wallIn, aCool.y], [plX + 10*S, aCool.y], [plX + 10*S, plY + 4*S]], S, t, !!e._cooled, 'rgba(90,190,255,0.95)');
    else                     _wfPipe([[wallIn, aCool.y], [plX + 4*S, aCool.y]], S, t, !!e._cooled, 'rgba(90,190,255,0.95)');
    _wfPipe([[dcx + dr*0.7, sgY + sgH*0.3], [sgX, sgY + sgH*0.3]], S, t, gen, 'rgba(255,170,90,0.95)');
    _wfPipe([[dcx + dr*0.8, sgY + sgH*0.72], [sgX, sgY + sgH*0.72]], S, t, gen, 'rgba(90,190,255,0.95)');
    const wpX = Math.min(wbX, cbX) - 8*S;   // run down the gap, clear of the control building
    _wfPipe([[dcx + dr*0.55, dcy + dr*0.8], [wpX, dcy + dr*0.8], [wpX, wy], [wbX, wy]], S, t, !!e._wasteOut, '#d0e040');
    _wfPipe([[px + W - 12*S, wy], [wbX + wbW, wy]], S, t, !!e._wasteOut, '#d0e040');

    // ── Site apron ──
    ctx.fillStyle = 'rgba(120,124,112,0.22)';
    ctx.beginPath(); ctx.arc(dcx, dcy, dr*1.18, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(40,42,36,0.35)'; ctx.lineWidth = S;
    ctx.setLineDash([6*S, 4*S]); ctx.beginPath(); ctx.arc(dcx, dcy, dr*1.18, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]);

    // ── Auxiliary building (valve wall) ──
    _wfShadow(auxX, auxY, auxW, auxH, S, 3*S);
    const ag = ctx.createLinearGradient(auxX, 0, auxX + auxW, 0);
    ag.addColorStop(0, '#8a8e84'); ag.addColorStop(1, '#5a5e56');
    ctx.fillStyle = ag; ctx.strokeStyle = '#2a2c28'; ctx.lineWidth = 1.5*S;
    ctx.beginPath(); ctx.roundRect(auxX, auxY, auxW, auxH, 3*S); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = S;
    for (let q = 1; q < 9; q++) { const ly = auxY + auxH*q/9; ctx.beginPath(); ctx.moveTo(auxX + 2*S, ly); ctx.lineTo(auxX + auxW - 2*S, ly); ctx.stroke(); }
    [[aRod, !!e._hasRods, '#90ff60'], [aSteam, gen, '#e8f4ff'], [aCool, !!e._cooled, '#5ac8ff']].forEach(([a, on, col]) => {
      // valve wheel where each line passes through the wall
      const vx = auxX + auxW*0.5, vy = a.y, vr = Math.min(auxW*0.28, 8*S);
      ctx.fillStyle = '#2e322c'; ctx.beginPath(); ctx.arc(vx, vy, vr + 1.5*S, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = on ? col : '#6a6e64'; ctx.lineWidth = 1.6*S;
      ctx.beginPath(); ctx.arc(vx, vy, vr, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(vx - vr, vy); ctx.lineTo(vx + vr, vy); ctx.moveTo(vx, vy - vr); ctx.lineTo(vx, vy + vr); ctx.stroke();
    });

    // ── Ventilation stack ──
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(vsX + 5*S, vsY + 6*S, vsR, 0, Math.PI*2); ctx.fill();
    [1, 0.78, 0.56, 0.34].forEach((rf, i) => { ctx.fillStyle = i % 2 ? '#e8e8e0' : '#c83020'; ctx.beginPath(); ctx.arc(vsX, vsY, vsR*rf, 0, Math.PI*2); ctx.fill(); });
    ctx.fillStyle = '#1a1a18'; ctx.beginPath(); ctx.arc(vsX, vsY, vsR*0.2, 0, Math.PI*2); ctx.fill();

    // ── Containment dome ──
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.arc(dcx + 7*S, dcy + 9*S, dr, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#4a4e46'; ctx.beginPath(); ctx.arc(dcx, dcy, dr + 3*S, 0, Math.PI*2); ctx.fill();
    const dg = ctx.createRadialGradient(dcx - dr*0.38, dcy - dr*0.42, dr*0.05, dcx, dcy, dr);
    dg.addColorStop(0, '#f4f4ee'); dg.addColorStop(0.45, '#c8cac0'); dg.addColorStop(0.85, '#8a8e84'); dg.addColorStop(1, '#5a5e56');
    ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(dcx, dcy, dr, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(60,64,56,0.28)'; ctx.lineWidth = S;
    [0.35, 0.62, 0.84].forEach(fr => { ctx.beginPath(); ctx.arc(dcx, dcy, dr*fr, 0, Math.PI*2); ctx.stroke(); });
    for (let q = 0; q < 24; q++) {
      const a = q*Math.PI/12;
      ctx.beginPath(); ctx.moveTo(dcx + Math.cos(a)*dr*0.2, dcy + Math.sin(a)*dr*0.2); ctx.lineTo(dcx + Math.cos(a)*dr*0.97, dcy + Math.sin(a)*dr*0.97); ctx.stroke();
    }
    // polar crane bridge, slewing slowly while running
    ctx.save(); ctx.translate(dcx, dcy); ctx.rotate(gen ? t*0.08 : 0.6);
    ctx.fillStyle = 'rgba(210,160,30,0.55)'; ctx.fillRect(-dr*0.8, -3*S, dr*1.6, 6*S);
    ctx.fillStyle = 'rgba(60,50,20,0.6)'; ctx.fillRect(dr*0.2, -5*S, 8*S, 10*S);
    ctx.restore();
    if (gen) {
      const pulse = 0.45 + 0.35*Math.sin(t*1.8);
      ctx.strokeStyle = `rgba(112,255,128,${pulse})`; ctx.lineWidth = 2.5*S;
      ctx.beginPath(); ctx.arc(dcx, dcy, dr*0.84, 0, Math.PI*2); ctx.stroke();
      ctx.strokeStyle = `rgba(112,255,128,${pulse*0.3})`; ctx.lineWidth = 8*S;
      ctx.beginPath(); ctx.arc(dcx, dcy, dr*0.84, 0, Math.PI*2); ctx.stroke();
    }
    // Core heat — the dome glows through amber to red as it climbs, and
    // throbs once it is critical.
    const heat = e._coreHeat || 0;
    if (heat > 0.02) {
      const crit = heat >= 1;
      const beat = crit ? 0.6 + 0.4*Math.sin(t*9) : 0.8 + 0.2*Math.sin(t*3);
      const hg = ctx.createRadialGradient(dcx, dcy, dr*0.1, dcx, dcy, dr*1.25);
      hg.addColorStop(0, `rgba(255,${Math.round(200 - 170*heat)},40,${(0.55*heat*beat).toFixed(3)})`);
      hg.addColorStop(0.7, `rgba(255,${Math.round(120 - 100*heat)},20,${(0.3*heat*beat).toFixed(3)})`);
      hg.addColorStop(1, 'rgba(255,40,0,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(dcx, dcy, dr*1.25, 0, Math.PI*2); ctx.fill();
      if (heat > 0.5) _wfSmoke(dcx + dr*0.3, dcy - dr*0.6, S*(0.8 + heat), t, '255,240,230', true, 0.25 + 0.35*heat);
    }
    const ha = Math.PI*0.78;
    ctx.save(); ctx.translate(dcx + Math.cos(ha)*dr*0.9, dcy + Math.sin(ha)*dr*0.9); ctx.rotate(ha + Math.PI/2);
    ctx.fillStyle = '#6a6e64'; ctx.strokeStyle = '#2a2c28'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.roundRect(-10*S*k, -5*S*k, 20*S*k, 10*S*k, 2*S); ctx.fill(); ctx.stroke();
    _wfHazardStripe(-10*S*k, 2*S*k, 20*S*k, 3*S*k, S);
    ctx.restore();
    ctx.fillStyle = '#7a7e74'; ctx.beginPath(); ctx.arc(dcx, dcy, dr*0.16, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#3a3e36'; ctx.lineWidth = S; ctx.stroke();
    _wfTrefoil(dcx, dcy, dr*0.12, '#e8c820', '#1a1608');
    const av = Math.sin(t*3) > 0.3;
    [[dcx + dr*0.5, dcy - dr*0.5], [vsX, vsY]].forEach(([lx, ly]) => {
      ctx.fillStyle = av ? '#ff3020' : '#501810';
      ctx.beginPath(); ctx.arc(lx, ly, 2.5*S, 0, Math.PI*2); ctx.fill();
      if (av) { ctx.fillStyle = 'rgba(255,60,40,0.25)'; ctx.beginPath(); ctx.arc(lx, ly, 8*S, 0, Math.PI*2); ctx.fill(); }
    });

    // ── Steam generator hall ──
    _wfShadow(sgX, sgY, sgW, sgH, S, 3*S);
    ctx.fillStyle = '#4a5250'; ctx.strokeStyle = '#1e2422'; ctx.lineWidth = 1.5*S;
    ctx.beginPath(); ctx.roundRect(sgX, sgY, sgW, sgH, 3*S); ctx.fill(); ctx.stroke();
    const sgN = sgH > sgW*1.3 ? 3 : 2;
    for (let i = 0; i < sgN; i++) {
      const cx2 = sgX + sgW*0.5, cy2 = sgY + sgH*(i + 0.5)/sgN, cr = Math.min(sgW*0.32, sgH/sgN*0.38);
      const cgr = ctx.createRadialGradient(cx2 - cr*0.35, cy2 - cr*0.35, 1, cx2, cy2, cr);
      cgr.addColorStop(0, '#d8dcd4'); cgr.addColorStop(0.6, '#8a908a'); cgr.addColorStop(1, '#3a403c');
      ctx.fillStyle = cgr; ctx.beginPath(); ctx.arc(cx2, cy2, cr, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#2a302c'; ctx.lineWidth = S; ctx.stroke();
      ctx.fillStyle = '#3a403c'; ctx.beginPath(); ctx.arc(cx2, cy2, cr*0.35, 0, Math.PI*2); ctx.fill();
      if (gen) { ctx.fillStyle = `rgba(255,150,80,${0.35 + 0.2*Math.sin(t*2 + i)})`; ctx.beginPath(); ctx.arc(cx2, cy2, cr*0.25, 0, Math.PI*2); ctx.fill(); }
      _wfSmoke(cx2 + cr*0.6, cy2 - cr*0.6, S*0.8, t + i*0.7, '240,244,240', gen, 0.55);
    }

    // ── Control building + readout ──
    if (cbH > 12*S) {
      _wfShadow(cbX, cbY, cbW, cbH, S, 3*S);
      ctx.fillStyle = '#5a6058'; ctx.strokeStyle = '#22261f'; ctx.lineWidth = 1.5*S;
      ctx.beginPath(); ctx.roundRect(cbX, cbY, cbW, cbH, 3*S); ctx.fill(); ctx.stroke();
      const panX = cbX + 4*S, panY = cbY + 4*S, panW = cbW - 8*S, panH = cbH - 8*S;
      ctx.fillStyle = '#040a06'; ctx.strokeStyle = '#1e3010'; ctx.lineWidth = S;
      ctx.beginPath(); ctx.roundRect(panX, panY, panW, panH, S*2); ctx.fill(); ctx.stroke();
      ctx.font = `${Math.max(4, S*5.5*Math.min(1.3, k))}px Courier New`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = gen ? '#00ff60' : '#ff4040';
      ctx.fillText(`STM:${gen ? formatPower(Math.round(e._currentOutput||0)) : ' 0 kW'}`, panX + S*3, panY + panH*0.2);
      ctx.fillStyle = rodPct < 0.2 ? '#ff6040' : '#a0ff60';
      ctx.fillText(`ROD:${Math.round(rodPct*100).toString().padStart(3)}%`, panX + S*3, panY + panH*0.5);
      ctx.fillStyle = wastePct > 0.8 ? '#ff8020' : '#60d060';
      ctx.fillText(`WST:${Math.round(wastePct*100).toString().padStart(3)}%`, panX + S*3, panY + panH*0.8);
      ctx.textBaseline = 'alphabetic';
    }

    // ── Waste bay ──
    _wfShadow(wbX, wbY, wbW, wbH, S, 2*S);
    ctx.fillStyle = '#5a5a3a'; ctx.strokeStyle = '#24241a'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.roundRect(wbX, wbY, wbW, wbH, 2*S); ctx.fill(); ctx.stroke();
    _wfHazardStripe(wbX, wbY, wbW, 4*S, S);
    for (let q = 0; q < 3; q++) {
      const cx3 = wbX + wbW*(0.2 + q*0.2), cy3 = wbY + wbH*0.6, r3 = Math.min(wbW*0.08, wbH*0.26);
      ctx.fillStyle = q < Math.round(wastePct*3) ? '#8a8a40' : '#3a3a28';
      ctx.beginPath(); ctx.arc(cx3, cy3, r3, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#1a1a10'; ctx.lineWidth = S; ctx.stroke();
    }
    _wfTrefoil(wbX + wbW*0.82, wbY + wbH*0.6, Math.min(6*S, wbH*0.25), '#e8c820', '#1a1608');

    // ── Spent fuel pool (Cherenkov blue) ──
    _wfShadow(plX, plY, plW, plH, S, 3*S);
    ctx.fillStyle = '#7a7e74'; ctx.strokeStyle = '#2a2c28'; ctx.lineWidth = 1.5*S;
    ctx.beginPath(); ctx.roundRect(plX, plY, plW, plH, 3*S); ctx.fill(); ctx.stroke();
    const px2 = plX + 6*S, py2 = plY + 6*S, pw2 = plW - 12*S, ph2 = plH - 12*S;
    const glow = gen ? 0.8 + 0.2*Math.sin(t*1.3) : (rodPct > 0 ? 0.45 : 0.25);
    const pg = ctx.createRadialGradient(px2 + pw2/2, py2 + ph2/2, 2, px2 + pw2/2, py2 + ph2/2, pw2*0.6);
    pg.addColorStop(0, `rgba(130,210,255,${glow})`); pg.addColorStop(0.6, `rgba(40,110,230,${glow*0.9})`); pg.addColorStop(1, '#0a1a3a');
    ctx.fillStyle = pg; ctx.fillRect(px2, py2, pw2, ph2);
    ctx.strokeStyle = `rgba(200,240,255,${0.35*glow})`; ctx.lineWidth = 0.8*S;
    const cellsX = Math.round(8*k), cellsY = Math.round(3*k);
    for (let r = 0; r < cellsY; r++) for (let c = 0; c < cellsX; c++) {
      ctx.strokeRect(px2 + 4*S + (pw2 - 8*S)*c/cellsX, py2 + 3*S + (ph2 - 6*S)*r/cellsY, (pw2 - 8*S)/cellsX - 1.5*S, (ph2 - 6*S)/cellsY - 1.5*S);
    }
    if (gen) {
      ctx.fillStyle = 'rgba(180,230,255,0.25)';
      for (let q = 0; q < 3; q++) { const p = (t*0.3 + q/3) % 1; ctx.fillRect(px2 + p*pw2, py2, 2*S, ph2); }
    }
    ctx.strokeStyle = '#1a1e18'; ctx.lineWidth = S; ctx.strokeRect(px2, py2, pw2, ph2);
    const brx = plX + 4*S + (plW - 16*S)*(0.5 + 0.45*Math.sin(t*(gen ? 0.4 : 0)));
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(brx + 3*S, plY + 2*S, 7*S, plH);
    ctx.fillStyle = '#d8a820'; ctx.strokeStyle = '#4a3a10';
    ctx.fillRect(brx, plY - 2*S, 7*S, plH + 4*S); ctx.strokeRect(brx, plY - 2*S, 7*S, plH + 4*S);
    ctx.fillStyle = '#3a3a34'; ctx.fillRect(brx - 1*S, plY + plH*0.45, 9*S, 6*S);

    // ── Ports ──
    _portBelt(aRod,   S, t, { belt: '#90ff60', label: 'ROD IN',    on: !!e._hasRods, out: false });
    _portPipe(aSteam, S, t, { fluid: '#e8f4ff', label: 'STEAM OUT', on: gen, out: true, flow: gen });
    _portPipe(aCool,  S, t, { fluid: '#5ac8ff', label: 'COOL IN',   on: !!e._cooled, out: false, flow: !!e._cooled });
    _portBelt(aWaste, S, t, { belt: '#d0e040', label: 'SPENT FUEL OUT', on: !!e._wasteOut, out: true });

    _wfPlate('NUCLEAR REACTOR', px + W*0.47, py + H*0.04, S, accent, gen);
    _wfLamp(px + W - 7*S, py + 7*S, S, t, gen ? accent : '#ff4040', true);
    // No wire-network highlight: the reactor makes steam, not grid power —
    // only its Steam Turbines light up when their wire network is hovered.
    ctx.restore();
  }

function renderAdvancedReactor(e, px, py, t) {
    // ADVANCED (MOX) REACTOR — deliberately not the MK1 on a teal palette.
    // The MK1 is a light-water plant: round containment dome, one steam
    // hall, a wet spent fuel pool. This is the fast-spectrum plant that
    // burns what the MK1 leaves behind, and every piece that differs is a
    // piece that differs in the real machines too:
    //   • Hexagonal containment, raised as a prism. A fast core is a
    //     hexagonal assembly lattice, not a square grid of water channels,
    //     and the building is built around the core.
    //   • THREE intermediate heat-transfer loops on a triangle around the
    //     core, each an insulated IHX vessel with its own pump. Sodium-cooled
    //     fast reactors run several loops because the intermediate circuit
    //     has to keep the active coolant away from the water side; the
    //     Cryogenic Coolant header visibly splits in three legs, one per loop.
    //   • Decay-heat air coolers (DRACS) along the north edge. Their fans
    //     run with the plant, and keep running while the core is hot.
    //   • A rotating shield plug on top of the core. Fast reactors refuel
    //     through eccentric rotating plugs rather than by lifting a dome
    //     head, so the top of the core turns instead of a polar crane.
    //   • A dry MOX magazine and a dry cask farm instead of a Cherenkov
    //     pool: the fuel arrives dry from the fabricator and leaves dry.
    // Laid out in tile units of the designed 21×21 (u, v), so a reactor saved
    // at another size stretches rather than spilling out of its footprint.
    // Ports still come from NuclearSystem.getStubs(), so its valves line up
    // with its own stub tiles whatever its size.
    const def = EntityDefs[T.ADVREACTOR];
    const W   = (e.width || def.width) * TILE, H = (e.height || def.height) * TILE;
    const gen = !!e._generating;
    const rodPct   = Math.min(1, (e._rodBuffer || 0) / (def.rodCapacity   || 50));
    const wastePct = Math.min(1, (e._spentFuel || 0) / (def.spentFuelCapacity || 100));
    const heat     = e._coreHeat || 0;
    const crit     = heat >= 1;
    const S   = TILE / 40;
    const u   = W / 21, v = H / 21, m = Math.min(u, v);
    const k   = m / TILE;                       // detail scale, 1 at the designed 21×21
    const X   = (n) => px + n*u, Y = (n) => py + n*v;
    const accent = '#40ffd0';
    const CRYO = 'rgba(176,144,255,0.95)', SODIUM = 'rgba(255,150,70,0.95)', STEAM = 'rgba(240,250,255,0.95)';
    ctx.save();

    const st = NuclearSystem.getStubs(e);
    const aRod   = _portAnchor(e, px, py, W, H, st.rodIn);
    const aSteam = _portAnchor(e, px, py, W, H, st.steamOut);
    const aCool  = _portAnchor(e, px, py, W, H, st.coolIn);
    const aWaste = _portAnchor(e, px, py, W, H, st.wasteOut);
    const aGr    = st.graphiteIn ? _portAnchor(e, px, py, W, H, st.graphiteIn) : null;
    const grPct  = Math.min(1, (e._graphite || 0) / (def.graphiteCapacity || 40));
    const grOpen = typeof Progression !== 'undefined' && Progression.isUnlocked && Progression.isUnlocked(T.GRAPHITEFURNACE);

    // One status colour for the buttress lamps: running, fuelled standby,
    // over-temperature (flashing), or dark — dark is also the ghost.
    const flash = Math.sin(t*8) > 0;
    const lampCol = (heat > 0.75 || crit) ? (flash ? '#ff3020' : '#501810')
                  : gen ? accent
                  : (e._hasRods || rodPct > 0) ? '#ffb020' : null;

    // ── Layout (tile units of the 21×21) ──
    const glX = X(0.55), glW = 2.0*u, glY = Y(1.1), glH = 19.0*v;      // valve gallery
    const wallIn = glX + glW;
    const dcx = X(9.3), dcy = Y(8.7), dr = 3.6*m, dep = 0.5*m;         // containment
    const arm = 6.0*m, lr = 1.15*m;
    const loops = [Math.PI*7/6, -Math.PI/6, Math.PI/2].map(a => ({
      a, x: dcx + Math.cos(a)*arm, y: dcy + Math.sin(a)*arm,
    }));
    const [lpUL, lpUR, lpB] = loops;
    const mgX = X(3.1), mgY = Y(1.2), mgW = 5.4*u, mgH = 2.6*v;        // MOX magazine
    const drY = Y(1.25), drH = 2.1*v, drW = 2.95*u;                    // decay-heat coolers
    const sgX = X(16.0), sgY = Y(0.9), sgW = 4.45*u, sgH = 6.7*v;      // steam generators
    const cbX = sgX, cbY = Y(8.3), cbW = sgW, cbH = 5.6*v;             // control block
    const ckX = X(13.0), ckY = Y(16.8), ckW = 7.3*u, ckH = 3.4*v;      // dry cask farm
    const rx = X(3.3), ry = Y(16.5), rw = 5.4*u, rh = 2.5*v;           // graphite store
    const tkX = X(11.0), tkY = Y(18.1), tkR = 1.1*m;                   // cryo surge tank
    const vsX = X(15.1), vsY = Y(15.4), vsR = 0.6*m;                   // vent stack
    const stmY = Y(4.3), naY = Y(4.0), riserX = X(2.78);

    const hexPath = (cx, cy, r, rot) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (rot || 0) + i*Math.PI/3;
        const x = cx + Math.cos(a)*r, y = cy + Math.sin(a)*r;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
    };
    const label = (text, x, y, on, col) => {
      ctx.fillStyle = on ? (col || accent) : '#4a5451';
      ctx.font = `bold ${Math.max(4, 5*S*Math.min(1.4, k*1.2))}px Courier New`; ctx.textAlign = 'center';
      ctx.fillText(text, x, y); ctx.textAlign = 'left';
    };

    // ── Site pad ──
    ctx.fillStyle = 'rgba(70,78,76,0.30)';
    ctx.beginPath(); ctx.roundRect(X(0.3), Y(0.3), 20.4*u, 20.4*v, 6*S); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = S;
    for (let q = 3; q < 21; q += 3) {
      ctx.beginPath(); ctx.moveTo(X(q), Y(0.3)); ctx.lineTo(X(q), Y(20.7)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(0.3), Y(q)); ctx.lineTo(X(20.7), Y(q)); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(232,200,32,0.30)'; ctx.lineWidth = 1.2*S;
    ctx.setLineDash([8*S, 6*S]);
    ctx.beginPath(); ctx.roundRect(X(0.3), Y(0.3), 20.4*u, 20.4*v, 6*S); ctx.stroke();
    ctx.setLineDash([]);
    // hexagonal apron round the containment
    ctx.fillStyle = 'rgba(96,104,100,0.28)'; hexPath(dcx, dcy + dep*0.5, dr*1.32, Math.PI/6); ctx.fill();
    ctx.strokeStyle = 'rgba(64,255,208,0.18)'; ctx.lineWidth = 1.2*S;
    ctx.setLineDash([7*S, 5*S]); hexPath(dcx, dcy + dep*0.5, dr*1.32, Math.PI/6); ctx.stroke(); ctx.setLineDash([]);

    // ── Pipework and belts (under the buildings) ──
    // MOX in along the top row to the magazine.
    _wfPipe([[px + 12*S, aRod.y], [glX, aRod.y]], S, t, !!e._hasRods, accent);
    _wfPipe([[wallIn, aRod.y], [mgX + 4*S, aRod.y]], S, t, !!e._hasRods, accent);
    // Steam: out of the generator hall, west along the north corridor, down
    // the riser beside the gallery and out of its wall.
    _wfPipe([[px + 12*S, aSteam.y], [glX, aSteam.y]], S, t, gen, STEAM);
    _wfPipe([[sgX + 4*S, stmY], [riserX, stmY], [riserX, aSteam.y], [wallIn - 2*S, aSteam.y]], S*1.2, t, gen, STEAM);
    // Secondary sodium: each IHX hands its heat on to the generator hall.
    _wfPipe([[lpUR.x, lpUR.y], [sgX + 6*S, lpUR.y]], S*1.3, t, gen, SODIUM);
    _wfPipe([[lpUL.x, lpUL.y], [lpUL.x, naY], [sgX + 6*S, naY]], S*1.3, t, gen, SODIUM);
    _wfPipe([[lpB.x, lpB.y], [X(17.2), lpB.y], [X(17.2), sgY + sgH - 6*S]], S*1.3, t, gen, SODIUM);
    // Primary loop arms: hot leg out of the core, cold leg back.
    loops.forEach((lp) => {
      const ex = dcx + Math.cos(lp.a)*dr*0.9, ey = dcy + Math.sin(lp.a)*dr*0.9;
      _wfPipe([[ex, ey], [lp.x, lp.y]], S*1.4, t, gen, SODIUM);
      const rx2 = Math.cos(lp.a + 0.3), ry2 = Math.sin(lp.a + 0.3);
      _wfPipe([[lp.x - rx2*lr*0.4, lp.y - ry2*lr*0.4], [dcx + rx2*dr*0.9, dcy + ry2*dr*0.9]], S*1.1, t, gen, 'rgba(110,210,255,0.9)');
    });
    // Cryogenic Coolant: in at the gallery, into the surge tank, and split
    // three ways — one leg per loop.
    const cOn = !!e._cooled;
    _wfPipe([[px + 12*S, aCool.y], [glX, aCool.y]], S, t, cOn, CRYO);
    _wfPipe([[wallIn, aCool.y], [tkX, aCool.y]], S*1.2, t, cOn, CRYO);
    _wfPipe([[X(3.6), aCool.y], [X(3.6), lpUL.y + lr*0.5]], S, t, cOn, CRYO);
    _wfPipe([[X(10.4), tkY], [X(10.4), lpB.y + lr*0.3]], S, t, cOn, CRYO);
    _wfPipe([[tkX, tkY], [X(12.85), tkY], [X(12.85), lpUR.y], [lpUR.x, lpUR.y]], S, t, cOn, CRYO);
    // Spent fuel down to the cask farm and out of the east wall.
    const wy = aWaste.y;
    _wfPipe([[X(12.3), Y(10.4)], [X(12.3), Y(17.4)], [ckX + 6*S, Y(17.4)]], S, t, !!e._wasteOut, '#d0e040');
    _wfPipe([[px + W - 12*S, wy], [ckX + ckW - 4*S, wy]], S, t, !!e._wasteOut, '#d0e040');
    // Fuel transfer chute: magazine → core.
    _wfConveyor(X(7.6), mgY + mgH - 4*S, X(7.6), Y(6.3), S, t, gen && !!e._hasRods, accent);
    // Graphite: port → reflector store → core.
    if (aGr) {
      ctx.save(); if (!grOpen) ctx.globalAlpha *= 0.45;
      _wfConveyor(aGr.x, py + H - 14*S, aGr.x, ry + rh - 4*S, S, t, !!e._hasGraphite && grPct < 1, '#9aa2b0');
      _wfConveyor(X(7.9), ry + 4*S, X(7.9), Y(11.8), S, t, !!e._reflected && gen, '#9aa2b0');
      ctx.restore();
    }

    // ── Valve gallery ──
    _wfShadow(glX, glY, glW, glH, S, 3*S);
    const ag = ctx.createLinearGradient(glX, 0, glX + glW, 0);
    ag.addColorStop(0, '#76827f'); ag.addColorStop(0.55, '#5a6663'); ag.addColorStop(1, '#3a4644');
    ctx.fillStyle = ag; ctx.strokeStyle = '#1c2422'; ctx.lineWidth = 1.5*S;
    ctx.beginPath(); ctx.roundRect(glX, glY, glW, glH, 3*S); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.8*S;
    ctx.beginPath(); ctx.moveTo(glX + 2*S, glY + glH - 3*S); ctx.lineTo(glX + 2*S, glY + 2*S); ctx.lineTo(glX + glW - 2*S, glY + 2*S); ctx.stroke();
    _wfHazardStripe(glX + 2*S, glY + 3*S, glW - 4*S, 3*S, S);
    _wfHazardStripe(glX + 2*S, glY + glH - 6*S, glW - 4*S, 3*S, S);
    // roof louvres between the penetrations, and a lit window strip
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = S;
    for (let q = 1; q < 19; q++) {
      const ly = glY + glH*q/19;
      if ([aRod.y, aSteam.y, aCool.y].some(y => Math.abs(y - ly) < 12*S)) continue;
      ctx.beginPath(); ctx.moveTo(glX + 4*S, ly); ctx.lineTo(glX + glW*0.62, ly); ctx.stroke();
      ctx.fillStyle = gen ? `rgba(255,${214 + (q*29)%36},150,0.9)` : '#1c2426';
      ctx.fillRect(glX + glW*0.72, ly - 2*S, glW*0.16, 4*S);
    }
    [[aRod, !!e._hasRods, accent], [aSteam, gen, '#e8f4ff'], [aCool, cOn, '#ffffff']].forEach(([a, on, col]) => {
      const vx = glX + glW*0.5, vy = a.y, vr = Math.min(glW*0.30, 9*S);
      ctx.fillStyle = '#1e2624'; ctx.beginPath(); ctx.arc(vx, vy, vr + 2*S, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = on ? col : '#5a6462'; ctx.lineWidth = 1.6*S;
      ctx.beginPath(); ctx.arc(vx, vy, vr, 0, Math.PI*2); ctx.stroke();
      // Six-spoke handwheel — the hex motif carried down to the fittings.
      for (let q = 0; q < 6; q++) { const a2 = q*Math.PI/3; ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx + Math.cos(a2)*vr, vy + Math.sin(a2)*vr); ctx.stroke(); }
      if (on) { ctx.fillStyle = col; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(vx, vy, vr + 5*S, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }
    });
    // The cool wall port carries a cryo tag: this reactor drinks Cryogenic Coolant.
    ctx.fillStyle = gen && !cOn ? '#ff5030' : (cOn ? '#ffffff' : '#48524f');
    ctx.font = `bold ${Math.max(4, 5*S)}px Courier New`; ctx.textAlign = 'center';
    ctx.fillText('CRYO', glX + glW*0.5, aCool.y + 17*S); ctx.textAlign = 'left';

    // ── Three intermediate heat exchangers ──
    loops.forEach((lp, i) => {
      // hex plinth
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; hexPath(lp.x + 5*S, lp.y + 6*S, lr*1.25, 0); ctx.fill();
      ctx.fillStyle = '#4a5552'; ctx.strokeStyle = '#1a2220'; ctx.lineWidth = S;
      hexPath(lp.x, lp.y, lr*1.25, 0); ctx.fill(); ctx.stroke();
      // insulated shell
      ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.beginPath(); ctx.arc(lp.x + 4*S, lp.y + 5*S, lr, 0, Math.PI*2); ctx.fill();
      const lg = ctx.createRadialGradient(lp.x - lr*0.4, lp.y - lr*0.45, lr*0.08, lp.x, lp.y, lr);
      lg.addColorStop(0, '#c4d0cc'); lg.addColorStop(0.55, '#76847f'); lg.addColorStop(1, '#2a3432');
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(lp.x, lp.y, lr, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#141c1a'; ctx.lineWidth = 1.4*S; ctx.stroke();
      ctx.strokeStyle = 'rgba(20,28,26,0.35)'; ctx.lineWidth = 1.2*S;
      [0.82, 0.62].forEach(fr => { ctx.beginPath(); ctx.arc(lp.x, lp.y, lr*fr, 0, Math.PI*2); ctx.stroke(); });
      // Sodium temperature ring round the head while the loop carries heat.
      if (gen || heat > 0.3) {
        const beat = 0.55 + 0.3*Math.sin(t*2.2 + i*2.1);
        ctx.strokeStyle = heat > 0.75 ? `rgba(255,70,40,${beat.toFixed(3)})` : `rgba(255,160,70,${beat.toFixed(3)})`;
        ctx.lineWidth = 2.2*S; ctx.beginPath(); ctx.arc(lp.x, lp.y, lr*0.72, 0, Math.PI*2); ctx.stroke();
      }
      // head manway with a bolt ring
      ctx.fillStyle = '#39423f'; ctx.strokeStyle = '#141a18'; ctx.lineWidth = S;
      ctx.beginPath(); ctx.arc(lp.x, lp.y, lr*0.3, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8a9692';
      for (let q = 0; q < 8; q++) { const a2 = q*Math.PI/4; ctx.beginPath(); ctx.arc(lp.x + Math.cos(a2)*lr*0.23, lp.y + Math.sin(a2)*lr*0.23, 1.1*S, 0, Math.PI*2); ctx.fill(); }
      // pump drum on the shoulder
      const pmx = lp.x + lr*0.62, pmy = lp.y - lr*0.62, pmr = lr*0.32;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(pmx + 3*S, pmy + 4*S, pmr, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#2e3836'; ctx.strokeStyle = '#101614'; ctx.beginPath(); ctx.arc(pmx, pmy, pmr, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      _fcFan(pmx, pmy, pmr*0.78, S, t + i*0.8, gen, 7);
      label(`IHX${i + 1}`, lp.x, lp.y + lr*1.25 + 7*S, gen);
    });

    // ── Hexagonal containment: a raised prism ──
    ctx.fillStyle = 'rgba(0,0,0,0.40)'; hexPath(dcx + 9*S, dcy + dep + 10*S, dr + 2*S, Math.PI/6); ctx.fill();
    const wg = ctx.createLinearGradient(0, dcy, 0, dcy + dr + dep);
    wg.addColorStop(0, '#5c6863'); wg.addColorStop(1, '#2a3330');
    ctx.fillStyle = wg; hexPath(dcx, dcy + dep, dr, Math.PI/6); ctx.fill();
    ctx.strokeStyle = '#141a18'; ctx.lineWidth = 1.4*S; ctx.stroke();
    // corner arrises down the south walls
    ctx.strokeStyle = 'rgba(10,14,12,0.6)'; ctx.lineWidth = S;
    [Math.PI/6, Math.PI/2, Math.PI*5/6].forEach(a => {
      const vx = dcx + Math.cos(a)*dr, vy = dcy + Math.sin(a)*dr;
      ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx, vy + dep); ctx.stroke();
    });
    // roof
    const cg = ctx.createLinearGradient(dcx - dr, dcy - dr, dcx + dr, dcy + dr);
    cg.addColorStop(0, '#e4eae4'); cg.addColorStop(0.5, '#a6b0aa'); cg.addColorStop(1, '#56625e');
    ctx.fillStyle = cg; hexPath(dcx, dcy, dr, Math.PI/6); ctx.fill();
    ctx.strokeStyle = '#1e2624'; ctx.lineWidth = 1.6*S; ctx.stroke();
    // roof panel seams: spokes to the corners and two concentric courses
    ctx.strokeStyle = 'rgba(30,40,36,0.28)'; ctx.lineWidth = S;
    for (let q = 0; q < 6; q++) {
      const a = Math.PI/6 + q*Math.PI/3;
      ctx.beginPath(); ctx.moveTo(dcx + Math.cos(a)*dr*0.68, dcy + Math.sin(a)*dr*0.68); ctx.lineTo(dcx + Math.cos(a)*dr, dcy + Math.sin(a)*dr); ctx.stroke();
    }
    [0.90, 0.78].forEach(fr => { hexPath(dcx, dcy, dr*fr, Math.PI/6); ctx.stroke(); });
    // a louvred vent on every facet
    for (let q = 0; q < 6; q++) {
      const a = q*Math.PI/3, fx = dcx + Math.cos(a)*dr*0.79, fy = dcy + Math.sin(a)*dr*0.79;
      ctx.save(); ctx.translate(fx, fy); ctx.rotate(a + Math.PI/2);
      const vw = dr*0.22, vh = dr*0.07;
      ctx.fillStyle = '#3e4844'; ctx.fillRect(-vw/2, -vh/2, vw, vh);
      ctx.strokeStyle = 'rgba(200,210,204,0.35)'; ctx.lineWidth = 0.7*S;
      for (let l = 1; l < 6; l++) { const lx = -vw/2 + vw*l/6; ctx.beginPath(); ctx.moveTo(lx, -vh/2 + S); ctx.lineTo(lx, vh/2 - S); ctx.stroke(); }
      ctx.restore();
    }
    // perimeter walkway handrail
    ctx.strokeStyle = 'rgba(216,168,32,0.75)'; ctx.lineWidth = 1.2*S;
    ctx.setLineDash([4*S, 3*S]); hexPath(dcx, dcy, dr*0.95, Math.PI/6); ctx.stroke(); ctx.setLineDash([]);
    // buttress pylons on the corners, each carrying a status lamp
    for (let q = 0; q < 6; q++) {
      const a = Math.PI/6 + q*Math.PI/3;
      const bx = dcx + Math.cos(a)*dr, by = dcy + Math.sin(a)*dr, bs = 6.5*S*Math.max(0.7, k);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(bx - bs + 3*S, by - bs + 4*S, bs*2, bs*2);
      const bg = ctx.createLinearGradient(bx - bs, by - bs, bx + bs, by + bs);
      bg.addColorStop(0, '#b8c2bc'); bg.addColorStop(1, '#4e5a56');
      ctx.fillStyle = bg; ctx.strokeStyle = '#1e2624'; ctx.lineWidth = S;
      ctx.beginPath(); ctx.roundRect(bx - bs, by - bs, bs*2, bs*2, 1.5*S); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0c1010'; ctx.beginPath(); ctx.arc(bx, by, 3.2*S, 0, Math.PI*2); ctx.fill();
      if (lampCol) {
        ctx.fillStyle = lampCol; ctx.beginPath(); ctx.arc(bx, by, 2.3*S, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 0.28; ctx.beginPath(); ctx.arc(bx, by, 7*S, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
      }
    }
    // reactor head: a steel disc on a bolt ring, over the core well
    ctx.fillStyle = '#1c2426'; ctx.beginPath(); ctx.arc(dcx, dcy, dr*0.67, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#0a0e10'; ctx.lineWidth = 2*S; ctx.stroke();
    ctx.fillStyle = '#7c8884';
    for (let q = 0; q < 30; q++) { const a = q*Math.PI/15; ctx.beginPath(); ctx.arc(dcx + Math.cos(a)*dr*0.645, dcy + Math.sin(a)*dr*0.645, 1.2*S, 0, Math.PI*2); ctx.fill(); }
    ctx.fillStyle = '#0e1416'; ctx.beginPath(); ctx.arc(dcx, dcy, dr*0.61, 0, Math.PI*2); ctx.fill();

    // ── Core: a hexagonal assembly lattice, glowing with load and heat ──
    // Flat-top hex packing: columns step 1.5r, rows step √3·r and the odd
    // columns drop half a row. Anything else leaves the assemblies either
    // overlapping or floating apart. Three rings: 37 assemblies, each with
    // its control-rod drive showing as a dark stud.
    const cr = dr*0.098, sp = cr*1.06;
    const load = gen ? 1 : (rodPct > 0 ? 0.25 : 0.08);
    // The tint holds teal through normal running and only swings to orange
    // and then red over the top two thirds of the heat climb — a core that
    // pinked at the first degree would read as in trouble when it is fine.
    const hm = Math.max(0, (heat - 0.35)/0.65);
    const rC = Math.round(64 + 191*hm), gC = Math.round(255 - 150*hm), bC = Math.round(208 - 190*hm);
    for (let q = -3; q <= 3; q++) for (let r2 = -3; r2 <= 3; r2++) {
      if (Math.abs(q + r2) > 3) continue;
      const ax = dcx + sp*1.5*q, ay = dcy + sp*Math.sqrt(3)*(r2 + q/2);
      const d = Math.hypot(ax - dcx, ay - dcy) / (sp*5);
      const flick = 0.72 + 0.28*Math.sin(t*2.4 + q*1.7 + r2*2.3);
      const lv = load*flick*(1 - d*0.4);
      ctx.fillStyle = `rgba(${rC},${gC},${bC},${(0.18 + 0.77*lv).toFixed(3)})`;
      hexPath(ax, ay, cr, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(8,16,14,0.75)'; ctx.lineWidth = 0.8*S; ctx.stroke();
      ctx.fillStyle = 'rgba(6,12,10,0.7)'; ctx.beginPath(); ctx.arc(ax, ay, cr*0.3, 0, Math.PI*2); ctx.fill();
    }
    // Core halo.
    if (load > 0.2 || heat > 0.02) {
      const hb = crit ? 0.55 + 0.45*Math.sin(t*9) : 0.85 + 0.15*Math.sin(t*2.6);
      const hg = ctx.createRadialGradient(dcx, dcy, dr*0.1, dcx, dcy, dr*1.3);
      const a0 = (0.22*load + 0.55*heat)*hb;
      hg.addColorStop(0, `rgba(${rC},${Math.round(255 - 170*hm)},${bC},${a0.toFixed(3)})`);
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(dcx, dcy, dr*1.3, 0, Math.PI*2); ctx.fill();
      if (heat > 0.5) _wfSmoke(dcx + dr*0.25, dcy - dr*0.7, S*(0.9 + heat), t, '255,238,228', true, 0.25 + 0.35*heat);
    }
    // Graphite reflector ring: a band of dark machined blocks round the
    // lattice, catching a cold silver light that circles it while it works.
    if (e._reflected) {
      const rr = dr*0.71;
      ctx.strokeStyle = '#121418'; ctx.lineWidth = 7*S; hexPath(dcx, dcy, rr, 0); ctx.stroke();
      // block joints round the band
      ctx.strokeStyle = 'rgba(80,86,96,0.8)'; ctx.lineWidth = 0.7*S;
      for (let q = 0; q < 24; q++) {
        const a = q*Math.PI/12, c0 = Math.cos(a), s0 = Math.sin(a);
        ctx.beginPath(); ctx.moveTo(dcx + c0*(rr - 3.2*S), dcy + s0*(rr - 3.2*S)); ctx.lineTo(dcx + c0*(rr + 3.2*S), dcy + s0*(rr + 3.2*S)); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(170,180,196,0.7)'; ctx.lineWidth = 1.1*S; hexPath(dcx, dcy, rr + 3.4*S, 0); ctx.stroke();
      ctx.strokeStyle = 'rgba(120,130,146,0.5)'; ctx.lineWidth = 0.8*S; hexPath(dcx, dcy, rr - 3.4*S, 0); ctx.stroke();
      // a cold silver glint chasing round the band
      const sweep = t*0.9;
      for (let q = 0; q < 6; q++) {
        const a0 = q*Math.PI/3, a1 = a0 + Math.PI/3;
        const lit = Math.pow(Math.max(0, Math.cos(sweep - (a0 + Math.PI/6))), 2);
        if (lit < 0.05) continue;
        const p0 = [dcx + Math.cos(a0)*rr, dcy + Math.sin(a0)*rr], p1 = [dcx + Math.cos(a1)*rr, dcy + Math.sin(a1)*rr];
        ctx.strokeStyle = `rgba(200,220,255,${(0.35*lit).toFixed(3)})`; ctx.lineWidth = 6*S;
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
        ctx.strokeStyle = `rgba(240,246,255,${(0.95*lit).toFixed(3)})`; ctx.lineWidth = 1.8*S;
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
      }
    }

    // ── Rotating shield plug: two eccentric decks over the core ──
    // This is how a fast reactor is refuelled — the decks index round until
    // the transfer arm sits over the assembly being swapped.
    const spin = gen ? t*0.10 : 0.8;
    ctx.save(); ctx.translate(dcx, dcy);
    [[dr*0.60, spin, 'rgba(150,164,158,0.55)'], [dr*0.34, -spin*1.7, 'rgba(184,198,190,0.6)']].forEach(([pr, ang, col], i) => {
      ctx.save(); ctx.rotate(ang); ctx.translate(i ? dr*0.16 : 0, 0);
      ctx.strokeStyle = col; ctx.lineWidth = 2*S;
      ctx.beginPath(); ctx.arc(0, 0, pr, 0, Math.PI*2); ctx.stroke();
      ctx.strokeStyle = 'rgba(210,222,214,0.35)'; ctx.lineWidth = 1.2*S;
      for (let q = 0; q < 6; q++) { const a2 = q*Math.PI/3; ctx.beginPath(); ctx.moveTo(Math.cos(a2)*pr*0.55, Math.sin(a2)*pr*0.55); ctx.lineTo(Math.cos(a2)*pr, Math.sin(a2)*pr); ctx.stroke(); }
      // Index key on the rim; the inner deck carries the transfer arm.
      ctx.fillStyle = gen ? accent : '#5a6461';
      ctx.beginPath(); ctx.arc(pr, 0, 2.4*S, 0, Math.PI*2); ctx.fill();
      if (i) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(2*S, -2*S, pr, 6*S);
        ctx.fillStyle = '#c8a828'; ctx.strokeStyle = '#4a3a10'; ctx.lineWidth = S;
        ctx.fillRect(0, -3*S, pr*0.9, 6*S); ctx.strokeRect(0, -3*S, pr*0.9, 6*S);
        ctx.fillStyle = '#2a2a24'; ctx.fillRect(pr*0.62, -4.5*S, 6*S, 9*S);
      }
      ctx.restore();
    });
    ctx.restore();
    ctx.fillStyle = '#5e6a66'; ctx.strokeStyle = '#141c1a'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.arc(dcx, dcy, dr*0.13, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    _wfTrefoil(dcx, dcy, dr*0.1, '#e8c820', '#1a1608');

    // ── Decay-heat air coolers ──
    // Two forced-draft banks. They run with the plant and keep running on a
    // hot core, so spinning fans over a dark reactor mean it is shedding heat.
    const fansOn = gen || heat > 0.25;
    [X(9.2), X(12.45)].forEach((bx, b) => {
      _wfShadow(bx, drY, drW, drH, S, 3*S);
      ctx.fillStyle = '#3c4644'; ctx.strokeStyle = '#141c1a'; ctx.lineWidth = 1.4*S;
      ctx.beginPath(); ctx.roundRect(bx, drY, drW, drH, 3*S); ctx.fill(); ctx.stroke();
      // finned coil showing between the fan shrouds
      ctx.strokeStyle = 'rgba(150,170,164,0.25)'; ctx.lineWidth = 0.7*S;
      for (let fx = bx + 4*S; fx < bx + drW - 3*S; fx += 2.5*S) { ctx.beginPath(); ctx.moveTo(fx, drY + 3*S); ctx.lineTo(fx, drY + drH - 3*S); ctx.stroke(); }
      for (let q = 0; q < 3; q++) {
        const fx = bx + drW*(q + 0.5)/3, fy = drY + drH*0.5, fr = Math.min(drW/3, drH)*0.40;
        ctx.fillStyle = '#1a2220'; ctx.beginPath(); ctx.arc(fx, fy, fr + 2*S, 0, Math.PI*2); ctx.fill();
        _fcFan(fx, fy, fr, S, t + q*0.4 + b, fansOn, 9);
      }
      ctx.fillStyle = fansOn ? accent : '#2a3432';
      ctx.fillRect(bx + drW - 7*S, drY + 3*S, 4*S, 3*S);
    });
    label('DECAY HEAT COOLERS', X(12.3), drY + drH + 8*S, fansOn);

    // ── Steam generator hall: four generators on a 2×2 grid ──
    _wfShadow(sgX, sgY, sgW, sgH, S, 3*S);
    const sgg = ctx.createLinearGradient(sgX, sgY, sgX + sgW, sgY + sgH);
    sgg.addColorStop(0, '#56625e'); sgg.addColorStop(1, '#323c39');
    ctx.fillStyle = sgg; ctx.strokeStyle = '#141c1a'; ctx.lineWidth = 1.5*S;
    ctx.beginPath(); ctx.roundRect(sgX, sgY, sgW, sgH, 3*S); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(64,255,208,0.12)'; ctx.lineWidth = S;
    ctx.strokeRect(sgX + 3*S, sgY + 3*S, sgW - 6*S, sgH - 6*S);
    // grated walkways between the generators
    ctx.fillStyle = 'rgba(20,26,24,0.55)';
    ctx.fillRect(sgX + sgW*0.5 - 3*S, sgY + 5*S, 6*S, sgH - 10*S);
    ctx.fillRect(sgX + 5*S, sgY + sgH*0.5 - 3*S, sgW - 10*S, 6*S);
    for (let i = 0; i < 4; i++) {
      const cx2 = sgX + sgW*(0.27 + 0.46*(i % 2)), cy2 = sgY + sgH*(0.26 + 0.48*Math.floor(i/2));
      const r2 = Math.min(sgW*0.19, sgH*0.16);
      ctx.strokeStyle = 'rgba(216,168,32,0.7)'; ctx.lineWidth = 1.2*S;
      ctx.setLineDash([3*S, 2*S]); ctx.beginPath(); ctx.arc(cx2, cy2, r2 + 3.5*S, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(cx2 + 3*S, cy2 + 4*S, r2, 0, Math.PI*2); ctx.fill();
      const cgr = ctx.createRadialGradient(cx2 - r2*0.35, cy2 - r2*0.35, 1, cx2, cy2, r2);
      cgr.addColorStop(0, '#dce4de'); cgr.addColorStop(0.6, '#818c88'); cgr.addColorStop(1, '#2e3836');
      ctx.fillStyle = cgr; ctx.beginPath(); ctx.arc(cx2, cy2, r2, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#1c2422'; ctx.lineWidth = S; ctx.stroke();
      ctx.strokeStyle = 'rgba(28,36,34,0.35)'; ctx.beginPath(); ctx.arc(cx2, cy2, r2*0.7, 0, Math.PI*2); ctx.stroke();
      ctx.fillStyle = '#2e3836'; ctx.beginPath(); ctx.arc(cx2, cy2, r2*0.32, 0, Math.PI*2); ctx.fill();
      if (gen) { ctx.fillStyle = `rgba(255,160,90,${0.35 + 0.22*Math.sin(t*2 + i)})`; ctx.beginPath(); ctx.arc(cx2, cy2, r2*0.24, 0, Math.PI*2); ctx.fill(); }
      _wfSmoke(cx2 + r2*0.5, cy2 - r2*0.5, S*0.85, t + i*0.6, '238,244,242', gen, 0.5);
    }
    label('STEAM GEN x4', sgX + sgW*0.5, sgY + sgH + 9*S, gen);

    // ── Control block: roof plant, readout and annunciators ──
    _fcBuilding(cbX, cbY, cbW, cbH, S, t, {
      lit: gen, spin: gen, wall: '#2e3836', roof0: '#7a8682', roof1: '#525e5a',
      units: [[0.22, 0.86], [0.5, 0.86], [0.78, 0.86]],
    });
    const panX = cbX + 4*S, panY = cbY + 4*S, panW = cbW - 8*S, panH = (cbH - 4*S)*0.70;
    ctx.fillStyle = '#04100c'; ctx.strokeStyle = '#10382c'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.roundRect(panX, panY, panW, panH, 2*S); ctx.fill(); ctx.stroke();
    ctx.font = `${Math.max(4, S*5.5*Math.min(1.6, k*1.4))}px Courier New`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = gen ? '#00ffc0' : '#ff4040';
    ctx.fillText(`STM:${gen ? formatPower(Math.round(e._currentOutput||0)) : ' 0 kW'}`, panX + 3*S, panY + panH*0.13);
    ctx.fillStyle = rodPct < 0.2 ? '#ff6040' : accent;
    ctx.fillText(`MOX:${Math.round(rodPct*100).toString().padStart(3)}%`, panX + 3*S, panY + panH*0.31);
    ctx.fillStyle = wastePct > 0.8 ? '#ff8020' : '#60d0a0';
    ctx.fillText(`CSK:${Math.round(wastePct*100).toString().padStart(3)}%`, panX + 3*S, panY + panH*0.49);
    ctx.textBaseline = 'alphabetic';
    // Heat bar: the MK1 has 60s of margin, this has 35, so it gets a gauge.
    const hbX = panX + 3*S, hbY = panY + panH*0.61, hbW = panW - 6*S, hbH = Math.max(3*S, panH*0.09);
    ctx.fillStyle = '#0a1a16'; ctx.fillRect(hbX, hbY, hbW, hbH);
    ctx.fillStyle = heat > 0.75 ? '#ff4020' : heat > 0.4 ? '#ffb020' : accent;
    ctx.fillRect(hbX, hbY, hbW*Math.min(1, heat), hbH);
    ctx.strokeStyle = 'rgba(255,80,40,0.8)'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.moveTo(hbX + hbW*0.75, hbY - S); ctx.lineTo(hbX + hbW*0.75, hbY + hbH + S); ctx.stroke();
    ctx.strokeStyle = '#1e4a3c'; ctx.strokeRect(hbX, hbY, hbW, hbH);
    // Annunciator row: fuel, coolant, steam, casks, reflector, core heat.
    // Green is good, amber wants attention, flashing red is a fault. A plant
    // with nothing in it (or the placement ghost) shows them all dark.
    const live = gen || !!e._hasRods || cOn || heat > 0 || rodPct > 0 || wastePct > 0;
    const OK = '#30e090', WARN = '#ffb020', FAULT = flash ? '#ff3020' : '#501810', OFF = '#1a2622';
    const ann = !live ? [OFF, OFF, OFF, OFF, OFF, OFF] : [
      e._hasRods ? OK : WARN,
      cOn ? OK : (gen ? FAULT : OFF),
      gen ? OK : OFF,
      wastePct > 0.9 ? FAULT : wastePct > 0.7 ? WARN : OK,
      e._reflected ? OK : OFF,
      heat > 0.75 ? FAULT : heat > 0.4 ? WARN : OK,
    ];
    const anY = panY + panH*0.80, anW = (panW - 6*S)/6;
    ann.forEach((col, q) => {
      const ax = panX + 3*S + anW*q;
      ctx.fillStyle = col; ctx.fillRect(ax + 1*S, anY, anW - 2*S, Math.max(3*S, panH*0.12));
      if (col !== OFF && col !== '#501810') { ctx.globalAlpha = 0.25; ctx.fillRect(ax - 1*S, anY - 2*S, anW + 2*S, Math.max(3*S, panH*0.12) + 4*S); ctx.globalAlpha = 1; }
    });

    // ── MOX magazine (fuel IN) ──
    // Dry storage, laid out on a widely spaced hex grid: MOX is kept apart
    // by geometry so the store itself can never go critical. The cells fill
    // with the rod buffer, so a starved reactor is visibly empty.
    _wfShadow(mgX, mgY, mgW, mgH, S, 3*S);
    ctx.fillStyle = '#4c5450'; ctx.strokeStyle = '#191f1d'; ctx.lineWidth = 1.5*S;
    ctx.beginPath(); ctx.roundRect(mgX, mgY, mgW, mgH, 3*S); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#10161a'; ctx.fillRect(mgX + 5*S, mgY + 5*S, mgW - 10*S, mgH - 10*S);
    const mCols = 10, mRows = 4, mTotal = mCols*mRows, mLit = Math.round(rodPct*mTotal);
    const mcw = (mgW - 12*S)/mCols, mch = (mgH - 12*S)/mRows;
    for (let r2 = 0; r2 < mRows; r2++) for (let q = 0; q < mCols; q++) {
      const idx = r2*mCols + q;
      const ax = mgX + 6*S + mcw*(q + 0.5) + (r2 % 2 ? mcw*0.25 : -mcw*0.1);
      const ay = mgY + 6*S + mch*(r2 + 0.5);
      const on2 = idx < mLit;
      ctx.fillStyle = on2 ? `rgba(64,255,208,${(0.45 + 0.3*Math.sin(t*1.6 + idx)).toFixed(3)})` : 'rgba(70,80,78,0.35)';
      hexPath(ax, ay, Math.min(mcw, mch)*0.36, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(10,18,16,0.7)'; ctx.lineWidth = 0.8*S; ctx.stroke();
    }
    // Transfer arm tracking across the magazine while the reactor runs.
    const arX = mgX + 6*S + (mgW - 18*S)*(0.5 + 0.44*Math.sin(t*(gen ? 0.35 : 0)));
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(arX + 3*S, mgY + 2*S, 6*S, mgH);
    ctx.fillStyle = '#c8a828'; ctx.strokeStyle = '#4a3a10'; ctx.lineWidth = S;
    ctx.fillRect(arX, mgY - 2*S, 6*S, mgH + 4*S); ctx.strokeRect(arX, mgY - 2*S, 6*S, mgH + 4*S);
    label('MOX MAGAZINE', mgX + mgW*0.5, mgY - 4*S, gen || rodPct > 0);

    // ── Graphite reflector store (GRAPHITE IN) ──
    // A rack of hexagonal reflector blocks waiting to go in, filling with the
    // block store, fed by a short belt up from the port.
    if (aGr) {
      ctx.save();
      if (!grOpen) ctx.globalAlpha *= 0.45;
      _wfShadow(rx, ry, rw, rh, S, 2*S);
      ctx.fillStyle = '#34383e'; ctx.strokeStyle = '#121418'; ctx.lineWidth = 1.2*S;
      ctx.beginPath(); ctx.roundRect(rx, ry, rw, rh, 2*S); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#16181c'; ctx.fillRect(rx + 3*S, ry + 3*S, rw - 6*S, rh - 6*S);
      const cols2 = 9, rows2 = 3, lit2 = Math.round(grPct*cols2*rows2);
      const cw2 = (rw - 8*S)/cols2, ch2 = (rh - 8*S)/rows2;
      for (let r2 = 0; r2 < rows2; r2++) for (let q = 0; q < cols2; q++) {
        const idx = r2*cols2 + q, bx = rx + 4*S + cw2*(q + 0.5), by = ry + 4*S + ch2*(r2 + 0.5), br = Math.min(cw2, ch2)*0.44;
        if (idx < lit2) {
          const bg = ctx.createLinearGradient(bx - br, by - br, bx + br, by + br);
          bg.addColorStop(0, '#9aa0aa'); bg.addColorStop(0.4, '#3a3e46'); bg.addColorStop(1, '#16171a');
          ctx.fillStyle = bg; hexPath(bx, by, br, 0); ctx.fill();
          ctx.fillStyle = '#060607'; ctx.beginPath(); ctx.arc(bx, by, br*0.25, 0, Math.PI*2); ctx.fill();
        } else {
          ctx.strokeStyle = 'rgba(90,96,104,0.35)'; ctx.lineWidth = 0.7*S; hexPath(bx, by, br, 0); ctx.stroke();
        }
      }
      label(e._reflected ? 'REFLECTOR +20%' : 'GRAPHITE', rx + rw*0.5, ry - 4*S, !!e._reflected, '#d8e0ee');
      ctx.restore();
    }

    // ── Dry cask farm (SPENT FUEL OUT) ──
    // Two rows of casks on a hardstand, served by a gantry crane that runs
    // along the rows while fuel is coming out.
    _wfShadow(ckX, ckY, ckW, ckH, S, 2*S);
    ctx.fillStyle = '#4a4c32'; ctx.strokeStyle = '#1e2014'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.roundRect(ckX, ckY, ckW, ckH, 2*S); ctx.fill(); ctx.stroke();
    _wfHazardStripe(ckX, ckY, ckW, 4*S, S);
    ctx.fillStyle = 'rgba(120,122,96,0.25)'; ctx.fillRect(ckX + 4*S, ckY + 8*S, ckW - 8*S, ckH - 12*S);
    const casks = 14, perRow = 7;
    for (let q = 0; q < casks; q++) {
      const col = q % perRow, row = Math.floor(q / perRow);
      const cx3 = ckX + ckW*(0.09 + col*0.118), cy3 = ckY + ckH*(0.42 + row*0.34), r3 = Math.min(ckW*0.045, ckH*0.14);
      const filled = q < Math.round(wastePct*casks);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(cx3 + 2*S, cy3 + 2.5*S, r3, 0, Math.PI*2); ctx.fill();
      const kg = ctx.createRadialGradient(cx3 - r3*0.35, cy3 - r3*0.35, 1, cx3, cy3, r3);
      kg.addColorStop(0, filled ? '#c8c890' : '#55574a'); kg.addColorStop(1, filled ? '#6a6a30' : '#2a2c22');
      ctx.fillStyle = kg; ctx.beginPath(); ctx.arc(cx3, cy3, r3, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#161810'; ctx.lineWidth = S; ctx.stroke();
      ctx.strokeStyle = filled ? 'rgba(255,235,140,0.4)' : 'rgba(120,124,104,0.2)';
      ctx.beginPath(); ctx.arc(cx3, cy3, r3*0.55, 0, Math.PI*2); ctx.stroke();
    }
    // gantry rails and the bridge riding on them
    ctx.fillStyle = '#2a2c22';
    ctx.fillRect(ckX + 3*S, ckY + 6*S, ckW - 6*S, 1.6*S); ctx.fillRect(ckX + 3*S, ckY + ckH - 4*S, ckW - 6*S, 1.6*S);
    const gx = ckX + 6*S + (ckW*0.82 - 12*S)*(0.5 + 0.5*Math.sin(t*(e._wasteOut ? 0.3 : 0) + 1.1));
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(gx + 3*S, ckY + 6*S, 6*S, ckH - 8*S);
    ctx.fillStyle = '#d8a820'; ctx.strokeStyle = '#4a3a10'; ctx.lineWidth = S;
    ctx.fillRect(gx, ckY + 4*S, 6*S, ckH - 6*S); ctx.strokeRect(gx, ckY + 4*S, 6*S, ckH - 6*S);
    ctx.fillStyle = '#2a2a24'; ctx.fillRect(gx - 1.5*S, ckY + ckH*(0.42 + 0.17*Math.sin(t*(e._wasteOut ? 0.7 : 0))), 9*S, 7*S);
    _wfTrefoil(ckX + ckW*0.93, ckY + ckH*0.30, Math.min(7*S, ckH*0.13), '#e8c820', '#1a1608');
    label('DRY CASK STORE', ckX + ckW*0.5, ckY - 4*S, !!e._wasteOut || wastePct > 0, '#e0e070');

    // ── Cryogenic Coolant surge tank ──
    _fcVTank(tkX, tkY, tkR, S, { shell: ['#f6f4ff', '#b8b0d8', '#58527a'], band: cOn ? 'rgba(176,144,255,0.95)' : '#4a4660', ladderAngle: 2.4 });
    if (cOn) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let q = 0; q < 6; q++) {
        if (Math.sin(t*3 + q*1.9) < 0.4) continue;
        const a = q*1.05 + 0.3, rr = tkR*(0.35 + 0.1*(q % 3));
        ctx.beginPath(); ctx.arc(tkX + Math.cos(a)*rr, tkY + Math.sin(a)*rr, 1.2*S, 0, Math.PI*2); ctx.fill();
      }
      _wfSmoke(tkX - tkR*0.3, tkY - tkR*0.5, S*0.7, t, '226,220,255', true, 0.3);
    }
    label('CRYO', tkX, tkY + tkR + 9*S, cOn, '#c8b8ff');

    // ── Ventilation stack + aviation lights ──
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(vsX + 5*S, vsY + 6*S, vsR, 0, Math.PI*2); ctx.fill();
    [1, 0.78, 0.56, 0.34].forEach((rf, i) => { ctx.fillStyle = i % 2 ? '#e8e8e0' : '#c83020'; ctx.beginPath(); ctx.arc(vsX, vsY, vsR*rf, 0, Math.PI*2); ctx.fill(); });
    ctx.fillStyle = '#1a1a18'; ctx.beginPath(); ctx.arc(vsX, vsY, vsR*0.2, 0, Math.PI*2); ctx.fill();
    const av = Math.sin(t*3) > 0.3;
    [[vsX + vsR*0.7, vsY - vsR*0.7], [sgX + sgW - 6*S, sgY + 6*S]].forEach(([lx, ly]) => {
      ctx.fillStyle = av ? '#ff3020' : '#501810';
      ctx.beginPath(); ctx.arc(lx, ly, 2.5*S, 0, Math.PI*2); ctx.fill();
      if (av) { ctx.fillStyle = 'rgba(255,60,40,0.25)'; ctx.beginPath(); ctx.arc(lx, ly, 8*S, 0, Math.PI*2); ctx.fill(); }
    });

    // ── Ports ──
    if (aGr) {
      ctx.save(); if (!grOpen) ctx.globalAlpha *= 0.45;
      _portBelt(aGr, S, t, { belt: '#c8d0dc', label: grOpen ? 'GRAPHITE IN' : 'GRAPHITE IN (LOCKED)', on: !!e._hasGraphite, out: false });
      ctx.restore();
    }
    _portBelt(aRod,   S, t, { belt: accent, label: 'MOX IN',    on: !!e._hasRods, out: false });
    _portPipe(aSteam, S, t, { fluid: '#e8f4ff', label: 'STEAM OUT', on: gen, out: true, flow: gen });
    _portPipe(aCool,  S, t, { fluid: '#ffffff', label: 'CRYO IN',   on: cOn, out: false, flow: cOn });
    _portBelt(aWaste, S, t, { belt: '#d0e040', label: 'SPENT FUEL OUT', on: !!e._wasteOut, out: true });

    _wfPlate(crit ? 'CORE CRITICAL' : 'MOX FAST REACTOR', px + W*0.44, py + H*0.035, S, crit ? '#ff5030' : accent, gen || crit);
    _wfLamp(px + W - 7*S, py + 7*S, S, t, gen ? accent : '#ff4040', true);
    ctx.restore();
  }

function renderCoolingTower(e, px, py, t) {
    // Natural-draft hyperboloid: a gently waisted concrete shell (true
    // hyperbola, not the old squared curve), ribbed and weathered, standing
    // on raked air-intake legs over a rippling basin, with a billowing plume,
    // rim aviation lights and a pump house on each line. Ports come from
    // CoolingTowerSystem.getStubs() (H₂O IN on the left face, COOL OUT one
    // row lower on the right). No backdrop. Shares the _wf* helpers.
    const def = EntityDefs[T.COOLINGTOWER];
    const W   = (e.width || def.width) * TILE, H = (e.height || def.height) * TILE;
    const cx  = px + W/2;
    const on  = e.powered;
    // Working only while a reactor is actually drawing on it (_active, set
    // by NuclearSystem.resolveCooling) — a pipe merely touching a port isn't flow.
    const act = !!e._active && !!e._hotConnected && !!e._coolConnected && on && !e._pumpTripped;
    const S   = TILE / 40;
    const accent = '#60c0e0';
    ctx.save();

    const cst   = CoolingTowerSystem.getStubs(e);
    const aHot  = _portAnchor(e, px, py, W, H, cst.hotIn);
    const aCool = _portAnchor(e, px, py, W, H, cst.coldOut);

    const topY = py + H*0.12, baseY = py + H*0.82, footY = py + H*0.90;
    const waistY = topY + (baseY - topY)*0.34;
    const waistHW = W*0.245, baseHW = W*0.345;
    // hw(y) = a·√(1 + ((y − waist)/b)²) — b is set so the base lands on baseHW.
    const b = (baseY - waistY) / Math.sqrt((baseHW/waistHW)**2 - 1);
    const hw = (y) => waistHW * Math.sqrt(1 + ((y - waistY)/b)**2);
    const topHW = hw(topY);
    const shellPath = (dx, dy) => {
      ctx.beginPath();
      const N = 28;
      for (let i = 0; i <= N; i++) { const y = topY + (baseY - topY)*i/N; const x = cx - hw(y); i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy); }
      for (let i = N; i >= 0; i--) { const y = topY + (baseY - topY)*i/N; ctx.lineTo(cx + hw(y) + dx, y + dy); }
      ctx.closePath();
    };

    // ── Pump houses + pipework: hot line into the basin, cooled line back out ──
    const pk = Math.min(1.4, W / (7*TILE));   // pump houses grow a little with the tower
    const phW = 18*S*pk, phH = 16*S*pk;
    const hpX = px + 16*S, hpY = aHot.y - phH/2;
    const cpX = px + W - 16*S - phW, cpY = aCool.y - phH/2;
    _wfPipe([[px + 12*S, aHot.y], [hpX, aHot.y]], S, t, act, 'rgba(70,140,225,0.95)');
    _wfPipe([[hpX + phW*0.5, hpY + phH], [hpX + phW*0.5, footY - 2*S], [cx - baseHW*0.75, footY - 2*S]], S, t, act, 'rgba(70,140,225,0.95)');
    _wfPipe([[cx + baseHW*0.75, footY + 3*S], [cpX + phW*0.5, footY + 3*S], [cpX + phW*0.5, cpY + phH]], S, t, act, 'rgba(90,200,255,0.95)');
    _wfPipe([[cpX + phW, aCool.y], [px + W - 12*S, aCool.y]], S, t, act, 'rgba(90,200,255,0.95)');

    // ── Ground shadow cast by the shell ──
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; shellPath(10*S, 12*S); ctx.fill();

    // ── Cooling basin ──
    const bRX = baseHW*1.06, bRY = 11*S, bCY = footY - 1*S;
    ctx.fillStyle = '#6a6e68'; ctx.beginPath(); ctx.ellipse(cx, bCY, bRX + 3*S, bRY + 3*S, 0, 0, Math.PI*2); ctx.fill();
    const wg = ctx.createLinearGradient(cx - bRX, 0, cx + bRX, 0);
    wg.addColorStop(0, act ? '#1e6a90' : '#1a3a48'); wg.addColorStop(0.5, act ? '#3aa0c8' : '#24505e'); wg.addColorStop(1, act ? '#1e6a90' : '#1a3a48');
    ctx.fillStyle = wg; ctx.beginPath(); ctx.ellipse(cx, bCY, bRX, bRY, 0, 0, Math.PI*2); ctx.fill();
    if (act) {
      for (let q = 0; q < 3; q++) {
        const p = (t*0.5 + q/3) % 1;
        ctx.strokeStyle = `rgba(210,240,255,${0.5*(1 - p)})`; ctx.lineWidth = S;
        ctx.beginPath(); ctx.ellipse(cx, bCY, bRX*(0.2 + p*0.75), bRY*(0.2 + p*0.75), 0, 0, Math.PI*2); ctx.stroke();
      }
    }

    // ── Air-intake legs (raked diagonal columns) ──
    const legs = 18;
    ctx.lineCap = 'round';
    for (let q = 0; q <= legs; q++) {
      const x = cx - baseHW + 2*baseHW*q/legs;
      const dx = (q % 2 ? 5 : -5)*S;
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2.6*S;
      ctx.beginPath(); ctx.moveTo(x + 2*S, baseY + 2*S); ctx.lineTo(x + dx + 2*S, footY - 1*S); ctx.stroke();
      ctx.strokeStyle = '#9a9e96'; ctx.lineWidth = 2*S;
      ctx.beginPath(); ctx.moveTo(x, baseY); ctx.lineTo(x + dx, footY - 3*S); ctx.stroke();
    }

    // ── Shell ──
    const sg = ctx.createLinearGradient(cx - baseHW, 0, cx + baseHW, 0);
    sg.addColorStop(0, '#8e948e'); sg.addColorStop(0.3, '#e2e5de'); sg.addColorStop(0.6, '#b0b4ae'); sg.addColorStop(1, '#62665f');
    ctx.fillStyle = sg; shellPath(0, 0); ctx.fill();
    ctx.save(); shellPath(0, 0); ctx.clip();
    // shade the flare below the waist a touch darker — reads as curvature
    const vg = ctx.createLinearGradient(0, topY, 0, baseY);
    vg.addColorStop(0, 'rgba(0,0,0,0.06)'); vg.addColorStop((waistY - topY)/(baseY - topY), 'rgba(255,255,255,0.05)'); vg.addColorStop(1, 'rgba(0,0,0,0.16)');
    ctx.fillStyle = vg; ctx.fillRect(cx - baseHW, topY, baseHW*2, baseY - topY);
    ctx.strokeStyle = 'rgba(40,44,40,0.14)'; ctx.lineWidth = S;
    for (let fq = -0.9; fq <= 0.91; fq += 0.12) {
      ctx.beginPath();
      for (let i = 0; i <= 20; i++) { const y = topY + (baseY - topY)*i/20; const x = cx + fq*hw(y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(40,44,40,0.10)';
    for (let i = 1; i < 11; i++) { const y = topY + (baseY - topY)*i/11; ctx.beginPath(); ctx.moveTo(cx - hw(y), y); ctx.lineTo(cx + hw(y), y); ctx.stroke(); }
    ctx.fillStyle = 'rgba(60,64,58,0.10)';
    for (let q = 0; q < 9; q++) { const x = cx - topHW*0.85 + q*topHW*0.21; ctx.fillRect(x, topY, 2.5*S, (baseY - topY)*(0.2 + ((q*37) % 5)*0.07)); }
    ctx.restore();
    ctx.strokeStyle = '#4a4e48'; ctx.lineWidth = 1.2*S; shellPath(0, 0); ctx.stroke();
    ctx.strokeStyle = '#6a6e68'; ctx.lineWidth = 3*S;
    ctx.beginPath(); ctx.ellipse(cx, baseY, baseHW, 5*S, 0, 0, Math.PI); ctx.stroke();

    // ── Throat (top opening) with a walkway ring ──
    const tRY = topHW*0.22;
    ctx.fillStyle = '#c8ccc4'; ctx.beginPath(); ctx.ellipse(cx, topY, topHW + 2.5*S, tRY + 2.5*S, 0, 0, Math.PI*2); ctx.fill();
    const ig = ctx.createRadialGradient(cx, topY + tRY*0.3, 1, cx, topY, topHW);
    ig.addColorStop(0, act ? 'rgba(255,190,130,0.5)' : '#1a2020'); ig.addColorStop(0.5, act ? '#3a4a50' : '#141a1a'); ig.addColorStop(1, '#0a0e0e');
    ctx.fillStyle = ig; ctx.beginPath(); ctx.ellipse(cx, topY, topHW, tRY, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#eef0ea'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.ellipse(cx, topY, topHW + 1*S, tRY + 1*S, 0, Math.PI, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = 'rgba(200,60,40,0.7)'; ctx.lineWidth = 0.8*S; ctx.setLineDash([2*S, 3*S]);
    ctx.beginPath(); ctx.ellipse(cx, topY, topHW + 2.5*S, tRY + 2.5*S, 0, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]);

    // ── Plume ──
    // Not drawn here: see renderCoolingTowerPlumes below, which paints every
    // tower's steam after the whole scene.

    // ── Rim aviation lights ──
    const blink = Math.sin(t*3) > 0.2;
    [-1, 1].forEach(sd => {
      const lx = cx + sd*topHW*0.96, ly = topY + 1*S;
      ctx.fillStyle = blink ? '#ff3020' : '#501810'; ctx.beginPath(); ctx.arc(lx, ly, 2.2*S, 0, Math.PI*2); ctx.fill();
      if (blink) { ctx.fillStyle = 'rgba(255,60,40,0.25)'; ctx.beginPath(); ctx.arc(lx, ly, 7*S, 0, Math.PI*2); ctx.fill(); }
    });

    // ── Pump houses ──
    [[hpX, hpY, !!e._hotConnected, '#4a90e0'], [cpX, cpY, !!e._coolConnected, '#5ac8ff']].forEach(([x, y, lit, col], i) => {
      _wfShadow(x, y, phW, phH, S, 2*S);
      ctx.fillStyle = '#5a6268'; ctx.strokeStyle = '#1a2024'; ctx.lineWidth = S;
      ctx.beginPath(); ctx.roundRect(x, y, phW, phH, 2*S); ctx.fill(); ctx.stroke();
      _fcFan(x + phW*0.5, y + phH*0.5, phH*0.3, S, t + i, act, 9);
      ctx.fillStyle = e._pumpTripped ? (Math.sin(t*8) > 0 ? '#ff3020' : '#501810') : lit && on ? col : '#2a2e30';
      ctx.beginPath(); ctx.arc(x + phW - 3*S, y + 3*S, 1.4*S, 0, Math.PI*2); ctx.fill();
      if (e._pumpTripped) {
        ctx.strokeStyle = `rgba(255,60,40,${(0.5 + 0.4*Math.sin(t*8)).toFixed(3)})`; ctx.lineWidth = 1.5*S;
        ctx.strokeRect(x - 1*S, y - 1*S, phW + 2*S, phH + 2*S);
      }
    });

    _portPipe(aHot,  S, t, { fluid: '#4a90e0', label: 'H₂O IN',   on: !!e._hotConnected,  out: false, flow: act });
    _portPipe(aCool, S, t, { fluid: '#5ac8ff', label: 'COOL OUT', on: !!e._coolConnected, out: true,  flow: act });

    const temp = e._waterTempOut;
    if (e._pumpTripped) _wfPlate(`PUMPS TRIPPED${e.powered ? `: ${Math.ceil(e._pumpRestart || 0)}s` : ''}`, cx, py + H*0.965, S, '#ff5030', true);
    else _wfPlate(temp != null ? `COOLING  ${Math.round(temp)}°C` : 'COOLING TOWER', cx, py + H*0.965, S, accent, act);
    _wfLamp(px + W - 7*S, py + 7*S, S, t, accent, on);
    ctx.restore();
  }

// ── Cooling tower steam ─────────────────────────────────────────────────
// Every MK1 tower's plume, painted once the whole scene is down (called from
// the render loop beside the lightning fires). Drawn inside the tower's own
// sprite, the column was sliced off where the cached bitmap's margin ended
// and painted over by whatever stood above the tower; out here it rises over
// everything and keeps moving whatever the sprite cache is doing.
//
// The look is a natural-draft plume: a dense, bright, near-opaque mass of
// billows boiling up out of the throat, lit on the sun side and grey on the
// underside, leaning downwind as it climbs, swelling and only thinning out
// near its top. It is built from one pre-shaded puff bitmap stamped many
// times at different sizes, so a screenful of towers costs drawImage calls
// rather than gradients.
//
// It builds up rather than switching on: when the tower starts, the steam
// first wisps out of the throat and the column climbs and thickens over
// PLUME_RISE seconds; when it stops, the column stays where it is and thins
// away over PLUME_FALL. Driven by the animation clock, so it holds while
// paused and keeps pace at 2×–10×. A tower already running when it is first
// drawn (a loaded save) starts at full.
//
// The Cryogenic Cooling Tower gets the same plume in a colder key: icy
// blue-white billows shaded steel-blue, a faint cyan glow down in its throat
// and ice crystals glinting in the lower column. (Its own sprite adds the
// heavy cold fog that spills down the shell and pools on the ground.)
const CoolingTowerPlume = (() => {
  const PLUME_RISE = 10, PLUME_FALL = 5, IDLE_HOLD = 3;
  const LIFE = 13;          // seconds a billow takes to climb the column
  const PUFFS = 26;         // billows in the column at once
  const _puff = {};

  // One cauliflower billow: a soft disc, its own little lobes round the
  // rim, shaded toward the lower right and lit at the upper left. Warm grey
  // for the MK1, an icy palette for the cryogenic tower.
  const PALETTES = {
    warm: { body: '255,255,255', shade: ['118,128,140', 0.55], shadeEdge: '150,160,170', hl: '255,255,255' },
    cold: { body: '214,238,255', shade: ['56,108,182', 0.72],  shadeEdge: '110,170,228', hl: '245,253,255' },
  };
  function puffSprite(kind = 'warm') {
    if (_puff[kind]) return _puff[kind];
    const P = PALETTES[kind];
    const N = 128, c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    const blob = (x, y, r, a) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${P.body},${a})`);
      gr.addColorStop(0.55, `rgba(${P.body},${a * 0.92})`);
      gr.addColorStop(1, `rgba(${P.body},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    };
    blob(64, 66, 52, 1);
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * Math.PI * 2 + 0.4;
      blob(64 + Math.cos(a) * 30, 66 + Math.sin(a) * 28, 26 + (k % 3) * 4, 0.9);
    }
    // Shade only where there is steam.
    g.globalCompositeOperation = 'source-atop';
    const sh = g.createRadialGradient(84, 92, 4, 76, 84, 70);
    sh.addColorStop(0, `rgba(${P.shade[0]},${P.shade[1]})`); sh.addColorStop(1, `rgba(${P.shadeEdge},0)`);
    g.fillStyle = sh; g.fillRect(0, 0, N, N);
    const hl = g.createRadialGradient(46, 42, 2, 50, 46, 46);
    hl.addColorStop(0, `rgba(${P.hl},0.9)`); hl.addColorStop(1, `rgba(${P.hl},0)`);
    g.fillStyle = hl; g.fillRect(0, 0, N, N);
    g.globalCompositeOperation = 'source-over';
    return (_puff[kind] = c);
  }

  // The tower's throat in world px — the same geometry renderCoolingTower /
  // renderCryoCoolingTower use. `mRX`/`mRY` is the mouth the steam comes up
  // through (the MK1's throat ellipse; the cryo tower's fan-deck ring).
  function throat(e) {
    if (e.type === T.COOLINGTOWER2) {
      const def = EntityDefs[T.COOLINGTOWER2];
      const W = (e.width || def.width) * TILE;
      const H_LAYOUT = (def.layoutHeight || 19) * TILE, H0 = 17 * TILE;
      const py = e.row * TILE;
      const topY = py + H0 * 0.155, baseY = py + H_LAYOUT - H0 * 0.335;
      const waistY = topY + (baseY - topY) * 0.40;
      const waistHW = W * 0.215, baseHW = W * 0.315;
      const b = (baseY - waistY) / Math.sqrt((baseHW / waistHW) ** 2 - 1);
      const hw = (y) => waistHW * Math.sqrt(1 + ((y - waistY) / b) ** 2);
      const topHW = hw(topY);
      return { cx: e.col * TILE + W / 2, topY, topHW, H: H_LAYOUT * 0.8,
               mRX: topHW * 1.04 * 0.9, mRY: topHW * 0.31 * 0.9, cold: true,
               // for the fog down the shell and on the ground (coldFog)
               baseY, footY: py + H_LAYOUT - H0 * 0.265, baseHW, hw, rimRX: topHW * 1.04 };
    }
    const def = EntityDefs[T.COOLINGTOWER];
    const W = (e.width || def.width) * TILE, H = (e.height || def.height) * TILE;
    const topY = e.row * TILE + H * 0.12, baseY = e.row * TILE + H * 0.82;
    const waistY = topY + (baseY - topY) * 0.34;
    const waistHW = W * 0.245, baseHW = W * 0.345;
    const b = (baseY - waistY) / Math.sqrt((baseHW / waistHW) ** 2 - 1);
    const topHW = waistHW * Math.sqrt(1 + ((topY - waistY) / b) ** 2);
    return { cx: e.col * TILE + W / 2, topY, topHW, H, mRX: topHW * 0.92, mRY: topHW * 0.22 * 0.92, cold: false };
  }

  // The wind the plume leans with, eased per tower over WIND_EASE seconds.
  // WindState.speed carries the turbulence that makes wind turbines flicker,
  // and every billow in the column is placed from it at once, so following
  // it frame by frame bobbed the whole plume up and down and twitched it
  // sideways. The slow trend, eased again here, moves it the way a real
  // plume answers the wind: a slow lean and settle. The direction is eased
  // as a vector so it swings the short way round.
  const WIND_EASE = 4;
  function easeWind(e, dt) {
    const ws = typeof WindState !== 'undefined' ? (WindState.trendSpeed ?? 0.3) : 0.3;
    const d  = typeof WindState !== 'undefined' && WindState.dir !== undefined ? WindState.dir : 0;
    const dx = Math.cos(d), dy = Math.sin(d);
    if (e._plumeWind === undefined) { e._plumeWind = ws; e._plumeWdx = dx; e._plumeWdy = dy; return; }
    const k = Math.min(1, dt / WIND_EASE);
    e._plumeWind += (ws - e._plumeWind) * k;
    e._plumeWdx  += (dx - e._plumeWdx) * k;
    e._plumeWdy  += (dy - e._plumeWdy) * k;
  }

  // Ramp the tower's plume level toward running / stopped. Returns the level
  // (0–1, how dense) and how far up the column the steam has climbed.
  function level(e, t) {
    // A wrecked tower is drawn as rubble (renderRuin): no shell, no throat,
    // so no plume at all, rather than one fading from a mouth that is gone.
    // Its powered/_active flags can't be trusted to say so: a wreck cut off
    // from the grid can keep the ones it had when it was hit.
    if (e._lightningDamaged || e._irreparable) { e._plumeLvl = 0; e._plumeReach = 0; e._plumeIdle = 0; return 0; }
    const act = !!e._active && !!e._hotConnected && !!e._coolConnected && e.powered && !e._pumpTripped;
    // For the few seconds after a save loads the cooling network is still
    // settling and a running tower can read as idle. The plume holds as it
    // was saved meanwhile, rather than fading out and building up again; a
    // save from before the plume was kept shows none until it has settled,
    // then starts at full if the tower is running.
    const grace = typeof PowerNetwork !== 'undefined' && PowerNetwork.inLoadGrace && PowerNetwork.inLoadGrace();
    if (e._plumeLvl === undefined) {
      if (grace) return 0;
      e._plumeLvl = act ? 1 : 0;
    }
    if (e._plumeReach === undefined) e._plumeReach = e._plumeLvl;
    const dt = Math.max(0, Math.min(0.5, t - (e._plumeT ?? t)));
    e._plumeT = t;
    easeWind(e, dt);
    if (grace) return e._plumeLvl;
    // A tower only starts to thin out once it has been idle for IDLE_HOLD
    // seconds: the cooling network can drop a running tower for a moment
    // (a line re-settling after a load or an edit nearby), and that blink
    // shouldn't empty the plume and grow it back.
    e._plumeIdle = act ? 0 : (e._plumeIdle || 0) + dt;
    if (act) e._plumeLvl = Math.min(1, e._plumeLvl + dt / PLUME_RISE);
    else if (e._plumeIdle > IDLE_HOLD) e._plumeLvl = Math.max(0, e._plumeLvl - dt / PLUME_FALL);
    if (act) e._plumeReach = e._plumeLvl;
    return e._plumeLvl;
  }

  // The cryogenic tower's other half: cold vapour is heavier than air, so
  // as well as the plume it spills over the rim, slides down the outside of
  // the shell hugging its curve, and pools on the ground as a flat, slow fog
  // creeping outward, ice crystals glinting in it. Out here with the plume
  // rather than in the tower's sprite, whose cached bitmap froze it and cut
  // the fog off at the footprint's edge.
  function coldFog(ctx, g, t, dens, prevA) {
    const { cx, topY, baseY, footY, baseHW, hw } = g;
    const S = TILE / 40;
    const fog = _cryoFogSprite();
    const puff = (x, y, rx, ry, a) => {
      if (a <= 0.004) return;
      ctx.globalAlpha = prevA * a * dens;
      ctx.drawImage(fog, x - rx, y - ry, rx * 2, ry * 2);
    };
    // Over the rim and down the shell: a short lift, then falling along
    // the curve, widening and thinning as it goes.
    for (let i = 0; i < 16; i++) {
      const ph = (t * 0.11 + i / 16 + (i % 2) * 0.03) % 1;
      const sd = i % 2 ? 1 : -1;
      const fall = Math.pow(ph, 1.4);
      const y = topY - Math.sin(Math.min(1, ph * 6) * Math.PI) * 5 * S + fall * (baseY - topY) * 0.96;
      const x = cx + sd * (hw(y) + (2 + ph * 12) * S + Math.sin(t * 0.7 + i) * 2.5 * S);
      const r = (10 + ph * 18) * S;
      puff(x, y, r * 1.2, r * 0.85, 0.62 * Math.sin(Math.min(1, ph * 1.1) * Math.PI));
    }
    // Pooling on the ground: wide, flat, slow, creeping out both ways.
    for (let i = 0; i < 20; i++) {
      const ph = (t * 0.06 + i / 20) % 1;
      const sd = i % 2 ? 1 : -1;
      const x = cx + sd * (baseHW * (0.2 + ph * 1.35)) + Math.sin(i * 1.9) * 8 * S;
      const y = footY + (1 + ph * 8 + Math.sin(i * 1.3) * 2.5) * S;
      const r = (16 + ph * 30) * S;
      puff(x, y, r * 1.7, r * 0.45, 0.6 * Math.min(1, ph * 5) * (1 - ph));
    }
    // Ice crystals glinting in the fog.
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 7; i++) {
      const tw = Math.sin(t * (2.1 + i * 0.37) + i * 5.1);
      if (tw < 0.82) continue;
      const gx = cx + Math.sin(i * 12.9898) * baseHW * 1.1;
      const gy = footY + (2 + (i % 3) * 3) * S - ((i * 7) % 5) * S;
      ctx.globalAlpha = prevA * (tw - 0.82) / 0.18 * 0.9 * dens;
      ctx.beginPath(); ctx.arc(gx, gy, 1.1 * S, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = prevA;
  }

  // How the wind lays the column over: how far its top drifts, and how high.
  function column(e, H) {
    if (e._plumeWind === undefined) easeWind(e, 0);
    const wind = e._plumeWind;
    const dl = Math.hypot(e._plumeWdx, e._plumeWdy) || 1;
    const lean = H * (0.18 + 0.55 * wind);              // how far downwind the top drifts
    return {
      wx: e._plumeWdx / dl * lean, wy: e._plumeWdy / dl * lean * 0.5,
      rise: H * (0.85 - 0.3 * wind),                    // a stiff wind flattens it
    };
  }

  function drawOne(ctx, e, t, detail) {
    const lvl = level(e, t);
    if (lvl <= 0.001) return;
    const reach = e._plumeReach;
    const geo = throat(e);
    const { cx, topY, topHW, H, mRX, mRY, cold } = geo;
    // The cold fog goes down first, so the plume rises over it.
    if (cold) coldFog(ctx, geo, t, Math.sqrt(lvl), ctx.globalAlpha);
    const sprite = puffSprite(cold ? 'cold' : 'warm');
    const { wx, wy, rise } = column(e, H);
    const dens = Math.sqrt(lvl), grow = 0.6 + 0.4 * lvl;
    const seed = e.col * 0.37 + e.row * 0.11;
    const n = Math.max(8, Math.round(PUFFS * detail));
    const prevA = ctx.globalAlpha;

    // The mouth of the tower (from throat(): pulled in a little so the rim's
    // lip and its lights stay clear of the steam).
    ctx.save();

    // Steam filling the mouth: clipped to the opening, so it reads as the
    // tower full of vapour rather than a mound sitting on its rim.
    ctx.beginPath(); ctx.ellipse(cx, topY, mRX, mRY, 0, 0, Math.PI * 2); ctx.clip();
    // The cryogenic tower glows a faint cyan down in its throat, under the vapour.
    if (cold) {
      const pulse = 0.75 + 0.25 * Math.sin(t * 1.6 + seed);
      const gl = ctx.createRadialGradient(cx, topY, 0, cx, topY, mRX);
      gl.addColorStop(0, `rgba(140,240,255,${(0.8 * pulse * dens).toFixed(3)})`);
      gl.addColorStop(1, 'rgba(120,210,255,0)');
      ctx.globalAlpha = prevA;
      ctx.fillStyle = gl; ctx.fillRect(cx - mRX, topY - mRY, mRX * 2, mRY * 2);
    }
    ctx.globalAlpha = prevA * 0.88 * dens;
    for (let q = 0; q < 4; q++) {
      const r = topHW * (0.5 + 0.05 * Math.sin(t * 0.7 + q * 1.7 + seed));
      const ox = (q - 1.5) * topHW * 0.42 + Math.sin(t * 0.25 + q) * topHW * 0.05;
      ctx.drawImage(sprite, cx + ox - r, topY - r * 0.85, r * 2, r * 2);
    }
    ctx.restore();

    // The column. Below the rim's centre line steam can only show inside the
    // opening — the front of the lip stays in front of it — so every billow
    // visibly comes up out of the tower; above that line it is free.
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - H * 4, topY - H * 4, H * 8, H * 4);
    ctx.ellipse(cx, topY, mRX, mRY, 0, 0, Math.PI * 2);
    ctx.clip();

    // Oldest (highest) first, so the dense young billows at the throat sit
    // over the column they are pushing up.
    const order = [];
    for (let i = 0; i < n; i++) order.push([((t / LIFE) + i / n + seed) % 1, i]);
    order.sort((a, b) => b[0] - a[0]);
    for (const [ph, i] of order) {
      // Only as high as the column has climbed, feathered at its head.
      const head = reach >= 1 ? 1 : Math.max(0, Math.min(1, (reach - ph) / 0.15));
      if (head <= 0) continue;
      const k = Math.sin(i * 12.9898 + seed) * 43758.5453, j = k - Math.floor(k);   // per-billow jitter
      const up = Math.pow(ph, 0.8);
      const drift = Math.pow(ph, 1.6);
      // Born inside the mouth and no wider than it, then spreading as it
      // climbs: a young billow's edge stays within the opening.
      const wob = Math.sin(t * 0.35 + i * 2.1 + seed) * topHW * (0.05 + 0.35 * ph);
      const x = cx + (j - 0.5) * topHW * (0.5 + 0.5 * ph) + wob + wx * drift;
      const y = topY - up * rise + wy * drift;
      const r = topHW * (0.42 + 0.95 * Math.pow(ph, 0.7)) * (0.85 + 0.3 * j) * grow;
      // Near-opaque low down and thinning from a little under halfway up, so
      // what stands beneath the upper column still shows through it; eased
      // in over the first moments so a new billow doesn't pop at the throat.
      const fade = ph < 0.4 ? 1 : Math.pow(1 - (ph - 0.4) / 0.6, 1.7);
      const a = 0.92 * fade * Math.min(1, ph / 0.05 + 0.35) * dens * head;
      if (a <= 0.01) continue;
      ctx.globalAlpha = prevA * a;
      ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
    }
    // Ice crystals glinting in the lower half of a cryogenic column: each
    // rides up with the steam and catches the light for a moment.
    if (cold && detail >= 0.65) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 14; i++) {
        const ph = ((t / LIFE) * 1.6 + i / 14 + seed * 0.7) % 1;
        if (ph > 0.55 || ph * 1.0 > reach) continue;
        const tw = Math.sin(t * (3.1 + (i % 5) * 0.6) + i * 7.3);
        if (tw < 0.55) continue;
        const k = Math.sin(i * 78.233 + seed) * 43758.5453, j = k - Math.floor(k);
        const x = cx + (j - 0.5) * topHW * (0.6 + 1.2 * ph) + wx * Math.pow(ph, 1.6);
        const y = topY - Math.pow(ph, 0.8) * rise + wy * Math.pow(ph, 1.6);
        const s = topHW * 0.035 * (0.6 + j);
        ctx.globalAlpha = prevA * ((tw - 0.55) / 0.45) * dens;
        ctx.beginPath();
        ctx.moveTo(x, y - s * 2.2); ctx.lineTo(x + s * 0.5, y); ctx.lineTo(x, y + s * 2.2); ctx.lineTo(x - s * 0.5, y); ctx.closePath();
        ctx.moveTo(x - s * 2.2, y); ctx.lineTo(x, y + s * 0.5); ctx.lineTo(x + s * 2.2, y); ctx.lineTo(x, y - s * 0.5); ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.globalAlpha = prevA;
  }

  // A hovered wire, pipe or belt has to show through the steam, and no
  // highlight painted over it would do: the wire's is white on white. So a
  // plume whose steam actually lies over the highlighted line thins out until
  // the highlight ends; every other plume is left alone. Looked up every
  // LINE_CHECK seconds, not every frame: it walks the tiles under the steam.
  const LINE_CHECK = 0.15, LINE_FADE_TIME = 0.2, LINE_FADE_ALPHA = 0.15;
  function lineLit(n, net) {
    if (n._pipeHighlight || n._conveyorHighlight) return true;
    if (net >= 0 && n.type === T.WIRE && n.networkId === net) return true;
    if (n._underPipe?._pipeHighlight || n._underConveyor?._conveyorHighlight) return true;
    return net >= 0 && n._underWire?.networkId === net;
  }
  // Is a highlighted tile under this plume? Walks the column as drawOne lays
  // it out, as a stack of circles, up to where the steam has thinned to
  // nothing that would hide a line. The tower's own pipes, down at its foot,
  // don't count: there is no steam over them.
  function lineUnder(e, net) {
    const { cx, topY, topHW, H } = throat(e);
    const { wx, wy, rise } = column(e, H);
    const reach = Math.min(0.8, e._plumeReach ?? 1);
    for (let ph = 0; ph <= reach; ph += 0.1) {
      const drift = Math.pow(ph, 1.6);
      const x = cx + wx * drift, y = topY - Math.pow(ph, 0.8) * rise + wy * drift;
      const rad = topHW * (0.42 + 0.95 * Math.pow(ph, 0.7) + 0.3 * ph), rr = rad * rad;
      const c0 = Math.max(0, Math.floor((x - rad) / TILE)), c1 = Math.min(COLS - 1, Math.floor((x + rad) / TILE));
      const r0 = Math.max(0, Math.floor((y - rad) / TILE)), r1 = Math.min(ROWS - 1, Math.floor((y + rad) / TILE));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const dx = (c + 0.5) * TILE - x, dy = (r + 0.5) * TILE - y;
          if (dx * dx + dy * dy > rr) continue;
          const n = GridManager.getEntity(c, r);
          if (n && lineLit(n, net)) return true;
        }
      }
    }
    return false;
  }
  function lineFade(e, t, anyLit) {
    if (!anyLit) e._plumeOverLine = false;
    else if (t - (e._plumeLineAt ?? -Infinity) >= LINE_CHECK) { e._plumeLineAt = t; e._plumeOverLine = lineUnder(e, _wireHighlightNetId); }
    const dt = Math.max(0, Math.min(0.5, t - (e._plumeFadeT ?? t)));
    e._plumeFadeT = t;
    const to = e._plumeOverLine ? LINE_FADE_ALPHA : 1, cur = e._plumeFade ?? 1, step = dt / LINE_FADE_TIME;
    return (e._plumeFade = cur < to ? Math.min(to, cur + step) : Math.max(to, cur - step));
  }

  // Every tower whose plume could be on screen: the steam climbs about a
  // tower's height above the throat, so towers below the visible rows count.
  function renderAll(ctx, t, cStart, cEnd, rStart, rEnd) {
    const mk1 = EntityRegistry.getByType(T.COOLINGTOWER), cryo = EntityRegistry.getByType(T.COOLINGTOWER2);
    if (!mk1.size && !cryo.size) return;
    const zoom = typeof Camera !== 'undefined' ? Camera.zoom : 1;
    const detail = zoom < 0.25 ? 0.35 : zoom < 0.5 ? 0.65 : 1;
    const anyLit = _wireHighlightNetId >= 0 || _prevPipeHighlighted.length > 0 || _prevConveyorHighlighted.length > 0;
    const prevA = ctx.globalAlpha;
    for (const e of [...mk1, ...cryo]) {
      const w = e.width || 1, h = e.height || 1;
      if (e.col + w + h < cStart || e.col - h > cEnd) { if (e._plumeLvl !== undefined) level(e, t); continue; }
      if (e.row + h < rStart || e.row - h * 2 > rEnd) { if (e._plumeLvl !== undefined) level(e, t); continue; }
      ctx.globalAlpha = prevA * lineFade(e, t, anyLit);
      drawOne(ctx, e, t, detail);
    }
    ctx.globalAlpha = prevA;
  }

  // (puffSprite also gives the spaceport's launch cloud the same billows.)
  return { renderAll, puffSprite };
})();

// One soft puff of cryogenic vapour, drawn once and stretched per puff:
// near-white at the heart, an icy blue towards the edge, gone by the rim.
let _cryoFogCanvas = null;
function _cryoFogSprite() {
  if (_cryoFogCanvas) return _cryoFogCanvas;
  const R = 64, c = document.createElement('canvas');
  c.width = c.height = R * 2;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(R, R, 0, R, R, R);
  gr.addColorStop(0,    'rgba(236,248,255,1)');
  gr.addColorStop(0.35, 'rgba(200,232,252,0.8)');
  gr.addColorStop(0.7,  'rgba(150,204,240,0.32)');
  gr.addColorStop(1,    'rgba(130,190,235,0)');
  g.fillStyle = gr; g.fillRect(0, 0, R * 2, R * 2);
  return (_cryoFogCanvas = c);
}

function renderCryoCoolingTower(e, px, py, t) {
    // The plutonium-tier tower. Deliberately NOT a bigger copy of the MK1:
    // that one is a passive concrete chimney, and this is a refrigeration
    // plant that happens to be tower-shaped, so the silhouette reads as
    // machinery rather than civil works.
    //   • A dark armoured shell instead of bare concrete, banded with three
    //     glowing refrigerant mains that wrap right around it.
    //   • A ring of six induced-draft fans on a deck at the throat — forced
    //     draft, which is what lets it be squat where the MK1 must be tall.
    //   • Four cryogenic accumulator drums on skids at the corners, frosted
    //     and filling with the coolant charge.
    //   • A finned condenser bank under the base. Its vapour is drawn after
    //     the scene by CoolingTowerPlume: the MK1's plume in an icy palette,
    //     plus heavy cold fog spilling down the shell and pooling on the ground.
    // Ports come from CoolingTowerSystem.getStubs() — the same H₂O IN left /
    // COOL OUT right pair as the MK1, pinned to layoutHeight so they stay on
    // the chiller houses when the live footprint is shorter than the art box.
    // No backdrop. Shares the _wf* helpers.
    const def = EntityDefs[T.COOLINGTOWER2];
    const W   = (e.width || def.width) * TILE, H = (e.height || def.height) * TILE;
    // Art was composed in a layoutHeight-tall box (19); the live footprint
    // drops the empty bottom rows. Pin shell/base/legs to that layout so
    // shrinking e.height does not rescale or shift the tower graphic.
    const H_LAYOUT = (def.layoutHeight || 19) * TILE;
    const cx  = px + W/2;
    const on  = e.powered;
    const act = !!e._active && !!e._hotConnected && !!e._coolConnected && on && !e._pumpTripped;
    const S   = TILE / 40;
    const accent = '#7af0ff';
    ctx.save();

    const cst   = CoolingTowerSystem.getStubs(e);
    const aHot  = _portAnchor(e, px, py, W, H, cst.hotIn);
    const aCool = _portAnchor(e, px, py, W, H, cst.coldOut);

    // ── Shell geometry ───────────────────────────────────────────────
    // Squatter than the MK1's (its draught is fan-driven, not thermal) and
    // wider at the base, on the same hyperbola hw(y) = a·√(1 + ((y−waist)/b)²).
    // H0 is the height these proportions were tuned at (the original 17
    // tiles) — the fan deck stays a fixed distance off the top and the
    // base/legs/fins stay a fixed distance off the bottom of H_LAYOUT, so
    // the stretch between them matches the previous 19-tall look even though
    // the collision footprint is two tiles shorter.
    const H0 = 17 * TILE;
    const deckY  = py + H0*0.155;
    const topY   = deckY;
    const baseY  = py + H_LAYOUT - H0*0.335;
    const footY  = py + H_LAYOUT - H0*0.265;
    const waistY = topY + (baseY - topY)*0.40;
    const waistHW = W*0.215, baseHW = W*0.315;
    const b  = (baseY - waistY) / Math.sqrt((baseHW/waistHW)**2 - 1);
    const hw = (y) => waistHW * Math.sqrt(1 + ((y - waistY)/b)**2);
    const topHW = hw(topY);
    const shellPath = (dx, dy) => {
      ctx.beginPath();
      const N = 30;
      for (let i = 0; i <= N; i++) { const y = topY + (baseY - topY)*i/N; const x = cx - hw(y); i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy); }
      for (let i = N; i >= 0; i--) { const y = topY + (baseY - topY)*i/N; ctx.lineTo(cx + hw(y) + dx, y + dy); }
      ctx.closePath();
    };

    // ── Refrigerant runs: warm line in on the left, chilled line out right ──
    const phW = 30*S, phH = 26*S;
    const hpX = px + 20*S, hpY = aHot.y - phH/2;
    const cpX = px + W - 20*S - phW, cpY = aCool.y - phH/2;
    _wfPipe([[px + 12*S, aHot.y], [hpX, aHot.y]], S, t, act, 'rgba(70,140,225,0.95)');
    _wfPipe([[hpX + phW*0.5, hpY], [hpX + phW*0.5, footY + 6*S], [cx - baseHW*0.55, footY + 6*S]], S, t, act, 'rgba(70,140,225,0.95)');
    _wfPipe([[cx + baseHW*0.55, footY + 12*S], [cpX + phW*0.5, footY + 12*S], [cpX + phW*0.5, cpY]], S, t, act, 'rgba(122,240,255,0.95)');
    _wfPipe([[cpX + phW, aCool.y], [px + W - 12*S, aCool.y]], S, t, act, 'rgba(122,240,255,0.95)');

    // ── Ground shadow ────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(0,0,0,0.30)'; shellPath(12*S, 14*S); ctx.fill();

    // ── Condenser fin bank under the base ────────────────────────────
    const finY = footY + 2*S, finH = 16*S, finX0 = cx - baseHW*1.02, finW = baseHW*2.04;
    _wfShadow(finX0, finY, finW, finH, S, 2*S);
    ctx.fillStyle = '#242c32'; ctx.strokeStyle = '#0c1216'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.roundRect(finX0, finY, finW, finH, 2*S); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = act ? 'rgba(122,240,255,0.45)' : 'rgba(120,140,150,0.28)'; ctx.lineWidth = 0.9*S;
    for (let x = finX0 + 3*S; x < finX0 + finW - 2*S; x += 3.2*S) {
      ctx.beginPath(); ctx.moveTo(x, finY + 2*S); ctx.lineTo(x, finY + finH - 2*S); ctx.stroke();
    }
    _wfHazardStripe(finX0, finY + finH - 3*S, finW, 3*S, S);

    // ── Cryogenic accumulator drums, two per side ────────────────────
    // Fill rises with the tower's own duty: a tower nobody is drawing on
    // sits part-charged, a working one runs its drums near full.
    const charge = act ? 0.62 + 0.3*Math.sin(t*0.7 + e.col) : on ? 0.35 : 0.12;
    // Squat enough to read as pressure vessels rather than rails — a 17-tile
    // tall footprint makes anything narrow look like scaffolding. Fixed
    // size/offset off the top (H0, not H) — these don't stretch with the
    // shell, they just sit wherever the (now possibly taller) deck puts them.
    const drW = 30*S, drH = H0*0.24, drY = py + H0*0.135;
    // Kept in a named list because the tie-in headers below (drawn after the
    // shell, so they land ON it rather than under it) have to start from
    // exactly these x positions.
    const drumSlots = [[px + 10*S, 0], [px + 10*S + drW + 7*S, 1], [px + W - 10*S - drW, 2], [px + W - 10*S - 2*drW - 7*S, 3]];
    drumSlots.forEach(([dx, i]) => {
        _wfShadow(dx, drY, drW, drH, S, drW*0.45);
        // frosted steel barrel
        const dg = ctx.createLinearGradient(dx, 0, dx + drW, 0);
        dg.addColorStop(0, '#39464e'); dg.addColorStop(0.35, '#cfe4ec'); dg.addColorStop(0.7, '#7d939d'); dg.addColorStop(1, '#2b353b');
        ctx.fillStyle = dg; ctx.strokeStyle = '#0c1216'; ctx.lineWidth = S;
        ctx.beginPath(); ctx.roundRect(dx, drY, drW, drH, drW*0.45); ctx.fill(); ctx.stroke();
        // coolant charge, visible through a sight strip
        const lvl = Math.max(0, Math.min(1, charge - i*0.06));
        const sgX = dx + drW*0.34, sgW = drW*0.32;
        ctx.fillStyle = '#0b1418'; ctx.fillRect(sgX, drY + 6*S, sgW, drH - 12*S);
        const lg = ctx.createLinearGradient(0, drY + drH - 6*S, 0, drY + 6*S);
        lg.addColorStop(0, act ? '#7af0ff' : '#2f6b7d'); lg.addColorStop(1, act ? '#bff4ff' : '#3d8294');
        ctx.fillStyle = lg;
        ctx.fillRect(sgX, drY + drH - 6*S - (drH - 12*S)*lvl, sgW, (drH - 12*S)*lvl);
        if (act) {
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          for (let q = 0; q < 3; q++) {
            const bp = ((t*0.5 + q*0.37 + i*0.2) % 1);
            ctx.beginPath(); ctx.arc(sgX + sgW*(0.3 + 0.4*Math.sin(q + i)), drY + drH - 8*S - (drH - 14*S)*bp, 1.1*S, 0, Math.PI*2); ctx.fill();
          }
        }
        // hoop bands + frost crust
        ctx.strokeStyle = 'rgba(20,28,32,0.55)'; ctx.lineWidth = 1.2*S;
        for (let q = 1; q < 4; q++) { const y = drY + drH*q/4; ctx.beginPath(); ctx.moveTo(dx, y); ctx.lineTo(dx + drW, y); ctx.stroke(); }
        ctx.fillStyle = `rgba(214,244,255,${act ? 0.30 : 0.12})`;
        ctx.beginPath(); ctx.roundRect(dx + 1*S, drY + drH*0.55, drW - 2*S, drH*0.42, drW*0.4); ctx.fill();
        // relief valve cap
        ctx.fillStyle = '#5a6870'; ctx.beginPath(); ctx.roundRect(dx + drW*0.34, drY - 4*S, drW*0.32, 5*S, 1.5*S); ctx.fill();
      });

    // ── Raked intake columns under the shell ─────────────────────────
    const legs = 22;
    ctx.lineCap = 'round';
    for (let q = 0; q <= legs; q++) {
      const x = cx - baseHW + 2*baseHW*q/legs;
      const dx = (q % 2 ? 6 : -6)*S;
      ctx.strokeStyle = 'rgba(0,0,0,0.32)'; ctx.lineWidth = 3*S;
      ctx.beginPath(); ctx.moveTo(x + 2*S, baseY + 2*S); ctx.lineTo(x + dx + 2*S, footY - 1*S); ctx.stroke();
      ctx.strokeStyle = '#59646c'; ctx.lineWidth = 2.4*S;
      ctx.beginPath(); ctx.moveTo(x, baseY); ctx.lineTo(x + dx, footY - 3*S); ctx.stroke();
    }

    // ── Shell ────────────────────────────────────────────────────────
    const sg = ctx.createLinearGradient(cx - baseHW, 0, cx + baseHW, 0);
    sg.addColorStop(0, '#111c22'); sg.addColorStop(0.3, '#43555f'); sg.addColorStop(0.6, '#26343c'); sg.addColorStop(1, '#0c1419');
    ctx.fillStyle = sg; shellPath(0, 0); ctx.fill();
    ctx.save(); shellPath(0, 0); ctx.clip();
    // vertical armour seams
    ctx.strokeStyle = 'rgba(10,16,20,0.55)'; ctx.lineWidth = 1.1*S;
    for (let fq = -0.92; fq <= 0.93; fq += 0.115) {
      ctx.beginPath();
      for (let i = 0; i <= 22; i++) { const y = topY + (baseY - topY)*i/22; const x = cx + fq*hw(y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    // three refrigerant mains wrapping the shell — they pulse while cooling
    [0.22, 0.50, 0.78].forEach((f, i) => {
      const y = topY + (baseY - topY)*f;
      const glow = act ? 0.55 + 0.35*Math.sin(t*2.2 - i*1.1) : 0.16;
      ctx.strokeStyle = `rgba(122,240,255,${glow.toFixed(3)})`; ctx.lineWidth = 3.4*S;
      ctx.beginPath(); ctx.moveTo(cx - hw(y), y); ctx.lineTo(cx + hw(y), y); ctx.stroke();
      ctx.strokeStyle = 'rgba(8,14,18,0.6)'; ctx.lineWidth = 0.8*S;
      ctx.beginPath(); ctx.moveTo(cx - hw(y), y + 2.4*S); ctx.lineTo(cx + hw(y), y + 2.4*S); ctx.stroke();
    });
    // frost creeping up from the base
    const frostG = ctx.createLinearGradient(0, baseY, 0, waistY);
    frostG.addColorStop(0, `rgba(206,242,255,${act ? 0.34 : 0.12})`); frostG.addColorStop(1, 'rgba(206,242,255,0)');
    ctx.fillStyle = frostG; ctx.fillRect(cx - baseHW, waistY, baseHW*2, baseY - waistY);
    ctx.restore();
    ctx.strokeStyle = '#050b0f'; ctx.lineWidth = 1.4*S; shellPath(0, 0); ctx.stroke();

    // ── Drum tie-in headers ──────────────────────────────────────────
    // Each pair of accumulators drops a riser to a common header that runs
    // in and bolts to the shell. Drawn AFTER the shell so the run finishes
    // on a flange against its wall — without this the drums read as four
    // unrelated objects parked beside the tower rather than part of it.
    const hdrY  = drY + drH + 8*S;
    const wallX = (sd) => cx + sd*hw(hdrY);
    [-1, 1].forEach(sd => {
      const xs = drumSlots.filter(([dx]) => (dx + drW/2 < cx) === (sd < 0))
                          .map(([dx]) => dx + drW/2);
      if (!xs.length) return;
      // Farthest-out riser first — the header picks the others up on its way in.
      const outer = sd < 0 ? Math.min(...xs) : Math.max(...xs);
      const wx = wallX(sd);
      _wfPipe([[outer, drY + drH - 2*S], [outer, hdrY], [wx, hdrY]], S, t, act, 'rgba(122,240,255,0.95)');
      for (const x of xs) if (x !== outer) _wfPipe([[x, drY + drH - 2*S], [x, hdrY]], S, t, act, 'rgba(122,240,255,0.95)');
      // Bolted flange on the shell wall.
      const fw = 4*S, fh = 13*S;
      const fg = ctx.createLinearGradient(0, hdrY - fh/2, 0, hdrY + fh/2);
      fg.addColorStop(0, '#8a949a'); fg.addColorStop(1, '#2d373d');
      ctx.fillStyle = fg; ctx.strokeStyle = '#080e12'; ctx.lineWidth = 0.8*S;
      ctx.beginPath(); ctx.roundRect(wx - (sd < 0 ? 0 : fw), hdrY - fh/2, fw, fh, 1*S); ctx.fill(); ctx.stroke();
      // Sight band on the flange, lit with the coolant.
      ctx.fillStyle = act ? 'rgba(122,240,255,0.85)' : '#3c4a52';
      ctx.fillRect(wx - (sd < 0 ? -fw*0.3 : fw*1.3), hdrY - fh*0.2, fw*0.6, fh*0.4);
    });

    // ── Induced-draft fan set INTO the throat ────────────────────────
    // One big fan recessed inside the shell mouth, not a rack of small ones
    // bolted to a plate on top. A ring of separate fan discs read as a part
    // dropped onto the sprite — the rim here is the shell's own lip in the
    // shell's own gradient, the blades are the same steel, and the head
    // finishes the taper instead of interrupting it.
    const dRX = topHW*1.04, dRY = topHW*0.31;
    // Lip: the shell's gradient carried over the rim, so the seam disappears.
    const lipG = ctx.createLinearGradient(cx - dRX, 0, cx + dRX, 0);
    lipG.addColorStop(0, '#16232a'); lipG.addColorStop(0.3, '#4d616c'); lipG.addColorStop(0.62, '#2b3a43'); lipG.addColorStop(1, '#0e171c');
    ctx.fillStyle = lipG;
    ctx.beginPath(); ctx.ellipse(cx, deckY, dRX + 4.5*S, dRY + 4.5*S, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(6,12,16,0.85)'; ctx.lineWidth = 1.1*S;
    ctx.beginPath(); ctx.ellipse(cx, deckY, dRX + 4.5*S, dRY + 4.5*S, 0, 0, Math.PI*2); ctx.stroke();

    // Plenum: a dark well sunk into the lip, lit from below while working.
    const ig = ctx.createRadialGradient(cx, deckY + dRY*0.25, 1, cx, deckY, dRX);
    ig.addColorStop(0, act ? 'rgba(150,240,255,0.42)' : '#0c1417'); ig.addColorStop(0.5, act ? '#193845' : '#091013'); ig.addColorStop(1, '#040a0c');
    ctx.fillStyle = ig; ctx.beginPath(); ctx.ellipse(cx, deckY, dRX, dRY, 0, 0, Math.PI*2); ctx.fill();

    // Everything inside the plenum is clipped to it, so the fan can never
    // spill over the rim the way a free-standing disc does.
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, deckY, dRX, dRY, 0, 0, Math.PI*2); ctx.clip();
    ctx.save();
    ctx.translate(cx, deckY); ctx.scale(1, dRY/dRX);   // foreshorten, then work in circles
    // Stator vanes on the plenum wall — stationary, so the moving blades read
    // against something.
    ctx.strokeStyle = 'rgba(120,150,165,0.20)'; ctx.lineWidth = 1.2*S;
    for (let q = 0; q < 16; q++) {
      const a = q*Math.PI/8;
      ctx.beginPath(); ctx.moveTo(Math.cos(a)*dRX*0.66, Math.sin(a)*dRX*0.66);
      ctx.lineTo(Math.cos(a)*dRX*0.99, Math.sin(a)*dRX*0.99); ctx.stroke();
    }
    // Rotor: eight tapered, swept aerofoil blades (fat root, slim tip, curved
    // trailing edge), lit on the leading face and dark on the back. While
    // running they blur into a translucent disc with a few sweep arcs, the
    // way a real fan reads at speed, instead of ten crisp blobs.
    const spin = act ? t*3.2 : 0.4;
    const r0 = dRX*0.20, r1 = dRX*0.95;
    // Drop shadow: the rotor's own silhouette, offset down-right onto the
    // plenum floor and softened, so the blades lift off the dark well.
    ctx.save();
    ctx.translate(dRX*0.05, dRX*0.085); ctx.rotate(spin);
    ctx.fillStyle = act ? 'rgba(0,6,10,0.42)' : 'rgba(0,4,6,0.55)';
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 5*S;
    for (let b = 0; b < 8; b++) {
      ctx.save(); ctx.rotate(b*Math.PI/4);
      const wr = dRX*0.135, wt = dRX*0.05, sw = dRX*0.16;
      ctx.beginPath();
      ctx.moveTo(r0, -wr*0.55);
      ctx.quadraticCurveTo((r0 + r1)*0.55, -wr*0.9 - sw*0.3, r1, -wt - sw);
      ctx.lineTo(r1, wt - sw);
      ctx.quadraticCurveTo((r0 + r1)*0.55, wr*0.75 - sw*0.1, r0, wr*0.55);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, dRX*0.20, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.rotate(spin);
    for (let b = 0; b < 8; b++) {
      ctx.save(); ctx.rotate(b*Math.PI/4);
      const wr = dRX*0.135, wt = dRX*0.05, sw = dRX*0.16;
      const bg = ctx.createLinearGradient(0, -wr, 0, wr*0.6);
      bg.addColorStop(0, act ? '#a6c4cf' : '#7e939d'); bg.addColorStop(0.55, '#4b5d67'); bg.addColorStop(1, '#1d2a31');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(r0, -wr*0.55);
      ctx.quadraticCurveTo((r0 + r1)*0.55, -wr*0.9 - sw*0.3, r1, -wt - sw);
      ctx.lineTo(r1, wt - sw);
      ctx.quadraticCurveTo((r0 + r1)*0.55, wr*0.75 - sw*0.1, r0, wr*0.55);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = act ? 'rgba(160,240,255,0.30)' : 'rgba(150,175,185,0.16)'; ctx.lineWidth = 0.8*S; ctx.stroke();
      ctx.strokeStyle = 'rgba(8,14,18,0.45)'; ctx.lineWidth = 0.7*S;     // pitch line down the blade
      ctx.beginPath(); ctx.moveTo(r0 + dRX*0.04, 0); ctx.quadraticCurveTo((r0 + r1)*0.55, -sw*0.35, r1*0.97, -sw*0.95); ctx.stroke();
      ctx.restore();
    }
    if (act) {
      const bl = ctx.createRadialGradient(0, 0, dRX*0.2, 0, 0, dRX*0.97);
      bl.addColorStop(0, 'rgba(150,225,240,0.05)'); bl.addColorStop(1, 'rgba(150,225,240,0.20)');
      ctx.fillStyle = bl; ctx.beginPath(); ctx.arc(0, 0, dRX*0.97, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(210,245,255,0.20)'; ctx.lineWidth = 1.4*S;
      for (let q = 0; q < 3; q++) { ctx.beginPath(); ctx.arc(0, 0, dRX*(0.42 + q*0.2), q*2.1, q*2.1 + 1.15); ctx.stroke(); }
    }
    ctx.restore();
    // Fan guard: two fixed concentric rings, stationary over the blur.
    ctx.strokeStyle = 'rgba(120,150,165,0.28)'; ctx.lineWidth = 1*S;
    [0.36, 0.68].forEach(fr => { ctx.beginPath(); ctx.arc(0, 0, dRX*fr, 0, Math.PI*2); ctx.stroke(); });
    // Stationary spider struts (they do NOT turn with the rotor) bridging hub to rim.
    ctx.strokeStyle = 'rgba(24,36,42,0.95)'; ctx.lineWidth = 2.6*S;
    for (let q = 0; q < 4; q++) {
      const a = q*Math.PI/2 + 0.3;
      ctx.beginPath(); ctx.moveTo(Math.cos(a)*dRX*0.19, Math.sin(a)*dRX*0.19); ctx.lineTo(Math.cos(a)*dRX, Math.sin(a)*dRX); ctx.stroke();
      ctx.strokeStyle = 'rgba(140,170,185,0.22)'; ctx.lineWidth = 0.8*S;
      ctx.beginPath(); ctx.moveTo(Math.cos(a)*dRX*0.19, Math.sin(a)*dRX*0.19 - 0.8*S); ctx.lineTo(Math.cos(a)*dRX, Math.sin(a)*dRX - 0.8*S); ctx.stroke();
      ctx.strokeStyle = 'rgba(24,36,42,0.95)'; ctx.lineWidth = 2.6*S;
    }
    // Hub: domed spinner with a bolt ring and a nose cap.
    const hg = ctx.createRadialGradient(-dRX*0.06, -dRX*0.06, 1, 0, 0, dRX*0.21);
    hg.addColorStop(0, '#9fb2bc'); hg.addColorStop(0.6, '#4a5b65'); hg.addColorStop(1, '#1b262c');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, dRX*0.20, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#060c10'; ctx.lineWidth = 1*S; ctx.stroke();
    ctx.fillStyle = act ? 'rgba(180,235,250,0.85)' : '#7e919b';
    for (let q = 0; q < 6; q++) { const a = spin + q*Math.PI/3; ctx.beginPath(); ctx.arc(Math.cos(a)*dRX*0.135, Math.sin(a)*dRX*0.135, 0.9*S, 0, Math.PI*2); ctx.fill(); }
    ctx.fillStyle = '#c8d6dc'; ctx.beginPath(); ctx.arc(-dRX*0.03, -dRX*0.03, dRX*0.045, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    // Shadow the far wall of the well so the fan sits INSIDE it.
    const wellG = ctx.createLinearGradient(0, deckY - dRY, 0, deckY + dRY);
    wellG.addColorStop(0, 'rgba(0,0,0,0.55)'); wellG.addColorStop(0.45, 'rgba(0,0,0,0)'); wellG.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = wellG; ctx.fillRect(cx - dRX, deckY - dRY, dRX*2, dRY*2);
    ctx.restore();
    // Inner rim highlight — one thin line, the only bright edge up here.
    ctx.strokeStyle = 'rgba(190,225,240,0.35)'; ctx.lineWidth = 0.9*S;
    ctx.beginPath(); ctx.ellipse(cx, deckY, dRX, dRY, 0, Math.PI, Math.PI*2); ctx.stroke();

    // (Its vapour — the cold plume, and the heavy fog spilling down the
    // shell and pooling on the ground — is CoolingTowerPlume's, painted
    // after the scene.)

    // ── Rim aviation lights ──────────────────────────────────────────
    const blink = Math.sin(t*3) > 0.2;
    [-1, 1].forEach(sd => {
      const lx = cx + sd*(dRX + 3*S), ly = deckY;
      ctx.fillStyle = blink ? '#ff3020' : '#501810'; ctx.beginPath(); ctx.arc(lx, ly, 2.4*S, 0, Math.PI*2); ctx.fill();
      if (blink) { ctx.fillStyle = 'rgba(255,60,40,0.25)'; ctx.beginPath(); ctx.arc(lx, ly, 8*S, 0, Math.PI*2); ctx.fill(); }
    });

    // ── Chiller houses on each port ──────────────────────────────────
    [[hpX, hpY, !!e._hotConnected, '#4a90e0'], [cpX, cpY, !!e._coolConnected, '#ffffff']].forEach(([x, y, lit, col], i) => {
      _wfShadow(x, y, phW, phH, S, 2*S);
      ctx.fillStyle = '#39464e'; ctx.strokeStyle = '#0a1216'; ctx.lineWidth = S;
      ctx.beginPath(); ctx.roundRect(x, y, phW, phH, 2.5*S); ctx.fill(); ctx.stroke();
      _wfHazardStripe(x, y + phH - 3*S, phW, 3*S, S);
      // twin compressor fans per house — this is a chiller train, not a pump
      _fcFan(x + phW*0.30, y + phH*0.42, phH*0.24, S, t + i, act, 16);
      _fcFan(x + phW*0.70, y + phH*0.42, phH*0.24, S, t + i + 0.5, act, 16);
      ctx.fillStyle = e._pumpTripped ? (Math.sin(t*8) > 0 ? '#ff3020' : '#501810') : lit && on ? col : '#2a2e30';
      ctx.beginPath(); ctx.arc(x + phW - 4*S, y + 4*S, 1.6*S, 0, Math.PI*2); ctx.fill();
      if (e._pumpTripped) {
        ctx.strokeStyle = `rgba(255,60,40,${(0.5 + 0.4*Math.sin(t*8)).toFixed(3)})`; ctx.lineWidth = 1.6*S;
        ctx.strokeRect(x - 1*S, y - 1*S, phW + 2*S, phH + 2*S);
      }
    });

    _portPipe(aHot,  S, t, { fluid: '#4a90e0', label: 'COOL IN',  on: !!e._hotConnected,  out: false, flow: act });
    _portPipe(aCool, S, t, { fluid: '#ffffff', label: 'CRYO OUT', on: !!e._coolConnected, out: true,  flow: act });

    const temp = e._waterTempOut;
    const plateY = py + H - H0*0.045;
    if (e._pumpTripped) _wfPlate(`CHILLERS TRIPPED${e.powered ? `: ${Math.ceil(e._pumpRestart || 0)}s` : ''}`, cx, plateY, S, '#ff5030', true);
    else _wfPlate(temp != null ? `CRYO COOLING  ${Math.round(temp)}°C` : 'CRYOGENIC COOLING TOWER', cx, plateY, S, accent, act);
    _wfLamp(px + W - 7*S, py + 7*S, S, t, accent, on);
    ctx.restore();
  }

function renderSteamTurbine(e, px, py, t) {
    // Turbine hall seen from above, on a checker-plate deck ringed by a
    // handrail. Along the shaft: the stop valve, a tapered HP casing and two
    // double-flow LP casings (barrels with conical ends, bolted split
    // flanges, exhaust hoods dropping to the condenser, and a sight slot
    // where the blade rows blur past), bearing pedestals and coupling guards
    // between them, then the generator with its hydrogen coolers and
    // exciter. Three phase-bus ducts carry the output to the transformer
    // yard (radiator banks, bushings, conservator). Below the deck: lube-oil
    // skid, condenser tube bundle and the control cabin (OUT readout + RPM
    // dial). The rotor spins up and coasts down instead of snapping on/off
    // (e._spin / e._phase, render-only state). The shaft runs along the STEAM
    // IN row from SteamTurbineSystem.getStubs(), so older, smaller turbines
    // line up too. No backdrop.
    const def = EntityDefs[T.STEAMTURBINE];
    const W = (e.width || def.width) * TILE, H = (e.height || def.height) * TILE;
    const hasPower  = !!e._hasPower;
    const gen       = !!e._generating;
    const connected = !!e._steamConnected;
    const S = TILE / 40;
    const accent = '#40e0ff';
    ctx.save();

    // Rotor inertia: ~2.5 s to spin up or coast down.
    const dtR = Math.max(0, Math.min(0.25, t - (e._spinT ?? t)));
    e._spinT = t;
    e._spin  = (e._spin ?? (gen ? 1 : 0)) + ((gen ? 1 : 0) - (e._spin ?? 0)) * Math.min(1, dtR / 2.5);
    e._phase = (e._phase || 0) + dtR * e._spin;
    const spin = e._spin, ph = e._phase, turning = spin > 0.02;

    const aIn = _portAnchor(e, px, py, W, H, SteamTurbineSystem.getStubs(e).steamIn);
    const axisY = aIn.y;
    const U = Math.min(H*0.5, W*0.36);                 // casing size unit
    const casings = [
      { x0: 0.085, x1: 0.195, hl: 0.12, hr: 0.21, label: 'HP' },
      { x0: 0.225, x1: 0.370, hl: 0.17, hr: 0.17, hh: 0.30, label: 'LP1', lp: true },
      { x0: 0.400, x1: 0.545, hl: 0.17, hr: 0.17, hh: 0.30, label: 'LP2', lp: true },
    ];
    const gX0 = px + W*0.585, gX1 = px + W*0.765, gHH = U*0.27;
    const dkX = px + W*0.04, dkY = Math.max(py + H*0.12, axisY - U*0.64), dkW = W*0.80;
    const dkH = Math.min(py + H*0.70, axisY + U*0.64) - dkY;
    const cdX = px + W*0.21, cdY = dkY + dkH + 6*S, cdW = W*0.36, cdH = py + H*0.93 - cdY;
    const loX = px + W*0.05, loY = cdY, loW = W*0.13, loH = cdH;
    const ccX = px + W*0.60, ccY = cdY, ccW = W*0.22, ccH = cdH;

    // Horizontal-cylinder shading shared by every casing.
    const cylGrad = (y0, y1, dark) => {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0,    dark ? '#1c2a30' : '#2c3e46');
      g.addColorStop(0.30, dark ? '#6a8490' : '#8aa6b0');
      g.addColorStop(0.44, dark ? '#a8c0c8' : '#dcebef');
      g.addColorStop(0.56, dark ? '#7a929c' : '#9ab4bc');
      g.addColorStop(1,    dark ? '#141e22' : '#1c2a30');
      return g;
    };

    // ── Deck: checker plate, handrail, hazard edge ──
    _wfShadow(dkX, dkY, dkW, dkH, S, 4*S);
    ctx.fillStyle = '#4e575c'; ctx.strokeStyle = '#1e2428'; ctx.lineWidth = 1.5*S;
    ctx.beginPath(); ctx.roundRect(dkX, dkY, dkW, dkH, 4*S); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.roundRect(dkX, dkY, dkW, dkH, 4*S); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1.2*S; ctx.lineCap = 'round';
    const cp = 6*S;
    // Every tread mark in one path and one stroke. They never overlap, so it
    // paints what a stroke apiece did — and that was some 3,200 strokes per
    // turbine per frame, most of the cost of drawing one.
    ctx.beginPath();
    for (let yy = dkY + cp/2, r = 0; yy < dkY + dkH; yy += cp, r++) {
      for (let xx = dkX + (r % 2 ? cp/2 : 0); xx < dkX + dkW; xx += cp) {
        const d = (r + Math.round((xx - dkX)/cp)) % 2 ? 1 : -1;
        ctx.moveTo(xx - 1.4*S, yy - 1.4*S*d); ctx.lineTo(xx + 1.4*S, yy + 1.4*S*d);
      }
    }
    ctx.stroke();
    // soft pool of light under the train while it runs
    if (spin > 0.05) {
      const lg = ctx.createRadialGradient(px + W*0.35, axisY, 4*S, px + W*0.35, axisY, W*0.36);
      lg.addColorStop(0, `rgba(64,224,255,${0.10*spin})`); lg.addColorStop(1, 'rgba(64,224,255,0)');
      ctx.fillStyle = lg; ctx.fillRect(dkX, dkY, dkW, dkH);
    }
    ctx.restore();
    ctx.strokeStyle = '#d8a820'; ctx.lineWidth = 1.4*S; ctx.setLineDash([7*S, 3*S]);
    ctx.beginPath(); ctx.roundRect(dkX + 4*S, dkY + 4*S, dkW - 8*S, dkH - 12*S, 3*S); ctx.stroke();
    ctx.setLineDash([]);
    _wfHazardStripe(dkX, dkY + dkH - 5*S, dkW, 4*S, S);

    // ── LP exhaust hoods (under the barrels, dropping to the condenser) ──
    casings.filter(c => c.lp).forEach(c => {
      const x0 = px + W*c.x0 - 3*S, x1 = px + W*c.x1 + 3*S, hh = U*c.hh*1.12;
      ctx.fillStyle = '#2e3a40'; ctx.strokeStyle = '#10181c'; ctx.lineWidth = 1.2*S;
      ctx.beginPath(); ctx.roundRect(x0, axisY - hh, x1 - x0, hh*2, 3*S); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = S;
      for (let x = x0 + 5*S; x < x1 - 3*S; x += 5*S) {
        ctx.beginPath(); ctx.moveTo(x, axisY - hh + 2*S); ctx.lineTo(x, axisY - hh + 7*S);
        ctx.moveTo(x, axisY + hh - 7*S); ctx.lineTo(x, axisY + hh - 2*S); ctx.stroke();
      }
      // exhaust trunk down to the condenser, cooling water flowing
      const mx = (x0 + x1)/2;
      _wfPipe([[mx, axisY + hh], [mx, cdY + 4*S]], S, t, gen, 'rgba(90,190,255,0.9)');
    });

    // ── Steam inlet + stop valve ──
    _wfPipe([[px + 12*S, axisY], [px + W*casings[0].x0, axisY]], S, t, gen, 'rgba(240,250,255,0.95)');
    const svX = px + W*0.05, svR = 7.5*S;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(svX + 3*S, axisY + 4*S, svR + 2*S, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#3a4a52'; ctx.strokeStyle = '#10181c'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.arc(svX, axisY, svR + 1.5*S, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8a1a14'; ctx.beginPath(); ctx.arc(svX, axisY, svR*0.8, 0, Math.PI*2); ctx.fill();   // red handwheel
    ctx.strokeStyle = connected ? accent : '#c04030'; ctx.lineWidth = 1.5*S;
    ctx.save(); ctx.translate(svX, axisY); ctx.rotate(connected ? 0 : Math.PI/4);
    for (let q = 0; q < 3; q++) { ctx.rotate(Math.PI/3); ctx.beginPath(); ctx.moveTo(-svR*0.8, 0); ctx.lineTo(svR*0.8, 0); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = '#c8d0d4'; ctx.beginPath(); ctx.arc(svX, axisY, 1.8*S, 0, Math.PI*2); ctx.fill();

    // ── Shaft ──
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#10161a'; ctx.lineWidth = 9*S;
    ctx.beginPath(); ctx.moveTo(px + W*0.19, axisY); ctx.lineTo(gX0, axisY); ctx.stroke();
    const sg = ctx.createLinearGradient(0, axisY - 3*S, 0, axisY + 3*S);
    sg.addColorStop(0, '#7a8488'); sg.addColorStop(0.45, '#e4eaec'); sg.addColorStop(1, '#5a6468');
    ctx.strokeStyle = sg; ctx.lineWidth = 6*S; ctx.stroke();
    ctx.strokeStyle = 'rgba(30,36,40,0.7)';
    ctx.setLineDash([2*S, 5*S]); ctx.lineDashOffset = -ph*90*S; ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;

    // ── Casings ──
    casings.forEach((c, i) => {
      const x0 = px + W*c.x0, x1 = px + W*c.x1, w = x1 - x0;
      const hl = U*c.hl, hr = U*c.hr, hm = c.lp ? U*c.hh : hr;
      const cone = c.lp ? w*0.24 : w*0.55;
      const outline = () => {
        ctx.beginPath();
        ctx.moveTo(x0, axisY - hl);
        ctx.lineTo(x0 + cone, axisY - hm);
        ctx.lineTo(x1 - (c.lp ? cone : 0), axisY - hm);
        ctx.lineTo(x1, axisY - hr);
        ctx.lineTo(x1, axisY + hr);
        ctx.lineTo(x1 - (c.lp ? cone : 0), axisY + hm);
        ctx.lineTo(x0 + cone, axisY + hm);
        ctx.lineTo(x0, axisY + hl);
        ctx.closePath();
      };
      ctx.lineJoin = 'round';
      ctx.save(); ctx.translate(5*S, 6*S); outline(); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill(); ctx.restore();
      outline(); ctx.fillStyle = cylGrad(axisY - hm, axisY + hm, false); ctx.fill();
      ctx.strokeStyle = '#10181c'; ctx.lineWidth = 1.3*S; ctx.stroke();
      // lagging seams at the cone breaks + panel joints
      ctx.save(); outline(); ctx.clip();
      ctx.strokeStyle = 'rgba(20,30,34,0.35)'; ctx.lineWidth = S;
      const seams = c.lp ? [x0 + cone, x1 - cone, (x0 + x1)/2] : [x0 + cone, x0 + cone*0.5];
      seams.forEach(sx => { ctx.beginPath(); ctx.moveTo(sx, axisY - hm); ctx.lineTo(sx, axisY + hm); ctx.stroke(); });
      ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x0, axisY - hm*0.62, w, hm*0.14);   // specular band
      ctx.restore();
      // bolted horizontal split flange
      ctx.strokeStyle = '#243238'; ctx.lineWidth = 2.2*S;
      ctx.beginPath(); ctx.moveTo(x0 + 2*S, axisY); ctx.lineTo(x1 - 2*S, axisY); ctx.stroke();
      ctx.fillStyle = '#d8b830';
      for (let x = x0 + 5*S; x < x1 - 3*S; x += 6*S) { ctx.beginPath(); ctx.arc(x, axisY - 2*S, 0.9*S, 0, Math.PI*2); ctx.arc(x, axisY + 2*S, 0.9*S, 0, Math.PI*2); ctx.fill(); }
      // blade-row sight slot: rows blur past as the rotor turns
      if (c.lp) {
        const sw = w*0.30, sh = Math.max(4*S, hm*0.26), sx = (x0 + x1)/2 - sw/2, sy = axisY - hm*0.72;
        ctx.fillStyle = '#060c10'; ctx.strokeStyle = '#1a262c'; ctx.lineWidth = S;
        ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, sh*0.4); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, sh*0.4); ctx.clip();
        const off = (ph*140*S) % (3*S);
        ctx.strokeStyle = `rgba(${turning ? '150,230,255' : '90,110,120'},${0.45 + 0.4*spin})`; ctx.lineWidth = 1.1*S;
        for (let x = sx - sh + off; x < sx + sw + sh; x += 3*S) { ctx.beginPath(); ctx.moveTo(x, sy + sh); ctx.lineTo(x + sh*0.8, sy); ctx.stroke(); }
        if (turning) { ctx.fillStyle = `rgba(64,224,255,${0.25*spin})`; ctx.fillRect(sx, sy, sw, sh); }
        ctx.restore();
      }
      // running glow
      if (spin > 0.05) {
        outline(); ctx.strokeStyle = `rgba(64,224,255,${(0.2 + 0.2*Math.sin(t*4 + i))*spin})`; ctx.lineWidth = 3*S; ctx.stroke();
      }
      ctx.fillStyle = 'rgba(16,24,28,0.85)'; ctx.font = `bold ${Math.max(4, 6*S)}px Courier New`; ctx.textAlign = 'center';
      ctx.fillText(c.label, (x0 + x1)/2, axisY + hm*0.62);
      // bearing pedestal + coupling guard to the next machine
      const nx = i < casings.length - 1 ? px + W*casings[i + 1].x0 : gX0;
      const kx = (x1 + nx)/2;
      ctx.fillStyle = '#2a3034'; ctx.strokeStyle = '#0c1012'; ctx.lineWidth = S;
      ctx.beginPath(); ctx.roundRect(kx - 4*S, axisY - 12*S, 8*S, 24*S, 2*S); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e0a020'; ctx.strokeStyle = '#4a3408';
      ctx.beginPath(); ctx.roundRect(kx - 5*S, axisY - 7*S, 10*S, 14*S, 3*S); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(kx - 5*S, axisY + 1*S, 10*S, 1.2*S);
    });

    // ── Crossover pipes (HP exhaust arcing over to both LP casings) ──
    const hpMid = px + W*(casings[0].x0 + casings[0].x1)/2;
    [casings[1], casings[2]].forEach((c, i) => {
      const mx = px + W*(c.x0 + c.x1)/2;
      const topY = Math.max(py + 6*S, axisY - U*0.64 - (8 + i*7)*S);
      const y0 = axisY - U*casings[0].hr*0.8, y1 = axisY - U*c.hh*0.85;
      const cx = (hpMid + mx)/2;
      const arc = (dx, dy) => { ctx.beginPath(); ctx.moveTo(hpMid + dx, y0 + dy); ctx.quadraticCurveTo(cx + dx, topY + dy, mx + dx, y1 + dy); };
      ctx.lineCap = 'round';
      arc(5*S, 6*S); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 11*S; ctx.stroke();
      arc(0, 0); ctx.strokeStyle = '#10181c'; ctx.lineWidth = 11*S; ctx.stroke();
      ctx.strokeStyle = '#7e9098'; ctx.lineWidth = 8*S; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2*S; arc(-1.5*S, -1.5*S); ctx.stroke();
      if (gen) {
        arc(0, 0); ctx.strokeStyle = 'rgba(240,250,255,0.9)'; ctx.lineWidth = 2.5*S;
        ctx.setLineDash([4*S, 6*S]); ctx.lineDashOffset = -t*24*S; ctx.stroke();
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }
      // flange rings at both ends and an expansion bellows at the crown
      const q = (u) => {
        const x = (1-u)*(1-u)*hpMid + 2*(1-u)*u*cx + u*u*mx, y = (1-u)*(1-u)*y0 + 2*(1-u)*u*topY + u*u*y1;
        const dx = 2*(1-u)*(cx - hpMid) + 2*u*(mx - cx), dy = 2*(1-u)*(topY - y0) + 2*u*(y1 - topY);
        const l = Math.hypot(dx, dy) || 1;
        return { x, y, nx: -dy/l, ny: dx/l, tx: dx/l, ty: dy/l };
      };
      [0.1, 0.9].forEach(u => {
        const p = q(u);
        ctx.strokeStyle = '#243036'; ctx.lineWidth = 2.4*S; ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.moveTo(p.x - p.nx*6.5*S, p.y - p.ny*6.5*S); ctx.lineTo(p.x + p.nx*6.5*S, p.y + p.ny*6.5*S); ctx.stroke();
      });
      const b = q(0.5);
      ctx.strokeStyle = '#3a4a52'; ctx.lineWidth = 1.2*S;
      for (let k = -2; k <= 2; k++) {
        const ox = b.x + b.tx*k*2*S, oy = b.y + b.ty*k*2*S;
        ctx.beginPath(); ctx.moveTo(ox - b.nx*5.5*S, oy - b.ny*5.5*S); ctx.lineTo(ox + b.nx*5.5*S, oy + b.ny*5.5*S); ctx.stroke();
      }
    });

    // ── Generator: stator, H₂ coolers, glowing air-gap, exciter ──
    [-1, 1].forEach(sd => {
      const cy = axisY + sd*(gHH + 3*S);
      ctx.fillStyle = '#3a4a50'; ctx.strokeStyle = '#0e161a'; ctx.lineWidth = S;
      ctx.beginPath(); ctx.roundRect(gX0 + (gX1 - gX0)*0.18, cy - 3.5*S, (gX1 - gX0)*0.64, 7*S, 2*S); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      for (let x = gX0 + (gX1 - gX0)*0.22; x < gX0 + (gX1 - gX0)*0.8; x += 2.5*S) { ctx.beginPath(); ctx.moveTo(x, cy - 2.5*S); ctx.lineTo(x, cy + 2.5*S); ctx.stroke(); }
    });
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.roundRect(gX0 + 5*S, axisY - gHH + 6*S, gX1 - gX0, gHH*2, gHH*0.55); ctx.fill();
    ctx.fillStyle = cylGrad(axisY - gHH, axisY + gHH, true); ctx.strokeStyle = '#0a1014'; ctx.lineWidth = 1.3*S;
    ctx.beginPath(); ctx.roundRect(gX0, axisY - gHH, gX1 - gX0, gHH*2, gHH*0.55); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.roundRect(gX0, axisY - gHH, gX1 - gX0, gHH*2, gHH*0.55); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.4*S;
    for (let x = gX0 + 7*S; x < gX1 - 5*S; x += 5*S) { ctx.beginPath(); ctx.moveTo(x, axisY - gHH); ctx.lineTo(x, axisY + gHH); ctx.stroke(); }
    ctx.restore();
    // stator end-bells
    [gX0 + 3*S, gX1 - 3*S].forEach(x => { ctx.fillStyle = '#1e2a30'; ctx.beginPath(); ctx.ellipse(x, axisY, 3*S, gHH*0.8, 0, 0, Math.PI*2); ctx.fill(); });
    const glow = spin > 0.05 ? 0.55*spin + 0.35*spin*Math.sin(t*7) : 0;
    ctx.fillStyle = spin > 0.05 ? `rgba(120,240,255,${0.3 + glow})` : '#0a1216';
    ctx.beginPath(); ctx.roundRect(gX0 + 8*S, axisY - 2.5*S, gX1 - gX0 - 16*S, 5*S, 2*S); ctx.fill();
    if (spin > 0.05) drawGlowHalo((gX0 + gX1)/2, axisY, (gX1 - gX0)*0.55, [[0, 'rgba(90,230,255,0.9)'], [1, 'transparent']], 0.22*spin);
    ctx.fillStyle = 'rgba(200,230,240,0.75)'; ctx.font = `bold ${Math.max(4, 5.5*S)}px Courier New`; ctx.textAlign = 'center';
    ctx.fillText('GEN', (gX0 + gX1)/2, axisY - gHH*0.45);
    ctx.fillStyle = '#4a5a62'; ctx.strokeStyle = '#10181c'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.roundRect(gX1 + 2*S, axisY - gHH*0.55, 15*S, gHH*1.1, 3*S); ctx.fill(); ctx.stroke();
    _fcFan(gX1 + 9.5*S, axisY, Math.min(5.5*S, gHH*0.4), S, ph*1.5, turning, 12);

    // ── Isolated-phase bus to the transformer yard ──
    const tyX = px + W*0.855, tyY = py + H*0.12, tyW = W*0.125, tyH = H*0.76;
    const busX0 = gX1 + 17*S;
    [-4.5, 0, 4.5].forEach((o, i) => {
      const y = axisY + o*S;
      ctx.strokeStyle = '#10161a'; ctx.lineWidth = 4*S; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(busX0, y); ctx.lineTo(tyX + tyW*0.12, y); ctx.stroke();
      ctx.strokeStyle = '#7a8a90'; ctx.lineWidth = 2.6*S; ctx.stroke();
      if (gen) {
        ctx.strokeStyle = 'rgba(255,220,120,0.95)'; ctx.lineWidth = 1.2*S;
        ctx.setLineDash([2*S, 5*S]); ctx.lineDashOffset = -t*22*S - i*2*S; ctx.stroke();
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }
    });

    // ── Transformer yard: gravel pad, two main transformers ──
    ctx.fillStyle = '#3e3c34'; ctx.strokeStyle = '#1a1814'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.roundRect(tyX - 3*S, tyY - 3*S, tyW + 6*S, tyH + 6*S, 3*S); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    for (let q = 0; q < 70; q++) {
      const gx = tyX - 2*S + ((q*37) % 97)/97*(tyW + 4*S), gy = tyY - 2*S + ((q*53) % 89)/89*(tyH + 4*S);
      ctx.fillRect(gx, gy, 1.2*S, 1.2*S);
    }
    const units = [tyY + tyH*0.03, tyY + tyH*0.53].map(yy => ({ yy, bh: tyH*0.44 }));
    const trunkX = tyX + tyW*0.12;
    // LV bus riser down the yard's left edge, tapping into both transformers
    ctx.strokeStyle = '#10161a'; ctx.lineWidth = 5*S; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(trunkX, units[0].yy + units[0].bh*0.5); ctx.lineTo(trunkX, units[1].yy + units[1].bh*0.5); ctx.stroke();
    ctx.strokeStyle = '#7a8a90'; ctx.lineWidth = 3*S; ctx.stroke();
    if (gen) {
      ctx.strokeStyle = 'rgba(255,220,120,0.95)'; ctx.lineWidth = 1.2*S;
      ctx.setLineDash([2*S, 5*S]); ctx.lineDashOffset = -t*22*S; ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    units.forEach(({ yy, bh }, i) => {
      const tx = tyX + tyW*0.24, tw = tyW*0.50;
      // LV tap from the riser
      ctx.strokeStyle = '#10161a'; ctx.lineWidth = 4*S;
      ctx.beginPath(); ctx.moveTo(trunkX, yy + bh*0.5); ctx.lineTo(tx + 2*S, yy + bh*0.5); ctx.stroke();
      ctx.strokeStyle = '#7a8a90'; ctx.lineWidth = 2.4*S; ctx.stroke();
      // radiator bank on the right: finned panels
      const rx = tx + tw + 1.5*S, rw = tyX + tyW - rx - 1*S;
      ctx.fillStyle = '#2e362c'; ctx.fillRect(rx, yy + bh*0.08, rw, bh*0.84);
      for (let y = yy + bh*0.1; y < yy + bh*0.9 - 1.5*S; y += 2.6*S) {
        ctx.fillStyle = '#6a7a64'; ctx.fillRect(rx + 0.5*S, y, rw - 1*S, 1.5*S);
      }
      // main tank
      _wfShadow(tx, yy, tw, bh, S, 2*S);
      const tg = ctx.createLinearGradient(tx, 0, tx + tw, 0);
      tg.addColorStop(0, '#4e5e50'); tg.addColorStop(0.35, '#8a9c86'); tg.addColorStop(1, '#3a463a');
      ctx.fillStyle = tg; ctx.strokeStyle = '#141a14'; ctx.lineWidth = 1.2*S;
      ctx.beginPath(); ctx.roundRect(tx, yy, tw, bh, 2*S); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = S;
      ctx.beginPath(); ctx.moveTo(tx + 2*S, yy + bh*0.32); ctx.lineTo(tx + tw - 2*S, yy + bh*0.32); ctx.stroke();
      // conservator: a small horizontal drum across the top
      ctx.fillStyle = cylGrad(yy + 2*S, yy + 8*S, true);
      ctx.strokeStyle = '#141a14';
      ctx.beginPath(); ctx.roundRect(tx + 3*S, yy + 2.5*S, tw - 6*S, 6*S, 3*S); ctx.fill(); ctx.stroke();
      // three HV bushings seen from above: porcelain skirts + terminal
      const br = Math.min(4.5*S, tw*0.11);
      for (let q = 0; q < 3; q++) {
        const bx = tx + tw*(0.2 + q*0.3), by = yy + bh*0.62;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(bx + 2*S, by + 2.5*S, br, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#b86a44'; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#6a3a22'; ctx.lineWidth = 0.8*S;
        [0.72, 0.46].forEach(f => { ctx.beginPath(); ctx.arc(bx, by, br*f, 0, Math.PI*2); ctx.stroke(); });
        ctx.fillStyle = '#e0e4e4'; ctx.beginPath(); ctx.arc(bx, by, br*0.28, 0, Math.PI*2); ctx.fill();
        if (gen && Math.sin(t*11 + q*2.3 + i*1.7) > 0.93) {
          ctx.strokeStyle = 'rgba(210,245,255,0.95)'; ctx.lineWidth = 1.2*S;
          ctx.beginPath(); ctx.moveTo(bx, by - 2*S); ctx.lineTo(bx + 3*S, by - 6*S); ctx.lineTo(bx - 1*S, by - 9*S); ctx.stroke();
          drawGlowHalo(bx, by, 6*S, [[0, 'rgba(200,240,255,0.9)'], [1, 'transparent']], 0.5);
        }
      }
      // rating plate
      ctx.fillStyle = '#e8e0c0'; ctx.fillRect(tx + tw*0.28, yy + bh - 6*S, tw*0.44, 3*S);
    });

    // ── Below the deck: lube-oil skid, condenser, control cabin ──
    if (cdH > 10*S) {
      // lube-oil skid: two pumps with motors and a reservoir
      _wfShadow(loX, loY, loW, loH, S, 2*S);
      ctx.fillStyle = '#5a5238'; ctx.strokeStyle = '#1e1a10'; ctx.lineWidth = S;
      ctx.beginPath(); ctx.roundRect(loX, loY, loW, loH, 2*S); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3a3420'; ctx.fillRect(loX + 3*S, loY + loH*0.62, loW - 6*S, loH*0.3);
      for (let q = 0; q < 2; q++) {
        const ox = loX + loW*(0.3 + q*0.4), oy = loY + loH*0.34, orr = Math.min(loW*0.15, loH*0.22);
        ctx.fillStyle = '#8a7a40'; ctx.beginPath(); ctx.arc(ox, oy, orr, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#2a2410'; ctx.stroke();
        ctx.save(); ctx.translate(ox, oy); ctx.rotate(ph*9 + q);
        ctx.strokeStyle = '#2a2410'; ctx.lineWidth = 1.2*S;
        ctx.beginPath(); ctx.moveTo(-orr*0.7, 0); ctx.lineTo(orr*0.7, 0); ctx.moveTo(0, -orr*0.7); ctx.lineTo(0, orr*0.7); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = '#e8c860'; ctx.font = `bold ${Math.max(4, 5*S)}px Courier New`; ctx.textAlign = 'center';
      ctx.fillText('LUBE', loX + loW/2, loY + loH*0.8);

      // condenser: shell with water boxes and a tube bundle
      _wfShadow(cdX, cdY, cdW, cdH, S, 3*S);
      ctx.fillStyle = '#3e4c54'; ctx.strokeStyle = '#10181c'; ctx.lineWidth = 1.2*S;
      ctx.beginPath(); ctx.roundRect(cdX, cdY, cdW, cdH, 3*S); ctx.fill(); ctx.stroke();
      const wb = Math.min(10*S, cdW*0.1);
      [cdX + 2*S, cdX + cdW - wb - 2*S].forEach(x => {
        ctx.fillStyle = '#2a5a78'; ctx.beginPath(); ctx.roundRect(x, cdY + 2*S, wb, cdH - 4*S, 2*S); ctx.fill();
        ctx.strokeStyle = '#10181c'; ctx.stroke();
      });
      ctx.save(); ctx.beginPath(); ctx.rect(cdX + wb + 4*S, cdY + 3*S, cdW - 2*wb - 8*S, cdH - 6*S); ctx.clip();
      ctx.strokeStyle = gen ? 'rgba(90,190,255,0.5)' : 'rgba(0,0,0,0.3)'; ctx.lineWidth = S;
      for (let y = cdY + 4*S; y < cdY + cdH - 3*S; y += 3*S) { ctx.beginPath(); ctx.moveTo(cdX, y); ctx.lineTo(cdX + cdW, y); ctx.stroke(); }
      if (gen) {
        ctx.strokeStyle = 'rgba(160,225,255,0.8)'; ctx.lineWidth = S;
        ctx.setLineDash([3*S, 9*S]); ctx.lineDashOffset = -t*18*S;
        for (let y = cdY + 4*S; y < cdY + cdH - 3*S; y += 6*S) { ctx.beginPath(); ctx.moveTo(cdX, y); ctx.lineTo(cdX + cdW, y); ctx.stroke(); }
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }
      ctx.restore();

      // control cabin: OUT readout + RPM dial
      _wfShadow(ccX, ccY, ccW, ccH, S, 2*S);
      ctx.fillStyle = '#4a5860'; ctx.strokeStyle = '#141c20'; ctx.lineWidth = 1.2*S;
      ctx.beginPath(); ctx.roundRect(ccX, ccY, ccW, ccH, 3*S); ctx.fill(); ctx.stroke();
      const dR = Math.min(ccH*0.36, ccW*0.18), dX = ccX + 4*S + dR, dY = ccY + ccH/2;
      ctx.fillStyle = '#0a1014'; ctx.strokeStyle = '#203038'; ctx.lineWidth = S;
      ctx.beginPath(); ctx.arc(dX, dY, dR, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      const a0 = Math.PI*0.75, a1 = Math.PI*2.25;
      ctx.strokeStyle = 'rgba(64,224,255,0.35)'; ctx.lineWidth = 1.2*S;
      ctx.beginPath(); ctx.arc(dX, dY, dR*0.8, a0, a1); ctx.stroke();
      ctx.strokeStyle = '#ff5040'; ctx.beginPath(); ctx.arc(dX, dY, dR*0.8, a1 - 0.35, a1); ctx.stroke();
      const na = a0 + (a1 - a0)*0.82*spin + (turning ? 0.02*Math.sin(t*13) : 0);
      ctx.strokeStyle = turning ? '#80e8ff' : '#5a6a70'; ctx.lineWidth = 1.2*S;
      ctx.beginPath(); ctx.moveTo(dX, dY); ctx.lineTo(dX + Math.cos(na)*dR*0.75, dY + Math.sin(na)*dR*0.75); ctx.stroke();
      ctx.fillStyle = '#c8d0d4'; ctx.beginPath(); ctx.arc(dX, dY, 1.2*S, 0, Math.PI*2); ctx.fill();
      const panX = dX + dR + 3*S, panY = ccY + 4*S, panW = ccX + ccW - 4*S - panX, panH = ccH - 8*S;
      ctx.fillStyle = '#060a0c'; ctx.strokeStyle = '#203038'; ctx.lineWidth = S;
      ctx.beginPath(); ctx.roundRect(panX, panY, panW, panH, S*2); ctx.fill(); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const fs = Math.max(4, Math.min(panH*0.3, 7*S));
      ctx.font = `bold ${fs}px Courier New`;
      ctx.fillStyle = gen ? '#80e8ff' : '#ff4040';
      ctx.fillText(`OUT:${formatPower(Math.round(e._currentOutput||0))}`, panX + panW/2, panY + panH*0.34);
      ctx.fillStyle = turning ? 'rgba(128,232,255,0.7)' : 'rgba(255,64,64,0.6)';
      ctx.font = `${Math.max(4, fs*0.85)}px Courier New`;
      ctx.fillText(`${Math.round(3000*spin)} RPM`, panX + panW/2, panY + panH*0.7);
      ctx.textBaseline = 'alphabetic';
    }

    // gland-seal steam wisps off the LP casings while running
    casings.filter(c => c.lp).forEach((c, i) => _wfSmoke(px + W*(c.x0 + c.x1)/2 + 6*S, axisY - U*c.hh - 2*S, S*0.5, t + i, '240,250,255', gen, 0.3));

    _portPipe(aIn, S, t, { fluid: '#40e0ff', label: 'STEAM IN', on: connected, out: false, flow: gen });

    _wfPlate('STEAM TURBINE', px + W*0.44, py + H*0.05, S, accent, gen);
    _wfLamp(px + W - 7*S, py + 7*S, S, t, hasPower ? accent : '#ff4040', true);
    drawNetworkHighlight(e, px, py, t);
    ctx.restore();
  }


function renderOilDeposit(e, px, py, t) {
    // Oil Deposit — a natural tar seep. Dry, cracked ground soaked dark
    // round a black pool whose surface carries a slowly turning rainbow
    // sheen; gas bubbles swell and pop through it, smaller seeps weep out
    // between oil-stained rocks, and an old capped test well with a rusty
    // valve wheel marks where the surveyors drilled. The pool shrinks as the
    // reservoir pressure falls.
    const K = _depositKit(e, px, py);
    const { k, X, Y, S, blob, poly, ell, line, rock } = K;
    const detail = Camera.zoom > 0.5;
    const phase = e._oilPhase ?? S(96)*6.28;
    const pulse = 0.5 + 0.5*Math.sin(t*0.8 + phase);
    const pressure = e._pressure ?? 1;
    const fill = 0.62 + 0.38*Math.max(0, Math.min(1, pressure));
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // ── Dry ground and the oil-soaked patch ────────────────────────────
    blob(50, 52, 47, 44, 0.10, 4, 18); ctx.fillStyle = '#4a4430'; ctx.fill();
    blob(50, 53, 40, 36, 0.16, 36, 16); ctx.fillStyle = '#2e281c'; ctx.fill();
    blob(50, 54, 31, 27, 0.18, 52, 14); ctx.fillStyle = '#3a3122'; ctx.fill();
    if (detail) {
      K.tufts('#6a5e34', 66, 14);
      ctx.strokeStyle = 'rgba(15,12,8,0.55)'; ctx.lineWidth = 0.6*k;       // desiccation cracks in the dry ring
      ctx.beginPath();
      for (let c = 0; c < 14 + K.size*3; c++) {
        const a = S(60 + c)*Math.PI*2, r = 34 + S(70 + c)*9;
        const x = 50 + Math.cos(a)*r, y = 52 + Math.sin(a)*r*0.9;
        ctx.moveTo(X(x), Y(y)); ctx.lineTo(X(x + (S(80 + c) - 0.5)*9), Y(y + (S(90 + c) - 0.5)*8));
      }
      ctx.stroke();
    }

    // ── Oil-stained rocks round the seep ───────────────────────────────
    const rocks = [];
    for (let i = 0; i < 3 + K.size; i++) {
      const a = S(200 + i)*Math.PI*2, d = 26 + S(210 + i)*8;
      rocks.push({ x: 50 + Math.cos(a)*d, y: 54 + Math.sin(a)*d*0.8, r: 3.5 + S(220 + i)*3.5, i });
    }
    rocks.sort((p, q) => p.y - q.y);
    for (const r of rocks) {
      rock(r.x, r.y, r.r, 230 + r.i*9, '#3a342a', '#5c5444', 'rgba(0,0,0,0.35)');
      ell(r.x - r.r*0.2, r.y - r.r*0.35, r.r*0.35, r.r*0.18); ctx.fillStyle = 'rgba(255,240,210,0.25)'; ctx.fill();   // wet gloss
    }

    // ── Satellite seeps ────────────────────────────────────────────────
    for (let i = 0; i < K.size - 1; i++) {
      const a = 0.4 + i*2.2 + S(300 + i)*0.8, d = 22 + S(310 + i)*6;
      const sx = 50 + Math.cos(a)*d, sy = 56 + Math.sin(a)*d*0.8, sr = (4 + S(320 + i)*2.5)*fill;
      blob(sx, sy, sr + 1.5, sr*0.7 + 1.2, 0.2, 330 + i*9, 10); ctx.fillStyle = 'rgba(8,6,4,0.55)'; ctx.fill();
      blob(sx, sy, sr, sr*0.62, 0.2, 340 + i*9, 10); ctx.fillStyle = '#070504'; ctx.fill();
      ell(sx - sr*0.3, sy - sr*0.2, sr*0.35, sr*0.14); ctx.fillStyle = 'rgba(255,245,225,0.35)'; ctx.fill();
    }

    // ── The main pool ──────────────────────────────────────────────────
    const pX = 46 + S(13)*8, pY = 56 + S(14)*6;
    const prx = 21*fill, pry = 14*fill;
    blob(pX, pY + 1.2, prx + 3.5, pry + 2.8, 0.14, 400, 14); ctx.fillStyle = 'rgba(6,4,2,0.6)'; ctx.fill();   // soaked margin
    blob(pX, pY, prx, pry, 0.14, 420, 14);
    const pg = ctx.createRadialGradient(X(pX - prx*0.3), Y(pY - pry*0.4), 0, X(pX), Y(pY), prx*1.1*k);
    pg.addColorStop(0, '#2a2016'); pg.addColorStop(0.45, '#0e0a06'); pg.addColorStop(1, '#030201');
    ctx.fillStyle = pg; ctx.fill();
    ctx.strokeStyle = 'rgba(150,125,85,0.55)'; ctx.lineWidth = 0.8*k; ctx.stroke();   // wet meniscus catching the light

    // Iridescent sheen, slowly turning and shifting hue
    ctx.save();
    blob(pX, pY, prx, pry, 0.14, 420, 14); ctx.clip();
    for (let b = 0; b < 3; b++) {
      const hue = (t*14 + b*80 + phase*40) % 360;
      const rot = t*0.05 + b*1.9 + phase;
      ctx.strokeStyle = `hsla(${hue.toFixed(0)},90%,62%,${(0.38 + 0.14*pulse).toFixed(3)})`;
      ctx.lineWidth = (2.6 - b*0.5)*k;
      ctx.beginPath();
      ctx.ellipse(X(pX + Math.cos(rot)*prx*0.18), Y(pY + Math.sin(rot)*pry*0.18), prx*(0.55 + b*0.16)*k, pry*(0.38 + b*0.12)*k, rot*0.6, 0.3, 2.6);
      ctx.stroke();
    }
    ctx.restore();
    ell(pX - prx*0.38, pY - pry*0.45, prx*0.28, pry*0.12); ctx.fillStyle = 'rgba(255,248,230,0.38)'; ctx.fill();    // sky reflection
    ell(pX - prx*0.2, pY - pry*0.6, prx*0.10, pry*0.05); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();

    // Gas bubbles: swell, then pop into a spreading ring
    for (let b = 0; b < 2 + K.size; b++) {
      const cyc = (t*(0.22 + S(500 + b)*0.12) + S(510 + b)) % 1;
      const bx = pX + (S(520 + b) - 0.5)*prx*1.1, by = pY + (S(530 + b) - 0.5)*pry*0.9;
      if (cyc < 0.7) {
        const r = 0.6 + (cyc/0.7)*2.6;
        ell(bx, by, r, r*0.7); ctx.fillStyle = '#16100a'; ctx.fill();
        ell(bx - r*0.3, by - r*0.3, r*0.35, r*0.22); ctx.fillStyle = `hsla(${((t*30 + b*70) % 360).toFixed(0)},70%,70%,0.55)`; ctx.fill();
      } else if (detail) {
        const ph = (cyc - 0.7)/0.3;
        ctx.strokeStyle = `rgba(200,180,140,${((1 - ph)*0.55).toFixed(3)})`; ctx.lineWidth = 0.5*k;
        ctx.beginPath(); ctx.ellipse(X(bx), Y(by), (2.6 + ph*4.5)*k, (1.8 + ph*3)*k, 0, 0, Math.PI*2); ctx.stroke();
      }
    }

    // ── Capped test well ───────────────────────────────────────────────
    const wX = 78 + S(15)*6, wY = 26 + S(16)*6;
    ell(wX + 1.5, wY + 9, 7, 2.6); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    ell(wX, wY + 8, 6, 2.4); ctx.fillStyle = '#5a5248'; ctx.fill();                 // concrete pad
    poly([[wX - 2, wY + 8], [wX - 2, wY - 1], [wX + 2, wY - 1], [wX + 2, wY + 8]]); ctx.fillStyle = '#6a4a30'; ctx.fill();   // casing
    poly([[wX + 0.6, wY + 8], [wX + 0.6, wY - 1], [wX + 2, wY - 1], [wX + 2, wY + 8]]); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
    poly([[wX - 3, wY - 1], [wX + 3, wY - 1], [wX + 3, wY - 2.6], [wX - 3, wY - 2.6]]); ctx.fillStyle = '#8a6040'; ctx.fill();  // flange
    line(wX, wY - 2.6, wX, wY - 6, '#5a4a3a', 0.9);                                  // valve stem
    ctx.strokeStyle = '#b8402a'; ctx.lineWidth = 0.9*k;                               // wheel
    ctx.beginPath(); ctx.ellipse(X(wX), Y(wY - 6.5), 3*k, 1.3*k, 0, 0, Math.PI*2); ctx.stroke();
    line(wX - 3, wY - 6.5, wX + 3, wY - 6.5, '#b8402a', 0.5);
    if (detail) {
      ell(wX - 1, wY + 3, 1.2, 2); ctx.fillStyle = 'rgba(10,6,2,0.7)'; ctx.fill();   // weep down the casing
      const sx = wX - 12, sy = wY + 2;                                               // survey stake
      line(sx, sy + 7, sx, sy - 5, '#8a6a40', 1.0);
      poly([[sx, sy - 5], [sx + 4, sy - 3.9], [sx, sy - 2.8]]); ctx.fillStyle = '#ff7020'; ctx.fill();
    }

    // Heat shimmer over the dark ground on a sunny day
    if (detail && DayNight.darkness() < 0.3) {
      for (let s = 0; s < 3; s++) {
        const ph = (t*0.18 + s/3 + S(600)) % 1;
        const yy = pY - pry - 2 - ph*18;
        ctx.strokeStyle = `rgba(255,240,200,${((1 - ph)*Math.min(1, ph*5)*0.14).toFixed(3)})`; ctx.lineWidth = 0.6*k;
        ctx.beginPath();
        for (let q = 0; q <= 8; q++) {
          const xx = pX - 12 + q*3, wy = yy + Math.sin(q*1.3 + t*2 + s)*0.8;
          q ? ctx.lineTo(X(xx), Y(wy)) : ctx.moveTo(X(xx), Y(wy));
        }
        ctx.stroke();
      }
    }

    // Tile badge in the corner, matching the element tiles: a droplet for
    // crude, since oil has no atomic number.
    {
      const s = Math.max(14, 16*k), x0 = px + 3, y0 = py + 3;
      ctx.fillStyle = 'rgba(20,14,6,0.85)'; ctx.strokeStyle = 'rgba(200,160,90,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x0, y0, s, s*1.1, 2); ctx.fill(); ctx.stroke();
      const dx = x0 + s*0.5, dy = y0 + s*0.62, r = s*0.24;
      ctx.fillStyle = `rgba(230,190,110,${(0.8 + 0.2*pulse).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(dx, dy - r*2.1);
      ctx.bezierCurveTo(dx + r*0.4, dy - r*1.3, dx + r, dy - r*0.6, dx + r, dy);
      ctx.arc(dx, dy, r, 0, Math.PI);
      ctx.bezierCurveTo(dx - r, dy - r*0.6, dx - r*0.4, dy - r*1.3, dx, dy - r*2.1);
      ctx.fill();
    }
    ctx.restore();
  }

// Shared scaffolding for the oil, uranium, sulfur and lithium deposit sprites. All are
// authored in a 100-unit square scaled to the footprint (2×2 up to 4×4), with
// a stable per-deposit random stream so every deposit is laid out differently
// but never changes from frame to frame.
function _depositKit(e, px, py) {
  const w = (e.width || 2) * TILE, h = (e.height || 2) * TILE;
  const k = w / 100;
  const X = (v) => px + v*k, Y = (v) => py + v*(h / 100);
  const S = (n) => { const x = Math.sin((e.col || 0)*127.1 + (e.row || 0)*311.7 + n*74.3)*43758.5453; return x - Math.floor(x); };
  // Smooth irregular closed outline around (cx, cy); leaves the path open for fill/stroke.
  const blob = (cx, cy, rx, ry, jit, seed, n = 14) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI*2, r = 1 - jit + S(seed + i)*jit*2;
      pts.push([X(cx + Math.cos(a)*rx*r), Y(cy + Math.sin(a)*ry*r)]);
    }
    ctx.beginPath();
    let mx = (pts[n - 1][0] + pts[0][0]) / 2, my = (pts[n - 1][1] + pts[0][1]) / 2;
    ctx.moveTo(mx, my);
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    ctx.closePath();
  };
  const poly = (pts) => { ctx.beginPath(); ctx.moveTo(X(pts[0][0]), Y(pts[0][1])); for (let i = 1; i < pts.length; i++) ctx.lineTo(X(pts[i][0]), Y(pts[i][1])); ctx.closePath(); };
  const ell  = (x, y, rx, ry) => { ctx.beginPath(); ctx.ellipse(X(x), Y(y), rx*k, ry*k, 0, 0, Math.PI*2); };
  const line = (x1, y1, x2, y2, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw*k; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
  // Irregular rock: n vertices round (x, y) at radius r, with a lit upper face.
  const rock = (x, y, r, seed, body, face, shade = 'rgba(0,0,0,0.4)') => {
    const n = 6, pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI*2 + S(seed)*0.8, rr = r*(0.72 + S(seed + i + 1)*0.4);
      pts.push([x + Math.cos(a)*rr, y + Math.sin(a)*rr*0.78]);
    }
    poly(pts.map(([a, b]) => [a + r*0.18, b + r*0.26])); ctx.fillStyle = shade; ctx.fill();
    poly(pts); ctx.fillStyle = body; ctx.fill();
    poly([[x, y], ...pts.filter(([, b]) => b <= y + r*0.1)]); ctx.fillStyle = face; ctx.fill();
    return pts;
  };
  // Scorched/dead grass tufts round the rim of the patch.
  const tufts = (col, seed, count) => {
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, 0.7*k);
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI*2 + S(seed + i)*0.35;
      const gx = 50 + Math.cos(a)*45, gy = 52 + Math.sin(a)*42;
      for (let b = -1; b <= 1; b++) { ctx.moveTo(X(gx + b*1.2), Y(gy)); ctx.lineTo(X(gx + b*2.2), Y(gy - 3 - S(seed + i + b + 9)*2.5)); }
    }
    ctx.stroke();
  };
  // Periodic-table tile in the top-left corner: atomic number over symbol.
  const elementTile = (num, sym, fg, bg, border) => {
    const s = Math.max(14, 16*k), x0 = px + 3, y0 = py + 3;
    ctx.fillStyle = bg; ctx.strokeStyle = border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x0, y0, s, s*1.1, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(s*0.28)}px Courier New`;
    ctx.fillText(num, x0 + s*0.3, y0 + s*0.22);
    ctx.font = `bold ${Math.round(s*0.56)}px Courier New`;
    ctx.fillText(sym, x0 + s*0.52, y0 + s*0.68);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  };
  return { w, h, k, X, Y, S, blob, poly, ell, line, rock, tufts, elementTile, size: e.width || 2 };
}

function renderUraniumDeposit(e, px, py, t) {
    // Uranium Deposit — a scorched pitchblende outcrop. Blackened, dead ground
    // around a heap of dark ore boulders shot through with glowing autunite
    // veins; clusters of green crystal push up between them, a seep pool
    // glows and bubbles, motes drift up off the ore, and a pair of old survey
    // stakes hold warning tape and a trefoil sign.
    const K = _depositKit(e, px, py);
    const { k, X, Y, S, blob, poly, ell, line, rock } = K;
    const detail = Camera.zoom > 0.5;
    const phase = e._uraniumPhase ?? S(99)*6.28;
    const pulse = 0.5 + 0.5*Math.sin(t*1.3 + phase);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // ── Scorched ground ────────────────────────────────────────────────
    blob(50, 52, 47, 44, 0.10, 1, 18); ctx.fillStyle = '#34331f'; ctx.fill();
    blob(50, 52, 39, 36, 0.14, 30, 16); ctx.fillStyle = '#1c1e14'; ctx.fill();
    if (detail) {
      K.tufts('#6a5c38', 60, 14);
      for (let c = 0; c < 3 + K.size; c++) {                           // radiating cracks
        const a = S(40 + c)*Math.PI*2;
        let r = 14, x = 50 + Math.cos(a)*r, y = 50 + Math.sin(a)*r*0.9;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.7*k; ctx.beginPath(); ctx.moveTo(X(x), Y(y));
        for (let s = 0; s < 4; s++) {
          r += 6; const ja = a + (S(45 + c*5 + s) - 0.5)*0.7;
          x = 50 + Math.cos(ja)*r; y = 50 + Math.sin(ja)*r*0.9; ctx.lineTo(X(x), Y(y));
        }
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(X(50), Y(46), 0, X(50), Y(46), 42*k);
      g.addColorStop(0, `rgba(110,255,120,${(0.18 + 0.14*pulse).toFixed(3)})`);
      g.addColorStop(1, 'rgba(60,200,80,0)');
      ctx.fillStyle = g; blob(50, 52, 42, 39, 0.12, 30, 16); ctx.fill();
    }

    // ── Seep pool ──────────────────────────────────────────────────────
    const pX = 22 + S(5)*14, pY = 70 + S(6)*8;
    blob(pX, pY, 13, 7.5, 0.18, 80, 12); ctx.fillStyle = '#2c3a20'; ctx.fill();
    blob(pX, pY, 10.5, 5.6, 0.18, 80, 12); ctx.fillStyle = '#1f6a2c'; ctx.fill();
    ell(pX - 1, pY - 0.5, 6.5, 3); ctx.fillStyle = `rgba(150,255,140,${(0.25 + 0.3*pulse).toFixed(3)})`; ctx.fill();
    if (detail) for (let b = 0; b < 2; b++) {
      const ph = (t*0.6 + b*0.5 + S(7)) % 1;
      ctx.strokeStyle = `rgba(190,255,180,${((1 - ph)*0.6).toFixed(3)})`; ctx.lineWidth = 0.6*k;
      ctx.beginPath(); ctx.ellipse(X(pX - 4 + b*6), Y(pY + (b ? 1 : -1)), (0.8 + ph*3.5)*k, (0.5 + ph*1.8)*k, 0, 0, Math.PI*2); ctx.stroke();
    }

    // ── Ore boulders with glowing veins (back to front) ────────────────
    const rocks = [];
    for (let i = 0; i < 5 + K.size*2; i++) {
      const a = S(100 + i)*Math.PI*2, d = Math.sqrt(S(120 + i))*22;
      rocks.push({ x: 54 + Math.cos(a)*d, y: 44 + Math.sin(a)*d*0.75, r: 6 + S(140 + i)*6, i });
    }
    rocks.sort((p, q) => p.y - q.y);
    for (const r of rocks) {
      const pts = rock(r.x, r.y, r.r, 160 + r.i*9, '#3a3f38', '#5a6154');
      const vein = 0.45 + 0.45*Math.sin(t*1.8 + r.i*1.7 + phase);
      const p0 = pts[Math.floor(S(180 + r.i)*6)], p1 = pts[(Math.floor(S(180 + r.i)*6) + 3) % 6];
      const midX = (p0[0] + p1[0]) / 2 + (S(190 + r.i) - 0.5)*r.r*0.6, midY = (p0[1] + p1[1]) / 2;
      ctx.strokeStyle = `rgba(200,240,70,${vein.toFixed(3)})`; ctx.lineWidth = 0.9*k;
      ctx.beginPath(); ctx.moveTo(X(p0[0]*0.7 + r.x*0.3), Y(p0[1]*0.7 + r.y*0.3));
      ctx.lineTo(X(midX), Y(midY)); ctx.lineTo(X(p1[0]*0.7 + r.x*0.3), Y(p1[1]*0.7 + r.y*0.3)); ctx.stroke();
    }

    // ── Crystal clusters ───────────────────────────────────────────────
    for (let c = 0; c < 2 + K.size; c++) {
      const cx = 50 + (S(200 + c) - 0.5)*48, cy = 48 + (S(210 + c) - 0.5)*34;
      const flick = 0.55 + 0.45*Math.sin(t*2.1 + c*2.3 + phase);
      if (detail) { ell(cx, cy - 4, 9, 6); ctx.fillStyle = `rgba(90,255,110,${(0.10 + 0.10*flick).toFixed(3)})`; ctx.fill(); }
      for (let p = 0; p < 4; p++) {
        const ang = -Math.PI/2 + (p - 1.5)*0.42 + (S(220 + c*4 + p) - 0.5)*0.3;
        const len = 7 + S(230 + c*4 + p)*7, wd = 1.8 + S(240 + c + p)*0.8;
        const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
        const bx = cx + nx*(p - 1.5)*1.6, by = cy;
        const tip = [bx + dx*len, by + dy*len];
        poly([[bx + nx*wd, by + ny*wd], [bx + nx*wd + dx*len*0.8, by + ny*wd + dy*len*0.8], tip, [bx - nx*wd + dx*len*0.8, by - ny*wd + dy*len*0.8], [bx - nx*wd, by - ny*wd]]);
        ctx.fillStyle = `rgba(60,210,90,${(0.75 + 0.2*flick).toFixed(3)})`; ctx.fill();
        poly([[bx, by], [bx + dx*len*0.8, by + dy*len*0.8], tip, [bx - nx*wd + dx*len*0.8, by - ny*wd + dy*len*0.8], [bx - nx*wd, by - ny*wd]]);
        ctx.fillStyle = `rgba(190,255,190,${(0.55 + 0.35*flick).toFixed(3)})`; ctx.fill();
      }
      if (Math.sin(t*1.4 + c*3.1 + phase) > 0.93) {                     // glint
        line(cx - 3, cy - 12, cx + 3, cy - 12, 'rgba(230,255,230,0.9)', 0.6);
        line(cx, cy - 15, cx, cy - 9, 'rgba(230,255,230,0.9)', 0.6);
      }
    }

    // ── Drifting motes ─────────────────────────────────────────────────
    if (detail) for (let m = 0; m < 4 + K.size*2; m++) {
      const ph = (t*0.22 + S(300 + m)) % 1;
      const mx = 32 + S(310 + m)*40 + Math.sin(t*0.9 + m)*2.5, my = 52 - ph*34;
      const a = (1 - ph)*Math.min(1, ph*8)*0.85;
      ell(mx, my, 0.9, 0.9); ctx.fillStyle = `rgba(170,255,160,${a.toFixed(3)})`; ctx.fill();
    }

    // ── Survey stakes, warning tape and a trefoil sign ─────────────────
    if (detail) {
      const s1 = [12 + S(400)*6, 30 + S(401)*8], s2 = [82 + S(402)*6, 20 + S(403)*8];
      for (const [sx, sy] of [s1, s2]) {
        line(sx, sy + 8, sx, sy - 5, '#8a6a40', 1.1);
        poly([[sx, sy - 5], [sx + 4, sy - 3.8], [sx, sy - 2.6]]); ctx.fillStyle = '#ff7020'; ctx.fill();
      }
      ctx.lineWidth = 0.9*k;
      const tape = () => { ctx.beginPath(); ctx.moveTo(X(s1[0]), Y(s1[1] - 1)); ctx.quadraticCurveTo(X((s1[0] + s2[0])/2), Y((s1[1] + s2[1])/2 + 7), X(s2[0]), Y(s2[1] - 1)); ctx.stroke(); };
      ctx.strokeStyle = '#1a1a14'; tape();
      ctx.setLineDash([2.5*k, 2.5*k]); ctx.strokeStyle = '#f0c820'; tape(); ctx.setLineDash([]);
      const gx = s2[0] - 1, gy = s2[1] + 12;                            // sign on its own post
      line(gx, gy + 8, gx, gy, '#6a6a66', 1);
      poly([[gx - 5, gy - 8], [gx + 5, gy - 8], [gx + 5, gy + 1], [gx - 5, gy + 1]]); ctx.fillStyle = '#e8c020'; ctx.fill();
      ctx.strokeStyle = '#1a1a14'; ctx.lineWidth = 0.5*k; ctx.stroke();
      ctx.fillStyle = '#1a1a14';
      for (let b = 0; b < 3; b++) {
        const a0 = -Math.PI/2 + b*2.094;
        ctx.beginPath(); ctx.moveTo(X(gx), Y(gy - 3.5));
        ctx.arc(X(gx), Y(gy - 3.5), 3.6*k, a0 - 0.5, a0 + 0.5); ctx.closePath(); ctx.fill();
      }
      ell(gx, gy - 3.5, 0.9, 0.9); ctx.fillStyle = '#e8c020'; ctx.fill();
    }

    K.elementTile('92', 'U', `rgba(150,255,160,${(0.8 + 0.2*pulse).toFixed(3)})`, 'rgba(6,18,10,0.85)', 'rgba(90,200,110,0.7)');
    ctx.restore();
  }

function renderSulfurDeposit(e, px, py, t) {
    // Sulfur Deposit — a fumarole field. Pale, cracked crust stained orange
    // round the vents; bright yellow sulfur encrusts each vent and grows in
    // needle clusters, the vents breathe steam, and a turquoise hot spring
    // bubbles inside orange mineral terraces. Bleached rocks and dead grass
    // at the edges.
    const K = _depositKit(e, px, py);
    const { k, X, Y, S, blob, poly, ell, line, rock } = K;
    const detail = Camera.zoom > 0.5;
    const phase = e._sulfurPhase ?? S(98)*6.28;
    const pulse = 0.5 + 0.5*Math.sin(t*1.1 + phase);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // ── Crust ──────────────────────────────────────────────────────────
    blob(50, 52, 47, 44, 0.10, 2, 18); ctx.fillStyle = '#4e4a36'; ctx.fill();
    blob(50, 52, 40, 37, 0.13, 32, 16); ctx.fillStyle = '#6a654a'; ctx.fill();
    if (detail) {
      K.tufts('#7a6a3a', 62, 14);
      ctx.strokeStyle = 'rgba(40,34,20,0.45)'; ctx.lineWidth = 0.6*k;       // polygonal crust cracks
      ctx.beginPath();
      for (let c = 0; c < 10 + K.size*3; c++) {
        const x = 18 + S(20 + c)*64, y = 20 + S(40 + c)*62;
        ctx.moveTo(X(x), Y(y)); ctx.lineTo(X(x + (S(60 + c) - 0.5)*14), Y(y + (S(80 + c) - 0.5)*12));
      }
      ctx.stroke();
    }

    // Vent positions, kept clear of the spring
    // Spread on a jittered arc round the upper right so they never pile up.
    const vents = [], nV = 1 + K.size;
    for (let v = 0; v < nV; v++) {
      const a = -1.35 + (nV === 1 ? 1.2 : v / (nV - 1)*2.4) + (S(100 + v) - 0.5)*0.35;
      const d = 22 + S(110 + v)*8;
      vents.push({ x: 52 + Math.cos(a)*d, y: 46 + Math.sin(a)*d*0.85, r: (7 + S(120 + v)*3.5)*(K.size >= 4 ? 0.85 : 1), v });
    }
    for (const vt of vents) {                                             // iron/orange staining
      blob(vt.x, vt.y + 1, vt.r*1.9, vt.r*1.4, 0.2, 130 + vt.v*10, 12); ctx.fillStyle = 'rgba(170,96,30,0.35)'; ctx.fill();
    }

    // ── Hot spring in its terraces ─────────────────────────────────────
    const sX = 26 + S(7)*8, sY = 62 + S(8)*10;
    blob(sX, sY, 19, 12, 0.14, 200, 14); ctx.fillStyle = '#b8742a'; ctx.fill();
    blob(sX, sY - 0.5, 16, 9.8, 0.14, 214, 14); ctx.fillStyle = '#e0b454'; ctx.fill();
    blob(sX, sY - 1, 13, 7.6, 0.16, 228, 14); ctx.fillStyle = '#2f9aa4'; ctx.fill();
    ell(sX - 1, sY - 1.5, 8, 4); ctx.fillStyle = `rgba(170,235,225,${(0.45 + 0.2*pulse).toFixed(3)})`; ctx.fill();
    ell(sX - 3, sY - 3, 3, 1.2); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
    for (let b = 0; b < 3; b++) {
      const ph = (t*0.8 + b/3 + S(9)) % 1;
      ctx.strokeStyle = `rgba(230,255,250,${((1 - ph)*0.7).toFixed(3)})`; ctx.lineWidth = 0.6*k;
      ctx.beginPath(); ctx.ellipse(X(sX - 5 + b*5), Y(sY - 1 + (b % 2)), (0.8 + ph*3)*k, (0.5 + ph*1.5)*k, 0, 0, Math.PI*2); ctx.stroke();
    }

    // ── Bleached rocks ─────────────────────────────────────────────────
    for (let i = 0; i < 2 + K.size; i++) {
      const a = S(300 + i)*Math.PI*2;
      rock(50 + Math.cos(a)*30, 54 + Math.sin(a)*26, 4 + S(310 + i)*3.5, 320 + i*7, '#8a8470', '#b0aa92', 'rgba(0,0,0,0.25)');
    }

    // ── Vents: sulfur crust, needle crystals, dark throat ──────────────
    vents.sort((p, q) => p.y - q.y);
    for (const vt of vents) {
      blob(vt.x, vt.y, vt.r*1.25, vt.r*0.95, 0.25, 400 + vt.v*13, 12); ctx.fillStyle = '#d8b828'; ctx.fill();
      blob(vt.x, vt.y - 0.5, vt.r*0.95, vt.r*0.7, 0.25, 420 + vt.v*13, 12); ctx.fillStyle = '#f4dc40'; ctx.fill();
      for (let n = 0; n < 9; n++) {                                     // needle crystals round the rim
        const a = n/9*Math.PI*2 + S(440 + vt.v*9 + n)*0.4;
        const r0 = vt.r*0.55, len = 3 + S(460 + vt.v*9 + n)*4.5;
        const bx = vt.x + Math.cos(a)*r0, by = vt.y + Math.sin(a)*r0*0.75;
        const dx = Math.cos(a)*0.6, dy = Math.sin(a)*0.45 - 0.8;             // outward and up
        poly([[bx - 0.9, by], [bx + dx*len, by + dy*len], [bx + 0.9, by]]);
        ctx.fillStyle = n % 3 ? '#fff27a' : '#e8c430'; ctx.fill();
      }
      ell(vt.x, vt.y, vt.r*0.42, vt.r*0.26); ctx.fillStyle = '#2a2014'; ctx.fill();
      ell(vt.x, vt.y + vt.r*0.05, vt.r*0.26, vt.r*0.14); ctx.fillStyle = `rgba(255,150,40,${(0.25 + 0.3*pulse).toFixed(3)})`; ctx.fill();   // hot throat
    }

    // Loose yellow crust patches
    for (let p = 0; p < 4 + K.size*2; p++) {
      const x = 20 + S(500 + p)*62, y = 24 + S(520 + p)*58;
      blob(x, y, 2 + S(540 + p)*2.5, 1.5 + S(560 + p)*1.8, 0.3, 580 + p*7, 8);
      ctx.fillStyle = p % 3 ? 'rgba(240,210,60,0.85)' : 'rgba(255,240,120,0.9)'; ctx.fill();
    }

    // ── Steam off the vents and the spring ─────────────────────────────
    const puffs = detail ? 5 : 2;
    const plume = (x, y, scale, speed, seed, tint) => {
      for (let q = 0; q < puffs; q++) {
        const ph = (t*speed + q/puffs + S(seed)) % 1;
        const drift = Math.sin(t*0.7 + q*1.3 + seed)*2 + ph*5;
        ell(x + drift, y - 2 - ph*30*scale, (2 + ph*7)*scale, (1.6 + ph*5.5)*scale);
        ctx.fillStyle = `rgba(${tint},${((1 - ph)*Math.min(1, ph*6)*0.42).toFixed(3)})`; ctx.fill();
      }
    };
    for (const vt of vents) plume(vt.x, vt.y, 0.7 + vt.r*0.04, 0.32 + S(600 + vt.v)*0.1, 610 + vt.v, vt.v % 2 ? '246,242,214' : '250,246,200');
    plume(sX, sY - 2, 0.55, 0.22, 620, '236,248,246');

    // Occasional glint on a crystal
    if (detail) {
      const g = vents[Math.floor(t*0.35) % vents.length];
      if (Math.sin(t*2.6 + phase) > 0.9) {
        line(g.x + g.r*0.6 - 2.5, g.y - g.r*0.6, g.x + g.r*0.6 + 2.5, g.y - g.r*0.6, 'rgba(255,255,230,0.95)', 0.6);
        line(g.x + g.r*0.6, g.y - g.r*0.6 - 2.5, g.x + g.r*0.6, g.y - g.r*0.6 + 2.5, 'rgba(255,255,230,0.95)', 0.6);
      }
    }

    K.elementTile('16', 'S', `rgba(255,230,90,${(0.8 + 0.2*pulse).toFixed(3)})`, 'rgba(24,20,6,0.85)', 'rgba(210,180,50,0.7)');
    ctx.restore();
  }

function renderLithiumDeposit(e, px, py, t) {
    // Lithium Deposit — a salar. A pale salt crust cracked into polygons,
    // a chain of turquoise brine pans, each a different shade as it
    // evaporates, ringed in white salt; and a pegmatite outcrop on the far
    // side where pale spodumene prisms and lilac lepidolite break the rock.
    // Light rolls slowly across the brine, salt crystals twinkle and the
    // crystals catch the sun now and then.
    const K = _depositKit(e, px, py);
    const { k, X, Y, S, blob, poly, ell, line, rock } = K;
    const detail = Camera.zoom > 0.5;
    const phase = e._lithiumPhase ?? S(97)*6.28;
    const pulse = 0.5 + 0.5*Math.sin(t*0.9 + phase);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // ── Salt crust ─────────────────────────────────────────────────────
    blob(50, 52, 47, 44, 0.10, 3, 18); ctx.fillStyle = '#8a877a'; ctx.fill();
    blob(50, 52, 41, 38, 0.12, 34, 16); ctx.fillStyle = '#d6d2c4'; ctx.fill();
    if (detail) {
      K.tufts('#9a9068', 64, 14);
      ctx.save();
      blob(50, 52, 41, 38, 0.12, 34, 16); ctx.clip();
      ctx.strokeStyle = 'rgba(130,120,100,0.40)'; ctx.lineWidth = 0.55*k;    // polygonal salt cracks
      ctx.beginPath();
      const cell = 11;
      for (let gy = 0; gy < 11; gy++) for (let gx = 0; gx < 11; gx++) {
        const cx = gx*cell + (gy % 2)*cell*0.5 + (S(700 + gx*13 + gy)*4 - 2);
        const cy = gy*cell*0.87 + (S(800 + gx + gy*17)*4 - 2);
        for (let s = 0; s < 3; s++) {                                       // three spokes make a hex net
          const a = s*2.094 + Math.PI/6;
          ctx.moveTo(X(cx), Y(cy)); ctx.lineTo(X(cx + Math.cos(a)*cell*0.58), Y(cy + Math.sin(a)*cell*0.58));
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    // ── Brine pans, evaporating at different stages ────────────────────
    const SHADES = [['#1f8f9a', '#4fc0c0'], ['#3aa8a0', '#7ed6c4'], ['#7cc8b4', '#b8ead8'], ['#2a7fae', '#5fb2d6']];
    const pans = [], nP = 1 + K.size;
    for (let i = 0; i < nP; i++) {
      // Spread on a wide arc round the lower left, shrinking as a bigger
      // deposit fits more of them in, so neighbours only just touch.
      const a = 1.25 + (nP === 1 ? 1.4 : i/(nP - 1)*2.9) + (S(900 + i) - 0.5)*0.15;
      const d = 23 + S(910 + i)*5;
      pans.push({ x: 50 + Math.cos(a)*d, y: 54 + Math.sin(a)*d*0.8, rx: 11 - K.size*1.1 + S(920 + i)*2, ry: 6.5 - K.size*0.4 + S(930 + i)*1.5, i });
    }
    for (const p of pans) {
      const [deep, lite] = SHADES[(p.i + Math.floor(S(940)*4)) % SHADES.length];
      blob(p.x, p.y + 0.8, p.rx + 2.6, p.ry + 2.2, 0.16, 950 + p.i*11, 12); ctx.fillStyle = 'rgba(90,84,70,0.35)'; ctx.fill();   // damp margin
      blob(p.x, p.y, p.rx + 1.8, p.ry + 1.5, 0.16, 950 + p.i*11, 12); ctx.fillStyle = '#f4f2ea'; ctx.fill();                  // salt rim
      blob(p.x, p.y, p.rx, p.ry, 0.16, 970 + p.i*11, 12); ctx.fillStyle = deep; ctx.fill();
      ell(p.x - p.rx*0.15, p.y - p.ry*0.2, p.rx*0.62, p.ry*0.5); ctx.fillStyle = lite; ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
      // A band of light drifting across the surface
      ctx.save();
      blob(p.x, p.y, p.rx, p.ry, 0.16, 970 + p.i*11, 12); ctx.clip();
      const sweep = ((t*0.06 + S(980 + p.i)) % 1)*(p.rx*2 + 12) - p.rx - 6;
      poly([[p.x + sweep - 3, p.y - p.ry], [p.x + sweep + 1, p.y - p.ry], [p.x + sweep - 2, p.y + p.ry], [p.x + sweep - 6, p.y + p.ry]]);
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
      ctx.restore();
      if (detail) {                                                         // wind ripple rings
        const ph = (t*0.35 + S(990 + p.i)) % 1;
        ctx.strokeStyle = `rgba(230,255,250,${((1 - ph)*0.5).toFixed(3)})`; ctx.lineWidth = 0.5*k;
        ctx.beginPath(); ctx.ellipse(X(p.x + p.rx*0.2), Y(p.y + p.ry*0.1), (1 + ph*5)*k, (0.6 + ph*2.2)*k, 0, 0, Math.PI*2); ctx.stroke();
      }
    }

    // ── Pegmatite outcrop with spodumene and lepidolite ────────────────
    const oX = 66 + S(11)*6, oY = 36 + S(12)*6;
    const boulders = [];
    for (let i = 0; i < 3 + K.size; i++) {
      const a = S(1000 + i)*Math.PI*2, d = Math.sqrt(S(1010 + i))*12;
      boulders.push({ x: oX + Math.cos(a)*d, y: oY + Math.sin(a)*d*0.7, r: 5 + S(1020 + i)*4.5, i });
    }
    boulders.sort((p, q) => p.y - q.y);
    for (const b of boulders) {
      rock(b.x, b.y, b.r, 1030 + b.i*9, '#6e6878', b.i % 2 ? '#a89cb8' : '#9a98a4', 'rgba(40,36,30,0.35)');
      if (detail && b.i % 2 === 0) {                                        // lilac mica flecks
        for (let f = 0; f < 3; f++) {
          ell(b.x + (S(1040 + b.i*3 + f) - 0.5)*b.r*1.1, b.y - b.r*0.15 + (S(1050 + b.i*3 + f) - 0.5)*b.r*0.6, 0.9, 0.55);
          ctx.fillStyle = 'rgba(215,170,225,0.9)'; ctx.fill();
        }
      }
    }
    // Spodumene prisms fanning up out of the outcrop
    const prisms = 4 + K.size;
    for (let p = 0; p < prisms; p++) {
      const bx = oX + (p - (prisms - 1)/2)*3.2 + (S(1100 + p) - 0.5)*2, by = oY + 2 + S(1110 + p)*3;
      const ang = -Math.PI/2 + (p - (prisms - 1)/2)*0.2 + (S(1120 + p) - 0.5)*0.25;
      const len = 8 + S(1130 + p)*8, wd = 1.5 + S(1140 + p)*0.7;
      const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
      const tip = [bx + dx*len, by + dy*len];
      const kunzite = S(1150 + p) < 0.3;
      const flick = 0.6 + 0.4*Math.sin(t*1.6 + p*1.9 + phase);
      poly([[bx + nx*wd, by + ny*wd], [bx + nx*wd + dx*len*0.82, by + ny*wd + dy*len*0.82], tip, [bx - nx*wd + dx*len*0.82, by - ny*wd + dy*len*0.82], [bx - nx*wd, by - ny*wd]]);
      ctx.fillStyle = kunzite ? '#c890c8' : '#c4d4cc'; ctx.fill();
      poly([[bx, by], [bx + dx*len*0.82, by + dy*len*0.82], tip, [bx - nx*wd + dx*len*0.82, by - ny*wd + dy*len*0.82], [bx - nx*wd, by - ny*wd]]);
      ctx.fillStyle = kunzite ? `rgba(245,205,245,${(0.75 + 0.2*flick).toFixed(3)})` : `rgba(240,250,246,${(0.8 + 0.2*flick).toFixed(3)})`; ctx.fill();
      if (detail) line(bx + dx*len*0.15, by + dy*len*0.15, bx + dx*len*0.7, by + dy*len*0.7, 'rgba(120,140,140,0.35)', 0.3);   // cleavage line
    }
    if (detail) {                                                           // cool glow off the crystals
      const g = ctx.createRadialGradient(X(oX), Y(oY - 6), 0, X(oX), Y(oY - 6), 20*k);
      g.addColorStop(0, `rgba(210,240,255,${(0.14 + 0.12*pulse).toFixed(3)})`); g.addColorStop(1, 'rgba(210,240,255,0)');
      ctx.fillStyle = g; ell(oX, oY - 6, 20, 16); ctx.fill();
    }
    if (Math.sin(t*1.9 + phase) > 0.9) {                                    // glint on a prism tip
      const gx = oX + (S(1160) - 0.5)*8, gy = oY - 12 - S(1161)*4;
      line(gx - 3, gy, gx + 3, gy, 'rgba(255,255,255,0.95)', 0.6);
      line(gx, gy - 3, gx, gy + 3, 'rgba(255,255,255,0.95)', 0.6);
    }

    // ── Salt crystal crusts and twinkles ───────────────────────────────
    for (let c = 0; c < 6 + K.size*3; c++) {
      const x = 16 + S(1200 + c)*68, y = 20 + S(1210 + c)*64;
      if (Math.hypot(x - oX, (y - oY)*1.3) < 16) continue;                   // keep off the outcrop
      const sz = 1.2 + S(1220 + c)*1.6;
      poly([[x - sz, y], [x, y - sz*0.8], [x + sz, y], [x, y + sz*0.8]]); ctx.fillStyle = '#fbfaf4'; ctx.fill();
      poly([[x, y - sz*0.8], [x + sz, y], [x, y + sz*0.8]]); ctx.fillStyle = 'rgba(160,170,180,0.35)'; ctx.fill();
    }
    if (detail) for (let m = 0; m < 5 + K.size*2; m++) {
      const tw = Math.sin(t*2.4 + S(1300 + m)*20);
      if (tw < 0.6) continue;
      const x = 18 + S(1310 + m)*64, y = 22 + S(1320 + m)*60, a = ((tw - 0.6)*2.5).toFixed(3);
      line(x - 1.6, y, x + 1.6, y, `rgba(255,255,255,${a})`, 0.45);
      line(x, y - 1.6, x, y + 1.6, `rgba(255,255,255,${a})`, 0.45);
    }

    // ── Survey stakes along the pans ───────────────────────────────────
    if (detail) {
      for (const [sx, sy] of [[12 + S(1400)*6, 44 + S(1401)*8], [44 + S(1402)*8, 86 + S(1403)*4]]) {
        line(sx, sy + 7, sx, sy - 5, '#8a6a40', 1.0);
        poly([[sx, sy - 5], [sx + 4, sy - 3.9], [sx, sy - 2.8]]); ctx.fillStyle = '#3a8ad8'; ctx.fill();
      }
    }

    K.elementTile('3', 'Li', `rgba(215,240,255,${(0.8 + 0.2*pulse).toFixed(3)})`, 'rgba(8,16,24,0.85)', 'rgba(140,200,230,0.7)');
    ctx.restore();
  }

function renderPumpJack(e, px, py, t) {
    // Pump Jack — a 3×3 beam pump ("nodding donkey") over its oil deposit.
    // A steel A-frame samson post carries a safety-yellow walking beam; the
    // horsehead on its front end lifts the bridle cables and polished rod in
    // and out of the wellhead, while the tail end is driven by a pitman arm
    // off a red crank and counterweights turning on the gearbox, belted from
    // an electric motor behind a safety rail. The wellhead's flowline runs
    // down to the OUT stub at bottom-centre, and a control panel shows the
    // running light and the reservoir pressure gauge.
    //
    // The crank keeps its own phase on the entity, so it only turns while
    // the pump actually runs (powered, not depleted) and stops mid-stroke
    // when the power goes; it runs at one steady speed, matching the steady pump rate. The oil
    // stain round the wellhead spreads as the deposit is worked out.
    // Authored in a 120-unit square scaled by `u`.
    const w = (e.width || 3) * TILE, h = (e.height || 3) * TILE;
    const u = Math.min(w, h) / 120;
    const X = (v) => px + v*u, Y = (v) => py + v*u;
    const on = e.powered;
    const pressure = e._pressure !== undefined ? e._pressure : 1.0;
    const depleted = pressure <= 0;
    const running = on && !depleted;
    const detail = Camera.zoom > 0.5;
    const dark = DayNight.darkness();
    const R  = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), ww*u, hh*u); };
    const RR = (x, y, ww, hh, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(X(x), Y(y), ww*u, hh*u, r*u); ctx.fill(); };
    const dot = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(x), Y(y), r*u, 0, Math.PI*2); ctx.fill(); };
    const ln = (x1, y1, x2, y2, c, lw) => { ctx.strokeStyle = c; ctx.lineWidth = lw*u; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
    // OUT stub x in sprite units — the centre of the port tile the pipe
    // network uses (col + floor(width/2)), so a jack on a wide deposit
    // still meets the pipe (see the pump-jack rule in render_mining_conveyor).
    const SX = (Math.floor((e.width || 3) / 2) + 0.5) * TILE / u;
    const SY = h / u;                                 // bottom edge of the footprint

    // Crank phase, advanced only while running
    if (e._pjLastT === undefined) { e._pjLastT = t; e._pjPhase = 0; }
    const dt = Math.max(0, Math.min(0.1, t - e._pjLastT));
    e._pjLastT = t;
    if (running) e._pjPhase += dt * 1.6;
    const th = e._pjPhase;
    const beamA = 0.2 * Math.sin(th);

    const STEEL = on ? '#4c535c' : '#3e434a', STEEL_HI = on ? '#6a737e' : '#565c64';
    const YELLOW = on ? '#e0b020' : '#a8872a';

    ctx.save();
    ctx.lineCap = 'round';

    // ── Gravel pad, oil stain, concrete base ─────────────────────────
    RR(4, 86, 112, 30, 8, '#6e6658');
    if (detail) {
      ctx.fillStyle = 'rgba(40,36,30,0.35)';
      for (let k = 0; k < 18; k++) { const gx = 8 + ((k*37) % 104), gy = 90 + ((k*53) % 22); ctx.fillRect(X(gx), Y(gy), 1.2*u, 1*u); }
    }
    {
      const spread = 12 + (1 - pressure) * 16;
      const sg = ctx.createRadialGradient(X(24), Y(104), 0, X(24), Y(104), spread*u);
      sg.addColorStop(0, 'rgba(18,14,10,0.75)'); sg.addColorStop(0.6, 'rgba(40,50,46,0.45)'); sg.addColorStop(1, 'rgba(40,50,46,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(X(24), Y(104), spread*u, spread*0.45*u, 0, 0, Math.PI*2); ctx.fill();
      if (detail && running) {                       // iridescent sheen on the slick
        ctx.fillStyle = `rgba(160,120,200,${0.12 + 0.06*Math.sin(t*1.3)})`;
        ctx.beginPath(); ctx.ellipse(X(20), Y(102), 5*u, 1.6*u, 0.2, 0, Math.PI*2); ctx.fill();
      }
    }
    R(40, 96, 74, 8, '#aaa498'); R(40, 102.5, 74, 1.5, '#8a857a');

    // ── Flowline: wellhead tee → down → OUT stub ─────────────────────
    const flow = on && e._pipeConnected;
    const pipeC = flow ? '#6a5020' : '#4a4640';
    ln(30, 73, 36, 73, pipeC, 3.2); ln(36, 73, 36, 109, pipeC, 3.2); ln(36, 109, SX, 109, pipeC, 3.2); ln(SX, 109, SX, SY - 2, pipeC, 3.2);
    if (flow && running && detail) {
      ctx.save(); ctx.setLineDash([2*u, 3.5*u]); ctx.lineDashOffset = -t*14*u;
      ctx.strokeStyle = '#d8a030'; ctx.lineWidth = 1.2*u; ctx.beginPath();
      ctx.moveTo(X(30), Y(73)); ctx.lineTo(X(36), Y(73)); ctx.lineTo(X(36), Y(109)); ctx.lineTo(X(SX), Y(109)); ctx.lineTo(X(SX), Y(SY - 2)); ctx.stroke();
      ctx.restore();
    }

    // ── Wellhead (Christmas tree) ────────────────────────────────────
    R(15, 84, 14, 12, '#5a5e62');                    // casing head
    R(13, 82, 18, 3, '#6a6e72');
    R(17, 74, 10, 9, '#8a2a22');                     // master valve
    R(12, 70, 20, 5, '#6a6e72');                     // flow tee
    R(18, 64, 8, 6, '#5a5e62');                      // stuffing box
    for (const vx of [12, 32]) {
      ctx.strokeStyle = '#c83a2e'; ctx.lineWidth = 1.2*u;
      ctx.beginPath(); ctx.arc(X(vx), Y(72.5), 3.2*u, 0, Math.PI*2); ctx.stroke();
      ln(vx - 3.2, 72.5, vx + 3.2, 72.5, '#c83a2e', 0.7);
    }
    ctx.strokeStyle = '#c83a2e'; ctx.lineWidth = 1.2*u;
    ctx.beginPath(); ctx.arc(X(22), Y(78.5), 3*u, 0, Math.PI*2); ctx.stroke();

    // ── Samson post (A-frame) ────────────────────────────────────────
    const PV = { x: 59, y: 34 };
    ln(47, 98, PV.x - 1.5, PV.y + 3, STEEL, 3.4);
    ln(71, 98, PV.x + 1.5, PV.y + 3, STEEL, 3.4);
    ln(48, 98, PV.x - 0.5, PV.y + 3, STEEL_HI, 0.8);
    if (detail) {
      for (const f of [0.3, 0.6]) {
        const ly = 98 + (PV.y + 3 - 98) * f;
        const lx0 = 47 + (PV.x - 1.5 - 47) * f, lx1 = 71 + (PV.x + 1.5 - 71) * f;
        ln(lx0, ly, lx1, ly, STEEL, 1.6);
      }
      ln(49, 92, 68, 66, STEEL, 1); ln(69, 92, 50, 66, STEEL, 1);
      for (let y = 90; y > 44; y -= 6) ln(62.5 + (98 - y)*0.03, y, 66 + (98 - y)*0.03 - (98 - y)*0.12, y, STEEL_HI, 0.6);   // ladder rungs
    }
    RR(44, 96, 8, 3, 1, '#5a5e62'); RR(67, 96, 8, 3, 1, '#5a5e62');

    // ── Gearbox, cranks and counterweights ───────────────────────────
    const G = { x: 92, y: 78 };
    const cs = Math.cos(th), sn = Math.sin(th);
    // counterweight (opposite the crank pin)
    ctx.save();
    ctx.translate(X(G.x), Y(G.y)); ctx.rotate(th + Math.PI);
    ctx.fillStyle = on ? '#b8302a' : '#7a2a24';
    ctx.beginPath(); ctx.moveTo(0, -3*u); ctx.lineTo(13*u, -7*u); ctx.arc(0, 0, 14*u, -0.52, 0.52); ctx.lineTo(0, 3*u); ctx.closePath(); ctx.fill();
    ctx.restore();
    RR(84, 70, 16, 16, 3, '#3a3e44');                // gearbox housing
    R(86, 72, 12, 2, 'rgba(255,255,255,0.12)');
    // crank arm
    const CP = { x: G.x + 10*cs, y: G.y + 10*sn };
    ln(G.x, G.y, CP.x, CP.y, on ? '#c8342c' : '#8a3028', 3.6);
    dot(G.x, G.y, 2.2, '#8a8e92');
    dot(CP.x, CP.y, 1.8, '#d8dcde');

    // ── Walking beam, horsehead, equalizer ───────────────────────────
    const rot = (dx, dy) => ({ x: PV.x + dx*Math.cos(beamA) - dy*Math.sin(beamA), y: PV.y + dx*Math.sin(beamA) + dy*Math.cos(beamA) });
    const TP = rot(33, 3);                            // equalizer / pitman pin
    // pitman arm from crank pin up to the equalizer
    ln(CP.x, CP.y, TP.x, TP.y, '#6a7078', 2.2);
    ln(CP.x + 0.8, CP.y, TP.x + 0.8, TP.y, 'rgba(255,255,255,0.18)', 0.6);
    ctx.save();
    ctx.translate(X(PV.x), Y(PV.y)); ctx.rotate(beamA);
    // beam shadow + body
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(-38*u, -2*u, 74*u, 8*u);
    ctx.fillStyle = YELLOW; ctx.fillRect(-38*u, -4*u, 74*u, 7*u);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-38*u, 1.8*u, 74*u, 1.2*u);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(-36*u, -3.5*u, 70*u, 1*u);
    // equalizer bar at the tail
    ctx.fillStyle = STEEL; ctx.fillRect(30*u, -2*u, 6*u, 7*u);
    // horsehead
    ctx.fillStyle = on ? '#2a2c30' : '#232427';
    ctx.beginPath();
    ctx.moveTo(-36*u, -9*u);
    ctx.quadraticCurveTo(-49*u, -8*u, -50*u, 3*u);
    ctx.quadraticCurveTo(-50*u, 12*u, -44*u, 16*u);
    ctx.lineTo(-38*u, 8*u);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = YELLOW; ctx.lineWidth = 1.2*u;
    ctx.beginPath(); ctx.moveTo(-40*u, -6*u); ctx.quadraticCurveTo(-46*u, -4*u, -46.5*u, 3*u); ctx.stroke();
    // saddle bearing
    ctx.fillStyle = STEEL; ctx.fillRect(-4*u, 2*u, 8*u, 5*u);
    ctx.restore();
    dot(PV.x, PV.y + 4.5, 1.8, '#8a8e92');

    // bridle cables from the horsehead face down to the carrier bar, and the
    // polished rod from the carrier bar into the stuffing box
    const HF = rot(-49, 8);
    const carrierY = HF.y + 12;
    ln(HF.x - 1.2, HF.y, 20.8, carrierY, '#2a2a2c', 0.7);
    ln(HF.x + 1.2, HF.y, 23.2, carrierY, '#2a2a2c', 0.7);
    R(18.5, carrierY - 0.8, 7, 1.6, '#3a3e44');
    ln(22, carrierY, 22, 64, running ? '#e8ecee' : '#b8bcc0', 1.4);
    if (running && detail) ln(22.5, carrierY + 1, 22.5, 63, 'rgba(255,255,255,0.5)', 0.4);

    // ── Motor, belt guard, safety rail ───────────────────────────────
    RR(100, 83, 14, 12, 2, on ? '#2e5a8a' : '#2a4058');
    if (detail) for (let k = 0; k < 4; k++) R(101.5, 85 + k*2.6, 11, 0.7, 'rgba(0,0,0,0.3)');
    dot(104, 89, 1.8, '#8a8e92');
    // belt guard from motor pulley to gearbox sheave
    ctx.fillStyle = YELLOW;
    ctx.beginPath(); ctx.moveTo(X(98), Y(74)); ctx.lineTo(X(104), Y(86)); ctx.lineTo(X(107), Y(84)); ctx.lineTo(X(101), Y(71)); ctx.closePath(); ctx.fill();
    if (detail) {                                   // low guard rail in front of the crank
      ctx.strokeStyle = YELLOW; ctx.lineWidth = 0.9*u; ctx.beginPath();
      for (const gx of [78, 90]) { ctx.moveTo(X(gx), Y(98)); ctx.lineTo(X(gx), Y(90)); }
      ctx.moveTo(X(78), Y(91)); ctx.lineTo(X(90), Y(91));
      ctx.moveTo(X(78), Y(95)); ctx.lineTo(X(90), Y(95));
      ctx.stroke();
    }

    // ── Control panel: running light and pressure gauge ──────────────
    RR(94, 100, 22, 14, 1.5, '#8a9094');
    R(95.5, 101.5, 19, 11, '#6a7074');
    const ledC = !on ? '#6a5020' : depleted ? (Math.sin(t*5) > 0 ? '#ff3020' : '#6a1810') : '#50e050';
    if (on && dark > 0.3 && detail) { ctx.fillStyle = depleted ? 'rgba(255,60,40,0.3)' : 'rgba(80,230,80,0.3)'; ctx.beginPath(); ctx.arc(X(99), Y(104.5), 5*u, 0, Math.PI*2); ctx.fill(); }
    dot(99, 104.5, 1.6, ledC);
    dot(109, 107, 4.4, '#f2f0e8');
    ctx.strokeStyle = 'rgba(40,40,40,0.6)'; ctx.lineWidth = 0.4*u;
    for (let i = 0; i <= 6; i++) {
      const a = -Math.PI*0.85 + i*(Math.PI*1.7/6);
      ctx.beginPath(); ctx.moveTo(X(109 + Math.cos(a)*3), Y(107 + Math.sin(a)*3)); ctx.lineTo(X(109 + Math.cos(a)*4), Y(107 + Math.sin(a)*4)); ctx.stroke();
    }
    const needleA = -Math.PI*0.85 + pressure * Math.PI*1.7;
    ln(109, 107, 109 + Math.cos(needleA)*3.4, 107 + Math.sin(needleA)*3.4, pressure > 0.5 ? '#2a8a2a' : pressure > 0.2 ? '#c08a10' : '#c82a20', 0.8);

    // ── OUT stub at bottom-centre, reaching into the tile below ──────
    {
      const connected = e._pipeConnected;
      RR(SX - 4, SY - 4, 8, 10, 1, connected ? '#6a5020' : '#4a4640');
      RR(SX - 6, SY - 5, 12, 2.5, 0.8, connected ? '#8a6a30' : '#5e5a54');
      RR(SX - 6, SY + 4, 12, 2.5, 0.8, connected ? '#8a6a30' : '#5e5a54');
      ctx.font = `bold ${Math.max(4, Math.round(5*u))}px Arial, sans-serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = connected ? 'rgba(220,170,60,0.95)' : 'rgba(120,100,70,0.8)';
      ctx.fillText('OUT', X(SX + 8), Y(SY + 0.5));
    }

    // ── Reservoir pressure tag ───────────────────────────────────────
    {
      const label = depleted ? 'DEPLETED' : `${Math.round(pressure*100)}%`;
      ctx.font = `bold ${Math.max(5, Math.round(6.5*u))}px Arial, sans-serif`;
      const tw = ctx.measureText(label).width / u + 6;
      RR(3, 3, tw, 10, 2, depleted ? 'rgba(120,20,16,0.85)' : 'rgba(20,24,20,0.7)');
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = depleted ? '#ffb0a0' : pressure > 0.5 ? '#a8e080' : pressure > 0.2 ? '#e8c050' : '#ff8060';
      ctx.fillText(label, X(6), Y(8.3));
    }

    // (No footprint-wide overlay for unpowered or depleted: the machinery's
    // own colours, the stopped crank, the status light and the tag carry it.)

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

function renderPumpJackMK2(e, px, py, t) {
    // Pump Jack MK2 — a 4×4 heavy beam pump centred over its deposit. Same
    // anatomy as the MK1 (renderPumpJack) scaled up and re-kitted: a graphite
    // twin-braced samson post, a gunmetal walking beam with a cyan stripe and
    // an LED-edged horsehead, twin counterweights on a heavier gearbox, and a
    // variable-frequency drive cabinet whose screen shows the stroke rate and
    // reservoir pressure. Associated gas is burned off at a flare stack while
    // it pumps, and a floodlight mast lights the pad after dark.
    //
    // The crank strokes 30% faster than the MK1's, matching its pump rate,
    // and like the MK1 keeps its own phase so it stops mid-stroke unpowered.
    // Authored in a 160-unit square scaled by `u`.
    const w = (e.width || 4) * TILE, h = (e.height || 4) * TILE;
    const u = Math.min(w, h) / 160;
    const X = (v) => px + v*u, Y = (v) => py + v*u;
    const on = e.powered;
    const pressure = e._pressure !== undefined ? e._pressure : 1.0;
    const depleted = pressure <= 0;
    const running = on && !depleted;
    const detail = Camera.zoom > 0.45;
    const dark = DayNight.darkness();
    const R  = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), ww*u, hh*u); };
    const RR = (x, y, ww, hh, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(X(x), Y(y), ww*u, hh*u, r*u); ctx.fill(); };
    const dot = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(x), Y(y), r*u, 0, Math.PI*2); ctx.fill(); };
    const ln = (x1, y1, x2, y2, c, lw) => { ctx.strokeStyle = c; ctx.lineWidth = lw*u; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
    const glow = (x, y, r, rgba) => {
      const g = ctx.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r*u);
      g.addColorStop(0, rgba); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(X(x - r), Y(y - r), 2*r*u, 2*r*u);
    };

    if (e._pjLastT === undefined) { e._pjLastT = t; e._pjPhase = 0; }
    const dt = Math.max(0, Math.min(0.1, t - e._pjLastT));
    e._pjLastT = t;
    if (running) e._pjPhase += dt * 1.6 * (OilSystem.PUMPJACK2_RATE_MULT || 1.3);
    const th = e._pjPhase;
    const beamA = 0.2 * Math.sin(th);

    const FRAME  = on ? '#34383e' : '#2c2f34', FRAME_HI = on ? '#5a616a' : '#474c52';
    const BEAM   = on ? '#5a6068' : '#4a4e54';
    const CYAN   = on ? '#40c8e0' : '#2e7482';
    const CWT    = on ? '#1e2226' : '#1a1c1f';

    ctx.save();
    ctx.lineCap = 'round';

    // ── Concrete pad with a hazard-striped kerb, oil stain ───────────
    RR(4, 110, 152, 46, 6, '#8a877e');
    if (detail) {
      ctx.save();
      ctx.beginPath(); ctx.roundRect(X(4), Y(110), 152*u, 46*u, 6*u); ctx.clip();
      ctx.fillStyle = '#d8b020'; ctx.fillRect(X(4), Y(110), 152*u, 3*u);
      ctx.fillStyle = '#1e1e20';
      for (let x = 0; x < 160; x += 8) { ctx.beginPath(); ctx.moveTo(X(x), Y(113)); ctx.lineTo(X(x + 4), Y(110)); ctx.lineTo(X(x + 7), Y(110)); ctx.lineTo(X(x + 3), Y(113)); ctx.fill(); }
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.5*u;       // slab joints
      for (const jx of [56, 104]) { ctx.beginPath(); ctx.moveTo(X(jx), Y(113)); ctx.lineTo(X(jx), Y(156)); ctx.stroke(); }
      ctx.restore();
    }
    {
      const spread = 14 + (1 - pressure) * 18;
      const sg = ctx.createRadialGradient(X(34), Y(140), 0, X(34), Y(140), spread*u);
      sg.addColorStop(0, 'rgba(18,14,10,0.7)'); sg.addColorStop(0.6, 'rgba(40,50,46,0.4)'); sg.addColorStop(1, 'rgba(40,50,46,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(X(34), Y(140), spread*u, spread*0.42*u, 0, 0, Math.PI*2); ctx.fill();
    }
    R(56, 128, 100, 9, '#b4b0a6'); R(56, 135, 100, 2, '#8e8a80');          // machinery plinth

    // ── Floodlight mast (behind everything) ──────────────────────────
    const lampOn = on && dark > 0.25;
    ln(150, 128, 150, 22, '#5a5e62', 2);
    if (detail) for (let y = 120; y > 28; y -= 10) ln(148.4, y, 151.6, y - 5, '#6a6e72', 0.5);
    RR(141, 17, 13, 6, 1.5, '#3a3e44');
    R(142.5, 21.5, 10, 1.5, lampOn ? '#fff4d0' : '#6a6e72');
    if (lampOn) {
      ctx.fillStyle = `rgba(255,240,200,${(0.10 * Math.min(1, dark * 1.6)).toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(X(142), Y(23)); ctx.lineTo(X(153), Y(23)); ctx.lineTo(X(118), Y(150)); ctx.lineTo(X(40), Y(150)); ctx.closePath(); ctx.fill();
      glow(147.5, 22, 10, 'rgba(255,240,200,0.5)');
    }

    // ── Flare stack: burns associated gas while pumping ──────────────
    R(7, 62, 5, 66, '#6a6e72'); R(7, 62, 1.5, 66, 'rgba(255,255,255,0.15)');
    R(5, 58, 9, 5, '#4a4e54');
    RR(4, 124, 11, 6, 1, '#5a5e62');
    if (detail) for (const gy of [80, 100]) ln(12, gy, 20, gy + 16, '#5a5e62', 0.6);   // guy wires
    if (running) {
      const fl = 1 + 0.25*Math.sin(t*11) + 0.15*Math.sin(t*23 + 1);
      glow(9.5, 50, 14, `rgba(255,150,40,${(0.35 + 0.25*dark).toFixed(3)})`);
      ctx.fillStyle = '#ff8a20';
      ctx.beginPath(); ctx.moveTo(X(6), Y(58)); ctx.quadraticCurveTo(X(4), Y(50 - 3*fl), X(9.5 + Math.sin(t*7)*1.5), Y(58 - 14*fl)); ctx.quadraticCurveTo(X(15), Y(50 - 3*fl), X(13), Y(58)); ctx.fill();
      ctx.fillStyle = '#ffe070';
      ctx.beginPath(); ctx.moveTo(X(8), Y(58)); ctx.quadraticCurveTo(X(7.5), Y(53), X(9.5), Y(58 - 7*fl)); ctx.quadraticCurveTo(X(11.5), Y(53), X(11), Y(58)); ctx.fill();
    } else {
      dot(9.5, 57, 1, on ? '#4a7ad8' : '#3a3e44');                    // pilot
    }

    // ── Flowline: wellhead tee → down → OUT stub ─────────────────────
    const flow = on && e._pipeConnected;
    const pipeC = flow ? '#6a5020' : '#4a4640';
    ln(44, 98, 50, 98, pipeC, 4); ln(50, 98, 50, 148, pipeC, 4); ln(50, 148, 100, 148, pipeC, 4); ln(100, 148, 100, 158, pipeC, 4);
    if (detail) for (const [cx, cy] of [[50, 118], [74, 148]]) R(cx - 3, cy - 1, 6, 2, '#5a5e62');   // flanges
    if (flow && running && detail) {
      ctx.save(); ctx.setLineDash([2.5*u, 4*u]); ctx.lineDashOffset = -t*18*u;
      ctx.strokeStyle = '#d8a030'; ctx.lineWidth = 1.5*u; ctx.beginPath();
      ctx.moveTo(X(44), Y(98)); ctx.lineTo(X(50), Y(98)); ctx.lineTo(X(50), Y(148)); ctx.lineTo(X(100), Y(148)); ctx.lineTo(X(100), Y(158)); ctx.stroke();
      ctx.restore();
    }

    // ── Wellhead (Christmas tree) ────────────────────────────────────
    R(21, 114, 18, 16, '#5a5e62');
    R(18, 111, 24, 4, '#6a6e72');
    R(24, 100, 12, 11, '#1e5a7a');                   // master valve (MK2 blue)
    R(17, 94, 26, 6, '#6a6e72');                     // flow tee
    R(25, 86, 10, 8, '#5a5e62');                     // stuffing box
    for (const vx of [17, 43]) {
      ctx.strokeStyle = CYAN; ctx.lineWidth = 1.4*u;
      ctx.beginPath(); ctx.arc(X(vx), Y(97), 3.8*u, 0, Math.PI*2); ctx.stroke();
      ln(vx - 3.8, 97, vx + 3.8, 97, CYAN, 0.8);
    }
    ctx.strokeStyle = CYAN; ctx.lineWidth = 1.4*u;
    ctx.beginPath(); ctx.arc(X(30), Y(105.5), 3.6*u, 0, Math.PI*2); ctx.stroke();

    // ── Samson post: twin-braced A-frame with a platform ─────────────
    const PV = { x: 80, y: 44 };
    for (const [bx, sgn] of [[62, -1], [98, 1]]) {
      ln(bx, 130, PV.x + sgn*2, PV.y + 4, FRAME, 4.6);
      ln(bx + (sgn < 0 ? 1.2 : -1.2), 130, PV.x + sgn*0.8, PV.y + 4, FRAME_HI, 1);
    }
    if (detail) {
      for (const f of [0.28, 0.55, 0.78]) {
        const ly = 130 + (PV.y + 4 - 130) * f;
        const lx0 = 62 + (PV.x - 2 - 62) * f, lx1 = 98 + (PV.x + 2 - 98) * f;
        ln(lx0, ly, lx1, ly, FRAME, 2);
      }
      ln(64, 124, 92, 86, FRAME, 1.2); ln(96, 124, 68, 86, FRAME, 1.2);
      ln(70, 105, 90, 67, FRAME, 1.0); ln(90, 105, 70, 67, FRAME, 1.0);
      for (let y = 124; y > 56; y -= 7) ln(84.5 + (130 - y)*0.02, y, 89 - (130 - y)*0.1, y, FRAME_HI, 0.7);   // ladder
      // work platform under the saddle, with a rail
      R(70, 55, 20, 2.2, FRAME_HI);
      ln(70, 55, 70, 49, CYAN, 0.8); ln(90, 55, 90, 49, CYAN, 0.8); ln(70, 50, 90, 50, CYAN, 0.8);
    }
    RR(58, 128, 10, 4, 1, '#5a5e62'); RR(92, 128, 10, 4, 1, '#5a5e62');

    // ── Gearbox, cranks and twin counterweights ──────────────────────
    const G = { x: 124, y: 104 };
    const cs = Math.cos(th), sn = Math.sin(th);
    for (const off of [-2.5, 2.5]) {
      ctx.save();
      ctx.translate(X(G.x + off), Y(G.y)); ctx.rotate(th + Math.PI);
      ctx.fillStyle = CWT;
      ctx.beginPath(); ctx.moveTo(0, -4*u); ctx.lineTo(17*u, -9*u); ctx.arc(0, 0, 19*u, -0.52, 0.52); ctx.lineTo(0, 4*u); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = CYAN; ctx.lineWidth = 0.9*u;
      ctx.beginPath(); ctx.arc(0, 0, 18*u, -0.48, 0.48); ctx.stroke();
      ctx.restore();
    }
    RR(113, 93, 22, 22, 4, '#2a2e34');               // gearbox housing
    R(115.5, 95.5, 17, 2.5, 'rgba(255,255,255,0.12)');
    if (detail) for (const [bx, by] of [[116, 111], [132, 111], [116, 97.5], [132, 97.5]]) dot(bx, by, 0.9, '#6a6e72');
    const CP = { x: G.x + 13*cs, y: G.y + 13*sn };
    ln(G.x, G.y, CP.x, CP.y, on ? '#3a3e44' : '#2e3136', 5);
    ln(G.x, G.y, CP.x, CP.y, CYAN, 0.8);
    dot(G.x, G.y, 3, '#8a8e92');
    dot(CP.x, CP.y, 2.3, '#d8dcde');

    // ── Walking beam, horsehead, equalizer ───────────────────────────
    const rot = (dx, dy) => ({ x: PV.x + dx*Math.cos(beamA) - dy*Math.sin(beamA), y: PV.y + dx*Math.sin(beamA) + dy*Math.cos(beamA) });
    const TP = rot(44, 4);
    // twin pitman arms
    for (const o of [-1.4, 1.4]) ln(CP.x + o, CP.y, TP.x + o, TP.y, '#6a7078', 2.2);
    ctx.save();
    ctx.translate(X(PV.x), Y(PV.y)); ctx.rotate(beamA);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-50*u, -2*u, 100*u, 10*u);
    ctx.fillStyle = BEAM; ctx.fillRect(-50*u, -5.5*u, 100*u, 10*u);                // I-beam
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-48*u, -5*u, 96*u, 1.2*u);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-50*u, 3*u, 100*u, 1.5*u);
    ctx.fillStyle = CYAN; ctx.fillRect(-46*u, -1.2*u, 92*u, 1.6*u);                  // accent stripe
    if (detail) {
      ctx.font = `bold ${Math.max(3, 4.6*u)}px Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(10,14,18,0.9)'; ctx.fillRect(12*u, -4.6*u, 14*u, 8*u);
      ctx.fillStyle = CYAN; ctx.fillText('MK2', 19*u, -0.5*u);
    }
    ctx.fillStyle = FRAME; ctx.fillRect(40*u, -3*u, 8*u, 10*u);                      // equalizer
    // horsehead with an LED edge
    ctx.fillStyle = on ? '#1e2024' : '#18191c';
    ctx.beginPath();
    ctx.moveTo(-48*u, -12*u);
    ctx.quadraticCurveTo(-65*u, -11*u, -66*u, 4*u);
    ctx.quadraticCurveTo(-66*u, 16*u, -58*u, 21*u);
    ctx.lineTo(-50*u, 10*u);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = CYAN; ctx.lineWidth = 1.6*u;
    if (on && dark > 0.3) { ctx.shadowColor = '#40c8e0'; ctx.shadowBlur = 8*u; }
    ctx.beginPath(); ctx.moveTo(-52*u, -8.5*u); ctx.quadraticCurveTo(-61*u, -6*u, -61.5*u, 4*u); ctx.quadraticCurveTo(-61.5*u, 12*u, -56.5*u, 16*u); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = FRAME; ctx.fillRect(-5*u, 3*u, 10*u, 6*u);                       // saddle bearing
    ctx.restore();
    dot(PV.x, PV.y + 6, 2.3, '#8a8e92');

    // bridle cables and polished rod into the stuffing box
    const HF = rot(-65, 10);
    const carrierY = HF.y + 14;
    ln(HF.x - 1.5, HF.y, 28.6, carrierY, '#2a2a2c', 0.9);
    ln(HF.x + 1.5, HF.y, 31.4, carrierY, '#2a2a2c', 0.9);
    R(26, carrierY - 1, 8, 2, '#3a3e44');
    ln(30, carrierY, 30, 86, running ? '#e8ecee' : '#b8bcc0', 1.7);
    if (running && detail) ln(30.6, carrierY + 1, 30.6, 85, 'rgba(255,255,255,0.5)', 0.5);

    // ── Electric drive: motor, belt guard ────────────────────────────
    RR(136, 108, 18, 16, 2.5, on ? '#1e4a6a' : '#1c3040');
    if (detail) for (let k = 0; k < 5; k++) R(137.5, 110.5 + k*2.6, 15, 0.8, 'rgba(0,0,0,0.3)');
    dot(141, 116, 2.2, '#8a8e92');
    ctx.fillStyle = CYAN;
    ctx.beginPath(); ctx.moveTo(X(131), Y(97)); ctx.lineTo(X(139), Y(112)); ctx.lineTo(X(143), Y(110)); ctx.lineTo(X(135), Y(94)); ctx.closePath(); ctx.fill();

    // ── VFD cabinet: screen with stroke rate + pressure ──────────────
    RR(104, 138, 48, 18, 2, '#9aa0a4');
    R(106, 140, 44, 14, '#6a7074');
    R(108, 141.5, 26, 11, on ? '#081a20' : '#1a1e20');
    if (on) {
      ctx.font = `bold ${Math.max(3, 4.2*u)}px Courier New, monospace`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = depleted ? '#ff6050' : '#60e8ff';
      const spm = running ? (1.6 * (OilSystem.PUMPJACK2_RATE_MULT || 1.3) * 60 / (2*Math.PI)).toFixed(1) : '0.0';
      ctx.fillText(depleted ? 'DRY' : `${spm}SPM`, X(109), Y(144.5));
      R(109, 148.5, 24, 2.2, 'rgba(96,232,255,0.15)');
      R(109, 148.5, 24 * pressure, 2.2, pressure > 0.5 ? '#50e070' : pressure > 0.2 ? '#e0b030' : '#ff5040');
      if (dark > 0.3) glow(121, 147, 16, 'rgba(96,232,255,0.18)');
    }
    const ledC = !on ? '#6a5020' : depleted ? (Math.sin(t*5) > 0 ? '#ff3020' : '#6a1810') : '#50e050';
    if (on && dark > 0.3 && detail) glow(140, 144, 5, depleted ? 'rgba(255,60,40,0.4)' : 'rgba(80,230,80,0.4)');
    dot(140, 144, 1.8, ledC);
    dot(146, 144, 1.8, on ? '#40c8e0' : '#2a4a52');
    if (detail) { R(137, 149, 12, 1.2, '#3a3e44'); R(137, 151.5, 12, 1.2, '#3a3e44'); }

    // ── OUT stub, reaching into the tile below ───────────────────────
    // Centred on column col+2 (x=100) — the tile the pipe renderer treats as
    // the port (col + floor(width/2)); x=80 sat on the line between two tiles.
    {
      const connected = e._pipeConnected;
      RR(96, 156, 8, 10, 1, connected ? '#6a5020' : '#4a4640');
      RR(94, 155, 12, 2.5, 0.8, connected ? '#8a6a30' : '#5e5a54');
      ctx.font = `bold ${Math.max(4, Math.round(5*u))}px Arial, sans-serif`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = connected ? 'rgba(220,170,60,0.95)' : 'rgba(120,100,70,0.8)';
      ctx.fillText('OUT', X(92), Y(158.5));
    }

    // ── Reservoir pressure tag + tier badge ──────────────────────────
    {
      const label = depleted ? 'DEPLETED' : `${Math.round(pressure*100)}%`;
      ctx.font = `bold ${Math.max(5, Math.round(6.5*u))}px Arial, sans-serif`;
      const tw = ctx.measureText(label).width / u + 6;
      RR(3, 3, tw, 10, 2, depleted ? 'rgba(120,20,16,0.85)' : 'rgba(20,24,20,0.7)');
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = depleted ? '#ffb0a0' : pressure > 0.5 ? '#a8e080' : pressure > 0.2 ? '#e8c050' : '#ff8060';
      ctx.fillText(label, X(6), Y(8.3));
      RR(tw + 5, 3, 17, 10, 2, 'rgba(10,30,38,0.8)');
      ctx.fillStyle = CYAN; ctx.fillText('MK2', X(tw + 7), Y(8.3));
    }

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

// Per-fluid palette for the generalized Liquid Storage Tank — makes the
// currently-held fluid visually apparent at a glance instead of every tank
// always reading as oil. Falls back to 'oil' for legacy saves/empty tanks
// so an unset e._liquidType still renders exactly as it always has.
const LIQUID_PALETTES = {
  oil:   { top: '200,140,30', mid: '160,100,20', bot: '80,50,10',   shimmer: '255,200,80', accent: '#6a5020', gauge: '#c09030', vapor: '#c0a060', label: '180,140,50', stub: '#785020', name: 'OIL' },
  water: { top: '40,190,220', mid: '20,150,190', bot: '8,70,100',   shimmer: '150,240,255', accent: '#20a8c0', gauge: '#20d4c8', vapor: '#80ecff', label: '60,200,220', stub: '#206880', name: 'WATER' },
  acid:  { top: '224,200,50', mid: '184,160,30', bot: '90,74,10',   shimmer: '255,240,140', accent: '#a08018', gauge: '#e0c040', vapor: '#e8d060', label: '224,192,64', stub: '#a08018', name: 'ACID' },
  // Fuel oil matches the pipe droplets (#e8d040 core, #a0c020 glow — render_mining_conveyor.js)
  fuel:  { top: '232,208,64', mid: '196,180,40', bot: '96,100,16',  shimmer: '240,240,140', accent: '#a0a020', gauge: '#e8d040', vapor: '#d8e070', label: '232,208,64',  stub: '#a0a020', name: 'FUEL' },
};

function renderOilStorage(e, px, py, t) {
    // Liquid Storage Tank: a 3/4-view steel tank inside a containment berm,
    // with a liquid-colour band, a floating roof that sinks as the tank
    // drains, a level gauge board, spiral stairs, a roof vent, a hazard sign
    // for the stored liquid and straight stub pipes on one face
    // (OilSystem.tankStubs / resolveTankPorts). R flips both stubs
    // left ↔ right; IN/OUT labels follow whatever is plugged into each stub.
    // Palette from LIQUID_PALETTES[e._liquidType].
    const ports = OilSystem.resolveTankPorts(e);
    const right = ports.right;
    // A 6×6 tank is drawn exactly as the 7×7 one was: laid out on that plot,
    // which adds back the empty top row and the empty column on the far side
    // from the stubs. Nothing but the vapour reaches into either.
    const plot6 = (e.width || 5) === 6;
    const plotCol = plot6 && right ? e.col - 1 : e.col, plotRow = plot6 ? e.row - 1 : e.row;
    px -= (e.col - plotCol) * TILE;
    py -= (e.row - plotRow) * TILE;
    const plotW = plot6 ? 7 : (e.width || 5);
    const w = plotW * TILE;
    const h = (plot6 ? 7 : (e.height || 5)) * TILE;
    const crude   = e._crude || 0;
    const cap     = OilSystem.getTankCapacity();
    const fill    = Math.max(0, Math.min(1, crude / cap));
    const powered = !e._lightningDamaged;   // passive tank — lit whenever it's intact, grid or no grid
    const S = TILE / 40;
    // The shell's own detail (stairs, gauge, sign, rails) is sized to the tank;
    // the nozzles and labels stay at pipe scale so they still meet the pipes.
    const D = S * Math.max(1, plotW / 5);
    const pal = LIQUID_PALETTES[e._liquidType] || LIQUID_PALETTES.oil;
    const liq = e._liquidType;
    ctx.save();

    // Stub Y in local footprint space (row centres of the two port tiles).
    const stubY = (stub) => py + (stub.r - plotRow + 0.5) * TILE;
    const inY = stubY(ports.in), outY = stubY(ports.out);
    // The footprint edge the ports sit on, where the adjacent pipe tile joins.
    const faceX = right ? px + w : px;
    // The shell sits toward whichever face carries the ports, mirrored when R
    // flips them, so both sides get the same short nozzle run. A fixed centre
    // left the left-hand stubs nearly three times longer than the right.
    const cx = px + w*(right ? 0.58 : 0.42), rx = w*0.30, ry = h*0.09;
    const topY = py + h*0.27, botY = py + h*0.80;
    const H = botY - topY;
    const C = (on, off) => powered ? on : off;
    const fine = Camera.zoom > 0.5;         // small detail is skipped when it would be a pixel or less
    // The same tank always weathers the same way.
    const rnd = (i) => { const v = Math.sin(((plotCol || 0)*73 + (plotRow || 0)*151 + i*7.13)*12.9898)*43758.5453; return v - Math.floor(v); };

    // ── Containment bund: a low concrete ring on a gravel pad ──
    const bRx = rx*1.3, bRy = h*0.125, bWall = 4*D;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(cx + 4*D, botY + bWall + 3*D, bRx, bRy, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = C('#6f6b62', '#45423c');                                        // outer face of the wall
    ctx.beginPath(); ctx.ellipse(cx, botY + bWall, bRx, bRy, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = C('#a8a397', '#5f5b53');                                        // its top
    ctx.beginPath(); ctx.ellipse(cx, botY, bRx, bRy, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = C('#4b463d', '#34312b');                                        // inner face of the far side
    ctx.beginPath(); ctx.ellipse(cx, botY, bRx - 3.5*D, bRy - 2.5*D, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = C('#6c6557', '#423e36');                                        // gravel floor
    ctx.beginPath(); ctx.ellipse(cx, botY + bWall*0.5, bRx - 3.5*D, bRy - 2.5*D - bWall*0.5, 0, 0, Math.PI*2); ctx.fill();
    if (fine) {
      for (let i = 0; i < 22; i++) {
        const a = rnd(i + 40)*Math.PI*2, d = 0.72 + rnd(i + 70)*0.24;
        ctx.fillStyle = i % 2 ? 'rgba(160,152,134,0.5)' : 'rgba(40,36,30,0.45)';
        ctx.fillRect(cx + Math.cos(a)*(bRx - 3.5*D)*d, botY + bWall*0.5 + Math.sin(a)*(bRy - 2.5*D - bWall*0.5)*d, 1.2*D, 1.2*D);
      }
    }


    // ── Stub nozzles (aligned with each port; no manifold loop) ──
    // Each is a steel nozzle: a reinforcing pad welded to the shell, a
    // shaded pipe run with flowing liquid out to the footprint face, and a
    // bolted bronze flange capping the end where the adjacent pipe joins.
    const col = `rgba(${pal.top},0.95)`;
    const tankSideX = cx + (right ? rx - 2*S : -rx + 2*S);
    const dir = right ? 1 : -1;               // +1 = nozzle runs rightward out of the shell
    const nozzle = (y, flowing, outward) => {
      const x0 = tankSideX, x1 = faceX;
      const lo = Math.min(x0, x1), len = Math.abs(x1 - x0);
      // pipe body: dark casing, steel core, top highlight
      ctx.fillStyle = '#141410';
      ctx.fillRect(lo, y - 3.5*S, len, 7*S);
      const pg = ctx.createLinearGradient(0, y - 3*S, 0, y + 3*S);
      pg.addColorStop(0,   powered ? '#8a8e88' : '#44463f');
      pg.addColorStop(0.4, powered ? '#5c5f56' : '#34362f');
      pg.addColorStop(1,   powered ? '#2e302a' : '#1e2019');
      ctx.fillStyle = pg;
      ctx.fillRect(lo, y - 2.6*S, len, 5.2*S);
      if (flowing) {
        ctx.save();
        ctx.beginPath(); ctx.rect(lo, y - 2*S, len, 4*S); ctx.clip();
        ctx.strokeStyle = col; ctx.lineWidth = 2*S; ctx.lineCap = 'round';
        // dashes travel away from the shell on OUT, toward it on IN
        ctx.setLineDash([3*S, 5*S]);
        ctx.lineDashOffset = (outward ? -1 : 1) * dir * t * 16*S;
        ctx.beginPath(); ctx.moveTo(lo - 8*S, y); ctx.lineTo(lo + len + 8*S, y); ctx.stroke();
        ctx.restore();
      }
      // weld pad on the shell
      ctx.fillStyle = powered ? '#6a6c66' : '#34362f';
      ctx.fillRect(x0 - (right ? 1.5*S : 0.5*S), y - 5.5*S, 2*S, 11*S);
      // bolted bronze connection flange capping the end at the face, where
      // the adjacent pipe tile joins
      const fx = x1 - dir*2.5*S;
      ctx.fillStyle = '#141410';
      ctx.fillRect(fx - 2.5*S, y - 6*S, 5*S, 12*S);
      ctx.fillStyle = powered ? '#7a5a30' : '#3e3020';
      ctx.fillRect(fx - 1.8*S, y - 5.3*S, 3.6*S, 10.6*S);
      ctx.fillStyle = powered ? '#c8b080' : '#5a5040';
      ctx.beginPath(); ctx.arc(fx, y - 3.6*S, 0.9*S, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(fx, y + 3.6*S, 0.9*S, 0, Math.PI*2); ctx.fill();
    };
    nozzle(inY,  powered && !!e._pipeConnected && fill < 0.999, false);
    nozzle(outY, powered && !!e._pipeConnected && fill > 0.001, true);

    // ── Tank shadow ──
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath(); ctx.ellipse(cx + 8*D, botY + 5*D, rx*1.02, ry*1.1, 0, 0, Math.PI*2); ctx.fill();

    // ── Shell ──
    const shellPath = () => { ctx.beginPath(); ctx.moveTo(cx - rx, topY); ctx.lineTo(cx - rx, botY); ctx.ellipse(cx, botY, rx, ry, 0, Math.PI, 0, true); ctx.lineTo(cx + rx, topY); ctx.closePath(); };
    // Round-looking steel: a dark turning edge, a broad highlight left of
    // centre, a core shadow, and a little light bounced back on the far side.
    const sg = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
    sg.addColorStop(0,    C('#868c93', '#3e4044'));
    sg.addColorStop(0.07, C('#bcc1c6', '#585a5e'));
    sg.addColorStop(0.30, C('#f3f5f5', '#7c7e82'));
    sg.addColorStop(0.52, C('#d3d7da', '#66686c'));
    sg.addColorStop(0.86, C('#7f858c', '#383a3e'));
    sg.addColorStop(1,    C('#9aa0a6', '#46484c'));
    ctx.fillStyle = sg;
    shellPath(); ctx.fill();

    ctx.save();
    shellPath(); ctx.clip();
    // plate courses: a dark weld line with a lit edge under it, and the
    // vertical welds staggered from one course to the next
    const COURSES = 5;
    for (let k = 1; k < COURSES; k++) {
      const y = topY + H*k/COURSES;
      ctx.strokeStyle = 'rgba(50,54,60,0.34)'; ctx.lineWidth = D;
      ctx.beginPath(); ctx.ellipse(cx, y, rx, ry, 0, 0, Math.PI); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 0.6*D;
      ctx.beginPath(); ctx.ellipse(cx, y + D, rx, ry, 0, 0.2, Math.PI - 0.2); ctx.stroke();
    }
    if (fine) {
      ctx.strokeStyle = 'rgba(50,54,60,0.20)'; ctx.lineWidth = 0.7*D;
      for (let k = 0; k < COURSES; k++) {
        for (let j = 0; j < 4; j++) {
          const a = Math.PI*(0.12 + (j + (k % 2 ? 0.5 : 0))*0.22);
          if (a > Math.PI*0.94) continue;
          const x = cx + Math.cos(a)*rx, dy = Math.sin(a)*ry;
          ctx.beginPath(); ctx.moveTo(x, topY + H*k/COURSES + dy); ctx.lineTo(x, topY + H*(k + 1)/COURSES + dy); ctx.stroke();
        }
      }
    }
    // liquid colour band, painted round the top course
    const bandY = topY + H*0.15, bandH = 7*D;
    ctx.fillStyle = C(pal.accent, '#4a4030');
    ctx.beginPath();
    ctx.ellipse(cx, bandY - bandH/2, rx, ry, 0, 0, Math.PI);
    ctx.ellipse(cx, bandY + bandH/2, rx, ry, 0, Math.PI, 0, true);
    ctx.closePath(); ctx.fill();
    // the band turns with the shell: shade it the way the steel is shaded
    const bg = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
    bg.addColorStop(0, 'rgba(0,0,0,0.38)'); bg.addColorStop(0.3, 'rgba(255,255,255,0.22)');
    bg.addColorStop(0.55, 'rgba(0,0,0,0)'); bg.addColorStop(1, 'rgba(0,0,0,0.36)');
    ctx.fillStyle = bg; ctx.fill();
    // weathering: rust runs down from the band, grime where the shell meets the ground
    if (fine) {
      for (let i = 0; i < 5; i++) {
        const a = Math.PI*(0.1 + rnd(i)*0.8);
        const x = cx + Math.cos(a)*rx, y0 = bandY + bandH/2 + Math.sin(a)*ry;
        const len = H*(0.14 + rnd(i + 9)*0.3), sw = (1.2 + rnd(i + 20)*2)*D;
        const rg2 = ctx.createLinearGradient(0, y0, 0, y0 + len);
        rg2.addColorStop(0, `rgba(122,74,34,${C(0.26, 0.14)})`); rg2.addColorStop(1, 'rgba(122,74,34,0)');
        ctx.fillStyle = rg2; ctx.fillRect(x - sw/2, y0, sw, len);
      }
    }
    const gg = ctx.createLinearGradient(0, botY - 12*D, 0, botY + ry);
    gg.addColorStop(0, 'rgba(46,40,30,0)'); gg.addColorStop(1, 'rgba(46,40,30,0.42)');
    ctx.fillStyle = gg; ctx.fillRect(cx - rx, botY - 12*D, rx*2, ry + 12*D);
    ctx.restore();

    // wind girder: the stiffening ring that stands proud just under the rim
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.2*D;
    ctx.beginPath(); ctx.ellipse(cx, topY + 6.4*D, rx + D, ry, 0, 0.02, Math.PI - 0.02); ctx.stroke();
    ctx.strokeStyle = C('#b4b9be', '#5c5e62'); ctx.lineWidth = 2.2*D;
    ctx.beginPath(); ctx.ellipse(cx, topY + 4.6*D, rx + D, ry, 0, 0, Math.PI); ctx.stroke();

    // ── Spiral stair: stringer, treads and a handrail on posts ──
    const stair = (u) => { const a = Math.PI*(0.95 - u*0.75); return [cx + Math.cos(a)*rx, botY - H*u + Math.sin(a)*ry]; };
    const STEPS = 20, railUp = 5*D;
    const run = (lift) => { ctx.beginPath(); for (let i = 0; i <= STEPS; i++) { const [x, y] = stair(i/STEPS); i ? ctx.lineTo(x, y - lift) : ctx.moveTo(x, y - lift); } ctx.stroke(); };
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 3*D; run(-1.5*D);          // shadow on the shell
    ctx.strokeStyle = C('#4a4e54', '#2a2c30'); ctx.lineWidth = 2.4*D; run(0);         // stringer
    ctx.strokeStyle = C('#9aa0a6', '#4a4c50'); ctx.lineWidth = 0.8*D;
    for (let i = 0; i <= STEPS; i++) { const [x, y] = stair(i/STEPS); ctx.beginPath(); ctx.moveTo(x - 1.6*D, y - 0.4*D); ctx.lineTo(x + 1.6*D, y - 0.4*D); ctx.stroke(); }
    ctx.strokeStyle = C('#e0a020', '#6a5a30'); ctx.lineWidth = 0.8*D;
    for (let i = 0; i <= STEPS; i += 4) { const [x, y] = stair(i/STEPS); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - railUp); ctx.stroke(); }
    ctx.lineWidth = 1.3*D; run(railUp);
    ctx.lineCap = 'butt';
    // landing where the stair meets the rim
    { const [lx, ly] = stair(1);
      ctx.fillStyle = C('#4a4e54', '#2a2c30'); ctx.fillRect(lx - 2*D, ly - 1.2*D, 8*D, 2.2*D);
      ctx.strokeStyle = C('#e0a020', '#6a5a30'); ctx.lineWidth = D;
      ctx.beginPath(); ctx.moveTo(lx + 6*D, ly - 1.2*D); ctx.lineTo(lx + 6*D, ly - railUp - 1.2*D); ctx.lineTo(lx, ly - railUp); ctx.stroke(); }

    // ── Level gauge: a sight glass up the shell with a float marker ──
    const gbW = 6*D, gbX = cx - rx*0.74 - gbW/2, gbY = topY + ry + 13*D, gbH = H*0.46;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.roundRect(gbX + 1.5*D, gbY + 1.5*D, gbW, gbH, 2*D); ctx.fill();
    ctx.fillStyle = C('#2a2e34', '#1c1e22'); ctx.beginPath(); ctx.roundRect(gbX, gbY, gbW, gbH, 2*D); ctx.fill();
    ctx.fillStyle = '#0b0e12'; ctx.fillRect(gbX + 1.5*D, gbY + 2*D, gbW - 3*D, gbH - 4*D);
    const gIn = gbH - 4*D, gLv = gbY + 2*D + gIn*(1 - fill);
    if (fill > 0) {
      ctx.globalAlpha = powered ? 1 : 0.55;
      ctx.fillStyle = pal.gauge;   // always the liquid's colour; the level shows how full
      ctx.fillRect(gbX + 1.5*D, gLv, gbW - 3*D, gIn*fill);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(gbX + 1.5*D, gLv, 0.8*D, gIn*fill);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = 'rgba(40,44,50,0.7)'; ctx.lineWidth = 0.6*D;
    for (let k = 0; k <= 4; k++) { const y = gbY + 2*D + gIn*k/4; ctx.beginPath(); ctx.moveTo(gbX + gbW, y); ctx.lineTo(gbX + gbW + (k % 2 ? 2 : 3.5)*D, y); ctx.stroke(); }
    // float marker riding the level
    ctx.fillStyle = C('#f4f4f0', '#8a8a86');
    ctx.beginPath(); ctx.moveTo(gbX - 0.5*D, gLv); ctx.lineTo(gbX - 4*D, gLv - 2.2*D); ctx.lineTo(gbX - 4*D, gLv + 2.2*D); ctx.closePath(); ctx.fill();

    // ── Hazard sign ──
    const hsX = cx - rx*0.24, hsY = topY + H*0.42;
    if (liq) {
      ctx.save(); ctx.translate(hsX, hsY); ctx.rotate(Math.PI/4);
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(-8*D, -8*D, 18*D, 18*D);
      ctx.fillStyle = liq === 'water' ? '#e8f4ff' : '#ffffff'; ctx.strokeStyle = liq === 'acid' ? '#1a1a1a' : liq === 'water' ? '#2a6ac0' : '#c02020'; ctx.lineWidth = 1.5*D;
      ctx.fillRect(-9*D, -9*D, 18*D, 18*D); ctx.strokeRect(-9*D, -9*D, 18*D, 18*D);
      ctx.restore();
      ctx.save(); ctx.translate(hsX, hsY);
      if (liq === 'oil' || liq === 'fuel') {
        ctx.fillStyle = '#d02020';
        ctx.beginPath(); ctx.moveTo(0, -7*D); ctx.quadraticCurveTo(6*D, -1*D, 3.5*D, 5*D); ctx.quadraticCurveTo(0, 7*D, -3.5*D, 5*D); ctx.quadraticCurveTo(-6*D, -1*D, 0, -7*D); ctx.fill();
        ctx.fillStyle = '#ffd040'; ctx.beginPath(); ctx.moveTo(0, -1*D); ctx.quadraticCurveTo(2.5*D, 2*D, 1.5*D, 4.5*D); ctx.lineTo(-1.5*D, 4.5*D); ctx.quadraticCurveTo(-2.5*D, 2*D, 0, -1*D); ctx.fill();
      } else if (liq === 'acid') {
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(-6*D, -5*D, 4*D, 5*D); ctx.fillRect(2*D, -5*D, 4*D, 5*D);
        ctx.fillRect(-7*D, 3*D, 14*D, 3*D);
      } else if (liq === 'water') {
        ctx.fillStyle = '#2a7ad0';
        ctx.beginPath(); ctx.moveTo(0, -7*D); ctx.quadraticCurveTo(6*D, 1*D, 0, 6*D); ctx.quadraticCurveTo(-6*D, 1*D, 0, -7*D); ctx.fill();
      }
      ctx.restore();
    }

    // ── Open top: rim, interior, floating roof ──
    ctx.fillStyle = C('#3a3c40', '#1a1c1e');
    ctx.beginPath(); ctx.ellipse(cx, topY, rx, ry, 0, 0, Math.PI*2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, topY, rx - 3*D, ry - 2*D, 0, 0, Math.PI*2); ctx.clip();
    // inside of the shell: dark at the lip, stained the liquid's colour lower down
    const drop = (1 - fill) * ry * 0.9;
    const ig = ctx.createLinearGradient(0, topY - ry, 0, topY + ry);
    ig.addColorStop(0, '#101214'); ig.addColorStop(0.45, liq ? `rgba(${pal.bot},1)` : '#1c1e20'); ig.addColorStop(1, '#16181a');
    ctx.fillStyle = ig; ctx.fillRect(cx - rx, topY - ry, rx*2, ry*2);
    const deckY = topY + drop + ry*0.1;
    if (fill > 0.01) {
      const lg = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
      lg.addColorStop(0, `rgba(${pal.bot},0.95)`); lg.addColorStop(0.5, `rgba(${pal.mid},0.95)`); lg.addColorStop(1, `rgba(${pal.bot},0.95)`);
      ctx.fillStyle = lg; ctx.beginPath(); ctx.ellipse(cx, topY + drop, rx - 3*D, ry - 2*D, 0, 0, Math.PI*2); ctx.fill();
      if (fine) {
        ctx.globalAlpha = 0.25 + 0.15*Math.sin(t*0.8);
        ctx.fillStyle = `rgba(${pal.shimmer},0.7)`;
        ctx.beginPath(); ctx.ellipse(cx - rx*0.3 + Math.sin(t*0.5)*rx*0.2, topY + drop - ry*0.3, rx*0.3, ry*0.2, 0, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    // floating roof deck: a pontoon ring round a plated centre
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(cx, deckY + 1.5*D, rx*0.84, ry*0.8, 0, 0, Math.PI*2); ctx.fill();
    const rg = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
    rg.addColorStop(0, C('#8a9095', '#44464a')); rg.addColorStop(0.35, C('#dfe2e4', '#6c6e72')); rg.addColorStop(1, C('#7a8085', '#383a3e'));
    ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(cx, deckY, rx*0.82, ry*0.78, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(40,44,50,0.45)'; ctx.lineWidth = 0.8*D;
    ctx.beginPath(); ctx.ellipse(cx, deckY, rx*0.66, ry*0.62, 0, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = 'rgba(40,44,50,0.3)';
    for (let k = 0; k < 8; k++) { const a = k*Math.PI/4 + 0.2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a)*rx*0.12, deckY + Math.sin(a)*ry*0.12); ctx.lineTo(cx + Math.cos(a)*rx*0.66, deckY + Math.sin(a)*ry*0.62); ctx.stroke(); }
    ctx.fillStyle = C('#5a5e62', '#2a2c30'); ctx.beginPath(); ctx.ellipse(cx, deckY, rx*0.12, ry*0.12, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = C('#8a8e92', '#3a3c40'); ctx.beginPath(); ctx.ellipse(cx, deckY - 0.8*D, rx*0.08, ry*0.08, 0, 0, Math.PI*2); ctx.fill();
    // rolling ladder from the rim down onto the deck: it lies flatter as the roof rises
    if (fine) {
      const l0x = cx - rx*0.58, l0y = topY - ry*0.52, l1x = cx - rx*0.14, l1y = deckY - ry*0.1;
      ctx.strokeStyle = C('#e0a020', '#6a5a30'); ctx.lineWidth = 0.9*D;
      for (const o of [-1.4*D, 1.4*D]) { ctx.beginPath(); ctx.moveTo(l0x, l0y + o); ctx.lineTo(l1x, l1y + o); ctx.stroke(); }
      ctx.lineWidth = 0.6*D;
      for (let k = 1; k < 7; k++) { const x = l0x + (l1x - l0x)*k/7, y = l0y + (l1y - l0y)*k/7; ctx.beginPath(); ctx.moveTo(x, y - 1.4*D); ctx.lineTo(x, y + 1.4*D); ctx.stroke(); }
    }
    ctx.restore();
    ctx.strokeStyle = C('#eef0f0', '#6a6c70'); ctx.lineWidth = 2*D;
    ctx.beginPath(); ctx.ellipse(cx, topY, rx, ry, 0, 0, Math.PI*2); ctx.stroke();
    // handrail round the back of the rim
    ctx.strokeStyle = C('#e0a020', '#6a5a30'); ctx.lineWidth = D;
    for (let k = 0; k < 10; k++) { const a = Math.PI + k*Math.PI/9; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a)*rx, topY + Math.sin(a)*ry); ctx.lineTo(cx + Math.cos(a)*rx, topY + Math.sin(a)*ry - 3.5*D); ctx.stroke(); }
    ctx.lineWidth = 0.8*D;
    ctx.beginPath(); ctx.ellipse(cx, topY - 3.5*D, rx, ry, 0, Math.PI, Math.PI*2); ctx.stroke();

    // ── Roof vent + vapour ──
    const vpx = cx + rx*0.55, vpy = topY - ry*0.55;
    ctx.fillStyle = powered ? '#8a8e92' : '#3a3c40'; ctx.fillRect(vpx - 2.5*D, vpy - 9*D, 5*D, 9*D);
    ctx.fillStyle = powered ? '#5a5e62' : '#2a2c30'; ctx.fillRect(vpx - 4.5*D, vpy - 11*D, 9*D, 3*D);
    if (powered && fill > 0) {
      for (let vi = 0; vi < 3; vi++) {
        const p = (t*0.4 + vi/3) % 1;
        ctx.fillStyle = pal.vapor; ctx.globalAlpha = 0.35*(1 - p);
        ctx.beginPath(); ctx.arc(vpx + p*6*D, vpy - 13*D - p*14*D, (2 + p*4)*D, 0, Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // ── Full warning ──
    if (fill >= 0.98 && powered) {
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.3*Math.sin(t*4);
      ctx.strokeStyle = '#ff4010'; ctx.lineWidth = 3*D;
      ctx.beginPath(); ctx.ellipse(cx, topY, rx + 3*D, ry + 2*D, 0, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }

    // ── Stub labels: both on one face (left default, right when R-rotated).
    // Labels follow resolved IN/OUT from OilSystem.resolveTankPorts. The
    // stubs themselves are the steel nozzles drawn above. Nothing plugged
    // into either stub: the roles are only a default, so no labels.
    if (ports.known) [
      { stub: ports.in,  label: 'IN'  },
      { stub: ports.out, label: 'OUT' },
    ].forEach(({ stub, label }) => {
      const sy = stubY(stub);
      const connected = e._pipeConnected;
      ctx.font = `${Math.max(4, S*5)}px Courier New`;
      ctx.fillStyle = connected ? `rgba(${pal.label},0.9)` : 'rgba(70,55,20,0.6)';
      ctx.textAlign = right ? 'left' : 'right';
      ctx.fillText(label, right ? faceX + S*5 : faceX - S*5, sy + S*2);
    });

    const statusText = !powered ? 'OFFLINE' : fill > 0.001 ? `${pal.name} ${Math.round(fill * 100)}%` : 'EMPTY';
    const plateCol = !powered ? '#8a7a50' : `rgb(${pal.label})`;
    _wfPlate(statusText, cx, py + h*0.955, S, plateCol, powered);
    ctx.restore();
  }

function renderRefinery(e, px, py, t) {
    // Oil Refinery: brick fired heater with glowing burners → tall
    // distillation column with platforms and ladder → overhead fin-fan
    // cooler, a catalytic cracker sphere and a floating-roof fuel oil tank
    // that fills with _fuelOil; a bubbling sludge pit tracks _sludgeWaste,
    // and the flare burns tall while LPG is being flared (pilot otherwise —
    // including while every unit is going to LPG OUT). CRUDE IN stub on the
    // left face (row floor(h/2)), FUEL OUT on the bottom face (col floor(w/2)),
    // and once unlocked LPG OUT on the right face's top row — the tiles the
    // pipe renderer joins to. No backdrop.
    const w  = (e.width  || 5) * TILE;
    const h  = (e.height || 4) * TILE;
    const powered  = e.powered;
    const status   = e._refStatus || 'offline';
    const running  = powered && status === 'running';
    // Flaring unless the refinery is known to be recovering every unit of LPG.
    const flaring  = running && !(e._lpgFlareRate === 0 && (e._lpgRate || 0) > 0);
    const lpgPort  = refineryLpgUnlocked();
    const fuelFill = Math.min(1, (e._fuelOil || 0) / (EntityDefs[T.REFINERY].fuelCapacity || 400));
    const sludge   = Math.min(1, (e._sludgeWaste || 0) / 100);
    const S = TILE / 40;
    const accent = '#ffa030';
    ctx.save();

    const inRow  = Math.floor((e.height || 4) / 2), outCol = Math.floor((e.width || 5) / 2);
    const inY = py + inRow*TILE + TILE/2, outX = px + outCol*TILE + TILE/2;
    const STUB_LEN = 22*S;
    // Heater starts clear of the CRUDE IN spool.
    const fhX = px + Math.max(w*0.05, STUB_LEN + 2*S), fhY = py + h*0.46, fhW = w*0.25, fhH = h*0.34;
    const dcX = px + w*0.40, dcTop = py + h*0.07, dcBot = py + h*0.84, dcR = w*0.05;
    const ffX = px + w*0.50, ffY = py + h*0.07, ffW = w*0.26, ffH = h*0.16;
    const spX = px + w*0.62, spY = py + h*0.43, spR = w*0.075;
    const tkX = px + w*0.86, tkY = py + h*0.36, tkR = w*0.11;
    const slX = px + w*0.60, slY = py + h*0.66, slW = w*0.20, slH = h*0.20;

    // ── Pipework ──
    _wfPipe([[px + STUB_LEN, inY], [fhX + 2*S, inY]], S, t, running, 'rgba(60,50,40,0.95)');
    _wfPipe([[fhX + fhW, fhY + fhH*0.3], [dcX - dcR, fhY + fhH*0.3]], S, t, running, 'rgba(255,150,60,0.95)');
    _wfPipe([[dcX, dcTop + 6*S], [ffX + ffW*0.5, dcTop + 6*S], [ffX + ffW*0.5, ffY + ffH]], S, t, running, 'rgba(240,240,230,0.9)');
    _wfPipe([[ffX + ffW, ffY + ffH*0.5], [tkX, ffY + ffH*0.5], [tkX, tkY - tkR]], S, t, running, 'rgba(255,190,70,0.95)');
    _wfPipe([[dcX + dcR, spY], [spX - spR, spY]], S, t, running, 'rgba(255,170,80,0.9)');
    _wfPipe([[spX, spY + spR], [spX, slY]], S, t, running, 'rgba(40,34,26,0.9)');
    _wfPipe([[tkX, tkY + tkR], [tkX, py + h*0.92], [outX, py + h*0.92], [outX, py + h - STUB_LEN]], S, t, powered && fuelFill > 0.005, 'rgba(255,190,70,0.95)');
    // LPG off the condenser to the LPG OUT spool (top row, right face).
    const lpgY = py + TILE/2;
    if (lpgPort) _wfPipe([[ffX + ffW, lpgY], [px + w - STUB_LEN, lpgY]], S, t, powered && (e._lpg || 0) > 0.5, 'rgba(255,130,100,0.95)');

    // ── Flare stack ──
    const flX = px + w*0.12, flTop = py + h*0.05, flBase = fhY;
    ctx.strokeStyle = 'rgba(200,200,190,0.25)'; ctx.lineWidth = 0.8*S;
    [-10, 10].forEach(dx => { ctx.beginPath(); ctx.moveTo(flX, flTop + 8*S); ctx.lineTo(flX + dx*S, flBase); ctx.stroke(); });
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(flX - 2.5*S + 4*S, flTop + 5*S, 5*S, flBase - flTop);
    ctx.fillStyle = '#4a4a44'; ctx.fillRect(flX - 2.5*S, flTop, 5*S, flBase - flTop);
    [0, 2, 4].forEach(k => { ctx.fillStyle = k % 4 ? '#e8e8e0' : '#b03020'; ctx.fillRect(flX - 2.5*S, flTop + k*3.5*S, 5*S, 3.5*S); });
    if (flaring) {
      const fh = 20*S*(1 + 0.2*Math.sin(t*9) + 0.08*Math.sin(t*23));
      const sway = Math.sin(t*2.3)*2*S;
      ctx.fillStyle = 'rgba(255,140,40,0.14)'; ctx.beginPath(); ctx.arc(flX, flTop - fh*0.5, fh, 0, Math.PI*2); ctx.fill();
      const flame = (fw, fhh, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(flX - fw, flTop); ctx.quadraticCurveTo(flX - fw*1.1, flTop - fhh*0.5, flX + sway, flTop - fhh); ctx.quadraticCurveTo(flX + fw*1.1, flTop - fhh*0.5, flX + fw, flTop); ctx.closePath(); ctx.fill(); };
      flame(5*S, fh, 'rgba(255,110,30,0.9)');
      flame(3*S, fh*0.62, 'rgba(255,220,100,0.95)');
      // Scrubbed: steam-assisted tip — a ring of steam jets, and the flame
      // burns smokeless (white wisps instead of soot).
      if (e._scrubber) {
        ctx.fillStyle = 'rgba(235,245,250,0.55)';
        [-1, 1].forEach(d => { ctx.beginPath(); ctx.ellipse(flX + d*4*S, flTop - 1.5*S, 2*S, 1*S, 0, 0, Math.PI*2); ctx.fill(); });
      }
      for (let k = 0; k < 3; k++) {
        const p = (t*0.4 + k/3) % 1;
        ctx.fillStyle = e._scrubber ? `rgba(240,246,250,${0.3*(1 - p)})` : `rgba(50,46,40,${0.35*(1 - p)})`;
        ctx.beginPath(); ctx.arc(flX + sway + p*10*S, flTop - fh - p*16*S, (3 + p*6)*S, 0, Math.PI*2); ctx.fill();
      }
    } else if (powered) {
      ctx.fillStyle = 'rgba(255,170,60,0.7)'; ctx.beginPath(); ctx.ellipse(flX, flTop - 3*S, 2*S, 3.5*S, 0, 0, Math.PI*2); ctx.fill();
    }

    // ── Fired heater ──
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(fhX + 5*S, fhY + 6*S, fhW, fhH);
    ctx.fillStyle = powered ? '#8a4630' : '#4a2a20'; ctx.fillRect(fhX, fhY, fhW, fhH);
    ctx.strokeStyle = 'rgba(40,18,10,0.35)'; ctx.lineWidth = 0.7*S;
    let row = 0;
    for (let y = fhY + 4*S; y < fhY + fhH; y += 4*S, row++) {
      ctx.beginPath(); ctx.moveTo(fhX, y); ctx.lineTo(fhX + fhW, y); ctx.stroke();
      for (let x = fhX + (row % 2 ? 4*S : 0); x < fhX + fhW; x += 8*S) { ctx.beginPath(); ctx.moveTo(x, y - 4*S); ctx.lineTo(x, y); ctx.stroke(); }
    }
    ctx.fillStyle = '#3a2a22'; ctx.fillRect(fhX - 1*S, fhY - 3*S, fhW + 2*S, 4*S);
    for (let k = 0; k < 3; k++) {
      const bx = fhX + fhW*(0.12 + k*0.30), by = fhY + fhH*0.52, bw = fhW*0.18, bh = fhH*0.30;
      const g = ctx.createLinearGradient(0, by, 0, by + bh);
      g.addColorStop(0, running ? `rgba(255,${200 + k*10},90,${0.85 + 0.15*Math.sin(t*8 + k)})` : '#2a1a14');
      g.addColorStop(1, running ? '#c03010' : '#140c0a');
      ctx.fillStyle = g; ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#1a0e0a'; ctx.lineWidth = S; ctx.strokeRect(bx, by, bw, bh);
    }
    if (running) { ctx.fillStyle = 'rgba(255,120,40,0.15)'; ctx.beginPath(); ctx.ellipse(fhX + fhW/2, fhY + fhH*0.68, fhW*0.6, fhH*0.35, 0, 0, Math.PI*2); ctx.fill(); }
    // heater stack
    const hsX = fhX + fhW*0.75;
    ctx.fillStyle = '#5a5046'; ctx.fillRect(hsX - 2.5*S, fhY - 18*S, 5*S, 16*S);
    if (e._scrubber) {
      // Flue-gas scrubber (fitted from the panel): the heater stack
      // goosenecks into an absorber tower between the flare and the column.
      const scR = 10*S, scX = Math.min(hsX - 10*S - scR, dcX - dcR - 6*S - scR), scTop = py + h*0.13, scBase = fhY - 3*S;
      const dY = fhY - 30*S;
      _scrubberTower(scX, scTop, scBase, scR, S, t, running, -1);
      _scrubberDuct([[hsX, fhY - 17*S], [hsX, dY], [scX + scR - 1*S, dY]], S, t, running);
      if (running && Camera.zoom > 0.45) _scrubberVapour(scX, scTop - 4*S, S, t, 4, 0.8);
    } else {
      _wfSmoke(hsX, fhY - 19*S, S*0.5, t, '110,104,96', running, 0.35);
    }

    // ── Distillation column ──
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.roundRect(dcX - dcR + 5*S, dcTop + 6*S, dcR*2, dcBot - dcTop, dcR*0.7); ctx.fill();
    const cg = ctx.createLinearGradient(dcX - dcR, 0, dcX + dcR, 0);
    cg.addColorStop(0, powered ? '#8a9096' : '#4a4e52'); cg.addColorStop(0.35, powered ? '#eef0f2' : '#7a7e82'); cg.addColorStop(1, powered ? '#565c62' : '#2a2e32');
    ctx.fillStyle = cg; ctx.strokeStyle = '#1a1e22'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.roundRect(dcX - dcR, dcTop, dcR*2, dcBot - dcTop, dcR*0.7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = powered ? '#f4f6f6' : '#6a6e72'; ctx.beginPath(); ctx.ellipse(dcX, dcTop + 2*S, dcR, dcR*0.45, 0, 0, Math.PI*2); ctx.fill();
    for (let k = 0; k < 4; k++) {
      const y = dcTop + (dcBot - dcTop)*(0.18 + k*0.2);
      ctx.fillStyle = '#e0a020'; ctx.fillRect(dcX - dcR - 4*S, y, dcR*2 + 8*S, 2*S);
      ctx.strokeStyle = 'rgba(224,160,32,0.7)'; ctx.lineWidth = 0.7*S;
      ctx.beginPath(); ctx.moveTo(dcX - dcR - 4*S, y); ctx.lineTo(dcX - dcR - 4*S, y - 4*S); ctx.moveTo(dcX + dcR + 4*S, y); ctx.lineTo(dcX + dcR + 4*S, y - 4*S); ctx.stroke();
      if (running) {
        ctx.fillStyle = `rgba(255,${160 + k*20},60,${0.25 + 0.15*Math.sin(t*2 - k)})`;
        ctx.fillRect(dcX - dcR + 2*S, y - 6*S, dcR*2 - 4*S, 4*S);
      }
    }
    ctx.strokeStyle = '#2a2e32'; ctx.lineWidth = 0.8*S;
    const ldx = dcX + dcR*0.45;
    ctx.beginPath(); ctx.moveTo(ldx - 1.5*S, dcTop + 8*S); ctx.lineTo(ldx - 1.5*S, dcBot - 4*S); ctx.moveTo(ldx + 1.5*S, dcTop + 8*S); ctx.lineTo(ldx + 1.5*S, dcBot - 4*S); ctx.stroke();
    for (let y = dcTop + 10*S; y < dcBot - 4*S; y += 3*S) { ctx.beginPath(); ctx.moveTo(ldx - 1.5*S, y); ctx.lineTo(ldx + 1.5*S, y); ctx.stroke(); }

    // ── Fin-fan cooler ──
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.roundRect(ffX + 4*S, ffY + 5*S, ffW, ffH, 2*S); ctx.fill();
    ctx.fillStyle = powered ? '#5a6468' : '#2a3034'; ctx.strokeStyle = '#1a2024'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.roundRect(ffX, ffY, ffW, ffH, 2*S); ctx.fill(); ctx.stroke();
    for (let k = 0; k < 3; k++) _fcFan(ffX + ffW*(0.18 + k*0.32), ffY + ffH*0.5, Math.min(ffW/7, ffH*0.4), S, t + k*0.3, powered, running ? 9 : 2);

    // ── Cat cracker sphere ──
    ctx.fillStyle = '#4a4a4e';
    [-0.6, 0.6].forEach(f => ctx.fillRect(spX + f*spR - 1.5*S, spY, 3*S, spR + 6*S));
    _fcSphere(spX, spY, spR, S, t, 0, accent, powered, '');
    if (running) { ctx.strokeStyle = `rgba(255,150,60,${0.4 + 0.3*Math.sin(t*3)})`; ctx.lineWidth = 2*S; ctx.beginPath(); ctx.arc(spX, spY, spR + 2.5*S, 0, Math.PI*2); ctx.stroke(); }

    // ── Floating-roof fuel oil tank ──
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(tkX + 5*S, tkY + 6*S, tkR, 0, Math.PI*2); ctx.fill();
    const tg = ctx.createRadialGradient(tkX - tkR*0.4, tkY - tkR*0.4, tkR*0.1, tkX, tkY, tkR);
    tg.addColorStop(0, powered ? '#ffffff' : '#6a6c70'); tg.addColorStop(0.7, powered ? '#c4c8cc' : '#4a4c50'); tg.addColorStop(1, powered ? '#7a7e82' : '#2a2c30');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(tkX, tkY, tkR, 0, Math.PI*2); ctx.fill();
    const ir = tkR - 3*S;
    ctx.fillStyle = '#1a1612'; ctx.beginPath(); ctx.arc(tkX, tkY, ir, 0, Math.PI*2); ctx.fill();
    if (fuelFill > 0.01) {
      const fg = ctx.createRadialGradient(tkX, tkY, 1, tkX, tkY, ir);
      fg.addColorStop(0, '#e0a040'); fg.addColorStop(1, '#8a5010');
      ctx.fillStyle = fg; ctx.globalAlpha = 0.4 + fuelFill*0.6;
      ctx.beginPath(); ctx.arc(tkX, tkY, ir, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
    }
    const roofR = ir*(0.55 + 0.35*fuelFill);
    ctx.fillStyle = powered ? '#b8bcc0' : '#4a4c50'; ctx.beginPath(); ctx.arc(tkX, tkY, roofR, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(40,44,50,0.4)'; ctx.lineWidth = 0.8*S;
    for (let k = 0; k < 8; k++) { const a = k*Math.PI/4; ctx.beginPath(); ctx.moveTo(tkX, tkY); ctx.lineTo(tkX + Math.cos(a)*roofR, tkY + Math.sin(a)*roofR); ctx.stroke(); }
    ctx.strokeStyle = '#141008'; ctx.lineWidth = 3*S;
    ctx.beginPath(); ctx.arc(tkX, tkY, tkR + 2*S, 0, Math.PI*2); ctx.stroke();
    if (fuelFill > 0) {
      ctx.strokeStyle = fuelFill > 0.9 && powered && Math.sin(t*6) > 0 ? '#ff4020' : accent;
      ctx.globalAlpha = powered ? 0.95 : 0.5; ctx.lineWidth = 2.2*S;
      ctx.beginPath(); ctx.arc(tkX, tkY, tkR + 2*S, -Math.PI/2, -Math.PI/2 + Math.PI*2*fuelFill); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ── Sludge pit ──
    ctx.fillStyle = '#6a5e4c'; ctx.beginPath(); ctx.roundRect(slX, slY, slW, slH, 4*S); ctx.fill();
    ctx.strokeStyle = '#3a3226'; ctx.lineWidth = S; ctx.stroke();
    const six = slX + 3*S, siy = slY + 3*S, siw = slW - 6*S, sih = slH - 6*S;
    ctx.fillStyle = '#14100c'; ctx.beginPath(); ctx.roundRect(six, siy, siw, sih, 3*S); ctx.fill();
    if (sludge > 0.01) {
      ctx.save(); ctx.beginPath(); ctx.roundRect(six, siy, siw, sih, 3*S); ctx.clip();
      const lvl = siy + sih*(1 - sludge);
      ctx.fillStyle = sludge >= 1 ? (Math.sin(t*5) > 0 ? '#5a1a10' : '#2a120c') : '#2e2616';
      ctx.fillRect(six, lvl, siw, siy + sih - lvl);
      if (running) {
        for (let k = 0; k < 4; k++) {
          const p = (t*0.6 + k*0.3) % 1;
          ctx.strokeStyle = `rgba(140,120,80,${0.6*(1 - p)})`; ctx.lineWidth = 0.8*S;
          ctx.beginPath(); ctx.arc(six + siw*(0.2 + k*0.2), lvl + (siy + sih - lvl)*0.5, (0.8 + p*2.5)*S, 0, Math.PI*2); ctx.stroke();
        }
      }
      ctx.restore();
    }
    ctx.fillStyle = sludge >= 1 ? '#ff5030' : (powered ? '#d0b080' : '#6a5a40');
    ctx.font = `bold ${Math.max(4, 4.5*S)}px Arial, sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(`SLUDGE ${Math.round(sludge*100)}%`, slX + slW/2, slY - 2*S);

    // ── Pipe stubs ──
    // Each port is a short flanged spool running in from the face: a bolted
    // flange on the building edge where the pipe tile meets it, a gate valve
    // with a handwheel, a colour band (dark for crude, amber for fuel oil)
    // and a status lamp. The lamp is red with no pipe on the port tile, amber
    // once one is laid, green while product is actually moving — at which
    // point the handwheel turns and chevrons run along the spool.
    const _portPipe = (c, r) => {
      if (!GridManager.inBounds(c, r)) return false;
      const p = GridManager.getEntity(c, r);
      return !!p && (p.type === T.PIPE || p.type === T.UNDERGNDPIPE || !!p._underPipe);
    };
    const inPiped  = _portPipe(e.col - 1, e.row + inRow);
    const outPiped = _portPipe(e.col + outCol, e.row + (e.height || 4));
    const lpgPiped = lpgPort && _portPipe(e.col + (e.width || 5), e.row);
    const _stub = (ox, oy, ang, band, chevron, piped, flowing, flowIn) => {
      ctx.save();
      ctx.translate(ox, oy); ctx.rotate(ang);
      // Local frame: the face edge is x = 0, +x runs into the building.
      const L = STUB_LEN;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(2*S, -3*S, L, 11*S);
      const pg = ctx.createLinearGradient(0, -5.5*S, 0, 5.5*S);
      pg.addColorStop(0, powered ? '#9a948a' : '#5a5650'); pg.addColorStop(0.35, powered ? '#6a645a' : '#3e3a36'); pg.addColorStop(1, '#221e1a');
      ctx.fillStyle = pg; ctx.fillRect(0, -5.5*S, L, 11*S);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, -4.2*S, L, 1.2*S);
      ctx.fillStyle = band; ctx.fillRect(L*0.64, -5.5*S, 3.5*S, 11*S);
      if (flowing) {
        ctx.fillStyle = chevron;
        for (let k = 0; k < 3; k++) {
          let u = ((t * 0.9) + k / 3) % 1;
          if (!flowIn) u = 1 - u;
          const cx = 5*S + u * (L - 10*S), d = flowIn ? 1 : -1;
          ctx.beginPath(); ctx.moveTo(cx - 2*S*d, -3*S); ctx.lineTo(cx + 2*S*d, 0); ctx.lineTo(cx - 2*S*d, 3*S); ctx.closePath(); ctx.fill();
        }
      }
      // Flanges: outer on the face edge, inner where the spool meets the plant.
      for (const fx of [0, L - 4*S]) {
        ctx.fillStyle = '#3a3630'; ctx.strokeStyle = '#141210'; ctx.lineWidth = S;
        ctx.beginPath(); ctx.roundRect(fx, -8.5*S, 4*S, 17*S, S); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#a8a298';
        for (const by of [-6.5, -2.2, 2.2, 6.5]) { ctx.beginPath(); ctx.arc(fx + 2*S, by*S, 0.9*S, 0, Math.PI*2); ctx.fill(); }
      }
      // Gate valve + handwheel.
      const vx = L*0.38;
      ctx.fillStyle = '#2a2622'; ctx.strokeStyle = '#141210'; ctx.lineWidth = 0.8*S;
      ctx.beginPath(); ctx.roundRect(vx - 3*S, -7*S, 6*S, 14*S, 1.2*S); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.translate(vx, 0); ctx.rotate(flowing ? t*2.2 : 0.4);
      ctx.strokeStyle = '#141210'; ctx.lineWidth = 2.6*S;
      ctx.beginPath(); ctx.arc(0, 0, 4.8*S, 0, Math.PI*2); ctx.stroke();
      ctx.strokeStyle = band; ctx.lineWidth = 1.6*S;
      ctx.beginPath(); ctx.arc(0, 0, 4.8*S, 0, Math.PI*2); ctx.stroke();
      ctx.lineWidth = S;
      for (let k = 0; k < 3; k++) { const a = k*Math.PI*2/3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a)*4.8*S, Math.sin(a)*4.8*S); ctx.stroke(); }
      ctx.fillStyle = '#d8d0c0'; ctx.beginPath(); ctx.arc(0, 0, 1.3*S, 0, Math.PI*2); ctx.fill();
      ctx.restore();
      // Status lamp on the outer flange.
      const lamp = !powered ? '#3a2a24' : flowing ? '#40e070' : piped ? '#ffb020' : (Math.sin(t*4) > 0 ? '#e03020' : '#601810');
      const lx = L*0.72, ly = -8.5*S;
      ctx.fillStyle = '#1a1814'; ctx.beginPath(); ctx.arc(lx, ly, 2.8*S, 0, Math.PI*2); ctx.fill();
      if (powered) { ctx.fillStyle = lamp; ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(lx, ly, 4.5*S, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.fillStyle = lamp; ctx.beginPath(); ctx.arc(lx, ly, 1.9*S, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    };
    // Label plate just outside the face, beside where the pipe comes in.
    const _stubLabel = (x, y, align, label, band, lit) => {
      ctx.font = `bold ${Math.max(6, 7*S)}px Courier New`;
      const tw = ctx.measureText(label).width, ph = 11*S, pw = tw + 9*S;
      const x0 = align === 'right' ? x - pw : x;
      ctx.fillStyle = 'rgba(12,10,6,0.82)'; ctx.strokeStyle = lit ? band : '#3a3020'; ctx.lineWidth = 0.8*S;
      ctx.beginPath(); ctx.roundRect(x0, y - ph/2, pw, ph, 1.5*S); ctx.fill(); ctx.stroke();
      ctx.fillStyle = band; ctx.fillRect(x0 + 2*S, y - ph/2 + 2*S, 2.5*S, ph - 4*S);
      ctx.fillStyle = lit ? '#f0e0c0' : 'rgba(170,150,110,0.8)';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(label, x0 + 6.5*S, y + 0.5*S);
      ctx.textBaseline = 'alphabetic';
    };
    const inFlow  = running;
    const outFlow = powered && outPiped && (e._fuelOil || 0) > 0.5;
    _stub(px, inY, 0, '#6a5438', 'rgba(200,170,120,0.85)', inPiped, inFlow, true);
    _stub(outX, py + h, -Math.PI/2, '#ffb040', 'rgba(255,220,140,0.9)', outPiped, outFlow, false);
    _stubLabel(px - 2*S, inY - 14*S, 'right', 'CRUDE IN', '#a07c4c', powered && inPiped);
    _stubLabel(outX + 11*S, py + h + 9*S, 'left', 'FUEL OUT', '#ffb040', powered && outPiped);
    if (lpgPort) {
      const lpgFlow = powered && lpgPiped && (e._lpg || 0) > 0.5;
      _stub(px + w, lpgY, Math.PI, '#ff7a5a', 'rgba(255,170,150,0.9)', lpgPiped, lpgFlow, false);
      _stubLabel(px + w + 2*S, lpgY - 14*S, 'left', 'LPG OUT', '#ff7a5a', powered && lpgPiped);
    }

    const statusText = e._decommissioned ? 'DECOMMISSIONED' : {
      running:    `REFINERY ${Math.round(fuelFill*100)}%`,
      no_crude:   'NO CRUDE',
      full:       'FUEL FULL',
      waste_full: 'SLUDGE FULL',
      offline:    'OFFLINE',
    }[status] || 'OFFLINE';
    const statusColor = { running: accent, no_crude: '#ff7040', full: '#ff9020', waste_full: '#ff3030', offline: '#8a7a50' }[status] || '#8a7a50';
    _wfPlate(statusText, px + w*0.66, py + h*0.035, S, statusColor, powered);
    ctx.restore();
  }
