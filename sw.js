const CACHE = 'mystats-v49';
const ASSETS = ['/', '/index.html', '/style.css', '/manifest.json', '/js/db.js', '/js/profile.js', '/js/config.js', '/js/onboarding.js', '/js/today.js', '/js/workout.js', '/js/running.js', '/js/bodyscan.js', '/js/progress.js', '/js/reminders.js', '/js/settings.js', '/js/app.js', '/js/recovery.js', '/js/journal.js', '/js/prs.js', '/js/programmes.js', '/js/programme-editor.js', '/js/pr-detect.js', '/icon-192.png', '/icon-512.png', '/favicon.ico'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Non-same-origin or API proxy routes — pass straight to network, never cache
  if (!url.startsWith(self.location.origin) || url.includes('/api/')) return;
  // Static assets — serve from cache, fall back to network
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
