const wallet = localStorage.getItem('tof_wallet');
if (!wallet) window.location.href = '../html/login.html';

const draft = JSON.parse(localStorage.getItem('tofarmer_draft') || '{}');
document.getElementById('hasil-gate1').innerText = draft.data?.gate_1_judul || "Belum ada judul eksperimen";

// Definisi fungsi validasi ditaruh di atas agar bisa dipanggil saat init
const validateGate2 = () => {
    const inputs = document.querySelectorAll('.gate2-input');
    const btn = document.getElementById('btn-lanjut');
    const isComplete = Array.from(inputs).every(input => input.value.trim() !== "");
    
    btn.disabled = !isComplete;
    btn.style.opacity = isComplete ? "1" : "0.5";
    btn.style.cursor = isComplete ? "pointer" : "not-allowed";
    btn.innerText = isComplete ? "🔓 KUNCI & MAJU KE GATE 3" : "🔒 KUNCI & MAJU KE GATE 3";
};

// Mengisi ulang input jika user kembali dari Gate 1 atau refresh
if (draft.data?.gate_2_hipotesis) {
    document.getElementById('taktik').value = draft.data.gate_2_hipotesis.taktik || "";
    document.getElementById('baseline').value = draft.data.gate_2_hipotesis.baseline || "";
    document.getElementById('target').value = draft.data.gate_2_hipotesis.target || "";
    validateGate2(); // Aktifkan tombol jika data sudah ada
}

// Fungsi AI Proaktif per kolom (dibuat global agar bisa dipanggil oleh onclick di HTML)
window.refreshAi = async (fieldId) => {
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
            body: JSON.stringify({ trigger: 'gate2-mikro-spesifik', data: payload })
        });
        const result = await response.json();
        aiFeedback.innerText = result.saran || "Mentor sedang menyimak...";
    } catch (err) {
        aiFeedback.innerText = "Mentor sedang di ladang, lanjut isi saja dulu.";
    }
};

// Pasang Event Listener ke semua input
document.querySelectorAll('.gate2-input').forEach(input => {
    input.addEventListener('input', validateGate2);
});

// Event Listener untuk tombol kembali
document.getElementById('btn-kembali').addEventListener('click', () => {
    // Simpan state saat ini sebelum mundur
    const dataGate2 = {
        taktik: document.getElementById('taktik').value,
        baseline: document.getElementById('baseline').value,
        target: document.getElementById('target').value
    };
    
    let state = JSON.parse(localStorage.getItem('tofarmer_draft') || '{}');
    state.data.gate_2_hipotesis = dataGate2;
    localStorage.setItem('tofarmer_draft', JSON.stringify(state));
    
    window.location.href = 'ilmu-baku-generator.html';
});

// Event Listener untuk tombol lanjut
document.getElementById('btn-lanjut').addEventListener('click', () => {
    const dataGate2 = {
        taktik: document.getElementById('taktik').value,
        baseline: document.getElementById('baseline').value,
        target: document.getElementById('target').value
    };
    
    let state = JSON.parse(localStorage.getItem('tofarmer_draft') || '{}');
    state.data.gate_2_hipotesis = dataGate2;
    localStorage.setItem('tofarmer_draft', JSON.stringify(state));
    window.location.href = 'gate-3.html';
});