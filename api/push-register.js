const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Push is not configured.' });
  const { subscription } = req.body || {};
  if (!subscription?.endpoint || subscription.endpoint.length > 2048 || !/^https:\/\//i.test(subscription.endpoint) || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return res.status(400).json({ error: 'Invalid subscription.' });
  try {
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { error } = await db.from('push_subscriptions').upsert({ endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, active: true, updated_at: new Date().toISOString() }, { onConflict: 'endpoint' });
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (error) { console.error('Subscription registration failed:', error.message); return res.status(500).json({ error: 'Could not save subscription.' }); }
};
