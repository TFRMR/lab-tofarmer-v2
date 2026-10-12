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
    topup: null      // info Nabung dari server (kurs, QRIS, aturan)
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
    const r = await fetch(ALGOD + "/v2/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/x-binary" },
      body: blob
    });
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
      case "topup_nonaktif": return "Nabung belum dibuka oleh pengurus.";
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
  function layarKonfirmasi(sheet, { judul, baris, catatan, tombol, jalankan, kembali }) {
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
        layarSukses(sheet, hasil);
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
      $("nabungInfo").textContent = "Setor receh ke kas bersama dan terima TOF di dompetmu. 1 TOF = Rp " + fmtRp(info.kurs) + ".";
    }
    $("btnNabung").onclick = panelNabung;
  }

  // ---------------- Nabung TOF (top-up rupiah via QRIS, dikonfirmasi pengurus) ----------------
  const STATUS_NABUNG = {
    menunggu: ["Menunggu pembayaran", "tunggu"],
    dibayar: ["Menunggu dicek pengurus", "tunggu"],
    dikonfirmasi: ["Pembayaran dikonfirmasi, TOF disiapkan", "ok"],
    mengirim: ["TOF sedang dikirim", "tunggu"],
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
      tp.status === "ditolak" && tp.catatan_admin ? el("div", { class: "info", text: "Alasan: " + tp.catatan_admin }) : null,
      tp.status === "selesai" && tp.tof_txid ? el("a", { class: "tautan", href: EXPLORER_TX + tp.tof_txid, target: "_blank", rel: "noopener", text: "Lihat transaksi TOF di explorer" }) : null,
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
      vault("topup_info", {}).then((r) => { state.topup = r.ok ? r : null; renderNabung(); }),
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
