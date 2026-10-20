// Service worker appky — network-first: pro navigaci a soubory appky vždy nejdřív
// zkusí síť a úspěšnou odpověď uloží do cache; teprve při selhání sítě (offline)
// vrátí to, co má v cache. Offline start na "/" nebo "/index.html" funguje díky
// shellu appky precachovanému při instalaci.
//
// CACHE_NAME zvyš (v2 -> v3 -> ...) PŘI KAŽDÉM nasazení, které mění obsah souborů
// v ASSETS (index.html, styles.css, app.js, manifest.json, ikony). Activate pak
// smaže všechny cache s jiným názvem, takže uživatelé s appkou nainstalovanou na
// ploše dostanou novou verzi hned po dalším otevření, místo aby jim navždy zůstala
// stará cache. Bez zvýšení verze se starý obsah v cache jen tiše přepíše při příští
// úspěšné síťové odpovědi — pro běžné textové/JS změny to stačí, ale po větším
// zásahu (např. změna seznamu ASSETS) verzi zvyš, ať se install/activate jistě spustí.
const CACHE_NAME = 'vondrasek-v4';
const ASSETS = ['/', '/index.html', '/styles.css', '/app.js', '/sync.js', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    Promise.all([
      self.skipWaiting(),
      caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    ])
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isAppFile = url.origin === self.location.origin && ASSETS.includes(url.pathname);
  if (req.mode !== 'navigate' && !isAppFile) return; // ostatní (např. cizí fonty) necháme na prohlížeči

  e.respondWith(
    fetch(req)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const shell = await caches.match('/index.html');
          if (shell) return shell;
        }
        return Response.error();
      })
  );
});
