/* Service Worker - Jurnal Olahrasa & Sasmita (offline-first)
   Taruh file ini di FOLDER YANG SAMA dengan jurnal-olah-rasa.html.
   Naikkan VERSION setiap kali kamu mengubah file HTML agar pengguna dapat versi terbaru. */
const VERSION = 'v1';
const SHELL = 'olahrasa-shell-' + VERSION;
const LIBS = 'olahrasa-libs-v1';

const LIB_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://unpkg.com/html5-qrcode',
  'https://cdn.jsdelivr.net/npm/algosdk@2.7.0/dist/browser/algosdk.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];
const LIB_HOSTS = ['cdnjs.cloudflare.com', 'unpkg.com', 'cdn.jsdelivr.net'];
const SHELL_URLS = ['./manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const libs = await caches.open(LIBS);
    await Promise.all(LIB_URLS.map(async (u) => {
      try { const r = await fetch(u, { mode: 'cors' }); if (r.ok) await libs.put(u, r); } catch (e) {}
    }));
    const shell = await caches.open(SHELL);
    await Promise.all(SHELL_URLS.map(async (u) => {
      try { const r = await fetch(u); if (r.ok) await shell.put(u, r); } catch (e) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL, LIBS];
    for (const k of await caches.keys()) {
      if (k.startsWith('olahrasa-') && !keep.includes(k)) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

// Halaman meminta dirinya sendiri disimpan (kunjungan pertama belum dikendalikan SW)
self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type === 'CACHE_PAGE' && d.url) {
    event.waitUntil((async () => {
      try {
        const r = await fetch(d.url, { cache: 'reload' });
        if (r.ok) await (await caches.open(SHELL)).put(d.url, r);
      } catch (e) {}
    })());
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Halaman utama: coba jaringan 4 detik, kalau lambat/putus pakai salinan tersimpan
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const network = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      });
      network.catch(() => {});
      try {
        const res = await Promise.race([network, new Promise((r) => setTimeout(() => r(null), 4000))]);
        if (res) return res;
      } catch (e) {}
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      for (const k of await cache.keys()) {
        const r = await cache.match(k);
        if (r && (r.headers.get('content-type') || '').includes('text/html')) return r;
      }
      try { return await network; } catch (e) {}
      return new Response('Offline. Buka aplikasi sekali saat ada sinyal agar tersimpan.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    })());
    return;
  }

  // Pustaka CDN & berkas statis satu situs: tampilkan salinan tersimpan, perbarui di belakang layar
  const isLib = LIB_HOSTS.includes(url.hostname);
  const isOwn = url.origin === self.location.origin;
  if (!isLib && !isOwn) return; // Supabase dsb. dibiarkan lewat jaringan biasa

  event.respondWith((async () => {
    const cache = await caches.open(isLib ? LIBS : SHELL);
    const cached = await cache.match(req, { ignoreSearch: isOwn });
    const refresh = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    });
    if (cached) { refresh.catch(() => {}); return cached; }
    try { return await refresh; } catch (e) {
      return new Response('', { status: 504 });
    }
  })());
});
