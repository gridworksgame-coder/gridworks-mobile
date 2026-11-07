/* ═══════════════════════════════════════════════════════════════════
   THROTTLE GOVERNOR
   A 2×2 control cabinet placed touching a Fuel or Coal Generator. While a
   governed generator runs in Overdrive, it trims the throttle back toward
   Normal as heat (fuel) or boiler pressure (coal) nears 100%, so the
   generator never goes critical and explodes (MeltdownSystem). One governor covers every generator it
   touches. It needs power to work: on a browned-out network it stops
   governing and Overdrive can melt the generator down.
   ═══════════════════════════════════════════════════════════════════ */

const GovernorSystem = (() => {
  const GOVERNABLE = new Set([T.FUELGEN, T.COALGENERATOR]);

  function isGovernable(e) { return !!e && GOVERNABLE.has(e.type); }

  // Distinct entities accepted by `accept` sharing an edge with e's footprint.
  function _touching(e, accept) {
    const found = new Set();
    const w = e.width || 1, h = e.height || 1;
    const check = (c, r) => {
      const n = GridManager.getEntity(c, r);
      if (n && n !== e && accept(n)) found.add(n);
    };
    for (let c = e.col; c < e.col + w; c++) { check(c, e.row - 1); check(c, e.row + h); }
    for (let r = e.row; r < e.row + h; r++) { check(e.col - 1, r); check(e.col + w, r); }
    return [...found];
  }

  function generatorsFor(gov) { return _touching(gov, isGovernable); }
  function governorsFor(gen)  { return _touching(gen, n => n.type === T.GOVERNOR); }
  function isActive(gov)      { return !!gov.powered && !gov._lightningDamaged; }

  // The throttle a generator actually runs at this tick. `level` is its heat
  // (fuel) or boiler pressure (coal). Also stamps _governorCount / _governed /
  // _govTrim on the generator for the panels and sprites.
  function effectiveMode(gen, modes, key, level) {
    const govs = governorsFor(gen);
    const active = govs.some(isActive);
    gen._governorCount = govs.length;
    gen._governed = active;
    gen._govTrim = 0;
    if (key !== 'overdrive' || !active) return modes[key];
    const def = EntityDefs[T.GOVERNOR];
    const k = Math.max(0, Math.min(1, (def.trimLimit - level) / (def.trimLimit - def.trimStart)));
    gen._govTrim = 1 - k;
    if (k >= 1) return modes.overdrive;
    const lo = modes.normal, hi = modes.overdrive, out = { ...hi };
    for (const f in hi) {
      if (typeof hi[f] === 'number' && typeof lo[f] === 'number') out[f] = lo[f] + (hi[f] - lo[f]) * k;
    }
    return out;
  }

  return { isGovernable, generatorsFor, governorsFor, isActive, effectiveMode };
})();

// ── Sprite ─────────────────────────────────────────────────────────
// A steel control cabinet on a hazard-marked pad, crowned by a brass
// flyball (Watt) governor: the balls spin while it's working and swing
// further out the harder it's trimming. Conduits run out to each side that
// touches a governed generator, a dial shows the hottest attached
// generator's heat/pressure against its red trip zone, and a lamp gives
// the state at a glance (green holding, amber trimming, red unpowered,
// grey idle).
function renderGovernor(e, px, py, t) {
  if (e.col * TILE !== px || e.row * TILE !== py) return;
  const S = TILE / 40, W = TILE * 2, H = TILE * 2, cx = px + W / 2;

  // Attached generators and the side(s) they touch
  const sides = { N: false, S: false, W: false, E: false };
  let gens = 0, working = 0, trim = 0, level = 0, overdrive = false;
  {
    const seen = new Set();
    const look = (c, r, side) => {
      const n = GridManager.getEntity(c, r);
      if (!n || !GovernorSystem.isGovernable(n)) return;
      sides[side] = true;
      if (seen.has(n)) return;
      seen.add(n); gens++;
      level = Math.max(level, n.type === T.FUELGEN ? (n._fgHeat || 0) : (n._cgPressure || 0));
      // Only a generator that's actually burning gives the governor work.
      const running = n.type === T.FUELGEN
        ? !!n._fuelled && n._fgState !== 'coasting'
        : !!n._fuelled && !!n._hasWater && !!n.powered;
      if (!running) return;
      working++;
      trim  = Math.max(trim, n._govTrim || 0);
      if ((n.type === T.FUELGEN ? n._fgThrottle : n._cgThrottle) === 'overdrive') overdrive = true;
    };
    for (let k = 0; k < 2; k++) {
      look(e.col + k, e.row - 1, 'N'); look(e.col + k, e.row + 2, 'S');
      look(e.col - 1, e.row + k, 'W'); look(e.col + 2, e.row + k, 'E');
    }
  }
  const powered = !!e.powered && !e._lightningDamaged;
  const active  = powered && working > 0;   // spins / flows only while governing a running generator
  const trimming = active && overdrive && trim > 0.02;

  ctx.save();

  // ── Pad ──
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.roundRect(px + 5*S, py + 6*S, W - 8*S, H - 8*S, 4*S); ctx.fill();
  ctx.fillStyle = '#44474a';
  ctx.beginPath(); ctx.roundRect(px + 3*S, py + 3*S, W - 6*S, H - 6*S, 4*S); ctx.fill();
  ctx.strokeStyle = '#26282a'; ctx.lineWidth = S; ctx.stroke();
  // hazard chevrons in the corners
  ctx.fillStyle = '#e0b020';
  for (const [hx, hy, sx, sy] of [[px + 3*S, py + 3*S, 1, 1], [px + W - 3*S, py + 3*S, -1, 1], [px + 3*S, py + H - 3*S, 1, -1], [px + W - 3*S, py + H - 3*S, -1, -1]]) {
    for (let k = 0; k < 2; k++) {
      const o = (2 + k*4) * S;
      ctx.beginPath();
      ctx.moveTo(hx + sx*o, hy); ctx.lineTo(hx + sx*(o + 2.2*S), hy);
      ctx.lineTo(hx, hy + sy*(o + 2.2*S)); ctx.lineTo(hx, hy + sy*o);
      ctx.closePath(); ctx.fill();
    }
  }

  // ── Conduits out to attached generators ──
  const kx = px + 12*S, ky = py + 12*S, kw = W - 24*S, kh = H - 22*S;
  const conduit = (x1, y1, x2, y2) => {
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#1a1c1e'; ctx.lineWidth = 6*S;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = '#6a6e72'; ctx.lineWidth = 4*S; ctx.stroke();
    if (active) {
      ctx.strokeStyle = trimming ? 'rgba(255,190,80,0.95)' : 'rgba(120,230,255,0.9)';
      ctx.lineWidth = 1.5*S; ctx.setLineDash([2.5*S, 3*S]); ctx.lineDashOffset = -t*14*S;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    ctx.fillStyle = '#8a8e92';
    ctx.beginPath(); ctx.arc(x2, y2, 2.4*S, 0, Math.PI*2); ctx.fill();
  };
  if (sides.N) conduit(cx, ky, cx, py + 1*S);
  if (sides.S) conduit(cx, ky + kh, cx, py + H - 1*S);
  if (sides.W) conduit(kx, py + H/2, px + 1*S, py + H/2);
  if (sides.E) conduit(kx + kw, py + H/2, px + W - 1*S, py + H/2);

  // ── Cabinet ──
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.roundRect(kx + 3*S, ky + 4*S, kw, kh, 3*S); ctx.fill();
  ctx.fillStyle = '#56606a';
  ctx.beginPath(); ctx.roundRect(kx, ky, kw, kh, 3*S); ctx.fill();
  ctx.fillStyle = '#6c7680'; ctx.fillRect(kx + 1.5*S, ky + 1.5*S, kw*0.5 - 2*S, kh - 3*S);   // lit door leaf
  ctx.strokeStyle = '#1a1e24'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.roundRect(kx, ky, kw, kh, 3*S); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, ky + 2*S); ctx.lineTo(cx, ky + kh - 2*S); ctx.stroke();   // door seam
  ctx.strokeStyle = 'rgba(20,24,28,0.6)'; ctx.lineWidth = 0.8*S;
  for (let v = 0; v < 3; v++) {                                                            // vent louvres
    const vy = ky + kh - 5*S - v*2.4*S;
    ctx.beginPath(); ctx.moveTo(kx + kw*0.58, vy); ctx.lineTo(kx + kw - 3*S, vy); ctx.stroke();
  }

  // ── Heat / pressure dial ──
  const dx = kx + kw*0.27, dy = ky + kh - 6.5*S, dr = 4.6*S;
  ctx.fillStyle = '#ece6d6'; ctx.beginPath(); ctx.arc(dx, dy, dr, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 0.8*S; ctx.stroke();
  const a0 = Math.PI*0.75, span = Math.PI*1.5;
  ctx.strokeStyle = '#d03020'; ctx.lineWidth = 1.4*S;
  ctx.beginPath(); ctx.arc(dx, dy, dr - 1.2*S, a0 + span*0.8, a0 + span); ctx.stroke();   // trip zone from 80%
  const na = a0 + span*Math.min(1, gens ? level : 0);
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 0.9*S;
  ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + Math.cos(na)*(dr - 1.2*S), dy + Math.sin(na)*(dr - 1.2*S)); ctx.stroke();

  // ── Status lamp ──
  const lx = kx + kw*0.78, ly = ky + 5*S;
  const lamp = !gens ? '#5a5e62' : !powered ? (Math.sin(t*4) > 0 ? '#e03020' : '#601810') : trimming ? '#ffb020' : '#40e070';
  if (gens && (powered || Math.sin(t*4) > 0)) {
    ctx.fillStyle = lamp; ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.arc(lx, ly, 4*S, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = lamp; ctx.beginPath(); ctx.arc(lx, ly, 1.8*S, 0, Math.PI*2); ctx.fill();

  // ── Flyball governor ──
  const sx = cx, sy = ky + kh*0.40;
  const spin   = active ? t * (overdrive ? 7 : 3) : 0.7;
  const spread = (6.5 + (active ? 2 + trim*5 : 0)) * S;
  ctx.fillStyle = '#2a2e34'; ctx.beginPath(); ctx.arc(sx, sy, spread + 2*S, 0, Math.PI*2); ctx.fill();   // base plate
  ctx.strokeStyle = '#8a7040'; ctx.lineWidth = 0.8*S;
  ctx.beginPath(); ctx.arc(sx, sy, spread + 2*S, 0, Math.PI*2); ctx.stroke();
  for (let i = 0; i < 2; i++) {
    const a = spin + i*Math.PI;
    const bx = sx + Math.cos(a)*spread, by = sy + Math.sin(a)*spread*0.85;
    ctx.strokeStyle = '#b08838'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(bx, by); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(bx + 1*S, by + 1.4*S, 3*S, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = powered ? '#e0b048' : '#8a7040'; ctx.beginPath(); ctx.arc(bx, by, 3*S, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,245,210,0.7)'; ctx.beginPath(); ctx.arc(bx - 0.9*S, by - 1*S, 1*S, 0, Math.PI*2); ctx.fill();
  }
  ctx.fillStyle = '#3a3e44'; ctx.beginPath(); ctx.arc(sx, sy, 2.4*S, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#c8a050'; ctx.beginPath(); ctx.arc(sx, sy, 1*S, 0, Math.PI*2); ctx.fill();

  ctx.restore();
}
