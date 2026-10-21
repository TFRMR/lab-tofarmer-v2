// ============================================================
// ToFarmer Dompet — dompet Algorand di browser
// Fitur: saldo (ALGO & TOF), terima, kirim, opt-in TOF, frasa (titip/lihat), riwayat
//
// Keamanan:
// - Frasa dititip terenkripsi di server (Edge Function "tof-vault"), dibuka dengan PIN.
// - Transaksi ditandatangani DI BROWSER: frasa dibuka sebentar lewat PIN, kunci dipakai
//   untuk menandatangani lalu dihapus dari memori. Frasa tidak disimpan di browser.
// - Setiap transaksi menampilkan layar konfirmasi dan meminta PIN.
// ============================================================
(function () {
  "use strict";

  // ---------------- konfigurasi ----------------
  const CFG = window.DOMPET_CONFIG || {};
  const ALGOD = CFG.algod || "https://mainnet-api.algonode.cloud";
  const IDX = CFG.idx || "https://mainnet-idx.algonode.cloud";
  const TOF_ASSET_ID = 3558306283;
  const JEDA_CEK_MS = CFG.jeda ?? 1500;
  const MAKS_CEK = CFG.maksCek ?? 30;
  const EXPLORER_TX = "https://allo.info/tx/";

  const SATU = 1000000n;       // 1 ALGO / 1 TOF = 10^6 unit terkecil
  const FEE = 1000n;           // biaya transaksi minimum (0,001 ALGO)
  const MBR_ASET = 100000n;    // saldo minimum bertambah 0,1 ALGO untuk tiap aset yang di-opt-in

  const state = {
    wallet: null,
    username: null,
    ringkas: null,   // { algo, minBal, tof, tofOptin }
    status: null,    // { has_vault, has_pin, pin_publik }
    topup: null,     // info Nabung dari server (kurs, QRIS, aturan)
    pinjam: null,    // info Pinjam dari server (bunga, tenor, batas)
    terkunci: 0n,    // TOF yang sedang menjadi jaminan pinjaman (unit terkecil)
    popupPinjamTampil: false,
    dividen: null,       // status syarat dividen (frasa, persetujuan)
    tugas: null,         // tugas bulan ini dan dividen yang ditahan
    dividenIngat: false
  };

  // ---------------- util DOM ----------------
  const $ = (id) => document.getElementById(id);

  function el(tag, props, ...anak) {
    const e = document.createElement(tag);
    if (props) {
      for (const k of Object.keys(props)) {
        const v = props[k];
        if (k === "class") e.className = v;
        else if (k === "text") e.textContent = v;
        else if (k.startsWith("on")) e[k] = v;
        else if (v === true) e.setAttribute(k, "");
        else if (v !== false && v != null) e.setAttribute(k, v);
      }
    }
    for (const a of anak.flat()) {
      if (a == null || a === false) continue;
      e.append(a.nodeType ? a : document.createTextNode(String(a)));
    }
    return e;
  }

  let toastTimer = null;
  function toast(teks) {
    let t = $("toast");
    if (!t) {
      t = el("div", { id: "toast", class: "toast" });
      document.body.append(t);
    }
    t.textContent = teks;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  async function salin(teks, pesan) {
    try {
      await navigator.clipboard.writeText(teks);
      toast(pesan || "Disalin");
    } catch {
      toast("Gagal menyalin, salin manual ya");
    }
  }

  // ---------------- angka ----------------
  // Teks → unit terkecil (BigInt), tanpa float. Menerima "1,5" atau "1.5", maksimal 6 desimal.
  function parseUnits(teks) {
    const t = String(teks == null ? "" : teks).trim().replace(",", ".");
    if (!/^\d+(\.\d{1,6})?$/.test(t)) return null;
    const [w, f = ""] = t.split(".");
    return BigInt(w) * SATU + BigInt((f + "000000").slice(0, 6));
  }

  function fmtUnits(u) {
    u = BigInt(u);
    const neg = u < 0n;
    if (neg) u = -u;
    const w = (u / SATU).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const f = (u % SATU).toString().padStart(6, "0").replace(/0+$/, "");
    return (neg ? "-" : "") + (f ? w + "," + f : w);
  }

  function fmtRp(n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function pendek(addr) {
    return addr ? addr.slice(0, 6) + "…" + addr.slice(-6) : "";
  }

  // ---------------- jaringan Algorand (REST langsung) ----------------
  async function algodGet(path) {
    const r = await fetch(ALGOD + path);
    if (!r.ok) throw new Error("algod " + r.status);
    return r.json();
  }

  async function ringkasAkun(addr) {
    const j = await algodGet("/v2/accounts/" + addr);
    const aset = (j.assets || []).find((a) => Number(a["asset-id"]) === TOF_ASSET_ID);
    return {
      algo: BigInt(j.amount || 0),
      minBal: BigInt(j["min-balance"] || 0),
      tof: aset ? BigInt(aset.amount || 0) : 0n,
      tofOptin: !!aset
    };
  }

  async function ambilParams() {
    const p = await algodGet("/v2/transactions/params");
    return {
      flatFee: true,
      fee: Number(FEE),
      firstRound: p["last-round"],
      lastRound: p["last-round"] + 1000,
      genesisID: p["genesis-id"],
      genesisHash: p["genesis-hash"]
    };
  }

  async function kirimMentah(blob) {
    let r;
    try {
      r = await fetch(ALGOD + "/v2/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/x-binary" },
        body: blob
      });
    } catch (e) {
      // Jaringan putus: transaksi mungkin sudah diterima node → hasilnya TIDAK PASTI
      throw Object.assign(new Error("Koneksi terputus saat mengirim. Hasil tidak pasti."), { ambigu: true });
    }
    const teks = await r.text();
    let j = {};
    try { j = JSON.parse(teks); } catch { /* bukan JSON */ }
    if (!r.ok) throw new Error(j.message || teks || "Transaksi ditolak jaringan");
    return j.txId;
  }

  const tidur = (ms) => new Promise((res) => setTimeout(res, ms));

  async function tungguKonfirmasi(txId) {
    for (let i = 0; i < MAKS_CEK; i++) {
      try {
        const j = await algodGet("/v2/transactions/pending/" + txId);
        if (j["pool-error"]) throw new Error(j["pool-error"]);
        if (j["confirmed-round"] > 0) return true;
      } catch (e) {
        if (!/algod 404/.test(String(e.message))) throw e;
      }
      await tidur(JEDA_CEK_MS);
    }
    return false; // belum terkonfirmasi dalam batas waktu (transaksi mungkin tetap berhasil)
  }

  // ---------------- server brankas ----------------
  async function vault(action, body) {
    try {
      const { data, error } = await supabaseClient.functions.invoke("tof-vault", {
        body: Object.assign({ action }, body || {})
      });
      if (error) {
        console.log(error);
        return { ok: false, error: "network" };
      }
      return data || { ok: false, error: "empty" };
    } catch (e) {
      console.log(e);
      return { ok: false, error: "network" };
    }
  }

  function pesanVault(res) {
    switch (res.error) {
      case "bad_pin": return "PIN salah (sisa percobaan: " + (res.left == null ? "?" : res.left) + ")";
      case "bad_pin_format": return "PIN harus 6 digit angka.";
      case "locked": return "Terlalu banyak salah PIN. Coba lagi " + (res.retry_min || 15) + " menit lagi.";
      case "no_pin": return "Akun ini belum punya PIN. Buat PIN dulu lewat halaman login.";
      case "pin_publik": return "PIN dompet masih sama dengan PIN lama yang terbuka di halaman lain. Buat PIN dompet baru di menu Frasa.";
      case "tarik_nonaktif": return "Penarikan belum dibuka oleh pengurus.";
      case "saldo_tof_kurang": return "Jumlah melebihi saldo TOF-mu (" + fmtUnits(res.saldo_units || 0) + " TOF).";
      case "masih_ada_penarikan": return "Kamu masih punya penarikan yang berjalan. Buka Riwayat tarik untuk melihatnya.";
      case "jenis_tidak_valid": return "Pilih jenis tujuan (DANA, GoPay, OVO, ShopeePay, LinkAja, atau Bank).";
      case "nomor_tidak_valid": return "Nomor tujuan harus angka 5–25 digit.";
      case "nama_tidak_valid": return "Nama pemilik akun tidak valid (huruf/angka, 2–60 karakter).";
      case "alamat_tarik_sama": return "Akun ini adalah dompet penerima penarikan, tidak bisa menarik ke dirinya sendiri.";
      case "gagal_baca_saldo": return "Gagal membaca saldo dari jaringan Algorand. Coba lagi.";
      case "chain_tidak_tersedia": return "Server belum bisa memeriksa jaringan Algorand. Hubungi pengurus.";
      case "txid_sudah_dipakai": return "ID transaksi ini sudah dipakai untuk penarikan lain.";
      case "bad_txid": return "ID transaksi tidak valid.";
      case "topup_nonaktif": return "Nabung belum dibuka oleh pengurus.";
      case "jumlah_tidak_valid": return "Jumlah tarik harus antara " + (res.min_tarik_tof || 0) + " dan " + (res.maks_tarik_tof || 0) + " TOF.";
      case "nominal_tidak_valid": return "Nominal harus bilangan bulat Rp " + fmtRp(res.min_rp || 0) + " sampai Rp " + fmtRp(res.maks_rp || 0) + ".";
      case "masih_ada_tagihan": return "Kamu masih punya tagihan aktif. Buka Riwayat nabung untuk melanjutkannya.";
      case "terlalu_sering": return "Batas 5 tagihan per 24 jam tercapai. Coba lagi besok.";
      case "kode_unik_habis": return "Sedang ramai, coba lagi beberapa menit lagi.";
      case "status_tidak_cocok": return "Status tagihan sudah berubah. Buka Riwayat nabung untuk melihat yang terbaru.";
      case "pin_sama": return "PIN baru harus berbeda dari PIN lama.";
      case "pin_baru_sama_publik": return "PIN baru tidak boleh sama dengan PIN di halaman lain (Jurnal, Scan, Tracker). Pilih PIN lain.";
      case "bad_mnemonic": return "Frasa tidak valid (harus 25 kata yang benar).";
      case "mnemonic_mismatch": return "Frasa ini bukan milik dompet akunmu.";
      case "no_vault": return "Belum ada frasa yang dititipkan.";
      case "not_found": return "Akun tidak ditemukan.";
      case "sesi_tidak_valid": return "Sesi login sudah habis. Keluar lalu masuk lagi.";
      case "kode_hadir_salah": return "Kode hadir tidak dikenal. Periksa lagi kodenya.";
      case "kegiatan_di_luar_waktu": return "Kegiatan ini belum mulai atau sudah selesai.";
      case "sudah_hadir": return "Kamu sudah tercatat hadir di kegiatan ini.";
      case "tugas_tidak_ditemukan": return "Tugas tidak ditemukan atau tidak aktif.";
      case "klaim_sudah_ada": return "Klaim ini sudah menunggu persetujuan pengurus.";
      case "pinjam_nonaktif": return "Pinjaman belum dibuka oleh pengurus.";
      case "masih_ada_pinjaman": return "Kamu masih punya pinjaman yang berjalan. Lunasi dulu lewat menu Pinjam > Pinjamanku.";
      case "pinjam_melebihi_batas": return "Pinjaman melebihi batas: maksimal Rp " + fmtRp(res.maks_rp || 0) + " (nilai TOF yang tidak sedang terkunci).";
      case "pinjam_min_rp": return "Jumlah pinjaman minimal Rp " + fmtRp(res.min_rp || 0) + ".";
      case "tenor_tidak_valid": return "Lama pinjam tidak valid.";
      case "pinjam_tidak_ditemukan": return "Pinjaman tidak ditemukan.";
      case "jaminan_terkunci": return "Sebagian TOF-mu sedang menjadi jaminan pinjaman. Yang bisa dipakai sekarang: " + fmtUnits(res.bebas_units || 0) + " TOF.";
      case "network": return "Koneksi bermasalah, coba lagi.";
      default: return "Gagal: " + (res.error || "tidak diketahui");
    }
  }

  // ---------------- tanda tangan & kirim ----------------
  // Frasa dibuka dengan PIN → kunci dipakai menandatangani → dihapus dari memori.
  async function tandatanganDanKirim(pin, bangun) {
    const rv = await vault("reveal", { profile_id: state.wallet, pin });
    if (!rv.ok) {
      const e = new Error(pesanVault(rv));
      e.tampil = true;
      throw e;
    }
    let kunci = null;
    try {
      const pulih = algosdk.mnemonicToSecretKey(rv.mnemonic);
      if (String(pulih.addr) !== state.wallet) {
        throw new Error("Frasa di brankas tidak cocok dengan alamat dompet ini.");
      }
      kunci = pulih.sk;
      const sp = await ambilParams();
      const txn = bangun(sp);
      const blob = txn.signTxn(kunci);
      const txId = txn.txID();
      await kirimMentah(blob);
      const pasti = await tungguKonfirmasi(txId);
      return { txId, pasti };
    } finally {
      rv.mnemonic = "";
      if (kunci) kunci.fill(0);
    }
  }

  const enc = (catatan) => (catatan ? new TextEncoder().encode(catatan) : undefined);

  function bangunKirimAlgo(tujuan, jumlahU, catatan) {
    return (sp) => algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: state.wallet, to: tujuan, amount: jumlahU, note: enc(catatan), suggestedParams: sp
    });
  }

  function bangunKirimTof(tujuan, jumlahU, catatan) {
    return (sp) => algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      from: state.wallet, to: tujuan, amount: jumlahU, assetIndex: TOF_ASSET_ID,
      note: enc(catatan), suggestedParams: sp
    });
  }

  function bangunOptin() {
    return (sp) => algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      from: state.wallet, to: state.wallet, amount: 0, assetIndex: TOF_ASSET_ID, suggestedParams: sp
    });
  }

  // ---------------- pemeriksaan sebelum kirim ----------------
  function bisaDikirimAlgo(r) {
    const v = r.algo - r.minBal - FEE;
    return v > 0n ? v : 0n;
  }

  async function periksaKirim(aset, tujuan, jumlahU, catatan) {
    if (!algosdk.isValidAddress(tujuan)) return "Alamat tujuan tidak valid.";
    if (tujuan === state.wallet) return "Tidak bisa mengirim ke alamat dompet sendiri.";
    if (jumlahU == null || jumlahU <= 0n) return "Isi jumlah dengan angka lebih dari 0 (maksimal 6 desimal).";
    if (catatan && new TextEncoder().encode(catatan).length > 200) return "Catatan terlalu panjang (maksimal 200 karakter).";

    let me, dia;
    try {
      [me, dia] = await Promise.all([ringkasAkun(state.wallet), ringkasAkun(tujuan)]);
    } catch {
      return "Gagal membaca saldo dari jaringan Algorand. Coba lagi.";
    }
    state.ringkas = me;

    if (aset === "ALGO") {
      const maks = bisaDikirimAlgo(me);
      if (jumlahU > maks) {
        return "Saldo ALGO tidak cukup. Yang bisa dikirim: " + fmtUnits(maks) +
          " ALGO (0,1 ALGO + 0,1 per aset harus tersisa di dompet, ditambah biaya 0,001).";
      }
      if (dia.algo === 0n && jumlahU < MBR_ASET) {
        return "Alamat tujuan belum aktif di jaringan. Kirim minimal 0,1 ALGO agar aktif.";
      }
    } else {
      if (!me.tofOptin) return "Dompetmu belum opt-in TOF.";
      if (jumlahU > me.tof) return "Saldo TOF tidak cukup. Saldo: " + fmtUnits(me.tof) + " TOF.";
      if (state.terkunci > 0n && jumlahU > me.tof - state.terkunci) return pesanVault({ error: "jaminan_terkunci", bebas_units: me.tof > state.terkunci ? me.tof - state.terkunci : 0n });
      if (bisaDikirimAlgo(me) <= 0n && me.algo - me.minBal < FEE) {
        return "Saldo ALGO tidak cukup untuk biaya transaksi (0,001 ALGO).";
      }
      if (!dia.tofOptin) return "Penerima belum opt-in TOF. Minta penerima melakukan opt-in dulu, kalau tidak TOF tidak bisa masuk.";
    }
    return null;
  }

  async function periksaOptin() {
    let me;
    try {
      me = await ringkasAkun(state.wallet);
    } catch {
      return "Gagal membaca saldo dari jaringan Algorand. Coba lagi.";
    }
    state.ringkas = me;
    if (me.tofOptin) return "Dompetmu sudah opt-in TOF.";
    const butuh = me.minBal + MBR_ASET + FEE;
    if (me.algo < butuh) {
      return "Saldo ALGO belum cukup. Butuh minimal " + fmtUnits(butuh) + " ALGO (kurang " + fmtUnits(butuh - me.algo) + " ALGO).";
    }
    return null;
  }

  // ---------------- sheet (panel bawah) ----------------
  function bukaSheet(judul) {
    const overlay = el("div", { class: "overlay" });
    const body = el("div", { class: "sheet-body" });
    const judulEl = el("div", { class: "sheet-title", text: judul });
    let saatTutup = null;

    const api = {
      body,
      setJudul: (t) => { judulEl.textContent = t; },
      ganti: (...anak) => { body.replaceChildren(...anak.flat().filter(Boolean)); },
      onTutup: (fn) => { saatTutup = fn; },
      tutup: () => { if (saatTutup) saatTutup(); body.replaceChildren(); overlay.remove(); }
    };

    const sheet = el("div", { class: "sheet" },
      el("div", { class: "sheet-head" }, judulEl,
        el("button", { class: "x", "aria-label": "Tutup", onclick: api.tutup, text: "✕" })),
      body);
    overlay.append(sheet);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) api.tutup(); });
    $("sheetRoot").append(overlay);
    return api;
  }

  const pinInput = (id) => el("input", {
    id, class: "inp", type: "password", inputmode: "numeric", maxlength: "6",
    autocomplete: "off", placeholder: "PIN 6 digit"
  });

  // Layar konfirmasi + PIN + eksekusi + hasil
  function layarKonfirmasi(sheet, { judul, baris, catatan, tombol, jalankan, kembali, suksesLayar }) {
    const galat = el("div", { class: "galat", id: "galatKonfirmasi" });
    const pin = pinInput("pinKonfirmasi");
    const btn = el("button", { class: "btn utama", id: "btnKonfirmasi", text: tombol });
    const tabel = el("div", { class: "ringkas" },
      baris.map(([k, v, mono]) => el("div", { class: "baris" },
        el("div", { class: "k", text: k }),
        el("div", { class: "v" + (mono ? " mono" : ""), text: v }))));

    sheet.setJudul(judul);
    sheet.ganti(
      tabel,
      catatan ? el("div", { class: "info", text: catatan }) : null,
      el("label", { class: "lbl", for: "pinKonfirmasi", text: "Masukkan PIN untuk menandatangani" }),
      pin, galat, btn,
      kembali ? el("button", { class: "btn teks", text: "Kembali", onclick: kembali }) : null
    );

    btn.onclick = async () => {
      const p = pin.value.trim();
      galat.textContent = "";
      if (!/^\d{6}$/.test(p)) { galat.textContent = "PIN harus 6 digit angka."; return; }
      btn.disabled = true;
      btn.textContent = "Memproses…";
      try {
        const hasil = await jalankan(p);
        pin.value = "";
        (suksesLayar || layarSukses)(sheet, hasil);
      } catch (e) {
        pin.value = "";
        btn.disabled = false;
        btn.textContent = tombol;
        galat.textContent = e.tampil ? e.message : "Gagal: " + (e.message || "tidak diketahui");
      }
    };
  }

  function layarSukses(sheet, { txId, pasti }) {
    sheet.setJudul(pasti ? "Berhasil" : "Terkirim");
    sheet.ganti(
      el("div", { class: "sukses" },
        el("div", { class: "ikon", text: pasti ? "✓" : "…" }),
        el("div", { class: "judul", text: pasti ? "Transaksi berhasil" : "Transaksi terkirim" }),
        el("div", { class: "sub", text: pasti
          ? "Sudah tercatat di blockchain Algorand."
          : "Belum terkonfirmasi dalam batas waktu. Cek riwayatnya sebentar lagi." }),
        el("div", { class: "mono kecil", text: txId }),
        el("a", { class: "tautan", href: EXPLORER_TX + txId, target: "_blank", rel: "noopener", text: "Lihat di explorer" })),
      el("button", { class: "btn sekunder", id: "btnSalinTx", text: "Salin ID transaksi", onclick: () => salin(txId, "ID transaksi disalin") }),
      el("button", { class: "btn utama", text: "Selesai", onclick: () => { sheet.tutup(); muatData(); } })
    );
  }

  // ---------------- panel: Terima ----------------
  function panelTerima() {
    const s = bukaSheet("Terima");
    const qr = el("div", { class: "qr", id: "qrBox" });
    s.ganti(
      el("div", { class: "tengah" }, qr),
      el("div", { class: "lbl", text: "Alamat dompetmu" }),
      el("div", { class: "alamat-penuh mono", id: "alamatPenuh", text: state.wallet }),
      el("button", { class: "btn utama", text: "Salin alamat", onclick: () => salin(state.wallet, "Alamat disalin") }),
      el("div", { class: "info", text: "Untuk menerima TOF, dompet harus opt-in TOF dulu (menu Opt-in). ALGO bisa langsung diterima." })
    );
    try {
      if (typeof QRCode !== "undefined") new QRCode(qr, { text: state.wallet, width: 176, height: 176 });
    } catch (e) { console.log("QR gagal:", e); }
  }

  // ---------------- panel: Kirim ----------------
  function panelKirim() {
    if (!bolehTandatangan()) return;
    const s = bukaSheet("Kirim");
    tampilFormKirim(s, {});
  }

  function tampilFormKirim(s, isi) {
    s.setJudul("Kirim");
    const aset = el("select", { class: "inp", id: "kirimAset" },
      el("option", { value: "ALGO", text: "ALGO" }),
      el("option", { value: "TOF", text: "TOF" }));
    aset.value = isi.aset || "ALGO";
    const tujuan = el("input", { class: "inp", id: "kirimTujuan", placeholder: "Alamat tujuan (58 karakter)", autocomplete: "off", spellcheck: "false", value: isi.tujuan || "" });
    const jumlah = el("input", { class: "inp", id: "kirimJumlah", placeholder: "Jumlah, contoh 1,5", inputmode: "decimal", autocomplete: "off", value: isi.jumlah || "" });
    const catatan = el("input", { class: "inp", id: "kirimCatatan", placeholder: "Catatan (opsional)", maxlength: "200", autocomplete: "off", value: isi.catatan || "" });
    const galat = el("div", { class: "galat", id: "galatKirim" });
    const btnMaks = el("button", { class: "mini", id: "btnMaks", type: "button", text: "Maks" });
    const btn = el("button", { class: "btn utama", id: "btnLanjutKirim", text: "Lanjut" });

    const saldoInfo = el("div", { class: "kecil abu", id: "infoSaldoKirim" });
    const perbaruiInfo = () => {
      const r = state.ringkas;
      if (!r) return;
      saldoInfo.textContent = aset.value === "ALGO"
        ? "Bisa dikirim: " + fmtUnits(bisaDikirimAlgo(r)) + " ALGO"
        : "Saldo: " + fmtUnits(r.tof) + " TOF";
    };
    aset.onchange = perbaruiInfo;
    perbaruiInfo();

    btnMaks.onclick = () => {
      const r = state.ringkas;
      if (!r) return;
      jumlah.value = fmtUnits(aset.value === "ALGO" ? bisaDikirimAlgo(r) : r.tof).replace(/\./g, "");
    };

    s.ganti(
      el("label", { class: "lbl", for: "kirimAset", text: "Aset" }), aset,
      el("label", { class: "lbl", for: "kirimTujuan", text: "Tujuan" }), tujuan,
      el("label", { class: "lbl", for: "kirimJumlah", text: "Jumlah" }),
      el("div", { class: "baris-input" }, jumlah, btnMaks),
      saldoInfo,
      el("label", { class: "lbl", for: "kirimCatatan", text: "Catatan" }), catatan,
      galat, btn
    );

    btn.onclick = async () => {
      galat.textContent = "";
      const t = tujuan.value.trim();
      const j = parseUnits(jumlah.value);
      const c = catatan.value.trim();
      btn.disabled = true;
      btn.textContent = "Memeriksa…";
      const masalah = await periksaKirim(aset.value, t, j, c);
      btn.disabled = false;
      btn.textContent = "Lanjut";
      if (masalah) { galat.textContent = masalah; return; }

      const nama = aset.value;
      const kembali = () => tampilFormKirim(s, { aset: nama, tujuan: t, jumlah: jumlah.value, catatan: c });
      layarKonfirmasi(s, {
        judul: "Konfirmasi kirim",
        baris: [
          ["Kirim", fmtUnits(j) + " " + nama],
          ["Ke", t, true],
          ["Biaya", "0,001 ALGO"],
          c ? ["Catatan", c] : null
        ].filter(Boolean),
        catatan: "Periksa alamat tujuan dengan teliti. Transaksi blockchain tidak bisa dibatalkan.",
        tombol: "Kirim sekarang",
        kembali,
        jalankan: (pin) => tandatanganDanKirim(pin,
          nama === "ALGO" ? bangunKirimAlgo(t, j, c) : bangunKirimTof(t, j, c))
      });
    };
  }

  // ---------------- panel: Opt-in ----------------
  async function panelOptin() {
    if (!bolehTandatangan()) return;
    const s = bukaSheet("Opt-in TOF");
    s.ganti(el("div", { class: "info", text: "Memeriksa dompetmu…" }));
    const masalah = await periksaOptin();
    if (masalah) {
      s.ganti(el("div", { class: "info", text: masalah }),
        el("button", { class: "btn utama", text: "Tutup", onclick: s.tutup }));
      return;
    }
    layarKonfirmasi(s, {
      judul: "Opt-in TOF",
      baris: [
        ["Aksi", "Aktifkan penerimaan TOF"],
        ["Biaya", "0,001 ALGO"],
        ["Saldo ditahan", "0,1 ALGO (saldo minimum, bukan hilang)"]
      ],
      catatan: "Opt-in membuat dompetmu bisa menerima TOF. Dilakukan sekali saja.",
      tombol: "Opt-in sekarang",
      jalankan: (pin) => tandatanganDanKirim(pin, bangunOptin())
    });
  }

  // ---------------- panel: Frasa ----------------
  function panelFrasa() {
    const s = bukaSheet("Frasa dompet");
    tampilMenuFrasa(s);
  }

  function tampilMenuFrasa(s) {
    s.setJudul("Frasa dompet");
    const st = state.status || {};
    const anak = [];

    if (st.pin_publik) {
      anak.push(el("div", { class: "info", text: "Akun lamamu perlu diamankan dulu. PIN lama masih tersimpan dalam bentuk yang bisa dibaca publik di halaman lain (Jurnal, Scan, Tracker), sehingga belum aman untuk melindungi frasa. Buat PIN dompet baru yang berbeda, lalu titip frasa." }));
      anak.push(el("button", { class: "btn utama", id: "btnAmankan", text: "Buat PIN dompet baru", onclick: () => tampilAmankanPin(s) }));
    } else if (!st.has_pin) {
      anak.push(el("div", { class: "info", text: "Akun ini belum punya PIN. Buat PIN dulu lewat halaman login." }));
    } else {
      anak.push(el("div", { class: "status " + (st.has_vault ? "ok" : "belum"), id: "statusFrasa",
        text: st.has_vault ? "Frasa tersimpan di brankas terenkripsi" : "Belum ada frasa yang dititipkan" }));
      anak.push(el("div", { class: "kecil abu", text: "Frasa 25 kata adalah kunci dompetmu. Hanya bisa dibuka dengan PIN dan tidak pernah disimpan di browser." }));
      anak.push(el("button", { class: "btn utama", id: "btnTitip", text: st.has_vault ? "Ganti frasa yang dititip" : "Titip frasa", onclick: () => tampilTitip(s) }));
      if (st.has_vault) anak.push(el("button", { class: "btn sekunder", id: "btnLihat", text: "Lihat frasa", onclick: () => tampilLihat(s) }));
    }
    anak.push(el("button", { class: "btn teks", text: "Tutup", onclick: s.tutup }));
    s.ganti(anak);
  }

  // Akun lama: PIN dompet dipisah dari PIN lama (yang hash-nya masih terbaca publik di halaman lain)
  function tampilAmankanPin(s) {
    s.setJudul("Buat PIN dompet baru");
    const lama = pinInput("amanPinLama");
    lama.placeholder = "PIN lama (6 digit)";
    const baru = pinInput("amanPinBaru");
    baru.placeholder = "PIN dompet baru (6 digit)";
    const ulang = pinInput("amanPinUlang");
    ulang.placeholder = "Ulangi PIN dompet baru";
    const galat = el("div", { class: "galat", id: "galatAman" });
    const btn = el("button", { class: "btn utama", id: "btnSimpanPinBaru", text: "Simpan PIN baru" });

    s.ganti(
      el("div", { class: "info", text: "PIN baru dipakai untuk login, Dompet, dan frasa. Halaman Jurnal, Scan, dan Tracker tetap memakai PIN lama sampai dipindah. Pilih PIN yang berbeda dari PIN lama, dan jangan sama dengan PIN di halaman lain." }),
      el("label", { class: "lbl", for: "amanPinLama", text: "PIN lama" }), lama,
      el("label", { class: "lbl", for: "amanPinBaru", text: "PIN dompet baru" }), baru,
      el("label", { class: "lbl", for: "amanPinUlang", text: "Ulangi PIN dompet baru" }), ulang,
      galat, btn,
      el("button", { class: "btn teks", text: "Kembali", onclick: () => tampilMenuFrasa(s) })
    );

    btn.onclick = async () => {
      galat.textContent = "";
      const a = lama.value.trim(), b = baru.value.trim(), c = ulang.value.trim();
      if (!/^\d{6}$/.test(a) || !/^\d{6}$/.test(b)) { galat.textContent = "PIN harus 6 digit angka."; return; }
      if (b !== c) { galat.textContent = "PIN baru dan ulangannya tidak sama."; return; }
      if (a === b) { galat.textContent = "PIN baru harus berbeda dari PIN lama."; return; }
      btn.disabled = true;
      btn.textContent = "Menyimpan…";
      const res = await vault("ganti_pin", { profile_id: state.wallet, pin: a, pin_baru: b });
      lama.value = ""; baru.value = ""; ulang.value = "";
      btn.disabled = false;
      btn.textContent = "Simpan PIN baru";
      if (!res.ok) { galat.textContent = pesanVault(res); return; }
      state.status = Object.assign({}, state.status, { pin_publik: false });
      renderBanner();
      toast("PIN dompet baru tersimpan. Sekarang titip frasa.");
      tampilTitip(s);
    };
  }

  function tampilTitip(s) {
    s.setJudul("Titip frasa");
    const frasa = el("textarea", { class: "inp", id: "titipFrasa", rows: "3", placeholder: "kata1 kata2 kata3 … (25 kata)", autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
    const pin = pinInput("titipPin");
    const galat = el("div", { class: "galat", id: "galatTitip" });
    const btn = el("button", { class: "btn utama", id: "btnSimpanFrasa", text: "Simpan di brankas" });

    s.ganti(
      el("div", { class: "kecil abu", text: "Tempel 25 kata frasa dompetmu. Disimpan terenkripsi dan hanya bisa dibuka dengan PIN." }),
      frasa, pin, galat, btn,
      el("button", { class: "btn teks", text: "Kembali", onclick: () => { frasa.value = ""; tampilMenuFrasa(s); } })
    );

    btn.onclick = async () => {
      galat.textContent = "";
      const f = frasa.value.trim();
      const p = pin.value.trim();
      if (!f) { galat.textContent = "Tempel frasa 25 kata dulu."; return; }
      if (!/^\d{6}$/.test(p)) { galat.textContent = "PIN harus 6 digit angka."; return; }
      btn.disabled = true;
      btn.textContent = "Menyimpan…";
      const res = await vault("deposit", { profile_id: state.wallet, pin: p, mnemonic: f });
      frasa.value = "";
      pin.value = "";
      btn.disabled = false;
      btn.textContent = "Simpan di brankas";
      if (!res.ok) { galat.textContent = pesanVault(res); return; }
      state.status = Object.assign({}, state.status, { has_vault: true });
      renderBanner();
      toast("Frasa tersimpan di brankas");
      tampilMenuFrasa(s);
    };
  }

  function tampilLihat(s) {
    s.setJudul("Lihat frasa");
    const pin = pinInput("lihatPin");
    const galat = el("div", { class: "galat", id: "galatLihat" });
    const btn = el("button", { class: "btn utama", id: "btnBukaFrasa", text: "Buka brankas" });

    s.ganti(
      el("div", { class: "kecil abu", text: "Pastikan tidak ada yang mengintip layarmu." }),
      pin, galat, btn,
      el("button", { class: "btn teks", text: "Kembali", onclick: () => tampilMenuFrasa(s) })
    );

    btn.onclick = async () => {
      galat.textContent = "";
      const p = pin.value.trim();
      if (!/^\d{6}$/.test(p)) { galat.textContent = "PIN harus 6 digit angka."; return; }
      btn.disabled = true;
      btn.textContent = "Membuka…";
      const res = await vault("reveal", { profile_id: state.wallet, pin: p });
      pin.value = "";
      if (!res.ok) {
        btn.disabled = false;
        btn.textContent = "Buka brankas";
        galat.textContent = pesanVault(res);
        return;
      }
      tampilkanFrasa(s, res.mnemonic);
      res.mnemonic = "";
    };
  }

  function tampilkanFrasa(s, mnemonic) {
    let frasa = mnemonic;
    let sisa = 60;
    let timer = null;
    const grid = el("div", { class: "grid-frasa", id: "gridFrasa" });
    frasa.split(" ").forEach((kata, i) => {
      grid.append(el("div", { class: "kata" }, el("span", { class: "no", text: String(i + 1) }), kata));
    });
    const hitung = el("b", { id: "hitungFrasa", text: String(sisa) });

    const bersihkan = () => {
      if (timer) clearInterval(timer);
      frasa = "";
      grid.replaceChildren();
    };
    s.onTutup(bersihkan);

    s.setJudul("Frasa dompetmu");
    s.ganti(
      el("div", { class: "kecil abu" }, "Jangan dibagikan ke siapa pun. Tertutup otomatis dalam ", hitung, " detik."),
      grid,
      el("button", { class: "btn sekunder", id: "btnSalinFrasa", text: "Salin", onclick: () => salin(frasa, "Frasa disalin. Hapus dari clipboard setelah disimpan.") }),
      el("button", { class: "btn utama", id: "btnSelesaiFrasa", text: "Selesai", onclick: s.tutup })
    );

    timer = setInterval(() => {
      sisa--;
      hitung.textContent = String(Math.max(sisa, 0));
      if (sisa <= 0) s.tutup();
    }, 1000);
  }

  // ---------------- aturan tombol ----------------
  function bolehTandatangan() {
    const st = state.status || {};
    if (st.pin_publik) {
      toast("Amankan akunmu dulu: buat PIN dompet baru di menu Frasa.");
      panelFrasa();
      return false;
    }
    if (!st.has_pin) {
      toast("Buat PIN dulu lewat halaman login.");
      return false;
    }
    if (!st.has_vault) {
      toast("Titip frasa dulu agar bisa mengirim.");
      panelFrasa();
      return false;
    }
    return true;
  }

  // ---------------- tampilan utama ----------------
  function renderSaldo() {
    const r = state.ringkas;
    if (!r) return;
    $("saldoAlgo").textContent = fmtUnits(r.algo);
    $("saldoTof").textContent = fmtUnits(r.tof);
    $("infoOptin").textContent = r.tofOptin ? "" : "belum opt-in";
    $("infoMin").textContent = "Saldo minimum yang harus tersisa: " + fmtUnits(r.minBal) + " ALGO";
  }

  function renderBanner() {
    const b = $("banner");
    const st = state.status || {};
    let teks = "";
    if (st.pin_publik) teks = "Akun lama: buat PIN dompet baru di menu Frasa, lalu titip frasa, agar bisa Kirim dan Opt-in. Saldo dan Terima tetap bisa dipakai.";
    else if (st.has_pin && !st.has_vault) teks = "Titip frasa di menu Frasa agar bisa Kirim dan Opt-in.";
    else if (!st.has_pin) teks = "Akun ini belum punya PIN. Buat PIN lewat halaman login untuk memakai Kirim dan Frasa.";
    b.textContent = teks;
    b.hidden = !teks;
  }

  function renderNabung() {
    const info = state.topup;
    const kartu = $("nabungCard");
    if (!kartu) return;
    kartu.hidden = !(info && info.aktif);
    if (info && info.aktif) {
      $("nabungInfo").textContent = "Setor receh ke kas bersama dan terima TOF di dompetmu. 1 TOF = Rp " + fmtRp(info.kurs) + "."
        + (info.mode_kirim === "tampung" ? " TOF ditampung dulu dan dibagikan setelah setoran bersama terkumpul minimal " + info.ambang_batch_tof + " TOF." : "");
    }
    $("btnNabung").onclick = panelNabung;
  }

  // ---------------- Tarik dana (TOF → uang) ----------------
  // Anggota mengirim TOF ke dompet pengurus; server memverifikasi transfernya di blockchain; pengurus lalu mengirim
  // uang ke DANA/GoPay/OVO/rekening anggota.
  const STATUS_TARIK = {
    menunggu_tof: ["Menunggu TOF dikirim", "tunggu"],
    tof_dikirim: ["TOF terkirim, menunggu verifikasi", "tunggu"],
    tof_diterima: ["TOF diterima, uang akan dikirim pengurus", "ok"],
    dibayar: ["Uang sudah dikirim", "ok"],
    ditolak: ["Ditolak pengurus", "gagal"],
    dibatalkan: ["Dibatalkan", "gagal"],
    kedaluwarsa: ["Kedaluwarsa", "gagal"]
  };
  const PERSEN_TARIK = [5, 10, 25, 50, 75, 100];

  // unit → "12,5" tanpa pemisah ribuan (aman diisikan ke kolom jumlah)
  function desimalPlain(u) {
    u = BigInt(u);
    const w = (u / SATU).toString();
    const f = (u % SATU).toString().padStart(6, "0").replace(/0+$/, "");
    return f ? w + "," + f : w;
  }

  function chipTarik(status) {
    const [teks, kelas] = STATUS_TARIK[status] || [status, ""];
    return el("span", { class: "chip " + kelas, text: teks });
  }

  function renderTarik() {
    const info = state.topup;
    const kartu = $("tarikCard");
    if (!kartu) return;
    kartu.hidden = !(info && info.tarik_aktif);
    if (info && info.tarik_aktif) {
      $("tarikInfo").textContent = "Tukar TOF-mu menjadi uang (1 TOF = Rp " + fmtRp(info.kurs) + ") ke DANA, GoPay, OVO, atau rekening bank. Minimal " + info.min_tarik_tof + " TOF.";
    }
    $("btnTarik").onclick = panelTarik;
  }

  function panelTarik() {
    const info = state.topup;
    if (!info || !info.tarik_aktif) { toast("Penarikan belum dibuka oleh pengurus."); return; }
    if (!bolehTandatangan()) return;
    const s = bukaSheet("Tarik dana");
    tampilFormTarik(s, info, {});
  }

  function tampilFormTarik(s, info, isi) {
    s.setJudul("Tarik dana");
    const saldoEl = el("div", { class: "kecil abu", id: "tarikSaldo", text: "Membaca saldo TOF…" });
    const perbaruiSaldo = () => { if (state.ringkas) saldoEl.textContent = "Saldo TOF: " + fmtUnits(state.ringkas.tof) + " TOF"; };
    perbaruiSaldo();
    ringkasAkun(state.wallet).then((r) => { state.ringkas = r; perbaruiSaldo(); }).catch(() => { saldoEl.textContent = "Saldo TOF belum terbaca. Coba buka ulang."; });

    const jenis = el("select", { class: "inp", id: "tarikJenis" },
      ["DANA", "GoPay", "OVO", "ShopeePay", "LinkAja", "Bank"].map((j) => el("option", { value: j, text: j })));
    jenis.value = isi.jenis || "DANA";
    const bank = el("input", { class: "inp", id: "tarikBank", placeholder: "Nama bank (mis. BCA, BRI, Mandiri)", autocomplete: "off", value: isi.bank || "" });
    const nomor = el("input", { class: "inp", id: "tarikNomor", inputmode: "numeric", placeholder: "Nomor HP (DANA/GoPay/OVO) atau nomor rekening", autocomplete: "off", value: isi.nomor || "" });
    const nama = el("input", { class: "inp", id: "tarikNama", placeholder: "Nama pemilik akun / rekening", autocomplete: "off", value: isi.nama || "" });
    const jumlah = el("input", { class: "inp", id: "tarikJumlah", inputmode: "decimal", placeholder: "Jumlah TOF, contoh 12,5", autocomplete: "off", value: isi.jumlah || "" });
    const preview = el("div", { class: "kecil abu", id: "tarikPreview", text: "Pilih persen atau ketik jumlah TOF." });
    const galat = el("div", { class: "galat", id: "galatTarik" });
    const grid = el("div", { class: "grid-nominal", id: "gridPersen" });
    const btn = el("button", { class: "btn utama", id: "btnLanjutTarik", text: "Lanjut" });

    const tampilBank = () => { bank.style.display = jenis.value === "Bank" ? "" : "none"; };
    jenis.onchange = tampilBank; tampilBank();

    const hitung = () => {
      const u = parseUnits(jumlah.value);
      if (u == null || u <= 0n) { preview.textContent = "Pilih persen atau ketik jumlah TOF."; return; }
      preview.textContent = "Kamu menerima sekitar Rp " + fmtRp(Number((u * BigInt(info.kurs)) / SATU)) + " (1 TOF = Rp " + fmtRp(info.kurs) + ").";
    };
    jumlah.oninput = () => { grid.querySelectorAll(".mini").forEach((x) => x.classList.remove("pilih")); hitung(); };
    PERSEN_TARIK.forEach((pc) => {
      const b = el("button", { class: "mini", type: "button", text: pc + "%", "data-persen": String(pc) });
      b.onclick = () => {
        if (!state.ringkas) { galat.textContent = "Saldo TOF belum terbaca, coba lagi sebentar."; return; }
        galat.textContent = "";
        const u = (state.ringkas.tof * BigInt(pc)) / 100n; // dibulatkan ke bawah: tidak pernah melebihi saldo
        jumlah.value = desimalPlain(u);
        grid.querySelectorAll(".mini").forEach((x) => x.classList.remove("pilih"));
        b.classList.add("pilih");
        hitung();
      };
      grid.append(b);
    });
    hitung();

    s.ganti(
      el("div", { class: "info", text: "TOF dikirim ke dompet pengurus. Setelah pengurus memeriksa, uang dikirim ke tujuan di bawah. Prosesnya manual." }),
      saldoEl,
      el("label", { class: "lbl", text: "Jumlah TOF" }), grid, jumlah, preview,
      el("label", { class: "lbl", for: "tarikJenis", text: "Uang dikirim ke" }), jenis, bank,
      el("label", { class: "lbl", for: "tarikNomor", text: "Nomor tujuan" }), nomor,
      el("label", { class: "lbl", for: "tarikNama", text: "Atas nama" }), nama,
      galat, btn,
      el("button", { class: "btn teks", id: "btnRiwayatTarik", text: "Riwayat tarik", onclick: () => tampilRiwayatTarik(s, info, {}) })
    );

    btn.onclick = async () => {
      galat.textContent = "";
      const units = parseUnits(jumlah.value);
      const jenisTujuan = jenis.value === "Bank" ? "Bank " + bank.value.trim() : jenis.value;
      const nomorBersih = nomor.value.replace(/[\s-]/g, "");
      const namaBersih = nama.value.trim();
      if (units == null || units <= 0n) { galat.textContent = "Isi jumlah TOF (angka, maksimal 6 desimal) atau pilih persen."; return; }
      if (units < BigInt(info.min_tarik_tof) * SATU || units > BigInt(info.maks_tarik_tof) * SATU) { galat.textContent = pesanVault({ error: "jumlah_tidak_valid", min_tarik_tof: info.min_tarik_tof, maks_tarik_tof: info.maks_tarik_tof }); return; }
      if (jenis.value === "Bank" && !/^[A-Za-z0-9 .&-]{2,30}$/.test(bank.value.trim())) { galat.textContent = "Isi nama bank (2–30 karakter)."; return; }
      if (!/^\d{5,25}$/.test(nomorBersih)) { galat.textContent = pesanVault({ error: "nomor_tidak_valid" }); return; }
      if (!/^[A-Za-z0-9 .,'-]{2,60}$/.test(namaBersih)) { galat.textContent = pesanVault({ error: "nama_tidak_valid" }); return; }
      btn.disabled = true; btn.textContent = "Memeriksa…";
      let me;
      try { me = await ringkasAkun(state.wallet); } catch { btn.disabled = false; btn.textContent = "Lanjut"; galat.textContent = "Gagal membaca saldo dari jaringan Algorand. Coba lagi."; return; }
      btn.disabled = false; btn.textContent = "Lanjut";
      state.ringkas = me;
      if (!me.tofOptin || units > me.tof) { galat.textContent = "Jumlah melebihi saldo TOF-mu (" + fmtUnits(me.tof) + " TOF)."; return; }
      if (state.terkunci > 0n && units > me.tof - state.terkunci) { galat.textContent = pesanVault({ error: "jaminan_terkunci", bebas_units: me.tof > state.terkunci ? me.tof - state.terkunci : 0n }); return; }
      if (me.algo - me.minBal < FEE) { galat.textContent = "Saldo ALGO tidak cukup untuk biaya transaksi (0,001 ALGO)."; return; }
      const rp = Number((units * BigInt(info.kurs)) / SATU);
      const sisa = { jumlah: jumlah.value, jenis: jenis.value, bank: bank.value, nomor: nomor.value, nama: nama.value };
      layarKonfirmasi(s, {
        judul: "Konfirmasi tarik dana",
        baris: [
          ["Tarik", fmtUnits(units) + " TOF"],
          ["Uang diterima", "Rp " + fmtRp(rp)],
          ["Dikirim ke", jenisTujuan + " · " + nomorBersih],
          ["Atas nama", namaBersih],
          ["TOF dikirim ke", info.alamat_tarik, true],
          ["Biaya jaringan", "0,001 ALGO"]
        ],
        catatan: "Pastikan nomor tujuan dan nama sudah benar. Transfer TOF di blockchain tidak bisa dibatalkan, dan uang dikirim ke tujuan persis seperti yang kamu tulis.",
        tombol: "Tarik sekarang",
        kembali: () => tampilFormTarik(s, info, sisa),
        suksesLayar: layarSuksesTarik,
        jalankan: (pin) => prosesTarik(pin, { units, jenis: jenisTujuan, nomor: nomorBersih, nama: namaBersih })
      });
    };
  }

  // 1) buat permintaan di server  2) kirim TOF ke dompet pengurus (ditandatangani di browser)  3) laporkan ID transaksi
  async function prosesTarik(pin, data) {
    const buat = await vault("tarik_buat", { profile_id: state.wallet, pin, jumlah_units: Number(data.units), jenis: data.jenis, nomor: data.nomor, nama: data.nama });
    if (!buat.ok) { const e = new Error(pesanVault(buat)); e.tampil = true; throw e; }
    let hasil;
    try {
      hasil = await tandatanganDanKirim(pin, bangunKirimTof(buat.alamat_tarik, BigInt(buat.tarik.jumlah_tof_units), buat.catatan_transaksi));
    } catch (e) {
      if (e && e.ambigu) {
        const g = new Error("Koneksi terputus saat mengirim TOF dan hasilnya tidak pasti. JANGAN kirim ulang. Buka Riwayat tarik atau hubungi pengurus untuk memeriksanya.");
        g.tampil = true;
        throw g;
      }
      // TOF pasti belum terkirim: batalkan permintaan agar tidak menggantung
      await vault("tarik_batal", { profile_id: state.wallet, pin, id: buat.tarik.id });
      const g = new Error("TOF tidak terkirim (" + ((e && e.message) || "ditolak jaringan") + "). Permintaan tarik dibatalkan, saldo TOF-mu tidak berubah.");
      g.tampil = true;
      throw g;
    }
    const lapor = await vault("tarik_tof_terkirim", { profile_id: state.wallet, pin, id: buat.tarik.id, txid: hasil.txId });
    return { txId: hasil.txId, pasti: hasil.pasti, tarik: lapor.ok ? lapor.tarik : buat.tarik, laporGagal: lapor.ok ? null : pesanVault(lapor) };
  }

  function layarSuksesTarik(sheet, h) {
    const t = h.tarik;
    sheet.setJudul("Permintaan tarik terkirim");
    const pesan = h.laporGagal
      ? "TOF sudah terkirim, tetapi pelaporan ke server gagal (" + h.laporGagal + "). Simpan ID transaksi di bawah dan hubungi pengurus."
      : t.status === "tof_diterima"
        ? "TOF-mu sudah diterima pengurus. Pengurus akan mengirim Rp " + fmtRp(t.jumlah_rp) + " ke " + t.tujuan_jenis + " " + t.tujuan_nomor + " a.n. " + t.tujuan_nama + "."
        : "TOF sudah terkirim dan sedang diverifikasi jaringan. " + (t.catatan_sistem || "Periksa lagi di Riwayat tarik sebentar lagi.");
    sheet.ganti(
      el("div", { class: "sukses" },
        el("div", { class: "ikon", text: t.status === "tof_diterima" && !h.laporGagal ? "✓" : "…" }),
        el("div", { class: "judul", text: "TOF terkirim ke pengurus" }),
        el("div", { class: "sub", id: "pesanSuksesTarik", text: pesan }),
        el("div", { class: "mono kecil", text: h.txId }),
        el("a", { class: "tautan", href: EXPLORER_TX + h.txId, target: "_blank", rel: "noopener", text: "Lihat di explorer" })),
      el("button", { class: "btn sekunder", text: "Salin ID transaksi", onclick: () => salin(h.txId, "ID transaksi disalin") }),
      el("button", { class: "btn utama", text: "Selesai", onclick: () => { sheet.tutup(); muatData(); } })
    );
  }

  function tampilRiwayatTarik(s, info, sesi) {
    s.setJudul("Riwayat tarik");
    const pin = pinInput("tarikPinRiwayat");
    const galat = el("div", { class: "galat", id: "galatRiwayatTarik" });
    const btn = el("button", { class: "btn utama", id: "btnBukaRiwayatTarik", text: "Buka riwayat" });
    s.ganti(
      el("div", { class: "kecil abu", text: "Masukkan PIN untuk melihat riwayat penarikanmu." }), pin, galat, btn,
      el("button", { class: "btn teks", text: "Kembali", onclick: () => tampilFormTarik(s, info, {}) })
    );
    btn.onclick = async () => {
      galat.textContent = "";
      const p = pin.value.trim();
      if (!/^\d{6}$/.test(p)) { galat.textContent = "PIN harus 6 digit angka."; return; }
      const res = await vault("tarik_saya", { profile_id: state.wallet, pin: p });
      pin.value = "";
      if (!res.ok) { galat.textContent = pesanVault(res); return; }
      sesi.pin = p;
      daftarRiwayatTarik(s, info, sesi, res.daftar);
    };
  }

  function daftarRiwayatTarik(s, info, sesi, daftar) {
    s.setJudul("Riwayat tarik");
    const baris = daftar.length
      ? daftar.slice().reverse().map((r) => el("div", { class: "baris-nabung", "data-id": r.id, onclick: () => detailTarik(s, info, sesi, r) },
          el("div", {}, el("div", { text: fmtUnits(r.jumlah_tof_units) + " TOF → Rp " + fmtRp(r.jumlah_rp) }), el("div", { class: "kecil abu", text: new Date(r.dibuat).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) })),
          el("div", { class: "tengah" }, chipTarik(r.status))))
      : [el("div", { class: "kosong", text: "Belum ada penarikan." })];
    s.ganti(el("div", { id: "daftarTarik" }, baris), el("button", { class: "btn teks", text: "Kembali", onclick: () => tampilFormTarik(s, info, {}) }));
  }

  function detailTarik(s, info, sesi, r) {
    s.setJudul("Detail tarik");
    const galat = el("div", { class: "galat", id: "galatDetailTarik" });
    const aksi = [];
    if (r.status === "tof_dikirim" && r.tof_txid) {
      aksi.push(el("button", { class: "btn sekunder", id: "btnPeriksaTarik", text: "Periksa ulang", onclick: async () => {
        const res = await vault("tarik_periksa", { profile_id: state.wallet, pin: sesi.pin, id: r.id });
        if (!res.ok) { galat.textContent = pesanVault(res); return; }
        detailTarik(s, info, sesi, res.tarik);
      } }));
    }
    if (r.status === "menunggu_tof") {
      aksi.push(el("button", { class: "btn teks", id: "btnBatalTarik", text: "Batalkan (hanya jika TOF belum dikirim)", onclick: async () => {
        if (!window.confirm("Batalkan permintaan ini? Jangan batalkan kalau TOF sudah kamu kirim.")) return;
        const res = await vault("tarik_batal", { profile_id: state.wallet, pin: sesi.pin, id: r.id });
        if (!res.ok) { galat.textContent = pesanVault(res); return; }
        detailTarik(s, info, sesi, res.tarik);
      } }));
    }
    s.ganti(
      el("div", { class: "tengah" }, chipTarik(r.status)),
      el("div", { class: "total-bayar", text: "Rp " + fmtRp(r.jumlah_rp) }),
      el("div", { class: "kecil abu tengah", text: fmtUnits(r.jumlah_tof_units) + " TOF" }),
      el("div", { class: "ringkas" },
        el("div", { class: "baris" }, el("div", { class: "k", text: "Dikirim ke" }), el("div", { class: "v", text: r.tujuan_jenis + " · " + r.tujuan_nomor })),
        el("div", { class: "baris" }, el("div", { class: "k", text: "Atas nama" }), el("div", { class: "v", text: r.tujuan_nama })),
        r.ref_bayar ? el("div", { class: "baris" }, el("div", { class: "k", text: "Referensi pengurus" }), el("div", { class: "v", text: r.ref_bayar })) : null),
      r.catatan_sistem ? el("div", { class: "info", text: r.catatan_sistem }) : null,
      r.status === "ditolak" && r.catatan_admin ? el("div", { class: "info", text: "Alasan: " + r.catatan_admin }) : null,
      r.tof_txid ? el("a", { class: "tautan", href: EXPLORER_TX + r.tof_txid, target: "_blank", rel: "noopener", text: "Lihat transaksi TOF di explorer" }) : null,
      galat, ...aksi,
      el("button", { class: "btn teks", id: "btnKembaliDaftarTarik", text: "Kembali", onclick: async () => {
        const res = await vault("tarik_saya", { profile_id: state.wallet, pin: sesi.pin });
        if (res.ok) daftarRiwayatTarik(s, info, sesi, res.daftar); else tampilRiwayatTarik(s, info, sesi);
      } })
    );
  }

  // ---------------- Nabung TOF (top-up rupiah via QRIS, dikonfirmasi pengurus) ----------------
  const STATUS_NABUNG = {
    menunggu: ["Menunggu pembayaran", "tunggu"],
    dibayar: ["Menunggu dicek pengurus", "tunggu"],
    dikonfirmasi: ["Pembayaran dikonfirmasi, TOF disiapkan", "ok"],
    mengirim: ["TOF sedang dikirim", "tunggu"],
    ditampung: ["TOF ditampung, menunggu pembagian", "tunggu"],
    selesai: ["TOF sudah terkirim", "ok"],
    ditolak: ["Ditolak pengurus", "gagal"],
    dibatalkan: ["Dibatalkan", "gagal"],
    kedaluwarsa: ["Kedaluwarsa", "gagal"]
  };

  function chipStatus(status) {
    const [teks, kelas] = STATUS_NABUNG[status] || [status, ""];
    return el("span", { class: "chip " + kelas, text: teks });
  }

  function panelNabung() {
    const info = state.topup;
    if (!info || !info.aktif) { toast("Nabung belum dibuka oleh pengurus."); return; }
    const s = bukaSheet("Nabung TOF");
    const sesi = { pin: "" };
    s.onTutup(() => { sesi.pin = ""; });
    tampilFormNabung(s, info, sesi);
  }

  function tampilFormNabung(s, info, sesi) {
    s.setJudul("Nabung TOF");
    let nominal = 0;
    const inputNominal = el("input", { class: "inp", id: "nabungNominal", inputmode: "numeric", placeholder: "Atau ketik nominal lain (Rp)", autocomplete: "off" });
    const preview = el("div", { class: "kecil abu", id: "nabungPreview", text: "Pilih nominal untuk melihat TOF yang kamu terima." });
    const pin = pinInput("nabungPin");
    const galat = el("div", { class: "galat", id: "galatNabung" });
    const btn = el("button", { class: "btn utama", id: "btnBuatTagihan", text: "Buat tagihan" });
    const grid = el("div", { class: "grid-nominal" });

    const hitung = () => {
      if (!Number.isInteger(nominal) || nominal <= 0) { preview.textContent = "Pilih nominal untuk melihat TOF yang kamu terima."; return; }
      const tof = (BigInt(nominal) * SATU) / BigInt(info.kurs);
      preview.textContent = "Kamu menerima sekitar " + fmtUnits(tof) + " TOF (kode unik 1–99 rupiah ikut dikonversi).";
    };
    [5000, 10000, 25000, 50000, 100000].forEach((n) => {
      const b = el("button", { class: "mini", type: "button", text: fmtRp(n), "data-nominal": String(n) });
      b.onclick = () => {
        nominal = n; inputNominal.value = "";
        grid.querySelectorAll(".mini").forEach((x) => x.classList.remove("pilih"));
        b.classList.add("pilih"); hitung();
      };
      grid.append(b);
    });
    inputNominal.oninput = () => {
      grid.querySelectorAll(".mini").forEach((x) => x.classList.remove("pilih"));
      nominal = /^\d+$/.test(inputNominal.value.trim()) ? Number(inputNominal.value.trim()) : 0;
      hitung();
    };

    const peringatan = state.ringkas && !state.ringkas.tofOptin
      ? el("div", { class: "info", id: "peringatanOptin" },
          "Dompetmu belum opt-in TOF, jadi TOF belum bisa masuk. ",
          el("button", { class: "mini", type: "button", id: "btnOptinDulu", text: "Opt-in dulu", onclick: () => { s.tutup(); panelOptin(); } }))
      : null;

    s.ganti(
      info.aturan ? el("div", { class: "info", id: "nabungAturan", text: info.aturan }) : null,
      el("div", { class: "kecil abu", text: "1 TOF = Rp " + fmtRp(info.kurs) + " · minimal Rp " + fmtRp(info.min_rp) + " · maksimal Rp " + fmtRp(info.maks_rp) }),
      el("label", { class: "lbl", text: "Nominal" }), grid, inputNominal, preview,
      peringatan,
      el("label", { class: "lbl", for: "nabungPin", text: "PIN" }), pin, galat, btn,
      el("button", { class: "btn teks", id: "btnRiwayatNabung", text: "Riwayat nabung", onclick: async () => {
        const p = pin.value.trim();
        galat.textContent = "";
        if (!/^\d{6}$/.test(p)) { galat.textContent = "Isi PIN dulu untuk membuka riwayat."; return; }
        const res = await vault("topup_saya", { profile_id: state.wallet, pin: p });
        if (!res.ok) { galat.textContent = pesanVault(res); return; }
        sesi.pin = p; pin.value = "";
        tampilRiwayatNabung(s, info, sesi, res.daftar);
      } })
    );

    btn.onclick = async () => {
      galat.textContent = "";
      const p = pin.value.trim();
      if (!Number.isInteger(nominal) || nominal < info.min_rp || nominal > info.maks_rp) { galat.textContent = pesanVault({ error: "nominal_tidak_valid", min_rp: info.min_rp, maks_rp: info.maks_rp }); return; }
      if (!/^\d{6}$/.test(p)) { galat.textContent = "PIN harus 6 digit angka."; return; }
      btn.disabled = true; btn.textContent = "Membuat tagihan…";
      const res = await vault("topup_buat", { profile_id: state.wallet, pin: p, nominal_rp: nominal });
      pin.value = "";
      btn.disabled = false; btn.textContent = "Buat tagihan";
      if (!res.ok) { galat.textContent = pesanVault(res); return; }
      sesi.pin = p;
      tampilTagihan(s, info, sesi, res.topup);
    };
  }

  function tampilTagihan(s, info, sesi, tp) {
    s.setJudul("Tagihan nabung");
    const aktif = tp.status === "menunggu" || tp.status === "dibayar";
    const galat = el("div", { class: "galat", id: "galatTagihan" });
    const ref = el("input", { class: "inp", id: "nabungRef", maxlength: "60", placeholder: "Nama pengirim di e-wallet/bank (opsional)", autocomplete: "off" });
    const anak = [
      el("div", { class: "tengah" }, chipStatus(tp.status)),
      aktif && info.qris ? el("img", { class: "qris", id: "gambarQris", src: info.qris, alt: "QRIS" }) : null,
      aktif && info.nama_penerima ? el("div", { class: "kecil abu tengah", text: "Penerima: " + info.nama_penerima }) : null,
      el("div", { class: "kecil abu tengah", text: aktif ? "Bayar PERSIS sejumlah:" : "Jumlah:" }),
      el("div", { class: "total-bayar", id: "totalBayar", text: "Rp " + fmtRp(tp.total_rp) }),
      aktif ? el("div", { class: "tengah" }, el("button", { class: "mini", type: "button", id: "btnSalinTotal", text: "Salin jumlah", onclick: () => salin(String(tp.total_rp), "Jumlah disalin") })) : null,
      el("div", { class: "kecil abu tengah", text: "Kamu menerima " + fmtUnits(tp.tof_units) + " TOF" }),
      tp.status === "menunggu" ? el("ol", { class: "langkah" },
        el("li", { text: "Buka aplikasi e-wallet atau m-banking (DANA, GoPay, OVO, bank, dll.), lalu pilih Bayar/Scan QRIS." }),
        el("li", { text: "Scan QRIS di atas dan bayar PERSIS Rp " + fmtRp(tp.total_rp) + " (termasuk 2 angka terakhir)." }),
        el("li", { text: "Tekan “Saya sudah bayar”. Pengurus mencocokkan dengan mutasi, lalu TOF dikirim ke dompetmu." })) : null,
      aktif ? el("div", { class: "kecil abu tengah", text: "Berlaku sampai " + new Date(tp.kedaluwarsa_pada).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) }) : null,
      tp.status === "dibayar" ? el("div", { class: "info", text: "Terima kasih. Pengurus akan mencocokkan dengan mutasi, dan TOF dikirim setelah dikonfirmasi." }) : null,
      tp.status === "ditampung" ? el("div", { class: "info", id: "infoDitampung", text: "TOF-mu sudah tercatat di dompet penampung bersama. Dibagikan ke dompetmu setelah setoran bersama terkumpul minimal " + (info.ambang_batch_tof || 500) + " TOF dan ditopup ke akun investasi. Terkumpul sekarang: " + fmtUnits(info.pool_tof_units || 0) + " TOF." }) : null,
      tp.status === "ditampung" && tp.tof_txid ? el("a", { class: "tautan", href: EXPLORER_TX + tp.tof_txid, target: "_blank", rel: "noopener", text: "Lihat transaksi penampungan di explorer" }) : null,
      tp.status === "ditolak" && tp.catatan_admin ? el("div", { class: "info", text: "Alasan: " + tp.catatan_admin }) : null,
      tp.status === "selesai" && (tp.txid_distribusi || tp.tof_txid) ? el("a", { class: "tautan", href: EXPLORER_TX + (tp.txid_distribusi || tp.tof_txid), target: "_blank", rel: "noopener", text: "Lihat transaksi TOF di explorer" }) : null,
    ];
    if (tp.status === "menunggu") {
      anak.push(el("label", { class: "lbl", for: "nabungRef", text: "Catatan (opsional)" }), ref);
      anak.push(galat);
      anak.push(el("button", { class: "btn utama", id: "btnSudahBayar", text: "Saya sudah bayar", onclick: async function () {
        this.disabled = true;
        const res = await vault("topup_dibayar", { profile_id: state.wallet, pin: sesi.pin, id: tp.id, ref: ref.value.trim() });
        this.disabled = false;
        if (!res.ok) { galat.textContent = pesanVault(res); return; }
        tampilTagihan(s, info, sesi, res.topup);
      } }));
      anak.push(el("button", { class: "btn teks", id: "btnBatalTagihan", text: "Batalkan tagihan", onclick: async () => {
        if (!window.confirm("Batalkan tagihan ini? Jangan batalkan kalau kamu sudah membayar.")) return;
        const res = await vault("topup_batal", { profile_id: state.wallet, pin: sesi.pin, id: tp.id });
        if (!res.ok) { galat.textContent = pesanVault(res); return; }
        tampilTagihan(s, info, sesi, res.topup);
      } }));
    } else {
      anak.push(galat);
    }
    anak.push(el("button", { class: "btn " + (aktif && tp.status !== "menunggu" ? "utama" : "teks"), id: "btnTutupTagihan", text: aktif && tp.status !== "menunggu" ? "Selesai" : "Tutup", onclick: s.tutup }));
    s.ganti(anak);
  }

  function tampilRiwayatNabung(s, info, sesi, daftar) {
    s.setJudul("Riwayat nabung");
    const baris = daftar.length
      ? daftar.slice().reverse().map((r) => el("div", { class: "baris-nabung", "data-id": r.id, onclick: () => tampilTagihan(s, info, sesi, r) },
          el("div", {}, el("div", { text: "Rp " + fmtRp(r.total_rp) }), el("div", { class: "kecil abu", text: new Date(r.dibuat).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) })),
          el("div", { class: "tengah" }, chipStatus(r.status))))
      : [el("div", { class: "kosong", text: "Belum ada riwayat nabung." })];
    s.ganti(el("div", { id: "daftarNabung" }, baris), el("button", { class: "btn teks", text: "Kembali", onclick: () => tampilFormNabung(s, info, sesi) }));
  }

  // ---------------- Tugas bulan ini ----------------
  // Kewajiban ringan sebagai syarat dividen positif. Yang belum lengkap membuat dividen DITAHAN (bisa dilepas setelah tugas selesai,
  // dihanguskan setelah masa tahan). Penilaian dilakukan SERVER; bagian ini hanya menampilkan dan mengirim klaim/kode hadir.
  function tokenSesi() {
    try {
      const o = JSON.parse(localStorage.getItem("tof_session") || "null");
      return o && o.id === state.wallet && o.exp * 1000 > Date.now() + 60000 ? o.token : null;
    } catch (e) { return null; }
  }

  async function cekTugas() {
    if (!state.wallet) return;
    const r = await vault("tugas_status", { profile_id: state.wallet });
    state.tugas = r.ok ? r : null; // server belum punya fitur tugas → kartu tersembunyi
    renderTugas();
  }

  function renderTugas() {
    const kartu = $("tugasCard");
    if (!kartu) return;
    const t = state.tugas;
    if (!t || (!(t.wajib || []).length && !(t.ditahan || []).length)) { kartu.hidden = true; return; }
    kartu.hidden = false;
    const total = t.wajib.length, selesai = t.wajib.filter((x) => x.ok).length;
    $("tugasInfo").textContent = total
      ? selesai + " dari " + total + " tugas wajib selesai bulan ini. " + (t.lengkap ? "Dividenmu aman." : "Dividen ditahan kalau belum lengkap.")
      : "";
    $("tugasBar").style.width = (total ? Math.round((selesai * 100) / total) : 100) + "%";
    $("tugasDitahan").textContent = (t.ditahan || []).map((x) =>
      "Dividen " + x.label + " ditahan (" + fmtUnits(BigInt(x.jumlah_units)) + " TOF). " + x.tugas_kurang + (x.sisa_hari > 0 ? " Hangus dalam " + x.sisa_hari + " hari." : "")
    ).join(" ");
    $("btnTugas").onclick = panelTugas;
  }

  function aksiTugas(x, sh) {
    const k = x.kunci || "";
    if (x.jenis === "sistem") {
      if (k === "sistem:titip_frasa" || k === "sistem:pin_aman") return el("button", { class: "mini", type: "button", text: "Atur", onclick: () => { sh.tutup(); panelFrasa(); } });
      if (k === "sistem:setuju_dividen") return el("button", { class: "mini", type: "button", text: "Setujui", onclick: () => { sh.tutup(); const s = state.dividen || {}; if (s.pin_publik || !s.has_vault) panelFrasa(); else panelSetujuDividen(); } });
    }
    if (x.jenis === "manual") return el("button", { class: "mini", type: "button", text: "Klaim selesai", onclick: () => { sh.tutup(); panelKlaimTugas(x); } });
    if (x.jenis === "hadir") return el("button", { class: "mini", type: "button", text: "Kode hadir", onclick: () => { sh.tutup(); panelKodeHadir(); } });
    if (x.url && !/dompet\.html$/.test(x.url)) return el("a", { class: "mini", href: x.url, style: "text-decoration:none;display:inline-flex;align-items:center;", text: "Kerjakan" });
    return null;
  }

  function panelTugas() {
    const t = state.tugas;
    if (!t) return;
    const sh = bukaSheet("Tugas bulan ini");
    const baris = (x) => el("div", { class: "riwayat-baris", "data-tugas": x.kunci },
      el("div", { class: "ikon-r " + (x.ok ? "masuk" : ""), text: x.ok ? "✓" : "○" }),
      el("div", { class: "isi" }, el("div", { class: "judul", text: x.judul }), el("div", { class: "sub", text: x.target > 1 ? x.jumlah + " dari " + x.target : (x.ok ? "Selesai" : "Belum") })),
      x.ok ? null : aksiTugas(x, sh));
    sh.ganti(
      el("div", { class: "info", text: "Tugas wajib yang belum lengkap membuat dividen positifmu ditahan. Setelah tugas selesai, pengurus melepasnya. Dividen yang ditahan lebih dari " + (t.masa_tahan_bulan || 3) + " bulan bisa dihanguskan." }),
      (t.ditahan || []).length ? el("div", { class: "banner", id: "tugasBannerDitahan", text: t.ditahan.map((x) => "Dividen " + x.label + " ditahan: " + x.tugas_kurang).join(" ") }) : null,
      el("h3", { text: "Wajib" }), el("div", { id: "daftarTugasWajib" }, t.wajib.map(baris)),
      (t.opsional || []).length ? el("h3", { text: "Tambahan (tidak wajib)" }) : null,
      (t.opsional || []).length ? el("div", {}, t.opsional.map(baris)) : null,
      el("button", { class: "btn teks", text: "Tutup", onclick: sh.tutup })
    );
  }

  function panelKodeHadir() {
    const sh = bukaSheet("Kode hadir kegiatan");
    const kode = el("input", { class: "inp", id: "kodeHadir", maxlength: "12", placeholder: "Kode dari pengurus", autocomplete: "off", autocapitalize: "characters" });
    const galat = el("div", { class: "galat", id: "galatKodeHadir" });
    const btn = el("button", { class: "btn utama", id: "btnKodeHadir", text: "Catat hadir" });
    sh.ganti(el("div", { class: "info", text: "Masukkan kode yang diumumkan pengurus saat kegiatan berlangsung." }), kode, galat, btn, el("button", { class: "btn teks", text: "Batal", onclick: sh.tutup }));
    btn.onclick = async () => {
      galat.textContent = "";
      const token = tokenSesi();
      if (!token) { galat.textContent = pesanVault({ error: "sesi_tidak_valid" }); return; }
      btn.disabled = true;
      const res = await vault("tugas_hadir", { profile_id: state.wallet, token, kode_hadir: kode.value.trim().toUpperCase() });
      btn.disabled = false;
      if (!res.ok) { galat.textContent = pesanVault(res); return; }
      sh.tutup();
      toast("Hadir tercatat: " + res.kegiatan);
      cekTugas();
    };
  }

  function panelKlaimTugas(x) {
    const sh = bukaSheet("Klaim tugas");
    const catatan = el("textarea", { class: "inp", id: "catatanKlaim", rows: "3", maxlength: "200", placeholder: "Catatan singkat (opsional)" });
    const pin = pinInput("pinKlaimTugas");
    const galat = el("div", { class: "galat", id: "galatKlaimTugas" });
    const btn = el("button", { class: "btn utama", id: "btnKlaimTugas", text: "Kirim klaim" });
    sh.ganti(el("div", { class: "info", text: "Klaim \"" + x.judul + "\" menunggu persetujuan pengurus." }), catatan, pin, galat, btn, el("button", { class: "btn teks", text: "Batal", onclick: sh.tutup }));
    btn.onclick = async () => {
      galat.textContent = "";
      const p = pin.value.trim();
      if (!/^\d{6}$/.test(p)) { galat.textContent = "PIN harus 6 digit angka."; return; }
      btn.disabled = true;
      const res = await vault("tugas_klaim", { profile_id: state.wallet, pin: p, kode: x.kunci, catatan: catatan.value.trim() });
      btn.disabled = false;
      pin.value = "";
      if (!res.ok) { galat.textContent = pesanVault(res); return; }
      sh.tutup();
      toast("Klaim terkirim. Menunggu pengurus.");
    };
  }

  // ---------------- Dividen: syarat peserta dan persetujuan ----------------
  // Peserta dividen harus: sudah menitip frasa, PIN sudah diamankan, dan menyetujui aturan di bawah. Dividen positif dikirim ke
  // dompet ini. Bila hasil investasi minus, server menarik TOF otomatis dari dompet ini (memakai frasa yang dititip) sampai batas
  // yang tertulis di persetujuan. Semua angka dan aturan dijaga SERVER; bagian ini hanya menampilkan dan mengirim persetujuan.
  function dividenSiap() {
    const s = state.dividen;
    return !!(s && s.has_vault && s.setuju && !s.perlu_perbarui && !s.pin_publik);
  }

  function renderDividen() {
    const kartu = $("dividenCard");
    if (!kartu) return;
    const s = state.dividen;
    if (!s) { kartu.hidden = true; return; }
    kartu.hidden = false;
    const siap = dividenSiap();
    let teks;
    if (siap) teks = "Kamu peserta dividen. Dividen positif masuk ke dompet ini. Bila hasil investasi minus, TOF ditarik otomatis dari dompet ini, maksimal " + s.batas_minus_persen + "% per periode.";
    else if (s.pin_publik) teks = "Amankan akunmu dulu: buat PIN dompet baru di menu Frasa. Tanpa itu kamu belum ikut dividen.";
    else if (!s.has_vault) teks = "Wajib menitip frasa dulu, lalu menyetujui aturan dividen. Tanpa itu kamu belum ikut dividen.";
    else if (s.perlu_perbarui) teks = "Batas koreksi minus naik menjadi " + s.batas_sekarang_persen + "%. Setujui ulang supaya tetap ikut dividen.";
    else teks = "Setujui aturan dividen supaya ikut dibagi. Tanpa itu kamu belum ikut dividen.";
    $("dividenInfo").textContent = teks;
    $("btnDividen").hidden = siap;
    $("btnDividenCabut").hidden = !s.setuju;
    $("btnDividen").onclick = () => { if (s.pin_publik || !s.has_vault) panelFrasa(); else panelSetujuDividen(); };
    $("btnDividenCabut").onclick = panelCabutDividen;
  }

  function panelSetujuDividen() {
    const s = state.dividen || {};
    const batas = s.batas_sekarang_persen || 10;
    const sh = bukaSheet("Aturan dividen");
    const pin = pinInput("dividenPin");
    const galat = el("div", { class: "galat", id: "galatDividen" });
    const btn = el("button", { class: "btn utama", id: "btnSetujuDividen", text: "Saya mengerti dan setuju" });
    sh.ganti(
      el("div", { class: "info", text: "Dompet ini khusus untuk keperluan ToFarmer. Jangan dicampur dengan dompet pribadi." }),
      el("ol", { class: "langkah" },
        el("li", { text: "Dividen dihitung dari persentase saldo TOF-mu dan dikirim ke dompet ini bila hasil investasi bersama positif." }),
        el("li", { text: "Bila hasilnya minus, pengurus dapat menjalankan koreksi: TOF ditarik OTOMATIS dari dompet ini memakai frasa yang kamu titip, dengan persentase yang sama untuk semua peserta dan maksimal " + batas + "% saldo per periode." }),
        el("li", { text: "TOF yang sedang menjadi jaminan pinjaman tidak ikut ditarik; hanya TOF bebasmu." }),
        el("li", { text: "Kamu bisa mencabut persetujuan kapan saja, tetapi setelah itu tidak ikut dividen berikutnya." })),
      el("div", { class: "kecil abu", text: "Masukkan PIN untuk menyetujui." }), pin, galat, btn,
      el("button", { class: "btn teks", text: "Nanti dulu", onclick: sh.tutup })
    );
    btn.onclick = async () => {
      galat.textContent = "";
      const p = pin.value.trim();
      if (!/^\d{6}$/.test(p)) { galat.textContent = "PIN harus 6 digit angka."; return; }
      btn.disabled = true;
      const res = await vault("dividen_setuju", { profile_id: state.wallet, pin: p });
      btn.disabled = false;
      pin.value = "";
      if (!res.ok) { galat.textContent = pesanVault(res); return; }
      sh.tutup();
      toast("Persetujuan dividen tersimpan.");
      cekDividen();
    };
  }

  function panelCabutDividen() {
    const sh = bukaSheet("Cabut persetujuan dividen");
    const pin = pinInput("dividenPinCabut");
    const galat = el("div", { class: "galat", id: "galatCabutDividen" });
    const btn = el("button", { class: "btn utama", id: "btnCabutDividen", text: "Cabut persetujuan" });
    sh.ganti(
      el("div", { class: "info", text: "Setelah dicabut, kamu tidak ikut dividen berikutnya (dan tidak terkena koreksi minus). Periode yang sudah berjalan tidak berubah." }),
      pin, galat, btn, el("button", { class: "btn teks", text: "Batal", onclick: sh.tutup })
    );
    btn.onclick = async () => {
      galat.textContent = "";
      const p = pin.value.trim();
      if (!/^\d{6}$/.test(p)) { galat.textContent = "PIN harus 6 digit angka."; return; }
      btn.disabled = true;
      const res = await vault("dividen_cabut", { profile_id: state.wallet, pin: p });
      btn.disabled = false;
      pin.value = "";
      if (!res.ok) { galat.textContent = pesanVault(res); return; }
      sh.tutup();
      toast("Persetujuan dicabut.");
      cekDividen();
    };
  }

  // Dipanggil tiap Dompet dibuka (dan setelah persetujuan berubah)
  async function cekDividen() {
    if (!state.wallet) return;
    const r = await vault("dividen_status", { profile_id: state.wallet });
    state.dividen = r.ok ? r : null; // server belum punya fitur dividen → kartu tersembunyi
    renderDividen();
  }

  // Pengingat sekali per pembukaan bila belum memenuhi syarat
  function ingatkanDividen() {
    const s = state.dividen;
    if (!s || dividenSiap() || state.dividenIngat) return;
    state.dividenIngat = true;
    const sh = bukaSheet("Ikut dividen ToFarmer");
    sh.ganti(
      el("div", { class: "sukses", id: "popupDividen" },
        el("div", { class: "ikon", text: "🌱" }),
        el("div", { class: "judul", text: "Kamu belum ikut dividen" }),
        el("div", { class: "sub", text: s.pin_publik ? "Amankan akunmu dulu dengan PIN baru di menu Frasa." : !s.has_vault ? "Titip frasa dulu, lalu setujui aturan dividen. Dompet ini khusus untuk keperluan ToFarmer." : "Setujui aturan dividen supaya ikut dibagi." })),
      el("button", { class: "btn utama", id: "btnLanjutDividen", text: "Atur sekarang", onclick: () => { sh.tutup(); if (s.pin_publik || !s.has_vault) panelFrasa(); else panelSetujuDividen(); } }),
      el("button", { class: "btn teks", text: "Nanti dulu", onclick: sh.tutup })
    );
  }

  // ---------------- Pinjam ke Diri Sendiri ----------------
  // Pinjam uang dari kas dengan jaminan TOF-mu sendiri (maksimal sebesar nilai saldo TOF). Bunga dibayar rupiah lalu
  // kembali ke dompetmu sebagai TOF. Aturan dan angka dijaga SERVER (tof-vault); bagian ini hanya menampilkan dan
  // mengirim permintaan. Bila server belum punya fitur ini, kartu Pinjam tidak tampil dan dompet tetap normal.
  const STATUS_PINJAM = {
    diajukan: ["Menunggu pengurus mencairkan", "tunggu"],
    aktif: ["Berjalan", "ok"],
    dibayar: ["Pelunasan menunggu dicek pengurus", "tunggu"],
    lunas: ["Lunas", "ok"],
    ditolak: ["Ditolak pengurus", "gagal"],
    dibatalkan: ["Dibatalkan", "gagal"]
  };

  function chipPinjam(status) {
    const [teks, kelas] = STATUS_PINJAM[status] || [status, ""];
    return el("span", { class: "chip " + kelas, text: teks });
  }

  const tglPinjam = (iso) => new Date(iso).toLocaleDateString("id-ID", { dateStyle: "medium" });
  const bungaPinjam = (pokok, persen) => Math.floor((pokok * persen) / 100);
  const sisaHariPinjam = (iso) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);

  function teksSisaPinjam(p) {
    if (!p.jatuh_tempo) return "Jatuh tempo dihitung sejak uang dikirim";
    const h = sisaHariPinjam(p.jatuh_tempo);
    if (h < 0) return "Jatuh tempo " + tglPinjam(p.jatuh_tempo) + " (telat " + (-h) + " hari)";
    if (h === 0) return "Jatuh tempo HARI INI";
    return "Jatuh tempo " + tglPinjam(p.jatuh_tempo) + " (" + h + " hari lagi)";
  }

  function renderPinjam() {
    const info = state.pinjam;
    const kartu = $("pinjamCard");
    if (!kartu) return;
    kartu.hidden = !(info && info.aktif);
    if (info && info.aktif) {
      $("pinjamInfo").textContent = "Pinjam uang dari kas dengan jaminan TOF-mu sendiri, maksimal sebesar nilai saldo TOF. Bunga " + info.bunga_persen
        + "% dari pokok, dan kembali ke dompetmu sebagai TOF saat lunas."
        + (state.terkunci > 0n ? " TOF terkunci sebagai jaminan: " + fmtUnits(state.terkunci) + "." : "");
    }
    $("btnPinjam").onclick = panelPinjam;
  }

  function panelPinjam() {
    const info = state.pinjam;
    if (!info || !info.aktif) { toast("Pinjaman belum dibuka oleh pengurus."); return; }
    if (!bolehTandatangan()) return;
    const s = bukaSheet("Pinjam");
    const sesi = { pin: "" };
    s.onTutup(() => { sesi.pin = ""; });
    tampilFormPinjam(s, info, sesi, {});
  }

  function tampilFormPinjam(s, info, sesi, isi) {
    s.setJudul("Pinjam");
    const saldoEl = el("div", { class: "kecil abu", id: "pinjamSaldo", text: "Membaca saldo TOF…" });
    const maksRp = () => {
      if (!state.ringkas) return 0;
      const bebas = state.ringkas.tof - state.terkunci;
      if (bebas <= 0n) return 0;
      let m = Number((bebas * BigInt(info.kurs)) / SATU);
      if (info.maks_rp && m > info.maks_rp) m = info.maks_rp;
      return m;
    };
    const perbaruiSaldo = () => {
      saldoEl.textContent = state.ringkas
        ? "Batas pinjammu: Rp " + fmtRp(maksRp()) + " (nilai TOF yang tidak sedang menjadi jaminan)"
        : "Saldo TOF belum terbaca.";
    };
    perbaruiSaldo();
    ringkasAkun(state.wallet).then((r) => { state.ringkas = r; perbaruiSaldo(); }).catch(() => { saldoEl.textContent = "Saldo TOF belum terbaca. Coba buka ulang."; });

    const tenorOpsi = (info.tenor_opsi && info.tenor_opsi.length ? info.tenor_opsi : [7, 14, 30]);
    const tenor = el("select", { class: "inp", id: "pinjamTenor" }, tenorOpsi.map((h) => el("option", { value: String(h), text: h + " hari" })));
    tenor.value = String(isi.tenor || tenorOpsi[0]);
    const jumlah = el("input", { class: "inp", id: "pinjamJumlah", inputmode: "numeric", placeholder: "Jumlah pinjaman (Rp)", autocomplete: "off", value: isi.jumlah || "" });
    const preview = el("div", { class: "kecil abu", id: "pinjamPreview", text: "Pilih persen atau ketik jumlah pinjaman." });
    const grid = el("div", { class: "grid-nominal", id: "gridPinjam" });
    const jenis = el("select", { class: "inp", id: "pinjamJenis" },
      ["DANA", "GoPay", "OVO", "ShopeePay", "LinkAja", "Bank"].map((j) => el("option", { value: j, text: j })));
    jenis.value = isi.jenis || "DANA";
    const bank = el("input", { class: "inp", id: "pinjamBank", placeholder: "Nama bank (mis. BCA, BRI, Mandiri)", autocomplete: "off", value: isi.bank || "" });
    const nomor = el("input", { class: "inp", id: "pinjamNomor", inputmode: "numeric", placeholder: "Nomor HP (DANA/GoPay/OVO) atau nomor rekening", autocomplete: "off", value: isi.nomor || "" });
    const nama = el("input", { class: "inp", id: "pinjamNama", placeholder: "Nama pemilik akun / rekening", autocomplete: "off", value: isi.nama || "" });
    const galat = el("div", { class: "galat", id: "galatPinjam" });
    const btn = el("button", { class: "btn utama", id: "btnLanjutPinjam", text: "Lanjut" });

    const tampilBank = () => { bank.style.display = jenis.value === "Bank" ? "" : "none"; };
    jenis.onchange = tampilBank; tampilBank();

    const hitung = () => {
      const n = /^\d+$/.test(jumlah.value.trim()) ? Number(jumlah.value.trim()) : 0;
      if (!n) { preview.textContent = "Pilih persen atau ketik jumlah pinjaman."; return; }
      const b = bungaPinjam(n, info.bunga_persen);
      const bTof = (BigInt(b) * SATU) / BigInt(info.kurs);
      preview.textContent = "Bunga " + info.bunga_persen + "% = Rp " + fmtRp(b) + ". Total dikembalikan Rp " + fmtRp(n + b)
        + ". Bunganya kembali ke dompetmu sebagai sekitar " + fmtUnits(bTof) + " TOF.";
    };
    jumlah.oninput = () => { grid.querySelectorAll(".mini").forEach((x) => x.classList.remove("pilih")); hitung(); };
    [25, 50, 75, 100].forEach((pc) => {
      const b = el("button", { class: "mini", type: "button", text: pc + "%", "data-persen": String(pc) });
      b.onclick = () => {
        if (!state.ringkas) { galat.textContent = "Saldo TOF belum terbaca, coba lagi sebentar."; return; }
        galat.textContent = "";
        jumlah.value = String(Math.floor((maksRp() * pc) / 100));
        grid.querySelectorAll(".mini").forEach((x) => x.classList.remove("pilih"));
        b.classList.add("pilih");
        hitung();
      };
      grid.append(b);
    });
    hitung();

    s.ganti(
      el("div", { class: "info", text: "Kamu meminjam dari dirimu sendiri. TOF-mu dikunci sebagai jaminan sampai pinjaman lunas, dan pengurus mengirim uangnya ke tujuan di bawah. Saat jatuh tempo, pinjaman ditagih lewat pop-up di Dompet." }),
      saldoEl,
      el("label", { class: "lbl", text: "Jumlah pinjaman (Rp)" }), grid, jumlah, preview,
      el("label", { class: "lbl", for: "pinjamTenor", text: "Lama pinjam" }), tenor,
      el("label", { class: "lbl", for: "pinjamJenis", text: "Uang dikirim ke" }), jenis, bank,
      el("label", { class: "lbl", for: "pinjamNomor", text: "Nomor tujuan" }), nomor,
      el("label", { class: "lbl", for: "pinjamNama", text: "Atas nama" }), nama,
      galat, btn,
      el("button", { class: "btn teks", id: "btnPinjamanku", text: "Pinjamanku", onclick: () => tampilRiwayatPinjam(s, info, sesi, null) })
    );

    btn.onclick = async () => {
      galat.textContent = "";
      const pokok = /^\d+$/.test(jumlah.value.trim()) ? Number(jumlah.value.trim()) : 0;
      const jenisTujuan = jenis.value === "Bank" ? "Bank " + bank.value.trim() : jenis.value;
      const nomorBersih = nomor.value.replace(/[\s-]/g, "");
      const namaBersih = nama.value.trim();
      if (!Number.isInteger(pokok) || pokok < info.min_rp) { galat.textContent = "Jumlah pinjaman minimal Rp " + fmtRp(info.min_rp) + "."; return; }
      if (jenis.value === "Bank" && !/^[A-Za-z0-9 .&-]{2,30}$/.test(bank.value.trim())) { galat.textContent = "Isi nama bank (2–30 karakter)."; return; }
      if (!/^\d{5,25}$/.test(nomorBersih)) { galat.textContent = pesanVault({ error: "nomor_tidak_valid" }); return; }
      if (!/^[A-Za-z0-9 .,'-]{2,60}$/.test(namaBersih)) { galat.textContent = pesanVault({ error: "nama_tidak_valid" }); return; }
      btn.disabled = true; btn.textContent = "Memeriksa…";
      let me;
      try { me = await ringkasAkun(state.wallet); } catch { btn.disabled = false; btn.textContent = "Lanjut"; galat.textContent = "Gagal membaca saldo dari jaringan Algorand. Coba lagi."; return; }
      btn.disabled = false; btn.textContent = "Lanjut";
      state.ringkas = me;
      perbaruiSaldo();
      if (pokok > maksRp()) { galat.textContent = pesanVault({ error: "pinjam_melebihi_batas", maks_rp: maksRp() }); return; }
      const bunga = bungaPinjam(pokok, info.bunga_persen);
      const jaminan = (BigInt(pokok) * SATU + BigInt(info.kurs) - 1n) / BigInt(info.kurs);
      const sisa = { jumlah: jumlah.value, tenor: tenor.value, jenis: jenis.value, bank: bank.value, nomor: nomor.value, nama: nama.value };
      layarKonfirmasi(s, {
        judul: "Konfirmasi pinjaman",
        baris: [
          ["Pinjam", "Rp " + fmtRp(pokok)],
          ["Bunga " + info.bunga_persen + "%", "Rp " + fmtRp(bunga)],
          ["Total dikembalikan", "Rp " + fmtRp(pokok + bunga)],
          ["Lama", tenor.value + " hari sejak uang dikirim"],
          ["TOF dikunci", "sekitar " + fmtUnits(jaminan) + " TOF"],
          ["Dikirim ke", jenisTujuan + " · " + nomorBersih],
          ["Atas nama", namaBersih]
        ],
        catatan: "Pastikan nomor tujuan benar. Bunga tidak hilang: setelah lunas, bunga kembali ke dompetmu sebagai TOF. TOF jaminan tidak bisa dikirim atau ditarik selama pinjaman berjalan.",
        tombol: "Ajukan pinjaman",
        kembali: () => tampilFormPinjam(s, info, sesi, sisa),
        suksesLayar: layarSuksesPinjam,
        jalankan: async (pin) => {
          const r = await vault("pinjam_buat", { profile_id: state.wallet, pin, pokok_rp: pokok, tenor_hari: Number(tenor.value), jenis: jenisTujuan, nomor: nomorBersih, nama: namaBersih });
          if (!r.ok) { const e = new Error(pesanVault(r)); e.tampil = true; throw e; }
          sesi.pin = pin;
          return r;
        }
      });
    };
  }

  function layarSuksesPinjam(sheet, r) {
    const p = r.pinjam;
    sheet.setJudul("Pinjaman diajukan");
    sheet.ganti(
      el("div", { class: "sukses" },
        el("div", { class: "ikon", text: "✓" }),
        el("div", { class: "judul", text: "Pinjaman Rp " + fmtRp(p.pokok_rp) + " diajukan" }),
        el("div", { id: "pesanSuksesPinjam", class: "sub", text: "Pengurus akan mengirim uangnya ke " + p.tujuan_jenis + " " + p.tujuan_nomor + " a.n. " + p.tujuan_nama + ". Jatuh tempo dihitung sejak uang dikirim." })),
      el("button", { class: "btn utama", text: "Selesai", onclick: () => { sheet.tutup(); cekTagihanPinjam(); } })
    );
  }

  function tampilRiwayatPinjam(s, info, sesi, idLangsung) {
    s.setJudul("Pinjamanku");
    const pin = pinInput("pinjamPinRiwayat");
    const galat = el("div", { class: "galat", id: "galatRiwayatPinjam" });
    const btn = el("button", { class: "btn utama", id: "btnBukaRiwayatPinjam", text: "Buka pinjamanku" });
    s.ganti(
      el("div", { class: "kecil abu", text: "Masukkan PIN untuk melihat pinjamanmu." }), pin, galat, btn,
      el("button", { class: "btn teks", text: "Tutup", onclick: s.tutup })
    );
    btn.onclick = async () => {
      galat.textContent = "";
      const p = pin.value.trim();
      if (!/^\d{6}$/.test(p)) { galat.textContent = "PIN harus 6 digit angka."; return; }
      btn.disabled = true;
      const res = await vault("pinjam_saya", { profile_id: state.wallet, pin: p });
      btn.disabled = false;
      pin.value = "";
      if (!res.ok) { galat.textContent = pesanVault(res); return; }
      sesi.pin = p;
      const langsung = idLangsung ? res.daftar.find((x) => x.id === idLangsung) : null;
      if (langsung) tampilBayarPinjam(s, info, sesi, langsung);
      else daftarPinjam(s, info, sesi, res.daftar);
    };
  }

  function daftarPinjam(s, info, sesi, daftar) {
    s.setJudul("Pinjamanku");
    const baris = daftar.length
      ? daftar.slice().reverse().map((r) => el("div", { class: "baris-nabung", "data-id": r.id, onclick: () => detailPinjam(s, info, sesi, r) },
          el("div", {}, el("div", { text: "Rp " + fmtRp(r.pokok_rp) + " → Rp " + fmtRp(r.total_rp) }), el("div", { class: "kecil abu", text: new Date(r.dibuat).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) })),
          el("div", { class: "tengah" }, chipPinjam(r.status))))
      : [el("div", { class: "kosong", text: "Belum ada pinjaman." })];
    s.ganti(el("div", { id: "daftarPinjam" }, baris), el("button", { class: "btn teks", text: "Tutup", onclick: s.tutup }));
  }

  function detailPinjam(s, info, sesi, p) {
    s.setJudul("Detail pinjaman");
    const galat = el("div", { class: "galat", id: "galatDetailPinjam" });
    const aksi = [];
    if (p.status === "aktif") {
      aksi.push(el("button", { class: "btn utama", id: "btnLunasiPinjam", text: "Lunasi sekarang", onclick: () => tampilBayarPinjam(s, info, sesi, p) }));
    }
    if (p.status === "diajukan") {
      aksi.push(el("button", { class: "btn teks", id: "btnBatalPinjam", text: "Batalkan (hanya jika uang belum dikirim)", onclick: async () => {
        if (!window.confirm("Batalkan pengajuan ini?")) return;
        const res = await vault("pinjam_batal", { profile_id: state.wallet, pin: sesi.pin, id: p.id });
        if (!res.ok) { galat.textContent = pesanVault(res); return; }
        detailPinjam(s, info, sesi, res.pinjam);
        cekTagihanPinjam();
      } }));
    }
    s.ganti(
      el("div", { class: "tengah" }, chipPinjam(p.status)),
      el("div", { class: "total-bayar", text: "Rp " + fmtRp(p.pokok_rp) }),
      el("div", { class: "ringkas" },
        el("div", { class: "baris" }, el("div", { class: "k", text: "Bunga " + p.bunga_persen + "%" }), el("div", { class: "v", text: "Rp " + fmtRp(p.bunga_rp) })),
        el("div", { class: "baris" }, el("div", { class: "k", text: "Total dikembalikan" }), el("div", { class: "v", text: "Rp " + fmtRp(p.total_rp) })),
        el("div", { class: "baris" }, el("div", { class: "k", text: "TOF dikunci" }), el("div", { class: "v", text: fmtUnits(p.jaminan_tof_units) + " TOF" })),
        p.status === "aktif" || p.status === "dibayar" ? el("div", { class: "baris" }, el("div", { class: "k", text: "Jatuh tempo" }), el("div", { class: "v", text: teksSisaPinjam(p) })) : null,
        el("div", { class: "baris" }, el("div", { class: "k", text: "Uang dikirim ke" }), el("div", { class: "v", text: p.tujuan_jenis + " · " + p.tujuan_nomor }))),
      p.status === "lunas" ? el("div", { class: "info", text: "Lunas. Bunga Rp " + fmtRp(p.bunga_rp) + " sudah kembali ke dompetmu sebagai TOF" + (p.bunga_txid ? "." : " (sedang dikirim pengurus).") }) : null,
      p.status === "ditolak" && p.catatan_admin ? el("div", { class: "info", text: "Alasan: " + p.catatan_admin }) : null,
      p.status === "dibayar" ? el("div", { class: "info", text: "Terima kasih. Pengurus mencocokkan dengan mutasi kas, lalu TOF jaminanmu dibuka kembali." }) : null,
      p.bunga_txid ? el("a", { class: "tautan", href: EXPLORER_TX + p.bunga_txid, target: "_blank", rel: "noopener", text: "Lihat transaksi TOF bunga di explorer" }) : null,
      galat, ...aksi,
      el("button", { class: "btn teks", id: "btnKembaliDaftarPinjam", text: "Kembali", onclick: async () => {
        const res = await vault("pinjam_saya", { profile_id: state.wallet, pin: sesi.pin });
        if (res.ok) daftarPinjam(s, info, sesi, res.daftar); else tampilRiwayatPinjam(s, info, sesi, null);
      } })
    );
  }

  // Lunasi: server membuat total bayar dengan kode unik → bayar ke QRIS kas → "Saya sudah bayar" → pengurus mencocokkan mutasi.
  async function tampilBayarPinjam(s, info, sesi, p) {
    s.setJudul("Lunasi pinjaman");
    s.ganti(el("div", { class: "info", text: "Menyiapkan tagihan…" }));
    const r = await vault("pinjam_bayar", { profile_id: state.wallet, pin: sesi.pin, id: p.id });
    if (!r.ok) {
      s.ganti(el("div", { class: "galat", text: pesanVault(r) }),
        el("button", { class: "btn teks", text: "Kembali", onclick: () => detailPinjam(s, info, sesi, p) }));
      return;
    }
    const q = r.pinjam;
    const galat = el("div", { class: "galat", id: "galatBayarPinjam" });
    const ref = el("input", { class: "inp", id: "pinjamRef", maxlength: "60", placeholder: "Nama pengirim di e-wallet/bank (opsional)", autocomplete: "off" });
    const sudahBayar = q.status === "dibayar";
    s.ganti(
      el("div", { class: "tengah" }, chipPinjam(q.status)),
      !sudahBayar && info.qris ? el("img", { class: "qris", id: "gambarQrisPinjam", src: info.qris, alt: "QRIS" }) : null,
      !sudahBayar && info.nama_penerima ? el("div", { class: "kecil abu tengah", text: "Penerima: " + info.nama_penerima }) : null,
      el("div", { class: "kecil abu tengah", text: sudahBayar ? "Jumlah:" : "Bayar PERSIS sejumlah:" }),
      el("div", { class: "total-bayar", id: "totalBayarPinjam", text: "Rp " + fmtRp(q.total_bayar_rp) }),
      !sudahBayar ? el("div", { class: "tengah" }, el("button", { class: "mini", type: "button", id: "btnSalinTotalPinjam", text: "Salin jumlah", onclick: () => salin(String(q.total_bayar_rp), "Jumlah disalin") })) : null,
      el("div", { class: "kecil abu tengah", text: "Pokok Rp " + fmtRp(q.pokok_rp) + " + bunga Rp " + fmtRp(q.bunga_rp) + " + kode unik " + q.kode_unik + ". Bunga kembali ke dompetmu sebagai TOF." }),
      !sudahBayar ? el("ol", { class: "langkah" },
        el("li", { text: "Buka e-wallet atau m-banking, pilih Bayar/Scan QRIS." }),
        el("li", { text: "Scan QRIS di atas dan bayar PERSIS Rp " + fmtRp(q.total_bayar_rp) + " (termasuk 2 angka terakhir)." }),
        el("li", { text: "Tekan “Saya sudah bayar”. Pengurus mencocokkan dengan mutasi, lalu TOF jaminanmu dibuka." })) : el("div", { class: "info", text: "Terima kasih. Menunggu pengurus mencocokkan dengan mutasi kas." }),
      !sudahBayar ? el("label", { class: "lbl", for: "pinjamRef", text: "Catatan (opsional)" }) : null,
      !sudahBayar ? ref : null,
      galat,
      !sudahBayar ? el("button", { class: "btn utama", id: "btnSudahBayarPinjam", text: "Saya sudah bayar", onclick: async function () {
        this.disabled = true;
        const res = await vault("pinjam_dibayar", { profile_id: state.wallet, pin: sesi.pin, id: q.id, ref: ref.value.trim() });
        this.disabled = false;
        if (!res.ok) { galat.textContent = pesanVault(res); return; }
        tampilBayarPinjam(s, info, sesi, res.pinjam);
        cekTagihanPinjam();
      } }) : null,
      el("button", { class: "btn teks", id: "btnTutupBayarPinjam", text: "Tutup", onclick: s.tutup })
    );
  }

  // Pop-up tagihan: muncul setiap Dompet dibuka selama pinjaman sudah jatuh tempo (atau ditagih pengurus) dan belum lunas.
  function popupTagihanPinjam(t) {
    const info = state.pinjam || {};
    const telat = (t.terlambat_hari || 0) > 0;
    const sapa = state.username ? "@" + state.username : "kamu";
    const judul = t.ditagih_pengurus && !telat && (t.sisa_hari || 0) > 0
      ? "Ada tagihan dari pengurus"
      : telat ? "Utangmu ke diri sendiri sudah telat " + t.terlambat_hari + " hari" : "Pinjamanmu jatuh tempo hari ini";
    const sub = telat
      ? sapa + ", dompetmu sedang menunggu uangnya pulang. Makin cepat dilunasi, makin cepat TOF jaminanmu bebas lagi."
      : "Tenang, ini utang ke dirimu sendiri. Lunasi sekarang, dan bunganya jadi TOF di dompetmu sendiri.";
    const s = bukaSheet("🔔 Tagihan pinjaman");
    const sesi = { pin: "" };
    s.onTutup(() => { sesi.pin = ""; });
    s.ganti(
      el("div", { class: "sukses", id: "popupTagihan" },
        el("div", { class: "ikon", text: telat ? "😅" : "🔔" }),
        el("div", { class: "judul", text: judul }),
        el("div", { class: "sub", text: sub })),
      el("div", { class: "ringkas" },
        el("div", { class: "baris" }, el("div", { class: "k", text: "Pokok" }), el("div", { class: "v", text: "Rp " + fmtRp(t.pokok_rp) })),
        el("div", { class: "baris" }, el("div", { class: "k", text: "Bunga " + (info.bunga_persen || 5) + "%" }), el("div", { class: "v", text: "Rp " + fmtRp(t.bunga_rp) })),
        el("div", { class: "baris" }, el("div", { class: "k", text: "Total" }), el("div", { class: "v", text: "Rp " + fmtRp(t.total_rp) })),
        el("div", { class: "baris" }, el("div", { class: "k", text: "Jatuh tempo" }), el("div", { class: "v", text: tglPinjam(t.jatuh_tempo) }))),
      el("div", { class: "info", text: "Yang kamu bayar ke kas hanya pokoknya. Bunganya kembali ke dompetmu sebagai TOF, jadi aset kamu tetap bertambah." }),
      el("button", { class: "btn utama", id: "btnBayarPopup", text: "Lunasi sekarang", onclick: () => tampilRiwayatPinjam(s, info, sesi, t.id) }),
      el("button", { class: "btn teks", id: "btnNantiPopup", text: "Nanti dulu", onclick: s.tutup })
    );
  }

  // Dipanggil tiap Dompet dibuka: ambil jumlah TOF terkunci dan tagihan yang jatuh tempo (tanpa PIN).
  async function cekTagihanPinjam() {
    if (!state.wallet) return;
    const r = await vault("pinjam_tagihan", { profile_id: state.wallet });
    if (!r.ok) return; // server belum punya fitur pinjaman → abaikan
    state.terkunci = BigInt(r.terkunci_units || 0);
    renderPinjam();
    if (r.tagihan && !state.popupPinjamTampil) {
      state.popupPinjamTampil = true;
      popupTagihanPinjam(r.tagihan);
    }
  }

  const ikonRiwayat = { keluar: "↗", masuk: "↙", optin: "＋", lain: "•" };

  function barisRiwayat(tx) {
    const me = state.wallet;
    let jenis = "lain", judul = "Transaksi", jumlah = "", lawan = "";
    if (tx["tx-type"] === "pay" && tx["payment-transaction"]) {
      const p = tx["payment-transaction"];
      const keluar = tx.sender === me;
      jenis = keluar ? "keluar" : "masuk";
      judul = keluar ? "Kirim ALGO" : "Terima ALGO";
      jumlah = (keluar ? "-" : "+") + fmtUnits(p.amount) + " ALGO";
      lawan = keluar ? p.receiver : tx.sender;
    } else if (tx["tx-type"] === "axfer" && tx["asset-transfer-transaction"]) {
      const a = tx["asset-transfer-transaction"];
      const nama = Number(a["asset-id"]) === TOF_ASSET_ID ? "TOF" : "Aset #" + a["asset-id"];
      if (a.receiver === me && tx.sender === me && Number(a.amount) === 0) {
        jenis = "optin"; judul = "Opt-in " + nama;
      } else {
        const keluar = tx.sender === me;
        jenis = keluar ? "keluar" : "masuk";
        judul = (keluar ? "Kirim " : "Terima ") + nama;
        jumlah = (keluar ? "-" : "+") + fmtUnits(a.amount) + " " + nama;
        lawan = keluar ? a.receiver : tx.sender;
      }
    }
    const waktu = tx["round-time"] ? new Date(tx["round-time"] * 1000).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "";
    return el("div", { class: "riwayat-baris" },
      el("div", { class: "ikon-r " + jenis, text: ikonRiwayat[jenis] }),
      el("div", { class: "isi" },
        el("div", { class: "judul", text: judul }),
        el("div", { class: "sub", text: [lawan ? pendek(lawan) : "", waktu].filter(Boolean).join(" · ") })),
      el("div", { class: "jumlah " + jenis, text: jumlah }));
  }

  async function muatRiwayat() {
    const box = $("riwayat");
    try {
      const r = await fetch(IDX + "/v2/accounts/" + state.wallet + "/transactions?limit=10");
      if (!r.ok) throw new Error("idx " + r.status);
      const j = await r.json();
      const daftar = j.transactions || [];
      box.replaceChildren(...(daftar.length
        ? daftar.map(barisRiwayat)
        : [el("div", { class: "kosong", text: "Belum ada transaksi." })]));
    } catch {
      box.replaceChildren(el("div", { class: "kosong", text: "Belum ada transaksi." }));
    }
  }

  async function muatData() {
    $("saldoAlgo").textContent = "…";
    $("saldoTof").textContent = "…";
    const tugas = [
      ringkasAkun(state.wallet).then((r) => { state.ringkas = r; renderSaldo(); })
        .catch(() => { $("infoMin").textContent = "Gagal membaca saldo dari jaringan. Muat ulang halaman."; }),
      vault("vault_status", { profile_id: state.wallet }).then((r) => {
        state.status = r.ok ? { has_vault: !!r.has_vault, has_pin: !!r.has_pin, pin_publik: !!r.pin_publik } : { has_vault: false, has_pin: false, pin_publik: false, galat: true };
        renderBanner();
      }),
      vault("topup_info", {}).then((r) => { state.topup = r.ok ? r : null; renderNabung(); renderTarik(); }),
      vault("pinjam_info", {}).then((r) => { state.pinjam = r.ok ? r : null; renderPinjam(); }),
      cekDividen(),
      cekTugas(),
      muatRiwayat()
    ];
    await Promise.all(tugas);
  }

  // Belum login → arahkan ke halaman login; setelah berhasil login, login.js membawa kembali ke sini.
  function tampilkanPesanLogin() {
    $("pesanLogin").hidden = false;
    $("konten").hidden = true;
    const balik = window.location.pathname + window.location.search;
    const tujuan = "login.html?next=" + encodeURIComponent(balik);
    $("linkMasuk").setAttribute("href", tujuan);
    try { localStorage.setItem("redirect_to", balik); } catch (e) { /* abaikan */ }
    if (!CFG.tanpaRedirect) setTimeout(() => { window.location.href = tujuan; }, 900);
  }

  // ---------------- pasang ke layar utama (PWA) ----------------
  let promptInstal = null;

  function sudahTerpasang() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true;
  }

  function siapkanInstal() {
    const banner = $("pwaBanner");
    if (!banner) return;
    banner.hidden = sudahTerpasang();

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      promptInstal = e;
      banner.hidden = sudahTerpasang();
    });
    window.addEventListener("appinstalled", () => {
      banner.hidden = true;
      promptInstal = null;
      toast("Dompet terpasang di layar utama");
    });
    $("btnInstal").onclick = jalankanInstal;

    // Service worker (syarat agar Chrome Android menawarkan "Instal")
    if ("serviceWorker" in navigator && /^https?:$/.test(window.location.protocol) && !CFG.tanpaSW) {
      navigator.serviceWorker.register("./sw-dompet.js", { scope: "./dompet.html" })
        .catch((e) => console.warn("Service worker dompet gagal didaftarkan", e));
    }
  }

  function jalankanInstal() {
    if (promptInstal) {
      promptInstal.prompt();
      promptInstal.userChoice.then((pilihan) => {
        if (pilihan.outcome === "accepted") $("pwaBanner").hidden = true;
        promptInstal = null;
      });
      return;
    }
    // Belum ada prompt otomatis (iPhone/Safari atau browser lain): beri petunjuk manual
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent || "");
    const s = bukaSheet("Pasang ke layar utama");
    s.ganti(
      el("div", { class: "kecil abu", text: ios
        ? "Di iPhone/iPad, pasang lewat Safari:"
        : "Di HP Android, pasang lewat Chrome:" }),
      el("ol", { class: "langkah" }, ios
        ? [el("li", { text: "Ketuk tombol Bagikan (kotak dengan panah ke atas)." }),
           el("li", { text: "Pilih “Tambahkan ke Layar Utama”." }),
           el("li", { text: "Ketuk Tambah. Ikon Dompet muncul di layar depan." })]
        : [el("li", { text: "Ketuk menu titik tiga (⋮) di pojok browser." }),
           el("li", { text: "Pilih “Instal aplikasi” atau “Tambahkan ke layar utama”." }),
           el("li", { text: "Ketuk Instal. Ikon Dompet muncul di layar depan." })]),
      el("div", { class: "info", text: "Setelah terpasang, Dompet terbuka layar penuh seperti aplikasi biasa. Kamu perlu login sekali di dalamnya." }),
      el("button", { class: "btn utama", id: "btnSiap", text: "Siap", onclick: s.tutup })
    );
  }

  function mulai() {
    siapkanInstal();
    const wallet = localStorage.getItem("tof_wallet");
    if (!wallet || !algosdk.isValidAddress(wallet)) {
      tampilkanPesanLogin();
      return;
    }
    state.wallet = wallet;
    state.username = localStorage.getItem("tof_login_username") || "";
    $("namaUser").textContent = state.username ? "@" + state.username : "";
    // [USERNAME BISA BERUBAH] Username bisa diganti dari perangkat lain (Pengaturan Profil): segarkan nama yang tampil.
    // Tidak memengaruhi transaksi: Nabung/Tarik memakai alamat dompet, dan catatan transaksinya dibuat server dengan nama terbaru.
    try {
      if (typeof supabaseClient !== "undefined") {
        Promise.resolve(supabaseClient.from("profiles").select("username").eq("id", wallet).maybeSingle()).then((r) => {
          const u = r && r.data && r.data.username;
          if (u && u !== state.username) {
            state.username = u;
            try { localStorage.setItem("tof_login_username", u); } catch (e) { /* abaikan */ }
            $("namaUser").textContent = "@" + u;
          }
        }).catch(() => {});
      }
    } catch (e) { /* abaikan */ }
    $("alamatTeks").textContent = pendek(wallet);
    $("btnSalinAlamat").onclick = () => salin(wallet, "Alamat disalin");
    $("pesanLogin").hidden = true;
    $("konten").hidden = false;

    document.querySelectorAll("[data-aksi]").forEach((b) => {
      b.onclick = () => {
        const a = b.getAttribute("data-aksi");
        if (a === "terima") panelTerima();
        else if (a === "kirim") panelKirim();
        else if (a === "optin") panelOptin();
        else if (a === "frasa") panelFrasa();
      };
    });
    muatData().then(() => {
      const q = new URLSearchParams(window.location.search);
      const ke = q.get("ke");
      if (!ke && q.get("nabung") !== "1") cekTagihanPinjam(); // pop-up tagihan pinjaman (bila ada yang jatuh tempo)
      if (!ke && q.get("nabung") !== "1") ingatkanDividen(); // pengingat bila belum memenuhi syarat dividen
      if (ke && bolehTandatangan()) {
        const sk = bukaSheet("Kirim");
        tampilFormKirim(sk, { aset: q.get("aset") === "ALGO" ? "ALGO" : "TOF", tujuan: ke, jumlah: q.get("jumlah") || "", catatan: q.get("catatan") || "" });
      } else if (!ke && q.get("nabung") === "1") {
        // Datang dari tombol "Nabung Ladang" di profil: langsung buka panel Nabung
        panelNabung();
        try { window.history.replaceState(null, "", window.location.pathname); } catch (e) { /* abaikan */ }
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mulai);
  else mulai();
})();
