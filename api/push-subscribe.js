const { createClient } = require('@supabase/supabase-js');
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server is not configured.' });
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Sign in required.' });
  try {
    const verify = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    if (!verify.ok) return res.status(401).json({ error: 'Invalid session.' });
    const user = await verify.json();
    const { subscription } = req.body || {};
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return res.status(400).json({ error: 'Invalid push subscription.' });
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { error } = await db.from('admin_push_subscriptions').upsert({ user_id: user.id, endpoint: subscription.endpoint, subscription }, { onConflict: 'endpoint' });
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (e) { console.error('Push subscription failed:', e.message); return res.status(500).json({ error: 'Could not save notification subscription.' }); }
};
