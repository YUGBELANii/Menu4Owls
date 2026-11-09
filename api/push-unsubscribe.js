const { createClient } = require('@supabase/supabase-js');
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== 'string' || endpoint.length > 2048 || !/^https:\/\//i.test(endpoint)) return res.status(400).json({ error: 'Invalid endpoint.' });
  try {
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { error } = await db.from('push_subscriptions').update({ active: false, updated_at: new Date().toISOString() }).eq('endpoint', endpoint);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (error) { console.error('Unsubscribe failed:', error.message); return res.status(500).json({ error: 'Could not unsubscribe.' }); }
};
