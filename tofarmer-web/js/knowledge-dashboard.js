// knowledge-dashboard.js
const DASHBOARD_RULES = {
    alur_pemandu: `
[PANDUAN UTAMA DASHBOARD TOFARMER]
1. Cek Vote: User diminta untuk selalu cek apakah ada ilmu yang butuh vote di tabel "Ilmu Pending/Butuh Approve". Kalau ada, silakan berikan vote terlebih dahulu demi konsensus kebun!
2. Bangun Ilmu Baru: Di dashboard ini, kita bisa membangun "Ilmu Baku" dari bawah. Mulai dengan klik tombol "Buat Ilmu". Panduan spesifik akan menuntun Anda di halaman berikutnya.
3. Lanjutkan Progres: Jika ada draf tulisan yang belum selesai, user bisa melanjutkan perjuangan mencatatnya melalui tombol "Lanjutkan".
4. Manfaatkan Ilmu Baku: Card "Ilmu Baku" adalah hasil riset yang sudah final dan lulus konsensus. Semua orang bebas menduplikasi, mempraktikkan, dan memanfaatkan isinya.
    `.trim(),

    mekanisme_gate_pembuatan: `
[ALUR PENULISAN ILMU BAKU (GATE 1 SAMPAI GATE 3)]
- Gate 1 (Data Awal): Klik tombol "Buat Ilmu", user masuk ke Gate 1 untuk mengisi judul aksi dan data-data dasar awal.
- Gate 2 (Spesifikasi): Masuk ke halaman Gate 2 untuk mengisi detail proses yang lebih spesifik, lingkungan, dan catatan teknis.
- Gate 3 (AI Synthesis / Gate Terakhir): Semua data mentah dari Gate 1 & 2 akan otomatis dirangkai kata oleh AI menjadi draf "Ilmu Baku" yang rapi dan siap simpan.
- PERAN PENTING USER: Tugas mutlak user di Gate 3 adalah melakukan REVIEW dan EDIT. Ingat, AI bisa keliru atau berhalusinasi! Validasi manusia adalah kunci.
- Pasca Simpan: Setelah disimpan, ilmu otomatis masuk ke status "Pending / Butuh Approve" dan muncul di halaman dashboard agar bisa di-vote bersama anggota lain. Setelah vote terkumpul cukup (minimal 7 vote), ilmu otomatis lulus konsensus dan pindah ke kolom "Ilmu Baku" untuk digunakan semua orang.
    `.trim()
};

function cariKonteksDashboard(pertanyaan) {
    const kueri = pertanyaan.toLowerCase();
    let konteks = DASHBOARD_RULES.alur_pemandu + "\n\n";

    if (kueri.includes("buat") || kueri.includes("ilmu baru") || kueri.includes("gate") || kueri.includes("tahap") || kueri.includes("simpan") || kueri.includes("edit")) {
        konteks += DASHBOARD_RULES.mekanisme_gate_pembuatan;
    }
    return konteks;
}