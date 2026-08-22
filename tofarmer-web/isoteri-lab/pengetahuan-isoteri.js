// Pengetahuan Bahasa Isoteri -- basis pengetahuan LENGKAP buat AI Studio.
// Disusun dari docs/REFERENSI.md, docs/KETERBATASAN.md, dan runtime/web/README.md
// milik proyek Isoteri asli (per Agustus 2026). Dipakai untuk DUA hal sekaligus:
//   1. Konteks penuh yang dikirim ke Gemini tiap kali generate/konversi halaman
//      (BUKAN retrieval-berbasis-kata-kunci yang rapuh -- seluruh isi ini muat
//      nyaman di jendela konteks model modern, jadi tidak ada risiko "informasi
//      penting kelewat gara-gara kata kuncinya gak ketebak").
//   2. Panel referensi yang bisa dicari di UI Studio (searchable, bukan cuma
//      "hasil RAG" yang muncul-hilang).
//
// Struktur: array {kategori, judul, isi} -- 'isi' pakai Markdown ringan
// (heading kecil, code fence) supaya gampang dirender apa adanya di panel
// maupun dikirim mentah sebagai teks prompt.

const PENGETAHUAN_ISOTERI = [

// =====================================================================
// BAHASA INTI
// =====================================================================

{
  kategori: "Bahasa",
  judul: "Komentar",
  isi: `Cuma komentar SATU BARIS, diawali \`catatan:\`, sampai akhir baris. Tidak ada komentar multi-baris.
\`\`\`
catatan: ini komentar
ingat x = 10  catatan: komentar di akhir baris juga boleh
\`\`\``
},

{
  kategori: "Bahasa",
  judul: "Tipe Data",
  isi: `| Tipe | Contoh literal | Keterangan |
|---|---|---|
| Angka | \`42\`, \`-7\` | Integer bertanda 64-bit (i64) |
| Desimal | \`3.14\`, \`2.0\` | Floating point 64-bit (f64) |
| Teks | \`"halo dunia"\` | String. Escape: \`\\"\`, \`\\n\`, \`\\\\\` |
| Bool | \`benar\`, \`salah\` | Boolean |
| Daftar | \`[1, 2, 3]\` | List dinamis, boleh campur tipe |
| Peta | \`{"kunci": nilai}\` | Dictionary, KUNCI HARUS Teks literal berkutip |
| Bentuk (instans) | \`Petani { nama: "Budi" }\` | Struct kustom, lihat bagian Bentuk |
| Fungsi | \`fungsi(n) { kembalikan n }\` | Nilai closure |
| kosong | \`kosong\` | Nilai null |

TIDAK ADA konversi tipe implisit antara Angka dan Desimal (\`5 + 2.0\` ERROR KOMPILASI) -- pakai \`ke_desimal()\`/\`ke_bulat()\`/\`ke_angka()\` eksplisit.

PENTING soal literal Peta vs Bentuk: \`{"x": 1}\` itu Peta (kunci berkutip pakai \`:\`). \`Titik { x: 1 }\` itu instans Bentuk (nama Bentuk di depan, field TANPA kutip). JANGAN pernah tulis \`{x: 1}\` tanpa kutip berharap jadi Peta -- itu sintaks Bentuk, akan error kalau "Titik"-nya belum dideklarasikan \`bentuk\`.`
},

{
  kategori: "Bahasa",
  judul: "Variabel (ingat/simpan) -- WAJIB DIPATUHI: aturan 'ingat' vs assignment",
  isi: `\`\`\`
ingat nama = "Budi"              catatan: deklarasi BARU, tipe disimpulkan
ingat umur: Angka = 25           catatan: deklarasi dengan anotasi tipe eksplisit (opsional)
simpan kota = "Kulon Progo"      catatan: 'simpan' = sinonim persis dari 'ingat'

nama = "Siti"                    catatan: UBAH nilai variabel yg SUDAH ADA -- TANPA 'ingat'/'simpan'
\`\`\`

AturAN KRITIS (sumber error paling umum kalau dilanggar):
- \`ingat\`/\`simpan\` HANYA dipakai saat PERTAMA KALI mendeklarasikan variabel. Menulis \`ingat x = ...\` DUA KALI untuk nama yang sama di scope yang sama = ERROR KOMPILASI.
- Mengubah nilai variabel yang SUDAH ADA = \`nama = nilai_baru\` TANPA kata kunci \`ingat\`/\`simpan\` sama sekali. Kalau variabelnya belum pernah di-\`ingat\` sebelumnya, ini juga error ("variabel belum dideklarasikan").
- Variabel GLOBAL (level atas program, di luar fungsi) harus dideklarasikan SEBELUM baris yang memakainya (tidak ada forward-reference untuk \`ingat\` -- beda dari \`fungsi\`/\`bentuk\` yang boleh dipakai sebelum baris deklarasinya).
- Assignment field bersarang: \`budi.alamat.desa = "Purwosari"\` -- rantai \`.field\` boleh sedalam apapun, TANPA \`ingat\` (karena ini assignment, bukan deklarasi baru).`
},

{
  kategori: "Bahasa",
  judul: "Operator",
  isi: `| Kategori | Operator |
|---|---|
| Aritmatika | \`+ - * / %\` |
| Perbandingan | \`== != > >= < <=\` |
| Logika | \`dan\` \`atau\` \`!\` (negasi unary) |
| Compound | \`+= -= *= /=\` |
| Inc/Dec | \`++\` \`--\` (statement baris sendiri SAJA, BUKAN ekspresi -- \`x = i++\` ERROR) |
| Field | \`.\` (mis. \`budi.nama\`) |
| Indeks | \`[...]\` (mis. \`daftar[0]\`, \`peta["kunci"]\`) |

\`+\` pada Teks = penggabungan string, OTOMATIS konversi operand non-Teks: \`"Total: " + 5\` -> \`"Total: 5"\`. Sangat berguna buat bangun HTML string di komponen.

\`!ekspr\` pakai truthiness sama seperti \`kalau\`: Bool apa adanya, Angka/Desimal 0 = salah, Teks/Daftar/Peta kosong = salah, \`kosong\` selalu salah, selain itu benar. \`!5\` -> salah, \`!0\` -> benar, \`!""\` -> benar.

Assignment lewat indeks: \`daftar[0] = 99\` (indeks HARUS SUDAH ADA, tidak auto-extend -- pakai \`gabung()\` buat nambah elemen baru), \`peta["k"] = 99\` (kunci baru OTOMATIS ditambahkan kalau belum ada). Boleh nested & campur field: \`objek.daftar[0].nama = x\`.

Kata kunci \`jika\` = sinonim \`kalau\`.`
},

{
  kategori: "Bahasa",
  judul: "Percabangan (kalau/lainnya)",
  isi: `\`\`\`
kalau (kondisi) {
    ...
} lainnya kalau (kondisi_lain) {
    ...
} lainnya {
    ...
}
\`\`\`
Kondisi WAJIB dikurung \`(...)\`. \`lainnya kalau\` boleh dirantai berapa kali pun. Blok \`lainnya\` opsional.`
},

{
  kategori: "Bahasa",
  judul: "Perulangan (ulang / ulang setiap)",
  isi: `\`\`\`
catatan: while-loop
ulang (kondisi) {
    kalau (x == 3) { lanjut }   catatan: continue -> lompat ke iterasi berikutnya
    kalau (x == 7) { putus }    catatan: break -> keluar loop
    ...
}

catatan: foreach atas Daftar
ulang setiap item dari daftar {
    tampilkan item
}
\`\`\`
\`putus\`/\`lanjut\` boleh bersarang (selalu ke loop TERDEKAT), aman dipakai di dalam \`coba/tangkap\`.

JANGAN pakai \`ulang selaras\` (paralel) untuk halaman web biasa -- itu fitur khusus komputasi CPU-bound native, SANGAT terbatas (gak bisa panggil fungsi apa pun di badannya) dan TIDAK didukung sama sekali di web export. Untuk halaman web, selalu pakai \`ulang\`/\`ulang setiap\` biasa.`
},

{
  kategori: "Bahasa",
  judul: "Fungsi",
  isi: `\`\`\`
fungsi nama_fungsi(param1: Tipe1, param2: Tipe2) {
    ...
    kembalikan nilai
}
\`\`\`
- Anotasi tipe parameter OPSIONAL.
- Fungsi HANYA boleh dideklarasikan di LEVEL ATAS program (tidak nested di dalam fungsi/kalau/ulang lain) -- untuk fungsi nested/anonim pakai closure.
- Boleh dipanggil SEBELUM dideklarasikan secara tekstual (forward-reference didukung).
- Nama fungsi harus unik dalam satu program.
- Bisa membaca variabel global (live, bukan snapshot) selama globalnya dideklarasikan lebih dulu secara tekstual.`
},

{
  kategori: "Bahasa",
  judul: "Closure (Fungsi Anonim)",
  isi: `\`\`\`
ingat kuadrat = fungsi(n) {
    kembalikan n * n
}
tampilkan kuadrat(5)     catatan: 25
\`\`\`
- Closure adalah EKSPRESI \`fungsi(params) { badan }\` -- dipakai di mana pun ekspresi diterima (ditugaskan ke variabel, dilewatkan sebagai argumen, jadi properti \`aksi\`/\`render\` komponen, dst).
- Menangkap (capture) variabel dari scope pembungkus -- TAPI itu SNAPSHOT NILAI, bukan referensi hidup (kalau variabel yang ditangkap berubah SETELAH closure dibuat, closure-nya TIDAK ikut berubah -- beda dari JS/Python).
- Closure di dalam fungsi lain TIDAK BISA rekursi ke dirinya sendiri.
- Memanggil sebuah variabel (\`f(x)\`) otomatis terdeteksi sebagai "panggil closure" kalau \`f\` variabel, atau "panggil fungsi statis" kalau \`f\` nama fungsi.`
},

{
  kategori: "Bahasa",
  judul: "Bentuk (Struct/Tipe Custom)",
  isi: `\`\`\`
bentuk Petani {
    nama: Teks,
    lahan: Angka,
    hasil: Desimal
}

ingat budi = Petani { nama: "Budi", lahan: 2, hasil: 15.5 }   catatan: urutan field BEBAS
tampilkan budi.nama
budi.hasil = 20.0                  catatan: ubah field (TANPA 'ingat', ini assignment)
budi.alamat.desa = "Purwosari"     catatan: field bersarang, berapa pun level-nya
\`\`\`
- Semua field WAJIB anotasi tipe.
- Boleh dideklarasikan di mana saja di level atas (forward-reference OK).
- SEMUA field wajib diisi saat instansiasi -- field kurang/asing/salah tipe = ERROR KOMPILASI (bukan runtime), jadi TIDAK BISA ditangkap \`coba/tangkap\`.
- Immutable/clone-on-write di belakang layar -- tapi dari sudut pandang penulis kode, perlakukan seperti objek mutable biasa (assignment field langsung jalan).

Pakai \`bentuk\` sebagai pengganti "objek state" komponen -- jauh lebih aman dari Peta polos karena field-nya divalidasi saat kompilasi.`
},

{
  kategori: "Bahasa",
  judul: "Daftar (List) -- HATI-HATI dengan gabung()",
  isi: `\`\`\`
ingat harga = [5000, 7500, 6200]
harga[0]                  catatan: indeks baca, mulai dari 0
panjang(harga)             catatan: 3
gabung(harga, 9999)        catatan: Daftar BARU dgn 9999 ditambah di akhir -- Daftar ASLI TIDAK berubah
jumlah(harga)               catatan: total semua elemen numerik
rata_rata(harga)            catatan: rata-rata elemen numerik
\`\`\`

**\`gabung(daftar, item)\` MENAMBAHKAN SATU ELEMEN, BUKAN MENGGABUNG DUA DAFTAR.** Ini kesalahan paling umum ketika menulis kode Isoteri -- JANGAN PERNAH menulis \`gabung(a, [x])\` mengira itu concat, itu malah menghasilkan Daftar berisi Daftar (\`[..., [x]]\`). Kalau butuh menambah SATU item: \`gabung(daftar, item)\` LANGSUNG (item-nya sendiri, TANPA dibungkus \`[...]\`). \`gabung()\` mengembalikan Daftar BARU -- kalau mau "menyimpan" hasilnya, WAJIB assignment ulang: \`daftar = gabung(daftar, item)\`.

Assignment lewat indeks (\`daftar[0] = x\`) mengubah elemen yang SUDAH ADA saja -- indeks di luar jangkauan = error, TIDAK auto-extend.

Fungsi list lanjutan:
\`\`\`
petakan(daftar, fungsi(n) { kembalikan n * n })        catatan: map
saring(daftar, fungsi(n) { kembalikan n % 2 == 0 })    catatan: filter, closure WAJIB kembalikan Bool
urutkan(daftar)                                          catatan: sort natural
urutkan(daftar, "nama_fungsi")                           catatan: sort berdasar kunci hasil fungsi
\`\`\`
Argumen kedua \`petakan\`/\`saring\`/\`urutkan\` terima Teks (nama fungsi TOP-LEVEL, berkutip) ATAU closure literal langsung -- closure dengan capture juga bisa. TIDAK BISA melewatkan nama fungsi top-level TANPA kutip sebagai nilai (bungkus jadi closure kecil: \`fungsi(x) { kembalikan nama_fungsi(x) }\`).`
},

{
  kategori: "Bahasa",
  judul: "Peta (Dictionary)",
  isi: `\`\`\`
ingat profil = {"nama": "Budi", "umur": 25}
profil["nama"]              catatan: akses lewat kunci -- HARUS pakai [...], BUKAN .nama seperti Bentuk
panjang(profil)              catatan: jumlah pasangan kunci-nilai
kunci_peta(profil)           catatan: Daftar semua kunci (Teks)
profil["kota"] = "Kulon Progo"   catatan: kunci baru otomatis ditambahkan
\`\`\`
Kunci literal Peta HARUS Teks berkutip (\`{"nama": ...}\`, BUKAN \`{nama: ...}\` -- itu sintaks Bentuk).

Peta datang dari \`props\` komponen dan hasil \`urai_json()\` -- akses field-nya selalu pakai \`props["kunci"]\`, JANGAN \`props.kunci\` (itu sintaks untuk Bentuk, bukan Peta).`
},

{
  kategori: "Bahasa",
  judul: "Penanganan Error (coba/tangkap)",
  isi: `\`\`\`
coba {
    ingat hasil = 10 / pembagi
} tangkap pesan {
    tampilkan "Error: " + pesan
}
\`\`\`
\`pesan\` (variabel di \`tangkap\`) berisi Teks deskripsi error, biasanya diawali \`"Baris N: ..."\`. Hanya error RUNTIME yang bisa ditangkap (pembagian nol, indeks luar jangkauan, field tidak ditemukan, panggil nilai bukan-fungsi). Error KOMPILASI (tipe salah, field Bentuk kurang, variabel belum dideklarasikan) TIDAK BISA ditangkap -- program gagal SEBELUM sempat jalan sama sekali.`
},

{
  kategori: "Bahasa",
  judul: "Fungsi Bawaan (Standard Library) -- Tabel Lengkap",
  isi: `**List & Peta:**
| Fungsi | Signature |
|---|---|
| \`panjang(x)\` | Daftar\\|Teks\\|Peta -> Angka |
| \`gabung(daftar, item)\` | Daftar, Nilai -> Daftar (TAMBAH SATU ITEM, lihat catatan Daftar) |
| \`ambil(struktur, kunci)\` | sama seperti \`[...]\` |
| \`jumlah(daftar)\` / \`rata_rata(daftar)\` | -> Angka\\|Desimal |
| \`kunci_peta(peta)\` | -> Daftar Teks |
| \`petakan(daftar, fn)\` / \`saring(daftar, fn)\` / \`urutkan(daftar[, fn])\` | map/filter/sort |

**Matematika:** \`akar(x)\`, \`pangkat(basis, eksponen)\`, \`bulat(x)\` (round), \`bulat_bawah(x)\` (floor), \`bulat_atas(x)\` (ceil), \`mutlak(x)\`, \`min(a,b)\`, \`maks(a,b)\`, \`acak()\` (Desimal di [0,1)).

**Teks:** \`potong(teks, mulai, akhir)\` (substring), \`ganti(teks, dari, ke)\`, \`huruf_besar(teks)\`, \`huruf_kecil(teks)\`, \`pangkas(teks)\` (trim), \`pisah(teks, pemisah)\` (split->Daftar), \`satukan(daftar, pemisah)\` (join), \`mengandung(teks, sub)\`, \`diawali(teks, awalan)\`, \`diakhiri(teks, akhiran)\`.

**Konversi tipe:** \`ke_desimal(x)\` (Angka/Desimal -> Desimal), \`ke_angka(x)\` (Angka/Desimal/Teks -> Angka -- dari Teks: parse INTEGER murni, error jelas kalau ada titik/bukan angka valid, PENTING dipakai saat baca \`dom_atribut()\` yang selalu berupa Teks), \`ke_bulat(x)\` (truncate ke Angka), \`ke_teks(x)\` (apa saja -> Teks).

**JSON:** \`urai_json(teks)\` (Teks -> Nilai Isoteri), \`teks_json(nilai)\` (Nilai -> Teks JSON).

Kalau butuh operasi yang TIDAK ADA di daftar ini (localStorage, fetch, dst.) -- itu ada di bagian "Web Runtime" terpisah, BUKAN Standard Library inti.`
},

// =====================================================================
// WEB RUNTIME -- INI YANG DIPAKAI BUAT HALAMAN HTML (pengganti JS)
// =====================================================================

{
  kategori: "Web",
  judul: "PRINSIP DASAR: Cara Isoteri menggantikan JavaScript di halaman web",
  isi: `Isoteri TIDAK bisa disisipkan langsung sebagai \`<script>\` di HTML (browser tidak mengenal bahasa ini). Alurnya:

1. Tulis logika halaman dalam Isoteri murni (\`.iso\`), pakai fungsi \`dom_*\`/\`komponen_*\`/dst di bawah ini -- SEMUA berperan sebagai pengganti \`document.querySelector\`, \`addEventListener\`, manipulasi DOM, dst.
2. File \`.iso\` itu DIKOMPILASI (lewat CLI \`isoteri ekspor-web halaman.iso -o halaman.isoweb.json\`) jadi bytecode JSON.
3. HTML akhir memuat \`isoteri-vm.js\` (interpreter JS KECIL yang HANYA menjalankan bytecode -- BUKAN tempat menulis logika aplikasi) + fetch bundle JSON-nya + \`vm.jalankan()\`.

**Konsekuensi penting buat Studio ini:** HTML final YANG DIHASILKAN AI cukup berisi markup (\`<body>\`) + CSS + SATU blok \`<script>\` LOADER standar (~10 baris, SELALU SAMA, tidak pernah berubah, tidak mengandung logika aplikasi apa pun) yang memuat bundle & menjalankan VM. SELURUH logika interaktif (tombol, form, render ulang, dst) ditulis di file \`.iso\` TERPISAH, bukan inline di HTML.

Representasi elemen DOM di Isoteri: nilai \`ElemenDOM\` (dikembalikan \`dom_pilih()\`/\`dom_buat()\`), dilewatkan ke fungsi \`dom_*\` lain sebagai argumen pertama.`
},

{
  kategori: "Web",
  judul: "DOM Dasar -- baca/tulis elemen, atribut, kelas",
  isi: `\`\`\`
ingat el = dom_pilih("#app")                       catatan: querySelector -- ElemenDOM atau kosong
ingat semua = dom_pilih_semua(".item")              catatan: querySelectorAll -- Daftar ElemenDOM

dom_teks(el)                                        catatan: baca .textContent
dom_atur_teks(el, "halo")                           catatan: tulis .textContent (AMAN dari XSS, escape otomatis browser)
dom_html(el)                                        catatan: baca .innerHTML
dom_atur_html(el, "<b>halo</b>")                    catatan: tulis .innerHTML (RAW, dipakai render komponen)

dom_atribut(el, "data-id")                          catatan: getAttribute -> Teks atau kosong
dom_atur_atribut(el, "data-id", "5")                 catatan: setAttribute
dom_tambah_kelas(el, "aktif")                        catatan: classList.add
dom_hapus_kelas(el, "aktif")                         catatan: classList.remove
dom_punya_kelas(el, "aktif")                         catatan: classList.contains -> Bool

ingat baru = dom_buat("div")                        catatan: createElement
dom_tambah_anak(el, baru)                            catatan: appendChild
dom_hapus(el)                                        catatan: remove elemen dari DOM
\`\`\`
Semua fungsi \`dom_atur_*\`/\`dom_tambah_*\` mengembalikan elemen argumen pertamanya -- bisa dirantai lewat variabel berurutan kalau perlu.`
},

{
  kategori: "Web",
  judul: "Event Handler -- dom_ketika()",
  isi: `\`\`\`
dom_ketika(tombol, "klik", fungsi() { tampilkan "diklik" })
dom_ketika(input, "input", fungsi(e) { tampilkan e.nilai })     catatan: baca data event
ingat ambang = 10
dom_ketika(tombol, "klik", fungsi(e) { kalau (hitung > ambang) { ... } })   catatan: closure DENGAN capture
\`\`\`
Nama event standar DOM: \`"klik"\` (ATAU nama JS asli \`"click"\` -- dua-duanya boleh, tapi konsisten pakai salah satu), \`"input"\`, \`"change"\`, \`"submit"\`, \`"keyup"\`.

Callback boleh 0 parameter (perilaku lama) atau 1 parameter \`e\` (instans Event) dengan field:
- \`e.tipe\` -- Teks, nama event mentah
- \`e.nilai\` -- Teks isi \`.value\` elemen target (kalau ada), \`kosong\` kalau tidak
- \`e.tombol\` -- Teks tombol keyboard yang ditekan (event keyboard saja), \`kosong\` kalau bukan
- \`e.target\` -- ElemenDOM, buat dipakai lagi ke \`dom_*\` lain

\`dom_ketika()\` BELUM bisa \`removeEventListener\` -- sekali daftar, nempel selamanya sampai elemen dihapus dari DOM. Untuk komponen (lihat bawah), event delegation via \`data-aksi\` jauh lebih disarankan daripada \`dom_ketika()\` manual satu-satu.`
},

{
  kategori: "Web",
  judul: "Form Input -- baca/tulis nilai, checkbox, fokus",
  isi: `\`\`\`
dom_nilai(input)                        catatan: baca .value -> Teks
dom_atur_nilai(input, "teks baru")       catatan: tulis .value
dom_dicentang(checkbox)                  catatan: baca .checked -> Bool
dom_atur_dicentang(checkbox, benar)      catatan: tulis .checked
dom_fokus(input)                         catatan: .focus()
\`\`\``
},

{
  kategori: "Web",
  judul: "Timer -- tunda() / interval_mulai() / interval_hentikan()",
  isi: `\`\`\`
tunda(1000, fungsi() { tampilkan "sedetik kemudian" })            catatan: setTimeout, sekali jalan
ingat id = interval_mulai(500, fungsi() { tampilkan "tik" })      catatan: setInterval
interval_hentikan(id)                                              catatan: clearInterval
\`\`\`
Callback terima 0 argumen (closure boleh capture variabel luar). \`id\` = Angka biasa, bisa disimpan sebagai variabel/state.`
},

{
  kategori: "Web",
  judul: "Fetch / HTTP -- unduh_async() dan unduh_lanjut_async()",
  isi: `\`\`\`
catatan: versi simpel -- GET, hasil langsung Teks
unduh_async("https://api.contoh.com/data", fungsi(hasil) { tampilkan hasil }, fungsi(pesan) { tampilkan "gagal: " + pesan })

catatan: versi lanjutan -- method/header/body, respons terstruktur
unduh_lanjut_async(url,
    {"metode": "POST", "body": teks_json(data), "header": {"Content-Type": "application/json"}},
    fungsi(r) { tampilkan r.status; tampilkan r.ok; ingat data = urai_json(r.teks) },
    fungsi(pesan) { tampilkan "gagal: " + pesan })
\`\`\`
\`opsi\` (Peta): \`metode\` (default \`"GET"\`), \`body\` (Teks), \`header\` (Peta<Teks,Teks>). Callback sukses terima SATU argumen instans \`Respons\`: \`status\` (Angka), \`ok\` (Bool), \`teks\` (Teks mentah -- urai sendiri lewat \`urai_json()\` kalau JSON).`
},

{
  kategori: "Web",
  judul: "Local Storage -- simpan_lokal() / ambil_lokal() / hapus_lokal()",
  isi: `\`\`\`
simpan_lokal("tema", "gelap")
ambil_lokal("tema")           catatan: -> Teks, atau kosong kalau belum ada
hapus_lokal("tema")
\`\`\`
Wrapper \`localStorage\`. Nilai SELALU disimpan/dibaca sebagai Teks -- untuk data terstruktur, \`teks_json()\`/\`urai_json()\` sendiri sebelum simpan/sesudah baca.`
},

{
  kategori: "Web",
  judul: "Router (SPA hash-routing) -- rute_daftar() dkk",
  isi: `\`\`\`
fungsi render_beranda(params) { dom_atur_html(dom_pilih("#app"), "<h1>Beranda</h1>") }
fungsi render_produk(params) { tampilkan params["id"] }    catatan: dari pola "/produk/:id"
fungsi render_404(params) { dom_atur_html(dom_pilih("#app"), "<h1>404</h1>") }

rute_daftar([
    {"pola": "/", "tampilkan": "render_beranda"},
    {"pola": "/produk/:id", "tampilkan": "render_produk"},
    {"pola": "*", "tampilkan": "render_404"}          catatan: catch-all, HARUS di baris PALING AKHIR
])
rute_mulai()                 catatan: mulai dengarkan hashchange
rute_navigasi("/produk/7")   catatan: navigasi terprogram (dari tombol, dst)
rute_sekarang()               catatan: {path: Teks, params: Peta}
\`\`\`
URL berbentuk \`situs.com/#/produk/7\` (hash routing -- zero-config, jalan di hosting statis apa pun tanpa setting server). \`:nama\` menangkap satu segmen path, \`*\` di akhir = catch-all (isinya masuk \`params["*"]\`). Handler terima Teks (nama fungsi) ATAU closure. Cuma satu level rute (belum ada nested routes) -- buat halaman bertingkat, panggil komponen anak dari dalam handler render.`
},

{
  kategori: "Web",
  judul: "Manajemen State (pub/sub sederhana) -- state_buat() dkk",
  isi: `\`\`\`
ingat toko = state_buat(0)                                    catatan: nilai awal
state_langgan(toko, fungsi(n) { dom_atur_teks(el, "" + n) })  catatan: subscriber, DIPANGGIL LANGSUNG sekali saat daftar
state_atur(toko, 5)                                            catatan: set nilai baru -> SEMUA subscriber dipanggil ulang
state_ubah(toko, fungsi(lama) { kembalikan lama + 1 })         catatan: update berbasis nilai lama
state_nilai(toko)                                               catatan: baca nilai saat ini TANPA langganan
\`\`\`
Pola pub/sub SEDERHANA (bukan reactive fine-grained). Tiap \`state_atur\`/\`state_ubah\` memanggil ULANG SEMUA subscriber dengan nilai baru PENUH -- subscriber (biasanya "fungsi render ulang" pakai \`dom_atur_html\`) tanggung jawab sendiri update tampilannya. Untuk kebutuhan komponen dengan render otomatis + event delegation, PAKAI Component System (di bawah) -- itu lapisan lebih tinggi & lebih nyaman dari \`state_*\` mentah.`
},

{
  kategori: "Web",
  judul: "Component System -- komponen_buat()/komponen_pasang() -- CARA UTAMA bikin UI interaktif",
  isi: `Ini yang PALING SERING dipakai untuk halaman web praktis -- setara komponen React/Vue tapi model "render-ulang-penuh" (HTML string lewat innerHTML), BUKAN vdom-diffing.

\`\`\`
bentuk TodoState { item_daftar, teks_input }

fungsi render_todo(props, state) {
    kembalikan "<input data-aksi='ubah' data-peristiwa='input' value='" + state.teks_input + "'>" +
               "<button data-aksi='tambah'>Tambah</button>"
}
fungsi aksi_ubah(props, state, e) { kembalikan TodoState { item_daftar: state.item_daftar, teks_input: e.nilai } }
fungsi aksi_tambah(props, state, e) { catatan: ... kembalikan state_baru }
fungsi hook_dipasang(props, state) { tampilkan "komponen siap" }

ingat todo = komponen_buat({
    "state_awal": TodoState { item_daftar: [], teks_input: "" },
    "render": "render_todo",
    "aksi": { "ubah": "aksi_ubah", "tambah": "aksi_tambah" },
    "dipasang": "hook_dipasang",       catatan: opsional, sekali pas mount
    "diperbarui": fungsi(props, state) { tampilkan "render ulang" },   catatan: opsional, tiap re-render
    "dilepas": fungsi(props, state) { tampilkan "dibongkar" }          catatan: opsional
})
ingat instans = komponen_pasang(todo, dom_pilih("#app"))

komponen_state(instans)                catatan: baca state saat ini
komponen_atur_state(instans, nilai)    catatan: ganti state -> otomatis render ulang
komponen_ubah_state(instans, fungsi(lama) { kembalikan lama_diubah })
komponen_atur_props(instans, props_baru)
komponen_elemen(instans)               catatan: ElemenDOM wadah
komponen_lepas(instans)                catatan: panggil "dilepas", copot listener, kosongkan wadah
\`\`\`

**Nilai kunci "render"/"aksi"/hooks BOLEH Teks (nama fungsi top-level) ATAU closure literal langsung** -- dua-duanya sah, closure lebih ringkas untuk komponen kecil.

**Event lewat atribut \`data-aksi\`, BUKAN \`onclick=\` inline** -- karena \`render\` cuma hasilkan teks HTML (bukan pointer fungsi hidup), TIDAK ADA cara nyuntik handler langsung ke atribut event HTML. Solusinya event delegation: tulis \`data-aksi="nama"\` di elemen HTML hasil render (opsional \`data-peristiwa="input"\`/\`"change"\`/\`"submit"\`/\`"keyup"\`, default \`"click"\`), daftarkan handler sesuai lewat opsi \`"aksi"\` komponen. Handler aksi dapat \`(props, state, event)\`, **nilai kembaliannya JADI state baru** (pola reducer) -- OTOMATIS memicu render ulang. JANGAN PERNAH tulis \`onclick="..."\` di string HTML hasil render -- itu TIDAK akan terpanggil dari sisi Isoteri sama sekali.

**Nested/composed components -- \`komponen_anak(komponen_def, kunci, props?)\`:**
\`\`\`
fungsi render_induk(props, state) {
    kembalikan "<div>" + komponen_anak(komp_counter, "counter-1", {"awal": 10}) + "</div>"
}
\`\`\`
Panggil DI DALAM \`render\` induk, taruh hasilnya (Teks placeholder) di string HTML. Runtime OTOMATIS mount/update/unmount anaknya. \`kunci\` WAJIB stabil & unik antar-saudara (persis \`key\` React) -- state anak DIPERTAHANKAN lintas render ulang induk selama kunci-nya sama. Render DAFTAR anak (satu per item, mis. tiap baris todo): pakai id unik tiap item sebagai bagian kunci (\`"todo-" + t.id\`), JANGAN cuma index array kalau daftarnya bisa disisipi/dihapus di tengah. Rekursif tanpa batas kedalaman -- anak yang render-nya sendiri manggil \`komponen_anak()\` buat cucu, ditangani otomatis. \`komponen_anak_instans(instans_induk, kunci)\` opsional buat pegang instans anak langsung (jarang perlu -- pola disarankan tetap props-turun/aksi-naik).`
},

{
  kategori: "Web",
  judul: "Canvas (grafik 2D)",
  isi: `\`\`\`
ingat kanvas = dom_pilih("#kanvas")
ingat ctx = dom_konteks_2d(kanvas)
kanvas_isi_gaya(ctx, "#ff0000")
kanvas_isi_persegi(ctx, 10, 10, 100, 50)
kanvas_garis_gaya(ctx, "#000")
kanvas_lebar_garis(ctx, 2)
kanvas_garis_persegi(ctx, 10, 10, 100, 50)
kanvas_bersihkan(ctx, 0, 0, 500, 500)
kanvas_font(ctx, "16px sans-serif")
kanvas_isi_teks(ctx, "Halo", 20, 30)
kanvas_mulai_jalur(ctx)
kanvas_pindah_ke(ctx, 0, 0)
kanvas_garis_ke(ctx, 100, 100)
kanvas_lingkaran(ctx, 50, 50, 20)
kanvas_isi(ctx)
kanvas_garis(ctx)
\`\`\`
Wrapper tipis di atas Canvas 2D Context API standar -- nama fungsi mengikuti method aslinya (fillRect->isi_persegi, strokeRect->garis_persegi, dst).`
},

{
  kategori: "Web",
  judul: "WebSocket",
  isi: `\`\`\`
ingat soket = ws_buka("wss://contoh.com/socket")
ws_ketika_buka(soket, fungsi() { tampilkan "terhubung" })
ws_ketika_pesan(soket, fungsi(pesan) { tampilkan pesan })    catatan: pesan = Teks
ws_ketika_tutup(soket, fungsi() { tampilkan "putus" })
ws_ketika_error(soket, fungsi() { tampilkan "error" })
ws_kirim(soket, "halo server")
ws_status(soket)     catatan: Teks status koneksi
ws_tutup(soket)
\`\`\``
},

{
  kategori: "Web",
  judul: "ATURAN OUTPUT -- yang JANGAN dilakukan saat generate halaman",
  isi: `1. JANGAN PERNAH tulis \`<script>\` berisi JavaScript untuk LOGIKA APLIKASI (button handler, render, fetch, dst) -- semua itu WAJIB Isoteri (\`.iso\`), dieksekusi lewat interpreter bytecode, BUKAN inline JS. Loader boilerplate (fetch bundle + \`vm.jalankan()\`) sudah disediakan Studio secara OTOMATIS -- AI tidak perlu (dan tidak boleh) menulis ulang loader itu.
2. JANGAN pakai \`onclick="..."\` inline di HTML -- itu HANYA jalan untuk JS, sama sekali tidak terhubung ke Isoteri. Pakai \`data-aksi="nama"\` dengan Component System (event delegation), atau \`dom_ketika()\` untuk skrip sederhana non-komponen.
3. JANGAN gunakan \`peta.field\` (titik) untuk baca Peta -- HARUS \`peta["field"]\`. Titik cuma untuk Bentuk.
4. JANGAN pakai \`gabung(daftar, [x])\` mengira itu concat -- itu menambah SATU Daftar sebagai elemen. \`gabung(daftar, x)\` langsung untuk tambah satu item.
5. JANGAN lupa \`ke_angka()\` saat mengambil angka dari \`dom_atribut()\`/\`dom_nilai()\`/\`e.nilai\` (semua itu SELALU Teks mentah, bukan Angka).
6. JANGAN tulis \`ingat x = ...\` dua kali untuk variabel yang sama -- assignment ulang TANPA \`ingat\`.
7. Kalau BENAR-BENAR tidak ada cara merepresentasikan sesuatu di Isoteri (API browser eksotik yang belum ada bridge-nya di daftar di atas) -- BOLEH pakai JavaScript murni sebagai jalan terakhir, TAPI WAJIB ditulis di \`<script>\` TERPISAH yang jelas, dengan komentar HTML \`<!-- JS: alasan kenapa Isoteri tidak cukup di sini -->\` tepat di atasnya. Ini pengecualian, bukan kebiasaan -- coba dulu semua opsi Isoteri di atas.`
},

];

if (typeof module !== "undefined" && module.exports) module.exports = { PENGETAHUAN_ISOTERI };
