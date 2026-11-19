/* ═══════════════════════════════════════════════════════════════════
   RENDER: RESOURCE DEPOSITS
   Coal, oil, uranium, sulfur, lithium, helium and rare earth deposits,
   all drawn flat, straight from above: each is a ragged circle of its own
   material lying in the ground patch round it (deposit_ground.js), with
   nothing standing up off the map (no piles, stakes, signs or upright
   crystals) and nothing animating "upwards" — steam and haze spread out
   where they rise, crystals lie as faces and laths, bubbles open as rings.
   Geothermal keeps its own hot-spring art (render_geothermal.js).

   All but coal are authored in the 100-unit square of _depositKit
   (render_oil_nuclear.js), scaled to the footprint; coal uses it too.
   ═══════════════════════════════════════════════════════════════════ */

// Soft edge that melts a deposit into the ground patch under it.
function _dpHalo(K, rgb, a, r = 48, cy = 52) {
  const { X, Y, k, w, h } = K;
  const g = ctx.createRadialGradient(X(50), Y(cy), r*0.5*k, X(50), Y(cy), r*k);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(0.7, `rgba(${rgb},${(a*0.45).toFixed(3)})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(X(50), Y(cy), r*k, r*k*(h / w), 0, 0, Math.PI*2); ctx.fill();
}

// A flat crystal lath lying on the ground: a long hexagon along angle `a`,
// its lit half toward the upper left.
function _dpLath(K, x, y, a, len, wd, body, lit) {
  const { poly } = K;
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  const h = len / 2, e = len*0.32;
  const pts = [[x - dx*h, y - dy*h], [x - dx*e + nx*wd, y - dy*e + ny*wd], [x + dx*e + nx*wd, y + dy*e + ny*wd],
               [x + dx*h, y + dy*h], [x + dx*e - nx*wd, y + dy*e - ny*wd], [x - dx*e - nx*wd, y - dy*e - ny*wd]];
  poly(pts.map(([p, q]) => [p + 0.6, q + 0.8])); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
  poly(pts); ctx.fillStyle = body; ctx.fill();
  const litSide = (nx + ny) < 0 ? [pts[0], pts[1], pts[2], pts[3]] : [pts[3], pts[4], pts[5], pts[0]];
  poly(litSide); ctx.fillStyle = lit; ctx.fill();
}

// The outcrop (radius 1) spans 1/COAL_FRAME of a coal_seam sprite
// (scripts/render_coal_seam.py FRAME).
const COAL_FRAME = 1.35;

function renderCoalDeposit(e, px, py, t) {
    // Coal Deposit — a coal seam outcropping at the surface, seen from
    // straight above: a flat, ragged circle of packed black coal, broken
    // into angular lumps along its cleat, with loose lumps and coal dust
    // spilling round the rim and the odd glint off a fresh face. The circle
    // shrinks a little as the seam is worked out.
    const K = _depositKit(e, px, py);
    const { k, X, Y, S, blob, poly } = K;
    const detail = Camera.zoom > 0.5;
    const pct = e.coalMax > 0 ? Math.max(0, Math.min(1, (e.coalAmount || 0) / e.coalMax)) : 0;
    const sc = 0.7 + 0.3*pct;
    const R = 38*sc;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // ── Coal dust round the seam ───────────────────────────────────────
    _dpHalo(K, '14,13,13', 0.7, 48, 50);

    // ── The seam ───────────────────────────────────────────────────────
    // Rendered in Blender (img/coal_seam_*, scripts/render_coal_seam.py):
    // lumps broken along the cleat, each a tilted face catching the sun or
    // not, loose lumps and dust round it. Shrinks as the seam is worked.
    // The painted seam while it loads.
    const seam = typeof PhotoGround !== 'undefined' ? PhotoGround.sprite('coal_seam', S(31)) : null;
    if (seam) {
      const disp = R*2*COAL_FRAME*k;
      ctx.drawImage(seam, X(50) - disp/2, Y(50) - disp/2, disp, disp);
    } else {
      blob(50, 50, R + 2, R*0.96 + 2, 0.14, 20, 18); ctx.fillStyle = 'rgba(6,5,5,0.6)'; ctx.fill();   // dark lip
      blob(50, 50, R, R*0.96, 0.14, 40, 18);
      const g = ctx.createRadialGradient(X(38), Y(38), 0, X(50), Y(50), R*1.15*k);
      g.addColorStop(0, '#2a2828'); g.addColorStop(0.55, '#171515'); g.addColorStop(1, '#0c0b0b');
      ctx.fillStyle = g; ctx.fill();

      ctx.save();
      blob(50, 50, R, R*0.96, 0.14, 40, 18); ctx.clip();
      // Lumps packed over the whole face, each with a lit facet up and left
      const nL = 30 + K.size*12;
      for (let i = 0; i < nL; i++) {
        const a = S(100 + i)*Math.PI*2, d = Math.sqrt(S(120 + i))*R;
        const lx = 50 + Math.cos(a)*d, ly = 50 + Math.sin(a)*d*0.96;
        const lr = 2.6 + S(140 + i)*3.4;
        const pts = [];
        for (let q = 0; q < 5; q++) {
          const qa = q/5*Math.PI*2 + S(160 + i)*1.2, qr = lr*(0.65 + S(180 + i*5 + q)*0.45);
          pts.push([lx + Math.cos(qa)*qr, ly + Math.sin(qa)*qr]);
        }
        poly(pts); ctx.fillStyle = ['#141212', '#1b1919', '#222020'][Math.floor(S(200 + i)*3)]; ctx.fill();
        ctx.strokeStyle = 'rgba(4,3,3,0.85)'; ctx.lineWidth = 0.5*k; ctx.stroke();
        const lit = pts.filter(([x, y]) => (x - lx) + (y - ly) < 0);
        if (lit.length >= 2) { poly([[lx, ly], ...lit]); ctx.fillStyle = 'rgba(70,68,68,0.45)'; ctx.fill(); }
      }
      // Cleat: the seam's natural fractures, two sets crossing
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 0.6*k;
      const ca = S(5)*Math.PI;
      for (let set = 0; set < 2; set++) {
        const a = ca + set*1.35, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
        ctx.beginPath();
        for (let c = -4; c <= 4; c++) {
          const o = c*9 + (S(220 + set*10 + c) - 0.5)*4;
          ctx.moveTo(X(50 + nx*o - dx*R), Y(50 + ny*o - dy*R));
          ctx.lineTo(X(50 + nx*o + dx*R), Y(50 + ny*o + dy*R));
        }
        ctx.stroke();
      }
      ctx.restore();

      // ── Loose lumps spilled round the rim ──────────────────────────────
      for (let i = 0; i < 10 + K.size*4; i++) {
        const a = S(300 + i)*Math.PI*2, d = R + 1 + S(310 + i)*8;
        const lx = 50 + Math.cos(a)*d, ly = 50 + Math.sin(a)*d*0.96, lr = 1 + S(320 + i)*2;
        const pts = [];
        for (let q = 0; q < 5; q++) { const qa = q/5*Math.PI*2 + S(330 + i)*1.2; pts.push([lx + Math.cos(qa)*lr*(0.7 + S(340 + i*5 + q)*0.4), ly + Math.sin(qa)*lr*(0.7 + S(345 + i*5 + q)*0.4)]); }
        poly(pts.map(([x, y]) => [x + 0.5, y + 0.7])); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
        poly(pts); ctx.fillStyle = '#1a1818'; ctx.fill();
      }

    }

    // ── Glints off fresh faces ─────────────────────────────────────────
    if (detail) for (let i = 0; i < 6 + K.size*3; i++) {
      const tw = Math.sin(t*2.2 + S(400 + i)*30);
      if (tw < 0.7) continue;
      const a = S(410 + i)*Math.PI*2, d = Math.sqrt(S(420 + i))*R*0.9;
      const gx = 50 + Math.cos(a)*d, gy = 50 + Math.sin(a)*d*0.96, al = ((tw - 0.7)*3.3).toFixed(3);
      ctx.fillStyle = `rgba(210,220,232,${al})`;
      ctx.fillRect(X(gx) - 0.8, Y(gy) - 0.8, 1.6, 1.6);
    }

    // ── Depletion: a dusty wash when it is nearly worked out ───────────
    if (pct < 0.3) {
      blob(50, 50, R, R*0.96, 0.14, 40, 18);
      ctx.fillStyle = `rgba(150,130,90,${(0.16*(1 - pct / 0.3)).toFixed(3)})`; ctx.fill();
    }

    // ── Tonnes left ────────────────────────────────────────────────────
    ctx.font = '7px Courier New';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(160,144,128,0.85)';
    ctx.fillText(`${Math.round(CoalSystem.coalLeft(e))}t`, px + 4, py + 11);
    ctx.restore();
  }

const OIL_FRAME = 1.25;   // a pool spans 1/OIL_FRAME of its oil_pool/oil_seep sprite (render_oil_pools.py)

function renderOilDeposit(e, px, py, t) {
    // Oil Deposit — a natural tar seep from above. A dark oil-soaked circle
    // round a black pool whose surface carries a slowly turning rainbow
    // sheen; gas bubbles swell and open into rings, smaller seeps weep out
    // between oil-stained rocks. The pool shrinks as the reservoir pressure
    // falls.
    const K = _depositKit(e, px, py);
    const { k, X, Y, S, blob, poly, ell, line, rock } = K;
    const detail = Camera.zoom > 0.5;
    const phase = e._oilPhase ?? S(96)*6.28;
    const pulse = 0.5 + 0.5*Math.sin(t*0.8 + phase);
    const pressure = e._pressure ?? 1;
    const fill = 0.62 + 0.38*Math.max(0, Math.min(1, pressure));
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // ── The oil-soaked ground ──────────────────────────────────────────
    // The photo-scanned mud of the patch below (deposit_ground.js) shows
    // through; here it is only soaked darker toward the seep, softly, with
    // no edge of its own.
    _dpHalo(K, '30,24,16', 0.75);
    {
      const sg = ctx.createRadialGradient(X(50), Y(54), 4*k, X(50), Y(54), 40*k);
      sg.addColorStop(0, 'rgba(8,6,3,0.6)'); sg.addColorStop(0.55, 'rgba(8,6,3,0.4)'); sg.addColorStop(1, 'rgba(8,6,3,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.ellipse(X(50), Y(54), 40*k, 36*k, 0, 0, Math.PI*2); ctx.fill();
    }

    // ── Oil-stained rocks round the seep ───────────────────────────────
    // Rendered from Poly Haven's rock_09 (img/rock_tar_*), a drawn rock while
    // they load.
    for (let i = 0; i < 3 + K.size; i++) {
      const a = S(200 + i)*Math.PI*2, d = 26 + S(210 + i)*8;
      const r = { x: 50 + Math.cos(a)*d, y: 54 + Math.sin(a)*d*0.8, r: 3.5 + S(220 + i)*3.5 };
      const sp = typeof PhotoGround !== 'undefined' ? PhotoGround.sprite('rock_tar', S(240 + i)) : null;
      if (sp) {
        const disp = r.r * 2 * PhotoGround.SPRITE_FRAME * k;
        ctx.drawImage(sp, X(r.x) - disp / 2, Y(r.y) - disp / 2, disp, disp);
      } else {
        rock(r.x, r.y, r.r, 230 + i*9, '#3a342a', '#5c5444', 'rgba(0,0,0,0.35)');
        ell(r.x - r.r*0.2, r.y - r.r*0.35, r.r*0.35, r.r*0.18); ctx.fillStyle = 'rgba(255,240,210,0.25)'; ctx.fill();   // wet gloss
      }
    }

    // ── Satellite seeps ────────────────────────────────────────────────
    // Rendered in Blender (img/oil_seep_*, scripts/render_oil_pools.py),
    // drawn blobs while they load.
    const PG = typeof PhotoGround !== 'undefined' ? PhotoGround : null;
    for (let i = 0; i < K.size - 1; i++) {
      const a = 0.4 + i*2.2 + S(300 + i)*0.8, d = 22 + S(310 + i)*6;
      const sx = 50 + Math.cos(a)*d, sy = 56 + Math.sin(a)*d*0.8, sr = (4 + S(320 + i)*2.5)*fill;
      blob(sx, sy, sr + 1.5, sr*0.7 + 1.2, 0.2, 330 + i*9, 10); ctx.fillStyle = 'rgba(8,6,4,0.4)'; ctx.fill();
      const sp = PG && PG.sprite('oil_seep', S(325 + i));
      if (sp) {
        const disp = sr*2*OIL_FRAME*k;
        ctx.drawImage(sp, X(sx) - disp/2, Y(sy) - disp/2, disp, disp);
      } else {
        blob(sx, sy, sr, sr*0.62, 0.2, 340 + i*9, 10); ctx.fillStyle = '#070504'; ctx.fill();
      }
    }

    // ── The main pool ──────────────────────────────────────────────────
    const pX = 46 + S(13)*8, pY = 56 + S(14)*6;
    const prx = 21*fill, pry = 14*fill;
    blob(pX, pY + 1.2, prx + 3.5, pry + 2.8, 0.14, 400, 14); ctx.fillStyle = 'rgba(6,4,2,0.6)'; ctx.fill();   // soaked margin
    // The crude itself: rendered in Blender (img/oil_pool_*, 1.5:1, glossy
    // black with the sky in it and a thin brown film at the shore;
    // scripts/render_oil_pools.py), scaled with the pool. A painted pool
    // while it loads.
    const pool = PG && PG.sprite('oil_pool', S(17));
    if (pool) {
      const disp = prx/1.5*2*1.5*OIL_FRAME*k;   // sprite: pool 3 units across in 3*OIL_FRAME
      ctx.drawImage(pool, X(pX) - disp/2, Y(pY) - disp/2, disp, disp);
    } else {
      blob(pX, pY, prx, pry, 0.14, 420, 14);
      const pg = ctx.createRadialGradient(X(pX - prx*0.3), Y(pY - pry*0.4), 0, X(pX), Y(pY), prx*1.1*k);
      pg.addColorStop(0, '#2a2016'); pg.addColorStop(0.45, '#0e0a06'); pg.addColorStop(1, '#030201');
      ctx.fillStyle = pg; ctx.fill();
    }

    // A trace of moving oil-film colour, slowly turning and shifting hue
    // (the render has the still sheen).
    ctx.save();
    blob(pX, pY, prx*0.85, pry*0.85, 0.14, 420, 14); ctx.clip();
    for (let b = 0; b < 3; b++) {
      const hue = (t*14 + b*80 + phase*40) % 360;
      const rot = t*0.05 + b*1.9 + phase;
      ctx.strokeStyle = `hsla(${hue.toFixed(0)},60%,55%,${(0.05 + 0.04*pulse).toFixed(3)})`;
      ctx.lineWidth = (1.8 - b*0.4)*k;
      ctx.beginPath();
      ctx.ellipse(X(pX + Math.cos(rot)*prx*0.18), Y(pY + Math.sin(rot)*pry*0.18), prx*(0.55 + b*0.16)*k, pry*(0.38 + b*0.12)*k, rot*0.6, 0.3, 2.6);
      ctx.stroke();
    }
    ctx.restore();

    // Gas bubbles: swell, then open into a spreading ring
    for (let b = 0; b < 2 + K.size; b++) {
      const cyc = (t*(0.22 + S(500 + b)*0.12) + S(510 + b)) % 1;
      const bx = pX + (S(520 + b) - 0.5)*prx*1.1, by = pY + (S(530 + b) - 0.5)*pry*0.9;
      if (cyc < 0.7) {
        const r = 0.6 + (cyc/0.7)*2.6;
        ell(bx, by, r, r*0.8); ctx.fillStyle = '#16100a'; ctx.fill();
        ell(bx - r*0.3, by - r*0.3, r*0.35, r*0.25); ctx.fillStyle = `hsla(${((t*30 + b*70) % 360).toFixed(0)},70%,70%,0.55)`; ctx.fill();
      } else if (detail) {
        const ph = (cyc - 0.7)/0.3;
        ctx.strokeStyle = `rgba(200,180,140,${((1 - ph)*0.55).toFixed(3)})`; ctx.lineWidth = 0.5*k;
        ctx.beginPath(); ctx.ellipse(X(bx), Y(by), (2.6 + ph*4.5)*k, (2.1 + ph*3.6)*k, 0, 0, Math.PI*2); ctx.stroke();
      }
    }

    ctx.restore();
  }

// The outcrop (radius 1) spans 1/URANIUM_FRAME of a uranium_ore sprite
// (scripts/render_uranium_ore.py FRAME).
const URANIUM_FRAME = 1.35;

function renderUraniumDeposit(e, px, py, t) {
    // Uranium Deposit — a pitchblende outcrop from above. A flat circle of
    // dark ore cracked through with glowing autunite veins, a few low ore
    // boulders, green crystal clusters lying open like rosettes, and a seep
    // pool that glows and rings with bubbles. Specks of the ore flicker.
    const K = _depositKit(e, px, py);
    const { k, X, Y, S, blob, ell, rock } = K;
    const detail = Camera.zoom > 0.5;
    const phase = e._uraniumPhase ?? S(99)*6.28;
    const pulse = 0.5 + 0.5*Math.sin(t*1.3 + phase);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    let g;
    // ── The outcrop ────────────────────────────────────────────────────
    // Rendered in Blender (img/uranium_ore_*, scripts/render_uranium_ore.py):
    // pitchblende with autunite in its cracks and granite grit round it.
    // Its glow is a second render of the same view with only the veins lit
    // (img/uranium_glow_*), added over it and pulsed, so the light sits in
    // the rendered cracks. The painted outcrop while they load.
    const PG = typeof PhotoGround !== 'undefined' ? PhotoGround : null;
    const vU = S(33);
    const ore = PG && PG.sprite('uranium_ore', vU), glow = PG && PG.sprite('uranium_glow', vU);
    if (ore && glow) {
      _dpHalo(K, '34,32,28', 0.5);
      const disp = 38*2*URANIUM_FRAME*k;
      ctx.drawImage(ore, X(50) - disp/2, Y(52) - disp/2, disp, disp);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3 + 0.35*pulse;
      ctx.drawImage(glow, X(50) - disp/2, Y(52) - disp/2, disp, disp);
      ctx.restore();
      // A faint green breath over the whole outcrop
      const og = ctx.createRadialGradient(X(50), Y(52), 0, X(50), Y(52), 40*k);
      og.addColorStop(0, `rgba(110,255,120,${(0.04 + 0.05*pulse).toFixed(3)})`); og.addColorStop(1, 'rgba(60,200,80,0)');
      ctx.fillStyle = og; blob(50, 52, 39, 36, 0.14, 30, 16); ctx.fill();
    } else {
      _dpHalo(K, '28,30,20', 0.75);
      blob(50, 52, 39, 36, 0.14, 30, 16);
      g = ctx.createRadialGradient(X(40), Y(42), 0, X(50), Y(52), 42*k);
      g.addColorStop(0, '#2c3226'); g.addColorStop(0.6, '#1c2018'); g.addColorStop(1, '#121510');
      ctx.fillStyle = g; ctx.fill();
      g = ctx.createRadialGradient(X(50), Y(50), 0, X(50), Y(50), 40*k);              // the ore's own glow
      g.addColorStop(0, `rgba(110,255,120,${(0.16 + 0.12*pulse).toFixed(3)})`); g.addColorStop(1, 'rgba(60,200,80,0)');
      ctx.fillStyle = g; blob(50, 52, 39, 36, 0.14, 30, 16); ctx.fill();

      // ── Glowing veins, branching out from the heart of the ore ─────────
      ctx.save();
      blob(50, 52, 39, 36, 0.14, 30, 16); ctx.clip();
      const veins = [];
      for (let c = 0; c < 5 + K.size; c++) {
        const a0 = S(40 + c)*Math.PI*2;
        let r = 3, a = a0;
        const pts = [[50 + Math.cos(a)*r, 51 + Math.sin(a)*r]];
        for (let s = 0; s < 6; s++) {
          r += 5.5; a += (S(45 + c*7 + s) - 0.5)*0.8;
          pts.push([50 + Math.cos(a)*r, 51 + Math.sin(a)*r*0.92]);
        }
        veins.push(pts);
      }
      for (const [lw, col] of [[3.2, `rgba(130,255,110,${(0.14 + 0.12*pulse).toFixed(3)})`], [0.9, `rgba(205,245,80,${(0.6 + 0.3*pulse).toFixed(3)})`]]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw*k;
        for (const pts of veins) {
          ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.stroke();
        }
      }
      ctx.restore();

      // ── Seep pool ──────────────────────────────────────────────────────
      const pX = 26 + S(5)*12, pY = 68 + S(6)*6;
      blob(pX, pY, 11, 7.5, 0.18, 80, 12); ctx.fillStyle = '#2c3a20'; ctx.fill();
      blob(pX, pY, 8.8, 5.8, 0.18, 80, 12); ctx.fillStyle = '#1f6a2c'; ctx.fill();
      ell(pX - 1, pY - 0.5, 5.5, 3.2); ctx.fillStyle = `rgba(150,255,140,${(0.25 + 0.3*pulse).toFixed(3)})`; ctx.fill();
      if (detail) for (let b = 0; b < 2; b++) {
        const ph = (t*0.6 + b*0.5 + S(7)) % 1;
        ctx.strokeStyle = `rgba(190,255,180,${((1 - ph)*0.6).toFixed(3)})`; ctx.lineWidth = 0.6*k;
        ctx.beginPath(); ctx.ellipse(X(pX - 3 + b*5), Y(pY + (b ? 1 : -1)), (0.8 + ph*3)*k, (0.6 + ph*2.2)*k, 0, 0, Math.PI*2); ctx.stroke();
      }

      // ── Low ore boulders ───────────────────────────────────────────────
      for (let i = 0; i < 3 + K.size; i++) {
        const a = S(100 + i)*Math.PI*2, d = 12 + S(120 + i)*20;
        const rx = 52 + Math.cos(a)*d, ry = 48 + Math.sin(a)*d*0.85, rr = 4 + S(140 + i)*4;
        const pts = rock(rx, ry, rr, 160 + i*9, '#343a32', '#4c5446', 'rgba(0,0,0,0.3)');
        const vein = 0.45 + 0.45*Math.sin(t*1.8 + i*1.7 + phase);
        const p0 = pts[Math.floor(S(180 + i)*6)], p1 = pts[(Math.floor(S(180 + i)*6) + 3) % 6];
        ctx.strokeStyle = `rgba(200,240,70,${vein.toFixed(3)})`; ctx.lineWidth = 0.8*k;
        ctx.beginPath(); ctx.moveTo(X(p0[0]*0.7 + rx*0.3), Y(p0[1]*0.7 + ry*0.3)); ctx.lineTo(X(rx), Y(ry)); ctx.lineTo(X(p1[0]*0.7 + rx*0.3), Y(p1[1]*0.7 + ry*0.3)); ctx.stroke();
      }

      // ── Crystal rosettes: hexagonal prism ends seen from above ─────────
      for (let c = 0; c < 2 + K.size; c++) {
        const cx = 50 + (S(200 + c) - 0.5)*46, cy = 50 + (S(210 + c) - 0.5)*32;
        const flick = 0.55 + 0.45*Math.sin(t*2.1 + c*2.3 + phase);
        ell(cx, cy, 8, 7); ctx.fillStyle = `rgba(90,255,110,${(0.10 + 0.10*flick).toFixed(3)})`; ctx.fill();
        for (let p = 0; p < 6; p++) {
          const a = p/6*Math.PI*2 + S(220 + c)*1.0, d = p === 0 ? 0 : 2.6 + S(230 + c*6 + p)*1.6;
          const hx = cx + Math.cos(a)*d, hy = cy + Math.sin(a)*d, hr = 1.4 + S(240 + c*6 + p)*1.2;
          const hex = []; for (let q = 0; q < 6; q++) { const qa = q/6*Math.PI*2 + a; hex.push([hx + Math.cos(qa)*hr, hy + Math.sin(qa)*hr]); }
          K.poly(hex); ctx.fillStyle = `rgba(50,190,80,${(0.8 + 0.15*flick).toFixed(3)})`; ctx.fill();
          K.poly([[hx, hy], hex[3], hex[4], hex[5]]); ctx.fillStyle = `rgba(190,255,190,${(0.5 + 0.35*flick).toFixed(3)})`; ctx.fill();
        }
      }

    }

    // ── Flickering specks of ore ───────────────────────────────────────
    if (detail) for (let m = 0; m < (ore ? 3 + K.size : 6 + K.size*2); m++) {
      const tw = Math.sin(t*1.7 + S(300 + m)*25);
      if (tw < 0.5) continue;
      const a = S(310 + m)*Math.PI*2, d = Math.sqrt(S(320 + m))*34;
      ell(50 + Math.cos(a)*d, 52 + Math.sin(a)*d*0.9, 0.8, 0.8);
      ctx.fillStyle = `rgba(170,255,160,${((tw - 0.5)*1.8).toFixed(3)})`; ctx.fill();
    }

    ctx.restore();
  }

// The fumarole field (radius 1) spans 1/SULFUR_FRAME of a sulfur_field
// sprite; SULFUR_VENTS is each variant's vents [x, y, r] and pool [x, y, r]
// in field units (+y down the screen), as printed by
// scripts/render_sulfur_vents.py. Re-render → paste the new table here.
const SULFUR_FRAME = 1.3;
const SULFUR_VENTS = [{"vents": [[0.017, -0.379, 0.153], [0.491, -0.166, 0.12], [0.164, 0.272, 0.121]], "pool": [-0.493, 0.289, 0.2]}, {"vents": [[0.16, -0.488, 0.108], [0.48, -0.059, 0.094], [0.155, 0.25, 0.105]], "pool": [-0.528, 0.376, 0.2]}, {"vents": [[0.06, -0.502, 0.144], [0.401, -0.09, 0.128], [0.27, 0.248, 0.134]], "pool": [-0.458, 0.379, 0.2]}, {"vents": [[0.043, -0.471, 0.127], [0.539, -0.052, 0.1], [0.335, 0.29, 0.117]], "pool": [-0.497, 0.309, 0.2]}];
const SULFUR_R = 40;   // the field's radius in the deposit kit's 100-unit square
// Which rendered field a sulfur deposit shows, and where its vents and
// pool are in world px (also used by GeoSteam for the steam).
function _sulfurField(e) {
  const S = (n) => { const x = Math.sin((e.col || 0)*127.1 + (e.row || 0)*311.7 + n*74.3)*43758.5453; return x - Math.floor(x); };
  const u = S(35), v = Math.min(3, Math.floor(u*4));
  const k = (e.width || 2)*TILE/100, ox = e.col*TILE, oy = e.row*TILE;
  const tb = SULFUR_VENTS[v];
  const at = ([x, y, r]) => ({ x: ox + (50 + x*SULFUR_R)*k, y: oy + (52 + y*SULFUR_R)*k, r: r*SULFUR_R*k });
  return { u, vents: tb.vents.map(at), pool: at(tb.pool) };
}

function renderSulfurDeposit(e, px, py, t) {
    // Sulfur Deposit — a fumarole field from above. A pale, cracked crust
    // stained orange round the vents; bright yellow sulfur encrusts each
    // vent, its needle crystals lying out round the rim like a star, the
    // vents breathe steam that spreads and thins over them, and a turquoise
    // hot spring bubbles inside orange mineral terraces.
    const K = _depositKit(e, px, py);
    const { k, X, Y, S, blob, poly, ell, line, rock } = K;
    const detail = Camera.zoom > 0.5;
    const phase = e._sulfurPhase ?? S(98)*6.28;
    const pulse = 0.5 + 0.5*Math.sin(t*1.1 + phase);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // Rendered in Blender (img/sulfur_field_*, scripts/render_sulfur_vents.py):
    // bleached crust, iron staining, sulphur-crusted vents with crystals, a
    // milky acid pool. The vents' steam is GeoSteam's (render_geothermal.js),
    // over the finished scene; here only the throats' heat, the pool's
    // bubbles and a glint. The painted field while it loads.
    const PG = typeof PhotoGround !== 'undefined' ? PhotoGround : null;
    const fld = _sulfurField(e);
    const fsp = PG && PG.sprite('sulfur_field', fld.u);
    if (fsp) {
      _dpHalo(K, '96,92,78', 0.45);
      const disp = SULFUR_R*2*SULFUR_FRAME*k;
      ctx.drawImage(fsp, X(50) - disp/2, Y(52) - disp/2, disp, disp);
      for (const v of fld.vents) {                         // heat shimmering in each throat
        const hg = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, v.r*0.45);
        hg.addColorStop(0, `rgba(255,150,40,${(0.12 + 0.14*pulse).toFixed(3)})`); hg.addColorStop(1, 'rgba(255,150,40,0)');
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(v.x, v.y, v.r*0.45, 0, Math.PI*2); ctx.fill();
      }
      if (detail) for (let b = 0; b < 3; b++) {           // bubbles rising in the pool
        const ph = (t*0.8 + b/3 + S(9)) % 1, p = fld.pool;
        const bx = p.x + (S(700 + b) - 0.5)*p.r*0.9, by = p.y + (S(710 + b) - 0.5)*p.r*0.6;
        ctx.strokeStyle = `rgba(230,250,245,${((1 - ph)*0.45).toFixed(3)})`; ctx.lineWidth = 0.5*k;
        ctx.beginPath(); ctx.ellipse(bx, by, (0.6 + ph*2.4)*k, (0.5 + ph*1.8)*k, 0, 0, Math.PI*2); ctx.stroke();
      }
      if (detail && Math.sin(t*2.6 + phase) > 0.9) {       // a glint off a crystal
        const gv = fld.vents[Math.floor(t*0.35) % fld.vents.length];
        const gx = gv.x + gv.r*0.5, gy = gv.y - gv.r*0.5, L = 2*k;
        ctx.strokeStyle = 'rgba(255,255,230,0.9)'; ctx.lineWidth = 0.5*k;
        ctx.beginPath(); ctx.moveTo(gx - L, gy); ctx.lineTo(gx + L, gy); ctx.moveTo(gx, gy - L); ctx.lineTo(gx, gy + L); ctx.stroke();
      }
    } else {
      // ── Crust ──────────────────────────────────────────────────────────
      _dpHalo(K, '70,64,44', 0.7);
      blob(50, 52, 40, 37, 0.13, 32, 16); ctx.fillStyle = '#6a654a'; ctx.fill();
      if (detail) {
        ctx.strokeStyle = 'rgba(40,34,20,0.45)'; ctx.lineWidth = 0.6*k;       // polygonal crust cracks
        ctx.beginPath();
        for (let c = 0; c < 10 + K.size*3; c++) {
          const x = 18 + S(20 + c)*64, y = 20 + S(40 + c)*62;
          ctx.moveTo(X(x), Y(y)); ctx.lineTo(X(x + (S(60 + c) - 0.5)*14), Y(y + (S(80 + c) - 0.5)*12));
        }
        ctx.stroke();
      }

      // Vents, spread on a jittered arc round the upper right so they never pile up
      const vents = [], nV = 1 + K.size;
      for (let v = 0; v < nV; v++) {
        const a = -1.35 + (nV === 1 ? 1.2 : v / (nV - 1)*2.4) + (S(100 + v) - 0.5)*0.35;
        const d = 22 + S(110 + v)*8;
        vents.push({ x: 52 + Math.cos(a)*d, y: 46 + Math.sin(a)*d*0.85, r: (7 + S(120 + v)*3.5)*(K.size >= 4 ? 0.85 : 1), v });
      }
      for (const vt of vents) {                                             // iron/orange staining
        blob(vt.x, vt.y + 1, vt.r*1.9, vt.r*1.6, 0.2, 130 + vt.v*10, 12); ctx.fillStyle = 'rgba(170,96,30,0.35)'; ctx.fill();
      }

      // ── Hot spring in its terraces ─────────────────────────────────────
      const sX = 26 + S(7)*8, sY = 62 + S(8)*10;
      blob(sX, sY, 19, 13, 0.14, 200, 14); ctx.fillStyle = '#b8742a'; ctx.fill();
      blob(sX, sY - 0.5, 16, 10.6, 0.14, 214, 14); ctx.fillStyle = '#e0b454'; ctx.fill();
      blob(sX, sY - 1, 13, 8.4, 0.16, 228, 14); ctx.fillStyle = '#2f9aa4'; ctx.fill();
      ell(sX - 1, sY - 1.5, 8, 4.4); ctx.fillStyle = `rgba(170,235,225,${(0.45 + 0.2*pulse).toFixed(3)})`; ctx.fill();
      ell(sX - 3, sY - 3, 3, 1.4); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
      for (let b = 0; b < 3; b++) {
        const ph = (t*0.8 + b/3 + S(9)) % 1;
        ctx.strokeStyle = `rgba(230,255,250,${((1 - ph)*0.7).toFixed(3)})`; ctx.lineWidth = 0.6*k;
        ctx.beginPath(); ctx.ellipse(X(sX - 5 + b*5), Y(sY - 1 + (b % 2)), (0.8 + ph*3)*k, (0.6 + ph*2.2)*k, 0, 0, Math.PI*2); ctx.stroke();
      }

      // ── Bleached rocks ─────────────────────────────────────────────────
      for (let i = 0; i < 2 + K.size; i++) {
        const a = S(300 + i)*Math.PI*2;
        rock(50 + Math.cos(a)*30, 54 + Math.sin(a)*26, 4 + S(310 + i)*3.5, 320 + i*7, '#8a8470', '#b0aa92', 'rgba(0,0,0,0.25)');
      }

      // ── Vents: sulfur crust, a star of needle crystals, dark throat ────
      for (const vt of vents) {
        blob(vt.x, vt.y, vt.r*1.25, vt.r*1.15, 0.25, 400 + vt.v*13, 12); ctx.fillStyle = '#d8b828'; ctx.fill();
        blob(vt.x, vt.y - 0.3, vt.r*0.95, vt.r*0.88, 0.25, 420 + vt.v*13, 12); ctx.fillStyle = '#f4dc40'; ctx.fill();
        for (let n = 0; n < 11; n++) {                                    // needles lying out round the rim
          const a = n/11*Math.PI*2 + S(440 + vt.v*11 + n)*0.4;
          const r0 = vt.r*0.5, len = 2.5 + S(460 + vt.v*11 + n)*4.5;
          const bx = vt.x + Math.cos(a)*r0, by = vt.y + Math.sin(a)*r0;
          const nx = -Math.sin(a)*0.8, ny = Math.cos(a)*0.8;
          poly([[bx + nx, by + ny], [bx + Math.cos(a)*len, by + Math.sin(a)*len], [bx - nx, by - ny]]);
          ctx.fillStyle = n % 3 ? '#fff27a' : '#e8c430'; ctx.fill();
        }
        ell(vt.x, vt.y, vt.r*0.38, vt.r*0.34); ctx.fillStyle = '#2a2014'; ctx.fill();
        ell(vt.x, vt.y, vt.r*0.22, vt.r*0.2); ctx.fillStyle = `rgba(255,150,40,${(0.25 + 0.3*pulse).toFixed(3)})`; ctx.fill();   // hot throat
      }

      // Loose yellow crust patches
      for (let p = 0; p < 4 + K.size*2; p++) {
        const x = 20 + S(500 + p)*62, y = 24 + S(520 + p)*58;
        blob(x, y, 2 + S(540 + p)*2.5, 1.8 + S(560 + p)*2, 0.3, 580 + p*7, 8);
        ctx.fillStyle = p % 3 ? 'rgba(240,210,60,0.85)' : 'rgba(255,240,120,0.9)'; ctx.fill();
      }

      // ── Steam spreading out over the vents and the spring ──────────────
      // Seen from above, a plume is a soft puff that swells and thins where
      // it stands, drifting a little downwind.
      const puffs = detail ? 4 : 2;
      const steam = (x, y, scale, speed, seed, tint) => {
        for (let q = 0; q < puffs; q++) {
          const ph = (t*speed + q/puffs + S(seed)) % 1;
          const dx = x + ph*6 + Math.sin(t*0.7 + q*1.3 + seed)*1.2, dy = y + ph*2;
          const r = (2.5 + ph*9)*scale;
          const sg = ctx.createRadialGradient(X(dx), Y(dy), 0, X(dx), Y(dy), r*k);
          sg.addColorStop(0, `rgba(${tint},${((1 - ph)*Math.min(1, ph*6)*0.45).toFixed(3)})`); sg.addColorStop(1, `rgba(${tint},0)`);
          ctx.fillStyle = sg; ell(dx, dy, r, r); ctx.fill();
        }
      };
      for (const vt of vents) steam(vt.x, vt.y, 0.7 + vt.r*0.04, 0.32 + S(600 + vt.v)*0.1, 610 + vt.v, vt.v % 2 ? '246,242,214' : '250,246,200');
      steam(sX, sY - 1, 0.6, 0.22, 620, '236,248,246');

      // Occasional glint on a crystal
      if (detail) {
        const gv = vents[Math.floor(t*0.35) % vents.length];
        if (Math.sin(t*2.6 + phase) > 0.9) {
          line(gv.x + gv.r*0.6 - 2.5, gv.y - gv.r*0.6, gv.x + gv.r*0.6 + 2.5, gv.y - gv.r*0.6, 'rgba(255,255,230,0.95)', 0.6);
          line(gv.x + gv.r*0.6, gv.y - gv.r*0.6 - 2.5, gv.x + gv.r*0.6, gv.y - gv.r*0.6 + 2.5, 'rgba(255,255,230,0.95)', 0.6);
        }
      }

    }

    ctx.restore();
  }

// The salar (radius 1) spans 1/LITHIUM_FRAME of a salar sprite;
// LITHIUM_PANS is each variant's brine pans [x, y, rx, ry] and pegmatite
// outcrop [x, y] in field units (+y down the screen), as printed by
// scripts/render_salar.py. Re-render → paste the new table here.
const LITHIUM_FRAME = 1.3;
const LITHIUM_PANS = [{"pans": [[0.186, 0.516, 0.234, 0.165], [-0.528, 0.276, 0.209, 0.156], [-0.281, -0.306, 0.238, 0.166]], "out": [0.379, -0.364]}, {"pans": [[0.166, 0.434, 0.211, 0.164], [-0.534, 0.266, 0.237, 0.169], [-0.303, -0.316, 0.207, 0.13]], "out": [0.368, -0.301]}, {"pans": [[0.166, 0.475, 0.25, 0.14], [-0.492, 0.254, 0.22, 0.149], [-0.332, -0.334, 0.251, 0.141]], "out": [0.414, -0.439]}, {"pans": [[0.214, 0.491, 0.216, 0.166], [-0.521, 0.25, 0.228, 0.145], [-0.273, -0.351, 0.239, 0.163]], "out": [0.332, -0.397]}];

function renderLithiumDeposit(e, px, py, t) {
    // Lithium Deposit — a salar from above. A pale salt crust cracked into
    // polygons, a chain of turquoise brine pans, each a different shade as
    // it evaporates, ringed in white salt; and a pegmatite outcrop where
    // pale spodumene laths and lilac lepidolite lie broken out of the rock.
    // Light rolls slowly across the brine and salt crystals twinkle.
    const K = _depositKit(e, px, py);
    const { k, X, Y, S, blob, poly, ell, line, rock } = K;
    const detail = Camera.zoom > 0.5;
    const phase = e._lithiumPhase ?? S(97)*6.28;
    const pulse = 0.5 + 0.5*Math.sin(t*0.9 + phase);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // Rendered in Blender (img/salar_*, scripts/render_salar.py): salt crust
    // grown into polygon ridges, brine pans at different stages of
    // evaporation, a pegmatite outcrop with spodumene and lepidolite. Drawn
    // over it: light rolling slowly across the brine, a glint off a lath and
    // salt crystals twinkling. The painted salar while it loads.
    const PG = typeof PhotoGround !== 'undefined' ? PhotoGround : null;
    const uL = S(38), fsp = PG && PG.sprite('salar', uL);
    if (fsp) {
      _dpHalo(K, '170,168,160', 0.35);
      const R = 41, disp = R*2*LITHIUM_FRAME*k;
      ctx.drawImage(fsp, X(50) - disp/2, Y(52) - disp/2, disp, disp);
      const tb = LITHIUM_PANS[Math.min(3, Math.floor(uL*4))];
      tb.pans.forEach(([qx, qy, qrx, qry], i) => {
        const p = { x: 50 + qx*R, y: 52 + qy*R, rx: qrx*R*0.95, ry: qry*R*0.95 };
        ctx.save();
        ctx.beginPath(); ctx.ellipse(X(p.x), Y(p.y), p.rx*k, p.ry*k, 0, 0, Math.PI*2); ctx.clip();
        const sweep = ((t*0.06 + S(980 + i)) % 1)*(p.rx*2 + 12) - p.rx - 6;
        poly([[p.x + sweep - 3, p.y - p.ry], [p.x + sweep + 1, p.y - p.ry], [p.x + sweep - 2, p.y + p.ry], [p.x + sweep - 6, p.y + p.ry]]);
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
        ctx.restore();
      });
      if (Math.sin(t*1.9 + phase) > 0.9) {
        const gx = 50 + tb.out[0]*R + (S(1160) - 0.5)*10, gy = 52 + tb.out[1]*R + (S(1161) - 0.5)*8;
        line(gx - 2.4, gy, gx + 2.4, gy, 'rgba(255,255,255,0.95)', 0.5);
        line(gx, gy - 2.4, gx, gy + 2.4, 'rgba(255,255,255,0.95)', 0.5);
      }
      if (detail) for (let m = 0; m < 5 + K.size*2; m++) {
        const tw = Math.sin(t*2.4 + S(1300 + m)*20);
        if (tw < 0.6) continue;
        const x = 18 + S(1310 + m)*64, y = 22 + S(1320 + m)*60, a = ((tw - 0.6)*2.5).toFixed(3);
        line(x - 1.4, y, x + 1.4, y, `rgba(255,255,255,${a})`, 0.4);
        line(x, y - 1.4, x, y + 1.4, `rgba(255,255,255,${a})`, 0.4);
      }
    } else {
      // ── Salt crust ─────────────────────────────────────────────────────
      _dpHalo(K, '150,148,138', 0.6);
      blob(50, 52, 41, 38, 0.12, 34, 16); ctx.fillStyle = '#d6d2c4'; ctx.fill();
      if (detail) {
        ctx.save();
        blob(50, 52, 41, 38, 0.12, 34, 16); ctx.clip();
        ctx.strokeStyle = 'rgba(130,120,100,0.40)'; ctx.lineWidth = 0.55*k;    // polygonal salt cracks
        ctx.beginPath();
        const cell = 11;
        for (let gy = 0; gy < 11; gy++) for (let gx = 0; gx < 11; gx++) {
          const cx = gx*cell + (gy % 2)*cell*0.5 + (S(700 + gx*13 + gy)*4 - 2);
          const cy = gy*cell*0.87 + (S(800 + gx + gy*17)*4 - 2);
          for (let s = 0; s < 3; s++) {                                       // three spokes make a hex net
            const a = s*2.094 + Math.PI/6;
            ctx.moveTo(X(cx), Y(cy)); ctx.lineTo(X(cx + Math.cos(a)*cell*0.58), Y(cy + Math.sin(a)*cell*0.58));
          }
        }
        ctx.stroke();
        ctx.restore();
      }

      // ── Brine pans, evaporating at different stages ────────────────────
      const SHADES = [['#1f8f9a', '#4fc0c0'], ['#3aa8a0', '#7ed6c4'], ['#7cc8b4', '#b8ead8'], ['#2a7fae', '#5fb2d6']];
      const pans = [], nP = 1 + K.size;
      for (let i = 0; i < nP; i++) {
        const a = 1.25 + (nP === 1 ? 1.4 : i/(nP - 1)*2.9) + (S(900 + i) - 0.5)*0.15;
        const d = 23 + S(910 + i)*5;
        pans.push({ x: 50 + Math.cos(a)*d, y: 54 + Math.sin(a)*d*0.8, rx: 11 - K.size*1.1 + S(920 + i)*2, ry: 7.5 - K.size*0.5 + S(930 + i)*1.5, i });
      }
      for (const p of pans) {
        const [deep, lite] = SHADES[(p.i + Math.floor(S(940)*4)) % SHADES.length];
        blob(p.x, p.y + 0.8, p.rx + 2.6, p.ry + 2.2, 0.16, 950 + p.i*11, 12); ctx.fillStyle = 'rgba(90,84,70,0.35)'; ctx.fill();   // damp margin
        blob(p.x, p.y, p.rx + 1.8, p.ry + 1.5, 0.16, 950 + p.i*11, 12); ctx.fillStyle = '#f4f2ea'; ctx.fill();                  // salt rim
        blob(p.x, p.y, p.rx, p.ry, 0.16, 970 + p.i*11, 12); ctx.fillStyle = deep; ctx.fill();
        ell(p.x - p.rx*0.15, p.y - p.ry*0.2, p.rx*0.62, p.ry*0.5); ctx.fillStyle = lite; ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
        ctx.save();
        blob(p.x, p.y, p.rx, p.ry, 0.16, 970 + p.i*11, 12); ctx.clip();
        const sweep = ((t*0.06 + S(980 + p.i)) % 1)*(p.rx*2 + 12) - p.rx - 6;
        poly([[p.x + sweep - 3, p.y - p.ry], [p.x + sweep + 1, p.y - p.ry], [p.x + sweep - 2, p.y + p.ry], [p.x + sweep - 6, p.y + p.ry]]);
        ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
        ctx.restore();
        if (detail) {                                                         // wind ripple rings
          const ph = (t*0.35 + S(990 + p.i)) % 1;
          ctx.strokeStyle = `rgba(230,255,250,${((1 - ph)*0.5).toFixed(3)})`; ctx.lineWidth = 0.5*k;
          ctx.beginPath(); ctx.ellipse(X(p.x + p.rx*0.2), Y(p.y + p.ry*0.1), (1 + ph*5)*k, (0.8 + ph*3)*k, 0, 0, Math.PI*2); ctx.stroke();
        }
      }

      // ── Pegmatite outcrop: low boulders with mica flecks ───────────────
      const oX = 64 + S(11)*8, oY = 36 + S(12)*6;
      for (let i = 0; i < 3 + K.size; i++) {
        const a = S(1000 + i)*Math.PI*2, d = Math.sqrt(S(1010 + i))*12;
        const bx = oX + Math.cos(a)*d, by = oY + Math.sin(a)*d*0.8, br = 4 + S(1020 + i)*3.5;
        rock(bx, by, br, 1030 + i*9, '#6e6878', i % 2 ? '#a89cb8' : '#9a98a4', 'rgba(40,36,30,0.3)');
        if (detail && i % 2 === 0) {
          for (let f = 0; f < 3; f++) {
            ell(bx + (S(1040 + i*3 + f) - 0.5)*br*1.1, by + (S(1050 + i*3 + f) - 0.5)*br*0.8, 0.9, 0.7);
            ctx.fillStyle = 'rgba(215,170,225,0.9)'; ctx.fill();
          }
        }
      }
      // Spodumene laths lying round the outcrop, a few pink (kunzite)
      const laths = 4 + K.size;
      for (let p = 0; p < laths; p++) {
        const a = p/laths*Math.PI*2 + S(1100 + p)*0.6;
        const d = 9 + S(1110 + p)*7;
        const lx = oX + Math.cos(a)*d, ly = oY + Math.sin(a)*d*0.8;
        const kunzite = S(1150 + p) < 0.3;
        const flick = 0.6 + 0.4*Math.sin(t*1.6 + p*1.9 + phase);
        _dpLath(K, lx, ly, a + (S(1120 + p) - 0.5)*0.8, 7 + S(1130 + p)*6, 1.3 + S(1140 + p)*0.6,
          kunzite ? '#c890c8' : '#c4d4cc',
          kunzite ? `rgba(245,205,245,${(0.75 + 0.2*flick).toFixed(3)})` : `rgba(240,250,246,${(0.8 + 0.2*flick).toFixed(3)})`);
      }
      if (detail) {                                                           // cool glow off the crystals
        const g = ctx.createRadialGradient(X(oX), Y(oY), 0, X(oX), Y(oY), 20*k);
        g.addColorStop(0, `rgba(210,240,255,${(0.12 + 0.10*pulse).toFixed(3)})`); g.addColorStop(1, 'rgba(210,240,255,0)');
        ctx.fillStyle = g; ell(oX, oY, 20, 18); ctx.fill();
      }
      if (Math.sin(t*1.9 + phase) > 0.9) {                                    // glint on a lath
        const gx = oX + (S(1160) - 0.5)*14, gy = oY + (S(1161) - 0.5)*10;
        line(gx - 3, gy, gx + 3, gy, 'rgba(255,255,255,0.95)', 0.6);
        line(gx, gy - 3, gx, gy + 3, 'rgba(255,255,255,0.95)', 0.6);
      }

      // ── Salt crystal crusts and twinkles ───────────────────────────────
      for (let c = 0; c < 6 + K.size*3; c++) {
        const x = 16 + S(1200 + c)*68, y = 20 + S(1210 + c)*64;
        if (Math.hypot(x - oX, (y - oY)*1.3) < 18) continue;                   // keep off the outcrop
        const sz = 1.2 + S(1220 + c)*1.6;
        poly([[x - sz, y], [x, y - sz], [x + sz, y], [x, y + sz]]); ctx.fillStyle = '#fbfaf4'; ctx.fill();
        poly([[x, y - sz], [x + sz, y], [x, y + sz]]); ctx.fillStyle = 'rgba(160,170,180,0.35)'; ctx.fill();
      }
      if (detail) for (let m = 0; m < 5 + K.size*2; m++) {
        const tw = Math.sin(t*2.4 + S(1300 + m)*20);
        if (tw < 0.6) continue;
        const x = 18 + S(1310 + m)*64, y = 22 + S(1320 + m)*60, a = ((tw - 0.6)*2.5).toFixed(3);
        line(x - 1.6, y, x + 1.6, y, `rgba(255,255,255,${a})`, 0.45);
        line(x, y - 1.6, x, y + 1.6, `rgba(255,255,255,${a})`, 0.45);
      }

    }

    ctx.restore();
  }

// The gas field (radius 1) spans 1/HELIUM_FRAME of a helium_field sprite;
// HELIUM_POOLS is each variant's seeps [x, y, rx, ry] in field units (+y
// down the screen), as printed by scripts/render_helium_seeps.py.
// Re-render → paste the new table here.
const HELIUM_FRAME = 1.3;
const HELIUM_POOLS = [[[0.079, 0.231, 0.144, 0.08], [-0.505, 0.253, 0.124, 0.082], [-0.465, -0.172, 0.124, 0.092]], [[0.118, -0.035, 0.149, 0.116], [-0.382, 0.098, 0.142, 0.114], [0.332, 0.3, 0.126, 0.089]], [[-0.14, 0.017, 0.149, 0.092], [0.291, 0.25, 0.143, 0.095], [-0.139, 0.479, 0.136, 0.116]], [[0.064, 0.452, 0.135, 0.087], [0.211, -0.21, 0.104, 0.113], [-0.137, -0.009, 0.126, 0.115]]];

function renderHeliumDeposit(e, px, py, t) {
    // Helium Gas Field — from above: a circle of sour, gas-bleached ground
    // over a leaky gas pocket. Bubbling seep pools, frost-rimmed where the
    // expanding gas chills the mud; pale lilac haze pooling and thinning
    // over the vents.
    const K = _depositKit(e, px, py);
    const { k, X, Y, S, blob, ell, line, rock } = K;
    const detail = Camera.zoom > 0.5;
    const phase = e._heliumPhase ?? S(97)*6.28;
    const pulse = 0.5 + 0.5*Math.sin(t*1.1 + phase);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // Rendered in Blender (img/helium_field_*, scripts/render_helium_seeps.py):
    // cracked, gas-bleached clay with muddy seeps frosted round where the
    // expanding gas chills them. Drawn over it: bubbles breaking in the
    // seeps and a faint cold mist over them. The painted field while it loads.
    const PG = typeof PhotoGround !== 'undefined' ? PhotoGround : null;
    const uH = S(36), fsp = PG && PG.sprite('helium_field', uH);
    if (fsp) {
      _dpHalo(K, '120,116,108', 0.4);
      const R = 40, disp = R*2*HELIUM_FRAME*k;
      ctx.drawImage(fsp, X(50) - disp/2, Y(52) - disp/2, disp, disp);
      const seeps = HELIUM_POOLS[Math.min(3, Math.floor(uH*4))].map(([x, y, rx, ry], i) => ({ x: 50 + x*R, y: 52 + y*R, rx: rx*R, ry: ry*R, i }));
      if (detail) for (const p of seeps) for (let b = 0; b < 3; b++) {
        const ph = (t*0.7 + S(580 + p.i*5 + b)) % 1;
        const bx = p.x + (S(590 + p.i*5 + b) - 0.5)*p.rx, by = p.y + (S(600 + p.i*5 + b) - 0.5)*p.ry*0.8;
        ctx.strokeStyle = `rgba(225,225,220,${((1 - ph)*0.55).toFixed(3)})`; ctx.lineWidth = 0.45*k;
        ctx.beginPath(); ctx.ellipse(X(bx), Y(by), (0.5 + ph*2.2)*k, (0.4 + ph*1.8)*k, 0, 0, Math.PI*2); ctx.stroke();
      }
      if (detail) for (const p of seeps) for (let q = 0; q < 2; q++) {     // cold mist, low and thin
        const ph = (t*0.12 + q/2 + S(800 + p.i)) % 1;
        const sx = p.x + ph*5, sy = p.y + ph*1.5, r = p.rx*(0.8 + ph*1.4);
        const g = ctx.createRadialGradient(X(sx), Y(sy), 0, X(sx), Y(sy), r*k);
        g.addColorStop(0, `rgba(236,240,246,${(0.2*(1 - ph)*Math.min(1, ph*5)).toFixed(3)})`); g.addColorStop(1, 'rgba(236,240,246,0)');
        ctx.fillStyle = g; ell(sx, sy, r, r); ctx.fill();
      }
    } else {
      // ── Bleached ground ──
      _dpHalo(K, '90,84,72', 0.7);
      blob(50, 52, 40, 37, 0.14, 36, 16); ctx.fillStyle = '#8c8676'; ctx.fill();
      if (detail) {                                                            // mud-crack net
        ctx.save(); blob(50, 52, 40, 37, 0.14, 36, 16); ctx.clip();
        ctx.strokeStyle = 'rgba(60,54,48,0.35)'; ctx.lineWidth = 0.5*k; ctx.beginPath();
        for (let c = 0; c < 14 + K.size*3; c++) {
          const x = 14 + S(40 + c)*72, y = 16 + S(60 + c)*70;
          ctx.moveTo(X(x), Y(y)); ctx.lineTo(X(x + (S(80 + c) - 0.5)*12), Y(y + (S(100 + c) - 0.5)*12));
        }
        ctx.stroke(); ctx.restore();
      }

      // ── Seep pools ──
      const pools = [];
      for (let i = 0; i < 1 + K.size; i++) {
        const a = S(500 + i)*Math.PI*2, d = 8 + S(510 + i)*18;
        pools.push({ x: 50 + Math.cos(a)*d, y: 54 + Math.sin(a)*d*0.8, rx: 7 + S(520 + i)*4 - K.size*0.6, ry: 5.5 + S(530 + i)*2, i });
      }
      for (const p of pools) {
        blob(p.x, p.y, p.rx + 2.2, p.ry + 1.8, 0.18, 540 + p.i*7, 12); ctx.fillStyle = '#e8eef4'; ctx.fill();      // frost rim
        blob(p.x, p.y, p.rx, p.ry, 0.18, 560 + p.i*7, 12); ctx.fillStyle = '#2e2a38'; ctx.fill();                   // dark mud water
        ell(p.x - p.rx*0.2, p.y - p.ry*0.25, p.rx*0.55, p.ry*0.45); ctx.fillStyle = 'rgba(150,120,190,0.35)'; ctx.fill();
        for (let b = 0; b < 3; b++) {                                                                                // bubbles opening into rings
          const ph = (t*0.7 + S(580 + p.i*5 + b)) % 1;
          const bx = p.x + (S(590 + p.i*5 + b) - 0.5)*p.rx*1.1, by = p.y + (S(600 + p.i*5 + b) - 0.5)*p.ry*0.9;
          ctx.strokeStyle = `rgba(235,220,255,${((1 - ph)*0.8).toFixed(3)})`; ctx.lineWidth = 0.5*k;
          ctx.beginPath(); ctx.ellipse(X(bx), Y(by), (0.6 + ph*2.6)*k, (0.5 + ph*2.1)*k, 0, 0, Math.PI*2); ctx.stroke();
        }
      }

      // ── A few pale rocks ──
      for (let i = 0; i < 2 + K.size; i++) {
        rock(20 + S(700 + i)*60, 24 + S(710 + i)*56, 3 + S(720 + i)*3, 730 + i*9, '#6c6862', '#a8a49c', 'rgba(0,0,0,0.3)');
      }

      // ── Lilac haze pooling over the vents ──
      if (detail) {
        for (let i = 0; i < 4 + K.size; i++) {
          const ph = (t*0.16 + S(800 + i)) % 1;
          const sx = 24 + S(810 + i)*52 + ph*5, sy = 30 + S(820 + i)*44 + ph*2;
          const r = 4 + ph*10;
          const g = ctx.createRadialGradient(X(sx), Y(sy), 0, X(sx), Y(sy), r*k);
          g.addColorStop(0, `rgba(230,200,255,${(0.26*(1 - ph)*Math.min(1, ph*5)).toFixed(3)})`); g.addColorStop(1, 'rgba(230,200,255,0)');
          ctx.fillStyle = g; ell(sx, sy, r, r); ctx.fill();
        }
      }

    }

    ctx.restore();
}

// The mineral sand (radius 1) spans 1/RARE_FRAME of a mineral_sand sprite;
// RARE_POOLS is each variant's wash pool [x, y, rx, ry] in field units (+y
// down the screen), as printed by scripts/render_mineral_sand.py.
// Re-render → paste the new table here.
const RARE_FRAME = 1.3;
const RARE_POOLS = [[0.53, 0.305, 0.228, 0.154], [0.399, 0.386, 0.212, 0.139], [0.361, 0.41, 0.221, 0.159], [0.473, 0.378, 0.212, 0.141]];

function renderRareEarthDeposit(e, px, py, t) {
    // Heavy-mineral sand from above: a pale circle of beach sand swept into
    // curving bands, the dense dark ilmenite and the honey-red monazite
    // sorted apart by the waves, flecked with white zircon, with a shallow
    // wash pool where the sand is wet. Grains glint now and then.
    const K = _depositKit(e, px, py);
    const { k, X, Y, S, blob, ell, line } = K;
    const detail = Camera.zoom > 0.5;
    const phase = e._rareEarthPhase ?? S(99)*6.28;
    const pulse = 0.5 + 0.5*Math.sin(t*1.1 + phase);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // Rendered in Blender (img/mineral_sand_*, scripts/render_mineral_sand.py):
    // rippled sand with black ilmenite in the troughs and red-brown garnet
    // and monazite beside it, swept into bands, and a shallow wash pool.
    // Drawn over it: light shimmering on the pool and a grain glinting now
    // and then. The painted sand while it loads.
    const PG = typeof PhotoGround !== 'undefined' ? PhotoGround : null;
    const uR = S(37), fsp = PG && PG.sprite('mineral_sand', uR);
    if (fsp) {
      _dpHalo(K, '96,52,34', 0.4);
      const R = 41, disp = R*2*RARE_FRAME*k;
      ctx.drawImage(fsp, X(50) - disp/2, Y(52) - disp/2, disp, disp);
      const [qx, qy, qrx, qry] = RARE_POOLS[Math.min(3, Math.floor(uR*4))];
      const pX = 50 + qx*R, pY = 52 + qy*R;
      ell(pX - qrx*R*0.2, pY - qry*R*0.25, qrx*R*0.45, qry*R*0.22);
      ctx.fillStyle = `rgba(220,235,240,${(0.08 + 0.1*pulse).toFixed(3)})`; ctx.fill();
      if (detail) for (let g = 0; g < 12 + K.size*4; g++) {
        if (Math.sin(t*1.7 + g*2.3 + phase) < 0.97) continue;
        const a = S(100 + g)*Math.PI*2, d = Math.sqrt(S(130 + g))*34;
        const gx = 50 + Math.cos(a)*d, gy = 52 + Math.sin(a)*d*0.9;
        line(gx - 1.6, gy, gx + 1.6, gy, 'rgba(255,236,200,0.85)', 0.4);
        line(gx, gy - 1.6, gx, gy + 1.6, 'rgba(255,236,200,0.85)', 0.4);
      }
    } else {
      // ── Sand bed ───────────────────────────────────────────────────────
      _dpHalo(K, '106,80,56', 0.7);
      blob(50, 52, 41, 38, 0.12, 30, 16); ctx.fillStyle = '#c8a070'; ctx.fill();

      // ── Swept bands: ilmenite black, monazite honey-red ────────────────
      ctx.save();
      blob(50, 52, 40, 37, 0.12, 30, 16); ctx.clip();
      for (let b = 0; b < 4 + K.size; b++) {
        const y0 = 20 + b*(64 / (4 + K.size)) + (S(10 + b) - 0.5)*6;
        const amp = 5 + S(20 + b)*6, off = S(30 + b)*6.28;
        const dark = b % 2 === 0;
        ctx.strokeStyle = dark ? 'rgba(28,22,18,0.85)' : 'rgba(196,92,48,0.9)';
        ctx.lineWidth = (dark ? 3.2 : 4.6)*k;
        ctx.beginPath();
        for (let x = 4; x <= 96; x += 4) {
          const y = y0 + Math.sin(x*0.07 + off)*amp;
          x === 4 ? ctx.moveTo(X(x), Y(y)) : ctx.lineTo(X(x), Y(y));
        }
        ctx.stroke();
      }
      ctx.restore();

      // ── Grains: zircon white, monazite honey, with an occasional glint ─
      if (detail) for (let g = 0; g < 18 + K.size*6; g++) {
        const a = S(100 + g)*Math.PI*2, d = Math.sqrt(S(130 + g))*36;
        const gx = 50 + Math.cos(a)*d, gy = 52 + Math.sin(a)*d*0.9;
        const kind = g % 3;
        ell(gx, gy, 0.9, 0.8);
        ctx.fillStyle = kind === 0 ? '#f4ece0' : kind === 1 ? '#ffb070' : '#2a2018'; ctx.fill();
        if (kind === 1 && Math.sin(t*1.7 + g*2.3 + phase) > 0.96) {
          line(gx - 2, gy, gx + 2, gy, 'rgba(255,230,190,0.9)', 0.5);
          line(gx, gy - 2, gx, gy + 2, 'rgba(255,230,190,0.9)', 0.5);
        }
      }

      // ── A shallow wash pool where the sand is wet ──────────────────────
      const pX = 70 + S(5)*10, pY = 68 + S(6)*8;
      blob(pX, pY, 11, 7, 0.2, 80, 12); ctx.fillStyle = '#4a3a2a'; ctx.fill();
      blob(pX, pY, 9, 5.6, 0.2, 80, 12); ctx.fillStyle = '#5a7a88'; ctx.fill();
      ell(pX - 1.5, pY - 0.8, 5, 2.2); ctx.fillStyle = `rgba(210,235,245,${(0.25 + 0.25*pulse).toFixed(3)})`; ctx.fill();

    }

    ctx.restore();
}
