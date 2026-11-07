/* ═══════════════════════════════════════════════════════════════════
   GRAPHITIZATION FURNACE ART — renderGraphiteFurnace (coke_oven_system.js)
   An Acheson furnace house on a 12×8 lot, read west to east:
     coke bunker and bucket elevator off the COAL IN belt
     → two long furnace troughs side by side, brick-walled and packed with
       coke under a pale cover of sand and coke breeze. They fire in turn,
       as real ones do (a batch heats for days, then cools for weeks): the
       firing trough's cover cracks open along a white-hot seam with small
       blue-and-orange carbon monoxide flames dancing over it; the other
       glows down through red to dark
     → a gantry crane working along both, and at their east end the
       electrodes and copper bus bars, pulses of current running down them
       from the transformer yard and its "kW" readout
     → the finishing bay, where graphite blocks stack up with the store and
       go down to GRAPHITE OUT
   Shared kit: render_rare_earth.js (_fcVTank, _fcHCyl, _fcBuilding,
   _fcDiamond), render_hydro_coal.js (_wf*), render_field_core.js
   (_fcPorts, _fcBeltAt — called at draw time).
   ═══════════════════════════════════════════════════════════════════ */

const _GF_ACCENT = '#fff0c0';

function renderGraphiteFurnace(e, px, py, t) {
  const def = EntityDefs[T.GRAPHITEFURNACE];
  const w = (e.width || def.width) * TILE, h = (e.height || def.height) * TILE;
  const on = !!e.powered, active = on && !!e._running;
  const grFill   = Math.min(1, (e._graphite  || 0) / (def.graphiteCapacity || 200));
  const packFill = Math.min(1, (e._cokeStock || 0) / (def.cokeCapacity     || 60));
  const S = (TILE / 40) * Math.max(1, Math.min(w / (8 * TILE), h / (7 * TILE)));
  const U = w / 12, V = h / 8;
  const X = c => px + c*U, Y = r => py + r*V;
  const detail = e._iconThumb || Camera.zoom > 0.45;
  ctx.save();
  ctx.lineJoin = 'round';

  // The two troughs take turns: one fires for half a 40 s cycle while the
  // other cools, with an easing overlap so neither ever snaps.
  const CYC = 40;
  const cyc = e._iconThumb ? 0.25 : (t / CYC) % 1;
  const fireA = active ? Math.max(0, Math.min(1, Math.sin(cyc*Math.PI*2) * 1.6 + 0.5)) : 0;
  const fireB = active ? Math.max(0, Math.min(1, -Math.sin(cyc*Math.PI*2) * 1.6 + 0.5)) : 0;
  const idleGlow = on ? 0.12 : 0;

  // ── Flows under the plant ──
  _wfConveyor(X(1.5), Y(7.3), X(1.5), Y(5.55), S, t, on && !!e._hasCoke, '#9ca0a6');            // coke up to the bunker
  _wfConveyor(X(9.5), Y(6.55), X(9.5), Y(7.3), S, t, on && grFill > 0, '#5a606a');              // finished blocks to GRAPHITE OUT

  // ── Coke bunker and bucket elevator (west) ──
  {
    const bx = X(0.35), by = Y(3.9), bw = X(2.55) - bx, bh = Y(5.6) - by;
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(bx + 5*S, by + 6*S, bw, bh);
    const g = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    g.addColorStop(0, '#9a968e'); g.addColorStop(1, '#5e5a54');
    ctx.fillStyle = g; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#22201c'; ctx.lineWidth = 1.1*S; ctx.strokeRect(bx, by, bw, bh);
    // the bin, open, showing the coke filling it
    const ix = bx + 4*S, iy = by + 4*S, iw = bw - 8*S, ih = bh - 8*S;
    ctx.fillStyle = '#121214'; ctx.fillRect(ix, iy, iw, ih);
    if (packFill > 0.02) {
      const cg = ctx.createRadialGradient(ix + iw*0.4, iy + ih*0.4, 1, ix + iw/2, iy + ih/2, Math.max(iw, ih)*0.6);
      cg.addColorStop(0, '#a8acb2'); cg.addColorStop(1, '#3a3c42');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.ellipse(ix + iw/2, iy + ih/2, iw*0.46*Math.sqrt(packFill), ih*0.44*Math.sqrt(packFill), 0, 0, Math.PI*2); ctx.fill();
    }
    // bucket elevator up to the trough feed
    const ex = X(1.5);
    ctx.fillStyle = '#5a5e64'; ctx.fillRect(ex - 4*S, Y(0.8), 8*S, by - Y(0.8));
    ctx.strokeStyle = '#26282c'; ctx.lineWidth = 0.8*S; ctx.strokeRect(ex - 4*S, Y(0.8), 8*S, by - Y(0.8));
    if (detail) {
      const step = 5*S, off = active ? (t*12*S) % step : 0;
      ctx.fillStyle = '#c89a30';
      for (let y = Y(0.8) + off; y < by; y += step) ctx.fillRect(ex - 2.6*S, y, 5.2*S, 1.4*S);
    }
    ctx.fillStyle = '#3a3e44'; ctx.fillRect(ex - 6*S, Y(0.55), 12*S, 6*S);                      // head pulley
    ctx.fillStyle = '#2a5a8a'; ctx.fillRect(ex + 6*S, Y(0.55) + 1*S, 5*S, 4*S);                  // drive
    // feed chute along the north to both troughs
    _wfPipe([[ex + 6*S, Y(0.7)], [X(3.0), Y(0.7)], [X(3.0), Y(1.2)]], S, t, active, '#9ca0a6');
    _wfPipe([[X(2.75), Y(0.7)], [X(2.75), Y(3.2)]], S, t, active, '#9ca0a6');
  }

  // ── The two furnace troughs ──
  const tx0 = X(3.0), tx1 = X(9.9);
  const trough = (ty, th, fire, label) => {
    const glow = Math.max(idleGlow, fire);
    // shadow and brick walls
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(tx0 + 6*S, ty + 7*S, tx1 - tx0, th);
    const wg = ctx.createLinearGradient(0, ty, 0, ty + th);
    wg.addColorStop(0, '#8a4a34'); wg.addColorStop(1, '#4a2418');
    ctx.fillStyle = wg; ctx.fillRect(tx0, ty, tx1 - tx0, th);
    if (detail) {
      ctx.strokeStyle = 'rgba(30,12,6,0.45)'; ctx.lineWidth = 0.5*S;
      for (let yy = ty + 2.5*S; yy < ty + th; yy += 2.5*S) { ctx.beginPath(); ctx.moveTo(tx0, yy); ctx.lineTo(tx1, yy); ctx.stroke(); }
      for (let xx = tx0 + 5*S; xx < tx1; xx += 5*S) { ctx.beginPath(); ctx.moveTo(xx, ty); ctx.lineTo(xx, ty + 3*S); ctx.moveTo(xx, ty + th - 3*S); ctx.lineTo(xx, ty + th); ctx.stroke(); }
    }
    // the cover: pale sand and coke breeze, heaped along the middle
    const ci = 4*S, cx0 = tx0 + ci, cx1 = tx1 - ci, cy0 = ty + ci, cy1 = ty + th - ci;
    const cg = ctx.createLinearGradient(0, cy0, 0, cy1);
    cg.addColorStop(0, '#d4cab4'); cg.addColorStop(0.5, '#b8ac94'); cg.addColorStop(1, '#8e8470');
    ctx.fillStyle = cg; ctx.fillRect(cx0, cy0, cx1 - cx0, cy1 - cy0);
    // heat: the whole cover scorches dark at the middle and glows warm as it fires
    if (glow > 0.05) {
      const sc = ctx.createLinearGradient(0, cy0, 0, cy1);
      sc.addColorStop(0, `rgba(255,120,40,${(0.18*glow).toFixed(3)})`); sc.addColorStop(0.5, `rgba(70,28,14,${(0.55*glow).toFixed(3)})`); sc.addColorStop(1, `rgba(255,120,40,${(0.18*glow).toFixed(3)})`);
      ctx.fillStyle = sc; ctx.fillRect(cx0, cy0, cx1 - cx0, cy1 - cy0);
    }
    // the seam: where the cover has cracked over the hot core. Jagged and
    // irregular (a hash per step, not a wave), with short branch cracks.
    const my = (cy0 + cy1)/2;
    const salt = label === 'A' ? 11 : 37;
    const hsh = (i) => { const v = Math.sin((i + salt)*12.9898)*43758.5453; return v - Math.floor(v); };
    const pts = [];
    for (let x = cx0 + 3*S, i = 0; x <= cx1 - 3*S; x += 3.2*S, i++) pts.push([x, my + (hsh(i) - 0.5)*th*0.22]);
    if (glow > 0.02) {
      const hot = glow;
      // bloom along the seam
      const bl = ctx.createLinearGradient(0, my - th*0.48, 0, my + th*0.48);
      bl.addColorStop(0, 'rgba(255,120,30,0)'); bl.addColorStop(0.5, `rgba(255,${(140 + 90*hot) | 0},${(50 + 120*hot) | 0},${(0.7*hot).toFixed(3)})`); bl.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = bl; ctx.fillRect(cx0, my - th*0.48, cx1 - cx0, th*0.96);
      const crack = (lw, col) => {
        ctx.strokeStyle = col; ctx.lineWidth = lw;
        ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        // branches off every few steps
        for (let i = 2; i < pts.length; i += 5) {
          const [x, y] = pts[i], d = hsh(i + 99) > 0.5 ? 1 : -1;
          ctx.moveTo(x, y); ctx.lineTo(x + 3*S, y + d*th*0.2); ctx.lineTo(x + 5*S, y + d*th*0.28);
        }
        ctx.stroke();
      };
      crack((2.4 + 2.4*hot)*S, `rgba(255,${(110 + 60*hot) | 0},30,${(0.55*hot).toFixed(3)})`);
      crack((0.9 + 1.2*hot)*S, `rgba(255,${(215 + 40*hot) | 0},${(140 + 110*hot) | 0},${Math.min(1, 0.45 + 0.55*hot).toFixed(3)})`);
      // vents where the cover has fallen in: white-hot windows onto the core
      for (let v = 0; v < 5; v++) {
        const [vx, vy] = pts[Math.floor((v + 0.5) / 5 * pts.length)];
        const pulse = 0.75 + 0.25*Math.sin(t*2.3 + v*1.9);
        const vr = (2.4 + 2.2*hot)*S;
        const vg = ctx.createRadialGradient(vx, vy, 0, vx, vy, vr*2.4);
        vg.addColorStop(0, `rgba(255,252,230,${(0.95*hot*pulse).toFixed(3)})`); vg.addColorStop(0.35, `rgba(255,200,90,${(0.7*hot*pulse).toFixed(3)})`); vg.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = vg; ctx.beginPath(); ctx.ellipse(vx, vy, vr*2.4, vr*1.6, 0, 0, Math.PI*2); ctx.fill();
      }
      // CO flames: little blue tongues, tipped orange, dancing on the cover
      if (detail && hot > 0.35) {
        for (let f = 0; f < 11; f++) {
          const fx = cx0 + (cx1 - cx0)*((f + 0.5) / 11) + Math.sin(t*1.3 + f*4.1)*2*S;
          const life = (t*1.1 + f*0.37) % 1;
          const fh = (3 + 4*Math.sin(life*Math.PI))*S*hot;
          const fy = pts[Math.min(pts.length - 1, Math.floor((f + 0.5) / 11 * pts.length))][1];
          ctx.fillStyle = `rgba(110,160,255,${(0.65*hot*Math.sin(life*Math.PI)).toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(fx - 1.4*S, fy); ctx.quadraticCurveTo(fx - 1.6*S, fy - fh*0.6, fx + Math.sin(t*6 + f)*1*S, fy - fh); ctx.quadraticCurveTo(fx + 1.6*S, fy - fh*0.5, fx + 1.4*S, fy); ctx.closePath(); ctx.fill();
          ctx.fillStyle = `rgba(255,170,70,${(0.6*hot*Math.sin(life*Math.PI)).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(fx + Math.sin(t*6 + f)*1*S, fy - fh*0.92, 0.9*S, 0, Math.PI*2); ctx.fill();
        }
      }
      // heat shimmer rising
      if (detail && hot > 0.5) _wfSmoke((cx0 + cx1)/2 + Math.sin(t*0.3)*20*S, my - 2*S, S*0.7, t*0.8, '255,226,190', true, 0.12*hot);
    }
    // the end walls the electrodes come through
    for (const ex of [tx0 - 3*S, tx1 - 3*S]) {
      ctx.fillStyle = '#3a2a24'; ctx.fillRect(ex, ty - 2*S, 6*S, th + 4*S);
      ctx.strokeStyle = '#140c08'; ctx.lineWidth = 0.8*S; ctx.strokeRect(ex, ty - 2*S, 6*S, th + 4*S);
    }
    // electrode heads at the east end: three graphite stubs in copper clamps
    for (let k = 0; k < 3; k++) {
      const ey = ty + th*(0.25 + k*0.25);
      ctx.fillStyle = '#26282e'; ctx.fillRect(tx1 + 3*S, ey - 2.2*S, 7*S, 4.4*S);
      ctx.fillStyle = '#c8783a'; ctx.fillRect(tx1 + 6*S, ey - 3*S, 3*S, 6*S);
      ctx.fillStyle = 'rgba(255,220,180,0.4)'; ctx.fillRect(tx1 + 6*S, ey - 3*S, 3*S, 1*S);
      if (fire > 0.5 && detail && Math.sin(t*23 + k*5 + (label === 'A' ? 0 : 3)) > 0.93) {    // a crackle at the clamp
        ctx.strokeStyle = 'rgba(200,230,255,0.9)'; ctx.lineWidth = 0.7*S;
        ctx.beginPath(); ctx.moveTo(tx1 + 3*S, ey); ctx.lineTo(tx1 + 1*S, ey - 2*S); ctx.lineTo(tx1 - 1*S, ey + 1*S); ctx.stroke();
      }
    }
    if (detail) {
      ctx.font = `bold ${Math.max(5, 5*S)}px Courier New`;
      ctx.fillStyle = fire > 0.5 ? '#fff0c0' : on ? '#b0a090' : '#5a5048';
      ctx.fillText(`${label} ${fire > 0.5 ? 'FIRING' : glow > 0.2 ? 'COOLING' : 'LOADED'}`, tx0 + 3*S, ty - 3*S);
    }
  };
  trough(Y(1.25), Y(2.55) - Y(1.25), fireA, 'A');
  trough(Y(3.25), Y(4.55) - Y(3.25), fireB, 'B');

  // ── Transformer yard and bus bars (east) ──
  {
    const yx = X(10.55), yy = Y(0.45), yw = X(11.85) - yx, yh = Y(4.9) - yy;
    ctx.fillStyle = 'rgba(70,70,64,0.5)'; ctx.fillRect(yx, yy, yw, yh);
    ctx.strokeStyle = '#d8b030'; ctx.lineWidth = 0.8*S; ctx.setLineDash([3*S, 2*S]); ctx.strokeRect(yx, yy, yw, yh); ctx.setLineDash([]);
    for (const [ty, fire] of [[Y(1.0), fireA], [Y(3.0), fireB]]) {
      const bx = yx + 3*S, bw = yw - 6*S, bh = V*1.25;
      ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(bx + 4*S, ty + 5*S, bw, bh);
      const g = ctx.createLinearGradient(bx, ty, bx + bw, ty + bh);
      g.addColorStop(0, '#7a8a7c'); g.addColorStop(1, '#3e4a40');
      ctx.fillStyle = g; ctx.fillRect(bx, ty, bw, bh);
      ctx.strokeStyle = '#1a201a'; ctx.lineWidth = 1*S; ctx.strokeRect(bx, ty, bw, bh);
      // radiator fins
      ctx.strokeStyle = 'rgba(20,26,20,0.6)'; ctx.lineWidth = 0.8*S;
      for (let fx = bx + 3*S; fx < bx + bw - 2*S; fx += 2.5*S) { ctx.beginPath(); ctx.moveTo(fx, ty + bh*0.55); ctx.lineTo(fx, ty + bh - 2*S); ctx.stroke(); }
      // bushings
      for (let k = 0; k < 3; k++) {
        const kx = bx + bw*(0.25 + k*0.25), ky = ty + bh*0.28;
        ctx.fillStyle = '#d8d4c8'; ctx.beginPath(); ctx.arc(kx, ky, 2.2*S, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#7a3a20'; ctx.beginPath(); ctx.arc(kx, ky, 1*S, 0, Math.PI*2); ctx.fill();
      }
      // the hum: a faint blue ripple while its trough fires
      if (fire > 0.3) {
        const hg = ctx.createRadialGradient(bx + bw/2, ty + bh/2, 0, bx + bw/2, ty + bh/2, bw*0.9);
        hg.addColorStop(0, `rgba(140,200,255,${(0.18*fire*(0.7 + 0.3*Math.sin(t*50))).toFixed(3)})`); hg.addColorStop(1, 'rgba(140,200,255,0)');
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(bx + bw/2, ty + bh/2, bw*0.9, 0, Math.PI*2); ctx.fill();
      }
    }
    // copper bus bars from each transformer into its trough's electrodes,
    // with pulses of current running down them
    const bus = (yFrom, yTo, fire) => {
      const pts = [[yx + 2*S, yFrom], [tx1 + 14*S, yFrom], [tx1 + 14*S, yTo], [tx1 + 9*S, yTo]];
      ctx.lineCap = 'butt';
      ctx.strokeStyle = '#4a2a14'; ctx.lineWidth = 4.6*S;
      ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
      ctx.strokeStyle = '#d0843e'; ctx.lineWidth = 3*S; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,220,170,0.6)'; ctx.lineWidth = 0.8*S; ctx.stroke();
      if (fire > 0.2) {
        ctx.strokeStyle = `rgba(190,230,255,${(0.9*fire).toFixed(3)})`; ctx.lineWidth = 1.6*S;
        ctx.setLineDash([2*S, 9*S]); ctx.lineDashOffset = -t*40*S; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }
    };
    bus(Y(1.6), Y(1.9), fireA);
    bus(Y(3.6), Y(3.9), fireB);
    // the readout: what the furnace is pulling off your grid right now
    const rx = yx + 2*S, ry = Y(4.95), rw = yw - 4*S, rh = 9*S;
    ctx.fillStyle = '#060a08'; ctx.strokeStyle = '#2a4a3a'; ctx.lineWidth = 0.8*S;
    ctx.beginPath(); ctx.roundRect(rx, ry, rw, rh, 1.5*S); ctx.fill(); ctx.stroke();
    ctx.font = `bold ${Math.max(5, 5.4*S)}px Courier New`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const kw = on ? Math.round((def.powerInput || 120) * (active ? 0.97 + 0.03*Math.sin(t*3.1) : 0.12)) : 0;
    ctx.fillStyle = active ? '#ffcf60' : on ? '#60c090' : '#3a4a40';
    ctx.fillText(`${kw} kW`, rx + rw/2, ry + rh/2 + 0.3*S);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // ── Gantry crane spanning both troughs ──
  {
    const span0 = Y(0.95), span1 = Y(4.85);
    const gx = tx0 + 10*S + (tx1 - tx0 - 26*S)*(0.5 + 0.5*Math.sin(active ? t*0.13 : 0.7));
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(gx + 5*S, span0 + 6*S, 9*S, span1 - span0);
    ctx.fillStyle = '#d8a020'; ctx.fillRect(gx, span0, 9*S, span1 - span0);
    ctx.strokeStyle = '#4a3408'; ctx.lineWidth = 0.8*S; ctx.strokeRect(gx, span0, 9*S, span1 - span0);
    if (detail) {
      ctx.strokeStyle = 'rgba(80,56,10,0.6)'; ctx.lineWidth = 0.6*S;
      for (let y = span0 + 3*S; y < span1; y += 5*S) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + 9*S, y + 3*S); ctx.stroke(); }
    }
    // trolley and grab, working over whichever trough is loading
    const ty = fireA > fireB ? Y(3.9) : Y(1.9);
    ctx.fillStyle = '#3a3e44'; ctx.fillRect(gx - 2*S, ty - 4*S, 13*S, 8*S);
    ctx.fillStyle = '#5a5e64'; ctx.beginPath(); ctx.arc(gx + 4.5*S, ty, 2.6*S, 0, Math.PI*2); ctx.fill();
    for (const ry of [span0, span1]) { ctx.fillStyle = '#2a2c30'; ctx.fillRect(gx - 3*S, ry - 2*S, 15*S, 4*S); }
  }

  // ── Finishing bay: blocks stacking with the store ──
  {
    const fx = X(5.6), fy = Y(5.25), fw = X(10.3) - fx, fh = Y(6.55) - fy;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(fx + 4*S, fy + 5*S, fw, fh);
    ctx.fillStyle = '#6a6e74'; ctx.fillRect(fx, fy, fw, fh);
    ctx.fillStyle = '#585c62'; ctx.fillRect(fx + 3*S, fy + 3*S, fw - 6*S, fh - 6*S);
    ctx.strokeStyle = '#1a1c20'; ctx.lineWidth = 1*S; ctx.strokeRect(fx, fy, fw, fh);
    const cols = 12, rows = 2, lit = Math.round(grFill*cols*rows);
    const cw = (fw - 8*S)/cols, ch = (fh - 8*S)/rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const idx = r*cols + c;
      const bx = fx + 4*S + cw*(c + 0.5) + (r % 2 ? cw*0.25 : 0), by = fy + 4*S + ch*(r + 0.5), br = Math.min(cw, ch)*0.44;
      const hex = () => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i*Math.PI/3; const x = bx + Math.cos(a)*br, y = by + Math.sin(a)*br; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); };
      if (idx < lit) {
        const g = ctx.createLinearGradient(bx - br, by - br, bx + br, by + br);
        g.addColorStop(0, '#a0a6b0'); g.addColorStop(0.4, '#3a3e46'); g.addColorStop(1, '#141518');
        ctx.fillStyle = g; hex(); ctx.fill();
        ctx.fillStyle = '#060607'; ctx.beginPath(); ctx.arc(bx, by, br*0.25, 0, Math.PI*2); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(30,32,36,0.35)'; hex(); ctx.fill();
        ctx.strokeStyle = 'rgba(150,154,162,0.45)'; ctx.lineWidth = 0.6*S; hex(); ctx.stroke();
      }
    }
    // a glint running along the stack
    if (detail && lit > 0) {
      const gx = fx + ((t*0.25) % 1.4)*fw;
      const gl = ctx.createLinearGradient(gx - 6*S, 0, gx + 6*S, 0);
      gl.addColorStop(0, 'rgba(230,236,248,0)'); gl.addColorStop(0.5, 'rgba(230,236,248,0.25)'); gl.addColorStop(1, 'rgba(230,236,248,0)');
      ctx.fillStyle = gl; ctx.fillRect(Math.max(fx, gx - 6*S), fy + 2*S, Math.min(12*S, fx + fw - Math.max(fx, gx - 6*S)), fh - 4*S);
    }
    if (detail) {
      ctx.font = `bold ${Math.max(5, 5*S)}px Courier New`; ctx.textAlign = 'center';
      ctx.fillStyle = on ? '#d8e0ee' : '#5a6068';
      ctx.fillText(`GRAPHITE ${Math.round(grFill*100)}%`, fx + fw/2, fy - 3*S);
      ctx.textAlign = 'left';
    }
  }

  // ── Control room and dust stack ──
  _fcBuilding(X(2.75), Y(5.25), X(5.25) - X(2.75), Y(6.6) - Y(5.25), S, t,
    { lit: on, roof0: '#c4c8cc', roof1: '#8a9096', wall: '#5a5e64', units: [[0.3, 0.45], [0.72, 0.45]], spin: on });
  {
    const sx = X(10.95), sy = Y(5.75), sr = Math.min(U, V)*0.32;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(sx + 8*S, sy + 9*S, sr, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#c8c4bc'; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#2a2a28'; ctx.lineWidth = 2*S; ctx.beginPath(); ctx.arc(sx, sy, sr*0.75, 0, Math.PI*2); ctx.stroke();
    if (e._scrubber) {
      // Capped: the flue is ducted round to an absorber tower below the
      // stack, which vents clean vapour instead of the dust plume.
      const scX = X(11.1), scR = 12*S, scTop = Y(6.4), scBase = Y(7.75), dY = Y(6.8), dX = X(11.72);
      ctx.fillStyle = '#2e4e44'; ctx.beginPath(); ctx.arc(sx, sy, sr*0.5, 0, Math.PI*2); ctx.fill();
      _scrubberDuct([[sx + sr*0.5, sy], [dX, sy], [dX, dY], [scX + scR, dY]], S, t, active);
      _scrubberTower(scX, scTop, scBase, scR, S, t, active, -1);
      if (active && detail) _scrubberVapour(scX, scTop - 4*S, S, t, 4, 0.8);
    } else {
      ctx.fillStyle = '#141414'; ctx.beginPath(); ctx.arc(sx, sy, sr*0.5, 0, Math.PI*2); ctx.fill();
      _wfSmoke(sx, sy, S*0.85, t, '120,116,110', active, 0.28);
    }
  }

  // ── Stubs (bottom face): COKE IN belt col+1, GRAPHITE OUT belt col+9 —
  // tile-anchored to GraphiteFurnaceSystem.getStubs.
  const TH = TILE/2;
  const Pp = _fcPorts(px, py, h, S, t);
  const st = typeof GraphiteFurnaceSystem !== 'undefined' && e.col !== undefined ? GraphiteFurnaceSystem.getStubs(e) : null;
  Pp.belt(px + TILE*1 + TH, 'COKE IN', !!e._hasCoke, true, active, '#a8acb2', '#c8ccd2');
  Pp.belt(px + TILE*9 + TH, 'GRAPHITE OUT', st ? _fcBeltAt(st.graphiteOut) : false, false, on && grFill > 0, '#4a4e58', '#d8e0ee');

  _wfPlate('GRAPHITIZATION FURNACE', px + w*0.48, py + h*0.04, S, _GF_ACCENT, on);
  _wfLamp(X(0.55), py + 9*S, S, t, active ? '#ffcf60' : _GF_ACCENT, on);
  ctx.restore();
}
