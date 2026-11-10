/* ═══════════════════════════════════════════════════════════════════
   MENU SYSTEM
   Main build-menu / category selection UI.
   ═══════════════════════════════════════════════════════════════════ */

const MenuSystem = (() => {
  // Main menu backdrop: a night skyline on a glowing perspective grid, with
  // two rows of transmission pylons marching to the horizon. Everything that
  // doesn't move is painted once to an offscreen layer on resize; each frame
  // only adds the live bits (window twinkle, current pulses on the wires,
  // floor pulses, embers, distant lightning, and arcs over the wordmark).
  function initMenuBackground() {
    const canvas = document.getElementById('menu-grid-bg');
    const ctx = canvas.getContext('2d');
    const arcCanvas = document.getElementById('gw-arc-canvas');
    const arcCtx = arcCanvas ? arcCanvas.getContext('2d') : null;
    const titleEl = document.querySelector('#main-menu .menu-logo-title');
    const layer = document.createElement('canvas');
    const lctx = layer.getContext('2d');

    const CAM_H = 1.6, FAR = 90;
    const PYLON_H = 12;
    const ARMS = [ { y: 11.6, w: 2.6 }, { y: 9.6, w: 3.4 }, { y: 7.6, w: 2.6 } ];
    let W, H, HY, F, animId, startT = performance.now();
    let windows, wires, pylonTops, embers, stars;
    let floorPulses = [], wirePulses = [], bolt = null, nextBolt = 3, arcs = [], nextArc = 0;
    let titleT = null, firstBurst = false;

    const rand = (a, b) => a + Math.random() * (b - a);
    function proj(x, y, z) { return { x: W / 2 + x * F / z, y: HY + (CAM_H - y) * F / z, s: F / z }; }

    function buildLayer() {
      layer.width = W; layer.height = H;
      const g = lctx;

      // Sky
      const sky = g.createLinearGradient(0, 0, 0, HY);
      sky.addColorStop(0, '#02040a');
      sky.addColorStop(0.6, '#051425');
      sky.addColorStop(1, '#0b3148');
      g.fillStyle = sky; g.fillRect(0, 0, W, HY + 1);

      stars = [];
      for (let i = 0; i < 180; i++) {
        const s = { x: Math.random() * W, y: Math.pow(Math.random(), 1.6) * HY * 0.85, r: Math.random() < 0.1 ? 1.4 : 0.8, a: rand(0.2, 0.8), p: rand(0, 6.28) };
        if (Math.random() < 0.85) { g.fillStyle = `rgba(190,225,255,${s.a * 0.7})`; g.fillRect(s.x, s.y, s.r, s.r); }
        else stars.push(s); // the rest twinkle live
      }

      // Horizon glow — a cool band plus a warm city haze in the middle
      const glow = g.createRadialGradient(W / 2, HY, 0, W / 2, HY, W * 0.6);
      glow.addColorStop(0, 'rgba(0,200,255,0.35)');
      glow.addColorStop(0.35, 'rgba(0,120,200,0.12)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = glow; g.fillRect(0, 0, W, H);
      const warm = g.createRadialGradient(W / 2, HY, 0, W / 2, HY, W * 0.28);
      warm.addColorStop(0, 'rgba(255,170,60,0.22)');
      warm.addColorStop(1, 'rgba(255,170,60,0)');
      g.fillStyle = warm; g.fillRect(0, HY - W * 0.28, W, W * 0.56);

      // Skyline — two depths of buildings, the nearer one darker and taller
      windows = [];
      [[0.55, '#07142a', 0.6], [1, '#040a14', 1]].forEach(([hScale, col, winChance]) => {
        let x = -10;
        while (x < W + 10) {
          const bw = rand(14, 46);
          const centre = 1 - Math.min(1, Math.abs(x - W / 2) / (W * 0.55));
          const bh = (rand(12, 40) + centre * centre * rand(20, 110)) * hScale * (H / 900);
          g.fillStyle = col;
          g.fillRect(x, HY - bh, bw, bh + 1);
          if (Math.random() < 0.15 && bh > 50) { g.fillRect(x + bw / 2 - 1, HY - bh - 14, 2, 14); windows.push({ x: x + bw / 2 - 1.5, y: HY - bh - 16, w: 3, h: 3, red: true, p: rand(0, 6) }); }
          if (hScale === 1) {
            for (let wy = HY - bh + 5; wy < HY - 4; wy += 6)
              for (let wx = x + 3; wx < x + bw - 4; wx += 5)
                if (Math.random() < 0.22 * winChance) windows.push({ x: wx, y: wy, w: 2, h: 2, warm: Math.random() < 0.55, a: rand(0.3, 0.95), p: rand(0, 6.28), sp: rand(0.2, 1.5) });
          }
          x += bw + rand(0, 6);
        }
      });

      // Floor
      const floor = g.createLinearGradient(0, HY, 0, H);
      floor.addColorStop(0, '#062033');
      floor.addColorStop(0.25, '#030c16');
      floor.addColorStop(1, '#010308');
      g.fillStyle = floor; g.fillRect(0, HY, W, H - HY);

      g.lineWidth = 1;
      for (let z = 2; z < FAR; z += 2.5) {
        const p = proj(0, 0, z);
        if (p.y > H) continue;
        g.strokeStyle = `rgba(0,212,255,${0.55 * Math.pow(1 - z / FAR, 2)})`;
        g.beginPath(); g.moveTo(0, p.y); g.lineTo(W, p.y); g.stroke();
      }
      for (let x = -80; x <= 80; x += 2.5) {
        const a = proj(x, 0, 1.2), b = proj(x, 0, FAR);
        const grad = g.createLinearGradient(a.x, a.y, b.x, b.y);
        grad.addColorStop(0, 'rgba(0,212,255,0.5)');
        grad.addColorStop(1, 'rgba(0,212,255,0)');
        g.strokeStyle = grad;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
      // Bright horizon seam
      const seam = g.createLinearGradient(0, 0, W, 0);
      seam.addColorStop(0, 'rgba(120,235,255,0)');
      seam.addColorStop(0.5, 'rgba(160,245,255,0.9)');
      seam.addColorStop(1, 'rgba(120,235,255,0)');
      g.fillStyle = seam; g.fillRect(0, HY - 0.5, W, 1.5);

      // Pylons (far to near so nearer ones overlap) and the lines between them
      wires = []; pylonTops = [];
      const rows = [-13, 13];
      const zs = []; for (let z = 11; z < 85; z += 7) zs.push(z);
      for (const rx of rows) {
        for (let i = 0; i < zs.length - 1; i++) {
          for (const arm of ARMS) for (const side of [-1, 1]) {
            const pts = [];
            for (let k = 0; k <= 16; k++) {
              const t = k / 16;
              const z = zs[i] + (zs[i + 1] - zs[i]) * t;
              const x = rx + side * arm.w;
              const y = arm.y - 4 * 0.9 * t * (1 - t);
              pts.push(proj(x, y, z));
            }
            wires.push({ pts, near: zs[i] });
          }
        }
      }
      // Wires first (thin, dim), pylons on top
      for (const w of wires) {
        g.strokeStyle = `rgba(90,200,240,${0.45 * (1 - w.near / 90)})`;
        g.lineWidth = Math.max(0.6, w.pts[0].s * 0.03);
        g.beginPath();
        w.pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
        g.stroke();
      }
      for (let i = zs.length - 1; i >= 0; i--) for (const rx of rows) drawPylon(g, rx, zs[i]);
    }

    function drawPylon(g, x, z) {
      const P = (px, py) => proj(x + px, py, z);
      const s = F / z;
      const segs = [];
      const legW = (y) => 1.6 - (1.6 - 0.45) * (y / PYLON_H);
      // legs
      segs.push([P(-1.6, 0), P(-0.45, PYLON_H)], [P(1.6, 0), P(0.45, PYLON_H)]);
      // lattice bracing
      const steps = 7;
      for (let k = 0; k < steps; k++) {
        const y0 = PYLON_H * k / steps, y1 = PYLON_H * (k + 1) / steps;
        segs.push([P(-legW(y0), y0), P(legW(y1), y1)], [P(legW(y0), y0), P(-legW(y1), y1)], [P(-legW(y1), y1), P(legW(y1), y1)]);
      }
      // arms + peak
      for (const a of ARMS) {
        segs.push([P(-a.w, a.y), P(a.w, a.y)], [P(-a.w, a.y), P(-legW(a.y), a.y - 0.8)], [P(a.w, a.y), P(legW(a.y), a.y - 0.8)]);
      }
      segs.push([P(-0.45, PYLON_H), P(0, PYLON_H + 1.4)], [P(0.45, PYLON_H), P(0, PYLON_H + 1.4)]);
      const fade = 1 - z / 90;
      g.lineCap = 'round';
      g.strokeStyle = `rgba(0,212,255,${0.18 * fade})`;
      g.lineWidth = Math.max(1.2, s * 0.14);
      g.beginPath(); for (const [a, b] of segs) { g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); } g.stroke();
      g.strokeStyle = `rgba(${Math.round(8 + 60 * (1 - fade))},${Math.round(22 + 60 * (1 - fade))},${Math.round(36 + 70 * (1 - fade))},1)`;
      g.lineWidth = Math.max(0.8, s * 0.07);
      g.beginPath(); for (const [a, b] of segs) { g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); } g.stroke();
      const top = P(0, PYLON_H + 1.5);
      pylonTops.push({ x: top.x, y: top.y, r: Math.max(1.2, s * 0.12), p: Math.random() });
    }

    function resize() {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
      HY = Math.round(H * 0.66);
      F = H * 0.55;
      buildLayer();
      embers = Array.from({ length: 45 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: rand(8, 30), r: rand(0.6, 1.8), a: rand(0.2, 0.7) }));
      sizeArcCanvas();
    }

    function sizeArcCanvas() {
      if (!arcCanvas || !titleEl) return;
      arcCanvas.width  = titleEl.offsetWidth + 120;
      arcCanvas.height = titleEl.offsetHeight + 120;
      // Centre over the wordmark (the canvas is centred on .menu-logo)
      const logo = arcCanvas.parentElement;
      arcCanvas.style.top  = (titleEl.offsetTop + titleEl.offsetHeight / 2) + 'px';
      arcCanvas.style.left = (logo.offsetWidth / 2) + 'px';
    }

    // Midpoint-displacement lightning path
    function jag(x1, y1, x2, y2, disp, out) {
      if (disp < 3) { out.push([x2, y2]); return; }
      const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * disp;
      const my = (y1 + y2) / 2 + (Math.random() - 0.5) * disp;
      jag(x1, y1, mx, my, disp / 2, out);
      jag(mx, my, x2, y2, disp / 2, out);
    }
    function strokeBolt(g, pts, core, glow, width) {
      g.lineJoin = 'round';
      g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
      g.strokeStyle = glow; g.lineWidth = width * 5; g.stroke();
      g.strokeStyle = core; g.lineWidth = width; g.stroke();
    }

    function draw(now) {
      const t = (now - startT) / 1000;
      ctx.drawImage(layer, 0, 0);

      // Twinkling stars
      for (const s of stars) {
        ctx.fillStyle = `rgba(210,235,255,${s.a * (0.5 + 0.5 * Math.sin(t * 2 + s.p))})`;
        ctx.fillRect(s.x, s.y, s.r + 0.4, s.r + 0.4);
      }

      // Distant lightning: sky flash + a forked bolt down to the horizon
      if (t > nextBolt) {
        const x = rand(W * 0.05, W * 0.95);
        const pts = [[x, rand(0, HY * 0.3)]];
        jag(pts[0][0], pts[0][1], x + rand(-120, 120), HY - rand(20, 60), 140, pts);
        bolt = { pts, born: t };
        nextBolt = t + rand(5, 11);
      }
      if (bolt) {
        const age = t - bolt.born;
        if (age > 0.45) bolt = null;
        else {
          const on = age < 0.08 || (age > 0.16 && age < 0.24) || (age > 0.3 && age < 0.34);
          if (on) {
            ctx.fillStyle = 'rgba(120,200,255,0.07)';
            ctx.fillRect(0, 0, W, HY);
            strokeBolt(ctx, bolt.pts, 'rgba(235,250,255,0.9)', 'rgba(120,210,255,0.18)', 1.4);
          }
        }
      }

      // City windows
      for (const w of windows) {
        if (w.red) {
          const on = Math.sin(t * 2.2 + w.p) > 0.2;
          ctx.fillStyle = on ? 'rgba(255,60,60,0.95)' : 'rgba(120,20,20,0.5)';
          ctx.fillRect(w.x, w.y, w.w, w.h);
          continue;
        }
        const a = w.a * (0.75 + 0.25 * Math.sin(t * w.sp + w.p));
        ctx.fillStyle = w.warm ? `rgba(255,200,110,${a})` : `rgba(140,230,255,${a})`;
        ctx.fillRect(w.x, w.y, w.w, w.h);
      }

      // Aviation lights on the pylons
      for (const p of pylonTops) {
        const on = ((t * 0.7 + p.p) % 1) < 0.18;
        if (!on) continue;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,50,50,0.25)'; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = '#ff5050'; ctx.fill();
      }

      // Current pulses along the lines
      if (wirePulses.length < 18 && Math.random() < 0.25) {
        const w = wires[Math.floor(Math.random() * wires.length)];
        wirePulses.push({ w, t0: t, dur: rand(0.6, 1.4), dir: Math.random() < 0.5 });
      }
      ctx.globalCompositeOperation = 'lighter';
      wirePulses = wirePulses.filter(p => {
        let k = (t - p.t0) / p.dur;
        if (k >= 1) return false;
        if (p.dir) k = 1 - k;
        const pts = p.w.pts, f = k * (pts.length - 1), i = Math.floor(f), fr = f - i;
        const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
        const x = a.x + (b.x - a.x) * fr, y = a.y + (b.y - a.y) * fr;
        const r = Math.max(2, a.s * 0.25);
        const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
        grd.addColorStop(0, 'rgba(220,250,255,0.95)');
        grd.addColorStop(0.3, 'rgba(0,212,255,0.5)');
        grd.addColorStop(1, 'rgba(0,212,255,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
        return true;
      });

      // Pulses racing down the floor grid toward the horizon
      if (floorPulses.length < 10 && Math.random() < 0.06) {
        floorPulses.push({ x: Math.round(rand(-24, 24)) * 2.5, t0: t, gold: Math.random() < 0.25 });
      }
      ctx.lineCap = 'round';
      floorPulses = floorPulses.filter(p => {
        const z = 1.5 + (t - p.t0) * 14;
        if (z > FAR * 0.8) return false;
        const a = proj(p.x, 0, z), b = proj(p.x, 0, z + 5);
        const alpha = 1 - z / (FAR * 0.8);
        const grd = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        const c = p.gold ? '255,200,80' : '120,240,255';
        grd.addColorStop(0, `rgba(${c},0)`);
        grd.addColorStop(1, `rgba(${c},${alpha})`);
        ctx.strokeStyle = grd;
        ctx.lineWidth = Math.max(1, a.s * 0.05);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        return true;
      });

      // Rising embers
      for (const e of embers) {
        e.y -= e.v / 60;
        if (e.y < -4) { e.y = H + 4; e.x = Math.random() * W; }
        ctx.fillStyle = `rgba(120,230,255,${e.a * (0.6 + 0.4 * Math.sin(t * 3 + e.x))})`;
        ctx.fillRect(e.x + Math.sin(t + e.v) * 6, e.y, e.r, e.r);
      }
      ctx.globalCompositeOperation = 'source-over';

      drawArcs(t);
      animId = requestAnimationFrame(draw);
    }

    // Arcs of current that snap between points on the wordmark
    function drawArcs(t) {
      if (!arcCtx) return;
      const cw = arcCanvas.width, ch = arcCanvas.height;
      arcCtx.clearRect(0, 0, cw, ch);
      // Wait for the wordmark (held for the menu theme's snare hits), then
      // open with a burst on the downbeat as the letters finish landing.
      if (titleEl.closest('.title-hold')) { titleT = null; return; }
      if (titleT == null) { titleT = t; nextArc = t + 1.14; firstBurst = true; }
      if (t > nextArc) {
        const pad = 60, tw = cw - 120, th = ch - 120;
        const burst = firstBurst || Math.random() < 0.3 ? 3 : 1;
        firstBurst = false;
        for (let i = 0; i < burst; i++) {
          const x1 = pad + Math.random() * tw;
          const x2 = Math.max(pad, Math.min(pad + tw, x1 + rand(-tw * 0.35, tw * 0.35)));
          const y1 = pad + (Math.random() < 0.5 ? rand(-10, th * 0.2) : rand(th * 0.8, th + 10));
          const y2 = pad + rand(0, th);
          arcs.push({ x1, y1, x2, y2, born: t, life: rand(0.12, 0.3), gold: Math.random() < 0.2 });
        }
        nextArc = t + rand(0.9, 3.2);
      }
      arcCtx.globalCompositeOperation = 'lighter';
      arcs = arcs.filter(a => {
        if (t - a.born > a.life) return false;
        const pts = [[a.x1, a.y1]];
        jag(a.x1, a.y1, a.x2, a.y2, Math.hypot(a.x2 - a.x1, a.y2 - a.y1) * 0.35 + 20, pts);
        strokeBolt(arcCtx, pts, a.gold ? 'rgba(255,240,190,0.95)' : 'rgba(230,252,255,0.95)', a.gold ? 'rgba(255,190,60,0.22)' : 'rgba(0,212,255,0.25)', 1.3);
        // sparks at the ends
        for (const [x, y] of [[a.x1, a.y1], [a.x2, a.y2]]) {
          arcCtx.beginPath(); arcCtx.arc(x, y, rand(2, 4), 0, Math.PI * 2);
          arcCtx.fillStyle = 'rgba(200,250,255,0.9)'; arcCtx.fill();
        }
        return true;
      });
      arcCtx.globalCompositeOperation = 'source-over';
    }

    window.addEventListener('resize', resize);
    resize();
    // Orbitron may still be loading on first show — re-measure once it lands
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeArcCanvas);
    animId = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }

  // ── Helpers ────────────────────────────────────────────────────────
  function getCurrentSlotTimestamp() {
    const id = SaveSystem.getCurrentSlot();
    if (!id) return null;
    const meta = SaveSystem.listSlots().find(s => s.id === id);
    return meta ? meta.savedAt : null;
  }

  function formatDate(ts) {
    if (!ts) return 'Unknown time';
    const date = new Date(ts);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function downloadSlotRaw(raw, slotMeta) {
    if (!raw) { showToast('No save data to export', '#ff4444', '#0a0000', '#3a0000'); return; }
    const blob = new Blob([raw], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const name = (slotMeta && slotMeta.cityName) ? slotMeta.cityName.replace(/[^a-z0-9]+/gi, '_') : 'powergrid_save';
    a.download = `${name}_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Save exported ✓', '#50e890', '#001a08', '#003018');
  }

  // Exports whatever slot is currently active in-game (used from the pause menu).
  function exportCurrentGame() {
    if (Difficulty.permadeath()) { showToast('☠ Permadeath world: saves can\'t be exported', '#ff8a70', '#180600', '#602010'); return; }
    SaveSystem.save();
    const id = SaveSystem.getCurrentSlot();
    if (!id) { showToast('No save data to export', '#ff4444', '#0a0000', '#3a0000'); return; }
    downloadSlotRaw(SaveSystem.exportSlotRaw(id), { cityName: CityInfo.getCityName() });
  }

  // Exports a specific slot from the main menu's slot list, without touching
  // the live game (there may not even be one running).
  function exportSlotFromMenu(id) {
    const meta = SaveSystem.listSlots().find(s => s.id === id);
    if (meta && meta.permadeath) { showToast('☠ Permadeath world: saves can\'t be exported', '#ff8a70', '#180600', '#602010'); return; }
    downloadSlotRaw(SaveSystem.exportSlotRaw(id), meta);
  }

  // Import must not be able to fail on a file that is a real save. It copies
  // the file into the player's saves so it appears in the list; if that copy
  // cannot be made (the folder write keeps failing, or browser storage is too
  // small for a real city) the world is opened straight from the file
  // instead, and the first save in game writes it out. Only a file that is
  // not a save at all is turned away, and the message says which that was.
  function importSave(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => showToast('Import failed: the file could not be read from disk', '#ff4444', '#0a0000', '#3a0000');
    reader.onload = async e => {
      let parsed;
      try {
        parsed = SaveSystem.readImport(e.target.result);
      } catch (err) {
        const msg = (err instanceof SyntaxError)
          ? 'Invalid save file: the file is not readable save data'
          : ('Import failed: ' + ((err && err.message) || 'unknown error'));
        console.warn('Import failed:', err);
        showToast(msg, '#ff4444', '#0a0000', '#3a0000');
        return;
      }
      // The startup folder attach may still be running; importing before it
      // settles would send a real city to browser storage, which can't hold it.
      try { await folderReady; } catch (_e) {}
      try {
        await SaveSystem.importSlot(parsed.text);
      } catch (err) {
        console.warn('Import could not be stored; opening the file directly:', err);
        // Opening it directly is only safe on a map of the save's own size:
        // switching size needs a reload that re-reads the stored copy, and
        // loading a bigger world onto this map would trim it.
        const size = worldSizeForDims(parsed.data.vegMigratedCols || 0, parsed.data.vegMigratedRows || 0);
        const fits = size === WORLD_SIZE || !parsed.data.vegMigratedCols;
        if (gameStarted || !fits) {
          showToast('Import failed: ' + ((err && err.message) || 'could not store the save'), '#ff4444', '#0a0000', '#3a0000');
          return;
        }
        const city = (parsed.data.cityInfo && parsed.data.cityInfo.cityName) || 'Imported City';
        showToast('Could not copy the save into your saves; opening it directly. Save in game to keep it', '#ffd060', '#1a1400', '#5a4400');
        pendingLoadText = parsed.text;
        startGame(true, SaveSystem.newSlotIdFor(city));
        return;
      }
      showToast('Save imported ✓', '#50e890', '#001a08', '#003018');
      try { renderLoadGameList(); } catch (err) { console.warn('Save list refresh failed:', err); }
      try { updateLoadButtonVisibility(); } catch (_e) {}
    };
    reader.readAsText(file);
  }

  // ── Main Menu ──────────────────────────────────────────────────────
  let stopBgAnim = null;
  let gameStarted = false;

  // Shows/hides the main menu's "Continue" and "Load Game" buttons based
  // on what save slots exist. Continue jumps straight into the most
  // recently saved world (slots are sorted newest-first); Load Game opens
  // the full list. The slot list itself only renders when that modal is
  // opened (see showLoadGameModal).
  function updateLoadButtonVisibility() {
    const slots       = SaveSystem.listSlots();
    const continueBtn = document.getElementById('menu-btn-continue');
    const loadBtn      = document.getElementById('menu-btn-load');
    const infoEl        = document.getElementById('menu-save-info');
    // A remembered save folder that lost its permission to a browser restart
    // is invisible to listSlots() until it's re-authorised — and the only
    // thing that CAN re-authorise it is a click. So CONTINUE has to be shown
    // even with nothing listed, or the player is locked out of their own
    // saves with no button to press. Its handler does the granting.
    const locked = SaveSystem.folderNeedsPermission();
    const lockedMsg = window.GridworksDesktop
      ? 'Save folder needs locating; press CONTINUE to find it'
      : 'Save folder locked: press CONTINUE to allow access';
    if (slots.length) {
      const latest = slots[0];
      continueBtn.style.display = 'block';
      continueBtn.dataset.slotId = latest.id;
      infoEl.textContent = locked
        ? lockedMsg
        : `${latest.cityName} · Last saved: ${formatDate(latest.savedAt)}`;
    } else if (locked) {
      continueBtn.style.display = 'block';
      delete continueBtn.dataset.slotId;
      infoEl.textContent = lockedMsg;
    } else {
      continueBtn.style.display = 'none';
      infoEl.textContent = '';
    }
    // LOAD GAME is shown even with no saves listed, since Import Save File
    // lives in its window. Not while the folder is locked with nothing
    // listed, though: that would open an empty picker, and CONTINUE is the
    // one button that can unlock the folder, so it's the only door offered.
    loadBtn.style.display = (slots.length || !locked) ? 'block' : 'none';
  }

  function slotCardHtml(s) {
    return `
      <div class="save-slot-card" data-id="${s.id}">
        <div class="save-slot-info">
          <div class="save-slot-name">${escapeHtml(s.saveName || s.cityName)}</div>
          <div class="save-slot-sub">${escapeHtml(s.cityName)} · ${formatDate(s.savedAt)}</div>
          <div class="save-slot-sub save-slot-rules">${escapeHtml(s.difficulty || 'Normal')} · ${escapeHtml((WORLD_SIZES[s.worldSize] || WORLD_SIZES.normal).label)} map${s.permadeath ? ' · <span class="save-slot-perma">☠ Permadeath</span>' : ''}</div>
        </div>
        <div class="save-slot-actions">
          <button class="save-slot-btn load" data-action="load" title="Load">▶</button>
          ${s.permadeath ? '' : '<button class="save-slot-btn" data-action="export" title="Export">⇓</button>'}
          <button class="save-slot-btn danger" data-action="delete" title="Delete">✕</button>
        </div>
      </div>`;
  }

  // Renders the full save-slot list inside the Load Game modal.
  function renderLoadGameList() {
    const list  = document.getElementById('load-game-list');
    const slots = SaveSystem.listSlots();
    list.innerHTML = slots.length
      ? slots.map(slotCardHtml).join('')
      : '<div class="menu-saves-empty">No saved worlds yet</div>';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function showMainMenu() {
    const el = document.getElementById('main-menu');
    el.classList.remove('hidden');
    if (!stopBgAnim) stopBgAnim = initMenuBackground();
    updateLoadButtonVisibility();
  }

  function hideMainMenu() {
    document.getElementById('main-menu').classList.add('hidden');
    if (stopBgAnim) { stopBgAnim(); stopBgAnim = null; }
    // The Load Game modal is a sibling of #main-menu, not a child of it, so
    // hiding the menu doesn't hide the modal — close it explicitly, or it
    // stays visible (floating over the game) after Load is clicked.
    hideLoadGameModal();
  }

  function showLoadGameModal() {
    // Refresh after folder attach when possible so the list isn't the
    // pre-reconnect browser-storage snapshot.
    folderReady.then(() => {
      renderLoadGameList();
    });
    renderLoadGameList();
    document.getElementById('load-game-modal').classList.add('visible');
  }

  function hideLoadGameModal() {
    document.getElementById('load-game-modal').classList.remove('visible');
  }

  // ── In-game Save Game picker ───────────────────────────────────────
  // Lists only the current world's save files (see SaveSystem.listWorldSlots),
  // so a player saving mid-run is choosing between that playthrough's own
  // files rather than every unrelated city they've ever started.
  function refreshSaveTimeLine() {
    const id   = SaveSystem.getCurrentSlot();
    const meta = id ? SaveSystem.listSlots().find(s => s.id === id) : null;
    const el   = document.getElementById('pause-save-time');
    if (!el) return;
    el.textContent = meta
      ? `${meta.cityName}: saved ${formatDate(meta.savedAt)}`
      : 'Not yet saved this session';
  }

  // Inline status under the Create New Save button. A toast alone isn't enough
  // here: the picker is a full-screen overlay, so a failure message needs to
  // live inside it to be seen at all.
  function renderSaveGameStatus(errorMsg) {
    const el = document.getElementById('save-game-status');
    if (!el) return;
    const usedMb = (SaveSystem.storageUsedBytes() / 1048576).toFixed(1);
    // Mobile keeps the save files in IndexedDB (js/mobile.js), not in
    // localStorage's ~5 MB, so that figure and limit don't apply there.
    if (window.GW_MOBILE) {
      el.className = errorMsg ? 'save-game-status error' : 'save-game-status';
      el.textContent = errorMsg
        ? `⚠ ${errorMsg}. Delete a save below, or export it first to keep a copy.`
        : 'Saves are kept on this device, in this browser.';
      return;
    }
    if (errorMsg) {
      el.className = 'save-game-status error';
      el.textContent = `⚠ ${errorMsg} (using ~${usedMb} MB of the browser's ~5 MB limit). Delete a save below, or export it first to keep a copy.`;
    } else {
      el.className = 'save-game-status';
      el.textContent = `Storage in use: ~${usedMb} MB of the browser's ~5 MB limit`;
    }
  }

  // Explains where saves are going, and why the folder option may be
  // unavailable — the File System Access API needs a real origin, so opening
  // index.html straight off disk (file://) can't use it.
  function renderSaveFolderStatus() {
    const el      = document.getElementById('save-folder-status');
    const btn     = document.getElementById('save-folder-connect');
    const section = document.getElementById('save-folder-section');
    if (!el) return;
    // Phones can't pick a save folder, and don't need one: saves live in the
    // browser's own storage there, with plenty of room (js/mobile.js).
    if (window.GW_MOBILE && !SaveSystem.folderActive()) {
      if (section) section.style.display = 'none';
      return;
    }

    if (SaveSystem.folderActive()) {
      // Working as intended — keep this quiet, just a one-line confirmation
      // and a way to move the folder if they want to.
      if (section) section.style.display = '';
      el.className = 'save-game-status';
      el.textContent = `Saves are .json files in the "${SaveSystem.folderName()}" folder. No size limit.`;
      if (btn) { btn.style.display = ''; btn.innerHTML = '<span class="pbtn-icon">📁</span> Change Folder…'; }
    } else if (SaveSystem.folderSupported()) {
      // Player declined the automatic prompt — offer it again, but don't nag.
      if (section) section.style.display = '';
      el.className = 'save-game-status';
      el.textContent = 'Using browser storage (~5 MB total).';
      if (btn) { btn.style.display = ''; btn.innerHTML = '<span class="pbtn-icon">📁</span> Store Saves in a Folder…'; }
    } else {
      if (section) section.style.display = '';
      el.className = 'save-game-status error';
      el.textContent = 'Folder saving needs the game opened from http://localhost; running index.html straight off disk (file://) blocks it. Using browser storage for now.';
      if (btn) btn.style.display = 'none';
    }
  }

  function renderSaveGameList() {
    const list    = document.getElementById('save-game-list');
    const current = SaveSystem.getCurrentSlot();
    const slots   = SaveSystem.listWorldSlots();
    list.innerHTML = slots.length
      ? slots.map(s => `
          <div class="save-slot-card${s.id === current ? ' is-current' : ''}" data-id="${s.id}">
            <div class="save-slot-info">
              <div class="save-slot-name">${escapeHtml(s.saveName || s.cityName)}${s.id === current ? '<span class="save-slot-tag">CURRENT</span>' : ''}</div>
              <div class="save-slot-sub">${escapeHtml(s.cityName)} · ${formatDate(s.savedAt)}</div>
            </div>
            <div class="save-slot-actions">
              <button class="save-slot-btn load" data-action="overwrite" title="Overwrite this save">💾</button>
              <button class="save-slot-btn danger" data-action="delete" title="Delete this save">✕</button>
            </div>
          </div>`).join('')
      : '<div class="menu-saves-empty">No save files for this world yet</div>';
  }

  // ── Name-this-save prompt ──────────────────────────────────────────
  function suggestedSaveName() {
    const city = (typeof CityInfo !== 'undefined') ? CityInfo.getCityName() : 'Save';
    const day  = (typeof DayNight !== 'undefined') ? ` - Day ${DayNight.day()}` : '';
    return `${city}${day}`;
  }

  function showSaveNameModal() {
    const input = document.getElementById('save-name-input');
    const status = document.getElementById('save-name-status');
    if (status) { status.className = 'save-game-status'; status.textContent = ''; }
    if (input) {
      input.value = suggestedSaveName();
      setTimeout(() => { input.focus(); input.select(); }, 0);
    }
    document.getElementById('save-name-modal').classList.add('visible');
  }

  function hideSaveNameModal() {
    document.getElementById('save-name-modal').classList.remove('visible');
  }

  function confirmNamedSave() {
    const input  = document.getElementById('save-name-input');
    const status = document.getElementById('save-name-status');
    const name   = (input && input.value || '').trim();
    if (!name) {
      if (status) { status.className = 'save-game-status error'; status.textContent = 'Please enter a name for this save.'; }
      return;
    }
    // Warn rather than silently clobbering a save with the same name.
    const clash = SaveSystem.listSlots().some(s => (s.saveName || s.cityName) === name);
    if (clash && status && !status.dataset.confirmedClash) {
      status.className = 'save-game-status error';
      status.textContent = `A save named "${name}" already exists: press Save again to overwrite it.`;
      status.dataset.confirmedClash = '1';
      return;
    }
    if (status) delete status.dataset.confirmedClash;

    const newId = SaveSystem.saveAsNew(name);
    if (!newId) {
      hideSaveNameModal();
      renderSaveGameList();
      renderSaveGameStatus(SaveSystem.getLastSaveError() || 'Save failed');
      showToast(`⚠ ${SaveSystem.getLastSaveError() || 'Save failed'}`, '#ff8040', '#180a00', '#804020');
      return;
    }
    hideSaveNameModal();
    hideSaveGameModal();
    refreshSaveTimeLine();
    showToast(`Saved as "${name}" ✓`, '#50e890', '#001a08', '#003018');
  }

  function showSaveGameModal() {
    renderSaveGameList();
    renderSaveGameStatus(null);
    renderSaveFolderStatus();
    document.getElementById('save-game-modal').classList.add('visible');
    // Folder listings are async — re-render once the folder has been read.
    if (SaveSystem.folderActive()) {
      SaveSystem.folderRefresh().then(() => { renderSaveGameList(); renderSaveGameStatus(null); });
    }
  }

  function hideSaveGameModal() {
    document.getElementById('save-game-modal').classList.remove('visible');
  }

  // ── Generic in-game confirm modal (replaces browser confirm()) ──────
  let pendingConfirmAction = null;

  // The confirm button's label and styling used to be baked into the markup
  // as a red "Yes, Delete", so every confirmation — loading a save,
  // overwriting one — asked the player to confirm a deletion that wasn't
  // happening. Callers now say what the action actually is, and only
  // genuinely destructive ones get the red treatment.
  // `altLabel` + `onAlt` add a second action between confirm and Cancel
  // (e.g. "Quit Without Saving"); without them the button stays hidden.
  // `altDestructive` gives that second action the red treatment too.
  let pendingAltAction = null;
  function showConfirm(message, onConfirm, opts = {}) {
    const { confirmLabel = 'Yes, Delete', destructive = true, altLabel = null, onAlt = null, altDestructive = false } = opts;
    document.getElementById('confirm-modal-msg').textContent = message;
    const altBtn = document.getElementById('confirm-modal-alt');
    if (altBtn) {
      altBtn.style.display = altLabel ? '' : 'none';
      altBtn.textContent = altLabel || '';
      altBtn.style.background  = altDestructive ? 'rgba(255,40,40,0.12)' : '';
      altBtn.style.borderColor = altDestructive ? '#602020' : '';
      altBtn.style.color       = altDestructive ? '#ff8888' : '';
    }
    pendingAltAction = altLabel ? onAlt : null;
    const yesBtn = document.getElementById('confirm-modal-yes');
    yesBtn.textContent = confirmLabel;
    if (destructive) {
      yesBtn.style.background  = 'rgba(255,40,40,0.12)';
      yesBtn.style.borderColor = '#602020';
      yesBtn.style.color       = '#ff8888';
    } else {
      yesBtn.style.background  = 'rgba(40,180,255,0.12)';
      yesBtn.style.borderColor = '#205060';
      yesBtn.style.color       = '#88ddff';
    }
    pendingConfirmAction = onConfirm;
    document.getElementById('confirm-modal').classList.add('visible');
  }

  function hideConfirm() {
    document.getElementById('confirm-modal').classList.remove('visible');
    pendingConfirmAction = null;
    pendingAltAction = null;
  }

  // Save text read ahead of a load when the source is async (folder mode).
  // undefined = not supplied; callers must set a real string before startGame(true).
  let pendingLoadText = undefined;
  // Only auto-prompt for the save folder once per session, so cancelling
  // doesn't re-open the picker on every subsequent Save Game click.
  let folderPromptShown = false;
  // Settles when startup folder reconnect + mirror flush has finished. Continue
  // / Load / autostart must await this — otherwise they read browser storage
  // (or a file still being recovered) and report "failed load" for a good save.
  let folderReady = Promise.resolve();

  // Waits for the startup folder attach, and spends this click re-authorising
  // the folder when a browser restart dropped its permission.
  async function ensureFolderReadyForLoad() {
    await folderReady;
    if (!SaveSystem.folderNeedsPermission()) return true;
    const ok = await SaveSystem.folderRequestAccess();
    if (ok) {
      const recovered = await SaveSystem.flushPendingMirrors();
      updateLoadButtonVisibility();
      renderLoadGameList();
      if (recovered) {
        showToast(`Recovered ${recovered} unsaved game${recovered > 1 ? 's' : ''} ✓`, '#50e890', '#001a08', '#003018');
      }
      return true;
    }
    if (!SaveSystem.listSlots().length) {
      showToast('Save folder access denied; press CONTINUE again to allow it', '#ff8040', '#180800', '#602010');
      return false;
    }
    return true;
  }

  // Reads a slot only after the folder is ready, then starts the game.
  // useLatestIfMissing: Continue may hold a stale browser-storage id from
  // before the folder listing arrived — swap to the newest real slot.
  async function readAndStartLoad(slotId, { useLatestIfMissing = false } = {}) {
    if (gameStarted) return;
    // Mobile keeps save files in IndexedDB, loaded into memory as the page
    // starts (js/mobile.js). Loading from the pause menu reloads the page and
    // reads the save at once, before that copy has filled: wait for it.
    if (window.GWM_SAVES_READY) { try { await window.GWM_SAVES_READY; } catch (_e) {} }
    if (!(await ensureFolderReadyForLoad())) return;

    let sid = slotId || null;
    const slots = SaveSystem.listSlots();
    if (sid && !slots.some(s => s.id === sid)) {
      if (useLatestIfMissing && slots[0]) {
        sid = slots[0].id;
      } else {
        showToast('That save is no longer available', '#ff8040', '#180800', '#602010');
        updateLoadButtonVisibility();
        renderLoadGameList();
        return;
      }
    }
    if (!sid) {
      if (!slots[0]) {
        showToast('No save to continue', '#ff8040', '#180800', '#602010');
        return;
      }
      sid = slots[0].id;
    }

    const text = await SaveSystem.readSlotText(sid);
    if (text == null || text === '') {
      console.warn('[menu] could not read save text for', sid);
      showToast('Could not read that save; try again', '#ff8040', '#180800', '#602010');
      return;
    }
    // The grid is sized when the page loads (constants_core.js), so a save
    // made on another world size needs a fresh page at that size. Only the
    // header is read — the dimensions sit near the top of every save.
    const head = text.slice(0, 400);
    const mc = /"vegMigratedCols":(\d+)/.exec(head), mr = /"vegMigratedRows":(\d+)/.exec(head);
    const size = worldSizeForDims(mc ? +mc[1] : 0, mr ? +mr[1] : 0);
    if (size !== WORLD_SIZE) {
      let handedOff = false;
      try {
        sessionStorage.setItem('gw_world_size', size);
        sessionStorage.setItem('autostart_loadslot', sid);
        handedOff = sessionStorage.getItem('gw_world_size') === size;
      } catch (_e) {}
      // No sessionStorage, no hand-off: load at this size (the save gets
      // recentred) rather than reloading forever.
      if (handedOff) { location.reload(); return; }
    }
    pendingLoadText = text;
    startGame(true, sid);
  }

  // Demo: the scenario this boot was started for (scenario_system.js), or null.
  let _scenarioBoot = null;

  function startGame(loadSave, slotId) {
    if (gameStarted) return;
    hideMainMenu();
    if (typeof MenuTheme !== 'undefined') MenuTheme.stop();
    if (loadSave) {
      // pendingLoadText MUST be set by the caller after an awaited read.
      // Passing null/undefined into load() used to fall through to an empty
      // localStorage key and report "failed load" while the real file sat
      // unread in the save folder.
      const text = pendingLoadText;
      pendingLoadText = undefined;
      if (text == null || text === '') {
        console.warn('[menu] startGame missing save text for', slotId);
        showMainMenu();
        setTimeout(() => showToast(
          '⚠ Save failed to load; could not read the file. Your save is untouched.',
          '#ff8040', '#180a00', '#804020'), 400);
        return;
      }
      const loaded = SaveSystem.load(slotId, text);
      if (!loaded) {
        // A failed load leaves a blank/partial world. SaveSystem has already
        // frozen writes so this state can't overwrite the file — say so
        // loudly, since silently dropping the player into an empty map is
        // exactly what made it look like the save had been wiped.
        showMainMenu();
        setTimeout(() => showToast(
          '⚠ Save failed to load; your file is untouched and saving is disabled. Reload the page.',
          '#ff8040', '#180a00', '#804020'), 400);
        return;
      }
      gameStarted = true;
      // A world saved before autosaves had their own file: say so, rather than
      // letting the player assume the file they just loaded is still the one
      // being kept up to date.
      if (SaveSystem.takeAutoSlotMigration()) {
        setTimeout(() => showToast(
          'Autosaves now use a separate file; your named saves are only written when you save them',
          '#ffd060', '#1a1400', '#5a4400'), 1200);
      }
    } else {
      gameStarted = true;
      // A brand-new world gets its own slot, created up front so autosave
      // and manual saves have somewhere to go from the very first tick.
      SaveSystem.createSlot(CityInfo.getCityName(), CityInfo.getCompanyName());
      GridManager.reset?.();
      Economy.reset?.();
      Economy.setBalance(Difficulty.startingFunds());
      HouseRequestSystem.reset?.();
      BlueprintSystem.reset?.();
      Progression.resetProgress?.();
      if (typeof FusionResearch !== 'undefined') FusionResearch.reset();
      if (typeof NationalProject !== 'undefined') NationalProject.reset();
      if (typeof Seasons !== 'undefined') Seasons.reset();
      if (typeof GridAnalyzer !== 'undefined') GridAnalyzer.reset();
      TutorialSystem.reset?.();
      Camera.centreOnGrid(window.innerWidth, window.innerHeight);
      WaterSystem.generate();
      TerrainSystem.generate();   // after water: rivers and lakes are carved in as valleys
      GovernmentSystem.spawnGovBuilding();
      generateLandscape();   // forests (water_vegetation_system.js)
    }
    SaveSystem.startAutosave();   // cadence is player-set in Options
    // A world is loaded — play time may count from here (never the main menu).
    if (typeof PlayTime !== 'undefined') PlayTime.release('session');

    // Save when the player closes or reloads the tab.
    //
    // beforeunload alone is not enough: browsers skip it when a tab is
    // discarded to reclaim memory, on mobile, and in some crash paths.
    // visibilitychange -> 'hidden' is the one signal that is reliably
    // delivered before a page goes away, so that's the primary hook, with
    // pagehide and beforeunload as backups. Saving more than once is
    // harmless — it's idempotent, and each write just overwrites the last.
    //
    // Only synchronous work can be trusted here. In folder mode save() writes
    // its localStorage crash-net synchronously and the async file write is
    // replayed on next launch (see flushPendingMirrors in save.js), so
    // progress survives even though the file itself may not land in time.
    // Autosave turned off in Options means off here too: the player has said
    // their file changes only when they say so, and a write on the way out of
    // the tab is exactly the write they are refusing.
    const saveOnExit = () => {
      try { SaveSystem.saveOnExit(); } catch (_e) {}   // one write per unload burst; honours autosave OFF
    };
    // Browser only. A desktop window is never discarded, and Chromium reports
    // it 'hidden' on every minimise, alt-tab or fully-covering window: each of
    // those wrote the next autosave file (and stepped the rotation), so
    // tabbing out right after loading saved at once, whatever the interval,
    // and a few alt-tabs cycled every autosave backup. Closing the app still
    // saves through pagehide/beforeunload below.
    if (!window.GridworksDesktop) {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') saveOnExit();
      });
    }
    window.addEventListener('pagehide', saveOnExit);
    window.addEventListener('beforeunload', saveOnExit);
    GameLoop.start();
    AmbientAudio.start();
    GridHum.start();
    WindmillAudio.start();
    WaterAudio.start();
    // A brand-new world opens on the intro cinematic, which puts on the
    // game's first song itself (Today, from 20 YEARS LATER). The rotation
    // only starts at its end if no song is on, so that song plays through
    // and the rotation follows it when it ends.
    const skipIntro = sessionStorage.getItem('pending_skipIntro') === '1';
    sessionStorage.removeItem('pending_skipIntro');
    const introPlaying = !loadSave && !skipIntro && !_scenarioBoot && typeof IntroCinematic !== 'undefined'
      && IntroCinematic.play(() => { if (!MusicSystem.isPlaying()) MusicSystem.start(); });
    if (!introPlaying) MusicSystem.start();
    // Demo scenario: build its town onto the new world and start it...
    if (_scenarioBoot) ScenarioSystem.begin(_scenarioBoot);
    // ...or pick it back up, when the save just loaded is a scenario's.
    else if (loadSave && typeof ScenarioSystem !== 'undefined') ScenarioSystem.resumeLoaded();
  }

  // ── Pause Menu ─────────────────────────────────────────────────────
  function showPauseMenu() {
    const el = document.getElementById('pause-menu');
    el.classList.add('visible');
    // Update last-save line — names the slot so the player can see which file
    // "Save Game" will overwrite before choosing it over "Save as New File".
    const _id   = SaveSystem.getCurrentSlot();
    const _meta = _id ? SaveSystem.listSlots().find(s => s.id === _id) : null;
    const timeEl = document.getElementById('pause-save-time');
    timeEl.textContent = _meta
      ? `${_meta.cityName}: saved ${formatDate(_meta.savedAt)}`
      : 'Not yet saved this session';
    // Permadeath: no Save Game picker (named saves are backups to reload
    // from) and no export. F2 and quitting still write the world's one file.
    const iron = Difficulty.permadeath();
    for (const id of ['pause-save-now']) {
      const b = document.getElementById(id);
      if (b) b.style.display = iron ? 'none' : '';
    }
    if (iron) timeEl.textContent = `☠ Permadeath: ${timeEl.textContent}. Saves itself when you quit.`;
    // Total play time on this save — kept to the dim footer so it's there
    // for anyone who looks, without sitting on the HUD.
    const ptEl = document.getElementById('pause-playtime');
    if (ptEl) ptEl.textContent = typeof PlayTime !== 'undefined' ? `Played ${PlayTime.getFormatted()}` : '';
    if (typeof PlayTime !== 'undefined') PlayTime.hold('menu');
  }

  function hidePauseMenu() {
    document.getElementById('pause-menu').classList.remove('visible');
    if (typeof PlayTime !== 'undefined') PlayTime.release('menu');
  }

  // ── Options Modal ───────────────────────────────────────────────────
  const OPT_SFX_KEY   = 'gw_sfx_vol';
  const OPT_MUSIC_KEY = 'gw_music_vol';
  // The sliders read 70% at the game's normal full level (a stored volume of
  // 1), leaving the top 30% of the slider as headroom: 100% is 1/0.7 ≈ 1.43×.
  // The stored value is still that multiplier, so older saves keep their level.
  const OPT_VOL_FULL = 70;
  const _volToSlider = v => Math.round(Math.max(0, Math.min(100, v * OPT_VOL_FULL)));
  const _sliderToVol = s => s / OPT_VOL_FULL;

  function loadAudioPrefs() {
    const sfx   = parseFloat(localStorage.getItem(OPT_SFX_KEY)   ?? '1');
    const music = parseFloat(localStorage.getItem(OPT_MUSIC_KEY)  ?? '1');
    if (typeof SFX         !== 'undefined') SFX.setVolume(sfx);
    if (typeof MusicSystem !== 'undefined') MusicSystem.setVolume(music);
    const sfxSlider   = document.getElementById('opt-sfx-vol');
    const musicSlider = document.getElementById('opt-music-vol');
    if (sfxSlider)   { sfxSlider.value   = _volToSlider(sfx);   document.getElementById('opt-sfx-val').textContent   = `${_volToSlider(sfx)}%`; }
    if (musicSlider) { musicSlider.value = _volToSlider(music); document.getElementById('opt-music-val').textContent = `${_volToSlider(music)}%`; }
  }

  // Truck controls are meaningless (and a spoiler) before Trucks exist, so
  // that block only appears once the type is actually unlocked.
  function refreshControlsList() {
    const unlocked = typeof Progression !== 'undefined'
      && typeof T !== 'undefined'
      && Progression.isUnlocked(T.TRUCK);
    for (const id of ['ctrl-truck-section', 'ctrl-truck-section-pad']) {
      const el = document.getElementById(id);
      if (el) el.style.display = unlocked ? '' : 'none';
    }
  }

  // Keyboard / Controller tabs over the controls list. Opens on whichever
  // the player is set up for — Controller while a pad is connected.
  function _showControlsTab(tab) {
    const seg = document.getElementById('opt-controls-seg');
    if (seg) seg.querySelectorAll('button[data-ctrls]').forEach(b => b.classList.toggle('active', b.dataset.ctrls === tab));
    const kb = document.getElementById('controls-list-kb'), pad = document.getElementById('controls-list-pad');
    if (kb)  kb.style.display  = tab === 'kb'  ? '' : 'none';
    if (pad) pad.style.display = tab === 'pad' ? '' : 'none';
  }

  function _syncPadSliders() {
    if (typeof GamepadInput === 'undefined') return;
    for (const [id, v] of [['opt-pad-cursor', GamepadInput.getCursorSensitivity()], ['opt-pad-camera', GamepadInput.getCameraSensitivity()]]) {
      const s = document.getElementById(id), l = document.getElementById(id + '-val');
      const pct = Math.round(v * 100);
      if (s) s.value = String(pct);
      if (l) l.textContent = `${pct}%`;
    }
  }

  // "Off", then seconds under a minute, then minutes — "1m 30s" when the
  // 30-second step lands between whole minutes.
  function _formatAutosave(ms) {
    if (!ms) return 'Off';
    const sec = Math.round(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s}s`;
    if (s === 0) return `${m}m`;
    return `${m}m ${s}s`;
  }

  // Slider runs from Off (0) to 10 minutes. The saved value is milliseconds;
  // the input itself is seconds so the step (30) stays a round number.
  function _syncAutosaveSlider() {
    const slider = document.getElementById('opt-autosave');
    const label  = document.getElementById('opt-autosave-val');
    if (!slider || typeof SaveSystem === 'undefined') return;
    const range = SaveSystem.autosaveRange?.();
    if (range) {
      slider.min  = String(range.min  / 1000);
      slider.max  = String(range.max  / 1000);
      slider.step = String(range.step / 1000);
    }
    const ms = SaveSystem.getAutosaveInterval();
    slider.value = String(ms / 1000);
    if (label) label.textContent = _formatAutosave(ms);
  }

  // Daily saves kept: Off (0) or 1-5.
  const _formatDaily = (n) => n ? String(n) : 'Off';
  function _syncDailySlider() {
    const slider = document.getElementById('opt-daily');
    const label  = document.getElementById('opt-daily-val');
    if (!slider || typeof SaveSystem === 'undefined' || !SaveSystem.getDailySaves) return;
    const n = SaveSystem.getDailySaves();
    slider.value = String(n);
    if (label) label.textContent = _formatDaily(n);
  }

  function _syncGfxSeg() {
    const seg = document.getElementById('opt-gfx-seg');
    if (!seg || typeof GfxQuality === 'undefined') return;
    const cur = GfxQuality.getMode();
    seg.querySelectorAll('button[data-gfx]').forEach(b => b.classList.toggle('active', b.dataset.gfx === cur));
    const smooth = document.getElementById('opt-smooth-buildings-toggle');
    if (smooth) smooth.checked = GfxQuality.smoothBuildings();
    const smoothCam = document.getElementById('opt-smooth-camera-toggle');
    if (smoothCam) smoothCam.checked = GfxQuality.smoothCamera();
    _syncResolutionSeg();
    const fps = document.getElementById('opt-fps-seg');
    if (fps) fps.querySelectorAll('button[data-fps]').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.fps, 10) === GfxQuality.fpsCap()));
  }

  // Display mode: the desktop build drives the real window through its
  // preload bridge (and remembers the choice); in a browser this falls back
  // to the Fullscreen API.
  const _desk = (typeof window !== 'undefined' && window.GridworksDesktop) || null;
  let _isFull = false;
  // Browser: the choice is remembered here (shared with js/mobile.js) because
  // a reload always drops the page out of full screen, and a browser only
  // lets it back in from a tap/click/key: see _resumeFullScreen.
  const _FS_PREF_KEY = 'gwm.fsWant';
  const _fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  function _wantFull() { try { return localStorage.getItem(_FS_PREF_KEY) === '1'; } catch (_e) { return false; } }
  function _saveWantFull(v) { try { localStorage.setItem(_FS_PREF_KEY, v ? '1' : ''); } catch (_e) {} }
  async function _enterBrowserFull() {
    if (_fsEl()) return;
    const r = document.documentElement;
    const req = r.requestFullscreen || r.webkitRequestFullscreen;
    if (!req) return;
    try { await req.call(r, { navigationUI: 'hide' }); } catch (_e) {}
    if (_fsEl()) { try { screen.orientation?.lock?.('landscape')?.catch(() => {}); } catch (_e) {} }
  }
  // Full screen chosen but not in it: a reload, an app switch, the
  // notification shade or a system gesture can all drop the page out. Put
  // it back on the next tap/click/key (browsers allow it from nothing else),
  // and keep trying until it holds. Only the Windowed button clears it.
  let _fsArmed = false;
  function _resumeFullScreen() {
    // The installed (home-screen) app included: it opens with the system
    // bars showing, and only this request gives the full-screen layout that
    // the Options toggle gives. Skipping it there left the app windowed
    // after every reload until Windowed -> Full Screen was pressed again.
    if (_desk || _fsArmed || !_wantFull() || _fsEl()) return;
    _fsArmed = true;
    const evs = ['pointerup', 'touchend', 'click', 'keydown'];
    const go = (e) => {
      if (e.type === 'keydown' && (e.key === 'Escape' || e.key === 'F11')) return;   // not a usable gesture
      evs.forEach(t => document.removeEventListener(t, go, true));
      _fsArmed = false;
      if (!_wantFull() || _fsEl()) return;
      _enterBrowserFull().then(() => {
        _syncDisplaySeg();
        if (!_fsEl()) setTimeout(_resumeFullScreen, 300);   // refused this time: next tap
      });
    };
    evs.forEach(t => document.addEventListener(t, go, true));
  }
  function _syncDisplaySeg() {
    const seg = document.getElementById('opt-display-seg');
    if (!seg) return;
    const full = _desk ? _isFull : (!!_fsEl() || _wantFull());
    seg.querySelectorAll('button[data-display]').forEach(b =>
      b.classList.toggle('active', (b.dataset.display === 'full') === full));
  }
  // Ask the real window rather than trusting a cached flag: the window can
  // enter full screen before the page's startup check (launching straight
  // into it) or via F11/Esc, and the buttons must follow whatever it is now.
  function _refreshDisplayState() {
    if (_desk) _desk.isFullScreen().then(v => { _isFull = !!v; _syncDisplaySeg(); }).catch(() => {});
    else _syncDisplaySeg();
  }
  async function _setDisplay(full) {
    if (_desk) {
      await _desk.setFullScreen(full); _isFull = full;
      setTimeout(_refreshDisplayState, 400);   // the OS transition is async
    }
    else {
      _saveWantFull(full);
      if (full) await _enterBrowserFull();
      else if (_fsEl()) { try { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (_e) {} }
      _saveWantFull(full && _wantFull());   // the mobile "stay windowed" card may have cleared it
    }
    _syncDisplaySeg();
  }

  function _syncResolutionSeg() {
    const seg = document.getElementById('opt-resolution-seg');
    if (!seg || typeof RenderScale === 'undefined') return;
    const cur = RenderScale.get();
    seg.querySelectorAll('button[data-rs]').forEach(b =>
      b.classList.toggle('active', parseFloat(b.dataset.rs) === cur));
  }

  function showOptions() {
    loadAudioPrefs();
    refreshControlsList();
    _syncPadSliders();
    _showControlsTab(typeof GamepadInput !== 'undefined' && GamepadInput.connected ? 'pad' : 'kb');
    const tutToggle = document.getElementById('opt-tutorial-toggle');
    if (tutToggle) tutToggle.checked = !TutorialSystem.isSkipped();
    const clockToggle = document.getElementById('opt-24hr-toggle');
    if (clockToggle) clockToggle.checked = DayNight.isUse24Hour();
    const fahrenheitToggle = document.getElementById('opt-fahrenheit-toggle');
    if (fahrenheitToggle) fahrenheitToggle.checked = isUseFahrenheit();
    _syncAutosaveSlider();
    _syncDailySlider();
    _syncGfxSeg();
    _refreshDisplayState();
    document.getElementById('options-modal').classList.add('visible');
  }

  function hideOptions() {
    document.getElementById('options-modal').classList.remove('visible');
  }

  // ── City/Company naming modal (shown before a fresh New Game) ───────
  let cnFlag = 'gridline', cnHall = 'beaux', cnAnim = 0;
  // World size + difficulty picked on the same card. The last size and
  // difficulty are remembered for the next new game; permadeath never is —
  // it has to be switched on deliberately every time.
  const CN_SETUP_KEY = 'gw_last_setup';
  let cnSize = 'normal', cnDiff = Difficulty.get(), cnSetupBuilt = false;
  let cnNuke = 1;   // Nuclear Meltdown Timer scale
  // Sliders where a higher number makes the game harder (tinted warm);
  // the rest are tinted green when raised.
  const CN_HARDER_UP = new Set(['buildCost', 'upkeep']);

  function _cnMatchPreset(values) {
    for (const p of Object.keys(Difficulty.PRESETS)) {
      const pv = Difficulty.presetValues(p);
      if (Difficulty.SLIDERS.every(sl => Math.abs(pv[sl.key] - values[sl.key]) < 1e-6)) return p;
    }
    return null;
  }

  function buildSetupPickers() {
    if (cnSetupBuilt) return;
    cnSetupBuilt = true;
    const seg = document.getElementById('cn-size-seg');
    for (const [k, w] of Object.entries(WORLD_SIZES)) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.size = k;
      b.innerHTML = `${w.label}<small>${w.cols} × ${w.rows}</small>`;
      b.addEventListener('click', () => { SFX.click(); cnSize = k; refreshSetupPickers(); });
      seg.appendChild(b);
    }
    document.getElementById('cn-diff-seg').addEventListener('click', e => {
      const b = e.target.closest('button[data-preset]');
      if (!b) return;
      SFX.click();
      cnDiff.preset = b.dataset.preset;
      if (cnDiff.preset !== 'custom') cnDiff.values = Difficulty.presetValues(cnDiff.preset);
      refreshSetupPickers();
    });
    const host = document.getElementById('cn-diff-sliders');
    for (const sl of Difficulty.SLIDERS) {
      const row = document.createElement('div');
      row.className = 'cn-diff-row';
      row.innerHTML = `
        <div class="options-row">
          <label class="options-label" for="cn-diff-${sl.key}">${sl.label}</label>
          <div class="options-slider-wrap">
            <input type="range" class="options-slider" id="cn-diff-${sl.key}" min="${sl.min}" max="${sl.max}" step="${sl.step}">
            <span class="options-val" id="cn-diff-${sl.key}-val"></span>
          </div>
        </div>
        <div class="cn-diff-hint">${sl.desc}</div>`;
      host.appendChild(row);
      row.querySelector('input').addEventListener('input', e => {
        cnDiff.values[sl.key] = parseFloat(e.target.value);
        // Touching a slider makes it a Custom game — unless it lands back
        // exactly on a preset.
        cnDiff.preset = _cnMatchPreset(cnDiff.values) || 'custom';
        refreshSetupPickers();
      });
    }
    const nk = document.getElementById('cn-nuke-timer');
    nk.min = Difficulty.NUKE_TIMER.min; nk.max = Difficulty.NUKE_TIMER.max; nk.step = Difficulty.NUKE_TIMER.step;
    nk.addEventListener('input', e => { cnNuke = parseFloat(e.target.value); refreshSetupPickers(); });
    document.getElementById('cn-permadeath').addEventListener('change', e => {
      SFX.click();
      document.getElementById('world-settings-modal').classList.toggle('perma', e.target.checked);
      refreshSetupPickers();
    });
    document.getElementById('cn-world-btn').addEventListener('click', () => { SFX.click(); showWorldSettings(); });
    document.getElementById('ws-close').addEventListener('click', () => { SFX.click(); hideWorldSettings(); });
  }

  function showWorldSettings() { document.getElementById('world-settings-modal').classList.add('visible'); }
  function hideWorldSettings() { document.getElementById('world-settings-modal').classList.remove('visible'); }

  function refreshSetupPickers() {
    document.querySelectorAll('#cn-size-seg button').forEach(b => b.classList.toggle('active', b.dataset.size === cnSize));
    document.getElementById('cn-size-desc').textContent = (WORLD_SIZES[cnSize] || WORLD_SIZES.normal).desc;
    document.querySelectorAll('#cn-diff-seg button').forEach(b => b.classList.toggle('active', b.dataset.preset === cnDiff.preset));
    for (const sl of Difficulty.SLIDERS) {
      const v = cnDiff.values[sl.key];
      const input = document.getElementById(`cn-diff-${sl.key}`);
      if (input && parseFloat(input.value) !== v) input.value = v;
      const out = document.getElementById(`cn-diff-${sl.key}-val`);
      if (!out) continue;
      out.textContent = sl.money ? formatMoney(Math.round(Difficulty.BASE_FUNDS * v)) : `${Math.round(v * 100)}%`;
      const harder = Math.abs(v - 1) < 1e-6 ? 0 : ((v > 1) === CN_HARDER_UP.has(sl.key) ? 1 : -1);
      out.classList.toggle('up', harder > 0);
      out.classList.toggle('down', harder < 0);
    }
    // Nuclear timer: show what it actually means in seconds. The Advanced
    // Reactor is floored at its countdown song's lead-in (MeltdownSystem.limitFor).
    const nkIn = document.getElementById('cn-nuke-timer');
    if (nkIn && parseFloat(nkIn.value) !== cnNuke) nkIn.value = cnNuke;
    const nkOut = document.getElementById('cn-nuke-timer-val');
    if (nkOut) {
      nkOut.textContent = `${Math.round(cnNuke * 100)}%`;
      nkOut.classList.toggle('up', cnNuke < 1 - 1e-6);
      nkOut.classList.toggle('down', cnNuke > 1 + 1e-6);
    }
    const nkDesc = document.getElementById('cn-nuke-timer-desc');
    if (nkDesc) {
      const mk1 = Math.round((EntityDefs[T.NUCLEARREACTOR]?.meltdownSeconds || 30) * cnNuke);
      const floor = typeof ApocalypseSystem !== 'undefined' ? ApocalypseSystem.DETONATE_AT : 48;
      const adv = Math.round(Math.max(floor, (EntityDefs[T.ADVREACTOR]?.meltdownSeconds || 90) * cnNuke));
      nkDesc.textContent = `Seconds from core critical to detonation; Reactor ${mk1}s · Advanced Reactor ${adv}s (never under ${floor}s, the length of its countdown song)`;
    }
    // One-line summary under the World Settings button on the naming card.
    const sum = document.getElementById('cn-world-summary');
    if (sum) {
      const perma = document.getElementById('cn-permadeath')?.checked;
      sum.innerHTML = `${(WORLD_SIZES[cnSize] || WORLD_SIZES.normal).label} map · ${Difficulty.label(cnDiff)}`
        + (perma ? ' · <span class="perma">☠ Permadeath</span>' : '');
    }
  }

  function resetSetupPickers() {
    buildSetupPickers();
    cnSize = 'normal';
    cnDiff = { preset: 'normal', values: Difficulty.presetValues('normal') };
    cnNuke = 1;
    try {
      const last = JSON.parse(localStorage.getItem(CN_SETUP_KEY) || 'null');
      if (last) {
        if (WORLD_SIZES[last.size]) cnSize = last.size;
        const nv = Number(last.nukeTimer);
        if (Number.isFinite(nv)) cnNuke = Math.min(Difficulty.NUKE_TIMER.max, Math.max(Difficulty.NUKE_TIMER.min, nv));
        if (last.diff && last.diff.values) {
          for (const sl of Difficulty.SLIDERS) {
            const v = Number(last.diff.values[sl.key]);
            if (Number.isFinite(v)) cnDiff.values[sl.key] = Math.min(sl.max, Math.max(sl.min, v));
          }
          cnDiff.preset = last.diff.preset === 'custom' ? 'custom' : (_cnMatchPreset(cnDiff.values) || 'custom');
        }
      }
    } catch (_e) {}
    document.getElementById('cn-permadeath').checked = false;
    document.getElementById('world-settings-modal').classList.remove('perma');
    hideWorldSettings();
    refreshSetupPickers();
  }

  // Draw a City Hall preview by pointing the world renderer's ctx at the
  // card's canvas for one frame, with this card's style and chosen flag.
  function drawHallPreview(cv, style, t) {
    const c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#6f8f58'; c.fillRect(0, 0, cv.width, cv.height);
    const saved = ctx;
    try {
      const s = cv.width / (TILE*6 + 12);
      c.setTransform(s, 0, 0, s, 6*s, 50*s);
      ctx = c;
      renderGovBuilding({ width: 6, height: 6, powered: true, col: 3, row: 5, _hallStyle: style, _flag: cnFlag }, 0, 0, t);
    } catch (err) { console.warn('[CityNaming] hall preview failed', err); }
    finally { ctx = saved; c.setTransform(1, 0, 0, 1, 0, 0); }
  }

  function drawFlagPreview(cv, id) {
    const c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    CityInfo.drawFlag(c, id, 0, 0, cv.width, cv.height);
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1; c.strokeRect(0.5, 0.5, cv.width - 1, cv.height - 1);
  }

  function buildIdentityPickers() {
    const fg = document.getElementById('cn-flag-grid');
    const hg = document.getElementById('cn-hall-grid');
    fg.innerHTML = ''; hg.innerHTML = '';
    for (const f of CityInfo.FLAGS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'cn-pick'; b.dataset.id = f.id;
      const cv = document.createElement('canvas'); cv.width = 120; cv.height = 72;
      b.append(cv, document.createTextNode(f.name));
      drawFlagPreview(cv, f.id);
      b.addEventListener('click', () => { SFX.click(); cnFlag = f.id; refreshIdentityPickers(); });
      fg.appendChild(b);
    }
    for (const h of CityInfo.HALLS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'cn-pick'; b.dataset.id = h.id;
      const cv = document.createElement('canvas'); cv.width = 160; cv.height = 190;
      b.append(cv, document.createTextNode(h.name));
      b.addEventListener('click', () => { SFX.click(); cnHall = h.id; refreshIdentityPickers(); });
      hg.appendChild(b);
    }
    refreshIdentityPickers();
  }

  function refreshIdentityPickers() {
    document.querySelectorAll('#cn-flag-grid .cn-pick').forEach(b => b.classList.toggle('selected', b.dataset.id === cnFlag));
    document.querySelectorAll('#cn-hall-grid .cn-pick').forEach(b => b.classList.toggle('selected', b.dataset.id === cnHall));
    const h = CityInfo.HALLS.find(x => x.id === cnHall);
    document.getElementById('cn-hall-desc').textContent = h ? h.desc : '';
  }

  function animateHallPreviews(ts) {
    if (!document.getElementById('citynaming-modal').classList.contains('visible')) { cnAnim = 0; return; }
    document.querySelectorAll('#cn-hall-grid .cn-pick').forEach(b => drawHallPreview(b.querySelector('canvas'), b.dataset.id, ts / 1000));
    cnAnim = requestAnimationFrame(animateHallPreviews);
  }

  function showCityNamingModal() {
    const modal = document.getElementById('citynaming-modal');
    document.getElementById('cn-city-input').value = '';
    document.getElementById('cn-company-input').value = '';
    for (const el of _cnFields()) el.classList.remove('invalid');
    refreshCityNamingValid();
    cnFlag = 'gridline'; cnHall = 'beaux';
    const skip = document.getElementById('cn-skip-intro');
    if (skip) { try { skip.checked = localStorage.getItem('gw_skip_intro') === '1'; } catch (_e) { skip.checked = false; } }
    buildIdentityPickers();
    resetSetupPickers();
    modal.classList.add('visible');
    if (!cnAnim) cnAnim = requestAnimationFrame(animateHallPreviews);
    document.getElementById('cn-city-input').focus();
  }

  function hideCityNamingModal() {
    hideWorldSettings();
    document.getElementById('citynaming-modal').classList.remove('visible');
  }

  // Both names are required. Start Game stays disabled until they are, the
  // hint underneath says what's missing, and trying anyway (Enter in the
  // company field) outlines the empty field and puts the cursor in it.
  function _cnFields() {
    return [document.getElementById('cn-city-input'), document.getElementById('cn-company-input')];
  }
  function refreshCityNamingValid(showErrors = false) {
    const [cityEl, companyEl] = _cnFields();
    const missing = [];
    for (const [el, label] of [[cityEl, 'city'], [companyEl, 'power company']]) {
      const empty = !el.value.trim();
      if (empty) missing.push(label);
      if (showErrors || !empty) el.classList.toggle('invalid', empty && showErrors);
    }
    document.getElementById('cn-start-btn').disabled = missing.length > 0;
    const hint = document.getElementById('cn-required');
    hint.textContent = missing.length ? `Name your ${missing.join(' and ')} to start` : 'Ready to go';
    hint.classList.toggle('error', showErrors && missing.length > 0);
    return missing.length === 0;
  }

  async function confirmCityNaming() {
    if (!refreshCityNamingValid(true)) {
      const [cityEl, companyEl] = _cnFields();
      (cityEl.value.trim() ? companyEl : cityEl).focus();
      if (typeof SFX !== 'undefined' && SFX.error) SFX.error();
      return;
    }
    const city    = document.getElementById('cn-city-input').value.trim();
    const company = document.getElementById('cn-company-input').value.trim();
    sessionStorage.setItem('pending_cityName', city);
    sessionStorage.setItem('pending_companyName', company);
    sessionStorage.setItem('pending_flag', cnFlag);
    sessionStorage.setItem('pending_hallStyle', cnHall);
    const skipIntro = !!document.getElementById('cn-skip-intro')?.checked;
    try { localStorage.setItem('gw_skip_intro', skipIntro ? '1' : '0'); } catch (_e) {}
    if (skipIntro) sessionStorage.setItem('pending_skipIntro', '1');
    else sessionStorage.removeItem('pending_skipIntro');
    // The grid is sized as the page loads, so world size has to be in place
    // before the reload below. Difficulty is applied on the other side.
    const permadeath = !!document.getElementById('cn-permadeath')?.checked;
    sessionStorage.setItem('gw_world_size', cnSize);
    const seasons = document.getElementById('cn-seasons')?.checked !== false;
    sessionStorage.setItem('pending_difficulty', JSON.stringify({ preset: cnDiff.preset, values: cnDiff.values, permadeath, nukeTimer: cnNuke, seasons }));
    try { localStorage.setItem(CN_SETUP_KEY, JSON.stringify({ size: cnSize, diff: { preset: cnDiff.preset, values: cnDiff.values }, nukeTimer: cnNuke })); } catch (_e) {}
    hideCityNamingModal();
    sessionStorage.setItem('autostart_newgame', '1');
    location.reload();
  }

  // ── Wire up events ─────────────────────────────────────────────────
  function init() {
    if (typeof ApocalypseSystem !== 'undefined') ApocalypseSystem.init();
    // Build marker — bump when changing menu/save behaviour. If the console
    // doesn't show the expected value, the browser is running a cached copy
    // of this file and no amount of code-reading will explain the symptoms.
    console.log('[GRIDWORKS] menu build: save-picker-v4');

    // Main menu buttons
    document.getElementById('menu-btn-continue').addEventListener('click', async () => {
      SFX.click();
      // Always resolve the newest slot AFTER the folder is ready. The button's
      // dataset.slotId is painted before reconnect finishes and is often a
      // stale browser-storage id — that mismatch was the first-click failure.
      await readAndStartLoad(null);
    });
    document.getElementById('menu-btn-newgame').addEventListener('click', async () => {
      SFX.click();
      // Choose where this world's saves will live before anything else. This
      // click is the user gesture showDirectoryPicker() requires, and asking
      // here means the autosave/quick-save file exists from the very first
      // tick instead of piling into browser storage until the player happens
      // to open SAVE GAME. Asked on EVERY new game, not just when no folder
      // is connected yet, so each world's destination is a deliberate choice;
      // cancelling the picker simply keeps whatever was already set.
      if (SaveSystem.folderSupported()) {
        const ok = await SaveSystem.folderConnect();
        if (ok) showToast(`Saves for this world will go to "${SaveSystem.folderName()}" ✓`, '#50e890', '#001a08', '#003018');
      }
      showCityNamingModal();
    });
    document.getElementById('cn-start-btn').addEventListener('click', () => {
      if (!refreshCityNamingValid(true)) return;
      SFX.click(); confirmCityNaming();
    });
    document.getElementById('cn-cancel').addEventListener('click', () => {
      SFX.click(); hideCityNamingModal();
    });
    for (const el of _cnFields()) el.addEventListener('input', () => refreshCityNamingValid());
    document.getElementById('cn-city-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('cn-company-input').focus(); }
    });
    document.getElementById('cn-company-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); confirmCityNaming(); }
    });
    // Quit only exists in the desktop build — a browser tab can't close
    // itself. Closing the window fires beforeunload, so saveOnExit runs.
    const _quitBtn = document.getElementById('menu-btn-quit');
    if (_quitBtn && window.GridworksDesktop && window.GridworksDesktop.quit) {
      _quitBtn.style.display = '';
      _quitBtn.addEventListener('click', () => { SFX.click(); window.GridworksDesktop.quit(); });
    }
    document.getElementById('load-game-import').addEventListener('click', () => {
      SFX.click(); document.getElementById('save-import-input').click();
    });

    // Load Game modal
    document.getElementById('menu-btn-load').addEventListener('click', () => {
      SFX.click(); showLoadGameModal();
    });
    document.getElementById('load-game-close').addEventListener('click', () => {
      SFX.click(); hideLoadGameModal();
    });

    // Save-slot list — delegated so it works for dynamically rendered cards
    document.getElementById('load-game-list').addEventListener('click', e => {
      const btn = e.target.closest('.save-slot-btn');
      if (!btn) return;
      const card = btn.closest('.save-slot-card');
      const id   = card && card.dataset.id;
      if (!id) return;
      const action = btn.dataset.action;
      SFX.click();
      if (action === 'load') {
        if (gameStarted) {
          // Mid-game: save the world we're leaving, then reload and let the
          // boot path load the chosen slot into a clean session.
          const meta  = SaveSystem.listSlots().find(s => s.id === id);
          const label = meta ? meta.cityName : 'this save';
          const iron = Difficulty.permadeath();
          showConfirm(iron
            ? `Load "${label}"? Your permadeath world will be saved first.`
            : `Load "${label}"? Any unsaved progress in your current game will be lost.`, async () => {
            // Permadeath: leaving is quitting, and quitting always saves.
            if (iron) {
              try {
                SaveSystem.save();
                await Promise.race([SaveSystem.flushNow(), new Promise(r => setTimeout(r, 2000))]);
              } catch (_e) {}
            }
            // Deliberately does NOT save the world being left — the player
            // decides when their current game is written. pause() must still
            // run before the reload, though: without it the exit hooks
            // (visibilitychange/pagehide/beforeunload) and the 30s autosave
            // would write the outgoing world anyway, which is exactly what
            // this confirmation promises will not happen.
            SaveSystem.pause();
            sessionStorage.setItem('autostart_loadslot', id);
            location.reload();
          }, { confirmLabel: 'Yes, Load' });
        } else {
          // Wait for folder attach + flush, then read — startGame/load are
          // synchronous and used to race the async folder reconnect, which
          // made the first click fail and the second (after reconnect) work.
          readAndStartLoad(id);
        }
      } else if (action === 'export') {
        exportSlotFromMenu(id);
      } else if (action === 'delete') {
        const meta = SaveSystem.listSlots().find(s => s.id === id);
        const label = meta ? meta.cityName : 'this world';
        // await — deleting a folder save is async, and re-rendering before it
        // finishes redraws the list from the pre-delete cache, which looks
        // exactly like the delete having done nothing.
        showConfirm(`Delete "${label}"? This cannot be undone.`, async () => {
          await SaveSystem.deleteSlot(id);
          renderLoadGameList();
          updateLoadButtonVisibility();
        });
      }
    });

    // Generic confirm modal
    document.getElementById('confirm-modal-yes').addEventListener('click', () => {
      SFX.click();
      const action = pendingConfirmAction;
      hideConfirm();
      if (action) action();
    });
    document.getElementById('confirm-modal-alt')?.addEventListener('click', () => {
      SFX.click();
      const action = pendingAltAction;
      hideConfirm();
      if (action) action();
    });
    document.getElementById('confirm-modal-no').addEventListener('click', () => {
      SFX.click(); hideConfirm();
    });

    // Pause menu buttons
    document.getElementById('btn-menu').addEventListener('click', () => { SFX.click(); showPauseMenu(); });

    // Options — main menu + pause menu
    const _optMenuBtn  = document.getElementById('menu-btn-options');
    const _optPauseBtn = document.getElementById('pause-btn-options');
    const _optClose    = document.getElementById('options-close');
    const _optSfx      = document.getElementById('opt-sfx-vol');
    const _optMusic    = document.getElementById('opt-music-vol');
    if (_optMenuBtn)  _optMenuBtn.addEventListener('click',  () => { SFX.click(); showOptions(); });
    if (_optPauseBtn) _optPauseBtn.addEventListener('click', () => { SFX.click(); showOptions(); });
    if (_optClose)    _optClose.addEventListener('click',    () => { SFX.click(); hideOptions(); });
    if (_optSfx) _optSfx.addEventListener('input', e => {
      const v = _sliderToVol(e.target.value);
      document.getElementById('opt-sfx-val').textContent = `${e.target.value}%`;
      SFX.setVolume(v);
      localStorage.setItem(OPT_SFX_KEY, v);
    });
    if (_optMusic) _optMusic.addEventListener('input', e => {
      const v = _sliderToVol(e.target.value);
      document.getElementById('opt-music-val').textContent = `${e.target.value}%`;
      MusicSystem.setVolume(v);
      localStorage.setItem(OPT_MUSIC_KEY, v);
    });
    for (const [id, set] of [['opt-pad-cursor', 'setCursorSensitivity'], ['opt-pad-camera', 'setCameraSensitivity']]) {
      const s = document.getElementById(id);
      if (s) s.addEventListener('input', e => {
        document.getElementById(id + '-val').textContent = `${e.target.value}%`;
        if (typeof GamepadInput !== 'undefined') GamepadInput[set](e.target.value / 100);
      });
    }
    const _optCtrls = document.getElementById('opt-controls-seg');
    if (_optCtrls) _optCtrls.addEventListener('click', e => {
      const btn = e.target.closest('button[data-ctrls]');
      if (!btn) return;
      SFX.click();
      _showControlsTab(btn.dataset.ctrls);
    });
    const _optTutorial = document.getElementById('opt-tutorial-toggle');
    if (_optTutorial) _optTutorial.addEventListener('change', e => {
      SFX.click(); TutorialSystem.setEnabled(e.target.checked);
    });
    const _optClock = document.getElementById('opt-24hr-toggle');
    if (_optClock) _optClock.addEventListener('change', e => {
      SFX.click(); DayNight.setUse24Hour(e.target.checked);
    });
    const _optFahrenheit = document.getElementById('opt-fahrenheit-toggle');
    if (_optFahrenheit) _optFahrenheit.addEventListener('change', e => {
      SFX.click(); setUseFahrenheit(e.target.checked);
    });
    const _optAutosave = document.getElementById('opt-autosave');
    if (_optAutosave) _optAutosave.addEventListener('input', e => {
      // Applies immediately — setAutosaveInterval re-arms a running timer, so
      // the new cadence takes effect without restarting the game.
      const ms = SaveSystem.setAutosaveInterval(parseInt(e.target.value, 10) * 1000);
      const label = document.getElementById('opt-autosave-val');
      if (label) label.textContent = _formatAutosave(ms);
    });

    const _optDaily = document.getElementById('opt-daily');
    if (_optDaily) _optDaily.addEventListener('input', e => {
      const n = SaveSystem.setDailySaves(parseInt(e.target.value, 10));
      const label = document.getElementById('opt-daily-val');
      if (label) label.textContent = _formatDaily(n);
    });

    const _optGfx = document.getElementById('opt-gfx-seg');
    if (_optGfx) _optGfx.addEventListener('click', e => {
      const btn = e.target.closest('button[data-gfx]');
      if (!btn) return;
      SFX.click();
      GfxQuality.setMode(btn.dataset.gfx);
      _syncGfxSeg();
    });
    const _optResolution = document.getElementById('opt-resolution-seg');
    if (_optResolution) _optResolution.addEventListener('click', e => {
      const btn = e.target.closest('button[data-rs]');
      if (!btn) return;
      SFX.click();
      // Takes effect on the next frame — RenderScale.set() resizes the
      // canvas and drops every bitmap cached at the old resolution.
      RenderScale.set(parseFloat(btn.dataset.rs));
      _syncResolutionSeg();
    });

    const _optDisplay = document.getElementById('opt-display-seg');
    if (_optDisplay) _optDisplay.addEventListener('click', e => {
      const btn = e.target.closest('button[data-display]');
      if (!btn) return;
      SFX.click();
      _setDisplay(btn.dataset.display === 'full');
    });
    if (_desk) {
      _refreshDisplayState();
      _desk.onFullScreenChange(v => { _isFull = !!v; _syncDisplaySeg(); });   // F11 / Esc stay in sync
      // Entering/leaving full screen always resizes the window; re-query then
      // too, in case the change event arrived before the page was listening.
      let _rsT = 0;
      window.addEventListener('resize', () => { clearTimeout(_rsT); _rsT = setTimeout(_refreshDisplayState, 150); });
    } else {
      document.addEventListener('fullscreenchange', _syncDisplaySeg);
      document.addEventListener('webkitfullscreenchange', _syncDisplaySeg);
      const _fsLost = () => { if (!_fsEl()) setTimeout(_resumeFullScreen, 300); };
      document.addEventListener('fullscreenchange', _fsLost);
      document.addEventListener('webkitfullscreenchange', _fsLost);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') _fsLost(); });
      window.addEventListener('pageshow', _fsLost);
      _resumeFullScreen();
    }
    _syncDisplaySeg();

    const _optFps = document.getElementById('opt-fps-seg');
    if (_optFps) _optFps.addEventListener('click', e => {
      const btn = e.target.closest('button[data-fps]');
      if (!btn) return;
      SFX.click();
      GfxQuality.setFpsCap(parseInt(btn.dataset.fps, 10));
      _syncGfxSeg();
    });

    const _optSmooth =document.getElementById('opt-smooth-buildings-toggle');
    if (_optSmooth) _optSmooth.addEventListener('change', e => {
      SFX.click(); GfxQuality.setSmoothBuildings(e.target.checked);
    });

    const _optSmoothCam = document.getElementById('opt-smooth-camera-toggle');
    if (_optSmoothCam) _optSmoothCam.addEventListener('change', e => {
      SFX.click(); GfxQuality.setSmoothCamera(e.target.checked);
    });

    loadAudioPrefs();

    // Null-safe listener binding. init() is one long chain of
    // getElementById(...).addEventListener(...) calls, so a single missing
    // element throws and silently abandons EVERY binding after it — the
    // symptom being unrelated buttons that "do nothing". Warn and carry on
    // instead, so one stale/absent node can't take the rest of the menu down.
    const on = (id, evt, fn) => {
      const el = document.getElementById(id);
      if (!el) { console.warn(`[menu] #${id} not found; listener not attached`); return; }
      el.addEventListener(evt, fn);
    };

    on('pause-close', 'click', () => { SFX.click(); hidePauseMenu(); });

    on('pause-save-now', 'click', async () => {
      SFX.click();
      // First save ever: ask once for the game folder, then create a "saves"
      // folder inside it. Must happen in this click handler — the folder
      // picker only opens from a user gesture. If the player cancels, or the
      // API isn't available (file:// origin), we quietly stay on browser
      // storage and the picker below still works.
      if (SaveSystem.folderSupported() && !SaveSystem.folderActive() && !folderPromptShown) {
        folderPromptShown = true;
        const ok = await SaveSystem.folderConnect();
        if (ok) showToast(`Saves will be stored in the "${SaveSystem.folderName()}" folder ✓`, '#50e890', '#001a08', '#003018');
      }
      showSaveGameModal();
    });

    on('save-game-close', 'click', () => {
      SFX.click(); hideSaveGameModal();
    });

    on('pause-load-game', 'click', () => {
      SFX.click(); showLoadGameModal();
    });

    on('save-folder-connect', 'click', async () => {
      SFX.click();
      const ok = await SaveSystem.folderConnect();
      renderSaveFolderStatus();
      renderSaveGameList();
      renderSaveGameStatus(null);
      if (ok) {
        showToast(`Saves will go to "${SaveSystem.folderName()}" ✓`, '#50e890', '#001a08', '#003018');
      }
    });

    on('save-game-new', 'click', () => { SFX.click(); showSaveNameModal(); });
    on('save-name-cancel', 'click', () => { SFX.click(); hideSaveNameModal(); });
    on('save-name-confirm', 'click', () => { SFX.click(); confirmNamedSave(); });
    on('save-name-input', 'keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); confirmNamedSave(); }
      if (e.key === 'Escape') { e.preventDefault(); hideSaveNameModal(); }
      e.stopPropagation();   // don't let Escape also close the pause menu
    });

    // Overwrite (or delete) whichever of this world's files was clicked.
    on('save-game-list', 'click', e => {
      const btn  = e.target.closest('.save-slot-btn');
      if (!btn) return;
      const card = btn.closest('.save-slot-card');
      const id   = card && card.dataset.id;
      if (!id) return;
      const meta = SaveSystem.listSlots().find(s => s.id === id);
      SFX.click();

      if (btn.dataset.action === 'delete') {
        showConfirm(`Delete "${meta ? meta.cityName : 'this save'}"? This cannot be undone.`, async () => {
          await SaveSystem.deleteSlot(id);
          renderSaveGameList();
          renderSaveGameStatus(null);   // storage figure just changed
          updateLoadButtonVisibility();
        });
        return;
      }

      showConfirm(`Overwrite "${meta ? meta.cityName : 'this save'}"? The existing file will be replaced.`, () => {
        // Deliberately no setCurrentSlot(): overwriting one of the player's
        // files is a one-off write to that file, not a decision to send every
        // future autosave there.
        if (!SaveSystem.save(id)) {
          renderSaveGameList();
          renderSaveGameStatus(SaveSystem.getLastSaveError() || 'Save failed');
          showToast(`⚠ ${SaveSystem.getLastSaveError() || 'Save failed'}`, '#ff8040', '#180a00', '#804020');
          return;
        }
        hideSaveGameModal();
        refreshSaveTimeLine();
        showToast('Game saved ✓', '#50e890', '#001a08', '#003018');
      }, { confirmLabel: 'Yes, Overwrite' });
    });

    document.getElementById('save-game-export').addEventListener('click', () => {
      SFX.click(); exportCurrentGame();
    });

    // Back to the main menu. It used to save silently every time, into the
    // next autosave file, so leaving a game (and loading another) quietly
    // spent an autosave backup whatever the interval. Now the player
    // chooses; autosave files otherwise change only on the interval, F2,
    // or closing the window. Permadeath still always saves: quitting is
    // never a way back.
    document.getElementById('pause-main-menu').addEventListener('click', () => {
      SFX.click();
      if (Difficulty.permadeath()) { leaveToMainMenu(true); return; }
      // Saved a moment ago: there is nothing to lose, so don't ask. Just let
      // any folder write still in flight land, then leave.
      if (SaveSystem.savedWithin(15000)) { leaveToMainMenu(false, true); return; }
      showConfirm('Save your game before going back to the main menu? Saving writes your Quicksave file.',
        () => leaveToMainMenu(true),
        { confirmLabel: 'Save & Quit', destructive: false,
          altLabel: 'Quit Without Saving', altDestructive: true, onAlt: () => leaveToMainMenu(false) });
    });
    async function leaveToMainMenu(saveFirst, flushPending = false) {
      // Everything before the reload is best-effort. This handler is `async`,
      // so anything that throws — or an await that never settles — silently
      // kills the rest of it and the button just does nothing, stranding the
      // player in the game with no way back to the menu. Save if we can, wait
      // a bounded time for the folder write, then leave regardless.
      if (saveFirst || flushPending) try {
        // Leaving from a job site saves like anywhere else: save() swaps the
        // player's own world in for the write and records that they were on
        // site, so the next load puts them back there.
        if (saveFirst) SaveSystem.save();
        // In folder mode the write is async — give it a chance to land rather
        // than racing the reload, but never wait forever on it.
        await Promise.race([
          SaveSystem.flushNow(),
          new Promise(resolve => setTimeout(resolve, 2000)),
        ]);
      } catch (err) {
        console.warn('[GRIDWORKS] main menu: save on exit failed, leaving anyway', err);
      }
      try { SaveSystem.pause(); } catch (_e) {}   // stop beforeunload re-saving (and, unsaved, saving at all)
      try { hidePauseMenu(); } catch (_e) {}
      // Back to the menu's title animation, not the studio card again
      try { sessionStorage.setItem('menu_return', '1'); } catch (_e) {}
      location.reload();
    }

    // Shared file import input
    document.getElementById('save-import-input').addEventListener('change', e => {
      importSave(e.target.files[0]);
      e.target.value = '';
    });

    // F2 — quick save straight over the current file. No modal, no warning,
    // no confirmation; this is the "just save" path.
    document.addEventListener('keydown', e => {
      if (e.key !== 'F2') return;
      if (!gameStarted) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      // Gate and label on the file this actually writes — the Quicksave file —
      // not on currentSlot. Those are different slots now, so reporting
      // currentSlot named a save that had not been touched.
      const _target = SaveSystem.getQuickSlot();
      if (!_target) return;
      if (SaveSystem.save()) {
        const meta = SaveSystem.listSlots().find(s => s.id === _target);
        const label = meta ? (meta.saveName || meta.cityName) : 'Quicksave';
        showToast(`💾 Saved "${label}"`, '#50e890', '#001a08', '#003018');
      } else {
        showToast(`⚠ ${SaveSystem.getLastSaveError() || 'Save failed'}`, '#ff8040', '#180a00', '#804020');
      }
    });

    // Esc key: toggle the pause menu — close it if open, open it if not.
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        // Modals are dismissed topmost-first, in the same order they stack
        // visually, so Escape always closes just the thing in front and
        // reveals whatever is underneath (typically the pause menu). Without
        // this the handler fell straight through to the pause-menu toggle, so
        // Escape on e.g. the Load Game list closed the pause menu out from
        // behind it instead of returning to it.
        //
        // Checked before the gameStarted guard because several of these are
        // reachable from the main menu too.
        const MODAL_STACK = [
          ['confirm-modal',    hideConfirm],        // 1300
          ['save-name-modal',  hideSaveNameModal],  // 1250
          ['save-game-modal',  hideSaveGameModal],  // 1200
          ['options-modal',    hideOptions],        // 1200
          ['load-game-modal',  hideLoadGameModal],  // 1150
          ['world-settings-modal', hideWorldSettings],
          ['citynaming-modal', hideCityNamingModal],
        ];
        for (const [id, close] of MODAL_STACK) {
          const el = document.getElementById(id);
          if (el && el.classList.contains('visible')) {
            close();
            SFX.click();
            e.stopPropagation();
            return;
          }
        }

        // On the main menu there's no pause menu to open — stop here so
        // InputManager's bubble-phase handler doesn't open it behind the menu.
        if (!gameStarted) { e.stopPropagation(); return; }
        // World map takes priority over the pause menu — let InputManager's
        // handler close it instead; don't stopPropagation here.
        if (typeof WorldMapSystem !== 'undefined' && WorldMapSystem.isOpen) return;
        // Any active tool, path drawing, driven truck, or open panel also
        // takes priority over the pause menu — let InputManager's own
        // (bubble-phase) Escape handler deal with it instead. Without this,
        // this capture-phase listener always won the race and toggled the
        // pause menu first, so Escape could never deselect a tool, cancel a
        // path, park a driven truck, or close any entity panel — it just
        // silently opened the pause menu behind whatever was on screen.
        if (typeof InputManager !== 'undefined' && InputManager.hasEscapeTarget?.()) return;
        const pauseEl = document.getElementById('pause-menu');
        if (pauseEl.classList.contains('visible')) {
          hidePauseMenu();
        } else if (!window.padBackEscape) {   // a controller's B backs out; it doesn't open the menu
          showPauseMenu();
        }
        e.stopPropagation(); // don't also deselect tools on the same keypress
      }
    }, true); // capture so it fires before InputManager's Escape handler

    // Re-attach a previously chosen save folder, then refresh the menu so its
    // files appear in the slot list. Permission can be revoked between
    // sessions, in which case this quietly does nothing and the game falls
    // back to browser storage until the player picks the folder again.
    folderReady = SaveSystem.folderReconnect().then(async ok => {
      if (!ok) {
        // Didn't reconnect. If that's because a browser restart dropped the
        // folder's permission, the menu needs re-rendering now that we know:
        // showMainMenu() below can run before this promise settles, so it may
        // have drawn the buttons while needsPermission() still read false.
        updateLoadButtonVisibility();
        return;
      }
      // Replay any folder write that didn't finish because the page was closed
      // mid-write, so progress from the previous session isn't lost.
      const recovered = await SaveSystem.flushPendingMirrors();
      updateLoadButtonVisibility();
      renderLoadGameList();
      if (recovered) {
        showToast(`Recovered ${recovered} unsaved game${recovered > 1 ? 's' : ''} ✓`, '#50e890', '#001a08', '#003018');
      }
    }).catch(err => { console.warn('[menu] folder reconnect failed:', err); });

    // Show the main menu on load
    showMainMenu();

    // Everything that reads a save file has to wait for the folder handle to
    // be re-attached. Reconnecting is async (IndexedDB lookup + a permission
    // check), so anything that ran straight after the call above saw
    // FolderMode.active() === false and looked for the world in browser
    // storage instead — where a folder save does not exist. That is what made
    // "load failed" appear for perfectly good files, and (before load failures
    // stopped autosaves) what let an empty world overwrite them.
    folderReady.then(() => {
      // Auto-load a slot chosen from the in-game pause menu. Loading mid-session
      // can't just call startGame() — it early-returns once gameStarted is set,
      // and every subsystem still holds the old world's state — so the pause menu
      // flags the target slot and reloads, and we pick it up here on a clean boot.
      const _pendingLoad = sessionStorage.getItem('autostart_loadslot');
      if (_pendingLoad) {
        sessionStorage.removeItem('autostart_loadslot');
        readAndStartLoad(_pendingLoad);
        return;
      }
      // GAME OVER's "Load a save" reloads for a clean boot, then lands here:
      // open the save list straight away rather than leaving the player on
      // the bare main menu.
      if (sessionStorage.getItem('gw_open_load') === '1') {
        sessionStorage.removeItem('gw_open_load');
        if (SaveSystem.listSlots().length) showLoadGameModal();
      }
      // Demo: a scenario picked on the last page (the reload gives it a clean
      // boot, as a new game gets). An ordinary new world with default rules,
      // no naming and no cinematic; ScenarioSystem.begin() builds on it.
      const _scn = typeof ScenarioSystem !== 'undefined' ? ScenarioSystem.takePending() : null;
      if (_scn) {
        _scenarioBoot = _scn;
        CityInfo.setNames(_scn.place, _scn.company);
        Difficulty.set(null);
        startGame(false);
        return;
      }
      if (typeof ScenarioSystem !== 'undefined') ScenarioSystem.menuReady();
      // Auto-start new game if flagged by previous session
      if (sessionStorage.getItem('autostart_newgame')) {
        sessionStorage.removeItem('autostart_newgame');
        const pendingCity    = sessionStorage.getItem('pending_cityName');
        const pendingCompany = sessionStorage.getItem('pending_companyName');
        sessionStorage.removeItem('pending_cityName');
        sessionStorage.removeItem('pending_companyName');
        CityInfo.setNames(pendingCity, pendingCompany);
        CityInfo.setIdentity(sessionStorage.getItem('pending_flag'), sessionStorage.getItem('pending_hallStyle'));
        sessionStorage.removeItem('pending_flag');
        sessionStorage.removeItem('pending_hallStyle');
        // Before startGame: createSlot needs to know about permadeath, and
        // the starting balance and prices come from here.
        let pendingDiff = null;
        try { pendingDiff = JSON.parse(sessionStorage.getItem('pending_difficulty') || 'null'); } catch (_e) {}
        sessionStorage.removeItem('pending_difficulty');
        Difficulty.set(pendingDiff);
        startGame(false);
      } else {
        CityInfo.render();
      }
    });
  }

  return { init, showConfirm, updateLoadButtonVisibility };   // mobile: refresh after bundled saves import
})();

// Version labels (main menu, pause footer) read package.json — the same
// number electron-builder stamps on the exe — so they can't drift from it.
// The text baked into index.html is only the fallback if the fetch fails.
fetch('package.json', { cache: 'no-store' })
  .then(r => r.json())
  .then(p => { if (p.version) document.querySelectorAll('.gw-version').forEach(el => { el.textContent = `v${p.version}`; }); })
  .catch(() => {});

// ═══════════════════════════════════════════════════════════════════
// ZONE SYSTEM
// ═══════════════════════════════════════════════════════════════════
