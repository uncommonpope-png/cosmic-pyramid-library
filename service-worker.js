// Cosmic Pyramid Library — Service Worker
// Cache-first for immutable assets (GLBs, CDN libs) -> repeat visits load instantly.
// Network-first for HTML/JS so deployments show up; falls back to cache offline.
const CACHE = 'cpl-v16';
const ASSET_RE = /\/assets\//;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never cache any configured live soul endpoint. Offline continuity uses the explicit snapshot layer.
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.pathname.startsWith('/mcp/')) return;
  if (ASSET_RE.test(url.pathname) || url.hostname.includes('unpkg.com')) {
    e.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(req).then((cached) =>
          cached || fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
        )
      )
    );
  } else {
    e.respondWith(
      fetch(req)
        .then((res) => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then((cache) => cache.put(req, c)); } return res; })
        .catch(() => caches.match(req))
    );
  }
});
