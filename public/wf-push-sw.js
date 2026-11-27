// public/wf-push-sw.js — service worker for opt-in Wayfind daily-pick pushes.
// Deliberately has NO fetch handler: it must never intercept page requests.
// Payload (JSON): { title, body, url, tag }

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Only same-origin paths ("/x"), never protocol-relative ("//host") or absolute URLs.
function safePath(u) {
  return typeof u === 'string' && u.startsWith('/') && !u.startsWith('//') && !u.includes('\\') ? u : '/';
}

self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    d = {};
  }
  const title = String(d.title || 'Your Wayfind pick').slice(0, 80);
  event.waitUntil(
    self.registration.showNotification(title, {
      body: String(d.body || '').slice(0, 180),
      icon: '/icon.png',
      badge: '/icon.png',
      tag: typeof d.tag === 'string' && d.tag ? d.tag.slice(0, 64) : 'wf-daily-pick',
      renotify: false,
      data: { url: safePath(d.url) },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safePath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
          return c.focus().then((f) => (f && 'navigate' in f ? f.navigate(url) : undefined));
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
