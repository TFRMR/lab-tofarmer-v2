import { supabase } from './supabase-client.js';

document.addEventListener('DOMContentLoaded', async () => {
    const authSection = document.getElementById('auth-section');
    const userSection = document.getElementById('user-section');
    const welcome = document.getElementById('welcome-text');
    
    // Inisialisasi Asisten Kebun
    initAsistenKebun();

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

    loadIlmuBaku('BAKU', 'card-galeri');
    loadIlmuBaku('PENDING', 'card-approve');
});

// --- FUNGSI ASISTEN KEBUN ---
async function initAsistenKebun() {
    const aiText = document.getElementById('ai-text');
    const aiInput = document.getElementById('ai-input');
    const aiBtn = document.getElementById('ai-send-btn');

    if (!aiText || !aiInput || !aiBtn) return;

    aiText.innerText = "Kebun hari ini cerah! Ada yang mau ditanyakan ke Asisten Kebun?";

    aiBtn.addEventListener('click', async () => {
        const pesan = aiInput.value.trim();
        if (!pesan) return;

        aiText.innerText = "Mentor sedang mikir...";
        
        try {
            const response = await fetch('https://tofarmer-api.tofarmer-api.workers.dev/ai-saran', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    mode: "humor", 
                    trigger: "chat-dashboard", 
                    teks: pesan 
                })
            });
            
            const result = await response.json();
            aiText.innerText = result.saran || "Mentor lagi di sawah, nanti lagi ya.";
        } catch (error) {
            aiText.innerText = "Waduh, sinyal di kebun lagi hilang. Coba lagi nanti!";
        }
    });
}

// --- FUNGSI DRAFT (Misi Berjalan) ---
async function loadDrafts(userId, isLogin) {
    const container = document.getElementById('container-misi');
    if (!container) return;
    container.innerHTML = ''; 

    let { data, error } = await supabase.from('drafts').select('*');

    if (data) {
        data.forEach(draft => {
            if (isLogin && draft.user_id !== userId) return;

            const btn = document.createElement('button');
            btn.className = "btn-draft";
            btn.innerText = `Misi: ${draft.progres_data.judul_eksperimen || "Draft Tanpa Judul"}`;
            
            btn.onclick = () => {
                if (!isLogin) { alert("Login dulu untuk lanjut!"); return; }
                localStorage.setItem('tofarmer_draft', JSON.stringify({ data: draft.progres_data }));
                arahkankeGate(draft.progres_data);
            };
            container.appendChild(btn);
        });
    }
}

// --- FUNGSI PENGARAH GATE ---
function arahkankeGate(data) {
    if (!data.gate_1_status) {
        window.location.href = 'gate-1.html';
    } else if (!data.gate_2_hipotesis) {
        window.location.href = 'gate-2.html';
    } else {
        window.location.href = 'gate-3.html';
    }
}

// --- RESET (Buat Ilmu Baru) ---
window.buatIlmuBaru = () => {
    localStorage.removeItem('tofarmer_draft');
    localStorage.removeItem('tofarmer_synced');
    window.location.href = 'gate-1.html';
};

// --- LOAD ILMU BAKU & APPROVE ---
async function loadIlmuBaku(status, elementId) {
    const container = document.getElementById(elementId);
    if (!container) return;
    
    const { data } = await supabase.from('contributions')
        .select('*')
        .eq('status_validasi', status);

    container.innerHTML = '';
    data?.forEach(item => {
        const card = document.createElement('div');
        card.className = "card-ilmu";
        card.innerHTML = `<h3>${item.judul_aksi}</h3><p>${item.deskripsi_proses}</p>`;
        container.appendChild(card);
    });
}

window.lanjutkanDraft = () => {
    const draftRaw = localStorage.getItem('tofarmer_draft');
    if (!draftRaw) return;
    const draft = JSON.parse(draftRaw);
    arahkankeGate(draft.data);
};