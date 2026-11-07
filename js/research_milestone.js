/* ═══════════════════════════════════════════════════════════════════
   RESEARCH MILESTONE
   The "big letters" moment for unlocking a Research Station tier
   (MK1–MK5), in the same cinematic language as FUSION ACHIEVED and the
   contract arrival card: letterbox bars, a mono eyebrow, a huge Orbitron
   title that slams in. Each tier takes its station's own glow colour, reads
   its spec sheet live from EntityDefs, and piles on more spectacle than the
   one before (rings, light rays, sparks, screen shake).

   Fired from Progression (MK1 auto-unlock, MK2–MK5 manualUnlock). Held
   until the player clicks / presses a key / hits Ⓐ; that first input is
   swallowed. The game keeps running underneath. One at a time; extras queue.
   ═══════════════════════════════════════════════════════════════════ */
const ResearchMilestone = (() => {
  const ARM_MS = 1200;   // ignore input this long so a stray click can't skip the slam
  const TIERS = {
    1: { numeral: 'I',   type: () => T.RESEARCH,    sub: 'RESEARCH PROGRAMME ESTABLISHED' },
    2: { numeral: 'II',  type: () => T.RESEARCH2,   sub: 'ADVANCED SYSTEMS CLEARED' },
    3: { numeral: 'III', type: () => T.RESEARCH3,   sub: 'HEAVY INDUSTRY CLEARED' },
    4: { numeral: 'IV',  type: () => T.MK4RESEARCH, sub: 'NUCLEAR PROGRAMME CLEARED' },
    5: { numeral: 'V',   type: () => T.MK5RESEARCH, sub: 'FRONTIER SCIENCE CLEARED' },
  };

  const queue = [];
  let root = null, armedAt = 0, cv = null, g = null, raf = 0, sparks = [], t0 = 0, curTier = 0, glowRGB = '255,255,255';

  const _def = tier => (typeof EntityDefs !== 'undefined' && EntityDefs[TIERS[tier].type()]) || {};
  const _hex = h => { const n = parseInt(h.slice(1), 16); return `${n >> 16},${(n >> 8) & 255},${n & 255}`; };

  function _specs(tier) {
    const d = _def(tier), prev = tier > 1 ? _def(tier - 1) : null;
    const rate = d.researchRate || 0;
    const mult = prev && prev.researchRate ? rate / prev.researchRate : 0;
    const w = d.width || 1, h = d.height || 1;
    return [
      ['BUILD COST',    formatMoney(d.cost || 0), ''],
      ['POWER DRAW',    formatPower(d.powerInput || 0), 'WHILE RESEARCHING'],
      ['UPKEEP',        `$${d.upkeep || 0}/s`, ''],
      ['RESEARCH RATE', `${rate} PT/S`, mult ? `▲ ${+mult.toFixed(2)}× MK${tier - 1}` : 'BASELINE'],
      ['FOOTPRINT',     `${w} × ${h}`, 'TILES'],
    ];
  }

  // The two tiers that open a reactor carry a hazard notice: MK3's research
  // leads to the Nuclear Reactor (a meltdown levels its blast radius), MK4's
  // to the Advanced Reactor (a MOX meltdown takes the whole city and ends
  // the run — see MeltdownSystem).
  const WARNINGS = {
    3: { head: 'NUCLEAR PROGRAMME <b>AUTHORISED</b>',
         body: `This station's research leads to uranium, fuel rods and the Nuclear Reactor: more power than anything you have built, and a real danger to everything around it.
           Starve a reactor of cooling, or leave its steam with nowhere to go, and its core <em>melts down, levelling every building within its blast radius</em>.
           Cooling-tower pumps can trip in a blackout, and reactors built close together make each other's blast bigger. Site them far from your homes.` },
    4: { head: 'MOX FUEL <b>AUTHORISED</b>',
         body: `This station's research leads to plutonium, MOX fuel and the Advanced Nuclear Reactor, the most dangerous thing you can build.
           An Advanced Reactor that loses its Cryogenic Coolant, or has nowhere to send its steam, goes critical, and a MOX meltdown
           <em>takes every building you have ever placed and ends the run</em>. There is no rebuilding from it.
           Keep a Cryogenic Cooling Tower and powered Steam Turbines on every one, and a stable grid behind them.` },
  };
  const _hasWarning = tier => !!WARNINGS[tier];
  function _warning(tier) {
    const w = WARNINGS[tier];
    return `<div class="rm-warn">
         <span class="rm-warn-ic">☢</span>
         <div class="rm-warn-h">${w.head}</div>
         <div class="rm-warn-p">${w.body}</div>
       </div>`;
  }

  // A tier lands as a research unlock confirms, in the same frame as the
  // hotbar rebuild and the unlock toast; the card waits a frame so its
  // opening slam doesn't start on the back of that.
  let pending = false;
  function show(tier) {
    if (!TIERS[tier]) return;
    queue.push(tier);
    if (root || pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; if (!root) _next(); });
  }

  function _next() {
    const tier = queue.shift();
    if (!tier) return;
    const t = TIERS[tier], d = _def(tier);
    const glow = d.glowColor || '#b060ff';
    const city = (typeof CityInfo !== 'undefined' ? CityInfo.getCityName() : '') || '';
    curTier = tier; glowRGB = _hex(glow);

    const specs = _specs(tier).map(([k, v, note], i) =>
      `<div class="rm-spec" style="--i:${i}"><span class="rm-k">${k}</span><b class="rm-v">${v}</b><i class="rm-n">${note}</i></div>`).join('');
    const pips = [1, 2, 3, 4, 5].map(n => `<span class="rm-pip${n <= tier ? ' on' : ''}${n === tier ? ' cur' : ''}" style="--i:${n}">MK${n}</span>`).join('');
    const rings = Array.from({ length: tier }, (_x, i) => `<i class="rm-ring" style="--d:${0.15 + i * 0.22}s"></i>`).join('');

    root = document.createElement('div');
    root.id = 'gw-rmile';
    root.className = `t${tier}`;
    root.style.setProperty('--rm-c', glow);
    root.innerHTML =
      `<div class="rm-rays"></div>
       <div class="rm-rings">${rings}</div>
       <canvas class="rm-fx"></canvas>
       <div class="rm-scan"></div>
       <div class="rm-bar rm-top"><span>⚗ ${d.label || 'RESEARCH STATION MK' + tier}</span><span class="rm-r">ONLINE</span></div>
       <div class="rm-bar rm-bot"><span>${t.sub}</span><span>TIER ${t.numeral} / V</span></div>
       <div class="rm-flash"></div>
       <div class="rm-halo"></div>
       <div class="rm-title">
         <div class="rm-eyebrow">${city.toUpperCase()}${city ? ' · ' : ''}RESEARCH DIVISION</div>
         <div class="rm-big">MK${tier} RESEARCH</div>
         <div class="rm-sub">UNLOCKED</div>
         <div class="rm-pips">${pips}</div>
         <div class="rm-specs">${specs}</div>
         ${_hasWarning(tier) ? _warning(tier) : ''}
         <div class="rm-go">${typeof GamepadInput !== 'undefined' && GamepadInput.connected ? 'PRESS Ⓐ TO CONTINUE' : 'CLICK TO CONTINUE'}</div>
       </div>`;
    document.body.appendChild(root);

    cv = root.querySelector('.rm-fx');
    g = cv.getContext('2d');
    _resize();
    window.addEventListener('resize', _resize);

    try { SFX.achievement?.(); } catch (_e) {}
    if (tier >= 3) try { SFX.unlock?.(); } catch (_e) {}
    if (tier >= 4 && typeof Camera !== 'undefined' && Camera.shake) Camera.shake(tier === 5 ? 20 : 10);

    // Sparks: a burst on the slam, thicker with each tier (none for MK1/2).
    sparks = [];
    t0 = performance.now();
    if (tier >= 3) {
      const n = [0, 0, 0, 70, 130, 220][tier];
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * (tier * 160);
        sparks.push({ a, sp, life: 1 + Math.random() * 1.8, age: -0.35 - Math.random() * 0.05 });
      }
    }
    if (sparks.length) raf = requestAnimationFrame(_frame);

    // Held until the player clicks (or presses a key); the first input is
    // swallowed so it doesn't also land on the world underneath. A card with
    // a hazard notice holds a little longer, until the notice has landed.
    armedAt = performance.now() + (_hasWarning(tier) ? 3200 : ARM_MS);
    window.addEventListener('mousedown', _onInput, true);
    window.addEventListener('keydown', _onInput, true);
  }

  // The sparks are soft dots: a canvas at the screen's full device-pixel
  // ratio was up to four times the pixels to clear and composite every
  // frame, over the city, for no visible gain.
  function _resize() {
    if (!cv) return;
    const dpr = Math.min(1, window.devicePixelRatio || 1);
    cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  let last = 0;
  function _frame(now) {
    if (!root || !g) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
    g.clearRect(0, 0, innerWidth, innerHeight);
    const cx = innerWidth / 2, cy = innerHeight / 2;
    g.globalCompositeOperation = 'lighter';
    let live = false;
    for (const s of sparks) {
      s.age += dt;
      if (s.age <= s.life) live = true;
      if (s.age < 0 || s.age > s.life) continue;
      const u = s.age / s.life, r = s.sp * (1 - Math.pow(1 - u, 2)) * 1.1;
      const x = cx + Math.cos(s.a) * r, y = cy + Math.sin(s.a) * r * 0.6 + u * u * 60;
      g.fillStyle = `rgba(${glowRGB},${(1 - u) * 0.9})`;
      g.beginPath(); g.arc(x, y, 1.2 + (1 - u) * 1.8, 0, 6.283); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    // Once the last spark has burned out there is nothing left to draw;
    // the loop used to run on, clearing an empty canvas, until the card closed.
    if (live) raf = requestAnimationFrame(_frame);
    else { raf = 0; last = 0; }
  }

  function _onInput(ev) {
    if (!root || ev.type === 'keydown' && (ev.key === 'F11' || ev.key === 'F12')) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    _end();
  }
  function padFrame(aDown) { if (aDown) _end(); }
  const isActive = () => !!root && !root.classList.contains('out');

  function _end() {
    const r = root;
    if (!r || r.classList.contains('out') || performance.now() < armedAt) return;
    window.removeEventListener('mousedown', _onInput, true);
    window.removeEventListener('keydown', _onInput, true);
    r.classList.add('out');
    // Exit shockwave: one last ring and a flash that the letters blow through.
    r.insertAdjacentHTML('beforeend', '<i class="rm-ring rm-xring"></i><div class="rm-xflash"></div>');
    try { SFX.click?.(); } catch (_e) {}
    setTimeout(() => {
      cancelAnimationFrame(raf); last = 0;
      window.removeEventListener('resize', _resize);
      r.remove();
      if (root === r) root = null;
      _next();
    }, 1300);
  }

  return { show, isActive, padFrame };
})();
