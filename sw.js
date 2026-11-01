/* KB GIS service worker — offline app shell, auto-updating on new deploys */
const CACHE = 'kbgis-v57';

// Local app shell — precached on install so the app opens offline.
const SHELL = [
  './',
  './index.html',
  './article-clean.js',
  './vendor/readability.js',
  './js/ui.js',
  './js/data.js',
  './js/glossary.js',
  './js/reader.js',
  './js/brief.js',
  './js/profiles.js',
  './js/weekly.js',
  './js/article.js',
  './js/app.js',
  './allocations.json',
  './lp-profiles.json',
  './gp-profiles.json',
  './feed/fundraising.json',
  './feed/investments.json',
  './market.json',
  './vendor/react.production.min.js',
  './vendor/react-dom.production.min.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/kb-logo.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const sameOrigin = new URL(req.url).origin === self.location.origin;

  // App files + data (same origin): network-first. cache:'no-cache' revalidates
  // with the server (ETag) on every request — a new deploy or data refresh is
  // picked up immediately, while unchanged files come back as 304 without
  // re-downloading. Falls back to the cache only when offline.
  if (sameOrigin) {
    event.respondWith(
      fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then((c) => c || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
    );
    return;
  }

  // Cross-origin: cache-first.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    }))
  );
});
