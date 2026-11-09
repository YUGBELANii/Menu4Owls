const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');
module.exports = async function sendNewOrderPush(order) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) throw new Error('Push environment variables are missing.');
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await db.from('admin_push_subscriptions').select('id, subscription');
  if (error) throw error;
  let total = order.total;
  if (total == null && (order.order_id || order.id)) {
    const { data: savedOrder } = await db.from('orders').select('total').eq('id', order.order_id || order.id).maybeSingle();
    total = savedOrder?.total;
  }
  const amountText = total == null ? 'New order received' : `₹${Number(total).toFixed(2)}`;
  const payload = JSON.stringify({ title: 'New Owlz Corner order', body: `Order ${order.order_token || ''} · ${amountText}`, tag: `owlzz-order-${order.order_id || order.id}`, url: '/admin.html' });
  const stale = [];
  await Promise.all((data || []).map(async row => {
    try { await webpush.sendNotification(row.subscription, payload); }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) stale.push(row.id); else console.error('Push delivery failed:', e.statusCode || e.message); }
  }));
  if (stale.length) await db.from('admin_push_subscriptions').delete().in('id', stale);
};
