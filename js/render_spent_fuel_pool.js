/* ═══════════════════════════════════════════════════════════════════
   SPENT FUEL POOL RENDERER
   A 12×8 deck round a concrete basin: a racked fuel field down the long
   side, a transfer channel and a cask loading pit at the far end, with a
   full-span refuelling bridge on deck rails. The pool cooling plant
   (forced-draft cooler, demineralisers, purification skid) stands on one
   side of the basin, the cask hall and control booth on the other.

   Occupied rack cells glow Cherenkov blue; how many are lit is the pool's
   fill, and the ones still on the cooling clock burn brighter and whiter
   than the ones that have cooled — so "how full" and "how much is actually
   usable" are both readable without opening the panel.

   Ports come from SpentFuelPoolSystem.getStubs(). Shares the _wf* helpers
   (render_hydro_coal.js) and the _port* helpers (render_oil_nuclear.js).
   ═══════════════════════════════════════════════════════════════════ */

// Cherenkov glow for one rack cell, drawn once per size and reused for every
// cell — a radial gradient per cell per frame was the one thing that made
// a full pool expensive.
const _sfpGlowCache = new Map();
function _sfpGlowSprite(size, hot) {
  const key = size + (hot ? 'h' : 'c');
  let c = _sfpGlowCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g2 = c.getContext('2d');
  const r = size / 2;
  const g = g2.createRadialGradient(r, r, 0, r, r, r);
  if (hot) {
    g.addColorStop(0,    'rgba(215,245,255,0.75)');
    g.addColorStop(0.35, 'rgba(110,200,255,0.40)');
    g.addColorStop(1,    'rgba(40,120,255,0)');
  } else {
    g.addColorStop(0,    'rgba(90,180,255,0.55)');
    g.addColorStop(0.4,  'rgba(40,120,240,0.28)');
    g.addColorStop(1,    'rgba(20,70,200,0)');
  }
  g2.fillStyle = g; g2.fillRect(0, 0, size, size);
  _sfpGlowCache.set(key, c);
  return c;
}

function renderSpentFuelPool(e, px, py, t) {
  const def = EntityDefs[T.SPENTFUELPOOL];
  const W   = (e.width  || def.width)  * TILE;
  const H   = (e.height || def.height) * TILE;
  const on  = e.powered;
  const S   = TILE / 40;
  const cap = def.spentFuelCapacity || 400;
  const cooling = e._cooling || 0;
  const ready   = e._ready   || 0;
  const held    = cooling + ready;
  const fill    = Math.min(1, held / cap);
  const accent  = '#6ec8ff';

  // One landscape layout, in tile units of the 12×8 (u, v). A turned pool
  // (taller than wide) draws it reflected across the diagonal, x↔y, rather
  // than rotated: a reflection keeps shadows falling down-right like every
  // other building. Text, ports and lamps go on afterwards in world space,
  // so nothing reads mirrored. A pool saved at the old 9×7 stretches to fit.
  const flip = H > W;
  const L = flip ? H : W, D = flip ? W : H;
  const u = L / 12, v = D / 8, mm = Math.min(u, v);
  const toW = (x, y) => flip ? [px + y, py + x] : [px + x, py + y];
  const toL = (x, y) => flip ? [y - py, x - px] : [x - px, y - py];

  const st   = (typeof SpentFuelPoolSystem !== 'undefined') ? SpentFuelPoolSystem.getStubs(e) : null;
  const aIn  = st && _portAnchor(e, px, py, W, H, st.spentIn);
  const aOut = st && _portAnchor(e, px, py, W, H, st.spentOut);

  // ── Layout ──
  const ix = 2.7 * u, iy = 0.95 * v, iw = 6.7 * u, ih = 6.1 * v;     // basin
  const lsX = 0.3 * u, lsW = 2.05 * u;                                // cooling plant strip
  const rsX = 9.75 * u, rsW = 1.95 * u;                               // cask hall + booth strip
  const chY = 0.45 * v, chH = 4.1 * v;                                // cask hall
  const cbY = 4.9 * v, cbH = 2.65 * v;                                // control booth

  ctx.save();
  if (flip) ctx.transform(0, 1, 1, 0, px, py); else ctx.translate(px, py);

  // ── Deck slab ──
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.roundRect(5 * S, 6 * S, L, D, 5 * S); ctx.fill();
  const deck = ctx.createLinearGradient(0, 0, L, D);
  deck.addColorStop(0, '#6c7276'); deck.addColorStop(0.55, '#4c5256'); deck.addColorStop(1, '#30353a');
  ctx.fillStyle = deck; ctx.strokeStyle = '#15181a'; ctx.lineWidth = 1.6 * S;
  ctx.beginPath(); ctx.roundRect(0, 0, L, D, 5 * S); ctx.fill(); ctx.stroke();
  // cast-in deck joints
  ctx.strokeStyle = 'rgba(20,26,30,0.30)'; ctx.lineWidth = 0.9 * S;
  for (let q = 2; q < 12; q += 2) { ctx.beginPath(); ctx.moveTo(q * u, 2 * S); ctx.lineTo(q * u, D - 2 * S); ctx.stroke(); }
  for (let q = 2; q < 8; q += 2)  { ctx.beginPath(); ctx.moveTo(2 * S, q * v); ctx.lineTo(L - 2 * S, q * v); ctx.stroke(); }
  // painted safety line round the basin
  ctx.strokeStyle = 'rgba(232,200,40,0.65)'; ctx.lineWidth = 1.4 * S;
  ctx.setLineDash([6 * S, 4 * S]);
  ctx.beginPath(); ctx.roundRect(ix - 9 * S, iy - 9 * S, iw + 18 * S, ih + 18 * S, 4 * S); ctx.stroke();
  ctx.setLineDash([]);

  // ── Pipework (under the plant) ──
  // Pool cooling out of and back into the basin, and the clean-up loop
  // through the demineralisers and the purification skid.
  _wfPipe([[ix, 1.35 * v], [lsX + lsW - 4 * S, 1.35 * v]], S, t, on, 'rgba(255,190,120,0.9)');
  _wfPipe([[lsX + lsW - 4 * S, 2.75 * v], [ix, 2.75 * v]], S, t, on, 'rgba(110,200,255,0.95)');
  _wfPipe([[ix, 4.45 * v], [lsX + 0.85 * u, 4.45 * v]], S, t, on, 'rgba(160,220,255,0.9)');
  _wfPipe([[lsX + 1.6 * u, 5.6 * v], [lsX + 1.6 * u, 6.9 * v], [ix, 6.9 * v]], S, t, on, 'rgba(160,220,255,0.9)');
  // Cask cart rails: from the pit's edge across the deck into the hall.
  ctx.fillStyle = '#2a2e32';
  ctx.fillRect(ix + iw - 2 * S, 2.1 * v, rsX - ix - iw + 0.9 * rsW, 1.6 * S);
  ctx.fillRect(ix + iw - 2 * S, 2.9 * v, rsX - ix - iw + 0.9 * rsW, 1.6 * S);
  ctx.fillStyle = 'rgba(160,168,174,0.5)';
  for (let x = ix + iw + 2 * S; x < rsX + 0.9 * rsW; x += 5 * S) ctx.fillRect(x, 2.1 * v, 1.5 * S, 0.8 * v + 1.6 * S);

  // ── Port hatches: a short chute from the wall stub to the basin lip ──
  // A pool moves fuel by crane, so the belt stops at the lip rather than
  // running across the water.
  [aIn, aOut].forEach((a, i) => {
    if (!a) return;
    const [lx, ly] = toL(a.x, a.y);
    const top = ly < D / 2;
    const y0 = top ? 4 * S : D - 4 * S, y1 = top ? iy - 6 * S : iy + ih + 6 * S;
    _wfConveyor(lx, i ? y1 : y0, lx, i ? y0 : y1, S, t, i ? (!!e._outLinked && ready > 0) : !!e._hasSpentFuel, '#d0e040');
    ctx.fillStyle = '#3a4044'; ctx.strokeStyle = '#14181a'; ctx.lineWidth = S;
    ctx.fillRect(lx - 9 * S, y1 - (top ? 4 * S : 0), 18 * S, 4 * S); ctx.strokeRect(lx - 9 * S, y1 - (top ? 4 * S : 0), 18 * S, 4 * S);
  });

  // ── Basin ──
  // Curb lip first so the water sits visibly BELOW the deck rather than
  // being painted onto it.
  ctx.fillStyle = '#1b1f22';
  ctx.beginPath(); ctx.roundRect(ix - 3 * S, iy - 3 * S, iw + 6 * S, ih + 6 * S, 3 * S); ctx.fill();
  const water = ctx.createLinearGradient(0, iy, 0, iy + ih);
  water.addColorStop(0, on ? '#1d5a86' : '#1b3442');
  water.addColorStop(1, on ? '#062036' : '#0b1822');
  ctx.fillStyle = water;
  ctx.beginPath(); ctx.roundRect(ix, iy, iw, ih, 2.5 * S); ctx.fill();

  ctx.save();
  ctx.beginPath(); ctx.roundRect(ix, iy, iw, ih, 2.5 * S); ctx.clip();

  // Basin is split lengthwise: rack field · transfer channel · cask pit.
  const pitW  = iw * 0.2;
  const chanW = iw * 0.05;
  const rackW = iw - pitW - chanW;
  const chanX = ix + rackW;
  const pitX  = chanX + chanW;

  // ── Rack field ──
  // 10×10 cells, each worth 1/100th of capacity — the rack IS the fill
  // gauge, which is why there is no separate bar.
  //
  // Cells fill from the BOTTOM ROW UP, like a water level, with the cooled
  // fuel underneath and the newest arrivals nearest the surface. That
  // ordering is the whole readout: a pool that has just taken delivery has
  // a pale, flickering band at the top of its stack, and as that fuel comes
  // off the cooling clock the band sinks and settles to steady blue.
  const NC = 10, NR = 10;
  const cw = rackW / NC, ch = ih / NR;
  const totalCells = NC * NR;
  const litCells   = Math.round(fill * totalCells);
  const hotCells   = held > 0 ? Math.round((cooling / held) * litCells) : 0;

  // Rack steelwork under the cells, so empty racks still read as hardware
  // sitting on the pool floor instead of blank water.
  ctx.fillStyle = 'rgba(12,30,44,0.55)';
  ctx.fillRect(ix, iy, rackW, ih);
  // Rack modules: a heavier frame every five cells each way.
  ctx.strokeStyle = 'rgba(90,140,170,0.35)'; ctx.lineWidth = 1.4 * S;
  for (let q = 0; q <= NC; q += 5) { ctx.beginPath(); ctx.moveTo(ix + q * cw, iy); ctx.lineTo(ix + q * cw, iy + ih); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(ix, iy + ih / 2); ctx.lineTo(ix + rackW, iy + ih / 2); ctx.stroke();

  // Each occupied cell is an assembly seen from above, sitting in its rack
  // well with the Cherenkov glow real pools are known for bleeding up
  // through the water around it. Assemblies still on the cooling clock burn
  // paler and brighter and shed bubbles; cooled ones settle to deep blue.
  const detail = Camera.zoom > 0.5;
  const glowPx = Math.ceil(Math.max(cw, ch) * 1.9);
  const glowHot  = _sfpGlowSprite(glowPx, true);
  const glowCool = _sfpGlowSprite(glowPx, false);
  // Where cell (col, up) sits, "up" counting rows from the bottom of the
  // SCREEN: a turned pool is drawn reflected, so its screen-up runs along
  // the layout's x, from the far end of the rack. Either way the stack
  // rises up the screen like a water level.
  const cellAt = (col, up) => flip ? [ix + rackW - (up + 1) * cw, iy + col * ch]
                                   : [ix + col * cw, iy + ih - (up + 1) * ch];
  // A band of the rack from up-row a (inclusive) to b (exclusive), padded,
  // filled with a wash that fades toward the top of the screen.
  const rackBand = (a, b, pad, stops) => {
    const lo = flip ? ix + rackW - b * cw : iy + ih - b * ch;   // screen-top edge
    const hi = flip ? ix + rackW - a * cw : iy + ih - a * ch;
    const g = flip ? ctx.createLinearGradient(lo - pad, 0, hi + pad, 0) : ctx.createLinearGradient(0, lo - pad, 0, hi + pad);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g;
    if (flip) ctx.fillRect(lo - pad, iy, hi - lo + pad * 2, ih); else ctx.fillRect(ix, lo - pad, rackW, hi - lo + pad * 2);
  };
  let hotTop = Infinity, anyHot = false;
  for (let i = 0; i < totalCells; i++) {
    const col = i % NC;
    // Row 0 is the BOTTOM of the rack — fill rises from there.
    const rowFromBottom = Math.floor(i / NC);
    const [cx, cy] = cellAt(col, rowFromBottom);
    // Rack well: a dark square socket, empty or not.
    ctx.fillStyle = 'rgba(3,12,20,0.55)';
    ctx.fillRect(cx + 1.2 * S, cy + 1.2 * S, cw - 2.4 * S, ch - 2.4 * S);
    ctx.strokeStyle = 'rgba(60,110,140,0.35)'; ctx.lineWidth = 0.9 * S;
    ctx.strokeRect(cx + 1.2 * S, cy + 1.2 * S, cw - 2.4 * S, ch - 2.4 * S);
    if (i >= litCells) continue;
    // The top `hotCells` of the lit stack are still on the clock.
    const isHot = i >= litCells - hotCells;
    const puls  = on ? (isHot ? 0.75 + 0.25 * Math.sin(t * 3.4 + i * 0.7)
                              : 0.50 + 0.10 * Math.sin(t * 1.5 + i * 0.4))
                     : 0.22;
    const mx = cx + cw / 2, my = cy + ch / 2;

    // Glow first, additively, so neighbouring assemblies pool their light.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = puls;
    ctx.drawImage(isHot ? glowHot : glowCool, mx - glowPx / 2, my - glowPx / 2);
    ctx.restore();

    // Top nozzle: a square steel frame around the pin lattice.
    const ax = cx + 3 * S, ay = cy + 3 * S, aw = cw - 6 * S, ah = ch - 6 * S;
    ctx.fillStyle = isHot ? 'rgba(70,120,150,0.95)' : 'rgba(40,78,108,0.95)';
    ctx.fillRect(ax, ay, aw, ah);
    ctx.strokeStyle = isHot ? 'rgba(200,240,255,0.8)' : 'rgba(120,190,235,0.6)';
    ctx.lineWidth = 0.8 * S;
    ctx.strokeRect(ax, ay, aw, ah);
    if (detail) {
      // Pin ends: a 4×4 lattice glowing through from below.
      const pinC = isHot ? `rgba(220,248,255,${(0.65 + 0.35 * puls).toFixed(3)})`
                         : `rgba(110,200,255,${(0.45 + 0.35 * puls).toFixed(3)})`;
      ctx.fillStyle = pinC;
      const pr = Math.max(0.6, Math.min(aw, ah) * 0.07);
      for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
        ctx.beginPath();
        ctx.arc(ax + aw * (0.2 + gx * 0.2), ay + ah * (0.2 + gy * 0.2), pr, 0, Math.PI * 2);
        ctx.fill();
      }
      // Lifting bar across the nozzle and the hold-down clips at the corners.
      ctx.strokeStyle = 'rgba(20,40,55,0.85)'; ctx.lineWidth = 1.1 * S;
      ctx.beginPath(); ctx.moveTo(ax + aw * 0.15, my); ctx.lineTo(ax + aw * 0.85, my); ctx.stroke();
      ctx.fillStyle = 'rgba(160,200,220,0.75)';
      const k = 1.6 * S;
      ctx.fillRect(ax - 0.4 * S, ay - 0.4 * S, k, k);
      ctx.fillRect(ax + aw - k + 0.4 * S, ay - 0.4 * S, k, k);
      ctx.fillRect(ax - 0.4 * S, ay + ah - k + 0.4 * S, k, k);
      ctx.fillRect(ax + aw - k + 0.4 * S, ay + ah - k + 0.4 * S, k, k);
      // Decay heat off fresh fuel: bubbles rising off the top.
      if (on && isHot) {
        ctx.fillStyle = 'rgba(225,248,255,0.55)';
        for (let b = 0; b < 2; b++) {
          const ph = (t * 0.9 + b * 0.5 + i * 0.37) % 1;
          ctx.beginPath();
          ctx.arc(mx + Math.sin(t * 2 + i + b * 2) * aw * 0.25, my - ph * ch * 0.6, (0.6 + 0.6 * ph) * S, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    if (isHot) { anyHot = true; hotTop = Math.min(hotTop, rowFromBottom); }
  }

  // One pooled glow for the whole lit stack rather than a radial gradient
  // per cell — same read, a hundredth of the gradient churn.
  if (on && litCells > 0) {
    rackBand(0, Math.ceil(litCells / NC), 10 * S, [[0, 'rgba(120,210,255,0)'], [1, 'rgba(120,210,255,' + (0.10 + 0.14 * fill) + ')']]);
  }
  // The freshly-landed band gets its own hotter wash so it stays the first
  // thing you see.
  if (on && anyHot) {
    const top = Math.ceil(litCells / NC);
    rackBand(Math.min(hotTop, top - hotCells / NC), top, 6 * S,
      [[0, 'rgba(210,248,255,0)'], [0.5, 'rgba(210,248,255,' + (0.16 + 0.05 * Math.sin(t * 2.6)) + ')'], [1, 'rgba(210,248,255,0)']]);
  }

  // ── Transfer channel ──
  // Deeper, unracked water: the lane an assembly is walked down on its way
  // between the racks and the cask pit, closed by a gate at each end.
  const chg = ctx.createLinearGradient(chanX, 0, chanX + chanW, 0);
  chg.addColorStop(0, 'rgba(3,14,24,0.75)');
  chg.addColorStop(0.5, 'rgba(3,16,28,0.85)');
  chg.addColorStop(1, 'rgba(3,14,24,0.75)');
  ctx.fillStyle = chg; ctx.fillRect(chanX, iy, chanW, ih);
  ctx.strokeStyle = 'rgba(140,200,235,0.18)'; ctx.lineWidth = 0.9 * S;
  ctx.beginPath(); ctx.moveTo(chanX, iy); ctx.lineTo(chanX, iy + ih);
  ctx.moveTo(chanX + chanW, iy); ctx.lineTo(chanX + chanW, iy + ih); ctx.stroke();
  ctx.fillStyle = '#5a6268';
  ctx.fillRect(chanX, iy + ih * 0.30, chanW, 2.5 * S);
  ctx.fillRect(chanX, iy + ih * 0.70, chanW, 2.5 * S);

  // ── Cask loading pit ──
  // Where cooled fuel is loaded out. Kept visibly PALER than the transfer
  // channel beside it: the channel is the deep lane, the pit is a shallower
  // shelf you can see the floor of, and if both were the same black the
  // whole right end read as one dark hole.
  ctx.fillStyle = 'rgba(16,52,78,0.85)';
  ctx.fillRect(pitX, iy, pitW, ih);
  ctx.strokeStyle = 'rgba(120,175,210,0.26)'; ctx.lineWidth = 1.1 * S;
  ctx.strokeRect(pitX + 2 * S, iy + 2 * S, pitW - 4 * S, ih - 4 * S);
  // Canister lay-down slots at either end of the pit, so the shelf reads as
  // working floor rather than blank water above and below the cask.
  ctx.strokeStyle = 'rgba(10,30,45,0.55)'; ctx.lineWidth = 0.9 * S;
  for (let q = 0; q < 3; q++) {
    const sw2 = (pitW - 10 * S) / 3;
    const sx2 = pitX + 5 * S + q * sw2;
    ctx.strokeRect(sx2 + 1 * S, iy + 5 * S,          sw2 - 2 * S, 11 * S);
    ctx.strokeRect(sx2 + 1 * S, iy + ih - 16 * S,    sw2 - 2 * S, 11 * S);
  }
  const pcx = pitX + pitW / 2, pcy = iy + ih * 0.5;
  const caskR = Math.min(pitW, ih) * 0.3;
  if (ready > 0) {
    ctx.fillStyle = '#3a4147'; ctx.strokeStyle = '#12171a'; ctx.lineWidth = 1.2 * S;
    ctx.beginPath(); ctx.arc(pcx, pcy, caskR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#596268'; ctx.lineWidth = 1.4 * S;
    ctx.beginPath(); ctx.arc(pcx, pcy, caskR * 0.66, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(pcx, pcy, caskR * 0.34, 0, Math.PI * 2); ctx.stroke();
    if (on) {
      const cg = ctx.createRadialGradient(pcx, pcy, caskR * 0.3, pcx, pcy, caskR * 1.9);
      cg.addColorStop(0, 'rgba(120,210,255,' + (0.16 + 0.07 * Math.sin(t * 1.8)) + ')');
      cg.addColorStop(1, 'rgba(120,210,255,0)');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(pcx, pcy, caskR * 1.9, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    // Empty pit: just the seating ring the cask lands on.
    ctx.strokeStyle = 'rgba(90,130,160,0.25)'; ctx.lineWidth = 1.2 * S;
    ctx.beginPath(); ctx.arc(pcx, pcy, caskR, 0, Math.PI * 2); ctx.stroke();
  }

  // ── Surface ──
  // Circulation ripples only while powered — a pool with the power cut goes
  // visibly still, which is the tell that its cooling clock has stopped.
  ctx.strokeStyle = on ? 'rgba(180,230,255,0.13)' : 'rgba(150,190,210,0.07)';
  ctx.lineWidth = 1.1 * S;
  for (let q = 0; q < 5; q++) {
    const ry = iy + ih * (0.1 + q * 0.2);
    ctx.beginPath(); ctx.moveTo(ix, ry);
    for (let xq = 0; xq <= 20; xq++) {
      ctx.lineTo(ix + iw * xq / 20, ry + Math.sin((on ? t * 1.6 : 0) + xq * 0.55 + q * 1.3) * 1.7 * S);
    }
    ctx.stroke();
  }
  // Return-water inlets along the cooling wall: a faint boil where the
  // cooled water comes back in, only while it is circulating.
  if (on) {
    [1.35, 2.75, 4.45, 6.9].forEach((yy, q) => {
      const ph = (t * 0.8 + q * 0.3) % 1;
      ctx.strokeStyle = `rgba(200,240,255,${(0.35 * (1 - ph)).toFixed(3)})`; ctx.lineWidth = 1 * S;
      ctx.beginPath(); ctx.arc(ix + 3 * S, yy * v, (2 + 7 * ph) * S, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    });
  }
  // Caustic sheen drifting across the surface — the one thing that sells
  // this as water seen from above rather than a blue floor.
  // Kept faint and broad: any crisper and they read as scratches on the
  // racks rather than light moving on a surface above them.
  if (on) {
    ctx.globalAlpha = 0.055;
    ctx.strokeStyle = '#cfefff'; ctx.lineWidth = 5 * S;
    for (let q = 0; q < 3; q++) {
      const off = ((t * 9 + q * iw / 3) % (iw + 40 * S)) - 20 * S;
      ctx.beginPath();
      ctx.moveTo(ix + off, iy);
      ctx.lineTo(ix + off + 9 * S, iy + ih);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ── Refuelling bridge ──
  // Full-span gantry on deck rails, travelling the LENGTH of the pool. It
  // only moves when fuel actually came in this tick; otherwise it parks
  // over the racks, which is where a real bridge sits between campaigns.
  // It sweeps back and forth (a cosine, so it slows at each end instead of
  // snapping back to the start), and eases toward its target rather than
  // jumping, so starting, stopping and parking all glide.
  const moving  = (e._intakeThisTick || 0) > 0;
  const dtB = Math.min(0.1, Math.max(0, t - (e._bridgeLastT ?? t)));
  e._bridgeLastT = t;
  const ease = Math.min(1, dtB * 2.5);
  const bridgeTarget = moving ? 0.5 - 0.5 * Math.cos(t * 0.45) : 0.32;
  e._bridgePos = (e._bridgePos ?? bridgeTarget) + (bridgeTarget - (e._bridgePos ?? bridgeTarget)) * ease;
  const bw = 14 * S;
  const brX = ix + 6 * S + (iw - bw - 12 * S) * e._bridgePos;
  ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(brX + 3 * S, iy, bw, ih);
  const bgr = ctx.createLinearGradient(brX, 0, brX + bw, 0);
  bgr.addColorStop(0, '#c89a20'); bgr.addColorStop(0.45, '#e8bc3a'); bgr.addColorStop(1, '#a07a18');
  ctx.fillStyle = bgr; ctx.fillRect(brX, iy, bw, ih);
  ctx.strokeStyle = '#3a2c0c'; ctx.lineWidth = 0.9 * S; ctx.strokeRect(brX, iy, bw, ih);
  // Walkway grating and handrails on the bridge deck.
  ctx.strokeStyle = 'rgba(60,44,10,0.45)'; ctx.lineWidth = 0.7 * S;
  for (let q = 1; q < 12; q++) {
    const gy = iy + ih * q / 12;
    ctx.beginPath(); ctx.moveTo(brX + 1.5 * S, gy); ctx.lineTo(brX + bw - 1.5 * S, gy); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(40,30,8,0.8)'; ctx.lineWidth = 0.9 * S;
  ctx.beginPath(); ctx.moveTo(brX + 1.5 * S, iy); ctx.lineTo(brX + 1.5 * S, iy + ih);
  ctx.moveTo(brX + bw - 1.5 * S, iy); ctx.lineTo(brX + bw - 1.5 * S, iy + ih); ctx.stroke();
  // Trolley + mast, parked mid-span unless the bridge is working.
  const trTarget = moving ? 0.30 + 0.40 * (0.5 + 0.5 * Math.sin(t * 0.8)) : 0.5;
  e._trolleyPos = (e._trolleyPos ?? trTarget) + (trTarget - (e._trolleyPos ?? trTarget)) * ease;
  const trY = iy + ih * e._trolleyPos;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(brX + 1 * S, trY - 5 * S, 18 * S, 13 * S);
  ctx.fillStyle = '#c3cacf'; ctx.fillRect(brX - 2 * S, trY - 7 * S, 18 * S, 14 * S);
  ctx.strokeStyle = '#1a1f22'; ctx.lineWidth = 0.9 * S; ctx.strokeRect(brX - 2 * S, trY - 7 * S, 18 * S, 14 * S);
  ctx.fillStyle = '#5a6267'; ctx.beginPath(); ctx.arc(brX + 7 * S, trY, 4 * S, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9aa2a7'; ctx.beginPath(); ctx.arc(brX + 7 * S, trY, 2 * S, 0, Math.PI * 2); ctx.fill();
  // Grapple light: amber while an assembly is being moved.
  if (moving) {
    ctx.fillStyle = 'rgba(255,190,90,' + (0.5 + 0.5 * Math.sin(t * 7)) + ')';
    ctx.beginPath(); ctx.arc(brX + 13 * S, trY - 4 * S, 2 * S, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();   // end basin clip

  // ── Deck rails ──
  // The bridge has to run on something; the rails also frame the water and
  // stop the basin reading as a hole cut in a slab.
  ctx.fillStyle = '#6a7176';
  ctx.fillRect(ix - 4 * S, iy - 6 * S, iw + 8 * S, 3 * S);
  ctx.fillRect(ix - 4 * S, iy + ih + 3 * S, iw + 8 * S, 3 * S);
  ctx.fillStyle = 'rgba(20,26,30,0.5)';
  ctx.fillRect(ix - 4 * S, iy - 3.4 * S, iw + 8 * S, 1 * S);
  ctx.fillRect(ix - 4 * S, iy + ih + 5.6 * S, iw + 8 * S, 1 * S);
  // bridge end trucks riding the rails
  const brEnd = ix + 6 * S + (iw - bw - 12 * S) * e._bridgePos;
  ctx.fillStyle = '#3a3e42';
  ctx.fillRect(brEnd - 2 * S, iy - 8 * S, bw + 4 * S, 6 * S);
  ctx.fillRect(brEnd - 2 * S, iy + ih + 2 * S, bw + 4 * S, 6 * S);

  // ── Radiation monitors on the basin corners ──
  [[ix - 6 * S, 0.45 * v], [ix + iw + 6 * S, 0.45 * v], [ix - 6 * S, D - 0.45 * v], [ix + iw + 6 * S, D - 0.45 * v]].forEach(([mx, my], q) => {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(mx + 1.5 * S, my + 2 * S, 4 * S, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d8dcd8'; ctx.strokeStyle = '#2a2e30'; ctx.lineWidth = 0.8 * S;
    ctx.beginPath(); ctx.arc(mx, my, 4 * S, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const lit = on && Math.sin(t * 2 + q * 1.6) > -0.6;
    ctx.fillStyle = lit ? (cooling > 0.01 ? '#ffc040' : '#60e090') : '#2c3234';
    ctx.beginPath(); ctx.arc(mx, my, 2 * S, 0, Math.PI * 2); ctx.fill();
  });

  // ── Pool cooling plant ──
  // A forced-draft cooler pulling the decay heat out of the water, two
  // demineraliser vessels and the purification skid: the equipment the
  // power draw is actually paying for. It all runs only while powered.
  const cxY = 0.45 * v, cxH = 3.1 * v;
  _wfShadow(lsX, cxY, lsW, cxH, S, 3 * S);
  ctx.fillStyle = '#3c4644'; ctx.strokeStyle = '#141c1a'; ctx.lineWidth = 1.4 * S;
  ctx.beginPath(); ctx.roundRect(lsX, cxY, lsW, cxH, 3 * S); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(150,170,164,0.22)'; ctx.lineWidth = 0.7 * S;
  for (let fy = cxY + 4 * S; fy < cxY + cxH - 3 * S; fy += 2.5 * S) { ctx.beginPath(); ctx.moveTo(lsX + 3 * S, fy); ctx.lineTo(lsX + lsW - 3 * S, fy); ctx.stroke(); }
  for (let q = 0; q < 2; q++) {
    const fx = lsX + lsW / 2, fy = cxY + cxH * (q + 0.5) / 2, fr = Math.min(lsW, cxH / 2) * 0.38;
    ctx.fillStyle = '#1a2220'; ctx.beginPath(); ctx.arc(fx, fy, fr + 2 * S, 0, Math.PI * 2); ctx.fill();
    _fcFan(fx, fy, fr, S, t + q * 0.5, on, 9);
  }
  [0.85, 1.75].forEach((dx, q) => {
    _fcVTank(lsX + dx * u, 4.45 * v, 0.42 * mm, S, { band: on ? accent : '#3a4448', ladderAngle: q ? 0.7 : 2.4 });
  });
  // pump skid
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(lsX + 0.25 * u + 2 * S, 5.2 * v + 2 * S, 1.6 * u, 0.6 * v);
  ctx.fillStyle = '#4c5257'; ctx.strokeStyle = '#14181b'; ctx.lineWidth = 0.9 * S;
  ctx.fillRect(lsX + 0.25 * u, 5.2 * v, 1.6 * u, 0.6 * v); ctx.strokeRect(lsX + 0.25 * u, 5.2 * v, 1.6 * u, 0.6 * v);
  [0.6, 1.25].forEach((dx, q) => {
    const pxx = lsX + dx * u, pyy = 5.5 * v, pr = Math.min(0.24 * v, 0.28 * u);
    ctx.fillStyle = '#2a3236'; ctx.beginPath(); ctx.arc(pxx, pyy, pr, 0, Math.PI * 2); ctx.fill();
    _fcFan(pxx, pyy, pr * 0.75, S, t + q, on, 12);
  });
  // purification skid
  const psY = 6.15 * v, psH = 1.4 * v;
  _wfShadow(lsX, psY, lsW, psH, S, 2 * S);
  ctx.fillStyle = '#4c5257'; ctx.strokeStyle = '#14181b'; ctx.lineWidth = 1 * S;
  ctx.beginPath(); ctx.roundRect(lsX, psY, lsW, psH, 2 * S); ctx.fill(); ctx.stroke();
  for (let q = 0; q < 4; q++) {
    const fx = lsX + lsW * (q + 0.5) / 4;
    ctx.fillStyle = '#6c757a'; ctx.strokeStyle = '#1c2124'; ctx.lineWidth = 0.8 * S;
    ctx.beginPath(); ctx.roundRect(fx - lsW * 0.08, psY + 4 * S, lsW * 0.16, psH - 8 * S, 2 * S); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = on ? '#8fe0a0' : '#2f3538';
  ctx.fillRect(lsX + lsW - 5 * S, psY + 2 * S, 3 * S, 3 * S);

  // ── Cask hall ──
  // The cooled fuel's way out: the cart runs in from the pit, the cask is
  // lifted through the roof hatch and loaded for the reprocessing line.
  _wfShadow(rsX, chY, rsW, chH, S, 3 * S);
  const hg = ctx.createLinearGradient(rsX, chY, rsX + rsW, chY + chH);
  hg.addColorStop(0, '#848c92'); hg.addColorStop(1, '#565e64');
  ctx.fillStyle = hg; ctx.strokeStyle = '#181c1f'; ctx.lineWidth = 1.4 * S;
  ctx.beginPath(); ctx.roundRect(rsX, chY, rsW, chH, 3 * S); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 0.8 * S;
  ctx.beginPath(); ctx.moveTo(rsX + 2 * S, chY + chH - 3 * S); ctx.lineTo(rsX + 2 * S, chY + 2 * S); ctx.lineTo(rsX + rsW - 2 * S, chY + 2 * S); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.6 * S;
  for (let sx = rsX + 6 * S; sx < rsX + rsW - 2 * S; sx += 6 * S) { ctx.beginPath(); ctx.moveTo(sx, chY + 3 * S); ctx.lineTo(sx, chY + chH - 3 * S); ctx.stroke(); }
  // open roof hatch over the cask bay, the cart on its rails inside
  const htX = rsX + 0.12 * rsW, htY = 1.6 * v, htW = 0.76 * rsW, htH = 1.8 * v;
  ctx.fillStyle = '#14181b'; ctx.fillRect(htX, htY, htW, htH);
  _wfHazardStripe(htX, htY - 3 * S, htW, 3 * S, S);
  _wfHazardStripe(htX, htY + htH, htW, 3 * S, S);
  ctx.fillStyle = '#3a3e42';
  ctx.fillRect(htX, 2.1 * v, htW, 1.6 * S); ctx.fillRect(htX, 2.9 * v, htW, 1.6 * S);
  const cartX = htX + htW * 0.5, cartY = 2.5 * v + 0.8 * S, cartR = Math.min(htW, htH) * 0.3;
  ctx.fillStyle = '#c8a828'; ctx.strokeStyle = '#4a3a10'; ctx.lineWidth = S;
  ctx.fillRect(cartX - cartR * 1.3, cartY - cartR * 1.15, cartR * 2.6, cartR * 2.3); ctx.strokeRect(cartX - cartR * 1.3, cartY - cartR * 1.15, cartR * 2.6, cartR * 2.3);
  if (ready > 0) {
    const kg = ctx.createRadialGradient(cartX - cartR * 0.3, cartY - cartR * 0.3, 1, cartX, cartY, cartR);
    kg.addColorStop(0, '#8a949a'); kg.addColorStop(1, '#2a3034');
    ctx.fillStyle = kg; ctx.strokeStyle = '#0e1214';
    ctx.beginPath(); ctx.arc(cartX, cartY, cartR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(20,24,26,0.7)';
    ctx.beginPath(); ctx.arc(cartX, cartY, cartR * 0.6, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#e8c820'; ctx.beginPath(); ctx.arc(cartX, cartY, cartR * 0.25, 0, Math.PI * 2); ctx.fill();
  }
  // roof unit and vent stack
  const ruX = rsX + rsW * 0.5, ruY = 0.95 * v, ruR = Math.min(rsW * 0.18, 0.32 * v);
  ctx.fillStyle = '#6a7278'; ctx.strokeStyle = '#22272a'; ctx.lineWidth = 0.8 * S;
  ctx.fillRect(ruX - ruR * 1.3, ruY - ruR * 1.3, ruR * 2.6, ruR * 2.6); ctx.strokeRect(ruX - ruR * 1.3, ruY - ruR * 1.3, ruR * 2.6, ruR * 2.6);
  _fcFan(ruX, ruY, ruR, S, t, on, 7);
  const vsX = rsX + rsW * 0.5, vsY = 4.0 * v, vsR = Math.min(rsW * 0.16, 0.3 * v);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(vsX + 3 * S, vsY + 4 * S, vsR, 0, Math.PI * 2); ctx.fill();
  [1, 0.7, 0.4].forEach((rf, i) => { ctx.fillStyle = i % 2 ? '#e8e8e0' : '#c83020'; ctx.beginPath(); ctx.arc(vsX, vsY, vsR * rf, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = '#1a1a18'; ctx.beginPath(); ctx.arc(vsX, vsY, vsR * 0.18, 0, Math.PI * 2); ctx.fill();

  // ── Control booth ──
  _fcBuilding(rsX, cbY, rsW, cbH, S, t, { lit: on, spin: on, wall: '#2e3438', roof0: '#7e868c', roof1: '#565e64', units: [[0.78, 0.84]] });
  const pnX = rsX + 4 * S, pnY = cbY + 4 * S, pnW = rsW - 8 * S, pnH = (cbH - 4 * S) * 0.62;
  ctx.fillStyle = '#04100c'; ctx.strokeStyle = '#123848'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.roundRect(pnX, pnY, pnW, pnH, 2 * S); ctx.fill(); ctx.stroke();
  // status lights under the readout: intake, cooling, cooled fuel out
  const lamps = [
    !!e._hasSpentFuel ? '#60e090' : '#2c3234',
    !on ? '#2c3234' : cooling > 0.01 ? (Math.sin(t * 4) > 0 ? '#ffc040' : '#7a5a18') : '#60e090',
    (!!e._outLinked && ready > 0) ? '#60e090' : '#2c3234',
  ];
  lamps.forEach((col, q) => {
    const lx = rsX + rsW * (0.22 + q * 0.2), ly = pnY + pnH + 0.25 * v;
    ctx.fillStyle = '#0a0c0c'; ctx.beginPath(); ctx.arc(lx, ly, 3.2 * S, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(lx, ly, 2.2 * S, 0, Math.PI * 2); ctx.fill();
    if (col !== '#2c3234' && col !== '#7a5a18') { ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(lx, ly, 6 * S, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
  });

  // Radiation trefoil stencilled on the deck by the cask pit — the one
  // piece of signage that reads at a glance as "this is the hot end".
  ctx.save();
  ctx.translate(pitX + pitW * 0.5, D - 0.45 * v);
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = '#d8bf3a';
  for (let q = 0; q < 3; q++) {
    const a0 = q * 2.094 - 0.52 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 8 * S, a0, a0 + 1.04);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#1a1c12';
  ctx.beginPath(); ctx.arc(0, 0, 2.5 * S, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // ── Steam ──
  // Freshly landed fuel boils off visible vapour; cooled stock does not.
  // Only while powered, because circulation is what carries the heat up.
  if (on && cooling > 0.01) {
    ctx.save();
    for (let q = 0; q < 4; q++) {
      const ph = (t * 0.45 + q / 4) % 1;
      const sx = ix + rackW * (0.15 + 0.22 * q) + Math.sin(t * 0.8 + q) * 5 * S;
      const sy = iy + ih * 0.2 - ph * 16 * S;
      ctx.globalAlpha = 0.16 * (1 - ph);
      ctx.fillStyle = '#dff2ff';
      ctx.beginPath(); ctx.ellipse(sx, sy, (5 + 7 * ph) * S, (3 + 5 * ph) * S, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();   // end layout frame

  // ── World-space overlays: readout text, ports, lamp ──
  // Readout: how full, how much is still cooling, how much is ready to go.
  {
    const [wx, wy] = toW(pnX, pnY);
    const ph = flip ? pnW : pnH;
    ctx.save();
    ctx.font = `${Math.max(4, 5 * S * Math.min(1.4, mm / TILE * 1.2))}px Courier New`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = on ? accent : '#ff5040';
    ctx.fillText(`FILL ${Math.round(fill * 100).toString().padStart(3)}%`, wx + 3 * S, wy + ph * 0.22);
    ctx.fillStyle = cooling > 0.01 ? '#ffc040' : '#60a0a0';
    ctx.fillText(`COOL ${Math.round(cooling).toString().padStart(4)}`, wx + 3 * S, wy + ph * 0.5);
    ctx.fillStyle = ready > 0 ? '#60e090' : '#60a0a0';
    ctx.fillText(`RDY  ${Math.round(ready).toString().padStart(4)}`, wx + 3 * S, wy + ph * 0.78);
    ctx.restore();
  }

  // Belt hatches matching the reactor's SPENT FUEL OUT and the Reprocessing
  // Plant's SPENT FUEL IN, so the whole spent fuel line reads as one system.
  // The OUT chevrons only run while cooled fuel is actually leaving.
  if (aIn)  _portBelt(aIn,  S, t, { belt: '#d0e040', label: 'SPENT FUEL IN',  on: !!e._hasSpentFuel, out: false });
  if (aOut) _portBelt(aOut, S, t, { belt: '#d0e040', label: 'COOLED FUEL OUT', on: !!e._outLinked && ready > 0, out: true });

  const [lmx, lmy] = toW(rsX + rsW - 7 * S, chY + 7 * S);
  _wfLamp(lmx, lmy, S, t, accent, on && ready > 0);
}
