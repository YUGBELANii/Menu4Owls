'use strict';
(function () {
  const host = String(window.location.hostname || '').toLowerCase();
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number);
  const localIPv4 = ipv4 && (
    ipv4[0] === 10 || ipv4[0] === 127 ||
    (ipv4[0] === 192 && ipv4[1] === 168) ||
    (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) ||
    (ipv4[0] === 169 && ipv4[1] === 254)
  );
  const localHost = host === 'localhost' || host === '::1' || host === '[::1]' || host === '0.0.0.0' ||
    host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.test') ||
    Boolean(localIPv4) || /^\[?f[cd][0-9a-f]{2}:/i.test(host) || /^\[?fe[89ab][0-9a-f]:/i.test(host);
  if (localHost || window.location.protocol === 'file:') return;

  for (const src of ['/_vercel/insights/script.js', '/_vercel/speed-insights/script.js']) {
    const script = document.createElement('script');
    script.defer = true;
    script.src = src;
    document.head.appendChild(script);
  }
})();
