const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Module = require('node:module');
let mockCreateClient = () => ({ from() { throw new Error('Unexpected database operation'); } });
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '@supabase/supabase-js') return { createClient: (...args) => mockCreateClient(...args) };
  return originalLoad.call(this, request, parent, isMain);
};
const handler = require('../api/admin-content');
Module._load = originalLoad;

const validUuid = '123e4567-e89b-42d3-a456-426614174000';

function response() {
  return {
    headers: {}, statusCode: 0, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function setApiEnvironment(t) {
  const original = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    ADMIN_NOTIFICATION_EMAILS: process.env.ADMIN_NOTIFICATION_EMAILS
  };
  process.env.SUPABASE_URL = 'https://unit.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
  process.env.SUPABASE_ANON_KEY = 'anon-test-key';
  process.env.ADMIN_NOTIFICATION_EMAILS = 'admin@example.test';
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function authFetch(user) {
  return async url => {
    assert.match(String(url), /\/auth\/v1\/user$/);
    return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

test('banner PATCH and DELETE reject absent or malformed UUIDs', async t => {
  setApiEnvironment(t);
  const oldFetch = global.fetch;
  global.fetch = authFetch({ email: 'admin@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' });
  t.after(() => { global.fetch = oldFetch; });

  for (const request of [
    { method: 'PATCH', body: { type: 'banner', title: 'x', content: '' } },
    { method: 'PATCH', body: { type: 'banner', id: 'not-a-uuid', title: 'x', content: '' } },
    { method: 'DELETE', body: { type: 'banner' } },
    { method: 'DELETE', body: { type: 'banner', id: 'not-a-uuid' } }
  ]) {
    const res = response();
    await handler({ ...request, headers: { authorization: 'Bearer valid-session' } }, res);
    assert.equal(res.statusCode, 400, `${request.method} should reject invalid id`);
  }
});

test('admin API rejects missing or unconfirmed Supabase email', async t => {
  setApiEnvironment(t);
  const oldFetch = global.fetch;
  t.after(() => { global.fetch = oldFetch; });

  for (const user of [
    { email: null, email_confirmed_at: null },
    { email: 'admin@example.test', email_confirmed_at: null },
    { email: 'someone@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' }
  ]) {
    global.fetch = authFetch(user);
    const res = response();
    await handler({ method: 'DELETE', headers: { authorization: 'Bearer valid-session' }, body: { type: 'banner', id: validUuid } }, res);
    assert.equal(res.statusCode, 403);
  }
});

test('public banner reader retains visible-only filtering', async t => {
  setApiEnvironment(t);
  let config, selected, visibleFilter;
  mockCreateClient = (url, key, options) => {
    config = { url, key, options };
    const query = {
      select(value) { selected = value; return this; },
      eq(field, value) { if (field === 'visible') visibleFilter = value; return this; },
      order() { return this; },
      then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); }
    };
    return { from(table) { assert.equal(table, 'banners'); return query; } };
  };
  t.after(() => { mockCreateClient = () => ({ from() { throw new Error('Unexpected database operation'); } }); });

  const res = response();
  await handler({ method: 'GET', query: { type: 'banners' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(visibleFilter, true);
  assert.equal(selected, 'id,title,content,image_url,display_order,created_at');
  assert.equal(config.key, 'service-role-test-key');
  assert.deepEqual(config.options, { auth: { persistSession: false } });
});

const indexHtml = fs.readFileSync(require.resolve('../index.html'), 'utf8').replace(/\r\n/g, '\n');
const bannerStart = indexHtml.indexOf('async function loadStorefrontBanners() {');
const bannerEnd = indexHtml.indexOf('\nasync function loadSharedStoreStatus()', bannerStart);
if (bannerStart < 0 || bannerEnd < 0) throw new Error('Could not locate storefront banner loader.');
const bannerLoaderSource = indexHtml.slice(bannerStart, bannerEnd);

function makeBannerLoader(fetchImpl) {
  const host = { removed: false, remove() { this.removed = true; } };
  const context = {
    document: { querySelector: () => host },
    fetch: fetchImpl,
    console: { error() {} },
    Error,
    String
  };
  vm.createContext(context);
  const load = vm.runInContext(`(${bannerLoaderSource})`, context);
  return { host, load };
}

test('successful empty banner response removes the hard-coded fallback', async () => {
  const { host, load } = makeBannerLoader(async () => ({ ok: true, json: async () => ({ banners: [] }) }));
  await load();
  assert.equal(host.removed, true);
});

test('failed banner API keeps the hard-coded fallback', async () => {
  const { host, load } = makeBannerLoader(async () => { throw new Error('offline'); });
  await load();
  assert.equal(host.removed, false);
});
