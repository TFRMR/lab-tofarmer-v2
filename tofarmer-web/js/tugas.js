/* Tugas ToFarmer — skrip bersama, dimuat otomatis lewat js/tof-install.js (Dompet memuatnya langsung).
   Tugas: kewajiban ringan bulanan sebagai syarat dividen. Aturan dan angka dijaga SERVER (Edge Function tof-vault).
   Skrip ini hanya:
   1. mencatat kunjungan: halaman yang dibuka (sah setelah tab aktif ~20 detik, sekali sehari per halaman) dan "aktif hari ini",
      memakai token sesi bertanda tangan (tof_session) sehingga tidak bisa mengaku atas nama orang lain;
   2. mencatat tindakan penting: elemen dengan atribut data-tugas="aksi:kode" atau panggilan TofTugas.catat('aksi:kode');
   3. menampilkan pop-up pengingat: tagihan pinjaman (bila ada) dan tugas bulan ini yang belum selesai.
   Fitur/halaman baru cukup memuat skrip ini: otomatis muncul di katalog admin-topup → Tugas berstatus "baru".
   Tanpa login (tof_wallet/tof_session kosong) skrip tidak melakukan apa pun. */
(function (global) {
  'use strict';
  if (global.TofTugas) return;
  var doc = global.document;
  var SUPABASE_URL = 'https://afpzddwuikvwsedzgsee.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmcHpkZHd1aWt2d3NlZHpnc2VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNTExNjEsImV4cCI6MjA5NDcyNzE2MX0.O_IezV8HpBjuZndnXosifts-jS7NnV4VtidyIX1KMHY';
  var K_WALLET = 'tof_wallet', K_SESI = 'tof_session', K_KIRIM = 'tof_tugas_kirim', K_POPUP = 'tof_tugas_popup', K_TAGIH = 'tof_tugas_tagih';
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
  function gaya(el, css) { el.style.cssText = css; return el; }
  function buat(tag, css, teks) { var e = doc.createElement(tag); if (css) e.style.cssText = css; if (teks != null) e.textContent = teks; return e; }
  function sheet(judul) {
    var lapis = gaya(doc.createElement('div'), 'position:fixed;inset:0;background:rgba(16,25,20,.45);display:flex;align-items:flex-end;justify-content:center;z-index:2147483000;font-family:Inter,system-ui,sans-serif;');
    var isi = gaya(doc.createElement('div'), 'width:100%;max-width:520px;max-height:88vh;overflow:auto;background:#fff;border-radius:22px 22px 0 0;padding:16px 16px 22px;color:#1c2b22;box-shadow:0 -10px 30px rgba(0,0,0,.2);');
    isi.appendChild(buat('div', 'font-size:16px;font-weight:700;color:#2f6f4e;margin-bottom:8px;', judul));
    lapis.appendChild(isi);
    lapis.addEventListener('click', function (e) { if (e.target === lapis) lapis.remove(); });
    doc.body.appendChild(lapis);
    return { isi: isi, tutup: function () { lapis.remove(); } };
  }
  function tombol(teks, utama, aksi) {
    var b = buat('button', 'width:100%;margin-top:10px;padding:12px;border:none;border-radius:14px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;' +
      (utama ? 'background:linear-gradient(90deg,#4caf7a,#c9a227);color:#fff;' : 'background:none;color:#6f7f76;'), teks);
    b.addEventListener('click', aksi); return b;
  }
  function rp(n) { return Number(n || 0).toLocaleString('id-ID'); }

  function popupTagihan(t) {
    var s = sheet('🔔 Tagihan pinjaman');
    var telat = (t.terlambat_hari || 0) > 0;
    s.isi.appendChild(buat('div', 'font-size:14px;font-weight:700;', telat ? 'Utangmu ke diri sendiri sudah telat ' + t.terlambat_hari + ' hari 😅' : 'Pinjamanmu jatuh tempo'));
    s.isi.appendChild(buat('div', 'font-size:13px;color:#445;margin-top:6px;line-height:1.5;', 'Total Rp ' + rp(t.total_rp) + ' (pokok Rp ' + rp(t.pokok_rp) + ' + bunga Rp ' + rp(t.bunga_rp) + '). Bunganya kembali ke dompetmu sebagai TOF.'));
    s.isi.appendChild(tombol('Buka Dompet untuk melunasi', true, function () { global.location.href = '/html/dompet.html'; }));
    s.isi.appendChild(tombol('Nanti dulu', false, s.tutup));
  }

  function popupTugas(r) {
    var belum = (r.wajib || []).filter(function (x) { return !x.ok; });
    var s = sheet('🌱 Tugas bulan ini');
    var total = (r.wajib || []).length;
    s.isi.appendChild(buat('div', 'font-size:13px;color:#445;line-height:1.5;', (total - belum.length) + ' dari ' + total + ' tugas wajib selesai. Tugas yang belum lengkap membuat dividen ditahan.'));
    (r.ditahan || []).forEach(function (x) {
      s.isi.appendChild(buat('div', 'margin-top:8px;padding:8px 10px;background:#fff4d6;border-radius:10px;font-size:12px;color:#7a5d00;line-height:1.4;',
        'Dividen ' + x.label + ' ditahan (' + (x.jumlah_units / 1e6) + ' TOF). ' + x.tugas_kurang + (x.sisa_hari > 0 ? ' Hangus dalam ' + x.sisa_hari + ' hari.' : '')));
    });
    belum.slice(0, 6).forEach(function (x) {
      var baris = buat('div', 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 0;border-top:1px solid rgba(0,0,0,.07);font-size:13px;');
      baris.appendChild(buat('div', 'flex:1;min-width:0;', x.judul + (x.target > 1 ? ' (' + x.jumlah + '/' + x.target + ')' : '')));
      if (x.url) {
        var a = buat('a', 'background:#eef7f1;color:#2f6f4e;text-decoration:none;border-radius:10px;padding:7px 12px;font-size:12px;font-weight:700;white-space:nowrap;', 'Kerjakan');
        a.href = x.url; baris.appendChild(a);
      }
      s.isi.appendChild(baris);
    });
    if (belum.length > 6) s.isi.appendChild(buat('div', 'font-size:12px;color:#6f7f76;padding-top:6px;', '+' + (belum.length - 6) + ' tugas lain di kartu Tugas pada Dompet.'));
    s.isi.appendChild(tombol('Buka Dompet', true, function () { global.location.href = '/html/dompet.html'; }));
    s.isi.appendChild(tombol('Nanti dulu', false, s.tutup));
  }

  // Satu pop-up per halaman: tagihan pinjaman (paling lama sejam sekali per perangkat) didahulukan, lalu tugas (sekali sehari)
  function mulaiPopup() {
    var a = anggota();
    if (!a || !bolehHalaman() || adaDompet()) return; // Dompet punya kartu tersendiri
    global.setTimeout(function () {
      var jam = Number(baca(K_TAGIH) || 0);
      var tagih = Date.now() - jam > 3600000
        ? panggil('pinjam_tagihan', { profile_id: a.id }) : Promise.resolve({ ok: false });
      tagih.then(function (r) {
        if (r && r.ok && r.tagihan) { tulis(K_TAGIH, String(Date.now())); popupTagihan(r.tagihan); return; }
        if (baca(K_POPUP) === hari()) return;
        panggil('tugas_status', { profile_id: a.id }).then(function (s) {
          if (!s || !s.ok) return;
          var belum = (s.wajib || []).some(function (x) { return !x.ok; });
          if (!belum && !(s.ditahan || []).length) return;
          tulis(K_POPUP, hari()); popupTugas(s);
        });
      });
    }, 4000);
  }

  global.TofTugas = { catat: function (kode) { catat([{ kode: kode }]); } };
  function siap() { pasangAtribut(); mulaiKunjungan(); mulaiPopup(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', siap); else siap();
})(window);
