/* Service Worker — Dompet ToFarmer
   Cakupan: hanya halaman dompet.html (didaftarkan dengan scope './dompet.html'), sehingga
   tidak mengganggu service worker lain di folder /html/ (mis. Jurnal Olahrasa).

   Prinsip:
   - NETWORK-FIRST: selama online selalu ambil versi terbaru (kode dompet menyangkut uang,
     jangan pernah terjebak versi lama). Cache hanya cadangan agar halaman tetap terbuka offline.
   - Permintaan ke Supabase (PIN/brankas) dan node/indexer Algorand TIDAK PERNAH disentuh
     atau disimpan: semuanya harus langsung ke jaringan.
   Naikkan VERSION saat file ini berubah. */
const VERSION = 'v1';
const CACHE = 'dompet-' + VERSION;
const SHELL = [
  './dompet.html',
  '../js/dompet.js',
  '../supabase.js',
  './manifest-dompet.webmanifest',
  './icon-dompet-192.png',
  './icon-dompet-512.png'
];
const LIB_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async (u) => {
      try { await cache.add(u); } catch (e) { /* best effort */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('dompet-') && k !== CACHE) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

function dilarang(url) {
  return /(^|\.)supabase\.co$/.test(url.hostname) || /(^|\.)algonode\.cloud$/.test(url.hostname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (dilarang(url)) return; // langsung ke jaringan, tanpa cache

  const milikSendiri = url.origin === self.location.origin;
  const pustaka = LIB_HOSTS.includes(url.hostname);
  if (!milikSendiri && !pustaka) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    } catch (e) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const halaman = await cache.match('./dompet.html');
        if (halaman) return halaman;
      }
      return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
