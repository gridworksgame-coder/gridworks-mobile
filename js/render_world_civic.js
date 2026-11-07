/* ═══════════════════════════════════════════════════════════════════
   RENDER: WORLD & CIVIC
   Research stations (MK1-3), government buildings, parks, roads,
   cell/fiber towers, water tiles, bushes, and trees.
   ═══════════════════════════════════════════════════════════════════ */

/* ── Research station family ─────────────────────────────────────────
   MK1 → MK4 are built from one kit so they read as a lineage, each rank
   keeping the last one's signature piece and adding its own:
     MK1  field observatory   — the dome with its turning slit
     MK2  radio lab           — + a tracking dish and a lattice mast
     MK3  accelerator campus  — + a particle ring with orbiting bunches
     MK4  fusion lab          — + a plasma core in turning coils, arcing
                                  Tesla pylons (renderMk4Research)
   Shared by all four: the chamfered pad with one rank pip per MK, the
   progress ring round the dome (toward the closest unlock), the MK plate,
   and an accent that steps from violet to magenta with rank. Drawn in
   pixel space off px/py, so strokes keep the same weight at every size.
   Plain fills and strokes; motion detail is skipped when zoomed out. */
const RSK = {
  slab: '#1c1828', slabHi: '#241e34', metal: '#9a96ac', metalOff: '#5a566a',
  metalDk: '#4c4860', roof: '#3a3450', wall: '#2c2740', dim: '#3a2a5a', copper: '#c07840',
};

// Progress toward the closest unlock, worked out once per frame and shared
// by every station on screen instead of re-scanned by each one.
let _rsProgT = null, _rsProg = null;
function _rsClosestProgress(t) {
  if (t === _rsProgT) return _rsProg;
  _rsProgT = t;
  let best = null;
  for (const type of Progression.getLockedTypes()) {
    const p = Progression.progressFor(type);
    if (p < 1 && (best === null || p > best)) best = p;
  }
  return (_rsProg = best);
}

function _rsOct(x0, y0, x1, y1, c) {
  ctx.beginPath();
  ctx.moveTo(x0 + c, y0); ctx.lineTo(x1 - c, y0); ctx.lineTo(x1, y0 + c); ctx.lineTo(x1, y1 - c);
  ctx.lineTo(x1 - c, y1); ctx.lineTo(x0 + c, y1); ctx.lineTo(x0, y1 - c); ctx.lineTo(x0, y0 + c);
  ctx.closePath();
}

// Chamfered pad with deck plates, breathing accent trim and rank pips.
function _rsPad(px, py, W, inset, c, mk, accent, on, t) {
  const x0 = px + inset, y0 = py + inset, x1 = px + W - inset, y1 = py + W - inset;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; _rsOct(x0 + 2, y0 + 2, x1 + 2, y1 + 2, c); ctx.fill();
  ctx.fillStyle = RSK.slab;           _rsOct(x0, y0, x1, y1, c); ctx.fill();
  ctx.fillStyle = RSK.slabHi;         _rsOct(x0 + 3, y0 + 3, x1 - 3, y1 - 3, Math.max(1, c - 1.2)); ctx.fill();
  if (Camera.zoom > 0.5 && W > TILE) {
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.6; ctx.beginPath();
    for (let k = x0 + 20; k < x1 - 4; k += 20) { ctx.moveTo(k, y0 + 3); ctx.lineTo(k, y1 - 3); }
    for (let k = y0 + 20; k < y1 - 4; k += 20) { ctx.moveTo(x0 + 3, k); ctx.lineTo(x1 - 3, k); }
    ctx.stroke();
  }
  ctx.globalAlpha = on ? 0.55 + 0.3*Math.sin(t*2) : 1;
  ctx.strokeStyle = on ? accent : '#2a2238'; ctx.lineWidth = 1.5;
  _rsOct(x0, y0, x1, y1, c); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = on ? accent : RSK.dim;
  for (let i = 0; i < mk; i++) ctx.fillRect(x0 + c + 1 + i*4, y1 - 3.2, 2.5, 1.8);
}

// The observatory dome every rank carries, its slit turning while powered.
function _rsDome(x, y, r, accent, on, t, phase) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(x + 1.5, y + 1.5, r + 1, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = RSK.metalDk;         ctx.beginPath(); ctx.arc(x, y, r + 1, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = on ? RSK.metal : RSK.metalOff; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.arc(x - r*0.3, y - r*0.3, r*0.45, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(x, y, r*0.62, 0, Math.PI*2); ctx.stroke();
  const a = on ? t*0.4 + phase : phase;
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = on ? '#120a1e' : '#1a1622'; ctx.fillRect(-r*0.18, -r, r*0.36, r);
  if (on) {
    ctx.globalAlpha = 0.55 + 0.25*Math.sin(t*3 + phase);
    ctx.fillStyle = accent; ctx.fillRect(-r*0.08, -r*0.9, r*0.16, r*0.8);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = on ? '#d8d4e4' : '#6a667a'; ctx.fillRect(-r*0.1, -r*1.12, r*0.2, r*0.3);   // telescope tip
  ctx.restore();
}

function _rsProgressRing(x, y, r, accent, on, t, lw) {
  const p = on ? _rsClosestProgress(t) : null;
  if (p === null) return;
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = lw + 1;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.stroke();
  ctx.globalAlpha = 0.6 + 0.25*Math.sin(t*2);
  ctx.strokeStyle = accent; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.arc(x, y, r, -Math.PI/2, -Math.PI/2 + p*Math.PI*2); ctx.stroke();
  ctx.globalAlpha = 1;
}

// Tracking dish on a turret (MK2+), sweeping slowly and pinging off the feed.
function _rsDish(x, y, r, accent, on, t, phase) {
  ctx.fillStyle = RSK.metalDk; ctx.beginPath(); ctx.arc(x, y, r*0.55, 0, Math.PI*2); ctx.fill();
  const aim = phase + (on ? Math.sin(t*0.3 + phase)*0.6 : 0);
  ctx.save(); ctx.translate(x, y); ctx.rotate(aim);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(1.5, 1.5, r, r*0.68, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = on ? '#e4e0ee' : '#6a667a'; ctx.beginPath(); ctx.ellipse(0, 0, r, r*0.68, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = on ? '#bdb8cc' : '#55516a'; ctx.beginPath(); ctx.ellipse(-r*0.12, 0, r*0.66, r*0.44, 0, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = on ? '#8a8698' : '#3e3a4e'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-r*0.1, -r*0.55); ctx.lineTo(r*0.85, 0); ctx.lineTo(-r*0.1, r*0.55); ctx.stroke();
  ctx.fillStyle = on ? accent : RSK.dim; ctx.beginPath(); ctx.arc(r*0.85, 0, Math.max(1.5, r*0.12), 0, Math.PI*2); ctx.fill();
  ctx.restore();
  if (on && Camera.zoom > 0.5) {
    const fx = x + Math.cos(aim)*r*0.85, fy = y + Math.sin(aim)*r*0.85;
    ctx.strokeStyle = accent; ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      const ph = (t*1.2 + i*0.5 + phase) % 1;
      ctx.globalAlpha = (1 - ph)*0.45;
      ctx.beginPath(); ctx.arc(fx, fy, 2 + ph*r*0.9, 0, Math.PI*2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// Antenna mast: a plain whip (MK1) or a braced lattice (MK2+), pinging.
function _rsMast(x, yBase, yTop, lattice, accent, on, t) {
  ctx.strokeStyle = on ? '#8a8698' : '#3e3a4e'; ctx.lineWidth = 1;
  ctx.beginPath();
  if (lattice) {
    const hw = 3, n = Math.max(2, Math.floor((yBase - yTop) / 4));
    ctx.moveTo(x - hw, yBase); ctx.lineTo(x, yTop); ctx.lineTo(x + hw, yBase);
    for (let k = 0; k <= n; k++) {
      const yy = yBase - (yBase - yTop)*k/n, w = hw*(1 - k/n);
      if (k === 0) ctx.moveTo(x - w, yy); else ctx.lineTo(x + (k % 2 ? w : -w), yy);
    }
  } else {
    ctx.moveTo(x, yBase); ctx.lineTo(x, yTop);
  }
  ctx.stroke();
  ctx.fillStyle = RSK.metalDk; ctx.fillRect(x - 2, yBase - 1, 4, 2);
  if (on && Camera.zoom > 0.5) {
    ctx.strokeStyle = accent; ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      const ph = (t*1.4 + i*0.5) % 1;
      ctx.globalAlpha = (1 - ph)*0.5;
      ctx.beginPath(); ctx.arc(x, yTop, 1.5 + ph*8, 0, Math.PI*2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = on ? (Math.sin(t*4) > 0 ? '#ff5a4a' : '#6a2018') : '#2a1a1a';
  ctx.beginPath(); ctx.arc(x, yTop, 1.4, 0, Math.PI*2); ctx.fill();
}

// Particle accelerator ring (MK3+): beam pipe in a magnet housing, every
// fourth magnet lit, with bunches orbiting while powered.
function _rsRing(x, y, R, accent, on, t, bunches, speed) {
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(x + 2, y + 2, R, 0, Math.PI*2); ctx.stroke();
  ctx.strokeStyle = RSK.roof;           ctx.lineWidth = 9;  ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI*2); ctx.stroke();
  ctx.strokeStyle = RSK.metalDk;        ctx.lineWidth = 5;  ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI*2); ctx.stroke();
  const n = Math.round(R / 3.2), hw = 2.5 / R;
  ctx.lineWidth = 7;
  for (let i = 0; i < n; i++) {
    const a = i/n*Math.PI*2;
    ctx.strokeStyle = i % 4 === 0 ? (on ? accent : RSK.dim) : (on ? '#6a6488' : '#3a3648');
    ctx.beginPath(); ctx.arc(x, y, R, a - hw, a + hw); ctx.stroke();
  }
  if (!on) return;
  ctx.globalAlpha = 0.35 + 0.15*Math.sin(t*4);
  ctx.strokeStyle = accent; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI*2); ctx.stroke();
  for (let b = 0; b < bunches; b++) {
    const a = t*speed + b*Math.PI*2/bunches;
    ctx.globalAlpha = 0.7; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, R, a - 0.5, a); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x + Math.cos(a)*R, y + Math.sin(a)*R, 2, 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Cryo tanks (MK3+): two frosted cylinders from above, venting cold.
function _rsTanks(x, y, r, on, t, accent) {
  for (let k = 0; k < 2; k++) {
    const tx = x + k*(r*2 + 3);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(tx + 1.5, y + 1.5, r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = on ? '#d4dae6' : RSK.metalOff; ctx.beginPath(); ctx.arc(tx, y, r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = RSK.metalDk; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = on ? '#aeb6c8' : '#4a4658'; ctx.beginPath(); ctx.arc(tx, y, r*0.45, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = on ? accent : RSK.dim; ctx.fillRect(tx - 1, y - r - 0.5, 2, 2);
    if (on && Camera.zoom > 0.5) for (let q = 0; q < 3; q++) {
      const ph = (t*0.5 + q/3 + k*0.4) % 1;
      ctx.fillStyle = `rgba(230,240,255,${0.35*(1 - ph)})`;
      ctx.beginPath(); ctx.arc(tx + Math.sin(q*2 + t)*2, y - ph*r*1.4, 1.5 + ph*2.5, 0, Math.PI*2); ctx.fill();
    }
  }
}

function _rsLamp(x, y, r, col, on, t, phase) {
  ctx.fillStyle = on ? col : RSK.dim;
  ctx.globalAlpha = on ? 0.35 + 0.65*Math.max(0, Math.sin(t*3 + phase)) : 1;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
}

// Name plate: one chevron per rank, then MKn.
function _rsPlate(cx, y, mk, accent, on) {
  ctx.font = 'bold 6px monospace'; ctx.textAlign = 'left';
  const label = 'MK' + mk, tw = ctx.measureText(label).width, cw = mk*4.5, w = tw + cw + 7, x0 = cx - w/2;
  ctx.fillStyle = '#0c0a14'; ctx.fillRect(x0, y - 4.5, w, 9);
  ctx.strokeStyle = on ? accent : '#2a2238'; ctx.lineWidth = 0.8; ctx.strokeRect(x0, y - 4.5, w, 9);
  ctx.fillStyle = on ? accent : RSK.dim;
  for (let i = 0; i < mk; i++) {
    const bx = x0 + 3 + i*4.5;
    ctx.beginPath(); ctx.moveTo(bx, y + 2); ctx.lineTo(bx + 1.75, y - 2); ctx.lineTo(bx + 3.5, y + 2); ctx.closePath(); ctx.fill();
  }
  ctx.fillText(label, x0 + 4 + cw, y + 2.2);
}

function _rsSelection(e, px, py, W, accent, t) {
  if (!(InspectionPanel.isOpen() && InspectionPanel.target === e)) return;
  ctx.save();
  ctx.strokeStyle = accent; ctx.lineWidth = 2 / Camera.zoom;
  ctx.globalAlpha = 0.7 + 0.3*Math.sin(t*4);
  ctx.strokeRect(px + 1, py + 1, W - 2, W - 2);
  ctx.restore();
}

function renderResearch(e, px, py, t) {
    // MK1 — field observatory: a site hut under the family dome, a whip
    // antenna pinging, one rank pip, and the progress ring round the dome.
    // (The main loop draws MK1's selection outline.)
    const on = e.powered, A = '#b060ff', W = TILE;
    if (on && Camera.zoom > 0.5) drawGlowHalo(px + W/2, py + W/2, W*0.9, [[0, A], [1, 'transparent']], 0.2 + 0.08*Math.sin(t*3));
    _rsPad(px, py, W, 2, 6, 1, A, on, t);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px + 11, py + 12, 22, 23);
    ctx.fillStyle = RSK.roof; ctx.fillRect(px + 9, py + 10, 22, 17);
    ctx.fillStyle = RSK.wall; ctx.fillRect(px + 9, py + 27, 22, 6);
    ctx.fillStyle = on ? '#e8d0ff' : '#1a1622';
    ctx.fillRect(px + 11, py + 28.5, 4, 2.5); ctx.fillRect(px + 25, py + 28.5, 4, 2.5);
    ctx.fillStyle = on ? A : '#1a1622'; ctx.fillRect(px + 18, py + 28, 4, 5);
    _rsDome(px + 20, py + 18, 6.5, A, on, t, 0.4);
    _rsProgressRing(px + 20, py + 18, 9.5, A, on, t, 1.5);
    _rsMast(px + 6, py + 26, py + 8, false, A, on, t);
    _rsLamp(px + 33.5, py + 33.5, 1.4, A, on, t, 0);
  }

function renderResearch2(e, px, py, t) {
    // MK2 — radio lab: the MK1 dome moves up onto a proper lab block, joined
    // by a tracking dish on its turret, a lattice mast and a rooftop array.
    const on = e.powered, A = '#d090ff', W = TILE*2, fine = Camera.zoom > 0.5;
    if (on && fine) drawGlowHalo(px + W/2, py + W/2, TILE*1.5, [[0, A], [1, 'transparent']], 0.24 + 0.09*Math.sin(t*3));
    _rsPad(px, py, W, 3, 9, 2, A, on, t);

    // Solar array along the top edge
    ctx.lineWidth = 0.6;
    for (let k = 0; k < 3; k++) {
      const sx = px + 30 + k*12;
      ctx.fillStyle = on ? '#2a3a6a' : '#1c2030'; ctx.fillRect(sx, py + 9, 10, 12);
      ctx.strokeStyle = on ? '#6a7ab0' : '#2a3040'; ctx.strokeRect(sx, py + 9, 10, 12);
      ctx.beginPath(); ctx.moveTo(sx + 5, py + 9); ctx.lineTo(sx + 5, py + 21); ctx.moveTo(sx, py + 15); ctx.lineTo(sx + 10, py + 15); ctx.stroke();
    }

    // Lab block: parapet, roof vents, lit window band on the front wall
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px + 11, py + 28, 42, 37);
    ctx.fillStyle = RSK.metalDk; ctx.fillRect(px + 8, py + 25, 44, 30);
    ctx.fillStyle = RSK.roof;    ctx.fillRect(px + 10, py + 27, 40, 26);
    ctx.fillStyle = RSK.wall;    ctx.fillRect(px + 8, py + 55, 44, 8);
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = on && Math.sin(t*0.7 + k*1.9) > -0.6 ? '#e8d0ff' : '#1a1622';
      ctx.fillRect(px + 11 + k*7, py + 57, 4.5, 3);
    }
    ctx.fillStyle = on ? '#6a6488' : '#3a3648';
    ctx.fillRect(px + 13, py + 30, 5, 5); ctx.fillRect(px + 13, py + 45, 5, 5);
    _rsDome(px + 32, py + 40, 9, A, on, t, 1.1);
    _rsProgressRing(px + 32, py + 40, 12.5, A, on, t, 2);

    // Data conduit out to the dish turret
    ctx.fillStyle = RSK.metalDk; ctx.fillRect(px + 52, py + 43.5, 8, 3);
    if (on && fine) { ctx.fillStyle = A; ctx.fillRect(px + 52 + ((t*1.5) % 1)*6, py + 44, 2, 2); }
    _rsDish(px + 63, py + 45, 12, A, on, t, 2.4);
    _rsMast(px + 16, py + 22, py + 8, true, A, on, t);

    _rsLamp(px + 72, py + 69, 1.8, A, on, t, 0);
    _rsPlate(px + 40, py + 69, 2, A, on);
    _rsSelection(e, px, py, W, A, t);
  }

function renderResearch3(e, px, py, t) {
    // MK3 — accelerator campus: the dome crowns a central lab inside a
    // particle ring, fed by a linac and dumping into a beam stop, with the
    // MK2 dishes out on the corners and cryo tanks keeping the magnets cold.
    const on = e.powered, A = '#e0a0ff', W = TILE*3, fine = Camera.zoom > 0.5;
    const rx = px + 60, ry = py + 56, R = 36;
    if (on && fine) drawGlowHalo(rx, ry, TILE*2.2, [[0, A], [1, 'transparent']], 0.26 + 0.1*Math.sin(t*3));
    _rsPad(px, py, W, 3, 13, 3, A, on, t);

    // Linac and injector hall feeding the ring from the west
    ctx.fillStyle = RSK.metalDk; ctx.fillRect(px + 14, ry - 2.5, 12, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px + 9, ry - 5, 8, 14);
    ctx.fillStyle = RSK.roof; ctx.fillRect(px + 7, ry - 7, 8, 14);
    ctx.fillStyle = on ? A : RSK.dim; ctx.fillRect(px + 9, ry - 1, 4, 2);
    if (on && fine) {
      ctx.fillStyle = '#ffffff';
      for (let k = 0; k < 3; k++) {
        const ph = (t*1.2 + k/3) % 1;
        ctx.globalAlpha = 1 - ph*0.5; ctx.fillRect(px + 15 + ph*10, ry - 1, 2.5, 2);
      }
      ctx.globalAlpha = 1;
    }

    // Beam line out of the north-east into the beam stop
    const bx0 = rx + Math.cos(-Math.PI/4)*R, by0 = ry + Math.sin(-Math.PI/4)*R;
    ctx.strokeStyle = RSK.metalDk; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bx0, by0); ctx.lineTo(px + 96, py + 24); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px + 95, py + 14, 16, 13);
    ctx.fillStyle = on ? '#6a667a' : '#3e3a4c'; ctx.fillRect(px + 93, py + 12, 16, 13);
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = k % 2 ? '#1a1622' : (on ? '#e0b030' : '#5a4a20');
      ctx.fillRect(px + 93 + k*4, py + 22, 4, 3);
    }
    _rsLamp(px + 101, py + 17, 1.8, A, on, t, 1);

    // Cryo tanks, piped to the ring
    ctx.strokeStyle = RSK.metalDk; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px + 92, py + 94); ctx.lineTo(px + 84, py + 82); ctx.stroke();
    _rsTanks(px + 92, py + 100, 6, on, t, A);

    // Service bridges from the ring in to the central lab
    ctx.strokeStyle = RSK.wall; ctx.lineWidth = 4;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = Math.PI/4 + k*Math.PI/2;
      ctx.moveTo(rx + Math.cos(a)*14, ry + Math.sin(a)*14);
      ctx.lineTo(rx + Math.cos(a)*(R - 3), ry + Math.sin(a)*(R - 3));
    }
    ctx.stroke();
    _rsRing(rx, ry, R, A, on, t, 2, 1.1);

    // Central lab tower under the dome
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; _rsOct(rx - 13, ry - 13, rx + 17, ry + 17, 5); ctx.fill();
    ctx.fillStyle = RSK.roof;           _rsOct(rx - 15, ry - 15, rx + 15, ry + 15, 5); ctx.fill();
    ctx.strokeStyle = RSK.metalDk; ctx.lineWidth = 1.5; ctx.stroke();
    _rsDome(rx, ry, 9, A, on, t, 2.0);
    _rsProgressRing(rx, ry, 12.5, A, on, t, 2);

    _rsDish(px + 17, py + 20, 10, A, on, t, 0.8);
    _rsDish(px + 17, py + 100, 10, A, on, t, 3.9);
    _rsPlate(px + 60, py + 111, 3, A, on);
    _rsSelection(e, px, py, W, A, t);
  }

function renderTownHall(e, px, py, t) {
    // Colonial town hall — authored at 4×4 and scaled to the footprint.
    // Deliberately smaller and plainer than City Hall (renderGovBuilding):
    // the neighbourhood town hall, not the domed seat of government.
    //
    // Red brick with white quoins and green-shuttered sash windows under a
    // slate roof with dormers and chimneys; a white columned portico; and a
    // cupola with a clock showing the in-game time, a bell that swings on
    // the hour and a rooster weathervane turning in the breeze. Out front,
    // two flags, and a town green with a bandstand, a memorial obelisk, a
    // notice board and pigeons that scatter now and then. At noon the mayor
    // addresses a small crowd from the steps under bunting; from 18:00 to
    // 20:00 the council chamber lights up for the town meeting.
    const AW = 160, AH = 160;
    const W = (e.width || 4) * TILE, H = (e.height || 4) * TILE;
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(W / (AW*TILE/40), H / (AH*TILE/40));
    const K = _nKit(0, 0), { S, X, Y, R, RR, dot, ell, poly, ln, text, glow, person } = K;
    const on = e.powered, hr = DayNight.hour(), dark = DayNight.darkness();
    const night = dark > 0.3, day = hr >= 8 && hr < 18;
    const detail = Camera.zoom > 0.45;
    const L = (d, n, o) => on ? (night ? n : d) : o;
    const BRICK = L('#a0463a', '#643e44', '#2e1c18'), BRICK_D = L('#86382e', '#52323a', '#261614');
    const TRIM = L('#f6f2e8', '#b0aebb', '#44403a'), TRIM_D = L('#d8d2c2', '#8c8a98', '#34322e');
    const SLATE = L('#4a5260', '#2e3440', '#1a1c20'), SLATE_L = L('#5e6878', '#3a4250', '#202226');
    const SHUTTER = L('#2f5a3a', '#223a2e', '#141c16');
    const minute = (hr % 1)*60;
    const address = on && hr >= 12 && hr < 12.5;
    const meeting = on && hr >= 18 && hr < 20;

    // ── Brick walk, sidewalk ──
    // (No lawn fill: the sprite sits on whatever ground it's placed on.)
    R(0, 150, AW, 10, L('#b89a84', '#6a5e62', '#2e2824'));
    if (detail) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = 0; k < 32; k++) ctx.fillRect(X(k*5 + (k % 2)*2.5), Y(150), 0.4*S, 10*S); }
    R(70, 108, 20, 42, L('#b89a84', '#6a5e62', '#2e2824'));
    if (detail) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (let r = 0; r < 14; r++) ctx.fillRect(X(70), Y(110 + r*3), 20*S, 0.4*S); }

    // ── Chimneys (behind the roof) ──
    for (const cx of [30, 130]) {
      R(cx - 4, 20, 8, 16, BRICK_D); R(cx - 5, 18, 10, 3, TRIM_D);
      if (on && (hr < 9 || hr >= 17)) for (let q = 0; q < 3; q++) {
        const ph = (t*0.2 + q/3 + cx*0.01) % 1;
        ell(cx + ph*6 + Math.sin(t + q)*1, 16 - ph*14, 1.6 + ph*3, 1.3 + ph*2.4, `rgba(210,210,215,${((1 - ph)*Math.min(1, ph*6)*0.4).toFixed(3)})`);
      }
    }

    // ── Slate roof with dormers ──
    R(14 + 4, 34 + 4, 132, 76, 'rgba(0,0,0,0.25)');
    poly([[12, 46], [28, 30], [132, 30], [148, 46]], SLATE);
    poly([[28, 30], [132, 30], [140, 38], [20, 38]], SLATE_L);
    if (detail) { ctx.fillStyle = 'rgba(0,0,0,0.15)'; for (let r = 0; r < 3; r++) ctx.fillRect(X(20 - r*3), Y(34 + r*4), (120 + r*6)*S, 0.4*S); }
    for (const dx of [40, 120]) {
      R(dx - 6, 32, 12, 12, TRIM);
      poly([[dx - 8, 33], [dx, 26], [dx + 8, 33]], SLATE_L);
      R(dx - 3.5, 35, 7, 7, WIN(dx));
    }
    function WIN(i) {
      const lit = on && night && (meeting || _cmFrac(i + (e.col || 0)*5) > 0.4);
      return lit ? `rgba(255,222,150,${(0.85 + 0.08*Math.sin(t + i)).toFixed(3)})` : L('#3a4a5e', '#1e2632', '#141618');
    }

    // ── Brick body with quoins and shuttered sash windows ──
    R(16, 46, 128, 62, BRICK);
    if (detail) { ctx.fillStyle = 'rgba(0,0,0,0.10)'; for (let r = 0; r < 20; r++) ctx.fillRect(X(16), Y(48 + r*3), 128*S, 0.35*S); }
    for (const qx of [16, 140]) for (let q = 0; q < 10; q++) R(qx + (q % 2 ? 0 : -0.5), 47 + q*6, q % 2 ? 4 : 5, 4, TRIM);   // quoins
    R(16, 46, 128, 3, TRIM);                                                                        // cornice
    R(16, 76, 128, 2, TRIM_D);                                                                      // string course
    const windowAt = (wx, wy, i, chamber) => {
      R(wx - 3, wy - 1, 3, 13, SHUTTER); R(wx + 8, wy - 1, 3, 13, SHUTTER);
      R(wx - 0.8, wy - 1.8, 9.6, 14.6, TRIM);
      const lit = chamber && meeting;
      R(wx, wy - 1, 8, 13, lit ? `rgba(255,228,160,${(0.9 + 0.08*Math.sin(t*1.5 + i)).toFixed(3)})` : WIN(i));
      R(wx + 3.6, wy - 1, 0.8, 13, TRIM); R(wx, wy + 5, 8, 0.8, TRIM);
      R(wx - 1.5, wy + 12, 11, 1.5, TRIM_D);
      if (lit && night) glow(wx + 4, wy + 6, 10, '255,220,150', 0.3);
    };
    for (let w = 0; w < 6; w++) {
      const wx = [24, 38, 52, 100, 114, 128][w];
      windowAt(wx, 54, w + 10, true);                                                                // upper floor: council chamber
      windowAt(wx, 84, w + 20, false);
    }
    // meeting silhouettes in the chamber windows
    if (meeting && detail) for (let p = 0; p < 6; p++) dot([28, 42, 56, 104, 118, 132][p], 63 + Math.sin(t + p)*0.3, 1.4, 'rgba(60,40,30,0.55)');

    // ── Portico ──
    R(58 + 3, 40 + 3, 44, 70, 'rgba(0,0,0,0.2)');
    poly([[54, 50], [80, 36], [106, 50]], TRIM);
    poly([[60, 49], [80, 40], [100, 49]], TRIM_D);
    R(54, 50, 52, 6, TRIM);
    text('TOWN HALL', 80, 53.2, 4.2, L('#3a2e24', '#e0e4f0', 'rgba(60,60,60,0.8)'), 'Georgia, serif');
    dot(80, 45.5, 2.4, L('#d8a840', '#b08830', '#3a3018'));                                          // seal in the tympanum
    for (let c = 0; c < 4; c++) {
      const cx = 60 + c*13.3;
      R(cx - 2.4, 56, 4.8, 44, TRIM);
      R(cx + 0.8, 56, 1.6, 44, 'rgba(0,0,0,0.10)');
      R(cx - 3.4, 56, 6.8, 2, TRIM_D); R(cx - 3.4, 98, 6.8, 2, TRIM_D);
    }
    // front door with fanlight
    R(73, 80, 14, 20, L('#2f5a3a', '#223a2e', '#141c16'));
    R(79.6, 80, 0.8, 20, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = on ? (night ? '#ffe0a0' : '#c8dcea') : '#141618';
    ctx.beginPath(); ctx.ellipse(X(80), Y(80), 7*S, 5*S, 0, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = TRIM; ctx.lineWidth = 0.5*S;
    for (let k = 1; k < 5; k++) { const a = Math.PI + k*Math.PI/5; ctx.beginPath(); ctx.moveTo(X(80), Y(80)); ctx.lineTo(X(80 + Math.cos(a)*7), Y(80 + Math.sin(a)*5)); ctx.stroke(); }
    for (let s = 0; s < 3; s++) R(62 - s*3, 100 + s*3, 36 + s*6, 3, s % 2 ? TRIM_D : TRIM);        // steps
    // bunting for the noon address
    if (address) {
      ctx.strokeStyle = 'rgba(80,80,80,0.6)'; ctx.lineWidth = 0.3*S;
      ctx.beginPath(); ctx.moveTo(X(56), Y(57)); ctx.quadraticCurveTo(X(80), Y(64), X(104), Y(57)); ctx.stroke();
      for (let b = 0; b < 9; b++) {
        const u = (b + 0.5)/9, bx = 56 + u*48, by = 57 + 7*(1 - (2*u - 1)**2)*0.5 + 1;
        poly([[bx - 2, by], [bx + 2, by], [bx, by + 3.5]], ['#e0302a', '#f4f0e6', '#2d5f8c'][b % 3]);
      }
    }

    // ── Cupola with clock, bell and weathervane ──
    {
      const cx = 80, base = 32;
      R(cx - 9, base - 8, 18, 8, TRIM);                                                             // clock stage
      dot(cx, base - 4, 4.4, TRIM_D); dot(cx, base - 4, 3.7, L('#f8f4e8', '#e8e0c8', '#3a3834'));
      if (on && night) glow(cx, base - 4, 8, '255,240,200', 0.45);
      const ha = (hr % 12)/12*Math.PI*2 - Math.PI/2, ma = (minute/60)*Math.PI*2 - Math.PI/2;
      ctx.strokeStyle = '#1a1a1a'; ctx.lineCap = 'round';
      ctx.lineWidth = 0.8*S; ctx.beginPath(); ctx.moveTo(X(cx), Y(base - 4)); ctx.lineTo(X(cx + Math.cos(ha)*2), Y(base - 4 + Math.sin(ha)*2)); ctx.stroke();
      ctx.lineWidth = 0.5*S; ctx.beginPath(); ctx.moveTo(X(cx), Y(base - 4)); ctx.lineTo(X(cx + Math.cos(ma)*3.1), Y(base - 4 + Math.sin(ma)*3.1)); ctx.stroke();
      R(cx - 7, base - 20, 14, 12, TRIM);                                                            // belfry
      RR(cx - 4.5, base - 18, 9, 9, 3.5, L('#1a1410', '#0e0a08', '#0a0a0a'));
      const swing = on && minute < 1.2 ? Math.sin(t*6)*0.5 : 0;
      ctx.save(); ctx.translate(X(cx), Y(base - 17)); ctx.rotate(swing);
      ctx.fillStyle = L('#d8a840', '#b08830', '#3a3018');
      ctx.beginPath(); ctx.moveTo(-2*S, 5*S); ctx.quadraticCurveTo(-2*S, 0.5*S, 0, 0.5*S); ctx.quadraticCurveTo(2*S, 0.5*S, 2*S, 5*S); ctx.closePath(); ctx.fill();
      ctx.restore();
      poly([[cx - 8.5, base - 20], [cx, base - 28], [cx + 8.5, base - 20]], SLATE_L);
      ln(cx, base - 28, cx, base - 33, L('#2a2a2e', '#1a1a1e', '#141414'), 0.6);
      const vane = Math.sin(t*0.15)*1.2;                                                             // rooster turning
      ctx.save(); ctx.translate(X(cx), Y(base - 33)); ctx.scale(Math.cos(vane), 1);
      ctx.fillStyle = L('#2a2a2e', '#1a1a1e', '#141414');
      ctx.beginPath(); ctx.moveTo(-3*S, 0); ctx.lineTo(1*S, -1.2*S); ctx.lineTo(2.6*S, -3*S); ctx.lineTo(3*S, -0.6*S); ctx.lineTo(1.2*S, 0.6*S); ctx.closePath(); ctx.fill();
      ctx.restore();
      ln(cx - 3, base - 30, cx + 3, base - 30, L('#2a2a2e', '#1a1a1e', '#141414'), 0.35);
      ln(cx, base - 32, cx, base - 28, L('#2a2a2e', '#1a1a1e', '#141414'), 0.35);
    }

    // ── Flagpoles ──
    // On the green either side of the walk, clear of the portico.
    for (const [fx, colA, colB, dir] of [[62, '#2d5f8c', '#f4f0e6', -1], [98, '#d8a840', '#2f5a3a', 1]]) {
      const base = 146, top = 116;
      R(fx - 2, base - 1, 4, 2, TRIM_D);
      ln(fx, base, fx, top, L('#dfe3e6', '#9aa0aa', '#3a3c3e'), 0.7);
      const w = Math.sin(t*3 + fx)*1.4;
      poly([[fx, top], [fx + dir*12, top + 1.5 + w], [fx + dir*12, top + 7.5 + w], [fx, top + 6]], on ? colA : '#2a2a2a');
      if (detail) poly([[fx, top + 3], [fx + dir*12, top + 4.5 + w], [fx + dir*12, top + 5.5 + w], [fx, top + 4]], on ? colB : '#333');
      dot(fx, top - 0.5, 0.8, L('#e0b020', '#a8841c', '#3a3010'));
    }

    // ── Town green: bandstand, obelisk, notice board, flowers, benches ──
    {
      const bx = 28, by = 132;
      ell(bx + 2, by + 3, 16, 6, 'rgba(0,0,0,0.2)');
      ell(bx, by, 16, 6, TRIM_D);
      for (let p = 0; p < 6; p++) { const a = p/6*Math.PI*2; R(bx + Math.cos(a)*13 - 0.6, by + Math.sin(a)*4.8 - 10, 1.2, 10, TRIM); }
      poly([[bx - 17, by - 10], [bx, by - 19], [bx + 17, by - 10]], L('#2f5a3a', '#223a2e', '#141c16'));
      ell(bx, by - 10, 17, 3, L('#3a6a48', '#2a4838', '#182018'));
      if (on && hr >= 18 && hr < 21) for (let m = 0; m < 3; m++) person(bx - 6 + m*6, by + 1, ['#e0302a', '#2d5f8c', '#f4f0e6'][m], _N_SKIN[m + 1], 0, 0.7);
    }
    R(128, 118, 8, 22, TRIM_D);                                                                     // obelisk
    poly([[128, 118], [132, 108], [136, 118]], TRIM);
    R(125, 138, 14, 3, TRIM_D);
    for (let f = 0; f < 6; f++) dot(124 + f*3, 142, 1, on ? ['#e0302a', '#f0c030', '#d060c0'][f % 3] : '#2a2a2a');
    R(108, 120, 12, 8, L('#6a4a2a', '#4a3a30', '#2a2018')); R(113.5, 128, 1, 6, L('#6a4a2a', '#4a3a30', '#2a2018'));
    if (detail) { R(109.5, 121.5, 4, 2.4, '#f4f0e6'); R(114.5, 122, 4, 3, '#f0e080'); R(110, 124.5, 5, 2, '#a0c8f0'); }
    for (const bx of [48, 94]) { R(bx, 142, 14, 2, L('#8a6034', '#5a4a44', '#2a1e14')); R(bx + 1, 144, 1, 2, '#4a3a2a'); R(bx + 12, 144, 1, 2, '#4a3a2a'); }
    for (const [tx, ty, r] of [[8, 112, 7], [152, 110, 7], [150, 140, 6]]) {
      ell(tx + 2, ty + 3, r, r*0.5, 'rgba(0,0,0,0.25)');
      dot(tx, ty, r, L('#2f5a2a', '#1c3020', '#101a0e')); dot(tx - r*0.3, ty - r*0.3, r*0.6, L('#3f7a36', '#25412a', '#16200f'));
    }

    // ── People: the noon address, meeting-goers, strollers ──
    if (address) {
      R(78, 96, 4, 4, L('#6a4a2a', '#4a3a30', '#2a2018'));                                           // podium
      person(80, 96, '#1a1a2a', _N_SKIN[0], 0, 0.85);
      const gesture = Math.sin(t*2.5);
      ln(81, 92, 83.5, 89.5 + gesture*1.2, _N_SKIN[0], 0.5);
      for (let p = 0; p < 10; p++) person(66 + (p % 5)*7 + (Math.floor(p/5) % 2)*3, 118 + Math.floor(p/5)*7, _N_SHIRT[p % 8], _N_SKIN[p % 6], 0, 0.8);
    } else if (meeting) {
      for (let p = 0; p < 4; p++) { const u = ((t*0.03 + p/4) % 1); person(80 + (p - 1.5)*3, 150 - u*48, _N_SHIRT[(p + 2) % 8], _N_SKIN[p % 6], 0, 0.8); }
    } else if (on && day) {
      for (let p = 0; p < 3; p++) { const u = ((t*0.015*(p % 2 ? 1 : -1) + p/3) % 1 + 1) % 1; person(4 + u*152, 155, _N_SHIRT[(p + 4) % 8], _N_SKIN[(p + 3) % 6], Math.abs(Math.sin(t*6 + p))*0.3, 0.8); }
    }

    // ── Pigeons pecking, then scattering ──
    if (on && !night && detail) {
      const cyc = (t*0.05) % 1, flying = cyc > 0.85;
      for (let b = 0; b < 5; b++) {
        const hx = 72 + b*4 + _cmFrac(b + 30)*6, hy = 132 + _cmFrac(b + 40)*12;
        if (flying) {
          const k = (cyc - 0.85)/0.15, a = -0.8 - _cmFrac(b + 50)*1.5;
          const fx = hx + Math.cos(a)*k*40, fy = hy + Math.sin(a)*k*40;
          const flap = Math.sin(t*25 + b)*1.2;
          ln(fx - 2, fy - flap, fx, fy, '#8a8e96', 0.5); ln(fx, fy, fx + 2, fy - flap, '#8a8e96', 0.5);
        } else {
          const peck = Math.max(0, Math.sin(t*4 + b*1.7))*0.8;
          ell(hx, hy, 1.6, 1, '#8a8e96'); dot(hx + 1.2, hy - 0.6 + peck, 0.6, '#6a6e76');
        }
      }
    }
    if (on && night) for (const [lx, ly] of [[66, 146], [94, 146], [14, 146], [146, 146]]) { R(lx - 0.5, ly - 9, 1, 9, '#2a2a2e'); dot(lx, ly - 10, 1.2, '#fff0c8'); glow(lx, ly - 7, 14, '255,230,170', 0.35); }
    ctx.restore();
  }

function renderCivicCenter(e, px, py, t) {
    // Civic Center — 5×4 community hub, drawn as a front elevation in a
    // 200×160 design space (renderGovCivic calls this unscaled). Modern rather
    // than classical, to stand apart from the town hall and courthouse:
    //   · library wing (left) — sandstone with deep vertical fins, a green roof
    //   · glass atrium (centre) — full-height curtain wall under a floating
    //     wave canopy, with a lit feature wall carrying the name
    //   · community hall (right) — timber-clad, sawtooth skylights, folding
    //     glass doors onto the plaza
    // over a forecourt with a reflecting pool, lawn and tree, flags and lamps.
    //
    // Materials take a dusk wash scaled by darkness before any light is drawn,
    // so evenings read as lit windows on a darkened building. Unpowered it stays
    // a legible building — glass dead, no lights — instead of a black shape.
    const W = TILE*(e.width||5), H = TILE*(e.height||4);
    const on = e.powered;
    const sx = W/200, sy = H/160, sm = Math.min(sx, sy);
    const X = v => px + v*sx, Y = v => py + v*sy;
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), w*sx, h*sy); };
    const hr = DayNight.hour(), dark = DayNight.darkness();
    const night = dark > 0.3;
    const openNow = on && hr >= 8 && hr < 22;
    const evening = on && hr >= 17 && hr < 22;
    const detail = Camera.zoom > 0.45, fine = Camera.zoom > 0.8;
    const lilac = (a) => `rgba(184,144,224,${a})`;
    const warm  = (a) => `rgba(255,214,150,${a})`;
    const dusk  = (x, y, w, h) => { if (dark > 0.05) R(x, y, w, h, `rgba(10,10,32,${0.55*dark})`); };
    const hash  = (a) => { const s = Math.sin(a*12.9898 + (e.col||0)*0.7 + (e.row||0)*1.3)*43758.5453; return s - Math.floor(s); };
    const GND = 128;
    ctx.save();

    // ── Forecourt ────────────────────────────────────────────────────
    R(2, GND, 196, 30, '#cdc5b6');
    if (fine) {
      ctx.strokeStyle = 'rgba(100,90,76,0.22)'; ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let x = 12; x < 198; x += 14) { ctx.moveTo(X(x), Y(GND)); ctx.lineTo(X(x), Y(158)); }
      ctx.moveTo(X(2), Y(143)); ctx.lineTo(X(198), Y(143));
      ctx.stroke();
    }
    R(4, GND, 192, 2.5, 'rgba(0,0,0,0.25)');               // building shadow line
    // Lawn + tree on the right
    R(150, 138, 46, 18, '#5f8f4a');
    if (detail) { R(150, 138, 46, 1.2, '#7aa860'); }
    dusk(2, GND, 196, 30);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(X(178), Y(152), 13*sm, 3*sm, 0, 0, Math.PI*2); ctx.fill();
    R(177, 132, 2.4, 20, '#6a4a30');
    ctx.fillStyle = night ? '#2c4a2e' : '#4f8a44';
    for (const [ox, oy, r] of [[0, -8, 10], [-7, -2, 7], [7, -2, 7], [0, 0, 8]]) {
      ctx.beginPath(); ctx.arc(X(178 + ox), Y(128 + oy), r*sm, 0, Math.PI*2); ctx.fill();
    }
    if (!night && detail) {
      ctx.fillStyle = 'rgba(160,210,120,0.35)';
      ctx.beginPath(); ctx.arc(X(175), Y(118), 4*sm, 0, Math.PI*2); ctx.fill();
    }

    // Reflecting pool with fountain jets (left)
    const fX = 34, fY = 146;
    ctx.fillStyle = '#9a9282';
    ctx.beginPath(); ctx.ellipse(X(fX), Y(fY), 24*sx, 6.5*sy, 0, 0, Math.PI*2); ctx.fill();
    const wg = ctx.createLinearGradient(X(fX - 22), 0, X(fX + 22), 0);
    wg.addColorStop(0, night ? '#1e3a5a' : '#3a86b8'); wg.addColorStop(0.5, night ? (on ? '#5a8ab8' : '#2a4a68') : '#8ccbee'); wg.addColorStop(1, night ? '#1e3a5a' : '#3a86b8');
    ctx.fillStyle = wg;
    ctx.beginPath(); ctx.ellipse(X(fX), Y(fY), 21*sx, 5*sy, 0, 0, Math.PI*2); ctx.fill();
    if (on && detail) {
      for (let j = 0; j < 3; j++) {
        const jx = fX + (j - 1)*9;
        const hJet = (0.55 + 0.45*Math.sin(t*2.6 + j*1.3))*11;
        ctx.strokeStyle = `rgba(220,240,255,${0.55 + 0.2*Math.sin(t*3 + j)})`; ctx.lineWidth = 1.1*sm;
        ctx.beginPath(); ctx.moveTo(X(jx), Y(fY)); ctx.quadraticCurveTo(X(jx), Y(fY - hJet), X(jx + 2), Y(fY - hJet + 2)); ctx.stroke();
      }
      const rp = (t*0.5) % 1;
      ctx.strokeStyle = `rgba(230,245,255,${0.35*(1 - rp)})`; ctx.lineWidth = 0.7*sm;
      ctx.beginPath(); ctx.ellipse(X(fX), Y(fY), (5 + 14*rp)*sx, (1.3 + 3.5*rp)*sy, 0, 0, Math.PI*2); ctx.stroke();
      if (night) {                                        // underwater lights
        ctx.fillStyle = lilac(0.35);
        ctx.beginPath(); ctx.ellipse(X(fX), Y(fY), 14*sx, 3*sy, 0, 0, Math.PI*2); ctx.fill();
      }
    }

    // ── Library wing (left) ──────────────────────────────────────────
    const lX = 8, lW = 58, lY = 62;
    const sg = ctx.createLinearGradient(X(lX), 0, X(lX + lW), 0);
    sg.addColorStop(0, '#eadcc0'); sg.addColorStop(1, '#cdbd9e');
    ctx.fillStyle = sg; ctx.fillRect(X(lX), Y(lY), lW*sx, (GND - lY)*sy);
    dusk(lX, lY, lW, GND - lY);
    // Tall windows between fins
    for (let i = 0; i < 5; i++) {
      const wx = lX + 5 + i*10.4, wy = lY + 14, ww = 6.4, wh = GND - lY - 20;
      const lit = on && ((openNow && night) || (night && i === 2));
      if (lit) {
        const lg = ctx.createLinearGradient(0, Y(wy), 0, Y(wy + wh));
        lg.addColorStop(0, '#ffe2a8'); lg.addColorStop(1, '#d89a50');
        ctx.fillStyle = lg;
      } else if (!night) {
        const gl = ctx.createLinearGradient(X(wx), Y(wy), X(wx + ww), Y(wy + wh));
        gl.addColorStop(0, on ? '#a8cce4' : '#6a8090'); gl.addColorStop(1, on ? '#4a7298' : '#3a4a58');
        ctx.fillStyle = gl;
      } else ctx.fillStyle = on ? '#1a2434' : '#20242a';
      ctx.fillRect(X(wx), Y(wy), ww*sx, wh*sy);
      if (detail && (lit || (on && !night))) {            // bookshelves behind the glass
        ctx.fillStyle = lit ? 'rgba(90,50,30,0.45)' : 'rgba(40,40,50,0.25)';
        for (let b = 0; b < 4; b++) ctx.fillRect(X(wx + 0.6), Y(wy + 6 + b*9), (ww - 1.2)*sx, 2.2*sy);
      }
      if (detail) R(wx, wy, ww, 1, 'rgba(0,0,0,0.25)');
      // fin
      R(wx + ww, wy - 6, 2.6, wh + 8, '#e8dcc4');
      if (detail) R(wx + ww + 2, wy - 6, 0.6, wh + 8, 'rgba(0,0,0,0.18)');
      if (dark > 0.05) R(wx + ww, wy - 6, 2.6, wh + 8, `rgba(10,10,32,${0.55*dark})`);
    }
    // Parapet + green roof
    R(lX - 1.5, lY - 3, lW + 3, 4, '#f4ecdc');
    if (dark > 0.05) R(lX - 1.5, lY - 3, lW + 3, 4, `rgba(10,10,32,${0.5*dark})`);
    if (detail) for (let i = 0; i < 6; i++) {
      ctx.fillStyle = night ? '#2c4a2e' : ['#4f8a44', '#5f9a4c', '#6aa858'][i % 3];
      ctx.beginPath(); ctx.arc(X(lX + 5 + i*9.6), Y(lY - 4.5), (2.8 + hash(i)*1.4)*sm, 0, Math.PI*2); ctx.fill();
    }
    // Wing sign
    R(lX + 12, lY + 3.5, 34, 7, on ? '#2a2432' : '#3a3640');
    if (detail) {
      ctx.fillStyle = on ? (night || openNow ? lilac(0.95) : lilac(0.6)) : '#8a8494';
      ctx.font = `bold ${Math.max(4, 5*sy)}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('LIBRARY', X(lX + 29), Y(lY + 7.2));
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    }

    // ── Community hall (right) ───────────────────────────────────────
    const hX = 134, hW = 58, hY = 70;
    ctx.fillStyle = '#9a6a42'; ctx.fillRect(X(hX), Y(hY), hW*sx, (GND - hY)*sy);
    if (detail) {                                         // timber cladding
      ctx.fillStyle = 'rgba(60,34,18,0.35)';
      for (let x = hX + 2; x < hX + hW; x += 3) ctx.fillRect(X(x), Y(hY), 0.8*sx, (GND - hY)*sy);
      ctx.fillStyle = 'rgba(255,220,170,0.12)'; ctx.fillRect(X(hX), Y(hY), 10*sx, (GND - hY)*sy);
    }
    dusk(hX, hY, hW, GND - hY);
    // Sawtooth roof with north-light glazing
    for (let i = 0; i < 4; i++) {
      const tx = hX + i*14.5;
      ctx.fillStyle = on || !night ? '#5a5e66' : '#3a3e44';
      ctx.beginPath(); ctx.moveTo(X(tx), Y(hY)); ctx.lineTo(X(tx + 14.5), Y(hY)); ctx.lineTo(X(tx + 14.5), Y(hY - 10)); ctx.closePath(); ctx.fill();
      ctx.fillStyle = on && (evening || (openNow && night)) ? warm(0.85) : (night ? '#1a2434' : '#8ab4d4');
      ctx.beginPath(); ctx.moveTo(X(tx + 14.5), Y(hY - 10)); ctx.lineTo(X(tx + 14.5), Y(hY)); ctx.lineTo(X(tx + 12.4), Y(hY)); ctx.lineTo(X(tx + 12.4), Y(hY - 8.6)); ctx.closePath(); ctx.fill();
    }
    R(hX - 1, hY - 0.8, hW + 2, 1.6, '#3a3e44');
    // Folding glass doors, activity inside
    const gdY = hY + 20, gdH = GND - gdY - 1;
    const hallLit = on && openNow;
    if (hallLit && (night || evening)) {
      const hg = ctx.createLinearGradient(0, Y(gdY), 0, Y(gdY + gdH));
      hg.addColorStop(0, '#ffe6b0'); hg.addColorStop(1, '#e0a860');
      ctx.fillStyle = hg;
    } else if (on && !night) {
      const hg = ctx.createLinearGradient(X(hX), Y(gdY), X(hX + hW), Y(GND));
      hg.addColorStop(0, '#b4d4ea'); hg.addColorStop(1, '#5a82a8');
      ctx.fillStyle = hg;
    } else ctx.fillStyle = on ? '#1a2434' : '#262a30';
    ctx.fillRect(X(hX + 4), Y(gdY), (hW - 8)*sx, gdH*sy);
    if (hallLit && detail) {
      for (let i = 0; i < 5; i++) {                        // dance / exercise class
        const bx = hX + 8 + ((t*6 + i*11) % (hW - 16));
        const bob = Math.abs(Math.sin(t*4 + i))*1.5;
        R(bx, gdY + gdH - 12 - bob, 2.2, 9, 'rgba(50,34,40,0.75)');
        ctx.fillStyle = 'rgba(50,34,40,0.75)';
        ctx.beginPath(); ctx.arc(X(bx + 1.1), Y(gdY + gdH - 14 - bob), 1.6*sm, 0, Math.PI*2); ctx.fill();
      }
    }
    if (detail) for (let m = 1; m < 5; m++) R(hX + 4 + m*(hW - 8)/5, gdY, 0.9, gdH, '#3a3630');
    R(hX + 4, gdY - 1.5, hW - 8, 1.5, '#3a3630');
    R(hX + 12, hY + 6, 34, 7, on ? '#2a2432' : '#3a3640');
    if (detail) {
      ctx.fillStyle = on ? lilac(night || openNow ? 0.95 : 0.6) : '#8a8494';
      ctx.font = `bold ${Math.max(4, 5*sy)}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('HALL', X(hX + 29), Y(hY + 9.7));
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    }

    // ── Glass atrium (centre) ────────────────────────────────────────
    const aX = 66, aW = 68, aY = 34;
    R(aX, aY, aW, GND - aY, on || !night ? '#3a3e46' : '#26282e');     // frame
    const gY = aY + 4, gH = GND - gY;
    const ag = ctx.createLinearGradient(0, Y(gY), 0, Y(GND));
    if (on && night && openNow) { ag.addColorStop(0, '#f0d8ff'); ag.addColorStop(0.5, '#ffd9a0'); ag.addColorStop(1, '#e8a860'); }
    else if (on && night)       { ag.addColorStop(0, '#3a3050'); ag.addColorStop(1, '#241c34'); }
    else if (!night)            { ag.addColorStop(0, on ? '#c4e0f4' : '#7a8a98'); ag.addColorStop(1, on ? '#4c78a4' : '#3e4c5a'); }
    else                        { ag.addColorStop(0, '#2a2e36'); ag.addColorStop(1, '#1c1e24'); }
    ctx.fillStyle = ag; ctx.fillRect(X(aX + 3), Y(gY), (aW - 6)*sx, gH*sy);
    // interior: mezzanine, stair, lilac feature wall with the name
    const mezY = gY + gH*0.45;
    if (detail) {
      R(aX + 3, mezY, aW - 6, 2.2, 'rgba(60,54,70,0.65)');
      ctx.fillStyle = 'rgba(210,230,240,0.35)'; ctx.fillRect(X(aX + 3), Y(mezY - 4), (aW - 6)*sx, 4*sy);
      ctx.strokeStyle = 'rgba(60,54,70,0.65)'; ctx.lineWidth = 1.6*sm;
      ctx.beginPath(); ctx.moveTo(X(aX + 10), Y(GND - 2)); ctx.lineTo(X(aX + 30), Y(mezY + 2)); ctx.stroke();
    }
    const fwX = aX + 38, fwW = 22, fwY = gY + 8, fwH = 26;
    R(fwX, fwY, fwW, fwH, on ? '#5a3a86' : '#4a4456');
    if (on) {
      const glow = night ? 0.55 + 0.15*Math.sin(t*1.5) : 0.25;
      ctx.fillStyle = lilac(glow); ctx.fillRect(X(fwX - 2), Y(fwY - 2), (fwW + 4)*sx, (fwH + 4)*sy);
    }
    if (detail) {
      ctx.fillStyle = on ? '#f4e8ff' : '#a09aaa';
      ctx.font = `bold ${Math.max(4, 5.2*sy)}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('CIVIC', X(fwX + fwW/2), Y(fwY + 9));
      ctx.fillText('CENTER', X(fwX + fwW/2), Y(fwY + 17));
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    }
    // people in the lobby and on the mezzanine
    if (on && openNow && detail) {
      for (let i = 0; i < 4; i++) {
        const ph = (t*0.12 + i*0.27) % 1;
        const bx = aX + 6 + ph*(aW - 14), by = i % 2 ? mezY - 1 : GND - 3;
        R(bx, by - 8, 2, 7, 'rgba(40,30,40,0.7)');
        ctx.fillStyle = 'rgba(40,30,40,0.7)';
        ctx.beginPath(); ctx.arc(X(bx + 1), Y(by - 9.5), 1.4*sm, 0, Math.PI*2); ctx.fill();
      }
    }
    // curtain-wall mullions + transoms
    if (detail) {
      ctx.fillStyle = on || !night ? 'rgba(50,54,62,0.85)' : 'rgba(30,32,36,0.9)';
      for (let m = 1; m < 6; m++) ctx.fillRect(X(aX + 3 + m*(aW - 6)/6 - 0.4), Y(gY), 0.8*sx, gH*sy);
      for (let m = 1; m < 5; m++) ctx.fillRect(X(aX + 3), Y(gY + m*gH/5 - 0.3), (aW - 6)*sx, 0.6*sy);
    }
    if (on && !night) {                                    // sweeping glint
      const gp = ((t*0.07) % 1.6) - 0.3;
      ctx.save(); ctx.beginPath(); ctx.rect(X(aX + 3), Y(gY), (aW - 6)*sx, gH*sy); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.moveTo(X(aX + gp*aW), Y(GND)); ctx.lineTo(X(aX + gp*aW + 8), Y(GND));
      ctx.lineTo(X(aX + gp*aW + 38), Y(gY)); ctx.lineTo(X(aX + gp*aW + 30), Y(gY));
      ctx.fill(); ctx.restore();
    }
    // Floating wave canopy over the atrium
    ctx.fillStyle = on || !night ? '#f2eee6' : '#9a968e';
    ctx.beginPath();
    ctx.moveTo(X(aX - 12), Y(aY + 2));
    ctx.quadraticCurveTo(X(aX + 18), Y(aY - 16), X(aX + aW/2), Y(aY - 6));
    ctx.quadraticCurveTo(X(aX + aW - 16), Y(aY + 4), X(aX + aW + 12), Y(aY - 10));
    ctx.lineTo(X(aX + aW + 12), Y(aY - 6));
    ctx.quadraticCurveTo(X(aX + aW - 16), Y(aY + 8), X(aX + aW/2), Y(aY - 2));
    ctx.quadraticCurveTo(X(aX + 18), Y(aY - 12), X(aX - 12), Y(aY + 6));
    ctx.closePath(); ctx.fill();
    if (dark > 0.05) { ctx.fillStyle = `rgba(10,10,32,${0.45*dark})`; ctx.fill(); }
    if (on && night) {                                     // lilac LED edge
      ctx.strokeStyle = lilac(0.7 + 0.25*Math.sin(t*1.6)); ctx.lineWidth = 1.1*sm;
      ctx.beginPath();
      ctx.moveTo(X(aX - 12), Y(aY + 6));
      ctx.quadraticCurveTo(X(aX + 18), Y(aY - 12), X(aX + aW/2), Y(aY - 2));
      ctx.quadraticCurveTo(X(aX + aW - 16), Y(aY + 8), X(aX + aW + 12), Y(aY - 6));
      ctx.stroke();
    }

    // Entrance: doors, steps and ramp
    const dX = aX + 12, dW = 24, dY = GND - 18;
    R(dX - 1, dY - 1, dW + 2, 19, '#2e3036');
    R(dX, dY, dW, 18, on ? (openNow ? warm(night ? 0.9 : 0.55) : '#2a3440') : '#30343a');
    R(dX + dW/2 - 0.4, dY, 0.8, 18, '#2e3036');
    for (let s = 0; s < 3; s++) R(dX - 6 - s*3, GND + s*2.2, dW + 12 + s*6, 2.2, s % 2 ? '#bfb7a6' : '#d8d0c0');
    if (dark > 0.05) R(dX - 12, GND, dW + 24, 6.6, `rgba(10,10,32,${0.5*dark})`);
    if (detail) {                                          // ramp rail
      ctx.strokeStyle = on || !night ? '#7a7a82' : '#4a4a50'; ctx.lineWidth = 0.8*sm;
      ctx.beginPath(); ctx.moveTo(X(dX + dW + 8), Y(GND + 6)); ctx.lineTo(X(dX + dW + 26), Y(GND + 1)); ctx.stroke();
    }
    // Light spilling out of the entrance after dark
    if (on && night && openNow) {
      const sp = ctx.createRadialGradient(X(aX + aW/2), Y(GND), 0, X(aX + aW/2), Y(GND), 46*sm);
      sp.addColorStop(0, 'rgba(255,220,160,0.4)'); sp.addColorStop(1, 'rgba(255,220,160,0)');
      ctx.fillStyle = sp; ctx.fillRect(X(aX - 20), Y(GND), (aW + 40)*sx, 30*sy);
    }

    // ── Flags, banners, lamps, furniture ─────────────────────────────
    if (detail) {
      [[62, '#3a6ac0'], [70, on ? '#9a6ad0' : '#6a5a7a']].forEach(([fx, col], i) => {
        R(fx - 0.5, 104, 1, 38, '#8a8a90');
        const wob = Math.sin(t*2.2 + i*1.4)*1.5;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(X(fx + 0.5), Y(104)); ctx.lineTo(X(fx + 9 + wob), Y(106 + wob*0.3)); ctx.lineTo(X(fx + 0.5), Y(110)); ctx.closePath(); ctx.fill();
      });
      for (const lx of [8, 124, 146]) {
        R(lx - 0.6, 128, 1.2, 22, '#3a3a40');
        R(lx - 2.5, 127, 5, 1.6, '#3a3a40');
        if (on && night) {
          ctx.fillStyle = 'rgba(255,236,190,0.25)';
          ctx.beginPath(); ctx.arc(X(lx), Y(129), 11*sm, 0, Math.PI*2); ctx.fill();
          R(lx - 2, 128.6, 4, 1, '#fff0c8');
        }
      }
      for (const bx of [96, 116]) {                         // benches
        R(bx, 150, 12, 2, '#7a5634'); R(bx + 1, 152, 1, 3, '#3a3630'); R(bx + 10, 152, 1, 3, '#3a3630');
      }
      // noticeboard
      R(128, 138, 15, 11, '#4a4456'); R(129, 139, 13, 9, '#2a2432');
      ['#e6788c', '#82c8f0', '#f0d782'].forEach((c, i) => R(129.6 + i*4.3, 139.8, 3.6, 7.4, on || !night ? c : '#5a5462'));
      R(135, 149, 1.2, 6, '#4a4456');
      if (on && openNow) {                                  // visitors on the plaza
        for (let i = 0; i < 5; i++) {
          const ph = (t*0.05 + i*0.21) % 1;
          const bx = 60 + ph*82, by = 140 + (i % 3)*5;
          R(bx, by - 8, 2.2, 7, ['#c04a60', '#3a6ac0', '#4a9a60', '#d0a030', '#7a4ab0'][i]);
          ctx.fillStyle = '#e8c0a0';
          ctx.beginPath(); ctx.arc(X(bx + 1.1), Y(by - 9.5), 1.5*sm, 0, Math.PI*2); ctx.fill();
        }
      }
    }

    if (!on) {
      R(84, 150, 32, 8, 'rgba(20,16,20,0.75)');
      ctx.fillStyle = 'rgba(255,90,70,0.95)';
      ctx.font = `bold ${Math.max(5, 5.5*sy)}px Courier New`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('NO POWER', X(100), Y(154.2));
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    }
    ctx.restore();

  }

function renderCourthouse(e, px, py, t) {
    // Courthouse — 5×5 civic building. A limestone neoclassical court: a
    // six-column portico under a pediment carrying the scales of justice,
    // "COURTHOUSE" cut into the frieze, twin office wings and a copper dome
    // with its lantern and flag. Grand steps lead down to a paved plaza
    // flanked by hedged lawns, a statue of Justice and a flagpole.
    // It keeps court hours: the offices light up through the working day,
    // the great doors stand open and people climb the steps while court is
    // in session (09:00–17:00), and after dark the facade is floodlit.
    // Drawn footprint-style, authored in a 200×200 box scaled to the
    // footprint; plain fills only (no gradients).
    const W = TILE*(e.width || 5), H = TILE*(e.height || 5), on = e.powered;
    const s = Math.min(W, H) / 200;
    const ox = px + (W - 200*s)/2, oy = py + (H - 200*s)/2;
    const X = (v) => ox + v*s, Y = (v) => oy + v*s;
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), w*s, h*s); };
    const poly = (pts, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(X(pts[0][0]), Y(pts[0][1])); for (let i = 1; i < pts.length; i++) ctx.lineTo(X(pts[i][0]), Y(pts[i][1])); ctx.closePath(); ctx.fill(); };
    const dot = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(x), Y(y), r*s, 0, Math.PI*2); ctx.fill(); };
    const ln = (x1, y1, x2, y2, c, w) => { ctx.strokeStyle = c; ctx.lineWidth = (w || 1)*s; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
    const txt = (str, x, y, size, c) => { ctx.fillStyle = c; ctx.font = `bold ${size*s}px Georgia, 'Times New Roman', serif`; ctx.textAlign = 'center'; ctx.fillText(str, X(x), Y(y)); ctx.textAlign = 'left'; };
    let seed = ((e.col || 0) * 73856093) ^ ((e.row || 0) * 19349663);
    const hash = (k) => {
      let h = (seed ^ Math.imul(k + 1, 0x9E3779B1)) | 0;
      h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };

    const hr = DayNight.hour(), dark = DayNight.darkness();
    const inSession = on && hr >= 9 && hr < 17;
    const officeLit = on && hr >= 8 && hr < 19;
    const floodlit  = on && dark > 0.35;
    const STONE = '#e8e1d2', STONE_SH = '#d2c9b6', STONE_HI = '#f3eee3', GOLD = '#d4af37';
    const COPPER = '#5f9e8a', COPPER_SH = '#437a68';

    // ── Plaza, lawns, statue and flagpole ────────────────────────────
    R(12, 146, 176, 50, '#cdc5b3');
    for (let k = 1; k < 5; k++) ln(12, 146 + k*10, 188, 146 + k*10, 'rgba(120,108,92,0.22)', 0.4);
    for (let k = 1; k < 13; k++) ln(12 + k*13.5, 146, 12 + k*13.5, 196, 'rgba(120,108,92,0.16)', 0.4);
    for (const lx of [18, 132]) {
      R(lx, 156, 50, 34, '#5a8a4a');
      R(lx, 156, 50, 3.5, '#3d6a35'); R(lx, 186.5, 50, 3.5, '#3d6a35');
      R(lx, 156, 3.5, 34, '#3d6a35'); R(lx + 46.5, 156, 3.5, 34, '#3d6a35');
      for (let f = 0; f < 6; f++) dot(lx + 8 + f*6.8, 183, 1.1, ['#e05a7a', '#f0c040', '#ffffff'][f % 3]);
    }
    // Statue of Justice on the left lawn
    R(37, 172, 12, 9, STONE_SH); R(35, 180, 16, 3, STONE);
    poly([[40, 172], [46, 172], [44.5, 160], [41.5, 160]], '#b8b2a4');
    dot(43, 157.5, 2.3, '#c4beb0');
    ln(43, 162, 50, 162, GOLD, 0.7); ln(36, 162, 43, 162, GOLD, 0.7);
    ln(36, 162, 36, 165, GOLD, 0.4); ln(50, 162, 50, 165, GOLD, 0.4);
    dot(36, 165.5, 1.4, GOLD); dot(50, 165.5, 1.4, GOLD);
    ln(43, 162, 43, 178, '#9a9488', 0.6);                                       // sword held down
    // Flagpole on the right lawn
    R(154, 181, 6, 3, STONE_SH);
    ln(157, 181, 157, 138, '#b4b8bc', 1.1);
    dot(157, 137.5, 1, GOLD);
    {
      const wave = Math.sin(t*2.4 + hash(1)*6);
      poly([[157, 139], [171, 140 + wave*1.2], [171, 149 + wave*1.2], [157, 148]], '#3a5aa8');
      poly([[157, 139], [163, 139.6 + wave*0.5], [163, 143.5 + wave*0.5], [157, 143]], '#f2f2ee');
    }

    // ── Floodlights washing the facade after dark ────────────────────
    if (floodlit) {
      for (const fx of [66, 134]) {
        poly([[fx - 3, 146], [fx + 3, 146], [fx + 26, 30], [fx - 26, 30]], 'rgba(255,236,190,0.10)');
        R(fx - 3, 144, 6, 3, '#4a4a4a'); dot(fx, 144, 1.4, '#fff2c8');
      }
    }

    // ── Dome behind the pediment ─────────────────────────────────────
    R(82, 20, 36, 14, STONE);
    for (let k = 0; k < 5; k++) R(85 + k*6.6, 23, 3, 8, officeLit ? 'rgba(255,214,150,0.75)' : '#4a5462');
    ctx.fillStyle = COPPER; ctx.beginPath();
    ctx.ellipse(X(100), Y(20), 19*s, 16*s, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = COPPER_SH; ctx.beginPath();
    ctx.ellipse(X(106), Y(20), 9*s, 15*s, 0, Math.PI*1.5, 0); ctx.fill();
    for (const rx of [89, 100, 111]) ln(rx, 20, 100 + (rx - 100)*0.25, 5.5, 'rgba(40,80,68,0.5)', 0.5);
    R(96.5, -1, 7, 7, STONE); poly([[95.5, -1], [100, -5], [104.5, -1]], COPPER);
    ln(100, -5, 100, -14, '#b4b8bc', 0.6);
    if (on) poly([[100, -14], [107, -13 + Math.sin(t*2.6)], [107, -9 + Math.sin(t*2.6)], [100, -10]], '#3a5aa8');

    // ── Main block and wings ─────────────────────────────────────────
    R(20, 52, 160, 5, STONE_SH);                                                // cornice
    R(22, 57, 156, 63, STONE);
    R(22, 57, 156, 3, STONE_HI);
    for (const [wx0, wing] of [[28, 0], [148, 1]]) {                           // left wing 22–56, right wing 144–178
      for (let fl = 0; fl < 2; fl++) for (let c = 0; c < 3; c++) {
        const wx = wx0 + c*9.5, wy = 66 + fl*26;
        const k = fl*3 + c + wing*10;
        const lit = officeLit ? hash(k) < 0.85 : (on && dark > 0.35 && hash(k + 40) < 0.12);
        R(wx, wy, 7, 16, STONE_SH);
        R(wx + 1, wy + 2, 5, 13, lit ? 'rgba(255,214,150,0.9)' : (dark > 0.4 ? '#1c2430' : '#6a88a4'));
        ctx.fillStyle = lit ? 'rgba(255,214,150,0.9)' : (dark > 0.4 ? '#1c2430' : '#6a88a4');
        ctx.beginPath(); ctx.arc(X(wx + 3.5), Y(wy + 2.2), 2.5*s, Math.PI, 0); ctx.fill();
        R(wx - 0.5, wy + 15, 8, 1.5, STONE_HI);                                  // sill
      }
    }
    // Rusticated base course
    R(22, 112, 156, 8, STONE_SH);
    for (let k = 1; k < 16; k++) ln(22 + k*9.75, 112, 22 + k*9.75, 120, 'rgba(150,140,120,0.5)', 0.4);

    // ── Portico: pediment, frieze, columns, great doors ──────────────
    R(56, 58, 88, 56, '#cbc2ae');                                               // shadowed porch wall
    const doorOpen = inSession;
    R(95, 80, 10, 32, doorOpen ? '#3a2c1c' : '#6a5236');                       // great doors
    if (doorOpen) R(97, 86, 6, 26, 'rgba(255,206,130,0.55)');
    else { ln(100, 80, 100, 112, '#4a3a26', 0.5); dot(98.6, 97, 0.6, GOLD); dot(101.4, 97, 0.6, GOLD); }
    ctx.fillStyle = doorOpen ? '#3a2c1c' : '#6a5236'; ctx.beginPath(); ctx.arc(X(100), Y(80), 5*s, Math.PI, 0); ctx.fill();
    for (const sdx of [80, 114]) {                                             // side doors
      R(sdx, 90, 6, 22, officeLit ? '#4a3a28' : '#5a4632');
      if (officeLit) R(sdx + 1, 92, 4, 7, 'rgba(255,214,150,0.6)');
    }
    for (let k = 0; k < 6; k++) {
      const cx0 = 60 + k*16;
      R(cx0, 60, 7, 53, STONE_HI);
      R(cx0 + 4.5, 60, 2.5, 53, STONE_SH);
      for (let f = 1; f < 3; f++) ln(cx0 + f*2.2, 63, cx0 + f*2.2, 110, 'rgba(150,140,120,0.45)', 0.35);   // fluting
      R(cx0 - 1.5, 58, 10, 3.5, STONE_HI);                                      // capital
      R(cx0 - 1.5, 110, 10, 3.5, STONE_HI);                                     // base
    }
    R(52, 49, 96, 10, STONE_HI);                                                // entablature
    txt('COURTHOUSE', 100, 57.2, 6.4, '#6e6552');
    poly([[50, 49], [100, 25], [150, 49]], STONE_HI);                           // pediment
    poly([[58, 47], [100, 29], [142, 47]], '#ddd5c5');                          // tympanum
    ln(100, 32, 100, 45, GOLD, 0.9);                                            // scales of justice
    ln(88, 36, 112, 36, GOLD, 0.9);
    ln(88, 36, 86, 41, GOLD, 0.4); ln(88, 36, 90, 41, GOLD, 0.4);
    ln(112, 36, 110, 41, GOLD, 0.4); ln(112, 36, 114, 41, GOLD, 0.4);
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(X(88), Y(41), 2.4*s, 0, Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(X(112), Y(41), 2.4*s, 0, Math.PI); ctx.fill();
    R(96, 44.5, 8, 1.5, GOLD);

    // ── Podium and grand steps ───────────────────────────────────────
    R(18, 119, 164, 6, STONE_SH);
    for (let i = 0; i < 6; i++) {
      const sw = 84 + i*7.5, sy = 124.5 + i*3.6;
      R(100 - sw/2, sy, sw, 3.6, i % 2 ? '#d8d0c0' : '#e4ddce');
      ln(100 - sw/2, sy + 3.6, 100 + sw/2, sy + 3.6, 'rgba(120,108,92,0.35)', 0.35);
    }
    for (const lx of [72, 128]) {                                               // lamp standards by the steps
      ln(lx, 146, lx, 130, '#3a3a3e', 1);
      R(lx - 2, 127, 4, 4, '#2a2a2e');
      dot(lx, 129, 1.4, on && dark > 0.3 ? '#fff0c0' : '#8a8a80');
    }

    // ── People on the steps during court hours ───────────────────────
    if (inSession) {
      const SUITS = ['#2a3040', '#3a3a3e', '#1e2a3a', '#5a3a2a'];
      for (let p = 0; p < 5; p++) {
        const cyc = (t*0.06 + hash(p + 60)) % 1;
        const up = hash(p + 70) < 0.6;
        const f = up ? cyc : 1 - cyc;
        const fy = 190 - f*72, fx = 84 + hash(p + 80)*32 + Math.sin(f*6 + p)*2;
        if (fy < 118) continue;                                                  // gone inside
        R(fx - 1.6, fy - 6.5, 3.2, 5, SUITS[p % SUITS.length]);
        R(fx - 1.2, fy - 1.5, 1, 1.5, '#1a1a1a'); R(fx + 0.2, fy - 1.5, 1, 1.5, '#1a1a1a');
        dot(fx, fy - 8, 1.4, ['#f0d0b0', '#c89870', '#8a5a3a'][p % 3]);
        if (p === 1) R(fx + 1.6, fy - 4, 2.4, 2, '#4a3222');                    // briefcase
      }
    }

    // Unpowered: the windows, doors, flag and visitors above already read as
    // shut — no dimming box, which drew a hard-edged square over the
    // government quarter's paving around the building.
    if (!on) {
      ctx.fillStyle = 'rgba(255,90,70,0.9)'; ctx.font = `bold ${7*s}px Courier New`; ctx.textAlign = 'center';
      ctx.fillText('NO POWER', X(100), Y(142)); ctx.textAlign = 'left';
    }
  }

function renderEMS(e, px, py, t) {
    // Emergency Services — 6×4 combined fire & ambulance station. A brick
    // apparatus house with three bays (fire engine, ambulance, rescue SUV),
    // a hose-drying tower, and a two-storey dispatch wing with the red
    // EMERGENCY SERVICES sign, a radio mast and its beacon.
    // Each vehicle runs its own callout cycle: lights start flashing, the
    // bay door rolls up, it pulls out across the apron and away, and later
    // backs in again. Bay doors stand open through the day and roll down at
    // night; the dispatch wing is staffed around the clock. The station has
    // no simulated call state, so the cycles are timed per vehicle and offset
    // per station. Drawn footprint-style, authored in a 240×160 box scaled
    // to the footprint; plain fills only.
    const W = TILE*(e.width || 6), H = TILE*(e.height || 4), on = e.powered;
    const s = Math.min(W/240, H/160);
    const ox = px + (W - 240*s)/2, oy = py + (H - 160*s)/2;
    const X = (v) => ox + v*s, Y = (v) => oy + v*s;
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), w*s, h*s); };
    const poly = (pts, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(X(pts[0][0]), Y(pts[0][1])); for (let i = 1; i < pts.length; i++) ctx.lineTo(X(pts[i][0]), Y(pts[i][1])); ctx.closePath(); ctx.fill(); };
    const dot = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(x), Y(y), r*s, 0, Math.PI*2); ctx.fill(); };
    const ln = (x1, y1, x2, y2, c, w) => { ctx.strokeStyle = c; ctx.lineWidth = (w || 1)*s; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
    const txt = (str, x, y, size, c) => { ctx.fillStyle = c; ctx.font = `bold ${size*s}px 'Arial Narrow', Arial, sans-serif`; ctx.textAlign = 'center'; ctx.fillText(str, X(x), Y(y)); ctx.textAlign = 'left'; };
    let seed = ((e.col || 0) * 73856093) ^ ((e.row || 0) * 19349663);
    const hash = (k) => {
      let h = (seed ^ Math.imul(k + 1, 0x9E3779B1)) | 0;
      h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };

    const hr = DayNight.hour(), dark = DayNight.darkness();
    const night = dark > 0.35;
    const doorsOpenByDay = on && hr >= 7 && hr < 20;
    const BRICK = '#b94a3a', BRICK_SH = '#9a3a2e', TRIM = '#ece8e0';
    const flash = Math.floor(t*8) % 2 === 0;                                    // light-bar alternation

    // ── Apron ───────────────────────────────────────────────────────
    R(2, 118, 236, 40, '#5c5f62');
    ln(2, 118.5, 238, 118.5, '#8a8d90', 0.8);
    const BAYS = [33, 74, 115];
    for (const bx of BAYS) {                                                    // keep-clear hatching in front of each bay
      for (let k = 0; k < 6; k++) ln(bx + k*6.5, 122, bx + k*6.5 + 5, 134, 'rgba(235,200,60,0.55)', 1.2);
      R(bx, 121, 36, 1, 'rgba(235,200,60,0.7)'); R(bx, 135, 36, 1, 'rgba(235,200,60,0.7)');
    }
    if (on) txt('KEEP CLEAR', 92, 150, 6, 'rgba(240,240,236,0.55)');           // under the middle bay (NO POWER goes here when off)

    // ── Hose-drying tower ────────────────────────────────────────────
    R(6, 16, 22, 102, BRICK);
    R(22, 16, 6, 102, BRICK_SH);
    R(4, 11, 26, 6, '#6a3028');
    for (let k = 0; k < 4; k++) R(13, 24 + k*22, 7, 12, night && on ? 'rgba(255,200,130,0.55)' : '#2a2226');
    for (let k = 0; k < 18; k++) ln(6, 20 + k*5.5, 28, 20 + k*5.5, 'rgba(60,20,16,0.25)', 0.35);

    // ── Apparatus house ──────────────────────────────────────────────
    R(28, 38, 128, 80, BRICK);
    for (let k = 0; k < 14; k++) ln(28, 58 + k*4.3, 156, 58 + k*4.3, 'rgba(60,20,16,0.18)', 0.35);
    R(26, 34, 132, 5, '#6a3028');                                               // parapet
    R(28, 39, 128, 15, TRIM);                                                   // sign band
    txt('FIRE', 58, 50.5, 9, BRICK);
    txt('RESCUE', 126, 50.5, 9, BRICK);
    {                                                                            // star of life
      const sx = 92, sy = 46.5, sr = 6;
      ctx.save(); ctx.translate(X(sx), Y(sy));
      ctx.fillStyle = '#2f6fd0';
      for (let a = 0; a < 3; a++) { ctx.rotate(Math.PI/3); ctx.fillRect(-1.6*s, -sr*s, 3.2*s, sr*2*s); }
      ctx.restore();
      ln(sx, sy - 4, sx, sy + 4, '#ffffff', 0.7);
    }

    // Vehicle callout cycles: [kind, period (s)]
    const FLEET = [['engine', 74], ['ambulance', 38], ['rescue', 56]];
    const vehicleAt = (i) => {
      const [kind, period] = FLEET[i];
      const p = on ? ((t/period) + hash(i + 1)) % 1 : 0;
      let st, dy = 0, open = doorsOpenByDay ? 1 : 0, lights = false, alpha = 1;
      if (p < 0.55)      { st = 'parked'; }
      else if (p < 0.60) { st = 'alert';  lights = true; open = Math.max(open, (p - 0.55)/0.05); }
      else if (p < 0.72) { st = 'out';    lights = true; open = 1; const f = (p - 0.60)/0.12; dy = f*f*70; }
      else if (p < 0.90) { st = 'away';   open = 1; }
      else if (p < 0.97) { st = 'back';   open = 1; const f = 1 - (p - 0.90)/0.07; dy = f*f*70; }
      else               { st = 'home';   open = doorsOpenByDay ? 1 : 1 - (p - 0.97)/0.03; }
      if (dy > 0) alpha = Math.max(0, Math.min(1, (160 - (116 + dy)) / 22 + 0.3));
      return { kind, st, dy, open, lights, alpha };
    };

    const drawVehicle = (bx, v) => {
      if (v.st === 'away' || v.alpha <= 0) return;
      const by = 116 + v.dy;
      ctx.globalAlpha = v.alpha;
      if (v.lights && on) {                                                     // light spill on the apron
        dot(bx + 12, by + 4, 12, flash ? 'rgba(255,50,40,0.16)' : 'rgba(60,90,255,0.16)');
        dot(bx + 24, by + 4, 12, flash ? 'rgba(60,90,255,0.16)' : 'rgba(255,50,40,0.16)');
      }
      const bar = (x, w, y) => {
        R(x, y, w/2, 3, v.lights && on ? (flash ? '#ff3a2a' : '#5a1e1a') : '#6a2420');
        R(x + w/2, y, w/2, 3, v.lights && on ? (flash ? '#2a3a6a' : '#3a6aff') : '#20306a');
      };
      if (v.kind === 'engine') {
        R(bx + 4, by - 47, 28, 3, '#b8bcc0');                                   // ladder
        for (let k = 1; k < 6; k++) ln(bx + 4 + k*4.6, by - 47, bx + 4 + k*4.6, by - 44, '#8a8e92', 0.4);
        R(bx + 2.5, by - 42, 31, 38, '#c8261e');
        bar(bx + 8, 20, by - 45);
        R(bx + 5.5, by - 38, 25, 11, '#1e2a36');
        R(bx + 2.5, by - 20, 31, 3, '#f2f2ee');
        R(bx + 11, by - 15, 14, 8, '#34343a');
        for (let g = 1; g < 4; g++) ln(bx + 11, by - 15 + g*2, bx + 25, by - 15 + g*2, '#56565c', 0.3);
        dot(bx + 6.5, by - 10, 1.8, on ? '#fff6d0' : '#8a8a80'); dot(bx + 29.5, by - 10, 1.8, on ? '#fff6d0' : '#8a8a80');
        R(bx + 4, by - 4, 7, 4, '#141414'); R(bx + 25, by - 4, 7, 4, '#141414');
      } else if (v.kind === 'ambulance') {
        R(bx + 3.5, by - 40, 29, 36, '#f4f4f0');
        bar(bx + 8, 20, by - 43);
        R(bx + 7, by - 36, 22, 10, '#1e2a36');
        R(bx + 3.5, by - 21, 29, 3.5, '#d02a2a');
        R(bx + 16, by - 16, 4, 9, '#2f6fd0'); R(bx + 13.5, by - 13.5, 9, 4, '#2f6fd0');   // star of life (cross form)
        dot(bx + 7, by - 9, 1.6, on ? '#fff6d0' : '#8a8a80'); dot(bx + 29, by - 9, 1.6, on ? '#fff6d0' : '#8a8a80');
        R(bx + 5, by - 4, 6, 4, '#141414'); R(bx + 25, by - 4, 6, 4, '#141414');
      } else {
        R(bx + 7, by - 28, 22, 24, '#b8302a');
        bar(bx + 11, 14, by - 31);
        R(bx + 9, by - 25, 18, 8, '#1e2a36');
        R(bx + 7, by - 14, 22, 2.5, '#f0c020');
        dot(bx + 10, by - 9, 1.4, on ? '#fff6d0' : '#8a8a80'); dot(bx + 26, by - 9, 1.4, on ? '#fff6d0' : '#8a8a80');
        R(bx + 8, by - 4, 5, 4, '#141414'); R(bx + 23, by - 4, 5, 4, '#141414');
      }
      ctx.globalAlpha = 1;
    };

    const fleet = FLEET.map((_, i) => vehicleAt(i));
    BAYS.forEach((bx, i) => {
      const v = fleet[i];
      R(bx - 2.5, 55, 41, 63, TRIM);                                            // bay surround
      txt(String(i + 1), bx + 18, 61, 5, BRICK_SH);
      R(bx, 64, 36, 54, on ? (night ? '#3a3228' : '#2c2a28') : '#1e1c1a');       // bay interior
      if (on) R(bx + 4, 65, 28, 1.5, night ? '#fff0c8' : '#d8d4c8');             // ceiling strip light
      if (v.dy === 0) drawVehicle(bx, v);                                        // parked / in the bay
      const doorH = (1 - v.open) * 54;
      if (doorH > 0.5) {
        R(bx, 64, 36, doorH, '#cfd4d6');
        for (let k = 1; k < 9; k++) { const ly = 64 + k*6; if (ly < 64 + doorH) ln(bx, ly, bx + 36, ly, 'rgba(90,96,100,0.45)', 0.35); }
        if (doorH > 30) for (let k = 0; k < 4; k++) R(bx + 3 + k*8.5, 64 + doorH*0.45, 6, 4, night && on ? 'rgba(255,220,160,0.6)' : '#3a4a58');
      }
      if (on && night) {                                                        // bay floodlight
        dot(bx + 18, 57, 1.6, '#fff0c8');
        poly([[bx + 12, 118], [bx + 24, 118], [bx + 30, 138], [bx + 6, 138]], 'rgba(255,236,190,0.07)');
      }
    });
    // Vehicles out on the apron draw over the bay fronts
    BAYS.forEach((bx, i) => { if (fleet[i].dy > 0) drawVehicle(bx, fleet[i]); });

    // ── Dispatch wing ────────────────────────────────────────────────
    R(156, 26, 80, 92, '#e6dfd2');
    R(154, 22, 84, 5, '#5a5e62');
    R(156, 26, 3, 92, '#d2cabc');
    for (let fl = 0; fl < 2; fl++) for (let k = 0; k < 4; k++) {
      const wx = 163 + k*18, wy = 36 + fl*28;
      const lit = on && (night ? hash(fl*4 + k + 20) < 0.8 : false);
      R(wx - 1, wy - 1, 14, 20, '#b8b0a2');
      R(wx, wy, 12, 18, lit ? 'rgba(255,214,150,0.9)' : (on ? (night ? '#1c2430' : '#6f90ac') : '#2a3038'));
      if (on && !night && k === (Math.floor(t*0.4) % 4) && fl === 0) {          // dispatcher at a console
        dot(wx + 6, wy + 8, 2, '#e8c8a8'); R(wx + 3.5, wy + 10, 5, 8, '#2a4a7a');
      }
    }
    R(160, 96, 72, 16, '#b8302a');                                              // the sign
    txt('EMERGENCY', 196, 103.5, 6.5, '#ffffff');
    txt('SERVICES', 196, 110.5, 6.5, '#ffffff');
    R(186, 112, 20, 6, '#6a5a4a');                                              // entrance
    if (on) R(188, 113, 16, 5, night ? 'rgba(255,214,150,0.8)' : 'rgba(150,190,220,0.6)');

    // ── Radio mast and beacon ────────────────────────────────────────
    ln(222, 22, 222, -6, '#6a6e72', 1);
    for (let k = 0; k < 4; k++) { ln(219, 20 - k*6.5, 225, 14 - k*6.5, '#6a6e72', 0.45); ln(225, 20 - k*6.5, 219, 14 - k*6.5, '#6a6e72', 0.45); }
    ln(222, 4, 230, 1, '#8a8e92', 0.6); dot(231, 1, 2.2, '#b8bcc0');                // dish
    if (on) {
      const blink = Math.sin(t*3) > 0.3;
      dot(222, -7, 2.4, blink ? '#ff3a2a' : '#5a1e1a');
      if (blink) dot(222, -7, 5.5, 'rgba(255,60,40,0.25)');
    }

    // Unpowered: doors down, lights and windows dark (above) — no dimming box,
    // just the tag, in the apron spot KEEP CLEAR leaves free when unpowered.
    if (!on) {
      ctx.fillStyle = 'rgba(255,90,70,0.9)'; ctx.font = `bold ${7*s}px Courier New`; ctx.textAlign = 'center';
      ctx.fillText('NO POWER', X(92), Y(150)); ctx.textAlign = 'left';
    }
  }

function renderGovCivic(e, px, py, t) {
    // Buildings with a dedicated sprite bypass the generic template below.
    // (Add future custom civic sprites here the same way.)
    if (e.type === T.HOSPITAL)     { renderHospital(e, px, py, t);    return; }
    if (e.type === T.TOWNHALL)     { renderTownHall(e, px, py, t);    return; }
    if (e.type === T.CIVICCENTER)  { renderCivicCenter(e, px, py, t); return; }
    if (e.type === T.COURTHOUSE)   { renderCourthouse(e, px, py, t);  return; }
    if (e.type === T.EMS)          { renderEMS(e, px, py, t);         return; }
    if (e.type === T.UNIVERSITY)   { renderUniversity(e, px, py, t);  return; }
    if (e.type === T.TRANSPORTHUB) { renderTransportHub(e, px, py, t); return; }
    if (e.type === T.NATIONALGOV)  { renderNationalGov(e, px, py, t);  return; }
    if (e.type === T.FUSIONLAB)    { renderFusionLab(e, px, py, t);    return; }
    if (e.type === T.AIRPORT)      { renderAirport(e, px, py, t);      return; }
    if (e.type === T.MILITARYBASE) { renderMilitaryBase(e, px, py, t); return; }
    // The same sprite it had as an industrial customer (render_residential_commercial.js).
    if (e.type === T.LAUNCHCOMPLEX) { _renderSpaceport(e, px, py, TILE * (e.width || 27), TILE * (e.height || 18), t); return; }
    if (e.type === T.NATIONALGRID) { renderMeridianStation(e, px, py, t); return; }
    if (e.type === T.COMPANYHQ)    { renderCompanyHQ(e, px, py, t);       return; }   // render_company_hq.js

    const def = EntityDefs[e.type];
    const W = TILE*(e.width||4), H = TILE*(e.height||4);
    const cx = px+W/2, cy = py+H/2;
    const on = e.powered;
    const pulse = 0.6 + 0.4*Math.sin(t*1.5);
    const glow = def.glowColor || '#c0a030';

    // Base
    ctx.fillStyle = '#0e0e1a';
    ctx.beginPath(); ctx.roundRect(px+2, py+2, W-4, H-4, 4); ctx.fill();
    ctx.strokeStyle = on ? glow.replace(')', `,${pulse})`.replace('rgb', 'rgba')) : '#1a1a2a';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(px+2, py+2, W-4, H-4, 4); ctx.stroke();

    // Columns
    const cols = Math.max(2, Math.floor(e.width/2));
    for (let i = 0; i < cols; i++) {
      const cx2 = px + W*(0.15 + i*(0.7/(cols-1||1)));
      ctx.fillStyle = on ? glow+'80' : '#1a1a2a';
      ctx.fillRect(cx2-2, py+H*0.25, 3, H*0.5);
    }

    // Roof pediment
    ctx.fillStyle = on ? glow+'40' : '#12121e';
    ctx.beginPath();
    ctx.moveTo(px+W*0.08, py+H*0.28);
    ctx.lineTo(cx, py+H*0.1);
    ctx.lineTo(px+W*0.92, py+H*0.28);
    ctx.closePath(); ctx.fill();

    // Name label
    ctx.fillStyle = on ? glow : '#303040';
    ctx.font = `bold ${Math.max(5, Math.min(8, TILE*0.28))}px Courier New`;
    ctx.textAlign = 'center';
    const name = def.label.toUpperCase();
    ctx.fillText(name.length > 16 ? name.slice(0,14)+'..' : name, cx, py+H*0.88);

    // Income label
    ctx.fillStyle = on ? 'rgba(64,220,80,0.85)' : '#1a301a';
    ctx.font = '5px Courier New';
    ctx.fillText(on ? `+$${def.income}/s` : 'NO POWER', cx, py+H*0.96);
    ctx.textAlign = 'left';
  }

// Fountain Plaza (3×3) — paved sandstone plaza on a cross of paths, corner
// hedge beds, benches and lamps, and a two-tier stone fountain: a jet
// arcing out of the finial, water curtains spilling bowl → bowl → basin,
// expanding ripples, glints on the surface and a few coins on the bottom.
function renderFountainPlaza(e, px, py, w, h, t) {
    const cx = px + w/2, cy = py + h/2;
    const seed = (e.col || 0) * 0.37 + (e.row || 0) * 0.91;
    const TAU = Math.PI * 2;

    // Grass ground
    ctx.fillStyle = '#1a2e10';
    ctx.fillRect(px+1, py+1, w-2, h-2);
    for (let gi = 0; gi < 4; gi++) {
      const gx = gi % 2 ? px + w*0.82 : px + w*0.18;
      const gy = gi < 2 ? py + h*0.18 : py + h*0.82;
      ctx.fillStyle = 'rgba(60,140,30,0.22)';
      ctx.beginPath(); ctx.ellipse(gx, gy, w*0.14, h*0.12, 0, 0, TAU); ctx.fill();
    }

    // Cross of footpaths out to each edge
    const pathW = w * 0.17;
    ctx.fillStyle = '#6a5c44';
    ctx.fillRect(cx - pathW/2, py+1, pathW, h-2);
    ctx.fillRect(px+1, cy - pathW/2, w-2, pathW);
    ctx.strokeStyle = 'rgba(190,170,120,0.45)'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - pathW/2, py+1); ctx.lineTo(cx - pathW/2, py+h-1);
    ctx.moveTo(cx + pathW/2, py+1); ctx.lineTo(cx + pathW/2, py+h-1);
    ctx.moveTo(px+1, cy - pathW/2); ctx.lineTo(px+w-1, cy - pathW/2);
    ctx.moveTo(px+1, cy + pathW/2); ctx.lineTo(px+w-1, cy + pathW/2);
    ctx.stroke();

    // Paved circular plaza
    const plazaR = Math.min(w, h) * 0.44;
    const pg = ctx.createRadialGradient(cx, cy, plazaR*0.3, cx, cy, plazaR);
    pg.addColorStop(0, '#9a8a68');
    pg.addColorStop(1, '#6c5f46');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(cx, cy, plazaR, 0, TAU); ctx.fill();
    // Concentric sett rings + radial seams
    ctx.strokeStyle = 'rgba(40,30,18,0.28)'; ctx.lineWidth = 0.6;
    for (const f of [0.66, 0.8, 0.93]) {
      ctx.beginPath(); ctx.arc(cx, cy, plazaR*f, 0, TAU); ctx.stroke();
    }
    ctx.beginPath();
    for (let k = 0; k < 28; k++) {
      const a = k / 28 * TAU + (k % 2) * 0.05;
      ctx.moveTo(cx + Math.cos(a)*plazaR*0.66, cy + Math.sin(a)*plazaR*0.66);
      ctx.lineTo(cx + Math.cos(a)*plazaR*0.99, cy + Math.sin(a)*plazaR*0.99);
    }
    ctx.stroke();
    // Decorative inlay ring in a darker stone
    ctx.strokeStyle = 'rgba(150,80,50,0.45)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(cx, cy, plazaR*0.73, 0, TAU); ctx.stroke();
    // Kerb around the plaza
    ctx.strokeStyle = '#c2b28a'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, plazaR, 0, TAU); ctx.stroke();

    // Corner hedge beds with flowers
    const flowerCols = ['#e04070', '#f0b020', '#c050e0', '#f07040', '#60b8f0'];
    for (let q = 0; q < 4; q++) {
      const sx = q % 2 ? 1 : -1, sy = q < 2 ? -1 : 1;
      const hx = cx + sx * w*0.40, hy = cy + sy * h*0.40;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.arc(hx+1.5, hy+2, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#245a14';
      ctx.beginPath(); ctx.arc(hx, hy, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a8a1e';
      ctx.beginPath(); ctx.arc(hx - 2, hy - 2.5, 5.5, 0, TAU); ctx.fill();
      for (let fI = 0; fI < 5; fI++) {
        const a = fI * 1.3 + q;
        const fr = 3 + (fI % 3) * 1.8;
        const bob = Math.sin(t*1.4 + fI + q) * 0.4;
        ctx.fillStyle = flowerCols[(fI + q) % flowerCols.length];
        ctx.beginPath(); ctx.arc(hx + Math.cos(a)*fr, hy + Math.sin(a)*fr + bob, 1.3, 0, TAU); ctx.fill();
      }
    }

    // Benches on the diagonals, facing the fountain
    for (let q = 0; q < 4; q++) {
      const a = Math.PI/4 + q * Math.PI/2;
      const bR = plazaR * 0.84;
      ctx.save();
      ctx.translate(cx + Math.cos(a)*bR, cy + Math.sin(a)*bR);
      ctx.rotate(a + Math.PI/2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-4.5, 0.5, 10, 3.5);
      ctx.fillStyle = '#8a5a2a';
      ctx.fillRect(-5, -1, 10, 2.6);          // seat
      ctx.fillStyle = '#6a4218';
      ctx.fillRect(-5, 1.8, 10, 1.2);         // backrest (outer side)
      ctx.fillStyle = 'rgba(255,220,160,0.25)';
      ctx.fillRect(-5, -1, 10, 0.7);
      ctx.restore();
    }

    // Basin
    const R = w * 0.25;          // outer rim
    const Rw = R - 3.5;          // water edge
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(cx+2, cy+2.5, R+0.5, 0, TAU); ctx.fill();
    // Soft mist halo on the paving
    const mist = ctx.createRadialGradient(cx, cy, R*0.8, cx, cy, R*1.45);
    mist.addColorStop(0, 'rgba(160,220,255,0.18)');
    mist.addColorStop(1, 'rgba(160,220,255,0)');
    ctx.fillStyle = mist;
    ctx.beginPath(); ctx.arc(cx, cy, R*1.45, 0, TAU); ctx.fill();
    // Stone rim
    ctx.fillStyle = '#d6cab0';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#8c806a'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.beginPath();
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * TAU;
      ctx.moveTo(cx + Math.cos(a)*Rw, cy + Math.sin(a)*Rw);
      ctx.lineTo(cx + Math.cos(a)*R,  cy + Math.sin(a)*R);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,250,235,0.5)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(cx, cy, R - 0.8, Math.PI*1.05, Math.PI*1.7); ctx.stroke();

    // Water
    const wg = ctx.createRadialGradient(cx - Rw*0.3, cy - Rw*0.3, 1, cx, cy, Rw);
    wg.addColorStop(0, '#48b0dc');
    wg.addColorStop(0.6, '#2a82b4');
    wg.addColorStop(1, '#1a5a88');
    ctx.fillStyle = wg;
    ctx.beginPath(); ctx.arc(cx, cy, Rw, 0, TAU); ctx.fill();
    // Inner rim shadow
    ctx.strokeStyle = 'rgba(8,30,50,0.45)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, Rw - 0.4, 0, TAU); ctx.stroke();

    // Coins glinting on the bottom
    for (let c = 0; c < 4; c++) {
      const a = seed * 3 + c * 1.9, cr = Rw * (0.62 + (c % 2) * 0.22);
      const tw = 0.45 + 0.45 * Math.max(0, Math.sin(t*2.3 + c*1.7 + seed));
      ctx.fillStyle = `rgba(240,200,90,${tw})`;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a)*cr, cy + Math.sin(a)*cr, 0.9, 0, TAU); ctx.fill();
    }

    // Ripples expanding from where the curtain lands
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 3; i++) {
      const p = (t*0.4 + i/3) % 1;
      const rr = 15 + p * (Rw - 15.5);
      ctx.strokeStyle = `rgba(200,240,255,${0.4 * (1 - p)})`;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke();
    }
    // Surface glints drifting around the basin
    ctx.lineWidth = 1;
    for (let k = 0; k < 7; k++) {
      const a = k * 0.9 + t * 0.25 + seed;
      const gr = Rw * (0.72 + 0.18 * Math.sin(k*2.1));
      const al = 0.25 + 0.35 * Math.max(0, Math.sin(t*3 + k*1.3));
      ctx.strokeStyle = `rgba(235,250,255,${al})`;
      ctx.beginPath(); ctx.arc(cx, cy, gr, a, a + 0.22); ctx.stroke();
    }

    // Lower tier — column shadow + bowl
    const lY = cy - 2, lR = 10;
    ctx.fillStyle = 'rgba(0,20,40,0.35)';
    ctx.beginPath(); ctx.arc(cx+1.5, cy+2, lR*0.9, 0, TAU); ctx.fill();
    // Curtain spilling from the lower bowl into the basin
    ctx.save();
    ctx.setLineDash([2.2, 2.2]);
    ctx.lineDashOffset = -t * 14;
    ctx.strokeStyle = 'rgba(190,235,255,0.7)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      ctx.moveTo(cx + ca*lR, lY + sa*lR);
      ctx.quadraticCurveTo(cx + ca*(lR+4), lY + sa*(lR+2.5) - 1, cx + ca*15, cy + sa*15 + 1);
    }
    ctx.stroke();
    ctx.restore();
    // Splash sparkles where it lands
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * TAU + 0.3;
      const al = Math.max(0, Math.sin(t*7 + k*2.3));
      ctx.fillStyle = `rgba(235,250,255,${0.6*al})`;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a)*15.5, cy + Math.sin(a)*15.5 + 1, 0.8, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#cfc2a4';
    ctx.beginPath(); ctx.arc(cx, lY, lR, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#8a7e66'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.arc(cx, lY, lR, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#3496c6';
    ctx.beginPath(); ctx.arc(cx, lY, lR - 2, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(210,245,255,${0.35 + 0.2*Math.sin(t*3)})`; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.arc(cx, lY, lR - 3.5 + Math.sin(t*2.5)*0.8, 0, TAU); ctx.stroke();

    // Upper tier
    const uY = cy - 8, uR = 5;
    ctx.fillStyle = 'rgba(0,20,40,0.35)';
    ctx.beginPath(); ctx.arc(cx+1, lY+1.5, 3.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#bfb294';
    ctx.fillRect(cx - 1.4, uY, 2.8, lY - uY);          // column
    ctx.save();
    ctx.setLineDash([1.6, 1.6]);
    ctx.lineDashOffset = -t * 12;
    ctx.strokeStyle = 'rgba(200,240,255,0.75)'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      ctx.moveTo(cx + ca*uR, uY + sa*uR);
      ctx.quadraticCurveTo(cx + ca*(uR+2.5), uY + sa*(uR+1.5), cx + ca*(lR-3), lY + sa*(lR-3));
    }
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#ddd2b8';
    ctx.beginPath(); ctx.arc(cx, uY, uR, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#8a7e66'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.arc(cx, uY, uR, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#3ea4d4';
    ctx.beginPath(); ctx.arc(cx, uY, uR - 1.3, 0, TAU); ctx.fill();

    // Finial + spout
    const sY = uY - 4;
    ctx.fillStyle = '#e8dec6';
    ctx.fillRect(cx - 0.9, sY, 1.8, uY - sY);
    ctx.beginPath(); ctx.arc(cx, sY, 1.4, 0, TAU); ctx.fill();

    // Central jet — droplets arcing up and falling back into the top bowl
    const jetH = 9;
    for (let i = 0; i < 16; i++) {
      const p = (t*0.85 + i/16) % 1;
      const a = i * 2.39996 + seed;
      const spread = 3.2 + (i % 3);
      const dx = Math.cos(a) * spread * p;
      const dy = Math.sin(a) * spread * p * 0.6;
      const lift = jetH * 4 * p * (1 - p);
      ctx.fillStyle = `rgba(215,245,255,${0.85 - p*0.5})`;
      ctx.beginPath(); ctx.arc(cx + dx, sY + dy + 4*p - lift, 0.75, 0, TAU); ctx.fill();
    }
    // Jet core
    const core = ctx.createLinearGradient(cx, sY - jetH, cx, sY);
    core.addColorStop(0, 'rgba(220,248,255,0)');
    core.addColorStop(1, 'rgba(220,248,255,0.8)');
    ctx.strokeStyle = core; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx, sY); ctx.lineTo(cx + Math.sin(t*4)*0.3, sY - jetH + Math.sin(t*6)*0.8); ctx.stroke();

    // Lamps on the path edges, just outside the plaza
    for (let q = 0; q < 4; q++) {
      const a = q * Math.PI/2;
      const lx = cx + Math.cos(a)*(plazaR - 3) + Math.sin(a)*(pathW/2 + 3);
      const ly = cy + Math.sin(a)*(plazaR - 3) - Math.cos(a)*(pathW/2 + 3);
      const glow = 0.8 + 0.2 * Math.sin(t*2 + q);
      ctx.fillStyle = `rgba(255,215,120,${0.14*glow})`;
      ctx.beginPath(); ctx.arc(lx, ly, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = '#403a30';
      ctx.beginPath(); ctx.arc(lx, ly, 1.8, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,225,140,${glow})`;
      ctx.beginPath(); ctx.arc(lx, ly, 1.1, 0, TAU); ctx.fill();
    }

    // Visitors strolling around the plaza ring
    const visitorCols = ['#d8b890', '#90b8e0', '#d890b0'];
    for (let i = 0; i < 3; i++) {
      const dir = i % 2 ? -1 : 1;
      const a = t * 0.12 * dir + i * 2.1 + seed;
      const vr = plazaR * 0.6;
      const vx = cx + Math.cos(a)*vr, vy = cy + Math.sin(a)*vr;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.arc(vx+0.8, vy+1, 1.6, 0, TAU); ctx.fill();
      ctx.fillStyle = visitorCols[i];
      ctx.beginPath(); ctx.arc(vx, vy, 1.6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a2a1e';
      ctx.beginPath(); ctx.arc(vx, vy, 0.8, 0, TAU); ctx.fill();
    }

    // Pigeons pecking on the paving
    for (let i = 0; i < 3; i++) {
      const a = seed * 5 + i * 0.5 + 2.4;
      const pr = plazaR * (0.5 + i * 0.05);
      const hop = Math.max(0, Math.sin(t*1.7 + i*2.2)) > 0.97 ? 0.6 : 0;
      const bx = cx + Math.cos(a)*pr + Math.sin(t*0.3 + i)*1.2;
      const by = cy + Math.sin(a)*pr - hop;
      const peck = Math.sin(t*6 + i*3) > 0.5 ? 0.6 : 0;
      ctx.fillStyle = '#8a8c94';
      ctx.beginPath(); ctx.ellipse(bx, by, 1.4, 1, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#a8aab4';
      ctx.beginPath(); ctx.arc(bx + 1.2, by - 0.3 + peck, 0.6, 0, TAU); ctx.fill();
    }

    // Selection-style soft border, same as the other park types
    ctx.strokeStyle = '#60c0f0'; ctx.lineWidth = 1;
    ctx.globalAlpha = 0.35 + 0.1*Math.sin(t*2);
    ctx.strokeRect(px+1, py+1, w-2, h-2);
    ctx.globalAlpha = 1;
  }

// Shade tree shared by the Small Park and Tree-Lined Street: a tapered
// trunk under a canopy built up from dark → mid → light lobes so it reads
// as rounded rather than a flat disc, with its shadow cast to the right.
// (bx, by) is the trunk base, r the canopy radius, s the detail scale.
// The canopy reaches 1.9r above the base and 1.35r either side.
const PARK_TREE_PALETTES = [
  { dk: '#1f5a1a', md: '#2f7e24', lt: '#5cb23a' },
  { dk: '#1c4e22', md: '#2e7430', lt: '#6ab050' },
  { dk: '#6a3a52', md: '#b0608a', lt: '#f0a8cc', blossom: true },
];
function _drawParkTree(bx, by, r, s, pal, sway, speck = 0) {
  const P = PARK_TREE_PALETTES[pal % PARK_TREE_PALETTES.length];
  const dot = (x, y, rr) => { ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI*2); ctx.fill(); };
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(bx + r*0.45, by, r*0.9, r*0.32, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#4a2e14';
  ctx.beginPath();
  ctx.moveTo(bx - 1.6*s, by); ctx.lineTo(bx + 1.6*s, by);
  ctx.lineTo(bx + 0.8*s + sway*0.3, by - r*0.9); ctx.lineTo(bx - 0.8*s + sway*0.3, by - r*0.9);
  ctx.closePath(); ctx.fill();
  const cx = bx + sway, cy = by - r*1.05;
  ctx.fillStyle = P.dk;
  dot(cx, cy + r*0.15, r); dot(cx - r*0.55, cy + r*0.3, r*0.62); dot(cx + r*0.6, cy + r*0.25, r*0.6);
  ctx.fillStyle = P.md;
  dot(cx - r*0.15, cy - r*0.05, r*0.78); dot(cx + r*0.4, cy + r*0.05, r*0.5);
  ctx.fillStyle = P.lt;
  dot(cx - r*0.35, cy - r*0.35, r*0.38); dot(cx + r*0.15, cy - r*0.5, r*0.22);
  if (P.blossom) {
    ctx.fillStyle = '#fde6f0';
    for (let k=0;k<7;k++) {
      const a = Math.sin(speck*12.9898 + k*78.233) * 43758.5453;
      const b = Math.sin(speck*39.3468 + k*11.135) * 24634.6345;
      dot(cx + (a - Math.floor(a) - 0.5)*r*1.4, cy + (b - Math.floor(b) - 0.5)*r*1.2, 0.7*s);
    }
  }
}

function renderFarmersMarket(e, px, py, w, h, t) {
    // Farmers Market — a brick-paved square with bunting strung overhead and
    // a row of stalls under scalloped striped awnings, each its own vendor:
    // a produce stand, a bakery, a flower stall, honey and preserves. It
    // keeps market hours. From 07:00 vendors stand behind laden counters and
    // shoppers with baskets drift along the aisle (busiest through the
    // morning); from 18:00 the stalls are packed away under tarps, and after
    // dark the string lights along the bunting come on. Which vendor has
    // which stall, the awning colours and who's shopping come from the
    // tile. Authored in an 80-unit-tall space scaled by `u`.
    const u = h / 80;
    const Wu = w / u;
    const X = (v) => px + v*u, Y = (v) => py + v*u;
    const R = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), ww*u, hh*u); };
    const RR = (x, y, ww, hh, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(X(x), Y(y), ww*u, hh*u, r*u); ctx.fill(); };
    const dot = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(x), Y(y), r*u, 0, Math.PI*2); ctx.fill(); };
    const ln = (x1, y1, x2, y2, c, lw) => { ctx.strokeStyle = c; ctx.lineWidth = lw*u; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
    const hash = (k) => { const v = Math.sin((e.col||0)*12.9898 + (e.row||0)*78.233 + k*37.719)*43758.5453; return v - Math.floor(v); };
    const hr = DayNight.hour(), dark = DayNight.darkness();
    const open = hr >= 7 && hr < 18;
    const busy = hr >= 8 && hr < 14;
    const detail = Camera.zoom > 0.5;

    ctx.save();
    ctx.lineCap = 'round';

    // ── Brick-paved square with a stone aisle ────────────────────────
    RR(1, 1, Wu - 2, 78, 3, '#b0967a');
    if (detail) {
      ctx.strokeStyle = 'rgba(90,64,44,0.35)'; ctx.lineWidth = 0.5*u; ctx.beginPath();
      for (let y = 5, row = 0; y < 78; y += 5, row++) {
        ctx.moveTo(X(2), Y(y)); ctx.lineTo(X(Wu - 2), Y(y));
        for (let x = 2 + (row % 2 ? 5 : 0); x < Wu - 2; x += 10) { ctx.moveTo(X(x), Y(y - 5)); ctx.lineTo(X(x), Y(y)); }
      }
      ctx.stroke();
    }
    R(2, 60, Wu - 4, 11, '#cdbfa8');
    R(2, 60, Wu - 4, 1, 'rgba(0,0,0,0.12)');

    // ── Stalls ───────────────────────────────────────────────────────
    const n = Math.max(3, Math.round((Wu - 8) / 50));
    const sw = (Wu - 8) / n;
    const AWN = [['#c83a2e', '#f2ebdc'], ['#2e6ab0', '#f2ebdc'], ['#3a8a4a', '#f2ebdc'], ['#e0a020', '#f2ebdc'], ['#8a4a9a', '#f2ebdc']];
    const kinds = ['produce', 'bakery', 'flowers', 'honey'];
    const kOff = Math.floor(hash(1) * kinds.length), aOff = Math.floor(hash(2) * AWN.length);
    for (let s = 0; s < n; s++) {
      const x0 = 4 + s*sw, kind = kinds[(s + kOff) % kinds.length], [ca, cb] = AWN[(s + aOff) % AWN.length];
      // back table and posts
      R(x0 + 3, 20, 2, 36, '#6a4a2e'); R(x0 + sw - 5, 20, 2, 36, '#6a4a2e');
      // vendor behind the counter
      if (open) {
        const vx = x0 + sw*(0.35 + hash(10 + s)*0.3), bob = Math.sin(t*1.2 + s)*0.4;
        const apron = ['#3a5a8a', '#8a3a3a', '#4a6a3a', '#6a5a3a'][(s + kOff) % 4];
        RR(vx - 5, 30 + bob, 10, 9, 3, apron);
        dot(vx, 27 + bob, 3.4, ['#e8c4a0', '#c89870', '#8a6448', '#f0d0b0'][Math.floor(hash(20 + s)*4)]);
        if (kind === 'bakery') { R(vx - 3.4, 22.2 + bob, 6.8, 2.6, '#f4f4f0'); }                         // baker's cap
        else { ctx.fillStyle = '#4a3222'; ctx.beginPath(); ctx.arc(X(vx), Y(26 + bob), 3.4*u, Math.PI, 0); ctx.fill(); }
      }
      // counter
      R(x0 + 1, 38, sw - 2, 16, '#8a5a34');
      R(x0 + 1, 38, sw - 2, 2.5, '#a8744a');
      if (detail) for (let k = 1; k < 4; k++) R(x0 + 1, 40 + k*3.6, sw - 2, 0.5, 'rgba(0,0,0,0.18)');
      // goods on the counter, or a tarp once packed away
      if (open) {
        const gx0 = x0 + 4, gw = sw - 8;
        if (kind === 'produce') {
          const cols = ['#d8322a', '#6ab83a', '#f08a20', '#e8c030'];
          for (let c = 0; c < 4; c++) {
            const cx0 = gx0 + c*(gw/4);
            R(cx0 + 0.5, 34.5, gw/4 - 1, 4, '#6a4a2e');
            for (let k = 0; k < 3; k++) dot(cx0 + 2 + k*((gw/4 - 4)/2), 34.2 - (k % 2)*0.8, 1.6, cols[c]);
          }
        } else if (kind === 'bakery') {
          for (let k = 0; k < 5; k++) {
            ctx.fillStyle = k % 2 ? '#c88a44' : '#e0a860';
            ctx.beginPath(); ctx.ellipse(X(gx0 + 3 + k*((gw - 6)/4)), Y(35.5), 3.2*u, 2*u, 0, 0, Math.PI*2); ctx.fill();
            if (detail) ln(gx0 + 2 + k*((gw - 6)/4), 35, gx0 + 4 + k*((gw - 6)/4), 34.6, 'rgba(90,50,20,0.5)', 0.4);
          }
          ln(gx0 + 1, 32, gx0 + gw*0.45, 30, '#d8a058', 1.8);                                           // baguette
        } else if (kind === 'flowers') {
          const cols = ['#e04a8a', '#f0c030', '#f4f0f0', '#b060e0', '#e86a3a'];
          for (let k = 0; k < 4; k++) {
            const bx = gx0 + 2 + k*((gw - 4)/3);
            R(bx - 2.4, 33.5, 4.8, 5, '#5a6a7a');
            for (let f = 0; f < 4; f++) dot(bx - 1.8 + (f % 2)*3.6, 31.5 - Math.floor(f/2)*2.2, 1.3, cols[(k + f + Math.floor(hash(30 + s)*5)) % cols.length]);
            dot(bx, 30.2, 1.2, '#4a8a3a');
          }
        } else {
          for (let k = 0; k < 6; k++) {
            const jx = gx0 + 1.5 + k*((gw - 3)/5);
            RR(jx - 1.7, 33, 3.4, 5, 0.8, k % 3 === 2 ? '#8a2a44' : '#e0a020');
            R(jx - 1.9, 32.2, 3.8, 1.1, '#f2ebdc');
          }
        }
        // price chalkboard on the counter front
        RR(x0 + sw*0.5 - 7, 44, 14, 7, 1, '#2a302c');
        if (detail) { ln(x0 + sw*0.5 - 5, 46.4, x0 + sw*0.5 + 3, 46.4, 'rgba(240,240,230,0.7)', 0.5); ln(x0 + sw*0.5 - 5, 48.6, x0 + sw*0.5 + 1, 48.6, 'rgba(240,240,230,0.7)', 0.5); }
      } else {
        ctx.fillStyle = '#6e7a82';
        ctx.beginPath(); ctx.moveTo(X(x0 + 1), Y(40)); ctx.quadraticCurveTo(X(x0 + sw/2), Y(29), X(x0 + sw - 1), Y(40)); ctx.lineTo(X(x0 + sw - 1), Y(46)); ctx.lineTo(X(x0 + 1), Y(46)); ctx.closePath(); ctx.fill();
        ln(x0 + 3, 44, x0 + sw - 3, 44, 'rgba(0,0,0,0.25)', 0.6);
      }
      // scalloped striped awning
      const aw0 = x0 - 0.5, awW = sw + 1, stripes = 6;
      for (let k = 0; k < stripes; k++) R(aw0 + k*(awW/stripes), 12, awW/stripes, 9, k % 2 ? cb : ca);
      for (let k = 0; k < stripes; k++) {
        ctx.fillStyle = k % 2 ? cb : ca;
        ctx.beginPath(); ctx.arc(X(aw0 + (k + 0.5)*(awW/stripes)), Y(21), (awW/stripes/2)*u, 0, Math.PI); ctx.fill();
      }
      R(aw0, 11, awW, 1.4, 'rgba(0,0,0,0.25)');
      R(aw0, 21, awW, 0.8, 'rgba(0,0,0,0.12)');
      // warm lantern under the awning after dark
      if (dark > 0.3 && detail) {
        const g = ctx.createRadialGradient(X(x0 + sw/2), Y(28), 0, X(x0 + sw/2), Y(28), 20*u);
        g.addColorStop(0, `rgba(255,210,130,${(0.35*dark).toFixed(3)})`); g.addColorStop(1, 'rgba(255,210,130,0)');
        ctx.fillStyle = g; ctx.fillRect(X(x0 + sw/2 - 20), Y(8), 40*u, 40*u);
        dot(x0 + sw/2, 24.5, 1.2, '#ffe6a8');
      }
    }

    // ── Crates, an A-frame sign, a hand cart ─────────────────────────
    const crate = (x, y, fill) => {
      R(x, y, 9, 6, '#7a5634'); R(x, y, 9, 1.2, '#9a7048');
      if (detail) ln(x + 4.5, y + 1.2, x + 4.5, y + 6, 'rgba(0,0,0,0.25)', 0.4);
      if (fill && open) for (let k = 0; k < 3; k++) dot(x + 1.8 + k*2.7, y + 0.6, 1.2, fill);
    };
    crate(3, 72, '#d8322a'); crate(13, 72, '#6ab83a'); crate(8, 66.5, '#f08a20');
    crate(Wu - 12, 72, '#e8c030');
    // A-frame chalkboard
    ctx.fillStyle = '#5a3a24';
    ctx.beginPath(); ctx.moveTo(X(Wu - 26), Y(76)); ctx.lineTo(X(Wu - 22), Y(62)); ctx.lineTo(X(Wu - 18), Y(76)); ctx.closePath(); ctx.fill();
    RR(Wu - 25, 63.5, 6, 9, 0.8, '#2a302c');
    if (detail) for (let k = 0; k < 3; k++) ln(Wu - 24, 65.5 + k*2.3, Wu - 20, 65.5 + k*2.3, `rgba(${['240,200,80', '240,240,230', '120,220,120'][k]},0.8)`, 0.5);

    // ── Shoppers along the aisle ─────────────────────────────────────
    if (open) {
      const count = busy ? 6 : 3;
      const SHIRT = ['#c8503a', '#3a6ab0', '#4a9a5a', '#d8a030', '#8a5aa0', '#e8e4dc'];
      for (let i = 0; i < count; i++) {
        const speed = 0.035 + hash(40 + i)*0.03;
        const f = (t*speed + hash(50 + i)) % 1;
        const dir = hash(60 + i) < 0.5 ? 1 : -1;
        const sx = dir > 0 ? 6 + f*(Wu - 12) : Wu - 6 - f*(Wu - 12);
        const sy = 63 + hash(70 + i)*5;
        const step = Math.sin(t*6 + i*1.7);
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(X(sx + 1), Y(sy + 7.5), 3*u, 1*u, 0, 0, Math.PI*2); ctx.fill();
        R(sx - 1.8 + step*0.5, sy + 3.5, 1.4, 4, '#3a3e4a'); R(sx + 0.4 - step*0.5, sy + 3.5, 1.4, 4, '#3a3e4a');   // legs
        RR(sx - 2.6, sy - 2.5, 5.2, 6.5, 1.8, SHIRT[Math.floor(hash(80 + i)*SHIRT.length)]);
        dot(sx, sy - 4.5, 2.1, ['#e8c4a0', '#c89870', '#8a6448', '#f0d0b0'][Math.floor(hash(90 + i)*4)]);
        if (hash(100 + i) < 0.6) {                                   // basket on the arm
          const bx = sx + dir*3.6;
          RR(bx - 2, sy + 0.5, 4, 3, 0.8, '#b0864a');
          ctx.strokeStyle = '#8a643a'; ctx.lineWidth = 0.5*u; ctx.beginPath(); ctx.arc(X(bx), Y(sy + 0.8), 1.8*u, Math.PI, 0); ctx.stroke();
          if (hash(110 + i) < 0.5) dot(bx - 0.6, sy + 0.2, 0.9, '#d8322a');
        }
      }
    }

    // ── Bunting with string lights ───────────────────────────────────
    R(2, 2, 1.6, 12, '#6a4a2e'); R(Wu - 3.6, 2, 1.6, 12, '#6a4a2e');
    const sagY = (f) => 4 + Math.sin(Math.PI*f)*5;
    ctx.strokeStyle = 'rgba(90,70,50,0.8)'; ctx.lineWidth = 0.5*u; ctx.beginPath();
    for (let k = 0; k <= 20; k++) { const f = k/20, x = 3 + f*(Wu - 6); if (k === 0) ctx.moveTo(X(x), Y(sagY(f))); else ctx.lineTo(X(x), Y(sagY(f))); }
    ctx.stroke();
    const FLAG = ['#e04030', '#e0b030', '#40a050', '#4070d0', '#f2ebdc'];
    const flags = Math.max(8, Math.round(Wu / 10));
    for (let i = 0; i < flags; i++) {
      const f = (i + 0.5) / flags, fx = 3 + f*(Wu - 6), fy = sagY(f), sway = Math.sin(t*2 + i)*0.5;
      ctx.fillStyle = FLAG[i % FLAG.length];
      ctx.beginPath(); ctx.moveTo(X(fx - 2.4), Y(fy)); ctx.lineTo(X(fx + 2.4), Y(fy)); ctx.lineTo(X(fx + sway), Y(fy + 4.4)); ctx.closePath(); ctx.fill();
      if (dark > 0.3) {
        const bf = (i + 1) / flags, bx = 3 + bf*(Wu - 6);
        if (i < flags - 1) {
          if (detail) {
            ctx.fillStyle = `rgba(255,220,150,${(0.3*dark).toFixed(3)})`;
            ctx.beginPath(); ctx.arc(X(bx), Y(sagY(bf) + 0.6), 2.4*u, 0, Math.PI*2); ctx.fill();
          }
          dot(bx, sagY(bf) + 0.6, 0.8, '#fff0c0');
        }
      }
    }

    // faint park outline, as on the other residential amenities
    ctx.strokeStyle = '#e0b040'; ctx.lineWidth = 1;
    ctx.globalAlpha = 0.25 + 0.08*Math.sin(t*2);
    ctx.strokeRect(px + 1, py + 1, w - 2, h - 2);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

// Shared helpers for the authored-box park sprites below: a scaled drawing
// kit plus a per-site hash so each copy varies a little.
function _parkKit(e, px, py, w, h, bw, bh) {
  const s = Math.min(w/bw, h/bh);
  const ox = px + (w - bw*s)/2, oy = py + (h - bh*s)/2;
  const X = (v) => ox + v*s, Y = (v) => oy + v*s;
  const R = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), ww*s, hh*s); };
  const dot = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(x), Y(y), Math.max(0.01, r*s), 0, Math.PI*2); ctx.fill(); };
  const ln = (x1, y1, x2, y2, c, lw) => { ctx.strokeStyle = c; ctx.lineWidth = (lw || 1)*s; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
  const seed = ((e.col || 0) * 73856093) ^ ((e.row || 0) * 19349663);
  const hash = (k) => {
    let hh = (seed ^ Math.imul(k + 1, 0x9E3779B1)) | 0;
    hh = Math.imul(hh ^ (hh >>> 16), 0x85EBCA6B); hh = Math.imul(hh ^ (hh >>> 13), 0xC2B2AE35);
    return ((hh ^ (hh >>> 16)) >>> 0) / 4294967296;
  };
  return { s, X, Y, R, dot, ln, hash };
}

// Splash Pad — 3×3 spray park: a blue rubber pad with a painted sunburst,
// a ring of ground jets around a central geyser, a shade umbrella, benches
// and the pump housing that is the only reason it's on the grid. The jets
// run 10:00–19:00 while powered and dry; in rain, overnight or without
// power the pad sits still. Kids only show up while it runs. Authored in a
// 120×120 box.
function renderSplashPad(e, px, py, w, h, t) {
  const { s, X, Y, R, dot, ln, hash } = _parkKit(e, px, py, w, h, 120, 120);
  const hr = DayNight.hour(), dark = DayNight.darkness();
  const scheduled = (DemandCurves.get(T.SPLASHPAD, null, hr) || 0) > 0;
  const running = scheduled && !!e.powered;
  const detail = Camera.zoom > 0.45;

  // Concrete surround and planting strips
  R(0, 0, 120, 120, '#9a9c94');
  R(0, 0, 120, 6, '#3f6e34'); R(0, 114, 120, 6, '#3f6e34');
  for (let k = 0; k < 6; k++) { dot(8 + k*21, 3, 3.2, '#4f8a40'); dot(14 + k*21, 117, 3.2, '#4f8a40'); }
  if (detail) for (let k = 1; k < 6; k++) { ln(k*20, 6, k*20, 114, 'rgba(0,0,0,0.08)', 0.5); ln(0, 6 + k*18, 120, 6 + k*18, 'rgba(0,0,0,0.08)', 0.5); }

  // Rubber pad with a sunburst, wet sheen while running
  dot(60, 60, 46, '#2a7fb8');
  dot(60, 60, 40, '#3a95cc');
  ctx.fillStyle = '#e8c040';
  for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6;
    ctx.beginPath();
    ctx.moveTo(X(60 + Math.cos(a - 0.12)*12), Y(60 + Math.sin(a - 0.12)*12));
    ctx.lineTo(X(60 + Math.cos(a)*36), Y(60 + Math.sin(a)*36));
    ctx.lineTo(X(60 + Math.cos(a + 0.12)*12), Y(60 + Math.sin(a + 0.12)*12));
    ctx.closePath(); ctx.fill();
  }
  dot(60, 60, 11, '#f08a3a');
  dot(60, 60, 4, '#5a6068');                                               // geyser head
  if (running) {
    dot(60, 60, 46, 'rgba(200,235,255,0.16)');
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.ellipse(X(48), Y(44), 14*s, 5*s, -0.6, 0, Math.PI*2); ctx.fill();
  }

  // Ground jets in a ring, arcing inward
  const JETS = 8;
  for (let j = 0; j < JETS; j++) {
    const a = j * Math.PI * 2 / JETS + 0.2;
    const nx = 60 + Math.cos(a)*30, ny = 60 + Math.sin(a)*30;
    dot(nx, ny, 1.6, '#c8ccd0');
    if (!running) continue;
    if (Math.sin(t*1.3 + j*1.7) < -0.35) continue;                          // each jet pulses on its own rhythm
    for (let k = 0; k < 7; k++) {
      const f = (t*0.9 + k/7 + j*0.13) % 1;
      const lift = Math.sin(f*Math.PI)*11;
      dot(nx - Math.cos(a)*f*16, ny - Math.sin(a)*f*16 - lift, 1.3 - f*0.5, `rgba(215,240,255,${(0.85 - f*0.5).toFixed(2)})`);
    }
    const pf = (t*1.6 + j*0.3) % 1;                                          // splash ring where it lands
    ctx.strokeStyle = `rgba(230,248,255,${(0.5*(1 - pf)).toFixed(2)})`; ctx.lineWidth = 0.5*s;
    ctx.beginPath(); ctx.ellipse(X(nx - Math.cos(a)*16), Y(ny - Math.sin(a)*16), (1 + pf*4)*s, (0.6 + pf*2)*s, 0, 0, Math.PI*2); ctx.stroke();
  }
  // Central geyser, surging every few seconds
  if (running) {
    const surge = 0.55 + 0.45*Math.max(0, Math.sin(t*0.8));
    for (let k = 0; k < 16; k++) {
      const f = (t*1.4 + k/16) % 1;
      const ang = hash(200 + k) * Math.PI * 2;
      const r = f * 9 * surge;
      dot(60 + Math.cos(ang)*r, 60 + Math.sin(ang)*r - Math.sin(f*Math.PI)*18*surge, 1.5 - f*0.7, `rgba(225,245,255,${(0.9 - f*0.6).toFixed(2)})`);
    }
    dot(60, 60 - 10*surge, 3*surge, 'rgba(235,250,255,0.35)');
  }

  // Kids running through the jets
  if (running && dark < 0.5) {
    const SUIT = ['#e8483a', '#f0c030', '#40b060', '#d060c0', '#3a70d8'];
    const SKIN = ['#f0d0b0', '#c89870', '#8a5a3a', '#e0b890', '#6a4630'];
    const n = 3 + Math.floor(hash(1)*3);
    for (let i = 0; i < n; i++) {
      const ang = t*(0.35 + hash(10 + i)*0.4)*(hash(20 + i) < 0.5 ? 1 : -1) + hash(30 + i)*6.28;
      const rad = 14 + hash(40 + i)*22 + Math.sin(t*1.7 + i)*4;
      const kx = 60 + Math.cos(ang)*rad, ky = 60 + Math.sin(ang)*rad;
      const hop = Math.abs(Math.sin(t*7 + i*1.3))*1.2;
      dot(kx + 0.6, ky + 1, 1.8, 'rgba(0,0,0,0.22)');
      dot(kx, ky - hop, 1.9, SUIT[i % SUIT.length]);
      dot(kx, ky - hop - 0.5, 1.05, SKIN[Math.floor(hash(50 + i)*SKIN.length)]);
    }
  }

  // Shade umbrella, benches, towels
  dot(19, 22, 12.5, 'rgba(0,0,0,0.18)');
  for (let k = 0; k < 8; k++) {
    ctx.fillStyle = k % 2 ? '#f4f0e6' : '#e84a3a';
    ctx.beginPath(); ctx.moveTo(X(17), Y(19));
    ctx.arc(X(17), Y(19), 12*s, k*Math.PI/4, (k + 1)*Math.PI/4); ctx.closePath(); ctx.fill();
  }
  dot(17, 19, 1.4, '#6a6e72');
  for (const [bx, by, vert] of [[98, 10, false], [104, 30, true], [8, 92, true]]) {
    if (vert) { R(bx, by, 4, 16, '#8a6034'); R(bx + 4, by + 1, 1, 14, '#5a4028'); }
    else      { R(bx, by, 16, 4, '#8a6034'); R(bx + 1, by + 4, 14, 1, '#5a4028'); }
  }
  if (running && dark < 0.5) { R(99, 11, 5, 2.4, '#40a0e0'); R(105, 11, 5, 2.4, '#f0c030'); }

  // Pump housing — green lamp when running, flashing red when it should be but has no power
  R(96, 96, 16, 14, '#5a6258'); R(96, 96, 16, 2, '#6e776c'); R(97, 110, 16, 1.5, 'rgba(0,0,0,0.25)');
  if (detail) for (let k = 0; k < 3; k++) R(99, 100 + k*3, 7, 1, '#3e443c');
  dot(108.5, 101, 1.5, running ? '#50e070' : scheduled ? (Math.sin(t*5) > 0 ? '#ff4030' : '#5a1a14') : '#3a3e3a');
  if (dark > 0.35 && running) dot(108.5, 101, 4, 'rgba(80,224,112,0.18)');
}

// Lit Baseball Diamond — 5×4 ball field: a checker-mown outfield inside a
// warning track and padded wall with foul poles, a skinned infield with
// base paths, mound and on-deck circles, a netted backstop and press box,
// sunken dugouts, stepped bleachers, a concession stand on the concourse, an
// inning scoreboard and four floodlight masts. Games run through the day;
// from 18:00 to 22:00 they need the lights, so an unpowered field goes dark
// and empties once night falls. Authored in a 200×160 box.
// The game is played out pitch by pitch (one every 5 s): balls and strikes,
// fouls into the stands, ground balls thrown across to first, fly-outs,
// singles and doubles into the gaps and the odd home run over the wall.
// Runners stay on base from pitch to pitch and advance on the play, three
// outs end the half-inning, and the scoreboard keeps the real count, outs,
// inning and runs. A 150-pitch game is re-simulated from its first pitch
// every frame (a few hundred integer steps), so the state never drifts.
// Every movement is eased and returns to where the next pitch picks it up.
function renderBaseballField(e, px, py, w, h, t) {
  const { s, X, Y, R, dot, ln, hash } = _parkKit(e, px, py, w, h, 200, 160);
  const hr = DayNight.hour(), dark = DayNight.darkness();
  const lightsDue = (DemandCurves.get(T.BASEBALLFIELD, null, hr) || 0) > 0;
  const lit = lightsDue && !!e.powered;
  const playing = hr >= 9 && hr < 22 && (lit || dark < 0.35);
  const detail = Camera.zoom > 0.45;
  const HX = 100, HY = 142;                                                 // home plate
  const BASES = [[130, 112], [100, 82], [70, 112]];
  const A0 = -Math.PI*0.75, A1 = -Math.PI*0.25;                             // foul lines
  const poly = (pts, c) => {
    ctx.fillStyle = c; ctx.beginPath();
    pts.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)));
    ctx.closePath(); ctx.fill();
  };
  const wedgePath = (r, a0 = A0, a1 = A1) => {
    ctx.beginPath(); ctx.moveTo(X(HX), Y(HY)); ctx.arc(X(HX), Y(HY), r*s, a0, a1); ctx.closePath();
  };
  const wedge = (r, c, a0, a1) => { ctx.fillStyle = c; wedgePath(r, a0, a1); ctx.fill(); };

  // The game clock is shared by the players, the crowd and the scoreboard.
  const cyc = t*0.2 + hash(2)*10;
  const f = cyc % 1, pitchIdx = Math.floor(cyc);
  const sm = q => q <= 0 ? 0 : q >= 1 ? 1 : q*q*(3 - 2*q);
  const seg = (a, b) => sm((f - a)/(b - a));
  const mix = (p, q, k) => [p[0] + (q[0] - p[0])*k, p[1] + (q[1] - p[1])*k];
  // Pitch-by-pitch simulation of this game up to the current pitch
  const GAME = 150, g0 = pitchIdx - (pitchIdx % GAME);
  const PHn = (n, m) => _cmFrac(n*12.9898 + m*4.1414 + hash(5)*7);
  const outcomeOf = n => {
    const r = PHn(n, 1);
    return r < 0.30 ? 'ball' : r < 0.47 ? 'strike' : r < 0.59 ? 'foul' : r < 0.73 ? 'ground' : r < 0.83 ? 'fly'
         : r < 0.92 ? 'single' : r < 0.965 ? 'double' : 'homer';
  };
  let st = { bases: [0, 0, 0], outs: 0, balls: 0, strikes: 0, half: 0, runs: [0, 0] }, play = null;
  for (let n = g0; n <= pitchIdx; n++) {
    const o = outcomeOf(n), b = st.bases.slice();
    const before = { bases: b.slice(), outs: st.outs, balls: st.balls, strikes: st.strikes, half: st.half, runs: st.runs.slice() };
    let moves = [], endsAB = false, out = false, scored = 0;          // moves: [from, to] in base units, 0 = batter at home
    const advance = (k, batterTo) => {                                   // every runner up k, batter to batterTo
      for (let i = 2; i >= 0; i--) if (b[i]) { const to = i + 1 + k; moves.push([i + 1, Math.min(4, to)]); if (to >= 4) scored++; }
      moves.push([0, Math.min(4, batterTo)]); if (batterTo >= 4) scored++;
    };
    if (o === 'ball') {
      if (st.balls === 3) {                                              // walk: forced runners only
        endsAB = true; moves.push([0, 1]);
        if (b[0]) { moves.push([1, 2]); if (b[1]) { moves.push([2, 3]); if (b[2]) { moves.push([3, 4]); scored++; } } }
      }
    } else if (o === 'strike') { if (st.strikes === 2) { endsAB = true; out = true; } }
    else if (o === 'foul') { /* count only */ }
    else if (o === 'ground') { endsAB = true; out = true; for (let i = 2; i >= 0; i--) if (b[i]) { moves.push([i + 1, i + 2]); if (i === 2) scored++; } moves.push([0, 1]); }
    else if (o === 'fly') { endsAB = true; out = true; moves.push([0, 0.75]); }
    else { endsAB = true; advance(o === 'single' ? 0 : o === 'double' ? 1 : 3, o === 'single' ? 1 : o === 'double' ? 2 : 4); }
    const third = out && st.outs === 2;
    if (third) scored = 0;                                                // the inning ends before anyone scores
    if (n === pitchIdx) { play = { o, before, moves, endsAB, out, third, scored }; break; }
    // apply
    if (o === 'ball') st.balls++; else if (o === 'strike') st.strikes++; else if (o === 'foul') st.strikes = Math.min(2, st.strikes + 1);
    st.runs[st.half % 2] += scored;
    if (out) st.outs++;
    if (endsAB) { st.balls = 0; st.strikes = 0; }
    if (third) { st.outs = 0; st.half++; st.bases = [0, 0, 0]; continue; }
    // runners end where their move takes them (or stay put); the batter
    // takes the base he reached unless he was put out
    const nb = [0, 0, 0];
    for (let i = 0; i < 3; i++) if (b[i]) { const mv = moves.find(m => m[0] === i + 1), z = mv ? mv[1] : i + 1; if (z < 4) nb[z - 1] = 1; }
    const bmv = moves.find(m => m[0] === 0);
    if (bmv && !out && bmv[1] >= 1 && bmv[1] < 4) nb[bmv[1] - 1] = 1;
    st.bases = nb;
  }
  const hit = playing && ['single', 'double', 'homer', 'fly', 'ground', 'foul'].includes(play.o);
  const cheer = playing && ['single', 'double', 'homer'].includes(play.o) && f > 0.4 && f < (play.o === 'homer' ? 0.95 : 0.75);

  // ── Grounds outside the fence ─────────────────────────────────────
  R(0, 0, 200, 160, '#356a2e');
  for (let k = 0; k < 10; k++) R(k*20, 0, 10, 150, 'rgba(255,255,255,0.03)');
  // Concourse along the bottom edge
  R(0, 148, 200, 12, '#9a948a'); R(0, 148, 200, 1.2, '#b4aea2');
  if (detail) for (let k = 1; k < 20; k++) R(k*10, 149.2, 0.4, 10.8, 'rgba(0,0,0,0.12)');

  // Trees in the top-right corner, beyond the wall
  for (const [tx, ty, r] of [[160, 7, 8], [178, 12, 9], [195, 5, 7], [196, 26, 8], [188, 40, 6]]) {
    dot(tx + 2, ty + 2.5, r, 'rgba(0,0,0,0.22)');
    dot(tx, ty, r, '#2a5426');
    dot(tx - r*0.25, ty - r*0.25, r*0.62, '#3a6e32');
  }

  // ── Outfield: warning track, checker-mown grass, padded wall ───────
  wedge(134, '#a8845a');
  if (detail) {                                                             // track grit
    for (let k = 0; k < 40; k++) {
      const a = A0 + hash(300 + k)*(A1 - A0), r = 127.5 + hash(340 + k)*5.5;
      dot(HX + Math.cos(a)*r, HY + Math.sin(a)*r, 0.4, 'rgba(90,64,40,0.35)');
    }
  }
  wedge(127, '#3f7a36');
  ctx.save(); wedgePath(127); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let k = -12; k < 12; k++) {                                          // diagonal checkerboard
    ctx.beginPath();
    ctx.moveTo(X(HX + k*14), Y(HY)); ctx.lineTo(X(HX + k*14 + 7), Y(HY));
    ctx.lineTo(X(HX + k*14 + 7 - 150), Y(HY - 150)); ctx.lineTo(X(HX + k*14 - 150), Y(HY - 150));
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.045)';
  for (let k = -12; k < 12; k++) {
    ctx.beginPath();
    ctx.moveTo(X(HX + k*14), Y(HY)); ctx.lineTo(X(HX + k*14 + 7), Y(HY));
    ctx.lineTo(X(HX + k*14 + 7 + 150), Y(HY - 150)); ctx.lineTo(X(HX + k*14 + 150), Y(HY - 150));
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // Wall: dark padding with a yellow home-run line, shadow falling inward
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2*s;
  ctx.beginPath(); ctx.arc(X(HX), Y(HY), 132*s, A0, A1); ctx.stroke();
  ctx.strokeStyle = '#1f4a3a'; ctx.lineWidth = 3*s;
  ctx.beginPath(); ctx.arc(X(HX), Y(HY), 135*s, A0, A1); ctx.stroke();
  if (detail) {                                                             // pad seams
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.35*s;
    for (let k = 1; k < 24; k++) {
      const a = A0 + (A1 - A0)*k/24;
      ctx.beginPath();
      ctx.moveTo(X(HX + Math.cos(a)*133.5), Y(HY + Math.sin(a)*133.5));
      ctx.lineTo(X(HX + Math.cos(a)*136.5), Y(HY + Math.sin(a)*136.5)); ctx.stroke();
    }
  }
  ctx.strokeStyle = '#f0c838'; ctx.lineWidth = 0.7*s;
  ctx.beginPath(); ctx.arc(X(HX), Y(HY), 136.8*s, A0, A1); ctx.stroke();
  if (detail) {                                                             // distance markers
    ctx.fillStyle = '#f4f2e8'; ctx.font = `bold ${Math.max(2, 3.2*s)}px monospace`; ctx.textAlign = 'center';
    for (const [a, txt] of [[A0 + 0.12, '330'], [-Math.PI/2, '400'], [A1 - 0.12, '330']]) {
      ctx.fillText(txt, X(HX + Math.cos(a)*135), Y(HY + Math.sin(a)*135 + 1.1));
    }
    ctx.textAlign = 'left';
  }

  // ── Infield: skin, grass, base paths, mound, plate circle ──────────
  wedge(64, '#b98a5a');
  wedge(64, 'rgba(0,0,0,0.06)', A0, A0 + 0.08);                              // grass lip shade
  wedge(64, 'rgba(0,0,0,0.06)', A1 - 0.08, A1);
  poly([[100, 131], [119, 112], [100, 93], [81, 112]], '#4a8a3e');
  if (detail) {
    ctx.save();
    ctx.beginPath(); ctx.moveTo(X(100), Y(131)); ctx.lineTo(X(119), Y(112)); ctx.lineTo(X(100), Y(93)); ctx.lineTo(X(81), Y(112)); ctx.closePath(); ctx.clip();
    for (let k = 0; k < 6; k++) R(80 + k*7, 92, 3.5, 40, 'rgba(255,255,255,0.05)');
    ctx.restore();
  }
  // Base paths run in the dirt strip between the grass square and the lines
  dot(HX, HY, 10, '#b98a5a');
  for (const [bx, by] of BASES) dot(bx, by, 5.5, '#b98a5a');
  dot(100, 113, 5.5, '#c4946a'); dot(99.2, 112.2, 3.5, '#cfa074');           // mound, lit on top
  R(98.5, 112.4, 3, 1, '#f4f4ee');                                          // pitcher's rubber
  if (detail) {
    ctx.strokeStyle = 'rgba(60,40,24,0.18)'; ctx.lineWidth = 0.4*s;            // raked arcs
    for (const r of [44, 52]) { ctx.beginPath(); ctx.arc(X(HX), Y(HY), r*s, A0 + 0.25, A1 - 0.25); ctx.stroke(); }
  }

  // Foul lines, batter's and coaches' boxes, on-deck circles, plate, bases
  ln(HX, HY, HX - 95, HY - 95, 'rgba(250,250,245,0.92)', 0.75);
  ln(HX, HY, HX + 95, HY - 95, 'rgba(250,250,245,0.92)', 0.75);
  if (detail) {
    ctx.strokeStyle = 'rgba(250,250,245,0.75)'; ctx.lineWidth = 0.5*s;
    ctx.strokeRect(X(92), Y(138), 5*s, 8*s); ctx.strokeRect(X(103), Y(138), 5*s, 8*s);
    ctx.strokeRect(X(138), Y(118), 6*s, 3*s); ctx.strokeRect(X(56), Y(118), 6*s, 3*s);
    for (const cx of [80, 120]) {
      ctx.beginPath(); ctx.arc(X(cx), Y(147), 2.6*s, 0, Math.PI*2);
      ctx.fillStyle = '#9a7a54'; ctx.fill(); ctx.stroke();
    }
  }
  ctx.fillStyle = '#f8f8f2';
  ctx.beginPath(); ctx.moveTo(X(98.3), Y(141)); ctx.lineTo(X(101.7), Y(141)); ctx.lineTo(X(101.7), Y(142.6)); ctx.lineTo(X(100), Y(144)); ctx.lineTo(X(98.3), Y(142.6)); ctx.closePath(); ctx.fill();
  for (const [bx, by] of BASES) {
    poly([[bx + 0.4, by - 1.6], [bx + 2.4, by + 0.4], [bx + 0.4, by + 2.4], [bx - 1.6, by + 0.4]], 'rgba(0,0,0,0.25)');
    poly([[bx, by - 2], [bx + 2, by], [bx, by + 2], [bx - 2, by]], '#f8f8f2');
  }

  // Foul poles, standing up where the lines meet the wall
  for (const sx of [-1, 1]) {
    const fx = HX + sx*95.5, fy = HY - 95.5;
    ln(fx + 1.5, fy + 1, fx + 7, fy + 3, 'rgba(0,0,0,0.25)', 1);
    ln(fx, fy, fx, fy - 16, '#f0c838', 1.1);
    if (detail) ln(fx + sx*0.9, fy - 15, fx + sx*0.9, fy - 7, 'rgba(240,200,56,0.6)', 0.6);   // screen
  }

  // ── Behind home: press box, then the netted backstop ───────────────
  R(84, 150, 32, 10, '#6a6660'); R(84, 150, 32, 1.4, '#8a857c');
  for (let k = 0; k < 4; k++) R(86.5 + k*7.5, 153, 5, 4, lit && dark > 0.2 ? 'rgba(255,230,160,0.85)' : '#2a3038');
  ctx.strokeStyle = '#6a3a2a'; ctx.lineWidth = 1.6*s;                        // brick wall
  ctx.beginPath(); ctx.arc(X(HX), Y(HY), 12*s, Math.PI*0.08, Math.PI*0.92); ctx.stroke();
  if (detail) {
    ctx.strokeStyle = 'rgba(200,206,214,0.45)'; ctx.lineWidth = 0.3*s;       // netting rising above it
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI*(0.08 + 0.84*k/10);
      const bx = HX + Math.cos(a)*12, by = HY + Math.sin(a)*12;
      ctx.beginPath(); ctx.moveTo(X(bx), Y(by)); ctx.lineTo(X(bx), Y(by - 9)); ctx.stroke();
    }
    for (let k = 1; k <= 3; k++) {
      ctx.beginPath(); ctx.arc(X(HX), Y(HY - k*3), 12*s, Math.PI*0.08, Math.PI*0.92); ctx.stroke();
    }
    for (const a of [0.08, 0.5, 0.92]) {                                    // posts
      const bx = HX + Math.cos(Math.PI*a)*12, by = HY + Math.sin(Math.PI*a)*12;
      ln(bx, by, bx, by - 10, '#8a9098', 0.6);
    }
  }

  // ── Dugouts: sunk into the ground, roof slab, team on the bench ────
  for (const [dx, team] of [[52, '#c83a30'], [124, '#2a5ab0']]) {
    R(dx - 1, 131, 26, 12, 'rgba(0,0,0,0.25)');
    R(dx, 134, 24, 8, '#1a1d22');                                           // pit
    if (playing) for (let k = 0; k < 5; k++) {
      const bob = cheer && dx === 52 ? Math.abs(Math.sin(t*9 + k))*0.8 : 0;
      dot(dx + 3 + k*4.5, 139 - bob, 1.6, team);
      dot(dx + 3 + k*4.5, 137.6 - bob, 1, ['#f0d0b0', '#8a5a3a', '#e0b890', '#c89870', '#6a4630'][k]);
    }
    R(dx - 0.5, 131, 25, 3.5, '#5a6068'); R(dx - 0.5, 131, 25, 1, '#7a828c');  // roof
    R(dx, 142, 24, 0.8, '#9aa0a8');                                          // rail
  }

  // ── Bleachers along each line, and the crowd ───────────────────────
  for (const bx of [6, 158]) {
    R(bx + 1.5, 111, 36, 34, 'rgba(0,0,0,0.25)');
    for (let r = 0; r < 6; r++) {
      const ry = 110 + r*5.5;
      R(bx, ry, 36, 5.5, r % 2 ? '#8e949c' : '#a6acb4');
      R(bx, ry + 4.4, 36, 1.1, 'rgba(0,0,0,0.22)');                          // riser
    }
    R(bx, 108, 36, 2.2, '#5a6068');                                          // back rail
    R(bx + 17, 110, 2, 33, '#7a8088');                                       // aisle
    if (playing) {
      const fans = lightsDue ? 0.75 : 0.5;
      for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) {
        const k = bx*7 + r*8 + c;
        if (hash(k) > fans) continue;
        const sx = bx + 2.2 + c*4.4 + (c >= 4 ? 2 : 0), sy = 112.2 + r*5.5;
        const hop = cheer ? Math.max(0, Math.sin(t*10 + k))*1.3 : 0;
        dot(sx, sy - hop, 1.5, ['#e0b030', '#3a7ac8', '#e8e4dc', '#c85a3a', '#40a060', '#8a4ac0'][Math.floor(hash(k + 500)*6)]);
        dot(sx, sy - 1.3 - hop, 0.9, ['#f0d0b0', '#c89870', '#8a5a3a', '#e0b890', '#6a4630'][Math.floor(hash(k + 900)*5)]);
      }
    }
  }

  // ── Concession stand on the concourse ─────────────────────────────
  R(18, 146, 30, 13, '#d8d0c0'); R(18, 146, 30, 1.2, '#eee6d6');
  R(21, 151, 24, 5, playing ? '#3a2e24' : '#5a5046');
  if (playing) R(21, 151, 24, 5, `rgba(255,200,120,${dark > 0.2 ? 0.55 : 0.2})`);
  for (let k = 0; k < 8; k++) R(17 + k*4, 148.6, 4, 2.4, k % 2 ? '#f4f0e6' : '#d8403a');   // awning
  if (playing && detail) for (let k = 0; k < 3; k++) {
    const q = 52 + k*4 + Math.sin(t*0.8 + k)*0.6;
    dot(q, 155, 1.4, ['#3a7ac8', '#e0b030', '#40a060'][k]); dot(q, 153.8, 0.85, '#e0b890');
  }

  // ── Scoreboard on its legs, top left ───────────────────────────────
  ln(42, 14, 42, 22, '#4a4e54', 1.2); ln(66, 14, 66, 22, '#4a4e54', 1.2);
  R(43, 21, 26, 2, 'rgba(0,0,0,0.25)');
  R(34, 1, 40, 14, '#1a3a2a'); R(34, 1, 40, 1.4, '#2e5a44'); R(35, 3, 38, 11, '#10141a');
  const inning = Math.min(9, 1 + Math.floor(play.before.half/2)), top = play.before.half % 2 === 0;
  for (let k = 0; k < 9; k++) dot(37.5 + k*4.1, 12, 0.9, playing && k < inning ? '#ffcc40' : '#3a3420');
  if (detail) {
    ctx.fillStyle = playing ? '#ffcc40' : '#5a4a20';
    ctx.font = `bold ${Math.max(3, 5*s)}px monospace`; ctx.textAlign = 'center';
    const away = play.before.runs[0], home = play.before.runs[1];
    ctx.fillText(playing ? `${away}-${home} ${top ? '▲' : '▼'}${inning}` : '- -', X(54), Y(9.6));
    ctx.textAlign = 'left';
    if (playing) {                                                          // balls, strikes, outs
      for (let k = 0; k < 3; k++) dot(37 + k*1.9, 5, 0.6, k < play.before.balls ? '#50e070' : '#1e2a20');
      for (let k = 0; k < 2; k++) dot(45 + k*1.9, 5, 0.6, k < play.before.strikes ? '#ffcc40' : '#2a2618');
      for (let k = 0; k < 2; k++) dot(52 + k*1.9, 5, 0.6, k < play.before.outs ? '#ff4030' : '#2a1614');
    }
  }

  // ── Floodlight pools, under the players ────────────────────────────
  const TOWERS = [[18, 30], [182, 30], [6, 98], [194, 98]];
  const MAST = 20;
  if (lit && dark > 0.2) {
    for (const [tx, ty] of TOWERS) {
      const cx = tx + (100 - tx)*0.5, cy = ty + (100 - ty)*0.5;
      const g = ctx.createRadialGradient(X(cx), Y(cy), 0, X(cx), Y(cy), 70*s);
      g.addColorStop(0, `rgba(255,248,215,${(0.18*dark).toFixed(3)})`); g.addColorStop(1, 'rgba(255,248,215,0)');
      ctx.fillStyle = g; ctx.fillRect(X(0), Y(0), 200*s, 160*s);
    }
  }

  // ── The game ─────────────────────────────────────────────────────
  if (playing) {
    const SKIN = ['#f0d0b0', '#c89870', '#8a5a3a', '#e0b890', '#6a4630', '#d8a878'];
    const FIELD = [[100, 112], [100, 148], [126, 104], [114, 90], [86, 90], [74, 104], [52, 58], [100, 40], [148, 58]];
    const MOUND = [100, 112], PLATE = [100, 141], GLOVE = [100, 146.5], HOME = [100, 142];
    const BOX = [95, 142], DUGOUT = [136, 139], DECK = [120, 147];
    const o = play.o, PH = m => PHn(pitchIdx, m);
    const player = (x, y, jersey, cap, i) => {
      dot(x + 0.8, y + 1.1, 2, 'rgba(0,0,0,0.28)');
      dot(x, y, 2.2, jersey);
      dot(x, y - 0.4, 1.2, SKIN[i % SKIN.length]);
      dot(x, y - 0.9, 0.9, cap);
    };
    // a point d base-lengths round the diamond from home (0) back to home (4)
    const CORNERS = [BOX, [BASES[0][0], BASES[0][1] + 1], [BASES[1][0], BASES[1][1] + 1], [BASES[2][0], BASES[2][1] + 1], HOME];   // the batter sets off from the box
    const dpos = d => { const k = Math.max(0, Math.min(3.999, d)), i = Math.floor(k); return mix(CORNERS[i], CORNERS[i + 1], k - i); };

    // where the ball goes on this pitch
    const tgtOF = 6 + Math.floor(PH(2)*3), IF = 3 + Math.floor(PH(7)*3);
    let land = null, stop = null, chaser = -1;
    if (o === 'fly') { land = [FIELD[tgtOF][0] + (PH(3) - 0.5)*16, FIELD[tgtOF][1] + 4 + (PH(4) - 0.5)*12]; chaser = tgtOF; }
    if (o === 'single' || o === 'double') {
      const a = -Math.PI*(0.3 + PH(3)*0.4), r = o === 'single' ? 70 + PH(4)*14 : 100 + PH(4)*18;
      land = [HX + Math.cos(a)*r, HY + Math.sin(a)*r];
      stop = [HX + Math.cos(a)*(r + 14), HY + Math.sin(a)*(r + 14)];
      if (Math.hypot(stop[0] - HX, stop[1] - HY) > 124) stop = [HX + Math.cos(a)*124, HY + Math.sin(a)*124];
      let best = 1e9; for (let i = 6; i < 9; i++) { const d = Math.hypot(FIELD[i][0] - stop[0], FIELD[i][1] - stop[1]); if (d < best) { best = d; chaser = i; } }
    }
    const homerA = -Math.PI*(0.3 + PH(3)*0.4), homerEnd = [HX + Math.cos(homerA)*160, HY + Math.sin(homerA)*160];
    const groundAt = [FIELD[IF][0] + (PH(3) - 0.5)*8, FIELD[IF][1] + 3];
    const foulTo = PH(3) < 0.5 ? [20 + PH(4)*14, 116 + PH(5)*20] : [164 + PH(4)*14, 116 + PH(5)*20];

    // fielders
    let catchPos = null, ifPos = null, firstPos = null;
    FIELD.forEach(([x, y], i) => {
      const home0 = [x + Math.sin(t*0.9 + i*1.9)*1.2, y + Math.cos(t*0.7 + i)*1];
      let p = home0;
      if (i === chaser && o === 'fly') { p = mix(mix(home0, land, seg(0.37, 0.62)), home0, seg(0.78, 0.98)); catchPos = p; }
      if (i === chaser && (o === 'single' || o === 'double')) { p = mix(mix(home0, stop, seg(0.4, 0.72)), home0, seg(0.8, 0.99)); catchPos = p; }
      if (i === IF && o === 'ground') { p = mix(mix(home0, groundAt, seg(0.36, 0.47)), home0, seg(0.6, 0.85)); ifPos = p; }
      if (i === 2 && o === 'ground') { p = mix(mix(home0, [BASES[0][0] - 1.5, BASES[0][1] + 1], seg(0.38, 0.5)), home0, seg(0.7, 0.9)); firstPos = p; }
      if (i === 0) p = [p[0], p[1] - seg(0.04, 0.16)*1.2 + seg(0.16, 0.24)*1.2];     // the wind-up
      if (o === 'homer' && i >= 6 && i === tgtOF) p = mix(mix(home0, [p[0] + (homerEnd[0] - p[0])*0.25, p[1] - 14], seg(0.37, 0.55)), home0, seg(0.75, 0.98));   // runs to the wall, watches it go
      player(p[0], p[1], i === 1 ? '#3a3e46' : '#f2f0e8', '#c83a30', i);
    });

    // runners already on base: lead off, then advance (or hold) on the play
    const B4 = play.before.bases;
    const runEnd = (d0, d1) => 0.38 + 0.13*(d1 - d0);
    for (let b = 0; b < 3; b++) {
      if (!B4[b]) continue;
      const mv = play.moves.find(m => m[0] === b + 1);
      let d = b + 1 + seg(0.18, 0.3)*0.12 - seg(0.6, 0.8)*0.12;            // lead off and back
      let gone = false;
      if (mv && mv[1] !== b + 1) {
        d = b + 1 + (mv[1] - b - 1)*sm((f - 0.38)/(runEnd(b + 1, mv[1]) - 0.38));
        if (mv[1] >= 4 && f > runEnd(b + 1, 4)) { const w = mix(HOME, DUGOUT, seg(runEnd(b + 1, 4), 0.95)); if (f < 0.95) player(w[0], w[1], '#2a5ab0', '#1a2a5a', 7); gone = true; }
      }
      if (play.third) { const w = mix(dpos(d), DUGOUT, seg(0.72, 0.97)); if (f < 0.97) player(w[0], w[1], '#2a5ab0', '#1a2a5a', 7); gone = true; }
      if (!gone) { const q = dpos(d); player(q[0], q[1], '#2a5ab0', '#1a2a5a', 7); }
    }

    // the batter: swings (or takes), runs it out, or walks off
    const swings = o === 'foul' || hit || (o === 'strike' && PH(6) < 0.55);
    const contact = swings && o !== 'strike';
    const swing = swings ? seg(0.3, 0.37) - (contact ? 0 : seg(0.48, 0.7)) : 0;
    const bm = play.moves.find(m => m[0] === 0);
    const leaves = play.endsAB;
    if (bm || (leaves && play.out)) {
      // in play / walk / strikeout
      let w;
      if (bm) {
        const z = bm[1], tEnd = o === 'ball' ? 0.75 : runEnd(0, z);
        const d = z*sm((f - (o === 'ball' ? 0.45 : 0.36))/(tEnd - (o === 'ball' ? 0.45 : 0.36)));
        w = dpos(d);
        if (play.out || z >= 4) w = mix(w, DUGOUT, seg(Math.min(0.8, tEnd + 0.06), 0.96));   // out at first / scored: off to the dugout
        if (play.third && !play.out) w = mix(w, DUGOUT, seg(0.72, 0.97));
        if (f > 0.36 && contact) ln(92, 145, 97, 146, '#c8a060', 0.9);        // the dropped bat
      } else w = mix(BOX, DUGOUT, seg(0.5, 0.95));                             // struck out
      if (f < 0.96) player(w[0], w[1], '#2a5ab0', '#1a2a5a', 7);
      if (!bm && f < 0.5) { const ba = -Math.PI*0.9 + swing*Math.PI*1.1; ln(96.5, 141, 96.5 + Math.cos(ba)*6, 141 + Math.sin(ba)*6, '#c8a060', 0.9); }
      // next batter up from the on-deck circle
      const nb = mix(DECK, BOX, seg(0.72, 0.98));
      player(nb[0], nb[1], '#2a5ab0', '#1a2a5a', 7);
      if (f > 0.72) { const ba = -Math.PI*0.9; ln(nb[0] + 1.5, nb[1] - 1, nb[0] + 1.5 + Math.cos(ba)*6, nb[1] - 1 + Math.sin(ba)*6, '#c8a060', 0.9); }
    } else {
      player(BOX[0], BOX[1], '#2a5ab0', '#1a2a5a', 7);
      const ba = -Math.PI*0.9 + swing*Math.PI*1.1;
      ln(96.5, 141, 96.5 + Math.cos(ba)*6, 141 + Math.sin(ba)*6, '#c8a060', 0.9);
      player(DECK[0], DECK[1], '#2a5ab0', '#1a2a5a', 7);                       // on deck, swinging a bat
      const da = -Math.PI*0.7 + Math.sin(t*2.2)*0.5; ln(DECK[0] + 1.5, DECK[1] - 1, DECK[0] + 1.5 + Math.cos(da)*5, DECK[1] - 1 + Math.sin(da)*5, '#c8a060', 0.8);
    }
    player(100, 151.5, '#2a2a2e', '#2a2a2e', 5);                               // umpire
    if (detail && f > 0.36 && f < 0.5 && (o === 'strike' || o === 'ball')) R(103, 147 - seg(0.36, 0.42)*3, 0.8, 3, o === 'strike' ? '#2a2a2e' : 'rgba(0,0,0,0)');   // strike call
    player(142 + Math.sin(t*0.5)*1.2, 120, '#c83a30', '#c83a30', 2);           // first-base coach

    // the ball
    let bp = null, lift = 0;
    const hand = [MOUND[0] + 0.8, MOUND[1] - seg(0.04, 0.16)*2.4 + seg(0.16, 0.24)*2.4];
    const newBall = q => mix([100, 150], hand, sm(q));                          // the umpire tosses out a fresh one
    if (f < 0.24) bp = hand;
    else if (f < 0.36) { const k = (f - 0.24)/0.12; bp = mix(hand, contact ? PLATE : (o === 'ball' ? [GLOVE[0] + 2.5, GLOVE[1] - 0.5] : GLOVE), k*k*0.4 + k*0.6); }
    else if (!contact) {
      const mitt = o === 'ball' ? [GLOVE[0] + 2.5, GLOVE[1] - 0.5] : GLOVE;
      if (f < 0.5) bp = mitt; else if (f < 0.66) { const k = sm((f - 0.5)/0.16); bp = mix(mitt, hand, k); lift = Math.sin(k*Math.PI)*4; } else bp = hand;
    } else if (o === 'foul') {
      if (f < 0.6) { const k = (f - 0.36)/0.24; bp = mix(PLATE, foulTo, 1 - Math.pow(1 - k, 2)); lift = Math.sin(k*Math.PI)*16; }
      else if (f > 0.7) { bp = f < 0.86 ? newBall((f - 0.7)/0.16) : hand; lift = f < 0.86 ? Math.sin((f - 0.7)/0.16*Math.PI)*4 : 0; }
    } else if (o === 'ground') {
      if (f < 0.47) { const k = (f - 0.36)/0.11; bp = mix(PLATE, groundAt, k); lift = Math.abs(Math.sin(k*Math.PI*3))*1.6*(1 - k); }
      else if (f < 0.56) { const k = (f - 0.47)/0.09; bp = mix(ifPos, firstPos, k); lift = Math.sin(k*Math.PI)*3; }
      else if (f < 0.72) bp = firstPos;
      else if (f < 0.86) { const k = sm((f - 0.72)/0.14); bp = mix(firstPos, hand, k); lift = Math.sin(k*Math.PI)*4; }
      else bp = hand;
    } else if (o === 'fly') {
      if (f < 0.66) { const k = (f - 0.36)/0.3; bp = mix(PLATE, land, 1 - Math.pow(1 - k, 2)); lift = Math.sin(k*Math.PI)*24; }
      else if (f < 0.7) { bp = catchPos; lift = 1.5; }
      else if (f < 0.86) { const k = sm((f - 0.7)/0.16); bp = mix(catchPos, MOUND, k); lift = Math.sin(k*Math.PI)*8; }
      else bp = hand;
    } else if (o === 'single' || o === 'double') {
      if (f < 0.58) { const k = (f - 0.36)/0.22; bp = mix(PLATE, land, 1 - Math.pow(1 - k, 2)); lift = Math.sin(k*Math.PI)*(o === 'double' ? 20 : 12); }
      else if (f < 0.72) { const k = (f - 0.58)/0.14; bp = mix(land, stop, 1 - Math.pow(1 - k, 2)); lift = Math.abs(Math.sin(k*Math.PI*2))*2*(1 - k); }
      else if (f < 0.84) { const k = sm((f - 0.72)/0.12); bp = mix(catchPos || stop, [BASES[1][0], BASES[1][1]], k); lift = Math.sin(k*Math.PI)*7; }
      else { const k = sm((f - 0.84)/0.12); bp = mix([BASES[1][0], BASES[1][1]], hand, k); lift = Math.sin(k*Math.PI)*3; }
    } else if (o === 'homer') {
      if (f < 0.62) { const k = (f - 0.36)/0.26; bp = mix(PLATE, homerEnd, k); lift = Math.sin(k*Math.PI*0.85)*36; }
      else if (f > 0.75) { bp = f < 0.9 ? newBall((f - 0.75)/0.15) : hand; lift = f < 0.9 ? Math.sin((f - 0.75)/0.15*Math.PI)*4 : 0; }
      // fireworks over the scoreboard, lit games only
      if (lit && dark > 0.2 && f > 0.45 && f < 0.85) {
        const q = (f - 0.45)/0.4;
        for (let bb = 0; bb < 2; bb++) for (let k = 0; k < 12; k++) { const a = k/12*Math.PI*2, r = q*14; dot(46 + bb*18 + Math.cos(a)*r, 6 - bb*3 + Math.sin(a)*r + q*q*4, 0.7, `rgba(${bb ? '255,200,90' : '120,220,255'},${(1 - q).toFixed(2)})`); }
      }
    }
    if (bp) {
      dot(bp[0] + 0.5 + lift*0.15, bp[1] + 0.6, 0.9, 'rgba(0,0,0,0.25)');
      dot(bp[0], bp[1] - lift, 1 + lift*0.02, '#fbfbf6');
    }
    // a fan on their feet where a foul lands
    if (o === 'foul' && f > 0.55 && f < 0.85) { const q = Math.sin((f - 0.55)/0.3*Math.PI); dot(foulTo[0], foulTo[1] - q*2, 1.6, '#e0b030'); dot(foulTo[0], foulTo[1] - 1.3 - q*2, 0.9, '#f0d0b0'); }
    // hot-dog vendor working the concourse
    if (detail) { const vx = 100 + Math.sin(t*0.05)*42 + Math.sin(t*0.013)*20; R(vx - 2.4, 152.6, 4.8, 1.6, '#e8e4dc'); dot(vx, 155, 1.5, '#f4f0e6'); dot(vx, 153.8, 0.9, '#c89870'); }
  } else {
    dot(81, 146.5, 1, '#fbfbf6');                                            // left in the on-deck circle
    ln(78, 147.5, 83, 145.5, '#c8a060', 0.8);
  }

  // ── Floodlight masts: shadow, pole, lamp bank ──────────────────────
  for (const [tx, ty] of TOWERS) {
    if (!(lit && dark > 0.2)) ln(tx, ty, tx + 9, ty + 5, 'rgba(0,0,0,0.22)', 1.4);   // cast shadow
    dot(tx, ty, 1.6, '#3a3e44');                                             // footing
    ln(tx, ty, tx, ty - MAST, '#7a8088', 1.1);
    if (detail) for (let k = 1; k < 4; k++) ln(tx - 0.9, ty - k*5, tx + 0.9, ty - k*5 + 2, 'rgba(60,64,70,0.8)', 0.3);
    const hy = ty - MAST;
    R(tx - 5, hy - 4, 10, 6, '#3a4048'); R(tx - 5, hy - 4, 10, 0.8, '#5a6068');
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
      dot(tx - 3.6 + c*2.4, hy - 2.3 + r*2.6, 0.95, lit ? '#fff6d0' : '#8a9098');
    }
    if (lit && dark > 0.2) {
      const g = ctx.createRadialGradient(X(tx), Y(hy - 1), 0, X(tx), Y(hy - 1), 12*s);
      g.addColorStop(0, `rgba(255,250,220,${(0.5*dark).toFixed(3)})`); g.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.fillStyle = g; ctx.fillRect(X(tx - 12), Y(hy - 13), 24*s, 24*s);
    }
  }
}

// Playground — 2×2: a fenced play area on poured rubber and wood chips. A
// roofed climbing tower with a rope net and a curving slide, an A-frame swing
// set (two belt swings and a toddler bucket), a spinning merry-go-round, a
// see-saw, a timber sandbox with a sandcastle, a duck spring rider, and a
// shade tree over the parents' bench by the gate. Kids play through the day
// and head home at dusk or when it rains; overnight everything sits still.
// Unpowered, like the older parks. Authored in an 80×80 box.
function renderPlayground(e, px, py, w, h, t) {
  const { s, X, Y, R, dot, ln, hash } = _parkKit(e, px, py, w, h, 80, 80);
  const hr = DayNight.hour(), dark = DayNight.darkness();
  const open = hr >= 8 && hr < 19.5 && dark < 0.45 &&
               !(typeof RainSystem !== 'undefined' && RainSystem.isActive());
  const detail = Camera.zoom > 0.45;
  const poly = (pts, c) => {
    ctx.fillStyle = c; ctx.beginPath();
    pts.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)));
    ctx.closePath(); ctx.fill();
  };
  const SKIN  = ['#f0d0b0', '#c89870', '#8a5a3a', '#e0b890', '#6a4630'];
  const SHIRT = ['#e8483a', '#3a70d8', '#f0c030', '#40b060', '#d060c0', '#ff8a30'];
  const HAIR  = ['#2a1a10', '#6a4020', '#d8b050', '#1a1a1a', '#a04a20'];
  // A kid seen from above: shadow stays on the ground while `lift` raises the
  // body, so height reads as the gap between them.
  const kid = (x, y, i, lift = 0, scale = 1) => {
    dot(x + 0.6 + lift*0.25, y + 1 + lift*0.15, 1.6*scale, 'rgba(0,0,0,0.25)');
    dot(x, y - lift, 1.75*scale, SHIRT[i % SHIRT.length]);
    dot(x, y - lift - 0.5*scale, 1.05*scale, SKIN[Math.floor(hash(60 + i)*SKIN.length)]);
    dot(x, y - lift - 0.95*scale, 0.8*scale, HAIR[Math.floor(hash(80 + i)*HAIR.length)]);
  };

  // ── Grass, wood chips, rubber safety surfacing ────────────────────
  R(0, 0, 80, 80, '#3f7a36');
  for (let k = 0; k < 4; k++) R(k*20, 0, 10, 80, 'rgba(255,255,255,0.03)');
  R(4, 4, 72, 72, '#a07448');
  if (detail) for (let k = 0; k < 110; k++) R(5 + hash(k)*69, 5 + hash(k + 400)*69, 1.2, 0.6, hash(k + 800) < 0.5 ? '#b88a58' : '#86603a');
  const rubber = (x, y, ww, hh, c, edge) => {
    ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(X(x), Y(y), ww*s, hh*s, 3*s); ctx.fill();
    ctx.strokeStyle = edge; ctx.lineWidth = 0.7*s; ctx.stroke();
  };
  rubber(6, 6, 32, 36, '#3a78b8', '#2a5a8a');                              // under the tower
  rubber(42, 6, 34, 30, '#4a9a52', '#357a3c');                             // under the swings
  if (detail) {                                                           // rubber speckle
    for (let k = 0; k < 50; k++) {
      const inTower = k < 25;
      dot(inTower ? 8 + hash(k + 1200)*28 : 44 + hash(k + 1200)*30, inTower ? 8 + hash(k + 1300)*32 : 8 + hash(k + 1300)*26,
          0.35, inTower ? 'rgba(200,225,255,0.35)' : 'rgba(220,255,210,0.3)');
    }
  }
  // Paver path in from the gate
  R(35, 62, 10, 15, '#b8b0a0');
  if (detail) for (let k = 0; k < 5; k++) R(35, 63 + k*3, 10, 0.4, 'rgba(0,0,0,0.12)');

  // ── Fence and gate ─────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.9*s;
  ctx.beginPath();
  ctx.moveTo(X(34.6), Y(76.8)); ctx.lineTo(X(4.6), Y(76.8)); ctx.lineTo(X(4.6), Y(4.8)); ctx.lineTo(X(76.6), Y(4.8)); ctx.lineTo(X(76.6), Y(76.8)); ctx.lineTo(X(46.6), Y(76.8));
  ctx.stroke();
  ctx.strokeStyle = '#e8e2d0'; ctx.lineWidth = 0.9*s;
  ctx.beginPath();
  ctx.moveTo(X(34), Y(76)); ctx.lineTo(X(4), Y(76)); ctx.lineTo(X(4), Y(4)); ctx.lineTo(X(76), Y(4)); ctx.lineTo(X(76), Y(76)); ctx.lineTo(X(46), Y(76));
  ctx.stroke();
  for (let k = 4; k <= 76; k += 6) {
    dot(k, 4, 0.75, '#f4efe0'); dot(4, k, 0.75, '#f4efe0'); dot(76, k, 0.75, '#f4efe0');
    if (k < 34 || k > 46) dot(k, 76, 0.75, '#f4efe0');
  }
  R(33, 74.5, 1.6, 3, '#e8483a'); R(45.4, 74.5, 1.6, 3, '#e8483a');          // gate posts
  // Gate: folded back against the outside of the fence by day, shut at night
  if (open) { ln(33.5, 77.4, 23, 77.4, '#e8e2d0', 0.9); dot(28, 77.4, 0.6, '#f4efe0'); }
  else      ln(34.6, 76, 45.4, 76, '#e8e2d0', 0.9);

  // ── Climbing tower: posts, deck, pyramid roof, net and slide ───────
  const TX = 10, TY = 11, TW = 17, TH = 15;
  poly([[TX + 3, TY + TH + 1], [TX + TW + 6, TY + TH + 1], [TX + TW + 8, TY + 4], [TX + TW + 3, TY + 3]], 'rgba(0,0,0,0.22)');   // cast shadow
  for (const [cx, cy] of [[TX, TY], [TX + TW, TY], [TX, TY + TH], [TX + TW, TY + TH]]) {
    R(cx - 0.8, cy - 0.8, 1.6, 4, '#f0c030');                               // posts dropping to the ground
  }
  R(TX, TY, TW, TH, '#d8c8a8');                                             // deck
  if (detail) for (let k = 1; k < 6; k++) R(TX, TY + k*2.5, TW, 0.35, 'rgba(90,60,30,0.3)');
  // Pyramid roof, lit from the upper left
  const rc = [TX + TW/2, TY + TH/2 - 1];
  poly([[TX - 1.5, TY - 1.5], [TX + TW + 1.5, TY - 1.5], rc], '#f05a48');
  poly([[TX - 1.5, TY - 1.5], [TX - 1.5, TY + TH + 1.5], rc], '#e8483a');
  poly([[TX + TW + 1.5, TY - 1.5], [TX + TW + 1.5, TY + TH + 1.5], rc], '#b8342a');
  poly([[TX - 1.5, TY + TH + 1.5], [TX + TW + 1.5, TY + TH + 1.5], rc], '#c83a30');
  dot(rc[0], rc[1], 1.2, '#f0c030');                                        // finial
  // Rope net climbing up the left side
  const nx0 = 6.5, ny0 = TY + 2, nw = 3.5, nh = TH - 2;
  ctx.strokeStyle = '#d8c08a'; ctx.lineWidth = 0.45*s;
  ctx.beginPath();
  for (let k = 0; k <= 4; k++) { ctx.moveTo(X(nx0), Y(ny0 + k*nh/4)); ctx.lineTo(X(nx0 + nw), Y(ny0 + k*nh/4 - 0.6)); }
  for (let k = 0; k <= 2; k++) { ctx.moveTo(X(nx0 + k*nw/2), Y(ny0)); ctx.lineTo(X(nx0 + k*nw/2), Y(ny0 + nh)); }
  ctx.stroke();
  // Ladder up the front
  R(TX + 3, TY + TH, 1, 8, '#6a6e72'); R(TX + 8, TY + TH, 1, 8, '#6a6e72');
  for (let k = 0; k < 4; k++) R(TX + 3, TY + TH + 1.5 + k*1.8, 6, 0.8, '#f0c030');
  // Curving tube slide off the right side, down to a landing pad
  const SL = [[TX + TW, TY + 6], [TX + TW + 14, TY + 6], [TX + TW + 8, TY + 26]];
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 5*s;
  ctx.beginPath(); ctx.moveTo(X(SL[0][0] + 2), Y(SL[0][1] + 3)); ctx.quadraticCurveTo(X(SL[1][0] + 3), Y(SL[1][1] + 4), X(SL[2][0] + 1.5), Y(SL[2][1] + 1.5)); ctx.stroke();
  ctx.strokeStyle = '#2f9a48'; ctx.lineWidth = 5*s;
  ctx.beginPath(); ctx.moveTo(X(SL[0][0]), Y(SL[0][1])); ctx.quadraticCurveTo(X(SL[1][0]), Y(SL[1][1]), X(SL[2][0]), Y(SL[2][1])); ctx.stroke();
  ctx.strokeStyle = '#6ed88a'; ctx.lineWidth = 2*s;
  ctx.beginPath(); ctx.moveTo(X(SL[0][0]), Y(SL[0][1] - 0.8)); ctx.quadraticCurveTo(X(SL[1][0] - 0.8), Y(SL[1][1] - 0.8), X(SL[2][0] - 0.8), Y(SL[2][1])); ctx.stroke();
  ctx.lineCap = 'butt';
  const slidePt = (k) => { const u = 1 - k; return [u*u*SL[0][0] + 2*u*k*SL[1][0] + k*k*SL[2][0], u*u*SL[0][1] + 2*u*k*SL[1][1] + k*k*SL[2][1]]; };

  // ── Swing set: splayed A-frame legs, crossbar, three swings ────────
  const SWY = 10, SX0 = 45, SX1 = 73;
  ln(SX0 + 2, SWY + 22, SX1 + 4, SWY + 22, 'rgba(0,0,0,0.18)', 1.2);       // crossbar shadow
  for (const lx of [SX0, SX1]) {
    ln(lx, SWY, lx - 2.5, SWY + 20, '#5a5e64', 1.1);
    ln(lx, SWY, lx + 2.5, SWY + 20, '#6a6e72', 1.1);
  }
  ln(SX0, SWY, SX1, SWY, '#e8483a', 1.8);
  ln(SX0, SWY - 0.6, SX1, SWY - 0.6, '#f07060', 0.5);
  const swings = [
    { x: 51,  kind: 'belt',   busy: open && hash(21) < 0.85, ph: 0 },
    { x: 59,  kind: 'belt',   busy: open && hash(22) < 0.7,  ph: 1.9 },
    { x: 67,  kind: 'bucket', busy: open && hash(23) < 0.8,  ph: 3.4 },
  ];
  for (const [i, sw] of swings.entries()) {
    const amp = sw.kind === 'bucket' ? 3 : 6;
    const a = sw.busy ? Math.sin(t*2.3 + sw.ph) : 0;
    const seatY = SWY + 14 + a*amp;                                         // top-down: forward/back reads as up/down
    const lift = Math.abs(a)*2.5;
    dot(sw.x, SWY + 16 + a*amp*0.5, 2.2, 'rgba(0,0,0,0.2)');                 // shadow under the seat
    dot(sw.x, SWY + 16, 2.6, 'rgba(90,60,30,0.3)');                          // worn patch
    ln(sw.x - 1.6, SWY, sw.x - 1.6, seatY - lift, 'rgba(50,50,54,0.9)', 0.35);
    ln(sw.x + 1.6, SWY, sw.x + 1.6, seatY - lift, 'rgba(50,50,54,0.9)', 0.35);
    if (sw.kind === 'bucket') {
      R(sw.x - 2.2, seatY - lift - 1.6, 4.4, 3.4, '#f0c030');
      R(sw.x - 1.4, seatY - lift - 0.9, 2.8, 2, '#c89820');
      if (sw.busy) kid(sw.x, seatY - 0.2, 5, lift + 0.4, 0.8);
    } else {
      R(sw.x - 2.4, seatY - lift - 0.8, 4.8, 1.8, '#2a2a2e');
      if (sw.busy) kid(sw.x, seatY + 0.3, i + 1, lift + 0.5);
    }
  }
  if (open && swings[2].busy) {                                            // a parent pushing the toddler
    const push = Math.max(0, Math.sin(t*2.3 + swings[2].ph))*1.2;
    dot(67.6, SWY + 22.5, 1.9, 'rgba(0,0,0,0.22)');
    dot(67, SWY + 22 - push*0.3, 2.1, '#5a6a8a');
    dot(67, SWY + 21.3 - push*0.3, 1.2, SKIN[Math.floor(hash(8)*SKIN.length)]);
  }

  // ── Merry-go-round ─────────────────────────────────────────────────
  const MX = 60, MY = 50, MR = 8;
  const spin = open ? t*1.6 : hash(30)*6.28;
  dot(MX + 1, MY + 1.2, MR + 0.4, 'rgba(0,0,0,0.25)');
  dot(MX, MY, MR + 0.8, '#6a6e72');
  for (let k = 0; k < 4; k++) {                                            // quartered deck
    ctx.fillStyle = ['#e8483a', '#f0c030', '#3a78d8', '#40b060'][k];
    ctx.beginPath(); ctx.moveTo(X(MX), Y(MY));
    ctx.arc(X(MX), Y(MY), MR*s, spin + k*Math.PI/2, spin + (k + 1)*Math.PI/2); ctx.closePath(); ctx.fill();
  }
  for (let k = 0; k < 4; k++) {                                            // grab rails
    const a = spin + k*Math.PI/2 + Math.PI/4;
    ln(MX + Math.cos(a)*2, MY + Math.sin(a)*2, MX + Math.cos(a)*6.5, MY + Math.sin(a)*6.5, '#dcdcd8', 0.7);
  }
  dot(MX, MY, 1.8, '#8a8e92'); dot(MX - 0.4, MY - 0.4, 0.8, '#c8ccd0');
  if (open) {
    for (let k = 0; k < 2; k++) {
      const a = spin + k*Math.PI + 0.4;
      kid(MX + Math.cos(a)*5.2, MY + Math.sin(a)*5.2, 2 + k*2, 1);
    }
    // One running alongside, pushing it round
    const a = spin - 0.5;
    kid(MX + Math.cos(a)*(MR + 2.5), MY + Math.sin(a)*(MR + 2.5), 4, Math.abs(Math.sin(t*9))*0.8);
  }

  // ── See-saw ────────────────────────────────────────────────────────
  const SSX = 62, SSY = 69;
  const tilt = open ? Math.sin(t*1.7)*2.2 : 1.8;
  R(SSX - 1.5, SSY - 1, 3, 3, '#5a5e64');                                  // pivot
  ln(SSX - 10 + 0.8, SSY + tilt*0.4 + 1.2, SSX + 10 + 0.8, SSY - tilt*0.4 + 1.2, 'rgba(0,0,0,0.22)', 2.2);
  ln(SSX - 10, SSY - tilt, SSX + 10, SSY + tilt, '#3a78d8', 2);
  ln(SSX - 10, SSY - tilt - 0.6, SSX + 10, SSY + tilt - 0.6, '#6aa0f0', 0.5);
  for (const sx of [-1, 1]) {                                              // handles
    ln(SSX + sx*7.5, SSY + sx*tilt*0.75 - 1.5, SSX + sx*7.5, SSY + sx*tilt*0.75 + 1.5, '#f0c030', 0.7);
  }
  if (open) {
    kid(SSX - 9, SSY - tilt + 0.3, 0, Math.max(0, -tilt)*0.6 + 0.4);
    kid(SSX + 9, SSY + tilt + 0.3, 3, Math.max(0, tilt)*0.6 + 0.4);
  }

  // ── Sandbox with a sandcastle ──────────────────────────────────────
  R(9.5, 46.5, 23, 21, 'rgba(0,0,0,0.2)');
  R(8, 45, 23, 21, '#7a5634'); R(8, 45, 23, 1, '#9a7048');
  R(10, 47, 19, 17, '#e6d09a');
  if (detail) for (let k = 0; k < 16; k++) dot(11 + hash(k + 100)*17, 48 + hash(k + 200)*15, 0.45, 'rgba(160,130,80,0.5)');
  // Castle: two towers and a keep
  R(19, 51, 6, 4, '#c8a868'); R(19, 51, 6, 1, '#d8bc80');
  for (const cx of [18.2, 24.2]) { R(cx, 49.5, 2.6, 5.5, '#bc9c5c'); R(cx, 49.5, 2.6, 0.8, '#d8bc80'); }
  poly([[21, 51], [22, 48.6], [23, 51]], '#e8483a');                        // flag
  R(12, 58, 3, 3, '#e8483a'); R(12.3, 57.4, 2.4, 0.6, '#b8342a');           // bucket
  ln(25, 60, 28, 62.5, '#3a70d8', 0.8); R(27.4, 62, 1.6, 1.6, '#3a70d8');   // spade

  // ── Duck spring rider ──────────────────────────────────────────────
  const DX = 42, DY = 46;
  const bob = open ? Math.sin(t*3.4)*1.3 : 0;
  dot(DX + 0.8, DY + 2.5, 2.8, 'rgba(0,0,0,0.25)');
  ctx.strokeStyle = '#8a8e92'; ctx.lineWidth = 0.6*s;                        // spring
  ctx.beginPath();
  for (let k = 0; k <= 6; k++) { const yy = DY + 2.5 - k*0.5; k ? ctx.lineTo(X(DX + (k % 2 ? 1 : -1) + bob*0.2), Y(yy)) : ctx.moveTo(X(DX), Y(yy)); }
  ctx.stroke();
  ctx.fillStyle = '#f0c030'; ctx.beginPath(); ctx.ellipse(X(DX + bob*0.4), Y(DY - 0.5), 3.4*s, 2.4*s, 0, 0, Math.PI*2); ctx.fill();
  dot(DX + 2.8 + bob*0.5, DY - 2.4, 1.6, '#f0c030');                         // head
  poly([[DX + 4 + bob*0.5, DY - 2.6], [DX + 6 + bob*0.5, DY - 2.2], [DX + 4 + bob*0.5, DY - 1.8]], '#ff8a30');
  dot(DX + 3.2 + bob*0.5, DY - 2.8, 0.35, '#1a1a1a');
  if (open) kid(DX - 0.5 + bob*0.4, DY - 0.5, 1, 1.6, 0.9);

  // ── Drinking fountain and bin by the gate ──────────────────────────
  R(30, 70, 3.5, 3.5, '#8a8e92'); dot(31.75, 71, 1.1, '#5ab0e0');
  dot(52, 72, 1.9, 'rgba(0,0,0,0.2)'); dot(51.6, 71.6, 1.7, '#3a6a3a'); dot(51.6, 71.6, 1, '#2a4a2a');

  // ── Parents' bench, with a small shade tree in the corner behind it ─
  dot(8, 76, 7, 'rgba(0,0,0,0.18)');                                         // canopy shadow
  R(12, 69, 14, 2.6, '#8a6034'); R(12, 68.3, 14, 0.8, '#a87a44');
  R(13, 71.6, 1.2, 2, '#5a4028'); R(24, 71.6, 1.2, 2, '#5a4028');
  if (open) {
    for (const [bx, i] of [[16, 3], [21, 1]]) {
      if (hash(90 + i) < 0.3) continue;
      dot(bx + 0.5, 70.3, 1.8, 'rgba(0,0,0,0.2)');
      dot(bx, 69.6, 2, ['#5a6a8a', '#8a4a5a', '#4a7a5a', '#6a5a8a'][i]);
      dot(bx, 68.9, 1.15, SKIN[Math.floor(hash(40 + i)*SKIN.length)]);
    }
  }
  dot(6, 73.5, 6.5, '#2f5a2a');
  dot(5, 72.4, 4.2, '#3f7a36');
  if (detail) for (let k = 0; k < 5; k++) dot(2 + hash(k + 150)*8, 68 + hash(k + 160)*9, 1.1, 'rgba(120,180,90,0.35)');

  // ── Kids on the tower, the slide and running about ─────────────────
  if (open) {
    const sf = (t*0.3 + hash(1)) % 1;
    if (sf < 0.35) {                                                         // down the slide
      const [x, y] = slidePt(sf/0.35);
      kid(x, y, 0, 3*(1 - sf/0.35) + 0.5);
    } else if (sf < 0.6) {                                                   // run back round to the ladder
      const k = (sf - 0.35)/0.25;
      kid(TX + TW + 8 - k*(TW + 2), TY + 32 - k*3, 0, Math.abs(Math.sin(t*10))*0.6);
    } else {                                                                 // climb the ladder, cross the deck
      const k = (sf - 0.6)/0.4;
      kid(TX + 5.5 + k*k*10, TY + TH + 6 - k*14, 0, 2 + k*2);
    }
    kid(8.3, TY + 5 + Math.sin(t*0.8)*3, 3, 1.5 + Math.sin(t*0.8)*1.2);       // on the net
    kid(15 + Math.sin(t*0.5 + 1)*1.5, 57 + Math.cos(t*0.4)*1.2, 2);          // in the sandbox
    kid(26, 58, 4);
    const ra = t*0.45 + hash(3)*6;                                           // chasing round the middle
    kid(40 + Math.cos(ra)*7, 36 + Math.sin(ra)*4, 5, Math.abs(Math.sin(t*9))*0.7);
  }
}

// Shared kit for the MK3 parks below: authored in a fixed box and fitted to
// the footprint, with the usual fill helpers plus a top-down person.
function _mk3ParkKit(px, py, w, h, AW, AH) {
  const s = Math.min(w / AW, h / AH);
  const X = v => px + v * s, Y = v => py + v * s;
  const R = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), ww * s, hh * s); };
  const RR = (x, y, ww, hh, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(X(x), Y(y), ww * s, hh * s, r * s); ctx.fill(); };
  const dot = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(x), Y(y), Math.max(0.01, r * s), 0, Math.PI * 2); ctx.fill(); };
  const ell = (x, y, rx, ry, c, rot = 0) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(X(x), Y(y), Math.max(0.01, rx * s), Math.max(0.01, ry * s), rot, 0, Math.PI * 2); ctx.fill(); };
  const poly = (pts, c) => { ctx.fillStyle = c; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.closePath(); ctx.fill(); };
  const ln = (x1, y1, x2, y2, c, lw = 1) => { ctx.strokeStyle = c; ctx.lineWidth = lw * s; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
  const glow = (x, y, r, rgb, a) => {
    if (a <= 0.005) return;
    const g = ctx.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r * s);
    g.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(X(x - r), Y(y - r), 2 * r * s, 2 * r * s);
  };
  const SKIN = ['#f0d0b0', '#c89870', '#8a5a3a', '#e0b890', '#6a4630'];
  const TOPS = ['#e8483a', '#3a70d8', '#f0c030', '#40b060', '#d060c0', '#ff8a30', '#f4f0e6', '#2a3a5a'];
  const person = (x, y, i, lift = 0, sc = 1) => {             // top-down: shoulders + head
    dot(x + 0.7 * sc, y + 1 * sc, 2 * sc, 'rgba(0,0,0,0.25)');
    ell(x, y - lift, 2.4 * sc, 1.7 * sc, TOPS[i % TOPS.length]);
    dot(x, y - lift - 0.3 * sc, 1.25 * sc, SKIN[i % SKIN.length]);
  };
  const tree = (x, y, r, hue = 0) => {
    ell(x + r * 0.3, y + r * 0.35, r, r * 0.8, 'rgba(0,0,0,0.22)');
    dot(x, y, r, ['#2e6a2a', '#3a7a30', '#4a8a36'][hue % 3]);
    dot(x - r * 0.3, y - r * 0.3, r * 0.55, 'rgba(160,220,110,0.3)');
  };
  return { s, X, Y, R, RR, dot, ell, poly, ln, glow, person, tree };
}

// ── Community Allotments (6×5) ──────────────────────────────────────────
// A big MK3-era community garden: a grid of allotment plots, each farmed
// differently — lettuce rows, tomatoes on canes, bean tepees, sunflowers,
// pumpkins, berry cages — with painted sheds, water butts, a shared
// greenhouse, compost bays, beehives with bees, a scarecrow, fruit trees and
// a picket fence. Gardeners dig and water by day; solar lanterns at night.
function renderAllotments(e, px, py, w, h, t) {
  const K = _mk3ParkKit(px, py, w, h, 240, 200);
  const { R, RR, dot, ell, poly, ln, glow, person, tree } = K;
  const hr = DayNight.hour(), dark = DayNight.darkness();
  const night = dark > 0.35, day = hr >= 7 && hr < 19 && !night;
  const detail = Camera.zoom > 0.4;
  const hash = n => { const x = Math.sin((e.col * 31 + e.row * 17 + n) * 12.9898) * 43758.5453; return x - Math.floor(x); };

  R(0, 0, 240, 200, '#4a7a3a');
  for (let k = 0; k < 12; k++) if (k % 2) R(k * 20, 0, 10, 200, 'rgba(255,255,255,0.03)');
  // picket fence
  for (let x = 4; x < 236; x += 4) { R(x, 4, 2, 5, '#f0ece0'); R(x, 191, 2, 5, '#f0ece0'); }
  for (let y = 4; y < 196; y += 4) { R(4, y, 5, 2, '#f0ece0'); R(231, y, 5, 2, '#f0ece0'); }
  R(4, 6, 232, 1, '#d8d2c0'); R(4, 193, 232, 1, '#d8d2c0');
  // fruit trees in the corners
  tree(18, 20, 11, 1); tree(222, 20, 11, 2); tree(18, 180, 10, 0);
  for (const [fx, fy] of [[14, 16], [22, 23], [218, 18], [226, 24]]) dot(fx, fy, 1.6, fx < 100 ? '#e03a2a' : '#f0a020');
  // central paths (bark chip)
  R(114, 12, 12, 176, '#a08a62'); R(12, 94, 216, 12, '#a08a62');
  if (detail) for (let k = 0; k < 60; k++) dot(12 + hash(k) * 216, 94 + hash(k + 90) * 12, 0.6, 'rgba(60,40,20,0.35)');

  // Plots: 2 columns × 2 rows either side of the paths → 8 beds
  const plots = [
    [16, 16, 44, 36], [66, 16, 44, 36], [130, 16, 44, 36], [180, 16, 44, 36],
    [16, 56, 44, 34], [66, 56, 44, 34], [130, 56, 44, 34], [180, 56, 44, 34],
  ];
  const soil = '#6a4a30', soilD = '#5a3e28';
  plots.forEach(([x, y, pw, ph], i) => {
    RR(x - 1, y - 1, pw + 2, ph + 2, 2, '#8a6a44');                     // timber edging
    R(x, y, pw, ph, soil);
    for (let r = y + 3; r < y + ph; r += 5) R(x + 1, r, pw - 2, 1.2, soilD);  // furrows
    const kind = i % 6;
    if (kind === 0) {                                                  // lettuce rows
      for (let r = y + 4; r < y + ph - 2; r += 6) for (let c = x + 4; c < x + pw - 2; c += 6) { dot(c, r, 2.4, '#6ac04a'); dot(c - 0.6, r - 0.6, 1.2, '#a0e070'); }
    } else if (kind === 1) {                                           // tomatoes on canes
      for (let c = x + 5; c < x + pw - 2; c += 7) for (let r = y + 5; r < y + ph - 3; r += 9) {
        ln(c, r - 3, c, r + 3, '#c8a860', 0.6); dot(c, r, 2.6, '#3e8a36');
        dot(c + 1.3, r + 0.6, 1, '#e0302a'); dot(c - 1, r - 1, 0.9, '#f05030');
      }
    } else if (kind === 2) {                                           // bean tepees
      for (let c = x + 9; c < x + pw; c += 15) for (let r = y + 9; r < y + ph; r += 16) {
        dot(c, r, 6, '#4a9a3a'); for (let a = 0; a < 5; a++) ln(c, r, c + Math.cos(a * 1.26) * 6, r + Math.sin(a * 1.26) * 6, '#c8a860', 0.5);
        dot(c, r, 1.4, '#c8a860'); dot(c + 3, r - 2, 0.8, '#f0f0f0'); dot(c - 2, r + 3, 0.8, '#e05a5a');
      }
    } else if (kind === 3) {                                           // sunflowers
      for (let c = x + 5; c < x + pw - 2; c += 8) for (let r = y + 6; r < y + ph - 2; r += 10) {
        const sw = Math.sin(t * 0.8 + c) * 0.6;
        dot(c + sw, r, 3.6, '#f0c020'); dot(c + sw, r, 1.6, '#6a3a18');
      }
    } else if (kind === 4) {                                           // pumpkins + squash vines
      for (let k = 0; k < 7; k++) { const cx = x + 6 + hash(i * 10 + k) * (pw - 12), cy = y + 6 + hash(i * 10 + k + 5) * (ph - 12); ell(cx, cy, 6, 4, '#4a8a3a'); }
      for (let k = 0; k < 5; k++) { const cx = x + 8 + hash(i * 20 + k) * (pw - 16), cy = y + 8 + hash(i * 20 + k + 5) * (ph - 16); ell(cx, cy, 3.2, 2.6, '#e8841e'); ln(cx, cy - 2.6, cx, cy - 1.4, '#5a4a20', 0.6); }
    } else {                                                           // berry cage
      for (let r = y + 5; r < y + ph - 2; r += 7) for (let c = x + 5; c < x + pw - 2; c += 7) { dot(c, r, 2.8, '#2e6a2e'); dot(c + 1, r + 1, 0.8, i % 2 ? '#a02050' : '#3040a0'); }
      ctx.strokeStyle = 'rgba(40,60,40,0.55)'; ctx.lineWidth = 0.4 * K.s;
      for (let c = x; c <= x + pw; c += 4) ln(c, y, c, y + ph, 'rgba(40,60,40,0.4)', 0.3);
      for (let r = y; r <= y + ph; r += 4) ln(x, r, x + pw, r, 'rgba(40,60,40,0.4)', 0.3);
    }
  });

  // Lower half: shared greenhouse, sheds, compost, hives, raised beds
  // greenhouse
  RR(16, 112, 70, 40, 2, '#dfeff4');
  RR(18, 114, 66, 36, 1, 'rgba(160,210,190,0.7)');
  for (let k = 0; k < 8; k++) { dot(24 + k * 8, 124, 2.4, '#3e8a36'); dot(24 + k * 8, 140, 2.4, '#4a9a3a'); if (k % 2) dot(25 + k * 8, 125, 0.9, '#e0302a'); }
  for (let x = 18; x < 86; x += 6.6) ln(x, 114, x, 150, 'rgba(255,255,255,0.8)', 0.5);
  ln(51, 112, 51, 152, '#ffffff', 1.2);
  // sheds with coloured doors + water butts
  for (const [sx, col] of [[96, '#3a70c8'], [132, '#c83a3a'], [168, '#3a9a5a']]) {
    R(sx + 2, 116, 26, 20, 'rgba(0,0,0,0.25)');
    R(sx, 112, 26, 20, '#8a6a44');
    poly([[sx - 2, 112], [sx + 13, 106], [sx + 28, 112]], '#4a4a52');
    R(sx + 9, 120, 8, 12, col);
    dot(sx + 15.5, 126, 0.7, '#e0c060');
    dot(sx + 24, 136, 3.2, '#2a3a2a'); dot(sx + 24, 136, 2.2, '#3a5a8a');   // water butt
  }
  // raised beds + herb spiral
  for (let k = 0; k < 3; k++) { RR(96 + k * 34, 146, 28, 12, 1, '#a07a50'); for (let c = 0; c < 5; c++) dot(100 + k * 34 + c * 5, 152, 2, ['#5aa040', '#a060c0', '#70b050'][k]); }
  ctx.strokeStyle = '#8a8a80'; ctx.lineWidth = 2.2 * K.s; ctx.beginPath();
  for (let a = 0; a < Math.PI * 5; a += 0.2) { const r = 1 + a * 1.1; const xx = K.X(214 + Math.cos(a) * r), yy = K.Y(124 + Math.sin(a) * r); a ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
  ctx.stroke();
  for (let k = 0; k < 8; k++) dot(214 + Math.cos(k) * (3 + k * 1.6), 124 + Math.sin(k) * (3 + k * 1.6), 1.6, '#5aa040');
  // compost bays
  for (let k = 0; k < 3; k++) { R(20 + k * 16, 164, 14, 14, '#8a6a44'); R(22 + k * 16, 166, 10, 10, ['#5a3e28', '#6a5a30', '#4a3420'][k]); }
  // beehives + bees
  for (let k = 0; k < 3; k++) { R(80 + k * 12, 168, 9, 10, '#f0e8c8'); R(80 + k * 12, 167, 9, 2, '#8a8a80'); R(82 + k * 12, 175, 5, 1, '#3a3a30'); }
  if (day) for (let b = 0; b < 8; b++) {
    const a = t * (1.6 + b * 0.2) + b, rr = 6 + (b % 3) * 5;
    dot(92 + Math.cos(a) * rr * 1.6, 170 + Math.sin(a * 1.3) * rr * 0.6, 0.7, '#f0c020');
  }
  // scarecrow
  ln(170, 164, 170, 184, '#6a4a2a', 1.2); ln(162, 170, 178, 170, '#6a4a2a', 1.2);
  ell(170, 172, 4, 3, '#3a5ab0'); dot(170, 164, 2.4, '#e0c080'); ell(170, 162, 4, 1.4, '#c8a040');
  if (detail) { dot(164, 172, 1.2, '#1a1a1a'); dot(166 + Math.sin(t) * 2, 158, 1.1, '#1a1a1a'); }   // a crow keeps an eye on it
  // notice board + wheelbarrow on the path
  R(128, 176, 18, 10, '#6a4a2a'); R(129, 177, 16, 7, '#e8e0c8');
  for (let k = 0; k < 3; k++) R(130 + k * 5, 178, 4, 3, ['#e05a5a', '#5a8ae0', '#f0c030'][k]);
  {
    const wx = 120 + Math.sin(t * 0.15) * 40, wy = 100;
    ell(wx, wy, 5, 3, '#3a7a3a'); dot(wx + 6, wy, 1.6, '#1a1a1a'); ln(wx - 4, wy - 2, wx - 9, wy - 3, '#6a4a2a', 0.8); ln(wx - 4, wy + 2, wx - 9, wy + 3, '#6a4a2a', 0.8);
  }
  // gardeners
  if (day) {
    person(40 + Math.sin(t * 0.3) * 10, 34, 3, Math.abs(Math.sin(t * 2)) * 0.6, 1.3);
    person(150, 70 + Math.sin(t * 0.25) * 8, 5, 0, 1.3);
    person(196 + Math.sin(t * 0.2) * 12, 40, 1, 0, 1.3);
    // watering can spray
    for (let k = 0; k < 4; k++) { const ph = (t * 2 + k / 4) % 1; dot(154 + ph * 5, 70 + Math.sin(t * 0.25) * 8 + ph * 3, 0.6, `rgba(170,220,255,${(1 - ph).toFixed(2)})`); }
    person(60 + Math.sin(t * 0.18) * 20, 185, 6, 0, 1.3);
  }
  // solar lanterns along the paths at night
  for (const [lx, ly] of [[112, 20], [128, 20], [112, 180], [128, 180], [20, 92], [220, 92], [20, 108], [220, 108]]) {
    dot(lx, ly, 1.4, night ? '#fff0b0' : '#4a4a42');
    if (night) glow(lx, ly, 10, '255,230,160', 0.45);
  }
}

// ── Dog Park (5×4) ──────────────────────────────────────────────────────
// Fenced off-leash park with a double-gated entry, a big field with worn
// paths, an agility course (A-frame, jumps, weave poles, tunnel, tyre), a
// separate small-dog run under a shade sail with a paddling pool, a
// drinking fountain, a fire hydrant, shade trees, benches with owners and
// waste stations. By day dogs chase balls and each other, one runs the
// weave poles with its handler, one digs, one drinks, and owners come and
// go on leads through the gate; toys lie about the grass. After rain the
// path holds puddles. At dusk the lamp posts come on and the park empties.
function renderDogPark(e, px, py, w, h, t) {
  const K = _mk3ParkKit(px, py, w, h, 200, 160);
  const { R, RR, dot, ell, poly, ln, glow, person, tree } = K;
  const hr = DayNight.hour(), dark = DayNight.darkness();
  const night = dark > 0.35;
  const raining = typeof RainSystem !== 'undefined' && RainSystem.isActive();
  const open = hr >= 6 && hr < 21 && !night && !raining;
  const detail = Camera.zoom > 0.4, fine = Camera.zoom > 0.8;

  R(0, 0, 200, 160, '#5a8a40');
  for (let k = 0; k < 10; k++) if (k % 2) R(k * 20, 0, 10, 160, 'rgba(255,255,255,0.035)');
  // grass tufts and clover, fixed in place
  if (detail) for (let k = 0; k < 60; k++) {
    const gx = 8 + ((k * 61) % 184), gy = 8 + ((k * 89) % 144);
    if (gx > 148 && gy < 82) continue;                                      // not on the wood chips
    dot(gx, gy, 1 + (k % 3) * 0.4, k % 4 ? 'rgba(30,70,20,0.22)' : 'rgba(170,220,120,0.22)');
  }
  // worn dirt paths round the field
  ctx.strokeStyle = 'rgba(160,130,80,0.55)'; ctx.lineWidth = 7 * K.s;
  ctx.beginPath(); ctx.ellipse(K.X(92), K.Y(82), 60 * K.s, 42 * K.s, 0, 0, Math.PI * 2); ctx.stroke();
  // bare patches where every dog goes: inside the gate and round the fountain
  ell(96, 138, 14, 5, 'rgba(160,130,80,0.45)'); ell(144, 142, 8, 5, 'rgba(160,130,80,0.4)');
  // puddles on the path after rain
  if (raining) for (const [qx, qy, qr] of [[34, 86, 4], [92, 41, 5], [146, 92, 3.5], [80, 123, 4.5]]) {
    ell(qx, qy, qr, qr * 0.55, 'rgba(110,130,150,0.65)'); ell(qx - qr * 0.3, qy - qr * 0.15, qr * 0.4, qr * 0.18, 'rgba(220,235,250,0.35)');
  }
  // small-dog run (east), wood-chip surface
  R(150, 10, 44, 70, '#8a7a50');
  if (detail) for (let k = 0; k < 40; k++) dot(152 + ((k * 37) % 40), 12 + ((k * 53) % 66), 0.6, 'rgba(60,40,20,0.4)');
  // its paddling pool, a low ramp and a bench
  ell(182, 64, 8, 6, '#e0e4ea'); ell(182, 64, 6.6, 4.8, '#58b0e0');
  if (detail) ell(180 + Math.sin(t * 1.5), 63, 2.4, 0.8, 'rgba(255,255,255,0.45)');
  poly([[156, 50], [166, 47], [166, 53], [156, 56]], '#c08a40'); R(166, 47, 6, 6, '#c08a40');
  if (detail) for (let k = 0; k < 4; k++) ln(158 + k * 2.4, 49.5 - k * 0.7, 158 + k * 2.4, 55.5 - k * 0.7, 'rgba(0,0,0,0.2)', 0.4);
  R(156, 72, 16, 3, '#8a6a44');
  if (open) person(162, 73.5, 4, 0, 1.2);
  // fences: perimeter chain-link with posts, plus the small-dog divider
  const fence = (x1, y1, x2, y2) => { ln(x1, y1, x2, y2, 'rgba(210,214,216,0.9)', 1.2); const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 10; for (let k = 0; k <= n; k++) dot(x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n, 1.2, '#6a6e72'); };
  fence(6, 6, 194, 6); fence(194, 6, 194, 154); fence(6, 6, 6, 154); fence(6, 154, 80, 154); fence(112, 154, 194, 154);
  fence(148, 6, 148, 82); fence(148, 82, 194, 82);
  // double-gated entry airlock
  R(80, 144, 32, 16, '#b0a078'); fence(80, 144, 112, 144); fence(80, 144, 80, 154); fence(112, 144, 112, 154);
  const gateOpen = open && Math.sin(t * 0.4) > 0.8;
  ln(84, 154, gateOpen ? 88 : 96, gateOpen ? 160 : 154, '#e0e0e0', 1.4);
  // shade trees + benches with owners
  tree(24, 24, 12, 0); tree(24, 132, 11, 1); tree(128, 22, 10, 2);
  for (const [bx, by, bi] of [[36, 40, 0], [36, 118, 2], [130, 40, 5]]) {
    R(bx, by, 16, 3, '#8a6a44');
    if (open) { person(bx + 4, by + 1.5, bi, 0, 1.3); person(bx + 11, by + 1.5, bi + 3, 0, 1.3); }
  }
  // shade sail over the small-dog run, on three posts
  poly([[154, 14], [190, 18], [170, 40]], 'rgba(0,0,0,0.12)');
  poly([[152, 12], [188, 16], [168, 38]], 'rgba(240,236,220,0.82)');
  if (detail) { ln(152, 12, 188, 16, 'rgba(0,0,0,0.15)', 0.5); for (const [sx, sy] of [[152, 12], [188, 16], [168, 38]]) dot(sx, sy, 1, '#6a6e72'); }
  // agility course
  ell(82, 33, 21, 3, 'rgba(0,0,0,0.18)');                                 // A-frame shadow
  poly([[60, 30], [80, 26], [100, 30], [80, 34]], '#e0a030'); ln(60, 30, 100, 30, '#c07020', 0.8);   // A-frame
  if (detail) {
    poly([[60, 30], [66, 28.8], [66, 31.2]], '#f0e040'); poly([[100, 30], [94, 28.8], [94, 31.2]], '#f0e040');   // yellow contact zones
    if (fine) for (let x = 68; x < 94; x += 4) ln(x, 28 + Math.abs(x - 80) * 0.15, x, 32 - Math.abs(x - 80) * 0.15, 'rgba(120,60,10,0.35)', 0.4);   // grip slats
  }
  // pause table and a fire hydrant (every dog's favourite)
  R(16, 98, 11, 9, '#3a70d0'); R(17, 99, 9, 7, '#4a88e8'); R(16, 106, 11, 1.4, 'rgba(0,0,0,0.25)');
  dot(113, 96, 3, 'rgba(0,0,0,0.2)'); dot(112, 95, 2.4, '#d83a2a'); dot(112, 95, 1.2, '#f0d040');
  if (detail) { R(109, 94.4, 1.4, 1.2, '#b02a20'); R(113.6, 94.4, 1.4, 1.2, '#b02a20'); }
  for (let k = 0; k < 3; k++) { const jx = 60 + k * 16; ln(jx, 118, jx, 126, '#f0f0f0', 1); ln(jx, 118, jx + 1, 126, 'rgba(0,0,0,0)', 0); R(jx - 0.5, 121, 1, 1, '#e03a3a'); ln(jx - 4, 122, jx + 4, 122, k % 2 ? '#e03a3a' : '#3a70e0', 1.4); }   // jumps
  for (let k = 0; k < 7; k++) { dot(116 + k * 5, 110, 1, '#f0f0f0'); ln(116 + k * 5, 108, 116 + k * 5, 110, k % 2 ? '#e03a3a' : '#f0f0f0', 0.8); }   // weave poles
  RR(105, 135, 34, 2.4, 1, 'rgba(0,0,0,0.18)');
  RR(104, 126, 34, 8, 4, '#3a80d0'); for (let x = 108; x < 138; x += 4) ln(x, 126, x, 134, 'rgba(0,0,0,0.25)', 0.5);   // tunnel
  ell(104.6, 130, 1.6, 3.4, '#1a2a4a'); ell(137.4, 130, 1.6, 3.4, '#1a2a4a');   // its open ends
  ell(40, 80, 6, 6, '#2a2a2a'); ell(40, 80, 3.4, 3.4, '#5a8a40');         // tyre jump
  if (detail) { ln(32, 80, 34, 80, '#d8d8d8', 0.8); ln(46, 80, 48, 80, '#d8d8d8', 0.8); dot(32, 80, 1, '#d8d8d8'); dot(48, 80, 1, '#d8d8d8'); }   // the posts it hangs between
  // drinking fountain + water bowl
  dot(142, 140, 3.4, '#9aa0a6'); dot(146, 144, 2.2, '#3a90c8');
  if (open) dot(142, 139, 0.8, 'rgba(200,240,255,0.9)');
  if (detail && open) { const ph = (t * 1.6) % 1; dot(142 + ph * 3, 139 + ph * 4, 0.5, `rgba(200,240,255,${(1 - ph).toFixed(2)})`); }
  // toys left about: tennis balls, a frisbee, a rope tug
  if (detail) {
    for (const [tx, ty] of [[54, 58], [126, 70], [70, 108], [176, 30], [160, 62]]) dot(tx, ty, 1, '#d8f020');
    ell(102, 52, 2.6, 2.2, '#e8483a'); ell(102, 52, 1.6, 1.3, 'rgba(255,255,255,0.25)');
    ln(30, 60, 36, 62, '#3a70d8', 1.2); dot(30, 60, 1, '#f0f0f0'); dot(36, 62, 1, '#f0f0f0');
  }
  // a hole someone has dug, with the earth thrown out behind it
  ell(58, 96, 3, 2, '#4a3420'); ell(58.5, 92.4, 2.6, 1.4, '#7a5a34');
  // waste stations (bag dispenser on a post, bin) + sign
  R(12, 144, 5, 8, '#2a6a3a'); R(12, 142, 5, 2, '#1a1a1a');
  if (detail) { ln(20, 152, 20, 143, '#6a6e72', 0.8); R(18.4, 142, 3.2, 3, '#2a8a4a'); }
  R(152, 84, 5, 6, '#2a6a3a'); R(152, 83, 5, 1.6, '#1a1a1a');
  RR(118, 146, 24, 8, 1, '#2a5a3a');
  if (Camera.zoom > 0.5) { ctx.save(); ctx.font = `bold ${4.4 * K.s}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f0f0e0'; ctx.fillText('DOG PARK', K.X(130), K.Y(150.2)); ctx.restore(); }

  // dogs: several running laps and chasing balls, small dogs in their run
  const COATS = ['#c8a060', '#2a2a2a', '#f0ece0', '#8a5a30', '#d8c8a0', '#6a6a6a', '#e0b070'];
  const COLLARS = ['#e8483a', '#3a70d8', '#f0c030', '#40b060'];
  const dog =(x, y, dir, coat, sc = 1, run = 0) => {
    ctx.save(); ctx.translate(K.X(x), K.Y(y)); ctx.rotate(dir); ctx.scale(K.s * sc, K.s * sc);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(0.6, 1.2, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = coat; ctx.beginPath(); ctx.ellipse(0, 0, 4, 1.8, 0, 0, Math.PI * 2); ctx.fill();   // body
    ctx.beginPath(); ctx.arc(4.2, 0, 1.6, 0, Math.PI * 2); ctx.fill();                                 // head
    ctx.fillRect(-5.5, -0.4 + Math.sin(run * 3) * 0.6, 2, 0.8);                                        // wagging tail
    if (detail) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';                                                                 // ears
      ctx.beginPath(); ctx.ellipse(3.6, -1.3, 0.9, 0.6, -0.4, 0, Math.PI * 2); ctx.ellipse(3.6, 1.3, 0.9, 0.6, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLLARS[Math.max(0, COATS.indexOf(coat)) % COLLARS.length];
      ctx.fillRect(2.4, -1.5, 0.7, 3);                                                                   // collar
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(5.3, 0, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };
  if (open) {
    // a dog drinking at the bowl, one nosing round the tree, one digging its hole
    dog(150.5, 144.5, Math.PI, COATS[4], 1, t * 4);
    dog(42, 142, Math.PI + 0.3, COATS[1], 1, t * 5 + Math.sin(t * 3));
    dog(50, 96, 0, COATS[3], 1, t * 9);
    if (detail) for (let k = 0; k < 3; k++) { const ph = (t * 2.2 + k / 3) % 1; dot(45 - ph * 5, 96 + (k - 1) * 1.6 - Math.sin(ph * Math.PI) * 3, 0.6, `rgba(90,60,30,${(1 - ph).toFixed(2)})`); }   // flying earth
    // agility: a dog weaves the poles while its handler jogs alongside, then trots back
    {
      const u = (t * 0.12) % 1, out = u < 0.6, v = out ? u / 0.6 : 1 - (u - 0.6) / 0.4;
      const wx = 112 + v * 38;
      const wy = out ? 110 + Math.sin(v * Math.PI * 7) * 2.6 : 104;
      dog(wx, wy, out ? Math.cos(v * Math.PI * 7) * 0.6 : Math.PI, COATS[2], 1, t * 9);
      person(wx - 2, 116, 5, 0, 1.3);
    }
    // an owner coming and going through the gate with a dog on the lead
    {
      const u = (t * 0.06) % 1, inward = u < 0.5, v = inward ? u * 2 : 2 - u * 2;
      const oy = 158 - v * 24, ox = 96 + (inward ? 0 : 4);
      person(ox, oy, 2, 0, 1.3);
      const dy = oy - 6, dx = ox + 3;
      ln(ox + 1, oy - 1, dx, dy, '#e8483a', 0.4);
      dog(dx, dy, inward ? -Math.PI / 2 : Math.PI / 2, COATS[6], 1, t * 6);
    }
    for (let d = 0; d < 5; d++) {
      const a = t * (0.5 + d * 0.07) + d * 1.3;
      const x = 92 + Math.cos(a) * (58 - d * 4), y = 82 + Math.sin(a) * (40 - d * 3);
      dog(x, y, a + Math.PI / 2, COATS[d], 1.1, t * 6 + d);
    }
    // fetch: a ball arcs out, a dog races after it and brings it back
    const u = (t * 0.2) % 1, bx = 70 + Math.sin(u * Math.PI) * 50, by = 70 - Math.sin(u * Math.PI) * 10;
    dot(bx, by - Math.sin(u * Math.PI * 2) * 4, 1.3, '#d8f020');
    dog(bx - 6 * Math.cos(u * Math.PI), by + 3, u < 0.5 ? 0 : Math.PI, COATS[5], 1.1, t * 8);
    person(66, 72, 7, 0, 1.4);                                                                          // thrower
    for (let d = 0; d < 3; d++) { const a = t * 0.9 + d * 2.1; dog(171 + Math.cos(a) * 12, 46 + Math.sin(a) * 22, a + Math.PI / 2, COATS[(d + 2) % 7], 0.75, t * 7 + d); }
  } else if (!night) {
    dog(40, 44, 0, COATS[0], 1); dog(46, 122, Math.PI, COATS[3], 1);                                   // a couple resting in the shade
  }
  // lamp posts
  for (const [lx, ly] of [[8, 8], [192, 8], [8, 152], [192, 152], [96, 84]]) {
    dot(lx, ly, 1.6, night ? '#fff0c0' : '#5a5a54');
    if (night) glow(lx, ly, 20, '255,230,170', 0.35);
  }
}

// ── Community Center (6×4) ──────────────────────────────────────────────
// A modern MK3-era neighbourhood hall, front-on from slightly above like the
// estates: a timber-clad hall under a monopitch roof with solar panels and a
// clerestory, a glazed foyer with a canopy and a colourful mural, classes
// visible through the windows (yoga, a choir, a bingo night), a plaza with
// planters, benches, a bike rack and a noticeboard, and a half-court with a
// game on it. Powered: lights and heating draw 14 kW 08:00–22:00; without
// power in those hours the windows go dark (and it pays half, like the
// splash pad). Warm windows and a lit sign in the evening.
function renderCommunityCenter(e, px, py, w, h, t) {
  const K = _mk3ParkKit(px, py, w, h, 240, 160);
  const { R, RR, dot, ell, poly, ln, glow, person, tree } = K;
  const hr = DayNight.hour(), dark = DayNight.darkness();
  const night = dark > 0.35;
  const scheduled = hr >= 8 && hr < 22;
  const lit = scheduled && e.powered;
  const open = scheduled;
  const detail = Camera.zoom > 0.4;

  R(0, 0, 240, 160, '#4e7e3c');
  for (let k = 0; k < 12; k++) if (k % 2) R(k * 20, 0, 10, 160, 'rgba(255,255,255,0.03)');
  tree(12, 14, 10, 0); tree(228, 14, 10, 1); tree(60, 10, 9, 2); tree(190, 10, 9, 0);

  // ── Building ──
  const bx0 = 30, bx1 = 210, roofY = 22, faceY = 46, groundY = 96;
  poly([[bx0 + 4, groundY], [bx1 + 4, groundY], [bx1 + 10, groundY + 6], [bx0 + 10, groundY + 6]], 'rgba(0,0,0,0.22)');
  // monopitch roof (seen from above, rising to the back) with solar + clerestory
  poly([[bx0 - 4, faceY], [bx0, roofY], [bx1, roofY], [bx1 + 4, faceY]], '#5a5e66');
  for (let k = 0; k < 9; k++) {
    R(bx0 + 10 + k * 18, roofY + 4, 15, 11, '#22324a');
    if (detail) { ln(bx0 + 17.5 + k * 18, roofY + 4, bx0 + 17.5 + k * 18, roofY + 15, 'rgba(160,190,230,0.35)', 0.4); ln(bx0 + 10 + k * 18, roofY + 9.5, bx0 + 25 + k * 18, roofY + 9.5, 'rgba(160,190,230,0.35)', 0.4); }
  }
  R(bx0 - 4, faceY - 5, bx1 - bx0 + 8, 5, lit ? '#ffe0a0' : night ? '#1a2230' : '#9ab4c8');   // clerestory band
  R(bx0 - 5, faceY - 1, bx1 - bx0 + 10, 2.5, '#f0f0ea');                                        // fascia
  // timber-clad face
  R(bx0, faceY, bx1 - bx0, groundY - faceY, '#c89a64');
  if (detail) for (let x = bx0 + 2; x < bx1; x += 3) R(x, faceY, 0.6, groundY - faceY, 'rgba(0,0,0,0.12)');
  // mural panel (west end)
  RR(bx0 + 4, faceY + 6, 34, 40, 2, '#f0ece0');
  for (let k = 0; k < 5; k++) dot(bx0 + 10 + k * 6, faceY + 20 + Math.sin(k) * 6, 6, ['#e8483a', '#f0c030', '#3a70d8', '#40b060', '#d060c0'][k]);
  for (let k = 0; k < 4; k++) { dot(bx0 + 10 + k * 8, faceY + 38, 2, '#6a4630'); ell(bx0 + 10 + k * 8, faceY + 42, 2.4, 1.6, ['#3a70d8', '#e8483a', '#f0c030', '#40b060'][k]); }   // painted people holding hands
  // hall windows with classes inside
  const win = (x, y, ww, hh, scene) => {
    R(x - 1, y - 1, ww + 2, hh + 2, '#f0f0ea');
    R(x, y, ww, hh, lit ? '#ffe4b0' : night ? '#141c26' : '#8ab0c8');
    if (open && (lit || !night)) {
      if (scene === 'yoga') for (let k = 0; k < 3; k++) { const pose = Math.sin(t * 0.6 + k) > 0; R(x + 4 + k * 8, y + hh - 5, 6, 1.2, '#7a50c8'); person(x + 7 + k * 8, y + hh - 6 - (pose ? 2 : 0), k + 2, 0, 1); }
      if (scene === 'choir') for (let k = 0; k < 4; k++) person(x + 5 + k * 6, y + hh - 4 - (k % 2) * 3 + Math.sin(t * 3 + k) * 0.4, k + 4, 0, 1);
      if (scene === 'bingo') { R(x + 3, y + hh - 7, ww - 6, 3, '#8a6a44'); for (let k = 0; k < 3; k++) person(x + 7 + k * 8, y + hh - 9, k, 0, 1); if (Math.sin(t * 2) > 0) dot(x + ww - 5, y + 5, 1.6, '#f0c030'); }
    }
    if (!night && !lit) poly([[x + 2, y], [x + 7, y], [x + 2, y + hh], [x - 3, y + hh]], 'rgba(255,255,255,0.2)');
    if (lit && night) glow(x + ww / 2, y + hh / 2, 20, '255,210,140', 0.22);
  };
  win(bx0 + 44, faceY + 8, 30, 22, 'yoga');
  win(bx0 + 136, faceY + 8, 36, 22, 'choir');
  win(bx0 + 100, faceY + 8, 30, 22, 'bingo');
  // glazed foyer + canopy + sign
  R(bx0 + 76, faceY + 4, 22, groundY - faceY - 4, '#f0f0ea');
  R(bx0 + 78, faceY + 6, 18, groundY - faceY - 6, lit ? '#ffd890' : night ? '#141c26' : '#9ac0d4');
  ln(bx0 + 87, faceY + 6, bx0 + 87, groundY, '#f0f0ea', 0.8);
  R(bx0 + 68, faceY + 30, 38, 4, '#f0f0ea');                                                  // canopy
  R(bx0 + 70, faceY + 34, 1.6, groundY - faceY - 34, '#f0f0ea'); R(bx0 + 103, faceY + 34, 1.6, groundY - faceY - 34, '#f0f0ea');
  RR(bx0 + 56, faceY - 16, 64, 10, 2, '#2a3a5a');
  ctx.save(); ctx.font = `bold ${5.4 * K.s}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = lit && night ? '#ffe8a0' : '#f4f0e6'; if (lit && night) { ctx.shadowColor = '#ffd070'; ctx.shadowBlur = 6 * K.s; }
  ctx.fillText('COMMUNITY CENTER', K.X(bx0 + 88), K.Y(faceY - 10.8)); ctx.restore();
  R(bx0, groundY - 3, bx1 - bx0, 3, '#8a8478');                                                  // plinth

  // ── Plaza ──
  R(20, groundY + 2, 150, 44, '#d8d0c0');
  if (detail) for (let x = 20; x < 170; x += 10) R(x, groundY + 2, 0.5, 44, 'rgba(0,0,0,0.08)');
  for (const [qx, qy] of [[34, 112], [150, 112], [34, 134]]) { RR(qx - 8, qy - 5, 16, 10, 2, '#8a8478'); for (let k = 0; k < 4; k++) dot(qx - 5 + k * 3.4, qy, 2.6, ['#e8483a', '#f0c030', '#d060c0', '#40b060'][k]); }
  for (const [bxx, byy] of [[60, 132], [104, 132]]) R(bxx, byy, 18, 3, '#8a6a44');
  // bike rack with bikes
  for (let k = 0; k < 5; k++) { const x = 118 + k * 6; ctx.strokeStyle = '#9a9a92'; ctx.lineWidth = 0.7 * K.s; ctx.beginPath(); ctx.arc(K.X(x), K.Y(140), 2.2 * K.s, Math.PI, 0); ctx.stroke(); if (open && k % 2 === 0) { ln(x - 1.6, 136, x + 1.6, 141, TOPS_BIKE(k), 0.8); dot(x - 1.6, 141, 1.3, '#1a1a1a'); dot(x + 1.6, 136, 1.3, '#1a1a1a'); } }
  // noticeboard
  R(84, 104, 22, 12, '#6a4a2a'); R(85, 105, 20, 9, '#e8e0c8');
  for (let k = 0; k < 4; k++) R(86 + k * 5, 106, 4, 3.4, ['#e05a5a', '#5a8ae0', '#f0c030', '#60c070'][k]);
  // people coming and going through the plaza
  if (open) for (let p = 0; p < 6; p++) {
    const u = (t * (0.02 + p * 0.004) + p * 0.17) % 1;
    const toDoor = p % 2 === 0;
    const k = toDoor ? u : 1 - u;
    const x = 30 + p * 22 + (bx0 + 87 - 30 - p * 22) * k, y = 150 - (150 - groundY - 4) * k;
    person(x, y, p + 1, 0, 1.2);
  }

  // ── Half-court (east) with a game ──
  R(176, groundY + 2, 60, 58, '#3a6a9a');
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.8 * K.s;
  ctx.strokeRect(K.X(180), K.Y(groundY + 6), 52 * K.s, 50 * K.s);
  ctx.beginPath(); ctx.arc(K.X(206), K.Y(groundY + 6), 16 * K.s, 0, Math.PI); ctx.stroke();
  R(203, groundY + 2, 6, 3, '#f0f0f0'); dot(206, groundY + 7, 2, 'rgba(255,120,40,0.8)');   // hoop
  if (open && !night) {
    const a = t * 1.3;
    for (let k = 0; k < 4; k++) person(206 + Math.cos(a + k * 1.6) * 14, groundY + 30 + Math.sin(a * 0.8 + k) * 10, k + 3, 0, 1.2);
    const bu = (t * 0.7) % 1; dot(206 + Math.cos(a) * 10 * (1 - bu), groundY + 28 - Math.sin(bu * Math.PI) * 16, 1.3, '#f07a20');
  }
  // lamp posts
  for (const [lx, ly] of [[22, 100], [172, 100], [22, 152], [172, 152]]) {
    R(lx - 0.6, ly - 1, 1.2, 2, '#3a3a40'); dot(lx, ly - 2, 1.8, night ? '#fff0c0' : '#5a5a54');
    if (night) glow(lx, ly - 2, 18, '255,230,170', 0.4);
  }
  function TOPS_BIKE(k) { return ['#e8483a', '#3a70d8', '#40b060', '#f0c030', '#d060c0'][k % 5]; }
}

// ── Botanic Greenhouse (8×6) ────────────────────────────────────────────
// An MK3-era public glasshouse, authored 240×180 and seen from above: a
// central palm house under a ribbed glass dome, with a tropical wing (west)
// and a desert wing of cacti and succulents (east), white glazing bars and
// roof vents that crack open on warm afternoons. Visitors wander the
// gravel paths between a lily pond with a footbridge, a herb garden, rose
// beds and a potting shed with stacked terracotta. Powered: grow lights,
// misting and fans draw 18 kW 06:00–22:00 and heating keeps 5 kW on all
// night. Lit, the glass glows a soft magenta-green at dusk; starved of
// power, the glass goes dark and cold (and it pays half, like the other
// powered parks).
function renderGreenhouse(e, px, py, w, h, t) {
  const K = _mk3ParkKit(px, py, w, h, 240, 180);
  const { R, RR, dot, ell, poly, ln, glow, person, tree } = K;
  const hr = DayNight.hour(), dark = DayNight.darkness();
  const night = dark > 0.35;
  const lightsOn = hr >= 6 && hr < 22;
  const lit = lightsOn && e.powered;
  const warm = e.powered;                       // heating runs round the clock
  const open = hr >= 9 && hr < 20;
  const detail = Camera.zoom > 0.4;
  const hash = n => { const x = Math.sin((e.col * 31 + e.row * 17 + n) * 12.9898) * 43758.5453; return x - Math.floor(x); };

  // ── Grounds ──
  R(0, 0, 240, 180, '#4a7c3a');
  for (let k = 0; k < 12; k++) if (k % 2) R(k * 20, 0, 10, 180, 'rgba(255,255,255,0.03)');
  tree(10, 12, 9, 0); tree(230, 12, 9, 2); tree(10, 168, 9, 1); tree(230, 168, 9, 0);
  // gravel paths: a loop round the glasshouse and a spine to the gate
  const PATH = '#d8ccb0';
  R(14, 100, 212, 10, PATH); R(14, 24, 10, 86, PATH); R(216, 24, 10, 86, PATH); R(14, 18, 212, 8, PATH);
  R(114, 110, 12, 70, PATH);

  // ── Glasshouse ──
  const gx0 = 28, gx1 = 212, gy0 = 30, gy1 = 96;
  const glass = lit ? (night ? '#8a5a9a' : '#cfeedd') : warm ? (night ? '#2a3a40' : '#a8d4d0') : (night ? '#141c22' : '#8aa8aa');
  const plantA = lit || !night ? '#2f7a34' : '#16301a', plantB = lit || !night ? '#4aa040' : '#1e3a20';
  poly([[gx0 + 4, gy1], [gx1 + 4, gy1], [gx1 + 10, gy1 + 5], [gx0 + 10, gy1 + 5]], 'rgba(0,0,0,0.22)');
  const pane = (x0, y0, x1, y1) => {
    R(x0, y0, x1 - x0, y1 - y0, '#e8ece8');                       // white frame
    R(x0 + 1.5, y0 + 1.5, x1 - x0 - 3, y1 - y0 - 3, glass);
  };
  // west (tropical) wing
  pane(gx0, gy0 + 12, gx0 + 62, gy1);
  for (let k = 0; k < 7; k++) {                                   // big leaves under the glass
    const lx = gx0 + 8 + k * 8 + hash(k) * 3, ly = gy0 + 26 + (k % 3) * 14;
    ell(lx, ly, 6, 3.4, k % 2 ? plantA : plantB, hash(k + 9) * 3);
    if (k % 3 === 0) dot(lx + 2, ly - 2, 1.6, lit || !night ? ['#e8483a', '#f0a030', '#d060c0'][k % 3] : '#3a2a2a');
  }
  // east (desert) wing: sand beds, cacti and agaves
  pane(gx1 - 62, gy0 + 12, gx1, gy1);
  R(gx1 - 58, gy0 + 54, 54, 8, lit || !night ? '#d8c088' : '#4a4030');
  for (let k = 0; k < 6; k++) {
    const cx = gx1 - 54 + k * 9, cy = gy0 + 30 + (k % 2) * 16;
    if (k % 2) { for (let a = 0; a < 6; a++) ln(cx, cy, cx + Math.cos(a) * 4, cy + Math.sin(a) * 4, plantB, 1.2); }
    else { dot(cx, cy, 3.4, '#5a9a50'); dot(cx - 3, cy - 2, 1.6, '#5a9a50'); dot(cx + 3, cy - 3, 1.6, '#5a9a50'); if (k === 2 && !night) dot(cx, cy - 3, 1, '#f070a0'); }
  }
  // central palm house under a dome
  const dcx = (gx0 + gx1) / 2, dcy = (gy0 + gy1) / 2 + 2, dr = 38;
  dot(dcx, dcy, dr + 2, '#e8ece8');
  dot(dcx, dcy, dr, glass);
  for (let k = 0; k < 5; k++) {                                   // palms seen from above
    const a = k * 1.26 + 0.4, pxr = dcx + Math.cos(a) * 18 * (k ? 1 : 0), pyr = dcy + Math.sin(a) * 14 * (k ? 1 : 0);
    const sway = Math.sin(t * 0.5 + k) * 0.08;
    for (let f = 0; f < 7; f++) {
      const fa = f * 0.9 + k + sway;
      ln(pxr, pyr, pxr + Math.cos(fa) * 11, pyr + Math.sin(fa) * 11, f % 2 ? plantA : plantB, 2.2);
    }
    dot(pxr, pyr, 1.6, lit || !night ? '#6a4a2a' : '#2a1e14');
  }
  // dome ribs + glazing bars on the wings
  if (detail) {
    for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; ln(dcx, dcy, dcx + Math.cos(a) * dr, dcy + Math.sin(a) * dr, 'rgba(240,244,240,0.75)', 0.6); }
    ctx.strokeStyle = 'rgba(240,244,240,0.7)'; ctx.lineWidth = 0.6 * K.s;
    for (const rr of [dr * 0.4, dr * 0.72]) { ctx.beginPath(); ctx.arc(K.X(dcx), K.Y(dcy), rr * K.s, 0, Math.PI * 2); ctx.stroke(); }
    for (let x = gx0 + 8; x < gx0 + 62; x += 8) ln(x, gy0 + 12, x, gy1, 'rgba(240,244,240,0.6)', 0.5);
    for (let x = gx1 - 54; x < gx1; x += 8) ln(x, gy0 + 12, x, gy1, 'rgba(240,244,240,0.6)', 0.5);
  }
  dot(dcx, dcy, 4, '#e8ece8'); dot(dcx, dcy, 2.4, lit ? '#fff4c0' : '#c8d0cc');   // lantern at the crown
  // roof vents open on warm afternoons
  const vent = hr >= 11 && hr < 17 && e.powered;
  for (const vx of [gx0 + 14, gx0 + 40, gx1 - 48, gx1 - 22]) {
    R(vx, gy0 + 12, 10, vent ? 4 : 2, vent ? 'rgba(40,60,60,0.55)' : '#e8ece8');
  }
  // sheen by day, a little mist drifting when the misters run
  if (!night && !lit) poly([[gx0 + 6, gy0 + 14], [gx0 + 16, gy0 + 14], [gx0 + 4, gy1 - 2], [gx0 - 4, gy1 - 2]], 'rgba(255,255,255,0.18)');
  if (lit && detail) for (let k = 0; k < 4; k++) {
    const u = (t * 0.08 + k * 0.25) % 1;
    ell(gx0 + 20 + k * 50, gy1 - 10 - u * 40, 8, 3, `rgba(255,255,255,${(0.18 * (1 - u)).toFixed(3)})`);
  }
  if (lit && dark > 0.15) {
    glow(dcx, dcy, 70, '230,150,240', 0.28 * dark);
    glow(gx0 + 31, (gy0 + gy1) / 2 + 6, 40, '170,240,180', 0.2 * dark);
    glow(gx1 - 31, (gy0 + gy1) / 2 + 6, 40, '170,240,180', 0.2 * dark);
  }
  // entrance porch + sign
  R(dcx - 9, gy1 - 2, 18, 6, '#e8ece8'); R(dcx - 6, gy1 - 1, 12, 4, glass);
  RR(dcx - 32, gy1 + 6, 64, 9, 2, '#24402c');
  if (Camera.zoom > 0.5) {
    ctx.save(); ctx.font = `bold ${4.8 * K.s}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = lit && night ? '#e8ffe8' : '#f0ead8'; if (lit && night) { ctx.shadowColor = '#90f0a0'; ctx.shadowBlur = 5 * K.s; }
    ctx.fillText('BOTANIC GREENHOUSE', K.X(dcx), K.Y(gy1 + 10.7)); ctx.restore();
  }

  // ── Gardens (south) ──
  // lily pond with a footbridge (west)
  ell(62, 142, 38, 22, '#3a6a8a'); ell(62, 142, 34, 18, '#4a86a8');
  for (let k = 0; k < 7; k++) { const lx = 40 + hash(k + 20) * 44, ly = 132 + hash(k + 30) * 20; ell(lx, ly, 3.4, 2.6, '#4a9a48'); if (k % 3 === 0 && !night) dot(lx, ly, 1.2, '#f8c0d8'); }
  R(56, 120, 12, 44, '#a07a4a'); if (detail) for (let y = 122; y < 164; y += 3) ln(56, y, 68, y, 'rgba(0,0,0,0.18)', 0.4);
  // herb garden + rose beds (east)
  for (let b = 0; b < 3; b++) {
    const bx = 140 + b * 28;
    RR(bx, 122, 22, 44, 2, '#6a4a30');
    for (let k = 0; k < 6; k++) dot(bx + 6 + (k % 2) * 10, 128 + (k >> 1) * 13, 4, b === 1 ? '#4a8a3a' : '#3a7a30');
    if (b !== 1 && !night) for (let k = 0; k < 6; k++) dot(bx + 6 + (k % 2) * 10, 127 + (k >> 1) * 13, 1.5, b === 0 ? '#e04a5a' : '#f0e0a0');
  }
  // potting shed with terracotta stacks (north-east corner)
  R(196, 2, 26, 14, '#7a5a3a'); R(196, 2, 26, 3, '#5a4028');
  for (let k = 0; k < 4; k++) dot(186 - k * 4, 10, 2, '#c06a3a');
  // benches
  for (const [bxx, byy] of [[90, 114], [130, 114], [30, 112]]) R(bxx, byy, 14, 3, '#8a6a44');
  // visitors stroll the paths; a gardener tends the beds
  if (open) {
    for (let p = 0; p < 5; p++) {
      const u = (t * (0.012 + p * 0.003) + hash(p + 40)) % 1;
      // walk the outer loop: down the spine, round the gardens and back
      const L = [[120, 176], [120, 105], [19, 105], [19, 22], [221, 22], [221, 105], [120, 105], [120, 176]];
      const seg = u * (L.length - 1), i = Math.floor(seg), f = seg - i;
      const [ax, ay] = L[i], [bx, by] = L[i + 1];
      person(ax + (bx - ax) * f, ay + (by - ay) * f, p + 2, 0, 1.2);
    }
    person(152 + Math.sin(t * 0.3) * 4, 146, 3, Math.abs(Math.sin(t * 2)) * 0.5, 1.2);
    // a couple inside, under the dome
    if (lit || !night) { person(dcx - 10 + Math.sin(t * 0.2) * 6, dcy + 10, 5, 0, 1); person(dcx + 12, dcy - 8 + Math.cos(t * 0.25) * 5, 6, 0, 1); }
  }
  // garden lamps
  for (const [lx, ly] of [[24, 98], [216, 98], [110, 168], [130, 168]]) {
    dot(lx, ly, 1.6, night ? '#fff0c0' : '#5a5a54');
    if (night) glow(lx, ly, 16, '255,230,170', 0.35);
  }
}

// ── Family Farm (10×8) ──────────────────────────────────────────────────
// A working hydro-era family farm on the edge of town, authored 300×240.
// North: the farmhouse (chimney smoke, porch, washing line, kitchen
// garden), a big red gambrel barn with a cupola and weathervane, two grain
// silos, an American windmill pump over a timber water tank, and an open
// machine shed. The farmyard has hay bales, a pickup, a chicken coop with
// hens scratching about, a farmer doing chores and the farm dog at heel.
// South-west: a lane from the gate between the cow pasture (Holsteins and
// a trough), the sheep field (ewes and lambs), the horse paddock with its
// stable, the pig pen and wallow, a duck pond and an orchard with hives.
// East: three fields — wheat, corn and pumpkins — each on its own crop
// cycle driven by the game clock: plowed, sown, sprouting, growing, ripe,
// harvested. A tractor plows, a combine brings the grain in and a trailer
// gathers pumpkins, headlights on if the work runs past dark; the cycles
// are offset so one machine is out at a time and the rest wait in the shed.
// At night the house windows glow, the hens are shut in and the yard lamp
// comes on.
function renderFarm(e, px, py, w, h, t) {
  const K = _mk3ParkKit(px, py, w, h, 300, 240);
  const { R, RR, dot, ell, poly, ln, glow, person, tree } = K;
  const hr = DayNight.hour(), dark = DayNight.darkness();
  const night = dark > 0.35, day = hr >= 6 && hr < 20 && !night;
  const rain = typeof RainSystem !== 'undefined' && RainSystem.isActive();
  const detail = Camera.zoom > 0.4;
  const hash = n => { const x = Math.sin((e.col * 31 + e.row * 17 + n) * 12.9898) * 43758.5453; return x - Math.floor(x); };

  // Draws `fn` in a local frame at (x, y) turned to `dir` (radians, 0 = east).
  const at = (x, y, dir, sc, fn) => {
    ctx.save(); ctx.translate(K.X(x), K.Y(y)); ctx.rotate(dir); ctx.scale(K.s * sc, K.s * sc); fn(); ctx.restore();
  };
  const le = (x, y, rx, ry, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
  const lr = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, ww, hh); };
  // A slow wander around (cx, cy): returns position and the heading it faces.
  const wander = (cx, cy, ax, ay, sp, ph) => {
    const a = t * sp + ph, b = t * sp * 0.73 + ph * 1.7;
    const vx = ax * Math.cos(a), vy = ay * 0.73 * Math.cos(b);
    return { x: cx + ax * Math.sin(a), y: cy + ay * Math.sin(b), dir: Math.atan2(vy, vx) };
  };
  const rail = (x1, y1, x2, y2) => {            // split-rail fence with posts
    ln(x1, y1, x2, y2, '#8a6a44', 1.1);
    const n = Math.max(1, Math.round(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 10));
    for (let k = 0; k <= n; k++) R(x1 + (x2 - x1) * k / n - 0.9, y1 + (y2 - y1) * k / n - 0.9, 1.8, 1.8, '#5a4028');
  };

  // ── Ground ──
  R(0, 0, 300, 240, '#5c8c3e');
  for (let k = 0; k < 15; k++) if (k % 2) R(k * 20, 0, 10, 240, 'rgba(255,255,255,0.03)');
  R(8, 104, 84, 76, '#64983f');                  // lusher pasture grass
  R(8, 184, 84, 48, '#6a9a44');                  // sheep field
  R(108, 104, 82, 46, '#8a9a50');                // grazed-down paddock
  // farmyard + lane (gravel) from the south gate
  RR(8, 60, 184, 42, 3, '#b8a274');
  R(96, 100, 10, 140, '#b8a274');
  if (detail) for (let k = 0; k < 60; k++) dot(10 + hash(k) * 180, 62 + hash(k + 99) * 38, 0.6, 'rgba(90,70,40,0.35)');
  ln(99, 102, 99, 240, 'rgba(120,96,60,0.35)', 1.2); ln(103, 102, 103, 240, 'rgba(120,96,60,0.35)', 1.2);   // wheel ruts

  // ── Crop fields (east) ──
  // One crop cycle every 36 game hours, each field a third out of phase, so
  // the plow (first 12%) and the harvest (last 12%) never overlap across
  // fields and only one machine is ever out at a time.
  const gh = (DayNight.day() - 1) * 24 + hr;
  const FX0 = 198, FX1 = 292, FW = FX1 - FX0;
  const FIELDS = [
    { kind: 'wheat',   y0: 8,   y1: 80,  off: 0 },
    { kind: 'corn',    y0: 86,  y1: 158, off: 1 / 3 },
    { kind: 'pumpkin', y0: 164, y1: 232, off: 2 / 3 },
  ];
  const ROW_H = 8;
  // Paints one stretch of a crop row in a given growth state.
  const rowSeg = (kind, st, g, xa, xb, y) => {
    if (xb - xa < 0.5) return;
    const mid = y + ROW_H / 2;
    if (st === 'stubble') {
      R(xa, y, xb - xa, ROW_H, kind === 'pumpkin' ? '#8a6c46' : '#c8b278');
      if (detail) for (let x = xa + 1; x < xb; x += 3) ln(x, y + 1, x, y + ROW_H - 1, kind === 'pumpkin' ? 'rgba(90,110,50,0.4)' : 'rgba(140,110,60,0.5)', 0.4);
      return;
    }
    R(xa, y, xb - xa, ROW_H, '#6e4c2e');                              // turned soil
    ln(xa, y + 2, xb, y + 2, 'rgba(40,24,12,0.45)', 0.8);
    ln(xa, y + 6, xb, y + 6, 'rgba(40,24,12,0.45)', 0.8);
    if (st === 'plowed') return;
    if (st === 'sown') { if (detail) for (let x = xa + 2; x < xb; x += 4) dot(x, mid, 0.35 + g * 0.4, '#8ac050'); return; }
    // growing / ripe
    if (kind === 'wheat') {
      const c = st === 'ripe' ? '#dcb448' : `rgb(${90 + g * 40 | 0},${150 + g * 20 | 0},${60 - g * 10 | 0})`;
      R(xa, y + 3.5 - 3.5 * g, xb - xa, 1 + 7 * g, c);
      if (st === 'ripe' && detail) for (let x = xa + 1.5; x < xb; x += 3) dot(x + Math.sin(t * 1.4 + x * 0.12) * 0.5, y + 2 + (x % 2) * 3, 0.7, '#f0d070');
    } else if (kind === 'corn') {
      const r = 0.6 + g * 2.8;
      for (let x = xa + 2; x < xb; x += 4) {
        dot(x, mid, r, st === 'ripe' ? '#8aa040' : '#4a9a3a');
        if (st === 'ripe' && detail) dot(x + 0.4, mid - 0.6, 0.8, '#e8d070');   // tassels
      }
    } else {                                                            // pumpkins on vines
      ln(xa + 1, mid, xb - 1, mid, '#4a8a3a', 0.6 + g * 1.8);
      for (let x = xa + 3; x < xb; x += 6) ell(x, mid, 1 + g * 2.2, 0.8 + g * 1.6, '#4e9040');
      if (st === 'ripe') for (let x = xa + 5; x < xb - 1; x += 9) ell(x, mid + 0.8, 2.4, 1.9, '#e8841e');
    }
  };
  const machines = [];                                                  // vehicles working a field now
  for (const f of FIELDS) {
    const p = ((gh / 36) + f.off) % 1;
    const nRows = Math.floor((f.y1 - f.y0) / ROW_H);
    let oldSt, newSt, q = -1, g = 0;
    if (p < 0.12)      { oldSt = 'stubble'; newSt = 'plowed'; q = p / 0.12; }
    else if (p < 0.2)  { oldSt = newSt = 'sown'; g = (p - 0.12) / 0.08; }
    else if (p < 0.75) { oldSt = newSt = 'grow'; g = (p - 0.2) / 0.55; }
    else if (p < 0.88) { oldSt = newSt = 'ripe'; g = 1; }
    else               { oldSt = 'ripe'; newSt = 'stubble'; q = (p - 0.88) / 0.12; g = 1; }
    R(FX0 - 2, f.y0 - 2, FW + 4, f.y1 - f.y0 + 4, '#7a6a44');           // headland track
    // Rows are worked boustrophedon: done rows are in the new state, the
    // current row is split at the machine, the rest are still in the old.
    const pass = q < 0 ? -1 : Math.min(nRows - 1, Math.floor(q * nRows));
    const u = q < 0 ? 0 : q * nRows - pass;
    let mx = 0, my = 0, mdir = 0;
    for (let i = 0; i < nRows; i++) {
      const y = f.y0 + i * ROW_H;
      if (q < 0 || i > pass) { rowSeg(f.kind, oldSt, g, FX0, FX1, y); continue; }
      if (i < pass)          { rowSeg(f.kind, newSt, g, FX0, FX1, y); continue; }
      const east = i % 2 === 0, cut = east ? FX0 + u * FW : FX1 - u * FW;
      if (east) { rowSeg(f.kind, newSt, g, FX0, cut, y); rowSeg(f.kind, oldSt, g, cut, FX1, y); }
      else      { rowSeg(f.kind, oldSt, g, FX0, cut, y); rowSeg(f.kind, newSt, g, cut, FX1, y); }
      mx = cut; my = y + ROW_H / 2; mdir = east ? 0 : Math.PI;
    }
    if (q >= 0) machines.push({ kind: newSt === 'plowed' ? 'plow' : f.kind === 'pumpkin' ? 'cart' : 'combine', x: mx, y: my, dir: mdir });
    // scarecrow keeps the corn company while it grows
    if (f.kind === 'corn' && (oldSt === 'grow' || oldSt === 'ripe')) {
      const sx = 244, sy = f.y0 + 34;
      ln(sx, sy - 7, sx, sy + 7, '#6a4a2a', 1.2); ln(sx - 7, sy - 2, sx + 7, sy - 2, '#6a4a2a', 1.2);
      ell(sx, sy, 4, 3, '#b0502a'); dot(sx, sy - 5, 2.2, '#e0c080'); ell(sx, sy - 6.5, 4, 1.4, '#c8a040');
    }
  }
  // field hedges + gate gaps
  for (const y of [83, 161]) for (let x = FX0; x < FX1; x += 6) dot(x + 3, y, 2.4, (x / 6) % 2 ? '#3a6a2a' : '#447630');
  rail(194, 4, 194, 236);

  // ── Farmhouse (NW) ──
  const HX = 12, HY = 10, HW = 52, HH = 40;
  R(HX + 3, HY + 4, HW, HH, 'rgba(0,0,0,0.25)');
  R(HX, HY, HW, HH, '#efe6d2');
  poly([[HX - 3, HY - 2], [HX + HW + 3, HY - 2], [HX + HW + 3, HY + HH / 2], [HX - 3, HY + HH / 2]], '#5c6470');   // back roof slope
  poly([[HX - 3, HY + HH / 2], [HX + HW + 3, HY + HH / 2], [HX + HW + 3, HY + HH + 1], [HX - 3, HY + HH + 1]], '#6e7682'); // front slope (lit)
  ln(HX - 3, HY + HH / 2, HX + HW + 3, HY + HH / 2, '#3e444c', 1.2);    // ridge
  if (detail) for (let y = HY + 2; y < HY + HH; y += 3) ln(HX - 3, y, HX + HW + 3, y, 'rgba(0,0,0,0.08)', 0.4);
  // dormers — they carry the warm window light after dark
  for (const dx of [HX + 10, HX + 36]) {
    R(dx, HY + HH / 2 + 3, 8, 9, '#efe6d2'); poly([[dx - 1, HY + HH / 2 + 3], [dx + 4, HY + HH / 2], [dx + 9, HY + HH / 2 + 3]], '#4e5660');
    R(dx + 2, HY + HH / 2 + 6, 4, 5, night ? '#ffd98a' : '#8aaccc');
    if (night) glow(dx + 4, HY + HH / 2 + 8, 12, '255,210,130', 0.35);
  }
  // chimney + smoke
  R(HX + HW - 12, HY + 4, 6, 6, '#8a4a3a'); R(HX + HW - 11, HY + 5, 4, 4, '#2a2020');
  if (!rain) for (let k = 0; k < 5; k++) {
    const u = (t * 0.12 + k / 5) % 1;
    dot(HX + HW - 9 + u * 16 + Math.sin(u * 6 + k) * 2, HY + 7 - u * 14, 1.6 + u * 3.5, `rgba(220,220,225,${(0.45 * (1 - u)).toFixed(2)})`);
  }
  // porch across the front
  R(HX + 4, HY + HH + 1, HW - 8, 7, '#a88a60');
  for (let x = HX + 6; x < HX + HW - 4; x += 8) R(x, HY + HH + 7, 1.2, 1.2, '#f0ece0');
  R(HX + HW / 2 - 3, HY + HH + 1, 6, 2, '#6a4a2a');                     // front door mat
  if (day && !rain) person(HX + 12, HY + HH + 4, 2, 0, 1.2);            // someone on the porch swing
  const porchLit = night || dark > 0.2;
  dot(HX + HW / 2, HY + HH + 2, 1.2, porchLit ? '#ffe6a0' : '#5a5a54');
  if (porchLit) glow(HX + HW / 2, HY + HH + 4, 22, '255,220,150', 0.4);
  // kitchen garden + washing line
  R(HX + HW + 2, HY + 4, 4, HH - 8, '#6e4c2e');
  for (let y = HY + 7; y < HY + HH - 4; y += 5) dot(HX + HW + 4, y, 1.6, y % 2 ? '#e05a5a' : '#5aa040');
  ln(HX + 2, 58, HX + 46, 58, '#d8d8d8', 0.4);
  if (!rain) for (let k = 0; k < 5; k++) {
    const sway = Math.sin(t * 2 + k) * (night ? 0.3 : 1);
    poly([[HX + 6 + k * 8, 58], [HX + 12 + k * 8, 58], [HX + 12 + k * 8 + sway, 62], [HX + 6 + k * 8 + sway, 62]], ['#e8483a', '#f4f0e6', '#3a70d8', '#f0c030', '#40b060'][k]);
  }

  // ── Barn ──
  const BX = 72, BY = 6, BW = 56, BH = 50;
  R(BX + 4, BY + 5, BW, BH, 'rgba(0,0,0,0.28)');
  R(BX, BY, BW, BH, '#a8322a');
  // gambrel roof seen from above: steep outer slopes, shallow inner ones
  R(BX, BY, 9, BH, '#7e2420'); R(BX + BW - 9, BY, 9, BH, '#8e2a24');
  R(BX + 9, BY, BW / 2 - 9, BH, '#9a2e28'); R(BX + BW / 2, BY, BW / 2 - 9, BH, '#b23a30');
  ln(BX + BW / 2, BY, BX + BW / 2, BY + BH, '#5a1a16', 1.2);
  ln(BX + 9, BY, BX + 9, BY + BH, 'rgba(0,0,0,0.25)', 0.6); ln(BX + BW - 9, BY, BX + BW - 9, BY + BH, 'rgba(255,255,255,0.12)', 0.6);
  if (detail) for (let y = BY + 3; y < BY + BH; y += 4) ln(BX, y, BX + BW, y, 'rgba(0,0,0,0.07)', 0.4);
  ctx.strokeStyle = '#f4f0e6'; ctx.lineWidth = 1.2 * K.s; ctx.strokeRect(K.X(BX), K.Y(BY), BW * K.s, BH * K.s);
  // cupola + weathervane (turns with the wind)
  R(BX + BW / 2 - 5, BY + 18, 10, 10, '#f4f0e6'); R(BX + BW / 2 - 4, BY + 19, 8, 8, '#4a4a52');
  { const a = Math.sin(t * 0.07) * 1.4 + 0.6;
    ln(BX + BW / 2 - Math.cos(a) * 6, BY + 23 - Math.sin(a) * 6, BX + BW / 2 + Math.cos(a) * 6, BY + 23 + Math.sin(a) * 6, '#1a1a1a', 0.8);
    dot(BX + BW / 2 + Math.cos(a) * 6, BY + 23 + Math.sin(a) * 6, 1, '#1a1a1a'); }
  // big doors on the yard side, rolled open by day
  const doorOpen = day;
  R(BX + 16, BY + BH, 24, 3, '#3a2a1c');
  if (doorOpen) { R(BX + 20, BY + BH - 1, 16, 4, '#1c140c'); R(BX + 6, BY + BH, 12, 3, '#a8322a'); R(BX + 38, BY + BH, 12, 3, '#a8322a'); }
  else { R(BX + 16, BY + BH, 24, 3, '#a8322a'); ln(BX + 16, BY + BH, BX + 40, BY + BH + 3, '#f4f0e6', 0.6); ln(BX + 16, BY + BH + 3, BX + 40, BY + BH, '#f4f0e6', 0.6); }
  // hay loft bales + round bales in the yard
  for (let k = 0; k < 4; k++) { dot(BX - 2 + k * 7, 70 + (k % 2) * 3, 3.6, '#d8b860'); dot(BX - 2 + k * 7, 70 + (k % 2) * 3, 1.8, 'rgba(160,120,50,0.6)'); }
  for (let k = 0; k < 3; k++) { dot(BX + 2 + k * 7, 64.5, 3.6, '#e0c470'); dot(BX + 2 + k * 7, 64.5, 1.8, 'rgba(160,120,50,0.6)'); }

  // ── Silos ──
  for (const [sx, sy, sr, c] of [[141, 18, 10, '#aeb8c0'], [141, 44, 8, '#c0c4c4']]) {
    dot(sx + 3, sy + 3, sr, 'rgba(0,0,0,0.28)');
    dot(sx, sy, sr, c);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.5 * K.s;
    for (let r = sr * 0.35; r < sr; r += sr * 0.3) { ctx.beginPath(); ctx.arc(K.X(sx), K.Y(sy), r * K.s, 0, Math.PI * 2); ctx.stroke(); }
    dot(sx - sr * 0.3, sy - sr * 0.3, sr * 0.35, 'rgba(255,255,255,0.35)');
    dot(sx, sy, 1.4, '#6a6e72');
  }
  ln(141, 28, 141, 36, '#8a8e92', 1.2);                                 // conveyor between them

  // ── Windmill pump + water tank ──
  { const wx = 168, wy = 22;
    for (const [dx, dy] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) ln(wx + dx, wy + dy, wx, wy, '#9a9a92', 0.7);   // lattice legs
    dot(wx + 6, wy + 6, 11, 'rgba(0,0,0,0.12)');
    // the rotor spins with the breeze; faster in a storm
    const spin = t * (rain ? 3.2 : 1.4);
    for (let k = 0; k < 12; k++) {
      const a = spin + k * Math.PI / 6;
      ln(wx, wy, wx + Math.cos(a) * 10, wy + Math.sin(a) * 10, '#d0d0c8', 1.6);
    }
    dot(wx, wy, 2.4, '#a8322a');
    ln(wx, wy, wx + 12, wy - 3, '#6a6a64', 0.8); poly([[wx + 10, wy - 7], [wx + 17, wy - 5], [wx + 15, wy + 1]], '#a8322a');   // tail vane
    // tank + trough
    dot(180, 46, 8, '#6a5030'); dot(180, 46, 6.6, day || !night ? '#4a88b0' : '#1a3040');
    if (detail) { ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 0.6 * K.s; ctx.beginPath(); ctx.arc(K.X(180), K.Y(46), 7.3 * K.s, 0, Math.PI * 2); ctx.stroke(); }
    ln(168, 30, 176, 42, '#7a7a74', 0.6);
  }

  // ── Machine shed (open front) ──
  R(156, 62, 36, 34, 'rgba(0,0,0,0.25)');
  R(154, 60, 36, 34, '#6a6e72');
  for (let x = 156; x < 190; x += 3) ln(x, 60, x, 94, 'rgba(0,0,0,0.12)', 0.5);
  R(154, 60, 36, 3, '#50545a');

  // ── Vehicles ──
  const tractorAt = (x, y, dir, towing) => at(x, y, dir, 1, () => {
    if (towing === 'plow') { lr(-15, -5, 5, 10, '#6a6a70'); for (let k = -4; k <= 4; k += 2) lr(-16, k - 0.4, 3, 0.8, '#a0a0a8'); lr(-10, -0.6, 3, 1.2, '#3a3a3a'); }
    if (towing === 'cart') {
      lr(-21, -5, 11, 10, '#8a6a44'); lr(-10, -0.6, 3, 1.2, '#3a3a3a');
      for (let k = 0; k < 6; k++) le(-19 + (k % 3) * 3.4, -2.2 + Math.floor(k / 3) * 4.4, 1.6, 1.3, '#e8841e');
    }
    lr(-5, -5.2, 5, 2.6, '#1a1a1a'); lr(-5, 2.6, 5, 2.6, '#1a1a1a');   // big rear wheels
    lr(3, -4.2, 3, 1.6, '#1a1a1a');  lr(3, 2.6, 3, 1.6, '#1a1a1a');    // front wheels
    lr(-4, -2.6, 11, 5.2, '#2e7a3a');                                   // body
    lr(-4, -3, 5, 6, '#3a8a46'); lr(-3.2, -2.2, 3.4, 4.4, 'rgba(180,220,240,0.7)');   // cab glass
    lr(6, -1.6, 1.4, 3.2, '#f0c030');
    if (night) { le(9, -1.4, 0.8, 0.8, '#fff6d0'); le(9, 1.4, 0.8, 0.8, '#fff6d0'); }
  });
  const combineAt = (x, y, dir) => at(x, y, dir, 1, () => {
    lr(7, -9, 3, 18, '#c8a030'); for (let k = -8; k <= 8; k += 2) lr(10, k - 0.3, 1.2, 0.6, '#8a7020');   // header
    lr(-9, -5.6, 5, 2.4, '#1a1a1a'); lr(-9, 3.2, 5, 2.4, '#1a1a1a'); lr(2, -6, 5, 2.6, '#1a1a1a'); lr(2, 3.4, 5, 2.6, '#1a1a1a');
    lr(-10, -4.6, 17, 9.2, '#3e8a3a'); lr(-10, -4.6, 17, 2, '#4a9a44');
    lr(2, -3, 4.4, 4.4, 'rgba(180,220,240,0.75)');                      // cab
    lr(-6, -8, 1.4, 5, '#2e6a2e');                                      // unloading auger
    if (night) { le(10.5, -6, 1, 1, '#fff6d0'); le(10.5, 6, 1, 1, '#fff6d0'); }
  });
  const headlights = (x, y, dir) => { if (night) glow(x + Math.cos(dir) * 16, y + Math.sin(dir) * 16, 14, '255,240,190', 0.35); };
  const out = new Set(machines.map(m => m.kind === 'combine' ? 'combine' : 'tractor'));
  for (const m of machines) {
    headlights(m.x, m.y, m.dir);
    // dust / chaff behind the working machine
    if (!rain) for (let k = 0; k < 4; k++) {
      const u = (t * 0.8 + k / 4) % 1, back = m.dir + Math.PI;
      dot(m.x + Math.cos(back) * (14 + u * 14), m.y + Math.sin(back) * (14 + u * 14) + Math.sin(u * 5 + k) * 3, 2 + u * 4,
        m.kind === 'plow' ? `rgba(120,90,60,${(0.35 * (1 - u)).toFixed(2)})` : `rgba(230,210,150,${(0.35 * (1 - u)).toFixed(2)})`);
    }
    if (m.kind === 'combine') combineAt(m.x, m.y, m.dir);
    else tractorAt(m.x, m.y, m.dir, m.kind);
    if (m.kind === 'cart' && day) { person(m.x - Math.cos(m.dir) * 10, m.y - 8, 3, 0, 1.2); person(m.x - Math.cos(m.dir) * 20, m.y + 8, 6, Math.abs(Math.sin(t * 2)) * 0.5, 1.2); }
  }
  if (!out.has('combine')) combineAt(174, 74, -Math.PI / 2);            // waiting in the shed
  if (!out.has('tractor')) tractorAt(170, 86, Math.PI, null);
  // pickup truck by the house
  at(78, 88, 0, 1, () => {
    lr(-8, -3.4, 16, 6.8, '#2a4a8a'); lr(-8, -3, 7, 6, '#23407a'); lr(0.5, -2.8, 3, 5.6, 'rgba(180,220,240,0.7)');
    lr(-7, -2.4, 5, 4.8, '#3a3a3a'); le(-4.5, 0, 1.6, 1.3, '#d8b860');   // a bale in the bed
  });

  // ── Chicken coop + hens ──
  R(18, 66, 20, 14, '#c8b890'); poly([[16, 66], [28, 61], [40, 66]], '#8a3a2a'); R(26, 74, 4, 6, '#3a2a1c');
  ln(14, 82, 50, 82, 'rgba(200,200,200,0.6)', 0.4); ln(50, 64, 50, 98, 'rgba(200,200,200,0.6)', 0.4);   // run wire
  if (day) for (let k = 0; k < 9; k++) {
    const c = wander(30 + hash(k) * 36, 88 + hash(k + 7) * 8, 5, 3, 0.35 + hash(k + 3) * 0.3, k * 2.3);
    const peck = Math.sin(t * 5 + k * 1.7) > 0.6 ? 0.5 : 0;
    at(c.x, c.y, c.dir, 1, () => {
      le(0, 0, 1.6, 1.1, k % 3 ? '#f4f0e6' : '#a8622a'); le(1.4 + peck, 0, 0.8, 0.8, k % 3 ? '#f4f0e6' : '#a8622a');
      le(1.6 + peck, -0.5, 0.4, 0.3, '#e03a2a'); lr(-2.2, -0.4, 0.8, 0.8, '#d8d0c0');
    });
  }

  // ── Farmer + dog doing the rounds (house → barn → coop) ──
  if (day) {
    const u = (t * 0.03) % 1, pts = [[38, 60], [100, 66], [96, 94], [44, 92], [38, 60]];
    const seg = Math.min(3, Math.floor(u * 4)), f = u * 4 - seg;
    const fx = pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * f, fy = pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * f;
    person(fx, fy, 1, 0, 1.4);
    dot(fx + 2.4, fy + 1, 1, '#9aa0a6');                                // pail
    const dd = Math.atan2(pts[seg + 1][1] - pts[seg][1], pts[seg + 1][0] - pts[seg][0]);
    at(fx - Math.cos(dd) * 7 + Math.sin(t * 3) * 1.5, fy - Math.sin(dd) * 7 + 3, dd, 1, () => {
      le(0, 0, 3, 1.4, '#2a2a2a'); le(3, 0, 1.3, 1.2, '#2a2a2a'); le(3.4, 0, 0.6, 0.9, '#f4f0e6');
      lr(-4.4, -0.3 + Math.sin(t * 12) * 0.5, 1.6, 0.6, '#2a2a2a');
    });
  } else {
    at(HX + HW / 2 + 8, HY + HH + 5, 0, 1, () => { le(0, 0, 3, 1.4, '#2a2a2a'); le(3, 0, 1.3, 1.2, '#2a2a2a'); });   // asleep on the porch
  }

  // ── Cow pasture ──
  rail(8, 104, 92, 104); rail(8, 104, 8, 180); rail(92, 104, 92, 180); rail(8, 180, 92, 180);
  tree(20, 118, 9, 1);
  R(62, 110, 18, 5, '#8a8e92'); R(63, 111, 16, 3, day || !night ? '#5a98c0' : '#1a3040');   // water trough
  const cow = (x, y, dir, k) => at(x, y, dir, 1, () => {
    le(0.8, 1.2, 6, 3.2, 'rgba(0,0,0,0.22)');
    le(0, 0, 6, 3, '#f4f0e6');
    le(-2.5, -1, 2, 1.6, '#1a1a1a'); le(2, 1, 1.8, 1.4, '#1a1a1a'); if (k % 2) le(-0.5, 1.8, 1.4, 1, '#1a1a1a');
    le(-4.2, -0.8, 1.2, 1, '#1a1a1a');
    const bob = Math.sin(t * 0.9 + k) > 0 ? 0.8 : 0;                    // head down grazing
    le(6.4 + bob, 0, 2, 1.7, '#1a1a1a'); le(8 + bob, 0, 0.9, 1.1, '#e8b0a0');
    lr(5.4 + bob, -2.4, 1, 0.8, '#e0d8c8'); lr(5.4 + bob, 1.6, 1, 0.8, '#e0d8c8');   // ears
    lr(-7, -0.3, 1.4, 0.6, '#1a1a1a');                                  // tail
  });
  for (let k = 0; k < 5; k++) {
    const c = night ? { x: 28 + k * 12, y: 128 + (k % 2) * 10, dir: 0.3 * k } : wander(22 + (k % 3) * 24, 130 + Math.floor(k / 3) * 26, 9, 8, 0.03 + k * 0.004, k * 1.9);
    cow(c.x, c.y, c.dir, k);
  }

  // ── Sheep field ──
  rail(8, 184, 92, 184); rail(8, 184, 8, 232); rail(92, 184, 92, 232);
  const sheep = (x, y, dir, sc) => at(x, y, dir, sc, () => {
    le(0.6, 1, 3.6, 2.6, 'rgba(0,0,0,0.2)');
    for (const [dx, dy] of [[-1.4, -1], [1, -1], [-1.4, 1], [1, 1], [0, 0]]) le(dx, dy, 2, 1.8, '#f0ece2');
    le(3.4, 0, 1.2, 1, '#2a2622');
  });
  for (let k = 0; k < 6; k++) {
    const c = wander(22 + (k % 3) * 24, 198 + Math.floor(k / 3) * 18, 6, 4, 0.04 + k * 0.006, k * 2.7);
    sheep(c.x, c.y, c.dir, 1);
    if (k < 2) sheep(c.x - Math.cos(c.dir) * 6 + 1, c.y - Math.sin(c.dir) * 6 + 2, c.dir + Math.sin(t * 0.5 + k) * 0.4, 0.6);   // lamb at heel
  }

  // ── Horse paddock + stable ──
  rail(108, 104, 190, 104); rail(108, 104, 108, 150); rail(190, 104, 190, 150); rail(108, 150, 190, 150);
  R(166, 108, 20, 14, '#7a5436'); R(166, 108, 20, 3, '#5a3a24'); R(170, 118, 5, 4, '#2a1a10'); R(178, 118, 5, 4, '#2a1a10');
  const horse = (x, y, dir, coat, mane, k) => at(x, y, dir, 1, () => {
    le(0.8, 1.2, 6.6, 2.8, 'rgba(0,0,0,0.22)');
    le(0, 0, 6.4, 2.4, coat);
    lr(3, -0.5, 4, 1, mane);                                           // mane down the neck
    le(7.8, 0, 2.4, 1.2, coat); le(9.6, 0, 0.9, 0.8, 'rgba(0,0,0,0.3)');
    lr(-8.5, -0.5 + Math.sin(t * 2 + k) * 0.4, 2.6, 1, mane);         // tail swish
  });
  { // one trots a circuit, the other grazes by the fence
    const a = t * 0.18;
    horse(140 + Math.cos(a) * 20, 128 + Math.sin(a) * 12, a + Math.PI / 2, '#8a5230', '#2a1a10', 0);
    const c = wander(124, 118, 5, 3, 0.03, 1.1);
    horse(c.x, c.y, c.dir, '#c88a4a', '#f0e0c0', 1);
    if (day && !rain) person(114, 140, 5, 0, 1.2);                     // leaning on the rail
  }

  // ── Pig pen ──
  R(108, 156, 42, 40, '#8a6a44');
  ell(128, 178, 12, 8, '#5a4028');                                    // the wallow
  R(136, 158, 12, 10, '#9a7a54'); poly([[134, 158], [142, 154], [150, 158]], '#6a4a2a');   // pig ark
  R(110, 190, 12, 3, '#6a6e72');                                      // feed trough
  rail(108, 156, 150, 156); rail(108, 156, 108, 196); rail(150, 156, 150, 196); rail(108, 196, 150, 196);
  for (let k = 0; k < 4; k++) {
    const c = k === 0 ? { x: 128, y: 178, dir: 0.4 } : wander(118 + k * 7, 172 + (k % 2) * 8, 4, 5, 0.05 + k * 0.01, k * 3.1);
    at(c.x, c.y, c.dir, 1, () => {
      le(0.6, 1, 4.2, 2.6, 'rgba(0,0,0,0.2)');
      le(0, 0, 4, 2.4, k === 0 ? '#b8847a' : '#f0b0a8');               // the one in the mud is muddier
      le(4.2, 0, 1.4, 1.3, '#f0b0a8'); le(5.4, 0, 0.6, 0.8, '#d88880');
      le(3.4, -1.4, 0.7, 0.5, '#e09890'); le(3.4, 1.4, 0.7, 0.5, '#e09890');
    });
  }

  // ── Orchard + beehives ──
  for (let k = 0; k < 3; k++) {
    const ox = 116 + k * 14, oy = 206 + (k % 2) * 12;
    tree(ox, oy, 7, k);
    if (detail) for (let j = 0; j < 5; j++) dot(ox - 4 + hash(k * 9 + j) * 8, oy - 4 + hash(k * 9 + j + 4) * 8, 0.9, '#d8302a');
  }
  for (let k = 0; k < 2; k++) { R(132 + k * 8, 222, 6, 7, '#f0e8c8'); R(132 + k * 8, 221, 6, 1.5, '#8a8a80'); }
  if (day && !rain) for (let b = 0; b < 6; b++) {
    const a = t * (1.6 + b * 0.2) + b, rr = 4 + (b % 3) * 4;
    dot(138 + Math.cos(a) * rr * 1.6, 216 + Math.sin(a * 1.3) * rr * 0.6, 0.6, '#f0c020');
  }

  // ── Duck pond ──
  ell(172, 196, 16, 34, '#3a6a3a');
  ell(172, 196, 14, 32, night ? '#1a3040' : '#4a8ab0');
  if (!night) ell(168, 186, 5, 12, 'rgba(255,255,255,0.12)');
  for (let k = 0; k < 7; k++) { const a = k * 0.9 + 0.4; ln(172 + Math.cos(a) * 14, 196 + Math.sin(a) * 32, 172 + Math.cos(a) * 17, 196 + Math.sin(a) * 34 - 3, '#5a8a3a', 0.8); }   // reeds
  for (let k = 0; k < 4; k++) {
    const a = t * 0.12 + k * 1.6;
    const dx = 172 + Math.cos(a) * 7, dy = 196 + Math.sin(a) * 20;
    at(dx, dy, a + Math.PI / 2, 1, () => {
      le(0, 0, 2, 1.2, k % 2 ? '#f4f0e6' : '#8a6a44'); le(1.8, 0, 0.9, 0.8, k % 2 ? '#f4f0e6' : '#2a6a3a'); lr(2.4, -0.3, 1, 0.6, '#f0a020');
    });
    if (detail) { ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 0.4 * K.s; ctx.beginPath(); ctx.arc(K.X(dx), K.Y(dy), 3.4 * K.s, 0, Math.PI * 2); ctx.stroke(); }
  }

  // ── Perimeter fence, gate and farm sign ──
  rail(3, 3, 297, 3); rail(297, 3, 297, 237); rail(3, 3, 3, 237); rail(3, 237, 92, 237); rail(110, 237, 297, 237);
  R(92, 234, 2, 6, '#5a4028'); R(108, 234, 2, 6, '#5a4028');
  RR(111, 226, 30, 9, 1, '#6a4a2a');
  if (Camera.zoom > 0.5) { ctx.save(); ctx.font = `bold ${4.6 * K.s}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f4e8c8'; ctx.fillText('FARM', K.X(126), K.Y(230.7)); ctx.restore(); }
  // mailbox + yard lamp
  R(86, 228, 4, 3, '#2a4a8a');
  dot(100, 98, 1.8, night ? '#fff0c0' : '#5a5a54');
  if (night) glow(100, 98, 26, '255,225,160', 0.4);
}

function renderPark(e, px, py, t) {
    const w = (e.width || 1) * TILE, h = (e.height || 1) * TILE;
    if (e.type === T.SPLASHPAD)     { renderSplashPad(e, px, py, w, h, t);     return; }
    if (e.type === T.BASEBALLFIELD) { renderBaseballField(e, px, py, w, h, t); return; }
    if (e.type === T.PLAYGROUND)    { renderPlayground(e, px, py, w, h, t);    return; }
    if (e.type === T.ALLOTMENTS)    { renderAllotments(e, px, py, w, h, t);    return; }
    if (e.type === T.DOGPARK)       { renderDogPark(e, px, py, w, h, t);       return; }
    if (e.type === T.COMMUNITYCENTER) { renderCommunityCenter(e, px, py, w, h, t); return; }
    if (e.type === T.GREENHOUSE)    { renderGreenhouse(e, px, py, w, h, t);    return; }
    if (e.type === T.CORNERSTORE)   { renderCornerStore(e, px, py, w, h, t);   return; }
    if (e.type === T.FARM)          { renderFarm(e, px, py, w, h, t);          return; }
    if (e.type === T.FOUNTAIN) {
      renderFountainPlaza(e, px, py, w, h, t);
      return;
    }
    if (e.type === T.BASKETBALLCOURT) {
      // Basketball Court — 3×2 public court behind a chain-link fence: a
      // two-tone court with painted keys and three-point arcs, hoops with
      // nets at both ends, floodlight poles in the corners, benches with kit
      // bags along the front and a flip scoreboard by the gate. No ground of
      // its own: the court sits straight on the map.
      // The play is worked out fresh for every possession (an 11 s slot,
      // seeded by its number), so it never settles into a loop: the ball is
      // brought up, passed one to four times between players who drift and
      // cut, then driven for a layup, pulled up for a jumper or let go from
      // three. Shots go in or rattle out to whoever wins the rebound; now
      // and then a pass is picked off and the stealer runs the break the
      // other way. The scoreboard keeps the running score of a 24-possession
      // game and the bench jumps up on a make. Mornings, a lone shooter
      // practises from spots round the arc; 10:00 to 22:30 it's three on
      // three, under the floodlights after dark. Overnight the court sits
      // empty with the ball by a bench. Parks draw no power, so it runs on
      // the clock alone. Authored in a 120×80 box scaled to the footprint.
      const s = Math.min(w/120, h/80);
      const ox = px + (w - 120*s)/2, oy = py + (h - 80*s)/2;
      const X = (v) => ox + v*s, Y = (v) => oy + v*s;
      const R = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), ww*s, hh*s); };
      const dot = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(x), Y(y), r*s, 0, Math.PI*2); ctx.fill(); };
      const ln = (x1, y1, x2, y2, c, lw) => { ctx.strokeStyle = c; ctx.lineWidth = (lw || 1)*s; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
      const arcS = (x, y, r, a0, a1, c, lw) => { ctx.strokeStyle = c; ctx.lineWidth = (lw || 1)*s; ctx.beginPath(); ctx.arc(X(x), Y(y), r*s, a0, a1); ctx.stroke(); };
      let seed = ((e.col || 0) * 73856093) ^ ((e.row || 0) * 19349663);
      const hash = (k) => {
        let hh = (seed ^ Math.imul(k + 1, 0x9E3779B1)) | 0;
        hh = Math.imul(hh ^ (hh >>> 16), 0x85EBCA6B); hh = Math.imul(hh ^ (hh >>> 13), 0xC2B2AE35);
        return ((hh ^ (hh >>> 16)) >>> 0) / 4294967296;
      };
      const hr = DayNight.hour(), dark = DayNight.darkness();
      const game = hr >= 10 && hr < 22.5, practice = hr >= 7 && hr < 10;
      const floodlit = (game || practice) && dark > 0.3;
      const LINE = 'rgba(245,245,240,0.9)';
      const ease = q => q < 0.5 ? 2*q*q : 1 - Math.pow(-2*q + 2, 2)/2;
      const lerp = (a, b, q) => a + (b - a)*q;

      // Court and markings (no surround: it stands on the map)
      R(7, 7, 106, 60, '#3f7a52');                                              // out-of-bounds band
      R(11, 11, 98, 52, '#2f6fa8');                                             // playing surface
      ctx.fillStyle = 'rgba(255,255,255,0.05)';                                 // scuffed wear round the keys
      for (const cx of [26, 94]) { ctx.beginPath(); ctx.ellipse(X(cx), Y(37), 14*s, 12*s, 0, 0, Math.PI*2); ctx.fill(); }
      R(11, 29, 19, 16, '#d0642c'); R(90, 29, 19, 16, '#d0642c');               // keys
      ctx.strokeStyle = LINE; ctx.lineWidth = 0.8*s; ctx.strokeRect(X(11), Y(11), 98*s, 52*s);
      ln(60, 11, 60, 63, LINE, 0.8);
      arcS(60, 37, 7, 0, Math.PI*2, LINE, 0.8);
      dot(60, 37, 2.2, '#d0642c');
      ctx.strokeStyle = LINE; ctx.lineWidth = 0.7*s;
      ctx.strokeRect(X(11), Y(29), 19*s, 16*s); ctx.strokeRect(X(90), Y(29), 19*s, 16*s);
      arcS(30, 37, 6, -Math.PI/2, Math.PI/2, LINE, 0.7);                        // free-throw circles
      arcS(90, 37, 6, Math.PI/2, Math.PI*1.5, LINE, 0.7);
      arcS(16, 37, 22, -Math.PI*0.42, Math.PI*0.42, LINE, 0.7);                 // three-point arcs
      arcS(104, 37, 22, Math.PI*0.58, Math.PI*1.42, LINE, 0.7);
      ln(11, 16, 23.5, 16, LINE, 0.7); ln(11, 58, 23.5, 58, LINE, 0.7);
      ln(96.5, 16, 109, 16, LINE, 0.7); ln(96.5, 58, 109, 58, LINE, 0.7);

      // Hoops: post, backboard
      const HOOP = [[15.5, 37], [104.5, 37]];
      for (const [hx, hy] of HOOP) {
        const dir = hx < 60 ? 1 : -1;
        R(dir > 0 ? 5 : 112, hy - 1, 3, 2, '#5a6068');
        R(dir > 0 ? 8 : 110, hy - 1, 3, 2, '#7a8088');
        R(dir > 0 ? 11 : 107.6, hy - 5.5, 1.4, 11, '#f4f4f4');
        R(dir > 0 ? 11 : 107.6, hy - 1.5, 1.4, 3, 'rgba(220,60,40,0.8)');
      }

      // Floodlight poles; pools kept inside the lot
      const POLES = [[4, 4], [116, 4], [4, 70], [116, 70]];
      if (floodlit) for (const [lx, ly] of POLES) dot(lx + (lx < 60 ? 18 : -18), ly + (ly < 40 ? 16 : -14), 20, 'rgba(255,244,210,0.08)');

      // ── The play ──
      // smooth wander for each player: two incommensurate sines, so the drift never repeats
      const wander = (i, amp) => [Math.sin(t*0.83 + i*2.3)*amp*0.6 + Math.sin(t*0.37 + i*5.1)*amp*0.4,
                                  Math.cos(t*0.71 + i*1.9)*amp*0.5 + Math.sin(t*0.29 + i*3.7)*amp*0.5];
      const P = 11;
      const plan = (k) => {
        const H = n => _cmFrac(k*13.37 + n*7.31 + hash(2)*10);
        const team = k % 2, np = 1 + Math.floor(H(1)*4);
        const shot = H(2) < 0.3 ? 3 : H(2) < 0.62 ? 2 : 1;                      // 3: three, 2: jumper, 1: layup
        const made = H(3) < (shot === 3 ? 0.38 : shot === 2 ? 0.48 : 0.68);
        const steal = H(4) < 0.13, stealAt = Math.floor(H(5)*np);
        const TD = 0.6 + H(6)*1.4;
        const recv = [0]; for (let j = 0; j < np; j++) recv.push((recv[j] + 1 + Math.floor(H(20 + j)*2)) % 3);
        const spots = [[76 + H(7)*8, 18 + H(8)*8], [84 + H(9)*8, 48 + H(10)*8], [68 + H(11)*6, 32 + H(12)*10]];
        const rebounder = Math.floor(H(13)*6), rebSpot = [96 + H(14)*8, 30 + H(15)*14];
        const used = np*1.0 + TD + 0.9 + (made ? 0.6 : 1.1);
        const up = Math.max(1.6, P - used);
        const pts = steal ? 2 : made ? (shot === 3 ? 3 : 2) : 0;
        return { H, team, np, shot, made, steal, stealAt, TD, recv, spots, rebounder, rebSpot, up, pts, scorer: steal ? 1 - team : team };
      };
      const players = [];
      let ball = null, swish = -1, cheer = 0, score = null;
      if (game) {
        const g = t + hash(1)*400, k = Math.floor(g/P), u = g - k*P, pl = plan(k);
        // One frame of possession k at time u into it. Run for this possession and,
        // over its first moments, for the end of the last one: everyone glides
        // from where the last play left them instead of snapping to new spots.
        const frameOf = (k, u) => {
        const pl = plan(k), players = [];
        let ball = null, swish = -1, cheer = 0;
        const mir = x => pl.team ? 120 - x : x, hoop = pl.team ? HOOP[0] : HOOP[1];
        // offence and defence positions before anything happens to the ball
        const bringF = ease(Math.min(1, u/pl.up));
        const off = pl.spots.map(([sx, sy], i) => {
          const [wx, wy] = wander(i, 3.5);
          return [mir(lerp(42 + i*4, sx, bringF)) + wx, lerp(24 + i*13, sy, bringF) + wy];
        });
        // timeline after the bring-up
        let tl = u - pl.up, holder = 0, phase = 'up', q = 0;
        if (tl >= 0) {
          const passEnd = pl.np*1.0;
          if (tl < passEnd) { phase = 'pass'; const j = Math.floor(tl); q = tl - j; holder = pl.recv[j]; if (pl.steal && j === pl.stealAt && q > 0.45) phase = 'steal'; else if (pl.steal && j > pl.stealAt) phase = 'steal'; }
          else if (pl.steal) phase = 'steal';
          else if (tl < passEnd + pl.TD) { phase = 'drive'; q = (tl - passEnd)/pl.TD; holder = pl.recv[pl.np]; }
          else if (tl < passEnd + pl.TD + 0.9) { phase = 'shot'; q = (tl - passEnd - pl.TD)/0.9; holder = pl.recv[pl.np]; }
          else { phase = 'after'; q = (tl - passEnd - pl.TD - 0.9)/(pl.made ? 0.6 : 1.1); holder = pl.recv[pl.np]; }
        }
        // the shooter's drive
        const sh = pl.recv[pl.np];
        if (phase === 'drive' || phase === 'shot' || phase === 'after') {
          const tgt = pl.shot === 1 ? [mir(99), 37 + (pl.H(16) - 0.5)*8] : pl.shot === 2 ? [mir(90), 37 + (pl.H(16) - 0.5)*18] : [mir(81), pl.spots[sh][1]];
          const dq = phase === 'drive' ? ease(q) : 1;
          off[sh] = [lerp(off[sh][0], tgt[0], dq), lerp(off[sh][1], tgt[1], dq)];
        }
        const def = off.map(([x, y], i) => {
          const [wx, wy] = wander(i + 7, 1.6), dx = hoop[0] - x, dy = hoop[1] - y, d = Math.hypot(dx, dy) || 1;
          return [x + dx/d*5 + wx, y + dy/d*5 + wy];
        });
        // the steal: the man guarding the receiver picks it off and runs the break
        const stealT = pl.stealAt*1.0 + 0.45;
        const sk = pl.steal ? Math.max(0, (tl - stealT)/2.6) : 0;
        if (phase === 'steal') {
          const thief = pl.recv[pl.stealAt + 1], other = pl.team ? HOOP[1] : HOOP[0];
          const run = ease(Math.min(1, sk));
          def[thief] = [lerp(def[thief][0], other[0] + (pl.team ? -5 : 5), run), lerp(def[thief][1], other[1], run)];
          for (let i = 0; i < 3; i++) if (i !== thief) { def[i][0] = lerp(def[i][0], 60, run*0.6); off[i][0] = lerp(off[i][0], other[0] + (pl.team ? -18 : 18), run*0.7); }
          const [bx, by] = def[thief];
          if (sk < 1) ball = { x: bx + 1.5, y: by + 1.5, lift: Math.abs(Math.sin(t*11))*2, r: 1.5 };
          else { const f = Math.min(1, (sk - 1)*3); ball = { x: lerp(bx, other[0], f), y: lerp(by, other[1], f), lift: Math.sin(f*Math.PI)*5, r: 1.5 }; if (f > 0.85) { swish = pl.team ? 1 : 0; cheer = 1 - (sk - 1); } }
        }
        off.forEach(([x, y], i) => players.push({ x, y, team: pl.team, i, arm: phase === 'shot' && i === sh && q < 0.3 }));
        def.forEach(([x, y], i) => players.push({ x, y, team: 1 - pl.team, i, arm: phase === 'shot' && i === sh && q < 0.3 }));
        if (!ball) {
          const at = i => off[i];
          if (phase === 'up' || phase === 'drive') { const [x, y] = at(phase === 'up' ? 0 : sh); ball = { x: x + 1.8, y: y + 1.8, lift: Math.abs(Math.sin(t*(phase === 'drive' ? 12 : 8)))*2.2, r: 1.5 }; }
          else if (phase === 'pass') { const a = at(pl.recv[Math.floor(tl)]), b = at(pl.recv[Math.floor(tl) + 1]); ball = { x: lerp(a[0], b[0], q), y: lerp(a[1], b[1], q), lift: Math.sin(q*Math.PI)*2, r: 1.5 }; }
          else if (phase === 'shot') { const [x, y] = at(sh), hx = hoop[0] + (pl.team ? 1.5 : -1.5); const arc = pl.shot === 3 ? 15 : pl.shot === 2 ? 12 : 6; ball = { x: lerp(x, hx, q), y: lerp(y, hoop[1], q), lift: Math.sin(q*Math.PI)*arc, r: 1.5 + Math.sin(q*Math.PI)*0.9 }; }
          else if (phase === 'after') {
            const hx = hoop[0] + (pl.team ? 1.5 : -1.5);
            if (pl.made) { swish = pl.team ? 0 : 1; cheer = 1 - q; ball = { x: hx, y: hoop[1] + q*3, lift: 0, r: 1.5 }; }
            else {
              const rs = [mir(pl.rebSpot[0]), pl.rebSpot[1]], qq = ease(q);
              ball = { x: lerp(hx, rs[0], qq), y: lerp(hoop[1], rs[1], qq), lift: Math.abs(Math.sin(q*Math.PI*2))*4*(1 - q), r: 1.5 };
              const p = players[pl.rebounder]; p.x = lerp(p.x, rs[0], qq); p.y = lerp(p.y, rs[1] + 2, qq); p.arm = q > 0.8;
            }
          }
        }
        return { players, ball, swish, cheer, phase, sk };
        };
        const cur = frameOf(k, u);
        if (u < 1.2) {
          const pv = frameOf(k - 1, P - 1e-3), f = ease(u/1.2);
          for (const p of cur.players) { const q = pv.players.find(o => o.team === p.team && o.i === p.i); if (q) { p.x = lerp(q.x, p.x, f); p.y = lerp(q.y, p.y, f); } }
          if (cur.ball && pv.ball) { cur.ball.x = lerp(pv.ball.x, cur.ball.x, f); cur.ball.y = lerp(pv.ball.y, cur.ball.y, f); }
        }
        players.push(...cur.players); ball = cur.ball; swish = cur.swish; cheer = cur.cheer;
        const phase = cur.phase, sk = cur.sk;
        // running score of this 24-possession game
        const g0 = Math.floor(k/24)*24; score = [0, 0];
        for (let kk = g0; kk < k; kk++) { const o = plan(kk); score[o.scorer] += o.pts; }
        if ((pl.steal && sk > 1.3) || (!pl.steal && phase === 'after' && pl.made)) score[pl.scorer] += pl.pts;
      } else if (practice) {
        // A lone shooter round the arc at the right-hand hoop
        const g = t + hash(3)*200, n = Math.floor(g/3.4), u = (g - n*3.4)/3.4;
        const Hn = m => _cmFrac(n*9.71 + m*3.3 + hash(4)*10);
        const a = Math.PI*(0.62 + Hn(1)*0.76), r = 12 + Hn(2)*12, spot = [104.5 + Math.cos(a)*r, 37 + Math.sin(a)*r];
        const prevA = Math.PI*(0.62 + _cmFrac((n - 1)*9.71 + 3.3 + hash(4)*10)*0.76), prevR = 12 + _cmFrac((n - 1)*9.71 + 6.6 + hash(4)*10)*12;
        const from = [104.5 + Math.cos(prevA)*prevR*0.3, 37 + Math.sin(prevA)*prevR*0.3];
        const made = Hn(3) < 0.55;
        let p = spot;
        if (u < 0.35) { p = [lerp(from[0], spot[0], ease(u/0.35)), lerp(from[1], spot[1], ease(u/0.35))]; ball = { x: p[0] + 1.6, y: p[1] + 1.6, lift: Math.abs(Math.sin(t*9))*2, r: 1.5 }; }
        else if (u < 0.62) { const q = (u - 0.35)/0.27; ball = { x: lerp(spot[0], 103, q), y: lerp(spot[1], 37, q), lift: Math.sin(q*Math.PI)*12, r: 1.5 + Math.sin(q*Math.PI)*0.9 }; }
        else { const q = (u - 0.62)/0.38; if (made && q < 0.4) swish = 1; const end = made ? [103, 40] : [104.5 + Math.cos(a)*r*0.3, 37 + Math.sin(a)*r*0.3]; ball = { x: lerp(103, end[0], Math.min(1, q*2)), y: lerp(37, end[1], Math.min(1, q*2)), lift: Math.abs(Math.sin(q*Math.PI*3))*3*(1 - q), r: 1.5 }; p = [lerp(spot[0], end[0], ease(q)), lerp(spot[1], end[1], ease(q))]; }
        players.push({ x: p[0], y: p[1], team: 0, i: 1, arm: u >= 0.35 && u < 0.45 });
      }

      // Rims and nets (after the ball's hoop is known)
      HOOP.forEach(([hx, hy], i) => {
        arcS(hx, hy, 2.6, 0, Math.PI*2, '#f06020', 0.9);
        const sw = i === swish ? Math.sin(t*30)*0.8 : 0;
        for (let k = -1; k <= 1; k++) ln(hx + k*1.6, hy + 1.8, hx + k*1.0 + sw, hy + 4.2, 'rgba(240,240,240,0.75)', 0.35);
      });

      // Players (shadow, jersey, head, a raised arm on the shot) and the ball
      const SKIN = ['#f0d0b0', '#c89870', '#8a5a3a', '#e0b890', '#6a4630', '#d8a878'];
      for (const p of players) {
        dot(p.x + 0.8, p.y + 1, 2.2, 'rgba(0,0,0,0.25)');
        dot(p.x, p.y, 2.4, p.team ? '#f4f4ee' : '#e8483a');
        if (p.team) dot(p.x, p.y, 2.4*0.55, '#2a3a6a');
        if (p.arm) ln(p.x, p.y - 1, p.x + 0.6, p.y - 4.4, SKIN[(p.i + p.team*3) % SKIN.length], 0.9);
        dot(p.x, p.y - 0.4, 1.3, SKIN[(p.i + p.team*3) % SKIN.length]);
      }
      if (ball) {
        dot(ball.x + 0.6, ball.y + 0.8, 1.3, 'rgba(0,0,0,0.25)');
        dot(ball.x, ball.y - ball.lift, ball.r, '#e87a28');
        ln(ball.x - ball.r, ball.y - ball.lift, ball.x + ball.r, ball.y - ball.lift, 'rgba(60,24,0,0.6)', 0.3);
      } else {
        dot(101, 72.5, 1.6, '#e87a28');                                           // left by the bench
      }

      // Chain-link fence with a gate in the front
      ctx.strokeStyle = 'rgba(175,182,188,0.55)'; ctx.lineWidth = 0.5*s;
      ctx.strokeRect(X(3), Y(3), 114*s, 66*s);
      for (let fx = 3; fx <= 117; fx += 9.5) { if (fx > 52 && fx < 66) continue; R(fx - 0.6, 2.4, 1.2, 1.2, '#7a8088'); R(fx - 0.6, 68.4, 1.2, 1.2, '#7a8088'); }
      for (let fy = 3; fy <= 69; fy += 9.5) { R(2.4, fy - 0.6, 1.2, 1.2, '#7a8088'); R(116.4, fy - 0.6, 1.2, 1.2, '#7a8088'); }

      // Flip scoreboard by the gate
      R(40, 70.5, 12, 7, '#1e2a3a'); R(40, 70.5, 12, 1, '#c83a30');
      if (score) {
        ctx.fillStyle = '#f4f4ee'; ctx.font = `bold ${Math.max(1, 3.6*s)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${score[0]}-${score[1]}`, X(46), Y(74.6)); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }

      // Benches, kit bags and the bench crowd (up on their feet on a make)
      const crowd = game ? (hr >= 16 ? 0.85 : 0.6) : practice ? 0.2 : 0;
      for (const bx of [14, 86]) {
        R(bx, 72, 20, 3, '#7a5a3a'); R(bx + 1, 75, 1.5, 2.5, '#5a4028'); R(bx + 17.5, 75, 1.5, 2.5, '#5a4028');
        if (game) { R(bx + 20.5, 73, 3, 2, bx < 60 ? '#c83a30' : '#2a3a6a'); R(bx - 3.5, 73.5, 2.5, 1.6, '#3a3a40'); }   // kit bags
        for (let k = 0; k < 3; k++) if (hash(bx + k) < crowd) {
          const jump = cheer > 0 ? Math.abs(Math.sin(t*14 + k))*1.4*cheer : 0;
          dot(bx + 4 + k*6, 72.5 - jump, 2, ['#3a7ac8', '#e0b030', '#8a5ac0'][k]);
          dot(bx + 4 + k*6, 71 - jump, 1.2, SKIN[(k + bx) % SKIN.length]);
        }
      }
      R(58, 73.5, 4, 4, '#b8bcc0'); dot(60, 73.5, 1, '#6aa8d8');                 // drinking fountain

      // Floodlight heads
      for (const [lx, ly] of POLES) {
        dot(lx, ly, 1.8, '#5a6068');
        dot(lx, ly, 1.1, floodlit ? '#fff4d0' : '#9aa0a6');
      }
      return;
    }
    if (e.type === T.FARMERSMARKET) {
      renderFarmersMarket(e, px, py, w, h, t);
      return;
    }
    if (e.type === T.TREEDSTREET) {
      // Tree-Lined Street — a planted verge above a paved sidewalk and kerb,
      // one shade tree per tile standing in an iron grate, with street lamps
      // and benches alternating in the gaps. By day people stroll along the
      // pavement; after dark the lamps pool light on it. Laid out along the
      // long axis in local coordinates, so a vertical (1×N) street is simply
      // drawn rotated.
      const vertical = h > w;
      const L = vertical ? h : w, D = vertical ? w : h;   // length along / depth across
      ctx.save();
      if (vertical) { ctx.translate(px + w, py); ctx.rotate(Math.PI/2); }
      else          { ctx.translate(px, py); }
      const s     = D / 40;
      const hr    = DayNight.hour();
      const day   = hr >= 6.5 && hr < 19.5;
      const seed  = (e.col || 0) * 7 + (e.row || 0) * 13;
      const hsh   = i => { const v = Math.sin(seed*12.9898 + i*78.233) * 43758.5453; return v - Math.floor(v); };
      const dot   = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill(); };
      const line  = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
      const vergeB = D*0.56, kerbT = D - 3.5*s, rowH = (kerbT - vergeB) / 2;
      const count  = Math.max(2, Math.round(L / TILE)), seg = L / count;
      const treeY  = vergeB + rowH*0.6;
      const lampAt = i => i % 2 === 0;   // gaps between trees alternate lamp / bench

      // ── Verge: grass with darker tufts ──────────────────────────────
      ctx.fillStyle = '#23461a'; ctx.fillRect(1, 1, L-2, vergeB-1);
      for (let i=0;i<count*4;i++) {
        ctx.fillStyle = i%2 ? 'rgba(90,160,50,0.22)' : 'rgba(12,30,8,0.3)';
        ctx.beginPath();
        ctx.ellipse(4*s + hsh(i)*(L - 8*s), 3*s + hsh(i+50)*(vergeB - 6*s), 4*s, 1.8*s, 0, 0, Math.PI*2);
        ctx.fill();
      }

      // ── Sidewalk: two courses of staggered slabs, then the kerb ─────
      ctx.fillStyle = '#5c574c'; ctx.fillRect(1, vergeB, L-2, kerbT - vergeB);
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 0.6;
      line(1, vergeB + rowH, L-1, vergeB + rowH);
      const slab = 8*s;
      for (let r=0;r<2;r++) {
        for (let x = slab + (r ? slab/2 : 0); x < L-1; x += slab) line(x, vergeB + r*rowH, x, vergeB + (r+1)*rowH);
      }
      ctx.fillStyle = '#8a857a';                ctx.fillRect(1, kerbT, L-2, D - 1 - kerbT);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(1, kerbT, L-2, 0.8*s);
      ctx.fillStyle = 'rgba(160,200,120,0.35)'; ctx.fillRect(1, vergeB - 0.8*s, L-2, 0.8*s);

      // ── Shrubs and flower clumps on the verge between trees ─────────
      for (let i=0;i<count-1;i++) {
        const gx = seg*(i+1);
        ctx.fillStyle = '#2c6a22'; dot(gx - 3*s, vergeB - 3*s, 2.6*s); dot(gx + 2*s, vergeB - 2.6*s, 2.2*s);
        ctx.fillStyle = '#4a9a34'; dot(gx - 3.6*s, vergeB - 3.8*s, 1.4*s);
        ctx.fillStyle = ['#f0c030', '#e05a8a', '#b070e0'][i % 3];
        for (let k=0;k<4;k++) dot(gx - 5*s + k*3*s, vergeB - 1.6*s - (k%2)*1.2*s, 0.8*s);
      }

      // ── Tree grates ─────────────────────────────────────────────────
      for (let i=0;i<count;i++) {
        const tx = seg*(i+0.5);
        ctx.fillStyle = '#2a2824'; ctx.fillRect(tx - 4*s, treeY - 2.6*s, 8*s, 5.2*s);
        ctx.strokeStyle = 'rgba(120,115,100,0.6)'; ctx.lineWidth = 0.5;
        ctx.strokeRect(tx - 4*s, treeY - 2.6*s, 8*s, 5.2*s);
        for (let k=1;k<4;k++) line(tx - 4*s + k*2*s, treeY - 2.6*s, tx - 4*s + k*2*s, treeY + 2.6*s);
      }

      // ── Lamp light pooled on the pavement after dark ────────────────
      if (!day) {
        for (let i=0;i<count-1;i++) if (lampAt(i)) {
          const lx = seg*(i+1), ly = kerbT - 2*s, gr = 16*s;
          const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, gr);
          g.addColorStop(0, 'rgba(255,205,120,0.30)'); g.addColorStop(1, 'rgba(255,205,120,0)');
          ctx.fillStyle = g; ctx.fillRect(lx - gr, vergeB, gr*2, kerbT - vergeB);
        }
      }

      // ── Benches on the back course ──────────────────────────────────
      for (let i=0;i<count-1;i++) if (!lampAt(i)) {
        const bx = seg*(i+1) - 5*s, by = vergeB + rowH*0.9;
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(bx + 0.8*s, by + 1.6*s, 10*s, 1.2*s);
        ctx.fillStyle = '#3a3a3e'; ctx.fillRect(bx + 1*s, by, 0.9*s, 2.4*s); ctx.fillRect(bx + 8.1*s, by, 0.9*s, 2.4*s);
        ctx.fillStyle = '#8a6034'; ctx.fillRect(bx, by - 3.4*s, 10*s, 1.1*s);
        ctx.fillStyle = '#a0723e'; ctx.fillRect(bx, by - 0.6*s, 10*s, 1.3*s);
      }

      // ── Trees — mostly greens, the odd flowering one ────────────────
      for (let i=0;i<count;i++) {
        const pal  = hsh(i+300) < 0.2 ? 2 : i % 2;
        const sway = Math.sin(t*1.1 + seed*0.1 + i*1.3) * 1.2*s;
        _drawParkTree(seg*(i+0.5), treeY, (10.5 + hsh(i+310)*1.5)*s, s, pal, sway, seed + i);
      }

      // ── Pedestrians strolling the front course (daytime) ────────────
      if (day) {
        const span = L + 20*s;
        for (let p=0;p<Math.max(1, Math.floor(count/2));p++) {
          const dir = p % 2 ? -1 : 1;
          const x = ((t*(6 + hsh(p+400)*4)*s*dir + hsh(p+410)*span) % span + span) % span - 10*s;
          if (x < 4*s || x > L - 4*s) continue;
          const y = kerbT - 1.2*s - (p%2)*rowH*0.35;
          const step = Math.sin(t*8 + p*2) * 0.7*s;
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath(); ctx.ellipse(x + 1*s, y + 0.5*s, 2.4*s, 0.8*s, 0, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#34384a';
          ctx.fillRect(x - 1.2*s + step*0.4, y - 3.4*s, 1*s, 3.4*s);
          ctx.fillRect(x + 0.2*s - step*0.4, y - 3.4*s, 1*s, 3.4*s);
          ctx.fillStyle = ['#c85a3a', '#4a78b8', '#d8b040', '#6a9a5a'][Math.floor(hsh(p+420)*4)];
          ctx.fillRect(x - 1.6*s, y - 7.6*s, 3.2*s, 4.4*s);
          ctx.fillStyle = '#e6c4a0'; dot(x, y - 9*s, 1.4*s);
        }
      }

      // ── Street lamps (in front of the trees) ────────────────────────
      for (let i=0;i<count-1;i++) if (lampAt(i)) {
        const lx = seg*(i+1), lb = kerbT - 1.5*s, lt = lb - 19*s;
        ctx.strokeStyle = '#2c2c30'; ctx.lineWidth = 1.2*s; line(lx, lb, lx, lt);
        ctx.fillStyle = '#2c2c30';
        ctx.fillRect(lx - 1.8*s, lt - 1*s, 3.6*s, 1*s);
        ctx.fillRect(lx - 1.2*s, lb - 0.6*s, 2.4*s, 0.8*s);
        ctx.fillStyle = day ? 'rgba(215,215,195,0.65)' : `rgba(255,228,150,${0.9 + 0.1*Math.sin(t*5 + i)})`;
        ctx.fillRect(lx - 1.4*s, lt, 2.8*s, 2.8*s);
        if (!day) {
          const g = ctx.createRadialGradient(lx, lt + 1.4*s, 0, lx, lt + 1.4*s, 7*s);
          g.addColorStop(0, 'rgba(255,220,140,0.45)'); g.addColorStop(1, 'rgba(255,220,140,0)');
          ctx.fillStyle = g; ctx.fillRect(lx - 7*s, lt - 5.6*s, 14*s, 14*s);
        }
      }

      ctx.strokeStyle = '#80c060'; ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3 + 0.1*Math.sin(t*2);
      ctx.strokeRect(1, 1, L-2, D-2);
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }
    if (e.type === T.COMMUNITYGARDEN) {
      // Community Garden — a fenced allotment: gravel cross path from an open
      // gate, three raised beds (lettuce, staked tomatoes, pumpkins guarded by
      // a scarecrow) and a corner with sunflowers, a tool shed and a rain
      // barrel. By day a gardener walks the path watering and bees work the
      // sunflowers; at night the shed lantern is lit and fireflies come out.
      // `s` scales the pixel-sized details with the footprint (1 at 3×3).
      const s    = w / 120;
      const hr   = DayNight.hour();
      const day  = hr >= 6.5 && hr < 19.5;
      const seed = (e.col || 0) * 7 + (e.row || 0) * 13;
      const hsh  = i => { const v = Math.sin(seed*12.9898 + i*78.233) * 43758.5453; return v - Math.floor(v); };
      const dot  = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill(); };
      const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
      const L = px + 5*s, R = px + w - 5*s, TOP = py + 5*s, B = py + h - 5*s;   // inside the fence
      const cx = px + w/2, cy = py + h/2, pathW = 9*s;

      // ── Grass, mottled so it doesn't read as a flat fill ────────────
      ctx.fillStyle = '#1f3314';
      ctx.fillRect(px+1, py+1, w-2, h-2);
      for (let i=0;i<12;i++) {
        ctx.fillStyle = i%2 ? 'rgba(80,140,45,0.22)' : 'rgba(14,30,10,0.35)';
        ctx.beginPath();
        ctx.ellipse(px + w*(0.08 + hsh(i)*0.84), py + h*(0.08 + hsh(i+40)*0.84), 7*s, 4*s, hsh(i+80)*3, 0, Math.PI*2);
        ctx.fill();
      }

      // ── Gravel cross path, running out through the gate ─────────────
      ctx.fillStyle = '#857858';
      ctx.fillRect(cx - pathW/2, TOP, pathW, py + h - TOP);
      ctx.fillRect(L, cy - pathW/2, R - L, pathW);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(cx - pathW/2, TOP, 0.8*s, py + h - TOP);
      ctx.fillRect(cx + pathW/2 - 0.8*s, TOP, 0.8*s, py + h - TOP);
      ctx.fillStyle = 'rgba(210,195,150,0.55)';
      for (let i=0;i<40;i++) {
        const u = hsh(i+120), v = hsh(i+200);
        if (i%2) ctx.fillRect(cx - pathW/2 + v*pathW, TOP + u*(B - TOP), 0.9*s, 0.9*s);
        else     ctx.fillRect(L + u*(R - L), cy - pathW/2 + v*pathW, 0.9*s, 0.9*s);
      }

      // ── Raised timber beds, one per quadrant ────────────────────────
      const qW = (R - L - pathW)/2 - 5*s, qH = (B - TOP - pathW)/2 - 5*s;
      const qx = [L + 2.5*s, cx + pathW/2 + 2.5*s], qy = [TOP + 2.5*s, cy + pathW/2 + 2.5*s];
      const bed = (x, y) => {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 1.5*s, y + 2*s, qW, qH);
        ctx.fillStyle = '#7a5530';         ctx.fillRect(x, y, qW, qH);
        ctx.fillStyle = '#a07644';         ctx.fillRect(x, y, qW, 1.4*s);
        ctx.fillStyle = '#3a2612';         ctx.fillRect(x + 2.5*s, y + 2.5*s, qW - 5*s, qH - 5*s);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.6;
        for (let fy = y + 7*s; fy < y + qH - 3*s; fy += 5*s) line(x + 3*s, fy, x + qW - 3*s, fy);
      };

      // Lettuce — rows of rosettes (top-left)
      {
        const x = qx[0], y = qy[0];
        bed(x, y);
        for (let r=0;r<3;r++) for (let c=0;c<4;c++) {
          const lx = x + 6*s + c*((qW - 12*s)/3), ly = y + 7*s + r*((qH - 14*s)/2);
          const rr = (2.8 + hsh(r*4 + c)*0.9) * s;
          ctx.fillStyle = '#2f7a24'; dot(lx, ly, rr);
          ctx.fillStyle = '#58b43a'; dot(lx - 0.5*s, ly - 0.5*s, rr*0.62);
          ctx.fillStyle = '#a4e476'; dot(lx - 0.8*s, ly - 0.9*s, rr*0.24);
        }
      }

      // Tomatoes — staked vines with ripening fruit (bottom-left)
      {
        const x = qx[0], y = qy[1];
        bed(x, y);
        for (let i=0;i<3;i++) {
          const sx = x + qW*(0.2 + i*0.3);
          const sway = Math.sin(t*1.3 + i + seed) * 0.5*s;
          ctx.strokeStyle = '#b89a60'; ctx.lineWidth = 1*s;
          line(sx, y + qH - 5*s, sx, y + 4*s);
          for (let k=0;k<4;k++) {
            ctx.fillStyle = k%2 ? '#2e6e22' : '#3e8c2c';
            dot(sx + (k%2 ? 2.4 : -2.4)*s + sway, y + 8*s + k*((qH - 16*s)/3), 3.6*s);
          }
          for (let k=0;k<3;k++) {
            const fx = sx + (k%2 ? -3 : 3)*s + sway, fy = y + 10*s + k*9*s;
            ctx.fillStyle = hsh(i*5 + k + 300) > 0.3 ? '#e03a22' : '#e8a030';
            dot(fx, fy, 1.9*s);
            ctx.fillStyle = 'rgba(255,225,205,0.6)'; dot(fx - 0.6*s, fy - 0.6*s, 0.6*s);
          }
        }
      }

      // Pumpkins on a sprawling vine, with a scarecrow (bottom-right)
      {
        const x = qx[1], y = qy[1];
        bed(x, y);
        ctx.strokeStyle = '#3f8a2c'; ctx.lineWidth = 1.2*s;
        ctx.beginPath();
        ctx.moveTo(x + 5*s, y + qH*0.3);
        ctx.bezierCurveTo(x + qW*0.4, y + qH*0.05, x + qW*0.5, y + qH*0.95, x + qW - 5*s, y + qH*0.65);
        ctx.stroke();
        for (let i=0;i<6;i++) {
          ctx.fillStyle = i%2 ? '#357a26' : '#4a9a32';
          ctx.beginPath();
          ctx.ellipse(x + qW*(0.14 + i*0.145), y + qH*(0.42 + 0.3*Math.sin(i*1.7)), 3.4*s, 2.4*s, i, 0, Math.PI*2);
          ctx.fill();
        }
        for (const [fx, fy, r] of [[0.24, 0.66, 4.2], [0.76, 0.28, 3.4], [0.8, 0.78, 3.0]]) {
          const X = x + qW*fx, Y = y + qH*fy;
          ctx.fillStyle = '#d8741a';
          ctx.beginPath(); ctx.ellipse(X, Y, r*1.25*s, r*s, 0, 0, Math.PI*2); ctx.fill();
          ctx.strokeStyle = 'rgba(120,50,10,0.55)'; ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.ellipse(X, Y, r*0.55*s, r*s, 0, 0, Math.PI*2); ctx.stroke();
          ctx.fillStyle = 'rgba(255,200,120,0.45)'; dot(X - r*0.55*s, Y - r*0.4*s, r*0.3*s);
          ctx.fillStyle = '#4a6a20'; ctx.fillRect(X - 0.5*s, Y - r*s - 1.5*s, 1*s, 2*s);
        }
        const scX = x + qW*0.5, scB = y + qH*0.9, lean = Math.sin(t*0.9 + seed) * 0.6*s;
        ctx.strokeStyle = '#6a4a28'; ctx.lineWidth = 1.4*s;
        line(scX, scB, scX + lean, scB - 15*s);
        line(scX - 6*s + lean, scB - 10*s, scX + 6*s + lean, scB - 10*s);
        ctx.fillStyle = '#5a78a8'; ctx.fillRect(scX - 3*s + lean, scB - 12*s, 6*s, 6*s);
        ctx.fillStyle = '#e8c878';
        ctx.fillRect(scX - 7.4*s + lean, scB - 10.8*s, 1.6*s, 1.6*s);
        ctx.fillRect(scX + 5.8*s + lean, scB - 10.8*s, 1.6*s, 1.6*s);
        ctx.fillStyle = '#e6c888'; dot(scX + lean, scB - 14.5*s, 2.4*s);
        ctx.fillStyle = '#8a5a20';
        ctx.beginPath(); ctx.ellipse(scX + lean, scB - 16*s, 4*s, 1.3*s, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillRect(scX - 2*s + lean, scB - 19*s, 4*s, 3*s);
      }

      // Sunflowers, tool shed and rain barrel (top-right)
      {
        const x = qx[1], y = qy[0];
        ctx.fillStyle = '#3a2a16';
        ctx.fillRect(x, y + qH*0.55, qW*0.4, qH*0.45);

        const shX = x + qW*0.46, shW = qW*0.54, shY = y + qH*0.3, shH = qH*0.5;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(shX + 2*s, shY + 2*s, shW, shH);
        ctx.fillStyle = '#6e4c2c';         ctx.fillRect(shX, shY, shW, shH);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.6;
        for (let lx = shX + 3*s; lx < shX + shW; lx += 3*s) line(lx, shY, lx, shY + shH);
        ctx.fillStyle = '#4a5a3c';
        ctx.beginPath();
        ctx.moveTo(shX - 2*s, shY + 1*s); ctx.lineTo(shX + shW*0.5, shY - 7*s); ctx.lineTo(shX + shW + 2*s, shY + 1*s);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 0.8*s;
        line(shX - 2*s, shY + 1*s, shX + shW*0.5, shY - 7*s);
        // Door stands open by day with a rake leaning inside
        const dW = shW*0.34, dX = shX + shW*0.5 - dW/2, dY = shY + shH*0.3, dH = shH*0.7;
        ctx.fillStyle = day ? '#1a120a' : '#4e3620'; ctx.fillRect(dX, dY, dW, dH);
        if (day) {
          ctx.fillStyle = '#5e4026'; ctx.fillRect(dX + dW, dY, dW*0.35, dH);
          ctx.strokeStyle = '#a08050'; ctx.lineWidth = 0.7*s;
          line(dX + dW*0.3, dY + dH - 1*s, dX + dW*0.6, dY + 1.5*s);
        }
        // Window — a lantern glows in it after dark
        const wX = shX + shW*0.08, wY = shY + shH*0.25, wS = shW*0.2;
        ctx.fillStyle = day ? 'rgba(40,55,70,0.9)' : `rgba(255,200,110,${0.75 + 0.15*Math.sin(t*3 + seed)})`;
        ctx.fillRect(wX, wY, wS, wS);
        if (!day) {
          const gx = wX + wS/2, gy = wY + wS/2, gr = 18*s;
          const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
          g.addColorStop(0, 'rgba(255,190,100,0.28)'); g.addColorStop(1, 'rgba(255,190,100,0)');
          ctx.fillStyle = g; ctx.fillRect(gx - gr, gy - gr, gr*2, gr*2);
        }
        // Rain barrel
        const rbX = shX + shW*0.8, rbY = shY + shH + 4.5*s;
        ctx.fillStyle = '#2a4a6a'; dot(rbX, rbY, 3.4*s);
        ctx.fillStyle = '#5a86aa'; dot(rbX, rbY, 2.4*s);
        ctx.fillStyle = 'rgba(210,235,255,0.55)'; dot(rbX - 0.8*s + Math.sin(t*1.2)*0.3*s, rbY - 0.8*s, 0.7*s);

        // Sunflowers — heads droop a little overnight
        for (let i=0;i<3;i++) {
          const bx0 = x + qW*(0.08 + i*0.13), base = y + qH*0.97;
          const top = base - qH*(0.58 + hsh(20 + i)*0.16);
          const hx = bx0 + Math.sin(t*1.1 + i*1.4 + seed) * 1.2*s, hy = top + (day ? 0 : 2*s);
          ctx.strokeStyle = '#3c7a28'; ctx.lineWidth = 1*s;
          ctx.beginPath(); ctx.moveTo(bx0, base); ctx.quadraticCurveTo(bx0, (base + top)/2, hx, hy); ctx.stroke();
          ctx.fillStyle = '#4a9030';
          ctx.beginPath(); ctx.ellipse(bx0 + 2*s, base - qH*0.22, 2.4*s, 1.1*s, -0.5, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(bx0 - 2*s, base - qH*0.36, 2.4*s, 1.1*s,  0.5, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = day ? '#f2c020' : '#a08020';
          for (let p=0;p<8;p++) { const a = p/8*Math.PI*2 + i; dot(hx + Math.cos(a)*2.6*s, hy + Math.sin(a)*2.6*s, 1.3*s); }
          ctx.fillStyle = '#5a3414'; dot(hx, hy, 1.9*s);
        }
      }

      // ── Picket fence with an open gate where the path leaves ────────
      const gapL = cx - pathW/2, gapR = cx + pathW/2, fb = py + h - 3*s;
      ctx.strokeStyle = '#9a8660'; ctx.lineWidth = 0.9*s;
      ctx.beginPath();
      ctx.moveTo(gapL, fb); ctx.lineTo(px + 3*s, fb); ctx.lineTo(px + 3*s, py + 3*s);
      ctx.lineTo(px + w - 3*s, py + 3*s); ctx.lineTo(px + w - 3*s, fb); ctx.lineTo(gapR, fb);
      ctx.stroke();
      ctx.fillStyle = '#e0d2a4';
      for (let fx = px + 3*s; fx <= px + w - 4*s; fx += 4.5*s) {
        ctx.fillRect(fx, py + 1.5*s, 1.4*s, 3.2*s);
        if (fx + 1.4*s < gapL - 1.5*s || fx > gapR + 1.5*s) ctx.fillRect(fx, fb - 1.5*s, 1.4*s, 3.2*s);
      }
      for (let fy = py + 7*s; fy <= py + h - 7*s; fy += 4.5*s) {
        ctx.fillRect(px + 1.5*s, fy, 3.2*s, 1.4*s);
        ctx.fillRect(px + w - 4.7*s, fy, 3.2*s, 1.4*s);
      }
      ctx.fillStyle = '#8a7048';
      ctx.fillRect(gapL - 2*s, fb - 3*s, 2*s, 5*s);
      ctx.fillRect(gapR,       fb - 3*s, 2*s, 5*s);
      ctx.strokeStyle = '#e0d2a4'; ctx.lineWidth = 1.4*s;   // gate leaf swung inward
      line(gapR + 1*s, fb - 2*s, gapR + 2.5*s, fb - pathW);

      // ── Gardener walking the path with a watering can (daytime) ─────
      if (day) {
        const ph = t*0.22 + seed;
        const gx = cx + Math.sin(ph)*(R - L)*0.36, gy = cy + 1*s;
        const dir = Math.cos(ph) >= 0 ? 1 : -1;
        const watering = Math.abs(Math.sin(ph)) > 0.9;
        const bob = watering ? 0 : Math.abs(Math.sin(t*6)) * 0.8*s;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(gx, gy + 4*s, 3.2*s, 1.2*s, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#3a4a6a';
        ctx.fillRect(gx - 2*s, gy, 1.6*s, 4*s); ctx.fillRect(gx + 0.4*s, gy, 1.6*s, 4*s);
        ctx.fillStyle = '#c85a3a'; ctx.fillRect(gx - 2.6*s, gy - 5*s - bob, 5.2*s, 5.5*s);
        ctx.fillStyle = '#e8c09a'; dot(gx, gy - 6.8*s - bob, 1.8*s);
        ctx.fillStyle = '#e8d890';
        ctx.beginPath(); ctx.ellipse(gx, gy - 7.8*s - bob, 3.4*s, 1.1*s, 0, 0, Math.PI*2); ctx.fill();
        const cnX = gx + dir*4*s, cnY = gy - 2.5*s - bob;
        ctx.fillStyle = '#3f8f5a'; ctx.fillRect(cnX - 1.6*s, cnY - 1.4*s, 3.2*s, 2.8*s);
        ctx.strokeStyle = '#3f8f5a'; ctx.lineWidth = 0.8*s;
        line(cnX + dir*1.6*s, cnY, cnX + dir*4*s, cnY - 2*s);
        if (watering) {
          for (let k=0;k<5;k++) {
            const f = (t*2.5 + k*0.2) % 1;
            ctx.fillStyle = `rgba(150,210,255,${0.8*(1 - f)})`;
            dot(cnX + dir*(4 + f*3)*s, cnY - 2*s + f*7*s, 0.6*s);
          }
        }
      }

      // ── Wildlife: bees + a butterfly by day, fireflies by night ─────
      if (day) {
        for (let i=0;i<3;i++) {
          const bx = qx[1] + qW*0.2 + Math.sin(t*1.7 + i*2.1)*qW*0.18;
          const by = qy[0] + qH*0.4 + Math.cos(t*2.3 + i)*6*s;
          ctx.fillStyle = 'rgba(255,255,255,0.55)'; dot(bx, by - 0.9*s, 0.8*s);
          ctx.fillStyle = '#f0c020'; dot(bx, by, 0.9*s);
        }
        const bfX = px + w*(0.3 + 0.25*Math.sin(t*0.37 + seed)), bfY = py + h*(0.3 + 0.2*Math.sin(t*0.53 + seed));
        const flap = Math.abs(Math.sin(t*9));
        ctx.fillStyle = '#f08ac0';
        ctx.beginPath(); ctx.ellipse(bfX - 1.4*s, bfY, (0.4 + 1.6*flap)*s, 1.5*s, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(bfX + 1.4*s, bfY, (0.4 + 1.6*flap)*s, 1.5*s, 0, 0, Math.PI*2); ctx.fill();
      } else {
        for (let i=0;i<6;i++) {
          const fx = px + w*(0.12 + hsh(i+400)*0.76) + Math.sin(t*0.6 + i*1.9)*6*s;
          const fy = py + h*(0.12 + hsh(i+500)*0.76) + Math.cos(t*0.8 + i*1.3)*4*s;
          const a = Math.max(0, Math.sin(t*2.2 + i*1.7));
          ctx.fillStyle = `rgba(200,255,120,${0.15*a})`; dot(fx, fy, 3*s);
          ctx.fillStyle = `rgba(230,255,160,${0.9*a})`;  dot(fx, fy, 0.9*s);
        }
      }

      ctx.strokeStyle = '#a0d040'; ctx.lineWidth = 1;
      ctx.globalAlpha = 0.35 + 0.1*Math.sin(t*2);
      ctx.strokeRect(px+1, py+1, w-2, h-2);
      ctx.globalAlpha = 1;
      return;
    }
    // ── Small Park (3×2) ────────────────────────────────────────────────
    // A neighbourhood pocket park: a striped lawn inside a clipped hedge, a
    // gravel path winding in from the street past a bench and a duck pond,
    // shade trees (one sometimes in blossom), a flower bed, and a lamp that
    // comes on after dark. By day someone reads on the bench and a dog
    // walker does laps of the path; at night the lamp pools light on the
    // gravel and fireflies hang over the water. `s` scales the pixel-sized
    // details with the footprint (1 at 3×2).
    {
      const s    = h / 80;
      const hr   = DayNight.hour();
      const day  = hr >= 6.5 && hr < 19.5;
      const seed = (e.col || 0) * 7 + (e.row || 0) * 13;
      const hsh  = i => { const v = Math.sin(seed*12.9898 + i*78.233) * 43758.5453; return v - Math.floor(v); };
      const dot  = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill(); };
      const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
      const TAU  = Math.PI * 2;

      // ── Lawn: mowing stripes and a few tufts ────────────────────────
      ctx.fillStyle = '#244a18';
      ctx.fillRect(px+1, py+1, w-2, h-2);
      ctx.fillStyle = 'rgba(120,190,70,0.09)';
      for (let i=0;i<6;i+=2) ctx.fillRect(px + 1 + i*(w-2)/6, py+1, (w-2)/6, h-2);
      for (let i=0;i<10;i++) {
        ctx.fillStyle = i%2 ? 'rgba(90,160,50,0.2)' : 'rgba(14,34,10,0.3)';
        ctx.beginPath();
        ctx.ellipse(px + w*(0.06 + hsh(i)*0.88), py + h*(0.08 + hsh(i+30)*0.84), 5*s, 2.6*s, 0, 0, TAU);
        ctx.fill();
      }

      // ── Duck pond (top-right) ───────────────────────────────────────
      const pdX = px + w*0.74, pdY = py + h*0.33, pdRX = w*0.16, pdRY = h*0.2;
      ctx.fillStyle = '#6a6458';
      ctx.beginPath(); ctx.ellipse(pdX, pdY, pdRX + 2*s, pdRY + 2*s, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = day ? '#2f6a88' : '#183848';
      ctx.beginPath(); ctx.ellipse(pdX, pdY, pdRX, pdRY, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = day ? 'rgba(150,210,235,0.35)' : 'rgba(120,160,200,0.18)';
      ctx.beginPath(); ctx.ellipse(pdX - pdRX*0.3, pdY - pdRY*0.35, pdRX*0.45, pdRY*0.22, -0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8a8474';
      for (let i=0;i<14;i++) { const a = i/14*TAU; dot(pdX + Math.cos(a)*(pdRX + 1.5*s), pdY + Math.sin(a)*(pdRY + 1.5*s), 1.2*s); }
      for (let i=0;i<3;i++) {
        const lx = pdX + pdRX*(-0.5 + i*0.45), ly = pdY + pdRY*(0.35 - (i%2)*0.6);
        ctx.fillStyle = '#3f8a3a';
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.arc(lx, ly, 2.2*s, 0.5, TAU - 0.1); ctx.closePath(); ctx.fill();
        if (i === 1) { ctx.fillStyle = '#f0a0c8'; dot(lx + 0.5*s, ly - 0.5*s, 0.9*s); }
      }
      // A mallard paddling slow circles, trailing a ripple
      const da = t*0.35 + seed;
      const dX = pdX + Math.cos(da)*pdRX*0.55, dY = pdY + Math.sin(da)*pdRY*0.45;
      const dDir = -Math.sin(da) >= 0 ? 1 : -1;
      const rip = (t*1.5) % 1;
      ctx.strokeStyle = `rgba(200,230,245,${0.4*(1 - rip)})`; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.ellipse(dX, dY + 1*s, (2.5 + rip*2)*s, (1 + rip*0.8)*s, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#f0ece0';
      ctx.beginPath(); ctx.ellipse(dX, dY, 2.4*s, 1.4*s, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a6a3a'; dot(dX + dDir*1.9*s, dY - 1.4*s, 1*s);
      ctx.fillStyle = '#e0a020'; ctx.fillRect(dX + dDir*2.8*s - (dDir < 0 ? 1.2*s : 0), dY - 1.5*s, 1.2*s, 0.7*s);

      // ── Gravel path: in from the bottom edge, out through the right ─
      const P = [[px + w*0.28, py + h], [px + w*0.30, py + h*0.50], [px + w*0.58, py + h*0.78], [px + w, py + h*0.64]];
      const bez = u => {
        const m = 1 - u, a = m*m*m, b = 3*m*m*u, c = 3*m*u*u, d = u*u*u;
        return [a*P[0][0] + b*P[1][0] + c*P[2][0] + d*P[3][0], a*P[0][1] + b*P[1][1] + c*P[2][1] + d*P[3][1]];
      };
      const pathStroke = (lw, col) => {
        ctx.strokeStyle = col; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(...P[0]); ctx.bezierCurveTo(...P[1], ...P[2], ...P[3]); ctx.stroke();
      };
      pathStroke(9*s, '#5e5646');
      pathStroke(7*s, '#b4a67a');
      ctx.fillStyle = 'rgba(90,80,60,0.45)';
      for (let i=0;i<30;i++) {
        const [gx, gy] = bez(hsh(i+60));
        ctx.fillRect(gx + (hsh(i+90) - 0.5)*5*s, gy + (hsh(i+120) - 0.5)*5*s, 0.9*s, 0.9*s);
      }

      // ── Flower bed (top-left) ───────────────────────────────────────
      const fbX = px + w*0.2, fbY = py + h*0.24;
      ctx.fillStyle = '#6a6458'; ctx.beginPath(); ctx.ellipse(fbX, fbY, 11*s, 6.5*s, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a2412'; ctx.beginPath(); ctx.ellipse(fbX, fbY, 9.8*s, 5.4*s, 0, 0, TAU); ctx.fill();
      const fCols = ['#e04070', '#f0b020', '#c040e0', '#f06040', '#50b8f0', '#f8f0f0'];
      const fsw = Math.sin(t*1.3 + seed) * 0.6*s;
      for (let i=0;i<14;i++) {
        const a = hsh(i+150)*TAU, rr = Math.sqrt(hsh(i+170));
        const fx = fbX + Math.cos(a)*rr*8*s, fy = fbY + Math.sin(a)*rr*4.2*s;
        ctx.fillStyle = '#3c7a28'; dot(fx, fy + 0.8*s, 1.1*s);
        ctx.fillStyle = fCols[i % fCols.length]; dot(fx + fsw, fy - 0.4*s, 1.1*s);
      }

      // ── Clipped hedge, gapped where the path enters and leaves ──────
      const hedge = (x, y) => {
        ctx.fillStyle = '#1a4012'; dot(x, y, 2.6*s);
        ctx.fillStyle = '#2e6a22'; dot(x - 0.6*s, y - 0.7*s, 1.7*s);
      };
      const hStep = 4.6*s, inset = 2.6*s;
      const gB0 = P[0][0] - 6*s, gB1 = P[0][0] + 6*s;
      const gR0 = P[3][1] - 6*s, gR1 = P[3][1] + 6*s;
      for (let x = px + inset; x <= px + w - inset + 0.1; x += hStep) {
        hedge(x, py + inset);
        if (x < gB0 || x > gB1) hedge(x, py + h - inset);
      }
      for (let y = py + inset + hStep; y < py + h - inset; y += hStep) {
        hedge(px + inset, y);
        if (y < gR0 || y > gR1) hedge(px + w - inset, y);
      }

      // ── Lamp light pooled on the ground after dark ──────────────────
      const lpX = px + w*0.33, lpB = py + h*0.6, lpT = lpB - 16*s;
      if (!day) {
        const g = ctx.createRadialGradient(lpX, lpB, 0, lpX, lpB, 18*s);
        g.addColorStop(0, 'rgba(255,210,120,0.26)'); g.addColorStop(1, 'rgba(255,210,120,0)');
        ctx.fillStyle = g; ctx.fillRect(lpX - 18*s, lpB - 18*s, 36*s, 36*s);
      }

      // ── Bench facing the path, with a reader by day ─────────────────
      const bnX = px + w*0.40, bnY = py + h*0.56;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(bnX + 1*s, bnY + 2.5*s, 11*s, 1.5*s);
      ctx.fillStyle = '#3a3a3e'; ctx.fillRect(bnX + 0.8*s, bnY, 1*s, 3*s); ctx.fillRect(bnX + 9.2*s, bnY, 1*s, 3*s);
      ctx.fillStyle = '#86592c'; ctx.fillRect(bnX, bnY - 5*s, 11*s, 1.4*s);
      if (day && hsh(7) > 0.25) {
        const rX = bnX + 4.5*s;
        ctx.fillStyle = '#4a70b0'; ctx.fillRect(rX - 1.8*s, bnY - 5.5*s, 3.6*s, 4.5*s);
        ctx.fillStyle = '#3a3a48'; ctx.fillRect(rX - 1.8*s, bnY - 1.2*s, 3.6*s, 1.4*s);
        ctx.fillStyle = '#e6c4a0'; dot(rX, bnY - 7*s, 1.6*s);
        ctx.fillStyle = '#5a3a20'; ctx.beginPath(); ctx.arc(rX, bnY - 7.3*s, 1.7*s, Math.PI, TAU); ctx.fill();
        const turning = Math.sin(t*0.3 + seed) > 0.97;
        ctx.fillStyle = '#f4f0e8'; ctx.fillRect(rX - 2.2*s, bnY - 3.4*s, (turning ? 2.6 : 4.4)*s, 2*s);
      }
      ctx.fillStyle = '#a0723e'; ctx.fillRect(bnX, bnY - 1*s, 11*s, 1.8*s);

      // ── Lamp post ───────────────────────────────────────────────────
      ctx.strokeStyle = '#2c2c30'; ctx.lineWidth = 1.2*s; line(lpX, lpB, lpX, lpT);
      ctx.fillStyle = '#2c2c30'; ctx.fillRect(lpX - 2*s, lpT - 1*s, 4*s, 1*s);
      ctx.fillStyle = day ? 'rgba(220,220,200,0.6)' : `rgba(255,228,150,${0.9 + 0.1*Math.sin(t*5 + seed)})`;
      ctx.fillRect(lpX - 1.5*s, lpT, 3*s, 3*s);
      if (!day) {
        const g = ctx.createRadialGradient(lpX, lpT + 1.5*s, 0, lpX, lpT + 1.5*s, 8*s);
        g.addColorStop(0, 'rgba(255,220,140,0.45)'); g.addColorStop(1, 'rgba(255,220,140,0)');
        ctx.fillStyle = g; ctx.fillRect(lpX - 8*s, lpT - 6.5*s, 16*s, 16*s);
      }

      // ── Dog walker doing laps of the path (daytime) ─────────────────
      if (day) {
        const ph  = t*0.12 + seed;
        const u   = 0.05 + 0.87*(0.5 - 0.5*Math.cos(ph));
        const dir = Math.sin(ph) >= 0 ? 1 : -1;
        const [wx, wy]   = bez(u);
        const [dgx, dgy] = bez(Math.max(0, Math.min(1, u + dir*0.06)));
        const step = Math.sin(t*7) * 0.8*s;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(wx + 1*s, wy + 0.5*s, 2.6*s, 0.9*s, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(dgx + 0.5*s, dgy + 0.5*s, 2.6*s, 0.8*s, 0, 0, TAU); ctx.fill();
        // Dog
        ctx.fillStyle = '#8a5a2a';
        ctx.fillRect(dgx - 2*s, dgy - 2.4*s, 4*s, 1.8*s);
        dot(dgx + dir*2.3*s, dgy - 2.8*s, 1.1*s);
        ctx.fillRect(dgx - 1.6*s, dgy - 0.8*s, 0.7*s, 1.2*s);
        ctx.fillRect(dgx + 1*s,   dgy - 0.8*s, 0.7*s, 1.2*s);
        ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 0.7*s;
        line(dgx - dir*2*s, dgy - 2.6*s, dgx - dir*3*s, dgy - 3.6*s + Math.sin(t*12)*0.4*s);
        // Walker
        ctx.fillStyle = '#34384a';
        ctx.fillRect(wx - 1.4*s + step*0.3, wy - 3.5*s, 1.1*s, 3.5*s);
        ctx.fillRect(wx + 0.3*s - step*0.3, wy - 3.5*s, 1.1*s, 3.5*s);
        ctx.fillStyle = '#d06848'; ctx.fillRect(wx - 1.8*s, wy - 8*s, 3.6*s, 4.8*s);
        ctx.fillStyle = '#e6c4a0'; dot(wx, wy - 9.4*s, 1.5*s);
        ctx.strokeStyle = 'rgba(40,30,20,0.8)'; ctx.lineWidth = 0.5*s;
        line(wx + dir*1.6*s, wy - 5*s, dgx - dir*1*s, dgy - 2.6*s);
      }

      // ── Shade trees, back to front ──────────────────────────────────
      const trees = [
        { x: 0.52, y: 0.36, r: 11, pal: 1 },
        { x: 0.14, y: 0.74, r: 13, pal: 0 },
        { x: 0.90, y: 0.95, r: 9,  pal: hsh(11) < 0.4 ? 2 : 0 },
      ];
      trees.forEach((tr, i) => {
        const sway = Math.sin(t*0.9 + seed*0.1 + i*1.7) * 0.9*s;
        _drawParkTree(px + w*tr.x, py + h*tr.y, tr.r*s, s, tr.pal, sway, seed + i);
      });

      // ── Butterflies over the flowers by day, fireflies by night ─────
      if (day) {
        for (let i=0;i<2;i++) {
          const bfX = fbX + Math.sin(t*0.5 + i*2.4 + seed)*12*s, bfY = fbY - 4*s + Math.sin(t*0.8 + i*1.3)*4*s;
          const flap = Math.abs(Math.sin(t*9 + i));
          ctx.fillStyle = i ? '#f8e070' : '#f08ac0';
          ctx.beginPath(); ctx.ellipse(bfX - 1.2*s, bfY, (0.3 + 1.3*flap)*s, 1.3*s, 0, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.ellipse(bfX + 1.2*s, bfY, (0.3 + 1.3*flap)*s, 1.3*s, 0, 0, TAU); ctx.fill();
        }
      } else {
        for (let i=0;i<5;i++) {
          const fx = pdX + (hsh(i+400) - 0.5)*pdRX*2.4 + Math.sin(t*0.6 + i*1.9)*5*s;
          const fy = pdY + (hsh(i+500) - 0.5)*pdRY*2.4 + Math.cos(t*0.8 + i*1.3)*3*s;
          const a = Math.max(0, Math.sin(t*2.2 + i*1.7));
          ctx.fillStyle = `rgba(200,255,120,${0.15*a})`; dot(fx, fy, 3*s);
          ctx.fillStyle = `rgba(230,255,160,${0.9*a})`;  dot(fx, fy, 0.9*s);
        }
      }

      ctx.strokeStyle = '#60d040'; ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3 + 0.1*Math.sin(t*1.8);
      ctx.strokeRect(px+1, py+1, w-2, h-2);
      ctx.globalAlpha = 1;
    }
  }

// Bridge — a 6×6 road piece laid across water (water_build.js): a steel
// through-truss on concrete piers. Drawn in a 240-unit square, deck running
// top to bottom; a horizontal piece is the same drawing turned a quarter.
// Every piece works out what it stands over and what it meets, so a run
// reads as one structure however it was laid: piers and a deep shadow only
// where there's water under the deck, an earth embankment where there
// isn't, a concrete abutment with wingwalls at the bank, finger joints
// between pieces, an apron widening into a road, a barrier across an open
// end, a gap in the truss where a road joins from the side, and a closed
// corner where the deck turns.
let _bridgePlate = null;
function _bridgePlatePattern() {
  // Steel tread plate, as a repeating tile (one fill instead of hundreds of ticks)
  if (_bridgePlate) return _bridgePlate;
  const c = document.createElement('canvas'); c.width = c.height = 12;
  const g = c.getContext('2d');
  g.fillStyle = '#4a5258'; g.fillRect(0, 0, 12, 12);
  g.lineCap = 'round'; g.lineWidth = 1.5;
  const tick = (x1, y1, x2, y2) => {
    g.strokeStyle = 'rgba(0,0,0,0.38)'; g.beginPath(); g.moveTo(x1 + 0.6, y1 + 0.6); g.lineTo(x2 + 0.6, y2 + 0.6); g.stroke();
    g.strokeStyle = 'rgba(178,190,198,0.42)'; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  };
  tick(1.5, 4.5, 4.5, 1.5); tick(7.5, 10.5, 10.5, 7.5); tick(7.5, 1.5, 10.5, 4.5); tick(1.5, 7.5, 4.5, 10.5);
  _bridgePlate = c;
  return c;
}

// `layer`: 'deck' draws everything under the traffic, 'over' only the
// overhead steel (sway bracing, portal beams) that trucks pass beneath;
// omitted, both at once (the placement ghost).
function renderBridge(e, px, py, t, layer) {
    const S = 6 * TILE, u = TILE / 40;
    const vert = ((e._rotation || 0) % 2) === 0;
    const L = WaterBuild.links(e, t);
    // Local frame: start = top, end = bottom, left/right as drawn. Turned a
    // quarter counter-clockwise, top is west and the left side is south.
    const startK = L.start, endK = L.end;
    const leftK = vert ? L.left : L.right, rightK = vert ? L.right : L.left;
    const joins = k => k === 'road' || k === 'bridge';
    // Which of the six rows along the deck have water under the carriageway.
    const wet = [];
    for (let i = 0; i < 6; i++) {
      let w = false;
      for (let j = 1; j < 5 && !w; j++) w = WaterSystem.isWater(vert ? e.col + j : e.col + i, vert ? e.row + i : e.row + j);
      wet.push(w);
    }
    const dark = typeof DayNight !== 'undefined' ? DayNight.darkness() : 0;
    const X = v => px + v * u, Y = v => py + v * u;
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), w * u, h * u); };
    const P = (pts, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(X(pts[0][0]), Y(pts[0][1])); for (let i = 1; i < pts.length; i++) ctx.lineTo(X(pts[i][0]), Y(pts[i][1])); ctx.closePath(); ctx.fill(); };
    const Ln = (x1, y1, x2, y2, c, w) => { ctx.strokeStyle = c; ctx.lineWidth = w * u; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
    // Rivets (the sub-1.5 dots) only close up: under half a pixel once
    // zoomed out, and dozens of fills a frame along a long bridge.
    const fine = Camera.zoom > 0.6;
    const Dot = (x, y, r, c) => { if (r < 1.5 && !fine) return; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(x), Y(y), r * u, 0, Math.PI * 2); ctx.fill(); };

    ctx.save();
    ctx.lineCap = 'butt';
    if (!vert) { ctx.translate(px + S / 2, py + S / 2); ctx.rotate(-Math.PI / 2); ctx.translate(-(px + S / 2), -(py + S / 2)); }

    // Ends. A dead end with a road joining at the side is a corner: the deck
    // turns there, so that end is closed off with truss rather than barrier.
    const sideJoin = joins(leftK) || joins(rightK);
    const cornerS = sideJoin && (startK === 'water' || startK === 'land');
    const cornerE = sideJoin && (endK === 'water' || endK === 'land');
    const openS = startK === 'water' && !cornerS, openE = endK === 'water' && !cornerE;
    const y0 = openS ? 6 : 0, y1 = openE ? 234 : 240;

    // The steel structure runs the length of the water and a short way onto
    // each bank; past that the deck carries on as a road on an embankment,
    // so the bridge sits down onto the land instead of stopping on the grass.
    // A piece with no water under its deck (only at its edges) is all steel.
    const anyWet = wet.some(Boolean);
    const spans = [];
    for (let i = 0; i < 6; i++) {
      if (anyWet && !wet[i]) continue;
      const a = Math.max(y0, i * 40 - 22), b = Math.min(y1, i * 40 + 62);
      const last = spans[spans.length - 1];
      if (last && a <= last[1]) last[1] = Math.max(last[1], b); else spans.push([a, b]);
    }
    if ((startK === 'bridge' || cornerS) && spans.length && spans[0][0] <= 40) spans[0][0] = y0;
    if ((endK === 'bridge' || cornerE) && spans.length && spans[spans.length - 1][1] >= 200) spans[spans.length - 1][1] = y1;
    if (!anyWet) {
      // Nothing under the deck itself. Water along the piece's edges still
      // makes it a span; otherwise it's the approach onto the bank, with
      // steel only where it meets the bridge (a corner stays steel).
      // (A real stretch of it, not a stray tile of shoreline in a corner.)
      let edgeN = 0;
      for (let i = 0; i < 6; i++) for (const j of [0, 5])
        if (WaterSystem.isWater(vert ? e.col + j : e.col + i, vert ? e.row + i : e.row + j)) edgeN++;
      const edgeWet = edgeN >= 4;
      spans.length = 0;
      if (edgeWet || cornerS || cornerE) spans.push([y0, y1]);
      else {
        if (startK === 'bridge') spans.push([y0, 50]);
        if (endK === 'bridge') spans.push([190, y1]);
      }
    }
    const gaps = [];
    let cur = y0;
    for (const [a, b] of spans) { if (a > cur) gaps.push([cur, a]); cur = Math.max(cur, b); }
    if (cur < y1) gaps.push([cur, y1]);
    const inSpan = y => spans.some(([a, b]) => y >= a && y <= b);

    // Light comes from the top-left of the screen; shadows fall down-right.
    const [sx, sy] = vert ? [14, 16] : [-16, 14];
    // The side of the deck facing the viewer (screen-south) shows its depth.
    const faceLeft = !vert;

    // Overhead steel: an X of sway bracing across the deck every other
    // panel, and a portal beam where a span starts and ends on the bank.
    // It is what makes this read as a through-truss with height rather than
    // a flat deck, so it is drawn over the traffic (see the 'over' layer);
    // its shadows fall on the deck, under the traffic.
    const overhead = (bars, shadows) => {
      const STEEL = '#5f7682', HI = '#9ab0bc', LO = '#33434c';
      for (const [a, b] of spans) {
        for (let k = Math.ceil(a / 60) * 60; k + 60 <= b + 0.01; k += 60) {
          if ((joins(leftK) || joins(rightK)) && k < 196 && k + 60 > 44) continue;   // keep the junction clear overhead
          const ox = sx * 0.55, oy = sy * 0.55;
          if (shadows) {
            Ln(42 + ox, k + oy, 198 + ox, k + 60 + oy, 'rgba(0,0,0,0.20)', 3);
            Ln(198 + ox, k + oy, 42 + ox, k + 60 + oy, 'rgba(0,0,0,0.20)', 3);
          }
          if (bars) {
            Ln(42, k, 198, k + 60, 'rgba(110,134,146,0.92)', 2.4);
            Ln(198, k, 42, k + 60, 'rgba(110,134,146,0.92)', 2.4);
            Ln(42, k - 0.8, 198, k + 59.2, 'rgba(190,206,214,0.6)', 0.7);
            Dot(120, k + 30, 3.2, '#56707c');
          }
        }
      }
      for (const [a, b] of spans) for (const y of [a, b]) {
        if ((y === y0 && (startK === 'bridge' || openS)) || (y === y1 && (endK === 'bridge' || openE))) continue;
        if ((y === y0 && cornerS) || (y === y1 && cornerE)) continue;
        const yy = y === a ? y + 3 : y - 3;
        if (shadows) Ln(26 + sx * 0.4, yy + sy * 0.4, 214 + sx * 0.4, yy + sy * 0.4, 'rgba(0,0,0,0.25)', 5);
        if (bars) { R(22, yy - 3, 196, 6, STEEL); R(22, yy - 3, 196, 1.6, HI); R(22, yy + 1.6, 196, 1.4, LO); }
      }
    };
    if (layer === 'over') { overhead(true, false); ctx.restore(); return; }

    // ── Shadow on the water, earth embankment on dry ground ─────────────
    for (let i = 0; i < 6; i++) {
      if (!wet[i]) continue;
      const a = Math.max(i * 40, y0), b = Math.min(i * 40 + 40, y1);
      R(18 + sx, a + sy, 204, b - a, 'rgba(0,10,22,0.34)');
      R(18 + sx * 1.6, a + sy * 1.6, 204, b - a, 'rgba(0,10,22,0.12)');
    }

    // ── Piers: round concrete columns under a cap beam ─────────────────
    for (const i of [1, 4]) {
      if (!wet[i]) continue;
      const c = i * 40 + 20;
      for (const ex of [12, 228]) {
        const ph = (t * 0.6 + i * 0.37 + ex * 0.01) % 1;
        ctx.strokeStyle = `rgba(220,240,255,${0.35 * (1 - ph)})`; ctx.lineWidth = 1.2 * u;
        ctx.beginPath(); ctx.ellipse(X(ex), Y(c), (9 + ph * 10) * u, (7 + ph * 6) * u, 0, 0, Math.PI * 2); ctx.stroke();
        const g = ctx.createRadialGradient(X(ex - 3), Y(c - 3), 0, X(ex), Y(c), 9 * u);
        g.addColorStop(0, '#b4b2a8'); g.addColorStop(0.7, '#86847a'); g.addColorStop(1, '#5c5a52');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(ex), Y(c), 9 * u, 0, Math.PI * 2); ctx.fill();
        R(ex - 9, c + 6, 18, 2.5, 'rgba(20,40,50,0.5)');   // waterline stain
      }
      R(10, c - 6, 220, 12, '#7c7b72');                      // cap beam
      R(10, c - 6, 220, 3, '#a4a398');
      R(10, c + 4, 220, 2, '#55544c');
    }

    // ── Abutments where the deck meets the bank ───────────────────────
    const abut = (y, landDir) => {
      R(14, y - 6, 212, 12, '#8a897f');
      R(14, y - 6, 212, 3, '#aaa99e');
      R(14, y + 4, 212, 2, '#5e5d55');
      P([[14, y - 6], [2, y + landDir * 24], [9, y + landDir * 26], [21, y + 6]], '#8a897f');
      P([[226, y - 6], [238, y + landDir * 24], [231, y + landDir * 26], [219, y + 6]], '#8a897f');
    };
    for (let k = 1; k < 6; k++) if (wet[k - 1] !== wet[k]) abut(k * 40, wet[k - 1] ? 1 : -1);
    if (startK === 'land' && wet[0]) abut(3, -1);
    if (endK === 'land' && wet[5]) abut(237, 1);

    // ── Approach onto the bank ────────────────────────────────────────
    // Where the bridge meets a road or another piece at the edge of its
    // piece, the approach runs right out to it. Where it simply lands on the
    // bank it runs a short way past the abutment and blends into the grass,
    // so a bridge doesn't drag a long slab of tarmac behind it.
    const SHORT = 22, BLEND = 18;
    const road = (p, q) => { R(52, p, 136, q - p, '#2a2a2a'); R(46, p, 6, q - p, '#66665e'); R(188, p, 6, q - p, '#66665e'); };
    const reaches = y => (y === y0 && (startK === 'road' || startK === 'bridge' || cornerS))
                      || (y === y1 && (endK === 'road' || endK === 'bridge' || cornerE));
    for (const [a, b] of gaps) {
      if (a === y0 && b === y1) { road(a, b); continue; }
      const yB = a === y0 ? b : a, dir = a === y0 ? -1 : 1, yL = a === y0 ? a : b;   // steel side, inland, far end
      // A small earth bank either side, tapering away from the abutment
      P([[14, yB], [46, yB], [46, yB + dir * 26]], 'rgba(96,90,60,0.45)');
      P([[226, yB], [194, yB], [194, yB + dir * 26]], 'rgba(96,90,60,0.45)');
      if ((yL !== y0 && yL !== y1) || reaches(yL)) { road(Math.min(yB, yL), Math.max(yB, yL)); continue; }
      const len = Math.min(Math.abs(yL - yB), SHORT), yR = yB + dir * len;
      road(Math.min(yB, yR), Math.max(yB, yR));
      // ...then a worn track narrowing and fading into the grass
      const yF = yR + dir * Math.min(BLEND, Math.abs(yL - yR));
      const g = ctx.createLinearGradient(0, Y(yR), 0, Y(yF));
      g.addColorStop(0, 'rgba(48,46,42,0.9)'); g.addColorStop(0.5, 'rgba(96,88,64,0.45)'); g.addColorStop(1, 'rgba(96,88,64,0)');
      P([[46, yR], [194, yR], [176, yF], [64, yF]], g);
      for (let k = 0; k < 6; k++) R(70 + ((k * 41) % 100), yR + dir * (2 + ((k * 7) % 12)), 2, 2, 'rgba(150,142,120,0.55)');
    }
    const apron = (yEdge, dir) => {
      const yIn = yEdge + dir * 18;
      P([[0, yEdge], [240, yEdge], [194, yIn], [46, yIn]], '#2a2a2a');
      Ln(0, yEdge, 46, yIn, '#4e4e46', 3); Ln(240, yEdge, 194, yIn, '#4e4e46', 3);
    };
    if (startK === 'road') apron(0, 1);
    if (endK === 'road') apron(240, -1);

    // ── The steel spans ────────────────────────────────────────────────
    const plate = ctx.createPattern(_bridgePlatePattern(), 'repeat');
    // The two trusses either side, open where a road joins from that side.
    const sideRanges = (gap, a, b) => gap ? [[a, Math.min(b, 44)], [Math.max(a, 196), b]].filter(([p, q]) => q - p > 2) : [[a, b]];
    for (const [a, b] of spans) {
      // Deck girder face on the side towards the viewer: the deck's depth.
      if (faceLeft) {
        R(12, a, 10, b - a, '#262c30');
        R(12, a, 10, 1.5, '#3a4248');
        for (let k = a + 6; k < b; k += 10) Dot(17, k, 0.9, '#4e585e');
      }
      if (vert && openE && b >= y1) { R(22, y1, 196, 6, '#262c30'); }
      // Floor beams showing between the trusses' feet
      for (let k = a + 15; k < b; k += 30) { R(18, k - 2, 6, 4, '#30383e'); R(216, k - 2, 6, 4, '#30383e'); }
      // Deck: steel tread plate, plate seams and worn wheel tracks
      ctx.save();
      ctx.beginPath(); ctx.rect(X(44), Y(a), 152 * u, (b - a) * u); ctx.clip();
      ctx.translate(X(44), Y(a)); ctx.scale(u, u);
      ctx.fillStyle = plate; ctx.fillRect(0, 0, 152, b - a);
      ctx.restore();
      for (const [lo, hi] of [[66, 98], [142, 174]]) R(lo, a, hi - lo, b - a, 'rgba(0,0,0,0.13)');
      for (let k = Math.ceil(a / 40) * 40; k <= b; k += 40) { R(44, k - 1, 152, 1.4, 'rgba(0,0,0,0.45)'); R(44, k + 0.4, 152, 0.8, 'rgba(190,200,206,0.25)'); }
      // Centre-line studs
      for (let k = a + 8; k < b; k += 22) R(118.5, k, 3, 6, dark > 0.25 ? '#ffe890' : '#c8c060');
      // Inner shadow the trusses throw onto the deck
      R(44, a, 7, b - a, 'rgba(0,0,0,0.30)');
      R(189, a, 7, b - a, 'rgba(0,0,0,0.16)');
    }
    // Side junctions: the deck runs out to meet the road joining there.
    const junction = (x0, x1) => {
      ctx.save();
      ctx.beginPath(); ctx.rect(X(x0), Y(44), (x1 - x0) * u, 152 * u); ctx.clip();
      ctx.translate(X(x0), Y(44)); ctx.scale(u, u);
      ctx.fillStyle = plate; ctx.fillRect(0, 0, x1 - x0, 152);
      ctx.restore();
    };
    if (joins(leftK) && spans.length) junction(0, 46);
    if (joins(rightK) && spans.length) junction(194, 240);

    // Truss: two chords, Warren diagonals, posts at the panel points with
    // gusset plates. Painted steel, lit from the top-left: a highlight on the
    // upper/left edge of each member, its own shadow on the lower/right.
    const STEEL = '#5f7682', HI = '#9ab0bc', LO = '#33434c';
    const member = (x1, y1, x2, y2, w) => {
      Ln(x1 + 1.6, y1 + 1.8, x2 + 1.6, y2 + 1.8, 'rgba(0,0,0,0.35)', w);   // its shadow
      Ln(x1, y1, x2, y2, STEEL, w);
      if (fine) Ln(x1 - w * 0.25, y1 - w * 0.25, x2 - w * 0.25, y2 - w * 0.25, HI, w * 0.3);   // hairline highlight
    };
    const truss = (xo, xi, a, b) => {
      const P0 = 30, k0 = Math.ceil(a / P0) * P0;
      // Diagonals first, chords over them
      for (let k = k0 - P0; k < b; k += P0) {
        const ya = Math.max(a, k), yb = Math.min(b, k + P0);
        if (yb - ya < 4) continue;
        const up = ((k / P0) | 0) % 2 === 0;
        member(up ? xo : xi, ya, up ? xi : xo, yb, 3);
      }
      for (const x of [xo, xi]) {
        Ln(x + 1.8, a, x + 1.8, b, 'rgba(0,0,0,0.35)', 6);
        R(x - 3, a, 6, b - a, STEEL);
        R(x - 3, a, 1.8, b - a, HI);
        R(x + 1.6, a, 1.4, b - a, LO);
      }
      for (let k = k0; k <= b; k += P0) {
        if (k < a) continue;
        R(xo - 4, k - 3, xi - xo + 8, 6, STEEL);
        R(xo - 4, k - 3, xi - xo + 8, 1.6, HI);
        R(xo - 4, k + 1.6, xi - xo + 8, 1.4, LO);
        for (const x of [xo, xi]) { R(x - 4.5, k - 4.5, 9, 9, '#56707c'); Dot(x - 2, k - 2, 0.9, '#c4d2da'); Dot(x + 2, k + 2, 0.9, '#c4d2da'); }
      }
    };
    for (const [a, b] of spans) {
      for (const [p, q] of sideRanges(joins(leftK), a, b))  truss(26, 42, p, q);
      for (const [p, q] of sideRanges(joins(rightK), a, b)) truss(214, 198, p, q);
    }
    // At a side junction, carry the joining piece's two trusses across the
    // strip outside ours, so the steelwork meets corner to corner.
    const stub = (x0, x1) => {
      for (const [yo, yi] of [[26, 42], [214, 198]]) {
        member(x0, yo, x1, yi, 3);
        for (const y of [yo, yi]) { R(x0, y - 3, x1 - x0, 6, STEEL); R(x0, y - 3, x1 - x0, 1.6, HI); R(x0, y + 1.6, x1 - x0, 1.4, LO); }
      }
    };
    if (joins(leftK) && spans.length) stub(0, 30);
    if (joins(rightK) && spans.length) stub(210, 240);

    overhead(layer !== 'deck', true);

    // Finger joints where pieces meet
    for (const [k, y] of [[startK, 0], [endK, 237]]) {
      if (k !== 'bridge' || !inSpan(y === 0 ? 0 : 240)) continue;
      R(44, y, 152, 3, '#2c3236');
      for (let x = 46; x < 194; x += 6) R(x, y + (x % 12 ? 0 : 1.2), 3, 1.8, '#8a949a');
    }

    // ── An open end: barrier across the deck ──────────────────────────
    const barrier = y => {
      R(22, y - 4, 196, 5, '#33434c');
      for (let x = 46, n = 0; x < 194; x += 16, n++) R(x, y - 10, Math.min(16, 194 - x), 6, n % 2 ? '#f0f0ea' : '#d03828');
      R(46, y - 10, 148, 1, 'rgba(0,0,0,0.3)');
      if (dark > 0.3) for (const x of [50, 190]) R(x - 1.5, y - 13, 3, 3, `rgba(255,120,60,${0.6 + 0.4 * Math.sin(t * 4 + x)})`);
    };
    if (openS) barrier(y0 + 10);
    if (openE) barrier(y1);

    // ── A corner: the far end closed off with a truss across it ────────
    const closeEnd = (yo, yi) => {
      const lo = Math.min(yo, yi) - 4, hi = Math.max(yo, yi) + 4;
      ctx.save();
      ctx.beginPath(); ctx.rect(X(44), Y(lo), 152 * u, (hi - lo) * u); ctx.clip();
      ctx.translate(X(44), Y(lo)); ctx.scale(u, u);
      ctx.fillStyle = plate; ctx.fillRect(0, 0, 152, hi - lo);
      ctx.restore();
      for (const y of [yo, yi]) { R(26, y - 3, 188, 6, STEEL); R(26, y - 3, 188, 1.6, HI); R(26, y + 1.6, 188, 1.4, LO); }
      for (let x = 26, n = 0; x < 214; x += 30, n++) member(n % 2 ? x : x + 30, yo, n % 2 ? x + 30 : x, yi, 3);
    };
    if (cornerS) closeEnd(10, 24);
    if (cornerE) closeEnd(230, 216);

    // ── Lamps on the inner chords, lit after dark ─────────────────────
    for (const [lx, ly, arm] of [[42, 75, 10], [198, 165, -10]]) {
      if (!inSpan(ly)) continue;
      if (dark > 0.25) {
        const g = ctx.createRadialGradient(X(lx + arm * 2), Y(ly), 0, X(lx + arm * 2), Y(ly), 46 * u);
        g.addColorStop(0, `rgba(255,226,160,${0.30 * dark})`); g.addColorStop(1, 'rgba(255,226,160,0)');
        ctx.fillStyle = g; ctx.fillRect(X(lx + arm * 2 - 46), Y(ly - 46), 92 * u, 92 * u);
      }
      Ln(lx, ly, lx + arm, ly, '#3a4a52', 1.6);
      R(lx + arm - 3, ly - 2, 6, 4, dark > 0.25 ? '#fff0c8' : '#c8ccd0');
    }

    ctx.restore();
  }

// ── Road ─────────────────────────────────────────────────────────────────
// A 6×6 piece of two-lane road, drawn in a 240-unit square with the lanes
// running top to bottom; a horizontal piece is the same drawing turned a
// quarter (as the bridge is). Pieces are laid freely, so each one works out
// what it touches, tile by tile along its four edges, and draws itself to
// fit — a run of them reads as one road however it was put down:
//  • Kerb only along edges with nothing beyond them; where another road (or
//    a bridge) carries on, the asphalt runs through with no seam.
//  • A turn — one end connected, a road joining along one side — becomes a
//    corner piece: the carriageway sweeps round in a quarter circle, kerb,
//    edge lines and centre line with it, and the ground shows past the
//    outside of the bend.
//  • A junction: the edge line breaks where a side road joins and curves
//    into it, and the centre line stops for the width of the crossing.
//  • A road that ends against the side of another gets a stop bar on its
//    own lane (traffic keeps right).
// Under the paint: textured asphalt, lighter shoulders outside the edge
// lines, tyre wear down each lane and the odd manhole.
let _roadTex = null;
function _roadTexture() {
  if (_roadTex) return _roadTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2b2e'; g.fillRect(0, 0, 64, 64);
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 520; k++) {
    const v = rnd();
    g.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.20)' : v < 0.9 ? 'rgba(255,255,255,0.055)' : 'rgba(190,180,150,0.10)';
    g.fillRect(rnd() * 64, rnd() * 64, 1 + (rnd() < 0.2 ? 1 : 0), 1);
  }
  _roadTex = ctx.createPattern(c, 'repeat');
  return _roadTex;
}

// Which road covers each tile. Rebuilt when the number of roads changes and
// every half second besides (a road dragged to a new spot).
let _roadMap = null, _roadMapN = -1, _roadMapAt = -1;
function _roadTileMap(t) {
  const set = EntityRegistry.getByType(T.ROAD);
  if (_roadMap && _roadMapN === set.size && t >= _roadMapAt && t - _roadMapAt < 0.5) return _roadMap;
  const m = new Map();
  for (const rd of set)
    for (let r = rd.row; r < rd.row + (rd.height || 6); r++)
      for (let c = rd.col; c < rd.col + (rd.width || 6); c++) m.set(r * COLS + c, rd);
  _roadMap = m; _roadMapN = set.size; _roadMapAt = t;
  return m;
}

// What a road piece meets, in its own frame (start = top, end = bottom,
// left/right as drawn): the road beyond each of the six tiles of each edge,
// whether each end carries on, and whether the piece is a corner.
function _roadInfo(e, t) {
  const map = _roadTileMap(t);
  if (e._ri && e._riMap === map && e._riC === e.col && e._riR === e.row) return e._ri;
  const vert = ((e._rotation || 0) % 2) === 0, c0 = e.col, r0 = e.row;
  const at = (c, r) => { const rd = map.get(r * COLS + c); return rd && rd !== e ? rd : null; };
  const S = [], E = [], L = [], R = [];
  for (let k = 0; k < 6; k++) {
    if (vert) { S.push(at(c0 + k, r0 - 1)); E.push(at(c0 + k, r0 + 6)); L.push(at(c0 - 1, r0 + k)); R.push(at(c0 + 6, r0 + k)); }
    else      { S.push(at(c0 - 1, r0 + 5 - k)); E.push(at(c0 + 6, r0 + 5 - k)); L.push(at(c0 + k, r0 + 6)); R.push(at(c0 + k, r0 - 1)); }
  }
  const mid = a => (a[1] ? 1 : 0) + (a[2] ? 1 : 0) + (a[3] ? 1 : 0) + (a[4] ? 1 : 0);
  const cnt = a => a.reduce((n, x) => n + (x ? 1 : 0), 0);
  // For the paint, a side only counts where the road on it runs ACROSS this
  // one. A road laid alongside (a wider carriageway) shares the asphalt but
  // is not a junction, so each keeps its own lines.
  const across = rd => !!rd && (((rd._rotation || 0) % 2) === 0) !== vert;
  const LX = L.map(across), RX = R.map(across);
  const startOn = mid(S) >= 2, endOn = mid(E) >= 2, lN = cnt(LX), rN = cnt(RX);
  // One end connected and a road across (most of) exactly one side: a turn.
  const corner = startOn !== endOn && (lN >= 4) !== (rN >= 4) && (lN === 0 || rN === 0)
    ? { right: rN >= 4, start: startOn } : null;
  e._ri = { vert, S, E, L, R, LX, RX, startOn, endOn, corner, startNb: S[2] || S[3], endNb: E[2] || E[3] };
  e._riMap = map; e._riC = e.col; e._riR = e.row;
  return e._ri;
}

function renderRoad(e, px, py, t) {
    if (e._irreparable) { LightningDamageSystem.renderRoadWreck(ctx, e, px, py); return; }
    if (e._bridge) { renderBridge(e, px, py, t, 'deck'); return; }   // overhead steel: render_main_loop, after trucks
    const S = 6 * TILE, u = TILE / 40, CB = 5;   // CB: kerb width, in units
    const I = _roadInfo(e, t);
    const detail = Camera.zoom > 0.45;
    const X = v => px + v * u, Y = v => py + v * u;
    const KERB = '#5c5c54', KERB_HI = '#8c8a7e';
    const WHITE = 'rgba(228,228,214,0.82)', YELLOW = '#e8c832';

    ctx.save();
    ctx.lineCap = 'butt';
    if (!I.vert) { ctx.translate(px + S / 2, py + S / 2); ctx.rotate(-Math.PI / 2); ctx.translate(-(px + S / 2), -(py + S / 2)); }
    const tex = _roadTexture();
    const line = (x1, y1, x2, y2, c, w) => { ctx.strokeStyle = c; ctx.lineWidth = w * u; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
    const arc = (cx, cy, r, a0, c, w) => { ctx.strokeStyle = c; ctx.lineWidth = w * u; ctx.beginPath(); ctx.arc(X(cx), Y(cy), r * u, a0, a0 + Math.PI / 2); ctx.stroke(); };
    // Dashes land on the same marks in every piece (8 to a piece), so a run
    // of them reads as one line.
    const dashed = (on) => { if (on) { ctx.setLineDash([18 * u, 12 * u]); } else ctx.setLineDash([]); };

    if (I.corner) {
      // ── A turn: everything swept round the inside corner ─────────────
      const cx = I.corner.right ? 240 : 0, cy = I.corner.start ? 0 : 240;
      const a0 = cx ? (cy ? Math.PI : Math.PI / 2) : (cy ? Math.PI * 1.5 : 0);
      const sector = r => { ctx.beginPath(); ctx.moveTo(X(cx), Y(cy)); ctx.arc(X(cx), Y(cy), r * u, a0, a0 + Math.PI / 2); ctx.closePath(); };
      ctx.fillStyle = KERB; sector(240); ctx.fill();
      ctx.fillStyle = tex;  sector(240 - CB); ctx.fill();
      arc(cx, cy, 240 - 0.6, a0, KERB_HI, 1.2);
      // shoulders either side of the carriageway, tyre wear down each lane
      ctx.save(); sector(240 - CB); ctx.clip();
      arc(cx, cy, 20, a0, 'rgba(255,255,255,0.035)', 40);
      arc(cx, cy, 217.5, a0, 'rgba(255,255,255,0.035)', 35);
      for (const r of [62, 98, 142, 178]) arc(cx, cy, r, a0, 'rgba(0,0,0,0.10)', 9);
      ctx.restore();
      arc(cx, cy, 40, a0, WHITE, 1.6);
      arc(cx, cy, 200, a0, WHITE, 1.6);
      dashed(true); ctx.lineDashOffset = 6 * u;
      arc(cx, cy, 120, a0, YELLOW, 2.4);
      dashed(false); ctx.lineDashOffset = 0;
    } else {
      // ── Kerb, then asphalt run out to every edge another road is on ───
      ctx.fillStyle = KERB; ctx.fillRect(X(0), Y(0), 240 * u, 240 * u);
      ctx.fillStyle = KERB_HI;
      ctx.fillRect(X(0), Y(0), 240 * u, 1.2 * u); ctx.fillRect(X(0), Y(238.8), 240 * u, 1.2 * u);
      ctx.fillRect(X(0), Y(0), 1.2 * u, 240 * u); ctx.fillRect(X(238.8), Y(0), 1.2 * u, 240 * u);
      ctx.fillStyle = tex;
      ctx.beginPath();
      ctx.rect(X(CB), Y(CB), (240 - 2 * CB) * u, (240 - 2 * CB) * u);
      for (let k = 0; k < 6; k++) {
        const a = Math.max(CB, k * 40), b = Math.min(240 - CB, k * 40 + 40);
        if (I.S[k]) ctx.rect(X(a), Y(0), (b - a) * u, CB * u);
        if (I.E[k]) ctx.rect(X(a), Y(240 - CB), (b - a) * u, CB * u);
        if (I.L[k]) ctx.rect(X(0), Y(a), CB * u, (b - a) * u);
        if (I.R[k]) ctx.rect(X(240 - CB), Y(a), CB * u, (b - a) * u);
      }
      if (I.S[0] && I.L[0]) ctx.rect(X(0), Y(0), CB * u, CB * u);
      if (I.S[5] && I.R[0]) ctx.rect(X(240 - CB), Y(0), CB * u, CB * u);
      if (I.E[0] && I.L[5]) ctx.rect(X(0), Y(240 - CB), CB * u, CB * u);
      if (I.E[5] && I.R[5]) ctx.rect(X(240 - CB), Y(240 - CB), CB * u, CB * u);
      ctx.fill();

      // Contiguous stretches along the piece (in tiles) where `ok(i)` holds.
      const runs = (ok) => { const out = []; for (let i = 0; i < 6; i++) { if (!ok(i)) continue; const last = out[out.length - 1]; if (last && last[1] === i) last[1] = i + 1; else out.push([i, i + 1]); } return out; };
      const plain = runs(i => !I.LX[i] && !I.RX[i]);

      // ── Shoulders and tyre wear, where the road just runs straight ────
      for (const [a, b] of plain) {
        const y = a * 40, h = (b - a) * 40;
        ctx.fillStyle = 'rgba(255,255,255,0.035)';
        ctx.fillRect(X(CB), Y(y), (40 - CB) * u, h * u); ctx.fillRect(X(200), Y(y), (40 - CB) * u, h * u);
        ctx.fillStyle = 'rgba(0,0,0,0.10)';
        for (const x of [57.5, 93.5, 137.5, 173.5]) ctx.fillRect(X(x), Y(y), 9 * u, h * u);
      }

      // ── Ends: a stop bar where this road runs into the side of another ─
      const meetsSide = (nb) => {
        if (!nb || (((nb._rotation || 0) % 2) === 0) === I.vert) return false;
        return nb._bridge || !_roadInfo(nb, t).corner;
      };
      const stopS = I.startOn && meetsSide(I.startNb), stopE = I.endOn && meetsSide(I.endNb);
      if (stopS) line(120, 9, 200, 9, WHITE, 5);     // the lane heading for the top is the right-hand one
      if (stopE) line(40, 231, 120, 231, WHITE, 5);

      // ── Edge lines: broken where a side road joins, curving into it ───
      for (const [M, ex, out] of [[I.LX, 40, 0], [I.RX, 200, 240]]) {
        for (const [a, b] of runs(i => !M[i])) line(ex, a * 40, ex, b * 40, WHITE, 1.6);
        for (const [a, b] of runs(i => !!M[i])) {
          if (b - a < 2) continue;
          // quarter circles round the two corners of the mouth
          arc(out, a * 40, 40, out ? Math.PI / 2 : 0, WHITE, 1.6);
          arc(out, b * 40, 40, out ? Math.PI : Math.PI * 1.5, WHITE, 1.6);
        }
      }

      // ── Centre line: not across a junction, nor through a stop bar ────
      dashed(true);
      for (const [a, b] of plain) {
        const y0 = Math.max(a * 40, stopS ? 14 : 0), y1 = Math.min(b * 40, stopE ? 226 : 240);
        if (y1 <= y0) continue;
        ctx.lineDashOffset = ((y0 - 6) % 30 + 30) % 30 * u;
        line(120, y0, 120, y1, YELLOW, 2.4);
      }
      dashed(false); ctx.lineDashOffset = 0;

      // ── A manhole on some pieces ──────────────────────────────────────
      if (detail && plain.length === 1 && plain[0][1] - plain[0][0] === 6) {
        const h = Math.sin(e.col * 12.9898 + e.row * 78.233) * 43758.5453, f = h - Math.floor(h);
        if (f < 0.34) {
          const mx = f < 0.17 ? 80 : 160, my = 50 + ((f * 997) % 1) * 140;
          ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(X(mx + 0.8), Y(my + 0.8), 7 * u, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#3c3e42'; ctx.beginPath(); ctx.arc(X(mx), Y(my), 7 * u, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(150,154,160,0.5)'; ctx.lineWidth = 0.8 * u;
          ctx.beginPath(); ctx.arc(X(mx), Y(my), 5 * u, 0, Math.PI * 2); ctx.stroke();
          line(mx - 3.4, my, mx + 3.4, my, 'rgba(150,154,160,0.5)', 0.8);
        }
      }
    }
    ctx.restore();

    // ── Re-draw any wires running under this road ──────────────────────
    // The dedicated wire pass runs BEFORE roads (so buildings layer on top
    // of wires normally), but unlike pipes, wires are never revisited later
    // in the main entity loop — so without this, the asphalt draw above
    // would permanently cover any wire crossing under the road.
    const fw = e.width || 6, fh = e.height || 6;
    for (let rr = e.row; rr < e.row + fh; rr++) {
      for (let cc = e.col; cc < e.col + fw; cc++) {
        const under = GridManager.getEntity(cc, rr);
        if (!under || under.type !== T.WIRE) continue;
        const { x: wx, y: wy } = GridManager.tileToWorld(cc, rr);
        if (under._underWater) renderWater(under._underWater, wx, wy, t);
        renderWire(under, wx, wy, t);
        if (under._weatherFailed) renderWireSpark(under, wx, wy, t);
      }
    }
  }

function renderCellTower(e, px, py, t) {
    // Cell Tower — a 4×4 fenced cell site, authored in a 40-unit tile
    // (160×160). A tapered galvanised monopole carries a three-sector antenna
    // platform (three panel antennas per sector, each with its radio head), a
    // smaller second tier and two microwave backhaul dishes, capped by a
    // lightning rod and a red aviation light. At its foot, inside a
    // chain-link fence: the equipment shelter with its A/C unit, the cable
    // ice bridge across to the mast, and a battery cabinet. Powered, each
    // sector sends pulses out along its bearing and the shelter LEDs chatter.
    const u = TILE / 40;
    const X = (v) => px + v*u, Y = (v) => py + v*u;
    const on = !!e.powered;
    const detail = Camera.zoom > 0.5;
    const dark = typeof DayNight !== 'undefined' ? DayNight.darkness() : 0;
    const C = (lit, unlit) => on ? lit : unlit;
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), w*u, h*u); };
    const L = (x1, y1, x2, y2, c, w) => { ctx.strokeStyle = c; ctx.lineWidth = w*u; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
    const E = (x, y, rx, ry, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(X(x), Y(y), rx*u, ry*u, 0, 0, Math.PI*2); ctx.fill(); };
    const MX = 80, BASE = 128, TOP = 24;
    const halfW = (y) => 4.5 - 2.5 * (BASE - y) / (BASE - TOP);   // monopole taper

    ctx.save();
    ctx.lineCap = 'round';

    // ── Gravel compound ────────────────────────────────────────────────
    ctx.fillStyle = C('#3b3e3b', '#2a2c2a');
    ctx.beginPath(); ctx.roundRect(X(6), Y(62), 148*u, 92*u, 4*u); ctx.fill();
    if (detail) for (let k = 0; k < 70; k++) {
      R(10 + (k*73) % 140, 66 + (k*41) % 84, 1.2, 1.2, k % 3 ? 'rgba(170,170,160,0.16)' : 'rgba(10,10,8,0.25)');
    }

    // ── Chain-link fence with a double gate at the front ───────────────
    const post = C('#9aa0a6', '#55595d');
    ctx.save();
    ctx.setLineDash([1.4*u, 1.4*u]);
    ctx.strokeStyle = C('rgba(175,182,188,0.5)', 'rgba(90,94,98,0.45)'); ctx.lineWidth = 2.2*u;
    ctx.beginPath();
    ctx.moveTo(X(70), Y(151)); ctx.lineTo(X(9), Y(151)); ctx.lineTo(X(9), Y(65));
    ctx.lineTo(X(151), Y(65)); ctx.lineTo(X(151), Y(151)); ctx.lineTo(X(90), Y(151));
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = post; ctx.lineWidth = 0.6*u;
    ctx.beginPath();
    ctx.moveTo(X(70), Y(149.8)); ctx.lineTo(X(9), Y(149.8)); ctx.lineTo(X(9), Y(63.8));
    ctx.lineTo(X(151), Y(63.8)); ctx.lineTo(X(151), Y(149.8)); ctx.lineTo(X(90), Y(149.8));
    ctx.stroke();
    for (let x = 9; x <= 151; x += 14.2) {
      R(x - 0.8, 62, 1.6, 4.5, post);
      if (x < 69 || x > 91) R(x - 0.8, 148, 1.6, 4.5, post);
    }
    for (let y = 79.2; y < 150; y += 14.2) { R(8.2, y - 2, 1.6, 4.5, post); R(150.2, y - 2, 1.6, 4.5, post); }
    R(68.4, 146, 2, 7, post); R(89.6, 146, 2, 7, post);            // gate posts
    for (const gx of [70.5, 80.5]) {                                // gate leaves
      ctx.strokeStyle = post; ctx.lineWidth = 0.7*u;
      ctx.strokeRect(X(gx), Y(147), 9*u, 5*u);
      L(gx, 152, gx + 9, 147, post, 0.5);
    }
    R(76, 144.5, 8, 4, C('#e8d890', '#5a5436'));                    // warning sign on the gate
    R(76, 144.5, 8, 1, C('#c02020', '#4a2020'));

    // ── Equipment shelter ──────────────────────────────────────────────
    R(16, 138, 42, 3, 'rgba(0,0,0,0.25)');
    R(14, 100, 40, 38, C('#c8cbc2', '#6e706a'));
    for (const sx of [24, 34, 44]) L(sx, 101, sx, 138, 'rgba(0,0,0,0.13)', 0.4);
    R(12, 95, 44, 6, C('#7a7e82', '#45484c'));                      // roof
    R(12, 100, 44, 1.2, C('#4a4e52', '#2a2c2e'));
    R(18, 114, 10, 24, C('#6a7a88', '#3a434c'));                    // door
    R(25.5, 125, 1.4, 1.4, C('#d8dce0', '#6a6e72'));
    R(19, 110, 8, 2.2, on && dark > 0.3 ? '#fff2c0' : C('#5a5e62', '#3a3c3e'));   // door light
    R(31, 104, 17, 4, '#1a1e22');                                   // status panel
    for (let k = 0; k < 4; k++) {
      const lit = on && Math.sin(t*(5 + k*1.7) + k*2.3) > -0.2;
      R(32.4 + k*3.9, 105.3, 2, 1.4, lit ? ['#40ff80', '#40c0ff', '#40ff80', '#ffc040'][k] : '#2a2e32');
    }
    R(36, 116, 16, 18, C('#9aa0a4', '#55595c'));                    // A/C unit
    E(44, 125, 6, 6, C('#2a2e32', '#1a1c1e'));
    {
      const a = on ? t*9 : 0.5;
      for (let b = 0; b < 3; b++) {
        const ba = a + b*2.094;
        L(44, 125, 44 + Math.cos(ba)*5, 125 + Math.sin(ba)*5, C('#b8c0c6', '#4a4e52'), 1.1);
      }
      E(44, 125, 1.3, 1.3, C('#6a7076', '#3a3e42'));
    }
    R(30.5, 116, 3.5, 3.5, C('#f0c020', '#5a4a10'));                // hazard placard

    // ── Battery cabinet with a GPS puck ────────────────────────────────
    R(106, 136, 34, 3, 'rgba(0,0,0,0.25)');
    R(104, 110, 32, 26, C('#7e868c', '#44484c'));
    L(120, 111, 120, 135, 'rgba(0,0,0,0.25)', 0.5);
    for (let v = 0; v < 4; v++) L(108, 116 + v*3, 117, 116 + v*3, 'rgba(0,0,0,0.25)', 0.5);
    R(123, 115, 9, 6, '#1a1e22');
    R(124, 116, 7 * (on ? 0.55 + 0.45*Math.abs(Math.sin(t*0.4)) : 0.1), 4, C('#40d070', '#2a3a2e'));   // charge bar
    E(130, 108.5, 2.5, 1.4, C('#e8ecee', '#6a6e72'));

    // ── Ice bridge carrying the feeders across to the mast ─────────────
    L(66, 107, 66, 138, C('#6a7076', '#3a3e42'), 1.3);
    L(54, 103, MX - 4.5, 103, C('#8a9096', '#4a4e52'), 1);
    L(54, 107, MX - 4.5, 107, C('#8a9096', '#4a4e52'), 1);
    for (let rx = 56; rx < MX - 4; rx += 3.5) L(rx, 103, rx, 107, C('#6a7076', '#3a3e42'), 0.5);
    L(56, 105, MX - 5, 105, '#15171a', 1.2);                        // feeder bundle

    // ── Mast foundation ────────────────────────────────────────────────
    R(69, 124, 22, 11, C('#8a8a84', '#55554f'));
    R(69, 124, 22, 3, C('#aaaaa2', '#65655f'));
    for (const [bx, by] of [[71, 129], [87, 129], [71, 132.5], [87, 132.5]]) R(bx, by, 1.4, 1.4, '#3a3a38');

    // ── Monopole ───────────────────────────────────────────────────────
    const mg = ctx.createLinearGradient(X(MX - 5), 0, X(MX + 5), 0);
    mg.addColorStop(0, C('#5e646a', '#34383c'));
    mg.addColorStop(0.45, C('#d2d8dc', '#666c70'));
    mg.addColorStop(1, C('#50565c', '#2e3236'));
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.moveTo(X(MX - 4.5), Y(BASE)); ctx.lineTo(X(MX - 2), Y(TOP));
    ctx.lineTo(X(MX + 2), Y(TOP)); ctx.lineTo(X(MX + 4.5), Y(BASE));
    ctx.closePath(); ctx.fill();
    for (const fy of [104, 78, 52]) { const hw = halfW(fy) + 0.8; R(MX - hw, fy, hw*2, 1.6, C('#8a9096', '#4a4e52')); }
    L(MX - halfW(100) + 0.8, 100, MX - halfW(32) + 0.6, 32, '#1a1c1e', 1);   // feeder run up the pole
    if (detail) for (let y = BASE - 8, k = 0; y > TOP + 10; y -= 5, k++) {    // climbing pegs
      const hw = halfW(y);
      R(k % 2 ? MX + hw : MX - hw - 1.6, y, 1.6, 0.7, C('#a8aeb2', '#55595c'));
    }

    // ── Microwave backhaul dishes ──────────────────────────────────────
    const dish = (dx, dy, dir) => {
      L(MX, dy, dx, dy, C('#6a7076', '#3a3e42'), 1.3);
      E(dx, dy, 3.2, 7.5, C('#aeb4b8', '#5a5e62'));
      E(dx + dir*0.9, dy, 2.3, 6.3, C('#f0f2f2', '#7a7e82'));
      E(dx + dir*1.4, dy - 1.5, 0.9, 2, C('rgba(255,255,255,0.8)', 'rgba(140,140,140,0.3)'));
    };
    dish(MX - 11, 66, -1);
    dish(MX + 11, 86, 1);

    // ── Second antenna tier ────────────────────────────────────────────
    ctx.strokeStyle = C('#7a8086', '#44484c'); ctx.lineWidth = 1*u;
    ctx.beginPath(); ctx.ellipse(X(MX), Y(47), 14*u, 3.6*u, 0, 0, Math.PI*2); ctx.stroke();
    for (const [ax, sh] of [[MX - 16, 1], [MX - 11.5, 1], [MX + 9, -1], [MX + 13.5, -1]]) {
      R(ax, 36, 3, 13, C('#e4e8ea', '#7a7e82'));
      R(sh > 0 ? ax + 1.8 : ax, 36, 1.2, 13, 'rgba(0,0,0,0.12)');
    }

    // ── Main three-sector platform ─────────────────────────────────────
    const PY = 28, PRX = 30, PRY = 8;
    const sectors = [Math.PI/2 - 2.094, Math.PI/2 + 2.094, Math.PI/2];   // back-right, back-left, front
    const drawSector = (a) => {
      const sx = MX + Math.cos(a)*PRX, sy = PY + Math.sin(a)*PRY;
      L(MX, PY, sx, sy, C('#7a8086', '#44484c'), 1.1);                // support arm
      for (let k = -1; k <= 1; k++) {
        const ox = -Math.sin(a)*k*6, oy = Math.cos(a)*k*6*PRY/PRX;
        const x = sx + ox, y = sy + oy;
        R(x - 1.6, y + 3, 3.2, 4, C('#2a2e32', '#1a1c1e'));           // radio head
        R(x - 2.2, y - 14, 4.4, 18, C('#eceff1', '#7e8286'));         // panel antenna
        R(x + 0.8, y - 14, 1.4, 18, 'rgba(0,0,0,0.13)');
        R(x - 2.2, y - 14, 4.4, 1.2, C('#c8ccd0', '#6a6e72'));
      }
    };
    ctx.strokeStyle = C('#8a9096', '#4a4e52'); ctx.lineWidth = 1.6*u;
    ctx.beginPath(); ctx.ellipse(X(MX), Y(PY), PRX*u, PRY*u, 0, Math.PI, Math.PI*2); ctx.stroke();   // back rail
    drawSector(sectors[0]);
    drawSector(sectors[1]);
    R(MX - 2.6, TOP - 2, 5.2, 3, C('#8a9096', '#4a4e52'));             // pole cap
    ctx.strokeStyle = C('#8a9096', '#4a4e52'); ctx.lineWidth = 1.6*u;
    ctx.beginPath(); ctx.ellipse(X(MX), Y(PY), PRX*u, PRY*u, 0, 0, Math.PI); ctx.stroke();           // front rail
    drawSector(sectors[2]);

    // ── Lightning rod and aviation light ───────────────────────────────
    L(MX, TOP - 2, MX, 6, C('#a8aeb2', '#55595c'), 0.8);
    const blink = Math.pow(Math.max(0, Math.sin(t*1.8)), 3);
    if (on && detail && blink > 0.02) drawGlowHalo(X(MX), Y(7), TILE*0.28, [[0, '#ff5a5a'], [1, 'transparent']], blink*0.6);
    E(MX, 7, 1.9, 1.9, on ? `rgba(255,80,80,${(0.35 + 0.65*blink).toFixed(3)})` : '#3a2028');

    // ── Signal pulses out along each sector's bearing ──────────────────
    if (on && Camera.zoom > 0.4) {
      ctx.save();
      ctx.lineWidth = 1.2*u;
      sectors.forEach((a, i) => {
        const sx = MX + Math.cos(a)*PRX, sy = PY + Math.sin(a)*PRY - 5;
        for (let k = 0; k < 2; k++) {
          const ph = (t*0.65 + k*0.5 + i*0.33) % 1;
          const r = 8 + ph*60;
          ctx.strokeStyle = `rgba(90,205,255,${((1 - ph)*0.38).toFixed(3)})`;
          ctx.beginPath(); ctx.ellipse(X(sx), Y(sy), r*u, r*0.55*u, 0, a - 0.45, a + 0.45); ctx.stroke();
        }
      });
      ctx.restore();
    }

    // Reliability warning dot — same convention as the other powered stations.
    if (e.reliability !== undefined && e.reliability < 80) {
      E(146, 58, 2.5, 2.5, e.reliability < 50 ? '#ff4444' : '#f0a020');
    }

    ctx.restore();
  }

function renderFiberHub(e, px, py, t) {
    // Fiber Hub — the 5×5 MK3 carrier exchange. A flat-roofed data hall
    // with rooftop chillers and the hub's spoke emblem painted on the roof,
    // a lit entrance and sign, two backhaul satellite dishes that slowly
    // track, a row of splice cabinets, and fiber trenches running out to
    // the pad edges where coloured light pulses race outward to the zone it
    // serves. When the grid drops it the halls go dark and the generator
    // container coughs smoke.
    // Drawn in its own TILE*w × TILE*h pixel space, laid out in a 200-unit
    // square scaled by `u`. Plain fills and strokes; motion detail is
    // skipped when zoomed out.
    const W = TILE*(e.width||5);
    const u = W / 200;
    const on = e.powered;
    const fine = Camera.zoom > 0.5;
    const dark = typeof DayNight !== 'undefined' ? DayNight.darkness() : 0;
    const pulse = 0.5 + 0.5*Math.sin(t*2.2);
    const X = (v) => px + v*u, Y = (v) => py + v*u;
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), w*u, h*u); };
    const dot = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(x), Y(y), r*u, 0, Math.PI*2); ctx.fill(); };
    const ring = (x, y, r, c, w) => { ctx.strokeStyle = c; ctx.lineWidth = (w || 1)*u; ctx.beginPath(); ctx.arc(X(x), Y(y), r*u, 0, Math.PI*2); ctx.stroke(); };
    const ln = (x1, y1, x2, y2, c, w) => { ctx.strokeStyle = c; ctx.lineWidth = (w || 1)*u; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
    const C = (lit, unlit) => on ? lit : unlit;
    const FIBER = ['#40e0ff', '#ff50d0', '#a0ff40'];

    ctx.save();

    // ── Grass verge and concrete pad ─────────────────────────────────
    R(2, 2, 196, 196, C('#2e4a30', '#1c2a1e'));
    R(8, 8, 184, 184, C('#5a6268', '#34383c'));
    if (fine) {
      ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 0.6*u;
      ctx.beginPath();
      for (let k = 40; k < 192; k += 32) {
        ctx.moveTo(X(k), Y(8)); ctx.lineTo(X(k), Y(192));
        ctx.moveTo(X(8), Y(k)); ctx.lineTo(X(192), Y(k));
      }
      ctx.stroke();
    }
    ctx.strokeStyle = on ? `rgba(64,224,255,${0.25 + pulse*0.25})` : 'rgba(22,32,40,0.9)';
    ctx.lineWidth = 1.2*u;
    ctx.strokeRect(X(8), Y(8), 184*u, 184*u);

    // ── Fiber trenches: edge to edge, and down to the bottom edge ────
    R(2, 136, 196, 6, C('#3a4046', '#24272a'));
    R(121, 142, 6, 56, C('#3a4046', '#24272a'));
    if (fine) {
      for (let k = 0; k < 6; k++) R(12 + k*32, 137, 10, 4, C('#6a737a', '#303438'));
      for (let k = 0; k < 2; k++) R(122, 152 + k*24, 4, 10, C('#6a737a', '#303438'));
    }
    if (on && fine) {
      for (let i = 0; i < 9; i++) {
        const ph = (t*0.35 + i/9) % 1, dir = i % 3;
        ctx.globalAlpha = 1 - ph*0.7;
        ctx.fillStyle = FIBER[Math.floor(i/3) % 3];
        if (dir === 0)      ctx.fillRect(X(124 - ph*122 - 3), Y(138), 6*u, 2*u);   // west
        else if (dir === 1) ctx.fillRect(X(124 + ph*74 - 3),  Y(138), 6*u, 2*u);   // east
        else                ctx.fillRect(X(123), Y(139 + ph*59 - 3), 2*u, 6*u);    // south
      }
      ctx.globalAlpha = 1;
    }

    // ── Data hall roof ───────────────────────────────────────────────
    R(16, 16, 112, 98, 'rgba(0,0,0,0.3)');
    R(12, 12, 112, 98, C('#4e5760', '#2a2e33'));                   // parapet
    R(16, 16, 104, 94, C('#3c444c', '#1f2226'));                   // membrane
    if (fine) for (let k = 1; k < 7; k++) ln(16, 16 + k*13, 120, 16 + k*13, 'rgba(0,0,0,0.15)', 0.5);
    // Rooftop chillers
    for (let k = 0; k < 3; k++) {
      const cx0 = 22 + k*33, cy0 = 22, fx = cx0 + 14, fy = cy0 + 13;
      R(cx0, cy0, 28, 26, C('#7a848c', '#34383c'));
      R(cx0 + 2, cy0 + 2, 24, 22, C('#5c666e', '#26292c'));
      dot(fx, fy, 9, C('#1c2126', '#101214'));
      ring(fx, fy, 9, C('#9aa6b0', '#2a2e32'), 0.8);
      const a0 = on ? t*6 + k : k;
      for (let b = 0; b < 4; b++) {
        const ba = a0 + b*Math.PI/2;
        ln(fx, fy, fx + Math.cos(ba)*7.5, fy + Math.sin(ba)*7.5, C('#b8c4ce', '#34383c'), 1.2);
      }
      dot(fx, fy, 2, C('#8a949c', '#2a2e32'));
    }
    // Skylights over the meet-me room
    for (let k = 0; k < 4; k++) {
      R(24 + k*18, 58, 12, 10, on ? `rgba(120,230,255,${0.35 + 0.15*Math.sin(t*1.5 + k)})` : '#1a1e22');
    }
    // Roof hatch
    R(98, 56, 16, 14, C('#6a747c', '#2c3034'));
    R(100, 58, 12, 10, C('#525c64', '#222528'));
    // The hub's spoke emblem, painted large enough to read from the map
    {
      const ex = 66, ey = 90, spin = on ? t*0.3 : 0;
      ring(ex, ey, 14, C('rgba(64,224,255,0.35)', 'rgba(40,48,54,0.8)'), 1);
      for (let s = 0; s < 6; s++) {
        const a = spin + s*Math.PI/3;
        ln(ex, ey, ex + Math.cos(a)*11, ey + Math.sin(a)*11, C(FIBER[s % 3], '#2a3036'), 1.6);
        dot(ex + Math.cos(a)*11, ey + Math.sin(a)*11, 2.2, C(FIBER[s % 3], '#2a3036'));
      }
      dot(ex, ey, 4, on ? `rgba(232,251,255,${0.7 + 0.3*pulse})` : '#2a3036');
    }

    // ── Front facade: glazing band, sign, entrance ───────────────────
    R(12, 110, 112, 22, C('#26323e', '#15191e'));
    R(16, 113, 104, 6, on ? (dark > 0.3 ? 'rgba(140,235,255,0.85)' : 'rgba(90,150,180,0.7)') : '#0e1216');
    for (let k = 1; k < 13; k++) ln(16 + k*8, 113, 16 + k*8, 119, 'rgba(0,0,0,0.4)', 0.6);
    R(18, 121, 62, 9, '#0a1216');
    ctx.strokeStyle = on ? `rgba(64,224,255,${0.5 + 0.4*pulse})` : '#1c2a30'; ctx.lineWidth = 0.8*u;
    ctx.strokeRect(X(18), Y(121), 62*u, 9*u);
    ctx.fillStyle = C('#bff6ff', '#2a3a40'); ctx.font = `bold ${6.5*u}px monospace`; ctx.textAlign = 'center';
    ctx.fillText('FIBER HUB', X(49), Y(128.2));
    R(84, 119, 28, 3, C('#8a949c', '#2a2e32'));                    // canopy
    R(88, 122, 20, 10, on ? (dark > 0.3 ? '#d8f6ff' : '#9ad8ea') : '#1e2a30');
    ln(98, 122, 98, 132, '#26323e', 0.8);

    // ── Backhaul dishes on plinths, fed by cable ladders ─────────────
    for (let k = 0; k < 2; k++) {
      const dx = 160, dy = 36 + k*44;
      ln(124, dy, 146, dy, C('#7a828a', '#2c3034'), 2.5);
      R(dx - 12, dy - 12, 24, 24, C('#6a737a', '#2e3236'));
      const aim = (k ? 2.4 : 0.7) + (on ? Math.sin(t*0.25 + k*2)*0.35 : 0);
      ctx.save();
      ctx.translate(X(dx), Y(dy)); ctx.rotate(aim);
      ctx.fillStyle = C('#dfe4e8', '#4a4e52');
      ctx.beginPath(); ctx.ellipse(0, 0, 15*u, 10*u, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = C('#b8c0c6', '#3a3e42');
      ctx.beginPath(); ctx.ellipse(-2*u, 0, 10*u, 6.5*u, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = C('#8a949c', '#2a2e32'); ctx.lineWidth = 1*u;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(13*u, 0); ctx.stroke();
      ctx.fillStyle = on ? `rgba(64,224,255,${0.6 + 0.4*Math.sin(t*4 + k)})` : '#1a2a30';
      ctx.beginPath(); ctx.arc(13*u, 0, 2*u, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    // ── Standby generator container ──────────────────────────────────
    R(138, 104, 50, 26, 'rgba(0,0,0,0.3)');
    R(134, 100, 50, 26, C('#c8a040', '#6a5628'));
    R(134, 100, 50, 3, C('#e0bc60', '#7a6634'));
    for (let k = 0; k < 8; k++) ln(139 + k*4, 106, 139 + k*4, 121, 'rgba(0,0,0,0.3)', 0.8);
    dot(176, 108, 3.5, '#2a2a2a');
    if (!on) {
      if (fine) for (let q = 0; q < 4; q++) {
        const ph = (t*0.6 + q/4) % 1;
        dot(176 + ph*6, 108 - ph*20, 3 + ph*5, `rgba(80,80,80,${0.45*(1 - ph)})`);
      }
      dot(170, 120, 2, `rgba(255,170,30,${0.5 + 0.5*Math.sin(t*5)})`);
    } else {
      dot(170, 120, 2, '#40c060');
    }

    // ── Splice cabinets dropping fiber into the trench ───────────────
    for (let k = 0; k < 5; k++) {
      const x = 16 + k*20;
      ln(x + 7, 150, x + 7, 142, on ? 'rgba(64,224,255,0.55)' : '#2a3036', 0.8);
      R(x + 2, 152, 14, 22, 'rgba(0,0,0,0.3)');
      R(x, 150, 14, 22, C('#6c7a70', '#2e3430'));
      R(x + 1, 151, 12, 2, C('#8a988e', '#3a403c'));
      ln(x + 7, 154, x + 7, 170, 'rgba(0,0,0,0.3)', 0.5);
      for (let l = 0; l < 3; l++) {
        const lit = on && Math.sin(t*3 + k*1.7 + l*0.9) > 0.1;
        R(x + 3, 156 + l*5, 3, 2, lit ? FIBER[(k + l) % 3] : '#1a2220');
      }
    }

    // ── Handhole covers ──────────────────────────────────────────────
    for (const hx of [146, 176]) {
      dot(hx, 154, 6, C('#4a5258', '#26292c'));
      ring(hx, 154, 4, 'rgba(0,0,0,0.3)', 0.6);
    }

    // ── Uplink board ─────────────────────────────────────────────────
    // This used to read the flat '+$8/s' income, which only repeated what the
    // info panel already says and told you nothing about the hub itself. A
    // carrier exchange's sign is its throughput, so it now reads out what the
    // hub is pushing against the 100G uplink named on the line beneath it:
    // traffic follows the city's day (quiet before dawn, peaking late
    // afternoon), falls away with the hub's reliability, and is jittered per
    // hub so two of them never read identically.
    const fhSeed = Math.abs(Math.sin((e.col || 0)*12.9898 + (e.row || 0)*78.233));
    const fhHour = (typeof DayNight !== 'undefined' && DayNight.hour) ? DayNight.hour() : 12;
    const fhDay  = 0.55 + 0.45*Math.sin((fhHour - 10) / 24 * Math.PI * 2);
    const fhRel  = e.reliability !== undefined ? Math.max(0.35, e.reliability / 100) : 1;
    const fhUtil = Math.max(0.06, Math.min(0.99,
      fhDay * fhRel * (0.85 + fhSeed*0.30) + 0.04*Math.sin(t*0.7 + fhSeed*6)));
    const fhGbps = Math.max(1, Math.round(100 * fhUtil));
    R(136, 170, 52, 20, '#0a1216');
    ctx.strokeStyle = on ? `rgba(64,224,255,${0.4 + 0.4*pulse})` : '#1c2a30'; ctx.lineWidth = 0.8*u;
    ctx.strokeRect(X(136), Y(170), 52*u, 20*u);
    ctx.fillStyle = on ? 'rgba(64,224,255,0.95)' : '#2a3a40';
    // Fitted to the board rather than trusting the digits to stay short —
    // '100 Gb/s' is two characters wider than the old '+$8/s' ever was.
    const fhText = on ? `${fhGbps} Gb/s` : 'NO GRID';
    let fhSize = 8;
    ctx.font = `bold ${fhSize*u}px monospace`;
    const fhMaxW = 48*u;                                   // 52-wide board, 2 units of margin each side
    const fhW = ctx.measureText(fhText).width;
    if (fhW > fhMaxW) { fhSize *= fhMaxW / fhW; ctx.font = `bold ${fhSize*u}px monospace`; }
    ctx.fillText(fhText, X(162), Y(181));
    ctx.font = `bold ${4*u}px monospace`;
    ctx.fillStyle = on ? 'rgba(160,255,120,0.85)' : 'rgba(255,170,30,0.8)';
    ctx.fillText(on ? '100G UPLINK' : 'ON STANDBY', X(162), Y(187));
    ctx.textAlign = 'left';

    // ── Pad lights after dark ────────────────────────────────────────
    if (on && dark > 0.3) {
      for (const [lx, ly] of [[12, 188], [188, 12], [188, 188], [130, 12]]) {
        dot(lx, ly, 10, `rgba(255,240,200,${0.08*dark})`);
        dot(lx, ly, 2, 'rgba(255,245,215,0.95)');
      }
    }

    // Reliability warning dot — same convention as the other powered stations.
    if (e.reliability !== undefined && e.reliability < 80) {
      dot(192, 8, 3, e.reliability < 50 ? '#ff4444' : '#f0a020');
    }

    ctx.restore();
  }

// City Hall material palettes, keyed by CityInfo hall style.
const GOV_HALL_PALETTES = {
  beaux:     { stone: '#d8d0bc', stoneSh: '#b9af98', trim: '#f1ebdb', slate: '#3e4652', slateHi: '#4c5562', dome: '#5f9e8a', domeSh: '#3f7464', domeHi: '#8cc4b0', gold: '#d4af37', glass: '#6a88a4' },
  gothic:    { stone: '#8a8478', stoneSh: '#6c665c', trim: '#b4ad9e', slate: '#2a2e36', slateHi: '#3a3f4a', dome: '#3a3f4a', domeSh: '#22262e', domeHi: '#5a6070', gold: '#c9a13a', glass: '#4e6478' },
  deco:      { stone: '#ece2c8', stoneSh: '#cbbd98', trim: '#fbf4e2', slate: '#2c3a44', slateHi: '#3c4c58', dome: '#c9a13a', domeSh: '#9a7a24', domeHi: '#f0d488', gold: '#e2b640', glass: '#5f8a9a' },
  byzantine: { stone: '#dcb98a', stoneSh: '#b8956a', trim: '#f4e0bc', slate: '#8a3a2a', slateHi: '#a04a36', dome: '#d9a92e', domeSh: '#a07818', domeHi: '#ffe9a0', gold: '#e8c040', glass: '#5e7e8c' },
  modern:    { stone: '#b8bcc0', stoneSh: '#94989e', trim: '#e2e6ea', slate: '#2e3438', slateHi: '#3e464c', dome: '#6a7a86', domeSh: '#4a5660', domeHi: '#9aaab6', gold: '#c0c6cc', glass: '#5a8ab0' },
  // stone = the walls; for colonial that's red brick, for solarpunk timber
  colonial:  { stone: '#9a4a38', stoneSh: '#7a3628', trim: '#f4f0e6', slate: '#3a3e44', slateHi: '#4c5058', dome: '#f4f0e6', domeSh: '#c8c2b4', domeHi: '#ffffff', gold: '#c9a13a', glass: '#5e7a94' },
  chateau:   { stone: '#e6dcc6', stoneSh: '#c4b89c', trim: '#f6f0e0', slate: '#34485e', slateHi: '#46607a', dome: '#34485e', domeSh: '#22324a', domeHi: '#6a86a4', gold: '#d4af37', glass: '#62809c' },
  // pagoda trim is the red lacquer; slate is green-glazed roof tile
  pagoda:    { stone: '#e4d6b8', stoneSh: '#c2b290', trim: '#b8342a', slate: '#2e4a3e', slateHi: '#3e6252', dome: '#2e4a3e', domeSh: '#1e3228', domeHi: '#5a8a70', gold: '#e0b040', glass: '#5a6a60' },
  mission:   { stone: '#f2ebdd', stoneSh: '#d4cab4', trim: '#faf6ee', slate: '#b0522e', slateHi: '#c8663c', dome: '#c8663c', domeSh: '#8e3e20', domeHi: '#e89060', gold: '#b8862e', glass: '#4e6a7a' },
  // solarpunk: slate is a living green roof, dome the solar-panel blue
  solarpunk: { stone: '#c9a878', stoneSh: '#a4845a', trim: '#eef0e6', slate: '#4a7a3a', slateHi: '#5e9448', dome: '#1e3a5a', domeSh: '#142a44', domeHi: '#4a7aaa', gold: '#d8c060', glass: '#6a9aa8' },
  // tudor: stone is limewashed plaster, trim the dark oak framing, dome the lead spire
  tudor:     { stone: '#efe6d2', stoneSh: '#d2c6ac', trim: '#3a2a1e', slate: '#7a3a28', slateHi: '#94503a', dome: '#5a5c62', domeSh: '#3e4046', domeHi: '#8a8c94', gold: '#c9a13a', glass: '#5a6a78' },
  brutalist: { stone: '#a9a59c', stoneSh: '#86837b', trim: '#c4c0b6', slate: '#5e5b55', slateHi: '#706c66', dome: '#7d7a73', domeSh: '#5c5a54', domeHi: '#a8a59d', gold: '#d0a030', glass: '#4a5e6e' },
  // stave: tarred timber walls, light carved-wood trim, dark shingle roofs
  stave:     { stone: '#5a3a24', stoneSh: '#432a18', trim: '#c9a46a', slate: '#2e2620', slateHi: '#463a30', dome: '#2e2620', domeSh: '#1e1814', domeHi: '#5a4a3c', gold: '#d8a840', glass: '#4a5a5e' },
  // prairie: roman brick walls, limestone trim bands, a low dark roof
  prairie:   { stone: '#b86a44', stoneSh: '#94523a', trim: '#e8dcc2', slate: '#5a4a3e', slateHi: '#6e5e50', dome: '#5a4a3e', domeSh: '#3e3228', domeHi: '#8a7a6a', gold: '#c8963a', glass: '#6a8a8a' },
  // atomic: white walls, a teal butterfly roof, coral saucer
  atomic:    { stone: '#f0ede4', stoneSh: '#cfc9bb', trim: '#fbf8f0', slate: '#2bb3b1', slateHi: '#48cbc8', dome: '#e0574a', domeSh: '#b23e33', domeHi: '#ff9a8a', gold: '#f2b33a', glass: '#5ea6c8' },
};

function renderGovBuilding(e, px, py, t) {
    // City Hall — the 6×6 seat of government, and the one building every
    // city starts with. A Beaux-Arts limestone block: two wings of arched
    // office windows either side of a columned portico, and above it the
    // clock tower, crowned by a verdigris dome, lantern and flag. The clock
    // reads real game time, like every other clock in the city.
    //
    // Offices are lit through the working day, with a few late desks into
    // the evening; after dark the facade is floodlit and the clock face
    // glows. Drawn footprint-style in its own TILE*w × TILE*h pixel space;
    // all detail is laid out in a 240-unit square scaled by `u`.
    const W = TILE*(e.width||6), H = TILE*(e.height||6);
    const u  = W / 240;
    const on = e.powered;
    const hr = DayNight.hour(), dark = DayNight.darkness();
    const office  = on && hr >= 8 && hr < 17;
    const evening = on && hr >= 17 && hr < 22;
    const nightLit = on && dark > 0.3;
    const X = (v) => px + v*u, Y = (v) => py + v*u;
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), w*u, h*u); };
    const poly = (pts, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(X(pts[0][0]), Y(pts[0][1])); for (let i = 1; i < pts.length; i++) ctx.lineTo(X(pts[i][0]), Y(pts[i][1])); ctx.closePath(); ctx.fill(); };
    const dot = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(x), Y(y), r*u, 0, Math.PI*2); ctx.fill(); };
    const ln = (x1, y1, x2, y2, c, w) => { ctx.strokeStyle = c; ctx.lineWidth = (w || 1)*u; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
    const hash = (k) => { const v = Math.sin((e.col||0)*12.9898 + (e.row||0)*78.233 + k*37.719)*43758.5453; return v - Math.floor(v); };

    // Architecture and flag are the player's New Game picks (CityInfo);
    // previews in the naming modal pass their own via e._hallStyle / e._flag.
    const hallStyle = e._hallStyle || (typeof CityInfo !== 'undefined' ? CityInfo.getHallStyle() : 'beaux');
    const flagId    = e._flag      || (typeof CityInfo !== 'undefined' ? CityInfo.getFlag()      : 'gridline');
    const HP = GOV_HALL_PALETTES[hallStyle] || GOV_HALL_PALETTES.beaux;
    const STONE = HP.stone, STONE_SH = HP.stoneSh, TRIM = HP.trim, SLATE = HP.slate, SLATE_HI = HP.slateHi;
    const COPPER = HP.dome, COPPER_SH = HP.domeSh, GOLD = HP.gold;
    const glassDay = HP.glass, glassDark = '#161c24';
    // Waving flag: outline from (x0,y0) out `fw` units, `fh` tall, filled
    // with the city's flag design. The top and bottom edges are the same
    // curve `fh` apart, so the cloth is the flat flag sheared vertically:
    // the design goes on in strips, each dropped by that curve at its own
    // x, and so stays put on the cloth (pinned at the hoist, riding the fly
    // end) instead of sliding about behind a waving outline.
    const wavingFlag = (x0, y0, fw, fh, fl) => {
      const N = Camera.zoom > 0.5 ? 8 : 4, pad = fh*0.06, lift = fl - fh*0.28;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(X(x0), Y(y0));
      ctx.quadraticCurveTo(X(x0 + fw*0.45), Y(y0 - fh*0.28 + fl), X(x0 + fw), Y(y0 + fl*0.9));
      ctx.lineTo(X(x0 + fw), Y(y0 + fh + fl*0.9));
      ctx.quadraticCurveTo(X(x0 + fw*0.45), Y(y0 + fh*0.72 + fl), X(x0), Y(y0 + fh));
      ctx.closePath();
      ctx.clip();
      for (let i = 0; i < N; i++) {
        // Curve parameter at this strip's centre (the edge's x is 0.9s + 0.1s²).
        const s = (Math.sqrt(0.81 + 0.4*(i + 0.5)/N) - 0.9) / 0.2;
        const dy = 2*s*(1 - s)*lift + s*s*fl*0.9;
        ctx.save();
        ctx.beginPath(); ctx.rect(X(x0 + fw*i/N) - 0.3, Y(y0 - fh), fw*u/N + 0.6, fh*3*u); ctx.clip();
        CityInfo.drawFlag(ctx, flagId, X(x0), Y(y0 + dy - pad), fw*u, (fh + pad*2)*u);
        ctx.restore();
      }
      ctx.restore();
    };

    ctx.save();

    // ── Forecourt plaza ──────────────────────────────────────────────
    R(2, 212, 236, 26, '#bfb7a4');
    ctx.strokeStyle = 'rgba(120,112,98,0.45)'; ctx.lineWidth = 0.8*u;
    ctx.beginPath();
    for (let x = 2; x <= 238; x += 16) { ctx.moveTo(X(x), Y(212)); ctx.lineTo(X(x), Y(238)); }
    ctx.moveTo(X(2), Y(225)); ctx.lineTo(X(238), Y(225));
    ctx.stroke();

    // Floodlight wash on the facade after dark
    if (nightLit && Camera.zoom > 0.5) {
      for (const fx of [60, 120, 180]) {
        const g = ctx.createRadialGradient(X(fx), Y(210), 0, X(fx), Y(150), 80*u);
        g.addColorStop(0, 'rgba(255,226,170,0.28)'); g.addColorStop(1, 'rgba(255,226,170,0)');
        ctx.fillStyle = g; ctx.fillRect(X(fx - 80), Y(60), 160*u, 152*u);
      }
    }

    // ── Wings ────────────────────────────────────────────────────────
    // Arched window, lit by schedule: most desks through office hours,
    // a scattering of late ones in the evening.
    const archWin = (x, y, w, h, k) => {
      const hv = hash(k);
      const lit = (office && hv > 0.12) || (evening && hv > 0.72);
      const glass = lit ? `rgba(255,212,140,${0.82 + 0.08*Math.sin(t*1.2 + hv*9)})` : (dark > 0.4 ? glassDark : glassDay);
      if (hallStyle === 'gothic') {
        // lancet: pointed arch with tracery mullion
        poly([[x - 1.5, y + h], [x - 1.5, y], [x + w/2, y - w*0.9 - 1.5], [x + w + 1.5, y], [x + w + 1.5, y + h]], TRIM);
        poly([[x, y + h], [x, y], [x + w/2, y - w*0.85], [x + w, y], [x + w, y + h]], glass);
        ln(x + w/2, y - w*0.85, x + w/2, y + h, TRIM, 0.9);
        dot(x + w/2, y - w*0.2, 1.4, TRIM);
        return;
      }
      if (hallStyle === 'deco') {
        // tall slot with fluted spandrel panel above
        R(x - 1, y - 6, w + 2, h + 6, TRIM);
        R(x, y - 5, w, 4, GOLD);
        for (let f = 1; f < 4; f++) ln(x + f*w/4, y - 5, x + f*w/4, y - 1, TRIM, 0.5);
        R(x + 1, y, w - 2, h, glass);
        ln(x + w/2, y, x + w/2, y + h, TRIM, 0.7);
        return;
      }
      if (hallStyle === 'modern') {
        // flush curtain-wall bay
        R(x - 2, y - 2, w + 4, h + 4, glass);
        for (let gy = y + h/3; gy < y + h; gy += h/3) ln(x - 2, gy, x + w + 2, gy, 'rgba(40,50,60,0.6)', 0.6);
        ln(x + w/2, y - 2, x + w/2, y + h + 2, 'rgba(40,50,60,0.6)', 0.6);
        return;
      }
      if (hallStyle === 'colonial') {
        // six-over-six sash with green shutters and a keystone lintel
        R(x - 4, y, 3, h, '#2e4a3a'); R(x + w + 1, y, 3, h, '#2e4a3a');
        R(x - 1.2, y - 1.2, w + 2.4, h + 1.2, TRIM);
        R(x, y, w, h, glass);
        ln(x + w/2, y, x + w/2, y + h, TRIM, 0.7);
        for (const f of [1/3, 2/3]) ln(x, y + h*f, x + w, y + h*f, TRIM, 0.6);
        R(x - 2, y - 4, w + 4, 3, TRIM); R(x + w/2 - 1.5, y - 5, 3, 4, '#e6e0d0');
        R(x - 2, y + h, w + 4, 2, TRIM);
        return;
      }
      if (hallStyle === 'chateau') {
        // cross-mullioned casement under a stone hood
        R(x - 2, y - 2, w + 4, h + 3, TRIM);
        R(x, y, w, h, glass);
        ln(x + w/2, y, x + w/2, y + h, TRIM, 1);
        ln(x, y + h*0.35, x + w, y + h*0.35, TRIM, 1);
        R(x - 3.5, y - 5, w + 7, 3, STONE_SH);
        R(x - 2.5, y + h + 1, w + 5, 2, STONE_SH);
        return;
      }
      if (hallStyle === 'pagoda') {
        // lacquered frame around a paper lattice screen
        R(x - 1.5, y - 1.5, w + 3, h + 3, TRIM);
        R(x, y, w, h, lit ? glass : (dark > 0.4 ? '#2a2620' : '#e8dcc0'));
        for (let f = 1; f < 3; f++) ln(x + f*w/3, y, x + f*w/3, y + h, 'rgba(90,30,20,0.75)', 0.6);
        for (let f = 1; f < 5; f++) ln(x, y + f*h/5, x + w, y + f*h/5, 'rgba(90,30,20,0.75)', 0.6);
        return;
      }
      if (hallStyle === 'mission') {
        // deep-set round arch in the stucco, with a wrought-iron grille
        ctx.fillStyle = STONE_SH; ctx.beginPath(); ctx.moveTo(X(x - 1.2), Y(y + h + 1)); ctx.lineTo(X(x - 1.2), Y(y)); ctx.arc(X(x + w/2), Y(y), (w/2 + 1.2)*u, Math.PI, 0); ctx.lineTo(X(x + w + 1.2), Y(y + h + 1)); ctx.closePath(); ctx.fill();
        ctx.fillStyle = glass; ctx.beginPath(); ctx.moveTo(X(x), Y(y + h)); ctx.lineTo(X(x), Y(y)); ctx.arc(X(x + w/2), Y(y), (w/2)*u, Math.PI, 0); ctx.lineTo(X(x + w), Y(y + h)); ctx.closePath(); ctx.fill();
        for (let f = 1; f < 4; f++) ln(x + f*w/4, y - w*0.3, x + f*w/4, y + h, '#2a2420', 0.5);
        ln(x, y + h*0.5, x + w, y + h*0.5, '#2a2420', 0.5);
        return;
      }
      if (hallStyle === 'solarpunk') {
        // rounded glazing over a planter box spilling green
        ctx.fillStyle = TRIM; ctx.beginPath(); ctx.roundRect(X(x - 1.5), Y(y - 1.5), (w + 3)*u, (h + 3)*u, 4.5*u); ctx.fill();
        ctx.fillStyle = glass; ctx.beginPath(); ctx.roundRect(X(x), Y(y), w*u, h*u, 3.5*u); ctx.fill();
        ln(x + w/2, y + 1, x + w/2, y + h - 1, 'rgba(60,80,70,0.5)', 0.6);
        R(x - 2, y + h, w + 4, 3.5, '#6a4a2a');
        for (let k = 0; k < 5; k++) dot(x - 1 + k*(w + 2)/4, y + h - 0.3, 1.6, k % 2 ? '#5e9448' : '#3f7a34');
        dot(x - 1.5, y + h + 5, 1.1, '#3f7a34'); dot(x + w + 1, y + h + 6.5, 1.1, '#3f7a34');
        return;
      }
      if (hallStyle === 'tudor') {
        // oak-framed casement with diamond leading
        R(x - 1.5, y - 1.5, w + 3, h + 3, TRIM);
        R(x, y, w, h, glass);
        ctx.save(); ctx.beginPath(); ctx.rect(X(x), Y(y), w*u, h*u); ctx.clip();
        ctx.strokeStyle = 'rgba(40,30,22,0.55)'; ctx.lineWidth = 0.4*u; ctx.beginPath();
        for (let d = -h; d < w + h; d += 4) { ctx.moveTo(X(x + d), Y(y)); ctx.lineTo(X(x + d + h), Y(y + h)); ctx.moveTo(X(x + d + h), Y(y)); ctx.lineTo(X(x + d), Y(y + h)); }
        ctx.stroke(); ctx.restore();
        ln(x + w/2, y, x + w/2, y + h, TRIM, 1);
        ln(x, y + h*0.4, x + w, y + h*0.4, TRIM, 1);
        return;
      }
      if (hallStyle === 'stave') {
        // small round-headed opening in a heavy carved frame
        ctx.fillStyle = TRIM; ctx.beginPath(); ctx.moveTo(X(x - 2), Y(y + h + 1)); ctx.lineTo(X(x - 2), Y(y + 4)); ctx.arc(X(x + w/2), Y(y + 4), (w/2 + 2)*u, Math.PI, 0); ctx.lineTo(X(x + w + 2), Y(y + h + 1)); ctx.closePath(); ctx.fill();
        ctx.fillStyle = glass; ctx.beginPath(); ctx.moveTo(X(x + 0.5), Y(y + h)); ctx.lineTo(X(x + 0.5), Y(y + 4)); ctx.arc(X(x + w/2), Y(y + 4), (w/2 - 0.5)*u, Math.PI, 0); ctx.lineTo(X(x + w - 0.5), Y(y + h)); ctx.closePath(); ctx.fill();
        ln(x + w/2, y - 1, x + w/2, y + h, STONE_SH, 0.8);
        dot(x + w/2, y - 4.5, 1.3, '#b8402a');                 // painted rosette over the arch
        return;
      }
      if (hallStyle === 'prairie') {
        // art-glass casement: geometric leading, a red and a green chip
        R(x - 1.5, y - 1.5, w + 3, h + 3, TRIM);
        R(x, y, w, h, glass);
        ln(x + w*0.25, y, x + w*0.25, y + h, 'rgba(60,50,40,0.6)', 0.5);
        ln(x + w*0.75, y, x + w*0.75, y + h, 'rgba(60,50,40,0.6)', 0.5);
        ln(x, y + h*0.22, x + w, y + h*0.22, 'rgba(60,50,40,0.6)', 0.5);
        R(x + w*0.25 + 0.5, y + 1.2, 2, 2, '#c04a30');
        R(x + w*0.75 - 2.5, y + 1.2, 2, 2, '#5a8a4a');
        return;
      }
      if (hallStyle === 'atomic') {
        // tall pill window in a coral surround, with a glint
        ctx.fillStyle = HP.dome; ctx.beginPath(); ctx.roundRect(X(x - 1.5), Y(y - 1.5), (w + 3)*u, (h + 3)*u, (w/2 + 1.5)*u); ctx.fill();
        ctx.fillStyle = glass; ctx.beginPath(); ctx.roundRect(X(x), Y(y), w*u, h*u, (w/2)*u); ctx.fill();
        if (!lit) ln(x + w*0.3, y + 4, x + w*0.3, y + h*0.45, 'rgba(255,255,255,0.45)', 1);
        return;
      }
      if (hallStyle === 'byzantine') {
        // horseshoe arch with striped voussoirs
        for (let v = 0; v < 7; v++) {
          ctx.fillStyle = v % 2 ? SLATE_HI : TRIM;
          ctx.beginPath(); ctx.moveTo(X(x + w/2), Y(y));
          ctx.arc(X(x + w/2), Y(y), (w/2 + 2.5)*u, Math.PI + v*Math.PI/7, Math.PI + (v + 1)*Math.PI/7);
          ctx.closePath(); ctx.fill();
        }
        R(x - 1.5, y, w + 3, h, TRIM);
        ctx.fillStyle = glass; ctx.beginPath(); ctx.moveTo(X(x), Y(y + h)); ctx.lineTo(X(x), Y(y)); ctx.arc(X(x + w/2), Y(y), (w/2)*u, Math.PI, 0); ctx.lineTo(X(x + w), Y(y + h)); ctx.closePath(); ctx.fill();
        R(x - 2.5, y + h, w + 5, 2.2, STONE_SH);
        return;
      }
      R(x - 1.5, y - 1.5, w + 3, h + 1.5, TRIM);
      ctx.fillStyle = TRIM; ctx.beginPath(); ctx.arc(X(x + w/2), Y(y), (w/2 + 1.5)*u, Math.PI, 0); ctx.fill();
      ctx.fillStyle = lit ? `rgba(255,212,140,${0.82 + 0.08*Math.sin(t*1.2 + hv*9)})` : (dark > 0.4 ? glassDark : glassDay);
      ctx.beginPath(); ctx.moveTo(X(x), Y(y + h)); ctx.lineTo(X(x), Y(y)); ctx.arc(X(x + w/2), Y(y), (w/2)*u, Math.PI, 0); ctx.lineTo(X(x + w), Y(y + h)); ctx.closePath(); ctx.fill();
      ln(x + w/2, y - w/2, x + w/2, y + h, TRIM, 0.8);
      ln(x, y + h*0.45, x + w, y + h*0.45, TRIM, 0.8);
      R(x - 2.5, y + h, w + 5, 2.2, STONE_SH);          // sill
    };
    // Modernist glazing: a sky-to-deep-blue gradient with diagonal
    // reflection streaks by day, near-black at night (lit offices are laid
    // over it separately). LED is the cool edge lighting on its slabs.
    const M_WHITE = '#eef1f4', M_SHADE = '#c9d0d6', M_MULL = 'rgba(30,42,52,0.55)';
    const M_LED = 'rgba(150,232,255,0.95)';
    const mGlass = (x, y, w, h) => {
      if (dark > 0.4) { R(x, y, w, h, glassDark); return; }
      const g = ctx.createLinearGradient(0, Y(y), 0, Y(y + h));
      g.addColorStop(0, '#a8cde6'); g.addColorStop(0.5, '#5a8ab2'); g.addColorStop(1, '#2e5476');
      ctx.fillStyle = g; ctx.fillRect(X(x), Y(y), w*u, h*u);
      ctx.save();
      ctx.beginPath(); ctx.rect(X(x), Y(y), w*u, h*u); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.17)';
      for (let s = x - h*0.6; s < x + w; s += 30) {
        ctx.beginPath();
        ctx.moveTo(X(s), Y(y + h)); ctx.lineTo(X(s + 9), Y(y + h));
        ctx.lineTo(X(s + 9 + h*0.6), Y(y)); ctx.lineTo(X(s + h*0.6), Y(y));
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    };
    // Lit office bay: cool white through the working day, warm in the evening.
    const mLit = (k, thresholdDay, thresholdEve) => {
      const hv = hash(k);
      if (office && hv > thresholdDay) return dark > 0.3 ? 'rgba(228,240,255,0.78)' : 'rgba(236,246,255,0.4)';
      if (evening && hv > thresholdEve) return `rgba(255,214,150,${0.8 + 0.08*Math.sin(t*1.1 + hv*9)})`;
      return null;
    };
    for (const [wx0, sideKey] of [[6, 0], [160, 1]]) {
      const ww = 74;
      if (hallStyle === 'gothic') {
        // steep gable with crockets and a rose window
        poly([[wx0 - 2, 98], [wx0 + ww/2, 58], [wx0 + ww + 2, 98]], SLATE);
        poly([[wx0 + ww/2, 58], [wx0 + ww + 2, 98], [wx0 + ww/2 + 6, 98]], 'rgba(0,0,0,0.2)');
        for (let k = 1; k < 6; k++) { const f = k/6; dot(wx0 - 2 + f*(ww/2 + 2), 98 - f*40, 1.1, SLATE_HI); dot(wx0 + ww + 2 - f*(ww/2 + 2), 98 - f*40, 1.1, SLATE_HI); }
        dot(wx0 + ww/2, 84, 7, TRIM);
        dot(wx0 + ww/2, 84, 5.5, (evening || office) && on ? 'rgba(255,190,120,0.85)' : '#5a3a5e');
        for (let k = 0; k < 8; k++) { const a = k*Math.PI/4; ln(wx0 + ww/2, 84, wx0 + ww/2 + Math.cos(a)*5.5, 84 + Math.sin(a)*5.5, TRIM, 0.6); }
      } else if (hallStyle === 'deco' || hallStyle === 'modern') {
        // flat roof behind a parapet (stepped for deco)
        R(wx0 - 1, 88, ww + 2, 10, STONE_SH);
        if (hallStyle === 'deco') { R(wx0 + ww/2 - 14, 82, 28, 8, STONE_SH); R(wx0 + ww/2 - 7, 77, 14, 6, STONE_SH); R(wx0 + ww/2 - 1, 72, 2, 6, GOLD); }
        else {
          // roof garden behind a glass balustrade
          R(wx0 - 1, 88, ww + 2, 10, M_SHADE);
          R(wx0 + 2, 89, ww - 4, 3, '#5e8a46');
          for (let k = 0; k < 6; k++) {
            const tx = wx0 + 7 + k*12 + hash(sideKey*7 + k)*3, r = 3.2 + hash(sideKey*9 + k)*1.6;
            dot(tx, 88.5, r, k % 2 ? '#3f7234' : '#4c8a3c');
            dot(tx - r*0.35, 87.6, r*0.45, 'rgba(190,230,140,0.45)');
          }
          R(wx0, 84, ww, 6, 'rgba(190,225,245,0.28)');
          R(wx0, 84, ww, 0.9, '#f6f8fa');
        }
      } else if (hallStyle === 'colonial') {
        // hipped slate roof with a pair of brick chimneys
        poly([[wx0 - 2, 98], [wx0 + 12, 82], [wx0 + ww - 12, 82], [wx0 + ww + 2, 98]], SLATE);
        poly([[wx0 + ww - 12, 82], [wx0 + ww + 2, 98], [wx0 + ww - 16, 98]], 'rgba(0,0,0,0.18)');
        for (const cx0 of [wx0 + 16, wx0 + ww - 23]) { R(cx0, 72, 7, 14, STONE); R(cx0 - 1, 71, 9, 2.2, TRIM); }
      } else if (hallStyle === 'chateau') {
        // steep slate hip with tall dormers
        poly([[wx0 - 2, 98], [wx0 + 16, 62], [wx0 + ww - 16, 62], [wx0 + ww + 2, 98]], SLATE);
        poly([[wx0 + ww - 16, 62], [wx0 + ww + 2, 98], [wx0 + ww - 20, 98]], 'rgba(0,0,0,0.2)');
        R(wx0 + 16, 61, ww - 32, 2, GOLD);                                   // ridge cresting
        for (const dx of [wx0 + 22, wx0 + ww - 34]) {
          R(dx, 76, 12, 16, TRIM);
          poly([[dx - 2, 77], [dx + 6, 66], [dx + 14, 77]], SLATE_HI);
          const hv = hash(50 + sideKey*2 + dx);
          R(dx + 2.5, 79, 7, 11, (evening && hv > 0.5) || (office && hv > 0.3) ? 'rgba(255,212,140,0.85)' : (dark > 0.4 ? glassDark : glassDay));
        }
      } else if (hallStyle === 'pagoda') {
        // sweeping glazed-tile roof, eaves turned up at the corners
        poly([[wx0 - 10, 91], [wx0 - 2, 100], [wx0 + ww + 2, 100], [wx0 + ww + 10, 91], [wx0 + ww - 8, 82], [wx0 + 8, 82]], SLATE);
        ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.6*u; ctx.beginPath();
        for (let rx = wx0 + 2; rx < wx0 + ww; rx += 4) { ctx.moveTo(X(rx), Y(83)); ctx.lineTo(X(rx + (rx - wx0 - ww/2)*0.08), Y(99)); }
        ctx.stroke();
        R(wx0 + 8, 80, ww - 16, 3, SLATE_HI);
        dot(wx0 + 8, 81, 2, GOLD); dot(wx0 + ww - 8, 81, 2, GOLD);
        R(wx0 - 2, 99, ww + 4, 2, TRIM);
      } else if (hallStyle === 'mission') {
        // low clay-tile roof
        R(wx0 - 3, 88, ww + 6, 10, SLATE);
        ctx.strokeStyle = SLATE_HI; ctx.lineWidth = 1.2*u; ctx.beginPath();
        for (let rx = wx0 - 1; rx < wx0 + ww + 3; rx += 3.2) { ctx.moveTo(X(rx), Y(88.5)); ctx.lineTo(X(rx), Y(97.5)); }
        ctx.stroke();
        R(wx0 - 3, 97, ww + 6, 1.6, 'rgba(0,0,0,0.3)');
      } else if (hallStyle === 'solarpunk') {
        // living roof carrying a row of solar panels
        R(wx0 - 2, 88, ww + 4, 10, SLATE);
        for (let k = 0; k < 12; k++) dot(wx0 + 2 + k*6.2, 88.5 + (k % 3)*0.8, 2.2, k % 2 ? SLATE_HI : '#3f6a30');
        for (let k = 0; k < 4; k++) {
          const sx0 = wx0 + 4 + k*17.5;
          ln(sx0 + 2, 90, sx0 + 2, 86, '#6a6a60', 0.8); ln(sx0 + 12, 90, sx0 + 12, 86, '#6a6a60', 0.8);
          R(sx0, 78, 14, 9, COPPER);
          ctx.strokeStyle = 'rgba(160,200,240,0.45)'; ctx.lineWidth = 0.5*u; ctx.beginPath();
          for (let g = 1; g < 4; g++) { ctx.moveTo(X(sx0 + g*3.5), Y(78)); ctx.lineTo(X(sx0 + g*3.5), Y(87)); }
          ctx.moveTo(X(sx0), Y(82.5)); ctx.lineTo(X(sx0 + 14), Y(82.5)); ctx.stroke();
          R(sx0, 78, 14, 1.2, HP.domeHi);
        }
      } else if (hallStyle === 'tudor') {
        // steep tiled gable with dark bargeboards and a clustered brick chimney
        poly([[wx0 - 3, 98], [wx0 + ww/2, 58], [wx0 + ww + 3, 98]], SLATE);
        poly([[wx0 + ww/2, 58], [wx0 + ww + 3, 98], [wx0 + ww/2 + 6, 98]], 'rgba(0,0,0,0.2)');
        ctx.strokeStyle = 'rgba(40,16,8,0.35)'; ctx.lineWidth = 0.5*u; ctx.beginPath();
        for (let y = 64; y < 98; y += 4) { const f = (y - 58)/40; ctx.moveTo(X(wx0 + ww/2 - f*(ww/2 + 3)), Y(y)); ctx.lineTo(X(wx0 + ww/2 + f*(ww/2 + 3)), Y(y)); }
        ctx.stroke();
        ln(wx0 - 3, 98, wx0 + ww/2, 58, TRIM, 2); ln(wx0 + ww/2, 58, wx0 + ww + 3, 98, TRIM, 2);
        const cx0 = sideKey ? wx0 + 10 : wx0 + ww - 18;
        for (const k of [0, 4.5]) { R(cx0 + k, 60, 4, 30, '#8a4a34'); R(cx0 + k - 0.5, 58, 5, 2.5, '#6a3424'); }
        R(cx0, 66, 8.5, 0.8, 'rgba(0,0,0,0.25)'); R(cx0, 76, 8.5, 0.8, 'rgba(0,0,0,0.25)');
      } else if (hallStyle === 'brutalist') {
        // heavy coping crowned by a row of precast fins
        R(wx0 - 6, 84, ww + 12, 14, STONE_SH);
        for (let k = 0; k < 11; k++) { R(wx0 - 5 + k*8, 76, 5, 9, STONE); R(wx0 - 5 + k*8, 76, 1.2, 9, STONE_SH); }
        R(wx0 - 6, 97, ww + 12, 1.5, 'rgba(0,0,0,0.3)');
      } else if (hallStyle === 'stave') {
        // steep shingled gable over a skirt roof, dragon heads at the ridge ends
        R(wx0 - 7, 94, ww + 14, 5, SLATE_HI);
        poly([[wx0 - 3, 96], [wx0 + ww/2, 62], [wx0 + ww + 3, 96]], SLATE);
        poly([[wx0 + ww/2, 62], [wx0 + ww + 3, 96], [wx0 + ww/2 + 5, 96]], 'rgba(0,0,0,0.25)');
        for (let y = 68; y < 95; y += 4) {
          const f = (y - 62)/34, half = f*(ww/2 + 3);
          for (let sx = -half + 2; sx < half; sx += 4) dot(wx0 + ww/2 + sx, y, 1.3, SLATE_HI);
        }
        for (const s of [-1, 1]) {
          ctx.strokeStyle = TRIM; ctx.lineWidth = 1.4*u; ctx.lineCap = 'round'; ctx.beginPath();
          ctx.moveTo(X(wx0 + ww/2), Y(62)); ctx.quadraticCurveTo(X(wx0 + ww/2 + s*6), Y(52), X(wx0 + ww/2 + s*9), Y(55)); ctx.stroke();
          ctx.lineCap = 'butt';
          dot(wx0 + ww/2 + s*9, 55, 1.1, '#b8402a');
        }
      } else if (hallStyle === 'prairie') {
        // low hipped roof flung far out over the walls
        poly([[wx0 - 12, 98], [wx0 + 10, 86], [wx0 + ww - 10, 86], [wx0 + ww + 12, 98]], SLATE);
        poly([[wx0 + ww - 10, 86], [wx0 + ww + 12, 98], [wx0 + ww - 4, 98]], 'rgba(0,0,0,0.18)');
        R(wx0 - 12, 97, ww + 24, 2, TRIM);
        R(wx0 - 12, 99, ww + 24, 2.5, 'rgba(0,0,0,0.3)');
      } else if (hallStyle === 'atomic') {
        // butterfly roof, folded down the middle, with starbursts above
        poly([[wx0 - 6, 82], [wx0 + ww/2, 94], [wx0 + ww + 6, 82], [wx0 + ww + 6, 87], [wx0 + ww/2, 99], [wx0 - 6, 87]], SLATE);
        poly([[wx0 + ww/2, 94], [wx0 + ww + 6, 82], [wx0 + ww + 6, 87], [wx0 + ww/2, 99]], 'rgba(0,0,0,0.15)');
        for (const [sx, sy] of [[wx0 + 12, 74], [wx0 + ww - 12, 74]]) {
          for (let k = 0; k < 8; k++) { const a = k*Math.PI/4; ln(sx, sy, sx + Math.cos(a)*(k % 2 ? 2.5 : 4.5), sy + Math.sin(a)*(k % 2 ? 2.5 : 4.5), GOLD, 0.7); }
          ln(sx, sy + 4.5, sx, sy + 10, '#8a8a8e', 0.5);
        }
      } else if (hallStyle === 'byzantine') {
        // low roof with a pair of small domes
        R(wx0 - 1, 90, ww + 2, 8, STONE_SH);
        for (const dx of [wx0 + ww*0.3, wx0 + ww*0.7]) {
          R(dx - 7, 84, 14, 7, TRIM);
          ctx.fillStyle = COPPER; ctx.beginPath(); ctx.ellipse(X(dx), Y(84), 8*u, 8*u, 0, Math.PI, 0); ctx.fill();
          dot(dx, 75.5, 1.2, GOLD);
        }
      } else {
      // mansard roof with dormers
      poly([[wx0 - 2, 98], [wx0 + 6, 80], [wx0 + ww - 6, 80], [wx0 + ww + 2, 98]], SLATE);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.6*u; ctx.beginPath();
      for (let y = 84; y < 98; y += 3.5) { ctx.moveTo(X(wx0), Y(y)); ctx.lineTo(X(wx0 + ww), Y(y)); }
      ctx.stroke();
      R(wx0 + 6, 79, ww - 12, 2, SLATE_HI);
      for (let d = 0; d < 3; d++) {
        const dx = wx0 + 13 + d*24;
        poly([[dx - 1, 88], [dx + 6, 81], [dx + 13, 88]], SLATE_HI);
        R(dx + 1, 88, 10, 9, TRIM);
        const hv = hash(40 + sideKey*3 + d);
        R(dx + 3, 89.5, 6, 6.5, (evening && hv > 0.6) || (office && hv > 0.4) ? 'rgba(255,212,140,0.85)' : (dark > 0.4 ? glassDark : glassDay));
      }
      }
      if (hallStyle === 'modern') {
        // White concrete frame: two storeys of deep-set glass behind
        // brise-soleil fins, lifted on pilotis over a recessed glass lobby.
        R(wx0, 98, ww, 72, M_WHITE);
        R(wx0, 98, ww, 1.6, '#ffffff');
        const inner = sideKey ? wx0 + ww - 3 : wx0;                      // shadowed return on the inner side
        R(inner, 98, 3, 72, M_SHADE);
        const bays = 6, bw = (ww - 10)/bays;
        for (const [ry, rh] of [[104, 28], [137, 28]]) {
          R(wx0 + 4, ry - 1, ww - 8, rh + 2, '#9aa4ac');                  // reveal
          mGlass(wx0 + 5, ry, ww - 10, rh);
          for (let k = 0; k < bays; k++) {
            const c = mLit(sideKey*20 + ry + k, 0.22, 0.7);
            if (!c) continue;
            R(wx0 + 5 + k*bw, ry, bw, rh, c);
            R(wx0 + 5 + k*bw + 1, ry + rh - 7, bw - 2, 1.2, 'rgba(60,70,80,0.35)');   // desks
          }
          for (let k = 1; k < bays; k++) ln(wx0 + 5 + k*bw, ry, wx0 + 5 + k*bw, ry + rh, M_MULL, 0.7);
          // horizontal sun-shade fins across the glass
          for (let fy = ry + 4; fy < ry + rh - 1; fy += 5.5) {
            R(wx0 + 3, fy, ww - 6, 1.3, 'rgba(244,246,248,0.95)');
            R(wx0 + 3, fy + 1.3, ww - 6, 0.6, 'rgba(0,0,0,0.16)');
          }
          R(wx0 - 1, ry + rh + 1, ww + 2, 3, '#f8fafb');                  // slab edge
          R(wx0 - 1, ry + rh + 4, ww + 2, 0.8, 'rgba(0,0,0,0.22)');
          if (nightLit) R(wx0 - 1, ry + rh + 1, ww + 2, 0.9, M_LED);
        }
        // recessed lobby in the shadow of the slab
        R(wx0 + 3, 170, ww - 6, 36, '#1c242c');
        mGlass(wx0 + 7, 173, ww - 14, 33);
        if (on && (office || evening || nightLit)) {
          const lg = ctx.createLinearGradient(0, Y(206), 0, Y(173));
          lg.addColorStop(0, 'rgba(255,222,165,0.75)'); lg.addColorStop(1, 'rgba(255,222,165,0.2)');
          ctx.fillStyle = lg; ctx.fillRect(X(wx0 + 7), Y(173), (ww - 14)*u, 33*u);
        }
        R(wx0 + 3, 170, ww - 6, 4, 'rgba(0,0,0,0.4)');                    // soffit shadow
        for (let k = 0; k < 4; k++) {                                     // round pilotis
          const cx2 = wx0 + 10 + k*(ww - 20)/3;
          R(cx2 - 1.6, 172, 3.2, 34, '#f4f6f8');
          R(cx2 + 0.6, 172, 1, 34, 'rgba(0,0,0,0.18)');
        }
        // copper fin on the outer corner, the hall's one note of colour
        const fx = sideKey ? wx0 + ww - 2 : wx0 - 2;
        R(fx, 94, 4, 112, '#c8683c');
        R(fx + (sideKey ? 0 : 2.6), 94, 1.4, 112, 'rgba(255,200,160,0.35)');
        if (nightLit) R(wx0 - 1, 98, ww + 2, 0.9, M_LED);
        continue;
      }
      if (hallStyle === 'brutalist') {
        // board-formed upper mass cantilevered out over a sunken, shadowed base
        R(wx0 + 8, 160, ww - 16, 46, STONE_SH);
        for (let k = 0; k < 3; k++) {
          const hv = hash(sideKey*30 + 60 + k);
          R(wx0 + 12 + k*18, 172, 12, 34, (office && hv > 0.2) || (evening && hv > 0.7) ? 'rgba(255,220,160,0.8)' : (dark > 0.4 ? glassDark : '#3a3e44'));
        }
        R(wx0 - 4, 98, ww + 8, 62, STONE);
        ctx.strokeStyle = 'rgba(70,66,60,0.3)'; ctx.lineWidth = 0.5*u; ctx.beginPath();
        for (let y = 101; y < 160; y += 4) { ctx.moveTo(X(wx0 - 4), Y(y)); ctx.lineTo(X(wx0 + ww + 4), Y(y)); }
        ctx.stroke();
        for (const [ry, rh] of [[104, 22], [132, 22]]) {
          for (let k = 0; k < 9; k++) {
            const fx = wx0 - 2 + k*8.4, hv = hash(sideKey*40 + ry + k);
            R(fx, ry, 6.4, rh, STONE_SH);                                   // deep reveal
            R(fx + 1.4, ry + 2, 3.6, rh - 4, (office && hv > 0.25) || (evening && hv > 0.75) ? 'rgba(255,220,160,0.85)' : (dark > 0.4 ? glassDark : glassDay));
          }
        }
        R(wx0 - 4, 159, ww + 8, 3, 'rgba(0,0,0,0.4)');                     // cantilever shadow
        continue;
      }
      // body, rusticated ground floor, cornice with balustrade
      R(wx0, 98, ww, 108, STONE);
      const plainWall = hallStyle === 'mission' || hallStyle === 'pagoda' || hallStyle === 'solarpunk'
        || hallStyle === 'tudor' || hallStyle === 'stave' || hallStyle === 'prairie' || hallStyle === 'atomic';
      if (hallStyle === 'colonial') {
        // brick coursing and white quoins
        ctx.strokeStyle = 'rgba(60,20,10,0.28)'; ctx.lineWidth = 0.5*u; ctx.beginPath();
        for (let y = 101; y < 206; y += 3) { ctx.moveTo(X(wx0), Y(y)); ctx.lineTo(X(wx0 + ww), Y(y)); }
        ctx.stroke();
        for (let y = 100; y < 204; y += 8) for (const qx of [wx0, wx0 + ww - (y % 16 ? 5 : 7)]) R(qx, y, y % 16 ? 5 : 7, 4, TRIM);
      } else if (hallStyle === 'solarpunk') {
        // vertical timber cladding, vines trailing from the green roof
        ctx.strokeStyle = 'rgba(90,60,30,0.3)'; ctx.lineWidth = 0.6*u; ctx.beginPath();
        for (let x = wx0 + 3; x < wx0 + ww; x += 4) { ctx.moveTo(X(x), Y(98)); ctx.lineTo(X(x), Y(206)); }
        ctx.stroke();
        for (let k = 0; k < 5; k++) {
          const vx = wx0 + 5 + hash(70 + sideKey*7 + k)*(ww - 10), vl = 12 + hash(80 + sideKey*7 + k)*26;
          for (let y = 99; y < 99 + vl; y += 3) dot(vx + Math.sin(y*0.4 + k)*1.4, y, 1.3, y % 6 ? '#4a8a3a' : '#3a6e2e');
        }
      } else if (hallStyle === 'tudor') {
        // oak frame: posts between the windows, rails, braces in the end bays
        for (const rx of [0, 27, 47, ww - 3]) R(wx0 + rx, 98, 3, 108, TRIM);
        for (const ry of [108, 146, 165, 200]) R(wx0, ry, ww, 2.2, TRIM);
        for (const [x1, x2] of [[3, 11], [ww - 3, ww - 11]]) {
          ln(wx0 + x1, 146, wx0 + x2, 110, TRIM, 1.8);
          ln(wx0 + x1, 200, wx0 + x2, 167, TRIM, 1.8);
        }
      } else if (hallStyle === 'stave') {
        // vertical tarred planks
        ctx.strokeStyle = 'rgba(20,10,4,0.45)'; ctx.lineWidth = 0.6*u; ctx.beginPath();
        for (let x = wx0 + 3; x < wx0 + ww; x += 3.5) { ctx.moveTo(X(x), Y(98)); ctx.lineTo(X(x), Y(206)); }
        ctx.stroke();
        R(wx0, 202, ww, 4, STONE_SH);                                            // sill beam
      } else if (hallStyle === 'prairie') {
        // raked horizontal brick joints and a continuous limestone sill band
        ctx.strokeStyle = 'rgba(70,30,16,0.3)'; ctx.lineWidth = 0.5*u; ctx.beginPath();
        for (let y = 100; y < 206; y += 2.6) { ctx.moveTo(X(wx0), Y(y)); ctx.lineTo(X(wx0 + ww), Y(y)); }
        ctx.stroke();
        R(wx0 - 2, 143, ww + 4, 2.5, TRIM);
        R(wx0 - 2, 197, ww + 4, 2.5, TRIM);
        for (const ux of [wx0 + 2, wx0 + ww - 10]) { R(ux, 210, 8, 4, TRIM); dot(ux + 4, 208, 3.5, '#4a7a3a'); }   // planter urns
      } else if (hallStyle === 'atomic') {
        // fieldstone feature panel at the outer end, a coral swoosh along the wall
        const sx0 = sideKey ? wx0 + ww - 9 : wx0;
        R(sx0, 98, 9, 108, '#c9b8a0');
        for (let k = 0; k < 22; k++) dot(sx0 + 1.5 + hash(200 + sideKey*30 + k)*6, 101 + k*4.8, 1.5 + hash(240 + k)*0.8, k % 3 ? '#b0a088' : '#9a8a74');
        ctx.strokeStyle = HP.dome; ctx.lineWidth = 2*u; ctx.beginPath();
        ctx.moveTo(X(wx0), Y(158)); ctx.quadraticCurveTo(X(wx0 + ww/2), Y(150), X(wx0 + ww), Y(158)); ctx.stroke();
      } else if (!plainWall) {
        ctx.strokeStyle = 'rgba(120,110,92,0.35)'; ctx.lineWidth = 0.7*u; ctx.beginPath();
        for (let y = 160; y < 206; y += 6) { ctx.moveTo(X(wx0), Y(y)); ctx.lineTo(X(wx0 + ww), Y(y)); }
        ctx.stroke();
      }
      R(wx0 - 2, 96, ww + 4, 4, TRIM);
      R(wx0 - 2, 156, ww + 4, 3.5, TRIM);                  // string course
      if (!plainWall) {
        for (let b = wx0 + 3; b < wx0 + ww - 2; b += 5) R(b, 92, 2, 4, TRIM);   // balusters
        R(wx0 - 2, 91, ww + 4, 1.6, TRIM);
      }
      // pilasters (buttresses for gothic, ablaq banding for byzantine)
      if (hallStyle === 'byzantine') for (let y = 104; y < 156; y += 8) R(wx0, y, ww, 3, 'rgba(160,70,50,0.35)');
      if (hallStyle === 'gothic') {
        for (const pxp of [wx0 - 1, wx0 + ww/2 - 3, wx0 + ww - 5]) { R(pxp, 100, 6, 106, STONE_SH); poly([[pxp, 100], [pxp + 3, 92], [pxp + 6, 100]], STONE_SH); }
      } else if (hallStyle === 'pagoda') {
        for (const pxp of [wx0 + 1, wx0 + ww/2 - 2, wx0 + ww - 5]) R(pxp, 100, 4, 106, TRIM);   // lacquered posts
      } else if (!['modern', 'colonial', 'mission', 'tudor', 'stave', 'prairie', 'atomic'].includes(hallStyle)) {
        for (const pxp of [wx0 + 1, wx0 + ww - 5]) R(pxp, 100, 4, 106, STONE_SH);
      }
      // two storeys of arched windows
      for (let i = 0; i < 3; i++) {
        const x = wx0 + 12 + i*20;
        archWin(x, 114, 12, 28, sideKey*10 + i);
        archWin(x, 170, 12, 26, sideKey*10 + i + 5);
      }
      if (hallStyle === 'chateau') {
        // round corner turret under a candle-snuffer roof
        const tx = sideKey ? wx0 + ww - 2 : wx0 + 2;
        R(tx - 9, 86, 18, 120, STONE);
        R(tx - 9, 86, 4, 120, STONE_SH);
        R(tx - 10, 156, 20, 3, TRIM);
        poly([[tx - 11, 88], [tx, 46], [tx + 11, 88]], SLATE);
        poly([[tx, 46], [tx + 11, 88], [tx + 3, 88]], 'rgba(0,0,0,0.22)');
        dot(tx, 45, 1.4, GOLD);
        const hv = hash(90 + sideKey);
        R(tx - 2, 116, 4, 14, (office && hv > 0.3) || (evening && hv > 0.6) ? 'rgba(255,212,140,0.85)' : (dark > 0.4 ? glassDark : glassDay));
        R(tx - 2, 170, 4, 14, dark > 0.4 ? glassDark : glassDay);
      }
    }

    // Visitors to the hall (drawn on the forecourt, below): a smooth count, 7
    // through office hours and 2 in the evening. Each passes through the
    // doors at the end of their walk (the start of it, coming out), when
    // the cycle wraps, so the great doors stand open as they reach the
    // threshold and the modern hall's revolving door turns a quarter each
    // time, easing up to speed and back to rest. DOOR_Y is the threshold.
    const DOOR_Y = hallStyle === 'modern' ? 206 : 196;
    const clamp01 = v => Math.max(0, Math.min(1, v));
    const ramp = (a, b) => clamp01((hr - a) / 0.5) * clamp01((b - hr) / 0.5);   // 0→1 over half an hour either end
    const visitors = on ? Math.max(7 * ramp(8, 17), 2 * ramp(16.5, 22)) : 0;
    let doorOpen = 0, doorQuarters = 0;
    for (let p = 0; p < 7; p++) {
      const present = clamp01(visitors - p);
      if (present <= 0) continue;
      const c = t*0.05 + hash(p + 60);
      doorOpen = Math.max(doorOpen, present * doorSwing((((c % 1) + 1.5) % 1 - 0.5) / 0.05));
      const w = 0.9*0.05, n = Math.floor(c + w), g = Math.min(1, (c + w - n) / (2*w));
      doorQuarters += n + g*g*(3 - 2*g);
    }
    const kit = { X, Y, S: u, R, poly };                                   // for doorLeaf (render_banks.js)
    // The four glass wings of a revolving door in a drum of radius r round
    // cx, from y0 to y1, sorted back to front so the near ones cover the far.
    const revolver = (cx, y0, y1, r, quarters, frame) => {
      const spin = quarters*0.25 + 0.125;
      const wings = [0, 1, 2, 3].map(i => (spin + i/4)*Math.PI*2).sort((a, b) => Math.sin(a) - Math.sin(b));
      for (const [i, a] of wings.entries()) {
        if (i === 2) R(cx - 0.4, y0, 0.8, y1 - y0, frame);                 // centre post, between back and front wings
        const x = cx + Math.cos(a)*r;
        R(Math.min(cx, x), y0, Math.abs(x - cx), y1 - y0, `rgba(200,225,235,${(0.12 + 0.3*Math.abs(Math.sin(a))).toFixed(2)})`);
        R(x - 0.3, y0, 0.6, y1 - y0, frame);
      }
      for (const sx of [cx - r - 0.6, cx + r]) R(sx, y0, 0.6, y1 - y0, frame);
    };

    // ── Centre block and portico ─────────────────────────────────────
    if (hallStyle === 'modern') {
      // ── Clock tower: a slender white blade rising behind the atrium ──
      R(109, -14, 22, 80, M_WHITE);
      R(109, -14, 3.5, 80, M_SHADE);
      R(129, -14, 2, 80, '#ffffff');
      mGlass(117, 22, 6, 40);                                            // glazed stair slot
      if (on && (office || evening || nightLit)) R(117, 22, 6, 40, 'rgba(255,224,170,0.55)');
      for (let y = 27; y < 62; y += 7) R(117, y, 6, 0.8, M_MULL);
      // minimalist clock: a dark bezel, a white face, twelve ticks
      if (nightLit && Camera.zoom > 0.5) {
        const g = ctx.createRadialGradient(X(120), Y(6), 0, X(120), Y(6), 22*u);
        g.addColorStop(0, 'rgba(200,240,255,0.4)'); g.addColorStop(1, 'rgba(200,240,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(120), Y(6), 22*u, 0, Math.PI*2); ctx.fill();
      }
      dot(120, 6, 9, '#1d252c');
      dot(120, 6, 7.6, nightLit ? '#eafaff' : '#f8fafb');
      for (let k = 0; k < 12; k++) {
        const a = k*Math.PI/6, r0 = k % 3 ? 6.2 : 5.2;
        ln(120 + Math.cos(a)*r0, 6 + Math.sin(a)*r0, 120 + Math.cos(a)*7, 6 + Math.sin(a)*7, '#1d252c', k % 3 ? 0.4 : 0.9);
      }
      const hA = (hr % 12) * Math.PI/6 - Math.PI/2, mA = ((hr*60) % 60) * Math.PI/30 - Math.PI/2;
      ln(120, 6, 120 + Math.cos(hA)*3.8, 6 + Math.sin(hA)*3.8, '#1d252c', 1.4);
      ln(120, 6, 120 + Math.cos(mA)*6, 6 + Math.sin(mA)*6, '#1d252c', 0.8);
      dot(120, 6, 1, '#c8683c');
      R(105, -17, 30, 3.2, '#f8fafb');                                   // cap slab
      R(105, -13.8, 30, 0.8, 'rgba(0,0,0,0.25)');
      if (nightLit) R(105, -17, 30, 0.9, M_LED);

      // ── Atrium: full-height glass hall ──
      R(72, 62, 96, 144, '#9aa4ac');
      mGlass(74, 64, 92, 142);
      // Lit hall: a faint cool wash by day, a warm golden glow after hours
      if (on && (evening || nightLit)) {
        const ag = ctx.createLinearGradient(0, Y(206), 0, Y(64));
        ag.addColorStop(0, 'rgba(255,196,112,0.9)'); ag.addColorStop(0.6, 'rgba(255,214,150,0.62)'); ag.addColorStop(1, 'rgba(255,232,190,0.4)');
        ctx.fillStyle = ag; ctx.fillRect(X(74), Y(64), 92*u, 142*u);
      } else if (on && office) R(74, 64, 92, 142, 'rgba(236,244,255,0.14)');
      // mezzanine floors seen through the glass
      for (const my of [98, 132, 166]) {
        R(74, my, 92, 2.4, 'rgba(236,240,244,0.9)');
        R(74, my + 2.4, 92, 0.8, 'rgba(0,0,0,0.25)');
        if (nightLit) R(74, my, 92, 0.7, M_LED);
      }
      // suspended sculpture: three tilted rings, glowing when lit
      const ringGlow = on && (office || evening || nightLit);
      ctx.lineWidth = 1.1*u;
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = ringGlow ? `rgba(255,${200 + k*18},${120 + k*40},0.95)` : '#c8683c';
        ctx.beginPath();
        ctx.ellipse(X(120), Y(117), (10 - k*2.6)*u, (4 + k*1.4)*u, Math.sin(t*0.4 + k*2.1)*0.6, 0, Math.PI*2);
        ctx.stroke();
      }
      ln(120, 100.4, 120, 112, 'rgba(40,50,60,0.6)', 0.4);
      // curtain-wall grid and slim aluminium fins outside it
      for (let mx = 74 + 92/8; mx < 166; mx += 92/8) ln(mx, 64, mx, 206, M_MULL, 0.5);
      for (let k = 0; k <= 6; k++) {
        const fx = 74 + k*92/6;
        R(fx - 1, 62, 2, 144, '#f2f4f6');
        R(fx + 1, 62, 0.8, 144, 'rgba(0,0,0,0.18)');
      }

      // ── Cantilevered canopy with the name in backlit letters ──
      // white by day; after dark its face reads dark so the letters glow
      poly([[50, 52], [190, 52], [186, 61], [54, 61]], nightLit && on ? '#26313a' : '#f6f8fa');
      R(54, 61, 132, 2, 'rgba(0,0,0,0.32)');
      R(50, 52, 140, 1.2, '#ffffff');
      if (nightLit) { R(54, 60, 132, 1, M_LED); R(50, 52, 140, 0.9, M_LED); }
      ctx.save();
      ctx.font = `600 ${Math.max(5, Math.round(6.4*u))}px 'Helvetica Neue', Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (nightLit && on) { ctx.shadowColor = 'rgba(150,232,255,0.9)'; ctx.shadowBlur = 6*u; ctx.fillStyle = '#eafcff'; }
      else ctx.fillStyle = '#26323c';
      ctx.fillText('C I T Y   H A L L', X(120), Y(56.8));
      ctx.restore();

      // ── Entrance: a glass portal under its own slab ──
      R(96, 170, 48, 36, M_WHITE);
      R(100, 174, 40, 32, '#1c242c');
      const doorLit = on && (office || nightLit || evening);
      if (doorLit) {
        // the lobby through the glass: reception desk, a planter, a pale floor
        R(101, 175, 38, 31, '#f6eedc');
        if (Camera.zoom > 0.5) for (const lx of [106, 134]) dot(lx, 178, 1, '#fff8e0');   // pendant lights
        R(132, 192, 4, 6, '#8a929a'); dot(134, 189.5, 3.4, '#4a8a4a'); dot(132.6, 188, 1.6, '#6aa85a');
        R(103.5, 189.8, 2.4, 3.2, '#2a5a7a'); dot(104.7, 188.6, 1.3, '#d8a878');   // receptionist
        R(102, 193, 12, 5, '#ffffff'); R(102, 193, 12, 0.8, M_LED);           // desk
        R(101, 198, 38, 8, '#dcd8d0');
        R(101, 175, 38, 31, 'rgba(255,232,186,0.3)');                        // warm glass
      } else R(101, 175, 38, 31, dark > 0.4 ? glassDark : glassDay);
      for (const dx of [110.5, 129.5]) ln(dx, 175, dx, 206, 'rgba(40,50,60,0.55)', 0.6);
      revolver(120, 181, 206, 6, doorQuarters, '#5a646e');                  // revolving door in its drum
      R(113.4, 179.6, 13.2, 1.6, '#3a424a');                                 // drum canopy
      R(92, 166, 56, 4, '#f8fafb');
      R(92, 170, 56, 1, 'rgba(0,0,0,0.3)');
      if (nightLit) R(92, 169.2, 56, 0.8, M_LED);
      // broad low plaza steps, no urns
      for (let i = 0; i < 3; i++) R(56 - i*4, 206 + i*2.6, 128 + i*8, 2.6, i % 2 ? '#e2e5e8' : '#d2d6da');
      for (const bx of [66, 80, 160, 174]) {                             // light bollards
        R(bx - 1.5, 207, 3, 5, '#3a424a');
        R(bx - 1.5, 207, 3, 1, nightLit ? '#bff0ff' : '#8a949c');
      }
    } else {
    R(76, 90, 88, 116, STONE);
    R(74, 88, 92, 4, TRIM);
    // Attic block: a square mass behind the pediment for the clock tower to
    // stand on, so the tower reads as rising out of the building instead of
    // perching on the pediment's point with sky either side. Its ledge sits
    // level with the pediment's apex. The Byzantine half-dome would hide it
    // completely, so that style draws its own tower base in front, below.
    if (hallStyle !== 'byzantine') {
      R(92, 62, 56, 30, STONE);
      R(92, 62, 3, 30, STONE_SH); R(145, 62, 3, 30, STONE_SH);
      R(90, 60, 60, 3, TRIM);
      R(90, 62.6, 60, 0.8, 'rgba(0,0,0,0.2)');
    }
    // pediment with carved relief
    if (hallStyle === 'gothic') {
      poly([[72, 90], [120, 50], [168, 90]], SLATE);
      for (const px2 of [72, 168]) { R(px2 - 3, 70, 6, 22, STONE_SH); poly([[px2 - 3, 70], [px2, 60], [px2 + 3, 70]], SLATE_HI); }
      dot(120, 78, 3.2, GOLD);
    } else if (hallStyle === 'deco') {
      R(78, 72, 84, 18, STONE_SH); R(92, 64, 56, 10, TRIM); R(106, 58, 28, 8, STONE_SH);
      ctx.strokeStyle = GOLD; ctx.lineWidth = 0.8*u;
      for (let k = 0; k < 9; k++) { const a = Math.PI + (k + 0.5)*Math.PI/9; ctx.beginPath(); ctx.moveTo(X(120), Y(88)); ctx.lineTo(X(120 + Math.cos(a)*30), Y(88 + Math.sin(a)*14)); ctx.stroke(); }
    } else if (hallStyle === 'modern') {
      R(66, 84, 108, 6, TRIM);                                       // cantilevered slab
      R(66, 89, 108, 1.2, 'rgba(0,0,0,0.3)');
    } else if (hallStyle === 'colonial') {
      // white pediment with a round fanlight
      poly([[70, 90], [120, 64], [170, 90]], TRIM);
      poly([[80, 88], [120, 69], [160, 88]], STONE);
      dot(120, 80, 5.5, TRIM);
      dot(120, 80, 4, (office || nightLit) ? 'rgba(255,212,140,0.85)' : (dark > 0.4 ? glassDark : glassDay));
      for (let k = 0; k < 6; k++) { const a = Math.PI + k*Math.PI/5; ln(120, 80, 120 + Math.cos(a)*4, 80 + Math.sin(a)*4, TRIM, 0.5); }
    } else if (hallStyle === 'chateau') {
      // tall central pavilion roof with a dormer
      poly([[72, 90], [120, 50], [168, 90]], SLATE);
      poly([[120, 50], [168, 90], [126, 90]], 'rgba(0,0,0,0.2)');
      R(112, 70, 16, 16, TRIM);
      poly([[109, 71], [120, 61], [131, 71]], SLATE_HI);
      R(114.5, 73, 11, 11, (office || nightLit) ? 'rgba(255,212,140,0.85)' : (dark > 0.4 ? glassDark : glassDay));
      ln(120, 73, 120, 84, TRIM, 0.8);
    } else if (hallStyle === 'pagoda') {
      // curved gable, eaves flicked up, gilt ridge ends
      poly([[62, 86], [72, 94], [168, 94], [178, 86], [154, 72], [86, 72]], SLATE);
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.6*u; ctx.beginPath();
      for (let rx = 80; rx < 162; rx += 4) { ctx.moveTo(X(rx), Y(73)); ctx.lineTo(X(rx + (rx - 120)*0.12), Y(93)); }
      ctx.stroke();
      R(86, 70, 68, 3, SLATE_HI);
      dot(86, 70, 2.4, GOLD); dot(154, 70, 2.4, GOLD);
      dot(120, 83, 3.4, GOLD); dot(120, 83, 2, TRIM);
    } else if (hallStyle === 'mission') {
      // curvilinear parapet with a quatrefoil
      poly([[70, 92], [70, 80], [84, 80], [90, 72], [102, 70], [108, 62], [132, 62], [138, 70], [150, 72], [156, 80], [170, 80], [170, 92]], STONE);
      ctx.strokeStyle = TRIM; ctx.lineWidth = 2*u; ctx.lineJoin = 'round'; ctx.beginPath();
      for (const [i, [qx, qy]] of [[70, 80], [84, 80], [90, 72], [102, 70], [108, 62], [132, 62], [138, 70], [150, 72], [156, 80], [170, 80]].entries()) i ? ctx.lineTo(X(qx), Y(qy)) : ctx.moveTo(X(qx), Y(qy));
      ctx.stroke();
      for (const [ox, oy] of [[-2.5, 0], [2.5, 0], [0, -2.5], [0, 2.5]]) dot(120 + ox, 76 + oy, 2.6, STONE_SH);
      for (const [ox, oy] of [[-2.5, 0], [2.5, 0], [0, -2.5], [0, 2.5]]) dot(120 + ox, 76 + oy, 1.6, (office || nightLit) ? 'rgba(255,212,140,0.85)' : glassDay);
    } else if (hallStyle === 'solarpunk') {
      // green gable faced with solar panels
      poly([[68, 92], [120, 64], [172, 92]], COPPER);
      ctx.strokeStyle = 'rgba(160,200,240,0.45)'; ctx.lineWidth = 0.5*u; ctx.beginPath();
      for (let k = 1; k < 8; k++) { const f = k/8; ctx.moveTo(X(68 + f*52), Y(92 - f*28)); ctx.lineTo(X(172 - f*52), Y(92 - f*28)); }
      ctx.moveTo(X(120), Y(64)); ctx.lineTo(X(120), Y(92)); ctx.stroke();
      ln(68, 92, 120, 64, TRIM, 1.6); ln(120, 64, 172, 92, TRIM, 1.6);
      for (let k = 0; k < 10; k++) dot(70 + k*11.2, 91, 2, k % 2 ? SLATE_HI : SLATE);
    } else if (hallStyle === 'tudor') {
      // big plastered gable end: king post, braces and heavy bargeboards
      poly([[70, 92], [120, 54], [170, 92]], STONE);
      ln(120, 56, 120, 92, TRIM, 2.2);
      ln(120, 70, 98, 92, TRIM, 1.8); ln(120, 70, 142, 92, TRIM, 1.8);
      R(80, 80, 80, 2.2, TRIM);
      ln(68, 93, 120, 53, TRIM, 3); ln(120, 53, 172, 93, TRIM, 3);
      dot(120, 53, 2, GOLD);
    } else if (hallStyle === 'brutalist') {
      // a stack of blunt concrete blocks with fins
      R(74, 70, 92, 22, STONE);
      for (let k = 0; k < 12; k++) R(75 + k*7.6, 72, 3, 18, STONE_SH);
      R(72, 68, 96, 3, TRIM);
      R(74, 91, 92, 1.5, 'rgba(0,0,0,0.35)');
    } else if (hallStyle === 'stave') {
      // steep shingled porch gable with crossed dragon heads
      poly([[70, 92], [120, 48], [170, 92]], SLATE);
      poly([[120, 48], [170, 92], [126, 92]], 'rgba(0,0,0,0.25)');
      for (let y = 54; y < 92; y += 4) { const f = (y - 48)/44, half = f*50; for (let sx = -half + 2; sx < half; sx += 4) dot(120 + sx, y, 1.3, SLATE_HI); }
      ln(70, 92, 120, 48, TRIM, 2); ln(120, 48, 170, 92, TRIM, 2);
      for (const s of [-1, 1]) {
        ctx.strokeStyle = TRIM; ctx.lineWidth = 1.8*u; ctx.lineCap = 'round'; ctx.beginPath();
        ctx.moveTo(X(120), Y(48)); ctx.quadraticCurveTo(X(120 + s*8), Y(36), X(120 + s*13), Y(40)); ctx.stroke();
        ctx.lineCap = 'butt';
        dot(120 + s*13, 40, 1.4, '#b8402a');
      }
    } else if (hallStyle === 'prairie') {
      // broad low hip over the entrance, banded in limestone
      poly([[60, 94], [86, 78], [154, 78], [180, 94]], SLATE);
      poly([[154, 78], [180, 94], [160, 94]], 'rgba(0,0,0,0.18)');
      R(60, 93, 120, 2, TRIM);
      R(60, 95, 120, 2.5, 'rgba(0,0,0,0.3)');
    } else if (hallStyle === 'atomic') {
      // an upswept canopy wing with a starburst
      poly([[62, 98], [120, 72], [178, 98], [178, 102], [120, 78], [62, 102]], SLATE);
      for (let k = 0; k < 12; k++) { const a = k*Math.PI/6; ln(120, 86, 120 + Math.cos(a)*(k % 2 ? 4 : 8), 86 + Math.sin(a)*(k % 2 ? 4 : 8), GOLD, 0.9); }
      dot(120, 86, 2, HP.dome);
    } else if (hallStyle === 'byzantine') {
      ctx.fillStyle = TRIM; ctx.beginPath(); ctx.arc(X(120), Y(90), 48*u, Math.PI, 0); ctx.fill();
      ctx.fillStyle = STONE_SH; ctx.beginPath(); ctx.arc(X(120), Y(90), 42*u, Math.PI, 0); ctx.fill();
      for (let k = 0; k < 5; k++) dot(96 + k*12, 82, 3, k % 2 ? GOLD : '#2f6e8a');   // mosaic roundels
      // The tower rises in front of the half-dome, footed on the entablature,
      // rather than hovering over the middle of it.
      R(102, 64, 36, 42, STONE);
      R(102, 64, 3, 42, STONE_SH); R(135, 64, 3, 42, STONE_SH);
      R(100, 88, 40, 2.5, TRIM);                                     // string course at the roofline
      for (let y = 92; y < 104; y += 6) R(102, y, 36, 2.5, 'rgba(160,70,50,0.35)');   // ablaq banding
      ctx.fillStyle = TRIM; ctx.beginPath(); ctx.arc(X(120), Y(76), 6*u, Math.PI, 0); ctx.fill();
      R(114, 76, 12, 9, TRIM);
      ctx.fillStyle = (office || nightLit) ? 'rgba(255,212,140,0.85)' : (dark > 0.4 ? glassDark : glassDay);
      ctx.beginPath(); ctx.moveTo(X(115.5), Y(85)); ctx.lineTo(X(115.5), Y(76)); ctx.arc(X(120), Y(76), 4.5*u, Math.PI, 0); ctx.lineTo(X(124.5), Y(85)); ctx.closePath(); ctx.fill();
    } else {
    poly([[70, 90], [120, 62], [170, 90]], TRIM);
    poly([[80, 88], [120, 67], [160, 88]], STONE_SH);
    for (let k = 0; k < 5; k++) dot(96 + k*12, 83, 2.2, TRIM);      // relief figures
    dot(120, 76, 3.2, GOLD);                                         // civic seal
    }
    // entablature with the name
    R(72, 104, 96, 12, TRIM);
    R(72, 115, 96, 2, STONE_SH);
    // pagoda's sign board is red lacquer, tudor's dark oak
    ctx.fillStyle = hallStyle === 'pagoda' ? GOLD : hallStyle === 'tudor' ? '#efe6d2' : '#5a5242';
    ctx.font = `bold ${Math.max(5, Math.round(7.5*u))}px Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('CITY HALL', X(120), Y(110.5));
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    // shadowed loggia behind the columns, with the great doors
    const LOGGIA = { gothic: '#4e4a44', colonial: '#6a3a2c', pagoda: '#6a3a2a', mission: '#bdb09a', solarpunk: '#6a7458',
                     tudor: '#5a4a3a', brutalist: '#3e4044', stave: '#2e2018', prairie: '#4a3a30', atomic: '#3a5a6a' };
    R(78, 117, 84, 79, hallStyle === 'modern' ? (dark > 0.4 ? glassDark : glassDay) : (LOGGIA[hallStyle] || '#8e8470'));
    const doorLit = on && (office || nightLit);
    for (const [dx, dw, dh] of [[112, 16, 34], [90, 10, 24], [140, 10, 24]]) {
      R(dx - 1.5, 196 - dh - 1.5, dw + 3, dh + 1.5, TRIM);
      ctx.fillStyle = TRIM; ctx.beginPath(); ctx.arc(X(dx + dw/2), Y(196 - dh), (dw/2 + 1.5)*u, Math.PI, 0); ctx.fill();
      ctx.fillStyle = dx === 112 ? '#4a3222' : (doorLit ? 'rgba(255,212,140,0.8)' : (dark > 0.4 ? glassDark : glassDay));
      ctx.beginPath(); ctx.moveTo(X(dx), Y(196)); ctx.lineTo(X(dx), Y(196 - dh)); ctx.arc(X(dx + dw/2), Y(196 - dh), (dw/2)*u, Math.PI, 0); ctx.lineTo(X(dx + dw), Y(196)); ctx.closePath(); ctx.fill();
    }
    // The great doors part as visitors reach them, onto the lobby: a red
    // carpet running to the grand staircase under a chandelier.
    const lobby = () => {
      R(112, 162, 16, 34, doorLit ? '#ecd8b0' : '#4a4034');
      for (let i = 0; i < 6; i++) R(114 + i*0.8, 186 - i*3, 12 - i*1.6, 3, i % 2 ? STONE : TRIM);   // staircase
      R(118.6, 171, 2.8, 25, '#8a2a2a');                                    // carpet
      R(112, 189, 16, 7, doorLit ? '#d8ccb4' : '#3a342c');
      for (let x = 112, i = 0; x < 128; x += 2, i++) for (let y = 189, j = 0; y < 196; y += 2, j++) if ((i + j) % 2) R(x, y, 2, 2, 'rgba(0,0,0,0.1)');
      R(118.6, 189, 2.8, 7, '#8a2a2a');
      if (doorLit) dot(120, 166, 1.6, '#fff4c8');                          // chandelier
    };
    const leafL = doorLeaf(kit, 112, 112, 120, 162, 196, doorOpen, '#4a3222', lobby, '#2e2016');
    const leafR = doorLeaf(kit, 128, 120, 128, 162, 196, doorOpen, '#4a3222', lobby, '#2e2016');
    if (doorOpen < 0.05) ln(120, 162, 120, 196, '#2e2016', 0.8);
    dot(leafL(117.5), 180, 0.9, GOLD); dot(leafR(122.5), 180, 0.9, GOLD);
    ctx.fillStyle = doorLit ? 'rgba(255,212,140,0.9)' : (dark > 0.4 ? glassDark : glassDay);   // fanlight
    ctx.beginPath(); ctx.arc(X(120), Y(162), 7*u, Math.PI, 0); ctx.fill();
    // columns: fluted (beaux), clustered piers (gothic), square fins (deco),
    // slim pilotis (modern), striped round columns (byzantine)
    if (hallStyle === 'gothic') {
      for (let i = 0; i < 4; i++) { const cxp = 84 + i*24; R(cxp - 3, 118, 6, 78, STONE_SH); R(cxp - 1, 118, 2, 78, TRIM); poly([[cxp - 3, 118], [cxp, 110], [cxp + 3, 118]], STONE_SH); }
    } else if (hallStyle === 'deco') {
      for (let i = 0; i < 5; i++) { const cxp = 84 + i*18; R(cxp - 3, 117, 6, 79, TRIM); R(cxp - 1, 117, 2, 79, GOLD); }
    } else if (hallStyle === 'modern') {
      for (let i = 0; i < 7; i++) R(80 + i*13.3 - 1, 117, 2, 79, '#e8ecf0');
    } else if (hallStyle === 'colonial') {
      for (let i = 0; i < 4; i++) {
        const cxp = 86 + i*22.7;
        R(cxp - 4, 118, 8, 3, TRIM);
        const cg = ctx.createLinearGradient(X(cxp - 3), 0, X(cxp + 3), 0);
        cg.addColorStop(0, '#cfc8b8'); cg.addColorStop(0.45, '#ffffff'); cg.addColorStop(1, '#cfc8b8');
        ctx.fillStyle = cg; ctx.fillRect(X(cxp - 3), Y(121), 6*u, 72*u);
        R(cxp - 4, 193, 8, 3, TRIM);
      }
    } else if (hallStyle === 'pagoda') {
      for (let i = 0; i < 4; i++) {
        const cxp = 86 + i*22.7;
        R(cxp - 4, 118, 8, 78, TRIM);
        R(cxp - 2.5, 118, 1.5, 78, 'rgba(255,255,255,0.18)');
        for (const by of [120, 190]) R(cxp - 4.5, by, 9, 2.4, GOLD);
      }
      R(76, 116, 88, 3, TRIM);                                          // lacquered lintel
    } else if (hallStyle === 'mission') {
      // an arcade of round arches instead of columns
      const bw = 84/5;
      R(78, 117, 84, 14, STONE);
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = '#bdb09a';
        ctx.beginPath(); ctx.arc(X(78 + i*bw + bw/2), Y(131), (bw/2 - 2.5)*u, Math.PI, 0); ctx.fill();
      }
      for (let i = 0; i <= 5; i++) R(78 + i*bw - 2.5, 124, 5, 72, STONE);
    } else if (hallStyle === 'solarpunk') {
      for (let i = 0; i < 5; i++) {
        const cxp = 84 + i*18;
        R(cxp - 2, 117, 4, 79, STONE_SH);
        for (let y = 122; y < 194; y += 5) dot(cxp + Math.sin(y*0.5 + i)*2.2, y, 1.3, y % 10 ? '#4a8a3a' : '#3a6e2e');
      }
    } else if (hallStyle === 'tudor') {
      // oak posts with curved brackets
      for (let i = 0; i < 4; i++) {
        const cxp = 86 + i*22.7;
        R(cxp - 2.5, 117, 5, 79, TRIM);
        for (const s of [-1, 1]) { ctx.strokeStyle = TRIM; ctx.lineWidth = 1.6*u; ctx.beginPath(); ctx.moveTo(X(cxp), Y(128)); ctx.quadraticCurveTo(X(cxp + s*2), Y(119), X(cxp + s*8), Y(118)); ctx.stroke(); }
      }
    } else if (hallStyle === 'brutalist') {
      // three massive board-formed piers
      for (const cxp of [92, 120, 148]) {
        R(cxp - 6, 117, 12, 79, STONE);
        R(cxp - 6, 117, 2.5, 79, STONE_SH);
        for (let y = 121; y < 196; y += 4) ln(cxp - 6, y, cxp + 6, y, 'rgba(70,66,60,0.3)', 0.4);
      }
    } else if (hallStyle === 'stave') {
      // carved posts with cushion capitals and St Andrew's-cross bracing
      const posts = [84, 102, 120, 138, 156];
      for (let i = 0; i < posts.length - 1; i++) { ln(posts[i], 124, posts[i + 1], 150, TRIM, 1); ln(posts[i + 1], 124, posts[i], 150, TRIM, 1); }
      for (const cxp of posts) { R(cxp - 2.5, 117, 5, 79, STONE_SH); dot(cxp, 120, 3.2, TRIM); R(cxp - 3, 192, 6, 4, TRIM); }
    } else if (hallStyle === 'prairie') {
      // wide brick piers with limestone caps and planters
      for (const cxp of [86, 120, 154]) {
        R(cxp - 7, 117, 14, 79, STONE);
        ctx.strokeStyle = 'rgba(70,30,16,0.3)'; ctx.lineWidth = 0.5*u; ctx.beginPath();
        for (let y = 122; y < 196; y += 2.6) { ctx.moveTo(X(cxp - 7), Y(y)); ctx.lineTo(X(cxp + 7), Y(y)); }
        ctx.stroke();
        R(cxp - 8, 117, 16, 4, TRIM);
      }
    } else if (hallStyle === 'atomic') {
      // slanted V struts in coral
      for (const cxp of [88, 120, 152]) {
        ln(cxp - 8, 196, cxp, 118, HP.dome, 2.6);
        ln(cxp + 8, 196, cxp, 118, HP.dome, 2.6);
        dot(cxp, 118, 1.8, GOLD);
      }
    } else if (hallStyle === 'byzantine') {
      for (let i = 0; i < 6; i++) { const cxp = 82 + i*15.2; R(cxp - 3.5, 118, 7, 3, GOLD); for (let y = 121; y < 193; y += 6) R(cxp - 3, y, 6, 3, (y/6|0) % 2 ? TRIM : SLATE_HI); R(cxp - 4, 193, 8, 3, TRIM); }
    } else
    for (let i = 0; i < 6; i++) {
      const cxp = 82 + i*15.2;
      R(cxp - 3.5, 118, 7, 3, TRIM);                        // capital
      const cg = ctx.createLinearGradient(X(cxp - 3), 0, X(cxp + 3), 0);
      cg.addColorStop(0, STONE_SH); cg.addColorStop(0.45, TRIM); cg.addColorStop(1, STONE_SH);
      ctx.fillStyle = cg; ctx.fillRect(X(cxp - 3), Y(121), 6*u, 72*u);
      ln(cxp - 1, 122, cxp - 1, 192, 'rgba(120,110,92,0.35)', 0.5);
      ln(cxp + 1, 122, cxp + 1, 192, 'rgba(120,110,92,0.35)', 0.5);
      R(cxp - 4, 193, 8, 3, TRIM);                          // base
    }

    // ── Stairs ───────────────────────────────────────────────────────
    for (let i = 0; i < 6; i++) {
      const w = 96 + i*12, y = 196 + i*2.7;
      R(120 - w/2, y, w, 2.7, i % 2 ? '#e4ddca' : '#d4ccb7');
      R(120 - w/2, y + 2.2, w, 0.5, 'rgba(0,0,0,0.18)');
    }
    // cheek walls with urns
    for (const sx of [64, 170]) {
      R(sx, 196, 6, 16, STONE_SH);
      R(sx - 1, 194, 8, 2.5, TRIM);
      dot(sx + 3, 190, 3, TRIM); R(sx + 1.5, 190, 3, 4, TRIM);
    }

    // ── Clock tower, dome, lantern, flag ─────────────────────────────
    // tower stage
    R(100, 30, 40, 36, STONE);
    R(98, 28, 44, 3, TRIM);
    R(98, 64, 44, 3, TRIM);
    R(100, 30, 3, 36, STONE_SH); R(137, 30, 3, 36, STONE_SH);
    // clock face
    const clX = 120, clY = 47, clR = 12.5;
    if (nightLit && Camera.zoom > 0.5) {
      const g = ctx.createRadialGradient(X(clX), Y(clY), 0, X(clX), Y(clY), clR*2.4*u);
      g.addColorStop(0, 'rgba(255,236,180,0.45)'); g.addColorStop(1, 'rgba(255,236,180,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(clX), Y(clY), clR*2.4*u, 0, Math.PI*2); ctx.fill();
    }
    dot(clX, clY, clR + 2, GOLD);
    dot(clX, clY, clR, nightLit ? '#fff4d6' : '#f6f0e0');
    ctx.strokeStyle = '#3a3226'; ctx.lineWidth = 0.9*u;
    for (let k = 0; k < 12; k++) {
      const a = k * Math.PI/6, r0 = k % 3 === 0 ? clR - 3.2 : clR - 2;
      ctx.beginPath(); ctx.moveTo(X(clX + Math.cos(a)*r0), Y(clY + Math.sin(a)*r0)); ctx.lineTo(X(clX + Math.cos(a)*(clR - 0.8)), Y(clY + Math.sin(a)*(clR - 0.8))); ctx.stroke();
    }
    const hrA  = (hr % 12) * Math.PI/6 - Math.PI/2;
    const minA = ((hr * 60) % 60) * Math.PI/30 - Math.PI/2;
    ln(clX, clY, clX + Math.cos(hrA)*clR*0.52, clY + Math.sin(hrA)*clR*0.52, '#1e1a14', 2.2);
    ln(clX, clY, clX + Math.cos(minA)*clR*0.8, clY + Math.sin(minA)*clR*0.8, '#1e1a14', 1.3);
    dot(clX, clY, 1.4, GOLD);
    // belfry arches
    R(104, 18, 32, 11, STONE);
    for (let k = 0; k < 3; k++) {
      const ax = 107 + k*10;
      ctx.fillStyle = nightLit ? 'rgba(255,212,140,0.55)' : '#3a3630';
      ctx.beginPath(); ctx.moveTo(X(ax), Y(28)); ctx.lineTo(X(ax), Y(22)); ctx.arc(X(ax + 3), Y(22), 3*u, Math.PI, 0); ctx.lineTo(X(ax + 6), Y(28)); ctx.closePath(); ctx.fill();
    }
    R(102, 16, 36, 2.5, TRIM);
    if (hallStyle === 'mission') for (let k = 0; k < 3; k++) { const sw = Math.sin(t*1.6 + k)*0.6; dot(110 + k*10 + sw, 24.5, 2.3, GOLD); R(109.5 + k*10 + sw, 21, 1, 2, '#3a3026'); }
    }
    // crown: each style tops the tower differently, ending at a mast
    // that carries the city flag
    const dg = ctx.createRadialGradient(X(113), Y(6), 1, X(120), Y(16), 18*u);
    dg.addColorStop(0, HP.domeHi); dg.addColorStop(0.6, COPPER); dg.addColorStop(1, COPPER_SH);
    let mastTop = -6, mastX = 120;
    if (hallStyle === 'colonial') {
      // white octagonal cupola and slim spire
      R(108, 4, 24, 12, TRIM);
      R(108, 4, 3, 12, HP.domeSh);
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = nightLit ? 'rgba(255,212,140,0.6)' : '#3a3630';
        ctx.beginPath(); ctx.moveTo(X(111 + k*7), Y(15)); ctx.lineTo(X(111 + k*7), Y(9)); ctx.arc(X(113 + k*7), Y(9), 2*u, Math.PI, 0); ctx.lineTo(X(115 + k*7), Y(15)); ctx.closePath(); ctx.fill();
      }
      R(106, 2, 28, 2.5, TRIM);
      poly([[108, 2], [120, -6], [132, 2]], HP.domeSh);
      poly([[116, -4], [120, -22], [124, -4]], TRIM);
      poly([[120, -22], [124, -4], [121.5, -4]], 'rgba(0,0,0,0.15)');
      dot(120, -22, 1.4, GOLD);
      mastTop = -22;
    } else if (hallStyle === 'chateau') {
      // steep pavilion roof with gilt cresting and a spike
      poly([[98, 17], [110, -14], [130, -14], [142, 17]], SLATE);
      poly([[130, -14], [142, 17], [128, 17]], 'rgba(0,0,0,0.22)');
      R(110, -16, 20, 2, GOLD);
      for (let k = 0; k < 5; k++) ln(111 + k*4.5, -16, 111 + k*4.5, -19, GOLD, 0.7);
      for (const lx of [110, 124]) { R(lx, 2, 6, 8, TRIM); R(lx + 1.2, 3.5, 3.6, 5.5, nightLit ? 'rgba(255,212,140,0.7)' : '#2a2e36'); }
      mastTop = -16;
    } else if (hallStyle === 'pagoda') {
      // three diminishing tiers of upturned eaves, then a gilt finial
      for (const [yb, hw, hh] of [[17, 26, 8], [6, 20, 7], [-4, 14, 6]]) {
        R(120 - hw + 8, yb - hh - 5, 2*(hw - 8), 5, TRIM);
        poly([[120 - hw - 6, yb - 5], [120 - hw + 2, yb], [120 + hw - 2, yb], [120 + hw + 6, yb - 5], [120 + hw - 7, yb - hh], [120 - hw + 7, yb - hh]], SLATE);
        R(120 - hw + 7, yb - hh - 1, 2*(hw - 7), 1.8, SLATE_HI);
        dot(120 - hw - 6, yb - 5, 1.2, GOLD); dot(120 + hw + 6, yb - 5, 1.2, GOLD);
      }
      ln(120, -10, 120, -26, GOLD, 1.3);
      for (let y = -13; y > -24; y -= 3) dot(120, y, 1.5, GOLD);
      mastTop = -26;
    } else if (hallStyle === 'mission') {
      // little tiled dome over the belfry
      R(108, 8, 24, 8, TRIM);
      for (let k = 0; k < 4; k++) R(110.5 + k*5.3, 9.5, 2.4, 5, nightLit ? 'rgba(255,212,140,0.7)' : '#3a3630');
      ctx.fillStyle = dg; ctx.beginPath(); ctx.ellipse(X(120), Y(8), 13*u, 11*u, 0, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(90,30,10,0.4)'; ctx.lineWidth = 0.6*u;
      for (const k of [-8, -3, 3, 8]) { ctx.beginPath(); ctx.moveTo(X(120 + k), Y(8)); ctx.quadraticCurveTo(X(120 + k*0.5), Y(0), X(120), Y(-3)); ctx.stroke(); }
      R(118, -7, 4, 5, TRIM);
      dot(120, -8, 1.6, GOLD);
      mastTop = -8;
    } else if (hallStyle === 'solarpunk') {
      // green roof, and a small wind turbine turning on top of the tower
      R(100, 9, 40, 7, SLATE);
      for (let k = 0; k < 7; k++) dot(102 + k*6, 9.5, 2.4, k % 2 ? SLATE_HI : '#3f6a30');
      const hubX = 128, hubY = -24;
      ln(hubX, 9, hubX, hubY, '#e8ecef', 1.5);
      R(hubX - 2, hubY - 1.5, 6, 3, '#e8ecef');
      const spin = on ? t*2.2 : 0.4;
      for (let k = 0; k < 3; k++) {
        const a = spin + k*Math.PI*2/3;
        ctx.strokeStyle = '#f4f6f8'; ctx.lineWidth = 1.8*u; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(X(hubX), Y(hubY)); ctx.lineTo(X(hubX + Math.cos(a)*14), Y(hubY + Math.sin(a)*14)); ctx.stroke();
        ctx.lineCap = 'butt';
      }
      dot(hubX, hubY, 1.6, '#c8ccd0');
      mastX = 108; mastTop = 9;   // the flag flies from the roof beside the turbine
    } else if (hallStyle === 'gothic') {
      // pinnacles and a slate spire
      for (const px2 of [103, 137]) poly([[px2 - 3, 16], [px2, 2], [px2 + 3, 16]], SLATE_HI);
      poly([[106, 16], [120, -30], [134, 16]], SLATE);
      poly([[120, -30], [134, 16], [124, 16]], 'rgba(0,0,0,0.22)');
      for (let y = 4; y < 16; y += 5) R(118, y, 4, 2.5, nightLit ? 'rgba(255,212,140,0.7)' : '#2a2e36');
      dot(120, -30, 1.4, GOLD);
      mastTop = -30;
    } else if (hallStyle === 'deco') {
      // stepped setbacks with a sunburst and gold needle
      R(106, 8, 28, 8, TRIM); R(110, 1, 20, 7, STONE); R(114, -5, 12, 6, TRIM);
      ctx.strokeStyle = GOLD; ctx.lineWidth = 0.8*u;
      for (let k = 0; k < 7; k++) { const a = Math.PI + (k + 0.5)*Math.PI/7; ctx.beginPath(); ctx.moveTo(X(120), Y(15)); ctx.lineTo(X(120 + Math.cos(a)*11), Y(15 + Math.sin(a)*6)); ctx.stroke(); }
      for (const vx of [111, 128]) R(vx, 1, 1.2, 7, GOLD);
      R(119, -5, 2, 5, nightLit ? 'rgba(255,220,140,0.95)' : GOLD);
      mastTop = -5;
    } else if (hallStyle === 'byzantine') {
      // gilded onion dome on an arcaded drum
      R(108, 10, 24, 6, TRIM);
      for (let k = 0; k < 4; k++) R(110 + k*5.5, 11, 2.5, 4, nightLit ? 'rgba(255,212,140,0.7)' : '#3a3630');
      ctx.fillStyle = dg; ctx.beginPath();
      ctx.moveTo(X(106), Y(10));
      ctx.bezierCurveTo(X(100), Y(-2), X(114), Y(-6), X(120), Y(-14));
      ctx.bezierCurveTo(X(126), Y(-6), X(140), Y(-2), X(134), Y(10));
      ctx.closePath(); ctx.fill();
      dot(120, -14, 1.6, GOLD);
      mastTop = -14;
    } else if (hallStyle === 'tudor') {
      // louvred oak lantern under a lead spirelet and weathervane
      R(108, 4, 24, 12, TRIM);
      for (let k = 0; k < 3; k++) for (let y = 6; y < 15; y += 2.5) R(110.5 + k*7, y, 5, 1.2, nightLit ? 'rgba(255,212,140,0.7)' : '#6a5a4a');
      R(106, 2, 28, 2.5, TRIM);
      poly([[107, 2], [120, -26], [133, 2]], COPPER);
      poly([[120, -26], [133, 2], [123, 2]], 'rgba(0,0,0,0.22)');
      ln(116, -30, 124, -30, GOLD, 0.8);                    // weathervane arrow
      mastTop = -26;
    } else if (hallStyle === 'brutalist') {
      // a blank concrete cube with a few slot windows
      R(106, 0, 28, 16, STONE);
      R(106, 0, 3, 16, STONE_SH);
      for (let k = 0; k < 3; k++) R(113 + k*6.5, 4, 2.2, 9, nightLit ? 'rgba(255,220,160,0.75)' : '#3a3e44');
      R(104, -2, 32, 2.5, TRIM);
      mastTop = -2;
    } else if (hallStyle === 'stave') {
      // stacked shingle tiers and a needle spire, dragon heads on the eaves
      poly([[98, 17], [120, 2], [142, 17]], SLATE);
      R(111, -4, 18, 7, STONE);
      for (let k = 0; k < 3; k++) R(113 + k*5.5, -2.5, 2.4, 4, nightLit ? 'rgba(255,212,140,0.7)' : '#1e1814');
      poly([[106, -3], [120, -14], [134, -3]], SLATE);
      poly([[116, -12], [120, -36], [124, -12]], SLATE_HI);
      for (const [ex, ey, s] of [[98, 17, -1], [142, 17, 1], [106, -3, -1], [134, -3, 1]]) {
        ctx.strokeStyle = TRIM; ctx.lineWidth = 1.2*u; ctx.lineCap = 'round'; ctx.beginPath();
        ctx.moveTo(X(ex), Y(ey)); ctx.quadraticCurveTo(X(ex + s*3), Y(ey - 5), X(ex + s*6), Y(ey - 3)); ctx.stroke();
        ctx.lineCap = 'butt';
      }
      mastTop = -36;
    } else if (hallStyle === 'prairie') {
      // a low hipped cap with deep eaves, like the wings
      poly([[92, 17], [108, 6], [132, 6], [148, 17]], SLATE);
      poly([[132, 6], [148, 17], [136, 17]], 'rgba(0,0,0,0.18)');
      R(92, 16, 56, 1.8, TRIM);
      mastTop = 6;
    } else if (hallStyle === 'atomic') {
      // a flying saucer on a needle, ringed by blinking rim lights
      R(118.5, -6, 3, 22, HP.stoneSh);
      ctx.fillStyle = glassDay; ctx.beginPath(); ctx.ellipse(X(120), Y(-10), 7*u, 6*u, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = dg; ctx.beginPath(); ctx.ellipse(X(120), Y(-9), 17*u, 4.5*u, 0, 0, Math.PI*2); ctx.fill();
      for (let k = 0; k < 6; k++) dot(106 + k*5.6, -8.2, 1, Math.sin(t*4 + k) > 0 ? '#fff4b0' : HP.domeSh);
      ctx.strokeStyle = GOLD; ctx.lineWidth = 0.7*u; ctx.beginPath(); ctx.ellipse(X(120), Y(-24), 6*u, 2.2*u, 0.5, 0, Math.PI*2); ctx.stroke();
      ln(120, -16, 120, -30, '#8a8a8e', 0.8);
      dot(120, -24, 1.4, HP.dome);
      mastTop = -12; mastX = 132;   // flag flies from the saucer rim
    } else if (hallStyle === 'modern') {
      // needle spire off the tower cap, aircraft light blinking at its tip;
      // the flag flies from the other end of the cap
      ln(114, -17, 114, -50, '#a4adb4', 1.1);
      for (const y of [-26, -35, -43]) ln(112.5, y, 115.5, y, '#a4adb4', 0.6);
      dot(114, -51, 1.4, on && Math.sin(t*3) > 0 ? '#ff3a30' : '#6a2a26');
      mastX = 128; mastTop = -17;
    } else {
      // Beaux-Arts verdigris dome with lantern
      ctx.fillStyle = dg; ctx.beginPath(); ctx.ellipse(X(120), Y(16), 16*u, 13*u, 0, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(30,70,58,0.5)'; ctx.lineWidth = 0.7*u;
      for (const k of [-10, -4, 4, 10]) { ctx.beginPath(); ctx.moveTo(X(120 + k), Y(16)); ctx.quadraticCurveTo(X(120 + k*0.55), Y(6), X(120), Y(3)); ctx.stroke(); }
      R(116.5, -2, 7, 6, TRIM);
      R(118, -1, 4, 4, nightLit ? 'rgba(255,220,140,0.95)' : '#4a4a44');
      poly([[115.5, -2], [120, -6], [124.5, -2]], COPPER);
    }
    // flag mast + the city flag
    const fTop = Math.min(-22, mastTop - 14);
    ln(mastX, mastTop, mastX, fTop, '#6a6660', 1);
    dot(mastX, fTop - 0.5, 1.2, GOLD);
    if (on) wavingFlag(mastX, fTop + 1, 16, 9, Math.sin(t*2.4)*1.6);

    // ── Forecourt: flagpoles and lamp standards ──────────────────────
    [22, 34, 206, 218].forEach((fx, k) => {
      R(fx - 2, 234, 4, 3, '#8a8474');
      ln(fx, 234, fx, 190, '#8a8a86', 1);
      dot(fx, 189.5, 1, GOLD);
      wavingFlag(fx, 191, 12, 7, Math.sin(t*2 + k)*1.4);
    });
    for (const lx of [52, 188]) {
      if (nightLit && Camera.zoom > 0.5) {
        const g = ctx.createRadialGradient(X(lx), Y(212), 0, X(lx), Y(212), 26*u);
        g.addColorStop(0, 'rgba(255,214,140,0.45)'); g.addColorStop(1, 'rgba(255,214,140,0)');
        ctx.fillStyle = g; ctx.fillRect(X(lx - 26), Y(190), 52*u, 48*u);
      }
      R(lx - 2.5, 232, 5, 4, '#2a2a2c');
      ln(lx, 232, lx, 204, '#2a2a2c', 1.6);
      ln(lx - 6, 206, lx + 6, 206, '#2a2a2c', 1.2);
      for (const ox of [-6, 0, 6]) dot(lx + ox, ox ? 204.5 : 201.5, 2.2, nightLit ? '#ffe6a8' : '#e8e4d8');
    }
    // Modernist forecourt: twin reflecting pools with fountain jets
    if (hallStyle === 'modern') {
      for (const x0 of [60, 136]) {
        R(x0 - 1.5, 212.5, 47, 11, '#e6e9ec');
        const wg = ctx.createLinearGradient(0, Y(214), 0, Y(222));
        if (nightLit) { wg.addColorStop(0, '#1d6a86'); wg.addColorStop(1, '#2fa6c8'); }
        else { wg.addColorStop(0, '#3e7fa6'); wg.addColorStop(1, '#7cc0dc'); }
        ctx.fillStyle = wg; ctx.fillRect(X(x0), Y(214), 44*u, 8*u);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.4*u;
        for (let k = 0; k < 3; k++) {
          const ph = ((t*0.5 + k/3) % 1);
          ctx.beginPath(); ctx.ellipse(X(x0 + 22), Y(218), (3 + ph*16)*u, (0.8 + ph*2.4)*u, 0, 0, Math.PI*2);
          ctx.globalAlpha = 1 - ph; ctx.stroke(); ctx.globalAlpha = 1;
        }
        if (on) {
          for (let j = 0; j < 5; j++) {
            const jx = x0 + 6 + j*8, hgt = 5 + Math.sin(t*3 + j*1.3 + x0)*1.2;
            ln(jx, 218, jx, 218 - hgt, 'rgba(235,248,255,0.85)', 0.6);
            dot(jx, 218 - hgt, 0.9, 'rgba(255,255,255,0.9)');
          }
        }
      }
    }
    // clipped planters either side of the stairs
    for (const bx of [8, 212]) {
      R(bx, 222, 20, 10, STONE_SH); R(bx - 1, 221, 22, 2, TRIM);
      for (let k = 0; k < 4; k++) dot(bx + 3 + k*4.7, 219, 3.2, '#3a6a2e');
    }

    // ── People on the forecourt ──────────────────────────────────────
    // Like the courthouse steps: through office hours visitors climb to the
    // doors and come back down (a few still do into the evening), and people
    // cross the plaza all day, with the odd one still about after dark.
    // Every hall style keeps its doors at the top of the steps around x 120,
    // so the same paths work for all of them. Sorted by depth so nearer
    // walkers draw over farther ones.
    // Nobody pops: a visitor fades out as they pass in through the doors
    // and fades in stepping out of them (or arriving at the foot of the
    // steps), a stroller fades in and out at the ends of the plaza, and as
    // the hour changes the crowd thins or fills one person at a time over
    // half an hour rather than all at once.
    if (Camera.zoom > 0.35) {
      const SKIN = ['#f0d0b0', '#c89870', '#8a5a3a', '#e0b890', '#6a4630', '#d8a878'];
      const CLOTHES = ['#2a3040', '#3a3a3e', '#1e2a3a', '#5a3a2a', '#8a2a2a', '#2a5a7a', '#6a6a3a', '#c8b89a'];
      const walkers = [];
      // `visitors` (counted with the doors, above) eases between 7 through
      // office hours and 2 in the evening.
      for (let p = 0; p < 7; p++) {
        const present = clamp01(visitors - p);
        if (present <= 0) continue;
        const cyc = (t*0.05 + hash(p + 60)) % 1;
        const f = hash(p + 70) < 0.55 ? cyc : 1 - cyc;                              // going in, or coming out
        const fy = 240 - f*(240 - DOOR_Y);
        // up to the threshold at f 1, through the open doors in the last
        // half second; the foot of the steps at f 0
        const a = present * clamp01((1 - f) / 0.012) * clamp01(f / 0.1);
        if (a <= 0.01) continue;
        const toDoor = clamp01((f - 0.7) / 0.25);                                     // converging on the doorway
        const x = (108 + hash(p + 80)*24 + Math.sin(f*5 + p)*2)*(1 - toDoor) + (115 + hash(p + 80)*10)*toDoor;
        walkers.push({ x, y: fy, k: p, dir: 0, a });
      }
      const strollers = 1 + 3 * clamp01((0.45 - dark) / 0.2);
      for (let p = 0; p < 4; p++) {
        const present = clamp01(strollers - p);
        if (present <= 0) continue;
        const dir = p % 2 ? -1 : 1;
        const along = ((t*(0.012 + hash(p + 90)*0.008)*dir + hash(p + 95)) % 1 + 1) % 1;
        const a = present * clamp01(along / 0.06) * clamp01((1 - along) / 0.06);
        if (a <= 0.01) continue;
        walkers.push({ x: 6 + along*228, y: 224 + (p % 3)*5, k: p + 20, dir, a });
      }
      walkers.sort((a, b) => a.y - b.y);
      for (const w of walkers) {
        const { x, y, k, dir } = w;
        ctx.globalAlpha = w.a;
        const stride = Math.sin(t*7 + k*1.3);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(X(x + 0.8), Y(y), 2.8*u, 1*u, 0, 0, Math.PI*2); ctx.fill();
        R(x - 1.6 + stride*0.5, y - 3.6, 1.3, 3.6, '#1e1e22');                       // legs
        R(x + 0.3 - stride*0.5, y - 3.6, 1.3, 3.6, '#1e1e22');
        R(x - 2, y - 9.4, 4, 6, CLOTHES[k % CLOTHES.length]);
        dot(x, y - 11, 1.7, SKIN[k % SKIN.length]);
        if (k % 4 === 1) R(x + (dir < 0 ? -4.4 : 2), y - 5.4, 2.4, 2.2, '#4a3222');   // briefcase
      }
      ctx.globalAlpha = 1;
    }

    // Without power the building sits dark — shaded over the building's own
    // masses only, so the open ground around it isn't boxed in by a dark rect
    if (!on) {
      ctx.fillStyle = 'rgba(8,6,4,0.45)';
      ctx.beginPath();
      const masses = hallStyle === 'modern'
        ? [[2, 82, 80, 124], [158, 82, 80, 124], [50, 52, 140, 154], [104, -52, 32, 104]]
        : [[4, 79, 78, 127], [158, 79, 78, 127], [70, 62, 100, 134], [58, 196, 124, 18], [98, -6, 44, 70]];
      for (const [x, y, w, h] of masses) {
        ctx.rect(X(x), Y(y), w*u, h*u);
      }
      ctx.fill('nonzero');
      ctx.fillStyle = 'rgba(255,90,70,0.85)';
      ctx.font = `bold ${Math.max(6, Math.round(8*u))}px Courier New`;
      ctx.textAlign = 'center';
      ctx.fillText('NO POWER', X(120), Y(230));
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

function renderHospital(e, px, py, t) {
    // City General Hospital — authored at 6×5 and scaled to the entity's
    // footprint. An eight-storey ward tower whose rooms show beds, IV poles
    // and nurses on their rounds, crowned by a glowing red-cross sign and a
    // rooftop helipad with a medevac helicopter. On the left, the Emergency
    // department: ambulances pull in under the canopy with lights going and
    // stretchers are wheeled inside. On the right, the Maternity wing with
    // balloons at a window. In front, the main entrance plaza — wheelchairs,
    // a visitor with flowers, a taxi at the kerb — a healing garden with a
    // fountain and a patient walking an IV pole, a car park and a bus stop.
    // Without power the tower falls back to dim red emergency lighting.
    const AW = 240, AH = 200;
    const W = (e.width || 6) * TILE, H = (e.height || 5) * TILE;
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(W / (AW*TILE/40), H / (AH*TILE/40));
    const K = _nKit(0, 0), { S, X, Y, R, RR, dot, ell, poly, ln, text, glow, person } = K;
    const on = e.powered, hr = DayNight.hour(), dark = DayNight.darkness();
    const night = dark > 0.3;
    const detail = Camera.zoom > 0.4;
    const L = (d, n, o) => on ? (night ? n : d) : o;
    const WHITE = L('#eef2f4', '#a8b0bc', '#3a3c3e'), WHITE_D = L('#d0d8de', '#848c98', '#2e3032');
    const TEAL = L('#2aa8a0', '#1e7a78', '#1a2a2a'), RED = '#e0302a';
    const visiting = on && hr >= 8 && hr < 20;
    const clip = () => { ctx.save(); ctx.beginPath(); ctx.rect(X(0), Y(0), AW*S, AH*S); ctx.clip(); };

    // ── Road loop, parking ──
    // (No lawn fill: the sprite sits on whatever ground it's placed on.)
    const ROAD = L('#56585c', '#34363c', '#1c1c1e');
    R(0, 178, AW, 22, ROAD);
    if (detail) { ctx.setLineDash([6*S, 5*S]); ln(0, 189, AW, 189, L('rgba(240,220,120,0.6)', 'rgba(200,180,100,0.45)', 'rgba(60,56,40,0.4)'), 0.7); ctx.setLineDash([]); }
    R(0, 170, AW, 8, L('#d8d2c4', '#7a7884', '#3a3630'));                                     // sidewalk
    R(150, 150, 86, 20, ROAD);                                                                  // car park
    if (detail) for (let k = 0; k <= 5; k++) R(152 + k*16.4, 152, 0.7, 10, 'rgba(240,240,230,0.5)');
    const cars = on ? (visiting ? 5 : 2) : 1;
    for (let c = 0; c < cars; c++) _cmCar(X(160 + c*16.4), Y(161), ['#c04040', '#e8e8e4', '#3060a0', '#404448', '#e0b030'][c], S*0.62, c % 2);
    // entrance plaza paving, with a drop-off lane marked for the main doors
    R(84, 150, 62, 20, L('#d4cec2', '#6e6c76', '#302e2a'));
    if (detail) {
      for (let k = 1; k < 6; k++) R(84 + k*10.3, 150, 0.5, 20, L('rgba(150,140,125,0.45)', 'rgba(40,40,48,0.4)', 'rgba(0,0,0,0.3)'));
      R(84, 159.8, 62, 0.5, L('rgba(150,140,125,0.45)', 'rgba(40,40,48,0.4)', 'rgba(0,0,0,0.3)'));
    }

    // ── Healing garden ──
    {
      const gx = 6, gy = 150, gw = 62, gh = 20;
      RR(gx, gy, gw, gh, 3, L('#6a9a52', '#34463a', '#1c261a'));
      ctx.strokeStyle = L('#d8ccb0', '#7a7480', '#3a3428'); ctx.lineWidth = 3*S;
      ctx.beginPath(); ctx.moveTo(X(gx + 2), Y(gy + gh/2)); ctx.quadraticCurveTo(X(gx + gw/2), Y(gy + 2), X(gx + gw - 2), Y(gy + gh/2)); ctx.stroke();
      ell(gx + gw/2, gy + 12, 7, 4, L('#c8c0b0', '#6a6a70', '#2a2a28')); ell(gx + gw/2, gy + 12, 5.4, 2.8, L('#3a8ab0', '#1a4460', '#12222c'));
      if (on) for (let d = 0; d < 6; d++) { const ph = (t*1.1 + d/6) % 1, a = d/6*Math.PI*2; dot(gx + gw/2 + Math.cos(a)*ph*4.5, gy + 10 + ph*2 - Math.sin(ph*Math.PI)*4, 0.6, `rgba(220,245,255,${((1 - ph)*0.8).toFixed(3)})`); }
      for (const [fx, c] of [[gx + 6, '#e8483a'], [gx + 12, '#f0c030'], [gx + 50, '#d060c0'], [gx + 56, '#e8483a']]) for (let f = 0; f < 3; f++) dot(fx + f*1.8, gy + 16 + (f % 2), 1, on ? c : '#2a2a2a');
      R(gx + 8, gy + 4, 10, 2, L('#8a6034', '#5a4a44', '#2a1e14')); R(gx + 44, gy + 4, 10, 2, L('#8a6034', '#5a4a44', '#2a1e14'));
      if (visiting) {
        person(gx + 13, gy + 5, '#b8d8f0', _N_SKIN[2], 0, 0.8);                                   // patient on a bench
        const u = (Math.sin(t*0.12) + 1)/2, wx = gx + 14 + u*34, wy = gy + 13 - Math.sin(u*Math.PI)*4;
        person(wx, wy, '#b8d8f0', _N_SKIN[4], Math.abs(Math.sin(t*4))*0.2, 0.8);                 // patient in a gown...
        ln(wx + 3, wy, wx + 3, wy - 9, '#c8ccd0', 0.5); R(wx + 1.8, wy - 10, 2.4, 2.4, 'rgba(200,230,255,0.9)');   // ...walking an IV pole
      }
    }

    // ── Emergency department (left wing) ──
    {
      const ex = 6, ey = 86, ew = 62, eh = 56;
      R(ex + 4, ey + 4, ew, eh, 'rgba(0,0,0,0.25)');
      R(ex, ey, ew, eh, WHITE);
      R(ex, ey, ew, 4, WHITE_D);
      R(ex, ey, ew, 1.2, L('#ffffff', '#b8c0cc', '#48494b'));                                     // parapet coping
      if (detail) { RR(ex + 40, ey - 5, 14, 7, 1.2, L('#dfe3e6', '#9aa0aa', '#3a3c3e')); R(ex + 42, ey - 3.6, 10, 0.7, L('#a8b0b8', '#6a727c', '#2a2c2e')); R(ex + 42, ey - 1.6, 10, 0.7, L('#a8b0b8', '#6a727c', '#2a2c2e')); }
      for (let w = 0; w < 5; w++) {
        const wx = ex + 4 + w*11.6;
        R(wx - 0.6, ey + 9.4, 9.2, 11.2, L('#b8c4cc', '#6a727e', '#26282a'));                    // frame
        R(wx, ey + 10, 8, 10, on ? (night ? 'rgba(220,240,255,0.9)' : '#8ab0c8') : '#141618');
        if (detail) { R(wx + 3.7, ey + 10, 0.6, 10, L('rgba(90,110,125,0.6)', 'rgba(150,160,170,0.5)', 'rgba(0,0,0,0.4)')); R(wx + 0.6, ey + 11, 1.4, 6, on && !night ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.08)'); }
      }
      // ambulance bay apron, hatched, in front of the doors
      R(ex, ey + eh, ew, 8, L('#7a7c80', '#3a3c42', '#1e1e20'));
      if (detail) {
        ctx.save(); ctx.beginPath(); ctx.rect(X(ex), Y(ey + eh), ew*S, 8*S); ctx.clip();
        for (let k = -2; k < 14; k++) ln(ex + k*5, ey + eh + 8, ex + k*5 + 8, ey + eh, L('rgba(240,200,40,0.75)', 'rgba(200,170,50,0.55)', 'rgba(70,60,30,0.5)'), 1.1);
        ctx.restore();
        R(ex, ey + eh, ew, 0.8, L('#f0c830', '#b89a28', '#3a3418'));
      }
      // canopy with the sign
      R(ex - 2, ey + 38, ew + 4, 2, 'rgba(0,0,0,0.22)');                                          // canopy shadow
      R(ex - 2, ey + 28, ew + 4, 10, L('#e8ecf0', '#9aa2ae', '#3a3c3e'));
      R(ex - 2, ey + 28, ew + 4, 4, on ? RED : '#5a1e1a');
      R(ex - 2, ey + 32, ew + 4, 0.6, 'rgba(0,0,0,0.25)');
      text('EMERGENCY', ex + ew/2, ey + 30.2, 3.6, on ? '#ffffff' : 'rgba(150,140,140,0.8)', 'Arial Black, Arial, sans-serif');
      if (on && night) { glow(ex + ew/2, ey + 30, 34, '255,70,60', 0.34); glow(ex + 32, ey + 50, 22, '255,240,210', 0.3); }
      R(ex + 2, ey + 38, 2, 18, L('#8a98a4', '#5a6674', '#1c1e20')); R(ex + ew - 4, ey + 38, 2, 18, L('#8a98a4', '#5a6674', '#1c1e20'));
      R(ex + 22, ey + 40, 20, 16, on ? (night ? 'rgba(255,240,210,0.9)' : 'rgba(170,210,235,0.7)') : '#141414');
      R(ex + 31.6, ey + 40, 0.8, 16, '#5a6674');
      // ambulance arriving, stretcher going in, ambulance leaving
      if (on) {
        const cyc = (t*0.03 + 0.15) % 1;
        let ay;
        if (cyc < 0.2) ay = 212 - (cyc/0.2)*94;
        else if (cyc < 0.7) ay = 118;
        else if (cyc < 0.9) ay = 118 + ((cyc - 0.7)/0.2)*94;
        else ay = 999;
        const siren = cyc < 0.22 || (cyc > 0.68 && cyc < 0.9);
        if (ay < 210) {
          clip();
          const ax = ex + 6;
          R(ax + 2, ay + 2, 16, 30, 'rgba(0,0,0,0.3)');
          RR(ax, ay, 16, 30, 2.5, '#f4f6f8');
          R(ax, ay + 12, 16, 2.4, RED);
          R(ax + 2, ay + 24, 12, 4.5, '#2a3a4a');
          R(ax + 6.5, ay + 4, 3, 7, RED); R(ax + 4.5, ay + 6, 7, 3, RED);
          const flash = siren && Math.sin(t*14) > 0;
          R(ax + 2, ay + 21.5, 5, 2, flash ? '#ff3a30' : '#6a1a18'); R(ax + 9, ay + 21.5, 5, 2, !flash && siren ? '#3a8aff' : '#1a2a5a');
          if (siren) glow(ax + 8, ay + 22, 20, flash ? '255,60,50' : '60,140,255', night ? 0.45 : 0.25);
          ctx.restore();
        }
        if (cyc > 0.3 && cyc < 0.62) {
          const k = (cyc - 0.3)/0.32;
          const sx = ex + 32, sy = 146 - k*14;
          RR(sx - 7, sy - 2.5, 14, 5, 1.5, '#e8ecf0'); dot(sx - 4, sy, 1.3, _N_SKIN[3]);
          person(sx + 9, sy + 3, '#2d5f8c', _N_SKIN[1], 0, 0.85); person(sx - 10, sy + 3, '#2d5f8c', _N_SKIN[4], 0, 0.85);
        }
      }
    }

    // ── Maternity wing (right) ──
    {
      const mx = 178, my = 92, mw = 58, mh = 50;
      R(mx + 4, my + 4, mw, mh, 'rgba(0,0,0,0.25)');
      R(mx, my, mw, mh, WHITE);
      R(mx, my, mw, 9, L('#f4a0b8', '#9a6a7e', '#3a2a2e'));
      R(mx, my, mw, 1.2, L('#ffd0de', '#b88a9c', '#4a3a3e'));                                     // parapet coping
      R(mx, my + 9, mw, 0.8, 'rgba(0,0,0,0.18)');
      text('MATERNITY', mx + mw/2, my + 4.8, 4, L('#ffffff', '#ffffff', 'rgba(110,100,100,0.8)'), 'Arial, sans-serif');
      if (on && night) glow(mx + mw/2, my + 5, 26, '255,170,200', 0.22);
      const pastel = ['#f4a0b8', '#a0c8f0', '#f0e080', '#a8e0b8'];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
        const lit = on && (!night || _cmFrac(r*4 + c + 60) > 0.35);
        const wx = mx + 5 + c*13, wy = my + 13 + r*12;
        R(wx - 0.6, wy - 0.6, 9.2, 9.2, L('#c8d0d6', '#6a727e', '#26282a'));                    // frame
        R(wx, wy, 8, 8, lit ? (night ? 'rgba(255,225,170,0.9)' : '#9ab8cc') : L('#3a4a5e', '#1e2632', '#141618'));
        if (detail) { R(wx + 3.7, wy, 0.6, 8, 'rgba(90,110,125,0.45)'); R(wx, wy + 8, 8, 1.2, on ? pastel[(r + c) % 4] : '#2a2a2a'); }
      }
      if (on) {                                                                                    // balloons tied at a window
        const bx = mx + 40, by = my + 27;
        for (let b = 0; b < 3; b++) {
          const ox = (b - 1)*4 + Math.sin(t*1.3 + b)*1, oy = -10 - (b % 2)*3 + Math.cos(t*1.1 + b)*0.6;
          ln(bx, by, bx + ox, by + oy + 3, 'rgba(240,240,240,0.6)', 0.3);
          ell(bx + ox, by + oy, 2.4, 2.9, ['#f4a0b8', '#a0c8f0', '#f0e080'][b]);
        }
      }
      R(mx + 22, my + mh - 10, 14, 10, on ? (night ? 'rgba(255,236,205,0.9)' : 'rgba(170,210,235,0.7)') : '#141414');
      R(mx + 28.7, my + mh - 10, 0.6, 10, L('#8a98a4', '#5a6674', '#1c1e20'));
      R(mx + 20, my + mh - 12, 18, 2.6, L('#f4a0b8', '#9a6a7e', '#3a2a2e')); R(mx + 20, my + mh - 9.4, 18, 0.6, 'rgba(0,0,0,0.25)');
      if (on && night) glow(mx + 29, my + mh - 4, 14, '255,230,190', 0.35);
    }

    // ── Ward tower ──
    const tx = 74, tw = 100, tTop = 40, tBase = 150, floors = 8, fh = (tBase - tTop - 14)/floors;
    const FRAME = L('#b8c4cc', '#6a727e', '#26282a'), COPING = L('#ffffff', '#b8c0cc', '#48494b');
    // roof deck behind the facade, with its parapet
    R(tx + 6, tTop - 18, tw, 24, 'rgba(0,0,0,0.3)');
    R(tx, tTop - 24, tw, 24, L('#9aa2a8', '#5e646e', '#2c2e30'));
    if (detail) for (let k = 0; k < 40; k++) dot(tx + 4 + _cmFrac(k + 700)*(tw - 8), tTop - 21 + _cmFrac(k + 800)*18, 0.35, L('rgba(70,76,84,0.5)', 'rgba(30,34,40,0.5)', 'rgba(0,0,0,0.4)'));
    R(tx, tTop - 24, tw, 1.6, COPING); R(tx, tTop - 24, 1.6, 24, COPING); R(tx + tw - 1.6, tTop - 24, 1.6, 24, COPING);
    R(tx + 1.6, tTop - 22.4, tw - 3.2, 0.8, 'rgba(0,0,0,0.18)');
    R(tx + 6, tTop + 6, tw, tBase - tTop, 'rgba(0,0,0,0.3)');
    R(tx, tTop, tw, tBase - tTop, WHITE);
    R(tx + tw - 14, tTop, 14, tBase - tTop, WHITE_D);                                              // shaded return
    R(tx, tTop, tw, 3, COPING);
    // teal spandrel bands between floors
    for (let f = 0; f <= floors; f++) { R(tx, tTop + 12 + f*fh, tw, 1.4, TEAL); if (detail) R(tx, tTop + 13.4 + f*fh, tw, 0.5, 'rgba(0,0,0,0.12)'); }
    const nurseCols = [];
    for (let f = 0; f < floors; f++) {
      const fy = tTop + 13.4 + f*fh;
      for (let c = 0; c < 7; c++) {
        const wx = tx + 4 + c*13.4, room = f*7 + c;
        let col;
        if (!on) col = (room % 9 === 0) ? `rgba(200,30,30,${(0.35 + 0.15*Math.sin(t*2 + room)).toFixed(3)})` : '#121416';
        else if (night) col = _cmFrac(room + 100) > 0.35 ? 'rgba(255,238,200,0.9)' : '#1e2632';
        else col = '#9ab8cc';
        R(wx - 0.6, fy + 0.4, 11.2, fh - 1.8, FRAME);                                                 // frame
        R(wx, fy + 1, 10, fh - 3, col);
        if (detail) {
          R(wx + 4.7, fy + 1, 0.6, fh - 3, on && night ? 'rgba(120,110,90,0.5)' : 'rgba(90,110,125,0.5)');   // mullion
          if (on && !night) poly([[wx + 0.8, fy + fh - 2], [wx + 3.4, fy + 1], [wx + 4.6, fy + 1], [wx + 2, fy + fh - 2]], 'rgba(255,255,255,0.28)');   // glint
        }
        if (on && detail && (night ? _cmFrac(room + 100) > 0.35 : true)) {
          // bed + patient, IV pole in some rooms
          if (_cmFrac(room + 200) < 0.6) { R(wx + 1.5, fy + fh - 5, 6, 2, '#f4f6f8'); dot(wx + 2.6, fy + fh - 5.4, 0.9, _N_SKIN[room % 6]); }
          if (_cmFrac(room + 300) < 0.3) ln(wx + 8.5, fy + fh - 3, wx + 8.5, fy + 2, '#8a8e92', 0.4);
          if (_cmFrac(room + 400) < 0.25) R(wx, fy + 1, 3.5, fh - 3, 'rgba(160,210,200,0.7)');   // curtain
        }
        if (detail) R(wx - 0.8, fy + fh - 2, 11.6, 0.7, COPING);                                    // sill
      }
      // a nurse walking the corridor behind the windows on some floors
      if (on && f % 2 === 0) {
        const u = ((t*0.05 + f*0.37) % 1);
        nurseCols.push([tx + 6 + u*(tw - 20), fy + fh - 2]);
      }
    }
    // white pilasters run the height of the tower between the window bays
    if (detail) for (const px2 of [tx + 1.2, tx + 14.9 + 2*13.4, tx + 14.9 + 4*13.4]) { R(px2, tTop + 12, 1.6, floors*fh + 1.4, COPING); R(px2 + 1.6, tTop + 12, 0.5, floors*fh + 1.4, 'rgba(0,0,0,0.12)'); }
    for (const [nx, ny] of nurseCols) { R(nx - 1, ny - 4.2, 2, 3.6, '#3ab0a0'); dot(nx, ny - 5, 0.8, _N_SKIN[1]); }
    // nurses' station band glows at night
    if (on && night) for (let f = 1; f < floors; f += 2) glow(tx + tw - 10, tTop + 13.4 + f*fh + fh/2, 10, '120,230,210', 0.4);
    // main entrance: canopy on columns, glazed lobby and revolving door
    {
      const LOBBY = on ? (night ? 'rgba(255,240,210,0.95)' : 'rgba(170,210,235,0.8)') : '#141414';
      R(tx + 26, tBase - 18, 48, 18, L('#dfe5ea', '#8a929e', '#2e3032'));                           // lobby surround
      R(tx + 30, tBase - 12, 40, 12, LOBBY);
      if (detail) for (let k = 1; k < 5; k++) R(tx + 30 + k*8, tBase - 12, 0.6, 12, L('#6a7680', '#7a7060', '#2a2a2a'));
      if (on) { const rv = t*1.5; for (let k = 0; k < 3; k++) { const a = rv + k*2.09; ln(tx + 50, tBase - 6, tx + 50 + Math.cos(a)*5, tBase - 6 + Math.sin(a)*1.6, '#6a7680', 0.8); } }
      R(tx + 26, tBase - 17, 48, 5, TEAL);
      R(tx + 26, tBase - 17, 48, 1, L('#5ad0c8', '#2aa09a', '#24383a'));
      R(tx + 26, tBase - 12, 48, 1, 'rgba(0,0,0,0.25)');
      text('MAIN ENTRANCE', tx + 50, tBase - 14.4, 2.6, on ? '#ffffff' : 'rgba(120,130,130,0.7)', 'Arial, sans-serif');
      for (const cx2 of [tx + 27, tx + 71.6]) R(cx2, tBase - 12, 1.4, 12, L('#c8d0d6', '#7a828e', '#26282a'));
      if (on && night) glow(tx + 50, tBase - 4, 28, '255,235,190', 0.45);
      // flagpoles and planters either side of the doors
      for (const [fx, fc] of [[tx + 12, '#3a70d8'], [tx + 20, '#e8eef2']]) {
        RR(fx - 4, tBase + 2, 8, 4, 1, L('#a89a88', '#5e5a62', '#2a2724'));
        if (detail) for (let k = 0; k < 3; k++) dot(fx - 2.4 + k*2.4, tBase + 2.6, 1.6, L(k === 1 ? '#3f7a36' : '#2f5a2a', '#1c3020', '#101a0e'));
        ln(fx, tBase + 2, fx, tBase - 18, L('#c8ccd0', '#8a929c', '#333'), 0.5);
        const wv = on ? Math.sin(t*3 + fx)*0.8 : 0;
        poly([[fx, tBase - 18], [fx + 7, tBase - 17.4 + wv], [fx + 7, tBase - 13.4 + wv], [fx, tBase - 14]], on ? fc : '#3a3a3c');
        if (fc !== '#3a70d8' && on) { R(fx + 2.6, tBase - 17.2 + wv*0.5, 1, 3, RED); R(fx + 1.6, tBase - 16.2 + wv*0.5, 3, 1, RED); }
      }
    }
    // the name, on a dark fascia band
    R(tx + 8, tTop + 3, tw - 16, 8, L('#1c2a44', '#121c30', '#141618'));
    R(tx + 8, tTop + 10.2, tw - 16, 0.8, TEAL);
    if (on && night) glow(tx + tw/2, tTop + 7, 40, '140,200,255', 0.22);
    text('CITY GENERAL HOSPITAL', tx + tw/2, tTop + 7.4, 4.8, on ? '#ffffff' : 'rgba(110,110,120,0.8)', 'Arial, sans-serif');

    // ── Rooftop: plant, red-cross sign, helipad, aviation light ──
    {
      // air-handling units and a row of vents
      for (let u = 0; u < 2; u++) {
        const ux = tx + 4 + u*17;
        R(ux + 1, tTop - 10, 14, 10, 'rgba(0,0,0,0.25)');
        RR(ux, tTop - 12, 14, 10, 1.5, L('#dfe3e6', '#9aa0aa', '#3a3c3e'));
        dot(ux + 7, tTop - 7, 3, L('#3a4046', '#262a30', '#1a1c1e'));
        const sp = on ? t*9 + u : 0;
        ln(ux + 7 + Math.cos(sp)*2.6, tTop - 7 + Math.sin(sp)*2.6, ux + 7 - Math.cos(sp)*2.6, tTop - 7 - Math.sin(sp)*2.6, L('#c8ced4', '#8a929c', '#333'), 0.9);
      }
      if (detail) for (let k = 0; k < 5; k++) { dot(tx + 8 + k*6, tTop - 18, 1.3, L('#b8c0c6', '#7a828c', '#2e3032')); dot(tx + 8 + k*6, tTop - 18.3, 0.7, L('#5a6068', '#30343a', '#1a1c1e')); }
      // red-cross sign on its frame — white box, dark frame and a halo when lit
      const cx = tx + tw/2 - 3, cy = tTop - 12;
      R(cx - 9, cy + 9, 1.4, 4, L('#6a7480', '#3e4650', '#1e2022')); R(cx + 7.6, cy + 9, 1.4, 4, L('#6a7480', '#3e4650', '#1e2022'));
      if (on) glow(cx, cy, 30, '255,60,50', night ? 0.5 : 0.15);
      RR(cx - 12, cy - 12, 24, 24, 3.5, L('#c8ced4', '#5a626c', '#2a2c2e'));
      RR(cx - 11, cy - 11, 22, 22, 3, on ? '#ffffff' : '#6a6c70');
      R(cx - 3.5, cy - 8.5, 7, 17, on ? RED : '#4a1a18'); R(cx - 8.5, cy - 3.5, 17, 7, on ? RED : '#4a1a18');
      // helipad on a raised deck at the east end
      const hx = tx + tw - 20, hy = tTop - 12;
      R(tx + tw - 40, tTop - 23, 40, 23, L('#8a9298', '#4e545e', '#262829'));
      R(tx + tw - 40, tTop - 23, 0.8, 23, 'rgba(0,0,0,0.25)');
      ell(hx, hy, 17, 9, L('#4a5058', '#2e333a', '#1e2022'));
      ctx.strokeStyle = L('#f0c830', '#b89a28', '#3a3418'); ctx.lineWidth = 0.8*S;
      ctx.beginPath(); ctx.ellipse(X(hx), Y(hy), 14*S, 7*S, 0, 0, Math.PI*2); ctx.stroke();
      text('H', hx, hy + 0.5, 9, L('#f4f0e6', '#c8ccd8', '#444'), 'Arial Black, Arial, sans-serif');
      if (on && night) for (let k = 0; k < 8; k++) { const a = k*Math.PI/4; dot(hx + Math.cos(a)*16, hy + Math.sin(a)*8.4, 0.9, (k + Math.floor(t*4)) % 2 ? '#60ff80' : '#2a8a4a'); }
      if (on) {                                                                                     // parked medevac, rotor idling
        ell(hx + 2, hy + 2.5, 9, 3, 'rgba(0,0,0,0.3)');
        RR(hx - 6, hy - 4, 11, 7, 3, RED); R(hx + 5, hy - 1.5, 9, 2, RED); R(hx + 12, hy - 4, 2, 5, RED);
        R(hx - 6, hy - 0.8, 11, 1, '#ffffff');
        R(hx - 4, hy - 3, 4, 4, 'rgba(160,210,240,0.9)');
        ctx.save(); ctx.translate(X(hx), Y(hy - 1)); ctx.rotate(t*3);
        ctx.strokeStyle = 'rgba(40,40,44,0.7)'; ctx.lineWidth = 0.8*S;
        for (let b = 0; b < 4; b++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(b*Math.PI/2)*11*S, Math.sin(b*Math.PI/2)*11*S*0.5); ctx.stroke(); }
        ctx.restore();
      }
      // windsock on the deck corner
      ln(tx + tw - 3, tTop - 2, tx + tw - 3, tTop - 10, L('#c8ccd0', '#8a929c', '#333'), 0.4);
      poly([[tx + tw - 3, tTop - 10], [tx + tw - 9, tTop - 9.2 + (on ? Math.sin(t*2.2) : 0.8)], [tx + tw - 3, tTop - 8.4]], on ? '#ff8a30' : '#3a2e24');
      if (on && Math.sin(t*2.6) > 0) { dot(tx + 2, tTop - 23, 1.1, '#ff3a30'); if (night) glow(tx + 2, tTop - 23, 6, '255,60,40', 0.5); }
    }

    // ── Plaza life: wheelchairs, visitors, taxi, bus stop ──
    if (visiting) {
      const u = (t*0.02) % 1, wx = 150 - u*54;
      ctx.strokeStyle = '#3a3a3c'; ctx.lineWidth = 0.6*S; ctx.beginPath(); ctx.arc(X(wx), Y(166), 2*S, 0, Math.PI*2); ctx.stroke();
      RR(wx - 1.6, 160, 3.2, 4.2, 1, '#b8d8f0'); dot(wx, 159, 1, _N_SKIN[5]);
      person(wx + 4.5, 167, '#3ab0a0', _N_SKIN[2], 0, 0.8);
      const v = (t*0.025 + 0.4) % 1, vx = 24 + v*100;
      person(vx, 175, '#8a5a3a', _N_SKIN[0], Math.abs(Math.sin(t*7))*0.3, 0.85);
      for (let f = 0; f < 3; f++) dot(vx + 2.5 + f*0.9, 169.5 - (f % 2), 0.8, ['#e8483a', '#f0c030', '#d060c0'][f]);   // flowers
      person(206, 175, '#3a70d8', _N_SKIN[3], 0, 0.8); person(211, 175, '#e0b020', _N_SKIN[1], 0, 0.8);
    }
    R(200, 164, 20, 2, L('#2d5f8c', '#1f3a58', '#16202c')); R(200, 166, 20, 4, L('rgba(170,210,235,0.4)', 'rgba(90,110,130,0.4)', 'rgba(40,40,40,0.4)'));
    if (on) {
      const tc = (t*0.04) % 1, txx = tc < 0.4 ? -20 + (tc/0.4)*140 : tc < 0.6 ? 120 : 120 + ((tc - 0.6)/0.4)*160;
      clip(); _cmCar(X(txx), Y(184), '#f0c020', S*0.8, false); ctx.restore();
      const bc = (t*0.02 + 0.6) % 1, bx = 260 - bc*320;
      clip(); RR(bx, 190, 36, 9, 2.5, TEAL); R(bx, 192, 36, 2.6, night ? 'rgba(255,230,170,0.85)' : 'rgba(40,60,80,0.85)'); ctx.restore();
    }

    // ── Trees ──
    for (const [tx2, ty2, r] of [[70, 162, 5], [140, 162, 5], [230, 84, 6], [6, 80, 6]]) {
      ell(tx2 + 2, ty2 + 3, r, r*0.5, 'rgba(0,0,0,0.25)');
      dot(tx2, ty2, r, L('#2f5a2a', '#1c3020', '#101a0e')); dot(tx2 - r*0.3, ty2 - r*0.3, r*0.6, L('#3f7a36', '#25412a', '#16200f'));
    }
    if (on && night) for (const lx of [40, 100, 160, 220]) { R(lx - 0.5, 164, 1, 8, '#2a2a2e'); dot(lx, 163, 1.2, '#fff0c8'); glow(lx, 166, 16, '255,230,170', 0.35); }
    ctx.restore();
  }

// Directional flow-streak rendering (river/lake current highlight) was
// REMOVED — it was dead weight, not a working feature. Its gradient was
// built via ctx.createLinearGradient() using small tile-LOCAL coordinates
// (roughly 0..TILE), but the caller never applied a compensating
// ctx.translate() before stroking — it stroked at absolute WORLD
// coordinates (px + localX) instead. CanvasGradient axis coordinates
// resolve against whatever transform is active at stroke time (verified
// elsewhere in this file — see drawGlowHalo in render_core.js), and that
// transform here is just the global camera transform, never translated
// per-tile. So the gradient's visible ramp sat anchored a few dozen pixels
// from world tile (0,0), while every actual stroke — for every river/lake
// tile anywhere else on the map — landed far outside that range and
// clamped to the gradient's fully-transparent end stop. Confirmed by
// sampling real tiles through the live RenderSystem.render() path: zero
// pixel change across a full flow cycle for any tile away from the map
// corner. So this was invisible in essentially all real gameplay, yet
// still paid for a ctx.beginPath()/moveTo/lineTo/stroke() pair, every
// visible water tile with a flow direction (which includes lake tiles, not
// just rivers — see spawnLake in water_vegetation_system.js), every frame
// zoom was above 0.35 — the same "paint/compositor cost invisible to JS
// timers" failure mode already diagnosed for the caustics layer below.
// Cut entirely rather than fix-and-keep: unlike caustics/ripple, there was
// no visual payoff being traded away, only wasted draw calls.

// Frame-scoped sky-reflection tint — DayNight.skyColorRGB() only depends on
// game time, not on any per-tile state, so every water tile sharing a frame
// can reuse one parsed result instead of recomputing it (and re-reading
// darkness()) per tile.
let _waterTintCacheT = null;
let _waterTint = null;
function _getWaterTint(t) {
  if (_waterTintCacheT !== t) {
    _waterTintCacheT = t;
    const rgb = DayNight.skyColorRGB();
    _waterTint = { r: rgb.r, g: rgb.g, b: rgb.b, dark: DayNight.darkness() };
  }
  return _waterTint;
}

// Base water fillStyle is a freshly-templated 'rgb(r,g,b)' string per tile
// per frame — cheap individually, but adds up to real GC churn across
// hundreds of visible water tiles at 60fps. Shimmer is a small per-tile
// sine wiggle (±3%) on top of a frame-global tint, so many tiles round to
// the same integer r/g/b — caching the string by that integer triple lets
// them share one string object instead of each allocating their own.
// Cache resets every frame (keyed on t) so it never grows unbounded.
let _waterColorCacheT = null;
let _waterColorCache = null;
function _cachedWaterColor(t, r, g, b) {
  if (_waterColorCacheT !== t) { _waterColorCacheT = t; _waterColorCache = new Map(); }
  const key = (r * 256 + g) * 256 + b;
  let s = _waterColorCache.get(key);
  if (s === undefined) { s = `rgb(${r},${g},${b})`; _waterColorCache.set(key, s); }
  return s;
}

// Animated caustic pattern offset — advanced once per frame (see
// GroundTextures.causticPatternA/B/C in js/ground_textures.js), never per
// tile. Three layers drift at different speeds/angles and two are rotated,
// so their tiling grids never line up — a single layer alone reads as an
// obvious repeating stamp once more than one tile is visible on screen.
//
// Matrix order matters here and is NOT interchangeable: DOMMatrix chaining
// composes left-to-right as "apply this operation, then the next", so
// `.translate(a,b).rotate(deg)` rotates the point AFTER translating it —
// which means wrapping the translation at the pattern's own tile size (via
// `% size`, done so the numbers driving this don't grow unbounded over a
// long play session) no longer lands on a lattice-preserving shift once
// the rotation is factored in, and the animation visibly snaps every time
// it wraps. `.rotate(deg).translate(a,b)` instead applies the translation
// in the pattern's own unrotated space first, THEN rotates the whole
// result — so a wrap at the native tile size is always a seamless full
// period, regardless of the rotation. Every rotated layer below must use
// this order.
let _causticCacheT = null;
function _updateCaustics(t) {
  if (_causticCacheT === t) return;
  _causticCacheT = t;
  const axA = (t * 9)   % 211, ayA = (t * 5.5) % 211;
  GroundTextures.causticPatternA.setTransform(new DOMMatrix().translate(axA, ayA));

  const axB = (t * -6.5) % 149, ayB = (t * 8)   % 149;
  GroundTextures.causticPatternB.setTransform(
    new DOMMatrix().rotate(23).translate(axB, ayB));

  const axC = (t * 4.2) % 173, ayC = (t * -7.1) % 173;
  GroundTextures.causticPatternC.setTransform(
    new DOMMatrix().rotate(-41).translate(axC, ayC));
}

// Shoreline feather gradients — built once (colour stops never change), then
// reused every frame for every shore tile via ctx.translate(px,py) so the
// same 0..TILE local-space gradient lands in the right place without being
// rebuilt. Bit flags match the shore mask below: 1=top 2=bottom 4=left 8=right.
//
// Colour was a bright, fully-saturated cyan that never dimmed for day/night
// — at night it read as a glowing light-blue outline traced around every
// water body (reinforcing "water pasted on top of grass" rather than
// "shallow water"), instead of a subtle shallow-water highlight. Darkened
// and desaturated the base colour, and the draw call below now scales it
// down further by the current darkness (see renderWater), same as the
// caustics layer.
const _SHORE_FEATHER = 8;
function _buildShoreGradient(x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, 'rgba(46,92,110,0.4)');
  g.addColorStop(1, 'rgba(46,92,110,0)');
  return g;
}
const _shoreGradTop    = _buildShoreGradient(0, 0, 0, _SHORE_FEATHER);
const _shoreGradBottom = _buildShoreGradient(0, TILE, 0, TILE - _SHORE_FEATHER);
const _shoreGradLeft   = _buildShoreGradient(0, 0, _SHORE_FEATHER, 0);
const _shoreGradRight  = _buildShoreGradient(TILE, 0, TILE - _SHORE_FEATHER, 0);

// Batched base fill for every plain (non-reservoir) visible water tile —
// one Path2D + one fill() call instead of one ctx.fillRect() per tile.
// Canvas draw-call overhead is real even when each individual fillRect is
// cheap: measured ~2.3ms/frame of script time over a large lake at this
// zoom vs ~0.1ms over plain grass, entirely from per-tile fillRect calls
// in the main entity loop. Drops the per-tile shimmer sparkle (a subtle
// ±3% brightness wobble keyed on col/row) in exchange for one shared
// frame-level colour — same trade-off already made for the (now removed)
// caustics and ripple effects. Must run in world space (after
// Camera.applyTransform, before the main entity loop paints anything on
// top of these tiles).
function renderWaterBaseFill(cStart, cEnd, rStart, rEnd, t) {
  const look = typeof WaterLook !== 'undefined' && WaterLook.enabled;
  if (look) {
    const f = WaterLook.flatRGB();
    ctx.fillStyle = _cachedWaterColor(t, Math.round(f[0]), Math.round(f[1]), Math.round(f[2]));
  } else {
    const tint = _getWaterTint(t);
    const tintAmt = 0.16;
    const rr = Math.round(6  + (tint.r - 6)  * tintAmt);
    const gg = Math.round(28 + (tint.g - 28) * tintAmt);
    const bb = Math.round(52 + (tint.b - 52) * tintAmt);
    ctx.fillStyle = _cachedWaterColor(t, rr, gg, bb);
  }
  const path = new Path2D();
  let any = false;
  for (let r = rStart; r < rEnd; r++) {
    for (let c = cStart; c < cEnd; c++) {
      const e = GridManager.getEntity(c, r);
      if (!e) continue;
      // A Water Extractor floats on the lake but claims its tiles in the grid;
      // its sprite doesn't cover the whole footprint, so the water under it
      // still needs painting (the tiles stay in WaterSystem's water set).
      // Same for a bridge: the deck is narrower than its 6×6 piece.
      const underExtractor = (e.type === T.WATEREXTRACTOR || (e.type === T.ROAD && e._bridge)) && WaterSystem.isWater(c, r);
      if (!underExtractor && (e.type !== T.WATER || e._reservoirId !== undefined)) continue;
      const { x, y } = GridManager.tileToWorld(c, r);
      path.rect(x, y, TILE, TILE);
      any = true;
    }
  }
  if (any) ctx.fill(path);
  // The baked look goes over the flat fill, which stays as what shows
  // through while a chunk is still waiting to be baked (see water_look.js).
  // Called whatever is in view: its banks reach onto land beside water
  // that is itself just off screen, and it paints the water under pipes,
  // wires and reservoirs, none of which are in the plain-tile path above.
  // Deep winter: the same tiles under a sheet of ice (FrostSystem.ice). The
  // look lays it through its own water mask, so it follows the shoreline.
  const ice = typeof FrostSystem !== 'undefined' && FrostSystem.ice ? FrostSystem.ice() : 0;
  if (look) WaterLook.draw(ctx, cStart, cEnd, rStart, rEnd, t, 1 - _getWaterTint(t).dark, ice);
  else if (any && ice > 0.01) { ctx.fillStyle = `rgba(208,230,244,${(0.78 * ice).toFixed(3)})`; ctx.fill(path); }
}

function renderWater(e, px, py, t, skipFill) {
    const isReservoir = e._reservoirId !== undefined;
    // The baked look (water_look.js) has already painted this tile, shore
    // and all, in renderWaterBaseFill: wires, pipes, a barge or a shaft
    // over it need nothing more, and a reservoir's fill level is shaded
    // there too. A tile whose chunk is not baked yet gets a flat fill in the
    // look's colour.
    if (typeof WaterLook !== 'undefined' && WaterLook.enabled) {
      if (WaterLook.covers(e.col, e.row)) return;
      if (!skipFill || isReservoir) {
        const f = WaterLook.flatRGB();
        ctx.fillStyle = _cachedWaterColor(t, Math.round(f[0]), Math.round(f[1]), Math.round(f[2]));
        ctx.fillRect(px, py, TILE, TILE);
      }
      return;
    }
    // Shimmer used to modulate fillStyle alpha (~0.89-0.95), which let the
    // ground layer underneath bleed through the "solid" water — invisible
    // against the old flat grass, obvious once the ground had real texture.
    // Bake the shimmer into brightness instead and keep the fill opaque.
    const shimmer = 0.03 * Math.sin(t * 1.8 + e.col * 0.4 + e.row * 0.3);
    const tint = _getWaterTint(t);
    const tintAmt = 0.16;
    // Plain water tiles reached through the normal per-tile dispatch are
    // already painted by renderWaterBaseFill()'s batched pass (see call
    // site in render_main_loop.js) — skip the redundant per-tile fillRect.
    // Reservoirs always self-paint (fill level varies per-tile) and the
    // rarer wire/pipe-over-water calls don't set skipFill.
    if (!(skipFill && !isReservoir)) {
      if (isReservoir) {
        // Deeper, calmer reservoir water — fill-level tints the blue
        const res = (typeof ReservoirSystem !== 'undefined') ? ReservoirSystem.getReservoir(e._reservoirId) : null;
        const fill = res && res.capacity > 0 ? res.waterLevel / res.capacity : 0.5;
        const shimmerMul = 1 + shimmer * 0.5;
        const rr = Math.round((8 + (tint.r - 8) * tintAmt) * shimmerMul);
        const gg = Math.round((24 + 18 * fill + (tint.g - (24 + 18 * fill)) * tintAmt) * shimmerMul);
        const bb = Math.round((48 + 36 * fill + (tint.b - (48 + 36 * fill)) * tintAmt) * shimmerMul);
        ctx.fillStyle = _cachedWaterColor(t, rr, gg, bb);
      } else {
        const shimmerMul = 1 + shimmer;
        const rr = Math.round((6  + (tint.r - 6)  * tintAmt) * shimmerMul);
        const gg = Math.round((28 + (tint.g - 28) * tintAmt) * shimmerMul);
        const bb = Math.round((52 + (tint.b - 52) * tintAmt) * shimmerMul);
        ctx.fillStyle = _cachedWaterColor(t, rr, gg, bb);
      }
      ctx.fillRect(px, py, TILE, TILE);
    }

    // Shoreline mask (which edges border non-water) is expensive to
    // recompute every frame for every visible water tile — 4 grid lookups
    // apiece, at 60fps, across potentially hundreds of river/lake tiles on
    // screen. It only changes when a neighbouring tile is placed/removed,
    // so WaterSystem now caches it on the entity and invalidates just the
    // affected tiles on change (see _invalidateShoreMask in
    // water_vegetation_system.js). Bit flags: 1=top 2=bottom 4=left 8=right.
    let mask = e._shoreMask;
    if (mask === undefined) {
      mask = 0;
      if (!WaterSystem.isWater(e.col, e.row - 1)) mask |= 1;
      if (!WaterSystem.isWater(e.col, e.row + 1)) mask |= 2;
      if (!WaterSystem.isWater(e.col - 1, e.row)) mask |= 4;
      if (!WaterSystem.isWater(e.col + 1, e.row)) mask |= 8;
      e._shoreMask = mask;
    }
    if (mask) {
      ctx.save();
      ctx.translate(px, py);
      ctx.globalAlpha = 1 - tint.dark * 0.7;
      if (mask & 1) { ctx.fillStyle = _shoreGradTop;    ctx.fillRect(0, 0, TILE, _SHORE_FEATHER); }
      if (mask & 2) { ctx.fillStyle = _shoreGradBottom; ctx.fillRect(0, TILE - _SHORE_FEATHER, TILE, _SHORE_FEATHER); }
      if (mask & 4) { ctx.fillStyle = _shoreGradLeft;   ctx.fillRect(0, 0, _SHORE_FEATHER, TILE); }
      if (mask & 8) { ctx.fillStyle = _shoreGradRight;  ctx.fillRect(TILE - _SHORE_FEATHER, 0, _SHORE_FEATHER, TILE); }
      ctx.restore();
    }

    // Animated light caustics are handled separately, once per frame for
    // ALL visible water tiles at once — see renderWaterCaustics() below.
    // (Used to composite pattern fills with globalCompositeOperation=
    // 'lighter' right here, per tile. Live bisection during a perf
    // investigation showed that per-tile pattern+'lighter' combo — not the
    // number of layers — is what pushes the browser off its fast
    // GPU-accelerated canvas path once enough water tiles are on screen;
    // trimming layer count barely moved the needle because the cost is
    // per *occurrence* of that operation combo, not per pixel painted. The
    // real fix is cutting how many times per frame it happens at all: from
    // O(visible water tiles) down to a small constant by batching every
    // visible water tile into one path and filling that once.)

    // Directional flow streaks (river/lake current highlight) — REMOVED.
    // See the note just above renderWater() (near the top of this section)
    // for why: it was invisible in real gameplay due to a gradient/transform
    // coordinate bug, yet still paid for a stroke() call on every visible
    // flowing water tile, every frame.

    // Subtle surface ripple (still water only) — REMOVED. Same
    // stroked-arc-per-tile cost category as the disabled caustics layer
    // above: expensive to rasterize and un-batchable across tiles, so a
    // big lake with enough tiles rippling in the same frame still knocked
    // the browser off its fast canvas path (measured ~47fps vs ~55fps on
    // the same lake with this removed, ~57fps on plain grass). Tightening
    // the trigger threshold only reduced frequency, not worst-case cost;
    // cut entirely rather than gamble on batching like caustics did.
  }

// Animated light caustics for every currently-visible water tile, batched
// into ONE fill per pattern layer instead of once per tile (see the note
// left in renderWater where this used to live inline). Must be called once
// per frame, in world space (after Camera.applyTransform, before
// Camera.resetTransform), AFTER the main per-tile entity loop has already
// painted every water tile's own base fill/shoreline — the caustic glow
// composites on top of those pixels, same as before.
//
// This intentionally drops the old per-tile `spatialMod` brightness
// variation (a slow sine-based "patchy" modulation across the lake) since
// preserving it exactly would mean bucketing tiles by brightness and
// filling each bucket's path separately — real complexity for a subtle
// effect. A single frame-wide alpha keeps the two drifting pattern layers
// (still the main visual read: moving dappled light) at a fraction of the
// cost.
function renderWaterCaustics(cStart, cEnd, rStart, rEnd, t) {
  if (Camera.zoom <= 0.35) return;
  const tint = _getWaterTint(t);
  _updateCaustics(t);

  const path = new Path2D();
  let any = false;
  for (let r = rStart; r < rEnd; r++) {
    for (let c = cStart; c < cEnd; c++) {
      if (!WaterSystem.isWater(c, r)) continue;
      path.rect(c * TILE, r * TILE, TILE, TILE);
      any = true;
    }
  }
  if (!any) return;

  const causticAlpha = 0.06 * (1 - tint.dark * 0.7); // 25% of original intensity (75% reduction) on top of batching
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = causticAlpha;
  ctx.fillStyle = GroundTextures.causticPatternA;
  ctx.fill(path);
  ctx.globalAlpha = causticAlpha * 0.8;
  ctx.fillStyle = GroundTextures.causticPatternB;
  ctx.fill(path);
  ctx.restore();
}

// ── Water surface effects ────────────────────────────────────────────────
// Everything alive on the water — current streaks on rivers, sun glints on
// still water, foam lapping at the shore, lily pads, and waterfalls — for
// every visible water tile, once per frame. Built with the lesson of the
// removed caustics/ripples/streak layers above in mind: each effect is ONE
// path and ONE plain source-over fill or stroke per frame (no patterns, no
// 'lighter', nothing per tile), so a screen full of lake costs about what
// a handful of buildings do. Waterfalls are the exception — drawn per tile,
// but there are only a few dozen of those on the whole map.
// Call in world space after the main tile loop (render_main_loop.js).
function renderWaterEffects(cStart, cEnd, rStart, rEnd, t) {
  const z = Camera.zoom;
  if (z < 0.22) return;
  const tint = _getWaterTint(t);
  const day = 1 - tint.dark;
  const fine = z > 0.42;                         // small details only when they'd be visible
  // Under winter ice nothing flows or glints.
  const frozen = typeof FrostSystem !== 'undefined' && FrostSystem.ice && FrostSystem.ice() > 0.5;
  const streaks = new Path2D(), foam = new Path2D(), glints = new Path2D(), pads = new Path2D();
  let anyS = false, anyF = false, anyG = false, anyP = false;
  const falls = [];
  // The baked look (water_look.js) draws its own foam along its own shore.
  const look = typeof WaterLook !== 'undefined' && WaterLook.enabled;
  for (let r = rStart; r < rEnd; r++) {
    for (let c = cStart; c < cEnd; c++) {
      const e = GridManager.getEntity(c, r);
      if (!e || e.type !== T.WATER || e._reservoirId !== undefined) continue;
      const x = c * TILE, y = r * TILE;
      const h = _vegHash(c, r);
      if (e._waterfall) { falls.push(e); continue; }
      const mask = e._shoreMask;
      // Foam lapping at the shore: a band that swells and ebbs.
      if (mask) {
        if (!look) {
          const w = 2 + 2.2 * (0.5 + 0.5 * Math.sin(t * 1.4 + c * 0.7 + r * 0.9));
          if (mask & 1) foam.rect(x, y, TILE, w);
          if (mask & 2) foam.rect(x, y + TILE - w, TILE, w);
          if (mask & 4) foam.rect(x, y, w, TILE);
          if (mask & 8) foam.rect(x + TILE - w, y, w, TILE);
          anyF = true;
        }
        // Lily pads in the still shallows.
        if (fine && !e._isRiver && h < 0.13) {
          const px = x + 8 + h * 170 % (TILE - 16), py = y + 8 + (h * 997) % (TILE - 16), pr = 3.5 + (h * 53) % 3;
          pads.moveTo(px, py); pads.arc(px, py, pr, 0.5 + h * 6, 0.5 + h * 6 + 5.6); pads.closePath();
          anyP = true;
        }
      }
      if (e._isRiver) {
        // Current: a short streak riding the flow, a couple per tile.
        if (h < 0.55) {
          const dc = e._flowDc || 0, dr = e._flowDr || 0;
          const ph = (t * (e._isLongRiver ? 0.55 : 0.4) + h * 7) % 1;
          const along = ph * TILE, len = 7 + h * 8, side = 6 + (h * 131) % (TILE - 12);
          const sx = dc ? x + (dc > 0 ? along : TILE - along) : x + side;
          const sy = dr ? y + (dr > 0 ? along : TILE - along) : y + side;
          streaks.moveTo(sx, sy); streaks.lineTo(sx + dc * len, sy + dr * len);
          anyS = true;
        }
      } else if (fine && day > 0.4) {
        // Sun glints on still water: a few tiles at a time catch the light.
        const tw = Math.sin(t * 1.7 + h * 60);
        if (tw > 0.92) {
          const gx = x + (h * 311) % TILE, gy = y + (h * 719) % TILE, s = 1.6 + (tw - 0.92) * 30;
          glints.moveTo(gx - s, gy); glints.lineTo(gx, gy - s * 0.45); glints.lineTo(gx + s, gy); glints.lineTo(gx, gy + s * 0.45); glints.closePath();
          anyG = true;
        }
      }
    }
  }
  ctx.save();
  if (anyF) { ctx.fillStyle = `rgba(214,236,242,${(0.2 * (0.35 + 0.65 * day)).toFixed(3)})`; ctx.fill(foam); }
  if (anyS && !frozen) {
    ctx.strokeStyle = `rgba(200,230,245,${(0.28 * (0.4 + 0.6 * day)).toFixed(3)})`;
    ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.stroke(streaks);
  }
  if (anyP) { ctx.fillStyle = day > 0.5 ? '#4f8a3c' : '#2a4a24'; ctx.fill(pads); }
  if (anyG && !frozen) { ctx.fillStyle = `rgba(255,252,235,${(0.75 * day).toFixed(3)})`; ctx.fill(glints); }
  ctx.restore();
  // A fall is drawn once per whole fall, not per tile — see _fallGroups.
  const seen = new Set();
  for (const e of falls) {
    const grp = _fallGroupOf(e.col, e.row);
    if (grp && !seen.has(grp)) { seen.add(grp); _renderWaterfall(grp, t, day, z); }
  }
}

// ── Waterfalls ───────────────────────────────────────────────────────────
// The generator marks a line of tiles across a river as _waterfall
// (water_vegetation_system.js _markWaterfall). On a diagonal channel those
// tiles form a staircase, so drawing each tile on its own broke one fall
// into offset white boxes. Instead the tiles are grouped, a straight lip is
// fitted through them, and the whole fall is drawn as one feature in a
// frame aligned with it: local +x downstream, +y along the lip.
let _fallCache = null;   // { sig, byTile: Map<key, group> }
function _fallGroupOf(c, r) {
  const sig = WaterSystem.getWaterTiles().size;
  if (!_fallCache || _fallCache.sig !== sig) _fallCache = { sig, byTile: _buildFallGroups() };
  return _fallCache.byTile.get(c * 100000 + r);
}
function _buildFallGroups() {
  const byTile = new Map(), tiles = [];
  for (const k of WaterSystem.getWaterTiles()) {
    const i = k.indexOf(','), c = +k.slice(0, i), r = +k.slice(i + 1);
    const e = GridManager.getEntity(c, r);
    if (e && e.type === T.WATER && e._waterfall) tiles.push(e);
  }
  const key = (c, r) => c * 100000 + r;
  const at = new Map(tiles.map(e => [key(e.col, e.row), e]));
  for (const seed of tiles) {
    if (byTile.has(key(seed.col, seed.row))) continue;
    // 8-connected flood: a diagonal lip steps corner to corner.
    const members = [], stack = [seed];
    byTile.set(key(seed.col, seed.row), null);
    while (stack.length) {
      const e = stack.pop(); members.push(e);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const n = at.get(key(e.col + dx, e.row + dy));
        if (n && !byTile.has(key(n.col, n.row))) { byTile.set(key(n.col, n.row), null); stack.push(n); }
      }
    }
    const grp = _fitFall(members);
    for (const m of members) byTile.set(key(m.col, m.row), grp);
  }
  return byTile;
}
// Lip line through the tile centres (principal axis), downstream normal to
// it on the side the water is flowing, and a clip path of nearby water.
function _fitFall(members) {
  let cx = 0, cy = 0, fx = 0, fy = 0;
  for (const m of members) { cx += m.col + 0.5; cy += m.row + 0.5; fx += m._flowDc || 0; fy += m._flowDr || 0; }
  cx /= members.length; cy /= members.length;
  if (!fx && !fy) fx = 1;
  const fl = Math.hypot(fx, fy); fx /= fl; fy /= fl;
  let sxx = 0, syy = 0, sxy = 0;
  for (const m of members) { const dx = m.col + 0.5 - cx, dy = m.row + 0.5 - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  let vx, vy;
  if (members.length > 1 && sxx + syy > 0.01) {
    const a = 0.5 * Math.atan2(2 * sxy, sxx - syy); vx = Math.cos(a); vy = Math.sin(a);
  } else { vx = -fy; vy = fx; }
  // Downstream = normal to the lip, pointing with the flow. If the fit came
  // out nearly along the flow (a ragged group), fall back to across it.
  let ux = -vy, uy = vx;
  if (Math.abs(ux * fx + uy * fy) < 0.35) { vx = -fy; vy = fx; ux = fx; uy = fy; }
  if (ux * fx + uy * fy < 0) { ux = -ux; uy = -uy; }
  let lo = Infinity, hi = -Infinity;
  for (const m of members) { const p = (m.col + 0.5 - cx) * vx + (m.row + 0.5 - cy) * vy; lo = Math.min(lo, p); hi = Math.max(hi, p); }
  // Water within reach of the fall, so foam and mist never spill onto land.
  const clip = new Path2D(), R = Math.ceil((hi - lo) / 2) + 5;
  for (let r = Math.floor(cy) - R; r <= Math.floor(cy) + R; r++)
    for (let c = Math.floor(cx) - R; c <= Math.floor(cx) + R; c++)
      if (WaterSystem.isWater(c, r)) clip.rect(c * TILE, r * TILE, TILE, TILE);
  return { cx: cx * TILE, cy: cy * TILE, ux, uy, vx, vy, lo: (lo - 0.5) * TILE, hi: (hi + 0.5) * TILE,
           seed: _vegHash(members[0].col, members[0].row), clip, members };
}

// One whole waterfall: glassy water speeding to the lip, a shimmering
// curtain, a boiling foam mass at its foot, foam streaks drifting off down
// a darker plunge pool (the step down is what sells the height), mist, and
// shaded boulders on both banks.
function _renderWaterfall(F, t, day, z) {
  // What the dams have done to it (ReservoirSystem.fallState): Q is how much
  // of the river goes over (it shrinks to a ribbon in the middle of the
  // channel over bare wet rock), A how much of it shows above a reservoir
  // that has flooded it.
  const fs = typeof ReservoirSystem !== 'undefined' && ReservoirSystem.fallStateEased && F.members
    ? ReservoirSystem.fallStateEased(F, F.members) : { flow: 1, drown: 0 };
  const A = 1 - fs.drown, Q = fs.flow;
  if (A <= 0.01) return;
  const lit = 0.45 + 0.55 * day, s = F.seed, T2 = TILE;
  const y0 = F.lo, y1 = F.hi, span = y1 - y0;
  const fine = z > 0.42;
  const wob = (y, k) => Math.sin(y * 0.21 + s * 17 + k) * 1.6 + Math.sin(y * 0.07 + s * 5) * 2.2;
  const toLocal = () => ctx.transform(F.ux, F.uy, F.vx, F.vy, F.cx, F.cy);

  // A soft oval that fades to nothing in every direction — rectangles of
  // gradient left hard straight edges across the water.
  const glow = (x, y, rx, ry, rgb, a) => {
    ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry);
    const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    gg.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`); gg.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };
  const mid = (y0 + y1) / 2;

  ctx.save();
  ctx.clip(F.clip);
  toLocal();
  ctx.globalAlpha = A;
  // Plunge pool sits lower: a deep shadow spreading out below the fall.
  glow(T2 * 0.9, mid, T2 * 2.6, span * 0.42, '2,10,22', 0.34);
  // Approach: water thinning and brightening as it speeds up to the lip.
  glow(-T2 * 0.1, mid, T2 * 1.5, span * 0.42, '120,190,215', 0.3 * lit * (0.3 + 0.7 * Q));
  let g;
  if (fine) {
    // Smooth tongues of water drawn toward the lip.
    ctx.strokeStyle = `rgba(190,230,245,${(0.35 * lit * Q).toFixed(3)})`; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let y = y0 + 5; y < y1 - 3; y += 7) {
      const ph = (t * 0.9 + _vegHash(y | 0, s * 1e4 | 0)) % 1, x = -T2 * 1.5 + ph * T2 * 1.4;
      ctx.moveTo(x, y + wob(y, 1) * 0.3); ctx.lineTo(x + 6 + ph * 8, y + wob(y, 1) * 0.3);
    }
    ctx.stroke();
  }
  // How much water goes over at each point along the lip: full in the
  // channel, thinning to a trickle against the banks, so the curtain ends
  // in the rock rather than being cut off square.
  // The fade starts a little in from each end: on a diagonal river the
  // channel's square tiles end before the fitted lip does, and anything
  // still opaque there is cut off in a straight line by the water clip.
  const EDGE = Math.min(T2 * 1.2, span * 0.35), INSET = Math.min(T2 * 0.3, span * 0.08);
  const tp0 = y => { const k = Math.max(0, Math.min(1, (y - y0 - INSET) / EDGE, (y1 - INSET - y) / EDGE)); return k * k * (3 - 2 * k); };
  // Less water goes over in a narrower ribbon, down the middle of the
  // channel; at full flow this is 1 all along the lip.
  const halfW = (span / 2 + EDGE) * (0.15 + 0.85 * Q);
  const tp = y => { const k = Math.max(0, Math.min(1, (halfW - Math.abs(y - mid)) / EDGE)); return tp0(y) * k * k * (3 - 2 * k); };
  const CW = T2 * 0.8;                                     // how far the curtain reaches downstream
  const foot = y => wob(y, 0) + CW * (0.35 + 0.65 * tp(y)) + wob(y, 2) * 1.2;

  // The step: a ledge of dark wet rock across the river at the lip. The
  // water covers most of it; it shows at the ends, where the fall thins
  // out, and as a dark band under the edge of the falling sheet.
  const rockC = day > 0.5 ? [58, 56, 50] : [30, 30, 28];
  ctx.fillStyle = `rgb(${rockC.join(',')})`;
  ctx.beginPath(); ctx.moveTo(-4 + wob(y0, 3) * 0.6, y0 - 3);
  for (let y = y0; y <= y1; y += 4) ctx.lineTo(-4 + wob(y, 3) * 0.6, y);
  for (let y = y1; y >= y0; y -= 4) ctx.lineTo(wob(y, 0) + 7 + Math.sin(y * 0.5 + s * 9) * 1.5, y);
  ctx.closePath(); ctx.fill();
  if (fine) {                                              // stones set in the ledge
    for (let y = y0 + 3; y < y1; y += 5) {
      const h = _vegHash(y * 7 | 0, s * 1e4 + 3 | 0);
      ctx.fillStyle = `rgba(${rockC.map(v => v + 22).join(',')},${(0.9 - tp(y) * 0.6).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(wob(y, 0) + 1 + h * 4, y, 1.6 + h * 1.6, 1.3 + h, h * 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  // The drop's shadow at the foot, so the pool reads as lower than the lip.
  glow(CW * 0.95, mid, T2 * 0.7, span * 0.4, '0,8,16', 0.45);

  // The falling sheet: clear blue-green as it rolls over the lip, whitening
  // as it breaks up on the way down.
  g = ctx.createLinearGradient(0, 0, CW, 0);
  g.addColorStop(0,    `rgba(70,140,165,${(0.9 * lit).toFixed(3)})`);
  g.addColorStop(0.18, `rgba(150,210,228,${(0.92 * lit).toFixed(3)})`);
  g.addColorStop(0.55, `rgba(222,242,250,${(0.94 * lit).toFixed(3)})`);
  g.addColorStop(1,    `rgba(248,252,255,${(0.96 * lit).toFixed(3)})`);
  // Drawn in thin strips along the lip, each fading with how much water
  // goes over there, so the sheet dissolves into the rock at the banks
  // instead of ending on a hard edge.
  // (Two-pixel strips close up; zoomed out those were under a screen pixel
  // each and a hundred-odd fills a frame, so the strips get wider there.)
  ctx.fillStyle = g;
  const strip = fine ? 2 : 6;
  for (let y = y0; y < y1; y += strip) {
    const k = tp(y + strip / 2); if (k < 0.02) continue;
    ctx.globalAlpha = A * Math.min(1, k * 1.3);
    const xa = wob(y + strip / 2, 0);
    ctx.fillRect(xa, y, foot(y + strip / 2) - xa, Math.min(strip, y1 - y));
  }
  ctx.globalAlpha = A;
  // Strands: dark seams and bright ropes of water racing down the sheet.
  ctx.lineCap = 'round';
  // Each streak fades out at both ends (a gradient along the fall), so the
  // sheet's lower edge reads as water breaking up, not a comb of lines.
  for (const [col, w, step, speed, a0] of [['30,85,110', 1.2, 5.1, 1.8, 0.3], ['255,255,255', 1.0, 2.7, 2.6, 0.6]]) {
    const sg = ctx.createLinearGradient(0, 0, CW, 0);
    sg.addColorStop(0, `rgba(${col},0)`);
    sg.addColorStop(0.3, `rgba(${col},${(a0 * lit).toFixed(3)})`);
    sg.addColorStop(0.75, `rgba(${col},${(a0 * lit).toFixed(3)})`);
    sg.addColorStop(1, `rgba(${col},0)`);
    ctx.strokeStyle = sg; ctx.lineWidth = w;
    ctx.beginPath();
    for (let y = y0 + 1.5; y < y1; y += step) {
      const k = tp(y); if (k < 0.15) continue;
      const h = _vegHash(y * 10 | 0, 7 + s * 1e4 + step * 10 | 0);
      const x0 = wob(y, 0), len = foot(y) - x0;
      const ph = (t * speed * (0.8 + h * 0.5) + h * 5) % 1;
      const a = x0 + ph * len * 0.8, b = Math.min(foot(y) - 2, a + len * (0.3 + h * 0.3));
      if (b <= a) continue;
      ctx.moveTo(a, y + wob(y, 4) * 0.15); ctx.lineTo(b, y + wob(y, 4) * 0.15);
    }
    ctx.stroke();
  }
  // The lip: a glassy highlight where the water bends over the edge.
  ctx.strokeStyle = `rgba(225,248,255,${(0.85 * lit).toFixed(3)})`; ctx.lineWidth = 1.8;
  ctx.beginPath();
  { let pen = false;
    for (let y = y0; y <= y1; y += 4) {
      if (tp(y) < 0.08) { pen = false; continue; }
      if (pen) ctx.lineTo(wob(y, 0) + 1, y); else { ctx.moveTo(wob(y, 0) + 1, y); pen = true; }
    } }
  ctx.stroke();

  // Foam boiling at the foot: dense white puffs with soft edges — a solid
  // core along the base of the sheet and a looser skirt spreading below.
  // (Faint white haze over dark water just reads as grey, so the cores
  // stay near-opaque and only the rim fades.)
  const puff = (x, y, r, a) => {
    const pg = ctx.createRadialGradient(x, y, 0, x, y, r);
    pg.addColorStop(0, `rgba(250,253,255,${a.toFixed(3)})`);
    pg.addColorStop(0.55, `rgba(240,250,255,${(a * 0.75).toFixed(3)})`);
    pg.addColorStop(1, 'rgba(235,248,255,0)');
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };
  // Zoomed out, half as many puffs a little bigger: the same foam at two or
  // three pixels a puff, for half the gradients.
  const puffSpread = fine ? 1 : 2, puffGrow = fine ? 1 : 1.3;
  for (const [a, rad, reach, step] of [[0.95, 7, 0.12, 4], [0.75, 8, 0.4, 6], [0.45, 11, 0.9, 9]]) {
    for (let y = y0 + 3; y < y1 - 2; y += step * puffSpread) {
      const k = tp(y); if (k < 0.1) continue;
      const h = _vegHash(y * 3 | 0, s * 1e4 + rad | 0);
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.4 + h * 20);
      const x = foot(y) - 2 + h * T2 * reach, r = rad * puffGrow * (0.7 + 0.5 * pulse) * (0.5 + 0.5 * k) * (0.45 + 0.55 * Q);
      puff(x, y + (h - 0.5) * 5, r, a * lit * (1 - h * 0.3));
    }
  }
  if (fine) {                                              // spray flecks thrown off the foot
    ctx.fillStyle = `rgba(255,255,255,${(0.8 * lit).toFixed(3)})`;
    for (let k = 0; k < span / 3; k++) {
      const h = _vegHash(k + 200, s * 1e4 | 0), ph = (t * 1.3 + h * 3) % 1;
      const y = y0 + h * span; if (tp(y) < 0.3) continue;
      const x = foot(y) + ph * T2 * 0.5, r = 0.6 + (1 - ph) * 0.8;
      ctx.beginPath(); ctx.arc(x, y + Math.sin(h * 40) * ph * 6, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (fine) {
    // Foam streaks drifting off down the pool, fanning out and fading.
    ctx.lineWidth = 1.3;
    for (let k = 0; k < Math.max(4, span / 9); k++) {
      const h = _vegHash(k, s * 1e4 | 0), ph = (t * 0.28 + h) % 1;
      const y = y0 + h * span, x = CW + T2 * 0.4 + ph * T2 * 2.6, fan = (y - (y0 + y1) / 2) * 0.12 * ph;
      ctx.strokeStyle = `rgba(225,242,250,${(0.5 * (1 - ph) * lit * tp(y)).toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(x, y + fan); ctx.quadraticCurveTo(x + 5, y + fan + 2, x + 10 + ph * 6, y + fan * 1.3); ctx.stroke();
    }
    // Ripple rings spreading from the foot.
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.35 + k / 3 + s) % 1;
      ctx.strokeStyle = `rgba(200,232,245,${(0.3 * (1 - ph) * lit * Q).toFixed(3)})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(CW + T2 * 0.5, (y0 + y1) / 2, T2 * 0.4 + ph * T2 * 1.4, span * (0.28 + 0.14 * ph), 0, -1.3, 1.3); ctx.stroke();
    }
  }
  // Mist rising off the pool, thinning toward the banks.
  for (let k = 0; k < Math.max(3, span / 14); k++) {
    const h = _vegHash(k + 50, s * 1e4 | 0), ph = (t * 0.22 + h) % 1;
    const x = CW + T2 * 0.3 + ph * T2 * 1.2, y = y0 + h * span, k2 = tp(y), r = (6 + ph * 14) * (0.4 + 0.6 * k2);
    if (k2 < 0.05) continue;
    const mg = ctx.createRadialGradient(x, y, 0, x, y, r);
    mg.addColorStop(0, `rgba(240,248,252,${(0.3 * (1 - ph) * lit * k2 * Q).toFixed(3)})`);
    mg.addColorStop(1, 'rgba(240,248,252,0)');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // Boulders: clusters on both banks at the ends of the lip, and a couple
  // breaking the curtain. Drawn unclipped, so they sit on the bank.
  ctx.save();
  toLocal();
  ctx.globalAlpha = A;   // under the reservoir with the rest
  const rock = (x, y, r, h) => {
    const base = day > 0.5 ? [96, 92, 84] : [46, 45, 42];
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(x + 1.5, y + 1.5, r * 1.1, r * 0.85, h * 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgb(${base.map(v => v | 0).join(',')})`;
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.1, r * 0.85, h * 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,255,245,${(0.22 * lit).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.3, r * 0.5, r * 0.35, h * 6, 0, Math.PI * 2); ctx.fill();
  };
  for (const [end, dir] of [[y0, -1], [y1, 1]]) {
    for (let k = 0; k < 5; k++) {
      const h = _vegHash(k + (dir > 0 ? 20 : 30), s * 1e4 | 0);
      rock((h - 0.35) * T2 * 1.1, end + dir * (1 + h * 10), 4 + h * 5, h);
    }
  }
  if (span > T2 * 1.5) {
    for (let k = 0; k < Math.floor(span / (T2 * 1.3)); k++) {
      const h = _vegHash(k + 70, s * 1e4 | 0);
      rock(2 + h * 4, y0 + (0.2 + 0.6 * h) * span, 2.5 + h * 2, h);
    }
  }
  ctx.restore();
}

// ─── Deterministic per-tile hash (stable across frames, no flicker) ───
function _vegHash(a, b) {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

// Builds a smooth, irregular blob outline (rounded polygon through jittered
// radii) into the current path — used for canopy masses so foliage reads as
// leafy clumps instead of perfect circles. Deterministic per seed pair.
function _blobPath(cx, cy, r, seedA, seedB, n = 9, irregularity = 0.3, append = false, targetCtx = ctx) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const h = _vegHash(seedA + i * 13, seedB + i * 7);
    const rad = r * (1 - irregularity / 2 + irregularity * h);
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.88]);
  }
  if (!append) targetCtx.beginPath();
  const midStart = [(pts[n-1][0]+pts[0][0])/2, (pts[n-1][1]+pts[0][1])/2];
  targetCtx.moveTo(midStart[0], midStart[1]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[i];
    const p1 = pts[(i+1) % n];
    const mx = (p0[0]+p1[0])/2, my = (p0[1]+p1[1])/2;
    targetCtx.quadraticCurveTo(p0[0], p0[1], mx, my);
  }
  targetCtx.closePath();
}

// Trunk + bark striations + root flare — organic taper with subtle bend.
// Pulled out so callers can draw it BEFORE foliage (conifer — trunk tucks
// behind the tiers) or AFTER foliage (deciduous — trunk shows below canopy).
function _drawTreeTrunk(targetCtx, cx, cy, py, scale, sway, isConifer) {
  const trunkTopY = isConifer ? cy - 3*scale : cy + 3*scale;
  const trunkBaseY = py + TILE - 3;
  const midY = (trunkBaseY + trunkTopY) / 2;
  const trunkGrad = targetCtx.createLinearGradient(cx-4.5*scale, 0, cx+4.5*scale, 0);
  trunkGrad.addColorStop(0,   '#241304');
  trunkGrad.addColorStop(0.45,'#6a3a14');
  trunkGrad.addColorStop(0.55,'#7c451a');
  trunkGrad.addColorStop(1,   '#241304');
  targetCtx.beginPath();
  targetCtx.moveTo(cx-4.5*scale, trunkBaseY);
  targetCtx.lineTo(cx+4.5*scale, trunkBaseY);
  targetCtx.quadraticCurveTo(cx+2.5*scale+sway*0.15, midY, cx+1.5*scale+sway*0.2, trunkTopY);
  targetCtx.lineTo(cx-1.5*scale+sway*0.2, trunkTopY);
  targetCtx.quadraticCurveTo(cx-2.5*scale+sway*0.15, midY, cx-4.5*scale, trunkBaseY);
  targetCtx.closePath();
  targetCtx.fillStyle = trunkGrad;
  targetCtx.fill();

  // Bark striations for texture
  targetCtx.strokeStyle = 'rgba(0,0,0,0.28)'; targetCtx.lineWidth = 0.7;
  targetCtx.beginPath(); targetCtx.moveTo(cx-2*scale, trunkBaseY-1); targetCtx.lineTo(cx-1.1*scale+sway*0.12, trunkTopY+2); targetCtx.stroke();
  targetCtx.beginPath(); targetCtx.moveTo(cx+0.5*scale, trunkBaseY-1); targetCtx.lineTo(cx+0.9*scale+sway*0.1, midY); targetCtx.stroke();
  targetCtx.strokeStyle = 'rgba(255,220,180,0.12)';
  targetCtx.beginPath(); targetCtx.moveTo(cx+2.2*scale, trunkBaseY-1); targetCtx.lineTo(cx+1.4*scale+sway*0.18, trunkTopY+2); targetCtx.stroke();

  // Root flare
  targetCtx.strokeStyle = '#3a2107'; targetCtx.lineWidth = 1.6*scale;
  targetCtx.beginPath(); targetCtx.moveTo(cx-2.2*scale, trunkBaseY-1); targetCtx.lineTo(cx-6.5*scale, py+TILE-1); targetCtx.stroke();
  targetCtx.beginPath(); targetCtx.moveTo(cx+2.2*scale, trunkBaseY-1); targetCtx.lineTo(cx+6.5*scale, py+TILE-1); targetCtx.stroke();
}

function renderBush(e, px, py, t) {
    const cx = px + TILE/2, cy = py + TILE/2;
    const prog = e._chopProgress || 0;
    const sway = Math.sin(t * 1.4 + e.col * 0.8 + e.row * 0.5) * 1.5;

    // Deterministic variety per tile — size + occasional flowering bush
    const h1 = _vegHash(e.col + 17, e.row);
    const h2 = _vegHash(e.row + 53, e.col);
    const flowering = h1 < 0.22;
    const scale = 0.85 + h2 * 0.3;

    const bx0 = cx + sway * 0.4, by0 = cy;
    const baseR = 7.5 * scale;
    const baseAlpha = prog > 0 ? 0.6 : 1;
    const _looks = _seasonLayers(e, _seasonState(e.col, e.row, false));

    // LOD: the full multi-lobe canopy (outline pass + fill pass + clipped
    // lighting gradient + up to 7 individual mottling ellipses + optional
    // flowers) is a lot of draw calls for something that reads as a few
    // px blob once zoomed out. Vegetation covers ~1.5% of the whole map,
    // so at low zoom this was easily hundreds of fully-detailed bushes
    // rendering every frame. Cross-fades between the silhouette and full
    // canopy over a small zoom band (instead of an instant swap) so a
    // zoom/pan crossing the LOD boundary doesn't read as a pop — below the
    // band only the silhouette is drawn (same cost as before), above it
    // only the full canopy (also same cost as before); the extra draw call
    // only happens for the few frames actually inside the fade band.
    const _zoom = typeof Camera !== 'undefined' ? Camera.zoom : 1;
    const _LOD_LOW = 0.35, _LOD_HIGH = 0.5;
    const _raw = Math.max(0, Math.min(1, (_zoom - _LOD_LOW) / (_LOD_HIGH - _LOD_LOW)));
    const _detailT = _raw * _raw * (3 - 2 * _raw); // smoothstep: 0=silhouette, 1=full detail

    if (_detailT < 1) {
      ctx.save();
      ctx.globalAlpha = baseAlpha * (1 - _detailT);
      // Two low, overlapping lobes instead of one perfect ellipse — reads
      // as a squat clump of foliage rather than a plain circle, still one
      // fillStyle + one fill() call.
      ctx.beginPath();
      ctx.ellipse(bx0 - baseR * 0.35, by0, baseR * 0.75, baseR * 0.62, 0, 0, Math.PI * 2);
      ctx.moveTo(bx0 + baseR * 0.35 + baseR * 0.78, by0 - baseR * 0.15);
      ctx.ellipse(bx0 + baseR * 0.35, by0 - baseR * 0.15, baseR * 0.78, baseR * 0.65, 0, 0, Math.PI * 2);
      const a0 = ctx.globalAlpha;
      for (const [_bushSeason, w] of _looks) {
        ctx.globalAlpha = a0 * w * (_bushSeason.state === 2 ? 0.5 : 1);
        ctx.fillStyle = _bushSeason.state === 2 ? _BARE_FLAT : _bushSeason.state === 1 ? _AUTUMN_FLAT[_bushSeason.tint] : '#245a11';
        ctx.fill();
      }
      ctx.restore();
    }

    if (_detailT > 0) {
      ctx.save();
      ctx.globalAlpha = baseAlpha * _detailT;

      // Ground contact shadow
      ctx.save();
      ctx.globalAlpha *= 0.25;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(cx + 1, cy + 9 * scale, 9 * scale, 3 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Bushes use the photo-rendered Blender variants once loaded (same
      // source geometry-nodes plant as the trees, cropped to an overhead
      // shot of just the canopy mass so no trunk shows). The three variants
      // already carry their own baked-in berries (red/blue/gold), which
      // double as the "flowering" look — so flowering tiles just pick from
      // the same photo set instead of drawing separate procedural blooms.
      // Any bush whose photo hasn't loaded yet falls back to the procedural
      // multi-lobe canopy (with procedural flowers for flowering tiles).
      const _bi = Math.floor(h2 * 4111) % _bushPhotoSprites.length;
      const photoOn = !!(_bushPhotoSprites[_bi] && _bushPhotoSprites[_bi].loaded);
      if (photoOn) {
        const a0 = ctx.globalAlpha;
        for (const [_bushSeason, w] of _looks) {
          const _bSeason = _bushSeason.state === 2 ? _bushWinterSprites[_bi] : _bushSeason.state === 1 ? _bushAutumnSprites[_bi] : null;
          const photo = _bSeason && _bSeason.loaded ? _bSeason : _bushPhotoSprites[_bi];
          const dispW = 20 * scale, dispH = dispW;
          ctx.globalAlpha = a0 * w;
          ctx.drawImage(photo, bx0 - _BUSH_PHOTO_ANCHOR_X * dispW, by0 - _BUSH_PHOTO_ANCHOR_Y * dispH, dispW, dispH);
        }
        ctx.globalAlpha = a0;
      } else {
        const lobes = [
          { ox: -baseR*0.42, oy:  baseR*0.12, r: baseR*0.95, sA: e.col*3+1, sB: e.row*3+1 },
          { ox:  baseR*0.44, oy:  baseR*0.05, r: baseR*0.82, sA: e.col*3+5, sB: e.row*3+5 },
          { ox:  0,           oy: -baseR*0.48, r: baseR*0.62, sA: e.col*3+9, sB: e.row*3+9 },
        ];

        // Outline pass — same lobes ~10% larger, filled solid underneath. This
        // is a fill, not a stroke: stroking the merged multi-lobe path traces
        // every internal seam where lobes overlap (a scribble through the
        // interior); a filled rim behind a smaller main shape keeps the outer
        // edge clean with no interior lines.
        lobes.forEach((l, i) => {
          _blobPath(bx0+l.ox, by0+l.oy, l.r*1.12, l.sA, l.sB, 8, 0.32, i > 0);
        });
        ctx.fillStyle = '#0e2c08';
        ctx.fill();

        // Main foliage pass — normal radius, on top
        lobes.forEach((l, i) => {
          _blobPath(bx0+l.ox, by0+l.oy, l.r, l.sA, l.sB, 8, 0.32, i > 0);
        });
        ctx.fillStyle = '#245a11';
        ctx.fill();

        // ONE soft matte light pass across the whole silhouette — flat shading,
        // not a shiny per-lobe specular highlight
        ctx.save();
        ctx.clip();
        const lightG = ctx.createLinearGradient(bx0 - baseR, by0 - baseR, bx0 + baseR*0.6, by0 + baseR*0.9);
        lightG.addColorStop(0,   'rgba(150,215,80,0.30)');
        lightG.addColorStop(0.5, 'rgba(0,0,0,0)');
        lightG.addColorStop(1,   'rgba(0,20,0,0.28)');
        ctx.fillStyle = lightG;
        ctx.fillRect(bx0 - baseR*1.6, by0 - baseR*1.6, baseR*3.2, baseR*3.2);
        ctx.restore();

        // Matte leaf-clump mottling — small irregular tonal patches, not gloss
        for (let i = 0; i < 7; i++) {
          const fh = _vegHash(e.col*13 + i, e.row*13 + i*2);
          const fv = _vegHash(e.row*13 + i*2, e.col*13 + i);
          const dx = (fh - 0.5) * baseR * 1.9, dy = (fv - 0.55) * baseR * 1.7;
          if (dx*dx + dy*dy*1.3 > baseR*baseR*1.4) continue;
          const tone = _vegHash(i*5 + e.col, e.row*5 + i);
          const dabCol = tone < 0.4 ? 'rgba(10,40,5,0.35)' : tone < 0.75 ? 'rgba(70,150,35,0.28)' : 'rgba(120,200,60,0.22)';
          ctx.beginPath();
          ctx.ellipse(bx0+dx, by0+dy, 1.8*scale, 1.1*scale, fh*Math.PI*2, 0, Math.PI*2);
          ctx.fillStyle = dabCol;
          ctx.fill();
        }
      }

      // Occasional flowering bush — small colored blooms scattered across canopy.
      // Only needed when the photo (which already has its own berries) isn't
      // in play — i.e. the procedural-canopy fallback path above.
      if (flowering && !photoOn) {
        const flowerCol = h2 < 0.5 ? '#ff9fc6' : '#fff0a0';
        for (let i = 0; i < 6; i++) {
          const fh = _vegHash(e.col*7 + i, e.row*7 + i*3);
          const fv = _vegHash(e.row*7 + i*3, e.col*7 + i);
          const fx = bx0 + (fh - 0.5) * 13 * scale;
          const fy = by0 + (fv - 0.4) * 8 * scale;
          ctx.beginPath(); ctx.arc(fx, fy, 1.3, 0, Math.PI*2);
          ctx.fillStyle = flowerCol; ctx.fill();
        }
      }

      ctx.restore();
    }

    // Chop progress bar — drawn once regardless of LOD blend (matches
    // original behaviour: both branches drew it identically)
    if (prog > 0) {
      const bw = TILE-8, bx = px+4, by = py+TILE-6;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, bw, 5);
      ctx.fillStyle = `rgba(${Math.round(220-220*prog)},${Math.round(180+75*prog)},0,0.9)`;
      ctx.fillRect(bx, by, bw * prog, 5);
    }
  }

// ── Static tree art cache ──────────────────────────────────────────
// Trees are the most numerous entity in the game and the costliest to draw
// (trunk + either 3 layered conifer tiers or a 4-lobe canopy, each with
// outline/highlight/rim passes and a clipped lighting gradient — ~15-25
// canvas calls). Re-running all of that from scratch every frame for every
// visible tree, even when nothing about the tree has changed, was a major
// per-frame cost independent of camera movement. Species/scale/canopy-shape
// are already deterministic per tile (see h1/h2/h3 below), so the actual
// pixels only vary across a small bucketed set of (species, size, shape)
// combinations — bake each unique combination to an offscreen canvas once,
// then every frame just drawImage() the cached bitmap with a rotation
// transform for sway, instead of replaying the vector path.
//
// Trade-off: canopy shape used to be uniquely seeded per exact tile
// position (e.col/e.row fed into the lobe irregularity); now it's seeded
// by an 8-way shape bucket instead, so distant trees of the same species/
// size can share an identical silhouette. Not visually distinguishable at
// normal play zoom, and still 8x the variety of a single fixed tree shape.
const _treeSpriteCache = new Map();
const _TREE_SPRITE_PAD  = 55;
const _TREE_SPRITE_SIZE = 110;

// Photo-rendered deciduous tree variants (Blender geometry-nodes tree, 4
// randomized shape variants, rendered on a tilt matching the game's camera
// angle). Replaces the procedural deciduous canopy below. Anchor fractions
// were measured in Blender by projecting each tree's world-space trunk base
// through the render camera.
const _TREE_PHOTO_ANCHOR_X = 0.50;
const _TREE_PHOTO_ANCHOR_Y = 0.84;
const _TREE_PHOTO_ASPECT   = 900 / 1200; // source render width / height
const _treePhotoSprites = ['a', 'b', 'c', 'd'].map(k => {
  const img = new Image();
  img.loaded = false;
  img.onload = () => { img.loaded = true; };
  img.src = `img/tree_var_${k}.png`;
  return img;
});

// Photo-rendered conifer variants (Blender geometry-nodes fir sapling, 3
// randomized shape variants, same render rig/tilt as the deciduous set
// above). Replaces the procedural stacked-tier conifer canopy below.
const _FIR_PHOTO_ANCHOR_X = 0.50;
const _FIR_PHOTO_ANCHOR_Y = 0.90;
const _FIR_PHOTO_ASPECT   = 900 / 1200; // source render width / height
const _firPhotoSprites = ['a', 'b', 'c'].map(k => {
  const img = new Image();
  img.loaded = false;
  img.onload = () => { img.loaded = true; };
  img.src = `img/fir_var_${k}.png`;
  return img;
});

// Seasonal versions of the three sets above, made from the same renders by
// scripts/make_seasonal_trees.py so every tree keeps its own shape through
// the year: three autumn colourways per deciduous tree, a bare winter one,
// snow on the firs, and autumn and winter bushes (the berries stay on).
// Which one a tree shows comes from Seasons.foliage() and the snow on the
// ground (FrostSystem) against that tree's own hash: see _seasonalPhoto.
const _seasonImg = (src) => { const img = new Image(); img.loaded = false; img.onload = () => { img.loaded = true; }; img.src = src; return img; };
const _treeAutumnSprites = ['a', 'b', 'c', 'd'].map(k => ['gold', 'amber', 'crimson'].map(c => _seasonImg(`img/tree_var_${k}_autumn_${c}.png`)));
const _treeWinterSprites = ['a', 'b', 'c', 'd'].map(k => _seasonImg(`img/tree_var_${k}_winter.png`));
const _firWinterSprites  = ['a', 'b', 'c'].map(k => _seasonImg(`img/fir_var_${k}_winter.png`));
const _bushAutumnSprites = ['a', 'b', 'c', 'd', 'e', 'f'].map(k => _seasonImg(`img/bush_var_${k}_autumn.png`));
const _bushWinterSprites = ['a', 'b', 'c', 'd', 'e', 'f'].map(k => _seasonImg(`img/bush_var_${k}_winter.png`));
// Flat colours for the zoomed-out silhouettes, to match.
const _AUTUMN_FLAT  = ['#c99a2c', '#c8681e', '#a8281c'];
const _BARE_FLAT    = '#6e5e54';
const _BLOSSOM_FLAT = ['#d88aac', '#e6dce2'];

// Spring blossom: there are no blossom renders, so each one is made the
// first time it is wanted from the tree's own summer sprite — petals painted
// only where the canopy already is (source-atop), keeping clear of the trunk
// at the foot of the image. Two colourways per tree: pink and white.
const _BLOSSOM_PETALS = [['#ec6fa4', '#f390ba', '#f8b4d0', '#e05a94'], ['#ffffff', '#f6eef2', '#fbe6ee', '#e8dce4']];
const _blossomSprites = {};
function _blossomSprite(vi, tint) {
  const key = vi + ':' + tint;
  if (_blossomSprites[key]) return _blossomSprites[key];
  const base = _treePhotoSprites[vi];
  if (!base || !base.loaded) return null;
  const w = base.naturalWidth, h = base.naturalHeight;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(base, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  let seed = 7919 + vi * 131 + tint * 17;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const cols = _BLOSSOM_PETALS[tint], r0 = w * 0.011;
  for (let i = 0; i < 900; i++) {
    const x = rnd() * w, y = rnd() * h * 0.62;               // the canopy, not the trunk below it
    g.globalAlpha = 0.65 + rnd() * 0.35;
    g.fillStyle = cols[Math.floor(rnd() * cols.length)];
    g.beginPath(); g.arc(x, y, r0 * (0.6 + rnd() * 0.9), 0, Math.PI * 2); g.fill();
  }
  c.loaded = true;
  return (_blossomSprites[key] = c);
}

// The state a plant on tile (col,row) is in: 0 green, 1 autumn, 2 bare (or,
// for a conifer, snowed on), 3 in blossom, plus which autumn (0-2) or
// blossom (0 pink, 1 white) colourway it takes.
function _seasonState(col, row, isConifer) {
  const turnAt = _vegHash(col + 5, row + 77);          // when in the change this plant goes
  if (isConifer) {
    const snow = typeof FrostSystem !== 'undefined' ? FrostSystem.coverage : 0;
    return { state: snow > 0.14 + turnAt * 0.22 ? 2 : 0, tint: 0 };
  }
  const fol = typeof Seasons !== 'undefined' ? Seasons.foliage() : null;
  if (!fol) return { state: 0, tint: 0 };
  const state = fol.bare > turnAt ? 2 : fol.turned > turnAt ? 1 : 0;
  if (state === 0 && fol.blossom > 0) {
    // About half the broadleaf trees flower, each on its own cue.
    const bh = _vegHash(col + 23, row + 51);
    if (bh < 0.55 && fol.blossom > bh / 0.55) return { state: 3, tint: _vegHash(col + 61, row + 13) < 0.6 ? 0 : 1 };
  }
  return { state, tint: Math.floor(_vegHash(col + 9, row + 3) * 3) % 3 };
}

// A plant changing state (leaves turning or falling, a fir taking or
// shedding its snow, blossom opening) used to swap sprites in one frame, and
// on screen that read as trees popping. The change is cross-faded instead:
// returns what to draw as [[state, weight], ...], the old look fading out
// under the new one over SEASON_FADE_MS. Kept on the entity, never saved. A
// plant not drawn for a while (off screen) just shows how it is now.
const SEASON_FADE_MS = 1500;
function _seasonLayers(e, st) {
  const now = performance.now();
  let v = e._seasonVis;
  if (!v || now - v.seen > 1000) v = e._seasonVis = { cur: st, prev: null, t0: 0, seen: now };
  v.seen = now;
  if (v.cur.state !== st.state || v.cur.tint !== st.tint) {
    // a change before the last one finished starts from whichever look is showing more
    v.prev = v.prev && now - v.t0 < SEASON_FADE_MS / 2 ? v.prev : v.cur;
    v.cur = st; v.t0 = now;
  }
  const k = v.prev ? Math.min(1, (now - v.t0) / SEASON_FADE_MS) : 1;
  if (k >= 1) { v.prev = null; return [[v.cur, 1]]; }
  return [[v.prev, 1 - k], [v.cur, k]];
}

// Photo-rendered bush variants — same Blender tree generator, scaled down
// and shot from a steeper overhead angle cropped to just the canopy mass so
// no trunk is visible, giving a rounded shrub silhouette instead of a small
// tree. Anchor sits mid-canopy (not the bottom edge) since renderBush's own
// ground shadow is drawn separately below the sprite.
// a/b/c carry baked-in berries (red/blue/gold); d/e/f are the plain
// no-berry canopy — kept as separate variants (not a toggle) so roughly
// half of all bushes read as berry bushes and half as plain, per-tile via
// the same hash used to pick among them.
const _BUSH_PHOTO_ANCHOR_X = 0.5;
const _BUSH_PHOTO_ANCHOR_Y = 0.65;
const _bushPhotoSprites = ['a', 'b', 'c', 'd', 'e', 'f'].map(k => {
  const img = new Image();
  img.loaded = false;
  img.onload = () => { img.loaded = true; };
  img.src = `img/bush_var_${k}.png`;
  return img;
});

function _drawTreeFoliageStatic(targetCtx, cx, cy, py, scale, isConifer, shapeSeed) {
  // Synthetic col/row stand-in for the real tile position, derived from the
  // shape bucket — keeps _blobPath's irregularity varied across the 8
  // buckets without depending on which exact tile is being cached for.
  const sc = shapeSeed * 37 + 11, sr = shapeSeed * 53 + 29;

  if (isConifer) {
    // Trunk drawn FIRST so the tiers layer on top of it — only the base
    // stub peeks out below the lowest tier, instead of the trunk cutting
    // across the foliage.
    _drawTreeTrunk(targetCtx, cx, cy, py, scale, 0, true);

    // ── Conifer: stacked tapering tiers, dark evergreen ──
    const tiers = [
      { oy: -15*scale, w: 6.5*scale, h: 9*scale,  fill: '#0f3808', hi: '#1e6013' },
      { oy: -7*scale,  w: 9*scale,   h: 10*scale, fill: '#134209', hi: '#22701a' },
      { oy: 2*scale,   w: 11.5*scale,h: 11*scale, fill: '#164a0b', hi: '#277c1e' },
    ];
    tiers.forEach(({ oy, w, h, fill, hi }) => {
      const tx = cx;
      const ty = cy + oy;
      // outline for silhouette definition
      targetCtx.beginPath();
      targetCtx.moveTo(tx, ty - h - 1);
      targetCtx.lineTo(tx - w - 1, ty + h*0.55);
      targetCtx.quadraticCurveTo(tx, ty + h*0.72, tx + w + 1, ty + h*0.55);
      targetCtx.closePath();
      targetCtx.fillStyle = 'rgba(4,16,3,0.55)';
      targetCtx.fill();
      // body
      targetCtx.beginPath();
      targetCtx.moveTo(tx, ty - h);
      targetCtx.lineTo(tx - w, ty + h*0.5);
      targetCtx.quadraticCurveTo(tx, ty + h*0.65, tx + w, ty + h*0.5);
      targetCtx.closePath();
      targetCtx.fillStyle = fill;
      targetCtx.fill();
      // sunlit facet, upper-left
      targetCtx.save();
      targetCtx.globalAlpha *= 0.5;
      targetCtx.beginPath();
      targetCtx.moveTo(tx, ty - h);
      targetCtx.lineTo(tx - w*0.55, ty + h*0.1);
      targetCtx.lineTo(tx - w*0.05, ty + h*0.28);
      targetCtx.closePath();
      targetCtx.fillStyle = hi;
      targetCtx.fill();
      targetCtx.restore();
      // snow-line style edge highlight on tier rim
      targetCtx.strokeStyle = 'rgba(255,255,255,0.06)';
      targetCtx.lineWidth = 1;
      targetCtx.beginPath();
      targetCtx.moveTo(tx - w, ty + h*0.5);
      targetCtx.quadraticCurveTo(tx, ty + h*0.65, tx + w, ty + h*0.5);
      targetCtx.stroke();
    });
  } else {
    // ── Deciduous: one cohesive leafy canopy (merged silhouette, matte
    //    shading) — NOT separate glossy balls stacked together.
    const baseR  = 10 * scale;
    const canCx  = cx;
    const canCy  = cy - 5 * scale;

    const lobes = [
      { ox: -baseR*0.32, oy: -baseR*0.08, r: baseR*0.95, sA: sc*5+2,  sB: sr*5+2  },
      { ox:  baseR*0.34, oy: -baseR*0.02, r: baseR*0.85, sA: sc*5+7,  sB: sr*5+7  },
      { ox:  baseR*0.02, oy: -baseR*0.60, r: baseR*0.72, sA: sc*5+13, sB: sr*5+13 },
      { ox: -baseR*0.06, oy:  baseR*0.32, r: baseR*0.65, sA: sc*5+19, sB: sr*5+19 },
    ];

    // Outline pass — same lobes ~10% larger, filled solid underneath.
    // NOTE: this is a fill, not a stroke. Stroking a merged multi-lobe
    // path traces every internal seam where lobes overlap (a "scribble"
    // cutting through the canopy interior); a filled rim behind a smaller
    // main shape gives a clean outer edge with no interior lines at all.
    lobes.forEach((l, i) => {
      _blobPath(canCx+l.ox, canCy+l.oy, l.r*1.12, l.sA, l.sB, 9, 0.30, i > 0, targetCtx);
    });
    targetCtx.fillStyle = '#0a2606';
    targetCtx.fill();

    // Main foliage pass — normal radius, on top, leaving a thin dark rim
    // visible only at the outer silhouette edge
    lobes.forEach((l, i) => {
      _blobPath(canCx+l.ox, canCy+l.oy, l.r, l.sA, l.sB, 9, 0.30, i > 0, targetCtx);
    });
    targetCtx.fillStyle = '#255c12';
    targetCtx.fill();

    // A single soft directional light pass across the WHOLE canopy —
    // matte shading (light upper-left, dark lower-right), not a shiny
    // specular highlight per lobe.
    targetCtx.save();
    targetCtx.clip();
    const lightG = targetCtx.createLinearGradient(canCx - baseR, canCy - baseR, canCx + baseR*0.6, canCy + baseR*0.9);
    lightG.addColorStop(0,   'rgba(150,215,80,0.35)');
    lightG.addColorStop(0.5, 'rgba(0,0,0,0)');
    lightG.addColorStop(1,   'rgba(0,20,0,0.30)');
    targetCtx.fillStyle = lightG;
    targetCtx.fillRect(canCx - baseR*1.6, canCy - baseR*1.6, baseR*3.2, baseR*3.2);
    targetCtx.restore();

    // Matte leaf-clump mottling — small irregular tonal patches for a
    // leafy read, no shine
    for (let i = 0; i < 10; i++) {
      const fh = _vegHash(sc*11 + i, sr*11 + i*3);
      const fv = _vegHash(sr*11 + i*3, sc*11 + i);
      const dx = (fh - 0.5) * baseR * 2.0;
      const dy = (fv - 0.6) * baseR * 1.8;
      if (dx*dx + dy*dy*1.3 > baseR*baseR*1.4) continue; // stay inside the canopy mass
      const tone = _vegHash(i*7 + sc, sr*7 + i);
      const dabCol = tone < 0.4 ? 'rgba(10,40,5,0.35)' : tone < 0.75 ? 'rgba(70,150,35,0.28)' : 'rgba(120,200,60,0.22)';
      targetCtx.beginPath();
      targetCtx.ellipse(canCx+dx, canCy+dy, 2.3*scale, 1.4*scale, fh*Math.PI*2, 0, Math.PI*2);
      targetCtx.fillStyle = dabCol;
      targetCtx.fill();
    }

    // Trunk drawn AFTER the canopy — it shows below the foliage as before.
    _drawTreeTrunk(targetCtx, cx, cy, py, scale, 0, false);
  }
}

function _getTreeSprite(isConifer, scale, shapeSeed) {
  const scaleBucket = Math.round(scale * 50) / 50; // ~0.02 granularity
  const key = (isConifer ? 'c' : 'd') + scaleBucket + '_' + shapeSeed;
  let sprite = _treeSpriteCache.get(key);
  if (sprite) return sprite;

  const c = document.createElement('canvas');
  c.width = _TREE_SPRITE_SIZE; c.height = _TREE_SPRITE_SIZE;
  const octx = c.getContext('2d');
  const vpy = _TREE_SPRITE_PAD, vcx = _TREE_SPRITE_PAD + TILE/2, vcy = _TREE_SPRITE_PAD + TILE/2;
  _drawTreeFoliageStatic(octx, vcx, vcy, vpy, scaleBucket, isConifer, shapeSeed);

  sprite = { canvas: c, anchorX: _TREE_SPRITE_PAD + TILE/2, anchorY: _TREE_SPRITE_PAD + TILE - 3 };
  _treeSpriteCache.set(key, sprite);
  return sprite;
}

function renderTree(e, px, py, t) {
    const cx = px + TILE/2, cy = py + TILE/2;
    const prog = e._chopProgress || 0;
    const sway = Math.sin(t * 1.1 + e.col * 0.7 + e.row * 0.4) * 2;

    // Deterministic per-tile variety — species, size, canopy shape (stable across frames)
    const h1 = _vegHash(e.col, e.row);
    const h2 = _vegHash(e.row, e.col + 91);
    const h3 = _vegHash(e.col + 41, e.row + 7);
    const isConifer = h1 < 0.32;
    const scale = 0.88 + h2 * 0.28;
    const shapeSeed = Math.floor(h3 * 8) % 8;

    const baseAlpha = prog > 0 ? 0.65 : 1;
    const _looks = _seasonLayers(e, _seasonState(e.col, e.row, isConifer));

    // LOD: same reasoning as renderBush — the full tree (trunk + either
    // 3 layered conifer tiers with outline/highlight/rim passes each, or
    // a 4-lobe canopy with a clipped lighting gradient + up to 10
    // mottling dabs) is one of the costliest sprites in the game, and
    // trees are one of the most numerous entities on the map. Cross-fades
    // between the silhouette and full sprite over a small zoom band
    // (instead of an instant swap) so a zoom/pan crossing the LOD
    // boundary doesn't read as a pop — below the band only the silhouette
    // is drawn (same cost as before), above it only the full sprite (also
    // same cost as before); the extra draw call only happens for the few
    // frames actually inside the fade band.
    const _zoom = typeof Camera !== 'undefined' ? Camera.zoom : 1;
    const _LOD_LOW = 0.35, _LOD_HIGH = 0.5;
    const _raw = Math.max(0, Math.min(1, (_zoom - _LOD_LOW) / (_LOD_HIGH - _LOD_LOW)));
    const _detailT = _raw * _raw * (3 - 2 * _raw); // smoothstep: 0=silhouette, 1=full detail

    if (_detailT < 1) {
      ctx.save();
      ctx.globalAlpha = baseAlpha * (1 - _detailT);
      if (isConifer) {
        // Trunk stub, then two stacked triangle tiers — still 2 fills
        // total, but reads as a layered pine instead of one flat wedge.
        ctx.fillStyle = '#4a3018';
        ctx.fillRect(cx - 1.3 * scale, cy + 8 * scale, 2.6 * scale, 5 * scale);
        ctx.beginPath();
        ctx.moveTo(cx, cy - 15 * scale);
        ctx.lineTo(cx - 10 * scale, cy + 10 * scale);
        ctx.lineTo(cx + 10 * scale, cy + 10 * scale);
        ctx.closePath();
        ctx.moveTo(cx, cy - 6 * scale);
        ctx.lineTo(cx - 7 * scale, cy + 10 * scale);
        ctx.lineTo(cx + 7 * scale, cy + 10 * scale);
        ctx.closePath();
        const a0 = ctx.globalAlpha;
        for (const [_season, w] of _looks) {
          ctx.globalAlpha = a0 * w;
          ctx.fillStyle = _season.state === 2 ? '#93b09c' : '#164a0b';   // snowed on
          ctx.fill();
        }
      } else {
        // Trunk stub + a lumpy 3-lobe canopy (three overlapping circles)
        // instead of one perfect ellipse — same 2-colour, 2-fill budget as
        // the conifer above, but reads as foliage clumps, not a disc.
        ctx.fillStyle = '#4a3018';
        ctx.fillRect(cx - 1.3 * scale, cy + 5 * scale, 2.6 * scale, 6 * scale);
        ctx.beginPath();
        ctx.ellipse(cx - 5.5 * scale, cy - 3 * scale, 7 * scale, 6 * scale, 0, 0, Math.PI * 2);
        ctx.moveTo(cx + 5.5 * scale + 7 * scale, cy - 3 * scale);
        ctx.ellipse(cx + 5.5 * scale, cy - 3 * scale, 7 * scale, 6 * scale, 0, 0, Math.PI * 2);
        ctx.moveTo(cx + 7 * scale, cy - 9 * scale);
        ctx.ellipse(cx, cy - 9 * scale, 7.5 * scale, 6.5 * scale, 0, 0, Math.PI * 2);
        const a0 = ctx.globalAlpha;
        for (const [_season, w] of _looks) {
          ctx.globalAlpha = a0 * w * (_season.state === 2 ? 0.45 : 1);   // bare: a thin haze of twigs
          ctx.fillStyle = _season.state === 2 ? _BARE_FLAT : _season.state === 1 ? _AUTUMN_FLAT[_season.tint]
                        : _season.state === 3 ? _BLOSSOM_FLAT[_season.tint] : '#255c12';
          ctx.fill();
        }
      }
      ctx.restore();
      if (prog > 0) {
        const bw = TILE-8, bx = px+4, by = py+TILE-6;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, bw, 5);
        const barCol = prog < 0.5
          ? `rgba(220,180,0,0.9)`
          : `rgba(${Math.round(220-220*prog)},${Math.round(180+75*prog)},0,0.9)`;
        ctx.fillStyle = barCol;
        ctx.fillRect(bx, by, bw * prog, 5);
      }
    }

    if (_detailT > 0) {
      ctx.save();
      ctx.globalAlpha = baseAlpha * _detailT;

      // Ground contact shadow — grounds the tree against the terrain. Drawn
      // live (not baked into the cached sprite) because it must stay flat on
      // the ground and NOT rotate along with the sway transform below.
      ctx.save();
      ctx.globalAlpha *= 0.3;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(cx + 2, py + TILE - 3, TILE*0.3*scale, TILE*0.1*scale, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();

      // Both species use their photo-rendered Blender variants once loaded;
      // while a photo is still loading, trees fall back to the cached
      // procedural trunk+foliage bitmap, rotated around the trunk base for
      // sway instead of re-running the vector path every frame.
      const _vi = Math.floor(h3 * 4113) % (isConifer ? 3 : 4);
      const photoAnchorX = isConifer ? _FIR_PHOTO_ANCHOR_X : _TREE_PHOTO_ANCHOR_X;
      const photoAnchorY = isConifer ? _FIR_PHOTO_ANCHOR_Y : _TREE_PHOTO_ANCHOR_Y;
      const photoAspect  = isConifer ? _FIR_PHOTO_ASPECT   : _TREE_PHOTO_ASPECT;
      ctx.save();
      ctx.translate(cx, py + TILE - 3);
      ctx.rotate(sway / 40);
      const a0 = ctx.globalAlpha;
      for (const [_season, w] of _looks) {
        ctx.globalAlpha = a0 * w;
        const _seasonal = isConifer
          ? (_season.state === 2 ? _firWinterSprites[_vi] : null)
          : (_season.state === 2 ? _treeWinterSprites[_vi] : _season.state === 1 ? _treeAutumnSprites[_vi][_season.tint]
            : _season.state === 3 ? _blossomSprite(_vi, _season.tint) : null);
        // A seasonal sprite still loading falls back to the summer one.
        const photo = _seasonal && _seasonal.loaded ? _seasonal
          : isConifer ? _firPhotoSprites[_vi] : _treePhotoSprites[_vi];
        if (photo && photo.loaded) {
          const dispH = 42 * scale;
          const dispW = dispH * photoAspect;
          ctx.drawImage(photo, -photoAnchorX * dispW, -photoAnchorY * dispH, dispW, dispH);
        } else {
          const sprite = _getTreeSprite(isConifer, scale, shapeSeed);
          ctx.drawImage(sprite.canvas, -sprite.anchorX, -sprite.anchorY);
        }
      }
      ctx.restore();

      ctx.restore();
    }

    // Chop progress bar
    if (prog > 0) {
      const bw = TILE-8, bx = px+4, by = py+TILE-6;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, bw, 5);
      const barCol = prog < 0.5
        ? `rgba(220,180,0,0.9)`
        : `rgba(${Math.round(220-220*prog)},${Math.round(180+75*prog)},0,0.9)`;
      ctx.fillStyle = barCol;
      ctx.fillRect(bx, by, bw * prog, 5);
      // Notch lines
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
      for (let i=1;i<4;i++) { ctx.beginPath(); ctx.moveTo(bx+bw*i/4, by); ctx.lineTo(bx+bw*i/4, by+5); ctx.stroke(); }
    }
  }


/* ═══════════════════════════════════════════════════════════════════
   RENDER: GAS STATION
   World sprite for the truck refueling station. Canopy +
   pump island + storage gauge, with a FUEL IN pipe stub on the left
   face (vertical centre) matching OilSystem.tickGasStation's fixed
   input port (same convention as the Fuel Generator's inlet).
   ═══════════════════════════════════════════════════════════════════ */
function renderGasStation(e, px, py, t) {
  // Gas Station — 6×5 truck fuel stop. A concrete forecourt under a lit
  // canopy with three pump islands; a convenience store at the back; the
  // fuel-oil storage tank the refinery pipe network fills (its sight gauge
  // is the station's real stock); a price pylon; and the FUEL IN pipe on
  // the left face where OilSystem's fixed input port is.
  //
  // It reacts to what's going on: a truck refuelling here lights the pump
  // nearest to it with a PUMPING readout and fuel running through the hose;
  // the store sign reads OPEN or CLOSED with the power; after dark the
  // canopy floods the forecourt with light. Authored in a 240×200-unit
  // footprint scaled by `u`.
  const w = (e.width  || 6) * TILE;
  const h = (e.height || 5) * TILE;
  const u = w / 240;
  const on = e.powered;
  const dark = DayNight.darkness();
  const night = dark > 0.35;
  const cap = EntityDefs[T.GASSTATION].storageCapacity || 400;
  const fillPct = Math.min(1, (e._fuelStored || 0) / cap);
  const X = (v) => px + v*u, Y = (v) => py + v*u;
  const R = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), ww*u, hh*u); };
  const RR = (x, y, ww, hh, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(X(x), Y(y), ww*u, hh*u, r*u); ctx.fill(); };
  const dot = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(x), Y(y), r*u, 0, Math.PI*2); ctx.fill(); };
  const ln = (x1, y1, x2, y2, c, lw) => { ctx.strokeStyle = c; ctx.lineWidth = lw*u; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
  const text = (s, x, y, size, c, align) => { ctx.fillStyle = c; ctx.font = `bold ${Math.max(4, Math.round(size*u))}px Arial, sans-serif`; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, X(x), Y(y)); };

  // Which pumps have a truck refuelling at them
  const PUMPS = [48, 120, 192];
  const active = new Set();
  if (typeof EntityRegistry !== 'undefined') {
    for (const trk of EntityRegistry.getByType(T.TRUCK)) {
      if (trk._refuelTarget !== e) continue;
      const tx = ((trk._wx || trk.col*TILE) + TILE/2 - px) / u;
      let best = 0;
      PUMPS.forEach((p, i) => { if (Math.abs(p - tx) < Math.abs(PUMPS[best] - tx)) best = i; });
      active.add(best);
    }
  }

  ctx.save();

  // ── Forecourt ────────────────────────────────────────────────────
  RR(2, 2, 236, 196, 6, '#aaa69c');
  ctx.strokeStyle = 'rgba(90,86,78,0.35)'; ctx.lineWidth = 0.8*u; ctx.beginPath();
  for (let x = 32; x < 238; x += 30) { ctx.moveTo(X(x), Y(100)); ctx.lineTo(X(x), Y(198)); }
  for (let y = 130; y < 198; y += 30) { ctx.moveTo(X(2), Y(y)); ctx.lineTo(X(238), Y(y)); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(30,26,22,0.18)';
  for (const [sx, sy, rx] of [[60, 186, 12], [128, 190, 9], [176, 184, 14], [96, 150, 7]]) { ctx.beginPath(); ctx.ellipse(X(sx), Y(sy), rx*u, rx*0.45*u, 0.2, 0, Math.PI*2); ctx.fill(); }
  // painted lane arrows
  ctx.fillStyle = 'rgba(245,240,225,0.75)';
  for (const ax of [84, 156]) {
    ctx.beginPath(); ctx.moveTo(X(ax - 3), Y(194)); ctx.lineTo(X(ax - 3), Y(182)); ctx.lineTo(X(ax - 7), Y(182)); ctx.lineTo(X(ax), Y(174)); ctx.lineTo(X(ax + 7), Y(182)); ctx.lineTo(X(ax + 3), Y(182)); ctx.lineTo(X(ax + 3), Y(194)); ctx.closePath(); ctx.fill();
  }
  // underground tank fill caps
  for (const cx of [196, 208, 220]) { dot(cx, 190, 3.2, '#5a5e62'); dot(cx, 190, 2, cx === 208 ? '#d8b020' : '#c83a2e'); }

  // ── Fuel-oil storage tank (back left) ────────────────────────────
  // Centred on the station's second tile row (y 40–80 units), which is the
  // row OilSystem's FUEL IN port sits on, so the inlet stub drawn below runs
  // straight into the tank's end cap.
  R(32, 74, 6, 10, '#6a6e72'); R(96, 74, 6, 10, '#6a6e72');          // saddles
  const tg = ctx.createLinearGradient(0, Y(42), 0, Y(78));
  tg.addColorStop(0, '#c8ccd0'); tg.addColorStop(0.35, '#f4f4f0'); tg.addColorStop(1, '#9ea2a6');
  ctx.fillStyle = tg; ctx.beginPath(); ctx.roundRect(X(22), Y(42), 90*u, 36*u, 18*u); ctx.fill();
  R(22, 56, 90, 5, '#c83a2e');
  text('FUEL OIL', 67, 68.5, 7, '#4a4e52');
  // sight gauge: the station's real stock
  RR(104, 45, 5, 30, 1.5, '#2a2e32');
  const gH = 28 * fillPct;
  R(105, 46 + 28 - gH, 3, gH, fillPct < 0.15 ? (Math.sin(t*6) > 0 ? '#e04020' : '#802010') : '#e0b020');
  for (let k = 1; k < 4; k++) R(104, 45 + k*7.5, 1.5, 0.6, '#9aa0a4');
  // ladder up the end cap
  for (let y = 44; y < 76; y += 4) R(40, y, 5, 0.8, '#5a5e62');
  ln(40, 42, 40, 78, '#5a5e62', 0.8); ln(45, 42, 45, 78, '#5a5e62', 0.8);

  // ── Convenience store (back right) ───────────────────────────────
  const storeLit = on;
  R(128, 18, 106, 8, '#e6e0d2');                                    // parapet
  R(134, 12, 14, 6, '#8a9094'); R(154, 13, 10, 5, '#8a9094');       // rooftop AC
  R(128, 26, 106, 12, '#c8322a');                                   // fascia
  R(128, 37, 106, 2.5, '#f0c030');
  text('MART', 181, 32, 9, '#fff4dc');
  R(128, 39.5, 106, 58, '#d8d2c4');
  // glazed shopfront
  const glass = storeLit ? '#f4e6be' : (night ? '#1a222c' : '#7a98b0');
  R(134, 45, 70, 46, glass);
  if (storeLit) {                                                   // shelves seen through the glass
    const SH = ['#c8403a', '#3a78c0', '#e0b030', '#4a9a5a', '#8a5ac0'];
    for (let r = 0; r < 3; r++) for (let k = 0; k < 9; k++) R(137 + k*7.4, 55 + r*11, 6, 6, SH[(k + r*2) % SH.length]);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(X(134), Y(45), 70*u, 46*u);
  }
  for (const mx of [157, 181]) R(mx, 45, 1.6, 46, '#5a5e62');
  R(134, 67, 70, 1.4, '#5a5e62');
  // door
  R(208, 50, 20, 41, '#5a5e62'); R(210, 52, 16, 39, storeLit ? '#f4e6be' : glass); R(217.4, 52, 1.2, 39, '#5a5e62');
  // OPEN / CLOSED sign
  RR(140, 71, 26, 9, 2, '#1a1a1c');
  if (on) {
    text('OPEN', 153, 75.8, 6.5, `rgba(255,${80 + Math.round(40*Math.sin(t*3))},90,1)`);
  } else {
    text('CLOSED', 153, 75.8, 5.5, '#6a3a36');
  }
  // ice chest and bins by the door
  RR(186, 88, 18, 9, 1.5, '#e8f0f4'); text('ICE', 195, 92.5, 5, '#3a78c0');
  RR(230, 86, 6, 11, 1.5, '#2a5a3a');

  // ── Canopy over the pumps ────────────────────────────────────────
  // columns
  for (const cx of PUMPS) R(cx - 2.5, 124, 5, 50, '#d8d8d4');
  // underside light pools on the forecourt
  if (on && Camera.zoom > 0.5) {
    for (const cx of PUMPS) {
      const g = ctx.createRadialGradient(X(cx), Y(160), 0, X(cx), Y(160), 46*u);
      g.addColorStop(0, `rgba(255,248,225,${night ? 0.45 : 0.12})`); g.addColorStop(1, 'rgba(255,248,225,0)');
      ctx.fillStyle = g; ctx.fillRect(X(cx - 46), Y(118), 92*u, 84*u);
    }
  }
  // pump islands
  PUMPS.forEach((cx, i) => {
    const pumping = active.has(i) && on;
    RR(cx - 18, 168, 36, 9, 3, '#c8c4b8');                           // island kerb
    R(cx - 18, 175, 36, 2, '#e0b020');
    for (const bx of [cx - 22, cx + 22]) { RR(bx - 1.8, 162, 3.6, 13, 1.8, '#e0b020'); R(bx - 1.8, 166, 3.6, 1.5, '#1a1a1a'); }   // bollards
    RR(cx - 10, 136, 20, 34, 2.5, '#eeeee8');                        // pump cabinet
    R(cx - 10, 136, 20, 5, pumping ? '#3aa050' : '#c8322a');
    RR(cx - 7, 144, 14, 9, 1.2, on ? '#0e1814' : '#1a1c1e');         // display
    if (on) {
      if (pumping) {
        text('PUMP', cx, 147, 4.2, '#60ff90');
        R(cx - 5.5, 150, 11 * ((t*0.4) % 1), 1.5, '#60ff90');
      } else {
        text(`${(3.4 + i*0.1).toFixed(2)}`, cx, 148.5, 5.2, '#ffb040');
      }
    }
    for (let k = 0; k < 3; k++) RR(cx - 7 + k*5, 156, 4, 3, 0.8, ['#3a8a4a', '#d8b020', '#2a2a2c'][k]);   // grade buttons
    R(cx - 3, 161, 6, 5, '#5a5e62');                                 // card slot panel
    // hose, and fuel moving through it while pumping
    ctx.strokeStyle = '#1e1e20'; ctx.lineWidth = 1.6*u;
    ctx.beginPath(); ctx.moveTo(X(cx + 10), Y(142)); ctx.quadraticCurveTo(X(cx + 20), Y(156), X(cx + 13), Y(166)); ctx.stroke();
    R(cx + 11, 164, 4, 5, '#3a3a3c');                                // nozzle holster
    if (pumping) {
      for (let k = 0; k < 4; k++) {
        const f = (t*1.2 + k/4) % 1;
        const bx = (1-f)*(1-f)*(cx + 10) + 2*(1-f)*f*(cx + 20) + f*f*(cx + 13);
        const by = (1-f)*(1-f)*142 + 2*(1-f)*f*156 + f*f*166;
        dot(bx, by, 0.9, '#ffc040');
      }
    }
  });
  // canopy slab and fascia
  RR(14, 98, 212, 26, 3, '#f2f2ee');
  R(14, 108, 212, 10, '#c8322a');
  R(14, 117, 212, 2.2, '#f0c030');
  text('GAS STATION', 120, 113.2, 8, '#fff4dc');
  R(14, 122, 212, 2.4, on ? `rgba(255,250,230,${night ? 0.95 : 0.7})` : '#8a8a86');   // LED strip
  for (const bx of [30, 210]) { dot(bx, 103, 3, '#c8322a'); text('F', bx, 103.2, 4, '#fff4dc'); }
  if (active.size && on) {
    ctx.fillStyle = `rgba(90,220,120,${0.35 + 0.25*Math.sin(t*4)})`;
    ctx.fillRect(X(14), Y(122), 212*u, 2.4*u);
  }

  // ── Price pylon (front right) ────────────────────────────────────
  R(226.5, 150, 3, 46, '#6a6e72');
  RR(216, 126, 22, 28, 2, '#c8322a');
  RR(218, 128, 18, 6, 1, '#f0c030');
  text('FUEL', 227, 131.2, 4.2, '#8a1e18');
  RR(218, 136, 18, 16, 1, on ? '#0e1014' : '#2a2c2e');
  if (on) {
    text('3.40', 227, 140.2, 5, '#ffb040');
    text('3.52', 227, 147.2, 5, '#ffb040');
  }

  // ── Air & water machine (left) ───────────────────────────────────
  RR(4, 140, 10, 16, 1.5, '#3a78c0');
  R(5.5, 143, 7, 3.5, '#e8eef4');
  ctx.strokeStyle = '#1e1e20'; ctx.lineWidth = 0.9*u;
  ctx.beginPath(); ctx.moveTo(X(9), Y(156)); ctx.quadraticCurveTo(X(16), Y(162), X(9), Y(166)); ctx.stroke();

  // ── FUEL IN inlet — left face, on the tank's row (OilSystem's input port) ──
  // A flanged inlet pipe with a gate valve running straight into the tank's
  // end cap. It starts past the building's own left edge, in the neighbouring
  // tile, so it meets the pipe tile's sprite (which is inset from its own
  // tile edge) instead of stopping short of it.
  const conn = !!e._fuelConnected;
  const inlet = (yU, x1U, labelled) => {
    ln(-15, yU, x1U, yU, conn ? '#5a4a30' : '#4a4640', 7);
    ln(-15, yU - 2, x1U, yU - 2, 'rgba(255,255,255,0.18)', 1.2);
    if (conn && on) {
      ctx.save(); ctx.setLineDash([2.5*u, 3.5*u]); ctx.lineDashOffset = -t*16*u;
      ln(-15, yU, x1U, yU, '#ffc040', 2);
      ctx.restore();
    }
    for (const fx of [1, x1U - 2]) RR(fx - 1.5, yU - 6, 3, 12, 0.8, conn ? '#7a6a50' : '#5e5a54');   // flanges
    // gate valve with a red handwheel
    R(6, yU - 5, 6, 10, '#5a5e62');
    ln(9, yU - 5, 9, yU - 10, '#3a3e42', 1.2);
    ctx.strokeStyle = '#c83a2e'; ctx.lineWidth = 1.4*u;
    ctx.beginPath(); ctx.arc(X(9), Y(yU - 11.5), 3.4*u, 0, Math.PI*2); ctx.stroke();
    ln(5.6, yU - 11.5, 12.4, yU - 11.5, '#c83a2e', 0.8); ln(9, yU - 14.9, 9, yU - 8.1, '#c83a2e', 0.8);
    if (labelled) {
      RR(-1, yU + 7, 20, 7, 1.2, conn ? '#2a2010' : '#1e1c18');
      text('FUEL IN', 9, yU + 10.6, 4.6, conn ? '#ffc040' : '#8a7a5a');
    }
  };
  inlet(60, 23, true);
  // A pipe still laid to the old mid-face port (from before the inlet moved
  // up to the tank) keeps working — show its stub while one is attached.
  if (typeof GasStationPorts !== 'undefined' && GasStationPorts.legacyInUse(e)) {
    inlet(100, 14, false);
  }

  // Without power the whole stop sits dark
  if (!on) { ctx.fillStyle = 'rgba(8,6,4,0.4)'; ctx.beginPath(); ctx.roundRect(X(2), Y(2), 236*u, 196*u, 6*u); ctx.fill(); }

  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

// ── University (11×8) ────────────────────────────────────────────────────
// A whole campus, authored at 11×8 and scaled to the entity's footprint, so
// universities built before the enlargement (8×6 in older saves) still draw
// the full campus inside their own tiles.
//
// Along the top: the science hall with its observatory, the domed library,
// a campanile whose clock shows the in-game time and rings on the hour, a
// Gothic chapel with a glowing rose window, and ivy-clad dormitories. Through
// the middle: a lecture hall cut away to show a professor at the chalkboard,
// the quad with the founder's statue, and the student union's café terrace.
// Along the bottom: a duck pond under a footbridge, a Victorian greenhouse,
// the gate with the campus shuttle stop, and a football field with a
// practice game. Paths crowd as classes change around the hour, sprinklers
// run at dawn, and a graduation crowd throws caps at noon.
function renderUniversity(e, px, py, t) {
  const AW = 440, AH = 320;
  const W = (e.width || 11) * TILE, H = (e.height || 8) * TILE;
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(W / (AW*TILE/40), H / (AH*TILE/40));
  const K = _nKit(0, 0), { S, X, Y, R, RR, dot, ell, poly, ln, text, glow, person } = K;
  const on = e.powered, hr = DayNight.hour(), dark = DayNight.darkness();
  const night = dark > 0.3, day = hr >= 8 && hr < 18;
  const detail = Camera.zoom > 0.35;
  const L = (d, n, o) => on ? (night ? n : d) : o;
  const STONE = L('#e8dfc8', '#9a96a2', '#3a3730'), STONE_L = L('#f6efdc', '#aeaab6', '#44403a'), STONE_D = L('#c8bda2', '#7a7684', '#2c2a24');
  const BRICK = L('#9a4a3a', '#5e3e44', '#2e1c18'), SLATE = L('#4a4e56', '#2e3238', '#1a1a1c');
  const COPPER = L('#5aa894', '#3a6a68', '#1e2a28'), COPPER_L = L('#7cc4ae', '#4e8480', '#243432');
  const IVY = L('#3f7a36', '#25412a', '#16200f');
  const CRIMSON = L('#7a1e2c', '#5a1a24', '#2a1012'), GOLD = L('#e0b020', '#a8841c', '#3a3010');
  const winLit = (i) => on && night && _cmFrac(i + (e.col || 0)*3) > 0.3;
  const WIN = (i) => winLit(i) ? `rgba(255,220,150,${(0.8 + 0.1*Math.sin(t + i)).toFixed(3)})` : L('#3a4a5e', '#1e2632', '#141618');
  const minute = (hr % 1)*60;
  const changeover = day && (minute > 50 || minute < 10);
  const commencement = on && hr >= 12 && hr < 12.35;
  const ivy = (x, y, w, h, seed) => {
    if (!detail) return;
    for (let k = 0; k < Math.floor(w*h/40); k++) {
      const vx = x + _cmFrac(seed + k)*w, vy = y + h - _cmFrac(seed + k + 50)*_cmFrac(seed + k + 90)*h;
      dot(vx, vy, 1.4 + _cmFrac(seed + k + 20), IVY);
    }
  };
  const HEDGE = L('#2f6a2e', '#1d3624', '#121c10'), HEDGE_L = L('#4a8a40', '#2a4a30', '#18241a');
  const hedge = (x, y, w) => {
    R(x + 1.5, y + 1, w, 4, 'rgba(0,0,0,0.22)');
    RR(x, y - 2.5, w, 5, 2.5, HEDGE); R(x + 1.5, y - 2.2, w - 3, 1.2, HEDGE_L);
    if (detail) for (let k = 0; k < w/4 - 1; k++) dot(x + 3 + k*4, y - 1.2 + _cmFrac(k + x)*1.2, 1.1, HEDGE_L);
  };
  const FLOWERS = [L('#e05090', '#7a3a5a', '#2a1a20'), L('#f0c030', '#8a7a3a', '#2a2618'), L('#f4f0e6', '#9a98a4', '#2e2e2c'), L('#d84030', '#6a2a2a', '#2a1614')];
  const bed = (x, y, w, seed) => {
    RR(x, y, w, 4, 1.2, L('#6a4a30', '#3a2e2a', '#1a1612'));
    if (detail) for (let k = 0; k < w/2.6 - 1; k++) dot(x + 1.6 + k*2.6, y + 1.2 + _cmFrac(seed + k)*1.6, 0.95, k % 3 ? IVY : FLOWERS[Math.floor(_cmFrac(seed + k + 40)*4)]);
  };
  const tree = (tx, ty, r) => {
    ell(tx + 3, ty + 4, r, r*0.55, 'rgba(0,0,0,0.25)');
    dot(tx, ty + r*0.15, r, L('#2a5226', '#182a1c', '#0e180c'));
    for (let k = 0; k < 5; k++) { const a = k*1.257 + tx; dot(tx + Math.cos(a)*r*0.42, ty + Math.sin(a)*r*0.38, r*0.55, L('#3a6e32', '#20382a', '#121e10')); }
    dot(tx - r*0.3, ty - r*0.35, r*0.45, L('#5a9446', '#2e4c34', '#18261a'));
    if (detail) dot(tx - r*0.42, ty - r*0.5, r*0.18, L('rgba(255,255,220,0.25)', 'rgba(180,200,220,0.12)', 'rgba(0,0,0,0)'));
  };

  // ── Grounds, wall, paths ──
  R(0, 0, AW, AH, L('#5c8c4a', '#2c3c34', '#1a2418'));
  if (detail) for (let k = 0; k < 22; k++) { R(k*20, 0, 10, AH, 'rgba(255,255,255,0.025)'); R(k*20 + 10, 0, 10, AH, 'rgba(0,40,0,0.025)'); }   // mowing stripes
  for (const [x, y, w, h] of [[0, 316, 440, 4], [0, 0, 4, 320], [436, 0, 4, 320]]) R(x, y, w, h, BRICK);
  // brick piers with stone caps along the boundary wall
  for (let y = 20; y < 316; y += 40) for (const x of [2, 438]) { R(x - 3, y - 3, 6, 6, BRICK); R(x - 3.5, y - 3.5, 7, 1.6, STONE_L); }
  for (let x = 20; x < 440; x += 40) if (x < 196 || x > 244) { R(x - 3, 313, 6, 7, BRICK); R(x - 3.5, 312.5, 7, 1.6, STONE_L); }
  const PATH = L('#d8ccb0', '#7a7480', '#3a3428'), CURB = L('#b4a68a', '#5e5a66', '#2a2620');
  const PATHS = [[220, 316, 220, 134, 14], [110, 222, 330, 136, 8], [110, 136, 330, 222, 8], [6, 134, 434, 134, 10], [60, 226, 380, 226, 7]];
  ctx.lineCap = 'round';
  for (const [col, extra] of [[CURB, 2.4], [PATH, 0]]) {
    ctx.strokeStyle = col;
    for (const [x1, y1, x2, y2, w] of PATHS) { ctx.lineWidth = (w + extra)*S; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); }
    ell(220, 180, 38 + extra/2, 26 + extra/2, col);
  }
  if (detail) for (let y = 142; y < 312; y += 6) if (y < 152 || y > 208) R(213, y, 14, 0.4, 'rgba(0,0,0,0.10)');   // flagstone joints on the main walk
  // low box hedges framing the quad lawns
  for (const y of [141, 215]) { hedge(134, y, 74); hedge(232, y, 74); }

  // Sprinklers on the lawns at dawn
  if (on && hr >= 6 && hr < 7.5) for (const [sx, sy] of [[150, 160], [290, 160], [150, 204], [290, 204]]) {
    const a = t*1.2 + sx;
    for (let d = 0; d < 8; d++) {
      const ph = (t*1.4 + d/8) % 1, ang = a + Math.sin(d)*0.2;
      dot(sx + Math.cos(ang)*ph*18, sy + Math.sin(ang)*ph*10 - Math.sin(ph*Math.PI)*5, 0.8, `rgba(200,235,255,${((1 - ph)*0.7).toFixed(3)})`);
    }
  }

  // ── Science hall with the observatory ──
  {
    const bx = 8, by = 44, bw = 90, bh = 76;
    R(bx + 4, by + 4, bw, bh, 'rgba(0,0,0,0.25)');
    R(bx, by, bw, bh, BRICK); R(bx, by, bw, 5, STONE);
    if (detail) { ctx.fillStyle = 'rgba(0,0,0,0.10)'; for (let r = 0; r < 14; r++) ctx.fillRect(X(bx), Y(by + 8 + r*5), bw*S, 0.4*S); }
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) { RR(bx + 6 + c*14, by + 12 + r*20, 8, 12, 3, WIN(c + r*6 + 10)); R(bx + 6 + c*14, by + 17 + r*20, 8, 0.8, STONE); }
    R(bx, by + 5, bw, 1.4, 'rgba(0,0,0,0.18)');                                   // cornice shadow
    R(bx, by + bh - 4, bw, 4, STONE_D);                                            // stone plinth course
    R(bx + 35, by + bh - 12, 20, 12, STONE);                                       // door surround
    R(bx + 38, by + bh - 11, 14, 11, L('#3a2a20', '#241a14', '#141010'));
    R(bx + 44.6, by + bh - 11, 0.8, 11, 'rgba(0,0,0,0.3)');
    R(bx + 34, by + bh - 13, 22, 1.8, STONE_L);
    R(bx + 36, by + bh, 18, 2.5, STONE); R(bx + 34, by + bh + 2.5, 22, 2.5, STONE_D);   // steps
    if (on && night) glow(bx + 45, by + bh - 14, 8, '255,220,160', 0.4);
    bed(bx + 2, by + bh + 1, 30, 120); bed(bx + 58, by + bh + 1, 30, 160);
    text('SCIENCE', bx + bw/2, by + 2.8, 4.4, L('#5a4a3a', '#d8dce8', 'rgba(60,60,60,0.8)'), 'Georgia, serif');
    ivy(bx, by + 40, 30, 36, 400);
    const ox = bx + 24, oy = by;
    R(ox - 15, oy - 8, 30, 8, STONE_D);
    ctx.fillStyle = L('#dfe3e6', '#9aa0aa', '#3a3c3e'); ctx.beginPath(); ctx.ellipse(X(ox), Y(oy - 8), 15*S, 15*S, 0, Math.PI, 0); ctx.fill();
    const openSlit = on && night, rot = on ? Math.sin(t*0.1)*0.6 : 0;
    ctx.save(); ctx.translate(X(ox), Y(oy - 8)); ctx.rotate(rot);
    ctx.fillStyle = openSlit ? '#0a0e18' : L('#b8bec4', '#80868f', '#333'); ctx.fillRect(-2.5*S, -15*S, 5*S, 15*S);
    if (openSlit) { ctx.fillStyle = '#c8ccd4'; ctx.fillRect(-1*S, -19*S, 2*S, 10*S); }
    ctx.restore();
    if (openSlit) glow(ox, oy - 17, 14, '180,200,255', 0.28);
    // rooftop weather mast
    ln(bx + 72, by, bx + 72, by - 16, L('#8a8e92', '#5a5e66', '#2a2a2a'), 0.7);
    const wr = on ? t*6 : 0;
    for (let c = 0; c < 3; c++) dot(bx + 72 + Math.cos(wr + c*2.09)*3, by - 16 + Math.sin(wr + c*2.09)*1.2, 0.9, L('#dfe3e6', '#9aa0aa', '#3a3c3e'));
  }

  // ── Library with the copper dome ──
  {
    const lx = 106, lw = 130, top = 64, base = 118;
    R(lx + 5, top + 5, lw, base - top + 8, 'rgba(0,0,0,0.25)');
    R(lx, top, lw, base - top, STONE); R(lx, top, lw, 3, STONE_L);
    poly([[lx + 24, top], [lx + lw/2, top - 15], [lx + lw - 24, top]], STONE_L);
    poly([[lx + 30, top - 1], [lx + lw/2, top - 12], [lx + lw - 30, top - 1]], STONE_D);
    R(lx, top + 3, lw, 9, STONE_D);
    text('UNIVERSITY', lx + lw/2, top + 7.8, 6, L('#4a3e2c', '#e0e4f0', 'rgba(60,60,60,0.8)'), 'Georgia, serif');
    for (let c = 0; c < 9; c++) {
      const cx = lx + 8 + c*14.2;
      if (c < 8) RR(cx + 3, top + 17, 8, 26, 3, WIN(c + 30));
      R(cx - 2, top + 13, 4, base - top - 15, STONE_L); R(cx + 1, top + 13, 1, base - top - 15, 'rgba(0,0,0,0.12)'); R(cx - 3, top + 12, 6, 2, STONE_L);
    }
    for (let s = 0; s < 3; s++) R(lx + 34 - s*6, base + s*3, lw - 68 + s*12, 3, s % 2 ? STONE_D : STONE);
    // Dome, built up properly: plinth on the pediment, a colonnaded drum with
    // an even row of windows, a cornice ring the shell sits on, then the
    // copper shell and a small lantern. The shell is no wider than the cornice.
    const dcx = lx + lw/2, drumTop = top - 30, drumBot = top - 13;
    R(dcx - 26, drumBot - 1, 52, 3, STONE_D);                                   // plinth
    R(dcx - 23, drumTop, 46, drumBot - drumTop, STONE);                         // drum
    R(dcx + 11, drumTop, 12, drumBot - drumTop, 'rgba(0,0,0,0.10)');           // shaded side
    const drumLit = on && night;
    for (let w = 0; w < 6; w++) {
      const wx = dcx - 20 + w*7.4;
      RR(wx, drumTop + 4, 4, 9, 2, drumLit ? `rgba(255,220,150,${(0.85 + 0.08*Math.sin(t + w)).toFixed(3)})` : L('#3a4a5e', '#2a3444', '#141618'));
    }
    for (let c = 0; c < 7; c++) R(dcx - 22 + c*7.4, drumTop + 2, 1.6, drumBot - drumTop - 3, STONE_L);   // pilasters
    R(dcx - 26, drumTop - 3, 52, 3, STONE_L);                                   // cornice ring
    R(dcx - 26, drumTop, 52, 0.8, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = COPPER; ctx.beginPath(); ctx.ellipse(X(dcx), Y(drumTop - 3), 24*S, 21*S, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = COPPER_L; ctx.beginPath(); ctx.ellipse(X(dcx - 7), Y(drumTop - 3), 10*S, 18*S, 0, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.20)'; ctx.lineWidth = 0.6*S;
    for (const f of [0.33, 0.66]) { ctx.beginPath(); ctx.ellipse(X(dcx), Y(drumTop - 3), 24*f*S, 21*S, 0, Math.PI, 0); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(X(dcx), Y(drumTop - 3)); ctx.lineTo(X(dcx), Y(drumTop - 24)); ctx.stroke();
    // lantern
    const lanBot = drumTop - 23;
    R(dcx - 4, lanBot - 7, 8, 7, STONE_L);
    R(dcx - 2.5, lanBot - 5.5, 1.6, 4, drumLit ? '#ffe0a0' : L('#3a4a5e', '#2a3444', '#141618'));
    R(dcx + 0.9, lanBot - 5.5, 1.6, 4, drumLit ? '#ffe0a0' : L('#3a4a5e', '#2a3444', '#141618'));
    ctx.fillStyle = COPPER; ctx.beginPath(); ctx.ellipse(X(dcx), Y(lanBot - 7), 5*S, 3.4*S, 0, Math.PI, 0); ctx.fill();
    dot(dcx, lanBot - 11.6, 1.2, GOLD);
    if (on && night) glow(lx + lw/2, top - 34, 50, '255,220,150', 0.12);
    for (const bx of [lx + 4, lx + lw - 10]) {
      const sway = Math.sin(t*1.2 + bx)*0.6;
      poly([[bx, top + 15], [bx + 6, top + 15], [bx + 6 + sway, top + 38], [bx + 3, top + 34], [bx + sway, top + 38]], CRIMSON);
      if (detail) dot(bx + 3, top + 21, 1.6, GOLD);
    }
  }

  // ── Campanile ──
  {
    const cx = 254, base = 122, top = 6;
    R(cx - 10 + 4, top + 4, 20, base - top, 'rgba(0,0,0,0.25)');
    R(cx - 10, top + 12, 20, base - top - 12, BRICK);
    if (detail) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (let r = 0; r < 22; r++) ctx.fillRect(X(cx - 10), Y(top + 16 + r*4.6), 20*S, 0.4*S); }
    R(cx - 11, top + 44, 22, 3, STONE); R(cx - 11, top + 80, 22, 3, STONE);
    R(cx - 11, top + 8, 22, 24, STONE);
    RR(cx - 7, top + 12, 14, 16, 6, L('#1a1410', '#0e0a08', '#0a0a0a'));
    const onHour = on && minute < 1.2, swing = onHour ? Math.sin(t*6)*0.5 : 0;
    ctx.save(); ctx.translate(X(cx), Y(top + 13)); ctx.rotate(swing);
    ctx.fillStyle = L('#d8a840', '#b08830', '#3a3018');
    ctx.beginPath(); ctx.moveTo(-3.5*S, 9*S); ctx.quadraticCurveTo(-3.5*S, 1*S, 0, 1*S); ctx.quadraticCurveTo(3.5*S, 1*S, 3.5*S, 9*S); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (onHour && detail) for (let r = 0; r < 2; r++) { const ph = (t*1.5 + r/2) % 1; ctx.strokeStyle = `rgba(255,240,200,${((1 - ph)*0.5).toFixed(3)})`; ctx.lineWidth = 0.7*S; ctx.beginPath(); ctx.arc(X(cx), Y(top + 20), (8 + ph*18)*S, 0, Math.PI*2); ctx.stroke(); }
    poly([[cx - 12, top + 8], [cx, top - 6], [cx + 12, top + 8]], COPPER);
    const fy = top + 60;
    dot(cx, fy, 8, STONE_L); dot(cx, fy, 7, L('#f8f4e8', '#e8e0c8', '#3a3834'));
    if (on && night) glow(cx, fy, 13, '255,240,200', 0.4);
    ctx.strokeStyle = '#1a1a1a'; ctx.lineCap = 'round';
    const ha = (hr % 12)/12*Math.PI*2 - Math.PI/2, ma = (minute/60)*Math.PI*2 - Math.PI/2;
    ctx.lineWidth = 1.2*S; ctx.beginPath(); ctx.moveTo(X(cx), Y(fy)); ctx.lineTo(X(cx + Math.cos(ha)*3.8), Y(fy + Math.sin(ha)*3.8)); ctx.stroke();
    ctx.lineWidth = 0.7*S; ctx.beginPath(); ctx.moveTo(X(cx), Y(fy)); ctx.lineTo(X(cx + Math.cos(ma)*5.8), Y(fy + Math.sin(ma)*5.8)); ctx.stroke();
    if (detail) for (let k = 0; k < 12; k++) { const a = k/12*Math.PI*2; dot(cx + Math.cos(a)*6, fy + Math.sin(a)*6, 0.35, '#1a1a1a'); }
  }

  // ── Gothic chapel with the rose window ──
  {
    const gx = 276, gy = 50, gw = 70, gh = 72;
    R(gx + 4, gy + 4, gw, gh, 'rgba(0,0,0,0.25)');
    R(gx, gy, gw, gh, STONE);
    poly([[gx - 2, gy], [gx + gw/2, gy - 22], [gx + gw + 2, gy]], SLATE);
    poly([[gx + gw/2, gy - 22], [gx + gw + 2, gy], [gx + gw/2 + 6, gy]], 'rgba(0,0,0,0.18)');
    // spire
    poly([[gx + gw/2 - 5, gy - 20], [gx + gw/2, gy - 46], [gx + gw/2 + 5, gy - 20]], SLATE);
    ln(gx + gw/2, gy - 46, gx + gw/2, gy - 52, GOLD, 0.8); ln(gx + gw/2 - 2.5, gy - 50, gx + gw/2 + 2.5, gy - 50, GOLD, 0.8);
    // rose window
    const rx = gx + gw/2, ry = gy + 20;
    dot(rx, ry, 13, STONE_D);
    const lit = on && night;
    const RC = ['#e0302a', '#3a70d8', '#f0c030', '#40b060', '#d060c0', '#30b0b0'];
    for (let k = 0; k < 12; k++) {
      ctx.fillStyle = lit ? RC[k % 6] : L(['#8a3a44', '#3a5a8a', '#8a7a3a', '#3a6a4a'][k % 4], '#3a3e4c', '#1e1e22');
      ctx.globalAlpha = lit ? 0.85 + 0.15*Math.sin(t + k) : 0.9;
      ctx.beginPath(); ctx.moveTo(X(rx), Y(ry)); ctx.arc(X(rx), Y(ry), 11*S, k*Math.PI/6, (k + 1)*Math.PI/6); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = STONE_L; ctx.lineWidth = 0.8*S;
    for (let k = 0; k < 6; k++) { const a = k*Math.PI/6; ctx.beginPath(); ctx.moveTo(X(rx + Math.cos(a)*11), Y(ry + Math.sin(a)*11)); ctx.lineTo(X(rx - Math.cos(a)*11), Y(ry - Math.sin(a)*11)); ctx.stroke(); }
    dot(rx, ry, 3, STONE_L);
    if (lit) glow(rx, ry, 30, '255,190,150', 0.35);
    // lancet windows and the doors
    for (const wx of [gx + 8, gx + gw - 16]) { RR(wx, gy + 18, 8, 34, 4, WIN(wx)); poly([[wx, gy + 22], [wx + 4, gy + 14], [wx + 8, gy + 22]], WIN(wx)); }
    RR(rx - 8, gy + gh - 22, 16, 22, 8, L('#4a2e20', '#2e1e18', '#141010'));
    for (const bxp of [gx - 3, gx + gw - 1]) { R(bxp, gy + 10, 4, gh - 10, STONE_D); R(bxp - 0.5, gy + 8, 5, 3, STONE_L); }   // corner buttresses
    if (on && night) glow(rx, gy + gh - 10, 10, '255,210,150', 0.35);
    bed(gx + 2, gy + gh + 1, 24, 720); bed(gx + gw - 26, gy + gh + 1, 24, 760);
    ivy(gx + 50, gy + 30, 20, 42, 700);
    text('CHAPEL', rx, gy + gh - 26, 3.8, L('#5a4a3a', '#d8dce8', 'rgba(60,60,60,0.8)'), 'Georgia, serif');
  }

  // ── Dormitories ──
  {
    const dx = 354, dy = 40, dw = 80, dh = 84;
    R(dx + 4, dy + 4, dw, dh, 'rgba(0,0,0,0.25)');
    R(dx, dy, dw, dh, BRICK);
    poly([[dx - 2, dy], [dx + dw/2, dy - 13], [dx + dw + 2, dy]], SLATE);
    if (detail) { ctx.fillStyle = 'rgba(0,0,0,0.10)'; for (let r = 0; r < 16; r++) ctx.fillRect(X(dx), Y(dy + 4 + r*5), dw*S, 0.4*S); }
    for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) { R(dx + 5 + c*10.6, dy + 6 + r*15, 6, 9, WIN(c + r*7 + 70)); R(dx + 5 + c*10.6, dy + 15 + r*15, 6, 1, STONE); }
    for (const cx of [dx + 6, dx + dw - 11]) { R(cx, dy - 9, 5, 9, BRICK); R(cx - 0.6, dy - 10, 6.2, 1.6, STONE_D); }   // chimneys
    R(dx, dy + dh - 3, dw, 3, STONE_D);                                            // plinth course
    RR(dx + dw/2 - 6, dy + dh - 13, 12, 13, 5, L('#4a2e20', '#2e1e18', '#141010'));   // arched entrance
    R(dx + dw/2 - 9, dy + dh - 15, 18, 2.4, CRIMSON);                             // canopy
    if (on && night) glow(dx + dw/2, dy + dh - 8, 9, '255,220,160', 0.4);
    ivy(dx, dy + 30, 26, 54, 900); ivy(dx + dw - 22, dy + 40, 22, 44, 950);
    text('HALL OF RESIDENCE', dx + dw/2, dy - 3, 3.6, L('#f0e8d8', '#c8ccd8', 'rgba(60,60,60,0.8)'), 'Georgia, serif');
    if (on && night && detail) for (let k = 0; k < 3; k++) { const i = Math.floor(_cmFrac(k + Math.floor(t*0.2)) * 35); const r = Math.floor(i/7), c = i % 7; glow(dx + 8 + c*10.6, dy + 10 + r*15, 6, '255,230,160', 0.4); }
  }

  // ── Lecture hall cutaway ──
  {
    const hx = 8, hy = 146, hw = 104, hh = 70;
    R(hx + 4, hy + 4, hw, hh, 'rgba(0,0,0,0.25)');
    R(hx, hy, hw, hh, STONE);
    R(hx, hy, hw, 8, STONE_D);
    text('LECTURE HALL', hx + hw/2, hy + 4.4, 4.4, L('#4a3e2c', '#e0e4f0', 'rgba(60,60,60,0.8)'), 'Georgia, serif');
    R(hx + 5, hy + 11, hw - 10, hh - 16, on ? (night ? '#f4e8cc' : '#efe6d2') : '#16181a');
    if (on) {
      RR(hx + 10, hy + 14, 38, 20, 1, '#2a4a3a');                                                            // chalkboard
      for (let l = 0; l < 3; l++) ln(hx + 14, hy + 19 + l*5, hx + 14 + 12 + ((t*3 + l*9) % 18), hy + 19 + l*5, 'rgba(240,240,230,0.8)', 0.5);
      if (detail) { ctx.strokeStyle = 'rgba(240,240,230,0.8)'; ctx.lineWidth = 0.5*S; ctx.beginPath(); ctx.arc(X(hx + 40), Y(hy + 24), 4*S, 0, Math.PI*2); ctx.stroke(); }
      const pX = hx + 30 + Math.sin(t*0.5)*12;
      person(pX, hy + 40, '#4a3a2c', _N_SKIN[3], 0, 1);
      ln(pX + 1.5, hy + 34, pX + 4 + Math.sin(t*2)*1.5, hy + 30, _N_SKIN[3], 0.6);
      for (let r = 0; r < 3; r++) {                                                                             // tiered seating
        R(hx + 6, hy + 44 + r*7, hw - 12, 4, '#8a6a4a');
        if (day || hr < 21) for (let s = 0; s < 11; s++) if (_cmFrac(r*11 + s + 3) < (day ? 0.8 : 0.3)) dot(hx + 11 + s*8.6 + (r % 2)*3, hy + 42 + r*7, 1.6, _N_SKIN[(r + s) % 6]);
      }
    }
    for (const wx of [hx + hw - 2]) R(wx, hy + 8, 2, hh - 8, STONE_D);
  }

  // ── Student union café ──
  {
    const ux = 336, uy = 146, uw = 98, uh = 50;
    R(ux + 4, uy + 4, uw, uh, 'rgba(0,0,0,0.25)');
    R(ux, uy, uw, uh, L('#f0e8d8', '#9a98a4', '#3a3834'));
    for (let k = 0; k < 11; k++) R(ux + k*8.9, uy + 14, 8.9, 5, k % 2 ? L('#f4f0e6', '#b8b4c4', '#3a3a38') : CRIMSON);
    R(ux, uy, uw, 12, CRIMSON);
    text('STUDENT UNION', ux + uw/2, uy + 6.4, 5, L('#f4f0e6', '#f4f0e6', 'rgba(110,100,100,0.8)'), 'Georgia, serif');
    const FRAME = L('#f4f0e6', '#b8b4c4', '#3a3a38');
    for (let w = 0; w < 5; w++) {
      const wx = ux + 6 + w*19;
      R(wx, uy + 24, 14, 20, on ? (night ? '#ffe2a8' : '#9ab8cc') : '#16181a');
      if (on && !night) poly([[wx + 2, uy + 44], [wx + 7, uy + 24], [wx + 10, uy + 24], [wx + 5, uy + 44]], 'rgba(255,255,255,0.22)');   // glass glint
      R(wx + 6.5, uy + 24, 1, 20, FRAME); R(wx, uy + 32, 14, 1, FRAME);
      R(wx - 1, uy + 44, 16, 1.6, STONE_D);
    }
    // terrace tables and umbrellas
    for (let k = 0; k < 4; k++) {
      const tx = ux + 12 + k*24, ty = uy + uh + 14;
      dot(tx, ty + 3, 3, 'rgba(0,0,0,0.2)');
      R(tx - 0.6, ty - 6, 1.2, 9, '#6a6e72');
      poly([[tx - 9, ty - 4], [tx, ty - 11], [tx + 9, ty - 4]], k % 2 ? CRIMSON : L('#f4f0e6', '#b8b4c4', '#3a3a38'));
      if (on && (day || (hr >= 18 && hr < 23))) for (let s = 0; s < 2; s++) if (_cmFrac(k*2 + s + 60) < 0.75) person(tx - 5 + s*10, ty + 4, _N_SHIRT[(k + s) % 8], _N_SKIN[(k*2 + s) % 6], 0, 0.8);
    }
  }

  // ── Trees ──
  for (const [tx, ty, r] of [[124, 148, 9], [318, 148, 9], [128, 216, 8], [312, 214, 8], [6, 230, 7], [252, 236, 7], [428, 222, 7]]) tree(tx, ty, r);

  // ── Founder's statue in its flower bed ──
  ell(220, 179, 18, 10, L('#4a8a3e', '#24402c', '#141e10'));
  ell(220, 179, 15, 8, L('#6a4a30', '#3a2e2a', '#1a1612'));
  if (detail) for (let k = 0; k < 22; k++) { const a = k/22*Math.PI*2; dot(220 + Math.cos(a)*12.5, 179 + Math.sin(a)*6.4, 1.1, k % 2 ? FLOWERS[(k >> 1) % 4] : IVY); }
  R(214, 172, 12, 10, STONE_D); R(212, 180, 16, 4, STONE); R(214, 172, 12, 1.2, STONE_L);
  ell(220, 166, 3.6, 5.8, L('#5a7a6a', '#3a5a54', '#1e2a28'));
  dot(220, 158.5, 2.5, L('#5a7a6a', '#3a5a54', '#1e2a28'));
  ln(222, 164, 226, 158, L('#5a7a6a', '#3a5a54', '#1e2a28'), 1.4);

  // ── Duck pond and footbridge ──
  {
    const cx = 62, cy = 270, rx = 48, ry = 30;
    ell(cx, cy, rx + 3, ry + 3, L('#8a8a6a', '#4a4a4a', '#222'));
    ell(cx, cy, rx, ry, L('#3a8ab0', '#1a4460', '#12222c'));
    ell(cx - 12, cy - 8, 20, 8, L('rgba(200,235,250,0.3)', 'rgba(120,170,210,0.2)', 'rgba(60,80,90,0.2)'));
    if (detail) { ctx.strokeStyle = L('rgba(220,245,255,0.35)', 'rgba(150,190,220,0.25)', 'rgba(80,100,110,0.2)'); ctx.lineWidth = 0.5*S; for (let r = 0; r < 3; r++) { const ph = (t*0.3 + r/3) % 1; ctx.beginPath(); ctx.ellipse(X(cx + 10), Y(cy + 6), (4 + ph*16)*S, (2 + ph*8)*S, 0, 0, Math.PI*2); ctx.stroke(); } }
    for (const [lx, ly] of [[cx - 30, cy + 8], [cx + 24, cy - 14]]) { ell(lx, ly, 5, 3, L('#40a060', '#2a5a3a', '#1a2a1a')); dot(lx + 1, ly - 1, 1, L('#f0f0f0', '#9aa0aa', '#333')); }   // lily pads
    if (detail) for (const a0 of [2.5, 0.35]) for (let k = 0; k < 6; k++) {                                       // reed clumps at the margins
      const a = a0 + k*0.09, ex = cx + Math.cos(a)*(rx - 1), ey = cy + Math.sin(a)*(ry - 1);
      for (let b = 0; b < 3; b++) ln(ex + b - 1, ey, ex + b - 1 + Math.sin(t*0.8 + k + b)*0.6, ey - 4 - b, L('#5a7a3a', '#2e402a', '#18200f'), 0.5);
      if (k % 3 === 0) ell(ex + 0.4, ey - 5.5, 0.6, 1.4, L('#6a4a2a', '#3a2e2a', '#1a1612'));
    }
    for (let d = 0; d < 3; d++) {
      const a = t*0.15*(d % 2 ? 1 : -1) + d*2.1, dx = cx + Math.cos(a)*(18 + d*6), dy = cy + Math.sin(a)*(10 + d*3);
      ell(dx, dy, 3, 1.8, d === 0 ? L('#6a5a3a', '#4a4040', '#222') : L('#f4f0e6', '#b8b4c4', '#3a3a38'));
      dot(dx + (Math.cos(a) > 0 ? -2.4 : 2.4)*(d % 2 ? -1 : 1), dy - 1.4, 1.1, d === 0 ? L('#2a6a3a', '#1a4a2a', '#222') : L('#f4f0e6', '#b8b4c4', '#3a3a38'));
    }
    // footbridge
    ctx.strokeStyle = L('#9a7a54', '#5e5250', '#2a2218'); ctx.lineWidth = 6*S;
    ctx.beginPath(); ctx.moveTo(X(cx - rx - 2), Y(cy + 4)); ctx.quadraticCurveTo(X(cx), Y(cy - 10), X(cx + rx + 2), Y(cy + 4)); ctx.stroke();
    ctx.strokeStyle = L('#7a5a3a', '#4a4040', '#222'); ctx.lineWidth = 0.8*S;
    ctx.beginPath(); ctx.moveTo(X(cx - rx - 2), Y(cy + 1)); ctx.quadraticCurveTo(X(cx), Y(cy - 13), X(cx + rx + 2), Y(cy + 1)); ctx.stroke();
  }

  // ── Victorian greenhouse ──
  {
    const gx = 124, gy = 246, gw = 78, gh = 50;
    R(gx + 3, gy + 3, gw, gh, 'rgba(0,0,0,0.25)');
    R(gx, gy + 12, gw, gh - 12, L('rgba(200,235,220,0.6)', 'rgba(110,160,150,0.5)', 'rgba(40,50,46,0.7)'));
    ctx.fillStyle = L('rgba(210,240,230,0.7)', 'rgba(120,170,160,0.55)', 'rgba(40,50,46,0.7)');
    ctx.beginPath(); ctx.ellipse(X(gx + gw/2), Y(gy + 12), (gw/2)*S, 14*S, 0, Math.PI, 0); ctx.fill();
    for (const [x, y, r, c] of [[gx + 14, gy + 30, 7, '#2f7a3a'], [gx + 36, gy + 22, 10, '#3f8a3a'], [gx + 58, gy + 32, 7, '#2f6a3a'], [gx + 26, gy + 40, 5, '#5aa048']]) {
      dot(x, y, r, on ? c : '#1a241a');
      if (detail) for (let f = 0; f < 5; f++) { const a = f*1.26; ln(x, y, x + Math.cos(a)*r*1.2, y + Math.sin(a)*r*0.9, on ? '#4a9a48' : '#1a241a', 0.6); }
    }
    if (on) for (const [x, y] of [[gx + 50, gy + 42], [gx + 12, gy + 44], [gx + 66, gy + 22]]) dot(x, y, 1.2, '#e05090');
    ctx.strokeStyle = L('#f4f6f8', '#b0b8c4', '#444'); ctx.lineWidth = 0.6*S;
    ctx.strokeRect(X(gx), Y(gy + 12), gw*S, (gh - 12)*S);
    for (let m = 1; m < 8; m++) ln(gx + m*gw/8, gy + 12, gx + m*gw/8, gy + gh, L('rgba(244,246,248,0.8)', 'rgba(176,184,196,0.6)', '#444'), 0.4);
    ctx.beginPath(); ctx.ellipse(X(gx + gw/2), Y(gy + 12), (gw/2)*S, 14*S, 0, Math.PI, 0); ctx.stroke();
    dot(gx + gw/2, gy - 3, 1.6, GOLD);
    if (on && night) glow(gx + gw/2, gy + 28, 40, '160,255,190', 0.2);
  }

  // ── Gate and shuttle stop ──
  for (const gx of [204, 236]) { R(gx - 3, 290, 6, 26, STONE); R(gx - 4, 288, 8, 3, STONE_L); dot(gx, 287, 2, GOLD); }
  ctx.strokeStyle = L('#2a2a2e', '#1a1a1e', '#141414'); ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.arc(X(220), Y(300), 16*S, Math.PI*1.1, Math.PI*1.9); ctx.stroke();
  text('EST. 1891', 220, 290, 4, L('#2a2a2e', '#c8ccd8', 'rgba(60,60,60,0.8)'), 'Georgia, serif');
  for (let b = 0; b < 5; b++) {
    ctx.strokeStyle = L('#8a8e92', '#5a5e66', '#2e2e30'); ctx.lineWidth = 0.7*S;
    ctx.beginPath(); ctx.arc(X(154 + b*8), Y(308), 3*S, Math.PI, 0); ctx.stroke();
  }
  if (on && (day || hr < 23)) {
    const sc = (t*0.02) % 1;
    const sx = sc < 0.35 ? -60 + (sc/0.35)*290 : sc < 0.55 ? 230 : 230 + ((sc - 0.55)/0.45)*260;
    ctx.save(); ctx.beginPath(); ctx.rect(X(0), Y(0), AW*S, AH*S); ctx.clip();
    RR(sx, 304, 40, 11, 3, CRIMSON); R(sx, 306, 40, 3, night ? 'rgba(255,230,170,0.9)' : 'rgba(40,60,80,0.85)');
    text('CAMPUS SHUTTLE', sx + 20, 312.5, 2.8, '#f4f0e6', 'Arial, sans-serif');
    ctx.restore();
  }

  // ── Football field ──
  {
    const fx = 264, fy = 236, fw = 168, fh = 76;
    R(fx - 3, fy - 3, fw + 6, fh + 6, L('#c85a3a', '#7a4034', '#2a1814'));
    R(fx, fy, fw, fh, L('#4f9a3e', '#2c4a34', '#18241a'));
    for (let s = 0; s < 8; s++) if (s % 2) R(fx + s*fw/8, fy, fw/8, fh, 'rgba(255,255,255,0.05)');
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.6*S;
    ctx.strokeRect(X(fx + 4), Y(fy + 4), (fw - 8)*S, (fh - 8)*S);
    ln(fx + fw/2, fy + 4, fx + fw/2, fy + fh - 4, 'rgba(255,255,255,0.7)', 0.6);
    ctx.beginPath(); ctx.arc(X(fx + fw/2), Y(fy + fh/2), 9*S, 0, Math.PI*2); ctx.stroke();
    for (const gxp of [fx + 4, fx + fw - 4]) { ln(gxp, fy + fh/2 - 8, gxp, fy + fh/2 + 8, '#f4f0e6', 1.2); }
    // bleachers
    R(fx + 20, fy - 14, 120, 10, L('#8a9098', '#5a606a', '#2a2a2a'));
    for (let r = 0; r < 3; r++) R(fx + 20, fy - 14 + r*3.3, 120, 1, 'rgba(0,0,0,0.2)');
    // scoreboard
    R(412, 227, 1.2, 6, '#4a4e52');
    RR(405, 217, 15, 10, 1, L('#1a1c1e', '#121416', '#141414'));
    if (on) { text(`${Math.floor(t/120) % 4}`, 409.5, 222.4, 4.4, '#ffb040'); text(`${Math.floor(t/170) % 3}`, 415.5, 222.4, 4.4, '#ffb040'); R(412.2, 221.5, 0.6, 1.8, '#ffb040'); }
    // evening fixtures under the floodlights
    const floodlit = on && night && hr >= 18 && hr < 22;
    if (floodlit) { R(fx, fy, fw, fh, 'rgba(255,255,220,0.10)'); glow(fx + fw/2, fy + fh/2, 90, '255,255,230', 0.16); }
    if (on && (day || floodlit)) {
      for (let s = 0; s < 18; s++) if (_cmFrac(s + 400) < 0.55) dot(fx + 24 + s*6.4, fy - 11 + (s % 3)*3, 1.2, _N_SHIRT[s % 8]);
      const bx = fx + fw/2 + Math.sin(t*0.7)*50, by = fy + fh/2 + Math.sin(t*1.1)*20;
      for (let p = 0; p < 10; p++) {
        const side = p < 5 ? -1 : 1, hx = fx + fw/2 + side*(20 + (p % 5)*12), hy = fy + 14 + (p % 5)*12;
        const px2 = hx + (bx - hx)*0.25 + Math.sin(t + p)*3, py2 = hy + (by - hy)*0.25;
        person(px2, py2, p < 5 ? CRIMSON : '#f4f0e6', _N_SKIN[p % 6], Math.abs(Math.sin(t*8 + p))*0.3, 0.8);
      }
      ell(bx, by, 1.6, 1.6, '#f4f0e6');
    }
    // floodlight masts at the four corners
    for (const [mx, my] of [[262, 246], [434, 246], [262, 310], [434, 310]]) {
      ln(mx + 1, my, mx + 5, my + 2, 'rgba(0,0,0,0.22)', 1.4);
      R(mx - 0.6, my - 12, 1.2, 12, L('#6a6e72', '#4a4e56', '#2a2a2c'));
      RR(mx - 4, my - 16, 8, 4, 0.8, L('#3a3e42', '#2a2e34', '#1a1a1c'));
      for (let k = 0; k < 3; k++) dot(mx - 2.4 + k*2.4, my - 14, 0.9, floodlit ? '#fffbe8' : L('#c8ccd0', '#6a6e76', '#2a2a2c'));
      if (floodlit) glow(mx, my - 14, 26, '255,250,225', 0.35);
    }
  }

  // ── Students between classes ──
  if (on && (day || hr < 22)) {
    const n = changeover ? 34 : day ? 16 : 6;
    const routes = [[220, 314, 220, 134], [110, 222, 330, 136], [110, 136, 330, 222], [6, 134, 434, 134], [60, 226, 380, 226]];
    for (let s = 0; s < n; s++) {
      const [x1, y1, x2, y2] = routes[s % routes.length];
      const dir = s % 2 ? 1 : -1, u = ((t*(0.01 + _cmFrac(s + 7)*0.008)*dir + _cmFrac(s + 11)) % 1 + 1) % 1;
      const off = (_cmFrac(s + 31) - 0.5)*5;
      const x = x1 + (x2 - x1)*u + off*0.5, y = y1 + (y2 - y1)*u + off*0.3;
      person(x, y, _N_SHIRT[s % 8], _N_SKIN[s % 6], Math.abs(Math.sin(t*7 + s))*0.3, 0.85);
      if (s % 5 === 0) R(x + 1, y - 4, 2.2, 3, CRIMSON);
    }
  }
  // ── Noon commencement: gowns on the quad, caps in the air ──
  if (commencement) {
    const k = (hr - 12)/0.35;
    for (let g = 0; g < 18; g++) {
      const gx = 186 + (g % 9)*8.5, gy = 196 + Math.floor(g/9)*8;
      person(gx, gy, '#1a1a2a', _N_SKIN[g % 6], 0, 0.85);
      const throwPh = ((t*0.5 + _cmFrac(g + 500)) % 1);
      if (k > 0.5) {
        const cy = gy - 6 - Math.sin(throwPh*Math.PI)*22;
        ctx.save(); ctx.translate(X(gx + Math.sin(throwPh*6 + g)*2), Y(cy)); ctx.rotate(throwPh*8 + g);
        ctx.fillStyle = '#1a1a2a'; ctx.fillRect(-2.2*S, -2.2*S, 4.4*S, 4.4*S);
        ctx.restore();
        if (detail) dot(gx + Math.sin(throwPh*6 + g)*2 + 2, cy, 0.5, GOLD);
      } else R(gx - 2, gy - 7.2, 4, 1.2, '#1a1a2a');
    }
  }

  // Lamp posts along the walks, lit after dark
  for (const [lx, ly] of [[180, 134], [260, 134], [70, 134], [380, 134], [220, 222], [150, 226], [300, 226]]) {
    R(lx - 0.5, ly - 10, 1, 10, '#2a2a2e'); R(lx - 1.2, ly - 0.8, 2.4, 1, '#2a2a2e');
    dot(lx, ly - 11, 1.3, on && night ? '#fff0c8' : L('#e8e4d8', '#6a6a70', '#3a3a3a'));
    if (on && night) glow(lx, ly - 8, 20, '255,230,170', 0.35);
  }
  ctx.restore();
}

// ── Transportation Hub (12×8) ────────────────────────────────────────────
// The city's grand central station, authored at 12×8 and scaled to the
// entity's footprint (older 8×6 hubs still draw the whole station).
//
// Four tracks under platform canopies at the back: a high-speed train glides
// in, boards and accelerates away with sparks off the catenary; a commuter
// train works the opposite direction; a long freight train crawls through on
// the outer track; signals change as they pass. The terminal — glass train
// shed behind, twin clock towers, a vast arched window glowing from inside —
// faces a plaza with a departures board, a fountain, a food kiosk and a
// bike-share dock. A taxi rank, a four-bay bus terminal, a metro entrance, a
// multi-storey car park, a tram along the street and, above it, the elevated
// airport express. Crowds swell at the morning and evening rush.
function renderTransportHub(e, px, py, t) {
  const AW = 480, AH = 320;
  const W = (e.width || 12) * TILE, H = (e.height || 8) * TILE;
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(W / (AW*TILE/40), H / (AH*TILE/40));
  const K = _nKit(0, 0), { S, X, Y, R, RR, dot, ell, poly, ln, text, glow, person } = K;
  const on = e.powered, hr = DayNight.hour(), dark = DayNight.darkness();
  const night = dark > 0.3, service = on && (hr >= 5 || hr < 1);
  const rush = service && ((hr >= 7 && hr < 9.5) || (hr >= 16.5 && hr < 19));
  const detail = Camera.zoom > 0.35;
  const L = (d, n, o) => on ? (night ? n : d) : o;
  const STONE = L('#e2d6bc', '#98929e', '#3a3730'), STONE_L = L('#f2e8d2', '#aca6b2', '#44403a'), STONE_D = L('#bdb094', '#76727e', '#2c2a24');
  const clip = () => { ctx.save(); ctx.beginPath(); ctx.rect(X(0), Y(0), AW*S, AH*S); ctx.clip(); };
  ctx.save();

  R(0, 0, AW, AH, L('#cfc6b2', '#6e6c76', '#2c2a26'));                                          // base paving under everything
  // ── Rail yard: four tracks ──
  R(0, 0, AW, 78, L('#6a625a', '#3a3840', '#1e1c1a'));
  const TRACKS = [12, 30, 48, 66];
  for (const ty of TRACKS) {
    if (detail) for (let k = 0; k < 80; k++) R(k*6, ty - 3.5, 2.4, 7, L('#5a4632', '#3a3036', '#1a1a1a'));
    R(0, ty - 2.2, AW, 1, L('#b8bcc0', '#80848e', '#3a3a3a')); R(0, ty + 1.2, AW, 1, L('#b8bcc0', '#80848e', '#3a3a3a'));
  }
  for (const py2 of [18, 54]) { R(0, py2, AW, 7, L('#bdb6a6', '#6e6c76', '#2c2a28')); R(0, py2, AW, 1, L('#f0c830', '#b89a28', '#3a3418')); R(0, py2 + 6, AW, 1, L('#f0c830', '#b89a28', '#3a3418')); }
  if (detail) for (let k = 0; k < 13; k++) R(k*40 + 18, 3, 1, 72, L('rgba(60,60,64,0.5)', 'rgba(40,40,48,0.5)', 'rgba(30,30,30,0.5)'));
  const train = (y, x, len, col, stripe, nose, dir, carLen = 22) => {
    clip();
    R(x + 2, y - 3, len, 9, 'rgba(0,0,0,0.25)');
    RR(x, y - 5, len, 9, 3, col);
    R(x, y - 1, len, 2, stripe);
    for (let c = 1; c < Math.floor(len/carLen); c++) R(x + c*carLen, y - 5, 0.8, 9, 'rgba(0,0,0,0.3)');
    if (carLen === 22) for (let w = 0; w < Math.floor(len/7); w++) R(x + 4 + w*7, y - 4, 4, 2.4, night ? 'rgba(255,230,170,0.9)' : 'rgba(40,60,80,0.85)');
    if (nose) {
      const nx = dir > 0 ? x + len : x;
      poly(dir > 0 ? [[nx, y - 5], [nx + 14, y - 1], [nx + 14, y + 1], [nx, y + 4]] : [[nx, y - 5], [nx - 14, y - 1], [nx - 14, y + 1], [nx, y + 4]], col);
      if (night) glow(nx + dir*14, y, 16, '255,250,220', 0.45);
    }
    ctx.restore();
  };
  const signals = {};
  if (on) {
    const hc = (t*0.017) % 1;
    let hx;
    if (hc < 0.3) { const k = hc/0.3; hx = -260 + (1 - (1 - k)*(1 - k))*380; }
    else if (hc < 0.6) hx = 120;
    else { const k = (hc - 0.6)/0.4; hx = 120 + k*k*520; }
    train(12, hx, 200, '#f4f6f8', '#e0302a', true, 1);
    signals[12] = hc > 0.55 && hc < 0.75;
    if (hc > 0.32 && hc < 0.58) for (let p = 0; p < 10; p++) { const u = ((t*0.12 + p/10) % 1); person(140 + p*18, 26 - u*6, _N_SHIRT[p % 8], _N_SKIN[p % 6], 0, 0.7); }
    if (hc > 0.6 && hc < 0.72 && detail) for (let s = 0; s < 3; s++) { const sx = hx + 60 + s*60 + Math.sin(t*20 + s)*4; if (Math.sin(t*23 + s*3) > 0.6) { dot(sx, 5, 1.4, '#bfe6ff'); glow(sx, 5, 8, '190,230,255', 0.6); } }
    const cc = (t*0.024 + 0.5) % 1;
    let cx2;
    if (cc < 0.3) { const k = cc/0.3; cx2 = 490 - (1 - (1 - k)*(1 - k))*320; }
    else if (cc < 0.55) cx2 = 170;
    else { const k = (cc - 0.55)/0.45; cx2 = 170 - k*k*420; }
    train(48, cx2, 140, '#2d5f8c', '#f0c830', false, -1);
    signals[48] = cc < 0.3;
    // Freight: slow crawl along the outer track
    const fx = -520 + ((t*9) % 1040);
    clip();
    RR(fx + 500, 61, 22, 10, 2, '#e08a20'); R(fx + 512, 62.5, 6, 4, night ? '#ffe2a8' : '#8ab0c8');
    for (let c = 0; c < 20; c++) {
      const col = ['#8a3a2a', '#3a5a7a', '#6a6a6a', '#2a6a4a', '#b0821e'][c % 5];
      RR(fx + c*25, 62, 23, 8, 1, col);
      if (detail) R(fx + c*25 + 2, 63, 19, 1.2, 'rgba(255,255,255,0.15)');
    }
    ctx.restore();
    signals[66] = true;
  }
  // signal heads at the throat
  for (const ty of TRACKS) {
    R(470, ty - 10, 6, 7, '#1a1a1c');
    const green = on && !signals[ty];
    dot(473, ty - 8, 1.2, on && !green ? '#ff3a30' : '#3a1a18');
    dot(473, ty - 5, 1.2, green ? '#40e070' : '#1a3a24');
  }
  for (const cy of [16, 52]) {
    R(40, cy - 1, 400, 11, L('rgba(220,226,232,0.55)', 'rgba(120,130,150,0.5)', 'rgba(40,42,46,0.6)'));
    if (detail) for (let k = 0; k < 20; k++) R(40 + k*20, cy - 1, 0.6, 11, 'rgba(0,0,0,0.12)');
    if (on && night) for (let k = 0; k < 9; k++) glow(60 + k*44, cy + 5, 16, '255,240,200', 0.25);
  }

  // ── Glass train shed behind the terminal ──
  {
    const sx = 84, sw = 312, sy = 78, sh = 26;
    const g = ctx.createLinearGradient(0, Y(sy), 0, Y(sy + sh));
    g.addColorStop(0, L('#bcd6e8', '#3a4a64', '#1a1c20')); g.addColorStop(1, L('#8ab0c8', '#2a3448', '#141618'));
    ctx.fillStyle = g; ctx.fillRect(X(sx), Y(sy), sw*S, sh*S);
    for (let r = 0; r < 26; r++) R(sx + r*12, sy, 1, sh, L('#6a7076', '#4a4e58', '#222'));
    R(sx, sy + sh/2, sw, 0.8, L('#6a7076', '#4a4e58', '#222'));
    if (on && night) glow(sx + sw/2, sy + sh/2, 120, '255,210,140', 0.18);
    if (on && !night) for (let k = 0; k < 5; k++) if (Math.sin(t*0.7 + k*1.3) > 0.9) R(sx + 30 + k*60, sy + 2, 10, sh - 4, 'rgba(255,255,255,0.3)');
  }

  // ── Terminal building with twin clock towers ──
  const tx = 84, tw = 312, ty = 104, th = 86;
  R(tx + 6, ty + 6, tw, th, 'rgba(0,0,0,0.3)');
  R(tx, ty, tw, th, STONE); R(tx, ty, tw, 3, STONE_L); R(tx, ty + th - 6, tw, 6, STONE_D);
  for (const wx0 of [tx + 30, tx + tw - 96]) for (let w = 0; w < 5; w++) {
    const wx = wx0 + w*14;
    RR(wx, ty + 22, 9, 40, 4.5, on ? (night ? '#ffd890' : '#8ab0c8') : '#16181a');
    R(wx + 4, ty + 22, 0.8, 40, STONE_L);
    if (on && night) glow(wx + 4.5, ty + 42, 10, '255,220,150', 0.25);
  }
  const clockAt = (cx, cy, r) => {
    dot(cx, cy, r + 1.2, STONE_L); dot(cx, cy, r, L('#f8f4e8', '#e8e0c8', '#3a3834'));
    if (on && night) glow(cx, cy, r*1.8, '255,240,200', 0.4);
    const ha = (hr % 12)/12*Math.PI*2 - Math.PI/2, ma = ((hr % 1))*Math.PI*2 - Math.PI/2;
    ctx.strokeStyle = '#1a1a1a'; ctx.lineCap = 'round';
    ctx.lineWidth = 1.2*S; ctx.beginPath(); ctx.moveTo(X(cx), Y(cy)); ctx.lineTo(X(cx + Math.cos(ha)*r*0.55), Y(cy + Math.sin(ha)*r*0.55)); ctx.stroke();
    ctx.lineWidth = 0.7*S; ctx.beginPath(); ctx.moveTo(X(cx), Y(cy)); ctx.lineTo(X(cx + Math.cos(ma)*r*0.85), Y(cy + Math.sin(ma)*r*0.85)); ctx.stroke();
  };
  for (const cx of [tx + 12, tx + tw - 12]) {
    R(cx - 12 + 4, 70 + 4, 24, th + 34, 'rgba(0,0,0,0.25)');
    R(cx - 12, 70, 24, ty + th - 70, STONE_L);
    R(cx + 4, 70, 8, ty + th - 70, 'rgba(0,0,0,0.1)');
    poly([[cx - 14, 72], [cx, 56], [cx + 14, 72]], L('#4a5e6e', '#2e3a48', '#1a1c20'));
    dot(cx, 55, 1.4, L('#e0b020', '#a8841c', '#3a3010'));
    clockAt(cx, 86, 7.5);
    for (let w = 0; w < 3; w++) RR(cx - 4, 104 + w*24, 8, 16, 4, on ? (night ? '#ffd890' : '#8ab0c8') : '#16181a');
  }
  const ax = tx + tw/2, ay = ty + th - 6, ar = 62;
  ctx.fillStyle = STONE_L; ctx.beginPath(); ctx.ellipse(X(ax), Y(ay), (ar + 6)*S, (ar + 4)*S, 0, Math.PI, 0); ctx.fill();
  const glass = ctx.createLinearGradient(0, Y(ay - ar), 0, Y(ay));
  glass.addColorStop(0, on ? (night ? '#ffe6a8' : '#bcd6e8') : '#1a1c20');
  glass.addColorStop(1, on ? (night ? '#ffb860' : '#7ea4c0') : '#101214');
  ctx.fillStyle = glass; ctx.beginPath(); ctx.ellipse(X(ax), Y(ay), ar*S, (ar - 2)*S, 0, Math.PI, 0); ctx.fill();
  ctx.strokeStyle = L('#6a7076', '#4a4e58', '#222'); ctx.lineWidth = 1*S;
  for (let k = 1; k < 12; k++) { const a = Math.PI + k*Math.PI/12; ctx.beginPath(); ctx.moveTo(X(ax), Y(ay)); ctx.lineTo(X(ax + Math.cos(a)*ar), Y(ay + Math.sin(a)*(ar - 2))); ctx.stroke(); }
  for (const rr of [0.35, 0.62, 0.85]) { ctx.beginPath(); ctx.ellipse(X(ax), Y(ay), ar*rr*S, (ar - 2)*rr*S, 0, Math.PI, 0); ctx.stroke(); }
  // silhouettes of travellers inside the concourse
  if (service) for (let p = 0; p < (rush ? 14 : 7); p++) { const u = ((t*0.02*(p % 2 ? 1 : -1) + p/7) % 1 + 1) % 1; dot(ax - 44 + u*88, ay - 6 - (p % 3)*2, 1.4, 'rgba(40,30,20,0.45)'); }
  if (on && night) glow(ax, ay - 24, 100, '255,210,130', 0.3);
  for (let d = 0; d < 4; d++) R(ax - 30 + d*16, ay - 15, 12, 15, on ? (night ? 'rgba(255,230,170,0.9)' : 'rgba(40,60,80,0.8)') : '#141414');
  R(tx + 72, ty + 5, tw - 144, 12, L('#1c2a44', '#121c30', '#141618'));
  R(tx + 72, ty + 5, tw - 144, 1, L('#e0b020', '#e0b020', '#3a3010'));
  text('CENTRAL STATION', ax, ty + 11.5, 8, on ? '#ffffff' : 'rgba(110,110,120,0.8)', 'Georgia, serif');
  if (on && night) glow(ax, ty + 11, 70, '255,230,170', 0.14);

  // ── Plaza ──
  R(0, 190, 400, 84, L('#cfc6b2', '#6e6c76', '#2c2a26'));
  if (detail) { ctx.fillStyle = 'rgba(0,0,0,0.07)'; for (let k = 0; k < 20; k++) ctx.fillRect(X(k*20), Y(190), 0.5*S, 84*S); for (let r = 1; r < 9; r++) ctx.fillRect(X(0), Y(190 + r*10), 400*S, 0.5*S); }
  // departures board
  {
    const bx = 196, by = 198, bw = 88, bh = 32;
    R(bx + 14, by + bh, 2, 10, L('#3a3e48', '#2a2e36', '#1a1a1a')); R(bx + bw - 16, by + bh, 2, 10, L('#3a3e48', '#2a2e36', '#1a1a1a'));
    RR(bx, by, bw, bh, 2, '#0e1218');
    text('DEPARTURES', bx + 22, by + 4.4, 3.8, '#f5c451', 'Arial, sans-serif');
    const dests = ['HARBOR', 'AIRPORT', 'NORTHGATE', 'RIVERSIDE', 'OLD TOWN', 'SUMMIT', 'BAYVIEW', 'EASTFIELD', 'LAKESHORE', 'CAPITAL'];
    const flip = Math.floor(t*0.35);
    for (let r = 0; r < 5; r++) {
      const i = (flip + r*2) % dests.length, flipping = on && ((t*0.35) % 1) > 0.9 && r === (flip % 5);
      const hh = Math.floor((hr + r*0.2 + 0.2) % 24), mm = ((r*17 + 5) % 60).toString().padStart(2, '0');
      text(on ? `${String(hh).padStart(2, '0')}:${mm}` : '--:--', bx + 10, by + 10 + r*4.6, 3.2, '#f5c451', 'Courier New, monospace');
      text(on ? (flipping ? '▒▒▒▒▒▒▒' : dests[i]) : '', bx + 44, by + 10 + r*4.6, 3.2, '#f0f5fb', 'Courier New, monospace');
      text(on ? (r === 0 ? 'BOARD' : r === 3 && rush ? 'DELAY' : `P${(r % 4) + 1}`) : '', bx + 76, by + 10 + r*4.6, 3.2, r === 0 ? '#3ddc84' : r === 3 && rush ? '#ff5d5d' : '#9ab0c8', 'Courier New, monospace');
    }
    if (on) glow(bx + bw/2, by + bh/2, 44, '245,196,81', night ? 0.2 : 0.06);
  }
  // fountain
  {
    const fx = 130, fy = 236;
    ell(fx, fy, 22, 12, STONE_D); ell(fx, fy, 19, 10, L('#3a8ab0', '#1a4460', '#12222c'));
    R(fx - 2, fy - 12, 4, 12, STONE_L);
    if (on) for (let d = 0; d < 12; d++) {
      const ph = (t*0.9 + d/12) % 1, a = d/12*Math.PI*2;
      dot(fx + Math.cos(a)*ph*14, fy - 12 + ph*12 - Math.sin(ph*Math.PI)*8, 0.9, `rgba(220,245,255,${((1 - ph)*0.8).toFixed(3)})`);
    }
    if (on && night) glow(fx, fy - 4, 22, '120,200,255', 0.3);
  }
  // food kiosk
  {
    const kx = 330, ky = 222;
    RR(kx - 16, ky, 32, 18, 2, L('#f4f0e6', '#b8b4c4', '#3a3a38'));
    for (let s = 0; s < 6; s++) R(kx - 16 + s*5.33, ky - 5, 5.33, 6, s % 2 ? L('#f4f0e6', '#b8b4c4', '#3a3a38') : L('#2d5f8c', '#1f3a58', '#16202c'));
    text('COFFEE', kx, ky + 8, 4, L('#2d5f8c', '#dfe8f0', 'rgba(70,70,70,0.8)'), 'Arial, sans-serif');
    if (service) for (let q = 0; q < (rush ? 5 : 2); q++) person(kx - 12 + q*6, ky + 28, _N_SHIRT[(q + 3) % 8], _N_SKIN[q % 6], 0, 0.8);
    for (const [ux, uy] of [[kx - 34, ky + 36], [kx + 32, ky + 36]]) { R(ux - 0.5, uy - 8, 1, 8, '#6a6e72'); poly([[ux - 8, uy - 6], [ux, uy - 12], [ux + 8, uy - 6]], L('#e0b020', '#a8841c', '#3a3010')); }
  }
  // bike-share dock
  for (let b = 0; b < 6; b++) {
    const bx = 30 + b*9;
    R(bx - 0.6, 200, 1.2, 6, L('#3ddc84', '#2a9a5a', '#1a3a24'));
    if (on && _cmFrac(b + Math.floor(t*0.05)) < 0.7) { ctx.strokeStyle = '#3ddc84'; ctx.lineWidth = 0.6*S; ctx.beginPath(); ctx.arc(X(bx - 2.5), Y(208), 2*S, 0, Math.PI*2); ctx.arc(X(bx + 2.5), Y(208), 2*S, 0, Math.PI*2); ctx.stroke(); }
  }
  // flower beds
  for (const [fx2, fy2] of [[176, 262], [304, 262]]) {
    RR(fx2 - 14, fy2 - 4, 28, 8, 3, L('#6a4a2a', '#4a3a30', '#2a2018'));
    for (let f = 0; f < 7; f++) dot(fx2 - 11 + f*3.6, fy2 - 1 + (f % 2), 1.3, on ? ['#e8483a', '#f0c030', '#d060c0'][f % 3] : '#2a2a2a');
  }
  // crowds
  if (service) {
    const n = rush ? 40 : 18;
    for (let p = 0; p < n; p++) {
      const inbound = p % 2 === 0, u = ((t*(0.018 + _cmFrac(p + 3)*0.014) + _cmFrac(p + 9)) % 1);
      const sx = 10 + _cmFrac(p + 21)*380, ex = ax - 28 + _cmFrac(p + 33)*56;
      const k = inbound ? u : 1 - u;
      const x = sx + (ex - sx)*k, y = 270 - 84*k + Math.sin(k*Math.PI)*5;
      person(x, y, _N_SHIRT[p % 8], _N_SKIN[p % 6], Math.abs(Math.sin(t*7 + p))*0.3, 0.8);
      if (p % 4 === 0) R(x + 1.5, y - 2, 2.6, 2.4, '#3a3e48');
    }
  }

  // ── Taxi rank ──
  {
    R(6, 80, 70, 106, L('#56585c', '#34363c', '#1c1c1e'));
    for (let k = 0; k < 7; k++) R(40, 86 + k*14, 1, 7, 'rgba(240,240,230,0.5)');
    text('TAXI', 40, 76, 5, L('#f0c020', '#f0c020', '#3a3010'), 'Arial Black, Arial, sans-serif');
    if (on) {
      for (let c = 0; c < (rush ? 6 : 4); c++) { const cy = 176 - c*14; RR(16, cy - 4.5, 13, 9, 2, '#f0c020'); R(18, cy - 2, 9, 4, 'rgba(40,60,80,0.85)'); R(20.5, cy - 5.5, 3, 1.4, '#1a1a1a'); }
      const lc = (t*0.05) % 1;
      if (lc < 0.5) { const k = lc/0.5; RR(52, 178 - k*96, 13, 9, 2, '#f0c020'); R(54, 180 - k*96, 9, 4, 'rgba(40,60,80,0.85)'); }
      if (rush) for (let q = 0; q < 4; q++) person(34 + q*5, 190, _N_SHIRT[q % 8], _N_SKIN[q % 6], 0, 0.75);
    }
  }

  // ── Bus terminal ──
  {
    R(404, 80, 72, 106, L('#56585c', '#34363c', '#1c1c1e'));
    for (let b = 0; b < 5; b++) poly([[404, 86 + b*20], [424, 80 + b*20], [424, 84 + b*20]], L('#f0c830', '#b89a28', '#3a3418'));
    text('BUS', 440, 76, 5, L('#3ddc84', '#3ddc84', '#1a3a24'), 'Arial Black, Arial, sans-serif');
    R(404, 80, 6, 106, L('rgba(220,226,232,0.5)', 'rgba(120,130,150,0.45)', 'rgba(40,42,46,0.5)'));
    if (on) {
      for (let b = 0; b < 4; b++) {
        if (b === 2 && !rush) continue;
        const by = 92 + b*20;
        RR(414, by - 5, 40, 11, 3, b % 2 ? '#2d8a5a' : '#3ddc84');
        R(414, by - 3, 40, 3, night ? 'rgba(255,230,170,0.85)' : 'rgba(40,60,80,0.85)');
        R(434, by - 5, 0.8, 11, 'rgba(0,0,0,0.3)');
        text(['12', '7X', '31', 'N4'][b], 450, by + 3, 3.2, '#f4f0e6', 'Arial, sans-serif');
      }
      const bc = (t*0.028 + 0.3) % 1;
      const bx = bc < 0.5 ? 490 - (bc/0.5)*70 : 420 + ((bc - 0.5)/0.5)*70;
      clip();
      RR(bx, 172, 46, 11, 3, '#2d8a5a'); R(bx, 174, 46, 3, night ? 'rgba(255,230,170,0.85)' : 'rgba(40,60,80,0.85)');
      R(bx + 22, 172, 1, 11, 'rgba(0,0,0,0.3)');
      ctx.restore();
    }
  }

  // ── Metro entrance ──
  RR(10, 222, 36, 24, 2, L('#3a3e48', '#2a2e36', '#1a1a1a'));
  R(13, 230, 30, 16, L('#1a1d22', '#101216', '#0c0c0e'));
  for (let s = 0; s < 5; s++) R(14, 232 + s*2.6, 28, 1, L('#6a6e72', '#4a4e56', '#222'));
  if (service && detail) for (let p = 0; p < 3; p++) { const u = ((t*0.1 + p/3) % 1); dot(20 + p*8, 232 + u*12, 1.3, _N_SKIN[p]); }
  RR(20, 206, 16, 14, 2, L('#e0302a', '#c02a28', '#3a1a18'));
  text('M', 28, 213.5, 9, '#ffffff', 'Arial Black, Arial, sans-serif');
  if (on && night) glow(28, 213, 18, '255,80,70', 0.35);

  // ── Multi-storey car park ──
  {
    const gx = 404, gy = 192, gw = 72, gh = 80;
    R(gx + 4, gy + 4, gw, gh, 'rgba(0,0,0,0.3)');
    R(gx, gy, gw, gh, L('#9a9a94', '#5a5c64', '#2a2a28'));
    for (let l = 0; l < 4; l++) {
      const ly = gy + 4 + l*19;
      R(gx + 3, ly, gw - 6, 13, L('#56585c', '#34363c', '#1c1c1e'));
      R(gx + 3, ly + 13, gw - 6, 3, L('#c8c8c0', '#80828a', '#3a3a38'));
      for (let c = 0; c < 5; c++) if (on && _cmFrac(l*5 + c + 800) < (rush ? 0.9 : 0.6)) _cmCar(X(gx + 11 + c*12.5), Y(ly + 6.5), ['#c04040', '#e8e8e4', '#3060a0', '#404448', '#e0b030'][(l + c) % 5], S*0.6, c % 2);
      if (on && night) glow(gx + gw/2, ly + 6, 34, '255,240,200', 0.18);
    }
    text('P', gx + gw - 8, gy - 4, 8, L('#2d5f8c', '#6cb8ff', '#2a2a2a'), 'Arial Black, Arial, sans-serif');
  }

  // ── Street, tram and the elevated airport express ──
  R(0, 274, AW, 46, L('#4a4c50', '#2a2c32', '#161618'));
  if (detail) { ctx.setLineDash([8*S, 6*S]); ln(0, 306, AW, 306, L('rgba(240,220,120,0.6)', 'rgba(200,180,100,0.45)', 'rgba(60,56,40,0.4)'), 0.8); ctx.setLineDash([]); }
  R(0, 294, AW, 1, L('#b8bcc0', '#80848e', '#3a3a3a')); R(0, 301, AW, 1, L('#b8bcc0', '#80848e', '#3a3a3a'));
  if (on) {
    const u = (t*0.03) % 1, tmx = -130 + u*620;
    clip();
    RR(tmx, 292, 100, 11, 4, '#e0302a');
    for (let w = 0; w < 13; w++) R(tmx + 4 + w*7.4, 294, 4.8, 3.5, night ? 'rgba(255,230,170,0.9)' : 'rgba(40,60,80,0.85)');
    for (const j of [33, 66]) R(tmx + j, 292, 1, 11, 'rgba(0,0,0,0.3)');
    ctx.restore();
    for (let c = 0; c < 4; c++) { const v = ((t*0.05 + c*0.25) % 1); _cmCar(X(500 - v*540), Y(314), ['#e8e8e4', '#3060a0', '#404448', '#c04040'][c], S*0.8, true); }
  }
  // elevated guideway on pylons
  for (let p = 0; p < 7; p++) { const pxl = 20 + p*76; R(pxl - 2, 280, 4, 18, L('#b8bcc0', '#7a7e88', '#333')); }
  R(0, 276, AW, 6, L('#d8dce0', '#8a909a', '#3a3c3e'));
  R(0, 281, AW, 1.2, 'rgba(0,0,0,0.25)');
  if (on) {
    const u = (t*0.06 + 0.3) % 1, mx = 540 - u*640;
    clip();
    RR(mx, 269, 64, 8, 4, '#f4f6f8');
    R(mx + 4, 271, 56, 2.4, night ? 'rgba(255,230,170,0.9)' : 'rgba(40,60,80,0.85)');
    R(mx, 274, 64, 1.2, L('#3b9eff', '#3b9eff', '#2a3440'));
    if (detail) text('AIRPORT EXPRESS', mx + 32, 275.8, 2.4, '#1c2a44', 'Arial, sans-serif');
    ctx.restore();
  }
  if (on && night) for (const lx of [70, 150, 250, 330]) { R(lx - 0.5, 262, 1, 10, '#2a2a2e'); dot(lx, 261, 1.3, '#fff0c8'); glow(lx, 264, 22, '255,230,170', 0.35); }
  ctx.restore();
  ctx.restore();
}

// ── International Airport (28×16) ────────────────────────────────────────
// Authored at 1120×640 units and scaled to the footprint, like the Transport
// Hub. Airside along the top: a full runway with threshold markings, edge and
// centreline lights and approach strobes, a parallel taxiway with blue edge
// lights, and an apron of gates. One airliner flies a continuous loop — it
// takes off east and climbs out, comes back in on approach from the west,
// touches down, rolls out, taxis back along the taxiway and lines up again,
// so it never pops in or out on the ground. Five more sit at jet bridges with
// baggage tugs working them; a freighter waits by the cargo hangar. Around
// the edges: a fuel farm, the fire station, a rotating radar, and the control
// tower with its beacon. Landside: the terminal, a road of drop-offs and
// taxis, and a parking lot that fills through the day. Flights run
// 05:00–24:00; unpowered, it's dark and grounded.
// Top-down airliner, nose along +x, ~100 units long. Shared by the gate/runway
// planes drawn inside the airport sprite and the airborne flights drawn in
// world space (renderAirportFlights). Draws at the current transform.
function _airlinerShape(fill, detailOn, livery, on, detail) {
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.moveTo(8, -5); ctx.lineTo(-14, -48); ctx.lineTo(-24, -48); ctx.lineTo(-12, -5); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(8, 5); ctx.lineTo(-14, 48); ctx.lineTo(-24, 48); ctx.lineTo(-12, 5); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-36, -4); ctx.lineTo(-47, -18); ctx.lineTo(-52, -18); ctx.lineTo(-46, -4); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-36, 4); ctx.lineTo(-47, 18); ctx.lineTo(-52, 18); ctx.lineTo(-46, 4); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.roundRect(-50, -5.5, 98, 11, 5.5); ctx.fill();
  if (!detailOn) return;
  ctx.fillStyle = '#5a6068';                                                       // engines
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.roundRect(-4, s * 22 - 3, 14, 6, 2.5); ctx.fill(); }
  ctx.fillStyle = livery;
  for (const s of [-1, 1]) ctx.fillRect(4, s * 22 - 3, 6, 6);                     // nacelle colour
  ctx.fillRect(-52, -1.6, 16, 3.2);                                              // tail fin from above
  ctx.fillRect(-30, -5.5, 70, 1.3);                                             // cheatline
  ctx.fillStyle = on ? '#2a3a4c' : '#1a1c1e';
  ctx.beginPath(); ctx.roundRect(40, -3.2, 4, 6.4, 1.5); ctx.fill();            // cockpit
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-44, -3.4, 84, 1.2);   // fuselage sheen
}

// One flight (takeoff, climb-out, approach, landing, taxi) takes AIRPORT_FLIGHT_S;
// the airliner then waits lined up on the runway until the cycle turns over,
// so there is a flight every AIRPORT_CYCLE_S, not back to back. Returns the
// position in the flight, 0-1, that the keyframes in renderAirport use.
const AIRPORT_FLIGHT_S = 70, AIRPORT_CYCLE_S = 240;
// Each cycle's flight starts at a hashed offset inside the cycle, and some
// cycles have no flight at all, so the airport never ticks like a metronome.
// The offset never lets a flight spill into the next cycle.
function _airportSlotRand(n, salt) {
  const s = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function _airportFlightPhase(t) {
  const n = Math.floor(t / AIRPORT_CYCLE_S);
  if (_airportSlotRand(n, 1) < 0.25) return 0.999;                        // quiet slot
  const start = _airportSlotRand(n, 2) * (AIRPORT_CYCLE_S - AIRPORT_FLIGHT_S);
  const f = t - n * AIRPORT_CYCLE_S - start;
  return f >= 0 && f < AIRPORT_FLIGHT_S ? f / AIRPORT_FLIGHT_S : 0.999;
}

// The flying airliner's path, in sprite units from the airport's corner.
// Shared by the sprite (ground), renderAirportFlights (air) and AirportAudio.
// Ground keyframes over one flight: [u, x, y, alt, ease]. 'jump' marks the
// part flown in world space, off the sprite.
const _AP_RYC = 86, _AP_TY = 161, _AP_DIST = 2600;
const _AP_KEYS = [
  [0.00, 100, _AP_RYC, 0],
  [0.20, 850, _AP_RYC, 0, 'in'],       // take-off roll; liftoff hands off to renderAirportFlights
  [0.33, -900, _AP_RYC, 1, 'jump'],    // airborne (drawn in world space), then round to the western approach
  [0.47, 190, _AP_RYC, 0, 'jump'],     // final approach is drawn in world space; the sprite picks it up at touchdown
  [0.61, 913, _AP_RYC, 0, 'out'],      // rollout, braking
  [0.66, 913, _AP_TY, 0],              // exit down the connector
  [0.88, 57, _AP_TY, 0],               // taxi back west
  [0.93, 57, _AP_RYC, 0],              // up to the runway
  [0.97, 100, _AP_RYC, 0],             // line up on 09
  [1.00, 100, _AP_RYC, 0],
];
function _airportGroundAt(u) {
  for (let i = 1; i < _AP_KEYS.length; i++) {
    const [u1, x1, y1, a1, ease] = _AP_KEYS[i], [u0, x0, y0, a0] = _AP_KEYS[i - 1];
    if (u > u1) continue;
    if (ease === 'jump') return null;
    let k = (u - u0) / Math.max(1e-6, u1 - u0);
    if (ease === 'in') k = k * k; else if (ease === 'out') k = 1 - (1 - k) * (1 - k);
    return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, alt: a0 + (a1 - a0) * k };
  }
  return null;
}
// In the air: the climb-out east (out, k 0 → 1) or the approach from the
// west (r: how far out it still is, 1 → 0). Null while it is on the ground.
//
// Both legs match the ground roll's SPEED where they meet it, not just its
// position. The take-off roll (an 'in' ease) is at its fastest at liftoff, so
// the climb-out leaves at that speed and keeps accelerating; the rollout (an
// 'out' ease) starts at its fastest, so the approach slows steadily to that
// speed at touchdown. (Both used to start and end at a standstill: the
// airliner raced down the runway, stopped dead in the air at liftoff and
// crept away, and on landing hung over the threshold and then shot off.)
//   x(k) = x0 + v0·k + (D − v0)·k²   from x0 at v0 to x0 + D   (climb-out)
//   x(k) = x1 − D + (2D − v1)·k − (D − v1)·k²   to x1 at v1    (approach)
// with v in sprite units per unit of k. `dx`/`dy` are the path's direction,
// for the heading.
const _AP_V_LIFT = 2 * (850 - 100) / 0.20 * 0.13;   // the roll's speed at liftoff, per k of the climb
const _AP_V_TD   = 2 * (913 - 190) / 0.14 * 0.14;   // the rollout's speed at touchdown, per k of the approach
function _airportAirAt(u) {
  if (u >= 0.20 && u <= 0.33) {
    const k = (u - 0.20) / 0.13, D = _AP_DIST, v = _AP_V_LIFT;
    return { out: true, k, x: 850 + v * k + (D - v) * k * k, y: _AP_RYC - 260 * k * k,
             dx: v + 2 * (D - v) * k, dy: -520 * k };
  }
  if (u > 0.33 && u <= 0.47) {
    const k = (u - 0.33) / 0.14, r = 1 - k, D = _AP_DIST, v = _AP_V_TD;
    // Fast far out, slowing steadily to touchdown speed at the threshold; the
    // ground track curves in from the south-west and straightens on final.
    return { out: false, k, r, x: 190 - D + (2 * D - v) * k - (D - v) * k * k, y: _AP_RYC + 260 * r * r,
             dx: (2 * D - v) - 2 * (D - v) * k, dy: -520 * r };
  }
  return null;
}

function renderAirport(e, px, py, t) {
  const AW = 1120, AH = 640;
  const W = (e.width || 28) * TILE, H = (e.height || 16) * TILE;
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(W / (AW*TILE/40), H / (AH*TILE/40));
  const K = _nKit(0, 0), { S, X, Y, R, RR, dot, ell, poly, ln, text, glow, person } = K;
  const on = e.powered, hr = DayNight.hour(), dark = DayNight.darkness();
  const night = dark > 0.3, flights = on && hr >= 5;
  const detail = Camera.zoom > 0.3;
  const L = (d, n, o) => on ? (night ? n : d) : o;
  ctx.beginPath(); ctx.rect(0, 0, AW*S, AH*S); ctx.clip();

  const GRASS = L('#5f8a4a', '#1c2a1e', '#182018');
  const ASPH  = L('#3a3c42', '#1c1e24', '#141518');
  const CONC  = L('#a4a8ac', '#4a4e56', '#26282c');
  const PAINT = L('rgba(255,255,255,0.9)', 'rgba(230,230,230,0.55)', 'rgba(120,120,120,0.35)');
  const YEL   = L('#f0c830', '#b89a28', '#4a4018');
  R(0, 0, AW, AH, GRASS);

  // ── Runway 09/27 ──
  const RY0 = 54, RY1 = 118, RYC = 86;
  R(24, RY0, 1072, RY1 - RY0, ASPH);
  R(24, RY0 + 3, 1072, 1.6, PAINT); R(24, RY1 - 4.6, 1072, 1.6, PAINT);
  for (const x0 of [40, 1050]) for (let k = 0; k < 8; k++) R(x0, RY0 + 8 + k * 6.3, 30, 3.6, PAINT);   // piano keys
  if (detail) {
    for (let x = 124; x < 1000; x += 34) R(x, RYC - 1.2, 18, 2.4, PAINT);                       // centreline
    for (const x of [150, 200, 900, 950]) { R(x, RY0 + 12, 24, 5, PAINT); R(x, RY1 - 17, 24, 5, PAINT); }   // touchdown zone
    ctx.save(); ctx.fillStyle = PAINT; ctx.font = `bold ${22*S}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.translate(X(96), Y(RYC)); ctx.rotate(Math.PI / 2); ctx.fillText('09', 0, 0);
    ctx.restore();
    ctx.save(); ctx.fillStyle = PAINT; ctx.font = `bold ${22*S}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.translate(X(1022), Y(RYC)); ctx.rotate(-Math.PI / 2); ctx.fillText('27', 0, 0); ctx.restore();
  }

  // ── Taxiway + connectors ──
  const TY = 161;
  R(40, 150, 900, 22, ASPH);
  for (const cx of [57, 540, 913]) R(cx - 14, RY1, 28, 150 - RY1, ASPH);
  if (detail) {
    R(57, TY - 0.8, 856, 1.6, YEL);
    for (const cx of [57, 540, 913]) R(cx - 0.8, RYC, 1.6, TY - RYC, YEL);
    for (const cx of [57, 540, 913]) for (let k = 0; k < 4; k++) R(cx - 12, RY1 + 4 + k * 3, 24, 1, YEL);   // hold-short bars
  }

  // ── Apron + gates ──
  R(150, 172, 830, 180, CONC);
  if (detail) {
    ctx.strokeStyle = on ? 'rgba(0,0,0,0.07)' : 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.6 * S;
    ctx.beginPath(); for (let x = 150; x < 980; x += 40) { ctx.moveTo(X(x), Y(172)); ctx.lineTo(X(x), Y(352)); } ctx.stroke();
  }
  const GATES = [230, 340, 450, 560, 670, 780];
  if (detail) for (const gx of GATES) { R(gx - 0.8, 176, 1.6, 170, YEL); R(gx - 10, 340, 20, 1.6, YEL); }

  // ── Plane (top-down, nose along +x). alt 0–1 lifts it: bigger, with its
  // shadow sliding away down-right. lights: nav lights + strobes.
  const plane = (x, y, head, sc, livery, alt = 0, lights = false) => {
    const drawShape = (fill, detailOn) => _airlinerShape(fill, detailOn, livery, on, detail);
    const k = sc * (1 + 0.45 * alt);
    ctx.save(); ctx.translate(X(x + alt * 46), Y(y + alt * 34)); ctx.rotate(head); ctx.scale(k * S, k * S);
    drawShape(`rgba(0,0,0,${(0.28 - alt * 0.12).toFixed(3)})`, false);
    ctx.restore();
    ctx.save(); ctx.translate(X(x), Y(y)); ctx.rotate(head); ctx.scale(k * S, k * S);
    drawShape(on ? '#f2f4f6' : '#8a8e92', detail);
    if (lights && on) {
      dot(-19, -48, 1.8, '#ff3030'); dot(-19, 48, 1.8, '#30ff60');
      if (Math.sin(t * 9) > 0.85) { dot(-21, -48, 2.4, '#ffffff'); dot(-21, 48, 2.4, '#ffffff'); dot(-52, 0, 2, '#ffffff'); }
      if (night) { glow(-19, -48, 8, '255,48,48', 0.5); glow(-19, 48, 8, '48,255,96', 0.5); }
    }
    ctx.restore();
  };
  const LIVERIES = ['#d0303a', '#2a6ad0', '#f0a020', '#1a8a6a', '#7a3ab0'];

  // ── Terminal (drawn before the gate planes so the jet bridges read on top) ──
  const TT = 352, TB = 440;
  R(176, TT + 6, 780, TB - TT, 'rgba(0,0,0,0.25)');
  R(170, TT, 780, TB - TT, L('#cfd6de', '#5a6272', '#2a2c30'));
  R(480, TT, 180, TB - TT + 30, L('#dfe6ec', '#626a7a', '#2e3034'));                 // central hall
  R(170, TT, 780, 3, L('#eef2f6', '#7a8292', '#34363a'));
  const skyl = on ? (night ? '#ffd8a0' : '#9ec8e6') : '#1e2226';
  R(190, TT + 14, 740, 10, skyl);                                                        // skylight strip
  if (night && on) glow(560, TT + 19, 260, '255,210,150', 0.14);
  if (detail) {
    ctx.strokeStyle = on ? 'rgba(80,90,100,0.35)' : 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.8 * S;
    ctx.beginPath(); for (let x = 190; x < 930; x += 20) { ctx.moveTo(X(x), Y(TT + 14)); ctx.lineTo(X(x), Y(TT + 24)); } ctx.stroke();
    for (let x = 200; x < 930; x += 60) RR(x, TT + 42, 26, 16, 2, L('#b8c0c8', '#4a5260', '#222428'));   // roof plant
  }
  // e.signName: a fixed name for the sign (the intro's old-city airport)
  const cityName = e.signName || (typeof CityInfo !== 'undefined' && CityInfo.getCityName?.()) || 'Gridworks';
  text(`${cityName.toUpperCase()} INTERNATIONAL`, 570, TT + 70, 14, L('#2a4a7a', '#9ad0ff', '#3a3e44'));
  if (night && on) glow(570, TT + 70, 120, '140,200,255', 0.18);
  // curbside canopy
  R(190, TB, 740, 8, L('#e8ecf0', '#707888', '#2c2e32'));
  if (on && night && detail) for (let x = 200; x < 930; x += 30) dot(x, TB + 4, 1.4, '#fff4d0');

  // Gate planes + jet bridges + ground crew
  GATES.forEach((gx, i) => {
    if (i === 3) {                                                                    // open stand: a marshaller waves
      if (on && flights) {
        person(gx, 322, '#f08a20', _N_SKIN[1], 0, 1.4);
        const w = Math.sin(t * 4) * 5;
        ln(gx - 2, 314, gx - 7, 309 + w, '#ff6030', 1.5); ln(gx + 2, 314, gx + 7, 309 - w, '#ff6030', 1.5);
      }
      return;
    }
    plane(gx, 290, Math.PI / 2, 0.95, LIVERIES[i % LIVERIES.length], 0, night);
    // jet bridge: rotunda at the terminal, tunnel angled to the forward door
    ln(gx + 30, TT + 2, gx + 7, 318, L('#9aa2aa', '#4a525c', '#26282c'), 8);
    ln(gx + 30, TT + 2, gx + 7, 318, L('#c0c8d0', '#5a6270', '#2c2e32'), 5);
    dot(gx + 30, TT + 2, 6, L('#8a929a', '#3a424c', '#222428'));
    if (on && detail) {
      // baggage tug + carts shuttling between the hold and the terminal
      const u = (t * 0.05 + i * 0.27) % 1, k = u < 0.5 ? u * 2 : 2 - u * 2;
      const bx = gx - 24, by = 300 + k * 44;
      RR(bx - 3, by - 3, 6, 6, 1, '#f0c030');
      for (let c = 1; c <= 3; c++) RR(bx - 2.6, by - 3 - c * 7 * (u < 0.5 ? 1 : -1), 5.2, 5.6, 0.8, '#6a7078');
      RR(gx + 18, 262, 10, 6, 1, '#e8e8e8'); R(gx + 18, 262, 3, 6, '#2a6ad0');   // catering truck
    }
  });
  // Freighter by the cargo hangar
  plane(890, 255, Math.PI, 1.05, '#8a5a2a', 0, night);

  // ── Cargo hangar ──
  R(986, 196, 110, 138, 'rgba(0,0,0,0.25)');
  RR(980, 188, 110, 138, 4, L('#b0b6bc', '#4a5058', '#26282c'));
  if (detail) {
    ctx.strokeStyle = on ? 'rgba(60,70,80,0.35)' : 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1 * S;
    ctx.beginPath(); for (let y = 196; y < 326; y += 12) { ctx.moveTo(X(980), Y(y)); ctx.lineTo(X(1090), Y(y)); } ctx.stroke();
  }
  R(980, 206, 6, 102, on ? (night ? '#ffe0a0' : '#40464e') : '#1a1c1e');              // open door
  text('CARGO', 1036, 258, 16, L('#2a3a4a', '#8aa0b8', '#3a3e44'));

  // ── Fuel farm (west) ──
  RR(24, 186, 124, 118, 4, L('#8a8e84', '#34383a', '#1e2020'));
  for (const [fx, fy] of [[56, 216], [112, 216], [84, 272]]) {
    ell(fx + 3, fy + 3, 22, 22, 'rgba(0,0,0,0.25)');
    dot(fx, fy, 22, L('#eef0f2', '#8a8e96', '#3a3c40'));
    if (detail) { ctx.strokeStyle = on ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.8 * S; ctx.beginPath(); ctx.arc(X(fx), Y(fy), 14 * S, 0, Math.PI * 2); ctx.stroke(); }
    dot(fx, fy, 3, L('#c8ccd0', '#6a6e76', '#2a2c30'));
  }
  // ── Fire station (ARFF) ──
  RR(24, 318, 124, 70, 3, L('#c8c0b4', '#56524e', '#2a2826'));
  R(24, 318, 124, 12, L('#c0302a', '#6a1a18', '#2a1210'));
  for (let b = 0; b < 3; b++) {
    R(34 + b * 38, 338, 30, 40, on ? (night ? '#ffe0a8' : '#5a6068') : '#1e2022');
    if (b < 2) RR(38 + b * 38, 346, 22, 30, 3, L('#e0302a', '#8a1a18', '#3a1412'));   // crash tenders
  }
  // ── Radar ──
  dot(84, 432, 16, L('#9aa0a6', '#3a3e44', '#1e2022'));
  dot(84, 432, 5, L('#6a7076', '#2a2e34', '#161818'));
  {
    const a = on ? t * 1.6 : 0.6;
    ctx.save(); ctx.translate(X(84), Y(432)); ctx.rotate(a);
    ctx.fillStyle = L('#e8ecf0', '#8a929c', '#3a3c40'); ctx.fillRect(-2 * S, -20 * S, 4 * S, 40 * S);
    ctx.restore();
  }

  // ── Control tower ──
  const TX = 1016, TYc = 408;
  RR(TX - 24, TYc + 12, 48, 34, 3, L('#c8ced4', '#555c66', '#2a2c30'));             // base building
  ell(TX + 6, TYc + 6, 22, 22, 'rgba(0,0,0,0.3)');
  dot(TX, TYc, 21, L('#dfe4e8', '#6a727e', '#303236'));                               // cab roof
  dot(TX, TYc, 17, on ? (night ? '#5ab8d8' : '#2a4a62') : '#16181a');                  // tinted glass ring
  dot(TX, TYc, 11, L('#eef2f4', '#7a828e', '#34363a'));
  if (detail) for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; ln(TX, TYc, TX + Math.cos(a) * 9, TYc + Math.sin(a) * 9, L('#9aa2aa', '#4a525c', '#26282c'), 1); }
  if (on) {                                                                            // rotating beacon: green/white
    const white = Math.floor(t * 1.2) % 2 === 0;
    dot(TX, TYc, 3, white ? '#ffffff' : '#40ff80');
    if (night) glow(TX, TYc, 34, white ? '255,255,255' : '64,255,128', 0.5);
  }

  // ── Landside: terminal road, parking, sign ──
  const RD0 = 468, RD1 = 504;
  R(0, RD0, AW, RD1 - RD0, ASPH);
  if (detail) for (let x = 6; x < AW; x += 26) R(x, (RD0 + RD1) / 2 - 0.7, 13, 1.4, PAINT);
  R(150, 514, 800, 118, L('#4a4c52', '#202228', '#16171a'));
  const busy = !on ? 0.15 : hr < 5 ? 0.3 : hr < 8 ? 0.55 : hr < 20 ? 0.85 : 0.5;
  for (let row = 0; row < 3; row++) {
    const ry = 522 + row * 36;
    for (let s = 0; s < 36; s++) {
      const sx = 160 + s * 21.5;
      if (detail) R(sx, ry, 0.8, 30, PAINT);
      if (_cmFrac(s * 7.3 + row * 31) < busy) {
        const col = ['#d0d4d8', '#2a2c30', '#c02a2a', '#2a5ab0', '#e8e8e8', '#6a6e74', '#1a6a4a'][Math.floor(_cmFrac(s * 3.1 + row) * 7)];
        RR(sx + 4, ry + 4 + (row % 2) * 2, 13, 22, 3, col);
        if (detail) R(sx + 6, ry + 9 + (row % 2) * 2, 9, 5, on ? 'rgba(160,200,230,0.6)' : 'rgba(40,50,60,0.6)');
      }
    }
  }
  if (on && night) for (let x = 190; x < 950; x += 110) glow(x, 574, 40, '255,236,190', 0.22);
  // traffic on the terminal road: westbound drop-offs, eastbound departures
  if (on) {
    const n = hr < 5 ? 2 : 6;
    for (let k = 0; k < n; k++) {
      const dir = k % 2 ? 1 : -1, sp = 0.012 + _cmFrac(k * 5) * 0.006;
      const u = (t * sp + _cmFrac(k * 11)) % 1;
      const cx = dir > 0 ? -30 + u * (AW + 60) : AW + 30 - u * (AW + 60);
      const cy = dir > 0 ? 495 : 477;
      const taxi = k % 3 === 0, bus = k === 4;
      const len = bus ? 44 : 20, col = bus ? '#e8e8e8' : taxi ? '#f0c030' : ['#c02a2a', '#2a5ab0', '#d0d4d8'][k % 3];
      RR(cx - len / 2, cy - 5, len, 10, 3, col);
      if (bus) R(cx - len / 2 + 3, cy - 3.5, len - 6, 2.5, '#2a6ad0');
      if (night) glow(cx + dir * len / 2, cy, 14, '255,244,200', 0.35);
    }
  }
  // gateway sign, bottom-right
  RR(980, 530, 124, 40, 4, L('#1a2a4a', '#0e1626', '#141618'));
  text('✈ ARRIVALS · DEPARTURES', 1042, 550, 9, L('#ffffff', '#9ad0ff', '#4a4e54'), 'Arial, sans-serif');
  // a few trees on the spare grass
  if (detail) for (const [tx, ty] of [[40, 540], [80, 590], [30, 620], [120, 560], [1000, 600], [1060, 620], [1100, 590]]) {
    ell(tx + 3, ty + 4, 12, 5, 'rgba(0,0,0,0.25)'); dot(tx, ty, 11, L('#2f5a2a', '#16241a', '#101a0e')); dot(tx - 3, ty - 3, 6, L('#3f7a36', '#1e3222', '#141c10'));
  }

  // ── Airfield lighting ──
  if (on && detail) {
    for (let x = 30; x <= 1090; x += 40) {
      dot(x, RY0 + 1, 1.3, night ? '#fffbe8' : '#e8e8e0'); dot(x, RY1 - 1, 1.3, night ? '#fffbe8' : '#e8e8e0');
      if (night) { glow(x, RY0 + 1, 7, '255,250,230', 0.35); glow(x, RY1 - 1, 7, '255,250,230', 0.35); }
    }
    for (let x = 60; x < 940; x += 36) {
      dot(x, 151, 1.2, '#4a80ff'); dot(x, 171, 1.2, '#4a80ff');
      if (night) { glow(x, 151, 6, '80,130,255', 0.4); glow(x, 171, 6, '80,130,255', 0.4); }
    }
    if (night) {                                                                        // sequenced approach strobes
      const seq = Math.floor(t * 8) % 5;
      for (let k = 0; k < 5; k++) { const ax = 4 + k * 5; dot(ax, RYC, 1.4, k === 4 - seq ? '#ffffff' : '#6a6a60'); if (k === 4 - seq) glow(ax, RYC, 10, '255,255,255', 0.7); }
      for (const [fx, fy] of [[170, 190], [420, 190], [680, 190], [940, 190]]) glow(fx, fy + 60, 90, '255,236,190', 0.16);   // apron floods
    }
  }

  // ── The flying airliner (path: _AP_KEYS, above) ──
  if (flights) {
    const at = _airportGroundAt;
    const u = _airportFlightPhase(t), p = at(u);
    if (p) {
      // Heading from the direction of travel; hold the last heading when
      // stopped (lined up on the runway it faces east).
      let head = 0;
      for (const d of [0.004, 0.012, 0.03]) {
        const a = at(Math.max(0, u - d)), b = at(Math.min(0.9999, u + d));
        if (a && b && Math.hypot(b.x - a.x, b.y - a.y) > 0.5) { head = Math.atan2(b.y - a.y, b.x - a.x); break; }
      }
      plane(p.x, p.y, head, 1, LIVERIES[Math.floor(t / AIRPORT_CYCLE_S) % LIVERIES.length], p.alt, true);
      if (u > 0.47 && u < 0.51) {                                                     // tyre smoke at touchdown
        const s = (u - 0.47) / 0.04;
        for (let q = 0; q < 3; q++) ell(205 + q * 7 - s * 10, RYC + (q - 1) * 7, 4 + s * 10, 3 + s * 6, `rgba(230,230,230,${(0.6 * (1 - s)).toFixed(3)})`);
      }
      if (night && p.alt < 0.5) {                                                      // landing lights on the ground roll
        ctx.save(); ctx.translate(X(p.x), Y(p.y)); ctx.rotate(head);
        const g = ctx.createRadialGradient(60 * S, 0, 0, 60 * S, 0, 70 * S);
        g.addColorStop(0, 'rgba(255,248,220,0.35)'); g.addColorStop(1, 'rgba(255,248,220,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(48 * S, -6 * S); ctx.lineTo(130 * S, -30 * S); ctx.lineTo(130 * S, 30 * S); ctx.lineTo(48 * S, 6 * S); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
  }

  if (!on) {
    ctx.fillStyle = 'rgba(255,90,70,0.9)'; ctx.font = `bold ${22*S}px Courier New`; ctx.textAlign = 'center';
    ctx.fillText('NO POWER: AIRPORT CLOSED', X(560), Y(236)); ctx.textAlign = 'left';
  }
  ctx.restore();
}

// ── National flag (fictional) ────────────────────────────────────────────
// Deliberately not any real country's: a teal upper field and slate lower
// field split by a gold diagonal edged in maroon, a white eight-point
// compass star in a gold ring at the hoist, and a serrated ivory fly edge.
// Drawn in vertical strips, each shifted by the wave so the whole design
// ripples. (x, y) is the top of the hoist in the caller's authoring units;
// X/Y/S come from the caller's _nKit. `dim` is 0 day, 1 night, 2 unpowered.
function _drawNationFlag(K, x, y, w, h, t, dim, amp = 1.6, detail = true) {
  const { X, Y, S } = K;
  const pal = [
    { teal: '#1f6a74', slate: '#2a3450', gold: '#e0b030', maroon: '#8a2030', ivory: '#f4efe0', star: '#ffffff' },
    { teal: '#123e44', slate: '#181e30', gold: '#8a7020', maroon: '#4a1420', ivory: '#8a887c', star: '#b8b4a8' },
    { teal: '#1a2224', slate: '#16181e', gold: '#3a3018', maroon: '#22141a', ivory: '#34322c', star: '#3a3a36' },
  ][dim];
  const N = detail ? 14 : 6, sw = w / N;
  const design = () => {
    const P = (u, v) => [X(x + u * w), Y(y + v * h)];
    const fill = (pts, c) => { ctx.fillStyle = c; ctx.beginPath(); pts.forEach((q, i) => { const [a, b] = P(q[0], q[1]); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.closePath(); ctx.fill(); };
    // Outline: the fly end is cut into points, so the ivory teeth ARE the
    // end of the flag (nothing is drawn between them).
    const teeth = 5;
    ctx.beginPath();
    { const o = [[0, 0], [0.88, 0]];
      for (let k = 0; k < teeth; k++) o.push([1, (k + 0.5) / teeth], [0.88, (k + 1) / teeth]);
      o.push([0, 1]);
      o.forEach((q, i) => { const [a, b] = P(q[0], q[1]); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); }
    ctx.closePath(); ctx.clip();
    fill([[0, 0], [1, 0], [1, 1], [0, 1]], pal.slate);
    fill([[0, 0], [1, 0], [1, 0.08], [0, 0.92]], pal.teal);                  // upper field above the band
    fill([[0, 0.8], [1, -0.04], [1, 0.2], [0, 1.04]], pal.maroon);           // band edging
    fill([[0, 0.86], [1, 0.02], [1, 0.14], [0, 0.98]], pal.gold);            // gold diagonal
    fill([[0.86, 0], [1, 0], [1, 1], [0.86, 1]], pal.ivory);                // the pointed fly end (clipped to the teeth)
    // emblem: gold ring + eight-point compass star
    const [cx, cy] = P(0.24, 0.34), r = Math.min(w, h) * 0.22 * S;
    ctx.fillStyle = pal.gold; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pal.teal; ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pal.star; ctx.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? r * 0.26 : (k % 4 === 0 ? r * 0.78 : r * 0.5);
      k ? ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
    if (detail) { ctx.fillStyle = pal.maroon; ctx.beginPath(); ctx.arc(cx, cy, r * 0.12, 0, Math.PI * 2); ctx.fill(); }
  };
  for (let i = 0; i < N; i++) {
    const k = i / N, dy = Math.sin(t * 4 - k * 5) * amp * k;
    ctx.save();
    ctx.beginPath(); ctx.rect(X(x + i * sw) - 0.3, Y(y - amp * 2), sw * S + 0.6, (h + amp * 4) * S); ctx.clip();
    ctx.translate(0, dy * S);
    design();
    // cloth shading: folds catch light and fall into shadow along the wave
    const sh = Math.cos(t * 4 - k * 5) * 0.12 * k;
    ctx.fillStyle = sh > 0 ? `rgba(255,255,255,${sh.toFixed(3)})` : `rgba(0,0,0,${(-sh).toFixed(3)})`;
    ctx.fillRect(X(x + i * sw), Y(y), sw * S + 0.6, h * S);
    ctx.restore();
  }
}

// ── Military Base (28×20) ────────────────────────────────────────────────
// Authored at 1120×800 units and scaled to the footprint (a base placed
// before it grew from 22×16 keeps its old footprint and draws the same art
// smaller). An air base: a runway across the north side with a parallel
// taxiway, where a fighter taxis out from the flight line, lights its
// burner, takes off, and later comes back in to land and park. South of it
// the apron with the flight line, hardened shelters, a hangar, the control
// tower and a radome; two helipads, one with a helicopter that spins up,
// lifts off, circles the base and lands; the HQ and a parade ground with a
// squad drilling and another out for a run. Below the cross road: barracks,
// a mess hall, tents, a supply yard and a firing range; the motor pool,
// garage and fuel depot; an air-defence battery whose radar turns and
// launchers track; ammo bunkers and an antenna mast. A convoy comes in at
// the main gate, does a circuit and leaves. Fenced, with razor wire and
// guard towers whose searchlights sweep at night. It never stands down;
// unpowered it goes dark and grounds everything.
const _MB_TAXI_OUT = [[768, 196], [768, 130], [110, 130], [110, 74], [150, 74]];
const _MB_TAXI_IN  = [[1010, 74], [1010, 130], [800, 130], [800, 240], [768, 240], [768, 196]];
const _MB_CONVOY   = [[554, 840], [554, 383], [1099, 383], [1099, 779], [566, 779], [566, 840]];
const _MB_JOG      = [[66, 168], [286, 168], [286, 342], [66, 342], [66, 168]];
function _mbPathLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]); return s; }
function _mbPoint(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i-1][0], dy = pts[i][1] - pts[i-1][1], len = Math.hypot(dx, dy);
    if (d <= len || i === pts.length - 1) { const k = len ? Math.max(0, Math.min(1, d / len)) : 0; return [pts[i-1][0] + dx * k, pts[i-1][1] + dy * k]; }
    d -= len;
  }
  return pts[0];
}
// Position d along the path, with a heading taken across a short span so a
// vehicle swings through a corner instead of snapping round it.
function _mbAlong(pts, d, span = 8) {
  const total = _mbPathLen(pts);
  const a = _mbPoint(pts, Math.max(0, d - span)), b = _mbPoint(pts, Math.min(total, d + span)), p = _mbPoint(pts, d);
  return [p[0], p[1], Math.atan2(b[1] - a[1], b[0] - a[0])];
}

// The two flight schedules, on the animation clock. MilitaryBaseAudio plays
// the fighter's engine and the helicopter's rotor from the same numbers.
const _MB_JET_PERIOD = 84, _MB_HELI_PERIOD = 52, _MB_HPX = 510, _MB_HPY = 204;
// Helicopter: idle on its pad, spin up, lift, one lap of the base, land,
// spin down. Position in authored units; rotor 0.4 idling, 2 at flight rpm.
function _mbHeliState(t) {
  const u = (t / _MB_HELI_PERIOD) % 1;
  let hx = _MB_HPX, hy = _MB_HPY, alt = 0, head = -Math.PI / 2, rotor = 0.4;
  if (u < 0.25) rotor = 0.4;
  else if (u < 0.35) rotor = 0.4 + (u - 0.25) / 0.1 * 1.6;
  else if (u < 0.45) { rotor = 2; alt = (u - 0.35) / 0.1; }
  else if (u < 0.85) {
    rotor = 2; alt = 1;
    const k = (u - 0.45) / 0.4, a = -Math.PI / 2 + k * Math.PI * 2;
    // start on the circle's top near the pad and lap the base once
    hx = 560 + Math.cos(a - 0.1) * 400; hy = 450 + Math.sin(a - 0.1) * 250;
    const ea = Math.min(1, k * 8), eb = Math.min(1, (1 - k) * 8);
    hx = _MB_HPX + (hx - _MB_HPX) * Math.min(ea, eb); hy = _MB_HPY + (hy - _MB_HPY) * Math.min(ea, eb);
    head = a - 0.1 + Math.PI / 2;
  } else if (u < 0.95) { rotor = 2; alt = 1 - (u - 0.85) / 0.1; }
  else rotor = 2 - (u - 0.95) / 0.05 * 1.6;
  return { hx, hy, alt, head, rotor };
}

function renderMilitaryBase(e, px, py, t) {
  const AW = 1120, AH = 800;
  const W = (e.width || 28) * TILE, H = (e.height || 20) * TILE;
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(W / (AW*TILE/40), H / (AH*TILE/40));
  const K = _nKit(0, 0), { S, X, Y, R, RR, dot, ell, poly, ln, text, glow, person } = K;
  const on = e.powered, hr = DayNight.hour(), dark = DayNight.darkness();
  const night = dark > 0.3, day = on && hr >= 7 && hr < 18;
  const detail = Camera.zoom > 0.3;
  const L = (d, n, o) => on ? (night ? n : d) : o;
  // Draw fn in its own frame: origin at (x, y), turned to `rot`, in authored units.
  const at = (x, y, rot, sc, fn) => { ctx.save(); ctx.translate(X(x), Y(y)); ctx.rotate(rot); ctx.scale(sc * S, sc * S); fn(); ctx.restore(); };
  ctx.beginPath(); ctx.rect(0, 0, AW*S, AH*S); ctx.clip();

  const GROUND = L('#6e7a4c', '#222a1c', '#1a1e16');
  const INFIELD = L('#7b8a52', '#262e1e', '#1c2018');
  const ROAD   = L('#4a4c46', '#202220', '#161716');
  const ASPH   = L('#3a3c3b', '#1a1c1c', '#131414');
  const APRON  = L('#8e9086', '#3a3c38', '#222320');
  const PAVE   = L('#b8b2a2', '#54524c', '#2a2926');
  const OLIVE  = L('#5a6a3a', '#2e3622', '#222618');
  const ROOF   = L('#8a8a6a', '#3e4034', '#262720');
  const CONC   = L('#9a9a8e', '#44463f', '#252622');
  const STEEL  = L('#8a8a80', '#3a3a36', '#26261f');
  const WIN    = on ? (night ? '#ffd890' : '#3a4a52') : '#141616';
  const MARK   = L('rgba(255,255,255,0.85)', 'rgba(210,210,210,0.4)', 'rgba(90,90,90,0.4)');
  const TAXI   = L('rgba(240,210,70,0.85)', 'rgba(200,180,90,0.4)', 'rgba(80,70,40,0.4)');
  const SHADOW = 'rgba(0,0,0,0.3)';
  const beacon = (x, y, r, ph = 0) => { if (!on) return; dot(x, y, r, Math.sin(t * 2 + ph) > 0 ? '#ff3020' : '#6a1810'); if (night && Math.sin(t * 2 + ph) > 0) glow(x, y, r * 5, '255,48,32', 0.5); };

  R(0, 0, AW, AH, GROUND);
  if (detail) {                                                                    // scrubby patches
    for (let k = 0; k < 46; k++) ell(_cmFrac(k * 3.7) * AW, 150 + _cmFrac(k * 9.1) * (AH - 150), 10 + _cmFrac(k) * 14, 5 + _cmFrac(k * 2) * 6, L('rgba(90,100,60,0.5)', 'rgba(20,26,16,0.5)', 'rgba(20,22,16,0.5)'));
  }

  // ── Roads: perimeter track, E–W cross road, spine up from the gate ──
  R(14, 14, AW - 28, 14, ROAD); R(14, AH - 28, AW - 28, 14, ROAD); R(14, 14, 14, AH - 28, ROAD); R(AW - 28, 14, 14, AH - 28, ROAD);
  R(28, 372, AW - 56, 22, ROAD);
  R(548, 394, 24, AH - 394, ROAD);
  if (detail) {
    const DASH = L('rgba(240,220,120,0.7)', 'rgba(200,180,90,0.35)', 'rgba(80,70,40,0.4)');
    for (let y = 402; y < AH - 20; y += 22) R(559, y, 2, 11, DASH);
    for (let x = 40; x < AW - 40; x += 22) R(x, 382, 11, 2, DASH);
    // tree line along the south verge of the cross road
    for (let x = 44; x < AW - 40; x += 34) {
      if (x > 530 && x < 590) continue;
      ell(x + 2, 405, 7, 4, 'rgba(0,0,0,0.22)');
      dot(x, 402, 6.5, L('#3e5a2a', '#1a2616', '#141a10')); dot(x - 2, 400, 3.4, L('#5a7a3a', '#26361c', '#1a2212'));
    }
  }

  // ── Airfield: runway 09/27 across the north side, parallel taxiway ──
  R(34, 36, AW - 68, 108, INFIELD);
  R(44, 48, 1032, 52, ASPH);
  R(44, 122, 1032, 16, ROAD);                                                      // taxiway
  for (const cx of [110, 560, 1010]) R(cx - 9, 100, 18, 22, ROAD);                  // connectors
  for (const ax of [768, 800]) R(ax - 9, 138, 18, 10, ROAD);                        // apron throats
  R(44, 48, 1032, 1.6, MARK); R(44, 98.4, 1032, 1.6, MARK);                         // edge lines
  for (let x = 150; x < 980; x += 44) R(x, 73, 24, 2, MARK);                        // centre line
  for (let k = 0; k < 8; k++) { R(52, 53 + k * 5.6, 26, 3, MARK); R(1042, 53 + k * 5.6, 26, 3, MARK); }   // threshold bars
  if (detail) {
    for (const [tx, n] of [[250, 3], [340, 2], [780, 2], [870, 3]]) for (let k = 0; k < n; k++) { R(tx + k * 7, 58, 4, 9, MARK); R(tx + k * 7, 81, 4, 9, MARK); }   // touchdown zone
    at(104, 74, Math.PI / 2, 1, () => { ctx.fillStyle = MARK; ctx.font = 'bold 20px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('09', 0, 0); });
    at(1016, 74, -Math.PI / 2, 1, () => { ctx.fillStyle = MARK; ctx.font = 'bold 20px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('27', 0, 0); });
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    R(44, 129.4, 1032, 1.2, TAXI);
    for (const cx of [110, 560, 1010]) R(cx - 0.6, 100, 1.2, 30, TAXI);
    for (let k = 0; k < 14; k++) ell(180 + _cmFrac(k * 4.1) * 700, 66 + _cmFrac(k * 6.3) * 16, 16 + _cmFrac(k) * 26, 1.2, 'rgba(0,0,0,0.22)');   // tyre rubber
    // windsock in the infield
    ln(64, 116, 64, 106, L('#dcdcdc', '#8a8a8a', '#3a3a3a'), 1.2);
    const wa = 0.3 + Math.sin(t * 0.7) * 0.25;
    for (let k = 0; k < 4; k++) ell(64 + Math.cos(wa) * (k * 4 + 2.5), 106 + Math.sin(wa) * (k * 4 + 2.5), 2.6, 2.2 - k * 0.25, k % 2 ? '#f4f4f0' : '#ff6020');
  }
  if (on && detail) {                                                               // field lighting
    for (let x = 60; x <= 1060; x += 50) for (const y of [46, 102]) { dot(x, y, 1.2, night ? '#fff6d8' : '#c8c8b8'); if (night) glow(x, y, 7, '255,244,210', 0.4); }
    for (let k = 0; k < 6; k++) { dot(42, 52 + k * 9, 1.3, night ? '#50ff70' : '#3a7a44'); dot(1078, 52 + k * 9, 1.3, night ? '#ff4030' : '#7a3a34'); }
    if (night) { glow(42, 74, 22, '80,255,112', 0.3); glow(1078, 74, 22, '255,64,48', 0.3); }
    for (let x = 70; x <= 1060; x += 66) { dot(x, 140, 1, night ? '#5a8cff' : '#4a5a80'); if (night) glow(x, 140, 5, '90,140,255', 0.4); }
  }

  // ── Aircraft ──
  const JET = L('#8f979e', '#4a5058', '#2a2c30'), JETD = L('#6c747c', '#363b42', '#1e2024');
  const CANOPY = on ? (night ? '#6a90b0' : '#24384c') : '#1a1c1e';
  const jetShape = () => {
    ctx.beginPath();
    ctx.moveTo(27, 0); ctx.lineTo(12, -3); ctx.lineTo(4, -3.4); ctx.lineTo(-11, -19); ctx.lineTo(-17, -19); ctx.lineTo(-13, -3.4);
    ctx.lineTo(-20, -3.2); ctx.lineTo(-26, -10); ctx.lineTo(-30, -10); ctx.lineTo(-27, -2.6); ctx.lineTo(-29, -2.2);
    ctx.lineTo(-29, 2.2); ctx.lineTo(-27, 2.6); ctx.lineTo(-30, 10); ctx.lineTo(-26, 10); ctx.lineTo(-20, 3.2);
    ctx.lineTo(-13, 3.4); ctx.lineTo(-17, 19); ctx.lineTo(-11, 19); ctx.lineTo(4, 3.4); ctx.lineTo(12, 3); ctx.closePath();
  };
  // alt 0..1 lifts it off its shadow and grows it; burner 0..1 lights the tail.
  const jet = (x, y, head, alt = 0, burner = 0, lights = false) => {
    const sc = 1 + alt * 0.35;
    at(x + 4 + alt * 34, y + 5 + alt * 28, head, sc, () => { ctx.fillStyle = `rgba(0,0,0,${(0.32 - alt * 0.14).toFixed(3)})`; jetShape(); ctx.fill(); });
    at(x, y, head, sc, () => {
      if (burner > 0) {
        const fl = Math.sin(t * 41) * 1.5;
        ctx.fillStyle = `rgba(255,140,50,${(0.75 * burner).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(-38 - fl, 0, Math.max(0.5, 10 * burner + fl), 2.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,244,210,${(0.9 * burner).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(-33, 0, Math.max(0.5, 5 * burner), 1.6, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = JET; jetShape(); ctx.fill();
      ctx.fillStyle = JETD;
      ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(6, -1.5); ctx.lineTo(-27, -1.5); ctx.lineTo(-27, 1.5); ctx.lineTo(6, 1.5); ctx.closePath(); ctx.fill();   // spine
      ctx.strokeStyle = JETD; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-15, -4.4); ctx.lineTo(-25, -6.6); ctx.moveTo(-15, 4.4); ctx.lineTo(-25, 6.6); ctx.stroke();   // twin fins
      ctx.fillStyle = CANOPY; ctx.beginPath(); ctx.ellipse(11, 0, 6, 2.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.ellipse(12.5, -0.6, 2.6, 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#242424'; ctx.fillRect(-30.5, -2, 2.5, 4);                    // nozzle
      if (lights && on) {
        ctx.fillStyle = '#ff4030'; ctx.fillRect(-15, -19.6, 2, 1.4); ctx.fillStyle = '#40ff60'; ctx.fillRect(-15, 18.2, 2, 1.4);
        if (Math.sin(t * 9) > 0.6) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-22, 0, 1.3, 0, Math.PI * 2); ctx.fill(); }
      }
    });
    if (burner > 0 && night) glow(x - Math.cos(head) * 36 * sc, y - Math.sin(head) * 36 * sc, 34, '255,150,70', 0.5 * burner);
  };

  // ── Apron (NE): flight line, hardened shelters, hangar, tower, radome ──
  R(596, 146, 488, 216, APRON);
  if (detail) {
    for (let y = 164; y < 362; y += 36) R(596, y, 488, 0.8, 'rgba(0,0,0,0.08)');     // slab joints
    for (let x = 632; x < 1084; x += 40) R(x, 146, 0.8, 216, 'rgba(0,0,0,0.08)');
    for (const sx of [640, 704, 768, 832]) {                                        // parking stands
      ln(sx, 146, sx, 226, TAXI, 1.2);
      ctx.strokeStyle = TAXI; ctx.lineWidth = 1 * S; ctx.strokeRect(X(sx - 26), Y(166), 52 * S, 62 * S);
    }
    ln(800, 146, 800, 240, TAXI, 1.2); ln(768, 240, 800, 240, TAXI, 1.2);
    ln(612, 248, 1076, 248, TAXI, 1.2);
    for (let x = 612; x < 1076; x += 10) R(x, 251, 5, 1.6, TAXI);
  }
  // hardened aircraft shelters, doors to the north, a nose showing in each
  for (let s = 0; s < 3; s++) {
    const sx = 612 + s * 80, sy = 268;
    jet(sx + 34, sy + 4, -Math.PI / 2);
    R(sx + 5, sy + 6, 68, 88, SHADOW);
    RR(sx, sy, 68, 88, 22, CONC);
    RR(sx + 6, sy + 4, 56, 80, 18, L('#a8a89c', '#4c4e46', '#292a26'));
    if (detail) for (let k = 1; k < 6; k++) R(sx + 8, sy + k * 14, 52, 1.2, 'rgba(0,0,0,0.12)');
    R(sx + 12, sy, 44, 7, on ? (night ? '#ffe0a0' : '#262826') : '#141514');          // open door
    if (on && night) glow(sx + 34, sy - 4, 34, '255,224,160', 0.3);
    if (detail) text(String(s + 1), sx + 34, sy + 50, 16, L('rgba(60,60,54,0.5)', 'rgba(150,150,140,0.3)', 'rgba(60,60,56,0.4)'));
  }
  // maintenance hangar: barrel roof, doors open to the north with a jet inside
  jet(988, 254, -Math.PI / 2);
  R(906, 258, 176, 100, SHADOW);
  R(900, 252, 176, 100, L('#a4a896', '#484a42', '#272824'));
  for (let k = 0; k < 8; k++) R(900 + k * 22, 252, 11, 100, k % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)');   // roof ribs
  R(900, 298, 176, 6, 'rgba(255,255,255,0.12)');                                    // ridge highlight
  R(940, 252, 96, 9, on ? (night ? '#ffd890' : '#2a2c2a') : '#141514');             // door opening
  if (on && night) glow(988, 250, 60, '255,216,144', 0.3);
  if (detail) text('HANGAR 1', 988, 322, 11, L('rgba(50,54,44,0.6)', 'rgba(170,176,150,0.4)', 'rgba(70,70,64,0.4)'));
  // control tower
  R(858, 292, 34, 56, SHADOW);
  R(852, 300, 28, 46, L('#c8c0a8', '#5a584e', '#2c2b27'));
  R(852, 300, 3, 46, 'rgba(255,255,255,0.08)');
  R(844, 280, 44, 22, L('#3a4a52', '#1a2430', '#101418'));
  if (on) R(846, 283, 40, 15, night ? 'rgba(120,255,160,0.55)' : 'rgba(160,200,220,0.6)');
  R(842, 276, 48, 5, ROOF);
  if (on) { const rb = t * 2; ln(866, 276, 866 + Math.cos(rb) * 13, 276 + Math.sin(rb) * 4, L('#2a2c28', '#aaaaa0', '#141412'), 1.8); }   // turning radar bar
  if (on && night) glow(866, 290, 30, '120,255,160', 0.3);
  beacon(866, 273, 1.6, 2);
  // radome
  dot(1050, 204, 26, 'rgba(0,0,0,0.25)');
  dot(1044, 198, 26, L('#f0f0ea', '#8a8a86', '#3a3a38'));
  dot(1036, 190, 10, L('rgba(255,255,255,0.5)', 'rgba(255,255,255,0.1)', 'rgba(0,0,0,0)'));
  if (detail) { ctx.strokeStyle = on ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.8 * S; for (const r of [10, 19]) { ctx.beginPath(); ctx.arc(X(1044), Y(198), r * S, 0, Math.PI * 2); ctx.stroke(); } }
  // flight line: three jets parked nose-out (the fourth stand is the duty jet's)
  for (const sx of [640, 704, 832]) jet(sx, 196, -Math.PI / 2);
  if (on && detail && day) {                                                        // ground crew + fuel bowser
    for (let k = 0; k < 4; k++) person(656 + k * 62 + Math.sin(t * 0.4 + k * 2) * 6, 232 + (k % 2) * 4, k % 2 ? '#d8c020' : OLIVE, _N_SKIN[k % 6], Math.abs(Math.sin(t * 5 + k)) * 0.5, 1.4);
    const bx = 760 + Math.sin(t * 0.12) * 130;
    RR(bx - 14, 257, 28, 10, 2, L('#d8d0b0', '#6a665a', '#34322c')); R(bx + 8, 257, 6, 10, L('#4a5236', '#262a1c', '#1a1c14'));
  }
  if (on && night) for (const fx of [620, 760, 900, 1040]) glow(fx, 230, 90, '255,236,190', 0.1);   // apron floodlights

  // ── Helicopter apron (between the HQ and the flight line) ──
  R(436, 150, 148, 212, APRON);
  const HPX = _MB_HPX, HPY = _MB_HPY;
  for (const [hx0, hy0] of [[HPX, HPY], [510, 306]]) {
    dot(hx0, hy0, 42, L('#5a5c56', '#2a2c28', '#1a1b18'));
    ctx.strokeStyle = L('#f0e8c8', '#9a947c', '#3a3a32'); ctx.lineWidth = 2.5 * S;
    ctx.beginPath(); ctx.arc(X(hx0), Y(hy0), 34 * S, 0, Math.PI * 2); ctx.stroke();
    text('H', hx0, hy0 + 1, 30, L('#f0e8c8', '#9a947c', '#3a3a32'));
    if (on && detail) for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; dot(hx0 + Math.cos(a) * 40, hy0 + Math.sin(a) * 40, 1.5, night ? '#60ff80' : '#4a8a50'); if (night) glow(hx0 + Math.cos(a) * 40, hy0 + Math.sin(a) * 40, 6, '96,255,128', 0.35); }
  }
  // a twin-rotor transport tied down on the second pad
  at(510 + 4, 306 + 5, 0.2, 1, () => { ctx.fillStyle = SHADOW; ctx.beginPath(); ctx.roundRect(-30, -8, 60, 16, 7); ctx.fill(); });
  at(510, 306, 0.2, 1, () => {
    ctx.fillStyle = L('#4e5a34', '#2a321e', '#1e2218'); ctx.beginPath(); ctx.roundRect(-30, -8, 60, 16, 7); ctx.fill();
    ctx.fillStyle = L('#5e6a40', '#323a24', '#22261a'); ctx.beginPath(); ctx.roundRect(-26, -5, 52, 5, 2); ctx.fill();
    ctx.fillStyle = CANOPY; ctx.beginPath(); ctx.roundRect(20, -6, 8, 12, 3); ctx.fill();
    ctx.strokeStyle = L('#2a2c28', '#1a1c18', '#141412'); ctx.lineWidth = 1.6;
    for (const [rx, ra] of [[-22, 0.5], [22, 1.3]]) for (let b = 0; b < 3; b++) { const a = ra + b * Math.PI * 2 / 3; ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx + Math.cos(a) * 24, Math.sin(a) * 24); ctx.stroke(); }
    ctx.fillStyle = '#1a1c18'; for (const rx of [-22, 22]) { ctx.beginPath(); ctx.arc(rx, 0, 2.4, 0, Math.PI * 2); ctx.fill(); }
  });

  // ── Parade ground + flag (NW) ──
  R(56, 158, 240, 194, PAVE);
  ctx.strokeStyle = MARK; ctx.lineWidth = 2 * S;
  ctx.strokeRect(X(78), Y(180), 196 * S, 150 * S);
  if (detail) { ctx.beginPath(); ctx.arc(X(176), Y(255), 26 * S, 0, Math.PI * 2); ctx.stroke(); }
  dot(176, 172, 4, L('#8a8a8a', '#3a3a3a', '#2a2a2a'));
  ln(176, 172, 176, 122, L('#dcdcdc', '#8a8a8a', '#3a3a3a'), 2);
  _drawNationFlag(K, 177, 124, 42, 26, t, on ? (night ? 1 : 0) : 2, 2.2, detail);
  if (on && day) {
    // squad drilling: 4 ranks of 6 marching up and down the square in step
    const march = Math.sin(t * 0.35) * 34;
    const step = Math.abs(Math.sin(t * 5)) * 1.2;
    for (let rk = 0; rk < 4; rk++) for (let f = 0; f < 6; f++) person(128 + f * 20, 232 + rk * 18 + march, OLIVE, _N_SKIN[(rk * 6 + f) % 6], step, 1.6);
    person(108, 222 + march, '#3a4a2a', _N_SKIN[1], 0, 1.8);                         // drill sergeant
    // a second squad out for a run round the edge of the square
    if (detail) {
      const total = _mbPathLen(_MB_JOG);
      for (let k = 0; k < 10; k++) {
        const [jx, jy, jh] = _mbAlong(_MB_JOG, ((t * 16 - Math.floor(k / 2) * 9) % total + total) % total, 4);
        const side = (k % 2 ? 1 : -1) * 2.6;
        person(jx - Math.sin(jh) * side, jy + Math.cos(jh) * side, '#d8d8d0', _N_SKIN[k % 6], Math.abs(Math.sin(t * 9 + k)) * 0.9, 1.3);
      }
    }
  }

  // ── HQ (between the square and the helicopter apron) ──
  // Seen front-on from slightly above: a roof slab with plant, a dish and
  // masts, then the south face with its entrance portico.
  const HQW = L('#c8c0a8', '#5a584e', '#2c2b27'), HQD = L('#a8a08a', '#48463e', '#242320');
  R(318, 158, 108, 190, SHADOW);
  R(312, 150, 108, 52, ROOF);                                                      // roof slab
  R(312, 200, 108, 4, HQD);                                                        // parapet
  if (detail) {
    for (const [ax, ay] of [[320, 156], [336, 156], [320, 172], [336, 172]]) { R(ax, ay, 12, 10, CONC); dot(ax + 6, ay + 5, 3.5, L('#6a6a60', '#2e2e2a', '#1a1a18')); }   // AC plant
    dot(396, 172, 11, L('#e8e8e0', '#7a7a72', '#34342e')); dot(396, 172, 7.5, L('#cfcfc6', '#5a5a54', '#2a2a26'));   // satellite dish
    ln(396, 172, 404, 164, L('#8a8a80', '#44443e', '#262622'), 1.2);
    ln(368, 196, 368, 156, L('#aaaaa0', '#4a4a44', '#2a2a26'), 1);                 // whip antenna
    if (on) dot(368, 156, 1.6, Math.sin(t * 3) > 0 ? '#ff3020' : '#6a1810');
    text('HQ', 366, 186, 10, L('#2a3a1a', '#c8d890', '#3a3a30'));
  }
  R(312, 204, 108, 118, HQW);                                                      // front face
  R(312, 204, 3, 118, 'rgba(255,255,255,0.08)'); R(417, 204, 3, 118, 'rgba(0,0,0,0.12)');
  R(312, 262, 108, 2, HQD);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
    if (r === 3 && (c === 2 || c === 3)) continue;                                   // the doorway
    const lit = on && night && ((r * 6 + c) * 5 % 7) !== 2;
    R(319 + c * 16.6, 210 + r * 22, 11, 13, HQD);
    R(320 + c * 16.6, 211 + r * 22, 9, 11, lit ? '#ffd890' : WIN);
  }
  // entrance portico, star emblem, doors, steps
  R(338, 276, 56, 6, L('#dcd6c2', '#6a685e', '#34332e'));
  text('★', 366, 270, 9, L('#4a5a2a', '#c8d890', '#3a3a30'), 'Arial, sans-serif');
  for (const cx of [342, 354, 378, 390]) R(cx - 1.5, 282, 3, 40, L('#e8e2d0', '#6e6c62', '#34332e'));
  R(357, 296, 18, 26, L('#4a4030', '#2a2418', '#1a1812'));
  if (on && night) glow(366, 304, 26, '255,220,150', 0.4);
  R(334, 322, 64, 4, L('#dcd6c2', '#6a685e', '#34332e')); R(330, 326, 72, 4, L('#cfc9b6', '#5e5c54', '#2e2d29'));
  // staff cars parked out front
  if (detail) for (let k = 0; k < 4; k++) { RR(318 + k * 26, 338, 18, 10, 2, k === 3 ? L('#2c3a4a', '#141a22', '#0c0e12') : L('#1e2418', '#101410', '#0c0e0a')); R(322 + k * 26, 339.5, 6, 7, L('#3a4a52', '#1a2430', '#101418')); }

  // ── Barracks (SW) ──
  for (let b = 0; b < 4; b++) {
    const by = 414 + b * 56;
    R(62, by + 6, 270, 40, SHADOW);
    // pitched roof: far slope, ridge, near slope, roof vents
    R(56, by, 270, 7, L('#6e6e54', '#30322a', '#1e1f1a'));
    R(56, by + 7, 270, 9, ROOF);
    R(56, by + 6.4, 270, 1.2, L('#a0a080', '#4a4c40', '#2a2a24'));
    if (detail) for (let v = 0; v < 6; v++) R(76 + v * 44, by + 1.5, 6, 4, CONC);
    // front face with doors, windows and wall AC units
    R(56, by + 16, 270, 24, L('#b8b09a', '#4e4c44', '#282722'));
    R(56, by + 38, 270, 3, L('#8a8474', '#3a3832', '#20201c'));
    if (detail) for (let w = 0; w < 13; w++) {
      const bx = 63 + w * 20.4;
      if (w % 4 === 2) {
        R(bx, by + 22, 11, 18, L('#5a4a32', '#2a2218', '#1a1610'));
        R(bx - 2, by + 20, 15, 2, L('#8a8a70', '#3a3a30', '#22221c'));
        if (on && night) glow(bx + 5.5, by + 20, 10, '255,220,150', 0.4);
      } else {
        const lit = on && night && ((w + b * 3) * 7 % 5) !== 1;
        R(bx, by + 22, 11, 9, lit ? '#ffd890' : WIN);
        R(bx + 1, by + 33, 9, 4, CONC);
      }
    }
    if (on && night) glow(190, by + 28, 100, '255,216,140', 0.08);
    R(56, by + 42, 270, 6, PAVE);                                                   // walkway
  }
  // soldiers walking between the blocks
  if (on && detail) for (let p = 0; p < 7; p++) {
    if (night && p > 2) continue;
    const u = (t * (0.015 + _cmFrac(p) * 0.01) + _cmFrac(p * 7)) % 1;
    person(60 + (p % 2 ? u : 1 - u) * 262, 414 + (p % 4) * 56 + 47, OLIVE, _N_SKIN[p % 6], Math.abs(Math.sin(t * 6 + p)) * 0.6, 1.4);
  }

  // ── Mess hall, tents, supply yard, water tower (between barracks and spine) ──
  R(350, 420, 186, 66, SHADOW);
  R(344, 414, 186, 10, L('#6e6e54', '#30322a', '#1e1f1a')); R(344, 424, 186, 14, ROOF);
  R(344, 423.4, 186, 1.2, L('#a0a080', '#4a4c40', '#2a2a24'));
  R(344, 438, 186, 40, L('#c0b8a0', '#525048', '#2a2924'));
  R(344, 476, 186, 3, L('#8a8474', '#3a3832', '#20201c'));
  for (let w = 0; w < 7; w++) {
    if (w === 3) { R(426, 452, 22, 26, L('#5a4a32', '#2a2218', '#1a1610')); continue; }
    R(352 + w * 25.5, 446, 17, 15, on && night ? '#ffd890' : WIN);
  }
  if (on && night) glow(437, 462, 90, '255,216,140', 0.12);
  if (detail) text('MESS', 437, 430, 8, L('#2a3a1a', '#c8d890', '#3a3a30'));
  R(500, 416, 9, 9, L('#6a6a60', '#2e2e2a', '#1c1c1a'));                              // kitchen flue
  if (on) for (let q = 0; q < 4; q++) {
    const ph = (t * 0.2 + q / 4) % 1;
    ell(504 + Math.sin(t + q) * 2 + ph * 6, 418 - ph * 28, 3 + ph * 5, 2 + ph * 3, `rgba(${night ? '90,90,96' : '220,220,214'},${((1 - ph) * 0.4).toFixed(3)})`);
  }
  for (let k = 0; k < 3; k++) {                                                     // field tents
    const tx = 346 + k * 62, ty = 500;
    R(tx + 4, ty + 5, 52, 40, SHADOW);
    poly([[tx, ty + 10], [tx + 26, ty], [tx + 52, ty + 10], [tx + 52, ty + 40], [tx, ty + 40]], L('#6a7446', '#343a24', '#20221a'));
    poly([[tx, ty + 10], [tx + 26, ty], [tx + 26, ty + 40], [tx, ty + 40]], L('rgba(255,255,255,0.07)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)'));
    ln(tx + 26, ty, tx + 26, ty + 40, L('#4a5232', '#262a1c', '#16180f'), 1);
    R(tx + 20, ty + 30, 12, 10, on && night ? '#ffcf80' : L('#3a4028', '#1c1e14', '#141410'));
  }
  // supply yard: shipping containers and crate stacks on hardstanding
  R(344, 560, 130, 78, L('#8a8a80', '#3a3a36', '#222220'));
  {
    const CONT = [L('#5a6a3a', '#2e3622', '#222618'), L('#8a7a52', '#40382a', '#24201a'), L('#4a5a6a', '#242c34', '#181c20'), L('#7a4a3a', '#3a2620', '#221814')];
    for (let k = 0; k < 6; k++) {
      const cx = 350 + (k % 3) * 42, cy = 566 + Math.floor(k / 3) * 20;
      R(cx + 2, cy + 2, 38, 15, SHADOW); R(cx, cy, 38, 15, CONT[(k * 3 + 1) % 4]);
      if (detail) for (let r = 1; r < 6; r++) R(cx + r * 6.3, cy + 1, 0.8, 13, 'rgba(0,0,0,0.18)');
    }
    if (detail) for (let k = 0; k < 9; k++) { const cx = 352 + (k % 5) * 14 + _cmFrac(k) * 3, cy = 612 + Math.floor(k / 5) * 12; R(cx + 1, cy + 1, 10, 9, SHADOW); R(cx, cy, 10, 9, L('#b89a62', '#544830', '#2c261a')); R(cx, cy + 4, 10, 0.8, 'rgba(0,0,0,0.25)'); }
    if (on && day && detail) {                                                      // forklift working the yard
      const fx = 432 + Math.sin(t * 0.25) * 26;
      RR(fx - 6, 616, 12, 9, 2, '#e0a020'); R(fx + (Math.cos(t * 0.25) > 0 ? 6 : -9), 618, 3, 5, '#3a3a3a');
    }
  }
  // water tower
  dot(506, 608, 24, 'rgba(0,0,0,0.25)');
  for (const [lx, ly] of [[492, 618], [520, 618], [492, 594], [520, 594]]) ln(506, 606, lx, ly, STEEL, 2);
  dot(506, 606, 18, L('#d8d8cc', '#6a6a62', '#30302c'));
  dot(501, 601, 7, L('rgba(255,255,255,0.4)', 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0)'));
  text('★', 506, 607, 14, L('#4a5a2a', '#8aa060', '#3a3a30'), 'Arial, sans-serif');
  beacon(506, 588, 2.2);

  // ── Firing range (SW corner): covered firing point, six lanes, butts ──
  R(56, 652, 440, 116, L('#857e5c', '#322f26', '#201f1a'));
  ell(474, 710, 18, 56, L('#5a6a3a', '#2a3220', '#1c2016')); ell(471, 710, 11, 48, L('#6e7e48', '#343c26', '#20241a'));   // backstop berm
  for (let i = 0; i < 6; i++) {
    const ly = 666 + i * 17.6;
    if (detail) { R(104, ly + 8.4, 338, 0.8, 'rgba(0,0,0,0.12)'); for (const dx of [190, 280, 370]) R(dx, ly - 3, 1, 6, MARK); }
    R(442, ly - 5, 3, 10, L('#f0f0e8', '#8a8a84', '#3a3a38')); dot(443.5, ly, 1.4, '#c03020');   // target
    if (on && day) {
      person(98, ly + 3, OLIVE, _N_SKIN[i % 6], 0, 1.4);
      const ph = (t * 0.9 + _cmFrac(i * 5.3)) % 1;
      if (ph < 0.05) { dot(104, ly - 3, 2.2, '#fff2b0'); glow(104, ly - 3, 9, '255,236,160', 0.7); ln(106, ly - 3, 440, ly - 0.5, 'rgba(255,240,170,0.4)', 0.6); }
      else if (ph < 0.2 && detail) ell(108 + ph * 30, ly - 4 - ph * 8, 2 + ph * 10, 1.5 + ph * 6, `rgba(230,230,220,${(0.3 - ph * 1.4).toFixed(3)})`);
    }
  }
  R(60, 656, 30, 108, SHADOW); R(56, 652, 30, 108, ROOF); R(84, 652, 2, 108, L('#a0a080', '#4a4c40', '#2a2a24'));   // firing point roof
  if (on && day) person(120, 760, '#3a4a2a', _N_SKIN[3], 0, 1.6);                    // range officer
  if (detail) for (const fy of [652, 766]) for (let x = 100; x < 490; x += 60) { ln(x, fy, x, fy - 7, STEEL, 1); R(x, fy - 7, 6, 4, '#d03030'); }   // range flags

  // ── Motor pool (SE) ──
  R(596, 410, 272, 156, L('#8a8a80', '#3a3a36', '#222220'));
  const truck = (x, y, body) => {
    RR(x + 2, y + 2, 15, 34, 2, SHADOW);
    RR(x, y, 15, 34, 2, body);
    R(x + 1, y + 1, 13, 10, L('#4a5236', '#262a1c', '#1a1c14'));                    // cab
    if (detail) R(x + 2.5, y + 3, 10, 3.4, on ? (night ? '#6a8aa0' : '#2a3a44') : '#141618');
    R(x + 1, y + 13, 13, 20, L('#6a7446', '#343a24', '#20221a'));                   // canvas load bed
    if (detail) for (let k = 1; k < 4; k++) R(x + 1, y + 13 + k * 5, 13, 0.8, 'rgba(0,0,0,0.2)');
  };
  const tank = (x, y, turretA) => {
    RR(x + 2, y + 3, 22, 36, 3, SHADOW);
    R(x - 2, y + 1, 5, 34, L('#2a2c24', '#141612', '#101010')); R(x + 19, y + 1, 5, 34, L('#2a2c24', '#141612', '#101010'));   // tracks
    RR(x, y, 22, 36, 3, L('#5e6a3c', '#2c3420', '#1e2218'));
    if (detail) { R(x + 3, y + 28, 16, 5, L('#4e5a30', '#262c1a', '#1a1c14')); for (let k = 0; k < 6; k++) R(x - 2, y + 3 + k * 5.6, 5, 0.8, 'rgba(0,0,0,0.35)'), R(x + 19, y + 3 + k * 5.6, 5, 0.8, 'rgba(0,0,0,0.35)'); }
    at(x + 11, y + 17, turretA, 1, () => {
      ctx.fillStyle = L('#4a5236', '#262a1c', '#1a1c14'); ctx.fillRect(6, -1.4, 22, 2.8); ctx.fillRect(26, -2, 4, 4);   // gun + muzzle brake
      ctx.fillStyle = L('#6e7a48', '#343c24', '#20241a'); ctx.beginPath(); ctx.roundRect(-9, -8, 18, 16, 5); ctx.fill();
      ctx.fillStyle = L('#58643a', '#2a301e', '#1c1e16'); ctx.beginPath(); ctx.arc(-2, -3, 2.6, 0, Math.PI * 2); ctx.fill();   // hatch
    });
  };
  for (let k = 0; k < 9; k++) truck(606 + k * 28, 418, k % 3 === 2 ? L('#8a7a52', '#40382a', '#24201a') : OLIVE);
  for (let k = 0; k < 5; k++) tank(610 + k * 38, 480, -Math.PI / 2 + (k === 1 && on ? Math.sin(t * 0.4) * 0.6 : 0));
  if (detail) {
    for (let k = 0; k <= 9; k++) R(603 + k * 28, 414, 1, 42, 'rgba(255,255,255,0.35)');   // parking bays
    // camo netting over the end of the armour line
    RR(796, 472, 64, 56, 6, L('rgba(70,84,44,0.8)', 'rgba(30,36,22,0.8)', 'rgba(24,26,18,0.75)'));
    for (let k = 0; k < 16; k++) ell(801 + _cmFrac(k * 3.3) * 54, 477 + _cmFrac(k * 5.1) * 46, 5 + _cmFrac(k) * 5, 3 + _cmFrac(k * 2) * 3,
      [L('#3e4a26', '#1e2414', '#141810'), L('#7a7a4a', '#34341e', '#1e1e14'), L('#56642e', '#262e18', '#181c10')][k % 3]);
    for (const [cx, cy] of [[796, 472], [860, 472], [796, 528], [860, 528]]) dot(cx, cy, 1.6, L('#3a3a30', '#1a1a16', '#101010'));
    for (let k = 0; k < 5; k++) { RR(608 + k * 22, 538, 16, 20, 2, SHADOW); RR(606 + k * 22, 536, 16, 20, 2, OLIVE); R(608 + k * 22, 538, 12, 6, L('#3a4028', '#1c1e14', '#141410')); }   // jeeps
  }
  // maintenance garage
  R(890, 416, 192, 96, SHADOW);
  R(884, 410, 192, 26, ROOF); R(884, 434, 192, 3, L('#a0a080', '#4a4c40', '#2a2a24'));
  R(884, 437, 192, 69, L('#a8a494', '#4a4842', '#272622'));
  for (let d = 0; d < 4; d++) { R(894 + d * 46, 452, 34, 54, on ? (night ? '#ffd890' : '#343632') : '#161614'); if (detail && !(on && night)) for (let k = 1; k < 5; k++) R(894 + d * 46, 452 + k * 11, 34, 0.8, 'rgba(255,255,255,0.08)'); }
  if (detail) { tank(962, 470, -Math.PI / 2); text('MT', 980, 422, 9, L('#2a3a1a', '#c8d890', '#3a3a30')); }
  if (on && detail && day && Math.sin(t * 13) > 0.4) { dot(928, 498, 2, '#bfe6ff'); glow(928, 498, 10, '190,230,255', 0.7); }   // welding flash
  if (on && night) glow(980, 480, 100, '255,216,144', 0.12);
  // fuel depot: four tanks inside a bund wall
  R(884, 522, 192, 60, L('#8a8a80', '#3a3a36', '#222220'));
  ctx.strokeStyle = L('#a8a898', '#4a4a44', '#2a2a26'); ctx.lineWidth = 3 * S; ctx.strokeRect(X(886), Y(524), 188 * S, 56 * S);
  for (let k = 0; k < 4; k++) {
    const cx = 914 + k * 44, cy = 552;
    dot(cx + 3, cy + 4, 17, SHADOW);
    dot(cx, cy, 17, L('#d8d8cc', '#6a6a62', '#30302c'));
    dot(cx - 4, cy - 4, 7, L('rgba(255,255,255,0.35)', 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0)'));
    if (detail) { ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.8 * S; ctx.beginPath(); ctx.arc(X(cx), Y(cy), 12 * S, 0, Math.PI * 2); ctx.stroke(); R(cx - 1, cy - 17, 2, 34, 'rgba(0,0,0,0.12)'); }
  }

  // ── Air-defence battery: revetted launchers round a search radar ──
  RR(596, 598, 228, 168, 10, L('#8f8a72', '#38362c', '#22211c'));
  const SAMS = [[640, 640, -2.3], [780, 640, -0.9], [640, 730, 2.4], [780, 730, 0.8]];
  for (let k = 0; k < SAMS.length; k++) {
    const [sx, sy, base] = SAMS[k];
    ctx.strokeStyle = L('#6e7e48', '#343c26', '#20241a'); ctx.lineWidth = 7 * S;        // horseshoe berm, open toward the radar
    ctx.beginPath(); ctx.arc(X(sx), Y(sy), 27 * S, base - 2.2, base + 2.2); ctx.stroke();
    dot(sx + 2, sy + 3, 14, SHADOW);
    dot(sx, sy, 14, CONC);
    at(sx, sy, base + (on ? Math.sin(t * 0.3 + k * 1.7) * 0.5 : 0), 1, () => {
      ctx.fillStyle = L('#4e5a34', '#2a321e', '#1e2218'); ctx.beginPath(); ctx.roundRect(-10, -9, 22, 18, 2); ctx.fill();
      for (let m = 0; m < 4; m++) {
        ctx.fillStyle = L('#d8d8cc', '#6a6a62', '#30302c'); ctx.fillRect(-8, -8 + m * 4.3, 24, 3);
        ctx.fillStyle = '#c03020'; ctx.fillRect(15, -8 + m * 4.3, 2.5, 3);
      }
    });
  }
  // search radar on its trailer in the middle, command cabin beside it
  R(696, 700, 30, 16, SHADOW); RR(692, 696, 30, 16, 2, OLIVE);
  if (detail) { R(696, 699, 8, 4, WIN); ln(718, 696, 718, 686, STEEL, 0.8); }
  dot(712, 668, 13, SHADOW); dot(710, 665, 13, L('#5e6a3c', '#2c3420', '#1e2218'));
  at(710, 665, on ? t * 1.1 : 0.6, 1, () => {
    ctx.fillStyle = L('#c8c8bc', '#62625a', '#2c2c28'); ctx.beginPath(); ctx.roundRect(-3, -19, 6, 38, 2); ctx.fill();   // antenna face
    ctx.fillStyle = L('#8a8a80', '#3a3a36', '#26261f'); ctx.fillRect(-9, -1.2, 8, 2.4);
    if (detail) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; for (let m = -3; m <= 3; m++) ctx.fillRect(-3, m * 5 - 0.4, 6, 0.8); }
  });
  if (on && night && detail) { const a = t * 1.1; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(120,255,160,0.07)'; ctx.beginPath(); ctx.moveTo(X(710), Y(665)); ctx.arc(X(710), Y(665), 80 * S, a - 0.35, a + 0.35); ctx.closePath(); ctx.fill(); ctx.restore(); }

  // ── Ammo bunkers (earth-bermed) + antenna mast ──
  for (const [bx, by] of [[846, 606], [928, 606], [1010, 606], [886, 686], [968, 686]]) {
    ell(bx + 34, by + 26, 38, 26, L('#5a6a3a', '#2a3220', '#1c2016'));
    ell(bx + 34, by + 22, 30, 18, L('#6e7e48', '#343c26', '#20241a'));
    R(bx + 26, by + 36, 16, 12, L('#6a6a60', '#2e2e2a', '#1c1c1a'));                 // blast door
    if (detail) { R(bx + 33.4, by + 36, 1.2, 12, 'rgba(0,0,0,0.3)'); R(bx + 24, by + 34, 20, 2, CONC); }
  }
  ln(1064, 766, 1064, 676, L('#9a9a90', '#4a4a44', '#2a2a26'), 2);
  if (detail) for (let k = 0; k < 4; k++) { ln(1064, 686 + k * 20, 1048 - k * 3, 702 + k * 20, 'rgba(160,160,150,0.5)', 0.6); ln(1064, 686 + k * 20, 1080 + k * 3, 702 + k * 20, 'rgba(160,160,150,0.5)', 0.6); }
  beacon(1064, 674, 2.6, 1);

  // ── Fence, razor wire, guard towers, gate ──
  ctx.strokeStyle = L('rgba(200,200,190,0.8)', 'rgba(140,140,130,0.5)', 'rgba(70,70,64,0.6)'); ctx.lineWidth = 1.4 * S;
  ctx.strokeRect(X(8), Y(8), (AW - 16) * S, (AH - 16) * S);
  if (detail) {
    ctx.fillStyle = STEEL;
    for (let x = 8; x <= AW - 8; x += 20) { ctx.fillRect(X(x - 1), Y(6), 2 * S, 4 * S); ctx.fillRect(X(x - 1), Y(AH - 10), 2 * S, 4 * S); }
    for (let y = 8; y <= AH - 8; y += 20) { ctx.fillRect(X(6), Y(y - 1), 4 * S, 2 * S); ctx.fillRect(X(AW - 10), Y(y - 1), 4 * S, 2 * S); }
    ctx.strokeStyle = L('rgba(170,170,160,0.6)', 'rgba(120,120,110,0.35)', 'rgba(60,60,56,0.5)'); ctx.lineWidth = 0.6 * S;
    ctx.beginPath();
    for (let x = 12; x < AW - 8; x += 6) { ctx.moveTo(X(x + 3), Y(4)); ctx.arc(X(x), Y(4), 3 * S, 0, Math.PI * 2); }
    ctx.stroke();
  }
  // convoy: two trucks behind a jeep, in at the gate, round the block and out
  const CONVOY_LEN = _mbPathLen(_MB_CONVOY), CONVOY_LOOP = CONVOY_LEN + 900;
  const convoyD = k => ((t * 34 - k * 44) % CONVOY_LOOP + CONVOY_LOOP) % CONVOY_LOOP;
  let barrierUp = false;
  if (on) for (let k = 0; k < 3; k++) { const d = convoyD(k); if (d < 110 || (d > CONVOY_LEN - 110 && d < CONVOY_LEN)) barrierUp = true; }
  // main gate: gap in the south fence, checkpoint booth, lifting barrier
  R(538, AH - 12, 44, 8, ROAD);
  RR(586, AH - 52, 24, 20, 2, L('#d8d4c4', '#5a5850', '#2a2926'));
  R(590, AH - 48, 16, 7, WIN); R(584, AH - 54, 28, 4, ROOF);
  ctx.save(); ctx.translate(X(540), Y(AH - 30)); ctx.rotate(barrierUp ? -Math.PI / 2.4 : 0);
  ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, -1.5 * S, 40 * S, 3 * S);
  ctx.fillStyle = '#d03030'; for (let k = 0; k < 4; k++) ctx.fillRect((4 + k * 10) * S, -1.5 * S, 5 * S, 3 * S);
  ctx.restore();
  if (on) person(616, AH - 34, OLIVE, _N_SKIN[2], 0, 1.5);                         // sentry
  for (let k = 0; k < 7; k++) {                                                     // sandbagged post covering the gate
    const a = Math.PI * (0.1 + k / 7.5), sx = 512 + Math.cos(a) * 16, sy = AH - 40 - Math.sin(a) * 12;
    RR(sx - 4, sy - 2.5, 8, 5, 2, L('#b8a882', '#54503e', '#2a2820'));
  }
  if (on) person(512, AH - 40, OLIVE, _N_SKIN[4], 0, 1.4);
  if (detail) for (const by of [AH - 62, AH - 84]) R(550, by, 20, 2.5, L('#e8d040', '#8a7a30', '#3a3420'));   // speed bumps
  if (on) for (let k = 0; k < 3; k++) {
    const d = convoyD(k);
    if (d > CONVOY_LEN) continue;
    const [vx, vy, vh] = _mbAlong(_MB_CONVOY, d, 10);
    at(vx, vy, vh, 1, () => {
      const len = k ? 26 : 18;
      ctx.fillStyle = SHADOW; ctx.fillRect(-len / 2 + 2, -4, len, 11);
      ctx.fillStyle = L('#6a7446', '#343a24', '#20221a'); ctx.beginPath(); ctx.roundRect(-len / 2, -5.5, len, 11, 2); ctx.fill();
      ctx.fillStyle = L('#3a4028', '#1c1e14', '#141410'); ctx.fillRect(len / 2 - 9, -4.5, 5, 9);     // windscreen
      if (k) { ctx.fillStyle = L('#7a8452', '#3a4028', '#24261c'); ctx.fillRect(-len / 2 + 1, -4.5, len - 12, 9); }   // canvas tilt
      if (night) { ctx.fillStyle = 'rgba(255,244,200,0.85)'; ctx.fillRect(len / 2 - 1, -4.5, 1.6, 2); ctx.fillRect(len / 2 - 1, 2.5, 1.6, 2); ctx.fillStyle = 'rgba(255,60,40,0.8)'; ctx.fillRect(-len / 2, -4.5, 1.2, 2); ctx.fillRect(-len / 2, 2.5, 1.2, 2); }
    });
    if (night) glow(vx + Math.cos(vh) * 24, vy + Math.sin(vh) * 24, 20, '255,244,200', 0.25);
  }
  // guard towers + searchlights
  for (const [gx, gy, base] of [[22, 22, 0.8], [AW - 22, 22, 2.4], [22, AH - 22, -0.8], [AW - 22, AH - 22, -2.4], [22, 383, 0], [AW - 22, 383, Math.PI]]) {
    if (on && night) {
      const a = base + Math.sin(t * 0.5 + gx + gy) * 0.7;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(X(gx), Y(gy), 0, X(gx), Y(gy), 220 * S);
      g.addColorStop(0, 'rgba(255,250,220,0.3)'); g.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(X(gx), Y(gy));
      ctx.lineTo(X(gx + Math.cos(a - 0.12) * 220), Y(gy + Math.sin(a - 0.12) * 220));
      ctx.lineTo(X(gx + Math.cos(a + 0.12) * 220), Y(gy + Math.sin(a + 0.12) * 220)); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    R(gx - 11 + 3, gy - 11 + 4, 22, 22, SHADOW);
    R(gx - 11, gy - 11, 22, 22, L('#7a6a4a', '#3a3224', '#221e16'));
    R(gx - 13, gy - 13, 26, 5, ROOF);
    if (detail) { ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.8 * S; ctx.strokeRect(X(gx - 8), Y(gy - 6), 16 * S, 14 * S); }
    dot(gx, gy, 3, on && night ? '#fff6d0' : L('#5a5a50', '#3a3a34', '#222220'));
  }
  if (on && night) for (let x = 60; x < AW - 40; x += 120) glow(x, AH - 20, 40, '255,236,190', 0.14);

  // ── Duty fighter: taxi out, take off on 09, come back in and park ──
  {
    const u = on ? (t / _MB_JET_PERIOD) % 1 : 0.95;
    const OUT = _mbPathLen(_MB_TAXI_OUT), IN = _mbPathLen(_MB_TAXI_IN);
    if (u < 0.16) { const [jx, jy, jh] = _mbAlong(_MB_TAXI_OUT, (u / 0.16) * OUT, 14); jet(jx, jy, u < 0.004 ? -Math.PI / 2 : jh, 0, 0, true); }
    else if (u < 0.19) jet(150, 74, 0, 0, Math.max(0, (u - 0.17) / 0.02), true);       // lined up, burner coming in
    else if (u < 0.27) { const k = (u - 0.19) / 0.08; jet(150 + 1160 * k * k, 74, 0, Math.max(0, (k - 0.6) / 0.4), 1, true); }
    else if (u < 0.6) { /* away on its sortie */ }
    else if (u < 0.7) { const k = (u - 0.6) / 0.1; jet(-160 + 1170 * (1 - (1 - k) * (1 - k)), 74, 0, Math.max(0, 1 - k / 0.2), 0, true); }
    else if (u < 0.84) { const [jx, jy, jh] = _mbAlong(_MB_TAXI_IN, ((u - 0.7) / 0.14) * IN, 14); jet(jx, jy, jh, 0, 0, true); }
    else jet(768, 196, -Math.PI / 2);
  }

  // ── Helicopter: idle, spin up, lift, circle the base, land ──
  {
    const { hx, hy, alt, head, rotor } = on ? _mbHeliState(t) : { hx: HPX, hy: HPY, alt: 0, head: -Math.PI / 2, rotor: 0 };
    const k2 = 1 + alt * 0.3;
    const heli = (fill, body) => {
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.ellipse(4, 0, 15, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-26, -1.6, 22, 3.2);
      ctx.fillRect(-28, -6, 3, 12);
      if (body) {
        ctx.fillStyle = CANOPY; ctx.beginPath(); ctx.ellipse(12, 0, 6, 4.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = L('#3e4a2a', '#222a18', '#181c12'); ctx.fillRect(-2, -9, 8, 2); ctx.fillRect(-2, 7, 8, 2);   // stub wings
      }
    };
    at(hx + alt * 30, hy + alt * 24, head, k2, () => heli(SHADOW, false));
    at(hx, hy, head, k2, () => {
      heli(L('#4e5a34', '#2a321e', '#1e2218'), true);
      if (rotor > 1.2) {                                                              // blur disc at speed
        ctx.fillStyle = `rgba(200,210,200,${(0.12 * (rotor - 1.2)).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(2, 0, 26, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = L('#2a2c28', '#1a1c18', '#141412'); ctx.lineWidth = 1.6;
      const ra = t * rotor * 9;
      for (let b = 0; b < 4; b++) { const a = ra + b * Math.PI / 2; ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(2 + Math.cos(a) * 26, Math.sin(a) * 26); ctx.stroke(); }
      if (on) { ctx.fillStyle = Math.sin(t * 8) > 0.7 ? '#ff3020' : '#6a1810'; ctx.beginPath(); ctx.arc(-26, 0, 1.6, 0, Math.PI * 2); ctx.fill(); }
    });
    if (on && night && alt > 0.5) glow(hx + alt * 20, hy + alt * 16, 46, '255,250,220', 0.16);   // landing light on the ground
  }

  if (!on) {
    ctx.fillStyle = 'rgba(255,90,70,0.9)'; ctx.font = `bold ${22*S}px Courier New`; ctx.textAlign = 'center';
    ctx.fillText('NO POWER: BASE OFFLINE', X(560), Y(388)); ctx.textAlign = 'left';
  }
  ctx.restore();
}

// ── National Government Center (18×14) ───────────────────────────────────
// Authored at 720×560 units and scaled to the footprint. The capitol, drawn
// front-on from slightly above like the other landmarks: a white ribbed dome
// on a colonnaded drum with a lantern flying the flag, colonnaded
// wings with pediments, and grand steps with two ceremonial guards. South of
// it a flag-lined plaza with visitors, a long reflecting pool mirroring the
// dome between tree-lined walks, and formal hedge gardens with fountains.
// A motorcade — black SUVs behind a police escort with lights going — sweeps
// along the front drive past the gatehouse. At night the dome is floodlit.
function renderNationalGov(e, px, py, t) {
  const AW = 720, AH = 560;
  const W = (e.width || 18) * TILE, H = (e.height || 14) * TILE;
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(W / (AW*TILE/40), H / (AH*TILE/40));
  const K = _nKit(0, 0), { S, X, Y, R, RR, dot, ell, poly, ln, text, glow, person } = K;
  const on = e.powered, hr = DayNight.hour(), dark = DayNight.darkness();
  const night = dark > 0.3, open = on && hr >= 8 && hr < 18;
  const detail = Camera.zoom > 0.3;
  const L = (d, n, o) => on ? (night ? n : d) : o;
  ctx.beginPath(); ctx.rect(0, 0, AW*S, AH*S); ctx.clip();

  const LAWN  = L('#5e9448', '#1e2e1e', '#182018');
  const STONE = L('#ece6d8', '#8a8676', '#34322c'), STONE_D = L('#cfc6b2', '#6e6a5e', '#2a2824');
  const PAVE  = L('#ddd6c6', '#6a665c', '#2c2a26');
  const WIN   = on ? (night ? '#ffd890' : '#4a5a66') : '#161616';
  R(0, 0, AW, AH, LAWN);
  if (detail) for (let x = 0; x < AW; x += 24) R(x, 0, 12, AH, L('rgba(255,255,255,0.03)', 'rgba(255,255,255,0.01)', 'rgba(0,0,0,0)'));   // mowing stripes

  // ── Service road behind, front drive + gatehouse ──
  R(0, 18, AW, 26, L('#4a4c50', '#1e2024', '#141517'));
  R(0, 496, AW, 40, L('#4a4c50', '#1e2024', '#141517'));
  if (detail) for (let x = 10; x < AW; x += 30) R(x, 515, 15, 2, L('rgba(255,255,255,0.8)', 'rgba(255,255,255,0.35)', 'rgba(100,100,100,0.4)'));
  R(0, 536, AW, 24, PAVE);                                                                 // outer sidewalk
  RR(622, 470, 44, 26, 3, STONE);
  R(628, 476, 32, 8, WIN);                                                                  // gatehouse
  if (detail) for (let x = 40; x < AW; x += 26) if (x < 600 || x > 680) dot(x, 494, 2.2, L('#8a8a86', '#44443f', '#26261f'));   // bollards

  // ── Formal gardens with fountains (left + right) ──
  for (const gx of [40, 520]) {
    R(gx, 300, 160, 180, L('#4e8a3c', '#1a2a1a', '#161e16'));
    ctx.strokeStyle = L('#2e6a26', '#122012', '#101810'); ctx.lineWidth = 6 * S;
    ctx.strokeRect(X(gx + 12), Y(312), 136 * S, 156 * S);
    ctx.beginPath(); ctx.moveTo(X(gx + 12), Y(312)); ctx.lineTo(X(gx + 148), Y(468)); ctx.moveTo(X(gx + 148), Y(312)); ctx.lineTo(X(gx + 12), Y(468)); ctx.stroke();
    const fx = gx + 80, fy = 390;
    dot(fx, fy, 22, STONE_D); dot(fx, fy, 18, L('#5ab0d8', '#1a3a50', '#1a2228'));
    if (on) for (let d = 0; d < 8; d++) {
      const u = (t * 0.8 + d / 8) % 1, a = d / 8 * Math.PI * 2;
      dot(fx + Math.cos(a) * u * 14, fy + Math.sin(a) * u * 14 - Math.sin(u * Math.PI) * 6, 1.4, `rgba(220,245,255,${(0.8 * (1 - u)).toFixed(3)})`);
    }
    dot(fx, fy, 4, STONE);
    if (detail) for (const [bx, by] of [[gx + 40, 340], [gx + 120, 340], [gx + 40, 440], [gx + 120, 440]]) dot(bx, by, 8, L('#c05a8a', '#4a2436', '#26141c'));   // flower beds
  }

  // ── Reflecting pool between tree-lined walks ──
  R(236, 348, 248, 132, PAVE);
  R(250, 360, 220, 108, L('#4a90b8', '#0e2034', '#141c22'));
  ell(360, 420, 40, 26, on ? (night ? 'rgba(255,220,140,0.3)' : 'rgba(255,255,255,0.35)') : 'rgba(0,0,0,0)');   // dome reflection
  if (detail) for (let k = 0; k < 6; k++) {
    const y = 372 + k * 16 + Math.sin(t * 0.8 + k) * 2;
    ln(262 + (k % 2) * 20, y, 440 - (k % 3) * 18, y, L('rgba(255,255,255,0.3)', 'rgba(255,220,160,0.15)', 'rgba(0,0,0,0)'), 0.8);
  }
  for (const tx of [218, 502]) for (let ty = 350; ty <= 480; ty += 26) {
    ell(tx + 4, ty + 5, 12, 6, 'rgba(0,0,0,0.25)');
    dot(tx, ty, 11, L('#2e6a2a', '#142414', '#101a0e')); dot(tx - 3, ty - 3, 6, L('#3e8a36', '#1c3220', '#141c10'));
  }

  // ── Plaza with the flag row ──
  R(120, 290, 480, 58, PAVE);
  if (detail) for (let x = 120; x < 600; x += 20) R(x, 290, 0.8, 58, 'rgba(0,0,0,0.06)');
  for (let f = 0; f < 10; f++) {
    const fx = 136 + f * 50;
    if (f === 4 || f === 5) continue;                                                      // gap for the steps
    dot(fx, 342, 2.2, L('#9a9a94', '#4a4a44', '#2a2a26'));
    ln(fx, 342, fx, 300, L('#e0e0dc', '#8a8a86', '#3a3a38'), 1.4);
    const pts = [];
    for (let k = 0; k <= 5; k++) pts.push([fx + k * 3.6, 301 + Math.sin(t * 4 + k * 0.8 + f) * 1.4 * (k / 5)]);
    for (let k = 5; k >= 0; k--) pts.push([fx + k * 3.6, 313 + Math.sin(t * 4 + k * 0.8 + f) * 1.4 * (k / 5)]);
    poly(pts, ['#2a4a9a', '#c03030', '#2a7a4a', '#e0b030'][f % 4]);
  }
  if (open) for (let p = 0; p < 12; p++) {                                                  // visitors
    const u = (t * (0.01 + _cmFrac(p) * 0.012) + _cmFrac(p * 5)) % 1;
    const vx = 130 + (p % 2 ? u : 1 - u) * 460, vy = 318 + _cmFrac(p * 9) * 24;
    person(vx, vy, _N_SHIRT[p % 8], _N_SKIN[p % 6], Math.abs(Math.sin(t * 6 + p)) * 0.3, 1.5);
  }

  // ── The capitol, seen from the front and a little above ──
  // Each mass shows a lit roof strip above a front face, and the drum and
  // dome rise in elevation above the portico, like the other landmarks.
  const ROOF_T = L('#b8b2a4', '#5a5850', '#26241f');                       // flat roof, seen from above
  const SHADE  = L('rgba(0,0,0,0.10)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.2)');
  const litWin = (k) => on && night && ((k * 7) % 11) !== 3;
  const winAt = (x, y, w, h, k, arched) => {
    const c = litWin(k) ? '#ffd890' : (on ? (night ? '#1c2430' : '#4a5a66') : '#161616');
    R(x - 1, y - 1, w + 2, h + 2, STONE_D);
    if (arched) dot(x + w / 2, y, w / 2 + 1, STONE_D);
    R(x, y, w, h, c);
    if (arched) dot(x + w / 2, y, w / 2, c);
    if (litWin(k) && detail) glow(x + w / 2, y + h / 2, 12, '255,210,130', 0.18);
  };
  const column = (x, y0, y1, w) => {
    R(x - w / 2, y0, w, y1 - y0, STONE);
    R(x + w * 0.1, y0, w * 0.4, y1 - y0, SHADE);                            // round shading
    R(x - w / 2 - 1.5, y0 - 3, w + 3, 3, STONE_D);                            // capital
    R(x - w / 2 - 1.5, y1, w + 3, 3, STONE_D);                                // base
  };

  // Cast shadow on the lawn (sun from the upper left)
  poly([[184, 262], [546, 262], [560, 276], [198, 276]], 'rgba(0,0,0,0.22)');

  // Wings: roof strip + balustrade, three storeys, an engaged colonnade and a
  // central pediment on each.
  for (const [wx, ww, side] of [[178, 124, -1], [418, 124, 1]]) {
    R(wx, 112, ww, 16, ROOF_T);
    R(wx, 126, ww, 4, STONE_D);                                              // cornice
    if (detail) for (let b = wx + 3; b < wx + ww - 2; b += 5) R(b, 120, 2, 6, STONE);   // balustrade
    R(wx, 120, ww, 1.5, STONE);
    R(wx, 130, ww, 132, STONE);
    R(wx, 244, ww, 18, STONE_D);                                             // rusticated base
    if (detail) for (let y = 247; y < 262; y += 5) R(wx, y, ww, 0.8, 'rgba(0,0,0,0.08)');
    // End pavilion projects slightly — shaded return on its inner side
    const px0 = side < 0 ? wx : wx + ww - 26;
    R(px0, 128, 26, 134, STONE);
    R(side < 0 ? px0 + 26 : px0 - 3, 128, 3, 134, SHADE);
    for (let r = 0; r < 3; r++) winAt(px0 + 9, 142 + r * 34, 8, 20, r + (side < 0 ? 0 : 50), r === 1);
    // Main range windows between engaged columns
    const x0 = side < 0 ? wx + 30 : wx + 4, span = ww - 34;
    for (let c = 0; c < 5; c++) {
      const cx = x0 + 6 + c * (span / 5);
      for (let r = 0; r < 3; r++) winAt(cx, 142 + r * 34, 9, r === 1 ? 22 : 16, c * 3 + r + (side < 0 ? 10 : 30), r === 1);
      if (c > 0) column(cx - 5, 170, 238, 4);
    }
    // Pediment on the wing centre
    const pc = x0 + span / 2 + 3;
    poly([[pc - 34, 128], [pc, 106], [pc + 34, 128]], STONE);
    poly([[pc - 34, 128], [pc, 106], [pc, 128]], L('rgba(255,255,255,0.12)', 'rgba(255,255,255,0.04)', 'rgba(0,0,0,0)'));
    ln(pc - 34, 128, pc, 106, STONE_D, 1.4); ln(pc, 106, pc + 34, 128, STONE_D, 1.4);
    if (detail) dot(pc, 120, 4, STONE_D);
  }

  // Central block behind the portico
  R(292, 124, 136, 16, ROOF_T);
  R(292, 138, 136, 4, STONE_D);
  R(292, 142, 136, 120, STONE);
  R(292, 244, 136, 18, STONE_D);
  R(292, 142, 3, 120, SHADE); R(425, 142, 3, 120, SHADE);

  // ── Drum, dome and lantern ──
  const DX = 360;
  if (on && night) glow(DX, 70, 130, '255,210,120', 0.32);                  // floodlit dome
  // lower drum with its ring of columns
  R(314, 88, 92, 44, STONE);
  R(310, 128, 100, 6, STONE_D);
  R(310, 84, 100, 5, STONE_D);
  for (let c = 0; c < 12; c++) {
    const u = (c + 0.5) / 12, xx = DX + Math.cos(Math.PI * (1 - u)) * 46;  // columns bunch toward the edges (it's round)
    const w = 2.2 + 2.2 * Math.sin(Math.PI * u);
    R(xx - w / 2, 90, w, 38, STONE_D);
    if (c % 2 === 0 && c > 1 && c < 11) winAt(xx + 3, 98, 4, 20, c + 70, true);
  }
  // shading across the drum's curve
  const dgr = ctx.createLinearGradient(X(314), 0, X(406), 0);
  dgr.addColorStop(0, 'rgba(255,255,255,0.10)'); dgr.addColorStop(0.45, 'rgba(0,0,0,0)'); dgr.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = dgr; ctx.fillRect(X(314), Y(84), 92 * S, 50 * S);
  // attic ring
  R(322, 72, 76, 13, STONE);
  R(318, 70, 84, 3, STONE_D);
  ctx.fillStyle = dgr; ctx.fillRect(X(322), Y(70), 76 * S, 15 * S);
  // dome (half-ellipse) with ribs
  const domeY = 70, domeRX = 38, domeRY = 40;
  const dg = ctx.createLinearGradient(X(DX - domeRX), 0, X(DX + domeRX), 0);
  dg.addColorStop(0,   on ? (night ? '#e8d0a0' : '#f4f1ea') : '#3e3c36');
  dg.addColorStop(0.35, on ? (night ? '#fff0c8' : '#ffffff') : '#4a4842');
  dg.addColorStop(1,   on ? (night ? '#9a7a48' : '#b4ac9c') : '#262420');
  ctx.fillStyle = dg;
  ctx.beginPath(); ctx.ellipse(X(DX), Y(domeY), domeRX * S, domeRY * S, 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill();
  if (detail) {
    ctx.strokeStyle = on ? 'rgba(120,110,90,0.35)' : 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.9 * S;
    for (let k = 1; k < 8; k++) {                                            // meridian ribs
      const f = Math.cos(Math.PI * k / 8);
      ctx.beginPath(); ctx.ellipse(X(DX), Y(domeY), Math.abs(f) * domeRX * S, domeRY * S, 0, Math.PI * (f > 0 ? 1.5 : 1), Math.PI * (f > 0 ? 2 : 1.5)); ctx.stroke();
    }
    for (const fy of [0.35, 0.65]) {                                         // horizontal bands
      const yy = domeY - domeRY * fy, rx = domeRX * Math.sqrt(1 - fy * fy);
      ln(DX - rx, yy, DX + rx, yy, on ? 'rgba(120,110,90,0.3)' : 'rgba(0,0,0,0.3)', 0.8);
    }
  }
  // lantern
  R(351, 18, 18, 14, STONE);
  for (let c = 0; c < 3; c++) R(353 + c * 5.5, 20, 2.2, 10, litWin(c + 90) || (on && night) ? '#ffd890' : STONE_D);
  R(349, 30, 22, 3, STONE_D); R(349, 16, 22, 3, STONE_D);
  ctx.fillStyle = dg; ctx.beginPath(); ctx.ellipse(X(DX), Y(16), 9 * S, 6 * S, 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill();
  // flag on the lantern
  ln(DX, 10, DX, 0, L('#e0e0dc', '#8a8a86', '#3a3a38'), 1.4);
  _drawNationFlag(K, DX + 0.6, 1, 26, 15, t, on ? (night ? 1 : 0) : 2, 1.6, detail);

  // ── Portico: pediment, entablature, eight columns, doors ──
  R(300, 162, 120, 90, L('#b8b0a0', '#3a3830', '#1e1c1a'));                // shadowed wall behind columns
  for (const dx of [322, 352, 382]) {                                        // bronze doors
    RR(dx, 206, 16, 38, 1, L('#6a4a2a', '#3a2818', '#1a120c'));
    if (on) R(dx + 2, 208, 12, 5, night ? '#ffd890' : '#8a9aa4');
  }
  if (on && open) for (let p = 0; p < 3; p++) person(330 + p * 30 + Math.sin(t * 0.6 + p) * 6, 246, _N_SHIRT[(p + 3) % 8], _N_SKIN[p], 0, 1.4);
  for (let c = 0; c < 8; c++) column(304 + c * 16, 176, 246, 7);
  R(296, 164, 128, 12, STONE);                                               // entablature
  R(296, 174, 128, 2.5, STONE_D);
  if (detail) for (let k = 0; k < 20; k++) R(299 + k * 6.3, 166, 2, 5, STONE_D);   // triglyphs
  poly([[292, 164], [360, 130], [428, 164]], STONE);                        // pediment
  poly([[304, 160], [360, 136], [416, 160]], STONE_D);                      // tympanum
  if (detail) {                                                              // carved seal
    dot(360, 151, 7, STONE); dot(360, 151, 5, L('#d8b860', '#8a7440', '#3a3220'));
  }
  ln(292, 164, 360, 130, STONE_D, 1.6); ln(360, 130, 428, 164, STONE_D, 1.6);
  if (on && night) for (const lx of [304, 416]) glow(lx, 246, 34, '255,230,170', 0.3);   // uplights on the portico

  // Grand steps down to the plaza, with side cheek walls and lamps
  for (let s = 0; s < 7; s++) R(300 - s * 4, 250 + s * 6, 120 + s * 8, 6, s % 2 ? STONE : STONE_D);
  for (const cx of [288, 424]) { R(cx - 4, 250, 8, 42, STONE_D); R(cx - 6, 248, 12, 4, STONE); }
  for (const lx of [288, 432]) {
    ln(lx, 248, lx, 236, L('#3a3a38', '#222220', '#141412'), 1.4);
    dot(lx, 235, 3, on && night ? '#fff0c0' : L('#e8e4d8', '#6a665c', '#2a2824'));
    if (on && night) glow(lx, 235, 22, '255,236,190', 0.45);
  }
  if (on) { person(338, 290, '#1a1a2a', _N_SKIN[0], 0, 1.8); person(382, 290, '#1a1a2a', _N_SKIN[2], 0, 1.8); }   // ceremonial guards
  if (on && night) for (const [lx, ly] of [[260, 300], [460, 300], [236, 480], [484, 480]]) glow(lx, ly, 60, '255,236,190', 0.25);

  // ── Motorcade along the front drive ──
  if (on) {
    const u = (t * 0.03) % 1;
    if (u < 0.55) {
      const k = u / 0.55, x0 = -120 + k * (AW + 240);
      const car = (x, col, w = 26) => { RR(x - w / 2 + 2, 508, w, 14, 3, 'rgba(0,0,0,0.3)'); RR(x - w / 2, 505, w, 14, 3, col); R(x - w / 2 + w * 0.55, 507, w * 0.22, 10, on ? (night ? '#6a8aa0' : '#2a3440') : '#141618'); };
      car(x0 + 70, '#e8e8e8', 22);                                                           // police lead
      const flash = Math.floor(t * 8) % 2;
      dot(x0 + 70, 512, 2, flash ? '#3060ff' : '#ff3030');
      if (night) glow(x0 + 70, 512, 18, flash ? '48,96,255' : '255,48,48', 0.6);
      for (let c = 0; c < 3; c++) car(x0 + 30 - c * 34, '#141418');
      car(x0 - 90, '#e8e8e8', 22);
      dot(x0 - 90, 512, 2, flash ? '#ff3030' : '#3060ff');
    }
  }

  if (!on) {
    ctx.fillStyle = 'rgba(255,90,70,0.9)'; ctx.font = `bold ${20*S}px Courier New`; ctx.textAlign = 'center';
    ctx.fillText('NO POWER: GOVERNMENT IN RECESS', X(360), Y(330)); ctx.textAlign = 'left';
  }
  ctx.restore();
}

// ── Fusion Research Facility (20×16) ─────────────────────────────────────
// Authored at 800×640 units and scaled to the footprint. A national fusion
// lab built around an experimental tokamak: the hall's cutaway roof shows
// the torus — toroidal field coils ringing the vessel, a central solenoid,
// and the plasma ring inside, which flares pink-white during a shot while
// the neutral-beam injectors fire into it. Shots run every half in-game hour
// 09:00–18:00 (DemandCurves.fusionShot — the schedule its power draw follows); just before
// each one the flywheel generators spin up beside their capacitor banks.
// Around it: the helium cryoplant, cooling towers, a shielded tritium lab,
// and the control centre with its shot countdown board.
// The site around the tokamak campus. The campus itself is authored 800×640 and
// drawn at CK× in the middle of the footprint; everything else here fills the
// space round it: a visitor centre, admin block with a solar roof and a staff
// car park to the west; a neutral-beam injector, gyrotron hall, cooling towers,
// tritium tank farm and transformer yard to the east; a pipe rack along the
// top and the road along the bottom. Conduits run from the east-side plant in
// toward the hall, and the gyrotrons, beam injector and floodlights answer the
// plasma shots (shotK, 0→1→0 across each shot, or the settled burn).
// Drawn in footprint pixels, origin at the lab's top-left; (offX, offY) is
// where the campus starts and CK its scale.
function _fusionCampusSite(e, W, H, offX, offY, CK, t, shotK) {
  const on = e.powered, night = DayNight.darkness() > 0.3, detail = Camera.zoom > 0.3;
  const L = (d, n, o) => on ? (night ? n : d) : o;
  const now = performance.now() / 1000;
  const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const disc = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  const shadow = (x, y, w, h) => rect(x + 10, y + 12, w, h, 'rgba(0,0,0,0.3)');
  const glowAt = (x, y, r, rgb, a) => {
    if (a <= 0.01) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const PLASMA = '255,120,220';
  // The campus house style (renderFusionLab's bldg), in footprint pixels: a
  // cast shadow, walls, a roof shaded from the upper left with lit and
  // shadowed edges, and a strip of cyan light along the south face while live.
  const bldg = (x, y, w, h, roofA, roofB, wall) => {
    rect(x + 10, y + 12, w, h, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = wall || L('#8e959c', '#2a2e34', '#18191c'); ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill();
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, roofA); g.addColorStop(1, roofB);
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x + 8, y + 8, w - 16, h - 16, 4); ctx.fill();
    if (detail) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = L('rgba(255,255,255,0.55)', 'rgba(140,150,165,0.35)', 'rgba(70,70,70,0.3)');
      ctx.beginPath(); ctx.moveTo(x + 8, y + h - 8); ctx.lineTo(x + 8, y + 8); ctx.lineTo(x + w - 8, y + 8); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.moveTo(x + w - 8, y + 8); ctx.lineTo(x + w - 8, y + h - 8); ctx.lineTo(x + 8, y + h - 8); ctx.stroke();
    }
    if (on && detail) {
      rect(x + 18, y + h - 5, w - 36, 3, night ? 'rgba(120,230,255,0.95)' : 'rgba(120,210,240,0.6)');
      if (night) glowAt(x + w / 2, y + h, Math.min(140, w * 0.4), '120,230,255', 0.18);
    }
  };
  // A round thing lit from the upper left (towers, domes, tanks).
  const sdisc = (x, y, r, c0, c1) => {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };
  const roofA = L('#d6dbe0', '#4e545c', '#26282c'), roofB = L('#a2a9b1', '#2a2e35', '#1a1b1e');
  const cx1 = offX + 800 * CK;                                  // east edge of the campus
  const roadY0 = offY + 596 * CK, roadY1 = offY + 640 * CK;
  const ground = L('#8a8c84', '#24262a', '#18191a');
  const asphalt = L('#3a3c42', '#1c1e24', '#141518');
  const line = L('rgba(255,255,255,0.75)', 'rgba(255,255,255,0.3)', 'rgba(90,90,90,0.4)');

  // ── Ground, road and perimeter fence ──
  rect(0, 0, W, H, ground);
  if (detail) {                                                                  // paved like the campus, verges along the fence
    ctx.strokeStyle = L('rgba(60,62,58,0.2)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0.22)'); ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 30; x < W; x += 80) { ctx.moveTo(x, 20); ctx.lineTo(x, roadY0 - 8); }
    for (let y = 30; y < roadY0 - 8; y += 80) { ctx.moveTo(20, y); ctx.lineTo(W - 20, y); }
    ctx.stroke();
    rect(18, 18, W - 36, 14, L('#5e7a4a', '#1c2a1a', '#141814'));
    rect(18, roadY0 - 26, W - 36, 16, L('#5e7a4a', '#1c2a1a', '#141814'));
  }
  rect(0, roadY0, W, roadY1 - roadY0, L('#4a4c50', '#1e2024', '#141517'));
  if (detail) {
    for (let x = 10; x < W; x += 60) rect(x, (roadY0 + roadY1) / 2 - 2, 30, 4, line);
    ctx.strokeStyle = L('rgba(210,215,220,0.7)', 'rgba(120,130,140,0.4)', 'rgba(60,60,60,0.5)'); ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, W - 28, roadY0 - 22);
  }
  // Pipe rack along the top, with supports and a stream running in it.
  if (detail) {
    for (let x = 60; x < W; x += 140) rect(x, 40, 10, 34, L('#6a7078', '#2e333a', '#1c1e22'));
    rect(0, 48, W, 8, L('#8a929c', '#3e444e', '#22252a'));
    rect(0, 62, W, 6, L('#b8864a', '#6a4e2c', '#2a2016'));
    if (on) { ctx.save(); ctx.setLineDash([26, 60]); ctx.lineDashOffset = -now * 50; ctx.strokeStyle = 'rgba(160,230,255,0.6)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 59); ctx.lineTo(W, 59); ctx.stroke(); ctx.restore(); }
  }

  // ── West wing: admin block, visitor centre, staff car park, gatehouse ──
  // Admin block — a long roof with plant boxes and rows of solar panels.
  bldg(40, 100, 350, 200, roofA, roofB);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
    const sx = 64 + c * 52, sy = 122 + r * 50;
    const pg = ctx.createLinearGradient(sx, sy, sx + 46, sy + 44);
    pg.addColorStop(0, L('#3a64a0', '#16263e', '#161c26')); pg.addColorStop(1, L('#1e3a66', '#0c1626', '#10141c'));
    ctx.fillStyle = pg; ctx.fillRect(sx, sy, 46, 44);
    if (detail) { ctx.strokeStyle = L('rgba(120,170,230,0.5)', 'rgba(60,100,150,0.4)', 'rgba(50,60,70,0.4)'); ctx.lineWidth = 1;
      ctx.beginPath(); for (let k = 1; k < 4; k++) { ctx.moveTo(sx + k * 11.5, sy); ctx.lineTo(sx + k * 11.5, sy + 44); } for (let k = 1; k < 3; k++) { ctx.moveTo(sx, sy + k * 14.7); ctx.lineTo(sx + 46, sy + k * 14.7); } ctx.stroke(); }
  }
  if (detail) { const F = (s, x, y) => { ctx.fillStyle = L('#5a5e64', '#8a94a0', '#3a3c40'); ctx.font = `bold ${s}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('ADMINISTRATION', x, y); ctx.textAlign = 'left'; }; F(13, 215, 111); }
  // Visitor centre — a domed rotunda with radial ribs and a glowing oculus.
  const VX = 220, VY = 505;
  disc(VX + 12, VY + 15, 160, 'rgba(0,0,0,0.34)');
  sdisc(VX, VY, 156, L('#f0f2f4', '#646a74', '#2e3034'), L('#a8aeb6', '#2e323a', '#1a1c1e'));
  sdisc(VX, VY, 138, L('#cfe2f0', '#3a4a5c', '#1e2024'), L('#7e96aa', '#1c2632', '#141618'));   // glazed dome
  if (detail) {
    ctx.strokeStyle = L('rgba(90,100,112,0.8)', 'rgba(20,26,34,0.8)', 'rgba(20,20,20,0.7)'); ctx.lineWidth = 4;
    ctx.beginPath(); for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; ctx.moveTo(VX + Math.cos(a) * 46, VY + Math.sin(a) * 46); ctx.lineTo(VX + Math.cos(a) * 138, VY + Math.sin(a) * 138); } ctx.stroke();
    for (const r of [80, 112]) { ctx.beginPath(); ctx.arc(VX, VY, r, 0, Math.PI * 2); ctx.stroke(); }
  }
  disc(VX, VY, 46, L('#7ab8e0', '#1e3a5a', '#141a22'));
  if (on) { glowAt(VX, VY, 120, night ? '255,210,150' : '180,220,255', night ? 0.35 : 0.15); disc(VX, VY, 28 + 3 * Math.sin(now * 2), `rgba(${PLASMA},${(0.25 + 0.5 * shotK).toFixed(3)})`); }
  if (detail) { ctx.fillStyle = L('#3a4048', '#9aa4b0', '#3a3c40'); ctx.font = 'bold 20px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('VISITOR CENTRE', VX, VY + 186); ctx.textAlign = 'left'; }
  // Staff car park, planters between the rows.
  rect(30, 760, 380, 260, asphalt);
  if (detail) {
    const carCols = ['#c83a2e', '#2e6ab0', '#e8e8e8', '#3a8a4a', '#303438', '#e0a020', '#8a4ab0'];
    for (let r = 0; r < 3; r++) {
      const px0 = 44 + r * 124;
      for (let k = 0; k < 5; k++) {
        const py0 = 772 + k * 42;
        rect(px0, py0 + 38, 104, 2, line);
        if ((k * 5 + r * 3 + 1) % 7 < 5) { rect(px0 + 14, py0 + 8, 76, 26, carCols[(k * 3 + r) % carCols.length]); rect(px0 + 62, py0 + 11, 20, 20, 'rgba(20,30,40,0.55)'); }
      }
      if (r < 2) for (let k = 0; k < 3; k++) disc(px0 + 114, 800 + k * 84, 9, L('#3a8a4a', '#1a3a22', '#141a16'));
    }
  }
  // Gatehouse with a striped barrier, flagpoles.
  bldg(300, roadY0 - 78, 70, 56, L('#d4ccbc', '#4e4c48', '#26262a'), L('#a49c8c', '#2e2c2a', '#1a1a1c')); rect(296, roadY0 - 84, 78, 12, L('#7a3a2a', '#3a1c14', '#1c1210'));
  rect(190, roadY0 - 36, 100, 7, '#e8c020'); rect(190, roadY0 - 36, 34, 7, '#c83020'); rect(224, roadY0 - 36, 34, 7, '#e8e8e8');
  for (const fx2 of [60, 84, 108]) { rect(fx2, roadY0 - 90, 3, 60, L('#c8ccd0', '#5a5e64', '#2a2c30')); rect(fx2 + 3, roadY0 - 90, 20, 12, ['#c83a2e', '#2e6ab0', '#e0a020'][(fx2 / 24) % 3 | 0]); }

  // ── East wing ──
  const ex = cx1 + 20, ew = W - ex - 20;
  // Neutral-beam injector: a long low hall with ion-source caps and a beam pipe
  // running west into the tokamak.
  bldg(ex, 80, ew, 120, roofA, roofB);
  for (let k = 0; k < 4; k++) {
    const bx = ex + 44 + k * ((ew - 88) / 3);
    sdisc(bx, 140, 26, L('#8a929c', '#343a42', '#1c1e20'), L('#3a4048', '#14171c', '#101214'));
    disc(bx, 140, 18, on ? `rgba(${PLASMA},${(0.25 + 0.6 * shotK).toFixed(3)})` : '#1a1c1e');
    if (on && shotK > 0.05) glowAt(bx, 140, 40, PLASMA, 0.35 * shotK);
  }
  rect(ex - 20, 136, 22, 8, L('#7a828a', '#3a4048', '#22252a'));
  if (on && detail) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(${PLASMA},${(0.15 + 0.7 * shotK).toFixed(3)})`; ctx.lineWidth = 3; ctx.setLineDash([16, 22]); ctx.lineDashOffset = -now * 200; ctx.beginPath(); ctx.moveTo(ex + ew - 30, 140); ctx.lineTo(cx1 - 60, 140); ctx.stroke(); ctx.restore(); }
  if (detail) { ctx.fillStyle = L('#4a5058', '#9aa4b0', '#3a3c40'); ctx.font = 'bold 16px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('NEUTRAL BEAM INJECTORS', ex + ew / 2, 186); ctx.textAlign = 'left'; }
  // Gyrotron hall: two rows of tall RF sources.
  bldg(ex, 250, ew, 190, L('#c8ced4', '#444a52', '#24262a'), L('#949ba3', '#262a30', '#18191c'));
  for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) {
    const gx = ex + 40 + k * ((ew - 80) / 5), gy = 300 + r * 80;
    sdisc(gx, gy, 24, L('#9aa2ac', '#3a4048', '#1e2022'), L('#4a525a', '#181b20', '#121416')); disc(gx, gy, 16, L('#2a2e34', '#101216', '#0c0d0e'));
    if (on) { disc(gx, gy, 9, `rgba(${PLASMA},${(0.3 + 0.65 * shotK).toFixed(3)})`); if (shotK > 0.05) glowAt(gx, gy, 46, PLASMA, 0.4 * shotK); }
  }
  if (detail) { ctx.fillStyle = L('#4a5058', '#9aa4b0', '#3a3c40'); ctx.font = 'bold 16px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('GYROTRON HALL', ex + ew / 2, 430); ctx.textAlign = 'left'; }
  // Capacitor bank.
  rect(ex + 2, 470, 10 * 38 + 6, 2 * 46 + 2, L('#5a6068', '#1c2026', '#121416'));   // the bank's plinth
  for (let r = 0; r < 2; r++) for (let c = 0; c < 10; c++) {
    const cg = ctx.createLinearGradient(ex + 8 + c * 38, 476 + r * 46, ex + 38 + c * 38, 514 + r * 46);
    cg.addColorStop(0, L('#9aa2aa', '#3a4048', '#22252a')); cg.addColorStop(1, L('#5a6068', '#22262c', '#16181a'));
    ctx.fillStyle = cg; ctx.fillRect(ex + 8 + c * 38, 476 + r * 46, 30, 38);
    rect(ex + 8 + c * 38, 476 + r * 46, 30, 6, L('#e0b040', '#7a5e20', '#2a2210'));
    if (on && detail) rect(ex + 14 + c * 38, 500 + r * 46, 18, 8, `rgba(122,224,255,${(0.2 + 0.7 * ((Math.sin(now * 2 + c) + 1) / 2) * (0.4 + shotK)).toFixed(3)})`);
  }
  // Cooling towers with steam.
  for (const [tx, ty, tr] of [[ex + 100, 700, 80], [ex + 270, 760, 80]]) {
    disc(tx + 12, ty + 15, tr + 3, 'rgba(0,0,0,0.34)');
    sdisc(tx, ty, tr, L('#e4e8ec', '#5e646c', '#2c2e32'), L('#9aa0a8', '#2c3036', '#18191c'));
    sdisc(tx, ty, tr - 16, L('#2a3440', '#10141a', '#0c0d0f'), L('#3e4c5a', '#182028', '#121416'));   // the throat, lit from inside its far wall
    if (detail) { ctx.strokeStyle = L('rgba(120,130,140,0.6)', 'rgba(60,66,74,0.6)', 'rgba(40,40,40,0.5)'); ctx.lineWidth = 2; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(tx + Math.cos(a) * (tr - 16), ty + Math.sin(a) * (tr - 16)); ctx.lineTo(tx + Math.cos(a) * tr, ty + Math.sin(a) * tr); ctx.stroke(); } }
    if (on) for (let k = 0; k < 6; k++) {                                       // soft billows, lit upper left
      const u = (now * 0.24 + k / 6 + tx * 0.001) % 1;
      const bx = tx + u * 44, by = ty - u * 52, br = 26 + u * 48, a = 0.55 * Math.min(1, u * 6) * (1 - u);
      if (a <= 0.01) continue;
      const g = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.35, br * 0.1, bx, by, br);
      g.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`);
      g.addColorStop(0.6, `rgba(214,222,232,${(a * 0.75).toFixed(3)})`);
      g.addColorStop(1, 'rgba(190,200,212,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Tritium / lithium tank farm: six spheres joined by pipes.
  const tanks = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) tanks.push([ex + 60 + c * 118, 880 + r * 104]);
  if (detail) { ctx.strokeStyle = L('#8a929c', '#3e444e', '#22252a'); ctx.lineWidth = 5; ctx.beginPath(); for (let r = 0; r < 2; r++) { ctx.moveTo(tanks[r * 3][0], tanks[r * 3][1]); ctx.lineTo(tanks[r * 3 + 2][0], tanks[r * 3 + 2][1]); } for (let c = 0; c < 3; c++) { ctx.moveTo(tanks[c][0], tanks[c][1]); ctx.lineTo(tanks[c + 3][0], tanks[c + 3][1]); } ctx.stroke(); }
  for (const [tx, ty] of tanks) {
    disc(tx + 6, ty + 8, 42, 'rgba(0,0,0,0.3)');
    const tg = ctx.createRadialGradient(tx - 12, ty - 12, 4, tx, ty, 42);
    tg.addColorStop(0, L('#f0f2f4', '#7a8088', '#3a3c40')); tg.addColorStop(1, L('#9aa0a8', '#3a4048', '#1e2024'));
    ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(tx, ty, 40, 0, Math.PI * 2); ctx.fill();
    if (detail) { ctx.strokeStyle = L('rgba(80,86,94,0.6)', 'rgba(20,24,30,0.6)', 'rgba(10,10,10,0.5)'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(tx, ty, 26, 0, Math.PI * 2); ctx.stroke(); }
    if (on) disc(tx + 22, ty - 22, 4, ((Math.floor(now * 1.5) + tx) % 3 === 0) ? '#ff5040' : '#3a8a4a');
  }
  // Transformer yard at the foot, with cables up to the plant.
  for (let c = 0; c < 4; c++) {
    const tx = ex + 10 + c * 100, ty = 1040;
    bldg(tx, ty, 76, 58, L('#9aa2aa', '#3a4048', '#202226'), L('#6a7078', '#22262c', '#16181a'), L('#5a6068', '#1e2228', '#141518'));
    if (detail) for (let k = 0; k < 7; k++) rect(tx + 6 + k * 10, ty + 8, 5, 42, L('#a0a6ac', '#42464c', '#24262a'));
    if (on && night) glowAt(tx + 38, ty + 30, 60, '255,190,90', 0.12);
  }
  if (on && detail) { ctx.save(); ctx.setLineDash([14, 30]); ctx.lineDashOffset = -now * (60 + 160 * shotK); ctx.strokeStyle = `rgba(160,230,255,${(0.35 + 0.4 * shotK).toFixed(3)})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(ex + 40, 1040); ctx.lineTo(ex + 40, 560); ctx.moveTo(ex + 340, 1040); ctx.lineTo(ex + 340, 560); ctx.lineTo(ex + 40, 560); ctx.stroke(); ctx.restore(); }

  // Trucks and a shuttle on the road.
  if (detail) for (let k = 0; k < 3; k++) {
    const dir = k % 2 ? 1 : -1, u = (now * (0.012 + k * 0.004) + k * 0.33) % 1;
    const vx = dir > 0 ? -50 + u * (W + 100) : W + 50 - u * (W + 100), vy = dir > 0 ? roadY1 - 14 : roadY0 + 14;
    ctx.fillStyle = ['#e8e8e8', '#2a5ab0', '#c8a020'][k]; ctx.beginPath(); ctx.roundRect(vx - 24, vy - 10, 48, 20, 5); ctx.fill();
    rect(vx + dir * 14 - 4, vy - 7, 8, 14, 'rgba(20,30,40,0.7)');
    if (night) glowAt(vx + dir * 30, vy, 34, '255,244,200', 0.4);
  }
  // Floodlights at night; the whole site catches the pink of a shot.
  if (on && night) for (const [lx, ly] of [[100, 740], [340, 740], [ex + 30, 460], [W - 90, 460], [ex + 40, 1010], [W - 90, 1010], [110, 330], [W / 2 - 200, 40]]) glowAt(lx, ly, 150, '255,244,200', 0.2);
  if (shotK > 0.05) glowAt(ex + ew / 2, 380, 520, PLASMA, 0.16 * shotK);
}

// Where the tokamak's vessel sits in world pixels — the campus art's
// (255, 235), radius ~150, through renderFusionLab's scale and centring.
// The breakthrough scene (FusionResearch) aims its light here.
function fusionTokamakWorld(e) {
  const AW = 800, AH = 640;
  const W = (e.width || EntityDefs[T.FUSIONLAB].width) * TILE, H = (e.height || EntityDefs[T.FUSIONLAB].height) * TILE;
  const CK = Math.min(0.85 * H / (AH*TILE/40), 0.9 * W / (AW*TILE/40)), s = CK * TILE / 40;
  const OFFX = (W - AW*s) / 2, OFFY = (H - AH*s) / 2;
  return { x: e.col * TILE + OFFX + 255 * s, y: e.row * TILE + OFFY + 235 * s, r: 150 * s };
}

function renderFusionLab(e, px, py, t) {
  const AW = 800, AH = 640;
  const W = (e.width || EntityDefs[T.FUSIONLAB].width) * TILE, H = (e.height || EntityDefs[T.FUSIONLAB].height) * TILE;
  // The tokamak campus is authored 800×640. The footprint is bigger than that
  // and a different shape, so it is drawn at one uniform scale and centred,
  // with the rest of the site (car park, cooling, transformer yard) as wings.
  // Drawn at 85% of full height so there is room round it for the site.
  const CK = Math.min(0.85 * H / (AH*TILE/40), 0.9 * W / (AW*TILE/40));
  const OFFX = (W - AW*(TILE/40)*CK) / 2, OFFY = (H - AH*(TILE/40)*CK) / 2;
  ctx.save();
  ctx.translate(px, py);
  {
    const _fr = typeof FusionResearch !== 'undefined' ? FusionResearch.visual(e) : null;
    const _lift = e.powered && _fr ? Math.max(_fr.k, _fr.ignited ? 0.6 : 0) : 0;
    const _shot = DemandCurves.fusionShot(DayNight.hour());
    const _shotK = Math.max(e.powered && _shot.firing ? Math.sin(Math.min(1, _shot.ph / 0.15) * Math.PI) : 0, _lift);
    _fusionCampusSite(e, W, H, OFFX, OFFY, CK * (TILE/40), t, _shotK);
  }
  ctx.translate(OFFX, OFFY);
  ctx.scale(CK, CK);
  const K = _nKit(0, 0), { S, X, Y, R, RR, dot, ell, poly, ln, text, glow } = K;
  const on = e.powered, hr = DayNight.hour(), dark = DayNight.darkness();
  const night = dark > 0.3;
  const detail = Camera.zoom > 0.3;
  const L = (d, n, o) => on ? (night ? n : d) : o;
  // Fusion research (FusionResearch): a progress ring while it runs, and
  // once fusion is achieved the machine burns continuously. `lift` is that
  // settled burn, or the breakthrough scene's intensity while it plays.
  const FR = typeof FusionResearch !== 'undefined' ? FusionResearch.visual(e) : null;
  const sceneK = FR ? FR.k : 0;
  const lift = on && FR ? Math.max(sceneK, FR.ignited ? 0.6 : 0) : 0;
  const burn = lift > 0;
  if (sceneK > 0) t = performance.now() / 1000;   // the sim clock is paused during the scene; keep the plasma moving
  const shot = DemandCurves.fusionShot(hr);
  const firing = on && shot.firing, spinUp = on && shot.spinUp;
  const shotK = Math.max(firing ? Math.sin(Math.min(1, shot.ph / 0.15) * Math.PI) : 0, lift);   // 0 → 1 → 0 across the shot
  const PLASMA = '255,120,220';
  // Shot results, milestones and outages (FusionResearch fx) play on the
  // real clock so they still read at high game speed.
  const now = performance.now() / 1000;
  const fx = FR && !FR.scene ? FR.fx : null, fxAge = fx ? now - fx.at : 99;
  const fxK = (kind, dur) => fx && fx.kind === kind && fxAge < dur ? 1 - fxAge / dur : 0;
  // Only the failures play on a dark campus.
  const goodK = on ? Math.max(fxK('good', 2.4), fxK('milestone', 2.4)) : 0, mileK = on ? fxK('milestone', 5) : 0;
  const abortK = Math.max(fxK('abort', 2.6), fxK('outage', 3)), bonusK = on ? fxK('bonus', 2.4) : 0;
  ctx.beginPath(); ctx.rect(0, 0, AW*S, AH*S); ctx.clip();

  // ── Campus ground, fence, front road ──
  R(0, 0, AW, AH, L('#8a8c84', '#24262a', '#18191a'));
  if (detail) {
    // Paved plaza: a large-format slab grid, planted verges along the fence,
    // and a lit walkway from the control centre up to the hall.
    ctx.strokeStyle = L('rgba(60,62,58,0.22)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.25)'); ctx.lineWidth = 1 * S;
    ctx.beginPath();
    for (let x = 20; x < AW; x += 40) { ctx.moveTo(X(x), Y(10)); ctx.lineTo(X(x), Y(590)); }
    for (let y = 20; y < 596; y += 40) { ctx.moveTo(X(10), Y(y)); ctx.lineTo(X(AW - 10), Y(y)); }
    ctx.stroke();
    R(12, 12, AW - 24, 10, L('#5e7a4a', '#1c2a1a', '#141814'));
    R(12, 576, AW - 24, 12, L('#5e7a4a', '#1c2a1a', '#141814'));
    for (let x = 30; x < AW - 20; x += 46) dot(x, 582, 7, L('#3e6a3a', '#142416', '#101410'));
    R(244, 425, 22, 18, L('#b8bcc0', '#3a3e44', '#1e2022'));
    if (on) for (let k = 0; k < 3; k++) dot(255, 428 + k * 6, 1.6, night ? 'rgba(140,235,255,0.95)' : 'rgba(120,200,230,0.7)');
  }
  R(0, 596, AW, 44, L('#4a4c50', '#1e2024', '#141517'));
  if (detail) {
    for (let x = 10; x < AW; x += 30) R(x, 617, 15, 2, L('rgba(255,255,255,0.8)', 'rgba(255,255,255,0.35)', 'rgba(100,100,100,0.4)'));
    ctx.strokeStyle = L('rgba(210,215,220,0.7)', 'rgba(120,130,140,0.4)', 'rgba(60,60,60,0.5)'); ctx.lineWidth = 1.2 * S;
    ctx.strokeRect(X(8), Y(8), (AW - 16) * S, 580 * S);
  }

  // ── Reactor hall: a round concrete drum, its roof cut away over the machine ──
  // HR is the drum's radius; HX0..HY1 its bounding box (the roof beacon and
  // the searchlights below key off it).
  const TX = 255, TY = 235, HR = 200;
  const HX0 = TX - HR, HY0 = TY - HR, HX1 = TX + HR, HY1 = TY + HR;
  const TAU = Math.PI * 2;
  // A disc lit from the upper left: the house style for every steel shape here.
  const shade = (x, y, r, c0, c1) => {
    const g = ctx.createRadialGradient(X(x - r * 0.35), Y(y - r * 0.4), r * 0.08 * S, X(x), Y(y), r * S);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(x), Y(y), r * S, 0, TAU); ctx.fill();
  };
  const circ = (r, w, c, dash) => {
    ctx.strokeStyle = c; ctx.lineWidth = w * S; if (dash) ctx.setLineDash(dash.map(d => d * S));
    ctx.beginPath(); ctx.arc(X(TX), Y(TY), r * S, 0, TAU); ctx.stroke(); if (dash) ctx.setLineDash([]);
  };
  dot(TX + 12, TY + 15, HR + 6, 'rgba(0,0,0,0.38)');                                    // the drum's shadow
  shade(TX, TY, HR, L('#eef0f2', '#646a74', '#2e3034'), L('#9ea4ac', '#2c3038', '#18191c'));
  if (detail) {                                                                          // 32 buttresses round the wall
    ctx.strokeStyle = L('rgba(110,118,128,0.7)', 'rgba(18,22,28,0.8)', 'rgba(10,10,10,0.6)'); ctx.lineWidth = 3 * S;
    ctx.beginPath();
    for (let k = 0; k < 32; k++) { const a = k / 32 * TAU; ctx.moveTo(X(TX + Math.cos(a) * (HR - 15)), Y(TY + Math.sin(a) * (HR - 15))); ctx.lineTo(X(TX + Math.cos(a) * (HR + 1)), Y(TY + Math.sin(a) * (HR + 1))); }
    ctx.stroke();
  }
  // The hall floor through the cut-away: dark plate with a faint survey grid.
  dot(TX, TY, HR - 16, L('#1c2028', '#0a0c12', '#08090b'));
  if (detail) {
    ctx.strokeStyle = on ? (night ? 'rgba(90,200,255,0.16)' : 'rgba(90,170,220,0.12)') : 'rgba(60,60,60,0.12)'; ctx.lineWidth = 1 * S;
    ctx.beginPath();
    for (let r = 40; r < HR - 16; r += 22) { ctx.moveTo(X(TX + r), Y(TY)); ctx.arc(X(TX), Y(TY), r * S, 0, TAU); }
    for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; ctx.moveTo(X(TX), Y(TY)); ctx.lineTo(X(TX + Math.cos(a) * (HR - 16)), Y(TY + Math.sin(a) * (HR - 16))); }
    ctx.stroke();
  }
  if (on) glow(TX, TY, 200, PLASMA, (night ? 0.2 : 0.09) + shotK * 0.35);
  if (burn) glow(TX, TY, 300 + 90 * sceneK, PLASMA, 0.18 * lift + 0.35 * sceneK);
  // Equatorial ports: twelve plugs radiating out of the cryostat, a third of
  // them carrying diagnostics that blink while the machine is live.
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * TAU + 0.13;
    ctx.save(); ctx.translate(X(TX), Y(TY)); ctx.rotate(a);
    ctx.fillStyle = L('#7c848e', '#30353d', '#1a1c20'); ctx.fillRect(168 * S, -10 * S, 22 * S, 20 * S);
    ctx.fillStyle = L('#a6aeb8', '#454b55', '#24262a'); ctx.fillRect(168 * S, -10 * S, 22 * S, 3 * S);
    ctx.fillStyle = L('#5a626c', '#22262c', '#121416'); ctx.fillRect(186 * S, -12 * S, 6 * S, 24 * S);
    if (on && k % 3 === 0) { ctx.fillStyle = `rgba(120,230,255,${(0.45 + 0.4 * Math.sin(t * 3 + k)).toFixed(3)})`; ctx.fillRect(176 * S, -4 * S, 8 * S, 8 * S); }
    ctx.restore();
  }
  // Cryostat: the steel can round the whole machine, bolted at its flange.
  shade(TX, TY, 176, L('#d8dee6', '#5a626e', '#2a2c30'), L('#7a828e', '#262a32', '#151618'));
  if (detail) for (let k = 0; k < 48; k++) { const a = k / 48 * TAU; dot(TX + Math.cos(a) * 170, TY + Math.sin(a) * 170, 1.8, L('#5a626c', '#14171c', '#0e0f10')); }
  circ(162, 2, L('rgba(60,66,76,0.8)', 'rgba(8,10,14,0.8)', 'rgba(0,0,0,0.6)'));
  // Vacuum vessel: the dark chamber the plasma burns in, and its inner wall.
  dot(TX, TY, 154, L('#2e343e', '#10141a', '#0c0d10'));
  dot(TX, TY, 66, L('#4a525e', '#1c2028', '#141518'));
  // plasma ring inside the vessel
  {
    const a = on ? (0.25 + (night ? 0.15 : 0) + shotK * 0.75) : 0;
    const g = ctx.createRadialGradient(X(TX), Y(TY), 72 * S, X(TX), Y(TY), 146 * S);
    g.addColorStop(0, `rgba(${PLASMA},0)`);
    g.addColorStop(0.5, `rgba(255,${Math.round(150 + 90 * shotK)},${Math.round(230 + 25 * shotK)},${a.toFixed(3)})`);
    g.addColorStop(1, `rgba(${PLASMA},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(TX), Y(TY), 146 * S, 0, Math.PI * 2); ctx.arc(X(TX), Y(TY), 72 * S, 0, Math.PI * 2, true); ctx.fill();
    // The magnetic field's twist made visible: two bright strands winding
    // helically round the torus, and a ring of light at the divertor where
    // the exhaust strikes the inner wall. Faint while idle, blazing on a shot.
    if (on && detail) {
      const hk = 0.18 + (night ? 0.1 : 0) + 0.82 * shotK;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (let s = 0; s < 2; s++) {
        ctx.strokeStyle = `rgba(255,${Math.round(170 + 80 * shotK)},245,${(0.55 * hk).toFixed(3)})`;
        ctx.lineWidth = (2.2 + 1.6 * shotK) * S;
        ctx.beginPath();
        for (let i = 0; i <= 180; i++) {
          const th = i / 180 * TAU;
          const r = 109 + 26 * Math.sin(th * 9 + t * (1.2 + 3.5 * shotK) + s * Math.PI);
          const x = X(TX + Math.cos(th) * r), y = Y(TY + Math.sin(th) * r);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(160,235,255,${(0.35 * hk + 0.15).toFixed(3)})`; ctx.lineWidth = 3 * S;
      ctx.beginPath(); ctx.arc(X(TX), Y(TY), 74 * S, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    if ((firing || burn) && detail) {                                                   // field lines racing round
      ctx.strokeStyle = `rgba(255,230,255,${(0.6 * shotK).toFixed(3)})`; ctx.lineWidth = 1.2 * S;
      for (let k = 0; k < 6; k++) {
        const a0 = t * 3 + k * 1.047, r = 90 + k * 9;
        ctx.beginPath(); ctx.arc(X(TX), Y(TY), r * S, a0, a0 + 1.2); ctx.stroke();
      }
    }
  }
  // Researching shots crackle with lightning inside the vessel — more of it
  // with every milestone passed.
  const zap = (n, r0, r1, col, w) => {
    ctx.strokeStyle = col; ctx.lineWidth = w * S; ctx.lineCap = 'round';
    for (let k = 0; k < n; k++) {
      let a = Math.random() * Math.PI * 2, r = r0;
      ctx.beginPath(); ctx.moveTo(X(TX + Math.cos(a) * r), Y(TY + Math.sin(a) * r));
      while (r < r1) { a += (Math.random() - 0.5) * 0.35; r += 6 + Math.random() * 10; ctx.lineTo(X(TX + Math.cos(a) * r), Y(TY + Math.sin(a) * r)); }
      ctx.stroke();
    }
  };
  if (firing && FR && FR.researching && detail) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = 'rgba(255,120,230,1)'; ctx.shadowBlur = 10 * S;
    zap(Math.round((2 + FR.stage * 2) * shotK), 76, 140, `rgba(255,220,255,${(0.5 + 0.5 * shotK).toFixed(3)})`, 1.4);
    ctx.restore();
  }
  // A good shot: the vessel flashes white-hot as the data lands.
  if (goodK > 0) { glow(TX, TY, 200, '255,255,255', 0.55 * goodK * goodK); glow(TX, TY, 150, '120,230,255', 0.5 * goodK); }
  // An aborted shot (or a power cut this close to ignition): the plasma
  // gutters out in red, the vessel spitting sparks.
  if (abortK > 0) {
    const fl = abortK * (0.45 + 0.55 * Math.random());
    glow(TX, TY, 190, '255,60,30', 0.55 * fl);
    if (detail) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = 'rgba(255,60,30,1)'; ctx.shadowBlur = 8 * S;
      zap(Math.ceil(5 * abortK), 90, 170 + 40 * (1 - abortK), `rgba(255,${120 + Math.round(80 * Math.random())},60,${abortK.toFixed(3)})`, 1.6);
      ctx.restore();
    }
  }
  // 18 toroidal field coils, D-shaped from above: tapered copper windings in
  // a steel case, narrow at the solenoid and broad at the outer leg, with
  // the plasma glowing in the gaps between them.
  {
    const cuA = L('#e8b878', '#9a7444', '#3a2c1c'), cuB = L('#9a6630', '#4e3820', '#20180e');
    const caseC = L('#5c646e', '#1e2228', '#121416');
    for (let k = 0; k < 18; k++) {
      const a = k / 18 * TAU;
      ctx.save(); ctx.translate(X(TX), Y(TY)); ctx.rotate(a);
      const g = ctx.createLinearGradient(0, -8 * S, 0, 8 * S);
      g.addColorStop(0, cuA); g.addColorStop(1, cuB);
      ctx.beginPath();
      ctx.moveTo(56 * S, -4 * S); ctx.lineTo(160 * S, -8 * S);
      ctx.quadraticCurveTo(171 * S, 0, 160 * S, 8 * S);
      ctx.lineTo(56 * S, 4 * S); ctx.closePath();
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = caseC; ctx.lineWidth = 1.6 * S; ctx.stroke();
      if (detail) { ctx.strokeStyle = 'rgba(255,240,210,0.35)'; ctx.lineWidth = 0.8 * S; ctx.beginPath(); ctx.moveTo(60 * S, -2.6 * S); ctx.lineTo(158 * S, -5.6 * S); ctx.stroke(); }
      ctx.restore();
    }
  }
  // Poloidal field coils (the outer and inner rings) and the central solenoid,
  // a stack of six copper modules with a cold blue core.
  circ(178, 5, L('#6c747e', '#2a2f36', '#1a1c20'));
  circ(178, 1.5, L('rgba(220,226,232,0.5)', 'rgba(110,120,130,0.4)', 'rgba(60,60,60,0.3)'));
  circ(46, 4, L('#6c747e', '#2a2f36', '#1a1c20'));
  shade(TX, TY, 38, L('#4a525c', '#1c2026', '#121416'), L('#2a2e34', '#0e1014', '#0a0b0c'));
  shade(TX, TY, 30, L('#e0aa68', '#8a6438', '#2e2216'), L('#9a6630', '#4a3420', '#1c140c'));
  if (detail) for (let k = 1; k < 6; k++) circ(k * 5, 1, L('rgba(70,40,14,0.55)', 'rgba(16,10,4,0.6)', 'rgba(0,0,0,0.4)'));
  if (on) { dot(TX, TY, 7, `rgba(150,235,255,${(0.6 + 0.3 * Math.sin(t * 2.4)).toFixed(3)})`); glow(TX, TY, 26, '140,230,255', 0.5); }
  // Research progress: a holographic ring round the vessel, filling as the
  // programme runs, pulsing magenta in the last hour before ignition.
  if (on && FR && FR.researching) {
    const pr = 182, a0 = -Math.PI / 2, pct = FR.pct;
    const pulse = FR.imminent ? 0.5 + 0.5 * Math.sin(t * 8) : 1;
    const col = FR.imminent ? `rgba(255,120,220,${(0.55 + 0.45 * pulse).toFixed(3)})` : 'rgba(255,200,80,0.9)';
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(20,40,60,0.8)'; ctx.lineWidth = 12 * S;
    ctx.beginPath(); ctx.arc(X(TX), Y(TY), pr * S, 0, Math.PI * 2); ctx.stroke();
    ctx.save();
    ctx.shadowColor = FR.imminent ? 'rgba(255,90,220,1)' : 'rgba(255,180,50,1)'; ctx.shadowBlur = 20 * S;
    ctx.strokeStyle = col; ctx.lineWidth = 9 * S;
    ctx.beginPath(); ctx.arc(X(TX), Y(TY), pr * S, a0, a0 + pct * Math.PI * 2); ctx.stroke();
    if (goodK > 0) {                                                                    // the ring flares as each good shot lands
      ctx.shadowColor = 'rgba(255,255,255,1)'; ctx.shadowBlur = 30 * S * goodK;
      ctx.strokeStyle = `rgba(255,255,255,${goodK.toFixed(3)})`; ctx.lineWidth = (9 + 8 * goodK) * S;
      ctx.beginPath(); ctx.arc(X(TX), Y(TY), pr * S, a0, a0 + pct * Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    if (detail) {
      ctx.strokeStyle = 'rgba(255,220,140,0.55)'; ctx.lineWidth = 1.2 * S;
      for (let k = 0; k < 40; k++) {
        const a = a0 + k / 40 * Math.PI * 2, r0 = k % 4 ? 188 : 186;
        ctx.beginPath(); ctx.moveTo(X(TX + Math.cos(a) * r0), Y(TY + Math.sin(a) * r0)); ctx.lineTo(X(TX + Math.cos(a) * 193), Y(TY + Math.sin(a) * 193)); ctx.stroke();
      }
      // Milestones passed (25/50/75%) light up as beacons on the ring.
      for (let m = 0; m < 3; m++) {
        const ma = a0 + (m + 1) / 4 * Math.PI * 2, lit = m < FR.stage;
        dot(TX + Math.cos(ma) * pr, TY + Math.sin(ma) * pr, lit ? 8 : 5, lit ? '#ffe0fa' : 'rgba(40,70,90,0.9)');
        if (lit) glow(TX + Math.cos(ma) * pr, TY + Math.sin(ma) * pr, 30, PLASMA, 0.5);
      }
      const ha = a0 + pct * Math.PI * 2;
      dot(TX + Math.cos(ha) * pr, TY + Math.sin(ha) * pr, 5, '#ffffff');
      glow(TX + Math.cos(ha) * pr, TY + Math.sin(ha) * pr, 22, FR.imminent ? PLASMA : '255,200,80', 0.6);
    }
  }
  // After fusion: a gold ring round the vessel fills as the facility's
  // experiments trim the rest of the fusion chain (FusionResearch.goalScale).
  if (on && FR && FR.ignited && !FR.scene && FR.bonusShots > 0) {
    const pr = 184, a0 = -Math.PI / 2, u = FR.bonusShots / FR.bonusMax;
    ctx.save(); ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(255,200,80,1)'; ctx.shadowBlur = (14 + 26 * bonusK) * S;
    ctx.strokeStyle = `rgba(255,${Math.round(200 + 55 * bonusK)},${Math.round(90 + 165 * bonusK)},0.9)`; ctx.lineWidth = (5 + 5 * bonusK) * S;
    ctx.beginPath(); ctx.arc(X(TX), Y(TY), pr * S, a0, a0 + u * Math.PI * 2); ctx.stroke();
    ctx.restore();
    if (detail) for (let k = 0; k < FR.bonusShots; k++) {
      const a = a0 + (k + 0.5) / FR.bonusMax * Math.PI * 2;
      dot(TX + Math.cos(a) * 196, TY + Math.sin(a) * 196, 2.4, '#ffe6a0');
    }
  }
  // During the breakthrough: arcs crackling off the vessel.
  if (sceneK > 0.15 && detail) {
    ctx.strokeStyle = `rgba(255,220,250,${Math.min(1, sceneK).toFixed(3)})`; ctx.lineWidth = 1.6 * S;
    const n = 3 + Math.floor(sceneK * 6);
    for (let k = 0; k < n; k++) {
      let a = Math.random() * Math.PI * 2, r = 150;
      ctx.beginPath(); ctx.moveTo(X(TX + Math.cos(a) * r), Y(TY + Math.sin(a) * r));
      for (let j = 0; j < 5; j++) { a += (Math.random() - 0.5) * 0.25; r += 8 + Math.random() * 10; ctx.lineTo(X(TX + Math.cos(a) * r), Y(TY + Math.sin(a) * r)); }
      ctx.stroke();
    }
  }
  // neutral-beam injectors, tangential into the vessel
  for (const [bx, by, a] of [[420, 120, 2.5], [420, 360, -2.5]]) {
    ctx.save(); ctx.translate(X(bx), Y(by)); ctx.rotate(a);
    ctx.fillStyle = L('#7a828c', '#343a42', '#1e2024'); ctx.beginPath(); ctx.roundRect(-10 * S, -14 * S, 90 * S, 28 * S, 4 * S); ctx.fill();
    ctx.fillStyle = L('#5a626c', '#262a30', '#16181a'); ctx.fillRect(80 * S, -6 * S, 30 * S, 12 * S);
    if (firing || burn) { ctx.fillStyle = `rgba(160,220,255,${(0.7 * shotK).toFixed(3)})`; ctx.fillRect(110 * S, -3 * S, 60 * S, 6 * S); }
    ctx.restore();
  }
  // ── Over the machine ──
  // The glass of the cut-away roof catching the light: a soft band sweeping
  // slowly across the opening.
  if (detail) {
    ctx.save();
    ctx.beginPath(); ctx.arc(X(TX), Y(TY), (HR - 16) * S, 0, TAU); ctx.clip();
    const sw = ((t * 0.04) % 1.6) - 0.3;
    const gx = TX - HR + sw * HR * 2;
    const g = ctx.createLinearGradient(X(gx - 60), Y(TY - HR), X(gx + 60), Y(TY + HR));
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(220,240,255,${night ? 0.05 : 0.12})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(X(TX - HR), Y(TY - HR), HR * 2 * S, HR * 2 * S);
    ctx.restore();
  }
  // The polar crane: a bridge spanning the hall on a ring rail, turning
  // slowly round the machine, its trolley shuttling along it.
  circ(HR - 20, 3, L('#b0b6be', '#3c424a', '#1e2024'));
  if (detail) {
    const ca = on ? t * 0.035 : 0.6;
    ctx.save(); ctx.translate(X(TX), Y(TY)); ctx.rotate(ca);
    ctx.globalAlpha *= 0.92;
    ctx.fillStyle = L('#e0b030', '#7a6420', '#3a3018');
    ctx.fillRect(-(HR - 20) * S, -6 * S, (HR - 20) * 2 * S, 12 * S);
    ctx.fillStyle = L('rgba(40,30,10,0.55)', 'rgba(10,8,4,0.6)', 'rgba(0,0,0,0.5)');
    for (let x = -(HR - 26); x < HR - 26; x += 14) ctx.fillRect(x * S, -6 * S, 2 * S, 12 * S);
    const tr = Math.sin(t * 0.21) * (HR - 60);
    ctx.fillStyle = L('#3a4048', '#16191e', '#101214'); ctx.fillRect((tr - 12) * S, -10 * S, 24 * S, 20 * S);
    if (on) { ctx.fillStyle = Math.sin(t * 4) > 0 ? '#ffb020' : '#5a3a10'; ctx.fillRect((tr - 3) * S, -3 * S, 6 * S, 6 * S); }
    ctx.restore();
  }
  // A holographic readout ring turning slowly over the drum's rim.
  if (on && detail) {
    ctx.save(); ctx.translate(X(TX), Y(TY)); ctx.rotate(-t * 0.08);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = burn ? 'rgba(255,150,230,0.5)' : 'rgba(110,225,255,0.45)'; ctx.lineWidth = 2.4 * S;
    for (let k = 0; k < 24; k++) {
      if (k % 6 === 5) continue;
      const a = k / 24 * TAU;
      ctx.beginPath(); ctx.arc(0, 0, (HR - 7) * S, a, a + TAU / 24 * 0.7); ctx.stroke();
    }
    ctx.restore();
  }
  // The drum's rim, outlined in light at night and while it burns.
  circ(HR - 16, 2.4, L('#f2f4f6', '#6a7078', '#2e3034'));
  if (on && (night || burn)) {
    ctx.save();
    ctx.shadowColor = burn ? 'rgba(255,90,220,1)' : 'rgba(90,210,255,1)'; ctx.shadowBlur = 14 * S;
    circ(HR - 1, 1.8, burn ? `rgba(255,140,230,${(0.55 + 0.35 * lift).toFixed(3)})` : 'rgba(110,220,255,0.6)');
    ctx.restore();
  }
  if (detail) {                                                                          // nameplate on the drum's south face
    RR(TX - 52, TY + HR - 14, 104, 14, 2, L('#2a3038', '#0e1218', '#121416'));
    text('TOKAMAK  HALL', TX, TY + HR - 7, 8.5, on ? (burn ? '#ffc0f0' : '#8af0ff') : '#3a3c40', 'Arial, sans-serif');
  }

  // One building in the campus style: a cast shadow, walls, a roof shaded
  // from the upper left with lit and shadowed edges, and a strip of cyan
  // light along its south face while the lab is live.
  const bldg = (x, y, w, h, roofA, roofB, wall) => {
    R(x + 7, y + 9, w, h, 'rgba(0,0,0,0.34)');
    RR(x, y, w, h, 4, wall || L('#8e959c', '#2a2e34', '#18191c'));
    const g = ctx.createLinearGradient(X(x), Y(y), X(x + w), Y(y + h));
    g.addColorStop(0, roofA); g.addColorStop(1, roofB);
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(X(x + 5), Y(y + 5), (w - 10) * S, (h - 10) * S, 3 * S); ctx.fill();
    if (detail) {
      ctx.lineWidth = 1.4 * S;
      ctx.strokeStyle = L('rgba(255,255,255,0.55)', 'rgba(140,150,165,0.35)', 'rgba(70,70,70,0.3)');
      ctx.beginPath(); ctx.moveTo(X(x + 5), Y(y + h - 5)); ctx.lineTo(X(x + 5), Y(y + 5)); ctx.lineTo(X(x + w - 5), Y(y + 5)); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.moveTo(X(x + w - 5), Y(y + 5)); ctx.lineTo(X(x + w - 5), Y(y + h - 5)); ctx.lineTo(X(x + 5), Y(y + h - 5)); ctx.stroke();
    }
    if (on && detail) {
      R(x + 12, y + h - 3, w - 24, 2, night ? 'rgba(120,230,255,0.95)' : 'rgba(120,210,240,0.6)');
      if (night) glow(x + w / 2, y + h, Math.min(90, w * 0.4), '120,230,255', 0.18);
    }
  };
  const roofA = L('#d6dbe0', '#4e545c', '#26282c'), roofB = L('#a2a9b1', '#2a2e35', '#1a1b1e');

  // ── Flywheel generator hall + capacitor banks ──
  bldg(480, 50, 280, 150, roofA, roofB);
  const fwA = on ? t * (spinUp ? 14 : firing ? 6 : 2.2) : 0;
  for (const fx of [545, 650]) {
    dot(fx, 125, 50, L('#3a4048', '#16191e', '#101214'));
    dot(fx, 125, 44, L('#6a7280', '#2a3038', '#18191c'));
    ctx.strokeStyle = L('#c8ced6', '#5a6470', '#26282c'); ctx.lineWidth = 3 * S;
    ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = fwA + k * 1.047; ctx.moveTo(X(fx), Y(125)); ctx.lineTo(X(fx + Math.cos(a) * 40), Y(125 + Math.sin(a) * 40)); } ctx.stroke();
    dot(fx, 125, 8, L('#e0a040', '#8a6424', '#3a2c14'));
    if (spinUp && detail) { ctx.fillStyle = 'rgba(200,220,255,0.12)'; ctx.beginPath(); ctx.arc(X(fx), Y(125), 42 * S, 0, Math.PI * 2); ctx.fill(); }
  }
  for (let k = 0; k < 8; k++) {                                                          // capacitor cabinets
    const cx = 712, cy = 64 + k * 16;
    RR(cx, cy, 40, 12, 1.5, L('#4a5058', '#1e2228', '#141518'));
    if (on) R(cx + 3, cy + 4, 34 * (spinUp ? Math.min(1, (shot.ph - 0.8) / 0.2) : firing ? 1 - shotK : 0.15), 4, 'rgb(120,220,255)');
  }
  if (detail) text('FLYWHEEL GENERATORS', 600, 190, 9, L('#3a4048', '#8a96a4', '#3a3c40'), 'Arial, sans-serif');

  // ── Helium cryoplant ──
  bldg(480, 220, 280, 140, L('#c4ccd4', '#3e4650', '#222428'), L('#8e98a2', '#232830', '#18191c'));
  for (let k = 0; k < 4; k++) {
    const cx = 520 + k * 62, cy = 262;
    dot(cx + 3, cy + 4, 24, 'rgba(0,0,0,0.25)');
    dot(cx, cy, 24, L('#eef2f6', '#7a8290', '#34363a'));
    dot(cx, cy, 16, L('#dfe6ee', '#6a7280', '#2e3034'));
    if (on) for (let q = 0; q < 2; q++) { const ph = (t * 0.3 + q / 2 + k * 0.2) % 1; ell(cx + ph * 8, cy - 20 - ph * 22, 6 + ph * 8, 4 + ph * 5, `rgba(235,245,255,${((1 - ph) * 0.35).toFixed(3)})`); }   // boil-off frost
  }
  for (let k = 0; k < 5; k++) RR(496 + k * 52, 314, 40, 30, 2, L('#6a7480', '#2a3038', '#18191c'));   // compressors
  if (detail) text('HELIUM CRYOPLANT', 620, 356, 9, L('#3a4048', '#8a96a4', '#3a3c40'), 'Arial, sans-serif');

  // ── Cooling towers ──
  for (let k = 0; k < 3; k++) {
    const cx = 520 + k * 90, cy = 430;
    R(cx - 34 + 4, cy - 34 + 5, 68, 68, 'rgba(0,0,0,0.3)');
    RR(cx - 34, cy - 34, 68, 68, 3, L('#aeb6bc', '#3e444c', '#222428'));
    dot(cx, cy, 26, L('#3a4046', '#15181c', '#101214'));
    if (detail) { ctx.strokeStyle = L('#7a848c', '#3a4450', '#222428'); ctx.lineWidth = 3 * S; const a0 = on ? t * 5 + k : k; ctx.beginPath(); for (let b = 0; b < 5; b++) { const a = a0 + b * 1.2566; ctx.moveTo(X(cx), Y(cy)); ctx.lineTo(X(cx + Math.cos(a) * 22), Y(cy + Math.sin(a) * 22)); } ctx.stroke(); }
    if (on) for (let q = 0; q < 4; q++) { const ph = (t * 0.2 + q / 4 + k * 0.23) % 1; ell(cx + ph * 16, cy - ph * 60, 12 + ph * 22, 9 + ph * 14, `rgba(236,240,244,${((1 - ph) * (0.2 + 0.25 * shotK + (night ? 0 : 0.1))).toFixed(3)})`); }
    if (on && night) { const bl = Math.sin(t * 3 + k * 1.3) > 0.4; for (const [ox, oy] of [[-30, -30], [30, 30]]) { dot(cx + ox, cy + oy, 2.4, bl ? '#ff3a30' : '#4a1410'); if (bl) glow(cx + ox, cy + oy, 10, '255,58,48', 0.5); } }
  }

  // ── Tritium lab (shielded) ──
  bldg(480, 500, 110, 76, L('#b4b2a2', '#403f36', '#1e1e1a'), L('#7e7c6e', '#26251f', '#141412'), L('#6a685c', '#22211c', '#121210'));
  dot(535, 538, 16, '#f0d020');
  ctx.fillStyle = '#1a1a1a';
  for (let k = 0; k < 3; k++) { const a0 = -Math.PI / 2 + k * 2.094 - 0.5; ctx.beginPath(); ctx.moveTo(X(535), Y(538)); ctx.arc(X(535), Y(538), 12 * S, a0, a0 + 1); ctx.closePath(); ctx.fill(); }
  dot(535, 538, 3, '#1a1a1a');
  if (detail) text('TRITIUM LAB', 535, 568, 8, L('#2a2a26', '#8a8a80', '#3a3a36'), 'Arial, sans-serif');

  // ── Control centre + shot countdown board ──
  bldg(50, 440, 404, 130, L('#2e4058', '#132030', '#141518'), L('#16222f', '#0a121a', '#0e0f10'), L('#3a4450', '#161c24', '#121416'));
  if (detail) for (let c = 0; c < 20; c++) for (let r = 0; r < 2; r++) R(62 + c * 19.5, 520 + r * 20, 13, 12, on ? (burn ? ((c + r) % 3 ? '#ffd0f0' : '#ffe8a0') : night ? '#ffd890' : '#6a9ac0') : '#141618');
  RR(70, 452, 364, 56, 3, '#05080c');
  // Shrink a message until it fits inside the board's screen (340 of its 364 units).
  const fitSize = (msg, size) => {
    ctx.font = `bold ${size * S}px Arial, sans-serif`;
    const w = ctx.measureText(msg).width / S;
    return w > 340 ? size * 340 / w : size;
  };
  const fxMsg = !fx || (!on && !abortK) ? null
    : mileK > 0 ? [`★ ${fx.title.toUpperCase()} ★`, Math.sin(now * 10) > 0 ? '#ffe0fa' : '#ff90e0']
    : fxK('outage', 3) > 0 ? ['⚠ POWER LOST · 2 SHOTS OF DATA GONE', Math.sin(now * 12) > 0 ? '#ff5040' : '#ffd0c0']
    : fxK('abort', 2.6) > 0 ? ['✕ SHOT ABORTED · BROWNOUT', Math.sin(now * 12) > 0 ? '#ff6a40' : '#ffb090']
    : fxK('good', 2.4) > 0 ? [`✓ SHOT ${fx.n}/${FR.shotsNeeded} · GOOD DATA`, '#9af8ff']
    : fxK('bonus', 2.4) > 0 ? [`✓ CHAIN GOALS −${Math.round(FR.goalCut * 100)}%`, '#ffe08a']
    : null;
  if (fxMsg) {
    text(fxMsg[0], 252, 480, fitSize(fxMsg[0], 20), fxMsg[1], 'Arial, sans-serif');
    glow(252, 480, 180, mileK > 0 ? PLASMA : abortK > 0 ? '255,80,40' : bonusK > 0 ? '255,200,80' : '120,230,255', 0.35);
  } else if (on && FR && (FR.ignited || FR.imminent || (FR.researching && !firing))) {
    let msg, col;
    if (FR.ignited) { msg = 'FUSION ACHIEVED · SUSTAINED BURN'; col = '#ffd6f6'; }
    else if (FR.imminent) {
      msg = FR.shotsLeft > 0 ? `IGNITION · ${FR.shotsLeft} GOOD SHOT${FR.shotsLeft === 1 ? '' : 'S'} TO GO` : 'IGNITION SEQUENCE';
      col = Math.sin(t * 6) > 0 ? '#ff90e0' : '#ffffff';
    } else {
      msg = FR.lastFailed ? `LAST SHOT ABORTED · ${FR.shots}/${FR.shotsNeeded}` : `FUSION RESEARCH · ${FR.shots}/${FR.shotsNeeded} SHOTS`;
      col = FR.lastFailed ? '#ffa070' : '#8af0ff';
      R(90, 497, 324, 5, '#10202a'); R(90, 497, 324 * FR.pct, 5, '#8af0ff');
    }
    text(msg, 252, 478, fitSize(msg, 20), col, 'Arial, sans-serif');
    glow(252, 480, 170, FR.ignited || FR.imminent ? PLASMA : '120,220,255', FR.ignited ? 0.3 : 0.2);
  } else if (on) {
    const shotNo = 1 + Math.floor((DayNight.day?.() || 1) * 18 + Math.max(0, hr - 9) * 2);
    const shotLbl = FR && FR.researching ? `SHOT ${FR.shots + 1}/${FR.shotsNeeded}` : `SHOT #${shotNo}`;
    let msg, col;
    if (firing) { msg = `${shotLbl} · PLASMA ON`; col = `rgba(255,${Math.round(140 + 100 * shotK)},230,1)`; }
    else if (shot.inDay) {
      const mins = Math.max(0, Math.round((1 - shot.ph) * 30));
      msg = `SHOT #${shotNo + 1} · T-00:${String(mins).padStart(2, '0')}`; col = spinUp ? '#ffd060' : '#8af0ff';
    } else { msg = 'NO SHOTS SCHEDULED · MAINTENANCE'; col = '#6a8aa0'; }
    text(msg, 252, 480, fitSize(msg, 20), col, 'Arial, sans-serif');
    if (night || firing) glow(252, 480, 160, firing ? PLASMA : '120,220,255', firing ? 0.35 * shotK + 0.1 : 0.2);
  } else {
    text('NO POWER: EXPERIMENTS HALTED', 252, 480, fitSize('NO POWER: EXPERIMENTS HALTED', 18), 'rgba(255,90,70,0.85)', 'Arial, sans-serif');
  }

  // ── Front road traffic ──
  if (on) for (let k = 0; k < 3; k++) {
    const dir = k % 2 ? 1 : -1, u = (t * (0.012 + k * 0.004) + k * 0.33) % 1;
    const cx = dir > 0 ? -30 + u * (AW + 60) : AW + 30 - u * (AW + 60), cy = dir > 0 ? 625 : 606;
    RR(cx - 11, cy - 5, 22, 10, 3, ['#e8e8e8', '#2a5ab0', '#303438'][k]);
    if (night) glow(cx + dir * 11, cy, 14, '255,244,200', 0.35);
  }
  // aviation beacons on the drum's rim
  for (const a of [-Math.PI * 0.75, -Math.PI * 0.25]) {
    const bx = TX + Math.cos(a) * (HR - 6), by = TY + Math.sin(a) * (HR - 6);
    if (on && burn) { dot(bx, by, 3.5, '#ffb0f0'); glow(bx, by, 18, PLASMA, 0.6); }
    else if (on) { const b = Math.sin(t * 2.2 + a) > 0.6; dot(bx, by, 3, b ? '#ff3020' : '#5a1810'); if (night && b) glow(bx, by, 14, '255,48,32', 0.5); }
  }
  ctx.restore();

  // ── Spectacle, unclipped: rolls out past the campus fence ──
  if (!FR || FR.scene || (!on && !abortK)) return;
  const imminent = on && FR.imminent, ignited = on && FR.ignited;
  if (!(goodK || mileK || abortK || bonusK || imminent || ignited)) return;
  ctx.save();
  ctx.translate(px + OFFX, py + OFFY);
  ctx.scale(CK, CK);
  ctx.globalCompositeOperation = 'lighter';
  const ring = (u, r0, r1, rgb, a, w) => {                                             // u 0→1 across the wave's life
    if (u <= 0 || u >= 1) return;
    const r = r0 + (r1 - r0) * (1 - Math.pow(1 - u, 2.2)), k = 1 - u;
    ctx.save(); ctx.shadowColor = `rgba(${rgb},1)`; ctx.shadowBlur = 24 * S * k;
    ctx.strokeStyle = `rgba(${rgb},${(a * k).toFixed(3)})`; ctx.lineWidth = w * (0.3 + 0.7 * k) * S;
    ctx.beginPath(); ctx.arc(X(TX), Y(TY), r * S, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  };
  // A good shot sends a shockwave of light out across the map.
  if (goodK > 0) { ring(1 - goodK, 170, 760, '120,230,255', 0.9, 10); ring(1 - goodK - 0.12, 170, 620, PLASMA, 0.7, 6); }
  // A milestone: three waves, a bloom over the whole campus and a burst of
  // light rays from the tokamak.
  if (mileK > 0) {
    const u = 1 - mileK;
    for (let k = 0; k < 3; k++) ring(u * 1.6 - k * 0.18, 180, 1300, k === 1 ? '255,240,255' : PLASMA, 0.9, 14);
    glow(TX, TY, 700, PLASMA, 0.35 * mileK);
    const rays = 16;
    for (let k = 0; k < rays; k++) {
      const a = k / rays * Math.PI * 2 + now * 0.4, len = 260 + 900 * Math.min(1, u * 2.5), wd = 0.035;
      const g = ctx.createRadialGradient(X(TX), Y(TY), 0, X(TX), Y(TY), len * S);
      g.addColorStop(0, `rgba(255,230,255,${(0.35 * mileK).toFixed(3)})`); g.addColorStop(1, 'rgba(255,120,220,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(X(TX), Y(TY));
      ctx.lineTo(X(TX + Math.cos(a - wd) * len), Y(TY + Math.sin(a - wd) * len));
      ctx.lineTo(X(TX + Math.cos(a + wd) * len), Y(TY + Math.sin(a + wd) * len));
      ctx.closePath(); ctx.fill();
    }
  }
  // Abort / outage: a red pulse snapping outward, short and ugly.
  if (abortK > 0) ring(1 - abortK, 160, 420, '255,70,40', 0.8, 8);
  // Post-fusion bonus shot: a gold ripple.
  if (bonusK > 0) ring(1 - bonusK, 180, 560, '255,200,80', 0.8, 8);
  // Ignition imminent: searchlights sweep out from the campus corners and
  // the fence line pulses magenta.
  if (imminent) {
    const len = 900, wd = 0.07;
    [[20, 20], [AW - 20, 20], [20, AH - 20], [AW - 20, AH - 20]].forEach(([cx, cy], k) => {
      const a = Math.atan2(cy - AH / 2, cx - AW / 2) + Math.sin(now * 0.9 + k * 1.7) * 0.9;
      const g = ctx.createRadialGradient(X(cx), Y(cy), 0, X(cx), Y(cy), len * S);
      g.addColorStop(0, 'rgba(255,170,240,0.32)'); g.addColorStop(1, 'rgba(255,120,220,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(X(cx), Y(cy));
      ctx.lineTo(X(cx + Math.cos(a - wd) * len), Y(cy + Math.sin(a - wd) * len));
      ctx.lineTo(X(cx + Math.cos(a + wd) * len), Y(cy + Math.sin(a + wd) * len));
      ctx.closePath(); ctx.fill();
      glow(cx, cy, 30, PLASMA, 0.8);
    });
    const p = 0.5 + 0.5 * Math.sin(now * 5);
    ctx.shadowColor = 'rgba(255,90,220,1)'; ctx.shadowBlur = 20 * S;
    ctx.strokeStyle = `rgba(255,120,220,${(0.35 + 0.5 * p).toFixed(3)})`; ctx.lineWidth = (2 + 3 * p) * S;
    ctx.strokeRect(X(4), Y(4), (AW - 8) * S, (AH - 8) * S);
    ctx.shadowBlur = 0;
    ring((now % 1.6) / 1.6, 160, 360, PLASMA, 0.6, 5);                                // the tokamak's heartbeat
  }
  // Fusion achieved: the machine breathes slow rings of light out over the city.
  if (ignited) { ring((now % 4) / 4, 170, 520, PLASMA, 0.35, 6); ring(((now + 2) % 4) / 4, 170, 520, '255,220,120', 0.2, 4); }
  ctx.restore();
}

// ── Hyperion Station (64×40) ─────────────────────────────────────────────
// Operation Hyperion's national interconnector (NationalProject). Authored
// natively at 2560×1600 units — the endgame centrepiece, so it is the biggest
// site in the National Government Zone. West: two vaulted HVDC converter halls
// (cooling fans turning) and a battery array. Centre: the Hyperion Spire, a
// segmented ring round a globe of meridian lines inside two brass armillary
// rings, standing in a ring of water on a round plaza that the halls and the
// yard keep clear of, with a graticule engraved across the pad. East: the
// switchyard, a line bay for each of the three lattice pylons that carry the
// national lines off the east edge (drawn past the footprint so they read as
// leaving for the rest of the country). South: control building with a radar
// dish, a helipad, the grounds and car park, and trucks on the access road.
// Animated conduits carry the power hall → spire → yard → pylons.
//
// Ignition and Foundations build it up piece by piece from blueprint outlines, with tower
// cranes working over whatever is going up; First Light's commissioning surges
// arc across the switchyard; from The Line the lines carry pulses of power
// away; the final day turns it gold; complete, it burns gold for good.
let _meridianBuildShown = -1, _meridianBuildAt = 0;    // the build fraction on screen (see below)
// The ring of light round the core turns faster with the export. Its angle is
// carried forward frame to frame: written as now × speed, easing the speed
// would spin it wildly while it changed.
let _meridianRingA = 0, _meridianRingAt = 0;
function renderMeridianStation(e, px, py, t) {
  const AW = 2560, AH = 1600;
  const W = (e.width || EntityDefs[T.NATIONALGRID].width) * TILE, H = (e.height || EntityDefs[T.NATIONALGRID].height) * TILE;
  const NP = typeof NationalProject !== 'undefined' ? NationalProject.visual() : null;
  const K = _nKit(0, 0), { S, X, Y, R, RR, dot, ell, poly, ln, text, glow } = K;
  const on = e.powered, dark = DayNight.darkness(), night = dark > 0.3, hr = DayNight.hour();
  const detail = Camera.zoom > 0.3;
  const L = (d, n, o) => on ? (night ? n : d) : o;
  const now = performance.now() / 1000;
  // Committing the funding takes Foundations halfway in one tick. The site
  // catches up over half a minute instead, so the pad is seen being poured
  // and the halls going up rather than appearing finished.
  let build = NP ? NP.build : 1;
  if (NP && NP.stage === 0 && _meridianBuildShown >= 0 && build > _meridianBuildShown) {
    build = _meridianBuildShown = Math.min(build, _meridianBuildShown + Math.min(0.5, Math.max(0, now - _meridianBuildAt)) * 0.015);
  } else _meridianBuildShown = build;
  _meridianBuildAt = now;
  const gold = NP && (NP.final || NP.complete);
  const surge = NP && NP.stage === 1 && typeof NationalProject !== 'undefined' ? NationalProject.surge(hr) : null;
  const firing = on && surge && surge.firing, spinUp = on && surge && surge.spinUp;
  const surgeK = firing ? Math.sin(Math.min(1, surge.ph / 0.15) * Math.PI) : 0;
  const exporting = on && NP && NP.exporting && NP.stage >= 2;
  // The export eases on and off (NationalProject._xUpdate): xk is how far
  // along it is. Switching on sends a shockwave off the Spire (startK);
  // switching off makes everything sputter as it runs down (sputter).
  const xk = on && NP && NP.stage >= 2 ? (NP.exportK ?? (exporting ? 1 : 0)) : 0;
  const xe = NP && NP.exportEdge, xeAge = xe ? now - xe.at : 99;
  const startK = on && xe && xe.on && xeAge < 2.4 ? 1 - xeAge / 2.4 : 0;
  const sputter = on && xe && !xe.on && xk > 0 ? 0.45 + 0.55 * Math.random() : 1;
  const fx = NP ? NP.fx : null, fxAge = fx ? now - fx.at : 99;
  const fxK = (kind, dur) => fx && fx.kind === kind && fxAge < dur ? 1 - fxAge / dur : 0;
  const stageK = fxK('stage', 5), surgeFx = on ? fxK('surge', 2.2) : 0, abortK = Math.max(fxK('abort', 2.6), fxK('outage', 3));
  const ACC = gold ? '255,208,112' : '122,216,255';
  const live = on ? 0.35 + 0.65 * xk * sputter : 0;                                       // how hard the station is working
  { const dtR = Math.max(0, Math.min(0.1, now - _meridianRingAt)); _meridianRingAt = now; _meridianRingA += dtR * (0.4 + 0.8 * xk); }
  // How far each part is built (Ignition to 35%, the pad, hall A and the
  // control room; Foundations the rest): [start, end] of the build fraction.
  const part = (a, b) => Math.max(0, Math.min(1, (build - a) / (b - a)));
  const P = { pad: part(0, 0.08), hallA: part(0.06, 0.34), hallB: part(0.26, 0.54), ctrl: part(0.18, 0.4), yard: part(0.46, 0.74), spire: part(0.66, 0.94), pylons: part(0.84, 1) };

  ctx.save();
  ctx.translate(px, py);
  ctx.scale(W / (AW*TILE/40), H / (AH*TILE/40));
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, AW*S, AH*S); ctx.clip();

  // Layout
  const SX = 1180, SY = 640, SR = 430;                                                     // the Spire
  const HALLS = [[60, 90, 540, 440, P.hallA, 'CONVERTER HALL A'], [60, 570, 540, 440, P.hallB, 'CONVERTER HALL B']];
  const YARD = [1760, 110, 560, 1060];
  const CTRL = [860, 1204, 640, 236];
  const PYL = [[2450, 260], [2450, 640], [2450, 1020]];
  const TAU = Math.PI * 2;
  // The sun is in the north-west: lit faces run light → shade along a gradient,
  // and everything throws its shadow south-east, further the taller it stands.
  const lin = (x0, y0, x1, y1, a, b) => { const g = ctx.createLinearGradient(X(x0), Y(y0), X(x1), Y(y1)); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
  const arc = (x, y, r, c, w, a0 = 0, a1 = TAU) => { ctx.strokeStyle = c; ctx.lineWidth = w * S; ctx.beginPath(); ctx.arc(X(x), Y(y), r * S, a0, a1); ctx.stroke(); };
  const BRASS = L('#e2bc62', '#8a6e34', '#3c3626'), BRASS_HI = L('#fff0b8', '#c8a458', '#4a4430');
  const CERAMIC = L('#b4663a', '#4c2e1e', '#241812'), CERAMIC_HI = L('#dc9a6c', '#6e4630', '#30221a');

  // ── Ground: raw earth, then the concrete pad poured over it ──
  R(0, 0, AW, AH, '#6e6450');
  if (P.pad > 0) { ctx.save(); ctx.globalAlpha *= P.pad; R(0, 0, AW, AH, L('#69707a', '#20242a', '#1a1c1e')); ctx.restore(); }
  if (P.pad >= 1) {
    R(0, 1500, AW, 100, L('#3c3f44', '#17191c', '#121314'));                                // access road
    if (detail) for (let x = 20; x < AW; x += 70) R(x, 1546, 36, 6, L('rgba(255,255,255,0.8)', 'rgba(255,255,255,0.3)', 'rgba(90,90,90,0.4)'));
    if (detail) {                                                                           // slab joints
      ctx.strokeStyle = L('rgba(0,0,0,0.09)', 'rgba(255,255,255,0.035)', 'rgba(255,255,255,0.02)'); ctx.lineWidth = 2 * S; ctx.beginPath();
      for (let x = 160; x < AW; x += 160) { ctx.moveTo(X(x), Y(0)); ctx.lineTo(X(x), Y(1500)); }
      for (let y = 160; y < 1500; y += 160) { ctx.moveTo(X(0), Y(y)); ctx.lineTo(X(AW), Y(y)); }
      ctx.stroke();
    }
    R(0, 1488, AW, 12, L('#9aa0a6', '#33383e', '#222426'));                                  // kerb along the road
    // The Spire's plaza: a stone kerb, two bands of polished paving cut by
    // radial joints, and a surveyor's bezel round the rim — a tick every five
    // degrees, a numeral every thirty, north at the top.
    dot(SX + 8, SY + 10, 564, 'rgba(0,0,0,0.18)');
    dot(SX, SY, 562, lin(SX - 420, SY - 420, SX + 420, SY + 420, L('#c4cad0', '#444c56', '#2c2e31'), L('#8c939b', '#262b32', '#1c1e20')));
    dot(SX, SY, 549, L('#434a54', '#11151a', '#111315'));
    dot(SX, SY, 526, L('#4f5661', '#161b21', '#141618'));
    if (detail) {
      ctx.strokeStyle = L('rgba(0,0,0,0.16)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.03)'); ctx.lineWidth = 2 * S; ctx.beginPath();
      for (let k = 0; k < 48; k++) { const a = (k + 0.5) / 48 * TAU, c = Math.cos(a), s = Math.sin(a); ctx.moveTo(X(SX + c * 504), Y(SY + s * 504)); ctx.lineTo(X(SX + c * 526), Y(SY + s * 526)); }
      ctx.stroke();
      ctx.strokeStyle = L('rgba(255,255,255,0.6)', 'rgba(170,205,235,0.4)', 'rgba(110,110,110,0.35)'); ctx.lineWidth = 3 * S; ctx.beginPath();
      for (let k = 0; k < 72; k++) { const a = k / 72 * TAU, c = Math.cos(a), s = Math.sin(a), r0 = k % 6 ? 541 : 534; ctx.moveTo(X(SX + c * r0), Y(SY + s * r0)); ctx.lineTo(X(SX + c * 548), Y(SY + s * 548)); }
      ctx.stroke();
      for (let k = 0; k < 12; k++) {
        if (k === 6) continue;                                                              // the Spire's name goes there
        const a = k / 12 * TAU - Math.PI / 2;
        text(k ? `${k * 30}°` : 'N', SX + Math.cos(a) * 515, SY + Math.sin(a) * 515, k ? 13 : 19, k ? L('rgba(255,255,255,0.55)', 'rgba(170,205,235,0.4)', 'rgba(110,110,110,0.4)') : BRASS, 'Arial, sans-serif');
      }
    }
    if (P.spire < 1) dot(SX, SY, 500, L('#4c535d', '#14181d', '#121416'));
    else {
      // A ring of still water round the Spire, in a pale stone coping. It
      // carries the Spire's light at night, and four causeways cross it on
      // the cardinals; the northern one is inlaid with the brass meridian.
      dot(SX, SY, 504, lin(SX - 360, SY - 360, SX + 360, SY + 360, L('#e4e8ec', '#59626c', '#303236'), L('#a4abb3', '#333a42', '#202224')));
      dot(SX, SY, 496, L('#3f93c2', '#0b2a42', '#12161a'));
      dot(SX, SY, 474, L('#2a74a6', '#071d30', '#0e1114'));
      if (on) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        arc(SX, SY, 466, `rgba(${ACC},${((night ? 0.16 : 0.07) + 0.2 * live).toFixed(3)})`, 44);       // the Spire's glow lying on the water
        arc(SX, SY, 449, `rgba(${ACC},${((night ? 0.3 : 0.14) + 0.3 * live).toFixed(3)})`, 8);
        ctx.restore();
      }
      if (detail) {                                                                         // ripples drifting round the pool
        for (let k = 0; k < 10; k++) {
          const dir = k % 2 ? 1 : -1, a0 = now * 0.05 * dir * (1 + k * 0.13) + k * 1.9, r = 452 + (k * 17) % 40;
          arc(SX, SY, r, L(`rgba(255,255,255,${(0.12 + 0.1 * Math.sin(now * 0.7 + k)).toFixed(3)})`, `rgba(${ACC},${(0.14 + 0.1 * Math.sin(now * 0.7 + k)).toFixed(3)})`, 'rgba(255,255,255,0.03)'), 2, a0, a0 + 0.35 + (k % 3) * 0.2);
        }
      }
      for (let k = 0; k < 4; k++) {                                                         // causeways
        ctx.save(); ctx.translate(X(SX), Y(SY)); ctx.rotate(k * Math.PI / 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(428 * S, -30 * S, 74 * S, 72 * S);
        ctx.fillStyle = L('#cfd4d9', '#48505a', '#2a2c2f'); ctx.fillRect(428 * S, -36 * S, 74 * S, 72 * S);
        ctx.fillStyle = L('#8f969e', '#2a3038', '#1e2022'); ctx.fillRect(428 * S, -28 * S, 74 * S, 56 * S);
        ctx.restore();
      }
      // The meridian itself: a brass line due north from the Spire to the
      // fence, studded, with a pulse of light running out along it.
      R(SX - 5, 52, 10, SY - 430 - 52, BRASS);
      R(SX - 5, 52, 3, SY - 430 - 52, BRASS_HI);
      if (detail) for (let y = 70; y < SY - 440; y += 34) dot(SX, y, 8, y % 68 < 34 ? BRASS_HI : BRASS);
      poly([[SX, 34], [SX - 22, 74], [SX, 62], [SX + 22, 74]], BRASS);
      if (on) { const u = (now * (0.12 + 0.3 * live)) % 1, y = SY - 440 - u * (SY - 500); ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(SX, y, 60, ACC, 0.7 * (1 - u)); R(SX - 4, y - 16, 8, 32, `rgba(255,255,255,${(0.8 * (1 - u)).toFixed(3)})`); ctx.restore(); }
      // Eight emitter obelisks stand round the paving.
      for (let k = 0; k < 8; k++) {
        const a = (k + 0.5) / 8 * TAU, ox = SX + Math.cos(a) * 527, oy = SY + Math.sin(a) * 527;
        poly([[ox - 9, oy + 9], [ox + 9, oy - 9], [ox + 74, oy + 78], [ox + 62, oy + 90]], 'rgba(0,0,0,0.28)');
        poly([[ox, oy - 17], [ox + 17, oy], [ox, oy + 17], [ox - 17, oy]], L('#eef1f4', '#5c6672', '#2a2c30'));
        poly([[ox, oy - 17], [ox + 17, oy], [ox, oy + 17]], L('#aab2ba', '#38404a', '#1e2023'));
        dot(ox, oy, 6, on ? `rgba(${ACC},1)` : '#26282a');
        if (on) glow(ox, oy, night ? 90 : 46, ACC, (night ? 0.4 : 0.3) + 0.3 * live);
      }
    }
    // The meridian graticule inlaid across the pad: rings and radials round
    // the Spire, brighter the harder the station is working, with ripples of
    // light running out along it and chase lights down eight of the radials.
    if (detail) {
      const ga = 0.08 + 0.22 * live;
      ctx.save(); if (on) ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = on ? `rgba(${ACC},${ga.toFixed(3)})` : 'rgba(60,60,60,0.12)'; ctx.lineWidth = 3 * S;
      for (const r of [576, 700, 860, 1040]) { ctx.beginPath(); ctx.arc(X(SX), Y(SY), r * S, 0, Math.PI * 2); ctx.stroke(); }
      ctx.beginPath();
      for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; ctx.moveTo(X(SX + Math.cos(a) * 576), Y(SY + Math.sin(a) * 576)); ctx.lineTo(X(SX + Math.cos(a) * 1300), Y(SY + Math.sin(a) * 1300)); }
      ctx.stroke();
      if (on && build >= 1) {
        for (let k = 0; k < 3; k++) {
          const u = (now * (0.07 + 0.11 * live) + k / 3) % 1;
          ctx.strokeStyle = `rgba(${ACC},${((0.10 + 0.34 * live) * (1 - u)).toFixed(3)})`; ctx.lineWidth = (4 + 8 * (1 - u)) * S;
          ctx.beginPath(); ctx.arc(X(SX), Y(SY), (SR + 40 + u * 900) * S, 0, Math.PI * 2); ctx.stroke();
        }
        const step = Math.floor(now * (3 + 6 * live));
        for (let k = 0; k < 8; k++) for (let j = 0; j < 7; j++) {
          const a = (k + 0.5) / 8 * Math.PI * 2, r = 620 + j * 100, lit = ((j - step) % 7 + 7) % 7 === 0;
          dot(SX + Math.cos(a) * r, SY + Math.sin(a) * r, lit ? 8 : 5, `rgba(${ACC},${lit ? 0.95 : 0.22})`);
          if (lit) glow(SX + Math.cos(a) * r, SY + Math.sin(a) * r, 46, ACC, 0.5);
        }
      }
      ctx.restore();
    }
    // perimeter fence with a hazard band
    ctx.strokeStyle = L('rgba(215,220,225,0.75)', 'rgba(120,130,140,0.45)', 'rgba(60,60,60,0.5)'); ctx.lineWidth = 3 * S;
    ctx.strokeRect(X(16), Y(16), (AW - 32) * S, 1470 * S);
    if (detail) {
      ctx.save(); ctx.setLineDash([26 * S, 26 * S]);
      ctx.strokeStyle = L('rgba(240,200,40,0.55)', 'rgba(180,150,30,0.4)', 'rgba(90,80,20,0.3)'); ctx.lineWidth = 8 * S;
      ctx.strokeRect(X(30), Y(30), (AW - 60) * S, 1442 * S); ctx.restore();
      if (on && build >= 1) {                                                               // a strip of light chasing round inside the fence
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.setLineDash([70 * S, 210 * S]); ctx.lineDashOffset = -now * (60 + 160 * live) * S;
        ctx.strokeStyle = `rgba(${ACC},${(night ? 0.55 + 0.35 * live : 0.25 + 0.3 * live).toFixed(3)})`; ctx.lineWidth = 6 * S;
        ctx.strokeRect(X(46), Y(46), (AW - 92) * S, 1410 * S); ctx.restore();
      }
    }
  }

  // A part that isn't finished: blueprint outline, then concrete rising
  // from the bottom under scaffolding.
  const c01 = v => Math.max(0, Math.min(1, v));
  const blueprint = (x, y, w, h) => {
    ctx.save(); ctx.setLineDash([16 * S, 12 * S]);
    ctx.strokeStyle = 'rgba(122,216,255,0.8)'; ctx.lineWidth = 4 * S;
    ctx.strokeRect(X(x), Y(y), w * S, h * S); ctx.restore();
  };
  // Welding arcs: collected as the parts are drawn, lit at the very end so
  // nothing built later paints over them.
  const arcs = [];
  const weld = (x, y, seed) => { if (Math.sin(now * 17 + seed * 7.3) + Math.sin(now * 5.1 + seed * 2.9) > 0.7) arcs.push([x, y]); };
  const STEEL = L('#8a3a26', '#3c1e16', '#24140e');
  const SCAFF = L('rgba(225,160,50,0.9)', 'rgba(120,86,30,0.9)', 'rgba(70,52,22,0.9)');
  // A building going up: slab, then the steel frame bay by bay from the
  // west, then the roof sheeted over it from the north, scaffolding round
  // the lot until it's done.
  const site = (x, y, w, h, k, roof) => {
    blueprint(x, y, w, h);
    if (k <= 0) return;
    ctx.save(); ctx.globalAlpha *= c01(k / 0.12);
    R(x + 10, y + 10, w - 20, h - 20, L('#7e8286', '#2a2e34', '#1c1e20'));
    R(x + 22, y + 22, w - 44, h - 44, L('#989ca0', '#33373d', '#222426'));
    ctx.restore();
    const nx = Math.round(w / 60), ny = Math.round(h / 60), bw = (w - 40) / nx, bh = (h - 40) / ny;
    const up = Math.min(nx, Math.floor(c01((k - 0.1) / 0.5) * (nx + 1)) - 1);                  // last frame line standing
    if (up >= 0) {
      const xe = x + 20 + up * bw;
      R(x + 30, y + 34, xe - x - 20, h - 40, 'rgba(0,0,0,0.16)');
      ctx.strokeStyle = STEEL; ctx.lineWidth = 6 * S; ctx.beginPath();
      for (let i = 0; i <= up; i++) { ctx.moveTo(X(x + 20 + i * bw), Y(y + 20)); ctx.lineTo(X(x + 20 + i * bw), Y(y + h - 20)); }
      if (up > 0) for (let j = 0; j <= ny; j++) { ctx.moveTo(X(x + 20), Y(y + 20 + j * bh)); ctx.lineTo(X(xe), Y(y + 20 + j * bh)); }
      ctx.stroke();
      if (detail) for (let i = 0; i <= up; i++) for (let j = 0; j <= ny; j++) dot(x + 20 + i * bw, y + 20 + j * bh, 5, L('#3a2018', '#1c100c', '#140c0a'));
      if (up < nx) for (let q = 0; q < 2; q++) weld(xe, y + 20 + ((Math.floor(now * 0.3 + q * 3.7 + x) % (ny + 1)) * bh), x + y + q);
    }
    const rk = c01((k - 0.55) / 0.45);
    if (rk > 0) {
      const rh = h * rk;
      R(x, y, w, rh, roof);
      if (detail) {
        ctx.strokeStyle = 'rgba(0,0,0,0.13)'; ctx.lineWidth = 3 * S; ctx.beginPath();
        for (let sx = x + 44; sx < x + w; sx += 44) { ctx.moveTo(X(sx), Y(y)); ctx.lineTo(X(sx), Y(y + rh)); }
        ctx.stroke();
      }
      R(x, y + rh - 8, w, 8, 'rgba(0,0,0,0.2)');
      for (let q = 0; q < 2; q++) weld(x + 30 + ((now * 22 + q * w * 0.5 + y) % (w - 60)), y + rh, x * 0.1 + q * 5);
    }
    ctx.strokeStyle = SCAFF; ctx.lineWidth = 6 * S;
    ctx.strokeRect(X(x - 9), Y(y - 9), (w + 18) * S, (h + 18) * S);
    if (detail) {
      ctx.save(); ctx.setLineDash([5 * S, 55 * S]);
      ctx.strokeStyle = 'rgba(40,30,16,0.75)'; ctx.lineWidth = 12 * S;
      ctx.strokeRect(X(x - 9), Y(y - 9), (w + 18) * S, (h + 18) * S); ctx.restore();
    }
  };
  // A tower crane, top-down: lattice jib and counter-jib slewing back and
  // forth over its mast, a trolley running out along it with a load slung
  // underneath, and its shadow on the ground.
  const crane = (cx, cy, len, k) => {
    const a = k * 2 + Math.sin(now * 0.11 + k * 1.7) * 1.15;
    const tr = 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(now * 0.23 + k * 3.1));
    const jib = (c, wd) => { ctx.fillStyle = c; ctx.fillRect(-len * 0.3 * S, -wd * S, len * 1.3 * S, wd * 2 * S); };
    ctx.save(); ctx.translate(X(cx + 30), Y(cy + 40)); ctx.rotate(a); jib('rgba(0,0,0,0.16)', 9); ctx.restore();
    const lx = cx + Math.cos(a) * len * tr, ly = cy + Math.sin(a) * len * tr;
    RR(lx - 14, ly - 4, 52, 36, 3, 'rgba(0,0,0,0.22)');
    // the load: a bundle of beams or plate, with the slings up to the hook
    const LOAD = k % 2 ? L('#9aa0a8', '#3c4046', '#26282a') : STEEL;
    for (let q = 0; q < 3; q++) { RR(lx - 26, ly - 18 + q * 12, 52, 11, 2, LOAD); if (detail) R(lx - 26, ly - 17 + q * 12, 52, 2.5, 'rgba(255,255,255,0.16)'); }
    if (detail) { R(lx - 14, ly - 18, 3, 36, 'rgba(30,30,30,0.6)'); R(lx + 11, ly - 18, 3, 36, 'rgba(30,30,30,0.6)'); ln(lx - 12, ly - 18, lx, ly, 'rgba(30,30,30,0.6)', 1.5); ln(lx + 12, ly - 18, lx, ly, 'rgba(30,30,30,0.6)', 1.5); }
    dot(lx, ly, 4, '#e8c030');                                                              // the hook block
    // the mast seen from above: a lattice square on its base
    RR(cx - 26, cy - 26, 52, 52, 4, L('#4a4e52', '#222426', '#161718'));
    R(cx - 16, cy - 16, 32, 32, L('#e0b020', '#806414', '#4a3c10'));
    if (detail) { ln(cx - 16, cy - 16, cx + 16, cy + 16, 'rgba(60,44,0,0.6)', 2.5); ln(cx + 16, cy - 16, cx - 16, cy + 16, 'rgba(60,44,0,0.6)', 2.5); R(cx - 16, cy - 16, 32, 3, L('#f4d050', '#9a7a20', '#5a4a14')); }
    ctx.save(); ctx.translate(X(cx), Y(cy)); ctx.rotate(a);
    jib(L('#e8c030', '#8a7018', '#4e4012'), 9);
    if (detail) {                                                                           // the lattice
      ctx.strokeStyle = 'rgba(60,44,0,0.55)'; ctx.lineWidth = 2.2 * S; ctx.beginPath();
      for (let u = 0, s2 = 1; u < len; u += 20, s2 = -s2) { ctx.moveTo(u * S, -8 * s2 * S); ctx.lineTo((u + 20) * S, 8 * s2 * S); }
      ctx.stroke();
    }
    for (let q = 0; q < 3; q++) lrr(-len * 0.3 + q * 17.5, -17, 16, 34, 2, L('#6a6e74', '#2e3034', '#1c1d1f'));       // counterweight blocks
    lrr(10, 9, 28, 22, 5, L('#f0f0ec', '#5a5c5e', '#303132'));                                                       // the cab
    lrr(26, 12, 10, 16, 3, on && night ? 'rgba(255,226,160,0.85)' : 'rgba(40,70,100,0.8)');
    lrr(len * tr - 11, -12, 22, 24, 3, '#2a2a2a'); ldot(len * tr - 5, 0, 3, '#5a5a5a'); ldot(len * tr + 5, 0, 3, '#5a5a5a');   // trolley
    ctx.restore();
    dot(cx, cy, 9, L('#a88414', '#5a480c', '#34290a'));
    if (night && on) {
      const tx = cx + Math.cos(a) * len, ty = cy + Math.sin(a) * len, bl = Math.sin(now * 3 + k) > 0;
      dot(tx, ty, 6, bl ? '#ff4030' : '#601810'); if (bl) glow(tx, ty, 40, '255,60,40', 0.5);
      glow(lx, ly, 150, '255,240,200', 0.22);                                               // the work light on the trolley
    }
  };
  // A power conduit: a glowing line with a stream of light running along it.
  const conduit = (pts, ok) => {
    if (!ok || !on) return;
    const path = new Path2D();
    pts.forEach(([x, y], i) => i ? path.lineTo(X(x), Y(y)) : path.moveTo(X(x), Y(y)));
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = L('rgba(60,70,80,0.55)', 'rgba(20,26,32,0.7)', 'rgba(0,0,0,0.3)'); ctx.lineWidth = 14 * S; ctx.stroke(path);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(${ACC},${(0.10 + 0.22 * live + 0.5 * surgeK).toFixed(3)})`; ctx.lineWidth = 12 * S; ctx.stroke(path);
    if (detail) {
      ctx.setLineDash([22 * S, 46 * S]); ctx.lineDashOffset = -now * (60 + 120 * live) * S;
      ctx.strokeStyle = `rgba(235,250,255,${(0.35 + 0.5 * live).toFixed(3)})`; ctx.lineWidth = 5 * S; ctx.stroke(path);
    }
    ctx.restore();
  };

  // ── Groundworks: the site before the pad is poured ──
  // Ignition starts at 0% and only climbs as pellets burn, so this is what
  // the player looks at the longest: survey stakes on every blueprint, foundations being dug out
  // by excavators, dump trucks hauling spoil round a dirt haul road, a pile
  // rig driving the Spire's piles, and the contractor's compound — cabins,
  // site board, laydown yard, spoil heaps, floodlights. All of it clears away
  // as the pad pours.
  // Shared with the build that follows: the haul loop round the Spire between
  // the halls and the yard, what drives on it, the crews, and the two yards
  // that stay until the buildings that replace them are finished.
  const HIVIS = '#ff8a1a';
  const LP = [[770, 170], [1620, 170], [1620, 1140], [770, 1140]];
  const loopLen = 2 * ((1620 - 770) + (1140 - 170));
  const MASTS = [[850, 250], [1540, 250], [1540, 1060], [850, 1060]];                       // floodlights, inside the loop's corners
  const along = (u) => {                                                                      // a point and heading on the loop
    let d = ((u % 1) + 1) % 1 * loopLen;
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = LP[i], [bx, by] = LP[(i + 1) % 4], seg = Math.hypot(bx - ax, by - ay);
      if (d <= seg) return [ax + (bx - ax) * d / seg, ay + (by - ay) * d / seg, Math.atan2(by - ay, bx - ax)];
      d -= seg;
    }
    return [LP[0][0], LP[0][1], 0];
  };
  const heap = (x, y, rx, ry, c0, c1) => { ell(x + 10, y + 12, rx, ry, 'rgba(0,0,0,0.25)'); ell(x, y, rx, ry, c0); ell(x - rx * 0.25, y - ry * 0.3, rx * 0.55, ry * 0.5, c1); };
  // Shapes in a machine's own frame, once it has been translated and rotated.
  const lrr = (x, y, w, h, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x * S, y * S, w * S, h * S, r * S); ctx.fill(); };
  const ldot = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x * S, y * S, r * S, 0, TAU); ctx.fill(); };
  const lpoly = (pts, c) => { ctx.fillStyle = c; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x * S, y * S) : ctx.moveTo(x * S, y * S)); ctx.closePath(); ctx.fill(); };
  const lln = (x0, y0, x1, y1, c, w) => { ctx.strokeStyle = c; ctx.lineWidth = w * S; ctx.beginPath(); ctx.moveTo(x0 * S, y0 * S); ctx.lineTo(x1 * S, y1 * S); ctx.stroke(); };
  const GLASS = night ? 'rgba(255,226,160,0.85)' : 'rgba(46,74,102,0.9)', GLINT = 'rgba(255,255,255,0.35)';
  // A crawler track seen from above: rubber, shoes, and the idler and sprocket at the ends.
  const track = (x, y, len, wd) => {
    lrr(x, y, len, wd, wd / 2, '#1e1e1e');
    lrr(x + 3, y + 3, len - 6, wd - 6, (wd - 6) / 2, '#383838');
    if (detail) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; for (let s = x + 5; s < x + len - 4; s += 7) ctx.fillRect(s * S, y * S, 2.2 * S, wd * S); }
    ldot(x + wd / 2, y + wd / 2, wd * 0.32, '#5a5a5a'); ldot(x + len - wd / 2, y + wd / 2, wd * 0.32, '#5a5a5a');
  };
  // A cab: rounded shell, a lighter roof, glass along the front, and wing mirrors.
  const cab = (x, y, w, h, c, hi) => {
    lrr(x, y, w, h, 6, c);
    lrr(x + 2, y + 3, w - 12, h - 6, 4, hi);
    lrr(x + w - 9, y + 3, 7, h - 6, 2.5, GLASS);
    if (detail) lln(x + w - 7, y + 6, x + w - 4, y + 12, GLINT, 1.4);
    R0(x + w - 12, y - 3, 4, 3, '#2a2a2a'); R0(x + w - 12, y + h, 4, 3, '#2a2a2a');
  };
  const R0 = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x * S, y * S, w * S, h * S); };
  // Tyres showing either side of a lorry's body.
  const tyres = (xs) => { for (const tx of xs) { lrr(tx - 6, -23, 12, 5, 2, '#1a1a1a'); lrr(tx - 6, 18, 12, 5, 2, '#1a1a1a'); } };
  // One lorry on the loop. They all run the same way round, evenly spaced,
  // so none ever meets another.
  const lorry = (u, kind, k) => {
    const [x, y, a] = along(u);
    ctx.save(); ctx.translate(X(x + 6), Y(y + 8)); ctx.rotate(a);
    lrr(-48, -21, 94, 42, 7, 'rgba(0,0,0,0.3)');
    ctx.restore();
    ctx.save(); ctx.translate(X(x), Y(y)); ctx.rotate(a);
    tyres([-36, -20, 26]);
    if (kind === 'dump') {
      lrr(-46, -20, 58, 40, 4, '#c8901a');                                                      // the tipper body
      lrr(-44, -18, 54, 36, 3, '#e8b020');
      lrr(-41, -15, 48, 30, 10, k % 2 ? '#7a6a4c' : '#968462');                                 // its load, heaped
      ell0(-20, -3, 16, 8, k % 2 ? '#8e7c5a' : '#aa9672');
      if (detail) { for (let s = -38; s < 8; s += 9) { R0(s, -20, 2, 3, '#b07e14'); R0(s, 17, 2, 3, '#b07e14'); } }
      R0(-48, -19, 4, 38, '#b07e14');                                                           // tailgate
      R0(10, -20, 6, 40, '#b88616');                                                            // headboard over the cab
      cab(16, -18, 28, 36, '#d8a018', '#f0c040');
      if (on) { const bl = Math.sin(now * 6 + k * 1.7) > 0; ldot(24, 0, 2.6, bl ? '#ffb020' : '#7a4a10'); }   // amber beacon
    } else if (kind === 'mixer') {
      lrr(-46, -15, 62, 30, 4, '#3a3e44');
      const dg = ctx.createLinearGradient(0, -18 * S, 0, 18 * S);
      dg.addColorStop(0, '#ffffff'); dg.addColorStop(0.55, '#dfe2e4'); dg.addColorStop(1, '#a8acb0');
      ctx.fillStyle = dg; ctx.beginPath(); ctx.ellipse(-16 * S, 0, 30 * S, 18 * S, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.ellipse(-16 * S, 0, 30 * S, 18 * S, 0, 0, TAU); ctx.clip();
      ctx.strokeStyle = '#e07a20'; ctx.lineWidth = 5 * S;                                         // the drum's spiral, turning
      for (let q = 0; q < 3; q++) { const sx = -48 + ((now * 26 + q * 18) % 54); ctx.beginPath(); ctx.moveTo(sx * S, -20 * S); ctx.quadraticCurveTo((sx + 8) * S, 0, sx * S, 20 * S); ctx.stroke(); }
      ctx.restore();
      lpoly([[-46, -4], [-56, -8], [-56, 8], [-46, 4]], '#6a6e74');                                // the chute
      cab(16, -18, 28, 36, '#d03a2a', '#e86050');
    } else {                                                                                    // flatbed with steel
      lrr(-46, -17, 62, 34, 3, '#4a4e54');
      lrr(-44, -15, 58, 30, 2, '#62666c');
      for (let q = 0; q < 3; q++) { lrr(-42, -13 + q * 10, 54, 6, 1.5, STEEL); R0(-42, -12 + q * 10, 54, 1.5, 'rgba(255,255,255,0.18)'); }
      if (detail) for (const sx of [-30, -6]) R0(sx, -17, 2.5, 34, '#e8c030');                    // ratchet straps
      cab(16, -18, 28, 36, '#2a5ab0', '#4a7ad0');
    }
    if (on && night) { ldot(44, -13, 2, '#fff8e0'); ldot(44, 13, 2, '#fff8e0'); }                 // headlamps
    ldot(-47, -16, 1.8, '#c02020'); ldot(-47, 16, 1.8, '#c02020');                               // tail lamps
    ctx.restore();
    if (night && on) glow(x + Math.cos(a) * 50, y + Math.sin(a) * 50, 50, '255,244,200', 0.35);
  };
  const ell0 = (x, y, rx, ry, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x * S, y * S, rx * S, ry * S, 0, 0, TAU); ctx.fill(); };
  // Three workers in hi-vis, ambling round a spot.
  const crew = (cx, cy, g) => { for (let m = 0; m < 3; m++) {
    const a = now * (0.2 + m * 0.07) + g * 1.7 + m * 2.1;
    const wx = cx + Math.cos(a) * (30 + m * 14), wy = cy + Math.sin(a * 1.3) * (20 + m * 10);
    dot(wx + 3, wy + 4, 8, 'rgba(0,0,0,0.3)'); dot(wx, wy, 8, HIVIS); dot(wx, wy, 4.5, '#f4f4f0');
  } };
  // Laydown yard (south-east): steel, rebar, cable drums, pipe, gravel, sand.
  const laydown = () => {
    const LY = [1780, 1190, 720, 270];
    R(LY[0], LY[1], LY[2], LY[3], L('rgba(150,140,120,0.35)', 'rgba(40,36,30,0.4)', 'rgba(20,20,18,0.4)'));
    for (let k = 0; k < 4; k++) {                                                             // I-beam stacks
      R(LY[0] + 20, LY[1] + 20 + k * 22, 230, 14, L('#7a8088', '#30343a', '#1e2022'));
      if (detail) R(LY[0] + 20, LY[1] + 25 + k * 22, 230, 3, 'rgba(0,0,0,0.25)');
    }
    for (let k = 0; k < 3; k++) {                                                             // rebar bundles
      const bx = LY[0] + 290 + k * 60;
      R(bx, LY[1] + 20, 40, 120, L('#8a4a2a', '#3a2418', '#241810'));
      if (detail) for (let s = 0; s < 4; s++) R(bx + 4 + s * 9, LY[1] + 20, 2, 120, 'rgba(0,0,0,0.25)');
    }
    for (let k = 0; k < 3; k++) {                                                             // cable drums
      const cx = LY[0] + 520 + k * 60, cy = LY[1] + 70;
      dot(cx, cy, 26, L('#9a7040', '#40301c', '#2a2014')); dot(cx, cy, 10, L('#3a3a3a', '#1a1a1a', '#121212'));
    }
    for (let k = 0; k < 6; k++) dot(LY[0] + 40 + (k % 3) * 36 + (k > 2 ? 18 : 0), LY[1] + 190 - (k > 2 ? 30 : 0), 18, L('#b8bcc0', '#4a4e52', '#2a2c2e'));   // pipe stack
    heap(LY[0] + 380, LY[1] + 200, 90, 50, L('#a8a49a', '#44423e', '#282826'), L('#c4c0b6', '#504e4a', '#302f2c'));   // gravel
    heap(LY[0] + 590, LY[1] + 200, 80, 46, L('#c8aa6a', '#4c4028', '#2c261a'), L('#dcc082', '#584a30', '#342c1e'));   // sand
  };
  // Contractor's compound (south-west): cabins, cars, toilets, site board.
  const compound = () => {
    for (let k = 0; k < 4; k++) {
      const cx = 90 + k * 150, cy = 1110;
      R(cx + 6, cy + 8, 130, 60, 'rgba(0,0,0,0.3)');
      R(cx, cy, 130, 60, L('#e8eaec', '#4a4e54', '#2a2c2e'));
      for (let w2 = 0; w2 < 3; w2++) R(cx + 12 + w2 * 40, cy + 18, 26, 18, on && night ? 'rgba(255,230,170,0.9)' : L('rgba(80,130,180,0.8)', 'rgba(30,40,60,0.9)', '#1a1c1e'));
    }
    for (let k = 0; k < 5; k++) { RR(100 + k * 70, 1210, 50, 26, 6, ['#c83a2a', '#e8e8e8', '#2a5ab0', '#3a3a3a', '#e8c030'][k]); R(110 + k * 70, 1214, 12, 18, 'rgba(30,40,50,0.6)'); }
    for (let k = 0; k < 3; k++) R(500 + k * 34, 1200, 26, 40, L('#2a6ad0', '#1a3a70', '#14203a'));   // site toilets
    R(100, 1290, 640, 150, L('#14325a', '#0c1c34', '#0a1018'));
    R(100, 1290, 640, 10, '#e8c030'); R(100, 1430, 640, 10, '#e8c030');
    text('OPERATION HYPERION', 420, 1340, 48, L('#ffffff', '#c8e4ff', '#5a6470'));
    text('NATIONAL GRID INTERCONNECTOR · HYPERION STATION', 420, 1398, 20, L('#a8d4ff', '#7ab0e0', '#4a5460'));
  };

  if (P.pad < 1) {
    ctx.save(); ctx.globalAlpha *= 1 - P.pad;
    const DIRT = L('#8a7c5c', '#3a342a', '#26221c'), PIT = L('#4e4232', '#1e1a14', '#141210'), RIM = L('#9a8a68', '#403828', '#2a251e');
    // Haul road: the loop, and a track out to the gate on the south fence.
    ctx.strokeStyle = DIRT; ctx.lineWidth = 80 * S; ctx.lineJoin = 'round';
    ctx.beginPath(); LP.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(1620), Y(1140)); ctx.lineTo(X(1620), Y(1600)); ctx.stroke();
    if (detail) {                                                                               // tyre ruts
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 4 * S;
      for (const off of [-18, 18]) {
        ctx.beginPath(); ctx.moveTo(X(770 + off), Y(170 + off)); ctx.lineTo(X(1620 - off), Y(170 + off)); ctx.lineTo(X(1620 - off), Y(1140 - off)); ctx.lineTo(X(770 + off), Y(1140 - off)); ctx.closePath(); ctx.stroke();
      }
    }
    // Foundation pits inside the blueprints, with a spoil rim.
    const pit = (x, y, w, h) => { RR(x + 24, y + 24, w - 48, h - 48, 10, RIM); RR(x + 40, y + 40, w - 80, h - 80, 8, PIT); };
    pit(...HALLS[0].slice(0, 4)); pit(...HALLS[1].slice(0, 4)); pit(...YARD); pit(...CTRL);
    ctx.fillStyle = RIM; ctx.beginPath(); ctx.arc(X(SX), Y(SY), (SR - 20) * S, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PIT; ctx.beginPath(); ctx.arc(X(SX), Y(SY), (SR - 50) * S, 0, Math.PI * 2); ctx.fill();
    if (detail) {                                                                               // driven piles across the Spire's pit
      for (let ring = 1; ring <= 3; ring++) for (let k = 0; k < ring * 8; k++) {
        const a = k / (ring * 8) * Math.PI * 2, rr = ring * 110;
        dot(SX + Math.cos(a) * rr, SY + Math.sin(a) * rr, 9, L('#9ca0a4', '#44484c', '#2a2c2e'));
      }
    }
    // Survey: orange-flagged stakes on every blueprint corner.
    if (detail) {
      const stake = (x, y) => { dot(x, y, 7, '#3a2a18'); R(x, y - 26, 3, 26, '#d8d0c0'); R(x + 3, y - 26, 16, 10, '#ff6a20'); };
      for (const [x, y, w, h] of [HALLS[0], HALLS[1], YARD, CTRL]) { stake(x, y); stake(x + w, y); stake(x, y + h); stake(x + w, y + h); }
      // the total station on its tripod, a laser sweeping between stakes
      const tsx = 1660, tsy = 1180;
      for (const a of [0.5, 2.6, 4.7]) ln(tsx, tsy, tsx + Math.cos(a) * 26, tsy + Math.sin(a) * 26, '#c8a020', 4);
      dot(tsx, tsy, 10, '#e8c030');
      const la = -2.4 + Math.sin(now * 0.4) * 0.8;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ln(tsx, tsy, tsx + Math.cos(la) * 900, tsy + Math.sin(la) * 900, 'rgba(255,40,30,0.55)', 2);
      ctx.restore();
    }
    // Excavators in the pits: tracks, turning house, a boom that digs and swings.
    const digger = (x, y, ph, head) => {
      const sw = Math.sin(now * 0.6 + ph) * 0.9, dig = Math.sin(now * 1.3 + ph), reach = 70 + 40 * (0.5 + 0.5 * dig);
      const YEL = '#eab224', YEL_HI = '#f8d058', YEL_D = '#c48a14', IRON = '#3a3a3a';
      const elbow = 20 + reach * 0.58, tip = 20 + reach;
      // shadows, thrown south-east: the undercarriage, and the arm out over the pit
      ctx.save(); ctx.translate(X(x + 12), Y(y + 14)); ctx.rotate(head);
      lrr(-48, -42, 96, 84, 14, 'rgba(0,0,0,0.26)');
      ctx.rotate(sw); lrr(10, -10, tip + 14, 20, 8, 'rgba(0,0,0,0.18)');
      ctx.restore();
      ctx.save(); ctx.translate(X(x), Y(y)); ctx.rotate(head);
      // undercarriage: car body and two crawler tracks
      lrr(-28, -26, 56, 52, 8, '#2e2e2e');
      track(-48, -42, 96, 18); track(-48, 24, 96, 18);
      ctx.rotate(sw);
      ldot(0, 0, 30, '#262626');                                                                  // slewing ring
      // the house: rounded counterweight at the back, engine deck, cab on the left front
      lrr(-42, -28, 26, 56, 13, YEL_D);
      lrr(-36, -30, 62, 60, 9, YEL);
      lrr(-34, -28, 40, 22, 7, YEL_HI);
      if (detail) { for (let g = 0; g < 4; g++) R0(-30 + g * 6, 8, 3, 16, 'rgba(60,40,0,0.35)'); ldot(-10, 18, 3.2, '#222'); ldot(-10, 18, 1.6, '#555'); }   // grille, exhaust
      lrr(2, -29, 24, 22, 5, '#2a2a2a');                                                          // the cab
      lrr(4, -27, 20, 18, 4, GLASS);
      if (detail) lln(8, -25, 14, -13, GLINT, 1.6);
      // the boom and stick, hydraulic rams along them, and the bucket
      lpoly([[12, -13], [elbow, -8], [elbow, 8], [12, 13]], YEL);
      lpoly([[12, -13], [elbow, -8], [elbow, -3], [12, -4]], YEL_HI);
      lpoly([[elbow - 4, -6.5], [tip, -5], [tip, 5], [elbow - 4, 6.5]], YEL_D);
      if (detail) {
        lln(22, 0, elbow - 10, 0, '#4a4a4a', 4); lln(22, 0, 22 + (elbow - 32) * (0.55 + 0.25 * dig), 0, '#d8dde2', 2.2);
        lln(elbow + 2, 0, tip - 8, 0, '#4a4a4a', 3); lln(elbow + 2, 0, elbow + 2 + (tip - elbow - 10) * 0.6, 0, '#d8dde2', 1.6);
      }
      ldot(elbow, 0, 5, YEL_D); ldot(elbow, 0, 2, IRON);
      const open = 0.5 + 0.5 * dig;                                                               // the bucket curls in as it bites
      lpoly([[tip - 2, -14], [tip + 16 + 4 * open, -16], [tip + 16 + 4 * open, 16], [tip - 2, 14]], '#4a4a4a');
      lpoly([[tip + 1, -11], [tip + 13 + 4 * open, -12], [tip + 13 + 4 * open, 12], [tip + 1, 11]], dig < 0 ? '#7a6a4c' : '#2e2e2e');
      if (detail) for (let tth = -12; tth <= 12; tth += 6) R0(tip + 16 + 4 * open, tth - 1.2, 4, 2.4, '#8a8e92');
      ldot(tip, 0, 3, IRON);
      ctx.restore();
      if (on && night) glow(x + Math.cos(head + sw) * 60, y + Math.sin(head + sw) * 60, 90, '255,244,210', 0.3);   // work lights on the cab
      if (detail && dig < -0.85) dot(x + Math.cos(head + sw) * 120, y + Math.sin(head + sw) * 120, 22, 'rgba(160,140,110,0.35)');   // a bite of earth
    };
    digger(HALLS[0][0] + 330, HALLS[0][1] + 220, 0, 0.4);
    digger(HALLS[1][0] + 260, HALLS[1][1] + 240, 2.1, -0.6);
    digger(YARD[0] + 300, YARD[1] + 420, 4.2, 1.9);
    digger(YARD[0] + 280, YARD[1] + 820, 1.3, -2.2);
    digger(CTRL[0] + 320, CTRL[1] + 120, 3.3, 3.0);
    // The pile rig at the Spire: a tall leader mast, and a blow every 1.3 s.
    {
      const prx = SX + 160, pry = SY - 60, beat = (now % 1.3) / 1.3;
      const RED = '#d4402e', RED_HI = '#f06a50', RED_D = '#9a2a1e';
      // the hammer: dropped on the beat, then winched back up the leader
      const lift = beat < 0.06 ? 1 - beat / 0.06 : beat < 0.3 ? 0 : (beat - 0.3) / 0.7;
      ctx.save(); ctx.translate(X(prx), Y(pry));
      lrr(-46, -36, 104, 84, 12, 'rgba(0,0,0,0.26)');                                              // shadows: the rig, and the
      lpoly([[-8, -30], [8, -30], [40, -78], [24, -78]], 'rgba(0,0,0,0.2)');                       // tall leader, thrown south-east
      ctx.save(); ctx.rotate(Math.PI / 2); track(-42, 32, 84, 20); track(-42, -52, 84, 20); ctx.restore();   // tracks run north–south
      lrr(-34, -32, 68, 66, 9, RED);                                                              // the house
      lrr(-32, -30, 40, 24, 7, RED_HI);
      lrr(-34, 18, 68, 18, 8, RED_D);                                                             // counterweight
      if (detail) for (let g = 0; g < 5; g++) R0(-22 + g * 9, 22, 4, 10, 'rgba(0,0,0,0.3)');
      lrr(10, -26, 20, 22, 5, '#2a2a2a'); lrr(12, -24, 16, 18, 4, GLASS);                         // cab
      if (detail) lln(15, -22, 20, -10, GLINT, 1.4);
      // backstays from the house up to the leader
      lln(-24, 14, -6, -70, '#5a5a5a', 3); lln(24, 14, 6, -70, '#5a5a5a', 3);
      // the leader: twin rails with lattice bracing, out to the pile
      R0(-11, -112, 5, 86, RED_D); R0(6, -112, 5, 86, RED_D);
      R0(-10, -112, 2, 86, RED_HI); R0(7, -112, 2, 86, RED_HI);
      if (detail) { ctx.strokeStyle = RED; ctx.lineWidth = 1.8 * S; ctx.beginPath(); for (let v = -30, s2 = 1; v > -110; v -= 10, s2 = -s2) { ctx.moveTo(-7 * S, v * S); ctx.lineTo(7 * S, (v - 10) * S); } ctx.stroke(); }
      ldot(0, -110, 16, '#4a4e52'); ldot(0, -110, 11, '#8a8e92');                                 // the pile under the helmet
      const hr2 = 10 + 4 * lift;                                                                  // the hammer: bigger raised, nearer the eye
      ldot(3, -107, hr2, 'rgba(0,0,0,0.3)'); ldot(0, -110, hr2, '#2e2e2e'); ldot(-2, -112, hr2 * 0.55, '#5a5a5a');
      lrr(-14, -124, 28, 8, 3, '#3a3a3a'); ldot(-6, -120, 3, '#8a8e92'); ldot(6, -120, 3, '#8a8e92');   // sheave head
      if (on && night) { const bl = Math.sin(now * 4) > 0; ldot(0, -124, 3, bl ? '#ff4030' : '#601810'); }
      ctx.restore();
      if (beat < 0.25) {
        const q = beat / 0.25;
        ctx.strokeStyle = `rgba(230,210,170,${(0.6 * (1 - q)).toFixed(3)})`; ctx.lineWidth = 5 * S;
        ctx.beginPath(); ctx.arc(X(prx), Y(pry - 110), (20 + q * 90) * S, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // Spoil heaps along the north edge.
    for (const [x, rx] of [[860, 90], [1060, 120], [1300, 100], [1500, 80]]) heap(x, 80, rx, 46, L('#7a6a4c', '#302a20', '#201c16'), L('#968462', '#3c3428', '#28241c'));
    // Temporary site fence, with the gate on the haul track.
    ctx.save(); ctx.setLineDash([10 * S, 8 * S]);
    ctx.strokeStyle = L('rgba(210,215,220,0.8)', 'rgba(120,128,136,0.5)', 'rgba(70,70,70,0.5)'); ctx.lineWidth = 3 * S;
    ctx.beginPath(); ctx.moveTo(X(1570), Y(1480)); ctx.lineTo(X(16), Y(1480)); ctx.lineTo(X(16), Y(16)); ctx.lineTo(X(AW - 16), Y(16)); ctx.lineTo(X(AW - 16), Y(1480)); ctx.lineTo(X(1670), Y(1480)); ctx.stroke();
    ctx.restore();
    // Dump trucks on the haul road, dust behind them.
    for (let k = 0; k < 4; k++) {
      if (detail) for (let q = 1; q <= 3; q++) { const [dx, dy] = along(now * 0.018 + k / 4 - q * 0.006); dot(dx, dy, 18 + q * 8, `rgba(170,150,115,${(0.22 / q).toFixed(3)})`); }
      lorry(now * 0.018 + k / 4, 'dump', k);
    }
    // Workers in hi-vis, ambling round the pits.
    if (detail) [[HALLS[0][0] + 200, HALLS[0][1] + 300], [HALLS[1][0] + 420, HALLS[1][1] + 140], [YARD[0] + 150, YARD[1] + 600], [SX - 120, SY + 160], [CTRL[0] + 520, CTRL[1] + 90]].forEach(([cx, cy], g) => crew(cx, cy, g));
    ctx.restore();
  }

  // ── The site while it builds: both yards, and the mud the lorries leave ──
  if (build < 1) {
    if (P.pad >= 1) {                                                                           // tyre mud on the new concrete
      ctx.save(); ctx.lineJoin = 'round'; ctx.globalAlpha *= c01((1 - build) / 0.1);
      ctx.strokeStyle = L('rgba(120,98,62,0.13)', 'rgba(70,58,40,0.2)', 'rgba(50,44,34,0.2)'); ctx.lineWidth = 64 * S;
      ctx.beginPath(); LP.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.closePath();
      ctx.moveTo(X(1620), Y(1140)); ctx.lineTo(X(1620), Y(1500)); ctx.stroke();
      if (detail) {
        ctx.strokeStyle = 'rgba(70,54,30,0.22)'; ctx.lineWidth = 5 * S;
        for (const off of [-18, 18]) { ctx.beginPath(); ctx.moveTo(X(770 + off), Y(170 + off)); ctx.lineTo(X(1620 - off), Y(170 + off)); ctx.lineTo(X(1620 - off), Y(1140 - off)); ctx.lineTo(X(770 + off), Y(1140 - off)); ctx.closePath(); ctx.stroke(); }
      }
      ctx.restore();
    }
    if (P.hallB < 1) { ctx.save(); ctx.globalAlpha *= c01((1 - P.hallB) / 0.1); compound(); if (detail) crew(360, 1190, 5); ctx.restore(); }   // the battery array takes its place
    ctx.save(); ctx.globalAlpha *= c01((1 - build) / 0.05); laydown(); ctx.restore();
    for (const [x, y] of MASTS) dot(x, y, 14, L('#5a5a5a', '#3a3a3a', '#2a2a2a'));
  }

  // ── Conduits under everything: hall → spire → yard, and spire → control ──
  conduit([[690, 254], [844, 375]], P.hallA >= 1 && P.spire >= 1);
  conduit([[690, 734], [758, 721]], P.hallB >= 1 && P.spire >= 1);
  conduit([[SX + SR - 20, SY], [YARD[0], SY]], P.yard >= 1 && P.spire >= 1);
  conduit([[SX, SY + SR - 20], [SX, CTRL[1]]], P.ctrl >= 1 && P.spire >= 1);

  // ── Converter halls (HVDC valve halls) with cooling fans ──
  // Each hall is a barrel vault running east–west over the valve stacks: white
  // arch ribs, a glazed lantern along the crown, and a low cooling annex along
  // the south side. The DC leaves by three wall bushings in the east gable.
  const hall = (x, y, w, h, k, label) => {
    if (k < 1) { site(x, y, w, h, k, L('#27507f', '#152a44', '#222428')); return; }
    const vh = h - 112, cy = y + vh / 2;                                                     // the vault, and its crown
    R(x + 34, y + 42, w, vh, 'rgba(0,0,0,0.16)');                                            // the vault stands tall: a long shadow
    R(x + 14, y + 18, w, h, 'rgba(0,0,0,0.3)');
    // the cooling annex, a storey lower
    R(x, y + vh - 4, w, h - vh + 4, lin(x, y + vh, x, y + h, L('#e4e8ec', '#4a525c', '#232528'), L('#b0b7bf', '#2e343c', '#191b1d')));
    // the vault: sheeting, ribs, then the curve of it laid over both as light and shade
    R(x, y, w, vh, L('#2f68aa', '#17365e', '#24272b'));
    if (detail) {
      ctx.strokeStyle = L('rgba(8,24,48,0.35)', 'rgba(2,8,18,0.5)', 'rgba(0,0,0,0.3)'); ctx.lineWidth = 2 * S;
      ctx.beginPath(); for (let sx = x + 30; sx < x + w - 16; sx += 21) { ctx.moveTo(X(sx), Y(y)); ctx.lineTo(X(sx), Y(y + vh)); } ctx.stroke();
    }
    for (let q = 0; q < 6; q++) R(x + 16 + (q + 1) * (w - 32) / 7 - 6, y, 12, vh, L('#f4f7fa', '#66727f', '#32353c'));
    {
      const cg = ctx.createLinearGradient(0, Y(y), 0, Y(y + vh));
      cg.addColorStop(0, 'rgba(0,6,16,0.42)'); cg.addColorStop(0.24, 'rgba(0,0,0,0.04)'); cg.addColorStop(0.36, `rgba(255,255,255,${night || !on ? 0.10 : 0.30})`);
      cg.addColorStop(0.5, 'rgba(255,255,255,0.03)'); cg.addColorStop(0.72, 'rgba(0,6,16,0.22)'); cg.addColorStop(1, 'rgba(0,6,16,0.58)');
      R(x, y, w, vh, cg);
    }
    // the gables, and the eave's shadow on the annex roof
    R(x, y, 16, vh, lin(x, y, x, y + vh, L('#ffffff', '#687482', '#2c2f34'), L('#b9c1c9', '#353c46', '#1c1e21')));
    R(x + w - 16, y, 16, vh, lin(x, y, x, y + vh, L('#ffffff', '#687482', '#2c2f34'), L('#b9c1c9', '#353c46', '#1c1e21')));
    R(x, y + vh, w, 9, 'rgba(0,0,0,0.3)');
    // the name, on a band along the north eave
    R(x + 16, y, w - 32, 40, lin(x, y, x, y + 40, L('#f58a3c', '#9a4c1c', '#2a231e'), L('#dc6420', '#7a3a14', '#221c18')));
    R(x + 16, y + 40, w - 32, 4, 'rgba(0,0,0,0.3)');
    if (detail) text(label, x + w / 2, y + 21, 23, L('#ffffff', '#f0dcc8', '#4a4c50'), 'Arial, sans-serif');
    // The lantern along the crown. The valve hall's light shows through it,
    // brighter with the load, and a pulse runs east along it with the current.
    const vk = on ? 0.15 + 0.45 * xk * sputter + surgeK * 0.8 + startK * 0.5 : 0;
    R(x + 16, cy - 6, w - 32, 30, 'rgba(0,0,0,0.28)');
    R(x + 16, cy - 15, w - 32, 30, L('#f0f3f6', '#56606c', '#26282c'));
    R(x + 22, cy - 10, w - 44, 20, on ? (night ? `rgba(${ACC},${Math.min(1, 0.6 + 0.5 * vk).toFixed(3)})` : lin(x, cy - 10, x, cy + 10, '#d2eeff', '#62a2d0')) : '#16181b');
    if (detail) for (let sx = x + 52; sx < x + w - 26; sx += 30) R(sx - 1.5, cy - 10, 3, 20, L('#f0f3f6', '#3c444e', '#26282c'));
    if (on) {
      const pu = (now * (0.15 + 0.5 * live) + y * 0.001) % 1;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const sg = ctx.createLinearGradient(0, Y(cy - 90), 0, Y(cy + 90));                     // its light spilling down both sides of the vault
      sg.addColorStop(0, `rgba(${ACC},0)`); sg.addColorStop(0.5, `rgba(${ACC},${((night ? 0.2 : 0.05) + 0.3 * vk).toFixed(3)})`); sg.addColorStop(1, `rgba(${ACC},0)`);
      R(x + 16, cy - 90, w - 32, 180, sg);
      glow(x + 22 + pu * (w - 44), cy, 60, ACC, night ? 0.7 : 0.45); R(x + 2 + pu * (w - 44), cy - 5, 44, 10, 'rgba(255,255,255,0.9)');
      ctx.restore();
      ctx.strokeStyle = `rgba(${ACC},${(0.35 + 0.4 * live + 0.25 * surgeK).toFixed(3)})`; ctx.lineWidth = 4 * S;       // lit trim round the eaves
      ctx.strokeRect(X(x + 5), Y(y + 5), (w - 10) * S, (h - 10) * S);
    }
    // five fans in the annex roof, spinning with the load
    for (let k2 = 0; k2 < 5; k2++) {
      const fx2 = x + 62 + k2 * (w - 124) / 4, fy2 = y + vh + 60;
      dot(fx2 + 4, fy2 + 5, 42, 'rgba(0,0,0,0.25)');
      dot(fx2, fy2, 42, lin(fx2 - 30, fy2 - 30, fx2 + 30, fy2 + 30, L('#fafbfc', '#6a7480', '#2c2e32'), L('#8c959f', '#2a3038', '#17181a')));
      dot(fx2, fy2, 35, L('#191d23', '#080a0d', '#0a0b0c'));
      if (on && night) glow(fx2, fy2, 44, ACC, 0.16 + 0.22 * live);
      if (detail) {
        ctx.save(); ctx.translate(X(fx2), Y(fy2)); ctx.rotate(now * (on ? 3 + 9 * live : 0) + k2);
        ctx.fillStyle = L('#c8ced4', '#5a626c', '#2a2c30');
        for (let b = 0; b < 5; b++) { ctx.rotate(TAU / 5); ctx.beginPath(); ctx.moveTo(4 * S, -3 * S); ctx.lineTo(32 * S, -10 * S); ctx.lineTo(32 * S, 5 * S); ctx.lineTo(4 * S, 4 * S); ctx.closePath(); ctx.fill(); }
        ctx.restore();
        if (on) dot(fx2, fy2, 32, 'rgba(200,214,228,0.10)');                                // blade blur
        const gc = L('rgba(240,243,246,0.8)', 'rgba(120,130,142,0.6)', 'rgba(70,72,76,0.6)');                         // the guard
        ctx.strokeStyle = gc; ctx.lineWidth = 2.5 * S;
        ctx.beginPath(); ctx.moveTo(X(fx2 - 35), Y(fy2)); ctx.lineTo(X(fx2 + 35), Y(fy2)); ctx.moveTo(X(fx2), Y(fy2 - 35)); ctx.lineTo(X(fx2), Y(fy2 + 35)); ctx.stroke();
        arc(fx2, fy2, 19, gc, 2);
      }
      dot(fx2, fy2, 8, L('#eef1f4', '#6a7480', '#2c2e32'));
    }
    // the east gable: three ribbed wall bushings reaching out toward the Spire
    R(x + w - 4, cy - 64, 36, 144, 'rgba(0,0,0,0.25)');
    RR(x + w - 12, cy - 74, 36, 148, 6, L('#3a4048', '#15181c', '#101112'));
    for (let b = -1; b <= 1; b++) {
      const by = cy + b * 46;
      R(x + w + 12, by + 7, 80, 12, 'rgba(0,0,0,0.25)');
      R(x + w + 2, by - 7, 78, 14, CERAMIC);
      if (detail) for (let q = 0; q < 7; q++) RR(x + w + 9 + q * 10, by - 12, 5, 24, 2, CERAMIC_HI);
      dot(x + w + 86, by, 14, L('#d2d8de', '#59626c', '#2a2c2e')); dot(x + w + 86, by, 8, on ? `rgba(${ACC},0.95)` : '#26282a');
      if (on) glow(x + w + 86, by, 50, ACC, 0.25 + 0.4 * live + 0.5 * surgeK);
    }
  };
  for (const [x, y, w, h, k, label] of HALLS) hall(x, y, w, h, k, label);

  // ── Battery array under the halls ──
  // A marked compound of storage containers, three rows of nine, with a
  // cable tray between the rows carrying their charge east.
  if (P.hallB >= 1) {
    RR(56, 1076, 660, 332, 8, L('#3e434a', '#14171b', '#131415'));
    ctx.strokeStyle = L('rgba(240,200,40,0.7)', 'rgba(170,140,30,0.45)', 'rgba(90,80,20,0.3)'); ctx.lineWidth = 3 * S;
    ctx.strokeRect(X(61), Y(1081), 650 * S, 322 * S);
    for (let r = 0; r < 2; r++) {
      const ty = 1090 + r * 108 + 90;
      R(66, ty, 640, 12, L('#262a30', '#0c0e11', '#0c0d0e'));
      if (on && detail) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.setLineDash([18 * S, 40 * S]); ctx.lineDashOffset = -now * (40 + 90 * live) * S;
        ctx.strokeStyle = `rgba(${ACC},${(0.45 + 0.4 * live).toFixed(3)})`; ctx.lineWidth = 4 * S;
        ctx.beginPath(); ctx.moveTo(X(66), Y(ty + 6)); ctx.lineTo(X(706), Y(ty + 6)); ctx.stroke(); ctx.restore();
      }
    }
    const BODY = L('#eef0f2', '#565c64', '#2a2c2e'), BODY_SH = L('#c2c7cc', '#3c4148', '#202224');
    for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) {
      const bx = 70 + c * 72, by = 1090 + r * 108;
      R(bx + 7, by + 9, 58, 86, 'rgba(0,0,0,0.32)');
      RR(bx, by, 58, 86, 4, BODY);
      R(bx + 44, by + 2, 12, 82, BODY_SH);                                                   // the shaded side
      R(bx + 5, by + 6, 48, 10, L('#2f74c0', '#1a3c66', '#1a1c1e'));
      if (detail) {
        for (let q = 0; q < 3; q++) R(bx + 5, by + 23 + q * 10, 36, 2, 'rgba(0,0,0,0.13)');  // roof ribs
        dot(bx + 44, by + 33, 8, L('#3a4048', '#15181c', '#101112')); dot(bx + 44, by + 33, 3, L('#9aa2aa', '#4a525c', '#26282a'));   // its chiller
      }
      if (on && detail) {
        const lv = 0.5 + 0.5 * Math.sin(now * 0.8 + c * 0.6 + r * 1.7);
        for (let i = 0; i < 5; i++) R(bx + 8 + i * 9, by + 60, 6, 18, i / 5 < lv ? (gold ? '#ffd890' : '#7ae0a0') : 'rgba(20,30,30,0.6)');
        if (night) glow(bx + 29, by + 69, 34, gold ? '255,216,144' : '122,224,160', 0.16);
      }
    }
    if (detail) text('GRID STORAGE · 27 UNITS', 386, 1424, 17, L('rgba(255,255,255,0.6)', 'rgba(170,205,235,0.4)', 'rgba(110,110,110,0.4)'), 'Arial, sans-serif');
  }

  // ── Control building, status board, radar dish, helipad ──
  const [CX0, CY0, CW, CH] = CTRL;
  if (P.ctrl < 1) site(CX0, CY0, CW, CH, P.ctrl, L('#1e2a3a', '#0e1620', '#121416'));
  else {
    // the walk from the front door to the gate on the road
    R(CX0 + CW / 2 - 34, CY0 + CH, 68, 1488 - CY0 - CH, L('#8f969e', '#2a3038', '#1e2022'));
    R(CX0 + CW / 2 - 34, CY0 + CH, 4, 1488 - CY0 - CH, BRASS); R(CX0 + CW / 2 + 30, CY0 + CH, 4, 1488 - CY0 - CH, BRASS);
    R(CX0 + 24, CY0 + 30, CW, CH, 'rgba(0,0,0,0.18)');
    R(CX0 + 11, CY0 + 14, CW, CH, 'rgba(0,0,0,0.3)');
    RR(CX0, CY0, CW, CH, 10, lin(CX0, CY0, CX0 + CW, CY0 + CH, L('#eef1f4', '#4a535e', '#232528'), L('#b5bcc4', '#2c333c', '#191b1d')));     // parapet
    RR(CX0 + 10, CY0 + 10, CW - 20, CH - 20, 6, lin(CX0, CY0, CX0, CY0 + CH, L('#27384e', '#121c2a', '#141618'), L('#18243a', '#0b121c', '#0f1012')));
    // the status board, in a deep bezel
    RR(CX0 + 22, CY0 + 16, CW - 44, 120, 9, L('#3a4654', '#1a222c', '#16181a'));
    RR(CX0 + 30, CY0 + 22, CW - 60, 108, 6, '#05080c');
    if (on) {
      const bg = ctx.createLinearGradient(0, Y(CY0 + 22), 0, Y(CY0 + 130));
      bg.addColorStop(0, `rgba(${ACC},0.16)`); bg.addColorStop(0.5, `rgba(${ACC},0.03)`); bg.addColorStop(1, `rgba(${ACC},0.12)`);
      RR(CX0 + 30, CY0 + 22, CW - 60, 108, 6, bg);
      if (detail) {
        R(CX0 + 30, CY0 + 22 + ((now * 26) % 104), CW - 60, 4, `rgba(${ACC},0.10)`);                                 // a scan line
        for (let q = 0; q < 2; q++) R(CX0 + 44, CY0 + 34 + q * 78, CW - 88, 2, `rgba(${ACC},0.35)`);
      }
      ctx.strokeStyle = `rgba(${ACC},${(0.45 + 0.3 * live).toFixed(3)})`; ctx.lineWidth = 2.5 * S;
      ctx.beginPath(); ctx.roundRect(X(CX0 + 30), Y(CY0 + 22), (CW - 60) * S, 108 * S, 6 * S); ctx.stroke();
    }
    // a rooflight over the control room, lit from below after dark
    RR(CX0 + 28, CY0 + 146, CW - 150, 32, 4, L('#dfe3e7', '#3c444e', '#202224'));
    if (detail) for (let c = 0; c < 17; c++) R(CX0 + 33 + c * ((CW - 160) / 17), CY0 + 151, (CW - 160) / 17 - 5, 22, on ? (gold ? '#ffd890' : night ? '#9adcff' : '#7fb4dc') : '#141618');
    else R(CX0 + 33, CY0 + 151, CW - 160, 22, on ? (gold ? '#ffd890' : night ? '#9adcff' : '#7fb4dc') : '#141618');
    if (on && night) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const wg2 = ctx.createLinearGradient(0, Y(CY0 + 120), 0, Y(CY0 + 206)); wg2.addColorStop(0, `rgba(${ACC},0)`); wg2.addColorStop(0.5, `rgba(${ACC},0.22)`); wg2.addColorStop(1, `rgba(${ACC},0)`); R(CX0 + 28, CY0 + 120, CW - 150, 86, wg2); ctx.restore(); }
    // rooftop plant: three chillers and a comms mast with its beacon
    for (let q = 0; q < 3; q++) {
      const ax = CX0 + 96 + q * 74, ay = CY0 + 190;
      R(ax + 5, ay + 6, 58, 32, 'rgba(0,0,0,0.3)'); RR(ax, ay, 58, 32, 3, L('#d6dade', '#444b54', '#222426'));
      if (detail) { dot(ax + 16, ay + 16, 10, L('#30363e', '#101318', '#0e0f11')); dot(ax + 42, ay + 16, 10, L('#30363e', '#101318', '#0e0f11')); dot(ax + 16, ay + 16, 3, L('#aab2ba', '#4a525c', '#26282a')); dot(ax + 42, ay + 16, 3, L('#aab2ba', '#4a525c', '#26282a')); }
    }
    {
      const mx = CX0 + 52, my2 = CY0 + 206;
      ln(mx + 6, my2 + 8, mx + 58, my2 + 66, 'rgba(0,0,0,0.25)', 5);
      R(mx - 12, my2 - 12, 24, 24, L('#e85a2c', '#8a3a20', '#34363a')); R(mx - 6, my2 - 6, 12, 12, L('#f2f5f8', '#8a96a4', '#2c2e32'));
      const bl = on && Math.sin(now * 3) > 0;
      dot(mx, my2, 4, bl ? '#ff4030' : '#601810'); if (bl && night) glow(mx, my2, 44, '255,60,40', 0.55);
    }
    // radar dish on the roof
    const dx = CX0 + CW - 62, dy = CY0 + CH - 60;
    dot(dx + 9, dy + 11, 38, 'rgba(0,0,0,0.3)');
    dot(dx, dy, 38, lin(dx - 30, dy - 30, dx + 30, dy + 30, L('#f6f8fa', '#646c78', '#2a2c2e'), L('#a8b0b8', '#343a43', '#1c1e20')));
    dot(dx - 3, dy - 3, 29, L('#cfd5db', '#474e58', '#232527'));
    if (detail) {
      ctx.save(); ctx.translate(X(dx), Y(dy)); ctx.rotate(on ? now * 0.8 : 0.6);
      ctx.strokeStyle = L('#6a7078', '#8a96a4', '#34363a'); ctx.lineWidth = 4 * S;
      ctx.beginPath(); ctx.moveTo(-32 * S, 0); ctx.lineTo(32 * S, 0); ctx.stroke();
      ctx.fillStyle = on ? `rgba(${ACC},0.8)` : '#303234'; ctx.fillRect(28 * S, -6 * S, 10 * S, 12 * S);
      ctx.restore();
    }
    dot(dx, dy, 6, L('#59616b', '#8a96a4', '#34363a'));
    // the front door: a glass canopy over the steps
    R(CX0 + CW / 2 - 64, CY0 + CH + 6, 140, 30, 'rgba(0,0,0,0.25)');
    RR(CX0 + CW / 2 - 72, CY0 + CH - 8, 144, 36, 5, L('rgba(170,214,240,0.85)', 'rgba(60,100,140,0.8)', 'rgba(40,44,50,0.9)'));
    if (detail) for (let q = 1; q < 4; q++) R(CX0 + CW / 2 - 72 + q * 36 - 1.5, CY0 + CH - 8, 3, 36, L('#eef1f4', '#4a535e', '#232528'));
    if (on && night) glow(CX0 + CW / 2, CY0 + CH + 16, 110, '255,236,190', 0.35);
    // the gate on the road: a booth and a striped barrier
    RR(CX0 + CW / 2 + 44, 1452, 40, 40, 4, L('#eef1f4', '#4a535e', '#232528')); R(CX0 + CW / 2 + 50, 1458, 28, 14, on && night ? 'rgba(255,230,170,0.95)' : L('rgba(60,110,160,0.85)', 'rgba(30,40,60,0.9)', '#1a1c1e'));
    for (let q = 0; q < 6; q++) R(CX0 + CW / 2 - 36 + q * 13, 1482, 13, 6, q % 2 ? '#f2f2ee' : '#d83a2a');
    // helipad
    const hx = CX0 + CW + 150, hy = CY0 + CH / 2;
    dot(hx, hy, 106, L('#e8c030', '#806a1c', '#3a3418'));
    dot(hx, hy, 100, L('#5a5e64', '#22262a', '#16181a'));
    dot(hx, hy, 92, lin(hx - 80, hy - 80, hx + 80, hy + 80, L('#444950', '#1e2126', '#131517'), L('#33373d', '#15171a', '#0e1012')));
    if (detail) {
      ctx.strokeStyle = L('#f0f0e0', '#8a8a80', '#4a4a48'); ctx.lineWidth = 5 * S;
      ctx.beginPath(); ctx.arc(X(hx), Y(hy), 80 * S, 0, Math.PI * 2); ctx.stroke();
      text('H', hx, hy, 84, L('#f0f0e0', '#8a8a80', '#4a4a48'), 'Arial, sans-serif');
      poly([[hx, hy - 78], [hx - 9, hy - 62], [hx + 9, hy - 62]], L('#e8c030', '#806a1c', '#3a3418'));
      if (on) for (let k2 = 0; k2 < 12; k2++) {
        const a = k2 / 12 * Math.PI * 2, lit = (Math.floor(now * 3) + k2) % 12 < 3;
        dot(hx + Math.cos(a) * 99, hy + Math.sin(a) * 99, 4, lit ? '#ffe080' : '#6a5a20');
        if (lit && night) glow(hx + Math.cos(a) * 99, hy + Math.sin(a) * 99, 26, '255,210,100', 0.5);
      }
    }
  }

  // ── The grounds, once the builders have gone ──
  // Where the laydown yard stood: a lawn with the project's name on a stone
  // wall, three flags and a ring of trees, and the staff car park beside it.
  if (build >= 1) {
    const GX = 1800, GY = 1204;
    RR(GX, GY, 420, 246, 16, L('#c4cad0', '#3c434c', '#26282a'));
    RR(GX + 6, GY + 6, 408, 234, 11, lin(GX, GY, GX + 420, GY + 246, L('#74a85a', '#16271b', '#1e231f'), L('#56894a', '#0f1c13', '#181c19')));
    if (detail) { ctx.save(); ctx.beginPath(); ctx.roundRect(X(GX + 6), Y(GY + 6), 408 * S, 234 * S, 11 * S); ctx.clip(); for (let q = 0; q < 7; q++) R(GX + 6 + q * 64, GY + 6, 32, 234, 'rgba(255,255,255,0.045)'); ctx.restore(); }   // mown stripes
    R(GX + 54, GY + 98, 320, 74, 'rgba(0,0,0,0.3)');
    RR(GX + 44, GY + 86, 320, 74, 5, lin(GX, GY + 86, GX, GY + 160, L('#1b3f70', '#0e2038', '#0c1118'), L('#122c52', '#0a1626', '#0a0e14')));
    R(GX + 44, GY + 86, 320, 7, BRASS); R(GX + 44, GY + 153, 320, 7, BRASS);
    text('OPERATION HYPERION', GX + 204, GY + 115, 24, L('#ffffff', '#d4ecff', '#5a6470'));
    if (detail) text('NATIONAL GRID INTERCONNECTOR', GX + 204, GY + 140, 12, L('#a8d4ff', '#7ab0e0', '#4a5460'), 'Arial, sans-serif');
    if (on && night) for (const ux of [GX + 90, GX + 204, GX + 318]) glow(ux, GY + 168, 80, '255,236,190', 0.3);
    const tree = (x, y, r) => {
      ell(x + r * 0.5, y + r * 0.6, r, r * 0.9, 'rgba(0,0,0,0.28)');
      dot(x, y, r, L('#2f6a34', '#0b1a10', '#161b17')); dot(x - r * 0.2, y - r * 0.22, r * 0.72, L('#479046', '#102416', '#1a201b')); dot(x - r * 0.38, y - r * 0.4, r * 0.36, L('#74b862', '#18301e', '#1e2520'));
    };
    for (const [tx, ty, tr] of [[GX + 40, GY + 42, 24], [GX + 112, GY + 36, 19], [GX + 300, GY + 38, 21], [GX + 378, GY + 46, 25], [GX + 384, GY + 196, 22], [GX + 30, GY + 204, 20]]) tree(tx, ty, tr);
    for (let q = 0; q < 3; q++) {                                                           // the flags
      const fx2 = GX + 124 + q * 80, fy2 = GY + 204, wv = Math.sin(now * 2.4 + q * 1.3) * 5;
      ln(fx2 + 4, fy2 + 5, fx2 + 46, fy2 + 52, 'rgba(0,0,0,0.25)', 3);
      poly([[fx2, fy2 - 9], [fx2 + 20, fy2 - 11 + wv], [fx2 + 40, fy2 - 7 - wv], [fx2 + 40, fy2 + 9 - wv], [fx2 + 20, fy2 + 5 + wv], [fx2, fy2 + 7]], [L('#2a62b8', '#16325e', '#22262c'), gold ? L('#f0c040', '#8a6e24', '#34322a') : L('#f4f6f8', '#6a7480', '#2c2e32'), L('#e8742c', '#8a4218', '#2a2420')][q]);
      dot(fx2, fy2, 5, L('#eef1f4', '#8a96a4', '#34363a'));
    }
    // the car park
    const PX = 2250, PY = 1204;
    RR(PX, PY, 272, 246, 8, L('#41464d', '#15181b', '#131415'));
    if (detail) {
      ctx.strokeStyle = L('rgba(255,255,255,0.7)', 'rgba(255,255,255,0.25)', 'rgba(110,110,110,0.3)'); ctx.lineWidth = 2.5 * S; ctx.beginPath();
      for (let q = 0; q <= 6; q++) { ctx.moveTo(X(PX + 10 + q * 42), Y(PY + 8)); ctx.lineTo(X(PX + 10 + q * 42), Y(PY + 82)); ctx.moveTo(X(PX + 10 + q * 42), Y(PY + 164)); ctx.lineTo(X(PX + 10 + q * 42), Y(PY + 238)); }
      ctx.stroke();
    }
    const CARS = ['#c83a2a', '#e8e8e8', '#2a5ab0', '#3a3a3a', '#e8c030', '#7a8894', '#2f8272'];
    for (let q = 0; q < 12; q++) {
      if ((q * 7 + 3) % 5 === 0) continue;
      const bx = PX + 16 + (q % 6) * 42, by = q < 6 ? PY + 14 : PY + 172;
      RR(bx + 3, by + 4, 30, 60, 7, 'rgba(0,0,0,0.3)'); RR(bx, by, 30, 60, 7, CARS[(q * 3) % 7]);
      if (detail) { RR(bx + 4, by + (q < 6 ? 34 : 12), 22, 14, 3, 'rgba(24,36,50,0.75)'); R(bx + 4, by + 24, 22, 8, 'rgba(255,255,255,0.14)'); }
    }
    if (night || !on) RR(PX, PY, 272, 246, 8, 'rgba(6,10,16,0.5)');                            // the cars go dark with everything else
    if (on && night) for (const [lx, ly] of [[PX + 136, PY + 123], [GX + 204, GY + 222]]) { glow(lx, ly, 190, '255,236,190', 0.22); dot(lx, ly, 6, '#fff6d8'); }
  }

  // ── Switchyard: three line bays, one for each pylon ──
  // The Spire's feed comes in on the west side to a pair of busbars running
  // the length of the yard. Each bay taps them through two converter
  // transformers (radiator banks, conservator, three bushings), then three
  // phases run east through a breaker and a disconnector apiece to the bay's
  // portal gantry, and out to its pylon. Service lanes divide the bays.
  // Going in: the gravel bed is spread from the north, plinths are cast, and
  // the kit is set down on them one piece at a time.
  if (P.yard <= 0) blueprint(YARD[0], YARD[1], YARD[2], YARD[3]);
  else {
    const [YX, YY, YW, YH] = YARD, PH3 = [-70, 0, 70];
    const KIT = [];
    PYL.forEach(([, qy], b) => {
      KIT.push(['tx', YX + 118, qy - 108, b], ['tx', YX + 118, qy + 8, b]);
      for (const d of PH3) KIT.push(['brk', YX + 336, qy + d, b]);
      for (const d of PH3) KIT.push(['dis', YX + 408, qy + d, b]);
      KIT.push(['portal', YX + 484, qy, b]);
    });
    const bed = YH * c01(P.yard / 0.2), set = P.yard >= 1 ? KIT.length : Math.floor(KIT.length * c01((P.yard - 0.15) / 0.8));
    const done = P.yard >= 1, hot = on && (xk > 0.01 || firing);
    const WIRE = L('rgba(34,40,48,0.9)', 'rgba(150,162,176,0.55)', 'rgba(60,60,62,0.6)');
    const TEAL = L('#2f8a78', '#17463e', '#1c1e20'), TEAL_HI = L('#4fb09c', '#235e54', '#232629'), FIN = L('#cfd5db', '#48505a', '#26282a');
    if (!done) blueprint(YX, YY, YW, YH);
    if (done) { R(YX - 2, YY - 2, YW + 14, YH + 16, 'rgba(0,0,0,0.22)'); R(YX - 8, YY - 8, YW + 16, YH + 16, L('#c4cad0', '#3c434c', '#26282a')); }   // kerb
    R(YX, YY, YW, bed, lin(YX, YY, YX + YW, YY + YH, L('#9aa0a7', '#262a30', '#1c1d1f'), L('#7f858d', '#1c2025', '#161718')));       // gravel
    if (done) {
      for (const ly of [450, 830]) {                                                        // service lanes between the bays
        R(YX, ly - 26, YW, 52, L('#b9bec4', '#30353c', '#202224'));
        if (detail) for (let lx = YX + 14; lx < YX + YW - 30; lx += 60) R(lx, ly - 2, 30, 4, L('rgba(240,200,40,0.75)', 'rgba(170,140,30,0.45)', 'rgba(90,80,20,0.3)'));
      }
      if (detail) {                                                                         // chain-link fence inside the kerb
        ctx.save(); ctx.setLineDash([3 * S, 21 * S]); ctx.strokeStyle = L('rgba(60,66,74,0.9)', 'rgba(150,160,172,0.5)', 'rgba(80,80,82,0.5)'); ctx.lineWidth = 7 * S;
        ctx.strokeRect(X(YX + 8), Y(YY + 8), (YW - 16) * S, (YH - 16) * S); ctx.restore();
        ctx.strokeStyle = L('rgba(240,243,246,0.55)', 'rgba(150,160,172,0.3)', 'rgba(80,80,82,0.3)'); ctx.lineWidth = 1.5 * S;
        ctx.strokeRect(X(YX + 8), Y(YY + 8), (YW - 16) * S, (YH - 16) * S);
      }
      // the two busbars: tube on post insulators, the Spire's feed landing on them
      for (const bx of [YX + 44, YX + 76]) {
        R(bx + 1, YY + 34, 9, YH - 60, 'rgba(0,0,0,0.25)');
        R(bx - 4, YY + 28, 8, YH - 56, L('#d2d8de', '#6a7480', '#303234')); R(bx - 4, YY + 28, 2.5, YH - 56, L('#ffffff', '#98a4b0', '#3c3e42'));
        for (let py = YY + 44; py < YY + YH - 30; py += 76) { dot(bx, py, 9, CERAMIC); dot(bx, py, 4.5, CERAMIC_HI); }
      }
      R(YX, SY - 8, 80, 16, L('#3a4048', '#15181c', '#101112'));
      for (const [, qy] of PYL) RR(YX + 100, qy - 124, YW - 124, 248, 8, L('rgba(255,255,255,0.10)', 'rgba(255,255,255,0.035)', 'rgba(255,255,255,0.02)'));   // each bay's slab
      // each bay's conductors, under the kit
      ctx.strokeStyle = WIRE; ctx.lineWidth = 3.5 * S; ctx.beginPath();
      for (const [, qy] of PYL) {
        for (const ty of [qy - 58, qy + 58]) { ctx.moveTo(X(YX + 44), Y(ty - 8)); ctx.lineTo(X(YX + 122), Y(ty - 8)); ctx.moveTo(X(YX + 76), Y(ty + 8)); ctx.lineTo(X(YX + 122), Y(ty + 8)); }
        ctx.moveTo(X(YX + 290), Y(qy - 84)); ctx.lineTo(X(YX + 290), Y(qy + 84));
        for (const d of PH3) { ctx.moveTo(X(YX + 290), Y(qy + d)); ctx.lineTo(X(YX + 484), Y(qy + d)); }
      }
      ctx.stroke();
    }
    const item = ([kind, x, y, b], i) => {
      if (i >= set) {                                                                       // still a bare plinth
        const [pw, ph] = kind === 'tx' ? [150, 100] : kind === 'portal' ? [26, 200] : [40, 26], px0 = kind === 'tx' ? x : x - pw / 2, py0 = kind === 'tx' ? y : y - ph / 2;
        if (py0 + ph <= YY + bed) R(px0, py0, pw, ph, L('#b4b8b0', '#3a3e3a', '#242522'));
        if (i === set) weld(px0 + pw / 2, py0 + ph / 2, i * 3);
        return;
      }
      const wave = hot ? xk * sputter * (0.1 + 0.4 * Math.max(0, Math.sin(now * 2.6 - (x - YX) * 0.012 - b * 0.7))) + 0.45 * surgeK + 0.5 * startK : 0;
      if (kind === 'tx') {
        RR(x - 8, y - 6, 166, 112, 5, L('#b4b9bf', '#2f343b', '#202224'));                   // the bund
        R(x + 12, y + 14, 140, 84, 'rgba(0,0,0,0.32)');
        R(x + 10, y, 100, 24, FIN); R(x + 10, y + 76, 100, 24, FIN);                       // radiator banks
        if (detail) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let q = 0; q < 12; q++) { ctx.fillRect(X(x + 13 + q * 8), Y(y), 3 * S, 24 * S); ctx.fillRect(X(x + 13 + q * 8), Y(y + 76), 3 * S, 24 * S); } }
        RR(x + 2, y + 20, 116, 60, 6, TEAL);
        R(x + 6, y + 23, 108, 7, TEAL_HI); R(x + 6, y + 68, 108, 9, 'rgba(0,0,0,0.22)');
        RR(x + 22, y + 40, 72, 18, 9, L('#e4e8ec', '#59626c', '#2c2e32')); R(x + 30, y + 43, 56, 4, L('#ffffff', '#7c8894', '#383a3e'));   // conservator
        for (let q = 0; q < 3; q++) {
          const by = y + 28 + q * 22;
          R(x + 116, by - 4, 28, 8, CERAMIC); if (detail) for (let r = 0; r < 3; r++) R(x + 120 + r * 8, by - 6, 3, 12, CERAMIC_HI);
          dot(x + 147, by, 6.5, on ? `rgba(${ACC},0.95)` : '#2a2c2e');
        }
        ln(x + 147, y + 28, YX + 290, y + 28, WIRE, 3); ln(x + 147, y + 72, YX + 290, y + 72, WIRE, 3); ln(x + 147, y + 50, YX + 290, y + 50, WIRE, 3);
        if (wave > 0) glow(x + 60, y + 50, 120, ACC, 0.5 * wave);
      } else if (kind === 'brk') {
        R(x - 22, y + 2, 52, 14, 'rgba(0,0,0,0.3)');
        R(x - 28, y - 6, 56, 12, CERAMIC); if (detail) for (let r = 0; r < 6; r++) { if (r !== 2 && r !== 3) R(x - 25 + r * 9, y - 9, 4, 18, CERAMIC_HI); }
        RR(x - 11, y - 13, 22, 26, 3, L('#59616b', '#22262c', '#161718')); dot(x, y, 5, on ? (gold ? '#ffd890' : '#7ae0a0') : '#26282a');
      } else if (kind === 'dis') {
        dot(x - 20, y + 3, 9, 'rgba(0,0,0,0.3)'); dot(x + 24, y + 3, 9, 'rgba(0,0,0,0.3)');
        dot(x - 22, y, 9, CERAMIC); dot(x + 22, y, 9, CERAMIC); dot(x - 22, y, 4.5, CERAMIC_HI); dot(x + 22, y, 4.5, CERAMIC_HI);
        R(x - 22, y - 3, 44, 6, L('#e4e8ec', '#8a96a4', '#34363a'));
      } else {                                                                              // the portal: a lattice beam on two legs
        R(x - 3, y - 100, 16, 212, 'rgba(0,0,0,0.25)');
        R(x - 8, y - 104, 16, 208, L('#e6b030', '#735818', '#18191a')); R(x - 8, y - 104, 4, 208, L('#ffd860', '#8f7024', '#202123'));
        if (detail) { ctx.strokeStyle = 'rgba(70,50,0,0.5)'; ctx.lineWidth = 2 * S; ctx.beginPath(); for (let u = -104, s2 = 1; u < 104; u += 16, s2 = -s2) { ctx.moveTo(X(x - 7 * s2), Y(y + u)); ctx.lineTo(X(x + 7 * s2), Y(y + u + 16)); } ctx.stroke(); }
        for (const e2 of [-112, 112]) { R(x - 9, y + e2 - 7, 26, 26, 'rgba(0,0,0,0.25)'); R(x - 13, y + e2 - 13, 26, 26, L('#f2f5f8', '#6a7480', '#2c2e32')); R(x - 7, y + e2 - 7, 14, 14, L('#59616b', '#22262c', '#161718')); }
        for (const d of PH3) { dot(x, y + d, 9, CERAMIC); dot(x, y + d, 5, on ? `rgba(${ACC},${(0.6 + 0.4 * live).toFixed(3)})` : '#2a2c2e'); }
        if (on) glow(x, y, 130, ACC, 0.1 + 0.2 * live + 0.4 * wave);
      }
    };
    KIT.forEach(item);
    if (done) {
      if (hot && detail) {                                                                  // current running east along every phase
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.setLineDash([26 * S, 54 * S]); ctx.lineDashOffset = -now * 220 * S;
        ctx.strokeStyle = `rgba(${ACC},${(0.6 + 0.4 * surgeK).toFixed(3)})`; ctx.lineWidth = 5 * S; ctx.beginPath();
        for (const [, qy] of PYL) for (const d of PH3) { ctx.moveTo(X(YX + 290), Y(qy + d)); ctx.lineTo(X(YX + 484), Y(qy + d)); }
        for (const bx of [YX + 44, YX + 76]) { ctx.moveTo(X(bx), Y(SY)); ctx.lineTo(X(bx), Y(YY + 28)); ctx.moveTo(X(bx), Y(SY)); ctx.lineTo(X(bx), Y(YY + YH - 28)); }
        ctx.stroke(); ctx.restore();
      }
      // lightning masts at the corners, a beacon on each
      for (const [mx, my2] of [[YX + 26, YY + 26], [YX + YW - 26, YY + 26], [YX + 26, YY + YH - 26], [YX + YW - 26, YY + YH - 26]]) {
        ln(mx + 4, my2 + 5, mx + 70, my2 + 84, 'rgba(0,0,0,0.22)', 4);
        dot(mx, my2, 11, L('#f2f5f8', '#6a7480', '#2c2e32')); dot(mx, my2, 6, L('#e85a2c', '#8a3a20', '#34363a'));
        const bl = on && Math.sin(now * 3 + mx) > 0;
        dot(mx, my2, 3, bl ? '#ff4030' : '#601810'); if (bl && night) glow(mx, my2, 40, '255,60,40', 0.5);
      }
      if (detail) text('SWITCHYARD · 400 kV', YX + YW / 2 + 30, YY + 40, 18, L('rgba(255,255,255,0.75)', 'rgba(170,205,235,0.45)', 'rgba(110,110,110,0.4)'), 'Arial, sans-serif');
    }
    // Commissioning surge: arcs racing across the yard.
    if ((firing || surgeFx > 0) && detail) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = 'rgba(122,216,255,1)'; ctx.shadowBlur = 20 * S;
      ctx.strokeStyle = `rgba(210,245,255,${Math.max(surgeK, surgeFx).toFixed(3)})`; ctx.lineWidth = 3.4 * S;
      for (let k2 = 0; k2 < 7; k2++) {
        let x0 = YX + 20 + Math.random() * (YW - 40), y0 = YY + 20 + Math.random() * 980;
        ctx.beginPath(); ctx.moveTo(X(x0), Y(y0));
        for (let j = 0; j < 7; j++) { x0 += (Math.random() - 0.5) * 100; y0 += 24 + Math.random() * 40; ctx.lineTo(X(x0), Y(y0)); }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ── The Hyperion Spire ──
  if (P.spire < 1) {
    ctx.save(); ctx.setLineDash([16 * S, 12 * S]); ctx.strokeStyle = 'rgba(122,216,255,0.8)'; ctx.lineWidth = 4 * S;
    ctx.beginPath(); ctx.arc(X(SX), Y(SY), (SR + 16) * S, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    // Going up: the ring's base slab, its 36 track segments set one by one
    // clockwise from the north, the inner floors, then the globe's ribs.
    if (P.spire > 0) {
      const k = P.spire, segs = Math.floor(36 * c01((k - 0.1) / 0.55)), ik = c01((k - 0.62) / 0.2), gk = c01((k - 0.8) / 0.2);
      ctx.save(); ctx.globalAlpha *= c01(k / 0.1);
      dot(SX + 12, SY + 16, SR + 4, 'rgba(0,0,0,0.22)');
      dot(SX, SY, SR, L('#22385a', '#101c30', '#16181b'));
      dot(SX, SY, SR - 22, L('#35598a', '#1a2e4c', '#1e2024'));
      ctx.restore();
      for (let k2 = 0; k2 < segs; k2++) {
        ctx.save(); ctx.translate(X(SX), Y(SY)); ctx.rotate(k2 / 36 * Math.PI * 2 - Math.PI / 2);
        ctx.fillStyle = k2 % 3 === 0 ? L('#f2f5f8', '#7a8694', '#2c2e32') : L('#6c9ad4', '#2c4a74', '#22252a');
        ctx.fillRect((SR - 62) * S, -13 * S, 34 * S, 26 * S);
        ctx.restore();
      }
      if (segs > 0 && segs < 36) { const a = segs / 36 * Math.PI * 2 - Math.PI / 2; weld(SX + Math.cos(a) * (SR - 45), SY + Math.sin(a) * (SR - 45), 3); weld(SX + Math.cos(a) * (SR - 45), SY + Math.sin(a) * (SR - 45), 8); }
      dot(SX, SY, SR - 78, L('#6e747c', '#282c32', '#1a1c1e'));                              // the open floor inside the ring
      if (detail) {                                                                         // its pile caps, until the floor covers them
        ctx.save(); ctx.globalAlpha *= 1 - ik;
        for (let ring2 = 1; ring2 <= 3; ring2++) for (let p = 0; p < ring2 * 8; p++) { const a = p / (ring2 * 8) * Math.PI * 2; dot(SX + Math.cos(a) * ring2 * 110, SY + Math.sin(a) * ring2 * 110, 9, L('#9ca0a4', '#44484c', '#2a2c2e')); }
        ctx.restore();
      }
      if (ik > 0) {
        ctx.save(); ctx.globalAlpha *= ik;
        dot(SX, SY, SR - 78, L('#1b2e4c', '#0e1828', '#121315'));
        dot(SX, SY, SR - 150, L('#13233c', '#0a1220', '#0e0f11'));
        ctx.restore();
      }
      if (gk > 0) {                                                                         // the globe's frame: ribs, then parallels
        const ribs = Math.ceil(16 * c01(gk / 0.7));
        ctx.strokeStyle = STEEL; ctx.lineWidth = 5 * S; ctx.beginPath();
        for (let k2 = 0; k2 < ribs; k2++) { const a = k2 / 16 * Math.PI * 2; ctx.moveTo(X(SX + Math.cos(a) * 30), Y(SY + Math.sin(a) * 30)); ctx.lineTo(X(SX + Math.cos(a) * 172), Y(SY + Math.sin(a) * 172)); }
        ctx.stroke();
        for (const f of [1, 0.66, 0.33]) if (gk > 1 - f * 0.6) { ctx.beginPath(); ctx.arc(X(SX), Y(SY), 172 * f * S, 0, Math.PI * 2); ctx.stroke(); }
        weld(SX + Math.cos(now * 0.2) * 150, SY + Math.sin(now * 0.2) * 150, 5);
      }
      ctx.save(); ctx.setLineDash([30 * S, 10 * S]);                                        // scaffold ring
      ctx.strokeStyle = SCAFF; ctx.lineWidth = 7 * S;
      ctx.beginPath(); ctx.arc(X(SX), Y(SY), (SR + 4) * S, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  } else {
    const spin = on ? now * (0.05 + 0.12 * live) : 0;
    // It stands tall: a long soft shadow over the pool and the paving.
    dot(SX + 44, SY + 56, SR - 8, 'rgba(0,0,0,0.15)');
    dot(SX + 22, SY + 28, SR + 4, 'rgba(0,0,0,0.3)');
    // The drum wall, lit from the north-west, under a bright coping.
    dot(SX, SY, SR, lin(SX - 300, SY - 300, SX + 300, SY + 300, L('#7fa6da', '#2a4470', '#2a2d32'), L('#12233e', '#070d18', '#101113')));
    arc(SX, SY, SR - 3, L('rgba(255,255,255,0.7)', 'rgba(160,200,240,0.35)', 'rgba(255,255,255,0.07)'), 3);
    // segmented track ring
    dot(SX, SY, SR - 22, L('#35598a', '#1a2e4c', '#1e2024'));
    arc(SX, SY, SR - 22, 'rgba(0,0,0,0.3)', 3);
    if (detail) for (let k2 = 0; k2 < 36; k2++) {
      const a = k2 / 36 * Math.PI * 2 + spin;
      ctx.save(); ctx.translate(X(SX), Y(SY)); ctx.rotate(a);
      ctx.fillStyle = k2 % 3 === 0 ? L('#f2f5f8', '#7a8694', '#2c2e32') : L('#6c9ad4', '#2c4a74', '#22252a');
      ctx.fillRect((SR - 62) * S, -13 * S, 34 * S, 26 * S);
      if (on && k2 % 3 === 0) { ctx.fillStyle = `rgba(${ACC},${(0.4 + 0.5 * live).toFixed(3)})`; ctx.fillRect((SR - 54) * S, -4 * S, 18 * S, 8 * S); }
      ctx.restore();
    }
    // The terrace steps down inside the track; the track's rim shades it.
    dot(SX, SY, SR - 78, L('#1b2e4c', '#0e1828', '#121315'));
    arc(SX + 4, SY + 5, SR - 85, 'rgba(0,0,0,0.38)', 14);
    arc(SX, SY, SR - 78, L('rgba(200,225,250,0.6)', 'rgba(120,160,210,0.3)', 'rgba(255,255,255,0.05)'), 2.5);
    // chevron lights turning the other way
    if (detail) for (let k2 = 0; k2 < 24; k2++) {
      const a = k2 / 24 * Math.PI * 2 - spin * 1.6;
      ctx.save(); ctx.translate(X(SX), Y(SY)); ctx.rotate(a);
      ctx.fillStyle = on ? `rgba(${ACC},${(0.25 + 0.55 * ((Math.sin(now * 3 - k2 * 0.5) + 1) / 2) * live).toFixed(3)})` : '#26282a';
      ctx.beginPath(); ctx.moveTo((SR - 96) * S, 0); ctx.lineTo((SR - 120) * S, -12 * S); ctx.lineTo((SR - 120) * S, 12 * S); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // The brass meridian, carried over the track and the terrace on a fixed
    // bridge north and south.
    for (const sgn of [-1, 1]) {
      const y0 = sgn < 0 ? SY - SR + 4 : SY + 284, hgt = SR - 288;
      R(SX - 1, y0 + 4, 14, hgt, 'rgba(0,0,0,0.3)'); R(SX - 8, y0, 16, hgt, L('#eef1f4', '#59626c', '#2a2c30')); R(SX - 3.5, y0, 7, hgt, BRASS); R(SX - 3.5, y0, 2, hgt, BRASS_HI);
    }
    // The well: a dark glass floor, two steps down, lit from the core.
    dot(SX, SY, SR - 150, L('#0f1d33', '#070d18', '#0c0d0f'));
    arc(SX + 4, SY + 5, SR - 157, 'rgba(0,0,0,0.42)', 14);
    arc(SX, SY, SR - 150, L('rgba(200,225,250,0.6)', 'rgba(120,160,210,0.3)', 'rgba(255,255,255,0.05)'), 2.5);
    if (detail) { arc(SX, SY, 252, L('rgba(160,200,240,0.16)', 'rgba(120,160,210,0.12)', 'rgba(255,255,255,0.03)'), 2); arc(SX, SY, 224, L('rgba(160,200,240,0.12)', 'rgba(120,160,210,0.09)', 'rgba(255,255,255,0.03)'), 2); }
    if (on) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(SX, SY, SR - 150, ACC, 0.16 + 0.26 * live); ctx.restore(); }
    // twelve radial conduit fins between the ring and the globe
    for (let k2 = 0; k2 < 12; k2++) {
      const a = k2 / 12 * Math.PI * 2 + spin * 0.6;
      ctx.save(); ctx.translate(X(SX), Y(SY)); ctx.rotate(a);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(196 * S, -5 * S, 86 * S, 18 * S);
      ctx.fillStyle = L('#dba066', '#7e5830', '#26282a'); ctx.fillRect(196 * S, -9 * S, 86 * S, 18 * S);
      ctx.fillStyle = L('#f6cc98', '#a47a4a', '#303236'); ctx.fillRect(196 * S, -9 * S, 86 * S, 4 * S);
      if (on) { ctx.fillStyle = `rgba(${ACC},${(0.3 + 0.5 * live).toFixed(3)})`; ctx.fillRect(204 * S, -3 * S, 70 * S, 6 * S); }
      ctx.restore();
    }
    // the globe: seen from the pole, so its parallels are rings and its
    // meridians run radially from the core, turning slowly
    const GR = 172;
    // Two brass armillary rings swing round the globe, each tilting as it
    // turns: the far half passes behind the globe, the near half in front,
    // and a bead of light rides each one.
    const armil = (i, front) => {
      const A = i ? 262 : 228, ph = (on ? now * (i ? -0.13 : 0.17) : 0.4) + i * 1.3, B = A * (0.34 + 0.2 * Math.sin((on ? now * 0.21 : 0) + i * 2.4));
      const a0 = front ? 0 : Math.PI, a1 = front ? Math.PI : TAU;
      ctx.save(); ctx.lineCap = 'butt';
      if (front) { ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 12 * S; ctx.beginPath(); ctx.ellipse(X(SX + 5), Y(SY + 8), A * S, B * S, ph, a0, a1); ctx.stroke(); }
      ctx.strokeStyle = front ? BRASS : L('#a88440', '#5e4a22', '#2a261c'); ctx.lineWidth = (front ? 12 : 9) * S;
      ctx.beginPath(); ctx.ellipse(X(SX), Y(SY), A * S, B * S, ph, a0, a1); ctx.stroke();
      if (front) { ctx.strokeStyle = BRASS_HI; ctx.lineWidth = 3 * S; ctx.beginPath(); ctx.ellipse(X(SX), Y(SY), (A - 3) * S, Math.max(1, B - 3) * S, ph, a0, a1); ctx.stroke(); }
      if (on) {
        const u = now * (i ? 0.9 : -0.7) + i * 2;
        if ((Math.sin(u) > 0) === front) {
          const ex = Math.cos(u) * A, ey = Math.sin(u) * B, bx = SX + ex * Math.cos(ph) - ey * Math.sin(ph), by = SY + ex * Math.sin(ph) + ey * Math.cos(ph);
          ctx.globalCompositeOperation = 'lighter'; glow(bx, by, 54, ACC, 0.8); dot(bx, by, 7, '#ffffff');
        }
      }
      ctx.restore();
    };
    armil(0, false); armil(1, false);
    // The globe: a dark glass sphere, lit from the north-west.
    dot(SX + 8, SY + 12, GR + 2, 'rgba(0,0,0,0.35)');
    const gg = ctx.createRadialGradient(X(SX - 60), Y(SY - 66), 8 * S, X(SX), Y(SY), GR * S);
    gg.addColorStop(0, L('#6f9cc8', '#24405e', '#1c1e22')); gg.addColorStop(0.45, L('#234468', '#0f2034', '#121416')); gg.addColorStop(1, L('#081220', '#04080f', '#0a0b0d'));
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(X(SX), Y(SY), GR * S, 0, Math.PI * 2); ctx.fill();
    arc(SX, SY, GR - 2, L('rgba(170,210,250,0.5)', 'rgba(110,160,220,0.35)', 'rgba(255,255,255,0.06)'), 4);
    ell(SX - 66, SY - 78, 56, 28, L('rgba(255,255,255,0.22)', 'rgba(200,230,255,0.10)', 'rgba(255,255,255,0.03)'), -0.75);
    if (on) {
      // The globe itself is a hologram: a wireframe sphere of meridians and
      // parallels, tipped toward the viewer and turning, with three sparks
      // of power riding its surface.
      const HR = GR * 0.9, rot = now * (0.25 + 0.55 * live), ct = Math.cos(0.5), st = Math.sin(0.5);
      const pt = (lat, lon) => { const cl = Math.cos(lat), y = Math.sin(lat), z = cl * Math.cos(lon); return [SX + cl * Math.sin(lon) * HR, SY - (y * ct - z * st) * HR]; };
      const N = detail ? 24 : 12, TAU = Math.PI * 2;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(SX, SY, GR * 1.1, ACC, 0.22 + 0.25 * live);
      ctx.strokeStyle = `rgba(${ACC},${(0.5 + 0.4 * live).toFixed(3)})`; ctx.lineWidth = 2.6 * S; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let m = 0; m < (detail ? 6 : 3); m++) for (let s2 = 0; s2 <= N; s2++) { const [qx, qy] = pt(s2 / N * TAU, rot + m / (detail ? 6 : 3) * Math.PI); s2 ? ctx.lineTo(X(qx), Y(qy)) : ctx.moveTo(X(qx), Y(qy)); }
      for (const lat of [-1.0, -0.5, 0, 0.5, 1.0]) for (let s2 = 0; s2 <= N; s2++) { const [qx, qy] = pt(lat, s2 / N * TAU); s2 ? ctx.lineTo(X(qx), Y(qy)) : ctx.moveTo(X(qx), Y(qy)); }
      ctx.stroke();
      ctx.strokeStyle = `rgba(235,250,255,${(0.35 + 0.4 * live).toFixed(3)})`; ctx.lineWidth = 4 * S;             // the rim
      ctx.beginPath(); ctx.arc(X(SX), Y(SY), HR * S, 0, TAU); ctx.stroke();
      if (detail) for (let k2 = 0; k2 < 3; k2++) {
        const [qx, qy] = pt(Math.sin(now * 0.7 + k2 * 2.1) * 0.9, rot * 2.2 + k2 * 2.094);
        dot(qx, qy, 6, '#f4fcff'); glow(qx, qy, 34, ACC, 0.7);
      }
      // Comets of light running round the track ring.
      if (detail) for (let k2 = 0; k2 < 3; k2++) {
        const a = -now * (0.5 + 1.6 * live) + k2 * 2.094;
        for (let j = 0; j < 7; j++) {
          ctx.strokeStyle = `rgba(${j ? ACC : '255,255,255'},${(0.9 * (1 - j / 7)).toFixed(3)})`; ctx.lineWidth = (12 - j) * S;
          ctx.beginPath(); ctx.arc(X(SX), Y(SY), (SR - 45) * S, a + j * 0.07, a + (j + 1) * 0.07 + 0.005); ctx.stroke();
        }
      }
      // Plasma arcing from the globe out to the ring: a couple when the
      // line is carrying power, a storm of it during a surge.
      const bolts = detail ? (firing ? 7 : xk > 0.02 ? 2 : 0) + (surgeFx > 0 ? 4 : 0) + Math.round(startK * 8) + (sputter < 0.7 ? 3 : 0) : 0;
      if (bolts) {
        ctx.strokeStyle = `rgba(225,245,255,${(0.6 + 0.4 * surgeK).toFixed(3)})`; ctx.lineWidth = 3 * S; ctx.beginPath();
        for (let b = 0; b < bolts; b++) {
          let a = Math.random() * TAU;
          ctx.moveTo(X(SX + Math.cos(a) * HR), Y(SY + Math.sin(a) * HR));
          for (let j = 1; j <= 6; j++) { a += (Math.random() - 0.5) * 0.22; const r = HR + (SR - 80 - HR) * j / 6; ctx.lineTo(X(SX + Math.cos(a) * r), Y(SY + Math.sin(a) * r)); }
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    armil(0, true); armil(1, true);
    // the core
    const coreK = on ? (0.25 + (NP && NP.complete ? 0.65 : 0.45) * xk) * sputter + surgeK * 0.7 + surgeFx * 0.6 + stageK * 0.8 + startK * 0.9 : 0;
    if (coreK > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(SX, SY, 520, ACC, 0.32 * coreK);
      glow(SX, SY, 150, '255,255,255', 0.6 * Math.min(1, coreK));
      // the ring of light turning in the gap
      ctx.shadowColor = `rgba(${ACC},1)`; ctx.shadowBlur = 28 * S;
      ctx.strokeStyle = `rgba(${ACC},${Math.min(1, 0.4 + 0.5 * coreK).toFixed(3)})`; ctx.lineWidth = 10 * S;
      const a0 = _meridianRingA;
      for (let k2 = 0; k2 < 3; k2++) { ctx.beginPath(); ctx.arc(X(SX), Y(SY), (GR + 42) * S, a0 + k2 * 2.094, a0 + k2 * 2.094 + 1.3); ctx.stroke(); }
      ctx.restore();
      // The core's star: four long rays and four short, turning slowly and
      // stretching with the load.
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(X(SX), Y(SY)); ctx.rotate(now * 0.12);
      for (let k2 = 0; k2 < 8; k2++) {
        const len = (k2 % 2 ? 150 : 300 + 60 * Math.sin(now * 2.3 + k2)) * (0.5 + 0.6 * Math.min(1.4, coreK)) * S, wd = (k2 % 2 ? 7 : 11) * S;
        const g = ctx.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, `rgba(255,255,255,${Math.min(1, 0.55 + 0.4 * coreK).toFixed(3)})`); g.addColorStop(0.3, `rgba(${ACC},${Math.min(0.8, 0.5 * coreK).toFixed(3)})`); g.addColorStop(1, `rgba(${ACC},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -wd); ctx.lineTo(len, 0); ctx.lineTo(0, wd); ctx.closePath(); ctx.fill();
        ctx.rotate(Math.PI / 4);
      }
      ctx.restore();
    }
    // A containment ring of light turning round the whole Spire once the
    // line is live. It closes round the Spire as the export comes up, and
    // opens out again as it runs down.
    if (xk > 0.01 && detail) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.setLineDash([110 * S, 34 * S]); ctx.lineDashOffset = now * 90 * S;
      ctx.strokeStyle = `rgba(${ACC},${(0.7 * Math.min(1, xk * 1.5) * sputter).toFixed(3)})`; ctx.lineWidth = 5 * S;
      const sweep = Math.PI * 2 * Math.min(1, xk * 1.25);
      ctx.beginPath(); ctx.arc(X(SX), Y(SY), (SR + 50) * S, -Math.PI / 2, -Math.PI / 2 + sweep); ctx.stroke(); ctx.restore();
    }
    // Switching on: a flash off the core and a shockwave rolling out across
    // the station from the Spire.
    if (startK > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(SX, SY, 760, '255,255,255', 0.45 * startK * startK);
      const u = 1 - startK;
      for (let k2 = 0; k2 < 2; k2++) {
        const uk = Math.max(0, u - k2 * 0.18); if (uk <= 0) continue;
        ctx.strokeStyle = `rgba(${k2 ? ACC : '255,255,255'},${(0.85 * (1 - uk)).toFixed(3)})`; ctx.lineWidth = (26 - k2 * 10) * (1 - uk * 0.6) * S;
        ctx.beginPath(); ctx.arc(X(SX), Y(SY), (SR + uk * 1500) * S, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
    dot(SX, SY, 46, on ? (gold ? '#fff0c8' : '#e0f6ff') : '#2a2c30');
    // Stage progress round the rim.
    if (NP && !NP.complete && NP.stage >= 1 && on) {
      ctx.save(); ctx.lineCap = 'butt';
      ctx.strokeStyle = 'rgba(20,40,60,0.8)'; ctx.lineWidth = 16 * S;
      ctx.beginPath(); ctx.arc(X(SX), Y(SY), (SR + 30) * S, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowColor = `rgba(${ACC},1)`; ctx.shadowBlur = 24 * S;
      ctx.strokeStyle = `rgba(${ACC},0.95)`; ctx.lineWidth = 12 * S;
      ctx.beginPath(); ctx.arc(X(SX), Y(SY), (SR + 30) * S, -Math.PI / 2, -Math.PI / 2 + NP.progress * Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (detail) text('HYPERION SPIRE', SX, SY + 516, 15, L('#c8d0d8', '#8a96a4', '#3a3c40'), 'Arial, sans-serif');
  }

  // ── Pylons on the east edge: lattice towers seen from above, banded red
  // and white, a crossarm carrying three phases, an insulator glowing at each ──
  // lines from each bay's portal out to its pylon
  if (P.pylons >= 1 && P.yard >= 1) {
    for (const [c, w, o] of [['rgba(0,0,0,0.2)', 4, 9], [L('rgba(30,34,40,0.9)', 'rgba(170,180,192,0.6)', 'rgba(60,60,62,0.6)'), 3, 0]]) {
      ctx.strokeStyle = c; ctx.lineWidth = w * S;
      ctx.beginPath(); for (const [qx, qy] of PYL) for (const d of [-52, 0, 52]) { ctx.moveTo(X(YARD[0] + 484 + o), Y(qy + d * 70 / 52 + o)); ctx.lineTo(X(qx + o), Y(qy + d + o)); } ctx.stroke();
    }
  }
  for (const [qx, qy] of PYL) {
    if (P.pylons <= 0) continue;
    const s2 = 54 * P.pylons;
    if (P.pylons >= 1) {                                                                    // the tower's shadow, laid out long to the south-east
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 6 * S; ctx.beginPath();
      ctx.moveTo(X(qx - 40), Y(qy + 44)); ctx.lineTo(X(qx + 84), Y(qy + 128)); ctx.moveTo(X(qx + 44), Y(qy - 40)); ctx.lineTo(X(qx + 96), Y(qy + 118));
      for (let j = 1; j < 5; j++) { const u = j / 5; ctx.moveTo(X(qx - 40 + 124 * u), Y(qy + 44 + 84 * u)); ctx.lineTo(X(qx + 44 + 52 * u), Y(qy - 40 + 158 * u)); }
      ctx.stroke();
    }
    RR(qx - s2 - 12, qy - s2 - 12, s2 * 2 + 24, s2 * 2 + 24, 6, L('#aab0b6', '#2c3138', '#1f2022'));       // its concrete base
    ctx.strokeStyle = L('#e8502a', '#a23c24', '#34363a'); ctx.lineWidth = 7 * S;
    ctx.strokeRect(X(qx - s2), Y(qy - s2), s2 * 2 * S, s2 * 2 * S);
    ctx.lineWidth = 5 * S;
    ctx.beginPath(); ctx.moveTo(X(qx - s2), Y(qy - s2)); ctx.lineTo(X(qx + s2), Y(qy + s2)); ctx.moveTo(X(qx + s2), Y(qy - s2)); ctx.lineTo(X(qx - s2), Y(qy + s2)); ctx.stroke();
    ctx.strokeStyle = L('#f6f8fa', '#8a96a4', '#2c2e32');
    ctx.strokeRect(X(qx - s2 * 0.62), Y(qy - s2 * 0.62), s2 * 1.24 * S, s2 * 1.24 * S);
    ctx.strokeStyle = L('#e8502a', '#a23c24', '#34363a');
    ctx.strokeRect(X(qx - s2 * 0.3), Y(qy - s2 * 0.3), s2 * 0.6 * S, s2 * 0.6 * S);
    for (const [ax, ay] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) dot(qx + ax * s2, qy + ay * s2, 8, L('#59616b', '#22262c', '#161718'));
    if (P.pylons < 1) continue;
    poly([[qx - 4, qy - 92], [qx + 4, qy - 92], [qx + 12, qy], [qx + 4, qy + 92], [qx - 4, qy + 92], [qx - 12, qy]], L('#f6f8fa', '#8a96a4', '#2c2e32'));   // the crossarm
    if (detail) { ctx.strokeStyle = L('rgba(90,100,112,0.7)', 'rgba(30,36,44,0.7)', 'rgba(0,0,0,0.4)'); ctx.lineWidth = 2 * S; ctx.beginPath(); for (let u = -84, s3 = 1; u < 84; u += 14, s3 = -s3) { ctx.moveTo(X(qx - 5 * s3), Y(qy + u)); ctx.lineTo(X(qx + 5 * s3), Y(qy + u + 14)); } ctx.stroke(); }
    for (const d of [-52, 0, 52]) { dot(qx, qy + d, 11, CERAMIC); dot(qx, qy + d, 6, on ? `rgba(${ACC},0.95)` : '#26282a'); }
    if (on) {
      glow(qx, qy, 130, ACC, (0.22 + 0.35 * live) * (night ? 1 : 0.45));
      for (const e2 of [-92, 92]) { const bl = Math.sin(now * 3 + qy + e2) > 0; dot(qx, qy + e2, 5, bl ? '#ff4030' : '#601810'); if (bl && night) glow(qx, qy + e2, 40, '255,60,40', 0.5); }
    }
  }

  // Trucks on the access road once the pad is down.
  if (P.pad >= 1 && detail) for (let k2 = 0; k2 < 3; k2++) {
    const dir = k2 % 2 ? 1 : -1, u = (now * (0.014 + k2 * 0.004) + k2 * 0.33) % 1;
    const cx = dir > 0 ? -60 + u * (AW + 120) : AW + 60 - u * (AW + 120), cy = dir > 0 ? 1570 : 1522;
    RR(cx - 24, cy - 11, 48, 22, 5, ['#e8e8e8', '#2a5ab0', '#c8a020'][k2]);
    R(cx + dir * 14, cy - 8, 8, 16, 'rgba(20,30,40,0.7)');
    if (night) glow(cx + dir * 26, cy, 30, '255,244,200', 0.4);
  }

  // The build's traffic and trades: concrete and steel coming round the loop,
  // a crew on whatever is going up, welding arcs, floodlights after dark.
  if (build < 1) {
    if (P.pad >= 1) for (let k2 = 0; k2 < 4; k2++) lorry(now * 0.018 + k2 / 4, k2 % 2 ? 'flatbed' : 'mixer', k2);
    if (detail && P.pad >= 1) {
      const going = (k, x, y, g) => { if (k > 0 && k < 1) crew(x, y, g); };
      going(P.hallA, HALLS[0][0] + 200, HALLS[0][1] + 300, 0); going(P.hallB, HALLS[1][0] + 420, HALLS[1][1] + 140, 1);
      going(P.yard, YARD[0] + 150, YARD[1] + 40 + 900 * P.yard, 2); going(P.spire, SX - 120, SY + 160, 3); going(P.ctrl, CTRL[0] + 520, CTRL[1] + 90, 4);
    }
    if (on && detail && arcs.length) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const [x, y] of arcs) { glow(x, y, night ? 110 : 44, '150,200,255', night ? 0.75 : 0.5); dot(x, y, 6, '#ffffff'); dot(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40, 3, 'rgba(255,210,120,0.9)'); }
      ctx.restore();
    }
    if (night && on) for (const [x, y] of MASTS) { glow(x, y, 380, '255,240,200', 0.22); dot(x, y, 9, '#fff6d8'); }
    // Cranes work over whatever is still going up.
    if (P.hallA < 1 || P.hallB < 1) crane(722, 550, 420, 1);
    if (P.yard < 1 && P.hallB > 0.5) crane(1700, 560, 400, 2);
    if (P.spire < 1 && P.yard > 0.3) crane(SX, 1092, 380, 3);
  }

  // Status board text.
  if (P.ctrl >= 1) {
    let msg, col = '#8ad8ff';
    if (!on) { msg = 'NO POWER'; col = 'rgba(255,90,70,0.9)'; }
    else if (fxK('outage', 3) > 0) { msg = '⚠ NATIONAL LINE TRIPPED'; col = Math.sin(now * 12) > 0 ? '#ff5040' : '#ffd0c0'; }
    else if (fxK('abort', 2.6) > 0) { msg = '✕ SURGE ABORTED'; col = '#ff8060'; }
    else if (stageK > 0) { msg = '★ STAGE COMPLETE ★'; col = Math.sin(now * 10) > 0 ? '#ffffff' : '#ffd070'; }
    else if (!NP) msg = 'HYPERION STATION';
    else if (NP.complete) { msg = NP.exporting ? `POWERING THE NATION · ${(NP.exportKW / 1000).toFixed(0)} MW` : 'GRID COMPLETE · EXPORT PAUSED'; col = '#ffe0a0'; }
    else if (NP.waiting) { msg = 'BASE COMPLETE · AWAITING MHD RING'; col = '#ffd060'; }
    else if (NP.stage === 0) msg = `UNDER CONSTRUCTION · ${Math.floor(build * 100)}%`;
    else if (NP.stage === 1) {
      if (firing) { msg = `⚡ SURGE ${NP.surges + 1}/${NP.surgesNeeded} · ${(NationalProject.SURGE_KW / 1000).toFixed(0)} MW ⚡`; col = Math.sin(now * 16) > 0 ? '#ffffff' : '#8ad8ff'; }
      else if (spinUp) { msg = `CHARGING · T-${Math.ceil((1 - surge.ph) * DayNight.secondsPerGameHour())}s`; col = '#ffd060'; }
      else msg = `COMMISSIONING · ${NP.surges}/${NP.surgesNeeded}`;
    }
    else if (NP.standby) { msg = 'STANDING BY · INITIATE FROM THE DOSSIER'; col = Math.sin(now * 2) > 0 ? '#ffd060' : '#c8a040'; }
    else { msg = `EXPORTING ${(NP.exportKW / 1000).toFixed(0)} MW · ${Math.ceil(NP.hoursLeft)}H TO GO`; col = gold ? '#ffe0a0' : '#8ad8ff'; }
    ctx.font = `bold ${32 * S}px Arial, sans-serif`;
    const w = ctx.measureText(msg).width / S, size = w > 520 ? 32 * 520 / w : 32;
    text(msg, CX0 + CW / 2 - 20, CY0 + 76, size, col, 'Arial, sans-serif');
  }

  // After dark, searchlights at the four corners sweep in across the pad.
  if (on && night && build >= 1 && detail) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    [[70, 70], [AW - 70, 70], [70, 1430], [AW - 70, 1430]].forEach(([cx, cy], k) => {
      const a = Math.atan2(SY - cy, SX - cx) + Math.sin(now * 0.45 + k * 1.7) * 0.55, len = 1250, wd = 0.07;
      const g = ctx.createRadialGradient(X(cx), Y(cy), 0, X(cx), Y(cy), len * S);
      g.addColorStop(0, `rgba(${ACC},${(0.08 + 0.06 * live).toFixed(3)})`); g.addColorStop(1, `rgba(${ACC},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(X(cx), Y(cy));
      ctx.lineTo(X(cx + Math.cos(a - wd) * len), Y(cy + Math.sin(a - wd) * len));
      ctx.lineTo(X(cx + Math.cos(a + wd) * len), Y(cy + Math.sin(a + wd) * len));
      ctx.closePath(); ctx.fill();
      glow(cx, cy, 60, ACC, 0.8); dot(cx, cy, 10, '#f4fcff');
    });
    ctx.restore();
  }

  // ── Stage II: a surge building and firing ──
  // Spin-up: the pad's energy is drawn in to the Spire, the obelisks charge
  // one after another and a ring of light closes on it. The shot: a white
  // flash, lightning from the Spire to every obelisk and on out to the halls
  // and the yard, and shock rings racing across the pad for its whole length.
  // After it: sparks thrown out on a good surge; smoke and red sputter on an
  // aborted one.
  const bolt = (x0, y0, x1, y1, n, jit, rgb, a, w) => {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    ctx.strokeStyle = `rgba(${rgb},${a.toFixed(3)})`; ctx.lineWidth = w * S; ctx.beginPath(); ctx.moveTo(X(x0), Y(y0));
    for (let j = 1; j < n; j++) { const u = j / n, o = (Math.random() - 0.5) * 2 * jit * Math.sin(u * Math.PI); ctx.lineTo(X(x0 + dx * u + nx * o), Y(y0 + dy * u + ny * o)); }
    ctx.lineTo(X(x1), Y(y1)); ctx.stroke();
  };
  const OBEL = k => { const a = (k + 0.5) / 8 * TAU; return [SX + Math.cos(a) * 527, SY + Math.sin(a) * 527, a]; };
  if (NP && NP.stage === 1 && on && build >= 1) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (spinUp) {
      const u = Math.max(0, Math.min(1, (surge.ph - 0.85) / 0.15));                         // 0 → 1 up to the shot
      if (detail) {
        const n = Math.round(24 + 56 * u);
        for (let k = 0; k < n; k++) {
          const seed = Math.sin(k * 12.9898) * 43758.5453, rnd = seed - Math.floor(seed);
          const fr = (now * (0.22 + 0.9 * u) + rnd) % 1;                                    // 0 at the edge → 1 at the Spire
          const a = (k / n) * TAU + (1 - fr) * 1.6 * (k % 2 ? 1 : -1);
          const r = SR + 30 + (1 - fr) * (950 + 200 * rnd);
          const x = SX + Math.cos(a) * r, y = SY + Math.sin(a) * r;
          dot(x, y, 3 + 7 * fr, `rgba(${ACC},${(0.2 + 0.7 * fr).toFixed(3)})`);
          if (fr > 0.75) glow(x, y, 34, ACC, 0.35 * fr);
        }
      }
      for (let k = 0; k < 8; k++) {
        if (u < (k + 1) / 9) continue;                                                      // they charge round the ring in turn
        const [ox, oy] = OBEL(k);
        glow(ox, oy, 80 + 70 * u, ACC, (0.35 + 0.45 * u) * (0.75 + 0.25 * Math.sin(now * (14 + 20 * u) + k)));
        dot(ox, oy, 9, '#f4fcff');
      }
      arc(SX, SY, SR + 70 + 620 * (1 - u) * (1 - u), `rgba(${ACC},${(0.15 + 0.6 * u).toFixed(3)})`, 5 + 14 * u);
      if (u > 0.8) glow(SX, SY, 600, '255,255,255', 0.25 * (u - 0.8) / 0.2 * (0.6 + 0.4 * Math.sin(now * 40)));
    }
    if (firing) {
      const sT = surge.ph * DayNight.secondsPerGameHour();                                  // seconds into the shot
      const flash = Math.max(0, 1 - sT / 0.7);
      for (let j = 0; j < 4; j++) {                                                         // shock rings, one every 0.6 s
        const u = (sT / 2.4 + j / 4) % 1;
        arc(SX, SY, SR + 40 + u * 1300, `rgba(${ACC},${(0.55 * (1 - u) * (0.45 + 0.55 * surgeK)).toFixed(3)})`, 6 + 22 * (1 - u));
      }
      if (detail) {
        ctx.shadowColor = `rgba(${ACC},1)`; ctx.shadowBlur = 18 * S;
        for (let k = 0; k < 8; k++) {                                                       // the Spire to every obelisk
          if (Math.random() > 0.35 + 0.55 * surgeK + flash) continue;
          const [ox, oy, a] = OBEL(k);
          bolt(SX + Math.cos(a) * (SR - 60), SY + Math.sin(a) * (SR - 60), ox, oy, 7, 26, '235,250,255', 0.9, 4);
          glow(ox, oy, 130, ACC, 0.5 + 0.4 * surgeK);
        }
        for (let k = 0; k < 8; k++) {                                                       // obelisk to obelisk round the ring
          if (Math.random() > 0.05 + 0.25 * surgeK) continue;
          const [x0, y0] = OBEL(k), [x1, y1] = OBEL((k + 1) % 8);
          bolt(x0, y0, x1, y1, 8, 40, ACC, 0.8, 3);
        }
        const out = [[HALLS[0][0] + HALLS[0][2], HALLS[0][1] + HALLS[0][3] / 2], [HALLS[1][0] + HALLS[1][2], HALLS[1][1] + HALLS[1][3] / 2],
                     [YARD[0], YARD[1] + 220], [YARD[0], YARD[1] + YARD[3] - 220]];
        for (const [tx, ty] of out) {                                                       // and out to the halls and the yard
          if (Math.random() > 0.3 * surgeK + flash) continue;
          const a = Math.atan2(ty - SY, tx - SX);
          bolt(SX + Math.cos(a) * 560, SY + Math.sin(a) * 560, tx, ty, 11, 60, '235,250,255', 0.85, 5);
          glow(tx, ty, 150, ACC, 0.6);
        }
        ctx.shadowBlur = 0;
      }
      if (flash > 0) glow(SX, SY, 1700, '255,255,255', 0.6 * flash);
    }
    if (surgeFx > 0 && detail) {                                                            // a good surge: sparks thrown out
      const u = 1 - surgeFx;
      for (let k = 0; k < 48; k++) {
        const seed = Math.sin(k * 78.233) * 43758.5453, rnd = seed - Math.floor(seed);
        const a = k / 48 * TAU + rnd * 0.2, r = SR + u * (500 + 900 * rnd);
        dot(SX + Math.cos(a) * r, SY + Math.sin(a) * r, 3 + 5 * surgeFx, `rgba(${k % 3 ? ACC : '255,255,255'},${(0.9 * surgeFx).toFixed(3)})`);
      }
    }
    ctx.restore();
  }
  if (NP && NP.stage === 1 && abortK > 0 && detail) {                                       // an aborted one: smoke off the Spire, the halls sputtering red
    for (let k = 0; k < 10; k++) {
      const u = ((1 - abortK) + k / 10) % 1, wob = Math.sin(now * 1.3 + k * 2.1) * 60;
      dot(SX + wob + (k - 5) * 30, SY - u * 500, 40 + 80 * u, `rgba(40,40,44,${(0.35 * abortK * (1 - u)).toFixed(3)})`);
    }
    if (Math.random() < 0.5) for (const h of HALLS) glow(h[0] + h[2] / 2, h[1] + h[3] / 2, 320, '255,60,40', 0.3 * abortK);
  }

  // A good surge / a stage complete: the whole pad flashes.
  if (surgeFx > 0) glow(SX, SY, 900, ACC, 0.25 * surgeFx);
  if (stageK > 0) glow(SX, SY, 1500, '255,240,210', 0.4 * stageK);
  if (abortK > 0) glow(SX, SY, 560, '255,70,40', 0.35 * abortK * (0.5 + 0.5 * Math.random()));
  ctx.restore();   // clip

  // ── Unclipped: the big moments ──
  // (The national lines leaving east are drawn by renderMeridianLines, in
  // their own pass: they run far past the footprint, so a building-cache
  // bitmap or the off-screen cull would cut them off.)
  ctx.globalCompositeOperation = 'lighter';
  const ring = (u, r0, r1, rgb, a, w) => {
    if (u <= 0 || u >= 1) return;
    const r = r0 + (r1 - r0) * (1 - Math.pow(1 - u, 2.2)), k = 1 - u;
    ctx.save(); ctx.shadowColor = `rgba(${rgb},1)`; ctx.shadowBlur = 40 * S * k;
    ctx.strokeStyle = `rgba(${rgb},${(a * k).toFixed(3)})`; ctx.lineWidth = w * (0.3 + 0.7 * k) * S;
    ctx.beginPath(); ctx.arc(X(SX), Y(SY), r * S, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  };
  if (surgeFx > 0) ring(1 - surgeFx, 440, 1900, ACC, 0.9, 22);
  if (abortK > 0) ring(1 - abortK, 440, 1100, '255,70,40', 0.8, 16);
  if (firing) {                                                                             // the shot's shockwave, out past the fence
    const sT = surge.ph * DayNight.secondsPerGameHour();
    ring(sT / 1.8, 440, 3000, '255,255,255', 0.95, 36);
    ring(sT / 1.8 - 0.12, 440, 3000, ACC, 0.8, 24);
  }
  if (stageK > 0) {
    const u = 1 - stageK;
    for (let k2 = 0; k2 < 3; k2++) ring(u * 1.6 - k2 * 0.18, 460, 3600, k2 === 1 ? '255,245,220' : ACC, 0.9, 28);
    for (let k2 = 0; k2 < 20; k2++) {
      const a = k2 / 20 * Math.PI * 2 + now * 0.3, len = 700 + 2800 * Math.min(1, u * 2.5), wd = 0.03;
      const g = ctx.createRadialGradient(X(SX), Y(SY), 0, X(SX), Y(SY), len * S);
      g.addColorStop(0, `rgba(255,240,220,${(0.35 * stageK).toFixed(3)})`); g.addColorStop(1, `rgba(${ACC},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(X(SX), Y(SY));
      ctx.lineTo(X(SX + Math.cos(a - wd) * len), Y(SY + Math.sin(a - wd) * len));
      ctx.lineTo(X(SX + Math.cos(a + wd) * len), Y(SY + Math.sin(a + wd) * len));
      ctx.closePath(); ctx.fill();
    }
  }
  // Complete: a beacon breathing gold over the country.
  if (on && NP && NP.complete) { ring((now % 5) / 5, 440, 1700, '255,208,112', 0.3, 12); ring(((now + 2.5) % 5) / 5, 440, 1700, '122,216,255', 0.18, 8); }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}


// ── Airliner climb-out and approach, in world space ─────────────────────
// The airport sprite is clipped to its own footprint, so the aircraft used to
// pop in and out at the runway ends. The airborne legs of renderAirport's 70 s
// loop are drawn here instead: after liftoff (u 0.20-0.33) it keeps climbing
// east over the city, growing, its shadow sliding away, and fades into the
// haze; on approach (u 0.33-0.47) it fades back in from far out west, descends
// and shrinks to touchdown at the runway threshold, where the sprite takes
// over. Timing and the touchdown/liftoff points mirror renderAirport's KEYS.
function _drawAirborneLiner(x, y, head, scale, shadowK, livery, alpha, night, t) {
  const sx = (x - Camera.x) * Camera.zoom, sy = (y - Camera.y) * Camera.zoom;
  const m = 400 * Camera.zoom;   // screen size: main loop's W/H are locals, not globals
  if (sx < -m || sx > window.innerWidth + m || sy < -m || sy > window.innerHeight + m) return;
  ctx.globalAlpha = alpha;
  // shadow on the ground: directly under the plane at zero height (matching the
  // sprite's own shadow at the handoff), sliding away as it climbs
  ctx.save(); ctx.translate(x + 260 * shadowK, y + 190 * shadowK); ctx.rotate(head); ctx.scale(scale, scale);
  _airlinerShape(`rgba(0,0,0,${(0.22 * (1 - shadowK * 0.5)).toFixed(3)})`, false, livery, true, false);
  ctx.restore();
  ctx.save(); ctx.translate(x, y); ctx.rotate(head); ctx.scale(scale, scale);
  _airlinerShape('#f2f4f6', Camera.zoom > 0.3, livery, true, Camera.zoom > 0.3);
  ctx.fillStyle = '#ff3030'; ctx.beginPath(); ctx.arc(-19, -48, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#30ff60'; ctx.beginPath(); ctx.arc(-19, 48, 1.8, 0, Math.PI * 2); ctx.fill();
  if (Math.sin(t * 9) > 0.85) {
    ctx.fillStyle = '#ffffff';
    // one path per dot: arc() draws a line from the previous point, so a shared path fills the polygon between them
    for (const [sx, sy, sr] of [[-21, -48, 2.4], [-21, 48, 2.4], [-52, 0, 2]]) { ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill(); }
  }
  if (night) {   // this pass sits above the darkness overlay, so it supplies its own glow
    for (const [gx, gy, c] of [[-19, -48, '255,48,48'], [-19, 48, '48,255,96']]) {
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 14);
      g.addColorStop(0, `rgba(${c},0.6)`); g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g; ctx.fillRect(gx - 14, gy - 14, 28, 28);
    }
  }
  ctx.restore();
}

// ── Hyperion's national lines, in world space ───────────────────────────
// The three circuits leaving the station's pylons off the east edge, carrying
// pulses of power away while it exports. They run LEN art units past the
// pylons, far beyond the footprint, so they can't live in the station sprite:
// zoomed out, the building cache bakes it into a bitmap one tile wider than
// the footprint, and the tile loop skips the station altogether once its
// footprint is off screen. Either cut the lines off short. Drawn here every
// frame instead, culled on the lines' own extent.
function renderMeridianLines(t) {
  const stations = EntityRegistry.getByType(T.NATIONALGRID);
  if (!stations.size) return;
  const NP = typeof NationalProject !== 'undefined' ? NationalProject.visual() : null;
  // Built as far as the station sprite shows it (it eases Stage I's build in).
  const build = NP ? (NP.stage === 0 && _meridianBuildShown >= 0 ? Math.min(NP.build, _meridianBuildShown) : NP.build) : 1;
  if (build < 1) return;                                     // pylons part(0.84, 1): the lines go up last
  // They run a long way out — about six station-widths — holding full
  // strength for the first stretch, then fading away to nothing, so they
  // read as heading off into the rest of the country rather than stopping.
  const AW = 2560, AH = 1600, LEN = 16000, S = TILE / 40;
  const HOLD = 0.15;                                          // fraction of LEN at full strength
  const fade = u => { const v = Math.max(0, (u - HOLD) / (1 - HOLD)); return v >= 1 ? 0 : (1 - v) * (1 - v); };
  const PULSES = Math.round(5 * LEN / 4800), SPEED = 0.22 * 4800 / LEN;   // the same spacing and pace as on the old, short lines
  const PYL = [[2450, 260], [2450, 640], [2450, 1020]];
  const now = performance.now() / 1000, z = Camera.zoom;
  const vw = window.innerWidth / z, vh = window.innerHeight / z;
  ctx.save();
  ctx.translate(-Camera.x * z, -Camera.y * z);
  ctx.scale(z, z);
  ctx.globalCompositeOperation = 'lighter';
  for (const e of stations) {
    const W = (e.width || EntityDefs[T.NATIONALGRID].width) * TILE, H = (e.height || EntityDefs[T.NATIONALGRID].height) * TILE;
    const kx = W / (AW * S), ky = H / (AH * S);              // the sprite's own stretch
    const px = e.col * TILE, py = e.row * TILE;
    const x0 = px + 2450 * S * kx, x1 = px + (2450 + LEN) * S * kx, pad = 60 * S * ky;
    if (x1 < Camera.x || x0 > Camera.x + vw || py + H + pad < Camera.y || py - pad > Camera.y + vh) continue;
    // How far the power has got along the lines (NationalProject._xUpdate):
    // switched on, a bright front runs out from the pylons and the line is
    // live behind it; switched off, it drains back in from the far end,
    // flickering. Off, there is no line at all.
    const on = e.powered, xk = on && NP && NP.stage >= 2 ? (NP.exportK ?? (NP.exporting ? 1 : 0)) : 0;
    if (xk <= 0.001) continue;
    const xe = NP && NP.exportEdge, draining = !!(xe && !xe.on);
    const reach = draining ? xk : 1 - Math.pow(1 - xk, 2.2);          // out fast then settling; back in steadily
    const flick = draining ? 0.55 + 0.45 * Math.random() : 1;
    const ACC = NP && (NP.final || NP.complete) ? '255,208,112' : '122,216,255';
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(kx, ky);
    const { X, Y, R, glow } = _nKit(0, 0);
    const end = 2450 + LEN * reach;
    const wires = new Path2D();
    for (const [qx, qy] of PYL) for (const d of [-52, 0, 52]) { wires.moveTo(X(qx), Y(qy + d)); wires.lineTo(X(qx + LEN * reach), Y(qy + d)); }
    // Every line runs the same way, so one gradient along x fades them all.
    const fading = (rgb, a) => {
      const g = ctx.createLinearGradient(X(2450), 0, X(2450 + LEN), 0);
      for (let k = 0; k <= 8; k++) { const u = k / 8; g.addColorStop(u, `rgba(${rgb},${(a * fade(u)).toFixed(3)})`); }
      return g;
    };
    ctx.strokeStyle = fading(ACC, 0.10 * flick); ctx.lineWidth = 16 * S; ctx.stroke(wires);    // the corona round a live line
    ctx.strokeStyle = fading(ACC, 0.5 * flick); ctx.lineWidth = 3 * S; ctx.stroke(wires);
    const vx0 = (Camera.x - px) / kx / S - 60, vx1 = (Camera.x + vw - px) / kx / S + 60;   // the view, in art units
    for (const [qx, qy] of PYL) for (const d of [-52, 0, 52]) for (let p = 0; p < PULSES; p++) {
      const u = ((now * SPEED + p / PULSES + (qy + d * 3) * 0.001) % 1), x = qx + u * LEN, f = fade(u) * flick;
      if (u > reach || x < vx0 || x > vx1 || f <= 0.01) continue;
      glow(x, qy + d, 44, ACC, 0.7 * f);
      R(x - 40, qy + d - 3, 46, 6, `rgba(255,255,240,${(0.9 * f).toFixed(3)})`);
    }
    // The front itself, while it is moving: a hot white head on every
    // conductor, sparking, brightest near the station.
    if (xk < 1 && end > vx0 && end < vx1) {
      const f = Math.max(0.15, fade(reach));
      for (const [, qy] of PYL) for (const d of [-52, 0, 52]) {
        glow(end, qy + d, 120, ACC, 0.8 * f * flick);
        glow(end, qy + d, 46, '255,255,255', 0.95 * f * flick);
        for (let k = 0; k < 3; k++) {
          const sx = end - Math.random() * 90 * (draining ? -1 : 1), sy = qy + d + (Math.random() - 0.5) * 40;
          R(sx, sy, 5, 5, `rgba(255,255,230,${(0.8 * f * Math.random()).toFixed(3)})`);
        }
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

function renderAirportFlights(t) {
  const airports = EntityRegistry.getByType(T.AIRPORT);   // a Set: size, not length
  if (!airports.size) return;
  if (DayNight.hour() < 5) return;
  const u = _airportFlightPhase(t);
  const air = _airportAirAt(u);
  if (!air) return;
  const dark = DayNight.darkness(), night = dark > 0.3;
  const LIV = ['#d0303a', '#2a6ad0', '#f0a020', '#1a8a6a', '#7a3ab0'];
  const livery = LIV[Math.floor(t / AIRPORT_CYCLE_S) % LIV.length];
  const DIST = _AP_DIST;
  ctx.save();
  ctx.translate(-Camera.x * Camera.zoom, -Camera.y * Camera.zoom);
  ctx.scale(Camera.zoom, Camera.zoom);
  for (const e of airports) {
    if (!e.powered) continue;
    const ox = e.col * TILE, oy = e.row * TILE;
    const x = ox + air.x, y = oy + air.y;
    const head = Math.atan2(air.dy, air.dx);                           // tangent of the path
    if (air.out) {
      const k = air.k;                                                 // 0 → 1 across the climb-out
      // Height (the scale and the shadow's drift) comes up gently off the
      // runway rather than at once: rotation, then the climb.
      const h = k * k * (3 - 2 * k);
      _drawAirborneLiner(x, y, head, 1 + 0.9 * h, h, livery, k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4), night, t);
    } else {
      const k = air.k, r = air.r;                                      // r: how far out it still is, 1 → 0
      // ...and settles onto it the same way: a flare just before touchdown.
      const h = r * r * (3 - 2 * r);
      _drawAirborneLiner(x, y, head, 1 + 0.9 * h, h, livery, Math.min(1, k / 0.3), night, t);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
