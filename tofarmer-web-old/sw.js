// sw.js — TOFarmer Service Worker (Fase 1: Cache Asset, offline-first)
//
// PRINSIP UTAMA (belajar dari kejadian "pohon Beringin gak mau pindah"):
// - NETWORK-FIRST untuk semua file app (html/js/css): kalau online, SELALU ambil versi
//   terbaru dari server dulu. Cache cuma dipakai sebagai cadangan kalau request gagal
//   (offline/sinyal jelek). Jadi pemain TIDAK PERNAH terjebak versi lama selama online.
// - Nama cache SELALU ikut versi (CACHE_VERSION). Setiap kali kode ini di-deploy dengan
//   versi baru, cache lama otomatis dihapus saat Service Worker baru aktif.
//
// CARA NAIKKAN VERSI: setiap kali ada perubahan besar ke app (bukan cuma isi game),
// ubah angka di CACHE_VERSION ini, supaya cache lama dibuang bersih.
const CACHE_VERSION = 'tofarmer-v1';
const CACHE_NAME = `tofarmer-cache-${CACHE_VERSION}`;

// Aset inti yang boleh langsung di-precache saat install (opsional, aman kalau kosong --
// runtime caching di bawah tetap jalan untuk file lain yang belum ada di sini).
const PRECACHE_ASSETS = [
  './',
  './desa-tof.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Precache best-effort -- kalau salah satu URL gagal (misal belum tentu ada di
      // semua deployment), jangan gagalkan seluruh instalasi Service Worker-nya.
      return Promise.all(
        PRECACHE_ASSETS.map((url) => cache.add(url).catch(() => {}))
      );
    })
  );
  self.skipWaiting(); // aktifkan versi baru secepatnya, jangan nunggu semua tab ditutup
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME) // buang SEMUA cache versi lama
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Cuma tangani GET -- jangan cache POST/RPC ke Supabase (data harus selalu real-time,
  // bukan dari cache; ini beda dengan queue niat offline yang akan dibangun di Fase 3).
  if (req.method !== 'GET') return;

  // Jangan campur tangan request ke Supabase (API/RPC/realtime) sama sekali --
  // itu harus selalu langsung ke jaringan, tidak boleh lewat cache Service Worker ini.
  if (req.url.includes('supabase.co')) return;

  event.respondWith(networkFirstThenCache(req));
});

async function networkFirstThenCache(request) {
  try {
    const fresh = await fetch(request);
    // Simpan salinan terbaru ke cache buat cadangan offline nanti (stale-while-revalidate
    // ringan: tidak menunggu ini selesai untuk merespons ke browser).
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    // Gagal konek (offline) -- baru pakai cache sebagai cadangan.
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}