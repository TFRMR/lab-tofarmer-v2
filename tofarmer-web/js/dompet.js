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
    status: null     // { has_vault, has_pin, pin_publik }
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
      case "pin_publik": return "Akun lama: fitur ini aktif setelah pembaruan keamanan PIN selesai.";
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
    if (catatan && new TextEncoder().encode(catatan).length > 100) return "Catatan terlalu panjang (maksimal 100 karakter).";

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
    const catatan = el("input", { class: "inp", id: "kirimCatatan", placeholder: "Catatan (opsional)", maxlength: "100", autocomplete: "off", value: isi.catatan || "" });
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
      anak.push(el("div", { class: "info", text: "Akun lama: titip dan lihat frasa aktif setelah pembaruan keamanan PIN selesai." }));
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
      toast("Akun lama: Kirim & Opt-in aktif setelah pembaruan keamanan PIN.");
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
    if (st.pin_publik) teks = "Akun lama: Kirim, Opt-in, dan Frasa aktif setelah pembaruan keamanan PIN. Saldo dan Terima tetap bisa dipakai.";
    else if (st.has_pin && !st.has_vault) teks = "Titip frasa di menu Frasa agar bisa Kirim dan Opt-in.";
    else if (!st.has_pin) teks = "Akun ini belum punya PIN. Buat PIN lewat halaman login untuk memakai Kirim dan Frasa.";
    b.textContent = teks;
    b.hidden = !teks;
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
      muatRiwayat()
    ];
    await Promise.all(tugas);
  }

  function tampilkanPesanLogin() {
    $("pesanLogin").hidden = false;
    $("konten").hidden = true;
  }

  function mulai() {
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
    muatData();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mulai);
  else mulai();
})();
