/**
 * Gau Vigyan Pariksha 2026 — Service Worker kill switch.
 *
 * The offline-caching service worker (stale-while-revalidate, ignoring
 * query strings) was serving already-registered visitors a cached copy of
 * pay.html/index.html even right after a fresh deploy, masking bug fixes
 * behind an extra "visit twice" step with no indication anything was
 * stale. Rather than just deleting this file (which leaves any already-
 * installed service worker running indefinitely — deploy fixes were
 * getting masked by exactly that), this file now unregisters itself,
 * clears every cache it created, and reloads any open tabs so already
 * registered visitors immediately go back to plain network requests.
 * index.html/pay.html no longer register a service worker, so this only
 * ever runs for someone who still has the old one installed.
 */
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) { return caches.delete(key); }));
      })
      .then(function () {
        return self.registration.unregister();
      })
      .then(function () {
        return self.clients.matchAll({ type: 'window' });
      })
      .then(function (clients) {
        clients.forEach(function (client) { client.navigate(client.url); });
      })
  );
});
