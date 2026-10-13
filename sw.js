/* Quest Log service worker: makes the app load and work offline.
   Strategy: serve from cache instantly, refresh the cache in the background (stale-while-revalidate).
   Bump VERSION when you ship changes so old caches are cleaned up. */
const VERSION = 'quest-v1';
const CORE = [
  './', 'index.html', 'styles.css', 'app.js', 'logic.js', 'config.js',
  'manifest.webmanifest', 'vendor/supabase.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // never touch Supabase / other origins

  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req)
      .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (req.mode === 'navigate') {
      const idx = await cache.match('index.html');
      if (idx) return idx;
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});
