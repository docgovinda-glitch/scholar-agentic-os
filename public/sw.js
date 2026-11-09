/**
 * Scholar Agentic OS Service Worker — offline support and static asset caching.
 * Implements cache-first for static assets and network-first for HTML navigation.
 * Never caches non-GET requests or authenticated /api/* endpoints.
 */

const CACHE_VERSION = 'scholar-v2';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const CACHE_DYNAMIC = `${CACHE_VERSION}-dynamic`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
];

const STATIC_EXTENSIONS = ['.js', '.css', '.woff2', '.png', '.svg'];

// Install: cache static shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Fail gracefully if some assets are unavailable during install
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches (including legacy pocket-* caches)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          const isManaged = cacheName.startsWith('pocket-') || cacheName.startsWith('scholar-');
          if (isManaged && cacheName !== CACHE_STATIC && cacheName !== CACHE_DYNAMIC) {
            return caches.delete(cacheName);
          }
          return undefined;
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: implement caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never intercept or cache non-GET requests (POST/PUT/DELETE/PATCH)
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Never cache authenticated or dynamic API responses in Service Worker storage
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Static assets: cache-first with network fallback
  if (STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext))) {
    event.respondWith(cacheFirstStrategy(request, CACHE_STATIC));
    return;
  }

  // HTML navigation & other GET requests: network-first with cache fallback
  event.respondWith(networkFirstStrategy(request, CACHE_DYNAMIC));
});

/**
 * Cache-first strategy: try cache, fall back to network.
 * Best for hashed static assets that change infrequently.
 */
function cacheFirstStrategy(request, cacheName) {
  return caches.match(request).then((response) => {
    if (response) {
      return response;
    }
    return fetch(request).then((networkResponse) => {
      if (!networkResponse || networkResponse.status !== 200) {
        return networkResponse;
      }
      const cloned = networkResponse.clone();
      caches.open(cacheName).then((cache) => {
        cache.put(request, cloned);
      });
      return networkResponse;
    });
  });
}

/**
 * Network-first strategy: try network, fall back to cache.
 * Best for HTML navigation shells.
 */
function networkFirstStrategy(request, cacheName) {
  return fetch(request)
    .then((response) => {
      if (!response || response.status !== 200) {
        return response;
      }
      const cloned = response.clone();
      caches.open(cacheName).then((cache) => {
        cache.put(request, cloned);
      });
      return response;
    })
    .catch(() => {
      return caches.match(request).then((response) => {
        if (response) {
          return response;
        }
        return new Response('Offline - cached data unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
        });
      });
    });
}

// Push notifications for Scholar Core
self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  const data = event.data.json();
  const options = {
    body: data.body || 'New update in Scholar Agentic OS',
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%23171717" width="192" height="192" rx="36"/><text x="96" y="132" font-size="104" font-family="serif" font-weight="bold" fill="%23FAFAFA" text-anchor="middle">S</text></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect fill="%23171717" width="96" height="96" rx="18"/><text x="48" y="66" font-size="52" font-family="serif" font-weight="bold" fill="%23FAFAFA" text-anchor="middle">S</text></svg>',
    tag: data.tag || 'scholar-notification',
    requireInteraction: data.requireInteraction || false,
    data: data.data || {},
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Scholar Agentic OS', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let url = '/projects';

  if (data.url) {
    url = data.url;
  } else if (data.tab) {
    url = `/projects?tab=${data.tab}`;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
      return undefined;
    })
  );
});
