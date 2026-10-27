// Offline support: serve from cache first, refresh the cache in the background.
// Bump VERSION whenever files change so installed copies pick up the update.
const VERSION = 'nr-v1';

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'js/app.js',
  'js/util.js',
  'js/db.js',
  'js/store.js',
  'js/ui.js',
  'js/lock.js',
  'js/ics.js',
  'js/crypto.js',
  'js/views/today.js',
  'js/views/quickadd.js',
  'js/views/wellbeing.js',
  'js/views/care.js',
  'js/views/emergency.js',
  'js/views/money.js',
  'js/views/insights.js',
  'js/views/settings.js',
  'js/views/onboarding.js',
  'js/views/backup.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const refresh = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || refresh || (request.mode === 'navigate' ? cache.match('index.html') : undefined);
    })
  );
});
