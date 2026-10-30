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
        case 'kode_tidak_valid': return 'Kode salah atau sudah tidak berlaku.' + (res.left !== undefined ? ' (sisa percobaan: ' + res.left + ')' : '') + ' Kalau sudah 5x salah atau lewat 1 jam, minta kode baru ke admin.';
        case 'pin_baru_sama_publik': return 'PIN baru ini tidak bisa dipakai, coba PIN 6 digit yang lain.';
        case 'network': return 'Koneksi bermasalah, coba lagi.';
        default: return 'Gagal: ' + (res.error || 'tidak diketahui');
    }
}

// ========================================
// KEMBALI KE HALAMAN TUJUAN SETELAH LOGIN
// Semua halaman memakai login yang sama, jadi setelah berhasil login pengunjung dibawa
// kembali ke halaman yang tadi ingin dibuka (bukan selalu ke beranda).
// Urutan sumber tujuan:
//   1. ?next=/html/dompet.html  (dikirim halaman yang mengarahkan ke login)
//   2. localStorage 'redirect_to' (cara lama, mis. desa-tof.html)
//   3. sessionStorage (supaya tujuan tidak hilang kalau halaman login dimuat ulang)
//   4. halaman sebelumnya (document.referrer) jika masih satu situs
// Hanya alamat satu situs yang diterima (mencegah dialihkan ke situs lain).
// ========================================
function amankanTujuan(raw) {
    if (!raw) return null;
    try {
        const u = new URL(raw, window.location.origin);
        if (u.origin !== window.location.origin) return null;
        if (/login\.html$/i.test(u.pathname)) return null; // jangan balik ke halaman login
        return u.pathname + u.search + u.hash;
    } catch (e) {
        return null;
    }
}

function tentukanTujuan() {
    const dariUrl = amankanTujuan(new URLSearchParams(window.location.search).get('next'));
    if (dariUrl) return dariUrl;

    let dariStorage = null, dariSesi = null;
    try { dariStorage = amankanTujuan(localStorage.getItem('redirect_to')); } catch (e) {}
    if (dariStorage) return dariStorage;
    try { dariSesi = amankanTujuan(sessionStorage.getItem('tof_login_next')); } catch (e) {}
    if (dariSesi) return dariSesi;

    return amankanTujuan(document.referrer);
}

// Dihitung sekali saat halaman login dibuka (sebelum apa pun berubah)
const tujuanSetelahLogin = tentukanTujuan();
try {
    if (tujuanSetelahLogin) sessionStorage.setItem('tof_login_next', tujuanSetelahLogin);
} catch (e) {}

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
        // [LOGIN SERAGAM] token sesi bertanda tangan dari server: dipakai Scan, Jurnal, Tracker, dll. tanpa minta PIN lagi
        if (res.session && res.session.token) {
            localStorage.setItem('tof_session', JSON.stringify({ id: data.id, token: res.session.token, exp: res.session.exp }));
        } else {
            localStorage.removeItem('tof_session');
        }
        
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

        // Redirect: ke halaman yang tadi ingin dibuka; kalau tidak ada baru ke beranda
        const tujuan = tujuanSetelahLogin || amankanTujuan(redirectTo) || '/';
        try { sessionStorage.removeItem('tof_login_next'); } catch (e) {}

        setTimeout(() => {
            window.location.href = tujuan;
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

// ========================================
// LUPA PIN (otomatis dengan kode dari admin)
// Admin membuat kode 8 digit sekali pakai di halaman Pengurus (tab "Reset PIN").
// Alur: username + kode → cek kode → buat PIN baru → langsung masuk lewat handleLogin().
// Berlaku untuk semua halaman karena login ini dipakai bersama.
// ========================================
function pasangLupaPin() {
    const btn = document.getElementById('login-btn');
    if (!btn || document.getElementById('lupa-pin-link')) return;
    const link = document.createElement('a');
    link.id = 'lupa-pin-link';
    link.href = '#';
    link.textContent = 'Lupa PIN?';
    link.style.cssText = 'display:block;text-align:center;margin-top:12px;font-size:13px;color:#2f6f4e;font-weight:600;text-decoration:none;';
    link.addEventListener('click', (e) => { e.preventDefault(); bukaModalLupaPin(); });
    btn.insertAdjacentElement('afterend', link);
}

function bukaModalLupaPin() {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(16,25,20,.65);backdrop-filter:blur(8px);display:flex;justify-content:center;align-items:center;z-index:99999;padding:20px;';
    modal.innerHTML = `
      <div style="width:100%;max-width:380px;max-height:90vh;overflow-y:auto;background:#fff;border-radius:24px;padding:24px;box-sizing:border-box;font-family:inherit;">
        <div style="text-align:center;">
          <div style="font-size:44px;">🔑</div>
          <h2 id="lp-judul" style="color:#2f6f4e;margin:6px 0 4px;">Lupa PIN?</h2>
          <p id="lp-info" style="font-size:12px;color:#666;margin:0 0 6px;line-height:1.5;">
            Minta <b>kode reset</b> ke admin lewat WhatsApp (sebutkan username kamu). Kode 8 digit berlaku 1 jam.
          </p>
        </div>

        <div id="lp-langkah1">
          <label style="display:block;font-size:12px;font-weight:600;color:#2f6f4e;margin:12px 0 4px;">Username</label>
          <input id="lp-username" autocomplete="off" spellcheck="false" style="width:100%;padding:12px;border:2px solid #cfe8da;border-radius:12px;font-size:14px;box-sizing:border-box;" />
          <label style="display:block;font-size:12px;font-weight:600;color:#2f6f4e;margin:12px 0 4px;">Kode dari admin</label>
          <input id="lp-kode" inputmode="numeric" maxlength="9" autocomplete="off" placeholder="1234 5678" style="width:100%;padding:12px;border:2px solid #cfe8da;border-radius:12px;font-size:20px;letter-spacing:4px;text-align:center;font-family:monospace;box-sizing:border-box;" />
        </div>

        <div id="lp-langkah2" style="display:none;">
          <label style="display:block;font-size:12px;font-weight:600;color:#2f6f4e;margin:12px 0 4px;">PIN baru (6 digit angka)</label>
          <input id="lp-pin1" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" style="width:100%;padding:12px;border:2px solid #cfe8da;border-radius:12px;font-size:18px;letter-spacing:6px;text-align:center;box-sizing:border-box;" />
          <label style="display:block;font-size:12px;font-weight:600;color:#2f6f4e;margin:12px 0 4px;">Ulangi PIN baru</label>
          <input id="lp-pin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" style="width:100%;padding:12px;border:2px solid #cfe8da;border-radius:12px;font-size:18px;letter-spacing:6px;text-align:center;box-sizing:border-box;" />
        </div>

        <div id="lp-err" style="color:#c62828;font-size:13px;margin-top:10px;display:none;"></div>

        <button id="lp-lanjut" type="button" style="width:100%;margin-top:16px;padding:13px;border:none;border-radius:14px;background:#4caf7a;color:#fff;font-weight:700;cursor:pointer;">Lanjut</button>
        <button id="lp-batal" type="button" style="width:100%;margin-top:10px;padding:12px;border:none;border-radius:14px;background:#eee;color:#666;font-weight:600;cursor:pointer;">Batal</button>
      </div>`;
    document.body.appendChild(modal);

    const $m = (id) => modal.querySelector('#' + id);
    const err = (t) => { const e = $m('lp-err'); e.textContent = t || ''; e.style.display = t ? 'block' : 'none'; };
    const tutup = () => { if (modal.parentNode) document.body.removeChild(modal); };
    let langkah = 1;

    // Isi username dari kolom login bila sudah diketik (lewat properti value, bukan innerHTML)
    $m('lp-username').value = (document.getElementById('input-username')?.value || '').trim();
    $m('lp-batal').onclick = tutup;

    const lanjut = $m('lp-lanjut');
    lanjut.onclick = async () => {
        err('');
        const username = $m('lp-username').value.trim();

        if (langkah === 1) {
            const kode = $m('lp-kode').value.replace(/\D/g, '');
            if (!username) { err('Isi username dulu.'); return; }
            if (kode.length !== 8) { err('Kode terdiri dari 8 digit angka.'); return; }
            lanjut.disabled = true; lanjut.textContent = 'Memeriksa...';
            // Cek kode saja (tidak menghabiskan kode) supaya salah ketik ketahuan sebelum buat PIN
            const cek = await callTofVault('cek_kode_reset', { username, kode });
            lanjut.disabled = false; lanjut.textContent = 'Lanjut';
            if (!cek.ok) { err(pesanTofVault(cek)); return; }
            langkah = 2;
            $m('lp-langkah1').style.display = 'none';
            $m('lp-langkah2').style.display = 'block';
            $m('lp-judul').textContent = 'Buat PIN Baru';
            $m('lp-info').textContent = 'Kode benar ✓ Sekarang buat PIN baru untuk akun ' + cek.username + '.';
            lanjut.textContent = 'Simpan PIN & Masuk';
            $m('lp-pin1').focus();
            return;
        }

        // Langkah 2: pasang PIN baru lalu masuk
        const kode = $m('lp-kode').value.replace(/\D/g, '');
        const pin1 = $m('lp-pin1').value.trim();
        const pin2 = $m('lp-pin2').value.trim();
        if (!/^\d{6}$/.test(pin1)) { err('PIN harus 6 digit angka.'); return; }
        if (pin1 !== pin2) { err('Kedua PIN tidak sama.'); return; }
        lanjut.disabled = true; lanjut.textContent = 'Menyimpan...';
        const res = await callTofVault('pakai_kode_reset', { username, kode, pin_baru: pin1 });
        lanjut.disabled = false; lanjut.textContent = 'Simpan PIN & Masuk';
        if (!res.ok) { err(pesanTofVault(res)); return; }

        // Berhasil: masuk memakai alur login biasa (menyimpan sesi, level, dan mengarahkan ke halaman tujuan)
        tutup();
        document.getElementById('input-username').value = username;
        document.getElementById('input-pin').value = pin1;
        await handleLogin();
    };
}

pasangLupaPin();

console.log('✓ ToFarmer Login v2 loaded (with PIN 2FA)');