/* GRIDWORKS Mobile service worker.
   Its job is to let the game install as an app (home-screen icon, opens
   full screen with no browser bars). It deliberately caches nothing: every
   request goes to the network as normal, so an update to the site is
   picked up on the next load and a phone never runs stale game code. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* network as usual */ });
