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
    } else {
        // --- MODE PENGUNJUNG (Tambahkan ini) ---
        authSection.style.display = 'block'; // Pastikan tombol login tampil
        userSection.style.display = 'none';   // Pastikan tombol buat ilmu sembunyi
        welcome.innerText = "Selamat Datang, Sahabat Tani!"; // Sapaan umum
        
        // Opsional: Tambahkan sedikit teks agar pengunjung tahu mereka sedang di mode baca
        const info = document.createElement('p');
        info.innerText = "Mari jelajahi ilmu mikro yang sudah baku.";
        info.style.color = "#94a3b8";
        document.querySelector('.container').appendChild(info);
    }
});

function lanjutkanDraft() {
    const draft = JSON.parse(localStorage.getItem('tofarmer_draft'));
    // Jika data gate 2 belum ada, kembali ke Gate 2. Jika sudah, ke Gate 3.
    if (draft && draft.data && !draft.data.gate_2_hipotesis) {
        window.location.href = 'gate-2.html';
    } else {
        window.location.href = 'gate-3.html';
    }
}