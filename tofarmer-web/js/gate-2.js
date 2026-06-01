import { Generator } from './generator.js';

const wallet = localStorage.getItem('tof_wallet');
if (!wallet) window.location.href = '../html/login.html';

const draft = JSON.parse(localStorage.getItem('tofarmer_draft') || '{}');
document.getElementById('context-info').innerText = `Konteks: ${draft.data?.judul_eksperimen || 'Ilmu Mikro'}`;

// Debounce untuk memanggil AI
let timer;
const triggerAi = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
        const payload = {
            context: draft.data,
            input: {
                taktik: document.getElementById('taktik').value,
                baseline: document.getElementById('baseline').value,
                target: document.getElementById('target').value
            }
        };

        const feedback = await fetch('https://tofarmer-api.tofarmer-api.workers.dev/ai-saran', {
            method: 'POST',
            body: JSON.stringify({ trigger: 'gate2-mikro', data: payload })
        }).then(res => res.json());

        document.getElementById('ai-feedback').innerText = feedback.saran;
    }, 1500); // Tunggu 1.5 detik setelah user berhenti mengetik
};

// Pasang Event Listener
document.querySelectorAll('.gate2-input').forEach(input => {
    input.addEventListener('input', triggerAi);
});

document.getElementById('btn-lanjut').addEventListener('click', () => {
    // Simpan ke draft & pindah ke Gate 3
    const dataGate2 = {
        taktik: document.getElementById('taktik').value,
        baseline: document.getElementById('baseline').value,
        target: document.getElementById('target').value
    };
    
    let state = JSON.parse(localStorage.getItem('tofarmer_draft'));
    state.data.gate_2_hipotesis = dataGate2;
    localStorage.setItem('tofarmer_draft', JSON.stringify(state));
    
    window.location.href = 'gate-3.html';
});