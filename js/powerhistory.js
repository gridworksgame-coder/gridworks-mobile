/* ═══════════════════════════════════════════════════════════════════
   POWER HISTORY
   Samples totalGenerated + totalConsumed once per second.
   Keeps the last 60 samples for the GRID panel graph.
   ═══════════════════════════════════════════════════════════════════ */
const PowerHistory = (() => {
  const MAX_SAMPLES = 60;
  const samples = [];         // { gen, con } newest last
  let accumulator = 0;        // seconds since last sample

  return {
    tick(dt) {
      accumulator += dt;
      if (accumulator >= 1) {
        accumulator -= 1;
        samples.push({
          gen: PowerNetwork.stats.totalGenerated,
          con: PowerNetwork.stats.totalConsumed,
        });
        if (samples.length > MAX_SAMPLES) samples.shift();
      }
    },

    get samples() { return samples; },

    // Draw graph onto a canvas element
    draw(canvas) {
      const ctx = canvas.getContext('2d');
      // Layout in CSS px, bitmap at the size actually shown on screen — the
      // GRID panel is CSS-zoomed, so a 1:1 bitmap would be stretched blurry.
      const W = canvas.offsetWidth  || 220;
      const H = canvas.offsetHeight || 90;
      const k = (canvas.getBoundingClientRect().width / W) || 1;
      canvas.width  = Math.round(W * k);
      canvas.height = Math.round(H * k);
      ctx.setTransform(k, 0, 0, k, 0, 0);

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#060a0e';
      ctx.fillRect(0, 0, W, H);

      if (samples.length < 2) {
        ctx.fillStyle = '#2a3a4a';
        ctx.font = '9px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText('Collecting data...', W / 2, H / 2 + 4);
        ctx.textAlign = 'left';
        return;
      }

      const PAD  = { top: 6, right: 8, bottom: 16, left: 30 };
      const gW   = W - PAD.left - PAD.right;
      const gH   = H - PAD.top  - PAD.bottom;

      // Value range — always include 0, add 20% headroom
      const maxVal = Math.max(
        ...samples.map(s => Math.max(s.gen, s.con)), 1
      ) * 1.2;

      const toX = i => PAD.left + (i / (MAX_SAMPLES - 1)) * gW;
      const toY = v => PAD.top  + gH - (v / maxVal) * gH;

      // ── Grid lines ──────────────────────────────────────────────
      ctx.strokeStyle = '#1a2530';
      ctx.lineWidth   = 1;
      const gridSteps = 4;
      for (let i = 0; i <= gridSteps; i++) {
        const y = PAD.top + (i / gridSteps) * gH;
        ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();

        // Y axis label
        const val = maxVal * (1 - i / gridSteps);
        ctx.fillStyle = '#3a5060';
        ctx.font = '7px Courier New';
        ctx.textAlign = 'right';
        ctx.fillText(`${formatPower(val, 0)}`, PAD.left - 4, y + 3);
      }

      // Vertical time markers (every 15s)
      for (let s = 0; s <= 60; s += 15) {
        const x = PAD.left + (s / 60) * gW;
        ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, H - PAD.bottom); ctx.stroke();
        if (s > 0 && s < 60) {
          ctx.fillStyle = '#3a5060';
          ctx.font = '7px Courier New';
          ctx.textAlign = 'center';
          ctx.fillText(`-${60-s}s`, x, H - 4);
        }
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = '#3a5060';
      ctx.font = '7px Courier New';
      ctx.fillText('now', W - PAD.right - 10, H - 4);

      // ── Plot lines ──────────────────────────────────────────────
      // Offset x so newest sample is always at the right edge
      const offset = MAX_SAMPLES - samples.length;

      function plotLine(key, color) {
        ctx.beginPath();
        let started = false;
        samples.forEach((s, i) => {
          const x = toX(i + offset);
          const y = toY(s[key]);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth   = 1.5;
        ctx.lineJoin    = 'round';
        ctx.stroke();

        // Fill under line
        if (started) {
          const lastX = toX(samples.length - 1 + offset);
          const firstX = toX(offset);
          ctx.lineTo(lastX, H - PAD.bottom);
          ctx.lineTo(firstX, H - PAD.bottom);
          ctx.closePath();
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = color;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      plotLine('gen', '#f0c040');
      plotLine('con', '#60b0ff');
    },
  };
})();

