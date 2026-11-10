const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/customer-notification-preference');

const browserId = '123e4567-e89b-42d3-a456-426614174000';
function response() {
  return {
    headers: {}, statusCode: 0, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('preference API rejects unsupported methods and sets Allow', async () => {
  const res = response();
  await handler({ method: 'DELETE' }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'GET, POST');
});

test('preference API rejects invalid browser UUID and decision values', async () => {
  process.env.SUPABASE_URL = 'https://unit.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  const invalidId = response();
  await handler({ method: 'GET', query: { browser_id: 'not-a-uuid' } }, invalidId);
  assert.equal(invalidId.statusCode, 400);
  const invalidPreference = response();
  await handler({ method: 'POST', body: { browser_id: browserId, preference: 'subscribed', subscription_status: 'subscribed' } }, invalidPreference);
  assert.equal(invalidPreference.statusCode, 400);
});

test('preference API reads through Supabase using server-side service role auth', async () => {
  const oldFetch = global.fetch;
  const oldLog = console.error;
  let request;
  console.error = () => {};
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => [{ preference: 'refused', subscription_status: 'not_attempted', updated_at: '2026-01-01T00:00:00Z' }] };
  };
  const res = response();
  try {
    await handler({ method: 'GET', query: { browser_id: browserId } }, res);
  } finally { global.fetch = oldFetch; console.error = oldLog; }
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.preference.preference, 'refused');
  assert.match(request.url, /customer_notification_preferences/);
  assert.match(request.url, /browser_id=eq\.123e4567-e89b-42d3-a456-426614174000/);
  assert.equal(request.options.headers.apikey, 'test-only');
  assert.equal(request.options.headers.Authorization, 'Bearer test-only');
});

test('preference API upserts decision and subscription status independently', async () => {
  const oldFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    const payload = JSON.parse(options.body);
    return { ok: true, status: 201, json: async () => [payload] };
  };
  const res = response();
  try {
    await handler({ method: 'POST', body: { browser_id: browserId, preference: 'accepted', subscription_status: 'subscribed' } }, res);
  } finally { global.fetch = oldFetch; }
  assert.equal(res.statusCode, 200);
  assert.match(request.url, /on_conflict=browser_id/);
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Prefer, 'resolution=merge-duplicates,return=representation');
  assert.deepEqual(JSON.parse(request.options.body), res.body.preference);
  assert.equal(res.body.preference.preference, 'accepted');
  assert.equal(res.body.preference.subscription_status, 'subscribed');
});
