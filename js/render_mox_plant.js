/* ═══════════════════════════════════════════════════════════════════
   ADVANCED FUEL PROCESSING RENDERER
   A MOX fabrication line on a 15×13 site, read as a serpentine: two feed
   hoppers on the intake deck (plutonium oxide left, uranium oxide right)
   drop into a ball mill → through the containment wall to the pellet
   press → the glovebox train → back along a sealed transfer tunnel to a
   continuous tunnel kiln → the rod loading bay on the product wall.

   The whole site is one building. The top third is the receiving deck —
   checker-plate floor, the two hoppers with their transport cans staged
   beside them, and the mill with its drive. A containment wall with a
   personnel airlock separates it from the process hall, where the
   plutonium-bearing powder actually lives.

   The glovebox train is still the point of the building. Plutonium powder
   is handled in sealed, nitrogen-filled boxes with arm ports along the
   front, never in open air — so the line is drawn as a run of sealed cells
   with glove ports, not as open vats like the wet plant upstream. Things
   the bigger site adds, all real:

     • The off-gas bank. Gloveboxes are held at a DEPRESSION relative to the
       room and vented through HEPA stages, so that any leak is inward. The
       filter stack and its pressure gauge are that system, and they are
       what makes this plant read as containment rather than a factory.
     • The tunnel kiln. Pressed green pellets are sintered continuously at
       about 1700 °C in argon/hydrogen, not fired in a box — so the pellets
       are drawn travelling through a temperature gradient, cold at the
       charge end and white at the soak zone.
     • The gas rack. Bottled N₂ keeps the cells inert; the Ar/H₂ mix is the
       kiln's sintering atmosphere (red-shouldered: the hydrogen burns).
     • The transfer tunnel. Boats leave the last cell through a sealed
       tunnel, never through the room, and ride it back to the kiln.

   There is still no water anywhere on it: fabrication is dry powder
   metallurgy, which is the mechanical difference between this plant and
   the Reprocessing Plant.

   Ports come from MoxPlantSystem.getStubs(), so a rotated plant feeds the
   same equipment from whichever faces the rotation put them on, and the
   hoppers sit under the intake columns those stubs land on. Shares the
   _wf* helpers (render_hydro_coal.js) and the _port* / _fc* helpers
   (render_oil_nuclear.js); all are plain global function declarations, so
   load order between these files doesn't matter.
   ═══════════════════════════════════════════════════════════════════ */

// Checker-plate deck (a repeating pattern, scaled with the sprite): raised
// lozenges laid alternately, the standard anti-slip tread.
let _moxTreadPat = null;
function _moxTread(x, y, w, h, S, on) {
  if (!_moxTreadPat) {
    const c = document.createElement('canvas'); c.width = c.height = 12;
    const g = c.getContext('2d');
    g.fillStyle = '#4b4f50'; g.fillRect(0, 0, 12, 12);
    g.lineCap = 'round'; g.lineWidth = 1.6;
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.moveTo(2.4, 5.4); g.lineTo(5.4, 2.4); g.moveTo(7.4, 7.4); g.lineTo(10.4, 10.4); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.20)';
    g.beginPath(); g.moveTo(1.8, 4.8); g.lineTo(4.8, 1.8); g.moveTo(6.8, 7.8); g.lineTo(9.8, 10.8); g.stroke();
    _moxTreadPat = g.createPattern(c, 'repeat');
  }
  _moxTreadPat.setTransform(new DOMMatrix([S * 0.8, 0, 0, S * 0.8, x, y]));
  ctx.fillStyle = _moxTreadPat; ctx.fillRect(x, y, w, h);
  if (!on) { ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(x, y, w, h); }
}

function renderMoxPlant(e, px, py, t) {
  const def = EntityDefs[T.MOXPLANT];
  const w   = (e.width  || def.width)  * TILE;
  const h   = (e.height || def.height) * TILE;
  const on  = e.powered;
  const active = !!e._running;
  const S = TILE / 40;
  const k = Math.min(w, h) / (13*TILE);   // detail scale, 1 at the designed 15×13
  const Z = S * Math.max(0.7, k);          // hardware scale: bolts, teeth, boats grow with the site
  const accent    = '#ff9060';
  const plutColor = '#ff8a30';   // matches the Reprocessing Plant's plutonium line
  const uColor    = '#8ad860';   // matches the uranium/rod chain
  const moxColor  = '#ffc24a';   // the blended product
  const hotColor  = '#ffd890';   // sinter heat
  const gasColor  = 'rgba(150,170,190,0.55)';
  const moxCap    = def.moxCapacity || 300;
  const moxFill   = Math.min(1, (e._mox || 0) / moxCap);
  const font = (sz, bold = true) => `${bold ? 'bold ' : ''}${Math.max(4, sz*S*Math.min(1.3, k))}px Courier New`;
  ctx.save();

  // ── Ports ──
  const st = (typeof MoxPlantSystem !== 'undefined') ? MoxPlantSystem.getStubs(e) : null;
  const aPlut = st && _portAnchor(e, px, py, w, h, st.plutoniumIn);
  const aUran = st && _portAnchor(e, px, py, w, h, st.uraniumIn);
  const aMox  = st && _portAnchor(e, px, py, w, h, st.moxOut);

  // ── Layout anchors ──
  // Each hopper sits straight under its intake stub when the stub is on the
  // top face (the default), so the belt drops straight in rather than
  // stopping beside the hopper.
  const _underTop = (a, fallback) => (a && a.face === 'top') ? a.x : fallback;
  const puHopX = _underTop(aPlut, px + w * 0.167), puHopY = py + h * 0.185;   // PuO₂ feed hopper
  const uHopX  = _underTop(aUran, px + w * 0.833), uHopY  = py + h * 0.185;   // UO₂ feed hopper
  const hopW   = w * 0.085,      hopH  = h * 0.095;
  const millX  = px + w * 0.500, millY = py + h * 0.245;    // ball mill / blender
  const millW  = w * 0.115,      millH = h * 0.130;
  const wallY  = py + h * 0.405;                            // containment wall
  const hpuX   = px + w * 0.045, hpuY  = py + h * 0.448;    // hydraulic power unit
  const hpuW   = w * 0.072,      hpuH  = h * 0.105;
  const presX  = px + w * 0.205, presY = py + h * 0.535;    // pellet press
  const presW  = w * 0.066,      presH = h * 0.090;
  const gloveY = py + h * 0.535, gloveR = w * 0.052, gloveH = h * 0.090;
  const gloves = [px + w*0.360, px + w*0.480, px + w*0.600, px + w*0.720];
  const gasX   = px + w * 0.812, gasY  = py + h * 0.445;    // N₂ / Ar-H₂ bottle rack
  const gasW   = w * 0.150,      gasH  = h * 0.180;
  const tunY   = py + h * 0.655;                            // transfer tunnel
  const kilnX  = px + w * 0.265, kilnW = w * 0.665;         // tunnel kiln
  const kilnY  = py + h * 0.695, kilnH = h * 0.105;
  const ogX    = px + w * 0.035, ogY   = py + h * 0.660;    // off-gas / HEPA bank
  const ogW    = w * 0.140,      ogH   = h * 0.250;
  const bayX   = px + w * 0.567, bayY  = py + h * 0.885;    // rod loading bay
  const bayW   = w * 0.150,      bayH  = h * 0.060;
  const panX   = px + w * 0.785, panY  = py + h * 0.832;    // status panel
  const panW   = w * 0.178,      panH  = h * 0.128;

  // ── Site slab ──
  // One building: the receiving deck (checker plate) behind the containment
  // wall, the sealed process hall (epoxy bays, saw-cut joints, drains) in
  // front of it. Each unit then sits on its own anchored plinth, so the
  // equipment reads as installed, not scattered.
  const plinth = (x, y, pw2, ph2) => {
    const m = 3*S;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x - m + 1.5*S, y - m + 2*S, pw2 + m*2, ph2 + m*2);
    ctx.fillStyle = on ? '#555958' : '#3a3d3c';
    ctx.beginPath(); ctx.roundRect(x - m, y - m, pw2 + m*2, ph2 + m*2, 1.5*S); ctx.fill();
    ctx.fillStyle = on ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(x - m + 1*S, y - m + 0.6*S, pw2 + m*2 - 2*S, 0.9*S);
    ctx.fillStyle = on ? '#8a8e8c' : '#4a4e4c';
    [[x - m*0.5, y - m*0.5], [x + pw2 + m*0.5, y - m*0.5], [x - m*0.5, y + ph2 + m*0.5], [x + pw2 + m*0.5, y + ph2 + m*0.5]]
      .forEach(([bx, by]) => { ctx.beginPath(); ctx.arc(bx, by, 0.8*S, 0, Math.PI*2); ctx.fill(); });
  };
  const fx0 = px + w*0.012, fx1 = px + w*0.988, fy0 = py + h*0.012, fy1 = py + h*0.988;
  const fw = fx1 - fx0, fh = fy1 - fy0;
  {
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath(); ctx.roundRect(fx0 + 3*S, fy0 + 4*S, fw, fh, 4*S); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(fx0, fy0, fw, fh, 4*S); ctx.clip();

    // Receiving deck.
    _moxTread(fx0, fy0, fw, wallY - fy0, S, on);

    // Process hall.
    const fg = ctx.createLinearGradient(fx0, wallY, fx1, fy1);
    fg.addColorStop(0, on ? '#4c504f' : '#363938');
    fg.addColorStop(1, on ? '#3b3f3f' : '#2a2d2d');
    ctx.fillStyle = fg;
    ctx.fillRect(fx0, wallY, fw, fy1 - wallY);
    // Epoxy bays: every other 2×2-tile bay a shade lighter.
    const bay = TILE * 2;
    ctx.fillStyle = on ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.012)';
    for (let i = 0; fx0 + i*bay < fx1; i++) {
      for (let j = 0; wallY + j*bay < fy1; j++) {
        if ((i + j) % 2) continue;
        ctx.fillRect(fx0 + i*bay, wallY + j*bay, bay, bay);
      }
    }
    // Saw-cut joints with a lit lip (one path per tone).
    ctx.lineWidth = 0.8*S;
    const joints = (off) => {
      ctx.beginPath();
      for (let x = fx0 + bay; x < fx1; x += bay) { ctx.moveTo(x + off, wallY); ctx.lineTo(x + off, fy1); }
      for (let y = wallY + bay; y < fy1; y += bay) { ctx.moveTo(fx0, y + off); ctx.lineTo(fx1, y + off); }
      ctx.stroke();
    };
    ctx.strokeStyle = 'rgba(0,0,0,0.38)'; joints(0);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; joints(0.8*S);
    // Wear and a couple of old stains (fixed, so they don't crawl).
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    [[0.30, 0.62, 0.05, 0.02], [0.72, 0.50, 0.04, 0.02], [0.48, 0.95, 0.07, 0.02], [0.20, 0.82, 0.03, 0.03],
     [0.33, 0.09, 0.04, 0.02], [0.66, 0.31, 0.05, 0.02]]
      .forEach(([ux, uy, rx, ry]) => {
        ctx.beginPath(); ctx.ellipse(px + w*ux, py + h*uy, w*rx, h*ry, 0.3, 0, Math.PI*2); ctx.fill();
      });
    // Floor drains: slotted grates, the spill route away from the line.
    [[0.265, 0.435], [0.785, 0.660], [0.215, 0.950], [0.745, 0.950]].forEach(([ux, uy]) => {
      const gx = px + w*ux, gy = py + h*uy, gs = 5*S;
      ctx.fillStyle = on ? '#2a2c2c' : '#1c1e1e';
      ctx.fillRect(gx - gs, gy - gs*0.6, gs*2, gs*1.2);
      ctx.strokeStyle = on ? '#6a6e6c' : '#3a3d3c'; ctx.lineWidth = 0.6*S;
      ctx.strokeRect(gx - gs, gy - gs*0.6, gs*2, gs*1.2);
      ctx.strokeStyle = '#0c0d0d'; ctx.lineWidth = 0.7*S;
      ctx.beginPath();
      for (let q = 1; q < 6; q++) { const sx = gx - gs + gs*2*q/6; ctx.moveTo(sx, gy - gs*0.45); ctx.lineTo(sx, gy + gs*0.45); }
      ctx.stroke();
    });
    ctx.restore();

    // Kerb edge and the painted walkway lines just inside each zone.
    ctx.strokeStyle = on ? '#6a6e6c' : '#3e4241'; ctx.lineWidth = 1.4*S;
    ctx.beginPath(); ctx.roundRect(fx0, fy0, fw, fh, 4*S); ctx.stroke();
    ctx.save();
    ctx.setLineDash([7*S, 4*S]);
    ctx.strokeStyle = on ? 'rgba(232,184,40,0.55)' : 'rgba(150,120,40,0.3)'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.roundRect(fx0 + 5*S, wallY + 8*S, fw - 10*S, fy1 - wallY - 13*S, 2*S); ctx.stroke();
    ctx.restore();
    // Corner bollards.
    [[fx0 + 4*S, fy0 + 4*S], [fx1 - 4*S, fy0 + 4*S], [fx0 + 4*S, fy1 - 4*S], [fx1 - 4*S, fy1 - 4*S]].forEach(([bx, by]) => {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(bx + 1*S, by + 1.5*S, 2.8*S, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#e8b020'; ctx.beginPath(); ctx.arc(bx, by, 2.8*S, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#1a1610'; ctx.beginPath(); ctx.arc(bx, by, 1.4*S, 0, Math.PI*2); ctx.fill();
    });
  }

  // ── Containment wall ──
  // Thick poured wall between deck and hall, with a personnel airlock (two
  // interlocked doors and the lobby between them) and sleeved penetrations
  // where the mill's discharge and the vent header pass through.
  {
    const wt = 6*S;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(fx0, wallY + wt*0.5, fw, wt);
    const wg = ctx.createLinearGradient(0, wallY - wt*0.5, 0, wallY + wt*0.5);
    wg.addColorStop(0, on ? '#9a9c98' : '#5a5c58');
    wg.addColorStop(0.35, on ? '#7a7c78' : '#454744');
    wg.addColorStop(1, on ? '#4a4c48' : '#2c2e2c');
    ctx.fillStyle = wg;
    ctx.fillRect(fx0, wallY - wt*0.5, fw, wt);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.6*S;
    ctx.beginPath();
    for (let x = fx0 + TILE*1.5; x < fx1; x += TILE*1.5) { ctx.moveTo(x, wallY - wt*0.5); ctx.lineTo(x, wallY + wt*0.5); }
    ctx.stroke();

    // Airlock lobby, straddling the wall near the HPU end.
    const alX = px + w*0.135, alW = w*0.060, alY = wallY - h*0.040, alH = h*0.080;
    ctx.fillStyle = on ? '#3e4446' : '#272b2c';
    ctx.fillRect(alX, alY, alW, alH);
    ctx.strokeStyle = on ? '#9a9c98' : '#5a5c58'; ctx.lineWidth = 2*S;
    ctx.strokeRect(alX, alY, alW, alH);
    // The two sliding doors: interlocked, never both open. The outer one
    // cycles while the plant runs; the inner one stays shut.
    const swing = active ? Math.max(0, Math.sin(t*0.7)) : 0;
    const dw = alW*0.7, dh = 2.2*S;
    ctx.fillStyle = on ? '#e8b020' : '#6a5a20';
    ctx.fillRect(alX + alW*0.15 + swing*dw*0.8, alY - dh*0.5, dw, dh);
    ctx.fillRect(alX + alW*0.15, alY + alH - dh*0.5, dw, dh);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(alX + alW*0.15 + swing*dw*0.8, alY - dh*0.5, dw, 0.6*S);
    ctx.fillRect(alX + alW*0.15, alY + alH - dh*0.5, dw, 0.6*S);
    // Step-off pad inside the lobby.
    ctx.strokeStyle = on ? 'rgba(232,176,32,0.6)' : 'rgba(120,96,30,0.4)'; ctx.lineWidth = 0.8*S;
    ctx.strokeRect(alX + alW*0.2, alY + alH*0.25, alW*0.6, alH*0.5);
    ctx.fillStyle = swing > 0.15 ? '#ff5030' : '#40ff90';
    ctx.beginPath(); ctx.arc(alX + alW + 3*S, alY + alH*0.25, 1.3*S, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = swing > 0.15 ? '#40ff90' : '#ff5030';
    ctx.beginPath(); ctx.arc(alX + alW + 3*S, alY + alH*0.75, 1.3*S, 0, Math.PI*2); ctx.fill();
    // Contamination monitor (hand-and-foot) on the hall side of the lobby.
    const cmX = alX + alW + 7*S, cmY = wallY + 4*S;
    ctx.fillStyle = on ? '#d8dcd8' : '#5a5e5a';
    ctx.beginPath(); ctx.roundRect(cmX, cmY, 7*S, 9*S, 1*S); ctx.fill();
    ctx.fillStyle = on ? '#1a2a1a' : '#141814'; ctx.fillRect(cmX + 1.2*S, cmY + 1.2*S, 4.6*S, 3*S);
    ctx.fillStyle = on ? '#40ff90' : '#2a3a2a'; ctx.fillRect(cmX + 1.6*S, cmY + 2*S, 2.2*S*(on ? 1 : 0.3), 1.2*S);
    ctx.fillStyle = on ? 'rgba(220,226,232,0.75)' : 'rgba(110,116,120,0.5)';
    ctx.font = font(3.6); ctx.textAlign = 'center';
    ctx.fillText('AIRLOCK', alX + alW*0.5, alY + alH + 5.5*S); ctx.textAlign = 'left';
  }

  if (aPlut) _portFeed(aPlut, puHopX, puHopY, S, t, !!e._hasPlutonium,   'belt', plutColor);
  if (aUran) _portFeed(aUran, uHopX,  uHopY,  S, t, !!e._hasUranium,     'belt', uColor);
  if (aMox)  _portFeed(aMox,  bayX,   bayY,   S, t, !!e._moxConveyorOut, 'belt', moxColor);

  // ── Internal process run (under the equipment) ──
  const feedY = millY + millH*0.55;
  _wfPipe([[puHopX, puHopY + hopH], [puHopX, feedY], [millX - millW, feedY]], S, t, active, plutColor);
  _wfPipe([[uHopX,  uHopY  + hopH], [uHopX,  feedY], [millX + millW, feedY]], S, t, active, uColor);
  const dropY = wallY - h*0.018;
  _wfPipe([[millX, millY + millH], [millX, dropY], [presX, dropY], [presX, presY - presH]], S, t, active, moxColor);
  _wfPipe([[presX + presW, presY], [gloves[0] - gloveR, gloveY]], S, t, active, moxColor);
  for (let i = 0; i < gloves.length - 1; i++) {
    _wfPipe([[gloves[i] + gloveR, gloveY], [gloves[i + 1] - gloveR, gloveY]], S, t, active, moxColor);
  }
  // Kiln discharge down and across to the rod bay.
  const disX = kilnX + kilnW*0.965;
  _wfPipe([[kilnX + kilnW, kilnY + kilnH*0.5], [px + w*0.952, kilnY + kilnH*0.5], [px + w*0.952, py + h*0.808], [bayX + bayW*0.4, py + h*0.808], [bayX + bayW*0.4, bayY - bayH]], S, t, active, hotColor);
  // Off-gas: every sealed cell is vented up to a header that runs along the
  // hall side of the wall and down the west side to the filter bank — what
  // keeps the leak direction inward.
  const ventY = wallY + h*0.020, ventX = px + w*0.024;
  gloves.forEach(gx => _wfPipe([[gx, gloveY - gloveH*0.6], [gx, ventY]], S, t, on, gasColor));
  _wfPipe([[gloves[3], ventY], [ventX, ventY], [ventX, ogY + ogH*0.2], [ogX, ogY + ogH*0.2]], S, t, on, gasColor);
  // Gas: N₂ into the last cell, Ar/H₂ down to the kiln's discharge end
  // (sintering gas runs counter to the boats).
  _wfPipe([[gasX, gloveY - gloveH*0.3], [gloves[3] + gloveR, gloveY - gloveH*0.3]], S, t, on, 'rgba(140,170,220,0.8)');
  _wfPipe([[gasX + gasW*0.75, gasY + gasH], [gasX + gasW*0.75, kilnY]], S, t, active, 'rgba(230,120,110,0.8)');

  // Plinths under each hall unit.
  plinth(hpuX, hpuY, hpuW, hpuH);
  plinth(presX - presW, presY - presH, presW*2, presH*2);
  plinth(gloves[0] - gloveR, gloveY - gloveH, (gloves[3] + gloveR) - (gloves[0] - gloveR), gloveH*2);
  plinth(gasX, gasY, gasW, gasH);
  plinth(kilnX, kilnY, kilnW, kilnH);
  plinth(bayX - bayW, bayY - bayH, bayW*2, bayH*2);
  plinth(ogX, ogY, ogW, ogH);
  plinth(panX, panY, panW, panH);

  // ── Staged transport cans ──
  // Sealed PuO₂ cans and UO₂ drums parked on the deck by each hopper, ready
  // to be tipped. A fed line keeps its pallet stocked.
  [[px + w*0.300, py + h*0.115, plutColor, !!e._hasPlutonium, 0.85],
   [px + w*0.700, py + h*0.115, uColor,    !!e._hasUranium,   1.10]].forEach(([cx, cy, col, fed, sz]) => {
    const pw2 = w*0.062, ph2 = h*0.072;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(cx - pw2/2 + 2*S, cy - ph2/2 + 2.5*S, pw2, ph2);
    ctx.fillStyle = on ? '#7a6248' : '#4a3e30'; ctx.fillRect(cx - pw2/2, cy - ph2/2, pw2, ph2);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.6*S;
    ctx.beginPath();
    for (let q = 1; q < 4; q++) { const ly = cy - ph2/2 + ph2*q/4; ctx.moveTo(cx - pw2/2, ly); ctx.lineTo(cx + pw2/2, ly); }
    ctx.stroke();
    const n = fed ? 4 : 1, r = Math.min(pw2, ph2) * 0.2 * sz;
    for (let q = 0; q < n; q++) {
      const ox = cx + (q % 2 ? 1 : -1) * pw2*0.24, oy = cy + (q < 2 ? -1 : 1) * ph2*0.24;
      const cg = ctx.createRadialGradient(ox - r*0.35, oy - r*0.35, r*0.1, ox, oy, r);
      cg.addColorStop(0, on ? '#eef0f2' : '#6a6c70'); cg.addColorStop(1, on ? '#7a7e86' : '#34363a');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(ox, oy, r, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = on ? col : '#4a4452'; ctx.lineWidth = 1.1*S;
      ctx.beginPath(); ctx.arc(ox, oy, r*0.62, 0, Math.PI*2); ctx.stroke();
      ctx.fillStyle = '#1a1a1e'; ctx.beginPath(); ctx.arc(ox, oy, r*0.18, 0, Math.PI*2); ctx.fill();
    }
  });

  // ── Feed hoppers ──
  // Two riveted funnel silos, told apart only by what is running through
  // them — a collared silo mouth up top, corrugated sheet-metal ribs down
  // the taper, support legs holding it off the floor, and a hazard-striped
  // collar where the material actually says what it is.
  [[puHopX, puHopY, plutColor, 'PuO₂', !!e._hasPlutonium],
   [uHopX,  uHopY,  uColor,    'UO₂',  !!e._hasUranium]].forEach(([hx, hy, col, tag, fed]) => {
    const hw = hopW, hh = hopH;
    const topY = hy - hh, botY = hy + hh, collarH = hh * 0.30;

    // Ground shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.moveTo(hx - hw + 3*S, topY + 3*S); ctx.lineTo(hx + hw + 3*S, topY + 3*S);
    ctx.lineTo(hx + 3*S, botY + 3*S); ctx.closePath(); ctx.fill();

    // Support legs on base plates — the hopper stands on the deck.
    ctx.strokeStyle = on ? '#3a3440' : '#241f2a'; ctx.lineWidth = 2*S;
    [-1, 1].forEach(side => {
      const fx = hx + side*hw*0.95, fy = botY + hh*0.15;
      ctx.beginPath(); ctx.moveTo(hx + side*hw*0.6, botY - hh*0.35); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.fillStyle = on ? '#6a6470' : '#3a3540';
      ctx.fillRect(fx - 2.5*S, fy - 2*S, 5*S, 4*S);
    });

    // Funnel body — a metallic gradient across the cone instead of a flat
    // fill, so it reads as sheet metal catching light, not a paper wedge.
    const fg = ctx.createLinearGradient(hx - hw, topY, hx + hw, topY);
    if (on) { fg.addColorStop(0, '#4a4452'); fg.addColorStop(0.45, '#3a3440'); fg.addColorStop(0.55, '#2c2732'); fg.addColorStop(1, '#1e1a24'); }
    else    { fg.addColorStop(0, '#2c2732'); fg.addColorStop(1, '#1a1620'); }
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.moveTo(hx - hw, topY); ctx.lineTo(hx + hw, topY);
    ctx.lineTo(hx, botY); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = on ? col : '#3a3040'; ctx.lineWidth = 1.4 * S; ctx.stroke();

    // Corrugated ribs following the taper.
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8*S;
    ctx.beginPath();
    for (let q = 1; q < 6; q++) {
      const fr = q / 6, ry = topY + (botY - topY) * fr, rw = hw * (1 - fr);
      ctx.moveTo(hx - rw, ry); ctx.lineTo(hx + rw, ry);
    }
    ctx.stroke();
    // A highlight edge down the left face for roundness.
    ctx.strokeStyle = on ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.moveTo(hx - hw*0.55, topY + (botY-topY)*0.08); ctx.lineTo(hx - hw*0.06, botY - (botY-topY)*0.05); ctx.stroke();

    // Steady level: the plant holds no feed stock of its own (it draws off
    // the belt as it runs), so the hopper reads as a held charge — a little
    // lower while the line is drawing it down.
    const level = active ? 0.55 : 0.7;

    // Powder heap in the cone. A triangle from the outlet up to fraction lv
    // of the cone's height is exactly lv of its width there.
    if (fed) {
      const lv = level;
      const lvY = botY - (botY - topY) * lv;
      ctx.globalAlpha = 0.8; ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(hx - hw * lv, lvY);
      ctx.lineTo(hx + hw * lv, lvY); ctx.lineTo(hx, botY); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(hx - hw*lv*0.3, lvY + 1.2*S, hw*lv*0.35, 1.2*S, 0, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Sight glass on the cone, so the oxide level is a window and not just a fill.
    const sgX = hx - hw*0.14, sgY = topY + (botY - topY)*0.28, sgW = hw*0.28, sgH = (botY - topY)*0.42;
    ctx.save();
    ctx.beginPath(); ctx.rect(sgX, sgY, sgW, sgH); ctx.clip();
    ctx.fillStyle = 'rgba(6,8,12,0.82)';
    ctx.fillRect(sgX, sgY, sgW, sgH);
    if (fed) {
      ctx.fillStyle = col; ctx.globalAlpha = 0.9;
      ctx.fillRect(sgX, sgY + sgH*(1 - level), sgW, sgH*level + 2*S);
      ctx.globalAlpha = 0.45; ctx.fillStyle = '#fff';
      ctx.fillRect(sgX, sgY + sgH*(1 - level), sgW, 1.1*S);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.strokeStyle = on ? 'rgba(230,232,238,0.55)' : '#3a3440'; ctx.lineWidth = 0.8*S;
    ctx.strokeRect(sgX, sgY, sgW, sgH);
    // Level probes either side of the glass.
    [-1, 1].forEach(side => {
      ctx.fillStyle = on ? (fed ? '#40ff90' : '#ff5030') : '#3a2828';
      ctx.beginPath(); ctx.arc(hx + side*hw*0.32, sgY + sgH*0.3, 1.1*S, 0, Math.PI*2); ctx.fill();
    });

    // Top collar — a short cylindrical rim so the intake reads as a silo
    // mouth, not a bare triangle tip. Riveted lid with a dark bore inside.
    ctx.fillStyle = on ? '#524c5c' : '#332e3a';
    ctx.beginPath(); ctx.roundRect(hx - hw*1.02, topY - collarH, hw*2.04, collarH, [2*S,2*S,0,0]); ctx.fill();
    ctx.strokeStyle = on ? col : '#3a3040'; ctx.lineWidth = 1.1*S; ctx.stroke();
    ctx.fillStyle = on ? 'rgba(20,18,26,0.9)' : 'rgba(10,9,13,0.9)';
    ctx.beginPath(); ctx.ellipse(hx, topY - collarH*0.15, hw*0.92, collarH*0.42, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = on ? col : '#3a3040'; ctx.lineWidth = 0.9*S; ctx.stroke();
    ctx.fillStyle = on ? '#8a7e94' : '#4a4252';
    [-1, -0.5, 0, 0.5, 1].forEach(rv => { ctx.beginPath(); ctx.arc(hx + rv*hw*0.8, topY - collarH*0.85, 1*S, 0, Math.PI*2); ctx.fill(); });

    // Hazard collar — a thin chevron-striped band just under the rim, the
    // one place the hopper actually says out loud what's inside it.
    ctx.save();
    ctx.beginPath(); ctx.rect(hx - hw*0.98, topY + (botY-topY)*0.02, hw*1.96, (botY-topY)*0.10); ctx.clip();
    ctx.fillStyle = '#141018'; ctx.fillRect(hx - hw, topY, hw*2, (botY-topY)*0.12);
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = -1; i < (hw*2) / (5*S) + 1; i += 2) {
      ctx.moveTo(hx - hw + i*5*S,          topY + (botY-topY)*0.12);
      ctx.lineTo(hx - hw + i*5*S + 2.5*S,  topY + (botY-topY)*0.02);
      ctx.lineTo(hx - hw + i*5*S + 5*S,    topY + (botY-topY)*0.02);
      ctx.lineTo(hx - hw + i*5*S + 2.5*S,  topY + (botY-topY)*0.12);
      ctx.closePath();
    }
    ctx.fill();
    ctx.restore();

    // Dosing screw under the cone: the thing that actually sets the 90/10.
    const sw = hw * 0.55, sy = botY + 2.2*S, sh = 7*S;
    ctx.fillStyle = on ? '#1a1620' : '#120f16';
    ctx.beginPath(); ctx.roundRect(hx - sw, sy, sw*2, sh, sh*0.45); ctx.fill();
    ctx.strokeStyle = active ? col : '#3a3040'; ctx.lineWidth = 0.9*S; ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.rect(hx - sw + 1.5*S, sy + 0.6*S, sw*2 - 3*S, sh - 1.2*S); ctx.clip();
    ctx.strokeStyle = active ? col : '#4a4454'; ctx.lineWidth = 1.2*S;
    const screwOff = active ? (t * 16*S) % (5*S) : 0;
    ctx.beginPath();
    for (let q = -1; q < sw*2/(5*S) + 2; q++) {
      const fx = hx - sw + screwOff + q*5*S;
      ctx.moveTo(fx, sy + 0.8*S); ctx.lineTo(fx + 2.8*S, sy + sh - 0.8*S);
    }
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = on ? '#5a5464' : '#322c3a';
    ctx.fillRect(hx - sw - 1.6*S, sy - 1*S, 2.8*S, sh + 2*S);
    ctx.fillRect(hx + sw - 1.2*S, sy - 1*S, 2.8*S, sh + 2*S);
    // Stencilled contents on the cone, between the hazard collar and the glass.
    ctx.fillStyle = on ? col : '#4a4055';
    ctx.font = font(6.5); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tag, hx, topY + (botY - topY)*0.20); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  });

  // ── Ball mill / blender ──
  // The 90 % uranium / 10 % plutonium blend is milled together dry. The
  // drum is the heavy piece on the line: a girth gear driven by a pinion off
  // its own motor and gearbox, a bolted shell, and a charge that actually
  // tumbles — nine oxide balls to one plutonium ball.
  {
    const mw = millW, mh = millH;
    const drR = Math.min(mw, mh) * 0.72;
    const a0 = active ? t * 2.2 : 0.7;
    const bore = drR * 0.76;

    // Drive train on the east side: motor (fan cowl), gearbox, coupling and
    // the pinion meshing with the girth gear through a slot in the housing.
    {
      const gbX = millX + mw + 4*S, gbY = millY - mh*0.78, gbW = w*0.050, gbH = mh*0.62;
      _wfShadow(gbX, gbY, gbW, gbH + h*0.075, S, 2*S);
      const gg = ctx.createLinearGradient(gbX, 0, gbX + gbW, 0);
      gg.addColorStop(0, on ? '#5a6a52' : '#2e3630'); gg.addColorStop(1, on ? '#2c3628' : '#1a201a');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.roundRect(gbX, gbY, gbW, gbH, 2*S); ctx.fill();
      ctx.strokeStyle = on ? '#9ab08a' : '#3a4438'; ctx.lineWidth = 0.9*S; ctx.stroke();
      ctx.fillStyle = on ? '#c4c8b8' : '#4a4e48';
      [[0.2, 0.15], [0.8, 0.15], [0.2, 0.85], [0.8, 0.85]].forEach(([u, v]) => { ctx.beginPath(); ctx.arc(gbX + gbW*u, gbY + gbH*v, 1*S, 0, Math.PI*2); ctx.fill(); });
      // Motor below the gearbox, its fan end facing the deck.
      const moY = gbY + gbH + 2*S, moH = h*0.070;
      const mg = ctx.createLinearGradient(gbX, 0, gbX + gbW, 0);
      mg.addColorStop(0, on ? '#4a6a8a' : '#262e38'); mg.addColorStop(0.45, on ? '#6a8aaa' : '#303a46'); mg.addColorStop(1, on ? '#2a3a4a' : '#181e26');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.roundRect(gbX + gbW*0.08, moY, gbW*0.84, moH, 2*S); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.7*S;
      ctx.beginPath();
      for (let q = 1; q < 6; q++) { const fy = moY + moH*q/6; ctx.moveTo(gbX + gbW*0.12, fy); ctx.lineTo(gbX + gbW*0.88, fy); }
      ctx.stroke();
      _fcFan(gbX + gbW*0.5, moY + moH + 1*S, gbW*0.28, S, t, active, 10);
      // Pinion where the gearbox meets the girth gear.
      const pnX = millX + drR*0.88, pnY = millY - drR*0.52;
      ctx.save(); ctx.translate(pnX, pnY); ctx.rotate(active ? -t*6 : 0);
      ctx.fillStyle = on ? '#8e86a0' : '#3e3a48';
      for (let q = 0; q < 8; q++) { ctx.rotate(Math.PI/4); ctx.fillRect(-1*Z, -4.6*Z, 2*Z, 2.4*Z); }
      ctx.beginPath(); ctx.arc(0, 0, 3*Z, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#1a1620'; ctx.beginPath(); ctx.arc(0, 0, 1*Z, 0, Math.PI*2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = on ? '#3a4438' : '#1e221e'; ctx.lineWidth = 3*S;
      ctx.beginPath(); ctx.moveTo(pnX + 3*Z, pnY); ctx.lineTo(gbX, pnY); ctx.stroke();
    }

    _wfShadow(millX - mw, millY - mh, mw*2, mh*2, S, 3*S);
    const plate = ctx.createLinearGradient(millX, millY - mh, millX, millY + mh);
    if (on) {
      plate.addColorStop(0, '#433c4e');
      plate.addColorStop(0.42, '#2c2834');
      plate.addColorStop(1, '#141218');
    } else {
      plate.addColorStop(0, '#26222c');
      plate.addColorStop(1, '#121016');
    }
    ctx.fillStyle = plate;
    ctx.beginPath(); ctx.roundRect(millX - mw, millY - mh, mw*2, mh*2, 3*S); ctx.fill();
    ctx.strokeStyle = on ? accent : '#3a3040'; ctx.lineWidth = 1.5 * S; ctx.stroke();
    // Machined lip inside the housing.
    ctx.strokeStyle = on ? 'rgba(255,210,180,0.28)' : 'rgba(90,80,100,0.35)';
    ctx.lineWidth = 0.8 * S;
    ctx.beginPath(); ctx.roundRect(millX - mw + 2.8*S, millY - mh + 2.8*S, mw*2 - 5.6*S, mh*2 - 5.6*S, 2*S); ctx.stroke();

    // Recessed well the drum sits in.
    ctx.fillStyle = on ? '#0e0c14' : '#0a090e';
    ctx.beginPath(); ctx.roundRect(millX - mw*0.86, millY - mh*0.84, mw*1.72, mh*1.68, 2*S); ctx.fill();

    // Corner fasteners.
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
      const bx = millX + sx * (mw - 4*S), by = millY + sy * (mh - 4*S);
      ctx.fillStyle = on ? '#c4b8a4' : '#4a4452';
      ctx.beginPath(); ctx.arc(bx, by, 1.5*S, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = on ? '#2a241c' : '#1a161c';
      ctx.beginPath(); ctx.arc(bx, by, 0.55*S, 0, Math.PI*2); ctx.fill();
    });

    // Girth gear. Teeth turn with the drum; the shell highlight stays put,
    // so the mill reads as spinning under a fixed light.
    ctx.save();
    ctx.translate(millX, millY); ctx.rotate(a0);
    const tooth = 4.2*Z;
    for (let q = 0; q < 26; q++) {
      ctx.rotate(Math.PI * 2 / 26);
      ctx.fillStyle = on ? '#6a6278' : '#322e3a';
      ctx.fillRect(-1.4*Z, -drR - tooth, 2.8*Z, tooth + 0.4*Z);
      ctx.fillStyle = on ? '#8e86a0' : '#3e3a48';
      ctx.fillRect(-1.4*Z, -drR - tooth, 0.9*Z, tooth + 0.4*Z);
    }
    ctx.restore();

    // Drum shell.
    const dg = ctx.createRadialGradient(millX - drR*0.38, millY - drR*0.38, drR*0.08, millX, millY, drR);
    dg.addColorStop(0, on ? '#7a728c' : '#3a3544');
    dg.addColorStop(0.5, on ? '#3e384c' : '#262230');
    dg.addColorStop(1, '#100e16');
    ctx.fillStyle = dg;
    ctx.beginPath(); ctx.arc(millX, millY, drR, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = on ? '#b7aec8' : '#3a3444'; ctx.lineWidth = 2*S; ctx.stroke();
    ctx.strokeStyle = '#0c0a10'; ctx.lineWidth = 1*S;
    ctx.beginPath(); ctx.arc(millX, millY, drR - 2.6*S, 0, Math.PI*2); ctx.stroke();

    // Flange bolts on the shell, turning with the gear.
    for (let q = 0; q < 16; q++) {
      const a = a0 + q * (Math.PI * 2 / 16);
      const bx = millX + Math.cos(a) * drR * 0.89;
      const by = millY + Math.sin(a) * drR * 0.89;
      ctx.fillStyle = on ? '#e4dcc8' : '#5a5464';
      ctx.beginPath(); ctx.arc(bx, by, 1.2*Z, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#1a1610';
      ctx.beginPath(); ctx.arc(bx, by, 0.4*Z, 0, Math.PI*2); ctx.fill();
    }

    const sphere = (x, y, r, hi, mid, lo) => {
      const g = ctx.createRadialGradient(x - r*0.38, y - r*0.42, r*0.05, x + r*0.15, y + r*0.2, r);
      g.addColorStop(0, hi); g.addColorStop(0.55, mid); g.addColorStop(1, lo);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.arc(x - r*0.30, y - r*0.34, Math.max(0.4*S, r*0.20), 0, Math.PI*2); ctx.fill();
    };

    // Bore: powder bed, tumbling charge, lifter cross.
    ctx.save();
    ctx.beginPath(); ctx.arc(millX, millY, bore, 0, Math.PI*2); ctx.clip();
    ctx.fillStyle = '#07060c';
    ctx.fillRect(millX - bore - 2, millY - bore - 2, bore*2 + 4, bore*2 + 4);

    if (on) {
      const bed = ctx.createRadialGradient(millX, millY + bore*0.35, bore*0.05, millX, millY + bore*0.15, bore);
      bed.addColorStop(0, active ? 'rgba(255,176,64,0.55)' : 'rgba(120,90,50,0.28)');
      bed.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = bed;
      ctx.beginPath(); ctx.ellipse(millX, millY + bore*0.28, bore*0.92, bore*0.62, 0, 0, Math.PI*2); ctx.fill();
    }

    // 9 blend balls + 1 plutonium ball on the shell, steel media inside.
    for (let q = 0; q < 10; q++) {
      const pu = q === 2;
      const wob = active ? 0.05 * Math.sin(t * 8 + q * 1.6) : 0;
      const rr = bore * (0.68 + wob);
      const a = a0 * 0.92 + q * (Math.PI * 2 / 10) + (active ? 0.04 * Math.sin(t * 5 + q) : 0);
      const rad = bore * (pu ? 0.145 : 0.112 + (q % 3) * 0.012);
      const bx = millX + Math.cos(a) * rr, by = millY + Math.sin(a) * rr;
      if (active && pu) {
        ctx.fillStyle = 'rgba(255,120,40,0.32)';
        ctx.beginPath(); ctx.arc(bx, by, rad * 1.55, 0, Math.PI*2); ctx.fill();
      }
      if (!on) sphere(bx, by, rad, '#5c5668', '#3a3444', '#1c1822');
      else if (!active) sphere(bx, by, rad, pu ? '#c48a68' : '#d8c49a', pu ? '#8a5030' : '#8a7048', '#2a2218');
      else if (pu) sphere(bx, by, rad, '#ffe2c4', plutColor, '#7a2408');
      else sphere(bx, by, rad, '#fff3c8', moxColor, '#8a4e12');
    }
    for (let q = 0; q < 4; q++) {
      const a = -a0 * 1.35 + q * (Math.PI / 2) + Math.PI / 4;
      const rr = bore * 0.30;
      const rad = bore * 0.075;
      const bx = millX + Math.cos(a) * rr, by = millY + Math.sin(a) * rr;
      if (!on) sphere(bx, by, rad, '#4a4454', '#2c2834', '#16141c');
      else sphere(bx, by, rad, '#f7f4ff', active ? '#c9c2d6' : '#8a8496', '#3a3448');
    }
    // Fines kicked up off the charge.
    if (active) {
      for (let q = 0; q < 10; q++) {
        const a = t * 3.4 + q * 0.9;
        const rr = bore * (0.25 + 0.4 * ((q * 37) % 10) / 10);
        ctx.fillStyle = q % 4 === 0 ? 'rgba(255,150,70,0.85)' : 'rgba(255,214,140,0.7)';
        ctx.fillRect(millX + Math.cos(a) * rr, millY + Math.sin(a) * rr, 1.1*S, 1.1*S);
      }
    }

    // Lifters. A ghost of the cross trails them while the mill is turning.
    const drawLifters = (alpha, ang) => {
      ctx.save();
      ctx.translate(millX, millY); ctx.rotate(ang);
      ctx.globalAlpha = alpha;
      const arm = bore * 0.50;
      const thick = Math.max(1.7*S, bore * 0.085);
      for (let i = 0; i < 2; i++) {
        ctx.save(); ctx.rotate(i * Math.PI / 2);
        const lg = ctx.createLinearGradient(0, -thick, 0, thick);
        if (active) {
          lg.addColorStop(0, '#fff0c2'); lg.addColorStop(0.45, moxColor); lg.addColorStop(1, '#8a4a10');
        } else if (on) {
          lg.addColorStop(0, '#c8b89a'); lg.addColorStop(0.5, '#6a5c48'); lg.addColorStop(1, '#2e281c');
        } else {
          lg.addColorStop(0, '#5a5464'); lg.addColorStop(1, '#2a2630');
        }
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.roundRect(-arm, -thick * 0.5, arm * 2, thick, thick * 0.45); ctx.fill();
        ctx.fillStyle = active ? '#fff6d8' : (on ? '#a89880' : '#4a4450');
        [-1, 1].forEach(side => {
          ctx.beginPath();
          ctx.roundRect(side * arm - thick * 0.85, -thick, thick * 1.7, thick * 2, 0.6*S);
          ctx.fill();
        });
        ctx.restore();
      }
      const hubR = thick * 1.25;
      sphere(0, 0, hubR,
        active ? '#fff6dc' : '#d8d0c4',
        active ? '#e0a040' : '#6a6054',
        '#2a2014');
      ctx.fillStyle = '#1a140c';
      ctx.beginPath(); ctx.arc(0, 0, hubR * 0.28, 0, Math.PI*2); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    };
    if (active) drawLifters(0.28, a0 - 0.22);
    drawLifters(1, a0);
    ctx.restore();

    // Porthole sheen, fixed in world space over the spinning charge.
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.4*S;
    ctx.beginPath(); ctx.arc(millX - bore*0.08, millY - bore*0.06, bore * 0.78, -2.55, -1.05); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 3*S;
    ctx.beginPath(); ctx.arc(millX, millY, drR * 0.55, -2.2, -1.35); ctx.stroke();

    // Name plate on the housing's top rail.
    ctx.font = font(5.5);
    const lbl = 'BLEND 90/10', lw = ctx.measureText(lbl).width + 6*S;
    ctx.fillStyle = 'rgba(8,6,10,0.85)';
    ctx.beginPath(); ctx.roundRect(millX - lw/2, millY - mh - 4*S, lw, 8*S, 1.5*S); ctx.fill();
    ctx.strokeStyle = on ? accent : '#3a3040'; ctx.lineWidth = 0.7*S; ctx.stroke();
    ctx.fillStyle = on ? accent : '#4a4055'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(lbl, millX, millY - mh); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // Sleeve where the mill discharge passes through the containment wall.
  [[presX, wallY]].forEach(([sx, sy]) => {
    ctx.fillStyle = on ? '#6a6c68' : '#3a3c38';
    ctx.fillRect(sx - 6*S, sy - 4.5*S, 12*S, 9*S);
    ctx.strokeStyle = on ? accent : '#3a3040'; ctx.lineWidth = 0.8*S;
    ctx.strokeRect(sx - 6*S, sy - 4.5*S, 12*S, 9*S);
    ctx.fillStyle = on ? '#c4c8c0' : '#4a4e48';
    [-1, 1].forEach(s => { ctx.beginPath(); ctx.arc(sx + s*4*S, sy, 0.9*S, 0, Math.PI*2); ctx.fill(); });
  });

  // ── Hydraulic power unit ──
  // Tank, motor and the two hoses that actually drive the ram.
  {
    const hx = hpuX, hy = hpuY, hw2 = hpuW, hh2 = hpuH;
    const tg = ctx.createLinearGradient(hx, 0, hx + hw2, 0);
    tg.addColorStop(0, on ? '#3a4a5a' : '#222a32'); tg.addColorStop(1, on ? '#1e2832' : '#141a20');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.roundRect(hx, hy, hw2, hh2, 1.5*S); ctx.fill();
    ctx.strokeStyle = on ? '#6a8aa8' : '#333a44'; ctx.lineWidth = 1*S; ctx.stroke();
    const mR = Math.min(hw2, hh2) * 0.26;
    _fcFan(hx + hw2*0.36, hy + hh2*0.34, mR, S, t, active, 6);
    // Filter canister and oil sight gauge.
    ctx.fillStyle = on ? '#8a9aa8' : '#3a4048';
    ctx.beginPath(); ctx.arc(hx + hw2*0.36, hy + hh2*0.78, Math.min(hw2, hh2)*0.12, 0, Math.PI*2); ctx.fill();
    const sgx = hx + hw2*0.74, sgy = hy + hh2*0.16, sgh = hh2*0.66;
    ctx.fillStyle = '#07090c'; ctx.fillRect(sgx, sgy, 3*S, sgh);
    ctx.fillStyle = on ? '#d8a030' : '#5a4420'; ctx.fillRect(sgx, sgy + sgh*0.35, 3*S, sgh*0.65);
    ctx.strokeStyle = on ? '#99aabb' : '#444455'; ctx.lineWidth = 0.5*S; ctx.strokeRect(sgx, sgy, 3*S, sgh);
    const headX = presX - presW*0.36, headY = presY - presH*0.70;
    ctx.lineCap = 'round';
    [[0, '#c02818'], [2.6*S, '#1a1a1a']].forEach(([off, colH]) => {
      ctx.strokeStyle = on ? colH : '#2a2222'; ctx.lineWidth = 1.6*S;
      ctx.beginPath();
      ctx.moveTo(hx + hw2, hy + hh2*0.3 + off);
      ctx.bezierCurveTo(hx + hw2 + 8*S, hy + hh2*0.3 + off, headX - 10*S, headY - 6*S + off, headX, headY + off);
      ctx.stroke();
    });
    ctx.lineCap = 'butt';
    ctx.fillStyle = on ? '#8ab0d0' : '#4a5058'; ctx.font = font(4.5); ctx.textAlign = 'center';
    ctx.fillText('HPU', hx + hw2*0.5, hy + hh2 + 7*S); ctx.textAlign = 'left';
  }

  // ── Pellet press ──
  // Hydraulic head, chrome piston and a punch over a die. Green pellets are
  // pressed out of the milled powder before they are ever fired, and
  // stacked on a tray beside the die.
  {
    const pw = presW, ph = presH;
    _wfShadow(presX - pw, presY - ph, pw*2, ph*2, S, 2*S);
    const body = ctx.createLinearGradient(presX - pw, 0, presX + pw, 0);
    body.addColorStop(0, on ? '#3c3648' : '#221e28');
    body.addColorStop(0.48, on ? '#2c2836' : '#1b1922');
    body.addColorStop(1, on ? '#14121a' : '#100e14');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.roundRect(presX - pw, presY - ph, pw*2, ph*2, 2*S); ctx.fill();
    ctx.strokeStyle = on ? accent : '#3a3040'; ctx.lineWidth = 1.3*S; ctx.stroke();
    ctx.strokeStyle = on ? 'rgba(255,210,180,0.22)' : 'rgba(80,70,90,0.3)'; ctx.lineWidth = 0.7*S;
    ctx.beginPath(); ctx.roundRect(presX - pw + 2.4*S, presY - ph + 2.4*S, pw*2 - 4.8*S, ph*2 - 4.8*S, 1.4*S); ctx.stroke();
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
      const bx = presX + sx*(pw - 3.6*S), by = presY + sy*(ph - 3.6*S);
      ctx.fillStyle = on ? '#d8ccb4' : '#4a4452';
      ctx.beginPath(); ctx.arc(bx, by, 1.4*S, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#1a1610';
      ctx.beginPath(); ctx.arc(bx, by, 0.5*S, 0, Math.PI*2); ctx.fill();
    });

    // Tie rods. They are the frame the cylinder actually pushes against.
    const rodW = Math.max(3*S, pw * 0.1);
    [-1, 1].forEach(side => {
      const rx = presX + side*pw*0.62 - rodW*0.5;
      const ry = presY - ph*0.68;
      const rh = ph*0.82;
      const tg = ctx.createLinearGradient(rx, 0, rx + rodW, 0);
      tg.addColorStop(0, on ? '#8a8498' : '#3a3444');
      tg.addColorStop(0.45, on ? '#e4e0ec' : '#5a5464');
      tg.addColorStop(1, on ? '#4a4458' : '#2a2630');
      ctx.fillStyle = tg;
      ctx.fillRect(rx, ry, rodW, rh);
      ctx.fillStyle = on ? '#c8b48a' : '#4a4030';
      ctx.fillRect(rx - 0.9*S, ry - 1.4*S, rodW + 1.8*S, 2.8*S);
      ctx.fillRect(rx - 0.9*S, ry + rh - 1.4*S, rodW + 1.8*S, 2.8*S);
    });

    const stroke = active ? (0.5 + 0.5*Math.sin(t*4)) : 0.15;
    const headY = presY - ph*0.78, headH = ph*0.2, headW = pw*0.72;
    const hg = ctx.createLinearGradient(0, headY, 0, headY + headH);
    hg.addColorStop(0, on ? '#6a6478' : '#3a3444');
    hg.addColorStop(0.4, on ? '#b8b2c4' : '#4a4454');
    hg.addColorStop(1, on ? '#3a3448' : '#241e2c');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.roundRect(presX - headW/2, headY, headW, headH, 1*S); ctx.fill();
    ctx.strokeStyle = on ? '#1a161c' : '#100e14'; ctx.lineWidth = 0.6*S; ctx.stroke();
    [-1, 1].forEach(side => {
      ctx.fillStyle = on ? '#ece6d8' : '#5a5464';
      ctx.beginPath(); ctx.arc(presX + side*headW*0.32, headY + headH*0.5, 1*S, 0, Math.PI*2); ctx.fill();
    });
    // Feed port on the crown — the drop from the mill lands here.
    ctx.fillStyle = active ? moxColor : (on ? '#5a5048' : '#3a3440');
    ctx.beginPath(); ctx.arc(presX, headY + 1.5*S, 1.5*S, 0, Math.PI*2); ctx.fill();

    // Chrome piston. Length grows as the ram strokes down.
    const pistTop = headY + headH - 0.5*S;
    const pistH = ph * (0.22 + 0.34*stroke);
    const pistW = pw * 0.22;
    const pg = ctx.createLinearGradient(presX - pistW/2, 0, presX + pistW/2, 0);
    pg.addColorStop(0, '#6a6878'); pg.addColorStop(0.35, '#f4f2f8'); pg.addColorStop(0.7, '#9a96a8'); pg.addColorStop(1, '#3e3c4c');
    ctx.fillStyle = on ? pg : '#403a4a';
    ctx.fillRect(presX - pistW/2, pistTop, pistW, pistH);
    const shoeY = pistTop + pistH - 0.4*S;
    const shoeW = pw * 0.58, shoeH = Math.max(3.6*S, ph*0.09);
    ctx.fillStyle = on ? '#d8d4e2' : '#5a5464';
    ctx.fillRect(presX - shoeW/2, shoeY, shoeW, shoeH);
    ctx.fillStyle = on ? '#f7f4ff' : '#6a6474';
    ctx.fillRect(presX - shoeW/2, shoeY, shoeW*0.18, shoeH);
    [-1, 1].forEach(side => {
      ctx.fillStyle = '#2a241c';
      ctx.beginPath(); ctx.arc(presX + side*shoeW*0.28, shoeY + shoeH*0.5, 0.8*S, 0, Math.PI*2); ctx.fill();
    });

    // Die: a recessed throat with a beveled mouth, and the green pellet in it.
    const dieX = presX - pw*0.7, dieY = presY + ph*0.22, dieW = pw*1.4, dieH = ph*0.5;
    ctx.fillStyle = on ? '#2a241c' : '#1a1614';
    ctx.beginPath(); ctx.roundRect(dieX, dieY, dieW, dieH, 1.3*S); ctx.fill();
    ctx.strokeStyle = on ? '#8a7050' : '#3a3440'; ctx.lineWidth = 0.9*S; ctx.stroke();
    const throatX = presX - pw*0.4, throatY = dieY + dieH*0.22, throatW = pw*0.8, throatH = dieH*0.62;
    ctx.fillStyle = '#07060a';
    ctx.beginPath(); ctx.roundRect(throatX, throatY, throatW, throatH, 1*S); ctx.fill();
    ctx.fillStyle = on ? '#5a4a38' : '#2a2622';
    ctx.fillRect(throatX, throatY, throatW, 1.4*S);
    const pr = Math.min(pw*0.22, throatH*0.42);
    const pyP = throatY + throatH*0.58;
    const squash = active ? 1 - 0.18*stroke : 1;
    const pelletG = ctx.createRadialGradient(presX - pr*0.35, pyP - pr*0.45, pr*0.1, presX, pyP, pr);
    if (active) { pelletG.addColorStop(0, '#fff6d0'); pelletG.addColorStop(0.55, moxColor); pelletG.addColorStop(1, '#a85a14'); }
    else if (on) { pelletG.addColorStop(0, '#e8d0a0'); pelletG.addColorStop(1, '#6a5030'); }
    else { pelletG.addColorStop(0, '#5a5464'); pelletG.addColorStop(1, '#2a2630'); }
    ctx.fillStyle = pelletG;
    ctx.beginPath(); ctx.ellipse(presX, pyP, pr, pr*0.72*squash, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath(); ctx.ellipse(presX - pr*0.28, pyP - pr*0.22, pr*0.22, pr*0.12, -0.4, 0, Math.PI*2); ctx.fill();
    if (active && stroke > 0.88) {
      ctx.fillStyle = 'rgba(255,220,150,0.45)';
      ctx.beginPath(); ctx.ellipse(presX, pyP, pr*1.35, pr*0.7, 0, 0, Math.PI*2); ctx.fill();
    }

    ctx.fillStyle = on ? accent : '#4a4055';
    ctx.font = font(5); ctx.textAlign = 'center';
    ctx.fillText('PRESS', presX, presY + ph + 8*S); ctx.textAlign = 'left';
  }

  // ── Glovebox train ──
  // Sealed cells with arm ports along the front: plutonium powder is never
  // in open air. The amber interior glow is the cell lighting, not the fuel.
  gloves.forEach((gx, i) => {
    const gw = gloveR, gh = gloveH;
    _wfShadow(gx - gw, gloveY - gh, gw*2, gh*2, S, 2*S);
    const shell = ctx.createLinearGradient(gx - gw, 0, gx + gw, 0);
    shell.addColorStop(0, on ? '#343a46' : '#1c2028');
    shell.addColorStop(0.5, on ? '#242832' : '#161820');
    shell.addColorStop(1, on ? '#161a22' : '#101218');
    ctx.fillStyle = shell;
    ctx.beginPath(); ctx.roundRect(gx - gw, gloveY - gh, gw*2, gh*2, 2*S); ctx.fill();

    const winX = gx - gw*0.80, winY = gloveY - gh*0.76, winW = gw*1.60, winH = gh*0.98;
    ctx.fillStyle = '#07090e';
    ctx.fillRect(winX, winY, winW, winH);
    ctx.fillStyle = active ? 'rgba(255,186,96,0.42)' : (on ? 'rgba(150,160,180,0.16)' : 'rgba(80,88,100,0.08)');
    ctx.fillRect(winX, winY, winW, winH);
    // Bench kit inside the window: a balance on the left, tongs hung right,
    // the work shelf, and a pellet boat that actually crosses the window.
    ctx.save();
    ctx.beginPath(); ctx.rect(winX, winY, winW, winH); ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(winX + 1.5*S, gloveY - gh*0.08, winW - 3*S, 1.8*S);
    ctx.fillStyle = on ? 'rgba(20,24,30,0.75)' : 'rgba(14,16,20,0.7)';
    const balX = winX + winW*0.22, balY = gloveY - gh*0.08;
    ctx.fillRect(balX - gw*0.16, balY - gh*0.10, gw*0.32, gh*0.10);
    ctx.fillRect(balX - gw*0.20, balY - gh*0.14, gw*0.40, gh*0.03);
    ctx.strokeStyle = on ? 'rgba(200,210,225,0.35)' : 'rgba(120,130,145,0.18)'; ctx.lineWidth = 0.9*S;
    const tgx = winX + winW*0.80;
    ctx.beginPath(); ctx.moveTo(tgx, winY + 2*S); ctx.lineTo(tgx - gw*0.08, winY + winH*0.55);
    ctx.moveTo(tgx, winY + 2*S); ctx.lineTo(tgx + gw*0.08, winY + winH*0.55); ctx.stroke();
    if (active) {
      const p = 0.5 + 0.5*Math.sin(t*1.7 - i*0.85);
      const br = gw*0.15;
      const bx = winX + br + 2*S + p*(winW - br*2 - 4*S);
      const by = gloveY - gh*0.30;
      ctx.fillStyle = 'rgba(40,24,16,0.85)';
      ctx.beginPath(); ctx.roundRect(bx - br*1.6, by - br*0.9, br*3.2, br*1.8, 0.8*S); ctx.fill();
      const pg = ctx.createRadialGradient(bx - br*0.3, by - br*0.3, 0.3, bx, by, br);
      pg.addColorStop(0, '#fff3c8'); pg.addColorStop(0.6, moxColor); pg.addColorStop(1, '#8a4e12');
      ctx.fillStyle = pg;
      [-0.8, 0, 0.8].forEach(o => { ctx.beginPath(); ctx.arc(bx + o*br, by, br*0.55, 0, Math.PI*2); ctx.fill(); });
    }
    ctx.fillStyle = active ? 'rgba(255,220,160,0.75)' : (on ? 'rgba(200,210,225,0.35)' : 'rgba(90,96,110,0.2)');
    ctx.fillRect(winX + 2*S, winY + 0.8*S, winW - 4*S, 1.3*S);
    ctx.restore();
    ctx.strokeStyle = 'rgba(210,220,232,0.22)'; ctx.lineWidth = 0.7*S;
    ctx.beginPath();
    for (let q = 1; q < 3; q++) { const lx = winX + winW*q/3; ctx.moveTo(lx, winY); ctx.lineTo(lx, winY + winH); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.moveTo(winX + 1.5*S, winY + 2*S); ctx.lineTo(winX + winW*0.38, winY + winH*0.55); ctx.stroke();

    ctx.strokeStyle = on ? accent : '#3a3040'; ctx.lineWidth = 1.1 * S;
    ctx.beginPath(); ctx.roundRect(gx - gw, gloveY - gh, gw*2, gh*2, 2*S); ctx.stroke();

    // Magnehelic gauge on the top rail: needle held in the depression band.
    const mgx = gx + gw*0.55, mgy = gloveY - gh*0.88, mgr = Math.min(gw*0.16, 3.6*S);
    ctx.fillStyle = '#0c1014'; ctx.beginPath(); ctx.arc(mgx, mgy, mgr, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = on ? '#c8ccd4' : '#4a4e56'; ctx.lineWidth = 0.6*S; ctx.stroke();
    ctx.strokeStyle = on ? 'rgba(64,255,144,0.7)' : 'rgba(70,80,70,0.4)'; ctx.lineWidth = 0.8*S;
    ctx.beginPath(); ctx.arc(mgx, mgy, mgr*0.7, Math.PI*1.1, Math.PI*1.5); ctx.stroke();
    const na = on ? Math.PI*(1.3 + 0.04*Math.sin(t*1.9 + i)) : Math.PI*1.9;
    ctx.strokeStyle = on ? '#ff6040' : '#5a3a30'; ctx.lineWidth = 0.7*S;
    ctx.beginPath(); ctx.moveTo(mgx, mgy); ctx.lineTo(mgx + Math.cos(na)*mgr*0.8, mgy + Math.sin(na)*mgr*0.8); ctx.stroke();
    // Status lamp at the other end of the rail.
    ctx.fillStyle = active ? '#40ff90' : on ? '#e8b020' : '#4a2020';
    ctx.beginPath(); ctx.arc(gx - gw*0.55, gloveY - gh*0.88, 1.4*S, 0, Math.PI*2); ctx.fill();

    // Two glove ports: ring, dark cuff, and a reach that twitches while the line runs.
    for (let p = 0; p < 2; p++) {
      const reach = active ? 1.6*S*Math.sin(t*2.2 + i + p) : 0;
      const ox = gx - gw*0.42 + p*gw*0.84;
      const oy = gloveY + gh*0.58 + reach*0.15;
      ctx.fillStyle = on ? '#4a4036' : '#2a2622';
      ctx.beginPath(); ctx.ellipse(ox, oy + gw*0.08, gw*0.16, gw*0.28, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = on ? '#8a7460' : '#3a3240';
      ctx.beginPath(); ctx.arc(ox, oy, gw*0.22, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = on ? '#d8c4a8' : '#4a4252'; ctx.lineWidth = 1*S; ctx.stroke();
      ctx.fillStyle = '#1a1614';
      ctx.beginPath(); ctx.arc(ox, oy, gw*0.09, 0, Math.PI*2); ctx.fill();
    }
    // Bag-out port on the outboard face of the first cell (the last one's
    // face carries the N₂ supply).
    if (i === 0) {
      const bx = gx - gw, by = gloveY + gh*0.05, br = gw*0.24;
      ctx.fillStyle = on ? '#3a3e46' : '#22252a';
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = on ? accent : '#3a3040'; ctx.lineWidth = 0.9*S; ctx.stroke();
      ctx.fillStyle = on ? '#e8e0d0' : '#4a4652';
      ctx.beginPath(); ctx.arc(bx, by, br*0.55, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = on ? '#2a2630' : '#18161c';
      ctx.beginPath(); ctx.arc(bx, by, br*0.25, 0, Math.PI*2); ctx.fill();
    }
    // N₂ atmosphere tag on the first cell, depression arrow on the rest —
    // the boxes are inert and held below room pressure — and a cell plate.
    ctx.textAlign = 'center';
    ctx.fillStyle = on ? 'rgba(160,200,230,0.85)' : '#43485a';
    ctx.font = font(4.5, false);
    ctx.fillText(i ? '↓P' : 'N₂', gx, gloveY - gh - 3.5*S);
    ctx.fillStyle = on ? 'rgba(200,190,170,0.75)' : 'rgba(90,86,80,0.5)';
    ctx.font = font(3.8);
    ctx.fillText(`GB-0${i + 1}`, gx + gw*0.55, gloveY + gh + 5*S);
    ctx.textAlign = 'left';
  });

  // ── Gas rack ──
  // Bottled N₂ for the cells (grey shoulders) and the Ar/H₂ sintering mix
  // (red shoulders: the hydrogen burns), chained in a cage on a manifold.
  {
    const cols = 3, rows = 2;
    const cr = Math.min(gasW / (cols*2.6), gasH / (rows*3.1));
    ctx.fillStyle = on ? '#2e3236' : '#1c1e20';
    ctx.beginPath(); ctx.roundRect(gasX, gasY, gasW, gasH, 1.5*S); ctx.fill();
    ctx.strokeStyle = on ? '#7a8a96' : '#33383e'; ctx.lineWidth = 1*S; ctx.stroke();
    // Cage mesh.
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.6*S;
    ctx.beginPath();
    for (let x = gasX + 4*S; x < gasX + gasW; x += 4*S) { ctx.moveTo(x, gasY); ctx.lineTo(x, gasY + gasH); }
    ctx.stroke();
    for (let r = 0; r < rows; r++) {
      const ry = gasY + gasH*(r + 0.5)/rows - gasH*0.06;
      const shoulder = r ? '#c83a2a' : '#8a9098';
      // Manifold across the row.
      ctx.strokeStyle = on ? '#b8bcc0' : '#4a4e52'; ctx.lineWidth = 1.2*S;
      ctx.beginPath(); ctx.moveTo(gasX + gasW*0.12, ry + cr*1.45); ctx.lineTo(gasX + gasW*0.9, ry + cr*1.45); ctx.stroke();
      for (let c = 0; c < cols; c++) {
        const cx = gasX + gasW*(c + 0.5)/cols;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(cx + 1.2*S, ry + 1.6*S, cr, 0, Math.PI*2); ctx.fill();
        const cg = ctx.createRadialGradient(cx - cr*0.35, ry - cr*0.35, cr*0.1, cx, ry, cr);
        cg.addColorStop(0, on ? '#5a5e64' : '#34363a'); cg.addColorStop(1, on ? '#1e2024' : '#141518');
        ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, ry, cr, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = on ? shoulder : '#3a3a3a'; ctx.lineWidth = cr*0.35;
        ctx.beginPath(); ctx.arc(cx, ry, cr*0.72, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = on ? '#d8c890' : '#4a4638';
        ctx.beginPath(); ctx.arc(cx, ry, cr*0.3, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = on ? '#b8bcc0' : '#4a4e52'; ctx.lineWidth = 0.8*S;
        ctx.beginPath(); ctx.moveTo(cx, ry + cr*0.3); ctx.lineTo(cx, ry + cr*1.45); ctx.stroke();
      }
    }
    // Regulator gauges at the outlet end.
    [[gasY + gasH*0.25, 'rgba(140,170,220,1)'], [gasY + gasH*0.75, '#e86a5a']].forEach(([gy, col], r) => {
      const gx = gasX + gasW - 3.5*S;
      ctx.fillStyle = '#0c1014'; ctx.beginPath(); ctx.arc(gx, gy - gasH*0.06, 2.6*S, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = on ? col : '#3a3a3a'; ctx.lineWidth = 0.7*S; ctx.stroke();
      const na = -Math.PI*0.5 + (on ? (r ? (active ? 0.8 : 0.2) : 0.6) : -0.9);
      ctx.beginPath(); ctx.moveTo(gx, gy - gasH*0.06); ctx.lineTo(gx + Math.cos(na)*2*S, gy - gasH*0.06 + Math.sin(na)*2*S); ctx.stroke();
    });
    ctx.fillStyle = on ? 'rgba(200,215,230,0.8)' : 'rgba(90,100,110,0.5)';
    ctx.font = font(3.8); ctx.textAlign = 'center';
    ctx.fillText('N₂ · Ar/H₂', gasX + gasW*0.5, gasY - 2.5*S); ctx.textAlign = 'left';
  }

  // ── Transfer tunnel ──
  // A sealed square tube from the last cell back along the train to the
  // kiln's charge end: boats move between enclosures without ever seeing
  // the room. Viewing ports show them riding it.
  {
    const tx0 = kilnX + 8*S, tx1 = gloves[3] + gloveR*0.55, th = 9*S;
    const t3y = gloveY + gloveH;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(tx1, t3y); ctx.lineTo(tx1, tunY); ctx.lineTo(tx0, tunY); ctx.lineTo(tx0, kilnY + 2*S);
    };
    ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    ctx.save(); ctx.translate(2*S, 2.5*S);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = th; path(); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = on ? accent : '#3a3040'; ctx.lineWidth = th + 1.6*S; path(); ctx.stroke();
    ctx.strokeStyle = on ? '#3a3e48' : '#22252c'; ctx.lineWidth = th; path(); ctx.stroke();
    ctx.strokeStyle = on ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.moveTo(tx1 - th*0.3, tunY - th*0.3); ctx.lineTo(tx0 + th*0.3, tunY - th*0.3); ctx.stroke();
    // Viewing ports, with a boat sliding through when the line runs.
    const ports = 5;
    for (let q = 0; q < ports; q++) {
      const vx = tx1 - (tx1 - tx0)*(q + 0.5)/ports;
      ctx.fillStyle = '#07090e'; ctx.fillRect(vx - 6*S, tunY - 2.6*S, 12*S, 5.2*S);
      ctx.fillStyle = active ? 'rgba(255,186,96,0.35)' : (on ? 'rgba(150,160,180,0.14)' : 'rgba(80,88,100,0.06)');
      ctx.fillRect(vx - 6*S, tunY - 2.6*S, 12*S, 5.2*S);
    }
    if (active) {
      ctx.save();
      ctx.beginPath();
      for (let q = 0; q < ports; q++) { const vx = tx1 - (tx1 - tx0)*(q + 0.5)/ports; ctx.rect(vx - 6*S, tunY - 2.6*S, 12*S, 5.2*S); }
      ctx.clip();
      for (let q = 0; q < 3; q++) {
        const p = ((t * 0.12) + q/3) % 1;
        const bx = tx1 - (tx1 - tx0)*p;
        ctx.fillStyle = 'rgba(40,24,16,0.9)'; ctx.fillRect(bx - 4*S, tunY - 2*S, 8*S, 4*S);
        ctx.fillStyle = moxColor;
        [-2, 0, 2].forEach(o => { ctx.beginPath(); ctx.arc(bx + o*S, tunY, 0.9*S, 0, Math.PI*2); ctx.fill(); });
      }
      ctx.restore();
    }
    ctx.lineJoin = 'round';
  }

  // ── Tunnel kiln (sintering) ──
  // Continuous, not a box: pellets ride through a temperature gradient and
  // come out of the soak zone white. ~1700 °C in argon/hydrogen. Three zones
  // split by bolted flanges, thermocouples on the crown, the Ar/H₂ feed
  // along the base, and parked boats when it's cold.
  {
    const bell = 14*S;
    _wfShadow(kilnX, kilnY, kilnW, kilnH, S, 3*S);
    const shell = ctx.createLinearGradient(0, kilnY, 0, kilnY + kilnH);
    shell.addColorStop(0, on ? '#4a3c30' : '#241e18');
    shell.addColorStop(0.45, on ? '#2b231c' : '#1b1714');
    shell.addColorStop(1, on ? '#16120e' : '#100e0c');
    ctx.fillStyle = shell;
    ctx.beginPath(); ctx.roundRect(kilnX, kilnY, kilnW, kilnH, 3*S); ctx.fill();
    // Charge and discharge bells.
    ctx.fillStyle = on ? '#1a1612' : '#100e0c';
    ctx.fillRect(kilnX, kilnY + 2*S, bell, kilnH - 4*S);
    ctx.fillRect(kilnX + kilnW - bell, kilnY + 2*S, bell, kilnH - 4*S);
    ctx.fillStyle = active ? '#ffb060' : (on ? '#3a3028' : '#241c16');
    ctx.fillRect(kilnX + bell*0.32, kilnY + kilnH*0.32, bell*0.3, kilnH*0.36);
    ctx.fillStyle = active ? '#fff0c8' : (on ? '#3a3028' : '#241c16');
    ctx.fillRect(kilnX + kilnW - bell*0.62, kilnY + kilnH*0.32, bell*0.3, kilnH*0.36);

    // Muffle bore with the heat gradient along it.
    const bx = kilnX + bell + 3*S, by = kilnY + kilnH*0.26, bw = kilnW - bell*2 - 6*S, bh = kilnH*0.48;
    const gg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    if (active) {
      gg.addColorStop(0,    '#2a1a10');
      gg.addColorStop(0.22, '#8a3a10');
      gg.addColorStop(0.5,  '#ff9a30');
      gg.addColorStop(0.74, '#fff4cc');
      gg.addColorStop(1,    '#ffc070');
    } else {
      gg.addColorStop(0, '#221a16'); gg.addColorStop(1, '#2c221c');
    }
    ctx.fillStyle = gg; ctx.fillRect(bx, by, bw, bh);
    // Boat rails along the bore floor.
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8*S;
    ctx.beginPath(); ctx.moveTo(bx, by + bh*0.18); ctx.lineTo(bx + bw, by + bh*0.18); ctx.moveTo(bx, by + bh*0.82); ctx.lineTo(bx + bw, by + bh*0.82); ctx.stroke();
    // Refractory stitches along the crown.
    ctx.strokeStyle = on ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.8*S;
    ctx.beginPath();
    for (let q = 0; q < 24; q++) {
      const ex = bx + bw*q/24;
      ctx.moveTo(ex, kilnY + 2.5*S); ctx.lineTo(ex + 3*S, kilnY + kilnH*0.22);
    }
    ctx.stroke();
    // Pellet boats crossing the bore, heating as they go.
    const boatW = 9*Z, boatH = bh*0.62;
    const boat = (cxp, col, rr) => {
      ctx.fillStyle = 'rgba(40,24,16,0.88)';
      ctx.beginPath(); ctx.roundRect(cxp - boatW/2, by + bh*0.19, boatW, boatH, 0.8*S); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      [-1, 0, 1].forEach(o => { ctx.moveTo(cxp + o*boatW*0.3 + rr, by + bh*0.5); ctx.arc(cxp + o*boatW*0.3, by + bh*0.5, rr, 0, Math.PI*2); });
      ctx.fill();
    };
    if (active) {
      for (let q = 0; q < 8; q++) {
        const p = ((t * 0.16) + q / 8) % 1;
        const glow = Math.min(1, Math.max(0, (p - 0.15) / 0.6));
        boat(bx + boatW/2 + p * (bw - boatW), `rgba(255,${Math.round(140 + 110*glow)},${Math.round(50 + 180*glow)},0.95)`, 1.3*Z);
      }
      const sz = bx + bw*0.72;
      const hgd = ctx.createRadialGradient(sz, by + bh/2, 1, sz, by + bh/2, kilnH*1.5);
      hgd.addColorStop(0, `rgba(255,210,130,${(0.34 + 0.12*Math.sin(t*2.6)).toFixed(3)})`);
      hgd.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = hgd; ctx.beginPath(); ctx.arc(sz, by + bh/2, kilnH*1.5, 0, Math.PI*2); ctx.fill();
    } else {
      for (let q = 0; q < 3; q++) boat(bx + boatW*0.7 + q*boatW*1.25, on ? '#8a6a40' : '#4a3a28', 1.2*Z);
    }
    // Heating elements, hotter toward the soak zone.
    for (let q = 1; q < 20; q++) {
      const hot = q / 20;
      ctx.strokeStyle = active ? `rgba(255,${Math.round(120 + 90*hot)},70,${(0.18 + 0.4*hot).toFixed(3)})` : 'rgba(90,80,70,0.35)';
      ctx.lineWidth = 1*S;
      const ex = bx + bw*q/20;
      ctx.beginPath(); ctx.moveTo(ex, kilnY + 2*S); ctx.lineTo(ex, by); ctx.moveTo(ex, by + bh); ctx.lineTo(ex, kilnY + kilnH - 2*S); ctx.stroke();
    }
    ctx.strokeStyle = on ? accent : '#3a3040'; ctx.lineWidth = 1.4*S;
    ctx.beginPath(); ctx.roundRect(kilnX, kilnY, kilnW, kilnH, 3*S); ctx.stroke();

    // Zone flanges and zone names.
    const zones = [['PREHEAT', 0, 1/3], ['SINTER', 1/3, 2/3], ['COOL', 2/3, 1]];
    [1/3, 2/3].forEach(f => {
      const fx = bx + bw*f;
      ctx.fillStyle = on ? '#5a4a3a' : '#2e2620';
      ctx.fillRect(fx - 2.4*S, kilnY - 1*S, 4.8*S, kilnH + 2*S);
      ctx.strokeStyle = '#140f0b'; ctx.lineWidth = 0.6*S; ctx.strokeRect(fx - 2.4*S, kilnY - 1*S, 4.8*S, kilnH + 2*S);
      ctx.fillStyle = on ? '#b8a890' : '#4a4238';
      [0.12, 0.5, 0.88].forEach(v => { ctx.beginPath(); ctx.arc(fx, kilnY + kilnH*v, 0.8*S, 0, Math.PI*2); ctx.fill(); });
    });
    ctx.font = font(4); ctx.textAlign = 'center';
    zones.forEach(([name, a, b], zi) => {
      ctx.fillStyle = active ? (zi === 1 ? hotColor : 'rgba(255,200,150,0.75)') : (on ? 'rgba(200,180,160,0.6)' : 'rgba(90,80,70,0.5)');
      ctx.fillText(name, bx + bw*(a + b)/2, kilnY + kilnH - 2.4*S);
    });
    // Thermocouple heads on the crown.
    for (let q = 0; q < 8; q++) {
      const tx = bx + bw*(q + 0.5)/8;
      ctx.fillStyle = on ? '#d8d0c4' : '#4a4640';
      ctx.fillRect(tx - 1.6*S, kilnY + 0.4*S, 3.2*S, 2.4*S);
      ctx.fillStyle = active ? '#ffb060' : (on ? '#6a5040' : '#2a221c');
      ctx.beginPath(); ctx.arc(tx, kilnY + 1.6*S, 0.7*S, 0, Math.PI*2); ctx.fill();
    }
    // Title on the crown, over the soak zone.
    ctx.font = font(5);
    const title = active ? 'SINTER 1700°C · Ar/H₂' : 'SINTER · COLD';
    const tw = ctx.measureText(title).width + 6*S;
    const tcx = bx + bw*0.5;
    ctx.fillStyle = 'rgba(10,6,4,0.85)';
    ctx.beginPath(); ctx.roundRect(tcx - tw/2, kilnY - 4*S, tw, 8*S, 1.5*S); ctx.fill();
    ctx.strokeStyle = on ? accent : '#3a3040'; ctx.lineWidth = 0.7*S; ctx.stroke();
    ctx.fillStyle = active ? hotColor : (on ? accent : '#4a4055');
    ctx.textBaseline = 'middle'; ctx.fillText(title, tcx, kilnY + 0.2*S); ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    // Ar/H₂ feed along the base with two valves, fed from the discharge end.
    const gy = kilnY + kilnH + 2*S;
    ctx.strokeStyle = on ? '#8a9aa8' : '#3a4048'; ctx.lineWidth = 1.4*S;
    ctx.beginPath(); ctx.moveTo(bx + bw*0.08, gy); ctx.lineTo(kilnX + kilnW - 4*S, gy); ctx.stroke();
    [0.3, 0.7].forEach(f => {
      const vx = bx + bw*f;
      ctx.fillStyle = on ? '#c83a2a' : '#402420';
      ctx.beginPath(); ctx.moveTo(vx - 2.2*S, gy - 1.8*S); ctx.lineTo(vx + 2.2*S, gy + 1.8*S); ctx.lineTo(vx + 2.2*S, gy - 1.8*S); ctx.lineTo(vx - 2.2*S, gy + 1.8*S); ctx.closePath(); ctx.fill();
    });
  }

  // ── Off-gas / HEPA filter bank ──
  // Four stages with extract fans and a depression gauge. While the plant
  // has power the boxes are held below room pressure — the needle sitting
  // in the green is the containment working.
  {
    _wfShadow(ogX, ogY, ogW, ogH, S, 2*S);
    const bank = ctx.createLinearGradient(ogX, 0, ogX + ogW, 0);
    bank.addColorStop(0, on ? '#3a4450' : '#222830');
    bank.addColorStop(0.5, on ? '#2a3038' : '#1a1e24');
    bank.addColorStop(1, on ? '#1a2028' : '#12161c');
    ctx.fillStyle = bank;
    ctx.beginPath(); ctx.roundRect(ogX, ogY, ogW, ogH, 2*S); ctx.fill();
    ctx.strokeStyle = on ? '#8aa0b4' : '#333a44'; ctx.lineWidth = 1.3*S; ctx.stroke();
    ctx.font = font(3.8);
    for (let q = 0; q < 4; q++) {
      const cyF = ogY + ogH*(q + 0.5)/4;
      const cartH = ogH*0.18;
      ctx.fillStyle = on ? '#141a20' : '#101418';
      ctx.beginPath(); ctx.roundRect(ogX + 3*S, cyF - cartH*0.62, ogW - 6*S, cartH*1.24, 1.2*S); ctx.fill();
      ctx.fillStyle = on ? '#4a5664' : '#2a3038';
      ctx.fillRect(ogX + 6*S, cyF - cartH*0.4, ogW*0.50, cartH*0.8);
      ctx.strokeStyle = on ? 'rgba(220,230,240,0.4)' : 'rgba(120,130,145,0.2)'; ctx.lineWidth = 0.7*S;
      ctx.beginPath();
      for (let p = 0; p < 7; p++) {
        const fx = ogX + 7*S + (ogW*0.46)*p/7;
        ctx.moveTo(fx, cyF - cartH*0.32); ctx.lineTo(fx + ogW*0.04, cyF + cartH*0.32);
      }
      ctx.stroke();
      _fcFan(ogX + ogW - 9*S, cyF, Math.min(ogW*0.13, cartH*0.55), S, t + q*0.5, on, 8);
      // Stage number and its status LED.
      ctx.fillStyle = on ? 'rgba(200,215,230,0.7)' : 'rgba(90,100,110,0.5)';
      ctx.fillText(`${q + 1}`, ogX + 1.4*S, cyF - ogH*0.085);
      ctx.fillStyle = on ? (q < 3 ? '#40ff90' : '#e8b020') : '#3a2020';
      ctx.beginPath(); ctx.arc(ogX + ogW - 2.2*S, cyF - ogH*0.085, 1*S, 0, Math.PI*2); ctx.fill();
    }
    // Depression gauge: green arc is "below room pressure."
    const gx2 = ogX + ogW*0.5, gy2 = ogY + ogH + 10*S, gr = Math.min(8*S, ogW*0.32);
    ctx.fillStyle = '#0c1218'; ctx.beginPath(); ctx.arc(gx2, gy2, gr, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = on ? '#8aa0b4' : '#333a44'; ctx.lineWidth = S; ctx.stroke();
    ctx.strokeStyle = on ? 'rgba(64,255,144,0.85)' : 'rgba(80,90,80,0.5)'; ctx.lineWidth = 1.6*S;
    ctx.beginPath(); ctx.arc(gx2, gy2, gr*0.72, Math.PI*0.15, Math.PI*0.85); ctx.stroke();
    ctx.strokeStyle = '#8aa0b4'; ctx.lineWidth = 0.6*S;
    ctx.beginPath();
    for (let q = 0; q < 5; q++) {
      const a = Math.PI*0.15 + q*(Math.PI*0.7)/4;
      ctx.moveTo(gx2 + Math.cos(a)*gr*0.78, gy2 + Math.sin(a)*gr*0.78);
      ctx.lineTo(gx2 + Math.cos(a)*gr*0.92, gy2 + Math.sin(a)*gr*0.92);
    }
    ctx.stroke();
    const need = on ? (-0.85 + 0.1*Math.sin(t*1.7)) : 0.55;
    ctx.strokeStyle = on ? '#40ff90' : '#ff5030'; ctx.lineWidth = 1.4*S;
    ctx.beginPath(); ctx.moveTo(gx2, gy2);
    ctx.lineTo(gx2 + Math.cos(need*Math.PI - Math.PI/2)*gr*0.72, gy2 + Math.sin(need*Math.PI - Math.PI/2)*gr*0.72);
    ctx.stroke();
    ctx.fillStyle = on ? '#c8d4de' : '#4a5058';
    ctx.beginPath(); ctx.arc(gx2, gy2, 1.1*S, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = on ? '#8aa0b4' : '#4a5058';
    ctx.font = font(4.5); ctx.textAlign = 'center';
    ctx.fillText('HEPA ×4', ogX + ogW*0.5, ogY - 5*S); ctx.textAlign = 'left';

    // Exhaust stack the bank discharges through.
    const sx = ogX + ogW + 14*S, sy = ogY + ogH*0.55, sr = Math.min(7*S, ogW*0.22);
    ctx.strokeStyle = on ? '#6a7a88' : '#333a44'; ctx.lineWidth = 2.4*S;
    ctx.beginPath(); ctx.moveTo(ogX + ogW, sy); ctx.lineTo(sx - sr, sy); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(sx + 1.5*S, sy + 2*S, sr, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = on ? '#5a6a78' : '#2a323a'; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = on ? '#9ab0c4' : '#3a444e'; ctx.lineWidth = 0.9*S; ctx.stroke();
    ctx.fillStyle = '#0c1014'; ctx.beginPath(); ctx.arc(sx, sy, sr*0.6, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = on ? '#8a9aa8' : '#3a444e'; ctx.lineWidth = 0.7*S;
    ctx.beginPath(); ctx.moveTo(sx - sr*0.6, sy); ctx.lineTo(sx + sr*0.6, sy); ctx.moveTo(sx, sy - sr*0.6); ctx.lineTo(sx, sy + sr*0.6); ctx.stroke();
    // Stack monitor: the sampler that proves nothing is getting out.
    ctx.fillStyle = on ? '#d8dcd8' : '#4a4e4a';
    ctx.fillRect(sx - 2.5*S, sy + sr + 2*S, 5*S, 4*S);
    ctx.fillStyle = on ? '#40ff90' : '#2a3a2a';
    ctx.beginPath(); ctx.arc(sx, sy + sr + 4*S, 0.9*S, 0, Math.PI*2); ctx.fill();
    if (on) {
      for (let q = 0; q < 3; q++) {
        const p = ((t * 0.35) + q/3) % 1;
        ctx.fillStyle = `rgba(210,220,230,${(0.18*(1 - p)).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(sx + p*6*S, sy - p*12*S, sr*(0.4 + p*0.7), 0, Math.PI*2); ctx.fill();
      }
    }
  }

  // ── Rod loading bay (MOX OUT) ──
  // Finished rods racked and waiting for the belt under a loading gantry;
  // the rack fills with the output buffer, so a backed-up plant is visibly
  // full.
  {
    const bw = bayW, bh = bayH;
    _wfShadow(bayX - bw, bayY - bh, bw*2, bh*2, S, 2*S);
    const rack = ctx.createLinearGradient(0, bayY - bh, 0, bayY + bh);
    rack.addColorStop(0, on ? '#3a342c' : '#221e18');
    rack.addColorStop(1, on ? '#1c1814' : '#12100e');
    ctx.fillStyle = rack;
    ctx.beginPath(); ctx.roundRect(bayX - bw, bayY - bh, bw*2, bh*2, 2*S); ctx.fill();
    // Cradle rails the rods sit between.
    ctx.fillStyle = on ? '#5a5044' : '#332e28';
    ctx.fillRect(bayX - bw + 6*S, bayY - bh*0.62, bw*2 - 12*S, 1.6*S);
    ctx.fillRect(bayX - bw + 6*S, bayY + bh*0.62, bw*2 - 12*S, 1.6*S);
    const rods = 20;
    const ry0 = bayY - bh*0.52, ry1 = bayY + bh*0.74;
    for (let i = 0; i < rods; i++) {
      const rx = bayX - bw + 7*S + (i + 0.5) * ((bw * 2 - 14*S) / rods);
      const filled = (i + 1) / rods <= moxFill;
      if (filled) {
        const rg = ctx.createLinearGradient(rx - 1.5*S, 0, rx + 1.5*S, 0);
        rg.addColorStop(0, '#a86820'); rg.addColorStop(0.45, '#ffe6a8'); rg.addColorStop(1, '#c47a28');
        ctx.fillStyle = rg;
      } else {
        ctx.fillStyle = on ? '#3c372e' : '#26231e';
      }
      ctx.beginPath(); ctx.roundRect(rx - 1.5*S, ry0, 3*S, ry1 - ry0, 1*S); ctx.fill();
      if (filled) {
        ctx.fillStyle = '#fff6d4';
        ctx.fillRect(rx - 1.5*S, ry0, 3*S, 1.8*S);
        ctx.fillRect(rx - 1.5*S, ry1 - 1.8*S, 3*S, 1.8*S);
      }
    }
    ctx.strokeStyle = on ? accent : '#3a3040'; ctx.lineWidth = 1.3*S;
    ctx.beginPath(); ctx.roundRect(bayX - bw, bayY - bh, bw*2, bh*2, 2*S); ctx.stroke();
    // Hazard-striped end stops.
    [-1, 1].forEach(side => {
      const ex = side < 0 ? bayX - bw + 1*S : bayX + bw - 5*S;
      _wfHazardStripe(ex, bayY - bh*0.75, 4*S, bh*1.5, S);
    });
    // Bridge crane: beam, carriage, and a hoist cable down to the rack.
    const beamY = bayY - bh + 1.5*S;
    const gX = bayX - bw + 8*S + (bw*2 - 24*S)*(0.5 + 0.42*Math.sin(t*(active ? 0.6 : 0)));
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(bayX - bw + 2*S, beamY + 1*S, bw*2 - 4*S, 3.4*S);
    ctx.fillStyle = '#d8b848'; ctx.strokeStyle = '#4a3a10'; ctx.lineWidth = 0.8*S;
    ctx.fillRect(bayX - bw + 2*S, beamY, bw*2 - 4*S, 3.4*S);
    ctx.strokeRect(bayX - bw + 2*S, beamY, bw*2 - 4*S, 3.4*S);
    ctx.fillStyle = '#f0d878';
    ctx.fillRect(gX, beamY - 1*S, 8*S, 5.4*S);
    ctx.strokeStyle = '#6a5010'; ctx.lineWidth = 0.7*S;
    ctx.beginPath(); ctx.moveTo(gX + 4*S, beamY + 4.4*S); ctx.lineTo(gX + 4*S, bayY + bh*0.05); ctx.stroke();
    ctx.fillStyle = active ? moxColor : '#8a7a48';
    ctx.beginPath(); ctx.arc(gX + 4*S, bayY + bh*0.1, 1.8*S, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = on ? accent : '#4a4055';
    ctx.font = font(5); ctx.textAlign = 'left';
    ctx.fillText('ROD BAY', bayX - bw, bayY + bh + 7*S);
  }

  // ── Shipping cask ──
  // Finished MOX leaves site in a heavy finned cask; one sits on its skid
  // beside the bay with the lid off while rods are loaded, and closes up
  // when the bay is empty.
  {
    const cx = px + w*0.330, cy = bayY, cl = w*0.062, cr = h*0.040;
    plinth(cx - cl - 4*S, cy - cr - 3*S, (cl + 4*S)*2, (cr + 3*S)*2);
    // Skid rails.
    ctx.fillStyle = on ? '#4a4e52' : '#2a2c2e';
    ctx.fillRect(cx - cl - 3*S, cy - cr - 2*S, (cl + 3*S)*2, 2.4*S);
    ctx.fillRect(cx - cl - 3*S, cy + cr - 0.4*S, (cl + 3*S)*2, 2.4*S);
    _wfShadow(cx - cl, cy - cr, cl*2, cr*2, S, cr);
    const cg = ctx.createLinearGradient(0, cy - cr, 0, cy + cr);
    cg.addColorStop(0, on ? '#5a6068' : '#2e3236');
    cg.addColorStop(0.35, on ? '#c8ccd0' : '#5a5e62');
    cg.addColorStop(1, on ? '#2a2e34' : '#16181a');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.roundRect(cx - cl, cy - cr, cl*2, cr*2, cr*0.5); ctx.fill();
    // Cooling fins.
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8*S;
    ctx.beginPath();
    for (let x = cx - cl*0.7; x <= cx + cl*0.7; x += 3*S) { ctx.moveTo(x, cy - cr + 1*S); ctx.lineTo(x, cy + cr - 1*S); }
    ctx.stroke();
    // Impact limiters on both ends, with lifting trunnions.
    [-1, 1].forEach(side => {
      ctx.fillStyle = on ? '#d8b040' : '#5a4a20';
      ctx.beginPath(); ctx.roundRect(side < 0 ? cx - cl - 2*S : cx + cl - cl*0.22 + 2*S, cy - cr*1.08, cl*0.22, cr*2.16, 2*S); ctx.fill();
      ctx.fillStyle = on ? '#8a8e92' : '#3a3c3e';
      ctx.fillRect(cx + side*cl*0.55 - 1.8*S, cy - cr - 2.4*S, 3.6*S, 2.4*S);
      ctx.fillRect(cx + side*cl*0.55 - 1.8*S, cy + cr, 3.6*S, 2.4*S);
    });
    // Open bore while the bay holds rods (it is being loaded), lid on otherwise.
    const loading = moxFill > 0 && on;
    ctx.fillStyle = loading ? '#0a0806' : (on ? '#9a9ea2' : '#3a3c3e');
    ctx.beginPath(); ctx.arc(cx, cy, cr*0.55, 0, Math.PI*2); ctx.fill();
    if (loading) {
      ctx.fillStyle = moxColor;
      for (let q = 0; q < 7; q++) {
        const a = q * Math.PI*2/7, rr = q ? cr*0.32 : 0;
        ctx.beginPath(); ctx.arc(cx + Math.cos(a)*rr, cy + Math.sin(a)*rr, cr*0.1, 0, Math.PI*2); ctx.fill();
      }
    } else {
      ctx.fillStyle = on ? '#5a5e62' : '#2a2c2e';
      for (let q = 0; q < 8; q++) {
        const a = q * Math.PI/4;
        ctx.beginPath(); ctx.arc(cx + Math.cos(a)*cr*0.45, cy + Math.sin(a)*cr*0.45, 0.8*S, 0, Math.PI*2); ctx.fill();
      }
    }
    _wfTrefoil(cx - cl*0.62, cy, Math.min(4*S, cr*0.35), '#e8c820', '#1a1608');
    ctx.fillStyle = on ? 'rgba(220,226,232,0.8)' : 'rgba(110,116,120,0.5)';
    ctx.font = font(4); ctx.textAlign = 'center';
    ctx.fillText('MOX CASK', cx, cy + cr + 9*S); ctx.textAlign = 'left';
  }

  // ── Status panel ──
  // Feeds and the product buffer at a glance, with the rod count spelled out.
  {
    ctx.fillStyle = on ? '#2a2731' : '#1b1922';
    ctx.beginPath(); ctx.roundRect(panX, panY, panW, panH, 2*S); ctx.fill();
    ctx.strokeStyle = on ? accent : '#3a3040'; ctx.lineWidth = 1.2*S; ctx.stroke();
    ctx.fillStyle = '#0d0806';
    ctx.fillRect(panX + 3*S, panY + 3*S, panW - 6*S, panH - 6*S);
    ctx.font = font(4.6, false);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const rows = [
      [panY + panH*0.24, 'PuO₂', e._hasPlutonium ? plutColor : '#7a4030', !!e._hasPlutonium, e._hasPlutonium ? 1 : 0.08],
      [panY + panH*0.50, 'UO₂',  e._hasUranium ? uColor : '#3e5a30', !!e._hasUranium, e._hasUranium ? 1 : 0.08],
      [panY + panH*0.76, `${Math.floor(e._mox || 0)}/${moxCap}`, moxFill > 0.9 ? '#ff8020' : moxColor, moxFill > 0, moxFill],
    ];
    rows.forEach(([ly, label, col, ok, frac]) => {
      const barX = panX + panW*0.46, barW = panW*0.38;
      ctx.fillStyle = '#1a1410';
      ctx.fillRect(barX, ly - 2.2*S, barW, 4.4*S);
      ctx.fillStyle = col;
      ctx.globalAlpha = ok ? 0.9 : 0.35;
      ctx.fillRect(barX, ly - 2.2*S, barW * frac, 4.4*S);
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.fillText(label, panX + 5*S, ly);
      ctx.fillStyle = ok ? '#40ff90' : '#ff5030';
      ctx.beginPath(); ctx.arc(panX + panW - 6*S, ly, 1.7*S, 0, Math.PI*2); ctx.fill();
    });
    ctx.textBaseline = 'alphabetic';
  }

  // ── Criticality-safety striping ──
  // Real fabrication lines are laid out so a spill can never pool into a
  // critical mass; the striped floor run along the kiln is that keep-clear
  // zone.
  {
    const zx = kilnX, zy = kilnY + kilnH + 5*S, zw = kilnW;
    ctx.save();
    ctx.globalAlpha = on ? 0.5 : 0.25;
    ctx.beginPath(); ctx.rect(zx, zy, zw, 4 * S); ctx.clip();
    ctx.fillStyle = '#1a1610'; ctx.fillRect(zx, zy, zw, 4*S);
    ctx.fillStyle = '#e8b020';
    ctx.beginPath();
    for (let i = -2; i < zw / (6 * S) + 2; i += 2) {
      ctx.moveTo(zx + i * 6 * S, zy + 4 * S); ctx.lineTo(zx + i * 6 * S + 4 * S, zy);
      ctx.lineTo(zx + i * 6 * S + 10 * S, zy); ctx.lineTo(zx + i * 6 * S + 6 * S, zy + 4 * S);
      ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
  }

  _wfTrefoil(px + w*0.040, py + h*0.300, Math.min(9*S, w*0.03), '#e8c820', '#1a1608');
  _wfTrefoil(px + w*0.960, py + h*0.300, Math.min(9*S, w*0.03), '#e8c820', '#1a1608');
  _wfLamp(px + w - 9 * S, py + 9 * S, S, t, accent, active);
  _wfPlate('MOX FABRICATION', px + w * 0.5, py + h * 0.045, S, accent, on);

  // Belt docks on the wall where the neighbouring belt tiles butt up — the
  // same dock the Reprocessing Plant uses. Without them the internal feed
  // runs started inside the wall and the outside belts stopped short of it.
  if (aPlut) _portBelt(aPlut, S, t, { belt: plutColor, label: 'PuO₂ IN', on: !!e._hasPlutonium,   out: false });
  if (aUran) _portBelt(aUran, S, t, { belt: uColor,    label: 'UO₂ IN',  on: !!e._hasUranium,     out: false });
  if (aMox)  _portBelt(aMox,  S, t, { belt: moxColor,  label: 'MOX OUT', on: !!e._moxConveyorOut, out: true });
  ctx.restore();
}
