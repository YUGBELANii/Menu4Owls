'use strict';
(function () {
  const enable = document.getElementById('customer-push-enable');
  const disable = document.getElementById('customer-push-disable');
  const status = document.getElementById('customer-push-status');
  if (!enable || !disable || !status) return;

  const defaultLabel = '🔔 Enable notifications';
  const supported = window.isSecureContext && 'Notification' in window &&
    'serviceWorker' in navigator && 'PushManager' in window;
  const message = text => { status.textContent = text; };

  function deniedState() {
    enable.hidden = false;
    enable.disabled = true;
    enable.textContent = 'Permission denied';
    message('Notifications are blocked. Allow them for this site in your browser settings, then reload.');
  }

  async function state() {
    if (!supported) {
      enable.hidden = false;
      enable.disabled = true;
      enable.textContent = 'Notifications unavailable';
      disable.hidden = true;
      message('Push notifications are not supported in this browser or connection.');
      return;
    }
    if (Notification.permission === 'denied') {
      disable.hidden = true;
      deniedState();
      return;
    }
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = registration && await registration.pushManager.getSubscription();
    enable.hidden = !!subscription;
    enable.disabled = false;
    enable.textContent = defaultLabel;
    disable.hidden = !subscription;
    message(subscription ? 'Notifications enabled on this device.' : 'Get cafe updates on this device.');
  }

  enable.addEventListener('click', async () => {
    if (!supported || Notification.permission === 'denied') {
      if (Notification.permission === 'denied') deniedState();
      return;
    }
    enable.disabled = true;
    enable.textContent = 'Enabling…';
    message('Enabling notifications…');
    try {
      // Permission is requested only in response to this explicit customer click.
      const permission = Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
      if (permission !== 'granted') {
        if (permission === 'denied') deniedState();
        else throw new Error('Permission was not granted. You can try again when ready.');
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      const keyResponse = await fetch('/api/push-public-key', { cache: 'no-store' });
      if (!keyResponse.ok) throw new Error('Notification setup is unavailable right now.');
      const { publicKey } = await keyResponse.json();
      if (typeof publicKey !== 'string' || !publicKey) throw new Error('Notification setup is unavailable right now.');
      const paddedKey = publicKey.replace(/-/g, '+').replace(/_/g, '/');
      const applicationServerKey = Uint8Array.from(
        atob(paddedKey + '='.repeat((4 - paddedKey.length % 4) % 4)),
        character => character.charCodeAt(0)
      );

      // Reuse an existing browser subscription; the API upserts by endpoint as well.
      const subscription = await registration.pushManager.getSubscription() ||
        await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      const response = await fetch('/api/push-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Could not save this device subscription.');
      }
      await state();
      message('Notifications enabled on this device.');
    } catch (error) {
      enable.disabled = false;
      enable.textContent = defaultLabel;
      message(`Subscription failed: ${error.message || 'Please try again.'}`);
    }
  });

  disable.addEventListener('click', async () => {
    disable.disabled = true;
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = registration && await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch('/api/push-unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });
        if (!response.ok) throw new Error('Could not remove this subscription from the server.');
        await subscription.unsubscribe();
      }
      message('Notifications disabled on this device.');
      await state();
      message('Notifications disabled on this device.');
    } catch (error) {
      message(`Unsubscribe failed: ${error.message || 'Please try again.'}`);
    } finally {
      disable.disabled = false;
    }
  });

  state().catch(() => message('Notification settings could not be loaded.'));
})();
