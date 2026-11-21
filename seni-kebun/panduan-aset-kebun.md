# Panduan Aset Kebun — menggantikan gambar sementara dengan karyamu

Game memakai **gambar sementara buatan kode** sampai ada karya seniman. Setiap gambar punya **nama**.
Taruh karyamu dengan nama yang sama, dan karyamu otomatis dipakai menggantikan yang sementara.
Boleh mengganti **sebagian saja**; sisanya tetap memakai gambar sementara. Jadi seni bisa ditambah bertahap sambil game dipakai.

## 1. Cara kerja singkat

1. Buka folder `kerangka/`. Isinya gambar sementara pada **ukuran kerja** (1 petak = 256 px lebar). Lukis di atasnya, atau pakai sebagai pedoman proporsi dan posisi.
2. Simpan sebagai **PNG transparan** dengan **nama berkas yang sama** (contoh `crop_ubijalar_3.png`).
3. Jalankan pengemas (butuh Python + Pillow, `pip install pillow`):
   ```
   python bangun_atlas.py folder_karyamu/ -o aset/kebun/
   ```
   Hasil: `aset/kebun/kebun-atlas.webp` + `aset/kebun/manifest.json`.
4. Taruh folder `aset/kebun/` **di samping** `desa-tof-isoteri.html` dan `kebun-scene.js`, lalu muat ulang.
5. Cek hasilnya tanpa login lewat `kebun-scene-demo.html` (ada penggeser jam, tombol siram/pupuk/tanam/panen). Di game, buka alamat dengan `?scene=normal&scenedebug` untuk melihat penghitung FPS dan jumlah "aset seniman" yang termuat.

Folder yang berisi PNG tidak perlu ikut diunggah ke situs; yang dipakai game hanya `manifest.json` dan `kebun-atlas.webp`.

## 2. Aturan gambar

- **Isometrik 2:1.** Ubin = belah ketupat lebar 256, tinggi 128. Cahaya dari **kiri atas**, konsisten di semua gambar.
- **Titik jangkar** (kolom "jangkar") adalah titik yang diletakkan tepat di posisi benda: pusat ubin untuk bedeng, dasar tengah untuk pohon/tanaman/rumah. Jangkar dinyatakan sebagai pecahan lebar,tinggi gambar (0.50 , 0.97 = tengah, hampir di dasar).
- **Lebar di layar** ditentukan oleh kolom "lebar (petak)", bukan oleh jumlah piksel. Kamu boleh membuat gambar lebih besar atau lebih kecil dari kerangka, asal **proporsi** dan **jangkarnya** mengikuti. Mesin menyesuaikan ukuran ke layar.
- **Resolusi kerja:** 256 px per petak setara kualitas layar retina. Untuk HP lemah, 192 atau 160 px per petak cukup dan membuat memori jauh lebih kecil.
- **Bayangan:** gambarlah bayangan lembut di bawah benda di dalam gambarnya sendiri (seperti di kerangka).
- **Palet terbatas** (sekitar 12–16 warna utama) membuat berkas WebP jauh lebih kecil dan tampilan lebih seragam.
- **Tepi ubin rumput** dibuat sedikit melebihi belah ketupat (1–2 px) agar tidak ada garis tipis di antara ubin.

## 3. Anggaran berat (supaya tetap ringan)

- Satu atlas maksimum 2048×2048 px; usahakan berkas `.webp` di bawah **500 KB** (set kerangka lengkap ± 110 KB).
- Memori terpakai di HP ≈ lebar×tinggi×4 byte. Atlas 1600×1700 ≈ 11 MB; turunkan resolusi kerja bila perlu.
- Setelah memperbarui atlas, beri nama baru (mis. `--nama kebun-atlas-v2.webp`) agar peramban tidak memakai gambar lama dari cache. `manifest.json` selalu dibaca ulang.

## 4. Daftar sprite

Ukuran = ukuran kerangka dalam piksel. Lebar dalam satuan petak.

| berkas | ukuran | lebar (petak) | jangkar | keterangan |
|---|---|---|---|---|
| `tile_grass_0.png` | 261×131 | 1.02 | 0.50 , 0.500 | Ubin rumput (belah ketupat 2:1). Dipakai berulang, buat tepi nyaris tak terlihat agar menyambung. |
| `tile_grass_1.png` | 261×131 | 1.02 | 0.50 , 0.500 | Variasi rumput (bunga kecil). |
| `bed_fertile.png` | 241×133 | 0.94 | 0.50 , 0.455 | Bedeng tanah subur: permukaan + dua sisi tebal. Titik jangkar = pusat permukaan atas. |
| `bed_barren.png` | 241×133 | 0.94 | 0.50 , 0.455 | Bedeng tandus (kering, retak). |
| `tree_kelapa.png` | 256×589 | 1 | 0.50 , 0.975 | Pohon kelapa. Goyang kecil dibuat oleh kode. |
| `bamboo.png` | 205×410 | 0.8 | 0.50 , 0.980 | Rumpun bambu. Goyang oleh kode. |
| `house_joglo.png` | 486×612 | 1.9 | 0.50 , 0.820 | Rumah joglo (dekorasi latar). |
| `tree_beringin_0.png` | 512×676 | 2 | 0.50 , 0.950 | Beringin LAYU (kesehatan < 30%). |
| `tree_beringin_1.png` | 512×676 | 2 | 0.50 , 0.950 | Beringin SEDANG (30-69%). |
| `tree_beringin_2.png` | 512×676 | 2 | 0.50 , 0.950 | Beringin SEHAT (>= 70%). Bisa diketuk di game (membuka menu Beringin). |
| `cloud_0.png` | 435×218 | 1.7 | 0.50 , 0.500 | Awan 0 (bergeser pelan). |
| `cloud_1.png` | 358×179 | 1.4 | 0.50 , 0.500 | Awan 1. |
| `cloud_2.png` | 512×256 | 2 | 0.50 , 0.500 | Awan 2. |
| `badge_ready.png` | 77×77 | 0.3 | 0.50 , 0.960 | Penanda siap panen (gelembung dengan ekor ke bawah). |
| `badge_care.png` | 77×77 | 0.3 | 0.50 , 0.960 | Penanda perlu dirawat. |
| `badge_nursery.png` | 77×77 | 0.3 | 0.50 , 0.960 | Penanda persemaian siap dicek. |
| `pot.png` | 51×51 | 0.2 | 0.50 , 0.950 | Pot bibit (persemaian), maksimal 3 per petak. |
| `coin.png` | 33×33 | 0.13 | 0.50 , 0.500 | Koin yang terbang ke bar XP. |
| `spark.png` | 31×31 | 0.12 | 0.50 , 0.500 | Kilau/bintang kecil. |
| `drop.png` | 15×15 | 0.06 | 0.50 , 0.500 | Tetes air. |
| `leaf.png` | 23×23 | 0.09 | 0.50 , 0.900 | Daun kecil (efek pupuk/tanam). |
| `glow.png` | 77×77 | 0.3 | 0.50 , 0.500 | Cahaya lembut putih (radial, transparan di tepi). |
| `glow_y.png` | 77×77 | 0.3 | 0.50 , 0.500 | Cahaya kuning kehijauan (kunang-kunang & kilau siap panen). |
| `crop_ubijalar_0.png` | 200×160 | 0.78 | 0.50 , 0.930 | Ubi jalar tahap 0: baru tanam (3 rumpun kecil). |
| `crop_ubijalar_1.png` | 200×160 | 0.78 | 0.50 , 0.930 | Tahap 1: tunas. |
| `crop_ubijalar_2.png` | 200×160 | 0.78 | 0.50 , 0.930 | Tahap 2: tumbuh. |
| `crop_ubijalar_3.png` | 200×160 | 0.78 | 0.50 , 0.930 | Tahap 3: lebat, berbunga. |
| `crop_ubijalar_4.png` | 200×160 | 0.78 | 0.50 , 0.930 | Tahap 4: SIAP PANEN (umbi mengintip dari tanah). |
| `chicken_0.png` | 67×67 | 0.26 | 0.50 , 0.920 | Ayam, hadap KANAN, bingkai jalan 0 (dibalik otomatis untuk hadap kiri). |
| `chicken_1.png` | 67×67 | 0.26 | 0.50 , 0.920 | Bingkai jalan 1. |
| `chicken_2.png` | 67×67 | 0.26 | 0.50 , 0.920 | Bingkai jalan 2. |
| `chicken_3.png` | 67×67 | 0.26 | 0.50 , 0.920 | Bingkai jalan 3. |

## 5. Menambah tanaman lain

Saat ini mesin memakai `crop_ubijalar_0..4` untuk semua tanaman, karena game baru memiliki satu jenis tanaman. Bila kamu mulai menggambar tanaman lain (padi, jagung, dan seterusnya), gunakan pola nama `crop_<idtanaman>_<tahap>.png` dengan tahap 0–4 dan kabari saya, supaya kodenya disambungkan ke nama itu.

## 6. Mengganti tanpa atlas (cara paling sederhana untuk mencoba satu gambar)

Tanpa pengemas, tulis `aset/kebun/manifest.json` seperti ini dan taruh PNG-nya di folder yang sama:

```json
{
  "version": 1,
  "sprites": {
    "tree_kelapa": { "file": "tree_kelapa.png", "wTiles": 1.0, "ax": 0.5, "ay": 0.975 },
    "bamboo": "bamboo.png"
  }
}
```
Bila `wTiles`, `ax`, `ay` dihilangkan, nilai bawaan dari tabel di atas dipakai.
