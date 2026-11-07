/* ═══════════════════════════════════════════════════════════════════
   RARE EARTH ART — the head of the Field Core chain (rare_earth_systems.js)
     renderRareEarthDeposit  monazite beach sand, banded honey-red and black
     renderRareEarthMine     dredge pond → spiral concentrators → magnetic
                             separator → ore carts on the Uranium Mine's rail
     renderLeachPlant        pug mill → acid-bake kiln → leach tanks →
                             thickener → filter press → calciner → oxide
                             hopper and bulk bags, with a tailings drum yard
   Also the small plant kit the Field Core art shares (_fcVTank, _fcHCyl,
   _fcBuilding, _fcRack, _fcDiamond, _fcPile). Shared helpers come from
   render_hydro_coal.js (_wf*), render_oil_nuclear.js (_depositKit),
   render_mining_conveyor.js (_coalMineOutStub) and render_field_core.js
   (_fcPorts, _fcBeltAt — called at draw time, after it has loaded).
   ═══════════════════════════════════════════════════════════════════ */

const _RE_ACCENT = '#ff9a5a';

function renderRareEarthDeposit(e, px, py, t) {
    // Heavy-mineral sand: a pale beach patch swept into curving bands, the
    // dense dark ilmenite and the honey-red monazite sorted apart by the
    // waves, flecked with white zircon. Grains glint now and then, a pair
    // of survey stakes carry orange tape, and a placard warns of thorium.
    const K = _depositKit(e, px, py);
    const { k, X, Y, S, blob, poly, ell, line } = K;
    const detail = Camera.zoom > 0.5;
    const phase = e._rareEarthPhase ?? S(99)*6.28;
    const pulse = 0.5 + 0.5*Math.sin(t*1.1 + phase);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // ── Sand bed ───────────────────────────────────────────────────────
    blob(50, 52, 47, 44, 0.10, 1, 18); ctx.fillStyle = '#6a5038'; ctx.fill();
    blob(50, 52, 41, 38, 0.12, 30, 16); ctx.fillStyle = '#c8a070'; ctx.fill();
    if (detail) K.tufts('#7a6a40', 60, 12);

    // ── Swept bands, back to front: ilmenite black, monazite honey-red ─
    ctx.save();
    blob(50, 52, 40, 37, 0.12, 30, 16); ctx.clip();
    for (let b = 0; b < 4 + K.size; b++) {
      const y0 = 20 + b*(64 / (4 + K.size)) + (S(10 + b) - 0.5)*6;
      const amp = 5 + S(20 + b)*6, off = S(30 + b)*6.28;
      const dark = b % 2 === 0;
      ctx.strokeStyle = dark ? 'rgba(28,22,18,0.85)' : 'rgba(196,92,48,0.9)';
      ctx.lineWidth = (dark ? 3.2 : 4.6)*k;
      ctx.beginPath();
      for (let x = 4; x <= 96; x += 4) {
        const y = y0 + Math.sin(x*0.07 + off)*amp;
        x === 4 ? ctx.moveTo(X(x), Y(y)) : ctx.lineTo(X(x), Y(y));
      }
      ctx.stroke();
    }
    ctx.restore();

    // ── Grains: zircon white, monazite honey, with an occasional glint ─
    if (detail) for (let g = 0; g < 18 + K.size*6; g++) {
      const a = S(100 + g)*Math.PI*2, d = Math.sqrt(S(130 + g))*36;
      const gx = 50 + Math.cos(a)*d, gy = 52 + Math.sin(a)*d*0.9;
      const kind = g % 3;
      ell(gx, gy, 0.9, 0.7);
      ctx.fillStyle = kind === 0 ? '#f4ece0' : kind === 1 ? '#ffb070' : '#2a2018'; ctx.fill();
      if (kind === 1 && Math.sin(t*1.7 + g*2.3 + phase) > 0.96) {
        line(gx - 2, gy, gx + 2, gy, 'rgba(255,230,190,0.9)', 0.5);
        line(gx, gy - 2, gx, gy + 2, 'rgba(255,230,190,0.9)', 0.5);
      }
    }

    // ── A shallow wash pool where the sand is wet ──────────────────────
    const pX = 70 + S(5)*10, pY = 68 + S(6)*8;
    blob(pX, pY, 11, 6, 0.2, 80, 12); ctx.fillStyle = '#4a3a2a'; ctx.fill();
    blob(pX, pY, 9, 4.6, 0.2, 80, 12); ctx.fillStyle = '#5a7a88'; ctx.fill();
    ell(pX - 1.5, pY - 0.8, 5, 1.8); ctx.fillStyle = `rgba(210,235,245,${(0.25 + 0.25*pulse).toFixed(3)})`; ctx.fill();

    // ── Survey stakes, tape, and a thorium placard ─────────────────────
    if (detail) {
      const s1 = [12 + S(400)*6, 28 + S(401)*8], s2 = [80 + S(402)*6, 18 + S(403)*8];
      for (const [sx, sy] of [s1, s2]) {
        line(sx, sy + 8, sx, sy - 5, '#8a6a40', 1.1);
        poly([[sx, sy - 5], [sx + 4, sy - 3.8], [sx, sy - 2.6]]); ctx.fillStyle = _RE_ACCENT; ctx.fill();
      }
      ctx.lineWidth = 0.9*k;
      const tape = () => { ctx.beginPath(); ctx.moveTo(X(s1[0]), Y(s1[1] - 1)); ctx.quadraticCurveTo(X((s1[0] + s2[0])/2), Y((s1[1] + s2[1])/2 + 6), X(s2[0]), Y(s2[1] - 1)); ctx.stroke(); };
      ctx.strokeStyle = '#1a1410'; tape();
      ctx.setLineDash([2.5*k, 2.5*k]); ctx.strokeStyle = '#ff8a40'; tape(); ctx.setLineDash([]);
      const gx = s1[0] + 2, gy = s1[1] + 16;
      line(gx, gy + 8, gx, gy, '#6a6a66', 1);
      poly([[gx - 5, gy - 8], [gx + 5, gy - 8], [gx + 5, gy + 1], [gx - 5, gy + 1]]); ctx.fillStyle = '#e8c020'; ctx.fill();
      ctx.strokeStyle = '#1a1410'; ctx.lineWidth = 0.5*k; ctx.stroke();
      ctx.fillStyle = '#1a1410'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.max(5, 5*k)}px Courier New`;
      ctx.fillText('Th', X(gx), Y(gy - 3.5));
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    K.elementTile('60', 'Nd', `rgba(255,190,140,${(0.8 + 0.2*pulse).toFixed(3)})`, 'rgba(20,10,6,0.85)', 'rgba(224,122,64,0.7)');
    ctx.restore();
}

// ── Shared plant kit (also used by render_field_core.js) ─────────────
// Small top-down building blocks for the Field Core plants, lit from the
// top left like every other sprite, with a cast shadow down and right.

// Vertical tank seen from above: shadow, shell, rim, optional open liquid
// surface, roof cone seams, a manway and a caged ladder.
function _fcVTank(cx, cy, r, S, o = {}) {
  const shell = o.shell || ['#d8dcde', '#9aa0a4', '#4a5054'];
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath(); ctx.arc(cx + 4*S, cy + 5*S, r, 0, Math.PI*2); ctx.fill();
  const g = ctx.createRadialGradient(cx - r*0.4, cy - r*0.45, r*0.05, cx, cy, r);
  g.addColorStop(0, shell[0]); g.addColorStop(0.55, shell[1]); g.addColorStop(1, shell[2]);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = 'rgba(10,12,14,0.8)'; ctx.lineWidth = 1.1*S; ctx.stroke();
  if (o.band) { ctx.strokeStyle = o.band; ctx.lineWidth = 2*S; ctx.beginPath(); ctx.arc(cx, cy, r - 2.2*S, 0, Math.PI*2); ctx.stroke(); }
  if (o.liquid) {
    const lr = r - 3.5*S;
    const lg = ctx.createRadialGradient(cx, cy, 1, cx, cy, lr);
    lg.addColorStop(0, o.liquid[0]); lg.addColorStop(1, o.liquid[1]);
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(cx, cy, lr, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = S; ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(0,0,0,0.13)'; ctx.lineWidth = 0.7*S;
    for (let k = 0; k < 8; k++) { const a = k*Math.PI/4; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a)*r*0.18, cy + Math.sin(a)*r*0.18); ctx.lineTo(cx + Math.cos(a)*(r - 1.5*S), cy + Math.sin(a)*(r - 1.5*S)); ctx.stroke(); }
    ctx.fillStyle = 'rgba(30,32,34,0.75)'; ctx.beginPath(); ctx.arc(cx, cy, r*0.15, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(40,42,44,0.85)'; ctx.beginPath(); ctx.arc(cx + r*0.42, cy - r*0.32, r*0.12, 0, Math.PI*2); ctx.fill();
  }
  if (o.ladder !== false) {                     // caged ladder down the shaded side
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(o.ladderAngle ?? 0.7);
    ctx.fillStyle = '#2a2c2e'; ctx.fillRect(r - 0.5*S, -2.6*S, 4.5*S, 5.2*S);
    ctx.strokeStyle = '#d8b030'; ctx.lineWidth = 0.7*S;
    ctx.beginPath(); ctx.arc(r + 1.8*S, 0, 2.4*S, -Math.PI/2, Math.PI/2); ctx.stroke();
    ctx.restore();
  }
}

// Horizontal cylinder (kiln, bullet tank, calciner) between x0 and x1.
function _fcHCyl(x0, x1, cy, r, S, stops, o = {}) {
  ctx.fillStyle = 'rgba(0,0,0,0.33)';
  ctx.beginPath(); ctx.roundRect(x0 + 4*S, cy - r + 5*S, x1 - x0, r*2, r); ctx.fill();
  const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  g.addColorStop(0, stops[0]); g.addColorStop(0.4, stops[1]); g.addColorStop(1, stops[2]);
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x0, cy - r, x1 - x0, r*2, o.square ? r*0.25 : r); ctx.fill();
  ctx.strokeStyle = 'rgba(10,10,10,0.8)'; ctx.lineWidth = S; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x0 + r*0.5, cy - r*0.62, x1 - x0 - r, r*0.18);
  for (const f of (o.bands || [])) {
    const bx = x0 + (x1 - x0)*f;
    ctx.fillStyle = o.bandColor || '#2e2a26'; ctx.fillRect(bx - 2.2*S, cy - r - 1.6*S, 4.4*S, r*2 + 3.2*S);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(bx - 2.2*S, cy - r - 1.6*S, 1.2*S, r*2 + 3.2*S);
  }
}

// Flat-roofed building: parapet, membrane, seams, roof units, lit windows
// along the south face. `lit` lights the windows (powered).
function _fcBuilding(x, y, w, h, S, t, o = {}) {
  ctx.fillStyle = 'rgba(0,0,0,0.36)'; ctx.fillRect(x + 5*S, y + 6*S, w, h);
  ctx.fillStyle = o.wall || '#5a6068'; ctx.fillRect(x, y + h - 4*S, w, 4*S);           // south wall
  if (o.windows !== false) {
    const n = Math.max(2, Math.floor(w / (9*S)));
    for (let k = 0; k < n; k++) {
      const wx = x + 3*S + k*(w - 6*S)/n;
      ctx.fillStyle = o.lit ? `rgba(255,${210 + (k*37)%40},140,0.95)` : '#1c2228';
      ctx.fillRect(wx, y + h - 3.2*S, (w - 6*S)/n - 2*S, 2.2*S);
    }
  }
  const rg = ctx.createLinearGradient(x, y, x + w, y + h);
  rg.addColorStop(0, o.roof0 || '#b8bcc0'); rg.addColorStop(1, o.roof1 || '#8a9096');
  ctx.fillStyle = rg; ctx.fillRect(x, y, w, h - 4*S);
  ctx.strokeStyle = 'rgba(20,22,24,0.85)'; ctx.lineWidth = 1.2*S; ctx.strokeRect(x, y, w, h - 4*S);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.8*S;
  ctx.beginPath(); ctx.moveTo(x + 1.5*S, y + h - 5.5*S); ctx.lineTo(x + 1.5*S, y + 1.5*S); ctx.lineTo(x + w - 1.5*S, y + 1.5*S); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.6*S;
  for (let sx = x + 6*S; sx < x + w - 2*S; sx += 6*S) { ctx.beginPath(); ctx.moveTo(sx, y + 2*S); ctx.lineTo(sx, y + h - 6*S); ctx.stroke(); }
  for (const [ux, uy] of (o.units || [])) {                                          // rooftop AC / fans
    const cx = x + w*ux, cy = y + (h - 4*S)*uy, s = Math.min(7*S, w*0.22);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(cx - s/2 + 1.5*S, cy - s/2 + 2*S, s, s);
    ctx.fillStyle = '#7a8088'; ctx.fillRect(cx - s/2, cy - s/2, s, s);
    ctx.strokeStyle = '#2a2e32'; ctx.lineWidth = 0.6*S; ctx.strokeRect(cx - s/2, cy - s/2, s, s);
    ctx.fillStyle = '#2a2e34'; ctx.beginPath(); ctx.arc(cx, cy, s*0.36, 0, Math.PI*2); ctx.fill();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(o.spin ? t*6 : 0.4);
    ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 0.8*S;
    ctx.beginPath(); ctx.moveTo(-s*0.3, 0); ctx.lineTo(s*0.3, 0); ctx.moveTo(0, -s*0.3); ctx.lineTo(0, s*0.3); ctx.stroke();
    ctx.restore();
  }
}

// Steel pipe rack between y0 and y1: bents every `step`, then the pipes
// (each { y, color, on }) drawn along it with _wfPipe.
function _fcRack(x0, x1, y0, y1, S, t, pipes, step) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x0 + 3*S, y0 + 4*S, x1 - x0, y1 - y0);
  ctx.fillStyle = '#34383c';
  for (let x = x0; x <= x1 + 0.5; x += step) {
    ctx.fillRect(x - 1.4*S, y0 - 2*S, 2.8*S, y1 - y0 + 4*S);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x - 1.4*S, y0 - 2*S, 0.9*S, y1 - y0 + 4*S); ctx.fillStyle = '#34383c';
  }
  ctx.fillStyle = '#4a4e52'; ctx.fillRect(x0, y0 - 0.8*S, x1 - x0, 1.6*S); ctx.fillRect(x0, y1 - 0.8*S, x1 - x0, 1.6*S);
  for (const p of pipes) _wfPipe([[p.x0 ?? x0, p.y], [p.x1 ?? x1, p.y]], S*0.8, t, p.on, p.color);
}

// Corrosive / radiation / flammable hazard diamond.
function _fcDiamond(cx, cy, s, fg, glyph) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI/4);
  ctx.fillStyle = '#f4f2ea'; ctx.fillRect(-s/2, -s/2, s, s);
  ctx.strokeStyle = fg; ctx.lineWidth = s*0.12; ctx.strokeRect(-s/2 + s*0.08, -s/2 + s*0.08, s*0.84, s*0.84);
  ctx.restore();
  ctx.fillStyle = fg; ctx.font = `bold ${Math.max(4, s*0.55)}px Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(glyph, cx, cy + s*0.04);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

// Conical stockpile with a sunlit face and a shaded one.
function _fcPile(cx, cy, rx, ry, S, light, dark) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(cx + 3*S, cy + 3.5*S, rx, ry, 0, 0, Math.PI*2); ctx.fill();
  const g = ctx.createRadialGradient(cx - rx*0.35, cy - ry*0.4, 1, cx, cy, Math.max(rx, ry));
  g.addColorStop(0, light); g.addColorStop(1, dark);
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.6*S;
  for (let k = 0; k < 6; k++) { const a = k*Math.PI/3 + 0.3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a)*rx*0.95, cy + Math.sin(a)*ry*0.95); ctx.stroke(); }
}

// ── Rare Earth Mine (4×5) ──
// Heavy-mineral sands are dredged wet: a floating dredge cuts the bank of a
// pond it digs for itself and pumps slurry ashore along a floating line to a
// wet plant, where spiral concentrators on a steel frame sort heavy grains
// from light. A magnetic separator in its shed pulls the black ilmenite out,
// and the honey-red monazite goes to the ore carts. The rail, carts and OUT
// stub are the Uranium Mine's (RareEarthSystem.outputPort). Stands on a
// gravel compound (SiteYard).
function renderRareEarthMine(e, px, py, t) {
  const w = (e.width  || 4) * TILE;
  const h = (e.height || 5) * TILE;
  const S = TILE / 40;
  const dry = e._linkedDeposit && typeof isDepositExhausted === 'function' && isDepositExhausted(e._linkedDeposit);
  const on = !!e.powered && !dry;
  const accent = _RE_ACCENT;
  ctx.save();

  // ── Dredge pond: wet sand banks, cut face, water ──
  const pX = px + w*0.05, pY = py + h*0.09, pW = w*0.90, pH = h*0.38;
  const bank = () => { ctx.beginPath(); ctx.moveTo(pX + pW*0.06, pY + pH*0.1); ctx.bezierCurveTo(pX + pW*0.4, pY - pH*0.12, pX + pW*0.8, pY - pH*0.05, pX + pW*0.97, pY + pH*0.2);
    ctx.bezierCurveTo(pX + pW*1.04, pY + pH*0.6, pX + pW*0.9, pY + pH*1.04, pX + pW*0.55, pY + pH*1.0);
    ctx.bezierCurveTo(pX + pW*0.2, pY + pH*1.06, pX - pW*0.04, pY + pH*0.75, pX + pW*0.06, pY + pH*0.1); ctx.closePath(); };
  const sg = ctx.createLinearGradient(0, pY - 6*S, 0, pY + pH + 6*S);
  sg.addColorStop(0, '#d29a62'); sg.addColorStop(1, '#8a5a36');
  ctx.save(); ctx.translate(pX + pW/2, pY + pH/2); ctx.scale(1.07, 1.12); ctx.translate(-(pX + pW/2), -(pY + pH/2)); bank(); ctx.fillStyle = sg; ctx.fill(); ctx.restore();
  // honey-red and black bands showing in the cut face (north bank)
  ctx.save(); ctx.translate(pX + pW/2, pY + pH/2); ctx.scale(1.07, 1.12); ctx.translate(-(pX + pW/2), -(pY + pH/2)); bank(); ctx.clip();
  for (let k = 0; k < 4; k++) { ctx.fillStyle = k % 2 ? 'rgba(30,22,18,0.55)' : 'rgba(200,96,50,0.55)'; ctx.fillRect(pX, pY - 6*S + k*2.4*S, pW, 1.6*S); }
  ctx.restore();
  bank();
  const wg = ctx.createRadialGradient(pX + pW*0.5, pY + pH*0.55, 2, pX + pW*0.5, pY + pH*0.5, pW*0.55);
  wg.addColorStop(0, '#2c4a54'); wg.addColorStop(0.7, '#3e6670'); wg.addColorStop(1, '#6a8a84');
  ctx.fillStyle = wg; ctx.fill();
  ctx.strokeStyle = 'rgba(230,210,170,0.55)'; ctx.lineWidth = 1.2*S; ctx.stroke();       // wet margin
  // turbid plume where the cutter works
  const dx = pX + pW*0.46, dy = pY + pH*0.55;
  const sweep = on ? Math.sin(t*0.6)*0.45 : 0.1;
  const cutX = dx + Math.sin(sweep)*pH*0.42, cutY = dy - Math.cos(sweep)*pH*0.42;
  if (on) { const tg = ctx.createRadialGradient(cutX, cutY, 1, cutX, cutY, 14*S); tg.addColorStop(0, 'rgba(200,130,80,0.6)'); tg.addColorStop(1, 'rgba(200,130,80,0)'); ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(cutX, cutY, 14*S, 0, Math.PI*2); ctx.fill(); }
  if (on) for (let k = 0; k < 3; k++) {
    const ph = (t*0.4 + k/3) % 1;
    ctx.strokeStyle = `rgba(220,240,240,${(0.35*(1 - ph)).toFixed(3)})`; ctx.lineWidth = 0.8*S;
    ctx.beginPath(); ctx.ellipse(dx, dy + 2*S, (8 + ph*18)*S, (3 + ph*6)*S, 0, 0, Math.PI*2); ctx.stroke();
  }

  // floating slurry line: orange floats from the dredge to the shore
  const shoreX = px + w*0.22, shoreY = pY + pH + 2*S;
  for (let k = 0; k <= 6; k++) {
    const f = k/6, fx = dx + (shoreX - dx)*f, fy = dy + 6*S + (shoreY - dy - 6*S)*f + Math.sin(f*Math.PI)*5*S + (on ? Math.sin(t*1.5 + k)*0.6*S : 0);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(fx + 1.2*S, fy + 1.4*S, 2.6*S, 1.8*S, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ee7a22'; ctx.beginPath(); ctx.ellipse(fx, fy, 2.6*S, 1.8*S, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,220,180,0.6)'; ctx.beginPath(); ctx.ellipse(fx - 0.8*S, fy - 0.6*S, 1*S, 0.6*S, 0, 0, Math.PI*2); ctx.fill();
  }

  // the dredge: pontoon, deck house, spuds, ladder and cutter head
  ctx.save(); ctx.translate(dx, dy); ctx.rotate(sweep);
  ctx.strokeStyle = '#1e1c18'; ctx.lineWidth = 3.4*S;                      // cutter ladder
  ctx.beginPath(); ctx.moveTo(0, -4*S); ctx.lineTo(0, -pH*0.42); ctx.stroke();
  ctx.strokeStyle = '#d8a420'; ctx.lineWidth = 1.6*S; ctx.stroke();
  ctx.fillStyle = '#3a342a'; ctx.beginPath(); ctx.arc(0, -pH*0.42, 3.4*S, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = on ? '#e0a050' : '#6a5a40'; ctx.lineWidth = 1.1*S;
  for (let k = 0; k < 5; k++) { const a = (on ? t*7 : 0) + k*1.256; ctx.beginPath(); ctx.moveTo(Math.cos(a)*1.2*S, -pH*0.42 + Math.sin(a)*1.2*S); ctx.lineTo(Math.cos(a)*3.8*S, -pH*0.42 + Math.sin(a)*3.8*S); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.roundRect(dx - 10*S + 3*S, dy - 6*S + 4*S, 20*S, 13*S, 2.5*S); ctx.fill();
  const hg = ctx.createLinearGradient(0, dy - 6*S, 0, dy + 7*S); hg.addColorStop(0, '#f0c040'); hg.addColorStop(1, '#b88a18');
  ctx.fillStyle = hg; ctx.strokeStyle = '#3a2c08'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.roundRect(dx - 10*S, dy - 6*S, 20*S, 13*S, 2.5*S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e8e6e0'; ctx.fillRect(dx - 5*S, dy - 1*S, 9*S, 6.5*S);                   // deck house
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.6*S; ctx.strokeRect(dx - 5*S, dy - 1*S, 9*S, 6.5*S);
  ctx.fillStyle = on ? `rgba(255,214,140,${(0.7 + 0.25*Math.sin(t*3)).toFixed(3)})` : '#2a3038';
  ctx.fillRect(dx - 4*S, dy - 0.2*S, 7*S, 1.6*S);
  for (const sx of [-7.5, 7.5]) { ctx.fillStyle = '#2a2a28'; ctx.beginPath(); ctx.arc(dx + sx*S, dy + 5*S, 1.5*S, 0, Math.PI*2); ctx.fill(); }   // spuds

  // ── Wet plant: spirals on a raised steel frame ──
  const fX = px + w*0.04, fY = py + h*0.53, fW = w*0.42, fH = h*0.19;
  ctx.fillStyle = 'rgba(0,0,0,0.33)'; ctx.fillRect(fX + 4*S, fY + 5*S, fW, fH);
  ctx.fillStyle = '#3c4248'; ctx.fillRect(fX, fY, fW, fH);
  ctx.fillStyle = '#5a6066';                                                    // walkway grating
  for (let gx = fX + 1*S; gx < fX + fW - 1*S; gx += 2.4*S) ctx.fillRect(gx, fY + 1*S, 1.2*S, fH - 2*S);
  ctx.strokeStyle = '#d8b030'; ctx.lineWidth = 0.8*S; ctx.strokeRect(fX + 0.5*S, fY + 0.5*S, fW - S, fH - S);   // handrail
  for (let k = 0; k < 3; k++) {
    const sx = fX + fW*(0.18 + k*0.32), sy = fY + fH*0.5, sr = Math.min(fH*0.42, 7*S);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(sx + 2*S, sy + 2.5*S, sr, 0, Math.PI*2); ctx.fill();
    const cg = ctx.createRadialGradient(sx - sr*0.3, sy - sr*0.3, 1, sx, sy, sr);
    cg.addColorStop(0, '#c8ccc8'); cg.addColorStop(1, '#6a706c');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI*2); ctx.fill();
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(on ? t*1.6 + k : k);
    ctx.strokeStyle = on ? '#e08a5a' : '#7a5a44'; ctx.lineWidth = 1.5*S;
    ctx.beginPath();
    for (let a = 0; a < Math.PI*4; a += 0.3) { const rr = sr*0.85*(1 - a/(Math.PI*4.4)); const x = Math.cos(a)*rr, y = Math.sin(a)*rr; a ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.restore();
    ctx.fillStyle = '#26262a'; ctx.beginPath(); ctx.arc(sx, sy, 1.5*S, 0, Math.PI*2); ctx.fill();
  }
  // slurry line ashore into the frame's feed box
  _wfPipe([[shoreX, shoreY], [shoreX, fY - 2*S]], S, t, on, '#e0906a');

  // ── Magnetic separator shed (open-sided, roof cut away over the drum) ──
  const mx = px + w*0.52, my = py + h*0.53, mw = w*0.44, mh = h*0.17;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(mx + 4*S, my + 5*S, mw, mh);
  ctx.fillStyle = '#6a3a24'; ctx.fillRect(mx, my, mw, mh*0.38);                                   // roof (north half)
  const rf = ctx.createLinearGradient(0, my, 0, my + mh*0.38); rf.addColorStop(0, '#b05a34'); rf.addColorStop(1, '#7a3a20');
  ctx.fillStyle = rf; ctx.fillRect(mx, my, mw, mh*0.38);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.6*S;
  for (let x = mx + 2*S; x < mx + mw; x += 2.5*S) { ctx.beginPath(); ctx.moveTo(x, my); ctx.lineTo(x, my + mh*0.38); ctx.stroke(); }
  ctx.fillStyle = '#2a2e32'; ctx.fillRect(mx, my + mh*0.38, mw, mh*0.62);                          // floor under
  const drY = my + mh*0.45, drH = mh*0.38;
  const dg = ctx.createLinearGradient(0, drY, 0, drY + drH);
  dg.addColorStop(0, '#d8dce0'); dg.addColorStop(0.5, '#7a8088'); dg.addColorStop(1, '#3a4048');
  ctx.fillStyle = dg; ctx.beginPath(); ctx.roundRect(mx + 2*S, drY, mw - 4*S, drH, drH/2); ctx.fill();
  if (on) {
    ctx.save(); ctx.beginPath(); ctx.roundRect(mx + 2*S, drY, mw - 4*S, drH, drH/2); ctx.clip();
    ctx.fillStyle = 'rgba(30,24,20,0.5)';
    const off = (t*14*S) % (5*S);
    for (let x = mx - 5*S + off; x < mx + mw; x += 5*S) ctx.fillRect(x, drY, 1.8*S, drH);
    ctx.restore();
  }
  ctx.fillStyle = '#c02a20'; ctx.fillRect(mx + 4*S, drY + drH*0.25, 2.5*S, drH*0.5);               // magnet pole marker
  // feed belt from the spiral frame across to the shed
  _wfConveyor(fX + fW, fY + fH*0.5, mx + 2*S, my + mh*0.65, S, t, on, '#a05a38');

  // ── Stockpiles: ilmenite (black), monazite (honey-red), zircon (white) ──
  const pyy = py + h*0.79;
  _fcPile(px + w*0.62, pyy, 10*S, 6*S, S, '#5a5048', '#1a1612');
  _fcPile(px + w*0.86, pyy - 1*S, 8*S, 5*S, S, '#ffb070', '#a04a24');
  _fcPile(px + w*0.42, pyy + 1*S, 5*S, 3.4*S, S, '#ffffff', '#b8b4a8');
  if (on) for (let k = 0; k < 4; k++) {                                          // grains raining off the drum
    const ph = (t*1.4 + k/4) % 1;
    ctx.fillStyle = k % 2 ? '#2a2018' : '#e0884a';
    ctx.beginPath(); ctx.arc(mx + mw*(k % 2 ? 0.25 : 0.75), my + mh + ph*6*S, 0.9*S, 0, Math.PI*2); ctx.fill();
  }

  // ── Ore cart rail (bottom), as on the Uranium Mine ──
  const portRight = ((e._rotation || 0) % 2) === 0;
  const railY = py + h*0.92;
  const rx0 = portRight ? px + w*0.06 : px;
  const rx1 = portRight ? px + w : px + w*0.94;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(rx0, railY - 4*S + 3*S, rx1 - rx0, 9*S);
  ctx.strokeStyle = '#3a3026'; ctx.lineWidth = 9*S;
  ctx.beginPath(); ctx.moveTo(rx0, railY); ctx.lineTo(rx1, railY); ctx.stroke();
  ctx.strokeStyle = '#6a5436'; ctx.lineWidth = 1.4*S;
  for (let x = rx0 + 3*S; x < rx1; x += 6*S) { ctx.beginPath(); ctx.moveTo(x, railY - 4*S); ctx.lineTo(x, railY + 4*S); ctx.stroke(); }
  ctx.strokeStyle = '#b0b0a8'; ctx.lineWidth = 1.2*S;
  [-2.5, 2.5].forEach(o => { ctx.beginPath(); ctx.moveTo(rx0, railY + o*S); ctx.lineTo(rx1, railY + o*S); ctx.stroke(); });
  _wfHazardStripe(portRight ? rx0 : rx1 - 4*S, railY - 6*S, 4*S, 12*S, S);

  // ── Gamma monitor post: monazite is mildly radioactive ──
  const gx = px + w*0.08, gTop = py + h*0.78;
  ctx.fillStyle = '#4a4e52'; ctx.fillRect(gx - 2*S, gTop - 2*S, 4*S, 7*S);
  const click = on && ((t*2.2) % 1) < 0.25;
  ctx.fillStyle = click ? '#ffd0a0' : (on ? '#b05a30' : '#3a2a20');
  ctx.beginPath(); ctx.arc(gx, gTop, 2.2*S, 0, Math.PI*2); ctx.fill();
  _wfTrefoil(gx + 7*S, gTop + 1*S, 3*S, '#e8c820', '#1a1608');

  // ── Ore carts on the rail ──
  const cartX0 = portRight ? rx0 : rx0 + 26*S, cartX1 = portRight ? rx1 - 26*S : rx1;
  const trackLen = Math.max(0, cartX1 - cartX0 - 22*S);
  [0, 0.5].forEach(off => {
    const ph = on ? ((t*0.08 + off) % 1) : off*0.6 + 0.15;
    const tri = ph < 0.5 ? ph*2 : 2 - ph*2;
    const cx = cartX0 + 11*S + tri*trackLen;
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(cx - 6*S, railY - 2*S, 18*S, 12*S);
    ctx.fillStyle = '#4a4238'; ctx.strokeStyle = '#1a1612'; ctx.lineWidth = S;
    ctx.fillRect(cx - 9*S, railY - 6*S, 18*S, 12*S); ctx.strokeRect(cx - 9*S, railY - 6*S, 18*S, 12*S);
    _fcPile(cx, railY - 0.5*S, 7*S, 4*S, S, '#f0a070', '#9a4a28');
  });

  _wfPlate('RARE EARTH MINE', px + w*0.50, py + h*0.035, S, accent, on);
  _wfLamp(px + w - 7*S, py + h*0.50, S, t, accent, on);

  if (typeof RareEarthSystem !== 'undefined' && e.col !== undefined)
    _coalMineOutStub(e, px, py, w, h, t, on, null, RareEarthSystem.outputPort(e));
  ctx.restore();
}

// ── Leach Plant (10×9) ──
// The real monazite route, top-down. Ore climbs a belt to a pug mill where
// it is mixed with sulfuric acid from the bunded acid tank, and the paste is
// baked in a rotary kiln (~200 °C, burner hood glowing at the discharge end,
// off-gas ducted to a packed scrubber and its stack). The baked cake is
// water-leached in three agitated tanks, settled in a thickener whose rake
// turns slowly, and filtered in a plate press; the liquor is precipitated
// and calcined into oxide, which fills a hopper and its lilac bulk bags over
// the OXIDE OUT belt. The press cake, carrying the ore's thorium, goes to a
// fenced drum yard whose drums and gauge are the tailings store. A pipe
// rack carries acid, slurry and liquor across the site, and an MCC room
// with lit windows runs it. Stands on a concrete yard (SiteYard). Stubs
// come from LeachPlantSystem.getStubs.
function renderLeachPlant(e, px, py, t) {
    const def = EntityDefs[T.LEACHPLANT];
    const w   = (e.width  || def.width)  * TILE;
    const h   = (e.height || def.height) * TILE;
    const on  = !!e.powered;
    const active = on && !!e._running;
    const oxFill   = Math.min(1, (e._oxide    || 0) / (def.oxideCapacity    || 300));
    const tailFill = Math.min(1, (e._tailings || 0) / (def.tailingsCapacity || 100));
    const S = (TILE / 40) * Math.max(1, Math.min(w / (8 * TILE), h / (7 * TILE)));
    const accent = _RE_ACCENT;
    const U = w / 10, V = h / 9;
    const X = c => px + c*U, Y = r => py + r*V;
    ctx.save();
    ctx.lineJoin = 'round';

    // ── Flows under the equipment ──
    _wfConveyor(X(1.5), Y(8.3), X(1.5), Y(3.05), S, t, active && !!e._hasOre, '#c06a3a');       // ore up to the pug mill
    _wfPipe([[X(3.5), Y(8.3)], [X(3.5), Y(7.05)]], S, t, on && !!e._hasAcid, '#e8e060');           // ACID IN to the tank
    _wfPipe([[X(2.78), Y(6.3)], [X(2.5), Y(6.3)], [X(2.5), Y(2.85)], [X(2.3), Y(2.85)]], S, t, active, '#e8e060');  // acid to the mill
    _wfPipe([[X(5.0), Y(2.15)], [X(5.0), Y(3.4)]], S, t, active, '#d88a60');                       // cake down to the rack
    for (const tx of [3.55, 4.85, 6.15]) _wfPipe([[X(tx), Y(3.4)], [X(tx), Y(3.85)]], S, t, active, '#e8a080');
    _wfPipe([[X(7.9), Y(2.9)], [X(7.9), Y(3.4)]], S, t, active, '#d8c8f0');                        // thickener overflow
    _wfPipe([[X(8.2), Y(3.4)], [X(8.2), Y(3.9)]], S, t, active, '#d8c8f0');                        // to the press
    _wfPipe([[X(7.6), Y(4.75)], [X(7.6), Y(5.2)], [X(5.6), Y(5.2)], [X(5.6), Y(5.6)]], S, t, active, '#d8c8f0'); // liquor to the calciner
    _wfConveyor(X(9.2), Y(4.7), X(9.2), Y(5.25), S, t, active, '#8a8a70');                         // press cake to the drum yard
    _wfConveyor(X(7.5), Y(6.6), X(7.5), Y(8.3), S, t, on && oxFill > 0, '#c8b8e8');                 // hopper down to OXIDE OUT
    _wfConveyor(X(6.45), Y(6.0), X(6.95), Y(6.0), S, t, active, '#c8b8e8');                        // calciner to the hopper

    // ── Off-gas duct along the north edge, kiln feed hood → scrubber ──
    {
      const dy = Y(0.95), r = 4*S;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(X(0.55) + 3*S, dy - r + 4*S, X(6.0) - X(0.55), r*2);
      const dg = ctx.createLinearGradient(0, dy - r, 0, dy + r);
      dg.addColorStop(0, '#a8aaa6'); dg.addColorStop(0.5, '#70726e'); dg.addColorStop(1, '#3a3c3a');
      ctx.fillStyle = dg; ctx.fillRect(X(0.55), dy - r, X(6.0) - X(0.55), r*2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let x = X(0.9); x < X(6.0); x += U*0.8) ctx.fillRect(x, dy - r, 1.2*S, r*2);
      ctx.fillStyle = dg; ctx.fillRect(X(0.55), dy - r, r*2, Y(1.45) - dy + r);
    }

    // ── Rotary acid-bake kiln ──
    {
      const ky = Y(1.75), kr = V*0.42, k0 = X(0.85), k1 = X(5.15);
      for (const f of [0.18, 0.5, 0.82]) {                                     // piers
        const bx = k0 + (k1 - k0)*f;
        ctx.fillStyle = '#6a6a64'; ctx.fillRect(bx - 5*S, ky - kr - 3*S, 10*S, kr*2 + 6*S);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bx + 5*S, ky - kr - 1*S, 2.5*S, kr*2 + 6*S);
      }
      _fcHCyl(k0, k1, ky, kr, S, ['#a89484', '#6a5446', '#2a1e18'], { bands: [0.18, 0.5, 0.82], bandColor: '#2a2622' });
      if (active) {
        ctx.save(); ctx.beginPath(); ctx.roundRect(k0, ky - kr, k1 - k0, kr*2, kr); ctx.clip();
        ctx.fillStyle = 'rgba(255,150,80,0.16)';
        const off = (t*11*S) % (9*S);
        for (let x = k0 - 9*S + off; x < k1; x += 9*S) ctx.fillRect(x, ky - kr, 3*S, kr*2);
        ctx.restore();
      }
      // girth gear and its drive
      const gx = k0 + (k1 - k0)*0.66;
      ctx.fillStyle = '#4a4440'; ctx.fillRect(gx - 3*S, ky - kr - 3.5*S, 6*S, kr*2 + 7*S);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.5*S;
      for (let k = 0; k < 7; k++) { const yy = ky - kr - 3*S + k*(kr*2 + 6*S)/6; ctx.beginPath(); ctx.moveTo(gx - 3*S, yy); ctx.lineTo(gx + 3*S, yy); ctx.stroke(); }
      ctx.fillStyle = '#2a5a8a'; ctx.fillRect(gx - 5*S, ky + kr + 3*S, 10*S, 6*S);     // drive motor
      ctx.fillStyle = '#c8ccd0'; ctx.fillRect(gx - 4*S, ky + kr + 4*S, 3*S, 4*S);
      // feed hood (west) and burner hood (east)
      ctx.fillStyle = '#5a5650'; ctx.fillRect(X(0.45), ky - kr - 3*S, k0 - X(0.45) + 3*S, kr*2 + 6*S);
      ctx.strokeStyle = '#1a1816'; ctx.lineWidth = S; ctx.strokeRect(X(0.45), ky - kr - 3*S, k0 - X(0.45) + 3*S, kr*2 + 6*S);
      const bhx = k1 - 3*S, bhw = X(5.85) - bhx;
      ctx.fillStyle = 'rgba(0,0,0,0.33)'; ctx.fillRect(bhx + 4*S, ky - kr - 4*S + 5*S, bhw, kr*2 + 8*S);
      ctx.fillStyle = '#6e4a36'; ctx.fillRect(bhx, ky - kr - 4*S, bhw, kr*2 + 8*S);
      ctx.strokeStyle = '#1a1210'; ctx.strokeRect(bhx, ky - kr - 4*S, bhw, kr*2 + 8*S);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(bhx, ky - kr - 4*S, bhw, 2*S);
      const fl = active ? 0.75 + 0.2*Math.sin(t*9) + 0.08*Math.sin(t*23) : on ? 0.2 : 0;
      const bg = ctx.createRadialGradient(bhx + bhw*0.55, ky, 0, bhx + bhw*0.55, ky, kr*1.6);
      bg.addColorStop(0, `rgba(255,190,90,${fl.toFixed(3)})`); bg.addColorStop(0.5, `rgba(255,110,40,${(fl*0.6).toFixed(3)})`); bg.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = '#1a0e08'; ctx.beginPath(); ctx.arc(bhx + bhw*0.55, ky, kr*0.5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bhx + bhw*0.55, ky, kr*1.6, 0, Math.PI*2); ctx.fill();
    }

    // ── Scrubber tower and its stack ──
    _fcVTank(X(6.4), Y(1.15), V*0.48, S, { shell: ['#e0e4e0', '#9aa4a0', '#46504c'], band: '#2a8a6a', ladderAngle: 2.2 });
    {
      const sx = X(7.0), sy = Y(0.62), sr = V*0.2;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(sx + 5*S, sy + 6*S, sr, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#d8d4cc'; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#b02a20'; ctx.lineWidth = 2*S; ctx.beginPath(); ctx.arc(sx, sy, sr - 1.5*S, 0, Math.PI*2); ctx.stroke();
      ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(sx, sy, sr*0.55, 0, Math.PI*2); ctx.fill();
      _wfSmoke(sx, sy, S*0.9, t, '235,235,228', active, 0.3);
    }

    // ── Thickener: a wide basin, launder ring, rake bridge turning ──
    {
      const cx = X(8.55), cy = Y(1.95), r = Math.min(U*1.15, V*1.15);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(cx + 5*S, cy + 6*S, r, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#8a8880'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#3a3a36'; ctx.lineWidth = 1.2*S; ctx.stroke();
      ctx.strokeStyle = '#4a5450'; ctx.lineWidth = 2.6*S; ctx.beginPath(); ctx.arc(cx, cy, r - 3*S, 0, Math.PI*2); ctx.stroke();  // launder
      const wr = r - 5*S;
      const wg = ctx.createRadialGradient(cx, cy, 1, cx, cy, wr);
      wg.addColorStop(0, active ? '#8a6040' : '#5a4a3a'); wg.addColorStop(0.55, active ? '#a89070' : '#6a6050'); wg.addColorStop(1, active ? '#a8c0c8' : '#5a666a');
      ctx.fillStyle = wg; ctx.beginPath(); ctx.arc(cx, cy, wr, 0, Math.PI*2); ctx.fill();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(active ? t*0.35 : 0.8);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(2*S, -2*S + 3*S, wr, 4*S);
      ctx.fillStyle = '#d8b030'; ctx.fillRect(0, -2*S, wr, 4*S);                    // bridge
      ctx.strokeStyle = '#6a5010'; ctx.lineWidth = 0.6*S;
      for (let x = 2*S; x < wr; x += 4*S) { ctx.beginPath(); ctx.moveTo(x, -2*S); ctx.lineTo(x + 2*S, 2*S); ctx.stroke(); }
      if (active) { ctx.strokeStyle = 'rgba(220,235,240,0.5)'; ctx.lineWidth = 0.8*S; ctx.beginPath(); ctx.arc(0, 0, wr*0.75, -0.5, -0.05); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = '#3a3e42'; ctx.beginPath(); ctx.arc(cx, cy, 5*S, 0, Math.PI*2); ctx.fill();    // centre drive
      ctx.fillStyle = '#2a6aa8'; ctx.beginPath(); ctx.arc(cx, cy, 2.6*S, 0, Math.PI*2); ctx.fill();
    }

    // ── Pug mill: twin paddle shafts mixing ore and acid ──
    {
      const mx = X(0.85), my = Y(2.45), mw = X(2.35) - mx, mh = Y(3.05) - my;
      ctx.fillStyle = 'rgba(0,0,0,0.33)'; ctx.fillRect(mx + 4*S, my + 5*S, mw, mh);
      ctx.fillStyle = '#4a4640'; ctx.fillRect(mx, my, mw, mh);
      ctx.strokeStyle = '#1a1814'; ctx.lineWidth = S; ctx.strokeRect(mx, my, mw, mh);
      ctx.fillStyle = active ? '#8a5a36' : '#3a3026'; ctx.fillRect(mx + 2*S, my + 2*S, mw - 4*S, mh - 4*S);
      ctx.strokeStyle = '#c8ccd0'; ctx.lineWidth = 1.1*S;
      for (const sy of [my + mh*0.33, my + mh*0.67]) for (let k = 0; k < 6; k++) {
        const x = mx + 4*S + k*(mw - 8*S)/5, a = (active ? t*5 : 0) + k*0.9;
        ctx.beginPath(); ctx.moveTo(x - Math.cos(a)*2*S, sy - Math.sin(a)*2*S); ctx.lineTo(x + Math.cos(a)*2*S, sy + Math.sin(a)*2*S); ctx.stroke();
      }
      ctx.fillStyle = '#2a5a8a'; ctx.fillRect(mx + mw - 1*S, my + 1*S, 6*S, mh - 2*S);     // drive
      _wfPipe([[mx + 4*S, my], [mx + 4*S, Y(2.15)]], S, t, active, '#c06a3a');              // paste up the chute
    }

    // ── Pipe rack across the site ──
    _fcRack(X(2.3), X(9.75), Y(3.15), Y(3.65), S, t, [
      { y: Y(3.25), color: '#e8e060', on: active, x1: X(3.0) },
      { y: Y(3.4),  color: '#e8a080', on: active },
      { y: Y(3.55), color: '#d8c8f0', on: active, x0: X(5.6) },
    ], U*0.9);

    // ── Agitated leach tanks ──
    [3.55, 4.85, 6.15].forEach((tx, i) => {
      const cx = X(tx), cy = Y(4.38), r = Math.min(U, V)*0.55;
      _fcVTank(cx, cy, r, S, { shell: ['#c8c4bc', '#7a7470', '#34302c'], liquid: active ? ['#f8c098', '#b8603a'] : ['#6a5040', '#2a1e18'], ladder: false });
      if (active) {
        ctx.strokeStyle = 'rgba(255,230,210,0.45)'; ctx.lineWidth = 0.9*S;
        for (let k = 0; k < 2; k++) { const a = t*2.2*(i % 2 ? -1 : 1) + k*Math.PI; ctx.beginPath(); ctx.arc(cx, cy, r*0.5, a, a + 1.4); ctx.stroke(); }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(cx - r + 2*S, cy - 1.6*S + 2*S, r*2, 3.2*S);     // bridge
      ctx.fillStyle = '#5a5e62'; ctx.fillRect(cx - r, cy - 1.6*S, r*2, 3.2*S);
      ctx.fillStyle = '#2a5a8a'; ctx.fillRect(cx - 3.5*S, cy - 3.5*S, 7*S, 7*S);                    // gearmotor
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(cx - 3.5*S, cy - 3.5*S, 7*S, 1.4*S);
      ctx.fillStyle = on ? '#40e070' : '#2a3a2a'; ctx.beginPath(); ctx.arc(cx + 2*S, cy + 2*S, 0.9*S, 0, Math.PI*2); ctx.fill();
    });

    // ── Plate filter press ──
    {
      const fx = X(7.35), fy = Y(3.9), fw = X(9.7) - fx, fh = Y(4.72) - fy;
      ctx.fillStyle = 'rgba(0,0,0,0.33)'; ctx.fillRect(fx + 4*S, fy + 5*S, fw, fh);
      ctx.fillStyle = '#3a3e42'; ctx.fillRect(fx, fy + fh*0.2, fw, fh*0.6);                          // side bars
      const open = active ? (Math.sin(t*0.4) > 0.85 ? 1 : 0) : 0;
      const n = 14, pw = (fw - 16*S) / n;
      for (let k = 0; k < n; k++) {
        const x = fx + 8*S + k*pw + (open && k > n*0.6 ? 2*S : 0);
        ctx.fillStyle = k % 2 ? '#c8c4bc' : '#a8a49c'; ctx.fillRect(x, fy + 1.5*S, pw - 0.6*S, fh - 3*S);
      }
      ctx.fillStyle = '#2a2c2e'; ctx.fillRect(fx, fy, 8*S, fh); ctx.fillRect(fx + fw - 8*S, fy, 8*S, fh);   // heads
      ctx.fillStyle = '#c8ccd0'; ctx.fillRect(fx + fw - 12*S, fy + fh*0.4, 4*S, fh*0.2);                   // ram
      ctx.fillStyle = '#d8b030'; ctx.fillRect(fx, fy + fh - 1.5*S, fw, 1.5*S);
    }

    // ── Bunded sulfuric acid tank ──
    {
      const bx = X(2.6), by = Y(5.35), bw = X(4.42) - bx, bh = Y(7.25) - by;
      ctx.fillStyle = '#5e5c56'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#8a877e'; ctx.fillRect(bx + 3*S, by + 3*S, bw - 6*S, bh - 6*S);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = S; ctx.strokeRect(bx + 0.5*S, by + 0.5*S, bw - S, bh - S);
      ctx.fillStyle = 'rgba(200,190,60,0.18)'; ctx.beginPath(); ctx.ellipse(bx + bw*0.3, by + bh*0.8, 6*S, 3*S, 0, 0, Math.PI*2); ctx.fill();
      _fcVTank(X(3.5), Y(6.28), Math.min(U, V)*0.72, S, { shell: ['#f4f0e0', '#c8c098', '#6a6440'], band: '#1a1a18', ladderAngle: 2.4 });
      ctx.strokeStyle = '#e8c820'; ctx.lineWidth = 1.2*S; ctx.setLineDash([3*S, 3*S]);
      ctx.beginPath(); ctx.arc(X(3.5), Y(6.28), Math.min(U, V)*0.72 - 2.2*S, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
      _fcDiamond(X(3.5), Y(6.28), 9*S, '#1a1a1a', '⚠');
    }

    // ── Calciner: a refractory tunnel furnace drying precipitate to oxide ──
    {
      const cx = X(4.72), cy = Y(5.6), cw = X(6.45) - cx, chh = Y(6.42) - cy;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(cx + 4*S, cy + 5*S, cw, chh);
      const cg = ctx.createLinearGradient(0, cy, 0, cy + chh);
      cg.addColorStop(0, '#8a7a70'); cg.addColorStop(1, '#4a3e38');
      ctx.fillStyle = cg; ctx.fillRect(cx, cy, cw, chh);
      ctx.strokeStyle = '#1a1210'; ctx.lineWidth = 1.2*S; ctx.strokeRect(cx, cy, cw, chh);
      for (let k = 0; k < 5; k++) {
        const g = active ? 0.55 + 0.3*Math.sin(t*3 + k*1.3) : on ? 0.12 : 0;
        ctx.fillStyle = '#140a06'; ctx.fillRect(cx + cw*(0.06 + k*0.19), cy + chh*0.3, cw*0.12, chh*0.4);
        ctx.fillStyle = `rgba(255,${130 + k*18},60,${g.toFixed(3)})`; ctx.fillRect(cx + cw*(0.06 + k*0.19), cy + chh*0.3, cw*0.12, chh*0.4);
      }
      const stx = cx + cw*0.88, sty = cy + 4*S;
      ctx.fillStyle = '#3a3634'; ctx.beginPath(); ctx.arc(stx, sty, 3.2*S, 0, Math.PI*2); ctx.fill();
      _wfSmoke(stx, sty, S*0.7, t, '225,215,235', active, 0.25);
    }

    // ── Oxide hopper and its bulk bags ──
    {
      const hx = X(6.75), hy = Y(5.4), hw = X(8.2) - hx, hh = Y(6.62) - hy;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(hx + 4*S, hy + 5*S, hw, hh);
      ctx.fillStyle = '#5a5664'; ctx.fillRect(hx, hy, hw, hh);
      ctx.strokeStyle = '#16141a'; ctx.lineWidth = 1.2*S; ctx.strokeRect(hx, hy, hw, hh);
      // hopper throat, filling lilac with the buffer
      const ix = hx + 4*S, iy = hy + 4*S, iw = hw - 8*S, ih = hh - 8*S;
      ctx.fillStyle = '#26232c'; ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(ix + iw, iy); ctx.lineTo(ix + iw*0.62, iy + ih); ctx.lineTo(ix + iw*0.38, iy + ih); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.clip();
      const fy = iy + ih*(1 - oxFill);
      const og = ctx.createLinearGradient(0, fy, 0, iy + ih); og.addColorStop(0, on ? '#ece0fa' : '#7a7480'); og.addColorStop(1, on ? '#b8a4d8' : '#5a5462');
      ctx.fillStyle = og; ctx.fillRect(ix, fy, iw, ih);
      ctx.restore();
      ctx.font = `bold ${Math.max(4, 4.5*S)}px Courier New`; ctx.textAlign = 'center';
      ctx.fillStyle = on ? '#e8dcff' : '#6a6470';
      ctx.fillText(`REO ${Math.round(oxFill*100)}%`, hx + hw/2, hy - 2.5*S);
      ctx.textAlign = 'left';
      // bulk bags (FIBCs) waiting on pallets, one per sixth of the store
      const bags = Math.round(oxFill*6);
      for (let k = 0; k < bags; k++) {
        const bx = X(4.75) + (k % 3)*U*0.55, by = Y(6.62) + Math.floor(k/3)*V*0.48;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bx + 2*S, by + 2.5*S, U*0.42, V*0.36);
        ctx.fillStyle = '#9a7a4a'; ctx.fillRect(bx - 1*S, by - 1*S, U*0.42 + 2*S, V*0.36 + 2*S);
        ctx.fillStyle = '#d8ccec'; ctx.beginPath(); ctx.roundRect(bx, by, U*0.42, V*0.36, 2*S); ctx.fill();
        ctx.strokeStyle = 'rgba(80,60,110,0.6)'; ctx.lineWidth = 0.6*S; ctx.stroke();
        ctx.fillStyle = '#5a3a8a'; for (const [lx, ly] of [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]) ctx.fillRect(bx + U*0.42*lx - 0.8*S, by + V*0.36*ly - 0.8*S, 1.6*S, 1.6*S);
      }
    }

    // ── Tailings drum yard: fenced, trefoil; drums fill with the store ──
    {
      const yx = X(8.45), yy = Y(5.25), yw = X(9.78) - yx, yh = Y(7.65) - yy;
      ctx.fillStyle = 'rgba(40,36,24,0.55)'; ctx.fillRect(yx, yy, yw, yh);
      ctx.strokeStyle = '#d8a820'; ctx.lineWidth = S; ctx.setLineDash([3*S, 2*S]);
      ctx.strokeRect(yx, yy, yw, yh); ctx.setLineDash([]);
      const cols = 3, rows = 5, lit = Math.round(tailFill*cols*rows);
      const gw = yw - 8*S;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (r*cols + c >= lit) continue;
        const dx = yx + 2*S + gw*(c + 0.5)/cols, dy = yy + yh*(r + 0.5)/rows, dr = Math.min(gw/cols, yh/rows)*0.36;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(dx + 1.5*S, dy + 2*S, dr, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#d0b420'; ctx.beginPath(); ctx.arc(dx, dy, dr, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#4a3a08'; ctx.lineWidth = 0.6*S; ctx.beginPath(); ctx.arc(dx, dy, dr*0.62, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = '#1a1608'; ctx.beginPath(); ctx.arc(dx - dr*0.3, dy - dr*0.3, dr*0.16, 0, Math.PI*2); ctx.fill();
      }
      _wfTrefoil(yx + 5*S, yy - 4*S, 4.2*S, '#e8c820', '#1a1608');
      _wfGauge(yx + yw - 5*S, yy + 2*S, 4.5*S, yh - 4*S, S, tailFill, '#e8c820', on);
    }

    // ── MCC / control room on the west strip ──
    _fcBuilding(X(0.15), Y(3.55), X(1.05) - X(0.15), Y(7.35) - Y(3.55), S, t,
      { lit: on, roof0: '#c4c8cc', roof1: '#90969c', units: [[0.5, 0.2], [0.5, 0.55]], spin: on });

    // ── Stubs (bottom face): ORE IN belt col+1, ACID IN pipe col+3,
    // OXIDE OUT belt col+7 — tile-anchored to LeachPlantSystem.getStubs.
    const TH = TILE/2;
    const P = _fcPorts(px, py, h, S, t);
    const oxOut = typeof LeachPlantSystem !== 'undefined' && e.col !== undefined ? LeachPlantSystem.getStubs(e).oxideOut : null;
    P.belt(px + TILE*1 + TH, 'ORE IN', !!e._hasOre, true, active, '#e08a5a', '#ff9a5a');
    P.pipe(px + TILE*3 + TH, 'ACID IN', !!e._hasAcid, '#f0f060', '#f4f060', '#8a8a10', 'rgba(60,60,0,0.8)');
    P.belt(px + TILE*7 + TH, 'OXIDE OUT', _fcBeltAt(oxOut), false, on && oxFill > 0, '#d8cce8', '#c8b0f0');

    _wfPlate('LEACH PLANT', px + w*0.50, py + h*0.045, S, accent, on);
    _wfLamp(px + w - 9*S, py + 9*S, S, t, accent, on);
    ctx.restore();
}
