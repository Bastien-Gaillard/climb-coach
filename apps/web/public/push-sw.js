/*
 * Service worker des notifications de fin de bloc du minuteur de séance.
 * L'API envoie un message push à l'heure de fin de chaque bloc, même téléphone verrouillé.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const LIVE = '/seance-en-cours';

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Séance en cours à l'écran : la page vibre déjà elle-même, pas de notification en double
      const watching = windows.some(
        (c) => c.focused && c.visibilityState === 'visible' && new URL(c.url).pathname === LIVE,
      );
      if (watching) return;
      await self.registration.showNotification(data.title || 'climb-coach', {
        body: data.body || '',
        icon: '/favicon.ico',
        // Une seule notification du minuteur à la fois, mais chaque fin de bloc resonne et vibre
        tag: 'minuteur',
        renotify: true,
        vibrate: [200, 100, 200],
        timestamp: data.at || Date.now(),
        data: { url: data.url || LIVE },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || LIVE;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const win = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (!win) return self.clients.openWindow(url);
      await win.focus();
      if (new URL(win.url).pathname !== url && 'navigate' in win) {
        await win.navigate(url).catch(() => undefined);
      }
    })(),
  );
});
