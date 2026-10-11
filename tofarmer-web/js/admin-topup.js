// ============================================================
// Halaman pengurus — Nabung TOF
// Alur: anggota membayar ke QRIS → pengurus mencocokkan dengan MUTASI DANA → Konfirmasi
//       → pengurus mengirim TOF dari dompet kas → mencatat ID transaksi → Selesai.
// Semua perintah lewat Edge Function "tof-vault" (PIN pengurus diperiksa di server).
// ============================================================
(function () {
  "use strict";
  const CFG = window.ADMIN_CONFIG || {};
  const EXPLORER_TX = "https://allo.info/tx/";
  const $ = (id) => document.getElementById(id);
  const state = { wallet: null, pin: "", tab: "aktif", qrisBaru: null };

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
      case "network": return "Koneksi bermasalah, coba lagi.";
      default: return "Gagal: " + (res.error || "tidak diketahui");
    }
  }

  const STATUS = { menunggu: ["Menunggu pembayaran", "tunggu"], dibayar: ["Anggota bilang sudah bayar", "tunggu"], dikonfirmasi: ["Terkonfirmasi, TOF belum dikirim", "ok"],
    selesai: ["Selesai", "ok"], ditolak: ["Ditolak", "gagal"], dibatalkan: ["Dibatalkan", "gagal"], kedaluwarsa: ["Kedaluwarsa", "gagal"] };
  const chip = (s) => { const [t, k] = STATUS[s] || [s, ""]; return el("span", { class: "chip " + k, text: t }); };

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
      muatTab(state.tab);
    };

    if (tab === "aktif") {
      aksi.append(
        el("button", { class: "btn hijau", "data-aksi": "konfirmasi", type: "button", text: "✓ Sudah masuk di DANA", onclick: function () {
          if (!window.confirm("Pastikan mutasi DANA menunjukkan uang masuk Rp " + fmtRp(r.total_rp) + " PERSIS. Konfirmasi?")) return;
          jalan(this, "admin_topup_konfirmasi", { id: r.id });
        } }),
        el("button", { class: "btn merah", "data-aksi": "tolak", type: "button", text: "Tolak", onclick: function () {
          const alasan = window.prompt("Alasan penolakan:");
          if (!alasan) return;
          jalan(this, "admin_topup_tolak", { id: r.id, alasan });
        } }));
    } else if (tab === "perlu_kirim") {
      const txid = el("input", { class: "inp", "data-txid": "1", placeholder: "ID transaksi pengiriman TOF (52 karakter)", autocomplete: "off", spellcheck: "false" });
      const link = "dompet.html?aset=TOF&ke=" + encodeURIComponent(r.profile_id) + "&jumlah=" + encodeURIComponent(desimal(r.tof_units));
      k.insertBefore(el("div", { class: "kecil mono", text: "Kirim ke: " + r.profile_id }), aksi);
      aksi.append(el("a", { class: "btn hijau", "data-aksi": "kirim", href: link, text: "Kirim TOF dari Dompet", style: "text-decoration:none;" }));
      k.insertBefore(txid, galat);
      k.insertBefore(el("button", { class: "btn utama", "data-aksi": "selesai", type: "button", text: "Tandai selesai", onclick: function () {
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
    const res = await adm("admin_topup_daftar", { tampil: tab });
    if (!res.ok) { konten.replaceChildren(el("div", { class: "galat", text: pesan(res) })); return; }
    konten.replaceChildren(...(res.daftar.length ? res.daftar.map((r) => kartu(r, tab)) : [el("div", { class: "kecil", id: "kosong", style: "padding:14px;", text: "Tidak ada data." })]));
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
    state.qrisBaru = null;
    const f = {
      kurs: el("input", { class: "inp", id: "setKurs", inputmode: "numeric", value: String(p.kurs) }),
      min: el("input", { class: "inp", id: "setMin", inputmode: "numeric", value: String(p.min_rp) }),
      maks: el("input", { class: "inp", id: "setMaks", inputmode: "numeric", value: String(p.maks_rp) }),
      nama: el("input", { class: "inp", id: "setNama", maxlength: "80", value: p.nama_penerima || "", placeholder: "Nama yang tampil di QRIS/DANA" }),
      aturan: el("textarea", { class: "inp", id: "setAturan", maxlength: "1500", placeholder: "Aturan singkat: arti 1 TOF, bagi hasil, cara keluar anggota" }),
      aktif: el("input", { type: "checkbox", id: "setAktif" }),
      file: el("input", { type: "file", id: "setQris", accept: "image/png,image/jpeg,image/webp" }),
    };
    f.aturan.value = p.aturan || "";
    f.aktif.checked = !!p.aktif;
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
      el("label", { class: "lbl", for: "setAturan", text: "Aturan yang tampil ke anggota" }), f.aturan,
      el("label", { class: "lbl", for: "setQris", text: "Gambar QRIS (DANA / kas bersama)" }), f.file, prev,
      el("label", { class: "lbl", style: "display:flex;gap:8px;align-items:center;" }, f.aktif, "Nabung dibuka untuk anggota"),
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
