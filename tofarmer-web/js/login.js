// ========================================
// ToFarmer Login v2 - With PIN 2FA
// ========================================
// Features:
// 1. Username + PIN (username tidak peka huruf besar/kecil). Kolom Wallet ID
// tersembunyi dan baru muncul saat akun lama perlu membuat PIN (existing)
// 2. PIN 6 digit (new) - hashed SHA256
// 3. Auto-generate PIN untuk user lama
// ========================================

import { supabase } from './supabase-client.js';

// Verifikasi dilakukan di SERVER (Supabase Edge Function "tof-vault"):
// PIN tidak lagi dicocokkan di browser dan percobaan salah PIN dibatasi.
async function callTofVault(action, body = {}) {
    try {
        const { data, error } = await supabase.functions.invoke('tof-vault', {
            body: { action, ...body }
        });
        if (error) {
            console.error(error);
            return { ok: false, error: 'network' };
        }
        return data || { ok: false, error: 'empty' };
    } catch (e) {
        console.error(e);
        return { ok: false, error: 'network' };
    }
}

function pesanTofVault(res) {
    switch (res.error) {
        case 'not_found': return 'Username tidak ditemukan. Belum punya akun? Daftar dulu dari halaman utama.';
        case 'bad_pin': return 'PIN salah! (sisa percobaan: ' + (res.left ?? '?') + ')';
        case 'bad_pin_format': return 'PIN harus 6 digit angka!';
        case 'locked': return 'Terlalu banyak salah PIN. Coba lagi ' + (res.retry_min || 15) + ' menit lagi.';
        case 'ambiguous': return 'Username ambigu, tulis persis sama dengan saat daftar.';
        case 'wallet_mismatch': return 'Wallet tidak cocok dengan akun ini.';
        case 'reset_required': return 'Akun ini punya brankas frasa. PIN-nya harus direset admin dulu.';
        case 'network': return 'Koneksi bermasalah, coba lagi.';
        default: return 'Gagal: ' + (res.error || 'tidak diketahui');
    }
}

// SHA256 hashing (gunakan TweetNaCl atau crypto API)
async function hashPIN(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Generate random PIN 6 digit
function generateRandomPIN() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Handle login form submission
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleLogin(e);
});

async function handleLogin(event) {
    if (event) event.preventDefault();
    
    const btn = document.getElementById('login-btn');
    const usernameInput = document.getElementById('input-username').value.trim();
    const walletInput = document.getElementById('input-wallet')?.value.trim() || ''; // wallet opsional
    const pinInput = document.getElementById('input-pin').value.trim();
    const errorMessage = document.getElementById('error-message');

    // Validasi input
    if (!usernameInput || !pinInput) {
        showError('Harap isi Username dan PIN!');
        return;
    }

    if (pinInput.length !== 6 || isNaN(pinInput)) {
        showError('PIN harus 6 digit angka!');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="loading">⏳</span> Memeriksa...';

    try {
        // 1-3. Verifikasi di SERVER (username tidak peka huruf besar/kecil, PIN dicek di server)
        const res = await callTofVault('login', { username: usernameInput, pin: pinInput });

        // 2. Check jika user belum punya PIN (user lama)
        if (!res.ok && res.error === 'no_pin') {
            // Wallet baru diminta di sini (saat buat PIN) dan harus cocok dengan akun
            if (!walletInput) {
                revealWalletField();
                showError('Akun ini belum punya PIN. Isi Wallet untuk membuat PIN pertama.');
                btn.disabled = false;
                btn.innerHTML = 'Masuk Ladang';
                return;
            }

            // Auto-generate PIN baru
            const newPIN = generateRandomPIN();

            // 2A. Simpan PIN di server
            const setRes = await callTofVault('set_pin', {
                username: usernameInput,
                wallet: walletInput,
                pin: newPIN
            });

            if (!setRes.ok) {
                showError('Gagal membuat PIN: ' + pesanTofVault(setRes));
                btn.disabled = false;
                btn.innerHTML = 'Masuk Ladang';
                return;
            }

            // 2B. Show modal dengan PIN baru
            showNewPINModal(newPIN);
            btn.disabled = false;
            btn.innerHTML = 'Masuk Ladang';
            return;
        }

        if (!res.ok) {
            showError(pesanTofVault(res));
            btn.disabled = false;
            btn.innerHTML = 'Masuk Ladang';
            return;
        }

        const data = res.profile;

        // 4. Login berhasil! Set localStorage (sesuai struktur app.js)
        localStorage.setItem('tof_wallet', data.id);
        localStorage.setItem('tof_login_username', data.username); // ← FIX: Use tof_login_username (sesuai app.js)
        
        // Level calculation (from index.html)
        const effectiveXp = (data.xp || 0) + (data.saldo_tof || 0) * 1000;
        const computedLevel = Math.floor(Math.sqrt(effectiveXp / 100)) + 1;
        localStorage.setItem('tof_level', computedLevel);
        localStorage.setItem('tof_rank', data.rank || 'Warga Mandiri');
        localStorage.setItem('tof_xp', data.xp || 0);

        showError(''); // Clear error
        btn.innerHTML = '✓ Login Sukses! Mengarahkan...';

        // FIX: Kalau tadinya dilempar ke sini dari halaman lain (misal desa-tof.html
        // nyimpen 'redirect_to' sebelum ngirim ke login), balikin ke halaman asal itu.
        // Kalau gak ada, baru default ke index.html.
        const redirectTo = localStorage.getItem('redirect_to');
        localStorage.removeItem('redirect_to');

        // Redirect
        setTimeout(() => {
            window.location.href = redirectTo || '/';
        }, 500);

    } catch (err) {
        console.error('Login error:', err);
        showError('Kesalahan teknis: ' + err.message);
        btn.disabled = false;
        btn.innerHTML = 'Masuk Ladang';
    }
}

// Kolom wallet (beserta labelnya) disembunyikan secara default
function getWalletGroup() {
    const el = document.getElementById('input-wallet');
    if (!el) return null;
    return document.getElementById('wallet-group') || el.closest('.form-group, .input-group, .field') || el;
}

function hideWalletField() {
    const group = getWalletGroup();
    if (group) group.style.display = 'none';
    // Kolom tersembunyi yang masih "required" membuat browser menolak submit form
    const walletEl = document.getElementById('input-wallet');
    if (walletEl) walletEl.required = false;
}

// Munculkan kolom wallet hanya untuk akun lama yang belum punya PIN
function revealWalletField() {
    const group = getWalletGroup();
    if (!group) return;
    group.style.display = '';
    document.getElementById('input-wallet').focus();
}

function showError(message) {
    const errorEl = document.getElementById('error-message');
    if (message) {
        errorEl.textContent = message;
        errorEl.classList.add('show');
    } else {
        errorEl.textContent = '';
        errorEl.classList.remove('show');
    }
}

function showNewPINModal(newPIN) {
    const modal = document.getElementById('pin-modal');
    const display = document.getElementById('new-pin-display');
    const copyBtn = document.getElementById('copy-pin-btn');
    const confirmBtn = document.getElementById('confirm-pin-btn');

    display.textContent = newPIN;

    copyBtn.onclick = () => {
        navigator.clipboard.writeText(newPIN).then(() => {
            copyBtn.textContent = '✓ PIN Disalin!';
            setTimeout(() => {
                copyBtn.textContent = '📋 Salin PIN ke Clipboard';
            }, 2000);
        }).catch(err => {
            alert('Gagal salin: ' + err);
        });
    };

    confirmBtn.onclick = () => {
        modal.classList.remove('show');
        showError('PIN berhasil dibuat! Silakan login dengan PIN baru Anda.');
        
        // Clear form
        document.getElementById('input-pin').value = '';
        document.getElementById('input-pin').focus();
    };

    modal.classList.add('show');
}

// Auto-focus PIN ke numeric input saja
document.getElementById('input-pin').addEventListener('keypress', (e) => {
    if (!/[0-9]/.test(e.key)) {
        e.preventDefault();
    }
});

// Auto-submit jika PIN sudah 6 digit
document.getElementById('input-pin').addEventListener('input', (e) => {
    if (e.target.value.length === 6) {
        // Bisa auto-submit atau hanya hint
        // Sekarang: just visual feedback
        e.target.style.borderColor = '#22c55e';
    } else {
        e.target.style.borderColor = '';
    }
});

// Login normal cukup Username + PIN: sembunyikan kolom wallet saat halaman dibuka
hideWalletField();

console.log('✓ ToFarmer Login v2 loaded (with PIN 2FA)');