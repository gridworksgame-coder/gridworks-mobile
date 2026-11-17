/* ═══════════════════════════════════════════════════════════════════
   MAP VIEW
   What the player has chosen to show on the map (the VIEW dropdown in the
   top bar). Each layer can be hidden on its own: buildings, zones, power
   poles and towers, pipes and conveyors, trees, trucks, drones, weather
   and status icons. Purely visual: the simulation and the build tools are
   untouched. Kept per player in localStorage, so it survives a restart.

   The renderer asks show(layer) once a frame per pass, and entityLayer()
   for each entity in the main loop.
   ═══════════════════════════════════════════════════════════════════ */
const MapView = (() => {
  const KEY = 'gw_map_view_v1';
  // In the order the dropdown lists them.
  const LAYERS = [
    { id: 'buildings',  label: 'Buildings' },
    { id: 'zones',      label: 'Zones' },
    { id: 'poles',      label: 'Power Towers / Poles' },
    { id: 'networks',   label: 'Pipes & Conveyors' },
    { id: 'vegetation', label: 'Trees & Vegetation' },
    { id: 'trucks',     label: 'Trucks' },
    { id: 'drones',     label: 'Drones' },
    { id: 'weather',    label: 'Weather' },
    { id: 'icons',      label: 'Status Icons' },
  ];
  const IDS = LAYERS.map(l => l.id);

  let state = {};
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') for (const id of IDS) if (raw[id] === false) state[id] = false;
  } catch (_e) {}

  const listeners = [];
  function _save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_e) {}
  }
  function _changed(id) {
    _applyWeatherCanvas();
    for (const fn of listeners) { try { fn(id); } catch (_e) {} }
  }

  function show(id) { return state[id] !== false; }
  function set(id, on) {
    if (!IDS.includes(id)) return;
    if (on) delete state[id]; else state[id] = false;
    _save(); _changed(id);
  }
  function toggle(id) { set(id, !show(id)); }
  function hiddenCount() { return IDS.filter(id => !show(id)).length; }
  function showAll() { state = {}; _save(); _changed(null); }

  // Which layer an entity on the map belongs to. Roads, water and bridges
  // belong to none: hiding them would leave the map unreadable.
  let _types = null;
  function _typeMap() {
    if (_types) return _types;
    _types = new Map();
    const put = (layer, names) => { for (const n of names) if (T[n] !== undefined) _types.set(T[n], layer); };
    put('poles', ['POLE', 'POWERTOWER', 'WIRE', 'PROTECTOR']);
    put('networks', ['PIPE', 'UNDERGNDPIPE', 'CONVEYOR', 'UNDERGNDCONVEYOR', 'CONVEYORSPLITTER']);
    put('vegetation', ['TREE', 'BUSH']);
    return _types;
  }
  function entityLayer(type) {
    if (type === T.ROAD) return null;
    return _typeMap().get(type) || 'buildings';
  }

  // Rain, snow, wind streaks, debris and lightning share one overlay
  // canvas (WeatherCanvas): hiding it hides all of them at once.
  function _applyWeatherCanvas() {
    try {
      if (typeof WeatherCanvas === 'undefined') return;
      WeatherCanvas.getCanvas().style.visibility = show('weather') ? '' : 'hidden';
    } catch (_e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _applyWeatherCanvas);
  else setTimeout(_applyWeatherCanvas, 0);

  return {
    LAYERS, show, set, toggle, showAll, hiddenCount, entityLayer,
    onChange: fn => listeners.push(fn),
  };
})();
