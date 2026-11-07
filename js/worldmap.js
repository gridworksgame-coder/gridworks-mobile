/* ═══════════════════════════════════════════════════════════════════
   WORLD MAP SYSTEM  —  TAB to open/close
   • Terrain: grass noise + water tiles (fast ImageData path)
   • Buildings: coloured rects from EntityRegistry
   • Deposits: glowing dots from scan discoveries
   • Viewport rect showing where the player camera is looking
   • Zoom (scroll wheel) + pan (drag) on the map itself
   ═══════════════════════════════════════════════════════════════════ */

const WorldMapSystem = (() => {

  // ── DOM / canvas ──────────────────────────────────────────────────
  let _open          = false;
  let _overlay       = null;
  let _canvas        = null;
  let _ctx           = null;
  let _terrainCanvas = null;
  let _terrainCtx    = null;
  let _terrainValid  = false;
  let _terrainSig    = -1;      // tree/water counts the cached terrain was built from
  let _hCache        = null;    // { w, h, lo, fi } — terrain height field, reused across rebuilds

  // ── Discovered resource deposits ──────────────────────────────────
  const _discoveries = [];

  // ── Map layout (base — at zoom=1) ─────────────────────────────────
  const PAD    = 48;
  const ASPECT = COLS / ROWS;

  // Base scale: tiles → canvas pixels at zoom=1
  // (recalculated to fit window on every open/resize)
  let _baseScale = 0;   // px per tile at zoom=1
  let _baseMapW  = 0;
  let _baseMapH  = 0;

  // Map zoom state (independent of game camera)
  let _mzoom  = 1;        // current map zoom
  let _mpanX  = 0;        // pan offset in base-map pixels (at zoom=1)
  let _mpanY  = 0;

  const ZOOM_MIN = 1;
  const ZOOM_MAX = 8;

  // Drag state
  let _dragging = false;
  let _dragSX   = 0;
  let _dragSY   = 0;
  let _dragPX0  = 0;
  let _dragPY0  = 0;

  // Hover state (for name-on-hover tooltip)
  let _mouseSX  = -1;   // last known mouse position, screen/client coords
  let _mouseSY  = -1;
  let _hoverInfo = null; // { label, sx, sy } — recomputed each _draw()

  // Legend hover state — hovering a legend row highlights every matching
  // instance on the map. Hitboxes are rebuilt each _drawLegend() call;
  // _legendHover is recomputed from them each frame based on mouse pos.
  let _legendHitboxes = []; // { x, y, w, h, kind: 'building'|'zone'|'deposit', type }
  let _legendHover    = null; // { kind, type }
  let _legendScroll   = 0;    // px the legend list is scrolled down
  let _legendPanel    = null; // { x, y, w, h, maxScroll, contentH, thumb? } — last drawn panel
  let _legendDrag     = null; // { startY, startScroll } while dragging its scrollbar
  // Legend search + sort. The box and button are real DOM (so typing, the
  // caret and selection all work) laid over the canvas just above the list.
  // A query filters the list and lights up every match on the map, the same
  // way hovering a row does; it also finds buildings by their own name
  // ("Grand Hotel"), which the per-type list can't show.
  const LEGEND_SORTS = [['type', 'Type'], ['az', 'A–Z'], ['count', 'Count']];
  const LEGEND_SORT_KEY = 'gridworks.worldmap.legendSort';
  const LEGEND_BAR_H = 24;
  // The list can be folded away to a single button, for screens too narrow to
  // show it beside the map (a Steam Deck's 1280x800: it covered the map's east
  // edge). null = no choice made yet, so it starts folded exactly when there
  // is no room for it; once the player toggles it, their choice is kept.
  const LEGEND_COLLAPSE_KEY = 'gridworks.worldmap.legendCollapsed';
  let _legendCollapsed = null;
  let _legendFolded    = false;   // what the last draw actually showed
  try { const c = localStorage.getItem(LEGEND_COLLAPSE_KEY); if (c === '1' || c === '0') _legendCollapsed = c === '1'; } catch (err) {}
  function _toggleLegend() {
    _legendCollapsed = !_legendFolded;
    try { localStorage.setItem(LEGEND_COLLAPSE_KEY, _legendCollapsed ? '1' : '0'); } catch (err) {}
    if (_legendCollapsed && _legendBar) _legendBar.input.blur();
  }
  const NAMED_MAX = 40;          // named results listed for one query
  let _legendBar    = null;      // { el, input, sortBtn }
  let _legendQuery  = '';        // lower-cased, trimmed
  let _legendSort   = 'type';
  try { const s = localStorage.getItem(LEGEND_SORT_KEY); if (LEGEND_SORTS.some(o => o[0] === s)) _legendSort = s; } catch (err) {}
  let _searchHits   = new Set(); // `${kind}:${type}` of every listed match while a query is active
  let _hlEntities   = new Set(); // individual buildings to ring: named matches, or the hovered one
  let _namedCache   = { q: null, at: 0, list: [] };
  const _isHL = (kind, type) => (!!_legendHover && _legendHover.kind === kind && _legendHover.type === type)
                             || _searchHits.has(kind + ':' + type);
  const _inLegend = (x, y) => !!_legendPanel && x >= _legendPanel.x && x <= _legendPanel.x + _legendPanel.w
                                            && y >= _legendPanel.y && y <= _legendPanel.y + _legendPanel.h;
  // A row for more than one of something opens, on a click, into a list of
  // each one with its tile coordinates, nearest the camera first. A row for
  // one thing (or one line of such a list): a click shows it on the map, a
  // double click fast travels there.
  const INST_MAX     = 200;        // instances listed under one row; the rest are counted
  const _legendOpen  = new Set();  // `${kind}:${type}` of the rows whose list is showing
  const _instCache   = new Map();  // same key → { at, list }
  // Pipes, belts, poles and power towers are laid in runs, so their count is
  // pieces of line, not things: hundreds or thousands of single pieces to
  // pick from is no use. Their rows stay plain legend rows: no list, no
  // travel, hovering still lights every run up on the map. (Poles and towers
  // are listed under POWER LINES as 'powerpart'; towers under BUILDINGS too.)
  const PLAIN_ROW_TYPES = new Set([T.PIPE, T.UNDERGNDPIPE, T.CONVEYOR, T.UNDERGNDCONVEYOR, T.POLE, T.POWERTOWER].filter(v => v !== undefined));
  const _plainRow = e => !!e && (e.kind === 'building' || e.kind === 'powerpart') && PLAIN_ROW_TYPES.has(e.type);
  const _isGroup = e => (e.count || 0) > 1 && !_plainRow(e);

  // Drone coverage. Clicking a Drone Port on the map shows its network; the
  // SHOW DRONE NETWORKS toggle below shows every one.
  let _selectedPort  = null;   // port whose ring was clicked on
  let _portHits      = [];     // { e, x, y, w, h } — drone port rects as last drawn
  const _inRect = (r, x, y) => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  // Map overlay toggles, drawn as checkbox pills above the map's top-right
  // corner, right to left in this order. Each is offered only once something
  // it would show exists. They are viewing preferences, so they live in
  // localStorage rather than the save.
  const ROD_TYPES_MAP = [T.LIGHTNINGROD, T.LIGHTNINGROD2, T.LIGHTNINGROD3].filter(v => v !== undefined);
  const _overlayToggles = [
    { key: 'gridworks.worldmap.showPowerLines', label: 'SHOW POWER LINES',
      color: '#50e890', ink: '#c8ffe0', defaultOn: true,
      offered: () => EntityRegistry.getByType(T.WIRE).size > 0 || EntityRegistry.getByType(T.POLE).size > 0 },
    { key: 'gridworks.worldmap.showDroneNets', label: 'SHOW DRONE NETWORKS',
      color: '#5ad8ff', ink: '#bff0ff',
      offered: () => EntityRegistry.getByType(T.DRONEPORT).size > 0 || EntityRegistry.getByType(T.DRONECHARGER).size > 0 },
    { key: 'gridworks.worldmap.showRodCover', label: 'SHOW LIGHTNING ROD COVERAGE',
      color: '#be96ff', ink: '#e6d8ff',
      offered: () => ROD_TYPES_MAP.some(t => EntityRegistry.getByType(t).size > 0) },
    { key: 'gridworks.worldmap.showPollution', label: 'SHOW AIR POLLUTION',
      color: '#ffa040', ink: '#ffe0c0',
      offered: () => typeof PollutionSystem !== 'undefined' && PollutionSystem.hasAny() },
  ];
  for (const tg of _overlayToggles) {
    tg.on = !!tg.defaultOn; tg.rect = null;
    try {
      const v = localStorage.getItem(tg.key);
      if (v !== null) tg.on = v === '1';
    } catch (err) {}
  }
  const _toggleOn = key => _overlayToggles.some(tg => tg.key === key && tg.on);
  const _showDroneNets = () => _toggleOn('gridworks.worldmap.showDroneNets');
  const _showRodCover  = () => _toggleOn('gridworks.worldmap.showRodCover');
  const _showPowerLines = () => _toggleOn('gridworks.worldmap.showPowerLines');
  let _rodCanvas = null;       // scratch layer for the rod coverage outline

  // ── Colours ───────────────────────────────────────────────────────
  const DEPOSIT_COLORS = {
    [T.GEODEPOSIT]:     { fill: '#ff9050', glow: '#c05820', label: 'Geothermal' },
    [T.COALDEPOSIT]:    { fill: '#c0b090', glow: '#a09070', label: 'Coal'    },
    [T.OILDEPOSIT]:     { fill: '#e0a030', glow: '#c08020', label: 'Oil'     },
    [T.URANIUMDEPOSIT]: { fill: '#60ff80', glow: '#40c060', label: 'Uranium' },
    [T.SULFURDEPOSIT]:  { fill: '#f0e040', glow: '#c0b020', label: 'Sulfur'  },
    [T.LITHIUMDEPOSIT]: { fill: '#d8f4ff', glow: '#a0d8e8', label: 'Lithium' },
    [T.HELIUMDEPOSIT]:  { fill: '#f0c8ff', glow: '#c090e0', label: 'Helium'  },
    [T.RAREEARTHDEPOSIT]: { fill: '#ffb080', glow: '#e07a40', label: 'Rare Earth' },
    [T.AQUIFER]:        { fill: '#40d4c8', glow: '#20b0a8', label: 'Aquifer' },
  };

  // Entity type → map dot colour (only types worth showing)
  const ENTITY_COLOR_MAP = new Map([
    [T.SUBSTATION,     '#2080d0'],
    [T.SUBSTATION2,    '#3090e0'],
    [T.SUBSTATION3,    '#50b8ff'],
    [T.SUBSTATION4,    '#a090ff'],
    [T.SUBSTATION5,    '#ffc860'],
    [T.COALGENERATOR,  '#ff4010'],
    [T.HYDROGENERATOR, '#20d4ff'],
    [T.FUELGEN,        '#ffa020'],
    [T.NUCLEARREACTOR, '#60ff60'],
    [T.SOLAR,          '#5090c0'],
    [T.SOLAR2,         '#3070b0'],
    [T.SOLAR3,         '#e0a040'],
    [T.WIND,           '#50c070'],
    [T.WIND2,          '#40c0e0'],
    [T.WIND3,          '#48e0ff'],
    [T.BIOFUELGEN,     '#60c040'],
    [T.BATTERY,        '#80c040'],
    [T.GEOWELL,        '#ff9050'],
    [T.GEOTURBINE,     '#ffb070'],
    [T.COALMINE,       '#c06030'],
    [T.COALMINE2,      '#d07040'],
    [T.PUMPJACK,       '#d0a030'],
    [T.PUMPJACK2,      '#40c8e0'],
    [T.SOLIDSTORAGE,   '#c07a30'],
    [T.OILSTORAGE,     '#b08030'],
    [T.REFINERY,       '#d08020'],
    [T.URANIUMMINE,    '#60ff80'],
    [T.SULFURMINE,     '#e0d040'],
    [T.SULFURMINE2,    '#fff070'],
    [T.LITHIUMMINE,    '#a0e0ff'],
    [T.RAREEARTHMINE,  '#ff9a5a'],
    [T.LEACHPLANT,     '#e07a40'],
    [T.SCMILL,         '#c8b0f0'],
    [T.COKEOVEN,       '#ff7a2a'],
    [T.GRAPHITEFURNACE, '#e8e4f0'],
    [T.COREWORKS,      '#9fd8ff'],
    [T.CHEMICALPLANT,  '#40e0c0'],
    [T.FUELPLANT,      '#a0ff60'],
    [T.LITHIUMPROCESSPLANT, '#c0a0ff'],
    [T.REPROCESSOR, '#b070ff'],
    [T.MOXPLANT,    '#ff9060'],
    [T.DRONEPORT,   '#5ad8ff'],
    [T.DRONECHARGER, '#7df0a4'],
    [T.ADVREACTOR,  '#40ffd0'],
    [T.SPENTFUELPOOL, '#6ec8ff'],
    [T.COOLINGTOWER,   '#60c0e0'],
    [T.COOLINGTOWER2,  '#7af0ff'],
    [T.STEAMTURBINE,   '#40e0ff'],
    [T.STEAMTURBINE2,  '#7af5ff'],
    [T.MK4RESEARCH,    '#ff60d0'],
    [T.MK5RESEARCH,    '#ffb43c'],
    [T.ELECTROLYZER,   '#40c0ff'],
    [T.ATMOSCOLLECTOR, '#a0e0ff'],
    [T.HABERBOSCH,     '#40e070'],
    [T.WASHTOWER,      '#ff6eb4'],
    [T.FUSIONFUELPLANT, '#70f0ff'],
    [T.HULKINGFUSIONREACTOR, '#40c0ff'],
    [T.ADVFUSIONREACTOR,     '#c890ff'],
    [T.HELIUMWELL,     '#f0b8ff'],
    [T.HELIUMWELL2,    '#90e0ff'],
    [T.CRYOPLANT,      '#b8f0ff'],
    [T.HE3SEPARATOR,   '#ffd0a0'],
    [T.TRITIUMBREEDER, '#80ffc0'],
    [T.GASSTORAGE,     '#80d8ff'],
    [T.MHDRING,        '#60d0ff'],
    [T.DAM,            '#8090b0'],
    [T.HYDROTURBINE,   '#20a0d0'],
    [T.RESEARCH,       '#b060ff'],
    [T.RESEARCH2,      '#c070ff'],
    [T.RESEARCH3,      '#d080ff'],
    [T.SURVEY,         '#c08030'],
    [T.SURVEY2,        '#ffb040'],
    [T.MONITOR,        '#40ffcc'],
    [T.MONITOR2,       '#40ffcc'],
    [T.ENGOFFICE,      '#7ad8ff'],
    [T.BEACON,         '#5aa8ff'],
    [T.WATEREXTRACTOR, '#20c8d4'],
    [T.GOVBUILDING,    '#c0a030'],
    [T.TOWNHALL,       '#d0a840'],
    [T.CIVICCENTER,    '#b890e0'],
    [T.COURTHOUSE,     '#8090d0'],
    [T.EMS,            '#ff4040'],
    [T.HOSPITAL,       '#40e0b0'],
    [T.UNIVERSITY,     '#60c0ff'],
    [T.TRANSPORTHUB,   '#ffa040'],
    [T.NATIONALGOV,    '#e0c060'],
    [T.FUSIONLAB,      '#ff90e0'],
    [T.AIRPORT,        '#80c8ff'],
    [T.MILITARYBASE,   '#a8c870'],
    [T.LAUNCHCOMPLEX,  '#8fc8ee'],
    [T.NATIONALGRID,   '#7ad8ff'],
    [T.COMPANYHQ,      '#ffce6e'],
    [T.CELLTOWER,      '#40c0ff'],
    [T.POWERTOWER,     '#40a0ff'],
    [T.PROTECTOR,      '#40e0ff'],
    [T.PROTECTOR2,     '#00ffcc'],
    [T.PROTECTOR3,     '#b070ff'],
    [T.HOUSE,          '#ffe080'],
    [T.COMMERCIAL,     '#f0c040'],
    [T.INDUSTRIAL,     '#ff8040'],
    [T.TRUCK,          '#80c040'],
    [T.SMALLPARK,         '#60d040'],
    [T.COMMUNITYGARDEN,   '#a0d040'],
    [T.TREEDSTREET,       '#80c060'],
    [T.FOUNTAIN,          '#60c0f0'],
    [T.SPLASHPAD,         '#40c8f0'],
    [T.BASEBALLFIELD,     '#90c050'],
    [T.PLAYGROUND,        '#f0a040'],
    [T.ALLOTMENTS,        '#a0d050'],
    [T.DOGPARK,           '#e0b060'],
    [T.COMMUNITYCENTER,   '#ffc870'],
    [T.GREENHOUSE,        '#90f0a0'],
    [T.CORNERSTORE,       '#ff8a5a'],
    [T.FARM,              '#d8b050'],
    [T.COALWASTE,         '#707070'],
    [T.OILWASTE,          '#805830'],
    [T.NUCLEARWASTE,      '#a0ff30'],
    [T.GASSTATION,        '#ffc040'],
    [T.ROAD,              '#909088'],
    [T.PIPE,              '#7098a8'],
    [T.UNDERGNDPIPE,      '#4a6068'],
    [T.CONVEYOR,          '#c08850'],
    [T.UNDERGNDCONVEYOR,  '#6a4a30'],
    [T.CONVEYORSPLITTER,  '#e0b020'],
    [T.BRIDGE,            '#c8ccd0'],
    [T.CARBONCAPTURE,     '#50e0a0'],
    [T.FIBERHUB,          '#40e0ff'],
    [T.CIRCUITSWITCH,     '#ffb040'],
    [T.CIRCUITSWITCH2,    '#40c0ff'],
    [T.GOVERNOR,          '#ffd060'],
    [T.LIGHTNINGROD,      '#a0d0ff'],
    [T.LIGHTNINGROD2,     '#80e0ff'],
    [T.LIGHTNINGROD3,     '#b8a0ff'],
    [T.BASKETBALLCOURT,   '#f09030'],
    [T.FARMERSMARKET,     '#e0b040'],
  ]);
  // Anything placeable that isn't listed above still goes on the map, in its
  // own glow colour, so a new building never goes missing from it. Types with
  // no live instances (tools, definitions only) simply never draw.
  for (const type of Object.values(T)) {
    const d = EntityDefs[type];
    if (d && !ENTITY_COLOR_MAP.has(type)) ENTITY_COLOR_MAP.set(type, d.glowColor || d.color || '#c0c0c0');
  }

  // Zone type → map fill/border colour (mirrors ZoneSystem's in-game styling)
  const ZONE_MAP_STYLES = {
    residential: { fill: 'rgba(255,200,80,0.16)',  border: 'rgba(220,160,50,0.85)',  label: 'RESIDENTIAL' },
    commercial:  { fill: 'rgba(40,120,255,0.14)',  border: 'rgba(80,150,255,0.85)',  label: 'COMMERCIAL'  },
    industrial:  { fill: 'rgba(255,100,30,0.16)',  border: 'rgba(240,120,50,0.85)',  label: 'INDUSTRIAL'  },
    government:  { fill: 'rgba(192,160,48,0.14)',  border: 'rgba(210,180,70,0.85)',  label: 'GOVERNMENT'  },
  };

  // Types to skip entirely (infrastructure, decorative)
  const SKIP_DRAW = new Set([
    T.WIRE, T.POLE, T.SHAFT,
    T.LAMP, T.CAMERA, T.EVCHARGER, T.TREE, T.BUSH, T.WATER,
    T.COALDEPOSIT, T.OILDEPOSIT, T.URANIUMDEPOSIT,
    T.SULFURDEPOSIT, T.LITHIUMDEPOSIT, T.HELIUMDEPOSIT, T.RAREEARTHDEPOSIT, T.GEODEPOSIT, T.AQUIFER,
  ]);

  // Mining/extraction buildings — drawn with a larger minimum size so they
  // don't disappear as sub-pixel specks on the huge (1170×700) map.
  const PROMINENT_MIN_SIZE = new Set([
    T.COALMINE, T.COALMINE2, T.URANIUMMINE, T.SULFURMINE, T.SULFURMINE2, T.LITHIUMMINE, T.RAREEARTHMINE, T.HELIUMWELL, T.HELIUMWELL2, T.PUMPJACK, T.PUMPJACK2, T.GEOWELL,
  ]);

  // ── Grass noise (same seed/formula as render.js) ──────────────────
  function _vnoise(cx, cy) {
    const SCALE = 18;
    const fx = cx / SCALE, fy = cy / SCALE;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const ux = fx - ix, uy = fy - iy;
    const sx = ux*ux*(3-2*ux), sy = uy*uy*(3-2*uy);
    function _rnd(gx, gy) {
      let h = (gx * 1619 + gy * 31337 + 12345) & 0x7fffffff;
      h = ((h >> 16) ^ h) * 0x45d9f3b | 0;
      h = ((h >> 16) ^ h) & 0x7fffffff;
      return h / 0x7fffffff;
    }
    return _rnd(ix,iy)*(1-sx)*(1-sy) + _rnd(ix+1,iy)*sx*(1-sy)
         + _rnd(ix,iy+1)*(1-sx)*sy   + _rnd(ix+1,iy+1)*sx*sy;
  }
  // ── Terrain look ─────────────────────────────────────────────────
  // Rolling land (two octaves of the grass noise as a height field),
  // hill-shaded from the north-west, with darker forest wherever the map
  // actually has trees, sandy margins along every shore, and water shaded by
  // how far it is from land. Built once per open/resize into a cache at
  // TERRAIN_SS× the base map resolution so zooming in stays crisp.
  const TERRAIN_SS = 2;
  const LAND_STOPS = [          // height → colour
    [0.00, [22, 44, 20]],
    [0.35, [34, 62, 28]],
    [0.60, [46, 76, 34]],
    [0.80, [62, 86, 40]],
    [1.00, [80, 96, 52]],
  ];
  const SAND   = [128, 116, 76];
  const FOREST = [14, 34, 16];
  const SHALLOW = [40, 104, 138], DEEP = [8, 30, 62], RESERVOIR = [26, 76, 118];
  function _lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function _landColour(h) {
    for (let i = 1; i < LAND_STOPS.length; i++) {
      if (h <= LAND_STOPS[i][0]) {
        const [h0, c0] = LAND_STOPS[i - 1], [h1, c1] = LAND_STOPS[i];
        return _lerp3(c0, c1, (h - h0) / (h1 - h0));
      }
    }
    return LAND_STOPS[LAND_STOPS.length - 1][1];
  }

  // ── Build static terrain cache ───────────────────────────────────
  // Only rebuilt when _terrainValid=false.
  function _buildTerrain() {
    const tc = _terrainCtx;
    const w  = _terrainCanvas.width;
    const h  = _terrainCanvas.height;
    const s  = _baseScale * TERRAIN_SS;   // cache px per tile

    // Tile masks: water (1 = lake/river, 2 = reservoir), tree cover, and
    // each water tile's distance from land (1 = shoreline, capped at 6).
    const N = COLS * ROWS;
    const water = new Uint8Array(N), trees = new Uint8Array(N), dist = new Uint8Array(N);
    if (typeof EntityRegistry !== 'undefined') {
      for (const e of EntityRegistry.getByType(T.WATER)) {
        if (e.col >= 0 && e.col < COLS && e.row >= 0 && e.row < ROWS) water[e.row * COLS + e.col] = e._reservoirId !== undefined ? 2 : 1;
      }
      for (const e of EntityRegistry.getByType(T.TREE)) {
        if (e.col >= 0 && e.col < COLS && e.row >= 0 && e.row < ROWS) trees[e.row * COLS + e.col] = 1;
      }
    }
    // Multi-source BFS from land into the water, for depth shading.
    const q = new Int32Array(N); let qh = 0, qt = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      if (!water[i]) continue;
      if ((c > 0 && !water[i - 1]) || (c < COLS - 1 && !water[i + 1]) ||
          (r > 0 && !water[i - COLS]) || (r < ROWS - 1 && !water[i + COLS])) { dist[i] = 1; q[qt++] = i; }
    }
    while (qh < qt) {
      const i = q[qh++], d = dist[i];
      if (d >= 6) continue;
      const c = i % COLS, r = (i / COLS) | 0;
      for (const j of [c > 0 ? i - 1 : -1, c < COLS - 1 ? i + 1 : -1, r > 0 ? i - COLS : -1, r < ROWS - 1 ? i + COLS : -1]) {
        if (j >= 0 && water[j] && !dist[j]) { dist[j] = d + 1; q[qt++] = j; }
      }
    }
    // Land within 1 tile of water gets a sandy margin.
    const shore = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (water[i]) continue;
      const c = i % COLS, r = (i / COLS) | 0;
      if ((c > 0 && water[i - 1]) || (c < COLS - 1 && water[i + 1]) ||
          (r > 0 && water[i - COLS]) || (r < ROWS - 1 && water[i + COLS])) shore[i] = 1;
    }
    // Local forest density (3×3), so woodland reads as a soft mass, not dots.
    const forest = new Uint8Array(N);
    for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) {
      const i = r * COLS + c;
      forest[i] = trees[i - COLS - 1] + trees[i - COLS] + trees[i - COLS + 1] + trees[i - 1] + trees[i] +
                  trees[i + 1] + trees[i + COLS - 1] + trees[i + COLS] + trees[i + COLS + 1];
    }

    // Height field per cache pixel: a broad octave that carries the hills
    // (and all of the hill shading), plus a fine one that only adds gentle
    // colour variation. Shading off the fine octave combed the whole map
    // with diagonal streaks.
    // The hills never change, only trees and water do — so the noise (the
    // expensive part) is computed once per map size and reused by every
    // later rebuild.
    // The broad octave is the real terrain (terrain_system.js) when there
    // is one; the old decorative noise only stands in before a world loads.
    const _tv = TerrainSystem.field() ? TerrainSystem.version() : -1;
    if (!_hCache || _hCache.w !== w || _hCache.h !== h || _hCache.tv !== _tv) {
      const lo = new Float32Array(w * h), fi = new Float32Array(w * h);
      for (let py = 0; py < h; py++) {
        const r = py / s;
        for (let px = 0; px < w; px++) {
          const c = px / s;
          lo[py * w + px] = _tv >= 0 ? TerrainSystem.sample((px + 0.5) / s, (py + 0.5) / s)
            : _vnoise(c * 0.8 + 40, r * 0.8 + 40) * 0.75 + _vnoise(c * 1.7 + 7, r * 1.7 + 7) * 0.25;
          fi[py * w + px] = _vnoise(c * 3.1 + 100, r * 3.1 + 100);
        }
      }
      _hCache = { w, h, lo, fi, tv: _tv };
    }
    const hLow = _hCache.lo, hFine = _hCache.fi;
    const SH_D = Math.max(2, Math.round(s * 1.5));   // slope sampled ~1.5 tiles apart
    const SH_K = _hCache.tv >= 0 ? 6 : 1.6;           // real slopes are gentler than the old noise

    // Land colour lookup by height (0–255) — built once per rebuild so the
    // pixel loop below does no allocation at all. (It used to create several
    // small arrays per pixel, ~3 million pixels, which dominated rebuilds.)
    const LR = new Float32Array(256), LG = new Float32Array(256), LB = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const c = _landColour(i / 255); LR[i] = c[0]; LG[i] = c[1]; LB[i] = c[2]; }

    const img = tc.createImageData(w, h);
    const buf = img.data;
    for (let py = 0; py < h; py++) {
      const tr = Math.min(ROWS - 1, (py / s) | 0);
      const fy = py / s - 0.5;
      const y0 = Math.max(0, Math.min(ROWS - 2, Math.floor(fy)));
      const ay = Math.max(0, Math.min(1, fy - y0));
      const pyN = Math.max(0, py - SH_D) * w, pyS = Math.min(h - 1, py + SH_D) * w;
      for (let px = 0; px < w; px++) {
        const tcol = Math.min(COLS - 1, (px / s) | 0);
        const ti = tr * COLS + tcol;
        const k = py * w + px;
        let R, G, B;
        if (water[ti]) {
          const d = dist[ti] || 6;
          const t = Math.min(1, (d - 1) / 5);
          const base = water[ti] === 2 ? RESERVOIR : SHALLOW;
          R = base[0] + (DEEP[0] - base[0]) * t;
          G = base[1] + (DEEP[1] - base[1]) * t;
          B = base[2] + (DEEP[2] - base[2]) * t;
          if (d === 1) { R += (96 - R) * 0.35; G += (156 - G) * 0.35; B += (176 - B) * 0.35; }   // lighter shoreline water
          const ripple = Math.sin((px + py * 0.6) * 0.35) * 3;                                  // faint surface texture
          R += ripple; G += ripple; B += ripple * 1.5;
        } else {
          const hh = hLow[k] * 0.85 + hFine[k] * 0.15;
          const li = Math.max(0, Math.min(255, (hh * 255) | 0));
          // Hill shade: light from the north-west, from the broad octave only.
          const hNW = hLow[pyN + Math.max(0, px - SH_D)];
          const hSE = hLow[pyS + Math.min(w - 1, px + SH_D)];
          const shade = Math.max(0.75, Math.min(1.25, 1 + (hNW - hSE) * SH_K)) * 0.9;
          R = LR[li] * shade; G = LG[li] * shade; B = LB[li] * shade;
          // Forest density blended between tile centres so woodland has soft
          // edges instead of reading as a grid of tile-sized blocks.
          const fx = px / s - 0.5;
          const x0 = Math.max(0, Math.min(COLS - 2, Math.floor(fx)));
          const ax = Math.max(0, Math.min(1, fx - x0));
          const r0 = y0 * COLS + x0, r1 = r0 + COLS;
          const fd = (forest[r0] * (1 - ax) + forest[r0 + 1] * ax) * (1 - ay) + (forest[r1] * (1 - ax) + forest[r1 + 1] * ax) * ay;
          if (fd > 0.05) {
            const t = Math.min(0.7, fd / 9 * 1.1);
            R += (FOREST[0] - R) * t; G += (FOREST[1] - G) * t; B += (FOREST[2] - B) * t;
          }
          if (shore[ti]) { R += (SAND[0] - R) * 0.45; G += (SAND[1] - G) * 0.45; B += (SAND[2] - B) * 0.45; }
        }
        const i = k * 4;
        buf[i] = R; buf[i + 1] = G; buf[i + 2] = B; buf[i + 3] = 255;
      }
    }
    tc.putImageData(img, 0, 0);
    _terrainValid = true;
  }

  // ── Helpers: map coords ───────────────────────────────────────────
  // Convert a tile (col,row) → screen (sx,sy) given current zoom+pan
  function _tileToScreen(col, row) {
    // world pos in base-map pixels
    const bx = col * _baseScale;
    const by = row * _baseScale;
    // apply zoom + pan, then offset to map area centre on screen
    return {
      x: _screenOffX() + (bx - _mpanX) * _mzoom,
      y: _screenOffY() + (by - _mpanY) * _mzoom,
    };
  }

  // Current effective scale: base pixels per tile × map zoom
  function _effScale() { return _baseScale * _mzoom; }

  // Screen offset of the map's top-left corner (centred in window). Kept,
  // not worked out per call: _tileToScreen asks for it for every building
  // and conductor drawn, and reading innerWidth/innerHeight each time was 7%
  // of the frame with the map open. Set by _syncOffsets, from _recompute (open,
  // resize) and the top of every _draw.
  let _offX = 0, _offY = 0;
  function _syncOffsets() {
    _offX = Math.round((window.innerWidth  - _baseMapW) / 2);
    _offY = Math.round((window.innerHeight - _baseMapH) / 2);
  }
  function _screenOffX() { return _offX; }
  function _screenOffY() { return _offY; }

  // On a contract the map is the site and nothing else: zoomed out as far as
  // the site fills it, panned no further than its edges, and whatever the
  // window still shows beyond them masked off (_drawSiteZones).
  function _siteJob() {
    if (typeof ContractSystem === 'undefined' || !ContractSystem.isAtSite || !ContractSystem.isAtSite()) return null;
    const j = ContractSystem.getActive();
    return j && j.bounds ? j : null;
  }
  function _zoomFloor() {
    const j = _siteJob();
    if (!j) return ZOOM_MIN;
    const b = j.bounds;
    return Math.min(_baseMapW / ((b.maxC - b.minC + 1) * _baseScale), _baseMapH / ((b.maxR - b.minR + 1) * _baseScale));
  }

  // Clamp pan so the zoomed map never shows empty space (when zoomed in)
  function _clampPan() {
    const visW = _baseMapW / _mzoom;  // visible width in base-map pixels
    const visH = _baseMapH / _mzoom;
    const job = _siteJob();
    if (job) {
      const b = job.bounds;
      const axis = (lo, hi, vis, pan) => hi - lo <= vis ? (lo + hi - vis) / 2 : Math.max(lo, Math.min(hi - vis, pan));
      _mpanX = axis(b.minC * _baseScale, (b.maxC + 1) * _baseScale, visW, _mpanX);
      _mpanY = axis(b.minR * _baseScale, (b.maxR + 1) * _baseScale, visH, _mpanY);
      return;
    }
    const maxPX = _baseMapW - visW;
    const maxPY = _baseMapH - visH;
    _mpanX = Math.max(0, Math.min(maxPX, _mpanX));
    _mpanY = Math.max(0, Math.min(maxPY, _mpanY));
  }

  // ── Main draw ─────────────────────────────────────────────────────
  // Mines and pump jacks — the buildings that sit on a deposit and draw it down.
  const EXTRACTOR_TYPES = new Set([
    T.COALMINE, T.COALMINE2, T.PUMPJACK, T.PUMPJACK2, T.URANIUMMINE, T.SULFURMINE, T.SULFURMINE2, T.LITHIUMMINE, T.RAREEARTHMINE, T.HELIUMWELL, T.HELIUMWELL2,
  ]);

  // True when an extractor's deposit has been worked out: coal by its
  // coalAmount, oil by its pressure, the ore mines by _oreAmount (see
  // checkDepositDepletion callers). A pump jack only links its deposit on its
  // first powered tick, so an unlinked one is matched by footprint overlap the
  // same way OilSystem.tickPumpJack does it.
  function _extractorExhausted(e) {
    let dep = e._linkedDeposit;
    if (!dep && (e.type === T.PUMPJACK || e.type === T.PUMPJACK2)) {
      const pw = e.width || 3, ph = e.height || 3;
      for (const d of EntityRegistry.getByType(T.OILDEPOSIT)) {
        const dw = d.width || 2, dh = d.height || 2;
        if (e.col < d.col + dw && e.col + pw > d.col && e.row < d.row + dh && e.row + ph > d.row) { dep = d; break; }
      }
    }
    if (!dep) return false;
    if (dep.type === T.OILDEPOSIT)  return dep._pressure !== undefined && dep._pressure <= 0;
    if (dep.type === T.COALDEPOSIT) return dep.coalAmount !== undefined && dep.coalAmount <= 0;
    return dep._oreAmount !== undefined && dep._oreAmount <= 0;
  }

  function _draw() {
    if (!_ctx) return;
    // Sized only when the window has changed: assigning a canvas's size, even
    // the size it already is, allocates it afresh, and this runs every frame
    // the map is up. reset() is the rest of what that did (cleared, default
    // state).
    const W = window.innerWidth, H = window.innerHeight;
    if (_canvas.width !== W || _canvas.height !== H || !_ctx.reset) { _canvas.width = W; _canvas.height = H; }
    else _ctx.reset();
    _syncOffsets();
    // The world under the map can change while it's up (arriving on a site).
    _mzoom = Math.max(_mzoom, _zoomFloor());
    _clampPan();
    const ox = _screenOffX();
    const oy = _screenOffY();
    const mW = _baseMapW;
    const mH = _baseMapH;

    _ctx.clearRect(0, 0, W, H);

    // Backdrop — deep navy, a touch lighter behind the map.
    {
      const bg = _ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
      bg.addColorStop(0, 'rgba(10,18,30,0.93)');
      bg.addColorStop(1, 'rgba(2,4,8,0.96)');
      _ctx.fillStyle = bg;
      _ctx.fillRect(0, 0, W, H);
    }

    // Map frame — soft accent glow, thin bright rim, corner brackets.
    _ctx.save();
    _ctx.shadowColor = 'rgba(64,180,255,0.35)';
    _ctx.shadowBlur = 28;
    _ctx.fillStyle = '#070b12';
    _ctx.beginPath(); _ctx.roundRect(ox - 6, oy - 6, mW + 12, mH + 12, 8); _ctx.fill();
    _ctx.restore();
    _ctx.strokeStyle = 'rgba(120,200,255,0.45)';
    _ctx.lineWidth = 1;
    _ctx.beginPath(); _ctx.roundRect(ox - 6.5, oy - 6.5, mW + 13, mH + 13, 8); _ctx.stroke();
    _ctx.strokeStyle = 'rgba(140,215,255,0.9)';
    _ctx.lineWidth = 2;
    for (const [cx, cy, dx, dy] of [[ox - 6, oy - 6, 1, 1], [ox + mW + 6, oy - 6, -1, 1], [ox - 6, oy + mH + 6, 1, -1], [ox + mW + 6, oy + mH + 6, -1, -1]]) {
      _ctx.beginPath(); _ctx.moveTo(cx + dx * 22, cy); _ctx.lineTo(cx, cy); _ctx.lineTo(cx, cy + dy * 22); _ctx.stroke();
    }

    // Clip all map content to the map rectangle
    _ctx.save();
    _ctx.beginPath();
    _ctx.rect(ox, oy, mW, mH);
    _ctx.clip();

    // Draw terrain (scaled + panned). The terrain bakes in trees and water,
    // which change as the player builds (placing clears trees), so rebuild
    // when their counts differ from the last bake — otherwise reuse it.
    const sig = (typeof EntityRegistry !== 'undefined')
      ? EntityRegistry.getByType(T.TREE).size * 1000003 + EntityRegistry.getByType(T.WATER).size + ':' + TerrainSystem.version() : 0;
    if (!_terrainValid || sig !== _terrainSig) { _buildTerrain(); _terrainSig = sig; }
    _ctx.save();
    _ctx.translate(ox, oy);
    _ctx.scale(_mzoom, _mzoom);
    _ctx.translate(-_mpanX, -_mpanY);
    _ctx.imageSmoothingEnabled = true;
    _ctx.imageSmoothingQuality = 'high';
    _ctx.drawImage(_terrainCanvas, 0, 0, mW, mH);
    _ctx.restore();

    // Current effective scale (px per tile on screen)
    const es = _effScale();

    // Coordinate grid — a line every 50 tiles (every 10 once zoomed in).
    {
      const step = es >= 4 ? 10 : 50;
      _ctx.save();
      _ctx.lineWidth = 1;
      for (let c = step; c < COLS; c += step) {
        const { x } = _tileToScreen(c, 0);
        if (x < ox || x > ox + mW) continue;
        _ctx.strokeStyle = c % 50 === 0 ? 'rgba(170,220,255,0.10)' : 'rgba(170,220,255,0.05)';
        _ctx.beginPath(); _ctx.moveTo(Math.round(x) + 0.5, oy); _ctx.lineTo(Math.round(x) + 0.5, oy + mH); _ctx.stroke();
      }
      for (let r = step; r < ROWS; r += step) {
        const { y } = _tileToScreen(0, r);
        if (y < oy || y > oy + mH) continue;
        _ctx.strokeStyle = r % 50 === 0 ? 'rgba(170,220,255,0.10)' : 'rgba(170,220,255,0.05)';
        _ctx.beginPath(); _ctx.moveTo(ox, Math.round(y) + 0.5); _ctx.lineTo(ox + mW, Math.round(y) + 0.5); _ctx.stroke();
      }
      _ctx.restore();
    }

    // Vignette — darkens the map edges so the centre reads as the focus.
    {
      const vg = _ctx.createRadialGradient(ox + mW / 2, oy + mH / 2, Math.min(mW, mH) * 0.35,
                                           ox + mW / 2, oy + mH / 2, Math.max(mW, mH) * 0.72);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,4,10,0.42)');
      _ctx.fillStyle = vg;
      _ctx.fillRect(ox, oy, mW, mH);
    }

    // Recompute legend hover from last frame's hitboxes + current mouse pos
    // (drawn before buildings/zones so those loops can highlight matches)
    _legendHover = null;
    for (const hb of _legendHitboxes) {
      if (_mouseSX >= hb.x && _mouseSX <= hb.x + hb.w && _mouseSY >= hb.y && _mouseSY <= hb.y + hb.h) {
        _legendHover = { kind: hb.kind, type: hb.type };
        break;
      }
    }
    // Legend rows are clickable, so they get the hand.
    if (!_dragging) {
      const cur = _legendHover && !_plainRow(_legendHover) ? 'pointer' : 'crosshair';
      if (_overlay.style.cursor !== cur) _overlay.style.cursor = cur;
    }

    // ── Zones ────────────────────────────────────────────────────────
    _drawZones(es);

    // ── Rod and drone coverage — under deposits and buildings so the dots
    //    stay readable inside a tinted area; drones on top of rods. ──
    if (_toggleOn('gridworks.worldmap.showPollution') && typeof PollutionSystem !== 'undefined') {
      const o = _tileToScreen(0, 0);
      PollutionSystem.renderMap(_ctx, o.x, o.y, es);
    }
    _drawRodCoverage(es);
    _drawDroneRanges(es);

    // ── Power lines (wires, poles, towers) ──
    _drawPowerLines(es);

    _hoverInfo = null;
    _portHits = [];
    // Wires/poles first: deposits and buildings drawn over them win the
    // tooltip when the cursor is on one of those instead.
    _powerLineHover(es, ox, oy, mW, mH);

    // ── Discovered deposits ───────────────────────────────────────────
    for (const d of _discoveries) {
      const info = DEPOSIT_COLORS[d.type];
      if (!info) continue;
      const { x: sx, y: sy } = _tileToScreen(d.col + (d.w || 1) * 0.5, d.row + (d.h || 1) * 0.5);
      const r = Math.max(3, es * 1.5);
      const isLegendMatch = _isHL('deposit', d.type);

      // Legend-hover highlight — glow ring behind the deposit dot
      if (isLegendMatch) {
        _ctx.save();
        _ctx.shadowColor = '#ffffff';
        _ctx.shadowBlur = 10;
        _ctx.strokeStyle = '#ffffff';
        _ctx.lineWidth = 2;
        _ctx.beginPath();
        _ctx.arc(sx, sy, r + 5, 0, Math.PI * 2);
        _ctx.stroke();
        _ctx.restore();
      }

      // Glow
      const grad = _ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 2.5);
      grad.addColorStop(0, info.glow + 'bb');
      grad.addColorStop(1, 'transparent');
      _ctx.fillStyle = grad;
      _ctx.beginPath();
      _ctx.arc(sx, sy, r * 2.5, 0, Math.PI * 2);
      _ctx.fill();

      // Core dot
      _ctx.fillStyle = info.fill;
      _ctx.beginPath();
      _ctx.arc(sx, sy, r, 0, Math.PI * 2);
      _ctx.fill();

      // Ring
      _ctx.strokeStyle = info.glow;
      _ctx.lineWidth = 1;
      _ctx.beginPath();
      _ctx.arc(sx, sy, r, 0, Math.PI * 2);
      _ctx.stroke();

      // Label when zoomed in
      if (es >= 6) {
        _ctx.fillStyle = info.fill;
        _ctx.font = `bold ${Math.round(Math.min(11, es * 0.8))}px monospace`;
        _ctx.textAlign = 'center';
        _ctx.fillText(info.label, sx, sy - r - 3);
        _ctx.textAlign = 'left';
      }

      // Hover hit-test — generous radius since dots are small at low zoom
      const hitR = Math.max(r, 8);
      const dx = _mouseSX - sx, dy = _mouseSY - sy;
      if (dx * dx + dy * dy <= hitR * hitR) {
        _hoverInfo = { label: info.label, sx: _mouseSX, sy: _mouseSY };
      }
    }

    // ── Buildings — drawn after deposits so a mine or pump jack sitting
    // on a deposit is not buried under that deposit's dot and glow.
    // ──────────────────────────────────────────────────────
    if (typeof EntityRegistry !== 'undefined') {
      for (const [type, color] of ENTITY_COLOR_MAP) {
        if (SKIP_DRAW.has(type)) continue;
        let list;
        try { list = EntityRegistry.getByType(type); } catch(err) { continue; }
        if (!list || list.size === 0) continue;

        const isLegendMatch = _isHL('building', type);
        const isExtractor = EXTRACTOR_TYPES.has(type);

        _ctx.fillStyle = color + 'dd';
        for (const e of list) {
          if (e.col == null || e.row == null) continue;
          const { x: sx, y: sy } = _tileToScreen(e.col, e.row);
          const minSize = PROMINENT_MIN_SIZE.has(type) ? 5 : 2;
          const sw = Math.max(minSize, (e.width  || 1) * es);
          const sh = Math.max(minSize, (e.height || 1) * es);
          // Dark keyline first so small buildings stay readable on the terrain.
          _ctx.fillStyle = 'rgba(0,0,0,0.55)';
          _ctx.fillRect(sx - 1, sy - 1, sw + 2, sh + 2);
          _ctx.fillStyle = color + 'ee';
          _ctx.fillRect(sx, sy, sw, sh);

          // A mine or pump jack still standing on a worked-out deposit
          // flashes red with an outgoing ping, so dead extractors are easy to
          // find and clear from the whole-map view.
          // Buildings with no power for hours (OutageWatch) pulse amber, so a
          // street the grid stopped reaching is obvious from the whole-map
          // view. Same treatment as a worked-out extractor below, in a
          // different colour — that one is red and takes precedence.
          // Lightning-struck buildings pulse bright white until repaired /
          // the strike state clears — highest precedence so a wreck is
          // never mistaken for a plain outage from the whole-map view.
          const struck = !!e._lightningDamaged;
          const dark = typeof OutageWatch !== 'undefined' && OutageWatch.isFlagged(e);
          const dry = isExtractor && _extractorExhausted(e);
          // Customers threatening to leave (SatisfactionSystem's churn
          // warning) flash magenta with an outgoing ping — the world-map half
          // of the "N properties are threatening to leave" notification.
          // Outranks a plain outage (often the cause) but not a lightning wreck.
          const leaving = !struck && !!(e._churnWarned || e._outageWarned);
          // Plants PollutionSystem counts in its "Smog alert: N plants are
          // polluting too much" notification pulse smoky olive with the same ping.
          const polluting = !struck && !leaving && !!e._pollutionProblem;
          if (struck) {
            const tNow = performance.now() / 1000;
            const blink = 0.5 + 0.5 * Math.sin(tNow * 7);
            _ctx.fillStyle = `rgba(255,255,255,${(0.25 + 0.65 * blink).toFixed(3)})`;
            _ctx.fillRect(sx, sy, sw, sh);
            _ctx.save();
            _ctx.shadowColor = '#e8f4ff'; _ctx.shadowBlur = 10 * blink;
            _ctx.strokeStyle = `rgba(200,230,255,${(0.5 + 0.5 * blink).toFixed(3)})`;
            _ctx.lineWidth = 2;
            _ctx.strokeRect(sx - 2, sy - 2, sw + 4, sh + 4);
            _ctx.restore();
          } else if (leaving || polluting) {
            // [fill, glow, outline, ring] — magenta for leaving, olive for smog.
            const pal = leaving
              ? ['255,60,170', '#ff3caa', '255,120,200', '255,90,190']
              : ['190,200,50', '#c8d040', '215,225,110', '200,210,70'];
            const tNow = performance.now() / 1000;
            const blink = 0.5 + 0.5 * Math.sin(tNow * 6);
            const cx = sx + sw / 2, cy = sy + sh / 2;
            _ctx.fillStyle = `rgba(${pal[0]},${(0.25 + 0.6 * blink).toFixed(3)})`;
            _ctx.fillRect(sx, sy, sw, sh);
            _ctx.save();
            _ctx.shadowColor = pal[1]; _ctx.shadowBlur = 10 * blink;
            _ctx.strokeStyle = `rgba(${pal[2]},${(0.5 + 0.5 * blink).toFixed(3)})`;
            _ctx.lineWidth = 2;
            _ctx.strokeRect(sx - 2, sy - 2, sw + 4, sh + 4);
            _ctx.restore();
            const p = (tNow * 0.8) % 1;
            _ctx.strokeStyle = `rgba(${pal[3]},${(0.7 * (1 - p)).toFixed(3)})`;
            _ctx.lineWidth = 1.5;
            _ctx.beginPath(); _ctx.arc(cx, cy, Math.max(sw, sh) / 2 + 3 + p * 12, 0, Math.PI * 2); _ctx.stroke();
          } else if (dark && !dry) {
            const tNow = performance.now() / 1000;
            const blink = 0.5 + 0.5 * Math.sin(tNow * 4);
            _ctx.fillStyle = `rgba(255,176,64,${(0.2 + 0.5 * blink).toFixed(3)})`;
            _ctx.fillRect(sx, sy, sw, sh);
            _ctx.save();
            _ctx.shadowColor = '#ffb040'; _ctx.shadowBlur = 8 * blink;
            _ctx.strokeStyle = `rgba(255,200,110,${(0.45 + 0.45 * blink).toFixed(3)})`;
            _ctx.lineWidth = 1.5;
            _ctx.strokeRect(sx - 2, sy - 2, sw + 4, sh + 4);
            _ctx.restore();
          }
          if (dry && !struck) {
            const tNow = performance.now() / 1000;
            const blink = 0.5 + 0.5 * Math.sin(tNow * 6);
            const cx = sx + sw / 2, cy = sy + sh / 2;
            _ctx.fillStyle = `rgba(255,50,30,${(0.25 + 0.6 * blink).toFixed(3)})`;
            _ctx.fillRect(sx, sy, sw, sh);
            _ctx.save();
            _ctx.shadowColor = '#ff3020'; _ctx.shadowBlur = 10 * blink;
            _ctx.strokeStyle = `rgba(255,90,60,${(0.5 + 0.5 * blink).toFixed(3)})`;
            _ctx.lineWidth = 2;
            _ctx.strokeRect(sx - 3, sy - 3, sw + 6, sh + 6);
            _ctx.restore();
            const p = (tNow * 0.9) % 1;
            _ctx.strokeStyle = `rgba(255,80,50,${(0.7 * (1 - p)).toFixed(3)})`;
            _ctx.lineWidth = 1.5;
            _ctx.beginPath(); _ctx.arc(cx, cy, Math.max(sw, sh) / 2 + 3 + p * 14, 0, Math.PI * 2); _ctx.stroke();
          }

          // Bright outline when zoomed in enough to see it
          if (es >= 4) {
            _ctx.strokeStyle = color + '88';
            _ctx.lineWidth = 0.5;
            _ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
          }

          // Legend-hover highlight — pulsing glow ring around every match
          if (isLegendMatch || _hlEntities.has(e)) {
            const pad = 4;
            _ctx.save();
            _ctx.shadowColor = '#ffffff';
            _ctx.shadowBlur = 8;
            _ctx.strokeStyle = '#ffffff';
            _ctx.lineWidth = 2;
            _ctx.strokeRect(sx - pad, sy - pad, sw + pad * 2, sh + pad * 2);
            _ctx.restore();
          }

          if (type === T.DRONEPORT || type === T.DRONECHARGER) {
            _portHits.push({ e, x: sx, y: sy, w: sw, h: sh });
            // Selected port: a bright frame so it is clear whose ring is up.
            if (e === _selectedPort) {
              _ctx.save();
              _ctx.shadowColor = '#5ad8ff'; _ctx.shadowBlur = 8;
              _ctx.strokeStyle = '#bff0ff';
              _ctx.lineWidth = 2;
              _ctx.strokeRect(sx - 3, sy - 3, sw + 6, sh + 6);
              _ctx.restore();
            }
          }

          // Hover hit-test — later-drawn (on-top) entities win ties naturally
          if (_mouseSX >= sx && _mouseSX <= sx + sw && _mouseSY >= sy && _mouseSY <= sy + sh) {
            let label = e.businessName || (typeof EntityDefs !== 'undefined' && EntityDefs[type]?.label) || type;
            if (e._num !== undefined && typeof NUMBERED_ENTITY_TYPES !== 'undefined' && NUMBERED_ENTITY_TYPES.has(type)) {
              label += ` #${e._num}`;
            }
            if (struck) label += ': lightning damaged';
            else if (dry) label += ': deposit exhausted';
            else if (leaving) label += `: threatening to leave (${Math.round(e.satisfaction)}% satisfied)`;
            else if (polluting) label += e._pollutionProblem === 'smog' ? ': smog reaching homes nearby' : ': over the emission allowance';
            else if (dark) label += `: no power for ${OutageWatch.hoursDark(e)}h`;
            else if ((type === T.DRONEPORT || type === T.DRONECHARGER) && e !== _selectedPort && !_showDroneNets()) label += ': click to show network';
            _hoverInfo = { label, sx: _mouseSX, sy: _mouseSY };
          }
        }
      }
    }

    // ── Grid breaks (failed wires / poles) ────────────────────────────
    // Wires and poles are skipped in the building pass above, but a
    // weather-failed or burned span is exactly the open circuit that can
    // shatter one network into dozens — draw the same bright-white pulse
    // lightning-damaged buildings get so the break is findable on the map.
    // Struck Power Towers already pulse via `_lightningDamaged` above.
    if (typeof GridBreakWatch !== 'undefined' && GridBreakWatch.any()) {
      const tNow = performance.now() / 1000;
      const blink = 0.5 + 0.5 * Math.sin(tNow * 7);
      for (const b of GridBreakWatch.list()) {
        if (b.kind === 'tower') continue; // already drawn as a struck building
        const e = b.e;
        if (!e || e.col == null) continue;
        const { x: sx, y: sy } = _tileToScreen(e.col, e.row);
        const sw = Math.max(4, (e.width || 1) * es);
        const sh = Math.max(4, (e.height || 1) * es);
        _ctx.fillStyle = `rgba(255,255,255,${(0.25 + 0.65 * blink).toFixed(3)})`;
        _ctx.fillRect(sx, sy, sw, sh);
        _ctx.save();
        _ctx.shadowColor = '#e8f4ff'; _ctx.shadowBlur = 10 * blink;
        _ctx.strokeStyle = `rgba(200,230,255,${(0.5 + 0.5 * blink).toFixed(3)})`;
        _ctx.lineWidth = 2;
        _ctx.strokeRect(sx - 2, sy - 2, sw + 4, sh + 4);
        _ctx.restore();
        if (_mouseSX >= sx - 2 && _mouseSX <= sx + sw + 2 && _mouseSY >= sy - 2 && _mouseSY <= sy + sh + 2) {
          _hoverInfo = { label: b.label, sx: _mouseSX, sy: _mouseSY };
        }
      }
    }

    // ── Nuclear contamination — over the buildings, so ground zero reads
    //    at a glance however built-up the area was. ──
    _drawContamination(es);

    // ── Drones in flight — over everything on the ground, like the city view.
    _drawDrones(es);

    // ── Viewport rectangle ────────────────────────────────────────────
    {
      const SW = window.innerWidth;
      const SH = window.innerHeight;
      const vx1 = Camera.x / TILE;
      const vy1 = Camera.y / TILE;
      const vx2 = (Camera.x + SW / Camera.zoom) / TILE;
      const vy2 = (Camera.y + SH / Camera.zoom) / TILE;

      const { x: rx1, y: ry1 } = _tileToScreen(vx1, vy1);
      const { x: rx2, y: ry2 } = _tileToScreen(vx2, vy2);
      const rw = rx2 - rx1;
      const rh = ry2 - ry1;

      // Faint fill + thin outline, with bright corner brackets like a camera
      // reticle, and a pulsing "you are here" dot. The rectangle itself
      // breathes, fading slowly down and back, so the eye catches it on a
      // busy map; it never goes fully out.
      const tNow = performance.now() / 1000;
      const breathe = 0.6 + 0.4 * Math.cos(tNow * Math.PI * 2 / 2.4);   // 0.2–1.0, one breath every 2.4s
      _ctx.save();
      _ctx.globalAlpha = breathe;
      _ctx.fillStyle = 'rgba(140,215,255,0.07)';
      _ctx.fillRect(rx1, ry1, rw, rh);
      _ctx.strokeStyle = 'rgba(140,215,255,0.35)';
      _ctx.lineWidth = 1;
      _ctx.strokeRect(rx1 + 0.5, ry1 + 0.5, rw - 1, rh - 1);
      const bl = Math.max(6, Math.min(18, Math.min(rw, rh) * 0.25));
      _ctx.save();
      _ctx.strokeStyle = '#bfe8ff';
      _ctx.shadowColor = 'rgba(120,200,255,0.8)'; _ctx.shadowBlur = 6;
      _ctx.lineWidth = 2;
      for (const [x, y, dx, dy] of [[rx1, ry1, 1, 1], [rx2, ry1, -1, 1], [rx1, ry2, 1, -1], [rx2, ry2, -1, -1]]) {
        _ctx.beginPath(); _ctx.moveTo(x + dx * bl, y); _ctx.lineTo(x, y); _ctx.lineTo(x, y + dy * bl); _ctx.stroke();
      }
      _ctx.restore();
      _ctx.restore();   // breathe
      const cx = (rx1 + rx2) / 2;
      const cy = (ry1 + ry2) / 2;
      const pr = (tNow * 0.8) % 1;
      _ctx.strokeStyle = 'rgba(190,232,255,' + (0.8 * (1 - pr)).toFixed(3) + ')';
      _ctx.lineWidth = 1.5;
      _ctx.beginPath(); _ctx.arc(cx, cy, 3 + pr * 12, 0, Math.PI * 2); _ctx.stroke();
      _ctx.fillStyle = '#ffffff';
      _ctx.beginPath(); _ctx.arc(cx, cy, 3, 0, Math.PI * 2); _ctx.fill();
    }

    _drawSiteZones(ox, oy, mW, mH);

    // Compass rose (top-left), and the scale bar with the cursor's tile
    // coordinates beside it (bottom-left), inside the map.
    _drawCompass(ox + 34, oy + 38);
    const _barLen = _drawScaleBar(ox + 16, oy + mH - 18, es);
    _drawCursorCoords(ox + 16 + _barLen + 18, oy + mH - 18, ox, oy, mW, mH);

    // A / B / C property-placement options — same pins as the city view, so a
    // spot far from the camera is findable without leaving the map.
    _drawPlacementOptions();

    // The one thing whose line in a legend list is under the cursor.
    _drawInstMark(es);

    // Power network numbers: on top of everything else in the map.
    _drawNetTags();

    _ctx.restore(); // end map clip

    // ── Legend ────────────────────────────────────────────────────────
    _drawLegend(ox, oy, mH);

    _drawToggles(ox, oy, mW);

    // ── Title + hints ─────────────────────────────────────────────────
    _ctx.save();
    _ctx.textAlign = 'center';
    {
      const title = _titleText();
      _ctx.font = 'bold 12px Inter, Arial, sans-serif';
      const tw = _ctx.measureText(title).width + 28;
      _ctx.fillStyle = 'rgba(8,14,24,0.92)';
      _ctx.strokeStyle = 'rgba(120,200,255,0.5)';
      _ctx.lineWidth = 1;
      _ctx.beginPath(); _ctx.roundRect(W / 2 - tw / 2, oy - 30, tw, 20, 10); _ctx.fill(); _ctx.stroke();
      _ctx.fillStyle = '#bfe8ff';
      _ctx.fillText(title, W / 2, oy - 16);
    }
    _ctx.font = '9px monospace';
    // Zoom level
    if (_mzoom > _zoomFloor() * 1.001) {
      _ctx.fillStyle = 'rgba(255,255,255,0.45)';
      _ctx.textAlign = 'right';
      _ctx.fillText(`${(_mzoom / _zoomFloor()).toFixed(1)}×`, ox + mW - 6, oy + mH + 18);
    }
    _ctx.restore();

    // ── Hover tooltip (entity name under cursor) ────────────────────
    if (_hoverInfo) _drawHoverTooltip(_hoverInfo);
  }

  // Placing a Drone Port from the map: true while that tool is selected.
  function _placingPort() {
    return typeof InputManager !== 'undefined' && InputManager.state
        && (InputManager.state.selectedTool === T.DRONEPORT || InputManager.state.selectedTool === T.DRONECHARGER);
  }
  // The ghost port under the cursor (top-left anchored, centred on the
  // cursor), or null when the cursor is off the map.
  function _portGhostAt(sx, sy) {
    const tool = InputManager.state.selectedTool, D = EntityDefs[tool];
    const t = _screenToTile(sx, sy);
    if (t.col < 0 || t.row < 0 || t.col >= COLS || t.row >= ROWS || _inLegend(sx, sy)) return null;
    return { type: tool, width: D.width, height: D.height,
             col: Math.max(0, Math.min(COLS - D.width,  Math.round(t.col - D.width / 2))),
             row: Math.max(0, Math.min(ROWS - D.height, Math.round(t.row - D.height / 2))) };
  }
  function _portGhostOk(g) {
    return !!g && GridManager.canPlaceFootprint(g.col, g.row, g.width, g.height)
        && (typeof Economy === 'undefined' || Economy.canAfford(EntityDefs[g.type].cost));
  }

  // Drone coverage: every network with SHOW DRONE NETWORKS on, otherwise
  // the network of the clicked port -- its drones work all of it, so that is
  // the honest area to show. Drawn by the same routine as the city view's
  // outline (render_drones.js), so the two read as the same thing.
  function _drawDroneRanges(es) {
    if (typeof DroneSystem === 'undefined' || typeof EntityRegistry === 'undefined') return;
    // Drop a selection whose port has since been demolished.
    if (_selectedPort && !DroneSystem.isStation(_selectedPort)) _selectedPort = null;
    const o = _tileToScreen(0, 0);

    // Placing a Drone Port: plan it from the map. Every existing network is
    // shown faintly, and a ghost port follows the cursor with the network it
    // would join or start drawn bright -- the same preview the city view's
    // placement ghost draws, so you can site a port before committing.
    if (_placingPort()) {
      const ports = DroneSystem.stations();
      const ghost = _portGhostAt(_mouseSX, _mouseSY);
      const mine = ghost ? DroneSystem.networksFor([...ports, ghost]).find(n => n.squares.some(q => q.port === ghost)) : null;
      for (const net of DroneSystem.networks()) {
        if (mine && net.squares.every(q => mine.squares.some(mm => mm.port === q.port))) continue;
        _drawDroneNetwork(_ctx, net, 0.67, es / TILE, o.x, o.y, 'dim');
      }
      if (mine) {
        _drawDroneNetwork(_ctx, mine, 0.67, es / TILE, o.x, o.y, 'ghost');
        // the ghost port itself, and how many ports its network would span
        // Green where it can go, red where it can't (blocked or unaffordable).
        const ok = _portGhostOk(ghost);
        const p = _tileToScreen(ghost.col, ghost.row);
        const gw = Math.max(4, ghost.width * es), gh = Math.max(4, ghost.height * es);
        _ctx.save();
        _ctx.fillStyle = ok ? 'rgba(90,255,150,0.40)' : 'rgba(255,80,60,0.40)';
        _ctx.strokeStyle = ok ? 'rgba(160,255,190,1)' : 'rgba(255,140,120,1)'; _ctx.lineWidth = 1.5;
        _ctx.fillRect(p.x, p.y, gw, gh);
        _ctx.strokeRect(p.x, p.y, gw, gh);
        // crosshair so the exact spot is easy to line up
        _ctx.strokeStyle = 'rgba(255,255,255,0.55)'; _ctx.lineWidth = 1;
        const cx0 = p.x + gw / 2, cy0 = p.y + gh / 2;
        _ctx.beginPath();
        _ctx.moveTo(cx0 - 10, cy0); _ctx.lineTo(cx0 + 10, cy0);
        _ctx.moveTo(cx0, cy0 - 10); _ctx.lineTo(cx0, cy0 + 10);
        _ctx.stroke();
        const n = mine.squares.length;
        _ctx.font = 'bold 11px Inter, sans-serif'; _ctx.textAlign = 'center'; _ctx.textBaseline = 'bottom';
        _ctx.fillStyle = 'rgba(0,0,0,0.6)';
        const label = (n > 1 ? `Joins network · ${n} ports` : 'New drone network')
                    + (ok ? '  ·  click to place' : '  ·  can’t place here');
        const lw = _ctx.measureText(label).width + 10;
        const lx = p.x + ghost.width * es / 2, ly = p.y - 4;
        _ctx.fillRect(lx - lw / 2, ly - 15, lw, 15);
        _ctx.fillStyle = '#aaf0ff'; _ctx.fillText(label, lx, ly - 2);
        _ctx.restore();
      }
      return;
    }

    const nets = _showDroneNets() ? DroneSystem.networks()
               : _selectedPort ? [DroneSystem.networkOf(_selectedPort)] : [];
    if (!nets.length) return;
    // World px -> map px is es / TILE; lines drawn a touch thinner than in
    // the city view, where they sit over far busier art.
    for (const net of nets) _drawDroneNetwork(_ctx, net, 0.67, es / TILE, o.x, o.y);
  }

  // Every drone that is out, as a small arrowhead pointing along its heading
  // with a trail that lengthens with speed. Coloured by job through the city
  // view's droneAccent (render_drones.js), so a repair run is the same amber
  // on both. Parked drones are left off: their port is already drawn there.
  // Positions are world pixels, updated every frame by DroneSystem.frameTick,
  // and the map redraws every frame while open, so they fly live.
  const DRONE_JOB_LABELS = { repair: 'repair run', wire: 'line service', waste: 'waste haul', cargo: 'cargo run' };
  function _drawDrones(es) {
    if (typeof DroneSystem === 'undefined' || typeof EntityRegistry === 'undefined') return;
    const accent = typeof droneAccent === 'function' ? droneAccent : () => '#5ad8ff';
    // Arrow half-length in map px. A fleet is a handful of objects on a map
    // hundreds of tiles wide, so this floors well above tile scale: at the
    // default zoom a tile is under a pixel and a to-scale drone would vanish.
    const sz = Math.max(5, Math.min(10, 4 + es * 0.8));
    _ctx.save();
    _ctx.lineCap = 'round';
    _ctx.lineJoin = 'round';
    for (const port of EntityRegistry.getByType(T.DRONEPORT)) {
      for (const d of DroneSystem.fleet(port)) {
        if (!DroneSystem.isOut(d)) continue;
        const { x: sx, y: sy } = _tileToScreen(d.x / TILE, d.y / TILE);
        const col = accent(d);
        const ang = d.angle || 0;
        const fx = Math.cos(ang), fy = Math.sin(ang);
        const alt = d.alt === undefined ? 1 : d.alt;

        // Trail: fades out behind the drone, longer the faster it's going.
        const spd = d.v || 0;
        if (spd > 60 && alt > 0.3) {
          const tl = sz * (1.2 + 3.5 * Math.min(1, spd / 600));
          const tg = _ctx.createLinearGradient(sx, sy, sx - fx * tl, sy - fy * tl);
          tg.addColorStop(0, col + 'aa'); tg.addColorStop(1, col + '00');
          _ctx.strokeStyle = tg;
          _ctx.lineWidth = Math.max(1, sz * 0.45);
          _ctx.beginPath(); _ctx.moveTo(sx - fx * sz * 0.4, sy - fy * sz * 0.4);
          _ctx.lineTo(sx - fx * tl, sy - fy * tl); _ctx.stroke();
        }

        // Dark halo first, so the arrow separates from grass, water and the
        // drone network tint alike.
        _ctx.fillStyle = 'rgba(4,10,18,0.55)';
        _ctx.beginPath(); _ctx.arc(sx, sy, sz * 1.15, 0, Math.PI * 2); _ctx.fill();

        // Arrowhead, glowing in the job colour with a dark rim.
        const lx = -fy, ly = fx;                        // left of heading
        _ctx.beginPath();
        _ctx.moveTo(sx + fx * sz,                          sy + fy * sz);
        _ctx.lineTo(sx - fx * sz * 0.7 + lx * sz * 0.75,   sy - fy * sz * 0.7 + ly * sz * 0.75);
        _ctx.lineTo(sx - fx * sz * 0.3,                    sy - fy * sz * 0.3);
        _ctx.lineTo(sx - fx * sz * 0.7 - lx * sz * 0.75,   sy - fy * sz * 0.7 - ly * sz * 0.75);
        _ctx.closePath();
        _ctx.shadowColor = col; _ctx.shadowBlur = 6;
        _ctx.fillStyle = col;
        _ctx.fill();
        _ctx.shadowBlur = 0;
        _ctx.strokeStyle = 'rgba(6,12,20,0.85)';
        _ctx.lineWidth = 1;
        _ctx.stroke();

        if (Math.hypot(_mouseSX - sx, _mouseSY - sy) <= sz + 3) {
          const job = d.job && DRONE_JOB_LABELS[d.job.kind];
          _hoverInfo = { label: job ? `Drone: ${job}` : 'Drone: returning', sx: _mouseSX, sy: _mouseSY };
        }
      }
    }
    _ctx.restore();
  }

  // Lightning rod coverage, with SHOW LIGHTNING ROD COVERAGE on. Same shape
  // the city view draws for a selected rod (_drawRodZone): the footprint
  // inflated by the rod's protectRange with rounded corners, because
  // coverage is measured footprint-edge to footprint-edge -- a circle would
  // misstate which buildings are protected. Violet, so it cannot be misread
  // as drone coverage where the two overlap.
  //
  // A city can have dozens of rods, all overlapping, so only the OUTER edge
  // of their union is drawn. On a scratch layer: stroke every shape, then
  // erase every shape's interior. An edge lying inside another rod's area
  // is erased whole; an edge on the outside keeps its outer half.
  function _drawRodCoverage(es) {
    if (!_showRodCover() || typeof EntityRegistry === 'undefined') return;
    const rods = [];
    for (const t of ROD_TYPES_MAP) for (const r of EntityRegistry.getByType(t)) rods.push(r);
    if (!rods.length) return;
    const o = _tileToScreen(0, 0);
    const shapes = g => {
      g.beginPath();
      for (const rod of rods) {
        const R  = (rod.def?.protectRange ?? EntityDefs[rod.type]?.protectRange ?? 7) * es;
        const x0 = o.x + rod.col * es, y0 = o.y + rod.row * es;
        const x1 = x0 + (rod.width || 1) * es, y1 = y0 + (rod.height || 1) * es;
        g.moveTo(x0, y0 - R);
        g.lineTo(x1, y0 - R); g.arc(x1, y0, R, -Math.PI / 2, 0);
        g.lineTo(x1 + R, y1); g.arc(x1, y1, R, 0, Math.PI / 2);
        g.lineTo(x0, y1 + R); g.arc(x0, y1, R, Math.PI / 2, Math.PI);
        g.lineTo(x0 - R, y0); g.arc(x0, y0, R, Math.PI, Math.PI * 1.5);
        g.closePath();
      }
    };
    // Tint: one fill over every shape, so overlaps do not stack darker.
    _ctx.save();
    shapes(_ctx);
    _ctx.fillStyle = 'rgba(150,80,255,0.24)';
    _ctx.fill();
    _ctx.restore();

    if (!_rodCanvas) _rodCanvas = document.createElement('canvas');
    if (_rodCanvas.width !== _canvas.width || _rodCanvas.height !== _canvas.height) {
      _rodCanvas.width = _canvas.width; _rodCanvas.height = _canvas.height;
    }
    const g = _rodCanvas.getContext('2d');
    g.clearRect(0, 0, _rodCanvas.width, _rodCanvas.height);
    // Twice the visible widths: the erase pass takes the inner half away.
    shapes(g);
    g.strokeStyle = 'rgba(10,4,24,0.6)';
    g.lineWidth = 8;
    g.stroke();
    g.setLineDash([8, 5]);
    g.strokeStyle = 'rgba(170,110,255,1)';
    g.lineWidth = 4;
    g.stroke();
    g.setLineDash([]);
    g.globalCompositeOperation = 'destination-out';
    g.fill();
    g.globalCompositeOperation = 'source-over';
    _ctx.drawImage(_rodCanvas, 0, 0);

    // The rods themselves are not in the building layer (too small to read
    // at map scale), so mark each one: the coverage should say where it
    // comes from.
    _ctx.save();
    for (const rod of rods) {
      const c = _tileToScreen(rod.col + (rod.width || 1) / 2, rod.row + (rod.height || 1) / 2);
      _ctx.beginPath(); _ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
      _ctx.fillStyle = '#e6d8ff'; _ctx.fill();
      _ctx.strokeStyle = 'rgba(40,10,80,0.9)'; _ctx.lineWidth = 1.5; _ctx.stroke();
    }
    _ctx.restore();
  }

  // Wires, poles and power towers, with SHOW POWER LINES on. Each network
  // gets its own hue so separate grids read apart at a glance; a network
  // that is actually delivering power (some building on it is powered) is
  // drawn bright and solid, one that isn't is the same hue dimmed and dashed.
  // A faulted or burnt-out span is red whatever network it's on.
  const LINE_HUES = ['#40d8ff', '#ffb040', '#60f080', '#ff70c0', '#b090ff', '#f0f060', '#ff7050', '#50f0d0'];
  const LINE_TYPES = [T.WIRE, T.POLE, T.POWERTOWER].filter(v => v !== undefined);
  // Every separate run of lines, numbered 1..n, with its hue, whether it's
  // delivering power, and the conductor nearest its middle (where the map
  // tag goes). Shared by the line layer and the legend.
  //
  // Grouped here rather than read straight off networkId: the power pass
  // only merges conductors into one network when power reaches them, so a
  // dead run comes back with every wire and pole on its own id. A run is
  // conductors that touch, plus anything the power pass says shares a live
  // network (which also joins runs linked through a building). Numbered by
  // each run's top-left tile, so the numbers stay put while nothing's built.
  let _netsCache = null, _netsAt = 0;
  function _powerNets() {
    const now = performance.now();
    if (_netsCache && now - _netsAt < 250) return _netsCache;
    const conductors = [];
    for (const t of LINE_TYPES) for (const e of EntityRegistry.getByType(t)) conductors.push(e);
    const idx = new Map(conductors.map((e, i) => [e, i]));
    const parent = conductors.map((_, i) => i);
    const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
    const firstOnNet = new Map();
    conductors.forEach((e, i) => {
      const w = e.width || 1, h = e.height || 1;
      for (const [nc, nr] of [[e.col + w, e.row], [e.col, e.row + h]]) {
        const n = GridManager.getEntity(nc, nr);
        if (n && n !== e && idx.has(n)) union(i, idx.get(n));
      }
      if (e.networkId >= 0) {
        if (firstOnNet.has(e.networkId)) union(i, firstOnNet.get(e.networkId));
        else firstOnNet.set(e.networkId, i);
      }
    });
    const running = new Set();
    for (const e of EntityRegistry.all()) {
      if (e.powered && e.networkId >= 0 && !LINE_TYPES.includes(e.type)) running.add(e.networkId);
    }
    const groups = new Map();
    conductors.forEach((e, i) => {
      const r = find(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(e);
    });
    const order = e => e.row * COLS + e.col;
    const lists = [...groups.values()].map(list => ({ list, key: Math.min(...list.map(order)) }))
      .sort((a, b) => a.key - b.key);
    const netOf = new Map();
    const nets = lists.map(({ list }, i) => {
      let sc = 0, sr = 0;
      for (const e of list) { sc += e.col; sr += e.row; }
      sc /= list.length; sr /= list.length;
      let tag = list[0], best = Infinity;
      for (const e of list) { const d = (e.col - sc) ** 2 + (e.row - sr) ** 2; if (d < best) { best = d; tag = e; } }
      const net = { id: i, num: i + 1, hue: LINE_HUES[i % LINE_HUES.length],
                    running: list.some(e => running.has(e.networkId)), tag };
      for (const e of list) netOf.set(e, net);
      return net;
    });
    const faulted = conductors.filter(e => e.failed || e._weatherFailed).length;
    _netsCache = { conductors, nets, netOf, faulted };
    _netsAt = now;
    return _netsCache;
  }

  function _drawPowerLines(es) {
    if (!_showPowerLines() || typeof EntityRegistry === 'undefined') return;
    const isLine = e => !!e && LINE_TYPES.includes(e.type);
    const { conductors, nets, netOf } = _powerNets();
    if (!conductors.length) return;
    // Hovering a network in the legend spotlights it; the rest fade back.
    const focus = _legendHover && _legendHover.kind === 'powernet' ? _legendHover.type : null;
    // A conductor's style depends only on its network and whether it is
    // faulted, so it is worked out once per network a frame (this runs for
    // every wire and pole on the map, every frame the map is up).
    const _styles = new Map();
    const styleOf = e => {
      const net = netOf.get(e);
      const fault = !!(e.failed || e._weatherFailed);
      const sk = fault ? 'f' + (net ? net.id : '') : (net || 'none');
      let st = _styles.get(sk);
      if (st) return st;
      const dim = focus !== null && (focus === 'fault' ? !fault : !net || net.id !== focus);
      if (fault) st = { color: '#ff4040', live: true, dim, key: 'fault' + dim };
      else {
        const hue = net ? net.hue : '#8090a0';
        const live = !!net && net.running;
        st = { color: hue, live, dim, key: hue + (live ? '1' : '0') + dim };
      }
      _styles.set(sk, st);
      return st;
    };
    const centre = e => _tileToScreen(e.col + (e.width || 1) / 2, e.row + (e.height || 1) / 2);

    // One path per style: segments between neighbouring conductors, drawn to
    // the right and down only so each link is laid once.
    const paths = new Map();
    const pathFor = st => {
      if (!paths.has(st.key)) paths.set(st.key, { st, segs: new Path2D(), dots: new Path2D() });
      return paths.get(st.key);
    };
    const dotR = Math.max(1.4, es * 0.45);
    for (const e of conductors) {
      const st = styleOf(e);
      const p = pathFor(st);
      const a = centre(e);
      const w = e.width || 1, h = e.height || 1;
      for (let k = 0; k < 2; k++) {
        const n = k ? GridManager.getEntity(e.col, e.row + h) : GridManager.getEntity(e.col + w, e.row);
        if (!isLine(n) || n === e) continue;
        const b = centre(n);
        p.segs.moveTo(a.x, a.y); p.segs.lineTo(b.x, b.y);
      }
      // Poles and towers as dots; wires only once zoomed in enough to matter.
      const r = e.type === T.WIRE ? (es >= 3 ? dotR * 0.6 : 0) : e.type === T.POWERTOWER ? dotR * 1.8 : dotR * 1.25;
      if (r > 0) { p.dots.moveTo(a.x + r, a.y); p.dots.arc(a.x, a.y, r, 0, Math.PI * 2); }
    }

    _ctx.save();
    _ctx.lineCap = 'round';
    const lw = Math.max(1.5, es * 0.35);
    // Dead networks first, so live lines sit on top where they cross.
    const ordered = [...paths.values()].sort((x, y) => (x.st.live ? 1 : 0) - (y.st.live ? 1 : 0));
    for (const { st, segs, dots } of ordered) {
      _ctx.globalAlpha = (st.live ? 1 : 0.45) * (st.dim ? 0.25 : 1);
      _ctx.setLineDash(st.live ? [] : [Math.max(3, es), Math.max(3, es)]);
      // Dark casing under the colour so lines read over any terrain.
      _ctx.strokeStyle = 'rgba(2,6,12,0.85)';
      _ctx.lineWidth = lw + 2;
      _ctx.stroke(segs);
      _ctx.strokeStyle = st.color;
      _ctx.lineWidth = lw;
      if (st.live) { _ctx.shadowColor = st.color; _ctx.shadowBlur = 4; }
      _ctx.stroke(segs);
      _ctx.shadowBlur = 0;
      _ctx.setLineDash([]);
      _ctx.fillStyle = st.color;
      _ctx.fill(dots);
      _ctx.strokeStyle = 'rgba(2,6,12,0.9)';
      _ctx.lineWidth = 1;
      _ctx.stroke(dots);
    }

    // Hovering "Power Pole" / "Power Tower" in the legend rings each one.
    if (_legendHover && _legendHover.kind === 'powerpart') {
      _ctx.globalAlpha = 1;
      _ctx.shadowColor = '#ffffff';
      _ctx.shadowBlur = 8;
      _ctx.strokeStyle = '#ffffff';
      _ctx.lineWidth = 1.5;
      for (const e of conductors) {
        if (e.type !== _legendHover.type) continue;
        const c = centre(e);
        _ctx.beginPath(); _ctx.arc(c.x, c.y, Math.max(4, es * 0.9), 0, Math.PI * 2); _ctx.stroke();
      }
      _ctx.shadowBlur = 0;
    }

    _ctx.restore();
    // The network number tags go on last of all (_drawNetTags), so nothing
    // drawn on the map after the lines can ever cover them.
    _netTags = { nets, focus };
  }

  // Network number tags, matching the legend ("1", "2", ...), at the
  // conductor nearest each network's middle. Drawn after everything else
  // inside the map (buildings, contamination, drones, the viewport box, the
  // compass), from what _drawPowerLines left this frame.
  let _netTags = null;
  function _drawNetTags() {
    const q = _netTags;
    _netTags = null;
    if (!q) return;
    _ctx.save();
    _ctx.globalAlpha = 1;
    _ctx.font = 'bold 9px Inter, Arial, sans-serif';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    for (const n of q.nets) {
      if (q.focus !== null && q.focus !== n.id) continue;
      const c = _tileToScreen(n.tag.col + (n.tag.width || 1) / 2, n.tag.row + (n.tag.height || 1) / 2);
      const label = String(n.num);
      const tw = Math.max(14, _ctx.measureText(label).width + 8);
      const bx = c.x - tw / 2, by = c.y - 18;
      _ctx.fillStyle = 'rgba(6,12,20,0.92)';
      _ctx.strokeStyle = n.hue;
      _ctx.lineWidth = 1.2;
      _ctx.beginPath(); _ctx.roundRect(bx, by, tw, 13, 6); _ctx.fill(); _ctx.stroke();
      _ctx.fillStyle = n.hue;
      _ctx.fillText(label, c.x, by + 7);
    }
    _ctx.restore();
  }

  // Tooltip for the wire / pole / tower under the cursor: its name, which
  // network it's on and whether that network is running. A wire also shows
  // its load against its limit; a faulted one says so.
  function _powerLineHover(es, ox, oy, mW, mH) {
    if (!_showPowerLines() || typeof EntityRegistry === 'undefined') return;
    if (_mouseSX < ox || _mouseSX > ox + mW || _mouseSY < oy || _mouseSY > oy + mH) return;
    const { conductors, netOf } = _powerNets();
    const reach = Math.max(6, es * 0.8);
    let hit = null, best = reach * reach;
    for (const e of conductors) {
      const c = _tileToScreen(e.col + (e.width || 1) / 2, e.row + (e.height || 1) / 2);
      const d = (c.x - _mouseSX) ** 2 + (c.y - _mouseSY) ** 2;
      // Poles and towers win ties with the wire beside them.
      const bias = e.type === T.WIRE ? 1.5 : 1;
      if (d * bias < best) { best = d * bias; hit = e; }
    }
    if (!hit) return;
    const net = netOf.get(hit);
    const name = EntityDefs[hit.type]?.label || 'Wire';
    const netTxt = net ? `Network ${net.num} · ${net.running ? 'running' : 'no power'}` : 'not connected';
    let label = `${name}: ${netTxt}`;
    if (hit.failed || hit._weatherFailed) label = `${name}: FAULTED · ${netTxt}`;
    else if (hit.type === T.WIRE && hit._effectiveThreshold) {
      label += ` · ${Math.round(hit.load || 0)}/${formatPower(Math.round(hit._effectiveThreshold))}`;
    }
    _hoverInfo = { label, sx: _mouseSX, sy: _mouseSY };
  }

  // The map title, shared with the toggle layout so the pills can steer
  // clear of it.
  function _titleText() {
    const city = (typeof CityInfo !== 'undefined' && CityInfo.getCityName && CityInfo.getCityName()) || '';
    return city ? 'WORLD MAP  ·  ' + city.toUpperCase() : 'WORLD MAP';
  }

  // Overlay toggles above the map, filled in right to left from the top-right
  // corner. One that would run into the centred title goes on the LEFT of it
  // instead, filling in from the top-left corner.
  function _drawToggles(ox, oy, mW) {
    _ctx.save();
    _ctx.font = 'bold 12px Inter, Arial, sans-serif';
    const titleHalf = (_ctx.measureText(_titleText()).width + 28) / 2;
    _ctx.restore();
    const midX = window.innerWidth / 2;
    let right = ox + mW, left = ox;
    for (const tg of _overlayToggles) {
      tg.rect = null;
      if (typeof EntityRegistry === 'undefined' || !tg.offered()) continue;
      _ctx.save();
      _ctx.font = 'bold 10px Inter, Arial, sans-serif';
      const box = 11, pad = 9, gap = 7;
      const w = pad + box + gap + Math.ceil(_ctx.measureText(tg.label).width) + pad;
      const h = 20, y = oy - 30;
      let x;
      if (right - w >= midX + titleHalf + 8) { x = right - w; right = x - 8; }
      else                                   { x = left;     left  = x + w + 8; }
      tg.rect = { x, y, w, h };
      const hot = _inRect(tg.rect, _mouseSX, _mouseSY);
      _ctx.fillStyle = hot ? 'rgba(16,30,46,0.95)' : 'rgba(8,14,24,0.92)';
      _ctx.strokeStyle = tg.on ? tg.color : 'rgba(120,200,255,0.5)';
      _ctx.lineWidth = 1;
      _ctx.beginPath(); _ctx.roundRect(x, y, w, h, 10); _ctx.fill(); _ctx.stroke();
      // Checkbox
      const bx = x + pad, by = y + (h - box) / 2;
      _ctx.strokeStyle = tg.color;
      _ctx.strokeRect(bx + 0.5, by + 0.5, box - 1, box - 1);
      if (tg.on) {
        _ctx.fillStyle = tg.color;
        _ctx.fillRect(bx + 2, by + 2, box - 4, box - 4);
        _ctx.strokeStyle = '#06121c'; _ctx.lineWidth = 1.6;
        _ctx.beginPath();
        _ctx.moveTo(bx + 3, by + box / 2); _ctx.lineTo(bx + box / 2 - 0.5, by + box - 3.5); _ctx.lineTo(bx + box - 2.5, by + 3);
        _ctx.stroke();
      }
      _ctx.fillStyle = tg.on ? tg.ink : 'rgba(191,232,255,0.75)';
      _ctx.textBaseline = 'middle';
      _ctx.fillText(tg.label, bx + box + gap, y + h / 2 + 0.5);
      _ctx.restore();
    }
  }

  // On a contract: everything past the site's edge blacked out, then the site
  // boundary and each named zone with its label, styled like the ones on the
  // ground (ContractSystem.renderLabels).
  function _drawSiteZones(ox, oy, mW, mH) {
    const job = _siteJob();
    if (!job) return;
    const es = _effScale();
    const rect = (m) => {
      const { x, y } = _tileToScreen(m.minC, m.minR);
      return { x, y, w: (m.maxC - m.minC + 1) * es, h: (m.maxR - m.minR + 1) * es };
    };
    const s = rect(job.bounds);
    _ctx.save();
    _ctx.fillStyle = '#060a11';
    _ctx.beginPath();
    _ctx.rect(ox, oy, mW, mH);
    _ctx.rect(s.x, s.y, s.w, s.h);
    _ctx.fill('evenodd');
    _ctx.strokeStyle = 'rgba(90,168,255,0.55)';
    _ctx.lineWidth = 1.5;
    _ctx.setLineDash([8, 6]);
    _ctx.strokeRect(s.x, s.y, s.w, s.h);
    _ctx.setLineDash([]);

    _ctx.font = 'bold 12px monospace';
    _ctx.textAlign = 'left';
    _ctx.textBaseline = 'middle';
    for (const m of Object.values(job.markers || {})) {
      const z = rect(m);
      _ctx.fillStyle = 'rgba(90,168,255,0.10)';
      _ctx.fillRect(z.x, z.y, z.w, z.h);
      _ctx.strokeStyle = '#6eb8ff';
      _ctx.lineWidth = 1.5;
      _ctx.strokeRect(z.x, z.y, z.w, z.h);
      const text = m.label.toUpperCase();
      const tagW = _ctx.measureText(text).width + 16, tagH = 20;
      // On the zone's top-left corner, kept on the map when the corner is
      // panned off or the zone runs up to the top of the site.
      const tx = Math.max(ox + 2, Math.min(ox + mW - tagW - 2, z.x));
      const ty = Math.max(oy + 2, Math.min(oy + mH - tagH - 2, z.y - tagH));
      _ctx.fillStyle = 'rgba(6,16,30,0.95)';
      _ctx.fillRect(tx, ty, tagW, tagH);
      _ctx.strokeStyle = '#6eb8ff';
      _ctx.strokeRect(tx, ty, tagW, tagH);
      _ctx.fillStyle = '#6eb8ff';
      _ctx.fillRect(tx, ty, 4, tagH);
      _ctx.fillStyle = '#eaf5ff';
      _ctx.fillText(text, tx + 10, ty + tagH / 2 + 0.5);
    }
    _ctx.restore();
  }

  // Pending property request (while its panel is open) and the relocate
  // picker. Screen-sized pins: a zoomed-out map is only a couple of pixels
  // per tile, so a world-scaled marker would disappear.
  function _drawPlacementOptions() {
    const pins = [];
    const letter = i => 'ABCDEFG'[i] || String(i + 1);
    if (typeof HouseRequestSystem !== 'undefined') {
      const req = HouseRequestSystem.getActivePendingRequest?.();
      if (req?.locations?.length) {
        const color = req.isIndustrial ? '#ff8040' : req.isCommercial ? '#f0c040' : '#00d4ff';
        const kind  = req.isIndustrial ? 'Industrial' : req.isCommercial ? 'Commercial' : 'Residential';
        req.locations.forEach((loc, i) => {
          if (!loc || loc.col == null) return;
          pins.push({
            loc, i, color,
            fw: req._width || 1, fh: req._height || 1,
            tip: `${req.family || kind}: option ${letter(i)}`,
          });
        });
      }
    }
    // A zone's Cell Tower / Fiber Hub / EV station request: the spot it marks.
    if (typeof ZoneRequestSystem !== 'undefined' && ZoneRequestSystem.markers
        && !(typeof ContractSystem !== 'undefined' && ContractSystem.isAway())) {
      for (const m of ZoneRequestSystem.markers()) {
        if (!m.spot) continue;
        pins.push({
          loc: m.spot, i: pins.length, color: m.urgent ? '#ff8040' : m.color, fw: m.w, fh: m.h, mark: '+',
          tip: `${m.zoneLabel} wants a ${EntityDefs[m.itemType]?.label || 'building'} here`,
        });
      }
    }
    if (typeof RelocatePicker !== 'undefined' && RelocatePicker.active) {
      const ent = RelocatePicker.entity;
      (RelocatePicker.locations || []).forEach((loc, i) => {
        if (!loc || loc.col == null) return;
        pins.push({
          loc, i, color: '#f0c040',
          fw: ent ? (ent.width || 1) : 1,
          fh: ent ? (ent.height || 1) : 1,
          tip: `Relocate: option ${letter(i)}`,
        });
      });
    }
    if (!pins.length) return;

    const t  = performance.now() / 1000;
    const es = _effScale();
    for (const p of pins) {
      const { loc, i, color, fw, fh, tip } = p;
      const { x: fx, y: fy } = _tileToScreen(loc.col, loc.row);
      const dw = fw * es, dh = fh * es;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3 + i * 0.9);
      const hx = fx + dw / 2;
      const hy = fy + dh / 2;
      const headR = 9;

      _ctx.save();
      if (dw >= 2 && dh >= 2) {
        _ctx.globalAlpha = 0.22 + 0.12 * pulse;
        _ctx.fillStyle = color;
        _ctx.fillRect(fx, fy, dw, dh);
        _ctx.globalAlpha = 0.85;
        _ctx.strokeStyle = color;
        _ctx.lineWidth = 1.5;
        _ctx.setLineDash([4, 3]);
        _ctx.strokeRect(fx + 0.5, fy + 0.5, Math.max(1, dw - 1), Math.max(1, dh - 1));
        _ctx.setLineDash([]);
      }

      const rp = (t * 0.7 + i * 0.33) % 1;
      _ctx.globalAlpha = 0.65 * (1 - rp);
      _ctx.strokeStyle = color;
      _ctx.lineWidth = 1.5;
      _ctx.beginPath();
      _ctx.arc(hx, hy, headR * (0.6 + rp * 1.6), 0, Math.PI * 2);
      _ctx.stroke();

      _ctx.globalAlpha = 1;
      _ctx.shadowColor = color;
      _ctx.shadowBlur = 10;
      _ctx.fillStyle = color;
      _ctx.beginPath();
      _ctx.arc(hx, hy, headR, 0, Math.PI * 2);
      _ctx.fill();
      _ctx.shadowBlur = 0;
      _ctx.fillStyle = '#070a0d';
      _ctx.beginPath();
      _ctx.arc(hx, hy, headR - 2.5, 0, Math.PI * 2);
      _ctx.fill();
      _ctx.fillStyle = color;
      _ctx.font = 'bold 11px Arial, sans-serif';
      _ctx.textAlign = 'center';
      _ctx.textBaseline = 'middle';
      _ctx.fillText(p.mark || letter(i), hx, hy + 0.5);
      _ctx.restore();

      const dx = _mouseSX - hx, dy = _mouseSY - hy;
      const onPin = dx * dx + dy * dy <= (headR + 3) * (headR + 3);
      const onLot = _mouseSX >= fx && _mouseSX <= fx + Math.max(dw, 8) &&
                    _mouseSY >= fy && _mouseSY <= fy + Math.max(dh, 8);
      if (onPin || onLot) _hoverInfo = { label: tip, sx: _mouseSX, sy: _mouseSY };
    }
  }

  function _drawCompass(cx, cy) {
    _ctx.save();
    _ctx.globalAlpha = 0.85;
    _ctx.fillStyle = 'rgba(6,12,20,0.6)';
    _ctx.beginPath(); _ctx.arc(cx, cy, 20, 0, Math.PI * 2); _ctx.fill();
    _ctx.strokeStyle = 'rgba(160,215,255,0.45)'; _ctx.lineWidth = 1;
    _ctx.beginPath(); _ctx.arc(cx, cy, 20, 0, Math.PI * 2); _ctx.stroke();
    // four points; north in red
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 - Math.PI / 2;
      _ctx.fillStyle = k === 0 ? '#ff7060' : 'rgba(210,230,245,0.8)';
      _ctx.beginPath();
      _ctx.moveTo(cx + Math.cos(a) * 16, cy + Math.sin(a) * 16);
      _ctx.lineTo(cx + Math.cos(a + Math.PI / 2) * 4, cy + Math.sin(a + Math.PI / 2) * 4);
      _ctx.lineTo(cx + Math.cos(a - Math.PI / 2) * 4, cy + Math.sin(a - Math.PI / 2) * 4);
      _ctx.closePath(); _ctx.fill();
    }
    _ctx.fillStyle = '#ffffff';
    _ctx.font = 'bold 9px Inter, Arial, sans-serif';
    _ctx.textAlign = 'center'; _ctx.textBaseline = 'middle';
    _ctx.fillText('N', cx, cy - 27);
    _ctx.restore();
  }

  // A bar that stays a round number of tiles, whatever the zoom.
  function _drawScaleBar(x, y, es) {
    const nice = [5, 10, 25, 50, 100, 200];
    let tiles = nice[nice.length - 1];
    for (const n of nice) if (n * es >= 60) { tiles = n; break; }
    const len = tiles * es;
    _ctx.save();
    _ctx.fillStyle = 'rgba(6,12,20,0.6)';
    _ctx.fillRect(x - 6, y - 14, len + 12, 22);
    _ctx.strokeStyle = 'rgba(220,235,250,0.85)'; _ctx.lineWidth = 1.5;
    _ctx.beginPath(); _ctx.moveTo(x, y - 4); _ctx.lineTo(x, y); _ctx.lineTo(x + len, y); _ctx.lineTo(x + len, y - 4); _ctx.stroke();
    _ctx.fillStyle = 'rgba(220,235,250,0.85)';
    _ctx.font = '9px Inter, Arial, sans-serif';
    _ctx.textAlign = 'center'; _ctx.textBaseline = 'alphabetic';
    _ctx.fillText(tiles + ' tiles', x + len / 2, y - 5);
    _ctx.restore();
    return len;
  }

  // The tile under the cursor, in a box beside the scale bar: the same
  // column / row the grid lines count in, so a spot can be read off, noted
  // and found again. Dashes while the cursor is off the map. The box is
  // sized for the widest reading so it doesn't twitch as the digits change.
  function _drawCursorCoords(x, y, ox, oy, mW, mH) {
    let label = 'X —   Y —';
    if (_mouseSX >= ox && _mouseSX <= ox + mW && _mouseSY >= oy && _mouseSY <= oy + mH) {
      const { col, row } = _screenToTile(_mouseSX, _mouseSY);
      if (col >= 0 && col < COLS && row >= 0 && row < ROWS) label = `X ${Math.floor(col)}   Y ${Math.floor(row)}`;
    }
    _ctx.save();
    _ctx.font = '10px "JetBrains Mono", "Courier New", monospace';
    const w = _ctx.measureText(`X ${COLS}   Y ${ROWS}`).width;
    _ctx.fillStyle = 'rgba(6,12,20,0.6)';
    _ctx.fillRect(x - 6, y - 14, w + 12, 22);
    _ctx.fillStyle = 'rgba(220,235,250,0.9)';
    _ctx.textAlign = 'left'; _ctx.textBaseline = 'middle';
    _ctx.fillText(label, x, y - 2.5);
    _ctx.restore();
  }

  function _drawZones(es) {
    if (typeof ZoneSystem === 'undefined') return;
    for (const [ztype, style] of Object.entries(ZONE_MAP_STYLES)) {
      const rects = ZoneSystem.getZoneRects?.(ztype);
      if (!rects || !rects.length) continue;
      const isLegendMatch = _isHL('zone', ztype);

      rects.forEach((rect, i) => {
        const { x: sx, y: sy } = _tileToScreen(rect.minC, rect.minR);
        const sw = (rect.maxC - rect.minC + 1) * es;
        const sh = (rect.maxR - rect.minR + 1) * es;

        _ctx.fillStyle = style.fill;
        _ctx.fillRect(sx, sy, sw, sh);

        _ctx.save();
        _ctx.strokeStyle = style.border;
        _ctx.lineWidth = 1.5;
        _ctx.setLineDash([5, 3]);
        _ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
        _ctx.restore();

        // Legend-hover highlight — bright solid glow ring
        if (isLegendMatch) {
          _ctx.save();
          _ctx.shadowColor = '#ffffff';
          _ctx.shadowBlur = 8;
          _ctx.strokeStyle = '#ffffff';
          _ctx.lineWidth = 2;
          _ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);
          _ctx.restore();
        }

        if (es >= 3) {
          // Player-renamed zones (and labelled gov zones) show the same name as in-game.
          const label = rect.name || rect.label || (rects.length > 1 ? `${style.label} ${i + 1}` : style.label);
          _ctx.fillStyle = style.border;
          _ctx.font = `bold ${Math.max(8, Math.round(Math.min(11, es * 0.5)))}px monospace`;
          _ctx.textAlign = 'left';
          _ctx.fillText(label, sx + 3, sy + 11);
        }
      });
    }
  }

  function _drawHoverTooltip({ label, sx, sy }) {
    _ctx.save();
    _ctx.font = '10px monospace';
    const padX = 6, padY = 4;
    const textW = _ctx.measureText(label).width;
    const boxW  = textW + padX * 2;
    const boxH  = 10 + padY * 2;
    // Offset from cursor; flip to the left/above near screen edges
    let bx = sx + 14;
    let by = sy + 14;
    if (bx + boxW > window.innerWidth)  bx = sx - boxW - 10;
    if (by + boxH > window.innerHeight) by = sy - boxH - 10;

    _ctx.fillStyle = 'rgba(10,14,10,0.9)';
    _ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    _ctx.lineWidth = 1;
    _ctx.beginPath();
    _ctx.roundRect(bx, by, boxW, boxH, 3);
    _ctx.fill();
    _ctx.stroke();

    _ctx.fillStyle = 'rgba(255,255,255,0.9)';
    _ctx.textAlign = 'left';
    _ctx.fillText(label, bx + padX, by + boxH - padY - 1);
    _ctx.restore();
  }

  // Build the list of legend sections currently relevant to what's on the
  // map — deposits discovered, zone types placed, and building types placed.
  // Nothing is hard-coded to always show; each section only appears (and
  // each entry within it only appears) if it actually exists right now.
  // Stage-coloured rings for every live contamination zone (see
  // LightningDamageSystem): the inner (severe) zone and the outer ring one
  // stage milder, measured from the source footprint's edge like the blast.
  // A pulsing ☢ marks ground zero; hovering inside shows stage + countdown.
  function _drawContamination(es) {
    const zones = (typeof LightningDamageSystem !== 'undefined' && LightningDamageSystem.getContaminationZones)
      ? LightningDamageSystem.getContaminationZones() : [];
    if (!zones.length) return;
    const tNow = performance.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(tNow * 2);
    for (const z of zones) {
      for (const [r, lv] of [[z.rOut, z.outer], [z.rIn, z.inner]]) {
        if (!lv) continue;
        const { x, y } = _tileToScreen(z.col - r, z.row - r);
        const w = (z.w + 2 * r) * es, h = (z.h + 2 * r) * es, rr = r * es;
        _ctx.beginPath(); _ctx.roundRect(x, y, w, h, rr);
        _ctx.fillStyle = `rgba(${lv.rgb},${(0.16 + 0.08 * pulse).toFixed(3)})`;
        _ctx.fill();
        _ctx.strokeStyle = `rgba(${lv.rgb},0.9)`;
        _ctx.lineWidth = 1.5;
        _ctx.setLineDash([6, 4]); _ctx.lineDashOffset = -tNow * 12;
        _ctx.stroke(); _ctx.setLineDash([]); _ctx.lineDashOffset = 0;
      }
      const c = _tileToScreen(z.col + z.w / 2, z.row + z.h / 2);
      const ir = Math.max(7, es * 2.2);
      _ctx.save();
      _ctx.shadowColor = `rgb(${z.inner.rgb})`; _ctx.shadowBlur = 8 + 8 * pulse;
      _ctx.fillStyle = 'rgba(20,6,2,0.9)';
      _ctx.beginPath(); _ctx.arc(c.x, c.y, ir, 0, Math.PI * 2); _ctx.fill();
      _ctx.restore();
      _ctx.fillStyle = `rgb(${z.inner.rgb})`;
      _ctx.font = `bold ${Math.round(ir * 1.3)}px sans-serif`;
      _ctx.textAlign = 'center'; _ctx.textBaseline = 'middle';
      _ctx.fillText('☢', c.x, c.y + 0.5);
      _ctx.textBaseline = 'alphabetic'; _ctx.textAlign = 'left';

      // Hover anywhere inside the outer ring (edge distance, as the zones are measured).
      const mc = (_mouseSX - _tileToScreen(0, 0).x) / es, mr = (_mouseSY - _tileToScreen(0, 0).y) / es;
      const dx = Math.max(0, z.col - mc, mc - (z.col + z.w)), dy = Math.max(0, z.row - mr, mr - (z.row + z.h));
      const d = Math.hypot(dx, dy);
      if (d <= z.rOut) {
        const lv = d <= z.rIn ? z.inner : z.outer;
        if (lv) {
          const next = lv.level === 1 ? 'recovers' : 'eases';
          _hoverInfo = { label: `☢ ${lv.name}: ${next} in ${z.hoursLabel}`, sx: _mouseSX, sy: _mouseSY };
        }
      }
    }
  }

  function _buildLegendSections() {
    const sections = [];

    // Deposits
    const depSeen = new Map();
    for (const d of _discoveries) {
      const info = DEPOSIT_COLORS[d.type];
      if (!info) continue;
      if (!depSeen.has(info.label)) depSeen.set(info.label, { swatch: 'dot', color: info.fill, label: info.label, kind: 'deposit', type: d.type, count: 0 });
      depSeen.get(info.label).count++;
    }
    if (depSeen.size) sections.push({ title: 'DEPOSITS', entries: [...depSeen.values()] });

    // Zones
    if (typeof ZoneSystem !== 'undefined') {
      const zoneEntries = [];
      for (const [ztype, style] of Object.entries(ZONE_MAP_STYLES)) {
        const rects = ZoneSystem.getZoneRects?.(ztype);
        if (rects && rects.length) zoneEntries.push({ swatch: 'square', color: style.border, label: style.label, kind: 'zone', type: ztype, count: rects.length });
      }
      if (zoneEntries.length) sections.push({ title: 'ZONES', entries: zoneEntries });
    }

    // Contamination — one entry per stage currently on the map
    if (typeof LightningDamageSystem !== 'undefined' && LightningDamageSystem.getContaminationZones) {
      const seen = new Map();
      for (const z of LightningDamageSystem.getContaminationZones()) {
        for (const lv of [z.inner, z.outer]) {
          if (!lv) continue;
          if (!seen.has(lv.level)) seen.set(lv.level, { swatch: 'square', color: `rgb(${lv.rgb})`, label: lv.name, kind: 'contam', type: lv.level, count: 0 });
          seen.get(lv.level).count++;
        }
      }
      if (seen.size) sections.push({ title: 'CONTAMINATION', entries: [...seen.values()].sort((a, b) => b.type - a.type) });
    }

    // Power lines — one entry per network, numbered like the map tags.
    if (typeof EntityRegistry !== 'undefined' && _showPowerLines()) {
      const { nets, faulted } = _powerNets();
      const entries = nets.map(n => ({
        swatch: n.running ? 'line' : 'dash', color: n.hue,
        label: `Network ${n.num} · ${n.running ? 'running' : 'no power'}`, kind: 'powernet', type: n.id,
      }));
      if (faulted) entries.push({ swatch: 'line', color: '#ff4040', label: 'Faulted wire', kind: 'powernet', type: 'fault', count: faulted });
      // The dots along the lines, so they're named too.
      for (const t of [T.POLE, T.POWERTOWER]) {
        if (t === undefined || !EntityRegistry.getByType(t).size) continue;
        entries.push({ swatch: 'dot', color: '#d8ecff', label: EntityDefs[t]?.label || 'Pole', kind: 'powerpart', type: t, count: EntityRegistry.getByType(t).size });
      }
      if (entries.length) sections.push({ title: 'POWER LINES', entries });
    }

    // Buildings — only types with at least one live instance on the map
    if (typeof EntityRegistry !== 'undefined') {
      const buildingEntries = [];
      for (const [type, color] of ENTITY_COLOR_MAP) {
        if (SKIP_DRAW.has(type)) continue;
        let list;
        try { list = EntityRegistry.getByType(type); } catch(err) { continue; }
        if (!list || list.size === 0) continue;
        const label = (typeof EntityDefs !== 'undefined' && EntityDefs[type]?.label) || type;
        buildingEntries.push({ swatch: 'square', color, label, kind: 'building', type, count: list.size });
      }
      if (buildingEntries.length) sections.push({ title: 'BUILDINGS', entries: buildingEntries });
    }

    return sections;
  }

  // Buildings whose own name matches the query. A city has thousands of
  // named customers and this runs every frame the map is open, so the scan
  // is redone only when the query changes or once a second.
  function _namedMatches(q) {
    const now = performance.now();
    if (_namedCache.q === q && now - _namedCache.at < 1000) return _namedCache.list;
    const list = [];
    if (q && typeof EntityRegistry !== 'undefined') {
      outer: for (const [type, color] of ENTITY_COLOR_MAP) {
        if (SKIP_DRAW.has(type)) continue;
        let ents;
        try { ents = EntityRegistry.getByType(type); } catch (err) { continue; }
        if (!ents) continue;
        for (const e of ents) {
          if (!e.businessName || e.col == null || !e.businessName.toLowerCase().includes(q)) continue;
          list.push({ swatch: 'square', color, label: e.businessName, kind: 'entity', type: e });
          if (list.length >= NAMED_MAX) break outer;
        }
      }
    }
    _namedCache = { q, at: now, list };
    return list;
  }

  // The sections as the list shows them: filtered by the query, sorted by
  // the chosen order. Also records what the map should light up.
  function _filterLegendSections(sections) {
    const q = _legendQuery;
    const byLabel = (a, b) => a.label.localeCompare(b.label);
    const order = _legendSort === 'az'    ? byLabel
                : _legendSort === 'count' ? (a, b) => (b.count || 0) - (a.count || 0) || byLabel(a, b)
                : null;
    const out = [];
    _searchHits = new Set();
    _hlEntities = new Set();
    for (const s of sections) {
      let entries = q ? s.entries.filter(e => e.label.toLowerCase().includes(q)) : s.entries;
      if (!entries.length) continue;
      if (order) entries = [...entries].sort(order);
      if (q) for (const e of entries) _searchHits.add(e.kind + ':' + e.type);
      out.push({ title: s.title, entries });
    }
    if (q) {
      const named = _namedMatches(q);
      if (named.length) {
        for (const e of named) _hlEntities.add(e.type);
        out.push({ title: named.length >= NAMED_MAX ? `BY NAME (FIRST ${NAMED_MAX})` : 'BY NAME', entries: [...named].sort(byLabel) });
      }
    }
    if (_legendHover && _legendHover.kind === 'entity') _hlEntities.add(_legendHover.type);
    return out;
  }

  // Centre the map on a tile, zooming in far enough to pick it out.
  function _centreOn(col, row) {
    _mzoom = Math.max(_mzoom, Math.min(ZOOM_MAX, 4));
    _mpanX = col * _baseScale - _baseMapW / _mzoom / 2;
    _mpanY = row * _baseScale - _baseMapH / _mzoom / 2;
    _clampPan();
  }

  // Every instance a legend row stands for, as tile footprints
  // { col, row, w, h, name? }, nearest the camera first. Rebuilt at most
  // twice a second per row: an open "Road" list is thousands of tiles.
  function _entInst(e) {
    let name = e.businessName || null;
    if (!name && e._num !== undefined && typeof NUMBERED_ENTITY_TYPES !== 'undefined' && NUMBERED_ENTITY_TYPES.has(e.type)) name = '#' + e._num;
    return { col: e.col, row: e.row, w: e.width || 1, h: e.height || 1, name };
  }
  function _legendInstances(e) {
    if (e.kind === 'entity') return [_entInst(e.type)];
    const key = e.kind + ':' + e.type, now = performance.now();
    const hit = _instCache.get(key);
    if (hit && now - hit.at < 500) return hit.list;
    const list = [];
    if (e.kind === 'deposit') {
      for (const d of _discoveries) if (d.type === e.type) list.push({ col: d.col, row: d.row, w: d.w || 1, h: d.h || 1 });
    } else if (e.kind === 'zone' && typeof ZoneSystem !== 'undefined') {
      const style = ZONE_MAP_STYLES[e.type];
      const rects = ZoneSystem.getZoneRects?.(e.type) || [];
      rects.forEach((r, i) => list.push({ col: r.minC, row: r.minR, w: r.maxC - r.minC + 1, h: r.maxR - r.minR + 1,
        name: r.name || r.label || (rects.length > 1 ? `${style.label} ${i + 1}` : style.label) }));
    } else if (e.kind === 'contam' && typeof LightningDamageSystem !== 'undefined') {
      for (const z of LightningDamageSystem.getContaminationZones()) {
        if (z.inner?.level === e.type || z.outer?.level === e.type) list.push({ col: z.col, row: z.row, w: z.w, h: z.h });
      }
    } else if (e.kind === 'powernet') {
      const { conductors, nets } = _powerNets();
      if (e.type === 'fault') { for (const c of conductors) if (c.failed || c._weatherFailed) list.push(_entInst(c)); }
      else { const n = nets.find(n => n.id === e.type); if (n) list.push(_entInst(n.tag)); }
    } else if ((e.kind === 'building' || e.kind === 'powerpart') && typeof EntityRegistry !== 'undefined') {
      for (const x of EntityRegistry.getByType(e.type)) if (x.col != null && x.row != null) list.push(_entInst(x));
    }
    const z = Camera.zoom || 1;
    const vc = (Camera.x + window.innerWidth / z / 2) / TILE, vr = (Camera.y + window.innerHeight / z / 2) / TILE;
    for (const i of list) i.d = (i.col + i.w / 2 - vc) ** 2 + (i.row + i.h / 2 - vr) ** 2;
    list.sort((a, b) => a.d - b.d);
    _instCache.set(key, { at: now, list });
    return list;
  }
  const _sameInst = (a, b) => !!a && !!b && a.col === b.col && a.row === b.row && a.w === b.w && a.h === b.h;

  // The tile a legend instance is shown at and travelled to: its middle.
  const _instTile = i => ({ col: Math.floor(i.col + i.w / 2), row: Math.floor(i.row + i.h / 2) });

  // A frame and an outgoing ping on the instance whose legend line is
  // hovered, so one building out of fifty is easy to pick out at any zoom.
  function _drawInstMark(es) {
    if (!_legendHover || _legendHover.kind !== 'inst') return;
    const i = _legendHover.type;
    const { x, y } = _tileToScreen(i.col, i.row);
    const sw = Math.max(4, i.w * es), sh = Math.max(4, i.h * es);
    const p = (performance.now() / 1000 * 0.9) % 1;
    _ctx.save();
    _ctx.shadowColor = '#ffffff'; _ctx.shadowBlur = 8;
    _ctx.strokeStyle = '#ffffff'; _ctx.lineWidth = 2;
    _ctx.strokeRect(x - 4, y - 4, sw + 8, sh + 8);
    _ctx.shadowBlur = 0;
    _ctx.strokeStyle = `rgba(255,255,255,${(0.8 * (1 - p)).toFixed(3)})`; _ctx.lineWidth = 1.5;
    _ctx.beginPath(); _ctx.arc(x + sw / 2, y + sh / 2, Math.max(sw, sh) / 2 + 6 + p * 18, 0, Math.PI * 2); _ctx.stroke();
    _ctx.restore();
  }

  // `s` cut down with an ellipsis to fit maxWidth in the current font.
  function _fitText(s, maxWidth) {
    if (_ctx.measureText(s).width <= maxWidth) return s;
    while (s.length > 1 && _ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
    return s + '…';
  }

  // Split a label into at most 2 lines so it fits within maxWidth, using
  // the current canvas font for measurement. Breaks on whitespace where
  // possible; falls back to a hard break mid-word for single long tokens.
  function _wrapLabel(label, maxWidth) {
    if (_ctx.measureText(label).width <= maxWidth) return [label];

    const words = label.split(' ');
    let line1 = '';
    let i = 0;
    for (; i < words.length; i++) {
      const candidate = line1 ? line1 + ' ' + words[i] : words[i];
      if (_ctx.measureText(candidate).width > maxWidth && line1) break;
      line1 = candidate;
    }
    let line2 = words.slice(i).join(' ');
    if (!line2) {
      // Single word too long for one line — hard-split it
      const half = Math.ceil(line1.length * 0.6);
      line2 = line1.slice(half);
      line1 = line1.slice(0, half);
    }
    // Truncate line2 with ellipsis if it still overflows
    while (line2 && _ctx.measureText(line2 + '…').width > maxWidth) {
      line2 = line2.slice(0, -1);
    }
    if (line2 && _ctx.measureText(line2).width > maxWidth) line2 += '…';
    return line2 ? [line1, line2] : [line1];
  }

  // Legend — one column in a fixed-height panel that scrolls (mouse wheel
  // over it, or drag its scrollbar). It used to overflow into extra columns,
  // and once those were clamped back on screen they drew over each other.
  function _drawLegend(ox, oy, mH) {
    const all = _buildLegendSections();
    _legendHitboxes = [];
    _legendPanel = null;
    if (_legendBar) _legendBar.el.style.display = all.length ? 'flex' : 'none';
    if (!all.length) { _searchHits = new Set(); _hlEntities = new Set(); return; }
    const sections = _filterLegendSections(all);

    const lineH   = 14;
    const sectionGap = 10;
    const titleH  = 16;
    const colW    = 176;
    const swatchW = 14;
    const pad     = 8;
    const countW  = 32;                                        // right-hand "×12 ▸" column
    const textMaxW = colW - swatchW - pad * 2 - 8 - countW;    // room left for the count and the scrollbar
    const px = Math.min(ox + _baseMapW + 16, window.innerWidth - colW - 8);
    const rightX = px + colW - pad - 6;                        // right edge of the count / coordinates
    // Folded: only the button that brings it back, tucked in the corner.
    const noRoom = ox + _baseMapW + 16 + colW + 8 > window.innerWidth;
    _legendFolded = _legendCollapsed === null ? noRoom : _legendCollapsed;
    if (_legendBar) {
      const b = _legendBar;
      b.input.style.display = b.sortBtn.style.display = _legendFolded ? 'none' : '';
      b.foldBtn.textContent = _legendFolded ? '☰ List' : '»';
      b.foldBtn.title = _legendFolded ? 'Show the map list (L)' : 'Hide the map list (L)';
      b.el.style.top = oy + 'px';
      // Folded, the button stays where the list's top-left corner was, just
      // off the map's edge; only when there is no room there does it go to
      // the corner of the screen.
      if (_legendFolded) {
        const fx = ox + _baseMapW + 16;
        b.el.style.width = 'auto';
        if (fx + 72 <= window.innerWidth) { b.el.style.right = ''; b.el.style.left = fx + 'px'; }
        else { b.el.style.left = ''; b.el.style.right = '8px'; }
      }
      else { b.el.style.right = ''; b.el.style.left = px + 'px'; b.el.style.width = colW + 'px'; }
    }
    if (_legendFolded) return;   // the search above still rings its matches on the map
    const py = oy + LEGEND_BAR_H + 4;
    const maxPanelH = window.innerHeight - py - 28;

    _ctx.save();
    _ctx.font = '9px monospace';

    // ── Layout: every row at a y offset from the top of the content ──────
    const rows = [];
    let y = 12;
    for (const section of sections) {
      rows.push({ kind: 'title', y, text: section.title });
      y += titleH;
      for (const e of section.entries) {
        const lines = _wrapLabel(e.label, textMaxW);
        const rowH = lines.length > 1 ? lineH * 2 : lineH;
        rows.push({ kind: 'entry', y, lines, entry: e, rowH });
        y += rowH;
        if (!_isGroup(e) || !_legendOpen.has(e.kind + ':' + e.type)) continue;
        const insts = _legendInstances(e);
        const n = Math.min(insts.length, INST_MAX);
        for (let i = 0; i < n; i++) { rows.push({ kind: 'inst', y, inst: insts[i], idx: i, entry: e, rowH: lineH }); y += lineH; }
        if (insts.length > n) { rows.push({ kind: 'more', y, text: `+${insts.length - n} farther away`, rowH: lineH }); y += lineH; }
        y += 4;
      }
      y += sectionGap;
    }
    if (!sections.length) { rows.push({ kind: 'title', y, text: 'No matches' }); y += titleH + sectionGap; }
    const contentH = y - sectionGap + 4;
    const panelH   = Math.min(contentH, maxPanelH);
    const maxScroll = Math.max(0, contentH - panelH);
    _legendScroll = Math.max(0, Math.min(maxScroll, _legendScroll));
    _legendPanel = { x: px, y: py, w: colW, h: panelH, maxScroll, contentH };

    // ── Panel ────────────────────────────────────────────────────────────
    _ctx.fillStyle = 'rgba(8,14,24,0.86)';
    _ctx.strokeStyle = 'rgba(120,200,255,0.25)';
    _ctx.lineWidth = 1;
    _ctx.beginPath(); _ctx.roundRect(px, py, colW, panelH, 6); _ctx.fill(); _ctx.stroke();

    _ctx.save();
    _ctx.beginPath(); _ctx.rect(px + 1, py + 1, colW - 2, panelH - 2); _ctx.clip();
    const tx = px + pad;
    for (const row of rows) {
      const ry = py + row.y - _legendScroll + 9;          // text baseline
      const rowTop = ry - 9;
      const rowH = row.kind === 'title' ? titleH : row.rowH;
      if (rowTop + rowH < py || rowTop > py + panelH) continue;   // scrolled out of view

      if (row.kind === 'title') {
        _ctx.fillStyle = 'rgba(255,255,255,0.35)';
        _ctx.textAlign = 'left';
        _ctx.fillText(row.text, tx, ry);
        continue;
      }
      // An open row's list: a guide line down from the row's swatch, then
      // each instance's name (or its place in the list) and its X / Y tile.
      if (row.kind === 'inst' || row.kind === 'more') {
        _ctx.fillStyle = 'rgba(255,255,255,0.14)';
        _ctx.fillRect(tx + 4, rowTop, 1, rowH);
        _ctx.textAlign = 'left';
        if (row.kind === 'more') {
          _ctx.fillStyle = 'rgba(255,255,255,0.35)';
          _ctx.fillText(row.text, tx + swatchW, ry);
          continue;
        }
        const inst = row.inst;
        const isHover = _legendHover && _legendHover.kind === 'inst' && _sameInst(_legendHover.type, inst);
        if (isHover) {
          _ctx.fillStyle = 'rgba(255,255,255,0.14)';
          _ctx.fillRect(tx + 8, rowTop, colW - pad * 2 - 13, rowH);
        }
        const t = _instTile(inst);
        const coords = `X ${t.col} Y ${t.row}`;
        _ctx.textAlign = 'right';
        _ctx.fillStyle = isHover ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)';
        _ctx.fillText(coords, rightX, ry);
        _ctx.textAlign = 'left';
        _ctx.fillStyle = isHover ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.65)';
        const nameW = rightX - _ctx.measureText(coords).width - 6 - (tx + swatchW);
        _ctx.fillText(_fitText(inst.name || `${row.idx + 1}.`, nameW), tx + swatchW, ry);
        const hTop = Math.max(py, rowTop), hBot = Math.min(py + panelH, rowTop + rowH);
        if (hBot > hTop) _legendHitboxes.push({ x: tx + 8, y: hTop, w: colW - pad * 2 - 13, h: hBot - hTop, kind: 'inst', type: inst, entry: row.entry });
        continue;
      }

      const e = row.entry;
      const isHover = _legendHover && _legendHover.kind === e.kind && _legendHover.type === e.type;
      if (isHover) {
        _ctx.fillStyle = 'rgba(255,255,255,0.14)';
        _ctx.fillRect(tx - 3, rowTop, colW - pad * 2 - 2, rowH);
      }
      _ctx.fillStyle = e.color;
      if (e.swatch === 'dot') {
        _ctx.beginPath(); _ctx.arc(tx + 5, ry - 3, 4, 0, Math.PI * 2); _ctx.fill();
      } else if (e.swatch === 'line' || e.swatch === 'dash') {
        _ctx.save();
        _ctx.strokeStyle = e.color;
        _ctx.lineWidth = 2.5;
        _ctx.lineCap = 'round';
        if (e.swatch === 'dash') { _ctx.setLineDash([2.5, 3]); _ctx.globalAlpha = 0.6; }
        _ctx.beginPath(); _ctx.moveTo(tx, ry - 3); _ctx.lineTo(tx + 10, ry - 3); _ctx.stroke();
        _ctx.restore();
      } else {
        _ctx.fillRect(tx, ry - 7, 9, 9);
      }
      _ctx.textAlign = 'left';
      _ctx.fillStyle = isHover ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.65)';
      row.lines.forEach((line, li) => _ctx.fillText(line, tx + swatchW, ry + li * lineH));
      if (_isGroup(e)) {
        // The count, then a caret: ▸ shut, ▾ with its list open.
        const rx = rightX, cy = ry - 3;
        _ctx.textAlign = 'right';
        _ctx.fillStyle = 'rgba(255,255,255,0.35)';
        _ctx.fillText('×' + e.count, rx - 8, ry);
        _ctx.textAlign = 'left';
        _ctx.fillStyle = isHover ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)';
        _ctx.beginPath();
        if (_legendOpen.has(e.kind + ':' + e.type)) { _ctx.moveTo(rx - 5, cy - 2); _ctx.lineTo(rx, cy - 2); _ctx.lineTo(rx - 2.5, cy + 2); }
        else                                        { _ctx.moveTo(rx - 4, cy - 3); _ctx.lineTo(rx - 0.5, cy); _ctx.lineTo(rx - 4, cy + 3); }
        _ctx.closePath(); _ctx.fill();
      } else if (e.count > 1) {
        // A plain row (pipes, belts) keeps its count, with no caret.
        _ctx.textAlign = 'right';
        _ctx.fillStyle = 'rgba(255,255,255,0.35)';
        _ctx.fillText('×' + e.count, rightX, ry);
        _ctx.textAlign = 'left';
      }

      // Hitbox only for the part of the row that's actually visible.
      const hTop = Math.max(py, rowTop), hBot = Math.min(py + panelH, rowTop + rowH);
      if (hBot > hTop) _legendHitboxes.push({ x: tx - 3, y: hTop, w: colW - pad * 2 - 2, h: hBot - hTop, kind: e.kind, type: e.type, entry: e });
    }
    _ctx.restore();

    // ── Scrollbar + fades, only when the list overflows ─────────────────
    if (maxScroll > 0) {
      const trackX = px + colW - 7, trackY = py + 4, trackH = panelH - 8;
      const thumbH = Math.max(24, trackH * panelH / contentH);
      const thumbY = trackY + (trackH - thumbH) * (_legendScroll / maxScroll);
      _ctx.fillStyle = 'rgba(255,255,255,0.08)';
      _ctx.beginPath(); _ctx.roundRect(trackX, trackY, 4, trackH, 2); _ctx.fill();
      _ctx.fillStyle = _legendDrag ? 'rgba(160,215,255,0.9)' : 'rgba(160,215,255,0.55)';
      _ctx.beginPath(); _ctx.roundRect(trackX, thumbY, 4, thumbH, 2); _ctx.fill();
      _legendPanel.thumb = { x: trackX - 4, y: thumbY, w: 12, h: thumbH, trackY, trackH };
      // Soft fade at whichever edge has more list beyond it.
      const fade = (y0, up) => {
        const g = _ctx.createLinearGradient(0, y0, 0, y0 + (up ? 16 : -16));
        g.addColorStop(0, 'rgba(8,14,24,0.95)'); g.addColorStop(1, 'rgba(8,14,24,0)');
        _ctx.fillStyle = g;
        _ctx.fillRect(px + 1, up ? y0 : y0 - 16, colW - 10, 16);
      };
      if (_legendScroll > 0) fade(py + 1, true);
      if (_legendScroll < maxScroll) fade(py + panelH - 1, false);
    }

    _ctx.restore();
  }

  // ── Fast travel ────────────────────────────────────────────────────
  // Unlock state now lives in Progression (T.FASTTRAVEL, see progression.js
  // and inspection_panel.js) so it shows up in the Research Panel like any
  // other unlock, persists via Progression's own save/load, and follows
  // the same Ready → click UNLOCK flow as everything else.
  function _fastTravelUnlocked() {
    return typeof Progression !== 'undefined' && Progression.isUnlocked(T.FASTTRAVEL);
  }

  // Screen coords → tile coords (fractional)
  function _screenToTile(sx, sy) {
    const ox = _screenOffX(), oy = _screenOffY();
    const col = ((sx - ox) / _mzoom + _mpanX) / _baseScale;
    const row = ((sy - oy) / _mzoom + _mpanY) / _baseScale;
    return { col, row };
  }

  function _fastTravelTo(col, row) {
    const wx = col * TILE;   // world px
    const wy = row * TILE;
    console.log('[WorldMap] fast travel →', { col, row, wx, wy, camBefore: { x: Camera.x, y: Camera.y, zoom: Camera.zoom } }); // TEMP
    if (typeof Camera === 'undefined' || typeof Camera.loadState !== 'function') return;
    // A focused truck re-pans the camera onto itself every frame, which would
    // drag the view straight back from wherever the player just travelled.
    // Travelling is choosing to look elsewhere, so end the follow first.
    if (typeof TruckSystem !== 'undefined') TruckSystem.clearFocus?.();
    // Instant snap — avoids depending on Camera.keyboardTick() running every
    // frame to ease toward a recentreOn() target, which may not fire (or not
    // fire promptly) once this overlay closes.
    const z = Camera.zoom || 1;
    Camera.loadState({
      panX: wx - window.innerWidth  / z / 2,
      panY: wy - window.innerHeight / z / 2,
      zoom: z,
    });
    console.log('[WorldMap] camAfter', { x: Camera.x, y: Camera.y }); // TEMP
    close();
  }

  // Fast travel from a double click (on the map or a legend row), once the
  // research is done; clamped inside the grid.
  function _tryFastTravel(col, row) {
    if (!_fastTravelUnlocked()) {
      if (typeof showToast === 'function')
        showToast('🔒 Fast Travel locked; unlock it at a Research Station', '#ff8040', '#180a02', '#603010');
      return;
    }
    _fastTravelTo(Math.max(0, Math.min(COLS - 1, col)), Math.max(0, Math.min(ROWS - 1, row)));
  }

  // ── Layout ────────────────────────────────────────────────────────
  function _recompute() {
    const SW = window.innerWidth;
    const SH = window.innerHeight;
    const maxW = SW - PAD * 2;
    const maxH = SH - PAD * 2;
    if (maxW / ASPECT < maxH) {
      _baseMapW = maxW;
      _baseMapH = Math.round(maxW / ASPECT);
    } else {
      _baseMapH = maxH;
      _baseMapW = Math.round(maxH * ASPECT);
    }
    _baseScale = _baseMapW / COLS;
    _syncOffsets();

    if (!_terrainCanvas) {
      _terrainCanvas = document.createElement('canvas');
      _terrainCtx    = _terrainCanvas.getContext('2d');
    }
    // Resizing a canvas wipes it, so only do it (and rebuild) when the map
    // size actually changed — reopening the map at the same size reuses the
    // cached terrain (see _terrainSig in _draw for world changes).
    const tw = _baseMapW * TERRAIN_SS, th = _baseMapH * TERRAIN_SS;
    if (_terrainCanvas.width !== tw || _terrainCanvas.height !== th) {
      _terrainCanvas.width  = tw;
      _terrainCanvas.height = th;
      _terrainValid = false;
    }
    _clampPan();
  }

  // ── Zoom at a screen point ────────────────────────────────────────
  function _zoomAt(sx, sy, factor) {
    const ox = _screenOffX();
    const oy = _screenOffY();
    // Map-local coords in base-map pixels before zoom
    const bx = (sx - ox) / _mzoom + _mpanX;
    const by = (sy - oy) / _mzoom + _mpanY;

    // A small site's fit can already be past ZOOM_MAX: it still zooms in.
    const floor = _zoomFloor();
    const newZoom = Math.max(floor, Math.min(Math.max(ZOOM_MAX, floor * 4), _mzoom * factor));
    _mzoom = newZoom;

    // Keep bx/by under the cursor
    _mpanX = bx - (sx - ox) / _mzoom;
    _mpanY = by - (sy - oy) / _mzoom;
    _clampPan();
  }

  // ── Open / close ─────────────────────────────────────────────────
  function open() {
    if (_open) return;
    // Not after the apocalypse: walking the ashes is on foot, in the ruins.
    if (typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.hasEnded()) return;
    _open = true;
    _overlay.style.display = 'block';
    WorldMapSystem.syncFromGrid(); // refresh discoveries so depleted deposits drop off
    _instCache.clear();            // legend lists sort nearest the camera, which may have moved
    _recompute();
    // Centre pan on player viewport when opening
    _mzoom = _zoomFloor();
    _mpanX = 0;
    _mpanY = 0;
    _clampPan();
    // A port already selected in the city view carries its ring onto the map.
    const _t = (typeof EntityInfoPanel !== 'undefined' && EntityInfoPanel.isOpen()) ? EntityInfoPanel.target : null;
    _selectedPort = (_t && (_t.type === T.DRONEPORT || _t.type === T.DRONECHARGER)) ? _t : null;
    _draw();
  }

  function close() {
    if (!_open) return;
    _open = false;
    _overlay.style.display = 'none';
    _legendBar?.input.blur();   // or the next keypress types into a hidden box
  }

  function toggle() { _open ? close() : open(); }

  // ── Init ─────────────────────────────────────────────────────────
  return {
    init() {
      _overlay = document.createElement('div');
      _overlay.id = 'worldmap-overlay';
      Object.assign(_overlay.style, {
        position: 'fixed', inset: '0',
        zIndex: '9000', display: 'none',
        pointerEvents: 'all', cursor: 'crosshair',
      });

      _canvas = document.createElement('canvas');
      Object.assign(_canvas.style, { display: 'block', width: '100%', height: '100%' });
      _ctx = _canvas.getContext('2d');
      _overlay.appendChild(_canvas);
      document.body.appendChild(_overlay);

      // ── Legend search + sort bar ──────────────────────────────────
      // Positioned over the legend each frame by _drawLegend.
      const bar = document.createElement('div');
      Object.assign(bar.style, {
        position: 'absolute', display: 'none', gap: '4px', height: LEGEND_BAR_H + 'px',
        boxSizing: 'border-box', cursor: 'default',
      });
      const ctl = {
        height: '100%', boxSizing: 'border-box', font: '10px monospace', color: 'rgba(255,255,255,0.85)',
        background: 'rgba(8,14,24,0.86)', border: '1px solid rgba(120,200,255,0.25)', borderRadius: '6px', outline: 'none',
      };
      const input = document.createElement('input');
      input.type = 'text'; input.placeholder = 'Search map…'; input.spellcheck = false; input.autocomplete = 'off';
      Object.assign(input.style, ctl, { flex: '1', minWidth: '0', padding: '0 7px' });
      const sortBtn = document.createElement('button');
      sortBtn.type = 'button'; sortBtn.title = 'Sort the list';
      Object.assign(sortBtn.style, ctl, { flex: 'none', padding: '0 6px', cursor: 'pointer' });
      const sortLabel = () => { sortBtn.textContent = '⇅ ' + LEGEND_SORTS.find(o => o[0] === _legendSort)[1]; };
      sortLabel();
      const foldBtn = document.createElement('button');
      foldBtn.type = 'button';
      Object.assign(foldBtn.style, ctl, { flex: 'none', padding: '0 8px', cursor: 'pointer' });
      foldBtn.addEventListener('click', () => { _toggleLegend(); foldBtn.blur(); });
      bar.append(input, sortBtn, foldBtn);
      _overlay.appendChild(bar);
      _legendBar = { el: bar, input, sortBtn, foldBtn };

      input.addEventListener('input', () => { _legendQuery = input.value.trim().toLowerCase(); _legendScroll = 0; });
      input.addEventListener('focus', () => { input.style.borderColor = 'rgba(160,215,255,0.8)'; });
      input.addEventListener('blur',  () => { input.style.borderColor = 'rgba(120,200,255,0.25)'; });
      // Keys typed here are text, not hotkeys. Escape clears the query
      // first; on an empty box it falls through and closes the map as usual.
      input.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') {
          if (!input.value) { input.blur(); return; }
          input.value = ''; _legendQuery = ''; _legendScroll = 0;
        }
        ev.stopPropagation();
      });
      input.addEventListener('keyup', ev => ev.stopPropagation());
      sortBtn.addEventListener('click', () => {
        _legendSort = LEGEND_SORTS[(LEGEND_SORTS.findIndex(o => o[0] === _legendSort) + 1) % LEGEND_SORTS.length][0];
        try { localStorage.setItem(LEGEND_SORT_KEY, _legendSort); } catch (err) {}
        _legendScroll = 0;
        sortLabel();
        sortBtn.blur();
      });
      // The overlay treats a press outside the map as "close", a double
      // click as fast travel and the wheel as zoom; none of that is meant
      // for the bar.
      for (const type of ['mousedown', 'dblclick', 'wheel']) bar.addEventListener(type, ev => ev.stopPropagation());

      // ── Scroll wheel → zoom ───────────────────────────────────────
      _overlay.addEventListener('wheel', ev => {
        ev.preventDefault();
        // Over the legend: scroll the list instead of zooming the map.
        if (_inLegend(ev.clientX, ev.clientY)) {
          if (_legendPanel.maxScroll > 0) {
            const step = ev.deltaMode === 1 ? ev.deltaY * 14 : ev.deltaY;
            _legendScroll = Math.max(0, Math.min(_legendPanel.maxScroll, _legendScroll + step));
            _draw();
          }
          return;
        }
        const factor = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
        _zoomAt(ev.clientX, ev.clientY, factor);
      }, { passive: false });

      // ── Drag → pan ────────────────────────────────────────────────
      _overlay.addEventListener('mousedown', ev => {
        // The overlay toggles sit outside the map rectangle, so they have to
        // be checked before the click-outside-closes rule below.
        const tg = _overlayToggles.find(t => _inRect(t.rect, ev.clientX, ev.clientY));
        if (tg) {
          tg.on = !tg.on;
          try { localStorage.setItem(tg.key, tg.on ? '1' : '0'); } catch (err) {}
          ev.preventDefault();
          return;
        }
        // The legend is its own control: grab its scrollbar to scroll, and a
        // click anywhere else on it does nothing (it used to close the map
        // whenever the legend sat outside the map's rectangle).
        if (_inLegend(ev.clientX, ev.clientY)) {
          const th = _legendPanel.thumb;
          if (th && ev.clientX >= th.x && ev.clientX <= th.x + th.w + 4) {
            _legendDrag = { startY: ev.clientY, startScroll: _legendScroll };
            ev.preventDefault();
            return;
          }
          // A row for several things opens or shuts its list; a row for one
          // thing (a line of such a list, a building found by name) takes
          // the map there.
          const hb = _legendHitboxes.find(h => _inRect(h, ev.clientX, ev.clientY));
          if (hb && hb.kind !== 'inst' && _isGroup(hb.entry)) {
            const k = hb.entry.kind + ':' + hb.entry.type;
            if (_legendOpen.has(k)) _legendOpen.delete(k); else _legendOpen.add(k);
          } else if (hb && !_plainRow(hb.entry)) {
            const t = hb.kind === 'inst' ? hb.type : _legendInstances(hb.entry)[0];
            if (t) _centreOn(t.col + t.w / 2, t.row + t.h / 2);
          }
          return;
        }
        // Check if click is inside map area
        const ox = _screenOffX(), oy = _screenOffY();
        if (ev.clientX < ox || ev.clientX > ox + _baseMapW ||
            ev.clientY < oy || ev.clientY > oy + _baseMapH) {
          // Click outside → close
          close();
          return;
        }
        _dragging = true;
        _dragSX   = ev.clientX;
        _dragSY   = ev.clientY;
        _dragPX0  = _mpanX;
        _dragPY0  = _mpanY;
        _overlay.style.cursor = 'grabbing';
      });

      window.addEventListener('mousemove', ev => {
        _mouseSX = ev.clientX;
        _mouseSY = ev.clientY;
        if (_legendDrag && _open && _legendPanel && _legendPanel.thumb) {
          const th = _legendPanel.thumb;
          const travel = Math.max(1, th.trackH - th.h);
          _legendScroll = Math.max(0, Math.min(_legendPanel.maxScroll,
            _legendDrag.startScroll + (ev.clientY - _legendDrag.startY) * _legendPanel.maxScroll / travel));
          return;
        }
        if (!_dragging || !_open) return;
        const dx = (ev.clientX - _dragSX) / _mzoom;
        const dy = (ev.clientY - _dragSY) / _mzoom;
        _mpanX = _dragPX0 - dx;
        _mpanY = _dragPY0 - dy;
        _clampPan();
      });

      window.addEventListener('mouseup', ev => {
        // A press that barely moved is a click, not a pan: clicking a Drone
        // Port shows its ring, clicking it again or empty map hides it.
        if (_dragging && _open && Math.hypot(ev.clientX - _dragSX, ev.clientY - _dragSY) < 4
            && ev.button === 0 && _placingPort()) {
          // Placing from the map: a click builds the port under the ghost,
          // through the same path a city-view click uses (cost, placement
          // rules, undo, sound). The map stays open so the new network shows.
          const g = _portGhostAt(ev.clientX, ev.clientY);
          if (g) InputManager.tryPlaceAt(g.col, g.row);
          _dragging = false;
          if (_open) _overlay.style.cursor = 'crosshair';
          return;
        }
        if (_dragging && _open && Math.hypot(ev.clientX - _dragSX, ev.clientY - _dragSY) < 4) {
          const hit = _portHits.find(h => _inRect(h, ev.clientX, ev.clientY));
          _selectedPort = (hit && hit.e !== _selectedPort) ? hit.e : null;
        }
        _dragging = false;
        _legendDrag = null;
        if (_open) _overlay.style.cursor = 'crosshair';
      });

      // ── Double-click → fast travel ───────────────────────────────
      _overlay.addEventListener('dblclick', ev => {
        ev.preventDefault();
        if (_inLegend(ev.clientX, ev.clientY)) {
          // Travel to the one thing a row stands for. A row for several only
          // opens its list (its two clicks shut it again): the travelling is
          // done from a line of that list.
          const hb = _legendHitboxes.find(h => _inRect(h, ev.clientX, ev.clientY));
          if (!hb || (hb.kind !== 'inst' && _plainRow(hb.entry))) return;
          if (hb.kind !== 'inst' && _isGroup(hb.entry)) { _legendOpen.add(hb.entry.kind + ':' + hb.entry.type); return; }
          const t = hb.kind === 'inst' ? hb.type : _legendInstances(hb.entry)[0];
          if (t) _tryFastTravel(t.col + t.w / 2, t.row + t.h / 2);
          return;
        }
        if (_placingPort()) return;                       // clicks are placing ports
        const ox = _screenOffX(), oy = _screenOffY();
        if (ev.clientX < ox || ev.clientX > ox + _baseMapW ||
            ev.clientY < oy || ev.clientY > oy + _baseMapH) return; // outside map
        const { col, row } = _screenToTile(ev.clientX, ev.clientY);
        _tryFastTravel(col, row);
      });

      // ── Keyboard ─────────────────────────────────────────────────
      // Escape is handled centrally by input_manager.js, which checks
      // WorldMapSystem.isOpen and calls close() itself — kept in one place
      // so there's no ordering race between two independent listeners.
      document.addEventListener('keydown', ev => {
        // L folds the list away and brings it back, while the map is up.
        if ((ev.key === 'l' || ev.key === 'L') && _open) {
          const ae0 = document.activeElement;
          if (ae0 && (ae0.tagName === 'INPUT' || ae0.tagName === 'TEXTAREA' || ae0.isContentEditable)) return;
          ev.preventDefault(); ev.stopPropagation(); _toggleLegend(); return;
        }
        // (Tab used to open the map too; it now shows/hides the build bar.)
        if (ev.key !== 'm' && ev.key !== 'M') return;
        // Don't hijack M while typing in a text field (e.g. the city/
        // company naming modal) or while the main menu / any full-screen
        // modal is up — those screens aren't the game itself, so no map to
        // show.
        const ae = document.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
        const mainMenu = document.getElementById('main-menu');
        if (mainMenu && !mainMenu.classList.contains('hidden')) return;
        const blockingOverlayIds = ['citynaming-modal', 'options-modal', 'load-game-modal', 'confirm-modal', 'pause-menu'];
        if (blockingOverlayIds.some(id => document.getElementById(id)?.classList.contains('visible'))) return;
        ev.preventDefault(); toggle();
      });

      // ── Resize ───────────────────────────────────────────────────
      window.addEventListener('resize', () => {
        if (_open) { _recompute(); _draw(); }
        else { _terrainValid = false; }
      });

      // Sync on load
      setTimeout(() => this.syncFromGrid(), 400);
    },

    registerDiscovery(type, col, row, w, h) {
      if (_discoveries.some(d => d.type === type && d.col === col && d.row === row)) return;
      _discoveries.push({ type, col, row, w: w || 1, h: h || 1 });
    },

    syncFromGrid() {
      _discoveries.length = 0;
      const depositTypes = new Set([
        T.COALDEPOSIT, T.OILDEPOSIT, T.URANIUMDEPOSIT, T.SULFURDEPOSIT, T.LITHIUMDEPOSIT, T.HELIUMDEPOSIT, T.RAREEARTHDEPOSIT, T.GEODEPOSIT, T.AQUIFER,
      ]);
      if (typeof EntityRegistry === 'undefined') return;
      for (const type of depositTypes) {
        let list;
        try { list = EntityRegistry.getByType(type); } catch(e) { continue; }
        if (!list) continue;
        for (const e of list) {
          if (e._revealed === false) continue; // only show deposits the player has scanned/found
          if (type === T.COALDEPOSIT && e.coalAmount <= 0) continue;   // depleted — hide
          if (type === T.OILDEPOSIT && e._pressure <= 0) continue;    // depleted — hide
          if ((type === T.URANIUMDEPOSIT || type === T.SULFURDEPOSIT || type === T.RAREEARTHDEPOSIT)
              && e._oreAmount !== undefined && e._oreAmount <= 0) continue;   // worked out — hide
          _discoveries.push({ type: e.type, col: e.col, row: e.row, w: e.width||1, h: e.height||1 });
        }
      }
      // Deposits are drawn live over the terrain, not baked into it — no rebuild needed.
    },

    invalidate() { _terrainValid = false; },

    tick() { if (_open) _draw(); },

    get isOpen() { return _open; },
    close, open, toggle,
    // Zoom the map about a screen point, one wheel notch per step — used by
    // the controller triggers (gamepad_input.js).
    zoomStep(sx, sy, dir) { if (_open) _zoomAt(sx, sy, dir > 0 ? 1.15 : 1 / 1.15); },
    // Scroll the legend by `dy` px if the screen point is over it — used by
    // the controller's right stick. True whenever the point is on the legend,
    // even at the end of the list, so the stick never pans the map from
    // there (the same rule as the mouse wheel).
    scrollLegendAt(sx, sy, dy) {
      if (!_open || !_inLegend(sx, sy)) return false;
      if (_legendPanel.maxScroll > 0) _legendScroll = Math.max(0, Math.min(_legendPanel.maxScroll, _legendScroll + dy));
      return true;
    },
    // Pan the map by a screen-pixel delta — used by the controller's right
    // stick, the drag-to-pan counterpart.
    panByScreen(dx, dy) {
      if (!_open) return;
      _mpanX -= dx / _mzoom;
      _mpanY -= dy / _mzoom;
      _clampPan();
    },
  };
})();
