'use strict';

(function () {
  let ordersChannel = null;
  let audioContext = null;
  let initialized = false;
  const knownOrderIds = new Set();

  function money(value) {
    return Number(value || 0).toFixed(2);
  }

  function claimOrderAlert(orderId) {
    try {
      const key = 'owlzz-recent-order-alerts';
      const recent = JSON.parse(localStorage.getItem(key) || '[]');
      const id = String(orderId);
      if (recent.includes(id)) return false;
      localStorage.setItem(key, JSON.stringify([...recent, id].slice(-40)));
    } catch (_) {
      return true;
    }
    return true;
  }

  function showNewOrderAlert(order) {
    const firstAlertForOrder = claimOrderAlert(order.id);
    const token = order.order_token || 'New order';
    const message = `Order ${token} · ₹${money(order.total)}`;

    if (!firstAlertForOrder) {
      document.dispatchEvent(new CustomEvent('owlzz:new-order', { detail: order }));
      return;
    }

    const toast = document.getElementById('new-order-toast');
    const messageElement = document.getElementById('new-order-toast-message');

    if (toast && messageElement) {
      messageElement.textContent = message;
      toast.classList.add('show');
    }

    if (audioContext) {
      try {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(660, audioContext.currentTime + 0.18);
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.48);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.5);
      } catch (error) {
        console.warn('Order alert sound could not play:', error);
      }
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification('New Owlzz Cafe order', {
        body: message,
        tag: `owlzz-order-${order.id}`,
        renotify: false
      });
      notification.onclick = () => {
        window.focus();
        window.location.href = 'admin-orders.html#orders-panel';
        notification.close();
      };
    }

    document.dispatchEvent(new CustomEvent('owlzz:new-order', { detail: order }));
  }

  async function enableOrderAlerts() {
    const button = document.getElementById('enable-alerts-btn');
    if (!button) return;
    button.disabled = true;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioContext = audioContext || new AudioCtx();
        if (audioContext.state === 'suspended') await audioContext.resume();
      }

      let permission = 'unsupported';
      if ('Notification' in window) {
        permission = Notification.permission;
        if (permission === 'default') permission = await Notification.requestPermission();
      }

      if (permission === 'granted') {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
          throw new Error('This browser does not support background push notifications.');
        }

        const { data: sessionData } = await supabaseClient.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        if (!accessToken) throw new Error('Please sign in again.');

        const registration = await navigator.serviceWorker.register('/sw.js');
        const keyResponse = await fetch('/api/push-public-key');
        if (!keyResponse.ok) throw new Error('Could not load push notification configuration.');

        const { publicKey } = await keyResponse.json();
        const applicationServerKey = Uint8Array.from(
          atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')),
          character => character.charCodeAt(0)
        );
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey
          });
        }

        const saved = await fetch('/api/push-subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({ subscription: subscription.toJSON() })
        });
        if (!saved.ok) {
          const result = await saved.json().catch(() => ({}));
          throw new Error(result.error || 'Could not save this device subscription.');
        }
        button.textContent = 'Push notifications enabled';
      } else if (permission === 'denied') {
        button.textContent = 'Browser notifications blocked';
      } else {
        button.textContent = 'Sound enabled · notifications unavailable';
      }
    } catch (error) {
      console.error('Could not enable order alerts:', error);
      button.textContent = 'Try enabling alerts again';
    } finally {
      button.disabled = false;
    }
  }

  function subscribeToNewOrders() {
    if (ordersChannel) {
      supabaseClient.removeChannel(ordersChannel);
      ordersChannel = null;
    }

    const status = document.getElementById('realtime-status');
    ordersChannel = supabaseClient.channel('admin-orders-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
        const order = payload.new;
        if (!order?.id || knownOrderIds.has(order.id)) return;
        knownOrderIds.add(order.id);
        showNewOrderAlert(order);
      })
      .subscribe(state => {
        if (!status) return;
        if (state === 'SUBSCRIBED') {
          status.textContent = 'Live order updates connected';
          status.classList.add('connected');
        } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
          status.textContent = 'Live updates disconnected · refresh or reconnect';
          status.classList.remove('connected');
          console.warn('Orders Realtime channel state:', state);
        }
      });
  }

  function stopOrderNotifications() {
    if (ordersChannel) {
      supabaseClient.removeChannel(ordersChannel);
      ordersChannel = null;
    }
    const status = document.getElementById('realtime-status');
    if (status) {
      status.textContent = 'Live updates disconnected';
      status.classList.remove('connected');
    }
  }

  window.initAdminOrderNotifications = function () {
    if (initialized) {
      subscribeToNewOrders();
      return;
    }
    initialized = true;
    document.getElementById('enable-alerts-btn')?.addEventListener('click', enableOrderAlerts);
    document.getElementById('dismiss-new-order-btn')?.addEventListener('click', () => {
      document.getElementById('new-order-toast')?.classList.remove('show');
    });
    subscribeToNewOrders();
  };

  window.stopAdminOrderNotifications = stopOrderNotifications;
})();
