/* ═══════════════════════════════════════════════════════════════════
   CITY INFO
   Player-chosen city name and power company name, set once via the
   naming modal at New Game (see MenuSystem's citynaming-modal wiring)
   and displayed in the topbar subtitle for the rest of the session.
   ═══════════════════════════════════════════════════════════════════ */

const CityInfo = (() => {
  const DEFAULT_CITY    = 'New Haven';
  const DEFAULT_COMPANY = 'Gridworks Power Co.';

  let cityName    = DEFAULT_CITY;
  let companyName = DEFAULT_COMPANY;
  let flag        = 'gridline';
  let hallStyle   = 'beaux';

  // Civic identity picked at New Game. The flag flies from every City Hall;
  // the hall style picks City Hall's architecture (see renderGovBuilding).
  const FLAGS = [
    { id: 'gridline',  name: 'Gridline' },
    { id: 'voltage',   name: 'Circuit' },
    { id: 'sunrise',   name: 'Turbine' },
    { id: 'nordic',    name: 'Tidewater' },
    { id: 'peaks',     name: 'Keystone' },
    { id: 'storm',     name: 'Stormfront' },
    { id: 'isotope',   name: 'Isotope' },
    { id: 'harbor',    name: 'Harbor' },
    { id: 'solstice',  name: 'Solstice' },
    { id: 'evergreen', name: 'Evergreen' },
    { id: 'aurora',    name: 'Aurora' },
    { id: 'mesa',      name: 'Mesa' },
    { id: 'foundry',   name: 'Foundry' },
    { id: 'beacon',    name: 'Beacon' },
    { id: 'stargazer', name: 'Stargazer' },
    { id: 'harvest',   name: 'Harvest' },
    { id: 'junction',  name: 'Junction' },
    { id: 'ember',     name: 'Ember' },
    { id: 'kite',      name: 'Kite' },
    { id: 'span',      name: 'Span' },
  ];
  // Retired flag ids, and the flag a save that picked one flies instead.
  const RETIRED_FLAGS = { kake: 'gridline' };
  const HALLS = [
    { id: 'beaux',     name: 'Beaux-Arts',  desc: 'Limestone, columns, verdigris dome' },
    { id: 'gothic',    name: 'Gothic',      desc: 'Dark stone and a soaring spire' },
    { id: 'deco',      name: 'Art Deco',    desc: 'Cream and gold, stepped tower' },
    { id: 'byzantine', name: 'Byzantine',   desc: 'Sandstone under a gilded onion dome' },
    { id: 'modern',    name: 'Modernist',   desc: 'Concrete, glass and a radio mast' },
    { id: 'colonial',  name: 'Colonial',    desc: 'Red brick, white columns and a cupola' },
    { id: 'chateau',   name: 'Château',     desc: 'Pale stone, slate roofs and corner turrets' },
    { id: 'pagoda',    name: 'Pagoda',      desc: 'Red lacquer, lattice screens and tiered eaves' },
    { id: 'mission',   name: 'Mission',     desc: 'White stucco, clay tile and a bell tower' },
    { id: 'solarpunk', name: 'Solarpunk',   desc: 'Timber, green roofs and its own wind turbine' },
    { id: 'tudor',     name: 'Tudor',       desc: 'Half-timbered plaster under steep tiled gables' },
    { id: 'brutalist', name: 'Brutalist',   desc: 'Raw concrete cantilevered over a sunken plaza' },
    { id: 'stave',     name: 'Stave',       desc: 'Tarred timber, shingle tiers and dragon-head eaves' },
    { id: 'prairie',   name: 'Prairie',     desc: 'Long low brick with deep overhanging eaves' },
    { id: 'atomic',    name: 'Atomic Age',  desc: 'White curves, a butterfly roof and a flying saucer' },
  ];

  // Paint flag `id` into the rect (x, y, w, h) on `c`. The caller may have
  // already clipped to a waving outline; this just fills the design.
  function drawFlag(c, id, x, y, w, h) {
    const R = (fx, fy, fw, fh, col) => { c.fillStyle = col; c.fillRect(x + fx*w, y + fy*h, fw*w, fh*h); };
    const P = (pts, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(x + pts[0][0]*w, y + pts[0][1]*h); for (let i = 1; i < pts.length; i++) c.lineTo(x + pts[i][0]*w, y + pts[i][1]*h); c.closePath(); c.fill(); };
    const C = (cx, cy, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x + cx*w, y + cy*h, r*h, 0, Math.PI*2); c.fill(); };
    // Stroked polyline; `lw` is a fraction of the flag's height.
    const L = (pts, col, lw) => {
      c.strokeStyle = col; c.lineWidth = Math.max(1, lw*h); c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(x + pts[0][0]*w, y + pts[0][1]*h);
      for (let i = 1; i < pts.length; i++) c.lineTo(x + pts[i][0]*w, y + pts[i][1]*h);
      c.stroke(); c.lineCap = 'butt'; c.lineJoin = 'miter';
    };
    // Star / gear / rose: `n` points alternating between radii ro and ri
    // (fractions of the height, so it stays round on the 5:3 cloth).
    const S = (cx, cy, n, ro, ri, rot, col) => {
      const pts = [];
      for (let k = 0; k < n*2; k++) {
        const a = rot + k*Math.PI/n, r = k % 2 ? ri : ro;
        pts.push([cx + Math.cos(a)*r*h/w, cy + Math.sin(a)*r]);
      }
      P(pts, col);
    };
    switch (id) {
      case 'gridline': {
        // Gridline: a white transmission pylon carrying gold lines across a
        // deep blue field, the ground falling away below it
        R(0, 0, 1, 1, '#14325c');
        R(0, 0.7, 1, 0.3, '#0d2240');
        for (const ay of [0.28, 0.44]) {
          L([[0, ay + 0.08], [0.2, ay + 0.11], [0.39, ay]], '#f2c14e', 0.025);
          L([[0.61, ay], [0.8, ay + 0.11], [1, ay + 0.08]], '#f2c14e', 0.025);
        }
        const W_ = '#f4f1ea';
        L([[0.42, 0.9], [0.485, 0.14]], W_, 0.04);
        L([[0.58, 0.9], [0.515, 0.14]], W_, 0.04);
        L([[0.39, 0.28], [0.61, 0.28]], W_, 0.04);
        L([[0.4, 0.44], [0.6, 0.44]], W_, 0.04);
        L([[0.465, 0.36], [0.535, 0.44], [0.455, 0.56], [0.545, 0.68], [0.44, 0.82]], W_, 0.025);
        L([[0.535, 0.36], [0.465, 0.44], [0.545, 0.56], [0.455, 0.68], [0.56, 0.82]], W_, 0.025);
        for (const [nx, ny] of [[0.39, 0.28], [0.61, 0.28], [0.4, 0.44], [0.6, 0.44]]) C(nx, ny + 0.03, 0.03, '#f2c14e');
        break;
      }
      case 'aurora': {
        // Aurora: green and violet curtains of light over snowy hills
        R(0, 0, 1, 1, '#0b1a2a');
        const ribbon = (y0, amp, th, col) => {
          c.fillStyle = col; c.beginPath();
          for (let i = 0; i <= 24; i++) { const fx = i/24; c.lineTo(x + fx*w, y + (y0 + Math.sin(fx*Math.PI*2 + y0*9)*amp)*h); }
          for (let i = 24; i >= 0; i--) { const fx = i/24; c.lineTo(x + fx*w, y + (y0 + th + Math.sin(fx*Math.PI*2 + y0*9 + 0.6)*amp)*h); }
          c.closePath(); c.fill();
        };
        ribbon(0.18, 0.08, 0.12, 'rgba(122,92,255,0.75)');
        ribbon(0.34, 0.09, 0.16, 'rgba(61,220,151,0.85)');
        ribbon(0.5, 0.06, 0.06, 'rgba(61,220,151,0.45)');
        for (const [sx, sy] of [[0.1, 0.12], [0.3, 0.08], [0.62, 0.1], [0.86, 0.16], [0.92, 0.42], [0.08, 0.48]]) C(sx, sy, 0.018, '#f4f1ea');
        P([[0, 1], [0, 0.84], [0.28, 0.72], [0.52, 0.86], [0.78, 0.74], [1, 0.82], [1, 1]], '#e8eef4');
        P([[0, 1], [0, 0.94], [0.4, 0.86], [0.7, 0.95], [1, 0.9], [1, 1]], '#b8c8d8');
        break;
      }
      case 'mesa': {
        // Mesa: a flat-topped butte against a desert sky, banded earth below
        R(0, 0, 1, 1, '#f2c38a');
        C(0.8, 0.24, 0.12, '#fff1c9');
        P([[0.1, 0.56], [0.17, 0.3], [0.46, 0.3], [0.53, 0.56]], '#8a3a24');
        P([[0.6, 0.56], [0.65, 0.4], [0.76, 0.4], [0.81, 0.56]], '#a8452a');
        R(0, 0.56, 1, 0.15, '#d9773c');
        R(0, 0.71, 1, 0.15, '#a8452a');
        R(0, 0.86, 1, 0.14, '#6e2a1e');
        break;
      }
      case 'foundry': {
        // Foundry: an orange cog on iron grey between molten bars
        R(0, 0, 1, 1, '#2b2f36');
        R(0, 0, 1, 0.12, '#e8742a'); R(0, 0.88, 1, 0.12, '#e8742a');
        S(0.5, 0.5, 10, 0.32, 0.25, 0, '#e8742a');
        C(0.5, 0.5, 0.18, '#2b2f36');
        C(0.5, 0.5, 0.08, '#f2c14e');
        break;
      }
      case 'beacon': {
        // Beacon: a striped lighthouse throwing two beams across a night sea
        R(0, 0, 1, 1, '#16233d');
        R(0, 0.78, 1, 0.22, '#0e4a5c');
        P([[0.3, 0.3], [1, 0.08], [1, 0.3]], 'rgba(255,226,140,0.55)');
        P([[0.3, 0.3], [0, 0.16], [0, 0.34]], 'rgba(255,226,140,0.4)');
        P([[0.25, 0.82], [0.27, 0.34], [0.33, 0.34], [0.35, 0.82]], '#f4f1ea');
        for (const by of [0.44, 0.6, 0.74]) P([[0.27 - (by - 0.34)*0.04, by], [0.33 + (by - 0.34)*0.04, by], [0.33 + (by + 0.06 - 0.34)*0.04, by + 0.06], [0.27 - (by + 0.06 - 0.34)*0.04, by + 0.06]], '#c8323a');
        R(0.265, 0.25, 0.07, 0.09, '#ffe28c');
        P([[0.25, 0.26], [0.3, 0.17], [0.35, 0.26]], '#c8323a');
        P([[0.18, 0.86], [0.42, 0.86], [0.38, 0.8], [0.22, 0.8]], '#2a3440');
        break;
      }
      case 'stargazer': {
        // Stargazer: an observatory dome, slit open, under a speckled indigo sky
        R(0, 0, 1, 1, '#241a4a');
        for (const [sx, sy, r] of [[0.1, 0.15, 0.02], [0.22, 0.4, 0.014], [0.36, 0.12, 0.016], [0.52, 0.28, 0.02], [0.7, 0.1, 0.014], [0.86, 0.3, 0.02], [0.92, 0.12, 0.012], [0.62, 0.46, 0.012], [0.14, 0.6, 0.012]]) C(sx, sy, r, '#f4ecd0');
        P([[0, 1], [0, 0.82], [0.3, 0.78], [0.7, 0.8], [1, 0.76], [1, 1]], '#3a8a6a');
        R(0.54, 0.62, 0.24, 0.18, '#d8dce4');
        c.fillStyle = '#eef0f4'; c.beginPath(); c.ellipse(x + 0.66*w, y + 0.62*h, 0.12*w, 0.2*h, 0, Math.PI, 0); c.fill();
        P([[0.645, 0.62], [0.655, 0.43], [0.675, 0.43], [0.685, 0.62]], '#241a4a');
        L([[0.665, 0.5], [0.6, 0.3]], '#9aa4b4', 0.04);
        break;
      }
      case 'harvest': {
        // Harvest: a sheaf of wheat on gold over a green field
        R(0, 0, 1, 1, '#e8b93a');
        R(0, 0.84, 1, 0.16, '#5a7a2e');
        const ink = '#6b4518';
        for (const a of [-0.38, 0, 0.38]) {
          const bx = 0.5, by = 0.86, len = 0.7;
          const tx = bx + Math.sin(a)*len*h/w, ty = by - Math.cos(a)*len;
          L([[bx, by], [tx, ty]], ink, 0.025);
          for (let g = 0; g < 4; g++) {
            const f = 0.62 + g*0.11, gx = bx + (tx - bx)*f, gy = by + (ty - by)*f;
            for (const s of [-1, 1]) {
              c.fillStyle = ink; c.beginPath();
              c.ellipse(x + gx*w + s*Math.cos(a)*h*0.035, y + gy*h + s*Math.sin(a)*h*0.035, h*0.028, h*0.055, a + s*0.5, 0, Math.PI*2);
              c.fill();
            }
          }
        }
        R(0.44, 0.6, 0.12, 0.05, '#c8323a');   // the binding
        break;
      }
      case 'junction': {
        // Junction: three roads meeting at a roundabout, on slate
        R(0, 0, 1, 1, '#2f4a52');
        for (const a of [Math.PI*0.88, -Math.PI*0.28, Math.PI*0.36]) L([[0.5 + Math.cos(a)*0.2*h/w, 0.5 + Math.sin(a)*0.2], [0.5 + Math.cos(a)*1.2*h/w, 0.5 + Math.sin(a)*1.2]], '#f0a63a', 0.13);
        C(0.5, 0.5, 0.25, '#f0a63a');
        C(0.5, 0.5, 0.15, '#2f4a52');
        C(0.5, 0.5, 0.08, '#7ab87a');
        break;
      }
      case 'ember': {
        // Ember: a smouldering volcano on black, sparks rising
        R(0, 0, 1, 1, '#1a1414');
        P([[0.12, 0.92], [0.4, 0.4], [0.6, 0.4], [0.88, 0.92]], '#3a2a26');
        R(0, 0.9, 1, 0.1, '#3a2a26');
        P([[0.4, 0.4], [0.5, 0.48], [0.6, 0.4]], '#ff7a1a');
        L([[0.48, 0.46], [0.44, 0.6], [0.46, 0.72], [0.4, 0.88]], '#e8452a', 0.035);
        L([[0.54, 0.46], [0.58, 0.62], [0.62, 0.8]], '#e8452a', 0.03);
        for (const [sx, sy, r] of [[0.5, 0.3, 0.035], [0.44, 0.2, 0.025], [0.57, 0.16, 0.03], [0.5, 0.07, 0.02], [0.64, 0.28, 0.02]]) C(sx, sy, r, '#ffb03a');
        break;
      }
      case 'kite': {
        // Kite: a red diamond kite and its bowed tail on a cloud-flecked sky
        R(0, 0, 1, 1, '#7ec4e8');
        for (const [cx, cy, r] of [[0.12, 0.78, 0.09], [0.2, 0.74, 0.11], [0.29, 0.8, 0.08], [0.78, 0.86, 0.08], [0.86, 0.82, 0.1]]) C(cx, cy, r, '#f4f8fb');
        L([[0.62, 0.52], [0.54, 0.62], [0.6, 0.72], [0.5, 0.82], [0.56, 0.94]], '#3a4a5a', 0.015);
        for (const [bx, by] of [[0.555, 0.62], [0.575, 0.74], [0.515, 0.84]]) P([[bx - 0.02, by - 0.03], [bx + 0.02, by + 0.03], [bx + 0.02, by - 0.03], [bx - 0.02, by + 0.03]], '#f2c14e');
        P([[0.68, 0.1], [0.78, 0.3], [0.68, 0.54], [0.58, 0.3]], '#d8402e');
        P([[0.68, 0.1], [0.78, 0.3], [0.68, 0.3]], '#f06a4a');
        P([[0.58, 0.3], [0.68, 0.3], [0.68, 0.54]], '#b0301e');
        L([[0.68, 0.1], [0.68, 0.54]], '#5a2a1a', 0.012);
        L([[0.58, 0.3], [0.78, 0.3]], '#5a2a1a', 0.012);
        break;
      }
      case 'span': {
        // Span: a suspension bridge between two towers over the water
        R(0, 0, 1, 1, '#f2d6a2');
        R(0, 0.7, 1, 0.3, '#2a6f8a');
        for (const wy of [0.8, 0.9]) L([[0.1, wy], [0.25, wy], [0.4, wy]], 'rgba(255,255,255,0.35)', 0.02);
        const T_ = '#3a3e4a';
        for (const tx of [0.3, 0.7]) { R(tx - 0.025, 0.2, 0.05, 0.56, T_); R(tx - 0.035, 0.34, 0.07, 0.03, T_); }
        c.strokeStyle = T_; c.lineWidth = Math.max(1, h*0.025);
        c.beginPath(); c.moveTo(x, y + 0.42*h);
        c.quadraticCurveTo(x + 0.15*w, y + 0.28*h, x + 0.3*w, y + 0.22*h);
        c.quadraticCurveTo(x + 0.5*w, y + 0.62*h, x + 0.7*w, y + 0.22*h);
        c.quadraticCurveTo(x + 0.85*w, y + 0.28*h, x + w, y + 0.42*h);
        c.stroke();
        c.lineWidth = Math.max(1, h*0.01);
        for (let k = 1; k < 10; k++) { const fx = 0.3 + k*0.04, dip = 0.22 + 0.4*(1 - Math.pow((fx - 0.5)/0.2, 2))*0.5; c.beginPath(); c.moveTo(x + fx*w, y + dip*h); c.lineTo(x + fx*w, y + 0.6*h); c.stroke(); }
        R(0, 0.6, 1, 0.05, '#c8323a');
        break;
      }
      case 'voltage': {
        // Circuit: a traced conductor path with solder nodes, split diagonally
        R(0, 0, 1, 1, '#0f3b3a');
        P([[0.62, 0], [1, 0], [1, 1], [0.38, 1]], '#15504c');
        c.strokeStyle = '#e6b84a'; c.lineWidth = Math.max(1, h*0.07); c.lineJoin = 'round';
        const path = [[0, 0.72], [0.22, 0.72], [0.34, 0.5], [0.58, 0.5], [0.7, 0.28], [1, 0.28]];
        c.beginPath(); c.moveTo(x + path[0][0]*w, y + path[0][1]*h);
        for (let i = 1; i < path.length; i++) c.lineTo(x + path[i][0]*w, y + path[i][1]*h);
        c.stroke();
        c.lineWidth = Math.max(1, h*0.035);
        c.beginPath(); c.moveTo(x + 0.46*w, y + 0.5*h); c.lineTo(x + 0.46*w, y + 0.84*h); c.lineTo(x + 0.7*w, y + 0.84*h); c.stroke();
        for (const [nx, ny, r] of [[0.22, 0.72, 0.07], [0.58, 0.5, 0.07], [0.7, 0.84, 0.05], [0.7, 0.28, 0.07]]) {
          C(nx, ny, r, '#e6b84a'); C(nx, ny, r*0.45, '#0f3b3a');
        }
        break;
      }
      case 'sunrise': {
        // Turbine: offset rotor rings with swept blades on a plum field
        R(0, 0, 1, 1, '#3b1f3f');
        R(0, 0.86, 1, 0.14, '#e07a3a');
        C(0.36, 0.46, 0.4, '#e07a3a');
        C(0.36, 0.46, 0.32, '#3b1f3f');
        for (let k = 0; k < 5; k++) {
          const a = k*Math.PI*2/5, cx = x + 0.36*w, cy = y + 0.46*h, r = h*0.28;
          c.fillStyle = '#f4dcb0'; c.beginPath(); c.moveTo(cx, cy);
          c.quadraticCurveTo(cx + Math.cos(a + 0.9)*r*0.8, cy + Math.sin(a + 0.9)*r*0.8, cx + Math.cos(a + 0.3)*r, cy + Math.sin(a + 0.3)*r);
          c.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r); c.closePath(); c.fill();
        }
        C(0.36, 0.46, 0.07, '#e07a3a');
        R(0.8, 0.14, 0.05, 0.6, '#f4dcb0'); R(0.88, 0.14, 0.05, 0.6, '#e07a3a');
        break;
      }
      case 'nordic': {
        // Tidewater: stacked swell bands with a hoist hexagon
        const band = (y0, amp, col) => {
          c.fillStyle = col; c.beginPath(); c.moveTo(x, y + h);
          for (let i = 0; i <= 24; i++) { const fx = i/24; c.lineTo(x + fx*w, y + (y0 + Math.sin(fx*Math.PI*3)*amp)*h); }
          c.lineTo(x + w, y + h); c.closePath(); c.fill();
        };
        R(0, 0, 1, 1, '#e9dfc4');
        band(0.38, 0.05, '#2f8f9d');
        band(0.6, 0.05, '#1b4d6b');
        band(0.8, 0.04, '#0e2a40');
        const hx = [];
        for (let k = 0; k < 6; k++) { const a = Math.PI/6 + k*Math.PI/3; hx.push([0.2 + Math.cos(a)*0.2*h/w, 0.5 + Math.sin(a)*0.2]); }
        P(hx, '#c9463d');
        const hx2 = hx.map(([px, py]) => [0.2 + (px - 0.2)*0.55, 0.5 + (py - 0.5)*0.55]);
        P(hx2, '#e9dfc4');
        break;
      }
      case 'storm': {
        // Stormfront: a lightning bolt splitting a night-blue field
        R(0, 0, 1, 1, '#16213e');
        P([[0, 0.86], [0.18, 1], [0, 1]], '#0e1629');
        P([[0.6, 0.02], [0.3, 0.56], [0.47, 0.56], [0.35, 0.98], [0.73, 0.4], [0.55, 0.4], [0.7, 0.02]], '#f5c518');
        for (const [sx, sy, r] of [[0.15, 0.22, 0.06], [0.85, 0.78, 0.06], [0.15, 0.78, 0.04], [0.85, 0.22, 0.04]]) C(sx, sy, r, '#f4f1ea');
        break;
      }
      case 'isotope': {
        // Isotope: a glowing green atom on charcoal between hazard-yellow bars
        R(0, 0, 1, 1, '#1c2327');
        R(0, 0, 1, 0.14, '#f2c200'); R(0, 0.86, 1, 0.14, '#f2c200');
        c.strokeStyle = '#5dff9a'; c.lineWidth = Math.max(1, h*0.045);
        for (const a of [0, Math.PI/3, -Math.PI/3]) {
          c.beginPath(); c.ellipse(x + 0.5*w, y + 0.5*h, h*0.3, h*0.11, a, 0, Math.PI*2); c.stroke();
        }
        C(0.5, 0.5, 0.07, '#f2c200');
        break;
      }
      case 'harbor': {
        // Harbor: a gold anchor over deep teal, a wave along the foot
        R(0, 0, 1, 1, '#0d4f5c');
        c.fillStyle = '#f4f1ea'; c.beginPath(); c.moveTo(x, y + h);
        for (let i = 0; i <= 24; i++) { const fx = i/24; c.lineTo(x + fx*w, y + (0.84 + Math.sin(fx*Math.PI*4)*0.03)*h); }
        c.lineTo(x + w, y + h); c.closePath(); c.fill();
        c.strokeStyle = '#e0b040'; c.lineWidth = Math.max(1, h*0.06); c.lineCap = 'round';
        const ax = x + 0.5*w;
        c.beginPath(); c.moveTo(ax, y + 0.25*h); c.lineTo(ax, y + 0.74*h); c.stroke();
        c.beginPath(); c.moveTo(ax - h*0.12, y + 0.33*h); c.lineTo(ax + h*0.12, y + 0.33*h); c.stroke();
        c.beginPath(); c.arc(ax, y + 0.19*h, h*0.055, 0, Math.PI*2); c.stroke();
        c.beginPath(); c.arc(ax, y + 0.5*h, h*0.24, Math.PI*0.2, Math.PI*0.8); c.stroke();
        c.lineCap = 'butt';
        break;
      }
      case 'solstice': {
        // Solstice: a midsummer sun sinking into the sea at the fly, banded dusk sky
        R(0, 0, 1, 1, '#5a3a7a');
        R(0, 0.22, 1, 0.18, '#a8486a');
        R(0, 0.4, 1, 0.24, '#e8743a');
        C(0.74, 0.64, 0.22, '#ffd23f');
        R(0, 0.64, 1, 0.36, '#1d6f6a');
        for (const [wy, wx0, wx1] of [[0.72, 0.6, 0.88], [0.8, 0.64, 0.84], [0.88, 0.68, 0.8]]) R(wx0, wy, wx1 - wx0, 0.025, '#ffd23f');
        P([[0, 0.64], [0, 0.5], [0.1, 0.46], [0.24, 0.56], [0.32, 0.64]], '#12504c');
        break;
      }
      case 'evergreen': {
        // Evergreen: three pines on a snowy hill under a deep-green sky
        R(0, 0, 1, 1, '#1f5c3a');
        P([[0, 1], [0, 0.78], [0.3, 0.64], [0.62, 0.72], [1, 0.62], [1, 1]], '#f2efe4');
        const pine = (px, base, s) => {
          for (const [ty, hw] of [[0, 0.06], [0.14, 0.08], [0.28, 0.1]]) P([[px, base - 0.5*s + ty*s], [px - hw*s*h/w*2.2, base - 0.24*s + ty*s], [px + hw*s*h/w*2.2, base - 0.24*s + ty*s]], '#0f3a22');
          R(px - 0.008*s, base + 0.02*s, 0.016*s, 0.06*s, '#6b4a2b');
        };
        pine(0.24, 0.66, 1);
        pine(0.4, 0.7, 0.8);
        pine(0.72, 0.62, 1.15);
        C(0.86, 0.2, 0.06, '#f2efe4');
        break;
      }
      case 'peaks': {
        // Keystone: rust chevron driving to the fly, cobalt keystone, stitched border
        R(0, 0, 1, 1, '#f1ead8');
        P([[0, 0], [0.18, 0], [0.62, 0.5], [0.18, 1], [0, 1], [0.44, 0.5]], '#b4472a');
        P([[0.3, 0], [0.4, 0], [0.84, 0.5], [0.4, 1], [0.3, 1], [0.74, 0.5]], '#d9a33a');
        P([[0.8, 0.3], [0.92, 0.3], [0.88, 0.7], [0.84, 0.7]], '#23408e');
        c.strokeStyle = '#23408e'; c.lineWidth = Math.max(1, h*0.03);
        c.setLineDash([Math.max(1, h*0.06), Math.max(1, h*0.05)]);
        c.strokeRect(x + h*0.06, y + h*0.06, w - h*0.12, h - h*0.12);
        c.setLineDash([]);
        break;
      }
    }
  }

  function render() {
    // Top-left of the HUD: the city, with the company under it.
    const cityEl = document.getElementById('city-name-display');
    if (cityEl) { cityEl.textContent = cityName; cityEl.title = cityName; }
    const el = document.getElementById('city-info-display');
    if (el) { el.textContent = companyName; el.title = companyName; }
  }

  function setNames(city, company) {
    cityName    = (city    || '').trim().slice(0, 25) || DEFAULT_CITY;
    companyName = (company || '').trim().slice(0, 25) || DEFAULT_COMPANY;
    render();
  }

  function setIdentity(f, hs) {
    if (RETIRED_FLAGS[f]) f = RETIRED_FLAGS[f];
    flag      = FLAGS.some(x => x.id === f)  ? f  : 'gridline';
    hallStyle = HALLS.some(x => x.id === hs) ? hs : 'beaux';
  }

  function serialise() {
    return { cityName, companyName, flag, hallStyle };
  }

  function loadState(d) {
    cityName    = (d && d.cityName)    || DEFAULT_CITY;
    companyName = (d && d.companyName) || DEFAULT_COMPANY;
    setIdentity(d && d.flag, d && d.hallStyle);
    render();
  }

  return {
    setNames, setIdentity, serialise, loadState, render, drawFlag,
    FLAGS, HALLS,
    getFlag:        () => flag,
    getHallStyle:   () => hallStyle,
    getCityName:    () => cityName,
    getCompanyName: () => companyName,
    DEFAULT_CITY, DEFAULT_COMPANY,
  };
})();
