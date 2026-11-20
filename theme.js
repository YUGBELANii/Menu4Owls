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
      const inAdminNav = button.closest('.admin-sidebar nav');
      button.innerHTML = inAdminNav
        ? (light ? '<span aria-hidden="true">☾</span><span>Dark mode</span>' : '<span aria-hidden="true">☀</span><span>Light mode</span>')
        : (light ? '<span aria-hidden="true">☾</span>' : '<span aria-hidden="true">☀</span>');
      button.title = light ? 'Switch to dark mode' : 'Switch to light mode';
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

    const adminNav = document.querySelector('.admin-sidebar nav');
    const nav = document.querySelector('.nav-inner');

    if (adminNav) {
      button.classList.add('admin-theme-toggle');
      adminNav.insertBefore(button, adminNav.firstChild);
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