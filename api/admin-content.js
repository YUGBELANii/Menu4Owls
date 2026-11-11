const { createClient } = require('@supabase/supabase-js');

async function isAdmin(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || !process.env.ADMIN_NOTIFICATION_EMAILS) return false;
  const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_ANON_KEY || '', Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return false;
  const user = await response.json();
  const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
  if (!email || !user.email_confirmed_at) return false;
  return process.env.ADMIN_NOTIFICATION_EMAILS.split(',').some(x => x.trim().toLowerCase() === email);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET','POST','PATCH','DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Admin content service is not configured.' });
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  try {
    if (req.method === 'GET') {
      if (req.query?.type === 'settings') {
        if (!(await isAdmin(req))) return res.status(403).json({ error: 'Authorized administrator required.' });
        const { data, error } = await db.from('store_settings').select('*').eq('id', 1).single();
        if (error) throw error;
        return res.status(200).json({ settings: data });
      }
      if (req.query?.type === 'manage-banners') {
        if (!(await isAdmin(req))) return res.status(403).json({ error: 'Authorized administrator required.' });
        const { data, error } = await db.from('banners').select('*').order('display_order').order('created_at');
        if (error) throw error;
        return res.status(200).json({ banners: data || [] });
      }
      if (req.query?.type === 'banners') {
        const { data, error } = await db.from('banners').select('id,title,content,image_url,display_order,created_at').eq('visible', true).order('display_order').order('created_at');
        if (error) throw error;
        return res.status(200).json({ banners: data || [] });
      }
      const { data, error } = await db.rpc('get_store_status');
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (!(await isAdmin(req))) return res.status(403).json({ error: 'Authorized administrator required.' });
    const body = req.body || {};
    if (body.type === 'settings') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST for settings.' });
      const allowed = ['schedule','override'];
      const modes = ['open','closed','late','closed_today'];
      const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (!allowed.includes(body.operating_mode) || !timePattern.test(body.opening_time || '') || !timePattern.test(body.closing_time || '') || (body.operating_mode === 'override' && !modes.includes(body.override_mode))) return res.status(400).json({ error: 'Invalid store settings.' });
      if (body.opening_time === body.closing_time) return res.status(400).json({ error: 'Opening and closing times must be different.' });
      for (const field of ['override_start','override_end','expires_at']) if (body[field] && !Number.isFinite(Date.parse(body[field]))) return res.status(400).json({ error: `${field} must be a valid timestamp.` });
      if (body.override_start && body.override_end && Date.parse(body.override_end) <= Date.parse(body.override_start)) return res.status(400).json({ error: 'Override end must be after its start.' });
      if (body.operating_mode === 'override' && body.override_mode === 'late' && (!body.override_start || !body.override_end)) return res.status(400).json({ error: 'Late opening needs a start time and an end time for the delayed opening.' });
      if (body.operating_mode === 'override') {
        const expiry = Date.parse(body.expires_at || '');
        const now = Date.now();
        if (!Number.isFinite(expiry) || expiry <= now) return res.status(400).json({ error: 'Every temporary override needs a future expiry time.' });
        if (expiry > now + 30 * 24 * 60 * 60 * 1000) return res.status(400).json({ error: 'Temporary overrides can be set for at most 30 days.' });
        if ((body.override_start && Date.parse(body.override_start) >= expiry) || (body.override_end && Date.parse(body.override_end) > expiry)) return res.status(400).json({ error: 'Override start and end must fall before its expiry.' });
      }
      const messages = {};
      for (const [field, label] of [['open_message','Open'],['closed_message','Closed'],['late_message','Late-opening']]) {
        const value = String(body[field] || '').trim();
        if (!value || value.length > 250) return res.status(400).json({ error: `${label} message is required and must be at most 250 characters.` });
        messages[field] = value;
      }
      const patch = { id: 1, operating_mode: body.operating_mode, opening_time: body.opening_time, closing_time: body.closing_time,
        override_mode: body.operating_mode === 'override' ? body.override_mode : null,
        override_start: body.override_start || null, override_end: body.override_end || null, expires_at: body.expires_at || null,
        ...messages, updated_at: new Date().toISOString() };
      const { error } = await db.from('store_settings').upsert(patch);
      if (error) throw error;
      const result = await db.rpc('get_store_status');
      if (result.error) throw result.error;
      return res.status(200).json(result.data);
    }
    if (body.type !== 'banner') return res.status(400).json({ error: 'Invalid content type.' });
    if (req.method === 'POST' || req.method === 'PATCH') {
      if (req.method === 'PATCH' && (typeof body.id !== 'string' || !UUID_PATTERN.test(body.id))) {
        return res.status(400).json({ error: 'A valid banner UUID is required.' });
      }
      const title = String(body.title || '').trim(), content = String(body.content || '').trim();
      if (!title || title.length > 120 || content.length > 1000) return res.status(400).json({ error: 'Title is required (up to 120 characters); content must be at most 1000 characters.' });
      if (body.image_url) {
        let image;
        try { image = new URL(body.image_url); } catch (_) { return res.status(400).json({ error: 'Image URL must be a valid HTTPS URL.' }); }
        if (image.protocol !== 'https:' || image.username || image.password || image.hostname === 'localhost' || image.hostname.endsWith('.local')) return res.status(400).json({ error: 'Image URL must be a public HTTPS URL.' });
      }
      const patch = { title, content, image_url: body.image_url || null, display_order: Math.max(-10000, Math.min(10000, Number(body.display_order) || 0)), visible: body.visible !== false, updated_at: new Date().toISOString() };
      const query = req.method === 'POST' ? db.from('banners').insert(patch) : db.from('banners').update(patch).eq('id', body.id);
      const { data, error } = await query.select().single();
      if (error) throw error;
      return res.status(200).json({ banner: data });
    }
    if (req.method === 'DELETE') {
      if (typeof body.id !== 'string' || !UUID_PATTERN.test(body.id)) return res.status(400).json({ error: 'A valid banner UUID is required.' });
      const { error } = await db.from('banners').delete().eq('id', body.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Unsupported method.' });
  } catch (error) {
    console.error('Admin content request failed:', String(error?.message || error).slice(0,400));
    return res.status(500).json({ error: 'Could not load or save shared content.' });
  }
};
