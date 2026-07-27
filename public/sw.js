// Deliberately minimal: this exists so the app is installable (Chrome/Android
// require a registered service worker with a fetch handler) and so a repeat
// visit while offline doesn't show a browser error page. It does NOT try to
// precache hashed build assets — Vite's filenames change every build, so a
// static precache list would go stale immediately without a build-time
// plugin. If deeper offline support (cached recovery tools, journal entries
// while offline) becomes a priority, that's real additional work on top of
// this, not a small extension of it.

const SHELL_CACHE = 'blaze-break-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.add('/'))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle top-level navigations (loading the app itself) — everything
  // else (API calls, hashed JS/CSS chunks) passes straight through to the
  // network unmodified, since caching those incorrectly risks serving stale
  // app code or stale API responses, which would be worse than no offline
  // support at all.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/').then((cached) => cached || new Response(
          '<html><body style="font-family:sans-serif;text-align:center;padding:3rem;color:#57534e"><h2>You\'re offline</h2><p>Blaze Break needs a connection to load. Reconnect and try again.</p></body></html>',
          { headers: { 'Content-Type': 'text/html' } }
        ))
      )
    );
  }
});

// This is the part that actually solves "reach someone who's stopped opening
// the app" — this handler runs even when no tab is open at all, because it's
// the service worker (not the page) receiving the push event.
self.addEventListener('push', (event) => {
  let payload = { title: 'Blaze Break', body: "You've got an update." };
  try {
    if (event.data) payload = event.data.json();
  } catch (e) {
    // Malformed payload — fall back to the generic message above rather than failing silently.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'blaze-break-pulse', // Replaces any existing pulse notification rather than stacking duplicates.
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
