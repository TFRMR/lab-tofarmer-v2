import { supabase } from './supabase-client.js';

const wallet = localStorage.getItem('tof_wallet');
if (!wallet) window.location.href = '../html/login.html';

// Inisialisasi draft dari localStorage
let draft = JSON.parse(localStorage.getItem('tofarmer_draft') || '{"data":{}}');

// State untuk melacak jatah 3 pertanyaan per kolom
const komentarState = {
    taktik: 0,
    baseline: 0,
    target: 0
};
const MAX_KOMENTAR_PER_KOLOM = 3;

document.addEventListener('DOMContentLoaded', () => {
    // Menampilkan judul dari Gate 1
    const elHasilGate1 = document.getElementById('hasil-gate1');
    if (elHasilGate1) {
        elHasilGate1.innerText = draft.data?.judul_eksperimen || "Belum ada judul eksperimen";
    }

    // Mengisi ulang input dan memulihkan state komentar jika ada
    if (draft.data?.gate_2_hipotesis) {
        document.getElementById('taktik').value = draft.data.gate_2_hipotesis.taktik || "";
        document.getElementById('baseline').value = draft.data.gate_2_hipotesis.baseline || "";
        document.getElementById('target').value = draft.data.gate_2_hipotesis.target || "";
        
        // Memulihkan sisa jatah tanya dari draft jika tersimpan
        if (draft.data.komentar_state) {
            Object.assign(komentarState, draft.data.komentar_state);
        }
        validateGate2();
    }
});

// Fungsi Sinkronisasi ke Supabase (Background)
const autoSaveToSupabase = async () => {
    if (!wallet || !draft.data) return;
    try {
        await supabase
            .from('contributions')
            .update({
                progres_data: draft.data,
                updated_at: new Date()
            })
            .eq('wallet_address', wallet); 
        console.log("Progress tersimpan di awan (Supabase).");
    } catch (err) {
        console.error("Gagal sinkronisasi latar belakang:", err.message);
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
                mode: "Gate2",
                trigger: 'gate2-mikro-spesifik', 
                data: payload 
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
    window.location.href = 'ilmu-baku-generator.html';
});

// Event Listener untuk tombol lanjut
document.getElementById('btn-lanjut').addEventListener('click', () => {
    simpanState();
    window.location.href = 'gate-3.html';
});