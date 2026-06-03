import { supabase } from './supabase-client.js';

document.addEventListener('DOMContentLoaded', async () => {
    const outputArea = document.getElementById('ai-text-output');
    const btnSave = document.getElementById('btn-save-ilmu');
    const userId = localStorage.getItem('tof_user_id');

    if (!userId) {
        alert("Sesi tidak ditemukan. Silakan login kembali.");
        window.location.href = '../html/login.html';
        return;
    }

    // 1. Ambil data terbaru langsung dari Supabase
    const fetchDraftFromSupabase = async () => {
        outputArea.value = "🔍 Mengambil data eksperimen dari server...";
        
        const { data, error } = await supabase
            .from('drafts')
            .select('progres_data')
            .eq('user_id', userId)
            .single();

        if (error || !data) {
            outputArea.value = "Gagal memuat data dari server. Pastikan Anda sudah menyelesaikan Gate 2.";
            return null;
        }
        return data.progres_data;
    };

    // 2. Fungsi memanggil AI dengan data valid dari Supabase
    const rakitIlmu = async () => {
        const draftData = await fetchDraftFromSupabase();
        if (!draftData) return;

        outputArea.value = "🚀 Mentor sedang menyusun rekam jejak Anda menjadi SOP Ilmu Baku...";
        
        try {
            const response = await fetch('https://tofarmer-api.tofarmer-api.workers.dev/ai-saran', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    mode: "Gate3-Compile", 
                    data: draftData 
                })
            });
            
            const result = await response.json();
            outputArea.value = result.ilmuBaku || "Gagal menyusun ilmu.";
        } catch (err) {
            outputArea.value = "Koneksi ke Mentor terputus.";
        }
    };

    // 3. Simpan Final
    btnSave.addEventListener('click', async () => {
        const ilmuFinal = outputArea.value;
        if (!ilmuFinal.trim()) return alert("Hasil ilmu kosong!");

        btnSave.innerText = "Menyimpan ke Database...";
        
        // Ambil lagi data mentah untuk referensi pilar_bidang & judul
        const draftData = await fetchDraftFromSupabase();
        
        try {
            const { error } = await supabase
                .from('ilmu_pending')
                .insert([{
                    user_id: userId,
                    judul_aksi: draftData.judul_eksperimen || "Eksperimen Tanpa Judul",
                    deskripsi_proses: ilmuFinal,
                    pilar_aksi: parseInt(draftData.pilar_bidang) || 0
                }]);

            if (error) throw error;

            // Bersihkan draft di Supabase setelah dipublikasi
            await supabase.from('drafts').delete().eq('user_id', userId);

            alert("Selamat! Ilmu Anda telah resmi dipublikasikan.");
            window.location.href = 'dashboard.html';
        } catch (err) {
            console.error(err);
            alert("Gagal menyimpan ke database.");
            btnSave.innerText = "SIMPAN ILMU & PUBLIKASIKAN";
        }
    });

    rakitIlmu();
});