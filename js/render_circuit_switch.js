/* ═══════════════════════════════════════════════════════════════════
   RENDER: CIRCUIT SWITCH
   4×4 outdoor feeder breaker in a hazard-striped compound: gravel pad,
   cable trench, a porcelain bushing stack carrying the busbar over the
   cabinet, twin knife blades behind glass with arc chutes above them,
   and a mechanical linkage running from the operating handle down to the
   blade shaft.

   Its one job is to answer OPEN or CLOSED from across the map, so four
   independent cues say the same thing: the blade angle, the beacon, the
   busbar (current dashes travel it only while closed), and the arc that
   snaps across the jaws the moment it is thrown. None of them depend on
   the building being powered — the switch has no power input by design.
   ═══════════════════════════════════════════════════════════════════ */

function renderCircuitSwitch(e, px, py, t) {
  const W = TILE * (e.width || 4), H = TILE * (e.height || 4);
  const S = W / 160;                       // authored against a 160-unit square
  const X = (v) => px + v * S, Y = (v) => py + v * S;
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), w * S, h * S); };
  const open  = typeof CircuitSwitchSystem !== 'undefined' && CircuitSwitchSystem.isOpen(e);
  const fine  = Camera.zoom > 0.5;
  const dark  = typeof DayNight !== 'undefined' ? DayNight.darkness() : 0;
  const night = dark > 0.3;
  const live  = open ? '#ff5038' : '#50e070';
  const pulse = 0.5 + 0.5 * Math.sin(t * (open ? 5 : 1.4));

  ctx.save();

  // ── Ground ──────────────────────────────────────────────────────
  // No backdrop — terrain shows through, the way the other plant sprites in
  // this file work. A filled pad read as a grey square parked on the map.
  // All that's left on the ground is the cabinet's own shadow and the cable
  // trench running out of it.
  if (fine) {
    // Cable trench leaving the cabinet toward the bottom edge
    R(70, 120, 20, 22, 'rgba(24,28,22,0.55)');
    R(70, 120, 20, 1.6, 'rgba(12,14,10,0.6)');
    for (let k = 0; k < 3; k++) R(72, 124 + k * 6.5, 16, 2.2, open ? 'rgba(60,66,60,0.7)' : 'rgba(150,126,60,0.8)');
  }
  // Contact shadow hugging the cabinet, thrown down-right like everything
  // else on the map — grounds it without painting a square.
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(X(30), Y(120), 112 * S, 8 * S);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(X(136), Y(52), 6 * S, 70 * S);

  // ── Cabinet ─────────────────────────────────────────────────────
  const cg = ctx.createLinearGradient(X(24), 0, X(136), 0);
  cg.addColorStop(0, '#39423e'); cg.addColorStop(0.55, '#2b3230'); cg.addColorStop(1, '#1e2422');
  ctx.fillStyle = cg;
  ctx.fillRect(X(24), Y(46), 112 * S, 76 * S);
  R(24, 46, 112, 4, '#4a5450');                            // sunlit roof edge
  R(24, 118, 112, 5, '#161b19');                           // plinth shadow
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.2 * S;
  ctx.strokeRect(X(24), Y(46), 112 * S, 76 * S);

  // Louvre vents, door seam and hinges
  if (fine) {
    for (let k = 0; k < 4; k++) R(31, 62 + k * 10, 22, 4.5, '#1b211f');
    R(58, 50, 1.4, 68, 'rgba(0,0,0,0.45)');
    for (const hy of [58, 106]) R(55, hy, 5, 5, '#4a524e');
  }

  // ── Bushing stack + busbar across the roof ──────────────────────
  // The clearest "this is high voltage gear" silhouette there is.
  const energized = !open;
  const busY = 36;
  for (const bx of [44, 80, 116]) {
    R(bx - 3.5, busY + 2, 7, 10, '#2c312e');               // base
    if (fine) for (let k = 0; k < 3; k++) {                // porcelain sheds
      const w = 11 - k * 1.6;
      R(bx - w / 2, busY - 2 - k * 3.4, w, 2.6, k % 2 ? '#c8bda6' : '#b3a893');
    }
    R(bx - 2.2, busY - 12, 4.4, 5, '#8a9298');             // terminal
  }
  // Busbar
  R(40, busY - 13, 80, 4.2, energized ? '#c8a848' : '#4a4a46');
  if (fine && energized) {
    // Current travelling the bar — only while the circuit is closed.
    for (let k = 0; k < 4; k++) {
      const ph = ((t * 0.5) + k / 4) % 1;
      ctx.fillStyle = `rgba(255,236,170,${0.85 - ph * 0.5})`;
      ctx.fillRect(X(40 + ph * 76), Y(busY - 13), 6 * S, 4.2 * S);
    }
  }
  // Riser dropping from the bar into the cabinet
  R(78, busY - 9, 3.4, 12, energized ? '#a88a3a' : '#3d3d3a');

  // ── Glazed bay: arc chutes, jaws, twin knife blades ─────────────
  const gx = 64, gy = 56, gw = 62, gh = 50;
  R(gx, gy, gw, gh, '#0c110f');
  ctx.strokeStyle = '#4e5854'; ctx.lineWidth = 1 * S;
  ctx.strokeRect(X(gx), Y(gy), gw * S, gh * S);
  if (fine) {                                              // arc chutes
    for (let k = 0; k < 2; k++) R(gx + 10 + k * 26, gy + 3, 16, 9, '#252b29');
    for (let k = 0; k < 2; k++) for (let f = 0; f < 3; f++)
      R(gx + 11 + k * 26, gy + 4.5 + f * 2.6, 14, 1.2, '#161a19');
  }

  // Upper bar stays live either way; lower only when closed.
  R(gx + 6, gy + 16, gw - 12, 4, '#8a7a4a');
  R(gx + 6, gy + 38, gw - 12, 4, open ? '#3a3a3a' : '#8a7a4a');

  // Twin blades on a common shaft
  const hingeX = gx + 13, hingeY = gy + 40;
  const ang = open ? -1.1 : -0.16;
  for (let b = 0; b < 2; b++) {
    const off = b * 13;
    ctx.save();
    ctx.translate(X(hingeX + off), Y(hingeY));
    ctx.rotate(ang);
    ctx.fillStyle = open ? '#9aa0a2' : '#e0c878';
    ctx.fillRect(0, -2.6 * S, 30 * S, 5.2 * S);
    ctx.fillStyle = '#6a7072';
    ctx.fillRect(25 * S, -4.2 * S, 6 * S, 8.4 * S);        // blade tip
    ctx.restore();
    ctx.fillStyle = '#c8ccc6';                              // hinge pin
    ctx.beginPath(); ctx.arc(X(hingeX + off), Y(hingeY), 2.6 * S, 0, Math.PI * 2); ctx.fill();
    // Contact jaws the blades seat into
    R(gx + 40 + off * 0.2, gy + 34, 5, 9, open ? '#3e4442' : '#c8a848');
  }

  // Arc snapping across the jaws just after it's thrown
  if (open && fine) {
    ctx.strokeStyle = `rgba(190,225,255,${0.3 + 0.55 * pulse})`;
    ctx.lineWidth = 1.2 * S;
    ctx.beginPath();
    ctx.moveTo(X(gx + 42), Y(gy + 36));
    ctx.lineTo(X(gx + 46 + pulse * 3), Y(gy + 28));
    ctx.lineTo(X(gx + 41), Y(gy + 21));
    ctx.lineTo(X(gx + 45 - pulse * 2), Y(gy + 17));
    ctx.stroke();
    if (night) drawGlowHalo(X(gx + 43), Y(gy + 27), 20 * S,
      [[0, 'rgba(190,225,255,1)'], [1, 'transparent']], 0.25 + 0.2 * pulse);
  }

  // ── Operating handle + linkage rod ──────────────────────────────
  const hy = open ? 60 : 100;
  R(138, 54, 10, 54, '#1c2220');                            // track
  if (fine) { R(140, 58, 1.6, 46, '#2e3634'); R(145, 58, 1.6, 46, '#2e3634'); }
  // Linkage from the handle down to the blade shaft. It runs in the strip
  // between the glazing and the cabinet edge — drawn straight across the
  // window it read as a stray line lying on the glass.
  const rodX = 131;
  ctx.strokeStyle = '#7e8a86'; ctx.lineWidth = 1.6 * S;
  ctx.beginPath();
  ctx.moveTo(X(137), Y(hy + 4));                 // handle pivot
  ctx.lineTo(X(rodX), Y(hy + 4));                // out to the rod
  ctx.lineTo(X(rodX), Y(hingeY + 2));            // down the cheek
  ctx.lineTo(X(gx + gw + 1), Y(hingeY + 2));     // in toward the shaft
  ctx.stroke();
  if (fine) {                                     // crank pin at each end
    ctx.fillStyle = '#c0c8c4';
    ctx.beginPath(); ctx.arc(X(rodX), Y(hy + 4), 1.7 * S, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(X(rodX), Y(hingeY + 2), 1.7 * S, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = open ? '#ff6a4a' : '#7ad88a';
  ctx.beginPath(); ctx.roundRect(X(135), Y(hy - 6), 16 * S, 13 * S, 3 * S); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.9 * S; ctx.stroke();
  if (fine) R(138, hy - 2, 10, 2.2, 'rgba(255,255,255,0.35)');   // grip ridge

  // ── Beacon on the cabinet roof ──────────────────────────────────
  R(33, 40, 7, 7, '#2a302e');
  ctx.fillStyle = live;
  ctx.globalAlpha = open ? 0.45 + 0.55 * pulse : 0.92;
  ctx.beginPath(); ctx.arc(X(36.5), Y(38), 5 * S, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  if (night) drawGlowHalo(X(36.5), Y(38), 18 * S, [[0, live], [1, 'transparent']], open ? 0.25 + 0.25 * pulse : 0.3);

  // ── Segmented capacity gauge ────────────────────────────────────
  if (fine && typeof CircuitSwitchSystem !== 'undefined') {
    const cap  = (e.def && e.def.switchCapacity) || CircuitSwitchSystem.CAPACITY_W;
    const used = CircuitSwitchSystem.assignedPeak(e);
    const frac = Math.max(0, Math.min(1, cap > 0 ? used / cap : 0));
    const SEG = 10;
    R(30, 108, 96, 8, '#12100c');
    for (let k = 0; k < SEG; k++) {
      const on = (k + 0.5) / SEG <= frac;
      const col = !on ? '#22262a' : k >= SEG - 2 ? '#ff8040' : k >= SEG - 4 ? '#ffc040' : '#40c0ff';
      R(31.5 + k * 9.4, 109.5, 7.6, 5, col);
    }
    ctx.strokeStyle = 'rgba(150,170,165,0.4)'; ctx.lineWidth = 0.7 * S;
    ctx.strokeRect(X(30), Y(108), 96 * S, 8 * S);
  }

  // ── Placards ────────────────────────────────────────────────────
  if (fine) {
    // Hazard triangle
    ctx.fillStyle = '#e8c832';
    ctx.beginPath();
    ctx.moveTo(X(46), Y(96)); ctx.lineTo(X(52), Y(106)); ctx.lineTo(X(40), Y(106));
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1a1608';
    ctx.fillRect(X(45.4), Y(99.5), 1.4 * S, 4 * S);
    ctx.fillRect(X(45.4), Y(104.4), 1.4 * S, 1.4 * S);
    // Designation stencil
    ctx.fillStyle = 'rgba(190,205,200,0.65)';
    ctx.font = `bold ${Math.max(4, 6 * S)}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('CB-1', X(30), Y(58));
  }

  // ── Status word ─────────────────────────────────────────────────
  if (fine) {
    ctx.fillStyle = open ? 'rgba(255,150,120,0.95)' : 'rgba(150,235,175,0.92)';
    ctx.font = `bold ${Math.max(6, 11 * S)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(open ? 'OPEN' : 'CLOSED', X(80), Y(138));
    ctx.textAlign = 'left';
  }

  ctx.restore();
}

/* ═══════════════════════════════════════════════════════════════════
   RENDER: CIRCUIT SWITCH MK2
   6×5 armoured switchgear compound — the MK1 scaled up and re-equipped:
   a double bushing row spanning a wider busbar, three glazed breaker
   bays side by side instead of one (each with its own knife blade and
   arc chutes), a quad-lamp beacon mast instead of a single dome, and a
   two-row segmented capacity gauge for the bigger 1.4 MW roster. Cyan
   accent lighting throughout (vs. the MK1's amber) marks it as the
   upgraded tier at a glance.
   ═══════════════════════════════════════════════════════════════════ */
function renderCircuitSwitch2(e, px, py, t) {
  const A = TILE * 7;                      // authored against a 260-unit, 7-tile square
  const S = A / 260;
  // The art only fills the square's middle 5 rows and its right 6 columns,
  // so the 6×5 footprint draws it one tile up and one tile left. Saves from
  // before the trim are migrated to 6×5 on load (save.js).
  const ox = TILE * (e.width || 6) - A, oy = (TILE * (e.height || 5) - A) / 2;
  const X = (v) => px + ox + v * S, Y = (v) => py + oy + v * S;
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), w * S, h * S); };
  const open  = typeof CircuitSwitchSystem !== 'undefined' && CircuitSwitchSystem.isOpen(e);
  const fine  = Camera.zoom > 0.5;
  const dark  = typeof DayNight !== 'undefined' ? DayNight.darkness() : 0;
  const night = dark > 0.3;
  const live  = open ? '#ff5038' : '#40d0ff';
  const pulse = 0.5 + 0.5 * Math.sin(t * (open ? 5 : 1.4));
  const energized = !open;

  ctx.save();

  // ── Ground ──────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(X(46), Y(206), 184 * S, 12 * S);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(X(222), Y(84), 9 * S, 118 * S);

  // ── Cabinet ─────────────────────────────────────────────────────
  const cg = ctx.createLinearGradient(X(36), 0, X(224), 0);
  cg.addColorStop(0, '#2c3a3e'); cg.addColorStop(0.55, '#20292c'); cg.addColorStop(1, '#151c1e');
  ctx.fillStyle = cg;
  ctx.fillRect(X(36), Y(76), 188 * S, 128 * S);
  R(36, 76, 188, 6, '#3e5458');
  R(36, 200, 188, 8, '#0e1416');
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.4 * S;
  ctx.strokeRect(X(36), Y(76), 188 * S, 128 * S);
  // Chevron hazard band along the plinth — the MK2's one big "bigger &
  // upgraded" tell even at a glance/low zoom.
  ctx.save();
  ctx.beginPath(); ctx.rect(X(36), Y(190), 188 * S, 9 * S); ctx.clip();
  ctx.fillStyle = '#191f1f'; ctx.fillRect(X(36), Y(190), 188 * S, 9 * S);
  ctx.fillStyle = '#e8c832';
  for (let cx = -10; cx < 200; cx += 16) {
    ctx.beginPath();
    ctx.moveTo(X(36 + cx), Y(190)); ctx.lineTo(X(36 + cx + 8), Y(190));
    ctx.lineTo(X(36 + cx + 16), Y(199)); ctx.lineTo(X(36 + cx + 8), Y(199));
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  if (fine) {
    for (let k = 0; k < 6; k++) R(43, 90 + k * 15, 26, 6, '#141a19');
    R(120, 80, 1.8, 116, 'rgba(0,0,0,0.4)');
    for (const hy of [86, 186]) { R(116, hy, 6, 6, '#5a6864'); R(126, hy, 6, 6, '#5a6864'); }
  }

  // ── Double bushing row + wide busbar across the roof ─────────────
  const busY = 56;
  for (const bx of [58, 90, 122, 154, 186, 202]) {
    R(bx - 4, busY + 2, 8, 12, '#232c2a');
    if (fine) for (let k = 0; k < 3; k++) {
      const w = 12.5 - k * 1.8;
      R(bx - w / 2, busY - 3 - k * 3.8, w, 3, k % 2 ? '#cdd8f0' : '#a8b6e0');   // cool-toned porcelain — MK2's tell
    }
    R(bx - 2.6, busY - 15, 5.2, 6, '#8fa0b0');
  }
  R(50, busY - 17, 156, 5.4, energized ? '#48c8e8' : '#3a4448');
  if (fine && energized) {
    for (let k = 0; k < 7; k++) {
      const ph = ((t * 0.55) + k / 7) % 1;
      ctx.fillStyle = `rgba(170,236,255,${0.85 - ph * 0.5})`;
      ctx.fillRect(X(50 + ph * 150), Y(busY - 17), 7 * S, 5.4 * S);
    }
  }
  R(94, busY - 12, 4.2, 16, energized ? '#3aa8cc' : '#3a4448');
  R(158, busY - 12, 4.2, 16, energized ? '#3aa8cc' : '#3a4448');

  // ── Three glazed breaker bays, side by side ──────────────────────
  const bayW = 52, bayGap = 6, bayY = 84, bayH = 62;
  const bayX0 = 48;
  const bayCenters = [];
  for (let bi = 0; bi < 3; bi++) {
    const gx = bayX0 + bi * (bayW + bayGap), gy = bayY, gw = bayW, gh = bayH;
    bayCenters.push(gx);
    R(gx, gy, gw, gh, '#0a1416');
    ctx.strokeStyle = '#455e5a'; ctx.lineWidth = 1.1 * S;
    ctx.strokeRect(X(gx), Y(gy), gw * S, gh * S);
    if (fine) {
      for (let k = 0; k < 2; k++) R(gx + 8 + k * 22, gy + 3, 14, 8, '#1c2624');
      for (let k = 0; k < 2; k++) for (let f = 0; f < 3; f++)
        R(gx + 9 + k * 22, gy + 4.5 + f * 2.4, 12, 1.1, '#101816');
    }
    R(gx + 5, gy + 20, gw - 10, 3.6, '#5a8a94');
    R(gx + 5, gy + 46, gw - 10, 3.6, open ? '#354040' : '#5a8a94');

    const hingeX = gx + 11, hingeY = gy + 48;
    const ang = open ? -1.1 : -0.16;
    ctx.save();
    ctx.translate(X(hingeX), Y(hingeY));
    ctx.rotate(ang);
    ctx.fillStyle = open ? '#8a9698' : '#68d8f0';
    ctx.fillRect(0, -2.3 * S, 26 * S, 4.6 * S);
    ctx.fillStyle = '#5a7276';
    ctx.fillRect(21 * S, -3.6 * S, 5 * S, 7.2 * S);
    ctx.restore();
    ctx.fillStyle = '#c8ccc6';
    ctx.beginPath(); ctx.arc(X(hingeX), Y(hingeY), 2.3 * S, 0, Math.PI * 2); ctx.fill();
    R(gx + 34, gy + 42, 4.4, 8, open ? '#354040' : '#48c8e8');

    if (open && fine) {
      const ph = (t * 6 + bi * 0.7) % 1;
      if (ph < 0.35) {
        ctx.strokeStyle = `rgba(160,225,255,${0.35 + 0.55 * (1 - ph / 0.35)})`;
        ctx.lineWidth = 1 * S;
        ctx.beginPath();
        ctx.moveTo(X(gx + 36), Y(gy + 44)); ctx.lineTo(X(gx + 40), Y(gy + 36));
        ctx.lineTo(X(gx + 35), Y(gy + 29));
        ctx.stroke();
      }
    }
  }

  // ── Operating handle + linkage (drives all three bays together) ──
  const hy = open ? 92 : 148;
  R(226, 82, 12, 72, '#151c1a');
  if (fine) { R(228, 87, 2, 62, '#232c2a'); R(234, 87, 2, 62, '#232c2a'); }
  const rodX = 216;
  ctx.strokeStyle = '#7e9a96'; ctx.lineWidth = 1.8 * S;
  ctx.beginPath();
  ctx.moveTo(X(225), Y(hy + 5));
  ctx.lineTo(X(rodX), Y(hy + 5));
  ctx.lineTo(X(rodX), Y(132));
  ctx.lineTo(X(bayCenters[2] + bayW + 2), Y(132));
  ctx.stroke();
  for (const bc of bayCenters) {
    ctx.beginPath();
    ctx.moveTo(X(rodX), Y(132));
    ctx.lineTo(X(bc + 11), Y(132));
    ctx.stroke();
  }
  if (fine) {
    ctx.fillStyle = '#c8e8f0';
    ctx.beginPath(); ctx.arc(X(rodX), Y(hy + 5), 1.8 * S, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = open ? '#ff6a4a' : '#48d8f0';
  ctx.beginPath(); ctx.roundRect(X(222), Y(hy - 7), 20 * S, 16 * S, 3.5 * S); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1 * S; ctx.stroke();
  if (fine) R(226, hy - 2, 12, 2.6, 'rgba(255,255,255,0.4)');

  // ── Quad-lamp beacon mast on the roof ─────────────────────────────
  R(48, 62, 5, 16, '#2a3634');
  const beaconPts = [[46, 58], [56, 58], [46, 68], [56, 68]];
  for (const [bx, by] of beaconPts) {
    ctx.fillStyle = live;
    ctx.globalAlpha = open ? 0.4 + 0.55 * pulse : 0.9;
    ctx.beginPath(); ctx.arc(X(bx), Y(by), 3.6 * S, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (night) drawGlowHalo(X(51), Y(63), 26 * S, [[0, live], [1, 'transparent']], open ? 0.28 + 0.25 * pulse : 0.32);

  // ── Two-row segmented capacity gauge — the bigger roster reads as
  //    twice the gauge, not just a bigger number ──────────────────
  if (fine && typeof CircuitSwitchSystem !== 'undefined') {
    const cap  = (e.def && e.def.switchCapacity) || CircuitSwitchSystem.CAPACITY_W;
    const used = CircuitSwitchSystem.assignedPeak(e);
    const frac = Math.max(0, Math.min(1, cap > 0 ? used / cap : 0));
    const SEG = 12;
    for (let row = 0; row < 2; row++) {
      const gy = 174 + row * 11;
      R(46, gy, 168, 9, '#0c1210');
      for (let k = 0; k < SEG; k++) {
        const idx = row * SEG + k;
        const on = (idx + 0.5) / (SEG * 2) <= frac;
        const col = !on ? '#1c262a' : idx >= SEG * 2 - 4 ? '#ff8040' : idx >= SEG * 2 - 8 ? '#ffc040' : '#48d8f0';
        R(47.5 + k * 13.9, gy + 1.5, 11.5, 6, col);
      }
      ctx.strokeStyle = 'rgba(150,190,195,0.4)'; ctx.lineWidth = 0.8 * S;
      ctx.strokeRect(X(46), Y(gy), 168 * S, 9 * S);
    }
  }

  // ── Placards ────────────────────────────────────────────────────
  if (fine) {
    ctx.fillStyle = '#e8c832';
    ctx.beginPath();
    ctx.moveTo(X(70), Y(160)); ctx.lineTo(X(78), Y(172)); ctx.lineTo(X(62), Y(172));
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1a1608';
    ctx.fillRect(X(69.2), Y(164), 1.8 * S, 5 * S);
    ctx.fillRect(X(69.2), Y(170.4), 1.8 * S, 1.8 * S);
    ctx.fillStyle = 'rgba(170,220,230,0.7)';
    ctx.font = `bold ${Math.max(4, 7 * S)}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('CB-2 MK2', X(46), Y(80));
  }

  // ── Status word ─────────────────────────────────────────────────
  if (fine) {
    ctx.fillStyle = open ? 'rgba(255,150,120,0.95)' : 'rgba(130,225,245,0.95)';
    ctx.font = `bold ${Math.max(6, 13 * S)}px monospace`;
    ctx.textAlign = 'center';
    // On the cabinet's lower face — the clear band between the breaker
    // bays (to y 146) and the capacity gauge (from y 174), right of the
    // warning placard.
    ctx.fillText(open ? 'OPEN' : 'CLOSED', X(130), Y(167));
    ctx.textAlign = 'left';
  }

  ctx.restore();
}
