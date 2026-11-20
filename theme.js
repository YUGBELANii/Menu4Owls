'use strict';
(function () {
  const root = document.documentElement;
  const storageKey = 'owlz-theme';

  function readTheme() {
    try {
      return localStorage.getItem(storageKey) === 'light' ? 'light' : 'dark';
    } catch (_) {
      return 'dark';
    }
  }

  function applyTheme(theme) {
    const selected = theme === 'light' ? 'light' : 'dark';
    root.dataset.theme = selected;
    root.style.colorScheme = selected;
    try { localStorage.setItem(storageKey, selected); } catch (_) {}
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const light = selected === 'light';
      button.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
      button.setAttribute('aria-pressed', String(light));
      button.innerHTML = light
        ? '<span aria-hidden="true">☾</span><span class="theme-toggle-label">Dark mode</span>'
        : '<span aria-hidden="true">☀</span><span class="theme-toggle-label">Light mode</span>';
    });
  }

  applyTheme(readTheme());

  function addToggle() {
    if (document.querySelector('[data-theme-toggle]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-toggle';
    button.dataset.themeToggle = '';
    button.addEventListener('click', () => {
      applyTheme(root.dataset.theme === 'light' ? 'dark' : 'light');
    });

    const adminBrand = document.querySelector('.admin-sidebar-brand');
    const collapse = adminBrand?.querySelector('.admin-sidebar-collapse');
    const nav = document.querySelector('.nav-inner');

    if (adminBrand) {
      if (collapse) adminBrand.insertBefore(button, collapse);
      else adminBrand.append(button);
    } else if (nav) {
      nav.append(button);
    }
    applyTheme(root.dataset.theme);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addToggle, { once: true });
  } else {
    addToggle();
  }
})();