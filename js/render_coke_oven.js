/* ═══════════════════════════════════════════════════════════════════
   COKE OVEN ART — renderCokeOven (coke_oven_system.js)
   A by-product coke works on a 14×9 lot, read west to east:
     coal tower over the end of the battery, fed by the COAL IN belt
     → the oven battery: 22 brick slot ovens side by side, heat glowing in
       the flues between them, a larry car shuttling along the top to
       charge them, ascension pipes rising into the collecting main
     → pusher machine on the north track, coke guide and hot car on the
       south track: every cycle the pusher walks to an oven, its doors
       open, and the ram shoves a white-hot coke cake out into the car
     → the car runs it under the quench tower (a huge burst of steam),
       then tips it onto the coke wharf, where it drains to COKE OUT
     → the gas plant: coolers, exhauster house, tar decanter, and the
       flare stack that roars whenever there is oven gas nobody takes,
       with the hydrogen line down to GAS OUT
   Plus the battery chimney, the control room and the quench-water basin.
   Shared kit: render_rare_earth.js (_fcVTank, _fcHCyl, _fcBuilding,
   _fcDiamond, _fcPile), render_hydro_coal.js (_wf*), render_field_core.js
   (_fcPorts, _fcBeltAt — called at draw time, after it has loaded).
   ═══════════════════════════════════════════════════════════════════ */

const _CO_ACCENT = '#ff7a2a';

function renderCokeOven(e, px, py, t) {
  const def = EntityDefs[T.COKEOVEN];
  const w = (e.width || def.width) * TILE, h = (e.height || def.height) * TILE;
  const on = !!e.powered, active = on && !!e._running;
  const cokeFill = Math.min(1, (e._coke       || 0) / (def.cokeCapacity     || 300));
  const bunkFill = Math.min(1, (e._coalBunker || 0) / (def.coalCapacity     || 45));
  const gasFill  = Math.min(1, (e._hydrogen   || 0) / (def.hydrogenCapacity || 1000));
  const flaring  = active && !!e._flaring;
  const S = (TILE / 40) * Math.max(1, Math.min(w / (8 * TILE), h / (7 * TILE)));
  const U = w / 14, V = h / 9;
  const X = c => px + c*U, Y = r => py + r*V;
  const detail = e._iconThumb || Camera.zoom > 0.45;
  // A battery is never let go cold (the brickwork would crack), so even an
  // idle one glows faintly while it has power.
  const heat = active ? 1 : on ? 0.4 : 0.08;
  const lerp = (a, b, f) => a + (b - a)*f;
  const ease = f => f < 0 ? 0 : f > 1 ? 1 : f*f*(3 - 2*f);
  ctx.save();
  ctx.lineJoin = 'round';

  // ── The pushing cycle ──
  // One oven pushed every P seconds, in a stride-9 series round the 22
  // (real batteries never push neighbours back to back). Phases:
  //   0.00-0.18 pusher walks to the oven, hot car runs up from the wharf
  //   0.18-0.40 doors off, the ram shoves the cake into the car
  //   0.40-0.60 hot car runs east to the quench tower
  //   0.60-0.78 quench: the cloud
  //   0.78-1.00 car back to the wharf and tips its load
  const N = 22, P = 16;
  const cycT = e._iconThumb ? 0.3 : t / P;
  const cycN = Math.floor(cycT), ph = active ? cycT - cycN : 1;
  const k  = ((cycN * 9) % N + N) % N;
  const kp = (((cycN - 1) * 9) % N + N) % N;
  const bx0 = X(2.05), bx1 = X(10.0), by0 = Y(1.7), by1 = Y(4.5);
  const ow = (bx1 - bx0) / N;
  const ovenX = i => bx0 + (i + 0.5)*ow;
  const wharfX = X(8.1), quenchX = X(11.3);
  const pushF  = active ? ease((ph - 0.18) / 0.22) : 0;           // ram stroke / cake out
  const doorOpen = active && ph > 0.16 && ph < 0.44;
  // hot car position and load
  let carX, load = 0, loadHeat = 0;
  if (!active)          { carX = wharfX; }
  else if (ph < 0.18)   { carX = lerp(wharfX, ovenX(k), ease(ph / 0.18)); }
  else if (ph < 0.40)   { carX = ovenX(k); load = pushF; loadHeat = 1; }
  else if (ph < 0.60)   { carX = lerp(ovenX(k), quenchX, ease((ph - 0.40) / 0.20)); load = 1; loadHeat = 1; }
  else if (ph < 0.78)   { carX = quenchX; load = 1; loadHeat = 1 - ease((ph - 0.60) / 0.16); }
  else                  { carX = lerp(quenchX, wharfX, ease((ph - 0.78) / 0.12)); load = ph < 0.9 ? 1 : 1 - ease((ph - 0.9) / 0.08); }
  const pusherX = !active ? ovenX(k) : ph < 0.18 ? lerp(ovenX(kp), ovenX(k), ease(ph / 0.18)) : ovenX(k);
  const pusherMoving = active && ph < 0.18;

  // ── Ground: ballast beds and rails for the two machine tracks ──
  const track = (x0, x1, y, gauge) => {
    ctx.fillStyle = '#4a4640'; ctx.fillRect(x0, y - gauge*0.9, x1 - x0, gauge*1.8);
    if (detail) {
      ctx.fillStyle = '#2e2a24';
      for (let x = x0 + 2*S; x < x1; x += 5*S) ctx.fillRect(x, y - gauge*0.75, 2.4*S, gauge*1.5);
    }
    ctx.fillStyle = '#a8aaae';
    ctx.fillRect(x0, y - gauge*0.5 - 0.7*S, x1 - x0, 1.4*S);
    ctx.fillRect(x0, y + gauge*0.5 - 0.7*S, x1 - x0, 1.4*S);
  };
  track(X(1.95), X(10.15), Y(1.15), 0.32*V);                       // pusher side (north)
  track(X(1.95), X(12.45), Y(5.15), 0.32*V);                       // coke side (south), on to the quench tower

  // ── Flows under the plant ──
  _wfConveyor(X(1.5), Y(8.3), X(1.5), Y(4.95), S, t, on && !!e._hasCoal, '#2a2622');          // coal up to the tower
  _wfConveyor(X(8.5), Y(7.55), X(8.5), Y(8.3), S, t, on && cokeFill > 0, '#9ca0a6');           // wharf down to COKE OUT
  _wfPipe([[X(12.5), Y(8.3)], [X(12.5), Y(3.35)]], S, t, on && gasFill > 0, '#80d8ff');         // hydrogen down to GAS OUT
  _wfPipe([[X(11.6), Y(4.35)], [X(11.6), Y(6.6)]], S, t, active, '#9ab8c8');                     // quench water to the basin

  // ── Battery chimney ──
  {
    const cx = X(6.0), cy = Y(6.95), r = Math.min(U, V)*0.42;
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(cx + 12*S, cy + 14*S, r*1.05, r*0.9, 0.6, 0, Math.PI*2); ctx.fill();
    const g = ctx.createRadialGradient(cx - r*0.4, cy - r*0.4, r*0.1, cx, cy, r);
    g.addColorStop(0, '#e8e0d8'); g.addColorStop(1, '#8a8078');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#b8261c'; ctx.lineWidth = 2.6*S; ctx.beginPath(); ctx.arc(cx, cy, r*0.78, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = '#f0ece6'; ctx.lineWidth = 1.6*S; ctx.beginPath(); ctx.arc(cx, cy, r*0.6, 0, Math.PI*2); ctx.stroke();
    if (e._scrubber) {
      // Capped: the flue is ducted to the absorber tower (drawn after the wharf).
      ctx.fillStyle = '#2e4e44'; ctx.beginPath(); ctx.arc(cx, cy, r*0.45, 0, Math.PI*2); ctx.fill();
    } else {
      ctx.fillStyle = '#141210'; ctx.beginPath(); ctx.arc(cx, cy, r*0.45, 0, Math.PI*2); ctx.fill();
      if (on) { ctx.fillStyle = `rgba(255,120,40,${(0.25*heat).toFixed(3)})`; ctx.beginPath(); ctx.arc(cx, cy, r*0.38, 0, Math.PI*2); ctx.fill(); }
      _wfSmoke(cx, cy, S*1.1, t, '70,66,62', on, active ? 0.4 : 0.15);
    }
  }

  // ── Quench-water settling basin ──
  {
    const bx = X(10.2), by = Y(6.55), bw = X(12.0) - bx, bh = Y(7.95) - by;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bx + 4*S, by + 5*S, bw, bh);
    ctx.fillStyle = '#6a6660'; ctx.fillRect(bx, by, bw, bh);
    const wg = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    wg.addColorStop(0, '#3a4a50'); wg.addColorStop(1, '#22282c');
    ctx.fillStyle = wg; ctx.fillRect(bx + 3*S, by + 3*S, bw - 6*S, bh - 6*S);
    ctx.fillStyle = 'rgba(20,18,16,0.55)';                                      // settled coke breeze
    ctx.beginPath(); ctx.ellipse(bx + bw*0.3, by + bh*0.7, bw*0.22, bh*0.18, 0, 0, Math.PI*2); ctx.fill();
    if (active && detail) {
      ctx.strokeStyle = 'rgba(200,220,230,0.25)'; ctx.lineWidth = 0.8*S;
      for (let k2 = 0; k2 < 3; k2++) {
        const f = (t*0.4 + k2/3) % 1;
        ctx.beginPath(); ctx.ellipse(bx + bw*0.75, by + bh*0.3, f*bw*0.25, f*bh*0.18, 0, 0, Math.PI*2); ctx.stroke();
      }
    }
  }

  // ── Coke wharf: a sloped brick apron the hot car tips onto ──
  {
    const wx = X(6.6), wy = Y(5.75), ww = X(10.0) - wx, wh = Y(7.5) - wy;
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(wx + 4*S, wy + 5*S, ww, wh);
    const g = ctx.createLinearGradient(0, wy, 0, wy + wh);
    g.addColorStop(0, '#7a5a48'); g.addColorStop(1, '#4a3a30');
    ctx.fillStyle = g; ctx.fillRect(wx, wy, ww, wh);
    if (detail) {
      ctx.strokeStyle = 'rgba(30,20,14,0.35)'; ctx.lineWidth = 0.6*S;
      for (let yy = wy + 4*S; yy < wy + wh; yy += 4*S) { ctx.beginPath(); ctx.moveTo(wx, yy); ctx.lineTo(wx + ww, yy); ctx.stroke(); }
    }
    // the drag conveyor along its foot
    ctx.fillStyle = '#26221e'; ctx.fillRect(wx, wy + wh - 5*S, ww, 5*S);
    ctx.fillStyle = '#5a5650'; ctx.fillRect(wx, wy + wh - 5.6*S, ww, 1.2*S);
    // coke lying on it, growing with the store: low silver-grey heaps
    const heaps = Math.round(cokeFill*7);
    for (let i = 0; i < heaps; i++) {
      const hx = wx + ww*(0.08 + (i % 4)*0.24) + (i >= 4 ? ww*0.12 : 0), hy = wy + wh*(i >= 4 ? 0.62 : 0.36);
      _fcPile(hx, hy, U*0.42, V*0.24, S, '#b4b8be', '#3e4046');
      if (detail) {
        ctx.fillStyle = 'rgba(14,14,18,0.6)';
        for (let p = 0; p < 4; p++) { ctx.beginPath(); ctx.arc(hx + (p - 1.5)*U*0.15, hy + ((p*7) % 3 - 1)*V*0.06, 0.8*S, 0, Math.PI*2); ctx.fill(); }
      }
    }
    // embers still winking in the fresh tip
    if (active && detail && ph > 0.86) {
      for (let s = 0; s < 6; s++) {
        const a = Math.max(0, Math.sin(t*9 + s*2.1)) * (1 - (ph - 0.86) / 0.14);
        ctx.fillStyle = `rgba(255,${140 + s*12},60,${(0.8*a).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(wx + ww*(0.3 + s*0.08), wy + wh*(0.25 + (s % 3)*0.12), 1.1*S, 0, Math.PI*2); ctx.fill();
      }
    }
    // water sprays over the wharf, drying the coke off
    if (active && detail) {
      for (let s = 0; s < 3; s++) {
        const sx = wx + ww*(0.2 + s*0.3), sy = wy + 2*S;
        ctx.fillStyle = '#5a6a74'; ctx.fillRect(sx - 1*S, sy - 1*S, 2*S, 2*S);
        ctx.fillStyle = `rgba(200,225,240,${(0.16 + 0.08*Math.sin(t*5 + s)).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 7*S, sy + 13*S); ctx.lineTo(sx + 7*S, sy + 13*S); ctx.closePath(); ctx.fill();
      }
    }
  }

  // ── Control room ──
  _fcBuilding(X(2.55), Y(6.05), X(5.3) - X(2.55), Y(7.7) - Y(6.05), S, t,
    { lit: on, roof0: '#c8c4be', roof1: '#8e8a84', wall: '#5e5a56', units: [[0.25, 0.4], [0.7, 0.4]], spin: on });

  // ── Flue-gas scrubber (fitted from the panel): an absorber tower under the
  // chimney, which vents clean vapour instead of its smoke ──
  if (e._scrubber) {
    const scX = X(5.75), scR = 12*S, scTop = Y(7.75), scBase = Y(8.85), dY = Y(8.1), dX = X(6.5);
    _scrubberDuct([[X(6.0) + Math.min(U, V)*0.2, Y(6.95)], [dX, Y(6.95)], [dX, dY], [scX + scR, dY]], S, t, active);
    _scrubberTower(scX, scTop, scBase, scR, S, t, active, -1);
    if (active && detail) _scrubberVapour(scX, scTop - 4*S, S, t, 4, 0.8);
  }

  // ── The oven battery ──
  {
    // shadow, then the end buttresses (regenerator walls) and the block
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(bx0 - 4*S + 6*S, by0 - 2*S + 7*S, bx1 - bx0 + 8*S, by1 - by0 + 4*S);
    for (const ex of [bx0 - 6*S, bx1]) {
      const eg = ctx.createLinearGradient(ex, 0, ex + 6*S, 0);
      eg.addColorStop(0, '#5a3a2c'); eg.addColorStop(1, '#3a2418');
      ctx.fillStyle = eg; ctx.fillRect(ex, by0 - 3*S, 6*S, by1 - by0 + 6*S);
      ctx.strokeStyle = '#1a0e08'; ctx.lineWidth = 0.8*S; ctx.strokeRect(ex, by0 - 3*S, 6*S, by1 - by0 + 6*S);
    }
    // top deck: brick blackened by years of soot and charging dust, so the
    // heat in the flues shows through it
    const dg = ctx.createLinearGradient(bx0, by0, bx1, by1);
    dg.addColorStop(0, '#4e4642'); dg.addColorStop(0.5, '#38302c'); dg.addColorStop(1, '#241e1a');
    ctx.fillStyle = dg; ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    // whole-deck heat haze, breathing
    if (heat > 0.05) {
      const hz = ctx.createRadialGradient((bx0 + bx1)/2, (by0 + by1)/2, 0, (bx0 + bx1)/2, (by0 + by1)/2, (bx1 - bx0)*0.6);
      const ha = heat*(0.07 + 0.03*Math.sin(t*1.3));
      hz.addColorStop(0, `rgba(255,110,30,${ha.toFixed(3)})`); hz.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = hz; ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    }
    // the door strips on the pusher (north) and coke (south) faces
    const ds = (by1 - by0)*0.16;
    ctx.fillStyle = '#2a2420'; ctx.fillRect(bx0, by0, bx1 - bx0, ds); ctx.fillRect(bx0, by1 - ds, bx1 - bx0, ds);

    for (let i = 0; i < N; i++) {
      const x0 = bx0 + i*ow, cx = x0 + ow/2;
      const pushed = active && i === k;
      // just-pushed oven is empty and dark until it is charged again
      const empty = pushed && ph > 0.3;
      const flick = 0.6 + 0.4*Math.sin(t*0.9 + i*1.73);
      const glow = (empty ? 0.05 : heat*flick) * (pushed && ph > 0.16 && ph < 0.4 ? 2.2 : 1);
      // heating flue between this oven and the next: a hot seam
      if (i > 0 && heat > 0.05) {
        // soft bloom, then the bright core of the seam
        ctx.fillStyle = `rgba(255,${(90 + 50*flick) | 0},20,${Math.min(0.6, 0.3*heat*flick).toFixed(3)})`;
        ctx.fillRect(x0 - 1.8*S, by0 + ds, 3.6*S, by1 - by0 - 2*ds);
        ctx.fillStyle = `rgba(255,${(170 + 70*flick) | 0},${(70 + 60*flick) | 0},${Math.min(0.95, 0.75*heat*flick).toFixed(3)})`;
        ctx.fillRect(x0 - 0.6*S, by0 + ds, 1.2*S, by1 - by0 - 2*ds);
      } else if (i > 0) {
        ctx.fillStyle = 'rgba(10,8,6,0.6)'; ctx.fillRect(x0 - 0.4*S, by0 + ds, 0.8*S, by1 - by0 - 2*ds);
      }
      // a warm cast over the whole oven column
      if (glow > 0.02 && (pushed || i % 5 === (cycN % 5 + 5) % 5)) {
        ctx.fillStyle = `rgba(255,120,50,${Math.min(0.5, 0.07*glow).toFixed(3)})`;
        ctx.fillRect(x0 + 0.5*S, by0 + ds, ow - 1*S, by1 - by0 - 2*ds);
      }
      // charging holes: four lids along the oven
      if (detail) for (let l = 0; l < 4; l++) {
        const ly = lerp(by0 + ds*2.2, by1 - ds*2.2, l / 3);
        const lr = Math.min(ow*0.32, 2.4*S);
        // a hairline of fire round each lid, where it never quite seals
        if (glow > 0.05) { ctx.fillStyle = `rgba(255,150,50,${Math.min(0.9, 0.45*glow).toFixed(3)})`; ctx.beginPath(); ctx.arc(cx, ly, lr + 0.7*S, 0, Math.PI*2); ctx.fill(); }
        ctx.fillStyle = '#5a524c'; ctx.beginPath(); ctx.arc(cx, ly, lr, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#8a827a'; ctx.beginPath(); ctx.arc(cx - lr*0.2, ly - lr*0.2, lr*0.55, 0, Math.PI*2); ctx.fill();
        // a lid lifted on the oven the larry car is charging is drawn by the car
      }
      // doors: iron, with glowing seams; open (white-hot mouth) while pushing
      for (const [dy, side] of [[by0, 'n'], [by1 - ds, 's']]) {
        if (pushed && doorOpen) {
          const mg = ctx.createLinearGradient(0, dy, 0, dy + ds);
          mg.addColorStop(0, '#fff6c0'); mg.addColorStop(0.5, '#ffb030'); mg.addColorStop(1, '#ff6a10');
          ctx.fillStyle = mg; ctx.fillRect(x0 + 0.6*S, dy, ow - 1.2*S, ds);
        } else {
          ctx.fillStyle = '#3e3834'; ctx.fillRect(x0 + 0.8*S, dy + 0.6*S, ow - 1.6*S, ds - 1.2*S);
          if (heat > 0.05) {
            ctx.strokeStyle = `rgba(255,${(120 + 60*flick) | 0},40,${(0.55*heat*flick).toFixed(3)})`; ctx.lineWidth = 0.6*S;
            ctx.strokeRect(x0 + 0.8*S, dy + 0.6*S, ow - 1.6*S, ds - 1.2*S);
          }
          if (detail) { ctx.fillStyle = '#6a625c'; ctx.fillRect(cx - 0.6*S, dy + ds*0.3, 1.2*S, ds*0.4); }   // latch
        }
      }
      // ascension pipe on the north edge: a standpipe with its gooseneck
      if (detail) {
        const sy = by0 + ds + 3.2*S;
        ctx.fillStyle = '#2a2622'; ctx.beginPath(); ctx.arc(cx, sy, Math.min(ow*0.3, 2.2*S), 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#5a524c'; ctx.lineWidth = 1.2*S;
        ctx.beginPath(); ctx.moveTo(cx, sy); ctx.lineTo(cx, by0 - 2.5*S); ctx.stroke();
      }
    }

    // collecting main: the gas main running the length of the battery, on
    // along the north edge into the gas plant
    _fcHCyl(bx0 - 4*S, X(10.55), by0 - 4.5*S, 3.2*S, S, ['#8a8478', '#4e4a44', '#22201c'], { bands: [0.25, 0.5, 0.75], bandColor: '#2a2622' });
    if (active) {
      ctx.save(); ctx.beginPath(); ctx.rect(bx0, by0 - 7.7*S, X(10.55) - bx0, 6.4*S); ctx.clip();
      ctx.fillStyle = 'rgba(128,216,255,0.22)';
      const off = (t*14*S) % (10*S);
      for (let x = bx0 - 10*S + off; x < X(10.55); x += 10*S) ctx.fillRect(x, by0 - 5.6*S, 4*S, 2.2*S);
      ctx.restore();
    }

    // larry car: runs along the top charging ovens from its four hoppers
    {
      const span = bx1 - bx0 - 16*S;
      const s = 0.5 + 0.5*Math.sin(active ? t*0.32 : 1.1);
      const lx = bx0 + 8*S + span*s, ly = (by0 + by1)/2, lw = Math.max(ow*1.8, 11*S), lh = (by1 - by0)*0.62;
      const speed = Math.abs(Math.cos(t*0.32));
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(lx - lw/2 + 3*S, ly - lh/2 + 4*S, lw, lh);
      ctx.fillStyle = '#d8a020'; ctx.fillRect(lx - lw/2, ly - lh/2, lw, lh);
      ctx.strokeStyle = '#4a3408'; ctx.lineWidth = 0.9*S; ctx.strokeRect(lx - lw/2, ly - lh/2, lw, lh);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(lx - lw/2, ly - lh/2, lw, 1.4*S);
      for (let l = 0; l < 4; l++) {
        const hy = lerp(ly - lh/2 + lh*0.16, ly + lh/2 - lh*0.16, l / 3);
        ctx.fillStyle = '#1a1612'; ctx.beginPath(); ctx.arc(lx, hy, lw*0.28, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = bunkFill > 0.05 ? '#2e2a26' : '#5a4a2a';
        ctx.beginPath(); ctx.arc(lx, hy, lw*0.2, 0, Math.PI*2); ctx.fill();
      }
      ctx.fillStyle = '#3a3a40'; ctx.fillRect(lx + lw/2 - 3.5*S, ly - lh/2 + 1.5*S, 3*S, 4.5*S);   // cab
      ctx.fillStyle = on ? '#a8e0ff' : '#2a3a44'; ctx.fillRect(lx + lw/2 - 3*S, ly - lh/2 + 2*S, 2*S, 1.6*S);
      // charging: a brown puff off the lids when the car stops at an oven
      if (active && speed < 0.18) _wfSmoke(lx, ly - lh*0.3, S*0.6, t*1.6, '120,96,70', true, 0.35*(1 - speed/0.18));
    }
  }

  // ── Coal tower over the west end of the battery ──
  {
    const tx = X(0.3), ty = Y(0.85), tw = X(2.0) - tx, th = Y(4.95) - ty;
    ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fillRect(tx + 8*S, ty + 9*S, tw, th);
    const g = ctx.createLinearGradient(tx, ty, tx + tw, ty + th);
    g.addColorStop(0, '#d4d0c8'); g.addColorStop(1, '#8e8a82');
    ctx.fillStyle = g; ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = '#2a2824'; ctx.lineWidth = 1.2*S; ctx.strokeRect(tx, ty, tw, th);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.8*S;
    ctx.beginPath(); ctx.moveTo(tx + 1.5*S, ty + th - 1.5*S); ctx.lineTo(tx + 1.5*S, ty + 1.5*S); ctx.lineTo(tx + tw - 1.5*S, ty + 1.5*S); ctx.stroke();
    // open hatch on the roof: the coal inside, filling with the bunker
    const hx = tx + tw*0.18, hy = ty + th*0.12, hw = tw*0.64, hh = th*0.36;
    ctx.fillStyle = '#141210'; ctx.fillRect(hx, hy, hw, hh);
    if (bunkFill > 0.02) {
      const cg = ctx.createRadialGradient(hx + hw*0.4, hy + hh*0.4, 1, hx + hw/2, hy + hh/2, Math.max(hw, hh)*0.6);
      cg.addColorStop(0, '#4a4642'); cg.addColorStop(1, '#0e0c0a');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.ellipse(hx + hw/2, hy + hh/2, hw*0.48*Math.sqrt(bunkFill), hh*0.46*Math.sqrt(bunkFill), 0, 0, Math.PI*2); ctx.fill();
      if (detail) { ctx.fillStyle = 'rgba(220,225,235,0.5)'; for (let g2 = 0; g2 < 4; g2++) ctx.fillRect(hx + hw*(0.3 + g2*0.12), hy + hh*(0.35 + (g2 % 2)*0.2), 0.9*S, 0.9*S); }
    }
    ctx.strokeStyle = '#d8b030'; ctx.lineWidth = 1*S; ctx.strokeRect(hx - 1*S, hy - 1*S, hw + 2*S, hh + 2*S);
    // conveyor gallery coming up from COAL IN
    ctx.fillStyle = '#6e6a64'; ctx.fillRect(X(1.5) - 5*S, ty + th*0.62, 10*S, th*0.38);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let yy = ty + th*0.64; yy < ty + th; yy += 4*S) ctx.fillRect(X(1.5) - 5*S, yy, 10*S, 1*S);
    // stencil
    if (detail) {
      ctx.font = `bold ${Math.max(5, 5.5*S)}px Courier New`; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(40,36,30,0.75)'; ctx.fillText('COAL', tx + tw/2, ty + th*0.58);
      ctx.textAlign = 'left';
    }
  }

  // ── Pusher machine on the north track ──
  {
    const mw = Math.max(ow*3, 20*S), my = Y(1.15), mh = 0.82*V;
    const mx = pusherX;
    // the ram: a long beam reaching south through the oven while pushing
    if (active && ph > 0.18 && ph < 0.44) {
      const reach = (by1 - by0) * Math.min(1, pushF*1.05) * (ph > 0.40 ? 1 - (ph - 0.40) / 0.04 : 1);
      ctx.fillStyle = '#2a2a2e'; ctx.fillRect(mx - 1.6*S, my, 3.2*S, (by0 - my) + reach);
      ctx.fillStyle = '#7a7a82'; ctx.fillRect(mx - 1.6*S, my, 1*S, (by0 - my) + reach);
      ctx.fillStyle = '#1a1a1e'; ctx.fillRect(mx - ow*0.38, by0 + reach - 2*S, ow*0.76, 2.6*S);   // ram head
    }
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(mx - mw/2 + 4*S, my - mh/2 + 5*S, mw, mh);
    const pg = ctx.createLinearGradient(0, my - mh/2, 0, my + mh/2);
    pg.addColorStop(0, '#e07a3a'); pg.addColorStop(1, '#8a3e18');
    ctx.fillStyle = pg; ctx.fillRect(mx - mw/2, my - mh/2, mw, mh);
    ctx.strokeStyle = '#2a1408'; ctx.lineWidth = 1*S; ctx.strokeRect(mx - mw/2, my - mh/2, mw, mh);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(mx - mw/2, my - mh/2, mw, 1.4*S);
    // door extractor arm, leveller bar housing, cab
    ctx.fillStyle = '#3a3a40'; ctx.fillRect(mx - mw/2 + 2*S, my - mh/2 + 2*S, mw*0.3, mh - 4*S);
    ctx.fillStyle = '#4a4a52'; ctx.fillRect(mx + mw*0.1, my - mh/2 + 2*S, mw*0.34, mh*0.4);
    ctx.fillStyle = on ? '#a8e0ff' : '#2a3a44'; ctx.fillRect(mx + mw*0.14, my - mh/2 + 3*S, mw*0.26, mh*0.22);
    // hazard chevrons on its south edge
    if (detail) {
      ctx.save(); ctx.beginPath(); ctx.rect(mx - mw/2, my + mh/2 - 2.4*S, mw, 2.4*S); ctx.clip();
      for (let x = mx - mw/2 - 4*S; x < mx + mw/2; x += 4*S) {
        ctx.fillStyle = '#f0c020'; ctx.beginPath(); ctx.moveTo(x, my + mh/2); ctx.lineTo(x + 2*S, my + mh/2 - 2.4*S); ctx.lineTo(x + 4*S, my + mh/2 - 2.4*S); ctx.lineTo(x + 2*S, my + mh/2); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // amber beacon while it travels
    if (pusherMoving && Math.sin(t*12) > 0) {
      const bg = ctx.createRadialGradient(mx - mw/2 + 3*S, my - mh/2 + 3*S, 0, mx - mw/2 + 3*S, my - mh/2 + 3*S, 8*S);
      bg.addColorStop(0, 'rgba(255,190,40,0.9)'); bg.addColorStop(1, 'rgba(255,160,20,0)');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(mx - mw/2 + 3*S, my - mh/2 + 3*S, 8*S, 0, Math.PI*2); ctx.fill();
    }
  }

  // ── The push: the cake crossing from oven to car, sparks and smoke ──
  const guideY = by1 + 1*S, carY = Y(5.15);
  if (active && ph > 0.18 && ph < 0.42) {
    const cx = ovenX(k);
    // coke guide: a cage bridging the door to the car
    ctx.fillStyle = '#3a3a40'; ctx.fillRect(cx - ow*0.7, guideY, ow*1.4, carY - guideY - 3*S);
    ctx.strokeStyle = '#6a6a72'; ctx.lineWidth = 0.7*S;
    for (let yy = guideY + 2*S; yy < carY - 3*S; yy += 2.5*S) { ctx.beginPath(); ctx.moveTo(cx - ow*0.7, yy); ctx.lineTo(cx + ow*0.7, yy); ctx.stroke(); }
    // the cake: white-hot, cracking into pieces as it falls through
    const fall = Math.min(1, pushF*1.2);
    const cg = ctx.createLinearGradient(0, guideY, 0, carY);
    cg.addColorStop(0, '#fffbe0'); cg.addColorStop(0.5, '#ffc040'); cg.addColorStop(1, '#ff6a14');
    ctx.fillStyle = cg; ctx.fillRect(cx - ow*0.42, guideY, ow*0.84, (carY - guideY)*fall);
    // radiant glow round the mouth
    const rg = ctx.createRadialGradient(cx, (guideY + carY)/2, 0, cx, (guideY + carY)/2, 44*S);
    rg.addColorStop(0, 'rgba(255,220,120,0.75)'); rg.addColorStop(0.4, 'rgba(255,140,40,0.35)'); rg.addColorStop(1, 'rgba(255,100,20,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, (guideY + carY)/2, 44*S, 0, Math.PI*2); ctx.fill();
    // sparks, spraying both ways off the falling cake
    if (detail) for (let s = 0; s < 24; s++) {
      const f = (t*1.6 + s*0.0917) % 1;
      const dir = Math.sin(s*12.9898);
      const sx = cx + dir*ow*3.2*f, sy = guideY + f*(carY - guideY) - Math.sin(f*Math.PI)*14*S;
      ctx.fillStyle = `rgba(255,${(210 + (s % 4)*10) | 0},${(100 + (s % 5)*25) | 0},${(1 - f*f).toFixed(3)})`;
      ctx.fillRect(sx - 0.8*S, sy - 0.8*S, 1.6*S, 1.6*S);
    }
    // the black-orange plume a push throws up, lit from below by the cake
    for (let i = 0; i < 9; i++) {
      const f = (t*0.55 + i/9) % 1;
      const lit = 1 - f;
      ctx.fillStyle = `rgba(${(50 + 120*lit*lit) | 0},${(40 + 50*lit*lit) | 0},${(34 + 10*lit) | 0},${(0.5*(1 - f)).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(cx + Math.sin(i*2.3 + f*3)*8*S + f*16*S, guideY - f*72*S, (7 + f*20)*S, 0, Math.PI*2); ctx.fill();
    }
  }

  // ── Hot car and its locomotive on the south track ──
  {
    const cw = Math.max(ow*3.2, 20*S), ch = 0.8*V;
    // locomotive on the east end of the car
    const lx = carX + cw/2 + 1*S;
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(carX - cw/2 + 4*S, carY - ch/2 + 5*S, cw + 10*S, ch);
    ctx.fillStyle = '#2a5a8a'; ctx.fillRect(lx, carY - ch*0.42, 9*S, ch*0.84);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(lx, carY - ch*0.42, 9*S, 1.2*S);
    ctx.fillStyle = on ? '#a8e0ff' : '#2a3a44'; ctx.fillRect(lx + 5*S, carY - ch*0.3, 2.4*S, ch*0.6);
    ctx.fillStyle = '#f0c020'; ctx.fillRect(lx + 8*S, carY - ch*0.42, 1*S, ch*0.84);
    // the car: a steel tub with a sloping floor, its load glowing
    ctx.fillStyle = '#4a4a4e'; ctx.fillRect(carX - cw/2, carY - ch/2, cw, ch);
    ctx.strokeStyle = '#1a1a1c'; ctx.lineWidth = 1*S; ctx.strokeRect(carX - cw/2, carY - ch/2, cw, ch);
    const ix = carX - cw/2 + 2*S, iy = carY - ch/2 + 2*S, iw = cw - 4*S, ih = ch - 4*S;
    ctx.fillStyle = '#1e1e20'; ctx.fillRect(ix, iy, iw, ih);
    if (load > 0.01) {
      const lw2 = iw*load;
      const g = ctx.createLinearGradient(ix, 0, ix + lw2, 0);
      if (loadHeat > 0.02) {
        const a = loadHeat;
        g.addColorStop(0, `rgb(${(110 + 145*a) | 0},${(110 + 80*a) | 0},${(116 - 60*a) | 0})`);
        g.addColorStop(0.5, `rgb(${(130 + 125*a) | 0},${(130 + 100*a) | 0},${(136 - 40*a) | 0})`);
        g.addColorStop(1, `rgb(${(100 + 150*a) | 0},${(100 + 50*a) | 0},${(106 - 80*a) | 0})`);
      } else {
        g.addColorStop(0, '#9a9ea4'); g.addColorStop(1, '#55585e');
      }
      ctx.fillStyle = g; ctx.fillRect(ix, iy, lw2, ih);
      if (detail) {
        ctx.fillStyle = loadHeat > 0.3 ? 'rgba(120,40,10,0.45)' : 'rgba(20,20,24,0.55)';
        for (let p = 0; p < 7; p++) { ctx.beginPath(); ctx.arc(ix + lw2*((p*0.37) % 1), iy + ih*((p*0.61) % 1), 0.9*S, 0, Math.PI*2); ctx.fill(); }
      }
      if (loadHeat > 0.1) {
        const hg = ctx.createRadialGradient(ix + lw2/2, carY, 0, ix + lw2/2, carY, cw*0.9);
        hg.addColorStop(0, `rgba(255,150,50,${(0.4*loadHeat).toFixed(3)})`); hg.addColorStop(1, 'rgba(255,100,20,0)');
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(ix + lw2/2, carY, cw*0.9, 0, Math.PI*2); ctx.fill();
        // heat shimmer off the moving load
        if (detail && ph > 0.4) _wfSmoke(ix + lw2/2, carY - ch*0.2, S*0.55, t*1.4, '200,120,70', true, 0.22*loadHeat);
      }
    }
    // tipping onto the wharf: coke sliding off the side
    if (active && ph > 0.9 && ph < 0.98) {
      const f = (ph - 0.9) / 0.08;
      ctx.fillStyle = 'rgba(150,154,160,0.85)';
      for (let p = 0; p < 9; p++) {
        const gx = carX - cw/2 + cw*((p*0.29) % 1), gy = carY + ch/2 + f*V*0.9*((p % 3) + 1)/3;
        ctx.beginPath(); ctx.arc(gx, gy, 1.4*S, 0, Math.PI*2); ctx.fill();
      }
    }
  }

  // ── Quench tower: straddling the south track at its east end ──
  {
    const qx = X(10.55), qy = Y(3.75), qw = X(12.15) - qx, qh = Y(6.2) - qy;
    ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fillRect(qx + 9*S, qy + 10*S, qw, qh);
    const g = ctx.createLinearGradient(qx, qy, qx + qw, qy + qh);
    g.addColorStop(0, '#b4aca2'); g.addColorStop(1, '#6e665e');
    ctx.fillStyle = g; ctx.fillRect(qx, qy, qw, qh);
    ctx.strokeStyle = '#26221e'; ctx.lineWidth = 1.2*S; ctx.strokeRect(qx, qy, qw, qh);
    // the open stack: a dark grid of baffles you look down into
    const sx = qx + qw*0.16, sy = qy + qh*0.12, sw = qw*0.68, sh = qh*0.5;
    ctx.fillStyle = '#16181a'; ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeStyle = '#4a4a46'; ctx.lineWidth = 1*S;
    for (let i = 1; i < 5; i++) { const yy = sy + sh*i/5; ctx.beginPath(); ctx.moveTo(sx, yy); ctx.lineTo(sx + sw, yy); ctx.stroke(); }
    // water curtain catching the light while quenching
    if (active && ph > 0.6 && ph < 0.8) {
      ctx.fillStyle = `rgba(200,230,250,${(0.25 + 0.15*Math.sin(t*20)).toFixed(3)})`; ctx.fillRect(sx, sy, sw, sh);
    }
    // the arch the car runs through, on the track line
    ctx.fillStyle = '#2a2622'; ctx.fillRect(qx - 1*S, Y(5.15) - 0.42*V, 3*S, 0.84*V); ctx.fillRect(qx + qw - 2*S, Y(5.15) - 0.42*V, 3*S, 0.84*V);
    ctx.fillStyle = '#d8b030'; ctx.fillRect(qx, qy + qh - 2*S, qw, 2*S);
    if (detail) {
      ctx.font = `bold ${Math.max(5, 5*S)}px Courier New`; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(30,26,22,0.8)'; ctx.fillText('QUENCH', qx + qw/2, qy + qh*0.82);
      ctx.textAlign = 'left';
    }
  }

  // ── Gas plant (north-east) ──
  {
    // primary coolers: tall vessels the hot gas is washed down in
    _fcVTank(X(11.15), Y(1.2), Math.min(U, V)*0.62, S, { shell: ['#c8ccc8', '#8a908c', '#40464a'], band: '#2a6a8a', ladderAngle: 2.3 });
    _fcVTank(X(12.35), Y(1.2), Math.min(U, V)*0.62, S, { shell: ['#c8ccc8', '#8a908c', '#40464a'], band: '#2a6a8a', ladderAngle: 2.3 });
    // tar decanter: a long low black tank
    _fcHCyl(X(10.6), X(12.9), Y(2.6), V*0.24, S, ['#5a5450', '#2a2622', '#0c0a08'], { bands: [0.2, 0.8], bandColor: '#1a1612' });
    if (detail) _fcDiamond(X(11.75), Y(2.6), 6*S, '#1a1a1a', '⚠');
    // exhauster house: the fans that draw gas off the whole battery
    _fcBuilding(X(13.0), Y(1.85), X(13.9) - X(13.0), Y(3.4) - Y(1.85), S, t,
      { lit: on, roof0: '#bcc0c4', roof1: '#80868c', wall: '#565a60', windows: false, units: [[0.5, 0.3], [0.5, 0.7]], spin: active });
    // gas pipes knitting it together, and the hydrogen line away to GAS OUT
    _wfPipe([[X(10.55), Y(1.7) - 4.5*S], [X(10.75), Y(1.7) - 4.5*S], [X(10.75), Y(1.2)]], S, t, active, '#d8c890');
    _wfPipe([[X(11.75), Y(1.2)], [X(11.75), Y(0.45)], [X(12.35), Y(0.45)]], S, t, active, '#d8c890');
    _wfPipe([[X(12.35), Y(1.8)], [X(12.35), Y(2.15)], [X(13.0), Y(2.15)]], S, t, active, '#d8c890');
    _wfPipe([[X(13.45), Y(3.4)], [X(13.45), Y(3.35)], [X(12.5), Y(3.35)]], S, t, on && gasFill > 0, '#80d8ff');
    _wfPipe([[X(13.6), Y(1.85)], [X(13.6), Y(0.95)]], S, t, flaring, '#ffb060');              // to the flare
    _wfGauge(X(12.75), Y(3.6), 4.5*S, Y(5.0) - Y(3.6), S, gasFill, '#80d8ff', on);
    if (detail) {
      ctx.font = `bold ${Math.max(5, 4.6*S)}px Courier New`; ctx.textAlign = 'center';
      ctx.fillStyle = on ? '#9fe0ff' : '#5a6a74'; ctx.fillText('H₂', X(12.75) + 2.25*S, Y(3.6) - 2*S);
      ctx.textAlign = 'left';
    }
  }

  // ── Flare stack ──
  {
    const fx = X(13.6), fy = Y(0.75), fr = 2.8*S;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(fx + 10*S, fy + 12*S, fr*1.2, fr, 0.6, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#8a8680'; ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#b8261c'; ctx.lineWidth = 1.2*S; ctx.beginPath(); ctx.arc(fx, fy, fr*0.7, 0, Math.PI*2); ctx.stroke();
    if (flaring) {
      // a roaring flame, leaning off downwind, flickering
      const fl = 1 + 0.18*Math.sin(t*17) + 0.1*Math.sin(t*31);
      const halo = ctx.createRadialGradient(fx, fy - 6*S, 0, fx, fy - 6*S, 30*S*fl);
      halo.addColorStop(0, 'rgba(255,190,90,0.45)'); halo.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(fx, fy - 6*S, 30*S*fl, 0, Math.PI*2); ctx.fill();
      for (const [sc, col] of [[1, 'rgba(255,110,30,0.85)'], [0.68, 'rgba(255,190,60,0.92)'], [0.38, 'rgba(255,250,210,0.95)']]) {
        const L = 22*S*fl*sc, Wd = 5.5*S*sc;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(fx - Wd, fy);
        ctx.quadraticCurveTo(fx - Wd*1.2, fy - L*0.5, fx + L*0.28 + Math.sin(t*9)*2*S, fy - L);
        ctx.quadraticCurveTo(fx + Wd*1.3, fy - L*0.45, fx + Wd, fy);
        ctx.closePath(); ctx.fill();
      }
      _wfSmoke(fx + 6*S, fy - 22*S, S*0.8, t, '60,54,50', true, 0.25);
    } else if (on) {
      // pilot: a small blue flame
      ctx.fillStyle = `rgba(110,170,255,${(0.6 + 0.3*Math.sin(t*8)).toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(fx - 1.4*S, fy); ctx.quadraticCurveTo(fx, fy - 6*S, fx + 1.4*S, fy); ctx.closePath(); ctx.fill();
    }
  }

  // ── Quench cloud: drawn last so it billows over everything ──
  if (active && ph > 0.6 && ph < 0.86) {
    const f0 = (ph - 0.6) / 0.26;                                     // 0 → 1 over the burst
    const qcx = X(11.35), qcy = Y(4.3);
    const swell = Math.sin(Math.min(1, f0*1.4) * Math.PI*0.5), fade = f0 > 0.6 ? 1 - (f0 - 0.6) / 0.4 : 1;
    for (let i = 0; i < 14; i++) {
      const r1 = ((i*0.618) % 1), a = i*2.399;
      const rise = (swell*0.8 + r1*0.4) * 70*S;
      const cx = qcx + Math.cos(a)*10*S*swell + rise*0.35 + Math.sin(t*1.3 + i)*3*S;
      const cy = qcy - rise;
      const rr = (8 + r1*10 + swell*14)*S;
      const sh = 235 + ((i*7) % 20);
      ctx.fillStyle = `rgba(${sh},${sh},${sh},${(0.55*fade*(0.6 + 0.4*(1 - r1))).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI*2); ctx.fill();
    }
  } else if (on && heat > 0.3) {
    _wfSmoke(X(11.35), Y(4.2), S*0.8, t*0.6, '230,232,236', true, 0.18);     // the tower's idle wisp
  }

  // ── Stubs (bottom face): COAL IN belt col+1, COKE OUT belt col+8,
  // GAS OUT pipe col+12 — tile-anchored to CokeOvenSystem.getStubs.
  const TH = TILE/2;
  const Pp = _fcPorts(px, py, h, S, t);
  const st = typeof CokeOvenSystem !== 'undefined' && e.col !== undefined ? CokeOvenSystem.getStubs(e) : null;
  Pp.belt(px + TILE*1 + TH, 'COAL IN', !!e._hasCoal, true, active, '#3a3632', '#b0a89c');
  Pp.belt(px + TILE*8 + TH, 'COKE OUT', st ? _fcBeltAt(st.cokeOut) : false, false, on && cokeFill > 0, '#a8acb2', '#c8ccd2');
  const gx = px + TILE*12 + TH, gConn = !!e._gasPipeOut;
  Pp.pipe(gx, 'GAS OUT', gConn, '#80d8ff', '#80d8ff', '#1a5a7a', 'rgba(0,0,0,0)');
  if (gConn && on && gasFill > 0) {                                     // chevrons running OUT, down the stub
    const y1 = py + h - Pp.stubLen;
    ctx.strokeStyle = 'rgba(0,40,60,0.85)'; ctx.lineWidth = Math.max(1, S*1.1);
    for (let i = 0; i < 3; i++) {
      const f = (t*0.9 + i/3) % 1, cy = y1 + S*4 + f*(Pp.stubLen - S*8);
      ctx.beginPath(); ctx.moveTo(gx - S*2, cy - S*1.4); ctx.lineTo(gx, cy + S*0.6); ctx.lineTo(gx + S*2, cy - S*1.4); ctx.stroke();
    }
  }

  _wfPlate('COKE OVEN BATTERY', px + w*0.42, py + h*0.045, S, _CO_ACCENT, on);
  _wfLamp(X(0.55), py + 9*S, S, t, flaring ? '#ffb040' : _CO_ACCENT, on);
  ctx.restore();
}
