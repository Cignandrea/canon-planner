/* ═══════════════════════════════════════════════════
   FP Planner · Canon — Service Worker
   Strategy: Cache-First per CDN statici, Network-First
   con fallback cache per la navigazione.
═══════════════════════════════════════════════════ */
'use strict';

const CACHE   = 'fp-canon-v5';
const STATIC_CACHE = 'fp-canon-static-v5';

/* Risorse esterne precaricate: Chart.js pinned + Google Fonts CSS */
const PRECACHE = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Geist+Mono:wght@400;500;600&display=swap'
];

/* §1 INSTALL — precache opportunistico */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

/* §2 ACTIVATE — pulizia cache obsolete */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => k !== CACHE && k !== STATIC_CACHE)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* §3 FETCH — strategie differenziate */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* CDN esterni → Cache-First (immutabili, versionati) */
  const isStatic =
    url.hostname.includes('jsdelivr.net') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com');

  if (isStatic) {
    e.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then(c => c.put(req, clone));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  /* Navigazione / HTML → Network-First con fallback cache */
  if (req.mode === 'navigate' ||
      (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(req, clone));
        return res;
      }).catch(() => caches.match(req).then(c => c || caches.match('./')))
    );
    return;
  }

  /* Altri asset same-origin → Stale-While-Revalidate light */
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(cached => {
        const fetchP = fetch(req).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(req, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || fetchP;
      })
    );
  }
});
