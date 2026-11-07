/* ═══════════════════════════════════════════════════════════════════
   GEOTHERMAL CHAIN RENDERERS
   Deposit → Well → Turbine. All three share a hot orange / steam-white
   palette so the chain reads as one system from across the map.
   ═══════════════════════════════════════════════════════════════════ */

function renderGeoDeposit(e, px, py, t) {
    // Geothermal Deposit — a hot spring. Terraced silica sinter apron,
    // bands of heat-loving microbial mat (rust → amber → olive) stepping in
    // to a turquoise pool with a deep blue boiling throat, runoff channels
    // spilling over the apron, and sulphur-crusted fumaroles venting steam.
    // Soft-edged throughout so it sits in the barren ground patch rather
    // than on it. Once a well caps it (_hasWell) the pool is drained to a
    // dry mineral basin.
    const ew = e.width  || 2;
    const eh = e.height || 2;
    const w  = ew * TILE;
    const h  = eh * TILE;
    const cx = px + w / 2, cy = py + h / 2;
    const phase = e._geoPhase || 0;
    const lod = Camera.zoom > 0.5;   // fine detail only when it can actually be seen
    const capped = !!e._hasWell;
    const Z = TILE / 40;

    // Stable per-deposit rng
    const S = (n) => { const x = Math.sin(e.col * 127.1 + e.row * 311.7 + n * 74.3) * 43758.5453; return x - Math.floor(x); };

    ctx.save();

    const RX = w * 0.42, RY = h * 0.42;
    const NV = 22;
    const jA = [], jB = [];
    for (let i = 0; i < NV; i++) { jA.push(0.82 + S(i * 3.7) * 0.30); jB.push(0.88 + S(i * 5.9 + 40) * 0.22); }
    // Smooth noisy ring; `mix` blends two noise sets so each band has its
    // own wobble but still follows the same overall shape.
    const ring = (scale, mix, ox = 0, oy = 0) => {
      const pts = [];
      for (let i = 0; i < NV; i++) {
        const a = (i / NV) * Math.PI * 2;
        const j = jA[i] * (1 - mix) + jB[i] * mix;
        pts.push([cx + ox + Math.cos(a) * RX * j * scale, cy + oy + Math.sin(a) * RY * j * scale]);
      }
      ctx.beginPath();
      const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const m0 = mid(pts[NV - 1], pts[0]);
      ctx.moveTo(m0[0], m0[1]);
      for (let i = 0; i < NV; i++) {
        const m = mid(pts[i], pts[(i + 1) % NV]);
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
      }
      ctx.closePath();
    };

    // ── Warm damp ground halo ──
    if (Camera.zoom > 0.35) {
      const sg = ctx.createRadialGradient(cx, cy, Math.max(RX, RY) * 0.6, cx, cy, Math.max(w, h) * 0.7);
      sg.addColorStop(0,   'rgba(58,44,32,0.55)');
      sg.addColorStop(0.6, 'rgba(70,54,38,0.22)');
      sg.addColorStop(1,   'rgba(70,54,38,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.7, h * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    }

    // ── Runoff channels spilling off the apron ──
    if (lod) {
      const nRun = 3;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 0; i < nRun; i++) {
        const a0 = S(i * 13 + 200) * Math.PI * 2;
        const pts = [];
        let a = a0;
        for (let k = 0; k <= 8; k++) {
          const rr = 0.75 + k * 0.1;
          a += (S(i * 13 + k + 210) - 0.5) * 0.35;
          pts.push([cx + Math.cos(a) * RX * rr, cy + Math.sin(a) * RY * rr]);
        }
        for (const [lw, col] of [[9, 'rgba(140,84,44,0.12)'], [4.5, 'rgba(176,108,52,0.20)'], [1.2, capped ? 'rgba(110,92,74,0.25)' : 'rgba(120,180,190,0.30)']]) {
          ctx.strokeStyle = col; ctx.lineWidth = lw * Z;
          ctx.beginPath(); pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
        }
      }
    }

    // ── Sinter apron: stepped terraces of pale silica ──
    ring(1.18, 0.3, 1.5 * Z, 2 * Z); ctx.fillStyle = 'rgba(40,30,22,0.35)'; ctx.fill();    // drop shadow
    ring(1.18, 0.3);
    let g = ctx.createRadialGradient(cx - RX * 0.3, cy - RY * 0.3, 0, cx, cy, RX * 1.25);
    g.addColorStop(0, '#d8d0bc'); g.addColorStop(0.7, '#bfb49a'); g.addColorStop(1, '#a39880');
    ctx.fillStyle = g; ctx.fill();
    for (const [sc, mx] of [[1.08, 0.6], [0.98, 0.1]]) {
      ring(sc, mx);
      ctx.strokeStyle = 'rgba(120,108,88,0.55)'; ctx.lineWidth = 1.4 * Z; ctx.stroke();
      ring(sc, mx, -0.8 * Z, -0.8 * Z);
      ctx.strokeStyle = 'rgba(246,240,226,0.5)'; ctx.lineWidth = 0.8 * Z; ctx.stroke();
    }
    // Sinter texture — scalloped rimstone flecks
    if (lod) {
      for (let i = 0; i < 26; i++) {
        const a = S(i * 7.1 + 300) * Math.PI * 2;
        const rr = 0.86 + S(i * 7.1 + 301) * 0.28;
        const x = cx + Math.cos(a) * RX * rr, y = cy + Math.sin(a) * RY * rr;
        ctx.strokeStyle = S(i * 7.1 + 302) > 0.5 ? 'rgba(250,246,234,0.5)' : 'rgba(110,98,80,0.4)';
        ctx.lineWidth = 0.8 * Z;
        ctx.beginPath(); ctx.arc(x, y, (1.5 + S(i * 7.1 + 303) * 2) * Z, a - 1, a + 1); ctx.stroke();
      }
    }

    // ── Microbial mat bands stepping in to the pool ──
    const BANDS = capped
      ? [[0.86, 0.5, '#9a8a70'], [0.70, 0.2, '#86765e'], [0.54, 0.7, '#6e604e'], [0.38, 0.4, '#564a3c']]
      : [[0.88, 0.5, '#a8582a'], [0.78, 0.2, '#c98a36'], [0.68, 0.7, '#cdb048'], [0.60, 0.4, '#8fa35a']];
    for (const [sc, mx, col] of BANDS) {
      ring(sc, mx); ctx.fillStyle = col; ctx.fill();
    }
    // Streaks of mat radiating out through the bands
    if (lod && !capped) {
      ctx.save();
      ring(0.9, 0.5); ctx.clip();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + S(i + 500) * 0.3;
        ctx.strokeStyle = S(i + 520) > 0.5 ? 'rgba(120,50,20,0.35)' : 'rgba(240,200,90,0.25)';
        ctx.lineWidth = (1 + S(i + 540) * 2) * Z;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * RX * 0.5, cy + Math.sin(a) * RY * 0.5);
        ctx.lineTo(cx + Math.cos(a + 0.08) * RX * 0.95, cy + Math.sin(a + 0.08) * RY * 0.95);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (!capped) {
      // ── Pool: turquoise shallows to a deep blue throat ──
      ring(0.52, 0.3);
      g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(RX, RY) * 0.52);
      g.addColorStop(0,    '#0a3e72');
      g.addColorStop(0.35, '#1666a8');
      g.addColorStop(0.7,  '#2aa6c6');
      g.addColorStop(1,    '#5cc8c0');
      ctx.fillStyle = g; ctx.fill();
      // Pale shallow lip
      ring(0.52, 0.3);
      ctx.strokeStyle = 'rgba(200,240,230,0.55)'; ctx.lineWidth = 1.3 * Z; ctx.stroke();

      if (lod) {
        ctx.save();
        ring(0.5, 0.3); ctx.clip();
        // Slow expanding ripples from the throat
        for (let k = 0; k < 3; k++) {
          const p = (t * 0.25 + k / 3 + phase * 0.1) % 1;
          ctx.strokeStyle = `rgba(210,245,255,${0.28 * (1 - p)})`;
          ctx.lineWidth = 1 * Z;
          ctx.beginPath(); ctx.ellipse(cx, cy, RX * 0.5 * p, RY * 0.5 * p, 0, 0, Math.PI * 2); ctx.stroke();
        }
        // Sky glint drifting across the surface
        const gx = cx - RX * 0.2 + Math.sin(t * 0.4 + phase) * RX * 0.06;
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.beginPath(); ctx.ellipse(gx, cy - RY * 0.22, RX * 0.2, RY * 0.06, -0.3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // Boiling at the throat
        for (let i = 0; i < 6; i++) {
          const bp = ((t * 1.1 + i / 6 + phase) % 1);
          const ba = S(i * 23) * Math.PI * 2;
          const br = RX * 0.14 * S(i * 23 + 1);
          ctx.strokeStyle = `rgba(230,250,255,${0.55 * (1 - bp)})`;
          ctx.lineWidth = 0.8 * Z;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(ba) * br, cy + Math.sin(ba) * br, (0.6 + bp * 2.4) * Z, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // Low mist hanging over the water
      const mist = 0.5 + 0.5 * Math.sin(t * 0.6 + phase);
      g = ctx.createRadialGradient(cx, cy, 0, cx, cy, RX * 0.8);
      g.addColorStop(0, `rgba(240,246,248,${0.22 + mist * 0.1})`);
      g.addColorStop(1, 'rgba(240,246,248,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(cx, cy, RX * 0.8, RY * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      // Drained basin — dry cracked mineral floor
      ring(0.38, 0.4); ctx.fillStyle = '#4a4036'; ctx.fill();
      ctx.strokeStyle = 'rgba(30,24,18,0.5)'; ctx.lineWidth = 0.8 * Z;
      for (let i = 0; i < 6; i++) {
        const a = S(i * 31) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * RX * 0.2, cy + Math.sin(a) * RY * 0.2);
        ctx.lineTo(cx + Math.cos(a + 0.4) * RX * 0.34, cy + Math.sin(a + 0.4) * RY * 0.34);
        ctx.stroke();
      }
    }

    // ── Loose rock on the apron ──
    if (lod) {
      for (let i = 0; i < 7 + ew + eh; i++) {
        const a  = S(i * 5.1) * Math.PI * 2;
        const rr = 1.0 + S(i * 5.1 + 1) * 0.3;
        const bx = cx + Math.cos(a) * RX * rr;
        const by = cy + Math.sin(a) * RY * rr;
        const sz = (1.4 + S(i * 5.1 + 2) * 2.4) * Z;
        const shape = (dx, dy) => {
          ctx.beginPath();
          ctx.moveTo(bx - sz + dx, by + dy);
          ctx.lineTo(bx - sz * 0.3 + dx, by - sz * 0.8 + dy);
          ctx.lineTo(bx + sz * 0.9 + dx, by - sz * 0.2 + dy);
          ctx.lineTo(bx + sz * 0.4 + dx, by + sz * 0.7 + dy);
          ctx.closePath();
        };
        shape(sz * 0.3, sz * 0.35); ctx.fillStyle = 'rgba(20,14,10,0.35)'; ctx.fill();
        shape(0, 0); ctx.fillStyle = S(i * 5.1 + 3) > 0.5 ? '#7a6e60' : '#564c42'; ctx.fill();
        ctx.fillStyle = 'rgba(255,245,230,0.25)';
        ctx.beginPath(); ctx.moveTo(bx - sz, by); ctx.lineTo(bx - sz * 0.3, by - sz * 0.8); ctx.lineTo(bx, by - sz * 0.1); ctx.closePath(); ctx.fill();
      }
    }

    // ── Steam ─────────────────────────────────────────────────────
    const drift = Math.sin(t * 0.35 + phase) * 0.6 + 0.35;
    const puff = (bx, by, prog, scale, alpha) => {
      const rise = prog * h * 0.62;
      const sx = bx + drift * rise * 0.55 + Math.sin(prog * 3.2 + bx) * 2.4 * Z;
      const sy = by - rise;
      const rad = scale * (2.2 + prog * 9.5) * Z;
      const a   = alpha * (1 - prog) * (prog < 0.12 ? prog / 0.12 : 1);   // fade in, then out
      ctx.fillStyle = `rgba(232,236,238,${a * 0.55})`;
      ctx.beginPath(); ctx.arc(sx, sy, rad, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${a * 0.35})`;
      ctx.beginPath(); ctx.arc(sx - rad * 0.25, sy + rad * 0.15, rad * 0.55, 0, Math.PI * 2); ctx.fill();
    };

    // Fumaroles on the apron, ringed with sulphur crust
    const vents = Math.max(2, Math.floor((ew * eh) / 2));
    for (let i = 0; i < vents; i++) {
      const a  = S(i * 19) * Math.PI * 2;
      const rr = 0.95 + S(i * 19 + 1) * 0.12;
      const vx = cx + Math.cos(a) * RX * rr;
      const vy = cy + Math.sin(a) * RY * rr;
      g = ctx.createRadialGradient(vx, vy, 0, vx, vy, 5 * Z);
      g.addColorStop(0, 'rgba(226,200,90,0.6)'); g.addColorStop(0.6, 'rgba(206,178,80,0.3)'); g.addColorStop(1, 'rgba(200,170,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(vx, vy, 5 * Z, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(30,22,16,0.8)';
      ctx.beginPath(); ctx.ellipse(vx, vy, 1.4 * Z, 1 * Z, a, 0, Math.PI * 2); ctx.fill();
      const nP = lod ? 4 : 2;
      for (let k = 0; k < nP; k++) puff(vx, vy, ((t * 0.26 + i * 0.31 + k / nP) % 1), 0.75, capped ? 0.3 : 0.55);
    }

    // Main column off the pool
    if (!capped) {
      const nMain = lod ? 9 : 4;
      for (let k = 0; k < nMain; k++) {
        puff(cx, cy, ((t * 0.20 + k / nMain + phase * 0.1) % 1), 1.45, 0.72);
      }
    }

    ctx.restore();
  }

function renderGeoWell(e, px, py, t) {
    // Geothermal Well (3×3): valve "christmas tree" wellhead with handwheels
    // and a gauge, sitting over the centre of the deposit it taps (the well
    // anchors on the deposit's top-left, and deposits are smaller than 3×3),
    // an L-shaped insulated spur to the rotated steam output port (the tile a
    // turbine has to cover), and a silencer stack venting a plume. No backdrop.
    const w   = (e.width  || 3) * TILE;
    // Drawn from visualHeight, NOT e.height: the footprint is 3×2 but the
    // artwork is three tiles tall, and every offset below (silencer, port
    // flange, centre) is derived from h. Reading the footprint here would
    // squash the whole sprite upward.
    const h   = (EntityDefs[T.GEOWELL].visualHeight || e.height || 3) * TILE;
    const cx  = px + w / 2, cy = py + h / 2;
    const on  = e.powered;
    const flowing = !!e._flowing;
    const rot = e._rotation || 0;
    const S   = TILE / 40;
    ctx.save();

    // ── Port geometry (must match GeothermalSystem.wellOutputPort) ──
    // South sits on the row under the footprint, not under the taller
    // artwork, unless this is an older well whose turbine is on that tile.
    const hFoot = (e.height || EntityDefs[T.GEOWELL].height || 2) * TILE;
    const half = TILE * 0.5;
    let portX = cx, portY = cy, horiz = false;
    if      (rot === 0) { portX = cx;            portY = py - half;     }
    else if (rot === 1) { portX = px + w + half; portY = cy; horiz = true; }
    else if (rot === 2) { portX = cx;            portY = py + (e._southPortLow ? h : hFoot) + half; }
    else                { portX = px - half;     portY = cy; horiz = true; }

    // ── The deposit this well taps ──
    // The well anchors on the deposit's top-left, so the deposit occupies the
    // well's top-left dw×dh tiles. Centre the wellhead there, and redraw the
    // crater underneath once the well has taken over its tiles (otherwise the
    // deposit simply vanishes from under the building).
    const dw = e._depositWidth || 2, dh = e._depositHeight || 2;
    const hx = px + dw*TILE/2, hy = py + dh*TILE/2;
    if (e._depositCol !== undefined && typeof renderGeoDeposit === 'function' &&
        GridManager.getEntity(e._depositCol, e._depositRow) !== e._linkedDeposit) {
      renderGeoDeposit({ type: T.GEODEPOSIT, col: e._depositCol, row: e._depositRow,
        width: dw, height: dh, _geoPhase: e._depositPhase || 0, _hasWell: true },
        px + (e._depositCol - e.col)*TILE, py + (e._depositRow - e.row)*TILE, t);
    }

    // ── Spur from the wellhead to the port (L-shaped) + silencer line ──
    const silX = px + w*0.78, silY = py + h*0.24;
    _wfPipe([[hx + 6*S, hy - 8*S], [silX - 7*S, silY + 10*S]], S, t, flowing, 'rgba(255,190,120,0.95)');
    const spur = horiz ? [[hx, hy], [hx, portY], [portX, portY]] : [[hx, hy], [portX, hy], [portX, portY]];
    const spurPath = () => { ctx.beginPath(); ctx.moveTo(spur[0][0], spur[0][1]); ctx.lineTo(spur[1][0], spur[1][1]); ctx.lineTo(spur[2][0], spur[2][1]); ctx.stroke(); };
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1410'; ctx.lineWidth = 11*S; spurPath();
    ctx.strokeStyle = flowing ? '#e8b880' : '#8a7a6a'; ctx.lineWidth = 8*S; spurPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2.5*S; spurPath();
    if (flowing) {
      ctx.strokeStyle = 'rgba(255,150,70,0.9)'; ctx.lineWidth = 2.5*S;
      ctx.setLineDash([4*S, 5*S]); ctx.lineDashOffset = -t*22*S;
      spurPath();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    ctx.fillStyle = flowing ? '#ffc890' : '#6a5442'; ctx.strokeStyle = '#241a14'; ctx.lineWidth = 1*S;
    const fw = horiz ? 7*S : 15*S, fh = horiz ? 15*S : 7*S;
    ctx.fillRect(portX - fw / 2, portY - fh / 2, fw, fh);
    ctx.strokeRect(portX - fw / 2, portY - fh / 2, fw, fh);

    // ── Silencer stack ──
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.roundRect(silX - 8*S + 4*S, silY - 14*S + 5*S, 16*S, 28*S, 4*S); ctx.fill();
    const stg = ctx.createLinearGradient(silX - 8*S, 0, silX + 8*S, 0);
    stg.addColorStop(0, '#8a6a50'); stg.addColorStop(0.4, '#c89a70'); stg.addColorStop(1, '#5a4030');
    ctx.fillStyle = stg; ctx.beginPath(); ctx.roundRect(silX - 8*S, silY - 14*S, 16*S, 28*S, 4*S); ctx.fill();
    ctx.strokeStyle = 'rgba(40,24,14,0.4)'; ctx.lineWidth = 0.8*S;
    [-6, 2, 10].forEach(o => { ctx.beginPath(); ctx.moveTo(silX - 8*S, silY + o*S); ctx.lineTo(silX + 8*S, silY + o*S); ctx.stroke(); });
    ctx.fillStyle = '#2a1e16'; ctx.beginPath(); ctx.ellipse(silX, silY - 14*S, 8*S, 2.5*S, 0, 0, Math.PI*2); ctx.fill();
    if (flowing) {
      for (let i = 0; i < 6; i++) {
        const p = (t*0.4 + i/6) % 1;
        const r = (5 + p*15)*S;
        ctx.fillStyle = `rgba(248,246,242,${0.5*(1 - p)})`;
        ctx.beginPath(); ctx.arc(silX + Math.sin(i*1.9 + t)*3*S + p*10*S, silY - 16*S - p*34*S, r, 0, Math.PI*2); ctx.fill();
      }
    }

    // ── Wellhead — drawn at footprint-centre coordinates, shifted onto the
    // deposit centre ──
    ctx.save(); ctx.translate(hx - cx, hy - cy);
    if (flowing && Camera.zoom > 0.5) {
      ctx.save(); ctx.globalAlpha = 0.12 + 0.05 * Math.sin(t * 2.4);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.45);
      g.addColorStop(0, '#ff9040'); g.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, w * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(cx + 3*S, cy + 4*S, 14*S, 0, Math.PI*2); ctx.fill();
    const cg = ctx.createRadialGradient(cx - 4*S, cy - 4*S, 1, cx, cy, 14*S);
    cg.addColorStop(0, '#c8c4bc'); cg.addColorStop(1, '#6a665e');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, 14*S, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#3a3a3e'; ctx.beginPath(); ctx.arc(cx, cy, 9*S, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#8a8c90';
    for (let k = 0; k < 8; k++) { const a = k*Math.PI/4; ctx.beginPath(); ctx.arc(cx + Math.cos(a)*7*S, cy + Math.sin(a)*7*S, 1*S, 0, Math.PI*2); ctx.fill(); }
    const vb = ctx.createLinearGradient(cx - 4*S, 0, cx + 4*S, 0);
    vb.addColorStop(0, '#9aa0a4'); vb.addColorStop(0.45, '#e0e4e6'); vb.addColorStop(1, '#5a6064');
    ctx.fillStyle = vb; ctx.fillRect(cx - 4*S, cy - 24*S, 8*S, 24*S);
    ctx.strokeStyle = '#2a2c30'; ctx.lineWidth = 0.8*S; ctx.strokeRect(cx - 4*S, cy - 24*S, 8*S, 24*S);
    [cy - 18*S, cy - 9*S].forEach((vy, i) => {
      ctx.fillStyle = '#5a6064'; ctx.fillRect(cx - 7*S, vy - 1.5*S, 14*S, 3*S);
      [-1, 1].forEach(sd => {
        const wx = cx + sd*9*S;
        ctx.strokeStyle = i ? '#e0b020' : '#c83020'; ctx.lineWidth = 1.4*S;
        ctx.beginPath(); ctx.arc(wx, vy, 3.2*S, 0, Math.PI*2); ctx.stroke();
        ctx.save(); ctx.translate(wx, vy); ctx.rotate(flowing ? t*0.2 : 0);
        ctx.lineWidth = 0.8*S; ctx.beginPath(); ctx.moveTo(-3*S, 0); ctx.lineTo(3*S, 0); ctx.moveTo(0, -3*S); ctx.lineTo(0, 3*S); ctx.stroke();
        ctx.restore();
      });
    });
    ctx.fillStyle = '#3a3a3e'; ctx.fillRect(cx - 5*S, cy - 27*S, 10*S, 3.5*S);
    const gX = cx + 7*S, gY = cy - 3*S;
    ctx.fillStyle = '#f0ece0'; ctx.beginPath(); ctx.arc(gX, gY, 3*S, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 0.7*S; ctx.stroke();
    const na = flowing ? -0.3 + 0.15*Math.sin(t*3) : -2.4;
    ctx.strokeStyle = '#c02010'; ctx.beginPath(); ctx.moveTo(gX, gY); ctx.lineTo(gX + Math.cos(na)*2.5*S, gY + Math.sin(na)*2.5*S); ctx.stroke();
    if (flowing) {
      for (let i = 0; i < 3; i++) {
        const p = (t*0.6 + i/3) % 1;
        ctx.fillStyle = `rgba(245,240,235,${0.35*(1 - p)})`;
        ctx.beginPath(); ctx.arc(cx + Math.sin(p*3 + i)*3*S, cy - 29*S - p*14*S, (2 + p*5)*S, 0, Math.PI*2); ctx.fill();
      }
    }
    ctx.restore();

    const label = flowing ? `${e._steamOutput || 0} ST/S` : (on ? 'NO TURBINE' : 'OFFLINE');
    // Sits on the bottom edge of the FOOTPRINT, not of the artwork (h, which
    // is a tile taller — see visualHeight above). Hanging it off the sprite's
    // bottom left it floating a tile clear of the well, over ground that is
    // now free to build on. A south-facing well's spur comes down the middle,
    // so its plate moves to the right, under the silencer stack.
    _wfPlate(label, rot === 2 ? silX : cx, py + hFoot - 8*S, S, flowing ? '#ffb070' : '#a07a5a', on);
    ctx.restore();
  }

/* ── Geothermal Turbine ────────────────────────────────────────────────
   A 5×4 plant read left to right as the energy moves through it: hot steam
   header → arched turbine hall → turbine casing + rotor → coupling →
   generator → step-up transformer, with an air-cooled condenser (two fans
   that speed up with load) venting at the cold end and an output dial that
   shows headroom against the rating. Keys off `_generating`,
   `_currentOutput`, `_linkedWell` and `_hasPower`. No backdrop.
   ───────────────────────────────────────────────────────────────────── */
function renderGeoTurbine(e, px, py, t) {
    const w  = (e.width  || 5) * TILE;
    const h  = (e.height || 4) * TILE;
    const running = !!e._generating;
    const S = TILE / 40;
    const zoom = Camera.zoom;
    const detail = zoom > 0.6;
    const rated = e.def?.powerOutput || 35;
    const outW  = e._currentOutput || 0;
    const duty  = running ? Math.max(0, Math.min(1, outW / Math.max(1, rated))) : 0;
    const hot  = (a) => `rgba(255,${Math.round(150 + 40 * duty)},${Math.round(90 + 25 * duty)},${a})`;
    ctx.save();

    const trainY = py + h*0.74;
    const hallX = px + w*0.13, hallY = py + h*0.10, hallW = w*0.56, hallH = h*0.42;
    const accX = px + w*0.74, accY = py + h*0.12, accW = w*0.22, accH = h*0.50;

    // ── Steam header in from the left face ──
    _wfPipe([[px + 4*S, trainY], [px + w*0.17, trainY]], S, t, running, hot(0.95));
    ctx.strokeStyle = running ? hot(0.9) : '#6a5a4a'; ctx.lineWidth = 7*S; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(px + 2*S, trainY); ctx.lineTo(px + w*0.17, trainY); ctx.stroke();
    ctx.strokeStyle = 'rgba(40,30,20,0.4)'; ctx.lineWidth = 0.8*S;
    for (let x = px + 8*S; x < px + w*0.17; x += 7*S) { ctx.beginPath(); ctx.moveTo(x, trainY - 3.5*S); ctx.lineTo(x, trainY + 3.5*S); ctx.stroke(); }
    if (running && detail) {
      ctx.save(); ctx.beginPath(); ctx.rect(px + 2*S, trainY - 3.5*S, w*0.17, 7*S); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,230,0.9)'; ctx.lineWidth = 1.2*S;
      const flow = (t * 30 * S) % (12*S);
      for (let x = px - 12*S + flow; x < px + w*0.19; x += 12*S) { ctx.beginPath(); ctx.moveTo(x, trainY - 2.5*S); ctx.lineTo(x + 3*S, trainY); ctx.lineTo(x, trainY + 2.5*S); ctx.stroke(); }
      ctx.restore();
    }

    // ── Turbine hall ──
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.roundRect(hallX + 5*S, hallY + 6*S, hallW, hallH, 8*S); ctx.fill();
    const rg = ctx.createLinearGradient(0, hallY, 0, hallY + hallH);
    rg.addColorStop(0, '#7a8a92'); rg.addColorStop(0.45, '#c8d4da'); rg.addColorStop(0.55, '#a8b6bc'); rg.addColorStop(1, '#5a6a72');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.roundRect(hallX, hallY, hallW, hallH, 8*S); ctx.fill();
    ctx.strokeStyle = '#2a3438'; ctx.lineWidth = 1.2*S; ctx.stroke();
    ctx.strokeStyle = 'rgba(30,40,46,0.25)'; ctx.lineWidth = S;
    for (let k = 1; k < 12; k++) { const x = hallX + hallW*k/12; ctx.beginPath(); ctx.moveTo(x, hallY + 3*S); ctx.lineTo(x, hallY + hallH - 3*S); ctx.stroke(); }
    ctx.fillStyle = running ? hot(0.35 + 0.35*duty) : 'rgba(120,150,170,0.35)';
    ctx.fillRect(hallX + hallW*0.08, hallY + hallH*0.44, hallW*0.84, hallH*0.12);
    const blink = running ? 0.35 + 0.65 * Math.abs(Math.sin(t * 3.2)) : 0;
    ctx.fillStyle = running ? `rgba(255,70,50,${blink})` : 'rgba(110,90,85,0.5)';
    ctx.beginPath(); ctx.arc(hallX + hallW - 7*S, hallY + 6*S, 2.4*S, 0, Math.PI*2); ctx.fill();

    // ── Turbine casing + rotor ──
    const tcX = px + w*0.17, tcW = w*0.18, tcH = h*0.22;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.roundRect(tcX + 4*S, trainY - tcH/2 + 5*S, tcW, tcH, tcH*0.45); ctx.fill();
    const tg = ctx.createLinearGradient(0, trainY - tcH/2, 0, trainY + tcH/2);
    tg.addColorStop(0, '#6a5a4a'); tg.addColorStop(0.45, running ? '#f0c898' : '#b8aa98'); tg.addColorStop(1, '#3a2e24');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.roundRect(tcX, trainY - tcH/2, tcW, tcH, tcH*0.45); ctx.fill();
    ctx.strokeStyle = '#1a1410'; ctx.lineWidth = S; ctx.stroke();
    const rotX = tcX + tcW*0.5, rotR = tcH*0.34;
    ctx.fillStyle = '#141414'; ctx.beginPath(); ctx.arc(rotX, trainY, rotR + 1.5*S, 0, Math.PI*2); ctx.fill();
    ctx.save(); ctx.translate(rotX, trainY); ctx.rotate(running ? t*5 : 0.2);
    ctx.strokeStyle = running ? hot(1) : '#8a8a8a'; ctx.lineWidth = 1.6*S;
    for (let i = 0; i < 10; i++) { ctx.rotate(Math.PI/5); ctx.beginPath(); ctx.moveTo(rotR*0.2, 0); ctx.quadraticCurveTo(rotR*0.6, rotR*0.2, rotR*0.9, 0); ctx.stroke(); }
    ctx.restore();

    // ── Coupling + generator ──
    const genX = px + w*0.39, genW = w*0.16, genH = h*0.19;
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 5*S;
    ctx.beginPath(); ctx.moveTo(tcX + tcW, trainY); ctx.lineTo(genX, trainY); ctx.stroke();
    ctx.strokeStyle = '#c8ccd0'; ctx.lineWidth = 3*S; ctx.stroke();
    if (running) { ctx.strokeStyle = 'rgba(40,40,40,0.7)'; ctx.setLineDash([2*S, 3*S]); ctx.lineDashOffset = -t*40*S; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0; }
    ctx.fillStyle = '#e0a020'; ctx.fillRect(tcX + tcW + (genX - tcX - tcW)/2 - 2.5*S, trainY - 5*S, 5*S, 10*S);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.roundRect(genX + 4*S, trainY - genH/2 + 5*S, genW, genH, 4*S); ctx.fill();
    const gg = ctx.createLinearGradient(0, trainY - genH/2, 0, trainY + genH/2);
    gg.addColorStop(0, '#2a4a70'); gg.addColorStop(0.45, '#7aa8d8'); gg.addColorStop(1, '#162a44');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.roundRect(genX, trainY - genH/2, genW, genH, 4*S); ctx.fill();
    ctx.strokeStyle = 'rgba(10,20,34,0.55)'; ctx.lineWidth = 0.8*S;
    for (let x = genX + 3*S; x < genX + genW - 2*S; x += 3*S) { ctx.beginPath(); ctx.moveTo(x, trainY - genH/2 + 2*S); ctx.lineTo(x, trainY - genH*0.15); ctx.stroke(); }
    ctx.fillStyle = running ? `rgba(140,220,255,${0.7 + 0.3*Math.sin(t*6)})` : '#1a2a3a';
    ctx.fillRect(genX + 3*S, trainY + 1*S, genW - 6*S, 2.5*S);

    // ── Transformer ──
    const trX = px + w*0.58, trW = w*0.12, trH = h*0.18;
    ctx.strokeStyle = running ? 'rgba(120,220,255,0.7)' : '#5a6a74'; ctx.lineWidth = 1.6*S;
    ctx.beginPath(); ctx.moveTo(genX + genW, trainY); ctx.lineTo(trX, trainY); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(trX + 4*S, trainY - trH/2 + 5*S, trW, trH);
    ctx.fillStyle = '#5a6a5a'; ctx.fillRect(trX, trainY - trH/2, trW, trH);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8*S;
    for (let x = trX + 2.5*S; x < trX + trW - 1*S; x += 2.5*S) { ctx.beginPath(); ctx.moveTo(x, trainY - trH/2 + 2*S); ctx.lineTo(x, trainY + trH/2 - 2*S); ctx.stroke(); }
    for (let i = 0; i < 3; i++) {
      const bx = trX + trW*(0.2 + i*0.3), by = trainY - trH/2;
      ctx.fillStyle = '#c8704a';
      for (let q = 0; q < 3; q++) { ctx.beginPath(); ctx.ellipse(bx, by - 1*S - q*2.5*S, 2*S, 1*S, 0, 0, Math.PI*2); ctx.fill(); }
      if (running && Math.sin(t*11 + i*2.3) > 0.9) {
        ctx.strokeStyle = 'rgba(210,245,255,0.95)'; ctx.lineWidth = 1*S;
        ctx.beginPath(); ctx.moveTo(bx, by - 8*S); ctx.lineTo(bx + 2.5*S, by - 11*S); ctx.lineTo(bx - 1*S, by - 13*S); ctx.stroke();
      }
    }

    // ── Air-cooled condenser ──
    _wfPipe([[tcX + tcW*0.5, trainY + tcH/2], [tcX + tcW*0.5, py + h*0.94], [accX + accW*0.5, py + h*0.94], [accX + accW*0.5, accY + accH]], S, t, running, 'rgba(150,200,230,0.9)');
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.roundRect(accX + 4*S, accY + 5*S, accW, accH, 3*S); ctx.fill();
    ctx.fillStyle = '#4a5a62'; ctx.beginPath(); ctx.roundRect(accX, accY, accW, accH, 3*S); ctx.fill();
    ctx.strokeStyle = '#1a2428'; ctx.lineWidth = S; ctx.stroke();
    [0.27, 0.73].forEach((f, i) => {
      const fx = accX + accW*0.5, fy = accY + accH*f, fr = Math.min(accW, accH*0.5)*0.40;
      ctx.fillStyle = '#10181c'; ctx.beginPath(); ctx.arc(fx, fy, fr + 1.5*S, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#8a9aa2'; ctx.lineWidth = 1.2*S; ctx.stroke();
      ctx.save(); ctx.translate(fx, fy); ctx.rotate(t*(running ? 1.2 + 4.5*duty : 0) + i);
      ctx.fillStyle = '#9ab0b8';
      for (let b = 0; b < 4; b++) { ctx.rotate(Math.PI/2); ctx.beginPath(); ctx.ellipse(fr*0.45, 0, fr*0.42, Math.max(1.4*S, fr*0.14), 0.35, 0, Math.PI*2); ctx.fill(); }
      ctx.restore();
      ctx.fillStyle = '#2a3438'; ctx.beginPath(); ctx.arc(fx, fy, 2*S, 0, Math.PI*2); ctx.fill();
    });
    if (running) {
      for (let i = 0; i < 5; i++) {
        const p = (t*0.34 + i/5) % 1;
        ctx.fillStyle = `rgba(245,242,238,${0.35*(1 - p)})`;
        ctx.beginPath(); ctx.arc(accX + accW*0.5 + p*8*S + Math.sin(t*1.4 + i)*3*S, accY - p*26*S, (3 + p*10)*S, 0, Math.PI*2); ctx.fill();
      }
    }

    // ── Output dial ──
    const dX = px + w*0.85, dY = py + h*0.80, dR = Math.min(h*0.10, 13*S);
    ctx.fillStyle = '#0c1012'; ctx.beginPath(); ctx.arc(dX, dY, dR + 3*S, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#5a6a72'; ctx.lineWidth = S; ctx.stroke();
    const a0 = Math.PI * 0.75, a1 = a0 + Math.PI * 1.5;
    ctx.strokeStyle = 'rgba(140,170,185,0.25)'; ctx.lineWidth = 2.5*S;
    ctx.beginPath(); ctx.arc(dX, dY, dR, a0, a1); ctx.stroke();
    if (duty > 0) {
      ctx.strokeStyle = duty > 0.85 ? 'rgba(255,120,80,0.95)' : hot(0.95); ctx.lineWidth = 2.5*S;
      ctx.beginPath(); ctx.arc(dX, dY, dR, a0, a0 + (a1 - a0) * duty); ctx.stroke();
    }
    const na = a0 + (a1 - a0) * duty;
    ctx.strokeStyle = running ? '#ffe8d0' : '#6a7a82'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.moveTo(dX, dY); ctx.lineTo(dX + Math.cos(na)*(dR - 3*S), dY + Math.sin(na)*(dR - 3*S)); ctx.stroke();

    if (running && zoom > 0.5) {
      ctx.save(); ctx.globalAlpha = 0.07 + 0.05 * duty + 0.03 * Math.sin(t * 3.0);
      const g = ctx.createRadialGradient(rotX, trainY, 0, rotX, trainY, w * 0.35);
      g.addColorStop(0, '#ffb070'); g.addColorStop(1, 'rgba(255,176,112,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(rotX, trainY, w * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    const label = running ? `GEO TURBINE  ${formatPower(outW)}` : !e._linkedWell ? 'NO WELL' : !e._hasPower ? 'NO WIRE' : 'NO STEAM';
    // On the hall roof (above the skylight band) rather than below the plant,
    // where a well's steam spur usually runs in to meet the turbine.
    _wfPlate(label, hallX + hallW*0.5, hallY + hallH*0.24, S, running ? '#ffb070' : '#a07a5a', true);
    // Hovering a wire lights every generator on that network — the same
    // footprint outline every generator uses (render_grid_electric.js).
    drawNetworkHighlight(e, px, py, t);
    ctx.restore();
  }
