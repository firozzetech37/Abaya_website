/* global self, caches */
/*
 * Abaya Atelier service worker (registered by components/pwa/pwa.tsx in production).
 * It makes the website installable and shows an offline page when there is no connection.
 * It never caches pages, data or images: every page always comes fresh from the network, so a
 * new version is live the moment it is deployed. Only the offline page and its icon are kept.
 */
const CACHE = 'abaya-offline-v1';
const OFFLINE = ['/offline.html', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(OFFLINE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  // Only page loads: everything else goes straight to the network, untouched.
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
});
