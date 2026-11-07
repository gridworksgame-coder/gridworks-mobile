/* ═══════════════════════════════════════════════════════════════════
   RENDER: GAS HOLDER
   The Gas Storage tank (GasStorageSystem) — a Horton sphere: a big steel
   pressure sphere on a ring of legs, with a spiral stair up its flank, a
   catwalk round the equator, a relief valve and an aircraft beacon on top.
   What's inside shows through: the equator band and the sight glass glow
   in the stored gas's colour and swirl while it's moving, the level
   gauge and pressure dial follow the fill, and the relief valve vents
   once it's nearly full. Unlike the rotatable plants it is NOT drawn in a
   turned frame — a sphere on legs has to stay upright — so only the
   pipework turns, running from wherever GasStorageSystem.getStubs puts
   the ports to the nozzles under the sphere. Shares the kit from
   render_oil_nuclear.js and render_hydro_coal.js.
   ═══════════════════════════════════════════════════════════════════ */

const _GAS_FORMULA = { hydrogen: 'H₂', nitrogen: 'N₂', ammonia: 'NH₃', deuterium: 'D₂', tritium: 'T₂', helium: 'He', helium3: '³He' };
// The nameplate font has no subscript digits.
const _GAS_PLATE   = { hydrogen: 'H2', nitrogen: 'N2', ammonia: 'NH3', deuterium: 'D2', tritium: 'T2', helium: 'HE', helium3: 'HE3' };

function renderGasStorage(e, px, py, t) {
  const def = EntityDefs[T.GASSTORAGE];
  const w = (e.width || def.width) * TILE, h = (e.height || def.height) * TILE;
  const S = TILE / 40;
  const detail = Camera.zoom > 0.5;
  const sys = typeof GasStorageSystem !== 'undefined' ? GasStorageSystem : null;
  const gas = e._gasType || null;
  const cap = sys ? sys.capacity() : 5000;
  const fill = sys && e.col !== undefined ? Math.min(1, sys.stored(e) / cap) : 0;
  const online = !e._lightningDamaged && !e._ghost;
  const gc = gas && sys ? sys.color(gas) : '#6a7c8a';
  const moving = online && (!!e._filling || (e._outRate || 0) > 0.5);
  const st = sys && e.col !== undefined ? sys.getStubs(e) : null;
  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; };
  const gRGB = rgb(gc);

  ctx.save();
  ctx.translate(px, py);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // ── Pad: bunded concrete with hazard-striped kerb ──
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.roundRect(w*0.04 + 5*S, h*0.04 + 6*S, w*0.92, h*0.92, 6*S); ctx.fill();
  ctx.fillStyle = '#50565c'; ctx.beginPath(); ctx.roundRect(w*0.04, h*0.04, w*0.92, h*0.92, 6*S); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.roundRect(w*0.04, h*0.04, w*0.92, h*0.92, 6*S); ctx.clip();
  ctx.lineWidth = 5*S;
  for (let q = -h; q < w + h; q += 12*S) {
    ctx.strokeStyle = '#d8b030'; ctx.beginPath(); ctx.moveTo(q, 0); ctx.lineTo(q + h, h); ctx.stroke();
  }
  ctx.fillStyle = '#5c6268'; ctx.beginPath(); ctx.roundRect(w*0.04 + 5*S, h*0.04 + 5*S, w*0.92 - 10*S, h*0.92 - 10*S, 4*S); ctx.fill();
  ctx.restore();
  // expansion joints
  ctx.strokeStyle = 'rgba(30,34,38,0.45)'; ctx.lineWidth = S;
  for (let q = 1; q < 4; q++) {
    const lx = w*0.04 + w*0.92*q/4, ly = h*0.04 + h*0.92*q/4;
    ctx.beginPath(); ctx.moveTo(lx, h*0.06); ctx.lineTo(lx, h*0.94); ctx.moveTo(w*0.06, ly); ctx.lineTo(w*0.94, ly); ctx.stroke();
  }

  const cx = w*0.5, cy = h*0.47, R = Math.min(w, h)*0.33;

  // ── Pipework: each port → the nozzles under the sphere. Drawn before
  // the sphere, so a line from a top-face port runs behind it. ──
  const pOn = online && !!gas;
  const nozY = cy + R*0.92;
  const route = (stub, fallback, nx) => {
    const a = stub ? _portAnchor(e, 0, 0, w, h, stub) : fallback;
    const inX = a.x - a.dx*14*S, inY = a.y - a.dy*14*S;
    const pts = a.dx ? [[a.x - a.dx*10*S, a.y], [nx, a.y], [nx, nozY]]
                     : [[a.x, a.y - a.dy*10*S], [a.x, a.dy > 0 ? nozY + R*0.18 : a.y + 18*S], [nx, a.dy > 0 ? nozY + R*0.18 : a.y + 18*S], [nx, nozY]];
    return { pts, vx: inX, vy: inY };
  };
  const pIn  = route(st && st.gasIn,  { x: 0, y: h/2, dx: -1, dy: 0 }, cx - R*0.3);
  const pOut = route(st && st.gasOut, { x: w, y: h/2, dx: 1,  dy: 0 }, cx + R*0.3);
  _wfPipe(pIn.pts,  S, t, pOn && !!e._filling,   `rgba(${gRGB},0.95)`);
  _wfPipe(pOut.pts, S, t, pOn && !!e._outLinked, `rgba(${gRGB},0.95)`);
  // isolation valves just inside each port
  [[pIn.vx, pIn.vy, '#c05040'], [pOut.vx, pOut.vy, '#40c060']].forEach(([vx, vy, col]) => {
    ctx.fillStyle = '#2a3036'; ctx.beginPath(); ctx.roundRect(vx - 4*S, vy - 4*S, 8*S, 8*S, 2*S); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.6*S;
    ctx.beginPath(); ctx.arc(vx, vy, 3.4*S, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(vx - 3.4*S, vy); ctx.lineTo(vx + 3.4*S, vy); ctx.stroke();
  });

  // ── Legs (back half first, sphere, then front legs) ──
  const legs = 8;
  const leg = (i) => {
    const a = (i / legs) * Math.PI * 2 + Math.PI / legs;
    const lx = cx + Math.cos(a) * R * 0.86, top = cy + Math.sin(a) * R * 0.3, foot = cy + R * 0.95 + Math.sin(a) * R * 0.18;
    const g = ctx.createLinearGradient(lx - 3*S, 0, lx + 3*S, 0);
    g.addColorStop(0, '#5a646c'); g.addColorStop(0.5, '#aab4bc'); g.addColorStop(1, '#4a545c');
    ctx.fillStyle = g; ctx.fillRect(lx - 2.6*S, top, 5.2*S, foot - top);
    ctx.fillStyle = '#30383e'; ctx.fillRect(lx - 4*S, foot - 2*S, 8*S, 3*S);        // base plate
    return { lx, top, foot, a };
  };
  const back = [], front = [];
  for (let i = 0; i < legs; i++) (Math.sin((i / legs) * Math.PI * 2 + Math.PI / legs) < 0 ? back : front).push(i);
  back.forEach(leg);
  // cross bracing between back legs
  ctx.strokeStyle = 'rgba(120,132,142,0.7)'; ctx.lineWidth = 1*S;
  for (let i = 0; i < back.length - 1; i++) {
    const a0 = (back[i] / legs) * Math.PI * 2 + Math.PI / legs, a1 = (back[i + 1] / legs) * Math.PI * 2 + Math.PI / legs;
    const x0 = cx + Math.cos(a0) * R * 0.86, x1 = cx + Math.cos(a1) * R * 0.86;
    const y0 = cy + R*0.35, y1 = cy + R*0.85;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.moveTo(x1, y0); ctx.lineTo(x0, y1); ctx.stroke();
  }

  // ground shadow under the sphere
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(cx + 6*S, cy + R*0.98, R*0.95, R*0.28, 0, 0, Math.PI*2); ctx.fill();

  // ── The sphere ──
  const sg = ctx.createRadialGradient(cx - R*0.38, cy - R*0.42, R*0.08, cx, cy, R);
  sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.35, '#dfe6eb'); sg.addColorStop(0.8, '#98a6b0'); sg.addColorStop(1, '#5c6a74');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.fill();
  // inner gas glow, stronger the fuller it is
  if (gas && fill > 0) {
    const ig = ctx.createRadialGradient(cx, cy + R*0.2, 0, cx, cy, R);
    ig.addColorStop(0, `rgba(${gRGB},${(0.10 + 0.22*fill).toFixed(3)})`); ig.addColorStop(1, `rgba(${gRGB},0)`);
    ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.fill();
  }
  // weld seams: latitude arcs and meridians
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.clip();
  ctx.strokeStyle = 'rgba(60,72,82,0.35)'; ctx.lineWidth = 0.9*S;
  [-0.62, -0.3, 0.3, 0.62].forEach(k => { ctx.beginPath(); ctx.ellipse(cx, cy + R*k, R*Math.sqrt(1 - k*k), R*0.14*Math.sqrt(1 - k*k), 0, 0, Math.PI); ctx.stroke(); });
  for (let m = -2; m <= 2; m++) { ctx.beginPath(); ctx.ellipse(cx, cy, Math.abs(m)*R*0.28 + 0.1, R, 0, 0, Math.PI*2); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = '#3a4852'; ctx.lineWidth = 1.2*S; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.stroke();

  // equator band — lights up in the gas colour, a bright segment fills
  // round the band with the stock
  const bandY = cy + R*0.06, bRx = R*1.0, bRy = R*0.16;
  ctx.lineWidth = 7*S; ctx.strokeStyle = '#1e262c';
  ctx.beginPath(); ctx.ellipse(cx, bandY, bRx, bRy, 0, 0, Math.PI); ctx.stroke();
  if (gas && fill > 0) {
    const pulse = moving ? 0.75 + 0.25*Math.sin(t*4) : 0.7;
    ctx.strokeStyle = `rgba(${gRGB},${pulse.toFixed(3)})`; ctx.lineWidth = 5*S;
    ctx.shadowColor = gc; ctx.shadowBlur = online ? 14*S : 0;
    ctx.beginPath(); ctx.ellipse(cx, bandY, bRx, bRy, 0, Math.PI - Math.PI*fill, Math.PI); ctx.stroke();
    ctx.shadowBlur = 0;
    // running chevrons while gas moves
    if (moving) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let q = 0; q < 4; q++) {
        const a = Math.PI - ((t*0.35 + q/4) % 1) * Math.PI*fill;
        ctx.beginPath(); ctx.arc(cx + Math.cos(a)*bRx, bandY + Math.sin(a)*bRy, 1.3*S, 0, Math.PI*2); ctx.fill();
      }
    }
  }
  // catwalk handrail over the band
  ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.ellipse(cx, bandY - 4*S, bRx + 3*S, bRy + 1.5*S, 0, 0, Math.PI); ctx.stroke();
  for (let q = 1; q < 12; q++) {
    const a = Math.PI*q/12;
    const x = cx + Math.cos(a)*(bRx + 3*S), y = bandY - 4*S + Math.sin(a)*(bRy + 1.5*S);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 4*S); ctx.stroke();
  }

  // sight glass — the gas swirling inside
  const sgx = cx + R*0.36, sgy = cy - R*0.18, sgw = R*0.16, sgh = R*0.42;
  ctx.fillStyle = '#10161c'; ctx.beginPath(); ctx.roundRect(sgx - sgw/2, sgy - sgh/2, sgw, sgh, sgw/2); ctx.fill();
  if (gas && fill > 0) {
    ctx.save(); ctx.beginPath(); ctx.roundRect(sgx - sgw/2 + S, sgy - sgh/2 + S, sgw - 2*S, sgh - 2*S, sgw/2); ctx.clip();
    const lvl = sgy + sgh/2 - sgh*fill;
    ctx.fillStyle = `rgba(${gRGB},0.55)`; ctx.fillRect(sgx - sgw/2, lvl, sgw, sgh*fill);
    ctx.strokeStyle = `rgba(255,255,255,${online ? 0.55 : 0.2})`; ctx.lineWidth = 0.8*S;
    for (let q = 0; q < 4; q++) {
      const ph = moving ? t*1.6 + q*1.7 : q*1.7;
      const yy = lvl + ((q + 0.5) / 4) * sgh*fill;
      ctx.beginPath(); ctx.moveTo(sgx - sgw/2, yy + Math.sin(ph)*1.5*S);
      ctx.quadraticCurveTo(sgx, yy + Math.sin(ph + 1.5)*3*S, sgx + sgw/2, yy + Math.sin(ph + 3)*1.5*S); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.strokeStyle = '#8898a4'; ctx.lineWidth = 1*S; ctx.beginPath(); ctx.roundRect(sgx - sgw/2, sgy - sgh/2, sgw, sgh, sgw/2); ctx.stroke();

  // gas formula stencilled on the sphere
  if (detail) {
    ctx.save();
    ctx.font = `bold ${Math.max(6, R*0.28)}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = gas ? gc : 'rgba(60,72,82,0.55)';
    if (gas && online) { ctx.shadowColor = gc; ctx.shadowBlur = 6*S; }
    if (!gas) ctx.font = `bold ${Math.max(5, R*0.13)}px Arial`;
    ctx.fillText(gas ? _GAS_FORMULA[gas] : 'EMPTY', cx - R*0.18, cy - R*0.22);
    ctx.restore();
  }

  // specular highlight
  const hg = ctx.createRadialGradient(cx - R*0.42, cy - R*0.5, 0, cx - R*0.42, cy - R*0.5, R*0.35);
  hg.addColorStop(0, 'rgba(255,255,255,0.7)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(cx - R*0.42, cy - R*0.5, R*0.35, 0, Math.PI*2); ctx.fill();

  front.forEach(leg);

  // spiral stair up the left flank
  ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 1.1*S;
  ctx.beginPath();
  for (let q = 0; q <= 24; q++) {
    const u = q / 24, a = Math.PI*0.62 + u*Math.PI*0.75;
    const x = cx + Math.cos(a)*R*(1.02 + 0.04*Math.sin(u*Math.PI)), y = cy + R*0.95 - u*R*1.55;
    q ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(200,160,64,0.6)'; ctx.lineWidth = 0.8*S;
  for (let q = 0; q <= 24; q += 2) {
    const u = q / 24, a = Math.PI*0.62 + u*Math.PI*0.75;
    const x = cx + Math.cos(a)*R*1.02, y = cy + R*0.95 - u*R*1.55;
    ctx.beginPath(); ctx.moveTo(x - 2*S, y); ctx.lineTo(x + 2*S, y); ctx.stroke();
  }

  // top platform, relief valve and beacon mast
  const topY = cy - R;
  ctx.fillStyle = '#38424a'; ctx.beginPath(); ctx.ellipse(cx, topY + 3*S, R*0.26, R*0.08, 0, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 0.9*S; ctx.stroke();
  ctx.fillStyle = '#9aa6ae'; ctx.fillRect(cx + R*0.1, topY - 7*S, 3.5*S, 9*S);                // relief valve stack
  ctx.fillStyle = '#c05040'; ctx.fillRect(cx + R*0.1 - 1*S, topY - 8*S, 5.5*S, 2*S);
  ctx.strokeStyle = '#7a868e'; ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.moveTo(cx - R*0.1, topY + 2*S); ctx.lineTo(cx - R*0.1, topY - 14*S); ctx.stroke();   // mast

  // ── World-space bits: vapour, beacon, gauges, ports, plate ──
  const [vx, vy] = [cx + R*0.1 + 1.75*S, topY - 8*S];
  _wfSmoke(vx, vy, S*0.5, t, gas ? gRGB : '220,230,240', online && fill > 0.95, 0.55);
  const [bx, by] = [cx - R*0.1, topY - 15*S];
  const blink = online && (t*1.2 % 1) < 0.15;
  ctx.fillStyle = blink ? '#ff3020' : '#501810';
  if (blink) { ctx.shadowColor = '#ff3020'; ctx.shadowBlur = 12*S; }
  ctx.beginPath(); ctx.arc(bx, by, 2.2*S, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;

  // pressure dial — needle sweeps with the fill
  const [dx, dy] = [w*0.16, h*0.2];
  const dr = 7*S;
  ctx.fillStyle = '#1a2026'; ctx.beginPath(); ctx.arc(dx, dy, dr + 1.5*S, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#e8ecef'; ctx.beginPath(); ctx.arc(dx, dy, dr, 0, Math.PI*2); ctx.fill();
  ctx.lineWidth = 1.6*S;
  ctx.strokeStyle = '#40a060'; ctx.beginPath(); ctx.arc(dx, dy, dr*0.78, Math.PI*0.75, Math.PI*1.65); ctx.stroke();
  ctx.strokeStyle = '#d0a020'; ctx.beginPath(); ctx.arc(dx, dy, dr*0.78, Math.PI*1.65, Math.PI*2.0); ctx.stroke();
  ctx.strokeStyle = '#d03020'; ctx.beginPath(); ctx.arc(dx, dy, dr*0.78, Math.PI*2.0, Math.PI*2.25); ctx.stroke();
  const na = Math.PI*0.75 + Math.PI*1.5*fill + (moving ? Math.sin(t*9)*0.03 : 0);
  ctx.strokeStyle = '#101418'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + Math.cos(na)*dr*0.85, dy + Math.sin(na)*dr*0.85); ctx.stroke();
  ctx.fillStyle = '#101418'; ctx.beginPath(); ctx.arc(dx, dy, 1.3*S, 0, Math.PI*2); ctx.fill();

  if (st) {
    const pc = gas ? gc : '#9ab0c0';
    _portPipe(_portAnchor(e, 0, 0, w, h, st.gasIn),  S, t, { fluid: pc, label: 'GAS IN',  on: online, out: false, flow: !!e._filling });
    _portPipe(_portAnchor(e, 0, 0, w, h, st.gasOut), S, t, { fluid: pc, label: 'GAS OUT', on: !!e._outLinked, out: true, flow: (e._outRate || 0) > 0.5 });
  }
  const [plx, ply] = [w*0.5, h*0.93];
  const pct = Math.round(fill * 100);
  _wfPlate(e._lightningDamaged ? 'STRUCK: OFFLINE' : gas ? `${_GAS_PLATE[gas]} ${pct}%` : 'GAS HOLDER', plx, ply, S, e._lightningDamaged ? '#ff5040' : gc, online);
  ctx.restore();
}
