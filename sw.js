/**
 * Service Worker for Scholar Agentic OS PWA
 *
 * Fixed 2026-07-31: two real bugs found while diagnosing a blank-screen
 * report after a production deploy.
 *
 * 1. ASSETS_TO_CACHE referenced /icons/icon-192.png and /icons/icon-512.png,
 *    which don't exist anywhere in this repo (404). cache.addAll() is
 *    all-or-nothing — any single failing request fails the whole install,
 *    so a *fresh* service worker registration was silently failing outright
 *    (confirmed: a clean browser session never got one registered at all).
 *    Removed the nonexistent entries rather than adding icon files that
 *    don't exist yet.
 * 2. Never called self.skipWaiting()/self.clients.claim(), and reused the
 *    same hardcoded CACHE_NAME across every version of this file. A
 *    successfully-installed worker from an old deploy could keep
 *    controlling an already-open tab indefinitely — surviving many
 *    subsequent deploys (and even hard refreshes, which bypass the HTTP
 *    cache but not an already-active service worker) — running whatever
 *    caching logic that old version had, invisible to anyone reading only
 *    the current file. Now claims control immediately on activate, and the
 *    cache name changes whenever this file's cached asset list changes, so
 *    stale caches actually get cleaned up promptly instead of lingering.
 */

const CACHE_NAME = 'scholar-os-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) { return cache.addAll(ASSETS_TO_CACHE); })
  );
});

self.addEventListener('fetch', function(event) {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(function() { return caches.match('/index.html'); })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function(response) {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
          .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});
