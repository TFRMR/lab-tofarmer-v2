import { supabase } from './supabase-client.js';

const wallet = localStorage.getItem('tof_wallet');
if (!wallet) window.location.href = '../html/login.html';

// Inisialisasi draft dari localStorage
let draft = JSON.parse(localStorage.getItem('tofarmer_draft') || '{"data":{}}');

// State untuk melacak jatah 5 pertanyaan per kolom
const komentarState = {
    taktik: 0,
    baseline: 0,
    target: 0
};
const MAX_KOMENTAR_PER_KOLOM = 5;

document.addEventListener('DOMContentLoaded', () => {
    const isiRingkasan = document.getElementById('isi-ringkasan');
    if (isiRingkasan && draft.data) {
        const { judul_eksperimen, pilar_bidang, kalimat_baku_compiled, micro_inputs } = draft.data;

        // Susun HTML untuk menampilkan data Gate 1
        let html = `
            <p><strong>Judul:</strong> ${judul_eksperimen || "-"}</p>
            <p><strong>Pilar:</strong> ${pilar_bidang || "-"}</p>
            <p style="color: #60a5fa;"><em>"${kalimat_baku_compiled || "-"}"</em></p>
            <hr style="border: 0; border-top: 1px solid #374151; margin: 10px 0;">
            <ul style="font-size: 14px; list-style: none; padding: 0;">
        `;

        if (micro_inputs) {
            Object.entries(micro_inputs).forEach(([key, value]) => {
                html += `<li><strong>${key}:</strong> ${value}</li>`;
            });
        }
        html += `</ul>`;
        
        isiRingkasan.innerHTML = html;
    }

    // Pemulihan input gate 2 (seperti kode lama Anda)
    if (draft.data?.gate_2_hipotesis) {
        document.getElementById('taktik').value = draft.data.gate_2_hipotesis.taktik || "";
        document.getElementById('baseline').value = draft.data.gate_2_hipotesis.baseline || "";
        document.getElementById('target').value = draft.data.gate_2_hipotesis.target || "";
        if (draft.data.komentar_state) Object.assign(komentarState, draft.data.komentar_state);
        validateGate2();
    }
});

// Fungsi Sinkronisasi ke Supabase (Background)
const autoSaveToSupabase = async () => {
    const userId = localStorage.getItem('tof_user_id'); 
    if (!userId || !draft.data) return;

    try {
        await supabase
            .from('drafts')
            .upsert({
                user_id: userId,
                progres_data: draft.data,
                // Pastikan kolom boolean ini diisi agar sinkron dengan database
                gate_2_selesai: draft.data.gate_2_selesai === true,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
        console.log("Draft tersimpan aman di awan dengan status Gate 2!");
    } catch (err) {
        console.error("Gagal sinkronisasi:", err.message);
    }
};

// Fungsi validasi tombol lanjut
const validateGate2 = () => {
    const inputs = document.querySelectorAll('.gate2-input');
    const btn = document.getElementById('btn-lanjut');
    const isComplete = Array.from(inputs).every(input => input.value.trim() !== "");
    
    if (btn) {
        btn.disabled = !isComplete;
        btn.style.opacity = isComplete ? "1" : "0.5";
        btn.style.cursor = isComplete ? "pointer" : "not-allowed";
        btn.innerText = isComplete ? "🔓 KUNCI & MAJU KE GATE 3" : "🔒 KUNCI & MAJU KE GATE 3";
    }
};

// Fungsi AI Proaktif dengan batasan 3x per kolom
window.refreshAi = async (fieldId) => {
    if (komentarState[fieldId] >= MAX_KOMENTAR_PER_KOLOM) {
        alert("Jatah tanya mentor untuk kolom ini sudah habis (3/3). Lanjut isi kolom lainnya ya!");
        return;
    }

    const aiFeedback = document.getElementById(`ai-${fieldId}`);
    const userInput = document.getElementById(fieldId).value;
    
    if (!userInput.trim()) return;
    
    aiFeedback.innerText = "Mentor sedang menganalisis...";
    
    const payload = {
        context: draft.data,
        field: fieldId,
        input: userInput
    };

    try {
        const response = await fetch('https://tofarmer-api.tofarmer-api.workers.dev/ai-saran', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                mode: "Evaluasi",
                trigger: 'gate2-mikro-spesifik', 
                teks: userInput, // Ganti ini dari 'data' ke 'teks'
                context: draft.data // Ji
            })
        });
        
        const result = await response.json();
        const saran = result.saran || "Mentor sedang menyimak...";
        
        // Efek ketik
        let i = 0;
        aiFeedback.innerText = "";
        const typing = setInterval(() => {
            if (i < saran.length) {
                aiFeedback.textContent += saran.charAt(i);
                i++;
            } else {
                clearInterval(typing);
                komentarState[fieldId]++; // Tambah hitungan setelah selesai mengetik
                aiFeedback.innerHTML += `<br><small style="color: #64748b;">Sisa jatah: ${MAX_KOMENTAR_PER_KOLOM - komentarState[fieldId]}x</small>`;
            }
        }, 30);

    } catch (err) {
        aiFeedback.innerText = "Mentor sedang di ladang, lanjut isi saja dulu.";
    }
};

// Pasang Event Listener ke semua input
document.querySelectorAll('.gate2-input').forEach(input => {
    input.addEventListener('input', validateGate2);
});

// Fungsi pembantu untuk menyimpan state ke localStorage dan Supabase
const simpanState = () => {
    const dataGate2 = {
        taktik: document.getElementById('taktik').value,
        baseline: document.getElementById('baseline').value,
        target: document.getElementById('target').value
    };
    
    draft.data.gate_2_hipotesis = dataGate2;
    draft.data.komentar_state = komentarState; // Simpan sisa jatah tanya
    localStorage.setItem('tofarmer_draft', JSON.stringify(draft));
    
    autoSaveToSupabase();
};

// Event Listener untuk tombol kembali
document.getElementById('btn-kembali').addEventListener('click', () => {
    simpanState();
    window.location.href = 'gate-1.html';
});

// Event Listener untuk tombol lanjut
document.getElementById('btn-lanjut').addEventListener('click', async () => {
    // 1. Update data terbaru ke draft object
    draft.data.gate_2_hipotesis = {
        taktik: document.getElementById('taktik').value,
        baseline: document.getElementById('baseline').value,
        target: document.getElementById('target').value
    };
    
    // 2. Tandai Lulus
    draft.data.gate_2_selesai = true;
    
    // 3. Simpan ke LocalStorage
    localStorage.setItem('tofarmer_draft', JSON.stringify(draft));
    
    // 4. Kirim ke Supabase dengan fungsi yang sudah diperbaiki di atas
    await autoSaveToSupabase(); 

    alert("Gate 2 Lulus! Pintu ke Gate 3 telah terbuka.");
    window.location.href = 'gate-3.html';
});