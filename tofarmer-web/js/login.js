// Karena login.js dan supabase-client.js ada di folder yang sama (js/), gunakan ./
import { supabase } from './supabase-client.js';

document.getElementById('login-btn').addEventListener('click', async () => {
    // 1. Ambil elemen tombol
    const btn = document.getElementById('login-btn');
    
    // 2. Ambil nilai input
    const usernameInput = document.getElementById('input-username').value.trim();
    const walletInput = document.getElementById('input-wallet').value.trim();

    if (!usernameInput || !walletInput) {
        alert("Harap isi Username dan Alamat Wallet Anda!");
        return;
    }

    // 3. Kunci tombol agar tidak bisa diklik dua kali
    btn.disabled = true;
    btn.innerText = "Memeriksa...";

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('username', usernameInput)
            .eq('id', walletInput)
            .single();

        if (error || !data) {
            alert("Akses ditolak! Username atau Wallet tidak ditemukan.");
            // Buka kembali tombol jika gagal
            btn.disabled = false;
            btn.innerText = "Masuk Ladang";
            return;
        }

        localStorage.setItem('tof_wallet', data.id);
        localStorage.setItem('tof_username', data.username);
        localStorage.setItem('tof_level', data.level);
        localStorage.setItem('tof_rank', data.rank);
        localStorage.setItem('tof_xp', data.xp);

        alert(`Selamat datang kembali, ${data.username}!`);
        
        // --- PENYESUAIAN FINAL PINTU PINTAR ---
        const redirectTo = localStorage.getItem('redirect_to');
        
        if (redirectTo) {
            // Jika ada tujuan asal (seperti dashboard.html), kembali ke sana
            localStorage.removeItem('redirect_to');
            window.location.href = redirectTo;
        } else {
            // Jika tidak ada asal, baru arahkan ke Dashboard (bukan lagi ke Generator)
            window.location.href = 'dashboard.html';
        }

    } catch (err) {
        console.error("Kesalahan sistem login:", err.message);
        alert("Terjadi kesalahan saat masuk. Coba lagi nanti.");
        
        // 4. Buka kembali tombol jika terjadi error sistem
        btn.disabled = false;
        btn.innerText = "Masuk Ladang";
    }
});