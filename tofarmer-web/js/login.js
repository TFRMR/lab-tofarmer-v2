// Karena login.js dan supabase-client.js ada di folder yang sama (js/), gunakan ./
import { supabase } from './supabase-client.js';

document.getElementById('login-btn').addEventListener('click', async () => {
    const btn = document.getElementById('login-btn');

    const usernameInput = document.getElementById('input-username').value.trim();
    const walletInput = document.getElementById('input-wallet').value.trim();

    if (!usernameInput || !walletInput) {
        alert("Harap isi Username dan Alamat Wallet Anda!");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Memeriksa...";

    try {
        // Query ke database Supabase pada tabel 'profiles'
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('username', usernameInput)
            .eq('id', walletInput)
            .single();

        if (error || !data) {
            alert("Akses ditolak! Username atau Wallet tidak ditemukan.");
            btn.disabled = false;
            btn.innerText = "Masuk Ladang";
            return;
        }

        // Amankan sesi warga ke dalam LocalStorage browser
        localStorage.setItem('tof_wallet', data.id);
        localStorage.setItem('tof_username', data.username);
        localStorage.setItem('tof_level', data.level || 1);
        localStorage.setItem('tof_rank', data.rank || 'Warga Mandiri');
        localStorage.setItem('tof_xp', data.xp || 0);

        alert(`Selamat datang kembali, @${data.username}!`);

        // ========================================
        // ENGINE DETEKSI REDIRECT DINAMIS (FIXED)
        // ========================================
        const redirectTo = localStorage.getItem('redirect_to');

        if (redirectTo) {
            // Hapus temporary penanda agar tidak terjadi perulangan sirkular
            localStorage.removeItem('redirect_to');
            
            // Melempar user ke halaman asal (bisa ../desa-tof.html atau ../index.html)
            window.location.href = redirectTo;
        } else {
            // Antisipasi darurat jika user mengetik langsung url html/login.html tanpa melompati halaman depan
            window.location.href = '../index.html'; 
        }

    } catch (err) {
        console.error("Kesalahan fatal pada sistem login:", err.message);
        alert("Terjadi kesalahan teknis saat masuk ladang. Coba lagi nanti.");

        btn.disabled = false;
        btn.innerText = "Masuk Ladang";
    }
});