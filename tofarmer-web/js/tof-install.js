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
  var K_KECIL = 'tof_instal_kecil';        // '1' = pengguna memperkecil banner (tombol ✕)
  var K_TUTUP_LAMA = 'tof_instal_tutup';   // versi lama: ✕ menyembunyikan banner 7 hari; kini ✕ = diperkecil

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
  function android() { return /Android/i.test(global.navigator.userAgent || ''); }
  // Chrome asli di Android: ada "Chrome/" tetapi bukan Samsung/Opera/Edge/UC/Mi/Oppo/Vivo/Firefox/WebView tertanam
  function androidBukanChrome() {
    var ua = global.navigator.userAgent || '';
    if (!android()) return false;
    if (/SamsungBrowser|OPR\/|EdgA|UCBrowser|MiuiBrowser|HeyTapBrowser|VivoBrowser|Firefox|; wv\)|Version\/[\d.]+ Chrome\//.test(ua)) return true;
    return !/Chrome\//.test(ua);
  }
  // Membuka halaman yang sama di Chrome; jika Chrome belum terpasang, diarahkan ke halamannya di Play Store
  function urlChrome(tujuan) {
    var u = new URL(tujuan, global.location.origin);
    var cadangan = encodeURIComponent('https://play.google.com/store/apps/details?id=com.android.chrome');
    return 'intent://' + u.host + u.pathname + u.search + u.hash +
      '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + cadangan + ';end';
  }
  function dibukaDiBeranda() {
    var p = global.location.pathname;
    return p === '/' || p === '/index.html';
  }
  // Banner diperkecil (bukan dihilangkan) selama aplikasi belum terpasang
  function diperkecil() {
    try { return global.localStorage.getItem(K_KECIL) === '1' || !!global.localStorage.getItem(K_TUTUP_LAMA); }
    catch (e) { return false; }
  }

  function banner() { return doc.getElementById('pwaBanner'); }

  // Tombol kecil "⚡ Instal" (pojok kiri bawah; pojok kanan dipakai tombol WhatsApp di beranda)
  function chip(buat) {
    var c = doc.getElementById('tof-instal-chip');
    if (c || !buat) return c;
    c = doc.createElement('button');
    c.id = 'tof-instal-chip';
    c.type = 'button';
    c.setAttribute('aria-label', 'Instal aplikasi ToFarmer');
    c.textContent = '⚡ Instal';
    // width/margin/height ditulis eksplisit: beberapa halaman punya aturan `button { width:45%; margin-top:10px }`
    // yang bila tidak ditimpa membuat tombol ini selebar 45% layar.
    c.style.cssText = 'display:none;position:fixed;left:14px;bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:9000;' +
      'width:auto;min-width:0;max-width:none;height:auto;margin:0;flex:none;box-sizing:border-box;line-height:1.2;white-space:nowrap;' +
      'align-items:center;gap:4px;padding:10px 14px;border:none;border-radius:999px;cursor:pointer;' +
      'font:700 12px Inter,system-ui,sans-serif;color:#fff;background:linear-gradient(90deg,#4caf7a,#c9a227);' +
      'box-shadow:0 6px 18px rgba(0,0,0,.22);-webkit-tap-highlight-color:transparent;';
    c.addEventListener('click', function () { TofInstall.pasang(); });
    doc.body.appendChild(c);
    return c;
  }

  // tampil=true : banner penuh, atau tombol kecil bila pengguna memperkecilnya
  // tampil=false: semuanya disembunyikan (sudah terpasang)
  function tampilkanBanner(tampil) {
    var b = banner();
    if (terpasang()) tampil = false;
    if (!tampil) {
      if (b) b.style.display = 'none';
      var c0 = chip(false); if (c0) c0.style.display = 'none';
      return;
    }
    if (!b) return;                 // halaman tanpa banner: tidak menampilkan apa-apa
    if (diperkecil()) {
      b.style.display = 'none';
      chip(true).style.display = 'flex';
    } else {
      b.style.display = 'flex';
      var c1 = chip(false); if (c1) c1.style.display = 'none';
    }
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
      b.style.cssText = 'flex:1;width:auto;margin:0;padding:11px;border:none;border-radius:12px;font-weight:700;font-size:13px;cursor:pointer;' +
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
    navigasi: function (u) { global.location.href = u; },
    urlChrome: urlChrome,
    androidBukanChrome: androidBukanChrome,
    bisaOtomatis: function () { return !!tunda; },

    // Dipanggil tombol "Instal 5 Detik" di halaman mana pun: selalu memasang aplikasi ToFarmer yang sama.
    pasang: function () {
      if (terpasang()) {
        dialog('Sudah terpasang', 'Kamu sedang memakai aplikasi ToFarmer. 🌱', [{ teks: 'Siap', utama: true }]);
        return;
      }
      if (androidBukanChrome() && !global.__tofTetapDiSini) {
        dialog('Pasang lewat Chrome',
          'Supaya aplikasi ToFarmer terpasang dan berjalan stabil seperti di HP lain, pasang lewat <b>Chrome</b>. ' +
          'Halaman ini akan dibuka di Chrome; tinggal tekan <b>Instal 5 Detik</b> di sana.',
          [{ teks: 'Buka di Chrome', utama: true, aksi: function () { TofInstall.navigasi(urlChrome('/?pasang=1')); } },
           { teks: 'Tetap di sini', aksi: function () { global.__tofTetapDiSini = true; TofInstall.pasang(); } }]);
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

    // Tombol ✕: perkecil jadi tombol "⚡ Instal" (tidak hilang, supaya masih bisa dipasang kapan saja)
    tutupBanner: function () {
      try { global.localStorage.setItem(K_KECIL, '1'); } catch (e) {}
      tampilkanBanner(true);
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

    if (dibukaDiBeranda() && /[?&]pasang=1\b/.test(global.location.search)) {
      try { global.localStorage.removeItem(K_KECIL); global.localStorage.removeItem(K_TUTUP_LAMA); } catch (e) {}
    }
    if (terpasang()) { tampilkanBanner(false); }
    else if (iOS() && banner()) { tampilkanBanner(true); } // iOS tidak punya prompt bawaan

    // Dibawa dari halaman lain lewat "Buka halaman utama": langsung tunjukkan cara memasang
    if (dibukaDiBeranda() && /[?&]pasang=1\b/.test(global.location.search) && !terpasang() && !tunda) {
      setTimeout(function () { if (!tunda) petunjuk(); }, 600);
    }
    TofInstall.daftarSW();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', siap); else siap();
  global.TofInstall = TofInstall;
})(window);
