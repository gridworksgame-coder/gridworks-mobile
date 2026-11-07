/* ═══════════════════════════════════════════════════════════════════
   ZONE LIFE
   Ambient people and vehicles moving around the zones, on the route
   network each zone's ground is laid out with (_zoneGroundPlan in
   render_core.js): residents out walking on the neighbourhood sidewalks,
   traffic and shoppers on the commercial streets, forklifts, haul trucks
   and hard-hatted crews in the industrial yards, officials and visitors
   along the government promenades.

   Nothing here is saved. People are simulated not at all: the plan's route
   tiles are split into straight runs, and every walker is a pure function
   of its run, its index and the render clock — where it is along the run,
   which way it's going, how fast — so there's no per-tick cost and no
   state to keep in sync with the world. Because the plan is rebuilt
   whenever a zone's buildings change, everything re-routes with it.

   Vehicles are the exception (see "Zone-street traffic"): they drive the
   street network with a little state each, keeping to their side of the
   road (right-hand traffic), queueing behind each other and taking turns
   at junctions, and drive into and out of the tunnel mouths (TunnelPortal,
   render_core.js) where a street runs out of the zone, and run between
   the zones on the connector roads. How busy each zone
   is follows its own hours, and a stable subset of people thins out as it
   gets quieter rather than all of them flickering. Only what's on screen
   is drawn (and only on-screen zones' traffic moves), and nothing is
   drawn when zoomed far out.
   ═══════════════════════════════════════════════════════════════════ */

const ZoneLife = (() => {
  const _runCache = new WeakMap();   // plan object → straight runs
  // Per-frame limits, set at the top of render() from the graphics quality
  // level: how many figures may still be drawn this frame, and what share of
  // them are out at all.
  let _budget = 0, _density = 1;

  function _hash(a, b) {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // Straight horizontal and vertical runs of at least two route tiles.
  function _runsFor(plan) {
    let runs = _runCache.get(plan);
    if (runs) return runs;
    runs = [];
    const { c0, c1, r0, r1, w, path } = plan;
    const isP = (c, r) => c >= c0 && c <= c1 && r >= r0 && r <= r1 && path[(r - r0) * w + (c - c0)] === 1;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1;) {
        if (!isP(c, r)) { c++; continue; }
        let e = c; while (e + 1 <= c1 && isP(e + 1, r)) e++;
        if (e > c) runs.push({ horiz: true, a: c, b: e, fixed: r, id: r * 4099 + c * 31 + 7 });
        c = e + 1;
      }
    }
    for (let c = c0; c <= c1; c++) {
      for (let r = r0; r <= r1;) {
        if (!isP(c, r)) { r++; continue; }
        let e = r; while (e + 1 <= r1 && isP(c, e + 1)) e++;
        if (e > r) runs.push({ horiz: false, a: r, b: e, fixed: c, id: c * 7919 + r * 17 + 3 });
        r = e + 1;
      }
    }
    _runCache.set(plan, runs);
    return runs;
  }

  // ── Per-zone character ────────────────────────────────────────────
  // band: half-width of the zone's route (matches the ground renderers)
  // peds / vehicles: figures per route tile at full activity
  // pedOffset: where people walk across the route (0 = along the middle)
  // groups / groupKinds: chance (at full activity) that a stretch of route
  // has people standing about on it — neighbours chatting, kids throwing a
  // ball, a street vendor, a busker, a crew on their break (see _drawGroup)
  const ZONES = {
    residential: {
      band: 7, peds: 0.45, vehicles: 0, pedOffset: 0,
      activity: (hr) => hr >= 7 && hr < 21 ? 1 : (hr >= 21 && hr < 23) || (hr >= 5.5 && hr < 7) ? 0.35 : 0.05,
      pedKinds: [['walker', 0.34], ['dog', 0.17], ['jogger', 0.13], ['stroller', 0.11], ['bike', 0.15], ['scooter', 0.1]],
      groups: 0.4, groupKinds: [['chat', 0.55], ['ball', 0.45]], chatKind: 'walker',
    },
    commercial: {
      band: 12, peds: 0.4, vehicles: 0.34, pedOffset: 17,
      activity: (hr) => hr >= 8 && hr < 22 ? 1 : (hr >= 6 && hr < 8) || hr >= 22 ? 0.45 : 0.12,
      pedKinds: [['shopper', 0.55], ['walker', 0.3], ['bike', 0.15]],
      vehKinds: [['car', 0.44], ['taxi', 0.13], ['van', 0.14], ['bus', 0.08], ['suv', 0.11], ['pickup', 0.07], ['police', 0.018], ['ambulance', 0.012]],
      groups: 0.45, groupKinds: [['chat', 0.35], ['vendor', 0.4], ['busker', 0.25]], chatKind: 'shopper',
    },
    // Haul roads carry only road vehicles, all at one lane speed so their
    // spacing holds. Slow yard machines work the open ground off the roads
    // instead (yard: share of clear yard tiles with a machine on them).
    industrial: {
      band: 12, peds: 0.28, vehicles: 0.3, pedOffset: 16,
      activity: (hr) => hr >= 6 && hr < 18 ? 1 : 0.45,
      pedKinds: [['worker', 1]],
      vehKinds: [['dump', 0.3], ['semi', 0.35], ['tanker', 0.14], ['flatbed', 0.13], ['pickup', 0.08]],
      yard: 0.4,
      yardKinds: [['forklift', 0.25], ['tractor', 0.16], ['bulldozer', 0.13], ['excavator', 0.13], ['loader', 0.11], ['mixer', 0.11], ['welder', 0.11]],
      groups: 0.3, groupKinds: [['huddle', 1]], chatKind: 'worker',
    },
    // The government quarter is pedestrian-only: no vehicles on the promenades.
    government: {
      band: 10, peds: 0.5, vehicles: 0, pedOffset: 0,
      activity: (hr) => hr >= 8 && hr < 18 ? 1 : hr >= 18 && hr < 21 ? 0.3 : 0.04,
      // Tours were 0.12 — one or two on every promenade at all times.
      pedKinds: [['official', 0.38], ['tourist', 0.41], ['guard', 0.18], ['tour', 0.03]],
      groups: 0.45, groupKinds: [['photo', 0.5], ['chat', 0.5]], chatKind: 'official',
    },
  };
  const VEH = {
    car:       { len: 15, wid: 8,   speed: 34 },
    taxi:      { len: 15, wid: 8,   speed: 34 },
    suv:       { len: 16, wid: 8.6, speed: 33 },
    pickup:    { len: 17, wid: 8.4, speed: 32 },
    police:    { len: 15.5, wid: 8, speed: 36 },
    ambulance: { len: 19, wid: 9,   speed: 32 },
    van:       { len: 18, wid: 8.5, speed: 30 },
    bus:       { len: 30, wid: 9.5, speed: 24 },
    dump:      { len: 22, wid: 9,   speed: 22 },
    semi:      { len: 32, wid: 8.5, speed: 24 },
    tanker:    { len: 30, wid: 8.5, speed: 23 },
    flatbed:   { len: 30, wid: 8.5, speed: 23 },
    // Parked for the zone moments (zone_moments.js) rather than in traffic.
    moving:    { len: 23, wid: 9.6, speed: 20 },
    icecream:  { len: 17, wid: 8.6, speed: 14 },
    mailvan:   { len: 13, wid: 7.6, speed: 22 },
    foodtruck: { len: 19, wid: 9,   speed: 20 },
  };
  const pickKind = (kinds, v) => { let acc = 0; for (const [k, p] of kinds) { acc += p; if (v < acc) return k; } return kinds[kinds.length - 1][0]; };

  const SKIN  = ['#f0d0b0', '#e0b890', '#c89870', '#9a6a48', '#6a4630'];
  const HAIR  = ['#2a1e16', '#4a3222', '#8a5a2a', '#c8a060', '#6a6a6a', '#1a1a1a'];
  const SHIRT = ['#c8503a', '#3a6ab0', '#4a9a5a', '#d8a030', '#8a5aa0', '#e8e4dc', '#3a8a9a', '#d86a8a'];
  const CARS  = ['#c83a32', '#2a4a8a', '#e8e8e4', '#2a2a2e', '#8a8e94', '#3a7a4a', '#c89a30', '#5a3a6a'];
  const UMBRELLA = ['#1e2a3a', '#c83a32', '#2a5a9a', '#e8c020', '#3a7a4a', '#8a3a6a', '#2a2a2e'];

  // Set at the top of each render pass: how hard it's raining (0..1).
  let _rain = 0;
  // ...and how wintry it is (0..1), and whether what's falling is snow.
  // People dress for it the way they put umbrellas up for rain: as it gets
  // colder more of them are in a long coat, a scarf, a woolly hat and gloves.
  let _cold = 0, _snowing = false;
  const COAT  = ['#7a2a2e', '#2a4a6a', '#3a5a3a', '#5a4a3a', '#2e2e36', '#c8a030', '#6a3a6a', '#d8d4cc', '#a84a2a'];
  const SCARF = ['#c83a32', '#e8c020', '#2a8ad0', '#f4f2ec', '#3a8a5a', '#d86a8a'];
  function _sampleWeather() {
    _rain = typeof RainSystem !== 'undefined' && RainSystem.level ? RainSystem.level() : 0;
    _snowing = typeof RainSystem !== 'undefined' && !!RainSystem.isSnow && RainSystem.isSnow();
    const temp = typeof WeatherEventSystem !== 'undefined' && WeatherEventSystem.getTemperature ? WeatherEventSystem.getTemperature() : 18;
    const snow = typeof FrostSystem !== 'undefined' ? FrostSystem.coverage : 0;
    const season = typeof Seasons !== 'undefined' ? -Seasons.warmth() : 0;
    _cold = Math.max(0, Math.min(1, Math.max((9 - temp) / 9, snow * 1.3, season * 1.1, _snowing ? 1 : 0)));
  }
  // Whether person `k` has their winter things on. Uniformed kinds keep
  // their uniform; joggers and cyclists are dressed for the run.
  const _wrapped = (k, kind) => _cold > 0.25 && _hash(k, 21) < 0.25 + _cold * 0.75 &&
    kind !== 'worker' && kind !== 'welder' && kind !== 'guard' && kind !== 'vendor' && kind !== 'jogger' && kind !== 'bike' && kind !== 'chef';

  // ── Weather keeps people in ───────────────────────────────────────
  // Share of people still out on foot in the current weather (1 = all):
  // storms and downpours clear the streets, a cold snap keeps people in,
  // and in a heat wave the afternoon empties out while mornings and
  // evenings stay near normal (it's read off the actual temperature, so it
  // follows the day's curve). Eased over ~20s so a front rolling in thins
  // the crowds rather than emptying them at a stroke; people drop out as a
  // stable subset and fade as they go (see the walker loop in render()).
  // Traffic (_wxCar) thins less: a storm keeps people off the roads who
  // don't need to be on them, but heat and cold just move them into cars.
  const WX_EVENT = { storm: 0.3, rainstorm: 0.4, rainfall: 0.8, snowfall: 0.75, blizzard: 0.15 };
  const WX_CAR   = { storm: 0.5, rainstorm: 0.6, rainfall: 0.9, snowfall: 0.8, blizzard: 0.35 };
  let _wx = 1, _wxCar = 1, _wxT = null;
  function _activeWeather() {
    if (typeof WeatherEventSystem === 'undefined' || !WeatherEventSystem.getActiveEvent) return null;
    const ev = WeatherEventSystem.getActiveEvent();
    return ev ? ev.type : null;
  }
  function _weatherTarget() {
    if (typeof WeatherEventSystem === 'undefined') return 1;
    const ev = _activeWeather();
    let f = ev ? (WX_EVENT[ev] ?? 1) : 1;
    const temp = WeatherEventSystem.getTemperature ? WeatherEventSystem.getTemperature() : 18;
    if (temp > 28) f *= Math.max(0.3, 1 - (temp - 28) * 0.07);        // heat: ~0.3 by 38°C
    else if (temp < 6) f *= Math.max(0.35, 1 - (6 - temp) * 0.05);    // cold: ~0.35 by -7°C
    return f;
  }
  function _updateWeather(t) {
    const target = _weatherTarget(), ev = _activeWeather();
    const carTarget = ev ? (WX_CAR[ev] ?? 1) : 1;
    if (_wxT === null || t < _wxT || t - _wxT > 5) { _wx = target; _wxCar = carTarget; }   // first frame / after a pause
    else {
      const k = Math.min(1, (t - _wxT) / 20);
      _wx += (target - _wx) * k;
      _wxCar += (carTarget - _wxCar) * k;
    }
    _wxT = t;
  }
  // Workers and guards are on shift whatever the weather; they only thin a little.
  const _hardy = (key) => key === 'industrial';

  // A warm pool of light on the ground (bike lamps, torches), stamped from
  // one small bitmap like the headlight beam.
  let _poolCanvas = null;
  function _pool() {
    if (_poolCanvas) return _poolCanvas;
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(16, 16, 1, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,238,196,1)');
    grad.addColorStop(1, 'rgba(255,238,196,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
    return (_poolCanvas = c);
  }
  // Blue-white welding arc glow.
  let _arcCanvas = null;
  function _arcGlow() {
    if (_arcCanvas) return _arcCanvas;
    const c = document.createElement('canvas');
    c.width = c.height = 40;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(20, 20, 0, 20, 20, 20);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, 'rgba(200,225,255,0.85)');
    grad.addColorStop(0.5, 'rgba(120,170,255,0.25)');
    grad.addColorStop(1, 'rgba(120,170,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 40, 40);
    return (_arcCanvas = c);
  }

  // ── People (front-view figures standing on the ground) ────────────
  // `still`: 0 walking, 1 standing about, 2 standing and talking with their
  // hands (groups, vendors, the welder at the beam).
  function drawPerson(ctx, x, y, kind, dir, horiz, t, k, alpha, dark, detail, still = 0) {
    ctx.globalAlpha = alpha;
    const skin = SKIN[Math.floor(_hash(k, 1) * SKIN.length)];
    if (!detail) {
      ctx.fillStyle = kind === 'worker' || kind === 'welder' ? '#f08a20' : kind === 'official' || kind === 'guard' ? '#2a3040'
        : _wrapped(k, kind) ? COAT[Math.floor(_hash(k, 22) * COAT.length)] : SHIRT[Math.floor(_hash(k, 2) * SHIRT.length)];
      ctx.fillRect(x - 1.8, y - 6, 3.6, 5);
      ctx.fillStyle = skin; ctx.fillRect(x - 1.2, y - 8.2, 2.4, 2.2);
      return;
    }
    const face = horiz ? dir : 0;                 // sideways lean for horizontal travel
    const pace = kind === 'jogger' ? 11 : kind === 'scooter' ? 3 : 7;
    const step = still ? 0 : Math.sin(t * pace + k * 13);
    const bob = kind === 'jogger' && !still ? Math.abs(step) * 0.8 : 0;
    const lit = dark > 0.35;

    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(x + 1, y + 0.4, 3.2, 1.1, 0, 0, Math.PI * 2); ctx.fill();

    // After dark, cyclists run a lamp and some dog walkers and the guards
    // carry a torch: a soft pool on the ground ahead of them.
    if (lit && !still && (kind === 'bike' || kind === 'guard' || (kind === 'dog' && _hash(k, 14) < 0.5))) {
      const px = x + (horiz ? dir * 9 : 0), py = y + (horiz ? 0 : dir * 7);
      ctx.globalAlpha = alpha * 0.45 * dark;
      ctx.drawImage(_pool(), px - 7, py - 4, 14, 8);
      ctx.globalAlpha = alpha;
    }

    if (kind === 'bike') {
      const bx = horiz ? x : x, by = y;
      ctx.strokeStyle = '#1c1c1c'; ctx.lineWidth = 0.6;
      const wx = horiz ? 3.6 : 0.01;
      ctx.beginPath(); ctx.arc(bx - wx, by - 1.8, 1.8, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(bx + wx, by - 1.8, 1.8, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = SHIRT[Math.floor(_hash(k, 7) * SHIRT.length)]; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(bx - wx, by - 1.8); ctx.lineTo(bx, by - 4); ctx.lineTo(bx + wx, by - 1.8); ctx.stroke();
      ctx.fillStyle = SHIRT[Math.floor(_hash(k, 2) * SHIRT.length)];
      ctx.beginPath(); ctx.roundRect(bx - 1.8 + face * 0.6, by - 8.5, 3.6, 4.5, 1.2); ctx.fill();
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(bx + face * 0.9, by - 9.8, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d83a2a'; ctx.beginPath(); ctx.arc(bx + face * 0.9, by - 10.3, 1.5, Math.PI, 0); ctx.fill();   // helmet
      if (lit) { ctx.fillStyle = '#fff6d0'; ctx.fillRect(bx + (horiz ? dir * 3 : 0) - 0.5, by - 4.6, 1, 1); }       // lamp
      ctx.globalAlpha = 1;
      return;
    }
    if (kind === 'scooter') {                      // a kid on a kick scooter
      const wx = horiz ? 3.2 : 0.01;
      ctx.fillStyle = '#2a2a2e'; ctx.fillRect(x - wx - 0.6, y - 1.4, wx * 2 + 1.2, 0.8);            // deck
      ctx.beginPath(); ctx.arc(x - wx, y - 0.6, 0.9, 0, Math.PI * 2); ctx.arc(x + wx, y - 0.6, 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(x + (horiz ? dir * wx : 0), y - 1.2); ctx.lineTo(x + (horiz ? dir * (wx - 0.6) : 0), y - 7.2); ctx.stroke();
    }

    // legs (a scooter rider stands on one and kicks with the other)
    const legC = kind === 'official' || kind === 'guard' ? '#1e2230' : kind === 'worker' || kind === 'welder' ? '#3a4a5a' : '#3a3e4a';
    ctx.fillStyle = legC;
    const lift = kind === 'scooter' ? 1.4 : 0;
    // still === 3: sitting down (a café chair, a bench) — lap and shins only.
    const sit = still === 3 ? 2.4 : 0;
    if (sit) {
      ctx.fillRect(x - 1.8, y - 3.8, 3.6, 1.6);
      ctx.fillRect(x - 1.5, y - 2.4, 1.1, 2.4); ctx.fillRect(x + 0.4, y - 2.4, 1.1, 2.4);
    } else {
      ctx.fillRect(x - 1.5 + step * 0.6, y - 3.6 - lift, 1.2, 3.6);
      ctx.fillRect(x + 0.3 - step * 0.6 * (kind === 'scooter' ? 0 : 1), y - 3.6 - lift, 1.2, 3.6);
    }
    // body
    let body = SHIRT[Math.floor(_hash(k, 2) * SHIRT.length)];
    if (kind === 'official') body = ['#2a3040', '#3a3a3e', '#1e2a3a'][Math.floor(_hash(k, 3) * 3)];
    if (kind === 'guard') body = '#243452';
    if (kind === 'worker') body = '#f08a20';
    if (kind === 'welder') body = '#5a4636';
    if (kind === 'vendor') body = '#f4f2ec';
    if (kind === 'chef') body = '#f4f2ec';
    if (kind === 'postie') body = '#2a4a7a';
    if (kind === 'mover') body = ['#3a5a7a', '#5a6a3a', '#8a3a2a'][Math.floor(_hash(k, 3) * 3)];
    if (kind === 'guide') body = ['#c83a32', '#2a8a8a', '#e0a020'][Math.floor(_hash(k, 3) * 3)];
    if (kind === 'jogger') body = ['#e8e4dc', '#3a8a9a', '#d86a8a'][Math.floor(_hash(k, 3) * 3)];
    const wrapped = _wrapped(k, kind);
    if (wrapped && kind !== 'official' && kind !== 'guide') body = COAT[Math.floor(_hash(k, 22) * COAT.length)];
    const by = y - 8.3 - bob - lift + sit;
    // arms, swinging against the legs (or talking with their hands)
    let armL = -step * 0.7, armR = step * 0.7;
    if (still === 2) armR = -1.2 * Math.max(0, Math.sin(t * 4.5 + k)) - 0.6 * Math.max(0, Math.sin(t * 1.7 + k * 3));
    ctx.fillStyle = body;
    ctx.fillRect(x - 3, by + 0.8 + armL, 1, 3.4);
    ctx.fillRect(x + 2, by + 0.8 + armR, 1, 3.4);
    ctx.fillStyle = wrapped ? '#2a2a30' : skin;     // gloves
    ctx.fillRect(x - 3, by + 4 + armL, 1, 0.8);
    ctx.fillRect(x + 2, by + 4 + armR, 1, 0.8);
    ctx.fillStyle = body;
    if (wrapped) {
      // a long coat, a little fuller than a shirt, down over the tops of the legs
      ctx.beginPath(); ctx.roundRect(x - 2.6, by, 5.2, 6.4, 1.5); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x - 0.25, by + 1.6, 0.5, 4.6);          // the front fastening
      // scarf, with one end hanging
      ctx.fillStyle = SCARF[Math.floor(_hash(k, 23) * SCARF.length)];
      ctx.fillRect(x - 1.9, by - 0.3, 3.8, 1.2);
      ctx.fillRect(x + (_hash(k, 24) < 0.5 ? -1.8 : 0.9), by + 0.6, 0.9, 2.4);
    } else {
      ctx.beginPath(); ctx.roundRect(x - 2.2, by, 4.4, 5, 1.4); ctx.fill();
    }
    if (kind === 'worker') {                       // reflective vest stripes
      ctx.fillStyle = lit ? '#ffffe0' : '#e8e8d0';
      ctx.fillRect(x - 2.2, y - 6.6 - bob, 4.4, 0.7); ctx.fillRect(x - 2.2, y - 4.9 - bob, 4.4, 0.7);
    }
    if (kind === 'jogger' && lit) { ctx.fillStyle = '#f4ffd0'; ctx.fillRect(x - 2.2, by + 2.2, 4.4, 0.6); }   // reflective band
    if (kind === 'vendor') { ctx.fillStyle = '#c83a32'; ctx.fillRect(x - 1.6, by + 1.6, 3.2, 3.2); }            // apron
    if (kind === 'official') { ctx.fillStyle = '#e8e4dc'; ctx.fillRect(x - 0.5, y - 8.2, 1, 2.4); ctx.fillStyle = '#8a2a2a'; ctx.fillRect(x - 0.3, y - 7.4, 0.6, 1.8); }
    // head and hair / hats
    const hx = x + face * 0.5, hy = y - 9.9 - bob - lift + sit;
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hx, hy, 1.7, 0, Math.PI * 2); ctx.fill();
    if (kind === 'worker') {
      ctx.fillStyle = _hash(k, 4) < 0.7 ? '#f0c820' : '#f4f4f0';
      ctx.beginPath(); ctx.arc(hx, hy - 0.4, 2, Math.PI, 0); ctx.fill(); ctx.fillRect(hx - 2.4, hy - 0.5, 4.8, 0.6);
    } else if (kind === 'welder') {                // welding hood, flipped down
      ctx.fillStyle = '#2a2c30'; ctx.beginPath(); ctx.roundRect(hx - 2, hy - 2.2, 4, 4, 1); ctx.fill();
      ctx.fillStyle = '#4a7a5a'; ctx.fillRect(hx - 1.2, hy - 0.6, 2.4, 0.8);
    } else if (kind === 'vendor') {
      ctx.fillStyle = '#c83a32'; ctx.beginPath(); ctx.arc(hx, hy - 0.5, 1.8, Math.PI, 0); ctx.fill(); ctx.fillRect(hx + face - 0.4, hy - 0.8, 2.4, 0.6);
    } else if (kind === 'chef') {                 // tall white toque
      ctx.fillStyle = '#ffffff'; ctx.fillRect(hx - 1.5, hy - 4.4, 3, 3); ctx.beginPath(); ctx.arc(hx, hy - 4.4, 1.8, Math.PI, 0); ctx.fill();
    } else if (kind === 'postie') {               // peaked cap
      ctx.fillStyle = '#1e3458'; ctx.beginPath(); ctx.arc(hx, hy - 0.5, 1.8, Math.PI, 0); ctx.fill(); ctx.fillRect(hx - 1 + face, hy - 0.6, 2.8, 0.6);
    } else if (kind === 'mover') {                // cap worn backwards
      ctx.fillStyle = '#c83a32'; ctx.beginPath(); ctx.arc(hx, hy - 0.5, 1.8, Math.PI, 0); ctx.fill();
    } else if (kind === 'guard') {
      ctx.fillStyle = '#1a2440'; ctx.beginPath(); ctx.arc(hx, hy - 0.5, 1.8, Math.PI, 0); ctx.fill(); ctx.fillRect(hx - 1 + face, hy - 0.6, 2.8, 0.6);
    } else if (kind === 'tourist' && _hash(k, 5) < 0.6) {
      ctx.fillStyle = '#e8d8a8'; ctx.beginPath(); ctx.ellipse(hx, hy - 1, 2.6, 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx, hy - 1.2, 1.4, Math.PI, 0); ctx.fill();
    } else if (wrapped) {
      // woolly hat: a band, a crown, and on most of them a bobble
      const hat = SCARF[Math.floor(_hash(k, 25) * SCARF.length)];
      ctx.fillStyle = hat; ctx.beginPath(); ctx.arc(hx, hy - 0.5, 1.9, Math.PI, 0); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(hx - 1.9, hy - 0.9, 3.8, 0.7);
      if (_hash(k, 26) < 0.7) { ctx.fillStyle = '#f4f2ec'; ctx.beginPath(); ctx.arc(hx, hy - 2.5, 0.7, 0, Math.PI * 2); ctx.fill(); }
    } else {
      ctx.fillStyle = HAIR[Math.floor(_hash(k, 6) * HAIR.length)];
      ctx.beginPath(); ctx.arc(hx, hy - 0.5, 1.7, Math.PI, 0); ctx.fill();
    }

    // what they're carrying or walking with
    const side = horiz ? dir : 1;
    if (kind === 'dog') {
      const dx = x + (horiz ? dir * 7 : 3.5), dy = y - 1.4 + (horiz ? 0 : dir * 3);
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 0.35;
      ctx.beginPath(); ctx.moveTo(x + side * 2, y - 5.5); ctx.lineTo(dx, dy - 1); ctx.stroke();
      const dogC = ['#8a5a2a', '#1a1a1a', '#e8d8b8', '#c8a060'][Math.floor(_hash(k, 8) * 4)];
      ctx.fillStyle = dogC;
      ctx.beginPath(); ctx.ellipse(dx, dy, 2.4, 1.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(dx + (horiz ? dir * 2.2 : 0.01), dy - 1, 1, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(dx - 1.8 + Math.sin(t * 12 + k) * 0.3, dy, 0.6, 1.4); ctx.fillRect(dx + 1.2 - Math.sin(t * 12 + k) * 0.3, dy, 0.6, 1.4);
    } else if (kind === 'stroller') {
      const sx = x + (horiz ? dir * 6 : 3.8), sy = y + (horiz ? 0 : dir * 2);
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(x + side * 2, y - 5); ctx.lineTo(sx, sy - 4); ctx.stroke();
      ctx.fillStyle = ['#3a5a8a', '#8a3a5a', '#4a6a4a'][Math.floor(_hash(k, 9) * 3)];
      ctx.beginPath(); ctx.roundRect(sx - 2.5, sy - 5, 5, 3.4, 1.4); ctx.fill();
      ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(sx - 1.6, sy - 0.8, 0.8, 0, Math.PI * 2); ctx.arc(sx + 1.6, sy - 0.8, 0.8, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'shopper') {
      ctx.fillStyle = ['#e8d8b0', '#c83a32', '#3a6ab0', '#f4f4f0'][Math.floor(_hash(k, 10) * 4)];
      ctx.fillRect(x + side * 2.4 - (side < 0 ? 2.4 : 0), y - 5.4, 2.4, 3);
      if (_hash(k, 11) < 0.5) { ctx.fillStyle = '#e8c84a'; ctx.fillRect(x - side * 2.4 - (side > 0 ? 2.4 : 0), y - 5, 2.4, 2.6); }
    } else if (kind === 'official') {
      ctx.fillStyle = '#4a3222'; ctx.fillRect(x + side * 2.4 - (side < 0 ? 3 : 0), y - 4.4, 3, 2.3);
    } else if (kind === 'tourist') {
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x - 1, y - 7, 2, 1.3);
    } else if (kind === 'postie') {                // satchel on a strap
      ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(x - 1.8, y - 8); ctx.lineTo(x + side * 2.6, y - 4.2); ctx.stroke();
      ctx.fillStyle = '#8a5a2a'; ctx.fillRect(x + side * 2.2 - (side < 0 ? 2.8 : 0), y - 5.2, 2.8, 2.6);
    } else if (kind === 'worker' && _hash(k, 12) < 0.35) {
      ctx.fillStyle = '#5a5e62'; ctx.fillRect(x + side * 2.2 - (side < 0 ? 1 : 0), y - 8, 1, 6);   // tool
    } else if (kind === 'guide') {                 // the tour guide's flag, held up high
      const fx = x + 3, top = y - 18;
      ctx.fillStyle = '#4a4e52'; ctx.fillRect(fx - 0.3, top, 0.6, 12);
      const wave = Math.sin(t * 5 + k) * 0.8;
      ctx.fillStyle = ['#e8c020', '#c83a32', '#2a8ad0'][Math.floor(_hash(k, 15) * 3)];
      ctx.beginPath(); ctx.moveTo(fx + 0.3, top); ctx.lineTo(fx + 5, top + 1.3 + wave); ctx.lineTo(fx + 0.3, top + 3); ctx.closePath(); ctx.fill();
    }

    // Umbrellas up in the rain (not the cyclists, joggers or hard hats).
    if (_rain > 0.2 && _hash(k, 13) < (_snowing ? 0.08 : 0.3 + _rain * 0.55) &&
        kind !== 'jogger' && kind !== 'worker' && kind !== 'welder' && kind !== 'guard' && kind !== 'scooter' && kind !== 'vendor') {
      const ux = hx + face * 0.4, uy = hy - 3.4;
      ctx.fillStyle = '#3a3a3a'; ctx.fillRect(ux - 0.25, uy, 0.5, 5);
      ctx.fillStyle = UMBRELLA[Math.floor(_hash(k, 16) * UMBRELLA.length)];
      ctx.beginPath(); ctx.arc(ux, uy + 0.6, 4.6, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.arc(ux - 1, uy - 0.6, 2.4, Math.PI * 1.1, Math.PI * 1.6); ctx.lineTo(ux - 1, uy - 0.6); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // A person drawn at a smaller scale about their feet (kids).
  function drawSmallPerson(ctx, base, x, y, sc, kind, dir, horiz, t, k, alpha, dark, detail, still = 0) {
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    drawPerson(ctx, 0, 0, kind, dir, horiz, t, k, alpha, dark, detail, still);
    ctx.setTransform(base);
  }

  // ── People standing about ─────────────────────────────────────────
  // A group stands at one spot on a route for a while, then drifts off and
  // another gathers somewhere else — a pure function of the clock like the
  // walkers. (x, y) is the middle of the group on the ground; members spread
  // along the route (ax, ay) and turn to face each other.
  function _drawGroup(ctx, base, kind, x, y, horiz, gk, t, a, dark, detail, Z) {
    const ax = horiz ? 1 : 0, ay = horiz ? 0 : 1;
    const sp = horiz ? 1 : 0.7;                    // members stand closer one behind another
    const P = (off, across = 0) => [x + ax * off * sp + ay * across, y + ay * off * sp + ax * across];
    const talker = Math.floor(t / 3.5 + _hash(gk, 30) * 7);

    if (kind === 'chat' || kind === 'huddle') {
      const n = _hash(gk, 31) < 0.55 ? 2 : 3;
      const offs = n === 2 ? [-3.6, 3.6] : [-4.6, 4.6, 0];
      // the back one (the middle of three) first, so the front two overlap it
      const order = n === 3 ? [2, 0, 1] : [0, 1];
      for (const m of order) {
        const [px, py] = P(offs[m], m === 2 ? -2.6 : 0);
        const face = offs[m] < 0 ? 1 : offs[m] > 0 ? -1 : 0;
        const pk = gk * 7 + m;
        drawPerson(ctx, px, py, kind === 'huddle' ? 'worker' : m === 1 && Z.chatKind === 'shopper' ? 'walker' : Z.chatKind,
                   face, face !== 0, t, pk, a, dark, detail, talker % n === m ? 2 : 1);
        if (kind === 'huddle' && detail) {
          ctx.globalAlpha = a;
          if (m === 0) {                             // foreman's clipboard
            ctx.fillStyle = '#8a6a40'; ctx.fillRect(px + 0.2, py - 7.2, 2.4, 3);
            ctx.fillStyle = '#f4f4f0'; ctx.fillRect(px + 0.5, py - 6.7, 1.8, 2.3);
          } else if (m === 1) {                      // coffee, steaming
            ctx.fillStyle = '#f4f4f0'; ctx.fillRect(px - 3.4, py - 5.4, 1.4, 1.6);
            const age = (t * 0.6 + _hash(pk, 32)) % 1;
            ctx.globalAlpha = a * (1 - age) * 0.4; ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(px - 2.7 + Math.sin(age * 7) * 0.6, py - 6.4 - age * 5, 0.6 + age * 0.8, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    } else if (kind === 'ball') {                  // two kids throwing a ball
      const off = horiz ? 8 : 6;
      const [x0, y0] = P(-off), [x1, y1] = P(off);
      drawSmallPerson(ctx, base, x0, y0, 0.72, 'walker', 1, true, t, gk * 7, a, dark, detail, 1);
      drawSmallPerson(ctx, base, x1, y1, 0.72, 'walker', -1, true, t, gk * 7 + 1, a, dark, detail, 1);
      if (!detail) return;
      const f = (t / 1.3 + _hash(gk, 33) * 2) % 2, u = f % 1;
      const fromA = f < 1;
      const bx = fromA ? x0 + (x1 - x0) * u : x1 + (x0 - x1) * u;
      const byG = fromA ? y0 + (y1 - y0) * u : y1 + (y0 - y1) * u;
      const h = Math.sin(Math.PI * u) * 7;
      ctx.globalAlpha = a * 0.25; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(bx, byG + 0.4, 1.2, 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = a; ctx.fillStyle = ['#e83a2a', '#f4f4f0', '#2a8ad0'][Math.floor(_hash(gk, 34) * 3)];
      ctx.beginPath(); ctx.arc(bx, byG - 4.6 - h, 1, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'vendor') {                // a street food cart under a striped umbrella
      const vk = gk * 7;
      drawPerson(ctx, x, y - 2.5, 'vendor', 0, false, t, vk, a, dark, detail, 2);
      if (!detail) return;
      ctx.globalAlpha = a;
      const [c1, c2] = [['#c83a32', '#f4f2ec'], ['#2a6ab0', '#f4f2ec'], ['#3a8a4a', '#f0d040'], ['#e0802a', '#f4f2ec']][Math.floor(_hash(gk, 35) * 4)];
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 5.5, y - 0.2, 12, 2);
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.arc(x - 4, y - 0.8, 1.2, 0, Math.PI * 2); ctx.arc(x + 4, y - 0.8, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b8bcc0'; ctx.beginPath(); ctx.roundRect(x - 6, y - 6.4, 12, 5.2, 1); ctx.fill();   // cart
      ctx.fillStyle = c1; ctx.fillRect(x - 6, y - 4.6, 12, 1.4);
      ctx.fillStyle = '#d8dce0'; ctx.fillRect(x - 5.4, y - 6.4, 10.8, 0.8);
      ctx.fillStyle = '#4a4e52'; ctx.fillRect(x - 0.3, y - 17, 0.6, 11);                                    // umbrella pole
      for (let s = 0; s < 6; s++) {
        ctx.fillStyle = s % 2 ? c2 : c1;
        ctx.beginPath(); ctx.moveTo(x, y - 17.4);
        ctx.arc(x, y - 14, 8.5, Math.PI + s * Math.PI / 6, Math.PI + (s + 1) * Math.PI / 6);
        ctx.closePath(); ctx.fill();
      }
      if (dark > 0.35) {                           // a lamp under the canopy
        ctx.globalAlpha = a * 0.5 * dark; ctx.drawImage(_pool(), x - 11, y - 12, 22, 16);
        ctx.globalAlpha = a; ctx.fillStyle = '#fff2c0'; ctx.fillRect(x - 0.8, y - 13.6, 1.6, 1.2);
      }
      for (let i = 0; i < 3; i++) {                // steam off the grill
        const age = (t * 0.45 + i / 3 + _hash(gk, 36)) % 1;
        ctx.globalAlpha = a * (1 - age) * 0.35; ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(x - 2.5 + i * 2 + Math.sin(age * 6 + i) * 1.2, y - 7 - age * 6, 0.8 + age * 1.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = a;
      if (_hash(gk, 37) < 0.65) {                  // a customer waiting
        const [px, py] = P(horiz ? 10 : 8);
        drawPerson(ctx, px, py + 1.5, 'shopper', -1, true, t, vk + 1, a, dark, detail, 1);
      }
    } else if (kind === 'busker') {                // guitar, open case, a listener or two
      const mk = gk * 7;
      drawPerson(ctx, x, y, 'walker', 0, false, t, mk, a, dark, detail, 2);
      if (detail) {
        ctx.globalAlpha = a;
        ctx.fillStyle = '#2a1e16'; ctx.fillRect(x + 2.5, y - 1.2, 6, 2.2);             // open case
        ctx.fillStyle = '#8a2a2a'; ctx.fillRect(x + 3, y - 0.8, 5, 1.4);
        ctx.fillStyle = '#e8c84a'; ctx.fillRect(x + 4 + _hash(gk, 38) * 2, y - 0.4, 0.8, 0.6);   // coins
        ctx.strokeStyle = '#3a2616'; ctx.lineWidth = 0.7;                              // neck
        ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 4, y - 8.6); ctx.stroke();
        ctx.fillStyle = '#b8743a';                                                     // body
        ctx.beginPath(); ctx.ellipse(x - 0.6, y - 4.6, 2, 1.5, -0.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2a1e16'; ctx.beginPath(); ctx.arc(x - 0.4, y - 4.8, 0.5, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 2; i++) {              // notes floating up
          const age = (t * 0.35 + i * 0.5 + _hash(gk, 39)) % 1;
          const nx = x + 3 + age * 5 + Math.sin(age * 8 + i) * 1.4, ny = y - 12 - age * 9;
          ctx.globalAlpha = a * Math.min(1, (1 - age) * 1.6) * 0.85;
          ctx.fillStyle = '#2a2a3a';
          ctx.beginPath(); ctx.ellipse(nx, ny, 0.9, 0.7, -0.4, 0, Math.PI * 2); ctx.fill();
          ctx.fillRect(nx + 0.6, ny - 3, 0.4, 3);
        }
      }
      const listeners = _hash(gk, 40) < 0.5 ? 1 : 2;
      for (let i = 0; i < listeners; i++) {
        const off = (i ? -1 : 1) * (horiz ? 11 : 8);
        const [px, py] = P(off, 1.5);
        drawPerson(ctx, px, py, i ? 'walker' : 'shopper', off < 0 ? 1 : -1, true, t, mk + 1 + i, a, dark, detail, 1);
      }
    } else if (kind === 'photo') {                 // one tourist taking another's picture
      const [sx, sy] = P(-6), [cx, cy] = P(6);
      drawPerson(ctx, sx, sy, 'tourist', 0, false, t, gk * 7, a, dark, detail, 1);
      drawPerson(ctx, cx, cy, 'tourist', -1, true, t, gk * 7 + 2, a, dark, detail, 1);
      if (detail && ((t + _hash(gk, 41) * 6) % 6) < 0.09) {
        ctx.globalAlpha = a * 0.8;
        ctx.drawImage(_pool(), cx - 6, cy - 12.5, 12, 12);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 1, cy - 7, 2, 1.3);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── Vehicles (top-down, nose along the direction of travel) ───────
  // Headlight throw, drawn once into a small bitmap and stamped per vehicle.
  // It used to be a fresh radial gradient per vehicle per frame, composited
  // with 'lighter' — the blend mode that knocks the canvas off its fast GPU
  // path (see the disabled water caustics in render_main_loop.js).
  let _beamCanvas = null;
  function _beam() {
    if (_beamCanvas) return _beamCanvas;
    const c = document.createElement('canvas');
    c.width = 44; c.height = 32;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(0, 16, 2, 0, 16, 44);
    grad.addColorStop(0, 'rgba(255,236,190,1)');
    grad.addColorStop(1, 'rgba(255,236,190,0)');
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(0, 9); g.lineTo(44, 0); g.lineTo(44, 32); g.lineTo(0, 23); g.closePath(); g.fill();
    return (_beamCanvas = c);
  }

  // `base` is the world transform the figure pass started with; vehicles and
  // machines return to it with setTransform instead of a save/restore pair
  // each.
  // `sc` scales the whole vehicle about its centre (the built roads draw
  // them at truck size; zone streets at 1).
  // `fx` bits: 1 braking (brake lights), 2 / 4 left / right indicator.
  const FX_BRAKE = 1, FX_LEFT = 2, FX_RIGHT = 4;
  function drawVehicle(ctx, base, x, y, kind, angle, k, t, alpha, dark, detail, sc = 1, fx = 0) {
    const V = VEH[kind];
    const L = V.len, W = V.wid, hl = L / 2, hw = W / 2;
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (sc !== 1) ctx.scale(sc, sc);
    const rr = (a, b, c, d, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(a, b, c, d, r); ctx.fill(); };
    // Lights run after dark and in heavy rain.
    const lit = dark > 0.3 || _rain > 0.45;
    const beamA = Math.max(dark, _rain > 0.45 ? 0.35 : 0);

    // headlight throw ahead
    if (lit && detail) {
      ctx.globalAlpha = 0.35 * beamA * alpha;
      ctx.drawImage(_beam(), hl, -hw * 1.6, 22, hw * 3.2);
      ctx.globalAlpha = alpha;
    }
    rr(-hl + 1.2, -hw + 1.6, L, W, 2, 'rgba(0,0,0,0.25)');   // shadow

    if (!detail) {
      rr(-hl, -hw, L, W, 2, kind === 'taxi' ? '#e8c020' : kind === 'dump' ? '#d8702a' : kind === 'police' || kind === 'ambulance' ? '#f4f4f0' : CARS[Math.floor(_hash(k, 1) * CARS.length)]);
      ctx.setTransform(base);
      return;
    }

    const blink = (t * 1.6 + (k & 7) * 0.11) % 1 < 0.5;
    const lamps = () => {
      ctx.fillStyle = lit ? '#fff6d0' : '#e8e8d8';
      ctx.fillRect(hl - 1.2, -hw + 0.8, 1.2, 1.6); ctx.fillRect(hl - 1.2, hw - 2.4, 1.2, 1.6);
      const brake = fx & FX_BRAKE;
      if (brake) {                                 // brake-light glow off the back
        ctx.globalAlpha = alpha * (lit ? 0.55 : 0.3);
        ctx.fillStyle = '#ff2a18';
        ctx.fillRect(-hl - 2.8, -hw + 0.3, 2.8, 2.6); ctx.fillRect(-hl - 2.8, hw - 2.9, 2.8, 2.6);
        ctx.globalAlpha = alpha;
      }
      ctx.fillStyle = brake ? '#ff4a30' : lit ? '#ff3a2a' : '#9a2a22';
      ctx.fillRect(-hl, -hw + 0.8, 1, 1.6); ctx.fillRect(-hl, hw - 2.4, 1, 1.6);
      if ((fx & (FX_LEFT | FX_RIGHT)) && blink) {  // indicators, front and back on the turning side
        const sy = fx & FX_RIGHT ? hw - 1.1 : -hw;
        ctx.fillStyle = '#ffae20';
        ctx.fillRect(hl - 2.2, sy, 2, 1.1); ctx.fillRect(-hl, sy, 2, 1.1);
        if (lit) {
          ctx.globalAlpha = alpha * 0.4;
          ctx.fillRect(hl - 3, sy + (fx & FX_RIGHT ? 0 : -1.4), 3.6, 2.5); ctx.fillRect(-hl - 0.6, sy + (fx & FX_RIGHT ? 0 : -1.4), 3.6, 2.5);
          ctx.globalAlpha = alpha;
        }
      }
    };
    // Emergency light bar across the roof, flashing red/blue.
    const lightBar = (bx, colA, colB) => {
      const ph = Math.floor(t * 7 + (k & 15)) % 2;
      rr(bx - 1, -hw + 1, 2, W - 2, 0.5, '#2a2a2e');
      ctx.fillStyle = ph ? colA : '#5a2a2a'; ctx.fillRect(bx - 0.8, -hw + 1.3, 1.6, hw - 1.4);
      ctx.fillStyle = ph ? '#2a2a5a' : colB; ctx.fillRect(bx - 0.8, 0.1, 1.6, hw - 1.4);
      ctx.globalAlpha = alpha * (0.12 + 0.4 * dark);
      ctx.fillStyle = ph ? colA : colB;
      ctx.beginPath(); ctx.arc(bx, ph ? -hw * 0.5 : hw * 0.5, 3 + 4 * dark, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = alpha;
    };

    if (kind === 'suv') {
      const col = CARS[Math.floor(_hash(k, 1) * CARS.length)];
      rr(-hl, -hw, L, W, 1.8, col);
      rr(hl - 6, -hw + 0.9, 2.4, W - 1.8, 0.7, '#1e2a36');             // windscreen
      rr(-hl + 1.4, -hw + 1.1, 1.8, W - 2.2, 0.6, '#1e2a36');          // tailgate glass
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(-hl + 3.6, -hw + 1.2, 7.4, W - 2.4);   // roof
      ctx.fillStyle = 'rgba(20,20,24,0.55)'; ctx.fillRect(-hl + 3.8, -hw + 1.4, 7, 0.5); ctx.fillRect(-hl + 3.8, hw - 1.9, 7, 0.5);   // roof rails
      lamps();
    } else if (kind === 'pickup') {
      const col = ['#c83a32', '#2a4a8a', '#e8e8e4', '#3a3e44', '#8a6a3a', '#3a6a4a'][Math.floor(_hash(k, 1) * 6)];
      rr(-hl, -hw, L, W, 1.8, col);
      rr(hl - 6.4, -hw + 0.9, 2.4, W - 1.8, 0.7, '#1e2a36');           // windscreen
      rr(hl - 9.4, -hw + 1.2, 1.4, W - 2.4, 0.5, '#1e2a36');           // cab back window
      rr(-hl + 0.8, -hw + 1, 7.4, W - 2, 0.6, 'rgba(0,0,0,0.35)');     // open bed
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(-hl + 1.4, -hw + 1.6, 6.2, 0.5);
      const load = _hash(k, 2);
      if (load < 0.35) { rr(-hl + 2, -2.2, 3.4, 4.4, 0.4, '#b88a58'); }                          // crates
      else if (load < 0.55) { ctx.fillStyle = '#5a5e62'; ctx.fillRect(-hl + 1.4, -1.8, 6.4, 1); ctx.fillRect(-hl + 1.4, 0.8, 6.4, 1); }   // ladders
      lamps();
    } else if (kind === 'police') {
      rr(-hl, -hw, L, W, 2.4, '#f4f4f0');
      rr(hl - 4.4, -hw, 4.4, W, 2, '#1e2230');                          // black bonnet and boot
      rr(-hl, -hw, 3.4, W, 2, '#1e2230');
      rr(hl - 6, -hw + 1, 2.6, W - 2, 0.8, '#1e2a36');
      rr(-hl + 3.6, -hw + 1.2, 1.8, W - 2.4, 0.8, '#1e2a36');
      lamps();
      lightBar(-0.4, '#ff2a2a', '#3a6aff');
    } else if (kind === 'ambulance') {
      rr(-hl, -hw, L, W, 1.6, '#f4f4f0');
      rr(hl - 5, -hw + 0.8, 2.2, W - 1.6, 0.6, '#1e2a36');
      ctx.fillStyle = '#d83a2a'; ctx.fillRect(-hl + 0.6, -hw, L - 6.2, 1.1); ctx.fillRect(-hl + 0.6, hw - 1.1, L - 6.2, 1.1);   // side stripes
      ctx.fillRect(-4.6, -0.6, 4.4, 1.2); ctx.fillRect(-3, -2.2, 1.2, 4.4);                        // roof cross
      lamps();
      lightBar(hl - 7, '#ff2a2a', '#ff2a2a');
    } else if (kind === 'tanker') {
      rr(hl - 7, -hw, 7, W, 1.8, ['#e8e8e4', '#c83a32', '#2a4a8a'][Math.floor(_hash(k, 2) * 3)]);   // cab
      rr(hl - 5.8, -hw + 0.8, 2, W - 1.6, 0.5, '#1e2a36');
      rr(-hl, -hw + 0.2, L - 8, W - 0.4, hw - 0.2, '#b8bec4');                                   // tank
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(-hl + 2, -1.6, L - 12, 1.2);          // highlight along the top
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(-hl + 2, hw - 2.2, L - 12, 1.6);
      ctx.fillStyle = 'rgba(40,44,48,0.5)';
      for (let g = -hl + 5; g < hl - 10; g += 6) ctx.fillRect(g, -hw + 0.4, 0.6, W - 0.8);         // ring bands
      ctx.fillStyle = '#e8801a'; ctx.fillRect(-hl + 0.8, -1.2, 1.4, 2.4);                           // hazard plate
      lamps();
    } else if (kind === 'flatbed') {
      rr(hl - 7, -hw, 7, W, 1.8, ['#2a4a8a', '#3a7a4a', '#c8902a'][Math.floor(_hash(k, 2) * 3)]);
      rr(hl - 5.8, -hw + 0.8, 2, W - 1.6, 0.5, '#1e2a36');
      rr(-hl, -hw, L - 8, W, 0.6, '#5a4a3a');                                                    // deck
      const load = _hash(k, 3), dl = L - 11;
      if (load < 0.4) {                                                                           // pipes
        for (let p = 0; p < 3; p++) { const py = -hw + 1.3 + p * 2.2; rr(-hl + 1, py, dl, 1.9, 0.9, '#8a9098'); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-hl + 1.4, py + 0.3, dl - 0.8, 0.4); }
      } else if (load < 0.75) {                                                                   // steel beams
        ctx.fillStyle = '#6a6e74'; ctx.fillRect(-hl + 1, -hw + 1, dl, W - 2);
        ctx.fillStyle = '#4a4e54'; ctx.fillRect(-hl + 1, -hw + 3, dl, 0.6); ctx.fillRect(-hl + 1, hw - 3.6, dl, 0.6);
      } else {                                                                                    // lumber
        ctx.fillStyle = '#c8a070'; ctx.fillRect(-hl + 1, -hw + 1, dl, W - 2);
        ctx.fillStyle = 'rgba(110,80,50,0.5)'; for (let g = -hw + 2.2; g < hw - 1; g += 1.6) ctx.fillRect(-hl + 1, g, dl, 0.3);
      }
      ctx.fillStyle = '#e8c020'; ctx.fillRect(-hl + dl * 0.3, -hw, 0.8, W); ctx.fillRect(-hl + dl * 0.7, -hw, 0.8, W);   // straps
      lamps();
    } else if (kind === 'car' || kind === 'taxi') {
      const col = kind === 'taxi' ? '#e8c020' : CARS[Math.floor(_hash(k, 1) * CARS.length)];
      rr(-hl, -hw, L, W, 2.4, col);
      rr(hl - 6, -hw + 1, 2.6, W - 2, 0.8, '#1e2a36');             // windscreen
      rr(-hl + 2, -hw + 1.2, 2, W - 2.4, 0.8, '#1e2a36');          // rear window
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-hl + 4.5, -hw + 1.4, 5.5, W - 2.8);   // roof sheen
      if (kind === 'taxi') { rr(-1.5, -1.6, 3, 3.2, 0.6, '#f4f4f0'); }
      lamps();
    } else if (kind === 'van') {
      rr(-hl, -hw, L, W, 1.6, '#eeeeea');
      rr(hl - 5, -hw + 0.8, 2.2, W - 1.6, 0.6, '#1e2a36');
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(-hl + 1, -hw + 1, L - 7, W - 2);
      ctx.fillStyle = ['#c83a32', '#2a6ab0', '#3a8a4a'][Math.floor(_hash(k, 2) * 3)]; ctx.fillRect(-hl + 2, -0.6, L - 9, 1.2);
      lamps();
    } else if (kind === 'bus') {
      const col = ['#d8402a', '#2a6ab0', '#3a8a4a'][Math.floor(_hash(k, 2) * 3)];
      rr(-hl, -hw, L, W, 2.2, col);
      ctx.fillStyle = '#f2f2ee'; ctx.fillRect(-hl + 1.5, -hw + 1.2, L - 3, W - 2.4);
      rr(hl - 3.4, -hw + 1, 2, W - 2, 0.6, '#1e2a36');
      ctx.fillStyle = '#9aa0a6'; for (const vx of [-8, 0, 7]) ctx.fillRect(vx, -1.6, 3.2, 3.2);   // roof vents
      lamps();
    } else if (kind === 'dump') {
      rr(hl - 6, -hw, 6, W, 1.6, '#d8702a');                            // cab
      rr(hl - 5, -hw + 1, 1.8, W - 2, 0.5, '#1e2a36');
      rr(-hl, -hw, L - 6.5, W, 1.2, '#b85a22');                          // bed
      rr(-hl + 1.2, -hw + 1.2, L - 9, W - 2.4, 1, '#5a5046');             // load
      ctx.fillStyle = 'rgba(160,150,130,0.6)'; for (let g = 0; g < 5; g++) ctx.fillRect(-hl + 2 + g * 2.6, -hw + 2 + ((g * 3) % 4), 1, 0.8);
      lamps();
    } else if (kind === 'semi') {
      rr(hl - 7, -hw, 7, W, 1.8, ['#c83a32', '#2a4a8a', '#e8e8e4', '#3a7a4a'][Math.floor(_hash(k, 2) * 4)]);   // cab
      rr(hl - 5.8, -hw + 0.8, 2, W - 1.6, 0.5, '#1e2a36');
      const box = ['#b8402a', '#2a5a9a', '#3a7a4a', '#c8902a', '#8a8e94'][Math.floor(_hash(k, 3) * 5)];
      rr(-hl, -hw - 0.3, L - 8, W + 0.6, 0.8, box);                      // container
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.4; ctx.beginPath();
      for (let g = -hl + 2; g < hl - 8; g += 2) { ctx.moveTo(g, -hw); ctx.lineTo(g, hw); }
      ctx.stroke();
      lamps();
    } else if (kind === 'moving') {                // removal truck: cab and a tall box body
      rr(hl - 6.5, -hw + 0.4, 6.5, W - 0.8, 1.6, '#2a4a8a');
      rr(hl - 5.4, -hw + 1.2, 2, W - 2.4, 0.5, '#1e2a36');
      rr(-hl, -hw, L - 7.4, W, 1, '#f2efe6');
      ctx.fillStyle = '#e07a2a'; ctx.fillRect(-hl + 1, -hw, L - 9.6, 1.4); ctx.fillRect(-hl + 1, hw - 1.4, L - 9.6, 1.4);
      ctx.fillStyle = 'rgba(0,0,0,0.1)'; for (let g = -hl + 3; g < hl - 8; g += 3) ctx.fillRect(g, -hw + 1.6, 0.4, W - 3.2);
      lamps();
    } else if (kind === 'icecream') {              // pink-and-white van with a cone on the roof
      rr(-hl, -hw, L, W, 2, '#f6f2f4');
      rr(hl - 5, -hw + 0.9, 2.2, W - 1.8, 0.6, '#1e2a36');
      ctx.fillStyle = '#f08cb4';
      for (let g = -hl + 1; g < hl - 6; g += 2.4) { ctx.fillRect(g, -hw, 1.2, 1.3); ctx.fillRect(g + 1.2, hw - 1.3, 1.2, 1.3); }
      ctx.fillStyle = '#d8a860'; ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(1, -1.8); ctx.lineTo(1, 1.8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f8c0d8'; ctx.beginPath(); ctx.arc(1.6, 0, 1.9, 0, Math.PI * 2); ctx.fill();
      lamps();
    } else if (kind === 'mailvan') {
      rr(-hl, -hw, L, W, 1.8, '#f4f4f0');
      rr(hl - 4.6, -hw + 0.8, 2, W - 1.6, 0.5, '#1e2a36');
      ctx.fillStyle = '#2a4a8a'; ctx.fillRect(-hl + 1, -0.9, L - 6, 0.9);
      ctx.fillStyle = '#c83a32'; ctx.fillRect(-hl + 1, 0, L - 6, 0.9);
      lamps();
    } else if (kind === 'foodtruck') {             // with the serving hatch's awning out on the kerb side
      const col = ['#e8c020', '#2a8a8a', '#c83a32', '#e07a2a', '#b8bec4'][Math.floor(_hash(k, 2) * 5)];
      rr(-hl, -hw, L, W, 1.8, col);
      rr(hl - 5, -hw + 0.8, 2.2, W - 1.6, 0.6, '#1e2a36');
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(-hl + 2, -hw + 1.4, L - 9, 1);
      ctx.fillStyle = '#9aa0a6'; ctx.fillRect(-4, -1.4, 2.6, 2.8);                     // roof vent
      for (let g = 0; g < 5; g++) { ctx.fillStyle = g % 2 ? '#f4f2ec' : '#c83a32'; ctx.fillRect(-hl + 2 + g * 2.4, -hw - 2.4, 2.4, 2.4); }
      lamps();
    }
    ctx.setTransform(base);
  }

  // ── Yard machines (industrial, off the roads) ─────────────────────
  // Each machine is confined to one clear yard tile — open ground that
  // isn't a haul road, a building, or one of the storage lots the industrial
  // ground draws beside the roads — so machines never meet each other, the
  // traffic or a building. What it does there is a pure function of time:
  // forklifts shuttle pallets back and forth (reversing, as forklifts do),
  // tractors lap their patch, bulldozers push at a dirt pile, excavators
  // swing between the pit and the spoil heap, wheel loaders carry loads, and
  // mixer trucks creep along with the drum turning. Outside working hours
  // they sit parked with their lights off.
  // A machine's body colour, all that is drawn of it below the detail zoom.
  const _machineBody = (kind) => kind === 'tractor' ? '#3a8a3a' : kind === 'mixer' ? '#e8e8e4' : kind === 'welder' ? '#6a6e74' : '#e0b020';

  function _drawMachine(ctx, base, kind, cx, cy, k, t, active, dark, detail) {
    const tau = active ? t : 0;
    const horiz = _hash(k, 4) < 0.5;
    const ph = _hash(k, 5) * Math.PI * 2;
    const axAng = horiz ? 0 : Math.PI / 2;
    const ax = horiz ? 1 : 0, ay = horiz ? 0 : 1;
    const rr = (a, b, c, d, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(a, b, c, d, r); ctx.fill(); };
    const dot = (x, y, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
    const construction = kind === 'bulldozer' || kind === 'excavator' || kind === 'loader';
    const beacon = (x, y) => { if (active && Math.sin(t * 7 + k) > 0) dot(x, y, 1, '#ffb030'); };
    const lights = (L) => {
      if (!(active && dark > 0.3 && detail)) return;
      ctx.globalAlpha = 0.3 * dark;
      ctx.drawImage(_beam(), L, -7, 14, 14);
      ctx.globalAlpha = 1;
    };
    const place = (x, y, ang) => { ctx.setTransform(base); ctx.translate(x, y); ctx.rotate(ang); };
    const unplace = () => ctx.setTransform(base);
    const shadow = (L, W) => rr(-L / 2 + 1, -W / 2 + 1.5, L, W, 1.5, 'rgba(0,0,0,0.25)');

    if (!detail) {
      place(cx, cy, axAng);
      rr(-6, -4, 12, 8, 1.5, _machineBody(kind));
      unplace();
      return;
    }

    // construction site cones round the tile
    if (construction) {
      for (const [ox, oy] of [[-16, -16], [16, -16], [-16, 16], [16, 16]]) {
        ctx.fillStyle = '#f07820';
        ctx.beginPath(); ctx.moveTo(cx + ox - 1.6, cy + oy + 1.2); ctx.lineTo(cx + ox, cy + oy - 2.4); ctx.lineTo(cx + ox + 1.6, cy + oy + 1.2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f4f4f0'; ctx.fillRect(cx + ox - 0.9, cy + oy - 0.8, 1.8, 0.6);
      }
    }

    if (kind === 'forklift') {
      const w = 0.8 + _hash(k, 6) * 0.4;
      const pos = Math.sin(tau * w + ph) * 9;
      const carrying = Math.cos(tau * w + ph) > 0;
      // pallet stacks at both ends of its run
      for (const e of [-1, 1]) {
        const px = cx + ax * e * 17, py = cy + ay * e * 17;
        rr(px - 2.6, py - 2.6, 5.2, 5.2, 0.6, '#9a7048');
        rr(px - 2, py - 3.2, 4, 3, 0.5, '#c8a070');
      }
      place(cx + ax * pos, cy + ay * pos, axAng);
      shadow(11, 6.5);
      const L = 11, W = 6.5, hl = L / 2, hw = W / 2;
      lights(hl + 4);
      ctx.fillStyle = '#8a8e92'; ctx.fillRect(hl, -hw + 1, 4.5, 1.1); ctx.fillRect(hl, hw - 2.1, 4.5, 1.1);   // forks
      if (carrying) rr(hl + 0.3, -2.6, 4.6, 5.2, 0.6, '#9a7048');                                           // pallet
      ctx.fillStyle = '#3a3e44'; ctx.fillRect(hl - 1.2, -hw, 1.4, W);                                     // mast
      rr(-hl, -hw, L - 1.2, W, 1.4, '#e0b020');
      ctx.fillStyle = '#2a2a2c'; ctx.fillRect(-hl, -hw + 0.8, 3, W - 1.6);                                 // counterweight
      ctx.strokeStyle = '#1a1a1c'; ctx.lineWidth = 0.6; ctx.strokeRect(-hl + 3.5, -hw + 0.8, L - 6.5, W - 1.6);   // cage
      dot(-0.5, 0, 1.4, '#f08a20');                                                                          // driver
      beacon(-hl + 1.5, 0);
      unplace();
    } else if (kind === 'tractor') {
      const dirS = _hash(k, 6) < 0.5 ? 1 : -1;
      const th = tau * 0.45 * dirS + ph;
      ctx.strokeStyle = 'rgba(70,52,34,0.28)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.stroke();                                   // tyre tracks
      place(cx + Math.cos(th) * 9, cy + Math.sin(th) * 9, th + dirS * Math.PI / 2);
      shadow(13, 9);
      lights(7);
      const body = _hash(k, 7) < 0.5 ? '#3a8a3a' : '#b8302a';
      rr(-6.5, -5.2, 4.4, 2.4, 0.8, '#1a1a1a'); rr(-6.5, 2.8, 4.4, 2.4, 0.8, '#1a1a1a');                   // rear tyres
      rr(3, -4, 2.6, 1.6, 0.6, '#1a1a1a'); rr(3, 2.4, 2.6, 1.6, 0.6, '#1a1a1a');                           // front tyres
      rr(-3, -2.4, 9.5, 4.8, 1.2, body);                                                                      // hood
      rr(-6, -3.6, 5, 7.2, 1, body);
      rr(-5.6, -3, 4, 6, 0.8, '#f2f2ee');                                                                     // cab roof
      dot(1.5, -1.6, 0.7, '#3a3a3a');                                                                         // exhaust stack
      unplace();
    } else if (kind === 'bulldozer') {
      const pos = Math.sin(tau * 0.6 + ph) * 7;
      // dirt pile it keeps pushing, and the scraped strip
      ctx.fillStyle = 'rgba(90,70,48,0.35)'; ctx.fillRect(cx - (horiz ? 14 : 5), cy - (horiz ? 5 : 14), horiz ? 28 : 10, horiz ? 10 : 28);
      ctx.fillStyle = '#7a5a3a';
      ctx.beginPath(); ctx.ellipse(cx + ax * 16, cy + ay * 16, horiz ? 4 : 7, horiz ? 7 : 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(cx + ax * 15, cy + ay * 15 - 1, horiz ? 2 : 4, horiz ? 4 : 2, 0, 0, Math.PI * 2); ctx.fill();
      place(cx + ax * pos, cy + ay * pos, axAng);
      shadow(14, 11);
      lights(9);
      rr(-7, -5.5, 13, 2.8, 0.8, '#2a2a2c'); rr(-7, 2.7, 13, 2.8, 0.8, '#2a2a2c');                         // tracks
      ctx.fillStyle = 'rgba(90,90,90,0.6)'; for (let g = -6; g < 6; g += 2) { ctx.fillRect(g, -5.5, 0.6, 2.8); ctx.fillRect(g, 2.7, 0.6, 2.8); }
      rr(-6, -3.2, 11, 6.4, 1, '#e0b020');                                                                    // body
      rr(-5.6, -2.4, 4, 4.8, 0.6, '#3a3e44');                                                                 // cab
      ctx.fillStyle = '#6a6e72'; ctx.fillRect(6.5, -6.5, 2, 13);                                              // blade
      ctx.fillStyle = '#4a4e52'; ctx.fillRect(5, -3, 1.6, 1); ctx.fillRect(5, 2, 1.6, 1);
      beacon(-4, 0);
      unplace();
    } else if (kind === 'excavator') {
      const face = _hash(k, 6) * Math.PI * 2;
      const pitX = cx + Math.cos(face) * 12, pitY = cy + Math.sin(face) * 12;
      const heapA = face + Math.PI * 0.6;
      ctx.fillStyle = '#4a3a2a'; ctx.beginPath(); ctx.ellipse(pitX, pitY, 6, 4, face, 0, Math.PI * 2); ctx.fill();      // pit
      ctx.fillStyle = '#2e241a'; ctx.beginPath(); ctx.ellipse(pitX, pitY, 3.6, 2.2, face, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7a5a3a'; ctx.beginPath(); ctx.ellipse(cx + Math.cos(heapA) * 13, cy + Math.sin(heapA) * 13, 5, 4, heapA, 0, Math.PI * 2); ctx.fill();   // spoil heap
      // tracks stay put; the house swings between pit and heap
      place(cx, cy, face);
      rr(-6.5, -6, 13, 3, 0.8, '#2a2a2c'); rr(-6.5, 3, 13, 3, 0.8, '#2a2a2c');
      unplace();
      const swing = face + (0.5 + 0.5 * Math.sin(tau * 0.55 + ph)) * Math.PI * 0.6;
      const reach = 9 + 3 * Math.sin(tau * 1.1 + ph);
      place(cx, cy, swing);
      shadow(10, 9);
      lights(5);
      ctx.strokeStyle = '#d8a018'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(reach, 0); ctx.stroke();                                  // boom
      rr(reach - 1, -2.2, 3.4, 4.4, 0.8, '#5a5e62');                                                          // bucket
      rr(-5, -4.2, 9, 8.4, 1.4, '#e0b020');                                                                   // house
      rr(-6, -3.4, 2.6, 6.8, 0.6, '#3a3e44');                                                                 // counterweight
      rr(0.5, 1, 3, 3, 0.5, '#2a3440');                                                                       // cab
      beacon(-3, -2);
      ctx.lineCap = 'butt';
      unplace();
    } else if (kind === 'loader') {
      const w = 0.55 + _hash(k, 6) * 0.3;
      const pos = Math.sin(tau * w + ph) * 7;
      const loaded = Math.cos(tau * w + ph) < 0;
      ctx.fillStyle = '#7a5a3a'; ctx.beginPath(); ctx.ellipse(cx + ax * 16, cy + ay * 16, horiz ? 3.6 : 6, horiz ? 6 : 3.6, 0, 0, Math.PI * 2); ctx.fill();
      place(cx + ax * pos, cy + ay * pos, axAng);
      shadow(13, 8);
      lights(9);
      for (const [tx, ty] of [[-5, -5], [-5, 3], [2.5, -5], [2.5, 3]]) rr(tx, ty, 3.4, 2, 0.8, '#1a1a1a');   // tyres
      rr(-6, -3, 6, 6, 1, '#e0b020');                                                                         // rear frame
      rr(0.5, -2.6, 5, 5.2, 1, '#e0b020');                                                                    // front frame
      rr(-5.4, -2.2, 3.2, 4.4, 0.6, '#2a3440');                                                               // cab
      ctx.fillStyle = '#6a6e72'; ctx.fillRect(6, -4.5, 2.6, 9);                                               // bucket
      if (loaded) { ctx.fillStyle = '#7a5a3a'; ctx.beginPath(); ctx.ellipse(7.3, 0, 1.6, 3.6, 0, 0, Math.PI * 2); ctx.fill(); }
      beacon(-2, 0);
      unplace();
    } else if (kind === 'mixer') {
      const pos = Math.sin(tau * 0.35 + ph) * 3;
      place(cx + ax * pos, cy + ay * pos, axAng);
      shadow(18, 7.5);
      lights(9);
      rr(4.5, -3.75, 4.5, 7.5, 1.4, '#e8e8e4');                                                               // cab
      rr(5.6, -3, 1.6, 6, 0.5, '#1e2a36');
      rr(-9, -3.4, 13, 6.8, 1, '#3a3e44');                                                                    // chassis
      ctx.save();
      ctx.beginPath(); ctx.ellipse(-2.5, 0, 6.2, 3.4, 0, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#c8ccd0'; ctx.fillRect(-9, -4, 13, 8);
      ctx.fillStyle = '#e07020';
      const spin = (tau * 4) % 4;
      for (let s = -12; s < 6; s += 4) { ctx.beginPath(); ctx.moveTo(s + spin, -4); ctx.lineTo(s + spin + 2, -4); ctx.lineTo(s + spin - 1, 4); ctx.lineTo(s + spin - 3, 4); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      unplace();
    } else if (kind === 'welder') {
      // A steel beam up on trestles, a welder at it in bursts of arc light
      // and sparks, a gas bottle beside.
      const bl = 26;
      const bx0 = cx - ax * bl / 2 - ay * 2, by0 = cy - ay * bl / 2 - ax * 2;
      const bw = horiz ? bl : 4, bh = horiz ? 4 : bl;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(bx0 + 1.5, by0 + 2, bw, bh);
      ctx.fillStyle = '#3a3e44';
      for (const e of [-1, 1]) ctx.fillRect(cx + ax * e * 9 - 2.5 - ay * 3, cy + ay * e * 9 - 2.5 - ax * 3, horiz ? 5 : 10, horiz ? 10 : 5);   // trestles
      ctx.fillStyle = '#6a6e74'; ctx.fillRect(bx0, by0, bw, bh);
      ctx.fillStyle = '#8a9098'; ctx.fillRect(bx0, by0, horiz ? bw : 1, horiz ? 1 : bh);
      ctx.fillStyle = '#4a4e54'; ctx.fillRect(bx0 + ay * 1.7, by0 + ax * 1.7, horiz ? bw : 0.6, horiz ? 0.6 : bh);   // web
      // gas bottle, and the welder standing at the beam
      const gx = cx - ax * 14 + ay * 7, gy = cy - ay * 14 + ax * 7;
      dot(gx, gy, 2, '#3a7a4a'); dot(gx, gy, 0.9, '#8a8e92');
      const wx = cx + ax * 3 + ay * 6, wy = cy + ay * 3 + ax * 6 + 4;
      drawPerson(ctx, wx, wy, 'welder', horiz ? -1 : 1, true, t, k, 1, dark, detail, 1);
      if (!active) return;
      const burst = Math.sin(tau * 0.7 + ph) > -0.25;
      if (!burst || _hash(k, Math.floor(t * 14)) > 0.8) return;
      const sx = cx + (horiz ? 1 : 1.5), sy = cy + (horiz ? 1.5 : 1);   // on the beam, at their hands
      ctx.globalAlpha = 0.55 + 0.4 * dark;
      const g = 16 + 10 * dark + _hash(k, Math.floor(t * 20)) * 4;
      ctx.drawImage(_arcGlow(), sx - g / 2, sy - g / 2, g, g);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - 0.6, sy - 0.6, 1.2, 1.2);
      ctx.fillStyle = '#ffc050';
      for (let i = 0; i < 6; i++) {                // sparks: fly out, fall, fade
        const age = (t * 2.6 + i / 6 + _hash(k, 50 + i)) % 1;
        const ang = _hash(k * 3 + i, Math.floor(t * 2.6 + i / 6 + _hash(k, 50 + i))) * Math.PI * 2;
        ctx.globalAlpha = 1 - age;
        ctx.fillRect(sx + Math.cos(ang) * age * 7, sy + Math.sin(ang) * age * 4 + age * age * 7, 0.8, 0.8);
      }
      ctx.globalAlpha = 1;
    }
  }

  function _drawYard(ctx, base, plan, Z, activity, t, dark, detail, vx0, vy0, vx1, vy1) {
    const T = TILE;
    const { c0, c1, r0, r1, w, path, blocked } = plan;
    const I = (c, r) => (r - r0) * w + (c - c0);
    const isPath = (c, r) => c >= c0 && c <= c1 && r >= r0 && r <= r1 && path[I(c, r)] === 1;
    // stay inside the yard fence (the padding ring is the perimeter road)
    const cA = Math.max(c0 + 1, Math.floor(vx0 / T)), cB = Math.min(c1 - 1, Math.floor(vx1 / T));
    const rA = Math.max(r0 + 1, Math.floor(vy0 / T)), rB = Math.min(r1 - 1, Math.floor(vy1 / T));
    // Below the detail zoom a machine is just its body (see _drawMachine),
    // and a yard can hold hundreds on screen. Each one's own transform, path
    // and fill was most of a frame on a big industrial city, so they are
    // gathered into one path per colour instead and filled once. Machines
    // never overlap (one per yard tile), so the order they land in is moot.
    const bodies = detail ? null : new Map();
    yard: for (let r = rA; r <= rB; r++) {
      for (let c = cA; c <= cB; c++) {
        const i = I(c, r);
        if (blocked[i] || path[i]) continue;
        const nearRoad = isPath(c, r - 1) || isPath(c, r + 1) || isPath(c - 1, r) || isPath(c + 1, r);
        // storage lots (containers, pallets, drums) — same test drawIndustrialGround uses
        if (nearRoad && typeof _nbHash === 'function' && _nbHash(c, r, 150) < 0.6) continue;
        const k = c * 92821 + r * 68917;
        if (_hash(k, 1) > Z.yard * _density) continue;
        if (_excl.length && _inExcl(c * T + T / 2, r * T + T / 2)) continue;
        if (--_budget < 0) break yard;
        const kind = pickKind(Z.yardKinds, _hash(k, 3));
        if (bodies) {
          const col = _machineBody(kind);
          let p = bodies.get(col);
          if (!p) bodies.set(col, p = new Path2D());
          // _drawMachine's 12×8 body, turned a quarter for a vertical run
          const cx = c * T + T / 2, cy = r * T + T / 2;
          if (_hash(k, 4) < 0.5) p.roundRect(cx - 6, cy - 4, 12, 8, 1.5);
          else p.roundRect(cx - 4, cy - 6, 8, 12, 1.5);
          continue;
        }
        const active = _hash(k, 2) <= activity;
        _drawMachine(ctx, base, kind, c * T + T / 2, r * T + T / 2, k, t, active, dark, detail);
      }
    }
    if (bodies && bodies.size) {
      ctx.setTransform(base);
      for (const [col, p] of bodies) { ctx.fillStyle = col; ctx.fill(p); }
    }
  }

  // ── Zone-street traffic ───────────────────────────────────────────
  // Vehicles on the commercial streets and industrial haul roads drive the
  // zone's street network as a whole: straight on or turning at junctions,
  // U-turning at dead ends, in and out of the tunnel portals. Unlike the
  // people they keep a little state, so they can wait for each other:
  //  - an ordinary street tile has one lane each way and a lane holds one
  //    vehicle, so traffic queues nose to tail and eases off behind whatever
  //    is ahead;
  //  - a junction, corner or dead-end tile is a box: a vehicle enters it only when
  //    its path through (straight, turn or U-turn) crosses none already in
  //    use, and only with room on the far side, so nobody stops in the
  //    middle of a crossing. Oncoming straight traffic shares a box.
  // Nothing is saved. A zone's traffic moves only while the zone is on
  // screen, and is rebuilt (fading across) when its street plan changes.
  const TD = [[1, 0], [0, 1], [-1, 0], [0, -1]];        // headings: E S W N
  const SIDE_DIR = { E: 0, S: 1, W: 2, N: 3 };
  const LANE = 5.5;               // lane centre off the street's centre line, px
  const ACC = 22, DEC = 55;       // px/s²
  const GAP = 3;                  // px between queued vehicles
  const BOX_LINE = 12;            // px short of a junction that traffic waits
  const TRAFFIC_SHARE = 0.8;      // vehicles per street tile, × the zone's `vehicles`
  const STUCK_S = 12;             // a vehicle held this long gives up and pulls off

  // Path through one tile for each (heading in, heading out), relative to the
  // tile centre, sampled so position and heading can be looked up by distance.
  // `lane` is the lane centre's offset (the connector roads' lanes are wider).
  const _trajs = [];
  function _traj(din, dout, lane = LANE) {
    const key = din * 4 + dout + lane * 16;
    if (_trajs[key]) return _trajs[key];
    const H = TILE / 2;
    const [ax, ay] = TD[din], [bx, by] = TD[dout];
    const p0x = -ax * H - ay * lane, p0y = -ay * H + ax * lane;   // right of heading (x,y) is (-y, x)
    const p1x =  bx * H - by * lane, p1y =  by * H + bx * lane;
    const N = 16, pts = new Float32Array((N + 1) * 2);
    let lim = 1;
    for (let i = 0; i <= N; i++) {
      const u = i / N, v = 1 - u;
      let x, y;
      if (din === dout) { x = p0x + (p1x - p0x) * u; y = p0y + (p1y - p0y) * u; }
      else if (dout === (din + 2) % 4) {                          // U-turn
        const K = H * 1.25;
        const c1x = p0x + ax * K, c1y = p0y + ay * K, c2x = p1x + ax * K, c2y = p1y + ay * K;
        x = v*v*v*p0x + 3*v*v*u*c1x + 3*v*u*u*c2x + u*u*u*p1x;
        y = v*v*v*p0y + 3*v*v*u*c1y + 3*v*u*u*c2y + u*u*u*p1y;
        lim = 0.4;
      } else {                                                    // turn about the lane corner
        const cx = -ay * lane - by * lane, cy = ax * lane + bx * lane;
        x = v*v*p0x + 2*v*u*cx + u*u*p1x;
        y = v*v*p0y + 2*v*u*cy + u*u*p1y;
        lim = dout === (din + 1) % 4 ? 0.55 : 0.7;                // right turns are the tight ones
      }
      pts[i * 2] = x; pts[i * 2 + 1] = y;
    }
    const cum = new Float32Array(N + 1);
    for (let i = 1; i <= N; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i*2] - pts[i*2 - 2], pts[i*2 + 1] - pts[i*2 - 1]);
    return (_trajs[key] = { pts, cum, len: cum[N], lim, N });
  }

  // Which box movements can't share a junction: their paths come within a
  // vehicle's width of each other.
  let _conflict = null;
  function _conflicts() {
    if (_conflict) return _conflict;
    _conflict = new Uint8Array(256);
    for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) {
      const A = _traj(a >> 2, a & 3), B = _traj(b >> 2, b & 3);
      let near = false;
      for (let i = 0; i <= A.N && !near; i++) for (let j = 0; j <= B.N; j++) {
        if (Math.hypot(A.pts[i*2] - B.pts[j*2], A.pts[i*2 + 1] - B.pts[j*2 + 1]) < 10) { near = true; break; }
      }
      _conflict[a * 16 + b] = near ? 1 : 0;
    }
    return _conflict;
  }

  const _sims = new Map();        // zone key + rect → traffic state

  function _simFor(key, rect, plan, Z, activity) {
    const id = key + ':' + rect.minC + ',' + rect.minR;
    const old = _sims.get(id);
    if (old && old.plan === plan) return old;
    const { c0, r0, w, path } = plan;
    const h = plan.r1 - r0 + 1, n = w * h;
    const isP = (c, r) => c >= c0 && c <= plan.c1 && r >= r0 && r <= plan.r1 && path[(r - r0) * w + (c - c0)] === 1;
    const nb = new Uint8Array(n), pt = new Uint8Array(n), box = new Uint8Array(n);
    const ends = new Uint8Array(n);   // portal sides that are a road's end (connector roads)
    const cells = [], portals = [];
    for (const p of plan.portals || []) {
      const i = (p.r - r0) * w + (p.c - c0);
      pt[i] |= 1 << SIDE_DIR[p.side];
      if (p.end) ends[i] |= 1 << SIDE_DIR[p.side];
      portals.push({ i, dir: SIDE_DIR[p.side] });
    }
    let tiles = 0;
    for (let r = r0; r <= plan.r1; r++) for (let c = c0; c <= plan.c1; c++) {
      if (!isP(c, r)) continue;
      const i = (r - r0) * w + (c - c0);
      for (let d = 0; d < 4; d++) if (isP(c + TD[d][0], r + TD[d][1])) nb[i] |= 1 << d;
      const m = nb[i] | pt[i];
      const k = (m & 1) + (m >> 1 & 1) + (m >> 2 & 1) + (m >> 3 & 1);
      if (!k) continue;
      tiles++;
      // Straight-through tiles are plain lanes; junctions, dead ends and
      // corners are boxes (a lorry swings wide through a corner too).
      if (k === 2 && (m === 5 || m === 10)) cells.push(i); else box[i] = 1;
    }
    const sim = { plan, c0, r0, w, nb, pt, box, ends, cells, portals, tiles, lane: plan.lane || LANE, open: !!plan.open,
      occ: new Int32Array(n * 4), boxUse: new Map(), veh: [], byId: new Map(),
      nextId: 1, lastT: null, spawnT: 0, seen: 0 };
    _sims.set(id, sim);
    // A plan rebuilt under traffic (buildings changed): the old vehicles fade
    // where they stand and the new network fills in behind them.
    // (Those in a tunnel mouth just go: their clip belongs to the old plan.)
    sim.ghosts = old ? old.veh.filter(v => v.alpha > 0 && v.s >= 0 && !v.out).map(v => (v.fa = -1, v)) : [];
    _populate(sim, Z, activity, !old);
    return sim;
  }

  const _cellX = (sim, i) => (sim.c0 + i % sim.w) * TILE + TILE / 2;
  const _cellY = (sim, i) => (sim.r0 + Math.floor(i / sim.w)) * TILE + TILE / 2;
  // Cell next door in heading d: its index, -2 through a tunnel portal, -1 none.
  function _step(sim, i, d) {
    if (sim.pt[i] >> d & 1) return -2;
    if (!(sim.nb[i] >> d & 1)) return -1;
    return i + TD[d][0] + TD[d][1] * sim.w;
  }
  // Where to go on leaving cell i, having come in heading `din`.
  function _chooseOut(sim, i, din, leaving) {
    const m = sim.nb[i] | sim.pt[i], back = (din + 2) % 4;
    let total = 0;
    const wt = [0, 0, 0, 0];
    for (let d = 0; d < 4; d++) {
      if (d === back || !(m >> d & 1)) continue;
      wt[d] = (sim.pt[i] >> d & 1) ? (leaving ? 8 : 1) : d === din ? 4 : 1;
      total += wt[d];
    }
    if (!total) return back;
    let x = Math.random() * total;
    for (let d = 0; d < 4; d++) { x -= wt[d]; if (wt[d] && x <= 0) return d; }
    return din;
  }

  // Lanes and boxes. canClaim returns 0 when free, else the id of whoever
  // holds it (-1 for a box). A long vehicle (bus, lorry) turning swings its
  // body across the whole box, so it takes the box to itself: its move is
  // stored as 16 + move, which conflicts with everything.
  const _wide = (len, din, dout) => len > 20 && din !== dout;
  function _canClaim(sim, i, din, dout, id, len) {
    if (sim.box[i]) {
      const use = sim.boxUse.get(i);
      if (!use) return 0;
      const C = _conflicts(), mv = din * 4 + dout, wide = _wide(len, din, dout);
      for (let k = 0; k < use.length; k += 2) {
        if (use[k] === id) continue;
        if (wide || use[k + 1] >= 16 || C[mv * 16 + use[k + 1]]) return -1;
      }
      return 0;
    }
    const o = sim.occ[i * 4 + din];
    return o === id ? 0 : o;
  }
  function _claim(sim, v, i, din, dout) {
    if (sim.box[i]) {
      let use = sim.boxUse.get(i);
      if (!use) sim.boxUse.set(i, use = []);
      use.push(v.id, din * 4 + dout + (_wide(v.len, din, dout) ? 16 : 0));
    } else sim.occ[i * 4 + din] = v.id;
    v.claims.push(i, din, dout);
  }
  // Release one claim — cell i entered heading din. (Only that one: a route
  // can pass the same cell twice, e.g. out and back from a dead end.)
  function _release(sim, v, i, din) {
    const c = v.claims;
    for (let k = 0; k < c.length; k += 3) {
      if (c[k] !== i || c[k + 1] !== din) continue;
      if (sim.box[i]) {
        const use = sim.boxUse.get(i), mv = din * 4 + c[k + 2] + (_wide(v.len, din, c[k + 2]) ? 16 : 0);
        if (use) {
          for (let j = 0; j < use.length; j += 2) if (use[j] === v.id && use[j + 1] === mv) { use.splice(j, 2); break; }
          if (!use.length) sim.boxUse.delete(i);
        }
      } else if (sim.occ[i * 4 + din] === v.id) sim.occ[i * 4 + din] = 0;
      c.splice(k, 3);
      return;
    }
  }
  function _releaseAll(sim, v) { while (v.claims.length) _release(sim, v, v.claims[0], v.claims[1]); }

  // Claim the way on from v's current cell: the next cell, and on through
  // any boxes beyond it to an ordinary lane (or a portal), all or nothing.
  // Returns 0 on success, else what's in the way (see _canClaim).
  function _acquire(sim, v) {
    const route = [];
    let cur = v.cell, hd = v.dout, blocked = 0;
    for (let step = 0; step < 5; step++) {
      const nx = _step(sim, cur, hd);
      if (nx === -2) { route.push(-2, hd, hd); break; }
      if (nx < 0) { blocked = -1; break; }
      const out = _chooseOut(sim, nx, hd, v.leaving);
      blocked = _canClaim(sim, nx, hd, out, v.id, v.len);
      if (blocked) break;
      _claim(sim, v, nx, hd, out);
      route.push(nx, hd, out);
      if (!sim.box[nx]) break;
      cur = nx; hd = out;
    }
    if (blocked) { for (let k = 0; k < route.length; k += 3) if (route[k] >= 0) _release(sim, v, route[k], route[k + 1]); return blocked; }
    v.route = route;
    return 0;
  }

  function _newVehicle(sim, Z, i, din, dout, s, alpha) {
    const kind = pickKind(Z.vehKinds, Math.random());
    const V = VEH[kind];
    const v = { id: sim.nextId++, kind, len: V.len, vmax: V.speed * (Z.speed || 1) * (0.85 + Math.random() * 0.25),
      v: 0, cell: i, din, dout, s, route: [], claims: [], tail: -1, tailDin: 0, out: false,
      alpha, fa: alpha < 1 ? 1 : 0, wait: 0, leaving: false, k: (Math.random() * 1e9) | 0, x: 0, y: 0, ang: 0 };
    v.v = v.vmax * _traj(din, dout, sim.lane).lim;
    _claim(sim, v, i, din, dout);
    sim.veh.push(v); sim.byId.set(v.id, v);
    _place(sim, v);
    return v;
  }

  // Put a vehicle on a random free lane of an ordinary street tile.
  function _spawnOnStreet(sim, Z, alpha) {
    if (!sim.cells.length) return false;
    for (let tries = 0; tries < 6; tries++) {
      const i = sim.cells[(Math.random() * sim.cells.length) | 0];
      const m = sim.nb[i] | sim.pt[i];
      const ends = [];
      for (let d = 0; d < 4; d++) if (m >> d & 1) ends.push(d);
      const flip = Math.random() < 0.5;
      const from = ends[flip ? 1 : 0], to = ends[flip ? 0 : 1];
      const din = (from + 2) % 4;
      if (sim.occ[i * 4 + din]) continue;
      const tr = _traj(din, to, sim.lane), len = VEH.semi.len;
      const s = len / 2 + 2 + Math.random() * Math.max(0, tr.len - len - 2 - GAP);
      _newVehicle(sim, Z, i, din, to, s, alpha);
      return true;
    }
    return false;
  }
  // Drive a vehicle in out of a tunnel portal.
  function _spawnAtPortal(sim, Z) {
    if (!sim.portals.length) return false;
    const p = sim.portals[(Math.random() * sim.portals.length) | 0];
    const din = (p.dir + 2) % 4;
    const dout = _chooseOut(sim, p.i, din, false);
    if (_canClaim(sim, p.i, din, dout, 0, VEH.semi.len)) return false;
    _newVehicle(sim, Z, p.i, din, dout, -TunnelPortal.EXT, 1);
    return true;
  }

  const _target = (sim, Z, activity) => Math.round(sim.tiles * Z.vehicles * TRAFFIC_SHARE * activity * _density * _wxCar);

  function _populate(sim, Z, activity, instant) {
    const n = _target(sim, Z, activity);
    for (let k = 0; k < n * 3 && sim.veh.length < n; k++) _spawnOnStreet(sim, Z, instant ? 1 : 0);
  }

  function _removeVehicle(sim, v) {
    _releaseAll(sim, v);
    sim.byId.delete(v.id);
    v.dead = true;
  }

  function _updateVehicle(sim, v, dt) {
    let tr = _traj(v.din, v.dout, sim.lane);
    if (v.fa) {
      v.alpha += v.fa * dt / 0.8;
      if (v.alpha >= 1) { v.alpha = 1; v.fa = 0; }
      if (v.alpha <= 0) { _removeVehicle(sim, v); return; }
    }
    // Target speed: the tile's own limit, easing down for a tighter move in
    // the next tile, and stopping short where the way on isn't free.
    let want = v.vmax * tr.lim;
    // Wait back at the line before a box, clear of anything turning in it.
    const nx = _step(sim, v.cell, v.dout);
    const stopS = tr.len - v.len / 2 - (nx >= 0 && sim.box[nx] ? BOX_LINE : GAP);
    if (!v.out && !v.route.length && v.fa >= 0) {
      if (stopS - v.s <= v.v * v.v / (2 * DEC) + 6) {
        const b = _acquire(sim, v);
        if (b > 0) {                                     // queue behind the one ahead
          const L = sim.byId.get(b);
          if (L) {
            const gap = Math.hypot(L.x - v.x, L.y - v.y) - (L.len + v.len) / 2;
            want = Math.min(want, L.v + Math.max(0, gap - GAP) * 1.5);
          }
        }
      }
    }
    if (!v.out && !v.route.length) want = Math.min(want, Math.sqrt(2 * DEC * Math.max(0, stopS - v.s)));
    else if (v.route.length && v.route[0] >= 0) {
      const nl = v.vmax * _traj(v.route[1], v.route[2], sim.lane).lim;
      want = Math.min(want, Math.sqrt(nl * nl + 2 * DEC * Math.max(0, tr.len - v.s)));
    }
    const v0 = v.v;
    v.v = v.v < want ? Math.min(want, v.v + ACC * dt) : Math.max(want, v.v - DEC * 2 * dt);
    // Brake lights: on while slowing and while held stopped, lingering a
    // moment so they don't flicker as the speed settles.
    v.brakeT = v.v < v0 - 2 * dt || v.v < 0.5 ? 0.3 : Math.max(0, (v.brakeT || 0) - dt);
    const s0 = v.s;
    v.s += v.v * dt;
    // No claim on the way on: never past the stopping point (a long vehicle
    // that starts a tight bend already beyond it just waits where it is).
    if (!v.out && !v.route.length && v.s > stopS) { v.s = Math.max(stopS, s0); v.v = 0; }
    // On into the next cell(s).
    while (!v.out && v.route.length && v.s >= tr.len) {
      const nx = v.route[0];
      if (nx === -2) { v.out = true; v.route.length = 0; break; }
      v.s -= tr.len;
      if (v.tail >= 0) _release(sim, v, v.tail, v.tailDin);
      v.tail = v.cell; v.tailDin = v.din;
      v.cell = nx; v.din = v.route[1]; v.dout = v.route[2];
      v.route.splice(0, 3);
      tr = _traj(v.din, v.dout, sim.lane);
    }
    // The tail has cleared the cell behind.
    if (v.tail >= 0 && v.s >= v.len / 2 + 2) { _release(sim, v, v.tail, v.tailDin); v.tail = -1; }
    if (v.out) {
      const e = v.s - tr.len;
      if (e >= v.len / 2 + 2 && v.claims.length) _releaseAll(sim, v);
      if (e > TunnelPortal.EXT) { _removeVehicle(sim, v); return; }
    }
    v.wait = v.v < 0.5 ? v.wait + dt : 0;
    if (v.wait > STUCK_S && !v.leaving) { v.leaving = true; v.fa = -1; }
    _place(sim, v);
  }

  // Indicator for the turn a vehicle is in or has claimed next: FX_LEFT /
  // FX_RIGHT, or 0 for straight on (and U-turns, which just pull round).
  function _signal(sim, v) {
    const turn = (din, dout) => dout === (din + 1) % 4 ? FX_RIGHT : dout === (din + 3) % 4 ? FX_LEFT : 0;
    const here = turn(v.din, v.dout);
    if (here && v.s < _traj(v.din, v.dout, sim.lane).len * 0.7) return here;
    for (let k = 0; k < v.route.length; k += 3) { if (v.route[k] < 0) break; const f = turn(v.route[k + 1], v.route[k + 2]); if (f) return f; }
    return 0;
  }

  // World position and heading from cell + distance along its path.
  function _place(sim, v) {
    const tr = _traj(v.din, v.dout, sim.lane), cx = _cellX(sim, v.cell), cy = _cellY(sim, v.cell);
    const P = tr.pts, N = tr.N;
    if (v.s <= 0) {
      v.x = cx + P[0] + TD[v.din][0] * v.s; v.y = cy + P[1] + TD[v.din][1] * v.s;
      v.ang = Math.atan2(TD[v.din][1], TD[v.din][0]);
    } else if (v.s >= tr.len) {
      const e = v.s - tr.len;
      v.x = cx + P[N * 2] + TD[v.dout][0] * e; v.y = cy + P[N * 2 + 1] + TD[v.dout][1] * e;
      v.ang = Math.atan2(TD[v.dout][1], TD[v.dout][0]);
    } else {
      let j = 1;
      while (j < N && tr.cum[j] < v.s) j++;
      const f = (v.s - tr.cum[j - 1]) / Math.max(1e-6, tr.cum[j] - tr.cum[j - 1]);
      const ax = P[j*2 - 2], ay = P[j*2 - 1], bx = P[j*2], by = P[j*2 + 1];
      v.x = cx + ax + (bx - ax) * f; v.y = cy + ay + (by - ay) * f;
      v.ang = Math.atan2(by - ay, bx - ax);
    }
  }

  const _tunnelFade = (e) => TunnelPortal.fade(e);
  const END_FADE = 28;            // px over which traffic fades at a connector road's end
  const _mergeFade = (e) => Math.max(0, Math.min(1, 1 - e / 24));
  function _drawTraffic(ctx, base, sim, list, t, dark, detail, vx0, vy0, vx1, vy1) {
    const H = TILE / 2;
    for (const v of list) {
      if (v.dead || v.x < vx0 || v.x > vx1 || v.y < vy0 || v.y > vy1) continue;
      if (_excl.length && _inExcl(v.x, v.y)) continue;
      const tr = _traj(v.din, v.dout, sim.lane);
      // In a tunnel mouth: darken through it and hide what's gone in under the headwall.
      // (A connector road has no tunnels: its traffic fades into the zone's own.)
      const inT = v.s < 0, outT = v.s > tr.len;
      const fade = sim.open ? _mergeFade : _tunnelFade;
      let a = v.alpha;
      if (inT) a *= fade(-v.s);
      if (outT) a *= fade(v.s - tr.len);
      // A road's end: gone by the time it gets there, and fading in from it.
      const ends = sim.ends[v.cell];
      if (ends) {
        if (ends >> v.dout & 1) a *= Math.max(0, Math.min(1, (tr.len - v.s) / END_FADE));
        if (ends >> ((v.din + 2) % 4) & 1) a *= Math.max(0, Math.min(1, v.s / END_FADE));
      }
      if (a <= 0) continue;
      if (--_budget < 0) return;
      // Ruts where it drives through lying snow (weather_state.js decides if there is any).
      if (_snowy && !inT && !outT && typeof SnowTracks !== 'undefined') { const V = VEH[v.kind]; if (V) SnowTracks.vehicle(v, v.x, v.y, v.ang, V.len, V.wid); }
      const fx = (v.brakeT > 0 && !v.dead ? FX_BRAKE : 0) | (v.fa >= 0 ? _signal(sim, v) : 0);
      if ((inT || outT) && !sim.open) {
        const d = inT ? (v.din + 2) % 4 : v.dout;               // outward, towards the portal
        const ox = TD[d][0], oy = TD[d][1];
        const ex = _cellX(sim, v.cell) + ox * (H + TunnelPortal.CLIP), ey = _cellY(sim, v.cell) + oy * (H + TunnelPortal.CLIP);
        const fx = ex - ox * 200, fy = ey - oy * 200;
        ctx.save(); ctx.beginPath();
        if (ox) ctx.rect(Math.min(ex, fx), ey - 40, 200, 80); else ctx.rect(ex - 40, Math.min(ey, fy), 80, 200);
        ctx.clip();
        drawVehicle(ctx, base, v.x, v.y, v.kind, v.ang, v.k, t, a, dark, detail, 1, fx);
        ctx.restore();
      } else drawVehicle(ctx, base, v.x, v.y, v.kind, v.ang, v.k, t, a, dark, detail, 1, fx);
    }
  }

  // Step and draw one zone rect's traffic.
  function _traffic(ctx, base, key, rect, plan, Z, activity, t, dark, detail, vx0, vy0, vx1, vy1) {
    const sim = _simFor(key, rect, plan, Z, activity);
    sim.seen = t;
    const dt = sim.lastT === null || t < sim.lastT || t - sim.lastT > 1 ? 0 : Math.min(0.1, t - sim.lastT);
    sim.lastT = t;
    if (dt > 0) {
      for (const v of sim.veh) if (!v.dead) _updateVehicle(sim, v, dt);
      if (sim.veh.some(v => v.dead)) sim.veh = sim.veh.filter(v => !v.dead);
      for (const g of sim.ghosts) { g.alpha -= dt / 0.8; if (g.alpha <= 0) g.dead = true; }
      if (sim.ghosts.length && sim.ghosts.some(g => g.dead)) sim.ghosts = sim.ghosts.filter(g => !g.dead);
      // Busier or quieter with the hour: new traffic comes out of a tunnel
      // or pulls out onto a street; surplus traffic pulls off.
      sim.spawnT -= dt;
      const n = _target(sim, Z, activity), live = sim.veh.reduce((a, v) => a + (v.leaving ? 0 : 1), 0);
      if (sim.spawnT <= 0) {
        sim.spawnT = 0.35;
        if (live < n) { if (!(Math.random() < 0.6 && _spawnAtPortal(sim, Z))) _spawnOnStreet(sim, Z, 0); }
        else if (live > n + 1) {
          const v = sim.veh[(Math.random() * sim.veh.length) | 0];
          if (!v.leaving) { v.leaving = true; v.fa = -1; }
        }
      }
    }
    _drawTraffic(ctx, base, sim, sim.ghosts, t, dark, detail, vx0, vy0, vx1, vy1);
    _drawTraffic(ctx, base, sim, sim.veh, t, dark, detail, vx0, vy0, vx1, vy1);
    // Forget traffic for zones long off screen (or rects that have moved).
    if (_sims.size > 8 && Math.random() < 0.01) for (const [id, s] of _sims) if (t - s.seen > 120 || t < s.seen) _sims.delete(id);
  }

  // ── Traffic on the connector roads ────────────────────────────────
  // Cars running between the zones on the inter-zone connector roads
  // (_connectorTiles, render_core.js). Each connected stretch of road is
  // driven as a street network of its own by the same traffic sim as the
  // zone streets: two lanes, queueing, taking turns at junctions. Where a
  // road opens onto a commercial or industrial zone's ring street, traffic
  // drives on into the zone and fades into its own (and new traffic comes
  // out the same way) instead of a tunnel. Where a road just ends — at a
  // zone with only walks, or at the water — traffic fades out as it reaches
  // the end, and new traffic fades in from there, rather than turning round.
  const CONNECTOR = {
    vehicles: 0.4, speed: 1.4,
    vehKinds: [['car', 0.46], ['suv', 0.13], ['van', 0.12], ['pickup', 0.08], ['taxi', 0.08], ['bus', 0.05], ['semi', 0.05], ['police', 0.02], ['ambulance', 0.01]],
  };
  const CONN_LANE = 7.5;          // lane centre off the road's centre line, px
  let _connVer = null, _connSig = null, _connPlans = [];

  // One street plan (as _simFor takes) per connected stretch of connector
  // road. Kept across zone edits that leave the roads as they were, so the
  // traffic on them isn't rebuilt for nothing.
  function _connectorPlans() {
    if (typeof _ensureConnectorNetwork !== 'function') return _connPlans;
    const ver = ZoneSystem.getVersion();
    if (ver === _connVer) return _connPlans;
    _connVer = ver;
    _ensureConnectorNetwork();
    const tiles = _connectorTiles;
    let sig = tiles.size;
    const at = new Map();           // key → [c, r]
    for (const [k, m] of tiles) {
      const i = k.indexOf(','), c = +k.slice(0, i), r = +k.slice(i + 1);
      at.set(k, [c, r]);
      sig = (Math.imul(sig, 31) + c * 7919 + r * 104729 + m) | 0;
    }
    if (sig === _connSig) return _connPlans;
    _connSig = sig;
    const plans = [], seen = new Set();
    for (const k0 of tiles.keys()) {
      if (seen.has(k0)) continue;
      seen.add(k0);
      const comp = [], stack = [k0];
      let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
      while (stack.length) {
        const k = stack.pop(), [c, r] = at.get(k);
        comp.push(c, r, tiles.get(k) & 15);     // street joins only (see _connectorNeighbours)
        if (c < c0) c0 = c; if (c > c1) c1 = c; if (r < r0) r0 = r; if (r > r1) r1 = r;
        for (const [dc, dr] of TD) {
          const nk = (c + dc) + ',' + (r + dr);
          if (tiles.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
        }
      }
      const w = c1 - c0 + 1, path = new Uint8Array(w * (r1 - r0 + 1)), portals = [];
      for (let i = 0; i < comp.length; i += 3) {
        const c = comp[i], r = comp[i + 1], m = comp[i + 2];
        path[(r - r0) * w + (c - c0)] = 1;
        if (m & 1) portals.push({ c, r, side: 'N' });
        if (m & 2) portals.push({ c, r, side: 'S' });
        if (m & 4) portals.push({ c, r, side: 'W' });
        if (m & 8) portals.push({ c, r, side: 'E' });
        if (m) continue;
        // A dead end: one road neighbour and no street to join. Traffic runs
        // out of the far side of the tile (fading as it goes — see `ends`).
        let arms = 0, from = -1;
        for (let d = 0; d < 4; d++) if (tiles.has((c + TD[d][0]) + ',' + (r + TD[d][1]))) { arms++; from = d; }
        if (arms === 1) portals.push({ c, r, side: 'ESWN'[(from + 2) % 4], end: true });
      }
      if (comp.length === 3 && portals.length < 2) continue;   // a lone tile going nowhere
      plans.push({ c0, c1, r0, r1, w, path, portals, lane: CONN_LANE, open: true, rect: { minC: comp[0], minR: comp[1] } });
    }
    return (_connPlans = plans);
  }

  function _connectorTraffic(ctx, base, t, hr, dark, detail, vx0, vy0, vx1, vy1) {
    const plans = _connectorPlans();
    if (!plans.length) return;
    const activity = roadActivity(hr), m = TunnelPortal.EXT + TILE;
    for (const plan of plans) {
      if (_budget <= 0) break;
      if ((plan.c1 + 1) * TILE + m < vx0 || plan.c0 * TILE - m > vx1 || (plan.r1 + 1) * TILE + m < vy0 || plan.r0 * TILE - m > vy1) continue;
      _traffic(ctx, base, 'connector', plan.rect, plan, CONNECTOR, activity, t, dark, detail, vx0, vy0, vx1, vy1);
    }
  }

  // ── Render pass ───────────────────────────────────────────────────
  // Zone ground is painted in this order (see the zone fill pass in
  // render_core.js), so where zones overlap, a later zone's ground covers an
  // earlier one's — e.g. the government quarter over a commercial street.
  const ORDER = ['residential', 'commercial', 'industrial', 'government'];

  // Keep ORDER[zi]'s figures off the ground of every zone painted after it,
  // so they pass underneath it instead of over it: the later zones' ground
  // rects that touch this zone are collected into _excl, and each figure is
  // skipped while it stands on one (_inExcl).
  //
  // This used to be an even-odd clip on the context. A clip that isn't a
  // plain rectangle makes every single figure drawn under it far more
  // expensive to rasterise — measured at well over a third of the whole
  // frame on integrated graphics wherever two zones touched on screen. The
  // only visible difference is at the boundary itself, where a figure now
  // steps out of view whole instead of being sliced by the edge.
  const _excl = [];               // flat [x0, y0, x1, y1, ...], world px
  function _inExcl(x, y) {
    for (let i = 0; i < _excl.length; i += 4)
      if (x >= _excl[i] && x <= _excl[i + 2] && y >= _excl[i + 1] && y <= _excl[i + 3]) return true;
    return false;
  }
  function _excludeLaterZones(zi, rects, vx0, vy0, vx1, vy1) {
    const T = TILE;
    _excl.length = 0;
    for (let k = zi + 1; k < ORDER.length; k++) {
      for (const r of (ZoneSystem.getZoneRects(ORDER[k]) || [])) {
        const x = (r.minC - 1) * T, y = (r.minR - 1) * T;      // ground PAD = 1 tile
        const w = (r.maxC - r.minC + 3) * T, h = (r.maxR - r.minR + 3) * T;
        if (x > vx1 || y > vy1 || x + w < vx0 || y + h < vy0) continue;
        let touches = false;
        for (const o of rects) {
          const ox = (o.minC - 1) * T, oy = (o.minR - 1) * T;
          const ow = (o.maxC - o.minC + 3) * T, oh = (o.maxR - o.minR + 3) * T;
          if (x < ox + ow && x + w > ox && y < oy + oh && y + h > oy) { touches = true; break; }
        }
        if (touches) _excl.push(x, y, x + w, y + h);
      }
    }
  }

  // The tunnel portal (render_core.js) at one end of a run, if the run
  // reaches the zone edge there and the plan put a portal beyond it.
  function _portalEnd(plan, run, atB) {
    if (!plan.portals || !plan.portals.length) return null;
    const side = run.horiz ? (atB ? 'E' : 'W') : (atB ? 'S' : 'N');
    const c = run.horiz ? (atB ? run.b : run.a) : run.fixed, r = run.horiz ? run.fixed : (atB ? run.b : run.a);
    for (const p of plan.portals) if (p.side === side && p.c === c && p.r === r) return p;
    return null;
  }

  // Walkers step out or go home as activity/weather changes, fading over
  // PED_FADE seconds at the moment they switch. This used to be a ramp on
  // how close a walker's threshold sat to the current activity level, which
  // left anyone near the cut-off half-transparent for as long as activity
  // held there (hours, in the evening or in slowly drifting heat) — whole
  // tour groups turned into ghosts. Now each walker is simply in or out.
  const PED_FADE = 1.5;
  const _pedFade = new Map();   // walker key -> { on, at }
  function _pedAlpha(key, on, t) {
    let st = _pedFade.get(key);
    if (!st) _pedFade.set(key, st = { on, at: -Infinity });   // first seen: no fade
    else if (st.on !== on) { st.on = on; st.at = t; }
    else if (t < st.at) st.at = -Infinity;                   // clock restarted
    const k = Math.min(1, (t - st.at) / PED_FADE);
    return on ? k : 1 - k;
  }

  // ── Prints in the snow ────────────────────────────────────────────
  // Walkers leave shoe prints and cyclists a thin tyre line wherever they
  // cross lying snow, through the same marks the wildlife leaves
  // (Wildlife.print). People here are a function of the clock, not objects,
  // so each one's last print is kept by its key, and keys not seen for a
  // while are dropped.
  let _snowy = false;
  const _prints = new Map();      // pk -> { x, y, trail, foot, seen }
  let _printSweep = 0;
  const STRIDE = { walker: 4, dog: 3, jogger: 6, stroller: 4, bike: 5, guard: 4, tour: 4, shopper: 4, worker: 4 };
  function _print(pk, kind, x, y, horiz, dir, t) {
    let p = _prints.get(pk);
    if (!p) { _prints.set(pk, { x, y, trail: 0, foot: false, seen: t }); return; }
    const d = Math.hypot(x - p.x, y - p.y);
    p.x = x; p.y = y; p.seen = t;
    if (d > 20) { p.trail = 0; return; }            // a jump (back to the start of its run): no print across it
    p.trail += d;
    const stride = STRIDE[kind] || 4;
    if (p.trail < stride) return;
    p.trail -= stride;
    p.foot = !p.foot;
    if (FrostSystem.snowAt(x, y) <= 0.5) return;
    const ang = horiz ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    Wildlife.print(kind === 'bike' ? 'bike' : 'person', x, y, ang, p.foot);
  }

  // ── Depth order ───────────────────────────────────────────────────
  // People are queued as the runs are walked and drawn at the end of the
  // pass, back to front by where their feet are. Drawn in the order their
  // slots came up, someone further up the street could be painted over
  // someone standing in front of them. Records are pooled (this runs for up
  // to a thousand-odd figures a frame).
  const _q = [];
  let _qn = 0;
  // type: 0 person, 1 small person (sc = scale), 2 standing group (kind = group kind)
  function _enq(type, x, y, kind, dir, horiz, k, a, sc) {
    let r = _q[_qn];
    if (!r) r = _q[_qn] = {};
    _qn++;
    r.type = type; r.x = x; r.y = y; r.kind = kind; r.dir = dir; r.horiz = horiz; r.k = k; r.a = a; r.sc = sc;
  }
  const _byFeet = (p, q) => p.y - q.y || p.x - q.x;
  function _flush(ctx, base, t, dark, detail) {
    if (!_qn) return;
    const list = _q.slice(0, _qn).sort(_byFeet);
    for (const r of list) {
      if (r.type === 0) drawPerson(ctx, r.x, r.y, r.kind, r.dir, r.horiz, t, r.k, r.a, dark, detail);
      else if (r.type === 1) drawSmallPerson(ctx, base, r.x, r.y, r.sc, r.kind, r.dir, r.horiz, t, r.k, r.a, dark, detail);
      else _drawGroup(ctx, base, r.kind, r.x, r.y, r.horiz, r.k, t, r.a, dark, detail, r.sc);
    }
    _qn = 0;
  }

  function render(ctx, t, cStart, cEnd, rStart, rEnd) {
    if (typeof _zoneGroundPlan !== 'function' || typeof ZoneSystem === 'undefined') return;
    // Graphics quality (gfx_quality.js). Medium draws exactly what high does,
    // under a tighter per-frame figure budget (only reached with a very busy
    // city filling the screen). Low drops figures to their two-rect
    // silhouettes, thins them out and stops drawing them at a closer zoom.
    const lv = typeof GfxQuality !== 'undefined' ? GfxQuality.level() : 2;
    if (Camera.zoom < (lv === 0 ? 0.8 : 0.4)) return;
    const T = TILE;
    const detail = lv === 0 ? false : Camera.zoom > 0.7;
    _density = lv === 0 ? 0.4 : 1;
    _budget  = lv === 2 ? 1200 : lv === 1 ? 700 : 200;
    const hr = DayNight.hour();
    const dark = DayNight.darkness();
    _sampleWeather();
    _updateWeather(t);
    _snowy = typeof FrostSystem !== 'undefined' && FrostSystem.snowAt && FrostSystem.cover() > 0.05;
    if (t - _printSweep > 5) { _printSweep = t; for (const [k, p] of _prints) if (t - p.seen > 5) _prints.delete(k); }
    const base = ctx.getTransform();
    // The actual screen, plus room for a vehicle's length — not the entity
    // pass's six-tile overdraw ring (cStart..rEnd), where every figure drawn
    // was off screen.
    // screenToWorld takes CSS pixels; the canvas backing store is
    // RENDER_SCALE of those (render_core.js), so ask the window.
    const tl = Camera.screenToWorld(0, 0),
          br = Camera.screenToWorld(window.innerWidth, window.innerHeight);
    const vx0 = Math.max(cStart * T - T, tl.x - T), vx1 = Math.min((cEnd + 1) * T, br.x + T);
    const vy0 = Math.max(rStart * T - T, tl.y - T), vy1 = Math.min((rEnd + 1) * T, br.y + T);

    // Traffic between the zones first, so each zone's own figures draw over
    // whatever is just driving in off a connector road.
    _connectorTraffic(ctx, base, t, hr, dark, detail, vx0, vy0, vx1, vy1);

    for (let zi = 0; zi < ORDER.length; zi++) {
      const key = ORDER[zi];
      const Z = ZONES[key];
      const rects = ZoneSystem.getZoneRects(key);
      if (!rects || !rects.length) continue;
      if (_budget <= 0) break;
      const activity = Z.activity(hr);
      const wx = _hardy(key) ? 0.5 + 0.5 * _wx : _wx;
      const pedAct = activity * wx;
      _excludeLaterZones(zi, rects, vx0, vy0, vx1, vy1);
      for (const rect of rects) {
        if (_budget <= 0) break;
        if ((rect.maxC + 2) * T < vx0 || (rect.minC - 1) * T > vx1 || (rect.maxR + 2) * T < vy0 || (rect.minR - 1) * T > vy1) continue;
        const plan = _zoneGroundPlan(key, rect);
        if (Z.yard) _drawYard(ctx, base, plan, Z, activity, t, dark, detail, vx0, vy0, vx1, vy1);
        if (Z.vehicles > 0) _traffic(ctx, base, key, rect, plan, Z, activity, t, dark, detail, vx0, vy0, vx1, vy1);
        const runs = _runsFor(plan);
        for (const run of runs) {
          if (_budget <= 0) break;
          const lenT = run.b - run.a + 1;
          const D = lenT * T;
          const fixedMid = run.fixed * T + T / 2;
          // Tunnel portals at either end (see TunnelPortal in render_core.js):
          // traffic runs on past the road end into the tunnel instead of
          // fading out, and comes back out of it.
          const pA = _portalEnd(plan, run, false), pB = _portalEnd(plan, run, true);
          const ext = TunnelPortal.EXT;
          // run bounding box cull
          const lo = run.a * T - (pA ? ext : 0), hi = (run.b + 1) * T + (pB ? ext : 0);
          if (run.horiz) { if (fixedMid < vy0 || fixedMid > vy1 || hi < vx0 || lo > vx1) continue; }
          else           { if (fixedMid < vx0 || fixedMid > vx1 || hi < vy0 || lo > vy1) continue; }

          const at = (s, dir, across) => {
            const along = dir > 0 ? run.a * T + s : (run.b + 1) * T - s;
            return run.horiz ? [along, fixedMid + across] : [fixedMid + across, along];
          };
          const fade = (s) => Math.max(0, Math.min(1, s / 10, (D - s) / 10));

          // people standing about (at most one group per four tiles of run)
          if (Z.groups && detail && lenT >= 3) {
            const slots = Math.max(1, Math.floor(lenT / 4));
            for (let j = 0; j < slots && _budget > 0; j++) {
              const gs = run.id * 131 + j * 17;
              const gkind = pickKind(Z.groupKinds, _hash(gs, 20));
              // How long a group stays: a vendor's pitch the best part of an
              // hour of game clock, a chat a minute or so.
              const P = (gkind === 'vendor' ? 300 : 45) + _hash(gs, 21) * 40;
              const tt = t + _hash(gs, 22) * P;
              const n = Math.floor(tt / P), u = tt / P - n;
              const gk = gs * 977 + n;
              if (_hash(gk, 23) > Z.groups * activity * wx * wx) continue;
              const ga = Math.max(0, Math.min(1, u * P / 2.5, (1 - u) * P / 2.5));
              if (ga <= 0) continue;
              const s = (j + 0.2 + 0.6 * _hash(gk, 24)) / slots * D;
              let across;
              if (Z.pedOffset) across = (_hash(gk, 25) < 0.5 ? -1 : 1) * (Z.pedOffset + 1);
              else across = (_hash(gk, 25) - 0.5) * Math.max(0, Z.band * 2 - 10);
              const [gx, gy] = at(s, 1, across);
              if (gx < vx0 || gx > vx1 || gy < vy0 || gy > vy1) continue;
              if (_excl.length && _inExcl(gx, gy)) continue;
              _budget -= 3;
              _enq(2, gx, gy + 3, gkind, 0, run.horiz, gk, ga, Z);
            }
          }

          // people
          const pedMax = Math.floor(lenT * Z.peds + _hash(run.id, 7));
          for (let i = 0; i < pedMax; i++) {
            const pk = run.id * 53 + i;
            const kind = pickKind(Z.pedKinds, _hash(pk, 2));
            // Guards keep their rounds whatever the weather. Anyone near the
            // cut-off fades as it moves (weather turning, the hour changing).
            if (_density < 1 && _hash(pk, 9) > _density) continue;
            const speed = kind === 'bike' ? 26 : kind === 'jogger' ? 18 : kind === 'scooter' ? 15 : kind === 'guard' || kind === 'tour' ? 7 : 9 + _hash(pk, 4) * 5;
            // A tour is a guide and a line of tourists trailing behind, so it
            // runs on past the end of the run until the last of them is off.
            const tail = kind === 'tour' ? (3 + Math.floor(_hash(pk, 17) * 4)) * 6.5 : 0;
            const lapF = (t * speed) / (D + tail) + _hash(pk, 5), lap = Math.floor(lapF);
            const s = (lapF - lap) * (D + tail);
            // Each pass along the run is someone new: the slot keeps its kind
            // and pace, but who it is, which way they walk, which side they
            // keep to and whether they're out at all are rolled again every
            // lap. A slot used to be one fixed person forever, so a short run
            // showed the same two people walking past each other all night.
            const pid = (Math.imul(pk, 7919) + lap * 104729) | 0;
            const out = kind === 'guard' ? activity : pedAct, hk = _hash(pid, 1);
            const wa = _pedAlpha(pk * 4 + zi, hk <= out, t);
            if (wa <= 0) continue;
            const dir = _hash(pid, 3) < 0.5 ? 1 : -1;
            const a = fade(s) * wa;
            if (a <= 0 && !tail) continue;
            // Everyone keeps to the right of the way they are heading, so
            // people going opposite ways pass beside each other rather than
            // through each other. Right of a heading (x, y) is (-y, x): +y on
            // a horizontal run walked +x, -x on a vertical one walked +y.
            // Where each walk is wide enough, a person's line within their
            // half is rolled too, which spreads out the overtaking.
            const right = run.horiz ? dir : -dir;
            let across;
            if (Z.pedOffset) across = (_hash(pid, 6) < 0.5 ? -1 : 1) * (Z.pedOffset + 1) + right * (0.8 + _hash(pid, 8) * 1.2);
            else across = right * (1.2 + _hash(pid, 6) * Math.max(0, Z.band - 3.7));
            const [x, y] = at(Math.min(s, D), dir, across);
            if (x < vx0 - tail || x > vx1 + tail || y < vy0 - tail || y > vy1 + tail) continue;
            if (!tail && _excl.length && _inExcl(x, y)) continue;
            if (--_budget < 0) break;
            if (kind === 'scooter') { _enq(1, x, y + 3, kind, dir, run.horiz, pid, a, 0.75); continue; }
            if (tail) {
              for (let m = Math.round(tail / 6.5); m >= 0; m--) {
                const sm = s - m * 6.5;
                const am = fade(sm) * wa;
                if (am <= 0 || (m && --_budget < 0)) continue;
                const [mx, my] = at(sm, dir, across + (m ? (_hash(pid + m, 18) - 0.5) * 5 : 0));
                if (_excl.length && _inExcl(mx, my)) continue;
                _enq(0, mx, my + 3, m ? 'tourist' : 'guide', dir, run.horiz, pid * 11 + m, am);
              }
              continue;
            }
            if (_snowy && typeof Wildlife !== 'undefined' && kind !== 'scooter') _print(pk, kind, x, y + 3, run.horiz, dir, t);
            _enq(0, x, y + 3, kind, dir, run.horiz, pid, a);
          }
        }
      }
    }
    _flush(ctx, base, t, dark, detail);
    _excl.length = 0;
    ctx.globalAlpha = 1;
  }

  // ── Traffic on built roads ────────────────────────────────────────
  // Cars, vans, buses and lorries running between the zones on the roads
  // the player lays (T.ROAD, 6×6 tiles). Collinear roads that touch or
  // overlap are joined into one straight run; each run is driven as a loop —
  // down one lane, a U-turn inside the road at the far end, back up the
  // other lane (right-hand traffic) and round again — so vehicles never pop
  // in or out mid-road. Like the zone streets it's a pure function of the
  // render clock: every vehicle on a run shares one speed and is evenly
  // spaced around the loop, so they never run into each other. Vehicles
  // step aside (fade out) where one of the player's trucks is on the road.
  const ROAD_SCALE = 4;               // zone-street vehicles are ~¼ truck size
  const ROAD_MIN_TILES = 12;          // a lone 6×6 tile gets no traffic
  const ROAD_GAP = 3.6 * TILE;        // spacing between vehicles on a loop
  const ROAD_KINDS = [['car', 0.44], ['taxi', 0.08], ['van', 0.13], ['bus', 0.07], ['semi', 0.1], ['suv', 0.1], ['pickup', 0.05], ['tanker', 0.02], ['flatbed', 0.01]];
  const roadActivity = (hr) =>
    (hr >= 7 && hr < 9.5) || (hr >= 16 && hr < 19) ? 1 :
    hr >= 9.5 && hr < 16 ? 0.7 :
    (hr >= 19 && hr < 23) || (hr >= 5.5 && hr < 7) ? 0.45 : 0.12;

  let _roadSig = null, _roadRuns = [];
  const _truckType = () => T.TRUCK;   // (renderRoads shadows T with TILE)

  function _roadRunsNow() {
    const roads = EntityRegistry.getByType(T.ROAD);
    let sig = roads.length;
    for (const r of roads) sig = (Math.imul(sig, 31) + r.col * 7919 + r.row * 104729 + ((r._rotation || 0) & 1) * 13 + (r.width || 6) + (r._bridge ? 7 : 0) + (r._irreparable ? 17 : 0)) | 0;
    if (sig === _roadSig) return _roadRuns;
    _roadSig = sig;
    // Group by axis and cross position; merge runs that touch or overlap.
    const groups = new Map();
    for (const r of roads) {
      // Bridges carry the player's trucks, not ambient city traffic, and
      // nothing drives a road a nuclear blast has wrecked.
      if (r._bridge || r._irreparable) continue;
      const horiz = ((r._rotation || 0) % 2) === 1;
      const w = r.width || 6, h = r.height || 6;
      const key = horiz ? `h${r.row},${h}` : `v${r.col},${w}`;
      let g = groups.get(key);
      if (!g) groups.set(key, g = { horiz, fixed: horiz ? r.row : r.col, span: horiz ? h : w, segs: [] });
      g.segs.push(horiz ? [r.col, r.col + w - 1] : [r.row, r.row + h - 1]);
    }
    const runs = [];
    for (const g of groups.values()) {
      g.segs.sort((p, q) => p[0] - q[0]);
      let [a, b] = g.segs[0];
      const flush = () => {
        if (b - a + 1 < ROAD_MIN_TILES) return;
        const T = TILE;
        const mid = g.fixed * T + g.span * T / 2;          // road centre line
        const R = T;                                        // lanes sit ±1 tile off centre
        const yA = a * T + 1.8 * T, yB = (b + 1) * T - 1.8 * T;
        const S = yB - yA;
        const P = 2 * S + 2 * Math.PI * R;
        runs.push({ horiz: g.horiz, a, b, mid, R, yA, yB, S, P, sgn: g.horiz ? 1 : -1,
                    id: (g.horiz ? 1 : 2) * 1000003 + g.fixed * 8191 + a * 131 });
      };
      for (let i = 1; i < g.segs.length; i++) {
        const [c, d] = g.segs[i];
        if (c <= b + 1) b = Math.max(b, d);
        else { flush(); a = c; b = d; }
      }
      flush();
    }
    return (_roadRuns = runs);
  }

  // Point u (0..P) round a run's loop, in world px. Along the run's axis the
  // loop goes yA → yB in the +sgn lane, U-turns, and comes back in the other.
  function _roadPoint(run, u) {
    const { yA, yB, S, R, sgn } = run;
    const turn = Math.PI * R;
    let al, q;
    if (u < S)                 { al = yA + u; q = sgn * R; }
    else if (u < S + turn)     { const f = (u - S) / R;            al = yB + R * Math.sin(f); q = sgn * R * Math.cos(f); }
    else if (u < 2 * S + turn) { al = yB - (u - S - turn);        q = -sgn * R; }
    else                       { const f = (u - 2 * S - turn) / R; al = yA - R * Math.sin(f); q = -sgn * R * Math.cos(f); }
    return run.horiz ? [al, run.mid + q] : [run.mid + q, al];
  }

  function renderRoads(ctx, t, cStart, cEnd, rStart, rEnd) {
    if (typeof EntityRegistry === 'undefined') return;
    const lv = typeof GfxQuality !== 'undefined' ? GfxQuality.level() : 2;
    if (Camera.zoom < (lv === 0 ? 0.5 : 0.25)) return;
    const runs = _roadRunsNow();
    if (!runs.length) return;
    const T = TILE;
    const detail = lv === 0 ? false : Camera.zoom > 0.35;
    const density = lv === 0 ? 0.5 : 1;
    let budget = lv === 2 ? 400 : lv === 1 ? 250 : 80;
    _updateWeather(t);
    const activity = roadActivity(DayNight.hour()) * _wxCar;
    const dark = DayNight.darkness();
    _sampleWeather();
    const base = ctx.getTransform();
    const tl = Camera.screenToWorld(0, 0),
          br = Camera.screenToWorld(window.innerWidth, window.innerHeight);
    const m = 2 * T;
    const vx0 = Math.max(cStart * T, tl.x) - m, vx1 = Math.min((cEnd + 1) * T, br.x) + m;
    const vy0 = Math.max(rStart * T, tl.y) - m, vy1 = Math.min((rEnd + 1) * T, br.y) + m;

    // The player's trucks on screen — ambient traffic gives way to them.
    const trucks = [];
    for (const k of EntityRegistry.getByType(_truckType())) {
      const cx = (k._wx !== undefined ? k._wx : k.col * T) + T / 2;
      const cy = (k._wy !== undefined ? k._wy : k.row * T) + T * 1.5;
      if (cx > vx0 - m && cx < vx1 + m && cy > vy0 - m && cy < vy1 + m) trucks.push(cx, cy);
    }

    for (const run of runs) {
      if (budget <= 0) break;
      const lo = run.a * T, hi = (run.b + 1) * T;
      const f0 = run.mid - 3 * T, f1 = run.mid + 3 * T;
      if (run.horiz) { if (hi < vx0 || lo > vx1 || f1 < vy0 || f0 > vy1) continue; }
      else           { if (hi < vy0 || lo > vy1 || f1 < vx0 || f0 > vx1) continue; }
      const n = Math.max(1, Math.floor(run.P / ROAD_GAP));
      const speed = 70 + _hash(run.id, 1) * 30;
      const off = _hash(run.id, 2) * run.P;
      for (let j = 0; j < n; j++) {
        const vk = run.id * 37 + j;
        const hv = _hash(vk, 3);
        if (hv > activity * density) continue;
        const u = (t * speed + off + (j * run.P) / n) % run.P;
        const [x, y] = _roadPoint(run, u);
        if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
        // near the cut-off, fade (the hour or the weather turning) rather than pop
        let a = Math.min(1, (activity * density - hv) / 0.06);
        for (let i = 0; i < trucks.length; i += 2) {
          const d = Math.hypot(trucks[i] - x, trucks[i + 1] - y);
          if (d < 2.4 * T) a = Math.min(a, Math.max(0, (d - 1.4 * T) / T));
        }
        if (a <= 0) continue;
        if (--budget < 0) break;
        const [x2, y2] = _roadPoint(run, (u + 2) % run.P);
        drawVehicle(ctx, base, x, y, pickKind(ROAD_KINDS, _hash(vk, 4)), Math.atan2(y2 - y, x2 - x), vk, t, a, dark, detail, ROAD_SCALE);
      }
    }
    ctx.globalAlpha = 1;
  }

  // _dev: the figure painters, for drawing them on their own from the console.
  return { render, renderRoads, drawVehicle, drawPerson, drawSmallPerson, drawGroup: _drawGroup, VEH,
    rain: () => _rain, cold: () => _cold, pool: _pool,
    _dev: { drawPerson, drawSmallPerson, drawGroup: _drawGroup, drawMachine: _drawMachine, ZONES, setRain: (r) => { _rain = r; } } };
})();
