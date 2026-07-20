/*
  Service worker: cache-first for the heavy, rarely-changing assets
  (hero/project videos, 3D model, decoder files, fonts, three.js
  chunks). Once a visitor has loaded these once, every later visit
  is served straight from the Cache Storage — no network request,
  no re-download — until you bump CACHE_VERSION below.

  If you ever replace a video or the .glb file with a new version,
  bump CACHE_VERSION so old caches are cleared and the new file is
  fetched fresh.
*/
const CACHE_VERSION = 'tanishq-portfolio-v1';

const PRECACHE_URLS = [
  '/',
  '/assets/teresa.mp4',
  '/assets/teresa_open_hands.mp4',
  '/assets/models/teresa.glb'
];

// Patterns for third-party assets (three.js, draco decoder, fonts)
// that are also safe to cache-first since they're versioned URLs.
const CACHEABLE_HOSTS = [
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // Best-effort precache of local assets; don't fail install if one 404s.
      return Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch(() => {})
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

function isCacheableRequest(request) {
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    // Cache same-origin static files (videos, model, images, css/js).
    return /\.(mp4|webm|glb|gltf|bin|png|jpg|jpeg|webp|svg|css|js|woff2?)$/i.test(url.pathname);
  }
  return CACHEABLE_HOSTS.includes(url.hostname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (!isCacheableRequest(request)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached; // repeat visit: served instantly, no network hit

      return fetch(request).then((response) => {
        // Only cache good, basic/cors responses.
        if (!response || response.status !== 200 || (response.type !== 'basic' && response.type !== 'cors')) {
          return response;
        }
        const responseClone = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, responseClone));
        return response;
      }).catch(() => cached);
    })
  );
});
