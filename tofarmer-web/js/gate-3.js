import { supabase } from './supabase-client.js';

document.addEventListener('DOMContentLoaded', async () => {
    const outputArea = document.getElementById('ai-text-output');
    const btnSave = document.getElementById('btn-save-ilmu');
    const userId = localStorage.getItem('tof_user_id');

    // 1. Validasi Keamanan
    if (!userId) {
        alert("Sesi tidak ditemukan. Silakan login kembali.");
        window.location.href = '../html/login.html';
        return;
    }

    // 2. Fungsi Ambil Data Langsung dari Supabase
    // Ini adalah kunci agar Gate 3 tidak "kosong"
    const ambilDataDariSupabase = async () => {
        outputArea.value = "🔍 Sedang mengambil rekam jejak Anda dari server...";
        
        try {
            const { data, error } = await supabase
                .from('drafts')
                .select('progres_data')
                .eq('user_id', userId)
                .single();

            if (error || !data) {
                console.error("Error/Data kosong:", error);
                outputArea.value = "Data tidak ditemukan. Pastikan Anda sudah menyelesaikan Gate 2.";
                return null;
            }

            console.log("Data Gate 1 & 2 ditemukan:", data.progres_data);
            return data.progres_data; // Objek utuh dari gate 1 & 2
        } catch (err) {
            outputArea.value = "Gagal terhubung ke database.";
            return null;
        }
    };

    // 3. Fungsi Rakit Ilmu (AI)
   const rakitIlmu = async () => {
    const dataEksperimen = await ambilDataDariSupabase();
    if (!dataEksperimen) return;

    // Mapping: Asumsi di gate-2.js Anda menyimpan data dalam struktur ini
    // Kita harus fleksibel dengan key yang ada
    const payload = {
        judul_eksperimen: dataEksperimen.judul_eksperimen || dataEksperimen.judul || "Tanpa Judul",
        pilar_bidang: dataEksperimen.pilar_bidang || "Umum",
        micro_inputs: dataEksperimen.micro_inputs || {},
        karakteristik_jalur: dataEksperimen.karakteristik_jalur || ""
    };

    try {
        const response = await fetch('https://tofarmer-api.tofarmer-api.workers.dev/ai-saran', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                mode: "Gate3-Compile", 
                data: payload // Gunakan payload yang sudah rapi
            })
        });
            const result = await response.json();
            outputArea.value = result.ilmuBaku || "Gagal menyusun ilmu.";
        } catch (err) {
            outputArea.value = "Koneksi ke Mentor terputus.";
        }
    };

    // 4. Tombol Simpan Final
    btnSave.addEventListener('click', async () => {
        const ilmuFinal = outputArea.value;
        if (!ilmuFinal.trim()) return alert("Hasil ilmu kosong!");

        btnSave.innerText = "Menyimpan ke Database...";
        
        const dataTerakhir = await ambilDataDariSupabase();
        
        try {
            // Masukkan ke tabel ilmu_pending sesuai struktur Anda
            const { error } = await supabase
                .from('ilmu_pending')
                .insert([{
                    user_id: userId,
                    judul_aksi: dataTerakhir.judul_eksperimen || "Eksperimen Tanpa Judul",
                    deskripsi_proses: ilmuFinal,
                    pilar_aksi: parseInt(dataTerakhir.pilar_bidang) || 0
                }]);

            if (error) throw error;

            // Hapus draft agar tidak membebani database
            await supabase.from('drafts').delete().eq('user_id', userId);

            alert("Selamat! Ilmu Anda telah resmi dipublikasikan.");
            window.location.href = 'dashboard.html';
        } catch (err) {
            console.error(err);
            alert("Gagal simpan ke database.");
            btnSave.innerText = "SIMPAN ILMU & PUBLIKASIKAN";
        }
    });

    rakitIlmu();
});