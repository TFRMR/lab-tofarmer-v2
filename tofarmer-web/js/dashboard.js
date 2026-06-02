import { supabase } from './supabase-client.js';

// Di awal dashboard.js, tambahkan "penyambung" ini
const rawUserId = localStorage.getItem('tof_user_id') || localStorage.getItem('tof_wallet');

// Jika ditemukan salah satu tapi yang lain kosong, kita isi supaya konsisten
if (rawUserId) {
    localStorage.setItem('tof_user_id', rawUserId);
    localStorage.setItem('tof_wallet', rawUserId);
}

const userId = rawUserId; // Sekarang userId sudah pasti ada isinya

document.addEventListener('DOMContentLoaded', async () => {
    const authSection = document.getElementById('auth-section');
    const userSection = document.getElementById('user-section');
    const welcome = document.getElementById('welcome-text');
    
    // 1. Panggil asisten
    initAsistenKebun();

    // 2. TAMBAHKAN PEMANGGILAN SAPAAN DI SINI
    sapaUser();

    const userId = localStorage.getItem('tof_user_id');

    if (userId) {
        authSection.style.display = 'none';
        userSection.style.display = 'block';
        welcome.innerText = `Halo, ${localStorage.getItem('tof_username') || 'Petani'}!`;
        loadDrafts(userId, true);
    } else {
        authSection.style.display = 'block';
        userSection.style.display = 'none';
        welcome.innerText = "Selamat Datang, Sahabat Tani!";
        loadDrafts(null, false);
    }

    // Load dari tabel baru
    loadDataIlmu('ilmu_baku', 'card-galeri', 'Ilmu Baku Sah');
    loadDataIlmu('ilmu_pending', 'card-approve', 'Menunggu konsensus bersama');
});
// --- SAPAAN HUMOR DINAMIS (BUATAN AI) ---
async function sapaUser() {
    const aiText = document.getElementById('ai-text');
    if (!aiText) return;

    aiText.innerText = "Membuka pintu kebun...";

    try {
        const response = await fetch('https://tofarmer-api.tofarmer-api.workers.dev/ai-saran', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                mode: "Dasboard", 
                trigger: "halaman-ilmu-ToFarmer", 
                teks: "Berikan sapaan humoris yang singkat dan unik untuk user." 
            })
        });
        
        const result = await response.json();
        typeWriter(aiText, result.saran || "Selamat datang di pusat ilmu ToFarmer!");
    } catch (error) {
        typeWriter(aiText, "Halo Sahabat Tani! Senang sekali Anda kembali.");
    }
}


// --- EFEK KETIK (TYPING EFFECT) ---
function typeWriter(element, text, speed = 30) {
    let i = 0;
    element.innerHTML = "";
    if (window.typingInterval) clearInterval(window.typingInterval);
    window.typingInterval = setInterval(() => {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
        } else {
            clearInterval(window.typingInterval);
        }
    }, speed);
}

// --- POPUP CANTIK TOFARMER VIBES ---
function showPopup(judul, konten) {
    const overlay = document.createElement('div');
    overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; z-index:9999;";
    overlay.innerHTML = `
        <div style="background:#1e293b; padding:2rem; border-radius:1rem; width:90%; max-width:400px; border:1px solid #374151; color:white; text-align:center;">
            <h2 style="color:#16a34a;">${judul}</h2>
            <p style="color:#cbd5e1;">${konten}</p>
            <button id="close-popup" style="background:#16a34a; border:none; padding:10px 20px; color:white; border-radius:8px; cursor:pointer; margin-top:20px;">Tutup</button>
        </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('close-popup').onclick = () => document.body.removeChild(overlay);
}

// --- FUNGSI ASISTEN KEBUN ---
async function initAsistenKebun() {
    const aiText = document.getElementById('ai-text');
    const aiInput = document.getElementById('ai-input');
    const aiBtn = document.getElementById('ai-send-btn');
    if (!aiText || !aiInput || !aiBtn) return;
    aiBtn.addEventListener('click', async () => {
        const pesan = aiInput.value.trim();
        if (!pesan) return;
        aiText.innerText = "...";
        try {
            const response = await fetch('https://tofarmer-api.tofarmer-api.workers.dev/ai-saran', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: "humor", trigger: "chat-dashboard", teks: pesan })
            });
            const result = await response.json();
            typeWriter(aiText, result.saran || "Mentor lagi di sawah, nanti lagi ya.");
        } catch (e) { aiText.innerText = "Sinyal di kebun hilang!"; }
    });
}

// --- LOAD DRAFTS & DETEKSI GATE ---
async function loadDrafts(userId, isLogin) {
    const container = document.getElementById('container-misi');
    if (!container) return;
    container.innerHTML = ''; 

    let { data } = await supabase.from('drafts').select('*');
    if (data && data.length > 0) {
        data.forEach(draft => {
            if (isLogin && draft.user_id !== userId) return;
            const btn = document.createElement('button');
            btn.className = "btn-draft";
            btn.style.cssText = "width:100%; margin:5px 0; padding:12px; background:#334155; color:white; border:none; border-radius:10px; cursor:pointer;";
            btn.innerText = `➔ ${draft.progres_data.judul_eksperimen || "Misi Berjalan"}`;
            btn.onclick = () => {
                if (!isLogin) { alert("Login dulu!"); return; }
                localStorage.setItem('tofarmer_draft', JSON.stringify({ data: draft.progres_data }));
                arahkankeGate(draft.progres_data);
            };
            container.appendChild(btn);
        });
    } else {
        container.innerHTML = "<p style='color:#64748b;'>Tidak ada misi.</p>";
    }
}

// --- FUNGSI PENGARAH GATE (Logika Otomatis) ---
function arahkankeGate(data) {
    // Jika Gate 1 belum selesai, wajib ke Gate 1
    if (!data.gate_1_selesai) {
        window.location.href = 'gate-1.html';
    } 
    // Jika Gate 1 sudah selesai, tapi Gate 2 belum, wajib ke Gate 2
    else if (!data.gate_2_selesai) {
        window.location.href = 'gate-2.html';
    } 
    // Jika semua sudah selesai, arahkan ke Gate 3 atau halaman akhir
    else {
        window.location.href = 'gate-3.html';
    }
}

// --- RESET ---
window.buatIlmuBaru = () => {
    localStorage.removeItem('tofarmer_draft');
    window.location.href = 'ilmu-baku-generator.html'; // Sesuaikan file Anda
};

// --- LOAD TABEL BARU ---
async function loadDataIlmu(tableName, elementId, badgeText) {
    const container = document.getElementById(elementId);
    if (!container) return;
    const title = container.querySelector('h3').outerHTML;
    
    const { data } = await supabase.from(tableName).select('*');
    container.innerHTML = title; 
    
    if (data && data.length > 0) {
        data.forEach(item => {
            const btn = document.createElement('button');
            btn.style.cssText = "width:100%; margin:5px 0; padding:12px; background:#1e293b; border:1px solid #334155; color:#e2e8f0; border-radius:10px; cursor:pointer; text-align:left;";
            btn.innerHTML = `<strong>${item.judul_aksi}</strong><br><span style="font-size:0.7rem; color:#f59e0b;">● ${badgeText}</span>`;
            btn.onclick = () => showPopup(item.judul_aksi, item.deskripsi_proses);
            container.appendChild(btn);
        });
    } else {
        container.innerHTML += `<p style="color:#64748b; padding:10px;">Belum ada data.</p>`;
    }
}