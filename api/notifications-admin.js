const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

function validateContent(body) {
  const title = String(body.title || '').trim();
  const text = String(body.body || '').trim();
  if (!title || title.length > 120 || !text || text.length > 500) throw new Error('Title (1–120 characters) and body (1–500 characters) are required.');
  for (const field of ['image_url', 'destination_url']) {
    const value = body[field];
    if (!value) continue;
    if (typeof value !== 'string' || value.length > 2048) throw new Error(`${field} must be a valid HTTPS URL.`);
    if (field === 'destination_url' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')) continue;
    let parsed;
    try { parsed = new URL(value); }
    catch (_) { throw new Error(`${field} must be a valid HTTPS URL.`); }
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (parsed.protocol !== 'https:' || !hostname || parsed.username || parsed.password || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
      throw new Error(`${field} must be a publicly accessible HTTPS URL.`);
    }
  }
  return { title, body: text, image_url: body.image_url || null, destination_url: body.destination_url || '/' };
}

async function authorize(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || !process.env.SUPABASE_ANON_KEY || !process.env.ADMIN_NOTIFICATION_EMAILS) return false;
  const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/user`, { headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!response.ok) return false;
  const user = await response.json();
  const allowed = process.env.ADMIN_NOTIFICATION_EMAILS.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return !!user.email && allowed.includes(user.email.toLowerCase());
}

async function deliver(db, campaign) {
  const { data: subscriptions, error } = await db.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('active', true);
  if (error) throw error;
  const payload = JSON.stringify({ title: campaign.title, body: campaign.body, image: campaign.image_url, url: campaign.destination_url, tag: `owlzz-campaign-${campaign.id}` });
  const attempts = subscriptions || [];
  let successes = 0, failures = 0, logFailures = 0;
  await Promise.all(attempts.map(async sub => {
    let status = 'sent', details = null;
    try { await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload); successes++; }
    catch (error) {
      status = 'failed';
      details = String(error.statusCode || error.message).slice(0, 500);
      failures++;
      if (error.statusCode === 404 || error.statusCode === 410) {
        try {
          const { error: deactivateError } = await db.from('push_subscriptions').update({ active: false, updated_at: new Date().toISOString() }).eq('id', sub.id);
          if (deactivateError) throw deactivateError;
        } catch (deactivateError) {
          details = `${details}; subscription deactivation failed: ${deactivateError.message}`.slice(0, 500);
        }
      }
    }
    try {
      const { error: logError } = await db.from('notification_logs').insert({ campaign_id: campaign.id, subscription_id: sub.id, delivery_status: status, error_details: details });
      if (logError) throw logError;
    } catch (logError) {
      logFailures++;
      console.error('Notification delivery log failed:', { campaignId: campaign.id, subscriptionId: sub.id, message: logError.message });
    }
  }));
  const finalStatus = attempts.length === 0 ? 'no_subscriptions' : failures === 0 && logFailures === 0 ? 'sent' : successes > 0 ? 'partial' : 'failed';
  const counts = {
    status: finalStatus,
    sent_at: new Date().toISOString(),
    success_count: successes,
    failure_count: failures,
    log_failure_count: logFailures,
    error_details: logFailures ? `${logFailures} delivery log write(s) failed.` : null
  };
  Object.assign(campaign, counts);
  const { error: updateError } = await db.from('notification_campaigns').update(counts).eq('id', campaign.id);
  if (updateError) throw updateError;
  return { successes, failures, logFailures, status: finalStatus };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const automatic = req.headers['x-owlzz-cron-secret'] && process.env.NOTIFICATION_CRON_SECRET && req.headers['x-owlzz-cron-secret'] === process.env.NOTIFICATION_CRON_SECRET;
  if (!automatic && !(await authorize(req))) return res.status(403).json({ error: 'Authorized administrator required.' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Notification service is not configured.' });
  if ((automatic || req.body?.action === 'send') && (!process.env.VAPID_SUBJECT || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY)) return res.status(500).json({ error: 'Push delivery is not configured.' });
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  let campaign = null;
  try {
    if (automatic) {
      const kind = req.body?.type;
      if (!['opening', 'closing'].includes(kind)) return res.status(400).json({ error: 'Invalid automatic campaign type.' });
      const { data, error } = await db.rpc('claim_automatic_notification', { p_type: kind });
      if (error) throw error;
      if (!data?.id) return res.status(200).json({ skipped: true, reason: data?.reason || 'not-eligible' });
      campaign = data;
    } else {
      const action = req.body?.action;
      if (action === 'summary') {
        const [{ count: subscriptions }, { data: campaigns }] = await Promise.all([
          db.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('active', true),
          db.from('notification_campaigns').select('id,campaign_type,title,body,status,created_at,success_count,failure_count,log_failure_count,error_details').order('created_at', { ascending: false }).limit(50)
        ]);
        const { data: templates } = await db.from('notification_templates').select('*').order('created_at');
        const { data: settings } = await db.from('notification_settings').select('*').eq('id', 1).maybeSingle();
        return res.status(200).json({ subscriptions: subscriptions || 0, campaigns: campaigns || [], templates: templates || [], settings: settings || { opening_enabled: true, closing_enabled: true } });
      }
      if (action === 'template') {
        const t = req.body.template || {};
        if (!['opening', 'closing'].includes(t.type) || !String(t.message || '').trim() || String(t.message).length > 500 || !String(t.title || '').trim() || String(t.title).length > 120) return res.status(400).json({ error: 'Invalid template.' });
        const patch = { type: t.type, title: t.title.trim(), message: t.message.trim(), enabled: t.enabled !== false };
        const result = t.id ? await db.from('notification_templates').update(patch).eq('id', t.id) : await db.from('notification_templates').insert(patch);
        if (result.error) throw result.error;
        return res.status(200).json({ ok: true });
      }
      if (action === 'settings') {
        const { error } = await db.from('notification_settings').upsert({ id: 1, opening_enabled: !!req.body.opening_enabled, closing_enabled: !!req.body.closing_enabled, updated_at: new Date().toISOString() });
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }
      if (action !== 'send') return res.status(400).json({ error: 'Invalid action.' });
      const content = validateContent(req.body);
      const { data, error } = await db.from('notification_campaigns').insert({ ...content, campaign_type: 'manual', status: 'sending' }).select('*').single();
      if (error) throw error;
      campaign = data;
    }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const result = await deliver(db, campaign);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('Notification request failed:', error.message);
    if (campaign?.id) {
      try {
        const { error: finalizeError } = await db.from('notification_campaigns').update({
          status: 'failed',
          sent_at: new Date().toISOString(),
          success_count: campaign.success_count || 0,
          failure_count: campaign.failure_count || 0,
          log_failure_count: campaign.log_failure_count || 0,
          error_details: String(error.message || 'Notification processing failed.').slice(0, 1000)
        }).eq('id', campaign.id);
        if (finalizeError) throw finalizeError;
      } catch (finalizeError) {
        console.error('Could not finalize failed campaign:', { campaignId: campaign.id, message: finalizeError.message });
      }
    }
    return res.status(500).json({ error: error.message || 'Notification request failed.' });
  }
};
