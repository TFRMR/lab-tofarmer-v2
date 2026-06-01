// 1. Cek Login & Ambil Konteks
const wallet = localStorage.getItem('tof_wallet');
if (!wallet) window.location.href = '../html/login.html';

const draft = JSON.parse(localStorage.getItem('tofarmer_draft') || '{}');
document.getElementById('context-info').innerText = `Konteks: ${draft.data?.judul_eksperimen || 'Ilmu Mikro'}`;

// 2. Fungsi Validasi (Tombol Terkunci Jika Kosong)
const validateGate2 = () => {
    const inputs = document.querySelectorAll('.gate2-input');
    const btn = document.getElementById('btn-lanjut');
    
    // Cek apakah semua input terisi (minimal 1 karakter)
    const isComplete = Array.from(inputs).every(input => input.value.trim() !== "");
    
    if (isComplete) {
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
        btn.innerText = "🔓 KUNCI & MAJU KE GATE 3";
    } else {
        btn.disabled = true;
        btn.style.opacity = "0.5";
        btn.style.cursor = "not-allowed";
        btn.innerText = "🔒 KUNCI & MAJU KE GATE 3";
    }
};

// State awal tombol
validateGate2();

// 3. Debounce AI (Panggil AI proaktif berdasarkan input user)
let timer;
const triggerAi = () => {
    validateGate2(); // Selalu cek validasi saat mengetik
    
    clearTimeout(timer);
    timer = setTimeout(async () => {
        const aiFeedback = document.getElementById('ai-feedback');
        
        const payload = {
            context: draft.data,
            input: {
                taktik: document.getElementById('taktik').value,
                baseline: document.getElementById('baseline').value,
                target: document.getElementById('target').value
            }
        };

        try {
            const response = await fetch('https://tofarmer-api.tofarmer-api.workers.dev/ai-saran', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trigger: 'gate2-mikro', data: payload })
            });
            const result = await response.json();
            aiFeedback.innerText = result.saran || "Mentor sedang menyimak...";
        } catch (err) {
            aiFeedback.innerText = "Mentor sedang di ladang, lanjut isi saja dulu.";
        }
    }, 1500);
};

// Pasang Event Listener ke semua input
document.querySelectorAll('.gate2-input').forEach(input => {
    input.addEventListener('input', triggerAi);
});

// 4. Tombol Lanjut
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