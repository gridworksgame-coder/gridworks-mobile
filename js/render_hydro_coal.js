/* ═══════════════════════════════════════════════════════════════════
   RENDER: HYDRO & COAL CHAINS
   Dam/hydro turbine/shaft/hydro generator chain, coal generator,
   coal deposit, and waste facilities (coal/oil/nuclear).
   ═══════════════════════════════════════════════════════════════════ */

/* ── Hydro chain, rendered ───────────────────────────────────────────────
   Hydro Turbine, Hydroelectric Generator and the Dam, built and rendered in
   Blender (scripts/render_hydro.py, which reuses render_coal_water.py's
   scene and materials). Each is rendered in its four orientations (the
   model turned about z, the sun fixed); HYDRO_LAYOUT is in the default
   orientation (turbine: water from the north; generator: shaft in from the
   west; dam: reservoir north) and _hyRot turns its points to match. The
   dam is one tile, drawn along the span. Painted versions are the fallback. */
const HYDRO_LAYOUT = {
  turb: {"runner":[0.4,-0.2,1.45,1.3],"outlets":[[-1.6,-4.6,0.05],[1.6,-4.6,0.05]],"hutWin":[3.5,-3.34,2.6],"lamps":[[-3.9,-3.9,3.35],[3.9,-3.9,3.35],[-3.9,2.5,3.35],[3.9,2.5,3.35]],"plate":[0,-3.4,1.3],"deck":1.2,"B":4.3,"frame":13.0,"off":0.9},
  gen: {"rotor":[-0.8,0,2.43,2.4],"lamp":[-0.25,-0.5,3.6],"bus":[[5.3,-6.0,3.0],[5.3,6.0,3.0]],"trafos":[[4.9,-2.6,2.8],[4.9,2.6,2.8]],"kioskWin":[-4.0,-5.39,1.4],"input":[-6.4,0,1.0],"frame":16.0,"off":1.0},
  dam: {"lamp":[0.75,0.75,2.55],"spill":[0,-1.05,0.0],"crest":[0,0.7,1.75],"frame":4.0,"off":0.6},
};
const _HY_PHI = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
function _hyRot(p, k) {
  const a = _HY_PHI[k], c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
}
// A sprite part rendered at default-orientation point `at` (its frame F),
// drawn turned by th about where that point lands in orientation k.
function _hyTurnedAt(im, F, at, k, th) {
  const [x0, y0] = F.P(at[0], at[1], at[2]), q = _hyRot(at, k), [x1, y1] = F.P(q[0], q[1], q[2]);
  const F2 = { fx: F.fx + (x1 - x0), fy: F.fy + (y1 - y0), fw: F.fw, fh: F.fh };
  _cwTurned(im, [F.D(1, 0, 0), F.D(0, 1, 0)], th, x1, y1, F2);
}
function _hyPortHub(x, y, S, t, fuelled, rate) {
  const TAU = Math.PI * 2;
  ctx.save(); ctx.translate(x, y);
  if (Camera.zoom > 0.5) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 14 * S);
    g.addColorStop(0, `rgba(224,160,32,${fuelled ? 0.7 + 0.25 * Math.sin(t * 4) : 0.25})`); g.addColorStop(1, 'rgba(224,160,32,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 14 * S, 0, TAU); ctx.fill();
  }
  if (fuelled) ctx.rotate(t * 4 * rate);
  ctx.fillStyle = fuelled ? '#ffc040' : '#604018'; ctx.beginPath(); ctx.arc(0, 0, 5 * S, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#1a0e00'; ctx.lineWidth = 1.5 * S;
  ctx.beginPath(); ctx.arc(0, 0, 5 * S, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-4 * S, 0); ctx.lineTo(4 * S, 0); ctx.moveTo(0, -4 * S); ctx.lineTo(0, 4 * S); ctx.stroke();
  ctx.restore();
}

function _hydroTurbArt(e, px, py, t) {
  const L = HYDRO_LAYOUT.turb;
  const tw = (e.width || 5) * TILE, th = (e.height || 5) * TILE, S = TILE / 40, TAU = Math.PI * 2;
  const cx = px + tw / 2, cy = py + th / 2;
  const on = e.powered, fuelled = on && e._fuelled, fillFrac = e._fillFrac || 0;
  const fdc = e._flowDc || 0, fdr = e._flowDr || 0;
  const k = fdr > 0 ? 0 : fdc > 0 ? 1 : fdr < 0 ? 2 : fdc < 0 ? 3 : 0;
  const dark = DayNight.darkness();
  const F = _cwFrame(L, cx, cy), { P, M } = F;
  const R = p => P(..._hyRot(p, k));
  // water under the footprint (as the painted turbine does)
  if (e._waterTiles && e._waterTiles.length) {
    if (!e._waterStubs) {
      const inFoot = new Set(e._waterTiles.map(w => w.c + ',' + w.r));
      const wet = (c, r) => inFoot.has(c + ',' + r) || WaterSystem.isWater(c, r);
      e._waterStubs = e._waterTiles.map(w => {
        let mask = 0;
        if (!wet(w.c, w.r - 1)) mask |= 1; if (!wet(w.c, w.r + 1)) mask |= 2;
        if (!wet(w.c - 1, w.r)) mask |= 4; if (!wet(w.c + 1, w.r)) mask |= 8;
        return { col: w.c, row: w.r, _reservoirId: e._reservoirId, _isRiver: w.isRiver, _shoreMask: mask };
      });
    }
    for (const w of e._waterStubs) { const { x, y } = GridManager.tileToWorld(w.col, w.row); renderWater(w, x, y, t); }
  }
  ctx.save();
  // ripples round the block while water runs through
  if (fuelled) for (let i = 0; i < 3; i++) {
    const rp = (t * 0.35 + i / 3) % 1;
    ctx.strokeStyle = `rgba(200,240,255,${(0.35 * (1 - rp)).toFixed(3)})`; ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.ellipse(cx, cy, tw * (0.45 + rp * 0.1), th * (0.45 + rp * 0.1), 0, 0, TAU); ctx.stroke();
  }
  F.draw(CoalWaterArt.get('hydroturb_' + k));
  // the Kaplan runner in its pit, turning with the flow
  _hyTurnedAt(CoalWaterArt.get('hydroturb_runner'), F, L.runner, k, fuelled ? t * (1.0 + fillFrac * 2.5) : 0.3);
  // the water in the pit swirling round the runner, foam riding the vortex
  if (fuelled && Camera.zoom > 0.45) {
    const q = _hyRot(L.runner, k), [rx, ry] = F.P(q[0], q[1], q[2] + 0.2), R = (L.runner[3] + 0.25) * M;
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      const a0 = t * (1.2 + fillFrac * 1.6) + i * 0.628, rr = R * (0.72 + 0.26 * ((i * 37) % 10) / 10);
      ctx.strokeStyle = `rgba(225,245,255,${(0.22 + 0.18 * Math.sin(t * 2 + i)).toFixed(3)})`; ctx.lineWidth = (0.8 + (i % 3) * 0.4) * S;
      ctx.beginPath(); ctx.arc(rx, ry, rr, a0, a0 + 0.5 + 0.3 * fillFrac); ctx.stroke();
    }
    ctx.restore();
  }
  // whitewater out of the draft tubes, downstream
  if (fuelled) {
    const dn = _hyRot([0, -1, 0], k);
    for (const o of L.outlets) {
      const [ox, oy] = R(o);
      for (let i = 0; i < 6; i++) {
        const p = (t * 1.1 + i / 6) % 1, sp = (i - 2.5) * 0.15;
        const x = ox + (dn[0] * p * 1.4 + dn[1] * sp) * M, y = oy - (dn[1] * p * 1.4 - dn[0] * sp) * M;
        ctx.fillStyle = `rgba(240,250,255,${(0.7 * (1 - p) * (0.5 + fillFrac * 0.5)).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, (1 + p * 2.2) * S, 0, TAU); ctx.fill();
      }
    }
  }
  // output shaft on its own side, port hub where it always was
  const odc = e._outSideDc || 0, odr = e._outSideDr || 0;
  const side = odr < 0 ? 0 : odc > 0 ? 1 : odr > 0 ? 2 : odc < 0 ? 3 : -1;
  if (side >= 0) {
    F.draw(CoalWaterArt.get('hydroturb_shaft_' + side));
    const portX = odc !== 0 ? (odc > 0 ? px + tw - 8 : px + 8) : cx, portY = odc !== 0 ? cy : (odr > 0 ? py + th - 8 : py + 8);
    _hyPortHub(portX, portY, S, t, fuelled, fillFrac);
  }
  // lamps and the control hut window after dark
  if (on && dark > 0.3) {
    for (const p of L.lamps) {
      const [lx, ly] = R(p), g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 16 * S);
      g.addColorStop(0, `rgba(255,230,160,${(0.45 * dark).toFixed(3)})`); g.addColorStop(1, 'rgba(255,230,160,0)');
      ctx.fillStyle = g; ctx.fillRect(lx - 16 * S, ly - 16 * S, 32 * S, 32 * S);
      ctx.fillStyle = '#fff0c0'; ctx.beginPath(); ctx.arc(lx, ly, 1.2 * S, 0, TAU); ctx.fill();
    }
    const [hx, hy] = R(L.hutWin); ctx.fillStyle = 'rgba(255,214,140,0.85)'; ctx.fillRect(hx - 4 * S, hy - 2.5 * S, 8 * S, 5 * S);
  }
  const lbl = fuelled ? `TURBINE ${Math.round((e._rotationRate || 0) * 100)}% RPM` : on ? 'LOW WATER' : 'NO POWER';
  const [plx, ply] = R(L.plate);
  _wfPlate(lbl, plx, ply, S, fuelled ? '#60e0ff' : '#6a8a98', true);
  if (InspectionPanel.isOpen() && InspectionPanel.target === e) {
    ctx.strokeStyle = '#30d4ff'; ctx.lineWidth = 2 / Camera.zoom; ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 4);
    ctx.strokeRect(px + 1, py + 1, tw - 2, th - 2); ctx.globalAlpha = 1;
  }
  ctx.restore();
  drawNetworkHighlight(e, px, py, t);
}

function _hydroGenArt(e, px, py, t) {
  const L = HYDRO_LAYOUT.gen;
  const tw = (e.width || 7) * TILE, th = (e.height || 7) * TILE, S = TILE / 40, TAU = Math.PI * 2;
  const cx = px + tw / 2, cy = py + th / 2;
  const on = e.powered, rate = e._shaftRate || 0, fuelled = on && rate > 0;
  const idc = e._inSideDc || 0, idr = e._inSideDr || 0;
  const k = idc < 0 ? 0 : idr > 0 ? 1 : idc > 0 ? 2 : idr < 0 ? 3 : 0;
  const dark = DayNight.darkness();
  const F = _cwFrame(L, cx, cy), { P, M } = F;
  const R = p => P(..._hyRot(p, k));
  if (fuelled && Camera.zoom > 0.5) drawGlowHalo(cx, cy, Math.min(tw, th) * 0.55, [[0, '#20d4ff'], [1, 'transparent']], 0.12 + 0.05 * Math.sin(t * 1.5));
  ctx.save();
  F.draw(CoalWaterArt.get('hydrogen_' + k));
  _hyTurnedAt(CoalWaterArt.get('hydrogen_rotor'), F, L.rotor, k, fuelled ? t * (1.5 + rate * 3) : 0.2);
  // the bracket arms, exciter dome and slip rings over the turning rotor
  _hyTurnedAt(CoalWaterArt.get('hydrogen_top'), F, L.rotor, k, 0);
  // HV bus bar live while it generates
  if (fuelled) {
    const [ax, ay] = R(L.bus[0]), [bx, by] = R(L.bus[1]);
    ctx.strokeStyle = `rgba(90,220,255,${(0.35 + 0.2 * Math.sin(t * 6)).toFixed(3)})`; ctx.lineWidth = 2.2 * S;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    for (const p of L.trafos) {
      if (Math.sin(t * 9 + p[1]) <= 0.92) continue;
      const [ix, iy] = R(p);
      ctx.strokeStyle = 'rgba(210,245,255,0.95)'; ctx.lineWidth = 1 * S;
      ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(ix + 3 * S, iy - 3 * S); ctx.lineTo(ix - 1 * S, iy - 6 * S); ctx.stroke();
    }
  }
  // exciter status lamp, kiosk window after dark
  { const [lx, ly] = R(L.lamp); ctx.fillStyle = fuelled ? `rgba(90,255,140,${(0.7 + 0.3 * Math.sin(t * 3)).toFixed(2)})` : on ? '#e0a020' : '#c03020'; ctx.beginPath(); ctx.arc(lx, ly, 1.6 * S, 0, TAU); ctx.fill(); }
  if (on && dark > 0.3) { const [wx, wy] = R(L.kioskWin); ctx.fillStyle = 'rgba(255,214,140,0.85)'; ctx.fillRect(wx - 7 * S, wy - 4 * S, 14 * S, 8 * S); }
  // shaft input hub at the port
  { const [hx, hy] = R(L.input); _hyPortHub(hx, hy, S, t, fuelled, rate); }
  const horizInput = idc !== 0;
  const lbl = fuelled ? `HYDRO  ${formatPower(Math.round(e.def.powerOutput))}` : on ? 'NO SHAFT' : 'OFFLINE';
  const plateY = (!horizInput && idr < 0) ? py + 12 * S : py + th - 10 * S;
  const plateX = horizInput ? cx : cx + tw * 0.25;
  _wfPlate(lbl, plateX, plateY, S, fuelled ? '#40d8ff' : '#6a8a98', true);
  if (InspectionPanel.isOpen() && InspectionPanel.target === e) {
    ctx.strokeStyle = '#20d4ff'; ctx.lineWidth = 2 / Camera.zoom; ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 4);
    ctx.strokeRect(px + 1, py + 1, tw - 2, th - 2); ctx.globalAlpha = 1;
  }
  ctx.restore();
  drawNetworkHighlight(e, px, py, t);
}

function _damArt(e, px, py, t) {
  const L = HYDRO_LAYOUT.dam, S = TILE / 40, TAU = Math.PI * 2;
  const horizontal = e._flowDr !== 0;
  let upSign = horizontal ? (e._flowDr > 0 ? 1 : -1) : (e._flowDc > 0 ? 1 : -1);
  if (e._reservoirSide === 'downstream') upSign = -upSign;
  const k = horizontal ? (upSign > 0 ? 0 : 2) : (upSign > 0 ? 1 : 3);
  const n = horizontal ? e.width : e.height;
  const res = (typeof ReservoirSystem !== 'undefined') ? ReservoirSystem.getReservoir(e._reservoirId) : null;
  const fill = res && res.capacity > 0 ? res.waterLevel / res.capacity : 0;
  const dark = DayNight.darkness();
  const im = CoalWaterArt.get('dam_' + k);
  const up = _hyRot([0, 1, 0], k), dn = [-up[0], -up[1]];
  ctx.save();
  for (let i = 0; i < n; i++) {
    const tcx = px + (horizontal ? (i + 0.5) * TILE : TILE * 0.5 * e.width);
    const tcy = py + (horizontal ? TILE * 0.5 * e.height : (i + 0.5) * TILE);
    const F = _cwFrame(L, tcx, tcy), { P, M } = F;
    // reservoir shimmer against the upstream face
    const [ux, uy] = P(up[0] * 1.0, up[1] * 1.0, 0);
    ctx.fillStyle = `rgba(60,140,200,${(0.25 + 0.08 * Math.sin(t * 1.5 + i)).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(ux, uy, (horizontal ? 1.0 : 0.3) * M, (horizontal ? 0.3 : 1.0) * M, 0, 0, TAU); ctx.fill();
    F.draw(im);
    // spillway whitewater off the downstream foot
    const [sx, sy] = P(dn[0] * 1.05, dn[1] * 1.05, 0);
    for (let q = 0; q < 4; q++) {
      const p = (t * 1.2 + q * 0.37 + i * 0.21) % 1, a = (q - 1.5) * 0.45;
      const x = sx + (dn[0] * p * 0.6 + (horizontal ? a : 0)) * M, y = sy - (dn[1] * p * 0.6 - (horizontal ? 0 : a)) * M;
      ctx.fillStyle = `rgba(240,250,255,${(0.65 * (1 - p)).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, (1 + p * 2) * S, 0, TAU); ctx.fill();
    }
    if (dark > 0.3) {
      const [lx, ly] = P(..._hyRot(L.lamp, k));
      ctx.fillStyle = `rgba(255,230,150,${(0.35 * dark).toFixed(3)})`; ctx.beginPath(); ctx.arc(lx, ly, 5 * S, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff0c0'; ctx.beginPath(); ctx.arc(lx, ly, 1 * S, 0, TAU); ctx.fill();
    }
  }
  // reservoir level gauge on the middle of the crest
  if (res) {
    const mid = Math.floor(n / 2);
    const tcx = px + (horizontal ? (mid + 0.5) * TILE : TILE * 0.5 * e.width), tcy = py + (horizontal ? TILE * 0.5 * e.height : (mid + 0.5) * TILE);
    const [gx, gy] = _cwFrame(L, tcx, tcy).P(..._hyRot([0, 0.7, 2.0], k));
    const bl = 18 * S;
    ctx.fillStyle = '#10181e'; ctx.fillRect(gx - bl / 2 - 1 * S, gy - 1 * S, bl + 2 * S, 4.5 * S);
    ctx.fillStyle = fill < 0.15 ? '#ff6040' : '#40c8ff';
    ctx.fillRect(gx - bl / 2, gy, bl * Math.max(0, Math.min(1, fill)), 2.5 * S);
  }
  ctx.restore();
}

function renderHydroGenerator(e, px, py, t) {
    if (typeof CoalWaterArt !== 'undefined' && CoalWaterArt.ready('hgen')) return _hydroGenArt(e, px, py, t);
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
      ctx.beginPath(); ctx.moveTo(hubR * 0.8, -5 * S); ctx.lineTo(R * 0.9, -3 * S); ctx.lineTo(R * 0.9, 3 * S); ctx.lineTo(hubR * 0.8, 5 * S); ctx.closePath(); _fillMetalG(ctx); ctx.stroke();
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
    if (typeof CoalWaterArt !== 'undefined' && CoalWaterArt.ready('dam')) return _damArt(e, px, py, t);
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
    if (typeof CoalWaterArt !== 'undefined' && CoalWaterArt.ready('hturb')) return _hydroTurbArt(e, px, py, t);
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
      ctx.fillStyle = wg; _fillRectMetalG(ctx, x0, -B, x1 - x0, intakeD);
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
    ctx.fillStyle = '#1a1c20'; strip(-0.5, 0.5, 1.1 * S); _fillMetalG(ctx);
    ctx.fillStyle = '#98a2ac'; strip(-0.5, 0.5, 0); _fillMetalG(ctx);
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
    if (typeof CoalWaterArt !== 'undefined' && CoalWaterArt.ready('shaft') && ((e.width || 3) * (e.height || 1)) === 3) return _shaftArt(e, px, py, t);
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
// The rendered tower (scripts/render_scrubber.py: scrub_0 pump left,
// scrub_1 pump right; radius 1 m, body 6 m). Drawn in three slices so it
// fits any host: the foot and the dome cap at the tower's own scale, the
// body stretched between them to the host's (top, base).
const SCRUB_LAYOUT = { HB: 6.0, rect: [-2.2, 2.2, -1.5, 5.368], pumpX: 1.45 };
function _scrubArt(x, top, base, r, side) {
  if (typeof AdvNukeArt === 'undefined' || (typeof _imageFillsOff !== 'undefined' && _imageFillsOff)) return null;
  const im = AdvNukeArt.get('scrub_' + side); if (!im) return null;
  const TN = Math.tan(Math.PI / 6), [x0, x1, v0, v1] = SCRUB_LAYOUT.rect, HB = SCRUB_LAYOUT.HB, sx = r;
  const vFoot = -1 + 1.2 * TN, vBody = -1 + (HB - 0.3) * TN, vTop = HB * TN + 0.38 * TN;
  const footY = base - (vFoot + 1) * sx, capY = top + (vTop - vBody) * sx;
  if (capY - footY > -2) {   // too short to stretch: one uniform draw
    const k = (base - top) / (vTop + 1);
    ctx.drawImage(im, x + x0 * k, base - (v1 + 1) * k, (x1 - x0) * k, (v1 - v0) * k);
    return v => base - (v + 1) * k;
  }
  const ppm = im.height / (v1 - v0), sy = v => (v1 - v) * ppm, dx = x + x0 * sx, dw = (x1 - x0) * sx;
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.roundRect(x - r + 0.4 * r, top + 0.5 * r, r * 2, base - top, r * 0.6); ctx.fill();
  ctx.drawImage(im, 0, sy(vFoot), im.width, (vFoot - v0) * ppm, dx, footY, dw, (vFoot - v0) * sx);                 // foot
  ctx.drawImage(im, 0, sy(vBody), im.width, (vBody - vFoot) * ppm, dx, capY, dw, footY - capY + 0.5);              // body, stretched
  ctx.drawImage(im, 0, 0, im.width, (v1 - vBody) * ppm, dx, capY - (v1 - vBody) * sx, dw, (v1 - vBody) * sx);       // cap
  return v => v <= vFoot ? base - (v + 1) * sx : v >= vBody ? capY - (v - vBody) * sx : footY + (capY - footY) * (v - vFoot) / (vBody - vFoot);
}
function _scrubberTower(x, top, base, r, S, t, on, pumpSide = 1) {
  const vY = _scrubArt(x, top, base, r, pumpSide < 0 ? 0 : 1);
  if (vY) return _scrubberLive(x, top, base, r, S, t, on, pumpSide, vY);
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

// The live parts over the rendered tower: sight-glass slurry, spray and
// bubbles, the riser's flow, the pump impeller, the beacon and the plate.
function _scrubberLive(x, top, base, r, S, t, on, pumpSide, vY) {
  const TAU = Math.PI * 2, detail = Camera.zoom > 0.45, TN = Math.tan(Math.PI / 6), HB = SCRUB_LAYOUT.HB;
  const gx = x - r * 0.5, gw = r, gy = vY(-1 + HB * 0.70 * TN), gh = vY(-1 + HB * 0.28 * TN) - gy;
  ctx.save(); ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, gw * 0.3); ctx.clip();
  const lvl = gy + gh * 0.68;
  const sg = ctx.createLinearGradient(0, lvl, 0, gy + gh);
  sg.addColorStop(0, on ? '#9ad8e8' : '#4a6a70'); sg.addColorStop(1, on ? '#3a8aa8' : '#23383e');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(gx, gy + gh);
  for (let k = 0; k <= 6; k++) ctx.lineTo(gx + gw * k / 6, lvl + Math.sin(t * 4 + k * 1.3) * (on ? 1.1 : 0.3) * S);
  ctx.lineTo(gx + gw, gy + gh); ctx.closePath(); ctx.fill();
  if (on) {
    for (let k = 0; k < 7; k++) { const p = (t * 1.6 + k * 0.37) % 1, dx = gx + gw * (0.15 + (k * 0.13) % 0.7);
      ctx.fillStyle = `rgba(200,240,255,${0.85 * (1 - p * 0.6)})`; ctx.fillRect(dx, gy + 2 * S + p * (lvl - gy - 3 * S), 0.8 * S, 2.2 * S); }
    for (let k = 0; k < 5; k++) { const p = (t * 0.9 + k * 0.21) % 1;
      ctx.strokeStyle = `rgba(230,250,255,${0.7 * (1 - p)})`; ctx.lineWidth = 0.6 * S;
      ctx.beginPath(); ctx.arc(gx + gw * (0.2 + k * 0.15) + Math.sin(t * 3 + k) * S, gy + gh - 1 * S - p * (gy + gh - lvl), (0.6 + p * 0.9) * S, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = 'rgba(150,230,255,0.35)'; ctx.fillRect(gx, gy, gw, 1.8 * S);
  }
  ctx.restore();
  // riser flow and the pump impeller
  const pmX = x + pumpSide * SCRUB_LAYOUT.pumpX * r, pmY = vY(-0.3 + 0.55 * TN), ry = vY(-0.3 + (HB * 0.7 + 0.1) * TN), rim = x + pumpSide * r;
  if (on) { ctx.strokeStyle = 'rgba(200,245,255,0.9)'; ctx.lineWidth = 0.9 * S; ctx.setLineDash([2 * S, 3 * S]); ctx.lineDashOffset = t * 14 * S;
    ctx.beginPath(); ctx.moveTo(pmX, pmY); ctx.lineTo(pmX, ry); ctx.lineTo(rim, ry); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0; }
  ctx.save(); ctx.translate(pmX, vY(-0.3 + 0.3 * TN) + 0.05 * r); ctx.rotate(on ? t * 9 : 0);
  ctx.strokeStyle = on ? '#b0f0d0' : '#5a7a70'; ctx.lineWidth = 0.9 * S;
  for (let k = 0; k < 3; k++) { ctx.rotate(TAU / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0.3 * r, 0); ctx.stroke(); }
  ctx.restore();
  // beacon on the cap
  const by = vY((HB + 0.68) * TN), lit = on && Math.sin(t * 3) > -0.2;
  ctx.fillStyle = lit ? '#50ff90' : '#1a3a28'; ctx.beginPath(); ctx.arc(x, by, 1.6 * S, 0, TAU); ctx.fill();
  if (lit && detail) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3 + 0.15 * Math.sin(t * 3); ctx.beginPath(); ctx.arc(x, by, 4.5 * S, 0, TAU); ctx.fill(); ctx.restore(); }
  // plate
  if (detail) {
    ctx.font = `bold ${Math.max(3, 3.4 * S)}px Courier New`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = on ? '#70f0a8' : '#4a7a60'; ctx.fillText('SCRUBBER', x, vY(-1 + HB * 0.16 * TN));
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
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
  if (_wfOK(e, 'cc', 10, 8, ['cc_base', 'hyp_fan'])) {   // rendered (end of this file)
    _ccArt(e, px, py, t);
    return;
  }
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
    ctx.fillStyle = hg; _fillRectMetalG(ctx, X(mx), Y(my), mw*S, mh*S);
    ctx.strokeStyle = '#101c18'; ctx.lineWidth = 0.8*S; ctx.strokeRect(X(mx), Y(my), mw*S, mh*S);
    const fx = mx + mw/2, fy = my + 22, fr = 17;
    fans.push([fx, fy, fr]);
    // sorbent bed: honeycomb behind the blades, glowing faintly while it loads
    ctx.save();
    ctx.beginPath(); ctx.arc(X(fx), Y(fy), fr*S, 0, TAU); ctx.clip();
    ctx.fillStyle = '#0c1412'; _fillRectMetalG(ctx, X(fx - fr), Y(fy - fr), fr*2*S, fr*2*S);
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
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(X(cx - r), Y(top), r*2*S, (bot - top)*S, r*S); _fillMetalG(ctx);
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

/* ── Coal generator, coal mine MK1, water extractor: rendered ────────────
   Built and rendered in Blender (scripts/render_coal_water.py, Poly Haven
   scans + procedural brick / slate / timber; same camera as the wind and
   solar sprites). Each frame is centred on the ground point (0, off) metres
   from the footprint's centre, so tall stacks fit. COAL_WATER_LAYOUT is the
   script's LAYOUT (metres; re-paste after a re-render). The painted
   buildings stay as the fallback (image not loaded, withoutImageFills, or a
   generator rotated to 6x5). */
const COAL_WATER_LAYOUT = {
  gen: {"frame":19.0,"off":3.2,"bunker":[-1.6,0.4,9.2,0.75,0.65],"belt":[[-4.55,-5.0,1.4],[-4.55,0.4,9.3],[-2.45,0.4,9.3]],"chimney":[-3.3,3.4,15.45,0.55],"hall":[2.7,-0.6,5.42,2.9,1.1],"steam":[[0.4,-0.4,3.4],[0.8,-0.4,3.4]],"bushings":[[2.7,2.8,2.4],[3.1,2.8,2.4],[3.5,2.8,2.4]],"ashGauge":[3.097,-4.551,2.6,3.9,-1.955],"water":[[0.0,-5.9,0.35],[0.0,-3.4,0.35],[-0.8,-3.4,0.35],[-0.8,-2.4,0.35]],"gaugeFace":[-1.875,-2.495,5.35,0.17],"coalIn":[-4.45,-5.0,0.5,0.45,0.42],"waterIn":[0.0,-5.55,0.95],"windows":[[-3.392,-2.47,1.0,0.78,4.0],[-1.875,-2.47,1.0,0.78,4.0],[-0.358,-2.47,1.0,0.78,4.0]],"gauge":[-1.875,-2.48,5.35],"valve":[-2.55,0.0,7.5],"avLight":[-2.8,3.2,15.5],"vent":[-3.25,-1.12,7.65],"scrubber":[0.0,2.9,10.1],"res":912},
  mine: {"frame":12.5,"off":1.4,"rail":[-2.62,0.2],"lampRoom":{"win":[[-3.15,1.54,1.3],[-2.15,1.54,1.3]],"pipe":[-2.2,2.4,3.6],"door":[-2.55,1.3,0]},"winding":{"win":[[1.5,0.93,1.4],[2.1,0.93,1.4],[2.7,0.93,1.4]],"stack":[3.45,2.4,6.1]},"sheave":{"hub":[0.0,-0.3,6.75],"R":0.6,"u":[0.667,0.745,0.0],"v":[0.0,0.0,1.0],"ropeTo":[1.7,1.1,1.6]},"belt":[[-0.55,-0.6,0.9],[-1.7,-0.95,2.75]],"chute":[-2.3,-1.15,1.1],"lamps":[[-1.4,-1.72,2.12],[1.6,-1.72,2.12]],"frameLamp":[0.55,-0.85,6.0],"heap":[2.2,-1.65],"cage":[0,-0.3,1.45],"cartY":-2.62,"cartRange":[-2.3,1.3],"res":750},
  mine2: {"frame":14.5,"off":0.7,"plantWin":[[-4.85,-0.05,3.6],[-3.93,-0.05,3.6],[-3.01,-0.05,3.6],[-2.09,-0.05,3.6],[-1.17,-0.05,3.6]],"vents":[[-1.6,2.4,5.8],[-2.4,2.4,5.8]],"trafoLed":[-1.5,-2.79,1.0],"silo":[-3.85,-5.0,1.9],"skipShaft":[3.6,-0.5,0.6,7.4],"avLight":[3.6,0.9,10.0],"floods":[[2.3,-0.55,4.51],[4.9,-0.55,4.51]],"sheaves":{"hubs":[[2.95,-0.35,8.9],[4.25,-0.35,8.9]],"R":0.55,"u":[1,0,0],"v":[0,0,1]},"gallery":[[2.45,0.4,6.0],[-0.65,2.2,5.0]],"boomHead":[1.9,-2.7,2.7],"pile":[1.6,-3.1],"railY":-5.0,"res":841},
  water: {"frame":9.4,"off":0.9,"fan":[-0.75,1.3,3.43,0.78],"gauge":[0.9,0.15,1.9,0.22],"beacon":[1.95,2.15,3.24],"intake":[0.0,-1.3,0.55,1.0],"riser":[[0.0,-1.3,1.6],[0.0,0.2,1.6]],"plate":[0,-3.1,0.4],"stub":{"frame":3.4,"off":0.5,"cap":0.0,"z":0.42},"res":658},
};
const _CW_TAN = Math.tan(Math.PI / 6);
// Aviation obstruction lamp: a dark housing and a red lens that flashes
// softly (eases up and down, no hard on / off), its glow added over the
// sprite and growing towards night, a hot core at the peak of each flash.
function _avLamp(x, y, S, t, period = 1.5, detail = true) {
  const TAU = Math.PI * 2, ph = (t % period) / period;
  const k = ph < 0.22 ? Math.sin(ph / 0.22 * Math.PI) ** 2 : 0;
  const dk = typeof DayNight !== 'undefined' ? DayNight.darkness() : 0;
  ctx.save();
  ctx.fillStyle = 'rgba(20,14,12,0.9)'; ctx.beginPath(); ctx.arc(x, y + 0.25 * S, 1.35 * S, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgb(${Math.round(96 + 159 * k)},${Math.round(22 + 48 * k)},${Math.round(16 + 30 * k)})`;
  ctx.beginPath(); ctx.arc(x, y, 0.95 * S, 0, TAU); ctx.fill();
  if (k > 0.02 && detail) {
    ctx.globalCompositeOperation = 'lighter';
    const r = (2.6 + 4.5 * dk) * S, g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,60,36,${(k * (0.35 + 0.4 * dk)).toFixed(3)})`);
    g.addColorStop(0.4, `rgba(255,40,24,${(k * (0.12 + 0.18 * dk)).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,30,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    if (k > 0.5) { ctx.fillStyle = `rgba(255,220,200,${((k - 0.5) * 1.2).toFixed(3)})`; ctx.beginPath(); ctx.arc(x - 0.2 * S, y - 0.2 * S, 0.4 * S, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
}
const CoalWaterArt = (() => {
  const ims = new Map();
  let failed = false;
  const NEED = {
    gen: ['coalgen_base', 'coalgen_scrubber', 'coalgen_ash_0', 'coalgen_ash_1', 'coalgen_ash_2', 'coalgen_ash_3'],
    mine: ['coalmine1_base', 'coalmine1_heap_0', 'coalmine1_heap_1', 'coalmine1_heap_2', 'coalmine1_heap_3',
           'coalmine1_sheave', 'coalmine1_cage', 'coalmine1_cart', 'coalmine1_cart_full'],
    mine2: ['coalmine2_base', 'coalmine2_heap_0', 'coalmine2_heap_1', 'coalmine2_heap_2', 'coalmine2_heap_3',
            'coalmine2_sheave_0', 'coalmine2_sheave_1', 'coalmine2_skip', 'coalmine2_wagon', 'coalmine2_wagon_full'],
    hturb: ['hydroturb_0', 'hydroturb_1', 'hydroturb_2', 'hydroturb_3', 'hydroturb_runner',
            'hydroturb_shaft_0', 'hydroturb_shaft_1', 'hydroturb_shaft_2', 'hydroturb_shaft_3'],
    hgen: ['hydrogen_0', 'hydrogen_1', 'hydrogen_2', 'hydrogen_3', 'hydrogen_rotor', 'hydrogen_top'],
    dam: ['dam_0', 'dam_1', 'dam_2', 'dam_3'],
    rs1: ['rs1_base', 'rsdome_0', 'rsdome_1', 'rsdome_2', 'rsdome_3', 'rsdome_4', 'rsdome_5', 'rsdome_6', 'rsdome_7', 'rsdome_8', 'rsdome_9', 'rsdome_10', 'rsdome_11', 'rsdome_12', 'rsdome_13', 'rsdome_14', 'rsdome_15'],
    rs2: ['rs2_base', 'rsdome_0', 'rsdome_1', 'rsdome_2', 'rsdome_3', 'rsdome_4', 'rsdome_5', 'rsdome_6', 'rsdome_7', 'rsdome_8', 'rsdome_9', 'rsdome_10', 'rsdome_11', 'rsdome_12', 'rsdome_13', 'rsdome_14', 'rsdome_15', 'rsdish_0', 'rsdish_1', 'rsdish_2', 'rsdish_3', 'rsdish_4', 'rsdish_5', 'rsdish_6', 'rsdish_7', 'rsdish_8', 'rsdish_9', 'rsdish_10', 'rsdish_11', 'rsdish_12', 'rsdish_13', 'rsdish_14', 'rsdish_15'],
    rs3: ['rs3_base', 'rsdome_0', 'rsdome_1', 'rsdome_2', 'rsdome_3', 'rsdome_4', 'rsdome_5', 'rsdome_6', 'rsdome_7', 'rsdome_8', 'rsdome_9', 'rsdome_10', 'rsdome_11', 'rsdome_12', 'rsdome_13', 'rsdome_14', 'rsdome_15', 'rsdish_0', 'rsdish_1', 'rsdish_2', 'rsdish_3', 'rsdish_4', 'rsdish_5', 'rsdish_6', 'rsdish_7', 'rsdish_8', 'rsdish_9', 'rsdish_10', 'rsdish_11', 'rsdish_12', 'rsdish_13', 'rsdish_14', 'rsdish_15'],
    rs4: ['rs4_base', 'rsdome_0', 'rsdome_1', 'rsdome_2', 'rsdome_3', 'rsdome_4', 'rsdome_5', 'rsdome_6', 'rsdome_7', 'rsdome_8', 'rsdome_9', 'rsdome_10', 'rsdome_11', 'rsdome_12', 'rsdome_13', 'rsdome_14', 'rsdome_15', 'rsdish_0', 'rsdish_1', 'rsdish_2', 'rsdish_3', 'rsdish_4', 'rsdish_5', 'rsdish_6', 'rsdish_7', 'rsdish_8', 'rsdish_9', 'rsdish_10', 'rsdish_11', 'rsdish_12', 'rsdish_13', 'rsdish_14', 'rsdish_15'],
    rs5: ['rs5_base', 'rsdome_0', 'rsdome_1', 'rsdome_2', 'rsdome_3', 'rsdome_4', 'rsdome_5', 'rsdome_6', 'rsdome_7', 'rsdome_8', 'rsdome_9', 'rsdome_10', 'rsdome_11', 'rsdome_12', 'rsdome_13', 'rsdome_14', 'rsdome_15', 'rsdish_0', 'rsdish_1', 'rsdish_2', 'rsdish_3', 'rsdish_4', 'rsdish_5', 'rsdish_6', 'rsdish_7', 'rsdish_8', 'rsdish_9', 'rsdish_10', 'rsdish_11', 'rsdish_12', 'rsdish_13', 'rsdish_14', 'rsdish_15'],
    sp1: ['sp1_base'],
    sp2: ['sp2_base'],
    sp3: ['sp3_base'],
    ss1: ['ss1_base'],
    ss2: ['ss2_base'],
    ss3: ['ss3_base'],
    ss4: ['ss4_base', 'ss4_gyro_0', 'ss4_gyro_1', 'ss4_gyro_2', 'ss4_gyro_3', 'ss4_gyro_4', 'ss4_gyro_5', 'ss4_gyro_6', 'ss4_gyro_7', 'ss4_gyro_8', 'ss4_gyro_9', 'ss4_gyro_10', 'ss4_gyro_11', 'ss4_gyro_12', 'ss4_gyro_13', 'ss4_gyro_14', 'ss4_gyro_15', 'ss4_gyro_16', 'ss4_gyro_17', 'ss4_gyro_18', 'ss4_gyro_19', 'ss4_gyro_20', 'ss4_gyro_21', 'ss4_gyro_22', 'ss4_gyro_23'],
    ss5: ['ss5_base', 'ss5_arm_0', 'ss5_arm_1', 'ss5_arm_2', 'ss5_arm_3', 'ss5_arm_4', 'ss5_arm_5', 'ss5_arm_6', 'ss5_arm_7', 'ss5_arm_8', 'ss5_arm_9', 'ss5_arm_10', 'ss5_arm_11', 'ss5_arm_12', 'ss5_arm_13', 'ss5_arm_14', 'ss5_arm_15', 'ss5_arm_16', 'ss5_arm_17', 'ss5_arm_18', 'ss5_arm_19', 'ss5_arm_20', 'ss5_arm_21', 'ss5_arm_22', 'ss5_arm_23'],
    pole: ['pole_base_0', 'pole_base_1', 'pole_foot', 'pole_pier', 'pole_guy_0', 'pole_guy_1', 'pole_xf_0', 'pole_xf_1'],
    tower: ['tower_base', 'tower_dmg', 'tower_feet', 'tower_piers'],
    nr: ['nr_base', 'nr_crane'],
    ct: ['ct_base'],
    st: ['st_base'],
    um: ['um_base_0', 'um_base_1', 'um_cart'],
    fp: ['fp_base'],
    cp: ['cp_0', 'cp_1', 'cp_2', 'cp_3'],
    nw: ['nw_base', 'nw_cask', 'nw_crane', 'nw_cart'],
    fg: ['fg_base', 'fg_fan', 'fg_guard', 'fg_scrubber'],
    ref: ['ref_base', 'ref_roof'],
    sb: ['sb_base_0', 'sb_base_1', 'sb_heap_0_0', 'sb_heap_0_1', 'sb_heap_0_2', 'sb_heap_0_3', 'sb_heap_0_4', 'sb_heap_0_5', 'sb_heap_0_6', 'sb_heap_0_7', 'sb_heap_1_0', 'sb_heap_1_1', 'sb_heap_1_2', 'sb_heap_1_3', 'sb_heap_1_4', 'sb_heap_1_5', 'sb_heap_1_6', 'sb_heap_1_7'],
    shaft: ['shaft_h', 'shaft_v'],
    bat: ['bat_base'],
    cs1: ['cs1_base', 'cs1_closed', 'cs1_open'],
    cs2: ['cs2_base', 'cs2_closed', 'cs2_open'],
    mon1: ['mon1_base', 'rsdish_0'],
    mon2: ['mon2_base', 'rsdish_0'],
    pipe: ['pipe_0', 'pipe_1', 'pipe_2', 'pipe_3', 'pipe_4', 'pipe_5', 'pipe_6', 'pipe_7', 'pipe_8', 'pipe_9', 'pipe_10', 'pipe_11', 'pipe_12', 'pipe_13', 'pipe_14', 'pipe_15'],
    belt: ['belt_0', 'belt_1', 'belt_2', 'belt_3', 'belt_4', 'belt_5', 'belt_6', 'belt_7', 'belt_8', 'belt_9', 'belt_10', 'belt_11', 'belt_12', 'belt_13', 'belt_14', 'belt_15'],
    udgp: ['udgp_pad', 'udg_earth_n', 'udg_earth_s', 'udg_earth_w', 'udg_earth_e', 'udgp_0', 'udgp_1', 'udgp_2', 'udgp_3', 'udgp_4', 'udgp_8', 'udgp_12'],
    udgb: ['udgb_h0', 'udgb_h4', 'udgb_h8', 'udgb_h12', 'udgb_v0', 'udgb_v1', 'udgb_v2', 'udgb_v3'],
    rod1: ['rod1_base'],
    rod2: ['rod2_base'],
    rod3: ['rod3_base'],
    wire: ['wire_h', 'wire_v', 'wire_tie_h', 'wire_tie_v', 'wire_box', 'wire_gland_right', 'wire_gland_left', 'wire_gland_bottom', 'wire_gland_top'],
    port: ['right', 'left', 'bottom', 'top'].flatMap(f => ['pipe', 'band', 'blind', 'dock'].map(k => `port_${k}_${f}`)),
    water: ['waterx_base', 'waterx_fan', 'waterx_fanguard', 'waterx_stub_0', 'waterx_stub_1', 'waterx_stub_2', 'waterx_stub_3'],
  };
  function get(name) {
    if (failed) return null;
    let im = ims.get(name);
    if (!im) {
      im = new Image();
      im.onerror = () => { failed = true; };
      im.src = `img/${name}.png`;
      ims.set(name, im);
    }
    return im.complete && im.naturalWidth ? im : null;
  }
  return {
    get,
    ready(kind) {
      if (_imageFillsOff) return false;
      let ok = true;
      for (const n of NEED[kind]) if (!get(n)) ok = false;
      return ok;
    },
  };
})();
// Projection and frame for a sprite of layout L centred on footprint centre
// (cx, cy), scaled kx, ky (1 = authored size).
function _cwFrame(L, cx, cy, kx = 1, ky = 1) {
  const M = 20 * (TILE / 40);
  const P = (x, y, z) => [cx + x * M * kx, cy - (y + z * _CW_TAN) * M * ky];
  const D = (x, y, z) => [x * M * kx, -(y + z * _CW_TAN) * M * ky];
  const fw = L.frame * M * kx, fh = L.frame * M * ky;
  const fx = cx - fw / 2, fy = cy - L.off * M * ky - fh / 2;
  return { M, P, D, fx, fy, fw, fh, draw: (im, dx = 0, dy = 0) => { if (im) ctx.drawImage(im, fx + dx, fy + dy, fw, fh); } };
}
// A frame-sized sprite turned by th in a plane whose axes show on screen as
// u, v ([[ux, uy], [vx, vy]]), about (ox, oy). As _windTurned, any frame size.
function _cwTurned(im, A, th, ox, oy, F) {
  const [[a, b], [c, d]] = A, det = a * d - b * c;
  if (!im || Math.abs(det) < 1e-6) return;
  const co = Math.cos(th), si = Math.sin(th);
  const r00 = a * co + c * si, r01 = -a * si + c * co, r10 = b * co + d * si, r11 = -b * si + d * co;
  const i00 = d / det, i01 = -c / det, i10 = -b / det, i11 = a / det;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.transform(r00 * i00 + r01 * i10, r10 * i00 + r11 * i10, r00 * i01 + r01 * i11, r10 * i01 + r11 * i11, 0, 0);
  ctx.drawImage(im, F.fx - ox, F.fy - oy, F.fw, F.fh);
  ctx.restore();
}
function _cwAlong(P, pts, f) {
  let tot = 0; const seg = [];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); seg.push(d); tot += d; }
  let d = f * tot;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? Math.min(1, d / seg[i]) : 0, a = pts[i], b = pts[i + 1];
      return P(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
    }
    d -= seg[i];
  }
  return P(...pts[0]);
}

function _coalGenArt(e, px, py, t) {
  const L = COAL_WATER_LAYOUT.gen;
  const w = 5 * TILE, h = 6 * TILE, S = TILE / 40, TAU = Math.PI * 2;
  const on = e._fuelled && e._hasWater && e.powered;
  const ash = Math.min(1, (e._ashWaste || 0) / 100);
  const throttle = e._cgThrottle || 'normal';
  const pressure = Math.max(0, Math.min(1, e._cgPressure || 0));
  const critical = e._cgState === 'critical';
  const blink = Math.sin(t * 9) > 0;
  const fire = !on ? 0 : (throttle === 'overdrive' ? 1 : throttle === 'eco' ? 0.55 : 0.8) * (e._cgState === 'warming' ? 0.7 : 1);
  const hopFill = Math.min(1, (e._hopperCoal || 0) / (30 * EntityDefs[T.COALGENERATOR].coalPerSecond));
  const detail = Camera.zoom > 0.5;
  const lerpN = (a, b, k) => Math.round(a + (b - a) * k);
  const Sp = SplitPhase.wantStatic(), Ap = SplitPhase.wantOver();
  const F = _cwFrame(L, px + w / 2, py + h / 2), { P, M } = F;
  const wTiles = 5, waterX = px + Math.floor(wTiles / 2) * TILE + TILE / 2;
  ctx.save();
  if (Sp) {
    // furnace glow round the boiler house
    if ((on || critical) && Camera.zoom > 0.5) {
      const [gx, gy] = P(-1.9, -2.5, 2.5);
      ctx.save(); ctx.globalAlpha = critical ? 0.16 + 0.10 * Math.sin(t * 7) : 0.06 + 0.07 * fire;
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, w * 0.6);
      g.addColorStop(0, critical ? '#ff3010' : '#ff7020'); g.addColorStop(1, 'rgba(255,100,20,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gx, gy, w * 0.6, 0, TAU); ctx.fill();
      ctx.restore();
    }
    F.draw(CoalWaterArt.get('coalgen_base'));
    if (e._scrubber) F.draw(CoalWaterArt.get('coalgen_scrubber'));
    // the tall windows lit by the furnace
    if (fire > 0 || critical) L.windows.forEach(([x, y, z0, ww, hh], i) => {
      const [x0, yb] = P(x - ww / 2, y, z0), [x1, yt] = P(x + ww / 2, y, z0 + hh);
      const r = (x1 - x0) / 2;
      ctx.beginPath(); ctx.moveTo(x0, yb); ctx.lineTo(x0, yt + r); ctx.arc(x0 + r, yt + r, r, Math.PI, 0); ctx.lineTo(x1, yb); ctx.closePath();
      let g;
      if (critical) {
        const k = 0.6 + 0.4 * Math.sin(t * 11 + i * 1.7);
        g = ctx.createLinearGradient(0, yt, 0, yb); g.addColorStop(0, `rgba(255,${lerpN(120, 220, k)},${lerpN(60, 140, k)},0.9)`); g.addColorStop(1, 'rgba(224,40,16,0.9)');
      } else {
        const k = Math.max(0, Math.min(1, fire + 0.08 * Math.sin(t * 3.1 + i * 2) + 0.05 * Math.sin(t * 7.3 + i)));
        g = ctx.createLinearGradient(0, yt, 0, yb);
        g.addColorStop(0, `rgba(255,${lerpN(150, 236, k)},${lerpN(60, 170, k)},0.85)`); g.addColorStop(1, `rgba(${lerpN(150, 230, k)},${lerpN(50, 84, k)},16,0.85)`);
      }
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(40,24,14,0.7)'; ctx.lineWidth = 0.6 * S;
      ctx.beginPath(); ctx.moveTo((x0 + x1) / 2, yt); ctx.lineTo((x0 + x1) / 2, yb);
      for (let k = 1; k < 4; k++) { const ly = yt + r + (yb - yt - r) * k / 4; ctx.moveTo(x0, ly); ctx.lineTo(x1, ly); }
      ctx.stroke();
    });
    // (the roof bunker's coal is part of the rendered sprite)
    // boiler pressure gauge (modelled dial): only the needle is drawn, thin
    // and dark, sweeping into the painted red zone as pressure climbs
    {
      const [gx, gy, gz, gr] = L.gaugeFace, [gX, gY] = P(gx, gy, gz), R = gr * M;
      const A0 = Math.PI * 0.8, A1 = Math.PI * 2.1, ang = v => A0 + v * (A1 - A0);
      const nv = Math.min(1, pressure + (on ? Math.sin(t * 23) * 0.012 : 0));
      ctx.strokeStyle = critical && blink ? '#b01808' : 'rgba(30,26,22,0.9)'; ctx.lineWidth = 0.55 * S; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(gX, gY); ctx.lineTo(gX + Math.cos(ang(nv)) * R * 0.9, gY + Math.sin(ang(nv)) * R * 0.9); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = 'rgba(40,32,22,0.9)'; ctx.beginPath(); ctx.arc(gX, gY, 0.5 * S, 0, TAU); ctx.fill();
      if (critical && blink) { ctx.fillStyle = 'rgba(255,60,30,0.25)'; ctx.beginPath(); ctx.arc(gX, gY, R * 1.6, 0, TAU); ctx.fill(); }
    }
    // turbine hall skylight, warm while it runs
    if (on) {
      const [x, y, z, sw, sd] = L.hall;
      const a = P(x - sw / 2, y - sd / 2, z), b = P(x + sw / 2, y + sd / 2, z);
      ctx.fillStyle = `rgba(255,220,150,${(0.35 + 0.15 * Math.sin(t * 1.5)).toFixed(3)})`;
      ctx.fillRect(a[0], b[1], b[0] - a[0], a[1] - b[1]);
    }
    // ash under the silo's chute (rendered heaps by fill), and the level in
    // its sight glass: a muted grey column, amber near full, blinking red full
    if (ash > 0.02) F.draw(CoalWaterArt.get('coalgen_ash_' + Math.min(3, Math.floor(ash * 4))));
    if (ash > 0.01) {
      const [gx, gy, z0, z1, ga] = L.ashGauge, sx = -Math.sin(ga) * 0.07, sy = Math.cos(ga) * 0.07, zt = z0 + (z1 - z0) * ash;
      const q = [[gx - sx, gy - sy, z0], [gx + sx, gy + sy, z0], [gx + sx, gy + sy, zt], [gx - sx, gy - sy, zt]];
      ctx.beginPath(); q.forEach((pt, i) => { const [x, y] = P(...pt); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath();
      ctx.fillStyle = ash >= 1 ? (blink ? 'rgba(220,60,30,0.85)' : 'rgba(120,30,16,0.8)') : ash > 0.8 ? 'rgba(200,150,60,0.7)' : 'rgba(168,164,154,0.62)';
      ctx.fill();
    }
    // safety valve venting on over-pressure (or a legacy trip)
    if (critical || (!on && (e._cgTrip || 0) > 0)) {
      const [vx, vy] = P(...L.valve);
      for (let i = 0; i < 8; i++) {
        const p = (t * 1.4 + i / 8) % 1;
        ctx.fillStyle = `rgba(240,242,245,${0.75 * (1 - p)})`;
        ctx.beginPath(); ctx.arc(vx + Math.sin(i * 1.7 + t * 3) * 2 * S + p * 6 * S, vy - p * 30 * S, (2 + p * 9) * S, 0, TAU); ctx.fill();
      }
    }
    _coalGenPorts(e, px, py, w, h, S, t, on, waterX, { P, M, coalIn: L.coalIn, waterIn: L.waterIn });
  }
  if (Ap) {
    const [chX, chTop] = P(L.chimney[0], L.chimney[1], L.chimney[2]), ctw = L.chimney[3] * M;
    if (on && e._scrubber) {
      ctx.fillStyle = `rgba(255,170,90,${0.12 + 0.08 * Math.sin(t * 6)})`; ctx.beginPath(); ctx.ellipse(chX, chTop, ctw * 0.8, ctw * 0.3, 0, 0, TAU); ctx.fill();
      _scrubberVapour(chX, chTop, S, t, throttle === 'overdrive' ? 7 : throttle === 'eco' ? 4 : 5, throttle === 'overdrive' ? 1.15 : 1);
    } else if (on) {
      const puffs = throttle === 'overdrive' ? 10 : throttle === 'eco' ? 4 : 7;
      const soot = throttle === 'overdrive' ? 40 : throttle === 'eco' ? -25 : 0;
      const size = throttle === 'overdrive' ? 1.25 : throttle === 'eco' ? 0.8 : 1;
      ctx.fillStyle = `rgba(255,120,40,${0.3 + 0.2 * Math.sin(t * 6)})`; ctx.beginPath(); ctx.ellipse(chX, chTop, ctw * 0.8, ctw * 0.3, 0, 0, TAU); ctx.fill();
      for (let i = 0; i < puffs; i++) {
        const p = (t * 0.3 + i / puffs) % 1;
        ctx.fillStyle = `rgba(${lerpN(90 - soot, 150 - soot, p)},${lerpN(84 - soot, 144 - soot, p)},${lerpN(76 - soot, 136 - soot, p)},${0.6 * (1 - p)})`;
        ctx.beginPath(); ctx.arc(chX + Math.sin(i * 2.1 + t) * 3 * S + p * 18 * S, chTop - 3 * S - p * 40 * S, (4 + p * 14) * size * S, 0, TAU); ctx.fill();
      }
    }
    { const [lx, ly] = P(...L.avLight); _avLamp(lx, ly, S, t, 1.5, detail); }
    if (on && detail) {
      // (the coal rides inside the covered gallery: it is in the render, not drawn here)
      L.bushings.forEach(([x, y, z], k) => {
        if (Math.sin(t * 11 + k * 2.3) <= 0.9) return;
        const [ix, iy] = P(x, y, z);
        ctx.strokeStyle = 'rgba(210,245,255,0.95)'; ctx.lineWidth = 1.1 * S;
        ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(ix + 3 * S, iy - 3 * S); ctx.lineTo(ix - 1 * S, iy - 6 * S); ctx.stroke();
      });
    }
  }
  ctx.restore();
  if (Ap) drawNetworkHighlight(e, px, py, t);
}

// Status plate and the Coal IN / Water IN ports, shared by the painted and
// rendered generator (cut out of renderCoalGenerator unchanged).
function _coalGenPorts(e, px, py, w, h, S, t, on, waterX, art) {
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
        if (art) {
          // rendered: coal in the modelled pit and the status lamp on its lip
          const [, , , rx, ry] = art.coalIn, [ax, ay] = art.P(art.coalIn[0], art.coalIn[1], art.coalIn[2]);
          if (connected) {
            ctx.fillStyle = '#0e0e10'; ctx.beginPath(); ctx.ellipse(ax, ay, rx * art.M * 0.9, ry * art.M * 0.75, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'rgba(150,150,160,0.5)';
            for (let j = 0; j < 6; j++) ctx.fillRect(ax + (j - 2.5) * rx * art.M * 0.28, ay + ((j % 3) - 1) * ry * art.M * 0.3, 0.9*S, 0.9*S);
          }
          const [lx, ly] = art.P(art.coalIn[0] + 0.55, art.coalIn[1] - 0.53, 0.66);
          ctx.fillStyle = connected ? accent : '#2a2c30';
          ctx.beginPath(); ctx.arc(lx, ly, 1.5*S, 0, Math.PI*2); ctx.fill();
          if (connected) { ctx.globalAlpha = 0.35 + 0.2*Math.sin(t*3); ctx.beginPath(); ctx.arc(lx, ly, 3.5*S, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }
          if (typeof _portReady === 'function' && _portReady())
            _portBeltArt({ face: 'left', x: px, y: gy, dx: -1, dy: 0 }, S, t, { belt: accent, on: connected, out: false });
          return;
        }
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
        if (art) {
          if (typeof _portReady === 'function' && _portReady()) {
            _portPipeArt({ face: 'bottom', x: sx, y: py + h, dx: 0, dy: 1 }, S, t, { fluid: '#5ac0ff', on: con, out: false, flow: con && e.powered });
          } else if (con && e.powered) {
            const p = (t*0.8) % 1, [vx2, vy2] = art.P(art.waterIn[0], art.waterIn[1] - 0.3, 0.4 + p * 0.3);
            ctx.fillStyle = `rgba(160,220,255,${0.9*(1 - p)})`; ctx.beginPath(); ctx.arc(vx2, vy2, 0.9*S, 0, Math.PI*2); ctx.fill();
          }
          tag('WATER IN', sx, bot - 20*S, 'center', blue, con);
        } else {
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

    }
}

function renderCoalGenerator(e, px, py, t) {
    if (RenderSplit.wholePass(e, () => renderCoalGenerator(e, px, py, t))) return;
    if ((e.width || 5) === 5 && (e.height || 6) === 6 && CoalWaterArt.ready('gen')) return _coalGenArt(e, px, py, t);
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
    // Static/animated split (spec after this function): Sp the baked plant,
    // Ap the chimney's smoke and glow, its aviation light and the network
    // highlight.
    const Sp = SplitPhase.wantStatic(), Ap = SplitPhase.wantOver();
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
    const chX = px + w*0.15, chTop = py + 3*S, chBase = bhY + 2*S;
    const cbw = 12*S, ctw = 7.5*S;
    if (Sp) {
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
    const chPath = (ox, oy) => { ctx.beginPath(); ctx.moveTo(chX - cbw + ox, chBase + oy); ctx.lineTo(chX + cbw + ox, chBase + oy); ctx.lineTo(chX + ctw + ox, chTop + oy); ctx.lineTo(chX - ctw + ox, chTop + oy); ctx.closePath(); };
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; chPath(6*S, 6*S); ctx.fill();
    ctx.fillStyle = hgrad(chX - cbw, chX + cbw, ['#bcb8b0', '#ece8e0', '#d4d0c8', '#76726a']);
    chPath(0, 0); _fillMetalG(ctx);
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
    }   // Sp
    // aviation light
    const avOn = Math.sin(t * 3) > 0.3;
    if (Ap) {
    ctx.fillStyle = avOn ? '#ff3020' : '#5a1810';
    ctx.beginPath(); ctx.arc(chX + ctw - 0.5*S, chTop - 1.5*S, 1.4*S, 0, TAU); ctx.fill();
    if (avOn && detail) { ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(chX + ctw - 0.5*S, chTop - 1.5*S, 3.5*S, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    }

    // ── Boiler house ──
    const rfY = bhY - 8*S;
    if (Sp) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bhX + 5*S, bhY + 6*S, bhW, bhH);
    ctx.fillStyle = hgrad(bhX, bhX + bhW, ['#a4583c', '#8a4630', '#663222']);
    _fillRectMetalG(ctx, bhX, bhY, bhW, bhH);
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
    }   // Sp

    // ── Chimney top: smoke follows the throttle ──
    if (!Ap) { /* baked pass: the smoke is drawn live */ }
    else if (on && e._scrubber) {
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
    if (Sp) {
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
    _fillRectMetalG(ctx, thX, thY, thW, thH);
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

    _coalGenPorts(e, px, py, w, h, S, t, on, waterX);
    }   // Sp

    ctx.restore();
    if (Ap) drawNetworkHighlight(e, px, py, t);
  }

/* Static/animated split for the coal generator, zoomed out (SPLIT_FAR_ZOOM,
   where the sprite already drops its fine detail and furnace glow). Live:
   the chimney's smoke (or scrubbed vapour) and the glow in its mouth, the
   aviation light, and the network highlight. Baked: the furnace-lit windows'
   flicker, the conveyor's coal, the turbine hall's pulses and the gauges,
   a pixel or so across there. Closer in, or with the boiler critical or
   tripped (alarms, the safety valve venting), it is baked whole. */
RenderSplit.register(T.COALGENERATOR, {
  whole(e) {
    const on = e._fuelled && e._hasWater && e.powered;
    return Camera.zoom > SPLIT_FAR_ZOOM || e._cgState === 'critical' || (!on && (e._cgTrip || 0) > 0);
  },
  key(e) {
    const hop = Math.min(1, (e._hopperCoal || 0) / (30 * EntityDefs[T.COALGENERATOR].coalPerSecond));
    const ash = Math.min(1, (e._ashWaste || 0) / 100);
    return (e._fuelled ? 'f' : '-') + (e._hasWater ? 'w' : '-') + (e.powered ? 'p' : '-') + (e._waterShort ? 's' : '-')
      + (e._scrubber ? 'S' : '-') + (e._coalInConnected ? 'c' : '-') + (e._waterInConnected ? 'i' : '-')
      + (e._decommissioned ? 'd' : '-') + (e._cgThrottle || 'normal') + (e._cgState || '')
      + Math.round(hop * 4) + (hop < 0.1 ? 'e' : '') + Math.round(ash * 8);
  },
});

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
  _smokeColumn(x, y, S, t, rgb, alpha * dens, reach, key);
}

// ── Smoke billows ───────────────────────────────────────────────────────
// Built the way the cooling towers' steam is (CoolingTowerPlume,
// render_oil_nuclear.js): one pre-shaded cauliflower billow per smoke
// colour (lit at the upper left, shaded grey underneath), stamped many
// times at growing sizes, oldest first so the young billows boil up over
// the column they push. It leans with the wind as it climbs and thins at
// the top. These replaced flat translucent discs, which read as floating
// circles. `reach` 0..1 is how far up the column has built.
const _SMOKE_SPRITES = new Map();
function _smokeSprite(rgb) {
  let c = _SMOKE_SPRITES.get(rgb);
  if (c) return c;
  const [r, g, b] = rgb.split(',').map(Number), lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
  const lift = k => [r, g, b].map(v => Math.round(v + (255 - v) * k)).join(',');
  const sink = k => [r, g, b].map(v => Math.round(v * k)).join(',');
  const N = 96; c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d'), s = N / 128;
  const blob = (bx, by, br, a) => {
    const gr = x.createRadialGradient(bx * s, by * s, 0, bx * s, by * s, br * s);
    gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.55, `rgba(${rgb},${a * 0.9})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = gr; x.beginPath(); x.arc(bx * s, by * s, br * s, 0, Math.PI * 2); x.fill();
  };
  blob(64, 66, 50, 1);
  for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2 + 0.4; blob(64 + Math.cos(a) * 30, 66 + Math.sin(a) * 28, 26 + (k % 3) * 4, 0.9); }
  x.globalCompositeOperation = 'source-atop';
  const sh = x.createRadialGradient(84 * s, 92 * s, 4 * s, 76 * s, 84 * s, 70 * s);
  sh.addColorStop(0, `rgba(${sink(lum > 0.5 ? 0.55 : 0.45)},0.6)`); sh.addColorStop(1, `rgba(${sink(0.8)},0)`);
  x.fillStyle = sh; x.fillRect(0, 0, N, N);
  const hl = x.createRadialGradient(46 * s, 42 * s, 2 * s, 50 * s, 46 * s, 46 * s);
  hl.addColorStop(0, `rgba(${lift(lum > 0.5 ? 0.85 : 0.45)},0.85)`); hl.addColorStop(1, `rgba(${lift(0.5)},0)`);
  x.fillStyle = hl; x.fillRect(0, 0, N, N);
  _SMOKE_SPRITES.set(rgb, c);
  return c;
}
const _smokeOrder = [];
function _smokeColumn(x, y, S, t, rgb, alpha, reach = 1, seedKey = '') {
  if (alpha <= 0.005) return;
  const sprite = _smokeSprite(rgb);
  let seed = 0; for (let i = 0; i < seedKey.length; i++) seed = (seed * 31 + seedKey.charCodeAt(i)) % 997;
  seed /= 997;
  const ws = typeof WindState !== 'undefined' ? (WindState.trendSpeed ?? 0.3) : 0.3;
  const wd = typeof WindState !== 'undefined' && WindState.dir !== undefined ? Math.cos(WindState.dir) : 1;
  const N = Camera.zoom > 0.5 ? 14 : 8, rise = 50 * S * (1 - 0.25 * ws), lean = (14 + 30 * ws) * S * (wd >= 0 ? 1 : -1) * (0.4 + 0.6 * Math.abs(wd));
  _smokeOrder.length = 0;
  for (let i = 0; i < N; i++) { const q = Math.sin(i * 78.233 + seed * 13.7) * 43758.5453; _smokeOrder.push([((t * 0.3) + (i + (q - Math.floor(q)) * 0.8) / N + seed) % 1, i]); }
  _smokeOrder.sort((a, b) => b[0] - a[0]);
  const a0 = ctx.globalAlpha;
  for (let n = 0; n < N; n++) {
    const [ph, i] = _smokeOrder[n];
    const head = reach >= 1 ? 1 : Math.max(0, Math.min(1, (reach - ph) / 0.2));
    if (head <= 0) continue;
    const k = Math.sin(i * 12.9898 + seed * 71.1) * 43758.5453, j = k - Math.floor(k);
    const drift = Math.pow(ph, 1.5);
    const bx = x + (j - 0.5) * 9 * S * (0.4 + ph) + Math.sin(t * 0.4 + i * 2.1) * 4 * S * ph + lean * drift;
    const by = y - Math.pow(ph, 0.85) * rise + (Math.cos(i * 4.7 + seed) * 3 * S * ph);
    const r = (4 + 14 * Math.pow(ph, 0.7)) * S * (0.75 + 0.5 * j);
    const fade = ph < 0.35 ? 1 : Math.pow(1 - (ph - 0.35) / 0.65, 1.5);
    const a = alpha * 0.85 * fade * Math.min(1, 0.35 + ph / 0.15) * head;
    if (a <= 0.01) continue;
    ctx.globalAlpha = a0 * Math.min(1, a);
    ctx.drawImage(sprite, bx - r * 1.15, by - r * 1.15, r * 2.3, r * 2.3);
  }
  ctx.globalAlpha = a0;
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
  // A gunmetal nameplate fixed to the plant: brushed face, a bevel catching
  // the light along its top, corner rivets, the accent as a thin edge, and
  // LED lettering that glows only while it runs. (It used to be a black pill
  // with a bright outline, which floated over the model instead of sitting
  // on it.)
  ctx.save();
  ctx.font = `bold ${Math.max(6, 7*S)}px Courier New`;
  const tw = ctx.measureText(text).width + 12*S, th = 11.5*S, x = cx - tw/2, y = cy - th/2 - 0.5*S, r = 1.6*S;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';                                    // contact shadow on the plant
  ctx.beginPath(); ctx.roundRect(x + 1.2*S, y + 1.6*S, tw, th, r); ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + th);
  g.addColorStop(0, 'rgba(70,74,78,0.92)'); g.addColorStop(0.18, 'rgba(42,45,48,0.92)'); g.addColorStop(1, 'rgba(22,24,26,0.94)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, tw, th, r); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 0.5*S;         // brushed grain
  ctx.beginPath(); for (let k = 1.5; k < th - 1; k += 1.3*S) { ctx.moveTo(x + 1.5*S, y + k); ctx.lineTo(x + tw - 1.5*S, y + k); } ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.6*S;           // bevel
  ctx.beginPath(); ctx.moveTo(x + r, y + 0.4*S); ctx.lineTo(x + tw - r, y + 0.4*S); ctx.stroke();
  ctx.strokeStyle = on ? accent : 'rgba(0,0,0,0.6)'; ctx.globalAlpha = on ? 0.45 : 1; ctx.lineWidth = 0.7*S;
  ctx.beginPath(); ctx.roundRect(x, y, tw, th, r); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(150,154,158,0.85)';                                    // rivets
  for (const [rx, ry] of [[x + 2.2*S, y + 2.2*S], [x + tw - 2.2*S, y + 2.2*S], [x + 2.2*S, y + th - 2.2*S], [x + tw - 2.2*S, y + th - 2.2*S]]) { ctx.beginPath(); ctx.arc(rx, ry, 0.6*S, 0, Math.PI*2); ctx.fill(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (on) { ctx.shadowColor = accent; ctx.shadowBlur = 3*S; }
  ctx.fillStyle = on ? accent : 'rgba(140,132,116,0.85)';
  ctx.fillText(text, cx, cy);
  ctx.restore();
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
// A coal-ash (CCR) plant, laid out in 320×280 units (40 a tile, × S):
//   receiving   a corrugated tipping hall top-left; a dump truck backs up
//               to its door and tips ash in now and then while there is
//               room (the haul trucks themselves stop anywhere alongside)
//   kiln line   an inclined belt up to the rotary kiln (riding rings,
//               girth gear, burner hood with its flame), the baghouse that
//               filters its off-gas, ducted to a banded stack that smokes
//   storage     two fly-ash silos fed by a pneumatic line, with the gauge
//   disposal    a lined ash cell bottom-right: berms, black HDPE liner, the
//               ash tipped off the discharge belt at the right end and
//               pushed out leftward by a dozer as the stored waste grows
//   water       an ash-water settling pond bottom-left, aerator turning
//   control     a small control cabin by the truck bay
// The ash (cracked-mud scan, greyed) and the berms are Poly Haven scans (PhotoGround,
// skipped during read-backs, see withoutImageFills); metal and concrete
// get the building grain. Unpowered, the belts, kiln, dozer, flame and
// smoke all stop; the stored ash stays where it is.
function renderCoalWasteFacility(e, px, py, t) {
  if (_wfOK(e, 'coalw', 8, 7, ['cwf_base', 'cwf_ash', 'cwf_dozer'])) return _cwfArt(e, px, py, t);   // rendered (end of this file)
  const { S, fill } = _wfDims(e, T.COALWASTE);
  const on = !!e.powered;
  const accent = '#e0a040';
  const dark = typeof DayNight !== 'undefined' ? DayNight.darkness() : 0;
  const detail = typeof Camera === 'undefined' || Camera.zoom > 0.45;
  const X = v => px + v*S, Y = v => py + v*S;
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), w*S, h*S); };
  const RR = (x, y, w, h, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(X(x), Y(y), w*S, h*S, r*S); ctx.fill(); };
  const ell = (x, y, rx, ry, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(X(x), Y(y), rx*S, ry*S, 0, 0, Math.PI*2); ctx.fill(); };
  const ln = (x1, y1, x2, y2, c, w) => { ctx.strokeStyle = c; ctx.lineWidth = w*S; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
  const shadow = (x, y, w, h, r) => _wfShadow(X(x), Y(y), w*S, h*S, (r || 2)*S);
  const imgOK = typeof _imageFillsOff === 'undefined' || !_imageFillsOff;
  const photo = (name, span) => (imgOK && typeof PhotoGround !== 'undefined') ? PhotoGround.pattern(ctx, name, span) : null;
  const grain = (kind, a) => { if (detail && typeof _bldGrain === 'function') _bldGrain(ctx, kind, a); };
  const winGlow = (x, y, w, h) => {
    R(x, y, w, h, dark > 0.3 && on ? `rgba(255,214,140,${(0.55 + 0.35*dark).toFixed(2)})` : '#26323a');
    if (dark <= 0.3) R(x, y, w*0.4, h, 'rgba(255,255,255,0.08)');
  };
  ctx.save();

  // ── Settling pond (bottom-left) ───────────────────────────────────
  {
    const x = 14, y = 196, w = 104, h = 70;
    RR(x, y, w, h, 8, '#5c584f');                       // concrete rim
    grain('mottle', 0.8);
    RR(x + 4, y + 4, w - 8, h - 8, 6, '#3a3a34');       // sludge margin
    const wg = ctx.createLinearGradient(0, Y(y), 0, Y(y + h));
    wg.addColorStop(0, '#5a6a66'); wg.addColorStop(1, '#3c4a48');
    ctx.fillStyle = wg; ctx.beginPath(); ctx.roundRect(X(x + 8), Y(y + 8), (w - 16)*S, (h - 16)*S, 5*S); ctx.fill();
    BldWater.draw(ctx, 'path', X(x + 8), Y(y + 8), (w - 16)*S, (h - 16)*S, t, { murky: true, still: !on });
    if (detail) {                                       // a pale scum line where the ash settles out
      ctx.strokeStyle = 'rgba(170,170,160,0.35)'; ctx.lineWidth = 1.2*S;
      ctx.beginPath(); ctx.roundRect(X(x + 10), Y(y + 10), (w - 20)*S, (h - 20)*S, 4*S); ctx.stroke();
    }
    // floating aerator, turning while powered
    const ax = x + w*0.62, ay = y + h*0.5;
    ell(ax + 1.5, ay + 2, 8, 8, 'rgba(0,0,0,0.25)');
    ell(ax, ay, 8, 8, '#d8d4c8');
    ctx.save(); ctx.translate(X(ax), Y(ay)); ctx.rotate(on ? t*3 : 0.4);
    ctx.fillStyle = '#4a5058'; for (let k = 0; k < 3; k++) { ctx.rotate(Math.PI*2/3); ctx.fillRect(-1*S, 0, 2*S, 7*S); }
    ctx.restore();
    if (on) { ctx.strokeStyle = 'rgba(240,250,250,0.35)'; ctx.lineWidth = S; ctx.beginPath(); ctx.arc(X(ax), Y(ay), (10 + (t*6 % 6))*S, 0, Math.PI*2); ctx.stroke(); }
    // walkway out to it
    R(x + w*0.62 - 1.5, y + 2, 3, h*0.5 - 9, '#8a8478');
  }

  // ── Lined ash cell (bottom-right) ─────────────────────────────────
  const cx0 = 132, cy0 = 200, cw = 172, ch = 66;
  {
    // berm: compacted earth (the coal-ground scan)
    RR(cx0, cy0, cw, ch, 6, '#5e574b');
    const berm = photo('ground_coal_rim', 160);
    if (berm) { ctx.fillStyle = berm; ctx.fill(); ctx.fillStyle = 'rgba(120,108,88,0.35)'; ctx.fill(); }
    // HDPE liner showing round the rim of the pit
    RR(cx0 + 6, cy0 + 6, cw - 12, ch - 12, 4, '#1a1b1d');
    if (detail) {                                   // welded liner panels, a sky sheen across them
      for (let k = 1; k < 8; k++) ln(cx0 + 6 + k*(cw - 12)/8, cy0 + 6, cx0 + 6 + k*(cw - 12)/8, cy0 + ch - 6, 'rgba(255,255,255,0.07)', 0.7);
      const sh = ctx.createLinearGradient(0, Y(cy0 + 6), 0, Y(cy0 + ch - 6));
      sh.addColorStop(0, 'rgba(200,215,230,0.10)'); sh.addColorStop(0.5, 'rgba(200,215,230,0)'); sh.addColorStop(1, 'rgba(200,215,230,0.05)');
      ctx.fillStyle = sh; ctx.fillRect(X(cx0 + 6), Y(cy0 + 6), (cw - 12)*S, (ch - 12)*S);
    }
    // the ash body: tipped at the right end under the belt and pushed out
    // leftward as waste is stored, so its face moves across the cell
    const aw = (cw - 20) * Math.min(1, 0.12 + 0.88*fill), ax0 = cx0 + cw - 10 - aw;
    if (fill > 0.005) {
      ctx.beginPath(); ctx.roundRect(X(ax0), Y(cy0 + 10), aw*S, (ch - 20)*S, 3*S);
      ctx.fillStyle = '#76726a'; ctx.fill();
      // compacted ash, cracking as it dries: the cracked-mud scan, greyed
      const ash = photo('ground_lithium_rim', 112);
      if (ash) { ctx.fillStyle = ash; ctx.fill(); ctx.fillStyle = 'rgba(40,40,42,0.32)'; ctx.fill(); }
      // fresh, paler lifts near the working face; dozer tracks across them
      const fg = ctx.createLinearGradient(X(ax0), 0, X(ax0 + aw), 0);
      fg.addColorStop(0, 'rgba(255,255,250,0.16)'); fg.addColorStop(0.25, 'rgba(255,255,250,0)'); fg.addColorStop(1, 'rgba(60,58,54,0.18)');
      ctx.fillStyle = fg; ctx.fill();
      if (detail) {
        ctx.strokeStyle = 'rgba(40,38,34,0.22)'; ctx.lineWidth = 1.4*S; ctx.setLineDash([2*S, 1.6*S]);
        for (const yy of [cy0 + 22, cy0 + 30, cy0 + 44]) ln(ax0 + 4, yy, ax0 + aw - 6, yy, 'rgba(40,38,34,0.22)', 1.4);
        ctx.setLineDash([]);
        // the face: a soft lip where the ash ends on the liner
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(X(ax0 - 1), Y(cy0 + 10), 2*S, (ch - 20)*S);
      }
    }
    // haul ramp down the berm, at the far end from the tipping point
    ctx.fillStyle = '#6a6254'; ctx.beginPath();
    ctx.moveTo(X(cx0 + 16), Y(cy0)); ctx.lineTo(X(cx0 + 32), Y(cy0)); ctx.lineTo(X(cx0 + 28), Y(cy0 + 12)); ctx.lineTo(X(cx0 + 16), Y(cy0 + 12)); ctx.closePath(); ctx.fill();
    // dozer working between the tipping point and the face (parked when
    // unpowered or empty)
    if (fill > 0.04) {
      const right = cx0 + cw - 34, span = Math.max(6, right - ax0 - 4);
      const u = on ? 0.5 + 0.5*Math.sin(t*0.35) : 0.15;
      const dx = ax0 + 2 + u*span, dy = cy0 + ch*0.5 - 6 + (on ? Math.sin(t*0.9)*4 : 0);
      const dir = on ? -Math.cos(t*0.35) : -1;    // heading -x pushes toward the face
      R(dx + 2, dy + 3, 20, 12, 'rgba(0,0,0,0.3)');
      R(dx, dy, 20, 3, '#222'); R(dx, dy + 9, 20, 3, '#222');         // tracks
      R(dx + 3, dy + 1.5, 14, 9, '#e0a828');                           // body
      R(dx + 6, dy + 3, 6, 6, '#2a2a28');                              // cab roof
      R(dir > 0 ? dx + 20 : dx - 3, dy - 1, 3, 14, '#3a3a36');         // blade
      if (on && detail) for (let k = 0; k < 3; k++) {                  // dust off the blade
        const ph = (t*0.9 + k/3) % 1;
        ell((dir > 0 ? dx + 24 : dx - 4) + ph*4*dir, dy + 5 - ph*6, 2 + ph*4, 1.5 + ph*3, `rgba(190,186,178,${(0.35*(1 - ph)).toFixed(2)})`);
      }
    }
  }

  // ── Receiving hall (top-left) ─────────────────────────────────────
  const hx = 14, hy = 26, hw = 104, hh = 92;
  {
    shadow(hx, hy, hw, hh + 8, 3);
    // corrugated roof, ridge across the middle
    const rg = ctx.createLinearGradient(0, Y(hy), 0, Y(hy + hh*0.62));
    rg.addColorStop(0, '#7c8086'); rg.addColorStop(0.48, '#9aa0a6'); rg.addColorStop(0.5, '#6c7076'); rg.addColorStop(1, '#5a5e64');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.rect(X(hx), Y(hy), hw*S, hh*0.62*S); ctx.fill();
    if (detail && typeof _corrugatedGrain === 'function') _corrugatedGrain(ctx, 1);   // corrugated_iron_02: the ribs
    if (detail) {
      R(hx + 14, hy + 8, 10, hh*0.62 - 16, 'rgba(210,230,240,0.35)');   // skylight strips
      R(hx + hw - 24, hy + 8, 10, hh*0.62 - 16, 'rgba(210,230,240,0.35)');
      // ash dust settled on the roof near the door
      ctx.fillStyle = 'rgba(180,176,168,0.22)'; ctx.fillRect(X(hx), Y(hy + hh*0.45), hw*S, hh*0.17*S);
    }
    // front wall (facing down) with the big tipping door
    const wy = hy + hh*0.62, wh = hh*0.38;
    R(hx, wy, hw, wh, '#4e4a44'); grain('mottle', 0.8);
    if (detail) { ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.5*S; ctx.beginPath(); for (let v = wy + 4; v < wy + wh; v += 4) { ctx.moveTo(X(hx), Y(v)); ctx.lineTo(X(hx + hw), Y(v)); } ctx.stroke(); }
    const dx = hx + hw*0.22, dw = hw*0.44;
    const dg = ctx.createLinearGradient(0, Y(wy + 4), 0, Y(hy + hh));
    dg.addColorStop(0, '#0c0b0a'); dg.addColorStop(1, on ? '#3a3226' : '#1a1814');
    ctx.fillStyle = dg; ctx.fillRect(X(dx), Y(wy + 4), dw*S, (wh - 4)*S);
    if (on) { ctx.fillStyle = `rgba(255,190,110,${(0.10 + 0.25*dark).toFixed(2)})`; ctx.fillRect(X(dx), Y(wy + 4), dw*S, (wh - 4)*S); }
    _wfHazardStripe(X(dx - 3), Y(wy + 1), (dw + 6)*S, 3*S, S);
    winGlow(hx + 6, wy + 8, 10, 6); winGlow(hx + hw - 16, wy + 8, 10, 6);
  }

  // ── Dump truck at the bay, tipping now and then ──────────────────
  {
    const tx = hx + hw*0.22 + 14, ty = hy + hh + 4;   // bed toward the door, cab toward us
    const P = 14, ph = (t / P) % 1;
    const tip = on && fill < 0.98 ? Math.max(0, Math.sin(Math.min(1, Math.max(0, (ph - 0.25) / 0.5)) * Math.PI)) : 0;
    R(tx + 3, ty + 4, 22, 46, 'rgba(0,0,0,0.3)');
    R(tx, ty + 6, 22, 40, '#2a2a2a');                         // chassis
    for (const yy of [ty + 10, ty + 30, ty + 40]) { R(tx - 2, yy, 3, 7, '#111'); R(tx + 21, yy, 3, 7, '#111'); }
    // bed: lifts at the cab end, so it foreshortens and rides up into the door
    const bedL = 28 * (1 - 0.35*tip), bedY = ty + 4 - 6*tip;
    R(tx + 1, bedY + 2*tip + 3, 20, bedL, 'rgba(0,0,0,0.25)');
    R(tx, bedY, 22, bedL, '#a85a2a'); 
    R(tx + 2, bedY + 2, 18, bedL - 4, '#6e6a62');            // ash load
    if (detail) R(tx + 2, bedY + 2, 18, 3, 'rgba(255,255,255,0.18)');
    if (tip > 0.2) for (let k = 0; k < 4; k++) {             // ash pouring out of the tailgate
      const q = (t*1.8 + k/4) % 1;
      ell(tx + 6 + k*3.5, bedY - 2 - q*8, 2 + q*2, 1.6 + q*1.5, `rgba(170,166,158,${(0.6*(1 - q)*tip).toFixed(2)})`);
    }
    // cab
    RR(tx + 1, ty + 34, 20, 13, 2, '#d0a020');
    R(tx + 3, ty + 36, 16, 4, dark > 0.3 ? '#1a2028' : '#5e7486');
    if (on && dark > 0.3) { ell(tx + 5, ty + 47.5, 2, 1, 'rgba(255,240,200,0.9)'); ell(tx + 17, ty + 47.5, 2, 1, 'rgba(255,240,200,0.9)'); }
  }

  // ── Control cabin ─────────────────────────────────────────────────
  {
    const x = 74, y = 142, w = 40, h = 30;
    shadow(x, y, w, h, 2);
    RR(x, y, w, h*0.55, 2, '#c8c4b8'); grain('mottle', 0.45);
    R(x, y + h*0.55, w, h*0.45, '#8c877c');
    winGlow(x + 4, y + h*0.62, 14, 7); winGlow(x + 22, y + h*0.62, 14, 7);
    R(x + 3, y + 3, 6, 4, '#6a6e70');                         // rooftop AC
    if (detail) ln(x + 30, y + 4, x + 30, y - 6, '#5a5e60', 0.8);  // radio mast
  }

  // ── Feed belt: hall up to the kiln's feed end ─────────────────────
  _wfConveyor(X(hx + hw - 4), Y(hy + 40), X(150), Y(98), S, t, on, '#7a7468');

  // ── Rotary kiln ───────────────────────────────────────────────────
  const kx0 = 146, kx1 = 270, ky = 104, kr = 15;
  {
    // piers
    for (const f of [0.27, 0.73]) { const px0 = kx0 + (kx1 - kx0)*f; R(px0 - 8 + 3, ky + 6 + 3, 16, kr + 8, 'rgba(0,0,0,0.3)'); R(px0 - 8, ky + 6, 16, kr + 8, '#6e6a62'); }
    R(kx0 + 4, ky - kr + 8, kx1 - kx0, kr*2, 'rgba(0,0,0,0.32)');
    const kg = ctx.createLinearGradient(0, Y(ky - kr), 0, Y(ky + kr));
    kg.addColorStop(0, '#5e4e3c'); kg.addColorStop(0.28, '#a88c66'); kg.addColorStop(0.55, '#6a5640'); kg.addColorStop(1, '#2a221a');
    ctx.fillStyle = kg; ctx.beginPath(); ctx.roundRect(X(kx0), Y(ky - kr), (kx1 - kx0)*S, kr*2*S, 4*S); ctx.fill();
    grain('stain', 0.4);
    ctx.save(); ctx.clip();
    // shell plate seams rolling past while it turns
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1.2*S;
    const off = on ? (t*10) % 10 : 3;
    for (let y0 = ky - kr - 10 + off; y0 < ky + kr + 10; y0 += 10) ln(kx0, y0, kx1, y0, 'rgba(0,0,0,0.16)', 0.9);
    if (on) {                                     // heat toward the burner end
      const hg = ctx.createLinearGradient(X(kx0 + (kx1 - kx0)*0.55), 0, X(kx1), 0);
      hg.addColorStop(0, 'rgba(255,110,30,0)'); hg.addColorStop(1, `rgba(255,110,30,${(0.32 + 0.08*Math.sin(t*4)).toFixed(2)})`);
      ctx.fillStyle = hg; ctx.fillRect(X(kx0), Y(ky - kr), (kx1 - kx0)*S, kr*2*S);
    }
    ctx.restore();
    // riding rings and the girth gear
    for (const f of [0.27, 0.73]) { const rx = kx0 + (kx1 - kx0)*f; R(rx - 3, ky - kr - 2, 6, kr*2 + 4, '#2c2620'); R(rx - 3, ky - kr - 2, 6, 3, '#6a5c48'); }
    { const gx = kx0 + (kx1 - kx0)*0.5; R(gx - 4, ky - kr - 3, 8, kr*2 + 6, '#3a3228');
      if (detail) { ctx.fillStyle = '#5a4e3c'; const go = on ? (t*20) % 3 : 0; for (let yy = ky - kr - 3 + go; yy < ky + kr + 3; yy += 3) ctx.fillRect(X(gx - 4), Y(yy), 8*S, 1*S); }
      R(gx + 4, ky + kr - 2, 10, 8, '#4a4e52'); }                     // drive motor
    // feed hood (left) and burner hood (right)
    RR(kx0 - 10, ky - kr - 4, 14, kr*2 + 8, 2, '#4a463e'); grain('stain', 0.7);
    RR(kx1 - 2, ky - kr - 6, 18, kr*2 + 12, 3, '#3e3a34'); grain('stain', 0.7);
    ell(kx1 + 7, ky, 6, 9, on ? `rgba(255,${150 + Math.round(40*Math.sin(t*7))},60,0.95)` : '#1c1a16');
    if (on) ell(kx1 + 7, ky, 3, 5, 'rgba(255,240,190,0.9)');
    // burner fuel line
    ln(kx1 + 16, ky, kx1 + 26, ky, '#2a2a28', 3);
  }

  // ── Baghouse + ducts + stack ─────────────────────────────────────
  {
    const bx = 150, by = 22, bw = 88, bh = 46;
    shadow(bx, by, bw, bh, 2);
    RR(bx, by, bw, bh, 2, '#7a7e82'); grain('stain', 0.6);
    // compartments seen from above: a hopper roof each, with access hatches
    const cols = 4, rows = 2, cwid = (bw - 6)/cols, chgt = (bh - 6)/rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = bx + 3 + c*cwid, y = by + 3 + r*chgt;
      R(x + 1, y + 1, cwid - 2, chgt - 2, '#8e9296');
      if (detail) {
        ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.beginPath();
        ctx.moveTo(X(x + cwid - 1), Y(y + 1)); ctx.lineTo(X(x + cwid - 1), Y(y + chgt - 1)); ctx.lineTo(X(x + 1), Y(y + chgt - 1)); ctx.closePath(); ctx.fill();
        R(x + cwid/2 - 2, y + chgt/2 - 2, 4, 4, '#5a5e62');
      }
    }
    // pulse-jet cleaning: one compartment at a time blinks while running
    if (on && detail) { const k = Math.floor(t*1.2) % (cols*rows); const x = bx + 3 + (k % cols)*cwid, y = by + 3 + Math.floor(k / cols)*chgt; R(x + 1, y + 1, cwid - 2, chgt - 2, 'rgba(255,255,255,0.10)'); }
    // duct: kiln feed hood up into the baghouse, baghouse across to the stack
    ln(kx0 - 3, ky - kr - 4, kx0 - 3, by + bh, '#2a2a28', 9); ln(kx0 - 3, ky - kr - 4, kx0 - 3, by + bh, '#6a6c6e', 6);
    ln(bx + bw, by + bh*0.5, 286, by + bh*0.5, '#2a2a28', 9); ln(bx + bw, by + bh*0.5, 286, by + bh*0.5, '#6a6c6e', 6);
    // stack: a banded chimney standing up from its foot
    const sx = 288, sTop = 6, sBase = 82, sw = 16;
    R(sx - sw/2 + 6, sTop + 8, sw, sBase - sTop, 'rgba(0,0,0,0.3)');
    const sg = ctx.createLinearGradient(X(sx - sw/2), 0, X(sx + sw/2), 0);
    sg.addColorStop(0, '#8a857c'); sg.addColorStop(0.45, '#6a655c'); sg.addColorStop(1, '#3a3630');
    ctx.fillStyle = sg; ctx.fillRect(X(sx - sw/2), Y(sTop), sw*S, (sBase - sTop)*S);
    _bldGrainRect(ctx, 'mottle', X(sx - sw/2), Y(sTop), sw*S, (sBase - sTop)*S, 0.8);
    for (const b of [4, 14]) R(sx - sw/2, sTop + b, sw, 5, '#b03424');
    ell(sx, sTop, sw/2 + 1, 3, '#1a1612');
    if (on) ell(sx, sTop, sw/2 - 2, 1.8, 'rgba(255,140,60,0.35)');
    // aviation light on the stack at night
    if (dark > 0.3 && Math.sin(t*2.4) > 0.3) ell(sx, sTop + 2, 2, 2, '#ff3020');
    _wfSmoke(X(sx), Y(sTop - 3), S, t, '150,146,140', on, 0.4);
  }

  // ── Fly-ash silos + pneumatic line + gauge ────────────────────────
  {
    ln(194, 68, 194, 146, '#3a3c3e', 3);                          // conveying line down from the baghouse
    ln(170, 146, 216, 146, '#3a3c3e', 3);
    for (const [sx, i] of [[170, 0], [216, 1]]) {
      const sy = 166, r = 18;
      ell(sx + 4, sy + 5, r, r, 'rgba(0,0,0,0.32)');
      const g = ctx.createRadialGradient(X(sx - 6), Y(sy - 6), 2*S, X(sx), Y(sy), r*S);
      g.addColorStop(0, '#d4d0c6'); g.addColorStop(1, '#8a867c');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(sx), Y(sy), r*S, 0, Math.PI*2); ctx.fill();
      grain('mottle', 0.5);
      if (detail) {                                        // roof sheets running to the vent
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.6*S; ctx.beginPath();
        for (let k = 0; k < 12; k++) { const a = k*Math.PI/6; ctx.moveTo(X(sx), Y(sy)); ctx.lineTo(X(sx + Math.cos(a)*r), Y(sy + Math.sin(a)*r)); }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1*S; ctx.beginPath(); ctx.arc(X(sx), Y(sy), r*S, 0, Math.PI*2); ctx.stroke();
      }
      ell(sx, sy, 4, 4, '#4a4a46');                         // bin vent
      if (on && detail && Math.sin(t*0.7 + i*2) > 0.6) ell(sx + 3, sy - 4, 3, 2, 'rgba(200,196,190,0.4)');
    }
    _wfGauge(X(244), Y(146), 8*S, 40*S, S, fill, accent, on);
  }

  // ── Discharge: kiln end down onto the ash cell ───────────────────
  {
    const x1 = kx1 + 4, y1 = ky + kr + 6, x2 = cx0 + cw - 22, y2 = cy0 + 22;
    _wfConveyor(X(x1), Y(y1), X(x2), Y(y2), S, t, on, '#8a8478');
    if (on && fill < 0.999) for (let k = 0; k < 3; k++) {
      const q = (t*1.4 + k/3) % 1;
      ell(x2 + (k - 1)*2, y2 + q*7, 1.4, 1.4, `rgba(170,166,158,${(0.8*(1 - q)).toFixed(2)})`);
    }
    // the pile under the belt head
    if (fill > 0.005) ell(x2, y2 + 10, 9, 6, 'rgba(150,146,138,0.55)');
    // quench water line to the pond
    ln(kx0 + 10, ky + kr + 8, kx0 + 10, 186, '#2a2c2e', 4); ln(kx0 + 10, 186, 112, 186, '#2a2c2e', 4); ln(112, 186, 112, 200, '#2a2c2e', 4);
    if (on && detail) { ctx.setLineDash([2*S, 5*S]); ctx.lineDashOffset = -t*14*S; ln(kx0 + 10, ky + kr + 8, kx0 + 10, 186, '#6aa0b0', 1.4); ln(kx0 + 10, 186, 112, 186, '#6aa0b0', 1.4); ctx.setLineDash([]); ctx.lineDashOffset = 0; }
  }

  _wfPlate('COAL ASH PROCESSING', X(196), Y(10), S, accent, on);
  _wfLamp(X(306), Y(12), S, t, accent, on);
  ctx.restore();
}

// ── Oil Waste Processing Facility (8×9) ──
// Clarifier basin with a sweeping skimmer bridge, twin digester tanks whose
// rim bands fill with stored waste, a fan-cooled treatment building, a
// bubbling sludge lagoon that rises with storage, and a flare stack.
function renderOilWasteFacility(e, px, py, t) {
  if (_wfOK(e, 'oilw', 8, 9, ['owf_base', 'hyp_fan'])) return _owfArt(e, px, py, t);   // rendered (end of this file)
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
  ctx.beginPath(); ctx.arc(ccx, ccy, cr, 0, Math.PI*2); _fillMetalG(ctx);
  const wg = ctx.createRadialGradient(ccx - cr*0.3, ccy - cr*0.3, cr*0.1, ccx, ccy, cr);
  wg.addColorStop(0, '#3a5a2a'); wg.addColorStop(0.6, '#1c3016'); wg.addColorStop(1, '#0c160a');
  ctx.fillStyle = wg;
  ctx.beginPath(); ctx.arc(ccx, ccy, cr - 6*S, 0, Math.PI*2); _fillMetalG(ctx);
  BldWater.draw(ctx, 'ell', ccx - cr + 6*S, ccy - cr + 6*S, 2*(cr - 6*S), 2*(cr - 6*S), t, { murky: true, still: !on, depth: 0.4 });
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
  ctx.beginPath(); ctx.rect(-cr + 4*S, -3*S, 2*(cr - 4*S), 6*S); _fillMetalG(ctx); ctx.stroke();
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
    ctx.beginPath(); ctx.arc(t1x, ty, tr, 0, Math.PI*2); _fillMetalG(ctx);
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
  ctx.beginPath(); ctx.roundRect(bx, by, bw, roofH, 3*S); _fillMetalG(ctx); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = S;
  for (let k = 1; k < 6; k++) { const lx = bx + bw*k/6; ctx.beginPath(); ctx.moveTo(lx, by + 2*S); ctx.lineTo(lx, by + roofH - 2*S); ctx.stroke(); }
  [0.28, 0.72].forEach((f, i) => {
    const fx = bx + bw*f, fy = by + roofH*0.5, fr = 11*S;
    ctx.fillStyle = '#1a1e16'; ctx.strokeStyle = '#6a7458'; ctx.lineWidth = 1.5*S;
    ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI*2); _fillMetalG(ctx); ctx.stroke();
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
  ctx.fillStyle = '#1a2016'; _fillRectMetalG(ctx, bx, bwy, bw, wallH);
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
  ctx.beginPath(); ctx.roundRect(lx, ly, lw, lh, 8*S); _fillMetalG(ctx); ctx.stroke();
  const ix = lx + 6*S, iy = ly + 6*S, iw = lw - 12*S, ih = lh - 12*S;
  ctx.fillStyle = '#12120e';
  ctx.beginPath(); ctx.roundRect(ix, iy, iw, ih, 5*S); _fillMetalG(ctx);
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
  ctx.lineTo(ix + iw, iy + ih); ctx.closePath(); _fillMetalG(ctx);
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
  if (typeof _nkOK === 'function' && _nkOK(e, 'nw', 13, 11)) return _nwArt(e, px, py, t);
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
  ctx.beginPath(); ctx.roundRect(hx, hy, hw, vaultH, 10*S); _fillMetalG(ctx);
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
  ctx.fillStyle = '#1a1e18'; _fillRectMetalG(ctx, hx, wy, hw, wallH);
  ctx.strokeStyle = '#3a4234'; ctx.lineWidth = S; ctx.strokeRect(hx, wy, hw, wallH);
  const dw = hw*0.24, dh = wallH*0.82, ddx = doorX - dw/2, ddy = wy + wallH - dh;
  ctx.fillStyle = '#2e342a'; ctx.strokeStyle = '#6a7460'; ctx.lineWidth = 1.5*S;
  _fillRectMetalG(ctx, ddx, ddy, dw, dh); ctx.strokeRect(ddx, ddy, dw, dh);
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
  ctx.beginPath(); ctx.roundRect(vx, vy, vw, vh, 3*S); _fillMetalG(ctx); ctx.stroke();
  const vwx = vx + vw*0.18, vwy = vy + vh*0.42, vww = vw*0.64, vwh = vh*0.36;
  const glow = ctx.createLinearGradient(vwx, 0, vwx + vww, 0);
  if (on) {
    const p = 0.75 + 0.25*Math.sin(t*2.2);
    glow.addColorStop(0, `rgba(255,150,40,${p})`); glow.addColorStop(1, `rgba(160,255,90,${p})`);
  } else { glow.addColorStop(0, '#20241c'); glow.addColorStop(1, '#161a14'); }
  ctx.fillStyle = glow; _fillRectMetalG(ctx, vwx, vwy, vww, vwh);
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
  ctx.beginPath(); ctx.roundRect(yx, yy, yw, yh, 4*S); _fillMetalG(ctx); ctx.stroke();
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
      ctx.beginPath(); ctx.arc(cx, cy, crr, 0, Math.PI*2); _fillMetalG(ctx);
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

// renderCoalDeposit — see render_deposits.js

/* ── Drive shaft, rendered ───────────────────────────────────────────────
   Built in Blender (scripts/render_shaft.py): plinths, pillow-block
   bearings, the shaft with its keyway, flange couplings at the seams,
   brass end hubs, one render per direction. Live: stripes running along
   the shaft at _rotationRate, the end hubs turning and glowing (the far end
   only once a source turbine drives it, as the painted shaft). */
const SHAFT_LAYOUT = {"h":{"frame":8.0,"off":0.3,"ends":[[-3.02,0,0.75],[3.02,0,0.75]],"z":0.75,"r":0.17},"v":{"frame":8.0,"off":0.3,"ends":[[0,3.02,0.75],[0,-3.02,0.75]],"z":0.75,"r":0.17}};
function _shaftArt(e, px, py, t) {
  const horizontal = e._orientation === 'h', L = SHAFT_LAYOUT[horizontal ? 'h' : 'v'];
  const tw = (e.width || (horizontal ? 3 : 1)) * TILE, th = (e.height || (horizontal ? 1 : 3)) * TILE;
  const F = _cwFrame(L, px + tw / 2, py + th / 2, 1, 1), { P, M } = F, S = TILE / 40, TAU = Math.PI * 2;
  const rate = e._rotationRate || 0, driven = rate > 0;
  ctx.save();
  F.draw(CoalWaterArt.get(horizontal ? 'shaft_h' : 'shaft_v'));
  const [a, b] = L.ends, [ax, ay] = P(...a), [bx, by] = P(...b);
  if (driven && Camera.zoom > 0.4) {
    ctx.save(); ctx.lineCap = 'butt';
    ctx.strokeStyle = `rgba(255,214,120,${(0.35 + 0.2 * Math.sin(t * 6 * rate)).toFixed(3)})`; ctx.lineWidth = L.r * 1.6 * M;
    ctx.setLineDash([3 * S, 7 * S]); ctx.lineDashOffset = -t * 40 * S * rate;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.restore();
  }
  let glowEnds = [0, 1];
  const src = e._sourceTurbine;
  if (src) {
    const tCx = src.col + src.width / 2, tCy = src.row + src.height / 2;
    if (horizontal) glowEnds = [Math.abs(e.col - tCx) > Math.abs(e.col + 4 - tCx) ? 0 : 1];
    else glowEnds = [Math.abs(e.row - tCy) > Math.abs(e.row + 4 - tCy) ? 0 : 1];
  }
  const endGlow = driven ? 0.85 + 0.15 * Math.sin(t * 5) : 0.3;
  for (const i of glowEnds) {
    const [gx, gy] = i === 0 ? [ax, ay] : [bx, by];
    const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, 10 * S);
    gr.addColorStop(0, `rgba(255,200,80,${(endGlow * 0.8).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(gx, gy, 10 * S, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(gx, gy); ctx.rotate(driven ? t * 6 * rate : 0);
    ctx.strokeStyle = driven ? '#3a2400' : '#4a3010'; ctx.lineWidth = 0.9 * S;
    ctx.beginPath(); ctx.moveTo(-3 * S, 0); ctx.lineTo(3 * S, 0); ctx.moveTo(0, -3 * S); ctx.lineTo(0, 3 * S); ctx.stroke();
    ctx.restore();
  }
  if (InspectionPanel.isOpen() && InspectionPanel.target === e) {
    ctx.strokeStyle = '#e0a020'; ctx.lineWidth = 2 / Camera.zoom; ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 4);
    ctx.strokeRect(px + 1, py + 1, tw - 2, th - 2);
  }
  ctx.restore();
}


/* ── Coal / Oil Waste Facilities, rendered (scripts/render_civic2.py coalw /
   oilw; layout in CIV2_LAYOUT, render_world_civic.js). Coal: the ash cell
   fills from the east with the store (cwf_ash, clipped) and a dozer
   (cwf_dozer) works the face; aerator, kiln heat and burner, baghouse pulse,
   stack smoke, silo vents, gauge, lit windows. Oil: the clarifier's skimmer
   bridge turns, digester fill rings, hall fans and green windows, the sludge
   lagoon fills and bubbles, the flare (blue pilot when idle), gauge.
   Nameplates and lamps as the painted ones. Default sizes only. */
function _wfOK(e, key, w, h, imgs) {
  if (e._ghost || typeof CIV2_LAYOUT === 'undefined' || !CIV2_LAYOUT || !CIV2_LAYOUT[key] || (e.width || w) !== w || (e.height || h) !== h) return false;
  if (typeof AdvNukeArt === 'undefined' || (typeof _imageFillsOff !== 'undefined' && _imageFillsOff)) return false;
  for (const n of imgs) if (!AdvNukeArt.get(n)) return false;
  return true;
}
function _wfGaugeAt(F, g, fill, accent, on) {
  const [g0, g1, gy, z0, z1] = g, [ax, ay] = F.P(g0, gy, z1), [bx, by] = F.P(g1, gy, z0), gh = (by - ay) * fill;
  ctx.fillStyle = on ? accent : '#5a5040'; ctx.fillRect(ax, by - gh, bx - ax, gh);
}
function _cwfArt(e, px, py, t) {
  const L = CIV2_LAYOUT.coalw, { S, fill } = _wfDims(e, T.COALWASTE), F = _anFrame(e, px, py), { P, M } = F;
  const on = !!e.powered, dark = DayNight.darkness(), detail = Camera.zoom > 0.45, accent = '#e0a040';
  ctx.save();
  F.draw(AdvNukeArt.get('cwf_base'), L.rect);
  // the settling pond: murky water over the rendered basin
  { const [x0, x1, y0, y1, z] = L.pond, [ax, ay] = P(x0, y1, z), [bx, by] = P(x1, y0, z);
    const g = ctx.createLinearGradient(0, ay, 0, by); g.addColorStop(0, 'rgba(78,96,90,0.85)'); g.addColorStop(1, 'rgba(52,66,64,0.9)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(ax, ay, bx - ax, by - ay, 0.25 * M); ctx.fill();
    if (typeof BldWater !== 'undefined') BldWater.draw(ctx, 'path', ax, ay, bx - ax, by - ay, t, { murky: true, still: !on }); }
  // the ash cell filling from the east, the dozer pushing the face
  { const [x0, x1, y0, y1, z] = L.cell, aw = (x1 - x0) * Math.min(1, 0.12 + 0.88 * fill), ax0 = x1 - aw;
    if (fill > 0.005) {
      const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2], [sx0] = P(ax0, cy, z), [sx1] = P(x1, cy, z), [, syT] = P(cx, y1, z + 0.6), [, syB] = P(cx, y0, z);
      ctx.save(); ctx.beginPath(); ctx.rect(sx0, syT, sx1 - sx0, syB - syT); ctx.clip();
      _amDraw(F, AdvNukeArt.get('cwf_ash'), L.ashRect, 1, cx, cy + z * Math.tan(Math.PI / 6)); ctx.restore();
      if (fill > 0.04) {
        const span = Math.max(0.5, x1 - 1.2 - ax0), u = on ? 0.5 + 0.5 * Math.sin(t * 0.35) : 0.15;
        const dx = ax0 + 0.6 + u * span, dy = cy + (on ? Math.sin(t * 0.9) * 0.3 : 0);
        _amDraw(F, AdvNukeArt.get('cwf_dozer'), L.dozerRect, 1, dx, dy + (z + 0.1) * Math.tan(Math.PI / 6));
        if (on && detail) for (let k = 0; k < 3; k++) { const ph = (t * 0.9 + k / 3) % 1, [qx, qy] = P(dx - 0.9 - ph * 0.4, dy, z + 0.3 + ph * 0.5);
          ctx.fillStyle = `rgba(190,186,178,${(0.35 * (1 - ph)).toFixed(2)})`; ctx.beginPath(); ctx.ellipse(qx, qy, (0.1 + ph * 0.2) * M, (0.08 + ph * 0.15) * M, 0, 0, Math.PI * 2); ctx.fill(); }
      } } }
  // aerator blades and ripples
  { const [x, y, z, r] = L.aerator, a0 = on ? t * 3 : 0.4, [cx, cy] = P(x, y, z);
    { const [, , , py1] = L.pond, [wx, wy] = P(x, py1, z + 0.15); ctx.strokeStyle = '#8a8c88'; ctx.lineWidth = 0.4 * M; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(cx, cy - 0.3 * M); ctx.stroke(); }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(cx + 0.06 * M, cy + 0.08 * M, r * 1.2 * M, r * 1.2 * M, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d8d4c8'; ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.2 * M, r * 1.2 * M, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#4a5058'; ctx.lineWidth = Math.max(1, 0.08 * M);
    for (let k = 0; k < 3; k++) { const a = a0 + k * 2.094, [bx, by] = P(x + Math.cos(a) * r, y + Math.sin(a) * r, z); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke(); }
    if (on) { const rr = (0.5 + (t * 0.6 % 0.6)) * M; ctx.strokeStyle = 'rgba(240,250,250,0.35)'; ctx.lineWidth = Math.max(0.6, 0.04 * M); ctx.beginPath(); ctx.ellipse(cx, cy, rr, rr, 0, 0, Math.PI * 2); ctx.stroke(); } }
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  if (on) {
    const [k0, k1, ky, kz, kr] = L.kiln, [ax, ay] = P(k0 + (k1 - k0) * 0.55, ky, kz + kr), [bx, by] = P(k1, ky - kr, kz - kr);
    const g = ctx.createLinearGradient(ax, 0, bx, 0); g.addColorStop(0, 'rgba(255,110,30,0)'); g.addColorStop(1, `rgba(255,110,30,${(0.3 + 0.08 * Math.sin(t * 4)).toFixed(2)})`);
    ctx.fillStyle = g; ctx.fillRect(ax, ay, bx - ax, by - ay);
    const [fx, fy] = P(...L.burner); _anGlow(fx, fy, 0.7 * M, '255,150,60', 0.75 + 0.15 * Math.sin(t * 7)); _anGlow(fx, fy, 0.25 * M, '255,240,190', 0.9);
    if (detail) { const k = Math.floor(t * 1.2) % L.cells.length, [cx, cy] = P(...L.cells[k]); _anGlow(cx, cy, 0.5 * M, '200,220,240', 0.35); }
  }
  if (on && dark > 0.3) [...L.hallWins, ...L.officeWins].forEach(([x, y, z]) => { const [wx, wy] = P(x, y, z); _anGlow(wx, wy, 0.5 * M, '255,214,140', 0.45 + 0.3 * dark); });
  if (on) { const [hx, hy] = P(...L.hallDoor); _anGlow(hx, hy, 1.0 * M, '255,190,110', 0.1 + 0.25 * dark); }
  ctx.restore();
  { const [sx, sy] = P(...L.stack); _wfSmoke(sx, sy, S, t, '150,146,140', on, 0.4); if (dark > 0.3 && Math.sin(t * 2.4) > 0.3) _amLed(sx, sy + 0.1 * M, 0.15 * M, '255,48,32', 0.9); }
  if (on && detail) L.silos.forEach(([x, y, z], i) => { if (Math.sin(t * 0.7 + i * 2) > 0.6) { const [vx, vy] = P(x, y, z); ctx.fillStyle = 'rgba(200,196,190,0.4)'; ctx.beginPath(); ctx.ellipse(vx + 0.1 * M, vy - 0.2 * M, 0.2 * M, 0.12 * M, 0, 0, Math.PI * 2); ctx.fill(); } });
  _wfGaugeAt(F, L.gauge, fill, accent, on);
  _wfPlate('COAL ASH PROCESSING', px + 196 * S, py + 10 * S, S, accent, on);
  _wfLamp(px + 306 * S, py + 12 * S, S, t, accent, on);
  ctx.restore();
}
function _owfArt(e, px, py, t) {
  const L = CIV2_LAYOUT.oilw, { W, H, S, fill } = _wfDims(e, T.OILWASTE), F = _anFrame(e, px, py), { P, M } = F;
  const on = !!e.powered, accent = '#70d050', TAU = Math.PI * 2;
  ctx.save();
  F.draw(AdvNukeArt.get('owf_base'), L.rect);
  // clarifier: coloured sheen rings and the skimmer bridge turning
  { const [cx, cy, z, r] = L.clar, [ox, oy] = P(cx, cy, z);
    [[0.62, 'rgba(160,120,220,0.18)'], [0.42, 'rgba(120,220,160,0.18)'], [0.78, 'rgba(230,200,90,0.14)']].forEach(([rf, col], i) => {
      const a0 = (on ? t * 0.5 : 0) * (i % 2 ? -1 : 1) + i * 2; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, 0.1 * M);
      ctx.beginPath(); ctx.arc(ox, oy, r * rf * M, a0, a0 + 2.2); ctx.stroke(); });
    const a = on ? t * 0.4 : 0.6, [ex, ey] = P(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z + 0.15), [hx, hy] = P(cx, cy, z + 0.15);
    ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.4 * M; ctx.beginPath(); ctx.moveTo(hx + 0.1 * M, hy + 0.12 * M); ctx.lineTo(ex + 0.1 * M, ey + 0.12 * M); ctx.stroke();
    ctx.strokeStyle = '#8a8470'; ctx.lineWidth = 0.34 * M; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = '#d8a820'; ctx.beginPath(); ctx.arc(ex, ey, 0.25 * M, 0, TAU); ctx.fill(); }
  // digester fill rings
  L.digesters.forEach(([x, y, z, r], idx) => { const tf = Math.max(0, Math.min(1, fill * 2 - idx)), [ox, oy] = P(x, y, z);
    ctx.strokeStyle = '#141810'; ctx.lineWidth = Math.max(1.5, 0.12 * M); ctx.beginPath(); ctx.arc(ox, oy, r * 0.6 * M, 0, TAU); ctx.stroke();
    if (tf > 0) { ctx.strokeStyle = accent; ctx.globalAlpha = on ? 0.9 : 0.45; ctx.lineWidth = Math.max(1, 0.09 * M); ctx.beginPath(); ctx.arc(ox, oy, r * 0.6 * M, -Math.PI / 2, -Math.PI / 2 + TAU * tf); ctx.stroke(); ctx.globalAlpha = 1; } });
  L.fans.forEach(([x, y, z, r], k) => _anFan(F, x, y, z, r, on ? t * 7 + k : 0.4));
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  L.wins.forEach(([w0, w1, wy, z0, z1], k) => { const [ax, ay] = P(w0, wy, z1), [bx, by] = P(w1, wy, z0);
    ctx.fillStyle = on ? `rgba(110,230,80,${(0.45 + 0.2 * Math.sin(t * 2 + k)).toFixed(3)})` : 'rgba(0,0,0,0)'; ctx.fillRect(ax, ay, bx - ax, by - ay); });
  ctx.restore();
  // the sludge lagoon fills with the store and bubbles
  { const [x0, x1, y0, y1, z] = L.lagoon, f = 0.18 + 0.78 * fill;
    if (fill > 0.005) { const [ax, ay] = P(x0, y1, z), [bx, by] = P(x1, y0, z), top = by - (by - ay) * f;
      const g = ctx.createLinearGradient(0, top, 0, by); g.addColorStop(0, '#3a4a1c'); g.addColorStop(1, '#141a0a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(ax, by);
      for (let xx = 0; xx <= bx - ax; xx += 3) ctx.lineTo(ax + xx, top + Math.sin(xx / (0.5 * M) + (on ? t * 1.5 : 0)) * 0.08 * M);
      ctx.lineTo(bx, by); ctx.closePath(); ctx.fill();
      if (on) for (let i = 0; i < 7; i++) { const ph = (t * 0.6 + i * 0.37) % 1, qx = ax + (bx - ax) * (0.1 + ((i * 0.618) % 0.8)), qy = top + (by - top) * (0.2 + ((i * 0.41) % 0.7));
        ctx.strokeStyle = `rgba(150,200,80,${(0.6 * (1 - ph)).toFixed(3)})`; ctx.lineWidth = Math.max(0.6, 0.04 * M); ctx.beginPath(); ctx.arc(qx, qy, (0.05 + ph * 0.15) * M, 0, TAU); ctx.stroke(); } } }
  // the flare: a flame while running, a blue pilot otherwise
  { const [fx, fy] = P(...L.flare);
    if (on) { const fh = 0.9 * M * (1 + 0.18 * Math.sin(t * 9) + 0.08 * Math.sin(t * 23)), sway = Math.sin(t * 2.3) * 0.1 * M;
      const flame = (w, h, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(fx - w, fy); ctx.quadraticCurveTo(fx - w * 1.1, fy - h * 0.5, fx + sway, fy - h); ctx.quadraticCurveTo(fx + w * 1.1, fy - h * 0.5, fx + w, fy); ctx.fill(); };
      _amLed(fx, fy - fh * 0.4, 1.0 * M, '255,140,40', 0.25); flame(0.25 * M, fh, 'rgba(255,110,30,0.85)'); flame(0.15 * M, fh * 0.65, 'rgba(255,220,90,0.95)');
    } else { ctx.fillStyle = 'rgba(90,150,255,0.7)'; ctx.beginPath(); ctx.arc(fx, fy - 0.08 * M, 0.08 * M, 0, TAU); ctx.fill(); } }
  _wfGaugeAt(F, L.gauge, fill, accent, on);
  _wfPlate('OIL SLUDGE TREATMENT', px + W * 0.40, py + H * 0.05, S, accent, on);
  _wfLamp(px + W - 11 * S, py + 11 * S, S, t, accent, on);
  ctx.restore();
}


/* ── Carbon Capture Plant, rendered (scripts/render_civic2.py cc; layout in
   CIV2_LAYOUT). Live: twelve contactor fans turning with the sorbent glow
   under them, smog drawn in when there is smog, a technician's lamp on the
   catwalk, the desorber's steam jacket cycling and its vapour and warning
   lamp, the CO2 cylinder gauges, the compression hall's roof shimmer and
   windows, the control windows and the CO2 CAPTURED board, and the injection
   pulses at the wellhead. The placement ghost keeps the painted plant and
   its capture radius. Default size only. */
function _ccArt(e, px, py, t) {
  const L = CIV2_LAYOUT.cc, F = _anFrame(e, px, py), { P, M } = F, S = TILE / 40, TAU = Math.PI * 2;
  const on = !!e.powered && !e._lightningDamaged, dark = DayNight.darkness(), night = on && dark > 0.3, detail = Camera.zoom > 0.35;
  const smog = on && typeof PollutionSystem !== 'undefined' ? Math.min(1, PollutionSystem.concAt(e.col + 5, e.row + 4) / 40) : 0;
  ctx.save();
  F.draw(AdvNukeArt.get('cc_base'), L.rect);
  L.fans.forEach(([x, y, z, r], i) => {
    const [fx, fy] = P(x, y, z);
    if (on && detail) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; _anGlow(fx, fy, r * M, '110,240,180', 0.18 + 0.08 * Math.sin(t * 1.5 + i)); ctx.restore(); }
    _anFan(F, x, y, z, r, on ? t * (5 + i % 2) : i * 0.4);
    if (on && detail && smog > 0.03) for (let k = 0; k < 2; k++) { const p = (t * 0.45 + k / 2 + i * 0.17) % 1, a = i * 1.9 + k * 2.1 + p * 2.4, d = r * (1 + 1.6 * (1 - p)) * M;
      ctx.fillStyle = `rgba(120,100,62,${(Math.min(0.85, 0.3 + 0.6 * smog) * Math.sin(p * Math.PI)).toFixed(3)})`; ctx.beginPath(); ctx.arc(fx + Math.cos(a) * d, fy + Math.sin(a) * d * 0.8, (0.1 + 0.15 * (1 - p)) * M, 0, TAU); ctx.fill(); }
  });
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  { const [x, y, z] = L.jacket, heat = on ? 0.5 + 0.5 * Math.sin(t * 0.6) : 0, [jx, jy] = P(x, y, z); if (heat > 0.3) _anGlow(jx, jy, 1.0 * M, '255,140,70', (heat - 0.3) * 0.6); }
  { const [x, y, z] = L.desorber, [dx, dy] = P(x, y, z); if (on && Math.sin(t * 3) > 0) _anGlow(dx, dy - 0.1 * M, (night ? 0.5 : 0.2) * M, '255,58,42', 0.9); }
  L.cyls.forEach(([g0, g1, gy, z0, z1], i) => { const [ax, ay] = P(g0, gy, z1), [bx, by] = P(g1, gy, z0), f = on ? Math.min(1, 0.35 + 0.5 * ((t * 0.05) % 1) + i * 0.1) : 0.2;
    ctx.fillStyle = on ? 'rgba(96,240,168,0.85)' : 'rgba(42,74,58,0.9)'; ctx.fillRect(ax, by - (by - ay) * f, bx - ax, (by - ay) * f); });
  if (night) [...L.wins, ...L.hallWins].forEach(([x, y, z], k) => { const [wx, wy] = P(x, y, z); _anGlow(wx, wy, 0.5 * M, '255,225,160', 0.45); });
  if (night) { const [dx, dy] = P(...L.door); _anGlow(dx, dy, 0.7 * M, '255,225,160', 0.4); }
  if (on && night && detail) { const [c0, c1, cy, cz] = L.catwalk, u = (t * 0.08) % 1, [lx, ly] = P(c0 + (c1 - c0) * u, cy, cz); _anGlow(lx, ly, 0.3 * M, '255,230,170', 0.7); }
  ctx.restore();
  { const [x, y, z] = L.desorber, [vx, vy] = P(x, y, z); if (on) _scrubberVapour(vx, vy, S, t, 5, 0.8); }
  if (on && detail) L.hallVents.forEach(([x, y, z], k) => { for (let q = 0; q < 2; q++) { const p = (t * 0.8 + q / 2) % 1, [vx, vy] = P(x, y, z);
    ctx.fillStyle = `rgba(255,255,255,${(0.2 * (1 - p)).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(vx + Math.sin(t * 3 + q) * 0.08 * M, vy - p * 0.5 * M, (0.1 + p * 0.1) * M, 0.06 * M, 0, 0, TAU); ctx.fill(); } });
  if (on && detail) { const [wx, wy] = P(...L.well); for (let k = 0; k < 3; k++) { const p = (t * 0.5 + k / 3) % 1;
    ctx.strokeStyle = `rgba(100,240,170,${(0.5 * (1 - p)).toFixed(3)})`; ctx.lineWidth = Math.max(0.8, 0.05 * M); ctx.beginPath(); ctx.ellipse(wx, wy, (0.3 + p * 1.2) * M, (0.15 + p * 0.6) * M, 0, 0, TAU); ctx.stroke(); } }
  if (typeof _civText === 'function') _civText(F, L.hallSign, 'COMPRESSION', on ? '#e8eef0' : '#6a6e70');
  if (L.board && typeof _amBoardText === 'function') {
    const tonnes = typeof PollutionSystem !== 'undefined' ? PollutionSystem.capturedTonnes() : 0;
    _amBoardText(F, L.board, [['CO₂ CAPTURED', '112,240,176', 0.8], [`${Math.floor(tonnes).toLocaleString('en-US')} t`, '112,240,176', 1.4]], on);
  }
  ctx.restore();
}
