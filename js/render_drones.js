/* ═══════════════════════════════════════════════════════════════════
   DRONE PORT + FLEET RENDERER

   The port: a 9×9 vertiport site. A concrete apron carrying an asphalt
   flight deck, ten marked touchdown pads with lit perimeters, a glazed
   control tower, a maintenance hangar, a fenced transformer yard and a
   charging gantry. Painted taxiway centrelines, a windsock and a beacon
   mast. A pad reads its own drone: lit when it is home, dark when it is
   out, with a charge arc around the rim while it tops up — so the deck
   itself is the fleet readout.

   Drawn in the same language as the rest of the site buildings: drop
   shadows, gradient-lit volumes and real materials (concrete, asphalt,
   painted markings), with the cyan accent kept for LIGHTS and status only.
   A deck made of cyan strokes reads as a diagram; a deck made of concrete
   with cyan lights on it reads as a building.

   Everything is laid out in FRACTIONS of the footprint, so the sprite
   follows the def rather than needing a rewrite if the size changes.

   The drones: quadcopters drawn in world space over the entity layer,
   so they pass above buildings rather than behind them. Each is a body,
   four rotor discs, a status light and a battery pip. Rotors blur while
   flying and idle on the pad.

   Drones are not entities, so nothing in the main render switch knows
   about them — renderDroneFleets() is called once per frame from the
   overlay pass with the whole fleet, which is also why they cannot be
   occluded by the tile they happen to be over.
   ═══════════════════════════════════════════════════════════════════ */

function renderDronePort(e, px, py, t) {
  if (DroneArt.ok(e, 'dport', 9, 9)) return _dportArt(e, px, py, t);   // rendered (end of this file)
  const def = EntityDefs[T.DRONEPORT];
  const W   = (e.width  || def.width)  * TILE;
  const H   = (e.height || def.height) * TILE;
  const on  = e.powered;
  const S   = TILE / 40;
  const k   = Math.min(W, H) / (9 * TILE);     // detail scale, 1 at the 9x9 size
  const accent = '#5ad8ff';
  const drones = (typeof DroneSystem !== 'undefined') ? DroneSystem.fleet(e) : [];
  const stormy = (typeof DroneSystem !== 'undefined') && !!DroneSystem.slowedBy();
  const cx = px + W * 0.5, cy = py + H * 0.46;
  ctx.save();

  // ── Site apron ──────────────────────────────────────────────────
  // Concrete hardstanding under the whole site, the way the reactor sits
  // on one. Without it the deck floats on grass and reads as a decal.
  _wfShadow(px + 2, py + 2, W - 4, H - 4, S, 5 * S);
  const ag = ctx.createLinearGradient(px, py, px + W, py + H);
  ag.addColorStop(0, '#8e9288'); ag.addColorStop(0.5, '#74786e'); ag.addColorStop(1, '#5c6058');
  ctx.fillStyle = ag;
  ctx.beginPath(); ctx.roundRect(px + 2, py + 2, W - 4, H - 4, 5 * S); ctx.fill();
  ctx.strokeStyle = '#3a3e36'; ctx.lineWidth = 1.5 * S; ctx.stroke();

  // Expansion joints in the concrete.
  ctx.strokeStyle = 'rgba(40,44,38,0.35)'; ctx.lineWidth = S;
  const cols = e.width || def.width, rows = e.height || def.height;
  for (let i = 1; i < cols; i++) {
    const fx = px + 2 + (W - 4) * (i / cols);
    ctx.beginPath(); ctx.moveTo(fx, py + 4); ctx.lineTo(fx, py + H - 4); ctx.stroke();
  }
  for (let i = 1; i < rows; i++) {
    const fy = py + 2 + (H - 4) * (i / rows);
    ctx.beginPath(); ctx.moveTo(px + 4, fy); ctx.lineTo(px + W - 4, fy); ctx.stroke();
  }

  // ── Flight deck ─────────────────────────────────────────────────
  // Asphalt, inset from the apron with a painted kerb line.
  const dx = px + W * 0.20, dy = py + H * 0.06;
  const dw = W * 0.60,      dh = H * 0.88;
  const dg = ctx.createLinearGradient(dx, dy, dx + dw, dy + dh);
  dg.addColorStop(0, '#34383a'); dg.addColorStop(0.55, '#2a2e30'); dg.addColorStop(1, '#212527');
  ctx.fillStyle = dg;
  ctx.beginPath(); ctx.roundRect(dx, dy, dw, dh, 3 * S); _fillMetalG(ctx);
  ctx.strokeStyle = 'rgba(232,236,240,0.30)'; ctx.lineWidth = 1.6 * S;
  ctx.beginPath(); ctx.roundRect(dx + 2.5 * S, dy + 2.5 * S, dw - 5 * S, dh - 5 * S, 2 * S); ctx.stroke();
  // Deck plating: faint panel seams, so the asphalt reads as a built
  // surface, and hazard stripes cut across its four corners.
  ctx.save();
  ctx.beginPath(); ctx.roundRect(dx, dy, dw, dh, 3 * S); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = S;
  ctx.beginPath();
  for (let q = 1; q < 8; q++)  { const lx = dx + dw * q / 8;  ctx.moveTo(lx, dy); ctx.lineTo(lx, dy + dh); }
  for (let q = 1; q < 12; q++) { const ly = dy + dh * q / 12; ctx.moveTo(dx, ly); ctx.lineTo(dx + dw, ly); }
  ctx.stroke();
  for (const [qx, qy, a] of [[dx, dy, 0], [dx + dw, dy, Math.PI / 2], [dx + dw, dy + dh, Math.PI], [dx, dy + dh, -Math.PI / 2]]) {
    ctx.save(); ctx.translate(qx, qy); ctx.rotate(a);
    ctx.fillStyle = 'rgba(216,168,32,0.9)';
    for (let q = 0; q < 3; q++) {
      const o = (5 + q * 7) * S * k, w2 = 3.5 * S * k;
      ctx.beginPath(); ctx.moveTo(o, 0); ctx.lineTo(o + w2, 0); ctx.lineTo(0, o + w2); ctx.lineTo(0, o); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
  // The port's number, stencilled on the deck between the west pads.
  {
    const n = (typeof DroneFleetPanel !== 'undefined' && DroneFleetPanel.number) ? (DroneFleetPanel.number(e) || 1) : 1;
    ctx.fillStyle = 'rgba(236,240,244,0.34)';
    ctx.font = `bold ${Math.max(6, 10 * S * k)}px Courier New`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`DP·${String(n).padStart(2, '0')}`, px + W * 0.272, py + H * 0.5);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
  // A lit kerb round the whole deck while the port has power.
  if (on) {
    ctx.strokeStyle = 'rgba(90,216,255,0.13)'; ctx.lineWidth = 5 * S;
    ctx.beginPath(); ctx.roundRect(dx, dy, dw, dh, 3 * S); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,226,255,0.6)'; ctx.lineWidth = 1.1 * S;
    ctx.beginPath(); ctx.roundRect(dx, dy, dw, dh, 3 * S); ctx.stroke();
  }

  // ── Pad layout: 3 top, 2+2 flanking, 3 bottom ──────────────────
  // Owned by DroneSystem -- it decides where a drone physically sits, and
  // this follows it. Falls back only so the placement ghost still draws if
  // the sim module has not loaded yet.
  const PADS = (typeof DroneSystem !== 'undefined' && DroneSystem.PADS) || [
    [0.335, 0.135], [0.50, 0.135], [0.665, 0.135],
    [0.295, 0.395],                [0.705, 0.395],
    [0.295, 0.605],                [0.705, 0.605],
    [0.335, 0.865], [0.50, 0.865], [0.665, 0.865],
  ];
  const pr = Math.min(W, H) * PAD_R_FRACTION;

  // Feeder lines set into the deck, tower to pad: a painted yellow guide over
  // a dark channel. The channel runs with light while it is doing something:
  // green out to a pad that is charging its drone, amber while one lifts off
  // or sets down.
  ctx.lineCap = 'round';
  for (let i = 0; i < PADS.length; i++) {
    const p = PADS[i], dr = drones[i];
    const mx = px + W * p[0], my = py + H * p[1];
    const vx = cx - mx, vy = cy - my, len = Math.hypot(vx, vy) || 1;
    const ax = mx + (vx / len) * pr * 1.25, ay = my + (vy / len) * pr * 1.25;
    const bx = cx - (vx / len) * W * 0.135, by = cy - (vy / len) * W * 0.135;
    const seg = () => { ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ax, ay); ctx.stroke(); };
    ctx.strokeStyle = 'rgba(8,10,12,0.75)'; ctx.lineWidth = 3.6 * S; seg();
    ctx.strokeStyle = 'rgba(216,200,64,0.32)'; ctx.lineWidth = 1.6 * S; seg();
    if (on && dr) {
      const charging = dr.state === 'idle' && dr.battery < 1, moving = dr.state === 'launch' || dr.state === 'land';
      if (charging || moving) {
        ctx.strokeStyle = charging ? '#6cf0a0' : '#ffc24a'; ctx.lineWidth = 1.8 * S;
        ctx.setLineDash([4 * S, 7 * S]); ctx.lineDashOffset = -t * 30 * S;
        seg(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }
    }
  }
  ctx.lineCap = 'butt';

  // ── Touchdown pads ──────────────────────────────────────────────
  for (let i = 0; i < PADS.length; i++) {
    const mx = px + W * PADS[i][0], my = py + H * PADS[i][1];
    const d = drones[i];
    const parked = !d || d.state === 'idle';
    const home = parked;

    // A raised steel rim round a dark landing disc, then the painted TLOF
    // ring and cross.
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.arc(mx + 1.5 * S, my + 2.4 * S, pr * 1.1, 0, Math.PI * 2); ctx.fill();
    const rimG = ctx.createLinearGradient(mx - pr, my - pr, mx + pr, my + pr);
    rimG.addColorStop(0, '#99a199'); rimG.addColorStop(1, '#474d47');
    ctx.fillStyle = rimG;
    ctx.beginPath(); ctx.arc(mx, my, pr * 1.1, 0, Math.PI * 2); _fillMetalG(ctx);
    ctx.fillStyle = '#14181a';
    ctx.beginPath(); ctx.arc(mx, my, pr * 0.98, 0, Math.PI * 2); _fillMetalG(ctx);
    ctx.strokeStyle = home ? 'rgba(236,240,244,0.72)' : 'rgba(236,240,244,0.34)';
    ctx.lineWidth = 2 * S;
    ctx.beginPath(); ctx.arc(mx, my, pr * 0.80, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.4 * S;
    ctx.beginPath();
    ctx.moveTo(mx - pr * 0.42, my); ctx.lineTo(mx + pr * 0.42, my);
    ctx.moveTo(mx, my - pr * 0.42); ctx.lineTo(mx, my + pr * 0.42);
    ctx.stroke();

    // Four pad perimeter lights — green when the pad is clear to land on,
    // which is exactly when its drone is away.
    for (let q = 0; q < 4; q++) {
      const a = q * Math.PI / 2 + Math.PI / 4;
      const lx = mx + Math.cos(a) * pr * 0.98, ly = my + Math.sin(a) * pr * 0.98;
      ctx.fillStyle = !on ? '#2a3230' : home ? 'rgba(90,216,255,0.75)' : '#6cf0a0';
      ctx.beginPath(); ctx.arc(lx, ly, 1.3 * S, 0, Math.PI * 2); ctx.fill();
    }

    if (home && on) {
      // Occupied. The aircraft itself is drawn by renderDroneFleets in the
      // overlay pass -- this is just the lit berth under it, and the charge
      // arc around the rim.
      ctx.fillStyle = 'rgba(90,216,255,0.16)';
      ctx.beginPath(); ctx.arc(mx, my, pr * 0.62, 0, Math.PI * 2); ctx.fill();
      // The berth's charge readout: a ring of twelve segments round the
      // rim, filling clockwise from the top. Green while it tops up (orange
      // when the pack came home nearly flat), cyan once the drone is ready.
      if (d) {
        const rr = pr * 0.90, seg = Math.PI * 2 * rr / 12;
        ctx.lineWidth = 2.4 * S;
        ctx.setLineDash([seg * 0.68, seg * 0.32]);
        ctx.strokeStyle = 'rgba(90,216,255,0.16)';
        ctx.beginPath(); ctx.arc(mx, my, rr, -Math.PI / 2, Math.PI * 1.5); ctx.stroke();
        const lit = Math.max(1, Math.round(d.battery * 12));
        ctx.strokeStyle = d.battery >= 1 ? 'rgba(120,226,255,0.9)' : d.battery < 0.35 ? '#ff8040' : '#6cf0a0';
        ctx.beginPath(); ctx.arc(mx, my, rr, -Math.PI / 2, -Math.PI / 2 + (lit - 0.2) * (Math.PI * 2 / 12)); ctx.stroke();
        ctx.setLineDash([]);
        if (d.battery < 1) {                       // the pad glows while it is feeding the pack
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.16 + 0.08 * Math.sin(t * 5 + i);
          ctx.fillStyle = d.battery < 0.35 ? '#ff8040' : '#6cf0a0';
          ctx.beginPath(); ctx.arc(mx, my, pr * 1.25, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
    }

    // Rotor downwash while an aircraft is lifting off this pad or setting
    // down on it: expanding rings on the deck, strongest at the moment the
    // weight transfers. This is the cue that makes a launch read as a launch
    // rather than a sprite fading in.
    if (on && d && (d.state === 'launch' || d.state === 'land')) {
      const wash = 1 - Math.min(1, (d.alt || 0) / 0.75);   // fiercest near the deck
      if (wash > 0.02) {
        ctx.save();
        for (let q = 0; q < 2; q++) {
          const ph = ((t * 1.6 + q * 0.5) % 1);
          ctx.globalAlpha = 0.40 * wash * (1 - ph);
          ctx.strokeStyle = '#dce8f0';
          ctx.lineWidth = 1.6 * S;
          ctx.beginPath(); ctx.arc(mx, my, pr * (0.35 + ph * 1.25), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
      }
      // Pad lights flash amber through the whole movement.
      if (Math.sin(t * 12) > 0) {
        for (let q = 0; q < 4; q++) {
          const a = q * Math.PI / 2 + Math.PI / 4;
          ctx.fillStyle = '#ffc24a';
          ctx.beginPath();
          ctx.arc(mx + Math.cos(a) * pr * 0.98, my + Math.sin(a) * pr * 0.98, 1.9 * S, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // ── Maintenance hangar (left) ───────────────────────────────────
  const hgX = px + W * 0.045, hgY = py + H * 0.10, hgW = W * 0.14, hgH = H * 0.44;
  _wfShadow(hgX, hgY, hgW, hgH, S, 2 * S);
  const hg = ctx.createLinearGradient(hgX, 0, hgX + hgW, 0);
  hg.addColorStop(0, '#9aa096'); hg.addColorStop(0.6, '#6e746a'); hg.addColorStop(1, '#4e544c');
  ctx.fillStyle = hg; ctx.strokeStyle = '#2a2e28'; ctx.lineWidth = 1.4 * S;
  ctx.beginPath(); ctx.roundRect(hgX, hgY, hgW, hgH, 2.5 * S); _fillMetalG(ctx); ctx.stroke();
  // Ribbed roof.
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = S;
  for (let q = 1; q < 9; q++) {
    const ly = hgY + hgH * q / 9;
    ctx.beginPath(); ctx.moveTo(hgX + 2 * S, ly); ctx.lineTo(hgX + hgW - 2 * S, ly); ctx.stroke();
  }
  // Skylights down the ridge, lit while the port is.
  for (let q = 0; q < 4; q++) {
    ctx.fillStyle = on ? 'rgba(170,235,255,0.55)' : '#22282c';
    ctx.fillRect(hgX + hgW * 0.34, hgY + hgH * (0.07 + q * 0.2), hgW * 0.32, hgH * 0.085);
    ctx.strokeStyle = 'rgba(20,24,22,0.7)'; ctx.lineWidth = 0.8 * S;
    ctx.strokeRect(hgX + hgW * 0.34, hgY + hgH * (0.07 + q * 0.2), hgW * 0.32, hgH * 0.085);
  }
  // Roller door facing the deck, with a status lamp above it.
  ctx.fillStyle = '#20241f';
  ctx.fillRect(hgX + hgW - 3.5 * S, hgY + hgH * 0.34, 3.5 * S, hgH * 0.32);
  _wfHazardStripe(hgX + 1.5 * S, hgY + hgH - 6 * S, hgW - 3 * S, 3 * S, S);

  // ── Transformer yard (left, below the hangar) ───────────────────
  // Where 120 kW of idle draw physically arrives. Fenced, because it is
  // live switchgear sitting next to a public landing deck.
  const tyX = px + W * 0.045, tyY = py + H * 0.60, tyW = W * 0.14, tyH = H * 0.30;
  ctx.fillStyle = 'rgba(28,30,26,0.55)';
  ctx.beginPath(); ctx.roundRect(tyX, tyY, tyW, tyH, 2 * S); ctx.fill();
  ctx.strokeStyle = 'rgba(150,160,150,0.45)'; ctx.lineWidth = S;
  ctx.setLineDash([2.5 * S, 2.5 * S]);
  ctx.beginPath(); ctx.roundRect(tyX, tyY, tyW, tyH, 2 * S); ctx.stroke();
  ctx.setLineDash([]);
  for (const fy of [0.26, 0.62]) {
    const bx = tyX + tyW * 0.22, by = tyY + tyH * fy, bw = tyW * 0.56, bh = tyH * 0.26;
    _wfShadow(bx, by, bw, bh, S, 1.5 * S);
    const bg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    bg.addColorStop(0, '#7e8478'); bg.addColorStop(1, '#4a5048');
    ctx.fillStyle = bg; ctx.strokeStyle = '#23271f'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 1.5 * S); _fillMetalG(ctx); ctx.stroke();
    // Cooling fins.
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    for (let q = 1; q < 4; q++) {
      const lx = bx + bw * q / 4;
      ctx.beginPath(); ctx.moveTo(lx, by + S); ctx.lineTo(lx, by + bh - S); ctx.stroke();
    }
  }

  // ── Charging gantry (right) ─────────────────────────────────────
  // A real structure: two posts and a rail, with feeder arms reaching the
  // pads on that side and power visibly running down it.
  const gaX = px + W * 0.855;
  const gaT = py + H * 0.16, gaB = py + H * 0.86;
  _wfShadow(gaX - 2 * S, gaT, 4 * S, gaB - gaT, S, 1.5 * S);
  const gg = ctx.createLinearGradient(gaX - 3 * S, 0, gaX + 3 * S, 0);
  gg.addColorStop(0, '#8c9288'); gg.addColorStop(1, '#4c524a');
  ctx.fillStyle = gg; ctx.strokeStyle = '#262a24'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.roundRect(gaX - 2.5 * S, gaT, 5 * S, gaB - gaT, 1.5 * S); ctx.fill(); ctx.stroke();
  for (const fy of [gaT, (gaT + gaB) / 2, gaB]) {
    ctx.fillStyle = '#6a7066';
    ctx.beginPath(); ctx.arc(gaX, fy, 3 * S, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#262a24'; ctx.lineWidth = S; ctx.stroke();
  }
  // Feeder arms to the right-hand pads.
  ctx.strokeStyle = on ? '#5a6472' : '#333a34'; ctx.lineWidth = 2 * S;
  for (const p of [[0.705, 0.395], [0.705, 0.605]]) {
    ctx.beginPath();
    ctx.moveTo(gaX, py + H * p[1]);
    ctx.lineTo(px + W * (p[0] + 0.065), py + H * p[1]);
    ctx.stroke();
  }
  if (on) {
    const f = (t * 0.35) % 1;
    ctx.fillStyle = accent; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(gaX, gaT + (gaB - gaT) * f, 1.9 * S, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.25;
    ctx.beginPath(); ctx.arc(gaX, gaT + (gaB - gaT) * f, 5 * S, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ── Battery bank (right, above the stores) ──────────────────────
  // Ten aircraft on fast charge is a spiky load. The bank is what stops
  // the port slamming that spike straight onto the grid every time the
  // fleet lands together, and it balances the site against the hangar and
  // switchyard on the far side.
  const bbX = px + W * 0.885, bbY = py + H * 0.20, bbW = W * 0.075, bbH = H * 0.30;
  _wfShadow(bbX, bbY, bbW, bbH, S, 2 * S);
  const bbg = ctx.createLinearGradient(bbX, 0, bbX + bbW, 0);
  bbg.addColorStop(0, '#8e948a'); bbg.addColorStop(1, '#4a504a');
  ctx.fillStyle = bbg; ctx.strokeStyle = '#23271f'; ctx.lineWidth = 1.2 * S;
  ctx.beginPath(); ctx.roundRect(bbX, bbY, bbW, bbH, 2 * S); _fillMetalG(ctx); ctx.stroke();
  // Cell stacks, lit in sequence while the port is live.
  for (let q = 0; q < 4; q++) {
    const cyy = bbY + bbH * (0.10 + q * 0.225);
    ctx.fillStyle = '#1c2024';
    ctx.fillRect(bbX + bbW * 0.18, cyy, bbW * 0.64, bbH * 0.14);
    const lit = on && ((t * 0.7 + q * 0.25) % 1) < 0.55;
    ctx.fillStyle = lit ? 'rgba(108,240,160,0.85)' : 'rgba(60,90,70,0.5)';
    ctx.fillRect(bbX + bbW * 0.22, cyy + bbH * 0.035, bbW * 0.56, bbH * 0.06);
  }

  // ── Stores block (right, below the bank) ────────────────────────
  // Spares, rotors and battery packs. A vertiport that can only land
  // drones is a car park; the thing that makes it a base is the shed.
  const stX = px + W * 0.885, stY = py + H * 0.56, stW = W * 0.075, stH = H * 0.30;
  _wfShadow(stX, stY, stW, stH, S, 2 * S);
  const stg = ctx.createLinearGradient(stX, 0, stX + stW, 0);
  stg.addColorStop(0, '#969c92'); stg.addColorStop(1, '#4e544c');
  ctx.fillStyle = stg; ctx.strokeStyle = '#2a2e28'; ctx.lineWidth = 1.2 * S;
  ctx.beginPath(); ctx.roundRect(stX, stY, stW, stH, 2 * S); _fillMetalG(ctx); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = S;
  for (let q = 1; q < 6; q++) {
    const ly = stY + stH * q / 6;
    ctx.beginPath(); ctx.moveTo(stX + 2 * S, ly); ctx.lineTo(stX + stW - 2 * S, ly); ctx.stroke();
  }
  _wfHazardStripe(stX + 1.5 * S, stY + stH - 5.5 * S, stW - 3 * S, 3 * S, S);

  // ── Control tower ───────────────────────────────────────────────
  // Stepped: a shadowed base, then a glazed control room set back on top,
  // so it reads as height rather than as a flat square.
  // Eight-sided: a concrete base, a glazed cab with a window on every face,
  // and a radar head turning on the roof in step with the sweep below.
  const tb = Math.min(W, H) * 0.115;
  const oct = (r) => {
    ctx.beginPath();
    for (let q = 0; q < 8; q++) { const a = q * Math.PI / 4 + Math.PI / 8, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; q ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath();
  };
  ctx.fillStyle = 'rgba(0,0,0,0.20)'; ctx.save(); ctx.translate(9 * S, 13 * S); oct(tb * 1.0); ctx.fill(); ctx.restore();   // it stands tall
  ctx.fillStyle = 'rgba(0,0,0,0.36)'; ctx.save(); ctx.translate(4 * S, 6 * S); oct(tb * 1.14); ctx.fill(); ctx.restore();
  const bgd = ctx.createLinearGradient(cx - tb, cy - tb, cx + tb, cy + tb);
  bgd.addColorStop(0, '#a6aca2'); bgd.addColorStop(0.55, '#6e746a'); bgd.addColorStop(1, '#434943');
  ctx.fillStyle = bgd; ctx.strokeStyle = '#23271f'; ctx.lineWidth = 1.5 * S;
  oct(tb * 1.14); _fillMetalG(ctx); ctx.stroke();
  ctx.fillStyle = '#10161b'; ctx.strokeStyle = '#0a0e12'; ctx.lineWidth = S;
  oct(tb * 0.94); _fillMetalG(ctx); ctx.stroke();
  // Glazing: one pane to a face, each with its own slow flicker of screens.
  const tr = tb * 0.62;
  for (let q = 0; q < 8; q++) {
    const a0 = q * Math.PI / 4 + Math.PI / 8 + 0.09, a1 = a0 + Math.PI / 4 - 0.18, r0 = tb * 0.64, r1 = tb * 0.86;
    ctx.fillStyle = on ? `rgba(170,235,255,${(0.5 + 0.22 * Math.sin(t * 0.9 + q * 1.7)).toFixed(3)})` : '#1d2429';
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1); ctx.lineTo(cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1);
    ctx.lineTo(cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0); ctx.lineTo(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0);
    ctx.closePath(); ctx.fill();
  }
  const rgd = ctx.createRadialGradient(cx - tr * 0.4, cy - tr * 0.5, tr * 0.1, cx, cy, tr);
  rgd.addColorStop(0, '#46505a'); rgd.addColorStop(1, '#1d2429');
  ctx.fillStyle = rgd; ctx.strokeStyle = '#141a1e'; ctx.lineWidth = 1.2 * S;
  oct(tr); _fillMetalG(ctx); ctx.stroke();
  // the radar head
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(on ? t * 1.05 : 0.5);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-tr * 0.78 + 1.5 * S, -1.6 * S + 2 * S, tr * 1.56, 3.4 * S);
  ctx.fillStyle = on ? '#cfd8df' : '#4a545c'; ctx.fillRect(-tr * 0.78, -1.7 * S, tr * 1.56, 3.4 * S);
  ctx.fillStyle = on ? accent : '#3a4650'; ctx.fillRect(tr * 0.5, -2.8 * S, tr * 0.28, 5.6 * S);
  ctx.restore();
  ctx.fillStyle = '#2a3238'; ctx.beginPath(); ctx.arc(cx, cy, 2.8 * S, 0, Math.PI * 2); ctx.fill();

  // A ring of light turning round the tower: the port's airspace is live.
  if (on) {
    const hr = Math.min(W, H) * 0.165;
    ctx.save();
    ctx.strokeStyle = stormy ? 'rgba(255,170,80,0.55)' : 'rgba(90,216,255,0.5)'; ctx.lineWidth = 1.3 * S;
    ctx.setLineDash([11 * S, 5 * S, 2 * S, 5 * S]); ctx.lineDashOffset = -t * 12 * S;
    ctx.beginPath(); ctx.arc(cx, cy, hr, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Radar sweep off the tower.
  if (on) {
    const rr = Math.min(W, H) * 0.26;
    const a  = t * 1.05;
    ctx.strokeStyle = 'rgba(90,216,255,0.12)'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
    const sg = ctx.createRadialGradient(cx, cy, tb, cx, cy, rr);
    sg.addColorStop(0, 'rgba(90,216,255,0.42)');
    sg.addColorStop(1, 'rgba(90,216,255,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rr, a - 0.55, a); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(160,235,255,0.75)'; ctx.lineWidth = 1.2 * S;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); ctx.stroke();
  }

  // Beacon mast on the tower roof.
  const mastTop = cy - tb - H * 0.075;
  ctx.strokeStyle = on ? '#98a4ae' : '#3a4650'; ctx.lineWidth = 1.5 * S;
  ctx.beginPath(); ctx.moveTo(cx, cy - tb); ctx.lineTo(cx, mastTop); ctx.stroke();
  ctx.strokeStyle = on ? 'rgba(152,164,174,0.7)' : '#333d45'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.moveTo(cx - 3 * S, cy - tb); ctx.lineTo(cx, mastTop + 3 * S);
  ctx.moveTo(cx + 3 * S, cy - tb); ctx.lineTo(cx, mastTop + 3 * S); ctx.stroke();
  const beaconOn = on && Math.sin(t * 4) > 0;
  ctx.fillStyle = beaconOn ? '#ff5a4a' : (on ? '#5a2018' : '#2a1a1a');
  ctx.beginPath(); ctx.arc(cx, mastTop, 2.4 * S, 0, Math.PI * 2); ctx.fill();
  if (beaconOn) {
    ctx.globalAlpha = 0.28; ctx.fillStyle = '#ff5a4a';
    ctx.beginPath(); ctx.arc(cx, mastTop, 7 * S, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ── Deck edge lighting ──────────────────────────────────────────
  if (on) {
    const n = 22;
    const per = 2 * dw + 2 * dh;
    for (let i = 0; i < n; i++) {
      const f = i / n;
      let q = f * per, lx, ly;
      if (q < dw)                { lx = dx + q;                 ly = dy; }
      else if (q < dw + dh)      { lx = dx + dw;                ly = dy + (q - dw); }
      else if (q < 2 * dw + dh)  { lx = dx + dw - (q - dw - dh); ly = dy + dh; }
      else                       { lx = dx;                     ly = dy + dh - (q - 2 * dw - dh); }
      const lit = ((t * 0.45 + f) % 1) < 0.20;
      ctx.fillStyle = lit ? accent : 'rgba(90,216,255,0.16)';
      ctx.beginPath(); ctx.arc(lx, ly, 1.4 * S, 0, Math.PI * 2); ctx.fill();
      if (lit) {
        ctx.globalAlpha = 0.3;
        ctx.beginPath(); ctx.arc(lx, ly, 4 * S, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  // ── Windsock ────────────────────────────────────────────────────
  // Limp in clear air, streaming flat in a storm — which is exactly when
  // the fleet is slowed, so the sprite says WHY the drones are crawling.
  const sx = px + W * 0.945, sy = py + H * 0.055;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(sx + 2 * S, sy + H * 0.115, 3 * S, 1.5 * S, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = on ? '#98a4ae' : '#3a4650'; ctx.lineWidth = 1.5 * S;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + H * 0.11); ctx.stroke();
  const stream = stormy ? 1 : 0.22;
  const sockL  = W * (stormy ? 0.10 : 0.05);
  const droop  = stormy ? 0.10 : 0.62;
  const wob    = stormy ? Math.sin(t * 9) * H * 0.013 : Math.sin(t * 1.5) * H * 0.004;
  ctx.save();
  ctx.translate(sx, sy + H * 0.014);
  for (let i = 0; i < 4; i++) {
    const f0 = i / 4, f1 = (i + 1) / 4;
    ctx.fillStyle = (i % 2 === 0)
      ? (stormy ? '#ff7a40' : '#8f5436')
      : (stormy ? '#ffe0c0' : '#867c72');
    ctx.beginPath();
    ctx.moveTo(-sockL * f0 * stream, sockL * f0 * droop + wob * f0);
    ctx.lineTo(-sockL * f1 * stream, sockL * f1 * droop + wob * f1);
    ctx.lineTo(-sockL * f1 * stream, sockL * f1 * droop + wob * f1 + sockL * (0.32 - 0.055 * i));
    ctx.lineTo(-sockL * f0 * stream, sockL * f0 * droop + wob * f0 + sockL * (0.32 - 0.055 * i));
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  _wfLamp(px + W * 0.12, py + H * 0.955, S, t, accent, on);
  _wfPlate('DRONE PORT', cx, py + H * 0.965, S, accent, on);
  ctx.restore();
}

// Coverage of the network this port belongs to, drawn while the port is
// selected or being placed so the player can see what "in range" actually
// means before committing. A port's drones work the whole network, so that
// is the area shown -- one outline around the union of its squares, not a
// square per port. The placement ghost is not in the registry, so its
// network is built from the real ports plus the ghost: the preview shows
// the network it would JOIN.
function renderDronePortRange(e) {
  if (typeof DroneSystem === 'undefined') return;
  const ports = DroneSystem.stations();
  const ghost = !ports.includes(e);
  if (!ghost) {
    const net = DroneSystem.networkOf(e);
    _drawDroneNetwork(ctx, net, 1 / Camera.zoom, 1);
    // Tag every port in the network with its roster number, so "Port #2" in
    // the fleet panel can be matched to a building. A lone port has no number.
    if (typeof DroneFleetPanel !== 'undefined') {
      for (const s of net.squares) {
        const n = DroneFleetPanel.number(s.port);
        if (n) _dronePortTag(s.port, `Drone Port #${n}`);
      }
    }
    return;
  }
  // Placing: every existing network faintly, so the player can see where
  // coverage already is, then the network this port would join or start,
  // bright and with a stronger tint -- the square is 220 tiles across, so at
  // city zoom its edges are usually off screen and the tint is what tells
  // the player they are standing inside it.
  const nets = DroneSystem.networksFor([...ports, e]);
  const mine = nets.find(n => n.squares.some(s => s.port === e));
  for (const n of DroneSystem.networks()) {
    if (mine && n.squares.every(s => mine.squares.some(m => m.port === s.port))) continue;
    _drawDroneNetwork(ctx, n, 1 / Camera.zoom, 1, 0, 0, 'dim');
  }
  if (!mine) return;
  _drawDroneNetwork(ctx, mine, 1 / Camera.zoom, 1, 0, 0, 'ghost');
  // The square is wider than the screen even fully zoomed out, so say what
  // the placement does in words above the ghost -- the edges often can't.
  const n = mine.squares.filter(s => s.port.type === T.DRONEPORT).length;
  _dronePortTag(e, mine.squares.length > 1 ? `Joins drone network · ${n} port${n === 1 ? '' : 's'}` : e.type === T.DRONECHARGER ? 'No Drone Port in reach' : 'New drone network');
}

// A boxed caption above a port, sized in screen pixels at any zoom.
function _dronePortTag(e, label) {
  const k = 1 / Camera.zoom;
  const lx = (e.col + (e.width || 9) / 2) * TILE, ly = e.row * TILE - 8 * k;
  ctx.save();
  ctx.font = `bold ${12 * k}px Inter, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  const lw = ctx.measureText(label).width + 12 * k;
  ctx.fillStyle = 'rgba(0,10,18,0.75)';
  ctx.fillRect(lx - lw / 2, ly - 18 * k, lw, 18 * k);
  ctx.strokeStyle = 'rgba(110,225,255,0.8)'; ctx.lineWidth = k;
  ctx.strokeRect(lx - lw / 2, ly - 18 * k, lw, 18 * k);
  ctx.fillStyle = '#aaf0ff';
  ctx.fillText(label, lx, ly - 3 * k);
  ctx.restore();
}

// Shared by the city view and the world map. `k` converts screen pixels to
// the context's units (so lines read the same at every zoom) and `m` maps
// world pixels to them.
// `style`: undefined = normal, 'dim' = an existing network shown for
// context while placing, 'ghost' = the network a port being placed would
// join (stronger tint so it reads with its edges off screen).
function _drawDroneNetwork(g, net, k, m, ox, oy, style) {
  ox = ox || 0; oy = oy || 0;
  const dim = style === 'dim', ghost = style === 'ghost';
  g.save();
  // Tint: one path holding every square, filled once, so overlaps read as
  // one area instead of stacking darker.
  g.beginPath();
  for (const s of net.squares) g.rect(ox + s.l * m, oy + s.t * m, (s.r - s.l) * m, (s.b - s.t) * m);
  g.fillStyle = dim ? 'rgba(90,216,255,0.035)' : ghost ? 'rgba(90,216,255,0.11)' : 'rgba(90,216,255,0.06)';
  g.fill();
  // Outer boundary only.
  g.beginPath();
  for (const [x1, y1, x2, y2] of DroneSystem.outline(net)) {
    g.moveTo(ox + x1 * m, oy + y1 * m); g.lineTo(ox + x2 * m, oy + y2 * m);
  }
  // Dark backing under the dashes: cyan alone vanishes over pale ground,
  // water and lit buildings.
  g.lineCap = 'square';
  g.strokeStyle = dim ? 'rgba(0,12,20,0.30)' : 'rgba(0,12,20,0.55)';
  g.lineWidth = (ghost ? 7 : 6) * k;
  g.stroke();
  g.setLineDash(dim ? [6 * k, 10 * k] : [14 * k, 9 * k]);
  g.strokeStyle = dim ? 'rgba(110,225,255,0.45)' : ghost ? 'rgba(170,240,255,1)' : 'rgba(110,225,255,0.95)';
  g.lineWidth = (dim ? 2 : ghost ? 3.5 : 3) * k;
  g.stroke();
  g.setLineDash([]);
  g.restore();
}

// Every drone in the air, across every port. One call per frame from the
// overlay pass — drones fly ABOVE the entity layer, so they are drawn after
// it rather than dispatched per tile like a building.
function renderDroneFleets(t) {
  if (typeof DroneSystem === 'undefined') return;
  const S = Math.max(0.55, Math.min(1.4, Camera.zoom));

  // ── World transform ─────────────────────────────────────────────
  // This pass runs AFTER the darkness and sun-glow overlays, and those draw
  // in screen space (fillRect(0, 0, W, H)), so the context arrives here with
  // no camera transform on it. Drones are stored in world pixels, so without
  // this every drone was being drawn at its world coordinate interpreted as
  // a screen coordinate -- a port 50 tiles across the map put its fleet at
  // screen x 2000, permanently off the edge of the viewport. The fleet was
  // simulating, hauling and repairing correctly the whole time; it was just
  // never on screen.
  //
  // The tile loop draws entities with screen = (world - Camera.xy) * zoom;
  // this reproduces exactly that, so a drone lines up with the pad it is
  // sitting on. Drawing inside the transform also makes drawDrone's
  // `lineWidth = 1 / Camera.zoom` tether do what it always meant to.
  ctx.save();
  ctx.translate(-Camera.x * Camera.zoom, -Camera.y * Camera.zoom);
  ctx.scale(Camera.zoom, Camera.zoom);

  // Only drones that can reach the screen. Every one on the map used to be
  // drawn wherever the camera was (~35us each). An airframe, its shadow and
  // its trail stay well inside M world px of its centre; a tethered drone
  // also keeps the tether's far end in the test.
  const M = 160;
  const _tl = Camera.screenToWorld(0, 0), _br = Camera.screenToWorld(window.innerWidth, window.innerHeight);
  const vx0 = _tl.x - M, vy0 = _tl.y - M, vx1 = _br.x + M, vy1 = _br.y + M;

  for (const port of EntityRegistry.getByType(T.DRONEPORT)) {
    if (!port.powered && !DroneSystem.fleet(port).some(DroneSystem.isOut)) continue;
    for (const d of DroneSystem.fleet(port)) {
      let x0 = d.x, x1 = d.x, y0 = d.y, y1 = d.y;
      if (d.state === 'working' && d.job && d.job.target) {
        const tg = d.job.target;
        const tx = (tg.col + (tg.width || 1) / 2) * TILE, ty = (tg.row + (tg.height || 1) / 2) * TILE;
        if (tx < x0) x0 = tx; else if (tx > x1) x1 = tx;
        if (ty < y0) y0 = ty; else if (ty > y1) y1 = ty;
      }
      if (x1 < vx0 || x0 > vx1 || y1 < vy0 || y0 > vy1) continue;
      // Parked drones are drawn too, by the same function: at alt 0 they sit
      // tight on their pads. One airframe drawn one way, so the aircraft on
      // the deck is visibly the same machine as the one in the air instead
      // of a separate decal that has to be kept in sync.
      drawDrone(d, t, S);
    }
  }

  ctx.restore();
}

// Touchdown pad radius as a fraction of the port's short side. Shared by the
// deck (which paints the pads) and the airframe (which is sized to sit in
// one), so a drone always looks like it fits its berth.
const PAD_R_FRACTION = 0.062;

function padRadiusPx() {
  const dd = EntityDefs[T.DRONEPORT];
  return Math.min(dd.width || 9, dd.height || 9) * TILE * PAD_R_FRACTION;
}

// A drone's job colour, shared by the airframe accents and its trail:
// amber repair, ice-blue line service, green waste (gold when shielded),
// violet cargo, cyan when idle. Always #rrggbb so alpha can be appended.
function droneAccent(d) {
  const j = d.job;
  if (!j) return '#5ad8ff';
  return j.kind === 'repair' ? '#ffc24a' : j.kind === 'wire' ? '#8fdcff'
       : j.kind === 'waste' ? (j.hot ? '#ffe04a' : '#6ff0a8')
       : j.kind === 'cargo' ? '#c890ff' : j.kind === 'core' ? '#9fd8ff' : '#5ad8ff';
}

function drawDrone(d, t, S) {
  // Altitude drives everything: how big the airframe reads, how far its
  // shadow is thrown, and how hard the rotors are turning. A drone on the
  // deck is a tight object sitting on its own shadow; at cruise it is full
  // size with the shadow well below it. Saves written before launch and
  // recovery existed carry no `alt`, so those default to cruising.
  const alt  = d.alt  === undefined ? 1 : d.alt;
  const spin = d.spin === undefined ? 1 : d.spin;
  const bob  = Math.sin(d.bob) * 1.6 * alt;     // no bobbing while on the deck
  // On (or settling onto) a station pad, the drone stands on the rendered
  // pad's deck (0.43 m up): lift it by that height in the tilted view so it
  // sits in the middle of its berth, fading out as it climbs.
  const onPad = d.state === 'idle' || d.state === 'launch' || d.state === 'land' || !!d._chargingAt;
  const lift = onPad && typeof _CW_TAN !== 'undefined' && DroneArt.frame() ? 0.43 * _CW_TAN * 20 * (TILE / 40) * (1 - Math.min(1, alt)) : 0;
  const x = d.x, y = d.y + bob - lift;

  // Body half-length, derived so the airframe's outer span matches a
  // touchdown pad: a drone should look like it FITS its berth. Computed off
  // the same PAD_R_FRACTION the deck is drawn with, so the two cannot drift
  // apart if the port's footprint ever changes again.
  const r = (padRadiusPx() / 1.85) * (0.70 + 0.30 * alt);

  ctx.save();
  ctx.translate(x, y);

  // ── Shadow ───────────────────────────────────────────────────────
  // Tucks under the airframe and darkens as it settles; thrown further and
  // softer as it climbs. This is what actually sells the altitude.
  const lean = d.lean || 0;      // + = accelerating (nose down), - = braking
  const roll = d.roll || 0;      // + = banking one way through a turn
  // The shadow slides opposite the tilt: an airframe leaning into a move
  // is no longer directly over its own shadow, and that offset is most of
  // what makes the lean read from directly above.
  const SIL = DroneArt.silhouette();
  if (SIL) {
    // The airframe's own shape thrown on the ground (or the pad's deck):
    // crisp and dark, just down-right of it, when it sits in its berth;
    // further off, a size smaller and fainter as it climbs. A soft contact
    // shade under a parked drone so it stands out against the pad.
    const sx = (0.18 * r + 14 * alt) - Math.cos(d.angle) * lean * r * 0.5 + Math.sin(d.angle) * roll * r * 0.4;
    const sy = (0.3 * r + 22 * alt) - bob - Math.sin(d.angle) * lean * r * 0.5 - Math.cos(d.angle) * roll * r * 0.4;
    if (alt < 0.5) {
      const ca = 0.5 * (1 - alt * 2), cg = ctx.createRadialGradient(sx * 0.5, sy * 0.5, 0, sx * 0.5, sy * 0.5, r * 1.9);
      cg.addColorStop(0, `rgba(0,0,0,${ca.toFixed(3)})`); cg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(sx * 0.5, sy * 0.5, r * 1.9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save();
    ctx.translate(sx, sy); ctx.rotate(d.angle + Math.PI / 2);
    const k = 1 - 0.12 * alt;
    ctx.globalAlpha = 0.62 - 0.34 * alt;
    ctx.drawImage(SIL, -1.95 * r * k, -1.95 * r * k, 3.9 * r * k, 3.9 * r * k);
    ctx.restore();
    ctx.globalAlpha = 1;
  } else {
  ctx.globalAlpha = 0.16 + 0.22 * (1 - alt);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(2.5 * alt - Math.cos(d.angle) * lean * r * 0.5 + Math.sin(d.angle) * roll * r * 0.4,
              (13 * alt) - bob - Math.sin(d.angle) * lean * r * 0.5 - Math.cos(d.angle) * roll * r * 0.4,
              r * (1.15 - 0.2 * alt), r * (0.55 - 0.12 * alt), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  }

  // ── Thruster trail ───────────────────────────────────────────────
  // A fading twin streak behind a drone at speed, in the job colour. Length
  // tracks the eased speed, so it grows out of a launch and shrinks into an
  // arrival rather than popping on and off. World-space: drawn before the
  // airframe rotation.
  const spd = d.v || 0;
  if (alt > 0.3 && spd > 120) {
    const k = Math.min(1, (spd - 120) / 500);
    const tl = r * (1.5 + 4.5 * k);
    const bx = -Math.cos(d.angle), by = -Math.sin(d.angle);
    const tAcc = droneAccent(d);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const tg = ctx.createLinearGradient(bx * r * 0.6, by * r * 0.6, bx * tl, by * tl);
    tg.addColorStop(0, tAcc + 'aa'); tg.addColorStop(1, tAcc + '00');
    ctx.strokeStyle = tg; ctx.lineCap = 'round';
    ctx.lineWidth = r * 0.14 * (0.6 + 0.4 * k);
    for (const off of [-1, 1]) {
      const ox = -by * off * r * 0.13, oy = bx * off * r * 0.13;
      ctx.beginPath(); ctx.moveTo(bx * r * 0.7 + ox, by * r * 0.7 + oy);
      ctx.lineTo(bx * tl + ox, by * tl + oy); ctx.stroke();
    }
    ctx.restore();
  }

  ctx.rotate(d.angle + Math.PI / 2);
  // Seen from above, a tilt foreshortens the airframe along the axis it is
  // tilting about. Local -y is forward, so pitch squashes y and bank
  // squashes x. Small numbers: enough to feel the weight, not enough to
  // look like the model is being crushed.
  ctx.scale(1 - Math.abs(roll) * 0.16, 1 - Math.abs(lean) * 0.16);

  const arm = r * 1.22;
  const rot = r * 0.52;                     // rotor disc radius (inside the duct)
  const live = spin > 0.02 || alt > 0.02;
  // Job accent: one colour carried by the arm edges, duct rims, visor, hull
  // chevron, underglow and trail, so what a drone is doing reads at a glance.
  const ACC = droneAccent(d);

  // ── Underglow ─────────────────────────────────────────────────────
  if (alt > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const ug = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.1);
    ug.addColorStop(0, ACC + '55'); ug.addColorStop(1, ACC + '00');
    ctx.globalAlpha = 0.55 * alt;
    ctx.fillStyle = ug;
    ctx.beginPath(); ctx.arc(0, 0, r * 2.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // The rendered airframe (scripts/render_drones.py, drone_frame.png):
  // arms, duct shrouds and hull, nose north, duct interiors open. It goes
  // over the live duct floors and rotors and under the live lights.
  const FRAME = DroneArt.frame();

  // ── Arms: tapered carbon spars with a lit edge ───────────────────
  if (!FRAME) for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
    const w0 = r * 0.20, w1 = r * 0.09;
    ctx.fillStyle = '#1b222b';
    ctx.beginPath();
    ctx.moveTo(nx * w0, ny * w0);
    ctx.lineTo(ca * arm + nx * w1, sa * arm + ny * w1);
    ctx.lineTo(ca * arm - nx * w1, sa * arm - ny * w1);
    ctx.lineTo(-nx * w0, -ny * w0);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = live ? ACC : '#3a4a5a';
    ctx.globalAlpha = live ? 0.75 : 0.5;
    ctx.lineWidth = r * 0.045;
    ctx.beginPath();
    ctx.moveTo(nx * w0 * 0.8, ny * w0 * 0.8);
    ctx.lineTo(ca * arm * 0.8 + nx * w1, sa * arm * 0.8 + ny * w1);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ── Ducted fans ──────────────────────────────────────────────────
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const ax = Math.cos(a) * arm, ay = Math.sin(a) * arm;
    const duct = rot * 1.14;
    const dirn = i % 2 ? -1 : 1;            // props counter-rotate in pairs

    ctx.fillStyle = FRAME ? 'rgba(13,18,24,0.42)' : '#0d1218';   // duct floor (see-through past a rendered prop)
    ctx.beginPath(); ctx.arc(ax, ay, duct, 0, Math.PI * 2); ctx.fill();
    const PROP = FRAME && DroneArt.prop();
    if (PROP) {
      // the rendered three-blade prop: one at rest or spooling, a smear of
      // fading copies once it is up to speed, over a soft swirl
      const ba = spin > 0.02 ? t * (5 + spin * 45) * dirn + i * 1.3 : a, pw = 1.2 * r;
      if (spin > 0.55) {
        const sw = ctx.createRadialGradient(ax, ay, rot * 0.15, ax, ay, rot);
        sw.addColorStop(0, 'rgba(200,235,255,0.04)'); sw.addColorStop(0.7, `rgba(200,235,255,${0.14 * spin})`); sw.addColorStop(1, 'rgba(200,235,255,0.02)');
        ctx.fillStyle = sw; ctx.beginPath(); ctx.arc(ax, ay, rot, 0, Math.PI * 2); ctx.fill();
      }
      const copies = spin > 0.55 ? 4 : 1;
      for (let c2 = 0; c2 < copies; c2++) {
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(ba - c2 * 0.22 * dirn);
        ctx.globalAlpha = copies > 1 ? 0.32 * (1 - c2 / copies) : 1;
        ctx.drawImage(PROP, -pw / 2, -pw / 2, pw, pw); ctx.restore();
      }
      ctx.globalAlpha = 1;
      continue;
    }

    if (spin > 0.55) {
      // up to speed: swirling blur inside the shroud
      const sw = ctx.createRadialGradient(ax, ay, rot * 0.15, ax, ay, rot);
      sw.addColorStop(0, 'rgba(200,235,255,0.05)');
      sw.addColorStop(0.7, `rgba(200,235,255,${0.20 * spin})`);
      sw.addColorStop(1, 'rgba(200,235,255,0.02)');
      ctx.fillStyle = sw;
      ctx.beginPath(); ctx.arc(ax, ay, rot, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(230,246,255,${0.55 * spin})`; ctx.lineWidth = r * 0.06;
      const ba = t * 30 * dirn + i * 1.7;
      for (let b = 0; b < 3; b++) {
        const bb = ba + b * Math.PI * 2 / 3;
        ctx.beginPath(); ctx.arc(ax, ay, rot * 0.78, bb, bb + 0.7); ctx.stroke();
      }
    } else if (spin > 0.02) {
      // spooling: three distinct blades winding up or down
      ctx.strokeStyle = 'rgba(200,230,250,0.9)'; ctx.lineWidth = r * 0.09;
      const ba = t * (5 + spin * 45) * dirn + i * 1.3;
      for (let b = 0; b < 3; b++) {
        const bb = ba + b * Math.PI * 2 / 3;
        ctx.beginPath(); ctx.moveTo(ax, ay);
        ctx.lineTo(ax + Math.cos(bb) * rot * 0.92, ay + Math.sin(bb) * rot * 0.92); ctx.stroke();
      }
    } else {
      // stopped: blades at rest
      ctx.strokeStyle = 'rgba(160,190,210,0.55)'; ctx.lineWidth = r * 0.08;
      for (let b = 0; b < 3; b++) {
        const bb = a + b * Math.PI * 2 / 3;
        ctx.beginPath(); ctx.moveTo(ax, ay);
        ctx.lineTo(ax + Math.cos(bb) * rot * 0.9, ay + Math.sin(bb) * rot * 0.9); ctx.stroke();
      }
    }
    ctx.fillStyle = '#2a3440';               // hub
    ctx.beginPath(); ctx.arc(ax, ay, r * 0.11, 0, Math.PI * 2); ctx.fill();
    if (FRAME) continue;                     // the rendered shroud, rim glow and nav lights go on after the frame

    // shroud: dark ring, glowing inner rim that brightens with rpm
    ctx.strokeStyle = '#26303b'; ctx.lineWidth = r * 0.14;
    ctx.beginPath(); ctx.arc(ax, ay, duct, 0, Math.PI * 2); ctx.stroke();
    if (live) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = ACC; ctx.globalAlpha = 0.35 + 0.5 * spin;
      ctx.lineWidth = r * 0.05;
      ctx.beginPath(); ctx.arc(ax, ay, duct - r * 0.07, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.18 * spin; ctx.lineWidth = r * 0.22;
      ctx.beginPath(); ctx.arc(ax, ay, duct, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // nav lights on the forward ducts: red to port, green to starboard
    if (ay < 0 && live) {
      const lx = ax + Math.cos(a) * duct * 0.9, ly = ay + Math.sin(a) * duct * 0.9;
      ctx.fillStyle = ax < 0 ? '#ff4a3a' : '#3cf07a';
      ctx.beginPath(); ctx.arc(lx, ly, r * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.arc(lx, ly, r * 0.17, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  if (FRAME) {
    ctx.drawImage(FRAME, -1.95 * r, -1.95 * r, 3.9 * r, 3.9 * r);
    const ACCIM = DroneArt.accent(live ? ACC : '#5a6a78');      // the job's chevron, rendered and tinted
    if (ACCIM) ctx.drawImage(ACCIM, -1.95 * r, -1.95 * r, 3.9 * r, 3.9 * r);
    // the shrouds' rims glowing with rpm, nav lights on the forward ducts
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4, ax = Math.cos(a) * arm, ay = Math.sin(a) * arm, duct = rot * 1.14;
      if (live) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = ACC; ctx.globalAlpha = 0.08 + 0.18 * spin; ctx.lineWidth = r * 0.035;
        ctx.beginPath(); ctx.arc(ax, ay, duct + r * 0.01, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      if (ay < 0 && live) {
        const lx = ax + Math.cos(a) * duct * 1.08, ly = ay + Math.sin(a) * duct * 1.08;
        ctx.fillStyle = ax < 0 ? '#ff4a3a' : '#3cf07a';
        ctx.beginPath(); ctx.arc(lx, ly, r * 0.08, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45;
        ctx.beginPath(); ctx.arc(lx, ly, r * 0.17, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
  }

  // ── Hull: faceted, pointed nose (local -y is forward) ────────────
  // Drawn a size up from the frame so it reads as the body, not a hub.
  ctx.save();
  ctx.scale(1.2, 1.2);
  if (!FRAME) {
  const hull = [
    [0, -r * 1.02], [r * 0.30, -r * 0.62], [r * 0.46, -r * 0.05],
    [r * 0.38, r * 0.55], [r * 0.16, r * 0.78], [-r * 0.16, r * 0.78],
    [-r * 0.38, r * 0.55], [-r * 0.46, -r * 0.05], [-r * 0.30, -r * 0.62],
  ];
  ctx.beginPath(); ctx.moveTo(hull[0][0], hull[0][1]);
  for (let k = 1; k < hull.length; k++) ctx.lineTo(hull[k][0], hull[k][1]);
  ctx.closePath();
  const hg = ctx.createLinearGradient(-r * 0.5, -r, r * 0.5, r * 0.8);
  hg.addColorStop(0, '#5a6878'); hg.addColorStop(0.45, '#2a333e'); hg.addColorStop(1, '#141a21');
  ctx.fillStyle = hg; ctx.fill();
  ctx.strokeStyle = '#0a0e12'; ctx.lineWidth = r * 0.06; ctx.stroke();

  // facet lines: centre ridge plus two shoulder creases
  ctx.strokeStyle = 'rgba(200,225,245,0.28)'; ctx.lineWidth = r * 0.035;
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.0); ctx.lineTo(0, r * 0.76);
  ctx.moveTo(r * 0.30, -r * 0.62); ctx.lineTo(r * 0.14, r * 0.1); ctx.lineTo(r * 0.16, r * 0.78);
  ctx.moveTo(-r * 0.30, -r * 0.62); ctx.lineTo(-r * 0.14, r * 0.1); ctx.lineTo(-r * 0.16, r * 0.78);
  ctx.stroke();
  // lit left flank so the hull reads as a solid
  ctx.fillStyle = 'rgba(210,230,250,0.10)';
  ctx.beginPath(); ctx.moveTo(0, -r * 1.02); ctx.lineTo(-r * 0.30, -r * 0.62);
  ctx.lineTo(-r * 0.46, -r * 0.05); ctx.lineTo(-r * 0.14, r * 0.1); ctx.closePath(); ctx.fill();
  }

  // accent chevron across the back (the rendered airframe has its own)
  if (!FRAME) {
  ctx.fillStyle = live ? ACC : '#3a4a5a';
  ctx.globalAlpha = live ? 0.9 : 0.6;
  ctx.beginPath();
  ctx.moveTo(-r * 0.40, r * 0.30); ctx.lineTo(0, r * 0.16); ctx.lineTo(r * 0.40, r * 0.30);
  ctx.lineTo(r * 0.38, r * 0.42); ctx.lineTo(0, r * 0.28); ctx.lineTo(-r * 0.38, r * 0.42);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  }

  // visor: glowing wraparound sensor strip across the nose (over the rendered
  // canopy only its glow)
  if (!FRAME) {
  const vg = ctx.createLinearGradient(0, -r * 0.78, 0, -r * 0.40);
  vg.addColorStop(0, live ? '#e8fbff' : '#4a5a66');
  vg.addColorStop(1, live ? ACC : '#26303a');
  ctx.fillStyle = vg;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.80); ctx.lineTo(r * 0.24, -r * 0.52); ctx.lineTo(r * 0.18, -r * 0.40);
  ctx.lineTo(0, -r * 0.50); ctx.lineTo(-r * 0.18, -r * 0.40); ctx.lineTo(-r * 0.24, -r * 0.52);
  ctx.closePath(); ctx.fill();
  }
  if (live) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (FRAME) ctx.globalAlpha = 0.6;
    const vgl = ctx.createRadialGradient(0, -r * 0.58, 0, 0, -r * 0.58, r * 0.55);
    vgl.addColorStop(0, ACC + '88'); vgl.addColorStop(1, ACC + '00');
    ctx.fillStyle = vgl;
    ctx.beginPath(); ctx.arc(0, -r * 0.58, r * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // twin thruster vents at the tail, glowing with speed
  const thr = Math.min(1, (d.v || 0) / 400);
  for (const sx of [-1, 1]) {
    if (!FRAME) { ctx.fillStyle = '#0a0e12'; ctx.fillRect(sx * r * 0.13 - r * 0.06, r * 0.66, r * 0.12, r * 0.12); }
    if (live) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      if (FRAME) {                                // a soft glow in the rendered vents
        const vx = sx * r * 0.13, vy = r * 0.72, gr = ctx.createRadialGradient(vx, vy, 0, vx, vy, r * 0.16);
        gr.addColorStop(0, ACC); gr.addColorStop(1, ACC + '00'); ctx.globalAlpha = 0.25 + 0.55 * thr;
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(vx, vy, r * 0.16, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = ACC; ctx.globalAlpha = 0.4 + 0.6 * thr;
        ctx.fillRect(sx * r * 0.13 - r * 0.04, r * 0.68, r * 0.08, r * 0.08);
      }
      ctx.restore();
    }
  }

  // status core: pulsing gem mid-hull, colour by flight state
  const col = d.state === 'working' ? '#ffc24a'
            : d.state === 'home' || d.state === 'land' ? '#5fe0a8'
            : d.state === 'launch' ? '#ffc24a' : '#5ad8ff';
  const pulse = 0.75 + 0.25 * Math.sin(t * 5 + (d.i || 0));
  ctx.globalAlpha = live ? 1 : 0.35;
  ctx.fillStyle = col;
  if (FRAME) { ctx.globalAlpha = live ? 0.9 : 0.25; ctx.beginPath(); ctx.arc(0, r * 0.04, r * 0.05, 0, Math.PI * 2); ctx.fill(); }   // a small lens in the GPS puck
  else { ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 0.12, 0, Math.PI * 2); ctx.fill(); }
  if (live) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 * pulse;
    ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 0.34, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // White anti-collision strobe at the tail, double-blink, offset per drone
  // so a whole fleet does not flash in unison.
  const ph = (t * 1.1 + (d.i || 0) * 0.13) % 1;
  if (alt > 0.15 && (ph < 0.06 || (ph > 0.12 && ph < 0.18))) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, r * 0.86, r * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(0, r * 0.86, r * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Low battery warning.
  if (d.battery < 0.3 && Math.sin(t * 8) > 0) {
    ctx.fillStyle = '#ff6040';
    ctx.beginPath(); ctx.arc(-r * 0.30, r * 0.18, r * 0.11, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // ── Slung load ───────────────────────────────────────────────────
  // Only on the delivery leg of a waste run, which is the only time a drone
  // is carrying anything. A hot load is a yellow-banded cask, an ordinary
  // one a plain grey skip, so the two streams read apart in the air.
  if (d.job && d.job.kind === 'waste' && d.job.leg === 'deliver') {
    const hot = !!d.job.hot;
    ctx.save();
    ctx.rotate(-(d.angle + Math.PI / 2));     // the load hangs level
    ctx.strokeStyle = '#2f3c49'; ctx.lineWidth = r * 0.09;
    ctx.beginPath(); ctx.moveTo(-r * 0.3, r * 0.5); ctx.lineTo(0, r * 1.0);
    ctx.moveTo(r * 0.3, r * 0.5); ctx.lineTo(0, r * 1.0); ctx.stroke();
    const bw = r * (hot ? 0.78 : 1.0), bh = r * (hot ? 0.78 : 0.62);
    ctx.fillStyle = hot ? '#2a2410' : '#39434d';
    ctx.fillRect(-bw / 2, r * 1.0, bw, bh);
    ctx.strokeStyle = hot ? '#ffd24a' : '#6b7885'; ctx.lineWidth = r * 0.08;
    ctx.strokeRect(-bw / 2, r * 1.0, bw, bh);
    if (hot) {
      ctx.fillStyle = '#ffd24a';
      ctx.fillRect(-bw / 2, r * 1.0 + bh * 0.40, bw, bh * 0.22);
    }
    ctx.restore();
  }
  // Cargo: a crate for solids, a drum for liquids, a pressure bottle for
  // gases -- three silhouettes, so the phase reads without the colour.
  else if (d.job && d.job.kind === 'cargo' && d.job.leg === 'deliver') {
    const ph = d.job.phase;
    const col = ph === 'gas' ? '#80d8ff' : ph === 'liquid' ? '#e0a040' : '#c89060';
    ctx.save();
    ctx.rotate(-(d.angle + Math.PI / 2));
    ctx.strokeStyle = '#2f3c49'; ctx.lineWidth = r * 0.09;
    ctx.beginPath(); ctx.moveTo(-r * 0.3, r * 0.5); ctx.lineTo(0, r * 1.0);
    ctx.moveTo(r * 0.3, r * 0.5); ctx.lineTo(0, r * 1.0); ctx.stroke();
    ctx.fillStyle = '#2a323a'; ctx.strokeStyle = col; ctx.lineWidth = r * 0.08;
    if (ph === 'solid') {
      const w = r * 0.9, h = r * 0.62;
      ctx.fillRect(-w / 2, r, w, h); ctx.strokeRect(-w / 2, r, w, h);
      ctx.beginPath(); ctx.moveTo(-w / 2, r); ctx.lineTo(w / 2, r + h); ctx.stroke();
    } else if (ph === 'liquid') {
      const w = r * 0.62, h = r * 0.8;
      ctx.fillRect(-w / 2, r, w, h); ctx.strokeRect(-w / 2, r, w, h);
      ctx.fillStyle = col; ctx.fillRect(-w / 2, r + h * 0.3, w, h * 0.14);
    } else {
      const rr = r * 0.34;
      ctx.beginPath(); ctx.arc(0, r + rr, rr, Math.PI, 0);
      ctx.lineTo(rr, r + rr * 2.6); ctx.arc(0, r + rr * 2.6, rr, 0, Math.PI);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  // Field Core: a steel cartridge in a shielded cradle. A charged core's
  // bore glows cyan on the way out; a spent one rides home amber and dim.
  else if (d.job && d.job.kind === 'core' && d.job.leg !== 'pickup') {
    const charged = d.job.leg === 'deliver';
    const glow = charged ? 0.65 + 0.35 * Math.sin(t * 5) : 0.5;
    ctx.save();
    ctx.rotate(-(d.angle + Math.PI / 2));
    ctx.strokeStyle = '#2f3c49'; ctx.lineWidth = r * 0.09;
    ctx.beginPath(); ctx.moveTo(-r * 0.3, r * 0.5); ctx.lineTo(0, r * 1.0);
    ctx.moveTo(r * 0.3, r * 0.5); ctx.lineTo(0, r * 1.0); ctx.stroke();
    const w = r * 0.56, h = r * 0.96, y0 = r * 1.0;
    ctx.fillStyle = '#3a444e'; ctx.strokeStyle = '#8b9aa8'; ctx.lineWidth = r * 0.07;
    ctx.fillRect(-w / 2, y0, w, h); ctx.strokeRect(-w / 2, y0, w, h);
    ctx.fillStyle = '#5b6874';                       // end caps
    ctx.fillRect(-w / 2 - r * 0.06, y0, w + r * 0.12, h * 0.14);
    ctx.fillRect(-w / 2 - r * 0.06, y0 + h * 0.86, w + r * 0.12, h * 0.14);
    ctx.globalAlpha = glow;
    ctx.fillStyle = charged ? '#5ff0ff' : '#c08030';  // the bore
    ctx.fillRect(-w * 0.18, y0 + h * 0.2, w * 0.36, h * 0.6);
    ctx.restore();
  }

  ctx.restore();

  // A thin tether to the job while on station, so it is obvious WHICH
  // building a hovering drone is working on. Green while loading or
  // unloading waste, cyan for a line sweep, amber for a repair.
  if (d.state === 'working' && d.job && d.job.target) {
    const tg = d.job.target;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 6);
    ctx.strokeStyle = d.job.kind === 'wire'  ? '#9fd8ff'
                    : d.job.kind === 'waste' ? (d.job.hot ? '#ffd24a' : '#7fd8a0')
                    : d.job.kind === 'cargo' ? '#d0a0ff'
                    : d.job.kind === 'core'  ? '#5ff0ff'
                    : '#ffc24a';
    ctx.lineWidth = 1 / Camera.zoom;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(x, y + 4);
    ctx.lineTo((tg.col + (tg.width || 1) / 2) * TILE, (tg.row + (tg.height || 1) / 2) * TILE);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}
// ── Drone Charging Port (5×5) ───────────────────────────────────────────
// A relay, not a base: no fleet, no tower, no hangar. A round asphalt deck
// on a concrete apron, a charging mast at its centre, and five booms running
// out from it to five induction pads: copper coils under a painted ring.
// Drones crossing the network set down low over a pad to top up; the boom
// feeding that pad runs with light, its coil glows and a charge arc fills
// round the rim, so the deck shows who is charging and how far along they
// are. The mast's core burns brighter the more pads are in use. Laid out in
// fractions of the footprint, with the pads read from DroneSystem.
function renderDroneCharger(e, px, py, t) {
  if (DroneArt.ok(e, 'dchg', 5, 5)) return _dchgArt(e, px, py, t);   // rendered (end of this file)
  const def = EntityDefs[T.DRONECHARGER];
  const W = (e.width || def.width) * TILE, H = (e.height || def.height) * TILE;
  const on = e.powered, S = TILE / 40, TAU = Math.PI * 2;
  const accent = '#5ad8ff', CHG = '#7df0a4';
  const DS = typeof DroneSystem !== 'undefined' ? DroneSystem : null;
  const PADS = (DS && DS.CHARGER_PADS) || [[0.5, 0.18], [0.804, 0.401], [0.688, 0.759], [0.312, 0.759], [0.196, 0.401]];
  const occ = DS && DS.chargerPads ? DS.chargerPads(e) : PADS.map(() => null);
  const busy = occ.filter(d => d && d._chargingAt === e).length;
  const cx = px + W * 0.5, cy = py + H * 0.5, M = Math.min(W, H);
  const pr = M * 0.118;
  ctx.save();

  // ── Apron ──
  _wfShadow(px + 2, py + 2, W - 4, H - 4, S, 6 * S);
  const ag = ctx.createLinearGradient(px, py, px + W, py + H);
  ag.addColorStop(0, '#8e9288'); ag.addColorStop(0.5, '#74786e'); ag.addColorStop(1, '#5c6058');
  ctx.fillStyle = ag;
  ctx.beginPath(); ctx.roundRect(px + 2, py + 2, W - 4, H - 4, 6 * S); ctx.fill();
  ctx.strokeStyle = '#3a3e36'; ctx.lineWidth = 1.5 * S; ctx.stroke();
  _bldGrain(ctx, 'mottle', 0.5);
  // hazard chevrons in the four corners, outside the deck
  for (const [fx, fy, a] of [[0.085, 0.085, 0], [0.915, 0.085, Math.PI / 2], [0.915, 0.915, Math.PI], [0.085, 0.915, -Math.PI / 2]]) {
    ctx.save(); ctx.translate(px + W * fx, py + H * fy); ctx.rotate(a);
    ctx.strokeStyle = 'rgba(216,168,32,0.85)'; ctx.lineWidth = 2.4 * S; ctx.lineCap = 'butt';
    for (let q = 0; q < 2; q++) { ctx.beginPath(); ctx.moveTo(-M * 0.045 + q * 5 * S, M * 0.03 + q * 5 * S); ctx.lineTo(-M * 0.045 + q * 5 * S, -M * 0.045 + q * 5 * S); ctx.lineTo(M * 0.03 + q * 5 * S, -M * 0.045 + q * 5 * S); ctx.stroke(); }
    ctx.restore();
  }

  // ── Deck: a round asphalt slab with a painted edge ──
  const dr = M * 0.465;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(cx + 2 * S, cy + 3 * S, dr, 0, TAU); ctx.fill();
  const dg = ctx.createLinearGradient(cx - dr, cy - dr, cx + dr, cy + dr);
  dg.addColorStop(0, '#383c3e'); dg.addColorStop(0.55, '#2a2e30'); dg.addColorStop(1, '#1f2325');
  ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(cx, cy, dr, 0, TAU); ctx.fill();
  _bldGrain(ctx, 'grit');
  ctx.strokeStyle = 'rgba(232,236,240,0.32)'; ctx.lineWidth = 1.6 * S;
  ctx.beginPath(); ctx.arc(cx, cy, dr - 3 * S, 0, TAU); ctx.stroke();
  // a pentagon of painted lanes joining the pads
  ctx.strokeStyle = 'rgba(216,200,64,0.22)'; ctx.lineWidth = 1.6 * S; ctx.setLineDash([5 * S, 4 * S]);
  ctx.beginPath(); PADS.forEach((p, i) => { const x = px + W * p[0], y = py + H * p[1]; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke();
  ctx.setLineDash([]);

  // ── Booms: mast → pad, live while the pad is charging someone ──
  PADS.forEach((p, i) => {
    const mx = px + W * p[0], my = py + H * p[1], d = occ[i], live = on && d && d._chargingAt === e;
    const vx = mx - cx, vy = my - cy, len = Math.hypot(vx, vy), ux = vx / len, uy = vy / len;
    const x0 = cx + ux * M * 0.085, y0 = cy + uy * M * 0.085, x1 = mx - ux * pr * 0.95, y1 = my - uy * pr * 0.95;
    const seg = () => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 8 * S; ctx.save(); ctx.translate(2.5 * S, 3.5 * S); seg(); ctx.restore();
    ctx.strokeStyle = '#4a5058'; ctx.lineWidth = 8 * S; seg();
    ctx.strokeStyle = '#8c949c'; ctx.lineWidth = 5.5 * S; seg();
    ctx.strokeStyle = '#11161b'; ctx.lineWidth = 2.6 * S; seg();
    if (on) {
      ctx.strokeStyle = live ? CHG : 'rgba(90,216,255,0.35)'; ctx.lineWidth = 1.8 * S;
      if (live) { ctx.setLineDash([5 * S, 6 * S]); ctx.lineDashOffset = -t * 46 * S; }
      seg(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
  });

  // ── Pads ──
  PADS.forEach((p, i) => {
    const mx = px + W * p[0], my = py + H * p[1], d = occ[i];
    const live = on && d && d._chargingAt === e, inbound = on && d && !live;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(mx + 1.5 * S, my + 2.5 * S, pr * 1.06, 0, TAU); ctx.fill();
    const pg = ctx.createLinearGradient(mx - pr, my - pr, mx + pr, my + pr);
    pg.addColorStop(0, '#9aa29a'); pg.addColorStop(1, '#565c56');
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(mx, my, pr * 1.06, 0, TAU); _fillMetalG(ctx);          // raised steel rim
    ctx.fillStyle = '#15191b'; ctx.beginPath(); ctx.arc(mx, my, pr * 0.92, 0, TAU); _fillMetalG(ctx);
    // the induction coil: copper windings, shimmering while it is feeding a drone
    for (let q = 0; q < 3; q++) {
      ctx.strokeStyle = live ? `rgba(255,${170 + 40 * Math.sin(t * 9 - q * 1.4)},96,0.95)` : on ? 'rgba(196,122,66,0.85)' : 'rgba(96,70,50,0.8)';
      ctx.lineWidth = 1.5 * S;
      ctx.beginPath(); ctx.arc(mx, my, pr * (0.30 + q * 0.14), 0, TAU); ctx.stroke();
    }
    ctx.strokeStyle = d ? 'rgba(236,240,244,0.78)' : 'rgba(236,240,244,0.4)'; ctx.lineWidth = 1.8 * S;
    ctx.beginPath(); ctx.arc(mx, my, pr * 0.78, 0, TAU); ctx.stroke();
    // pad number, facing out
    ctx.fillStyle = 'rgba(236,240,244,0.5)'; ctx.font = `bold ${Math.max(5, 6 * S)}px Courier New`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), mx + (mx - cx) / Math.hypot(mx - cx, my - cy) * pr * 1.38, my + (my - cy) / Math.hypot(mx - cx, my - cy) * pr * 1.38);
    ctx.textBaseline = 'alphabetic';
    // three rim lights: green while charging, amber flashing for a drone on
    // its way in, cyan when the pad is free
    for (let q = 0; q < 3; q++) {
      const a = q * TAU / 3 + Math.atan2(my - cy, mx - cx) + Math.PI / 3;
      ctx.fillStyle = !on ? '#2a3230' : live ? CHG : inbound ? (Math.sin(t * 12) > 0 ? '#ffc24a' : '#5a4418') : 'rgba(90,216,255,0.8)';
      ctx.beginPath(); ctx.arc(mx + Math.cos(a) * pr * 1.0, my + Math.sin(a) * pr * 1.0, 1.5 * S, 0, TAU); ctx.fill();
    }
    if (live) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gg = ctx.createRadialGradient(mx, my, 0, mx, my, pr * 1.5);
      gg.addColorStop(0, 'rgba(125,240,164,0.38)'); gg.addColorStop(1, 'rgba(125,240,164,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(mx, my, pr * 1.5, 0, TAU); ctx.fill();
      // rings of charge rising off the coil into the airframe
      for (let q = 0; q < 2; q++) {
        const ph = (t * 1.3 + q * 0.5) % 1;
        ctx.globalAlpha = 0.5 * (1 - ph); ctx.strokeStyle = CHG; ctx.lineWidth = 1.4 * S;
        ctx.beginPath(); ctx.arc(mx, my, pr * (0.9 - ph * 0.65), 0, TAU); ctx.stroke();
      }
      ctx.restore();
      // the battery, as an arc round the rim
      ctx.strokeStyle = 'rgba(8,12,14,0.8)'; ctx.lineWidth = 3.4 * S;
      ctx.beginPath(); ctx.arc(mx, my, pr * 1.2, 0, TAU); ctx.stroke();
      ctx.strokeStyle = d.battery < 0.35 ? '#ff8040' : CHG; ctx.lineWidth = 2.2 * S; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(mx, my, pr * 1.2, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.02, d.battery)); ctx.stroke();
      ctx.lineCap = 'butt';
    }
  });

  // ── Charging mast ──
  // A hexagonal plinth, a ring of capacitor cells turning on it, and the
  // core: brighter and faster with every pad in use.
  const load = on ? busy / PADS.length : 0;
  const hex = (r, rot) => { ctx.beginPath(); for (let q = 0; q < 6; q++) { const a = q * TAU / 6 + rot; q ? ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } ctx.closePath(); };
  const mr = M * 0.105;
  ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.save(); ctx.translate(4 * S, 6 * S); hex(mr, 0); ctx.fill(); ctx.restore();
  const mg = ctx.createLinearGradient(cx - mr, cy - mr, cx + mr, cy + mr);
  mg.addColorStop(0, '#aab0a8'); mg.addColorStop(0.55, '#70766e'); mg.addColorStop(1, '#434943');
  ctx.fillStyle = mg; ctx.strokeStyle = '#23271f'; ctx.lineWidth = 1.5 * S; hex(mr, 0); _fillMetalG(ctx); ctx.stroke();
  ctx.fillStyle = '#161b20'; ctx.strokeStyle = '#0c1014'; ctx.lineWidth = S; hex(mr * 0.74, Math.PI / 6); _fillMetalG(ctx); ctx.stroke();
  const spin = on ? t * (0.5 + 2.2 * load) : 0.3;
  for (let q = 0; q < 6; q++) {
    const a = q * TAU / 6 + spin, lit = on && (busy > 0 ? q % 6 < Math.max(1, busy) + 1 : q % 3 === 0);
    ctx.fillStyle = !on ? '#2a3238' : lit ? (busy ? CHG : accent) : 'rgba(90,216,255,0.22)';
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * mr * 0.52, cy + Math.sin(a) * mr * 0.52, 1.9 * S, 0, TAU); ctx.fill();
  }
  const cr = mr * 0.3;
  const cg = ctx.createRadialGradient(cx - cr * 0.3, cy - cr * 0.3, 0, cx, cy, cr);
  cg.addColorStop(0, on ? '#ffffff' : '#39424a'); cg.addColorStop(0.5, on ? (busy ? CHG : accent) : '#2a3238'); cg.addColorStop(1, on ? '#123040' : '#1d2429');
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.fill();
  if (on) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.5 + 0.5 * Math.sin(t * (2 + 5 * load));
    const hg = ctx.createRadialGradient(cx, cy, 0, cx, cy, mr * (1.5 + 0.9 * load));
    hg.addColorStop(0, busy ? `rgba(125,240,164,${(0.3 + 0.3 * pulse).toFixed(3)})` : `rgba(90,216,255,${(0.16 + 0.12 * pulse).toFixed(3)})`); hg.addColorStop(1, 'rgba(90,216,255,0)');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(cx, cy, mr * (1.5 + 0.9 * load), 0, TAU); ctx.fill();
    ctx.restore();
    // deck edge lights, a slow chase
    for (let q = 0; q < 20; q++) {
      const a = q / 20 * TAU, lit = ((t * 0.4 + q / 20) % 1) < 0.15;
      ctx.fillStyle = lit ? accent : 'rgba(90,216,255,0.16)';
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * (dr - 3 * S), cy + Math.sin(a) * (dr - 3 * S), 1.3 * S, 0, TAU); ctx.fill();
    }
  }

  // ── Kit on the apron: the supply transformer, bottom left ──
  const tx = px + W * 0.035, ty = py + H * 0.80, tw = W * 0.11, th = H * 0.12;
  _wfShadow(tx, ty, tw, th, S, 1.5 * S);
  const tg = ctx.createLinearGradient(tx, 0, tx + tw, 0);
  tg.addColorStop(0, '#9aa096'); tg.addColorStop(1, '#565c54');
  ctx.fillStyle = tg; ctx.strokeStyle = '#2a2e28'; ctx.lineWidth = 1.2 * S;
  ctx.beginPath(); ctx.roundRect(tx, ty, tw, th, 1.5 * S); _fillMetalG(ctx); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; for (let q = 0; q < 4; q++) ctx.fillRect(tx + 2.5 * S, ty + 3 * S + q * (th - 6 * S) / 4, tw - 5 * S, 1.6 * S);
  ctx.fillStyle = on ? (busy ? CHG : accent) : '#3a4650'; ctx.beginPath(); ctx.arc(tx + tw - 3.5 * S, ty + 3.5 * S, 1.6 * S, 0, TAU); ctx.fill();

  _wfLamp(px + W * 0.9, py + H * 0.9, S, t, busy ? CHG : accent, on);
  _wfPlate('CHARGING PORT', cx, py + H * 0.965, S, accent, on);
  ctx.textAlign = 'left';
  ctx.restore();
}

/* ── Drone Port, Charging Port and the airframe, rendered ─────────────────
   Built in Blender (scripts/render_drones.py, sharing render_advnuke.py's
   helpers and palette): dport_base (9×9), dchg_base (5×5) and drone_frame
   (one airframe from straight above, nose north, r = 1 m, its duct
   interiors open). DRONE_LAYOUT is the script's drone_layout.json (re-paste
   after a re-render). The stations at their default size use the sprites;
   drawDrone lays the airframe over its live rotors. Everything that shows
   the fleet stays live: pad lights, berth glow and charge arcs, downwash,
   feeder flow, the deck's chase lights, tower glazing, radar and beacon,
   hangar skylights, battery cells, gantry power, the windsock; on the
   charger the booms, coils, charge arcs and the mast's core. */
const DRONE_LAYOUT = {"dport":{"lights":[[-5.15,7.67,0.3],[-2.819,7.67,0.3],[-0.488,7.67,0.3],[1.843,7.67,0.3],[4.174,7.67,0.3],[5.15,6.315,0.3],[5.15,3.985,0.3],[5.15,1.654,0.3],[5.15,-0.677,0.3],[5.15,-3.008,0.3],[5.15,-5.339,0.3],[5.15,-7.67,0.3],[2.819,-7.67,0.3],[0.488,-7.67,0.3],[-1.843,-7.67,0.3],[-4.174,-7.67,0.3],[-5.15,-6.315,0.3],[-5.15,-3.985,0.3],[-5.15,-1.654,0.3],[-5.15,0.677,0.3],[-5.15,3.008,0.3],[-5.15,5.339,0.3]],"pads":[[-2.97,6.57,0.4],[0.0,6.57,0.4],[2.97,6.57,0.4],[-3.69,1.89,0.4],[3.69,1.89,0.4],[-3.69,-1.89,0.4],[3.69,-1.89,0.4],[-2.97,-6.57,0.4],[0.0,-6.57,0.4],[2.97,-6.57,0.4]],"pr":1.116,"tower":[0.0,0.72,2.7,2.111,3.62,1.283,1.651,4.95],"hangar":[-6.93,5.8,1.0,3.35],"arms":[[6.39,6.57,3.2,3.974,2.4],[6.39,1.89,3.2,4.694,2.4],[6.39,-1.89,3.2,4.694,2.4],[6.39,-6.57,3.2,3.974,2.4]],"gantry":[6.39,6.12,-6.48,3.45],"cells":[[7.605,4.9,2.47,0.8],[7.605,3.8,2.47,0.8],[7.605,2.7,2.47,0.8],[7.605,1.6,2.47,0.8],[7.605,0.5,2.47,0.8]],"sock":[8.01,8.01,3.1],"frame":[-9,9,-9,9],"deck":[-5.4,5.4,-7.92,7.92,0.27],"rect":[-9.3,12.503,-13.266,14.034],"radarRect":[-1.3,1.3,-0.58,4.272],"sockRect":[5.31,8.61,7.21,10.831]},"dchg":{"pads":[[0.0,3.2,0.45],[3.04,0.99,0.45],[1.88,-2.59,0.45],[-1.88,-2.59,0.45],[-3.04,0.99,0.45]],"booms":[[[0.0,0.85,1.1],[0.0,2.079,0.7]],[[0.808,0.263,1.1],[1.974,0.643,0.7]],[[0.499,-0.688,1.1],[1.221,-1.683,0.7]],[[-0.499,-0.688,1.1],[-1.221,-1.683,0.7]],[[-0.808,0.263,1.1],[-1.974,0.643,0.7]]],"pr":1.18,"mast":[0,0,3.3,0.55],"frame":[-5,5,-5,5],"rect":[-5.3,6.823,-7.186,7.552]},"drone":{"frame":[-1.95,1.95,-1.95,1.95],"rect":[-1.95,1.95,-1.95,1.95]}};
const _accTint = new Map(); let _sil = null;
const DroneArt = (() => {
  const ims = new Map(); let failed = false;
  function get(name) {
    if (failed) return null;
    let im = ims.get(name);
    if (!im) { im = new Image(); im.onerror = () => { failed = true; }; im.src = `img/${name}.png`; ims.set(name, im); }
    return im.complete && im.naturalWidth ? im : null;
  }
  const off = () => !DRONE_LAYOUT || (typeof _imageFillsOff !== 'undefined' && _imageFillsOff);
  return {
    get,
    frame() { return off() ? null : get('drone_frame'); },
    prop() { return off() ? null : get('drone_prop'); },
    // The airframe as a solid black shape, for its shadow (baked once).
    silhouette() {
      if (_sil) return _sil;
      const im = off() ? null : get('drone_frame'); if (!im) return null;
      const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
      g.globalCompositeOperation = 'source-in'; g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
      return (_sil = cv);
    },
    // The job's accent chevron (drone_accent, rendered white), tinted once per colour.
    accent(col) {
      const im = off() ? null : get('drone_accent'); if (!im) return null;
      let cv = _accTint.get(col); if (cv) return cv;
      cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
      g.globalCompositeOperation = 'multiply'; g.fillStyle = col; g.fillRect(0, 0, cv.width, cv.height);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(im, 0, 0);
      _accTint.set(col, cv); return cv;
    },
    ok(e, kind, w, h) { return !off() && (e._rotation || 0) === 0 && (e.width || w) === w && (e.height || h) === h && !!get(kind + '_base'); },
  };
})();

function _dportArt(e, px, py, t) {
  const L = DRONE_LAYOUT.dport, F = _anFrame(e, px, py), { P, M } = F, S = TILE / 40, TAU = Math.PI * 2;
  const on = e.powered, accent = '#5ad8ff';
  const drones = (typeof DroneSystem !== 'undefined') ? DroneSystem.fleet(e) : [];
  const stormy = (typeof DroneSystem !== 'undefined') && !!DroneSystem.slowedBy();
  const pr = L.pr;
  // A light on a modelled fixture: a soft glow and a hot core, nothing flat.
  const lamp = (x, y, rgb, a, rad = 5) => { _anGlow(x, y, rad * S, rgb, a); ctx.fillStyle = `rgba(${rgb},${Math.min(1, a * 1.4).toFixed(3)})`; ctx.beginPath(); ctx.arc(x, y, 0.7 * S, 0, TAU); ctx.fill(); };
  ctx.save();
  F.draw(DroneArt.get('dport_base'), L.rect);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  // the pads: edge lights, the charge ring's segments, downwash
  L.pads.forEach((p, i) => {
    const d = drones[i], home = !d || d.state === 'idle';
    const moving = on && d && (d.state === 'launch' || d.state === 'land');
    if (on) for (let q = 0; q < 4; q++) {
      const aa = q * Math.PI / 2 + Math.PI / 4, [lx, ly] = P(p[0] + Math.cos(aa) * pr * 1.04, p[1] + Math.sin(aa) * pr * 1.04, 0.47);
      if (moving) { if (Math.sin(t * 12) > 0) lamp(lx, ly, '255,194,74', 0.7, 4); }
      else lamp(lx, ly, home ? '90,216,255' : '108,240,160', 0.22, 2.6);
    }
    if (home && on && d) {
      const lit = Math.max(1, Math.round(d.battery * 12)), rgb = d.battery >= 1 ? '120,226,255' : d.battery < 0.35 ? '255,128,64' : '108,240,160';
      for (let k = 0; k < lit; k++) {
        const aa = Math.PI / 2 - (k + 0.5) / 12 * TAU, [sx, sy] = P(p[0] + Math.cos(aa) * pr * 0.9, p[1] + Math.sin(aa) * pr * 0.9, 0.43);   // clockwise from north
        lamp(sx, sy, rgb, 0.5 + (k === lit - 1 && d.battery < 1 ? 0.3 * Math.sin(t * 5 + i) : 0), 3.5);
      }
    }
  });
  ctx.restore();
  L.pads.forEach((p, i) => {
    const d = drones[i]; if (!(on && d && (d.state === 'launch' || d.state === 'land'))) return;
    const wash = 1 - Math.min(1, (d.alt || 0) / 0.75); if (wash <= 0.02) return;
    const [mx, my] = P(p[0], p[1], 0.45);
    for (let q = 0; q < 2; q++) { const ph = (t * 1.6 + q * 0.5) % 1; ctx.globalAlpha = 0.3 * wash * (1 - ph); ctx.strokeStyle = '#dce8f0'; ctx.lineWidth = 1.4 * S; ctx.beginPath(); ctx.ellipse(mx, my, pr * M * (0.9 + ph * 0.8), pr * M * (0.9 + ph * 0.8), 0, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
  });
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  // chase lights running round the deck's edge fixtures
  if (on) L.lights.forEach((q, i) => {
    const f = i / L.lights.length, hot = ((t * 0.45 + f) % 1) < 0.2, [lx, ly] = P(...q);
    lamp(lx, ly, '90,216,255', hot ? 0.75 : 0.12, hot ? 6 : 3);
  });
  // the tower: glazing lit, the beacon
  { const [x, y, z, r, zr, bx2, by2, bz] = L.tower, [gx, gy] = P(x, y, z);
    if (on) _anGlow(gx, gy + r * 0.4 * M, r * 1.3 * M, '90,216,255', 0.2 + 0.05 * Math.sin(t * 1.3));
    const [lx, ly] = P(bx2, by2, bz); if (on && Math.sin(t * 4) > 0) lamp(lx, ly, '255,90,74', 0.85, 9); }
  // hangar skylights and the battery container's cell windows
  if (on) {
    { const [hx, hy0, hy1, hz] = L.hangar; for (let k = 0; k < 3; k++) { const [sx, sy] = P(hx, hy0 - k * 2.4, hz); _anGlow(sx, sy, 0.9 * M, '255,230,170', 0.3); } }
    L.cells.forEach(([x, y, z], k) => { const [cx2, cy2] = P(x, y, z), lit = ((t * 1.2 + k * 0.2) % 1) < 0.6; _anGlow(cx2, cy2, 0.55 * M, '108,240,160', lit ? 0.55 : 0.12); });
  }
  ctx.restore();
  // the radar, turning (one of twelve rendered angles over half a turn)
  { const ra = on ? t * 1.2 : 0.6, k = Math.floor((((ra % Math.PI) + Math.PI) % Math.PI) / Math.PI * 12) % 12;
    F.draw(DroneArt.get('dport_radar_' + k), L.radarRect); }
  // the windsock: hanging limp in clear air, streaming out in a storm (why the fleet is crawling)
  { const im = DroneArt.get('dport_sock_' + (stormy ? 1 : 0));
    if (im) { const wob = stormy ? Math.sin(t * 9) * 0.6 * S : Math.sin(t * 1.5) * 0.25 * S; ctx.save(); ctx.translate(0, wob); F.draw(im, L.sockRect); ctx.restore(); } }
  _wfLamp(px + F.W * 0.12, py + F.H * 0.955, S, t, accent, on);
  _wfPlate('DRONE PORT', px + F.W * 0.5, py + F.H * 0.965, S, accent, on);
  ctx.restore();
}

function _dchgArt(e, px, py, t) {
  const L = DRONE_LAYOUT.dchg, F = _anFrame(e, px, py), { P, M } = F, S = TILE / 40, TAU = Math.PI * 2;
  const on = e.powered, accent = '#5ad8ff', CHG = '#7df0a4';
  const DS = typeof DroneSystem !== 'undefined' ? DroneSystem : null;
  const occ = DS && DS.chargerPads ? DS.chargerPads(e) : L.pads.map(() => null);
  const busy = occ.filter(d => d && d._chargingAt === e).length, load = on ? busy / L.pads.length : 0, pr = L.pr * M;
  ctx.save();
  F.draw(DroneArt.get('dchg_base'), L.rect);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  L.pads.forEach((p, i) => {
    const d = occ[i], live = on && d && d._chargingAt === e, inbound = on && d && !live, [mx, my] = P(p[0], p[1], p[2]);
    if (live) {
      const [[a0, a1, a2], [b0, b1, b2]] = L.booms[i], [ax, ay] = P(a0, a1, a2), [bx, by] = P(b0, b1, b2);
      ctx.setLineDash([3 * S, 6 * S]); ctx.lineDashOffset = -t * 30 * S; ctx.strokeStyle = 'rgba(125,240,164,0.85)'; ctx.lineWidth = 1.6 * S;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
      _anGlow(mx, my, pr * 1.2, '125,240,164', 0.3 + 0.12 * Math.sin(t * 5 + i));
    }
    for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2 + Math.PI / 4; ctx.fillStyle = !on ? 'rgba(0,0,0,0)' : live ? CHG : inbound && Math.sin(t * 10) > 0 ? '#ffc24a' : 'rgba(90,216,255,0.7)'; ctx.beginPath(); ctx.arc(mx + Math.cos(a) * pr * 1.04, my + Math.sin(a) * pr * 1.04, 1.3 * S, 0, TAU); ctx.fill(); }
  });
  ctx.restore();
  occ.forEach((d, i) => { if (!(on && d && d._chargingAt === e)) return; const [mx, my] = P(...L.pads[i]); ctx.strokeStyle = d.battery < 0.35 ? '#ff8040' : CHG; ctx.lineWidth = 2.2 * S; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(mx, my, pr * 1.2, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.02, d.battery)); ctx.stroke(); ctx.lineCap = 'butt'; });
  // the mast's core burns brighter the more pads are in use
  { const [x, y, z, r] = L.mast, [cx, cy] = P(x, y, z), pulse = 0.5 + 0.5 * Math.sin(t * (2 + 5 * load)); if (on) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; _anGlow(cx, cy, r * (2 + 2 * load) * M, busy ? '125,240,164' : '90,216,255', 0.35 + 0.4 * load * pulse); ctx.restore(); } }
  _wfLamp(px + F.W * 0.9, py + F.H * 0.9, S, t, busy ? CHG : accent, on);
  _wfPlate('CHARGING PORT', px + F.W * 0.5, py + F.H * 0.965, S, accent, on);
  ctx.restore();
}
