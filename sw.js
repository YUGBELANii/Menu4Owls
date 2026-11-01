self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || 'New Owlzz Cafe order';
  const options = {
    body: data.body || 'A new customer order has arrived.',
    icon: data.icon || '/owlzz-icon.png',
    badge: data.badge || '/owlzz-icon.png',
    tag: data.tag || 'owlzz-new-order',
    renotify: true,
    data: { url: data.url || '/admin.html' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/admin.html', self.location.origin).href;
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
