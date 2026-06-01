import { supabase } from './supabase-client.js'; // Cukup satu baris ini

document.addEventListener('DOMContentLoaded', async () => {
    const wallet = localStorage.getItem('tof_wallet');
    const authSection = document.getElementById('auth-section');
    const userSection = document.getElementById('user-section');
    const welcome = document.getElementById('welcome-text');

    if (wallet) {
        authSection.style.display = 'none';
        userSection.style.display = 'block';

        // 1. Coba ambil dari localStorage dulu biar cepat
        let username = localStorage.getItem('tof_username');
        
        // 2. Jika tidak ada di lokal, ambil dari Supabase
        if (!username) {
            welcome.innerText = "Memuat data, Kang...";
            try {
                // Asumsi tabel Anda bernama 'profiles'
                const { data, error } = await supabase
                    .from('profiles')
                    .select('username_text')
                    .eq('wallet_address', wallet) // Sesuaikan dengan kolom wallet di tabel Anda
                    .single();
                
                if (data) {
                    username = data.username_text;
                    localStorage.setItem('tof_username', username); // Simpan ke lokal agar tidak perlu fetch terus
                }
            } catch (err) {
                username = "Petani";
            }
        }
        
        welcome.innerText = `Halo, Kang ${username}!`;

        // 3. Cek Draft
        const draft = JSON.parse(localStorage.getItem('tofarmer_draft'));
        if (draft && draft.data) {
            document.getElementById('card-draft').style.display = 'block';
            document.getElementById('draft-title').innerText = `Misi Berjalan: ${draft.data.gate_1_judul || "Ilmu Mikro"}`;
        }
    }
});
function lanjutkanDraft() {
    const draft = JSON.parse(localStorage.getItem('tofarmer_draft'));
    // Jika data gate 2 belum ada, kembali ke Gate 2. Jika sudah, ke Gate 3.
    if (!draft.data.gate_2_hipotesis) {
        window.location.href = 'gate-2.html';
    } else {
        window.location.href = 'gate-3.html';
    }
}