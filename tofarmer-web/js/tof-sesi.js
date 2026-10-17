/* ============================================================
   tof-sesi.js — Sesi bersama ToFarmer: login sekali, masuk di semua halaman.

   Cara kerja
   - Login/daftar dilakukan oleh Edge Function "tof-vault" (PIN diperiksa di server, salah PIN dibatasi).
   - Hasilnya disimpan di perangkat dengan kunci yang SAMA untuk semua halaman:
       tof_wallet, tof_login_username  -> siapa yang login
       tof_session {id, token, exp}    -> token bertanda tangan (berlaku 30 hari) untuk fungsi RPC database
   - Token dikirim pada parameter p_pin_hash di fungsi RPC (nama parameter dipertahankan agar fungsi
     database tidak perlu diubah); database memeriksa tanda tangannya (SQL 009).
   - Hash PIN TIDAK lagi disimpan di perangkat.

   Dipakai sebagai skrip biasa:  <script src="/js/tof-sesi.js"></script>  -> window.TofSesi
   ============================================================ */
(function (global) {
  'use strict';

  var K_WALLET = 'tof_wallet';
  var K_USER = 'tof_login_username';
  var K_SESI = 'tof_session';
  var SEMUA = ['tof_wallet', 'tof_login_username', 'tof_level', 'tof_rank', 'tof_xp', 'tof_session', 'tof_user_session'];

  function baca(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function tulis(k, v) { try { global.localStorage.setItem(k, v); } catch (e) {} }
  function buang(k) { try { global.localStorage.removeItem(k); } catch (e) {} }

  function bacaToken() {
    var raw = baca(K_SESI);
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      if (o && typeof o.id === 'string' && typeof o.token === 'string' && typeof o.exp === 'number') return o;
    } catch (e) {}
    return null;
  }

  var PESAN = {
    not_found: 'Akun tidak ditemukan atau PIN salah!',
    ambiguous: 'Nama pengguna ambigu, tulis persis seperti saat daftar.',
    bad_pin_format: 'PIN harus 6 digit angka!',
    no_pin: 'PIN akun ini belum terdaftar di sistem baru. Masuk lewat halaman utama (tofarmer.xyz) untuk membuat PIN.',
    username_taken: 'Nama pengguna sudah dipakai orang lain. Coba nama lain ya!',
    wallet_taken: 'Alamat wallet ini sudah terdaftar.',
    bad_username: 'Nama pengguna 3-30 karakter: huruf, angka, atau _ (tanpa spasi).',
    bad_wallet: 'Alamat wallet tidak valid.',
    bad_mnemonic: 'Frasa dompet tidak valid.',
    reset_required: 'Akun ini punya brankas frasa. PIN-nya harus direset pengurus dulu.',
    network: 'Koneksi bermasalah, coba lagi.',
    empty: 'Server tidak menjawab, coba lagi.'
  };

  var TofSesi = {
    // Siapa yang login (null bila belum). Token basi dibersihkan bila tidak ada yang login.
    ambil: function () {
      var id = baca(K_WALLET), u = baca(K_USER);
      if (!id || !u) { if (baca(K_SESI)) buang(K_SESI); return null; }
      return { id: id, username: u };
    },

    // Token sesi yang masih berlaku untuk akun yang login (null bila tidak ada/kedaluwarsa)
    token: function () {
      var s = this.ambil();
      if (!s) return null;
      var t = bacaToken();
      if (!t || t.id !== s.id) return null;
      if (t.exp * 1000 <= Date.now() + 60000) return null;
      return t.token;
    },

    // Simpan hasil login/daftar dari server
    simpan: function (profile, session) {
      tulis(K_WALLET, profile.id);
      tulis(K_USER, profile.username);
      if (session && session.token) {
        tulis(K_SESI, JSON.stringify({ id: profile.id, token: session.token, exp: session.exp }));
      } else {
        buang(K_SESI);
      }
    },

    hapusToken: function () { buang(K_SESI); },

    // Keluar dari semua halaman sekaligus
    hapus: function () { for (var i = 0; i < SEMUA.length; i++) buang(SEMUA[i]); },

    keLogin: function () {
      global.location.href = '/html/login.html?next=' + encodeURIComponent(global.location.pathname + global.location.search);
    },

    // kred: { username | profile_id, pin }. profile_id = alamat wallet (mis. dari Kartu QR)
    login: function (client, kred) {
      var body = { action: 'login', pin: kred.pin };
      if (kred.profile_id) body.profile_id = kred.profile_id; else body.username = kred.username;
      return client.functions.invoke('tof-vault', { body: body }).then(function (r) {
        if (r.error) return { ok: false, error: 'network' };
        var d = r.data || { ok: false, error: 'empty' };
        if (d.ok && d.profile) TofSesi.simpan(d.profile, d.session);
        return d;
      }).catch(function () { return { ok: false, error: 'network' }; });
    },

    // data: { username, pin, mnemonic | wallet }
    daftar: function (client, data) {
      var body = { action: 'register', username: data.username, pin: data.pin };
      if (data.mnemonic) body.mnemonic = data.mnemonic; else body.wallet = data.wallet;
      return client.functions.invoke('tof-vault', { body: body }).then(function (r) {
        if (r.error) return { ok: false, error: 'network' };
        var d = r.data || { ok: false, error: 'empty' };
        if (d.ok && d.profile) TofSesi.simpan(d.profile, d.session);
        return d;
      }).catch(function () { return { ok: false, error: 'network' }; });
    },

    pesan: function (res) {
      var e = res && res.error;
      if (e === 'bad_pin') return 'PIN salah! (sisa percobaan: ' + (res.left == null ? '?' : res.left) + ')';
      if (e === 'locked') return 'Terlalu banyak salah PIN. Coba lagi ' + (res.retry_min || 15) + ' menit lagi.';
      return PESAN[e] || ('Gagal: ' + (e || 'tidak diketahui'));
    },

    // Buang sisa hash PIN yang dulu disimpan halaman-halaman lama (hash = setara PIN)
    bersihkanHashLama: function () {
      try {
        var ls = global.localStorage, hapusKunci = [];
        for (var i = 0; i < ls.length; i++) {
          var k = ls.key(i);
          if (k && (k.indexOf('olahrasa_pinh_') === 0 || k === 'tof_tracker_session')) hapusKunci.push(k);
        }
        for (var j = 0; j < hapusKunci.length; j++) ls.removeItem(hapusKunci[j]);
      } catch (e) {}
    }
  };

  TofSesi.bersihkanHashLama();
  global.TofSesi = TofSesi;
})(window);
