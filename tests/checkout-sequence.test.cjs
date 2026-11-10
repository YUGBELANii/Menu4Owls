const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(require.resolve('../index.html'), 'utf8').replace(/\r\n/g, '\n');
const start = html.indexOf('async function checkoutWhatsapp() {');
const end = html.indexOf('\n}\n\n\n/* =========================================================\n   SEARCH', start);
if (start < 0 || end < 0) throw new Error('Could not locate the production checkout entry point.');
const checkoutSource = html.slice(start, end + 2);
const customerPushSource = fs.readFileSync(require.resolve('../customer-push.js'), 'utf8');

function makeBrowser(options = {}) {
  const events = [];
  const alerts = [];
  const local = new Map(Object.entries(options.localStorage || {}));
  const serverPreference = { value: options.serverPreference || null };
  const listeners = new Map();
  const addListener = (target, type, fn) => {
    const key = `${target}:${type}`;
    listeners.set(key, [...(listeners.get(key) || []), fn]);
  };
  const dispatch = (target, type, event = {}) => {
    for (const fn of listeners.get(`${target}:${type}`) || []) fn(event);
  };
  const dialog = {
    open: false,
    returnValue: '',
    showModal() { this.open = true; events.push('popup-visible'); },
    close(value) {
      this.open = false;
      this.returnValue = value;
      queueMicrotask(() => dispatch('dialog', 'close'));
    },
    addEventListener(type, fn) { addListener('dialog', type, fn); }
  };
  const button = name => ({
    disabled: false,
    textContent: name === 'checkout' ? 'Order on WhatsApp' : name,
    addEventListener(type, fn) { addListener(name, type, fn); },
    focus() {}
  });
  const nodes = {
    'push-opt-in': dialog,
    'push-opt-in-accept': button('accept'),
    'push-opt-in-refuse': button('refuse'),
    'policy-accepted': { checked: true, focus() {} },
    'checkout-whatsapp': button('checkout')
  };
  const permission = options.permission || 'default';
  const notification = {
    permission,
    requestPermission() {
      events.push('permission-request');
      if (options.permissionError) return Promise.reject(new Error('permission failed'));
      this.permission = options.permissionResult || 'granted';
      return Promise.resolve(this.permission);
    }
  };
  let orderCalls = 0;
  let pushCalls = 0;
  let navigation = null;
  const fetch = async (url, request = {}) => {
    const method = request.method || 'GET';
    if (url.startsWith('/api/customer-notification-preference')) {
      if (method === 'GET') {
        events.push('preference-read');
        return { ok: true, status: 200, json: async () => ({ preference: serverPreference.value }) };
      }
      const payload = JSON.parse(request.body);
      events.push(`preference-save:${payload.preference}:${payload.subscription_status}`);
      if (options.preferenceFailure) {
        events.push('preference-save-failed');
        return { ok: false, status: 503, json: async () => ({}) };
      }
      serverPreference.value = payload;
      events.push(`preference-save-done:${payload.preference}`);
      return { ok: true, status: 200, json: async () => ({ preference: payload }) };
    }
    if (url === '/api/push-public-key') {
      events.push('push-key');
      return { ok: true, status: 200, json: async () => ({ publicKey: 'AQID' }) };
    }
    if (url === '/api/push-register') {
      pushCalls++;
      events.push('push-register');
      return { ok: !options.subscriptionFailure, status: options.subscriptionFailure ? 500 : 200, json: async () => ({}) };
    }
    if (url === '/api/create-order') {
      orderCalls++;
      events.push('order-api');
      return {
        ok: options.orderFailure !== true,
        status: options.orderFailure ? 502 : 200,
        json: async () => options.orderFailure
          ? { error: 'Order service failed.' }
          : { order_id: 'test-order-id', token: 'TEST42', status: 'pending' }
      };
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };
  const cart = [{ id: '123e4567-e89b-42d3-a456-426614174001', name: 'Coffee', qty: 1, price: 50 }];
  const context = {
    console: { warn: (...args) => events.push(`warn:${args[0]}`), error: (...args) => events.push(`error:${args[0]}`), debug() {} },
    document: { getElementById: id => nodes[id] || null },
    window: {
      isSecureContext: !options.unsupported,
      Notification: notification,
      PushManager: {},
      location: { set href(value) { navigation = value; events.push('whatsapp-navigation'); }, get href() { return 'http://localhost/'; } }
    },
    Notification: notification,
    PushManager: {},
    navigator: {
      serviceWorker: {
        register: async () => {
          events.push('service-worker-register');
          return { pushManager: {
            getSubscription: async () => null,
            subscribe: async () => {
              events.push('push-subscribe');
              if (options.subscriptionFailure) throw new Error('subscription failed');
              return { toJSON: () => ({ endpoint: 'https://push.example/subscription', keys: { p256dh: 'p', auth: 'a' } }) };
            }
          } };
        }
      }
    },
    localStorage: {
      getItem: key => local.has(key) ? local.get(key) : null,
      setItem: (key, value) => local.set(key, String(value))
    },
    sessionStorage: { getItem: () => null, setItem() {} },
    crypto: {
      randomUUID: () => '123e4567-e89b-42d3-a456-426614174000',
      getRandomValues: bytes => { bytes.fill(7); bytes[6] = 0x47; bytes[8] = 0x87; return bytes; }
    },
    Intl: { DateTimeFormat: class { format() { return '18'; } } },
    Date,
    URLSearchParams,
    Uint8Array,
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    setTimeout,
    clearTimeout,
    queueMicrotask,
    fetch,
    alert: message => alerts.push(message),
    trackVercelEvent() {},
    cart,
    DELIVERY_CHARGE: 20,
    rewardRevealed: false,
    mysteryReward: null,
    encodeURIComponent,
    JSON,
    Map
  };
  vm.createContext(context);
  vm.runInContext(customerPushSource, context, { filename: 'customer-push.js' });
  vm.runInContext(`let owlzzCheckoutAttemptInProgress = false;\n${checkoutSource}\nglobalThis.runCheckout = checkoutWhatsapp;`, context, { filename: 'index.html#checkoutWhatsapp' });

  return {
    events, alerts, local, cart, dialog, navigation: () => navigation,
    orderCalls: () => orderCalls,
    pushCalls: () => pushCalls,
    checkout: () => context.runCheckout(),
    clickAccept: () => dispatch('accept', 'click'),
    clickRefuse: () => dispatch('refuse', 'click'),
    pressEscape: () => dispatch('dialog', 'cancel', { preventDefault() {} })
  };
}

async function waitForDialog(browser) {
  for (let i = 0; i < 40 && !browser.dialog.open; i++) {
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  assert.equal(browser.dialog.open, true, 'notification popup should be visible');
}

test('1. First checkout waits in the visible popup without order request or WhatsApp navigation', async () => {
  const browser = makeBrowser();
  const done = browser.checkout();
  await waitForDialog(browser);
  assert.equal(browser.orderCalls(), 0);
  assert.equal(browser.navigation(), null);
  assert.equal(browser.events.includes('whatsapp-navigation'), false);
  browser.clickRefuse();
  await done;
});

test('2. Accept saves decision, requests permission, attempts subscription, then orders and opens WhatsApp', async () => {
  const browser = makeBrowser();
  const done = browser.checkout();
  await waitForDialog(browser);
  assert.equal(browser.orderCalls(), 0);
  browser.clickAccept();
  await done;
  const order = browser.events.indexOf('order-api');
  assert.ok(browser.events.indexOf('preference-save:accepted:not_attempted') < browser.events.indexOf('permission-request'));
  assert.ok(browser.events.indexOf('permission-request') < browser.events.indexOf('push-subscribe'));
  assert.ok(browser.events.indexOf('preference-save-done:accepted') < browser.events.indexOf('order-api'));
  assert.ok(browser.events.indexOf('push-register') < order);
  assert.equal(browser.orderCalls(), 1);
  assert.equal(browser.navigation()?.startsWith('https://wa.me/'), true);
  assert.equal(browser.local.get('owlzz_customer_push_choice_v1'), 'accepted');
  assert.equal(browser.local.get('owlzz_customer_push_subscription_status_v1'), 'subscribed');
});

test('3. Refuse saves refusal and orders without permission or push requests', async () => {
  const browser = makeBrowser();
  const done = browser.checkout();
  await waitForDialog(browser);
  browser.clickRefuse();
  await done;
  assert.ok(browser.events.indexOf('preference-save:refused:not_attempted') < browser.events.indexOf('order-api'));
  assert.ok(browser.events.indexOf('preference-save-done:refused') < browser.events.indexOf('order-api'));
  assert.equal(browser.events.includes('permission-request'), false);
  assert.equal(browser.pushCalls(), 0);
  assert.equal(browser.orderCalls(), 1);
  assert.equal(browser.navigation()?.startsWith('https://wa.me/'), true);
});

test('4. Escape dismisses as refusal, saves it, then orders once', async () => {
  const browser = makeBrowser();
  const done = browser.checkout();
  await waitForDialog(browser);
  browser.pressEscape();
  await done;
  assert.ok(browser.events.indexOf('preference-save:refused:not_attempted') < browser.events.indexOf('order-api'));
  assert.equal(browser.events.includes('permission-request'), false);
  assert.equal(browser.orderCalls(), 1);
});

test('5. Returning accepted customer skips popup and checks out once', async () => {
  const browser = makeBrowser({ localStorage: {
    owlzz_customer_notification_browser_id_v1: '123e4567-e89b-42d3-a456-426614174000',
    owlzz_customer_push_choice_v1: 'accepted',
    owlzz_customer_push_subscription_status_v1: 'subscribed'
  } });
  await browser.checkout();
  assert.equal(browser.dialog.open, false);
  assert.equal(browser.orderCalls(), 1);
  assert.equal(browser.navigation()?.startsWith('https://wa.me/'), true);
});

test('6. Returning refused customer skips popup and checks out once', async () => {
  const browser = makeBrowser({ localStorage: {
    owlzz_customer_notification_browser_id_v1: '123e4567-e89b-42d3-a456-426614174000',
    owlzz_customer_push_choice_v1: 'refused',
    owlzz_customer_push_subscription_status_v1: 'not_attempted'
  } });
  await browser.checkout();
  assert.equal(browser.dialog.open, false);
  assert.equal(browser.orderCalls(), 1);
  assert.equal(browser.events.includes('permission-request'), false);
});

test('7. Preference save failure keeps local refusal and does not block one order', async () => {
  const browser = makeBrowser({ preferenceFailure: true });
  const done = browser.checkout();
  await waitForDialog(browser);
  browser.clickRefuse();
  await done;
  assert.equal(browser.local.get('owlzz_customer_push_choice_v1'), 'refused');
  assert.equal(browser.orderCalls(), 1);
  assert.equal(browser.navigation()?.startsWith('https://wa.me/'), true);
});

test('8. Subscription failure is recorded separately and does not block one order', async () => {
  const browser = makeBrowser({ subscriptionFailure: true });
  const done = browser.checkout();
  await waitForDialog(browser);
  browser.clickAccept();
  await done;
  assert.equal(browser.local.get('owlzz_customer_push_choice_v1'), 'accepted');
  assert.equal(browser.local.get('owlzz_customer_push_subscription_status_v1'), 'failed');
  assert.equal(browser.orderCalls(), 1);
  assert.equal(browser.navigation()?.startsWith('https://wa.me/'), true);
});

test('9. Double-click while popup is open produces one decision and one order request', async () => {
  const browser = makeBrowser();
  const done = browser.checkout();
  await waitForDialog(browser);
  await browser.checkout();
  assert.equal(browser.orderCalls(), 0);
  browser.clickRefuse();
  await done;
  assert.equal(browser.orderCalls(), 1);
});

test('10. Order API failure shows an error, preserves cart, and does not navigate', async () => {
  const browser = makeBrowser({
    orderFailure: true,
    localStorage: {
      owlzz_customer_notification_browser_id_v1: '123e4567-e89b-42d3-a456-426614174000',
      owlzz_customer_push_choice_v1: 'refused',
      owlzz_customer_push_subscription_status_v1: 'not_attempted'
    }
  });
  const before = JSON.stringify(browser.cart);
  await browser.checkout();
  assert.equal(browser.orderCalls(), 1);
  assert.ok(browser.alerts.includes('Order service failed.'));
  assert.equal(JSON.stringify(browser.cart), before);
  assert.equal(browser.navigation(), null);
});

test('Server-saved returning refusal is cached and skips the popup', async () => {
  const browser = makeBrowser({ serverPreference: { preference: 'refused', subscription_status: 'not_attempted' } });
  await browser.checkout();
  assert.equal(browser.dialog.open, false);
  assert.equal(browser.local.get('owlzz_customer_push_choice_v1'), 'refused');
  assert.equal(browser.orderCalls(), 1);
  assert.equal(browser.events.includes('permission-request'), false);
});

test('Native dialog dismissal without an explicit button is saved as refusal', async () => {
  const browser = makeBrowser();
  const done = browser.checkout();
  await waitForDialog(browser);
  browser.dialog.close('');
  await done;
  assert.equal(browser.local.get('owlzz_customer_push_choice_v1'), 'refused');
  assert.ok(browser.events.indexOf('preference-save-done:refused') < browser.events.indexOf('order-api'));
  assert.equal(browser.orderCalls(), 1);
  assert.equal(browser.events.includes('permission-request'), false);
});

test('Browser permission denial records denied subscription status and still checks out', async () => {
  const browser = makeBrowser({ permission: 'denied' });
  const done = browser.checkout();
  await waitForDialog(browser);
  browser.clickAccept();
  await done;
  assert.equal(browser.local.get('owlzz_customer_push_choice_v1'), 'accepted');
  assert.equal(browser.local.get('owlzz_customer_push_subscription_status_v1'), 'denied');
  assert.equal(browser.events.includes('permission-request'), false);
  assert.equal(browser.pushCalls(), 0);
  assert.equal(browser.orderCalls(), 1);
});

test('Unsupported browser records unavailable status and still checks out', async () => {
  const browser = makeBrowser({ unsupported: true });
  const done = browser.checkout();
  await waitForDialog(browser);
  browser.clickAccept();
  await done;
  assert.equal(browser.local.get('owlzz_customer_push_choice_v1'), 'accepted');
  assert.equal(browser.local.get('owlzz_customer_push_subscription_status_v1'), 'unavailable');
  assert.equal(browser.events.includes('permission-request'), false);
  assert.equal(browser.pushCalls(), 0);
  assert.equal(browser.orderCalls(), 1);
});
