'use strict';
(function () {
  const PREFERENCE_KEY = 'owlzz_customer_push_choice_v1';
  const STATUS_KEY = 'owlzz_customer_push_subscription_status_v1';
  const BROWSER_ID_KEY = 'owlzz_customer_notification_browser_id_v1';
  const dialog = document.getElementById('push-opt-in');
  const acceptButton = document.getElementById('push-opt-in-accept');
  const refuseButton = document.getElementById('push-opt-in-refuse');
  const supported = window.isSecureContext && 'Notification' in window &&
    'serviceWorker' in navigator && 'PushManager' in window;
  let inMemoryBrowserId = null;
  let resolveDialog = null;
  let pendingDecision = null;

  function withTimeout(promise, milliseconds, message) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })
    ]).finally(() => clearTimeout(timer));
  }

  function getBrowserId() {
    try {
      const saved = localStorage.getItem(BROWSER_ID_KEY);
      if (saved && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved)) return saved;
    } catch (_) { /* Continue with an in-memory ID when storage is unavailable. */ }
    if (inMemoryBrowserId) return inMemoryBrowserId;
    try {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
      inMemoryBrowserId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    } catch (error) {
      console.warn('Could not create a browser preference ID:', error);
      return null;
    }
    try { localStorage.setItem(BROWSER_ID_KEY, inMemoryBrowserId); }
    catch (_) { /* Preference still works for this page session. */ }
    return inMemoryBrowserId;
  }

  function getLocalPreference() {
    try {
      const saved = localStorage.getItem(PREFERENCE_KEY);
      if (saved === 'accepted' || saved === 'refused') return saved;
      // Preserve affirmative and refusal choices made by the previous version.
      if (saved === 'subscribed' || saved === 'accepted-pending') return 'accepted';
      if (saved === 'refused') return 'refused';
    } catch (_) { /* The server can still provide the saved decision. */ }
    return null;
  }

  function getLocalStatus() {
    try {
      const value = localStorage.getItem(STATUS_KEY);
      return ['subscribed', 'unavailable', 'denied', 'failed', 'not_attempted'].includes(value)
        ? value
        : localStorage.getItem(PREFERENCE_KEY) === 'subscribed'
          ? 'subscribed'
          : localStorage.getItem(PREFERENCE_KEY) === 'accepted-pending'
            ? 'failed'
            : 'not_attempted';
    } catch (_) { return 'not_attempted'; }
  }

  function saveLocal(preference, subscriptionStatus) {
    try { localStorage.setItem(PREFERENCE_KEY, preference); }
    catch (error) { console.warn('Could not save notification preference locally:', error); }
    try { localStorage.setItem(STATUS_KEY, subscriptionStatus); }
    catch (error) { console.warn('Could not save notification status locally:', error); }
  }

  async function persistPreference(preference, subscriptionStatus) {
    saveLocal(preference, subscriptionStatus);
    const browserId = getBrowserId();
    if (!browserId) {
      console.warn('Notification choice is saved for this session, but server sync is unavailable.');
      return false;
    }
    try {
      const response = await withTimeout(fetch('/api/customer-notification-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ browser_id: browserId, preference, subscription_status: subscriptionStatus })
      }), 3000, 'Notification preference save timed out.');
      if (!response.ok) throw new Error(`Preference API returned ${response.status}.`);
      return true;
    } catch (error) {
      console.warn('Could not sync notification preference; keeping the local choice:', error);
      return false;
    }
  }

  async function loadServerPreference() {
    const browserId = getBrowserId();
    if (!browserId) return null;
    try {
      const response = await withTimeout(fetch(`/api/customer-notification-preference?browser_id=${encodeURIComponent(browserId)}`, { cache: 'no-store' }), 3000, 'Notification preference lookup timed out.');
      if (!response.ok) throw new Error(`Preference API returned ${response.status}.`);
      const result = await response.json();
      const saved = result?.preference;
      if (!saved || !['accepted', 'refused'].includes(saved.preference)) return null;
      saveLocal(saved.preference, saved.subscription_status || 'not_attempted');
      return saved.preference;
    } catch (error) {
      console.warn('Could not load notification preference; checkout will continue:', error);
      return null;
    }
  }

  function closePrompt(choice, decision) {
    pendingDecision = decision || { choice };
    if (dialog?.open) {
      try { dialog.close(choice); }
      catch (error) { console.warn('Could not close notification opt-in:', error); }
    }
    finishPrompt();
  }

  function finishPrompt() {
    if (!resolveDialog) return;
    const result = pendingDecision || { choice: 'refused' };
    pendingDecision = null;
    const resolve = resolveDialog;
    resolveDialog = null;
    resolve(result);
  }

  function requestPermissionFromClick() {
    if (!supported) return Promise.resolve({ permission: 'unavailable' });
    if (Notification.permission === 'denied') return Promise.resolve({ permission: 'denied' });
    if (Notification.permission !== 'default') return Promise.resolve({ permission: Notification.permission });
    try {
      return Promise.resolve(Notification.requestPermission()).then(
        permission => ({ permission }),
        error => ({ error })
      );
    } catch (error) { return Promise.resolve({ error }); }
  }

  if (acceptButton) acceptButton.addEventListener('click', () => {
    // Persist the affirmative choice locally and start the API save before asking
    // for permission. Permission is requested synchronously in this click gesture.
    const preferenceSave = persistPreference('accepted', 'not_attempted');
    const permission = requestPermissionFromClick();
    closePrompt('accepted', { choice: 'accepted', preferenceSave, permission });
  });

  function refuse() {
    const preferenceSave = persistPreference('refused', 'not_attempted');
    closePrompt('refused', { choice: 'refused', preferenceSave });
  }

  if (refuseButton) refuseButton.addEventListener('click', refuse);
  if (dialog) {
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      refuse();
    });
    dialog.addEventListener('click', event => {
      if (event.target === dialog) refuse();
    });
    dialog.addEventListener('close', () => {
      if (resolveDialog) {
        if (pendingDecision) finishPrompt();
        else refuse();
      }
    });
  }

  async function subscribeAfterAcceptance(permissionPromise) {
    let status = 'failed';
    if (!supported) return 'unavailable';
    try {
      const decision = await withTimeout(permissionPromise, 8000, 'Notification permission request timed out.');
      if (decision?.error) throw decision.error;
      const permission = decision?.permission;
      if (permission === 'denied') return 'denied';
      if (permission !== 'granted') return 'failed';
      const registration = await navigator.serviceWorker.register('/sw.js');
      const keyResponse = await withTimeout(fetch('/api/push-public-key', { cache: 'no-store' }), 5000, 'Push setup request timed out.');
      if (!keyResponse.ok) throw new Error('Notification setup is unavailable.');
      const { publicKey } = await keyResponse.json();
      if (typeof publicKey !== 'string' || !publicKey) throw new Error('Notification setup is unavailable.');
      const padded = publicKey.replace(/-/g, '+').replace(/_/g, '/');
      const applicationServerKey = Uint8Array.from(atob(padded + '='.repeat((4 - padded.length % 4) % 4)), character => character.charCodeAt(0));
      const subscription = await registration.pushManager.getSubscription() ||
        await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      const response = await withTimeout(fetch('/api/push-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() })
      }), 5000, 'Push subscription save timed out.');
      if (!response.ok) throw new Error('Could not save this device subscription.');
      status = 'subscribed';
    } catch (error) {
      console.warn('Customer notification subscription failed:', error);
    }
    return status;
  }

  window.askCustomerPushOptIn = async function () {
    let preference = getLocalPreference();
    if (preference) {
      await persistPreference(preference, getLocalStatus());
      return preference;
    }

    preference = await loadServerPreference();
    if (preference) return preference;

    if (!dialog || typeof dialog.showModal !== 'function') {
      const preferenceSave = persistPreference('refused', 'unavailable');
      await preferenceSave;
      return 'refused';
    }

    const decision = await new Promise(resolve => {
      resolveDialog = resolve;
      pendingDecision = null;
      try { dialog.showModal(); }
      catch (error) {
        console.warn('Could not open notification opt-in:', error);
        const preferenceSave = persistPreference('refused', 'unavailable');
        closePrompt('refused', { choice: 'refused', preferenceSave });
      }
    });

    await decision.preferenceSave;
    if (decision.choice === 'accepted') {
      const status = await subscribeAfterAcceptance(decision.permission);
      await persistPreference('accepted', status);
    }
    return decision.choice;
  };
})();
