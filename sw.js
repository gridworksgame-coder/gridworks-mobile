/* GRIDWORKS Mobile service worker.
   1. Lets the game install as an app (home-screen icon, opens full screen
      with no browser bars).
   2. Keeps every load current. GitHub Pages tells browsers to reuse a file
      for 10 minutes, so right after an update a phone could run a mix of
      old and new game files. Here every request for the site's own files
      asks the server whether it changed (an unchanged file costs a tiny
      "not modified" reply, not a re-download). Nothing is cached by this
      worker itself. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.headers.has('range')) return;   // audio streaming: leave to the browser
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).catch(() => fetch(req)));
    return;
  }
  e.respondWith(fetch(new Request(req, { cache: 'no-cache' })).catch(() => fetch(req)));
});
