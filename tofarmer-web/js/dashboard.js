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
        welcome.innerText = `Halo, ${localStorage.getItem('tof_username') || 'Farmer'}!`;
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
cekDeepLinkShared();
});
async function sapaUser() {
    const aiText = document.getElementById('ai-text');
    if (!aiText) return;

    aiText.innerText = "Membuka pintu kebun...";

    // Mengambil aturan main murni dari RAG global window
    const aturanMain = typeof window.cariKonteksDashboard === "function" ? window.cariKonteksDashboard("pemandu awal") : "";

    try {
        const response = await fetch('https://tofarmer-api.tofarmer-api.workers.dev/ai-saran', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                mode: "Dashboard", 
                trigger: "user_masuk", 
                teks: `Kamu adalah AI Pemandu ToFarmer. Sapa user dengan akrab dan ingatkan poin-poin aturan dashboard ini dengan gaya santai: ${aturanMain}` 
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

function showPopup(item) {
    const overlay = document.createElement('div');
    overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; z-index:9999; overflow-y: auto; padding: 20px;";
    
    // Asumsi item membawa data: judul_aksi, deskripsi_proses, id, username (atau user_id)
    overlay.innerHTML = `
        <div style="background:#1e293b; padding:2rem; border-radius:1rem; width:90%; max-width:500px; border:1px solid #374151; color:white; text-align:left; max-height: 90vh; display: flex; flex-direction: column;">
            
            <div style="text-align:center; font-size:0.7rem; color:#94a3b8; margin-bottom:0.5rem; text-transform:uppercase; letter-spacing:0.1em;">
                ToFarmer-ilmu baku (${item.id ? item.id.substring(0,8) : '000'}) oleh @${item.username || 'Petani'}
            </div>

            <h2 style="color:#16a34a; text-align:center; margin-bottom:1rem;">${item.judul_aksi}</h2>
            
            <div style="flex: 1; overflow-y: auto; margin-bottom: 1rem; padding-right: 10px;">
                <p style="color:#cbd5e1; white-space:pre-line; line-height:1.6; font-size:0.95rem;">${item.deskripsi_proses}</p>
            </div>

            <div style="text-align:center; display: flex; gap: 10px; justify-content: center;">
                <button id="vote-btn" style="background:#f59e0b; border:none; padding:10px 20px; color:black; border-radius:8px; cursor:pointer; font-weight:bold;">👍 Vote (${item.total_vote || 0})</button>
                <button id="close-popup" style="background:#374151; border:none; padding:10px 30px; color:white; border-radius:8px; cursor:pointer;">Tutup</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    document.getElementById('vote-btn').onclick = () => handleVote(item);
    document.getElementById('close-popup').onclick = () => document.body.removeChild(overlay);
}

// --- FUNGSI ASISTEN KEBUN ---
// 🔥 CARI DAN GANTI SELURUH FUNGSI initAsistenKebun() YANG LAMA DENGAN INI:
async function initAsistenKebun() {
    const aiText = document.getElementById('ai-text');
    const aiInput = document.getElementById('ai-input');
    const aiBtn = document.getElementById('ai-send-btn');
    if (!aiText || !aiInput || !aiBtn) return;

    aiBtn.addEventListener('click', async () => {
        const pesan = aiInput.value.trim();
        if (!pesan) return;
        aiText.innerText = "...";

        // Ambil bekal dari RAG berdasarkan apa yang diketik oleh user di input chat
        const konteksSkenario = typeof window.cariKonteksDashboard === "function" ? window.cariKonteksDashboard(pesan) : "";

        try {
            const response = await fetch('https://tofarmer-api.tofarmer-api.workers.dev/ai-saran', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    mode: "humor", 
                    trigger: "chat-dashboard", 
                    teks: `Pertanyaan user: "${pesan}". Jawablah pertanyaan tersebut dengan menyelipkan informasi dari aturan dasar ekosistem berikut: ${konteksSkenario}` 
                })
            });
            const result = await response.json();
            typeWriter(aiText, result.saran || "Mentor lagi di sawah, nanti kembali lagi.");
        } catch (e) { 
            aiText.innerText = "Sinyal di kebun hilang!"; 
        }
        aiInput.value = ''; 
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

function arahkankeGate(data) {
    // Definisi urutan gate
    const gates = [
        { key: 'gate_1_selesai', url: 'gate-1.html' },
        { key: 'gate_2_selesai', url: 'gate-2.html' },
        { key: 'gate_3_selesai', url: 'gate-3.html' },
        { key: 'gate_4_selesai', url: 'gate-4.html' },
        { key: 'gate_5_selesai', url: 'gate-5.html' },
        { key: 'gate_6_selesai', url: 'gate-6.html' }
    ];

    // Temukan gate pertama yang statusnya false
    const targetGate = gates.find(gate => !data[gate.key]);

    if (targetGate) {
        window.location.href = targetGate.url;
    } else {
        // Jika semua true, arahkan ke halaman akhir
        window.location.href = 'finish.html';
    }
}

// 🔥 CARI DAN GANTI FUNSI window.buatIlmuBaru YANG LAMA DENGAN BARIS INI:
window.buatIlmuBaru = async () => {
    localStorage.removeItem('tofarmer_draft');
    
    const aiText = document.getElementById('ai-text');
    const petunjukGate = typeof window.cariKonteksDashboard === "function" ? window.cariKonteksDashboard("buat ilmu baru") : "";
    
    if (aiText) {
        aiText.innerText = "...";
        try {
            // Tembak AI untuk memberikan wejangan ringkas tentang Gate 1-3 sebelum user pindah halaman
            const response = await fetch('https://tofarmer-api.tofarmer-api.workers.dev/ai-saran', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    mode: "Dashboard", 
                    trigger: "klik_buat_ilmu", 
                    teks: `User mau buat ilmu baru. Berikan pengingat super singkat tentang alur Gate 1 sampai Gate 3 (di mana mereka harus review tulisan AI): ${petunjukGate}` 
                })
            });
            const result = await response.json();
            typeWriter(aiText, result.saran || "Menyiapkan lembar kerja baru...");
        } catch (e) {
            aiText.innerText = "Menyiapkan lembar kerja...";
        }
    }

    // Beri jeda 2 detik agar user sempat membaca wejangan AI sebelum mental ke gate-1.html
    setTimeout(() => {
        window.location.href = 'gate-1.html';
    }, 2000);
};
// --- LOAD TABEL BARU ---
async function loadDataIlmu(tableName, elementId, badgeText) {
    const container = document.getElementById(elementId);
    if (!container) return;

    const title = container.querySelector('h3') ? container.querySelector('h3').outerHTML : `<h3>${badgeText}</h3>`;
    
    // 1. AMBIL DATA ILMU SAJA (Tanpa join, supaya data tidak pernah hilang)
    const { data: ilmuData, error: ilmuError } = await supabase.from(tableName).select('*');
    
    if (ilmuError) {
        console.error("Error mengambil ilmu:", ilmuError);
        return;
    }

    container.innerHTML = title;

    if (ilmuData && ilmuData.length > 0) {
        // 2. AMBIL USERNAME (Opsional: Jika ini ilmu_pending)
        let profileMap = {};
        if (tableName === 'ilmu_pending') {
            const userIds = [...new Set(ilmuData.map(item => item.user_id))];
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, username')
                .in('id', userIds);
            
            if (profiles) {
                profiles.forEach(p => profileMap[p.id] = p.username);
            }
        }

      // 3. RENDER DATA
        ilmuData.forEach(item => {
            const username = profileMap[item.user_id] || 'Petani';
            const itemWithUser = { ...item, username };

            // Buat kontainer pembungkus agar tombol judul & tombol share bisa berjejer rapi
            const wrapper = document.createElement('div');
            wrapper.style.cssText = "display: flex; gap: 8px; margin: 5px 0; align-items: stretch; width: 100%;";

            const btn = document.createElement('button');
            btn.style.cssText = "flex: 1; padding:12px; background:#1e293b; border:1px solid #334155; color:#e2e8f0; border-radius:10px; cursor:pointer; text-align:left;";
            btn.innerHTML = `<strong>${item.judul_aksi}</strong><br><span style="font-size:0.7rem; color:#f59e0b;">● ${badgeText}</span>`;
            btn.onclick = () => showPopup(itemWithUser);

            // Tombol Share Baru 🔗
            const shareBtn = document.createElement('button');
            shareBtn.style.cssText = "background: #16a34a; border: none; padding: 0 15px; color: white; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;";
            shareBtn.innerHTML = "Share🔗";
            shareBtn.onclick = (e) => {
                e.stopPropagation(); // Biar popup utama di tombol sebelah gak ikutan ketembak terbuka
                bagikanLinkIlmu(item.id, tableName);
            };

            // Masukkan kedua tombol ke dalam pembungkus, lalu tempel ke kontainer utama
            wrapper.appendChild(btn);
            wrapper.appendChild(shareBtn);
            container.appendChild(wrapper);
        });
    } else {
        container.innerHTML += `<p style="color:#64748b; padding:10px;">Belum ada data.</p>`;
    }
}
async function handleVote(item) {
    const userId = localStorage.getItem('tof_user_id');

    // CEK LOGIN: Pengunjung tidak login tidak bisa vote
    if (!userId) {
        alert("Waduh, login dulu ya untuk bisa memberikan dukungan!");
        return;
    }

    // CEK APAKAH SUDAH VOTE: Coba masukkan ke tabel votes
    const { data: existingVote, error: voteError } = await supabase
        .from('votes')
        .insert([{ ilmu_id: item.id, user_id: userId }])
        .select();

    if (voteError) {
        // Jika error, kemungkinan besar karena sudah pernah vote (karena constraint UNIQUE)
        alert("Wah, Kang sudah pernah memberikan dukungan untuk ilmu ini!");
        return;
    }

    // Jika berhasil input ke tabel votes, baru kita update jumlah di ilmu_pending
    const newVoteCount = (item.total_vote || 0) + 1;

    const { error: updateError } = await supabase
        .from('ilmu_pending')
        .update({ total_vote: newVoteCount })
        .eq('id', item.id);

    if (updateError) {
        alert("Gagal mengupdate jumlah vote.");
        return;
    }

    // Cek apakah mencapai 5 vote untuk pindah ke Ilmu Baku
    if (newVoteCount >= 7) {
        const { error: insertError } = await supabase
            .from('ilmu_baku')
            .insert([{
                user_id: item.user_id,
                judul_aksi: item.judul_aksi,
                deskripsi_proses: item.deskripsi_proses,
                total_vote: newVoteCount
            }]);

        if (!insertError) {
            await supabase.from('ilmu_pending').delete().eq('id', item.id);
            alert("Mantap! Ilmu ini sudah lulus konsensus dan masuk Ilmu Baku!");
            location.reload();
        }
    } else {
        alert(`Dukungan berhasil! (Total: ${newVoteCount}/7)`);
        location.reload();
    }
}
// ==========================================
// 🔗 FITUR TAMBAHAN: DEEP LINK & SHARE BUTTON
// ==========================================

function bagikanLinkIlmu(id, type) {
    const shareUrl = `${window.location.origin}${window.location.pathname}?ilmu=${id}&type=${type}`;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl).then(() => {
            alert("Tautan berhasil disalin! Siap dibagikan.");
        }).catch(() => bakuSalinManual(shareUrl));
    } else {
        bakuSalinManual(shareUrl);
    }
}

function bakuSalinManual(text) {
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    alert("Tautan berhasil disalin!");
}

async function cekDeepLinkShared() {
    const urlParams = new URLSearchParams(window.location.search);
    const ilmuId = urlParams.get('ilmu');
    const tableType = urlParams.get('type') || 'ilmu_pending';

    if (ilmuId) {
        const { data, error } = await supabase.from(tableType).select('*').eq('id', ilmuId).single();
        if (error || !data) return;

        let username = 'Petani';
        const { data: profile } = await supabase.from('profiles').select('username').eq('id', data.user_id).single();
        if (profile) username = profile.username;

        // Buka popup otomatis saat link diakses
        showPopup({ ...data, username });
    }
}