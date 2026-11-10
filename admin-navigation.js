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
  aside.innerHTML = `<a class="admin-sidebar-brand" href="admin.html"><span class="admin-brand-mark">O</span><span>Owlz Corner<small>Business manager</small></span></a>
    <button type="button" class="admin-sidebar-toggle" aria-expanded="false" aria-controls="admin-sidebar-links">☰ <span>Navigation</span></button>
    <nav id="admin-sidebar-links" aria-label="Admin sections">${links.map(([href, icon, label, key]) => `<a href="${href}" class="admin-sidebar-link ${active === key ? 'active' : ''}" ${active === key ? 'aria-current="page"' : ''}><span class="admin-sidebar-icon" aria-hidden="true">${icon}</span><span>${label}</span></a>`).join('')}</nav>
    <a class="admin-sidebar-storefront" href="index.html">↗ View storefront</a>`;
  view.prepend(aside);
  const toggle = aside.querySelector('.admin-sidebar-toggle');
  toggle.addEventListener('click', () => {
    const opened = aside.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(opened));
  });
  aside.querySelectorAll('nav a').forEach(link => link.addEventListener('click', () => aside.classList.remove('open')));
})();
