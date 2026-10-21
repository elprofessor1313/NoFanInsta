// Service worker : permet d'ouvrir l'app sans connexion une fois installée.
// CACHE (version) et ASSETS (fichiers à garder hors connexion) sont remplis par build.mjs.
const CACHE = 'tascru-__VERSION__';
const OLD_PREFIXES = ['tascru-', 'desabos-']; // desabos- : caches de l'ancien nom
const ASSETS = __ASSETS__;

self.addEventListener('install', (event) => {
  // cache: 'reload' : ignorer le cache HTTP (GitHub Pages garde les fichiers 10 minutes)
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => OLD_PREFIXES.some((p) => k.startsWith(p)) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  // Page : réseau d'abord (pour recevoir les mises à jour, sans passer par le cache HTTP), cache sinon
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then((res) => { caches.open(CACHE).then((c) => c.put('index.html', res.clone())); return res; })
        .catch(() => caches.match('index.html'))
    );
    return;
  }
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
