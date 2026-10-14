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
      case "txid_belum_ada": return "Transaksi ini belum punya ID transaksi untuk diperiksa.";
      case "network": return "Koneksi bermasalah, coba lagi.";
      default: return "Gagal: " + (res.error || "tidak diketahui");
    }
  }

  const STATUS = { ditampung: ["TOF ditampung (menunggu pembagian)", "ok"], mengirim: ["TOF sedang dikirim / perlu dicek", "tunggu"], menunggu: ["Menunggu pembayaran", "tunggu"], dibayar: ["Anggota bilang sudah bayar", "tunggu"], dikonfirmasi: ["Terkonfirmasi, TOF belum dikirim", "ok"],
    selesai: ["Selesai", "ok"], ditolak: ["Ditolak", "gagal"], dibatalkan: ["Dibatalkan", "gagal"], kedaluwarsa: ["Kedaluwarsa", "gagal"] };
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

  // Kirim TOF dari dompet penampung ke tiap anggota batch. Ditandatangani DI BROWSER pengurus pemilik dompet penampung:
  // frasa dibuka sebentar dengan PIN, dipakai menandatangani, lalu dihapus dari memori.
  async function bagikanBatch(batch, items, progres) {
    const rv = await adm("reveal");
    if (!rv.ok) throw new Error(pesan(rv));
    let sk = null;
    try {
      const pulih = algosdk.mnemonicToSecretKey(rv.mnemonic);
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
        const blobs = txns.map((t) => t.signTxn(sk));
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
      bHarian: el("input", { class: "inp", id: "setBatasHarian", inputmode: "numeric", value: String(p.batas_harian_tof) }),
      bTx: el("input", { class: "inp", id: "setBatasTx", inputmode: "numeric", value: String(p.batas_transaksi_tof) }),
      file: el("input", { type: "file", id: "setQris", accept: "image/png,image/jpeg,image/webp" }),
    };
    f.aturan.value = p.aturan || "";
    f.aktif.checked = !!p.aktif;
    f.auto.checked = !!p.auto_kirim;
    f.mode.value = p.mode_kirim || "tampung";
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
