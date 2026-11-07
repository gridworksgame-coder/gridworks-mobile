/* ═══════════════════════════════════════════════════════════════════
   ADVANCED FUSION REACTOR — sprite
   A five-period stellarator on a decagonal shield pad: the plasma is a
   twisted, bean-to-triangle band held by fifty non-planar modular coils,
   with no central solenoid (a stellarator needs no plasma current), just a
   support wheel and pumping tower in the middle. Around it, in the
   unrotated frame:
     top-left     — cryoplant (cold boxes, liquid-helium dewars) on LHe IN
     top-right    — helium recovery (fusion ash) on HE ASH OUT
     left         — D-He3 pellet injector on PELLETS IN
     right        — two direct energy converters, one per ION OUT, each fed
                    by a magnetic expander duct off the plasma edge
     bottom-left  — gyrotron hall, waveguides fanning in to the vessel
     bottom-right — superconducting magnetic energy storage (SMES) yard
     bottom       — twin neutral-beam injectors and the control room
   Running, the coils chase, the plasma braids gold and violet round the
   twisted band, ion beams stream out to the converters, microwave pulses
   run down the waveguides and the beams fire. Charging, the SMES rings fill
   amber and the coils light one by one. Drawn in its unrotated frame
   (_plantFrame) so the art meets AdvancedFusionReactorSystem.getStubs() on
   every rotation. Shares the _wf* / _fc* / _port* helpers.
   ═══════════════════════════════════════════════════════════════════ */

// ── Plant kit ──
// Detail for a building this size. U is a thousandth of the reactor's
// footprint, so every part keeps its proportions whatever the size. Lit
// from the top left like every sprite, shadows cast down and right.
const _afrRnd = (s) => { const x = Math.sin(s * 12.9898 + 4.1414) * 43758.5453; return x - Math.floor(x); };

// Steel floor grating (a repeating pattern, scaled with the sprite).
let _afrGratePat = null;
function _afrGrate(x, y, w, h, U) {
  if (!_afrGratePat) {
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const g = c.getContext('2d');
    g.fillStyle = '#20242a'; g.fillRect(0, 0, 8, 8);
    g.fillStyle = '#4c535c'; g.fillRect(0, 0, 8, 2); g.fillRect(0, 0, 1, 8);
    g.fillStyle = '#69717b'; g.fillRect(0, 0, 8, 1);
    _afrGratePat = g.createPattern(c, 'repeat');
  }
  _afrGratePat.setTransform(new DOMMatrix([U * 0.9, 0, 0, U * 0.9, x, y]));
  ctx.fillStyle = _afrGratePat; ctx.fillRect(x, y, w, h);
}

// Concrete plinth: bevelled edge, weathering, expansion joints.
function _afrSlab(x, y, w, h, U, seed = 1) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.roundRect(x + 5 * U, y + 6 * U, w, h, 4 * U); ctx.fill();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#6d7075'); g.addColorStop(1, '#4a4d52');
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, w, h, 4 * U); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, 4 * U); ctx.clip();
  for (let q = 0; q < 6; q++) {
    const sx = x + w * _afrRnd(seed * 7 + q), sy = y + h * _afrRnd(seed * 13 + q * 3), r = Math.min(w, h) * (0.12 + 0.22 * _afrRnd(seed + q * 5));
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    sg.addColorStop(0, q % 2 ? 'rgba(0,0,0,0.11)' : 'rgba(255,255,255,0.05)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg; ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.8 * U;
  const step = Math.max(30 * U, Math.min(w, h) / 3);
  ctx.beginPath();
  for (let sx = x + step; sx < x + w - 4 * U; sx += step) { ctx.moveTo(sx, y); ctx.lineTo(sx, y + h); }
  for (let sy = y + step; sy < y + h - 4 * U; sy += step) { ctx.moveTo(x, sy); ctx.lineTo(x + w, sy); }
  ctx.stroke();
  ctx.restore();
  ctx.lineWidth = 1.6 * U;
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath(); ctx.moveTo(x + 2 * U, y + h - 3 * U); ctx.lineTo(x + 2 * U, y + 2 * U); ctx.lineTo(x + w - 3 * U, y + 2 * U); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.moveTo(x + w - 2 * U, y + 3 * U); ctx.lineTo(x + w - 2 * U, y + h - 2 * U); ctx.lineTo(x + 3 * U, y + h - 2 * U); ctx.stroke();
  ctx.strokeStyle = '#1c1e22'; ctx.lineWidth = 1.2 * U; ctx.beginPath(); ctx.roundRect(x, y, w, h, 4 * U); ctx.stroke();
}

// A ring of bolt heads.
function _afrBolts(cx, cy, r, n, U, s = 1.1) {
  for (let q = 0; q < n; q++) {
    const a = q * Math.PI * 2 / n, bx = cx + Math.cos(a) * r, by = cy + Math.sin(a) * r;
    ctx.fillStyle = '#1a1e24'; ctx.beginPath(); ctx.arc(bx, by, s * U, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(bx - s * 0.35 * U, by - s * 0.35 * U, s * 0.45 * U, 0, Math.PI * 2); ctx.fill();
  }
}

// Glass roof light with mullions and a sky reflection; `glow` lights it
// from below.
function _afrGlass(x, y, w, h, U, glow) {
  ctx.fillStyle = '#161c22'; ctx.fillRect(x - 1.6 * U, y - 1.6 * U, w + 3.2 * U, h + 3.2 * U);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#7aa2bc'); g.addColorStop(0.45, '#2e4a5e'); g.addColorStop(1, '#18242f');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  if (glow) { ctx.fillStyle = glow; ctx.fillRect(x, y, w, h); }
  const horiz = w >= h, L = horiz ? w : h, n = Math.max(2, Math.round(L / (11 * U)));
  ctx.strokeStyle = '#11161b'; ctx.lineWidth = 0.9 * U; ctx.beginPath();
  for (let q = 1; q < n; q++) {
    if (horiz) { const sx = x + w * q / n; ctx.moveTo(sx, y); ctx.lineTo(sx, y + h); }
    else { const sy = y + h * q / n; ctx.moveTo(x, sy); ctx.lineTo(x + w, sy); }
  }
  if (horiz && h > 14 * U) { ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); }
  ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  const s = Math.max(w, h);
  ctx.beginPath(); ctx.moveTo(x + s * 0.1, y); ctx.lineTo(x + s * 0.22, y); ctx.lineTo(x + s * 0.22 - s * 0.3, y + s * 0.3); ctx.lineTo(x + s * 0.1 - s * 0.3, y + s * 0.3); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(205,228,242,0.5)'; ctx.lineWidth = 0.6 * U; ctx.strokeRect(x, y, w, h);
}

// Rooftop air handler: finned coil and a grilled fan.
function _afrHvac(cx, cy, s, U, t, spin) {
  const w = s, h = s * 0.62, x = cx - w / 2, y = cy - h / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(x + 3 * U, y + 4 * U, w, h);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#d2d8de'); g.addColorStop(1, '#7c848c');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#262a30'; ctx.lineWidth = 0.8 * U; ctx.strokeRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(30,34,40,0.5)'; ctx.lineWidth = 0.5 * U; ctx.beginPath();
  for (let fx = x + w * 0.06; fx < x + w * 0.4; fx += 1.5 * U) { ctx.moveTo(fx, y + h * 0.14); ctx.lineTo(fx, y + h * 0.86); }
  ctx.stroke();
  const fr = Math.min(h * 0.4, w * 0.24), fx = x + w * 0.7;
  ctx.fillStyle = '#101418'; ctx.beginPath(); ctx.arc(fx, cy, fr, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5c646c'; ctx.lineWidth = 0.9 * U; ctx.stroke();
  ctx.save(); ctx.translate(fx, cy); ctx.rotate(spin ? t * 9 : 0.6);
  ctx.fillStyle = '#9aa4ac';
  for (let b = 0; b < 3; b++) { ctx.rotate(Math.PI * 2 / 3); ctx.beginPath(); ctx.ellipse(fr * 0.45, 0, fr * 0.45, fr * 0.16, 0.4, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  ctx.strokeStyle = 'rgba(170,180,190,0.35)'; ctx.lineWidth = 0.4 * U;
  ctx.beginPath(); ctx.arc(fx, cy, fr * 0.5, 0, Math.PI * 2); ctx.moveTo(fx + fr * 0.85, cy); ctx.arc(fx, cy, fr * 0.85, 0, Math.PI * 2);
  ctx.moveTo(fx - fr, cy); ctx.lineTo(fx + fr, cy); ctx.moveTo(fx, cy - fr); ctx.lineTo(fx, cy + fr); ctx.stroke();
}

// Mushroom vent on a roof.
function _afrVent(cx, cy, U, r = 3.2) {
  ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.arc(cx + 1.6 * U, cy + 2 * U, r * U, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(cx - r * 0.4 * U, cy - r * 0.4 * U, 0.2 * U, cx, cy, r * U);
  g.addColorStop(0, '#e2e6ea'); g.addColorStop(1, '#6a7078');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * U, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#22262c'; ctx.lineWidth = 0.6 * U; ctx.stroke();
}

// Flat-roofed building: south wall (lit windows), membrane roof with
// standing seams, parapet, and whatever sits on top.
//   o.skylights [[fx, fy, fw, fh]], o.glow, o.units [[fx, fy, fs]],
//   o.vents [[fx, fy]], o.windows, o.lit, o.spin, o.roof [c0, c1]
function _afrRoof(x, y, w, h, U, t, o = {}) {
  const wallH = o.wallH ?? Math.min(h * 0.12, 9 * U);
  ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.fillRect(x + 7 * U, y + 9 * U, w, h);
  const wg = ctx.createLinearGradient(0, y + h - wallH, 0, y + h);
  wg.addColorStop(0, '#4a5058'); wg.addColorStop(1, '#262a30');
  ctx.fillStyle = wg; ctx.fillRect(x, y + h - wallH, w, wallH);
  if (o.windows) {
    const n = Math.max(3, Math.floor(w / (16 * U)));
    for (let q = 0; q < n; q++) {
      const wx = x + 4 * U + q * (w - 8 * U) / n, ww = (w - 8 * U) / n - 3 * U;
      ctx.fillStyle = o.lit ? `rgba(255,${214 + (q * 37) % 36},${150 + (q * 23) % 60},${(0.82 + 0.15 * Math.sin(t * 0.7 + q * 2.1)).toFixed(3)})` : '#161a20';
      ctx.fillRect(wx, y + h - wallH * 0.72, ww, wallH * 0.45);
    }
  }
  const rh = h - wallH;
  const roof = o.roof || ['#8f969e', '#5b6169'];
  const rg = ctx.createLinearGradient(x, y, x + w * 0.7, y + rh);
  rg.addColorStop(0, roof[0]); rg.addColorStop(1, roof[1]);
  ctx.fillStyle = rg; ctx.fillRect(x, y, w, rh);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, rh); ctx.clip();
  const seam = o.seam || 9 * U;
  ctx.lineWidth = 0.7 * U;
  ctx.strokeStyle = 'rgba(255,255,255,0.11)'; ctx.beginPath();
  for (let sx = x + seam; sx < x + w; sx += seam) { ctx.moveTo(sx, y); ctx.lineTo(sx, y + rh); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath();
  for (let sx = x + seam; sx < x + w; sx += seam) { ctx.moveTo(sx + 0.9 * U, y); ctx.lineTo(sx + 0.9 * U, y + rh); }
  ctx.stroke();
  const ps = 8 * U;
  let sg = ctx.createLinearGradient(0, y, 0, y + ps); sg.addColorStop(0, 'rgba(0,0,0,0.32)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg; ctx.fillRect(x, y, w, ps);
  sg = ctx.createLinearGradient(x, 0, x + ps, 0); sg.addColorStop(0, 'rgba(0,0,0,0.32)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg; ctx.fillRect(x, y, ps, rh);
  ctx.restore();
  ctx.strokeStyle = o.parapet || '#b2b8c0'; ctx.lineWidth = 2.6 * U; ctx.strokeRect(x + 1.3 * U, y + 1.3 * U, w - 2.6 * U, rh - 2.6 * U);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.8 * U; ctx.strokeRect(x + 2.9 * U, y + 2.9 * U, w - 5.8 * U, rh - 5.8 * U);
  ctx.strokeStyle = 'rgba(10,12,16,0.9)'; ctx.lineWidth = 1 * U; ctx.strokeRect(x, y, w, h);
  for (const [fx, fy, fw, fh] of (o.skylights || [])) _afrGlass(x + w * fx, y + rh * fy, w * fw, rh * fh, U, o.glow);
  for (const [fx, fy, fs] of (o.units || [])) _afrHvac(x + w * fx, y + rh * fy, Math.min(w, rh) * fs, U, t, o.spin);
  for (const [fx, fy] of (o.vents || [])) _afrVent(x + w * fx, y + rh * fy, U);
  return rh;
}

// Flanged vessel seen from above: bolted flange, dished head, nozzle, and
// optionally frost or a status lamp.
function _afrVessel(cx, cy, r, U, o = {}) {
  ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.beginPath(); ctx.arc(cx + r * 0.12 + 2 * U, cy + r * 0.15 + 3 * U, r, 0, Math.PI * 2); ctx.fill();
  const shell = o.shell || ['#eef2f6', '#a4aeb8', '#48505a'];
  ctx.fillStyle = o.flange || '#59616b'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#14181c'; ctx.lineWidth = 1 * U; ctx.stroke();
  _afrBolts(cx, cy, r * 0.9, o.bolts ?? Math.max(8, Math.min(24, Math.round(r / (2.6 * U)))), U, Math.max(0.6, Math.min(1.3, r / (16 * U))));
  const dr = r * 0.8;
  const g = ctx.createRadialGradient(cx - dr * 0.4, cy - dr * 0.45, dr * 0.05, cx, cy, dr);
  g.addColorStop(0, shell[0]); g.addColorStop(0.55, shell[1]); g.addColorStop(1, shell[2]);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, dr, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(10,12,16,0.8)'; ctx.lineWidth = 0.8 * U; ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 0.7 * U; ctx.beginPath(); ctx.arc(cx, cy, dr * 0.62, 0, Math.PI * 2); ctx.stroke();
  if (o.nozzle !== false) {
    const nx = cx + dr * 0.36, ny = cy - dr * 0.3, nr = dr * 0.17;
    ctx.fillStyle = '#9aa2aa'; ctx.beginPath(); ctx.arc(nx, ny, nr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#30363e'; ctx.beginPath(); ctx.arc(nx, ny, nr * 0.6, 0, Math.PI * 2); ctx.fill();
  }
  if (o.frost > 0) {
    ctx.strokeStyle = `rgba(232,248,255,${(o.frost * 0.5).toFixed(3)})`; ctx.lineWidth = 2.2 * U;
    ctx.beginPath(); ctx.arc(cx, cy, dr - 1.2 * U, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = `rgba(236,250,255,${(o.frost * 0.75).toFixed(3)})`;
    for (let q = 0; q < 22; q++) { const a = q * 2.399, rr = dr * (0.3 + ((q * 0.618) % 1) * 0.62); ctx.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.3 * U, 1.3 * U); }
  }
  if (o.lamp) {
    ctx.fillStyle = o.lamp; ctx.beginPath(); ctx.arc(cx - dr * 0.42, cy + dr * 0.42, Math.max(1.4 * U, dr * 0.1), 0, Math.PI * 2); ctx.fill();
  }
}

// Insulated pipe along a polyline: jacket, highlight, flanges at joints and
// along runs, and flow dashes while it runs.
function _afrPipe(pts, U, t, on, color, r = 3.2, o = {}) {
  const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); };
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = r * 2 * U;
  ctx.translate(3 * U, 4 * U); path(); ctx.stroke(); ctx.translate(-3 * U, -4 * U);
  ctx.strokeStyle = '#121519'; ctx.lineWidth = (r * 2 + 1.4) * U; path(); ctx.stroke();
  ctx.strokeStyle = o.jacket || '#8d97a2'; ctx.lineWidth = r * 2 * U; path(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.38)'; ctx.lineWidth = r * 0.55 * U;
  ctx.translate(-r * 0.4 * U, -r * 0.4 * U); path(); ctx.stroke(); ctx.translate(r * 0.4 * U, r * 0.4 * U);
  ctx.fillStyle = '#3a414a';
  const step = o.flangeStep || 64 * U;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 1) continue;
    const ux = (x1 - x0) / L, uy = (y1 - y0) / L, an = Math.atan2(uy, ux);
    for (let d = i ? 0 : Math.min(step * 0.5, L * 0.5); d < L; d += step) {
      ctx.save(); ctx.translate(x0 + ux * d, y0 + uy * d); ctx.rotate(an);
      ctx.fillRect(-1.1 * U, -(r + 1.2) * U, 2.2 * U, (r * 2 + 2.4) * U);
      ctx.restore();
    }
  }
  if (on && color) {
    ctx.strokeStyle = color; ctx.lineWidth = r * 0.7 * U;
    ctx.setLineDash([5 * U, 9 * U]); ctx.lineDashOffset = -t * 30 * U;
    path(); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }
  ctx.restore();
}

// Pipe trench let into the slab: a concrete channel with grating lids and
// the pipe showing between them. Flush with the floor, so anything drawn
// after it (ducts, bus bars, buildings) passes over it cleanly.
function _afrTrench(pts, U, t, on, color) {
  const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); };
  ctx.save();
  ctx.lineJoin = 'miter'; ctx.lineCap = 'square';
  ctx.strokeStyle = '#4e5258'; ctx.lineWidth = 19 * U; path(); ctx.stroke();       // kerb
  ctx.strokeStyle = '#121418'; ctx.lineWidth = 15 * U; path(); ctx.stroke();       // channel
  ctx.strokeStyle = '#7d8792'; ctx.lineWidth = 6 * U; path(); ctx.stroke();        // pipe
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.6 * U;
  ctx.translate(-1.4 * U, -1.4 * U); path(); ctx.stroke(); ctx.translate(1.4 * U, 1.4 * U);
  if (on && color) {
    ctx.strokeStyle = color; ctx.lineWidth = 2.2 * U; ctx.lineCap = 'round';
    ctx.setLineDash([5 * U, 9 * U]); ctx.lineDashOffset = -t * 30 * U; path(); ctx.stroke();
  }
  _afrGrate(0, 0, 0, 0, U);                                                         // makes sure the pattern exists
  _afrGratePat.setTransform(new DOMMatrix([U * 0.9, 0, 0, U * 0.9, 0, 0]));
  ctx.strokeStyle = _afrGratePat; ctx.lineWidth = 14 * U; ctx.lineCap = 'butt';
  ctx.setLineDash([30 * U, 9 * U]); ctx.lineDashOffset = 0; path(); ctx.stroke();  // lids, gaps between
  ctx.setLineDash([]);
  ctx.restore();
}

// Storage sphere on legs: shell, seams, spiral stair, top platform, and a
// fill ring round it in `accent`.
function _afrSphere(cx, cy, r, U, t, o = {}) {
  const TAU = Math.PI * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.beginPath(); ctx.arc(cx + r * 0.16, cy + r * 0.2, r * 1.02, 0, TAU); ctx.fill();
  const legs = o.legs ?? 8;
  for (let q = 0; q < legs; q++) {
    const a = q * TAU / legs + Math.PI / legs, lx = cx + Math.cos(a) * r * 0.97, ly = cy + Math.sin(a) * r * 0.97;
    ctx.fillStyle = '#3e454e'; ctx.fillRect(lx - 2.4 * U, ly - 2.4 * U, 4.8 * U, 4.8 * U);
    ctx.fillStyle = '#7a848e'; ctx.fillRect(lx - 2.4 * U, ly - 2.4 * U, 4.8 * U, 1.2 * U);
  }
  const g = ctx.createRadialGradient(cx - r * 0.38, cy - r * 0.42, r * 0.04, cx, cy, r);
  const sh = o.shell || ['#ffffff', '#d6dde2', '#8c96a0', '#3c444c'];
  g.addColorStop(0, sh[0]); g.addColorStop(0.35, sh[1]); g.addColorStop(0.75, sh[2]); g.addColorStop(1, sh[3]);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#14181c'; ctx.lineWidth = 1 * U; ctx.stroke();
  ctx.strokeStyle = 'rgba(40,50,60,0.2)'; ctx.lineWidth = 0.7 * U;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, TAU); ctx.moveTo(cx + r * 0.82, cy); ctx.arc(cx, cy, r * 0.82, 0, TAU); ctx.stroke();
  for (let q = 0; q < 8; q++) { const a = q * TAU / 8; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.24, cy + Math.sin(a) * r * 0.24); ctx.lineTo(cx + Math.cos(a) * r * 0.97, cy + Math.sin(a) * r * 0.97); ctx.stroke(); }
  if (o.stair !== false) {
    const a0 = o.stairAt ?? 0.3;
    ctx.strokeStyle = '#2a2e34'; ctx.lineWidth = 3.4 * U;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.93, a0, a0 + 1.6); ctx.stroke();
    ctx.strokeStyle = '#d8b030'; ctx.lineWidth = 1 * U; ctx.setLineDash([1.6 * U, 1.4 * U]);
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.93, a0, a0 + 1.6); ctx.stroke(); ctx.setLineDash([]);
  }
  const pr = r * 0.22;
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, pr, 0, TAU); ctx.clip(); _afrGrate(cx - pr, cy - pr, pr * 2, pr * 2, U); ctx.restore();
  ctx.strokeStyle = '#d8b030'; ctx.lineWidth = 1 * U; ctx.beginPath(); ctx.arc(cx, cy, pr, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#50585f'; ctx.beginPath(); ctx.arc(cx + pr * 0.35, cy - pr * 0.2, pr * 0.32, 0, TAU); ctx.fill();
  ctx.fillStyle = '#c03828'; ctx.beginPath(); ctx.arc(cx - pr * 0.4, cy + pr * 0.35, pr * 0.16, 0, TAU); ctx.fill();
  if (o.frost > 0) {
    ctx.fillStyle = `rgba(236,250,255,${(o.frost * 0.7).toFixed(3)})`;
    for (let q = 0; q < 30; q++) { const a = q * 2.399, rr = r * (0.3 + ((q * 0.618) % 1) * 0.66); ctx.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.4 * U, 1.4 * U); }
  }
  if (o.fill !== undefined) {
    const rr = r + 5 * U;
    ctx.strokeStyle = '#12161a'; ctx.lineWidth = 3.4 * U; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke();
    if (o.fill > 0) {
      const warn = o.on && o.fill > 0.85 && Math.sin(t * 6) > 0;
      ctx.strokeStyle = warn ? '#ff5030' : o.accent; ctx.globalAlpha = o.on ? 0.95 : 0.5; ctx.lineWidth = 2.2 * U;
      ctx.beginPath(); ctx.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, o.fill)); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  if (o.label) {
    ctx.fillStyle = 'rgba(30,40,46,0.75)';
    ctx.font = `bold ${Math.max(5, r * 0.2)}px Courier New`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(o.label, cx - r * 0.42, cy + r * 0.52); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
}

// Bank of fans in a steel deck (air coolers, aftercoolers).
function _afrFanDeck(x, y, w, h, U, t, on, n, spd = 7) {
  ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(x + 4 * U, y + 5 * U, w, h);
  ctx.fillStyle = '#2b3036'; ctx.fillRect(x, y, w, h);
  const cell = w / n, fr = Math.min(cell, h) * 0.42;
  for (let q = 0; q < n; q++) {
    const fx = x + cell * (q + 0.5), fy = y + h / 2;
    const pg = ctx.createLinearGradient(x + cell * q, y, x + cell * (q + 1), y + h);
    pg.addColorStop(0, '#5a626c'); pg.addColorStop(1, '#353b43');
    ctx.fillStyle = pg; ctx.fillRect(x + cell * q + 1.4 * U, y + 1.4 * U, cell - 2.8 * U, h - 2.8 * U);
    ctx.fillStyle = '#0d1013'; ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8a949e'; ctx.lineWidth = 1.3 * U; ctx.stroke();
    ctx.save(); ctx.translate(fx, fy); ctx.rotate(on ? t * spd + q * 1.3 : q * 0.7);
    ctx.fillStyle = '#909ca6';
    for (let b = 0; b < 5; b++) { ctx.rotate(Math.PI * 2 / 5); ctx.beginPath(); ctx.ellipse(fr * 0.5, 0, fr * 0.44, fr * 0.13, 0.35, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(160,170,180,0.3)'; ctx.lineWidth = 0.45 * U; ctx.beginPath();
    for (const f of [0.4, 0.7]) { ctx.moveTo(fx + fr * f, fy); ctx.arc(fx, fy, fr * f, 0, Math.PI * 2); }
    ctx.moveTo(fx - fr, fy); ctx.lineTo(fx + fr, fy); ctx.moveTo(fx, fy - fr); ctx.lineTo(fx, fy + fr); ctx.stroke();
    ctx.fillStyle = '#262c32'; ctx.beginPath(); ctx.arc(fx, fy, fr * 0.16, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#d8b030'; ctx.lineWidth = 0.9 * U; ctx.beginPath(); ctx.moveTo(x, y + 0.8 * U); ctx.lineTo(x + w, y + 0.8 * U); ctx.stroke();
  ctx.strokeStyle = '#14181c'; ctx.lineWidth = 1 * U; ctx.strokeRect(x, y, w, h);
}

// Process column from above: skirt shadow, grated platforms with railings
// round the shell, a dished head and a davit.
function _afrColumnTop(cx, cy, r, U) {
  const TAU = Math.PI * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.beginPath(); ctx.ellipse(cx + r * 0.9, cy + r * 1.1, r * 1.1, r * 1.05, 0.6, 0, TAU); ctx.fill();
  for (const [a0, a1, rr] of [[-0.7, 1.3, 1.75], [1.9, 3.5, 1.55], [3.8, 5.3, 1.9]]) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r * rr, a0, a1); ctx.arc(cx, cy, r * 0.98, a1, a0, true); ctx.closePath(); ctx.clip();
    _afrGrate(cx - r * 2, cy - r * 2, r * 4, r * 4, U); ctx.restore();
    ctx.strokeStyle = '#d8b030'; ctx.lineWidth = 0.9 * U; ctx.beginPath(); ctx.arc(cx, cy, r * rr, a0, a1); ctx.stroke();
  }
  const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.05, cx, cy, r);
  g.addColorStop(0, '#eef2f6'); g.addColorStop(0.55, '#a2acb6'); g.addColorStop(1, '#46505a');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#14181c'; ctx.lineWidth = 0.9 * U; ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#353c44'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.18, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#e0b830'; ctx.lineWidth = 1.4 * U;
  ctx.beginPath(); ctx.moveTo(cx + r * 0.4, cy - r * 0.4); ctx.lineTo(cx + r * 1.25, cy - r * 1.05); ctx.stroke();
  ctx.fillStyle = '#2a2e34'; ctx.fillRect(cx + r * 1.2, cy - r * 1.1, 2 * U, 2 * U);
}

function renderAdvancedFusionReactor(e, px, py, t) {
  const def = EntityDefs[T.ADVFUSIONREACTOR];
  const f = _plantFrame(e, px, py, T.ADVFUSIONREACTOR);
  const W = f.bw, H = f.bh;
  const tilesW = Math.round(W / TILE), tilesH = Math.round(H / TILE);
  const cx = W / 2, cy = H / 2, m = Math.min(W, H);
  const S = TILE / 40;
  const k = m / (8 * TILE);                     // detail scale, 6 at 48×48
  const on  = !!e.powered;
  const gen = !!e._generating;
  const charging = on && !e._started && !!e._magnetsReady;
  const chargeP = charging ? _fusionChargeFrac(e, def) : 0;
  const igniteP = _fusionIgnitePhase(e, t);          // -1 unless the ignition is playing
  const K = e._magnetK;                         // undefined on a ghost
  const cold = K !== undefined && K < 20;
  const venting = (e._quenchVent || 0) > 0;
  const accent = '#c890ff', gold = '#ffd890', ion = '#b478ff';
  const U = m / 1000;                          // plant-kit unit (_afr*)
  const TAU = Math.PI * 2;

  // ── Stellarator geometry ──
  const NP = 5;                                 // field periods
  const R  = m * 0.285;                         // cryostat radius
  const Rp = m * 0.205;                         // magnetic axis, mean radius
  const tw0 = m * 0.036;                        // plasma half-width, mean
  const axR   = (a) => Rp * (1 + 0.085 * Math.cos(NP * a));
  const halfW = (a) => tw0 * (1 + 0.42 * Math.cos(NP * a + Math.PI));
  const at = (a, off = 0) => { const r = axR(a) + off; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  const NB = 200;
  // The twisted band (plasma or vessel) as a ring-shaped path.
  const bandPath = (scale, extra) => {
    ctx.beginPath();
    for (let q = 0; q <= NB; q++) { const a = q * TAU / NB; const [x, y] = at(a, halfW(a) * scale + extra); q ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath();
    for (let q = NB; q >= 0; q--) { const a = q * TAU / NB; const [x, y] = at(a, -(halfW(a) * scale + extra)); q === NB ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.closePath();
  };
  const edgePath = (sign, scale, extra) => {
    ctx.beginPath();
    for (let q = 0; q <= NB; q++) { const a = q * TAU / NB; const [x, y] = at(a, sign * (halfW(a) * scale + extra)); q ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath();
  };
  const rim = (a, r = R) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];

  // Port anchors in the local frame (match getStubs).
  const pIn  = [0, (Math.floor(tilesH / 2) + 0.5) * TILE];
  const pA   = [W, (Math.round(tilesH * 0.3) + 0.5) * TILE];
  const pB   = [W, (Math.round(tilesH * 0.7) + 0.5) * TILE];
  const pCry = [(Math.round(tilesW * 0.3) + 0.5) * TILE, 0];
  const pAsh = [(Math.round(tilesW * 0.7) + 0.5) * TILE, 0];
  const pCool = [(Math.floor(tilesW / 2) + 0.5) * TILE, H];

  // Building labels are queued and drawn after leaving the local frame:
  // _frameText maps to world space itself, and drawing it under f.apply()
  // would offset it twice (and mirror it on rotated frames).
  const labels = [];
  const label = (x, y, text, col) => labels.push([x, y, text, col || (on ? '#cfd6e0' : '#7a8290')]);

  ctx.save();
  f.apply();

  // ── Shield pad (decagon, for the five field periods) ──
  const padR = m * 0.47;
  const deca = (r) => { ctx.beginPath(); for (let q = 0; q < 10; q++) { const a = -Math.PI / 2 + q * TAU / 10; const X = cx + Math.cos(a) * r, Y = cy + Math.sin(a) * r; q ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.closePath(); };
  ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.save(); ctx.translate(8 * S, 10 * S); deca(padR); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#383c46'; deca(padR); ctx.fill();
  ctx.strokeStyle = '#16181e'; ctx.lineWidth = 3 * S; ctx.stroke();
  ctx.fillStyle = '#2a2e37'; deca(padR * 0.95); ctx.fill();
  // poured-slab joints
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.2 * S;
  for (let q = 0; q < 10; q++) { const a = -Math.PI / 2 + q * TAU / 10; ctx.beginPath(); ctx.moveTo(...rim(a, R + 10 * S)); ctx.lineTo(...rim(a, padR * 0.95)); ctx.stroke(); }
  for (const rr of [0.36, 0.42]) { deca(m * rr); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(216,168,32,0.55)'; ctx.lineWidth = 4 * S; ctx.setLineDash([14 * S, 10 * S]); deca(padR * 0.975); ctx.stroke(); ctx.setLineDash([]);

  // weathering: soft light and dark blotches in the slab
  ctx.save(); deca(padR * 0.95); ctx.clip();
  for (let q = 0; q < 9; q++) {
    const a = _afrRnd(q * 3 + 1) * TAU, rr = padR * (0.45 + 0.45 * _afrRnd(q * 7 + 2));
    const bx = cx + Math.cos(a) * rr, by = cy + Math.sin(a) * rr, br = m * (0.06 + 0.08 * _afrRnd(q + 9));
    const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    bg.addColorStop(0, q % 3 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.045)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg; ctx.fillRect(bx - br, by - br, br * 2, br * 2);
  }
  ctx.restore();
  // grated walkway round the cryostat, yellow-edged, with bollards
  {
    const r0 = R + 6 * S, r1 = R + 30 * S;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(cx + 4 * S, cy + 5 * S, r1, 0, TAU); ctx.arc(cx + 4 * S, cy + 5 * S, r0, 0, TAU, true); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r1, 0, TAU); ctx.arc(cx, cy, r0, 0, TAU, true); ctx.clip();
    _afrGrate(cx - r1, cy - r1, r1 * 2, r1 * 2, U);
    ctx.restore();
    ctx.strokeStyle = '#d8a820'; ctx.lineWidth = 2.2 * U;
    ctx.beginPath(); ctx.arc(cx, cy, r0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r1, 0, TAU); ctx.stroke();
    for (let q = 0; q < 40; q++) {
      const a = q * TAU / 40 + TAU / 80, [bx, by] = rim(a, r1 + 7 * S);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(bx + 1.5 * U, by + 2 * U, 3 * U, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e0b028'; ctx.beginPath(); ctx.arc(bx, by, 3 * U, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(bx, by, 1.3 * U, 0, TAU); ctx.fill();
    }
  }

  // ── Floor bloom ──
  if (gen || charging) {
    const pulse = gen ? 0.5 + 0.2 * Math.sin(t * 1.9) : 0.25 + 0.15 * Math.sin(t * 8);
    const fg = ctx.createRadialGradient(cx, cy, Rp * 0.4, cx, cy, padR);
    fg.addColorStop(0,    gen ? `rgba(200,140,255,${pulse * 0.5})` : `rgba(255,200,80,${pulse * 0.4})`);
    fg.addColorStop(0.55, gen ? `rgba(255,190,110,${pulse * 0.18})` : `rgba(255,150,40,${pulse * 0.15})`);
    fg.addColorStop(1, 'rgba(60,20,120,0)');
    ctx.fillStyle = fg; deca(padR * 0.95); ctx.fill();
  }

  // ═══ Surrounding plant ═══
  // Every building sits on its own concrete plinth and is drawn with the
  // plant kit above (_afr*), at U = 1/1000 of the footprint.

  // The direct converters' footprints, needed first by the coolant trench.
  const decs = [pA, pB].map((p) => {
    const dw = m * 0.17, dh = m * 0.13, dx = W - m * 0.03 - dw, dy = p[1] - dh / 2;
    return { p, dx, dy, dw, dh, a: Math.atan2(p[1] - cy, dx - cx) };
  });
  // Coolant header from the heat exchangers up to Direct Converter A, in a
  // floor trench: B's expander duct and the SMES bus cross over it.
  {
    const hw = m * 0.17, hh = m * 0.08, hx0 = cx + hw / 2, hy = H - m * 0.035 - hh + hh * 0.4;
    const hx = W - m * 0.27;
    const ya = decs[0].dy + decs[0].dh * 0.88;
    const coolOn = !!e._coolantLinked || gen;
    _afrTrench([[hx0, hy], [hx, hy], [hx, ya], [decs[0].dx, ya]], U, t, coolOn, 'rgba(122,240,255,0.95)');
  }

  // ── Cryoplant (top-left) on LHe IN ──
  // Compressor hall, two cold boxes stood on end, three liquid-helium
  // dewars and an aftercooler deck.
  {
    const x = m * 0.035, y = m * 0.035, w = m * 0.2, h = m * 0.18;
    const frosty = cold || (on && !!e._cryoRunning);
    const lhe = 'rgba(232,252,255,0.95)';
    _afrSlab(x, y, w, h, U, 11);
    const hx = x + w * 0.04, hy = y + h * 0.06, hw = w * 0.34, hh = h * 0.6;
    _afrRoof(hx, hy, hw, hh, U, t, {
      skylights: [[0.12, 0.12, 0.76, 0.15]], glow: on ? 'rgba(150,215,255,0.3)' : null,
      units: [[0.3, 0.56, 0.4], [0.72, 0.56, 0.4]], vents: [[0.2, 0.88], [0.5, 0.88], [0.8, 0.88]],
      windows: true, lit: on, spin: on });
    const coldBox = (bx, by, bw, bh) => {
      ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.fillRect(bx + 6 * U, by + 8 * U, bw, bh);
      ctx.fillStyle = '#353c45'; ctx.fillRect(bx, by, bw, bh);
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, '#f4f8fa'); g.addColorStop(0.55, '#c6d2da'); g.addColorStop(1, '#7e8e9a');
      ctx.fillStyle = g; ctx.fillRect(bx + 2.2 * U, by + 2.2 * U, bw - 4.4 * U, bh - 4.4 * U);
      ctx.strokeStyle = 'rgba(40,52,62,0.35)'; ctx.lineWidth = 0.7 * U; ctx.beginPath();
      for (let q = 1; q < 6; q++) { const sy = by + bh * q / 6; ctx.moveTo(bx + 2.2 * U, sy); ctx.lineTo(bx + bw - 2.2 * U, sy); }
      ctx.moveTo(bx + bw / 2, by + bh * 0.42); ctx.lineTo(bx + bw / 2, by + bh - 2.2 * U); ctx.stroke();
      ctx.fillStyle = 'rgba(40,50,60,0.55)';
      for (let q = 1; q < 6; q++) for (const fx of [0.14, 0.86]) ctx.fillRect(bx + bw * fx - 0.6 * U, by + bh * q / 6 - 0.6 * U, 1.2 * U, 1.2 * U);
      _afrVessel(bx + bw * 0.5, by + bh * 0.13, bw * 0.3, U, { bolts: 8, nozzle: false, frost: frosty ? 0.6 : 0 });
      _afrVessel(bx + bw * 0.5, by + bh * 0.32, bw * 0.2, U, { bolts: 6, nozzle: false });
      ctx.fillStyle = '#2a2e34'; ctx.fillRect(bx + bw, by + bh * 0.4, 3.6 * U, bh * 0.55);
      ctx.strokeStyle = '#d8b030'; ctx.lineWidth = 0.7 * U; ctx.beginPath();
      for (let sy = by + bh * 0.42; sy < by + bh * 0.95; sy += 3 * U) { ctx.moveTo(bx + bw, sy); ctx.lineTo(bx + bw + 3.6 * U, sy); }
      ctx.stroke();
      if (frosty) {
        const fg = ctx.createRadialGradient(bx + bw / 2, by + bh * 0.6, 0, bx + bw / 2, by + bh * 0.6, bh * 0.5);
        fg.addColorStop(0, 'rgba(240,252,255,0.32)'); fg.addColorStop(1, 'rgba(240,252,255,0)');
        ctx.fillStyle = fg; ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = 'rgba(240,252,255,0.75)';
        for (let q = 0; q < 30; q++) ctx.fillRect(bx + bw * _afrRnd(q + bx), by + bh * _afrRnd(q * 3 + by), 1.3 * U, 1.3 * U);
      }
      ctx.strokeStyle = '#14181c'; ctx.lineWidth = 1 * U; ctx.strokeRect(bx, by, bw, bh);
    };
    const cb = [0, 1].map(q => ({ x: x + w * (0.42 + q * 0.12), y: y + h * 0.07, w: w * 0.1, h: h * 0.6 }));
    // interconnects first, so the boxes and dewars cover their ends
    _afrPipe([[hx + hw, hy + hh * 0.3], [cb[0].x + cb[0].w * 0.5, hy + hh * 0.3]], U, t, on, lhe, 1.8, { flangeStep: 30 * U });
    _afrPipe([[cb[0].x, y + h * 0.5], [cb[1].x + cb[1].w * 0.5, y + h * 0.5]], U, t, frosty, lhe, 1.8, { flangeStep: 30 * U });
    _afrPipe([[cb[1].x + cb[1].w * 0.5, y + h * 0.24], [x + w * 0.785, y + h * 0.24]], U, t, frosty, lhe, 1.8, { flangeStep: 30 * U });
    _afrPipe([[x + w * 0.785, y + h * 0.24], [x + w * 0.785, y + h * 0.58]], U, t, frosty, lhe, 1.8, { flangeStep: 30 * U });
    for (const b of cb) coldBox(b.x, b.y, b.w, b.h);
    // purifier skid in the corner: two adsorbers on a grated frame
    {
      const kx = x + w * 0.6, ky = y + h * 0.76, kw = w * 0.36, kh = h * 0.18;
      _afrPipe([[x + w * 0.785, y + h * 0.6], [x + w * 0.785, ky + kh * 0.5], [kx + kw * 0.3, ky + kh * 0.5]], U, t, frosty, lhe, 1.8, { flangeStep: 30 * U });
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(kx + 4 * U, ky + 5 * U, kw, kh);
      _afrGrate(kx, ky, kw, kh, U);
      ctx.strokeStyle = '#3a414a'; ctx.lineWidth = 2.2 * U; ctx.strokeRect(kx, ky, kw, kh);
      for (let q = 0; q < 2; q++) _afrVessel(kx + kw * (0.25 + q * 0.32), ky + kh * 0.5, kh * 0.36, U, { bolts: 10, frost: frosty ? 0.5 : 0 });
      const vx = kx + kw * 0.86, vy = ky + kh * 0.5;
      ctx.strokeStyle = '#c03828'; ctx.lineWidth = 1.3 * U; ctx.beginPath(); ctx.arc(vx, vy, kh * 0.18, 0, TAU);
      ctx.moveTo(vx - kh * 0.18, vy); ctx.lineTo(vx + kh * 0.18, vy); ctx.moveTo(vx, vy - kh * 0.18); ctx.lineTo(vx, vy + kh * 0.18); ctx.stroke();
    }
    const dr = Math.min(w, h) * 0.088;
    [[0.675, 0.24], [0.895, 0.24], [0.785, 0.58]].forEach(([fx, fy], i) =>
      _afrSphere(x + w * fx, y + h * fy, dr, U, t, { legs: 6, fill: cold ? 0.85 : 0.2, accent: '#b8f0ff', on, label: 'LHe', stairAt: 0.6 + i * 2.1, frost: frosty ? 0.7 : 0 }));
    _afrFanDeck(x + w * 0.04, y + h * 0.73, w * 0.5, h * 0.22, U, t, on, 4);
    label(x + w * 0.5, y + h + 12 * S, 'CRYOPLANT');
    // LHe IN → plant, plant → cryostat
    _afrPipe([[pCry[0], pCry[1]], [pCry[0], y + h * 0.5], [x + w, y + h * 0.5]], U, t, !!e._cryoLinked, lhe, 3.4);
    _afrPipe([[x + w * 0.9, y + h], [x + w * 0.9, y + h + m * 0.05], rim(Math.PI * 1.25, R - 6 * S)], U, t, !!e._cryoRunning || cold, lhe, 3.4);
    _afrPipe([[x + w, y + h * 0.85], [x + w + m * 0.05, y + h * 0.85], rim(Math.PI * 1.36, R - 6 * S)], U, t, !!e._cryoRunning || cold, lhe, 3.4);
  }

  // ── Helium recovery (top-right) on HE ASH OUT ──
  // Two gas spheres take the ash, a column separates it, an air-cooler
  // deck carries the heat away.
  {
    const w = m * 0.2, h = m * 0.18, x = W - m * 0.035 - w, y = m * 0.035;
    const ash = 'rgba(240,184,255,0.95)';
    _afrSlab(x, y, w, h, U, 23);
    _afrFanDeck(x + w * 0.05, y + h * 0.74, w * 0.9, h * 0.2, U, t, on, 6);
    // pipe rack along the top, and the recovery control kiosk
    {
      const rx0 = x + w * 0.04, rx1 = x + w * 0.72, ry0 = y + h * 0.04, ry1 = y + h * 0.14;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(rx0 + 3 * U, ry0 + 4 * U, rx1 - rx0, ry1 - ry0);
      ctx.fillStyle = '#3a4048';
      for (let bx = rx0; bx <= rx1 + 0.5; bx += (rx1 - rx0) / 6) ctx.fillRect(bx - 1.6 * U, ry0, 3.2 * U, ry1 - ry0);
      ctx.fillStyle = '#4e555e'; ctx.fillRect(rx0, ry0, rx1 - rx0, 1.6 * U); ctx.fillRect(rx0, ry1 - 1.6 * U, rx1 - rx0, 1.6 * U);
      [[0.3, ash, gen], [0.55, 'rgba(232,252,255,0.9)', !!e._cryoRunning], [0.8, 'rgba(255,214,140,0.9)', on]].forEach(([f, c, run]) =>
        _afrPipe([[rx0 - 2 * U, ry0 + (ry1 - ry0) * f], [rx1 + 2 * U, ry0 + (ry1 - ry0) * f]], U, t, run, c, 1.5, { flangeStep: 40 * U }));
      _afrRoof(x + w * 0.78, y + h * 0.025, w * 0.18, h * 0.11, U, t, { units: [[0.5, 0.45, 0.6]], windows: true, lit: on, spin: on, wallH: 4 * U });
    }
    const sr = Math.min(w, h) * 0.15;
    const s1 = [x + w * 0.21, y + h * 0.37], s2 = [x + w * 0.54, y + h * 0.37], col = [x + w * 0.87, y + h * 0.3];
    _afrPipe([s1, s2, [s2[0], y + h * 0.62], [col[0], y + h * 0.62], col], U, t, gen, ash, 2, { flangeStep: 34 * U });
    _afrSphere(s1[0], s1[1], sr, U, t, { fill: Math.min(1, (e._heAsh || 0) / (def.heliumAshCapacity || 400)), accent: '#f0b8ff', on, label: 'He', stairAt: 0.5 });
    _afrSphere(s2[0], s2[1], sr, U, t, { fill: 0.5, accent: '#f0b8ff', on, label: 'He', stairAt: 2.3 });
    _afrColumnTop(col[0], col[1], Math.min(w, h) * 0.06, U);
    label(x + w * 0.5, y + h + 12 * S, 'HE RECOVERY');
    _afrPipe([[x, y + h * 0.5], [pAsh[0], y + h * 0.5], [pAsh[0], pAsh[1]]], U, t, !!e._ashPipeOut, ash, 3.4);
    _afrPipe([[x + w * 0.1, y + h], [x + w * 0.1, y + h + m * 0.05], rim(Math.PI * 1.75, R - 6 * S)], U, t, gen, ash, 3.4);
  }

  // ── Cryopump bank (top, between the two top ports) ──
  // Six divertor cryopumps on a plinth: bolted pump bodies with cold heads,
  // gate valves and a status lamp each, a header behind, and a pumping
  // line with bellows down to the cryostat.
  {
    const y = m * 0.12, x0 = pCry[0] + m * 0.06, x1 = pAsh[0] - m * 0.06, n = 6;
    const pr = m * 0.022;
    for (let q = 0; q < n; q++) {
      const x = x0 + (x1 - x0) * q / (n - 1);
      const a = -Math.PI / 2 + (q - (n - 1) / 2) * 0.17;
      const [ex, ey] = rim(a, R - 4 * S);
      _afrPipe([[x, y + pr], [ex, ey]], U, t, gen, 'rgba(200,240,255,0.8)', 2.6, { flangeStep: 90 * U });
      // bellows a third of the way down
      const bx = x + (ex - x) * 0.3, by = y + pr + (ey - y - pr) * 0.3, an = Math.atan2(ey - y - pr, ex - x);
      ctx.save(); ctx.translate(bx, by); ctx.rotate(an);
      for (let s = 0; s < 6; s++) { ctx.fillStyle = s % 2 ? '#5a636e' : '#b8c0ca'; ctx.fillRect(s * 1.6 * U, -3.6 * U, 1.6 * U, 7.2 * U); }
      ctx.restore();
    }
    _afrSlab(x0 - pr * 1.6, y - pr * 1.7, (x1 - x0) + pr * 3.2, pr * 3.4, U, 41);
    _afrPipe([[x0 - pr * 1.2, y - pr * 1.2], [x1 + pr * 1.2, y - pr * 1.2]], U, t, gen, 'rgba(200,240,255,0.8)', 2.4, { flangeStep: (x1 - x0) / (n - 1) });
    for (let q = 0; q < n; q++) {
      const x = x0 + (x1 - x0) * q / (n - 1);
      // gate valve under the pump, handwheel to one side
      ctx.fillStyle = '#2c323a'; ctx.fillRect(x - pr * 0.42, y + pr * 0.7, pr * 0.84, pr * 0.62);
      ctx.strokeStyle = '#c03828'; ctx.lineWidth = 1.2 * U; ctx.beginPath(); ctx.arc(x + pr * 0.72, y + pr * 1.0, pr * 0.22, 0, TAU); ctx.stroke();
      const led = gen ? (Math.sin(t * 3 + q) > 0 ? '#9ff0ff' : '#3a6a7a') : (on ? '#ffb030' : '#2a3038');
      _afrVessel(x, y, pr, U, { bolts: 12, nozzle: false, lamp: led, frost: cold ? 0.35 : 0 });
      // cold head: finned stage on top of the pump
      const hx = x + pr * 0.28, hy = y - pr * 0.2, hr = pr * 0.32;
      ctx.fillStyle = '#3a414a'; ctx.beginPath(); ctx.arc(hx, hy, hr, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(220,230,240,0.55)'; ctx.lineWidth = 0.6 * U;
      for (const f of [0.45, 0.7, 0.95]) { ctx.beginPath(); ctx.arc(hx, hy, hr * f, 0, TAU); ctx.stroke(); }
      if (gen) { ctx.fillStyle = 'rgba(160,240,255,0.25)'; ctx.beginPath(); ctx.arc(x, y, pr * 1.1, 0, TAU); ctx.fill(); }
    }
    label((x0 + x1) / 2, y + pr * 2.6, 'DIVERTOR CRYOPUMPS');
  }

  // ── D-He3 pellet injector (left) on PELLETS IN ──
  // A bolted centrifuge with a window on its spinning rotor, the pellet
  // source cryostat and gas panel, and the flight tube into the plasma.
  {
    const iw = m * 0.12, ih = m * 0.1, ix = m * 0.05, iy = pIn[1] - ih / 2;
    _wfConveyor(pIn[0], pIn[1], ix, pIn[1], S, t, gen, '#c890ff');
    const [tx, ty] = rim(Math.PI, R - 2 * S);
    const fx0 = ix + iw, fy0 = pIn[1];
    _afrPipe([[fx0, fy0], [tx, ty]], U, t, false, null, 3.6, { jacket: '#a8b0bc', flangeStep: 60 * U });
    // bellows and a gate valve along the flight tube
    for (const f of [0.22, 0.72]) {
      const bx = fx0 + (tx - fx0) * f, by = fy0 + (ty - fy0) * f;
      for (let s = 0; s < 6; s++) { ctx.fillStyle = s % 2 ? '#5a636e' : '#c8d0da'; ctx.fillRect(bx + s * 1.6 * U, by - 4.6 * U, 1.6 * U, 9.2 * U); }
    }
    {
      const gx = fx0 + (tx - fx0) * 0.48, gy = fy0 + (ty - fy0) * 0.48;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(gx - 7 * U + 2 * U, gy - 9 * U + 3 * U, 14 * U, 18 * U);
      ctx.fillStyle = '#3a414a'; ctx.fillRect(gx - 7 * U, gy - 9 * U, 14 * U, 18 * U);
      ctx.strokeStyle = '#14181c'; ctx.lineWidth = 0.8 * U; ctx.strokeRect(gx - 7 * U, gy - 9 * U, 14 * U, 18 * U);
      ctx.strokeStyle = '#c03828'; ctx.lineWidth = 1.4 * U; ctx.beginPath(); ctx.arc(gx, gy - 12 * U, 4.5 * U, 0, TAU);
      ctx.moveTo(gx - 4.5 * U, gy - 12 * U); ctx.lineTo(gx + 4.5 * U, gy - 12 * U); ctx.stroke();
    }
    if (gen) {
      ctx.fillStyle = '#f4e8ff';
      for (let q = 0; q < 5; q++) { const p = (t * 1.6 + q / 5) % 1; ctx.beginPath(); ctx.arc(fx0 + (tx - fx0) * p, fy0 + (ty - fy0) * p, 2.4 * S, 0, TAU); ctx.fill(); }
    }
    _afrSlab(ix, iy, iw, ih, U, 53);
    // centrifuge
    const dx = ix + iw * 0.42, dy = pIn[1], drr = ih * 0.36;
    _afrVessel(dx, dy, drr * 1.1, U, { bolts: 20, nozzle: false, shell: ['#dcd6ec', '#8c869e', '#3a3448'] });
    const vr = drr * 0.56;
    ctx.fillStyle = '#0b0912'; ctx.beginPath(); ctx.arc(dx, dy, vr, 0, TAU); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(dx, dy, vr, 0, TAU); ctx.clip();
    ctx.translate(dx, dy);
    const ang = gen ? t * 14 : 0.4;
    if (gen) {                                       // motion blur of the arm
      for (let q = 1; q <= 4; q++) {
        ctx.strokeStyle = `rgba(224,200,255,${(0.16 / q).toFixed(3)})`; ctx.lineWidth = 3 * U;
        ctx.beginPath(); ctx.arc(0, 0, vr * 0.8, ang - q * 0.35, ang); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, vr * 0.8, ang + Math.PI - q * 0.35, ang + Math.PI); ctx.stroke();
      }
    }
    ctx.rotate(ang);
    ctx.strokeStyle = gen ? '#efe0ff' : '#5a5070'; ctx.lineWidth = 3.2 * U;
    ctx.beginPath(); ctx.moveTo(-vr * 0.88, 0); ctx.lineTo(vr * 0.88, 0); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = gen ? accent : '#3a3448'; ctx.beginPath(); ctx.arc(dx, dy, drr * 0.16, 0, TAU); ctx.fill();
    const vg = ctx.createLinearGradient(dx - vr, dy - vr, dx + vr, dy + vr);
    vg.addColorStop(0, 'rgba(200,220,255,0.28)'); vg.addColorStop(0.5, 'rgba(120,140,190,0.06)'); vg.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(dx, dy, vr, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#1a1622'; ctx.lineWidth = 2 * U; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2 * U; ctx.beginPath(); ctx.arc(dx, dy, vr * 0.82, Math.PI * 1.05, Math.PI * 1.45); ctx.stroke();
    // pellet source cryostat and gas panel
    _afrVessel(ix + iw * 0.88, iy + ih * 0.25, ih * 0.13, U, { bolts: 8, frost: cold ? 0.7 : 0.15, lamp: gen ? '#80ffb0' : (on ? '#ffb030' : '#302820') });
    const px0 = ix + iw * 0.78, py0 = iy + ih * 0.55, pw = iw * 0.19, ph = ih * 0.36;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px0 + 2 * U, py0 + 3 * U, pw, ph);
    ctx.fillStyle = '#4a5260'; ctx.fillRect(px0, py0, pw, ph);
    ctx.strokeStyle = '#14181c'; ctx.lineWidth = 0.8 * U; ctx.strokeRect(px0, py0, pw, ph);
    for (let q = 0; q < 3; q++) {
      const vx = px0 + pw * 0.5, vy = py0 + ph * (0.2 + q * 0.3);
      ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 1 * U; ctx.beginPath(); ctx.arc(vx, vy, pw * 0.22, 0, TAU);
      ctx.moveTo(vx - pw * 0.22, vy); ctx.lineTo(vx + pw * 0.22, vy); ctx.stroke();
      ctx.fillStyle = gen ? '#e0d0ff' : '#2a2e34'; ctx.fillRect(px0 + pw * 0.08, vy - 1 * U, pw * 0.1, 2 * U);
    }
    label(ix + iw / 2, iy - 10 * S, 'PELLET INJECTOR');
  }

  // ── Direct energy converters (right), one per ION OUT ──
  decs.forEach((d, i) => {
    // magnetic expander duct from the plasma edge out to the converter
    const [r0x, r0y] = rim(d.a, R - 8 * S);
    const ex = d.dx, ey = d.p[1];
    const an = Math.atan2(ey - r0y, ex - r0x);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 30 * S; ctx.beginPath(); ctx.moveTo(r0x + 6 * S, r0y + 8 * S); ctx.lineTo(ex + 6 * S, ey + 8 * S); ctx.stroke();
    ctx.strokeStyle = '#2c2a38'; ctx.lineWidth = 27 * S; ctx.beginPath(); ctx.moveTo(r0x, r0y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = '#5c5874'; ctx.lineWidth = 22 * S; ctx.stroke();
    ctx.strokeStyle = '#8c88a8'; ctx.lineWidth = 9 * S; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2.5 * S;
    ctx.beginPath(); ctx.moveTo(r0x + Math.sin(an) * 6 * S, r0y - Math.cos(an) * 6 * S); ctx.lineTo(ex + Math.sin(an) * 6 * S, ey - Math.cos(an) * 6 * S); ctx.stroke();
    // expander coils along the duct
    const n = 7;
    for (let q = 1; q < n; q++) {
      const fx = r0x + (ex - r0x) * q / n, fy = r0y + (ey - r0y) * q / n;
      ctx.save(); ctx.translate(fx, fy); ctx.rotate(an);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-3 * S, -17 * S, 10 * S, 40 * S);
      const cg = ctx.createLinearGradient(-4 * S, 0, 4 * S, 0);
      cg.addColorStop(0, '#e0e6f0'); cg.addColorStop(1, '#7a8494');
      ctx.fillStyle = cg; ctx.strokeStyle = '#141820'; ctx.lineWidth = S;
      ctx.beginPath(); ctx.roundRect(-4 * S, -19 * S, 8 * S, 38 * S, 3 * S); ctx.fill(); ctx.stroke();
      ctx.fillStyle = gen ? `rgba(200,150,255,${0.5 + 0.4 * Math.sin(t * 7 - q)})` : (charging ? '#ffc040' : '#6a5a40');
      ctx.fillRect(-1.2 * S, -16 * S, 2.4 * S, 32 * S);
      ctx.fillStyle = '#1a1e26'; ctx.fillRect(-4 * S, -21 * S, 8 * S, 3 * S); ctx.fillRect(-4 * S, 18 * S, 8 * S, 3 * S);
      ctx.restore();
    }
    // the converter vault: steel frame, a glass roof over the collector
    // grids, cooling fins, and HV bushings on the electrode bus
    _afrSlab(d.dx, d.dy, d.dw, d.dh, U, 61 + i);
    const gx = d.dx + d.dw * 0.06, gy = d.dy + d.dh * 0.14, gw = d.dw * 0.66, gh = d.dh * 0.72;
    ctx.fillStyle = '#2c2a36'; ctx.fillRect(gx - 3 * U, gy - 3 * U, gw + 6 * U, gh + 6 * U);
    ctx.fillStyle = '#0d0a15'; ctx.fillRect(gx, gy, gw, gh);
    const slats = 16;
    for (let q = 0; q < slats; q++) {
      const sx = gx + gw * (q + 0.5) / slats;
      const lit = gen ? 0.35 + 0.55 * Math.max(0, Math.sin(t * 5 - q * 0.45 + i)) : 0;
      ctx.strokeStyle = gen ? `rgba(220,180,255,${lit})` : '#4a4460'; ctx.lineWidth = 2 * S;
      ctx.beginPath(); ctx.moveTo(sx - gw * 0.02, gy + 3 * S); ctx.lineTo(sx + gw * 0.02, gy + gh - 3 * S); ctx.stroke();
      if (gen && lit > 0.6) {
        ctx.strokeStyle = `rgba(180,120,255,${((lit - 0.6) * 0.6).toFixed(3)})`; ctx.lineWidth = 7 * S; ctx.stroke();
      }
    }
    const glass = ctx.createLinearGradient(gx, gy, gx + gw, gy + gh);
    glass.addColorStop(0, 'rgba(180,205,235,0.24)'); glass.addColorStop(0.5, 'rgba(60,70,110,0.06)'); glass.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = glass; ctx.fillRect(gx, gy, gw, gh);
    ctx.strokeStyle = '#8a90a2'; ctx.lineWidth = 1.6 * U; ctx.beginPath();
    for (let q = 1; q < 4; q++) { const sx = gx + gw * q / 4; ctx.moveTo(sx, gy); ctx.lineTo(sx, gy + gh); }
    ctx.moveTo(gx, gy + gh / 2); ctx.lineTo(gx + gw, gy + gh / 2); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.rect(gx, gy, gw, gh); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath(); ctx.moveTo(gx + gw * 0.12, gy); ctx.lineTo(gx + gw * 0.26, gy); ctx.lineTo(gx + gw * 0.26 - gh, gy + gh); ctx.lineTo(gx + gw * 0.12 - gh, gy + gh); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#b0b6c6'; ctx.lineWidth = 2.2 * U; ctx.strokeRect(gx, gy, gw, gh);
    // cooling fins under the vault
    ctx.lineWidth = 0.9 * U;
    for (let fx = gx; fx < gx + gw; fx += 2.2 * U) {
      ctx.strokeStyle = '#6a7080'; ctx.beginPath(); ctx.moveTo(fx, gy + gh + 5 * U); ctx.lineTo(fx, d.dy + d.dh - 4 * U); ctx.stroke();
      ctx.strokeStyle = '#22262e'; ctx.beginPath(); ctx.moveTo(fx + 1 * U, gy + gh + 5 * U); ctx.lineTo(fx + 1 * U, d.dy + d.dh - 4 * U); ctx.stroke();
    }
    // electrode bus with four HV bushings
    const bx = d.dx + d.dw * 0.76, bw = d.dw * 0.18, by0 = d.dy + d.dh * 0.18, bh = d.dh * 0.64;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bx + 3 * U, by0 + 4 * U, bw, bh);
    const bg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    bg.addColorStop(0, '#7a7494'); bg.addColorStop(1, '#3e3a50');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(bx, by0, bw, bh, 3 * U); ctx.fill();
    ctx.strokeStyle = '#141018'; ctx.lineWidth = 1 * U; ctx.stroke();
    for (let q = 0; q < 4; q++) {
      const ux = bx + bw / 2, uy = d.dy + d.dh * (0.27 + q * 0.14), ur = Math.min(bw * 0.38, d.dh * 0.06);
      const litB = gen && Math.sin(t * 6 + q + i) > 0;
      for (let s = 0; s < 4; s++) {
        ctx.fillStyle = s % 2 ? '#7a4a2e' : '#c8925e';
        ctx.beginPath(); ctx.arc(ux, uy, ur * (1 - s * 0.2), 0, TAU); ctx.fill();
      }
      ctx.fillStyle = gen ? (litB ? gold : '#8a6a30') : '#3a3448';
      ctx.beginPath(); ctx.arc(ux, uy, ur * 0.3, 0, TAU); ctx.fill();
      if (litB) {
        const hg = ctx.createRadialGradient(ux, uy, 0, ux, uy, ur * 1.6);
        hg.addColorStop(0, 'rgba(255,220,140,0.45)'); hg.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(ux, uy, ur * 1.6, 0, TAU); ctx.fill();
      }
    }
    _afrPipe([[d.dx + d.dw, d.p[1]], [d.p[0], d.p[1]]], U, t, gen, 'rgba(180,120,255,0.95)', 3.4);
    label(gx + gw / 2, d.dy + d.dh * 0.07, `DIRECT CONVERTER ${i ? 'B' : 'A'}`);
  });

  // ── Gyrotron hall (bottom-left), waveguides fanning in ──
  // A roofed power and control bay along the top, and below it an open
  // gallery of twelve gyrotrons in their superconducting magnets, each
  // with a waveguide feeder up to the three trunk lines.
  const gyro = { w: m * 0.22, h: m * 0.19 };
  gyro.x = m * 0.035; gyro.y = H - m * 0.035 - gyro.h;
  const wgAngles = [Math.PI * 0.69, Math.PI * 0.76, Math.PI * 0.83];
  {
    const { x, y, w, h } = gyro;
    // trunk waveguides first, so the hall roof covers their ends
    wgAngles.forEach((a, i) => {
      const sx = x + w * (0.7 + i * 0.1), sy = y + h * 0.1;
      const [ex, ey] = rim(a, R - 4 * S);
      ctx.lineCap = 'butt';
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 7 * S; ctx.beginPath(); ctx.moveTo(sx + 3 * U, sy + 4 * U); ctx.lineTo(ex + 3 * U, ey + 4 * U); ctx.stroke();
      ctx.strokeStyle = '#141820'; ctx.lineWidth = 6.5 * S; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = '#c8d0dc'; ctx.lineWidth = 4 * S; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.2 * S; ctx.stroke();
      const L = Math.hypot(ex - sx, ey - sy), an = Math.atan2(ey - sy, ex - sx);
      ctx.fillStyle = '#4a525e';
      for (let dd = 30 * U; dd < L; dd += 38 * U) {
        ctx.save(); ctx.translate(sx + Math.cos(an) * dd, sy + Math.sin(an) * dd); ctx.rotate(an);
        ctx.fillRect(-1 * U, -4.5 * S, 2 * U, 9 * S); ctx.restore();
      }
      if (gen) {
        for (let q = 0; q < 4; q++) {
          const p = (t * 1.3 + q / 4 + i * 0.13) % 1;
          ctx.fillStyle = `rgba(255,120,200,${0.9 * (1 - p * 0.4)})`;
          ctx.beginPath(); ctx.arc(sx + (ex - sx) * p, sy + (ey - sy) * p, 3 * S, 0, TAU); ctx.fill();
        }
      }
    });
    _afrSlab(x, y, w, h, U, 71);
    // open gallery
    const gx0 = x + 6 * U, gy0 = y + h * 0.33, gw = w - 12 * U, gh = h * 0.64;
    _afrGrate(gx0, gy0, gw, gh, U);
    ctx.strokeStyle = '#d8b030'; ctx.lineWidth = 1.2 * U; ctx.strokeRect(gx0, gy0, gw, gh);
    const cols = 6, rows = 2, gr = Math.min(w / cols, gh / rows) * 0.33;
    const rowY = (r) => y + h * (0.5 + r * 0.3);
    // cable trays between the rows and along the bottom
    for (const ty of [y + h * 0.65, y + h * 0.95]) {
      ctx.fillStyle = '#383e46'; ctx.fillRect(gx0 + 2 * U, ty - 3 * U, gw - 4 * U, 6 * U);
      ctx.strokeStyle = '#d06a20'; ctx.lineWidth = 0.8 * U; ctx.beginPath();
      for (const o of [-1.4, 0, 1.4]) { ctx.moveTo(gx0 + 3 * U, ty + o * U); ctx.lineTo(gx0 + gw - 3 * U, ty + o * U); }
      ctx.stroke();
    }
    // waveguide feeders: top row straight up, bottom row up between columns
    const feeder = (pts) => {
      ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
      ctx.strokeStyle = '#141820'; ctx.lineWidth = 4.6 * U; ctx.beginPath(); ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p); ctx.stroke();
      ctx.strokeStyle = '#c4ccd8'; ctx.lineWidth = 2.8 * U; ctx.stroke();
    };
    for (let c = 0; c < cols; c++) {
      const fx = x + w * (c + 0.5) / cols;
      feeder([[fx, rowY(0)], [fx, gy0]]);
      const lane = c < cols - 1 ? fx + w / cols / 2 - 3 * U : fx - w / cols / 2 + 3 * U;   // the last one turns back inside
      feeder([[fx, rowY(1)], [lane, rowY(1)], [lane, gy0]]);
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const gxx = x + w * (c + 0.5) / cols, gyy = rowY(r);
      _afrVessel(gxx, gyy, gr, U, { shell: ['#f4f6fa', '#b4bac8', '#4a5064'], bolts: 10, nozzle: false, frost: cold ? 0.35 : 0 });
      const lit = gen ? 0.55 + 0.45 * Math.sin(t * 11 + r * 3 + c) : 0;
      ctx.fillStyle = '#1a1420'; ctx.beginPath(); ctx.arc(gxx, gyy, gr * 0.42, 0, TAU); ctx.fill();
      ctx.fillStyle = gen ? `rgba(255,130,210,${lit.toFixed(3)})` : (on ? '#6a3a58' : '#2a2430');
      ctx.beginPath(); ctx.arc(gxx, gyy, gr * 0.32, 0, TAU); ctx.fill();
      if (gen) {
        const hg = ctx.createRadialGradient(gxx, gyy, 0, gxx, gyy, gr * 1.1);
        hg.addColorStop(0, `rgba(255,140,215,${(0.35 * lit).toFixed(3)})`); hg.addColorStop(1, 'rgba(255,120,200,0)');
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(gxx, gyy, gr * 1.1, 0, TAU); ctx.fill();
      }
    }
    _afrRoof(x + 3 * U, y + 3 * U, w - 6 * U, h * 0.3, U, t, {
      skylights: [[0.05, 0.22, 0.42, 0.34]], glow: gen ? 'rgba(255,140,210,0.28)' : (on ? 'rgba(255,200,140,0.18)' : null),
      units: [[0.6, 0.5, 0.5], [0.8, 0.5, 0.5]], vents: [[0.08, 0.78], [0.2, 0.78], [0.32, 0.78], [0.44, 0.78], [0.94, 0.3], [0.94, 0.7]],
      windows: true, lit: on, spin: on });
    label(x + w / 2, y - 10 * S, 'GYROTRON HALL · ECRH');
  }

  // ── SMES yard (bottom-right): superconducting energy-storage rings ──
  // Three toroidal coils in their cryostat jackets, a transformer, and two
  // rows of capacitor cans on racks.
  {
    // a little shorter than the gyrotron hall, so it clears Direct Converter B
    const w = m * 0.22, h = m * 0.17, x = W - m * 0.035 - w, y = H - m * 0.035 - h;
    _afrSlab(x, y, w, h, U, 83);
    const rr = Math.min(w / 3, h * 0.62) * 0.4;
    const fillT = charging ? chargeP : (gen ? 1 : 0);
    for (let q = 0; q < 3; q++) {
      const sx = x + w * (q + 0.5) / 3, sy = y + h * 0.42;
      ctx.strokeStyle = 'rgba(0,0,0,0.38)'; ctx.lineWidth = rr * 0.46; ctx.beginPath(); ctx.arc(sx + 5 * U, sy + 6 * U, rr, 0, TAU); ctx.stroke();
      // dark bore with a support post
      ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, rr * 0.78, 0, TAU); ctx.clip(); _afrGrate(sx - rr, sy - rr, rr * 2, rr * 2, U); ctx.restore();
      ctx.fillStyle = '#4a525c'; ctx.beginPath(); ctx.arc(sx, sy, rr * 0.18, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#1a1e24'; ctx.lineWidth = 1 * U; ctx.stroke();
      // cryostat jacket
      ctx.strokeStyle = '#1a1e24'; ctx.lineWidth = rr * 0.46; ctx.beginPath(); ctx.arc(sx, sy, rr, 0, TAU); ctx.stroke();
      const jg = ctx.createLinearGradient(sx - rr, sy - rr, sx + rr, sy + rr);
      jg.addColorStop(0, '#e4eaf2'); jg.addColorStop(0.5, '#9aa6b6'); jg.addColorStop(1, '#4e5868');
      ctx.strokeStyle = jg; ctx.lineWidth = rr * 0.4; ctx.stroke();
      // coil packs: banded segments round the ring
      ctx.save(); ctx.translate(sx, sy);
      for (let s = 0; s < 16; s++) {
        ctx.rotate(TAU / 16);
        ctx.fillStyle = 'rgba(30,36,46,0.5)'; ctx.fillRect(rr * 0.8, -1.2 * U, rr * 0.4, 2.4 * U);
        ctx.fillStyle = 'rgba(210,140,80,0.7)'; ctx.fillRect(rr * 0.82, 1.2 * U, rr * 0.36, 0.8 * U);
      }
      ctx.restore();
      // charge
      const arcEnd = -Math.PI / 2 + TAU * (gen ? 0.8 + 0.2 * Math.sin(t * 2 + q) : fillT);
      if (gen || charging) {
        ctx.strokeStyle = charging ? 'rgba(255,192,48,0.25)' : 'rgba(200,144,255,0.25)'; ctx.lineWidth = rr * 0.26;
        ctx.beginPath(); ctx.arc(sx, sy, rr, -Math.PI / 2, arcEnd); ctx.stroke();
      }
      ctx.strokeStyle = charging ? '#ffc030' : (gen ? accent : '#3a3a48'); ctx.lineWidth = rr * 0.1;
      ctx.beginPath(); ctx.arc(sx, sy, rr, -Math.PI / 2, arcEnd); ctx.stroke();
      // current-lead box
      const lx = sx + Math.cos(-Math.PI / 4) * rr * 1.08, ly = sy + Math.sin(-Math.PI / 4) * rr * 1.08;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(lx - 5 * U + 2 * U, ly - 5 * U + 3 * U, 10 * U, 10 * U);
      ctx.fillStyle = '#5a6270'; ctx.fillRect(lx - 5 * U, ly - 5 * U, 10 * U, 10 * U);
      ctx.strokeStyle = '#14181c'; ctx.lineWidth = 0.8 * U; ctx.strokeRect(lx - 5 * U, ly - 5 * U, 10 * U, 10 * U);
      ctx.fillStyle = '#c8925e'; ctx.beginPath(); ctx.arc(lx - 2 * U, ly, 1.6 * U, 0, TAU); ctx.arc(lx + 2 * U, ly, 1.6 * U, 0, TAU); ctx.fill();
    }
    // transformer, top right
    {
      const tx = x + w * 0.04, ty = y + 6 * U, tw = w * 0.2, th = h * 0.13;
      ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(tx + 4 * U, ty + 5 * U, tw, th);
      ctx.fillStyle = '#4a5a50'; ctx.fillRect(tx, ty, tw, th);
      ctx.lineWidth = 0.9 * U;
      for (let fx = tx + 2 * U; fx < tx + tw * 0.28; fx += 2 * U) { ctx.strokeStyle = fx % 4 < 2 ? '#6e8276' : '#26302a'; ctx.beginPath(); ctx.moveTo(fx, ty + 2 * U); ctx.lineTo(fx, ty + th - 2 * U); ctx.stroke(); }
      for (let fx = tx + tw * 0.72; fx < tx + tw - 2 * U; fx += 2 * U) { ctx.strokeStyle = fx % 4 < 2 ? '#6e8276' : '#26302a'; ctx.beginPath(); ctx.moveTo(fx, ty + 2 * U); ctx.lineTo(fx, ty + th - 2 * U); ctx.stroke(); }
      const tg = ctx.createLinearGradient(tx + tw * 0.3, ty, tx + tw * 0.7, ty + th);
      tg.addColorStop(0, '#8aa094'); tg.addColorStop(1, '#3e4c44');
      ctx.fillStyle = tg; ctx.fillRect(tx + tw * 0.3, ty + 1.5 * U, tw * 0.4, th - 3 * U);
      for (let q = 0; q < 3; q++) {
        const ux = tx + tw * (0.38 + q * 0.12), uy = ty + th * 0.4;
        ctx.fillStyle = '#c8925e'; ctx.beginPath(); ctx.arc(ux, uy, 2.6 * U, 0, TAU); ctx.fill();
        ctx.fillStyle = '#7a4a2e'; ctx.beginPath(); ctx.arc(ux, uy, 1.6 * U, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = '#14181c'; ctx.lineWidth = 1 * U; ctx.strokeRect(tx, ty, tw, th);
    }
    // capacitor racks
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + w * 0.04 + 3 * U, y + h * 0.76 + 4 * U, w * 0.92, h * 0.19);
    ctx.fillStyle = '#23282e'; ctx.fillRect(x + w * 0.04, y + h * 0.76, w * 0.92, h * 0.19);
    ctx.strokeStyle = '#5a626c'; ctx.lineWidth = 1 * U; ctx.beginPath();
    for (const fy of [0.78, 0.855, 0.93]) { ctx.moveTo(x + w * 0.04, y + h * fy); ctx.lineTo(x + w * 0.96, y + h * fy); }
    ctx.stroke();
    for (let q = 0; q < 8; q++) {
      const bx = x + w * (0.06 + q * 0.11);
      for (const fy of [0.815, 0.89]) {
        const ccx = bx + w * 0.04, ccy = y + h * fy, cr = w * 0.018;
        const cg = ctx.createRadialGradient(ccx - cr * 0.4, ccy - cr * 0.4, 0.3 * U, ccx, ccy, cr);
        cg.addColorStop(0, '#eef2f6'); cg.addColorStop(1, '#5e6674');
        ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(ccx, ccy, cr, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#14181c'; ctx.lineWidth = 0.6 * U; ctx.stroke();
        ctx.fillStyle = '#7a4a2e'; ctx.beginPath(); ctx.arc(ccx, ccy, cr * 0.32, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = charging ? (Math.sin(t * 10 + q) > 0 ? '#ffd040' : '#6a5010') : (gen ? accent : '#3a4250');
      ctx.fillRect(bx + w * 0.015, y + h * 0.765, w * 0.05, h * 0.012);
    }
    label(x + w / 2, y - 10 * S, 'SMES · PULSED POWER');
    // power bus to the coil set
    const [bx, by] = rim(Math.PI * 0.25, R - 6 * S);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 11 * S; ctx.beginPath(); ctx.moveTo(x + w * 0.1 + 3 * U, y + 4 * U); ctx.lineTo(bx + 3 * U, by + 4 * U); ctx.stroke();
    ctx.strokeStyle = '#141820'; ctx.lineWidth = 10 * S; ctx.beginPath(); ctx.moveTo(x + w * 0.1, y); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = charging ? '#ffc030' : (gen ? '#c8a060' : '#5a5040'); ctx.lineWidth = 5 * S; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.4 * S; ctx.stroke();
  }

  // ── Neutral-beam injectors (bottom) ──
  // Drawn along the beam axis: ion source with insulator stacks and a
  // glowing grid, the beamline tank with ribs, cryopumps and the bending
  // magnet, then the drift duct with bellows into the cryostat.
  const nbiA = [Math.PI * 0.39, Math.PI * 0.61];
  const nbiR = m * 0.43;
  nbiA.forEach((a) => {
    const [x0, y0] = rim(a, nbiR), [x1, y1] = rim(a, R - 8 * S);
    const L = Math.hypot(x1 - x0, y1 - y0);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(0,0,0,0.33)'; ctx.lineWidth = 60 * S; ctx.beginPath(); ctx.moveTo(x0 + 6 * S, y0 + 8 * S); ctx.lineTo(x1 + 6 * S, y1 + 8 * S); ctx.stroke();
    ctx.save(); ctx.translate(x0, y0); ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
    const cyl = (x, w, hh, c) => {
      const g = ctx.createLinearGradient(0, -hh, 0, hh);
      g.addColorStop(0, c[0]); g.addColorStop(0.35, c[1]); g.addColorStop(1, c[2]);
      ctx.fillStyle = g; ctx.fillRect(x, -hh, w, hh * 2);
      ctx.strokeStyle = '#11151a'; ctx.lineWidth = 1 * U; ctx.strokeRect(x, -hh, w, hh * 2);
    };
    // drift duct
    cyl(L * 0.55, L * 0.45, 10 * S, ['#5a6470', '#c8d0da', '#383f48']);
    for (let s = 0; s < 8; s++) { ctx.fillStyle = s % 2 ? '#4a525c' : '#d4dae2'; ctx.fillRect(L * 0.7 + s * 1.8 * S, -11 * S, 1.8 * S, 22 * S); }
    for (const fx of [0.56, 0.86, 0.995]) { ctx.fillStyle = '#3a424c'; ctx.fillRect(L * fx - 2 * S, -14 * S, 4 * S, 28 * S); }
    // beamline tank
    cyl(L * 0.13, L * 0.43, 30 * S, ['#4a5260', '#a2acba', '#2a313a']);
    ctx.lineWidth = 1 * U;
    for (let rx = L * 0.13 + 12 * S; rx < L * 0.56; rx += 14 * S) {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.moveTo(rx, -30 * S); ctx.lineTo(rx, 30 * S); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.moveTo(rx + 1 * U, -30 * S); ctx.lineTo(rx + 1 * U, 30 * S); ctx.stroke();
    }
    _afrVessel(L * 0.24, -12 * S, 11 * S, U, { bolts: 10, nozzle: false, frost: cold ? 0.4 : 0 });
    _afrVessel(L * 0.37, 12 * S, 11 * S, U, { bolts: 10, nozzle: false, frost: cold ? 0.4 : 0 });
    // bending magnet
    ctx.fillStyle = '#b8522c'; ctx.fillRect(L * 0.46, -26 * S, L * 0.08, 52 * S);
    ctx.fillStyle = '#2a2e34'; ctx.fillRect(L * 0.475, -26 * S, L * 0.05, 52 * S);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(L * 0.46, -26 * S, L * 0.08, 3 * S);
    ctx.strokeStyle = '#11151a'; ctx.lineWidth = 1 * U; ctx.strokeRect(L * 0.46, -26 * S, L * 0.08, 52 * S);
    // ion source
    ctx.fillStyle = '#3a424e'; ctx.strokeStyle = '#121820'; ctx.lineWidth = 1.5 * S;
    ctx.beginPath(); ctx.roundRect(-8 * S, -32 * S, L * 0.14 + 8 * S, 64 * S, 6 * S); ctx.fill(); ctx.stroke();
    for (let s = 0; s < 4; s++) { ctx.fillStyle = s % 2 ? '#7a5a3a' : '#c8a070'; ctx.fillRect(-6 * S + s * 3 * S, -30 * S, 3 * S, 60 * S); }
    ctx.fillStyle = '#0c1016'; ctx.fillRect(8 * S, -21 * S, L * 0.14 - 14 * S, 42 * S);
    for (let q = -2; q <= 2; q++) {
      ctx.fillStyle = gen ? `rgba(160,240,255,${0.5 + 0.4 * Math.sin(t * 8 + q)})` : '#2a3440';
      ctx.fillRect(10 * S, q * 8 * S - 2.4 * S, L * 0.14 - 18 * S, 4.8 * S);
    }
    // HV deck beside the source
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-4 * S, -58 * S, 34 * S, 18 * S);
    ctx.fillStyle = '#525a66'; ctx.fillRect(-6 * S, -60 * S, 34 * S, 18 * S);
    ctx.strokeStyle = '#11151a'; ctx.lineWidth = 1 * U; ctx.strokeRect(-6 * S, -60 * S, 34 * S, 18 * S);
    for (let q = 0; q < 3; q++) { ctx.fillStyle = '#c8925e'; ctx.beginPath(); ctx.arc(q * 10 * S + 1 * S, -51 * S, 3 * S, 0, TAU); ctx.fill(); ctx.fillStyle = '#7a4a2e'; ctx.beginPath(); ctx.arc(q * 10 * S + 1 * S, -51 * S, 1.6 * S, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = '#20242a'; ctx.lineWidth = 3 * S; ctx.beginPath(); ctx.moveTo(11 * S, -42 * S); ctx.lineTo(11 * S, -32 * S); ctx.stroke();
    ctx.restore();
  });

  // ── Heat-exchanger bank (bottom middle) on CRYO IN ──
  // Cryogenic Coolant from the cooling towers takes away the heat the
  // direct converters can't turn into power: a header in a floor trench runs
  // up the right to Direct Converter A, and two loops cool the divertor.
  {
    const w = m * 0.17, h = m * 0.08, x = cx - w / 2, y = H - m * 0.035 - h;
    const coolOn = !!e._coolantLinked || gen;
    const cc = 'rgba(122,240,255,0.95)';
    _afrPipe([[pCool[0], pCool[1]], [pCool[0], y + h]], U, t, coolOn, cc, 3.4);
    // (the header to the converters runs in its trench, drawn first)
    // divertor loops into the cryostat
    _afrPipe([[x + w * 0.3, y], rim(Math.PI * 0.54, R - 6 * S)], U, t, coolOn, cc, 3);
    _afrPipe([[x + w * 0.7, y], rim(Math.PI * 0.46, R - 6 * S)], U, t, coolOn, cc, 3);
    _afrSlab(x, y, w, h, U, 91);
    // plate-and-frame exchangers: fixed head and follower, tie rods, plate
    // pack frosted while the coolant runs
    const n = 7;
    for (let q = 0; q < n; q++) {
      const ex = x + w * (0.05 + q * 0.132), ew = w * 0.1, ey = y + h * 0.14, eh = h * 0.7;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(ex + 2 * U, ey + 3 * U, ew, eh);
      const g = ctx.createLinearGradient(ex, 0, ex + ew, 0);
      g.addColorStop(0, '#d8eef4'); g.addColorStop(0.6, '#8aaab8'); g.addColorStop(1, '#4a6270');
      ctx.fillStyle = g; ctx.fillRect(ex + ew * 0.08, ey + eh * 0.12, ew * 0.84, eh * 0.76);
      ctx.strokeStyle = 'rgba(20,40,50,0.5)'; ctx.lineWidth = 0.6 * U; ctx.beginPath();
      for (let s = 1; s < 10; s++) { const sy = ey + eh * (0.12 + 0.76 * s / 10); ctx.moveTo(ex + ew * 0.1, sy); ctx.lineTo(ex + ew * 0.9, sy); }
      ctx.stroke();
      ctx.fillStyle = '#2e5868'; ctx.fillRect(ex, ey, ew, eh * 0.12); ctx.fillRect(ex, ey + eh * 0.88, ew, eh * 0.12);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(ex, ey, ew, 1 * U);
      ctx.strokeStyle = '#1a2a32'; ctx.lineWidth = 0.8 * U; ctx.beginPath();
      for (const fx of [0.04, 0.96]) { ctx.moveTo(ex + ew * fx, ey); ctx.lineTo(ex + ew * fx, ey + eh); }
      ctx.stroke();
      ctx.fillStyle = '#c8d0d8';
      for (const fx of [0.04, 0.96]) for (const fy of [0, 1]) { ctx.beginPath(); ctx.arc(ex + ew * fx, ey + eh * fy, 1.1 * U, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = '#122028'; ctx.lineWidth = 0.8 * U; ctx.strokeRect(ex, ey, ew, eh);
      if (coolOn) { ctx.fillStyle = `rgba(150,245,255,${0.3 + 0.25 * Math.sin(t * 3 + q)})`; ctx.fillRect(ex + ew * 0.3, ey + eh * 0.14, ew * 0.4, eh * 0.72); }
    }
    label(cx, y - 10 * S, 'HEAT EXCHANGERS · COOLANT');
  }

  // ── Control room (left, above the pellet injector) ──
  // Consoles seen through the roof light, an air handler and a comms mast.
  {
    const w = m * 0.15, h = m * 0.075, x = m * 0.05, y = m * 0.31;
    const rh = _afrRoof(x, y, w, h, U, t, { units: [[0.88, 0.72, 0.34]], vents: [[0.78, 0.82]], windows: true, lit: on, spin: on });
    const gx = x + w * 0.05, gy = y + rh * 0.16, gw = w * 0.66, gh = rh * 0.66;
    ctx.fillStyle = '#161c22'; ctx.fillRect(gx - 1.6 * U, gy - 1.6 * U, gw + 3.2 * U, gh + 3.2 * U);
    ctx.fillStyle = '#0a0e14'; ctx.fillRect(gx, gy, gw, gh);
    for (let q = 0; q < 6; q++) {
      const sx = gx + gw * (0.04 + q * 0.16), sy = gy + gh * 0.22, sw = gw * 0.12, sh = gh * 0.56;
      const col = on ? (gen ? (q % 2 ? '#7ad8ff' : '#c890ff') : '#ffb030') : '#1a2028';
      if (on) {
        const sg = ctx.createRadialGradient(sx + sw / 2, sy + sh / 2, 0, sx + sw / 2, sy + sh / 2, sw * 1.3);
        sg.addColorStop(0, gen ? (q % 2 ? 'rgba(122,216,255,0.35)' : 'rgba(200,144,255,0.35)') : 'rgba(255,176,48,0.3)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg; ctx.fillRect(sx - sw, sy - sh * 0.5, sw * 3, sh * 2);
      }
      ctx.fillStyle = col; ctx.globalAlpha = on ? 0.8 + 0.2 * Math.sin(t * 2 + q) : 1;
      ctx.fillRect(sx, sy, sw, sh);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#2a3038'; ctx.fillRect(sx - sw * 0.1, sy + sh + 1.2 * U, sw * 1.2, gh * 0.12);   // desk
    }
    const glass = ctx.createLinearGradient(gx, gy, gx + gw, gy + gh);
    glass.addColorStop(0, 'rgba(160,200,230,0.28)'); glass.addColorStop(0.5, 'rgba(60,90,120,0.06)'); glass.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = glass; ctx.fillRect(gx, gy, gw, gh);
    ctx.strokeStyle = '#11161b'; ctx.lineWidth = 0.9 * U; ctx.beginPath();
    for (let q = 1; q < 6; q++) { const sx = gx + gw * q / 6; ctx.moveTo(sx, gy); ctx.lineTo(sx, gy + gh); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(205,228,242,0.5)'; ctx.lineWidth = 0.6 * U; ctx.strokeRect(gx, gy, gw, gh);
    // comms mast: lattice tower with a dish and an aviation light
    const mx = x + w * 0.86, my = y + rh * 0.3, ms = 9 * U;
    const mast = (ox, oy) => {
      ctx.beginPath(); ctx.moveTo(mx + ox, my - ms + oy); ctx.lineTo(mx + ms + ox, my + ms * 0.7 + oy); ctx.lineTo(mx - ms + ox, my + ms * 0.7 + oy); ctx.closePath();
      ctx.moveTo(mx + ox, my - ms + oy); ctx.lineTo(mx + ox, my + ms * 0.7 + oy);
      ctx.moveTo(mx - ms * 0.5 + ox, my - ms * 0.15 + oy); ctx.lineTo(mx + ms * 0.5 + ox, my - ms * 0.15 + oy); ctx.stroke();
    };
    ctx.lineWidth = 1 * U;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; mast(5 * U, 7 * U);
    ctx.strokeStyle = '#c8ccd2'; mast(0, 0);
    ctx.save(); ctx.translate(mx - ms * 0.8, my - ms * 0.4); ctx.rotate(-0.6);
    const dg = ctx.createLinearGradient(-6 * U, -4 * U, 6 * U, 4 * U);
    dg.addColorStop(0, '#f4f6f8'); dg.addColorStop(1, '#8a9098');
    ctx.fillStyle = dg; ctx.beginPath(); ctx.ellipse(0, 0, 7 * U, 4.5 * U, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#3a3e44'; ctx.lineWidth = 0.6 * U; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(5 * U, -2 * U); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = Math.sin(t * 3) > 0.6 ? '#ff3828' : '#5a1810'; ctx.beginPath(); ctx.arc(mx, my - ms, 1.6 * U, 0, TAU); ctx.fill();
    label(x + w / 2, y - 10 * S, 'CONTROL');
  }

  // ── Field Core rack (left, below the pellet injector; render_field_core.js) ──
  if (typeof renderFieldCoreRack === 'function') {
    const x = m * 0.062, y = m * 0.585, len = m * 0.155, th = m * 0.05;   // inside the pad's straight left edge
    if (renderFieldCoreRack(e, x, y, len, th, false, S, t)) label(x + len / 2, y - 10 * S, 'FIELD CORES');
  }

  // ═══ The machine ═══

  // ── Cryostat ──
  ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.beginPath(); ctx.arc(cx + 12 * S, cy + 14 * S, R, 0, TAU); ctx.fill();
  const cg = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
  cg.addColorStop(0, '#767c90'); cg.addColorStop(0.7, '#383c4c'); cg.addColorStop(1, '#1c1e28');
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#8c90a8'; ctx.lineWidth = 3 * S; ctx.stroke();
  ctx.strokeStyle = '#20222c'; ctx.lineWidth = 2 * S; ctx.beginPath(); ctx.arc(cx, cy, R - 10 * S, 0, TAU); ctx.stroke();
  if (cold) {
    const fa = Math.min(1, (20 - K) / 15);
    ctx.strokeStyle = `rgba(235,250,255,${(0.5 * fa).toFixed(3)})`; ctx.lineWidth = 9 * S;
    ctx.setLineDash([4 * S, 5 * S]); ctx.beginPath(); ctx.arc(cx, cy, R - 4 * S, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = `rgba(220,245,255,${(0.7 * fa).toFixed(3)})`;
    for (let q = 0; q < 90; q++) { const a = q * 2.399, rr = R * (0.8 + ((q * 0.618) % 1) * 0.18); ctx.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 2 * S, 2 * S); }
  }
  ctx.fillStyle = '#1c1e26';
  for (let q = 0; q < 60; q++) { const a = q * TAU / 60; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * (R - 5 * S), cy + Math.sin(a) * (R - 5 * S), 2 * S, 0, TAU); ctx.fill(); }
  // diagnostic ports on the rim, two per period
  for (let q = 0; q < 10; q++) {
    const a = q * TAU / 10 + TAU / 20;
    ctx.save(); ctx.translate(...rim(a, R - 20 * S)); ctx.rotate(a);
    ctx.fillStyle = '#545a70'; ctx.fillRect(-8 * S, -6 * S, 16 * S, 12 * S);
    ctx.fillStyle = gen ? (Math.sin(t * 4 + q * 1.3) > 0 ? '#80ffb0' : '#2a5a40') : (on ? '#ffb030' : '#302820');
    ctx.beginPath(); ctx.arc(0, 0, 2.4 * S, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ── Vacuum vessel (follows the twisted band) ──
  ctx.fillStyle = '#05040a'; bandPath(1, 16 * S); ctx.fill('nonzero');
  ctx.strokeStyle = '#3a3850'; ctx.lineWidth = 2 * S;
  edgePath(1, 1, 16 * S); ctx.stroke(); edgePath(-1, 1, 16 * S); ctx.stroke();

  // ── Non-planar modular coils: ten per period, each twisted ──
  const NC = 50;
  const chase = gen ? (t * 9) % NC : charging ? chargeP * NC : -1;
  const cw = m * 0.0085;
  for (let i = 0; i < NC; i++) {
    const a = i * TAU / NC, j = i % 10;
    const [ax, ay] = at(a);
    const nx = Math.cos(a), ny = Math.sin(a), tx = -ny, ty = nx;
    const L = halfW(a) + m * 0.02;
    const phi = 0.36 * Math.sin(TAU * j / 10);
    const ux = nx * Math.cos(phi) + tx * Math.sin(phi), uy = ny * Math.cos(phi) + ty * Math.sin(phi);
    const bend = m * 0.012 * Math.cos(TAU * j / 10);
    const x0 = ax - ux * L, y0 = ay - uy * L, x1 = ax + ux * L, y1 = ay + uy * L;
    const qx = ax + tx * bend, qy = ay + ty * bend;
    const path = () => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(qx, qy, x1, y1); };
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = cw + 4 * S; ctx.save(); ctx.translate(4 * S, 5 * S); path(); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = '#121418'; ctx.lineWidth = cw + 2.5 * S; path(); ctx.stroke();
    ctx.strokeStyle = '#8e98a8'; ctx.lineWidth = cw; path(); ctx.stroke();
    ctx.strokeStyle = 'rgba(235,240,248,0.55)'; ctx.lineWidth = cw * 0.28; ctx.save(); ctx.translate(-cw * 0.22, -cw * 0.22); path(); ctx.stroke(); ctx.restore();
    let col = '#b87a40';
    if (gen) {
      const d = Math.min(Math.abs(i - chase), NC - Math.abs(i - chase));
      col = d < 2 ? '#f4ecff' : `rgba(${j % 2 ? '200,150,255' : '255,214,140'},${0.55 + 0.3 * Math.sin(t * 3 - i * 0.3)})`;
    } else if (charging) col = i <= chase ? '#ffd040' : '#5a4418';
    ctx.strokeStyle = col; ctx.lineWidth = cw * 0.22; path(); ctx.stroke();
  }
  ctx.lineCap = 'butt';

  // ── Plasma ──
  if (gen) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // bloom: violet halo, gold core
    ctx.fillStyle = `rgba(150,90,255,${0.2 + 0.06 * Math.sin(t * 2.1)})`; bandPath(1.35, 0); ctx.fill('nonzero');
    ctx.fillStyle = `rgba(255,200,130,${0.18 + 0.07 * Math.sin(t * 2.9 + 1)})`; bandPath(0.75, 0); ctx.fill('nonzero');
    // braided strands following the rotational transform
    const NS = 260, twists = 9;
    [[278, 0, 3.0], [42, 1.57, 3.4], [300, 3.14, 2.7], [200, 4.71, 3.8]].forEach(([hue, ph, spd], si) => {
      ctx.beginPath();
      for (let q = 0; q <= NS; q++) {
        const a = q * TAU / NS + t * 0.18;
        const off = halfW(a) * 0.78 * Math.sin(a * twists + ph - t * spd);
        const [x, y] = at(a, off);
        q ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = `hsla(${hue},100%,74%,0.8)`; ctx.lineWidth = 3.5 * S * Math.min(k, 3) / 2; ctx.stroke();
      ctx.strokeStyle = `hsla(${hue},100%,62%,0.22)`; ctx.lineWidth = 12 * S; ctx.stroke();
    });
    // white-hot filament on the magnetic axis
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2.5 * S;
    ctx.setLineDash([30 * S, 16 * S]); ctx.lineDashOffset = -t * 160 * S;
    edgePath(1, 0, 0); ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    // ions streaking round the axis
    for (let q = 0; q < 34; q++) {
      const sp = 0.9 + (q % 5) * 0.22, a1 = t * sp + q * 2.39, a0 = a1 - 0.16;
      const off = halfW(a1) * 0.55 * Math.sin(q * 1.7 + t * 2);
      ctx.beginPath();
      for (let s = 0; s <= 6; s++) { const a = a0 + (a1 - a0) * s / 6; const [x, y] = at(a, off); s ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      const [hx, hy] = at(a1, off), [tx0, ty0] = at(a0, off);
      const g = ctx.createLinearGradient(tx0, ty0, hx, hy);
      g.addColorStop(0, 'rgba(220,180,255,0)'); g.addColorStop(1, 'rgba(255,248,235,0.95)');
      ctx.strokeStyle = g; ctx.lineWidth = 2.2 * S; ctx.stroke();
    }
    // two hot spots chasing each other round the band, with flares
    for (let q = 0; q < 2; q++) {
      const a = t * 0.7 + q * Math.PI, [hx, hy] = at(a), fl = 0.7 + 0.3 * Math.sin(t * 6 + q * 2), hr = tw0 * 2.6;
      const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
      hg.addColorStop(0, `rgba(255,255,255,${0.9 * fl})`); hg.addColorStop(0.3, `rgba(255,214,150,${0.5 * fl})`); hg.addColorStop(1, 'rgba(180,120,255,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hx, hy, hr, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,240,220,${0.5 * fl})`; ctx.lineWidth = 1.5 * S;
      ctx.beginPath(); ctx.moveTo(hx - hr * 1.3, hy); ctx.lineTo(hx + hr * 1.3, hy); ctx.moveTo(hx, hy - hr * 1.3); ctx.lineTo(hx, hy + hr * 1.3); ctx.stroke();
    }
    ctx.restore();
  } else if (charging) {
    _fusionChargeFx(() => edgePath(1, 0, 0), cx, cy, Rp, R, t, chargeP);
  } else if (on) {
    ctx.strokeStyle = 'rgba(150,110,200,0.3)'; ctx.lineWidth = 8 * S;
    edgePath(1, 0, 0); ctx.stroke();
  }

  // ── Central support wheel and pumping tower (no solenoid) ──
  // Ten truss spokes from a crane-rail ring to the hub; instrument
  // cabinets between the spokes; the hub a bolted, stepped tower with the
  // core lens in the middle.
  {
    const inner = Rp * (1 - 0.085) - tw0 * 1.42 - 18 * S;
    const hubR = m * 0.07;
    // crane rail ring: bed, ties, twin rails
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 12 * S; ctx.beginPath(); ctx.arc(cx + 4 * S, cy + 5 * S, inner, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#1a1e26'; ctx.lineWidth = 11 * S; ctx.beginPath(); ctx.arc(cx, cy, inner, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#4a5262'; ctx.lineWidth = 9 * S; ctx.stroke();
    ctx.strokeStyle = '#2a303a'; ctx.lineWidth = 8 * S; ctx.setLineDash([1.6 * S, 5 * S]); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#b4bcca'; ctx.lineWidth = 1.3 * S;
    for (const o of [-2.4, 2.4]) { ctx.beginPath(); ctx.arc(cx, cy, inner + o * S, 0, TAU); ctx.stroke(); }
    // truss spokes
    for (let q = 0; q < 10; q++) {
      const a = q * TAU / 10 + TAU / 20, r0 = hubR * 0.95, r1 = inner - 4 * S;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.save(); ctx.rotate(-a); ctx.translate(5 * S, 7 * S); ctx.rotate(a); ctx.fillRect(r0, -6 * S, r1 - r0, 12 * S); ctx.restore();
      ctx.strokeStyle = '#4c5466'; ctx.lineWidth = 1.2 * S; ctx.beginPath();
      const nz = Math.max(4, Math.round((r1 - r0) / (14 * S)));
      for (let z = 0; z <= nz; z++) { const xx = r0 + (r1 - r0) * z / nz; z ? ctx.lineTo(xx, z % 2 ? 4.5 * S : -4.5 * S) : ctx.moveTo(xx, -4.5 * S); }
      ctx.stroke();
      for (const o of [-4.5, 4.5]) {
        ctx.strokeStyle = '#141820'; ctx.lineWidth = 3.4 * S; ctx.beginPath(); ctx.moveTo(r0, o * S); ctx.lineTo(r1, o * S); ctx.stroke();
        ctx.strokeStyle = '#8c96aa'; ctx.lineWidth = 2 * S; ctx.stroke();
      }
      ctx.restore();
    }
    // instrument cabinets between the spokes
    for (let q = 0; q < 10; q++) {
      const a = q * TAU / 10, [bx, by] = rim(a, hubR * 1.42);
      ctx.save(); ctx.translate(bx, by); ctx.rotate(a);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-5 * S + 2 * S, -8 * S + 3 * S, 12 * S, 16 * S);
      const g = ctx.createLinearGradient(-6 * S, -8 * S, 6 * S, 8 * S);
      g.addColorStop(0, '#9aa2b4'); g.addColorStop(1, '#4a5062');
      ctx.fillStyle = g; ctx.fillRect(-6 * S, -8 * S, 12 * S, 16 * S);
      ctx.strokeStyle = '#141820'; ctx.lineWidth = 0.8 * U; ctx.strokeRect(-6 * S, -8 * S, 12 * S, 16 * S);
      ctx.fillStyle = gen ? (Math.sin(t * 5 + q * 1.7) > 0 ? '#80ffb0' : '#2a5a40') : (on ? '#ffb030' : '#302820');
      ctx.fillRect(2 * S, -5 * S, 2.2 * S, 2.2 * S);
      ctx.fillStyle = 'rgba(20,24,32,0.6)'; ctx.fillRect(-4 * S, -1 * S, 8 * S, 1 * S); ctx.fillRect(-4 * S, 2 * S, 8 * S, 1 * S);
      ctx.restore();
    }
    // the hub tower
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.arc(cx + 8 * S, cy + 10 * S, hubR, 0, TAU); ctx.fill();
    const hg = ctx.createRadialGradient(cx - hubR * 0.4, cy - hubR * 0.4, 2, cx, cy, hubR);
    hg.addColorStop(0, '#eceff6'); hg.addColorStop(1, '#4a5064');
    ctx.fillStyle = hg; deca(hubR); ctx.fill();
    ctx.strokeStyle = '#141820'; ctx.lineWidth = 2 * S; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1 * S; deca(hubR - 2 * S); ctx.stroke();
    _afrBolts(cx, cy, hubR * 0.88, 30, U, 1.3);
    // raised inner step
    const sg = ctx.createRadialGradient(cx - hubR * 0.3, cy - hubR * 0.3, 2, cx, cy, hubR * 0.74);
    sg.addColorStop(0, '#f4f6fa'); sg.addColorStop(1, '#6a7084');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cx, cy, hubR * 0.74, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#1a1e28'; ctx.lineWidth = 1.4 * S; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1 * S; ctx.beginPath(); ctx.arc(cx, cy, hubR * 0.72, Math.PI * 0.9, Math.PI * 1.6); ctx.stroke();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(gen ? t * 0.5 : 0);
    ctx.strokeStyle = 'rgba(30,34,46,0.5)'; ctx.lineWidth = 1.5 * S;
    for (let q = 0; q < 20; q++) { ctx.rotate(TAU / 20); ctx.beginPath(); ctx.moveTo(hubR * 0.42, 0); ctx.lineTo(hubR * 0.68, 0); ctx.stroke(); }
    ctx.restore();
    // access hatch
    ctx.save(); ctx.translate(cx + hubR * 0.52, cy + hubR * 0.2); ctx.rotate(0.35);
    ctx.fillStyle = '#4a5062'; ctx.fillRect(-5 * S, -7 * S, 10 * S, 14 * S);
    ctx.strokeStyle = '#d8b030'; ctx.lineWidth = 1 * S; ctx.strokeRect(-5 * S, -7 * S, 10 * S, 14 * S);
    ctx.restore();
    // core lens
    ctx.fillStyle = '#1c2028'; ctx.beginPath(); ctx.arc(cx, cy, hubR * 0.38, 0, TAU); ctx.fill();
    _afrBolts(cx, cy, hubR * 0.35, 16, U, 0.9);
    const coreA = gen ? 0.7 + 0.3 * Math.sin(t * 4) : 1;
    ctx.fillStyle = gen ? `rgba(220,190,255,${coreA})` : (charging ? '#ffd040' : '#2a2c3a');
    ctx.beginPath(); ctx.arc(cx, cy, hubR * 0.3, 0, TAU); ctx.fill();
    if (gen || charging) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, hubR * 0.6);
      cg.addColorStop(0, gen ? `rgba(240,220,255,${(0.6 * coreA).toFixed(3)})` : 'rgba(255,210,80,0.4)'); cg.addColorStop(1, 'rgba(200,140,255,0)');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, hubR * 0.6, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.6 * S; ctx.beginPath(); ctx.arc(cx, cy, hubR * 0.24, Math.PI * 1.05, Math.PI * 1.5); ctx.stroke();
  }

  // ── Running effects ──
  if (gen) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // ion extraction beams out to the direct converters
    decs.forEach((d, i) => {
      const [x0, y0] = at(d.a, halfW(d.a)), ex = d.dx + d.dw * 0.06, ey = d.p[1];
      ctx.strokeStyle = 'rgba(160,100,255,0.35)'; ctx.lineWidth = 14 * S;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = 'rgba(235,215,255,0.9)'; ctx.lineWidth = 3 * S;
      ctx.setLineDash([16 * S, 10 * S]); ctx.lineDashOffset = -t * 220 * S - i * 13 * S;
      ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    });
    // neutral beams firing in
    nbiA.forEach((a) => {
      const [x0, y0] = rim(a, nbiR), [x1, y1] = at(a);
      ctx.strokeStyle = 'rgba(160,240,255,0.85)'; ctx.lineWidth = 3 * S;
      ctx.setLineDash([10 * S, 10 * S]); ctx.lineDashOffset = -t * 120 * S;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    });
    // flux surfaces drifting round outside and inside the band
    [[1, 30 * S, 1], [-1, 26 * S, -1]].forEach(([sgn, ex, dir], i) => {
      ctx.strokeStyle = `rgba(190,150,255,${0.35 + 0.2 * Math.sin(t * 3 + i)})`; ctx.lineWidth = 1.5 * S;
      ctx.setLineDash([12 * S, 14 * S]); ctx.lineDashOffset = dir * t * 70 * S;
      edgePath(sgn, 1, ex); ctx.stroke();
    });
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    // magnetic shock rings rolling outward from the hub
    for (let q = 0; q < 2; q++) {
      const p = ((t / 3.2) + q * 0.5) % 1, r = m * 0.075 + p * (R * 1.15 - m * 0.075);
      ctx.strokeStyle = `rgba(200,160,255,${0.45 * (1 - p) * (1 - p)})`; ctx.lineWidth = (10 - 7 * p) * S;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  } else if (charging) {
    // startup sparks hopping between neighbouring coils
    const seed = Math.floor(t * 14);
    if (seed % 2 === 0) {
      const q = seed % NC, a0 = q * TAU / NC, a1 = (q + 1) * TAU / NC;
      const [x0, y0] = at(a0, halfW(a0) + m * 0.03), [x1, y1] = at(a1, halfW(a1) + m * 0.03), [mx, my] = at((a0 + a1) / 2, halfW(a0) + m * 0.045);
      ctx.strokeStyle = 'rgba(255,220,120,0.9)'; ctx.lineWidth = 2 * S;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(mx, my); ctx.lineTo(x1, y1); ctx.stroke();
    }
  }

  // ── Field Core field: layered per live core, burst on install (render_field_core.js) ──
  if (typeof renderFieldCoreAura === 'function')
    renderFieldCoreAura(e, cx, cy, R, (sign, extra) => edgePath(sign, 1, extra), S, k, t);

  // ── Quench: helium blasting out of five vents, the coil leads arcing ──
  if (venting) {
    const p = 1 - e._quenchVent / 7;                     // 0 → 1 over the event
    ctx.save();
    for (let v = 0; v < 5; v++) {
      const a = -Math.PI / 2 + v * TAU / 5 + TAU / 10, [vx, vy] = rim(a, R);
      for (let q = 0; q < 12; q++) {
        const ph2 = (p * 1.4 + q / 12) % 1, dist = ph2 * m * 0.15;
        const x = vx + Math.cos(a + Math.sin(q * 2.1) * 0.3) * dist, y = vy + Math.sin(a + Math.sin(q * 2.1) * 0.3) * dist + ph2 * ph2 * 20 * S;
        const r = (14 + ph2 * 70) * S, al = Math.min(1, ph2 * 6) * (1 - ph2) * (1 - p * 0.4);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(245,252,255,${al.toFixed(3)})`); g.addColorStop(0.5, `rgba(210,238,250,${(al * 0.6).toFixed(3)})`); g.addColorStop(1, 'rgba(180,220,240,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
    }
    // arcs: coil leads to the pad, fiercest at the start
    ctx.globalCompositeOperation = 'lighter';
    const n = Math.round(10 * (1 - p)) + 2;
    for (let i = 0; i < n; i++) {
      const seed = Math.floor(t * 12 + i * 41);
      const rnd = (k2) => { const x = Math.sin(seed * 12.9898 + k2 * 78.233) * 43758.5453; return x - Math.floor(x); };
      const a0 = rnd(1) * TAU, a1 = a0 + (rnd(2) - 0.5) * 0.5;
      const [x0, y0] = at(a0, halfW(a0) + m * 0.02);
      const r1 = R + m * (0.03 + rnd(3) * 0.1);
      ctx.beginPath(); ctx.moveTo(x0, y0);
      for (let s = 1; s <= 6; s++) {
        const fq = s / 6, a = a0 + (a1 - a0) * fq, rr = (axR(a0) + halfW(a0)) + (r1 - axR(a0) - halfW(a0)) * fq;
        const j = s < 6 ? (rnd(4 + s) - 0.5) * 30 * S : 0;
        ctx.lineTo(cx + Math.cos(a) * rr + j, cy + Math.sin(a) * rr + j);
      }
      ctx.strokeStyle = 'rgba(180,140,255,0.4)'; ctx.lineWidth = 9 * S; ctx.stroke();
      ctx.strokeStyle = 'rgba(245,235,255,0.95)'; ctx.lineWidth = 2.2 * S; ctx.stroke();
    }
    ctx.restore();
  }
  // ── Coil repair: hazard ring round the opened cryostat ──
  if (e._coilRepair > 0) {
    ctx.strokeStyle = Math.sin(t * 4) > 0 ? 'rgba(255,190,40,0.9)' : 'rgba(120,80,10,0.9)';
    ctx.lineWidth = 6 * S; ctx.setLineDash([18 * S, 12 * S]); ctx.lineDashOffset = -t * 20 * S;
    ctx.beginPath(); ctx.arc(cx, cy, R + 14 * S, 0, TAU); ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }

  // ── Ignition: the flash as the surge completes and the plasma lights ──
  if (igniteP >= 0) _fusionIgniteFx(() => edgePath(1, 0, 0), cx, cy, Rp, R, t, igniteP, '200,150,255');

  ctx.restore();   // leave the local frame
  for (const [x, y, text, col] of labels) _frameText(f, x, y, text, `bold ${Math.max(7, 10 * S)}px Courier New`, col);

  // ── Ports (world space) ──
  const st = (typeof AdvancedFusionReactorSystem !== 'undefined') ? AdvancedFusionReactorSystem.getStubs(e) : null;
  if (st) {
    const A = (s) => _portAnchor(e, px, py, f.W, f.H, s);
    _portBelt(A(st.plasmaIn), S, t, { belt: '#c890ff', label: 'D-He3 PELLETS IN', on: !!e._hasPlasma, out: false });
    _portPipe(A(st.ionOutA),  S, t, { fluid: ion, label: 'ION OUT A', on: gen, out: true, flow: gen });
    _portPipe(A(st.ionOutB),  S, t, { fluid: ion, label: 'ION OUT B', on: gen, out: true, flow: gen });
    _portPipe(A(st.cryoIn),   S, t, { fluid: '#e8fcff', label: 'LHe IN', on: !!e._cryoLinked, out: false, flow: !!e._cryoRunning });
    _portPipe(A(st.ashOut),   S, t, { fluid: '#f0b8ff', label: 'HE ASH OUT', on: !!e._ashPipeOut, out: true, flow: !!e._ashPipeOut });
    _portPipe(A(st.coolantIn), S, t, { fluid: '#7af0ff', label: 'CRYO IN', on: !!e._coolantLinked, out: false, flow: !!e._coolantLinked });
  }

  // ── Plates ──
  const [nx, ny] = f.toWorld(W / 2, H * 0.022);
  _wfPlate('ADVANCED FUSION REACTOR · STELLARATOR', nx, ny, S, accent, on);
  const rep = e._coilRepair > 0 ? `${Math.floor(e._coilRepair / 60)}:${String(Math.floor(e._coilRepair % 60)).padStart(2, '0')}` : null;
  const plate = venting ? 'STELLARATOR QUENCH'
              : rep ? `COIL REPAIR ${rep}`
              : igniteP >= 0 && igniteP < 0.6 ? 'IGNITION'
              : charging ? `COILS CHARGING ${Math.round(chargeP * 100)}%`
              : e._started && K !== undefined && K > 4.6 ? `MAGNETS WARMING ${K.toFixed(1)} K`
              : !e._started && K !== undefined && !e._magnetsReady ? (K > 5 ? `COOLING DOWN ${K < 20 ? K.toFixed(1) : Math.round(K)} K` : 'FILLING HELIUM')
              : gen ? 'D-He3 · ION STREAM' : on ? 'D-He3 · IDLE' : 'OFFLINE';
  const plateCol = venting ? '#ff5040' : rep ? '#ffb030' : igniteP >= 0 && igniteP < 0.6 ? '#ffffff' : charging ? '#ffd040' : (!e._started && K !== undefined) ? '#b8f0ff' : accent;
  const [sx, sy] = f.toWorld(W * 0.34, H * 0.978);   // left of CRYO IN, which takes the bottom middle
  _wfPlate(plate, sx, sy, S, plateCol, on);
  const [lx, ly] = f.toWorld(W / 2 + m * 0.2, H * 0.022);
  _wfLamp(lx, ly, S, t, gen ? accent : (on ? '#ffb030' : '#ff4040'), true);
}
