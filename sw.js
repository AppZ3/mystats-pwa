const CACHE = 'mystats-v21';
const ASSETS = ['/', '/index.html', '/style.css', '/manifest.json', '/js/db.js', '/js/profile.js', '/js/config.js', '/js/onboarding.js', '/js/today.js', '/js/workout.js', '/js/running.js', '/js/bodyscan.js', '/js/progress.js', '/js/reminders.js', '/js/settings.js', '/js/app.js', '/js/recovery.js'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  // Only cache same-origin requests — let external API calls (Anthropic, CDNs) pass through untouched
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
