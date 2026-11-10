'use strict';
(function () {
  const $ = id => document.getElementById(id);
  let token = '';
  const status = (message, ok = false) => { const el = $('campaign-status'); el.textContent = message; el.className = `status-msg show ${ok ? 'ok' : 'err'}`; };
  async function request(payload) {
    const session = (await supabaseClient.auth.getSession()).data.session;
    if (!session) throw new Error('Please sign in again.');
    token = session.access_token;
    const response = await fetch('/api/notifications-admin', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Notification request failed.');
    return result;
  }
  const esc = value => { const span = document.createElement('span'); span.textContent = value || ''; return span.innerHTML; };
  async function load() {
    try {
      const data = await request({ action: 'summary' });
      $('push-subscriber-count').textContent = data.subscriptions;
      $('opening-enabled').checked = !!data.settings.opening_enabled;
      $('closing-enabled').checked = !!data.settings.closing_enabled;
      for (const type of ['opening', 'closing']) {
        const list = $(type + '-templates');
        const templates = data.templates.filter(item => item.type === type);
        list.innerHTML = templates.length ? templates.map(t => `<div class="product-row" data-id="${esc(t.id)}"><div class="p-info"><label>Title <input class="template-title" maxlength="120" value="${esc(t.title)}"></label><label>Message <input class="template-message" maxlength="500" value="${esc(t.message)}"></label></div><label><input type="checkbox" class="template-enabled" ${t.enabled ? 'checked' : ''}> Enabled</label><button type="button" class="btn btn-ghost template-save">Save</button></div>`).join('') : '<p>No messages yet.</p>';
        list.querySelectorAll('.template-save').forEach(button => button.addEventListener('click', async event => {
          const row = event.currentTarget.closest('[data-id]');
          try { await request({ action: 'template', template: { id: row.dataset.id, type, title: row.querySelector('.template-title').value, message: row.querySelector('.template-message').value, enabled: row.querySelector('.template-enabled').checked } }); await load(); }
          catch (error) { alert(error.message); }
        }));
      }
      $('campaign-history').innerHTML = data.campaigns.length ? data.campaigns.map(c => `<div class="product-row"><div class="p-info"><strong>${esc(c.title)}</strong><div class="p-meta">${esc(c.campaign_type)} · ${new Date(c.created_at).toLocaleString()} · ${esc(c.status)}${c.error_details ? ` · ${esc(c.error_details)}` : ''}</div></div><span>${Number(c.success_count || 0)} delivered / ${Number(c.failure_count || 0)} failed${Number(c.log_failure_count || 0) ? ` · ${Number(c.log_failure_count)} logs failed` : ''}</span></div>`).join('') : '<p>No campaigns sent yet.</p>';
    } catch (error) { $('campaign-history').textContent = error.message; }
  }
  $('campaign-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = $('campaign-send'); button.disabled = true; status('Sending…');
    try {
      const destination = $('campaign-url').value.trim();
      if (destination && !destination.startsWith('/') && !/^https:\/\//i.test(destination)) throw new Error('Destination must be a site path or HTTPS URL.');
      const result = await request({ action: 'send', title: $('campaign-title').value, body: $('campaign-body').value, image_url: $('campaign-image').value.trim(), destination_url: destination });
      status(`${result.status}: ${result.successes} delivered, ${result.failures} failed${result.logFailures ? `, ${result.logFailures} log writes failed` : ''}.`, result.status === 'sent'); event.target.reset(); await load();
    } catch (error) { status(error.message); } finally { button.disabled = false; }
  });
  document.querySelectorAll('.template-form').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault(); const fields = new FormData(form);
    try { await request({ action: 'template', template: { type: form.dataset.type, title: fields.get('title'), message: fields.get('message'), enabled: true } }); form.reset(); await load(); }
    catch (error) { alert(error.message); }
  }));
  for (const type of ['opening', 'closing']) $(type + '-enabled').addEventListener('change', async () => {
    try { await request({ action: 'settings', opening_enabled: $('opening-enabled').checked, closing_enabled: $('closing-enabled').checked }); }
    catch (error) { alert(error.message); await load(); }
  });
  window.loadAdminPushCampaigns = load;
})();
