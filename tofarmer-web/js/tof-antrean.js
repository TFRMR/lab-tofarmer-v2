/* ============================================================
   tof-antrean.js — Penghitung "pekerjaan menunggu pengurus" di halaman pengurus.
   Dipasang HANYA di html/admin-topup.html:  <script src="/js/tof-antrean.js" defer></script>
   - Menampilkan lencana kecil di pojok kanan bawah dan angka di judul tab browser: "(3) ..."
   - Diperbarui tiap 90 detik dan saat tab dibuka kembali; tidak mengubah isi halaman, tidak memuat ulang.
   - Memakai fungsi database push_antrean (diperiksa token sesi + daftar pengurus); akun non-pengurus mendapat null.
   ============================================================ */
(function (global) {
  'use strict';
  var JUDUL_ASLI = document.title;
  var lencana = null;

  function baca(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }

  function sesi() {
    var id = baca('tof_wallet'); if (!id) return null;
    try {
      var o = JSON.parse(baca('tof_session') || 'null');
      if (o && o.id === id && typeof o.token === 'string' && o.exp * 1000 > Date.now() + 60000) return { id: id, token: o.token };
    } catch (e) {}
    return null;
  }

  function buatLencana() {
    if (lencana) return lencana;
    lencana = document.createElement('div');
    lencana.id = 'tof-antrean';
    lencana.style.cssText = 'position:fixed;right:12px;bottom:76px;z-index:99998;color:#fff;border-radius:999px;padding:8px 14px;' +
      'font:600 13px/1.3 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);display:none;pointer-events:none;';
    document.body.appendChild(lencana);
    return lencana;
  }

  function tampil(d) {
    var el = buatLencana();
    if (!d || !d.total) { el.style.display = 'none'; document.title = JUDUL_ASLI; return; }
    var lambat = d.terlambat || 0;
    el.style.display = 'block';
    el.style.background = lambat > 0 ? '#c0392b' : '#2f6f4e';
    el.textContent = '📋 ' + d.total + ' menunggu' + (lambat > 0 ? ' · ⏰ ' + lambat + ' terlambat' : '');
    document.title = '(' + d.total + ') ' + JUDUL_ASLI;
  }

  function segarkan() {
    var s = sesi(), c = global.supabaseClient;
    if (!s || !c) return;
    c.rpc('push_antrean', { p_id: s.id, p_token: s.token })
      .then(function (r) { if (!r.error) tampil(r.data); })
      .catch(function () {});
  }

  function mulai() {
    segarkan();
    setInterval(segarkan, 90 * 1000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) segarkan(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(mulai, 1500); });
  else setTimeout(mulai, 1500);
})(window);
