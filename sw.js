/* NVK Agent service worker — app-shell cache for installable PWA.
 * Strategy: network-first for navigations (always try fresh index.html,
 * fall back to the cached shell offline); cache-first for the versioned
 * /assets/ bundles (their hashed names are immutable). Old caches are
 * purged on activate. Bump CACHE_NAME when the caching logic changes. */
const CACHE_NAME = 'nvk-agent-v1';

self.addEventListener('install', (event) => {
  // Cache the shell entry so the app can load offline after a first visit.
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add('./index.html'))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Navigations: fresh shell when online, cached shell when offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put('./index.html', copy))
            .catch(() => undefined);
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (url.pathname.includes('/assets/')) {
    // Versioned bundles: serve from cache, refresh in the background.
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(request, copy))
                .catch(() => undefined);
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
