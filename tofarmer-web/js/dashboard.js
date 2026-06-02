import { supabase } from './supabase-client.js';

document.addEventListener('DOMContentLoaded', async () => {
    const authSection = document.getElementById('auth-section');
    const userSection = document.getElementById('user-section');
    const welcome = document.getElementById('welcome-text');
    
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

        aiText.innerText = "...";
        
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
            typeWriter(aiText, result.saran || "Mentor lagi di sawah, nanti lagi ya.");
        } catch (error) {
            aiText.innerText = "Waduh, sinyal di kebun lagi hilang. Coba lagi nanti!";
        }
    });
}

async function loadDrafts(userId, isLogin) {
    const container = document.getElementById('container-misi');
    if (!container) return;
    container.innerHTML = ''; 

    // Filter hanya ambil data yang belum final/baku
    let { data } = await supabase.from('drafts').select('*');

    if (data && data.length > 0) {
        data.forEach(draft => {
            // Jika login, filter hanya miliknya
            if (isLogin && draft.user_id !== userId) return;
            
            // Logika: Hanya tampilkan jika belum 'BAKU' atau belum 'PENDING' (Masih dalam proses gate)
            const btn = document.createElement('button');
            btn.className = "btn-draft";
            btn.style.cssText = "width:100%; margin:5px 0; padding:10px; background:#334155; border:1px solid #475569; color:white; border-radius:8px; cursor:pointer;";
            btn.innerText = `➔ ${draft.progres_data.judul_eksperimen || "Draft Tanpa Judul"}`;
            
            btn.onclick = () => {
                if (!isLogin) { alert("Login dulu untuk lanjut!"); return; }
                localStorage.setItem('tofarmer_draft', JSON.stringify({ data: draft.progres_data }));
                arahkankeGate(draft.progres_data);
            };
            container.appendChild(btn);
        });
    } else {
        container.innerHTML = "<p style='color:#64748b; font-size:0.8rem;'>Tidak ada misi yang sedang dikerjakan.</p>";
    }
}

// --- FUNGSI PENGARAH GATE ---
function arahkankeGate(data) {
    if (!data.gate_1_status) window.location.href = 'gate-1.html';
    else if (!data.gate_2_hipotesis) window.location.href = 'gate-2.html';
    else window.location.href = 'gate-3.html';
}

// --- RESET ---
window.buatIlmuBaru = () => {
    localStorage.removeItem('tofarmer_draft');
    localStorage.removeItem('tofarmer_synced');
    window.location.href = 'gate-1.html';
};

// --- LOAD ILMU BAKU & APPROVE ---
async function loadIlmuBaku(status, elementId) {
    const container = document.getElementById(elementId);
    if (!container) return;
    
    // Simpan judul agar tidak hilang saat innerHTML direset
    const title = container.querySelector('h3').outerHTML;
    
    const { data } = await supabase.from('contributions')
        .select('*')
        .eq('status_validasi', status);

    container.innerHTML = title; 
    
    if (data && data.length > 0) {
        data.forEach(item => {
            const btn = document.createElement('button');
            btn.style.cssText = "width:100%; margin:5px 0; padding:12px; background:#1e293b; border:1px solid #334155; color:#e2e8f0; border-radius:10px; cursor:pointer; text-align:left; font-weight:500;";
            btn.innerHTML = `<strong>${item.judul_aksi}</strong>`;
            
            if (status === 'PENDING') {
                btn.innerHTML += `<br><span style="font-size:0.7rem; color:#f59e0b;">● Menunggu konsensus bersama</span>`;
            } else {
                btn.innerHTML += `<br><span style="font-size:0.7rem; color:#10b981;">● Ilmu Baku Sah</span>`;
            }
            
            btn.onclick = () => alert("Detail Ilmu:\n" + item.deskripsi_proses);
            container.appendChild(btn);
        });
    } else {
        container.innerHTML += `<p style="color:#64748b; font-size:0.85rem;">Tidak ada data saat ini.</p>`;
    }
}

window.lanjutkanDraft = () => {
    const draftRaw = localStorage.getItem('tofarmer_draft');
    if (!draftRaw) return;
    const draft = JSON.parse(draftRaw);
    arahkankeGate(draft.data);
};