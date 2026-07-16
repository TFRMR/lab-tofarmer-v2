// knowledge-dashboard.js
const DASHBOARD_RULES = {
    alur_pemandu: `
[PANDUAN UTAMA DASHBOARD TOFARMER]
1. Cek Vote: User diminta untuk selalu cek apakah ada ilmu yang butuh vote di tabel "Ilmu Pending/Butuh Approve". Kalau ada, silakan berikan vote terlebih dahulu demi konsensus kebun!
2. Bangun Ilmu Baru: Di dashboard ini, kita bisa membangun "Ilmu Baku" dari bawah. Mulai dengan klik tombol "Buat Ilmu". Panduan spesifik akan menuntun Anda di halaman berikutnya.
3. Lanjutkan Progres: Jika ada draf tulisan yang belum selesai, user bisa melanjutkan perjuangan mencatatnya melalui tombol "Lanjutkan".
4. Manfaatkan Ilmu Baku: Card "Ilmu Baku" adalah hasil riset yang sudah final dan lulus konsensus. Semua orang bebas menduplikasi, mempraktikkan, dan memanfaatkan isinya.
5. Uji & Validasi Ilmu Baku: Setelah ilmu berstatus Ilmu Baku, siapapun anggota komunitas bisa mencoba menduplikasi dan mempraktikkan ilmu tersebut di lapangan. Jika berhasil dengan hasil yang identik/serupa, mereka bisa submit bukti uji lapangan. Jika minimal 3 anggota berbeda berhasil membuktikan hasilnya, ilmu naik ke status "Ilmu Valid" dan pencipta ilmu mendapat Sertifikat NFT berbasis TOF Token sebagai penghargaan permanen dari komunitas.
    `.trim(),

    mekanisme_gate_pembuatan: `
[ALUR PENULISAN ILMU BAKU (GATE 1 SAMPAI GATE 3)]
- Gate 1 (Data Awal): Klik tombol "Buat Ilmu", user masuk ke Gate 1 untuk mengisi judul aksi dan data-data dasar awal.
- Gate 2 (Spesifikasi): Masuk ke halaman Gate 2 untuk mengisi detail proses yang lebih spesifik, lingkungan, dan catatan teknis.
- Gate 3 (AI Synthesis / Gate Terakhir): Semua data mentah dari Gate 1 & 2 akan otomatis dirangkai kata oleh AI menjadi draf "Ilmu Baku" yang rapi dan siap simpan.
- PERAN PENTING USER: Tugas mutlak user di Gate 3 adalah melakukan REVIEW dan EDIT. Ingat, AI bisa keliru atau berhalusinasi! Validasi manusia adalah kunci.
- Pasca Simpan: Setelah disimpan, ilmu otomatis masuk ke status "Pending / Butuh Approve" dan muncul di halaman dashboard agar bisa di-vote bersama anggota lain. Setelah vote terkumpul cukup (minimal 7 vote), ilmu otomatis lulus konsensus dan pindah ke kolom "Ilmu Baku" untuk digunakan semua orang.
    `.trim(),

    mekanisme_ilmu_valid: `
[FASE LANJUTAN: ILMU VALID & SERTIFIKASI NFT TOF]

Ilmu Baku yang sudah ada bisa naik kelas menjadi "Ilmu Valid" melalui uji duplikasi nyata di lapangan.

ALUR UJI DUPLIKASI:
- Step 1 (Praktik Lapangan): Anggota komunitas lain mencoba mempraktikkan Ilmu Baku secara mandiri mengikuti SOP yang tertulis.
- Step 2 (Submit Bukti): Jika berhasil dengan hasil identik atau sangat serupa, anggota tersebut submit bukti lapangan (foto, catatan hasil, lokasi, tanggal) melalui tombol "Saya Sudah Coba" di card Ilmu Baku.
- Step 3 (Akumulasi Bukti): Sistem mengumpulkan semua bukti uji dari berbagai anggota berbeda.
- Step 4 (Naik Status): Jika minimal 3 anggota BERBEDA berhasil membuktikan hasil yang identik/serupa, ilmu otomatis naik status dari "Ilmu Baku" menjadi "Ilmu Valid".

PENGHARGAAN SERTIFIKASI NFT TOF:
- Pencipta ilmu asli mendapat Sertifikat NFT berbasis TOF Token sebagai bukti permanen bahwa ilmunya telah teruji komunitas.
- NFT ini tercatat di blockchain dan tidak bisa dipalsukan — bukti nyata kontribusi petani ke ekosistem ToFarmer.
- Ilmu Valid tampil dengan badge khusus "✅ Tervalidasi Komunitas" di dashboard dan bisa dijadikan referensi utama oleh seluruh anggota.

PERBEDAAN STATUS ILMU:
- 📝 Ilmu Pending  : Draf baru, menunggu vote minimal 7 anggota.
- 📚 Ilmu Baku     : Sudah lulus vote, bebas dipraktikkan semua orang.
- 🏆 Ilmu Valid    : Sudah terbukti berhasil diduplikasi minimal 3 orang — level tertinggi kepercayaan komunitas.
    `.trim()
};

function cariKonteksDashboard(pertanyaan) {
    const kueri = pertanyaan.toLowerCase();
    let konteks = DASHBOARD_RULES.alur_pemandu + "\n\n";

    if (kueri.includes("buat") || kueri.includes("ilmu baru") || kueri.includes("gate") || kueri.includes("tahap") || kueri.includes("simpan") || kueri.includes("edit")) {
        konteks += DASHBOARD_RULES.mekanisme_gate_pembuatan;
    }

    if (
        kueri.includes("valid") || kueri.includes("nft") || kueri.includes("sertifikat") ||
        kueri.includes("tof") || kueri.includes("duplikasi") || kueri.includes("uji") ||
        kueri.includes("lapangan") || kueri.includes("bukti") || kueri.includes("terbukti") ||
        kueri.includes("ilmu valid")
    ) {
        konteks += "\n\n" + DASHBOARD_RULES.mekanisme_ilmu_valid;
    }

    return konteks;
}

// 🔴 TAMBAHKAN BARIS INI DI PALING BAWAH FILE AGAR BISA DIBACA DASHBOARD.JS
window.cariKonteksDashboard = cariKonteksDashboard;