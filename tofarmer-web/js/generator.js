import { supabase } from './supabase-client.js';

const Generator = {
    // 1. Variabel Kontrol AI
    komentarCount: 0, 
    aiTimer: null,

    // 2. Pemetaan Jalur
    getJalur: (pilar) => {
        const jalurMap = {
            ladang: "Jalur Lambat", alat: "Jalur Lambat",
            jualan: "Jalur Sedang", komunitas: "Jalur Sedang",
            trading: "Jalur Sedang-Kilat", ai: "Jalur Kilat", digital: "Jalur Kilat", caracara: "Jalur Kilat" refleksi: "Jalur Kilat"
        };
        return jalurMap[pilar] || "Jalur Normal";
    },

    // 3. Fungsi Inisialisasi User
    initUserFromProfile: async (username) => {
        if (!username) {
            console.error("Username kosong");
            return;
        }
        const { data, error } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', username)
            .single();

        if (error) {
            console.error("Gagal ambil profiles:", error);
            return;
        }
        localStorage.setItem('tof_user_id', data.id);
        console.log("🔥 USER ID AKTIF (profiles.id):", data.id);
    },

    // 4. Fungsi Upsert ke Supabase
    simpanDraft: async (userId, dataProgres) => {
        if (!userId) {
            console.warn("⚠️ Sinkronisasi dibatalkan: User ID belum ada.");
            return;
        }
       try {
        const { error } = await supabase
            .from('drafts')
            .upsert({
                user_id: userId,
                progres_data: dataProgres,
                updated_at: new Date().toISOString(),
                // PENTING: Tambahkan kolom ini agar tersimpan ke tabel
                gate_1_selesai: dataProgres.gate_1_selesai === true 
            }, { onConflict: 'user_id' });

        if (error) {
            console.error("4. ERROR DARI SUPABASE:", error);
        } else {
            console.log("5. BERHASIL: Data & Status Gate tersimpan!");
        }
    } catch (err) {
        console.error("6. ERROR SISTEM:", err);
    }
},
    saveDraft: (data) => {
        localStorage.setItem('tofarmer_draft', JSON.stringify(data));
        const userId = localStorage.getItem('tof_user_id');
        Generator.simpanDraft(userId, data.data);
    },

    loadDraft: () => {
        const draft = JSON.parse(localStorage.getItem('tofarmer_draft') || '{"data":{}}');
        if (!draft.data) return null;
        
        const inputJudul = document.querySelector('#input-judul');
        if (inputJudul && draft.data.judul_eksperimen) inputJudul.value = draft.data.judul_eksperimen;

        if (draft.data.pilar_bidang) {
            const btn = document.querySelector(`[data-value="${draft.data.pilar_bidang}"]`);
            if (btn) {
                btn.classList.add('active');
                Generator.renderMicroInputs(draft.data.pilar_bidang);
            }
        }
        if (draft.data.micro_inputs) {
            Object.entries(draft.data.micro_inputs).forEach(([key, value]) => {
                const el = document.getElementById(`input-${key}`);
                if (el) el.value = value;
            });
        }
        return draft.data;
    },

    updateAdvice: async (trigger, text) => {
        if (Generator.komentarCount >= 2) return;
        const aiWhisperer = document.getElementById('ai-whisperer');
        const aiText = document.getElementById('ai-text');
        if (!aiWhisperer || !aiText) return;

        aiWhisperer.style.display = 'block';
        aiText.innerText = "Mentor sedang memeriksa rekam jejak...";
        try {
            const response = await fetch('https://tofarmer-api.tofarmer-api.workers.dev/ai-saran', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: "Gate1", trigger, teks: text })
            });
            const result = await response.json();
            const saran = result.saran || "Kebun sudah bagus, lanjut menanam!";
            let i = 0;
            aiText.innerText = ""; 
            if (window.typingInterval) clearInterval(window.typingInterval);
            window.typingInterval = setInterval(() => {
                if (i < saran.length) { aiText.textContent += saran.charAt(i); i++; }
                else { clearInterval(window.typingInterval); }
            }, 30);
            Generator.komentarCount++;
        } catch (error) { aiText.innerText = "Mentor lagi di sawah, nanti lagi ya."; }
    },

   updateGate: async (gate, data) => {
    const userId = localStorage.getItem('tof_user_id');
    if (!userId) return;

    let state = JSON.parse(localStorage.getItem('tofarmer_draft') || '{"data":{}}');
    state.data = { ...state.data, ...data };
    localStorage.setItem('tofarmer_draft', JSON.stringify(state));

    // OTOMATIS SINCRON KE SUPABASE SETIAP ADA PERUBAHAN
    // Ini memastikan status gate_1_selesai tersimpan di tabel 'drafts'
    await Generator.simpanDraft(userId, state.data);

    // Logic untuk kontribusi (tetap seperti semula)
    if (data.gate_1_status === "Lolos") {
        const alreadySynced = localStorage.getItem('tofarmer_synced');
        if (alreadySynced) return;
        try {
            const pilarMap = { ladang: 1, alat: 2, jualan: 3, konten: 4, keuangan: 5, digital: 5, caracara: 5, refleksi: 5 };
            const pilarInt = pilarMap[state.data.pilar_bidang] || 1;
            await supabase.from('contributions').insert([{
                user_id: userId, 
                judul_aksi: state.data.judul_eksperimen,
                deskripsi_proses: state.data.kalimat_baku_compiled, 
                pilar_aksi: pilarInt,
                status_validasi: 'PENDING'
            }]);
            localStorage.setItem('tofarmer_synced', 'true');
        } catch (err) { console.error("Gagal sinkronisasi:", err.message); }
    }
},
    renderMicroInputs: (pilar) => {
        const container = document.getElementById('micro-inputs-container');
        container.innerHTML = '';
        const templates = {
            ladang: [{ id: 'objek', label: 'Apa yang dikerjakan?' }, { id: 'metode', label: 'Caranya gimana?' }, { id: 'kondisi', label: 'Situasi tempat kerjanya?' }],
            alat: [{ id: 'fungsi', label: 'Alat ini buat apa?' }, { id: 'material', label: 'Bahannya dari apa?' }, { id: 'mekanisme', label: 'Cara pakainya gimana?' }],
            jualan: [{ id: 'produk', label: 'Apa yang dijual?' }, { id: 'lokasi', label: 'Mau dijual di mana?' }, { id: 'metrik', label: 'Targetnya pengen gimana?' }, { id: 'modal', label: 'Berapa modalnya?' }],
            konten: [{ id: 'platform', label: 'Main di platform apa?' }, { id: 'topik', label: 'Bahasan utamanya apa?' }, { id: 'audiens', label: 'Buat siapa kontennya?' }],
            keuangan: [{ id: 'aset', label: 'Aset yang dikelola?' }, { id: 'strategi', label: 'Strategi kelolanya gimana?' }, { id: 'risiko', label: 'Batasan risikonya?' }],
            digital: [{ id: 'teknologi', label: 'Teknologi yang dipakai?' }, { id: 'kasus', label: 'Buat keperluan apa?' }, { id: 'target', label: 'Hasil akhir yang dikejar?' }],
            caracara: [{ id: 'tema', label: 'Tema?' }, { id: 'metode', label: 'Cara evaluasinya?' }, { id: 'durasi', label: 'Berapa sering dilakuin?' }],
            refleksi: [{ id: 'tema', label: 'Tema refleksinya?' }, { id: 'metode', label: 'Cara evaluasinya?' }, { id: 'durasi', label: 'Berapa sering dilakuin?' }]
        };
        if (templates[pilar]) {
            templates[pilar].forEach(field => {
                const div = document.createElement('div');
                div.className = 'mb-4';
                div.innerHTML = `<label style="font-size: 12px; color: #9ca3af; margin-bottom: 5px;">${field.label}</label>
                                 <input type="text" id="input-${field.id}" class="micro-input" placeholder="Masukkan ${field.label}..." style="width: 100%; background: #111827; border: 1px solid #374151; padding: 12px; border-radius: 8px; color: white;">`;
                container.appendChild(div);
            });
        }
    },

    compileKalimat: (pilar, data) => {
        if (pilar === 'ladang') return `Saya berbagi pengalaman [${data.objek || '...'}] dengan cara [${data.metode || '...'}] di situasi [${data.kondisi || '...'}].`;
        if (pilar === 'alat') return `Saya berbagi pengalaman [${data.fungsi || '...'}] pakai bahan [${data.material || '...'}] dengan cara kerja [${data.mekanisme || '...'}].`;
        if (pilar === 'jualan') return `Saya berbagi pengalaman [${data.produk || '...'}] di [${data.lokasi || '...'}] dengan modal [${data.modal || '...'}] dan targetnya [${data.metrik || '...'}].`;
        if (pilar === 'konten') return `Saya berbagi pengalaman [${data.platform || '...'}] bahas soal [${data.topik || '...'}] buat [${data.audiens || '...'}].`;
        if (pilar === 'keuangan') return `Saya berbagi pengalaman [${data.aset || '...'}] pakai strategi [${data.strategi || '...'}] dengan batasan risiko [${data.risiko || '...'}].`;
        if (pilar === 'digital') return `Saya berbagi pengalaman [${data.teknologi || '...'}] untuk [${data.kasus || '...'}] dengan target [${data.target || '...'}].`;
        if (pilar === 'caracara') return `Saya berbagi pengalaman [${data.tema || '...'}] dengan cara [${data.metode || '...'}] secara [${data.durasi || '...'}].`;
        if (pilar === 'refleksi') return `Saya berbagi pengalaman [${data.tema || '...'}] dengan cara [${data.metode || '...'}] secara [${data.durasi || '...'}].`;
        return "";
    },

         initCategorySelection: function(onUpdate) {
        const buttons = document.querySelectorAll('.category-btn');
        const inputJudul = document.querySelector('#input-judul');
        const btnLanjut = document.querySelector('.btn-lanjut');
        const microContainer = document.getElementById('micro-inputs-container');

        // Tambahkan event listener untuk tombol lanjut di dalam fungsi ini
        btnLanjut.addEventListener('click', async () => {
            if (!btnLanjut.classList.contains('active')) return;
            const userId = localStorage.getItem('tof_user_id');
            const state = JSON.parse(localStorage.getItem('tofarmer_draft') || '{"data":{}}');
            state.data.gate_1_selesai = true;
            localStorage.setItem('tofarmer_draft', JSON.stringify(state));
            await Generator.simpanDraft(userId, state.data);
            alert("Fondasi terkunci! Mari lanjut ke Gate 2.");
            window.location.href = 'gate-2.html'; 
        });

        const validate = () => {
            const activeBtn = document.querySelector('.category-btn.active');
            const isTitleValid = inputJudul.value.trim().length >= 20;
            const microInputs = microContainer.querySelectorAll('.micro-input');
            const isMicroComplete = microInputs.length > 0 && Array.from(microInputs).every(i => i.value.trim().length > 0);

            if (activeBtn && isTitleValid && isMicroComplete) {
                btnLanjut.classList.add('active');
                btnLanjut.innerText = "🔓 KUNCI FONDASI & MAJU KE GATE 2";
            } else {
                btnLanjut.classList.remove('active');
                btnLanjut.innerText = "🔒 GERBANG TERKUNCI";
            }
        };

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                Generator.komentarCount = 0;
                Generator.updateAdvice('pilar', `User memilih pilar: ${btn.dataset.value}`);
                Generator.renderMicroInputs(btn.dataset.value);
                Generator.updateGate(1, {
                    pilar_bidang: btn.dataset.value,
                    karakteristik_jalur: Generator.getJalur(btn.dataset.value)
                });
                validate();
                onUpdate(btn.dataset.value);
            });
        });

        inputJudul.addEventListener('blur', () => {
            const val = inputJudul.value.trim();
            if (val.length >= 20) Generator.updateAdvice('judul', val);
            validate();
            Generator.updateGate(1, { judul_eksperimen: val });
        });

        microContainer.addEventListener('input', () => {
            const inputs = microContainer.querySelectorAll('.micro-input');
            let microData = {};
            inputs.forEach(i => { microData[i.id.replace('input-', '')] = i.value; });
            const activePilar = document.querySelector('.category-btn.active')?.dataset.value;
            const kalimat = Generator.compileKalimat(activePilar, microData);
            Generator.updateGate(1, {
                micro_inputs: microData,
                kalimat_baku_compiled: kalimat,
                gate_1_status: "Lolos"
            });
            validate();
        });

        return validate; 
    } 
}; // <--- Tutup objek Generator di sini

export { Generator };
document.addEventListener('DOMContentLoaded', async () => {
    const username = localStorage.getItem('tof_username');
    if (username) {
        await Generator.initUserFromProfile(username);
    }
    
    // 1. Load data draft ke UI
    Generator.loadDraft();
    
    // 2. Inisialisasi selector dan ambil fungsi 'validate' yang direturn
    // Pastikan initCategorySelection mengembalikan fungsi validate
    const validate = Generator.initCategorySelection((pilar) => console.log("Pilar dipilih:", pilar));
    
    // 3. Pemicu validasi manual setelah load draft
    // Karena kita tadi sudah mengisi nilai via loadDraft, 
    // kita perlu memaksa validasi agar tombol langsung berubah statusnya
    if (typeof validate === 'function') {
        validate();
    }
    
    // 4. Pastikan micro-inputs juga terpicu untuk compile kalimat
    const activeBtn = document.querySelector('.category-btn.active');
    if (activeBtn) {
        document.getElementById('micro-inputs-container').dispatchEvent(new Event('input'));
    }
});