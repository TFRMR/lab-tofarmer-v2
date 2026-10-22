/* Tugas ToFarmer — skrip bersama, dimuat otomatis lewat js/tof-install.js (Dompet memuatnya langsung).
   Tugas: kewajiban ringan bulanan sebagai syarat dividen. Aturan dan angka dijaga SERVER (Edge Function tof-vault).
   Skrip ini hanya:
   1. mencatat kunjungan: halaman yang dibuka (sah setelah tab aktif ~20 detik, sekali sehari per halaman) dan "aktif hari ini",
      memakai token sesi bertanda tangan (tof_session) sehingga tidak bisa mengaku atas nama orang lain;
   2. mencatat tindakan penting: elemen dengan atribut data-tugas="aksi:kode" atau panggilan TofTugas.catat('aksi:kode');
   3. menampilkan pop-up: setiap halaman Profil dibuka atau di-refresh muncul SATU tugas (langkah-langkahnya sederhana) yang bisa ditutup
      dengan X; tagihan pinjaman (bila ada) didahulukan.
   Fitur/halaman baru cukup memuat skrip ini: otomatis muncul di katalog admin-topup → Tugas berstatus "baru".
   Tanpa login (tof_wallet/tof_session kosong) skrip tidak melakukan apa pun. */
(function (global) {
  'use strict';
  if (global.TofTugas) return;
  var doc = global.document;
  var SUPABASE_URL = 'https://afpzddwuikvwsedzgsee.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmcHpkZHd1aWt2d3NlZHpnc2VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNTExNjEsImV4cCI6MjA5NDcyNzE2MX0.O_IezV8HpBjuZndnXosifts-jS7NnV4VtidyIX1KMHY';
  var K_WALLET = 'tof_wallet', K_SESI = 'tof_session', K_KIRIM = 'tof_tugas_kirim', K_TAGIH = 'tof_tugas_tagih';
  var DETIK_AKTIF = 20;
  var KECUALI = /admin|login|debug|diagnosa|celebrate|youtubedownloader|transfer-masal|titik-kumpul/;

  function baca(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function tulis(k, v) { try { global.localStorage.setItem(k, v); } catch (e) {} }
  function hari() { return new Date().toISOString().slice(0, 10); }
  function jalur() { return (global.location.pathname || '/').toLowerCase().replace(/\/index\.html$/, '/'); }
  function bolehHalaman() { return !KECUALI.test(jalur()); }
  function adaDompet() { return /dompet\.html$/.test(jalur()); }

  function anggota() {
    var id = baca(K_WALLET), raw = baca(K_SESI);
    if (!id || !raw) return null;
    try {
      var s = JSON.parse(raw);
      if (s && s.id === id && typeof s.token === 'string' && typeof s.exp === 'number' && s.exp * 1000 > Date.now() + 60000) return { id: id, token: s.token };
    } catch (e) {}
    return null;
  }

  function panggil(action, body) {
    var payload = {}; for (var k in body) payload[k] = body[k]; payload.action = action;
    return global.fetch(SUPABASE_URL + '/functions/v1/tof-vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); }).catch(function () { return { ok: false, error: 'network' }; });
  }

  // Menghindari kiriman berulang di perangkat yang sama (server tetap membatasi sekali sehari)
  function sudahKirim(kode) {
    try { var o = JSON.parse(baca(K_KIRIM) || '{}'); return o.hari === hari() && o.kode && o.kode[kode]; } catch (e) { return false; }
  }
  function tandaiKirim(kode) {
    var o; try { o = JSON.parse(baca(K_KIRIM) || '{}'); } catch (e) { o = {}; }
    if (o.hari !== hari()) o = { hari: hari(), kode: {} };
    o.kode[kode] = 1; tulis(K_KIRIM, JSON.stringify(o));
  }

  function lepasTanda(kode) {
    try { var o = JSON.parse(baca(K_KIRIM) || '{}'); if (o.kode) { delete o.kode[kode]; tulis(K_KIRIM, JSON.stringify(o)); } } catch (e) {}
  }

  function catat(daftar) {
    var a = anggota(); if (!a) return;
    var baru = (daftar || []).filter(function (x) { return x && x.kode && !sudahKirim(x.kode); }).slice(0, 5);
    if (!baru.length) return;
    baru.forEach(function (x) { tandaiKirim(x.kode); }); // ditandai SEBELUM kirim agar klik cepat berulang tidak terkirim dua kali
    panggil('tugas_catat', { profile_id: a.id, token: a.token, daftar: baru }).then(function (r) {
      if (!(r && r.ok)) baru.forEach(function (x) { lepasTanda(x.kode); }); // gagal: boleh dicoba lagi
    });
  }

  // ---- 1. kunjungan: sah setelah tab aktif DETIK_AKTIF detik ----
  function mulaiKunjungan() {
    if (!bolehHalaman() || !anggota()) return;
    var detik = 0, terkirim = false;
    var t = global.setInterval(function () {
      if (doc.visibilityState === 'visible') detik++;
      if (!terkirim && detik >= DETIK_AKTIF) {
        terkirim = true; global.clearInterval(t);
        catat([{ kode: 'aktif' }, { kode: 'fitur:' + jalur(), judul: (doc.title || '').slice(0, 80) }]);
      }
    }, 1000);
  }

  // ---- 2. tindakan penting: data-tugas="aksi:kode" ----
  function pasangAtribut() {
    doc.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-tugas]') : null;
      if (el) catat([{ kode: el.getAttribute('data-tugas') }]);
    }, true);
  }

  // ---- 3. pop-up ----
  // Aturan: tugas ditampilkan SATU per satu (yang pertama belum selesai), bahasa sederhana + langkah-langkah, dan muncul setiap
  // halaman Profil dibuka atau di-refresh (tidak dibatasi sehari sekali). Bila belum mau dikerjakan, cukup ditutup dengan tombol X.
  function adaProfil() { return /^\/profile(\.html)?\/?$/.test(jalur()); }
  function buat(tag, css, teks) { var e = doc.createElement(tag); if (css) e.style.cssText = css; if (teks != null) e.textContent = teks; return e; }
  function sheet(judul, setelah) {
    var lapis = buat('div', 'position:fixed;inset:0;background:rgba(16,25,20,.5);display:flex;align-items:flex-end;justify-content:center;z-index:2147483000;font-family:Inter,system-ui,sans-serif;');
    var isi = buat('div', 'width:100%;max-width:520px;max-height:90vh;overflow:auto;background:#fff;border-radius:22px 22px 0 0;padding:14px 18px 24px;color:#1c2b22;box-shadow:0 -10px 30px rgba(0,0,0,.25);');
    var kepala = buat('div', 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;');
    kepala.appendChild(buat('div', 'font-size:13px;font-weight:700;color:#2f6f4e;', judul));
    var x = buat('button', 'width:40px;height:40px;border:none;border-radius:50%;background:#f0f3f1;color:#445;font-size:18px;cursor:pointer;flex:none;', '✕');
    x.setAttribute('aria-label', 'Tutup'); x.setAttribute('data-tutup', '1');
    var sudah = false;
    function tutup() { if (sudah) return; sudah = true; lapis.remove(); if (setelah) setelah(); }
    x.addEventListener('click', tutup);
    kepala.appendChild(x); isi.appendChild(kepala); lapis.appendChild(isi);
    lapis.addEventListener('click', function (e) { if (e.target === lapis) tutup(); });
    doc.body.appendChild(lapis);
    return { isi: isi, tutup: tutup };
  }
  function tombol(teks, utama, aksi) {
    var b = buat('button', 'width:100%;margin-top:12px;padding:15px;border:none;border-radius:16px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;' +
      (utama ? 'background:linear-gradient(90deg,#4caf7a,#c9a227);color:#fff;' : 'background:none;color:#6f7f76;font-size:14px;padding:10px;'), teks);
    b.addEventListener('click', aksi); return b;
  }
  function rp(n) { return Number(n || 0).toLocaleString('id-ID'); }

  function popupTagihan(t, lanjut) {
    var s = sheet('🔔 Tagihan pinjaman', lanjut);
    var telat = (t.terlambat_hari || 0) > 0;
    s.isi.appendChild(buat('div', 'font-size:18px;font-weight:700;line-height:1.3;', telat ? 'Utangmu ke diri sendiri sudah telat ' + t.terlambat_hari + ' hari 😅' : 'Pinjamanmu sudah jatuh tempo'));
    s.isi.appendChild(buat('div', 'font-size:15px;color:#445;margin-top:8px;line-height:1.5;', 'Total Rp ' + rp(t.total_rp) + ' (pokok Rp ' + rp(t.pokok_rp) + ' + bunga Rp ' + rp(t.bunga_rp) + '). Bunganya kembali ke dompetmu sebagai TOF.'));
    s.isi.appendChild(tombol('Buka Dompet untuk melunasi', true, function () { global.location.href = '/html/dompet.html'; }));
    s.isi.appendChild(tombol('Nanti saja', false, s.tutup));
  }

  // Satu tugas: judul besar, keterangan, langkah bernomor, satu tombol besar
  function popupTugas(r) {
    var x = r.berikutnya;
    var s = sheet(x ? '🌱 Tugas untukmu (' + Math.min((r.selesai || 0) + 1, r.total || 1) + ' dari ' + (r.total || 1) + ')' : '🌱 Tugas');
    if (x) {
      var bar = buat('div', 'height:8px;background:#eef2ef;border-radius:8px;overflow:hidden;margin:2px 0 12px;');
      bar.appendChild(buat('div', 'height:100%;background:linear-gradient(90deg,#4caf7a,#c9a227);width:' + Math.round(((r.selesai || 0) * 100) / Math.max(r.total || 1, 1)) + '%;'));
      s.isi.appendChild(bar);
      s.isi.appendChild(buat('div', 'font-size:21px;font-weight:800;line-height:1.25;color:#1c2b22;', x.judul));
      if (x.deskripsi) s.isi.appendChild(buat('div', 'font-size:15px;color:#445;margin-top:8px;line-height:1.5;', x.deskripsi));
      if (x.target > 1) s.isi.appendChild(buat('div', 'font-size:14px;font-weight:700;color:#2f6f4e;margin-top:8px;', 'Baru ' + (x.jumlah || 0) + ' dari ' + x.target + '.'));
      var langkah = String(x.petunjuk || '').split('\n').filter(function (l) { return l.trim(); });
      if (langkah.length) {
        s.isi.appendChild(buat('div', 'font-size:14px;font-weight:700;margin-top:14px;', 'Caranya:'));
        var ol = buat('ol', 'margin:6px 0 0;padding-left:22px;font-size:15px;line-height:1.7;');
        langkah.forEach(function (l) { ol.appendChild(buat('li', '', l.trim())); });
        s.isi.appendChild(ol);
      }
      if (x.url) {
        var di = jalur() === String(x.url).toLowerCase();
        s.isi.appendChild(tombol(di ? 'Oke, mengerti' : 'Kerjakan sekarang', true, function () { if (di) s.tutup(); else global.location.href = x.url; }));
      } else {
        s.isi.appendChild(buat('div', 'font-size:14px;color:#6f7f76;margin-top:12px;', 'Tugas ini diurus bersama pengurus. Tanyakan caranya ke pengurus.'));
      }
    }
    (r.ditahan || []).forEach(function (d) {
      s.isi.appendChild(buat('div', 'margin-top:14px;padding:10px 12px;background:#fff4d6;border-radius:12px;font-size:13px;color:#7a5d00;line-height:1.45;',
        'Dividen ' + d.label + ' (' + (d.jumlah_units / 1e6) + ' TOF) sedang ditahan sampai tugasmu selesai.' + (d.sisa_hari > 0 ? ' Hangus dalam ' + d.sisa_hari + ' hari.' : '')));
    });
    s.isi.appendChild(tombol('Nanti saja', false, s.tutup));
  }

  function tampilTugas(a) {
    panggil('tugas_status', { profile_id: a.id }).then(function (r) {
      if (!r || !r.ok) return;
      if (!r.berikutnya && !(r.ditahan || []).length) return; // semua beres: tidak ada yang perlu ditampilkan
      popupTugas(r);
    });
  }

  // Profil dibuka/di-refresh -> tagihan pinjaman (bila ada) lalu SATU tugas. Halaman lain: hanya tagihan pinjaman (paling sering sekali sejam).
  function mulaiPopup() {
    var a = anggota();
    if (!a || !bolehHalaman() || adaDompet()) return; // Dompet punya kartu tersendiri
    var profil = adaProfil();
    global.setTimeout(function () {
      var perlu = profil || Date.now() - Number(baca(K_TAGIH) || 0) > 3600000;
      (perlu ? panggil('pinjam_tagihan', { profile_id: a.id }) : Promise.resolve({ ok: false })).then(function (r) {
        var lanjut = function () { if (profil) tampilTugas(a); };
        if (r && r.ok && r.tagihan) { tulis(K_TAGIH, String(Date.now())); popupTagihan(r.tagihan, lanjut); return; }
        lanjut();
      });
    }, profil ? 1200 : 4000);
  }

  global.TofTugas = { catat: function (kode) { catat([{ kode: kode }]); } };
  function siap() { pasangAtribut(); mulaiKunjungan(); mulaiPopup(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', siap); else siap();
})(window);
