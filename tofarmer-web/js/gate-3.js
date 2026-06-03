import { supabase } from './supabase-client.js';

document.addEventListener('DOMContentLoaded', async () => {
    const outputArea = document.getElementById('ai-text-output');
    const btnSave = document.getElementById('btn-save-ilmu');
    const userId = localStorage.getItem('tof_user_id');

    if (!userId) {
        alert("Sesi tidak ditemukan.");
        window.location.href = '../html/login.html';
        return;
    }

    const ambilDataDariSupabase = async () => {
        try {
            const { data, error } = await supabase
                .from('drafts')
                .select('progres_data')
                .eq('user_id', userId)
                .single();

            if (error || !data) return null;
            return data.progres_data;
        } catch (err) { return null; }
    };

    const rakitIlmu = async () => {
        const d = await ambilDataDariSupabase();
        if (!d) {
            outputArea.value = "Data tidak ditemukan.";
            return;
        }

        // PENGAMBILAN DATA SESUAI STRUKTUR ANDA
        const payload = {
            judul_eksperimen: d.judul_eksperimen || d.judul,
            pilar_bidang: d.pilar_bidang,
            micro_inputs: d.micro_inputs,
            karakteristik_jalur: d.karakteristik_jalur,
            hipotesis: d.gate_2_hipotesis // Menambahkan data hipotesis gate 2
        };

        outputArea.value = "🚀 Mentor sedang menyusun SOP Ilmu Baku...";
        
        try {
            const response = await fetch('https://tofarmer-api.tofarmer-api.workers.dev/ai-saran', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    mode: "Gate3-Compile", 
                    data: payload 
                })
            });
            
            const result = await response.json();
            outputArea.value = result.ilmuBaku || result.saran || "Gagal menyusun ilmu.";
        } catch (err) {
            outputArea.value = "Koneksi ke Mentor terputus.";
        }
    };

    btnSave.addEventListener('click', async () => {
        const ilmuFinal = outputArea.value;
        if (!ilmuFinal.trim()) return alert("Hasil ilmu kosong!");

        const d = await ambilDataDariSupabase();
        
        try {
            const { error } = await supabase
                .from('ilmu_pending')
                .insert([{
                    user_id: userId,
                    judul_aksi: d.judul_eksperimen || d.judul,
                    deskripsi_proses: ilmuFinal,
                    pilar_aksi: d.pilar_bidang === "ladang" ? 1 : 0 // Sesuaikan mapping pilar Anda
                }]);

            if (error) throw error;
            await supabase.from('drafts').delete().eq('user_id', userId);
            alert("Selamat! Ilmu Anda telah resmi dipublikasikan.");
            window.location.href = 'dashboard.html';
        } catch (err) {
            alert("Gagal simpan ke database.");
        }
    });

    rakitIlmu();
});