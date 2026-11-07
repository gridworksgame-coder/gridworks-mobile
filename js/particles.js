/* ═══════════════════════════════════════════════════════════════════
   PARTICLES
   Lightweight particle burst effect system.
   ═══════════════════════════════════════════════════════════════════ */

const Particles = (() => {
  const particles = [];

  function spawn(worldX, worldY, color, count = 5) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 10 + Math.random() * 20;
      particles.push({
        x: worldX, y: worldY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 15,
        color,
        life: 1,
        decay: 1.2 + Math.random() * 0.8,
        size: 1 + Math.random() * 1.5,
      });
    }
  }

  function tick(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x   += p.vx * dt;
      p.y   += p.vy * dt;
      p.vy  += 80 * dt;  // gravity
      p.life -= p.decay * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function render(ctx, cam) {
    if (!particles.length) return;
    // Single pass — no alpha changes, just fade via color opacity string
    for (const p of particles) {
      if (p.life <= 0.05) continue;
      const sx = (p.x - cam.x) * cam.zoom;
      const sy = (p.y - cam.y) * cam.zoom;
      const r  = Math.max(1, p.size * cam.zoom * 0.5);
      const a  = Math.round(p.life * 255).toString(16).padStart(2,'0');
      ctx.fillStyle = p.color + a;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
  }

  return { spawn, tick, render };
})();


