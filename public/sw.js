/**
 * Pocket Service Worker — offline support and caching strategy.
 * Implements cache-first for static assets, network-first for API calls.
 * Handles background sync for queued approvals and comments.
 */

const CACHE_VERSION = 'pocket-v1';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const CACHE_DYNAMIC = `${CACHE_VERSION}-dynamic`;
const CACHE_API = `${CACHE_VERSION}-api`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/pocket',
];

const STATIC_EXTENSIONS = ['.js', '.css', '.woff2', '.png', '.svg'];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Fail gracefully if some assets don't exist
        console.log('[SW] Some static assets unavailable during install');
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName.startsWith('pocket-') && cacheName !== CACHE_STATIC && cacheName !== CACHE_DYNAMIC && cacheName !== CACHE_API) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: implement caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // API calls: network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request, CACHE_API));
    return;
  }

  // Static assets: cache-first with network fallback
  if (STATIC_EXTENSIONS.some(ext => url.pathname.endsWith(ext))) {
    event.respondWith(cacheFirstStrategy(request, CACHE_STATIC));
    return;
  }

  // HTML pages: network-first with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstStrategy(request, CACHE_DYNAMIC));
    return;
  }

  // Default: network-first
  event.respondWith(networkFirstStrategy(request, CACHE_DYNAMIC));
});

/**
 * Cache-first strategy: try cache, fall back to network.
 * Best for static assets that change infrequently.
 */
function cacheFirstStrategy(request, cacheName) {
  return caches.match(request).then((response) => {
    if (response) {
      return response;
    }
    return fetch(request).then((response) => {
      if (!response || response.status !== 200) {
        return response;
      }
      caches.open(cacheName).then((cache) => {
        cache.put(request, response.clone());
      });
      return response;
    });
  });
}

/**
 * Network-first strategy: try network, fall back to cache.
 * Best for API calls and dynamic content that changes frequently.
 */
function networkFirstStrategy(request, cacheName) {
  return fetch(request)
    .then((response) => {
      if (!response || response.status !== 200) {
        return response;
      }
      caches.open(cacheName).then((cache) => {
        cache.put(request, response.clone());
      });
      return response;
    })
    .catch(() => {
      return caches.match(request).then((response) => {
        if (response) {
          return response;
        }
        // Return offline page or error response
        return new Response('Offline - cached data unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
        });
      });
    });
}

// Background sync for queued actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-approvals') {
    event.waitUntil(syncQueuedApprovals());
  }
  if (event.tag === 'sync-comments') {
    event.waitUntil(syncQueuedComments());
  }
});

async function syncQueuedApprovals() {
  try {
    const db = await openDatabase();
    const approvals = await getAllFromStore(db, 'queued-approvals');

    for (const approval of approvals) {
      await fetch(`/api/projects/${approval.projectId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(approval),
      });

      await deleteFromStore(db, 'queued-approvals', approval.id);
    }
  } catch (error) {
    console.log('[SW] Sync approvals failed:', error);
    throw error; // Retry sync
  }
}

async function syncQueuedComments() {
  try {
    const db = await openDatabase();
    const comments = await getAllFromStore(db, 'queued-comments');

    for (const comment of comments) {
      await fetch(`/api/documents/${comment.documentId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(comment),
      });

      await deleteFromStore(db, 'queued-comments', comment.id);
    }
  } catch (error) {
    console.log('[SW] Sync comments failed:', error);
    throw error; // Retry sync
  }
}

// IndexedDB helpers
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('pocket-sync', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('queued-approvals')) {
        db.createObjectStore('queued-approvals', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('queued-comments')) {
        db.createObjectStore('queued-comments', { keyPath: 'id' });
      }
    };
  });
}

function getAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function deleteFromStore(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Push notifications for approvals and comments
self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  const data = event.data.json();
  const options = {
    body: data.body || 'New update in Scholar OS Pocket',
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%23334155" width="192" height="192"/><text x="96" y="120" font-size="96" font-family="serif" font-weight="bold" fill="%2300D9FF" text-anchor="middle">◍</text></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect fill="%2300D9FF" width="96" height="96"/><text x="48" y="64" font-size="48" font-family="serif" font-weight="bold" fill="%230F172A" text-anchor="middle">◍</text></svg>',
    tag: data.tag || 'pocket-notification',
    requireInteraction: data.requireInteraction || false,
    data: data.data || {},
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Scholar OS Pocket', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data;
  let url = '/pocket';

  if (data.url) {
    url = data.url;
  } else if (data.tab) {
    url = `/pocket?tab=${data.tab}`;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to find existing window
      for (let client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window if not found
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
