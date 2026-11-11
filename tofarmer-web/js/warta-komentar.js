/* Warta ToFarmer — komentar artikel.
   Dipakai di beranda (kartu Warta di feed) dan di halaman artikel.
   - Pengunjung: wajib mengetik nama.
   - Pengguna ToFarmer yang sudah masuk: langsung berkomentar, nama otomatis dan bertanda centang ✓.
   Membaca langsung dari Supabase (tabel artikel_komentar); menulis/menghapus lewat Edge Function tof-vault. */
(function () {
  if (window.WartaKomentar) return;

  var GAYA = '\
.wk{--wk-teks:#2c3a33;--wk-redup:#6f7f76;--wk-kartu:#ffffff;--wk-garis:rgba(0,0,0,.08);--wk-aksen:#2f6f4e;--wk-emas:#b5942b;--wk-input:#ffffff;font-size:13px;line-height:1.5;color:var(--wk-teks);text-align:left}\
.wk.wk-gelap{--wk-teks:#e2e8f0;--wk-redup:#94a3b8;--wk-kartu:rgba(18,32,24,.6);--wk-garis:rgba(74,222,128,.15);--wk-aksen:#4ade80;--wk-emas:#fde047;--wk-input:#0a0f0b}\
.wk-judul{font-weight:700;color:var(--wk-aksen);margin:0 0 10px;font-size:16px}\
.wk-daftar{display:flex;flex-direction:column;gap:10px;margin-bottom:12px}\
.wk-kosong{color:var(--wk-redup);font-size:12px}\
.wk-item{display:flex;gap:8px;align-items:flex-start}\
.wk-avatar{flex:0 0 26px;width:26px;height:26px;border-radius:50%;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center}\
.wk-isi{background:var(--wk-kartu);border:1px solid var(--wk-garis);border-radius:14px;padding:6px 12px;min-width:0;flex:1}\
.wk-kepala{display:flex;align-items:center;gap:6px;flex-wrap:wrap}\
.wk-kepala b{color:var(--wk-aksen)}\
.wk-centang{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:#2f9e6b;color:#fff;font-size:10px;font-weight:700}\
.wk-waktu{color:var(--wk-redup);font-size:11px}\
.wk .wk-hapus{width:auto;margin:0 0 0 auto;padding:0 4px;border:none;background:none;color:var(--wk-redup);cursor:pointer;font-size:13px}\
.wk-isi-teks{white-space:pre-wrap;word-break:break-word}\
.wk-form{display:flex;flex-direction:column;gap:8px;position:relative}\
.wk-sebagai{font-size:12px;color:var(--wk-redup)}\
.wk .wk-nama,.wk .wk-input-teks{width:100%;margin:0;padding:8px 12px;border:1px solid var(--wk-garis);border-radius:12px;background:var(--wk-input);color:var(--wk-teks);font:inherit;font-size:13px;outline:none;box-sizing:border-box;height:auto;min-height:0;box-shadow:none;line-height:1.5;transition:none}\
.wk .wk-input-teks{resize:none;max-height:160px;overflow-y:auto}\
.wk .wk-nama:focus,.wk .wk-input-teks:focus{border-color:var(--wk-emas)}\
.wk .wk-kirim{width:auto;margin:0;padding:7px 18px;border:none;border-radius:999px;background:linear-gradient(90deg,#4caf7a,#c9a227);color:#fff;font-weight:700;font-size:12px;cursor:pointer}\
.wk .wk-kirim[disabled]{opacity:.6;cursor:default}\
.wk-baris{display:flex;align-items:center;gap:10px;flex-wrap:wrap}\
.wk-info{font-size:12px;color:#c0392b}\
.wk-info a{color:var(--wk-aksen);font-weight:600}\
.wk-masuk{font-size:12px;color:var(--wk-redup)}\
.wk-masuk a{color:var(--wk-aksen);font-weight:600}\
.wk .wk-web{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}';

  var PESAN = {
    terlalu_cepat: 'Terlalu cepat, tunggu sebentar ya.',
    nama_tidak_valid: 'Nama harus 2–40 huruf dan tanpa tanda < >.',
    nama_dicadangkan: 'Nama itu dicadangkan. Pakai nama lain ya.',
    nama_milik_pengguna: 'Nama itu milik pengguna ToFarmer. Masuk untuk memakainya, atau pakai nama lain.',
    komentar_tidak_valid: 'Komentar kosong atau lebih dari 1000 huruf.',
    duplikat: 'Komentar yang sama sudah terkirim.',
    not_found: 'Artikel tidak ditemukan.',
    network: 'Gagal terhubung, coba lagi.'
  };

  function suntikGaya() {
    if (document.getElementById('wk-gaya')) return;
    var st = document.createElement('style'); st.id = 'wk-gaya'; st.textContent = GAYA; document.head.appendChild(st);
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function sesi() {
    try { var s = JSON.parse(localStorage.getItem('tof_session') || 'null'); if (s && s.id && s.token && Number(s.exp) * 1000 > Date.now()) return s; } catch (e) {}
    return null;
  }
  async function vault(action, body, denganSesi) {
    var s = denganSesi ? sesi() : null;
    if (denganSesi && !s) return { ok: false, error: 'sesi_tidak_valid' };
    try {
      var kirim = Object.assign({ action: action }, s ? { profile_id: s.id, token: s.token } : {}, body || {});
      var r = await supabaseClient.functions.invoke('tof-vault', { body: kirim });
      return r.error ? { ok: false, error: 'network' } : (r.data || { ok: false, error: 'network' });
    } catch (e) { return { ok: false, error: 'network' }; }
  }
  function waktuRelatif(iso) {
    var d = new Date(iso), s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (isNaN(s)) return '';
    if (s < 60) return 'baru saja';
    if (s < 3600) return Math.floor(s / 60) + ' menit lalu';
    if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
    if (s < 604800) return Math.floor(s / 86400) + ' hari lalu';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function warna(nama) { var h = 0; for (var i = 0; i < nama.length; i++) h = (h * 31 + nama.charCodeAt(i)) % 360; return 'hsl(' + h + ',45%,50%)'; }

  function itemHtml(c, boleh) {
    var hapus = (boleh.semua || (boleh.id && c.user_id && c.user_id === boleh.id))
      ? '<button type="button" class="wk-hapus" data-hapus="' + esc(c.id) + '" title="Hapus komentar">✕</button>' : '';
    return '<div class="wk-item" data-id="' + esc(c.id) + '">' +
      '<div class="wk-avatar" style="background:' + warna(c.nama) + '">' + esc(String(c.nama).charAt(0).toUpperCase()) + '</div>' +
      '<div class="wk-isi"><div class="wk-kepala"><b>' + (c.terverifikasi ? '@' : '') + esc(c.nama) + '</b>' +
      (c.terverifikasi ? '<span class="wk-centang" title="Pengguna ToFarmer">✓</span>' : '') +
      '<span class="wk-waktu">' + waktuRelatif(c.dibuat) + '</span>' + hapus + '</div>' +
      '<div class="wk-isi-teks">' + esc(c.komentar) + '</div></div></div>';
  }

  async function pasang(el, artikelId, opsi) {
    if (!el || !artikelId) return;
    opsi = opsi || {};
    suntikGaya();
    el.classList.add('wk');
    if (opsi.tema === 'gelap') el.classList.add('wk-gelap');

    var s = sesi(), tamu = !s, jumlah = 0;
    var boleh = { semua: false, id: s ? s.id : null };
    var namaTersimpan = '';
    try { namaTersimpan = localStorage.getItem('tof_nama_tamu') || ''; } catch (e) {}
    var urlLogin = '/html/login.html?next=' + encodeURIComponent(location.pathname + location.search);

    el.innerHTML =
      (opsi.tampilkanJudul ? '<div class="wk-judul">💬 Komentar <span data-jumlah></span></div>' : '') +
      '<div class="wk-daftar" data-daftar><div class="wk-kosong">Memuat komentar...</div></div>' +
      '<div class="wk-form">' +
        (tamu ? '<input type="text" class="wk-nama" maxlength="40" placeholder="Nama kamu (wajib)" value="' + esc(namaTersimpan) + '">'
              : '<div class="wk-sebagai" data-sebagai>Berkomentar sebagai akun ToFarmer-mu <span class="wk-centang">✓</span></div>') +
        '<input type="text" class="wk-web" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
        '<textarea class="wk-input-teks" rows="2" maxlength="1000" placeholder="Tulis komentar..."></textarea>' +
        '<div class="wk-baris"><button type="button" class="wk-kirim">Kirim</button><span class="wk-info" data-info></span></div>' +
        (tamu ? '<div class="wk-masuk">Punya akun ToFarmer? <a href="' + urlLogin + '">Masuk</a> agar komentarmu bercentang ✓</div>' : '') +
      '</div>';

    var daftar = el.querySelector('[data-daftar]');
    var info = el.querySelector('[data-info]');
    var teksEl = el.querySelector('.wk-input-teks');
    var tombol = el.querySelector('.wk-kirim');

    function perbarui() {
      var j = el.querySelector('[data-jumlah]'); if (j) j.textContent = '(' + jumlah + ')';
      if (typeof opsi.onJumlah === 'function') opsi.onJumlah(jumlah);
    }
    function tampilInfo(teks, tautanMasuk) {
      info.innerHTML = esc(teks) + (tautanMasuk ? ' <a href="' + urlLogin + '">Masuk lagi</a>' : '');
    }
    teksEl.addEventListener('input', function () { teksEl.style.height = 'auto'; teksEl.style.height = Math.min(teksEl.scrollHeight, 160) + 'px'; });

    // siapa yang masuk + apakah boleh menghapus semua komentar di artikel ini
    if (s) {
      var p = await vault('komentar_peran', { artikel_id: artikelId }, true);
      if (p && p.ok) {
        boleh = { semua: !!p.semua, id: p.id || s.id };
        var sb = el.querySelector('[data-sebagai]');
        if (sb && p.username) sb.innerHTML = 'Berkomentar sebagai <b>@' + esc(p.username) + '</b> <span class="wk-centang">✓</span>';
      }
    }

    var r;
    try { r = await supabaseClient.from('artikel_komentar').select('id,nama,komentar,terverifikasi,dibuat,user_id').eq('artikel_id', artikelId).order('dibuat', { ascending: true }).limit(300); }
    catch (e) { r = { error: e }; }
    if (r.error) { daftar.innerHTML = '<div class="wk-kosong">Komentar belum bisa dimuat.</div>'; }
    else {
      var data = r.data || [];
      jumlah = data.length; perbarui();
      daftar.innerHTML = data.length ? data.map(function (c) { return itemHtml(c, boleh); }).join('')
        : '<div class="wk-kosong" data-kosong>Belum ada komentar. Jadilah yang pertama.</div>';
    }

    tombol.onclick = async function () {
      var teks = teksEl.value.trim();
      var body = { artikel_id: artikelId, komentar: teks, website: (el.querySelector('.wk-web') || {}).value || '' };
      tampilInfo('');
      if (!teks) return tampilInfo('Tulis komentarnya dulu ya.');
      if (tamu) {
        var inNama = el.querySelector('.wk-nama'), n = inNama.value.trim();
        if (n.length < 2) { tampilInfo('Nama wajib diisi (minimal 2 huruf).'); inNama.focus(); return; }
        body.nama = n;
      }
      tombol.disabled = true; tampilInfo('Mengirim...');
      var h = await vault('komentar_kirim', body, !tamu);
      tombol.disabled = false;
      if (!h || !h.ok) return tampilInfo(PESAN[h && h.error] || (h && h.error === 'sesi_tidak_valid' ? 'Sesi habis.' : 'Gagal mengirim komentar.'), h && h.error === 'sesi_tidak_valid');
      tampilInfo('');
      if (h.diabaikan || !h.komentar) { teksEl.value = ''; return; }
      var kosong = el.querySelector('[data-kosong]'); if (kosong) kosong.remove();
      daftar.insertAdjacentHTML('beforeend', itemHtml(h.komentar, boleh));
      teksEl.value = ''; teksEl.style.height = '';
      jumlah++; perbarui();
      if (tamu) { try { localStorage.setItem('tof_nama_tamu', body.nama); } catch (e) {} }
    };

    daftar.addEventListener('click', async function (e) {
      var b = e.target.closest ? e.target.closest('[data-hapus]') : null;
      if (!b) return;
      if (!confirm('Hapus komentar ini?')) return;
      var h = await vault('komentar_hapus', { id: b.getAttribute('data-hapus') }, true);
      if (!h || !h.ok) return alert('Gagal menghapus komentar.');
      var item = b.closest('.wk-item'); if (item) item.remove();
      jumlah = Math.max(0, jumlah - 1); perbarui();
      if (!daftar.querySelector('.wk-item')) daftar.innerHTML = '<div class="wk-kosong" data-kosong>Belum ada komentar. Jadilah yang pertama.</div>';
    });
  }

  window.WartaKomentar = { pasang: pasang };
})();
