/**
 * Gau Vigyan Pariksha 2026 — Service Worker
 * Provides offline caching for static app shell assets and network resilience.
 */
var CACHE_NAME = 'gvp-2026-v2';
var STATIC_ASSETS = [
  './',
  'index.html',
  'pay.html',
  'manifest.json',
  'css/app.css',
  'js/locations.js',
  'js/api.js',
  'js/pdf-report.js',
  'img/firefly-1.jpg',
  'img/event-poster.jpeg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) {
          return key !== CACHE_NAME;
        }).map(function (key) {
          return caches.delete(key);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  var url = new URL(request.url);

  // Never cache API calls to Google Apps Script or external non-GET requests
  if (request.method !== 'GET' || url.hostname.indexOf('script.google.com') !== -1) {
    return;
  }

  // Stale-while-revalidate for local static assets (ignore query strings like ?v=20260907)
  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(request, { ignoreSearch: true }).then(function (cachedResponse) {
        var fetchPromise = fetch(request).then(function (networkResponse) {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(function () {
          // If offline and no cached response for navigation, return cached index.html
          if (!cachedResponse && request.mode === 'navigate') {
            return cache.match('index.html');
          }
          return cachedResponse;
        });

        return cachedResponse || fetchPromise;
      });
    })
  );
});
