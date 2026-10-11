/* Amrita Sahaya service-worker additions (Phase 8), loaded by the generated
 * worker through Workbox importScripts.
 *
 * Background sync: the sign-in token lives only in the open tab, so this
 * worker never sends queued actions itself. When the connection returns it
 * asks an open app window to send them; with no window open it shows a
 * reminder (only if notifications are already allowed). It never says
 * anything was delivered.
 *
 * Push: shows the server's short notice and opens the app when tapped. The
 * server sends no personal details in a push.
 */
const SYNC_TAG = 'sahaya-outbox';

self.addEventListener('sync', (event) => {
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      if (windows.length > 0) {
        windows.forEach((w) => w.postMessage({ type: 'sahaya-flush' }));
        return undefined;
      }
      if (self.Notification && self.Notification.permission === 'granted')
        return self.registration.showNotification('Amrita Sahaya', {
          body: 'Something you did is still waiting to send. Open the app to send it.',
          tag: SYNC_TAG,
          icon: 'brand/icon-192.png',
        });
      return undefined;
    }),
  );
});

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === 'string' ? data.title : 'Amrita Sahaya';
  const body =
    typeof data.body === 'string' ? data.body : 'Open Amrita Sahaya to see what needs attention.';
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: typeof data.tag === 'string' ? data.tag : 'sahaya',
      icon: 'brand/icon-192.png',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ('focus' in w) {
          w.postMessage({ type: 'sahaya-open', url });
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
