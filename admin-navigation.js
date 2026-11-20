'use strict';
(function () {
  const view = document.getElementById('admin-view');
  if (!view) return;
  view.classList.add('admin-workspace');
  document.querySelector('.admin-nav')?.remove();
  const links = [
    ['admin.html', '⌂', 'Overview', 'home'],
    ['admin-orders.html', '▤', 'Orders', 'orders'],
    ['admin-products.html', '◈', 'Products', 'products'],
    ['admin-products.html#categories', '▦', 'Category management', 'categories'],
    ['admin-notifications.html', '◉', 'Notifications', 'notifications'],
    ['admin-promotions.html', '▧', 'Banners & promotions', 'banners'],
    ['admin-store-status.html', '◷', 'Store status', 'store'],
    ['admin-finance.html', '₹', 'Finance dashboard', 'finance'],
    ['admin-orders.html#analytics', '⌁', 'Order analytics', 'analytics']
  ];
  const page = location.pathname.split('/').pop();
  const hash = location.hash.slice(1);
  const active = page === 'admin-orders.html' ? 'orders'
    : page === 'admin-notifications.html' ? 'notifications'
    : page === 'admin-products.html' ? (hash === 'categories' ? 'categories' : 'products')
      : page === 'admin.html' ? 'home'
        : page === 'admin-promotions.html' ? 'banners'
          : page === 'admin-store-status.html' ? 'store'
            : page === 'admin-finance.html' ? 'finance'
              : hash === 'analytics' ? 'analytics' : 'home';
  const aside = document.createElement('aside');
  aside.className = 'admin-sidebar';
  aside.innerHTML = `<div class="admin-sidebar-brand"><a class="admin-sidebar-brand-link" href="index.html" aria-label="Owlz Corner storefront"><span class="admin-brand-mark">O</span><span>Owlz Corner<small>Business manager</small></span></a><button type="button" class="admin-sidebar-collapse" aria-label="Collapse sidebar" aria-pressed="false" title="Collapse sidebar"><span class="collapse-glyph" aria-hidden="true">‹</span></button></div>
    <button type="button" class="admin-sidebar-toggle" aria-expanded="false" aria-controls="admin-sidebar-links">☰ <span>Navigation</span></button>
    <nav id="admin-sidebar-links" aria-label="Admin sections">${links.map(([href, icon, label, key]) => `<a href="${href}" title="${label}" class="admin-sidebar-link ${active === key ? 'active' : ''}" ${active === key ? 'aria-current="page"' : ''}><span class="admin-sidebar-icon" aria-hidden="true">${icon}</span><span>${label}</span></a>`).join('')}</nav>
    <a class="admin-sidebar-storefront" href="index.html">↗ View storefront</a>`;
  view.prepend(aside);
  const collapseButton = aside.querySelector('.admin-sidebar-collapse');
  try {
    if (localStorage.getItem('owlz-admin-sidebar-collapsed') === 'true') {
      view.classList.add('sidebar-collapsed');
      collapseButton.setAttribute('aria-pressed', 'true');
      collapseButton.setAttribute('aria-label', 'Expand sidebar');
      collapseButton.title = 'Expand sidebar';
    }
  } catch (_) {}
  collapseButton.addEventListener('click', () => {
    const collapsed = view.classList.toggle('sidebar-collapsed');
    collapseButton.setAttribute('aria-pressed', String(collapsed));
    collapseButton.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    collapseButton.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    try { localStorage.setItem('owlz-admin-sidebar-collapsed', String(collapsed)); } catch (_) {}
  });

  const toggle = aside.querySelector('.admin-sidebar-toggle');
  toggle.addEventListener('click', () => {
    const opened = aside.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(opened));
  });
  aside.querySelectorAll('nav a').forEach(link => link.addEventListener('click', () => aside.classList.remove('open')));

  function makeDisclosure(section, openByDefault) {
    if (!section || section.dataset.disclosureReady === 'true') return;
    const heading = section.querySelector(':scope > h2, :scope > h3');
    if (!heading) return;
    const details = document.createElement('details');
    for (const attribute of [...section.attributes]) details.setAttribute(attribute.name, attribute.value);
    details.classList.add('admin-disclosure');
    const hashTargetsSection = details.id && location.hash === `#${details.id}`;
    details.open = Boolean(openByDefault || hashTargetsSection);
    const summary = document.createElement('summary');
    summary.append(heading);
    const content = document.createElement('div');
    content.className = 'admin-disclosure-content';
    while (section.firstChild) content.append(section.firstChild);
    details.append(summary, content);
    section.replaceWith(details);
    if (hashTargetsSection) requestAnimationFrame(() => details.scrollIntoView({ block: 'start' }));
  }

  if (page === 'admin-products.html') {
    makeDisclosure(view.querySelector('#categories'), false);
  } else if (page === 'admin-orders.html') {
    makeDisclosure(view.querySelector('#analytics'), false);
    makeDisclosure(view.querySelector('#create-order'), true);
  } else if (page === 'admin-notifications.html') {
    makeDisclosure(view.querySelector('.notification-settings'), false);
    makeDisclosure(view.querySelector('#opening-templates')?.closest('.panel'), false);
    makeDisclosure(view.querySelector('#closing-templates')?.closest('.panel'), false);
    makeDisclosure(view.querySelector('#campaign-history')?.closest('.panel'), false);
  }
})();
