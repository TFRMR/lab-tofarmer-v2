// Isoteri AI Studio -- logic aplikasi.
// PENTING (baca ini kalau mau extend): file JS ini adalah TOOLING STUDIO itu
// sendiri (berjalan di browser untuk membangun halaman), BUKAN bagian dari
// halaman OUTPUT yang dihasilkan. Halaman OUTPUT (lihat buildFullHtml())
// cuma dapat ~10 baris JS loader murni (fetch bundle + jalankan VM) --
// SELURUH logika aplikasi di halaman output ditulis Isoteri (.iso), bukan
// di sini. Lihat pengetahuan-isoteri.js untuk basis pengetahuan AI-nya.

// Model Gemini per Agustus 2026 (Gemini 2.0/1.5 semua sudah non-aktif,
// selalu balas 404) -- fallback dari yang terbaru/tercepat ke yang paling
// murah/luas dukungannya.
const GEMINI_MODELS_FALLBACK = ["gemini-3.7-flash", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"];

let modeSaatIni = "buat"; // "buat" | "konversi"
let tabEditorSaatIni = "preview";
let hasil = { css: "", body: "", iso: "", jsSisa: "" };

// ---------------------------------------------------------------------
// Mode & tab switching
// ---------------------------------------------------------------------

function gantiMode(mode) {
  modeSaatIni = mode;
  document.querySelectorAll(".mode-tab").forEach(el => el.classList.toggle("aktif", el.dataset.mode === mode));
  document.getElementById("konversiArea").classList.toggle("aktif", mode === "konversi");
  const input = document.getElementById("userInput");
  input.placeholder = mode === "buat"
    ? "Ketik perintah (mis: Buat halaman kalkulator panen)..."
    : "Catatan tambahan buat konversi (opsional, boleh kosong)...";
}

function gantiTabEditor(tab) {
  tabEditorSaatIni = tab;
  document.querySelectorAll(".editor-tab").forEach(el => el.classList.toggle("aktif", el.dataset.tab === tab));
  document.getElementById("previewFrame").classList.toggle("aktif", tab === "preview");
  document.getElementById("previewBanner").classList.toggle("aktif", tab === "preview");
  document.getElementById("editorHtml").classList.toggle("aktif", tab === "html");
  document.getElementById("editorCss").classList.toggle("aktif", tab === "css");
  document.getElementById("editorIso").classList.toggle("aktif", tab === "iso");
}

// ---------------------------------------------------------------------
// Prompt & pemanggilan Gemini
// ---------------------------------------------------------------------

function bangunKontekPengetahuan() {
  return PENGETAHUAN_ISOTERI.map(s => `#### ${s.judul}\n${s.isi}`).join("\n\n");
}

const ATURAN_OUTPUT = `ATURAN OUTPUT -- IKUTI PERSIS, JANGAN TAMBAH TEKS LAIN DI LUAR MARKER INI, JANGAN PAKAI CODE FENCE MARKDOWN (\`\`\`) SAMA SEKALI:

===CSS===
(isi CSS murni, TANPA tag <style>)
===BODY===
(isi markup di dalam <body>, TANPA tag <body> sendiri, TANPA <script> apa pun)
===ISO===
(source kode Isoteri murni untuk file .iso -- ini SATU-SATUNYA tempat logika interaktif halaman ditulis)
===JS_SISA===
(KOSONGKAN bagian ini kalau semua logika bisa Isoteri, yang seharusnya SELALU begitu kecuali kasus sangat langka. Isi HANYA kalau benar-benar ada satu fungsi/API browser yang TIDAK ADA padanannya di Isoteri sama sekali -- taruh komentar HTML <!-- JS: alasan singkat --> tepat di atas tiap potongan kode JS.)
===AKHIR===`;

function bangunSystemPrompt() {
  let tugas;
  if (modeSaatIni === "buat") {
    const permintaan = document.getElementById("userInput").value.trim();
    tugas = `TUGAS: Buat halaman web baru sesuai permintaan berikut, dengan CSS modern & rapi, dan SELURUH logika interaktif ditulis Bahasa Isoteri.\n\nPERMINTAAN HALAMAN:\n${permintaan}`;
  } else {
    const htmlLama = document.getElementById("htmlLama").value.trim();
    const catatan = document.getElementById("userInput").value.trim();
    tugas = `TUGAS: KONVERSI halaman HTML lama di bawah ini -- pertahankan TAMPILAN VISUAL & PERILAKU AKHIR SAMA PERSIS seperti aslinya, tapi tulis ulang SELURUH logika JavaScript-nya jadi Bahasa Isoteri mengikuti seluruh aturan di atas (event lewat data-aksi/dom_ketika, DOM manipulation lewat dom_*, dst -- bukan onclick inline, bukan document.querySelector).\n\nHTML LAMA:\n${htmlLama}\n\nCATATAN TAMBAHAN DARI PENGGUNA (kalau ada): ${catatan || "(tidak ada -- konversi apa adanya)"}`;
  }

  return `Kamu adalah asisten ahli Bahasa Isoteri -- bahasa scripting bersintaks Indonesia yang dipakai sebagai PENGGANTI JavaScript untuk logika interaktif halaman web (compiler asli ditulis Rust, jalan di browser lewat bytecode yang sudah dikompilasi).

${ATURAN_OUTPUT}

[REFERENSI LENGKAP BAHASA ISOTERI -- PATUHI PERSIS SINTAKS & FUNGSI BAWAAN INI, JANGAN MENGARANG SINTAKS/FUNGSI YANG TIDAK ADA DI SINI]

${bangunKontekPengetahuan()}

[AKHIR REFERENSI]

${tugas}`;
}

async function panggilGeminiWithFallback(apiKey, model, systemPrompt) {
  const urutanModel = [model, ...GEMINI_MODELS_FALLBACK.filter(m => m !== model)];
  let lastError = null;

  for (const m of urutanModel) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt }] }] }),
      });

      if (response.ok) {
        const data = await response.json();
        const teks = data.candidates && data.candidates[0] && data.candidates[0].content.parts[0].text;
        if (teks) return { teks, modelDipakai: m };
      }

      if (response.status === 404) { console.warn(`Model ${m} 404, coba model berikutnya...`); continue; }

      const errData = await response.json().catch(() => ({}));
      lastError = errData.error ? errData.error.message : `HTTP ${response.status}`;
    } catch (err) {
      console.error(`Gagal menghubungi model ${m}:`, err);
      lastError = err.message;
    }
  }
  throw new Error("Semua model Gemini gagal dipanggil. Detail: " + lastError);
}

// ---------------------------------------------------------------------
// Parsing output AI (kontrak marker ===CSS===/===BODY===/===ISO===/===JS_SISA===)
// ---------------------------------------------------------------------

function uraiOutputAI(teks) {
  // Toleran kalau model tetap membungkus dengan code fence markdown meski sudah dilarang.
  let t = teks.trim().replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/i, "");

  const marker = ["===CSS===", "===BODY===", "===ISO===", "===JS_SISA===", "===AKHIR==="];
  const posisi = marker.map(m => t.indexOf(m));

  if (posisi[0] === -1 || posisi[1] === -1 || posisi[2] === -1) {
    throw new Error("Format balasan AI tidak sesuai kontrak (marker ===CSS===/===BODY===/===ISO=== tidak ketemu). Coba kirim ulang, atau ganti model.");
  }

  const potong = (dariIdx, dariMarkerLen, ke) => {
    const mulai = dariIdx + dariMarkerLen;
    const akhir = ke === -1 ? t.length : ke;
    return t.slice(mulai, akhir).trim();
  };

  const idxJsSisa = posisi[3];
  const idxAkhir = posisi[4];
  const batasIso = idxJsSisa !== -1 ? idxJsSisa : (idxAkhir !== -1 ? idxAkhir : -1);
  const batasJsSisa = idxAkhir !== -1 ? idxAkhir : -1;

  return {
    css: potong(posisi[0], marker[0].length, posisi[1]),
    body: potong(posisi[1], marker[1].length, posisi[2]),
    iso: potong(posisi[2], marker[2].length, batasIso),
    jsSisa: idxJsSisa !== -1 ? potong(idxJsSisa, marker[3].length, batasJsSisa) : "",
  };
}

// ---------------------------------------------------------------------
// Kirim pesan -- alur utama
// ---------------------------------------------------------------------

async function kirimPesan() {
  const apiKey = document.getElementById("apiKey").value.trim();
  const model = document.getElementById("modelSelect").value;
  const userText = document.getElementById("userInput").value.trim();
  const htmlLama = document.getElementById("htmlLama").value.trim();

  if (modeSaatIni === "buat" && !userText) return;
  if (modeSaatIni === "konversi" && !htmlLama) { alert("Tempel dulu HTML lama yang mau dikonversi di kotak atas."); return; }
  if (!apiKey) { alert("Masukkan Gemini API Key dulu di header atas!"); return; }

  tambahChat(modeSaatIni === "buat" ? userText : (userText || "(konversi HTML yang ditempel, tanpa catatan tambahan)"), "user");
  document.getElementById("userInput").value = "";
  document.getElementById("tombolKirim").disabled = true;
  tambahChat("Sedang menulis CSS, markup, dan logika Isoteri...", "ai", true);

  try {
    const systemPrompt = bangunSystemPrompt();
    const { teks, modelDipakai } = await panggilGeminiWithFallback(apiKey, model, systemPrompt);
    hapusPesanLoading();

    const parsed = uraiOutputAI(teks);
    hasil = parsed;
    document.getElementById("editorCss").value = parsed.css;
    document.getElementById("editorHtml").value = ""; // diisi ulang oleh render()
    document.getElementById("editorIso").value = parsed.iso;
    render();

    let ringkasan = `Selesai (model: ${modelDipakai}). CSS ${parsed.css.length} char, Isoteri ${parsed.iso.split("\n").length} baris.`;
    if (parsed.jsSisa) ringkasan += `\n\nPERHATIAN: ada bagian yang AI anggap belum bisa Isoteri-kan, ditulis sebagai JS residual -- cek tab "HTML Lengkap" & baca komentar alasannya.`;
    tambahChat(ringkasan, "ai");
  } catch (err) {
    hapusPesanLoading();
    tambahChat("Error: " + err.message, "ai");
  } finally {
    document.getElementById("tombolKirim").disabled = false;
  }
}

function tambahChat(text, sender, isLoading) {
  const chatHistory = document.getElementById("chatHistory");
  const div = document.createElement("div");
  div.className = `msg ${sender}`;
  if (isLoading) div.id = "loadingMsg";
  div.textContent = text;
  chatHistory.appendChild(div);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}
function hapusPesanLoading() {
  const el = document.getElementById("loadingMsg");
  if (el) el.remove();
}

// ---------------------------------------------------------------------
// Perakitan HTML (loader boilerplate -- SATU-SATUNYA JavaScript di halaman
// output, tidak pernah ditulis AI, selalu sama persis)
// ---------------------------------------------------------------------

function namaBerkas() {
  const n = document.getElementById("namaHalaman").value.trim() || "halaman";
  return n.replace(/[^a-z0-9_-]/gi, "_");
}

function buildFullHtml() {
  const nama = namaBerkas();
  const jsSisaBlok = hasil.jsSisa
    ? `\n\n    <!-- JS residual (Isoteri tidak cukup untuk bagian ini -- lihat komentar di dalamnya) -->\n    <script>\n${hasil.jsSisa}\n    </script>`
    : "";
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${nama}</title>
<!--
  Halaman ini dihasilkan Isoteri AI Studio. Logika interaktifnya ada di
  "${nama}.iso" (Bahasa Isoteri) -- WAJIB dikompilasi dulu sebelum halaman
  ini benar-benar interaktif:

      isoteri ekspor-web ${nama}.iso -o ${nama}.isoweb.json

  Lalu taruh "isoteri-vm.js" di folder yang sama dengan file ini. Tanpa
  langkah itu, halaman tampil (CSS jalan) tapi tombol/interaksi belum aktif.
-->
<style>
${hasil.css}
</style>
</head>
<body>
${hasil.body}

<script src="isoteri-vm.js"></script>
<script>
  (async () => {
    try {
      const res = await fetch("${nama}.isoweb.json");
      if (!res.ok) throw new Error("Bundle belum ada -- jalankan: isoteri ekspor-web ${nama}.iso -o ${nama}.isoweb.json");
      const bundel = await res.json();
      const vm = new IsoteriVM(bundel);
      vm.jalankan();
    } catch (e) {
      console.error(e);
    }
  })();
</script>${jsSisaBlok}
</body>
</html>
`;
}

function buildPreviewHtml() {
  // Pratinjau VISUAL saja -- sengaja TANPA loader/script apa pun, supaya
  // tidak menampilkan error fetch (bundle .isoweb.json memang belum ada
  // sebelum di-compile) di dalam iframe pratinjau.
  return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><style>${hasil.css}</style></head><body>${hasil.body}</body></html>`;
}

function render() {
  const full = buildFullHtml();
  document.getElementById("editorHtml").value = full;
  document.getElementById("previewFrame").srcdoc = buildPreviewHtml();
  document.getElementById("instruksiBox").innerHTML =
    `<b>Cara pakai hasilnya:</b> 1) Unduh <code>${namaBerkas()}.iso</code> &amp; <code>${namaBerkas()}.html</code> (dan <code>isoteri-vm.js</code> sekali saja). ` +
    `2) Compile: <code>isoteri ekspor-web ${namaBerkas()}.iso -o ${namaBerkas()}.isoweb.json</code>. ` +
    `3) Taruh ketiga file (.html, .isoweb.json, isoteri-vm.js) di folder yang sama, buka .html-nya di browser (atau serve lewat local server).`;
}

// ---------------------------------------------------------------------
// Unduh & salin
// ---------------------------------------------------------------------

function unduhTeks(nama, isi) {
  const blob = new Blob([isi], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nama;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function unduhIso() {
  if (!document.getElementById("editorIso").value.trim()) { alert("Belum ada kode Isoteri -- generate dulu lewat chat."); return; }
  unduhTeks(`${namaBerkas()}.iso`, document.getElementById("editorIso").value);
}
function unduhHtml() {
  if (!document.getElementById("editorHtml").value.trim()) { alert("Belum ada HTML -- generate dulu lewat chat."); return; }
  unduhTeks(`${namaBerkas()}.html`, document.getElementById("editorHtml").value);
}
function unduhVmJs() {
  fetch("isoteri-vm.js").then(r => r.text()).then(isi => unduhTeks("isoteri-vm.js", isi))
    .catch(() => alert("isoteri-vm.js harus ada sejajar index.html Studio ini. Ambil dari runtime/web/isoteri-vm.js di repo Isoteri."));
}
function salinPerintahCompile() {
  const cmd = `isoteri ekspor-web ${namaBerkas()}.iso -o ${namaBerkas()}.isoweb.json`;
  navigator.clipboard.writeText(cmd);
  alert("Disalin:\n" + cmd);
}

// ---------------------------------------------------------------------
// Panel referensi (searchable, dari basis pengetahuan yang sama dgn prompt AI)
// ---------------------------------------------------------------------

function renderReferensi() {
  const q = document.getElementById("refCari").value.trim().toLowerCase();
  const container = document.getElementById("refContent");
  container.innerHTML = "";
  let kategoriTerakhir = null;

  PENGETAHUAN_ISOTERI.forEach((s, i) => {
    if (q && !(s.judul.toLowerCase().includes(q) || s.isi.toLowerCase().includes(q) || s.kategori.toLowerCase().includes(q))) return;

    if (s.kategori !== kategoriTerakhir) {
      const h = document.createElement("div");
      h.className = "ref-kategori";
      h.textContent = s.kategori;
      container.appendChild(h);
      kategoriTerakhir = s.kategori;
    }

    const card = document.createElement("div");
    card.className = "ref-card";
    const judul = document.createElement("h4");
    judul.textContent = s.judul;
    const isiEl = document.createElement("div");
    isiEl.className = "ref-isi" + (q ? " terbuka" : "");
    isiEl.textContent = s.isi;
    card.appendChild(judul);
    card.appendChild(isiEl);
    card.onclick = () => isiEl.classList.toggle("terbuka");
    container.appendChild(card);
  });

  if (!container.children.length) {
    container.innerHTML = `<p style="color:#666;text-align:center;padding:20px;">Tidak ada hasil buat "${q}".</p>`;
  }
}

// ---------------------------------------------------------------------
// Inisialisasi
// ---------------------------------------------------------------------

window.addEventListener("DOMContentLoaded", () => {
  // localStorage bisa lempar SecurityError kalau halaman dibuka langsung lewat
  // file:// (origin "opaque") di sebagian browser/konfigurasi -- studio ini
  // sengaja dirancang buat dibuka langsung tanpa server, jadi WAJIB tahan
  // banting kalau localStorage gak tersedia (fallback: API key gak
  // tersimpan antar-sesi, tapi studio-nya tetap jalan normal).
  try {
    const savedKey = localStorage.getItem("isoteri_studio_api_key");
    if (savedKey) document.getElementById("apiKey").value = savedKey;
    document.getElementById("apiKey").addEventListener("change", (e) => {
      try { localStorage.setItem("isoteri_studio_api_key", e.target.value); } catch (err) { /* abaikan, lihat catatan di atas */ }
    });
  } catch (err) {
    console.warn("localStorage tidak tersedia (mis. dibuka lewat file:// di beberapa browser) -- API key tidak akan diingat antar-sesi.");
  }
  renderReferensi();
  render();
});
