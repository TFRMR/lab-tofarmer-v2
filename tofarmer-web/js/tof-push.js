/* ============================================================
   tof-push.js — Aktivasi notifikasi push ToFarmer (muncul di layar HP).
   Dipakai sebagai skrip biasa:  <script src="/js/tof-push.js" defer></script>  -> window.TofPush

   - Tidak pernah meminta izin sendiri: izin hanya diminta saat anggota menekan tombol "Aktifkan notifikasi".
   - Memakai token sesi yang sudah ada di perangkat (kunci tof_session); tidak meminta PIN lagi.
   - Perangkat didaftarkan lewat fungsi database push_daftar (diperiksa token sesi).
   - Langganan selalu dibuat di service worker utama (/sw.js), yang menampilkan notifikasinya.
   ISI dulu VAPID_PUBLIK di bawah dengan kunci PUBLIK hasil `npx web-push generate-vapid-keys`.
   ============================================================ */
(function (global) {
  'use strict';

  var VAPID_PUBLIK = 'BBP947TGhUoVOco2QtnlhA9uJU-NQtltR0oAwBpmCPtgAU7bPnhLzvZbpxabPZWwYk0GaPFRt88__l6Yv3XgL8I
';
  var K_TUNDA = 'tof_push_tunda';      // anggota menutup ajakan: jangan tampil lagi sampai waktu ini
  var K_SINKRON = 'tof_push_sinkron';  // terakhir kali langganan didaftarkan ulang (maks 1x per hari)

  function baca(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function tulis(k, v) { try { global.localStorage.setItem(k, v); } catch (e) {} }

  // Sesi dibaca langsung dari kunci bersama yang dipakai semua halaman (sama dengan tof-sesi.js)
  function sesi() {
    var id = baca('tof_wallet'), u = baca('tof_login_username');
    return id && u ? { id: id, username: u } : null;
  }
  function tokenSesi() {
    var s = sesi(); if (!s) return null;
    try {
      var o = JSON.parse(baca('tof_session') || 'null');
      if (o && o.id === s.id && typeof o.token === 'string' && typeof o.exp === 'number' && o.exp * 1000 > Date.now() + 60000) return o.token;
    } catch (e) {}
    return null;
  }

  function didukung() {
    return 'serviceWorker' in navigator && 'PushManager' in global && 'Notification' in global;
  }
  function iOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function terpasang() {
    return (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  }
  function klien() { return global.supabaseClient || null; }

  function kunciKeU8(b64) {
    var pad = '='.repeat((4 - b64.length % 4) % 4);
    var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var u8 = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
    return u8;
  }

  // Service worker utama (scope "/"), ditunggu sampai aktif
  function regUtama() {
    return navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function (reg) {
      if (reg.active) return reg;
      return new Promise(function (res) {
        var sw = reg.installing || reg.waiting;
        if (!sw) return res(reg);
        sw.addEventListener('statechange', function () { if (sw.state === 'activated') res(reg); });
        setTimeout(function () { res(reg); }, 8000);
      });
    });
  }

  function daftarKeServer(sub) {
    var s = sesi();
    var t = tokenSesi();
    var c = klien();
    if (!s || !t || !c) return Promise.resolve(false);
    var j = sub.toJSON();
    if (!j.keys) return Promise.resolve(false);
    return c.rpc('push_daftar', {
      p_id: s.id, p_token: t, p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth,
      p_ua: (navigator.userAgent || '').slice(0, 200)
    }).then(function (r) { return !r.error && r.data === true; }).catch(function () { return false; });
  }

  var TofPush = {
    // 'tidak_didukung' | 'perlu_instal_ios' | 'belum_login' | 'ditolak' | 'aktif' | 'belum'
    status: function () {
      if (!didukung()) return Promise.resolve(iOS() && !terpasang() ? 'perlu_instal_ios' : 'tidak_didukung');
      if (!sesi()) return Promise.resolve('belum_login');
      if (Notification.permission === 'denied') return Promise.resolve('ditolak');
      if (Notification.permission !== 'granted') return Promise.resolve('belum');
      return navigator.serviceWorker.getRegistration('/').then(function (reg) {
        return reg ? reg.pushManager.getSubscription() : null;
      }).then(function (sub) { return sub ? 'aktif' : 'belum'; }).catch(function () { return 'belum'; });
    },

    // Dipanggil dari tombol. Mengembalikan { ok, error? }
    aktifkan: function () {
      if (VAPID_PUBLIK.indexOf('ISI_DENGAN') === 0) return Promise.resolve({ ok: false, error: 'vapid_belum_diisi' });
      if (!didukung()) return Promise.resolve({ ok: false, error: iOS() && !terpasang() ? 'perlu_instal_ios' : 'tidak_didukung' });
      if (!tokenSesi()) return Promise.resolve({ ok: false, error: 'belum_login' });
      return Notification.requestPermission().then(function (izin) {
        if (izin !== 'granted') return { ok: false, error: 'ditolak' };
        return regUtama().then(function (reg) {
          return reg.pushManager.getSubscription().then(function (sub) {
            return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: kunciKeU8(VAPID_PUBLIK) });
          });
        }).then(function (sub) {
          return daftarKeServer(sub).then(function (ok) {
            if (ok) { tulis(K_SINKRON, String(Date.now())); return { ok: true }; }
            return { ok: false, error: 'gagal_daftar' };
          });
        });
      }).catch(function () { return { ok: false, error: 'gagal' }; });
    },

    nonaktifkan: function () {
      return navigator.serviceWorker.getRegistration('/').then(function (reg) {
        return reg ? reg.pushManager.getSubscription() : null;
      }).then(function (sub) {
        if (!sub) return { ok: true };
        var s = sesi();
        var t = tokenSesi();
        var ep = sub.endpoint;
        return sub.unsubscribe().then(function () {
          if (s && t && klien()) return klien().rpc('push_batal', { p_id: s.id, p_token: t, p_endpoint: ep });
        }).then(function () { return { ok: true }; });
      }).catch(function () { return { ok: false }; });
    },

    // Bila sudah aktif: daftarkan ulang diam-diam (alamat langganan bisa berganti), maksimal 1x sehari
    sinkron: function () {
      var terakhir = Number(baca(K_SINKRON) || 0);
      if (Date.now() - terakhir < 24 * 3600 * 1000) return;
      navigator.serviceWorker.getRegistration('/').then(function (reg) {
        return reg ? reg.pushManager.getSubscription() : null;
      }).then(function (sub) {
        if (sub) return daftarKeServer(sub).then(function (ok) { if (ok) tulis(K_SINKRON, String(Date.now())); });
      }).catch(function () {});
    }
  };
  global.TofPush = TofPush;

  // ---------- Chip ajakan kecil (sederhana untuk pengguna awam) ----------
  function buatChip(teks, aksi) {
    if (document.getElementById('tof-push-chip')) return;
    var el = document.createElement('div');
    el.id = 'tof-push-chip';
    el.style.cssText = 'position:fixed;left:12px;bottom:76px;z-index:99999;max-width:calc(100vw - 24px);background:#2f6f4e;color:#fff;' +
      'border-radius:999px;padding:8px 10px 8px 14px;font:600 13px/1.3 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);' +
      'display:flex;align-items:center;gap:8px;';
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = teks;
    b.style.cssText = 'all:unset;cursor:pointer;';
    b.onclick = aksi;
    var x = document.createElement('button');
    x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Tutup');
    x.style.cssText = 'all:unset;cursor:pointer;opacity:.8;padding:0 4px;';
    x.onclick = function () { tulis(K_TUNDA, String(Date.now() + 3 * 24 * 3600 * 1000)); el.remove(); };
    el.appendChild(b); el.appendChild(x);
    document.body.appendChild(el);
  }

  function mulai() {
    if (Number(baca(K_TUNDA) || 0) > Date.now()) { TofPush.status().then(function (s) { if (s === 'aktif') TofPush.sinkron(); }); return; }
    TofPush.status().then(function (s) {
      if (s === 'aktif') { TofPush.sinkron(); return; }
      if (s === 'belum') {
        buatChip('🔔 Aktifkan notifikasi', function () {
          TofPush.aktifkan().then(function (r) {
            var chip = document.getElementById('tof-push-chip');
            if (r.ok) { if (chip) chip.remove(); alert('Notifikasi aktif ✅ Anda akan diberi kabar bila ada aktivitas di akun Anda.'); return; }
            if (r.error === 'ditolak') alert('Izin notifikasi ditolak. Untuk mengaktifkan: buka pengaturan browser/HP, izinkan notifikasi untuk situs ini, lalu muat ulang halaman.');
            else if (r.error === 'vapid_belum_diisi') alert('Notifikasi belum dikonfigurasi oleh pengurus.');
            else alert('Belum berhasil mengaktifkan notifikasi. Coba lagi sebentar lagi.');
          });
        });
      } else if (s === 'perlu_instal_ios') {
        buatChip('🔔 Notifikasi: pasang aplikasi dulu', function () {
          alert('Di iPhone, notifikasi hanya bisa aktif setelah ToFarmer dipasang ke layar utama:\n\n1. Buka tofarmer.xyz di Safari\n2. Ketuk tombol Bagikan (kotak dengan panah)\n3. Pilih "Tambah ke Layar Utama"\n4. Buka ToFarmer dari layar utama, lalu ketuk "Aktifkan notifikasi".');
        });
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(mulai, 1500); });
  else setTimeout(mulai, 1500);
})(window);
