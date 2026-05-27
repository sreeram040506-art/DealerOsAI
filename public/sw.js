// Self-uninstalling service worker.
// This file exists only so that browsers with an old SW registration
// fetch it, execute it, and the SW immediately unregisters itself.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((name) => caches.delete(name)))
    ).then(() => self.clients.claim())
     .then(() => self.registration.unregister())
  );
});