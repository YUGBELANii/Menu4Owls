// No runtime asset cache is used. Changing this file updates its script
// fingerprint, and the storefront calls register('/sw.js') to check updates.
const BRAND_LOGO_URL = new URL('/OwlzLogo.png', self.location.origin).href;

function httpsUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value, self.location.origin);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : undefined;
  } catch (_) {
    return undefined;
  }
}

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}

  const title = typeof data.title === 'string' && data.title.trim()
    ? data.title.trim()
    : 'Owlz Corner';
  const options = {
    body: data.body || 'You have a new update from Owlz Corner.',
    icon: BRAND_LOGO_URL,
    // No separate monochrome badge asset exists in the current brand files.
    tag: data.tag || 'owlzz-notification',
    renotify: false,
    image: httpsUrl(data.image),
    data: { url: data.url || '/' }
  };

  event.waitUntil((async () => {
    const openClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (openClients.some(client => {
      try { return new URL(client.url).origin === self.location.origin; }
      catch (_) { return false; }
    })) return;
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  let target = `${self.location.origin}/`;
  try {
    const parsed = new URL(event.notification.data?.url || '/', self.location.origin);
    if (parsed.origin === self.location.origin || parsed.protocol === 'https:') target = parsed.href;
  } catch (_) {}

  event.waitUntil((async () => {
    if (!target.startsWith(`${self.location.origin}/`)) {
      await clients.openWindow(target);
      return;
    }
    const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if (client.url.startsWith(self.location.origin)) {
        await client.focus();
        if ('navigate' in client) await client.navigate(target);
        return;
      }
    }
    await clients.openWindow(target);
  })());
});
