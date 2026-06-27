const CACHE = 'camp-v3';
const APP_SHELL = ['/'];

// API paths that must NEVER be served from cache. GOTCHA (from connection-made-simple):
// EVERY top-level API prefix the SPA calls must be listed here. A missing one falls
// through to the cache-first asset path below and can get the SPA's HTML cached under
// that URL — which then breaks JSON parsing ("unexpected token <"). When you add a new
// top-level API route to the backend, add it here AND bump CACHE above.
const API_RE = /^\/(auth|home|settings|admin|registrants|accommodation|campers|checkin|attendance|notes|search|notifications|schedule|faq|devotional|import|accounts|health|setup)(\/|$|\?)/;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Network-only for API routes (never serve stale data).
  if (API_RE.test(url.pathname)) return;

  // Network-first for the HTML shell — always pick up the latest deploy when online,
  // fall back to cache when offline.
  if (url.pathname === '/' || url.pathname === '/index.html') {
    e.respondWith(
      fetch(request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return res;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for other static assets (manifest, icons, fonts).
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return res;
      });
    })
  );
});
