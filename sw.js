// Service worker: guarda a casca do app para abrir offline. Dados ficam no cache do Firestore.
const V = 'c26-v5';
const CASCA = ['./', './index.html', './css/app.css', './js/app.js', './js/fb.js', './js/plano.js', './js/config.js', './js/edital.js', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(CASCA))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.origin === location.origin) {
    // rede primeiro (pega atualizações), cache como reserva
    e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(V).then((ca) => ca.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
  } else if (u.hostname.endsWith('gstatic.com') || u.hostname.endsWith('googleapis.com')) {
    if (u.pathname.includes('/firebasejs/') || u.hostname.startsWith('fonts')) e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then((r) => { const c = r.clone(); caches.open(V).then((ca) => ca.put(e.request, c)); return r; })));
  }
});
