import { supabase } from './supabase-client.js';

const wallet = localStorage.getItem('tof_wallet');
if (!wallet) {
window.location.href = '../html/login.html';
}

let draft = JSON.parse(
localStorage.getItem('tofarmer_draft') ||
'{"data":{}}'
);

// =====================
// LOAD HALAMAN
// =====================

document.addEventListener('DOMContentLoaded', () => {

```
renderRingkasan();

restoreDraft();

document
    .getElementById('btn-ekstrak')
    ?.addEventListener('click', ekstrakFakta);

document
    .getElementById('btn-rakit')
    ?.addEventListener('click', rakitPanduan);

document
    .getElementById('btn-kembali')
    ?.addEventListener('click', () => {

        simpanState();

        window.location.href =
            'gate-2.html';
    });

document
    .getElementById('btn-lanjut')
    ?.addEventListener('click', lanjutGate4);

document
    .getElementById('fakta-box')
    ?.addEventListener('input', simpanState);

document
    .getElementById('panduan-box')
    ?.addEventListener('input', simpanState);

validateGate3();
```

});

// =====================
// RINGKASAN GATE 1 + 2
// =====================

function renderRingkasan() {

```
const el =
    document.getElementById(
        'ringkasan-gate12'
    );

if (!el) return;

const d = draft.data;

let html = `
    <div class="card">
        <h3>📚 Fondasi Ilmu</h3>

        <p>
            <strong>Judul:</strong>
            ${d.judul_eksperimen || '-'}
        </p>

        <p>
            <strong>Pilar:</strong>
            ${d.pilar_bidang || '-'}
        </p>

        <p>
            <em>
            ${d.kalimat_baku_compiled || '-'}
            </em>
        </p>

        <hr>

        <p>
            <strong>Taktik:</strong>
            ${d.gate_2_hipotesis?.taktik || '-'}
        </p>

        <p>
            <strong>Baseline:</strong>
            ${d.gate_2_hipotesis?.baseline || '-'}
        </p>

        <p>
            <strong>Target:</strong>
            ${d.gate_2_hipotesis?.target || '-'}
        </p>
    </div>
`;

el.innerHTML = html;
```

}

// =====================
// RESTORE DATA
// =====================

function restoreDraft() {

```
if (draft.data?.gate_3_fakta) {

    document.getElementById(
        'fakta-box'
    ).value =
        draft.data.gate_3_fakta;
}

if (draft.data?.gate_3_panduan) {

    document.getElementById(
        'panduan-box'
    ).value =
        draft.data.gate_3_panduan;
}
```

}

// =====================
// EKSTRAKSI FAKTA
// =====================

async function ekstrakFakta() {

```
const box =
    document.getElementById(
        'fakta-box'
    );

box.value =
    'Mentor sedang mengekstrak fakta...';

try {

    const response =
        await fetch(
            'https://tofarmer-api.tofarmer-api.workers.dev/ai-saran',
            {
                method: 'POST',
                headers: {
                    'Content-Type':
                        'application/json'
                },
                body: JSON.stringify({
                    mode: 'Gate3',
                    trigger:
                        'ekstraksi-fakta',
                    context:
                        draft.data
                })
            }
        );

    const result =
        await response.json();

    const fakta =
        result.saran ||
        'Tidak ada fakta.';

    box.value = fakta;

    draft.data.gate_3_fakta =
        fakta;

    simpanState();

} catch (err) {

    box.value =
        'Gagal menghubungi mentor.';
}
```

}

// =====================
// RAKIT SOP
// =====================

async function rakitPanduan() {

```
const fakta =
    document.getElementById(
        'fakta-box'
    ).value;

if (!fakta.trim()) {

    alert(
        'Ekstrak fakta dulu.'
    );

    return;
}

const box =
    document.getElementById(
        'panduan-box'
    );

box.value =
    'Mentor sedang merakit panduan...';

try {

    const response =
        await fetch(
            'https://tofarmer-api.tofarmer-api.workers.dev/ai-saran',
            {
                method: 'POST',
                headers: {
                    'Content-Type':
                        'application/json'
                },
                body: JSON.stringify({
                    mode: 'Gate3',
                    trigger:
                        'rakit-panduan',
                    fakta
                })
            }
        );

    const result =
        await response.json();

    const panduan =
        result.saran ||
        'Panduan gagal dibuat.';

    box.value = panduan;

    draft.data.gate_3_panduan =
        panduan;

    simpanState();

} catch (err) {

    box.value =
        'Mentor sedang di ladang.';
}
```

}

// =====================
// VALIDASI
// =====================

function validateGate3() {

```
const panduan =
    document.getElementById(
        'panduan-box'
    )?.value || '';

const btn =
    document.getElementById(
        'btn-lanjut'
    );

const valid =
    panduan.trim().length > 300;

btn.disabled = !valid;

btn.style.opacity =
    valid ? '1' : '0.5';

btn.innerText =
    valid
        ? '🔓 MAJU KE GATE 4'
        : '🔒 MAJU KE GATE 4';
```

}

// =====================
// SIMPAN STATE
// =====================

function simpanState() {

```
const fakta =
    document.getElementById(
        'fakta-box'
    )?.value || '';

const panduan =
    document.getElementById(
        'panduan-box'
    )?.value || '';

draft.data.gate_3_fakta =
    fakta;

draft.data.gate_3_panduan =
    panduan;

localStorage.setItem(
    'tofarmer_draft',
    JSON.stringify(draft)
);

autoSaveToSupabase();

validateGate3();
```

}

// =====================
// SUPABASE
// =====================

async function autoSaveToSupabase() {

```
const userId =
    localStorage.getItem(
        'tof_user_id'
    );

if (!userId) return;

try {

    await supabase
        .from('drafts')
        .upsert({
            user_id: userId,
            progres_data:
                draft.data,
            gate_3_selesai:
                draft.data
                    .gate_3_selesai === true,
            updated_at:
                new Date()
                    .toISOString()
        }, {
            onConflict:
                'user_id'
        });

    console.log(
        'Gate 3 tersimpan'
    );

} catch (err) {

    console.error(
        err.message
    );
}
```

}

// =====================
// LANJUT GATE 4
// =====================

async function lanjutGate4() {

```
draft.data.gate_3_selesai =
    true;

localStorage.setItem(
    'tofarmer_draft',
    JSON.stringify(draft)
);

await autoSaveToSupabase();

alert(
    'Panduan siap diuji.'
);

window.location.href =
    'gate-4.html';
```

}
