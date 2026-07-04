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

        // simpan session user
        localStorage.setItem('tof_wallet', data.id);
        localStorage.setItem('tof_username', data.username);
        localStorage.setItem('tof_level', data.level);
        localStorage.setItem('tof_rank', data.rank);
        localStorage.setItem('tof_xp', data.xp);

        alert(`Selamat datang kembali, ${data.username}!`);

        // =========================
        // REDIRECT LOGIC (FIXED)
        // =========================
        const redirectTo = localStorage.getItem('redirect_to');

        if (redirectTo) {
            localStorage.removeItem('redirect_to');
            window.location.href = redirectTo;
        } else {
            // ❗ tidak paksa ke dashboard lagi
            // tetap di halaman sekarang
            btn.disabled = false;
            btn.innerText = "Masuk Ladang";

            alert("Login berhasil!");
        }

    } catch (err) {
        console.error("Kesalahan sistem login:", err.message);
        alert("Terjadi kesalahan saat masuk. Coba lagi nanti.");

        btn.disabled = false;
        btn.innerText = "Masuk Ladang";
    }
});