/* ═══════════════════════════════════════════════════════════════════
   SAVED PATH SYSTEM
   Truck patrol paths drawn with the Path Tool used to only exist while
   attached to a specific truck (drawing one required clicking near an
   existing truck, and the waypoints lived on that truck entity alone).
   This registry lets a path be drawn and named with no truck in the
   world at all, then assigned to any truck later from the Patrol panel.
   ═══════════════════════════════════════════════════════════════════ */
const SavedPathSystem = (() => {
  let _paths  = [];   // [{ id, name, waypoints:[{wx,wy}] }]
  let _nextId = 1;

  return {
    all() { return _paths; },
    get(id) { return _paths.find(p => p.id === id) || null; },

    // Stores a copy of the given waypoints (never the live array — the path
    // tool mutates/clears its working array after every confirm).
    add(waypoints, name) {
      const id = _nextId++;
      const path = {
        id,
        name: name || `Path ${id}`,
        waypoints: waypoints.map(p => ({ wx: p.wx, wy: p.wy })),
      };
      _paths.push(path);
      return path;
    },

    rename(id, name) {
      const p = this.get(id);
      if (p && name && name.trim()) p.name = name.trim();
    },

    // Replaces a path's waypoints in place (same id/name) — used when
    // extending an existing saved path by drawing on from one of its ends.
    setWaypoints(id, waypoints) {
      const p = this.get(id);
      if (p) p.waypoints = waypoints.map(w => ({ wx: w.wx, wy: w.wy }));
    },

    remove(id) {
      const i = _paths.findIndex(p => p.id === id);
      if (i >= 0) _paths.splice(i, 1);
    },

    reset() { _paths = []; _nextId = 1; },

    save() { return { nextId: _nextId, paths: _paths }; },
    load(data) {
      if (!data || !Array.isArray(data.paths)) { this.reset(); return; }
      _paths  = data.paths;
      _nextId = data.nextId || (_paths.reduce((m, p) => Math.max(m, p.id || 0), 0) + 1);
    },
  };
})();
