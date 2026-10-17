/* html/sw.js — DIPENSIUNKAN (satu service worker untuk seluruh situs: /sw.js).

   Dulu file ini adalah service worker Jurnal yang terdaftar dengan scope /html/, sehingga ikut mengendalikan
   SEMUA halaman di folder itu (Scan, Tracker, Kaji Wayang, ...) dan menyajikan salinan lama dari cache.
   Isi aslinya diarsipkan di sw-jurnal-lama.js (tidak dipakai).

   File ini sengaja tetap ada: perangkat yang masih memakai versi lama akan mengambilnya saat pemeriksaan
   pembaruan, lalu membersihkan diri (hapus cache Jurnal lama dan mencabut pendaftarannya) tanpa memuat ulang halaman. */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('olahrasa-')) await caches.delete(k);
    }
    await self.registration.unregister();
  })());
});
// Tidak ada handler 'fetch': semua permintaan langsung ke jaringan.
