/* ═══════════════════════════════════════════════════════════════════
   RENDER: HYDRO & COAL CHAINS
   Dam/hydro turbine/shaft/hydro generator chain, coal generator,
   coal deposit, and waste facilities (coal/oil/nuclear).
   ═══════════════════════════════════════════════════════════════════ */

function renderHydroGenerator(e, px, py, t) {
    // Hydroelectric Generator (7×7, rotatable). Drawn in a local frame with
    // the shaft input on -x and the transformer bay on +x (from
    // _inSideDc/_inSideDr): a concrete powerhouse floor; a brass drive shaft
    // on a pedestal bearing into a flanged coupling; the generator itself —
    // finned air coolers round a blue stator frame, a copper-poled rotor
    // spinning with _shaftRate seen between the arms of the upper bracket,
    // and an exciter dome with slip rings and a status lamp; bus ducts to a
    // gravel transformer bay (two finned units either side of a firewall)
    // feeding the live HV bus bar; a crane bridge on side rails; and a
    // control kiosk lit at night. Port and bay positions match the old
    // layout. Shadows and lighting stay world-aligned whatever the rotation.
    const tw = (e.width  || 7) * TILE;
    const th = (e.height || 7) * TILE;
    const cx = px + tw / 2, cy = py + th / 2;
    const on = e.powered;
    const rate = e._shaftRate || 0;
    const fuelled = on && rate > 0;
    const idc = e._inSideDc || 0, idr = e._inSideDr || 0;
    const horizInput = idc !== 0;
    const S = TILE / 40;
    const TAU = Math.PI * 2;
    const detail = Camera.zoom > 0.5;
    const dark = DayNight.darkness();
    const rot = idc < 0 ? 0 : idc > 0 ? Math.PI : idr > 0 ? -Math.PI / 2 : Math.PI / 2;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const toLocal = (x, y) => [x * cr + y * sr, -x * sr + y * cr];
    const [shX, shY] = toLocal(6 * S, 7 * S);
    const [lX, lY] = toLocal(-Math.SQRT1_2, -Math.SQRT1_2);   // toward the light (top-left on screen)
    const lit = (x, y, r, c0, c1) => { const g = ctx.createLinearGradient(x + lX * r, y + lY * r, x - lX * r, y - lY * r); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; };
    const rr = (x, y, w, h, r, fill, stroke, lw) => {
      ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
      if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || S; ctx.stroke(); }
    };
    const disc = (x, y, r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };

    const L = Math.min(tw, th) / 2;
    const inX = -L + 8;                               // shaft input port (same spot as before)
    const bayX = L - 18, bayHalf = L * 0.5;           // transformer bay centre / half-span
    const gX = -8 * S, R = L * 0.62;                  // generator centre and stator radius
    const tb = TILE * 0.34;                           // transformer half-size
    const tfY = [-bayHalf * 0.5, bayHalf * 0.5];
    const railY = L - 9 * S;

    if (fuelled && detail) {
      drawGlowHalo(cx, cy, Math.min(tw, th) * 0.55, [[0, '#20d4ff'], [1, 'transparent']], 0.12 + 0.05 * Math.sin(t * 1.5));
    }

    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(rot);

    // ── Powerhouse floor ──
    rr(-L + 3 * S + shX * 0.5, -L + 3 * S + shY * 0.5, 2 * L - 6 * S, 2 * L - 6 * S, 10 * S, 'rgba(0,0,0,0.28)');
    rr(-L + 3 * S, -L + 3 * S, 2 * L - 6 * S, 2 * L - 6 * S, 10 * S, lit(0, 0, L, '#cfcbc0', '#97938a'), '#5e5a52', 1.2 * S);
    if (detail) {
      ctx.save(); ctx.beginPath(); ctx.roundRect(-L + 3 * S, -L + 3 * S, 2 * L - 6 * S, 2 * L - 6 * S, 10 * S); ctx.clip();
      ctx.strokeStyle = 'rgba(70,66,58,0.22)'; ctx.lineWidth = 0.8 * S;
      ctx.beginPath();
      for (let k = -L + TILE; k < L; k += TILE) { ctx.moveTo(k, -L); ctx.lineTo(k, L); ctx.moveTo(-L, k); ctx.lineTo(L, k); }
      ctx.stroke();
      // oil and wear stains
      ctx.fillStyle = 'rgba(60,54,44,0.10)';
      [[-0.55, 0.42, 16], [0.30, -0.62, 11], [-0.62, -0.30, 9], [0.12, 0.70, 13]].forEach(([u, v, r]) => { ctx.beginPath(); ctx.ellipse(u * L, v * L, r * S, r * 0.6 * S, u * 2, 0, TAU); ctx.fill(); });
      ctx.restore();
      // painted walkway lines
      ctx.strokeStyle = 'rgba(224,170,40,0.55)'; ctx.lineWidth = 1.4 * S;
      ctx.setLineDash([7 * S, 5 * S]);
      ctx.beginPath(); ctx.roundRect(-L + 11 * S, -L + 15 * S, 2 * L - 22 * S, 2 * L - 30 * S, 6 * S); ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── Crane rails (the bridge itself is drawn last, overhead) ──
    for (const sgn of [-1, 1]) {
      const y = sgn * railY;
      ctx.fillStyle = '#4a4c50'; ctx.fillRect(-L + 6 * S, y - 2.2 * S, 2 * L - 12 * S, 4.4 * S);
      ctx.fillStyle = '#9aa0a6'; ctx.fillRect(-L + 6 * S, y - 0.8 * S, 2 * L - 12 * S, 1.6 * S);
      if (detail) { ctx.fillStyle = '#2a2c30'; for (let x = -L + 10 * S; x < L - 8 * S; x += 12 * S) ctx.fillRect(x, y - 2.2 * S, 1.2 * S, 4.4 * S); }
      // end stops
      ctx.fillStyle = '#d8a820'; ctx.fillRect(-L + 5 * S, y - 3 * S, 3 * S, 6 * S); ctx.fillRect(L - 8 * S, y - 3 * S, 3 * S, 6 * S);
    }

    // ── Drive shaft from the input port into the coupling ──
    const shEnd = gX - R - 6 * S;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 9 * S;
    ctx.beginPath(); ctx.moveTo(inX + shX * 0.5, shY * 0.5); ctx.lineTo(shEnd + shX * 0.5, shY * 0.5); ctx.stroke();
    ctx.strokeStyle = '#1a1410'; ctx.lineWidth = 9 * S;
    ctx.beginPath(); ctx.moveTo(inX, 0); ctx.lineTo(shEnd, 0); ctx.stroke();
    const shg = ctx.createLinearGradient(0, -3 * S, 0, 3 * S);
    shg.addColorStop(0, '#8a6a30'); shg.addColorStop(0.45, fuelled ? '#ffe090' : '#c0a060'); shg.addColorStop(1, '#5a4018');
    ctx.strokeStyle = shg; ctx.lineWidth = 6 * S; ctx.stroke();
    if (fuelled) {
      ctx.strokeStyle = 'rgba(60,40,10,0.7)';
      ctx.setLineDash([2 * S, 5 * S]); ctx.lineDashOffset = -t * 30 * S * rate;
      ctx.beginPath(); ctx.moveTo(inX, 0); ctx.lineTo(shEnd, 0); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    // pedestal bearing
    const bX = (inX + shEnd) / 2;
    rr(bX - 4 * S + shX * 0.4, -9 * S + shY * 0.4, 8 * S, 18 * S, 1.5 * S, 'rgba(0,0,0,0.3)');
    rr(bX - 4 * S, -9 * S, 8 * S, 18 * S, 1.5 * S, lit(bX, 0, 9 * S, '#f4c040', '#b07810'), '#4a3408', 0.8 * S);
    rr(bX - 3 * S, -4 * S, 6 * S, 8 * S, 1 * S, '#3a2a10');
    disc(bX, -6.5 * S, 1 * S, '#2a2c30'); disc(bX, 6.5 * S, 1 * S, '#2a2c30');
    // flanged coupling at the housing
    const fX = shEnd - 1 * S;
    rr(fX - 3 * S, -10 * S, 6 * S, 20 * S, 1.5 * S, lit(fX, 0, 10 * S, '#b8c0c8', '#5a6068'), '#22262a', 0.8 * S);
    if (detail) for (let k = 0; k < 4; k++) {
      const yy = Math.sin((fuelled ? t * 6 * rate : 0) + k * TAU / 4) * 7.5 * S;
      disc(fX, yy, 0.9 * S, '#22262a');
    }

    // ── Generator housing ──
    disc(gX + shX, shY, R + 10 * S, 'rgba(0,0,0,0.30)');
    disc(gX, 0, R + 10 * S, '#6c6a62');                                     // floor recess
    disc(gX, 0, R + 8.5 * S, lit(gX, 0, R, '#8e8b82', '#5e5c55'));
    ctx.strokeStyle = '#e0a020'; ctx.lineWidth = 1.6 * S;
    ctx.setLineDash([5 * S, 3.5 * S]); ctx.beginPath(); ctx.arc(gX, 0, R + 9.2 * S, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    // finned air coolers round the stator
    for (let k = 0; k < 8; k++) {
      const a = (k + 0.5) * TAU / 8;
      ctx.save(); ctx.translate(gX, 0); ctx.rotate(a);
      rr(R - 4 * S, -10 * S, 12 * S, 20 * S, 1.6 * S, '#45677a', '#16242c', 0.8 * S);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(R - 3 * S, -9 * S, 10 * S, 2 * S);
      if (detail) {
        ctx.strokeStyle = 'rgba(10,20,26,0.55)'; ctx.lineWidth = 0.6 * S;
        ctx.beginPath(); for (let y = -7 * S; y <= 7 * S; y += 2 * S) { ctx.moveTo(R - 1 * S, y); ctx.lineTo(R + 6 * S, y); } ctx.stroke();
        // cooling-water stubs
        disc(R + 6 * S, -7 * S, 1.3 * S, '#2a6a9a'); disc(R + 6 * S, 7 * S, 1.3 * S, '#2a6a9a');
      }
      ctx.restore();
    }
    // stator frame
    disc(gX, 0, R, lit(gX, 0, R, '#6aa2c4', '#24465c'));
    ctx.strokeStyle = '#122a38'; ctx.lineWidth = 1.2 * S; ctx.beginPath(); ctx.arc(gX, 0, R, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1 * S; ctx.beginPath(); ctx.arc(gX, 0, R - 2 * S, Math.PI * 0.9 - rot, Math.PI * 1.6 - rot); ctx.stroke();
    if (detail) {
      ctx.fillStyle = '#16303e';
      for (let k = 0; k < 32; k++) { const a = k * TAU / 32; ctx.beginPath(); ctx.arc(gX + Math.cos(a) * (R - 4 * S), Math.sin(a) * (R - 4 * S), 0.9 * S, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = 'rgba(10,26,36,0.45)'; ctx.lineWidth = 0.7 * S;
      ctx.beginPath(); ctx.arc(gX, 0, R * 0.90, 0, TAU); ctx.stroke();
    }
    // air gap + rotor
    const rr0 = R * 0.84;
    disc(gX, 0, rr0, '#0a1016');
    if (fuelled) {
      ctx.strokeStyle = `rgba(80,220,255,${0.35 + 0.25 * Math.sin(t * 3)})`; ctx.lineWidth = 1.6 * S;
      ctx.beginPath(); ctx.arc(gX, 0, rr0 - 1 * S, 0, TAU); ctx.stroke();
    }
    const rotA = fuelled ? t * (1.2 + rate * 2.2) : 0.2;
    ctx.save(); ctx.translate(gX, 0); ctx.rotate(rotA);
    // rotor rim
    ctx.strokeStyle = '#3a4048'; ctx.lineWidth = rr0 * 0.16;
    ctx.beginPath(); ctx.arc(0, 0, rr0 * 0.50, 0, TAU); ctx.stroke();
    for (let k = 0; k < 16; k++) {
      ctx.save(); ctx.rotate(k * TAU / 16);
      const x0 = rr0 * 0.56, pw = rr0 * 0.38, ph = rr0 * 0.17;
      const cg = ctx.createLinearGradient(0, -ph / 2, 0, ph / 2);
      cg.addColorStop(0, fuelled ? '#ffc890' : '#9a6a40'); cg.addColorStop(0.5, fuelled ? '#e88848' : '#7a4a24'); cg.addColorStop(1, fuelled ? '#a04e1c' : '#4a2c12');
      rr(x0, -ph / 2, pw, ph, 1.5 * S, cg);
      // pole shoe
      ctx.fillStyle = '#5a6068'; ctx.fillRect(x0 + pw - 2.2 * S, -ph / 2 - 0.8 * S, 2.2 * S, ph + 1.6 * S);
      if (detail) {
        ctx.strokeStyle = 'rgba(60,24,6,0.5)'; ctx.lineWidth = 0.5 * S;
        ctx.beginPath(); for (let x = x0 + 2 * S; x < x0 + pw - 3 * S; x += 1.8 * S) { ctx.moveTo(x, -ph / 2 + 0.6 * S); ctx.lineTo(x, ph / 2 - 0.6 * S); } ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
    // upper bracket arms over the rotor
    const hubR = R * 0.30;
    for (let k = 0; k < 6; k++) {
      const a = k * TAU / 6 + Math.PI / 6;
      ctx.save(); ctx.translate(gX, 0); ctx.rotate(a);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.moveTo(hubR * 0.8, -5 * S + 2 * S); ctx.lineTo(R * 0.9, -3 * S + 2 * S); ctx.lineTo(R * 0.9, 3 * S + 2 * S); ctx.lineTo(hubR * 0.8, 5 * S + 2 * S); ctx.fill();
      const ag = ctx.createLinearGradient(0, -5 * S, 0, 5 * S);
      ag.addColorStop(0, '#e4e8ec'); ag.addColorStop(0.5, '#b4bcc4'); ag.addColorStop(1, '#6a727a');
      ctx.fillStyle = ag; ctx.strokeStyle = '#2a3036'; ctx.lineWidth = 0.8 * S;
      ctx.beginPath(); ctx.moveTo(hubR * 0.8, -5 * S); ctx.lineTo(R * 0.9, -3 * S); ctx.lineTo(R * 0.9, 3 * S); ctx.lineTo(hubR * 0.8, 5 * S); ctx.closePath(); ctx.fill(); ctx.stroke();
      rr(R * 0.86, -4.5 * S, 6 * S, 9 * S, 1 * S, '#8a949c', '#2a3036', 0.7 * S);   // bolted foot on the stator
      ctx.restore();
    }
    // exciter dome
    disc(gX + 2 * S, 3 * S, hubR + 1 * S, 'rgba(0,0,0,0.35)');
    const dg = ctx.createRadialGradient(gX - hubR * 0.35, -hubR * 0.35, 1, gX, 0, hubR);
    dg.addColorStop(0, '#f2f4f6'); dg.addColorStop(0.6, '#a8b2ba'); dg.addColorStop(1, '#4e5862');
    disc(gX, 0, hubR, dg);
    ctx.strokeStyle = '#1e262c'; ctx.lineWidth = 1 * S; ctx.beginPath(); ctx.arc(gX, 0, hubR, 0, TAU); ctx.stroke();
    // slip rings with brush gear
    ctx.strokeStyle = '#b87a3a'; ctx.lineWidth = 1.6 * S; ctx.beginPath(); ctx.arc(gX, 0, hubR * 0.72, 0, TAU); ctx.stroke();
    if (detail) {
      ctx.save(); ctx.translate(gX, 0); ctx.rotate(rotA);
      ctx.fillStyle = '#2a3036';
      for (let k = 0; k < 6; k++) { ctx.rotate(TAU / 6); ctx.fillRect(hubR * 0.62, -1 * S, hubR * 0.2, 2 * S); }
      ctx.restore();
    }
    disc(gX, 0, hubR * 0.52, fuelled ? '#1a88b8' : '#2a4050');
    // painted bolt
    ctx.save(); ctx.translate(gX, 0); ctx.rotate(-rot); ctx.scale(hubR * 0.42, hubR * 0.42);
    ctx.beginPath();
    ctx.moveTo(0.15, -1); ctx.lineTo(-0.5, 0.12); ctx.lineTo(-0.05, 0.12); ctx.lineTo(-0.2, 1); ctx.lineTo(0.5, -0.16); ctx.lineTo(0.05, -0.16); ctx.closePath();
    ctx.fillStyle = fuelled ? `rgba(255,${230 + Math.round(25 * Math.sin(t * 5))},120,1)` : '#4a6a78'; ctx.fill();
    ctx.restore();
    // status lamp
    const lampCol = fuelled ? '#40ff70' : on ? (Math.sin(t * 4) > 0 ? '#ffb020' : '#6a4a10') : '#ff3020';
    disc(gX + hubR * 0.80 * Math.cos(-rot - Math.PI / 4), hubR * 0.80 * Math.sin(-rot - Math.PI / 4), 1.6 * S, lampCol);

    // ── Transformer bay ──
    const gravX0 = bayX - tb - 9 * S, gravX1 = L - 7 * S;
    rr(gravX0, -bayHalf - 6 * S, gravX1 - gravX0, 2 * bayHalf + 12 * S, 3 * S, '#8c887c', '#5a564c', 0.8 * S);
    if (detail) {
      ctx.fillStyle = 'rgba(50,46,40,0.35)';
      for (let k = 0; k < 70; k++) {
        const u = (k * 0.618034) % 1, v = (k * 0.381966 * 3.1) % 1;
        ctx.fillRect(gravX0 + u * (gravX1 - gravX0), -bayHalf - 5 * S + v * (2 * bayHalf + 10 * S), 1.1 * S, 1.1 * S);
      }
    }
    // bus ducts from the generator to each transformer
    for (const y of tfY) {
      const x0 = gX + Math.sqrt(Math.max(0, R * R - y * y)) - 3 * S;
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 7 * S;
      ctx.beginPath(); ctx.moveTo(x0 + shX * 0.5, y + shY * 0.5); ctx.lineTo(bayX - tb + shX * 0.5, y + shY * 0.5); ctx.stroke();
      ctx.strokeStyle = '#2a2e32'; ctx.lineWidth = 7 * S; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(bayX - tb, y); ctx.stroke();
      const bg = ctx.createLinearGradient(0, y - 3 * S, 0, y + 3 * S);
      bg.addColorStop(0, '#a8b0b6'); bg.addColorStop(0.5, '#d8dde0'); bg.addColorStop(1, '#6a7278');
      ctx.strokeStyle = bg; ctx.lineWidth = 5 * S; ctx.stroke();
      if (detail) { ctx.fillStyle = '#3a4046'; for (let x = x0 + 5 * S; x < bayX - tb - 2 * S; x += 7 * S) ctx.fillRect(x, y - 3.5 * S, 1 * S, 7 * S); }
    }
    // firewall between the units
    rr(bayX - tb - 3 * S + shX * 0.4, -2.5 * S + shY * 0.4, 2 * tb + 6 * S, 5 * S, 1 * S, 'rgba(0,0,0,0.3)');
    rr(bayX - tb - 3 * S, -2.5 * S, 2 * tb + 6 * S, 5 * S, 1 * S, '#d4d0c4', '#6a665c', 0.8 * S);
    for (const y of tfY) {
      const out = Math.sign(y);
      // radiator bank on the side away from the firewall
      const finY0 = y + out * tb, finY1 = y + out * (tb + 6 * S);
      rr(bayX - tb + 1 * S + shX * 0.5, Math.min(finY0, finY1) + shY * 0.5, 2 * tb - 2 * S, 6 * S, 0, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = '#4e5c4e'; ctx.fillRect(bayX - tb + 1 * S, Math.min(finY0, finY1), 2 * tb - 2 * S, 6 * S);
      ctx.strokeStyle = 'rgba(16,22,16,0.7)'; ctx.lineWidth = 0.7 * S;
      ctx.beginPath(); for (let x = bayX - tb + 2.5 * S; x < bayX + tb - 1 * S; x += 2 * S) { ctx.moveTo(x, finY0); ctx.lineTo(x, finY1); } ctx.stroke();
      // tank
      rr(bayX - tb + shX * 0.6, y - tb + shY * 0.6, 2 * tb, 2 * tb, 2 * S, 'rgba(0,0,0,0.32)');
      rr(bayX - tb, y - tb, 2 * tb, 2 * tb, 2 * S, lit(bayX, y, tb, '#7c8e7a', '#47554a'), '#1a221a', S);
      // conservator tank across the firewall side
      const cyy = y - out * (tb - 3.5 * S);
      rr(bayX - tb * 0.8, cyy - 2.5 * S, tb * 1.6, 5 * S, 2.5 * S, '#6a7a68', '#1a221a', 0.7 * S);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(bayX - tb * 0.7, cyy - 1.8 * S, tb * 1.4, 1.2 * S);
      // HV bushings
      for (let i = 0; i < 3; i++) {
        const bxx = bayX - tb * 0.55 + i * tb * 0.55, byy = y + out * tb * 0.25;
        disc(bxx + 1 * S, byy + 1.2 * S, 2.6 * S, 'rgba(0,0,0,0.35)');
        disc(bxx, byy, 2.6 * S, '#8a4a2a');
        disc(bxx, byy, 1.7 * S, '#c8704a');
        disc(bxx - 0.5 * S, byy - 0.5 * S, 0.7 * S, '#f0b090');
        if (fuelled && Math.sin(t * 12 + i * 2 + y) > 0.9) {
          ctx.strokeStyle = 'rgba(190,240,255,0.95)'; ctx.lineWidth = 0.9 * S;
          ctx.beginPath(); ctx.moveTo(bxx, byy); ctx.lineTo(bxx + 3 * S, byy - 3 * S); ctx.lineTo(bxx + 1 * S, byy - 6 * S); ctx.stroke();
        }
      }
      // droppers to the bus bar
      ctx.strokeStyle = fuelled ? 'rgba(120,220,255,0.75)' : '#4a5a64'; ctx.lineWidth = 0.9 * S;
      ctx.beginPath(); ctx.moveTo(bayX + tb * 0.55, y + out * tb * 0.25); ctx.lineTo(L - 4 * S, y + out * tb * 0.25); ctx.stroke();
    }
    // HV bus bar on insulator posts
    const barX = L - 4 * S, barH = bayHalf * 0.9;
    if (detail) for (const y of [-barH, -barH / 3, barH / 3, barH]) { disc(barX, y, 2.2 * S, '#d8d4c8'); disc(barX, y, 1.2 * S, '#7a766c'); }
    ctx.strokeStyle = fuelled ? `rgba(48,212,255,${0.6 + 0.3 * Math.sin(t * 4)})` : '#2a4050'; ctx.lineWidth = 2 * S;
    ctx.beginPath(); ctx.moveTo(barX, -barH); ctx.lineTo(barX, barH); ctx.stroke();
    if (fuelled) for (let i = 0; i < 3; i++) {
      const ph = (t * 1.5 * rate + i * 0.33) % 1;
      disc(barX, -barH + ph * barH * 2, 2 * S, `rgba(160,240,255,${(1 - ph) * 0.9})`);
    }

    // ── Control kiosk ──
    const kX = bayX - tb - 10 * S, kY = L - 46 * S, kW = 32 * S, kH = 22 * S;
    rr(kX + shX * 0.6, kY + shY * 0.6, kW, kH, 2 * S, 'rgba(0,0,0,0.3)');
    rr(kX, kY, kW, kH, 2 * S, lit(kX + kW / 2, kY + kH / 2, kW / 2, '#e8e4da', '#a8a49a'), '#4a4840', S);
    rr(kX + 2 * S, kY + 2 * S, kW - 4 * S, kH - 4 * S, 1.5 * S, null, 'rgba(60,58,52,0.35)', 0.7 * S);
    ctx.fillStyle = '#5a6066'; ctx.fillRect(kX + kW - 9 * S, kY + 4 * S, 5 * S, 4 * S);   // roof AC unit
    const winLit = dark > 0.3 || fuelled;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = winLit ? `rgba(255,${dark > 0.3 ? 220 : 240},${dark > 0.3 ? 140 : 200},${0.55 + 0.4 * dark})` : '#3a4a58';
      ctx.fillRect(kX + 4 * S + i * 7 * S, kY + kH - 4 * S, 5 * S, 2.4 * S);
    }
    if (dark > 0.3 && detail) {
      for (const [lx, ly] of [[-L + 12 * S, -L + 12 * S], [-L + 12 * S, L - 12 * S], [L - 12 * S, -L + 12 * S]]) {
        const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 16 * S);
        g.addColorStop(0, `rgba(255,230,160,${0.45 * dark})`); g.addColorStop(1, 'rgba(255,230,160,0)');
        disc(lx, ly, 16 * S, g); disc(lx, ly, 1.5 * S, '#fff2c0');
      }
    }

    // ── Crane bridge (overhead), parked between the stator and the bay ──
    const brX = gX + R + 13 * S + (fuelled ? Math.sin(t * 0.25) * 2.5 * S : 0);
    rr(brX - 4 * S + shX, -railY - 3 * S + shY, 8 * S, 2 * railY + 6 * S, 1 * S, 'rgba(0,0,0,0.25)');
    rr(brX - 4 * S, -railY - 3 * S, 8 * S, 2 * railY + 6 * S, 1 * S, '#d8a820', '#4a3a10', S);
    if (detail) {
      ctx.strokeStyle = 'rgba(70,50,0,0.55)'; ctx.lineWidth = 0.7 * S;
      ctx.beginPath(); for (let y = -railY; y < railY - 4 * S; y += 6 * S) { ctx.moveTo(brX - 4 * S, y); ctx.lineTo(brX + 4 * S, y + 4 * S); } ctx.stroke();
    }
    rr(brX - 6 * S, -railY - 4 * S, 12 * S, 6 * S, 1 * S, '#6a5a20');
    rr(brX - 6 * S, railY - 2 * S, 12 * S, 6 * S, 1 * S, '#6a5a20');
    const trY = (fuelled ? Math.sin(t * 0.4) : -0.4) * railY * 0.55;
    rr(brX - 6 * S, trY - 5 * S, 12 * S, 10 * S, 1.5 * S, '#3a3a34', '#151512', 0.8 * S);
    disc(brX, trY, 2 * S, '#8a8a80');

    // ── Shaft input hub ──
    ctx.save(); ctx.translate(inX, 0);
    if (detail) {
      const portGlow = fuelled ? 0.7 + 0.25 * Math.sin(t * 4) : 0.25;
      const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, 14 * S);
      hg.addColorStop(0, `rgba(224,160,32,${portGlow})`); hg.addColorStop(1, 'rgba(224,160,32,0)');
      disc(0, 0, 14 * S, hg);
    }
    if (fuelled) ctx.rotate(t * 4 * rate);
    disc(0, 0, 5 * S, fuelled ? '#ffc040' : '#604018');
    ctx.strokeStyle = '#1a0e00'; ctx.lineWidth = 1.5 * S;
    ctx.beginPath(); ctx.arc(0, 0, 5 * S, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4 * S, 0); ctx.lineTo(4 * S, 0); ctx.moveTo(0, -4 * S); ctx.lineTo(0, 4 * S); ctx.stroke();
    ctx.restore();

    ctx.restore();

    const lbl = fuelled ? `HYDRO  ${formatPower(Math.round(e.def.powerOutput))}` : on ? 'NO SHAFT' : 'OFFLINE';
    const plateY = (!horizInput && idr < 0) ? py + 12 * S : py + th - 10 * S;
    const plateX = (horizInput) ? cx : cx + tw * 0.25;
    ctx.save();
    _wfPlate(lbl, plateX, plateY, S, fuelled ? '#40d8ff' : '#6a8a98', true);
    if (InspectionPanel.isOpen() && InspectionPanel.target === e) {
      ctx.strokeStyle = '#20d4ff'; ctx.lineWidth = 2 / Camera.zoom;
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 4);
      ctx.strokeRect(px + 1, py + 1, tw - 2, th - 2);
    }
    ctx.restore();
    drawNetworkHighlight(e, px, py, t);
  }

function renderDam(e, px, py, t) {
    // Concrete gravity dam across the river span: railed crest walkway with
    // lamp posts, rusty sluice gates, reservoir shimmer on the upstream face,
    // white spillway water rushing off the downstream face, and a level
    // gauge on the crest when linked to a reservoir.
    const tw = e.width  * TILE;
    const th = e.height * TILE;
    const horizontal = e._flowDr !== 0;
    const S = TILE / 40;
    const cx = px + tw / 2, cy = py + th / 2;
    const res = (typeof ReservoirSystem !== 'undefined') ? ReservoirSystem.getReservoir(e._reservoirId) : null;
    const fill = res && res.capacity > 0 ? res.waterLevel / res.capacity : 0;
    const L = horizontal ? tw : th, D = horizontal ? th : tw;
    ctx.save();
    // local frame: x along the span, y across it (reservoir face at y=0)
    ctx.translate(cx, cy);
    if (!horizontal) ctx.rotate(Math.PI/2);
    // Default: reservoir face is the upstream bank (against flow). R /
    // _reservoirSide === 'downstream' flips the face to the opposite bank.
    let upSign = horizontal ? (e._flowDr > 0 ? 1 : -1) : (e._flowDc > 0 ? 1 : -1);
    if (e._reservoirSide === 'downstream') upSign = -upSign;
    ctx.scale(1, upSign);
    const x0 = -L/2, y0 = -D/2;

    // upstream reservoir face
    const ug = ctx.createLinearGradient(0, y0, 0, y0 + D*0.25);
    ug.addColorStop(0, `rgba(40,120,190,${0.55 + 0.1*Math.sin(t*1.5)})`); ug.addColorStop(1, 'rgba(40,120,190,0)');
    ctx.fillStyle = ug; ctx.fillRect(x0, y0, L, D*0.25);
    // dam body
    const bg = ctx.createLinearGradient(0, y0 + D*0.12, 0, y0 + D*0.95);
    bg.addColorStop(0, '#d8d4c8'); bg.addColorStop(0.35, '#b8b2a4'); bg.addColorStop(1, '#6a665c');
    ctx.fillStyle = bg; ctx.fillRect(x0 + 1*S, y0 + D*0.12, L - 2*S, D*0.83);
    ctx.strokeStyle = 'rgba(60,56,48,0.35)'; ctx.lineWidth = S;
    const segs = Math.max(2, Math.round(L / (TILE*0.75)));
    for (let i = 1; i < segs; i++) { const x = x0 + L*i/segs; ctx.beginPath(); ctx.moveTo(x, y0 + D*0.14); ctx.lineTo(x, y0 + D*0.94); ctx.stroke(); }
    // crest walkway + railings
    ctx.fillStyle = '#e8e4da'; ctx.fillRect(x0 + 1*S, y0 + D*0.16, L - 2*S, D*0.20);
    ctx.strokeStyle = '#5a5a5e'; ctx.lineWidth = 0.9*S;
    [y0 + D*0.16, y0 + D*0.36].forEach(y => { ctx.beginPath(); ctx.moveTo(x0 + 2*S, y); ctx.lineTo(x0 + L - 2*S, y); ctx.stroke(); });
    for (let x = x0 + 4*S; x < x0 + L - 2*S; x += 5*S) { ctx.beginPath(); ctx.moveTo(x, y0 + D*0.16); ctx.lineTo(x, y0 + D*0.14); ctx.stroke(); }
    // lamp posts
    for (let i = 0; i < segs; i++) {
      const lx = x0 + L*(i + 0.5)/segs, ly = y0 + D*0.26;
      ctx.fillStyle = '#3a3a3e'; ctx.beginPath(); ctx.arc(lx, ly, 1.3*S, 0, Math.PI*2); ctx.fill();
      const dark = DayNight.darkness();
      if (dark > 0.3) { ctx.fillStyle = `rgba(255,230,150,${0.35*dark})`; ctx.beginPath(); ctx.arc(lx, ly, 5*S, 0, Math.PI*2); ctx.fill(); }
    }
    // sluice gates on the downstream face
    const gates = Math.max(1, segs - 1);
    const gW = Math.min(L/(gates*2), TILE*0.45);
    for (let i = 0; i < gates; i++) {
      const gx = x0 + L*(i + 1)/(gates + 1) - gW/2, gy = y0 + D*0.46, gh = D*0.30;
      ctx.fillStyle = '#3a3634'; ctx.fillRect(gx - 1.5*S, gy - 1.5*S, gW + 3*S, gh + 3*S);
      const rg = ctx.createLinearGradient(0, gy, 0, gy + gh);
      rg.addColorStop(0, '#8a5a38'); rg.addColorStop(1, '#5a3a24');
      ctx.fillStyle = rg; ctx.fillRect(gx, gy, gW, gh);
      ctx.strokeStyle = 'rgba(30,18,10,0.5)'; ctx.lineWidth = 0.8*S;
      for (let k = 1; k < 3; k++) { const y = gy + gh*k/3; ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + gW, y); ctx.stroke(); }
    }
    // spillway whitewater downstream
    const sp = y0 + D*0.93;
    for (let i = 0; i < Math.max(4, Math.round(L/(6*S))); i++) {
      const p = (t*1.2 + i*0.37) % 1;
      const x = x0 + L*((i*0.618) % 1);
      ctx.fillStyle = `rgba(240,250,255,${0.65*(1 - p)})`;
      ctx.beginPath(); ctx.arc(x, sp + p*D*0.12, (1 + p*2)*S, 0, Math.PI*2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(230,245,255,0.55)'; ctx.fillRect(x0 + 1*S, y0 + D*0.90, L - 2*S, D*0.06);

    // level gauge
    if (res) {
      const barLen = Math.max(10*S, L*0.35);
      const bx = -barLen/2, by = y0 + D*0.23;
      ctx.fillStyle = '#10181e'; ctx.fillRect(bx - 1*S, by - 1*S, barLen + 2*S, 4.5*S);
      ctx.fillStyle = fill < 0.15 ? '#ff6040' : '#40c8ff';
      ctx.fillRect(bx, by, barLen*Math.max(0, Math.min(1, fill)), 2.5*S);
    }
    ctx.restore();
  }

function renderHydroTurbine(e, px, py, t) {
    // Hydro Turbine (5×5, in the reservoir). Drawn in a local frame with the
    // water arriving from -y (from _flowDc/_flowDr): pier noses split the
    // inflow into three intake bays behind trash racks, under a stop-log
    // gantry crane; the left bay feeds a steel spiral scroll case wrapped
    // round the turbine pit, where a ring of wicket gates (opening with
    // _fillFrac) guides water onto the spinning Kaplan runner under a glass
    // hatch; two draft-tube outlets in the tailrace wall throw whitewater
    // downstream. Deck kit: handrails, governor cabinet, oil accumulator,
    // a control hut and corner lamps that light at night. The brass output
    // shaft runs off the _outSide face to the same port as before.
    const tw = (e.width  || 5) * TILE;
    const th = (e.height || 5) * TILE;
    const cx = px + tw / 2, cy = py + th / 2;
    const on = e.powered;
    const fuelled = on && e._fuelled;
    const fillFrac = e._fillFrac || 0;
    const fdc = e._flowDc || 0, fdr = e._flowDr || 0;
    const hasFlow = fdc !== 0 || fdr !== 0;
    const S = TILE / 40;
    const TAU = Math.PI * 2;
    const detail = Camera.zoom > 0.5;
    const dark = DayNight.darkness();

    // ── Water beneath the footprint ──
    // buildTurbine() removes the water entities it sits on (restored on
    // delete), so nothing else paints those tiles and the ground shows
    // through around the powerhouse. Repaint them from the captured
    // _waterTiles using lightweight stubs cached on the turbine.
    if (e._waterTiles && e._waterTiles.length) {
      if (!e._waterStubs) {
        const inFoot = new Set(e._waterTiles.map(w => w.c + ',' + w.r));
        const wet = (c, r) => inFoot.has(c + ',' + r) || WaterSystem.isWater(c, r);
        e._waterStubs = e._waterTiles.map(w => {
          let mask = 0;
          if (!wet(w.c, w.r - 1)) mask |= 1;
          if (!wet(w.c, w.r + 1)) mask |= 2;
          if (!wet(w.c - 1, w.r)) mask |= 4;
          if (!wet(w.c + 1, w.r)) mask |= 8;
          return { col: w.c, row: w.r, _reservoirId: e._reservoirId, _isRiver: w.isRiver, _shoreMask: mask };
        });
      }
      for (const w of e._waterStubs) {
        const { x, y } = GridManager.tileToWorld(w.col, w.row);
        renderWater(w, x, y, t);
      }
    }

    const rot = fdr < 0 ? Math.PI : fdc > 0 ? -Math.PI / 2 : fdc < 0 ? Math.PI / 2 : 0;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const toLocal = (x, y) => [x * cr + y * sr, -x * sr + y * cr];
    const [shX, shY] = toLocal(6 * S, 7 * S);
    const [lX, lY] = toLocal(-Math.SQRT1_2, -Math.SQRT1_2);   // toward the light (top-left on screen)
    const lit = (x, y, r, c0, c1) => { const g = ctx.createLinearGradient(x + lX * r, y + lY * r, x - lX * r, y - lY * r); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; };
    const rr = (x, y, w, h, r, fill, stroke, lw) => {
      ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
      if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || S; ctx.stroke(); }
    };
    const disc = (x, y, r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };

    const L = Math.min(tw, th) / 2;
    const B = L * 0.80;                               // powerhouse half-size
    const B0 = cx - B, B1 = cx + B;                   // world-space block edges (square, so x and y agree)
    const by = cy - B, bh = 2 * B;
    const intakeD = 20 * S;                           // depth of the intake bays
    const piers = [-B, -B / 3, B / 3, B];
    const pierW = 7 * S;
    const pY = 6 * S, wr = 32 * S;                    // turbine pit centre (local y) and radius
    const scW = 15 * S;                               // scroll-case width at its inlet

    ctx.save();

    // ── Water ripples around the structure ──
    for (let k = 0; k < 2; k++) {
      const p = (t * 0.25 + k * 0.5) % 1;
      ctx.strokeStyle = `rgba(200,235,255,${0.3 * (1 - p)})`; ctx.lineWidth = 1.2 * S;
      ctx.beginPath(); ctx.roundRect(cx - B - 4 * S - p * 8 * S, cy - B - 4 * S - p * 8 * S, 2 * B + 8 * S + p * 16 * S, 2 * B + 8 * S + p * 16 * S, 8 * S); ctx.stroke();
    }
    if (fuelled && detail) drawGlowHalo(cx, cy, tw * 0.55, [[0, '#30d4ff'], [1, 'transparent']], 0.12 + 0.07 * Math.sin(t * 2));

    ctx.translate(cx, cy); ctx.rotate(rot);

    // ── Inflow drawn toward the intake bays ──
    if (hasFlow && fuelled) {
      ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const p = (t * 0.6 + i * 0.37) % 1;
        const bay = i % 3, bayC = (piers[bay] + piers[bay + 1]) / 2;
        const sx = bayC + (((i * 0.618) % 1) - 0.5) * B * 1.3;
        const y = -L - 4 * S + p * (L - B + 4 * S);
        const x = sx + (bayC - sx) * p;
        ctx.strokeStyle = `rgba(220,245,255,${0.45 * Math.sin(p * Math.PI)})`; ctx.lineWidth = 1.1 * S;
        ctx.beginPath(); ctx.moveTo(x, y - 5 * S); ctx.lineTo(x + (bayC - sx) * 0.05, y); ctx.stroke();
      }
    }

    // ── Powerhouse block ──
    rr(-B + shX, -B + shY, 2 * B, 2 * B, 5 * S, 'rgba(0,0,0,0.32)');
    rr(-B, -B, 2 * B, 2 * B, 5 * S, lit(0, 0, B, '#d8d4c8', '#8e8a7e'));
    ctx.strokeStyle = fuelled ? `rgba(48,212,255,${0.55 + 0.2 * Math.sin(t * 2.5)})` : '#4a4a44'; ctx.lineWidth = 1.4 * S; ctx.stroke();
    if (detail) {
      ctx.strokeStyle = 'rgba(60,56,48,0.25)'; ctx.lineWidth = 0.8 * S;
      ctx.beginPath();
      for (let k = 1; k < 4; k++) { const x = -B + 2 * B * k / 4; ctx.moveTo(x, -B + intakeD + 2 * S); ctx.lineTo(x, B - 3 * S); }
      ctx.stroke();
      // water staining along the wet faces
      const sg = ctx.createLinearGradient(0, B - 8 * S, 0, B);
      sg.addColorStop(0, 'rgba(40,60,50,0)'); sg.addColorStop(1, 'rgba(40,60,50,0.35)');
      ctx.fillStyle = sg; ctx.fillRect(-B, B - 8 * S, 2 * B, 8 * S);
    }

    // ── Intake bays: dark water behind trash racks ──
    for (let b = 0; b < 3; b++) {
      const x0 = piers[b] + pierW / 2, x1 = piers[b + 1] - pierW / 2;
      const wg = ctx.createLinearGradient(0, -B, 0, -B + intakeD);
      wg.addColorStop(0, fuelled ? '#2a7ab4' : '#204a6a'); wg.addColorStop(1, '#0a1c2a');
      ctx.fillStyle = wg; ctx.fillRect(x0, -B, x1 - x0, intakeD);
      if (fuelled) {
        ctx.strokeStyle = 'rgba(200,240,255,0.35)'; ctx.lineWidth = 0.8 * S;
        const off = (t * 14 * S * (0.5 + fillFrac)) % (6 * S);
        ctx.beginPath(); for (let y = -B + off; y < -B + intakeD; y += 6 * S) { ctx.moveTo(x0 + 3 * S, y); ctx.lineTo(x1 - 3 * S, y); } ctx.stroke();
      }
      // rack
      ctx.fillStyle = '#4a4c50'; ctx.fillRect(x0, -B + 3 * S, x1 - x0, 1.6 * S); ctx.fillRect(x0, -B + 9 * S, x1 - x0, 1.6 * S);
      ctx.strokeStyle = '#2a2c30'; ctx.lineWidth = 0.9 * S;
      ctx.beginPath(); for (let x = x0 + 2 * S; x < x1 - 1 * S; x += 2.6 * S) { ctx.moveTo(x, -B + 2 * S); ctx.lineTo(x, -B + 12 * S); } ctx.stroke();
      // a little trapped debris
      if (detail && b !== 1) { ctx.fillStyle = 'rgba(90,70,40,0.8)'; ctx.fillRect(x0 + (x1 - x0) * (0.3 + b * 0.2), -B + 1 * S, 4 * S, 1.4 * S); }
    }
    // pier noses
    for (const x of piers) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.roundRect(x - pierW / 2 + shX * 0.5, -B - 9 * S + shY * 0.5, pierW, intakeD + 9 * S, [pierW / 2, pierW / 2, 0, 0]); ctx.fill();
      rr(x - pierW / 2, -B - 9 * S, pierW, intakeD + 9 * S, [pierW / 2, pierW / 2, 0, 0], lit(x, -B, pierW, '#e0dcd0', '#9a968a'), '#5e5a52', 0.8 * S);
      if (hasFlow && fuelled) {
        ctx.strokeStyle = `rgba(240,250,255,${0.5 + 0.2 * Math.sin(t * 4 + x)})`; ctx.lineWidth = 1 * S;
        ctx.beginPath(); ctx.arc(x, -B - 9 * S + pierW / 2, pierW / 2 + 1.5 * S, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      }
    }
    // intake deck edge
    ctx.fillStyle = '#6a665c'; ctx.fillRect(-B, -B + intakeD, 2 * B, 1.6 * S);

    // ── Scroll case: one tapered steel pipe. The penstock drops from the left
    // bay and bends straight on into a spiral that wraps the pit (the way the
    // water turns) and narrows to nothing, shaded as a round pipe ──
    const rIn = wr + 3 * S, yTop = -B + intakeD - 1 * S;
    const cl = [];   // centreline samples: position, width, outward normal
    for (let i = 0; i <= 10; i++) {
      const u = i / 10, w = scW * (1.2 - 0.2 * u);
      cl.push({ x: -(rIn + w / 2), y: yTop + (pY - yTop) * u, w, nx: -1, ny: 0 });
    }
    const nS = 44, sweep = Math.PI * 1.72;
    for (let i = 1; i <= nS; i++) {
      const u = i / nS, a = Math.PI - sweep * u, w = scW * (1 - 0.88 * u), r = rIn + w / 2;
      cl.push({ x: Math.cos(a) * r, y: pY + Math.sin(a) * r, w, nx: Math.cos(a), ny: Math.sin(a) });
    }
    // the band between offsets o0..o1 (fractions of the width, + = outward)
    const strip = (o0, o1, grow) => {
      ctx.beginPath();
      for (let i = 0; i < cl.length; i++) { const p = cl[i], o = o1 * p.w + grow; i ? ctx.lineTo(p.x + p.nx * o, p.y + p.ny * o) : ctx.moveTo(p.x + p.nx * o, p.y + p.ny * o); }
      for (let i = cl.length - 1; i >= 0; i--) { const p = cl[i], o = o0 * p.w - grow; ctx.lineTo(p.x + p.nx * o, p.y + p.ny * o); }
      ctx.closePath();
    };
    ctx.save(); ctx.translate(shX * 0.5, shY * 0.5); ctx.fillStyle = 'rgba(0,0,0,0.3)'; strip(-0.5, 0.5, 1 * S); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#1a1c20'; strip(-0.5, 0.5, 1.1 * S); ctx.fill();
    ctx.fillStyle = '#98a2ac'; strip(-0.5, 0.5, 0); ctx.fill();
    ctx.fillStyle = 'rgba(20,28,36,0.30)'; strip(-0.5, -0.22, 0); ctx.fill();
    ctx.fillStyle = 'rgba(20,28,36,0.22)'; strip(0.36, 0.5, 0); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.40)'; strip(0.02, 0.20, 0); ctx.fill();
    if (detail) {
      // flange rings along the pipe
      ctx.strokeStyle = 'rgba(30,34,40,0.55)'; ctx.lineWidth = 0.8 * S;
      ctx.beginPath();
      for (let i = 3; i < cl.length - 3; i += 4) { const p = cl[i]; ctx.moveTo(p.x - p.nx * p.w / 2, p.y - p.ny * p.w / 2); ctx.lineTo(p.x + p.nx * p.w / 2, p.y + p.ny * p.w / 2); }
      ctx.stroke();
    }
    // penstock gate (opens with the flow)
    const gateOpen = fuelled ? 0.3 + 0.7 * fillFrac : 0;
    rr(-(rIn + scW * 1.2) - 3 * S, yTop - gateOpen * 4 * S, scW * 1.2 + 6 * S, 4 * S, 1 * S, '#8a5a38', '#3a2414', 0.8 * S);

    // ── Turbine pit: wicket gates round the Kaplan runner ──
    disc(0, pY, wr + 3 * S, '#3a4048');
    if (detail) { ctx.fillStyle = '#1a1e24'; for (let k = 0; k < 20; k++) { const a = k * TAU / 20; ctx.beginPath(); ctx.arc(Math.cos(a) * (wr + 1.5 * S), pY + Math.sin(a) * (wr + 1.5 * S), 0.7 * S, 0, TAU); ctx.fill(); } }
    disc(0, pY, wr, fuelled ? '#0c2a3e' : '#0a1822');
    const open = fuelled ? 0.25 + 0.75 * fillFrac : 0.05;
    ctx.fillStyle = fuelled ? '#a8b4bc' : '#5a666e';
    for (let k = 0; k < 16; k++) {
      const a = k * TAU / 16, gr = wr * 0.86;
      ctx.save(); ctx.translate(Math.cos(a) * gr, pY + Math.sin(a) * gr); ctx.rotate(a + Math.PI / 2 - open * 0.9);
      ctx.beginPath(); ctx.ellipse(0, 0, wr * 0.17, 1.2 * S, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // swirl in the pit
    if (fuelled) {
      ctx.save(); ctx.translate(0, pY); ctx.rotate(t * (0.8 + fillFrac * 1.5));
      ctx.strokeStyle = 'rgba(140,220,255,0.28)'; ctx.lineWidth = 1.2 * S;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(0, 0, wr * (0.5 + k * 0.1), k * 2.1, k * 2.1 + 1.4); ctx.stroke(); }
      ctx.restore();
    }
    const ru = wr * 0.70;
    ctx.save(); ctx.translate(0, pY); if (fuelled) ctx.rotate(t * (1.0 + fillFrac * 2.5));
    for (let i = 0; i < 5; i++) {
      ctx.rotate(TAU / 5);
      const bg2 = ctx.createLinearGradient(0, 0, ru, 0);
      bg2.addColorStop(0, fuelled ? '#d8f4ff' : '#4a6070'); bg2.addColorStop(1, fuelled ? '#3aa8d8' : '#1a3040');
      ctx.fillStyle = bg2;
      ctx.beginPath(); ctx.moveTo(ru * 0.25, -ru * 0.10); ctx.quadraticCurveTo(ru * 0.7, -ru * 0.50, ru * 0.98, -ru * 0.18); ctx.quadraticCurveTo(ru * 0.75, ru * 0.06, ru * 0.25, ru * 0.12); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(10,30,44,0.6)'; ctx.lineWidth = 0.6 * S; ctx.stroke();
    }
    ctx.restore();
    const hg = ctx.createRadialGradient(-ru * 0.08, pY - ru * 0.08, 0.5, 0, pY, ru * 0.30);
    hg.addColorStop(0, fuelled ? '#ffffff' : '#6a8090'); hg.addColorStop(1, fuelled ? '#7ab8d0' : '#22384a');
    disc(0, pY, ru * 0.30, hg);
    ctx.strokeStyle = '#0a1822'; ctx.lineWidth = 0.8 * S; ctx.beginPath(); ctx.arc(0, pY, ru * 0.30, 0, TAU); ctx.stroke();
    // glass hatch: frame + glare
    ctx.strokeStyle = fuelled ? 'rgba(48,212,255,0.7)' : 'rgba(40,80,110,0.6)'; ctx.lineWidth = 1.6 * S;
    ctx.beginPath(); ctx.arc(0, pY, wr, 0, TAU); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.arc(0, pY, wr, 0, TAU); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.beginPath(); ctx.ellipse(lX * wr * 0.45, pY + lY * wr * 0.45, wr * 0.42, wr * 0.16, Math.atan2(lY, lX) + Math.PI / 2, 0, TAU); ctx.fill();
    ctx.restore();

    // ── Tailrace wall with two draft-tube outlets ──
    const outs = [-B * 0.42, B * 0.42], ow = 24 * S;
    ctx.fillStyle = '#7a766c'; ctx.fillRect(-B, B - 12 * S, 2 * B, 1.4 * S);
    for (const ox of outs) {
      rr(ox - ow / 2, B - 8 * S, ow, 8 * S, [3 * S, 3 * S, 0, 0], '#1a1c20');
      if (fuelled) {
        const fg = ctx.createLinearGradient(0, B - 8 * S, 0, B);
        fg.addColorStop(0, 'rgba(120,200,240,0.2)'); fg.addColorStop(1, 'rgba(220,245,255,0.75)');
        ctx.fillStyle = fg; ctx.fillRect(ox - ow / 2 + 1.5 * S, B - 6 * S, ow - 3 * S, 6 * S);
      }
    }
    if (hasFlow && fuelled) {
      for (const ox of outs) {
        for (let i = 0; i < 9; i++) {
          const p = (t * 1.4 + i * 0.111 + (ox > 0 ? 0.5 : 0)) % 1;
          const sx = ox + Math.sin(i * 2.7 + t * 2) * ow * 0.45 * (0.3 + p);
          disc(sx, B + p * (L - B + TILE * 0.9), (1.4 + p * 3.4) * S, `rgba(240,250,255,${0.75 * (1 - p)})`);
        }
        // spreading foam line
        ctx.strokeStyle = `rgba(230,245,255,${0.35 + 0.1 * Math.sin(t * 3 + ox)})`; ctx.lineWidth = 1.2 * S;
        ctx.beginPath(); ctx.ellipse(ox, B + 2 * S, ow * 0.6, 4 * S, 0, 0, Math.PI); ctx.stroke();
      }
    }

    // ── Deck kit ──
    // governor cabinet with a gauge
    const gvX = B - 24 * S, gvY = -B + intakeD + 8 * S;
    rr(gvX + shX * 0.4, gvY + shY * 0.4, 16 * S, 11 * S, 1.5 * S, 'rgba(0,0,0,0.3)');
    rr(gvX, gvY, 16 * S, 11 * S, 1.5 * S, lit(gvX + 8 * S, gvY + 5 * S, 9 * S, '#9aa8b0', '#56626a'), '#1e262c', 0.8 * S);
    disc(gvX + 5 * S, gvY + 5.5 * S, 3 * S, '#e8ecec');
    ctx.strokeStyle = '#c02010'; ctx.lineWidth = 0.8 * S;
    const ga = -Math.PI * 0.8 + (fuelled ? fillFrac * Math.PI * 0.9 + 0.05 * Math.sin(t * 3) : 0);
    ctx.beginPath(); ctx.moveTo(gvX + 5 * S, gvY + 5.5 * S); ctx.lineTo(gvX + 5 * S + Math.cos(ga) * 2.4 * S, gvY + 5.5 * S + Math.sin(ga) * 2.4 * S); ctx.stroke();
    disc(gvX + 12 * S, gvY + 3.5 * S, 1.2 * S, fuelled ? '#40ff70' : on ? '#ffb020' : '#ff3020');
    // oil-pressure accumulator
    const oaX = B - 14 * S, oaY = pY + 6 * S;
    disc(oaX + shX * 0.4, oaY + shY * 0.4, 7 * S, 'rgba(0,0,0,0.3)');
    const og = ctx.createRadialGradient(oaX - 2 * S, oaY - 2 * S, 0.5, oaX, oaY, 7 * S);
    og.addColorStop(0, '#f0d070'); og.addColorStop(1, '#a07818');
    disc(oaX, oaY, 7 * S, og);
    ctx.strokeStyle = '#4a3408'; ctx.lineWidth = 0.8 * S; ctx.beginPath(); ctx.arc(oaX, oaY, 7 * S, 0, TAU); ctx.stroke();
    disc(oaX, oaY, 2 * S, '#5a4410');
    // control hut
    const chX = -B + 5 * S, chY = B - 34 * S, chW = 20 * S, chH = 18 * S;
    rr(chX + shX * 0.5, chY + shY * 0.5, chW, chH, 2 * S, 'rgba(0,0,0,0.3)');
    rr(chX, chY, chW, chH, 2 * S, lit(chX + chW / 2, chY + chH / 2, chW / 2, '#eae6dc', '#a6a298'), '#4a4840', 0.9 * S);
    ctx.strokeStyle = 'rgba(60,58,52,0.35)'; ctx.lineWidth = 0.6 * S;
    ctx.beginPath(); ctx.moveTo(chX + chW / 2, chY + 2 * S); ctx.lineTo(chX + chW / 2, chY + chH - 2 * S); ctx.stroke();
    const hutLit = dark > 0.3 || fuelled;
    ctx.fillStyle = hutLit ? `rgba(255,${dark > 0.3 ? 220 : 240},${dark > 0.3 ? 140 : 200},${0.55 + 0.4 * dark})` : '#3a4a58';
    ctx.fillRect(chX + 3 * S, chY + chH - 4 * S, 5 * S, 2.2 * S); ctx.fillRect(chX + chW - 8 * S, chY + chH - 4 * S, 5 * S, 2.2 * S);
    // handrails round the deck (not the intake)
    if (detail) {
      ctx.strokeStyle = '#4a4c50'; ctx.lineWidth = 0.7 * S;
      ctx.beginPath(); ctx.moveTo(-B + 2 * S, -B + intakeD + 3 * S); ctx.lineTo(-B + 2 * S, B - 2 * S); ctx.lineTo(B - 2 * S, B - 2 * S); ctx.lineTo(B - 2 * S, -B + intakeD + 3 * S); ctx.stroke();
      ctx.fillStyle = '#2a2c30';
      for (let k = -B + intakeD + 6 * S; k < B - 2 * S; k += 8 * S) { ctx.fillRect(-B + 1.4 * S, k, 1.2 * S, 1.2 * S); ctx.fillRect(B - 2.6 * S, k, 1.2 * S, 1.2 * S); }
      for (let k = -B + 6 * S; k < B - 2 * S; k += 8 * S) ctx.fillRect(k, B - 2.6 * S, 1.2 * S, 1.2 * S);
    }
    // corner lamps
    for (const [lx, ly] of [[-B + 5 * S, -B + intakeD + 5 * S], [B - 5 * S, B - 5 * S]]) {
      if (dark > 0.3 && detail) {
        const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 14 * S);
        g.addColorStop(0, `rgba(255,230,160,${0.45 * dark})`); g.addColorStop(1, 'rgba(255,230,160,0)');
        disc(lx, ly, 14 * S, g);
      }
      disc(lx, ly, 1.6 * S, dark > 0.3 ? '#fff2c0' : '#3a3a3e');
    }

    // ── Stop-log gantry crane straddling the intake ──
    const gcY = -B + 16 * S;
    rr(-B - 3 * S + shX, gcY - 3 * S + shY, 2 * B + 6 * S, 6 * S, 1 * S, 'rgba(0,0,0,0.25)');
    rr(-B - 3 * S, gcY - 3 * S, 2 * B + 6 * S, 6 * S, 1 * S, '#d8a820', '#4a3a10', S);
    if (detail) {
      ctx.strokeStyle = 'rgba(70,50,0,0.55)'; ctx.lineWidth = 0.7 * S;
      ctx.beginPath(); for (let x = -B; x < B - 4 * S; x += 6 * S) { ctx.moveTo(x, gcY - 3 * S); ctx.lineTo(x + 4 * S, gcY + 3 * S); } ctx.stroke();
    }
    rr(-B - 5 * S, gcY - 5 * S, 6 * S, 10 * S, 1 * S, '#6a5a20');
    rr(B - 1 * S, gcY - 5 * S, 6 * S, 10 * S, 1 * S, '#6a5a20');
    const hoX = (fuelled ? Math.sin(t * 0.3) : -0.5) * B * 0.6;
    rr(hoX - 5 * S, gcY - 4.5 * S, 10 * S, 9 * S, 1.5 * S, '#3a3a34', '#151512', 0.8 * S);
    disc(hoX, gcY, 1.8 * S, '#8a8a80');

    ctx.restore();
    ctx.save();

    // ── Output shaft + port hub (unchanged port position) ──
    const odc = e._outSideDc || 0, odr = e._outSideDr || 0;
    let portX, portY;
    if (odc !== 0) { portX = odc > 0 ? px + tw - 8 : px + 8; portY = cy; }
    else           { portX = cx; portY = odr > 0 ? py + th - 8 : py + 8; }
    const edgeX = odc !== 0 ? (odc > 0 ? B1 : B0) : cx, edgeY = odc !== 0 ? cy : (odr > 0 ? cy + B : cy - B);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 7 * S;
    ctx.beginPath(); ctx.moveTo(edgeX + 3 * S, edgeY + 4 * S); ctx.lineTo(portX + 3 * S, portY + 4 * S); ctx.stroke();
    ctx.strokeStyle = '#1a1410'; ctx.lineWidth = 7 * S;
    ctx.beginPath(); ctx.moveTo(edgeX, edgeY); ctx.lineTo(portX, portY); ctx.stroke();
    ctx.strokeStyle = fuelled ? '#ffd070' : '#8a6a30'; ctx.lineWidth = 4.5 * S; ctx.stroke();
    // bearing housing where the shaft leaves the block
    const hz = odc !== 0;
    ctx.fillStyle = '#e0a020'; ctx.strokeStyle = '#4a3408'; ctx.lineWidth = 0.8 * S;
    if (hz) { ctx.beginPath(); ctx.roundRect(edgeX - 4 * S, edgeY - 8 * S, 8 * S, 16 * S, 1.5 * S); ctx.fill(); ctx.stroke(); }
    else    { ctx.beginPath(); ctx.roundRect(edgeX - 8 * S, edgeY - 4 * S, 16 * S, 8 * S, 1.5 * S); ctx.fill(); ctx.stroke(); }
    disc(edgeX, edgeY, 2.2 * S, '#3a2a10');
    ctx.translate(portX, portY);
    if (detail) {
      const portGlow = fuelled ? 0.7 + 0.25 * Math.sin(t * 4) : 0.25;
      const pg = ctx.createRadialGradient(0, 0, 0, 0, 0, 14 * S);
      pg.addColorStop(0, `rgba(224,160,32,${portGlow})`); pg.addColorStop(1, 'rgba(224,160,32,0)');
      disc(0, 0, 14 * S, pg);
    }
    if (fuelled) ctx.rotate(t * 4 * fillFrac);
    disc(0, 0, 5 * S, fuelled ? '#ffc040' : '#604018');
    ctx.strokeStyle = '#1a0e00'; ctx.lineWidth = 1.5 * S;
    ctx.beginPath(); ctx.arc(0, 0, 5 * S, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4 * S, 0); ctx.lineTo(4 * S, 0); ctx.moveTo(0, -4 * S); ctx.lineTo(0, 4 * S); ctx.stroke();
    ctx.restore();

    const lbl = fuelled ? `TURBINE ${Math.round((e._rotationRate || 0) * 100)}% RPM` : on ? 'LOW WATER' : 'NO POWER';
    // on the deck, clear of the intake and the tailrace outlets
    const plateY = fdr > 0 ? by + bh - 20 * S : fdr < 0 ? by + 20 * S
                 : (odc === 0 && odr > 0) ? by + 28 * S : by + bh - 20 * S;
    _wfPlate(lbl, cx, plateY, S, fuelled ? '#60e0ff' : '#6a8a98', true);

    if (InspectionPanel.isOpen() && InspectionPanel.target === e) {
      ctx.save(); ctx.strokeStyle = '#30d4ff'; ctx.lineWidth = 2 / Camera.zoom;
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 4);
      ctx.strokeRect(px + 1, py + 1, tw - 2, th - 2); ctx.restore();
    }
    drawNetworkHighlight(e, px, py, t);
  }

function renderShaft(e, px, py, t) {
    // Mechanical drive shaft (3×1 or 1×3): polished steel shaft on yellow
    // pillow-block bearings with flange couplings at the tile seams, stripes
    // that scroll with _rotationRate, and glowing brass end hubs (the far
    // end only once a source turbine is driving it). No base platform.
    const horizontal = e._orientation === 'h';
    const tw = (e.width  || (horizontal ? 3 : 1)) * TILE;
    const th = (e.height || (horizontal ? 1 : 3)) * TILE;
    const rate = e._rotationRate || 0;
    const driven = rate > 0;
    const S = TILE / 40;
    const tiles = horizontal ? (e.width || 3) : (e.height || 3);
    ctx.save();
    const midX = px + tw/2, midY = py + th/2;
    const x0 = horizontal ? px + 3*S : midX, y0 = horizontal ? midY : py + 3*S;
    const x1 = horizontal ? px + tw - 3*S : midX, y1 = horizontal ? midY : py + th - 3*S;

    // shadow
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 8*S; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(x0 + 3*S, y0 + 4*S); ctx.lineTo(x1 + 3*S, y1 + 4*S); ctx.stroke();

    // bearings (between tile seams)
    for (let i = 0; i < tiles; i++) {
      const bx = horizontal ? px + (i + 0.5)*TILE : midX;
      const by = horizontal ? midY : py + (i + 0.5)*TILE;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      if (horizontal) ctx.fillRect(bx - 5*S + 2*S, by - 11*S + 3*S, 10*S, 22*S); else ctx.fillRect(bx - 11*S + 2*S, by - 5*S + 3*S, 22*S, 10*S);
      ctx.fillStyle = '#e0a020'; ctx.strokeStyle = '#4a3408'; ctx.lineWidth = 0.8*S;
      if (horizontal) { ctx.beginPath(); ctx.roundRect(bx - 5*S, by - 11*S, 10*S, 22*S, 2*S); ctx.fill(); ctx.stroke(); }
      else { ctx.beginPath(); ctx.roundRect(bx - 11*S, by - 5*S, 22*S, 10*S, 2*S); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = '#3a3a3e';
      [-1, 1].forEach(sd => { ctx.beginPath(); if (horizontal) ctx.arc(bx, by + sd*8*S, 1.3*S, 0, Math.PI*2); else ctx.arc(bx + sd*8*S, by, 1.3*S, 0, Math.PI*2); ctx.fill(); });
    }

    // shaft body
    const sg = horizontal ? ctx.createLinearGradient(0, midY - 3.5*S, 0, midY + 3.5*S) : ctx.createLinearGradient(midX - 3.5*S, 0, midX + 3.5*S, 0);
    sg.addColorStop(0, '#6a7074'); sg.addColorStop(0.4, driven ? '#ffffff' : '#d8dcde'); sg.addColorStop(1, '#3a3e42');
    ctx.strokeStyle = sg; ctx.lineWidth = 7*S;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    if (driven) {
      ctx.strokeStyle = `rgba(224,160,32,${0.55 + 0.25*Math.sin(t*6*rate)})`; ctx.lineWidth = 7*S;
      ctx.setLineDash([3*S, 6*S]); ctx.lineDashOffset = -t*40*S*rate;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    // flange couplings at tile seams
    for (let i = 1; i < tiles; i++) {
      const fx = horizontal ? px + i*TILE : midX, fy = horizontal ? midY : py + i*TILE;
      ctx.fillStyle = '#8a9096'; ctx.strokeStyle = '#2a2e32'; ctx.lineWidth = 0.8*S;
      if (horizontal) { ctx.fillRect(fx - 2*S, fy - 6*S, 4*S, 12*S); ctx.strokeRect(fx - 2*S, fy - 6*S, 4*S, 12*S); }
      else { ctx.fillRect(fx - 6*S, fy - 2*S, 12*S, 4*S); ctx.strokeRect(fx - 6*S, fy - 2*S, 12*S, 4*S); }
    }

    // end hubs (same source-aware logic as before)
    const sourceTurbine = e._sourceTurbine;
    const endGlow = driven ? 0.85 + 0.15 * Math.sin(t * 5) : 0.35;
    let glowEnds = [];
    if (sourceTurbine) {
      const tCx = sourceTurbine.col + sourceTurbine.width / 2;
      const tCy = sourceTurbine.row + sourceTurbine.height / 2;
      if (horizontal) glowEnds.push(Math.abs(e.col - tCx) > Math.abs(e.col + 4 - tCx) ? 'left' : 'right');
      else            glowEnds.push(Math.abs(e.row - tCy) > Math.abs(e.row + 4 - tCy) ? 'top' : 'bottom');
    } else {
      glowEnds = horizontal ? ['left', 'right'] : ['top', 'bottom'];
    }
    for (const end of glowEnds) {
      let gx, gy;
      if (end === 'left')   { gx = px + 4*S;      gy = midY; }
      if (end === 'right')  { gx = px + tw - 4*S; gy = midY; }
      if (end === 'top')    { gx = midX;          gy = py + 4*S; }
      if (end === 'bottom') { gx = midX;          gy = py + th - 4*S; }
      const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, 10*S);
      gr.addColorStop(0, `rgba(255,200,80,${endGlow})`); gr.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(gx, gy, 10*S, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(gx, gy); ctx.rotate(driven ? t*6*rate : 0);
      ctx.fillStyle = driven ? '#ffd060' : '#8a6030';
      ctx.beginPath(); ctx.arc(0, 0, 3.5*S, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1a0e00'; ctx.lineWidth = 0.9*S;
      ctx.beginPath(); ctx.moveTo(-3*S, 0); ctx.lineTo(3*S, 0); ctx.moveTo(0, -3*S); ctx.lineTo(0, 3*S); ctx.stroke();
      ctx.restore();
    }

    if (InspectionPanel.isOpen() && InspectionPanel.target === e) {
      ctx.save(); ctx.strokeStyle = '#e0a020'; ctx.lineWidth = 2 / Camera.zoom;
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 4);
      ctx.strokeRect(px + 1, py + 1, tw - 2, th - 2); ctx.restore();
    }
    ctx.restore();
  }

// ── Flue-gas scrubber (PollutionSystem.installScrubber) ──────────────────
// Shared by the coal generator, fuel generator and refinery. A wet absorber
// tower in pale green steel: a sight glass shows limestone slurry spraying
// down through the flue gas while bubbles rise through the sump, a
// recirculation pump at the foot spins and pushes slurry up a riser to the
// spray header, a mist-eliminator cap on top, and a green beacon. Drawn at
// (x, top)–(x, base), radius r. `on` = the plant is burning. pumpSide ±1
// puts the pump on the right (default) or left of the tower.
function _scrubberTower(x, top, base, r, S, t, on, pumpSide = 1) {
  const TAU = Math.PI * 2, detail = Camera.zoom > 0.45;
  const H = base - top;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.roundRect(x - r + 5*S, top + 6*S, r*2, H, r*0.6); ctx.fill();
  // body
  const bg = ctx.createLinearGradient(x - r, 0, x + r, 0);
  bg.addColorStop(0, '#3e6e5e'); bg.addColorStop(0.38, '#a8dcc6'); bg.addColorStop(0.62, '#78b49c'); bg.addColorStop(1, '#264a3e');
  ctx.fillStyle = bg; ctx.strokeStyle = '#16302a'; ctx.lineWidth = 1.1*S;
  ctx.beginPath(); ctx.roundRect(x - r, top, r*2, H, [r*0.9, r*0.9, 2*S, 2*S]); ctx.fill(); ctx.stroke();
  // stiffening rings
  ctx.fillStyle = 'rgba(20,48,40,0.55)';
  [0.22, 0.78, 0.93].forEach(f => ctx.fillRect(x - r, top + H*f, r*2, 1.6*S));
  // spiral catwalk rails
  if (detail) {
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x - r, top, r*2, H, [r*0.9, r*0.9, 2*S, 2*S]); ctx.clip();
    ctx.strokeStyle = 'rgba(230,200,60,0.75)'; ctx.lineWidth = 0.8*S;
    for (let k = 0; k < 3; k++) {
      const y0 = top + H*(0.30 + k*0.22);
      ctx.beginPath(); ctx.moveTo(x - r, y0 + 6*S); ctx.lineTo(x + r, y0); ctx.stroke();
    }
    ctx.restore();
  }
  // sight glass
  const gx = x - r*0.55, gw = r*1.1, gy = top + H*0.30, gh = H*0.42;
  ctx.fillStyle = '#0a1614'; ctx.strokeStyle = '#c8d4d0'; ctx.lineWidth = 0.9*S;
  ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, gw*0.45); ctx.fill(); ctx.stroke();
  ctx.save();
  ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, gw*0.45); ctx.clip();
  const lvl = gy + gh*0.68;
  // slurry sump with a sloshing surface
  const sg = ctx.createLinearGradient(0, lvl, 0, gy + gh);
  sg.addColorStop(0, on ? '#9ad8e8' : '#4a6a70'); sg.addColorStop(1, on ? '#3a8aa8' : '#23383e');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.moveTo(gx, gy + gh);
  for (let k = 0; k <= 6; k++) ctx.lineTo(gx + gw*k/6, lvl + Math.sin(t*4 + k*1.3)*(on ? 1.1 : 0.3)*S);
  ctx.lineTo(gx + gw, gy + gh); ctx.closePath(); ctx.fill();
  if (on) {
    // spray falling from the header
    for (let k = 0; k < 7; k++) {
      const p = (t*1.6 + k*0.37) % 1;
      const dx = gx + gw*(0.15 + (k*0.13) % 0.7);
      ctx.fillStyle = `rgba(200,240,255,${0.85*(1 - p*0.6)})`;
      ctx.fillRect(dx, gy + 2*S + p*(lvl - gy - 3*S), 0.8*S, 2.2*S);
    }
    // gas bubbling up through the sump
    for (let k = 0; k < 5; k++) {
      const p = (t*0.9 + k*0.21) % 1;
      ctx.strokeStyle = `rgba(230,250,255,${0.7*(1 - p)})`; ctx.lineWidth = 0.6*S;
      ctx.beginPath(); ctx.arc(gx + gw*(0.2 + k*0.15) + Math.sin(t*3 + k)*S, gy + gh - 1*S - p*(gy + gh - lvl), (0.6 + p*0.9)*S, 0, TAU); ctx.stroke();
    }
    // header glow
    ctx.fillStyle = 'rgba(150,230,255,0.35)'; ctx.fillRect(gx, gy, gw, 1.8*S);
  }
  ctx.restore();
  // glass glint
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(gx + gw*0.15, gy + 2*S, 1*S, gh - 4*S);
  // mist-eliminator cap
  ctx.fillStyle = '#2e4e44'; ctx.strokeStyle = '#16302a'; ctx.lineWidth = 0.9*S;
  ctx.beginPath(); ctx.roundRect(x - r*0.55, top - 4*S, r*1.1, 5*S, 1.5*S); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(160,210,190,0.6)'; ctx.lineWidth = 0.6*S;
  for (let k = 1; k < 4; k++) { const lx = x - r*0.55 + r*1.1*k/4; ctx.beginPath(); ctx.moveTo(lx, top - 3.5*S); ctx.lineTo(lx, top + 0.5*S); ctx.stroke(); }
  // beacon
  const lit = on && Math.sin(t*3) > -0.2;
  ctx.fillStyle = lit ? '#50ff90' : '#1a3a28';
  ctx.beginPath(); ctx.arc(x, top - 6*S, 1.6*S, 0, TAU); ctx.fill();
  if (lit && detail) { ctx.globalAlpha = 0.3 + 0.15*Math.sin(t*3); ctx.beginPath(); ctx.arc(x, top - 6*S, 4.5*S, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
  // recirculation pump + riser to the spray header
  const pmX = x + pumpSide*(r + 3*S), pmY = base - 4*S, rim = x + pumpSide*r;
  const riser = () => { ctx.beginPath(); ctx.moveTo(pmX, pmY); ctx.lineTo(pmX, gy - 1*S); ctx.lineTo(rim, gy - 1*S); ctx.stroke(); };
  ctx.strokeStyle = '#141a18'; ctx.lineWidth = 3.4*S; ctx.lineCap = 'round'; riser();
  ctx.strokeStyle = '#8aa8a0'; ctx.lineWidth = 2*S; riser();
  if (on) {
    ctx.strokeStyle = 'rgba(200,245,255,0.9)'; ctx.lineWidth = 0.9*S;
    ctx.setLineDash([2*S, 3*S]); ctx.lineDashOffset = t*14*S;
    riser();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#2e4e44'; ctx.strokeStyle = '#101c18'; ctx.lineWidth = 0.9*S;
  ctx.beginPath(); ctx.arc(pmX, pmY, 3.6*S, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.translate(pmX, pmY); ctx.rotate(on ? t*9 : 0);
  ctx.strokeStyle = on ? '#b0f0d0' : '#5a7a70'; ctx.lineWidth = 0.9*S;
  for (let k = 0; k < 3; k++) { ctx.rotate(TAU/3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(2.6*S, 0); ctx.stroke(); }
  ctx.restore();
  // plate
  if (detail) {
    ctx.font = `bold ${Math.max(3, 3.4*S)}px Courier New`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText('SCRUBBER').width + 3*S;
    ctx.fillStyle = 'rgba(8,16,12,0.85)'; ctx.fillRect(x - tw/2, top + H*0.82, tw, 4.6*S);
    ctx.fillStyle = on ? '#70f0a8' : '#4a7a60'; ctx.fillText('SCRUBBER', x, top + H*0.82 + 2.4*S);
    ctx.textBaseline = 'alphabetic';
  }
}

// Rectangular flue duct along a polyline — flanged joints, and grey
// flue gas chevrons crawling toward the last point while running.
function _scrubberDuct(pts, S, t, on) {
  const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); };
  ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
  ctx.save(); ctx.translate(3*S, 4*S); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 7*S; path(); ctx.restore();
  ctx.strokeStyle = '#16302a'; ctx.lineWidth = 7*S; path();
  ctx.strokeStyle = '#5e8a7c'; ctx.lineWidth = 5*S; path();
  ctx.strokeStyle = 'rgba(190,230,215,0.45)'; ctx.lineWidth = 1.2*S;
  ctx.save(); ctx.translate(0, -1.4*S); path(); ctx.restore();
  // flanges at each joint
  ctx.fillStyle = '#2e4e44';
  for (const [fx, fy] of pts) { ctx.beginPath(); ctx.arc(fx, fy, 3.8*S, 0, Math.PI*2); ctx.fill(); }
  if (on) {
    ctx.strokeStyle = 'rgba(70,64,56,0.8)'; ctx.lineWidth = 2*S;
    ctx.setLineDash([2.5*S, 4*S]); ctx.lineDashOffset = -t*18*S;
    path();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }
  ctx.lineJoin = 'round';
}

// White water-vapour plume — what a scrubbed stack puts out instead of soot.
function _scrubberVapour(x, y, S, t, puffs, size) {
  for (let i = 0; i < puffs; i++) {
    const p = (t*0.28 + i/puffs) % 1;
    ctx.fillStyle = `rgba(246,250,252,${0.55*(1 - p)*(1 - p)})`;
    ctx.beginPath(); ctx.arc(x + Math.sin(i*2.1 + t)*2*S + p*14*S, y - 2*S - p*34*S, (3 + p*12)*size*S, 0, Math.PI*2); ctx.fill();
  }
}

// ── Carbon Capture Plant (T.CARBONCAPTURE) ─────────────────────────────────
// Direct air capture, authored at 10×8 and scaled to the entity's footprint,
// so plants built at the old 6×5 (and left that size on load for want of
// room) still draw the whole works inside their own tiles.
//
// Across the top: a two-storey bank of twelve contactor modules, each a big
// fan in front of a honeycomb sorbent bed over a louvred intake, with a
// catwalk between the storeys. Smog is drawn in from around the plant
// (wisps spiralling into the fans when there's smog to take). A collection
// header carries the loaded air to the desorber tower, which cycles its
// steam heat and vents white vapour; the released CO₂ runs down to the
// compression hall (cut away to show two compressor trains), then up into
// three storage cylinders whose gauges fill and empty as batches go down the
// injection wellhead, its pulses rippling into the ground. The control
// building's LED board counts the city's total tonnes captured. The
// placement ghost also shows the capture radius.
// The ring of air a plant scrubs, centred on its footprint: drawn by the
// placement ghost, and over a placed plant while its info panel is open.
function _drawCaptureRadius(cx, cy) {
  if (typeof PollutionSystem === 'undefined') return;
  const R = PollutionSystem.CAPTURE_RADIUS_TILES * TILE;
  // Fixed on-screen width, so the ring still reads zoomed right out.
  const px1 = 1 / Math.max(0.05, Camera.zoom || 1);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(90,230,160,0.08)'; ctx.fill();
  ctx.strokeStyle = 'rgba(10,30,20,0.5)'; ctx.lineWidth = 4*px1; ctx.stroke();
  ctx.strokeStyle = 'rgba(110,245,175,0.9)'; ctx.lineWidth = 2*px1; ctx.setLineDash([10*px1, 7*px1]);
  ctx.stroke();
  ctx.restore();
}

function renderCarbonCapture(e, px, py, t) {
  if (e.col * TILE !== px || e.row * TILE !== py) return;
  const TAU = Math.PI * 2;
  const AW = 400, AH = 320;
  const w = (e.width || 10) * TILE, h = (e.height || 8) * TILE;
  const on = !!e.powered && !e._ghost && !e._lightningDamaged;
  const tt = on ? t : 0;                                   // nothing moves without power
  const detail = Camera.zoom > 0.35;
  const night = on && typeof DayNight !== 'undefined' && DayNight.darkness() > 0.3;
  const day = !night;
  // day / night / unpowered (the placement ghost draws in its day colours)
  const L = (d, n, o) => on ? (night ? n : d) : (e._ghost ? d : o);
  const smog = on && typeof PollutionSystem !== 'undefined'
    ? Math.min(1, PollutionSystem.concAt(e.col + (e.width || 10) / 2, e.row + (e.height || 8) / 2) / 40) : 0;
  ctx.save();

  if (e._ghost) _drawCaptureRadius(px + w/2, py + h/2);

  ctx.translate(px, py);
  ctx.scale(w / (AW*TILE/40), h / (AH*TILE/40));
  const K = _nKit(0, 0), { S, X, Y, R, RR, dot, ell, poly, ln, text, glow, person } = K;
  const PAD = L('#8a8e88', '#4e5258', '#2e302e'), JOINT = 'rgba(30,34,32,0.28)';
  const STEEL = L('#5e6a70', '#3c444c', '#2a2c2e'), STEEL_D = L('#3a4448', '#262c32', '#1a1c1e');
  const PIPE = L('#9aa8a2', '#6a7478', '#4a504e'), YEL = L('#e8c030', '#a88a28', '#4a4220');
  const WALL = L('#d8dcd6', '#8a8e98', '#3a3c3a'), ROOF = L('#4e5a5e', '#30383e', '#202224');
  const MINT = '#70f0b0';
  const SHADOW = 'rgba(0,0,0,0.30)';
  const winLit = (i) => night && _cmFrac(i + (e.col || 0)*3) > 0.25;
  const WIN = (i) => winLit(i) ? `rgba(255,225,160,${(0.8 + 0.1*Math.sin(t + i)).toFixed(3)})` : L('#4a6a7e', '#1e2a36', '#141618');

  // ── Verge, pad, fence, access road ──
  R(0, 0, AW, AH, L('#5c8048', '#2c3a30', '#1e261c'));
  RR(5, 5, AW - 10, AH - 10, 4, PAD);
  if (detail) {
    for (let x = 45; x < AW - 6; x += 40) R(x, 5, 0.6, AH - 10, JOINT);
    for (let y = 45; y < AH - 6; y += 40) R(5, y, AW - 10, 0.6, JOINT);
    for (let k = 0; k < 10; k++) ell(20 + _cmFrac(k + 3)*360, 20 + _cmFrac(k + 17)*270, 6 + _cmFrac(k + 5)*8, 3 + _cmFrac(k + 9)*4, 'rgba(40,44,40,0.10)');
  }
  R(5, 294, AW - 10, 21, L('#4a4e50', '#2a2e34', '#1c1e1e'));                        // access road
  if (detail) for (let x = 14; x < AW - 14; x += 18) R(x, 304, 9, 1, YEL);
  ctx.strokeStyle = L('rgba(200,206,210,0.8)', 'rgba(120,128,140,0.7)', 'rgba(80,84,86,0.6)'); ctx.lineWidth = 0.7*S;
  ctx.setLineDash([2*S, 1.4*S]); ctx.strokeRect(X(3), Y(3), (AW - 6)*S, (AH - 6)*S); ctx.setLineDash([]);
  for (let x = 3; x <= AW - 3; x += 25) { dot(x, 3, 1, STEEL); dot(x, AH - 3, 1, STEEL); }
  for (let y = 28; y < AH - 3; y += 25) { dot(3, y, 1, STEEL); dot(AW - 3, y, 1, STEEL); }

  // ── Contactor bank: 2 storeys × 6 modules ──
  const BX = 12, BY = 12, MW = 44, MH = 64, COLS = 6;
  R(BX + 6, BY + 7, MW*COLS + 4, MH*2 + 10, SHADOW);
  R(BX, BY, MW*COLS + 4, MH*2 + 10, STEEL_D);
  const fans = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < COLS; c++) {
    const mx = BX + 2 + c*MW, my = BY + 2 + r*(MH + 6), mw = MW - 2, mh = MH - 2;
    const hg = ctx.createLinearGradient(X(mx), Y(my), X(mx + mw), Y(my + mh));
    hg.addColorStop(0, L('#5e8a7c', '#3e5e56', '#3a4440')); hg.addColorStop(1, L('#2e4e44', '#1e3430', '#202624'));
    ctx.fillStyle = hg; ctx.fillRect(X(mx), Y(my), mw*S, mh*S);
    ctx.strokeStyle = '#101c18'; ctx.lineWidth = 0.8*S; ctx.strokeRect(X(mx), Y(my), mw*S, mh*S);
    const fx = mx + mw/2, fy = my + 22, fr = 17;
    fans.push([fx, fy, fr]);
    // sorbent bed: honeycomb behind the blades, glowing faintly while it loads
    ctx.save();
    ctx.beginPath(); ctx.arc(X(fx), Y(fy), fr*S, 0, TAU); ctx.clip();
    ctx.fillStyle = '#0c1412'; ctx.fillRect(X(fx - fr), Y(fy - fr), fr*2*S, fr*2*S);
    if (detail) {
      ctx.strokeStyle = on ? `rgba(110,240,180,${(0.35 + 0.15*Math.sin(t*1.5 + r + c)).toFixed(3)})` : 'rgba(90,120,110,0.35)';
      ctx.lineWidth = 0.5*S;
      const hs = 2.8;
      ctx.beginPath();
      for (let yy = -fr, row = 0; yy < fr + hs; yy += hs*1.5, row++) for (let xx = -fr; xx < fr + hs; xx += hs*1.73) {
        const ox = (row % 2)*hs*0.86;
        for (let k = 0; k < 6; k++) { const a = k*Math.PI/3 + Math.PI/6; const hx = X(fx + xx + ox + Math.cos(a)*hs*0.9), hy = Y(fy + yy + Math.sin(a)*hs*0.9); k ? ctx.lineTo(hx, hy) : ctx.moveTo(hx, hy); }
        ctx.closePath();
      }
      ctx.stroke();
    }
    ctx.restore();
    // blades
    ctx.save(); ctx.translate(X(fx), Y(fy)); ctx.rotate(on ? t*(5 + (r*3 + c) % 2) : (r + c)*0.4);
    ctx.fillStyle = on ? 'rgba(200,225,215,0.78)' : L('#7a8a84', '#7a8a84', '#4a5450');
    const fs = fr*S;
    for (let b = 0; b < 5; b++) {
      ctx.rotate(TAU/5);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(fs*0.45, -fs*0.30, fs*0.92, -fs*0.10); ctx.lineTo(fs*0.88, fs*0.10); ctx.quadraticCurveTo(fs*0.40, fs*0.05, 0, 0); ctx.fill();
    }
    ctx.restore();
    if (on && detail) dot(fx, fy, fr*0.95, 'rgba(200,230,220,0.12)');
    // guard ring + hub
    ctx.strokeStyle = L('#c8d8d0', '#8a9a94', '#5a6460'); ctx.lineWidth = 1.1*S; ctx.beginPath(); ctx.arc(X(fx), Y(fy), fr*S, 0, TAU); ctx.stroke();
    ln(fx - fr, fy, fx + fr, fy, 'rgba(200,216,208,0.5)', 0.5); ln(fx, fy - fr, fx, fy + fr, 'rgba(200,216,208,0.5)', 0.5);
    dot(fx, fy, 2.2, on ? MINT : '#3a4a44');
    if (on && night) glow(fx, fy, 6, '110,240,180', 0.35);
    // louvred intake under the fan, and the module's status LED
    R(mx + 4, my + 44, mw - 8, 15, '#14201c');
    for (let s = 0; s < 5; s++) R(mx + 4, my + 45 + s*3, mw - 8, 1.4, L('#7e9a90', '#4a5e58', '#323a36'));
    dot(mx + mw - 4, my + 4, 1, on ? (_cmFrac(r*6 + c + Math.floor(t*0.3)) > 0.15 ? MINT : '#ffb040') : '#3a4440');
  }
  // catwalk between the storeys, and the roof rail
  R(BX, BY + MH + 1, MW*COLS + 4, 6, L('#6a7478', '#40484e', '#262a2c'));
  if (detail) for (let x = BX; x < BX + MW*COLS + 4; x += 3) R(x, BY + MH + 1, 0.5, 6, 'rgba(0,0,0,0.25)');
  R(BX, BY + MH + 1, MW*COLS + 4, 0.9, YEL); R(BX, BY - 2, MW*COLS + 4, 1.4, YEL);
  if (on && day && detail) {                                                         // a technician on the catwalk
    const wx = BX + 20 + ((t*4) % (MW*COLS - 30));
    person(wx, BY + MH + 6, '#ff8a30', _N_SKIN[2], 0, 0.75);
  }

  // Smog being drawn in: brown wisps spiral in from outside to each fan.
  if (on && detail && smog > 0.03) {
    fans.forEach(([fx, fy, fr], i) => {
      for (let k = 0; k < 2; k++) {
        const p = (t*0.45 + k/2 + i*0.17) % 1;
        const a = i*1.9 + k*2.1 + p*2.4;
        const d = fr*(1 + 1.6*(1 - p));
        dot(fx + Math.cos(a)*d, fy + Math.sin(a)*d, 2 + 3*(1 - p), `rgba(120,100,62,${(Math.min(0.85, 0.3 + 0.6*smog)*Math.sin(p*Math.PI)).toFixed(3)})`);
      }
    });
  }

  // ── CO₂ pipework ──
  const pipe = (pts, wd = 4) => {
    const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.stroke(); };
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = '#141a18'; ctx.lineWidth = (wd + 1.6)*S; path();
    ctx.strokeStyle = PIPE; ctx.lineWidth = wd*S; path();
    if (on) { ctx.strokeStyle = 'rgba(120,255,190,0.9)'; ctx.lineWidth = wd*0.35*S; ctx.setLineDash([2.5*S, 4*S]); ctx.lineDashOffset = -t*16*S; path(); ctx.setLineDash([]); ctx.lineDashOffset = 0; }
  };
  const HDR = 160;
  for (let c = 0; c < COLS; c++) pipe([[BX + 2 + c*MW + MW/2 - 1, BY + MH*2 + 8], [BX + 2 + c*MW + MW/2 - 1, HDR]], 3);
  pipe([[BX + 20, HDR], [306, HDR], [306, 150]], 6);                                  // collection header → desorber
  pipe([[320, 118], [336, 118], [336, 172], [190, 172], [190, 188]]);                // desorber → compression hall
  pipe([[248, 232], [367, 232], [367, 162]]);                                        // compressors → storage manifold
  pipe([[350, 162], [384, 162]]);
  for (const cx of [350, 367, 384]) pipe([[cx, 150], [cx, 162]], 3);
  pipe([[384, 162], [390, 168], [390, 262], [322, 262]]);                            // storage → wellhead

  // ── Desorber tower ──
  {
    const cx = 306, top = 24, bot = 150, r = 13;
    RR(cx - r + 6, top + 6, r*2, bot - top, r, SHADOW);
    const g = ctx.createLinearGradient(X(cx - r), 0, X(cx + r), 0);
    g.addColorStop(0, L('#b8c0bc', '#7a8288', '#3a3e3c')); g.addColorStop(0.4, L('#f4f8f6', '#a8b0b6', '#4a4e4c')); g.addColorStop(1, L('#7a8480', '#4a5258', '#2a2e2c'));
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(X(cx - r), Y(top), r*2*S, (bot - top)*S, r*S); ctx.fill();
    ctx.strokeStyle = '#2a3230'; ctx.lineWidth = 0.8*S; ctx.stroke();
    for (let y = top + 22; y < bot - 6; y += 22) R(cx - r, y, r*2, 1.2, 'rgba(0,0,0,0.18)');
    // steam jacket heating through its cycle
    const heat = on ? 0.5 + 0.5*Math.sin(t*0.6) : 0;
    R(cx - r, 90, r*2, 30, L('rgba(90,100,104,0.25)', 'rgba(40,46,52,0.3)', 'rgba(0,0,0,0.2)'));
    for (let k = 0; k < 6; k++) R(cx - r, 92 + k*4.6, r*2, 1.6, `rgba(${Math.round(120 + 135*heat)},${Math.round(110 - 30*heat)},${Math.round(90 - 30*heat)},${(0.45 + 0.4*heat).toFixed(3)})`);   // steam coils
    if (on && heat > 0.6) glow(cx, 105, 18, '255,140,70', (heat - 0.6)*0.6);
    // platforms with yellow handrails, and a caged ladder
    for (const py2 of [60, 116]) { R(cx - r - 4, py2, r*2 + 8, 3, STEEL); R(cx - r - 4, py2 - 2, r*2 + 8, 0.8, YEL); }
    ln(cx + r + 2, top + 10, cx + r + 2, bot, STEEL_D, 0.6); ln(cx + r + 5, top + 10, cx + r + 5, bot, STEEL_D, 0.6);
    if (detail) for (let y = top + 12; y < bot; y += 4) ln(cx + r + 2, y, cx + r + 5, y, STEEL_D, 0.4);
    // vent stack and its white vapour
    R(cx - 2.5, top - 10, 5, 12, PIPE);
    if (on) _scrubberVapour(X(cx), Y(top - 10), S, t, 5, 0.8);
    // aircraft warning lamp
    dot(cx, top - 11, 1.4, on && Math.sin(t*3) > 0 ? '#ff3a2a' : '#5a2a24');
    if (on && night && Math.sin(t*3) > 0) glow(cx, top - 11, 8, '255,60,40', 0.5);
    if (detail) {
      ctx.save(); ctx.translate(X(cx - 4), Y(77)); ctx.rotate(-Math.PI/2);
      text('DESORBER', 0, 0, 4.4, L('#2e6a50', '#9adcc0', '#3a4a44'), 'Arial, sans-serif');
      ctx.restore();
    }
  }

  // ── CO₂ storage cylinders ──
  const fill = on ? 0.35 + 0.5*((t*0.05) % 1) : 0.2;
  [350, 367, 384].forEach((cx, i) => {
    const top = 22, bot = 150, r = 8;
    RR(cx - r + 4, top + 5, r*2, bot - top, r, SHADOW);
    const cg = ctx.createLinearGradient(X(cx - r), 0, X(cx + r), 0);
    cg.addColorStop(0, L('#b8c0bc', '#7a8288', '#3a3e3c')); cg.addColorStop(0.4, L('#f4f8f6', '#a8b0b6', '#4a4e4c')); cg.addColorStop(1, L('#7a8480', '#4a5258', '#2a2e2c'));
    ctx.fillStyle = cg; ctx.strokeStyle = '#2a3230'; ctx.lineWidth = 0.8*S;
    ctx.beginPath(); ctx.roundRect(X(cx - r), Y(top), r*2*S, (bot - top)*S, r*S); ctx.fill(); ctx.stroke();
    R(cx - r, top + 34, r*2, 2.2, L('#2e6a50', '#2a5a48', '#2a3a34'));
    if (detail) {
      ctx.save(); ctx.translate(X(cx - 1), Y(top + 72)); ctx.rotate(-Math.PI/2);
      text('CO₂', 0, 0, 5, L('#2e6a50', '#5aa888', '#3a4a44'), 'Arial, sans-serif');
      ctx.restore();
    }
    // gauge strip
    const gx = cx + r - 3, gy0 = top + 8, gy1 = bot - 8, f = Math.min(1, fill + i*0.1);
    R(gx, gy0, 1.8, gy1 - gy0, '#0a1210');
    R(gx, gy1 - (gy1 - gy0)*f, 1.8, (gy1 - gy0)*f, on ? '#60f0a8' : '#2a4a3a');
  });

  // ── Compression hall, cut away ──
  {
    const hx = 122, hy = 186, hw = 128, hh = 84;
    R(hx + 5, hy + 6, hw, hh, SHADOW);
    R(hx, hy, hw, hh, WALL);
    R(hx, hy, hw, 13, ROOF);
    if (detail) for (let x = hx + 2; x < hx + hw; x += 4) R(x, hy, 1, 13, 'rgba(255,255,255,0.08)');
    text('COMPRESSION', hx + hw/2, hy + 6.8, 5, L('#e8eef0', '#c8d0d8', '#6a6e70'), 'Arial, sans-serif');
    for (const vx of [hx + 12, hx + hw - 18]) {                                     // roof vents, shimmering while running
      R(vx, hy - 4, 8, 5, STEEL);
      if (on && detail) for (let k = 0; k < 2; k++) { const p = (t*0.8 + k/2) % 1; ell(vx + 4 + Math.sin(t*3 + k)*1.5, hy - 6 - p*10, 2 + p*2, 1.2, `rgba(255,255,255,${(0.18*(1 - p)).toFixed(3)})`); }
    }
    R(hx + 4, hy + 16, hw - 8, hh - 20, on ? (night ? '#e8e2cc' : '#d8dcd8') : '#1a1c1c');   // lit interior
    R(hx + 4, hy + hh - 10, hw - 8, 6, L('#9aa0a0', '#6a6e74', '#2a2c2c'));               // floor
    for (let k = 0; k < 2; k++) {
      const cy = hy + 34 + k*24, ph = on ? Math.sin(t*9 + k*Math.PI) : 0;
      R(hx + 10, cy - 7, 26, 14, L('#3e7a62', '#2e5a4a', '#222a26'));                  // motor
      if (detail) for (let f = 0; f < 6; f++) R(hx + 12 + f*4, cy - 7, 1, 14, 'rgba(0,0,0,0.2)');
      R(hx + 36, cy - 1.5, 8, 3, STEEL_D);                                           // coupling
      RR(hx + 44, cy - 8, 40, 16, 2, L('#5a6a70', '#3a464e', '#222628'));                // crankcase
      for (let p = 0; p < 3; p++) {                                                   // cylinders and pistons
        const ox = hx + 50 + p*11;
        R(ox, cy - 13, 7, 6, STEEL_D);
        R(ox + 1, cy - 12 + (p % 2 ? -ph : ph)*1.6, 5, 2, L('#d8e0dc', '#9aa4a8', '#4a4e4e'));
      }
      const fwx = hx + 96, fwr = 8;                                                   // flywheel
      dot(fwx, cy, fwr, '#1a2622');
      ctx.save(); ctx.translate(X(fwx), Y(cy)); ctx.rotate(tt*6 + k);
      ctx.strokeStyle = on ? '#80f0c0' : '#6a7a74'; ctx.lineWidth = 1*S;
      for (let s = 0; s < 3; s++) { ctx.rotate(TAU/3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(fwr*0.85*S, 0); ctx.stroke(); }
      ctx.restore();
      R(hx + 108, cy - 6, 12, 12, L('#4a6e86', '#344e60', '#20282e'));                  // intercooler
      if (detail) for (let f = 0; f < 5; f++) R(hx + 109, cy - 5 + f*2.4, 10, 0.8, 'rgba(255,255,255,0.25)');
    }
    if (on && day && detail) person(hx + 40 + Math.sin(t*0.3)*30, hy + hh - 8, '#3a70d8', _N_SKIN[0], 0, 0.8);
    R(hx + hw - 2, hy + 13, 2, hh - 13, L('#b8bcb6', '#6a6e78', '#2a2c2a'));
  }

  // ── Control building and the LED counter board ──
  {
    const cx0 = 14, cy0 = 186, cw = 98, ch = 66;
    R(cx0 + 5, cy0 + 6, cw, ch, SHADOW);
    R(cx0, cy0, cw, ch, WALL);
    R(cx0, cy0, cw, 6, ROOF); R(cx0, cy0 + 6, cw, 1, 'rgba(0,0,0,0.2)');
    for (const ax of [cx0 + 10, cx0 + 24]) { R(ax, cy0 - 3, 9, 5, STEEL); if (detail) R(ax + 2, cy0 - 2.4, 5, 0.6, 'rgba(0,0,0,0.3)'); }   // rooftop units
    ln(cx0 + cw - 10, cy0, cx0 + cw - 10, cy0 - 16, STEEL_D, 0.7);                   // weather mast
    for (let k = 0; k < 3; k++) dot(cx0 + cw - 10 + Math.cos(tt*6 + k*2.09)*3, cy0 - 16 + Math.sin(tt*6 + k*2.09)*1.2, 0.8, PIPE);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) R(cx0 + 6 + c*15.2, cy0 + 12 + r*18, 11, 12, WIN(c + r*6));
    R(cx0 + cw/2 - 7, cy0 + ch - 16, 14, 16, L('#3a4a52', '#1e262c', '#141618'));         // glass doors
    R(cx0 + cw/2 - 0.4, cy0 + ch - 16, 0.8, 16, L('#c8ccd0', '#8a8e98', '#3a3c3a'));
    R(cx0 + cw/2 - 10, cy0 + ch - 18, 20, 2, L('#2e6a50', '#2a5a48', '#2a3a34'));         // canopy
    if (night) glow(cx0 + cw/2, cy0 + ch - 10, 12, '255,225,160', 0.35);
    text('CONTROL', cx0 + 30, cy0 + ch - 9, 4.4, L('#2e6a50', '#9adcc0', '#3a4a44'), 'Arial, sans-serif');

    const bdX = 14, bdY = 258, bdW = 98, bdH = 30;
    R(bdX + 20, bdY + bdH, 2, 5, STEEL_D); R(bdX + bdW - 22, bdY + bdH, 2, 5, STEEL_D);
    RR(bdX, bdY, bdW, bdH, 2, '#060c0a');
    ctx.strokeStyle = on ? '#2e8a60' : '#2a3a34'; ctx.lineWidth = 0.8*S; ctx.stroke();
    if (detail) {
      const tonnes = typeof PollutionSystem !== 'undefined' ? PollutionSystem.capturedTonnes() : 0;
      const ink = on ? MINT : '#2e5a48';
      text('CO₂ CAPTURED', bdX + bdW/2, bdY + 9, 5, ink, 'Courier New, monospace');
      text(e._ghost ? '— t' : `${Math.floor(tonnes).toLocaleString('en-US')} t`, bdX + bdW/2, bdY + 20.5, 9, ink, 'Courier New, monospace');
    }
    if (on) glow(bdX + bdW/2, bdY + bdH/2, 40, '110,240,180', night ? 0.18 : 0.06);
    // status lamp
    dot(bdX + bdW + 4, bdY + 4, 1.8, on ? '#50ff90' : (e.powered === false && !e._ghost ? '#ff5040' : '#3a4a44'));
  }

  // ── Injection wellhead ("Christmas tree") on its hazard-striped pad ──
  {
    const whX = 312, whY = 262;
    RR(whX - 20, whY - 16, 40, 30, 2, L('#6e7470', '#3e4248', '#262826'));
    if (detail) {
      ctx.save(); ctx.beginPath(); ctx.rect(X(whX - 20), Y(whY - 16), 40*S, 30*S); ctx.clip();
      for (let k = -4; k < 12; k++) poly([[whX - 20 + k*6, whY - 16], [whX - 17 + k*6, whY - 16], [whX - 27 + k*6, whY + 14], [whX - 30 + k*6, whY + 14]], k % 2 ? YEL : '#1e1e20');
      ctx.restore();
      RR(whX - 17, whY - 13, 34, 24, 1.5, L('#6e7470', '#3e4248', '#262826'));
    }
    if (on && detail) for (let k = 0; k < 3; k++) {
      const p = (t*0.5 + k/3) % 1;
      ctx.strokeStyle = `rgba(100,240,170,${(0.5*(1 - p)).toFixed(3)})`; ctx.lineWidth = 1*S;
      ctx.beginPath(); ctx.ellipse(X(whX), Y(whY + 4), (4 + p*14)*S, (4 + p*14)*0.45*S, 0, 0, TAU); ctx.stroke();
    }
    ell(whX, whY + 4, 7, 3, '#3a4440');
    R(whX - 2, whY - 12, 4, 16, '#c03828');
    for (const [dx, dy] of [[-5, -8], [5, -8], [0, -14]]) {
      dot(whX + dx, whY + dy, 2.3, '#e0e4e2');
      ctx.strokeStyle = '#2a3230'; ctx.lineWidth = 0.6*S; ctx.stroke();
    }
    text('INJECTION WELL', whX, whY + 20, 3.6, L('#1e2a26', '#c8d0d8', '#4a4e4c'), 'Arial, sans-serif');
  }

  // ── Spare sorbent cartridges on pallets, waiting for the next bed swap ──
  for (let k = 0; k < 6; k++) {
    const bx = 262 + (k % 3)*20, by = 190 + Math.floor(k/3)*18;
    R(bx + 2, by + 2, 16, 13, SHADOW);
    R(bx - 1, by + 11, 18, 3, L('#a07a4a', '#5e4a3a', '#2a2218'));
    RR(bx, by, 16, 12, 1, L('#4e8a76', '#2e5a4e', '#22302a'));
    if (detail) { R(bx, by + 5.4, 16, 1, 'rgba(0,0,0,0.25)'); R(bx + 1.5, by + 1.5, 13, 1, 'rgba(255,255,255,0.18)'); }
  }

  // ── Service pickup on the road, and the yard floodlights ──
  {
    const vx = 336, vy = 298;
    R(vx + 2, vy + 2, 26, 11, SHADOW);
    RR(vx, vy, 26, 11, 2, L('#f4f4f0', '#a8acb4', '#3a3c3a'));
    R(vx + 15, vy + 1.5, 7, 8, L('#2a3a48', '#ffe2a8', '#141618'));
    R(vx + 2, vy + 4.5, 11, 2, L('#2e6a50', '#2a5a48', '#2a3a34'));
  }
  for (const [mx, my] of [[118, 176], [278, 176], [118, 290], [278, 290]]) {
    R(mx - 0.6, my - 10, 1.2, 10, STEEL_D);
    RR(mx - 3, my - 13, 6, 3, 0.8, STEEL_D);
    dot(mx, my - 11.5, 1, night ? '#fffbe8' : L('#c8ccd0', '#6a6e76', '#2a2a2c'));
    if (night) glow(mx, my - 8, 30, '255,250,225', 0.22);
  }

  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.restore();
  if (typeof drawNetworkHighlight === 'function' && !e._ghost) drawNetworkHighlight(e, px, py, t);
}

function renderCoalGenerator(e, px, py, t) {
    // Coal-fired power station: a brick boiler house under a slate roof with
    // a louvred ridge vent, its tall arched windows lit by the furnace
    // (brighter with the throttle, flaring red while the boiler is critical);
    // a banded chimney with an aviation light; a lattice conveyor gantry from
    // the Coal IN hopper up to a roof bunker whose sight glass shows the
    // hopper level; a steel-clad turbine hall with a skylight over the
    // turbine-generator set; a finned transformer; and an ash silo whose
    // gauge and pile follow _ashWaste. The boiler gauge reads _cgPressure.
    // Laid out proportionally so rotated (swapped w/h) footprints still
    // read. Stubs match CoalGeneratorConnections.
    const w   = (e.width  || 3) * TILE;
    const h   = (e.height || 4) * TILE;
    const on  = e._fuelled && e._hasWater && e.powered;
    const S   = TILE / 40;
    const TAU = Math.PI * 2;
    const ash = Math.min(1, (e._ashWaste || 0) / 100);
    const TH  = TILE / 2;
    const detail   = Camera.zoom > 0.5;
    const throttle = e._cgThrottle || 'normal';
    const pressure = Math.max(0, Math.min(1, e._cgPressure || 0));
    const critical = e._cgState === 'critical';
    const blink    = Math.sin(t * 9) > 0;
    // Furnace brightness: off, then by throttle; a warming boiler glows dimmer.
    const fire = !on ? 0 : (throttle === 'overdrive' ? 1 : throttle === 'eco' ? 0.55 : 0.8) * (e._cgState === 'warming' ? 0.7 : 1);
    // Hopper charge as a fraction of CoalSystem's hopper (HOPPER_SECONDS = 30 s of full draw).
    const hopFill = Math.min(1, (e._hopperCoal || 0) / (30 * EntityDefs[T.COALGENERATOR].coalPerSecond));
    const lerpN = (a, b, k) => Math.round(a + (b - a) * k);
    const rr = (x, y, ww, hh, r, fill, stroke, lw) => {
      ctx.beginPath(); ctx.roundRect(x, y, ww, hh, r);
      if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || S; ctx.stroke(); }
    };
    const vgrad = (y0, y1, stops) => { const g = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c)); return g; };
    const hgrad = (x0, x1, stops) => { const g = ctx.createLinearGradient(x0, 0, x1, 0); stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c)); return g; };
    ctx.save();

    const coalY  = py + h - TH;
    const wTiles = e.width || EntityDefs[T.COALGENERATOR].width || 3;
    const waterX = px + Math.floor(wTiles / 2) * TILE + TH;
    const bhX = px + w*0.08, bhY = py + h*0.30, bhW = w*0.46, bhH = h*0.40;
    const bkX = bhX + bhW*0.40, bkW = bhW*0.36, bkY = bhY - 34*S, bkB = bhY - 7*S;
    const thX = px + w*0.58, thY = py + h*0.40, thW = w*0.37, thH = h*0.30;
    const tfX = px + w*0.60, tfY = py + h*0.215, tfW = w*0.32, tfH = h*0.115;
    const asX = px + w*0.73, asY = py + h*0.715, asW = w*0.15, asH = h*0.065;

    // ── Pipework (under the buildings) ──
    _wfPipe([[waterX, py + h - 12*S], [waterX, py + h*0.79], [bhX + bhW*0.72, py + h*0.79], [bhX + bhW*0.72, bhY + bhH]], S, t, !!e._hasWater && e.powered, 'rgba(90,190,255,0.95)');
    _wfPipe([[bhX + bhW, thY + thH*0.40], [thX + 4*S, thY + thH*0.40]], S, t, on, 'rgba(240,240,235,0.95)');
    _wfPipe([[bhX + bhW, thY + thH*0.66], [thX + 4*S, thY + thH*0.66]], S, t, on, 'rgba(240,240,235,0.85)');
    _wfPipe([[bhX + bhW*0.30, bhY + bhH], [bhX + bhW*0.30, asY + asH*0.5], [asX, asY + asH*0.5]], S, t, on, 'rgba(150,146,138,0.95)');

    // ── Ambient furnace glow ──
    if ((on || critical) && Camera.zoom > 0.5) {
      ctx.save(); ctx.globalAlpha = critical ? 0.16 + 0.10 * Math.sin(t * 7) : 0.06 + 0.07 * fire + 0.04 * Math.sin(t * 2.2);
      const gx = bhX + bhW/2, gy = bhY + bhH*0.6;
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, w * 0.6);
      g.addColorStop(0, critical ? '#ff3010' : '#ff7020'); g.addColorStop(1, 'rgba(255,100,20,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gx, gy, w * 0.6, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // ── Conveyor gantry from Coal IN: up the left side, then along the
    // roofline (behind the chimney) into the bunker, routed around the
    // boiler house rather than across it, carried on a lattice truss ──
    const cvX = px + 6*S, cvy0 = coalY - 9*S, cvTurnY = bkY + 7*S, cvx1 = bkX;
    if (detail) {
      ctx.strokeStyle = '#2e3236'; ctx.lineWidth = 0.9*S;
      ctx.beginPath();
      for (const o of [-6, 6]) { ctx.moveTo(cvX + o*S, cvy0); ctx.lineTo(cvX + o*S, cvTurnY + o*S); ctx.lineTo(cvx1, cvTurnY + o*S); }
      for (let y = cvy0; y > cvTurnY + 6*S; y -= 7*S) { ctx.moveTo(cvX - 6*S, y); ctx.lineTo(cvX + 6*S, y - 7*S); }
      for (let x = cvX + 6*S; x < cvx1 - 6*S; x += 7*S) { ctx.moveTo(x, cvTurnY + 6*S); ctx.lineTo(x + 7*S, cvTurnY - 6*S); }
      ctx.stroke();
    }
    _wfConveyor(cvX, cvy0, cvX, cvTurnY, S, t, on, '#4a4038');
    _wfConveyor(cvX, cvTurnY, cvx1, cvTurnY, S, t, on, '#4a4038');
    if (on) {
      const segA = cvy0 - cvTurnY, segB = cvx1 - cvX, total = segA + segB;
      ctx.fillStyle = '#0c0c0c';
      for (let k = 0; k < 9; k++) {
        const d = ((t*0.3 + k/9) % 1) * total;
        const lx = d < segA ? cvX : cvX + (d - segA);
        const ly = d < segA ? cvy0 - d : cvTurnY;
        ctx.beginPath(); ctx.arc(lx, ly - 1.5*S, 1.6*S, 0, TAU); ctx.fill();
      }
    }

    // ── Chimney (in front of the gantry, behind the boiler house) ──
    const chX = px + w*0.15, chTop = py + 3*S, chBase = bhY + 2*S;
    const cbw = 12*S, ctw = 7.5*S;
    const chPath = (ox, oy) => { ctx.beginPath(); ctx.moveTo(chX - cbw + ox, chBase + oy); ctx.lineTo(chX + cbw + ox, chBase + oy); ctx.lineTo(chX + ctw + ox, chTop + oy); ctx.lineTo(chX - ctw + ox, chTop + oy); ctx.closePath(); };
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; chPath(6*S, 6*S); ctx.fill();
    ctx.fillStyle = hgrad(chX - cbw, chX + cbw, ['#bcb8b0', '#ece8e0', '#d4d0c8', '#76726a']);
    chPath(0, 0); ctx.fill();
    ctx.save(); chPath(0, 0); ctx.clip();
    [0, 2].forEach(b => { ctx.fillStyle = '#c03020'; ctx.fillRect(chX - cbw, chTop + 3*S + b*6*S, cbw*2, 5*S); });
    ctx.fillStyle = 'rgba(40,36,30,0.16)';
    for (let y = chTop + 22*S; y < chBase; y += 6*S) ctx.fillRect(chX - cbw, y, cbw*2, 0.9*S);
    ctx.fillStyle = 'rgba(30,26,20,0.28)';   // soot streak under the lip
    ctx.fillRect(chX - ctw, chTop, ctw*2, 3*S);
    ctx.restore();
    // access gallery a third of the way down
    const galY = chTop + (chBase - chTop)*0.34, galW = ctw + (cbw - ctw)*0.34 + 2.5*S;
    rr(chX - galW, galY, galW*2, 2.2*S, 0.8*S, '#3a3e44');
    if (detail) {
      ctx.strokeStyle = '#3a3e44'; ctx.lineWidth = 0.6*S;
      ctx.beginPath(); ctx.moveTo(chX - galW, galY - 2.5*S); ctx.lineTo(chX + galW, galY - 2.5*S); ctx.stroke();
      ctx.beginPath(); for (let k = 0; k <= 4; k++) { const x = chX - galW + k*galW/2; ctx.moveTo(x, galY - 2.5*S); ctx.lineTo(x, galY); } ctx.stroke();
    }
    ctx.fillStyle = '#1a1612'; ctx.beginPath(); ctx.ellipse(chX, chTop, ctw + 1*S, 2.2*S, 0, 0, TAU); ctx.fill();
    // aviation light
    const avOn = Math.sin(t * 3) > 0.3;
    ctx.fillStyle = avOn ? '#ff3020' : '#5a1810';
    ctx.beginPath(); ctx.arc(chX + ctw - 0.5*S, chTop - 1.5*S, 1.4*S, 0, TAU); ctx.fill();
    if (avOn && detail) { ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(chX + ctw - 0.5*S, chTop - 1.5*S, 3.5*S, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }

    // ── Boiler house ──
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bhX + 5*S, bhY + 6*S, bhW, bhH);
    ctx.fillStyle = hgrad(bhX, bhX + bhW, ['#a4583c', '#8a4630', '#663222']);
    ctx.fillRect(bhX, bhY, bhW, bhH);
    if (detail) {
      ctx.strokeStyle = 'rgba(40,16,8,0.32)'; ctx.lineWidth = 0.7*S;
      let row = 0;
      ctx.beginPath();
      for (let y = bhY + 4*S; y < bhY + bhH; y += 4*S, row++) {
        ctx.moveTo(bhX, y); ctx.lineTo(bhX + bhW, y);
        for (let x = bhX + (row % 2 ? 4*S : 0); x < bhX + bhW; x += 8*S) { ctx.moveTo(x, y - 4*S); ctx.lineTo(x, y); }
      }
      ctx.stroke();
    }
    // pilasters between the bays
    ctx.fillStyle = 'rgba(70,26,14,0.45)';
    [0, 1/3, 2/3, 1].forEach(f => ctx.fillRect(bhX + bhW*f - (f === 1 ? 4*S : f === 0 ? 0 : 2*S), bhY + 3*S, 4*S, bhH - 3*S));
    // stone cornice + plinth
    ctx.fillStyle = '#cdbf9f'; ctx.fillRect(bhX - 1*S, bhY, bhW + 2*S, 3*S);
    ctx.fillStyle = '#9a9284'; ctx.fillRect(bhX - 1*S, bhY + bhH - 4*S, bhW + 2*S, 4*S);
    // tall arched windows lit by the furnace
    [1/6, 1/2, 5/6].forEach((f, i) => {
      const ww = bhW*0.17, wx = bhX + bhW*f - ww/2, wy = bhY + bhH*0.14, wh = bhH*0.62;
      const arch = (x, y, ww2, hh, grow) => { ctx.beginPath(); ctx.moveTo(x - grow, y + hh + grow); ctx.lineTo(x - grow, y + ww2/2); ctx.arc(x + ww2/2, y + ww2/2, ww2/2 + grow, Math.PI, 0); ctx.lineTo(x + ww2 + grow, y + hh + grow); ctx.closePath(); };
      ctx.fillStyle = '#d8c8a8'; arch(wx, wy, ww, wh, 1.8*S); ctx.fill();   // stone surround
      ctx.fillStyle = '#1a100a'; arch(wx, wy, ww, wh, 0.8*S); ctx.fill();
      let wg;
      if (critical) {
        const k = 0.6 + 0.4*Math.sin(t*11 + i*1.7);
        wg = vgrad(wy, wy + wh, [`rgba(255,${lerpN(120, 220, k)},${lerpN(60, 140, k)},1)`, '#e02810']);
      } else if (fire > 0) {
        const fl = 0.08 * Math.sin(t*3.1 + i*2) + 0.05 * Math.sin(t*7.3 + i);
        const k = Math.max(0, Math.min(1, fire + fl));
        wg = vgrad(wy, wy + wh, [`rgb(255,${lerpN(150, 236, k)},${lerpN(60, 170, k)})`, `rgb(${lerpN(150, 230, k)},${lerpN(50, 84, k)},16)`]);
      } else {
        wg = vgrad(wy, wy + wh, ['#4a4e56', '#26282e']);
      }
      ctx.fillStyle = wg; arch(wx, wy, ww, wh, 0); ctx.fill();
      if (fire > 0 || critical) {
        // a darker band of boiler tubes behind the glass
        ctx.fillStyle = 'rgba(60,20,8,0.35)'; ctx.fillRect(wx, wy + wh*0.62, ww, wh*0.12);
      } else if (detail) {
        ctx.save(); arch(wx, wy, ww, wh, 0); ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath(); ctx.moveTo(wx, wy + wh*0.55); ctx.lineTo(wx + ww, wy + wh*0.3); ctx.lineTo(wx + ww, wy + wh*0.42); ctx.lineTo(wx, wy + wh*0.67); ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(30,16,8,0.8)'; ctx.lineWidth = 0.8*S;
      ctx.beginPath(); ctx.moveTo(wx + ww/2, wy + 1*S); ctx.lineTo(wx + ww/2, wy + wh);
      for (let k = 1; k < 4; k++) { const ly = wy + ww/2 + (wh - ww/2)*k/4; ctx.moveTo(wx, ly); ctx.lineTo(wx + ww, ly); }
      ctx.stroke();
      ctx.fillStyle = '#e4d8bc'; ctx.fillRect(wx + ww/2 - 1.2*S, wy - 2.6*S, 2.4*S, 2.6*S);   // keystone
    });
    // boiler pressure gauge: green / amber / red, needle on _cgPressure
    {
      const gX = bhX + bhW*0.5, gY = bhY + bhH*0.865, gR = 4.6*S;
      const A0 = Math.PI*0.75, A1 = Math.PI*2.25, ang = v => A0 + v*(A1 - A0);
      ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(gX, gY, gR + 1.2*S, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ece6d6'; ctx.beginPath(); ctx.arc(gX, gY, gR, 0, TAU); ctx.fill();
      ctx.lineWidth = 1.3*S;
      [[0, 0.6, '#3a9a40'], [0.6, 0.85, '#e0a020'], [0.85, 1, '#d02010']].forEach(([a, b, c]) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(gX, gY, gR - 1*S, ang(a), ang(b)); ctx.stroke(); });
      const nv = Math.min(1, pressure + (on ? Math.sin(t*23)*0.012 : 0));
      ctx.strokeStyle = nv >= 0.99 && blink ? '#ff2010' : '#1a1a1a'; ctx.lineWidth = 0.9*S;
      ctx.beginPath(); ctx.moveTo(gX, gY); ctx.lineTo(gX + Math.cos(ang(nv))*gR*0.85, gY + Math.sin(ang(nv))*gR*0.85); ctx.stroke();
      ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(gX, gY, 0.9*S, 0, TAU); ctx.fill();
      if (critical) { ctx.strokeStyle = blink ? '#ff3020' : '#701008'; ctx.lineWidth = 1.2*S; ctx.beginPath(); ctx.arc(gX, gY, gR + 1.8*S, 0, TAU); ctx.stroke(); }
    }
    // slate roof with a louvred ridge vent
    const rfY = bhY - 8*S;
    ctx.fillStyle = vgrad(rfY, bhY, ['#5a5f68', '#3a3e46', '#2a2d33']);
    ctx.beginPath(); ctx.moveTo(bhX - 3*S, bhY); ctx.lineTo(bhX + 2*S, rfY); ctx.lineTo(bhX + bhW - 2*S, rfY); ctx.lineTo(bhX + bhW + 3*S, bhY); ctx.closePath(); ctx.fill();
    if (detail) {
      ctx.strokeStyle = 'rgba(20,22,26,0.45)'; ctx.lineWidth = 0.6*S;
      ctx.beginPath(); for (let y = rfY + 2.5*S; y < bhY; y += 2.5*S) { ctx.moveTo(bhX - 2*S, y); ctx.lineTo(bhX + bhW + 2*S, y); } ctx.stroke();
    }
    const rvX = bhX + bhW*0.08, rvW = bhW*0.24, rvY = rfY - 5*S;
    rr(rvX, rvY, rvW, 5.5*S, 1*S, '#4a4e56', '#22252a', 0.7*S);
    for (let x = rvX + 2*S; x < rvX + rvW - 1.5*S; x += 2.6*S) {
      ctx.fillStyle = fire > 0 ? `rgba(255,${lerpN(120, 190, fire)},60,${0.45 + 0.4*fire})` : '#16181c';
      ctx.fillRect(x, rvY + 1.5*S, 1.2*S, 2.6*S);
    }

    // ── Coal bunker on the roof ──
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bkX + 4*S, bkY + 5*S, bkW, bkB - bkY);
    ctx.fillStyle = '#3a3e42';
    ctx.beginPath(); ctx.moveTo(bkX, bkB - 4*S); ctx.lineTo(bkX + bkW, bkB - 4*S); ctx.lineTo(bkX + bkW*0.7, bhY - 1*S); ctx.lineTo(bkX + bkW*0.3, bhY - 1*S); ctx.closePath(); ctx.fill();
    rr(bkX, bkY, bkW, bkB - bkY - 4*S, 1*S, hgrad(bkX, bkX + bkW, ['#7a7e84', '#5e6268', '#3a3e44']), '#1e2124', S);
    if (detail) {
      ctx.strokeStyle = 'rgba(20,22,26,0.4)'; ctx.lineWidth = 0.7*S;
      ctx.beginPath(); for (let x = bkX + 3*S; x < bkX + bkW - 2*S; x += 3*S) { ctx.moveTo(x, bkY + 2*S); ctx.lineTo(x, bkB - 5*S); } ctx.stroke();
    }
    // coal heaped over the rim, higher the fuller the hopper
    if (hopFill > 0.02) {
      ctx.fillStyle = '#121212';
      ctx.beginPath(); ctx.moveTo(bkX + 1.5*S, bkY + 1*S); ctx.quadraticCurveTo(bkX + bkW/2, bkY - 9*S*hopFill, bkX + bkW - 1.5*S, bkY + 1*S); ctx.closePath(); ctx.fill();
      if (detail) {
        ctx.fillStyle = 'rgba(150,150,160,0.45)';
        for (let k = 0; k < 6; k++) ctx.fillRect(bkX + bkW*(0.2 + k*0.12), bkY - 1*S - (k % 2)*2*S*hopFill, 1.1*S, 1.1*S);
      }
    }
    // sight glass: coal level
    {
      const sgX = bkX + bkW*0.68, sgY = bkY + 3*S, sgW = 3.5*S, sgH = bkB - bkY - 10*S;
      const empty = hopFill < 0.1 && e.powered && e._coalInConnected;
      rr(sgX - 0.8*S, sgY - 0.8*S, sgW + 1.6*S, sgH + 1.6*S, 1*S, '#1a1c1e');
      ctx.fillStyle = empty && blink ? '#a03020' : '#c8d0d6'; ctx.fillRect(sgX, sgY, sgW, sgH);
      ctx.fillStyle = '#141414'; ctx.fillRect(sgX, sgY + sgH*(1 - hopFill), sgW, sgH*hopFill);
    }

    // ── Chimney top: smoke follows the throttle ──
    if (on && e._scrubber) {
      // Scrubbed: flue gas has been washed, so the chimney breathes out a
      // white water-vapour plume instead of soot.
      ctx.fillStyle = `rgba(255,170,90,${0.12 + 0.08*Math.sin(t*6)})`; ctx.beginPath(); ctx.ellipse(chX, chTop, ctw - 2*S, 1.5*S, 0, 0, TAU); ctx.fill();
      _scrubberVapour(chX, chTop, S, t, throttle === 'overdrive' ? 7 : throttle === 'eco' ? 4 : 5, throttle === 'overdrive' ? 1.15 : 1);
    } else if (on) {
      // A light plume on Eco, thick dark smoke on Overdrive
      const puffs = throttle === 'overdrive' ? 10 : throttle === 'eco' ? 4 : 7;
      const soot  = throttle === 'overdrive' ? 40 : throttle === 'eco' ? -25 : 0;
      const size  = throttle === 'overdrive' ? 1.25 : throttle === 'eco' ? 0.8 : 1;
      ctx.fillStyle = `rgba(255,120,40,${0.3 + 0.2*Math.sin(t*6)})`; ctx.beginPath(); ctx.ellipse(chX, chTop, ctw - 2*S, 1.5*S, 0, 0, TAU); ctx.fill();
      for (let i = 0; i < puffs; i++) {
        const p = (t*0.3 + i/puffs) % 1;
        ctx.fillStyle = `rgba(${lerpN(90 - soot, 150 - soot, p)},${lerpN(84 - soot, 144 - soot, p)},${lerpN(76 - soot, 136 - soot, p)},${0.6*(1 - p)})`;
        ctx.beginPath(); ctx.arc(chX + Math.sin(i*2.1 + t)*3*S + p*18*S, chTop - 3*S - p*40*S, (4 + p*14)*size*S, 0, TAU); ctx.fill();
      }
    }
    if (critical || (!on && (e._cgTrip || 0) > 0)) {
      // Over-pressure (or a legacy safety trip): white steam jetting off the
      // safety valve on the boiler house roof
      const vx = bhX + bhW*0.36, vy = rfY;
      ctx.fillStyle = '#5a5e62'; ctx.fillRect(vx - 1.5*S, vy - 5*S, 3*S, 6*S);
      ctx.fillStyle = '#c03020'; ctx.fillRect(vx - 2.2*S, vy - 6*S, 4.4*S, 1.6*S);
      for (let i = 0; i < 8; i++) {
        const p = (t*1.4 + i/8) % 1;
        ctx.fillStyle = `rgba(240,242,245,${0.75*(1 - p)})`;
        ctx.beginPath(); ctx.arc(vx + Math.sin(i*1.7 + t*3)*2*S + p*6*S, vy - 6*S - p*30*S, (2 + p*9)*S, 0, TAU); ctx.fill();
      }
    }

    // ── Flue-gas scrubber (fitted from the panel) — absorber tower standing
    // on the boiler house's far corner beside the bunker, its outlet duct
    // carried over the bunker on struts into the chimney. ──
    if (e._scrubber) {
      const scX = px + w*0.53, scR = Math.min(12.5*S, w*0.062), scTop = py + h*0.06, scBase = bhY + 2*S;
      const dY = scTop + (scBase - scTop)*0.20;
      ctx.strokeStyle = '#2a3430'; ctx.lineWidth = 1.2*S;
      [bkX + bkW*0.25, bkX + bkW*0.75].forEach(sx => { ctx.beginPath(); ctx.moveTo(sx, dY); ctx.lineTo(sx, bkY - 2*S); ctx.stroke(); });
      _scrubberDuct([[scX - scR, dY], [chX + ctw + 1*S, dY]], S, t, on);
      _scrubberTower(scX, scTop, scBase, scR, S, t, on, -1);
    }

    // ── Turbine hall: steel cladding, a clerestory, and a skylight over
    // the turbine (HP + LP cylinders) and generator ──
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(thX + 5*S, thY + 6*S, thW, thH);
    ctx.fillStyle = hgrad(thX, thX + thW, ['#b0b8be', '#8e979e', '#667078']);
    ctx.fillRect(thX, thY, thW, thH);
    if (detail) {
      ctx.strokeStyle = 'rgba(30,36,40,0.28)'; ctx.lineWidth = S;
      ctx.beginPath(); for (let x = thX + 3*S; x < thX + thW; x += 3.5*S) { ctx.moveTo(x, thY + 7*S); ctx.lineTo(x, thY + thH); } ctx.stroke();
    }
    ctx.fillStyle = '#3a4046'; ctx.fillRect(thX - 2*S, thY - 3*S, thW + 4*S, 4*S);
    ctx.fillStyle = on ? `rgba(255,220,150,${0.75 + 0.2*Math.sin(t*1.5)})` : '#2a3036';
    ctx.fillRect(thX + 2*S, thY + 1.5*S, thW - 4*S, 3.5*S);
    const inX = thX + 4*S, inY = thY + 8*S, inW = thW - 8*S, inH = thH - 13*S;
    rr(inX, inY, inW, inH, 1.5*S, on ? '#2c3438' : '#1e2326', '#2a3036', S);
    if (on) { ctx.fillStyle = 'rgba(255,220,160,0.06)'; ctx.fillRect(inX, inY, inW, inH); }
    if (detail) {
      // crane rails and the overhead crane parked over the generator
      ctx.strokeStyle = '#6a6040'; ctx.lineWidth = 0.8*S;
      ctx.beginPath(); ctx.moveTo(inX + 1*S, inY + 2*S); ctx.lineTo(inX + inW - 1*S, inY + 2*S); ctx.moveTo(inX + 1*S, inY + inH - 2*S); ctx.lineTo(inX + inW - 1*S, inY + inH - 2*S); ctx.stroke();
    }
    {
      const ty = inY + inH/2, L = inW - 4*S, x0 = inX + 2*S;
      const hpX = x0, hpW = L*0.22, lpX = x0 + L*0.26, lpW = L*0.36, gnX = x0 + L*0.66, gnW = L*0.27;
      const hpH = Math.min(inH*0.45, 14*S), lpH = Math.min(inH*0.76, 24*S), gnH = Math.min(inH*0.6, 18*S);
      // shaft, with ticks that run while it turns
      ctx.strokeStyle = '#8a9096'; ctx.lineWidth = 1.6*S;
      ctx.beginPath(); ctx.moveTo(hpX, ty); ctx.lineTo(gnX + gnW + 3*S, ty); ctx.stroke();
      if (on && detail) {
        ctx.strokeStyle = '#2a2e32'; ctx.lineWidth = 0.7*S;
        ctx.setLineDash([1*S, 2.2*S]); ctx.lineDashOffset = -t*30*S;
        ctx.beginPath(); ctx.moveTo(hpX, ty); ctx.lineTo(gnX + gnW + 3*S, ty); ctx.stroke();
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }
      // HP cylinder: tapered casing
      ctx.fillStyle = vgrad(ty - hpH/2, ty + hpH/2, on ? ['#e6e2d6', '#b8b2a2', '#6e685a'] : ['#9a968c', '#7a766c', '#4a463e']);
      ctx.beginPath(); ctx.moveTo(hpX, ty - hpH*0.32); ctx.lineTo(hpX + hpW, ty - hpH/2); ctx.lineTo(hpX + hpW, ty + hpH/2); ctx.lineTo(hpX, ty + hpH*0.32); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2a2a26'; ctx.lineWidth = 0.7*S; ctx.stroke();
      // LP cylinder: big rounded casing with blade-ring bands
      rr(lpX, ty - lpH/2, lpW, lpH, lpH*0.3, vgrad(ty - lpH/2, ty + lpH/2, on ? ['#ece8dc', '#c4beae', '#76705e'] : ['#a09c92', '#807c72', '#4e4a42']), '#2a2a26', 0.8*S);
      ctx.strokeStyle = 'rgba(40,38,32,0.45)'; ctx.lineWidth = 0.8*S;
      ctx.beginPath(); for (let k = 1; k < 4; k++) { const x = lpX + lpW*k/4; ctx.moveTo(x, ty - lpH/2 + 1.5*S); ctx.lineTo(x, ty + lpH/2 - 1.5*S); } ctx.stroke();
      if (on) { ctx.fillStyle = `rgba(255,236,200,${0.12 + 0.08*Math.sin(t*5)})`; rr(lpX + 1*S, ty - lpH/2 + 1*S, lpW - 2*S, lpH*0.3, lpH*0.2); ctx.fill(); }
      // generator + exciter wheel
      rr(gnX, ty - gnH/2, gnW, gnH, gnH*0.35, vgrad(ty - gnH/2, ty + gnH/2, on ? ['#6ab07a', '#3a7a4a', '#1e4a2a'] : ['#4a6a52', '#34503c', '#1a2c20']), '#10200f', 0.8*S);
      ctx.strokeStyle = 'rgba(10,30,14,0.5)'; ctx.lineWidth = 0.7*S;
      ctx.beginPath(); for (let k = 1; k < 5; k++) { const x = gnX + gnW*k/5; ctx.moveTo(x, ty - gnH/2 + 1.5*S); ctx.lineTo(x, ty + gnH/2 - 1.5*S); } ctx.stroke();
      const exX = gnX + gnW + 2.5*S, exR = Math.min(4*S, gnH*0.3);
      ctx.fillStyle = '#1a1c1e'; ctx.strokeStyle = on ? '#d8dcde' : '#5a5e62'; ctx.lineWidth = 1*S;
      ctx.beginPath(); ctx.arc(exX, ty, exR, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.translate(exX, ty); ctx.rotate(on ? t*6 : 0.4);
      ctx.lineWidth = 0.8*S; ctx.beginPath(); for (let k = 0; k < 3; k++) { const a = k*TAU/3; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a)*exR*0.85, Math.sin(a)*exR*0.85); } ctx.stroke();
      ctx.restore();
      if (on) { ctx.fillStyle = `rgba(120,255,160,${0.12 + 0.1*Math.sin(t*6)})`; rr(gnX, ty - gnH/2, gnW, gnH, gnH*0.35); ctx.fill(); }
    }

    // ── Transformer: tank, fin banks, conservator, bushings ──
    ctx.strokeStyle = '#1e2226'; ctx.lineWidth = 2*S; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(thX + thW*0.72, thY - 3*S); ctx.lineTo(thX + thW*0.72, tfY + tfH); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(tfX + 4*S, tfY + 5*S, tfW, tfH);
    for (const [fx, fw] of [[tfX, tfW*0.2], [tfX + tfW*0.8, tfW*0.2]]) {
      ctx.fillStyle = '#4a584a'; ctx.fillRect(fx, tfY + 1.5*S, fw, tfH - 3*S);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.8*S;
      ctx.beginPath(); for (let x = fx + 1.5*S; x < fx + fw; x += 2*S) { ctx.moveTo(x, tfY + 2*S); ctx.lineTo(x, tfY + tfH - 2*S); } ctx.stroke();
    }
    rr(tfX + tfW*0.2, tfY, tfW*0.6, tfH, 1.5*S, vgrad(tfY, tfY + tfH, ['#748674', '#5a6a5a', '#3c4a3c']), '#1e261e', 0.9*S);
    if (detail) {
      // conservator tank + rating plate
      rr(tfX + tfW*0.24, tfY - 5.5*S, tfW*0.18, 4*S, 2*S, '#5a6a5a', '#1e261e', 0.6*S);
      ctx.fillStyle = 'rgba(200,204,190,0.55)'; ctx.fillRect(tfX + tfW*0.45, tfY + tfH*0.58, tfW*0.08, tfH*0.18);
    }
    for (let k = 0; k < 3; k++) {
      const ix = tfX + tfW*(0.48 + k*0.12), iy = tfY - 1*S;
      ctx.fillStyle = '#c8704a';
      for (let q = 0; q < 3; q++) { ctx.beginPath(); ctx.ellipse(ix, iy - q*2.6*S, 2.2*S, 1.1*S, 0, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#9aa0a6'; ctx.fillRect(ix - 0.5*S, iy - 9*S, 1*S, 2.5*S);
      if (on && Math.sin(t*11 + k*2.3) > 0.9) {
        ctx.strokeStyle = 'rgba(210,245,255,0.95)'; ctx.lineWidth = 1.1*S;
        ctx.beginPath(); ctx.moveTo(ix, iy - 9*S); ctx.lineTo(ix + 3*S, iy - 12*S); ctx.lineTo(ix - 1*S, iy - 15*S); ctx.stroke();
      }
    }

    // ── Ash silo on legs, its gauge, and the pile under the chute ──
    const apX = asX + asW*0.5, apY = asY + asH + 14*S, apR = (5 + 9*ash)*S;
    ctx.fillStyle = '#2a2c30';
    for (const f of [0.12, 0.88]) ctx.fillRect(asX + asW*f - 0.8*S, asY + asH, 1.6*S, 11*S);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(asX + 4*S, asY + 5*S, asW, asH);
    ctx.fillStyle = '#4e5256'; ctx.strokeStyle = '#2a2c30'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.moveTo(asX, asY + asH); ctx.lineTo(asX + asW, asY + asH); ctx.lineTo(asX + asW*0.62, asY + asH + 7*S); ctx.lineTo(asX + asW*0.38, asY + asH + 7*S); ctx.closePath(); ctx.fill(); ctx.stroke();
    rr(asX, asY - 2*S, asW, asH + 2*S, 2*S, hgrad(asX, asX + asW, ['#8a8e92', '#a8acb0', '#5a5e62']), '#2a2c30', S);
    {
      const gX = asX + asW*0.7, gY = asY, gW = 2.6*S, gH = asH - 1*S;
      ctx.fillStyle = '#121416'; ctx.fillRect(gX, gY, gW, gH);
      ctx.fillStyle = ash >= 1 ? (blink ? '#ff4020' : '#802010') : ash > 0.8 ? '#e0a020' : '#b8b4ac';
      ctx.fillRect(gX, gY + gH*(1 - ash), gW, gH*ash);
    }
    if (ash > 0.01) {
      ctx.fillStyle = hgrad(apX - apR, apX + apR, ['#b8b4ac', '#9a968e', '#6a6660']);
      ctx.beginPath(); ctx.moveTo(apX - apR, apY); ctx.quadraticCurveTo(apX, apY - apR*1.1, apX + apR, apY); ctx.closePath(); ctx.fill();
      if (ash >= 1 && Math.sin(t*5) > 0) { ctx.strokeStyle = '#ff4020'; ctx.lineWidth = 1.5*S; ctx.stroke(); }
    }
    ctx.lineJoin = 'miter';

    // ── Status plate ──
    const offReason = e._decommissioned ? 'DECOMMISSIONED'   // a cleanup job's unit: only its ash matters
                    : (e._ashWaste || 0) >= 100 ? 'ASH FULL'
                    : e._waterShort ? 'LOW WATER'
                    : !e._hasWater ? 'NO WATER'
                    : !e._fuelled ? 'NO FUEL' : 'NO POWER';
    const plateTxt = on ? `COAL  ${formatPower(Math.round(e.def?.powerOutput ?? EntityDefs[T.COALGENERATOR].powerOutput))}` : offReason;
    _wfPlate(plateTxt, px + w*(e._scrubber ? 0.765 : 0.72), py + h*0.075, S, on ? '#ff9040' : '#c07050', true);

    const outputLabelY = py + h - TILE - 5;

    // ── Connection stubs (Coal IN / Water IN) ─────────────
    // Port centres are unchanged (CoalGeneratorConnections): Coal IN sits
    // mid-tile on the bottom row's left edge, Water IN on the bottom edge
    // under the middle column. Ash is trucked away, so there is no outlet.
    {
      const pScale = Math.min(w, h) / 96;
      const STUB_INSET = pScale * 3;
      const gy = py + h - TILE / 2;
      const tag = (text, x, y, align, accent, lit) => {
        ctx.font = `bold ${Math.max(3.5, 4*S)}px Courier New`;
        const tw = ctx.measureText(text).width + 8.5*S, th = 7*S;
        const x0 = align === 'left' ? x : align === 'right' ? x - tw : x - tw/2;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.roundRect(x0 + 1*S, y - th/2 + 1.5*S, tw, th, 3*S); ctx.fill();
        ctx.fillStyle = '#16181c'; ctx.strokeStyle = lit ? accent : '#3a3e44'; ctx.lineWidth = 0.9*S;
        ctx.beginPath(); ctx.roundRect(x0, y - th/2, tw, th, 3*S); ctx.fill(); ctx.stroke();
        ctx.fillStyle = lit ? accent : '#4a4e54';
        ctx.beginPath(); ctx.arc(x0 + 3.3*S, y, 1.3*S, 0, Math.PI*2); ctx.fill();
        if (lit) { ctx.fillStyle = accent; ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(x0 + 3.3*S, y, 2.6*S, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }
        ctx.fillStyle = lit ? '#f2f4f0' : '#9aa0a6';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(text, x0 + 6*S, y + 0.3*S);
        ctx.textBaseline = 'alphabetic';
      };
      // Steel receiving hopper: trapezoid pit, hazard lip, grate, heap inside
      const hopper = (hcx, fillRGB, heapCols, connected, accent) => {
        const topW = 22*S, botW = 12*S, top = gy - 9*S, bot = gy + 9*S;
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.beginPath(); ctx.moveTo(hcx - topW/2 + 3*S, top + 4*S); ctx.lineTo(hcx + topW/2 + 3*S, top + 4*S); ctx.lineTo(hcx + botW/2 + 3*S, bot + 4*S); ctx.lineTo(hcx - botW/2 + 3*S, bot + 4*S); ctx.closePath(); ctx.fill();
        const sg = ctx.createLinearGradient(hcx - topW/2, 0, hcx + topW/2, 0);
        sg.addColorStop(0, '#7a7e84'); sg.addColorStop(0.5, '#5a5e64'); sg.addColorStop(1, '#3a3e44');
        ctx.fillStyle = sg; ctx.strokeStyle = '#1e2024'; ctx.lineWidth = S;
        ctx.beginPath(); ctx.moveTo(hcx - topW/2, top); ctx.lineTo(hcx + topW/2, top); ctx.lineTo(hcx + botW/2, bot); ctx.lineTo(hcx - botW/2, bot); ctx.closePath(); ctx.fill(); ctx.stroke();
        // pit mouth
        const mx = hcx - topW/2 + 3*S, my = top + 5*S, mw = topW - 6*S, mh = 10*S;
        ctx.fillStyle = '#0c0c0e'; ctx.fillRect(mx, my, mw, mh);
        if (connected) {
          heapCols.forEach((c, k) => {
            ctx.fillStyle = c;
            for (let j = 0; j < 5; j++) {
              const lx = mx + mw*(0.12 + ((j*0.37 + k*0.21) % 0.8)), ly = my + mh*(0.45 + k*0.18) + Math.sin(j + k)*1.2*S;
              ctx.beginPath(); ctx.arc(lx, ly, (1.4 + (j % 2)*0.6)*S, 0, Math.PI*2); ctx.fill();
            }
          });
        }
        ctx.strokeStyle = '#8a8e94'; ctx.lineWidth = 0.9*S;
        for (let gx = mx + 3*S; gx < mx + mw; gx += 3.2*S) { ctx.beginPath(); ctx.moveTo(gx, my); ctx.lineTo(gx, my + mh); ctx.stroke(); }
        ctx.strokeStyle = '#1e2024'; ctx.lineWidth = 0.8*S; ctx.strokeRect(mx, my, mw, mh);
        // hazard lip
        ctx.save(); ctx.beginPath(); ctx.rect(hcx - topW/2, top - 3*S, topW, 3.5*S); ctx.clip();
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(hcx - topW/2, top - 3*S, topW, 3.5*S);
        ctx.fillStyle = '#e0b020';
        for (let x = hcx - topW/2 - 4*S; x < hcx + topW/2; x += 5*S) { ctx.beginPath(); ctx.moveTo(x, top + 0.5*S); ctx.lineTo(x + 2.5*S, top + 0.5*S); ctx.lineTo(x + 5.5*S, top - 3*S); ctx.lineTo(x + 3*S, top - 3*S); ctx.closePath(); ctx.fill(); }
        ctx.restore();
        ctx.strokeStyle = '#1e2024'; ctx.lineWidth = 0.8*S; ctx.strokeRect(hcx - topW/2, top - 3*S, topW, 3.5*S);
        // status rivet lamp on the chute
        ctx.fillStyle = connected ? accent : '#2a2c30';
        ctx.beginPath(); ctx.arc(hcx, bot - 3*S, 1.5*S, 0, Math.PI*2); ctx.fill();
        if (connected) { ctx.globalAlpha = 0.35 + 0.2*Math.sin(t*3); ctx.beginPath(); ctx.arc(hcx, bot - 3*S, 3.5*S, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }
      };

      // Coal IN — receiving hopper feeding the conveyor foot
      {
        const hcx = px + 11*S;
        const con = !!e._coalInConnected;
        hopper(hcx, null, ['#2a2a2e', '#18181a', '#3a3a40'], con, '#a8e050');
        tag('COAL IN', hcx + 12.5*S, gy + 4*S, 'left', '#a8e050', con);
      }

      // Water IN — flanged inlet with a gate valve and handwheel
      {
        const sx = waterX, bot = py + h - STUB_INSET*0.5;
        const con = !!e._waterInConnected;
        const blue = con ? '#5ac0ff' : '#3a5a70';
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(sx - 2.5*S + 3*S, bot - 14*S + 3*S, 5*S, 14*S);
        ctx.fillStyle = '#5a6a74'; ctx.fillRect(sx - 2.5*S, bot - 14*S, 5*S, 14*S);
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(sx - 2.5*S, bot - 14*S, 1.4*S, 14*S);
        // end flange with bolts
        ctx.fillStyle = '#7a8a94'; ctx.strokeStyle = '#1e262c'; ctx.lineWidth = 0.9*S;
        ctx.beginPath(); ctx.roundRect(sx - 5*S, bot - 3*S, 10*S, 3*S, 1*S); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#2a3238';
        [-3.2, -1.1, 1.1, 3.2].forEach(o => { ctx.beginPath(); ctx.arc(sx + o*S, bot - 1.5*S, 0.6*S, 0, Math.PI*2); ctx.fill(); });
        // gate valve body (bowtie) + handwheel
        const vy = bot - 9*S;
        ctx.fillStyle = '#4a5a64';
        ctx.beginPath(); ctx.moveTo(sx - 5*S, vy - 3.5*S); ctx.lineTo(sx, vy); ctx.lineTo(sx - 5*S, vy + 3.5*S); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx + 5*S, vy - 3.5*S); ctx.lineTo(sx, vy); ctx.lineTo(sx + 5*S, vy + 3.5*S); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.translate(sx, vy); ctx.rotate(con ? 0.4 : 0);
        ctx.strokeStyle = con ? '#3a8ad0' : '#8a3a30'; ctx.lineWidth = 1.3*S;
        ctx.beginPath(); ctx.arc(0, 0, 3.6*S, 0, Math.PI*2); ctx.stroke();
        ctx.lineWidth = 0.9*S;
        for (let k = 0; k < 3; k++) { ctx.rotate(Math.PI/3); ctx.beginPath(); ctx.moveTo(-3.6*S, 0); ctx.lineTo(3.6*S, 0); ctx.stroke(); }
        ctx.restore();
        ctx.fillStyle = '#1e262c'; ctx.beginPath(); ctx.arc(sx, vy, 1*S, 0, Math.PI*2); ctx.fill();
        if (con && e.powered) {
          const p = (t*0.8) % 1;
          ctx.fillStyle = `rgba(160,220,255,${0.9*(1 - p)})`;
          ctx.beginPath(); ctx.arc(sx, bot - 4*S - p*10*S, 0.9*S, 0, Math.PI*2); ctx.fill();
        }
        tag('WATER IN', sx, bot - 20*S, 'center', blue, con);
      }

    }

    ctx.restore();
    drawNetworkHighlight(e, px, py, t);
  }

// ── Waste Processing Facilities ───────────────────────────────────────────
// Shared helpers for the three facilities. Everything scales off S (1.0 at
// the default 40px TILE) and the footprint comes from the entity, falling
// back to the def, so the placement ghost (render_core) and a placed
// building draw identically. fill is stored waste / storageCapacity and
// drives the stockpile, lagoon and cask-yard visuals as well as the gauges.
function _wfDims(e, type) {
  const def = EntityDefs[type];
  const W = (e.width  || def.width)  * TILE;
  const H = (e.height || def.height) * TILE;
  const cap = def.storageCapacity || 300;
  return { W, H, S: TILE / 40, fill: Math.max(0, Math.min(1, (e._wasteStored || 0) / cap)) };
}

function _wfShadow(x, y, w, h, S, r) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.roundRect(x+4*S, y+5*S, w, h, r); ctx.fill();
}

function _wfHazardStripe(x, y, w, h, S) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = '#1a1608'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#d8a820';
  const step = 10*S;
  for (let i = -h; i < w + h; i += step) {
    ctx.beginPath();
    ctx.moveTo(x+i, y+h); ctx.lineTo(x+i+step/2, y+h);
    ctx.lineTo(x+i+step/2+h, y); ctx.lineTo(x+i+h, y);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// A wisp of smoke or steam off a vent. It builds up rather than switching
// on: when `on` goes true the first puffs come out of the vent and the
// column climbs to full height and thickens over SMOKE_RISE seconds; when it
// goes false the column stops being fed and thins away over SMOKE_FALL.
// Each vent is remembered by where it is (callers pass no entity), on the
// real clock so a paused or fast-forwarded game still ramps smoothly.
//
// The levels are saved with the game (_wfSmokeSave / _wfSmokeLoad), so a
// reload picks every vent up where it was. A vent first seen running with
// nothing saved for it (an older save, or one that started off-screen)
// starts at full; only a start that is seen happen builds up. And a vent
// only starts thinning once it has been off for SMOKE_HOLD seconds: just
// after a load a turbine can read idle for a moment while its steam line
// refills, and that blink must not empty the wisp and grow it back.
// For SMOKE_SETTLE seconds after a load the machines are still settling (a
// turbine's steam has to run back down its pipe before it reads as
// generating), so nothing thins in that window, and a vent that comes on
// within it was running all along: it goes straight to full.
const _wfSmokeState = new Map();
let _wfSmokeSweep = 0, _wfSmokeLoadedAt = -1e9;
const SMOKE_RISE = 4, SMOKE_FALL = 3, SMOKE_HOLD = 2, SMOKE_SETTLE = 20;
function _wfSmokeSave() {
  const out = [];
  for (const [k, s] of _wfSmokeState) if (s.lvl > 0.01) out.push([k, +s.lvl.toFixed(2)]);
  return out;
}
function _wfSmokeLoad(list) {
  _wfSmokeState.clear();
  const now = performance.now() / 1000;
  _wfSmokeLoadedAt = now;
  if (Array.isArray(list)) for (const [k, lvl] of list) if (typeof k === 'string' && lvl > 0) _wfSmokeState.set(k, { lvl, at: now, off: 0 });
}
function _wfSmoke(x, y, S, t, rgb, on, alpha) {
  const key = Math.round(x) + ',' + Math.round(y);
  const now = performance.now() / 1000;
  const settling = now - _wfSmokeLoadedAt < SMOKE_SETTLE;
  let st = _wfSmokeState.get(key);
  if (!st) {
    st = { lvl: on ? 1 : 0, at: now, off: 0 };
    _wfSmokeState.set(key, st);
  }
  const dt = Math.max(0, Math.min(0.5, now - st.at));
  st.at = now;
  st.off = on ? 0 : (st.off || 0) + dt;
  if (on) st.lvl = settling ? 1 : Math.min(1, st.lvl + dt / SMOKE_RISE);
  else if (st.off > SMOKE_HOLD && !settling) st.lvl = Math.max(0, st.lvl - dt / SMOKE_FALL);
  if (now - _wfSmokeSweep > 30) {                     // forget vents not drawn for a few minutes
    for (const [k, s] of _wfSmokeState) if (now - s.at > 180) _wfSmokeState.delete(k);
    _wfSmokeSweep = now;
  }
  if (st.lvl <= 0.001) return;
  // While building up, only the puffs that have climbed no higher than the
  // column has reached are drawn, feathered at its head; the whole wisp is
  // thinner until it is up to strength.
  const reach = st.lvl, dens = Math.sqrt(st.lvl);
  for (let i = 0; i < 5; i++) {
    const ph = (t*0.35 + i/5) % 1;
    const head = reach >= 1 ? 1 : Math.max(0, Math.min(1, (reach - ph) / 0.2));
    if (head <= 0) continue;
    ctx.fillStyle = `rgba(${rgb},${alpha*(1-ph)*dens*head})`;
    ctx.beginPath();
    ctx.arc(x + Math.sin(ph*3 + i)*4*S + ph*16*S, y - ph*44*S, (4 + ph*13)*S, 0, Math.PI*2);
    ctx.fill();
  }
}

function _wfGauge(x, y, w, h, S, fill, accent, on) {
  ctx.fillStyle = '#0c0b08'; ctx.strokeStyle = '#4a4436'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 2*S); ctx.fill(); ctx.stroke();
  const ih = (h - 4*S) * fill;
  // Nearly full blinks red so a backed-up facility is spottable at a glance
  const warn = fill >= 0.9 && on && Math.sin(performance.now() / 180) > 0;
  ctx.fillStyle = warn ? '#ff4030' : accent;
  ctx.globalAlpha = on ? 0.85 : 0.4;
  ctx.fillRect(x+2*S, y+h-2*S-ih, w-4*S, ih);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 0.8*S;
  for (let i = 1; i < 4; i++) {
    const ly = y + h*i/4;
    ctx.beginPath(); ctx.moveTo(x+1*S, ly); ctx.lineTo(x+w*0.45, ly); ctx.stroke();
  }
}

function _wfLamp(x, y, S, t, accent, on) {
  ctx.fillStyle = '#0a0a08';
  ctx.beginPath(); ctx.arc(x, y, 5*S, 0, Math.PI*2); ctx.fill();
  const a = on ? 0.7 + 0.3*Math.sin(t*3) : 0.3;
  ctx.fillStyle = on ? accent : '#403828';
  ctx.globalAlpha = a;
  ctx.beginPath(); ctx.arc(x, y, 3.2*S, 0, Math.PI*2); ctx.fill();
  if (on) { ctx.globalAlpha = a*0.25; ctx.beginPath(); ctx.arc(x, y, 9*S, 0, Math.PI*2); ctx.fill(); }
  ctx.globalAlpha = 1;
}

function _wfPlate(text, cx, cy, S, accent, on) {
  ctx.font = `bold ${Math.max(7, 8*S)}px Courier New`;
  const tw = ctx.measureText(text).width + 10*S;
  ctx.fillStyle = 'rgba(8,8,6,0.85)'; ctx.strokeStyle = on ? accent : '#4a4232'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.roundRect(cx - tw/2, cy - 7*S, tw, 13*S, 2*S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = on ? accent : '#7a6e58';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
  ctx.textBaseline = 'alphabetic';
}

// Moving belt between two points; dashes crawl toward (x2, y2) while powered.
function _wfConveyor(x1, y1, x2, y2, S, t, on, beltColor) {
  const line = () => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 10*S;
  ctx.save(); ctx.translate(3*S, 4*S); line(); ctx.restore();
  ctx.strokeStyle = '#1a1814'; ctx.lineWidth = 9*S; line();
  ctx.strokeStyle = '#3a342a'; ctx.lineWidth = 6*S; line();
  ctx.strokeStyle = beltColor; ctx.lineWidth = 3*S;
  ctx.setLineDash([4*S, 5*S]); ctx.lineDashOffset = on ? -t*20*S : 0;
  line();
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
}

// Pipe along a polyline; flowing dashes while powered.
function _wfPipe(pts, S, t, on, color) {
  const path = () => {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  };
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = '#141410'; ctx.lineWidth = 7*S; path();
  ctx.strokeStyle = '#4a4c40'; ctx.lineWidth = 4.5*S; path();
  if (on) {
    ctx.strokeStyle = color; ctx.lineWidth = 2*S;
    ctx.setLineDash([3*S, 6*S]); ctx.lineDashOffset = -t*16*S;
    path();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }
}

function _wfTrefoil(cx, cy, r, bg, fg) {
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = fg;
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI/2 + i*2*Math.PI/3;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r*0.85, a - Math.PI/6, a + Math.PI/6); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, r*0.3, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(cx, cy, r*0.17, 0, Math.PI*2); ctx.fill();
}

// ── Coal Waste Processing Facility (8×7) ──
// Sawtooth-roof processing hall feeding a spinning rotary kiln; the kiln's
// residue rides a conveyor out to an ash stockpile that grows with stored
// waste. Chimney smokes and the skylights glow while powered.
function renderCoalWasteFacility(e, px, py, t) {
  const { W, H, S, fill } = _wfDims(e, T.COALWASTE);
  const on = e.powered;
  const accent = '#e0a040';
  ctx.save();

  // ── Processing hall ──
  const hx = px + W*0.05, hy = py + H*0.26, hw = W*0.46, roofH = H*0.42, wallH = H*0.17;
  _wfShadow(hx, hy, hw, roofH + wallH, S, 3*S);
  ctx.fillStyle = '#2a2620';
  ctx.beginPath(); ctx.roundRect(hx, hy, hw, roofH, 3*S); ctx.fill();
  const teeth = 5, bw = hw / teeth;
  for (let i = 0; i < teeth; i++) {
    const bx = hx + bw*i;
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, '#565046'); g.addColorStop(0.75, '#35302a'); g.addColorStop(1, '#221e1a');
    ctx.fillStyle = g;
    ctx.fillRect(bx + S, hy + 2*S, bw - 2*S, roofH - 4*S);
    ctx.fillStyle = on ? `rgba(255,180,70,${0.45 + 0.15*Math.sin(t*1.3 + i)})` : 'rgba(90,110,120,0.35)';
    ctx.fillRect(bx + bw - 7*S, hy + 5*S, 4*S, roofH - 10*S);
  }
  ctx.strokeStyle = '#5a5040'; ctx.lineWidth = 1.5*S;
  ctx.beginPath(); ctx.roundRect(hx, hy, hw, roofH, 3*S); ctx.stroke();

  const wy = hy + roofH;
  ctx.fillStyle = '#1e1a15'; ctx.fillRect(hx, wy, hw, wallH);
  ctx.strokeStyle = '#4a4032'; ctx.lineWidth = S; ctx.strokeRect(hx, wy, hw, wallH);
  for (let d = 0; d < 3; d++) {
    const dx = hx + hw*(0.07 + d*0.315), dw = hw*0.23, dy = wy + wallH*0.22, dh = wallH*0.78;
    if (d === 1) {
      const g = ctx.createLinearGradient(0, dy, 0, dy + dh);
      g.addColorStop(0, on ? `rgba(255,140,40,${0.85 + 0.15*Math.sin(t*5)})` : '#2a2016');
      g.addColorStop(1, on ? 'rgba(120,40,10,0.9)' : '#120e0a');
      ctx.fillStyle = g; ctx.fillRect(dx, dy, dw, dh);
    } else {
      ctx.fillStyle = '#3a342a'; ctx.fillRect(dx, dy, dw, dh);
      ctx.strokeStyle = '#26221c'; ctx.lineWidth = S;
      for (let k = 1; k < 5; k++) { const ly = dy + dh*k/5; ctx.beginPath(); ctx.moveTo(dx, ly); ctx.lineTo(dx + dw, ly); ctx.stroke(); }
    }
  }
  _wfHazardStripe(hx, wy + wallH + 3*S, hw, 5*S, S);

  // ── Chimney ──
  const chX = px + W*0.10, chTop = py + H*0.05, chBase = hy + roofH*0.4, chW = 15*S;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(chX - chW/2 + 5*S, chTop + 6*S, chW, chBase - chTop);
  const cg = ctx.createLinearGradient(chX - chW/2, 0, chX + chW/2, 0);
  cg.addColorStop(0, '#6a6258'); cg.addColorStop(0.5, '#4a443c'); cg.addColorStop(1, '#2a2620');
  ctx.fillStyle = cg; ctx.fillRect(chX - chW/2, chTop, chW, chBase - chTop);
  [0, 2].forEach(b => { ctx.fillStyle = '#a03020'; ctx.fillRect(chX - chW/2, chTop + b*6*S + 4*S, chW, 5*S); });
  ctx.fillStyle = '#1a1612';
  ctx.beginPath(); ctx.ellipse(chX, chTop, chW/2 + S, 3*S, 0, 0, Math.PI*2); ctx.fill();
  if (on) {
    ctx.fillStyle = `rgba(255,120,30,${0.35 + 0.2*Math.sin(t*6)})`;
    ctx.beginPath(); ctx.ellipse(chX, chTop, chW/2 - 2*S, 2*S, 0, 0, Math.PI*2); ctx.fill();
  }
  _wfSmoke(chX, chTop - 3*S, S, t, '110,104,96', on, 0.45);

  // ── Rotary kiln ──
  const kl = W*0.37, kr = 14*S;
  const kx = hx + hw + kl/2 - 4*S, ky = py + H*0.47, kAng = -0.16;
  ctx.save();
  ctx.translate(kx, ky); ctx.rotate(kAng);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-kl/2 + 4*S, -kr + 9*S, kl, kr*2);
  ctx.fillStyle = '#2c2822';
  [-0.28, 0.28].forEach(f => ctx.fillRect(kl*f - 7*S, 0, 14*S, kr + 10*S));
  const kg = ctx.createLinearGradient(0, -kr, 0, kr);
  kg.addColorStop(0, '#5a4c3a'); kg.addColorStop(0.3, '#9a8260'); kg.addColorStop(1, '#2e261c');
  ctx.fillStyle = kg;
  ctx.beginPath(); ctx.roundRect(-kl/2, -kr, kl, kr*2, 4*S); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.roundRect(-kl/2, -kr, kl, kr*2, 4*S); ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 2*S;
  const off = on ? (t*18*S) % (12*S) : 0;
  for (let x = -kl/2 - 12*S + off; x < kl/2 + 12*S; x += 12*S) {
    ctx.beginPath(); ctx.moveTo(x, -kr); ctx.lineTo(x + 5*S, kr); ctx.stroke();
  }
  // heat bloom along the underside near the burner
  if (on) {
    const hg = ctx.createLinearGradient(-kl/2, 0, kl*0.1, 0);
    hg.addColorStop(0, `rgba(255,110,30,${0.35 + 0.1*Math.sin(t*4)})`); hg.addColorStop(1, 'rgba(255,110,30,0)');
    ctx.fillStyle = hg; ctx.fillRect(-kl/2, -kr, kl, kr*2);
  }
  ctx.restore();
  ctx.fillStyle = '#231e17';
  [-0.28, 0.28].forEach(f => ctx.fillRect(kl*f - 3.5*S, -kr - 2*S, 7*S, kr*2 + 4*S));
  ctx.strokeStyle = '#5a4c38'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.roundRect(-kl/2, -kr, kl, kr*2, 4*S); ctx.stroke();
  // discharge hood on the far end
  ctx.fillStyle = '#3a342c'; ctx.strokeStyle = '#5a5040';
  ctx.beginPath(); ctx.roundRect(kl/2 - 4*S, -kr - 4*S, 12*S, kr*2 + 8*S, 2*S); ctx.fill(); ctx.stroke();
  ctx.restore();
  const kEndX = kx + Math.cos(kAng)*(kl/2 + 2*S), kEndY = ky + Math.sin(kAng)*(kl/2 + 2*S);

  // ── Ash stockpile — grows with stored waste ──
  const heapCX = px + W*0.78, heapBY = py + H*0.87;
  const heapRX = W*(0.09 + 0.07*fill), heapRY = H*(0.07 + 0.09*fill);
  const heapTop = heapBY - heapRY*1.5;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(heapCX + 5*S, heapBY + 2*S, heapRX*1.05, heapRY*0.4, 0, 0, Math.PI*2); ctx.fill();
  const hg = ctx.createLinearGradient(heapCX - heapRX, heapTop, heapCX + heapRX, heapBY);
  hg.addColorStop(0, '#77716a'); hg.addColorStop(0.5, '#4c4740'); hg.addColorStop(1, '#27241f');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(heapCX - heapRX, heapBY);
  ctx.quadraticCurveTo(heapCX - heapRX*0.25, heapTop - heapRY*0.35, heapCX, heapTop);
  ctx.quadraticCurveTo(heapCX + heapRX*0.25, heapTop - heapRY*0.35, heapCX + heapRX, heapBY);
  ctx.ellipse(heapCX, heapBY, heapRX, heapRY*0.35, 0, 0, Math.PI);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(18,16,12,0.55)';
  for (let i = 0; i < 16; i++) {
    const fx = Math.sin(i*12.9898) * 0.5, fy = Math.sin(i*78.233) * 0.5 + 0.5;
    ctx.beginPath();
    ctx.arc(heapCX + fx*heapRX*1.5*(1 - fy*0.7), heapBY - fy*(heapBY - heapTop)*0.85, 1.4*S, 0, Math.PI*2);
    ctx.fill();
  }

  _wfConveyor(kEndX + 4*S, kEndY + 6*S, heapCX, heapTop + 2*S, S, t, on, '#7a7266');
  if (on) {
    // ash trickling off the belt head
    for (let i = 0; i < 3; i++) {
      const ph = (t*1.4 + i/3) % 1;
      ctx.fillStyle = `rgba(150,140,125,${0.8*(1-ph)})`;
      ctx.beginPath(); ctx.arc(heapCX + (i-1)*2*S, heapTop + 2*S + ph*8*S, 1.3*S, 0, Math.PI*2); ctx.fill();
    }
  }

  // ── Ash silo + gauge ──
  const sX = px + W*0.70, sY = py + H*0.09, sW = W*0.14, sH = H*0.22;
  _wfShadow(sX, sY, sW, sH, S, 3*S);
  const sg = ctx.createLinearGradient(sX, 0, sX + sW, 0);
  sg.addColorStop(0, '#7a7468'); sg.addColorStop(0.4, '#5a554c'); sg.addColorStop(1, '#2c2924');
  ctx.fillStyle = sg; ctx.fillRect(sX, sY, sW, sH);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = S;
  [0.33, 0.66].forEach(f => { ctx.beginPath(); ctx.moveTo(sX, sY + sH*f); ctx.lineTo(sX + sW, sY + sH*f); ctx.stroke(); });
  ctx.fillStyle = '#8a8478';
  ctx.beginPath(); ctx.ellipse(sX + sW/2, sY, sW/2, 4*S, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#3a362e';
  ctx.beginPath(); ctx.arc(sX + sW/2, sY, 3*S, 0, Math.PI*2); ctx.fill();
  _wfGauge(px + W*0.88, py + H*0.11, 8*S, H*0.22, S, fill, accent, on);

  _wfPlate('COAL ASH PROCESSING', px + W*0.44, py + H*0.08, S, accent, on);
  _wfLamp(px + W - 11*S, py + 11*S, S, t, accent, on);
  ctx.restore();
}

// ── Oil Waste Processing Facility (8×9) ──
// Clarifier basin with a sweeping skimmer bridge, twin digester tanks whose
// rim bands fill with stored waste, a fan-cooled treatment building, a
// bubbling sludge lagoon that rises with storage, and a flare stack.
function renderOilWasteFacility(e, px, py, t) {
  const { W, H, S, fill } = _wfDims(e, T.OILWASTE);
  const on = e.powered;
  const accent = '#70d050';
  ctx.save();

  // ── Pipework (drawn first so equipment sits on top) ──
  const ccx = px + W*0.30, ccy = py + H*0.31, cr = W*0.21;
  const t1x = px + W*0.76, t1y = py + H*0.19, t2y = py + H*0.44, tr = W*0.115;
  const rackX = px + W*0.60;
  _wfPipe([[ccx + cr, ccy], [rackX, ccy], [rackX, t1y], [t1x - tr, t1y]], S, t, on, accent);
  _wfPipe([[rackX, ccy], [rackX, t2y], [t1x - tr, t2y]], S, t, on, accent);
  _wfPipe([[t1x, t2y + tr], [t1x, py + H*0.62]], S, t, on, '#90a040');

  // ── Clarifier ──
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.arc(ccx + 5*S, ccy + 6*S, cr, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#4a4a42';
  ctx.beginPath(); ctx.arc(ccx, ccy, cr, 0, Math.PI*2); ctx.fill();
  const wg = ctx.createRadialGradient(ccx - cr*0.3, ccy - cr*0.3, cr*0.1, ccx, ccy, cr);
  wg.addColorStop(0, '#3a5a2a'); wg.addColorStop(0.6, '#1c3016'); wg.addColorStop(1, '#0c160a');
  ctx.fillStyle = wg;
  ctx.beginPath(); ctx.arc(ccx, ccy, cr - 6*S, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#6a6a5e'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.arc(ccx, ccy, cr - 10*S, 0, Math.PI*2); ctx.stroke();
  // oily sheen swirling
  ctx.lineWidth = 2*S;
  [[0.62, 'rgba(160,120,220,0.18)'], [0.42, 'rgba(120,220,160,0.18)'], [0.78, 'rgba(230,200,90,0.14)']].forEach(([rf, col], i) => {
    const a0 = (on ? t*0.5 : 0) * (i % 2 ? -1 : 1) + i*2;
    ctx.strokeStyle = col;
    ctx.beginPath(); ctx.arc(ccx, ccy, cr*rf, a0, a0 + 1.6); ctx.stroke();
  });
  const bAng = on ? t*0.4 : 0.6;
  ctx.save();
  ctx.translate(ccx, ccy); ctx.rotate(bAng);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-cr + 6*S, 1*S, 2*(cr - 6*S), 7*S);
  ctx.fillStyle = '#8a8470'; ctx.strokeStyle = '#3a382e'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.rect(-cr + 4*S, -3*S, 2*(cr - 4*S), 6*S); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#5a5648';
  for (let x = -cr + 10*S; x < cr - 6*S; x += 7*S) { ctx.beginPath(); ctx.moveTo(x, -3*S); ctx.lineTo(x + 3.5*S, 3*S); ctx.stroke(); }
  ctx.fillStyle = '#d8a820'; ctx.fillRect(cr - 10*S, -5*S, 8*S, 10*S);
  ctx.restore();
  ctx.fillStyle = '#5a564a';
  ctx.beginPath(); ctx.arc(ccx, ccy, 9*S, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = on ? accent : '#2a3a22';
  ctx.globalAlpha = on ? 0.6 + 0.3*Math.sin(t*3) : 1;
  ctx.beginPath(); ctx.arc(ccx, ccy, 4*S, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;

  // ── Digester tanks ──
  [t1y, t2y].forEach((ty, idx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(t1x + 5*S, ty + 6*S, tr, 0, Math.PI*2); ctx.fill();
    const dg = ctx.createRadialGradient(t1x - tr*0.35, ty - tr*0.35, tr*0.1, t1x, ty, tr);
    dg.addColorStop(0, '#7a8a66'); dg.addColorStop(0.55, '#3e4a34'); dg.addColorStop(1, '#1a2016');
    ctx.fillStyle = dg;
    ctx.beginPath(); ctx.arc(t1x, ty, tr, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = S;
    for (let k = 0; k < 8; k++) {
      const a = k*Math.PI/4;
      ctx.beginPath(); ctx.moveTo(t1x + Math.cos(a)*tr*0.25, ty + Math.sin(a)*tr*0.25); ctx.lineTo(t1x + Math.cos(a)*tr*0.92, ty + Math.sin(a)*tr*0.92); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(t1x, ty, tr*0.6, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = '#2a3222'; ctx.strokeStyle = '#5a6a4a';
    ctx.beginPath(); ctx.rect(t1x - 4*S, ty - 4*S, 8*S, 8*S); ctx.fill(); ctx.stroke();
    // rim band doubles as a fill gauge (tank 1 fills first, then tank 2)
    const tf = Math.max(0, Math.min(1, fill*2 - idx));
    ctx.strokeStyle = '#141810'; ctx.lineWidth = 3.5*S;
    ctx.beginPath(); ctx.arc(t1x, ty, tr - 2*S, 0, Math.PI*2); ctx.stroke();
    if (tf > 0) {
      ctx.strokeStyle = accent; ctx.globalAlpha = on ? 0.9 : 0.45; ctx.lineWidth = 2.5*S;
      ctx.beginPath(); ctx.arc(t1x, ty, tr - 2*S, -Math.PI/2, -Math.PI/2 + Math.PI*2*tf); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  });

  // ── Treatment building ──
  const bx = px + W*0.05, by = py + H*0.60, bw = W*0.41, roofH = H*0.20, wallH = H*0.07;
  _wfShadow(bx, by, bw, roofH + wallH, S, 3*S);
  ctx.fillStyle = '#2e3628'; ctx.strokeStyle = '#4e5a40'; ctx.lineWidth = 1.5*S;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, roofH, 3*S); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = S;
  for (let k = 1; k < 6; k++) { const lx = bx + bw*k/6; ctx.beginPath(); ctx.moveTo(lx, by + 2*S); ctx.lineTo(lx, by + roofH - 2*S); ctx.stroke(); }
  [0.28, 0.72].forEach((f, i) => {
    const fx = bx + bw*f, fy = by + roofH*0.5, fr = 11*S;
    ctx.fillStyle = '#1a1e16'; ctx.strokeStyle = '#6a7458'; ctx.lineWidth = 1.5*S;
    ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(fx, fy); ctx.rotate(on ? t*7 + i : 0.4);
    ctx.fillStyle = '#7a8468';
    for (let b = 0; b < 3; b++) {
      ctx.rotate(Math.PI*2/3);
      ctx.beginPath(); ctx.ellipse(fr*0.45, 0, fr*0.45, 2.8*S, 0.3, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#3a4032'; ctx.beginPath(); ctx.arc(fx, fy, 2.5*S, 0, Math.PI*2); ctx.fill();
  });
  const bwy = by + roofH;
  ctx.fillStyle = '#1a2016'; ctx.fillRect(bx, bwy, bw, wallH);
  ctx.strokeStyle = '#3a4430'; ctx.lineWidth = S; ctx.strokeRect(bx, bwy, bw, wallH);
  for (let k = 0; k < 5; k++) {
    const wx = bx + bw*(0.06 + k*0.18), ww = bw*0.10;
    ctx.fillStyle = on ? `rgba(110,230,80,${0.45 + 0.2*Math.sin(t*2 + k)})` : 'rgba(40,60,30,0.6)';
    ctx.fillRect(wx, bwy + wallH*0.25, ww, wallH*0.45);
  }
  _wfHazardStripe(bx, bwy + wallH + 3*S, bw, 5*S, S);
  _wfGauge(px + W*0.485, by + 2*S, 8*S, roofH + wallH, S, fill, accent, on);

  // ── Sludge lagoon — level rises with stored waste ──
  const lx = px + W*0.54, ly = py + H*0.60, lw = W*0.33, lh = H*0.33;
  ctx.fillStyle = '#4a4232'; ctx.strokeStyle = '#2a2418'; ctx.lineWidth = 1.5*S;
  ctx.beginPath(); ctx.roundRect(lx, ly, lw, lh, 8*S); ctx.fill(); ctx.stroke();
  const ix = lx + 6*S, iy = ly + 6*S, iw = lw - 12*S, ih = lh - 12*S;
  ctx.fillStyle = '#12120e';
  ctx.beginPath(); ctx.roundRect(ix, iy, iw, ih, 5*S); ctx.fill();
  ctx.strokeStyle = 'rgba(220,190,60,0.45)'; ctx.lineWidth = S;
  ctx.stroke();
  ctx.save();
  ctx.beginPath(); ctx.roundRect(ix, iy, iw, ih, 5*S); ctx.clip();
  const level = iy + ih*(1 - (0.18 + 0.78*fill));
  const sgd = ctx.createLinearGradient(0, level, 0, iy + ih);
  sgd.addColorStop(0, '#3a4a1c'); sgd.addColorStop(1, '#141a0a');
  ctx.fillStyle = sgd;
  ctx.beginPath();
  ctx.moveTo(ix, iy + ih);
  for (let x = 0; x <= iw; x += 4*S) {
    ctx.lineTo(ix + x, level + Math.sin(x/(10*S) + (on ? t*1.5 : 0))*1.6*S);
  }
  ctx.lineTo(ix + iw, iy + ih); ctx.closePath(); ctx.fill();
  if (on) {
    for (let i = 0; i < 7; i++) {
      const ph = (t*0.6 + i*0.37) % 1;
      const bxp = ix + iw*(0.1 + ((i*0.618) % 0.8));
      const byp = level + (iy + ih - level)*(0.2 + ((i*0.41) % 0.7));
      ctx.strokeStyle = `rgba(150,200,80,${0.6*(1-ph)})`; ctx.lineWidth = S;
      ctx.beginPath(); ctx.arc(bxp, byp, (1 + ph*3.5)*S, 0, Math.PI*2); ctx.stroke();
    }
  }
  ctx.restore();

  // ── Flare stack ──
  const fsx = px + W*0.935, fTop = py + H*0.56, fBase = py + H*0.93;
  ctx.strokeStyle = 'rgba(200,200,190,0.2)'; ctx.lineWidth = 0.8*S;
  [-12, 12].forEach(dx => { ctx.beginPath(); ctx.moveTo(fsx, fTop + 6*S); ctx.lineTo(fsx + dx*S*0.6, fBase); ctx.stroke(); });
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(fsx - 3*S + 4*S, fTop + 5*S, 6*S, fBase - fTop);
  ctx.fillStyle = '#4a4a42'; ctx.fillRect(fsx - 3*S, fTop, 6*S, fBase - fTop);
  [0, 2, 4].forEach(k => { ctx.fillStyle = k % 4 ? '#e8e8e0' : '#b03020'; ctx.fillRect(fsx - 3*S, fTop + k*4*S, 6*S, 4*S); });
  ctx.fillStyle = '#2a2a24'; ctx.fillRect(fsx - 4.5*S, fTop - 2*S, 9*S, 3*S);
  if (on) {
    const fh = 18*S*(1 + 0.18*Math.sin(t*9) + 0.08*Math.sin(t*23));
    const sway = Math.sin(t*2.3)*2*S;
    const flame = (w, h, col) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(fsx - w, fTop - 2*S);
      ctx.quadraticCurveTo(fsx - w*1.1, fTop - h*0.5, fsx + sway, fTop - 2*S - h);
      ctx.quadraticCurveTo(fsx + w*1.1, fTop - h*0.5, fsx + w, fTop - 2*S);
      ctx.closePath(); ctx.fill();
    };
    ctx.fillStyle = 'rgba(255,140,40,0.12)';
    ctx.beginPath(); ctx.arc(fsx, fTop - fh*0.5, fh*0.9, 0, Math.PI*2); ctx.fill();
    flame(5*S, fh, 'rgba(255,110,30,0.85)');
    flame(3*S, fh*0.65, 'rgba(255,220,90,0.95)');
  } else {
    ctx.fillStyle = 'rgba(90,150,255,0.7)';
    ctx.beginPath(); ctx.arc(fsx, fTop - 3*S, 1.6*S, 0, Math.PI*2); ctx.fill();
  }

  _wfPlate('OIL SLUDGE TREATMENT', px + W*0.40, py + H*0.05, S, accent, on);
  _wfLamp(px + W - 11*S, py + 11*S, S, t, accent, on);
  ctx.restore();
}

// ── Nuclear Waste Processing Facility (13×11) ──
// Fenced compound: barrel-vault containment hall with a scanning roof light
// and blast door, lattice vent stack with an aviation beacon, vitrification
// hot cell, and a dry-cask storage yard worked by a gantry crane. Casks
// appear in the yard as stored waste rises; a rail cart shuttles between
// the hall and the yard while powered.
function renderNuclearWasteFacility(e, px, py, t) {
  const { W, H, S, fill } = _wfDims(e, T.NUCLEARWASTE);
  const on = e.powered;
  const accent = '#8cf050';
  ctx.save();

  // ── Transfer rail (hall door → cask yard) ──
  const hx = px + W*0.06, hy = py + H*0.14, hw = W*0.42, vaultH = H*0.40, wallH = H*0.12;
  const yx = px + W*0.62, yy = py + H*0.12, yw = W*0.32, yh = H*0.66;
  const doorX = hx + hw*0.5, railY = py + H*0.87;
  const rail = [[doorX, hy + vaultH + wallH], [doorX, railY], [yx + yw*0.5, railY], [yx + yw*0.5, yy + yh]];
  const railPath = (dx) => {
    ctx.beginPath();
    rail.forEach(([x, y], i) => { const X = x + (i === 0 || i === 3 ? dx : 0), Y = y + (i === 1 || i === 2 ? dx : 0); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    ctx.stroke();
  };
  ctx.strokeStyle = '#3a3830'; ctx.lineWidth = 12*S; ctx.lineJoin = 'round';
  railPath(0);
  ctx.strokeStyle = '#8a8a80'; ctx.lineWidth = 1.5*S;
  railPath(-4*S); railPath(4*S);

  // ── Containment hall ──
  _wfShadow(hx, hy, hw, vaultH + wallH, S, 10*S);
  const vg = ctx.createLinearGradient(0, hy, 0, hy + vaultH);
  vg.addColorStop(0, '#2a3028'); vg.addColorStop(0.42, '#6a7462'); vg.addColorStop(0.6, '#48523f'); vg.addColorStop(1, '#1c221c');
  ctx.fillStyle = vg;
  ctx.beginPath(); ctx.roundRect(hx, hy, hw, vaultH, 10*S); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5*S;
  for (let k = 1; k < 9; k++) { const rx = hx + hw*k/9; ctx.beginPath(); ctx.moveTo(rx, hy + 3*S); ctx.lineTo(rx, hy + vaultH - 3*S); ctx.stroke(); }
  // ridge skylight with a scanning light
  const skY = hy + vaultH*0.44, skH = 6*S;
  ctx.fillStyle = '#10160e'; ctx.fillRect(hx + 10*S, skY - skH/2, hw - 20*S, skH);
  if (on) {
    ctx.save();
    ctx.beginPath(); ctx.rect(hx + 10*S, skY - skH/2, hw - 20*S, skH); ctx.clip();
    ctx.fillStyle = 'rgba(140,240,80,0.35)'; ctx.fillRect(hx + 10*S, skY - skH/2, hw - 20*S, skH);
    const sx = hx + 10*S + ((t*0.25) % 1)*(hw - 20*S);
    const scg = ctx.createLinearGradient(sx - 30*S, 0, sx + 30*S, 0);
    scg.addColorStop(0, 'rgba(200,255,150,0)'); scg.addColorStop(0.5, 'rgba(220,255,180,0.95)'); scg.addColorStop(1, 'rgba(200,255,150,0)');
    ctx.fillStyle = scg; ctx.fillRect(sx - 30*S, skY - skH/2, 60*S, skH);
    ctx.restore();
  }
  ctx.strokeStyle = '#5a6650'; ctx.lineWidth = 1.5*S;
  ctx.beginPath(); ctx.roundRect(hx, hy, hw, vaultH, 10*S); ctx.stroke();

  const wy = hy + vaultH;
  ctx.fillStyle = '#1a1e18'; ctx.fillRect(hx, wy, hw, wallH);
  ctx.strokeStyle = '#3a4234'; ctx.lineWidth = S; ctx.strokeRect(hx, wy, hw, wallH);
  const dw = hw*0.24, dh = wallH*0.82, ddx = doorX - dw/2, ddy = wy + wallH - dh;
  ctx.fillStyle = '#2e342a'; ctx.strokeStyle = '#6a7460'; ctx.lineWidth = 1.5*S;
  ctx.fillRect(ddx, ddy, dw, dh); ctx.strokeRect(ddx, ddy, dw, dh);
  ctx.strokeStyle = '#1a1e18'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.moveTo(doorX, ddy); ctx.lineTo(doorX, ddy + dh); ctx.stroke();
  _wfHazardStripe(ddx, ddy, dw, 4*S, S);
  ctx.fillStyle = on ? (Math.sin(t*2) > 0 ? '#a0ff60' : '#406a28') : '#2a3222';
  ctx.fillRect(ddx + dw*0.2, ddy - 3*S, dw*0.6, 2*S);
  _wfTrefoil(hx + hw*0.14, wy + wallH*0.5, 10*S, '#e8c820', '#1a1608');
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = on ? `rgba(140,240,90,${0.4 + 0.2*Math.sin(t*1.5 + k)})` : 'rgba(40,60,30,0.6)';
    ctx.fillRect(hx + hw*(0.70 + k*0.09), wy + wallH*0.35, hw*0.05, wallH*0.3);
  }

  // ── Vitrification hot cell ──
  const vx = px + W*0.06, vy = py + H*0.74, vw = W*0.15, vh = H*0.16;
  _wfShadow(vx, vy, vw, vh, S, 3*S);
  ctx.fillStyle = '#2a2e28'; ctx.strokeStyle = '#4e5648'; ctx.lineWidth = 1.5*S;
  ctx.beginPath(); ctx.roundRect(vx, vy, vw, vh, 3*S); ctx.fill(); ctx.stroke();
  const vwx = vx + vw*0.18, vwy = vy + vh*0.42, vww = vw*0.64, vwh = vh*0.36;
  const glow = ctx.createLinearGradient(vwx, 0, vwx + vww, 0);
  if (on) {
    const p = 0.75 + 0.25*Math.sin(t*2.2);
    glow.addColorStop(0, `rgba(255,150,40,${p})`); glow.addColorStop(1, `rgba(160,255,90,${p})`);
  } else { glow.addColorStop(0, '#20241c'); glow.addColorStop(1, '#161a14'); }
  ctx.fillStyle = glow; ctx.fillRect(vwx, vwy, vww, vwh);
  ctx.strokeStyle = '#0e100c'; ctx.lineWidth = 1.5*S; ctx.strokeRect(vwx, vwy, vww, vwh);
  ctx.fillStyle = '#3a4034'; ctx.fillRect(vx + vw*0.70, vy - 8*S, 6*S, 10*S);
  _wfSmoke(vx + vw*0.70 + 3*S, vy - 9*S, S*0.6, t, '200,220,190', on, 0.25);
  ctx.font = `bold ${Math.max(6, 6*S)}px Courier New`; ctx.textAlign = 'center';
  ctx.fillStyle = on ? 'rgba(160,240,110,0.8)' : 'rgba(110,130,90,0.6)';
  ctx.fillText('VITRIFY', vx + vw/2, vy + vh*0.28);

  // ── Vent stack (lattice tower) ──
  const stx = px + W*0.54, stTop = py + H*0.07, stBase = py + H*0.56, stw = 18*S;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 8*S;
  ctx.beginPath(); ctx.moveTo(stx + 5*S, stTop + 6*S); ctx.lineTo(stx + 5*S, stBase + 4*S); ctx.stroke();
  const fg = ctx.createLinearGradient(stx - 4*S, 0, stx + 4*S, 0);
  fg.addColorStop(0, '#9aa290'); fg.addColorStop(1, '#4a5044');
  ctx.fillStyle = fg; ctx.fillRect(stx - 4*S, stTop, 8*S, stBase - stTop);
  ctx.strokeStyle = '#7a8270'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.moveTo(stx - 3*S, stTop); ctx.lineTo(stx - stw/2, stBase); ctx.moveTo(stx + 3*S, stTop); ctx.lineTo(stx + stw/2, stBase); ctx.stroke();
  ctx.lineWidth = 0.8*S;
  const segs = 7;
  ctx.beginPath();
  for (let k = 0; k < segs; k++) {
    const y0 = stTop + (stBase - stTop)*k/segs, y1 = stTop + (stBase - stTop)*(k + 1)/segs;
    const w0 = 3*S + (stw/2 - 3*S)*k/segs, w1 = 3*S + (stw/2 - 3*S)*(k + 1)/segs;
    ctx.moveTo(stx - w0, y0); ctx.lineTo(stx + w1, y1);
    ctx.moveTo(stx + w0, y0); ctx.lineTo(stx - w1, y1);
  }
  ctx.stroke();
  ctx.fillStyle = '#2a2e26';
  ctx.beginPath(); ctx.ellipse(stx, stTop, 5*S, 2*S, 0, 0, Math.PI*2); ctx.fill();
  const beacon = on && Math.sin(t*4) > 0.2;
  ctx.fillStyle = beacon ? '#ff3020' : '#501810';
  ctx.beginPath(); ctx.arc(stx, stTop - 3*S, 2.5*S, 0, Math.PI*2); ctx.fill();
  if (beacon) { ctx.fillStyle = 'rgba(255,60,40,0.25)'; ctx.beginPath(); ctx.arc(stx, stTop - 3*S, 9*S, 0, Math.PI*2); ctx.fill(); }

  _wfGauge(px + W*0.555, py + H*0.62, 8*S, H*0.20, S, fill, accent, on);

  // ── Dry cask yard ──
  _wfShadow(yx, yy, yw, yh, S, 4*S);
  ctx.fillStyle = '#44463e'; ctx.strokeStyle = '#6a6c60'; ctx.lineWidth = 1.5*S;
  ctx.beginPath(); ctx.roundRect(yx, yy, yw, yh, 4*S); ctx.fill(); ctx.stroke();
  const cols = 3, rows = 5, cw = yw/cols, rh = yh/rows, crr = Math.min(cw, rh)*0.30;
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = S;
  for (let c = 1; c < cols; c++) { ctx.beginPath(); ctx.moveTo(yx + cw*c, yy + 3*S); ctx.lineTo(yx + cw*c, yy + yh - 3*S); ctx.stroke(); }
  for (let r = 1; r < rows; r++) { ctx.beginPath(); ctx.moveTo(yx + 3*S, yy + rh*r); ctx.lineTo(yx + yw - 3*S, yy + rh*r); ctx.stroke(); }
  if (on) {
    const ag = ctx.createRadialGradient(yx + yw/2, yy + yh/2, 0, yx + yw/2, yy + yh/2, yh*0.6);
    ag.addColorStop(0, `rgba(140,240,80,${0.12 + 0.05*Math.sin(t*1.2)})`); ag.addColorStop(1, 'rgba(140,240,80,0)');
    ctx.fillStyle = ag; ctx.fillRect(yx, yy, yw, yh);
  }
  const loaded = Math.min(cols*rows, 4 + Math.round(fill*(cols*rows - 4)));
  for (let i = 0; i < cols*rows; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    const cx = yx + cw*(c + 0.5), cy = yy + rh*(rows - r - 0.5);  // fill from the bottom row up
    if (i < loaded) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.arc(cx + 3*S, cy + 4*S, crr, 0, Math.PI*2); ctx.fill();
      const kg = ctx.createRadialGradient(cx - crr*0.35, cy - crr*0.35, crr*0.1, cx, cy, crr);
      kg.addColorStop(0, '#c4c6ba'); kg.addColorStop(0.6, '#8a8c80'); kg.addColorStop(1, '#4a4c44');
      ctx.fillStyle = kg;
      ctx.beginPath(); ctx.arc(cx, cy, crr, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#3a3c34'; ctx.lineWidth = S; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, crr*0.62, 0, Math.PI*2); ctx.stroke();
      ctx.fillStyle = '#3a3c34';
      for (let b = 0; b < 4; b++) { const a = b*Math.PI/2 + Math.PI/4; ctx.beginPath(); ctx.arc(cx + Math.cos(a)*crr*0.8, cy + Math.sin(a)*crr*0.8, 0.9*S, 0, Math.PI*2); ctx.fill(); }
      ctx.fillStyle = on ? accent : '#4a6a30';
      ctx.globalAlpha = on ? 0.55 + 0.35*Math.sin(t*2 + i*0.9) : 0.7;
      ctx.beginPath(); ctx.arc(cx, cy, 1.8*S, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = 'rgba(230,200,40,0.45)'; ctx.lineWidth = S;
      ctx.setLineDash([2*S, 2*S]);
      ctx.beginPath(); ctx.arc(cx, cy, crr, 0, Math.PI*2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ── Gantry crane ──
  ctx.strokeStyle = '#9a9a90'; ctx.lineWidth = 2.5*S;
  [yx + 2*S, yx + yw - 2*S].forEach(rx => { ctx.beginPath(); ctx.moveTo(rx, yy + 2*S); ctx.lineTo(rx, yy + yh - 2*S); ctx.stroke(); });
  const gby = yy + 14*S + (yh - 28*S)*(on ? 0.5 + 0.5*Math.sin(t*0.35) : 0.3);
  const gtx = yx + yw*(on ? 0.5 + 0.32*Math.sin(t*0.6) : 0.5);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(yx - 4*S + 6*S, gby - 4*S + 8*S, yw + 8*S, 8*S);
  ctx.fillStyle = '#d8a820'; ctx.strokeStyle = '#4a3a10'; ctx.lineWidth = S;
  ctx.fillRect(yx - 4*S, gby - 4*S, yw + 8*S, 8*S); ctx.strokeRect(yx - 4*S, gby - 4*S, yw + 8*S, 8*S);
  ctx.strokeStyle = 'rgba(60,40,0,0.5)';
  for (let x = yx; x < yx + yw; x += 8*S) { ctx.beginPath(); ctx.moveTo(x, gby - 4*S); ctx.lineTo(x + 4*S, gby + 4*S); ctx.stroke(); }
  ctx.fillStyle = '#6a5a20';
  ctx.fillRect(yx - 7*S, gby - 7*S, 6*S, 14*S); ctx.fillRect(yx + yw + S, gby - 7*S, 6*S, 14*S);
  ctx.fillStyle = '#3a3a34'; ctx.strokeStyle = '#8a8a7a';
  ctx.fillRect(gtx - 8*S, gby - 7*S, 16*S, 14*S); ctx.strokeRect(gtx - 8*S, gby - 7*S, 16*S, 14*S);
  ctx.fillStyle = on ? '#ffb030' : '#5a4a20';
  ctx.beginPath(); ctx.arc(gtx, gby, 2*S, 0, Math.PI*2); ctx.fill();

  // ── Rail cart shuttling a cask ──
  const segLens = [];
  let total = 0;
  for (let i = 1; i < rail.length; i++) { const l = Math.hypot(rail[i][0] - rail[i-1][0], rail[i][1] - rail[i-1][1]); segLens.push(l); total += l; }
  const ping = on ? 1 - Math.abs(((t*0.06) % 2) - 1) : 0.08;
  let dist = ping*total, cartX = rail[0][0], cartY = rail[0][1];
  for (let i = 0; i < segLens.length; i++) {
    if (dist <= segLens[i]) {
      const f = dist / segLens[i];
      cartX = rail[i][0] + (rail[i+1][0] - rail[i][0])*f;
      cartY = rail[i][1] + (rail[i+1][1] - rail[i][1])*f;
      break;
    }
    dist -= segLens[i];
  }
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(cartX - 8*S + 3*S, cartY - 8*S + 4*S, 16*S, 16*S);
  ctx.fillStyle = '#d8a820'; ctx.strokeStyle = '#4a3a10'; ctx.lineWidth = S;
  ctx.fillRect(cartX - 8*S, cartY - 8*S, 16*S, 16*S); ctx.strokeRect(cartX - 8*S, cartY - 8*S, 16*S, 16*S);
  ctx.fillStyle = '#9a9c90';
  ctx.beginPath(); ctx.arc(cartX, cartY, 5.5*S, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#3a3c34'; ctx.stroke();

  _wfPlate('NUCLEAR WASTE REPOSITORY', hx + hw*0.5, py + H*0.07, S, accent, on);
  _wfLamp(px + W - 14*S, py + 14*S, S, t, accent, on);
  ctx.restore();
}

function renderCoalDeposit(e, px, py, t) {
    const ew = e.width  || 1;
    const eh = e.height || 1;
    const w  = ew * TILE;
    const h  = eh * TILE;
    const cx = px + w * 0.5;
    const pct = e.coalMax > 0 ? (e.coalAmount || 0) / e.coalMax : 0;

    // Stable per-deposit rng
    const S = (n) => { const x = Math.sin(e.col * 127.1 + e.row * 311.7 + n * 74.3) * 43758.5453; return x - Math.floor(x); };

    ctx.save();

    // ── Palette (pixel-art coal pile) ──────────────────────────────
    const C_OUTLINE  = '#0a0808';
    const C_DEEP     = '#111010';  // dark body fill
    const C_MID      = '#1e1c1c';  // mid-tone lump face
    const C_LIT      = '#2e2c2c';  // lit face of lump
    const C_HILIT    = '#4a4848';  // bright specular on top lumps
    const C_GROUND   = '#1a1814';  // gravel base
    const C_GRAVEL   = '#2a2620';  // gravel pebble colour

    // Derive pile geometry from tile size
    const bw = w - 4;           // pile base width
    const ph = h * 0.78;        // pile height (leaves room for gravel base)
    const bx = px + 2;          // pile base left x
    const by = py + h - 4;      // pile base y (bottom of pile)
    const peakX = cx + w * 0.04;
    const peakY = py + (h - ph) + 2;

    // ── Gravel base strip ──────────────────────────────────────────
    ctx.fillStyle = C_GROUND;
    ctx.fillRect(px, by - 2, w, 6);

    // Scattered gravel pebbles along base
    for (let i = 0; i < 8 + ew * 3; i++) {
      const gx = px + 3 + S(i * 7) * (w - 6);
      const gy = by + S(i * 7 + 1) * 4;
      const gr = 1 + S(i * 7 + 2) * 1.5;
      ctx.fillStyle = S(i * 3) > 0.5 ? C_GRAVEL : C_DEEP;
      ctx.beginPath(); ctx.ellipse(gx, gy, gr, gr * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    }

    // ── Main pile silhouette — lumpy heap outline ──────────────────
    // Build a mound outline with bumps scaled to deposit size
    const lumpCount = 3 + ew + eh;
    const lumpPts = [];
    // Left edge down
    lumpPts.push([bx, by]);
    // Rising left slope with small bumps
    lumpPts.push([bx + bw * 0.08, by - ph * 0.45]);
    lumpPts.push([bx + bw * 0.18, by - ph * 0.65]);
    // Generate bumpy peak region
    for (let i = 0; i < lumpCount; i++) {
      const t2 = i / (lumpCount - 1);
      const bumpX = bx + bw * (0.22 + t2 * 0.56);
      const baseH  = ph * (0.72 + 0.18 * Math.sin(Math.PI * t2)); // arc over top
      const bumpH  = baseH + ph * 0.12 * (S(i * 13) - 0.3);
      lumpPts.push([bumpX, by - bumpH]);
    }
    // Descending right slope
    lumpPts.push([bx + bw * 0.82, by - ph * 0.62]);
    lumpPts.push([bx + bw * 0.93, by - ph * 0.38]);
    lumpPts.push([bx + bw, by]);

    // Fill main pile body
    ctx.beginPath();
    ctx.moveTo(lumpPts[0][0], lumpPts[0][1]);
    for (let i = 1; i < lumpPts.length; i++) ctx.lineTo(lumpPts[i][0], lumpPts[i][1]);
    ctx.closePath();
    const grad = ctx.createLinearGradient(cx, peakY, cx, by);
    grad.addColorStop(0,   C_LIT);
    grad.addColorStop(0.4, C_MID);
    grad.addColorStop(1,   C_DEEP);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = C_OUTLINE;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // ── Individual coal lumps on the surface ───────────────────────
    // Distribute lumps across the pile face, denser toward top
    const totalLumps = 6 + ew * eh * 5;
    for (let i = 0; i < totalLumps; i++) {
      // Place lump: x uniform, y biased toward upper 60% of pile
      const tx = 0.08 + S(i * 17) * 0.84;
      const ty = S(i * 17 + 1);
      // Map onto pile surface — interpolate pile height at this x
      const pileTopAtX = by - (ph * (0.55 + 0.35 * Math.sin(Math.PI * tx) + 0.1 * (S(i * 3) - 0.5)));
      const lx = bx + bw * tx;
      const ly = pileTopAtX + ty * (by - pileTopAtX) * 0.75;

      const lr  = (2.5 + S(i * 17 + 2) * 3.5) * Math.min(ew, eh) * 0.9;
      const lry = lr * (0.55 + S(i * 17 + 3) * 0.3);
      const ang = (S(i * 17 + 4) - 0.5) * 1.2;

      // Lump body
      ctx.fillStyle = S(i * 5) > 0.6 ? C_MID : C_DEEP;
      ctx.beginPath(); ctx.ellipse(lx, ly, lr, lry, ang, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C_OUTLINE; ctx.lineWidth = 0.7; ctx.stroke();

      // Lit face on upper-left of each lump
      ctx.fillStyle = C_LIT;
      ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.ellipse(lx - lr * 0.2, ly - lry * 0.25, lr * 0.55, lry * 0.4, ang - 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ── Specular highlights — small bright pixel-dots on top lumps ─
    const specCount = 4 + ew * eh * 2;
    for (let i = 0; i < specCount; i++) {
      const tx = 0.15 + S(i * 31) * 0.70;
      const pileTopAtX = by - (ph * (0.65 + 0.25 * Math.sin(Math.PI * tx)));
      const sx2 = bx + bw * tx;
      const sy2 = pileTopAtX + S(i * 31 + 1) * (by - pileTopAtX) * 0.35;
      const sr  = 0.8 + S(i * 31 + 2) * 1.4;
      ctx.fillStyle = C_HILIT;
      ctx.globalAlpha = 0.7 + S(i * 31 + 3) * 0.3;
      ctx.fillRect(Math.round(sx2), Math.round(sy2), Math.ceil(sr), Math.ceil(sr)); // square pixel dot
    }
    ctx.globalAlpha = 1;

    // ── Depletion: faded dusty wash when running low ───────────────
    if (pct < 0.3) {
      ctx.globalAlpha = 0.4 * (1 - pct / 0.3);
      ctx.fillStyle = 'rgba(150,130,90,0.35)';
      ctx.fillRect(px, py, w, h);
      ctx.globalAlpha = 1;
    }

    // ── Label ──────────────────────────────────────────────────────
    ctx.save();
    ctx.font = '7px Courier New';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(160,144,128,0.85)';
    ctx.fillText(`${Math.round(CoalSystem.coalLeft(e))}t`, px + 4, py + 11);
    ctx.restore();

    ctx.restore();
  }
