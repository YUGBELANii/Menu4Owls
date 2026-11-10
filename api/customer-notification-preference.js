const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['subscribed', 'unavailable', 'denied', 'failed', 'not_attempted']);

function configuration(res) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Customer notification preferences are not configured:', {
      hasSupabaseUrl: Boolean(SUPABASE_URL),
      hasServiceRoleKey: Boolean(SUPABASE_SERVICE_ROLE_KEY)
    });
    res.status(500).json({ error: 'Notification preferences are not configured.' });
    return null;
  }
  return { url: SUPABASE_URL.replace(/\/+$/, ''), key: SUPABASE_SERVICE_ROLE_KEY };
}

async function readPreference(url, key, browserId) {
  const query = new URLSearchParams({
    browser_id: `eq.${browserId}`,
    select: 'preference,subscription_status,updated_at',
    limit: '1'
  });
  const response = await fetch(`${url}/rest/v1/customer_notification_preferences?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: 'no-store'
  });
  const rows = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(rows?.message || 'Preference lookup failed.'), { status: response.status });
  return rows?.[0] || null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const config = configuration(res);
  if (!config) return;
  const input = req.method === 'GET' ? req.query || {} : req.body || {};
  const browserId = input.browser_id;
  if (typeof browserId !== 'string' || !UUID_V4.test(browserId)) {
    return res.status(400).json({ error: 'A valid browser ID is required.' });
  }

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ preference: await readPreference(config.url, config.key, browserId) });
    }

    const { preference, subscription_status: subscriptionStatus } = input;
    if (!['accepted', 'refused'].includes(preference) || !STATUSES.has(subscriptionStatus)) {
      return res.status(400).json({ error: 'Invalid notification preference.' });
    }

    const response = await fetch(`${config.url}/rest/v1/customer_notification_preferences?on_conflict=browser_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify({
        browser_id: browserId,
        preference,
        subscription_status: subscriptionStatus,
        updated_at: new Date().toISOString()
      })
    });
    const rows = await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(new Error(rows?.message || 'Preference save failed.'), { status: response.status });
    return res.status(200).json({ preference: rows?.[0] || { browser_id: browserId, preference, subscription_status: subscriptionStatus } });
  } catch (error) {
    console.error('Customer notification preference request failed:', {
      method: req.method,
      status: error.status,
      message: String(error.message || error).slice(0, 400)
    });
    return res.status(502).json({ error: 'Could not save or load your notification preference.' });
  }
};
