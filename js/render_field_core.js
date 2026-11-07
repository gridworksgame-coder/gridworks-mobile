/* ═══════════════════════════════════════════════════════════════════
   FIELD CORE ART — the back half of the chain (field_core_systems.js)
     renderSuperconductorMill  powder silo → clean-room hall whose glazed
                               strip shows the reel-to-reel deposition line
                               and LN₂ test bath → dispatch rack; H₂ bullet
                               tanks, LN₂ dewar and vaporiser, chillers
     renderCoreWorks           tape spool stand → winding hall (mandrel under
                               glazing) → four test cells behind blast walls
                               with a gantry crane (empty / charging /
                               charged / spent); transformer and capacitor
                               yard, cryo dewar, drone pad and truck dock
   Shared helpers: render_hydro_coal.js (_wf*), render_rare_earth.js (_fc*).
   ═══════════════════════════════════════════════════════════════════ */

// Bottom-face port art shared by both buildings: a label pill, a belt stub
// (rollers, cargo, arrow) and a flanged pipe stub with flow chevrons. Same
// look as the Fuel Processing Plant's and the Leach Plant's ports.
function _fcPorts(px, py, h, S, t) {
  const stubLen = Math.min(TILE * 0.95, S*22);
  const y1 = py + h - stubLen, y0 = py + h;
  const pill = (text, x, y, lit, col) => {
    const fs = Math.max(9, S*8);
    ctx.font = `bold ${fs}px Arial, sans-serif`;
    const tw = ctx.measureText(text).width + fs*0.9, th = fs*1.45;
    ctx.fillStyle = 'rgba(4,6,10,0.92)';
    ctx.strokeStyle = lit ? col : 'rgba(225,230,240,0.8)';
    ctx.lineWidth = Math.max(1.2, S);
    ctx.beginPath(); ctx.roundRect(x - tw/2, y - th/2, tw, th, th/2); ctx.fill(); ctx.stroke();
    ctx.save();
    if (lit) { ctx.shadowColor = col; ctx.shadowBlur = fs*0.8; }
    ctx.fillStyle = lit ? col : '#eef0f4';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + fs*0.05);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  };
  const belt = (tx, label, connected, up, moving, cargo, trim, row = 0.9) => {
    const bw = S*16, x0 = tx - bw/2;
    ctx.fillStyle = connected ? trim : '#8a8a84';
    ctx.fillRect(x0 - S*1.5, y1, S*2, stubLen);
    ctx.fillRect(x0 + bw - S*0.5, y1, S*2, stubLen);
    ctx.fillStyle = connected ? '#2c3038' : '#44464c';
    ctx.fillRect(x0 + S*0.5, y1, bw - S, stubLen);
    const phase = connected ? ((t*1.2) % 1) : 0, dir = up ? -1 : 1, step = S*4;
    ctx.strokeStyle = connected ? 'rgba(210,220,235,0.45)' : 'rgba(160,160,160,0.35)';
    ctx.lineWidth = Math.max(1, S*0.8);
    for (let yy = 0; yy <= stubLen + step; yy += step) {
      const ly = y1 + ((yy + dir*phase*step) % (stubLen + step) + stubLen + step) % (stubLen + step);
      if (ly < y1 || ly > y0) continue;
      ctx.beginPath(); ctx.moveTo(x0 + S, ly); ctx.lineTo(x0 + bw - S, ly); ctx.stroke();
    }
    if (connected && moving) for (let k = 0; k < 2; k++) {
      const f = (t*0.6 + k*0.5) % 1, cy = up ? y0 - f*stubLen : y1 + f*stubLen;
      ctx.fillStyle = cargo; ctx.beginPath(); ctx.arc(tx, cy, S*2.3, 0, Math.PI*2); ctx.fill();
    }
    ctx.fillStyle = connected ? trim : 'rgba(200,200,200,0.7)';
    const ay = up ? y1 + S*4 : y0 - S*4;
    ctx.beginPath();
    if (up) { ctx.moveTo(tx, ay - S*2.5); ctx.lineTo(tx + S*3, ay + S*1.5); ctx.lineTo(tx - S*3, ay + S*1.5); }
    else    { ctx.moveTo(tx, ay + S*2.5); ctx.lineTo(tx + S*3, ay - S*1.5); ctx.lineTo(tx - S*3, ay - S*1.5); }
    ctx.closePath(); ctx.fill();
    pill(label, tx, y1 - Math.max(9, S*8)*row, connected, trim);
  };
  const pipe = (x, label, conn, lit, mid, dark, chevron, row = 2.5) => {
    const bw = S*7;
    const g = ctx.createLinearGradient(x - bw/2, 0, x + bw/2, 0);
    g.addColorStop(0, conn ? dark : '#5a5c62'); g.addColorStop(0.45, conn ? mid : '#a8aab0'); g.addColorStop(1, conn ? dark : '#4a4c52');
    ctx.fillStyle = g; ctx.fillRect(x - bw/2, y1, bw, stubLen);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = Math.max(1, S*0.6); ctx.strokeRect(x - bw/2, y1, bw, stubLen);
    for (const fy of [y1 + S*2, y0 - S*3]) { ctx.fillStyle = conn ? mid : '#8a8c92'; ctx.fillRect(x - bw/2 - S*2, fy - S*1.5, bw + S*4, S*3); }
    if (conn) {
      ctx.strokeStyle = chevron; ctx.lineWidth = Math.max(1, S*1.1);
      for (let k = 0; k < 3; k++) {
        const f = (t*0.9 + k/3) % 1, cy = y0 - S*4 - f*(stubLen - S*8);
        ctx.beginPath(); ctx.moveTo(x - S*2, cy + S*1.4); ctx.lineTo(x, cy - S*0.6); ctx.lineTo(x + S*2, cy + S*1.4); ctx.stroke();
      }
    }
    pill(label, x, y1 - Math.max(9, S*8)*row, conn, lit);
  };
  return { pill, belt, pipe, stubLen };
}

// A connected belt tile on a stub, for OUT ports (the building can't know
// from its own flags whether anything is laid there).
function _fcBeltAt(stub) {
  const tile = stub ? GridManager.getEntity(stub.c, stub.r) : null;
  return !!(tile && typeof isConveyorTile === 'function' && isConveyorTile(tile));
}

// ── Superconductor Mill (12×10) ──
// A clean-room line: the oxide comes off its belt into a powder silo and up
// into the mill hall, where HTS tape runs reel to reel through a long
// deposition chamber glowing with plasma in a hydrogen atmosphere, then
// through a liquid-nitrogen test bath, seen through the hall's glazed roof
// strip. Outside: hydrogen bullet tanks behind their fence, the LN₂ dewar
// and its frosted vaporiser, chillers, and the dispatch rack where finished
// spools stack up with the tape buffer. Stands on a concrete yard
// (SiteYard). Stubs: SuperconductorMillSystem.getStubs.
function renderSuperconductorMill(e, px, py, t) {
  const def = EntityDefs[T.SCMILL];
  const w = (e.width || def.width) * TILE, h = (e.height || def.height) * TILE;
  const on = !!e.powered, active = on && !!e._running;
  const fill = Math.min(1, (e._tape || 0) / (def.tapeCapacity || 300));
  const S = (TILE / 40) * Math.max(1, Math.min(w / (8 * TILE), h / (7 * TILE)));
  const accent = '#c8b0f0';
  const U = w / 12, V = h / 10;
  const X = c => px + c*U, Y = r => py + r*V;
  ctx.save();
  ctx.lineJoin = 'round';

  // ── Feeds ──
  _wfConveyor(X(1.5), Y(9.3), X(1.5), Y(6.75), S, t, active && !!e._hasOxide, '#a898c0');
  _wfPipe([[X(1.5), Y(5.2)], [X(1.5), Y(4.6)]], S, t, active, '#d8cce8');
  _wfPipe([[X(4.5), Y(9.3)], [X(4.5), Y(7.05)]], S, t, on && !!e._hasHydrogen, '#80d8ff');
  _wfPipe([[X(3.9), Y(5.3)], [X(3.9), Y(4.6)]], S, t, active, '#80d8ff');
  _wfPipe([[X(6.5), Y(9.3)], [X(6.5), Y(6.7)]], S, t, on && !!e._hasNitrogen, '#a0a8ff');
  _wfPipe([[X(7.85), Y(5.4)], [X(7.85), Y(4.6)]], S, t, active, '#d0e8ff');
  _wfConveyor(X(10.5), Y(4.35), X(10.5), Y(9.3), S, t, on && fill > 0, '#c8a060');

  // ── Mill hall: white clean-room roof, glazed strip over the line ──
  const hx = X(0.9), hy = Y(0.75), hw = X(8.7) - hx, hh = Y(4.6) - hy;
  _fcBuilding(hx, hy, hw, hh, S, t, { lit: on, roof0: '#eef0f2', roof1: '#c4c8cc', wall: '#7a8088',
    units: [[0.12, 0.13], [0.3, 0.13], [0.7, 0.13], [0.88, 0.13], [0.2, 0.86], [0.8, 0.86]], spin: on });
  const lineY = Y(2.65), gy0 = Y(1.85), gy1 = Y(3.45);
  // interior seen through the glazing
  ctx.fillStyle = '#16141c'; ctx.fillRect(hx + 4*S, gy0, hw - 8*S, gy1 - gy0);
  const payX = X(1.7), takeX = X(8.0), reelR = V*0.62;
  const chX0 = X(2.6), chX1 = X(6.1), chH = V*0.62;
  const bathX0 = X(6.35), bathX1 = X(7.35), bathH = V*0.55;
  ctx.strokeStyle = active ? '#e0b878' : '#6a5a40'; ctx.lineWidth = 1.6*S;
  ctx.beginPath(); ctx.moveTo(payX, lineY - reelR*0.7); ctx.lineTo(takeX, lineY - reelR*0.7); ctx.stroke();
  [[payX, 1], [takeX, -1]].forEach(([rx, d], i) => {
    ctx.fillStyle = '#3a3640'; ctx.beginPath(); ctx.arc(rx, lineY, reelR, 0, Math.PI*2); ctx.fill();
    const wound = i === 0 ? 0.85 - 0.3*fill : 0.45 + 0.4*fill;
    ctx.fillStyle = '#c8a060'; ctx.beginPath(); ctx.arc(rx, lineY, reelR*wound, 0, Math.PI*2); ctx.fill();
    ctx.save(); ctx.translate(rx, lineY); ctx.rotate(active ? t*2.4*d : 0.3);
    ctx.strokeStyle = 'rgba(40,30,20,0.6)'; ctx.lineWidth = S;
    for (let k = 0; k < 3; k++) { ctx.rotate(Math.PI/3); ctx.beginPath(); ctx.moveTo(-reelR*wound, 0); ctx.lineTo(reelR*wound, 0); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = '#9fd8ff'; ctx.beginPath(); ctx.arc(rx, lineY, 1.8*S, 0, Math.PI*2); ctx.fill();
  });
  const cg = ctx.createLinearGradient(0, lineY - chH/2, 0, lineY + chH/2);
  cg.addColorStop(0, '#b8bcc8'); cg.addColorStop(0.5, '#6a6e7a'); cg.addColorStop(1, '#30323a');
  ctx.fillStyle = cg; ctx.strokeStyle = '#0e1014'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.roundRect(chX0, lineY - chH/2, chX1 - chX0, chH, chH/2); ctx.fill(); ctx.stroke();
  const winX = chX0 + (chX1 - chX0)*0.1, winW = (chX1 - chX0)*0.8;
  ctx.fillStyle = '#120c1a'; ctx.fillRect(winX, lineY - chH*0.2, winW, chH*0.4);
  if (active) {
    const p = 0.6 + 0.4*Math.sin(t*5);
    const pg = ctx.createLinearGradient(winX, 0, winX + winW, 0);
    pg.addColorStop(0, 'rgba(200,120,255,0)'); pg.addColorStop(0.5, `rgba(235,180,255,${(0.9*p).toFixed(3)})`); pg.addColorStop(1, 'rgba(200,120,255,0)');
    ctx.fillStyle = pg; ctx.fillRect(winX, lineY - chH*0.2, winW, chH*0.4);
    const halo = ctx.createRadialGradient((chX0 + chX1)/2, lineY, 0, (chX0 + chX1)/2, lineY, (chX1 - chX0)*0.55);
    halo.addColorStop(0, `rgba(200,140,255,${(0.25*p).toFixed(3)})`); halo.addColorStop(1, 'rgba(200,140,255,0)');
    ctx.fillStyle = halo; ctx.fillRect(hx + 4*S, gy0, hw - 8*S, gy1 - gy0);
  }
  ctx.fillStyle = '#3a3c44';
  for (const f of [0.06, 0.94]) ctx.fillRect(chX0 + (chX1 - chX0)*f - 2*S, lineY - chH/2 - 2*S, 4*S, chH + 4*S);
  ctx.fillStyle = '#d8e4ee'; ctx.strokeStyle = '#4a5a68'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.roundRect(bathX0, lineY - bathH/2, bathX1 - bathX0, bathH, 3*S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = active ? '#a8c8f0' : '#6a7a88'; ctx.fillRect(bathX0 + 3*S, lineY - bathH*0.28, bathX1 - bathX0 - 6*S, bathH*0.56);
  if (active) for (let k = 0; k < 4; k++) {
    const ph = (t*0.5 + k/4) % 1;
    ctx.fillStyle = `rgba(235,245,255,${(0.35*(1 - ph)).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(bathX0 + (bathX1 - bathX0)*(0.2 + k*0.2), lineY - ph*8*S, (1.5 + ph*3)*S, 0, Math.PI*2); ctx.fill();
  }
  // glazing: mullions and a sky reflection over the cutaway
  ctx.fillStyle = 'rgba(180,210,240,0.14)'; ctx.fillRect(hx + 4*S, gy0, hw - 8*S, (gy1 - gy0)*0.35);
  ctx.strokeStyle = 'rgba(200,210,220,0.75)'; ctx.lineWidth = 1.1*S;
  ctx.strokeRect(hx + 4*S, gy0, hw - 8*S, gy1 - gy0);
  for (let x = hx + 4*S + U*0.9; x < hx + hw - 4*S; x += U*0.9) { ctx.beginPath(); ctx.moveTo(x, gy0); ctx.lineTo(x, gy1); ctx.stroke(); }
  // a clean-room status strip on the roof edge
  ctx.fillStyle = active ? `rgba(200,160,255,${(0.7 + 0.3*Math.sin(t*2)).toFixed(3)})` : on ? '#5a4a7a' : '#2a2632';
  ctx.fillRect(hx + hw*0.36, hy + 3*S, hw*0.28, 2.2*S);

  // ── Dispatch rack: finished spools stack up with the buffer ──
  {
    const rx = X(8.95), ry = Y(0.85), rw = X(11.65) - rx, rh = Y(4.25) - ry;
    ctx.fillStyle = 'rgba(0,0,0,0.33)'; ctx.fillRect(rx + 4*S, ry + 5*S, rw, rh);
    ctx.fillStyle = '#3a3640'; ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = '#14121a'; ctx.lineWidth = 1.2*S; ctx.strokeRect(rx, ry, rw, rh);
    ctx.fillStyle = '#5a5664'; for (let k = 1; k < 4; k++) ctx.fillRect(rx, ry + rh*k/4 - 0.8*S, rw, 1.6*S);
    const cols = 3, rows = 4, lit = Math.round(fill*cols*rows);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const idx = (rows - 1 - r)*cols + c;
      const sx = rx + rw*(c + 0.5)/cols, sy = ry + rh*(r + 0.5)/rows, sr = Math.min(rw/cols, rh/rows)*0.36;
      ctx.fillStyle = idx < lit ? '#d0a868' : '#24212a'; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI*2); ctx.fill();
      if (idx < lit) { ctx.strokeStyle = 'rgba(90,60,20,0.6)'; ctx.lineWidth = 0.6*S; ctx.beginPath(); ctx.arc(sx, sy, sr*0.68, 0, Math.PI*2); ctx.stroke(); }
      ctx.fillStyle = '#16141a'; ctx.beginPath(); ctx.arc(sx, sy, sr*0.3, 0, Math.PI*2); ctx.fill();
    }
    ctx.font = `bold ${Math.max(4, 4.5*S)}px Courier New`; ctx.textAlign = 'center';
    ctx.fillStyle = on ? accent : '#5a5466';
    ctx.fillText(`TAPE ${Math.round(fill*100)}%`, rx + rw/2, ry + rh + 6*S);
    ctx.textAlign = 'left';
  }

  // ── Oxide powder silo ──
  _fcVTank(X(1.5), Y(5.95), Math.min(U, V)*0.72, S, { shell: ['#ece4f4', '#a89cb8', '#4a4256'], band: '#7a5ab0', ladderAngle: 2.6 });

  // ── Hydrogen bullet tanks behind their fence ──
  {
    const fx = X(2.55), fy = Y(5.15), fw = X(5.6) - fx, fh = Y(7.15) - fy;
    ctx.fillStyle = 'rgba(70,74,80,0.35)'; ctx.fillRect(fx, fy, fw, fh);
    _fcHCyl(X(2.8), X(5.35), Y(5.7), V*0.34, S, ['#f4f8fa', '#b8ccd8', '#4a5a66'], { bands: [0.08, 0.92], bandColor: '#5a6a76' });
    _fcHCyl(X(2.8), X(5.35), Y(6.55), V*0.34, S, ['#f4f8fa', '#b8ccd8', '#4a5a66'], { bands: [0.08, 0.92], bandColor: '#5a6a76' });
    ctx.fillStyle = '#c42420';
    for (const yy of [5.7, 6.55]) ctx.fillRect(X(3.9) - 6*S, Y(yy) - 1.2*S, 12*S, 2.4*S);
    ctx.fillStyle = '#ffffff'; ctx.font = `bold ${Math.max(4, 4*S)}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const yy of [5.7, 6.55]) ctx.fillText('H₂', X(3.9), Y(yy) + 0.2*S);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    _wfPipe([[X(3.9), Y(5.3)], [X(3.9), Y(5.36)]], S, t, false, '#80d8ff');
    ctx.strokeStyle = 'rgba(190,196,200,0.85)'; ctx.lineWidth = 0.9*S; ctx.setLineDash([2*S, 1.4*S]);
    ctx.strokeRect(fx, fy, fw, fh); ctx.setLineDash([]);
    _fcDiamond(X(5.35), Y(5.0), 7*S, '#c42420', '🔥');
  }

  // ── LN₂ dewar and its ambient vaporiser ──
  {
    _fcVTank(X(6.5), Y(5.95), Math.min(U, V)*0.68, S, { shell: ['#ffffff', '#cdd8e2', '#6a7888'], band: '#3a60a8', ladderAngle: 2.4 });
    ctx.fillStyle = '#2a3440'; ctx.font = `bold ${Math.max(4, 4.5*S)}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('LN₂', X(6.5), Y(5.95));
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const vx = X(7.25), vy = Y(5.3), vw = X(8.55) - vx, vh = Y(6.75) - vy;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(vx + 3*S, vy + 4*S, vw, vh);
    ctx.fillStyle = '#a8b4c0'; ctx.fillRect(vx, vy, vw, vh);
    const n = 6;
    for (let k = 0; k < n; k++) for (let j = 0; j < 4; j++) {
      const cx = vx + vw*(k + 0.5)/n, cy = vy + vh*(j + 0.5)/4;
      ctx.fillStyle = active ? '#f4f8ff' : '#dfe6ee'; ctx.beginPath(); ctx.arc(cx, cy, Math.min(vw/n, vh/4)*0.42, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(80,100,120,0.5)'; ctx.lineWidth = 0.5*S; ctx.stroke();
    }
    if (active) _wfSmoke(vx + vw*0.5, vy, S*0.7, t, '240,248,255', true, 0.3);
  }

  // ── Chillers ──
  for (let k = 0; k < 3; k++) {
    const cx = X(9.35) + k*U*0.95, cy = Y(5.5), r = Math.min(U, V)*0.38;
    ctx.fillStyle = 'rgba(0,0,0,0.33)'; ctx.fillRect(cx - r - 2*S + 3*S, cy - r - 2*S + 4*S, r*2 + 4*S, r*2 + 4*S);
    ctx.fillStyle = '#6a7078'; ctx.fillRect(cx - r - 2*S, cy - r - 2*S, r*2 + 4*S, r*2 + 4*S);
    ctx.fillStyle = '#1e2228'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(on ? t*8 + k : k);
    ctx.fillStyle = '#9aa2aa';
    for (let b = 0; b < 4; b++) { ctx.rotate(Math.PI/2); ctx.beginPath(); ctx.ellipse(r*0.48, 0, r*0.44, r*0.16, 0.4, 0, Math.PI*2); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = '#3a3e44'; ctx.beginPath(); ctx.arc(cx, cy, r*0.18, 0, Math.PI*2); ctx.fill();
  }

  // ── Ports (bottom face): OXIDE IN col+1, H₂ IN col+4, N₂ IN col+6, TAPE OUT col+10 ──
  const P = _fcPorts(px, py, h, S, t), TH = TILE/2;
  const tapeOut = typeof SuperconductorMillSystem !== 'undefined' && e.col !== undefined ? SuperconductorMillSystem.getStubs(e).tapeOut : null;
  P.belt(px + TILE*1 + TH, 'OXIDE IN', !!e._hasOxide, true, active, '#d8cce8', '#c8b0f0');
  P.pipe(px + TILE*4 + TH, 'H₂ IN', !!e._hasHydrogen, '#80d8ff', '#a8e8ff', '#2a6a8a', 'rgba(10,40,60,0.8)');
  P.pipe(px + TILE*6 + TH, 'N₂ IN', !!e._hasNitrogen, '#a0a8ff', '#c0c4ff', '#3a408a', 'rgba(20,20,60,0.8)', 1.0);
  P.belt(px + TILE*10 + TH, 'TAPE OUT', _fcBeltAt(tapeOut), false, on && (e._tape || 0) > 0, '#c8a060', '#e0c080');

  _wfPlate('SUPERCONDUCTOR MILL', px + w*0.50, py + h*0.04, S, accent, on);
  _wfLamp(px + w - 9*S, py + 9*S, S, t, accent, on);
  ctx.restore();
}

// ── Core Works (12×10) ──
// Tape comes in to a spool stand and is wound into cores on a mandrel in
// the winding hall (glazed strip over the mandrel, which turns while a new
// core is wound). The cores charge in four test cells behind concrete blast
// walls, served by a gantry crane; each cell shows its core end-on (empty /
// charging with a sweeping charge ring / charged and glowing / spent, rust
// slashed if it quenched). A transformer and capacitor yard feeds them
// along busbars that glow while charging; a cryo dewar keeps them cold;
// drones land on the pad and trucks back up to the dock. Stands on a
// concrete yard (SiteYard). Stub: CoreWorksSystem.getStubs.
function renderCoreWorks(e, px, py, t) {
  const def = EntityDefs[T.COREWORKS];
  const w = (e.width || def.width) * TILE, h = (e.height || def.height) * TILE;
  const on = !!e.powered, charging = on && !!e._charging;
  const S = (TILE / 40) * Math.max(1, Math.min(w / (8 * TILE), h / (7 * TILE)));
  const accent = '#9fd8ff';
  const bays = Array.isArray(e._bays) ? e._bays : [];
  const stock = Math.min(1, (e._tapeStock || 0) / (def.tapeCapacity || 300));
  const U = w / 12, V = h / 10;
  const X = c => px + c*U, Y = r => py + r*V;
  const winding = on && bays.some(c => c.state === 'charging' && (c.charge || 0) < 0.12);
  ctx.save();
  ctx.lineJoin = 'round';

  // ── Feeds and busbars ──
  _wfConveyor(X(1.5), Y(9.3), X(1.5), Y(6.35), S, t, on && !!e._hasTape, '#8a7040');
  _wfPipe([[X(1.5), Y(4.95)], [X(1.5), Y(4.45)]], S, t, on, '#c8a060');
  const bus = (pts) => {
    const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); };
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1a1e24'; ctx.lineWidth = 5*S; path();
    ctx.strokeStyle = charging ? `rgba(150,220,255,${(0.7 + 0.3*Math.sin(t*6)).toFixed(3)})` : '#8a6a3a'; ctx.lineWidth = 2.4*S; path();
  };
  bus([[X(3.4), Y(5.7)], [X(3.4), Y(4.9)], [X(6.2), Y(4.9)], [X(6.2), Y(4.65)]]);
  bus([[X(3.6), Y(5.7)], [X(3.6), Y(5.05)], [X(9.2), Y(5.05)], [X(9.2), Y(4.65)]]);
  _wfPipe([[X(5.0), Y(5.55)], [X(5.0), Y(4.75)], [X(5.5), Y(4.75)]], S, t, on, '#d0e8ff');     // cryo line to the cells

  // ── Winding hall: sawtooth roof, glazed over the mandrel ──
  {
    const hx = X(0.6), hy = Y(0.8), hw = X(5.05) - hx, hh = Y(4.45) - hy;
    _fcBuilding(hx, hy, hw, hh, S, t, { lit: on, roof0: '#a8b0b8', roof1: '#7a828a', wall: '#56606a', units: [[0.12, 0.88], [0.88, 0.88]], spin: on });
    ctx.fillStyle = 'rgba(0,0,0,0.18)';                                            // sawtooth north lights
    for (let k = 0; k < 5; k++) ctx.fillRect(hx + 2*S, hy + 3*S + k*(hh - 8*S)/5, hw - 4*S, 2.2*S);
    const gx0 = hx + hw*0.12, gx1 = hx + hw*0.88, gy0 = Y(2.0), gy1 = Y(3.05);
    ctx.fillStyle = '#14181e'; ctx.fillRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
    const my = (gy0 + gy1)/2, mH = (gy1 - gy0)*0.5, mx0 = gx0 + (gx1 - gx0)*0.25, mx1 = gx0 + (gx1 - gx0)*0.78;
    const mg = ctx.createLinearGradient(0, my - mH/2, 0, my + mH/2);
    mg.addColorStop(0, '#c8ccd4'); mg.addColorStop(0.5, '#70747c'); mg.addColorStop(1, '#30343a');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.roundRect(mx0, my - mH/2, mx1 - mx0, mH, mH/2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.roundRect(mx0, my - mH/2, mx1 - mx0, mH, mH/2); ctx.clip();
    ctx.fillStyle = 'rgba(210,170,100,0.75)';
    const off = winding ? (t*16*S) % (5*S) : 0;
    for (let x = mx0 - 5*S + off; x < mx1; x += 5*S) ctx.fillRect(x, my - mH/2, 2*S, mH);
    ctx.restore();
    ctx.fillStyle = '#2a2e34'; ctx.fillRect(mx0 - 4*S, my - mH*0.8, 4*S, mH*1.6); ctx.fillRect(mx1, my - mH*0.8, 4*S, mH*1.6);
    ctx.fillStyle = '#c8a060'; ctx.beginPath(); ctx.arc(gx0 + 6*S, my, mH*0.55, 0, Math.PI*2); ctx.fill();    // supply reel
    ctx.strokeStyle = 'rgba(200,210,220,0.75)'; ctx.lineWidth = 1.1*S; ctx.strokeRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
    ctx.fillStyle = 'rgba(180,210,240,0.12)'; ctx.fillRect(gx0, gy0, gx1 - gx0, (gy1 - gy0)*0.35);
  }

  // ── Test cells: four open-topped cells behind blast walls ──
  const cx0 = X(5.5), cy0 = Y(0.85), cw = X(11.55) - cx0, chh = Y(4.6) - cy0;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(cx0 + 5*S, cy0 + 6*S, cw, chh);
  ctx.fillStyle = '#9a978e'; ctx.fillRect(cx0, cy0, cw, chh);                                      // walls
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(cx0, cy0, cw, 1.5*S); ctx.fillRect(cx0, cy0, 1.5*S, chh);
  const wall = 4*S;
  for (let i = 0; i < 4; i++) {
    const c = bays[i] || { state: 'empty' };
    const col = i % 2, row = Math.floor(i/2);
    const bx = cx0 + wall + col*(cw - wall)/2, by = cy0 + wall + row*(chh - wall)/2;
    const bw = (cw - wall)/2 - wall, bh = (chh - wall)/2 - wall;
    ctx.fillStyle = '#2a2e34'; ctx.fillRect(bx, by, bw, bh);                                      // cell floor
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(bx, by, bw, 3*S); ctx.fillRect(bx, by, 3*S, bh);  // wall shadow
    _wfHazardStripe(bx, by + bh - 2.4*S, bw, 2.4*S, S*0.6);
    const ccx = bx + bw/2, ccy = by + bh/2, br = Math.min(bw, bh)*0.3;
    ctx.fillStyle = '#0e1216'; ctx.beginPath(); ctx.arc(ccx, ccy, br*1.25, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#4a5464'; ctx.lineWidth = S; ctx.stroke();
    if (c.state !== 'empty') {
      const can = c.state === 'spent' ? '#7a6a50' : '#a8b4c0';
      ctx.fillStyle = can; ctx.beginPath(); ctx.arc(ccx, ccy, br, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = c.state === 'spent' ? '#8a6a3a' : '#c8a060'; ctx.beginPath(); ctx.arc(ccx, ccy, br*0.72, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(90,60,20,0.5)'; ctx.lineWidth = 0.5*S;
      for (let k = 0.4; k < 0.72; k += 0.1) { ctx.beginPath(); ctx.arc(ccx, ccy, br*k, 0, Math.PI*2); ctx.stroke(); }
      ctx.fillStyle = '#14181e'; ctx.beginPath(); ctx.arc(ccx, ccy, br*0.32, 0, Math.PI*2); ctx.fill();
      if (c.state === 'charging') {
        ctx.strokeStyle = charging ? '#9fd8ff' : '#4a6a80'; ctx.lineWidth = 2.4*S;
        ctx.beginPath(); ctx.arc(ccx, ccy, br*1.12, -Math.PI/2, -Math.PI/2 + Math.PI*2*(c.charge || 0)); ctx.stroke();
        if (charging) {
          const a = 0.4 + 0.4*Math.sin(t*5 + i);
          const gl = ctx.createRadialGradient(ccx, ccy, 0, ccx, ccy, br*1.8);
          gl.addColorStop(0, `rgba(160,220,255,${(a*0.5).toFixed(3)})`); gl.addColorStop(1, 'rgba(160,220,255,0)');
          ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(ccx, ccy, br*1.8, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = `rgba(190,235,255,${a.toFixed(3)})`; ctx.beginPath(); ctx.arc(ccx, ccy, br*0.3, 0, Math.PI*2); ctx.fill();
        }
      } else if (c.state === 'charged') {
        const p = 0.6 + 0.4*Math.sin(t*1.5 + i);
        ctx.strokeStyle = `rgba(160,230,255,${p.toFixed(3)})`; ctx.lineWidth = 2*S;
        ctx.beginPath(); ctx.arc(ccx, ccy, br*1.12, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = `rgba(160,230,255,${(0.7*p).toFixed(3)})`; ctx.beginPath(); ctx.arc(ccx, ccy, br*0.3, 0, Math.PI*2); ctx.fill();
      } else if (c.state === 'spent' && c.quenched) {
        ctx.strokeStyle = '#ff7040'; ctx.lineWidth = 1.6*S;
        ctx.beginPath(); ctx.moveTo(ccx - br*0.5, ccy - br*0.5); ctx.lineTo(ccx + br*0.5, ccy + br*0.5); ctx.stroke();
      }
    }
    ctx.fillStyle = c.state === 'charging' ? (charging ? '#40c8ff' : '#2a5a7a') : c.state === 'charged' ? '#40e070' : c.state === 'spent' ? '#e0a030' : '#3a3e44';
    ctx.beginPath(); ctx.arc(bx + bw - 4*S, by + 4*S, 1.6*S, 0, Math.PI*2); ctx.fill();          // cell status lamp
  }
  // gantry crane across the cells: rails on the long walls, a yellow bridge
  // that drifts along them while the works is busy
  {
    const span = cw - 6*S;
    const gx = cx0 + 3*S + (charging ? (0.5 + 0.45*Math.sin(t*0.25)) : 0.18)*span;
    ctx.fillStyle = '#4a4e52'; ctx.fillRect(cx0, cy0 - 1*S, cw, 2*S); ctx.fillRect(cx0, cy0 + chh - 1*S, cw, 2*S);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(gx - 3*S + 4*S, cy0 + 4*S, 6*S, chh);
    ctx.fillStyle = '#e0b020'; ctx.fillRect(gx - 3*S, cy0 - 2*S, 6*S, chh + 4*S);
    ctx.strokeStyle = '#6a5008'; ctx.lineWidth = 0.6*S;
    for (let y = cy0; y < cy0 + chh; y += 4*S) { ctx.beginPath(); ctx.moveTo(gx - 3*S, y); ctx.lineTo(gx + 3*S, y + 4*S); ctx.stroke(); }
    const ty = cy0 + chh*(charging ? 0.5 + 0.3*Math.sin(t*0.4) : 0.35);
    ctx.fillStyle = '#2a2c30'; ctx.fillRect(gx - 5*S, ty - 4*S, 10*S, 8*S);
    ctx.fillStyle = '#c8ccd0'; ctx.beginPath(); ctx.arc(gx, ty, 1.8*S, 0, Math.PI*2); ctx.fill();
  }

  // ── Tape spool stand (stock fills the reel) ──
  {
    const sx = X(1.5), sy = Y(5.65), r = Math.min(U, V)*0.68;
    ctx.fillStyle = '#4a4e54'; ctx.fillRect(sx - r - 3*S, sy - r - 3*S, r*2 + 6*S, r*2 + 6*S);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(sx + 3*S, sy + 4*S, r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#3a3640'; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#c8a060'; ctx.beginPath(); ctx.arc(sx, sy, r*(0.35 + 0.6*stock), 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(90,60,20,0.5)'; ctx.lineWidth = 0.5*S;
    for (let k = 0.45; k < 0.35 + 0.6*stock; k += 0.12) { ctx.beginPath(); ctx.arc(sx, sy, r*k, 0, Math.PI*2); ctx.stroke(); }
    ctx.fillStyle = '#1a181e'; ctx.beginPath(); ctx.arc(sx, sy, r*0.3, 0, Math.PI*2); ctx.fill();
  }

  // ── Transformer and capacitor yard ──
  {
    const yx = X(2.5), yy = Y(5.6), yw = X(4.55) - yx, yh = Y(7.55) - yy;
    ctx.fillStyle = 'rgba(60,64,60,0.4)'; ctx.fillRect(yx, yy, yw, yh);
    ctx.strokeStyle = 'rgba(190,196,200,0.85)'; ctx.lineWidth = 0.9*S; ctx.setLineDash([2*S, 1.4*S]); ctx.strokeRect(yx, yy, yw, yh); ctx.setLineDash([]);
    // transformer: tank, radiator fins, three bushings
    const tx = yx + yw*0.12, ty = yy + yh*0.1, tw = yw*0.5, th = yh*0.45;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(tx + 3*S, ty + 4*S, tw, th);
    ctx.fillStyle = '#6a7a6a'; ctx.fillRect(tx, ty, tw, th);
    ctx.fillStyle = '#4a5a4a'; for (let k = 0; k < 6; k++) ctx.fillRect(tx + tw + 1*S, ty + 2*S + k*(th - 4*S)/6, 4*S, (th - 4*S)/6 - 1*S);
    for (let k = 0; k < 3; k++) { const bx = tx + tw*(0.22 + k*0.28), by = ty + th*0.35; ctx.fillStyle = '#c8b090'; ctx.beginPath(); ctx.arc(bx, by, 2.2*S, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = '#5a3a20'; ctx.beginPath(); ctx.arc(bx, by, 0.9*S, 0, Math.PI*2); ctx.fill(); }
    // capacitor racks
    for (let k = 0; k < 4; k++) {
      const rx = yx + yw*0.1 + k*yw*0.21, ry = yy + yh*0.64;
      ctx.fillStyle = '#3a4048'; ctx.fillRect(rx, ry, yw*0.17, yh*0.3);
      ctx.fillStyle = charging ? `rgba(120,200,255,${(0.5 + 0.4*Math.sin(t*4 + k)).toFixed(3)})` : '#1e242a';
      ctx.fillRect(rx + 1*S, ry + yh*0.18, yw*0.17 - 2*S, yh*0.08);
    }
    _fcDiamond(yx + yw - 5*S, yy + 5*S, 7*S, '#d8a020', '⚡');
  }

  // ── Cryo dewar ──
  _fcVTank(X(5.0), Y(6.15), Math.min(U, V)*0.62, S, { shell: ['#ffffff', '#cdd8e2', '#6a7888'], band: '#3a60a8', ladderAngle: 2.4 });

  // ── Drone pad ──
  {
    const dx = X(7.2), dy = Y(6.35), r = Math.min(U*1.15, V*1.15);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(dx + 3*S, dy + 4*S, r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#3a3e44'; ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#e8e4d8'; ctx.lineWidth = 1.4*S; ctx.beginPath(); ctx.arc(dx, dy, r*0.78, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = '#e8e4d8'; ctx.font = `bold ${Math.max(6, r*0.75)}px Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', dx, dy + r*0.04);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    for (let k = 0; k < 8; k++) {
      const a = k*Math.PI/4, lit = on && ((Math.floor(t*4) + k) % 8 < 2);
      ctx.fillStyle = lit ? '#7fffb0' : on ? '#2a7a50' : '#2a3a30';
      ctx.beginPath(); ctx.arc(dx + Math.cos(a)*r*0.93, dy + Math.sin(a)*r*0.93, 1.4*S, 0, Math.PI*2); ctx.fill();
    }
  }

  // ── Truck dock ──
  {
    const kx = X(9.0), ky = Y(5.5), kw = X(11.6) - kx, kh = Y(7.45) - ky;
    ctx.fillStyle = '#2e3238'; ctx.fillRect(kx, ky, kw, kh);
    _wfHazardStripe(kx, ky, kw, 3*S, S);
    ctx.strokeStyle = 'rgba(240,240,230,0.7)'; ctx.lineWidth = 1*S;
    for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(kx + kw*k/3, ky + 4*S); ctx.lineTo(kx + kw*k/3, ky + kh); ctx.stroke(); }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (let k = 0; k < 3; k++) ctx.fillRect(kx + kw*(k + 0.5)/3 - 2.5*S, ky + 3*S, 5*S, 2.5*S);   // dock levellers
    ctx.font = `bold ${Math.max(5, 4.5*S)}px Courier New`; ctx.textAlign = 'center';
    ctx.fillStyle = on ? accent : '#4a5a68';
    ctx.fillText('CORE DOCK', kx + kw/2, ky + kh - 3*S);
    ctx.textAlign = 'left';
  }

  // ── Port (bottom face): TAPE IN col+1 ──
  const P = _fcPorts(px, py, h, S, t), TH = TILE/2;
  P.belt(px + TILE*1 + TH, 'TAPE IN', !!e._hasTape, true, on, '#c8a060', '#e0c080');

  _wfPlate('CORE WORKS', px + w*0.50, py + h*0.04, S, accent, on);
  _wfLamp(px + w - 9*S, py + 9*S, S, t, charging ? '#9fd8ff' : accent, on);
  ctx.restore();
}

// The Field Core rack on a fusion reactor's pad (FieldCoreSystem): three
// slot sockets and the outgoing bay, along a strip `len` long and `thick`
// deep at (x, y) in whatever frame is current; `vertical` runs it down the
// strip instead of across. Cores are seen end-on: a steel cartridge with a
// bore that glows cyan while it has charge, a ring round the socket for
// the charge left (amber at or below the swap mark), and a dead bore once
// spent (rust red if quenched). A slot the player has switched off is
// capped. The outgoing bay sits behind hazard stripes. Draws nothing for a
// reactor that has never been set for cores; returns whether it drew.
function renderFieldCoreRack(e, x, y, len, thick, vertical, S, t) {
  if (typeof FieldCoreSystem === 'undefined' || !e) return false;
  const F = FieldCoreSystem;
  const list = Array.isArray(e._cores) ? e._cores : [];
  const want = F.wanted(e);
  if (!want && !list.length && !e._coreOut) return false;
  const gen = !!e._generating;
  const TAU = Math.PI * 2;
  ctx.save();
  if (vertical) { ctx.translate(x + thick, y); ctx.rotate(Math.PI / 2); }
  else ctx.translate(x, y);

  _wfShadow(0, 0, len, thick, S, 4*S);
  ctx.fillStyle = '#2a3038'; ctx.strokeStyle = '#0e1216'; ctx.lineWidth = 1.5*S;
  ctx.beginPath(); ctx.roundRect(0, 0, len, thick, 4*S); ctx.fill(); ctx.stroke();

  const my = thick / 2;
  const r = Math.min(thick * 0.36, len * 0.075);
  const bayX = len * 0.84;
  // The outgoing bay: hazard-striped well behind its own socket.
  const bw = Math.min(thick * 0.92, len * 0.22);
  _wfHazardStripe(bayX - bw / 2, my - thick * 0.46, bw, thick * 0.92, S);
  ctx.strokeStyle = '#0e1216'; ctx.lineWidth = 2*S;
  ctx.beginPath(); ctx.moveTo(len * 0.69, thick * 0.12); ctx.lineTo(len * 0.69, thick * 0.88); ctx.stroke();

  const disc = (cx0, cy0, rr) => { ctx.beginPath(); ctx.arc(cx0, cy0, rr, 0, TAU); };
  const bolts = (sx, n, rr, br, a0 = 0) => {         // hex-head bolts on a ring
    for (let q = 0; q < n; q++) {
      const a = a0 + q * TAU / n, bx = sx + Math.cos(a) * rr, by = my + Math.sin(a) * rr;
      ctx.fillStyle = '#1a1e24'; disc(bx, by + 0.4*S, br); ctx.fill();
      const bg = ctx.createRadialGradient(bx - br * 0.4, by - br * 0.4, 0, bx, by, br);
      bg.addColorStop(0, '#b8c2cc'); bg.addColorStop(1, '#4a545e');
      ctx.fillStyle = bg; disc(bx, by, br * 0.85); ctx.fill();
    }
  };
  const socket = (sx, core, open) => {
    // The well: a bevelled steel ring sunk into the deck, latched by six
    // clamps, with a status lamp at its foot.
    const rim = ctx.createLinearGradient(sx, my - r * 1.12, sx, my + r * 1.12);
    rim.addColorStop(0, '#6c7884'); rim.addColorStop(0.5, '#3a434c'); rim.addColorStop(1, '#1c2228');
    ctx.fillStyle = rim; disc(sx, my, r * 1.12); ctx.fill();
    ctx.strokeStyle = '#0a0d10'; ctx.lineWidth = 1.2*S; ctx.stroke();
    const well = ctx.createRadialGradient(sx, my - r * 0.25, r * 0.2, sx, my, r);
    well.addColorStop(0, '#161b21'); well.addColorStop(1, '#05070a');
    ctx.fillStyle = well; disc(sx, my, r); ctx.fill();
    ctx.strokeStyle = 'rgba(160,175,190,0.35)'; ctx.lineWidth = 0.8*S;
    ctx.beginPath(); ctx.arc(sx, my, r * 0.98, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();   // lower lip catches light
    for (let q = 0; q < 6; q++) {                     // clamp latches
      const a = q * TAU / 6 + TAU / 12;
      ctx.save(); ctx.translate(sx + Math.cos(a) * r * 1.06, my + Math.sin(a) * r * 1.06); ctx.rotate(a);
      ctx.fillStyle = core ? '#8a96a2' : '#4a545e';
      ctx.fillRect(-r * 0.1, -r * 0.07, r * 0.2, r * 0.14);
      ctx.restore();
    }
    const ch = core ? Math.max(0, Math.min(1, core.charge || 0)) : 0;
    const live = ch > 0;
    const low = live && ch <= (F.SWAP_AT || 0.25);
    const lamp = !core ? (open ? '#3a6a40' : '#3a3a3a') : live ? (low ? '#ffb040' : '#5ff0ff') : core.quenched ? '#ff5030' : '#806040';
    const lx = sx + r * 1.12, ly = my + r * 1.12;   // clear of the charge gauge
    ctx.fillStyle = '#0a0d10'; disc(lx, ly, r * 0.13); ctx.fill();
    ctx.fillStyle = lamp; disc(lx, ly, r * 0.09); ctx.fill();
    if (core && (live || core.quenched)) {
      const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 0.3);
      lg.addColorStop(0, lamp); lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.5; ctx.fillStyle = lg; disc(lx, ly, r * 0.3); ctx.fill(); ctx.globalAlpha = 1;
    }

    if (!core) {
      if (!open) {                                  // switched off: a bolted blanking cap
        const cg = ctx.createRadialGradient(sx - r * 0.3, my - r * 0.3, r * 0.1, sx, my, r * 0.86);
        cg.addColorStop(0, '#5a646e'); cg.addColorStop(1, '#2a3038');
        ctx.fillStyle = cg; disc(sx, my, r * 0.86); ctx.fill();
        ctx.strokeStyle = '#14181d'; ctx.lineWidth = S; ctx.stroke();
        ctx.save(); disc(sx, my, r * 0.62); ctx.clip();
        ctx.fillStyle = '#c8a030'; ctx.fillRect(sx - r, my - r * 0.14, r * 2, r * 0.28);
        ctx.fillStyle = '#1a1e24';
        for (let q = -3; q <= 3; q++) {
          ctx.beginPath(); ctx.moveTo(sx + q * r * 0.24, my - r * 0.14); ctx.lineTo(sx + q * r * 0.24 + r * 0.12, my - r * 0.14);
          ctx.lineTo(sx + q * r * 0.24, my + r * 0.14); ctx.lineTo(sx + q * r * 0.24 - r * 0.12, my + r * 0.14); ctx.fill();
        }
        ctx.restore();
        bolts(sx, 4, r * 0.73, r * 0.08, TAU / 8);
      } else {                                      // open and waiting: contact pins and a guide ring
        ctx.strokeStyle = 'rgba(95,240,255,0.18)'; ctx.lineWidth = 0.8*S;
        ctx.setLineDash([2*S, 2*S]); disc(sx, my, r * 0.7); ctx.stroke(); ctx.setLineDash([]);
        for (let q = 0; q < 3; q++) {
          const a = -Math.PI / 2 + q * TAU / 3, px = sx + Math.cos(a) * r * 0.42, py = my + Math.sin(a) * r * 0.42;
          ctx.fillStyle = '#7a6030'; disc(px, py, r * 0.09); ctx.fill();
          ctx.fillStyle = '#d8b060'; disc(px - r * 0.02, py - r * 0.02, r * 0.045); ctx.fill();
        }
        ctx.fillStyle = '#20262d'; disc(sx, my, r * 0.16); ctx.fill();
      }
      return;
    }

    if (live && gen) {                               // field bloom round a live core
      const gl = ctx.createRadialGradient(sx, my, r * 0.3, sx, my, r * 1.7);
      gl.addColorStop(0, `rgba(95,240,255,${(0.28 + 0.15 * Math.sin(t * 4 + sx)).toFixed(3)})`);
      gl.addColorStop(1, 'rgba(95,240,255,0)');
      ctx.fillStyle = gl; disc(sx, my, r * 1.7); ctx.fill();
    }
    // Cartridge collar: machined steel with a knurled edge.
    const g = ctx.createRadialGradient(sx - r * 0.35, my - r * 0.35, r * 0.05, sx, my, r * 0.86);
    g.addColorStop(0, '#e2e8ee'); g.addColorStop(0.55, '#8c98a4'); g.addColorStop(1, '#46515c');
    ctx.fillStyle = g; disc(sx, my, r * 0.86); ctx.fill();
    ctx.strokeStyle = '#14181d'; ctx.lineWidth = S; ctx.stroke();
    ctx.strokeStyle = 'rgba(20,24,29,0.55)'; ctx.lineWidth = 0.7*S;
    for (let q = 0; q < 28; q++) {
      const a = q * TAU / 28;
      ctx.beginPath(); ctx.moveTo(sx + Math.cos(a) * r * 0.78, my + Math.sin(a) * r * 0.78);
      ctx.lineTo(sx + Math.cos(a) * r * 0.86, my + Math.sin(a) * r * 0.86); ctx.stroke();
    }
    bolts(sx, 6, r * 0.68, r * 0.06);
    // HTS tape windings: copper and silver bands round the bore.
    const bands = [['#8a5a30', 0.6], ['#c0c8d0', 0.54], ['#a86c38', 0.49], ['#d0d6dc', 0.44]];
    for (const [c, f] of bands) { ctx.fillStyle = c; disc(sx, my, r * f); ctx.fill(); }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.5*S;
    for (const [, f] of bands) { disc(sx, my, r * f); ctx.stroke(); }
    // The bore.
    const br = r * 0.39;
    ctx.fillStyle = '#05080b'; disc(sx, my, br); ctx.fill();
    if (live) {
      const a = 0.55 + 0.45 * ch, pulse = gen ? 0.85 + 0.15 * Math.sin(t * 6 + sx) : 0.75;
      const bg = ctx.createRadialGradient(sx, my, 0, sx, my, br);
      bg.addColorStop(0, `rgba(245,255,255,${(a * pulse).toFixed(3)})`);
      bg.addColorStop(0.35, `rgba(140,248,255,${(a * pulse).toFixed(3)})`);
      bg.addColorStop(0.8, `rgba(40,170,220,${(a * 0.8).toFixed(3)})`);
      bg.addColorStop(1, 'rgba(10,60,90,0.9)');
      ctx.fillStyle = bg; disc(sx, my, br); ctx.fill();
      // Trapped field: arcs swirling inside the bore, faster while generating.
      ctx.save(); disc(sx, my, br); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      const spin = t * (gen ? 2.4 : 0.6);
      ctx.strokeStyle = `rgba(220,255,255,${(0.55 * a).toFixed(3)})`; ctx.lineWidth = 0.9*S;
      for (let q = 0; q < 3; q++) {
        const a0 = spin * (q % 2 ? -1 : 1) + q * TAU / 3, rr = br * (0.45 + q * 0.17);
        ctx.beginPath(); ctx.arc(sx, my, rr, a0, a0 + Math.PI * 0.9); ctx.stroke();
      }
      ctx.restore();
    } else {
      ctx.fillStyle = core.quenched ? '#5a2014' : '#2a2418'; disc(sx, my, br * 0.92); ctx.fill();
      ctx.fillStyle = core.quenched ? 'rgba(200,80,40,0.5)' : 'rgba(120,100,70,0.35)';
      disc(sx - br * 0.2, my - br * 0.2, br * 0.35); ctx.fill();
      if (core.quenched) {                           // quench crack across the bore and windings
        ctx.strokeStyle = '#ff7040'; ctx.lineWidth = 0.9*S;
        ctx.beginPath(); ctx.moveTo(sx - r * 0.5, my - r * 0.18); ctx.lineTo(sx - r * 0.12, my + r * 0.05);
        ctx.lineTo(sx + r * 0.08, my - r * 0.12); ctx.lineTo(sx + r * 0.48, my + r * 0.2); ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.8*S; disc(sx, my, br); ctx.stroke();
    // Specular glint on the collar.
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.1*S;
    ctx.beginPath(); ctx.arc(sx, my, r * 0.8, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
    if (live) {                                      // charge left: a segmented gauge round the well
      const segs = 20, lit = Math.ceil(ch * segs - 1e-6);
      const col = low ? '#ffb040' : '#5ff0ff';
      ctx.lineWidth = 2.2*S;
      for (let q = 0; q < segs; q++) {
        const a0 = -Math.PI / 2 + q * TAU / segs + 0.04, a1 = a0 + TAU / segs - 0.08;
        ctx.strokeStyle = q < lit ? col : 'rgba(95,110,125,0.35)';
        ctx.beginPath(); ctx.arc(sx, my, r * 1.22, a0, a1); ctx.stroke();
      }
    }
    if (core.id && r > 7 * S) {                     // the core's serial, stencilled on the collar
      ctx.font = `bold ${Math.max(4, r * 0.17)}px Courier New`; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(20,24,29,0.85)';
      ctx.fillText(core.id, sx, my + r * 0.76);
      ctx.textAlign = 'left';
    }
  };
  for (let i = 0; i < (F.MAX_SLOTS || 3); i++) socket(len * (0.12 + i * 0.2), list[i], i < want);
  socket(bayX, e._coreOut, true);
  ctx.restore();
  // Socket centres in the caller's frame, for renderFieldCoreAura's conduits.
  e._fcSock = [];
  for (let i = 0; i < (F.MAX_SLOTS || 3); i++) {
    const u = len * (0.12 + i * 0.2);
    e._fcSock.push(vertical ? [x + thick - my, y + u] : [x + u, y + my]);
  }
  return true;
}

// The Field Cores' field on the machine itself (FieldCoreSystem), drawn over
// the plasma in the same frame as renderFieldCoreRack. Each live core adds a
// layer, so a full rack reads at a glance:
//   1 core  — a cyan confinement sheath hugging the plasma, and a conduit
//             of charge pulsing from its socket into the cryostat
//   2 cores — a second, counter-rotating sheath inside and field nodes
//             orbiting between them
//   3 cores — an overcharged corona round the cryostat, arcs leaping from
//             the sheath to the rim, and a brighter, faster everything
// A core going in (live count rising) sets off a burst: a flash on the
// plasma and shockwaves rolling out past the pad, bigger for each core.
// `outline(sign, extra)` begins a path round the plasma's outer (sign 1) or
// inner (sign -1) edge pushed `extra` further out; R is the cryostat radius.
function renderFieldCoreAura(e, cx, cy, R, outline, S, k, t) {
  if (typeof FieldCoreSystem === 'undefined' || !e || !Array.isArray(e._cores)) return;
  const n = Math.min(3, e._cores.filter(c => (c.charge || 0) > 0).length);
  const now = performance.now() / 1000;
  // Burst trigger: render-side only, so a load or a ghost never fires it.
  if (e._fcFxLive === undefined) e._fcFxLive = n;
  else if (n > e._fcFxLive) { e._fcFxT = now; e._fcFxN = n; e._fcFxLive = n; }
  else if (n < e._fcFxLive) e._fcFxLive = n;
  const burstLen = 1.4 + 0.5 * (e._fcFxN || 1);
  const bp = e._fcFxT !== undefined ? (now - e._fcFxT) / burstLen : 1;
  const bursting = bp >= 0 && bp < 1;
  if (!n && !bursting) return;
  const gen = !!e._generating;
  const TAU = Math.PI * 2;
  const kk = Math.min(k, 3);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  if (n) {
    const lv = gen ? 1 : 0.35;                     // idle: a faint standing field
    const sp = gen ? 1 + 0.35 * (n - 1) : 0.4;     // more cores, faster field
    // ── Sheath 1: outer confinement layer ──
    ctx.strokeStyle = `rgba(95,240,255,${(lv * (0.26 + 0.08 * n + 0.06 * Math.sin(t * 3))).toFixed(3)})`;
    ctx.lineWidth = (8 + 4 * n) * S * kk;
    outline(1, 8 * S * kk); ctx.stroke();
    ctx.strokeStyle = `rgba(200,255,255,${(lv * 0.9).toFixed(3)})`; ctx.lineWidth = 2.4 * S * kk;
    ctx.setLineDash([14 * S * kk, 9 * S * kk]); ctx.lineDashOffset = -t * 60 * sp * S;
    outline(1, 8 * S * kk); ctx.stroke();
    // ── Sheath 2: inner, counter-rotating ──
    if (n >= 2) {
      ctx.strokeStyle = `rgba(95,240,255,${(lv * (0.22 + 0.07 * n + 0.06 * Math.sin(t * 3.4 + 1))).toFixed(3)})`;
      ctx.lineWidth = (5 + 2.5 * n) * S * kk;
      ctx.setLineDash([]); outline(-1, 6 * S * kk); ctx.stroke();
      ctx.strokeStyle = `rgba(200,255,255,${(lv * 0.85).toFixed(3)})`; ctx.lineWidth = 2 * S * kk;
      ctx.setLineDash([10 * S * kk, 12 * S * kk]); ctx.lineDashOffset = t * 70 * sp * S;
      outline(-1, 6 * S * kk); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    // ── Field nodes orbiting just outside the outer sheath ──
    if (n >= 2 && gen) {
      const nodes = n * 3, rr = R * 0.9;
      for (let q = 0; q < nodes; q++) {
        const a = t * 0.45 * sp * (q % 2 ? -1 : 1) + q * TAU / nodes;
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr, r = (4 + n) * S * kk;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
        g.addColorStop(0, 'rgba(230,255,255,0.9)'); g.addColorStop(0.35, 'rgba(95,240,255,0.45)'); g.addColorStop(1, 'rgba(95,240,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, TAU); ctx.fill();
      }
    }
    // ── Corona: the overcharged third core ──
    if (n >= 3 && gen) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4.2);
      const cg = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.28);
      cg.addColorStop(0, `rgba(120,245,255,${(0.32 + 0.18 * pulse).toFixed(3)})`);
      cg.addColorStop(0.4, `rgba(80,200,255,${(0.12 + 0.08 * pulse).toFixed(3)})`);
      cg.addColorStop(1, 'rgba(60,160,255,0)');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, R * 1.28, 0, TAU); ctx.arc(cx, cy, R * 0.92, 0, TAU, true); ctx.fill();
      // arcs leaping from the sheath out past the rim
      for (let i = 0; i < 5; i++) {
        const seed = Math.floor(t * 11 + i * 53);
        if (seed % 2) continue;
        const rnd = (j) => { const x = Math.sin(seed * 12.9898 + j * 78.233) * 43758.5453; return x - Math.floor(x); };
        const a0 = rnd(1) * TAU, a1 = a0 + (rnd(2) - 0.5) * 0.4;
        const r0 = R * 0.78, r1 = R * (1.05 + rnd(3) * 0.12);
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0);
        for (let s = 1; s <= 5; s++) {
          const f = s / 5, a = a0 + (a1 - a0) * f, rr = r0 + (r1 - r0) * f;
          const j = s < 5 ? (rnd(4 + s) - 0.5) * 16 * S * kk : 0;
          ctx.lineTo(cx + Math.cos(a) * rr + j, cy + Math.sin(a) * rr - j);
        }
        ctx.strokeStyle = 'rgba(95,240,255,0.4)'; ctx.lineWidth = 6 * S; ctx.stroke();
        ctx.strokeStyle = 'rgba(235,255,255,0.95)'; ctx.lineWidth = 1.6 * S; ctx.stroke();
      }
    }
    // ── Conduits: charge pulsing from each live socket into the cryostat ──
    if (gen && Array.isArray(e._fcSock)) {
      for (let i = 0; i < Math.min(e._fcSock.length, e._cores.length); i++) {
        if (!((e._cores[i].charge || 0) > 0)) continue;
        const [sx, sy] = e._fcSock[i];
        const an = Math.atan2(sy - cy, sx - cx), ex = cx + Math.cos(an) * R * 0.97, ey = cy + Math.sin(an) * R * 0.97;
        ctx.strokeStyle = 'rgba(95,240,255,0.25)'; ctx.lineWidth = 5 * S;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.fillStyle = 'rgba(220,255,255,0.95)';
        for (let q = 0; q < 3; q++) {
          const p = (t * 1.2 * sp + q / 3 + i * 0.17) % 1;
          ctx.beginPath(); ctx.arc(sx + (ex - sx) * p, sy + (ey - sy) * p, 2.2 * S, 0, TAU); ctx.fill();
        }
      }
    }
  }

  // ── Install burst ──
  if (bursting) {
    const N = e._fcFxN || 1;
    // flash on the plasma, fading fast
    const fa = Math.max(0, 1 - bp * 3) * (0.22 + 0.1 * N);
    if (fa > 0) {
      ctx.strokeStyle = `rgba(235,255,255,${fa.toFixed(3)})`; ctx.lineWidth = (14 + 8 * N) * S * kk;
      outline(1, 0); ctx.stroke();
      const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (1 + 0.15 * N));
      fg.addColorStop(0, `rgba(180,250,255,${(fa * 0.35).toFixed(3)})`); fg.addColorStop(1, 'rgba(95,240,255,0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(cx, cy, R * (1 + 0.15 * N), 0, TAU); ctx.fill();
    }
    // shockwaves: one per core installed, staggered, reaching further each
    for (let q = 0; q < N; q++) {
      const p = (bp - q * 0.12) / (1 - q * 0.12);
      if (p <= 0 || p >= 1) continue;
      const reach = R * (1.15 + 0.35 * N);
      const r = R * 0.5 + p * (reach - R * 0.5);
      const al = (1 - p) * (1 - p) * (0.45 + 0.12 * N);
      ctx.strokeStyle = `rgba(120,245,255,${al.toFixed(3)})`; ctx.lineWidth = (12 - 9 * p) * (1 + 0.3 * N) * S * kk;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(240,255,255,${(al * 0.9).toFixed(3)})`; ctx.lineWidth = 2 * S * kk;
      ctx.stroke();
    }
    // radial sparks thrown off at the full rack
    if (N >= 3 && bp < 0.6) {
      const sp = bp / 0.6;
      for (let q = 0; q < 24; q++) {
        const a = q * TAU / 24 + Math.sin(q * 7.3) * 0.1;
        const r0 = R * (0.9 + sp * 0.5), r1 = r0 + R * 0.12 * (1 - sp);
        ctx.strokeStyle = `rgba(230,255,255,${(0.9 * (1 - sp)).toFixed(3)})`; ctx.lineWidth = 2 * S * kk;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke();
      }
    }
  }
  ctx.restore();
}
