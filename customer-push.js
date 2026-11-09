'use strict';
(function () {
  const enable = document.getElementById('customer-push-enable');
  const disable = document.getElementById('customer-push-disable');
  const status = document.getElementById('customer-push-status');
  if (!enable || !disable || !status) return;
  const message = text => { status.textContent = text; };
  const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  if (!supported) { enable.disabled = true; message('Push notifications are not supported in this browser.'); return; }

  async function state() {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg && await reg.pushManager.getSubscription();
    enable.hidden = !!sub;
    disable.hidden = !sub;
    if (Notification.permission === 'denied') { enable.disabled = true; enable.hidden = false; message('Notifications are blocked in browser settings.'); }
    else message(sub ? 'Notifications are enabled on this device.' : 'Get occasional cafe updates on this device.');
  }
  enable.addEventListener('click', async () => {
    enable.disabled = true;
    try {
      if (Notification.permission === 'denied') throw new Error('Notifications are blocked in browser settings.');
      const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (permission !== 'granted') throw new Error('Notification permission was not granted.');
      const reg = await navigator.serviceWorker.register('/sw.js');
      const keyResponse = await fetch('/api/push-public-key');
      if (!keyResponse.ok) throw new Error('Notifications are not configured yet.');
      const { publicKey } = await keyResponse.json();
      const padded = publicKey.replace(/-/g, '+').replace(/_/g, '/');
      const applicationServerKey = Uint8Array.from(atob(padded + '='.repeat((4 - padded.length % 4) % 4)), c => c.charCodeAt(0));
      const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      const response = await fetch('/api/push-register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: subscription.toJSON() }) });
      if (!response.ok) { await subscription.unsubscribe(); throw new Error((await response.json().catch(() => ({}))).error || 'Could not save subscription.'); }
      message('Notifications enabled.');
      await state();
    } catch (error) { message(error.message || 'Could not enable notifications.'); enable.disabled = false; }
  });
  disable.addEventListener('click', async () => {
    disable.disabled = true;
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = reg && await reg.pushManager.getSubscription();
      if (sub) {
        const response = await fetch('/api/push-unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        if (!response.ok) throw new Error('Could not remove the subscription from the server.');
        await sub.unsubscribe();
      }
      message('Notifications disabled.');
      await state();
    } catch (error) { message(error.message || 'Could not disable notifications.'); }
    finally { disable.disabled = false; }
  });
  state().catch(() => message('Notification settings could not be loaded.'));
})();
