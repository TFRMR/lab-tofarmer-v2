/* ============================================================
   tof-install.js — Satu aplikasi ToFarmer untuk seluruh situs.

   Aturan
   - Semua halaman menautkan manifest yang SAMA (/manifest.webmanifest, id "/"), jadi
     "Instal 5 Detik" dari halaman mana pun memasang aplikasi ToFarmer yang sama
     (bukan aplikasi terpisah per halaman). Dompet sengaja tetap punya aplikasi sendiri.
   - Satu service worker untuk seluruh situs: /sw.js (scope "/").
   - Di HP yang tidak punya tombol pasang otomatis (iPhone, browser tertentu), petunjuk
     diarahkan ke halaman utama, karena "Tambahkan ke Layar Utama" memakai halaman yang sedang dibuka.

   Dipakai sebagai skrip biasa:  <script src="/js/tof-install.js"></script>  -> window.TofInstall
   Tombol/banner: elemen dengan id "pwaBanner" (banner) dan atribut data-tof-instal (tombol) dihubungkan otomatis.
   ============================================================ */
(function (global) {
  'use strict';

  var doc = global.document;
  var tunda = null;                 // peristiwa beforeinstallprompt yang ditahan
  var K_TUTUP = 'tof_instal_tutup'; // waktu banner terakhir ditutup pengguna
  var TUTUP_HARI = 7;

  function terpasang() {
    try {
      return (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) ||
             global.navigator.standalone === true;
    } catch (e) { return false; }
  }
  function iOS() {
    var ua = global.navigator.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua) || (global.navigator.platform === 'MacIntel' && global.navigator.maxTouchPoints > 1);
  }
  function dibukaDiBeranda() {
    var p = global.location.pathname;
    return p === '/' || p === '/index.html';
  }
  function barusanDitutup() {
    try {
      var t = parseInt(global.localStorage.getItem(K_TUTUP) || '0', 10);
      return t && (Date.now() - t) < TUTUP_HARI * 86400000;
    } catch (e) { return false; }
  }

  function banner() { return doc.getElementById('pwaBanner'); }
  function tampilkanBanner(tampil) {
    var b = banner();
    if (!b) return;
    if (tampil && (terpasang() || barusanDitutup())) tampil = false;
    b.style.display = tampil ? 'flex' : 'none';
  }

  // ---------- dialog petunjuk (mandiri, tidak bergantung pada halaman) ----------
  function dialog(judul, isiHtml, tombol) {
    var lama = doc.getElementById('tof-instal-dialog');
    if (lama) lama.remove();
    var o = doc.createElement('div');
    o.id = 'tof-instal-dialog';
    o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2000000001;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font-family:Inter,system-ui,sans-serif;';
    o.innerHTML =
      '<div style="background:#fff;border-radius:18px;max-width:340px;width:100%;padding:20px;box-shadow:0 10px 30px rgba(0,0,0,.25);color:#1c2b22;">' +
      '<div style="font-size:30px;text-align:center;">📲</div>' +
      '<div style="font-weight:700;font-size:15px;text-align:center;margin:6px 0 10px;color:#2f6f4e;">' + judul + '</div>' +
      '<div style="font-size:13px;line-height:1.6;color:#4b5b52;">' + isiHtml + '</div>' +
      '<div id="tof-instal-aksi" style="display:flex;gap:8px;margin-top:16px;"></div></div>';
    doc.body.appendChild(o);
    var aksi = o.querySelector('#tof-instal-aksi');
    (tombol || []).forEach(function (t) {
      var b = doc.createElement('button');
      b.textContent = t.teks;
      b.style.cssText = 'flex:1;padding:11px;border:none;border-radius:12px;font-weight:700;font-size:13px;cursor:pointer;' +
        (t.utama ? 'background:linear-gradient(90deg,#4caf7a,#c9a227);color:#fff;' : 'background:#eef7f1;color:#2f6f4e;');
      b.onclick = function () { o.remove(); if (t.aksi) t.aksi(); };
      aksi.appendChild(b);
    });
    o.addEventListener('click', function (e) { if (e.target === o) o.remove(); });
  }

  function petunjuk() {
    var tombol = [];
    if (!dibukaDiBeranda()) {
      tombol.push({ teks: 'Buka halaman utama', utama: true, aksi: function () { global.location.href = '/?pasang=1'; } });
      tombol.push({ teks: 'Nanti' });
    } else {
      tombol.push({ teks: 'Siap', utama: true });
    }
    var langkah = iOS()
      ? 'Di iPhone/iPad: ketuk tombol <b>Bagikan</b> (kotak berpanah) di Safari, lalu pilih <b>Tambahkan ke Layar Utama</b>.'
      : 'Buka menu browser (titik tiga), lalu pilih <b>Instal aplikasi</b> atau <b>Tambahkan ke Layar Utama</b>.';
    var catatan = dibukaDiBeranda()
      ? ''
      : '<br><br>Supaya yang terpasang aplikasi ToFarmer yang utuh (bukan pintasan halaman ini), lakukan dari <b>halaman utama</b>.';
    dialog('Pasang aplikasi ToFarmer', langkah + catatan, tombol);
  }

  var TofInstall = {
    terpasang: terpasang,
    bisaOtomatis: function () { return !!tunda; },

    // Dipanggil tombol "Instal 5 Detik" di halaman mana pun: selalu memasang aplikasi ToFarmer yang sama.
    pasang: function () {
      if (terpasang()) {
        dialog('Sudah terpasang', 'Kamu sedang memakai aplikasi ToFarmer. 🌱', [{ teks: 'Siap', utama: true }]);
        return;
      }
      if (tunda) {
        var e = tunda;
        tunda = null;
        e.prompt();
        if (e.userChoice && e.userChoice.then) {
          e.userChoice.then(function (h) { if (h && h.outcome === 'accepted') tampilkanBanner(false); });
        }
        return;
      }
      petunjuk();
    },

    // Tutup banner untuk sementara (tombol ✕)
    tutupBanner: function () {
      try { global.localStorage.setItem(K_TUTUP, String(Date.now())); } catch (e) {}
      tampilkanBanner(false);
    },

    // Satu service worker untuk seluruh situs; bersihkan service worker Jurnal lama (scope /html/) yang
    // sebelumnya ikut mengendalikan semua halaman di folder itu dan menyajikan salinan lama.
    daftarSW: function () {
      if (!('serviceWorker' in global.navigator) || !/^https?:$/.test(global.location.protocol)) return Promise.resolve(null);
      var bersih = global.navigator.serviceWorker.getRegistrations().then(function (daftar) {
        daftar.forEach(function (r) {
          try { if (new URL(r.scope).pathname === '/html/') r.unregister(); } catch (e) {}
        });
      }).catch(function () {});
      if (global.caches && global.caches.keys) {
        global.caches.keys().then(function (ks) {
          ks.forEach(function (k) { if (k.indexOf('olahrasa-') === 0) global.caches.delete(k); });
        }).catch(function () {});
      }
      return bersih.then(function () {
        return global.navigator.serviceWorker.register('/sw.js', { scope: '/' });
      }).catch(function (e) { console.warn('Service worker gagal didaftarkan', e); return null; });
    }
  };

  global.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    tunda = e;
    tampilkanBanner(true);
  });
  global.addEventListener('appinstalled', function () {
    tunda = null;
    tampilkanBanner(false);
  });

  function siap() {
    // Tombol bertanda data-tof-instal ikut memasang aplikasi utama
    var tombol = doc.querySelectorAll('[data-tof-instal]');
    for (var i = 0; i < tombol.length; i++) tombol[i].addEventListener('click', function () { TofInstall.pasang(); });
    var tutup = doc.querySelectorAll('[data-tof-instal-tutup]');
    for (var j = 0; j < tutup.length; j++) tutup[j].addEventListener('click', function () { TofInstall.tutupBanner(); });

    if (terpasang()) { tampilkanBanner(false); }
    else if (iOS() && banner() && !barusanDitutup()) { banner().style.display = 'flex'; } // iOS tidak punya prompt bawaan

    // Dibawa dari halaman lain lewat "Buka halaman utama": langsung tunjukkan cara memasang
    if (dibukaDiBeranda() && /[?&]pasang=1\b/.test(global.location.search) && !terpasang() && !tunda) {
      setTimeout(function () { if (!tunda) petunjuk(); }, 600);
    }
    TofInstall.daftarSW();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', siap); else siap();
  global.TofInstall = TofInstall;
})(window);
