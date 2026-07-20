/*
  Service worker: cache-first for static, rarely-changing assets
  (three.js chunks, the draco decoder, fonts, the .glb model).

  IMPORTANT: video files (.mp4/.webm) are deliberately excluded from
  this cache. Browsers fetch video with byte-range requests (so they
  can seek/stream partial content), and a service worker that caches
  a full response and replays it on every request breaks that — the
  video looks like it "won't load properly" or stalls. Videos are
  instead left to the browser's normal HTTP cache, controlled by the
  Cache-Control headers in vercel.json, which handles ranges fine.

  Bump CACHE_VERSION whenever you replace the .glb or other cached
  files, so old entries are cleared and the new file is fetched.
*/
const CACHE_VERSION = 'tanishq-portfolio-v2';

const PRECACHE_URLS = [
  '/assets/models/teresa.glb'
];

// Third-party hosts that are safe to cache-first (versioned URLs).
const CACHEABLE_HOSTS = [
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

function isCacheableRequest(request) {
  const url = new URL(request.url);

  // Never touch video — let the browser's native HTTP cache + range
  // requests handle it (see vercel.json).
  if (/\.(mp4|webm|mov)$/i.test(url.pathname)) return false;

  if (url.origin === self.location.origin) {
    return /\.(glb|gltf|bin|png|jpg|jpeg|webp|svg|css|js|woff2?)$/i.test(url.pathname);
  }
  return CACHEABLE_HOSTS.includes(url.hostname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (!isCacheableRequest(request)) return; // videos and everything else: normal network/browser cache

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
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
