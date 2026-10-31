// ============================================================
// Halaman pengurus — Nabung TOF
// Alur: anggota membayar ke QRIS → pengurus mencocokkan dengan MUTASI e-wallet/rekening kas → Konfirmasi
//       → pengurus mengirim TOF dari dompet kas → mencatat ID transaksi → Selesai.
// Semua perintah lewat Edge Function "tof-vault" (PIN pengurus diperiksa di server).
// ============================================================
(function () {
  "use strict";
  const CFG = window.ADMIN_CONFIG || {};
  const EXPLORER_TX = "https://allo.info/tx/";
  const $ = (id) => document.getElementById(id);
  const state = { wallet: null, pin: "", tab: "aktif", qrisBaru: null, pesanHasil: "", modeKirim: "tampung", alamatPenampung: "" };
  const TOF_ASSET_ID = 3558306283;
  const ALGOD = CFG.algod || "https://mainnet-api.algonode.cloud";

  function el(tag, props, ...anak) {
    const e = document.createElement(tag);
    if (props) for (const k of Object.keys(props)) {
      const v = props[k];
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e[k] = v;
      else if (v === true) e.setAttribute(k, "");
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const a of anak.flat()) { if (a == null || a === false) continue; e.append(a.nodeType ? a : document.createTextNode(String(a))); }
    return e;
  }

  const fmtRp = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  // unit terkecil (6 desimal) → "10,037" (tanpa pemisah ribuan, aman untuk diisikan ke form Kirim)
  function desimal(u) {
    u = BigInt(u);
    const w = (u / 1000000n).toString();
    const f = (u % 1000000n).toString().padStart(6, "0").replace(/0+$/, "");
    return f ? w + "," + f : w;
  }
  const tgl = (s) => new Date(s).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

  async function adm(action, extra) {
    try {
      const { data, error } = await supabaseClient.functions.invoke("tof-vault", {
        body: Object.assign({ action, profile_id: state.wallet, pin: state.pin }, extra || {})
      });
      if (error) { console.log(error); return { ok: false, error: "network" }; }
      return data || { ok: false, error: "empty" };
    } catch (e) { console.log(e); return { ok: false, error: "network" }; }
  }

  function pesan(res) {
    switch (res.error) {
      case "admin_belum_diatur": return "Belum ada pengurus yang diatur (secret ADMIN_IDS kosong).";
      case "bukan_admin": return "Alamat dompetmu belum terdaftar sebagai pengurus.";
      case "bad_pin": return "PIN salah (sisa percobaan: " + (res.left == null ? "?" : res.left) + ")";
      case "locked": return "Terlalu banyak salah PIN. Coba lagi " + (res.retry_min || 15) + " menit lagi.";
      case "pin_publik": return "PIN pengurus belum aman: buat PIN dompet baru dulu di menu Frasa pada Dompet.";
      case "tidak_boleh_konfirmasi_sendiri": return "Setoran sendiri harus dikonfirmasi pengurus lain.";
      case "kedaluwarsa": return "Tagihan sudah kedaluwarsa. Minta anggota membuat tagihan baru.";
      case "status_tidak_cocok": return "Status tagihan sudah berubah. Muat ulang daftar.";
      case "bad_txid": return "ID transaksi harus 52 karakter (huruf besar A–Z dan angka 2–7).";
      case "txid_sudah_dipakai": return "ID transaksi ini sudah dipakai untuk tagihan lain.";
      case "alasan_wajib": return "Alasan penolakan wajib diisi.";
      case "kurs_tidak_valid": return "Kurs harus bilangan bulat rupiah per 1 TOF.";
      case "batas_tidak_valid": return "Batas minimal/maksimal tidak valid (minimal tidak boleh lebih besar dari maksimal).";
      case "qris_tidak_valid": return "Gambar QRIS tidak valid atau terlalu besar.";
      case "alamat_tarik_belum_diatur": return "Isi alamat dompet pengurus penerima TOF penarikan dulu.";
      case "batas_tarik_tidak_valid": return "Batas tarik tidak valid (bilangan bulat TOF; minimal tidak boleh lebih besar dari maksimal).";
      case "ref_wajib": return "Isi referensi pembayaran (mis. ID transaksi DANA / waktu kirim).";
      case "tidak_boleh_proses_sendiri": return "Penarikan sendiri harus diproses pengurus lain.";
      case "penampung_belum_diatur": return "Isi alamat dompet penampung dulu (mode tampung).";
      case "alamat_tidak_valid": return "Alamat dompet tidak valid.";
      case "mode_tidak_valid": return "Mode kirim tidak dikenal.";
      case "ambang_tidak_valid": return "Ambang minimal harus bilangan bulat TOF.";
      case "belum_cukup": return "Setoran tertampung belum mencapai ambang minimal.";
      case "batch_masih_terbuka": return "Masih ada batch yang terbuka. Selesaikan atau batalkan dulu.";
      case "batch_belum_siap": return "Batch belum dinyatakan ditopup ke akun investasi.";
      case "hasil_kosong": return "Tidak ada hasil untuk dicatat.";
      case "kas_belum_diatur": return "Dompet pembayar belum diatur di server (secret PAYOUT_MNEMONIC).";
      case "batas_kirim_tidak_valid": return "Batas kirim tidak valid (bilangan bulat TOF; batas per transaksi tidak boleh melebihi batas harian).";
      case "konfirmasi_wajib": return "Perlu konfirmasi eksplisit.";
      case "tugas_belum_selesai": return "Tugas yang menunggak belum selesai: " + ((res.kurang || []).join("; ") || "-") + ". Gunakan Lepas paksa bila pengurus memutuskan lain.";
      case "belum_waktunya": return "Belum bisa dihanguskan: masa tahan masih " + (res.sisa_hari || 0) + " hari lagi.";
      case "bulan_tidak_valid": return "Bulan tugas tidak valid.";
      case "kode_tugas_tidak_valid": return "Kode tugas tidak valid. Contoh: manual:kerja_bakti, hadir:rapat, aksi:nama, fitur:/html/halaman.html.";
      case "jenis_tidak_valid": return "Jenis tugas tidak valid.";
      case "judul_wajib": return "Isi judulnya.";
      case "target_tidak_valid": return "Target harus bilangan bulat 1–100 (minimal kelompok 1–20).";
      case "status_tidak_valid": return "Status tugas tidak valid.";
      case "url_tidak_valid": return "Tautan harus diawali garis miring, mis. /html/dompet.html.";
      case "waktu_tidak_valid": return "Waktu kegiatan tidak valid (selesai harus setelah mulai, maksimal 3 hari).";
      case "tugas_tidak_ditemukan": return "Tugas tidak ditemukan atau jenisnya tidak cocok.";
      case "tidak_bisa_dihapus": return "Tugas bawaan, sistem, dan halaman tidak dihapus karena akan terdaftar lagi otomatis. Arsipkan saja.";
      case "masih_dipakai": return "Tugas ini masih mengikat " + (res.jumlah || 0) + " dividen yang ditahan. Arsipkan saja, atau lepas/hanguskan dulu dividen itu.";
      case "label_wajib": return "Isi nama periode.";
      case "label_sudah_dipakai": return "Nama periode itu sudah dipakai. Pakai nama lain.";
      case "persen_tidak_valid": return "Persentase tidak valid (maksimal 100%, tidak boleh 0).";
      case "minus_melebihi_batas": return "Koreksi minus melebihi batas " + (res.batas_persen || 0) + "% per periode. Ubah batas di Pengaturan bila memang perlu.";
      case "periode_masih_terbuka": return "Masih ada periode yang belum selesai. Selesaikan atau batalkan dulu.";
      case "periode_tidak_ditemukan": return "Periode tidak ditemukan.";
      case "item_tidak_ditemukan": return "Peserta tidak ditemukan.";
      case "tidak_ada_peserta": return "Tidak ada peserta yang memenuhi syarat.";
      case "perlu_pengurus_lain": return "Persetujuan harus dari pengurus lain, bukan pembuat pratinjau.";
      case "sudah_berjalan": return "Periode sudah berjalan, tidak bisa dibatalkan.";
      case "kas_tof_kurang": return "TOF di dompet pembayar kurang: butuh " + desimal(res.butuh_units || 0) + ", ada " + desimal(res.ada_units || 0) + ".";
      case "kas_algo_kurang": return "ALGO bebas di dompet pembayar kurang untuk biaya: butuh " + desimal(res.butuh_units || 0) + ", ada " + desimal(res.ada_units || 0) + ".";
      case "batas_dividen_tidak_valid": return "Batas dividen tidak valid (batas minus 1–50%, saldo minimum bilangan bulat).";
      case "txid_belum_ada": return "Transaksi ini belum punya ID transaksi untuk diperiksa.";
      case "pinjam_tidak_ditemukan": return "Pinjaman tidak ditemukan.";
      case "pinjam_belum_aktif": return "Pinjaman ini belum dicairkan.";
      case "jaminan_kurang": return "TOF jaminan anggota sudah tidak ada di dompetnya (butuh " + ((res.jaminan_units || 0) / 1e6) + " TOF, ada " + ((res.saldo_units || 0) / 1e6) + "). Jangan kirim uang; tolak pengajuan ini.";
      case "bunga_sudah_terkirim": return "Bunga untuk pinjaman ini sudah terkirim.";
      case "batas_pinjam_tidak_valid": return "Batas pinjaman tidak valid (bilangan bulat rupiah; minimal tidak boleh lebih besar dari maksimal).";
      // [CICILAN]
      case "tenggang_tidak_valid": return "Masa tenggang tidak valid (1–365 hari).";
      case "belum_lewat_tenggang": return "Belum lewat masa tenggang" + (res.potong_pada ? ": TOF baru boleh dipotong setelah " + tgl(res.potong_pada) + "." : ".");
      case "sedang_dipotong": return "Pinjaman ini sedang dalam proses potong TOF. Periksa dulu hasilnya sebelum melunasi.";
      case "tidak_berhak": return "Tidak berhak.";
      // [RESET PIN]
      case "not_found": return "Username tidak ditemukan.";
      case "ambiguous": return "Username ambigu, tulis persis seperti saat anggota mendaftar.";
      case "target_pengurus": return "Akun pengurus tidak bisa direset lewat sini.";
      case "tidak_bisa_diri_sendiri": return "Tidak bisa mereset akun sendiri.";
      case "network": return "Koneksi bermasalah, coba lagi.";
      default: return "Gagal: " + (res.error || "tidak diketahui");
    }
  }

  const STATUS = { ditampung: ["TOF ditampung (menunggu pembagian)", "ok"], mengirim: ["TOF sedang dikirim / perlu dicek", "tunggu"], menunggu: ["Menunggu pembayaran", "tunggu"], dibayar: ["Anggota bilang sudah bayar", "tunggu"], dikonfirmasi: ["Terkonfirmasi, TOF belum dikirim", "ok"],
    selesai: ["Selesai", "ok"], ditolak: ["Ditolak", "gagal"], dibatalkan: ["Dibatalkan", "gagal"], kedaluwarsa: ["Kedaluwarsa", "gagal"] };
  const STATUS_TARIK = { menunggu_tof: ["Menunggu TOF dikirim anggota", "tunggu"], tof_dikirim: ["TOF dilaporkan, belum terverifikasi", "tunggu"], tof_diterima: ["TOF terverifikasi, uang belum dikirim", "ok"],
    dibayar: ["Uang sudah dikirim", "ok"], ditolak: ["Ditolak", "gagal"], dibatalkan: ["Dibatalkan", "gagal"], kedaluwarsa: ["Kedaluwarsa", "gagal"] };
  const chipTarik = (st) => { const [t, k] = STATUS_TARIK[st] || [st, ""]; return el("span", { class: "chip " + k, text: t }); };
  const chip = (s) => { const [t, k] = STATUS[s] || [s, ""]; return el("span", { class: "chip " + k, text: t }); };

  function ringkasHasil(res, r) {
    const p = res && res.payout;
    const nama = "@" + (r.username || "?");
    if (!p) return "";
    if (p.status === "selesai") return "Dikonfirmasi. TOF terkirim otomatis ke " + nama + " (ID transaksi: " + p.txid + ").";
    if (p.status === "mengirim") return "Dikonfirmasi. TOF sedang dikirim ke " + nama + ". " + (p.alasan || "") + " Cek tab 'Perlu kirim TOF'.";
    return "Dikonfirmasi, tetapi TOF belum terkirim otomatis ke " + nama + ": " + (p.alasan || "tidak diketahui") + " Lihat tab 'Perlu kirim TOF'.";
  }

  // ---------------- daftar ----------------
  function kartu(r, tab) {
    const galat = el("div", { class: "galat" });
    const aksi = el("div", { class: "aksi" });
    const k = el("div", { class: "card", "data-id": r.id },
      el("div", { class: "baris" }, el("div", { text: "@" + (r.username || "?") + " · " + tgl(r.dibuat) }), chip(r.status)),
      el("div", { class: "total", text: "Rp " + fmtRp(r.total_rp) }),
      el("div", { class: "kecil", text: "TOF yang harus dikirim: " + desimal(r.tof_units) + " (nominal Rp " + fmtRp(r.nominal_rp) + " + kode unik " + r.kode_unik + ")" }),
      r.ref_user ? el("div", { class: "kecil", text: "Catatan anggota: " + r.ref_user }) : null,
      r.catatan_admin ? el("div", { class: "kecil", text: "Catatan pengurus: " + r.catatan_admin }) : null,
      aksi, galat);

    const jalan = async (tombol, action, extra) => {
      tombol.disabled = true; galat.textContent = "";
      const res = await adm(action, extra);
      tombol.disabled = false;
      if (!res.ok) { galat.textContent = pesan(res); return; }
      if (res.payout) state.pesanHasil = ringkasHasil(res, r);
      else if (res.hasil) state.pesanHasil = res.hasil === "confirmed" ? "TOF terkonfirmasi di jaringan. Selesai." : res.hasil === "rejected" ? "Transaksi ditolak jaringan. Coba kirim ulang." : "Belum terkonfirmasi di jaringan. Periksa lagi sebentar lagi.";
      muatTab(state.tab);
    };

    if (tab === "aktif") {
      aksi.append(
        el("button", { class: "btn hijau", "data-aksi": "konfirmasi", type: "button", text: "✓ Sudah masuk di kas", onclick: function () {
          if (!window.confirm("Pastikan mutasi/riwayat penerimaan e-wallet kas menunjukkan uang masuk Rp " + fmtRp(r.total_rp) + " PERSIS. Konfirmasi?")) return;
          jalan(this, "admin_topup_konfirmasi", { id: r.id });
        } }),
        el("button", { class: "btn merah", "data-aksi": "tolak", type: "button", text: "Tolak", onclick: function () {
          const alasan = window.prompt("Alasan penolakan:");
          if (!alasan) return;
          jalan(this, "admin_topup_tolak", { id: r.id, alasan });
        } }));
    } else if (tab === "perlu_kirim") {
      const txid = el("input", { class: "inp", "data-txid": "1", placeholder: "ID transaksi (bila sudah terkirim di luar sistem, 52 karakter)", autocomplete: "off", spellcheck: "false" });
      const tampung = state.modeKirim === "tampung";
      const tujuanManual = tampung ? state.alamatPenampung : r.profile_id;
      const link = "dompet.html?aset=TOF&ke=" + encodeURIComponent(tujuanManual) + "&jumlah=" + encodeURIComponent(desimal(r.tof_units)) + "&catatan=" + encodeURIComponent(r.catatan_transaksi || "");
      k.insertBefore(el("div", { class: "kecil mono", text: (tampung ? "Kirim ke DOMPET PENAMPUNG: " : "Kirim ke: ") + (tujuanManual || "(alamat penampung belum diatur)") }), aksi);
      k.insertBefore(el("div", { class: "kecil mono", text: "Catatan transaksi: " + (r.catatan_transaksi || "") }), aksi);
      if (r.kirim_catatan) k.insertBefore(el("div", { class: "galat", "data-catatan-kirim": "1", text: r.kirim_catatan }), aksi);
      if (r.status === "mengirim") {
        if (r.tof_txid) k.insertBefore(el("a", { class: "tautan", href: EXPLORER_TX + r.tof_txid, target: "_blank", rel: "noopener", text: "Lihat transaksi di explorer" }), aksi);
        aksi.append(
          el("button", { class: "btn hijau", "data-aksi": "periksa", type: "button", text: "Periksa status", onclick: function () { jalan(this, "admin_topup_periksa", { id: r.id }); } }),
          el("button", { class: "btn merah", "data-aksi": "reset", type: "button", text: "Kembalikan untuk kirim ulang", onclick: function () {
            if (!window.confirm("Pastikan di explorer TIDAK ADA transaksi TOF ke anggota ini untuk tagihan ini. Kalau ada, tekan Batal dan pakai 'Tandai selesai'. Lanjut mengembalikan?")) return;
            jalan(this, "admin_topup_reset_kirim", { id: r.id, yakin: true });
          } }));
      } else {
        aksi.append(
          el("button", { class: "btn hijau", "data-aksi": "kirim-ulang", type: "button", text: "Kirim otomatis lagi", onclick: function () { jalan(this, "admin_topup_kirim_ulang", { id: r.id }); } }),
          el("a", { class: "btn abu", "data-aksi": "kirim", href: link, text: "Kirim manual dari Dompet", style: "text-decoration:none;" }));
      }
      k.insertBefore(txid, galat);
      k.insertBefore(el("button", { class: "btn abu", "data-aksi": "selesai", type: "button", style: "margin-top:8px;", text: tampung ? "Tandai sudah ditampung (sudah terkirim)" : "Tandai selesai (sudah terkirim)", onclick: function () {
        jalan(this, "admin_topup_selesai", { id: r.id, txid: txid.value.trim() });
      } }), galat);
    } else if (r.tof_txid) {
      k.insertBefore(el("a", { class: "tautan", href: EXPLORER_TX + r.tof_txid, target: "_blank", rel: "noopener", text: "Lihat transaksi TOF" }), aksi);
    }
    return k;
  }

  async function muatTab(tab) {
    state.tab = tab;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("aktif", t.getAttribute("data-tab") === tab));
    const konten = $("konten");
    konten.replaceChildren(el("div", { class: "kecil", style: "padding:14px;", text: "Memuat…" }));
    if (tab === "pengaturan") return muatPengaturan();
    if (tab === "pembagian") return muatPembagian();
    if (tab === "penarikan") return muatPenarikan();
    if (tab === "pinjaman") return muatPinjaman();
    if (tab === "dividen") return muatDividen();
    if (tab === "tugas") return muatTugas();
    if (tab === "resetpin") return muatResetPin();
    const res = await adm("admin_topup_daftar", { tampil: tab });
    if (!res.ok) { konten.replaceChildren(el("div", { class: "galat", text: pesan(res) })); return; }
    state.modeKirim = res.mode_kirim || "tampung";
    state.alamatPenampung = res.alamat_penampung || "";
    konten.replaceChildren(...(res.daftar.length ? res.daftar.map((r) => kartu(r, tab)) : [el("div", { class: "kecil", id: "kosong", style: "padding:14px;", text: "Tidak ada data." })]));
    if (state.pesanHasil) {
      konten.prepend(el("div", { class: "card", id: "hasilAksi", style: "border-color:#4caf7a;", text: state.pesanHasil }));
      state.pesanHasil = "";
    }
  }

  // ---------------- Pembagian TOF per batch ----------------
  const desimalUnit = (u) => desimal(u);
  const tidur = (ms) => new Promise((res) => setTimeout(res, ms));
  const CEK_MS = CFG.jeda == null ? 1500 : CFG.jeda;

  async function algodGet(path) {
    const r = await fetch(ALGOD + path);
    if (!r.ok) throw new Error("algod " + r.status);
    return r.json();
  }
  async function ringkasAkun(addr) {
    const j = await algodGet("/v2/accounts/" + addr);
    const aset = (j.assets || []).find((a) => Number(a["asset-id"]) === TOF_ASSET_ID);
    return { algo: BigInt(j.amount || 0), minBal: BigInt(j["min-balance"] || 0), tof: aset ? BigInt(aset.amount || 0) : 0n, tofOptin: !!aset };
  }
  async function ambilParams() {
    const p = await algodGet("/v2/transactions/params");
    return { flatFee: true, fee: 1000, firstRound: p["last-round"], lastRound: p["last-round"] + 1000, genesisID: p["genesis-id"], genesisHash: p["genesis-hash"] };
  }
  function gabung(blobs) {
    const total = blobs.reduce((n, b) => n + b.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const b of blobs) { out.set(b, o); o += b.length; }
    return out;
  }
  async function kirimGrup(bytes) {
    let r;
    try {
      r = await fetch(ALGOD + "/v2/transactions", { method: "POST", headers: { "Content-Type": "application/x-binary" }, body: bytes });
    } catch (e) {
      throw new Error("Jaringan putus saat mengirim. Hasil tidak pasti: periksa dompet penampung di explorer sebelum mencoba lagi (mencoba lagi dalam ~45 menit aman karena transaksi memakai lease).");
    }
    if (!r.ok) throw new Error("Ditolak jaringan: " + ((await r.text().catch(() => "")) || "HTTP " + r.status));
  }
  async function tungguTx(txId) {
    for (let i = 0; i < 30; i++) {
      try {
        const j = await algodGet("/v2/transactions/pending/" + txId);
        if (j["pool-error"]) throw new Error(j["pool-error"]);
        if (j["confirmed-round"] > 0) return true;
      } catch (e) { if (!/algod 404/.test(String(e.message))) throw e; }
      await tidur(CEK_MS);
    }
    return false;
  }
  async function lease(id) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("distribusi:" + id)));
  }

  // [FRASA 24 KATA] Frasa 24 kata BIP39 (mis. Pera "Universal Wallet", jenis xHD) ditandatangani dengan pustaka kecil
  // /js/tof-xhd.js (satu situs, tanpa CDN). Dimuat hanya saat dibutuhkan. Frasa 25 kata tetap lewat algosdk seperti biasa.
  function muatXhd() {
    if (window.TofXhd) return Promise.resolve(window.TofXhd);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/js/tof-xhd.js";
      s.onload = () => (window.TofXhd ? resolve(window.TofXhd) : reject(new Error("Pustaka frasa 24 kata tidak termuat.")));
      s.onerror = () => reject(new Error("Pustaka frasa 24 kata (/js/tof-xhd.js) gagal dimuat."));
      document.head.appendChild(s);
    });
  }
  async function pulihXhd(rv) {
    const X = await muatXhd();
    const addr = algosdk.encodeAddress(X.xhdKunciPublik(rv.mnemonic, rv.xhd));
    return {
      addr,
      sk: null,
      xhd: { tandatangani: (txn) => txn.attachSignature(addr, X.xhdTandatangani(rv.mnemonic, rv.xhd, txn.bytesToSign())) }
    };
  }

  // Kirim TOF dari dompet penampung ke tiap anggota batch. Ditandatangani DI BROWSER pengurus pemilik dompet penampung:
  // frasa dibuka sebentar dengan PIN, dipakai menandatangani, lalu dihapus dari memori.
  async function bagikanBatch(batch, items, progres) {
    const rv = await adm("reveal");
    if (!rv.ok) throw new Error(pesan(rv));
    let sk = null;
    try {
      const pulih = rv.xhd ? await pulihXhd(rv) : algosdk.mnemonicToSecretKey(rv.mnemonic);
      if (String(pulih.addr) !== state.wallet) throw new Error("Frasa akun ini tidak cocok dengan alamat dompet.");
      sk = pulih.sk;
      progres("Memeriksa saldo dan opt-in anggota…");
      const menunggu = items.filter((i) => i.status === "ditampung");
      const kas = await ringkasAkun(state.wallet);
      const siap = [], lewati = [];
      for (const it of menunggu) { ((await ringkasAkun(it.profile_id)).tofOptin ? siap : lewati).push(it); }
      const total = siap.reduce((n, i) => n + BigInt(i.tof_units), 0n);
      if (kas.tof < total) throw new Error("Saldo TOF dompet penampung kurang: butuh " + desimal(total) + ", ada " + desimal(kas.tof) + ".");
      if (kas.algo - kas.minBal < BigInt(siap.length) * 1000n) throw new Error("Saldo ALGO dompet penampung kurang untuk biaya transaksi.");
      const tercatat = [], belum = [];
      for (let i = 0; i < siap.length; i += 16) {
        const grup = siap.slice(i, i + 16);
        progres("Mengirim " + (i + 1) + "–" + (i + grup.length) + " dari " + siap.length + "…");
        const sp = await ambilParams();
        const txns = [];
        for (const it of grup) {
          const tx = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
            from: state.wallet, to: it.profile_id, amount: BigInt(it.tof_units), assetIndex: TOF_ASSET_ID,
            note: new TextEncoder().encode(it.catatan_distribusi), suggestedParams: sp
          });
          tx.addLease(await lease(it.id)); // pencegah pengiriman ganda bila diulang
          txns.push(tx);
        }
        algosdk.assignGroupID(txns); // satu kelompok atomik: semua masuk atau tidak sama sekali
        const blobs = txns.map((t) => (pulih.xhd ? pulih.xhd.tandatangani(t) : t.signTxn(sk)));
        await kirimGrup(gabung(blobs));
        const hasil = grup.map((it, k) => ({ id: it.id, txid: txns[k].txID() }));
        if (!(await tungguTx(hasil[0].txid))) { belum.push(...grup.map((g) => g.username + ": belum terkonfirmasi")); continue; }
        const cat = await adm("admin_batch_catat", { batch_id: batch.id, hasil });
        if (!cat.ok) { belum.push(...grup.map((g) => g.username + ": gagal dicatat (" + pesan(cat) + ")")); continue; }
        tercatat.push(...cat.tercatat);
        for (const b of cat.belum) belum.push(b.id + ": " + b.alasan);
      }
      return { tercatat, lewati, belum };
    } finally {
      rv.mnemonic = "";
      if (sk) sk.fill(0);
    }
  }

  async function muatPembagian() {
    const konten = $("konten");
    const res = await adm("admin_batch_status");
    if (!res.ok) { konten.replaceChildren(el("div", { class: "galat", text: pesan(res) })); return; }
    state.modeKirim = res.mode_kirim;
    state.alamatPenampung = res.alamat_penampung || "";
    const ambangU = res.ambang_tof * 1000000;
    const persen = Math.min(100, Math.round((res.pool_bebas_units / ambangU) * 100));
    const galat = el("div", { class: "galat", id: "galatBagi" });
    const anak = [];
    if (state.pesanHasil) { anak.push(el("div", { class: "card", id: "hasilAksi", style: "border-color:#4caf7a;", text: state.pesanHasil })); state.pesanHasil = ""; }

    anak.push(el("div", { class: "card", id: "kartuPool" },
      el("div", { style: "font-weight:700;", text: "TOF tertampung" }),
      el("div", { class: "total", id: "teksPool", text: desimalUnit(res.pool_units) + " TOF" }),
      el("div", { class: "kecil", text: res.jumlah_bebas + " setoran menunggu batch · minimal " + res.ambang_tof + " TOF sebelum dibagikan" }),
      el("div", { class: "bar" }, el("div", { style: "width:" + persen + "%;" })),
      el("div", { class: "kecil mono", text: res.alamat_penampung ? "Dompet penampung: " + res.alamat_penampung : "Alamat dompet penampung belum diatur (tab Pengaturan)." })));

    const batch = res.batch;
    if (!batch) {
      const cukup = res.pool_bebas_units >= ambangU;
      anak.push(el("div", { class: "card" },
        cukup ? el("div", { class: "kecil", text: "Sudah mencapai minimal. Siapkan batch untuk membagikan semua setoran yang tertampung." }) : el("div", { class: "kecil", id: "belumCukup", text: "Belum mencapai minimal " + res.ambang_tof + " TOF. Setoran tetap ditampung sampai cukup." }),
        el("button", { class: "btn utama", id: "btnSiapkanBatch", type: "button", disabled: !cukup, text: "Siapkan batch pembagian", onclick: async function () {
          this.disabled = true;
          const r = await adm("admin_batch_siapkan");
          if (!r.ok) { galat.textContent = pesan(r); this.disabled = false; return; }
          muatPembagian();
        } }), galat));
      if (res.bebas.length) anak.push(el("div", { class: "card" }, el("div", { class: "kecil", style: "font-weight:700;", text: "Setoran yang menunggu" }),
        ...res.bebas.map((b) => el("div", { class: "baris kecil", style: "padding:4px 0;" }, el("span", { text: "@" + b.username }), el("span", { text: desimalUnit(b.tof_units) + " TOF" })))));
    } else {
      const totalRp = res.items.reduce((n, i) => n + Number(i.total_rp), 0);
      const kartuBatch = el("div", { class: "card", id: "kartuBatch" },
        el("div", { class: "baris" }, el("div", { style: "font-weight:700;", text: "Batch #" + batch.nomor }),
          el("span", { class: "chip " + (batch.status === "siap_dibagikan" ? "ok" : "tunggu"), text: batch.status === "siap_dibagikan" ? "Siap dibagikan" : "Menunggu topup investasi" })),
        el("div", { class: "total", text: desimalUnit(batch.total_tof_units) + " TOF" }),
        el("div", { class: "kecil", text: batch.jumlah_item + " anggota · uang yang terkumpul di kas: Rp " + fmtRp(totalRp) }),
        batch.investasi_catatan ? el("div", { class: "kecil", text: "Catatan topup: " + batch.investasi_catatan }) : null);
      anak.push(kartuBatch);
      if (batch.status === "disiapkan") {
        kartuBatch.append(
          el("div", { class: "kecil", style: "margin-top:8px;", text: "Langkah: topup akun investasi sungguhan dengan uang batch ini, lalu tekan tombol di bawah. TOF baru boleh dibagikan sesudah itu." }),
          el("button", { class: "btn hijau", id: "btnSudahTopup", type: "button", style: "margin-top:8px;", text: "✓ Sudah ditopup ke akun investasi", onclick: async function () {
            const cat = window.prompt("Catatan topup (mis. tanggal & jumlah, boleh kosong):", "");
            if (cat === null) return;
            this.disabled = true;
            const r = await adm("admin_batch_topup_investasi", { batch_id: batch.id, catatan: cat });
            if (!r.ok) { galat.textContent = pesan(r); this.disabled = false; return; }
            muatPembagian();
          } }),
          el("button", { class: "btn merah", id: "btnBatalBatch", type: "button", style: "margin-left:8px;", text: "Batalkan batch", onclick: async function () {
            if (!window.confirm("Batalkan batch ini? Semua setoran kembali ke daftar tunggu.")) return;
            const r = await adm("admin_batch_batalkan", { batch_id: batch.id });
            if (!r.ok) { galat.textContent = pesan(r); return; }
            muatPembagian();
          } }), galat);
      } else if (batch.status === "siap_dibagikan") {
        const akunPenampung = res.alamat_penampung && state.wallet === res.alamat_penampung;
        const progres = el("div", { class: "kecil", id: "progresBagi" });
        if (!akunPenampung) {
          kartuBatch.append(el("div", { class: "galat", id: "bukanPenampung", text: "Pembagian harus dilakukan dari akun pemilik dompet penampung (" + (res.alamat_penampung || "belum diatur") + "). Masuk dengan akun itu untuk membagikan." }));
        } else {
          kartuBatch.append(
            el("div", { class: "kecil", style: "margin-top:8px;", text: "Tiap anggota menerima TOF sesuai setorannya sendiri, dengan catatan 'USERNAME # ALAMAT # nabung receh # batch " + batch.nomor + "'. Anggota yang belum opt-in TOF dilewati." }),
            el("button", { class: "btn utama", id: "btnBagikan", type: "button", text: "Bagikan TOF sekarang", onclick: async function () {
              if (!window.confirm("Bagikan " + desimalUnit(batch.total_tof_units) + " TOF ke " + batch.jumlah_item + " anggota dari dompet penampung? Transaksi blockchain tidak bisa dibatalkan.")) return;
              this.disabled = true; galat.textContent = "";
              try {
                const h = await bagikanBatch(batch, res.items, (t) => { progres.textContent = t; });
                const ringkas = [h.tercatat.length + " anggota menerima TOF."];
                if (h.lewati.length) ringkas.push("Dilewati (belum opt-in TOF): " + h.lewati.map((x) => "@" + x.username).join(", ") + ".");
                if (h.belum.length) ringkas.push("Perlu dicek: " + h.belum.join("; ") + ".");
                state.pesanHasil = ringkas.join(" ");
                muatPembagian();
              } catch (e) { galat.textContent = e.message; this.disabled = false; progres.textContent = ""; }
            } }), progres, galat);
        }
      }
      anak.push(el("div", { class: "card", id: "daftarBatch" }, el("div", { class: "kecil", style: "font-weight:700;", text: "Isi batch" }),
        ...res.items.map((i) => el("div", { class: "baris kecil", "data-item": i.id, style: "padding:4px 0;" },
          el("span", { text: "@" + i.username + " · " + desimalUnit(i.tof_units) + " TOF" }),
          i.txid_distribusi ? el("a", { class: "tautan", href: EXPLORER_TX + i.txid_distribusi, target: "_blank", rel: "noopener", text: "terkirim ✓" }) : el("span", { class: "chip", text: "menunggu" })))));
    }
    konten.replaceChildren(...anak);
  }

  // ---------------- Penarikan (TOF → uang) ----------------
  function kartuTarik(r, bagian) {
    const galat = el("div", { class: "galat" });
    const aksi = el("div", { class: "aksi" });
    const k = el("div", { class: "card", "data-id": r.id },
      el("div", { class: "baris" }, el("div", { text: "@" + (r.username || "?") + " · " + tgl(r.dibuat) }), chipTarik(r.status)),
      el("div", { class: "total", text: "Rp " + fmtRp(r.jumlah_rp) }),
      el("div", { class: "kecil", text: desimal(r.jumlah_tof_units) + " TOF (kurs 1 TOF = Rp " + fmtRp(r.kurs_rp_per_tof) + ")" }),
      el("div", { class: "kecil", style: "margin-top:6px;font-weight:700;color:#1c2b22;", "data-tujuan": "1", text: r.tujuan_jenis + " · " + r.tujuan_nomor + " · a.n. " + r.tujuan_nama }),
      r.tof_txid ? el("a", { class: "tautan", href: EXPLORER_TX + r.tof_txid, target: "_blank", rel: "noopener", text: "Lihat transaksi TOF dari anggota" }) : null,
      r.catatan_sistem ? el("div", { class: "galat", "data-catatan-sistem": "1", text: r.catatan_sistem }) : null,
      r.ref_bayar ? el("div", { class: "kecil", text: "Referensi pembayaran: " + r.ref_bayar }) : null,
      r.catatan_admin ? el("div", { class: "kecil", text: "Catatan pengurus: " + r.catatan_admin }) : null,
      aksi, galat);

    const jalan = async (tombol, action, extra, bacaHasil) => {
      tombol.disabled = true; galat.textContent = "";
      const res = await adm(action, Object.assign({ id: r.id }, extra || {}));
      tombol.disabled = false;
      if (!res.ok) { galat.textContent = pesan(res); return; }
      state.pesanHasil = bacaHasil ? bacaHasil(res) : "";
      muatPenarikan();
    };
    const tolak = (tombol) => {
      const alasan = window.prompt("Alasan penolakan:");
      if (!alasan) return;
      jalan(tombol, "admin_tarik_tolak", { alasan }, (res) => res.kembalikan_tof
        ? "Ditolak. TOF anggota sudah ada di dompet penerima: KEMBALIKAN TOF-nya secara manual ke @" + (r.username || "?") + "."
        : "Ditolak.");
    };

    if (bagian === "perlu_dibayar") {
      aksi.append(
        el("button", { class: "btn hijau", "data-aksi": "salin-nomor", type: "button", text: "Salin nomor", onclick: () => navigator.clipboard && navigator.clipboard.writeText(r.tujuan_nomor).catch(() => {}) }),
        el("button", { class: "btn hijau", "data-aksi": "salin-jumlah", type: "button", text: "Salin jumlah", onclick: () => navigator.clipboard && navigator.clipboard.writeText(String(r.jumlah_rp)).catch(() => {}) }),
        el("button", { class: "btn utama", "data-aksi": "dibayar", type: "button", style: "margin-top:0;", text: "✓ Uang sudah saya kirim", onclick: function () {
          if (!window.confirm("Pastikan Rp " + fmtRp(r.jumlah_rp) + " SUDAH terkirim ke " + r.tujuan_jenis + " " + r.tujuan_nomor + " a.n. " + r.tujuan_nama + ". Lanjut?")) return;
          const ref = window.prompt("Referensi pembayaran (mis. ID transaksi DANA / waktu kirim):", "");
          if (!ref) return;
          jalan(this, "admin_tarik_dibayar", { ref }, () => "Tercatat: uang Rp " + fmtRp(r.jumlah_rp) + " sudah dikirim ke @" + (r.username || "?") + ".");
        } }),
        el("button", { class: "btn merah", "data-aksi": "tolak", type: "button", text: "Tolak", onclick: function () { tolak(this); } }));
    } else if (bagian === "verifikasi") {
      const txid = el("input", { class: "inp", "data-txid": "1", placeholder: "ID transaksi TOF dari explorer (bila anggota belum melapor)", autocomplete: "off", spellcheck: "false", value: r.tof_txid || "" });
      k.insertBefore(txid, galat);
      aksi.append(
        el("button", { class: "btn hijau", "data-aksi": "verifikasi", type: "button", text: "Verifikasi di blockchain", onclick: function () {
          jalan(this, "admin_tarik_verifikasi", { txid: txid.value.trim() }, (res) => res.tarik.status === "tof_diterima" ? "TOF terverifikasi. Siap dibayar: lihat bagian 'Perlu dibayar'." : "Belum terverifikasi: " + (res.tarik.catatan_sistem || "periksa lagi nanti."));
        } }),
        el("button", { class: "btn merah", "data-aksi": "tolak", type: "button", text: "Tolak", onclick: function () { tolak(this); } }));
    }
    return k;
  }

  async function muatPenarikan() {
    const konten = $("konten");
    const [perlu, cek, riwayat] = await Promise.all([
      adm("admin_tarik_daftar", { tampil: "perlu_dibayar" }),
      adm("admin_tarik_daftar", { tampil: "verifikasi" }),
      adm("admin_tarik_daftar", { tampil: "riwayat" }),
    ]);
    const gagal = [perlu, cek, riwayat].find((x) => !x.ok);
    if (gagal) { konten.replaceChildren(el("div", { class: "galat", text: pesan(gagal) })); return; }
    const anak = [];
    if (state.pesanHasil) { anak.push(el("div", { class: "card", id: "hasilAksi", style: "border-color:#4caf7a;", text: state.pesanHasil })); state.pesanHasil = ""; }
    const bagian = (judul, id, daftar, kunci, kosong) => {
      anak.push(el("div", { class: "kecil", style: "margin:14px 4px 0;font-weight:700;color:#1c2b22;", id, text: judul + " (" + daftar.length + ")" }));
      if (daftar.length) anak.push(...daftar.map((r) => kartuTarik(r, kunci)));
      else anak.push(el("div", { class: "kecil", style: "padding:8px 4px;", text: kosong }));
    };
    bagian("Perlu dibayar", "judulPerluDibayar", perlu.daftar, "perlu_dibayar", "Tidak ada penarikan yang menunggu pembayaran.");
    bagian("Menunggu TOF / verifikasi", "judulVerifikasi", cek.daftar, "verifikasi", "Tidak ada.");
    bagian("Riwayat", "judulRiwayatTarik", riwayat.daftar.slice(-20).reverse(), "riwayat", "Belum ada riwayat.");
    konten.replaceChildren(...anak);
  }

  // ---------------- Pinjaman (pinjam ke diri sendiri) ----------------
  // Alur: anggota mengajukan → pengurus kirim uang manual lalu "Uang sudah saya kirim" (jatuh tempo mulai dihitung) →
  // saat jatuh tempo anggota ditagih lewat pop-up di Dompet (pengurus juga bisa "Tagih sekarang" dan menyalin/membagikan teks tagihan) →
  // anggota bayar ke QRIS kas → pengurus cocokkan mutasi → "Uang masuk, lunas" → bunga dikirim balik sebagai TOF ke dompet anggota.
  const STATUS_PINJAM = { diajukan: ["Menunggu dicairkan", "tunggu"], aktif: ["Berjalan", "ok"], dibayar: ["Anggota bilang sudah bayar", "tunggu"],
    lunas: ["Lunas", "ok"], dipotong: ["TOF dipotong (tidak dibayar)", "gagal"], ditolak: ["Ditolak", "gagal"], dibatalkan: ["Dibatalkan", "gagal"] };
  const STATUS_CICILAN = { menunggu: ["Menunggu pembayaran", "tunggu"], dibayar: ["Anggota bilang sudah bayar", "tunggu"], diterima: ["Diterima", "ok"],
    ditolak: ["Ditolak", "gagal"], kedaluwarsa: ["Kedaluwarsa", "gagal"], dibatalkan: ["Dibatalkan", "gagal"] };
  const chipCicilan = (st) => { const [t, k] = STATUS_CICILAN[st] || [st, ""]; return el("span", { class: "chip " + k, text: t }); };
  const chipPinjam = (st) => { const [t, k] = STATUS_PINJAM[st] || [st, ""]; return el("span", { class: "chip " + k, text: t }); };
  const sisaHari = (iso) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);

  function teksSisa(r) {
    if (!r.jatuh_tempo) return "";
    const h = sisaHari(r.jatuh_tempo);
    if (h < 0) return "TELAT " + (-h) + " hari (jatuh tempo " + tgl(r.jatuh_tempo) + ")";
    if (h === 0) return "Jatuh tempo HARI INI";
    return "Jatuh tempo " + h + " hari lagi (" + tgl(r.jatuh_tempo) + ")";
  }

  // Teks tagihan untuk dibagikan di grup: bercanda tapi tetap mengingatkan.
  function teksTagihanPinjam(r) {
    const h = sisaHari(r.jatuh_tempo);
    const waktu = h < 0 ? "sudah telat " + (-h) + " hari 😅" : h === 0 ? "jatuh tempo HARI INI ⏰" : "jatuh tempo " + h + " hari lagi";
    const nama = "@" + (r.username || "?");
    return "📢 TAGIHAN TOFARMER 🌱\n" + nama + " meminjam Rp " + fmtRp(r.pokok_rp) + " dari dirinya sendiri, " + waktu + ".\n"
      + "Total dikembalikan: Rp " + fmtRp(r.total_rp) + " (bunga Rp " + fmtRp(r.bunga_rp) + " balik lagi jadi TOF di dompetnya sendiri).\n"
      + "Ayo " + nama + ", nabung paksa itu sehat! Lunasi lewat Dompet ToFarmer ya 💪";
  }

  async function bagikanTeks(teks) {
    if (navigator.share) {
      try { await navigator.share({ text: teks }); return "Dibagikan."; }
      catch (e) { if (e && e.name === "AbortError") return ""; }
    }
    try { await navigator.clipboard.writeText(teks); return "Teks tagihan disalin. Tempel di grup."; }
    catch (e) { return "Gagal menyalin, salin manual dari teks di bawah."; }
  }

  function kartuPinjam(r, bagian) {
    const galat = el("div", { class: "galat" });
    const aksi = el("div", { class: "aksi" });
    const k = el("div", { class: "card", "data-id": r.id },
      el("div", { class: "baris" }, el("div", { text: "@" + (r.username || "?") + " · " + tgl(r.dibuat) }), chipPinjam(r.status)),
      el("div", { class: "total", text: "Rp " + fmtRp(r.pokok_rp) }),
      el("div", { class: "kecil", text: "Bunga " + r.bunga_persen + "% = Rp " + fmtRp(r.bunga_rp) + " · total Rp " + fmtRp(r.total_rp) + " · tenor " + r.tenor_hari + " hari · jaminan " + desimal(r.jaminan_tof_units) + " TOF" }),
      (r.status === "aktif" || r.status === "dibayar") && r.dibayar_rp > 0 ? el("div", { class: "kecil", "data-cicilan": "1", text: "Sudah dicicil Rp " + fmtRp(r.dibayar_rp) + " · sisa Rp " + fmtRp(r.sisa_rp) + " · jaminan tersisa " + desimal(r.jaminan_sisa_units) + " TOF" }) : null,
      r.jatuh_tempo ? el("div", { class: "kecil", style: "font-weight:700;color:#1c2b22;", "data-sisa": "1", text: teksSisa(r) }) : null,
      r.status === "aktif" && r.jatuh_tempo ? el("div", { class: "kecil", "data-potong": "1", text: r.setuju_pada
        ? "TOF dipotong otomatis bila belum ada pembayaran setelah " + (r.potong_pada ? tgl(r.potong_pada) : "akhir masa tenggang") + " (tenggang " + (r.tenggang_hari || "?") + " hari)."
        : "Pinjaman lama tanpa persetujuan potong otomatis: tidak dipotong otomatis." }) : null,
      r.potong_status === "gagal" || r.potong_status === "mengirim" ? el("div", { class: "galat", "data-potong-status": "1", text: "Pemotongan TOF " + (r.potong_status === "gagal" ? "gagal" : "belum pasti") + (r.potong_catatan ? ": " + r.potong_catatan : ".") }) : null,
      r.status === "dipotong" ? el("div", { class: "kecil", "data-dipotong": "1", text: "TOF dipotong " + desimal(r.dipotong_units || 0) + " pada " + tgl(r.dipotong_pada) + (r.potong_catatan ? " · " + r.potong_catatan : "") }) : null,
      r.dipotong_txid ? el("a", { class: "tautan", href: EXPLORER_TX + r.dipotong_txid, target: "_blank", rel: "noopener", text: "Lihat transaksi pemotongan TOF" }) : null,
      r.ditagih_admin ? el("div", { class: "kecil", text: "📢 Sedang ditagih lewat pop-up sejak " + tgl(r.ditagih_pada) }) : null,
      el("div", { class: "kecil", style: "margin-top:6px;font-weight:700;color:#1c2b22;", "data-tujuan": "1", text: r.tujuan_jenis + " · " + r.tujuan_nomor + " · a.n. " + r.tujuan_nama }),
      r.status === "dibayar" ? el("div", { class: "kecil", text: "Anggota harus membayar PERSIS Rp " + fmtRp(r.total_bayar_rp) + (r.ref_user ? " · catatan anggota: " + r.ref_user : "") }) : null,
      r.ref_cair ? el("div", { class: "kecil", text: "Referensi pencairan: " + r.ref_cair }) : null,
      r.catatan_admin ? el("div", { class: "kecil", text: "Catatan pengurus: " + r.catatan_admin }) : null,
      r.bunga_txid ? el("a", { class: "tautan", href: EXPLORER_TX + r.bunga_txid, target: "_blank", rel: "noopener", text: "Lihat transaksi TOF bunga" }) : null,
      aksi, galat);

    const jalan = async (tombol, action, extra, bacaHasil) => {
      tombol.disabled = true; galat.textContent = "";
      const res = await adm(action, Object.assign({ id: r.id }, extra || {}));
      tombol.disabled = false;
      if (!res.ok) { galat.textContent = pesan(res); return; }
      state.pesanHasil = bacaHasil ? bacaHasil(res) : "";
      muatPinjaman();
    };
    const lunasi = (tombol) => {
      const jumlah = r.status === "dibayar" ? r.total_bayar_rp : r.total_rp;
      if (!window.confirm("Pastikan mutasi/riwayat penerimaan e-wallet kas menunjukkan uang masuk Rp " + fmtRp(jumlah) + ". Lunasi pinjaman @" + (r.username || "?") + " dan kirim balik bunga sebagai TOF?")) return;
      jalan(tombol, "admin_pinjam_lunas", {}, (res) => {
        const p = res && res.payout;
        if (!p) return "Pinjaman dilunasi. TOF jaminan dibuka.";
        if (p.status === "selesai") return "Lunas. Bunga terkirim sebagai TOF ke @" + (r.username || "?") + " (ID transaksi: " + p.txid + ").";
        return "Lunas, tetapi TOF bunga belum terkirim otomatis ke @" + (r.username || "?") + ": " + (p.alasan || "kirim manual dari Dompet") + " Jumlah bunga: " + desimal(r.bunga_tof_units) + " TOF.";
      });
    };
    const tolak = (tombol) => {
      const alasan = window.prompt("Alasan penolakan:");
      if (!alasan) return;
      jalan(tombol, "admin_pinjam_tolak", { alasan }, () => "Pinjaman ditolak.");
    };

    if (bagian === "diajukan") {
      aksi.append(
        el("button", { class: "btn hijau", "data-aksi": "salin-nomor", type: "button", text: "Salin nomor", onclick: () => navigator.clipboard && navigator.clipboard.writeText(r.tujuan_nomor).catch(() => {}) }),
        el("button", { class: "btn hijau", "data-aksi": "salin-jumlah", type: "button", text: "Salin jumlah", onclick: () => navigator.clipboard && navigator.clipboard.writeText(String(r.pokok_rp)).catch(() => {}) }),
        el("button", { class: "btn utama", "data-aksi": "cairkan", type: "button", style: "margin-top:0;", text: "✓ Uang sudah saya kirim", onclick: function () {
          if (!window.confirm("Pastikan Rp " + fmtRp(r.pokok_rp) + " SUDAH terkirim ke " + r.tujuan_jenis + " " + r.tujuan_nomor + " a.n. " + r.tujuan_nama + ". Jatuh tempo mulai dihitung sekarang. Lanjut?")) return;
          const ref = window.prompt("Referensi pengiriman (mis. ID transaksi DANA / waktu kirim):", "");
          if (!ref) return;
          jalan(this, "admin_pinjam_cairkan", { ref }, () => "Tercatat: Rp " + fmtRp(r.pokok_rp) + " dikirim ke @" + (r.username || "?") + ". TOF jaminannya terkunci.");
        } }),
        el("button", { class: "btn merah", "data-aksi": "tolak", type: "button", text: "Tolak", onclick: function () { tolak(this); } }));
    } else if (bagian === "aktif") {
      const teks = teksTagihanPinjam(r);
      k.insertBefore(el("div", { class: "kecil mono", "data-teks-tagihan": "1", style: "white-space:pre-wrap;margin-top:6px;", text: teks }), aksi);
      aksi.append(
        el("button", { class: "btn utama", "data-aksi": "salin-tagihan", type: "button", style: "margin-top:0;", text: "📋 Salin / bagikan tagihan", onclick: async function () {
          const m = await bagikanTeks(teks);
          if (m) { galat.style.color = "#1f6b3d"; galat.textContent = m; }
        } }),
        r.ditagih_admin
          ? el("button", { class: "btn abu", "data-aksi": "henti-tagih", type: "button", text: "Hentikan tagihan", onclick: function () { jalan(this, "admin_pinjam_tagih", { tagih: false }, () => "Tagihan pop-up dihentikan (jatuh tempo otomatis tetap berlaku)."); } })
          : el("button", { class: "btn hijau", "data-aksi": "tagih", type: "button", text: "📢 Tagih sekarang", onclick: function () { jalan(this, "admin_pinjam_tagih", { tagih: true }, () => "@" + (r.username || "?") + " akan melihat pop-up tagihan setiap membuka Dompet."); } }),
        el("button", { class: "btn hijau", "data-aksi": "lunas", type: "button", text: "✓ Uang masuk, lunas", onclick: function () { lunasi(this); } }));
      // [CICILAN] potong TOF jaminan bila sudah lewat jatuh tempo + masa tenggang tanpa aktivitas pembayaran
      if (r.setuju_pada && r.potong_pada && Date.parse(r.potong_pada) <= Date.now()) {
        const belumPasti = r.potong_status === "mengirim";
        aksi.append(el("button", { class: "btn merah", "data-aksi": "potong", type: "button", text: belumPasti ? "Periksa / ulangi potong TOF" : "✂ Potong TOF sekarang", onclick: function () {
          const yakin = belumPasti && !r.dipotong_txid;
          const pertanyaan = yakin
            ? "Hasil pemotongan sebelumnya tidak pasti. Pastikan di explorer TIDAK ADA transaksi TOF dari anggota ke dompet pembayar. Lanjut mengulang?"
            : "Potong sisa TOF jaminan @" + (r.username || "?") + " (" + desimal(r.jaminan_sisa_units != null ? r.jaminan_sisa_units : r.jaminan_tof_units) + " TOF) dari dompetnya? Pinjaman ditutup dengan status dipotong.";
          if (!window.confirm(pertanyaan)) return;
          jalan(this, "admin_pinjam_potong", yakin ? { yakin: true } : {}, (res) => {
            const h = res && res.potong;
            if (!h) return "Selesai.";
            if (h.status === "selesai") return "TOF dipotong: " + desimal(h.units || 0) + " TOF dari @" + (r.username || "?") + (h.txid ? " (ID transaksi: " + h.txid + ")." : ".") + (h.alasan ? " " + h.alasan : "");
            if (h.status === "mengirim") return "Pemotongan belum pasti: " + (h.alasan || "periksa lagi nanti.");
            return "Pemotongan tidak berjalan: " + (h.alasan || "periksa lagi.");
          });
        } }));
      }
    } else if (bagian === "dibayar") {
      aksi.append(
        el("button", { class: "btn utama", "data-aksi": "lunas", type: "button", style: "margin-top:0;", text: "✓ Uang masuk di kas, lunas", onclick: function () { lunasi(this); } }),
        el("button", { class: "btn merah", "data-aksi": "tolak-bayar", type: "button", text: "Belum masuk", onclick: function () {
          const alasan = window.prompt("Catatan untuk anggota (mis. mutasi belum ada):");
          if (!alasan) return;
          jalan(this, "admin_pinjam_belum_masuk", { alasan }, () => "Dikembalikan ke status berjalan. Anggota bisa membayar lagi.");
        } }));
    } else if (bagian === "riwayat" && r.status === "lunas" && r.bunga_status !== "terkirim") {
      k.insertBefore(el("div", { class: "galat", "data-catatan-bunga": "1", text: "Bunga " + desimal(r.bunga_tof_units) + " TOF belum terkirim ke anggota" + (r.bunga_catatan ? ": " + r.bunga_catatan : ".") }), aksi);
      aksi.append(
        el("button", { class: "btn utama", "data-aksi": "kirim-bunga", type: "button", style: "margin-top:0;", text: "Kirim bunga (TOF)", onclick: function () {
          const resetDulu = r.bunga_status === "mengirim" && !r.bunga_txid;
          if (resetDulu && !window.confirm("Hasil pengiriman sebelumnya tidak pasti. Pastikan di explorer TIDAK ADA transaksi TOF bunga ke anggota ini. Lanjut mengirim ulang?")) return;
          jalan(this, "admin_pinjam_kirim_bunga", resetDulu ? { yakin: true } : {}, (res) => {
            const p = res && res.payout;
            if (p && p.status === "selesai") return "Bunga terkirim sebagai TOF ke @" + (r.username || "?") + (p.txid ? " (ID transaksi: " + p.txid + ")." : ".");
            return "Bunga belum terkirim: " + ((p && p.alasan) || "periksa lagi nanti.");
          });
        } }));
    }
    return k;
  }

  // [CICILAN] Kartu cicilan pinjaman: cocokkan dengan mutasi kas, lalu terima (dialokasikan ke pinjaman paling lama jatuh tempo) atau tolak.
  function kartuCicilan(r, riwayat) {
    const galat = el("div", { class: "galat" });
    const aksi = el("div", { class: "aksi" });
    const k = el("div", { class: "card", "data-id": r.id },
      el("div", { class: "baris" }, el("div", { text: "@" + (r.username || "?") + " · " + tgl(r.dibuat) }), chipCicilan(r.status)),
      el("div", { class: "total", text: "Rp " + fmtRp(r.total_bayar_rp) }),
      el("div", { class: "kecil", text: "Cicilan Rp " + fmtRp(r.nominal_rp) + " + kode unik " + r.kode_unik + (r.sisa_total_rp != null ? " · sisa pinjaman anggota sekarang Rp " + fmtRp(r.sisa_total_rp) : "") }),
      r.ref_user ? el("div", { class: "kecil", text: "Catatan anggota: " + r.ref_user }) : null,
      r.status === "menunggu" ? el("div", { class: "kecil", text: "Anggota belum menekan “Saya sudah bayar”. Terima hanya bila mutasi kas sudah menunjukkan uang masuk." }) : null,
      r.catatan_admin ? el("div", { class: "kecil", text: "Catatan pengurus: " + r.catatan_admin }) : null,
      riwayat && r.status === "diterima" && r.alokasi && r.alokasi.length ? el("div", { class: "kecil", text: "Dialokasikan ke " + r.alokasi.length + " pinjaman" }) : null,
      aksi, galat);
    const jalan = async (tombol, action, extra, bacaHasil) => {
      tombol.disabled = true; galat.textContent = "";
      const res = await adm(action, Object.assign({ id: r.id }, extra || {}));
      tombol.disabled = false;
      if (!res.ok) { galat.textContent = pesan(res); return; }
      state.pesanHasil = bacaHasil ? bacaHasil(res) : "";
      muatPinjaman();
    };
    if (!riwayat) {
      aksi.append(
        el("button", { class: "btn hijau", "data-aksi": "salin-jumlah-cicilan", type: "button", text: "Salin jumlah", onclick: () => navigator.clipboard && navigator.clipboard.writeText(String(r.total_bayar_rp)).catch(() => {}) }),
        el("button", { class: "btn utama", "data-aksi": "terima-cicilan", type: "button", style: "margin-top:0;", text: "✓ Uang masuk, terima cicilan", onclick: function () {
          if (!window.confirm("Pastikan mutasi/riwayat penerimaan e-wallet kas menunjukkan uang masuk Rp " + fmtRp(r.total_bayar_rp) + ". Terima cicilan @" + (r.username || "?") + " sebesar Rp " + fmtRp(r.nominal_rp) + "?")) return;
          jalan(this, "admin_cicil_terima", {}, (res) => {
            const l = (res.lunas || []).length;
            let t = "Cicilan Rp " + fmtRp(r.nominal_rp) + " dari @" + (r.username || "?") + " diterima dan mengurangi pinjamannya.";
            if (l) t += " " + l + " pinjaman lunas; bunga dikirim balik sebagai TOF (" + res.lunas.map((x) => x.payout && x.payout.status === "selesai" ? "terkirim" : "perlu dicek di Riwayat").join(", ") + ").";
            if (res.kelebihan_rp > 0) t += " PERHATIAN: kelebihan Rp " + fmtRp(res.kelebihan_rp) + " tidak teralokasi, kembalikan manual ke anggota.";
            return t;
          });
        } }),
        el("button", { class: "btn merah", "data-aksi": "tolak-cicilan", type: "button", text: "Belum masuk / tolak", onclick: function () {
          const alasan = window.prompt("Alasan untuk anggota (mis. mutasi belum ada):");
          if (!alasan) return;
          jalan(this, "admin_cicil_tolak", { alasan }, () => "Cicilan ditolak.");
        } }));
    }
    return k;
  }

  async function muatPinjaman() {
    const konten = $("konten");
    const [ajuan, aktif, bayar, riwayat, cicilDicek, cicilRiwayat] = await Promise.all([
      adm("admin_pinjam_daftar", { tampil: "diajukan" }),
      adm("admin_pinjam_daftar", { tampil: "aktif" }),
      adm("admin_pinjam_daftar", { tampil: "dibayar" }),
      adm("admin_pinjam_daftar", { tampil: "riwayat" }),
      adm("admin_cicil_daftar", { tampil: "dicek" }),
      adm("admin_cicil_daftar", { tampil: "riwayat" }),
    ]);
    const gagal = [ajuan, aktif, bayar, riwayat, cicilDicek, cicilRiwayat].find((x) => !x.ok);
    if (gagal) { konten.replaceChildren(el("div", { class: "galat", text: pesan(gagal) })); return; }
    const anak = [];
    if (state.pesanHasil) { anak.push(el("div", { class: "card", id: "hasilAksi", style: "border-color:#4caf7a;", text: state.pesanHasil })); state.pesanHasil = ""; }
    const bagian = (judul, id, daftar, kunci, kosong) => {
      anak.push(el("div", { class: "kecil", style: "margin:14px 4px 0;font-weight:700;color:#1c2b22;", id, text: judul + " (" + daftar.length + ")" }));
      if (daftar.length) anak.push(...daftar.map((r) => kartuPinjam(r, kunci)));
      else anak.push(el("div", { class: "kecil", style: "padding:8px 4px;", text: kosong }));
    };
    // [CICILAN] cicilan yang perlu dicocokkan dengan mutasi kas
    anak.push(el("div", { class: "kecil", style: "margin:14px 4px 0;font-weight:700;color:#1c2b22;", id: "judulCicilDicek", text: "Cicilan perlu dicek (" + cicilDicek.daftar.length + ")" }));
    if (cicilDicek.daftar.length) anak.push(...cicilDicek.daftar.map((r) => kartuCicilan(r, false)));
    else anak.push(el("div", { class: "kecil", style: "padding:8px 4px;", text: "Tidak ada cicilan yang menunggu." }));
    // [CICILAN] potong TOF otomatis untuk pinjaman yang lewat jatuh tempo + masa tenggang
    const btnPotongSemua = el("button", { class: "btn merah", id: "btnPotongSemua", type: "button", style: "margin-top:8px;", text: "✂ Proses potong TOF yang sudah lewat tenggang", onclick: async function () {
      if (!window.confirm("Potong TOF jaminan semua pinjaman yang sudah lewat jatuh tempo + masa tenggang tanpa pembayaran (maksimal beberapa sekali jalan)? Anggota sudah menyetujui ketentuan ini saat pinjam.")) return;
      this.disabled = true;
      const res = await adm("admin_pinjam_potong_semua", {});
      this.disabled = false;
      if (!res.ok) { state.pesanHasil = pesan(res); muatPinjaman(); return; }
      state.pesanHasil = res.diproses === 0
        ? "Tidak ada pinjaman yang sudah lewat masa tenggang."
        : "Diproses " + res.diproses + " pinjaman: " + res.hasil.map((h) => "@" + (h.username || "?") + " " + h.status + (h.alasan ? " (" + h.alasan + ")" : "")).join("; ") + ". Jalankan lagi bila masih ada.";
      muatPinjaman();
    } });
    anak.push(el("div", { class: "card", id: "kartuPotongSemua" },
      el("div", { class: "kecil", text: "TOF jaminan dipotong otomatis dari anggota yang pinjamannya sudah lewat jatuh tempo + masa tenggang dan tidak ada pembayaran. Bisa dijalankan terjadwal (lihat catatan di file SQL) atau dengan tombol ini." }),
      btnPotongSemua));
    bagian("Perlu dikirim uangnya", "judulPinjamAjuan", ajuan.daftar, "diajukan", "Tidak ada pengajuan baru.");
    bagian("Pelunasan perlu dicek", "judulPinjamBayar", bayar.daftar, "dibayar", "Tidak ada.");
    bagian("Berjalan (urut jatuh tempo)", "judulPinjamAktif", aktif.daftar, "aktif", "Tidak ada pinjaman berjalan.");
    bagian("Riwayat", "judulPinjamRiwayat", riwayat.daftar.slice(-20).reverse(), "riwayat", "Belum ada riwayat.");
    anak.push(el("div", { class: "kecil", style: "margin:14px 4px 0;font-weight:700;color:#1c2b22;", id: "judulCicilRiwayat", text: "Riwayat cicilan (" + cicilRiwayat.daftar.length + ")" }));
    if (cicilRiwayat.daftar.length) anak.push(...cicilRiwayat.daftar.map((r) => kartuCicilan(r, true)));
    else anak.push(el("div", { class: "kecil", style: "padding:8px 4px;", text: "Belum ada riwayat cicilan." }));
    konten.replaceChildren(...anak);
  }

  // ---------------- Dividen ----------------
  // Alur: ketik persentase → Hitung pratinjau (foto saldo on-chain saat ini; yang tidak memenuhi syarat otomatis dilewati)
  // → centang/keluarkan peserta → Setujui (pengurus lain bila pengurus lebih dari satu) → Jalankan.
  // Positif: TOF dikirim dari dompet pembayar. Negatif: TOF ditarik otomatis dari dompet peserta (frasa dari brankas).
  const STATUS_DIV = { pratinjau: ["Pratinjau", "tunggu"], disetujui: ["Disetujui, siap dijalankan", "ok"], berjalan: ["Berjalan", "tunggu"], selesai: ["Selesai", "ok"], dibatalkan: ["Dibatalkan", "gagal"] };
  const STATUS_ITEM_DIV = { menunggu: ["Menunggu", "tunggu"], mengirim: ["Mengirim", "tunggu"], selesai: ["Selesai", "ok"], gagal: ["Gagal", "gagal"], dilewati: ["Dilewati", ""], ditahan: ["Ditahan", "tunggu"], hangus: ["Hangus", "gagal"] };
  const persenTeks = (bp) => (bp / 100).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + "%";
  const chipDiv = (peta, st) => { const [t, k] = peta[st] || [st, ""]; return el("span", { class: "chip " + k, text: t }); };

  async function jalankanDividen(pid, tombol, infoEl) {
    tombol.disabled = true;
    for (let putaran = 0; putaran < 200; putaran++) {
      const res = await adm("admin_dividen_jalankan", { periode_id: pid, yakin: true });
      if (!res.ok) { infoEl.textContent = pesan(res); break; }
      const rg = res.ringkas;
      infoEl.textContent = "Berjalan… selesai " + rg.selesai + " dari " + rg.peserta + (rg.gagal ? ", gagal " + rg.gagal : "") + (rg.mengirim ? ", menunggu konfirmasi " + rg.mengirim : "");
      if (res.periode_selesai || res.diproses === 0) break;
    }
    muatDividen();
  }

  function kartuItemDividen(it, periode) {
    const bisaCentang = periode.status === "pratinjau" && it.status === "menunggu";
    const tanda = it.arah === "bagi" ? "+" : "−";
    const galat = el("div", { class: "galat" });
    const aksi = el("div", { class: "aksi" });
    const cek = bisaCentang
      ? el("input", { type: "checkbox", "data-ikut": it.id, checked: it.ikut ? "checked" : null, onchange: async function () {
          const res = await adm("admin_dividen_pilih", { periode_id: periode.id, ids: [it.id], ikut: this.checked });
          if (!res.ok) { galat.textContent = pesan(res); return; }
          muatDividen();
        } })
      : null;
    if (cek && it.ikut) cek.checked = true;
    const k = el("div", { class: "card", "data-item": it.id },
      el("div", { class: "baris" }, el("div", { style: "display:flex;gap:8px;align-items:center;font-weight:700;" }, cek, "@" + (it.username || "?")), chipDiv(STATUS_ITEM_DIV, it.status)),
      it.status === "dilewati" && !it.jumlah_units
        ? el("div", { class: "kecil", text: it.alasan || "" })
        : el("div", { class: "kecil", text: "Saldo " + desimal(it.saldo_units) + " TOF · " + tanda + desimal(it.jumlah_units) + " TOF"
            + (it.kurang_units ? " · kurang " + desimal(it.kurang_units) + " TOF (sisanya TOF jaminan pinjaman, tidak diambil)" : "")
            + (it.terkunci_units ? " · jaminan " + desimal(it.terkunci_units) + " TOF" : "") }),
      it.alasan && it.status !== "dilewati" ? el("div", { class: "kecil", text: it.alasan }) : null,
      it.txid ? el("a", { class: "tautan", href: EXPLORER_TX + it.txid, target: "_blank", rel: "noopener", text: "Lihat transaksi" }) : null,
      aksi, galat);
    const ulang = async (tombol, action, extra) => {
      tombol.disabled = true; galat.textContent = "";
      const res = await adm(action, Object.assign({ item_id: it.id }, extra || {}));
      tombol.disabled = false;
      if (!res.ok) { galat.textContent = pesan(res); return; }
      muatDividen();
    };
    if (it.status === "gagal") {
      aksi.append(
        el("button", { class: "btn hijau", "data-aksi": "ulangi", type: "button", text: "Ulangi", onclick: function () { ulang(this, "admin_dividen_ulangi"); } }),
        el("button", { class: "btn abu", "data-aksi": "lewati", type: "button", text: "Lewati", onclick: function () { if (window.confirm("Lewati peserta ini tanpa mengirim/menarik?")) ulang(this, "admin_dividen_lewati"); } }));
    } else if (it.status === "mengirim") {
      aksi.append(el("button", { class: "btn hijau", "data-aksi": "periksa", type: "button", text: "Periksa status", onclick: function () {
        if (it.txid) return ulang(this, "admin_dividen_ulangi");
        if (!window.confirm("Hasil pengiriman tidak pasti. Pastikan di explorer TIDAK ADA transaksi untuk peserta ini sebelum mengulang. Lanjut?")) return;
        ulang(this, "admin_dividen_ulangi", { yakin: true });
      } }));
    } else if (it.status === "ditahan") {
      aksi.append(
        el("button", { class: "btn utama", "data-aksi": "lepas", type: "button", style: "margin-top:0;", text: "Lepas (tugas selesai)", onclick: function () { ulang(this, "admin_dividen_lepas"); } }),
        el("button", { class: "btn hijau", "data-aksi": "lepas-paksa", type: "button", text: "Lepas paksa", onclick: function () {
          if (window.confirm("Lepas dividen @" + (it.username || "?") + " meski tugasnya belum lengkap? Ini kebijakan pengurus.")) ulang(this, "admin_dividen_lepas", { paksa: true });
        } }),
        el("button", { class: "btn merah", "data-aksi": "hanguskan", type: "button", text: "Hanguskan", onclick: function () {
          if (window.confirm("Hanguskan dividen @" + (it.username || "?") + "? Dananya tetap di kas bersama dan tidak dikirim.")) ulang(this, "admin_dividen_hanguskan");
        } }));
    }
    return k;
  }

  async function muatDividen() {
    const konten = $("konten");
    const r = await adm("admin_dividen_lihat", state.dividenId ? { periode_id: state.dividenId } : {});
    if (!r.ok) { konten.replaceChildren(el("div", { class: "galat", text: pesan(r) })); return; }
    const anak = [];
    if (state.pesanHasil) { anak.push(el("div", { class: "card", id: "hasilAksi", style: "border-color:#4caf7a;", text: state.pesanHasil })); state.pesanHasil = ""; }
    const kas = r.kas && !r.kas.galat ? "Dompet pembayar: " + desimal(r.kas.tof_units) + " TOF, ALGO bebas " + desimal(r.kas.algo_units) : "Dompet pembayar belum terbaca";
    anak.push(el("div", { class: "card" },
      el("div", { class: "kecil", text: kas }),
      el("div", { class: "kecil", text: "Batas minus per periode: " + r.pengaturan.batas_minus_persen + "% · saldo minimum peserta: " + r.pengaturan.min_saldo_tof + " TOF (ubah di Pengaturan)" })));

    const p = r.periode;
    if (state.dividenId) {
      anak.push(el("button", { class: "btn abu", id: "btnKembaliDividen", type: "button", text: "← Kembali", onclick: () => { state.dividenId = ""; muatDividen(); } }));
    } else if ((r.ditahan || []).length) {
      anak.push(el("div", { class: "card", id: "kartuDitahan" },
        el("div", { style: "font-weight:700;", text: "Dividen ditahan (tugas belum lengkap)" }),
        ...r.ditahan.map((x) => el("div", { class: "baris", style: "margin-top:8px;" },
          el("div", { class: "kecil", text: x.label + " · " + x.jumlah + " peserta · " + desimal(x.total_units) + " TOF" }),
          el("button", { class: "btn hijau", "data-aksi": "buka-ditahan", type: "button", text: "Buka", onclick: () => { state.dividenId = x.periode_id; muatDividen(); } })))));
    }
    if (!p) {
      const label = el("input", { class: "inp", id: "divLabel", maxlength: "40", value: new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" }) });
      const persen = el("input", { class: "inp", id: "divPersen", inputmode: "decimal", placeholder: "mis. 2,5 atau -1,5" });
      const bulanTugas = el("input", { class: "inp", id: "divBulanTugas", type: "month", value: new Date().toISOString().slice(0, 7) });
      const galat = el("div", { class: "galat" });
      const btn = el("button", { class: "btn utama", id: "btnPratinjau", type: "button", text: "Hitung pratinjau" });
      btn.onclick = async () => {
        galat.textContent = "";
        const n = Number(String(persen.value).replace(",", ".").trim());
        const bp = Math.round(n * 100);
        if (!Number.isFinite(n) || !bp) { galat.textContent = "Isi persentase, mis. 2,5 atau -1,5."; return; }
        btn.disabled = true; btn.textContent = "Menghitung dari saldo jaringan…";
        const res = await adm("admin_dividen_pratinjau", { label: label.value.trim(), persen_bp: bp, bulan_tugas: bp > 0 ? bulanTugas.value : "" });
        btn.disabled = false; btn.textContent = "Hitung pratinjau";
        if (!res.ok) { galat.textContent = pesan(res); return; }
        muatDividen();
      };
      anak.push(el("div", { class: "card" },
        el("div", { style: "font-weight:700;" }, "Periode baru"),
        el("label", { class: "lbl", for: "divLabel", text: "Nama periode (tiap nama hanya sekali)" }), label,
        el("label", { class: "lbl", for: "divPersen", text: "Persentase dari saldo TOF peserta (negatif = koreksi minus)" }), persen,
        el("label", { class: "lbl", for: "divBulanTugas", text: "Bulan yang tugasnya dinilai (hanya dividen positif)" }), bulanTugas,
        el("div", { class: "kecil", text: "Peserta yang tugas wajib bulan itu belum lengkap dividennya DITAHAN. Dilepas setelah tugas selesai; bisa dihanguskan setelah masa tahan." }),
        el("div", { class: "kecil", text: "Dihitung dari saldo TOF di jaringan saat tombol ditekan (foto saldo), termasuk TOF yang dibekukan jaminan pinjaman. Pada koreksi minus hanya TOF bebas yang diambil." }),
        galat, btn));
    } else {
      const rg = r.ringkas;
      const info = el("div", { class: "kecil", id: "infoJalan" });
      const negatif = p.persen_bp < 0;
      anak.push(el("div", { class: "card", id: "kartuPeriode" },
        el("div", { class: "baris" }, el("div", { style: "font-weight:700;", text: p.label + " · " + persenTeks(p.persen_bp) }), chipDiv(STATUS_DIV, p.status)),
        el("div", { class: "total", text: (negatif ? "−" : "+") + desimal(negatif ? rg.total_potong_units : rg.total_bagi_units) + " TOF" }),
        el("div", { class: "kecil", text: rg.peserta + " peserta · " + rg.dilewati + " dilewati (belum opt-in TOF, saldo kurang, atau koreksi minus tanpa frasa) · selesai " + rg.selesai + " · gagal " + rg.gagal + " · mengirim " + rg.mengirim + (rg.ditahan ? " · ditahan " + rg.ditahan + " (" + desimal(rg.total_ditahan_units) + " TOF)" : "") + (rg.hangus ? " · hangus " + rg.hangus : "") }),
        info));
      const aksiP = el("div", { class: "aksi" });
      const galatP = el("div", { class: "galat" });
      const kerja = async (tombol, action, extra, bacaPesan) => {
        tombol.disabled = true; galatP.textContent = "";
        const res = await adm(action, Object.assign({ periode_id: p.id }, extra || {}));
        tombol.disabled = false;
        if (!res.ok) { galatP.textContent = pesan(res); return; }
        state.pesanHasil = bacaPesan || "";
        muatDividen();
      };
      if (p.status === "pratinjau") {
        const idsMenunggu = r.items.filter((x) => x.status === "menunggu").map((x) => x.id);
        aksiP.append(
          el("button", { class: "btn abu", "data-aksi": "pilih-semua", type: "button", text: "Pilih semua", onclick: function () { kerja(this, "admin_dividen_pilih", { ids: idsMenunggu, ikut: true }); } }),
          el("button", { class: "btn abu", "data-aksi": "kosongkan", type: "button", text: "Kosongkan", onclick: function () { kerja(this, "admin_dividen_pilih", { ids: idsMenunggu, ikut: false }); } }),
          el("button", { class: "btn utama", "data-aksi": "setujui", type: "button", style: "margin-top:0;", text: "✓ Setujui", onclick: function () {
            if (!window.confirm("Setujui periode " + p.label + " (" + persenTeks(p.persen_bp) + ") untuk " + rg.peserta + " peserta? Peserta yang tidak dicentang tidak ikut.")) return;
            kerja(this, "admin_dividen_setujui", {}, "Periode disetujui. Tekan Jalankan untuk memulai.");
          } }),
          el("button", { class: "btn merah", "data-aksi": "batal", type: "button", text: "Batalkan", onclick: function () { if (window.confirm("Batalkan pratinjau ini?")) kerja(this, "admin_dividen_batal", {}, "Pratinjau dibatalkan."); } }));
      } else if (p.status === "disetujui" || p.status === "berjalan" || (p.status === "selesai" && rg.menunggu > 0)) {
        aksiP.append(
          el("button", { class: "btn utama", "data-aksi": "jalankan", type: "button", style: "margin-top:0;", text: p.status === "berjalan" ? "Lanjutkan" : p.status === "selesai" ? "Kirim yang menunggu" : "▶ Jalankan sekarang", onclick: function () {
            const teksKonfirm = p.status === "selesai" ? "Kirim dividen kepada " + rg.menunggu + " peserta yang menunggu (dilepas dari penahanan atau diulang)?" : negatif
              ? "KOREKSI MINUS: TOF ditarik OTOMATIS dari dompet " + rg.peserta + " peserta, total " + desimal(rg.total_potong_units) + " TOF. Tidak bisa dibatalkan setelah berjalan. Lanjut?"
              : "Kirim dividen " + desimal(rg.total_bagi_units) + " TOF ke " + rg.peserta + " peserta dari dompet pembayar. Lanjut?";
            if (!window.confirm(teksKonfirm)) return;
            jalankanDividen(p.id, this, info);
          } }));
        if (p.status === "disetujui") aksiP.append(el("button", { class: "btn merah", "data-aksi": "batal", type: "button", text: "Batalkan", onclick: function () { if (window.confirm("Batalkan periode ini?")) kerja(this, "admin_dividen_batal", {}, "Periode dibatalkan."); } }));
      }
      anak.push(aksiP, galatP);
      const urut = r.items.slice().sort((a, b) => (a.status === "dilewati") - (b.status === "dilewati"));
      anak.push(...urut.map((it) => kartuItemDividen(it, p)));
    }

    anak.push(el("div", { class: "kecil", style: "margin:14px 4px 0;font-weight:700;color:#1c2b22;", text: "Riwayat periode" }));
    if (r.riwayat.length) anak.push(...r.riwayat.map((x) => el("div", { class: "card", "data-periode": x.id }, el("div", { class: "baris" }, el("div", { text: x.label + " · " + persenTeks(x.persen_bp) }), chipDiv(STATUS_DIV, x.status)), el("div", { class: "baris" }, el("div", { class: "kecil", text: tgl(x.dibuat) }), el("button", { class: "btn abu", "data-aksi": "buka-periode", type: "button", text: "Buka", onclick: () => { state.dividenId = x.id; muatDividen(); } })))));
    else anak.push(el("div", { class: "kecil", style: "padding:8px 4px;", text: "Belum ada periode." }));
    konten.replaceChildren(...anak);
  }

  // ---------------- Tugas ----------------
  // Mengatur kewajiban ringan sebagai syarat dividen positif: katalog tugas (halaman/fitur baru terdaftar otomatis berstatus "baru"),
  // rekap bulanan, centang manual, klaim anggota, dan kegiatan dengan kode hadir. Penilaian dilakukan server.
  const JENIS_TUGAS = [["kunjungan", "Buka halaman"], ["aksi", "Tindakan"], ["sistem", "Sistem (dari keadaan akun)"], ["manual", "Manual / klaim"], ["hadir", "Kode hadir kegiatan"]];
  const STATUS_TUGAS = [["baru", "Baru (belum dipakai)"], ["aktif", "Aktif"], ["nonaktif", "Nonaktif"]];
  const opsiSel = (daftar, nilai) => { const s = el("select", { class: "inp" }, daftar.map(([v, t]) => el("option", { value: v, text: t }))); s.value = nilai; return s; };

  function formTugas(def) {
    const baru = !def;
    const x = def || { kode: "", judul: "", jenis: "manual", target: 1, wajib: false, status: "aktif", bulanan: true, grup: "", grup_min: 1, url: "", urutan: 100, deskripsi: "" };
    const f = {
      kode: el("input", { class: "inp", value: x.kode, placeholder: "manual:kerja_bakti  /  hadir:rapat  /  aksi:nama  /  fitur:/html/x.html", disabled: baru ? null : "disabled" }),
      judul: el("input", { class: "inp", value: x.judul, maxlength: "80" }),
      deskripsi: el("input", { class: "inp", value: x.deskripsi || "", maxlength: "200" }),
      petunjuk: el("textarea", { class: "inp", rows: "4", maxlength: "600", placeholder: "Satu langkah per baris, bahasa sederhana. Tampil di pop-up sebagai Caranya." }),
      jenis: opsiSel(JENIS_TUGAS, x.jenis), status: opsiSel(STATUS_TUGAS, x.status),
      target: el("input", { class: "inp", inputmode: "numeric", value: String(x.target) }),
      wajib: el("input", { type: "checkbox" }), bulanan: el("input", { type: "checkbox" }),
      grup: el("input", { class: "inp", value: x.grup || "", maxlength: "30", placeholder: "mis. bergilir (kosongkan bila tidak berkelompok)" }),
      grupMin: el("input", { class: "inp", inputmode: "numeric", value: String(x.grup_min || 1) }),
      url: el("input", { class: "inp", value: x.url || "", placeholder: "/html/jurnal-olah-rasa.html" }),
      urutan: el("input", { class: "inp", inputmode: "numeric", value: String(x.urutan ?? 100) }),
    };
    f.wajib.checked = !!x.wajib; f.bulanan.checked = x.bulanan !== false; f.petunjuk.value = x.petunjuk || "";
    if (!baru) f.jenis.disabled = true;
    const galat = el("div", { class: "galat" });
    const btn = el("button", { class: "btn utama", "data-aksi": "simpan-tugas", type: "button", text: baru ? "Tambah tugas" : "Simpan" });
    btn.onclick = async () => {
      galat.textContent = ""; btn.disabled = true;
      const res = await adm("admin_tugas_simpan", {
        kode: f.kode.value.trim(), judul: f.judul.value.trim(), deskripsi: f.deskripsi.value.trim(), petunjuk: f.petunjuk.value.trim(), jenis: f.jenis.value, status: f.status.value,
        target: Number(f.target.value), wajib: f.wajib.checked, bulanan: f.bulanan.checked, grup: f.grup.value.trim(),
        grup_min: Number(f.grupMin.value), url: f.url.value.trim(), urutan: Number(f.urutan.value),
      });
      btn.disabled = false;
      if (!res.ok) { galat.textContent = pesan(res); return; }
      state.pesanHasil = "Tugas \"" + res.tugas.judul + "\" tersimpan."; muatTugas();
    };
    const lbl = (t, e, kecil) => [el("label", { class: "lbl", text: t }), e, kecil ? el("div", { class: "kecil", text: kecil }) : null];
    return el("div", {},
      ...lbl("Kode", f.kode), ...lbl("Judul", f.judul), ...lbl("Keterangan", f.deskripsi), ...lbl("Petunjuk untuk anggota (Caranya)", f.petunjuk, "Satu langkah per baris. Pop-up menampilkannya bernomor."), ...lbl("Jenis", f.jenis),
      ...lbl("Status", f.status, "Baru = terdaftar otomatis dari halaman yang dibuka anggota, belum dihitung. Aktif = dipakai."),
      ...lbl("Target (jumlah hari/kali)", f.target),
      el("label", { class: "lbl", style: "display:flex;gap:8px;align-items:center;" }, f.wajib, "Wajib (syarat dividen)"),
      el("label", { class: "lbl", style: "display:flex;gap:8px;align-items:center;" }, f.bulanan, "Dihitung per bulan (kosongkan = sekali seumur hidup)"),
      ...lbl("Kelompok bergilir", f.grup, "Tugas wajib dengan nama kelompok sama dinilai sebagai satu syarat: cukup \"min\" dari semuanya."),
      ...lbl("Minimal dari kelompok", f.grupMin), ...lbl("Tautan tombol Kerjakan", f.url), ...lbl("Urutan", f.urutan),
      galat, btn);
  }

  async function muatTugas() {
    const konten = $("konten");
    const [r, rk] = await Promise.all([adm("admin_tugas_lihat", {}), adm("admin_tugas_rekap", state.tugasBulan ? { bulan: state.tugasBulan } : {})]);
    if (!r.ok || !rk.ok) { konten.replaceChildren(el("div", { class: "galat", text: pesan(!r.ok ? r : rk) })); return; }
    const anak = [];
    if (state.pesanHasil) { anak.push(el("div", { class: "card", id: "hasilAksi", style: "border-color:#4caf7a;", text: state.pesanHasil })); state.pesanHasil = ""; }

    // ---- rekap bulan ----
    const bulan = el("input", { class: "inp", id: "tugasBulan", type: "month", value: rk.bulan, onchange: function () { state.tugasBulan = this.value; muatTugas(); } });
    const lengkap = rk.daftar.filter((x) => x.lengkap).length;
    anak.push(el("div", { class: "card", id: "rekapTugas" },
      el("div", { style: "font-weight:700;" }, "Rekap bulan"), bulan,
      el("div", { class: "kecil", text: lengkap + " dari " + rk.daftar.length + " anggota lengkap. Yang belum lengkap, dividen positifnya ditahan. Masa tahan: " + r.masa_tahan_bulan + " bulan (ubah di app_settings: tugas_masa_tahan_bulan)." }),
      el("details", {}, el("summary", { class: "kecil", text: "Lihat per anggota" }),
        ...rk.daftar.map((x) => el("div", { class: "kecil", "data-anggota": x.profile_id, style: "padding:4px 0;border-top:1px solid rgba(0,0,0,.06);", text: (x.lengkap ? "✓ " : "○ ") + "@" + x.username + " (" + x.selesai + "/" + x.total + ")" + (x.lengkap ? "" : " — kurang: " + x.kurang.join("; ")) })))));

    // ---- laporan untuk grup: bisa disalin dan ditempel di grup WhatsApp ----
    // Yang sudah lengkap diberi ✅, yang belum ⬜ (beserta tugas yang masih kurang). Ada juga versi pengingat (yang belum saja).
    const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const labelBulan = (b) => { const p = String(b).split("-"); return (NAMA_BULAN[Number(p[1]) - 1] || b) + " " + p[0]; };
    const susunLaporan = (jenis) => {
      const sudah = rk.daftar.filter((x) => x.lengkap);
      const belum = rk.daftar.filter((x) => !x.lengkap);
      const baris = [];
      const barisBelum = (x) => "⬜ @" + x.username + " — " + x.selesai + "/" + x.total + (x.kurang && x.kurang.length ? " (kurang: " + x.kurang.join(", ") + ")" : "");
      if (jenis === "pengingat") {
        baris.push("🔔 *Pengingat Tugas Bulanan — " + labelBulan(rk.bulan) + "*");
        // Yang sudah lengkap tetap disebut (apresiasi), ringkas dalam satu baris
        if (sudah.length) baris.push("", "✅ Sudah lengkap, terima kasih (" + sudah.length + "): " + sudah.map((x) => "@" + x.username).join(" "));
        if (!belum.length) { baris.push("", "Semua anggota sudah melengkapi tugas bulan ini 🎉 Terima kasih!"); return baris.join("\n"); }
        baris.push("", "Yang belum lengkap (" + belum.length + " dari " + rk.daftar.length + " anggota):", "");
        belum.forEach((x) => baris.push(barisBelum(x)));
        baris.push("", "Yuk dilengkapi. Dividen positif yang belum lengkap ditahan sampai tugasnya selesai 🌱");
        return baris.join("\n");
      }
      baris.push("📋 *Laporan Tugas Bulanan — " + labelBulan(rk.bulan) + "*");
      baris.push(sudah.length + " dari " + rk.daftar.length + " anggota sudah lengkap", "");
      baris.push("✅ *Sudah lengkap (" + sudah.length + ")*");
      if (sudah.length) sudah.forEach((x) => baris.push("✅ @" + x.username)); else baris.push("- belum ada");
      baris.push("", "⬜ *Belum lengkap (" + belum.length + ")*");
      if (belum.length) belum.forEach((x) => baris.push(barisBelum(x))); else baris.push("- semua sudah lengkap 🎉");
      if (belum.length) baris.push("", "Yang belum lengkap, dividen positifnya ditahan sampai tugas selesai. Yuk dilengkapi 🌱");
      return baris.join("\n");
    };
    const kotakLaporan = el("textarea", { class: "inp", id: "teksLaporan", rows: "12", readonly: true, style: "font-family:ui-monospace,Menlo,monospace;font-size:12px;" });
    kotakLaporan.value = susunLaporan("lengkap");
    const statusSalin = el("div", { class: "kecil", id: "statusSalinLaporan", style: "margin-top:6px;" });
    const salinTeks = async (jenis) => {
      const teks = susunLaporan(jenis);
      kotakLaporan.value = teks;
      let berhasil = false;
      try { await navigator.clipboard.writeText(teks); berhasil = true; }
      catch (e) { try { kotakLaporan.focus(); kotakLaporan.select(); berhasil = document.execCommand("copy"); } catch (e2) { berhasil = false; } }
      statusSalin.textContent = berhasil ? "Tersalin ✓ Tempel di grup." : "Gagal menyalin otomatis. Teksnya sudah dipilih, salin manual (tahan lalu Salin).";
    };
    anak.push(el("div", { class: "card", id: "laporanTugas" },
      el("div", { style: "font-weight:700;" }, "Laporan untuk grup"),
      el("div", { class: "kecil", text: "Salin lalu tempel di grup. Yang sudah lengkap diberi ✅, yang belum ⬜ beserta tugas yang masih kurang (tugas wajib bulan " + labelBulan(rk.bulan) + ")." }),
      kotakLaporan,
      el("div", { class: "aksi" },
        el("button", { class: "btn utama", id: "btnSalinLaporan", type: "button", style: "margin-top:0;", text: "Salin laporan lengkap", onclick: () => salinTeks("lengkap") }),
        el("button", { class: "btn hijau", id: "btnSalinPengingat", type: "button", text: "Salin pengingat (sertakan yang sudah)", onclick: () => salinTeks("pengingat") })),
      statusSalin));

    // ---- klaim menunggu ----
    anak.push(el("div", { class: "kecil", style: "margin:14px 4px 0;font-weight:700;color:#1c2b22;", id: "judulKlaim", text: "Klaim menunggu (" + r.klaim.length + ")" }));
    if (!r.klaim.length) anak.push(el("div", { class: "kecil", style: "padding:8px 4px;", text: "Tidak ada klaim." }));
    r.klaim.forEach((x) => {
      const galat = el("div", { class: "galat" });
      const proses = async (tombol, setuju) => {
        tombol.disabled = true;
        const res = await adm("admin_tugas_klaim_proses", { id: x.id, setuju });
        tombol.disabled = false;
        if (!res.ok) { galat.textContent = pesan(res); return; }
        state.pesanHasil = "Klaim @" + x.username + " " + (setuju ? "disetujui." : "ditolak."); muatTugas();
      };
      anak.push(el("div", { class: "card", "data-klaim": x.id },
        el("div", { style: "font-weight:700;", text: "@" + x.username + " · " + x.kode }),
        el("div", { class: "kecil", text: "Periode " + x.periode + (x.catatan ? " · " + x.catatan : "") }),
        el("div", { class: "aksi" },
          el("button", { class: "btn utama", "data-aksi": "klaim-setuju", type: "button", style: "margin-top:0;", text: "✓ Setujui", onclick: function () { proses(this, true); } }),
          el("button", { class: "btn merah", "data-aksi": "klaim-tolak", type: "button", text: "Tolak", onclick: function () { proses(this, false); } })), galat));
    });

    // ---- kegiatan dengan kode hadir ----
    const tugasHadir = r.definisi.filter((x) => x.jenis === "hadir" && x.status === "aktif");
    const jam = (ms) => { const d = new Date(ms); const p = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()); };
    const kJudul = el("input", { class: "inp", id: "kegJudul", maxlength: "80", placeholder: "mis. Rapat anggota Oktober" });
    const kTugas = opsiSel(tugasHadir.map((x) => [x.kode, x.judul]), tugasHadir[0] ? tugasHadir[0].kode : "");
    const kMulai = el("input", { class: "inp", id: "kegMulai", type: "datetime-local", value: jam(Date.now()) });
    const kSelesai = el("input", { class: "inp", id: "kegSelesai", type: "datetime-local", value: jam(Date.now() + 2 * 3600000) });
    const kGalat = el("div", { class: "galat" });
    const kBtn = el("button", { class: "btn utama", id: "btnKegiatan", type: "button", text: "Buat kode hadir" });
    kBtn.onclick = async () => {
      kGalat.textContent = ""; kBtn.disabled = true;
      const res = await adm("admin_tugas_kegiatan_buat", { judul: kJudul.value.trim(), kode_tugas: kTugas.value, mulai: new Date(kMulai.value).toISOString(), selesai: new Date(kSelesai.value).toISOString() });
      kBtn.disabled = false;
      if (!res.ok) { kGalat.textContent = pesan(res); return; }
      state.pesanHasil = "Kode hadir \"" + res.kegiatan.judul + "\": " + res.kegiatan.kode_hadir + " — umumkan ke anggota."; muatTugas();
    };
    anak.push(el("div", { class: "card", id: "kartuKegiatan" },
      el("div", { style: "font-weight:700;" }, "Kegiatan dengan kode hadir (tugas di luar web)"),
      tugasHadir.length ? el("div", {}, el("label", { class: "lbl", text: "Judul kegiatan" }), kJudul, el("label", { class: "lbl", text: "Tugas yang terpenuhi" }), kTugas,
        el("label", { class: "lbl", text: "Mulai" }), kMulai, el("label", { class: "lbl", text: "Selesai (maksimal 3 hari)" }), kSelesai, kGalat, kBtn)
        : el("div", { class: "kecil", text: "Belum ada tugas berjenis \"Kode hadir kegiatan\" yang aktif. Tambahkan di Katalog di bawah (mis. kode hadir:rapat)." })));
    r.kegiatan.forEach((g) => anak.push(el("div", { class: "card", "data-kegiatan": g.id },
      el("div", { class: "baris" }, el("div", { style: "font-weight:700;", text: g.judul }), el("span", { class: "chip " + (g.aktif ? "ok" : ""), text: g.aktif ? "Aktif" : "Ditutup" })),
      el("div", { class: "total mono", text: g.kode_hadir }),
      el("div", { class: "kecil", text: tgl(g.mulai) + " → " + tgl(g.selesai) + " · " + g.kode_tugas }),
      g.aktif ? el("div", { class: "aksi" }, el("button", { class: "btn abu", "data-aksi": "tutup-kegiatan", type: "button", text: "Tutup kode", onclick: async function () { this.disabled = true; await adm("admin_tugas_kegiatan_tutup", { id: g.id }); muatTugas(); } })) : null)));

    // ---- centang manual ----
    const manual = r.definisi.filter((x) => ["manual", "hadir"].includes(x.jenis) && x.status === "aktif");
    if (manual.length) {
      const pilih = opsiSel(manual.map((x) => [x.kode, x.judul]), manual[0].kode);
      pilih.id = "centangTugas";
      anak.push(el("div", { class: "card", id: "kartuCentang" },
        el("div", { style: "font-weight:700;" }, "Centang manual (bulan " + rk.bulan + ")"), pilih,
        ...rk.daftar.map((x) => {
          const st = el("span", { class: "kecil" });
          const kirim = async (ada) => {
            const res = await adm("admin_tugas_centang", { anggota_id: x.profile_id, kode: pilih.value, bulan: rk.bulan, ada });
            st.textContent = res.ok ? (ada ? "✓ tercatat" : "dicabut") : pesan(res);
          };
          return el("div", { class: "baris", "data-centang": x.profile_id, style: "padding:5px 0;border-top:1px solid rgba(0,0,0,.06);" },
            el("div", { text: "@" + x.username }), el("div", {}, st,
              el("button", { class: "btn hijau", "data-aksi": "centang", type: "button", style: "margin-left:6px;", text: "✓", onclick: () => kirim(true) }),
              el("button", { class: "btn abu", "data-aksi": "cabut", type: "button", style: "margin-left:4px;", text: "✕", onclick: () => kirim(false) })));
        })));
    }

    // ---- halaman baru terdeteksi: belum dihitung, pengurus memilih Jadikan tugas atau Abaikan ----
    const baru = r.definisi.filter((x) => x.status === "baru");
    const simpanStatus = async (x, status, galatEl) => {
      const res = await adm("admin_tugas_simpan", { kode: x.kode, judul: x.judul, deskripsi: x.deskripsi || "", petunjuk: x.petunjuk || "", jenis: x.jenis, status, target: x.target, wajib: x.wajib, bulanan: x.bulanan, grup: x.grup || "", grup_min: x.grup_min, url: x.url || "", urutan: x.urutan });
      if (!res.ok) { if (galatEl) galatEl.textContent = pesan(res); return false; }
      return true;
    };
    const otomatis = el("input", { type: "checkbox", id: "setOtomatis" }); otomatis.checked = !!r.daftar_otomatis;
    otomatis.onchange = async function () {
      const res = await adm("admin_pengaturan_simpan", { tugas_daftar_otomatis: this.checked });
      state.pesanHasil = res.ok ? "Pendaftaran halaman baru otomatis: " + (this.checked ? "AKTIF." : "MATI.") : pesan(res); muatTugas();
    };
    anak.push(el("div", { class: "card", id: "kartuBaru" },
      el("div", { style: "font-weight:700;", text: "Halaman baru terdeteksi (" + baru.length + ")" }),
      el("div", { class: "kecil", text: "Otomatis terdaftar saat anggota membuka sebuah halaman, satu baris per halaman. Belum dihitung sebagai tugas. Pilih Jadikan tugas bila mau dipakai, atau Abaikan." }),
      el("label", { class: "lbl", style: "display:flex;gap:8px;align-items:center;" }, otomatis, "Daftarkan halaman baru otomatis (matikan bila daftar sudah cukup)"),
      baru.length ? el("div", { class: "aksi" }, el("button", { class: "btn abu", "data-aksi": "abaikan-semua", type: "button", text: "Abaikan semua (" + baru.length + ")", onclick: async function () {
        if (!window.confirm("Abaikan " + baru.length + " halaman baru? Halaman yang diabaikan tidak dihitung dan tidak muncul lagi sebagai baru.")) return;
        this.disabled = true; const res = await adm("admin_tugas_abaikan_baru", {});
        state.pesanHasil = res.ok ? res.diabaikan + " halaman diabaikan." : pesan(res); muatTugas();
      } })) : null,
      ...baru.map((x) => {
        const galat = el("div", { class: "galat" });
        const ubah = (status, pesanOk) => async function () { this.disabled = true; if (await simpanStatus(x, status, galat)) { state.pesanHasil = pesanOk; muatTugas(); } else this.disabled = false; };
        return el("div", { "data-baru": x.kode, style: "padding:6px 0;border-top:1px solid rgba(0,0,0,.06);" },
          el("div", { class: "kecil", style: "font-weight:700;color:#1c2b22;", text: x.judul }), el("div", { class: "kecil mono", text: x.kode }),
          el("div", { class: "aksi" },
            el("button", { class: "btn hijau", "data-aksi": "jadikan", type: "button", text: "Jadikan tugas", onclick: ubah("aktif", "\"" + x.judul + "\" dijadikan tugas (tidak wajib; atur wajib dan target di katalog).") }),
            el("button", { class: "btn abu", "data-aksi": "abaikan", type: "button", text: "Abaikan", onclick: ubah("nonaktif", "\"" + x.judul + "\" diabaikan.") })), galat);
      })));

    // ---- katalog tugas (aktif dan diarsipkan) ----
    const urut = { aktif: 0, nonaktif: 1 };
    const katalog = r.definisi.filter((x) => x.status !== "baru").sort((a, b) => urut[a.status] - urut[b.status] || a.urutan - b.urutan);
    const dapatHapus = (x) => x.jenis !== "sistem" && x.kode !== "aktif" && !x.kode.startsWith("fitur:");
    anak.push(el("div", { class: "kecil", style: "margin:14px 4px 0;font-weight:700;color:#1c2b22;", id: "judulKatalog", text: "Katalog tugas (" + katalog.filter((x) => x.status === "aktif").length + " aktif, " + katalog.filter((x) => x.status === "nonaktif").length + " diarsipkan)" }));
    anak.push(el("div", { class: "kecil", style: "padding:0 4px;", text: "Arsipkan = tidak berlaku untuk periode baru. Dividen yang sudah terlanjur ditahan karena tugas itu tetap menunggu sampai dipenuhi atau dilepas paksa. Hapus hanya untuk tugas buatan sendiri yang tidak lagi mengikat dividen yang ditahan." }));
    anak.push(el("div", { class: "card" }, el("details", {}, el("summary", { style: "font-weight:700;", text: "+ Tambah tugas" }), formTugas(null))));
    katalog.forEach((x) => {
      const galat = el("div", { class: "galat" });
      const aksiBar = el("div", { class: "aksi" },
        x.status === "aktif"
          ? el("button", { class: "btn abu", "data-aksi": "arsipkan", type: "button", text: "Arsipkan", onclick: async function () { this.disabled = true; if (await simpanStatus(x, "nonaktif", galat)) { state.pesanHasil = "\"" + x.judul + "\" diarsipkan."; muatTugas(); } else this.disabled = false; } })
          : el("button", { class: "btn hijau", "data-aksi": "aktifkan", type: "button", text: "Aktifkan lagi", onclick: async function () { this.disabled = true; if (await simpanStatus(x, "aktif", galat)) { state.pesanHasil = "\"" + x.judul + "\" diaktifkan."; muatTugas(); } else this.disabled = false; } }),
        dapatHapus(x) ? el("button", { class: "btn merah", "data-aksi": "hapus-tugas", type: "button", text: "Hapus", onclick: async function () {
          if (!window.confirm("Hapus tugas \"" + x.judul + "\"? Catatan kemajuan anggota tetap tersimpan.")) return;
          this.disabled = true; const res = await adm("admin_tugas_hapus", { id: x.id }); this.disabled = false;
          if (!res.ok) { galat.textContent = pesan(res); return; }
          state.pesanHasil = "Tugas \"" + x.judul + "\" dihapus."; muatTugas();
        } }) : null);
      anak.push(el("div", { class: "card", "data-tugas": x.kode },
        el("details", {}, el("summary", {}, el("span", { style: "font-weight:700;", text: x.judul + " " }),
          el("span", { class: "chip " + (x.status === "aktif" ? "ok" : ""), text: x.status === "aktif" ? "aktif" : "diarsipkan" }),
          x.wajib ? el("span", { class: "chip gagal", style: "margin-left:4px;", text: "wajib" }) : null,
          el("div", { class: "kecil mono", text: x.kode + " · " + x.jenis + " · target " + x.target + (x.grup ? " · kelompok " + x.grup : "") })), formTugas(x), aksiBar, galat)));
    });
    konten.replaceChildren(...anak);
  }

  // ---------------- pengaturan ----------------
  function bacaQris(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("Gagal membaca gambar"));
      fr.onload = () => {
        const asli = String(fr.result);
        const img = new Image();
        const apaAdanya = () => (asli.length <= 500000 ? resolve(asli) : reject(new Error("Gambar terlalu besar")));
        // Jaga-jaga bila browser tidak memicu onload/onerror: pakai gambar asli bila cukup kecil
        const pengaman = setTimeout(apaAdanya, 1500);
        img.onerror = () => { clearTimeout(pengaman); apaAdanya(); };
        img.onload = () => {
          clearTimeout(pengaman);
          try {
            const sisi = Math.max(img.width, img.height) || 1;
            const skala = Math.min(1, 800 / sisi);
            const c = document.createElement("canvas");
            c.width = Math.round(img.width * skala); c.height = Math.round(img.height * skala);
            const g = c.getContext && c.getContext("2d");
            if (!g) return resolve(asli);
            g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
            g.drawImage(img, 0, 0, c.width, c.height);
            let out = c.toDataURL("image/png");
            if (out.length > 450000) out = c.toDataURL("image/jpeg", 0.9);
            resolve(out);
          } catch (e) { resolve(asli); }
        };
        img.src = asli;
      };
      fr.readAsDataURL(file);
    });
  }

  async function muatPengaturan() {
    const res = await adm("admin_pengaturan_ambil");
    const konten = $("konten");
    if (!res.ok) { konten.replaceChildren(el("div", { class: "galat", text: pesan(res) })); return; }
    const p = res.pengaturan;
    const kas = res.kas;
    state.qrisBaru = null;
    const f = {
      kurs: el("input", { class: "inp", id: "setKurs", inputmode: "numeric", value: String(p.kurs) }),
      min: el("input", { class: "inp", id: "setMin", inputmode: "numeric", value: String(p.min_rp) }),
      maks: el("input", { class: "inp", id: "setMaks", inputmode: "numeric", value: String(p.maks_rp) }),
      nama: el("input", { class: "inp", id: "setNama", maxlength: "80", value: p.nama_penerima || "", placeholder: "Nama yang tampil saat QRIS dipindai" }),
      aturan: el("textarea", { class: "inp", id: "setAturan", maxlength: "1500", placeholder: "Aturan singkat: arti 1 TOF, bagi hasil, cara keluar anggota" }),
      aktif: el("input", { type: "checkbox", id: "setAktif" }),
      auto: el("input", { type: "checkbox", id: "setAuto" }),
      mode: el("select", { class: "inp", id: "setMode" }, el("option", { value: "tampung", text: "Tampung dulu, bagikan per batch (disarankan)" }), el("option", { value: "langsung", text: "Langsung ke dompet anggota" })),
      penampung: el("input", { class: "inp", id: "setPenampung", value: p.alamat_penampung || "", placeholder: "Alamat dompet penampung (58 karakter)", autocomplete: "off", spellcheck: "false" }),
      ambang: el("input", { class: "inp", id: "setAmbang", inputmode: "numeric", value: String(p.ambang_batch_tof) }),
      tarik: el("input", { type: "checkbox", id: "setTarik" }),
      pinjamAktif: el("input", { type: "checkbox", id: "setPinjamAktif" }),
      pinjamMin: el("input", { class: "inp", id: "setPinjamMin", inputmode: "numeric", value: String(p.pinjam_min_rp || 10000) }),
      pinjamMaks: el("input", { class: "inp", id: "setPinjamMaks", inputmode: "numeric", value: String(p.pinjam_maks_rp || 5000000) }),
      pinjamTenggang: el("input", { class: "inp", id: "setPinjamTenggang", inputmode: "numeric", value: String(p.pinjam_tenggang_hari || 60) }), // [CICILAN]
      divBatas: el("input", { class: "inp", id: "setDivBatas", inputmode: "numeric", value: String(p.dividen_batas_minus_persen || 10) }),
      divMin: el("input", { class: "inp", id: "setDivMin", inputmode: "numeric", value: String(p.dividen_min_saldo_tof || 1) }),
      alamatTarik: el("input", { class: "inp", id: "setAlamatTarik", value: p.alamat_tarik || "", placeholder: "Alamat dompet pengurus penerima TOF (58 karakter)", autocomplete: "off", spellcheck: "false" }),
      minTarik: el("input", { class: "inp", id: "setMinTarik", inputmode: "numeric", value: String(p.min_tarik_tof) }),
      maksTarik: el("input", { class: "inp", id: "setMaksTarik", inputmode: "numeric", value: String(p.maks_tarik_tof) }),
      bHarian: el("input", { class: "inp", id: "setBatasHarian", inputmode: "numeric", value: String(p.batas_harian_tof) }),
      bTx: el("input", { class: "inp", id: "setBatasTx", inputmode: "numeric", value: String(p.batas_transaksi_tof) }),
      file: el("input", { type: "file", id: "setQris", accept: "image/png,image/jpeg,image/webp" }),
    };
    f.aturan.value = p.aturan || "";
    f.aktif.checked = !!p.aktif;
    f.auto.checked = !!p.auto_kirim;
    f.mode.value = p.mode_kirim || "tampung";
    f.tarik.checked = !!p.tarik_aktif;
    f.pinjamAktif.checked = !!p.pinjam_aktif;
    const prev = el("img", { class: "qris-prev", id: "prevQris", alt: "QRIS", hidden: !p.qris, src: p.qris || undefined });
    const galat = el("div", { class: "galat", id: "galatSet" });
    const ok = el("div", { class: "kecil", id: "okSet", style: "color:#1f6b3d;" });
    f.file.onchange = async () => {
      galat.textContent = "";
      const file = f.file.files && f.file.files[0];
      if (!file) return;
      try { state.qrisBaru = await bacaQris(file); prev.src = state.qrisBaru; prev.hidden = false; }
      catch (e) { galat.textContent = e.message; }
    };
    const simpan = el("button", { class: "btn utama", id: "btnSimpanSet", type: "button", text: "Simpan pengaturan", onclick: async () => {
      galat.textContent = ""; ok.textContent = "";
      const body = {
        kurs_rp_per_tof: Number(f.kurs.value), min_rp: Number(f.min.value), maks_rp: Number(f.maks.value),
        nama_penerima: f.nama.value, aturan: f.aturan.value, aktif: f.aktif.checked,
        auto_kirim: f.auto.checked, batas_harian_tof: Number(f.bHarian.value), batas_transaksi_tof: Number(f.bTx.value),
        mode_kirim: f.mode.value, alamat_penampung: f.penampung.value.trim(), ambang_batch_tof: Number(f.ambang.value),
        tarik_aktif: f.tarik.checked, alamat_tarik: f.alamatTarik.value.trim(), min_tarik_tof: Number(f.minTarik.value), maks_tarik_tof: Number(f.maksTarik.value),
        pinjam_aktif: f.pinjamAktif.checked, pinjam_min_rp: Number(f.pinjamMin.value), pinjam_maks_rp: Number(f.pinjamMaks.value), pinjam_tenggang_hari: Number(f.pinjamTenggang.value),
        dividen_batas_minus_persen: Number(f.divBatas.value), dividen_min_saldo_tof: Number(f.divMin.value),
      };
      if (state.qrisBaru) body.qris = state.qrisBaru;
      simpan.disabled = true;
      const r = await adm("admin_pengaturan_simpan", body);
      simpan.disabled = false;
      if (!r.ok) { galat.textContent = pesan(r); return; }
      state.qrisBaru = null;
      ok.textContent = "Pengaturan tersimpan.";
    } });
    konten.replaceChildren(el("div", { class: "card" },
      el("label", { class: "lbl", for: "setKurs", text: "Kurs: 1 TOF = berapa rupiah" }), f.kurs,
      el("div", { class: "kecil", text: "Kurs berlaku untuk tagihan baru; tagihan yang sudah dibuat tetap memakai kurs saat dibuat." }),
      el("label", { class: "lbl", for: "setMin", text: "Minimal sekali nabung (Rp)" }), f.min,
      el("label", { class: "lbl", for: "setMaks", text: "Maksimal sekali nabung (Rp)" }), f.maks,
      el("label", { class: "lbl", for: "setNama", text: "Nama penerima" }), f.nama,
      el("div", { class: "kecil", text: "Samakan dengan nama merchant yang muncul saat QRIS dipindai, supaya anggota bisa memastikan tujuan bayarnya benar." }),
      el("label", { class: "lbl", for: "setAturan", text: "Aturan yang tampil ke anggota" }), f.aturan,
      el("label", { class: "lbl", for: "setQris", text: "Gambar QRIS kas bersama (DANA, GoPay, atau lainnya)" }), f.file, prev,
      el("label", { class: "lbl", style: "display:flex;gap:8px;align-items:center;" }, f.aktif, "Nabung dibuka untuk anggota"),
      el("div", { class: "kecil", style: "margin-top:16px;font-weight:700;color:#1c2b22;", text: "Penampungan & pembagian" }),
      el("label", { class: "lbl", for: "setMode", text: "Ke mana TOF dikirim setelah dikonfirmasi" }), f.mode,
      el("label", { class: "lbl", for: "setPenampung", text: "Alamat dompet penampung" }), f.penampung,
      el("div", { class: "kecil", text: "Dompet penampung harus sudah opt-in TOF. Pembagian dari dompet ini dilakukan pengurus pemilik dompet itu (kuncinya tidak di server)." }),
      el("label", { class: "lbl", for: "setAmbang", text: "Minimal TOF terkumpul sebelum dibagikan" }), f.ambang,
      el("div", { class: "kecil", style: "margin-top:16px;font-weight:700;color:#1c2b22;", text: "Tarik dana (TOF → uang)" }),
      el("label", { class: "lbl", style: "display:flex;gap:8px;align-items:center;" }, f.tarik, "Penarikan dibuka untuk anggota"),
      el("label", { class: "lbl", for: "setAlamatTarik", text: "Dompet pengurus penerima TOF penarikan" }), f.alamatTarik,
      el("div", { class: "kecil", text: "Anggota mengirim TOF ke alamat ini; uang dikirim manual oleh pengurus. Pakai dompet milik pengurus yang memproses penarikan." }),
      el("label", { class: "lbl", for: "setMinTarik", text: "Minimal sekali tarik (TOF)" }), f.minTarik,
      el("label", { class: "lbl", for: "setMaksTarik", text: "Maksimal sekali tarik (TOF)" }), f.maksTarik,
      el("div", { class: "kecil", style: "margin-top:16px;font-weight:700;color:#1c2b22;", text: "Pinjam ke diri sendiri" }),
      el("label", { class: "lbl", style: "display:flex;gap:8px;align-items:center;" }, f.pinjamAktif, "Pinjaman dibuka untuk anggota"),
      el("label", { class: "lbl", for: "setPinjamMin", text: "Minimal sekali pinjam (Rp)" }), f.pinjamMin,
      el("label", { class: "lbl", for: "setPinjamMaks", text: "Batas total pinjaman berjalan per anggota (Rp)" }), f.pinjamMaks,
      el("label", { class: "lbl", for: "setPinjamTenggang", text: "Masa tenggang setelah jatuh tempo sebelum TOF dipotong otomatis (hari)" }), f.pinjamTenggang,
      el("div", { class: "kecil", text: "Batas tiap anggota tetap dibatasi nilai TOF-nya sendiri. Bunga 5% flat. QRIS di atas dipakai juga untuk pelunasan. Bunga dikirim balik sebagai TOF lewat dompet pembayar (butuh Kirim TOF otomatis aktif). Anggota boleh mencicil dan boleh meminjam lagi selama total sisa pokok di bawah batas. Setelah jatuh tempo + masa tenggang tanpa pembayaran, TOF jaminan dipotong otomatis (butuh frasa anggota dititip dan dompet pembayar aktif). Masa tenggang pinjaman yang sudah berjalan tidak berubah; hanya pinjaman baru yang memakai angka baru." }),
      el("div", { class: "kecil", style: "margin-top:16px;font-weight:700;color:#1c2b22;", text: "Dividen" }),
      el("label", { class: "lbl", for: "setDivBatas", text: "Batas koreksi minus per periode (%) — juga dicatat di persetujuan anggota" }), f.divBatas,
      el("label", { class: "lbl", for: "setDivMin", text: "Saldo TOF minimum untuk ikut dividen" }), f.divMin,
      el("div", { class: "kecil", text: "Menaikkan batas minus membuat anggota yang sudah setuju diminta menyetujui ulang." }),
      el("div", { class: "kecil", style: "margin-top:16px;font-weight:700;color:#1c2b22;", text: "Kirim TOF otomatis" }),
      el("div", { class: "kecil", id: "infoKas", text: !kas
        ? "Dompet pembayar belum diatur di server (secret PAYOUT_MNEMONIC). Selama belum, TOF dikirim manual."
        : "Dompet pembayar: " + kas.alamat + (kas.galat ? " (saldo gagal dibaca)" : " · ALGO " + (kas.algo / 1e6) + " · TOF " + (kas.tof / 1e6) + (kas.tof_optin ? "" : " · BELUM opt-in TOF")) + " · terkirim otomatis 24 jam terakhir: " + (p.terpakai_24j / 1e6) + " TOF" }),
      el("label", { class: "lbl", style: "display:flex;gap:8px;align-items:center;" }, f.auto, "Kirim TOF otomatis setelah pengurus mengonfirmasi"),
      el("label", { class: "lbl", for: "setBatasTx", text: "Batas per transaksi (TOF)" }), f.bTx,
      el("label", { class: "lbl", for: "setBatasHarian", text: "Batas total per 24 jam (TOF)" }), f.bHarian,
      el("div", { class: "kecil", text: "Isi dompet pembayar secukupnya saja. Kerugian terburuk bila ada penyalahgunaan dibatasi oleh isi dompet itu dan batas harian ini." }),
      galat, ok, simpan));
  }

  // ---------------- Reset PIN (anggota lupa PIN) ----------------
  // Pengurus membuat kode 8 digit sekali pakai (berlaku 60 menit). Kode hanya tampil SEKALI di sini;
  // server hanya menyimpan hash-nya. Anggota memakainya lewat tombol "Lupa PIN?" di halaman masuk.
  async function muatResetPin() {
    const konten = $("konten");
    const galat = el("div", { class: "galat", id: "galatResetPin" });
    const target = el("input", { class: "inp", id: "resetTarget", maxlength: "30", autocomplete: "off", spellcheck: "false", placeholder: "Username anggota yang lupa PIN" });
    const hasil = el("div", { id: "hasilResetPin", hidden: true });
    const buat = el("button", { class: "btn utama", id: "btnBuatKodeReset", type: "button", text: "Buat kode reset", onclick: async function () {
      galat.textContent = "";
      hasil.hidden = true;
      hasil.replaceChildren();
      const nama = target.value.trim().replace(/^@/, "");
      if (!nama) { galat.textContent = "Isi username anggotanya."; return; }
      if (!window.confirm("Buat kode reset PIN untuk @" + nama + "?\nPastikan benar-benar anggota itu yang meminta (mis. lewat WhatsApp yang kamu kenal).")) return;
      this.disabled = true;
      const res = await adm("admin_reset_pin", { target: nama });
      this.disabled = false;
      if (!res.ok) { galat.textContent = pesan(res); return; }
      const kode = res.kode.slice(0, 4) + " " + res.kode.slice(4);
      const wa = "Halo @" + res.username + ", ini kode reset PIN ToFarmer kamu: " + kode +
        "\n\nBuka ToFarmer → Masuk → Lupa PIN? → \"Saya sudah punya kode dari admin\". Berlaku " + res.berlaku_menit + " menit. Jangan dibagikan ke siapa pun.";
      const info = el("div", { class: "kecil", style: "margin-top:8px;", text: "Kode ini tidak bisa ditampilkan lagi. Kalau hilang, buat kode baru (kode lama otomatis diganti)." });
      // Reset akun pengurus: pemakai kode bisa membuat PIN baru lalu membuka frasa dompetnya, jadi beri peringatan
      const infoPengurus = res.target_pengurus ? el("div", { class: "galat", id: "peringatanPengurus", style: "margin-top:8px;", text: "Ini akun PENGURUS. Pemakai kode bisa membuat PIN baru dan membuka frasa dompetnya. Kirim hanya langsung ke orangnya." }) : null;
      const salin = el("button", { class: "btn hijau", id: "btnSalinPesanReset", type: "button", style: "margin-top:10px;", text: "Salin pesan WhatsApp", onclick: async function () {
        try { await navigator.clipboard.writeText(wa); this.textContent = "Tersalin ✓"; }
        catch (e) { window.prompt("Salin pesan ini:", wa); }
      } });
      hasil.replaceChildren(el("div", { class: "card", style: "border-color:#4caf7a;text-align:center;" },
        el("div", { class: "kecil", text: "Kode untuk @" + res.username }),
        el("div", { class: "total mono", id: "kodeResetTampil", style: "letter-spacing:4px;margin-top:6px;", text: kode }),
        info, infoPengurus, salin));
      hasil.hidden = false;
      target.value = "";
    } });
    konten.replaceChildren(
      el("div", { class: "card" },
        el("div", { style: "font-weight:700;", text: "Reset PIN anggota" }),
        el("div", { class: "kecil", text: "Untuk anggota yang lupa PIN. PIN lama tetap berlaku sampai kode dipakai, jadi aman kalau ternyata anggota ingat lagi. Pengurus bisa mereset pengurus lain (bukan akun sendiri)." }),
        el("label", { class: "lbl", for: "resetTarget", text: "Username anggota" }), target,
        galat, buat),
      hasil);
  }

  // ---------------- mulai ----------------
  async function buka() {
    const pin = $("pinPengurus").value.trim();
    $("galatGerbang").textContent = "";
    if (!/^\d{6}$/.test(pin)) { $("galatGerbang").textContent = "PIN harus 6 digit angka."; return; }
    $("btnBuka").disabled = true;
    state.pin = pin;
    const res = await adm("admin_pengaturan_ambil");
    $("btnBuka").disabled = false;
    $("pinPengurus").value = "";
    if (!res.ok) { state.pin = ""; $("galatGerbang").textContent = pesan(res); return; }
    $("gerbang").hidden = true;
    $("isi").hidden = false;
    document.querySelectorAll(".tab").forEach((t) => { t.onclick = () => muatTab(t.getAttribute("data-tab")); });
    muatTab("aktif");
  }

  function mulai() {
    const wallet = localStorage.getItem("tof_wallet");
    if (!wallet) {
      const balik = window.location.pathname + window.location.search;
      try { localStorage.setItem("redirect_to", balik); } catch (e) { /* abaikan */ }
      if (!CFG.tanpaRedirect) window.location.href = "login.html?next=" + encodeURIComponent(balik);
      $("galatGerbang").textContent = "Masuk dulu lewat halaman login.";
      $("btnBuka").disabled = true;
      return;
    }
    state.wallet = wallet;
    $("btnBuka").onclick = buka;
    $("pinPengurus").onkeydown = (e) => { if (e.key === "Enter") buka(); };
    window.addEventListener("pagehide", () => { state.pin = ""; });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mulai);
  else mulai();
})();
