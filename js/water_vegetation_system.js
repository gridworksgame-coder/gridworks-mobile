/* ═══════════════════════════════════════════════════════════════════
   WATER & VEGETATION
   Water tile tracking and tree/bush scattering.
   ═══════════════════════════════════════════════════════════════════ */

const WaterSystem = (() => {
  const WATER_SET = new Set(); // Set of 'col,row' strings — the saved form

  // The same membership as a flat per-tile mask, which is what isWater()
  // actually reads. isWater sits inside tile-scan loops all over the game
  // (placement searches, audio, mining/hydro checks), and building a
  // template-string key and hashing it on every call measured ~350ms of
  // pure self time in an 11s profile. A typed-array index is neither.
  // WATER_SET stays the source of truth for save/load and the few callers
  // that iterate it; every mutation below updates both, through _mark().
  const WATER_MASK = new Uint8Array(COLS * ROWS);
  function _mark(c, r, on) {
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) WATER_MASK[r * COLS + c] = on ? 1 : 0;
  }
  // Every whole-map rewrite (generate, load) starts here, so the baked water
  // look starts again with it.
  function _clearAll() {
    WATER_SET.clear(); WATER_MASK.fill(0);
    if (typeof WaterLook !== 'undefined') WaterLook.invalidate();
  }

  function isWater(c, r) {
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) return WATER_MASK[r * COLS + c] === 1;
    return WATER_SET.has(`${c},${r}`);   // off-grid: only ever false in practice
  }

  function placeWaterTile(c, r, flowDc, flowDr, isLongRiver) {
    if (!GridManager.inBounds(c, r)) return;
    // Keep a 30-tile buffer around map centre for City Hall
    const _ccx = Math.floor(COLS/2), _ccy = Math.floor(ROWS/2);
    if (Math.abs(c - _ccx) < 30 && Math.abs(r - _ccy) < 30) return;
    const existing = GridManager.getEntity(c, r);
    if (existing && existing.type !== T.TREE && existing.type !== T.BUSH) return;
    const w = new Entity(T.WATER, c, r);
    if (flowDc !== undefined && flowDr !== undefined && (flowDc !== 0 || flowDr !== 0)) {
      w._flowDc = flowDc;
      w._flowDr = flowDr;
      w._isRiver = true;
      if (isLongRiver) w._isLongRiver = true;
    }
    GridManager.setEntity(c, r, w);
    WATER_SET.add(`${c},${r}`); _mark(c, r, true);
  }

  function spawnRiver() {
    // Small organic stream — wanders randomly, never crosses the map
    const cx = 15 + Math.floor(Math.random() * (COLS - 30));
    const cy = 15 + Math.floor(Math.random() * (ROWS - 30));
    const len = 10 + Math.floor(Math.random() * 15); // 10-25 steps
    const width = 2 + Math.floor(Math.random() * 3); // 2-4 wide
    let px = cx, py = cy;
    const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
    let [dc, dr] = dirs[Math.floor(Math.random()*4)];
    let drift = 0, stepsSinceDir = 0;

    for (let step = 0; step < len; step++) {
      stepsSinceDir++;
      // Randomly change direction
      if (stepsSinceDir > 4 + Math.floor(Math.random()*7)) {
        const turn = Math.random() < 0.5 ? 1 : -1;
        [dc, dr] = [-dr*turn, dc*turn];
        stepsSinceDir = 0;
      }
      drift += (Math.random()-0.5)*0.5; drift *= 0.8;
      px += dc; py += dr;
      if (!GridManager.inBounds(px, py)) break;
      const pdx = dr, pdy = dc;
      const currW = Math.max(1, width - Math.floor(step/(len*0.7)));
      for (let w2 = -Math.floor(currW/2); w2 <= Math.floor(currW/2); w2++) {
        placeWaterTile(px + pdx*w2, py + pdy*w2, dc, dr, true);
        if (Math.random() < 0.25) placeWaterTile(px + pdx*w2 + dc, py + pdy*w2 + dr, dc, dr, true);
      }
    }
  }

  function spawnLongRiver(forcedEdge) {
    // Long flowing river — runs roughly PARALLEL to a map edge,
    // staying in the outer band of the map (away from centre).
    // Tapers from narrow (source) to wide (mouth), meanders sinuously,
    // and sprouts small tributaries near the source.
    const edgeOffset = 8 + Math.floor(Math.random() * 14); // 8-21 tiles in from edge
    const len = 140 + Math.floor(Math.random() * 100); // 140-240 steps — much longer
    const widen = 1 + Math.floor(Math.random() * 3);      // +1-3 tiles across the whole river
    const startWidth = 1 + widen;                         // narrow source, but a bit wider
    const endWidth = 4 + Math.floor(Math.random() * 2) + widen;   // 4-5 (+widen) wide at mouth

    const edge = (forcedEdge !== undefined) ? forcedEdge : Math.floor(Math.random() * 4); // 0=top,1=right,2=bottom,3=left
    let px, py, dc, dr;
    if (edge === 0)      {
      px = 20 + Math.floor(Math.random() * (COLS - 40));
      py = edgeOffset;
      dc = Math.random() < 0.5 ? -1 : 1; dr = 0;
    } else if (edge === 1) {
      px = COLS - 1 - edgeOffset;
      py = 20 + Math.floor(Math.random() * (ROWS - 40));
      dc = 0; dr = Math.random() < 0.5 ? -1 : 1;
    } else if (edge === 2) {
      px = 20 + Math.floor(Math.random() * (COLS - 40));
      py = ROWS - 1 - edgeOffset;
      dc = Math.random() < 0.5 ? -1 : 1; dr = 0;
    } else {
      px = edgeOffset;
      py = 20 + Math.floor(Math.random() * (ROWS - 40));
      dc = 0; dr = Math.random() < 0.5 ? -1 : 1;
    }

    const minPerp = 4;
    const maxPerp = Math.floor(Math.min(COLS, ROWS) * 0.22);

    // Sinuous meander: low-frequency sine wave drives perpendicular drift
    const wavePhase = Math.random() * Math.PI * 2;
    const waveFreq = 0.08 + Math.random() * 0.05; // slow undulation
    const waveAmp = 0.55; // probability bias strength

    // Track centerline points for tributary placement
    const centerline = [];

    for (let step = 0; step < len; step++) {
      // Sinuous side-drift: bias direction of perpendicular nudge by sine
      const wave = Math.sin(wavePhase + step * waveFreq); // -1..1
      if (Math.random() < Math.abs(wave) * waveAmp) {
        const pdc = -dr, pdr = dc;
        const drift = wave > 0 ? 1 : -1;
        px += pdc * drift; py += pdr * drift;
      }

      px += dc; py += dr;
      if (!GridManager.inBounds(px, py)) break;

      const perpDist = (edge === 0) ? py
                    : (edge === 2) ? (ROWS - 1 - py)
                    : (edge === 3) ? px
                    :                (COLS - 1 - px);
      if (perpDist > maxPerp) {
        if (edge === 0) py--;
        else if (edge === 2) py++;
        else if (edge === 3) px--;
        else px++;
      } else if (perpDist < minPerp) {
        if (edge === 0) py++;
        else if (edge === 2) py--;
        else if (edge === 3) px++;
        else px--;
      }
      if (!GridManager.inBounds(px, py)) break;

      centerline.push({ x: px, y: py, dc, dr, step });

      // Tapered width along length
      const t = step / Math.max(1, len - 1);
      const currW = Math.max(1, Math.round(startWidth + (endWidth - startWidth) * t));

      const pdx = -dr, pdy = dc;
      for (let w2 = -Math.floor(currW/2); w2 <= Math.floor(currW/2); w2++) {
        placeWaterTile(px + pdx*w2, py + pdy*w2, dc, dr, true);
        if (Math.random() < 0.3) placeWaterTile(px + pdx*w2 + dc, py + pdy*w2 + dr, dc, dr, true);
      }
    }

    // Delta / pool at the mouth — blob of water at the final centerline point
    if (centerline.length > 0) {
      const mouth = centerline[centerline.length - 1];
      const deltaR = 3 + Math.floor(Math.random() * 2); // 3-4 radius
      for (let dy = -deltaR; dy <= deltaR; dy++) {
        for (let dx = -deltaR; dx <= deltaR; dx++) {
          if (dx*dx + dy*dy <= deltaR*deltaR + Math.random()*2) {
            placeWaterTile(mouth.x + dx, mouth.y + dy, mouth.dc, mouth.dr, true);
          }
        }
      }
    }

    // Tributaries — small branching streams off the upstream third
    const numTribs = 1 + Math.floor(Math.random() * 3); // 1-3
    const upstreamPts = centerline.slice(0, Math.floor(centerline.length * 0.45));
    for (let i = 0; i < numTribs && upstreamPts.length > 0; i++) {
      const anchor = upstreamPts[Math.floor(Math.random() * upstreamPts.length)];
      // Branch off perpendicular, toward map edge (so tributary stays in outer band)
      let tdc, tdr;
      const side = Math.random() < 0.5 ? 1 : -1;
      tdc = -anchor.dr * side;
      tdr = anchor.dc * side;
      // Force tributary to head toward the nearest edge, not inward
      if (edge === 0 && tdr > 0) { tdc = -tdc; tdr = -tdr; }
      else if (edge === 2 && tdr < 0) { tdc = -tdc; tdr = -tdr; }
      else if (edge === 3 && tdc > 0) { tdc = -tdc; tdr = -tdr; }
      else if (edge === 1 && tdc < 0) { tdc = -tdc; tdr = -tdr; }

      let tx = anchor.x, ty = anchor.y;
      const tlen = 5 + Math.floor(Math.random() * 8); // 5-12
      // Tributary flows TOWARD the main river — so flow direction is opposite of (tdc,tdr)
      const tFlowDc = -tdc, tFlowDr = -tdr;
      for (let s = 0; s < tlen; s++) {
        if (s > 0 && Math.random() < 0.35) { tx += anchor.dc; ty += anchor.dr; }
        tx += tdc; ty += tdr;
        if (!GridManager.inBounds(tx, ty)) break;
        placeWaterTile(tx, ty, tFlowDc, tFlowDr, true);
        if (s < tlen * 0.6 && Math.random() < 0.5) {
          placeWaterTile(tx - tdr, ty + tdc, tFlowDc, tFlowDr, true);
        }
      }
    }
  }

  // ── World water ─────────────────────────────────────────────────
  // Water is spread over the whole map, not just its rim:
  //   • winding rivers that cross the interior from one edge to another,
  //     steering round the city, with islands, oxbow lakes, the odd lake
  //     they run through, and waterfalls;
  //   • lakes scattered on a jittered grid so every region gets some —
  //     ponds, ordinary lakes and a few big ones, with irregular shores and
  //     islands in the larger ones;
  //   • marshes (clusters of small ponds) and cascades (a chain of lakes
  //     stepping down, joined by streams that drop over waterfalls);
  //   • a couple of the old edge-hugging rivers and short streams.
  // Waterfall tiles carry _waterfall (drawn by renderWaterEffects) and
  // survive a save through the water string's fourth flag.
  const CITY_CLEAR = 60;             // rivers steer round this radius of City Hall
  const LAKE_CLEAR = 48;             // no lake centre closer than this (+ its size)
  const _cx = () => Math.floor(COLS / 2), _cy = () => Math.floor(ROWS / 2);
  const _rand = (a, b) => a + Math.random() * (b - a);
  const _randi = (a, b) => Math.floor(_rand(a, b + 1));
  const _distCity = (x, y) => Math.hypot(x - _cx(), y - _cy());

  // Paints a filled disc of water. `flow` (dc, dr) marks it as moving river water.
  function _disc(x, y, rad, flow, isLong) {
    const R = Math.max(0.5, rad);
    for (let r = Math.floor(y - R); r <= Math.ceil(y + R); r++)
      for (let c = Math.floor(x - R); c <= Math.ceil(x + R); c++) {
        const dx = c + 0.5 - x, dy = r + 0.5 - y;
        if (dx * dx + dy * dy <= R * R) {
          if (flow) placeWaterTile(c, r, flow[0], flow[1], isLong);
          else placeWaterTile(c, r);
        }
      }
  }
  // Cardinal flow from a heading angle (the reservoir/dam code reads cardinal flows).
  const _flowOf = a => Math.abs(Math.cos(a)) >= Math.abs(Math.sin(a))
    ? [Math.sign(Math.cos(a)) || 1, 0] : [0, Math.sign(Math.sin(a)) || 1];

  // Marks the line of water across the channel at (x, y), bank to bank, as
  // a waterfall. Refuses (returns false) where the channel isn't a clean,
  // narrow river there — a fall half-way across a lake mouth reads as a pier.
  function _markWaterfall(x, y, a, halfW) {
    const px = -Math.sin(a), py = Math.cos(a);
    const cx0 = Math.floor(x), cy0 = Math.floor(y);
    const e0 = GridManager.getEntity(cx0, cy0);
    if (!e0 || e0.type !== T.WATER || !e0._isRiver) return false;
    const tiles = [e0];
    for (const s of [1, -1]) {
      let k = 1, bank = false;
      for (; k <= halfW + 4; k++) {
        const e = GridManager.getEntity(Math.floor(x + px * k * s), Math.floor(y + py * k * s));
        if (!e || e.type !== T.WATER) { bank = true; break; }
        if (!e._isRiver) return false;
        tiles.push(e);
      }
      if (!bank) return false;
    }
    for (const e of tiles) e._waterfall = true;
    return true;
  }

  // Irregular lake: a harmonic-wobbled blob unioned with a few lobes, with
  // islands left dry in the bigger ones.
  function _lake(cx, cy, size, opts = {}) {
    const harm = [];
    for (let k = 2; k <= 6; k++) harm.push({ k, a: _rand(0.05, 0.17) * (k === 2 ? 1.8 : k === 3 ? 1.3 : 1), p: Math.random() * 6.283 });
    // Stretch along a random axis so lakes aren't all round.
    const stretch = _rand(1, size >= 18 ? 1.35 : 1.9), sa = Math.random() * Math.PI;   // big lakes stay big, not huge
    const lobes = [];
    const nl = _randi(1, 4);
    for (let i = 0; i < nl; i++) {
      const ang = Math.random() * 6.283, d = size * _rand(0.55, 1.05);
      lobes.push({ x: cx + Math.cos(ang) * d, y: cy + Math.sin(ang) * d, r: size * _rand(0.3, 0.55) });
    }
    const islands = [];
    if (size >= 14 && !opts.noIslands) {
      const ni = size >= 20 ? _randi(1, 3) : (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < ni; i++) {
        const ang = Math.random() * 6.283, d = size * _rand(0.1, 0.45);
        islands.push({ x: cx + Math.cos(ang) * d, y: cy + Math.sin(ang) * d, r: _rand(2.6, Math.max(3, size * 0.2)) });
      }
    }
    const flow = opts.flow || null;
    const B = size * 2.4;
    for (let r = Math.floor(cy - B); r <= Math.ceil(cy + B); r++)
      for (let c = Math.floor(cx - B); c <= Math.ceil(cx + B); c++) {
        const rx = c + 0.5 - cx, ry = r + 0.5 - cy;
        // Undo the stretch so the shape test runs on a round blob.
        const ca = Math.cos(sa), sn = Math.sin(sa);
        const dx = (rx * ca + ry * sn) / stretch, dy = -rx * sn + ry * ca;
        const th = Math.atan2(dy, dx);
        let rad = size;
        for (const h of harm) rad += size * h.a * Math.sin(h.k * th + h.p);
        let wet = dx * dx + dy * dy <= rad * rad;
        if (!wet) for (const l of lobes) if ((c + 0.5 - l.x) ** 2 + (r + 0.5 - l.y) ** 2 <= l.r * l.r) { wet = true; break; }
        if (!wet) continue;
        let isle = false;
        for (const is of islands) if ((c + 0.5 - is.x) ** 2 + (r + 0.5 - is.y) ** 2 <= is.r * is.r) { isle = true; break; }
        if (isle) continue;
        if (flow) placeWaterTile(c, r, flow[0], flow[1]); else placeWaterTile(c, r);
      }
  }

  // Carves a winding channel from (x0,y0) toward (x1,y1). Returns the
  // centreline. Options: w0/w1 (width at source/mouth), wander, isLong,
  // falls (number of waterfalls), islands, oxbow, lakes (chance per 100
  // steps of widening into a lake it runs through), maxSteps.
  function _channel(x0, y0, x1, y1, o = {}) {
    let x = x0, y = y0;
    let a = Math.atan2(y1 - y0, x1 - x0), turn = 0;
    const total = Math.hypot(x1 - x0, y1 - y0);
    const maxSteps = o.maxSteps || Math.ceil(total * 1.8) + 20;
    const wander = o.wander ?? 0.05;
    const line = [];
    for (let step = 0; step < maxSteps; step++) {
      const toT = Math.atan2(y1 - y, x1 - x);
      let diff = toT - a; while (diff > Math.PI) diff -= 6.283; while (diff < -Math.PI) diff += 6.283;
      turn = turn * 0.92 + (Math.random() - 0.5) * wander;
      a += turn + diff * 0.035;
      // Keep clear of the city: bend away when heading into it.
      const dc = _distCity(x, y);
      if (dc < CITY_CLEAR + 25) {
        const away = Math.atan2(y - _cy(), x - _cx());
        let d2 = away - a; while (d2 > Math.PI) d2 -= 6.283; while (d2 < -Math.PI) d2 += 6.283;
        a += d2 * (dc < CITY_CLEAR ? 0.35 : 0.12);
      }
      x += Math.cos(a); y += Math.sin(a);
      if (x < -2 || y < -2 || x > COLS + 2 || y > ROWS + 2) break;
      const t = step / Math.max(1, total);
      const w = (o.w0 ?? 2) + ((o.w1 ?? 5) - (o.w0 ?? 2)) * Math.min(1, t);
      line.push({ x, y, a, w });
      if (Math.hypot(x1 - x, y1 - y) < 1.5) break;
    }
    // Islands: the channel splits round a dry strip for a stretch.
    const splits = new Set();
    for (let i = 0; i < (o.islands || 0); i++) {
      if (line.length < 80) break;
      const s = _randi(Math.floor(line.length * 0.2), Math.floor(line.length * 0.8));
      const len = _randi(10, 22);
      for (let k = s; k < s + len && k < line.length; k++) splits.add(k);
    }
    // Paint.
    for (let k = 0; k < line.length; k++) {
      const p = line[k], f = _flowOf(p.a), hw = p.w / 2;
      if (splits.has(k)) {
        const nx = -Math.sin(p.a), ny = Math.cos(p.a), off = hw + 1.6;
        _disc(p.x + nx * off, p.y + ny * off, Math.max(1, hw * 0.75), f, o.isLong);
        _disc(p.x - nx * off, p.y - ny * off, Math.max(1, hw * 0.75), f, o.isLong);
      } else {
        _disc(p.x, p.y, hw, f, o.isLong);
      }
    }
    // Lakes it runs through.
    if (o.lakes) for (let k = 60; k < line.length - 60; k += 100) {
      if (Math.random() < o.lakes && _distCity(line[k].x, line[k].y) > LAKE_CLEAR + 16) {
        _lake(line[k].x, line[k].y, _rand(7, 13), { flow: _flowOf(line[k].a), noIslands: true });
        k += 60;
      }
    }
    // Oxbow: a crescent cut-off meander beside a bend.
    for (let i = 0; i < (o.oxbow || 0); i++) {
      if (line.length < 60) break;
      const p = line[_randi(20, line.length - 20)];
      const side = Math.random() < 0.5 ? 1 : -1, R = _rand(6, 10);
      const nx = -Math.sin(p.a) * side, ny = Math.cos(p.a) * side;
      const ox = p.x + nx * (R + p.w / 2 + 3), oy = p.y + ny * (R + p.w / 2 + 3);
      const base = Math.atan2(-ny, -nx);
      for (let th = -1.25; th <= 1.25; th += 0.07) _disc(ox + Math.cos(base + th) * R, oy + Math.sin(base + th) * R, 1.6 * (1 - Math.abs(th) / 2.2));
    }
    // Waterfalls: a lip across the channel, well away from the ends and each other.
    const falls = [];
    for (let i = 0; i < (o.falls || 0); i++) {
      if (line.length < 30) break;
      for (let tries = 0; tries < 12; tries++) {
        const k = _randi(Math.floor(line.length * 0.15), Math.floor(line.length * 0.85));
        if (splits.has(k) || falls.some(f => Math.abs(f - k) < 40)) continue;
        const p = line[k];
        if (!_markWaterfall(p.x, p.y, p.a, p.w / 2)) continue;
        falls.push(k);
        // A plunge pool just below the drop.
        const below = line[Math.min(line.length - 1, k + 3)];
        _disc(below.x, below.y, p.w / 2 + 1.2, _flowOf(below.a), o.isLong);
        break;
      }
    }
    return line;
  }

  // A random point on map edge `side` (0 top, 1 right, 2 bottom, 3 left).
  function _edgePoint(side) {
    const m = 25;
    if (side === 0) return [_rand(m, COLS - m), -1];
    if (side === 1) return [COLS + 1, _rand(m, ROWS - m)];
    if (side === 2) return [_rand(m, COLS - m), ROWS + 1];
    return [-1, _rand(m, ROWS - m)];
  }

  // Distance from the city to the segment (x0,y0)-(x1,y1).
  function _segDistCity(x0, y0, x1, y1) {
    const vx = x1 - x0, vy = y1 - y0, L2 = vx * vx + vy * vy || 1;
    const u = Math.max(0, Math.min(1, ((_cx() - x0) * vx + (_cy() - y0) * vy) / L2));
    return Math.hypot(x0 + vx * u - _cx(), y0 + vy * u - _cy());
  }

  // A river across the interior. Its course is picked so the straight line
  // passes well clear of the city — otherwise every river aims through the
  // middle and they all bunch into a ring round City Hall. Some rise from a
  // lake out in the country instead of entering from an edge.
  function spawnCrossRiver(minD = 85, maxD = 210) {
    let x0, y0, x1, y1, fromLake = false;
    for (let tries = 0; tries < 30; tries++) {
      const s0 = _randi(0, 3);
      const s1 = Math.random() < 0.5 ? (s0 + 2) % 4 : (s0 + (Math.random() < 0.5 ? 1 : 3)) % 4;
      [x1, y1] = _edgePoint(s1);
      fromLake = Math.random() < 0.3;
      if (fromLake) { const sp = _clearSpot(10); if (!sp) continue; [x0, y0] = sp; }
      else [x0, y0] = _edgePoint(s0);
      const d = _segDistCity(x0, y0, x1, y1);
      if (d > minD && d < maxD && Math.hypot(x1 - x0, y1 - y0) > 250) break;
    }
    if (fromLake) _lake(x0, y0, _rand(9, 15));
    _channel(x0, y0, x1, y1, {
      w0: _rand(2, 3), w1: _rand(4.5, 7), wander: _rand(0.04, 0.08), isLong: true,
      falls: _randi(1, 2), islands: _randi(0, 2), oxbow: _randi(0, 2), lakes: 0.3,
    });
  }

  function _clearSpot(size) {
    for (let tries = 0; tries < 40; tries++) {
      const x = _rand(size + 6, COLS - size - 6), y = _rand(size + 6, ROWS - size - 6);
      if (_distCity(x, y) > LAKE_CLEAR + size) return [x, y];
    }
    return null;
  }

  // A marsh: a scatter of small ponds.
  function spawnMarsh(x, y) {
    const n = _randi(6, 14);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * 6.283, d = _rand(0, 20);
      const px = x + Math.cos(ang) * d, py = y + Math.sin(ang) * d;
      if (_distCity(px, py) < LAKE_CLEAR) continue;
      _lake(px, py, _rand(1.8, 4.2), { noIslands: true });
    }
  }

  // A cascade: 3–4 lakes stepping down, each joined to the next by a
  // stream that falls over a waterfall.
  function spawnCascade(x, y) {
    const n = _randi(3, 4);
    let a = Math.random() * 6.283;
    let prev = null;
    for (let i = 0; i < n; i++) {
      const size = _rand(5, 10);
      if (_distCity(x, y) < LAKE_CLEAR + size || x < size + 4 || y < size + 4 || x > COLS - size - 4 || y > ROWS - size - 4) break;
      _lake(x, y, size, { noIslands: true });
      if (prev) _channel(prev.x, prev.y, x, y, { w0: 2.2, w1: 3, wander: 0.05, falls: 1, maxSteps: 90 });
      prev = { x, y };
      a += _rand(-0.6, 0.6);
      const d = size + _rand(18, 30);
      x += Math.cos(a) * d; y += Math.sin(a) * d;
    }
  }

  function generate() {
    _clearAll();
    // Regions on a jittered grid, so lakes land all over the map rather
    // than wherever the dice happen to cluster them.
    const CELL = 150;
    const nc = Math.max(1, Math.round(COLS / CELL)), nr = Math.max(1, Math.round(ROWS / CELL));
    for (let gy = 0; gy < nr; gy++) for (let gx = 0; gx < nc; gx++) {
      const x = (gx + _rand(0.2, 0.8)) * COLS / nc, y = (gy + _rand(0.2, 0.8)) * ROWS / nr;
      const roll = Math.random();
      if (roll < 0.43) {
        const kind = Math.random();
        const size = kind < 0.15 ? _rand(5, 8) : kind < 0.72 ? _rand(9, 16) : _rand(18, 27);   // pond / lake / big lake
        if (_distCity(x, y) > LAKE_CLEAR + size && x > size + 4 && y > size + 4 && x < COLS - size - 4 && y < ROWS - size - 4) _lake(x, y, size);
      } else if (roll < 0.53) {
        if (_distCity(x, y) > LAKE_CLEAR + 20) spawnMarsh(x, y);
      } else if (roll < 0.62) {
        spawnCascade(x, y);
      }
    }
    // A few extra lakes anywhere, so the grid doesn't read as a grid.
    for (let i = 0, n = Math.round(_randi(3, 5) * WORLD_AREA_SCALE); i < n; i++) {
      const size = _rand(6, 14), s = _clearSpot(size);
      if (s) _lake(s[0], s[1], size);
    }
    // Rivers across the interior.
    // One always runs within reach of the city — an early game needs water
    // for extractors and a river to dam — the rest wherever they fall.
    // On a bigger map the others spread further out and there are more of
    // them (and fewer on a small one), so rivers cover the land at the same
    // density rather than bunching round the city.
    spawnCrossRiver(75, 115);
    for (let i = 0, n = Math.max(1, Math.round(3 * WORLD_SPAN_SCALE)); i < n; i++) spawnCrossRiver(85, 210 * WORLD_SPAN_SCALE);
    // A couple of rivers along the rim, and short streams.
    const edges = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    for (let i = 0, n = _randi(1, 2); i < n; i++) spawnLongRiver(edges[i]);
    for (let i = 0, n = Math.round(_randi(6, 9) * WORLD_AREA_SCALE); i < n; i++) spawnRiver();
  }

  function save() {
    const tiles = [];
    WATER_SET.forEach(k => {
      const [c, r] = k.split(',').map(Number);
      const e = GridManager.getEntity(c, r);
      if (e && e._isRiver) {
        const lr = e._isLongRiver ? 'L' : 'S';
        tiles.push(`${k}:${e._flowDc},${e._flowDr},${lr}${e._waterfall ? ',F' : ''}`);
      } else {
        tiles.push(k);
      }
    });
    return tiles;
  }

  function load(tiles) {
    _clearAll();
    if (!tiles) return;
    for (const key of tiles) {
      const [coord, flow] = key.split(':');
      const [c, r] = coord.split(',').map(Number);
      if (flow) {
        const parts = flow.split(',');
        const fdc = Number(parts[0]);
        const fdr = Number(parts[1]);
        const isLong = parts[2] === 'L';
        placeWaterTile(c, r, fdc, fdr, isLong);
        if (parts[3] === 'F') { const w = GridManager.getEntity(c, r); if (w && w.type === T.WATER) w._waterfall = true; }
      } else {
        placeWaterTile(c, r);
      }
    }
  }

  // Hooks for ReservoirSystem (dam build/delete need to sync WATER_SET)
  function _unregister(c, r) { WATER_SET.delete(`${c},${r}`); _mark(c, r, false); _invalidateAround(c, r); _lookChanged(c, r); }
  function _register(c, r)   { WATER_SET.add(`${c},${r}`);    _mark(c, r, true);  _invalidateAround(c, r); _lookChanged(c, r); }
  // Only the water look round this tile is now wrong: re-bake just that, at once.
  function _lookChanged(c, r) {
    if (typeof WaterLook === 'undefined') return;
    if (WaterLook.waterChanged) WaterLook.waterChanged(c, r); else WaterLook.invalidate(true);
  }

  // renderWater() caches each water tile's shoreline mask (which edges
  // border non-water) instead of doing 4 grid lookups every frame for
  // every visible water tile. That cache only needs to be busted when a
  // tile's water-ness actually changes — placing/removing a water tile
  // can change the mask of itself AND its 4 neighbours, so all five get
  // their cached mask cleared here and recomputed lazily on next render.
  function _invalidateShoreMask(c, r) {
    const e = GridManager.getEntity(c, r);
    if (e && e.type === T.WATER) e._shoreMask = undefined;
  }
  function _invalidateAround(c, r) {
    _invalidateShoreMask(c, r);
    _invalidateShoreMask(c + 1, r);
    _invalidateShoreMask(c - 1, r);
    _invalidateShoreMask(c, r + 1);
    _invalidateShoreMask(c, r - 1);
  }

  // Exposes the raw tile set (read-only use expected) for callers that need
  // to enumerate all water tiles rather than point-query one at a time —
  // e.g. TruckRouting building a buffered-distance test for auto-dispatched
  // trucks, where per-cell brute-force scanning would be far too slow.
  function getWaterTiles() { return WATER_SET; }

  return { generate, save, load, isWater, getWaterTiles, _register, _unregister };
})();

// ─── Landscape: forests ─────────────────────────────────────────────
// Runs on a new world after water and City Hall. Trees follow a smooth
// noise field, so the map has real forests — dense cores, a scrub fringe
// of bushes, open ground with the odd lone tree, and trees lining rivers
// and lake shores — instead of an even sprinkle. Forest thins out round
// City Hall so the start stays open. The total stays close to the old
// ~1.4% cover: every tree is a saved entity.
function generateLandscape() {
  const cx = COLS / 2, cy = ROWS / 2;
  // Smooth value noise, fresh per world.
  const noise = cell => {
    const w = Math.ceil(COLS / cell) + 2, h = Math.ceil(ROWS / cell) + 2;
    const g = new Float32Array(w * h);
    for (let i = 0; i < g.length; i++) g[i] = Math.random();
    return (c, r) => {
      const x = c / cell, y = r / cell, x0 = Math.floor(x), y0 = Math.floor(y);
      const fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = g[y0 * w + x0], b = g[y0 * w + x0 + 1], c2 = g[(y0 + 1) * w + x0], d = g[(y0 + 1) * w + x0 + 1];
      return (a + (b - a) * sx) + ((c2 + (d - c2) * sx) - (a + (b - a) * sx)) * sy;
    };
  };
  const n1 = noise(70), n2 = noise(24), n3 = noise(8);
  const place = (type, c, r) => {
    const e = new Entity(type, c, r);
    e._chopProgress = 0;
    GridManager.setEntity(c, r, e);
  };
  const M = 3;
  for (let r = M; r < ROWS - M; r++) {
    for (let c = M; c < COLS - M; c++) {
      if (GridManager.getEntity(c, r)) continue;                    // water, City Hall
      const v = n1(c, r) * 0.6 + n2(c, r) * 0.3 + n3(c, r) * 0.1;
      // Dense forest is kept sparing: only the highest noise peaks become
      // woodland, so it turns up as the occasional patch, not a carpet.
      const forest = Math.max(0, Math.min(1, (v - 0.735) / 0.1)); // 0 open ground … 1 deep forest
      const d = Math.hypot(c - cx, r - cy);
      const calm = d < 70 ? Math.max(0.15, d / 70) : 1;           // keep the start area open
      // Cores top out near 42% cover: canopies are wider than a tile, so that
      // already reads as closed woodland, and trees are the costliest thing
      // on the map to draw (a full screen of 60% forest cost ~8ms a frame).
      let pTree = (0.0045 + 0.42 * Math.pow(forest, 2)) * calm;   // a light sprinkle everywhere else
      const pBush = (0.004 + (forest > 0.04 && forest < 0.5 ? 0.025 : 0)) * calm;
      const u = Math.random();
      if (u < 0.06 && (WaterSystem.isWater(c + 1, r) || WaterSystem.isWater(c - 1, r) || WaterSystem.isWater(c, r + 1) || WaterSystem.isWater(c, r - 1))) {
        pTree += 0.05 * calm;                                        // trees along the banks
      }
      if (u < pTree) place(T.TREE, c, r);
      else if (u < pTree + pBush) place(T.BUSH, c, r);
    }
  }
}

// ─── Biofuel System ───────────────────────────────────────────────
