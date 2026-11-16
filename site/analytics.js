/* Google Analytics 4, loaded only when config.js has a measurement ID.
   Page views are sent manually: the site is one page whose address changes with every keystroke in the
   search box (shareable links), so automatic page views would count each keystroke.
   Exposes window.radarTrack(eventName, params); it is a no-op when analytics is off. */
(() => {
  const id = (window.RADAR_CONFIG || {}).gaId || '';
  window.radarTrack = () => {};
  if (!/^G-[A-Z0-9]{4,}$/.test(id)) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', id, { send_page_view: false });

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.append(s);

  document.addEventListener('DOMContentLoaded', () => { const n = document.getElementById('ga-note'); if (n) n.hidden = false; });

  window.radarTrack = (name, params = {}) => {
    try { window.gtag('event', name, params); } catch {}
  };
})();
