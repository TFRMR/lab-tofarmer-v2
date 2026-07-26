// ========================================
// ToFarmer Login v2 - With PIN 2FA
// ========================================
// Features:
// 1. Username + Wallet ID (existing)
// 2. PIN 6 digit (new) - hashed SHA256
// 3. Auto-generate PIN untuk user lama
// ========================================

import { supabase } from './supabase-client.js';

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
    const walletInput = document.getElementById('input-wallet').value.trim();
    const pinInput = document.getElementById('input-pin').value.trim();
    const errorMessage = document.getElementById('error-message');

    // Validasi input
    if (!usernameInput || !walletInput || !pinInput) {
        showError('Harap isi Username, Wallet, dan PIN!');
        return;
    }

    if (pinInput.length !== 6 || isNaN(pinInput)) {
        showError('PIN harus 6 digit angka!');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="loading">⏳</span> Memeriksa...';

    try {
        // 1. Query profiles table
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('username', usernameInput)
            .eq('id', walletInput)
            .single();

        if (error || !data) {
            showError('Username atau Wallet tidak ditemukan.');
            btn.disabled = false;
            btn.innerHTML = 'Masuk Ladang';
            return;
        }

        // 2. Check jika user belum punya PIN (user lama)
        if (!data.pin_hash || data.pin_hash === null || data.pin_hash === '') {
            // Auto-generate PIN baru
            const newPIN = generateRandomPIN();
            const pinHash = await hashPIN(newPIN);

            // 2A. Update pin_hash di database
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ pin_hash: pinHash })
                .eq('id', walletInput);

            if (updateError) {
                showError('Gagal membuat PIN: ' + updateError.message);
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

        // 3. Verify PIN jika user sudah punya
        const pinHash = await hashPIN(pinInput);

        if (pinHash !== data.pin_hash) {
            showError('PIN salah!');
            btn.disabled = false;
            btn.innerHTML = 'Masuk Ladang';
            return;
        }

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

        // Redirect
        setTimeout(() => {
            window.location.href = './index.html';
        }, 500);

    } catch (err) {
        console.error('Login error:', err);
        showError('Kesalahan teknis: ' + err.message);
        btn.disabled = false;
        btn.innerHTML = 'Masuk Ladang';
    }
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

console.log('✓ ToFarmer Login v2 loaded (with PIN 2FA)');