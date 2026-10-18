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
const CACHE_VERSION = 'tofarmer-v2'; // [PWA SERAGAM] dinaikkan: satu aplikasi/SW untuk seluruh situs, cache lama dibuang
const CACHE_NAME = `tofarmer-cache-${CACHE_VERSION}`;

// Aset inti yang boleh langsung di-precache saat install (opsional, aman kalau kosong --
// runtime caching di bawah tetap jalan untuk file lain yang belum ada di sini).
const PRECACHE_ASSETS = [
  './',
  './desa-tof.html',
  './manifest.webmanifest',   // [PWA SERAGAM] kerangka aplikasi utama
  './aset/pwa-192.png',
  './aset/pwa-512.png',
  './js/tof-sesi.js',
  './js/tof-install.js',
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

  // [PWA SERAGAM] Service worker ini kini aktif di semua halaman, jadi dibuat ringan: biarkan browser menangani sendiri
  // video/audio/potongan (Range) dan permintaan lintas-situs selain pustaka (script/style/font) dan gambar.
  // Menggandakan aliran respons besar ke cache memboros memori HP.
  const dest = req.destination;
  if (req.headers.get('range') || dest === 'video' || dest === 'audio' || dest === 'track') return;
  const sama = new URL(req.url).origin === self.location.origin;
  if (!sama && dest !== 'script' && dest !== 'style' && dest !== 'font' && dest !== 'image') return;

  event.respondWith(networkFirstThenCache(req));
});

// [PWA SERAGAM] Hanya simpan yang wajar: respons utuh (200), bukan media, tidak lebih dari ~1,5 MB.
// Respons lintas-situs "opaque" dihitung ~7 MB per berkas terhadap kuota penyimpanan, jadi hanya pustaka
// (script/style/font) yang boleh opaque; gambar lintas-situs hanya bila boleh dibaca (CORS).
function bolehDisimpan(request, response) {
  if (!response) return false;
  const dest = request.destination;
  const sama = new URL(request.url).origin === self.location.origin;
  if (response.type === 'opaque') return !sama && (dest === 'script' || dest === 'style' || dest === 'font');
  if (response.status !== 200) return false;
  const jenis = String(response.headers.get('content-type') || '').toLowerCase();
  if (jenis.startsWith('video/') || jenis.startsWith('audio/')) return false;
  const ukuran = parseInt(response.headers.get('content-length') || '0', 10);
  if (ukuran > 1500000) return false;
  return true;
}

async function networkFirstThenCache(request) {
  try {
    const fresh = await fetch(request);
    // Simpan salinan terbaru ke cache buat cadangan offline nanti (stale-while-revalidate
    // ringan: tidak menunggu ini selesai untuk merespons ke browser).
    // Tapi: cuma cache URL dengan scheme http/https; chrome-extension://, data:, dll
    // tidak bisa di-cache dan akan throw error. Skip dengan diam-diam.
    if (request.url.startsWith('http://') || request.url.startsWith('https://')) {
      try {
        const cache = await caches.open(CACHE_NAME);
        if (bolehDisimpan(request, fresh)) {
          cache.put(request, fresh.clone()).catch((e) => console.warn('[SW] Cache put failed:', e && e.message));
        }
      } catch (cacheErr) {
        // Kalau cache.put() gagal, jangan hentikan flow -- tetap return fresh response
        console.warn('[SW] Cache put failed:', cacheErr.message);
      }
    }
    return fresh;
  } catch (err) {
    // Gagal konek (offline) -- baru pakai cache sebagai cadangan.
    const cached = await caches.match(request);
    if (cached) return cached;
    // [PWA SERAGAM] Offline: cari salinan yang sama tanpa melihat ?query (mis. ...html?u=nama),
    // dan untuk perpindahan halaman yang belum tersimpan tampilkan beranda daripada layar error browser.
    const mirip = await caches.match(request, { ignoreSearch: true });
    if (mirip) return mirip;
    if (request.mode === 'navigate') {
      const beranda = await caches.match('./');
      if (beranda) return beranda;
    }
    throw err;
  }
}

// [PWA SERAGAM] Halaman (mis. Jurnal) boleh meminta dirinya disimpan agar bisa dibuka offline sejak kunjungan pertama.
// Dulu ditangani service worker Jurnal tersendiri (html/sw.js, scope /html/); kini satu service worker untuk semua.
self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type === 'CACHE_PAGE' && d.url) {
    event.waitUntil((async () => {
      try {
        const r = await fetch(d.url, { cache: 'reload' });
        if (r.ok) await (await caches.open(CACHE_NAME)).put(d.url, r);
      } catch (e) {}
    })());
  }
});
