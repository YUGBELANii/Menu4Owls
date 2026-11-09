self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || 'New Owlz Corner order';
  const options = {
    body: data.body || 'A new customer order has arrived.',
    icon: data.icon || '/owlzz-icon.png',
    badge: data.badge || '/owlzz-icon.png',
    tag: data.tag || 'owlzz-new-order',
    renotify: false,
    image: data.image || undefined,
    data: { url: data.url || '/' }
  };
  event.waitUntil((async () => {
    const openClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (openClients.some(client => { try { return new URL(client.url).origin === self.location.origin; } catch (_) { return false; } })) return;
    await self.registration.showNotification(title, options);
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const raw = event.notification.data?.url || '/';
  let target;
  try { const parsed = new URL(raw, self.location.origin); target = parsed.protocol === 'https:' && parsed.origin === self.location.origin ? parsed.href : self.location.origin + '/'; }
  catch (_) { target = self.location.origin + '/'; }
  event.waitUntil((async () => {
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
