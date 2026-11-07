/* ═══════════════════════════════════════════════════════════════════
   REPROCESSING PLANT RENDERER
   A PUREX plant laid out the way the real ones are, as shielded concrete
   cells on one slab, read left to right and top to bottom:

     • Reception pool   — spent fuel arrives by belt and waits under water,
                          glowing blue (spent fuel in).
     • Head-end cell    — the shear chops assemblies, the rotary dissolver
                          takes them into nitric acid (water in feeds it).
     • Separation hall  — three pulsed extraction columns and a mixer-settler
                          bank split the liquor into uranium, plutonium and
                          fission products.
     • Waste wing       — HLW storage tank, vitrification melter and the rank
                          of glass canisters a truck takes away; the off-gas
                          stack stands beside it.
     • Product wing     — uranium denitration + silo (recovered U out) and
                          the plutonium glovebox line (plutonium out).

   Everything is placed as fractions of the footprint, so the same drawing
   serves the current 16×13 plant and any saved at the old 12×10. Ports come
   from ReprocessingSystem.getStubs(); _portFeed runs connect whichever faces
   a rotation put them on to the equipment they serve. Shares the _wf*
   helpers (render_hydro_coal.js) and the _port* helpers (render_oil_nuclear.js).
   ═══════════════════════════════════════════════════════════════════ */

function renderReprocessingPlant(e, px, py, t) {
  const def = EntityDefs[T.REPROCESSOR];
  const w   = (e.width  || def.width)  * TILE;
  const h   = (e.height || def.height) * TILE;
  const on  = e.powered;
  const active = !!e._running;
  const S = TILE / 40;
  const u = Math.min(w / 16, h / 13);          // one "tile" of the full-size layout
  const detail = Camera.zoom > 0.5;
  const accent    = '#b070ff';
  const plutColor = '#ff8a30';
  const uColor    = '#8ad860';
  const hlwColor  = '#ffd020';
  const acidColor = 'rgba(210,220,120,0.95)';
  const waterCol  = 'rgba(90,200,240,0.95)';
  const plutFill  = Math.min(1, (e._plutonium || 0) / (def.plutoniumCapacity || 100));
  const uFill     = Math.min(1, (e._recovered || 0) / (def.recoveredCapacity || 200));
  const hlwFill   = Math.min(1, (e._hlw       || 0) / (def.hlwCapacity       || 100));
  const X = (f) => px + w * f, Y = (f) => py + h * f;
  ctx.save();

  // ── Slab ──
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.roundRect(px + 5 * S, py + 6 * S, w, h, 5 * S); ctx.fill();
  const slab = ctx.createLinearGradient(px, py, px, py + h);
  slab.addColorStop(0, '#4c5156'); slab.addColorStop(1, '#2f3337');
  ctx.fillStyle = slab; ctx.strokeStyle = '#141719'; ctx.lineWidth = 1.6 * S;
  ctx.beginPath(); ctx.roundRect(px, py, w, h, 5 * S); ctx.fill(); ctx.stroke();
  // Expansion joints and painted walkway lanes between the cells.
  ctx.strokeStyle = 'rgba(18,22,25,0.35)'; ctx.lineWidth = 0.9 * S;
  for (let q = 1; q < 8; q++) {
    ctx.beginPath(); ctx.moveTo(X(q / 8), py + 2 * S); ctx.lineTo(X(q / 8), py + h - 2 * S); ctx.stroke();
  }
  for (let q = 1; q < 6; q++) {
    ctx.beginPath(); ctx.moveTo(px + 2 * S, Y(q / 6)); ctx.lineTo(px + w - 2 * S, Y(q / 6)); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(210,180,60,0.20)';
  ctx.fillRect(X(0.035), Y(0.685), w * 0.93, 2 * S);
  ctx.fillRect(X(0.345), Y(0.05), 2 * S, h * 0.63);
  ctx.fillRect(X(0.675), Y(0.05), 2 * S, h * 0.63);

  // Shielded cell: a floor, a thick concrete wall and lead-glass viewing
  // windows let into the wall facing the walkway.
  function cell(x0, y0, x1, y1, floor, windows) {
    const cx = X(x0), cy = Y(y0), cw = X(x1) - cx, ch = Y(y1) - cy;
    const wall = 0.22 * u;
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(cx + 3 * S, cy + 4 * S, cw, ch);
    ctx.fillStyle = '#6b7075'; ctx.strokeStyle = '#1a1d20'; ctx.lineWidth = 1.2 * S;
    ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 2.5 * S); ctx.fill(); ctx.stroke();
    ctx.fillStyle = floor;
    ctx.fillRect(cx + wall, cy + wall, cw - wall * 2, ch - wall * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = S;
    ctx.strokeRect(cx + wall, cy + wall, cw - wall * 2, ch - wall * 2);
    if (detail && windows) {
      for (let q = 0; q < windows; q++) {
        const wx = cx + cw * (q + 0.5) / windows - 0.25 * u;
        ctx.fillStyle = on ? 'rgba(120,220,210,0.75)' : 'rgba(60,90,90,0.6)';
        ctx.fillRect(wx, cy + ch - wall + 0.3 * S, 0.5 * u, wall - 0.6 * S);
      }
    }
    return { x: cx + wall, y: cy + wall, w: cw - wall * 2, h: ch - wall * 2 };
  }

  // ── Layout anchors (feeds target these) ──
  const poolC   = { x: X(0.19), y: Y(0.20) };
  const dissC   = { x: X(0.255), y: Y(0.555) };
  const pumpC   = { x: X(0.055), y: Y(0.60) };
  const siloC   = { x: X(0.26), y: Y(0.845) };
  const gboxC   = { x: X(0.58), y: Y(0.845) };

  // ── Ports + feed runs (under the equipment) ──
  const st = (typeof ReprocessingSystem !== 'undefined') ? ReprocessingSystem.getStubs(e) : null;
  const aSpent = st && _portAnchor(e, px, py, w, h, st.spentIn);
  const aWater = st && _portAnchor(e, px, py, w, h, st.waterIn);
  const aPlut  = st && _portAnchor(e, px, py, w, h, st.plutoniumOut);
  const aRecov = st && _portAnchor(e, px, py, w, h, st.recoveredOut);
  if (aWater) _portFeed(aWater, pumpC.x, pumpC.y, S, t, on && !!e._waterConnected, 'pipe', waterCol);
  if (aSpent) _portFeed(aSpent, poolC.x, poolC.y, S, t, !!e._hasSpentFuel,          'belt', '#d0e040');
  // Both products leave slowly (a plutonium can every ~133s, a uranium drum
  // every ~33s at full rate), so each feed moves only while an item is going
  // out instead of scrolling nonstop like a stream.
  const leaving = (linked, kind) => !!linked && typeof BeltCargo !== 'undefined'
    && BeltCargo.sinceOut(e, kind) < 1.5;
  const plutMoving  = leaving(e._plutoniumConveyorOut, 'plutonium');
  const recovMoving = leaving(e._recoveredConveyorOut, 'recovered');
  if (aPlut)  _portFeed(aPlut,  gboxC.x, gboxC.y, S, t, plutMoving,  'belt', plutColor);
  if (aRecov) _portFeed(aRecov, siloC.x, siloC.y, S, t, recovMoving, 'belt', uColor);

  // ── Cells ──
  const pool = cell(0.035, 0.05, 0.325, 0.345, '#1f2a33', 3);
  const head = cell(0.035, 0.38,  0.325, 0.665, '#2c2a33', 3);
  const sep  = cell(0.365, 0.05, 0.655, 0.665, '#2a2735', 4);
  const wst  = cell(0.695, 0.30, 0.965, 0.665, '#302b22', 3);
  const uWing = cell(0.035, 0.72, 0.43, 0.955, '#2a3028', 0);
  const pWing = cell(0.465, 0.72, 0.72, 0.955, '#33291f', 0);

  // ── Process pipe rack between the cells ──
  // Drawn after the cell floors and before their equipment, so the lines
  // read as running along the walkways and in through the walls.
  const colX = [X(0.43), X(0.51), X(0.59)];
  const colT = Y(0.10), colB = Y(0.43);
  const settY = Y(0.555);
  _wfPipe([[pumpC.x, pumpC.y], [X(0.20), pumpC.y], [X(0.20), dissC.y]], S, t, on && !!e._waterConnected, waterCol);
  _wfPipe([[dissC.x, dissC.y], [X(0.345), dissC.y], [X(0.345), settY], [X(0.40), settY]], S, t, active, acidColor);
  _wfPipe([[X(0.40), settY], [X(0.40), colB], [colX[0], colB]], S, t, active, accent);
  _wfPipe([[colX[0], colT], [colX[1], colT]], S, t, active, accent);
  _wfPipe([[colX[1], colT], [colX[2], colT]], S, t, active, accent);
  _wfPipe([[colX[2], colB], [colX[2], settY]], S, t, active, accent);
  _wfPipe([[X(0.62), settY], [X(0.62), Y(0.70)], [gboxC.x, Y(0.70)], [gboxC.x, gboxC.y]], S, t, active, plutColor);
  _wfPipe([[X(0.40), settY + 0.3 * u], [X(0.40), Y(0.70)], [siloC.x, Y(0.70)], [siloC.x, siloC.y]], S, t, active, uColor);
  _wfPipe([[colX[1], colT], [colX[1], Y(0.035)], [X(0.76), Y(0.035)], [X(0.76), Y(0.40)]], S, t, active, hlwColor);
  _wfPipe([[X(0.76), Y(0.40)], [X(0.88), Y(0.40)]], S, t, active, hlwColor);
  _wfConveyor(poolC.x, poolC.y + 0.9 * u, X(0.14), Y(0.46), S, t, active, '#d0e040');

  // ── Reception pool ──
  // Incoming assemblies wait under water, and glow for it. Each one is a
  // bundle of pins with end fittings, not a flat tile.
  {
    const wg = ctx.createLinearGradient(0, pool.y, 0, pool.y + pool.h);
    wg.addColorStop(0, on ? '#1d5a86' : '#1b3442'); wg.addColorStop(1, on ? '#062036' : '#0b1822');
    ctx.fillStyle = wg; ctx.fillRect(pool.x, pool.y, pool.w, pool.h);
    const n = e._hasSpentFuel ? 8 : 0;
    const aw = pool.w / 5.2, ah = pool.h / 2.8;
    for (let i = 0; i < 10; i++) {
      const cx = pool.x + pool.w * (0.1 + (i % 5) * 0.2), cy = pool.y + pool.h * (0.3 + Math.floor(i / 5) * 0.42);
      const rackX = cx - aw / 2 + pool.w * 0.1 - aw * 0.5;
      ctx.strokeStyle = 'rgba(80,140,180,0.4)'; ctx.lineWidth = 0.8 * S;
      ctx.strokeRect(rackX, cy - ah / 2, aw, ah);
      if (i >= n) continue;
      const gx = cx + pool.w * 0.1 - aw * 0.5;
      const pl = on ? 0.6 + 0.3 * Math.sin(t * 2.3 + i) : 0.25;
      const g = ctx.createRadialGradient(gx, cy, 0, gx, cy, aw * 0.9);
      g.addColorStop(0, `rgba(170,230,255,${(0.55 * pl).toFixed(3)})`); g.addColorStop(1, 'rgba(60,140,255,0)');
      ctx.fillStyle = g; ctx.fillRect(gx - aw, cy - aw, aw * 2, aw * 2);
      ctx.fillStyle = `rgba(210,236,255,${(0.85 * pl).toFixed(3)})`;
      ctx.fillRect(gx - aw * 0.32, cy - ah * 0.4, aw * 0.64, ah * 0.1);
      ctx.fillRect(gx - aw * 0.32, cy + ah * 0.3, aw * 0.64, ah * 0.1);
      for (let p = 0; p < 3; p++) {
        const pxA = gx - aw * 0.2 + p * aw * 0.2;
        ctx.fillStyle = p === 1 ? `rgba(230,248,255,${(0.9 * pl).toFixed(3)})` : `rgba(140,200,235,${(0.8 * pl).toFixed(3)})`;
        ctx.fillRect(pxA - 0.7 * S, cy - ah * 0.28, 1.4 * S, ah * 0.56);
      }
    }
    if (on) {
      ctx.strokeStyle = 'rgba(190,235,255,0.16)'; ctx.lineWidth = S;
      for (let q = 0; q < 3; q++) {
        const ry = pool.y + pool.h * (0.18 + q * 0.32);
        ctx.beginPath(); ctx.moveTo(pool.x, ry);
        for (let xq = 0; xq <= 12; xq++) ctx.lineTo(pool.x + pool.w * xq / 12, ry + Math.sin(t * 1.7 + xq * 0.7 + q) * 1.3 * S);
        ctx.stroke();
      }
    }
    // Bridge crane: end trucks, a beam across the pool, and a hoist.
    const cxr = pool.x + pool.w * (active ? 0.5 + 0.35 * Math.sin(t * 0.5) : 0.72);
    ctx.fillStyle = '#8e969c';
    ctx.fillRect(cxr - 0.3 * u, pool.y, 0.6 * u, 0.16 * u);
    ctx.fillRect(cxr - 0.3 * u, pool.y + pool.h - 0.16 * u, 0.6 * u, 0.16 * u);
    const beam = ctx.createLinearGradient(cxr - 0.1 * u, 0, cxr + 0.1 * u, 0);
    beam.addColorStop(0, '#6a7278'); beam.addColorStop(0.45, '#e2e6ea'); beam.addColorStop(1, '#4a5258');
    ctx.fillStyle = beam;
    ctx.fillRect(cxr - 0.1 * u, pool.y + 0.16 * u, 0.2 * u, pool.h - 0.32 * u);
    const hy = pool.y + pool.h * (0.32 + (active ? 0.22 * Math.sin(t * 0.8) : 0.1));
    ctx.fillStyle = '#d5dbe0'; ctx.strokeStyle = '#2a3034'; ctx.lineWidth = 0.8 * S;
    ctx.fillRect(cxr - 0.2 * u, hy, 0.4 * u, 0.26 * u); ctx.strokeRect(cxr - 0.2 * u, hy, 0.4 * u, 0.26 * u);
    ctx.beginPath(); ctx.moveTo(cxr, hy + 0.26 * u); ctx.lineTo(cxr, hy + 0.5 * u); ctx.stroke();
    ctx.fillStyle = active ? '#d8e868' : '#8a9094';
    ctx.beginPath(); ctx.moveTo(cxr - 0.1 * u, hy + 0.5 * u); ctx.lineTo(cxr + 0.1 * u, hy + 0.5 * u); ctx.lineTo(cxr, hy + 0.68 * u); ctx.closePath(); ctx.fill();
  }

  // ── Head-end cell: shear + rotary dissolver ──
  {
    const shX = X(0.12), shY = Y(0.47), sw = 0.9 * u, shh = 0.7 * u;
    const sg = ctx.createLinearGradient(shX - sw / 2, 0, shX + sw / 2, 0);
    sg.addColorStop(0, '#5a5464'); sg.addColorStop(0.5, '#3a3644'); sg.addColorStop(1, '#221e2a');
    ctx.fillStyle = on ? sg : '#2a2630'; ctx.strokeStyle = '#17141d'; ctx.lineWidth = 1.2 * S;
    ctx.beginPath(); ctx.roundRect(shX - sw / 2, shY - shh / 2, sw, shh, 2 * S); ctx.fill(); ctx.stroke();
    // Guide posts and a guillotine with a toothed edge.
    ctx.fillStyle = on ? '#8a8494' : '#4a4454';
    ctx.fillRect(shX - sw * 0.4, shY - shh * 0.4, 1.6 * S, shh * 0.8);
    ctx.fillRect(shX + sw * 0.4 - 1.6 * S, shY - shh * 0.4, 1.6 * S, shh * 0.8);
    const stroke = active ? 0.5 + 0.5 * Math.sin(t * 5) : 0.08;
    const bladeY = shY - shh * 0.32 + stroke * shh * 0.42;
    const bg = ctx.createLinearGradient(0, bladeY, 0, bladeY + 3.2 * S);
    bg.addColorStop(0, active ? '#fff0d0' : '#8a8494');
    bg.addColorStop(1, active ? '#c06020' : '#4a4450');
    ctx.fillStyle = bg;
    ctx.fillRect(shX - sw * 0.34, bladeY, sw * 0.68, 2.8 * S);
    if (detail) {
      ctx.fillStyle = active ? '#ffd0a0' : '#6a6272';
      for (let q = 0; q < 5; q++) {
        const tx = shX - sw * 0.3 + q * sw * 0.14;
        ctx.beginPath(); ctx.moveTo(tx, bladeY + 2.8 * S); ctx.lineTo(tx + sw * 0.06, bladeY + 2.8 * S); ctx.lineTo(tx + sw * 0.03, bladeY + 4.4 * S); ctx.closePath(); ctx.fill();
      }
    }
    ctx.fillStyle = '#121016';
    ctx.fillRect(shX - sw * 0.32, shY + shh * 0.16, sw * 0.64, shh * 0.2);
    if (active && stroke > 0.75) {
      ctx.fillStyle = '#d0e040';
      ctx.fillRect(shX - sw * 0.08, shY + shh * 0.2, sw * 0.1, shh * 0.1);
      ctx.fillRect(shX + sw * 0.06, shY + shh * 0.22, sw * 0.08, shh * 0.08);
    }

    const dr = 0.62 * u;
    const a0 = active ? t * 1.2 : 0.3;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(dissC.x + 3 * S, dissC.y + 4 * S, dr, 0, Math.PI * 2); ctx.fill();
    const dg = ctx.createRadialGradient(dissC.x - dr * 0.4, dissC.y - dr * 0.4, dr * 0.05, dissC.x, dissC.y, dr);
    dg.addColorStop(0, on ? '#d4cce0' : '#6a6474'); dg.addColorStop(0.55, '#6a6278'); dg.addColorStop(1, '#2a2434');
    ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(dissC.x, dissC.y, dr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = on ? '#c8bdd8' : '#3a3446'; ctx.lineWidth = 1.5 * S; ctx.stroke();
    for (let q = 0; q < 8; q++) {
      const a = a0 + q * Math.PI / 4;
      ctx.fillStyle = on ? '#e6deee' : '#5a5464';
      ctx.beginPath(); ctx.arc(dissC.x + Math.cos(a) * dr * 0.82, dissC.y + Math.sin(a) * dr * 0.82, 0.9 * S, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save();
    ctx.beginPath(); ctx.arc(dissC.x, dissC.y, dr * 0.68, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = active ? 'rgba(196,206,96,0.72)' : 'rgba(70,74,48,0.65)';
    ctx.fillRect(dissC.x - dr, dissC.y - dr * 0.15, dr * 2, dr);
    ctx.save(); ctx.translate(dissC.x, dissC.y); ctx.rotate(a0);
    ctx.fillStyle = on ? '#ece6f4' : '#5a5464';
    for (let q = 0; q < 4; q++) {
      ctx.rotate(Math.PI / 2);
      ctx.fillRect(dr * 0.12, -1.1 * S, dr * 0.5, 2.2 * S);
    }
    ctx.restore();
    if (active) {
      for (let q = 0; q < 5; q++) {
        const a = -t * 2.4 + q * 1.3;
        const rr = dr * (0.2 + (q % 3) * 0.12);
        ctx.fillStyle = q % 2 ? 'rgba(255,255,210,0.8)' : 'rgba(150,210,255,0.7)';
        ctx.beginPath(); ctx.arc(dissC.x + Math.cos(a) * rr, dissC.y + Math.sin(a) * rr * 0.6 + dr * 0.15, 1.3 * S, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    ctx.fillStyle = '#1c1824'; ctx.beginPath(); ctx.arc(dissC.x, dissC.y, dr * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.1 * S;
    ctx.beginPath(); ctx.arc(dissC.x, dissC.y, dr * 0.5, -2.4, -1.1); ctx.stroke();
    if (active && detail) {
      for (let q = 0; q < 3; q++) {
        const ph = (t * 0.5 + q / 3) % 1;
        ctx.fillStyle = `rgba(230,230,200,${(0.22 * (1 - ph)).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(dissC.x + (q - 1) * dr * 0.4, dissC.y - dr - ph * dr, (0.12 + 0.2 * ph) * u, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // ── Water intake pump ──
  {
    const r = 0.32 * u;
    const spinning = on && !!e._waterConnected;
    const vg = ctx.createRadialGradient(pumpC.x - r * 0.3, pumpC.y - r * 0.3, 1, pumpC.x, pumpC.y, r);
    vg.addColorStop(0, spinning ? '#8ec0d4' : '#4a6878'); vg.addColorStop(1, '#1a303c');
    ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(pumpC.x, pumpC.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#9fd4e8'; ctx.lineWidth = 1.2 * S; ctx.stroke();
    ctx.save(); ctx.translate(pumpC.x, pumpC.y); ctx.rotate(spinning ? t * 7 : 0.4);
    ctx.fillStyle = '#e8f6fc';
    for (let q = 0; q < 4; q++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath(); ctx.ellipse(r * 0.42, 0, r * 0.36, Math.max(1.1 * S, r * 0.16), 0.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#16303c'; ctx.beginPath(); ctx.arc(pumpC.x, pumpC.y, r * 0.2, 0, Math.PI * 2); ctx.fill();
  }

  // ── Separation hall ──
  // Pulsed columns: the organic phase rising through the aqueous one.
  const colR = 0.32 * u;
  colX.forEach((cx, i) => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.roundRect(cx - colR + 4 * S, colT + 5 * S, colR * 2, colB - colT, colR * 0.6); ctx.fill();
    const cg = ctx.createLinearGradient(cx - colR, 0, cx + colR, 0);
    cg.addColorStop(0, '#5e586e'); cg.addColorStop(0.35, '#c6bdd6'); cg.addColorStop(1, '#2e2a3a');
    ctx.fillStyle = cg; ctx.strokeStyle = '#171320'; ctx.lineWidth = 1.2 * S;
    ctx.beginPath(); ctx.roundRect(cx - colR, colT, colR * 2, colB - colT, colR * 0.6); ctx.fill(); ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(cx - colR + 2 * S, colT + 2 * S, colR * 2 - 4 * S, colB - colT - 4 * S, colR * 0.5); ctx.clip();
    // Interface level bobs with the pulser.
    const lvl = colT + (colB - colT) * (0.45 + (active ? 0.05 * Math.sin(t * 3 + i) : 0));
    ctx.fillStyle = active ? 'rgba(120,70,200,0.35)' : 'rgba(60,50,80,0.3)';
    ctx.fillRect(cx - colR, lvl, colR * 2, colB - lvl);
    if (active) {
      for (let q = 0; q < 5; q++) {
        const fy = colB - ((t * 0.35 + q * 0.2 + i * 0.13) % 1) * (colB - colT);
        ctx.fillStyle = 'rgba(200,150,255,' + (0.35 + 0.2 * Math.sin(t * 4 + q)) + ')';
        ctx.beginPath(); ctx.ellipse(cx, fy, colR * 0.7, 0.07 * u, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(20,16,28,0.55)'; ctx.lineWidth = 0.9 * S;
    for (let q = 1; q < 7; q++) {
      const ly = colT + (colB - colT) * q / 7;
      ctx.beginPath(); ctx.moveTo(cx - colR, ly); ctx.lineTo(cx + colR, ly); ctx.stroke();
      if (detail) {
        ctx.fillStyle = 'rgba(230,220,245,0.35)';
        ctx.beginPath(); ctx.arc(cx - colR * 0.45, ly, 0.7 * S, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + colR * 0.45, ly, 0.7 * S, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Sieve plates read as a row of holes; the pulser sits on the crown.
    ctx.fillStyle = '#2a2434';
    ctx.beginPath(); ctx.roundRect(cx - colR * 1.15, colB - 0.12 * u, colR * 2.3, 0.22 * u, 1 * S); ctx.fill();
    ctx.fillStyle = '#453e54'; ctx.strokeStyle = '#171320'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.arc(cx, colT, colR * 0.9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = on ? '#c8bdd8' : '#3a3444'; ctx.lineWidth = 0.7 * S;
    ctx.beginPath(); ctx.arc(cx, colT, colR * 0.62, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = active ? accent : '#5a5268';
    ctx.beginPath(); ctx.arc(cx, colT, colR * 0.35 * (active ? 0.8 + 0.2 * Math.sin(t * 6 + i) : 1), 0, Math.PI * 2); ctx.fill();
  });
  // Mixer-settler bank: stages alternate mixing (swirl) and settling (split).
  {
    const n = 6, x0 = X(0.395), x1 = X(0.635), sw = (x1 - x0) / n, sh = 0.75 * u;
    for (let q = 0; q < n; q++) {
      const sx = x0 + q * sw;
      const mixing = q % 2 === 0;
      ctx.fillStyle = mixing ? '#3c3848' : '#322e3c'; ctx.strokeStyle = '#17141d'; ctx.lineWidth = S;
      ctx.beginPath(); ctx.roundRect(sx + 1 * S, settY - sh / 2, sw - 2 * S, sh, 1.2 * S); ctx.fill(); ctx.stroke();
      // Settled layers: organic over aqueous. Mix stages stir the interface.
      ctx.fillStyle = active ? 'rgba(176,112,255,0.55)' : 'rgba(80,70,100,0.5)';
      ctx.fillRect(sx + 2.5 * S, settY - sh / 2 + 2 * S, sw - 5 * S, sh * 0.38);
      ctx.fillStyle = active ? 'rgba(210,220,120,0.5)' : 'rgba(80,84,60,0.5)';
      ctx.fillRect(sx + 2.5 * S, settY + sh * 0.02, sw - 5 * S, sh * 0.38);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 0.7 * S;
      ctx.beginPath(); ctx.moveTo(sx + 3 * S, settY); ctx.lineTo(sx + sw - 3 * S, settY); ctx.stroke();
      if (mixing) {
        ctx.save(); ctx.translate(sx + sw / 2, settY); ctx.rotate(active ? t * 4 + q : q);
        ctx.strokeStyle = 'rgba(255,240,220,0.85)'; ctx.lineWidth = 1.1 * S;
        ctx.beginPath();
        ctx.moveTo(-sw * 0.22, -1 * S); ctx.lineTo(sw * 0.22, 1 * S);
        ctx.moveTo(-sw * 0.22, 1 * S); ctx.lineTo(sw * 0.22, -1 * S);
        ctx.stroke();
        ctx.restore();
      } else if (detail) {
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(sx + 4 * S, settY - 0.6 * S, sw * 0.35, 1.1 * S);
      }
    }
  }

  // ── Off-gas stack ──
  // Iodine and krypton scrubbing ends here; the plume only shows while the
  // head end is actually dissolving.
  {
    const sx = X(0.82), sy = Y(0.14), r = 0.62 * u;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(sx + 4 * S, sy + 5 * S, r, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(sx - r * 0.35, sy - r * 0.35, r * 0.05, sx, sy, r);
    g.addColorStop(0, '#e4e8ec'); g.addColorStop(0.55, '#8a9096'); g.addColorStop(1, '#3a4046');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1a1d20'; ctx.lineWidth = 1.2 * S; ctx.stroke();
    ctx.strokeStyle = '#c04030'; ctx.lineWidth = 2 * S;
    ctx.beginPath(); ctx.arc(sx, sy, r * 0.78, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.8 * S;
    ctx.beginPath(); ctx.arc(sx, sy, r * 0.62, -2.2, -0.8); ctx.stroke();
    for (let q = 0; q < 6; q++) {
      const a = q * Math.PI / 3;
      ctx.fillStyle = '#d8dce0';
      ctx.beginPath(); ctx.arc(sx + Math.cos(a) * r * 0.9, sy + Math.sin(a) * r * 0.9, 1 * S, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#101316'; ctx.beginPath(); ctx.arc(sx, sy, r * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(180,190,200,0.45)'; ctx.lineWidth = 0.7 * S;
    ctx.beginPath(); ctx.moveTo(sx - r * 0.2, sy - r * 0.15); ctx.lineTo(sx, sy + r * 0.18); ctx.lineTo(sx + r * 0.2, sy - r * 0.15); ctx.stroke();
    _wfPipe([[X(0.345), Y(0.42)], [X(0.345), Y(0.35)], [X(0.70), Y(0.35)], [X(0.70), sy], [sx - r, sy]], S, t, active, 'rgba(200,200,200,0.8)');
    if (active && detail) {
      for (let q = 0; q < 4; q++) {
        const ph = (t * 0.3 + q / 4) % 1;
        ctx.fillStyle = `rgba(225,230,235,${(0.25 * (1 - ph)).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(sx + ph * r * 1.6, sy - ph * r * 1.2, r * (0.35 + 0.5 * ph), 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // ── Waste wing: HLW tank, vitrification melter, glass canisters ──
  {
    const tX = X(0.76), tY = Y(0.40), tr = 0.55 * u;
    const tg = ctx.createRadialGradient(tX - tr * 0.35, tY - tr * 0.35, tr * 0.05, tX, tY, tr);
    tg.addColorStop(0, '#8a8468'); tg.addColorStop(0.6, '#4a4636'); tg.addColorStop(1, '#242014');
    ctx.fillStyle = tg; ctx.strokeStyle = '#17140c'; ctx.lineWidth = 1.2 * S;
    ctx.beginPath(); ctx.arc(tX, tY, tr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(140,210,255,0.55)'; ctx.lineWidth = 1.1 * S;
    for (let q = 1; q <= 3; q++) { ctx.beginPath(); ctx.arc(tX, tY, tr * q / 4, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = '#12100c'; ctx.beginPath(); ctx.arc(tX, tY, tr * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hlwColor; ctx.globalAlpha = 0.25 + 0.65 * hlwFill;
    ctx.beginPath(); ctx.arc(tX, tY, tr * (0.18 + 0.32 * hlwFill), 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,220,0.45)';
    ctx.beginPath(); ctx.arc(tX - tr * 0.12, tY - tr * 0.1, tr * 0.08, 0, Math.PI * 2); ctx.fill();

    const mX = X(0.88), mY = Y(0.40), mw = 0.95 * u, mh = 0.8 * u;
    const mg = ctx.createLinearGradient(mX - mw / 2, 0, mX + mw / 2, 0);
    mg.addColorStop(0, '#4a4030'); mg.addColorStop(0.5, '#2e281c'); mg.addColorStop(1, '#1a1610');
    ctx.fillStyle = mg; ctx.strokeStyle = '#17140c'; ctx.lineWidth = 1.3 * S;
    ctx.beginPath(); ctx.roundRect(mX - mw / 2, mY - mh / 2, mw, mh, 2 * S); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = active ? 'rgba(255,170,60,0.7)' : 'rgba(90,70,40,0.45)'; ctx.lineWidth = 0.8 * S;
    for (let q = 1; q < 4; q++) {
      const ex = mX - mw * 0.35 + mw * 0.7 * q / 4;
      ctx.beginPath(); ctx.moveTo(ex, mY - mh * 0.4); ctx.lineTo(ex, mY + mh * 0.4); ctx.stroke();
    }
    if (active) {
      const fg = ctx.createRadialGradient(mX, mY, 1, mX, mY, mw * 0.65);
      fg.addColorStop(0, 'rgba(255,220,120,' + (0.75 + 0.2 * Math.sin(t * 4.3)) + ')');
      fg.addColorStop(0.5, 'rgba(255,140,30,0.35)');
      fg.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(mX, mY, mw * 0.65, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#100e0a';
    ctx.beginPath(); ctx.roundRect(mX - mw * 0.32, mY - mh * 0.22, mw * 0.64, mh * 0.44, 1 * S); ctx.fill();
    ctx.fillStyle = active ? '#ffe090' : '#4a4230';
    ctx.beginPath(); ctx.ellipse(mX, mY + mh * 0.04, mw * 0.22, mh * 0.12, 0, 0, Math.PI * 2); ctx.fill();

    // Canister rank: fills with _hlw, one truckload when full.
    const nC = 6, cr = 0.22 * u;
    for (let q = 0; q < nC; q++) {
      const cx = X(0.735) + q * (wst.w / nC) + cr, cy = Y(0.585);
      const filled = (q + 1) / nC <= hlwFill + 0.001;
      const cg = ctx.createRadialGradient(cx - cr * 0.3, cy - cr * 0.35, cr * 0.1, cx, cy, cr);
      cg.addColorStop(0, filled ? '#c8b080' : '#6a645c');
      cg.addColorStop(0.6, filled ? '#8a7440' : '#3e3a34');
      cg.addColorStop(1, '#241e16');
      ctx.fillStyle = cg; ctx.strokeStyle = '#181410'; ctx.lineWidth = S;
      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,200,0.35)'; ctx.lineWidth = 0.7 * S;
      ctx.beginPath(); ctx.arc(cx, cy, cr * 0.82, -2.3, -0.9); ctx.stroke();
      if (filled) {
        ctx.fillStyle = on ? `rgba(255,208,32,${(0.55 + 0.25 * Math.sin(t * 2 + q)).toFixed(3)})` : 'rgba(150,120,40,0.45)';
        ctx.beginPath(); ctx.arc(cx, cy, cr * 0.42, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = '#1a1612';
        ctx.beginPath(); ctx.arc(cx, cy, cr * 0.28, 0, Math.PI * 2); ctx.fill();
      }
    }
    _wfHazardStripe(wst.x, Y(0.645), wst.w, 3.5 * S, S);
    _wfGauge(X(0.945), Y(0.34), 6 * S, h * 0.25, S, hlwFill, hlwColor, on);
  }

  // ── Product wing: uranium denitration + silo ──
  {
    const dX = X(0.11), dY = Y(0.845), dw = 1.0 * u, dh = 0.8 * u;
    const kiln = ctx.createLinearGradient(dX - dw / 2, 0, dX + dw / 2, 0);
    kiln.addColorStop(0, '#4a5640'); kiln.addColorStop(0.5, '#2e3628'); kiln.addColorStop(1, '#1a2016');
    ctx.fillStyle = kiln; ctx.strokeStyle = '#151a12'; ctx.lineWidth = 1.2 * S;
    ctx.beginPath(); ctx.roundRect(dX - dw / 2, dY - dh * 0.38, dw, dh * 0.76, dh * 0.38); ctx.fill(); ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(dX - dw / 2, dY - dh * 0.38, dw, dh * 0.76, dh * 0.38); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.3 * S;
    const koff = active ? (t * 14 * S) % (8 * S) : 0;
    for (let q = -1; q < 6; q++) {
      const fx = dX - dw / 2 + koff + q * 8 * S;
      ctx.beginPath(); ctx.moveTo(fx, dY - dh * 0.38); ctx.lineTo(fx + 4 * S, dY + dh * 0.38); ctx.stroke();
    }
    if (active) {
      const hg = ctx.createLinearGradient(dX - dw * 0.4, 0, dX + dw * 0.2, 0);
      hg.addColorStop(0, 'rgba(255,150,50,0.65)'); hg.addColorStop(1, 'rgba(255,150,50,0)');
      ctx.fillStyle = hg; ctx.fillRect(dX - dw / 2, dY - dh * 0.38, dw, dh * 0.76);
    }
    ctx.restore();
    ctx.fillStyle = active ? '#ffb060' : '#3a3428';
    ctx.beginPath(); ctx.arc(dX - dw * 0.42, dY, dh * 0.22, 0, Math.PI * 2); ctx.fill();
    const r = 0.7 * u;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(siloC.x + 4 * S, siloC.y + 5 * S, r, 0, Math.PI * 2); ctx.fill();
    const ug = ctx.createRadialGradient(siloC.x - r * 0.35, siloC.y - r * 0.35, 1, siloC.x, siloC.y, r);
    ug.addColorStop(0, '#d4dcc8'); ug.addColorStop(0.55, '#6a7660'); ug.addColorStop(1, '#262c22');
    ctx.fillStyle = ug; ctx.beginPath(); ctx.arc(siloC.x, siloC.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = on ? uColor : '#151a12'; ctx.lineWidth = 1.4 * S; ctx.stroke();
    ctx.fillStyle = '#1a2016'; ctx.beginPath(); ctx.arc(siloC.x, siloC.y, r * 0.72, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = uColor; ctx.globalAlpha = 0.25 + 0.7 * uFill;
    ctx.beginPath(); ctx.arc(siloC.x, siloC.y, r * (0.22 + 0.46 * uFill), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.arc(siloC.x, siloC.y, r * 0.5, -2.5, -1.05); ctx.stroke();
    for (let q = 0; q < 6; q++) {
      const a = q * Math.PI / 3;
      ctx.fillStyle = '#c8d0c0';
      ctx.beginPath(); ctx.arc(siloC.x + Math.cos(a) * r * 0.86, siloC.y + Math.sin(a) * r * 0.86, 1 * S, 0, Math.PI * 2); ctx.fill();
    }
    _wfGauge(X(0.395), Y(0.76), 6 * S, h * 0.17, S, uFill, uColor, on);
  }

  // ── Product wing: plutonium glovebox line ──
  {
    const gw = pWing.w * 0.82, gh = 0.8 * u;
    const box = ctx.createLinearGradient(gboxC.x - gw / 2, 0, gboxC.x + gw / 2, 0);
    box.addColorStop(0, '#4a3c32'); box.addColorStop(0.5, '#2e2622'); box.addColorStop(1, '#1a1410');
    ctx.fillStyle = box; ctx.strokeStyle = on ? plutColor : '#161210'; ctx.lineWidth = 1.3 * S;
    ctx.beginPath(); ctx.roundRect(gboxC.x - gw / 2, gboxC.y - gh / 2, gw, gh, 2.5 * S); ctx.fill(); ctx.stroke();
    // Steel top rail with a lamp strip and lifting lugs: the boxes hang off
    // a shared service rail, they are not loose cabinets.
    ctx.fillStyle = on ? '#5a4c40' : '#2c2620';
    ctx.fillRect(gboxC.x - gw / 2 + 2 * S, gboxC.y - gh / 2 + 1.5 * S, gw - 4 * S, gh * 0.07);
    ctx.fillStyle = active ? 'rgba(255,200,130,0.8)' : 'rgba(120,100,80,0.35)';
    ctx.fillRect(gboxC.x - gw / 2 + 4 * S, gboxC.y - gh / 2 + 1.5 * S + gh * 0.07, gw - 8 * S, 0.8 * S);
    for (let q = 0; q < 4; q++) {
      const gx = gboxC.x - gw / 2 + gw * (0.14 + q * 0.24);
      const ww = gw * 0.16, wh = gh * 0.48;
      const wy = gboxC.y - gh * 0.28;
      // Cell seam + flange bolts between boxes.
      if (q) {
        const sx = gx - gw * 0.12;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.1 * S;
        ctx.beginPath(); ctx.moveTo(sx, gboxC.y - gh / 2 + 2 * S); ctx.lineTo(sx, gboxC.y + gh / 2 - 2 * S); ctx.stroke();
        ctx.fillStyle = on ? '#a89478' : '#4a4038';
        for (let b = 0; b < 3; b++) { ctx.beginPath(); ctx.arc(sx + 1.4 * S, gboxC.y - gh * 0.3 + b * gh * 0.3, 0.6 * S, 0, Math.PI * 2); ctx.fill(); }
      }
      // Bolted bezel round the leaded-glass window.
      ctx.fillStyle = on ? '#6a5848' : '#302822';
      ctx.beginPath(); ctx.roundRect(gx - ww / 2 - 1.6 * S, wy - 1.6 * S, ww + 3.2 * S, wh + 3.2 * S, 2 * S); ctx.fill();
      ctx.fillStyle = '#0c0a08';
      ctx.beginPath(); ctx.roundRect(gx - ww / 2, wy, ww, wh, 1.2 * S); ctx.fill();
      // Interior: back wall glow, a work shelf, and a pellet tray sliding on it.
      const ig = ctx.createLinearGradient(0, wy, 0, wy + wh);
      ig.addColorStop(0, active ? 'rgba(255,170,80,' + (0.45 + 0.15 * Math.sin(t * 3 + q * 1.4)) + ')' : 'rgba(90,70,50,0.35)');
      ig.addColorStop(1, active ? 'rgba(160,70,20,0.35)' : 'rgba(40,30,22,0.5)');
      ctx.fillStyle = ig;
      ctx.beginPath(); ctx.roundRect(gx - ww / 2, wy, ww, wh, 1.2 * S); ctx.fill();
      ctx.fillStyle = 'rgba(20,14,10,0.85)';
      ctx.fillRect(gx - ww / 2, wy + wh * 0.62, ww, wh * 0.08);
      if (active) {
        const p = 0.5 + 0.5 * Math.sin(t * 1.6 - q * 0.8);
        const tx = gx - ww * 0.3 + p * ww * 0.6;
        ctx.fillStyle = '#3a2a1e'; ctx.fillRect(tx - ww * 0.16, wy + wh * 0.5, ww * 0.32, wh * 0.13);
        ctx.fillStyle = plutColor;
        for (let k2 = -1; k2 <= 1; k2++) { ctx.beginPath(); ctx.arc(tx + k2 * ww * 0.09, wy + wh * 0.47, ww * 0.055, 0, Math.PI * 2); ctx.fill(); }
        const hg = ctx.createRadialGradient(tx, wy + wh * 0.5, 1, tx, wy + wh * 0.5, ww * 0.6);
        hg.addColorStop(0, 'rgba(255,170,70,0.4)'); hg.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = hg; ctx.fillRect(gx - ww / 2, wy, ww, wh);
      }
      // Leaded glass: diagonal glare and a faint green tint at the edge.
      ctx.save();
      ctx.beginPath(); ctx.roundRect(gx - ww / 2, wy, ww, wh, 1.2 * S); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath(); ctx.moveTo(gx - ww * 0.5, wy); ctx.lineTo(gx - ww * 0.05, wy); ctx.lineTo(gx - ww * 0.5, wy + wh * 0.7); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(160,220,190,0.35)'; ctx.lineWidth = 0.8 * S;
      ctx.strokeRect(gx - ww / 2 + 0.4 * S, wy + 0.4 * S, ww - 0.8 * S, wh - 0.8 * S);
      ctx.restore();
      // Glove sleeves: a port ring, a rubber cuff, and a glove drooping
      // into the box, instead of plain wheel-like discs.
      [-1, 1].forEach(side => {
        const sx2 = gx + side * ww * 0.24, sy2 = gboxC.y + gh * 0.36, pr = 0.085 * u;
        ctx.fillStyle = on ? '#4a3c30' : '#241e18';
        ctx.beginPath(); ctx.arc(sx2, sy2, pr * 1.35, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = on ? '#e0c8a8' : '#4a4038'; ctx.lineWidth = 0.7 * S; ctx.stroke();
        ctx.fillStyle = on ? '#b89a6a' : '#4a4034';
        ctx.beginPath(); ctx.arc(sx2, sy2, pr * 0.95, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = on ? '#7a5c3a' : '#332a20';
        ctx.beginPath(); ctx.ellipse(sx2 + side * pr * 0.1, sy2 - pr * 0.15, pr * 0.55, pr * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,235,200,0.35)'; ctx.lineWidth = 0.6 * S;
        ctx.beginPath(); ctx.arc(sx2, sy2, pr * 0.7, -2.4, -1.2); ctx.stroke();
      });
      // Per-box pressure pip under the window.
      ctx.fillStyle = on ? (q % 3 === 2 && active ? '#ffb030' : '#50e090') : '#3a3228';
      ctx.beginPath(); ctx.arc(gx, gboxC.y + gh * 0.17, 0.7 * S, 0, Math.PI * 2); ctx.fill();
    }
    // Feed pipe stub entering the top of the line.
    ctx.fillStyle = on ? '#8a7a68' : '#3a342c';
    ctx.fillRect(gboxC.x - gw / 2 + gw * 0.14 - 1.5 * S, gboxC.y - gh / 2 - 2 * S, 3 * S, 3 * S);
    _wfHazardStripe(pWing.x, Y(0.93), pWing.w, 3.5 * S, S);
    _wfGauge(X(0.705), Y(0.76), 6 * S, h * 0.17, S, plutFill, plutColor, on);
  }

  // ── Control building ──
  {
    const cx = X(0.75), cy = Y(0.72), cw = X(0.965) - cx, ch = Y(0.955) - cy;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(cx + 3 * S, cy + 4 * S, cw, ch);
    const bg = ctx.createLinearGradient(cx, cy, cx, cy + ch);
    bg.addColorStop(0, '#6e767c'); bg.addColorStop(1, '#3e4448');
    ctx.fillStyle = bg; ctx.strokeStyle = '#1a1d20'; ctx.lineWidth = 1.2 * S;
    ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 2.5 * S); ctx.fill(); ctx.stroke();
    // Roof parapet + plant on the roof: a cooling unit, a vent stack, a mast.
    ctx.fillStyle = '#8a9298';
    ctx.beginPath(); ctx.roundRect(cx - 1 * S, cy - 1.5 * S, cw + 2 * S, ch * 0.07, 2 * S); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.7 * S; ctx.stroke();
    ctx.fillStyle = '#586066';
    ctx.fillRect(cx + cw * 0.12, cy - 3.5 * S, cw * 0.22, 3 * S);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.6 * S;
    for (let g = 1; g < 4; g++) { const gxl = cx + cw * 0.12 + cw * 0.22 * g / 4; ctx.beginPath(); ctx.moveTo(gxl, cy - 3.5 * S); ctx.lineTo(gxl, cy - 0.5 * S); ctx.stroke(); }
    ctx.fillStyle = '#6a7278';
    ctx.fillRect(cx + cw * 0.62, cy - 4.5 * S, 2.6 * S, 4 * S);
    ctx.strokeStyle = '#9aa2a8'; ctx.lineWidth = 0.8 * S;
    ctx.beginPath(); ctx.moveTo(cx + cw * 0.86, cy); ctx.lineTo(cx + cw * 0.86, cy - 7 * S); ctx.stroke();
    ctx.fillStyle = on && Math.sin(t * 3) > 0 ? '#ff4030' : '#502420';
    ctx.beginPath(); ctx.arc(cx + cw * 0.86, cy - 7 * S, 0.9 * S, 0, Math.PI * 2); ctx.fill();

    // Facade panel with vertical cladding seams.
    ctx.fillStyle = '#2a3036';
    ctx.fillRect(cx + cw * 0.08, cy + ch * 0.1, cw * 0.84, ch * 0.62);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 0.6 * S;
    for (let s2 = 1; s2 < 8; s2++) { const sx = cx + cw * (0.08 + 0.84 * s2 / 8); ctx.beginPath(); ctx.moveTo(sx, cy + ch * 0.1); ctx.lineTo(sx, cy + ch * 0.72); ctx.stroke(); }
    for (let q = 0; q < 4; q++) for (let r = 0; r < 2; r++) {
      const lit = on && ((q + r + Math.floor(t * 0.5)) % 3 !== 0);
      const wx = cx + cw * (0.14 + q * 0.2), wy = cy + ch * (0.18 + r * 0.28);
      const ww2 = cw * 0.13, wh2 = ch * 0.16;
      // Frame + sill so the openings read as set into the wall.
      ctx.fillStyle = '#7a848a'; ctx.fillRect(wx - 1.2 * S, wy - 1.2 * S, ww2 + 2.4 * S, wh2 + 2.4 * S);
      ctx.fillStyle = lit ? 'rgba(255,214,120,0.9)' : 'rgba(24,32,40,0.95)';
      ctx.fillRect(wx, wy, ww2, wh2);
      if (lit) {
        // Half-drawn blind: slats across the top of the pane.
        ctx.fillStyle = 'rgba(150,110,50,0.45)';
        const slats = 1 + ((q * 2 + r) % 3);
        for (let sl = 0; sl < slats; sl++) ctx.fillRect(wx, wy + sl * wh2 * 0.17, ww2, wh2 * 0.09);
      } else {
        ctx.fillStyle = 'rgba(120,150,180,0.12)';
        ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + ww2 * 0.55, wy); ctx.lineTo(wx, wy + wh2 * 0.8); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(20,26,30,0.7)'; ctx.lineWidth = 0.6 * S;
      ctx.beginPath(); ctx.moveTo(wx + ww2 / 2, wy); ctx.lineTo(wx + ww2 / 2, wy + wh2); ctx.stroke();
      ctx.fillStyle = '#5a646a'; ctx.fillRect(wx - 1.8 * S, wy + wh2 + 1.2 * S, ww2 + 3.6 * S, 1.2 * S);
      if (lit && detail) {
        ctx.fillStyle = 'rgba(255,255,230,0.35)';
        ctx.fillRect(wx, wy, cw * 0.04, wh2);
      }
    }
    // Entrance: recessed glazed door, handle, awning, and a step.
    const dX = cx + cw * 0.38, dY = cy + ch * 0.74, dW = cw * 0.24, dH = ch * 0.26;
    ctx.fillStyle = '#12171a'; ctx.fillRect(dX, dY, dW, dH);
    ctx.fillStyle = on ? 'rgba(150,200,220,0.28)' : 'rgba(90,110,125,0.18)';
    ctx.fillRect(dX + dW * 0.1, dY + dH * 0.14, dW * 0.38, dH * 0.6);
    ctx.fillRect(dX + dW * 0.52, dY + dH * 0.14, dW * 0.38, dH * 0.6);
    ctx.fillStyle = '#c8d0d4';
    ctx.fillRect(dX + dW * 0.44, dY + dH * 0.45, 0.8 * S, dH * 0.2);
    ctx.fillRect(dX + dW * 0.56, dY + dH * 0.45, 0.8 * S, dH * 0.2);
    ctx.fillStyle = '#b8922a';
    ctx.beginPath(); ctx.moveTo(dX - 2 * S, dY); ctx.lineTo(dX + dW + 2 * S, dY); ctx.lineTo(dX + dW, dY - 2.4 * S); ctx.lineTo(dX, dY - 2.4 * S); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(dX - 2 * S, dY + dH - 1.4 * S, dW + 4 * S, 1.6 * S);
    // Status board beside the door, plus a wall conduit run up to the roof.
    ctx.fillStyle = '#10161a'; ctx.fillRect(cx + cw * 0.08, cy + ch * 0.76, cw * 0.24, ch * 0.16);
    ctx.fillStyle = active ? accent : (on ? '#ff9020' : '#3a4048');
    ctx.fillRect(cx + cw * 0.1, cy + ch * 0.79, cw * 0.2, ch * 0.03);
    ctx.fillStyle = on ? '#50e090' : '#2c3a34';
    ctx.fillRect(cx + cw * 0.1, cy + ch * 0.85, cw * 0.09, ch * 0.03);
    ctx.fillStyle = on ? '#e0c060' : '#3a3a30';
    ctx.fillRect(cx + cw * 0.21, cy + ch * 0.85, cw * 0.09, ch * 0.03);
    ctx.strokeStyle = 'rgba(20,24,28,0.7)'; ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.moveTo(cx + cw * 0.95, cy + ch * 0.95); ctx.lineTo(cx + cw * 0.95, cy + ch * 0.1); ctx.stroke();
  }

  // Radiation trefoil on the hot cells' roof.
  if (detail) {
    ctx.save();
    ctx.translate(X(0.51), Y(0.625)); ctx.globalAlpha = 0.5; ctx.fillStyle = '#d8bf3a';
    for (let q = 0; q < 3; q++) {
      const a0 = q * 2.094 - 0.52 - Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 0.3 * u, a0, a0 + 1.04); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // ── Port fittings ──
  // The same wall hardware the reactor and the other big plants use, drawn
  // last so no equipment covers them. Spent fuel shares the reactor's SPENT
  // FUEL OUT colour so the two ends of that belt match.
  if (aSpent) _portBelt(aSpent, S, t, { belt: '#d0e040', label: 'SPENT FUEL IN', on: !!e._hasSpentFuel, out: false });
  if (aWater) _portPipe(aWater, S, t, { fluid: '#40c0e0', label: 'WATER IN', on: !!e._waterConnected, out: false, flow: active });
  if (aPlut)  _portBelt(aPlut,  S, t, { belt: plutColor, label: 'PLUTONIUM OUT', on: !!e._plutoniumConveyorOut, moving: plutMoving, out: true });
  if (aRecov) _portBelt(aRecov, S, t, { belt: uColor,    label: 'RECOVERED U OUT', on: !!e._recoveredConveyorOut, moving: recovMoving, out: true });

  // ── Status plate ──
  // `_blockedBy` names the buffer that stopped the plant, so a jam reads as
  // a specific full tank rather than a generic "offline".
  const status = !on                ? 'OFFLINE'
               : e._blockedBy       ? e._blockedBy.toUpperCase() + ' FULL'
               : e._waitingOnCooling ? 'FUEL COOLING'
               : !e._hasSpentFuel   ? 'NO SPENT FUEL'
               : !e._waterConnected ? 'NO WATER'
               : active             ? 'REPROCESSING'
                                    : 'IDLE';
  const statusColor = status === 'REPROCESSING' ? accent
                    : e._blockedBy              ? '#ff3030'
                    : on                        ? '#ff9020'
                                                : '#8a7a50';
  _wfPlate(status, X(0.51), Y(0.02), S, statusColor, on);
  _wfLamp(px + w - 7 * S, py + 7 * S, S, t, accent, active);
  ctx.restore();
}
