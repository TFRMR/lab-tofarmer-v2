import { supabase } from './supabase-client.js'; // Kita ambil langsung dari client-nya

document.addEventListener('DOMContentLoaded', async () => {
    const outputArea = document.getElementById('ai-text-output');
    const btnSave = document.getElementById('btn-save-ilmu');

    const draft = JSON.parse(localStorage.getItem('tofarmer_draft') || '{"data":{}}');
    
    // Fungsi memanggil AI
    const rakitIlmu = async () => {
        outputArea.value = "🚀 Mentor sedang menyusun rekam jejak Anda menjadi SOP Ilmu Baku...";
        try {
            const response = await fetch('https://tofarmer-api.tofarmer-api.workers.dev/ai-saran', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: "Gate3-Compile", data: draft.data })
            });
            const result = await response.json();
            outputArea.value = result.ilmuBaku || "Gagal menyusun ilmu.";
        } catch (err) {
            outputArea.value = "Koneksi terputus.";
        }
    };

    // Fungsi Simpan Mandiri (Tanpa sentuh generator.js)
    btnSave.addEventListener('click', async () => {
        const userId = localStorage.getItem('tof_user_id');
        const ilmuFinal = outputArea.value;
        
        if (!ilmuFinal.trim()) return alert("Hasil ilmu kosong!");

        btnSave.innerText = "Menyimpan ke Database...";
        
        try {
            // Langsung insert ke tabel ilmu_pending
            const { error } = await supabase
                .from('ilmu_pending')
                .insert([{
                    user_id: userId,
                    judul_aksi: draft.data.judul_eksperimen || "Eksperimen Tanpa Judul",
                    deskripsi_proses: ilmuFinal,
                    pilar_aksi: parseInt(draft.data.pilar_bidang) || 0
                }]);

            if (error) throw error;

            alert("Selamat! Ilmu Anda telah resmi dipublikasikan ke konsensus bersama.");
            window.location.href = 'dashboard.html';
        } catch (err) {
            console.error("Gagal simpan:", err);
            alert("Gagal menyimpan ke database. Coba lagi nanti.");
            btnSave.innerText = "SIMPAN ILMU & PUBLIKASIKAN";
        }
    });

    rakitIlmu();
});